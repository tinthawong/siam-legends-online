"""สร้าง art/fx/punch-sheet.png จากภาพพื้นเขียว 6 เฟรมเรียงแนวนอน (ช่องเท่ากัน)

    python tools/make_punch_sheet.py <ภาพพื้นเขียว.png>

ผลลัพธ์: 6 เฟรม ช่องละ 587×210 จุดยึด (404,104) = จุดที่หมัดโดน (ขอบหน้าหมัดตอนชน เฟรม 4)
ทุกเฟรมตัดด้วยตำแหน่งเดียวกันเทียบกับช่องของตัวเอง หมัดจึงพุ่งเข้าหาจุดยึดแล้วถอยกลับตามภาพต้นฉบับ
แล้วทำไฟล์เกม client/public/sprites/fx/punch-sheet/ (ย่อ 48% = 2 เท่าของขนาดในเกม 24%)
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
N, CW, CH, AX, AY = 6, 587, 210, 404, 104
MS = [50, 50, 50, 110, 70, 70]
GAME_SCALE, HD = 0.24, 2

src = np.array(Image.open(sys.argv[1]).convert("RGB")).astype(int)
H, W = src.shape[:2]
r, g, b = src[..., 0], src[..., 1], src[..., 2]
green = (g > 150) & (r < 130) & (b < 130) & (g - np.maximum(r, b) > 80)
# ขอบ: เขียวอมอยู่ (despill) และความทึบนุ่ม
alpha = np.where(green, 0, 255).astype(np.uint8)
edge = ndimage.binary_dilation(green, iterations=1) & ~green
rgb = src.copy()
rgb[..., 1] = np.where(edge | (g > np.maximum(r, b)), np.minimum(g, np.maximum(r, b)), g)  # ตัดสีเขียวที่ล้นขอบ
alpha[edge] = 160
rgba = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)

cell = W / N
# จุดโดน: ขอบหน้าหมัด (ผิว) ในเฟรม 4 + เส้นขอบ, ความสูง = กลางหมัด
skin = (r > 170) & (g > 100) & (g < 200) & (b > 60) & (b < 170) & (r - b > 40)
def fist_front(i):
    x0, x1 = int(i * cell), int((i + 1) * cell)
    sk = skin[:, x0:x1]
    lab, n = ndimage.label(ndimage.binary_dilation(sk, iterations=5))  # เส้นขอบดำแบ่งผิวหมัดเป็นหลายก้อน: รวมก่อน
    big = np.argmax(ndimage.sum(sk, lab, range(1, n + 1))) + 1
    ys, xs = np.where((lab == big) & sk)
    return xs.max() + 6, int((ys.min() + ys.max()) / 2)  # +6 = เส้นขอบดำหน้าหมัด
hx, hy = fist_front(3)
sheet = Image.new("RGBA", (CW * N, CH))
for i in range(N):
    x0 = int(i * cell)
    piece = np.zeros_like(rgba)
    piece[:, x0:int((i + 1) * cell)] = rgba[:, x0:int((i + 1) * cell)]   # เฉพาะของเฟรมนี้
    ox, oy = x0 + hx - AX, hy - AY
    crop = Image.fromarray(piece).crop((ox, oy, ox + CW, oy + CH))
    sheet.alpha_composite(crop, (i * CW, 0))
out = ROOT / "art/fx/punch-sheet.png"
sheet.save(out)
print(f"{out.relative_to(ROOT)}: {N} เฟรม {CW}×{CH} จุดยึด ({AX},{AY}) จุดโดนในภาพต้นฉบับ ({hx},{hy}) ของช่อง")

gd = ROOT / "client/public/sprites/fx/punch-sheet"
gd.mkdir(parents=True, exist_ok=True)
k = GAME_SCALE * HD
fw, fh = round(CW * k), round(CH * k)
names = []
for i in range(N):
    fr = sheet.crop((i * CW, 0, (i + 1) * CW, CH)).resize((fw, fh), Image.LANCZOS)
    fr.save(gd / f"{i}.png"); names.append(f"{i}.png")
(gd / "sheet.json").write_text(json.dumps({
    "frameWidth": fw, "frameHeight": fh, "frames": names, "frameMs": MS[0], "durations": MS,
    "anchor": {"x": AX / CW, "y": AY / CH}, "scale": 1 / HD, "hitFrame": 3,
}, indent=1), encoding="utf-8")
print(f"เกม: {fw}×{fh} (แสดง {1/HD:g} เท่า = {CW*GAME_SCALE:.0f}×{CH*GAME_SCALE:.0f} px)")
