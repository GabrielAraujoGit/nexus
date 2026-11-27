'use strict';
// NEXUS — player de música: o site oficial do YouTube Music numa WebContentsView isolada, desenhada sobre a
// janela flutuante "Música". O YouTube Music não tem API pública, então o app não usa chave nem API não oficial:
// a página é o próprio site, e o mini player do HUD só lê o que a página publica no MediaSession
// (faixa, artista, capa) e aperta os botões do player dela.
//
// Diferente do mini navegador, a sessão é persistente ("persist:nexus-music") para o login não se perder,
// e é separada de tudo: nem o mini navegador nem a interface enxergam esses cookies. A navegação fica presa
// aos domínios do YouTube/Google (login incluso); permissões e downloads são negados.
const { WebContentsView, session, ipcMain } = require('electron');
const { placeView } = require('./web');
const adblock = require('./adblock');

const HOME = 'https://music.youtube.com/';
const PARTITION = 'persist:nexus-music';
const POLL_MS = 1000;
const ISOLATED_WORLD = 1001; // os scripts de leitura rodam fora do alcance dos scripts da página
const ART_MAX_BYTES = 512 * 1024;

const hostOf = (url) => {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
};
// Site + login do Google (accounts.google.com, google.com.br e afins no SetSID, consentimento de cookies).
const isAllowed = (url) => /(^|\.)(youtube\.com|google\.com(\.[a-z]{2})?|youtu\.be)$/i.test(hostOf(url) ?? '');
// Capas vêm destes hosts; qualquer outro endereço vindo da página é ignorado.
const isArtHost = (url) => /^(lh\d\.googleusercontent\.com|i\d?\.ytimg\.com|yt\d\.ggpht\.com)$/i.test(hostOf(url) ?? '');

// Lido dentro da página (mundo isolado). Devolve só texto e números; o processo principal revalida.
const READ_STATE = `(() => {
  const md = navigator.mediaSession && navigator.mediaSession.metadata;
  const v = document.querySelector('video');
  const art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : '';
  return {
    title: md ? md.title : '',
    artist: md ? md.artist : '',
    album: md ? md.album : '',
    art,
    playing: Boolean(v && !v.paused && !v.ended),
    pos: v ? v.currentTime : 0,
    dur: v ? v.duration : 0,
  };
})()`;

// Botões do player do próprio site (assim a interface dele continua em sincronia).
const CONTROLS = {
  toggle: `(() => {
    const b = document.querySelector('ytmusic-player-bar #play-pause-button');
    if (b) { b.click(); return; }
    const v = document.querySelector('video');
    if (v) { if (v.paused) v.play(); else v.pause(); }
  })()`,
  next: `document.querySelector('ytmusic-player-bar .next-button')?.click()`,
  prev: `document.querySelector('ytmusic-player-bar .previous-button')?.click()`,
};

const text = (v, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

function setupMusic(getWin) {
  let view = null;
  let timer = null;
  let last = {};
  const art = { url: '', data: '' };

  const send = (payload) => {
    const win = getWin();
    if (win && !win.isDestroyed()) win.webContents.send('music:state', payload);
  };

  function musicSession() {
    const ses = session.fromPartition(PARTITION);
    if (ses.nexusReady) return ses;
    ses.nexusReady = true;
    // O Google recusa login em "navegador embutido": tira as marcas do Electron e do app do user agent.
    ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|nexus)\/\S+/gi, ''));
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => e.preventDefault());
    adblock.attachAdblock(ses); // anúncios e rastreadores na rede (o botão AdBlock vale aqui também)
    return ses;
  }

  // Capa: baixada pela sessão da música (só dos hosts de imagem do Google), limitada e entregue como data URL,
  // porque a CSP da interface não carrega imagens de fora.
  async function loadArt(url) {
    if (!url || url === art.url) return;
    art.url = url;
    art.data = '';
    if (!isArtHost(url)) return;
    try {
      const res = await musicSession().fetch(url, { redirect: 'error' });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > ART_MAX_BYTES || art.url !== url) return;
      art.data = `data:${type};base64,${buf.toString('base64')}`;
      send({ ...last, art: art.data });
    } catch (err) {
      console.error('[nexus] capa:', err.message);
    }
  }

  async function poll() {
    const wc = view?.webContents;
    if (!wc || wc.isDestroyed() || wc.isLoading()) return;
    // pula anúncio em áudio/vídeo (instala uma vez por página; aqui só repassa liga/desliga)
    wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: adblock.youtubeAdSkip(adblock.isEnabled()) }]).catch(() => {});
    const raw = await wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: READ_STATE }]).catch(() => null);
    if (!raw || typeof raw !== 'object') return;
    last = {
      open: true,
      title: text(raw.title),
      artist: text(raw.artist),
      album: text(raw.album),
      playing: raw.playing === true,
      pos: num(raw.pos),
      dur: num(raw.dur),
    };
    loadArt(text(raw.art, 2048));
    send({ ...last, art: art.data });
  }

  function ensureView() {
    if (view) return view;
    const win = getWin();
    if (!win || win.isDestroyed()) return null;
    view = new WebContentsView({
      webPreferences: {
        session: musicSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        // Com a janela "Música" escondida o Chromium economiza (menos quadros e timers), mas não segura página
        // que está tocando áudio: a música segue. Antes ficava false e o site rodava a toda o tempo todo.
        backgroundThrottling: true,
      },
    });
    view.setBackgroundColor('#030303');
    view.setVisible(false);
    const wc = view.webContents;

    // Links de fora (artista no Instagram, loja...) não abrem aqui; pop-ups do login abrem na própria view.
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowed(url)) wc.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    const guard = (e) => {
      if (!isAllowed(e.url)) e.preventDefault();
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) send({ ...last, open: true, error: desc });
    });
    wc.on('render-process-gone', () => closeView());

    win.contentView.addChildView(view);
    wc.loadURL(HOME).catch(() => {}); // erro chega pelo did-fail-load
    timer = setInterval(() => { poll().catch(() => {}); }, POLL_MS);
    send({ open: true });
    return view;
  }

  function closeView() {
    clearInterval(timer);
    timer = null;
    last = {};
    art.url = '';
    art.data = '';
    if (view) {
      const win = getWin();
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      view = null;
    }
    send({ open: false });
  }

  ipcMain.on('music:open', () => ensureView());

  ipcMain.on('music:bounds', (_e, rect) => {
    const win = getWin();
    if (view && win && !win.isDestroyed()) placeView(win, view, rect);
  });

  ipcMain.on('music:front', () => {
    const win = getWin();
    if (view && win && !win.isDestroyed()) win.contentView.addChildView(view); // readicionar põe no topo
  });

  ipcMain.on('music:control', (_e, action) => {
    const wc = view?.webContents;
    if (wc && !wc.isDestroyed() && Object.hasOwn(CONTROLS, action)) {
      wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: CONTROLS[action] }])
        .then(() => setTimeout(() => { poll().catch(() => {}); }, 250))
        .catch(() => {});
    }
  });

  // Timeline do mini player: vai para a fração f (0..1) da faixa. Só um número entra no script da página.
  ipcMain.on('music:seek', (_e, f) => {
    const wc = view?.webContents;
    if (!wc || wc.isDestroyed() || typeof f !== 'number' || !Number.isFinite(f)) return;
    const frac = Math.min(Math.max(f, 0), 1).toFixed(5);
    const code = `(() => {
      const v = document.querySelector('video');
      if (v && Number.isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * ${frac};
    })()`;
    wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code }])
      .then(() => setTimeout(() => { poll().catch(() => {}); }, 250))
      .catch(() => {});
  });

  ipcMain.on('music:nav', (_e, action) => {
    const wc = view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'home') wc.loadURL(HOME).catch(() => {});
    else if (action === 'reload') wc.reload();
  });

  // Desliga o player (para a música e libera memória). O login continua salvo.
  ipcMain.on('music:quit', () => closeView());

  // Sair da conta: apaga cookies e dados do site só desta sessão.
  ipcMain.handle('music:forget', async () => {
    closeView();
    await session.fromPartition(PARTITION).clearStorageData();
    return true;
  });
}

module.exports = { setupMusic, isAllowed, isArtHost };
