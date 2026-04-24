#!/usr/bin/env python3
"""Recolor the navy/blue interior of the approved brand mark to deep forest green.

v2 palette directive (2026-04-23): remove all blue from brand assets. Gold frame
and teal EKG trace are preserved; only dark-blue pixels in the hex interior get
remapped to #0f3d2e (deep forest green).

Run:
    python3 recolor_logo.py

Writes output next to each source file — original JPG/PNG is overwritten.
Originals are backed up alongside with a `.v1.bak` suffix on first run.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent

# Files to recolor. Each is the approved brand mark in a different size/format.
LOGO_FILES = [
    ROOT / "public" / "images" / "brand-mark-approved.jpg",
    ROOT / "public" / "images" / "brand-icon.png",
    ROOT / "public" / "assets" / "images" / "brand_mark.png",
    ROOT / "public" / "assets" / "images" / "brand_symbol.png",
]

# Target green: #0f3d2e (15, 61, 46)
TARGET_R, TARGET_G, TARGET_B = 0x0F, 0x3D, 0x2E


def is_navy_pixel(r: int, g: int, b: int) -> bool:
    """Return True if a pixel is in the navy/dark-blue range we want to remap.

    The brand mark has two navy tones (outer field ~#0a1730, inner hex ~#1a2d5a).
    Rule: blue channel is the strongest and the pixel is dark overall.
    """
    return b > r and b > g and b < 120 and r < 70 and g < 70


def recolor(src: Path) -> None:
    if not src.exists():
        print(f"[skip] {src} — not found")
        return

    backup = src.with_suffix(src.suffix + ".v1.bak")
    if not backup.exists():
        shutil.copy2(src, backup)
        print(f"[backup] {src.name} → {backup.name}")

    img = Image.open(src).convert("RGB")
    pixels = img.load()
    w, h = img.size
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            if is_navy_pixel(r, g, b):
                # Preserve relative darkness: map to a blended shade of our
                # target green based on how dark the source pixel was.
                # Darker navy → darker green; lighter navy → slightly lighter green.
                # Source navy spans roughly (10-60, 20-70, 40-115).
                # We map to a green shade that keeps the hex interior readable
                # but sits in the primary/primary-dark range.
                darkness = (r + g + b) / 3.0  # 0-255 (lower = darker)
                # Blend between primary-dark (#0a2d20) and primary (#0f3d2e)
                # Darker source → closer to #0a2d20, lighter → closer to #0f3d2e
                t = min(max((darkness - 20) / 80.0, 0.0), 1.0)
                r_out = round(0x0A + t * (TARGET_R - 0x0A))
                g_out = round(0x2D + t * (TARGET_G - 0x2D))
                b_out = round(0x20 + t * (TARGET_B - 0x20))
                pixels[x, y] = (r_out, g_out, b_out)
                changed += 1

    # Preserve format + quality
    if src.suffix.lower() in (".jpg", ".jpeg"):
        img.save(src, "JPEG", quality=95, optimize=True)
    else:
        img.save(src, "PNG", optimize=True)
    total = w * h
    pct = (changed / total * 100) if total else 0
    print(f"[recolor] {src.name} — {changed:,}/{total:,} px changed ({pct:.1f}%)")


def main() -> None:
    for f in LOGO_FILES:
        recolor(f)


if __name__ == "__main__":
    main()
