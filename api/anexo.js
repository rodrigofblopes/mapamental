import { put } from '@vercel/blob';
import { senhaOk, temAnexos } from './_lib.js';

// Tipo do arquivo para o navegador abrir certo; texto sai em UTF-8 para os acentos aparecerem.
function tipoReal(tipo, nome) {
  let t = String(tipo || '').trim();
  if (!t || t === 'application/octet-stream') {
    const ext = (nome.split('.').pop() || '').toLowerCase();
    t = { txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', pdf: 'application/pdf' }[ext] || 'application/octet-stream';
  }
  if (/^text\/|json$/.test(t) && !/charset=/i.test(t)) t += '; charset=utf-8';
  return t;
}

// POST /api/anexo  (corpo = o arquivo; cabeçalhos x-senha e x-nome)  -> { url }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
  if (!temAnexos()) return res.status(503).json({ erro: 'Armazenamento de anexos (Blob) não configurado' });
  if (!senhaOk(req)) return res.status(401).json({ erro: 'Senha incorreta' });

  // O site manda o arquivo como "application/octet-stream" (o tipo real vem em x-tipo),
  // para a Vercel não tentar ler .txt/.json/.csv como texto e entregar o corpo vazio.
  let corpo;
  if (Buffer.isBuffer(req.body)) corpo = req.body;
  else if (typeof req.body === 'string') corpo = Buffer.from(req.body, 'utf8');
  else if (req.body && typeof req.body === 'object') corpo = Buffer.from(JSON.stringify(req.body), 'utf8');
  else { const chunks = []; for await (const c of req) chunks.push(c); corpo = Buffer.concat(chunks); }
  if (!corpo.length) return res.status(400).json({ erro: 'Arquivo vazio' });

  const nome = decodeURIComponent(req.headers['x-nome'] || 'arquivo').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  try {
    const blob = await put(`anexos/${nome}`, corpo, {
      access: 'public',
      addRandomSuffix: true,
      contentType: tipoReal(req.headers['x-tipo'], nome),
    });
    return res.json({ url: blob.url, nome });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
