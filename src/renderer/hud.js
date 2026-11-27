'use strict';
// Peças do HUD desenhadas em SVG por código: núcleos polares (mesma geometria do núcleo do JARVIS),
// planta técnica de fundo, moldura do terminal e faixas de blocos segmentados.
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, pai) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (pai) pai.append(e);
    return e;
  }
  // coordenadas polares: 0° no topo, sentido horário
  const pt = (r, g) => {
    const a = ((g - 90) * Math.PI) / 180;
    return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
  };
  function arco(r, g0, g1) {
    const [x0, y0] = pt(r, g0);
    const [x1, y1] = pt(r, g1);
    return `M${x0} ${y0}A${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  function setor(r0, r1, g0, g1) {
    const [a, b] = pt(r1, g0);
    const [c, d] = pt(r1, g1);
    const [e, f] = pt(r0, g1);
    const [g, h] = pt(r0, g0);
    return `M${a} ${b}A${r1} ${r1} 0 0 1 ${c} ${d}L${e} ${f}A${r0} ${r0} 0 0 0 ${g} ${h}Z`;
  }
  function linha(pai, r0, r1, g, cls) {
    const [a, b] = pt(r0, g);
    const [c, d] = pt(r1, g);
    el('line', { x1: a, y1: b, x2: c, y2: d, class: cls }, pai);
  }

  // Acende os primeiros blocos na proporção f (0..1).
  function acende(blocos, f) {
    const on = Math.round(Math.max(0, Math.min(1, f || 0)) * blocos.length);
    blocos.forEach((b, i) => b.classList.toggle('on', i < on));
  }

  /**
   * Núcleo polar num <svg viewBox="-100 -100 200 200">.
   * Camadas: planta tênue, anel externo grosso com entalhes, régua de 48 ticks (gira), faixa de 22 blocos
   * (o medidor; fica parada), faixa interna opcional, arco e pontos de sinal, anel interno que respira e valor.
   */
  function nucleo(svg, { rotulo, interna = false }) {
    svg.replaceChildren();
    const planta = el('g', { class: 'g-planta' }, svg);
    el('circle', { r: 30, class: 'planta', 'stroke-dasharray': '3 2' }, planta);
    el('circle', { r: 22, class: 'planta' }, planta);
    for (let k = 0; k < 6; k++) linha(planta, 0, 30, k * 60, 'planta');

    const ext = el('g', { class: 'entra' }, svg);
    for (const [g0, g1] of [[8, 128], [134, 250], [256, 362]]) el('path', { d: arco(92, g0, g1), class: 'forte', 'stroke-width': 4.2 }, ext);
    el('path', { d: arco(97, 28, 58), class: 'forte', 'stroke-width': 1.6 }, ext);
    el('path', { d: arco(97, 206, 226), class: 'forte', 'stroke-width': 1.6 }, ext);
    for (let k = 0; k < 4; k++) linha(ext, 86, 89, 262 + k * 3.2, 'tk');

    const tick = el('g', { class: 'g-tick' }, el('g', { class: 'entra e1' }, svg));
    for (let i = 0; i < 48; i++) linha(tick, i % 4 ? 81 : 78, 86, i * 7.5, i % 4 ? 'tk f' : 'tk');

    const faixa = el('g', { class: 'entra e2' }, svg);
    const de = 228;
    const ate = 492;
    const passo = (ate - de) / 22;
    const blocos = [];
    for (let i = 0; i < 22; i++) {
      blocos.push(el('path', { d: setor(60, 75, de + i * passo + 0.4, de + (i + 1) * passo - 0.4), class: 'bloco' }, faixa));
    }
    el('path', { d: arco(75.6, de, ate), class: 'fino', 'stroke-width': 0.7 }, faixa);
    el('path', { d: arco(59.4, de, ate), class: 'fino', 'stroke-width': 0.7 }, faixa);
    const blocos2 = [];
    if (interna) {
      const q = (ate - de) / 16;
      for (let i = 0; i < 16; i++) {
        blocos2.push(el('path', { d: setor(50, 57, de + i * q + 0.6, de + (i + 1) * q - 0.6), class: 'bloco b2' }, faixa));
      }
    }

    // sinal (âmbar): escondido até o app ligar a classe .sinal no svg
    const rs = interna ? 46 : 55;
    const amb = el('g', { class: 'g-ambar' }, el('g', { class: 'sinal-g' }, svg));
    el('path', { d: arco(rs, 222, 300), class: 'ambar', 'stroke-width': 1.3 }, amb);
    const pontos = el('g', { class: 'pontos sinal-g' }, svg);
    for (let k = 0; k < 3; k++) {
      const [x, y] = pt(rs + 1.5, -7 + k * 7);
      el('circle', { cx: x, cy: y, r: 1.25 }, pontos);
    }

    const interno = el('g', { class: 'interno' }, el('g', { class: 'entra e4' }, svg));
    if (!interna) el('path', { d: arco(48, 210, 560), class: 'forte', 'stroke-width': 4 }, interno);
    el('circle', { r: 42.5, class: 'fino', 'stroke-width': 0.6 }, interno);
    const valor = el('text', { y: -2, class: 'valor entra e4' }, svg);
    valor.textContent = '—';
    el('text', { y: 18, class: 'rot entra e4' }, svg).textContent = rotulo;
    return {
      set(f, f2) {
        acende(blocos, f);
        if (interna) acende(blocos2, f2);
      },
      valor(txt) { valor.textContent = txt; },
      sinal(on) { svg.classList.toggle('sinal', Boolean(on)); },
    };
  }

  // Faixa de n blocos segmentados (div > i); devolve um setter 0..1.
  function faixa(box, n) {
    box.replaceChildren();
    const blocos = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      box.append(b);
      blocos.push(b);
    }
    return (f) => acende(blocos, f);
  }

  // Planta técnica de fundo: círculos, mira e cotas, quase invisíveis. Refeita ao mudar o tamanho.
  function planta(svg) {
    const desenha = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const cx = W * 0.5;
      const cy = H * 0.36;
      const a = el('g', { class: 'g-a' }, svg);
      const b = el('g', { class: 'g-b' }, svg);
      for (const r of [180, 260, 420]) el('circle', { cx, cy, r, class: 'pl' }, a);
      el('circle', { cx, cy, r: 340, class: 'pl2' }, b);
      el('circle', { cx, cy, r: 520, class: 'pl2' }, b);
      for (let k = 0; k < 12; k++) {
        const g = (k * 30 * Math.PI) / 180;
        const r1 = k % 3 ? 200 : 240;
        el('line', { x1: cx + Math.cos(g) * 180, y1: cy + Math.sin(g) * 180, x2: cx + Math.cos(g) * r1, y2: cy + Math.sin(g) * r1, class: 'pl' }, a);
      }
      el('line', { x1: 0, y1: cy, x2: W, y2: cy, class: 'pl2' }, svg);
      el('line', { x1: cx, y1: 0, x2: cx, y2: H, class: 'pl2' }, svg);
      el('rect', { x: cx - 120, y: cy + 300, width: 240, height: 60, class: 'pl' }, svg);
      // cotas: traço com marcas nas pontas
      const cota = (x0, y0, x1, y1) => {
        el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'pl' }, svg);
        const v = y0 === y1;
        for (const [x, y] of [[x0, y0], [x1, y1]]) {
          el('line', { x1: v ? x : x - 5, y1: v ? y - 5 : y, x2: v ? x : x + 5, y2: v ? y + 5 : y, class: 'pl' }, svg);
        }
      };
      cota(cx - 420, cy + 460, cx + 420, cy + 460);
      cota(cx + 470, cy - 260, cx + 470, cy + 260);
    };
    desenha();
    window.addEventListener('resize', desenha);
  }

  // Moldura do terminal: cantos grossos, dois entalhes e régua nas bordas inferior e direita.
  function moldura(svg, alvo) {
    const desenha = () => {
      const r = alvo.getBoundingClientRect();
      const W = Math.round(r.width);
      const H = Math.round(r.height);
      if (!W || !H) return;
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      el('path', { d: 'M1 26V1H26', class: 'forte' }, svg);
      el('path', { d: `M${W - 1} ${H - 26}V${H - 1}H${W - 26}`, class: 'forte' }, svg);
      el('path', { d: `M${W - 64} 1H${W - 36}`, class: 'forte f2' }, svg);
      el('path', { d: `M1 ${H - 64}V${H - 96}`, class: 'forte f2' }, svg);
      for (let x = 40; x < W - 40; x += 8) {
        const maior = x % 40 === 0;
        el('line', { x1: x, y1: H, x2: x, y2: H - (maior ? 7 : 3), class: maior ? 'tk' : 'tk f' }, svg);
      }
      for (let y = 48; y < H - 40; y += 8) {
        const maior = y % 40 === 8;
        el('line', { x1: W, y1: y, x2: W - (maior ? 7 : 3), y2: y, class: maior ? 'tk' : 'tk f' }, svg);
      }
    };
    new ResizeObserver(desenha).observe(alvo);
    desenha();
  }

  /**
   * Disco do mini player: capa redonda no centro (gira como um disco enquanto toca), faixa de 30 blocos
   * com o progresso da música, régua de ticks girando e anel externo grosso com entalhes.
   */
  let discos = 0;
  function disco(svg) {
    svg.replaceChildren();
    const id = `np-clip-${++discos}`;
    el('circle', { r: 46 }, el('clipPath', { id }, el('defs', {}, svg)));
    const ext = el('g', {}, svg);
    for (const [g0, g1] of [[10, 110], [130, 230], [250, 350]]) el('path', { d: arco(90, g0, g1), class: 'forte', 'stroke-width': 5 }, ext);
    el('path', { d: arco(97, 300, 330), class: 'forte', 'stroke-width': 2 }, ext);
    el('path', { d: arco(97, 120, 140), class: 'forte', 'stroke-width': 2 }, ext);
    const tick = el('g', { class: 'g-tick' }, svg);
    for (let i = 0; i < 48; i++) linha(tick, i % 4 ? 76 : 73, 81, i * 7.5, i % 4 ? 'tk f' : 'tk');
    const blocos = [];
    const passo = 360 / 30;
    for (let i = 0; i < 30; i++) blocos.push(el('path', { d: setor(55, 68, i * passo + 0.8, (i + 1) * passo - 0.8), class: 'bloco' }, svg));
    const capa = el('g', { class: 'capa' }, svg);
    el('circle', { r: 46, class: 'fundo' }, capa);
    const nota = el('text', { class: 'nota' }, capa);
    nota.textContent = '♪';
    const img = el('image', { x: -46, y: -46, width: 92, height: 92, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }, capa);
    img.style.display = 'none';
    el('circle', { r: 46.5, class: 'fino', 'stroke-width': 1 }, capa);
    el('circle', { r: 7, class: 'furo' }, capa); // furo do disco
    el('circle', { r: 50.5, class: 'fino', 'stroke-width': 0.6 }, svg);
    return {
      set: (f) => acende(blocos, f),
      art(src) {
        const ok = typeof src === 'string' && src.startsWith('data:image/');
        if (ok && img.getAttribute('href') !== src) img.setAttribute('href', src);
        img.style.display = ok ? '' : 'none';
        nota.style.display = ok ? 'none' : '';
      },
    };
  }

  window.NexusHud = { nucleo, faixa, planta, moldura, acende, disco };
})();
