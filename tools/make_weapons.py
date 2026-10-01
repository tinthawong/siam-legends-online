"""ตัดภาพอาวุธจาก art/equipment/weapons-greenscreen.png (6 ชิ้นเรียงแนวนอน พื้นเขียว)
→ art/equipment/weapons/<id>.png (ภาพเต็ม ตัดขอบโปร่งใส) + shared/data/weapons.json (gameScale, grip)
→ client/public/sprites/equipment/weapons/<id>.png (ย่อเหลือ gameScale×HD เพื่อให้ภาพในเกมคม)
ภาพอาวุธเอียง 45° ปลายชี้ขึ้นขวา grip = จุดจับ (พิกเซลของภาพเต็ม) คำนวณจากเส้นแกนด้าม→ปลาย ที่สัดส่วน t
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art/equipment/weapons-greenscreen.png")
HD = 2
# id, ชื่อ, ความยาวในเกม (พิกเซลตัวละคร 48×48 ตามแนวทแยง), จุดจับ (0 = ปลายด้าม, 1 = ปลายอาวุธ), ถือในมือได้ไหม
WEAPONS = [
    ("dab", "ดาบ", 18, 0.16, True),
    ("hand_wrap", "ผ้าพันมือ", 12, 0.5, False),  # ไอคอนอย่างเดียว ไม่วางในมือ
    ("ngao", "ง้าว", 32, 0.25, True),
    ("plong", "ไม้พลอง", 28, 0.30, True),
    ("mid_mor", "มีดหมอ", 13, 0.18, True),
    ("sam_ngam", "สามง่าม", 32, 0.22, True),
]

im = np.asarray(Image.open(SRC).convert("RGBA")).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (g - np.maximum(r, b))
alpha = np.clip(1 - (green - 40) / 80, 0, 1)  # เขียวจัด = โปร่งใส ขอบค่อย ๆ จาง
rgb = im[..., :3].copy()
spill = np.clip(g - np.maximum(r, b), 0, None)
rgb[..., 1] -= spill * (1 - alpha)  # ลบเขียวที่ติดขอบ
out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

lab, n = ndimage.label(ndimage.binary_dilation(alpha > 0.5, iterations=6))
objs = sorted((s for s in ndimage.find_objects(lab) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 4000),
              key=lambda s: s[1].start)
assert len(objs) == len(WEAPONS), len(objs)

os.makedirs(os.path.join(ROOT, "art/equipment/weapons"), exist_ok=True)
gdir = os.path.join(ROOT, "client/public/sprites/equipment/weapons")
os.makedirs(gdir, exist_ok=True)
meta = []
for (wid, name, length, t, hand), sl in zip(WEAPONS, objs):
    crop = out[sl].copy()
    a = crop[..., 3] > 128
    ys, xs = np.nonzero(a)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = crop[y0:y1, x0:x1]
    a = a[y0:y1, x0:x1]
    h, w = a.shape
    Image.fromarray(crop).save(os.path.join(ROOT, f"art/equipment/weapons/{wid}.png"))
    # แกนทแยง: ปลายด้าม = ล่างซ้ายสุด (x - y น้อยสุด), ปลายอาวุธ = บนขวาสุด
    ys, xs = np.nonzero(a)
    k = xs - ys
    p0 = np.array([xs[k.argmin()], ys[k.argmin()]], float)
    p1 = np.array([xs[k.argmax()], ys[k.argmax()]], float)
    gp = p0 + (p1 - p0) * t
    d = (xs - gp[0]) ** 2 + (ys - gp[1]) ** 2  # ชิดพิกเซลทึบที่ใกล้ที่สุด
    grip = [int(xs[d.argmin()]), int(ys[d.argmin()])]
    scale = round(length / float(np.hypot(*(p1 - p0))), 4)
    gw, gh = max(1, round(w * scale * HD)), max(1, round(h * scale * HD))
    Image.fromarray(crop).resize((gw, gh), Image.LANCZOS).save(os.path.join(gdir, f"{wid}.png"))
    meta.append({"id": wid, "name": name, "file": f"{wid}.png", "width": w, "height": h,
                 "gameScale": scale, "grip": grip, "hand": hand})
    print(wid, (w, h), "grip", grip, "scale", scale, "game", (gw, gh))

with open(os.path.join(ROOT, "shared/data/weapons.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
