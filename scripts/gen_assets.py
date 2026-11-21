#!/usr/bin/env python3
"""Generate Sun Studio assets: app icon (.ico/.png) and NSIS installer art (BMPs) + license RTF."""
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BUILD = os.path.join(ROOT, "build")
os.makedirs(BUILD, exist_ok=True)

DARK = (13, 10, 6)
DARK2 = (34, 25, 13)
CREAM = (255, 233, 176)
GOLD = (255, 182, 72)
ORANGE = (255, 125, 31)
MUTED = (157, 140, 111)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def draw_sun(size):
    """Draw the sun (rays + gradient core) on a transparent image, supersampled x4."""
    s = 4
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = W // 2

    # rays
    for i in range(8):
        ang = math.radians(i * 45)
        x1 = cx + math.cos(ang) * W * 0.40
        y1 = cy + math.sin(ang) * W * 0.40
        x2 = cx + math.cos(ang) * W * 0.475
        y2 = cy + math.sin(ang) * W * 0.475
        d.line([(x1, y1), (x2, y2)], fill=GOLD + (255,), width=int(W * 0.058))

    # gradient core
    R = W * 0.30
    steps = 72
    for r_i in range(steps, 0, -1):
        t = r_i / steps
        col = lerp(CREAM, ORANGE, t)
        d.ellipse([cx - R * t, cy - R * t, cx + R * t, cy + R * t], fill=col + (255,))

    return img.resize((size, size), Image.LANCZOS)


def make_icon():
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # rounded dark tile with subtle radial glow
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.rounded_rectangle([0, 0, size, size], radius=104, fill=(22, 17, 10, 255))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([96, 76, size - 96, size - 156], fill=(255, 140, 26, 70))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(60))
    tile = Image.alpha_composite(tile, glow)

    img = Image.alpha_composite(img, tile)
    sun = draw_sun(330)
    img.alpha_composite(sun, ((size - 330) // 2, (size - 330) // 2 - 6))

    img.save(os.path.join(BUILD, "icon.png"))
    img.resize((256, 256), Image.LANCZOS).save(
        os.path.join(BUILD, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("icon.ico / icon.png written")


def gradient_bg(w, h, top=DARK, bottom=DARK2):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / max(1, h - 1)))
    return img


def make_sidebar():
    w, h = 164, 314
    img = gradient_bg(w, h)

    # sun disc art with soft glow
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([12, 26, 152, 166], fill=(255, 140, 26, 60))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(18))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"), (0, 0))

    sun = draw_sun(96)
    img.paste(sun, ((w - 96) // 2, 34), sun)

    d = ImageDraw.Draw(img)
    f_big = ImageFont.truetype(FONT_BOLD, 19)
    f_sub = ImageFont.truetype(FONT_REG, 9)
    f_ver = ImageFont.truetype(FONT_REG, 9)

    def center(text, font, y, color):
        tw = d.textlength(text, font=font)
        d.text(((w - tw) / 2, y), text, font=font, fill=color)

    center("Sun Studio", f_big, 196, (242, 234, 217))
    center("AI Image Studio", f_sub, 228, MUTED)

    # thin divider
    d.line([(44, 258), (120, 258)], fill=(60, 46, 26))

    center("v0.0.2", f_ver, 276, MUTED)

    img.save(os.path.join(BUILD, "installerSidebar.bmp"))
    print("installerSidebar.bmp written", img.size)


def make_header():
    w, h = 150, 57
    img = gradient_bg(w, h)
    sun = draw_sun(34)
    img.paste(sun, (8, 12), sun)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT_BOLD, 15)
    d.text((48, 19), "Sun Studio", font=f, fill=(242, 234, 217))
    img.save(os.path.join(BUILD, "installerHeader.bmp"))
    print("installerHeader.bmp written", img.size)


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
