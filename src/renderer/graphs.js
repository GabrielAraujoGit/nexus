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
   * @param {{ series: number, size?: number, max?: number, colors?: string[] }} opts
   *   max fixo (ex.: 100 para %) ou automático quando ausente.
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = opts.size || 80;
    this.max = opts.max || null;
    this.colors = opts.colors || ['--rgb', '--accent-rgb'];
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

    // grade
    ctx.strokeStyle = `rgba(${rgb},0.10)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y <= 4; y++) {
      const yy = Math.round((h / 4) * y) + 0.5;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();

    const max = this.max || Math.max(1, ...this.data.flat()) * 1.15;
    const step = w / (this.size - 1);
    this.data.forEach((series, i) => {
      const color = themeRGB(this.colors[i % this.colors.length]);
      ctx.beginPath();
      series.forEach((v, x) => {
        const y = h - (Math.min(v, max) / max) * (h - 2 * dpr) - dpr;
        if (x === 0) ctx.moveTo(0, y);
        else ctx.lineTo(x * step, y);
      });
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
        ctx.fillStyle = `rgba(${color},0.08)`;
        ctx.fill();
      }
    });
  }
}

window.NexusGraphs = { LineGraph, fitCanvas, themeRGB };
