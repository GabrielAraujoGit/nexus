"""Recortes de detalhe para o tour visual do README, a partir das capturas em docs/screenshots/.

Rodado no fim do scripts/screenshots.sh. As coordenadas são do layout de 1600x900 (capturas em 2x).
"""
from pathlib import Path

from PIL import Image

SHOTS = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
SCALE = 2  # capturas em 3200x1800

# nome do arquivo: (captura de origem, caixa em pixels do layout 1600x900)
CROPS = {
    "detail-system.png": ("nexus-tron.png", (0, 0, 340, 575)),
    "detail-network.png": ("nexus-cyberpunk.png", (1258, 0, 1600, 575)),
    "detail-keyboard.png": ("nexus-ambar.png", (735, 630, 1600, 895)),
}


def crop(src: str, box: tuple[int, int, int, int]) -> Image.Image:
    im = Image.open(SHOTS / src).convert("RGB")
    return im.crop(tuple(v * SCALE for v in box))


def themes_strip() -> Image.Image:
    """Os três temas lado a lado, mesma cena, com um fio entre eles."""
    w, h, gap = 1060, 596, 10
    strip = Image.new("RGB", (3 * w + 2 * gap, h), (5, 8, 13))
    for i, name in enumerate(("tron", "cyberpunk", "ambar")):
        im = Image.open(SHOTS / f"nexus-{name}.png").convert("RGB").resize((w, h), Image.LANCZOS)
        strip.paste(im, (i * (w + gap), 0))
    return strip


if __name__ == "__main__":
    for out, (src, box) in CROPS.items():
        crop(src, box).save(SHOTS / out, optimize=True)
    themes_strip().save(SHOTS / "themes.png", optimize=True)
    print("detalhes:", ", ".join([*CROPS, "themes.png"]))
