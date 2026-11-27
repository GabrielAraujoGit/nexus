'use strict';
// Gráficos de linha em canvas, com buffer circular e cor tirada do tema.

function themeRGB(name = '--rgb') {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '170,207,209';
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

class LineGraph {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ series: number, size?: number, max?: number, colors?: string[], area?: boolean, yLabels?: boolean }} opts
   *   max fixo (ex.: 100 para %) ou automático quando ausente. area: preenchimento em degradê;
   *   yLabels: escala (0/50/100%) na lateral.
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = opts.size || 80;
    this.max = opts.max || null;
    this.colors = opts.colors || ['--rgb', '--accent-rgb'];
    this.area = Boolean(opts.area);
    this.yLabels = Boolean(opts.yLabels);
    this.format = opts.format || ((v) => `${Math.round(v)}%`);
    this.data = Array.from({ length: opts.series }, () => new Array(this.size).fill(0));
  }

  push(...values) {
    values.forEach((v, i) => {
      const s = this.data[i];
      s.push(Number.isFinite(v) ? v : 0);
      s.shift();
    });
    this.draw();
  }

  draw() {
    const { w, h, dpr } = fitCanvas(this.canvas);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const rgb = themeRGB();

    // grade (tracejada no modo área)
    ctx.strokeStyle = `rgba(${rgb},${this.area ? 0.14 : 0.10})`;
    ctx.lineWidth = 1;
    ctx.setLineDash(this.area ? [2 * dpr, 4 * dpr] : []);
    ctx.beginPath();
    for (let y = 0; y <= 4; y++) {
      const yy = Math.round((h / 4) * y) + 0.5;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    if (this.area) { // linhas verticais a cada 10 amostras
      for (let x = 10; x < this.size; x += 10) {
        const xx = Math.round((w / (this.size - 1)) * x) + 0.5;
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, h);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const max = this.max || Math.max(1, ...this.data.flat()) * 1.15;
    const step = w / (this.size - 1);
    this.data.forEach((series, i) => {
      const color = themeRGB(this.colors[i % this.colors.length]);
      // curva suave: cada trecho vai até o ponto médio entre duas amostras (quadrática)
      const ys = series.map((v) => h - (Math.min(v, max) / max) * (h - 2 * dpr) - dpr);
      ctx.beginPath();
      ctx.moveTo(0, ys[0]);
      for (let x = 1; x < ys.length - 1; x++) {
        ctx.quadraticCurveTo(x * step, ys[x], (x + 0.5) * step, (ys[x] + ys[x + 1]) / 2);
      }
      ctx.lineTo((ys.length - 1) * step, ys[ys.length - 1]);
      ctx.strokeStyle = `rgba(${color},0.95)`;
      ctx.lineWidth = 1.4 * dpr;
      ctx.shadowColor = `rgba(${color},0.7)`;
      ctx.shadowBlur = 6 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (i === 0) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        if (this.area) {
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, `rgba(${color},0.38)`);
          grad.addColorStop(1, `rgba(${color},0.03)`);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = `rgba(${color},0.08)`;
        }
        ctx.fill();
      }
    });

    if (this.yLabels) {
      // rótulos da escala sobre uma plaqueta da cor do fundo: um pico alto passa por trás e o texto segue legível
      ctx.font = `${9 * dpr}px "Share Tech Mono", monospace`;
      ctx.textAlign = 'right';
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#000';
      const label = (text, y, base) => {
        const tw = ctx.measureText(text).width;
        const th = 10 * dpr;
        const top = base === 'top' ? y - dpr : y - th / 2;
        ctx.fillStyle = bg;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(w - tw - 5 * dpr, top, tw + 5 * dpr, th);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${rgb},0.6)`;
        ctx.textBaseline = base;
        ctx.fillText(text, w - 2 * dpr, y);
      };
      label(this.format(max), 2 * dpr, 'top');
      label(this.format(max / 2), h / 2, 'middle');
    }
  }
}

window.NexusGraphs = { LineGraph, fitCanvas, themeRGB };
