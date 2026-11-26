'use strict';
// NEXUS — moldura das janelas flutuantes (mini navegador e música). O conteúdo é uma view nativa do processo
// principal posicionada sobre o "slot"; aqui ficam abrir/fechar como CRT, arrastar, manter na tela,
// trazer para a frente e avisar a posição.
(function () {
  const RECORD = new URLSearchParams(location.search).has('record');
  const noMotion = () => (document.documentElement.classList.contains('snapshot') && !RECORD)
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let top = 30; // z-index da janela da frente

  // opts: { box, bar, slot, toggle, bounds(rect|null), front(), onOpen() }
  window.NexusFloat = function (opts) {
    const { box, bar, slot, toggle } = opts;
    const sound = window.NexusSound;
    let hasPage = false;
    let animating = false; // durante a animação a view nativa fica escondida (ela não anima)

    function sync() {
      if (box.hidden || !hasPage || animating) {
        opts.bounds(null);
        return;
      }
      const r = slot.getBoundingClientRect();
      opts.bounds({ x: r.left, y: r.top, width: r.width, height: r.height });
    }

    // Mantém a janela dentro da tela (depois de arrastar ou redimensionar o app).
    function clamp() {
      const r = box.getBoundingClientRect();
      const left = Math.min(Math.max(r.left, 0), Math.max(window.innerWidth - r.width, 0));
      const y = Math.min(Math.max(r.top, 0), Math.max(window.innerHeight - r.height, 0));
      box.style.left = `${left}px`;
      box.style.top = `${y}px`;
      box.style.right = 'auto';
    }

    function raise() {
      if (Number(box.style.zIndex) === top) return;
      top += 1;
      box.style.zIndex = String(top);
      opts.front?.();
    }

    const isOpen = () => !box.hidden && !box.classList.contains('closing');

    // Abre/fecha como um monitor CRT ligando e desligando.
    function show(visible) {
      if (visible === isOpen()) return;
      toggle.setAttribute('aria-pressed', String(visible));
      sound.play(visible ? 'open' : 'close');
      box.classList.remove('opening', 'closing');
      if (visible) {
        box.hidden = false;
        clamp();
        raise();
        opts.onOpen?.();
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
    box.addEventListener('pointerdown', raise);

    // ---------- Arrastar pela barra ----------
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
    toggle.addEventListener('click', () => show(box.hidden));

    return {
      show,
      isOpen,
      setHasPage(v) {
        if (v === hasPage) return;
        hasPage = v;
        sync();
      },
    };
  };
})();
