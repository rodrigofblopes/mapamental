import { redis, temBanco, senhaOk } from './_lib.js';

// Cópia de segurança da Produtividade (Missão, Gestão, Notion, Lean, mapas, Notas e Contas).
// GET /api/backup                 -> (cron da Vercel, todo dia) guarda a cópia do dia no banco, por 31 dias. Não devolve dados.
// GET /api/backup?baixar=1        -> com a senha (x-senha): a cópia de agora, para o PC salvar no Google Drive
// GET /api/backup?lista=1         -> com a senha: os dias guardados
// GET /api/backup?dia=AAAA-MM-DD  -> com a senha: a cópia daquele dia (para recuperar)
// As fotos das notas ficam no Blob; a cópia leva o endereço e a chave de cada uma, e o PC baixa as fotos à parte.
const DIAS = 31;
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Porto_Velho' });
const objeto = (flat) => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

async function foto() {
  const [mapas, notas, notasFotos, notasCfg, contas] = await Promise.all([
    redis('HGETALL', 'mapas'), redis('HGETALL', 'notas'), redis('HGETALL', 'notas:fotos'), redis('GET', 'notas:cfg'), redis('GET', 'contas'),
  ]);
  return { versao: 1, feito: new Date().toISOString(), mapas: objeto(mapas), notas: objeto(notas), notasFotos: objeto(notasFotos), notasCfg, contas };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!temBanco()) return res.status(503).json({ erro: 'Banco não configurado' });
  try {
    const q = req.query || {};
    if (q.baixar || q.lista || q.dia) {
      if (!senhaOk(req)) return res.status(401).json({ erro: 'Senha incorreta' });
      if (q.baixar) return res.json(await foto());
      if (q.dia) { const v = await redis('GET', 'backup:' + String(q.dia).slice(0, 10)); return v ? res.json(JSON.parse(v)) : res.status(404).json({ erro: 'Não há cópia desse dia' }); }
      const dias = (await redis('ZRANGE', 'backup:dias', '0', '-1')) || [];
      const vivos = []; for (const d of dias) if (await redis('EXISTS', 'backup:' + d)) vivos.push(d);
      return res.json({ dias: vivos });
    }
    // cron: uma cópia por dia (chamar de novo no mesmo dia não faz nada)
    const d = hoje(), chave = 'backup:' + d;
    if (await redis('EXISTS', chave)) return res.json({ ok: true, dia: d, ja: true });
    const txt = JSON.stringify(await foto());
    await redis('SET', chave, txt, 'EX', String(DIAS * 86400));
    await redis('ZADD', 'backup:dias', String(Number(d.replace(/-/g, ''))), d);
    await redis('ZREMRANGEBYSCORE', 'backup:dias', '0', String(Number(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10).replace(/-/g, ''))));
    return res.json({ ok: true, dia: d, tamanho: txt.length });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
