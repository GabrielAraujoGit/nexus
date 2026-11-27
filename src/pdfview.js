'use strict';
// NEXUS — PDF no visualizador: uma WebContentsView com o leitor de PDF embutido do Chromium, desenhada sobre o
// corpo da janela do visualizador (mesmo esquema do mini navegador). Roda em sandbox, numa sessão só em memória,
// sem permissões nem downloads; só abre o arquivo que o processo principal mandou. Links http(s) do PDF abrem no
// navegador do sistema.
const { WebContentsView, session, ipcMain, shell } = require('electron');
const { pathToFileURL } = require('node:url');
const { placeView } = require('./web');

function setupPdf(getWin) {
  let view = null;
  let allowed = null; // URL do arquivo aberto: a única navegação permitida

  function ensureView() {
    if (view) return view;
    const win = getWin();
    if (!win || win.isDestroyed()) return null;
    const ses = session.fromPartition('nexus-pdf');
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => e.preventDefault());
    view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        plugins: true, // leitor de PDF do Chromium
        spellcheck: false,
        offscreen: Boolean(process.env.NEXUS_CAPTURE),
        zoomFactor: process.env.NEXUS_CAPTURE ? Number(process.env.NEXUS_SNAPSHOT_SCALE) || 2 : 1,
      },
    });
    view.setBackgroundColor('#05080d');
    view.setVisible(false); // aparece quando a interface manda a posição
    const wc = view.webContents;
    const guard = (e) => {
      if (e.url === allowed) return;
      e.preventDefault();
      if (/^https?:\/\//i.test(e.url)) shell.openExternal(e.url).catch(() => {});
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    win.contentView.addChildView(view);
    return view;
  }

  function close() {
    if (!view) return;
    const win = getWin();
    if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
    view = null;
    allowed = null;
  }

  // Abre o arquivo (caminho já validado pelo viewer.js). Devolve false se não carregou.
  async function load(file) {
    const v = ensureView();
    if (!v) return false;
    allowed = pathToFileURL(file).href;
    try {
      await v.webContents.loadURL(allowed);
      return true;
    } catch (err) {
      console.error('[nexus] pdf:', err.message);
      return false;
    }
  }

  ipcMain.on('pdf:bounds', (_e, rect) => {
    const win = getWin();
    if (view && win && !win.isDestroyed()) placeView(win, view, rect);
  });
  ipcMain.on('pdf:front', () => {
    const win = getWin();
    if (view && win && !win.isDestroyed()) win.contentView.addChildView(view);
  });
  ipcMain.on('pdf:close', () => close());

  return { load, close };
}

module.exports = { setupPdf };
