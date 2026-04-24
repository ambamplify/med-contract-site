#!/usr/bin/env python3
"""
MedContractIntel — Video 1 Thumbnail Generator
Creates a 1280x720px YouTube thumbnail.
"""

import os
import math
import urllib.request
import urllib.parse
import re
import tempfile
from PIL import Image, ImageDraw, ImageFont

# ── Colors (v2 palette — dark green + dark gold + teal, no blue) ─────────
GREEN       = (15,  61,  46)   # #0f3d2e — primary deep forest
GREEN_LIGHT = (31, 110, 67)    # #1f6e43 — primary-mid
GOLD        = (184, 151, 59)   # #b8973b — heritage dark gold
TEAL        = (26,  144, 144)  # #1a9090 — teal accent
WHITE       = (255, 255, 255)
WHITE70     = (255, 255, 255, 178)
# Legacy aliases so existing call sites keep working
NAVY        = GREEN
NAVY_LIGHT  = GREEN_LIGHT

W, H = 1280, 720
BAR_H = 64

# ── Download Inter Bold TTF ───────────────────────────────────────────────
def download_inter_bold(tmp_dir):
    """Download Inter Bold woff2 from GitHub and convert to TTF with fonttools."""
    try:
        woff2_url = (
            "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Bold.woff2"
        )
        woff2_dest = os.path.join(tmp_dir, "Inter-Bold.woff2")
        ttf_dest   = os.path.join(tmp_dir, "Inter-Bold.ttf")
        urllib.request.urlretrieve(woff2_url, woff2_dest)
        from fontTools import ttLib
        tt = ttLib.TTFont(woff2_dest)
        tt.save(ttf_dest)
        print(f"Downloaded and converted Inter Bold ({os.path.getsize(ttf_dest)} bytes)")
        return ttf_dest
    except Exception as e:
        print(f"Inter download/convert failed ({e}), using system font fallback")
        return None

def load_font(path, size):
    if path and os.path.exists(path):
        return ImageFont.truetype(path, size)
    # Fallback to system fonts
    for fp in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()

# ── Approved brand hexagon image path ────────────────────────────────────
BRAND_MARK_PATH = (
    "/Users/ambamplify/MedContractIntel/med-contract-site/"
    "public/assets/images/brand_mark.png"
)

# ── Main ──────────────────────────────────────────────────────────────────
def make_thumbnail(out_path):
    tmp_dir = tempfile.mkdtemp()
    font_path = download_inter_bold(tmp_dir)

    img = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(img)

    # ── Bottom bar ──────────────────────────────────────────────────────
    draw.rectangle([(0, H - BAR_H), (W, H)], fill=NAVY_LIGHT)

    # ── Left-side text ──────────────────────────────────────────────────
    # "$88.96" — huge gold, ~220px
    f_big   = load_font(font_path, 220)
    f_sub   = load_font(font_path, 52)
    f_teal  = load_font(font_path, 50)
    f_bar   = load_font(font_path, 28)

    LEFT_X = 72

    # "$88.96"
    draw.text((LEFT_X, 60), "$88.96", font=f_big, fill=GOLD)

    # "Per High-Complexity Visit"
    draw.text((LEFT_X, 315), "Per High-Complexity Visit", font=f_sub, fill=WHITE)

    # "Goes to the Group. Not You."
    draw.text((LEFT_X, 390), "Goes to the Group. Not You.", font=f_teal, fill=TEAL)

    # ── Brand hexagon (right side) — use approved brand_mark.png ──────────
    brand = Image.open(BRAND_MARK_PATH).convert("RGB")
    # Resize to 400px wide, maintaining aspect ratio
    bw = 400
    bh = round(brand.height * bw / brand.width)
    brand = brand.resize((bw, bh), Image.LANCZOS)
    # Center at (1060, 310)
    bx = 1060 - bw // 2
    by = 310 - bh // 2
    img.paste(brand, (bx, by))

    # ── Bottom bar text ─────────────────────────────────────────────────
    url_text = "medcontractintel.com"
    bbox = draw.textbbox((0, 0), url_text, font=f_bar)
    tw = bbox[2] - bbox[0]
    url_x = (W - tw) // 2
    url_y = H - BAR_H + (BAR_H - (bbox[3] - bbox[1])) // 2
    draw.text((url_x, url_y), url_text, font=f_bar, fill=GOLD)

    img.save(out_path, "PNG")
    print(f"Saved thumbnail: {out_path} ({W}x{H})")

if __name__ == "__main__":
    out = "/Users/ambamplify/MedContractIntel/med-contract-site/public/images/video-1-thumbnail.png"
    make_thumbnail(out)
