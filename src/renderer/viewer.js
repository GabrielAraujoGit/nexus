'use strict';
// NEXUS — visualizador de arquivos: janela flutuante com texto (números de linha), imagem ou o começo de um
// binário em hexadecimal. O conteúdo vem do processo principal e entra sempre por textContent ou data URL.
(function () {
  const $ = (id) => document.getElementById(id);
  const body = $('viewer-body');
  const status = $('viewer-status');
  const sound = window.NexusSound;
  const MAX_LINES = 20000; // acima disso mostra o começo (o arquivo já chega limitado a 512 KB)
  let current = null;
  let wrap = false;
  try { wrap = localStorage.getItem('nexus.viewer.wrap') === 'on'; } catch { /* padrão */ }

  const frame = window.NexusFloat({
    box: $('viewer'),
    bar: $('viewer-bar'),
    slot: body,
    bounds: () => {}, // conteúdo é HTML comum, não uma view nativa
    front: () => {},
  });

  const size = (n) => {
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
  };
  const when = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

  function paintWrap() {
    $('viewer-wrap').setAttribute('aria-pressed', String(wrap));
    body.classList.toggle('wrap', wrap);
  }
  paintWrap();

  function message(text) {
    const p = document.createElement('p');
    p.className = 'viewer-msg';
    p.textContent = text;
    body.replaceChildren(p);
  }

  function renderText(text) {
    const lines = text.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const shown = lines.slice(0, MAX_LINES);
    const pre = document.createElement('pre');
    pre.className = 'viewer-text';
    const frag = document.createDocumentFragment();
    for (const line of shown) {
      const row = document.createElement('span');
      row.className = 'ln';
      row.textContent = `${line}\n`;
      frag.append(row);
    }
    pre.append(frag);
    pre.style.setProperty('--gutter', `${String(shown.length).length + 1}ch`);
    body.replaceChildren(pre);
    return lines.length;
  }

  function render(r) {
    current = r;
    body.scrollTop = 0;
    body.scrollLeft = 0;
    $('viewer-name').textContent = r.name || '';
    $('viewer-name').title = r.name || '';
    if (r.error) {
      message(r.error);
      status.textContent = r.size !== undefined ? `${size(r.size)} · ${when(r.mtime)}` : 'Erro';
      sound.play('error');
      return;
    }
    const meta = `${size(r.size)} · modificado ${when(r.mtime)}`;
    if (r.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'viewer-img';
      img.alt = r.name;
      img.src = r.data;
      img.addEventListener('load', () => { status.textContent = `imagem · ${img.naturalWidth}×${img.naturalHeight} · ${meta}`; });
      img.addEventListener('error', () => message('não deu para mostrar esta imagem'));
      const box = document.createElement('div');
      box.className = 'viewer-imgbox';
      box.append(img);
      body.replaceChildren(box);
      status.textContent = `imagem · ${meta}`;
    } else if (r.kind === 'binary') {
      const pre = document.createElement('pre');
      pre.className = 'viewer-hex';
      pre.textContent = r.text;
      body.replaceChildren(pre);
      status.textContent = `binário · mostrando o começo em hexadecimal · ${meta}`;
    } else {
      const n = renderText(r.text || '');
      const cut = r.truncated || n > MAX_LINES ? ' · mostrando só o começo' : '';
      status.textContent = `texto · ${n.toLocaleString('pt-BR')} linhas · ${meta}${cut}`;
    }
  }

  async function open(name) {
    frame.show(true);
    $('viewer-name').textContent = name;
    message('Carregando…');
    status.textContent = '…';
    try {
      render(await window.nexus.readFile(name));
    } catch (err) {
      console.error('[nexus] visualizador:', err);
      render({ name, error: 'não deu para ler o arquivo' });
    }
  }

  $('viewer-close').addEventListener('click', () => frame.show(false));
  $('viewer-wrap').addEventListener('click', () => {
    wrap = !wrap;
    try { localStorage.setItem('nexus.viewer.wrap', wrap ? 'on' : 'off'); } catch { /* ignora */ }
    paintWrap();
    sound.play('toggle');
  });
  $('viewer-paste').addEventListener('click', () => {
    if (!current?.name) return;
    window.nexus.write(`${shellQuote(current.name)} `);
    sound.play('select');
  });

  // Ctrl+C copia o texto selecionado no visualizador (o terminal ficaria com o ^C).
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.code !== 'KeyC' || e.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !body.contains(sel.anchorNode)) return;
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(sel.toString()).catch(() => {});
  }, true);

  window.NexusViewer = { open };
})();
