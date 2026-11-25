// ================= Produtividade: tela principal + seções =================
// Cada seção é guardada no mesmo banco dos mapas, como um registro especial (id "sec-...")
// cuja lista "nodes" são os itens da seção. Assim usa a mesma nuvem e a mesma senha.

const SECOES = {
  meta:   { nome: 'Missão',             sub: 'Tarefas do dia: marque o que foi feito.',               icone: '🎯', cor: '#d9534f' },
  trello: { nome: 'Gestão de Atividades da Obra', sub: 'Só as atividades da obra que está no Campo (Amaggi). Arraste os cartões entre as colunas.', icone: '📋', cor: '#5b9bd5' },
  contas: { nome: 'Contas Mensais', sub: 'Contas do mês, o que já foi pago e o custo fixo mensal do CNPJ. Só aparece para quem entrou com a senha.', icone: '💳', cor: '#4fb3a9' },
  notas:  { nome: 'Notas e Reembolso', sub: 'Foto da nota, quem pagou e o PDF para pedir o reembolso. Lançar não pede senha; ver as notas pede uma vez.', icone: '🧾', cor: '#e0b84a' },
  notion: { nome: 'Central de Organização', sub: 'Páginas de anotações, estilo Notion.',              icone: '🗂️', cor: '#a678c9' },
  lean:   { nome: 'Lean Construction',  sub: 'Materiais, PDFs e links de Lean Construction.',          icone: '🏗️', cor: '#6aa84f' },
};
const COLUNAS = [['fazer', 'A fazer'], ['fazendo', 'Fazendo'], ['feito', 'Feito']];
const OBRA_ATUAL = 'Amaggi';   // obra que está no app Campo; cartão sem obra = de antes (financiamento, marketing, site)
const daObra = (i) => !!i.obra;

const isSec = (m) => String(m.id).startsWith('sec-');
function secDoc(key, criar) {
  let d = DB.maps.find((m) => m.id === 'sec-' + key);
  if (!d && criar) { d = { id: 'sec-' + key, name: SECOES[key].nome, nodes: [], updated: Date.now() }; DB.maps.push(d); }
  return d;
}
const itens = (key) => ((secDoc(key) || {}).nodes || []);
function salvarSec(key) { const d = secDoc(key, true); d.updated = Date.now(); queueSave(d); }
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e[k] = v; else if (k === 'class') e.className = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  filhos.flat().forEach((f) => f != null && e.append(f));
  return e;
};
// Missão, Gestão, Notion e Lean só aparecem para quem entrou com a senha (no site publicado).
const fechado = () => !!CLOUD && !CAN_EDIT;
function pedeEdicao() { if (!CAN_EDIT) { if (typeof login === 'function') login(); else toast('Entre com a senha para editar'); return false; } return true; }

// ---------- tela principal ----------
function showHub() {
  CUR = null; showView('hub'); document.title = 'Produtividade';
  const nMapas = DB.maps.filter((m) => !isSec(m)).length;
  const meta = itens('meta'), tre = itens('trello').filter(daObra), pag = itens('notion'), lean = itens('lean');
  const cards = [
    ['#/mapas', '🧠', 'Mapa Mental', `${nMapas} mapa${nMapas === 1 ? '' : 's'}`, '#c8862f'],
    ['#/s/meta', SECOES.meta.icone, SECOES.meta.nome, `${meta.filter((i) => !i.done).length} pendente(s) · ${meta.filter((i) => i.done).length} feita(s)`, SECOES.meta.cor],
    ['#/s/trello', SECOES.trello.icone, 'Trello · ' + SECOES.trello.nome, COLUNAS.map(([c, n]) => `${n}: ${tre.filter((i) => i.col === c).length}`).join(' · '), SECOES.trello.cor],
    ['#/s/notion', SECOES.notion.icone, 'Notion · ' + SECOES.notion.nome, `${pag.length} página(s)`, SECOES.notion.cor],
    ['#/s/lean', SECOES.lean.icone, SECOES.lean.nome, `${lean.length} material(is)`, SECOES.lean.cor],
  ].map((c, i) => (i > 0 && fechado() ? [c[0], c[1], c[2], '🔒 Entre com a senha para ver', c[4]] : c)).concat([
    ['#/s/contas', SECOES.contas.icone, SECOES.contas.nome, CAN_EDIT ? resumoContasHub() : '🔒 Entre com a senha para ver', SECOES.contas.cor],
    ['#/s/notas', SECOES.notas.icone, SECOES.notas.nome, CAN_EDIT ? resumoNotasHub() : '📷 Tirar foto e lançar, sem senha', SECOES.notas.cor],
  ]);
  const g = $('hubGrid'); g.innerHTML = '';
  cards.forEach(([href, ic, nome, meta, cor]) => {
    const c = el('a', { class: 'card hubCard', href }, el('div', { class: 'hubIc' }, ic), el('h3', {}, nome), el('div', { class: 'meta' }, meta));
    c.style.setProperty('--c', cor); g.append(c);
  });
}

// ---------- seções ----------
function showSec(key) {
  CUR = null; showView('sec');
  const s = SECOES[key]; document.title = s.nome + ' · Produtividade';
  $('secTitle').textContent = s.icone + ' ' + s.nome; $('secSub').textContent = s.sub;
  const b = $('secBody'); b.innerHTML = ''; b.className = 'sec-' + key;
  if (fechado() && key !== 'notas') { b.append(el('div', { class: 'empty' }, '🔒 Esta parte é só para quem tem a senha.'), el('button', { class: 'pri', onclick: () => login() }, 'Entrar com a senha')); return; }
  ({ meta: renderMeta, trello: renderTrello, notion: renderNotion, lean: renderLean, contas: renderContas, notas: renderNotas })[key](b);
}
const rerender = (key) => { if (location.hash === '#/s/' + key) showSec(key); };

function campoNovo(placeholder, aoCriar) {
  const inp = el('input', { placeholder, maxlength: 300 });
  const ir = () => { const t = inp.value.trim(); if (!t) return inp.focus(); if (!pedeEdicao()) return; aoCriar(t); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') ir(); };
  return el('div', { class: 'newRow ed' }, inp, el('button', { class: 'pri', onclick: ir }, '+ Adicionar'));
}

// Missão (antiga Meta Diária): lista com caixinhas
function renderMeta(b) {
  const lista = itens('meta'); if (CAN_EDIT && CLOUD && !NOTAS && !notasErro) carregarNotas();
  b.append(campoNovo('Nova meta (ex.: Comprar parafusos em PVH)', (t) => { secDoc('meta', true).nodes.unshift({ id: novoId(), text: t, done: false, criado: Date.now() }); salvarSec('meta'); rerender('meta'); setTimeout(() => $('secBody').querySelector('input').focus()); }));
  const pend = lista.filter((i) => !i.done), feitas = lista.filter((i) => i.done);
  const linha = (i) => el('div', { class: 'item' + (i.done ? ' done' : '') },
    el('input', { type: 'checkbox', checked: i.done, disabled: !CAN_EDIT, onchange: () => { i.done = !i.done; i.feito = i.done ? Date.now() : null; salvarSec('meta'); rerender('meta'); } }),
    el('span', { class: 'txt', ondblclick: () => editarTexto(i, 'meta') }, i.text),
    el('span', { class: 'quando' }, new Date(i.criado || Date.now()).toLocaleDateString('pt-BR')),
    CLOUD ? el('button', { class: 'ed nMissao' + (notaDaMissao(i.id) ? ' tem' : ''), title: notaDaMissao(i.id) ? 'Abrir a nota desta compra' : 'Guardar a nota desta compra', onclick: () => abrirNotaDaMissao(i) }, notaDaMissao(i.id) ? '🧾 ' + BRL(notaDaMissao(i.id).valor) : '🧾') : null,
    el('button', { class: 'ed x', title: 'Apagar', onclick: () => apagar('meta', i) }, '✕'));
  b.append(el('h4', {}, `Pendentes (${pend.length})`), ...(pend.length ? pend.map(linha) : [el('div', { class: 'empty' }, 'Nada pendente. 🎉')]));
  if (feitas.length) b.append(el('h4', {}, `Feitas (${feitas.length})`, el('button', { class: 'ed mini', onclick: () => { if (!pedeEdicao() || !confirm('Apagar as ' + feitas.length + ' metas feitas?')) return; secDoc('meta').nodes = pend; salvarSec('meta'); rerender('meta'); } }, 'Limpar feitas')), ...feitas.map(linha));
}

// Trello: 3 colunas, arrastar e soltar
function renderTrello(b) {
  const fora = itens('trello').filter((i) => !daObra(i));
  if (fora.length) b.append(el('div', { class: 'aviso' },
    el('span', {}, `${fora.length} cartão(ões) não são da obra (financiamento, marketing, site). A Gestão de Atividades agora é só da obra ${OBRA_ATUAL}.`),
    el('button', { class: 'pri ed', onclick: () => {
      if (!pedeEdicao() || !confirm(`Mover os ${fora.length} cartões para a Missão? Os que estavam em "Feito" entram marcados como feitos.`)) return;
      const meta = secDoc('meta', true);
      fora.forEach((i) => meta.nodes.push({ id: novoId(), text: i.text, done: i.col === 'feito', criado: i.criado || Date.now(), feito: i.col === 'feito' ? Date.now() : null, deTrello: true }));
      secDoc('trello').nodes = itens('trello').filter(daObra);
      salvarSec('meta'); salvarSec('trello'); toast(`${fora.length} cartões movidos para a Missão`); rerender('trello');
    } }, 'Mover para a Missão')));
  b.append(campoNovo(`Nova atividade da obra ${OBRA_ATUAL} (entra em "A fazer")`, (t) => { secDoc('trello', true).nodes.push({ id: novoId(), text: t, col: 'fazer', obra: OBRA_ATUAL, criado: Date.now() }); salvarSec('trello'); rerender('trello'); setTimeout(() => $('secBody').querySelector('.newRow input').focus()); }));
  const quadro = el('div', { class: 'quadro' });
  const mover = (i, col) => { if (!pedeEdicao()) return; i.col = col; salvarSec('trello'); rerender('trello'); };
  COLUNAS.forEach(([col, nome], ci) => {
    const cards = itens('trello').filter((i) => daObra(i) && i.col === col);
    const coluna = el('div', { class: 'coluna', ondragover: (e) => { e.preventDefault(); coluna.classList.add('alvo'); }, ondragleave: () => coluna.classList.remove('alvo'),
      ondrop: (e) => { e.preventDefault(); const i = itens('trello').find((x) => x.id === e.dataTransfer.getData('text/plain')); if (i) mover(i, col); } },
      el('h4', {}, `${nome} (${cards.length})`));
    cards.forEach((i) => coluna.append(el('div', { class: 'cartao', draggable: CAN_EDIT ? 'true' : 'false', ondragstart: (e) => e.dataTransfer.setData('text/plain', i.id) },
      el('div', { class: 'txt', ondblclick: () => editarTexto(i, 'trello') }, i.text),
      el('div', { class: 'acoes ed' },
        ci > 0 ? el('button', { title: 'Voltar coluna', onclick: () => mover(i, COLUNAS[ci - 1][0]) }, '◀') : null,
        ci < 2 ? el('button', { title: 'Avançar coluna', onclick: () => mover(i, COLUNAS[ci + 1][0]) }, '▶') : null,
        el('button', { title: 'Apagar', onclick: () => apagar('trello', i) }, '✕')))));
    quadro.append(coluna);
  });
  b.append(quadro);
}

// Notion: páginas com título e texto
let paginaAberta = null;
function renderNotion(b) {
  const pags = itens('notion');
  if (!pags.find((p) => p.id === paginaAberta)) paginaAberta = pags[0] ? pags[0].id : null;
  const lado = el('div', { class: 'paginas' },
    el('button', { class: 'pri ed', onclick: () => { if (!pedeEdicao()) return; const p = { id: novoId(), title: 'Nova página', body: '', criado: Date.now() }; secDoc('notion', true).nodes.unshift(p); paginaAberta = p.id; salvarSec('notion'); rerender('notion'); setTimeout(() => { const t = $('secBody').querySelector('.pagTitulo'); t.focus(); t.select(); }); } }, '+ Nova página'),
    ...pags.map((p) => el('div', { class: 'pagItem' + (p.id === paginaAberta ? ' sel' : ''), onclick: () => { paginaAberta = p.id; rerender('notion'); } }, p.title || 'Sem título')));
  const p = pags.find((x) => x.id === paginaAberta);
  let t;
  const atualiza = () => { clearTimeout(t); t = setTimeout(() => { salvarSec('notion'); const it = $('secBody').querySelector('.pagItem.sel'); if (it) it.textContent = p.title || 'Sem título'; }, 600); };
  const editor = p ? el('div', { class: 'pagina' },
    el('input', { class: 'pagTitulo', value: p.title, readonly: !CAN_EDIT, oninput: (e) => { p.title = e.target.value; atualiza(); } }),
    el('textarea', { class: 'pagTexto', placeholder: 'Escreva aqui…', readonly: !CAN_EDIT, oninput: (e) => { p.body = e.target.value; atualiza(); } }, p.body || ''),
    el('div', { class: 'ed', style: 'text-align:right' }, el('button', { onclick: () => apagar('notion', p, 'a página "' + (p.title || 'Sem título') + '"') }, 'Apagar página')))
    : el('div', { class: 'empty' }, 'Nenhuma página ainda.' + (CAN_EDIT ? ' Clique em "+ Nova página".' : ''));
  b.append(el('div', { class: 'notion' }, lado, editor));
}

// Lean Construction: biblioteca de links e arquivos (PDFs)
function renderLean(b) {
  const lista = itens('lean');
  const add = (m) => { secDoc('lean', true).nodes.unshift({ id: novoId(), criado: Date.now(), ...m }); salvarSec('lean'); rerender('lean'); };
  const inpArq = el('input', { type: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg' });
  inpArq.onchange = async () => {
    const f = inpArq.files[0]; inpArq.value = ''; if (!f) return;
    if (f.size > 4 * 1024 * 1024) return toast('Arquivo maior que 4 MB');
    toast('Enviando ' + f.name + '…');
    try {
      const r = await fetch('/api/anexo', { method: 'POST', headers: { 'x-senha': SENHA, 'x-nome': encodeURIComponent(f.name), 'x-tipo': f.type || '', 'Content-Type': 'application/octet-stream' }, body: f });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || r.status);
      add({ tipo: 'arquivo', nome: f.name, url: j.url }); toast('Arquivo adicionado');
    } catch (e) { toast('Falhou: ' + e.message); }
  };
  b.append(el('div', { class: 'newRow ed' },
    el('button', { class: 'pri', onclick: () => { if (!pedeEdicao()) return; let url = prompt('Cole o link:'); if (!url) return; url = url.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url; add({ tipo: 'link', nome: prompt('Nome do link:', url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)) || url, url }); } }, '🔗 Adicionar link'),
    el('button', { onclick: () => { if (!pedeEdicao()) return; if (!(CLOUD && CLOUD.anexos)) return toast('Envio de arquivos só funciona no site publicado'); inpArq.click(); } }, '📄 Enviar PDF/arquivo (até 4 MB)'), inpArq));
  if (!lista.length) b.append(el('div', { class: 'empty' }, 'Nenhum material ainda.'));
  lista.forEach((i) => b.append(el('div', { class: 'item' },
    el('span', {}, i.tipo === 'arquivo' ? '📄' : '🔗'),
    el('a', { class: 'txt', href: i.url, target: '_blank', rel: 'noopener' }, i.nome || i.url),
    el('span', { class: 'quando' }, new Date(i.criado || Date.now()).toLocaleDateString('pt-BR')),
    el('button', { class: 'ed x', title: 'Remover', onclick: () => apagar('lean', i, '"' + (i.nome || i.url) + '"') }, '✕'))));
}

// Contas Mensais: guardadas à parte (/api/contas), só com a senha. Nada disso vai para a lista pública dos mapas.
//   fixos:   [{id, nome, valor, dia, cat}]  -> custo fixo mensal do CNPJ; entram em todo mês
//   avulsas: [{id, mes:'2026-11', nome, valor, venc:'2026-11-10', cat}]
//   pagos:   {'2026-11': {idDaConta: {em:'2026-11-08', valor}}}
let CONTAS = null, contasErro = '', contasMes = new Date().toISOString().slice(0, 7), contasT = null;
const BRL = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeIso = () => new Date().toLocaleDateString('sv-SE');
const nomeMes = (m) => { const [a, mm] = m.split('-').map(Number); const t = new Date(a, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const somaMes = (m, d) => { const [a, mm] = m.split('-').map(Number); const x = new Date(a, mm - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const lerValor = (t) => { const v = parseFloat(String(t || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(v) ? Math.round(v * 100) / 100 : null; };
async function carregarContas() {
  try { const r = await fetch('/api/contas', { headers: { 'x-senha': SENHA }, cache: 'no-store' }); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status); CONTAS = j.dados; contasErro = ''; }
  catch (e) { contasErro = e.message; }
  if (location.hash === '#/s/contas') rerender('contas'); else if (!CUR && location.hash.replace('#', '') in { '': 1, '/': 1 }) showHub();
}
function salvarContas() {
  clearTimeout(contasT);
  contasT = setTimeout(async () => {
    try { const r = await fetch('/api/contas', { method: 'PUT', headers: { 'x-senha': SENHA, 'Content-Type': 'application/json' }, body: JSON.stringify({ dados: CONTAS }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.status); }
    catch (e) { toast('Não salvou as contas: ' + e.message); }
  }, 500);
}
function contasDoMes(m) {
  const [a, mm] = m.split('-').map(Number), ult = new Date(a, mm, 0).getDate(), pg = CONTAS.pagos[m] || {};
  const lista = [
    ...CONTAS.fixos.filter((f) => !f.desde || f.desde <= m).map((f) => ({ ...f, fixo: true, venc: `${m}-${String(Math.min(ult, +f.dia || 1)).padStart(2, '0')}` })),
    ...CONTAS.avulsas.filter((x) => x.mes === m),
  ].map((c) => ({ ...c, pago: pg[c.id] || null }));
  return lista.sort((x, y) => (!!x.pago - !!y.pago) || x.venc.localeCompare(y.venc));
}
function resumoContasHub() {
  if (!CONTAS) { if (!contasErro) carregarContas(); return contasErro ? '⚠️ ' + contasErro : 'Carregando…'; }
  const m = new Date().toISOString().slice(0, 7), l = contasDoMes(m), ab = l.filter((c) => !c.pago), venc = ab.filter((c) => c.venc < hojeIso());
  return `${ab.length} a pagar (${BRL(ab.reduce((s, c) => s + (+c.valor || 0), 0))})` + (venc.length ? ` · ⚠️ ${venc.length} vencida(s)` : '');
}
function renderContas(b) {
  if (!CAN_EDIT) { b.append(el('div', { class: 'empty' }, '🔒 As contas são só para quem tem a senha. '), el('button', { class: 'pri', onclick: () => login() }, 'Entrar com a senha')); return; }
  if (!CONTAS) { b.append(el('div', { class: 'empty' }, contasErro ? '⚠️ ' + contasErro : 'Carregando as contas…')); if (!contasErro) carregarContas(); else b.append(el('button', { onclick: () => { contasErro = ''; carregarContas(); rerender('contas'); } }, 'Tentar de novo')); return; }
  const m = contasMes, lista = contasDoMes(m), hoje = hojeIso();
  const tot = lista.reduce((s, c) => s + (+c.valor || 0), 0), pago = lista.filter((c) => c.pago).reduce((s, c) => s + (+c.pago.valor || +c.valor || 0), 0);
  const abertas = lista.filter((c) => !c.pago), vencidas = abertas.filter((c) => c.venc < hoje);
  const ir = (d) => { contasMes = somaMes(contasMes, d); rerender('contas'); };
  b.append(el('div', { class: 'mesNav' }, el('button', { onclick: () => ir(-1) }, '‹'), el('h3', {}, nomeMes(m)), el('button', { onclick: () => ir(1) }, '›'),
    m !== new Date().toISOString().slice(0, 7) ? el('button', { class: 'mini', onclick: () => { contasMes = new Date().toISOString().slice(0, 7); rerender('contas'); } }, 'Hoje') : null));
  const box = (t, v, cls) => el('div', { class: 'kpi ' + (cls || '') }, el('small', {}, t), el('b', {}, v));
  b.append(el('div', { class: 'kpis' }, box('Total do mês', BRL(tot)), box('Pago', BRL(pago), 'ok'), box('A pagar', BRL(tot - pago), abertas.length ? 'warn' : 'ok'),
    box('Vencidas', vencidas.length ? `${vencidas.length} · ${BRL(vencidas.reduce((s, c) => s + (+c.valor || 0), 0))}` : 'nenhuma', vencidas.length ? 'bad' : 'ok')));

  // conta avulsa do mês
  const iNome = el('input', { placeholder: 'Conta (ex.: Fornecedor de parafusos)', maxlength: 120 });
  const iVal = el('input', { placeholder: 'Valor (R$)', inputmode: 'decimal', style: 'max-width:130px;min-width:110px' });
  const iVenc = el('input', { type: 'date', value: hoje.slice(0, 7) === m ? hoje : `${m}-10`, style: 'max-width:160px;min-width:140px' });
  const addAvulsa = () => { const v = lerValor(iVal.value); if (!iNome.value.trim()) return iNome.focus(); if (v == null) return iVal.focus();
    CONTAS.avulsas.push({ id: novoId(), mes: iVenc.value.slice(0, 7) || m, nome: iNome.value.trim(), valor: v, venc: iVenc.value || `${m}-10` }); salvarContas(); rerender('contas'); };
  [iNome, iVal].forEach((x) => x.onkeydown = (e) => { if (e.key === 'Enter') addAvulsa(); });
  b.append(el('h4', {}, `Contas de ${nomeMes(m)} (${lista.length})`), el('div', { class: 'newRow' }, iNome, iVal, iVenc, el('button', { class: 'pri', onclick: addAvulsa }, '+ Conta do mês')));
  if (!lista.length) b.append(el('div', { class: 'empty' }, 'Nenhuma conta neste mês. Cadastre o custo fixo do CNPJ abaixo ou uma conta do mês acima.'));
  lista.forEach((c) => {
    const venc = !c.pago && c.venc < hoje, dv = c.venc.slice(8, 10) + '/' + c.venc.slice(5, 7);
    b.append(el('div', { class: 'item conta' + (c.pago ? ' done' : '') + (venc ? ' vencida' : '') },
      el('input', { type: 'checkbox', checked: !!c.pago, title: c.pago ? 'Desmarcar pagamento' : 'Marcar como paga', onchange: () => {
        const pg = CONTAS.pagos[m] = CONTAS.pagos[m] || {};
        if (pg[c.id]) delete pg[c.id]; else pg[c.id] = { em: hoje, valor: +c.valor || 0 };
        salvarContas(); rerender('contas'); } }),
      el('span', { class: 'txt' }, c.nome, c.fixo ? el('span', { class: 'tag' }, 'fixo CNPJ') : null),
      el('span', { class: 'quando' }, c.pago ? `pago ${c.pago.em.slice(8, 10)}/${c.pago.em.slice(5, 7)}` : (venc ? '⚠️ venceu ' : 'vence ') + dv),
      el('b', { class: 'valor' }, BRL(c.valor)),
      c.fixo ? null : el('button', { class: 'x', title: 'Apagar esta conta', onclick: () => { if (!confirm(`Apagar a conta "${c.nome}"?`)) return; CONTAS.avulsas = CONTAS.avulsas.filter((x) => x.id !== c.id); if (CONTAS.pagos[m]) delete CONTAS.pagos[m][c.id]; salvarContas(); rerender('contas'); } }, '✕')));
  });

  // custo fixo mensal do CNPJ
  const totFixo = CONTAS.fixos.reduce((s, f) => s + (+f.valor || 0), 0);
  const fNome = el('input', { placeholder: 'Custo fixo (ex.: Contador, aluguel, DAS, internet)', maxlength: 120 });
  const fVal = el('input', { placeholder: 'Valor (R$)', inputmode: 'decimal', style: 'max-width:130px;min-width:110px' });
  const fDia = el('input', { placeholder: 'Dia', inputmode: 'numeric', maxlength: 2, style: 'max-width:70px;min-width:60px' });
  const addFixo = () => { const v = lerValor(fVal.value), d = Math.min(31, Math.max(1, parseInt(fDia.value, 10) || 10));
    if (!fNome.value.trim()) return fNome.focus(); if (v == null) return fVal.focus();
    CONTAS.fixos.push({ id: novoId(), nome: fNome.value.trim(), valor: v, dia: d, desde: m }); salvarContas(); rerender('contas'); };
  [fNome, fVal, fDia].forEach((x) => x.onkeydown = (e) => { if (e.key === 'Enter') addFixo(); });
  b.append(el('h4', {}, `Custo fixo mensal do CNPJ · ${BRL(totFixo)} por mês`),
    el('div', { class: 'newRow' }, fNome, fVal, fDia, el('button', { class: 'pri', onclick: addFixo }, '+ Custo fixo')));
  if (!CONTAS.fixos.length) b.append(el('div', { class: 'empty' }, 'Nenhum custo fixo ainda. Cadastre uma vez: ele entra sozinho em todo mês, a partir do mês em que foi criado.'));
  [...CONTAS.fixos].sort((x, y) => x.dia - y.dia).forEach((f) => b.append(el('div', { class: 'item' },
    el('span', { class: 'quando', style: 'min-width:54px' }, `dia ${f.dia}`),
    el('span', { class: 'txt' }, f.nome),
    el('b', { class: 'valor' }, BRL(f.valor)),
    el('button', { class: 'x', title: 'Mudar o valor', onclick: () => { const v = lerValor(prompt(`Novo valor de "${f.nome}" (R$):`, String(f.valor).replace('.', ','))); if (v == null) return; f.valor = v; salvarContas(); rerender('contas'); } }, '✎'),
    el('button', { class: 'x', title: 'Tirar do custo fixo', onclick: () => { if (!confirm(`Tirar "${f.nome}" do custo fixo? Os pagamentos já marcados continuam no histórico.`)) return; CONTAS.fixos = CONTAS.fixos.filter((x) => x !== f); salvarContas(); rerender('contas'); } }, '✕'))));
}

// ---------- ações comuns ----------
function apagar(key, i, oque) {
  if (!pedeEdicao()) return;
  if (oque && !confirm('Apagar ' + oque + '?')) return;
  const d = secDoc(key); d.nodes = d.nodes.filter((x) => x !== i); salvarSec(key); rerender(key);
}
function editarTexto(i, key) {
  if (!CAN_EDIT) return;
  const n = prompt('Editar:', i.text); if (n == null || !n.trim()) return;
  i.text = n.trim(); salvarSec(key); rerender(key);
}

boot();
