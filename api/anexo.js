import { put } from '@vercel/blob';
import { senhaOk, temAnexos } from './_lib.js';

// POST /api/anexo  (corpo = o arquivo; cabeçalhos x-senha e x-nome)  -> { url }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
  if (!temAnexos()) return res.status(503).json({ erro: 'Armazenamento de anexos (Blob) não configurado' });
  if (!senhaOk(req)) return res.status(401).json({ erro: 'Senha incorreta' });

  const chunks = [];
  if (Buffer.isBuffer(req.body)) chunks.push(req.body);
  else for await (const c of req) chunks.push(c);
  const corpo = Buffer.concat(chunks);
  if (!corpo.length) return res.status(400).json({ erro: 'Arquivo vazio' });

  const nome = decodeURIComponent(req.headers['x-nome'] || 'arquivo').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  try {
    const blob = await put(`anexos/${nome}`, corpo, {
      access: 'public',
      addRandomSuffix: true,
      contentType: req.headers['content-type'] || 'application/octet-stream',
    });
    return res.json({ url: blob.url, nome });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
