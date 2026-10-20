#!/usr/bin/env python3
"""Generates the ClipForge icon, adaptive icon and splash image (original artwork) into ./assets."""
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 4096          # supersampled canvas, downscaled at the end
OUT = 'assets'


def gradient(size, c1, c2):
    img = Image.new('RGB', (size, size))
    px = img.load()
    # diagonal gradient, built on a small image then scaled up (fast)
    n = 256
    small = Image.new('RGB', (n, n))
    sp = small.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            sp[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return small.resize((size, size), Image.BICUBIC)


def rounded(mask, radius):
    """Rounds the corners of a binary mask by blur + threshold."""
    m = mask.filter(ImageFilter.GaussianBlur(radius))
    return m.point(lambda v: 255 if v > 128 else 0)


def symbol(scale=1.0):
    """White 'play' triangle cut in two by a diagonal slice, plus a spark. Returns an L mask."""
    cx = cy = S / 2
    k = scale

    def P(x, y):  # scale around the centre
        return (cx + (x - cx - 190) * k, cy + (y - cy) * k)  # -190: optical centring of the play triangle

    tri = Image.new('L', (S, S), 0)
    ImageDraw.Draw(tri).polygon([P(1560, 1180), P(1560, 2916), P(2980, 2048)], fill=255)
    tri = rounded(tri, 70 * k)

    ang = math.radians(-58)               # direction of the cut (up-right)
    d = (math.cos(ang), math.sin(ang))
    n = (-d[1], d[0])
    gap = 96 * k
    big = 6000

    def half(sign):
        a = (cx + n[0] * sign * gap / 2, cy + n[1] * sign * gap / 2)
        pts = [
            (a[0] - d[0] * big, a[1] - d[1] * big),
            (a[0] + d[0] * big, a[1] + d[1] * big),
            (a[0] + d[0] * big + n[0] * sign * big, a[1] + d[1] * big + n[1] * sign * big),
            (a[0] - d[0] * big + n[0] * sign * big, a[1] - d[1] * big + n[1] * sign * big),
        ]
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        return m

    shift = 80 * k
    out = Image.new('L', (S, S), 0)
    for sign, dirn in ((-1, -1), (1, 1)):
        part = ImageChops.multiply(tri, half(sign))
        part = ImageChops.offset(part, int(d[0] * shift * dirn), int(d[1] * shift * dirn))
        out = ImageChops.lighter(out, part)

    # four-point spark, top right
    sx, sy = P(3030, 1010)
    r, w = 250 * k, 58 * k
    spark = Image.new('L', (S, S), 0)
    ImageDraw.Draw(spark).polygon(
        [(sx, sy - r), (sx + w, sy - w), (sx + r, sy), (sx + w, sy + w), (sx, sy + r), (sx - w, sy + w), (sx - r, sy), (sx - w, sy - w)],
        fill=255,
    )
    return out, spark


def compose(bg, scale=1.0, transparent=False):
    body, spark = symbol(scale)
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0)) if transparent else bg.convert('RGBA')
    white = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    amber = Image.new('RGBA', (S, S), (255, 200, 87, 255))
    base.paste(white, (0, 0), body)
    base.paste(amber, (0, 0), spark)
    return base


def save(img, name, size):
    img.resize(size, Image.LANCZOS).save(f'{OUT}/{name}')


bg = gradient(S, (139, 108, 255), (59, 108, 245))
icon = compose(bg, 1.3).convert('RGB')
save(icon, 'icon.png', (1024, 1024))
save(compose(bg, 1.0, transparent=True), 'adaptive-icon.png', (1024, 1024))

# splash: dark background with the rounded icon in the middle
splash = Image.new('RGB', (1284, 2778), (11, 11, 15))
tile = icon.resize((420, 420), Image.LANCZOS)
mask = Image.new('L', (420, 420), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 419, 419], radius=96, fill=255)
splash.paste(tile, ((1284 - 420) // 2, (2778 - 420) // 2), mask)
splash.save(f'{OUT}/splash.png')
print('icons written')
