'use strict';
// NEXUS — mini navegador: uma WebContentsView isolada desenhada por cima da janela flutuante da interface.
// A página não tem acesso ao Node nem à ponte window.nexus, roda em sandbox numa sessão só em memória
// (cookies somem ao fechar o app), e permissões (câmera, microfone, localização...) e downloads são negados.
const { WebContentsView, session, ipcMain } = require('electron');

const MAX_URL = 2048;
const isWeb = (url) => /^https?:\/\//i.test(String(url));

// Texto digitado → URL http(s), ou busca no DuckDuckGo. Qualquer outro esquema (file:, javascript:...) é recusado.
function toURL(input) {
  const text = String(input ?? '').trim().slice(0, MAX_URL);
  if (!text) return null;
  let candidate = text;
  if (!isWeb(text)) {
    const hostLike = /^(localhost|[\w-]+(\.[\w-]+)+|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(text);
    if (hostLike && !/\s/.test(text)) {
      candidate = `${/^(localhost|127\.|\d{1,3}(\.\d{1,3}){3})/.test(text) ? 'http' : 'https'}://${text}`;
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) {
      return null; // outro esquema
    } else {
      return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
    }
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function setupWeb(getWin) {
  let view = null;

  const emit = (extra = {}) => {
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    const wc = view?.webContents;
    win.webContents.send('web:state', wc ? {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canBack: wc.navigationHistory.canGoBack(),
      canForward: wc.navigationHistory.canGoForward(),
      ...extra,
    } : { closed: true, ...extra });
  };

  function ensureView() {
    if (view) return view;
    const win = getWin();
    if (!win || win.isDestroyed()) return null;

    const ses = session.fromPartition('nexus-web'); // sem "persist:": nada vai para o disco
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => {
      e.preventDefault();
      emit({ error: 'downloads desativados no mini navegador' });
    });

    view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        offscreen: Boolean(process.env.NEXUS_SNAPSHOT), // capturas: a página também renderiza fora da tela
        // capturas em 2x: a página acompanha o zoom da interface (zoomFactor vale para toda navegação)
        zoomFactor: process.env.NEXUS_SNAPSHOT ? Number(process.env.NEXUS_SNAPSHOT_SCALE) || 2 : 1,
      },
    });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false); // aparece quando a interface manda a posição
    const wc = view.webContents;

    // Pop-ups abrem na própria janela; só http(s).
    wc.setWindowOpenHandler(({ url }) => {
      if (isWeb(url)) wc.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    const guard = (e, url) => {
      if (!isWeb(e.url ?? url)) e.preventDefault();
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
      wc.on(ev, () => emit());
    }
    wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) emit({ error: desc }); // -3 = navegação abortada (normal)
    });

    win.contentView.addChildView(view);
    return view;
  }

  function closeView() {
    if (!view) return;
    const win = getWin();
    if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
    view = null;
    emit();
  }

  ipcMain.on('web:open', (_e, input) => {
    const url = toURL(input);
    if (!url) {
      emit({ error: 'endereço inválido (só http e https)' });
      return;
    }
    ensureView()?.webContents.loadURL(url).catch(() => {}); // erro chega pelo did-fail-load
  });

  ipcMain.on('web:bounds', (_e, rect) => {
    const win = getWin();
    if (!view || !win || win.isDestroyed()) return;
    if (!rect) {
      view.setVisible(false);
      return;
    }
    const nums = ['x', 'y', 'width', 'height'].map((k) => Number(rect[k]));
    if (!nums.every(Number.isFinite)) return;
    // A interface manda em pixels CSS; com zoom (capturas em 2x) a view precisa da escala.
    const zoom = win.webContents.getZoomFactor();
    const [cw, ch] = win.getContentSize();
    const x = Math.min(Math.max(Math.round(nums[0] * zoom), 0), cw);
    const y = Math.min(Math.max(Math.round(nums[1] * zoom), 0), ch);
    const width = Math.min(Math.max(Math.round(nums[2] * zoom), 1), cw - x);
    const height = Math.min(Math.max(Math.round(nums[3] * zoom), 1), ch - y);
    view.setBounds({ x, y, width, height });
    view.setVisible(true);
  });

  ipcMain.on('web:nav', (_e, action) => {
    const wc = view?.webContents;
    if (!wc) return;
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'stop') wc.stop();
  });

  ipcMain.on('web:close', () => closeView());

  // Capturas de tela: o capturePage da janela não inclui esta view, então ela é fotografada à parte.
  return {
    async capture() {
      if (!view || !view.getVisible()) return null;
      return view.webContents.capturePage();
    },
  };
}

module.exports = { setupWeb, toURL };
