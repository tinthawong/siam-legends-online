"""ตัดเสื้อจากภาพตัวละครใส่เสื้อ 5 ทิศ (พื้นเขียว เรียง south, south-east, east, north-east, north)
→ ภาพทับ 48×48 เท่าตัวละคร ทิศละไฟล์ (ระบบเสื้อแบบหลัก ดู GameScene BODY_OUTFITS)

  python tools/make_outfit.py <id>      อ่าน art/equipment/body/<id>/<id>-sheet.png

วิธี: ย่อตัวละครแต่ละทิศให้กรอบพอดีกับภาพยืน base-male ของทิศนั้น แล้วเก็บเฉพาะพิกเซลช่วงลำตัวที่สีต่างจากภาพยืน
ทิศซ้าย 3 ทิศ = ภาพฝั่งขวากลับด้าน
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET_DIRS = ["south", "south-east", "east", "north-east", "north"]
MIRROR = {"south-west": "south-east", "west": "east", "north-west": "north-east"}
ROW0, ROW1 = 15, 38   # ช่วงแถวลำตัวที่ถือว่าเป็นเสื้อได้ (ภาพ 48×48)
DIFF = 60             # สีต่างจากภาพยืนเกินนี้ = เสื้อ

oid = sys.argv[1]
src = os.path.join(ROOT, f"art/equipment/body/{oid}/{oid}-sheet.png")
im = np.asarray(Image.open(src).convert("RGB")).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
bg = ((g - np.maximum(r, b)) > 60) | (im.min(-1) > 235)
lab, _ = ndimage.label(ndimage.binary_dilation(~bg, iterations=5))
objs = sorted((s for s in ndimage.find_objects(lab)
               if (s[0].stop - s[0].start) > 200 and (s[1].stop - s[1].start) < 600), key=lambda s: s[1].start)
assert len(objs) == 5, len(objs)

out = {}
for d, sl in zip(SHEET_DIRS, objs):
    m = ~bg[sl]
    ys, xs = np.nonzero(m)
    crop = np.dstack([im[sl], m * 255]).astype(np.uint8)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    base = np.asarray(Image.open(os.path.join(ROOT, f"client/public/sprites/base-male/{d}.png")).convert("RGBA")).astype(int)
    by, bx = np.nonzero(base[..., 3] > 0)
    bw, bh = bx.max() - bx.min() + 1, by.max() - by.min() + 1
    small = np.asarray(Image.fromarray(crop).resize((bw, bh), Image.NEAREST)).astype(int)
    dressed = np.zeros((48, 48, 4), int)
    dressed[by.min():by.max() + 1, bx.min():bx.max() + 1] = small
    diff = np.abs(dressed[..., :3] - base[..., :3]).sum(-1)
    mask = (dressed[..., 3] > 128) & (base[..., 3] > 0) & (diff > DIFF)
    mask[:ROW0] = False
    mask[ROW1 + 1:] = False
    # ไม่เอาผิว (มือ/แขนที่ตำแหน่งต่างจากภาพยืน) — ผิวคือสีชมพูส้มสว่าง ทองของเสื้อ (น้ำเงินต่ำ) ไม่นับเป็นผิว
    dr, dg, db = dressed[..., 0], dressed[..., 1], dressed[..., 2]
    skin = (dr > 150) & (dg > 90) & (db > 85) & (dr - dg > 25)
    mask &= ~skin
    # ก้อนเล็กที่หลุดมา (จุดเดี่ยวจากการย่อ) ทิ้ง
    lab2, n2 = ndimage.label(mask)
    for k in range(1, n2 + 1):
        if (lab2 == k).sum() < 4:
            mask[lab2 == k] = False
    layer = np.zeros((48, 48, 4), np.uint8)
    layer[mask] = np.dstack([dressed[..., :3], np.full((48, 48), 255)])[mask]
    out[d] = Image.fromarray(layer)
for d, s in MIRROR.items():
    out[d] = out[s].transpose(Image.FLIP_LEFT_RIGHT)

game = os.path.join(ROOT, f"client/public/sprites/equipment/body/{oid}")
os.makedirs(game, exist_ok=True)
for d, img in out.items():
    img.save(os.path.join(ROOT, f"art/equipment/body/{oid}/{oid}-{d}.png"))
    img.save(os.path.join(game, f"{oid}-{d}.png"))
    print(d, int((np.asarray(img)[..., 3] > 0).sum()), "px")
