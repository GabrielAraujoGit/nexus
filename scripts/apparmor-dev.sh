#!/usr/bin/env bash
# Ubuntu 24.04+ bloqueia o sandbox do Chromium (restrição de user namespaces) e o
# `npm start` aborta com "The SUID sandbox helper binary was found, but is not configured correctly".
# Este script cria um perfil AppArmor que libera user namespaces só para o Electron deste projeto,
# mantendo o sandbox ligado (não use --no-sandbox).
#   sudo bash scripts/apparmor-dev.sh          instala
#   sudo bash scripts/apparmor-dev.sh remove   remove
set -euo pipefail
ELECTRON="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron/dist/electron"
PROFILE=/etc/apparmor.d/nexus-dev

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo: sudo bash $0 ${1:-}" >&2
  exit 1
fi

if [ "${1:-}" = remove ]; then
  if [ -f "$PROFILE" ]; then
    apparmor_parser -R "$PROFILE" || true
    rm -f "$PROFILE"
  fi
  echo "Perfil removido."
  exit 0
fi

[ -x "$ELECTRON" ] || { echo "Electron não encontrado em $ELECTRON (rode npm install antes)." >&2; exit 1; }

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<PROF
# Gerado por scripts/apparmor-dev.sh (NEXUS): libera user namespaces para o Electron de desenvolvimento.
abi <abi/4.0>,
include <tunables/global>

profile nexus-dev "$ELECTRON" flags=(unconfined) {
  userns,
  include if exists <local/nexus-dev>
}
PROF
apparmor_parser -Q -K "$TMP" # valida antes de instalar
install -m 644 "$TMP" "$PROFILE"
apparmor_parser -r "$PROFILE"
echo "Perfil instalado para: $ELECTRON"
