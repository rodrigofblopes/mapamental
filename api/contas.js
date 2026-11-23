import { redis, temBanco, senhaOk } from './_lib.js';

// Contas Mensais (aba da Produtividade): contas a pagar do mês, quais já foram pagas e o custo fixo do CNPJ.
// Diferente dos mapas, aqui NADA é público: ler e gravar pedem a senha de edição (x-senha).
// GET /api/contas -> { dados }      PUT /api/contas { dados } -> { ok }
const CHAVE = 'contas';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!temBanco()) return res.status(503).json({ erro: 'Banco não configurado' });
  if (!senhaOk(req)) return res.status(401).json({ erro: 'Entre com a senha para ver as contas' });
  try {
    if (req.method === 'GET') {
      const v = await redis('GET', CHAVE);
      let dados = null; try { dados = v ? JSON.parse(v) : null; } catch {}
      return res.json({ dados: dados || { fixos: [], avulsas: [], pagos: {} } });
    }
    if (req.method === 'PUT') {
      const d = req.body && req.body.dados;
      if (!d || !Array.isArray(d.fixos) || !Array.isArray(d.avulsas) || typeof d.pagos !== 'object') return res.status(400).json({ erro: 'Dados inválidos' });
      const txt = JSON.stringify({ fixos: d.fixos, avulsas: d.avulsas, pagos: d.pagos, atualizado: Date.now() });
      if (txt.length > 400000) return res.status(413).json({ erro: 'Dados grandes demais' });
      await redis('SET', CHAVE, txt);
      return res.json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
