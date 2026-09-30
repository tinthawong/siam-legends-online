"""ตัดภาพเอฟเฟกต์ (เฟรมเรียงแนวนอน) เป็นเฟรมแยก + sheet.json → client/public/sprites/fx/<name>/

    python tools/slice_fx.py <ภาพ> <name> --height 40 [--frames 4]

- ภาพที่พื้นหลังเป็นลายตารางหมากรุก "วาดติดมา" (ไม่โปร่งใสจริง): ลบพิกเซลเทา/ขาวที่ต่อจากขอบภาพออก
  (สีสด เช่นแสงทอง ไม่โดนลบ ส่วนขาวที่อยู่กลางแสงไม่ต่อกับขอบจึงไม่โดนลบ)
- แยกเฟรมจากคอลัมน์ว่างระหว่างเฟรม ถ้าเฟรมเกยกันให้ใส่ --frames เพื่อแบ่งเท่า ๆ กัน
- ทุกเฟรมขนาดเท่ากัน (กว้าง/สูงสุดของทุกเฟรม) จัดชิดกลางแนวตั้งตามตำแหน่งเดิม ย่อให้สูง --height px
- ภาพหันขวา (ทิศการโจมตี = ขวา) เกมหมุนตามทิศเอง
"""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent


def remove_checker(a):
    rgb = a[..., :3].astype(int)
    sat = rgb.max(2) - rgb.min(2)
    light = rgb.min(2)
    bgish = (sat < 12) & (light > 95)   # ตารางหมากรุก: เทาไม่มีสี (ความสด ≤ 3) สว่าง 105–255
    lab, _ = ndimage.label(bgish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg = ndimage.binary_dilation(bg, iterations=1) & bgish | bg
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # ขอบนุ่ม: พิกเซลติดพื้นหลังที่ยังจางอยู่ (แสงฟุ้ง) ลดความทึบตามความสว่างเทา
    edge = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha[edge] = np.clip(sat[edge] * 10, 0, 255)
    out = a.copy()
    out[..., 3] = alpha
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("name")
    ap.add_argument("--height", type=int, default=40)
    ap.add_argument("--frames", type=int, default=0)
    ap.add_argument("--ms", type=int, default=70, help="ms ต่อเฟรม")
    A = ap.parse_args()
    im = Image.open(A.src).convert("RGBA")
    a = np.array(im)
    if a[..., 3].min() == 255:  # ไม่มีความโปร่งใส = พื้นหลังวาดติดมา
        a = remove_checker(a)
    a[a[..., 3] < 20] = 0
    solid = a[..., 3] > 40
    cols = solid.sum(0) > 2
    if A.frames:
        # เฟรมเกยกัน (แสงฟุ้งเชื่อมกัน): เริ่มจากแบ่งเท่า ๆ กัน แล้วเลื่อนจุดตัดไปคอลัมน์ที่มีภาพเข้ม ๆ น้อยที่สุดใกล้ ๆ
        xs = np.where(cols)[0]
        edges = np.linspace(xs.min(), xs.max() + 1, A.frames + 1).astype(int)
        strong = ((a[..., 3] > 200) & ((a[..., :3].max(2).astype(int) - a[..., :3].min(2)) > 60)).sum(0).astype(float)
        dens = ndimage.uniform_filter1d(strong, 9)
        win = int((edges[1] - edges[0]) * 0.3)
        for i in range(1, A.frames):
            lo, hi = edges[i] - win, edges[i] + win
            edges[i] = lo + int(np.argmin(dens[lo:hi]))
        spans = [(edges[i], edges[i + 1]) for i in range(A.frames)]
    else:
        spans, x = [], 0
        W = a.shape[1]
        while x < W:
            if cols[x]:
                s = x
                while x < W and (cols[x] or cols[x:x + 12].any()):
                    x += 1
                if x - s > 20: spans.append((s, x))
            x += 1
    rows = np.where(solid.any(1))[0]
    y0, y1 = rows.min(), rows.max() + 1
    fw = max(e - s for s, e in spans)
    out_dir = ROOT / "client/public/sprites/fx" / A.name
    out_dir.mkdir(parents=True, exist_ok=True)
    scale = A.height / (y1 - y0)
    FW, FH = max(1, round(fw * scale)), A.height
    names = []
    for i, (s, e) in enumerate(spans):
        fr = Image.new("RGBA", (fw, y1 - y0))
        piece = Image.fromarray(a[y0:y1, s:e])
        # เศษของเฟรมข้างเคียงที่ติดมาตรงขอบ: เก็บเฉพาะก้อนที่ใหญ่พอ (≥ 15% ของก้อนใหญ่สุด)
        pa = np.array(piece)
        lab, n = ndimage.label(ndimage.binary_dilation(pa[..., 3] > 30, iterations=3))
        if n > 1:
            sizes = ndimage.sum(pa[..., 3] > 30, lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.15])
            pa[~keep] = 0
            piece = Image.fromarray(pa)
        fr.alpha_composite(piece, ((fw - (e - s)) // 2, 0))
        fr = fr.resize((FW, FH), Image.LANCZOS)
        n = f"{i}.png"; fr.save(out_dir / n); names.append(n)
    meta = {"frameWidth": FW, "frameHeight": FH, "frames": names, "frameMs": A.ms}
    (out_dir / "sheet.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    src_dir = ROOT / "art/fx"; src_dir.mkdir(parents=True, exist_ok=True)
    im.save(src_dir / f"{A.name}.png")
    print(f"{A.name}: {len(names)} เฟรม {FW}×{FH}")


if __name__ == "__main__":
    main()
