'use strict';
// NEXUS — música: janela flutuante com o YouTube Music (view do processo principal sobre #music-slot)
// e o mini player do HUD, que mostra a faixa atual e controla o player do site.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.nexus.music;
  const status = $('music-status');
  const np = $('np');

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
  $('np-prev').addEventListener('click', () => api.control('prev'));
  $('np-toggle').addEventListener('click', () => api.control('toggle'));
  $('np-next').addEventListener('click', () => api.control('next'));
  $('np-show').addEventListener('click', () => frame.show(true));

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
    if (s.error) status.textContent = `Erro: ${s.error}`;
    else if (s.title) status.textContent = `${s.playing ? '▶' : '❚❚'} ${s.title}${s.artist ? ` · ${s.artist}` : ''}`;
    else status.textContent = 'YouTube Music';

    np.hidden = !s.title;
    if (!s.title) return;
    if (s.title !== lastTitle) {
      lastTitle = s.title;
      np.classList.remove('changed');
      void np.offsetWidth; // reinicia o brilho de troca de faixa
      np.classList.add('changed');
    }
    $('np-title').textContent = s.title;
    $('np-title').title = s.title;
    $('np-artist').textContent = [s.artist, s.album].filter(Boolean).join(' · ');
    const art = $('np-art');
    if (s.art && art.getAttribute('src') !== s.art) art.src = s.art;
    art.hidden = !s.art;
    np.classList.toggle('playing', s.playing);
    $('np-toggle').textContent = s.playing ? '❚❚' : '▶';
    $('np-toggle').setAttribute('aria-label', s.playing ? 'Pausar' : 'Tocar');
    const pct = s.dur > 0 ? Math.min(100, (s.pos / s.dur) * 100) : 0;
    $('np-bar').style.width = `${pct}%`;
    $('np-time').textContent = s.dur > 0 ? `${clock(s.pos)} / ${clock(s.dur)}` : '';
  });
})();
