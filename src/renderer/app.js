'use strict';
// NEXUS — interface: liga terminal, painéis e teclado aos dados do processo principal.
(function () {
  const $ = (id) => document.getElementById(id);
  const { LineGraph, themeRGB } = window.NexusGraphs;
  const hud = window.NexusHud;

  const THEMES = ['tron', 'cyberpunk', 'ambar', 'matrix', 'artico', 'synthwave', 'carmesim'];
  const THEME_NAMES = {
    tron: 'Tron', cyberpunk: 'Cyberpunk', ambar: 'Âmbar', matrix: 'Matrix', artico: 'Ártico', synthwave: 'Synthwave', carmesim: 'Carmesim',
  };
  const ANSI = {
    // cores ANSI do terminal no mesmo tom dessaturado da interface
    tron: ['#0b1418', '#e8727c', '#7fdcaa', '#e8c98a', '#7ab4e8', '#b99ad8', '#7fd8e6', '#aacfd1',
      '#3a5560', '#f0959c', '#a4ecc6', '#f0dcaa', '#a0cbf0', '#d2bdea', '#a8e8f0', '#e6f4f5'],
    cyberpunk: ['#1a1030', '#e8557e', '#78e8a0', '#e8cf6a', '#9a6ee0', '#f05abe', '#5ccfe0', '#cfe8d8',
      '#4a3b6b', '#f07a98', '#a0f2c0', '#f0dc8c', '#b490f0', '#f586d0', '#8ae0ec', '#f2f7f4'],
    ambar: ['#1a1200', '#e07a50', '#c2c86a', '#ebaa55', '#c9a060', '#e09470', '#e8c88a', '#e6c48a',
      '#4d3a10', '#eb9878', '#d6dc8c', '#f0c27a', '#dcb880', '#f0b090', '#f0dcaa', '#f6ead2'],
    matrix: ['#03110a', '#d9776a', '#7fe08f', '#cfe07a', '#6fb8a0', '#a8c88a', '#8fe0c0', '#b8e8c0',
      '#2a4a33', '#e8968a', '#a6f0b2', '#e0ee9c', '#92d4bc', '#c4dca6', '#b2f0d8', '#e2f8e6'],
    artico: ['#0c121a', '#e88a96', '#94dcc0', '#e8d49a', '#8cb8f0', '#c0a8e8', '#90dcee', '#cddfed',
      '#3c4c60', '#f2a8b2', '#b4ecd6', '#f2e2b6', '#aed0f6', '#d4c4f2', '#b4ecf6', '#f2f8fc'],
    synthwave: ['#1a1030', '#f0708c', '#7ee8b8', '#f0d080', '#8aa0f8', '#d080f0', '#5ae0ec', '#d8c8f4',
      '#4a3a70', '#f492aa', '#a2f2d0', '#f6e0a0', '#aabcfa', '#e0a2f6', '#8aecf4', '#f2ecfc'],
    carmesim: ['#1a0606', '#ff8a7a', '#a8d08a', '#f0c070', '#a8a0d8', '#e08aa8', '#9ccfcf', '#e8c4c0',
      '#4a2020', '#ffa898', '#c0e0a8', '#f6d496', '#c2bce8', '#eca8c0', '#b8e2e2', '#f8e6e4'],
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
  // aba do shell no hub do centro (hub.js); esconder é só CSS, o processo segue rodando
  const hub = window.NexusHub;
  let shellTitle = '';
  hub.register('shell', {
    label: () => ['Terminal', shellTitle],
    get title() { return shellTitle || 'SHELL PRINCIPAL'; },
    show: (on) => { if (on && term.element) requestAnimationFrame(() => fit.fit()); },
    focus: () => term.focus(),
    close: () => {},
  });

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
    window.nexus.onData((d) => {
      termBytes += d.length;
      term.write(d);
    });
    term.onData((d) => window.nexus.write(d));
    term.onResize(({ cols, rows }) => window.nexus.resize(cols, rows));
    term.onBell(() => sound.play('bell'));
    term.onTitleChange((t) => {
      shellTitle = t || '';
      hub.refresh();
    });
    const showSize = () => { $('term-size').textContent = `${term.cols}×${term.rows}`; };
    term.onResize(showSize);
    showSize();
    window.nexus.spawn(term.cols, term.rows);
    // escondido (outra aba do hub na frente): não redimensiona, senão o shell iria para 1 linha
    new ResizeObserver(() => { if ($('terminal').offsetWidth) fit.fit(); }).observe($('terminal'));
    hub.focus();
  }
  document.addEventListener('mouseup', (e) => {
    if (e.target instanceof Element && e.target.closest('#web')) return; // mini navegador cuida do foco
    if (!window.getSelection()?.toString()) hub.focus();
  });

  // ---------- Som de digitação ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') sound.play('enter');
    else if (e.key === ' ') sound.play('space');
    else if (e.key === 'Backspace' || e.key === 'Delete') sound.play('back');
    else if (e.key.length === 1 || e.key === 'Tab') sound.play('key');
  }, true);

  // Tique ao passar o mouse em botões e arquivos (só ao entrar num elemento novo).
  let hovered = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button:not(:disabled), .file') : null;
    if (el && el !== hovered) sound.play('hover');
    hovered = el;
  });

  // ---------- Relógio ----------
  function clock() {
    const d = new Date();
    $('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('year').textContent = d.getFullYear();
    $('date').textContent = `${pad(d.getDate())} ${MESES[d.getMonth()]}`;
  }
  clock();
  setInterval(clock, 1000);

  // ---------- Modo econômico ----------
  // Janela sem foco há mais de 1 min: as rotações de enfeite param (os dados seguem atualizando). O foco vem do
  // processo principal: clicar na página do Web não conta como sair da janela.
  let ecoTimer = null;
  window.nexus.onFocus((on) => {
    clearTimeout(ecoTimer);
    if (on) document.documentElement.classList.remove('eco');
    else ecoTimer = setTimeout(() => document.documentElement.classList.add('eco'), 60 * 1000);
  });

  // ---------- Peças do HUD (núcleos, faixas de blocos, planta e moldura) ----------
  hud.planta($('planta'));
  hud.moldura($('term-moldura'), $('term-frame'));
  const cpuCore = hud.nucleo($('cpu-core'), { rotulo: 'CPU' });
  const netCore = hud.nucleo($('net-core'), { rotulo: 'MS', interna: true });
  const memSeg = hud.faixa($('mem-seg'), 30);
  const swapSeg = hud.faixa($('swap-seg'), 30);
  const mountSeg = hud.faixa($('mount-seg'), 40);
  const termAtv = hud.faixa($('term-atv'), 12);
  // atividade do terminal: bytes recebidos do shell, com decaimento (escala log: 10 B a 100 KB)
  let termBytes = 0;
  let termLevel = 0;
  setInterval(() => {
    const now = termBytes ? Math.min(1, Math.log10(termBytes + 1) / 5) : 0;
    termBytes = 0;
    termLevel = Math.max(now, termLevel * 0.6);
    termAtv(termLevel < 0.03 ? 0 : termLevel);
  }, 200);

  // Cor por faixa: normal, atenção e crítico (temperatura, memória, disco).
  function level(el, value, warn, crit) {
    el.classList.toggle('lv-warn', value >= warn && value < crit);
    el.classList.toggle('lv-crit', value >= crit);
  }

  // ---------- CPU ----------
  // 60 s de histórico em área, com escala; barras por núcleo; médias de 1, 5 e 15 min
  const cpuGraph = new LineGraph($('cpu-graph'), { series: 1, max: 100, size: 60, area: true, yLabels: true });
  const CPU_HISTORY = 15 * 60; // 15 min de amostras de 1 s para as médias
  const cpuHistory = [];
  if (SNAPSHOT) { // capturas do README: histórico fictício e suave, para os gráficos não saírem vazios
    cpuGraph.data[0] = cpuGraph.data[0].map((_, i) => 28 + 14 * Math.sin(i / 6) + 6 * Math.sin(i / 2.3));
    for (let i = 0; i < CPU_HISTORY; i++) cpuHistory.push(24 + 10 * Math.sin(i / 40));
  }
  const average = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
  function cpuAverages() {
    // até a janela encher, a média usa o que tem e o rótulo ganha "~"
    [[1, 'cpu-1'], [5, 'cpu-5'], [15, 'cpu-15']].forEach(([min, id]) => {
      const n = min * 60;
      const part = cpuHistory.slice(-n);
      $(id).textContent = part.length ? `${part.length < n ? '~' : ''}${average(part).toFixed(0)}%` : '—';
    });
  }
  const coreBars = [];
  function ensureCoreBars(n) {
    if (coreBars.length === n) return;
    const box = $('core-bars');
    box.replaceChildren();
    coreBars.length = 0;
    for (let i = 0; i < n; i++) {
      const col = document.createElement('div');
      col.className = 'core';
      const stack = document.createElement('div');
      stack.className = 'core-stack';
      col.append(stack);
      col.title = `Núcleo ${i + 1}`;
      box.append(col);
      coreBars.push({ col, set: hud.faixa(stack, 8) });
    }
  }

  // ---------- Rede (gráfico) ----------
  const netGraph = new LineGraph($('net-graph'), { series: 2, size: 90, area: true, yLabels: true, format: (v) => bytes(v, '/s') });
  if (SNAPSHOT) {
    netGraph.data[0] = netGraph.data[0].map((_, i) => 180e3 + 140e3 * Math.max(0, Math.sin(i / 7)) + 40e3 * Math.sin(i * 1.7));
    netGraph.data[1] = netGraph.data[1].map((_, i) => 30e3 + 25e3 * Math.max(0, Math.sin(i / 5 + 1)));
  }
  new window.NexusGlobe($('globe'));

  // ---------- Dados fixos ----------
  // "CoffeeLake-S GT2 [UHD Graphics 630]" → "UHD Graphics 630"
  const gpuName = (g) => (g.model.match(/\[([^\]]+)\]/)?.[1] || g.model).trim();
  let gpuStatic = null;
  window.nexus.staticInfo().then((info) => {
    $('cpu-model').textContent = info.cpu;
    $('cpu-model').title = `${info.cpu} · ${info.cores} núcleos`;
    $('host').textContent = `${info.user}@${info.hostname} · ${info.distro} · kernel ${info.kernel}`;
    ensureCoreBars(info.cores);
    gpuStatic = info.gpus[0] || null;
    $('gpu-model').textContent = gpuStatic ? `GPU ${gpuName(gpuStatic)}` : 'sem GPU detectada';
    $('gpu-model').title = gpuStatic ? `${gpuStatic.vendor} ${gpuStatic.model}` : '';
    renderGpu(null);
  }).catch(() => {});

  function renderGpu(live) {
    if (!gpuStatic) {
      $('gpu-info').textContent = '—';
      return;
    }
    const vram = gpuStatic.vram ? `${gpuStatic.vram >= 1024 ? `${(gpuStatic.vram / 1024).toFixed(0)} GB` : `${gpuStatic.vram} MB`} VRAM` : '';
    if (live && Number.isFinite(live.util)) {
      const parts = [`uso ${Math.round(live.util)}%`];
      if (Number.isFinite(live.temp)) parts.push(`${Math.round(live.temp)}°C`);
      if (live.memUsed && live.memTotal) parts.push(`${(live.memUsed / 1024).toFixed(1)}/${(live.memTotal / 1024).toFixed(0)} GB`);
      $('gpu-info').textContent = parts.join(' · ');
    } else {
      // Intel/AMD não expõem uso sem root
      $('gpu-info').textContent = [vram, 'uso n/d'].filter(Boolean).join(' · ');
      $('gpu-info').title = 'O driver desta GPU não informa uso sem permissão de root';
    }
  }

  // ---------- Tick rápido (1 s) ----------
  let rxPeak = 0;
  let txPeak = 0;
  window.nexus.onTick((t) => {
    cpuGraph.push(t.load);
    cpuHistory.push(t.load);
    if (cpuHistory.length > CPU_HISTORY) cpuHistory.shift();
    cpuAverages();
    $('cpu-avgs').title = `Carga do sistema (load average 1/5/15 min): ${t.loadavg.map((v) => v.toFixed(2)).join(' / ')}`;
    cpuCore.set(t.load / 100);
    cpuCore.valor(`${t.load.toFixed(0)}%`);
    cpuCore.sinal(t.temp >= 70);
    $('cpu-freq').textContent = Number.isFinite(t.ghz) && t.ghz > 0 ? `${t.ghz.toFixed(2)} GHz` : '—';
    ensureCoreBars(t.cores.length);
    t.cores.forEach((v, i) => {
      coreBars[i].set(v / 100);
      coreBars[i].col.classList.toggle('hot', v >= 90);
    });
    $('temp').textContent = t.temp ? `${t.temp.toFixed(0)}°C` : '--°C';
    level($('temp'), t.temp || 0, 70, 85);
    $('uptime').textContent = duration(t.uptime);

    const ratio = t.memUsed / t.memTotal;
    memSeg(ratio);
    swapSeg(t.swapTotal ? t.swapUsed / t.swapTotal : 0);
    $('mem-pct').textContent = `${Math.round(ratio * 100)}%`;
    level($('mem-pct'), ratio * 100, 75, 90);
    $('mem-used').textContent = bytes(t.memUsed);
    $('mem-avail').textContent = bytes(t.memAvailable);
    $('mem-total').textContent = bytes(t.memTotal);
    $('swap-text').textContent = bytes(t.swapUsed);

    if (t.net) {
      netGraph.push(t.net.rx, t.net.tx);
      rxPeak = Math.max(...netGraph.data[0]);
      txPeak = Math.max(...netGraph.data[1]);
      $('rx').textContent = bytes(t.net.rx, '/s');
      $('tx').textContent = bytes(t.net.tx, '/s');
      netCore.set(rxPeak ? t.net.rx / rxPeak : 0, txPeak ? t.net.tx / txPeak : 0);
      $('rx-peak').textContent = bytes(rxPeak, '/s');
      $('tx-peak').textContent = bytes(txPeak, '/s');
      $('net-total').textContent = `Total desde o boot ↓ ${bytes(t.net.rxTotal)} · ↑ ${bytes(t.net.txTotal)}`;
    }
    alerts({ cpu: t.load >= 90, temp: t.temp >= 85, mem: ratio >= 0.9 });
    $('power').textContent = t.battery
      ? `${Math.round(t.battery.percent)}%${t.battery.charging ? ' ⚡' : ''}`
      : 'Tomada';
  });

  // ---------- Avisos (toasts) ----------
  // tom: 'info' | 'ok' | 'warn' | 'crit'. Texto sempre por textContent. Até 3 na tela; somem em 6 s.
  const TOAST_ICON = { info: 'i', ok: '✓', warn: '!', crit: '!' };
  function toast(tone, title, text) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    const icon = document.createElement('i');
    icon.textContent = TOAST_ICON[tone] || 'i';
    const t = document.createElement('b');
    t.textContent = title;
    const d = document.createElement('span');
    d.textContent = text;
    el.append(icon, t, d);
    box.prepend(el);
    if (tone === 'warn') sound.play('warn');
    else if (tone !== 'crit') sound.play('notify'); // o crítico já toca o 'alert'
    while (box.children.length > 3) box.lastElementChild.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 600); // sem animação (reduzir movimento): remove assim mesmo
    }, 6000);
  }
  window.NexusToast = toast;

  // Alerta: painel pulsa e toca um aviso (no máximo uma vez por minuto para cada tipo).
  const ALERT_BLOCKS = { cpu: $('cpu-graph').closest('.block'), temp: $('temp'), mem: $('mem-seg').closest('.block') };
  const ALERT_TEXT = {
    cpu: ['CPU no limite', 'Uso acima de 90%.'],
    temp: ['Temperatura alta', 'Processador acima de 85 °C.'],
    mem: ['Memória quase cheia', 'Mais de 90% da RAM em uso.'],
  };
  const lastAlert = {};
  function alerts(state) {
    if (SNAPSHOT) return; // capturas de tela ficam sem alerta
    for (const [kind, on] of Object.entries(state)) {
      ALERT_BLOCKS[kind].classList.toggle('alert', on);
      if (on && Date.now() - (lastAlert[kind] || 0) > 60000) {
        lastAlert[kind] = Date.now();
        sound.play('alert');
        toast('crit', ...ALERT_TEXT[kind]);
      }
    }
  }

  // ---------- Tick lento (3 s) ----------
  const ms = (v) => (!Number.isFinite(v) || v < 0 ? '—' : v < 1 ? '<1 ms' : `${Math.round(v)} ms`);
  function renderDisks(disks) {
    const box = $('disks');
    if (!disks.length) {
      box.textContent = 'Nenhum disco encontrado';
      return;
    }
    box.replaceChildren(...disks.map((d) => {
      const row = document.createElement('div');
      row.className = 'disk';
      const name = document.createElement('span');
      name.className = 'num';
      name.textContent = d.mount;
      const detail = document.createElement('small');
      detail.className = 'dim';
      detail.textContent = `${bytes(d.used)} de ${bytes(d.size)}`;
      const pct = document.createElement('b');
      pct.className = 'num';
      pct.textContent = `${Math.round(d.use)}%`;
      level(pct, d.use, 80, 95);
      const bar = document.createElement('div');
      bar.className = 'seg fino';
      hud.faixa(bar, 40)(d.use / 100);
      level(bar, d.use, 80, 95);
      row.append(name, detail, pct, bar);
      return row;
    }));
  }

  let wasOnline = null;
  window.nexus.onSlow((s) => {
    $('tasks').textContent = s.tasks;
    const body = $('procs');
    body.replaceChildren(...s.top.map((p) => {
      const tr = document.createElement('tr');
      [p.pid, p.name, `${p.cpu.toFixed(1)}%`, `${p.mem.toFixed(1)}%`].forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 2) { // cpu: 5 blocos (20% cada) e o valor
          const mini = document.createElement('span');
          mini.className = 'mini';
          hud.faixa(mini, 5)(p.cpu / 100);
          td.append(mini, v);
        } else {
          td.textContent = v;
        }
        tr.append(td);
      });
      return tr;
    }));

    const n = s.net;
    if (wasOnline !== null && wasOnline !== n.online && !SNAPSHOT) {
      if (n.online) toast('ok', 'Rede conectada', `${n.conn} · ${n.ip4}`);
      else toast('warn', 'Rede desconectada', 'Sem endereço IPv4 na interface principal.');
    }
    wasOnline = n.online;
    $('net-state').textContent = n.online ? 'Online' : 'Offline';
    $('net-state').classList.toggle('lv-crit', !n.online);
    $('net-conn').textContent = n.conn;
    $('iface').textContent = n.iface;
    $('ip4').textContent = n.ip4;
    $('ip6').textContent = n.ip6 ? `${n.ip6}${n.ip6.toLowerCase().startsWith('fe80') ? ' (local)' : ''}` : '—';
    $('gw').textContent = n.gw || '—';
    $('dns').textContent = n.dns.length ? n.dns.join(' · ') : '—';
    $('ping').textContent = ms(n.ping);
    netCore.valor(!Number.isFinite(n.ping) || n.ping < 0 ? '—' : n.ping < 1 ? '<1' : String(Math.round(n.ping)));
    netCore.sinal(n.loss >= 1);
    $('loss').textContent = Number.isFinite(n.loss) ? `${n.loss.toFixed(0)}%` : '—';
    level($('loss'), n.loss || 0, 1, 10);

    renderDisks(s.disks);
    renderGpu(s.gpu);
    // rodapé: o disco da pasta atual só quando não é o "/" (que o painel Armazenamento já mostra), ex.: um pendrive
    const other = Boolean(s.mount && s.mount.mount !== '/');
    $('mount-text').hidden = !other;
    $('mount-seg').hidden = !other;
    if (other) {
      $('mount-text').textContent = `Disco ${s.mount.mount}: ${Math.round(s.mount.use)}% usado`;
      mountSeg(s.mount.use / 100);
    }
  });

  // ---------- Arquivos ----------
  const ICON_DIR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>';
  const ICON_FILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5z"/></svg>';
  // Tipo pela extensão: escolhe o ícone (folha com uma marca recortada) e o nome no rodapé do painel.
  const KINDS = {
    code: { label: 'código', mark: '<path class="mk-s" d="M9.5 12l-2.5 3 2.5 3M14.5 12l2.5 3-2.5 3"/>',
      ext: 'js mjs cjs ts tsx jsx py sh bash zsh fish json html htm css scss c h cpp hpp go rs java kt rb php lua toml yaml yml xml sql vue svelte' },
    image: { label: 'imagem', mark: '<path class="mk" d="M6 19l3.5-4.5 2.5 3 2-2.5 4 4z"/><circle class="mk" cx="15.5" cy="12" r="1.6"/>',
      ext: 'png jpg jpeg gif webp svg bmp ico avif tif tiff' },
    pdf: { label: 'PDF', mark: '<path class="mk" d="M5 14h14v5H5z"/>', ext: 'pdf' },
    text: { label: 'texto', mark: '<path class="mk-s" d="M7 12h10M7 15h10M7 18h6"/>', ext: 'md txt rst log csv tsv ini conf cfg env' },
    archive: { label: 'compactado', mark: '<path class="mk-s" d="M10 3v2h2v2h-2v2h2v2h-2v2"/>',
      ext: 'zip tar gz tgz xz bz2 zst 7z rar deb rpm appimage' },
    audio: { label: 'áudio', mark: '<path class="mk" d="M13 11v5.2a2.2 2.2 0 1 1-1.4-2V11z"/><path class="mk-s" d="M13 11.5l3-1"/>',
      ext: 'mp3 flac ogg oga wav m4a opus aac' },
    video: { label: 'vídeo', mark: '<path class="mk" d="M9.5 11.5v7l6-3.5z"/>', ext: 'mp4 mkv webm avi mov m4v' },
  };
  const EXT_KIND = {};
  for (const [k, v] of Object.entries(KINDS)) for (const e of v.ext.split(' ')) EXT_KIND[e] = k;
  const kindOf = (name) => EXT_KIND[(name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase()] || null;
  const fileIcon = (name) => {
    const k = kindOf(name);
    return k ? ICON_FILE.replace('</svg>', `${KINDS[k].mark}</svg>`) : ICON_FILE;
  };
  const ICON_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7h-4v9H9v-9H5z"/></svg>';

  function fileButton(name, kind, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `file ${kind}`;
    btn.title = kind === 'file' ? `${name}\nClique: abrir · Shift+clique: colar o nome no prompt` : name;
    btn.innerHTML = kind === 'up' ? ICON_UP : kind === 'dir' ? ICON_DIR : fileIcon(name); // SVG fixo; o nome só escolhe qual
    const label = document.createElement('span');
    label.textContent = name;
    btn.append(label);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    if (kind !== 'up') {
      btn.addEventListener('pointerenter', () => showInfo(name));
      btn.addEventListener('pointerleave', () => showInfo(null));
    }
    btn.addEventListener('click', (e) => {
      if (kind === 'file') sound.play('select'); // pasta troca a lista e já toca 'files'
      onClick(e);
    });
    return btn;
  }

  // ---------- Rodapé do painel de arquivos ----------
  // Sem nada sob o mouse: resumo da pasta. Com um arquivo: tipo, tamanho e data (pedidos ao processo principal).
  const infoEl = $('files-info');
  let summary = '';
  let infoTimer = null;
  let infoFor = null;
  const fmtSize = (n) => {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 || i === 0 ? 0 : 1 })} ${u[i]}`;
  };
  const fmtWhen = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function showInfo(name) {
    clearTimeout(infoTimer);
    infoFor = name;
    if (!name) {
      infoEl.textContent = summary;
      return;
    }
    infoTimer = setTimeout(async () => {
      const i = await window.nexus.fileInfo(name).catch(() => null);
      if (infoFor !== name) return; // o mouse já saiu
      const parts = [name];
      if (i?.dir) parts.push('pasta', `${i.count} ${i.count === 1 ? 'item' : 'itens'}`);
      else if (i) parts.push(KINDS[kindOf(name)]?.label || 'arquivo', fmtSize(i.size));
      if (i) parts.push(`modificado ${fmtWhen(i.mtime)}`);
      infoEl.textContent = parts.join(' · ');
    }, 120);
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
      nodes.push(fileButton(it.name, it.dir ? 'dir' : 'file', (e) => {
        if (it.dir) window.nexus.write(`\x15cd -- ${shellQuote(it.name)}\r`);
        else if (e.shiftKey || !window.NexusViewer) window.nexus.write(`${shellQuote(it.name)} `); // Shift: cola o nome
        else window.NexusViewer.open(it.name); // arquivo: abre no visualizador
        hub.focus();
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
    const dirs = f.items.filter((it) => it.dir).length;
    const files = f.items.length - dirs;
    summary = f.error ? '' : `${dirs} ${dirs === 1 ? 'pasta' : 'pastas'} · ${files} ${files === 1 ? 'arquivo' : 'arquivos'}`
      + (f.total > f.items.length ? ` · ${f.total} no total` : '') + ' · passe o mouse num item para ver detalhes';
    if (!infoFor) infoEl.textContent = summary;
    if (changed) {
      replay(box, 'enter');
      sound.play('files');
    }
  });

  // ---------- Teclado ----------
  function homeKey(seq) {
    const input = $('hub-web-url');
    if (seq === '\r') $('hub-web-form').requestSubmit();
    else if (seq === '\x7f') input.value = input.value.slice(0, -1);
    else if ([...seq].length === 1 && seq >= ' ') input.value += seq;
  }
  new window.NexusKeyboard($('keyboard'), (seq) => {
    sound.play(seq === '\r' ? 'enter' : seq === ' ' ? 'space' : seq === '\x7f' ? 'back' : 'key');
    if (hub.active() === 'web') window.nexus.web.key(seq); // Web na frente: digita na página
    else if (hub.active() === 'shell') window.nexus.write(seq);
    else homeKey(seq); // tela inicial: digita no endereço do Web
    hub.focus();
  });

  // ---------- Tema ----------
  // Menu de temas: uma amostra por tema (fundo, texto e destaque vêm do CSS do próprio tema via data-theme).
  const themeMenu = $('theme-menu');
  function showThemeMenu(on) {
    themeMenu.hidden = !on;
    $('theme-btn').setAttribute('aria-expanded', String(on));
    if (!on) return;
    const items = THEMES.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(t === theme));
      const sw = document.createElement('span');
      sw.className = 'theme-sw';
      sw.dataset.theme = t;
      sw.setAttribute('aria-hidden', 'true');
      sw.append(document.createElement('i'), document.createElement('i'));
      b.append(sw, THEME_NAMES[t]);
      b.addEventListener('click', () => {
        showThemeMenu(false);
        if (t !== theme) setTheme(t);
        hub.focus();
      });
      return b;
    });
    themeMenu.replaceChildren(...items);
    const r = $('theme-btn').getBoundingClientRect();
    themeMenu.style.left = `${Math.max(8, r.right - themeMenu.offsetWidth)}px`;
    themeMenu.style.bottom = `${window.innerHeight - r.top + 6}px`;
    themeMenu.querySelector('[aria-checked="true"]')?.focus();
  }
  $('theme-btn').addEventListener('click', () => showThemeMenu(themeMenu.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!themeMenu.hidden && !e.target.closest('#theme-menu, #theme-btn')) showThemeMenu(false);
  });
  themeMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      showThemeMenu(false);
      hub.focus();
    }
  });

  function setTheme(t) {
    theme = t;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('nexus.theme', theme); } catch { /* ignora */ }
    term.options.theme = termTheme();
    $('theme-btn').textContent = `Tema: ${THEME_NAMES[theme]}`;
    replay($('ui'), 'glitch');
    sound.play('theme');
    hub.focus();
  }
  // scripts de captura (demo, promo) trocam o tema por aqui
  window.NexusTheme = { set: setTheme, next: () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]) };
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
    hub.focus();
  });
  paintSound();
  $('theme-btn').textContent = `Tema: ${THEME_NAMES[theme]}`;

  // ---------- Abertura ----------
  // 1) CRT ligando  2) ícone traçado  3) nome decodificado  4) slogan + log com barra  5) revelação.
  // ~2,5 s; qualquer tecla ou clique pula. Reduzir movimento: logo parado por meio segundo.
  // Capturas de tela pulam a abertura; a gravação da demo mostra.
  const BOOT = [
    'Inicializando módulos de telemetria ............ OK',
    'Conectando ao barramento do sistema ............ OK',
    'Mapeando interfaces de rede .................... OK',
    'Carregando matriz de memória ................... OK',
    'Renderizando globo ............................. OK',
    'Abrindo shell seguro ........................... OK',
  ];
  const RECORD = new URLSearchParams(location.search).has('record');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/\\';
  let introDone = false;
  let stopHum = () => {};

  function finishIntro() {
    if (introDone) return;
    introDone = true;
    window.removeEventListener('keydown', skipIntro, true);
    window.removeEventListener('pointerdown', skipIntro, true);
    $('boot').classList.add('done');
    // depois do esmaecimento a abertura sai da página: invisível, seguia redesenhando os cursores piscando
    setTimeout(() => { $('boot').hidden = true; }, 700);
    $('ui').classList.remove('hidden');
    $('ui').classList.add('scan');
    stopHum();
    sound.play('reveal');
    sound.play('boot');
    if (term.element) { // o terminal já abriu (startTerminal roda no próximo quadro)
      fit.fit();
      hub.focus();
    }
  }
  // a tecla que pula a abertura não vai para o shell
  function skipIntro(e) {
    e.preventDefault();
    e.stopPropagation();
    finishIntro();
  }

  // letras trocando até cada uma travar no lugar, da esquerda para a direita
  async function decode(el, word, ms) {
    const start = performance.now();
    let lastLocked = 0;
    while (!introDone) {
      const t = (performance.now() - start) / ms;
      const locked = Math.min(word.length, Math.floor(t * word.length));
      el.textContent = word.slice(0, locked)
        + [...word.slice(locked)].map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');
      if (locked > lastLocked) sound.play('lock'); // cada letra que trava faz um clique
      lastLocked = locked;
      if (locked >= word.length) return;
      sound.play('glyph');
      await sleep(40);
    }
  }

  async function typeText(el, text, perChar) {
    for (let k = 1; k <= text.length && !introDone; k++) {
      el.textContent = text.slice(0, k);
      if (text[k - 1] !== ' ') sound.play('type');
      await sleep(perChar);
    }
  }

  async function intro() {
    const box = $('intro');
    const version = await window.nexus.staticInfo().then((i) => i.version).catch(() => '');
    const tag = `SISTEMA DE COMANDO${version ? ` · v${version}` : ''}`;
    if (SNAPSHOT && !RECORD) return finishIntro();
    if (reduce) {
      box.classList.add('on');
      $('intro-word').textContent = 'NEXUS';
      $('intro-tag').textContent = tag;
      await sleep(500);
      return finishIntro();
    }
    window.addEventListener('keydown', skipIntro, true);
    window.addEventListener('pointerdown', skipIntro, true);

    $('boot').classList.add('crt');
    sound.play('poweron');
    stopHum = sound.startHum();
    await sleep(450);
    if (introDone) return;
    box.classList.add('on');
    sound.play('scan'); // o ícone sendo traçado
    await sleep(200);
    await decode($('intro-word'), 'NEXUS', 650);
    await typeText($('intro-tag'), tag, 14);
    const log = $('boot-log');
    for (let k = 0; k < BOOT.length && !introDone; k++) {
      log.textContent += `${BOOT[k]}\n`;
      $('intro-bar').style.width = `${((k + 1) / BOOT.length) * 100}%`;
      sound.play('data');
      await sleep(70);
    }
    if (!introDone) sound.play('granted');
    await sleep(220);
    finishIntro();
  }

  // o shell abre já, por trás da abertura
  requestAnimationFrame(startTerminal);
  intro().catch(() => finishIntro());
})();
