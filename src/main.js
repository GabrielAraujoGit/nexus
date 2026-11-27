'use strict';
// NEXUS — processo principal: janela, shell (pty) e coleta de métricas do sistema.
const { app, BrowserWindow, ipcMain, shell: electronShell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const net = require('node:net');
const { execFile } = require('node:child_process');
const si = require('systeminformation');
const { setupWeb } = require('./web');
const { setupMusic } = require('./music');

let pty = null;
try {
  pty = require('node-pty');
} catch {
  pty = null; // sem node-pty o terminal mostra como instalar
}

// Modo demo (NEXUS_DEMO=1): troca usuário, máquina, IP e processos por valores fictícios.
// Usado para gerar as capturas de tela do README sem expor dados de quem roda.
const DEMO = process.env.NEXUS_DEMO === '1';
const DEMO_HOME = process.env.NEXUS_DEMO_HOME || os.homedir();
const DEMO_PROCS = [
  { pid: 4182, name: 'nexus', cpu: 6.1, mem: 1.4 },
  { pid: 2290, name: 'firefox', cpu: 4.3, mem: 6.2 },
  { pid: 3317, name: 'node', cpu: 3.8, mem: 2.1 },
  { pid: 1734, name: 'gnome-shell', cpu: 2.6, mem: 1.9 },
  { pid: 2051, name: 'pipewire', cpu: 1.2, mem: 0.3 },
  { pid: 3920, name: 'code', cpu: 0.9, mem: 3.7 },
];
const homeDir = () => (DEMO ? DEMO_HOME : os.homedir());

let win = null;
let term = null;
let lastCwd = null;
const timers = [];

// Capturas de tela usam um perfil temporário: não leem nem gravam tema, som etc. de quem roda.
// Modo de captura (fora da tela, tamanho fixo, dados demo): print (NEXUS_SNAPSHOT) ou gravação (NEXUS_RECORD).
if (process.env.NEXUS_RECORD) process.env.NEXUS_CAPTURE = 'record';
else if (process.env.NEXUS_SNAPSHOT) process.env.NEXUS_CAPTURE = 'snapshot';
const CAPTURE = process.env.NEXUS_CAPTURE || '';

if (CAPTURE) {
  // pasta fixa, zerada a cada captura (apagar na saída falha: o Chromium ainda grava depois do quit)
  const profile = path.join(os.tmpdir(), `nexus-snapshot-${process.getuid?.() ?? 'user'}`);
  require('node:fs').rmSync(profile, { recursive: true, force: true });
  app.setPath('userData', profile);
}

function createWindow() {
  const snapshotMode = Boolean(CAPTURE);
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#05080d',
    autoHideMenuBar: true,
    show: false,
    title: 'NEXUS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required', // som do boot
      offscreen: snapshotMode, // captura fora da tela: tamanho fixo, independente do monitor
    },
  });

  win.removeMenu();
  const theme = process.env.NEXUS_THEME;
  const query = {};
  if (theme) query.theme = theme;
  if (snapshotMode) query.snapshot = '1'; // capturas: sem som, sem alertas, com histórico fictício
  if (CAPTURE === 'record') query.record = '1'; // gravação: animações ligadas
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  // página (re)carregada: reenvia a lista de arquivos
  win.webContents.on('did-finish-load', () => {
    lastCwd = null;
    // Zoom sempre em 100% fora das capturas: o Chromium salva o zoom por página no perfil, e um zoom
    // antigo (ou um Ctrl+roda acidental) deixava a interface enorme e o terminal com poucas colunas.
    if (!snapshotMode) {
      win.webContents.setZoomFactor(1);
      win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    }
  });
  if (!snapshotMode) {
    // Ctrl+roda do mouse não muda o zoom
    win.webContents.on('zoom-changed', () => win.webContents.setZoomFactor(1));
  }
  win.once('ready-to-show', () => {
    if (snapshotMode) {
      // layout de 1600x900 renderizado em 2x (nítido em telas retina e no zoom do GitHub)
      const scale = Number(process.env.NEXUS_SNAPSHOT_SCALE) || 2;
      // NEXUS_SNAPSHOT_SIZE=1920x1080 testa outras resoluções (padrão 1600x900)
      const [sw, sh] = (process.env.NEXUS_SNAPSHOT_SIZE || '1600x900').split('x').map(Number);
      win.setContentSize((sw || 1600) * scale, (sh || 900) * scale);
      win.webContents.setZoomFactor(scale);
      return;
    }
    win.maximize();
    win.show();
  });

  // NEXUS_RECORD=/pasta: grava quadros PNG (NEXUS_RECORD_FPS, NEXUS_RECORD_SECONDS) enquanto o
  // roteiro NEXUS_SNAPSHOT_JS roda; scripts/demo.sh junta os quadros em GIF/WebP.
  if (CAPTURE === 'record') {
    // Offscreen: o Electron entrega cada quadro pintado no evento 'paint'. Guardamos o último e o
    // amostramos no ritmo do vídeo (quadro repetido quando nada mudou), em JPEG por ser rápido.
    const dir = process.env.NEXUS_RECORD;
    const fps = Number(process.env.NEXUS_RECORD_FPS) || 10;
    const total = Math.round((Number(process.env.NEXUS_RECORD_SECONDS) || 12) * fps);
    let latest = null;
    win.webContents.setFrameRate(Math.max(fps * 2, 30));
    win.webContents.on('paint', (_e, _dirty, image) => { latest = image; });
    win.webContents.once('did-finish-load', async () => {
      await fs.mkdir(dir, { recursive: true });
      if (process.env.NEXUS_SNAPSHOT_JS) {
        win.webContents.executeJavaScript(process.env.NEXUS_SNAPSHOT_JS).catch((err) => console.error(err.message));
      }
      // página do mini navegador dentro da moldura (a view não entra nos quadros da janela)
      const webTimer = setInterval(async () => {
        const page = await web.capture().catch(() => null);
        if (page) send('web:snapshot', page.toDataURL());
      }, 1000);
      const writes = [];
      const start = Date.now();
      for (let i = 0; i < total; i++) {
        const due = start + (i * 1000) / fps;
        await new Promise((r) => setTimeout(r, Math.max(0, due - Date.now())));
        // o nome leva o instante real (ms): se a captura atrasar, quem monta o vídeo usa o tempo certo
        const ms = String(Date.now() - start).padStart(6, '0');
        if (latest) writes.push(fs.writeFile(path.join(dir, `frame-${String(i).padStart(4, '0')}-${ms}.jpg`), latest.toJPEG(90)));
      }
      clearInterval(webTimer);
      await Promise.all(writes);
      app.quit();
    });
  }

  // NEXUS_SNAPSHOT=/caminho.png: tira um print da janela e fecha (para testes).
  const snapshot = process.env.NEXUS_SNAPSHOT;
  if (snapshot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (process.env.NEXUS_SNAPSHOT_JS) {
          console.log(await win.webContents.executeJavaScript(process.env.NEXUS_SNAPSHOT_JS));
        }
        // mini navegador aberto: a imagem da página vai para dentro da moldura antes da captura
        const page = await web.capture();
        if (page) {
          send('web:snapshot', page.toDataURL());
          await new Promise((r) => setTimeout(r, 500));
        }
        const img = await win.webContents.capturePage();
        await fs.writeFile(snapshot, img.toPNG());
        app.quit();
      }, Number(process.env.NEXUS_SNAPSHOT_DELAY) || 5000);
    });
  }

  // Nada de navegar para fora do app; links abrem no navegador do sistema.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) electronShell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.key === 'F12' && input.control && input.shift) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- Terminal ----------
function spawnShell(cols, rows) {
  if (!pty) {
    send('pty:data',
      '\r\n\x1b[1;31m[ node-pty não instalado ]\x1b[0m\r\n\r\n' +
      '  Rode no terminal:\r\n' +
      '    sudo apt install -y build-essential\r\n' +
      '    cd ~/projetos/nexus-term && npm run setup-pty\r\n');
    return;
  }
  if (term) return;
  const shellPath = process.env.SHELL || '/bin/bash';
  const args = DEMO ? ['--rcfile', path.join(DEMO_HOME, '.bashrc'), '-i'] : ['-l'];
  term = pty.spawn(DEMO ? '/bin/bash' : shellPath, args, {
    name: 'xterm-256color',
    cols: Math.max(cols, 20),
    rows: Math.max(rows, 5),
    cwd: homeDir(),
    env: { ...process.env, ...(DEMO ? { HOME: DEMO_HOME, USER: 'operator' } : {}), TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'nexus' },
  });
  term.onData((d) => send('pty:data', d));
  term.onExit(() => {
    term = null;
    if (win && !win.isDestroyed()) win.close();
  });
}

ipcMain.on('pty:spawn', (_e, size) => {
  const cols = Number(size?.cols) || 80;
  const rows = Number(size?.rows) || 24;
  spawnShell(cols, rows);
});
ipcMain.on('pty:write', (_e, data) => {
  if (term && typeof data === 'string') term.write(data);
});
ipcMain.on('pty:resize', (_e, size) => {
  const cols = Number(size?.cols);
  const rows = Number(size?.rows);
  if (term && cols > 0 && rows > 0) term.resize(cols, rows);
});

// ---------- Pasta atual do shell e arquivos ----------
async function shellCwd() {
  if (!term) return homeDir();
  try {
    return await fs.readlink(`/proc/${term.pid}/cwd`);
  } catch {
    return lastCwd || homeDir();
  }
}

async function listDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = entries
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, dir: e.isDirectory() }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return { total: items.length, items: items.slice(0, 80) };
}

async function pollCwd() {
  const cwd = await shellCwd();
  if (cwd === lastCwd) return;
  lastCwd = cwd;
  try {
    const { total, items } = await listDir(cwd);
    send('fs:list', { cwd, home: homeDir(), total, items });
  } catch (err) {
    send('fs:list', { cwd, home: homeDir(), total: 0, items: [], error: err.code || 'erro' });
  }
}

// ---------- Métricas ----------
async function staticInfo() {
  const [cpu, osInfo, mem, battery, graphics] = await Promise.all([
    si.cpu(), si.osInfo(), si.mem(), si.battery().catch(() => ({ hasBattery: false })),
    si.graphics().catch(() => ({ controllers: [] })),
  ]);
  const gpus = graphics.controllers.filter((c) => c.model).map((c) => ({ model: c.model, vendor: c.vendor || '', vram: c.vram || null }));
  // uso/temperatura de GPU só vêm de drivers que expõem isso sem root (ex.: NVIDIA); Intel/AMD ficam sem
  gpuPollable = graphics.controllers.some((c) => Number.isFinite(c.utilizationGpu));
  return {
    cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(),
    cores: os.cpus().length,
    distro: `${osInfo.distro} ${osInfo.release}`,
    kernel: osInfo.kernel,
    hostname: DEMO ? 'nexus' : os.hostname(),
    user: DEMO ? 'operator' : os.userInfo().username.split('@')[0],
    memTotal: mem.total,
    hasBattery: Boolean(battery.hasBattery),
    gpus,
    version: app.getVersion(),
  };
}

let netPrev = null;
async function fastTick() {
  const [load, mem, net, speed] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.networkStats().catch(() => []),
    si.cpuCurrentSpeed().catch(() => ({ avg: null })),
  ]);
  const iface = net.find((n) => n.operstate === 'up') || net[0];
  let rx = 0;
  let tx = 0;
  if (iface && netPrev && iface.iface === netPrev.iface) {
    const dt = Math.max((iface.ms || 1000) / 1000, 0.5);
    rx = Math.max(iface.rx_bytes - netPrev.rx_bytes, 0) / dt;
    tx = Math.max(iface.tx_bytes - netPrev.tx_bytes, 0) / dt;
  }
  if (iface) netPrev = iface;

  // modo demo: carga de CPU fictícia e suave (a gravação em si pesa e mostraria a máquina no limite)
  const demoT = Date.now() / 1000;
  const demoCores = load.cpus.map((_, i) => 22 + 14 * Math.sin(demoT / 3 + i) + 6 * Math.sin(demoT * 1.7 + i * 2));
  send('sys:tick', {
    now: Date.now(),
    uptime: os.uptime(),
    cores: DEMO ? demoCores : load.cpus.map((c) => c.load),
    load: DEMO ? demoCores.reduce((a, b) => a + b, 0) / demoCores.length : load.currentLoad,
    // modo demo (capturas do README): memória e temperatura fictícias, não as da máquina de quem roda
    temp: DEMO ? 54 : cache.temp,
    memUsed: DEMO ? mem.total * 0.42 : mem.active,
    memAvailable: DEMO ? mem.total * 0.55 : mem.available,
    memTotal: mem.total,
    ghz: speed.avg,
    loadavg: os.loadavg(),
    swapUsed: DEMO ? 512 * 1024 ** 2 : mem.swapused,
    swapTotal: mem.swaptotal,
    net: iface ? {
      iface: iface.iface, rx, tx, rxTotal: iface.rx_bytes, txTotal: iface.tx_bytes,
    } : null,
    battery: cache.battery,
  });
}

// Dados que mudam pouco ficam em cache e são atualizados em ritmo próprio (alguns disparam
// comandos do sistema e custam centenas de ms, como a lista de interfaces de rede).
const cache = {
  temp: null, battery: null, gpu: null,
  ip4: '—', ip6: '', iface: '—', online: false, conn: '—', gw: '', dns: [],
  ping: null, loss: null, disks: [],
};
let gpuPollable = false;
const DEMO_NET = { ip4: '192.168.0.42', ip6: 'fe80::a8c0:42ff:fe00:42', iface: 'eth0', conn: 'Ethernet · 1000 Mb/s', gw: '192.168.0.1', dns: ['1.1.1.1', '9.9.9.9'] };

async function sensorsTick() { // 5 s
  const [temp, battery, graphics] = await Promise.all([
    si.cpuTemperature().catch(() => ({ main: null })),
    si.battery().catch(() => ({ hasBattery: false })),
    gpuPollable ? si.graphics().catch(() => null) : null,
  ]);
  cache.temp = temp.main;
  cache.battery = battery.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null;
  const g = graphics?.controllers.find((c) => Number.isFinite(c.utilizationGpu));
  cache.gpu = g ? { util: g.utilizationGpu, temp: g.temperatureGpu ?? null, memUsed: g.memoryUsed ?? null, memTotal: g.memoryTotal ?? null } : null;
}

// DNS em uso: o arquivo do systemd-resolved lista os servidores reais (o /etc/resolv.conf costuma ter só o 127.0.0.53).
async function readDns() {
  for (const file of ['/run/systemd/resolve/resolv.conf', '/etc/resolv.conf']) {
    try {
      const text = await fs.readFile(file, 'utf8');
      const list = [...text.matchAll(/^nameserver\s+(\S+)/gm)].map((m) => m[1]).filter((ip) => net.isIP(ip));
      if (list.length) return list.slice(0, 3);
    } catch { /* tenta o próximo */ }
  }
  return [];
}

async function networkInfoTick() { // 30 s
  const [ifaces, gw, dns] = await Promise.all([
    si.networkInterfaces().catch(() => []),
    si.networkGatewayDefault().catch(() => ''),
    readDns(),
  ]);
  const list = Array.isArray(ifaces) ? ifaces : [ifaces];
  const main = list.find((i) => i.default) || list.find((i) => i.ip4 && !i.internal);
  cache.ip4 = main?.ip4 || '—';
  cache.ip6 = main?.ip6 || '';
  cache.iface = main?.iface || '—';
  cache.online = Boolean(main?.ip4);
  cache.gw = net.isIP(gw) ? gw : '';
  cache.dns = dns;
  if (main?.type === 'wireless') {
    const wifi = (await si.wifiConnections().catch(() => []))[0];
    cache.conn = wifi?.ssid ? `Wi-Fi · ${wifi.ssid}${wifi.quality ? ` · ${wifi.quality}%` : ''}` : 'Wi-Fi';
  } else if (main) {
    cache.conn = `Ethernet${main.speed ? ` · ${main.speed} Mb/s` : ''}`;
  } else {
    cache.conn = '—';
  }
}

// Latência e perda: 4 pings rápidos só no gateway da rede local (nada sai para a internet).
// O IP é validado e vai como argumento (execFile, sem shell).
function pingTick() { // 10 s
  if (!cache.gw || !net.isIP(cache.gw)) {
    cache.ping = null;
    cache.loss = null;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile('ping', ['-n', '-q', '-c', '4', '-i', '0.25', '-W', '1', cache.gw], { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }, (_err, stdout) => {
      const out = String(stdout || '');
      const loss = out.match(/([\d.]+)% packet loss/);
      const rtt = out.match(/= [\d.]+\/([\d.]+)\//);
      cache.loss = loss ? Number(loss[1]) : null;
      cache.ping = rtt ? Number(rtt[1]) : null;
      resolve();
    });
  });
}

// Discos de verdade (sem tmpfs, efivars, snaps...), maiores primeiro.
const PSEUDO_FS = /^(tmpfs|devtmpfs|efivarfs|squashfs|overlay|proc|sysfs|ramfs|fuse\..*)$/;
async function diskTick() { // 30 s
  const list = await si.fsSize().catch(() => []);
  cache.disks = list
    .filter((f) => !PSEUDO_FS.test(f.type) && f.size > 2e9 && !/^\/(snap|boot)(\/|$)/.test(f.mount))
    .sort((a, b) => b.size - a.size)
    .slice(0, 3)
    .map((f) => ({ mount: f.mount, size: f.size, used: f.used, use: f.use }));
}

async function slowTick() { // 3 s: processos
  const procs = await si.processes();
  const cwd = lastCwd || homeDir();
  const mount = cache.disks
    .filter((f) => cwd.startsWith(f.mount))
    .sort((a, b) => b.mount.length - a.mount.length)[0];
  const n = DEMO ? DEMO_NET : cache;

  send('sys:slow', {
    tasks: procs.all,
    top: DEMO ? DEMO_PROCS : procs.list
      .filter((p) => p.name !== 'ps' && p.parentPid !== process.pid) // ps/sh da própria coleta
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 6)
      .map((p) => ({ pid: p.pid, name: p.name, cpu: p.cpu, mem: p.mem })),
    net: {
      online: cache.online, ip4: n.ip4, ip6: n.ip6, iface: n.iface, conn: n.conn, gw: n.gw, dns: n.dns,
      ping: cache.ping, loss: cache.loss,
    },
    gpu: cache.gpu,
    disks: cache.disks,
    mount: mount ? { mount: mount.mount, use: mount.use } : null,
  });
}

// Janela minimizada ou escondida: não coleta nada (as capturas usam janela fora da tela, então seguem).
const idle = () => !CAPTURE && (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible());

function loop(fn, ms) {
  let busy = false; // não empilha chamadas se uma coleta demorar mais que o intervalo
  const run = (force = false) => {
    if (busy || (!force && idle())) return Promise.resolve();
    busy = true;
    return fn().catch((err) => console.error(`[nexus] ${fn.name}:`, err.message)).finally(() => { busy = false; });
  };
  timers.push(setInterval(run, ms));
  return run(true); // primeira coleta já na abertura, mesmo antes da janela aparecer
}

ipcMain.handle('sys:static', () => staticInfo());
const web = setupWeb(() => win);
if (!CAPTURE) setupMusic(() => win); // capturas não abrem o player (usam perfil temporário)
// Capturas com NEXUS_DEMO_MUSIC=1: uma faixa fictícia tocando, para o mini player aparecer.
if (CAPTURE && process.env.NEXUS_DEMO_MUSIC === '1') {
  const { nativeImage } = require('electron');
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  const art = icon.isEmpty() ? '' : icon.resize({ width: 120 }).toDataURL();
  const dur = 212;
  let pos = 74;
  let at = Date.now();
  const now = () => pos + (process.env.NEXUS_DEMO_MUSIC_PAUSED === '1' ? 0 : (Date.now() - at) / 1000);
  ipcMain.on('music:seek', (_e, f) => {
    if (typeof f !== 'number' || !Number.isFinite(f)) return;
    pos = Math.min(Math.max(f, 0), 1) * dur;
    at = Date.now();
  });
  setInterval(() => {
    send('music:state', {
      open: true, title: 'Grid Runner', artist: 'Neon Circuit', album: 'Sinal', art,
      playing: process.env.NEXUS_DEMO_MUSIC_PAUSED !== '1', pos: Math.min(now(), dur), dur,
    });
  }, 1000);
}

// Uma janela só: rodar `nexus` de novo traz a janela aberta para a frente (e a restaura se minimizada).
// Capturas usam perfil próprio, então não esbarram na janela de quem está usando o app.
const primary = Boolean(CAPTURE) || app.requestSingleInstanceLock();
if (!primary) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  if (!primary) return; // segunda instância: só avisou a primeira e está saindo
  createWindow();
  loop(sensorsTick, 5000);
  loop(diskTick, 30000);
  loop(networkInfoTick, 30000).then(() => loop(pingTick, 10000)); // ping precisa do gateway
  loop(fastTick, 1000);
  loop(slowTick, 3000);
  loop(pollCwd, 800);
});

app.on('window-all-closed', () => {
  timers.forEach(clearInterval);
  if (term) term.kill();
  app.quit();
});
