'use strict';
// NEXUS — hub de apps no centro: abas sobre o painel do terminal. O shell é uma aba (fechar só esconde; o processo
// continua e o botão Terminal da barra traz de volta); o mini navegador entra como aba quando encaixado.
// Cada app se registra com { label() → [nome, detalhe], title, show(on), focus(), close() }.
(function () {
  const $ = (id) => document.getElementById(id);
  const tabs = $('hub-tabs');
  const frame = $('term-frame');
  const title = $('term-title');
  const termBtn = $('term-btn');
  const ORDER = ['shell', 'web'];
  const apps = {};
  const open = new Set(['shell']);
  const listeners = [];
  let active = 'shell';
  let shellTitle = '';

  function paint() {
    const els = [];
    for (const name of ORDER) {
      const app = apps[name];
      if (!open.has(name) || !app) continue;
      const [main, sub] = name === 'shell' && shellTitle ? [shellTitle] : app.label(); // título que o shell mandou
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
      tab.append(sel);
      if (name !== 'shell' || open.size > 1) { // o shell só fecha se sobrar outra aba
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'hub-x';
        x.textContent = '✕';
        x.setAttribute('aria-label', `Fechar ${main}`);
        x.addEventListener('click', () => close(name));
        tab.append(x);
      }
      els.push(tab);
    }
    tabs.replaceChildren(...els);
    title.textContent = active === 'shell' ? (shellTitle || 'SHELL PRINCIPAL') : apps[active].title;
    termBtn.hidden = open.has('shell');
  }

  function activate(name) {
    if (!open.has(name) || !apps[name]) return;
    active = name;
    frame.dataset.app = name;
    for (const n of Object.keys(apps)) apps[n].show(n === name && open.has(n));
    paint();
    listeners.forEach((cb) => cb());
    apps[name].focus();
  }

  function add(name) {
    open.add(name);
    paint();
  }

  // Tira a aba (o app já se fechou ou foi solto). Sem outra aba, o shell volta.
  function remove(name) {
    if (name === 'shell' || !open.delete(name)) return;
    if (active === name || !open.size) {
      open.add('shell');
      activate('shell');
    } else {
      paint();
      listeners.forEach((cb) => cb());
    }
  }

  function close(name) {
    if (name === 'shell') {
      if (open.size < 2) return;
      open.delete('shell');
      window.NexusSound.play('close');
      activate([...open][0]);
      return;
    }
    apps[name].close();
  }

  function showShell() {
    open.add('shell');
    window.NexusSound.play('open');
    activate('shell');
  }
  termBtn.addEventListener('click', showShell);

  window.NexusHub = {
    register(name, app) { apps[name] = app; paint(); },
    add,
    remove,
    activate,
    showShell,
    isOpen: (name) => open.has(name),
    active: () => active,
    focus: () => apps[active]?.focus(),
    refresh: paint,
    setShellTitle(t) { shellTitle = t || ''; paint(); },
    onChange: (cb) => listeners.push(cb),
  };
})();
