'use strict';
// NEXUS — música: janela flutuante com o YouTube Music (view do processo principal sobre #music-slot)
// e o mini player do HUD, que mostra a faixa atual e controla o player do site.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.nexus.music;
  const status = $('music-status');
  const np = $('np');
  const sound = window.NexusSound;
  const hud = window.NexusHud;
  const disco = hud.disco($('np-disco'));
  const progresso = hud.faixa($('np-seg'), 32);

  const frame = window.NexusFloat({
    box: $('music'),
    bar: $('music-bar'),
    slot: $('music-slot'),
    toggle: $('music-btn'),
    bounds: (rect) => api.bounds(rect),
    front: () => api.front(),
    onOpen: () => api.open(), // cria o player na primeira vez; depois só mostra
  });

  const clock = (s) => {
    const t = Math.floor(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  // ---------- Janela ----------
  $('music-back').addEventListener('click', () => api.nav('back'));
  $('music-home').addEventListener('click', () => api.nav('home'));
  $('music-reload').addEventListener('click', () => api.nav('reload'));
  $('music-close').addEventListener('click', () => frame.show(false)); // esconde; a música continua
  $('music-off').addEventListener('click', () => {
    api.quit();
    frame.show(false);
  });
  $('music-forget').addEventListener('click', () => {
    api.forget()
      .then(() => window.NexusToast?.('ok', 'Música', 'Você saiu da conta do YouTube Music.'))
      .catch((err) => console.error('[nexus] sair da conta:', err));
    frame.show(false);
  });

  // ---------- Mini player ----------
  for (const [id, action] of [['np-prev', 'prev'], ['np-toggle', 'toggle'], ['np-next', 'next']]) {
    $(id).addEventListener('click', () => {
      sound.play('toggle');
      api.control(action);
    });
  }
  $('np-show').addEventListener('click', () => frame.show(true));

  // ---------- Timeline: clicar, arrastar ou usar as setas para ir para frente ou para trás ----------
  const seek = $('np-seek');
  let pos = 0;
  let dur = 0;
  let dragging = false;
  let holdUntil = 0; // depois de um salto, ignora o estado antigo até o player alcançar
  let hoverF = null; // fração sob o mouse (prévia do tempo)
  const fracAt = (x) => {
    const r = seek.getBoundingClientRect();
    return r.width ? Math.min(Math.max((x - r.left) / r.width, 0), 1) : 0;
  };
  function paintTime(p, preview) {
    const f = dur > 0 ? Math.min(p / dur, 1) : 0;
    disco.set(f);
    progresso(f);
    $('np-time').textContent = dur > 0 ? `${clock(p)} / ${clock(dur)}` : '';
    seek.setAttribute('aria-valuemax', String(Math.round(dur)));
    seek.setAttribute('aria-valuenow', String(Math.round(p)));
    seek.setAttribute('aria-valuetext', dur > 0 ? `${clock(p)} de ${clock(dur)}` : 'sem duração');
    if (preview !== undefined) $('np-time').textContent = `→ ${clock(preview)} / ${clock(dur)}`;
  }
  function jump(f) {
    if (!(dur > 0)) return;
    pos = f * dur;
    holdUntil = Date.now() + 1500;
    paintTime(pos);
    api.seek(f);
    sound.play('toggle');
  }
  seek.addEventListener('pointerdown', (e) => {
    if (!(dur > 0) || e.button !== 0) return;
    dragging = true;
    seek.setPointerCapture(e.pointerId);
    seek.classList.add('dragging');
    paintTime(fracAt(e.clientX) * dur);
  });
  seek.addEventListener('pointermove', (e) => {
    if (!(dur > 0)) return;
    const f = fracAt(e.clientX);
    hoverF = f;
    seek.style.setProperty('--x', `${f * 100}%`);
    if (dragging) paintTime(f * dur);
    else paintTime(pos, f * dur);
  });
  const endDrag = (e, commit) => {
    if (!dragging) return;
    dragging = false;
    seek.classList.remove('dragging');
    if (commit) jump(fracAt(e.clientX));
    else paintTime(pos);
  };
  seek.addEventListener('pointerup', (e) => endDrag(e, true));
  seek.addEventListener('pointercancel', (e) => endDrag(e, false));
  seek.addEventListener('pointerleave', () => {
    hoverF = null;
    if (!dragging) paintTime(pos);
  });
  seek.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco do terminal no clique
  seek.addEventListener('keydown', (e) => {
    if (!(dur > 0)) return;
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -30, PageUp: 30 }[e.key];
    let target = null;
    if (step) target = pos + step;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = dur - 1;
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation(); // a seta não vai para o shell
    jump(Math.min(Math.max(target, 0), dur) / dur);
  });

  let lastTitle = '';
  api.onState((s) => {
    if (!s.open) {
      frame.setHasPage(false);
      np.hidden = true;
      lastTitle = '';
      status.textContent = 'Desligado';
      return;
    }
    frame.setHasPage(true);
    if (s.error) {
      if (status.textContent !== `Erro: ${s.error}`) sound.play('error');
      status.textContent = `Erro: ${s.error}`;
    }
    else if (s.title) status.textContent = `${s.playing ? '▶' : '❚❚'} ${s.title}${s.artist ? ` · ${s.artist}` : ''}`;
    else status.textContent = 'YouTube Music';

    np.hidden = !s.title;
    if (!s.title) return;
    if (s.title !== lastTitle) {
      if (lastTitle) sound.play('track'); // a primeira faixa não toca: o 'open' da janela já soou
      lastTitle = s.title;
      np.classList.remove('changed');
      void np.offsetWidth; // reinicia o brilho de troca de faixa
      np.classList.add('changed');
    }
    $('np-title').textContent = s.title;
    $('np-title').title = s.title;
    $('np-artist').textContent = [s.artist, s.album].filter(Boolean).join(' · ');
    disco.art(s.art);
    np.classList.toggle('playing', s.playing);
    $('np-state').textContent = s.playing ? 'Tocando agora' : 'Pausado';
    $('np-toggle').textContent = s.playing ? '❚❚' : '▶';
    $('np-toggle').setAttribute('aria-label', s.playing ? 'Pausar' : 'Tocar');
    dur = s.dur > 0 ? s.dur : 0;
    if (!dragging && Date.now() >= holdUntil) {
      pos = s.pos > 0 ? s.pos : 0;
      paintTime(pos, hoverF === null ? undefined : hoverF * dur);
    }
  });
})();
