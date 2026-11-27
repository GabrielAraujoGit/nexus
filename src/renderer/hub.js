'use strict';
// NEXUS — hub de apps no centro: Terminal e Web como abas (o + abre o que estiver fechado). Fechar o Terminal só
// esconde (o shell continua rodando); com tudo fechado aparece a tela inicial do hub. Música e visualizador
// continuam flutuando. Cada app se registra com { label() → [nome, detalhe], title, show(on), focus(), close() }.
// Atalhos: Ctrl+Shift+T abre/traz o Terminal, Ctrl+Shift+B o Web.
(function () {
  const $ = (id) => document.getElementById(id);
  const tabs = $('hub-tabs');
  const frame = $('term-frame');
  const title = $('term-title');
  const plus = $('hub-plus');
  const menu = $('hub-menu');
  const ORDER = ['shell', 'web'];
  const NAMES = { shell: 'Terminal', web: 'Web' };
  const KEYS = { shell: 'Ctrl+Shift+T', web: 'Ctrl+Shift+B' };
  const apps = {};
  const open = new Set(['shell']);
  const listeners = [];
  let active = 'shell';
  let homeCore = null;
  const sound = () => window.NexusSound;

  function paint() {
    const els = [];
    for (const name of ORDER) {
      const app = apps[name];
      if (!open.has(name) || !app) continue;
      const [main, sub] = app.label();
      const tab = document.createElement('div');
      tab.className = `hub-tab${name === active ? ' on' : ''}`;
      const sel = document.createElement('button');
      sel.type = 'button';
      sel.className = 'hub-sel';
      sel.setAttribute('role', 'tab');
      sel.setAttribute('aria-selected', String(name === active));
      sel.title = sub ? `${main} · ${sub}` : main;
      const b = document.createElement('b');
      b.textContent = main;
      sel.append(b);
      if (sub) {
        const s = document.createElement('small');
        s.textContent = sub;
        sel.append(s);
      }
      sel.addEventListener('click', () => activate(name));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'hub-x';
      x.textContent = '✕';
      x.setAttribute('aria-label', `Fechar ${main}`);
      x.addEventListener('click', () => close(name));
      tab.append(sel, x);
      els.push(tab);
    }
    tabs.replaceChildren(...els);
    plus.hidden = open.size === ORDER.length; // tudo aberto: nada para o + oferecer
    if (open.size === ORDER.length) showMenu(false);
    title.textContent = active ? apps[active].title : 'INÍCIO';
  }

  function emit() {
    listeners.forEach((cb) => cb());
  }

  // null = tela inicial
  function activate(name) {
    if (name && (!open.has(name) || !apps[name])) return;
    if (name !== active) troca();
    active = name;
    frame.dataset.app = name || 'home';
    for (const n of Object.keys(apps)) apps[n].show(n === name);
    paint();
    emit();
    focus();
  }

  // Troca de aba: varredura CRT curta sobre o conteúdo (a view nativa do Web aparece por cima, sem animar).
  function troca() {
    frame.classList.remove('troca');
    void frame.offsetWidth; // reinicia a animação
    frame.classList.add('troca');
  }
  frame.addEventListener('animationend', (e) => {
    if (e.animationName === 'troca-scan') frame.classList.remove('troca');
  });

  function focus() {
    if (active) apps[active].focus();
    else $('hub-web-url').focus();
  }

  // Abre (ou traz para a frente) um app.
  function openApp(name) {
    if (!apps[name]) return;
    showMenu(false);
    if (!open.has(name)) {
      open.add(name);
      sound().play('open');
    }
    activate(name);
  }

  // Tira a aba depois que o app fechou. Vai para a outra aba aberta, ou para a tela inicial.
  function remove(name) {
    if (!open.delete(name)) return;
    if (active === name) activate(ORDER.find((n) => open.has(n)) || null);
    else { paint(); emit(); }
  }

  function close(name) {
    sound().play('close');
    if (name === 'shell') remove('shell'); // só esconde: o processo segue rodando
    else apps[name].close();
  }

  // ---------- Botão + ----------
  function showMenu(on) {
    menu.hidden = !on;
    plus.setAttribute('aria-expanded', String(on));
    if (!on) return;
    const items = ORDER.map((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      const isOpen = open.has(name);
      b.disabled = isOpen;
      b.innerHTML = `<span class="hub-ico" aria-hidden="true">${name === 'shell' ? '▸_' : '◎'}</span>`;
      b.append(NAMES[name]);
      const k = document.createElement('kbd');
      k.textContent = isOpen ? 'aberto' : KEYS[name];
      b.append(k);
      b.addEventListener('click', () => openApp(name));
      return b;
    });
    menu.replaceChildren(...items);
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  plus.addEventListener('click', () => showMenu(menu.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !e.target.closest('#hub-menu, #hub-plus')) showMenu(false);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      showMenu(false);
      focus();
    }
  });

  // ---------- Tela inicial ----------
  // núcleo vivo: hora no centro, CPU na faixa externa (e no rótulo) e memória na interna; só com a tela inicial à vista
  homeCore = window.NexusHud.nucleo($('hub-core'), { rotulo: 'CPU', interna: true });
  const pad = (n) => String(n).padStart(2, '0');
  window.nexus.onTick((t) => {
    if (active) return;
    const d = new Date();
    homeCore.valor(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    homeCore.rotulo(`CPU ${Math.round(t.load)}%`);
    homeCore.set(t.load / 100, t.memUsed / t.memTotal);
  });
  $('hub-open-shell').addEventListener('click', () => openApp('shell'));
  // clicar no cartão (fora do campo) abre o Web vazio
  $('hub-web-form').addEventListener('click', (e) => {
    if (e.target.id !== 'hub-web-url') openApp('web');
  });
  $('hub-web-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('hub-web-url');
    const url = input.value.trim();
    if (!url) return;
    input.value = '';
    openApp('web');
    apps.web.go(url);
  });

  // ---------- Atalhos ----------
  function shortcut(key) {
    if (key === 'T') openApp('shell');
    else if (key === 'B') openApp('web');
  }
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || e.altKey || (e.code !== 'KeyT' && e.code !== 'KeyB')) return;
    e.preventDefault();
    e.stopPropagation(); // não chega ao shell
    shortcut(e.code.slice(3));
  }, true);
  window.nexus.web.onHubKey((key) => shortcut(key)); // vindo da página do Web (ela tem o foco do teclado)

  window.NexusHub = {
    register(name, app) { apps[name] = app; paint(); },
    open: openApp,
    close,
    remove,
    activate,
    isOpen: (name) => open.has(name),
    active: () => active,
    focus,
    refresh: paint,
    onChange: (cb) => listeners.push(cb),
  };
})();
