#!/usr/bin/env python3
"""Generate Claudex app icon - 1024x1024 PNG"""
from PIL import Image, ImageDraw, ImageFont
import math

SIZE = 1024
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# --- Background: rounded square with gradient feel ---
# macOS icon shape: rounded rect
radius = 220
bg_rect = [0, 0, SIZE, SIZE]

# Draw base rounded rect (dark slate gradient simulation)
# Layer 1: outer dark
draw.rounded_rectangle(bg_rect, radius=radius, fill=(15, 23, 42, 255))

# Layer 2: subtle inner glow
inner = 8
draw.rounded_rectangle(
    [inner, inner, SIZE - inner, SIZE - inner],
    radius=radius - inner,
    fill=(20, 29, 50, 255)
)

# Layer 3: top highlight gradient (simulate light from top)
for i in range(200):
    alpha = int(25 * (1 - i / 200))
    y = inner + i
    # Only draw in the upper portion
    draw.rounded_rectangle(
        [inner + 2, y, SIZE - inner - 2, y + 1],
        radius=max(radius - inner - i // 2, 10),
        fill=(99, 102, 241, alpha)
    )

# --- Terminal bracket symbol: >_ ---
cx, cy = SIZE // 2, SIZE // 2 - 30

# Draw a subtle terminal window background
term_x, term_y = 180, 200
term_w, term_h = SIZE - 360, 500
term_radius = 40

# Terminal window bg
draw.rounded_rectangle(
    [term_x, term_y, term_x + term_w, term_y + term_h],
    radius=term_radius,
    fill=(10, 15, 30, 200)
)

# Terminal window border
draw.rounded_rectangle(
    [term_x, term_y, term_x + term_w, term_y + term_h],
    radius=term_radius,
    outline=(99, 102, 241, 120),
    width=3
)

# Terminal title bar dots
dot_y = term_y + 30
dot_r = 12
for i, color in enumerate([(239, 68, 68), (234, 179, 8), (34, 197, 94)]):
    dot_x = term_x + 40 + i * 36
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=color)

# Title bar separator
draw.line([term_x + 10, term_y + 58, term_x + term_w - 10, term_y + 58], fill=(99, 102, 241, 60), width=1)

# --- Draw ">" chevron ---
chevron_x = term_x + 80
chevron_y = term_y + 120
chevron_size = 100
line_width = 28

# Indigo bright color for the chevron
chevron_color = (129, 140, 248, 255)  # indigo-400

# > shape
points_top = [(chevron_x, chevron_y), (chevron_x + chevron_size, chevron_y + chevron_size // 2)]
points_bot = [(chevron_x + chevron_size, chevron_y + chevron_size // 2), (chevron_x, chevron_y + chevron_size)]

draw.line(points_top, fill=chevron_color, width=line_width, joint='curve')
draw.line(points_bot, fill=chevron_color, width=line_width, joint='curve')

# Round the endpoints
for pt in [points_top[0], points_top[1], points_bot[1]]:
    draw.ellipse([pt[0] - line_width // 2, pt[1] - line_width // 2,
                  pt[0] + line_width // 2, pt[1] + line_width // 2], fill=chevron_color)

# --- Draw "_" cursor ---
cursor_x = chevron_x + chevron_size + 40
cursor_y = chevron_y + chevron_size - 8
cursor_w = 70
draw.rounded_rectangle(
    [cursor_x, cursor_y, cursor_x + cursor_w, cursor_y + line_width],
    radius=6,
    fill=chevron_color
)

# --- Draw "CX" text below terminal ---
# Use a large font size. Try system fonts.
font_size = 180
try:
    font = ImageFont.truetype("/System/Library/Fonts/SFCompact-Bold.otf", font_size)
except:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        font = ImageFont.load_default()

text = "CX"
# Get text bounding box
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
text_x = (SIZE - tw) // 2
text_y = term_y + term_h + 40

# Text shadow
draw.text((text_x + 3, text_y + 3), text, fill=(0, 0, 0, 150), font=font)

# Main text with indigo gradient feel
draw.text((text_x, text_y), text, fill=(165, 180, 252, 255), font=font)

# --- Subtle code lines in terminal ---
line_colors = [
    (99, 102, 241, 100),   # indigo
    (34, 197, 94, 80),     # green
    (234, 179, 8, 70),     # yellow
    (59, 130, 246, 90),    # blue
]

code_y_start = term_y + 230
for i, color in enumerate(line_colors):
    ly = code_y_start + i * 45
    lx = term_x + 80
    lw = [320, 250, 380, 200][i]
    draw.rounded_rectangle(
        [lx, ly, lx + lw, ly + 16],
        radius=4,
        fill=color
    )

# Save
img.save('/Users/rocos.rex/Rocos/internal/claudex/assets/icon.png', 'PNG')
print(f"Icon saved: {SIZE}x{SIZE}")

# Also generate .icns for macOS
# First create iconset directory
import os
import subprocess

iconset_dir = '/Users/rocos.rex/Rocos/internal/claudex/assets/icon.iconset'
os.makedirs(iconset_dir, exist_ok=True)

# Generate all required sizes
sizes = [16, 32, 64, 128, 256, 512, 1024]
for s in sizes:
    resized = img.resize((s, s), Image.LANCZOS)
    resized.save(os.path.join(iconset_dir, f'icon_{s}x{s}.png'), 'PNG')
    if s <= 512:
        resized2x = img.resize((s * 2, s * 2), Image.LANCZOS)
        resized2x.save(os.path.join(iconset_dir, f'icon_{s}x{s}@2x.png'), 'PNG')

print("Iconset created")
