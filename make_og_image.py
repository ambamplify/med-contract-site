#!/usr/bin/env python3
"""
MedContractIntel — Open Graph Image Generator
Creates a 1200×630px OG image for social sharing.
"""

import os
import tempfile
import urllib.request
from PIL import Image, ImageDraw, ImageFont

# ── Colors ───────────────────────────────────────────────────────────────
NAVY   = (15,  30,  61)   # #0f1e3d
GOLD   = (201, 168,  76)  # #c9a84c
TEAL   = (26,  144, 144)  # #1a9090
WHITE  = (255, 255, 255)

W, H = 1200, 630

# ── Font download (reuse cached if available) ────────────────────────────
FONT_CACHE = "/tmp/Inter-Bold.ttf"

def get_inter_bold():
    if os.path.exists(FONT_CACHE):
        return FONT_CACHE
    try:
        woff2_url = (
            "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Bold.woff2"
        )
        woff2_dest = "/tmp/Inter-Bold.woff2"
        urllib.request.urlretrieve(woff2_url, woff2_dest)
        from fontTools import ttLib
        tt = ttLib.TTFont(woff2_dest)
        tt.save(FONT_CACHE)
        print("Downloaded and converted Inter Bold")
        return FONT_CACHE
    except Exception as e:
        print(f"Font download failed ({e}), using system fallback")
        for fp in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                   "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"]:
            if os.path.exists(fp):
                return fp
        return None

FONT_REGULAR_CACHE = "/tmp/Inter-Regular.ttf"

def get_inter_regular():
    if os.path.exists(FONT_REGULAR_CACHE):
        return FONT_REGULAR_CACHE
    try:
        woff2_url = (
            "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.woff2"
        )
        woff2_dest = "/tmp/Inter-Regular.woff2"
        urllib.request.urlretrieve(woff2_url, woff2_dest)
        from fontTools import ttLib
        tt = ttLib.TTFont(woff2_dest)
        tt.save(FONT_REGULAR_CACHE)
        return FONT_REGULAR_CACHE
    except Exception as e:
        print(f"Regular font download failed ({e}), using bold as fallback")
        return get_inter_bold()

def load_font(path, size):
    if path and os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

# ── Draw brand hexagon ────────────────────────────────────────────────────
def draw_hexagon(draw, cx, cy, size=100):
    scale = size / 100
    vbox_pts = [(100,10),(185,55),(185,145),(100,190),(15,145),(15,55)]
    pts = [(cx + (x - 100) * scale, cy + (y - 100) * scale) for x, y in vbox_pts]
    draw.polygon(pts, fill=NAVY, outline=None)
    for i in range(len(pts)):
        p1 = pts[i]; p2 = pts[(i+1) % len(pts)]
        draw.line([p1, p2], fill=GOLD, width=max(3, int(6 * scale / 1.0)))
    # ECG (gold)
    ecg_raw = [(30,100),(48,100),(52,92),(56,112),(60,80),(64,100),(70,100),(72,104),(74,40),(76,104),(80,98)]
    ecg = [(cx + (x-100)*scale, cy + (y-100)*scale) for x,y in ecg_raw]
    draw.line(ecg, fill=GOLD, width=max(2, int(4*scale)), joint="curve")
    # ST elevation (teal)
    st_raw = [(80,98),(84,88),(88,88),(92,86),(100,86),(108,84),(116,78),(124,86),(132,98),(140,100),(160,100)]
    st = [(cx + (x-100)*scale, cy + (y-100)*scale) for x,y in st_raw]
    draw.line(st, fill=TEAL, width=max(2, int(4*scale)), joint="curve")

# ── Main ──────────────────────────────────────────────────────────────────
def make_og_image(out_path):
    bold_path    = get_inter_bold()
    regular_path = get_inter_regular()

    img  = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(img)

    # Hexagon — centered-left
    HEX_SIZE = 200
    HEX_CX   = 180
    HEX_CY   = H // 2
    draw_hexagon(draw, HEX_CX, HEX_CY, size=HEX_SIZE)

    # Right-side text stack
    TEXT_X = 360
    y = 140

    # "MedContractIntel" — gold, 800 weight, 52px
    f_title = load_font(bold_path, 52)
    draw.text((TEXT_X, y), "MedContractIntel\u2122", font=f_title, fill=GOLD)
    y += 72

    # "Data. Leverage. Fair Pay." — white, 400, 28px
    f_tagline = load_font(regular_path, 28)
    draw.text((TEXT_X, y), "Data. Leverage. Fair Pay.", font=f_tagline, fill=WHITE)
    y += 50

    # Gold horizontal rule
    draw.rectangle([(TEXT_X, y), (W - 80, y + 2)], fill=GOLD)
    y += 28

    # "Contract Intelligence for Internal Medicine & Hospitalist Physicians" — white/70%, 22px
    f_sub = load_font(regular_path, 22)
    sub_color = (255, 255, 255)  # use full white (Pillow RGB doesn't support alpha in text)
    draw.text((TEXT_X, y), "Contract Intelligence for", font=f_sub, fill=(180, 190, 210))
    y += 30
    draw.text((TEXT_X, y), "Internal Medicine & Hospitalist Physicians", font=f_sub, fill=(180, 190, 210))
    y += 50

    # "medcontractintel.com" — teal, bottom right, 20px
    f_url = load_font(bold_path, 20)
    url_text = "medcontractintel.com"
    bbox = draw.textbbox((0, 0), url_text, font=f_url)
    url_w = bbox[2] - bbox[0]
    draw.text((W - url_w - 60, H - 60), url_text, font=f_url, fill=TEAL)

    img.save(out_path, "JPEG", quality=92)
    print(f"Saved OG image: {out_path} ({W}x{H})")

if __name__ == "__main__":
    out = "/Users/ambamplify/Desktop/med-contract-site/public/images/og-image.jpg"
    make_og_image(out)
