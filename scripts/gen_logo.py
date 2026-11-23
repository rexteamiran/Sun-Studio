#!/usr/bin/env python3
"""Generate the Sun Studio black-and-white logomark as app/icon.png (favicon).

Geometry mirrors components/Logo.tsx: horizon line, rising sun arc, three rays —
white ink on a solid black rounded square so it stays legible at any size.
"""
from PIL import Image, ImageDraw

S = 512
V = 24.0
s = S / V

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# black rounded square
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.19), fill=(10, 10, 10, 255))

W = max(3, round(1.8 * s))  # stroke width
INK = (255, 255, 255, 255)

def line(x1, y1, x2, y2):
    d.line([x1 * s, y1 * s, x2 * s, y2 * s], fill=INK, width=W)
    for (x, y) in ((x1, y1), (x2, y2)):
        r = W / 2
        d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=INK)

# horizon (2.5,17.5) -> (21.5,17.5)
line(2.5, 17.5, 21.5, 17.5)

# rising sun: upper half circle center (12,17.5) r 5.5 (PIL: 180°..360° = top half)
cx, cy, r = 12 * s, 17.5 * s, 5.5 * s
d.arc([cx - r, cy - r, cx + r, cy + r], start=180, end=360, fill=INK, width=W)

# rays
line(12, 2.5, 12, 5.5)
line(4.6, 6.1, 6.7, 8.2)
line(19.4, 6.1, 17.3, 8.2)

img.save("app/icon.png")
print("app/icon.png written", img.size)
