# This script crops the provided logo to a square, centers the content, and generates favicon.ico and icon.png.
# Place the attached image as 'public/nearby_logo_raw.png' before running.
from PIL import Image
import os

SRC = os.path.join('public', 'nearby_logo_raw.png')
CROPPED = os.path.join('public', 'nearby_logo_cropped.png')
ICO = os.path.join('public', 'favicon.ico')
PNG = os.path.join('public', 'icon.png')

sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

if not os.path.exists(SRC):
    raise FileNotFoundError(f"Source logo not found: {SRC}")

img = Image.open(SRC).convert('RGBA')

# Crop to square, center content
w, h = img.size
side = min(w, h)
left = (w - side) // 2
upper = (h - side) // 2
right = left + side
lower = upper + side
cropped = img.crop((left, upper, right, lower))
cropped.save(CROPPED)

# Save multi-size .ico
cropped.save(ICO, format='ICO', sizes=sizes)
print(f"Saved favicon.ico with sizes: {sizes}")

# Save 256x256 PNG
img_256 = cropped.resize((256, 256), Image.LANCZOS)
img_256.save(PNG, format='PNG')
print("Saved icon.png (256x256)")
