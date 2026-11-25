'use strict';
// NEXUS — janela flutuante do mini navegador. A página em si é uma view do processo principal,
// posicionada sobre #web-slot; aqui só cuidamos da moldura: arrastar, redimensionar, barra e estado.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.nexus.web;
  const box = $('web');
  const slot = $('web-slot');
  const input = $('web-url');
  const status = $('web-status');
  const toggle = $('web-btn');
  let hasPage = false;
  let animating = false; // durante a animação a view nativa fica escondida (ela não anima)
  const sound = window.NexusSound;
  const noMotion = () => document.documentElement.classList.contains('snapshot')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sync() {
    if (box.hidden || !hasPage || animating) {
      api.bounds(null);
      return;
    }
    const r = slot.getBoundingClientRect();
    api.bounds({ x: r.left, y: r.top, width: r.width, height: r.height });
  }

  // Abre/fecha como um monitor CRT ligando e desligando.
  function show(visible) {
    const isOpen = !box.hidden && !box.classList.contains('closing');
    if (visible === isOpen) return;
    toggle.setAttribute('aria-pressed', String(visible));
    sound.play(visible ? 'open' : 'close');
    box.classList.remove('opening', 'closing');
    if (visible) {
      box.hidden = false;
      clamp();
      if (!hasPage) input.focus();
    }
    if (noMotion()) {
      box.hidden = !visible;
      animating = false;
      sync();
      return;
    }
    animating = true;
    sync();
    void box.offsetWidth; // reinicia a animação
    box.classList.add(visible ? 'opening' : 'closing');
  }
  box.addEventListener('animationend', (e) => {
    if (e.target !== box) return;
    if (box.classList.contains('closing')) box.hidden = true;
    box.classList.remove('opening', 'closing');
    animating = false;
    sync();
  });

  // Mantém a janela dentro da tela (depois de arrastar ou redimensionar o app).
  function clamp() {
    const r = box.getBoundingClientRect();
    const left = Math.min(Math.max(r.left, 0), Math.max(window.innerWidth - r.width, 0));
    const top = Math.min(Math.max(r.top, 0), Math.max(window.innerHeight - r.height, 0));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.right = 'auto';
  }

  // ---------- Arrastar pela barra ----------
  const bar = $('web-bar');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    box.style.left = `${e.clientX - drag.dx}px`;
    box.style.top = `${e.clientY - drag.dy}px`;
    box.style.right = 'auto';
    clamp();
    sync();
  });
  const endDrag = () => { drag = null; };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  new ResizeObserver(() => sync()).observe(slot);
  window.addEventListener('resize', () => {
    if (!box.hidden) { clamp(); sync(); }
  });

  // ---------- Controles ----------
  toggle.addEventListener('click', () => show(box.hidden));
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
  $('web-close').addEventListener('click', () => {
    api.close();
    show(false);
  });

  // ---------- Estado vindo da página ----------
  api.onState((s) => {
    slot.classList.toggle('has-page', !s.closed);
    if (s.closed) {
      hasPage = false;
      if (!s.error) input.value = '';
      status.textContent = s.error ? `ERRO: ${s.error}` : 'PRONTO';
      status.dataset.loading = '0';
      $('web-back').disabled = true;
      $('web-fwd').disabled = true;
      return;
    }
    if (!hasPage) {
      hasPage = true;
      sync(); // primeira página: posiciona a view
    }
    if (document.activeElement !== input && s.url) input.value = s.url;
    $('web-back').disabled = !s.canBack;
    $('web-fwd').disabled = !s.canForward;
    status.dataset.loading = s.loading ? '1' : '0';
    $('web-reload').textContent = s.loading ? '✕' : '⟳';
    $('web-reload').setAttribute('aria-label', s.loading ? 'Parar' : 'Recarregar');
    if (s.error) status.textContent = `ERRO: ${s.error}`;
    else status.textContent = s.loading ? 'CARREGANDO…' : (s.title || s.url || 'PRONTO');
  });
})();
