"""จัดเรียงเฟรมจาก sheet ของ ChatGPT ที่ผิดสูตร ให้เป็นตารางใหม่ที่ slice_sheet.py ตัดได้

ChatGPT มักส่ง sheet ที่จำนวนแถว/คอลัมน์ไม่ตรงที่สั่ง หรือเอาสองท่ามาไว้แถวเดียวกัน
สคริปต์นี้หาตัวมอนแต่ละตัวในแต่ละแถว แล้วหยิบมาเรียงใหม่ตามที่กำหนด

ตัวอย่าง:
    # ดูก่อนว่าแต่ละแถวเจอกี่ตัว
    python tools/regrid_sheet.py raw.png --rows 5 --list
    # หยิบแถว 2-5 (แถวละ 4 ตัวแรก) มาทำ sheet 4x4
    python tools/regrid_sheet.py raw.png sheet.png --rows 5 --layout "2.1-4/3.1-4/4.1-4/5.1-4"
    # หยิบแถวแรกมาทำ idle-sheet แถวเดียว
    python tools/regrid_sheet.py raw.png idle-sheet.png --rows 5 --layout "1.1-4"

--layout: แถวผลลัพธ์คั่นด้วย /  แต่ละแถวคือ รายการ "แถว.ตัวที่" คั่นด้วย ,  (ใช้ช่วง 1-4 ได้)
ขีดเอฟเฟกต์เล็ก ๆ (ดาว, เส้นฟัน) จะติดไปกับตัวที่ใกล้ที่สุดในแถวเดียวกัน
ต้องมี Pillow, numpy, scipy:  pip install pillow numpy scipy\nภาพต้นฉบับต้องมีพื้นหลังโปร่งใส (ถ้าเป็นลายตารางปลอม ใช้ tools/fix_checker.py ก่อน)
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage


def bands(values, min_len=1):
    out, start = [], None
    for i, v in enumerate(values + [False]):
        if v and start is None: start = i
        if not v and start is not None:
            if i - start >= min_len: out.append((start, i))
            start = None
    return out


def find_items(img, nrows):
    """หาตัวมอนทุกตัว: แยกก้อนพิกเซล → ก้อนใหญ่คือตัวหลัก → ก้อนเล็ก (เอฟเฟกต์, อาวุธที่หลุด) ติดกับตัวหลักที่ใกล้สุด
    แล้วแบ่งแถวตามความสูงของกึ่งกลางตัว (แถวที่ตัวสูงจนแตะกันก็แยกได้)"""
    A = np.array(img.getchannel("A")) > 40
    lab, n = ndimage.label(A, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    areas = ndimage.sum(A, lab, range(1, n + 1))
    comps = [(k + 1, objs[k], areas[k]) for k in range(n) if areas[k] >= 30]
    top = max(c[2] for c in comps)
    mains = [c for c in comps if c[2] >= top * 0.25]
    # ก้อนใหญ่ที่กว้างหรือสูงผิดปกติ = หลายตัวชนกัน → ผ่าตรงช่วงที่พิกเซลบางที่สุด
    mw = np.median([m[1][1].stop - m[1][1].start for m in mains])
    mh = np.median([m[1][0].stop - m[1][0].start for m in mains])
    nxt = lab.max() + 1; split = []
    for m in mains:
        sl = m[1]; w = sl[1].stop - sl[1].start; h = sl[0].stop - sl[0].start
        for axis, size, med in ((1, w, mw), (0, h, mh)):
            k = int(round(size / med))
            if size > med * 1.6 and k >= 2:
                sub = lab[sl] == m[0]
                prof = sub.sum(axis=1 - axis)
                cuts = []
                for i in range(1, k):
                    c = int(size * i / k); r = int(size / k * 0.3)
                    cuts.append(c - r + int(np.argmin(prof[c - r:c + r])))
                edges = [0] + cuts + [size]
                for a0, a1 in zip(edges, edges[1:]):
                    part = np.zeros_like(sub)
                    if axis == 1: part[:, a0:a1] = sub[:, a0:a1]
                    else: part[a0:a1, :] = sub[a0:a1, :]
                    view = lab[sl]; view[part] = nxt
                    obj = ndimage.find_objects((lab == nxt).astype(int))[0]
                    split.append((nxt, obj, part.sum())); nxt += 1
                print(f"  แยกก้อนที่ติดกันเป็น {k} ตัว")
                break
        else:
            split.append(m)
    mains = split
    ids_main = {m[0] for m in mains}
    others = [c for c in comps if c[2] < top * 0.25 and c[0] not in ids_main]
    ctr = lambda sl: ((sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2)
    def gap(a, b):  # ระยะห่างระหว่างกรอบสองกรอบ (0 ถ้าซ้อนกัน)
        dx = max(a[1].start - b[1].stop, b[1].start - a[1].stop, 0)
        dy = max(a[0].start - b[0].stop, b[0].start - a[0].stop, 0)
        return (dx * dx + dy * dy) ** 0.5
    members = {m[0]: [m] for m in mains}
    dropped = 0
    for o in others:
        best = min(mains, key=lambda m: gap(o[1], m[1]))
        if gap(o[1], best[1]) > mw * 0.2: dropped += 1; continue   # ไกลจากทุกตัว = ของแถม ไม่ใช้
        members[best[0]].append(o)
    if dropped: print(f"  ข้ามชิ้นเล็กที่ไม่ติดกับตัวไหน {dropped} ชิ้น")
    # แบ่งแถว: เรียงกึ่งกลางแนวตั้ง แล้วตัดตรงช่องห่างที่กว้างที่สุด nrows-1 จุด
    ms = sorted(mains, key=lambda m: ctr(m[1])[1])
    ys = [ctr(m[1])[1] for m in ms]
    cuts = sorted(sorted(range(1, len(ys)), key=lambda i: ys[i] - ys[i - 1], reverse=True)[: nrows - 1])
    rows, prev = [], 0
    for c in cuts + [len(ms)]:
        rows.append(sorted(ms[prev:c], key=lambda m: ctr(m[1])[0])); prev = c
    result = []
    arr = np.array(img)
    for row in rows:
        items = []
        for m in row:
            ids = [c[0] for c in members[m[0]]]
            mask = np.isin(lab, ids)
            ys_, xs_ = np.where(mask)
            y0, y1, x0, x1 = ys_.min(), ys_.max() + 1, xs_.min(), xs_.max() + 1
            piece = arr[y0:y1, x0:x1].copy()
            piece[..., 3] = np.where(mask[y0:y1, x0:x1], piece[..., 3], 0)
            items.append(Image.fromarray(piece, "RGBA"))
        result.append(items)
    return result


def parse(layout):
    out = []
    for row in layout.split("/"):
        picks = []
        for part in row.split(","):
            r, i = part.strip().split(".")
            if "-" in i:
                s, e = map(int, i.split("-")); picks += [(int(r), k) for k in range(s, e + 1)]
            else: picks.append((int(r), int(i)))
        out.append(picks)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet"); p.add_argument("out", nargs="?")
    p.add_argument("--rows", type=int, required=True, help="จำนวนแถวในภาพต้นฉบับ")
    p.add_argument("--layout"); p.add_argument("--list", action="store_true")
    a = p.parse_args()
    img = Image.open(a.sheet).convert("RGBA")
    items = find_items(img, a.rows)
    if a.list or not a.layout:
        for r, it in enumerate(items, 1):
            print(f"แถว {r}: {len(it)} ตัว  ขนาด " + " ".join(f"{i.width}x{i.height}" for i in it))
        return
    lay = parse(a.layout)
    chosen = [[items[r - 1][i - 1] for r, i in row] for row in lay]
    cw = max(i.width for row in chosen for i in row) + 40
    ch = max(i.height for row in chosen for i in row) + 40
    cols = max(len(r) for r in chosen)
    out = Image.new("RGBA", (cols * cw, len(chosen) * ch), (0, 0, 0, 0))
    for r, row in enumerate(chosen):
        for c, it in enumerate(row):   # ยืนบนขอบล่างของช่อง กึ่งกลางแนวนอน
            out.alpha_composite(it, (c * cw + (cw - it.width) // 2, r * ch + ch - 20 - it.height))
    out.save(a.out)
    print(f"สร้าง {a.out}: {len(chosen)} แถว x {cols} คอลัมน์")


if __name__ == "__main__":
    main()
