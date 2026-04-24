# This script converts nearby_logo.png to favicon.ico and icon.png for web use.
# Usage: python3 generate_favicons.py
from PIL import Image
import os

SRC = os.path.join('public', 'nearby_logo.png')
ICO = os.path.join('public', 'favicon.ico')
PNG = os.path.join('public', 'icon.png')

sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

if not os.path.exists(SRC):
    raise FileNotFoundError(f"Source logo not found: {SRC}")

img = Image.open(SRC).convert('RGBA')

# Save multi-size .ico
img.save(ICO, format='ICO', sizes=sizes)
print(f"Saved favicon.ico with sizes: {sizes}")

# Save 256x256 PNG
img_256 = img.resize((256, 256), Image.LANCZOS)
img_256.save(PNG, format='PNG')
print("Saved icon.png (256x256)")
