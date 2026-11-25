'use strict';
// Monta o vídeo de divulgação: quadros gravados do NEXUS + legendas em estilo HUD + cartela final,
// gravados de um canvas com o MediaRecorder do Electron em MP4 (H.264), formato aceito pelo X.
//   electron scripts/promo-compose.js <pasta-dos-quadros> <saida.mp4>
// Ferramenta local: a página só carrega arquivos deste projeto.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [framesDir, outFile] = process.argv.slice(-2).map((p) => path.resolve(p));
const ROOT = path.resolve(__dirname, '..');
const FPS = 30;
const W = 1920;
const H = 1080;

// Legendas: [início s, fim s, título, subtítulo]
const CAPTIONS = [
  [3.9, 6.6, 'Your real shell.', 'Starship, aliases, tmux, vim: it all just works.'],
  [6.8, 8.9, 'Live system panels.', 'CPU per core, memory, disks, network, latency.'],
  [9.0, 12.7, 'Three themes.', 'Tron · Cyberpunk · Amber'],
  [13.1, 17.6, 'A sandboxed mini browser.', 'Isolated, in-memory session. No telemetry.'],
];
const END_CARD = 4; // segundos
const CROSSFADE = 0.6;

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const FPS = ${FPS}, W = ${W}, H = ${H}, END = ${END_CARD}, XF = ${CROSSFADE};
const CAPTIONS = ${JSON.stringify(CAPTIONS)};
const dir = ${JSON.stringify(framesDir)};
const root = ${JSON.stringify(ROOT)};
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const url = (p) => 'file://' + p.split(path.sep).map(encodeURIComponent).join('/');
const ease = (t) => t * t * (3 - 2 * t);

async function loadImg(p) { const i = new Image(); i.src = url(p); await i.decode(); return i; }

(async () => {
  for (const [w, f] of [[500, 'rajdhani-latin-500-normal.woff2'], [600, 'rajdhani-latin-600-normal.woff2']]) {
    const face = new FontFace('Rajdhani', 'url(' + url(path.join(root, 'node_modules/@fontsource/rajdhani/files', f)) + ')', { weight: String(w) });
    document.fonts.add(await face.load());
  }
  const mono = new FontFace('ShareTech', 'url(' + url(path.join(root, 'node_modules/@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2')) + ')');
  document.fonts.add(await mono.load());
  // quadros decodificados sob demanda, com alguns à frente (todos de uma vez passam de 4 GB em 1080p)
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.jpg')).sort();
  // instante real de cada quadro (ms no nome); para cada quadro do vídeo usa o capturado naquele instante
  const times = files.map((n) => Number((n.match(/-(\\d+)\\.jpg$/) || [])[1]) || 0);
  const duration = times[times.length - 1] / 1000;
  const nOut = Math.floor(duration * FPS);
  const pick = [];
  for (let o = 0, k = 0; o < nOut; o++) {
    while (k + 1 < times.length && times[k + 1] <= (o * 1000) / FPS) k++;
    pick.push(k);
  }
  const AHEAD = 12;
  const pending = new Map();
  const fetchFrame = (i) => {
    if (i === undefined || i >= files.length || pending.has(i)) return;
    pending.set(i, createImageBitmap(new Blob([fs.readFileSync(path.join(dir, files[i]))], { type: 'image/jpeg' })));
  };
  for (let i = 0; i < AHEAD; i++) fetchFrame(pick[i]);
  const frames = { length: nOut };
  const icon = await loadImg(path.join(root, 'build/icon.png'));

  function caption(t) {
    for (const [a, b, title, sub] of CAPTIONS) {
      if (t < a || t > b) continue;
      const k = Math.min(1, (t - a) / 0.35, (b - t) / 0.35);
      const e = ease(Math.max(0, k));
      ctx.save();
      ctx.globalAlpha = e;
      const x = 80, y = H - 210 + (1 - e) * 14;
      ctx.font = '600 58px Rajdhani';
      const tw = ctx.measureText(title).width;
      ctx.font = '500 30px Rajdhani';
      const sw = ctx.measureText(sub).width;
      const bw = Math.max(tw, sw) + 70;
      ctx.fillStyle = 'rgba(5,8,13,0.82)';
      ctx.fillRect(x, y, bw, 136);
      ctx.strokeStyle = 'rgba(170,207,209,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 135);
      ctx.fillStyle = 'rgb(120,220,235)';
      ctx.shadowColor = 'rgba(120,220,235,0.9)';
      ctx.shadowBlur = 14;
      ctx.fillRect(x, y, 6, 136);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(230,244,245,0.97)';
      ctx.font = '600 58px Rajdhani';
      ctx.fillText(title, x + 34, y + 66);
      ctx.fillStyle = 'rgba(170,207,209,0.8)';
      ctx.font = '500 30px Rajdhani';
      ctx.fillText(sub, x + 36, y + 110);
      ctx.restore();
    }
  }

  function endCard(alpha, t) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(170,207,209,0.08)';
    for (let gx = 11; gx < W; gx += 22) for (let gy = 11; gy < H; gy += 22) ctx.fillRect(gx, gy, 2, 2);
    const s = 1 + 0.02 * Math.min(1, t / END);
    ctx.translate(W / 2, H / 2 - 40);
    ctx.scale(s, s);
    ctx.drawImage(icon, -90, -300, 180, 180);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(230,244,245,0.97)';
    ctx.shadowColor = 'rgba(170,207,209,0.5)';
    ctx.shadowBlur = 24;
    ctx.font = '600 150px Rajdhani';
    ctx.letterSpacing = '40px';
    ctx.fillText('NEXUS', 20, 0);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(170,207,209,0.9)';
    ctx.font = '500 48px Rajdhani';
    ctx.fillText('A sci-fi terminal for Linux', 0, 90);
    ctx.fillStyle = 'rgba(170,207,209,0.6)';
    ctx.font = '500 34px Rajdhani';
    ctx.fillText('Open source · MIT · Free', 0, 150);
    ctx.fillStyle = 'rgb(120,220,235)';
    ctx.font = '400 40px ShareTech';
    ctx.fillText('github.com/gabterm/nexus', 0, 250);
    ctx.restore();
  }

  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028', videoBitsPerSecond: 10_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();

  const total = frames.length + END * FPS;
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    if (i < frames.length) {
      const k = pick[i];
      const img = await pending.get(k);
      fetchFrame(pick[i + AHEAD]);
      ctx.drawImage(img, 0, 0, W, H);
      if (pick[i + 1] !== k) { pending.delete(k); img.close(); } // repetido no próximo quadro: mantém
      caption(t);
      const left = (frames.length - i) / FPS;
      if (left < XF) endCard(1 - left / XF, 0);
    } else {
      endCard(1, (i - frames.length) / FPS);
    }
    track.requestFrame();
    const due = t0 + ((i + 1) * 1000) / FPS;
    await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
  }
  const real = (performance.now() - t0) / 1000;
  ipcRenderer.send('log', total + ' quadros em ' + real.toFixed(1) + ' s (alvo ' + (total / FPS).toFixed(1) + ' s)');
  rec.stop();
  await new Promise((r) => { rec.onstop = r; });
  const buf = Buffer.from(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer());
  ipcRenderer.send('done', buf);
})().catch((err) => ipcRenderer.send('fail', String(err && err.stack || err)));
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: W, height: H,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  ipcMain.once('done', (_e, buf) => { fs.writeFileSync(outFile, buf); console.log(`ok ${outFile}`); app.quit(); });
  ipcMain.once('fail', (_e, msg) => { console.error(msg); app.exit(1); });
  ipcMain.on('log', (_e, msg) => console.log(msg));
  const tmp = path.join(app.getPath('temp'), `nexus-promo-${process.pid}.html`);
  fs.writeFileSync(tmp, page);
  await win.loadFile(tmp);
});
