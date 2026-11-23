'use strict';
// NEXUS — processo principal: janela, shell (pty) e coleta de métricas do sistema.
const { app, BrowserWindow, ipcMain, shell: electronShell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const si = require('systeminformation');

let pty = null;
try {
  pty = require('node-pty');
} catch {
  pty = null; // sem node-pty o terminal mostra como instalar
}

let win = null;
let term = null;
let lastCwd = null;
const timers = [];

function createWindow() {
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
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // página (re)carregada: reenvia a lista de arquivos
  win.webContents.on('did-finish-load', () => {
    lastCwd = null;
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // NEXUS_SNAPSHOT=/caminho.png: tira um print da janela e fecha (para testes).
  const snapshot = process.env.NEXUS_SNAPSHOT;
  if (snapshot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (process.env.NEXUS_SNAPSHOT_JS) {
          console.log(await win.webContents.executeJavaScript(process.env.NEXUS_SNAPSHOT_JS));
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
  term = pty.spawn(shellPath, ['-l'], {
    name: 'xterm-256color',
    cols: Math.max(cols, 20),
    rows: Math.max(rows, 5),
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'nexus' },
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
  if (!term) return os.homedir();
  try {
    return await fs.readlink(`/proc/${term.pid}/cwd`);
  } catch {
    return lastCwd || os.homedir();
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
    send('fs:list', { cwd, home: os.homedir(), total, items });
  } catch (err) {
    send('fs:list', { cwd, home: os.homedir(), total: 0, items: [], error: err.code || 'erro' });
  }
}

// ---------- Métricas ----------
async function staticInfo() {
  const [cpu, osInfo, mem, battery] = await Promise.all([
    si.cpu(), si.osInfo(), si.mem(), si.battery().catch(() => ({ hasBattery: false })),
  ]);
  return {
    cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(),
    cores: os.cpus().length,
    distro: `${osInfo.distro} ${osInfo.release}`,
    kernel: osInfo.kernel,
    hostname: os.hostname(),
    user: os.userInfo().username.split('@')[0],
    memTotal: mem.total,
    hasBattery: Boolean(battery.hasBattery),
  };
}

let netPrev = null;
async function fastTick() {
  const [load, mem, temp, net, battery] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpuTemperature().catch(() => ({ main: null })),
    si.networkStats().catch(() => []),
    si.battery().catch(() => ({ hasBattery: false })),
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

  send('sys:tick', {
    now: Date.now(),
    uptime: os.uptime(),
    cores: load.cpus.map((c) => c.load),
    load: load.currentLoad,
    temp: temp.main,
    memUsed: mem.active,
    memTotal: mem.total,
    swapUsed: mem.swapused,
    net: iface ? {
      iface: iface.iface, rx, tx, rxTotal: iface.rx_bytes, txTotal: iface.tx_bytes,
    } : null,
    battery: battery.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null,
  });
}

async function slowTick() {
  const [procs, ifaces, gw, fsSize] = await Promise.all([
    si.processes(),
    si.networkInterfaces().catch(() => []),
    si.networkGatewayDefault().catch(() => ''),
    si.fsSize().catch(() => []),
  ]);
  const list = Array.isArray(ifaces) ? ifaces : [ifaces];
  const main = list.find((i) => i.default) || list.find((i) => i.ip4 && !i.internal);
  // Ping só no gateway da rede local: nada sai para a internet.
  const ping = gw ? await si.inetLatency(gw).catch(() => null) : null;
  const cwd = lastCwd || os.homedir();
  const mount = fsSize
    .filter((f) => cwd.startsWith(f.mount))
    .sort((a, b) => b.mount.length - a.mount.length)[0];

  send('sys:slow', {
    tasks: procs.all,
    top: procs.list
      .filter((p) => p.name !== 'ps' && p.parentPid !== process.pid) // ps/sh da própria coleta
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 6)
      .map((p) => ({ pid: p.pid, name: p.name, cpu: p.cpu, mem: p.mem })),
    ip4: main?.ip4 || '—',
    iface: main?.iface || '—',
    online: Boolean(main?.ip4),
    ping,
    mount: mount ? { mount: mount.mount, use: mount.use } : null,
  });
}

function loop(fn, ms) {
  const run = () => fn().catch((err) => console.error(`[nexus] ${fn.name}:`, err.message));
  run();
  timers.push(setInterval(run, ms));
}

ipcMain.handle('sys:static', () => staticInfo());

app.whenReady().then(() => {
  createWindow();
  loop(fastTick, 1000);
  loop(slowTick, 3000);
  loop(pollCwd, 800);
});

app.on('window-all-closed', () => {
  timers.forEach(clearInterval);
  if (term) term.kill();
  app.quit();
});
