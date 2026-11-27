#!/usr/bin/env bash
# Gera as capturas de tela do README em docs/screenshots/, uma por tema.
# Roda o app em modo demo: usuário, máquina, IP, processos e pasta pessoal são fictícios.
#   npm run screenshots
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=docs/screenshots
mkdir -p "$OUT"
# shellcheck source=demo-home.sh
source scripts/demo-home.sh

FETCH='fastfetch -s OS:Kernel:Uptime:Packages:Shell:DE:WM:Terminal:CPU:GPU:Disk:Break:Colors'
BAT=$(command -v batcat || command -v bat || echo cat)
TREE='eza --tree --level=3 --icons=always'
command -v eza >/dev/null || TREE='find . -maxdepth 3 -not -path "*/.*"'

shot() { # tema arquivo comando [js extra] [espera ms]
    local theme=$1 file=$2 cmd=$3 extra=${4:-} wait=${5:-3500}
    echo "==> $file ($theme)"
    NEXUS_DEMO=1 NEXUS_DEMO_HOME="$DEMO_HOME" NEXUS_THEME="$theme" \
    NEXUS_SNAPSHOT="$OUT/$file" NEXUS_SNAPSHOT_DELAY=4000 \
    NEXUS_SNAPSHOT_JS="new Promise(r => { nexus.write($(printf '%s' "$cmd" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))') + '\r'); $extra; setTimeout(() => r('ok'), $wait); })" \
        ./node_modules/.bin/electron . >/dev/null 2>&1
}

# Mini navegador aberto na página pública do próprio repositório (única captura que acessa a internet).
WEB_JS="NexusHub.open('web');
document.getElementById('web-url').value = 'github.com/gabterm/nexus';
document.getElementById('web-form').requestSubmit()"

shot tron      nexus-tron.png      "clear && cd ~/projetos/nexus && $FETCH"
shot cyberpunk nexus-cyberpunk.png "clear && cd ~/projetos/nexus && $TREE"
shot ambar     nexus-ambar.png     "clear && cd ~/projetos/nexus && $BAT --paging=never README.md"
shot tron      nexus-web.png       "clear && cd ~/projetos/nexus" "$WEB_JS" 8000

echo "Pronto: $(ls "$OUT")"

# Recortes de detalhe e faixa dos temas para o tour do README
python3 scripts/details.py
