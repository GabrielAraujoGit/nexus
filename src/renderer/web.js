'use strict';
// NEXUS — janela flutuante do mini navegador. A página em si é uma view do processo principal,
// posicionada sobre #web-slot. Vive como aba no hub do centro (hub.js); o floatwin.js só reposiciona a view.
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
  const hub = window.NexusHub;
  let host = '';

  // A moldura cuida de posicionar a view nativa sobre o slot; aqui ela fica sempre encaixada no hub.
  const frame = window.NexusFloat({
    box,
    bar: $('web-bar'),
    slot,
    bounds: (rect) => api.bounds(rect),
    front: () => api.front(),
  });

  function closeWeb() {
    api.close();
    box.hidden = true;
    frame.refresh();
    hub.remove('web');
  }

  hub.register('web', {
    label: () => ['Web', host],
    title: 'NAVEGADOR',
    show(on) {
      box.hidden = !on;
      frame.refresh();
    },
    focus() {
      if (hasPage) api.focus();
      else input.focus();
    },
    close: closeWeb,
    go(url) {
      input.value = url;
      api.open(url);
    },
  });

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
      hub.refresh();
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
