import crypto from 'node:crypto';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const temBanco = () => Boolean(URL_ && TOKEN);
export const temSenha = () => Boolean(process.env.EDIT_PASSWORD);
export const temAnexos = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// Executa um comando no Redis (Upstash) pela API REST, sem dependências.
export async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const hash = (s) => crypto.createHash('sha256').update(String(s || '')).digest();
export function senhaOk(req) {
  if (!temSenha()) return false;
  return crypto.timingSafeEqual(hash(req.headers['x-senha']), hash(process.env.EDIT_PASSWORD));
}
