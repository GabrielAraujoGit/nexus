#!/usr/bin/env bash
# Gera os vídeos de divulgação (dist/nexus-promo.mp4 em inglês e dist/nexus-promo-pt.mp4 em português):
# 1920x1080, 30 fps, H.264, ~22 s, sem áudio. Uma gravação só, duas montagens.
# Grava a cena (scripts/promo-scene.js) em modo demo, monta legendas e cartela final
# (scripts/promo-compose.js) e remuxa para MP4 padrão com índice no início (aceito pelo X).
#   npm run promo        (precisa do gst-launch-1.0 para o remux)
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=demo-home.sh
source scripts/demo-home.sh
FRAMES=$(mktemp -d)
RAW=$(mktemp --suffix=.mp4)
trap 'rm -rf "$DEMO_HOME" "$FRAMES" "$RAW"' EXIT
mkdir -p dist

echo "==> gravando a cena (1080p, 30 fps)"
NEXUS_DEMO=1 NEXUS_DEMO_HOME="$DEMO_HOME" NEXUS_THEME=tron \
NEXUS_RECORD="$FRAMES" NEXUS_RECORD_FPS=30 NEXUS_RECORD_SECONDS=18 \
NEXUS_SNAPSHOT_SIZE=1920x1080 NEXUS_SNAPSHOT_SCALE=1 \
NEXUS_SNAPSHOT_JS="$(cat scripts/promo-scene.js)" ./node_modules/.bin/electron . >/dev/null 2>&1

for lang in en pt; do
  out=dist/nexus-promo.mp4
  [ "$lang" = pt ] && out=dist/nexus-promo-pt.mp4
  echo "==> montando legendas e cartela ($lang)"
  ./node_modules/.bin/electron scripts/promo-compose.js "$FRAMES" "$RAW" "$lang" 2>&1 | grep -E "quadros|^ok" || true
  echo "==> remux para MP4 padrão ($out)"
  gst-launch-1.0 -q filesrc location="$RAW" ! qtdemux name=d d.video_0 ! queue \
    ! 'video/x-h264,stream-format=avc,alignment=au' ! mp4mux faststart=true ! filesink location="$out"
done
ls -lh dist/nexus-promo.mp4 dist/nexus-promo-pt.mp4
