import { redis, temBanco, temSenha, temAnexos, senhaOk } from './_lib.js';

// GET    /api/mapas[?rev=N]      -> lista os mapas (leitura pública). As seções (id "sec-": Missão, Gestão de
//                                  Atividades, Notion, Lean) só vêm com a senha certa no x-senha.
// POST   /api/mapas?acao=login   -> confere a senha
// PUT    /api/mapas              -> salva um mapa  { map }      (precisa senha)
// DELETE /api/mapas?id=ID        -> apaga um mapa              (precisa senha)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const status = { banco: temBanco(), senha: temSenha(), anexos: temAnexos() };
  if (!temBanco()) return res.status(503).json({ ...status, erro: 'Banco não configurado' });

  try {
    if (req.method === 'GET') {
      const rev = String((await redis('GET', 'mapas:rev')) || 0);
      if (req.query.rev && req.query.rev === rev) return res.json({ ...status, rev, mudou: false });
      const flat = (await redis('HGETALL', 'mapas')) || [];
      const comSenha = senhaOk(req), maps = [];
      for (let i = 0; i < flat.length; i += 2) {
        if (!comSenha && String(flat[i]).startsWith('sec-')) continue;   // seções: só para quem tem a senha
        try { maps.push(JSON.parse(flat[i + 1])); } catch {}
      }
      return res.json({ ...status, rev, mudou: true, maps, secoes: comSenha });
    }

    if (!senhaOk(req)) {
      return res.status(401).json({ ...status, erro: temSenha() ? 'Senha incorreta' : 'Defina EDIT_PASSWORD na Vercel' });
    }

    if (req.method === 'POST' && req.query.acao === 'login') return res.json({ ...status, ok: true });

    if (req.method === 'PUT') {
      const m = req.body && req.body.map;
      if (!m || !m.id || !Array.isArray(m.nodes)) return res.status(400).json({ erro: 'Mapa inválido' });
      const limpo = { id: String(m.id), name: String(m.name || 'Mapa').slice(0, 200), nodes: m.nodes, updated: Date.now() };
      if (m.grupo) limpo.grupo = String(m.grupo).slice(0, 200);   // grupo / subgrupo do mapa (ex.: "Incorporação Imobiliária / Financiamento")
      // Seções (Missão, Gestão, Notion, Lean): junta em vez de substituir. Um aparelho com a lista velha não apaga
      // o que outro aparelho acabou de pôr; só sai o que este aparelho apagou de verdade (req.body.apagados).
      // 26/11/2026: sem a lista "apagados" (script velho, outro programa) a seção NUNCA perde cartão: só junta.
      if (limpo.id.startsWith('sec-')) {
        const apagadosPedidos = Array.isArray(req.body.apagados) ? req.body.apagados : [];
        let antes = []; try { antes = (JSON.parse((await redis('HGET', 'mapas', limpo.id)) || 'null') || {}).nodes || []; } catch {}
        const tem = new Set(limpo.nodes.map((n) => n && n.id).filter(Boolean)), fora = new Set(apagadosPedidos.map(String));
        antes.forEach((n, i) => { if (n && n.id && !tem.has(n.id) && !fora.has(String(n.id))) { limpo.nodes.splice(Math.min(i, limpo.nodes.length), 0, n); tem.add(n.id); } });
      }
      await redis('HSET', 'mapas', limpo.id, JSON.stringify(limpo));
      const rev = await redis('INCR', 'mapas:rev');
      return res.json({ ok: true, rev: String(rev), updated: limpo.updated, ...(limpo.id.startsWith('sec-') ? { nodes: limpo.nodes } : {}) });
    }

    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ erro: 'Falta id' });
      await redis('HDEL', 'mapas', String(req.query.id));
      const rev = await redis('INCR', 'mapas:rev');
      return res.json({ ok: true, rev: String(rev) });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
