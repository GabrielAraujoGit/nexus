'use strict';
// NEXUS — janela flutuante do mini navegador. A página em si é uma view do processo principal,
// posicionada sobre #web-slot; a moldura (arrastar, abrir/fechar) vem do floatwin.js. Pode flutuar ou ficar
// encaixada no hub do centro (hub.js), no lugar do terminal; a escolha fica salva.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.nexus.web;
  const slot = $('web-slot');
  const input = $('web-url');
  const status = $('web-status');
  let hasPage = false;
  let wasLoading = false;
  const sound = window.NexusSound;

  const box = $('web');
  const btn = $('web-btn');
  const dockBtn = $('web-dock');
  const hub = window.NexusHub;
  const home = { parent: box.parentNode, next: box.nextSibling }; // lugar da janela flutuante no DOM
  let docked = false;
  try { docked = localStorage.getItem('nexus.web.dock') === 'on'; } catch { /* padrão: flutuante */ }
  let host = '';

  const frame = window.NexusFloat({
    box,
    bar: $('web-bar'),
    slot,
    bounds: (rect) => api.bounds(rect),
    front: () => api.front(),
    onOpen: () => { if (!hasPage) input.focus(); },
  });

  // ---------- Flutuante ou encaixado no hub ----------
  const isOpen = () => (docked ? hub.isOpen('web') : frame.isOpen());
  const paintBtn = () => btn.setAttribute('aria-pressed', String(isOpen()));

  function place() {
    if (docked) $('term-frame').append(box);
    else home.parent.insertBefore(box, home.next);
    box.classList.toggle('docked', docked);
    dockBtn.innerHTML = docked ? '&#8689; Soltar' : '&#8690; Encaixar';
    dockBtn.title = docked ? 'Solta o navegador numa janela flutuante' : 'Encaixa o navegador no lugar do terminal, como uma aba';
  }

  hub.register('web', {
    label: () => ['Web', host],
    title: 'NAVEGADOR',
    show(on) {
      if (!docked) return;
      box.hidden = !on;
      frame.refresh();
    },
    focus() {
      if (hasPage) api.focus();
      else input.focus();
    },
    close: () => closeWeb(),
  });
  hub.onChange(paintBtn);

  function openWeb() {
    if (docked) {
      hub.add('web');
      hub.activate('web');
      sound.play('open');
    } else {
      frame.show(true);
    }
    paintBtn();
  }

  function closeWeb() {
    api.close();
    if (docked) {
      box.hidden = true;
      frame.refresh();
      hub.remove('web');
      sound.play('close');
    } else {
      frame.show(false);
    }
    paintBtn();
  }

  // Botão Web da barra: fechado → abre; encaixado atrás de outra aba → vem para a frente; na frente → volta ao shell.
  btn.addEventListener('click', () => {
    if (!isOpen()) openWeb();
    else if (!docked) { frame.show(false); paintBtn(); } else if (hub.active() !== 'web') hub.activate('web');
    else if (hub.isOpen('shell')) hub.activate('shell');
    else hub.showShell();
  });

  dockBtn.addEventListener('click', () => {
    if (docked) { // soltar: vira janela flutuante, com a mesma página
      hub.remove('web');
      docked = false;
      place();
      box.hidden = false;
    } else {
      box.classList.remove('opening', 'closing');
      docked = true;
      place();
      hub.add('web');
      hub.activate('web');
    }
    try { localStorage.setItem('nexus.web.dock', docked ? 'on' : 'off'); } catch { /* ignora */ }
    frame.refresh();
    paintBtn();
    sound.play('toggle');
  });
  place();

  // ---------- Controles ----------
  $('web-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    api.open(input.value);
    input.blur();
  });
  input.addEventListener('focus', () => input.select());
  $('web-back').addEventListener('click', () => api.nav('back'));
  $('web-fwd').addEventListener('click', () => api.nav('forward'));
  $('web-reload').addEventListener('click', () => api.nav(status.dataset.loading === '1' ? 'stop' : 'reload'));
  // Bloqueador: ligado por padrão; a escolha fica salva neste computador.
  const adBtn = $('web-adblock');
  let adblock = true;
  try { adblock = localStorage.getItem('nexus.adblock') !== 'off'; } catch { /* sem localStorage: ligado */ }
  const paintAdblock = () => {
    adBtn.setAttribute('aria-pressed', String(adblock));
    adBtn.title = adblock ? 'Bloqueando anúncios e rastreadores no navegador e na música (clique para desligar)' : 'Bloqueador desligado (clique para ligar)';
  };
  paintAdblock();
  api.adblock(adblock);
  adBtn.addEventListener('click', () => {
    adblock = !adblock;
    try { localStorage.setItem('nexus.adblock', adblock ? 'on' : 'off'); } catch { /* ignora */ }
    paintAdblock();
    api.adblock(adblock);
    sound.play('toggle');
  });
  const blockedEl = $('web-blocked');

  $('web-close').addEventListener('click', closeWeb);

  // Modo de capturas: a página chega como imagem e é desenhada dentro da moldura.
  api.onSnapshot((dataUrl) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) return;
    const img = document.createElement('img');
    img.className = 'web-shot';
    img.alt = '';
    img.src = dataUrl;
    slot.replaceChildren(img);
  });

  // ---------- Estado vindo da página ----------
  api.onState((s) => {
    slot.classList.toggle('has-page', !s.closed);
    blockedEl.textContent = !s.closed && s.adblock && s.blocked ? `${s.blocked} bloqueados` : '';
    if (s.closed) {
      hasPage = false;
      frame.setHasPage(false);
      if (!s.error) input.value = '';
      if (s.error) sound.play('error');
      wasLoading = false;
      status.textContent = s.error ? `Erro: ${s.error}` : 'Pronto';
      status.dataset.loading = '0';
      $('web-back').disabled = true;
      $('web-fwd').disabled = true;
      return;
    }
    hasPage = true;
    frame.setHasPage(true); // primeira página: posiciona a view
    let h = '';
    try { h = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* sem URL ainda */ }
    if (h !== host) {
      host = h;
      if (docked) hub.refresh();
    }
    if (document.activeElement !== input && s.url) input.value = s.url;
    $('web-back').disabled = !s.canBack;
    $('web-fwd').disabled = !s.canForward;
    status.dataset.loading = s.loading ? '1' : '0';
    $('web-reload').textContent = s.loading ? '✕' : '⟳';
    $('web-reload').setAttribute('aria-label', s.loading ? 'Parar' : 'Recarregar');
    if (s.error) sound.play('error');
    else if (wasLoading && !s.loading) sound.play('loaded');
    wasLoading = s.loading;
    if (s.error) status.textContent = `Erro: ${s.error}`;
    else status.textContent = s.loading ? 'Carregando…' : (s.title || s.url || 'Pronto');
  });
})();
