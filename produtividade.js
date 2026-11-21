// ================= Produtividade: tela principal + seções =================
// Cada seção é guardada no mesmo banco dos mapas, como um registro especial (id "sec-...")
// cuja lista "nodes" são os itens da seção. Assim usa a mesma nuvem e a mesma senha.

const SECOES = {
  meta:   { nome: 'Meta Diária',        sub: 'Tarefas do dia: marque o que foi feito.',               icone: '🎯', cor: '#d9534f' },
  trello: { nome: 'Gestão de Atividades', sub: 'Quadro estilo Trello: arraste os cartões entre as colunas.', icone: '📋', cor: '#5b9bd5' },
  notion: { nome: 'Central de Organização', sub: 'Páginas de anotações, estilo Notion.',              icone: '🗂️', cor: '#a678c9' },
  lean:   { nome: 'Lean Construction',  sub: 'Materiais, PDFs e links de Lean Construction.',          icone: '🏗️', cor: '#6aa84f' },
};
const COLUNAS = [['fazer', 'A fazer'], ['fazendo', 'Fazendo'], ['feito', 'Feito']];

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
function pedeEdicao() { if (!CAN_EDIT) { toast('Entre com a senha para editar'); return false; } return true; }

// ---------- tela principal ----------
function showHub() {
  CUR = null; showView('hub'); document.title = 'Produtividade';
  const nMapas = DB.maps.filter((m) => !isSec(m)).length;
  const meta = itens('meta'), tre = itens('trello'), pag = itens('notion'), lean = itens('lean');
  const cards = [
    ['#/mapas', '🧠', 'Mapa Mental', `${nMapas} mapa${nMapas === 1 ? '' : 's'}`, '#c8862f'],
    ['#/s/meta', SECOES.meta.icone, SECOES.meta.nome, `${meta.filter((i) => !i.done).length} pendente(s) · ${meta.filter((i) => i.done).length} feita(s)`, SECOES.meta.cor],
    ['#/s/trello', SECOES.trello.icone, 'Trello · ' + SECOES.trello.nome, COLUNAS.map(([c, n]) => `${n}: ${tre.filter((i) => i.col === c).length}`).join(' · '), SECOES.trello.cor],
    ['#/s/notion', SECOES.notion.icone, 'Notion · ' + SECOES.notion.nome, `${pag.length} página(s)`, SECOES.notion.cor],
    ['#/s/lean', SECOES.lean.icone, SECOES.lean.nome, `${lean.length} material(is)`, SECOES.lean.cor],
  ];
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
  ({ meta: renderMeta, trello: renderTrello, notion: renderNotion, lean: renderLean })[key](b);
}
const rerender = (key) => { if (location.hash === '#/s/' + key) showSec(key); };

function campoNovo(placeholder, aoCriar) {
  const inp = el('input', { placeholder, maxlength: 300 });
  const ir = () => { const t = inp.value.trim(); if (!t) return inp.focus(); if (!pedeEdicao()) return; aoCriar(t); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') ir(); };
  return el('div', { class: 'newRow ed' }, inp, el('button', { class: 'pri', onclick: ir }, '+ Adicionar'));
}

// Meta Diária: lista com caixinhas
function renderMeta(b) {
  const lista = itens('meta');
  b.append(campoNovo('Nova meta (ex.: Comprar parafusos em PVH)', (t) => { secDoc('meta', true).nodes.unshift({ id: novoId(), text: t, done: false, criado: Date.now() }); salvarSec('meta'); rerender('meta'); setTimeout(() => $('secBody').querySelector('input').focus()); }));
  const pend = lista.filter((i) => !i.done), feitas = lista.filter((i) => i.done);
  const linha = (i) => el('div', { class: 'item' + (i.done ? ' done' : '') },
    el('input', { type: 'checkbox', checked: i.done, disabled: !CAN_EDIT, onchange: () => { i.done = !i.done; i.feito = i.done ? Date.now() : null; salvarSec('meta'); rerender('meta'); } }),
    el('span', { class: 'txt', ondblclick: () => editarTexto(i, 'meta') }, i.text),
    el('span', { class: 'quando' }, new Date(i.criado || Date.now()).toLocaleDateString('pt-BR')),
    el('button', { class: 'ed x', title: 'Apagar', onclick: () => apagar('meta', i) }, '✕'));
  b.append(el('h4', {}, `Pendentes (${pend.length})`), ...(pend.length ? pend.map(linha) : [el('div', { class: 'empty' }, 'Nada pendente. 🎉')]));
  if (feitas.length) b.append(el('h4', {}, `Feitas (${feitas.length})`, el('button', { class: 'ed mini', onclick: () => { if (!pedeEdicao() || !confirm('Apagar as ' + feitas.length + ' metas feitas?')) return; secDoc('meta').nodes = pend; salvarSec('meta'); rerender('meta'); } }, 'Limpar feitas')), ...feitas.map(linha));
}

// Trello: 3 colunas, arrastar e soltar
function renderTrello(b) {
  b.append(campoNovo('Nova atividade (entra em "A fazer")', (t) => { secDoc('trello', true).nodes.push({ id: novoId(), text: t, col: 'fazer', criado: Date.now() }); salvarSec('trello'); rerender('trello'); setTimeout(() => $('secBody').querySelector('input').focus()); }));
  const quadro = el('div', { class: 'quadro' });
  const mover = (i, col) => { if (!pedeEdicao()) return; i.col = col; salvarSec('trello'); rerender('trello'); };
  COLUNAS.forEach(([col, nome], ci) => {
    const cards = itens('trello').filter((i) => i.col === col);
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
