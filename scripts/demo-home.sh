#!/usr/bin/env bash
# Cria a pasta pessoal fictícia usada pelas capturas e pela demo (modo demo do NEXUS).
# Uso: source scripts/demo-home.sh   →   define DEMO_HOME (apagada ao sair do script que chamou)
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

