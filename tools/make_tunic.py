"""เสื้อ 8 ทิศจากภาพพื้นเขียว → art/equipment/tunic-8dir.png (8 ช่อง ช่องละ 204×198 เรียง S, SE, E, NE, N, NW, W, SW)
และไฟล์เกม client/public/sprites/equipment/tunic/<ทิศ>.png (ตัดขอบโปร่งใส ย่อให้สูง 2 เท่าของความสูงบนตัวละคร)

    python tools/make_tunic.py art/equipment/tunic-greenscreen.png
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
CW, CH = 204, 198
HD = 2
# ความสูงเสื้อบนตัวละคร (ภาพ 48×48): y 18–35, ด้านหลัง (N, NE, NW) เริ่ม y 20
TOP = {d: (20 if d.startswith("north") else 18) for d in DIRS}
BOTTOM = 35

a = np.array(Image.open(sys.argv[1]).convert("RGB")).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = (g > 150) & (r < 130) & (b < 130) & (g - np.maximum(r, b) > 80)
edge = ndimage.binary_dilation(green, iterations=1) & ~green
rgb = a.copy()
rgb[..., 1] = np.where(edge | (g > np.maximum(r, b) + 30), np.minimum(g, np.maximum(r, b)), g)  # ตัดเขียวที่ล้นขอบ
alpha = np.where(green, 0, 255).astype(np.uint8)
rgba = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
W = a.shape[1]
sheet = Image.new("RGBA", (CW * 8, CH))
out = ROOT / "client/public/sprites/equipment/tunic"
out.mkdir(parents=True, exist_ok=True)
meta = {}
for i, d in enumerate(DIRS):
    x0, x1 = int(i * W / 8), int((i + 1) * W / 8)
    piece = Image.fromarray(rgba[:, x0:x1])
    bb = piece.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    piece = piece.crop(bb)
    sheet.alpha_composite(piece, (i * CW + (CW - piece.width) // 2, (CH - piece.height) // 2))
    h = (BOTTOM - TOP[d] + 1) * HD
    w = max(1, round(piece.width * h / piece.height))
    piece.resize((w, h), Image.LANCZOS).save(out / f"{d}.png")
    meta[d] = {"file": f"{d}.png", "top": TOP[d], "bottom": BOTTOM, "hd": HD}
sheet.save(ROOT / "art/equipment/tunic-8dir.png")
(out / "tunic.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
print("art/equipment/tunic-8dir.png + sprites/equipment/tunic/*.png")
