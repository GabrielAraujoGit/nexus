#!/usr/bin/env bash
# Gera as capturas de tela do README em docs/screenshots/, uma por tema.
# Roda o app em modo demo: usuário, máquina, IP, processos e pasta pessoal são fictícios.
#   npm run screenshots
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=docs/screenshots
mkdir -p "$OUT"
DEMO_HOME=$(mktemp -d)
trap 'rm -rf "$DEMO_HOME"' EXIT

# ---------- Pasta pessoal de exemplo ----------
mkdir -p "$DEMO_HOME"/{Documentos,Downloads,Imagens,Música,Vídeos,.config}
mkdir -p "$DEMO_HOME"/projetos/nexus/{src/renderer,docs,scripts} "$DEMO_HOME"/projetos/{site,api,dotfiles}
touch "$DEMO_HOME"/projetos/nexus/{package.json,LICENSE} "$DEMO_HOME"/projetos/nexus/src/{main.js,preload.js}
touch "$DEMO_HOME"/projetos/nexus/src/renderer/{app.js,globe.js,keyboard.js,style.css}
touch "$DEMO_HOME"/{notas.md,todo.txt} "$DEMO_HOME"/Imagens/wallpaper.png
cat > "$DEMO_HOME/projetos/nexus/README.md" <<'EOF'
# NEXUS

Terminal sci-fi com painéis de sistema.

## Painéis

- Relógio, uptime e energia
- CPU por núcleo, temperatura e tarefas
- Memória em grade de pontos
- Rede: estado, IP, ping e tráfego
- Arquivos da pasta atual do shell
- Teclado na tela
EOF

[ -f "$HOME/.config/starship.toml" ] && cp "$HOME/.config/starship.toml" "$DEMO_HOME/.config/"
cat > "$DEMO_HOME/.bashrc" <<'EOF'
export HISTFILE=/dev/null
alias ls='eza --icons=auto --group-directories-first' 2>/dev/null
command -v starship >/dev/null && eval "$(starship init bash)" || PS1='\[\e[1;36m\]\w\[\e[0m\] ❯ '
EOF

FETCH='fastfetch -s OS:Kernel:Uptime:Packages:Shell:DE:WM:Terminal:CPU:GPU:Memory:Disk:Break:Colors'
BAT=$(command -v batcat || command -v bat || echo cat)
TREE='eza --tree --level=3 --icons=always'
command -v eza >/dev/null || TREE='find . -maxdepth 3 -not -path "*/.*"'

shot() { # tema arquivo comando
    local theme=$1 file=$2 cmd=$3
    echo "==> $file ($theme)"
    NEXUS_DEMO=1 NEXUS_DEMO_HOME="$DEMO_HOME" NEXUS_THEME="$theme" \
    NEXUS_SNAPSHOT="$OUT/$file" NEXUS_SNAPSHOT_DELAY=4000 \
    NEXUS_SNAPSHOT_JS="new Promise(r => { nexus.write($(printf '%s' "$cmd" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))') + '\r'); setTimeout(() => r('ok'), 3500); })" \
        ./node_modules/.bin/electron . >/dev/null 2>&1
}

shot tron      nexus-tron.png      "clear && cd ~/projetos/nexus && $FETCH"
shot cyberpunk nexus-cyberpunk.png "clear && cd ~/projetos/nexus && $TREE"
shot ambar     nexus-ambar.png     "clear && cd ~/projetos/nexus && $BAT --paging=never README.md"

echo "Pronto: $(ls "$OUT")"
