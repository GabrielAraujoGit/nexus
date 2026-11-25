'use strict';
// Teclado ABNT2 na tela: acende com a tecla física (por event.code) e envia ao shell no clique.
(function () {
  // [code, rótulo, rótulo com shift, classe de largura, sequência enviada no clique]
  const ROWS = [
    [['Escape', 'Esc', '', 'w15', '\x1b'], ['Backquote', "'", '"'], ['Digit1', '1', '!'], ['Digit2', '2', '@'], ['Digit3', '3', '#'],
      ['Digit4', '4', '$'], ['Digit5', '5', '%'], ['Digit6', '6', '¨'], ['Digit7', '7', '&'], ['Digit8', '8', '*'],
      ['Digit9', '9', '('], ['Digit0', '0', ')'], ['Minus', '-', '_'], ['Equal', '=', '+'], ['Backspace', 'Apagar', '', 'w2', '\x7f']],
    [['Tab', 'Tab', '', 'w15', '\t'], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'],
      ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', '´', '`'], ['BracketRight', '[', '{'], ['Enter', 'Enter', '', 'w15', '\r']],
    [['CapsLock', 'Caps', '', 'w175', ''], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'],
      ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', 'Ç'], ['Quote', '~', '^'], ['Backslash', ']', '}']],
    [['ShiftLeft', 'Shift', '', 'w15', ''], ['IntlBackslash', '\\', '|'], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'],
      ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ',', '<'], ['Period', '.', '>'], ['Slash', ';', ':'], ['IntlRo', '/', '?'], ['ShiftRight', 'Shift', '', 'w2', '']],
    [['ControlLeft', 'Ctrl', '', 'w15', ''], ['MetaLeft', 'Super', '', 'w15', ''], ['AltLeft', 'Alt', '', 'w15', ''], ['Space', '', '', 'space', ' '],
      ['AltRight', 'Alt Gr', '', 'w15', ''], ['ArrowLeft', '←', '', '', '\x1b[D'], ['ArrowUp', '↑', '', '', '\x1b[A'], ['ArrowDown', '↓', '', '', '\x1b[B'],
      ['ArrowRight', '→', '', '', '\x1b[C'], ['ControlRight', 'Ctrl', '', 'w15', '']],
  ];

  class Keyboard {
    constructor(root, onSend) {
      this.root = root;
      this.onSend = onSend;
      this.keys = new Map();
      this.shift = false;
      this.render();
      window.addEventListener('keydown', (e) => this.light(e.code, true), true);
      window.addEventListener('keyup', (e) => this.light(e.code, false), true);
      window.addEventListener('blur', () => this.keys.forEach((el) => el.classList.remove('down')));
    }

    render() {
      for (const row of ROWS) {
        const rowEl = document.createElement('div');
        rowEl.className = 'kb-row';
        for (const [code, label, shifted = '', width = '', seq] of row) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `key ${width}`.trim();
          btn.tabIndex = -1;
          btn.setAttribute('aria-label', label || (code === 'Space' ? 'espaço' : code));
          if (shifted) {
            const s = document.createElement('small');
            s.textContent = shifted;
            btn.append(s);
          }
          btn.append(document.createTextNode(label));
          btn.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco do terminal
          btn.addEventListener('click', () => this.press(code, label, shifted, seq));
          rowEl.append(btn);
          if (!this.keys.has(code)) this.keys.set(code, btn);
        }
        this.root.append(rowEl);
      }
    }

    press(code, label, shifted, seq) {
      if (code.startsWith('Shift')) {
        this.shift = !this.shift;
        this.keys.get('ShiftLeft').classList.toggle('down', this.shift);
        return;
      }
      let out = seq;
      if (out === undefined) {
        out = this.shift && shifted ? shifted : (label.length === 1 ? label.toLowerCase() : label);
        if (this.shift && !shifted) out = label.toUpperCase();
      }
      if (out) this.onSend(out);
      if (this.shift) {
        this.shift = false;
        this.keys.get('ShiftLeft').classList.remove('down');
      }
      this.flash(code);
    }

    light(code, down) {
      const el = this.keys.get(code);
      if (el) el.classList.toggle('down', down);
    }

    flash(code) {
      this.light(code, true);
      setTimeout(() => this.light(code, false), 120);
    }
  }

  window.NexusKeyboard = Keyboard;
})();
