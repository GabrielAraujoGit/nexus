'use strict';
// Monta o vídeo de divulgação a partir dos quadros gravados do NEXUS. A edição em si (gancho, planos,
// textos, transições e cartela) está em promo-page.js, que roda num canvas gravado pelo MediaRecorder
// do Electron em MP4 (H.264).
//   electron scripts/promo-compose.js <pasta-dos-quadros> <saida.mp4> [en|pt]
// Ferramenta local: a página só lê arquivos deste projeto e a pasta de quadros.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('promo-compose.js') && a !== '.');
const lang = ['en', 'pt'].includes(argv[argv.length - 1]) ? argv.pop() : 'en';
const [framesDir, outFile] = argv.slice(-2).map((p) => path.resolve(p));
const ROOT = path.resolve(__dirname, '..');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  ipcMain.once('done', (_e, buf) => { fs.writeFileSync(outFile, buf); console.log(`ok ${outFile}`); app.quit(); });
  ipcMain.once('fail', (_e, msg) => { console.error(msg); app.exit(1); });
  ipcMain.on('log', (_e, msg) => console.log(msg));
  const config = JSON.stringify({ frames: framesDir, lang, root: ROOT });
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="1920" height="1080"></canvas>
<script>window.CONFIG = ${config};</script>
<script src="${path.join(__dirname, 'promo-page.js')}"></script>`;
  const tmp = path.join(app.getPath('temp'), `nexus-promo-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
});
