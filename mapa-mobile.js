/* Mapa Mental no celular (até 760 px), no estilo do app Campo no iPhone:
   - topo enxuto: ← Mapas, nome do mapa e a nuvem; as outras ferramentas saem da barra de cima;
   - barra de abas embaixo: Mapas · Notas · [＋ novo tópico] · Feito · Mais;
   - "Mais" abre uma folha com o resto (irmão, renomear, ícone, cores, ligar, apagar, organizar, exportar, ajuda);
   - zoom: dois dedos na tela, ou os botões ＋ / − / ⤢ do canto direito (também no computador);
   - notas e anexos viram uma folha que sobe de baixo.
   Cada botão daqui só "aperta" o botão original do editor: nada muda na forma de salvar. */
(function(){
  const MQ = matchMedia('(max-width:760px)');
  const $ = (id) => document.getElementById(id);
  const css = `
  #zoomFab{position:fixed;right:12px;bottom:18px;z-index:13;display:flex;flex-direction:column;background:rgba(43,23,16,.92);border:1px solid #5a3424;border-radius:14px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.45)}
  #zoomFab button{all:unset;width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink);font-size:21px;cursor:pointer}
  #zoomFab button+button{border-top:1px solid #5a3424}
  #zoomFab button:hover{background:#4a2a1d}
  body:not(.emMapa) #zoomFab{display:none}
  #mTab,#mMais,#mFundo{display:none}
  @media (max-width:760px){
    :root{--tb:calc(62px + env(safe-area-inset-bottom,0px))}
    #bar{height:calc(52px + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);gap:8px;overflow:hidden;
      background:rgba(43,23,16,.88);-webkit-backdrop-filter:saturate(160%) blur(18px);backdrop-filter:saturate(160%) blur(18px)}
    #bar>*:not(#bBack):not(#mapTitle):not(#cloudBar):not(#bLoginBar){display:none!important}
    #bBack{height:38px;border-radius:12px;padding:0 12px}
    #mapTitle{flex:1;max-width:none;font-size:16px}
    #cloudBar{font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis}
    #stage{top:calc(52px + env(safe-area-inset-top,0px));bottom:var(--tb)}
    #zoomFab{bottom:calc(var(--tb) + 14px)}
    #help{left:10px;right:10px;bottom:calc(var(--tb) + 10px);max-width:none;max-height:55vh;overflow:auto;z-index:22}
    #toast{bottom:calc(var(--tb) + 14px)}
    #mTab{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:20;height:var(--tb);
      padding:6px 4px calc(4px + env(safe-area-inset-bottom,0px));background:rgba(43,23,16,.9);-webkit-backdrop-filter:saturate(160%) blur(20px);backdrop-filter:saturate(160%) blur(20px);border-top:1px solid #5a3424}
    #mTab button{all:unset;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--muted);font-size:10.5px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #mTab button .i{font-size:21px;line-height:1}
    #mTab button.on{color:var(--accent)}
    #mTab .novo .bola{width:48px;height:48px;border-radius:50%;background:var(--accent);color:#1d0f0a;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:300;margin-top:-16px;box-shadow:0 6px 16px -6px rgba(200,134,47,.8)}
    body.ro #mTab .so-ed{opacity:.35;pointer-events:none}
    #mFundo{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.45)}
    #mMais{position:fixed;left:0;right:0;bottom:0;z-index:31;background:#24130d;border-radius:22px 22px 0 0;padding:10px 14px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px -10px rgba(0,0,0,.7);max-height:82vh;overflow:auto}
    #mMais.ab,#mFundo.ab{display:block}
    #mMais .puxa{width:40px;height:5px;border-radius:3px;background:#5a3424;margin:0 auto 12px}
    #mMais h4{margin:6px 4px 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
    #mMais .grade{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
    #mMais .grade button{all:unset;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border-radius:16px;background:var(--panel);color:var(--ink);font-size:11.5px;font-weight:600;text-align:center;cursor:pointer}
    #mMais .grade button .i{font-size:22px;line-height:1}
    #mMais .cores{display:flex;gap:10px;justify-content:center;margin:2px 0 14px}
    #mMais .cores span{width:32px;height:32px;border-radius:50%;border:2px solid #0000}
    #mMais .fechar{all:unset;display:block;text-align:center;width:100%;padding:14px 0;border-radius:14px;background:var(--panel);font-weight:700;font-size:15px;color:var(--accent);cursor:pointer}
    body.ro #mMais .so-ed{display:none}
    /* notas e anexos: folha de baixo */
    #panel{top:auto;left:0;right:0;width:auto;bottom:0;max-height:72vh;border-left:none;border-top:1px solid #5a3424;border-radius:20px 20px 0 0;z-index:25;
      padding:20px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px -10px rgba(0,0,0,.7)}
    #panel::before{content:"";position:absolute;top:8px;left:50%;transform:translateX(-50%);width:40px;height:5px;border-radius:3px;background:#5a3424}
    .pop{top:auto!important;bottom:calc(var(--tb) + 10px);left:10px!important;right:10px;z-index:35}
    #iconPop{grid-template-columns:repeat(8,1fr)}
  }`;

  function montar(){
    if ($('mTab')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    // zoom (todas as telas)
    const zf = document.createElement('div'); zf.id = 'zoomFab';
    zf.innerHTML = '<button data-z="1.25" aria-label="Aproximar">＋</button><button data-z="0.8" aria-label="Afastar">−</button><button data-z="c" aria-label="Centralizar" style="font-size:18px">⤢</button>';
    document.body.appendChild(zf);
    zf.querySelectorAll('button').forEach((b) => b.onclick = () => (b.dataset.z === 'c' ? $('bCenter').click() : zoomEm(+b.dataset.z)));

    // barra de abas
    const tb = document.createElement('nav'); tb.id = 'mTab';
    tb.innerHTML = `<button data-t="mapas"><span class="i">🧠</span>Mapas</button>
      <button data-t="notas"><span class="i">📎</span>Notas</button>
      <button data-t="novo" class="novo so-ed"><span class="bola">＋</span>Novo</button>
      <button data-t="feito" class="so-ed"><span class="i">✓</span>Feito</button>
      <button data-t="mais"><span class="i">•••</span>Mais</button>`;
    document.body.appendChild(tb);

    // folha "Mais"
    const fundo = document.createElement('div'); fundo.id = 'mFundo';
    const mais = document.createElement('div'); mais.id = 'mMais'; mais.setAttribute('role', 'dialog');
    const it = (b, i, t, ed = true) => `<button data-b="${b}" class="${ed ? 'so-ed' : ''}"><span class="i">${i}</span>${t}</button>`;
    mais.innerHTML = `<div class="puxa"></div>
      <h4 class="so-ed">Tópico</h4><div class="grade so-ed">
        ${it('irmao', '↧', 'Novo irmão')}${it('bRename', '✏️', 'Renomear')}${it('bIcon', '😀', 'Ícone')}${it('bLink', '🔗', 'Ligar')}
        ${it('bDel', '🗑️', 'Apagar')}${it('copiar', '📋', 'Copiar', false)}${it('colar', '📥', 'Colar')}${it('dobrar', '⊟', 'Recolher', false)}
      </div>
      <h4 class="so-ed">Cor do ramo</h4><div class="cores so-ed" id="mCores"></div>
      <h4>Mapa</h4><div class="grade">
        ${it('bLayout', '🧩', 'Organizar')}${it('bCenter', '⤢', 'Centralizar', false)}${it('bPng', '🖼️', 'Imagem', false)}${it('bPdf', '📄', 'PDF', false)}
        ${it('bHelp', '❓', 'Atalhos', false)}
      </div>
      <button class="fechar">Fechar</button>`;
    document.body.append(fundo, mais);
    const fechar = () => { mais.classList.remove('ab'); fundo.classList.remove('ab'); };
    fundo.onclick = fechar; mais.querySelector('.fechar').onclick = fechar;
    PALETTE.forEach((c) => { const s = document.createElement('span'); s.style.background = c;
      s.onclick = () => { const n = byId(S.sel); if (!n) return toast('Toque num tópico primeiro'); n.color = c; render(); fechar(); }; $('mCores').appendChild(s); });
    mais.querySelectorAll('[data-b]').forEach((b) => b.onclick = (e) => {
      const a = b.dataset.b; fechar();
      if (a === 'irmao') return S.sel ? addSibling() : toast('Toque num tópico primeiro');
      if (a === 'copiar') return copyBranch();
      if (a === 'colar') return pasteBranch();
      if (a === 'dobrar') { const n = byId(S.sel); if (!n) return toast('Toque num tópico primeiro'); n.folded = !n.folded; return render(CAN_EDIT); }
      if (a === 'bIcon') { e.stopPropagation(); if (!S.sel) return toast('Toque num tópico primeiro'); $('iconPop').classList.remove('hidden'); return; }
      $(a)?.click();
    });

    tb.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const t = b.dataset.t;
      if (t === 'mapas') return $('bBack').click();
      if (t === 'notas') return $('bDetails').click();
      if (t === 'novo') { if (!S.sel) { const r = root(); if (r) S.sel = r.id; } return addChild(); }
      if (t === 'feito') return $('bDone').click();
      if (t === 'mais') { mais.classList.add('ab'); fundo.classList.add('ab'); }
    });

    // pinça com dois dedos: zoom em volta do meio dos dedos (cancela o arrasto do fundo)
    let pin = null;
    const st2 = $('stage');
    st2.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches, r = st2.getBoundingClientRect();
      pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k: S.view.k, x: S.view.x, y: S.view.y,
        mx: (a.clientX + b.clientX) / 2 - r.left, my: (a.clientY + b.clientY) / 2 - r.top };
      drag = null; st2.classList.remove('panning');
    }, { passive: true });
    st2.addEventListener('touchmove', (e) => {
      if (!pin || e.touches.length !== 2) return; e.preventDefault();
      const [a, b] = e.touches, r = st2.getBoundingClientRect();
      const k = Math.min(2.5, Math.max(0.15, pin.k * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d));
      const mx = (a.clientX + b.clientX) / 2 - r.left, my = (a.clientY + b.clientY) / 2 - r.top;
      S.view.x = mx - (pin.mx - pin.x) * k / pin.k; S.view.y = my - (pin.my - pin.y) * k / pin.k; S.view.k = k; applyView();
    }, { passive: false });
    st2.addEventListener('touchend', (e) => { if (pin && e.touches.length < 2) { pin = null; drag = null; saveView(); } });

    // mostra os botões de zoom só no editor e marca a aba ativa
    const sync = () => {
      document.body.classList.toggle('emMapa', !$('editor').classList.contains('hidden'));
      tb.querySelector('[data-t="notas"]').classList.toggle('on', !$('panel').classList.contains('hidden'));
      tb.style.display = $('editor').classList.contains('hidden') ? 'none' : '';
    };
    new MutationObserver(sync).observe($('editor'), { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(sync).observe($('panel'), { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  function zoomEm(f){
    const r = $('stage').getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
    const k = Math.min(2.5, Math.max(0.15, S.view.k * f));
    S.view.x = mx - (mx - S.view.x) * k / S.view.k; S.view.y = my - (my - S.view.y) * k / S.view.k; S.view.k = k; applyView(); saveView();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  MQ.addEventListener?.('change', () => {});
})();
