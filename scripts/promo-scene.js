// Roteiro do vídeo de divulgação (roda dentro do NEXUS em modo de gravação).
// Tempos contados a partir do carregamento: a abertura ocupa os ~3 s iniciais.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const code = (ch) => /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : /\d/.test(ch) ? `Digit${ch}`
    : ({ ' ': 'Space', '/': 'IntlRo', '-': 'Minus', '.': 'Period', '~': 'Quote', '=': 'Equal' })[ch] || '';
  const type = async (text) => {
    for (const ch of text) {
      const c = code(ch);
      if (c) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      nexus.write(ch);
      await sleep(50);
      if (c) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    nexus.write('\r');
    await sleep(90);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter' }));
  };
  await sleep(3600);
  await type('cd ~/projetos/nexus');
  await sleep(700);
  await type('eza --tree --level=2 --icons=always');
  await sleep(1300);
  $('theme-btn').click(); // Cyberpunk
  await sleep(1700);
  $('theme-btn').click(); // Âmbar
  await sleep(1700);
  $('theme-btn').click(); // Tron
  await sleep(500);
  Object.assign($('web').style, { left: '620px', top: '110px', width: '860px', height: '520px', right: 'auto' });
  $('web-btn').click();
  await sleep(450);
  $('web-url').value = 'github.com/gabterm/nexus';
  $('web-form').requestSubmit();
  await sleep(4200);
  $('web-close').click();
})();
