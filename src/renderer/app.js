'use strict';
// NEXUS — interface: liga terminal, painéis e teclado aos dados do processo principal.
(function () {
  const $ = (id) => document.getElementById(id);
  const { LineGraph, themeRGB } = window.NexusGraphs;

  const THEMES = ['tron', 'cyberpunk', 'ambar'];
  const THEME_NAMES = { tron: 'Tron', cyberpunk: 'Cyberpunk', ambar: 'Âmbar' };
  const ANSI = {
    tron: ['#0b1418', '#ff5f6d', '#5cf0a0', '#ffd479', '#5cb8ff', '#c792ea', '#5cf0ff', '#aacfd1',
      '#3a5560', '#ff8a94', '#8bffc0', '#ffe4a3', '#8fd0ff', '#ddb6ff', '#9ff6ff', '#e6fbfc'],
    cyberpunk: ['#1a1030', '#ff2b6d', '#00ff41', '#ffd700', '#b026ff', '#ff2bd6', '#00e5ff', '#c8facc',
      '#4a3b6b', '#ff5c8a', '#5cff7a', '#ffe45c', '#c566ff', '#ff6be3', '#5cf0ff', '#ffffff'],
    ambar: ['#1a1200', '#ff6b3d', '#c8d64a', '#ffb000', '#d9a440', '#ff9a5c', '#ffd078', '#ffcc66',
      '#4d3a10', '#ff8f6b', '#e0ec7a', '#ffc94d', '#ecc070', '#ffb88a', '#ffe0a3', '#fff2d6'],
  };
  const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];

  let theme = 'tron';
  try {
    const saved = localStorage.getItem('nexus.theme');
    if (THEMES.includes(saved)) theme = saved;
  } catch { /* sem localStorage: fica o padrão */ }
  const forced = new URLSearchParams(location.search).get('theme'); // NEXUS_THEME
  if (THEMES.includes(forced)) theme = forced;
  document.documentElement.dataset.theme = theme;

  const sound = window.NexusSound;
  const SNAPSHOT = new URLSearchParams(location.search).has('snapshot');
  if (SNAPSHOT) document.documentElement.classList.add('snapshot');
  // Reinicia uma animação CSS: tira a classe, força o reflow e põe de novo.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ---------- Formatação ----------
  const pad = (n) => String(n).padStart(2, '0');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function bytes(n, suffix = '') {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n || 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}${suffix}`;
  }
  function duration(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${h}:${pad(m)}:${pad(s)}`;
  }
  const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

  // ---------- Terminal ----------
  // Mistura a cor do tema com o fundo (0..1): texto do terminal menos gritante que a cor pura.
  function soften(rgb, bgHex, amount) {
    const fg = rgb.split(',').map(Number);
    const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
    const mix = fg.map((c, i) => Math.round(c * amount + bg[i] * (1 - amount)));
    return `rgb(${mix.join(',')})`;
  }
  function termTheme() {
    const rgb = themeRGB();
    const acc = themeRGB('--accent-rgb');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const t = {
      background: bg,
      foreground: soften(rgb, bg, 0.86),
      cursor: `rgb(${acc})`,
      cursorAccent: bg,
      selectionBackground: `rgba(${rgb},0.3)`,
    };
    ANSI[theme].forEach((c, i) => { t[ANSI_KEYS[i]] = c; });
    return t;
  }

  const term = new window.Terminal({
    fontFamily: '"MesloLGS NF", "JetBrains Mono", monospace',
    fontSize: 14,
    lineHeight: 1.15,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    allowProposedApi: false,
    theme: termTheme(),
  });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);

  // Ctrl+Shift+C / Ctrl+Shift+V copiam e colam, como no GNOME Terminal
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
    if (e.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      return false;
    }
    if (e.code === 'KeyV') {
      navigator.clipboard.readText().then((txt) => term.paste(txt)).catch(() => {});
      return false;
    }
    return true;
  });

  function startTerminal() {
    term.open($('terminal'));
    try {
      const webgl = new window.WebglAddon.WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch { /* sem WebGL: usa o renderizador padrão */ }
    fit.fit();
    window.nexus.onData((d) => term.write(d));
    term.onData((d) => window.nexus.write(d));
    term.onResize(({ cols, rows }) => window.nexus.resize(cols, rows));
    term.onTitleChange((t) => { $('term-title').textContent = t || 'SHELL PRINCIPAL'; });
    window.nexus.spawn(term.cols, term.rows);
    new ResizeObserver(() => fit.fit()).observe($('terminal'));
    term.focus();
  }
  document.addEventListener('mouseup', (e) => {
    if (e.target instanceof Element && e.target.closest('#web')) return; // mini navegador cuida do foco
    if (!window.getSelection()?.toString()) term.focus();
  });

  // ---------- Som de digitação ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') sound.play('enter');
    else if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Tab') sound.play('key');
  }, true);

  // ---------- Relógio ----------
  function clock() {
    const d = new Date();
    $('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('year').textContent = d.getFullYear();
    $('date').textContent = `${pad(d.getDate())} ${MESES[d.getMonth()]}`;
  }
  clock();
  setInterval(clock, 1000);

  // ---------- Memória (grade de pontos) ----------
  const MEM_DOTS = 40 * 6;
  const memGrid = $('mem-grid');
  for (let i = 0; i < MEM_DOTS; i++) memGrid.append(document.createElement('i'));
  const memCells = [...memGrid.children];

  // ---------- Gráficos ----------
  // CPU: 60 s de histórico em área, com escala; barras por núcleo logo abaixo
  const cpuGraph = new LineGraph($('cpu-graph'), { series: 1, max: 100, size: 60, area: true, yLabels: true });
  const coreBars = [];
  let cpuSamples = 0;
  if (SNAPSHOT) { // capturas do README: histórico fictício e suave, para o gráfico não sair vazio
    cpuGraph.data[0] = cpuGraph.data[0].map((_, i) => 28 + 14 * Math.sin(i / 6) + 6 * Math.sin(i / 2.3));
    cpuSamples = cpuGraph.size;
  }
  function ensureCoreBars(n) {
    if (coreBars.length === n) return;
    const box = $('core-bars');
    box.replaceChildren();
    coreBars.length = 0;
    for (let i = 0; i < n; i++) {
      const col = document.createElement('div');
      col.className = 'core';
      const bar = document.createElement('i');
      const label = document.createElement('small');
      label.textContent = i + 1;
      col.append(bar, label);
      col.title = `Núcleo ${i + 1}`;
      box.append(col);
      coreBars.push(bar);
    }
  }
  const netGraph = new LineGraph($('net-graph'), { series: 2, size: 90 });
  new window.NexusGlobe($('globe'));

  window.nexus.staticInfo().then((info) => {
    $('cpu-model').textContent = info.cpu;
    $('cores').textContent = info.cores;
    $('host').textContent = `${info.user}@${info.hostname} · ${info.distro} · kernel ${info.kernel}`;
    ensureCoreBars(info.cores);
  }).catch(() => {});

  window.nexus.onTick((t) => {
    cpuGraph.push(t.load);
    cpuSamples = Math.min(cpuSamples + 1, cpuGraph.size);
    const recent = cpuGraph.data[0].slice(-cpuSamples); // só amostras reais, sem os zeros iniciais
    $('cpu-now').textContent = `${t.load.toFixed(0)}%`;
    $('cpu-avg').textContent = `${(recent.reduce((x, y) => x + y, 0) / recent.length).toFixed(0)}%`;
    ensureCoreBars(t.cores.length);
    t.cores.forEach((v, i) => {
      coreBars[i].style.setProperty('--h', `${Math.max(2, Math.min(100, v))}%`);
      coreBars[i].classList.toggle('hot', v >= 90);
    });
    $('temp').textContent = t.temp ? `${t.temp.toFixed(0)}°C` : '--°C';
    $('uptime').textContent = duration(t.uptime);

    const ratio = t.memUsed / t.memTotal;
    const on = Math.round(ratio * MEM_DOTS);
    memCells.forEach((c, i) => c.classList.toggle('on', i < on));
    $('mem-text').textContent = `usando ${bytes(t.memUsed)} de ${bytes(t.memTotal)}`;
    $('swap-text').textContent = `Swap ${bytes(t.swapUsed)}`;
    $('swap-bar').style.width = `${Math.min(100, (t.swapUsed / t.memTotal) * 100)}%`;

    if (t.net) {
      netGraph.push(t.net.rx, t.net.tx);
      $('rx').textContent = bytes(t.net.rx, '/s');
      $('tx').textContent = bytes(t.net.tx, '/s');
      $('net-total').textContent = `Total ↓ ${bytes(t.net.rxTotal)} · ↑ ${bytes(t.net.txTotal)}`;
    }
    alerts({ cpu: t.load >= 90, temp: t.temp >= 85, mem: ratio >= 0.9 });
    $('power').textContent = t.battery
      ? `${Math.round(t.battery.percent)}%${t.battery.charging ? ' ⚡' : ''}`
      : 'Tomada';
  });

  // Alerta: painel pulsa e toca um aviso (no máximo uma vez por minuto para cada tipo).
  const ALERT_BLOCKS = { cpu: $('cpu-graph').closest('.block'), temp: $('temp').closest('div'), mem: $('mem-grid').closest('.block') };
  const lastAlert = {};
  function alerts(state) {
    if (SNAPSHOT) return; // capturas de tela ficam sem alerta
    for (const [kind, on] of Object.entries(state)) {
      ALERT_BLOCKS[kind].classList.toggle('alert', on);
      if (on && Date.now() - (lastAlert[kind] || 0) > 60000) {
        lastAlert[kind] = Date.now();
        sound.play('alert');
      }
    }
  }

  window.nexus.onSlow((s) => {
    $('tasks').textContent = s.tasks;
    const body = $('procs');
    body.replaceChildren(...s.top.map((p) => {
      const tr = document.createElement('tr');
      [p.pid, p.name, `${p.cpu.toFixed(1)}%`, `${p.mem.toFixed(1)}%`].forEach((v) => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      });
      return tr;
    }));
    $('net-state').textContent = s.online ? 'Online' : 'Offline';
    $('ip4').textContent = s.ip4;
    $('iface').textContent = `interface ${s.iface}`;
    $('ping').textContent = !Number.isFinite(s.ping) || s.ping < 0 ? '—' : s.ping < 1 ? '<1ms' : `${Math.round(s.ping)}ms`;
    if (s.mount) {
      $('mount-text').textContent = `Disco ${s.mount.mount}: ${Math.round(s.mount.use)}% usado`;
      $('mount-bar').style.width = `${s.mount.use}%`;
    }
  });

  // ---------- Arquivos ----------
  const ICON_DIR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>';
  const ICON_FILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5z"/></svg>';
  const ICON_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4v9H9v-9H5z"/></svg>';

  function fileButton(name, kind, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `file ${kind}`;
    btn.title = name;
    btn.innerHTML = kind === 'up' ? ICON_UP : kind === 'dir' ? ICON_DIR : ICON_FILE; // SVG fixo, sem dado do usuário
    const label = document.createElement('span');
    label.textContent = name;
    btn.append(label);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', onClick);
    return btn;
  }

  let lastFilesCwd = null;
  window.nexus.onFiles((f) => {
    const changed = f.cwd !== lastFilesCwd;
    lastFilesCwd = f.cwd;
    const shown = f.cwd.startsWith(f.home) ? `~${f.cwd.slice(f.home.length)}` : f.cwd;
    $('cwd').textContent = shown || '~';
    const box = $('files');
    const nodes = [];
    if (f.cwd !== '/') {
      // \x15 limpa a linha digitada antes do cd
      nodes.push(fileButton('..', 'up', () => window.nexus.write('\x15cd ..\r')));
    }
    for (const it of f.items) {
      nodes.push(fileButton(it.name, it.dir ? 'dir' : 'file', () => {
        if (it.dir) window.nexus.write(`\x15cd -- ${shellQuote(it.name)}\r`);
        else window.nexus.write(`${shellQuote(it.name)} `); // arquivo: só cola o nome no prompt
        term.focus();
      }));
    }
    if (f.error) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = `Sem acesso a esta pasta (${f.error})`;
      nodes.push(p);
    } else if (f.total > f.items.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = `… e mais ${f.total - f.items.length} itens`;
      nodes.push(p);
    }
    nodes.forEach((n, i) => n.style.setProperty('--i', Math.min(i, 30)));
    box.replaceChildren(...nodes);
    if (changed) {
      replay(box, 'enter');
      sound.play('files');
    }
  });

  // ---------- Teclado ----------
  new window.NexusKeyboard($('keyboard'), (seq) => {
    sound.play(seq === '\r' ? 'enter' : 'key');
    window.nexus.write(seq);
    term.focus();
  });

  // ---------- Tema ----------
  $('theme-btn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('nexus.theme', theme); } catch { /* ignora */ }
    term.options.theme = termTheme();
    $('theme-btn').textContent = `Tema: ${THEME_NAMES[theme]}`;
    replay($('ui'), 'glitch');
    sound.play('theme');
    term.focus();
  });
  $('ui').addEventListener('animationend', (e) => {
    if (e.animationName === 'glitch') $('ui').classList.remove('glitch');
  });

  // ---------- Som ----------
  const soundBtn = $('sound-btn');
  function paintSound() {
    soundBtn.textContent = `Som: ${sound.enabled ? 'on' : 'off'}`;
    soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  }
  soundBtn.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    sound.play('toggle');
    paintSound();
    term.focus();
  });
  paintSound();
  $('theme-btn').textContent = `Tema: ${THEME_NAMES[theme]}`;

  // ---------- Boot ----------
  const BOOT = [
    'NEXUS kernel interface v0.1.0',
    'Inicializando módulos de telemetria ............ OK',
    'Conectando ao barramento do sistema ............ OK',
    'Mapeando interfaces de rede .................... OK',
    'Carregando matriz de memória ................... OK',
    'Renderizando globo ............................. OK',
    'Abrindo shell seguro ........................... OK',
    '',
    'BEM-VINDO.',
  ];
  const log = $('boot-log');
  let i = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = setInterval(() => {
    if (i < BOOT.length) {
      log.textContent += `${BOOT[i]}\n`;
      if (BOOT[i]) sound.play('line');
      i++;
      return;
    }
    clearInterval(timer);
    $('boot').classList.add('done');
    $('ui').classList.remove('hidden');
    $('ui').classList.add('scan');
    sound.play('boot');
    requestAnimationFrame(startTerminal);
  }, reduce ? 0 : 110);
})();
