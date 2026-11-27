'use strict';
// NEXUS — sons de interface sintetizados na hora (Web Audio): sem arquivos de áudio, sem licença.
// Liga/desliga pelo botão SOM; a escolha fica salva. Mudo nas capturas de tela (?snapshot=1).
(function () {
  const params = new URLSearchParams(location.search);
  const MUTED_BY_ENV = params.has('snapshot');
  const VOLUME = 0.16;

  let enabled = true;
  try {
    enabled = localStorage.getItem('nexus.sound') !== 'off';
  } catch { /* sem localStorage: fica ligado */ }

  let ctx = null;
  let master = null;
  function audio() {
    if (MUTED_BY_ENV || !enabled) return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Um bipe: oscilador com envelope rápido, de f0 até f1 (glissando).
  function tone(ac, { type = 'sine', f0, f1 = f0, at = 0, dur = 0.08, gain = 1 }) {
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Estalo curto de ruído filtrado (tecla mecânica).
  let noiseBuf = null;
  function click(ac, { freq = 3200, dur = 0.025, gain = 0.5 }) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    const bp = ac.createBiquadFilter();
    const env = ac.createGain();
    src.buffer = noiseBuf;
    bp.type = 'bandpass';
    bp.frequency.value = freq * (0.9 + Math.random() * 0.2); // cada tecla soa um pouco diferente
    bp.Q.value = 1.4;
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(master);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  // Chiado de ruído com filtro varrendo de f0 até f1 (CRT ligando, varredura, "whoosh").
  let longNoise = null;
  function sweep(ac, { f0, f1, at = 0, dur = 0.5, gain = 0.3, q = 2, type = 'bandpass' }) {
    if (!longNoise) {
      longNoise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = longNoise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const env = ac.createGain();
    src.buffer = longNoise;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Zumbido grave contínuo (abertura): devolve uma função que o desliga suavemente.
  function hum(ac) {
    const t = ac.currentTime;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.1, t + 0.4);
    const oscs = [[55, 'sine', 1], [110, 'triangle', 0.35], [165, 'sine', 0.12]].map(([f, type, g]) => {
      const o = ac.createOscillator();
      const og = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      og.gain.value = g;
      o.connect(og).connect(env);
      o.start(t);
      return o;
    });
    // leve tremor, como um transformador
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(env.gain);
    lfo.start(t);
    env.connect(master);
    return () => {
      const n = ac.currentTime;
      env.gain.cancelScheduledValues(n);
      env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), n);
      env.gain.exponentialRampToValueAtTime(0.0001, n + 0.5);
      [...oscs, lfo].forEach((o) => o.stop(n + 0.55));
    };
  }

  const SOUNDS = {
    key: (ac) => click(ac, { gain: 0.35 }),
    enter: (ac) => { click(ac, { freq: 1800, gain: 0.45 }); tone(ac, { type: 'triangle', f0: 880, at: 0.02, dur: 0.06, gain: 0.25 }); },
    boot: (ac) => {
      tone(ac, { type: 'sawtooth', f0: 60, f1: 420, dur: 0.7, gain: 0.18 });
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, { type: 'triangle', f0: f, at: 0.5 + i * 0.07, dur: 0.5, gain: 0.3 }));
    },
    line: (ac) => tone(ac, { type: 'square', f0: 1200 + Math.random() * 300, dur: 0.02, gain: 0.12 }),
    open: (ac) => { tone(ac, { type: 'sine', f0: 300, f1: 1400, dur: 0.18, gain: 0.5 }); tone(ac, { type: 'triangle', f0: 1760, at: 0.16, dur: 0.12, gain: 0.25 }); },
    close: (ac) => tone(ac, { type: 'sine', f0: 1200, f1: 200, dur: 0.2, gain: 0.45 }),
    theme: (ac) => {
      for (let i = 0; i < 6; i++) tone(ac, { type: 'square', f0: 200 + Math.random() * 1800, at: i * 0.035, dur: 0.03, gain: 0.2 });
      tone(ac, { type: 'triangle', f0: 660, f1: 990, at: 0.22, dur: 0.15, gain: 0.35 });
    },
    files: (ac) => tone(ac, { type: 'triangle', f0: 1320, f1: 1980, dur: 0.05, gain: 0.18 }),
    alert: (ac) => { tone(ac, { type: 'square', f0: 220, dur: 0.14, gain: 0.3 }); tone(ac, { type: 'square', f0: 220, at: 0.22, dur: 0.14, gain: 0.3 }); },
    toggle: (ac) => tone(ac, { type: 'triangle', f0: 990, f1: 1320, dur: 0.08, gain: 0.35 }),
    // digitação: espaço mais grave, apagar com um "recuo"
    space: (ac) => click(ac, { freq: 900, dur: 0.035, gain: 0.4 }),
    back: (ac) => { click(ac, { freq: 2400, gain: 0.28 }); tone(ac, { type: 'sine', f0: 700, f1: 420, dur: 0.04, gain: 0.08 }); },
    // passar o mouse em botões e arquivos: um tique quase inaudível
    hover: (ac) => tone(ac, { type: 'sine', f0: 2600, dur: 0.015, gain: 0.05 }),
    select: (ac) => { click(ac, { freq: 2600, gain: 0.25 }); tone(ac, { type: 'triangle', f0: 1760, at: 0.01, dur: 0.04, gain: 0.12 }); },
    // avisos: duas notas subindo (ok/info) ou descendo (atenção); o crítico continua sendo o "alert"
    notify: (ac) => [880, 1320].forEach((f, i) => tone(ac, { type: 'triangle', f0: f, at: i * 0.08, dur: 0.14, gain: 0.22 })),
    warn: (ac) => [988, 740].forEach((f, i) => tone(ac, { type: 'triangle', f0: f, at: i * 0.1, dur: 0.16, gain: 0.26 })),
    // sino do terminal (\a): nota com um harmônico
    bell: (ac) => { tone(ac, { type: 'triangle', f0: 1568, dur: 0.3, gain: 0.25 }); tone(ac, { type: 'sine', f0: 3136, dur: 0.2, gain: 0.08 }); },
    // página carregada / erro no mini navegador e na música
    loaded: (ac) => tone(ac, { type: 'sine', f0: 1500, f1: 1800, dur: 0.05, gain: 0.14 }),
    error: (ac) => { tone(ac, { type: 'square', f0: 150, dur: 0.09, gain: 0.18 }); tone(ac, { type: 'square', f0: 120, at: 0.12, dur: 0.12, gain: 0.18 }); },
    // troca de faixa: arpejo curto
    // ---- abertura (no espírito dos terminais de cinema; tudo sintetizado aqui) ----
    // CRT ligando: baque grave, estalo de estática e o chiado agudo do flyback
    poweron: (ac) => {
      tone(ac, { type: 'sine', f0: 90, f1: 38, dur: 0.35, gain: 0.9 });
      sweep(ac, { f0: 6000, f1: 1200, dur: 0.25, gain: 0.35, q: 0.7 });
      tone(ac, { type: 'sine', f0: 9000, f1: 12000, at: 0.05, dur: 0.6, gain: 0.025 });
    },
    // ícone sendo traçado: varredura subindo
    scan: (ac) => {
      sweep(ac, { f0: 400, f1: 5000, dur: 0.6, gain: 0.18, q: 6 });
      tone(ac, { type: 'triangle', f0: 220, f1: 880, dur: 0.6, gain: 0.08 });
    },
    // letras do nome trocando / travando
    glyph: (ac) => tone(ac, { type: 'square', f0: 1800 + Math.random() * 1600, dur: 0.012, gain: 0.07 }),
    lock: (ac) => { click(ac, { freq: 1400, gain: 0.4 }); tone(ac, { type: 'triangle', f0: 1320, dur: 0.07, gain: 0.18 }); },
    // slogan digitando
    type: (ac) => click(ac, { freq: 4200, dur: 0.012, gain: 0.18 }),
    // cada linha do log: rajada de bipes de dados
    data: (ac) => {
      for (let i = 0; i < 4; i++) tone(ac, { type: 'square', f0: 900 + Math.floor(Math.random() * 8) * 220, at: i * 0.018, dur: 0.012, gain: 0.08 });
      tone(ac, { type: 'triangle', f0: 1760, at: 0.08, dur: 0.03, gain: 0.1 }); // "OK"
    },
    // log completo: acorde abrindo
    granted: (ac) => {
      [440, 554, 659, 880].forEach((f) => tone(ac, { type: 'triangle', f0: f, dur: 0.6, gain: 0.12 }));
      tone(ac, { type: 'sine', f0: 1760, at: 0.05, dur: 0.4, gain: 0.08 });
    },
    // revelação da interface: "whoosh" descendo por baixo do arpejo do boot
    reveal: (ac) => {
      sweep(ac, { f0: 3000, f1: 150, dur: 0.7, gain: 0.3, q: 1, type: 'lowpass' });
      tone(ac, { type: 'sine', f0: 70, f1: 45, at: 0.05, dur: 0.6, gain: 0.5 });
    },
    track: (ac) => [659, 880, 1175].forEach((f, i) => tone(ac, { type: 'sine', f0: f, at: i * 0.06, dur: 0.18, gain: 0.16 })),
  };
  // intervalo mínimo entre repetições (ms): passar o mouse rápido por vários botões não vira metralhadora
  const MIN_GAP = { glyph: 30, type: 25, hover: 70, notify: 400, warn: 400, bell: 150, error: 300 };
  const lastPlayed = {};

  function play(name) {
    const ac = audio();
    if (!ac || !SOUNDS[name]) return;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < (MIN_GAP[name] || 0)) return;
    lastPlayed[name] = now;
    try {
      SOUNDS[name](ac);
    } catch (err) {
      console.warn('[nexus] som:', err.message);
    }
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('nexus.sound', on ? 'on' : 'off'); } catch { /* ignora */ }
    if (!on && ctx) ctx.suspend().catch(() => {});
  }

  // Zumbido da abertura; devolve a função que o desliga (ou nada, se o som estiver mudo).
  function startHum() {
    const ac = audio();
    if (!ac) return () => {};
    try {
      return hum(ac);
    } catch (err) {
      console.warn('[nexus] som:', err.message);
      return () => {};
    }
  }

  window.NexusSound = {
    play,
    startHum,
    get enabled() { return enabled; }, // preferência do usuário; nas capturas o áudio fica mudo por dentro
    setEnabled,
  };
})();
