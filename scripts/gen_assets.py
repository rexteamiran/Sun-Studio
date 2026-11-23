#!/usr/bin/env python3
"""Generate Sun Studio assets — strictly black & white (user directive).

app icon (.ico/.png): the B/W line logomark (horizon + rising sun + three rays,
mirrors components/Logo.tsx) as white ink on a solid black rounded tile.
NSIS installer art: monochrome gradient panels, no color.
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BUILD = os.path.join(ROOT, "build")
os.makedirs(BUILD, exist_ok=True)

INK = (255, 255, 255)
NEAR_BLACK = (13, 14, 13)   # --bg
DEEP = (22, 24, 22)         # panel depth
FAINT = (150, 155, 150)     # muted text on black

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def line(d, s, x1, y1, x2, y2, w):
    d.line([x1 * s, y1 * s, x2 * s, y2 * s], fill=INK, width=w)
    r = w / 2
    for (x, y) in ((x1, y1), (x2, y2)):
        d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=INK)


def draw_logomark(size, stroke=1.8):
    """The Logo.tsx geometry: horizon, rising sun arc, three rays — white on transparent."""
    V = 24.0
    s = size / V
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = max(2, round(stroke * s))
    line(d, s, 2.5, 17.5, 21.5, 17.5, w)
    cx, cy, r = 12 * s, 17.5 * s, 5.5 * s
    d.arc([cx - r, cy - r, cx + r, cy + r], start=180, end=360, fill=INK, width=w)
    line(d, s, 12, 2.5, 12, 5.5, w)
    line(d, s, 4.6, 6.1, 6.7, 8.2, w)
    line(d, s, 19.4, 6.1, 17.3, 8.2, w)
    return img


def make_icon():
    size = 512
    # solid black rounded tile + a faint white horizon glow, B/W only
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.rounded_rectangle([0, 0, size, size], radius=104, fill=NEAR_BLACK + (255,))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([70, 90, size - 70, size - 60], fill=(255, 255, 255, 26))
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    tile = Image.alpha_composite(tile, glow)

    mark = draw_logomark(340, stroke=1.9)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(tile)
    img.alpha_composite(mark, ((size - 340) // 2, (size - 340) // 2))

    img.save(os.path.join(BUILD, "icon.png"))
    img.resize((256, 256), Image.LANCZOS).save(
        os.path.join(BUILD, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("icon.ico / icon.png written (B/W)")


def gradient_bg(w, h, top=NEAR_BLACK, bottom=DEEP):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    steps = max(h, 2)
    for i in range(h):
        t = i / (steps - 1)
        col = tuple(int(top[c] + (bottom[c] - top[c]) * t) for c in range(3))
        d.line([(0, i), (w, i)], fill=col)
    return img


def make_sidebar():
    w, h = 164, 314
    img = gradient_bg(w, h)

    # faint white sun-glow behind the mark (monochrome)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([22, 34, 142, 154], fill=(255, 255, 255, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(22))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"), (0, 0))

    mark = draw_logomark(88, stroke=2.0)
    img.paste(mark, ((w - 88) // 2, 44), mark)

    d = ImageDraw.Draw(img)
    f_big = ImageFont.truetype(FONT_BOLD, 19)
    f_sub = ImageFont.truetype(FONT_REG, 9)
    f_ver = ImageFont.truetype(FONT_REG, 9)

    def center(text, font, y, color):
        tw = d.textlength(text, font=font)
        d.text(((w - tw) / 2, y), text, font=font, fill=color)

    center("Sun Studio", f_big, 196, (238, 240, 238))
    center("AI Image Studio", f_sub, 228, FAINT)
    d.line([(44, 258), (120, 258)], fill=(52, 56, 52))
    center("v0.0.10", f_ver, 276, FAINT)

    img.save(os.path.join(BUILD, "installerSidebar.bmp"))
    print("installerSidebar.bmp written (B/W)", img.size)


def make_header():
    w, h = 150, 57
    img = gradient_bg(w, h)
    mark = draw_logomark(34, stroke=2.0)
    img.paste(mark, (8, 12), mark)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT_BOLD, 15)
    d.text((48, 19), "Sun Studio", font=f, fill=(238, 240, 238))
    img.save(os.path.join(BUILD, "installerHeader.bmp"))
    print("installerHeader.bmp written (B/W)")


def rtf_escape(s):
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\line ")


def make_license():
    notice = """Sun Studio
Copyright (c) 2026 Rex Team

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this application except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

The full license text is included in the application folder and at
https://github.com/rexteamiran/Sun-Studio

Third-party software: this application is built with Electron
(MIT license) and uses no other bundled runtime components.

Important: this application itself contains no artificial intelligence.
It calls the OpenAI API using the API key that you provide in Settings.
Your key is stored encrypted on this device and is sent only to
api.openai.com. You are responsible for your OpenAI account, its usage
and its costs."""
    rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\fs16 " + rtf_escape(notice) + "}"
    with open(os.path.join(BUILD, "license.rtf"), "w", encoding="ascii", errors="replace") as f:
        f.write(rtf)
    print("license.rtf written")


if __name__ == "__main__":
    make_icon()
    make_sidebar()
    make_header()
    make_license()
    print("done ->", BUILD)
