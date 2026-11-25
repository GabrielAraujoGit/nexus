#!/usr/bin/env bash
# Grava a demo animada do README (docs/demo.webp e docs/demo.gif) em modo demo, com dados fictícios.
# Roteiro: boot, digitação (com o teclado na tela acendendo), troca de tema, mini navegador no
# repositório (única parte que acessa a internet) e outra troca de tema.
#   npm run demo
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=demo-home.sh
source scripts/demo-home.sh
FRAMES=$(mktemp -d)
trap 'rm -rf "$DEMO_HOME" "$FRAMES"' EXIT
FPS=10
SECONDS_TOTAL=16

read -r -d '' SCENE <<'JS' || true
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  // tecla física correspondente a cada caractere, para o teclado na tela acender
  const code = (ch) => /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : /\d/.test(ch) ? `Digit${ch}`
    : ({ ' ': 'Space', '/': 'IntlRo', '-': 'Minus', '.': 'Period', '~': 'Quote', '=': 'Equal' })[ch] || '';
  const type = async (text) => {
    for (const ch of text) {
      const c = code(ch);
      if (c) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      nexus.write(ch);
      await sleep(55);
      if (c) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    nexus.write('\r');
    await sleep(90);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter' }));
  };
  await sleep(2600);
  await type('cd ~/projetos/nexus');
  await sleep(900);
  await type('eza --tree --level=2 --icons=always');
  await sleep(1500);
  $('theme-btn').click();
  await sleep(1400);
  Object.assign($('web').style, { left: '560px', top: '90px', width: '720px', height: '430px', right: 'auto' });
  $('web-btn').click();
  await sleep(500);
  $('web-url').value = 'github.com/gabterm/nexus';
  $('web-form').requestSubmit();
  await sleep(3600);
  $('web-close').click();
  await sleep(800);
  $('theme-btn').click();
})();
JS

echo "==> gravando ${SECONDS_TOTAL}s a ${FPS} fps"
NEXUS_DEMO=1 NEXUS_DEMO_HOME="$DEMO_HOME" NEXUS_THEME=tron \
NEXUS_RECORD="$FRAMES" NEXUS_RECORD_FPS=$FPS NEXUS_RECORD_SECONDS=$SECONDS_TOTAL NEXUS_SNAPSHOT_SCALE=1 \
NEXUS_SNAPSHOT_JS="$SCENE" ./node_modules/.bin/electron . >/dev/null 2>&1

echo "==> montando GIF e WebP"
python3 - "$FRAMES" "$FPS" <<'PY'
import glob, sys
from PIL import Image
frames_dir, fps = sys.argv[1], int(sys.argv[2])
files = sorted(glob.glob(f"{frames_dir}/frame-*.jpg"))
frames = [Image.open(f).convert("RGB") for f in files]
ms = int(1000 / fps)
# WebP (README): nítido e leve
webp = [f.resize((1280, 720), Image.LANCZOS) for f in frames]
webp[0].save("docs/demo.webp", save_all=True, append_images=webp[1:], duration=ms, loop=0, quality=72, method=6)
# GIF (redes sociais, que não aceitam WebP): menor, paleta por quadro
gif = [f.resize((960, 540), Image.LANCZOS).quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
gif[0].save("docs/demo.gif", save_all=True, append_images=gif[1:], duration=ms, loop=0, optimize=True)
print(f"{len(frames)} quadros")
PY
ls -lh docs/demo.webp docs/demo.gif
