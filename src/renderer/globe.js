'use strict';
// Globo em wireframe girando, com "nós" que piscam e arcos entre eles.
(function () {
  const { fitCanvas, themeRGB } = window.NexusGraphs;

  function rand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  class Globe {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.rot = 0;
      this.tilt = 0.38;
      const r = rand(42);
      // pontos de "continente": nuvem determinística na superfície
      this.dots = Array.from({ length: 900 }, () => {
        const lat = Math.asin(2 * r() - 1);
        const lon = r() * Math.PI * 2;
        return { lat, lon, keep: Math.sin(lon * 3) * Math.cos(lat * 2.4) + Math.sin(lat * 5 + lon) > 0.15 };
      }).filter((d) => d.keep);
      this.nodes = Array.from({ length: 9 }, () => ({
        lat: (r() - 0.5) * 2.2,
        lon: r() * Math.PI * 2,
        phase: r() * Math.PI * 2,
      }));
      this.links = [[0, 3], [1, 5], [2, 7], [4, 8], [6, 0], [3, 5]];
      this.last = performance.now();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    project(lat, lon, R, cx, cy) {
      const x0 = Math.cos(lat) * Math.sin(lon + this.rot);
      const y0 = Math.sin(lat);
      const z0 = Math.cos(lat) * Math.cos(lon + this.rot);
      const y = y0 * Math.cos(this.tilt) - z0 * Math.sin(this.tilt);
      const z = y0 * Math.sin(this.tilt) + z0 * Math.cos(this.tilt);
      return { x: cx + x0 * R, y: cy - y * R, z };
    }

    frame(t) {
      const dt = Math.min((t - this.last) / 1000, 0.1);
      this.last = t;
      this.rot += dt * 0.18;
      if (!document.hidden) this.draw(t / 1000);
      requestAnimationFrame(this.frame);
    }

    draw(time) {
      const { w, h, dpr } = fitCanvas(this.canvas);
      const ctx = this.ctx;
      ctx.clearRect(0, 0, w, h);
      const rgb = themeRGB();
      const acc = themeRGB('--accent-rgb');
      const R = Math.min(w, h) * 0.42;
      const cx = w / 2;
      const cy = h / 2;

      // contorno e brilho
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb},0.35)`;
      ctx.lineWidth = dpr;
      ctx.stroke();
      const glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.15);
      glow.addColorStop(0, `rgba(${rgb},0)`);
      glow.addColorStop(1, `rgba(${rgb},0.10)`);
      ctx.fillStyle = glow;
      ctx.fill();

      // meridianos e paralelos
      ctx.strokeStyle = `rgba(${rgb},0.12)`;
      for (let m = 0; m < 12; m++) {
        const lon = (m / 12) * Math.PI * 2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 40; i++) {
          const lat = -Math.PI / 2 + (i / 40) * Math.PI;
          const p = this.project(lat, lon, R, cx, cy);
          if (p.z < 0) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      for (let k = 1; k < 6; k++) {
        const lat = -Math.PI / 2 + (k / 6) * Math.PI;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 60; i++) {
          const p = this.project(lat, (i / 60) * Math.PI * 2, R, cx, cy);
          if (p.z < 0) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // pontos de superfície
      for (const d of this.dots) {
        const p = this.project(d.lat, d.lon, R, cx, cy);
        if (p.z < 0) continue;
        ctx.fillStyle = `rgba(${rgb},${0.25 + p.z * 0.6})`;
        ctx.fillRect(p.x, p.y, 1.4 * dpr, 1.4 * dpr);
      }

      // arcos entre nós
      for (const [a, b] of this.links) {
        const A = this.nodes[a];
        const B = this.nodes[b];
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 30; i++) {
          const f = i / 30;
          const lat = A.lat + (B.lat - A.lat) * f;
          const lon = A.lon + (B.lon - A.lon) * f;
          const lift = 1 + Math.sin(f * Math.PI) * 0.18;
          const p = this.project(lat, lon, R * lift, cx, cy);
          if (p.z < -0.05) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(${acc},0.45)`;
        ctx.lineWidth = dpr;
        ctx.stroke();
      }

      // nós piscando
      for (const n of this.nodes) {
        const p = this.project(n.lat, n.lon, R, cx, cy);
        if (p.z < 0) continue;
        const pulse = (Math.sin(time * 2.4 + n.phase) + 1) / 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (2 + pulse * 5) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${acc},${0.9 - pulse * 0.7})`;
        ctx.stroke();
        ctx.fillStyle = `rgb(${acc})`;
        ctx.fillRect(p.x - dpr, p.y - dpr, 2.5 * dpr, 2.5 * dpr);
      }
    }
  }

  window.NexusGlobe = Globe;
})();
