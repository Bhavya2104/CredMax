"""Draws the CardMax app icons (two stacked cards) as PNGs with no dependencies.

Usage: python3 tools/make_icons.py   (writes into icons/)
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def rounded_rect_sd(px, py, cx, cy, hw, hh, r, angle):
    """Signed distance from a point to a rotated rounded rectangle."""
    c, s = math.cos(-angle), math.sin(-angle)
    dx, dy = px - cx, py - cy
    x, y = dx * c - dy * s, dx * s + dy * c
    qx, qy = abs(x) - hw + r, abs(y) - hh + r
    outside = math.hypot(max(qx, 0), max(qy, 0))
    return outside + min(max(qx, qy), 0) - r, x, y


def render(size, scale=1.0):
    bg_top, bg_bot = hex_rgb('#1b2140'), hex_rgb('#0b0d18')
    red_a, red_b = hex_rgb('#ef4b52'), hex_rgb('#a3141c')
    blue_a, blue_b = hex_rgb('#4a95ec'), hex_rgb('#163f78')
    gold = hex_rgb('#f3c969')
    white = (1.0, 1.0, 1.0)

    # Layout in unit coordinates (0..1), scaled around the centre.
    def u(v):
        return 0.5 + (v - 0.5) * scale

    hw, hh, rad = 0.30 * scale, 0.19 * scale, 0.045 * scale
    back = (u(0.56), u(0.40), math.radians(-14))
    front = (u(0.46), u(0.58), math.radians(6))
    rows = bytearray()
    for j in range(size):
        rows.append(0)
        py = (j + 0.5) / size
        for i in range(size):
            px = (i + 0.5) / size
            col = mix(bg_top, bg_bot, py)
            px_w = 1 / size

            # back card (BOB blue)
            sd, x, y = rounded_rect_sd(px, py, back[0], back[1], hw, hh, rad, back[2])
            a = min(1, max(0, 0.5 - sd / px_w))
            if a:
                col = mix(col, mix(blue_a, blue_b, (x / hw + 1) / 2 * 0.7 + (y / hh + 1) / 2 * 0.3), a)

            # soft shadow of the front card
            sd, _, _ = rounded_rect_sd(px, py - 0.018 * scale, front[0], front[1], hw, hh, rad, front[2])
            sh = 0.45 * (1 - min(1, max(0, (sd + 0.01) / (0.05 * scale))))
            if sh > 0:
                col = mix(col, (0, 0, 0), sh)

            # front card (HSBC red) with chip and number lines
            sd, x, y = rounded_rect_sd(px, py, front[0], front[1], hw, hh, rad, front[2])
            a = min(1, max(0, 0.5 - sd / px_w))
            if a:
                face = mix(red_a, red_b, (x / hw + 1) / 2 * 0.6 + (y / hh + 1) / 2 * 0.4)
                csd = math.hypot(max(abs(x + 0.17 * scale) - 0.045 * scale, 0), max(abs(y + 0.04 * scale) - 0.034 * scale, 0)) - 0.012 * scale
                ca = min(1, max(0, 0.5 - csd / px_w))
                face = mix(face, gold, ca)
                for lx, lw in ((-0.12, 0.09), (0.01, 0.09), (0.14, 0.05)):
                    lsd = math.hypot(max(abs(x - (lx + lw / 2) * scale) - lw / 2 * scale, 0), max(abs(y - 0.085 * scale) - 0.004 * scale, 0)) - 0.006 * scale
                    face = mix(face, white, 0.85 * min(1, max(0, 0.5 - lsd / px_w)))
                col = mix(col, face, a)

            rows.extend(int(max(0, min(1, c)) * 255 + 0.5) for c in col)
    return bytes(rows)


def write_png(path, size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, size, scale in (
        ('apple-touch-icon.png', 180, 1.0),
        ('icon-192.png', 192, 1.0),
        ('icon-512.png', 512, 1.0),
        ('icon-maskable-512.png', 512, 0.78),
    ):
        write_png(os.path.join(OUT, name), size, render(size, scale))
        print('wrote', name)
