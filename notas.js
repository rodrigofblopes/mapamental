// ================= Notas e Reembolso =================
// Foto da nota (com modo scanner), quem pagou e o PDF para pedir o reembolso. Guardado em /api/notas, só com a senha.
// O centro de custo completo é do app Visão: aqui fica só a obra de cada nota, e a planilha (CSV) leva os dados para lá.
// Sem sinal na obra: a nota fica guardada neste aparelho e sobe sozinha quando a internet volta.
const N_CENTROS = ['Obra Amaggi', 'Bonfim Engenharia', 'Pessoal'];
const N_CATS = ['Material', 'Ferramenta', 'EPI', 'Combustível', 'Alimentação', 'Hospedagem', 'Frete', 'Serviço', 'Outros'];
const N_EMPRESAS = ['Neto Lara', 'Bonfim Engenharia'];
const N_FORMAS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto'];
let NOTAS = null, NCFG = null, notasErro = '', notasAba = 'lista', notasMes = new Date().toISOString().slice(0, 7), notasBusca = '', notaNova = null, NPEND = [];
const ddmm = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

// ---------- nuvem ----------
async function nApi(metodo, qs = '', corpo, cab = {}) {
  const h = { ...cab }; let body = corpo; if (SENHA) h['x-senha'] = SENHA;
  if (!CAN_EDIT && (qs === '?acao=foto' || (metodo === 'PUT' && corpo && corpo.nota))) h['x-rapida'] = '1';   // lançar não pede senha
  if (corpo !== undefined && !(corpo instanceof Blob)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(corpo); }
  const r = await fetch('/api/notas' + qs, { method: metodo, headers: h, body, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erro || 'Erro ' + r.status); e.status = r.status; throw e; }
  return j;
}
async function carregarNotas() {
  try {
    const j = await nApi('GET'); NOTAS = j.notas || [];
    NCFG = { centros: N_CENTROS, categorias: N_CATS, empresas: N_EMPRESAS, ...(j.cfg || {}) };
    ['centros', 'categorias', 'empresas'].forEach((k) => { if (!NCFG[k] || !NCFG[k].length) NCFG[k] = { centros: N_CENTROS, categorias: N_CATS, empresas: N_EMPRESAS }[k]; });
    notasErro = ''; await lerPend(); enviarPend();
  } catch (e) { notasErro = e.message; if (e.status === 401 && typeof notasSaiu === 'function') notasSaiu(); }
  if (location.hash === '#/s/notas' || location.hash === '#/s/meta') rerenderNotas(); else if (!CUR && (location.hash === '' || location.hash === '#/')) showHub();
}
const rerenderNotas = () => { const a = document.activeElement; if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) && $('sec').contains(a) && a.id !== 'nBusca') return; if (location.hash === '#/s/notas') showSec('notas'); else if (location.hash === '#/s/meta') showSec('meta'); };
const salvarCfg = () => nApi('PUT', '', { cfg: NCFG }).catch((e) => toast('Não salvou a lista: ' + e.message));
async function salvarNota(n) {
  const j = await nApi('PUT', '', { nota: n }); guardarRecente(n); if (!NOTAS || !j.nota) return n; const i = NOTAS.findIndex((x) => x.id === n.id);
  if (i >= 0) NOTAS[i] = j.nota; else NOTAS.push(j.nota); return j.nota;
}
// as últimas lançadas por este aparelho (para conferir sem precisar da senha)
const lerRecentes = () => { try { return JSON.parse(localStorage.getItem('notas-recentes')) || []; } catch { return []; } };
function guardarRecente(n) { try { localStorage.setItem('notas-recentes', JSON.stringify([{ id: n.id, data: n.data, fornecedor: n.fornecedor, desc: n.desc, valor: n.valor, pagoPor: n.pagoPor, centro: n.centro }, ...lerRecentes().filter((x) => x.id !== n.id)].slice(0, 8))); } catch {} }
const cfgPadrao = () => (NCFG = NCFG || { centros: [...N_CENTROS], categorias: [...N_CATS], empresas: [...N_EMPRESAS] });
async function enviarFoto(blob) { return (await nApi('POST', '?acao=foto', new Blob([blob], { type: 'application/octet-stream' }), { 'x-tipo': blob.type, 'Content-Type': 'application/octet-stream' })).foto; }
const FOTOS_ABERTAS = new Map();
async function urlFoto(id) {
  if (FOTOS_ABERTAS.has(id)) return FOTOS_ABERTAS.get(id);
  const r = await fetch('/api/notas?foto=' + encodeURIComponent(id), { headers: { 'x-senha': SENHA } }); if (!r.ok) throw new Error('Não consegui abrir a foto');
  const u = URL.createObjectURL(await r.blob()); FOTOS_ABERTAS.set(id, u); return u;
}

// ---------- fila do aparelho (sem internet) ----------
const nBanco = () => new Promise((ok, no) => { const r = indexedDB.open('notas-pendentes', 1); r.onupgradeneeded = () => r.result.createObjectStore('fila', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function nFila(modo, fn) { const b = await nBanco(); return new Promise((ok, no) => { const t = b.transaction('fila', modo), r = fn(t.objectStore('fila')); t.oncomplete = () => { b.close(); ok(r && r.result); }; t.onerror = () => { b.close(); no(t.error); }; }); }
async function lerPend() { try { NPEND = (await nFila('readonly', (s) => s.getAll())) || []; } catch { NPEND = []; } }
let enviando = false;
async function enviarPend() {
  if (enviando || !NPEND.length || !navigator.onLine) return; enviando = true; let n = 0;
  for (const p of [...NPEND]) {
    try {
      while (p.novas.length) { const f = await enviarFoto(p.novas[0]); p.nota.fotos.push(f); p.novas.shift(); await nFila('readwrite', (s) => s.put(p)); }
      await salvarNota(p.nota); await nFila('readwrite', (s) => s.delete(p.id)); n++;
    } catch (e) { if (e.status && e.status !== 429 && e.status < 500) toast('Nota pendente: ' + e.message); break; }
  }
  enviando = false; await lerPend(); if (n) { toast(n === 1 ? 'Nota enviada para a nuvem' : n + ' notas enviadas para a nuvem'); rerenderNotas(); }
}
addEventListener('online', () => enviarPend()); setInterval(() => { if (NPEND.length) enviarPend(); }, 30000);
async function limparNotasDoAparelho() { NOTAS = null; NCFG = null; notasErro = ''; FOTOS_ABERTAS.forEach((u) => URL.revokeObjectURL(u)); FOTOS_ABERTAS.clear(); }

// ---------- contas ----------
const todasNotas = () => [...NPEND.map((p) => ({ ...p.nota, pendente: true })), ...(NOTAS || []).filter((n) => !NPEND.some((p) => p.id === n.id))];
const situacao = (n) => n.pagoPor === 'empresa' ? 'empresa' : n.recebidoEm ? 'recebido' : n.pedidoEm ? 'pedido' : 'pedir';
const SIT = { empresa: ['Empresa pagou', 'ok'], pedir: ['Pedir reembolso', 'bad'], pedido: ['Reembolso pedido', 'warn'], recebido: ['Reembolsado', 'ok'] };
const somaN = (l) => l.reduce((s, n) => s + (+n.valor || 0), 0);
function resumoNotasHub() {
  if (!NOTAS) { if (!notasErro) carregarNotas(); return notasErro ? '⚠️ ' + notasErro : 'Carregando…'; }
  const ab = todasNotas().filter((n) => ['pedir', 'pedido'].includes(situacao(n)));
  return `${todasNotas().length} nota(s) · a receber ${BRL(somaN(ab))}` + (NPEND.length ? ` · 📵 ${NPEND.length} a enviar` : '');
}
const notaDaMissao = (id) => (NOTAS ? todasNotas().find((n) => n.missao === id) : null);
function abrirNotaDaMissao(i) { const n = notaDaMissao(i.id); notaNova = n ? { ...n } : { missao: i.id, desc: i.text }; if (!n) notaNova.nova = true; location.hash = '#/s/notas'; }

// ---------- tela ----------
function renderNotas(b) {
  if (!CAN_EDIT) return renderRapida(b);
  if (!NOTAS) { botoesFoto(b); avisoPend(b); b.append(el('div', { class: 'empty' }, notasErro ? '⚠️ ' + notasErro : 'Carregando as notas…')); if (!notasErro) carregarNotas(); else b.append(el('button', { onclick: () => { notasErro = ''; carregarNotas(); rerenderNotas(); } }, 'Tentar de novo')); return; }
  if (notaNova) { const n = notaNova; notaNova = null; setTimeout(() => formNota(n), 30); }
  const abas = [['lista', '🧾 Notas'], ['reembolso', '💸 Reembolso']];
  botoesFoto(b); b.append(el('div', { class: 'nTopo' }, el('div', { class: 'nAbas' }, ...abas.map(([k, n]) => el('button', { class: k === notasAba ? 'on' : '', onclick: () => { notasAba = k; showSec('notas'); } }, n)))));
  avisoPend(b);
  ({ lista: abaLista, reembolso: abaReembolso })[notasAba](b);
}
// um toque e já abre a câmera
function botoesFoto(b) {
  const cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment' }), gal = el('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true });
  cam.onchange = () => { const a = [...cam.files]; cam.value = ''; if (a.length) formNota({ nova: true }, a); }; gal.onchange = () => { const a = [...gal.files]; gal.value = ''; if (a.length) formNota({ nova: true }, a); };
  b.append(el('div', { class: 'nRapida' }, el('button', { class: 'pri nGrande', onclick: () => cam.click() }, '📷 Tirar foto da nota'), el('div', { class: 'nAcoes' }, el('button', { onclick: () => gal.click() }, '🖼️ Galeria ou PDF'), el('button', { onclick: () => formNota({ nova: true }) }, '✍️ Sem foto')), cam, gal));
}
function avisoPend(b) { if (NPEND.length) b.append(el('div', { class: 'aviso' }, el('span', {}, `📵 ${NPEND.length} nota(s) guardada(s) neste aparelho, esperando internet.`), el('button', { onclick: () => enviarPend() }, 'Enviar agora'))); }
// sem senha: lança na hora; para ver tudo, pedir reembolso ou mudar, entra uma vez neste aparelho
function renderRapida(b) {
  cfgPadrao(); if (notaNova) { const n = notaNova; notaNova = null; setTimeout(() => formNota(n), 30); }
  botoesFoto(b); avisoPend(b); if (!renderRapida.leu) { renderRapida.leu = true; lerPend().then(() => { if (NPEND.length) { enviarPend(); rerenderNotas(); } }); }
  const l = lerRecentes(); if (l.length) b.append(el('h4', {}, 'Últimas deste aparelho'), ...l.map((n) => el('div', { class: 'item nLinha' }, el('span', { class: 'nIc' }, '🧾'), el('span', { class: 'txt' }, el('b', {}, n.fornecedor || n.desc || 'Nota'), el('small', {}, [ddmm(n.data), n.centro, n.pagoPor === 'meu' ? 'meu bolso' : 'empresa pagou'].filter(Boolean).join(' · '))), el('b', { class: 'valor' }, BRL(n.valor)))));
  b.append(el('div', { class: 'nAcoes', style: 'margin-top:18px' }, el('button', { onclick: () => login() }, '🔒 Ver todas e pedir reembolso'), el('small', {}, 'Pede a senha uma vez só neste aparelho.')));
}
const kpi = (t, v, c) => el('div', { class: 'kpi ' + (c || '') }, el('small', {}, t), el('b', {}, v));
function navMes(b) {
  const ir = (d) => { notasMes = somaMes(notasMes, d); showSec('notas'); }, tudo = notasMes === 'tudo', agora = new Date().toISOString().slice(0, 7);
  b.append(el('div', { class: 'mesNav' }, tudo ? null : el('button', { onclick: () => ir(-1), 'aria-label': 'Mês anterior' }, '‹'), el('h3', {}, tudo ? 'Todos os meses' : nomeMes(notasMes)), tudo ? null : el('button', { onclick: () => ir(1), 'aria-label': 'Próximo mês' }, '›'),
    el('button', { class: 'mini', onclick: () => { notasMes = tudo ? agora : 'tudo'; showSec('notas'); } }, tudo ? 'Ver por mês' : 'Ver tudo')));
}
const noMes = (l) => notasMes === 'tudo' ? l : l.filter((n) => (n.data || '').startsWith(notasMes));
function linhaNota(n, extra) {
  const [st, c] = SIT[situacao(n)];
  return el('div', { class: 'item nLinha', onclick: (e) => { if (e.target.closest('input,button')) return; formNota(n); } }, extra || null,
    el('span', { class: 'nIc' }, (n.fotos || []).length ? '🧾' : '▫️'),
    el('span', { class: 'txt' }, el('b', {}, n.fornecedor || n.desc || 'Sem fornecedor'), el('small', {}, [ddmm(n.data), n.fornecedor && n.desc, n.centro].filter(Boolean).join(' · '))),
    el('span', { class: 'nSit ' + c }, n.pendente ? '📵 a enviar' : st + (n.recebidoEm ? ' ' + ddmm(n.recebidoEm) : n.pedidoEm && n.pagoPor === 'meu' ? ' ' + ddmm(n.pedidoEm) : '')),
    el('b', { class: 'valor' }, BRL(n.valor)));
}
function abaLista(b) {
  navMes(b); const doMes = noMes(todasNotas()), meu = doMes.filter((n) => n.pagoPor === 'meu'), emp = doMes.filter((n) => n.pagoPor === 'empresa'), rec = todasNotas().filter((n) => ['pedir', 'pedido'].includes(situacao(n)));
  b.append(el('div', { class: 'kpis' }, kpi('Do meu bolso', BRL(somaN(meu)), meu.length ? 'warn' : ''), kpi('Empresa pagou', BRL(somaN(emp))), kpi('Falta me pagarem', BRL(somaN(rec)), rec.length ? 'bad' : 'ok')));
  const bus = el('input', { id: 'nBusca', placeholder: 'Buscar por fornecedor, item, valor…', value: notasBusca, oninput: (e) => { notasBusca = e.target.value; pinta(); } });
  const caixa = el('div', {}); b.append(el('div', { class: 'newRow' }, bus), caixa);
  const pinta = () => {
    const q = notasBusca.trim().toLowerCase(), l = (q ? todasNotas() : doMes).filter((n) => !q || [n.fornecedor, n.desc, n.categoria, n.centro, n.obs, n.cnpj, n.numero, String(n.valor).replace('.', ','), dmy(n.data)].join(' ').toLowerCase().includes(q)).sort((x, y) => (y.data || '').localeCompare(x.data || '') || y.criado - x.criado);
    caixa.replaceChildren(...(l.length ? l.map((n) => linhaNota(n)) : [el('div', { class: 'empty' }, q ? 'Nada encontrado.' : 'Nenhuma nota neste mês. Toque em "Nova nota" e tire a foto.')]));
  }; pinta();
  if (NOTAS.length) b.append(el('div', { class: 'nAcoes' }, el('button', { class: 'mini', onclick: () => csv(doMes) }, '⬇ Planilha'), el('button', { class: 'mini', onclick: backup }, '⬇ Cópia de tudo')));
}
function abaReembolso(b) {
  const l = todasNotas().filter((n) => n.pagoPor === 'meu' && !n.pendente), ab = l.filter((n) => situacao(n) === 'pedir'), pd = l.filter((n) => situacao(n) === 'pedido'), rc = l.filter((n) => situacao(n) === 'recebido');
  b.append(el('div', { class: 'kpis' }, kpi('A pedir', BRL(somaN(ab)), ab.length ? 'bad' : 'ok'), kpi('Já pedi, falta pagar', BRL(somaN(pd)), pd.length ? 'warn' : 'ok'), kpi('Já recebi', BRL(somaN(rc)), 'ok')));
  const grupo = (titulo, lista, acoes) => {
    b.append(el('h4', {}, `${titulo} (${lista.length})`)); if (!lista.length) { b.append(el('div', { class: 'empty' }, 'Nada aqui.')); return; }
    [...new Set(lista.map((n) => n.empresa || 'Sem empresa'))].sort().forEach((e) => {
      const g = lista.filter((n) => (n.empresa || 'Sem empresa') === e).sort((x, y) => x.data.localeCompare(y.data)), sel = new Set(g.map((n) => n.id)), tot = el('b', {}, BRL(somaN(g)));
      const marca = (n) => el('input', { type: 'checkbox', checked: true, 'aria-label': 'Incluir', onchange: (ev) => { ev.target.checked ? sel.add(n.id) : sel.delete(n.id); tot.textContent = BRL(somaN(g.filter((x) => sel.has(x.id)))); } });
      const pegar = () => { const x = g.filter((n) => sel.has(n.id)); if (!x.length) toast('Marque pelo menos uma nota'); return x; };
      b.append(el('div', { class: 'nGrupo' }, el('div', { class: 'nGrupoT' }, el('span', {}, e), tot), ...g.map((n) => linhaNota(n, marca(n))), el('div', { class: 'nAcoes' }, ...acoes.map(([txt, fn, pri]) => { const bt = el('button', { class: pri ? 'pri' : '', onclick: async () => { const x = pegar(); if (!x.length) return; bt.disabled = true; try { await fn(x, e); } finally { bt.disabled = false; } } }, txt); return bt; }))));
    });
  };
  grupo('A pedir', ab, [['📤 Enviar PDF', (x, e) => enviarPdf(x, e, true), 1], ['Já pedi', (x) => marcar(x, 'pedidoEm')]]);
  grupo('Já pedi, falta pagar', pd, [['✅ Recebi', (x) => marcar(x, 'recebidoEm'), 1], ['📤 Enviar de novo', (x, e) => enviarPdf(x, e)], ['Voltar para a pedir', (x) => marcar(x, 'pedidoEm', '')]]);
  if (rc.length) grupo('Já recebi', rc.sort((x, y) => y.recebidoEm.localeCompare(x.recebidoEm)).slice(0, 30), [['📤 PDF', (x, e) => enviarPdf(x, e)]]);
}
async function marcar(l, campo, val) {
  const v = val === undefined ? hojeIso() : val; let ok = 0;
  for (const n of l) { try { await salvarNota({ ...n, [campo]: v }); ok++; } catch (e) { toast('Não salvou: ' + e.message); break; } }
  if (ok) toast(ok === 1 ? '1 nota atualizada' : ok + ' notas atualizadas'); showSec('notas');
}
// PDF do reembolso: a lista na primeira página e as notas em seguida (cada página é desenhada e vira uma imagem do PDF)
const PW = 1240, PH = 1754;
function paginaPdf() { const c = telaDe(PW, PH), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH); return [c, x]; }
async function montarPdf(paginas) {
  const te = new TextEncoder(), partes = [], pos = []; let tam = 0; const poe = (v) => { const b = typeof v === 'string' ? te.encode(v) : v; partes.push(b); tam += b.length; };
  const obj = (n, corpo) => { pos[n] = tam; poe(`${n} 0 obj\n`); (Array.isArray(corpo) ? corpo : [corpo]).forEach(poe); poe('\nendobj\n'); }; poe('%PDF-1.4\n');
  const N = paginas.length; obj(1, '<</Type/Catalog/Pages 2 0 R>>'); obj(2, `<</Type/Pages/Count ${N}/Kids[${paginas.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}]>>`);
  for (let i = 0; i < N; i++) {
    const jpg = new Uint8Array(await (await paraJpeg(paginas[i], .82)).arrayBuffer()), a = 3 + i * 3, d = 'q 595 0 0 842 0 0 cm /I Do Q';
    obj(a, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</XObject<</I ${a + 2} 0 R>>>>/Contents ${a + 1} 0 R>>`); obj(a + 1, `<</Length ${d.length}>>\nstream\n${d}\nendstream`);
    obj(a + 2, [`<</Type/XObject/Subtype/Image/Width ${paginas[i].width}/Height ${paginas[i].height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>\nstream\n`, jpg, '\nendstream']);
  }
  const x0 = tam, T = 3 + N * 3; poe(`xref\n0 ${T}\n0000000000 65535 f \n` + Array.from({ length: T - 1 }, (_, i) => String(pos[i + 1]).padStart(10, '0') + ' 00000 n \n').join('') + `trailer<</Size ${T}/Root 1 0 R>>\nstartxref\n${x0}\n%%EOF`);
  return new Blob(partes, { type: 'application/pdf' });
}
async function pdfReembolso(l, e) {
  const pags = [], anexos = [], F = (p, s) => `${p} ${s}px system-ui,Arial,sans-serif`, corta = (x, s, w) => { s = String(s || ''); if (x.measureText(s).width <= w) return s; while (s && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  const POR = 16; for (let p = 0; p * POR < l.length; p++) {
    const [c, x] = paginaPdf(); let y = 130; x.fillStyle = '#1f2023'; x.font = F(800, 52); x.fillText('Pedido de reembolso', 90, y); x.font = F(400, 27); x.fillStyle = '#5c6066'; x.fillText([e !== 'Sem empresa' && e, dmy(hojeIso()), `${l.length} nota${l.length > 1 ? 's' : ''}`].filter(Boolean).join('  ·  '), 90, y + 48);
    y = 260; x.font = F(700, 23); [['Data', 90], ['O que é', 230], ['Obra', 780]].forEach(([s, k]) => x.fillText(s, k, y)); x.textAlign = 'right'; x.fillText('Valor', PW - 90, y); x.textAlign = 'left'; x.fillStyle = '#222'; x.fillRect(90, y + 14, PW - 180, 3); y += 60;
    l.slice(p * POR, p * POR + POR).forEach((n) => { x.fillStyle = '#1f2023'; x.font = F(400, 27); x.fillText(dmy(n.data).slice(0, 5), 90, y); x.font = F(700, 27); x.fillText(corta(x, n.fornecedor || n.desc, 520), 230, y); x.font = F(400, 24); x.fillText(corta(x, n.centro, 200), 780, y); x.font = F(700, 27); x.textAlign = 'right'; x.fillText(BRL(n.valor), PW - 90, y); x.textAlign = 'left'; x.fillStyle = '#5c6066'; x.font = F(400, 22); x.fillText(corta(x, [n.fornecedor && n.desc, n.forma].filter(Boolean).join('  ·  '), 540), 230, y + 31); x.fillStyle = '#ddd'; x.fillRect(90, y + 52, PW - 180, 1.5); y += 92; });
    if ((p + 1) * POR >= l.length) { x.fillStyle = '#222'; x.fillRect(90, y - 40, PW - 180, 3); x.font = F(800, 38); x.fillText('Total', 90, y + 34); x.textAlign = 'right'; x.fillText(BRL(somaN(l)), PW - 90, y + 34); x.textAlign = 'left'; }
    pags.push(c);
  }
  for (const n of l) for (const f of n.fotos || []) {
    try {
      const bl = await (await fetch(await urlFoto(f.id))).blob(); if (f.tipo === 'application/pdf') { anexos.push(new File([bl], `nota-${ddmm(n.data).replace('/', '-')}-${(n.fornecedor || 'nota').replace(/[^\w]+/g, '-').slice(0, 24)}.pdf`, { type: 'application/pdf' })); continue; }
      const im = await imagem(bl), [c, x] = paginaPdf(), k = Math.min((PW - 120) / im.width, (PH - 190) / im.height); x.fillStyle = '#1f2023'; x.font = F(700, 28); x.fillText(corta(x, `${dmy(n.data)}  ·  ${n.fornecedor || n.desc}  ·  ${BRL(n.valor)}`, PW - 120), 60, 80); x.drawImage(im, (PW - im.width * k) / 2, 120, im.width * k, im.height * k); pags.push(c);
    } catch { toast('Uma foto não abriu e ficou de fora do PDF'); }
  }
  return [new File([await montarPdf(pags)], `reembolso-${hojeIso()}.pdf`, { type: 'application/pdf' }), ...anexos];
}
async function enviarPdf(l, e, pedir) {
  toast('Preparando o PDF…'); let arqs; try { arqs = await pdfReembolso(l, e); } catch (x) { return toast('Não consegui montar o PDF: ' + x.message); }
  const texto = `Reembolso: ${BRL(somaN(l))} (${l.length} nota${l.length > 1 ? 's' : ''})`; let foi = false;
  if (navigator.canShare && navigator.canShare({ files: arqs })) { try { await navigator.share({ files: arqs, text: texto }); foi = true; } catch (x) { if (x.name === 'AbortError') return; } }
  if (!foi) arqs.forEach((a) => baixar(a, a.name));
  if (pedir && confirm(foi ? 'Enviou? Marcar estas notas como pedidas?' : 'O PDF foi baixado. Marcar estas notas como pedidas?')) await marcar(l, 'pedidoEm');
}
function novoNaLista(k) { const v = (prompt('Nome:') || '').trim(); if (!v || NCFG[k].includes(v)) return null; NCFG[k] = [...NCFG[k], v]; if (CAN_EDIT) salvarCfg(); if (!$('nForm')) showSec('notas'); return v; }
const baixar = (blob, nome) => { const a = el('a', { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
function csv(l) { const q = (s) => '"' + String(s ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"'; const c = ['Data', 'Fornecedor', 'CNPJ', 'Número', 'O que é', 'Categoria', 'Obra', 'Valor', 'Quem pagou', 'Forma', 'Empresa', 'Situação', 'Pedido em', 'Recebido em', 'Observação']; baixar(new Blob(['﻿' + [c, ...[...l].sort((x, y) => x.data.localeCompare(y.data)).map((n) => [dmy(n.data), n.fornecedor, n.cnpj, n.numero, n.desc, n.categoria, n.centro, String(n.valor).replace('.', ','), n.pagoPor === 'meu' ? 'Meu dinheiro' : 'Empresa', n.forma, n.empresa, SIT[situacao(n)][0], dmy(n.pedidoEm), dmy(n.recebidoEm), n.obs])].map((r) => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `notas-${notasMes}.csv`); }
async function backup() {
  toast('Juntando as fotos…'); const out = [], d64 = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); let falhas = 0;
  for (const n of NOTAS) { const fs = []; for (const f of n.fotos || []) { try { fs.push({ tipo: f.tipo, dados: await d64(await (await fetch(await urlFoto(f.id))).blob()) }); } catch { falhas++; } } out.push({ ...n, arquivos: fs }); }
  baixar(new Blob([JSON.stringify({ feito: new Date().toISOString(), cfg: NCFG, notas: out }, null, 1)], { type: 'application/json' }), `notas-copia-${hojeIso()}.json`); toast(falhas ? `Cópia baixada, ${falhas} foto(s) não abriram` : 'Cópia baixada');
}

// ---------- formulário ----------
const ultimaEscolha = () => { try { return JSON.parse(localStorage.getItem('notas-ultima')) || {}; } catch { return {}; } };
function formNota(n0, arquivos) {
  cfgPadrao(); const nova = !(NOTAS || []).some((x) => x.id === n0.id) && !NPEND.some((x) => x.id === n0.id), ult = [...(NOTAS || [])].sort((x, y) => y.criado - x.criado)[0] || ultimaEscolha();
  const pend = NPEND.find((p) => p.id === n0.id);
  const n = { id: novoId(), data: hojeIso(), fornecedor: '', cnpj: '', numero: '', chave: '', desc: '', valor: '', categoria: 'Material', centro: ult.centro || NCFG.centros[0], pagoPor: 'meu', forma: ult.forma || 'Pix', empresa: ult.empresa || NCFG.empresas[0], obs: '', missao: '', criado: Date.now(), ...n0, fotos: [...(n0.fotos || [])] };
  delete n.nova; delete n.pendente; const novas = pend ? [...pend.novas] : [];
  const fundo = el('div', { id: 'nForm', class: 'nFundo' }), cx = el('div', { class: 'nCaixa', role: 'dialog', 'aria-label': 'Nota' }); fundo.append(cx); document.body.append(fundo);
  const fechar = () => { fundo.remove(); removeEventListener('keydown', esc2); }, esc2 = (e) => { if (e.key === 'Escape' && !$('nScan')) fechar(); }; addEventListener('keydown', esc2);
  const inp = (k, rot, at = {}) => { const i = el('input', { 'data-k': k, value: n[k] ?? '', ...at, oninput: (e) => { n[k] = e.target.value; tocados.add(k); } }); return el('label', {}, el('span', {}, rot), i); };
  const sel = (k, rot, lista, cfgk) => { const s = el('select', { onchange: (e) => { if (e.target.value === '+') { const v = novoNaLista(cfgk); if (v) { n[k] = v; } desenha(); return; } n[k] = e.target.value; } }, ...[...new Set([...lista, n[k]].filter(Boolean))].map((x) => el('option', { value: x, selected: x === n[k] }, x)), cfgk ? el('option', { value: '+' }, '+ Novo…') : null); return el('label', {}, el('span', {}, rot), s); };
  const cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment' }), gal = el('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true });
  const receber = async (arqs) => { let lida = null; for (const f of arqs) { if (f.type === 'application/pdf') { if (f.size > 4 * 1024 * 1024) { toast('PDF maior que 4 MB'); continue; } novas.push(new Blob([await f.arrayBuffer()], { type: 'application/pdf' })); } else { const r = await scanner(f); if (r) { novas.push(r); lida = lida || r; } } } desenha(); if (lida && nova) ler(lida, true); };
  cam.onchange = () => { const a = [...cam.files]; cam.value = ''; receber(a); }; gal.onchange = () => { const a = [...gal.files]; gal.value = ''; receber(a); };
  let lendo = '', maisAberto = false; const tocados = new Set();
  // preenche só o que a pessoa não mexeu, sem redesenhar (não atrapalha quem está digitando)
  const aplica = (o) => { let q = 0; for (const [k, v] of Object.entries(o || {})) { if (!v || tocados.has(k) || (k !== 'data' && k !== 'chave' && n[k])) continue; n[k] = v; q++; const i = cx.querySelector(`[data-k="${k}"]`); if (i) i.value = k === 'valor' ? v.toFixed(2).replace('.', ',') : v; } return q; };
  const avisa = (s) => { lendo = s; const e = cx.querySelector('.nLendo'); if (e) e.textContent = s; };
  let ocupado = false;
  const ler = async (b, auto) => {
    if (ocupado) return; b = b || novas.find((x) => x.type !== 'application/pdf') || (n.fotos.find((f) => f.tipo !== 'application/pdf') && await (await fetch(await urlFoto(n.fotos.find((f) => f.tipo !== 'application/pdf').id))).blob()); if (!b) return toast('Tire a foto primeiro');
    ocupado = true; avisa('🔎 Lendo a nota… pode ir preenchendo'); let q = 0;
    try { q += aplica(await ocrNota(b, (p) => avisa(`🔎 Lendo a nota… ${Math.round(p * 100)}%`))); } catch (e) { if (!auto) toast('Não consegui ler: ' + e.message); }
    ocupado = false; avisa(q ? '✓ Preenchi o que consegui ler. Confira antes de salvar.' : auto && !navigator.onLine ? '' : 'Não consegui ler. Preencha à mão.');
  };
  async function salvar(bt) {
    const v = typeof n.valor === 'number' ? n.valor : lerValor(n.valor); if (v == null || v <= 0) { toast('Falta o valor'); cx.querySelector('[data-valor]').focus(); return; }
    if (!n.data) return toast('Falta a data'); if (!n.fornecedor.trim() && !n.desc.trim()) return toast('Diga o fornecedor ou o que é');
    try { localStorage.setItem('notas-ultima', JSON.stringify({ centro: n.centro, empresa: n.empresa, forma: n.forma })); } catch {}
    n.valor = v; if (n.pagoPor === 'empresa') { n.pedidoEm = ''; n.recebidoEm = ''; } bt.disabled = true; bt.textContent = 'Salvando…';
    const p = { id: n.id, nota: { ...n, fotos: [...n.fotos] }, novas: [...novas] };
    try { await nFila('readwrite', (s) => s.put(p)); } catch {}
    try { while (p.novas.length) { const f = await enviarFoto(p.novas[0]); p.nota.fotos.push(f); p.novas.shift(); try { await nFila('readwrite', (s) => s.put(p)); } catch {} } await salvarNota(p.nota); try { await nFila('readwrite', (s) => s.delete(p.id)); } catch {} toast('Nota salva'); }
    catch (e) { if (e.status && e.status < 500 && e.status !== 429) { try { await nFila('readwrite', (s) => s.delete(p.id)); } catch {} await lerPend(); n.fotos = p.nota.fotos; novas.splice(0, novas.length, ...p.novas); toast(e.message); bt.disabled = false; bt.textContent = 'Salvar'; return; } toast('Sem internet: a nota ficou guardada neste aparelho e sobe sozinha'); }
    await lerPend(); fechar();
    if (n.missao) { const it = itens('meta').find((x) => x.id === n.missao); if (it && !it.done && confirm(`Marcar "${it.text}" como feita na Missão?`)) { it.done = true; it.feito = Date.now(); salvarSec('meta'); } }
    showSec('notas');
  }
  async function apagarNota() { if (!confirm('Apagar esta nota e as fotos dela? Não dá para desfazer.')) return; try { if (pend) await nFila('readwrite', (s) => s.delete(n.id)); if ((NOTAS || []).some((x) => x.id === n.id)) { await nApi('DELETE', '?id=' + encodeURIComponent(n.id)); NOTAS = NOTAS.filter((x) => x.id !== n.id); } await lerPend(); fechar(); showSec('notas'); toast('Nota apagada'); } catch (e) { toast(e.message); } }
  function miniaturas() {
    const z = el('div', { class: 'nMinis' });
    n.fotos.forEach((f) => { const m = el('div', { class: 'nMini' }, f.tipo === 'application/pdf' ? '📄' : '…', el('button', { title: 'Tirar', 'aria-label': 'Tirar foto', onclick: (e) => { e.stopPropagation(); if (confirm('Tirar esta foto da nota?')) { n.fotos = n.fotos.filter((x) => x !== f); desenha(); } } }, '✕')); m.onclick = async () => { try { verFoto(await urlFoto(f.id), f.tipo); } catch (e) { toast(e.message); } }; if (f.tipo !== 'application/pdf') urlFoto(f.id).then((u) => { m.style.backgroundImage = `url(${u})`; m.firstChild.textContent = ''; }).catch(() => { m.firstChild.textContent = '⚠️'; }); z.append(m); });
    novas.forEach((bl) => { const u = bl.u || (bl.u = URL.createObjectURL(bl)); const m = el('div', { class: 'nMini' }, bl.type === 'application/pdf' ? '📄' : '', el('button', { title: 'Tirar', 'aria-label': 'Tirar foto', onclick: (e) => { e.stopPropagation(); novas.splice(novas.indexOf(bl), 1); desenha(); } }, '✕')); if (bl.type !== 'application/pdf') m.style.backgroundImage = `url(${u})`; m.onclick = () => verFoto(u, bl.type); z.append(m); });
    return z;
  }
  function desenha() {
    const meu = n.pagoPor === 'meu', rolou = cx.scrollTop;
    const vin = el('input', { 'data-valor': '1', 'data-k': 'valor', inputmode: 'decimal', placeholder: '0,00', value: typeof n.valor === 'number' && n.valor ? String(n.valor.toFixed(2)).replace('.', ',') : n.valor || '', oninput: (e) => { n.valor = e.target.value; tocados.add('valor'); } });
    const bt = el('button', { class: 'pri', onclick: () => salvar(bt) }, 'Salvar');
    cx.replaceChildren(...[el('div', { class: 'nCab' }, el('h3', {}, nova ? 'Nova nota' : 'Nota'), el('button', { onclick: fechar, 'aria-label': 'Fechar' }, '✕')),
      el('div', { class: 'nFotos' }, el('button', { class: 'pri', onclick: () => cam.click() }, '📷 Tirar foto'), el('button', { onclick: () => gal.click() }, '🖼️ Galeria ou PDF'), novas.length || n.fotos.length ? el('button', { onclick: () => ler() }, '🔎 Ler de novo') : null, cam, gal), miniaturas(), el('div', { class: 'nLendo', role: 'status' }, lendo),
      el('div', { class: 'nQuem' }, el('button', { class: meu ? 'on' : '', onclick: () => { n.pagoPor = 'meu'; desenha(); } }, '👛 Paguei do meu bolso'), el('button', { class: meu ? '' : 'on', onclick: () => { n.pagoPor = 'empresa'; desenha(); } }, '🏢 A empresa pagou')),
      el('div', { class: 'nCampos' }, el('label', {}, el('span', {}, 'Valor (R$)'), vin), inp('data', 'Data da nota', { type: 'date' }), inp('fornecedor', 'Onde comprei', { maxlength: 200 }), inp('desc', 'O que é', { maxlength: 400, placeholder: 'Ex.: parafusos para a platibanda' }), sel('centro', 'Obra', NCFG.centros, 'centros'), sel('empresa', meu ? 'Quem vai me pagar' : 'Qual empresa pagou', NCFG.empresas, 'empresas')),
      el('details', { class: 'nMais', open: maisAberto, ontoggle: (e) => { maisAberto = e.target.open; } }, el('summary', {}, 'Mais detalhes'), el('div', { class: 'nCampos' }, sel('forma', 'Como paguei', N_FORMAS), sel('categoria', 'Tipo', NCFG.categorias, 'categorias'), inp('cnpj', 'CNPJ do fornecedor', { maxlength: 20, inputmode: 'numeric' }), inp('numero', 'Número da nota', { maxlength: 30 }),
        meu && !nova ? inp('pedidoEm', 'Pedi o reembolso em', { type: 'date' }) : null, meu && !nova ? inp('recebidoEm', 'Recebi em', { type: 'date' }) : null, el('label', { class: 'nLargo' }, el('span', {}, 'Observação'), el('textarea', { rows: 2, maxlength: 800, oninput: (e) => { n.obs = e.target.value; } }, n.obs || '')))),
      n.missao && itens('meta').find((x) => x.id === n.missao) ? el('div', { class: 'hint' }, '🎯 Ligada à Missão: ' + itens('meta').find((x) => x.id === n.missao).text) : null, n.chave ? el('div', { class: 'hint' }, 'Chave: ' + n.chave) : null,
      el('div', { class: 'nRodape' }, nova ? el('span', {}) : el('button', { class: 'nApagar', onclick: apagarNota }, 'Apagar'), el('span', {}, el('button', { onclick: fechar }, 'Cancelar'), ' ', bt))].filter(Boolean));
    cx.scrollTop = rolou;
  }
  desenha(); if (arquivos && arquivos.length) receber(arquivos);
}
function verFoto(u, tipo) { if (tipo === 'application/pdf') { window.open(u, '_blank', 'noopener'); return; } const v = el('div', { class: 'nVer', onclick: () => v.remove() }, el('img', { src: u, alt: 'Nota' }), el('button', { 'aria-label': 'Fechar' }, '✕')); document.body.append(v); }

// ---------- scanner: recorta a nota pelos 4 cantos e limpa o fundo ----------
function imagem(b) { return new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(b); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Não consegui abrir a foto')); }; i.src = u; }); }
const telaDe = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function acharCantos(c) {
  // procura o papel (a parte clara) numa versão pequena; se não achar, usa a foto quase inteira
  const w = 160, h = Math.round(c.height * 160 / c.width), p = telaDe(w, h), x = p.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h); let s = 0;
  for (let i = 0; i < g.length; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; g[i] = .3 * r + .59 * gg + .11 * b - (Math.max(r, gg, b) - Math.min(r, gg, b)) * .6; s += g[i]; }
  const hist = new Array(256).fill(0); g.forEach((v) => hist[Math.max(0, Math.min(255, v | 0))]++); let tot = g.length, sum = 0, sb = 0, wb = 0, best = 0, th = 128; hist.forEach((n, i) => sum += i * n);
  for (let i = 0; i < 256; i++) { wb += hist[i]; if (!wb) continue; const wf = tot - wb; if (!wf) break; sb += i * hist[i]; const m = (sb / wb - (sum - sb) / wf) ** 2 * wb * wf; if (m > best) { best = m; th = i; } }
  const on = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) on[i] = g[i] > th ? 1 : 0;
  const vis = new Int32Array(w * h); let id = 0, maior = null; const fila = new Int32Array(w * h);
  for (let i = 0; i < on.length; i++) if (on[i] && !vis[i]) { id++; let a = 0, f = 0; fila[f++] = i; vis[i] = id; while (a < f) { const k = fila[a++], cx = k % w, cy = (k / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, q = ny * w + nx; if (nx >= 0 && ny >= 0 && nx < w && ny < h && on[q] && !vis[q]) { vis[q] = id; fila[f++] = q; } } } if (!maior || f > maior.n) maior = { id, n: f }; }
  const pad = [[.04, .04], [.96, .04], [.96, .96], [.04, .96]]; if (!maior || maior.n < w * h * .12 || maior.n > w * h * .97) return pad;
  let tl, tr, br, bl, a = 1e9, b2 = -1e9, c2 = -1e9, d2 = 1e9; for (let i = 0; i < vis.length; i++) if (vis[i] === maior.id) { const px = i % w, py = (i / w) | 0, m = px + py, n = px - py; if (m < a) { a = m; tl = [px, py]; } if (m > c2) { c2 = m; br = [px, py]; } if (n > b2) { b2 = n; tr = [px, py]; } if (n < d2) { d2 = n; bl = [px, py]; } }
  const k = [tl, tr, br, bl].map(([px, py]) => [px / (w - 1), py / (h - 1)]), area = Math.abs((k[2][0] - k[0][0]) * (k[3][1] - k[1][1]) - (k[3][0] - k[1][0]) * (k[2][1] - k[0][1])) / 2; return area > .12 ? k : pad;
}
function homografia(s, d) { // d (saída) -> s (foto)
  const A = [], b = []; for (let i = 0; i < 4; i++) { const [x, y] = d[i], [u, v] = s[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let i = 0; i < 8; i++) { let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; const q = A[i][i] || 1e-9; for (let r = 0; r < 8; r++) if (r !== i) { const f = A[r][i] / q; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
  return b.map((v, i) => v / (A[i][i] || 1e-9));
}
function recortar(c, k, filtro) {
  const P = k.map(([x, y]) => [x * (c.width - 1), y * (c.height - 1)]), di = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); let w = Math.max(di(P[0], P[1]), di(P[3], P[2])), h = Math.max(di(P[0], P[3]), di(P[1], P[2])); const e = Math.min(1, 1700 / Math.max(w, h)); w = Math.max(20, Math.round(w * e)); h = Math.max(20, Math.round(h * e));
  const H = homografia(P, [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]), src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height), S = src.data, W = c.width, HH = c.height, o = telaDe(w, h), ox = o.getContext('2d', { willReadFrequently: true }), im = ox.createImageData(w, h), D = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const z = H[6] * x + H[7] * y + 1; let u = (H[0] * x + H[1] * y + H[2]) / z, v = (H[3] * x + H[4] * y + H[5]) / z; u = Math.max(0, Math.min(W - 1.001, u)); v = Math.max(0, Math.min(HH - 1.001, v)); const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = (y0 * W + x0) * 4, j = (y * w + x) * 4; for (let q = 0; q < 3; q++) D[j + q] = (S[i + q] * (1 - fx) + S[i + 4 + q] * fx) * (1 - fy) + (S[i + W * 4 + q] * (1 - fx) + S[i + W * 4 + 4 + q] * fx) * fy; D[j + 3] = 255; }
  if (filtro !== 'cor') { // tira a sombra: compara cada ponto com a claridade em volta
    const g = new Float32Array(w * h); for (let i = 0; i < g.length; i++) g[i] = .3 * D[i * 4] + .59 * D[i * 4 + 1] + .11 * D[i * 4 + 2]; const I = new Float64Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; } } const r = Math.max(8, Math.round(Math.min(w, h) / 22));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1), m = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); let v = g[y * w + x] / Math.max(20, m); v = Math.max(0, Math.min(1, (v - .55) / .42)); const j = (y * w + x) * 4; D[j] = D[j + 1] = D[j + 2] = v * 255; }
  }
  ox.putImageData(im, 0, 0); return o;
}
const paraJpeg = (c, q = .78) => new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', q));
async function scanner(arq) {
  let img; try { img = await imagem(arq); } catch (e) { toast(e.message); return null; }
  const e = Math.min(1, 2200 / Math.max(img.width, img.height)), base0 = telaDe(Math.round(img.width * e), Math.round(img.height * e)); base0.getContext('2d').drawImage(img, 0, 0, base0.width, base0.height);
  return new Promise((ok) => {
    let base = base0, k = acharCantos(base), filtro = 'limpo', previa = false;
    const fundo = el('div', { id: 'nScan', class: 'nFundo' }), cx = el('div', { class: 'nCaixa nScanCx' }), quadro = el('div', { class: 'nQuadro' }); fundo.append(cx); document.body.append(fundo);
    const fim = (v) => { fundo.remove(); ok(v); };
    const girar = () => { const c = telaDe(base.height, base.width), x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(base, 0, 0); base = c; k = acharCantos(base); previa = false; pinta(); };
    const usar = async (bt) => { bt.disabled = true; bt.textContent = 'Preparando…'; await new Promise((r) => setTimeout(r, 30)); const c = recortar(base, k, filtro); let b = await paraJpeg(c); if (b.size > 1500000) b = await paraJpeg(c, .55); fim(b); };
    function pinta() {
      quadro.replaceChildren(); const v = previa ? recortar(base, k, filtro) : base; const t = telaDe(v.width, v.height); t.getContext('2d').drawImage(v, 0, 0); t.className = 'nTela'; quadro.append(t);
      if (!previa) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 1000 1000'); s.setAttribute('preserveAspectRatio', 'none'); const pl = document.createElementNS(s.namespaceURI, 'polygon'); s.append(pl); quadro.append(s);
        const at = () => pl.setAttribute('points', k.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')); at();
        k.forEach((p, i) => { const b = el('div', { class: 'nCanto', role: 'button', 'aria-label': 'Canto ' + (i + 1) }); const pos = () => { b.style.left = k[i][0] * 100 + '%'; b.style.top = k[i][1] * 100 + '%'; }; pos(); b.onpointerdown = (ev) => { ev.preventDefault(); b.setPointerCapture(ev.pointerId); b.onpointermove = (m) => { const r = quadro.getBoundingClientRect(); k[i] = [Math.max(0, Math.min(1, (m.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (m.clientY - r.top) / r.height))]; pos(); at(); }; b.onpointerup = b.onpointercancel = () => { b.onpointermove = null; }; }; quadro.append(b); });
      }
      const bt = el('button', { class: 'pri', onclick: () => usar(bt) }, 'Usar');
      cx.replaceChildren(el('div', { class: 'nCab' }, el('h3', {}, previa ? 'Como vai ficar' : 'Arraste os cantos até a nota'), el('button', { onclick: () => fim(null), 'aria-label': 'Cancelar' }, '✕')), quadro,
        el('div', { class: 'nAcoes' }, el('button', { onclick: girar }, '⟳ Girar'), el('button', { onclick: () => { filtro = filtro === 'cor' ? 'limpo' : 'cor'; pinta(); } }, filtro === 'cor' ? '🎨 Colorida' : '⬛ Scanner'), el('button', { onclick: () => { previa = !previa; pinta(); } }, previa ? 'Ajustar cantos' : '👁 Ver'), el('button', { onclick: () => { k = [[0, 0], [1, 0], [1, 1], [0, 1]]; previa = false; pinta(); } }, 'Foto inteira'), bt));
    }
    pinta();
  });
}

// ---------- leitura: QR Code da nota e texto da foto ----------
const carregaJs = (u) => new Promise((ok, no) => { if (document.querySelector(`script[src="${u}"]`)) return ok(); const s = el('script', { src: u, crossorigin: 'anonymous' }); s.onload = () => ok(); s.onerror = () => { s.remove(); no(new Error('sem internet para baixar o leitor')); }; document.head.append(s); });
function cnpjOk(c) { c = String(c || '').replace(/\D/g, ''); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false; const dv = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; }; return dv(12) === +c[12] && dv(13) === +c[13]; }
const fmtCnpj = (c) => c.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
function dadosDaChave(txt) {
  const m = String(txt || '').replace(/\s/g, '').match(/\d{44}/); if (!m) return null; const c = m[0]; let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += c[i] * p; p = p === 9 ? 2 : p + 1; } const r = s % 11, dv = r < 2 ? 0 : 11 - r; if (dv !== +c[43] || !cnpjOk(c.slice(6, 20))) return null;
  return { chave: c, cnpj: fmtCnpj(c.slice(6, 20)), numero: String(+c.slice(25, 34)) };
}
async function qrDaNota(blob) {
  const img = await imagem(blob); let txt = '';
  if ('BarcodeDetector' in window) { try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(img); txt = r[0] ? r[0].rawValue : ''; } catch {} }
  if (!txt) { await carregaJs('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'); for (const lado of [1100, 1700]) { const e = Math.min(1, lado / Math.max(img.width, img.height)), c = telaDe(Math.round(img.width * e), Math.round(img.height * e)), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height), r = window.jsQR(d.data, c.width, c.height); if (r) { txt = r.data; break; } } }
  return txt ? dadosDaChave(txt) : null;
}
function campoDoTexto(txt) {
  const out = {}, ls = txt.split('\n').map((l) => l.trim()).filter(Boolean), vals = (s) => [...s.matchAll(/(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*[,.]\s*(\d{2})(?!\d)/g)].map((m) => +(m[1].replace(/\D/g, '') + '.' + m[2])).filter((v) => v > 0 && v < 1e6);
  const c = dadosDaChave(txt.replace(/[^\d\n]/g, (x) => (x === '\n' ? '\n' : '')).split('\n').join(' ')); if (c) Object.assign(out, c);
  if (!out.cnpj) for (const m of txt.matchAll(/\d{2}[.\s]?\d{3}[.\s]?\d{3}\s?[\/\\|]?\s?\d{4}\s?-?\s?\d{2}/g)) if (cnpjOk(m[0])) { out.cnpj = fmtCnpj(m[0]); break; }
  const d = txt.match(/\b(\d{2})[\/.-](\d{2})[\/.-](20\d{2})\b/); if (d && +d[2] <= 12 && +d[1] <= 31) { const iso = `${d[3]}-${d[2]}-${d[1]}`; if (iso <= hojeIso()) out.data = iso; }
  for (const re of [/valor\s+(a\s+)?pag/i, /total\s+(a\s+pagar|geral|da\s+nota|r\$)/i, /valor\s+total/i, /\btotal\b/i]) { const ix = ls.findIndex((x) => re.test(x) && !/sub\s*total|itens|tribut|desconto|troco|produtos/i.test(x)); if (ix >= 0) { const v = vals(ls[ix]).concat(vals(ls[ix + 1] || '')); if (v.length) { out.valor = v[0]; break; } } }
  const f = ls.slice(0, 8).find((x) => /[A-Za-zÀ-ú]{3}/.test(x) && !/cnpj|cupom|fiscal|danfe|nota|consumidor|documento|extrato|endere|rua |av\.|avenida|cep|\bie\b|inscri/i.test(x) && x.replace(/[^A-Za-zÀ-ú]/g, '').length > 5); if (f) out.fornecedor = f.replace(/[^\wÀ-ú&.,\-/ ]/g, '').trim().slice(0, 80);
  return out;
}
async function ocrNota(blob, prog) {
  let q = {}; try { q = (await qrDaNota(blob)) || {}; } catch {}
  await carregaJs('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const w = await window.Tesseract.createWorker('por', 1, { logger: (m) => { if (m.status === 'recognizing text') prog(m.progress); } });
  try { const { data } = await w.recognize(blob); return { ...campoDoTexto(data.text), ...q }; } finally { await w.terminate(); }
}
