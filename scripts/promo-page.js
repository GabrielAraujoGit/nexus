'use strict';
/* global CONFIG */
// Edição do vídeo de divulgação, rodando num canvas: gancho, planos com corte/zoom/velocidade,
// textos grandes animados, transições glitch, barra de progresso e cartela final.
// Recebe CONFIG (pasta dos quadros, idioma, raiz do projeto) do promo-compose.js.
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const W = 1920;
const H = 1080;
const ACC = '120,220,235';
const PINK = '240,90,190';
const TXT = {
  en: {
    hook1: 'eDEX-UI was archived in 2021.',
    hook2: 'So I built a new one.',
    labels: ['Your real shell', 'Live system panels', 'Three themes', 'Sandboxed mini browser'],
    tagline: 'A sci-fi terminal for Linux',
    meta: 'Open source · MIT · Free',
    cta: '★  Star it on GitHub',
  },
  pt: {
    hook1: 'O eDEX-UI foi arquivado em 2021.',
    hook2: 'Então eu fiz um novo.',
    labels: ['O seu shell de verdade', 'Painéis ao vivo', 'Três temas', 'Mini navegador isolado'],
    tagline: 'Um terminal sci-fi para Linux',
    meta: 'Código aberto · MIT · Grátis',
    cta: '★  Deixe uma estrela no GitHub',
  },
}[CONFIG.lang];

// Planos: dur em segundos de vídeo; rec = trecho da gravação (s); from/to = câmera em coordenadas 1920x1080
const SHOTS = [
  { kind: 'hook', dur: 2.4 },
  { kind: 'rec', dur: 2.6, rec: [0.5, 3.4], from: [0, 0, 1920, 1080], to: [48, 27, 1824, 1026] },
  { kind: 'rec', dur: 2.6, rec: [3.5, 7.4], from: [300, 0, 1300, 731.25], to: [380, 20, 1200, 675], label: 0 },
  { kind: 'rec', dur: 2.0, rec: [7.3, 8.5], from: [0, 40, 1280, 720], to: [0, 120, 1200, 675], label: 1 },
  { kind: 'rec', dur: 2.8, rec: [8.3, 12.3], from: [0, 0, 1920, 1080], to: [60, 34, 1800, 1012.5], label: 2, flashes: [8.6, 10.3, 12.0] },
  // a página do GitHub leva ~3 s para aparecer: o plano começa quando ela já está na janela
  { kind: 'rec', dur: 2.6, rec: [14.6, 17.05], from: [440, 40, 1240, 697.5], to: [500, 70, 1120, 630], label: 3 },
  { kind: 'end', dur: 3.5 },
];
let acc = 0;
for (const s of SHOTS) { s.start = acc; acc += s.dur; }
const TOTAL = acc;
const PROGRESS = [SHOTS[1].start, SHOTS[SHOTS.length - 1].start]; // barra só durante a demo

const c = document.getElementById('c');
const ctx = c.getContext('2d');
const url = (p) => 'file://' + p.split(path.sep).map(encodeURIComponent).join('/');
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp(t)) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/\\';
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function decode(text, p) { // texto "decodificando": letras travam da esquerda para a direita
  const n = Math.floor(clamp(p) * text.length);
  return text.slice(0, n) + [...text.slice(n)].map((ch) => (ch === ' ' ? ' ' : GLYPHS[Math.floor(rnd() * GLYPHS.length)])).join('');
}

function backdrop() {
  ctx.fillStyle = '#05080d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(170,207,209,0.07)';
  for (let x = 11; x < W; x += 22) for (let y = 11; y < H; y += 22) ctx.fillRect(x, y, 2, 2);
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1100);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function scanlines() {
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
}

function glitch(strength) { // fatias deslocadas + barras de cor + clarão
  if (strength <= 0) return;
  for (let k = 0; k < 9; k++) {
    const y = Math.floor(rnd() * H);
    const h = 8 + Math.floor(rnd() * 70);
    const dx = (rnd() - 0.5) * 160 * strength;
    ctx.drawImage(c, 0, y, W, h, dx, y, W, h);
  }
  ctx.fillStyle = `rgba(${ACC},${0.18 * strength})`;
  ctx.fillRect(0, Math.floor(rnd() * H), W, 6 + rnd() * 30);
  ctx.fillStyle = `rgba(${PINK},${0.16 * strength})`;
  ctx.fillRect(0, Math.floor(rnd() * H), W, 6 + rnd() * 30);
  ctx.fillStyle = `rgba(255,255,255,${0.22 * strength * strength})`;
  ctx.fillRect(0, 0, W, H);
}

function hook(t) {
  backdrop();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 60px Rajdhani';
  ctx.fillStyle = 'rgba(170,207,209,0.75)';
  ctx.fillText(decode(TXT.hook1, t / 0.9), W / 2, H / 2 - 70);
  if (t > 1.1) {
    const p = easeOut((t - 1.1) / 0.35);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = '600 118px Rajdhani';
    ctx.fillStyle = 'rgba(236,248,250,0.98)';
    ctx.shadowColor = `rgba(${ACC},0.8)`;
    ctx.shadowBlur = 30;
    ctx.fillText(TXT.hook2, W / 2, H / 2 + 60 + (1 - p) * 20);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  scanlines();
  glitch(t > 1.1 && t < 1.35 ? 1 : 0);
}

function label(shot, u, local) {
  if (shot.label === undefined) return;
  const inP = easeOut((local - 0.15) / 0.35);
  const outP = clamp((shot.dur - local) / 0.15);
  const a = Math.min(inP, outP);
  if (a <= 0) return;
  // degradê escuro embaixo para o texto ler sobre qualquer tela
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
  g.addColorStop(0, 'rgba(5,8,13,0)');
  g.addColorStop(1, `rgba(5,8,13,${0.85 * a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);
  const x = 96;
  const title = TXT.labels[shot.label];
  ctx.save();
  ctx.font = '600 112px Rajdhani';
  const tw = ctx.measureText(title).width;
  ctx.beginPath();
  ctx.rect(x - 10, H - 330, (tw + 40) * inP, 260); // revelação da esquerda para a direita
  ctx.clip();
  ctx.globalAlpha = outP;
  ctx.font = '500 30px ShareTech';
  ctx.fillStyle = `rgb(${ACC})`;
  ctx.fillText(`0${shot.label + 1} / 04`, x + 4, H - 250);
  ctx.font = '600 112px Rajdhani';
  ctx.fillStyle = 'rgba(236,248,250,0.98)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 20;
  ctx.fillText(title, x, H - 140);
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgb(${ACC})`;
  ctx.fillRect(x + 2, H - 116, Math.min(tw, 180) * inP, 6);
  ctx.restore();
}

async function loadFonts() {
  const fonts = [
    ['Rajdhani', 'rajdhani/files/rajdhani-latin-500-normal.woff2', '500'],
    ['Rajdhani', 'rajdhani/files/rajdhani-latin-600-normal.woff2', '600'],
    ['ShareTech', 'share-tech-mono/files/share-tech-mono-latin-400-normal.woff2', '500'],
  ];
  for (const [family, file, weight] of fonts) {
    const face = new FontFace(family, `url(${url(path.join(CONFIG.root, 'node_modules/@fontsource', file))})`, { weight });
    document.fonts.add(await face.load());
  }
}

(async () => {
  await loadFonts();
  const icon = new Image();
  icon.src = url(path.join(CONFIG.root, 'build/icon.png'));
  await icon.decode();

  // quadros: instante real no nome (ms); para cada quadro do vídeo, o capturado naquele instante
  const files = fs.readdirSync(CONFIG.frames).filter((n) => n.endsWith('.jpg')).sort();
  const times = files.map((n) => Number((n.match(/-(\d+)\.jpg$/) || [])[1]) || 0);
  const frameAt = (sec) => {
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= sec * 1000) lo = mid; else hi = mid - 1; }
    return lo;
  };

  const total = Math.round(TOTAL * FPS);
  const plan = []; // por quadro de saída: { shot, local, u, idx }
  for (let o = 0; o < total; o++) {
    const t = o / FPS;
    const shot = SHOTS.find((s) => t >= s.start && t < s.start + s.dur) || SHOTS[SHOTS.length - 1];
    const local = t - shot.start;
    const u = local / shot.dur;
    const recT = shot.rec ? lerp(shot.rec[0], shot.rec[1], u) : null;
    plan.push({ t, shot, local, u, recT, idx: recT === null ? null : frameAt(recT) });
  }

  const AHEAD = 10;
  const cache = new Map();
  const want = (o) => {
    const p = plan[o];
    if (!p || p.idx === null || cache.has(p.idx)) return;
    cache.set(p.idx, createImageBitmap(new Blob([fs.readFileSync(path.join(CONFIG.frames, files[p.idx]))], { type: 'image/jpeg' })));
  };
  for (let o = 0; o < AHEAD; o++) want(o);

  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028', videoBitsPerSecond: 12_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();

  const t0 = performance.now();
  for (let o = 0; o < total; o++) {
    const p = plan[o];
    seed = 1 + o * 7919; // glitch determinístico por quadro
    const { shot, local, u } = p;
    if (shot.kind === 'hook') {
      hook(local);
    } else if (shot.kind === 'end') {
      endCard(local);
    } else {
      want(o); // pode faltar se um plano anterior já descartou este quadro
      const img = await cache.get(p.idx);
      want(o + AHEAD);
      const k = img.width / W; // gravação pode estar em escala maior que 1920
      const e = ease(u);
      const [x, y, w, h] = shot.from.map((v, i) => lerp(v, shot.to[i], e) * k);
      ctx.drawImage(img, x, y, w, h, 0, 0, W, H);
      const usedSoon = plan.slice(o + 1, o + 1 + AHEAD).some((q) => q.idx === p.idx);
      if (!usedSoon) { cache.delete(p.idx); img.close(); }
      // clarão extra nas trocas de tema
      if (shot.flashes) {
        for (const f of shot.flashes) {
          const d = Math.abs(p.recT - f);
          if (d < 0.18) glitch(0.6 * (1 - d / 0.18));
        }
      }
      label(shot, u, local);
      scanlines();
    }
    // transição glitch nas trocas de plano
    for (const s of SHOTS.slice(1)) {
      const d = Math.abs(p.t - s.start);
      if (d < 0.14) glitch(1 - d / 0.14);
    }
    // barra de progresso
    if (p.t >= PROGRESS[0] && p.t < PROGRESS[1]) {
      ctx.fillStyle = 'rgba(170,207,209,0.15)';
      ctx.fillRect(0, H - 5, W, 5);
      ctx.fillStyle = `rgb(${ACC})`;
      ctx.fillRect(0, H - 5, W * ((p.t - PROGRESS[0]) / (PROGRESS[1] - PROGRESS[0])), 5);
    }
    track.requestFrame();
    const due = t0 + ((o + 1) * 1000) / FPS;
    await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
  }
  const real = (performance.now() - t0) / 1000;
  ipcRenderer.send('log', `${total} quadros em ${real.toFixed(1)} s (alvo ${TOTAL.toFixed(1)} s)`);
  rec.stop();
  await new Promise((r) => { rec.onstop = r; });
  ipcRenderer.send('done', Buffer.from(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer()));

  function endCard(t) {
    backdrop();
    const cx = W / 2;
    // ícone entra com escala e brilho
    const s = lerp(0.6, 1, easeOut(t / 0.45));
    ctx.save();
    ctx.globalAlpha = clamp(t / 0.3);
    ctx.translate(cx, 300);
    ctx.scale(s, s);
    ctx.shadowColor = `rgba(${ACC},0.7)`;
    ctx.shadowBlur = 40;
    ctx.drawImage(icon, -100, -100, 200, 200);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = '600 170px Rajdhani';
    ctx.letterSpacing = '44px';
    ctx.fillStyle = 'rgba(236,248,250,0.98)';
    ctx.shadowColor = 'rgba(170,207,209,0.55)';
    ctx.shadowBlur = 28;
    if (t > 0.25) ctx.fillText(decode('NEXUS', (t - 0.25) / 0.7), cx + 22, 585);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
    const fade = (a) => clamp((t - a) / 0.35);
    ctx.globalAlpha = fade(1.0);
    ctx.font = '500 54px Rajdhani';
    ctx.fillStyle = 'rgba(170,207,209,0.92)';
    ctx.fillText(TXT.tagline, cx, 680);
    ctx.globalAlpha = fade(1.2);
    ctx.font = '500 36px Rajdhani';
    ctx.fillStyle = 'rgba(170,207,209,0.6)';
    ctx.fillText(TXT.meta, cx, 740);
    ctx.globalAlpha = 1;
    const link = 'github.com/gabterm/nexus';
    const n = Math.floor(clamp((t - 1.4) / 0.8) * link.length);
    ctx.font = '500 48px ShareTech';
    ctx.fillStyle = `rgb(${ACC})`;
    ctx.fillText(link.slice(0, n) + (n < link.length && t > 1.4 ? '_' : ''), cx, 850);
    if (t > 2.3) {
      ctx.globalAlpha = fade(2.3) * (0.75 + 0.25 * Math.sin((t - 2.3) * 5));
      ctx.font = '600 40px Rajdhani';
      ctx.fillStyle = `rgb(${PINK})`;
      ctx.fillText(TXT.cta, cx, 940);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    scanlines();
  }
})().catch((err) => ipcRenderer.send('fail', String((err && err.stack) || err)));
