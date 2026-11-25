import crypto from 'node:crypto';
import { put, del } from '@vercel/blob';
import { redis, temBanco, temAnexos, senhaOk } from './_lib.js';

// Notas e Reembolso (aba da Produtividade). NADA aqui é público: tudo pede a senha (x-senha).
// GET    /api/notas                 -> { notas, cfg }
// GET    /api/notas?foto=ID         -> a foto ou o PDF da nota (decifrado na hora)
// POST   /api/notas?acao=foto       -> guarda uma foto ou PDF (corpo = arquivo; x-tipo)  -> { foto }
// PUT    /api/notas { nota }        -> salva uma nota          PUT { cfg } -> centros de custo, categorias, empresas
// DELETE /api/notas?id=ID           -> apaga a nota e as fotos dela
// Redis: hash "notas" (id -> nota), "notas:cfg", hash "notas:fotos" (foto -> onde está + chave).
// A foto vai cifrada (AES-256-GCM, uma chave por arquivo) para o Blob, que tem endereço público: sem a chave,
// guardada só no banco, o arquivo não abre. Sem Blob, a foto fica no próprio banco.
const MAX = 4 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const t = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0; };
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

export function cifrar(buf) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const corpo = Buffer.concat([c.update(buf), c.final()]);
  return { corpo, key: key.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
export function decifrar(buf, f) {
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(f.key, 'base64'), Buffer.from(f.iv, 'base64'));
  d.setAuthTag(Buffer.from(f.tag, 'base64'));
  return Buffer.concat([d.update(buf), d.final()]);
}
async function corpoBruto(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  const p = []; for await (const c of req) p.push(c); return Buffer.concat(p);
}
export function limparNota(n) {
  return {
    id: t(n.id, 40), data: data(n.data), fornecedor: t(n.fornecedor), cnpj: t(n.cnpj, 20), numero: t(n.numero, 30), chave: t(n.chave, 60).replace(/\D/g, '').slice(0, 44),
    desc: t(n.desc, 400), valor: num(n.valor), categoria: t(n.categoria, 60), centro: t(n.centro, 80), pagoPor: n.pagoPor === 'empresa' ? 'empresa' : 'meu', forma: t(n.forma, 40),
    empresa: t(n.empresa, 80), pedidoEm: data(n.pedidoEm), recebidoEm: data(n.recebidoEm), obs: t(n.obs, 800), missao: t(n.missao, 40),
    fotos: (Array.isArray(n.fotos) ? n.fotos : []).slice(0, 8).map((f) => ({ id: t(f.id, 60), tipo: t(f.tipo, 40) })).filter((f) => f.id),
    criado: Number(n.criado) || Date.now(), atualizado: Date.now(),
  };
}
async function apagarFoto(id) {
  const v = await redis('HGET', 'notas:fotos', id); if (!v) return;
  const f = JSON.parse(v); if (f.url) { try { await del(f.url); } catch {} } else await redis('DEL', 'notas:foto:' + id);
  await redis('HDEL', 'notas:fotos', id);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!temBanco()) return res.status(503).json({ erro: 'Banco não configurado' });
  try {
    // 12 senhas erradas em 15 minutos, do mesmo lugar: espera
    const ip = t(String(req.headers['x-forwarded-for'] || '').split(',')[0], 60) || 'local', trava = 'notas:erros:' + ip;
    if (Number(await redis('GET', trava)) >= 12) return res.status(429).json({ erro: 'Muitas senhas erradas. Tente em 15 minutos.' });
    if (!senhaOk(req)) {
      if (req.headers['x-senha']) { await redis('INCR', trava); await redis('EXPIRE', trava, '900'); }
      return res.status(401).json({ erro: 'Entre com a senha para ver as notas' });
    }

    if (req.method === 'GET' && req.query.foto) {
      const id = t(req.query.foto, 60), v = await redis('HGET', 'notas:fotos', id);
      if (!v) return res.status(404).json({ erro: 'Foto não encontrada' });
      const f = JSON.parse(v); let buf;
      if (f.url) { const r = await fetch(f.url, { cache: 'no-store' }); if (!r.ok) return res.status(502).json({ erro: 'Não consegui abrir a foto' }); buf = decifrar(Buffer.from(await r.arrayBuffer()), f); }
      else buf = Buffer.from((await redis('GET', 'notas:foto:' + id)) || '', 'base64');
      res.setHeader('Content-Type', f.tipo); res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(buf);
    }
    if (req.method === 'GET') {
      const flat = (await redis('HGETALL', 'notas')) || [], notas = [];
      for (let i = 0; i < flat.length; i += 2) { try { notas.push(JSON.parse(flat[i + 1])); } catch {} }
      let cfg = null; try { cfg = JSON.parse((await redis('GET', 'notas:cfg')) || 'null'); } catch {}
      return res.json({ notas, cfg });
    }
    if (req.method === 'POST' && req.query.acao === 'foto') {
      const tipo = t(req.headers['x-tipo'], 40); if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'Use foto (JPG ou PNG) ou PDF' });
      const buf = await corpoBruto(req); if (!buf.length) return res.status(400).json({ erro: 'Arquivo vazio' }); if (buf.length > MAX) return res.status(413).json({ erro: 'Arquivo maior que 4 MB' });
      const id = Date.now().toString(36) + crypto.randomBytes(6).toString('hex'); let f;
      if (temAnexos()) { const c = cifrar(buf); const b = await put(`notas/${id}.bin`, c.corpo, { access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream' }); f = { url: b.url, key: c.key, iv: c.iv, tag: c.tag, tipo }; }
      else { if (buf.length > 700000) return res.status(413).json({ erro: 'Sem o Blob ligado, a foto precisa ter menos de 700 KB' }); await redis('SET', 'notas:foto:' + id, buf.toString('base64')); f = { tipo }; }
      await redis('HSET', 'notas:fotos', id, JSON.stringify(f));
      return res.json({ foto: { id, tipo } });
    }
    if (req.method === 'PUT') {
      const b = req.body || {};
      if (b.cfg) {
        const l = (a, n = 60) => [...new Set((Array.isArray(a) ? a : []).map((x) => t(x, 80)).filter(Boolean))].slice(0, n);
        await redis('SET', 'notas:cfg', JSON.stringify({ centros: l(b.cfg.centros), categorias: l(b.cfg.categorias), empresas: l(b.cfg.empresas) }));
        return res.json({ ok: true });
      }
      const n = b.nota && limparNota(b.nota); if (!n || !n.id || !n.data) return res.status(400).json({ erro: 'Nota sem data' });
      const antes = await redis('HGET', 'notas', n.id);
      if (antes) { const ids = n.fotos.map((f) => f.id); for (const f of JSON.parse(antes).fotos || []) if (!ids.includes(f.id)) await apagarFoto(f.id); }
      await redis('HSET', 'notas', n.id, JSON.stringify(n));
      return res.json({ ok: true, nota: n });
    }
    if (req.method === 'DELETE') {
      const id = t(req.query.id, 40), v = id && await redis('HGET', 'notas', id); if (!v) return res.status(404).json({ erro: 'Nota não encontrada' });
      for (const f of JSON.parse(v).fotos || []) await apagarFoto(f.id);
      await redis('HDEL', 'notas', id);
      return res.json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
