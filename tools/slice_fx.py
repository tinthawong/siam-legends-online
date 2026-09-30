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
    """ลบพื้นตารางหมากรุกที่วาดติดมา:
    1) พิกเซลเทาไม่มีสีที่ต่อจากขอบภาพ = พื้นหลัง (โปร่งใส)
    2) แสงโปร่งที่ผสมพื้นเทาไปแล้ว (สีจืด และไม่สว่างเกินพื้นตาราง) → ความทึบตามความสดของสี
       แล้วถอดสีเทาออก (ประมาณพื้นเป็นเทากลาง 165) เหลือแต่สีแสงจริง ไม่มีคราบเทา
    แกนกลาง (หมัด/เท้า/แสงขาวตรงกลาง) คงเดิม"""
    rgb = a[..., :3].astype(float)
    sat = rgb.max(2) - rgb.min(2)
    light = rgb.min(2)
    bgish = (sat < 12) & (light > 95)   # ตารางหมากรุก: เทาไม่มีสี (ความสด ≤ 3) สว่าง 105–255
    lab, _ = ndimage.label(bgish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # ทุกพิกเซลที่ไม่ใช่พื้นหลัง: ทึบเมื่อสีสด (≥ 80) / สว่างกว่าพื้นตาราง (min > 215 เช่นแกนแสงขาว) / เส้นขอบดำ
    # นอกนั้น = แสงโปร่งที่ผสมพื้นตารางเทาไปแล้ว → ความทึบตามความสด แล้วถอดสีเทาออก (ไม่เหลือลายตาราง)
    solid = (sat >= 80) | (light > 215) | (rgb.max(2) < 90)
    band = ~bg & ~solid
    alpha = np.full(sat.shape, 255.0)
    alpha[bg] = 0
    fa = np.clip((sat - 15) / 65, 0, 1)
    alpha[band] = fa[band] * 255
    g = 165.0
    k = np.maximum(fa, 0.05)[..., None]
    un = np.clip((rgb - g * (1 - k)) / k, 0, 255)
    m = band[..., None]
    out = a.copy()
    out[..., :3] = np.where(m, un, rgb).astype(np.uint8)
    out[..., 3] = alpha.astype(np.uint8)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("name")
    ap.add_argument("--height", type=int, default=40)
    ap.add_argument("--frames", type=int, default=0)
    ap.add_argument("--ms", type=int, default=70, help="ms ต่อเฟรม")
    ap.add_argument("--hd", type=int, default=2, help="เก็บภาพกี่เท่าของขนาดในเกม")
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
    scale = A.height * A.hd / (y1 - y0)
    FW, FH = max(1, round(fw * scale)), A.height * A.hd
    names = []
    for i, (s, e) in enumerate(spans):
        fr = Image.new("RGBA", (fw, y1 - y0))
        piece = Image.fromarray(a[y0:y1, s:e])
        # เศษของเฟรมข้างเคียงที่ติดมาตรงขอบ: เก็บเฉพาะก้อนที่ใหญ่พอ (≥ 15% ของก้อนใหญ่สุด)
        pa = np.array(piece)
        lab, n = ndimage.label(ndimage.binary_dilation(pa[..., 3] > 30, iterations=3))
        if n > 1:
            sizes = ndimage.sum(pa[..., 3] > 30, lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.35])
            pa[~keep] = 0
        # เศษเส้นตั้งของเฟรมถัดไปที่ติดขอบขวา/ซ้าย: ตัดคอลัมน์ที่อยู่ห่างก้อนหลักด้วยช่องว่าง ≥ 3 px
        colsum = (pa[..., 3] > 30).sum(0)
        main = int(np.argmax(ndimage.uniform_filter1d(colsum.astype(float), 15)))
        gap = colsum <= 2  # เศษแสงประปรายไม่นับ
        l = main
        while l > 0 and not gap[max(0, l - 3):l].all(): l -= 1
        r = main
        while r < len(colsum) - 1 and not gap[r:r + 3].all(): r += 1
        pa[:, :l] = 0; pa[:, r + 1:] = 0
        piece = Image.fromarray(pa)
        fr.alpha_composite(piece, ((fw - (e - s)) // 2, 0))
        fr = fr.resize((FW, FH), Image.LANCZOS)
        n = f"{i}.png"; fr.save(out_dir / n); names.append(n)
    # เก็บที่ 2 เท่าของขนาดในเกม (--height) แล้วแสดงที่ครึ่งหนึ่ง: บนจอ (ซูม 2×) คมกว่าย่อเล็กแล้วขยาย
    meta = {"frameWidth": FW, "frameHeight": FH, "frames": names, "frameMs": A.ms, "scale": 1 / A.hd}
    (out_dir / "sheet.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    src_dir = ROOT / "art/fx"; src_dir.mkdir(parents=True, exist_ok=True)
    im.save(src_dir / f"{A.name}.png")
    print(f"{A.name}: {len(names)} เฟรม {FW}×{FH}")


if __name__ == "__main__":
    main()
