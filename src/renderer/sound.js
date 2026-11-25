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
  };

  function play(name) {
    const ac = audio();
    if (!ac || !SOUNDS[name]) return;
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

  window.NexusSound = {
    play,
    get enabled() { return enabled; }, // preferência do usuário; nas capturas o áudio fica mudo por dentro
    setEnabled,
  };
})();
