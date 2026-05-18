"""
Regenerates Android adaptive icon layers and the splash icon from
assets/images/icon.png by stripping the dark navy background to
transparency and placing the logo with proper Android safe-zone padding.

Run from the `mobile/` directory:
    python scripts/fix-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "images"

SRC_ICON = ASSETS / "icon.png"
OUT_FOREGROUND = ASSETS / "android-icon-foreground.png"
OUT_BACKGROUND = ASSETS / "android-icon-background.png"
OUT_MONOCHROME = ASSETS / "android-icon-monochrome.png"
OUT_SPLASH = ASSETS / "splash-icon.png"

# Hex #181E38 -> RGB
BG_COLOR = (24, 30, 56)
# Tolerance for "near-bg" pixel detection (per channel)
TOLERANCE = 35
# Output canvas size for the adaptive icon layers
ICON_SIZE = 1024
# Fraction of the canvas the logo content occupies (Android safe zone is
# the inner ~66%, so 0.60 keeps the logo well inside it)
LOGO_FRACTION = 0.60
# Splash output canvas size (kept square, large enough for any DPI)
SPLASH_SIZE = 1024
SPLASH_LOGO_FRACTION = 0.90  # splash has its own resizeMode/imageWidth


def _is_bg(r: int, g: int, b: int) -> bool:
    return (
        abs(r - BG_COLOR[0]) <= TOLERANCE
        and abs(g - BG_COLOR[1]) <= TOLERANCE
        and abs(b - BG_COLOR[2]) <= TOLERANCE
    )


def _is_navy_card(r: int, g: int, b: int) -> bool:
    """A pixel that clearly belongs to the navy card (dark and blue-tinted)."""
    return b > r + 8 and b > g + 5 and (r + g + b) < 320


def _is_logo_pixel(r: int, g: int, b: int) -> bool:
    """Return True if the pixel is one of the logo colors we want to keep:
    bright white (VEND), red (88), or a neutral medium gray (DASHBOARD)."""
    if r >= 200 and g >= 200 and b >= 200:
        return True
    if r >= 140 and g <= 130 and b <= 130 and r > g + 30 and r > b + 30:
        return True
    if 110 <= r <= 200 and 110 <= g <= 200 and 110 <= b <= 200:
        if max(r, g, b) - min(r, g, b) <= 18:
            return True
    return False


def strip_background(img: Image.Image) -> Image.Image:
    """Detect the navy card region, then within it keep only logo-colored
    pixels. Everything outside the card region becomes fully transparent."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    # Locate the navy card bounding box.
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if _is_navy_card(r, g, b):
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if max_x < 0:
        raise RuntimeError("Could not detect navy card region in icon.png")

    # Inset aggressively to clip past the rounded corners of the card,
    # which contain light-gray outer-canvas pixels that would otherwise
    # be mis-classified as logo content. The logo is centered and
    # occupies the inner ~60% of the card, so a 15% inset is safe.
    inset = (max_x - min_x) // 7
    min_x += inset
    min_y += inset
    max_x -= inset
    max_y -= inset

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            inside = (min_x <= x <= max_x) and (min_y <= y <= max_y)
            if not inside or not _is_logo_pixel(r, g, b):
                px[x, y] = (r, g, b, 0)
    return img


def trim_transparent(img: Image.Image) -> Image.Image:
    """Crop the image to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def fit_into_canvas(
    logo: Image.Image, canvas_size: int, logo_fraction: float
) -> Image.Image:
    """Scale logo so its longer side fits logo_fraction of canvas_size,
    then center it on a transparent canvas of canvas_size x canvas_size."""
    target = int(canvas_size * logo_fraction)
    w, h = logo.size
    scale = target / max(w, h)
    new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    resized = logo.resize(new_size, Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - new_size[0]) // 2
    y = (canvas_size - new_size[1]) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def make_monochrome(foreground: Image.Image) -> Image.Image:
    """Convert any non-transparent content to solid white, keeping alpha."""
    fg = foreground.convert("RGBA")
    px = fg.load()
    w, h = fg.size
    for y in range(h):
        for x in range(w):
            _, _, _, a = px[x, y]
            px[x, y] = (255, 255, 255, a)
    return fg


def main() -> None:
    if not SRC_ICON.exists():
        raise SystemExit(f"Source icon not found: {SRC_ICON}")

    print(f"Loading {SRC_ICON}")
    src = Image.open(SRC_ICON).convert("RGBA")

    print("Stripping navy background to transparency...")
    transparent = strip_background(src)
    logo = trim_transparent(transparent)
    print(f"  logo bbox size: {logo.size}")

    print(f"Writing {OUT_FOREGROUND}")
    foreground = fit_into_canvas(logo, ICON_SIZE, LOGO_FRACTION)
    foreground.save(OUT_FOREGROUND, "PNG")

    print(f"Writing {OUT_BACKGROUND} (solid #181E38)")
    background = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), BG_COLOR + (255,))
    background.save(OUT_BACKGROUND, "PNG")

    print(f"Writing {OUT_MONOCHROME}")
    monochrome = make_monochrome(foreground)
    monochrome.save(OUT_MONOCHROME, "PNG")

    print(f"Writing {OUT_SPLASH}")
    splash = fit_into_canvas(logo, SPLASH_SIZE, SPLASH_LOGO_FRACTION)
    splash.save(OUT_SPLASH, "PNG")

    print("Done.")


if __name__ == "__main__":
    main()
