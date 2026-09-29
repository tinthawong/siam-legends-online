"""ตัด sprite sheet จาก ChatGPT (หรือโปรแกรมอื่น) เป็นเฟรม pixel art พร้อมใช้ในเกม

ตัวอย่าง:
    python tools/slice_sheet.py art/monsters/rice-crab/sheet.png art/monsters/rice-crab \\
        --cols 4 --rows 3 --names walk,attack,death --width 32

- --width   ความกว้าง (px) ของตัวมอนในเฟรมอ้างอิง หลังย่อ; ทุกเฟรมใช้สเกลเดียวกัน
- --ref     ลำดับเฟรมที่ใช้วัดขนาด (นับจาก 0 ทั้ง sheet) ควรเป็นเฟรมท่าปกติ เช่นท่า hit ที่เฟรมสุดท้ายเป็นท่าปกติ ใช้ --ref 2
- --colors  จำนวนสีสูงสุด (ชุดสีร่วมทุกเฟรม)
- --ms      มิลลิวินาทีต่อเฟรม เช่น walk=120,attack=90,death=140
ผลลัพธ์: <ชื่อท่า>_<ลำดับ>.png, preview.png และ sheet.json (ขนาดเฟรม, จุดยึด, ลำดับเฟรม)
ต้องมี Pillow:  pip install pillow
"""
import argparse, json
from pathlib import Path
from PIL import Image


def bands(values, min_len):
    out, start = [], None
    for i, v in enumerate(values + [False]):
        if v and start is None: start = i
        if not v and start is not None:
            if i - start >= min_len: out.append((start, i))
            start = None
    return out


def components(alpha, box):
    """ก้อนพิกเซลทึบทั้งหมดในกรอบ (ตรวจทีละ 2px เพื่อความเร็ว) คืน [(จำนวน, bbox)]"""
    x0, y0, x1, y1 = box
    ap = alpha.load(); seen = set(); out = []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if (x, y) in seen or ap[x, y] < 128: continue
            stack = [(x, y)]; seen.add((x, y)); n = 0; bx0 = bx1 = x; by0 = by1 = y
            while stack:
                cx, cy = stack.pop(); n += 1
                bx0, bx1, by0, by1 = min(bx0, cx), max(bx1, cx), min(by0, cy), max(by1, cy)
                for nx, ny in ((cx + 2, cy), (cx - 2, cy), (cx, cy + 2), (cx, cy - 2)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and ap[nx, ny] >= 128:
                        seen.add((nx, ny)); stack.append((nx, ny))
            out.append((n, (bx0, by0, bx1 + 2, by1 + 2)))
    return out


def largest_component(alpha, box):
    """bbox ของก้อนพิกเซลที่ใหญ่ที่สุดในกรอบ (ตัวมอน ไม่นับเส้นเอฟเฟกต์เล็ก ๆ)"""
    x0, y0, x1, y1 = box
    ap = alpha.load(); seen = set(); best = None
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if (x, y) in seen or ap[x, y] < 128: continue
            stack = [(x, y)]; seen.add((x, y)); n = 0; bx0 = bx1 = x; by0 = by1 = y
            while stack:
                cx, cy = stack.pop(); n += 1
                bx0, bx1, by0, by1 = min(bx0, cx), max(bx1, cx), min(by0, cy), max(by1, cy)
                for nx, ny in ((cx + 2, cy), (cx - 2, cy), (cx, cy + 2), (cx, cy - 2)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and ap[nx, ny] >= 128:
                        seen.add((nx, ny)); stack.append((nx, ny))
            if best is None or n > best[0]: best = (n, (bx0, by0, bx1 + 1, by1 + 1))
    return best[1]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet"); p.add_argument("out")
    p.add_argument("--cols", type=int, required=True); p.add_argument("--rows", type=int, required=True)
    p.add_argument("--names", required=True, help="ชื่อท่าแต่ละแถว คั่นด้วย , เช่น walk,attack,death")
    p.add_argument("--width", type=int, default=32)
    p.add_argument("--ref", type=int, default=0, help="เฟรมที่ใช้วัดขนาด (ท่าปกติ)")
    p.add_argument("--colors", type=int, default=32)
    p.add_argument("--ms", default="walk=120,attack=90,death=140,idle=200")
    a = p.parse_args()
    names = a.names.split(","); assert len(names) == a.rows, "จำนวนชื่อท่าต้องเท่ากับจำนวนแถว"
    ms = dict(kv.split("=") for kv in a.ms.split(","))

    img = Image.open(a.sheet).convert("RGBA"); W, H = img.size
    alpha = img.getchannel("A"); ap = alpha.load()
    row_occ = [any(ap[x, y] > 40 for x in range(0, W, 2)) for y in range(H)]
    rows = sorted(bands(row_occ, 20), key=lambda b: b[1] - b[0], reverse=True)[: a.rows]
    rows.sort()
    if len(rows) != a.rows: raise SystemExit(f"เจอ {len(rows)} แถว แต่ระบุ --rows {a.rows}")
    cells = []        # (ท่า, ลำดับ, กรอบทั้งเฟรม, กรอบตัวมอน, จุดกึ่งกลางช่อง)
    cells_alpha = []  # alpha ของเฟรมนั้นเท่านั้น (ไม่ติดชิ้นส่วนของเฟรมข้าง ๆ)
    for r, (y0, y1) in enumerate(rows):
        # แบ่งช่องตามช่องว่างจริงระหว่างตัวมอน (ภาพจาก AI มักไม่ตรงตารางเท่ากันเป๊ะ)
        occ = [any(ap[x, y] > 40 for y in range(y0, y1, 2)) for x in range(W)]
        xb = bands(occ, 1)
        big = sorted(sorted(xb, key=lambda t: t[1] - t[0], reverse=True)[: a.cols])
        if len(big) != a.cols: raise SystemExit(f"แถว {r+1}: เจอ {len(big)} ตัว แต่ระบุ --cols {a.cols}")
        groups = [[g] for g in big]
        for band in xb:
            if band in big: continue
            mid = (band[0] + band[1]) / 2   # เส้นเอฟเฟกต์เล็ก ๆ → ติดไปกับตัวที่ใกล้ที่สุด
            k = min(range(a.cols), key=lambda j: min(abs(mid - big[j][0]), abs(mid - big[j][1])))
            groups[k].append(band)
        for c, g in enumerate(groups):
            gx0, gx1 = min(t[0] for t in g), max(t[1] for t in g)
            region = alpha.crop((gx0, y0, gx1, y1))
            m = Image.new("L", region.size, 0)
            for t in g: m.paste(region.crop((t[0] - gx0, 0, t[1] - gx0, y1 - y0)), (t[0] - gx0, 0))
            box = m.point(lambda v: 255 if v > 40 else 0).getbbox()
            full = (gx0 + box[0], y0 + box[1], gx0 + box[2], y0 + box[3])
            keep = Image.new("L", img.size, 0); keep.paste(m, (gx0, y0)); cells_alpha.append(keep)
            body = largest_component(alpha, (big[c][0], y0, big[c][1], y1))
            cells.append((names[r], c, full, body, (body[0] + body[2]) / 2))

    ref = cells[a.ref][3]
    scale = a.width / (ref[2] - ref[0])
    small = []
    for k, (name, i, full, body, cx) in enumerate(cells):
        crop = img.crop(full); crop.putalpha(cells_alpha[k].crop(full))
        w = max(1, round(crop.width * scale)); h = max(1, round(crop.height * scale))
        s = crop.resize((w, h), Image.BOX)
        ax = (cx - full[0]) * scale           # จุดกึ่งกลางช่อง (แนวนอน)
        ay = (body[3] - full[1]) * scale      # เส้นพื้น = ขอบล่างของตัวมอน
        small.append((name, i, s, ax, ay))

    # ชุดสีร่วมทุกเฟรม
    strip = Image.new("RGB", (sum(s.width for *_, s, _, _ in [(n, i, s, 0, 0) for n, i, s, _, _ in small]), max(s.height for _, _, s, _, _ in small)))
    x = 0
    for _, _, s, _, _ in small:
        strip.paste(s.convert("RGB"), (x, 0), s.getchannel("A").point(lambda v: 255 if v > 110 else 0)); x += s.width
    pal = strip.quantize(colors=a.colors, method=Image.MAXCOVERAGE)

    left = max(ax for *_, ax, _ in small); right = max(s.width - ax for _, _, s, ax, _ in small)
    up = max(ay for *_, ay in small); down = max(s.height - ay for _, _, s, _, ay in small)
    fw = int(round(left + right)) + 2; fh = int(round(up + down)) + 2
    anchor_x, base_y = round(left) + 1, round(up) + 1

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    anims = {}
    frames_img = []
    for name, i, s, ax, ay in small:
        m = s.getchannel("A").point(lambda v: 255 if v > 110 else 0)
        rgb = Image.new("RGB", s.size); rgb.paste(s.convert("RGB"), mask=m)
        q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA"); q.putalpha(m)
        f = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        f.paste(q, (anchor_x - round(ax), base_y - round(ay)), q)
        fn = f"{name}_{i}.png"; f.save(out / fn); frames_img.append(f)
        anims.setdefault(name, {"frames": [], "frameMs": int(ms.get(name, 120)), "loop": name in ("walk", "idle")})
        anims[name]["frames"].append(fn)

    (out / "sheet.json").write_text(json.dumps({
        "frameWidth": fw, "frameHeight": fh,
        "anchor": {"x": anchor_x, "y": base_y, "note": "จุดกึ่งกลางเท้า วางตรงตำแหน่งมอนในเกม"},
        "animations": anims,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    S = 6
    prev = Image.new("RGBA", (a.cols * (fw * S + 8), a.rows * (fh * S + 8)), (85, 146, 74, 255))
    for k, f in enumerate(frames_img):
        r, c = divmod(k, a.cols)
        prev.alpha_composite(f.resize((fw * S, fh * S), Image.NEAREST), (c * (fw * S + 8), r * (fh * S + 8)))
    prev.save(out / "preview.png")
    print(f"ตัดแล้ว {len(frames_img)} เฟรม ขนาดเฟรม {fw}x{fh} จุดยึด ({anchor_x},{base_y}) -> {out}")


if __name__ == "__main__":
    main()
