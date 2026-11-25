'use strict';
// Globo em wireframe girando, com "nós" que piscam e arcos entre eles.
// Otimizado: trigonometria de cada ponto pré-calculada (por quadro só muda a rotação), cada camada
// sai em uma única chamada de desenho, cores e degradê em cache, e no máximo 20 fps.
(function () {
  const { fitCanvas, themeRGB } = window.NexusGraphs;
  const DOT_LEVELS = 4; // pontos agrupados em 4 níveis de brilho: 4 preenchimentos por quadro, não centenas

  function rand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  }

  // Ponto na esfera com senos e cossenos guardados; `lift` afasta da superfície (arcos).
  const point = (lat, lon, lift = 1) => ({
    cl: Math.cos(lat), sl: Math.sin(lat), co: Math.cos(lon), so: Math.sin(lon), lift,
  });

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
        return { lat, lon };
      })
        .filter(({ lat, lon }) => Math.sin(lon * 3) * Math.cos(lat * 2.4) + Math.sin(lat * 5 + lon) > 0.15)
        .map(({ lat, lon }) => point(lat, lon));

      // meridianos (12) e paralelos (5) como listas de pontos
      this.lines = [];
      for (let m = 0; m < 12; m++) {
        const lon = (m / 12) * Math.PI * 2;
        this.lines.push(Array.from({ length: 41 }, (_, i) => point(-Math.PI / 2 + (i / 40) * Math.PI, lon)));
      }
      for (let k = 1; k < 6; k++) {
        const lat = -Math.PI / 2 + (k / 6) * Math.PI;
        this.lines.push(Array.from({ length: 61 }, (_, i) => point(lat, (i / 60) * Math.PI * 2)));
      }

      const nodes = Array.from({ length: 9 }, () => ({ lat: (r() - 0.5) * 2.2, lon: r() * Math.PI * 2, phase: r() * Math.PI * 2 }));
      this.nodes = nodes.map((n) => ({ ...point(n.lat, n.lon), phase: n.phase }));
      this.arcs = [[0, 3], [1, 5], [2, 7], [4, 8], [6, 0], [3, 5]].map(([a, b]) => Array.from({ length: 31 }, (_, i) => {
        const f = i / 30;
        return point(nodes[a].lat + (nodes[b].lat - nodes[a].lat) * f, nodes[a].lon + (nodes[b].lon - nodes[a].lon) * f,
          1 + Math.sin(f * Math.PI) * 0.18);
      }));

      this.last = performance.now();
      this.lastDraw = 0;
      // Cores e tamanho em cache: ler CSS ou layout a cada quadro força recálculo de estilo.
      this.readColors();
      new MutationObserver(() => this.readColors())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.size = null;
      new ResizeObserver(() => { this.size = null; }).observe(canvas);
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    readColors() {
      const rgb = themeRGB();
      const acc = themeRGB('--accent-rgb');
      this.colors = {
        outline: `rgba(${rgb},0.35)`,
        grid: `rgba(${rgb},0.12)`,
        dots: Array.from({ length: DOT_LEVELS }, (_, i) => `rgba(${rgb},${(0.25 + ((i + 0.5) / DOT_LEVELS) * 0.6).toFixed(2)})`),
        arc: `rgba(${acc},0.45)`,
        node: `rgb(${acc})`,
        acc,
        rgb,
      };
      this.glow = null; // refaz o degradê com a cor nova
    }

    // 20 fps com a janela em foco, 10 fps sem foco; parado se minimizada (document.hidden).
    frame(t) {
      requestAnimationFrame(this.frame);
      if (document.hidden) return;
      const fps = document.hasFocus() ? 20 : 10;
      if (t - this.lastDraw < 1000 / fps - 2) return;
      const dt = Math.min((t - this.last) / 1000, 0.25);
      this.last = t;
      this.lastDraw = t;
      this.rot += dt * 0.18;
      this.draw(t / 1000);
    }

    draw(time) {
      if (!this.size) {
        this.size = fitCanvas(this.canvas);
        this.glow = null;
      }
      const { w, h, dpr } = this.size;
      const ctx = this.ctx;
      const c = this.colors;
      const R = Math.min(w, h) * 0.42;
      const cx = w / 2;
      const cy = h / 2;
      const cr = Math.cos(this.rot);
      const sr = Math.sin(this.rot);
      const ct = Math.cos(this.tilt);
      const st = Math.sin(this.tilt);
      // projeta um ponto: devolve [x, y, z] (z < 0 = lado de trás)
      const proj = (p) => {
        const x0 = p.cl * (p.so * cr + p.co * sr);
        const z0 = p.cl * (p.co * cr - p.so * sr);
        const y = p.sl * ct - z0 * st;
        const z = p.sl * st + z0 * ct;
        const rr = R * p.lift;
        return [cx + x0 * rr, cy - y * rr, z];
      };

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = dpr;

      // contorno e brilho
      if (!this.glow) {
        this.glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.15);
        this.glow.addColorStop(0, `rgba(${c.rgb},0)`);
        this.glow.addColorStop(1, `rgba(${c.rgb},0.10)`);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = c.outline;
      ctx.stroke();
      ctx.fillStyle = this.glow;
      ctx.fill();

      // meridianos e paralelos: um caminho só
      const polyline = (pts, minZ) => {
        let started = false;
        for (const p of pts) {
          const [x, y, z] = proj(p);
          if (z < minZ) { started = false; continue; }
          if (started) ctx.lineTo(x, y);
          else { ctx.moveTo(x, y); started = true; }
        }
      };
      ctx.beginPath();
      for (const line of this.lines) polyline(line, 0);
      ctx.strokeStyle = c.grid;
      ctx.stroke();

      // pontos de superfície, agrupados por brilho
      const size = 1.4 * dpr;
      const buckets = Array.from({ length: DOT_LEVELS }, () => new Path2D());
      for (const d of this.dots) {
        const [x, y, z] = proj(d);
        if (z < 0) continue;
        buckets[Math.min(DOT_LEVELS - 1, Math.floor(z * DOT_LEVELS))].rect(x, y, size, size);
      }
      buckets.forEach((path, i) => {
        ctx.fillStyle = c.dots[i];
        ctx.fill(path);
      });

      // arcos entre nós
      ctx.beginPath();
      for (const arc of this.arcs) polyline(arc, -0.05);
      ctx.strokeStyle = c.arc;
      ctx.stroke();

      // nós piscando
      ctx.fillStyle = c.node;
      for (const n of this.nodes) {
        const [x, y, z] = proj(n);
        if (z < 0) continue;
        const pulse = (Math.sin(time * 2.4 + n.phase) + 1) / 2;
        ctx.beginPath();
        ctx.arc(x, y, (2 + pulse * 5) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c.acc},${(0.9 - pulse * 0.7).toFixed(2)})`;
        ctx.stroke();
        ctx.fillRect(x - dpr, y - dpr, 2.5 * dpr, 2.5 * dpr);
      }
    }
  }

  window.NexusGlobe = Globe;
})();
