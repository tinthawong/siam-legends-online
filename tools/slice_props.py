"""ตัด sheet ของประดับ/วัตถุในแมพ (แต่ละช่อง 1 ชิ้น) เป็นไฟล์แยก ย่อแต่ละชิ้นตามความกว้างที่กำหนด

ตัวอย่าง:
    python tools/slice_props.py sheet.png art/props --cols 4 --rows 4 \\
        --names flowers-yellow,flowers-pink,... --widths 14,14,...

- ChatGPT มักวาดทุกชิ้นเต็มช่องเท่ากัน จึงต้องกำหนดความกว้างในเกมเองทีละชิ้น (ตัวละครกว้างราว 22px สูง 44px)
- ใช้ชุดสีร่วมกันทั้ง sheet และวางจุดยึดที่กึ่งกลางฐานของแต่ละชิ้น
ผลลัพธ์: <ชื่อ>.png ต่อชิ้น, props.json (ขนาด + จุดยึด) และ preview.png
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet"); p.add_argument("out")
    p.add_argument("--cols", type=int, required=True); p.add_argument("--rows", type=int, required=True)
    p.add_argument("--names", required=True); p.add_argument("--widths", required=True)
    p.add_argument("--colors", type=int, default=48)
    a = p.parse_args()
    names = a.names.split(","); widths = [int(w) for w in a.widths.split(",")]
    n = a.cols * a.rows
    if len(names) != n or len(widths) != n: raise SystemExit(f"ต้องมีชื่อและความกว้างครบ {n} ชิ้น")

    img = Image.open(a.sheet).convert("RGBA"); W, H = img.size
    alpha = img.getchannel("A")

    # แยกตามก้อนภาพ (ทนต่อกรณีวัตถุในแถวติดกัน): ย่อ mask ลง 4 เท่าเพื่อความเร็ว
    f = 4; sw, sh = (W + f - 1) // f, (H + f - 1) // f
    small = alpha.point(lambda v: 255 if v > 40 else 0).resize((sw, sh), Image.BOX)
    sp = small.load(); lab = [[0] * sw for _ in range(sh)]; comps = []
    for y in range(sh):
        for x in range(sw):
            if sp[x, y] == 0 or lab[y][x]: continue
            cid = len(comps) + 1; lab[y][x] = cid; st = [(x, y)]; cells = []
            while st:
                cx, cy = st.pop(); cells.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < sw and 0 <= ny < sh and sp[nx, ny] and not lab[ny][nx]:
                            lab[ny][nx] = cid; st.append((nx, ny))
            xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
            comps.append({"id": cid, "n": len(cells), "box": (min(xs), min(ys), max(xs) + 1, max(ys) + 1),
                          "cx": sum(xs) / len(xs), "cy": sum(ys) / len(ys)})
    big = sorted(comps, key=lambda c: c["n"], reverse=True)[:n]
    # ถ้าชิ้นในตารางติดกัน (เช่น ใบไม้ประดับฐานแตะชิ้นข้าง ๆ) ก้อนใหญ่จะน้อยกว่าจำนวนชิ้น
    # หรือก้อนที่ n เล็กผิดปกติ → ใช้วิธีแบ่งตามตาราง
    if len(comps) < n or big[-1]["n"] < 0.05 * big[0]["n"]:
        # ชิ้นแตะกันบาง ๆ (เช่น ปลายใบไม้) → กัดขอบ mask ทีละชั้นจนแยกครบ แล้วขยายป้ายกลับ
        res = split_by_erosion(sp, sw, sh, n)
        if res is None:
            print("ชิ้นในภาพติดกัน ใช้วิธีแบ่งตามตาราง")
            return grid_mode(img, alpha, a, names, widths)
        print("ชิ้นในภาพแตะกัน แยกด้วยการกัดขอบ")
        lab, comps = res
        big = sorted(comps, key=lambda c: c["n"], reverse=True)[:n]
    big.sort(key=lambda c: c["cy"])
    grid = []
    for r in range(a.rows): grid += sorted(big[r * a.cols:(r + 1) * a.cols], key=lambda c: c["cx"])
    owner = {c["id"]: k for k, c in enumerate(grid)}
    def gap(c, g):  # ระยะห่างระหว่างกรอบ
        bx0, by0, bx1, by1 = c["box"]; gx0, gy0, gx1, gy1 = g["box"]
        return max(0, gx0 - bx1, bx0 - gx1) + max(0, gy0 - by1, by0 - gy1)
    for c in comps:
        if c["id"] not in owner: owner[c["id"]] = min(range(n), key=lambda k: gap(c, grid[k]))

    pieces = []
    for k, g in enumerate(grid):
        ids = {cid for cid, o in owner.items() if o == k}
        m = Image.new("L", (sw, sh), 0); mp = m.load()
        for y in range(sh):
            row = lab[y]
            for x in range(sw):
                if row[x] in ids: mp[x, y] = 255
        m = m.resize((sw * f, sh * f), Image.NEAREST).crop((0, 0, W, H))
        keep = Image.new("L", (W, H), 0); keep.paste(alpha, (0, 0), m)
        piece = img.copy(); piece.putalpha(keep)
        box = keep.point(lambda v: 255 if v > 40 else 0).getbbox()
        crop = piece.crop(box); w = widths[k]; h = max(1, round(crop.height * w / crop.width))
        pieces.append((names[k], crop.resize((w, h), Image.BOX)))

    finish(pieces, a)


def label(mask, sw, sh):
    lab = [[0] * sw for _ in range(sh)]; comps = []
    for y in range(sh):
        for x in range(sw):
            if not mask[y][x] or lab[y][x]: continue
            cid = len(comps) + 1; lab[y][x] = cid; st = [(x, y)]; cells = []
            while st:
                cx, cy = st.pop(); cells.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < sw and 0 <= ny < sh and mask[ny][nx] and not lab[ny][nx]:
                            lab[ny][nx] = cid; st.append((nx, ny))
            xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
            comps.append({"id": cid, "n": len(cells), "box": (min(xs), min(ys), max(xs) + 1, max(ys) + 1),
                          "cx": sum(xs) / len(xs), "cy": sum(ys) / len(ys)})
    return lab, comps


def split_by_erosion(sp, sw, sh, n, max_steps=6):
    base = [[sp[x, y] > 0 for x in range(sw)] for y in range(sh)]
    m = base
    for _ in range(max_steps):
        m = [[m[y][x] and all(0 <= x+dx < sw and 0 <= y+dy < sh and m[y+dy][x+dx]
                              for dx in (-1, 0, 1) for dy in (-1, 0, 1)) for x in range(sw)] for y in range(sh)]
        lab, comps = label(m, sw, sh)
        big = sorted(comps, key=lambda c: c["n"], reverse=True)[:n]
        if len(big) == n and big[-1]["n"] >= 0.05 * big[0]["n"]:
            keep = {c["id"] for c in big}
            # ขยายป้ายกลับไปทั่วพื้นที่เดิม (BFS หลายจุดเริ่ม)
            out = [[lab[y][x] if lab[y][x] in keep else 0 for x in range(sw)] for y in range(sh)]
            q = [(x, y) for y in range(sh) for x in range(sw) if out[y][x]]
            i = 0
            while i < len(q):
                x, y = q[i]; i += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < sw and 0 <= ny < sh and base[ny][nx] and not out[ny][nx]:
                        out[ny][nx] = out[y][x]; q.append((nx, ny))
            # คำนวณข้อมูลก้อนใหม่จากป้ายที่ขยายแล้ว
            stats = {}
            for y in range(sh):
                for x in range(sw):
                    c = out[y][x]
                    if c:
                        s = stats.setdefault(c, [0, sw, sh, 0, 0, 0, 0])
                        s[0] += 1; s[1] = min(s[1], x); s[2] = min(s[2], y); s[3] = max(s[3], x + 1); s[4] = max(s[4], y + 1); s[5] += x; s[6] += y
            comps2 = [{"id": c, "n": v[0], "box": (v[1], v[2], v[3], v[4]), "cx": v[5] / v[0], "cy": v[6] / v[0]} for c, v in stats.items()]
            return out, comps2
    return None


def finish(pieces, a):
    strip = Image.new("RGB", (sum(s.width for _, s in pieces), max(s.height for _, s in pieces)))
    x = 0
    for _, s in pieces:
        strip.paste(s.convert("RGB"), (x, 0), s.getchannel("A").point(lambda v: 255 if v > 110 else 0)); x += s.width
    pal = strip.quantize(colors=a.colors, method=Image.MAXCOVERAGE)

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); meta = {}
    finals = []
    for name, s in pieces:
        m = s.getchannel("A").point(lambda v: 255 if v > 110 else 0)
        rgb = Image.new("RGB", s.size); rgb.paste(s.convert("RGB"), mask=m)
        q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA"); q.putalpha(m)
        q.save(out / f"{name}.png"); finals.append(q)
        meta[name] = {"file": f"{name}.png", "width": q.width, "height": q.height,
                      "anchor": {"x": q.width // 2, "y": q.height - 1}, "shadowWidth": max(4, round(q.width * 0.8))}
    (out / "props.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    S = 6; cw = max(f.width for f in finals) + 4; ch = max(f.height for f in finals) + 4
    prev = Image.new("RGBA", (a.cols * cw * S, a.rows * ch * S), (85, 146, 74, 255))
    for k, f in enumerate(finals):
        r, c = divmod(k, a.cols)
        prev.alpha_composite(f.resize((f.width * S, f.height * S), Image.NEAREST),
                             ((c * cw + (cw - f.width) // 2) * S, (r * ch + ch - 2 - f.height) * S))
    prev.save(out / "preview.png")
    print(f"ตัดแล้ว {len(finals)} ชิ้น -> {out}")



def drop_specks(cell, keep=0.03):
    """ลบก้อนเล็ก ๆ ที่หลงมาจากช่องข้าง ๆ (เล็กกว่า 3% ของก้อนใหญ่สุดในช่อง)"""
    a = cell.getchannel("A"); W, H = cell.size; ap = a.load()
    seen = [[False] * W for _ in range(H)]; comps = []
    for y in range(0, H):
        for x in range(0, W):
            if seen[y][x] or ap[x, y] <= 40: continue
            st = [(x, y)]; seen[y][x] = True; pts = []
            while st:
                cx, cy = st.pop(); pts.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and ap[nx, ny] > 40:
                        seen[ny][nx] = True; st.append((nx, ny))
            comps.append(pts)
    if not comps: return cell
    big = max(len(c) for c in comps); out = cell.copy(); op = out.load()
    for c in comps:
        if len(c) < keep * big:
            for x, y in c: op[x, y] = (0, 0, 0, 0)
    return out


def grid_mode(img, alpha, a, names, widths):
    """แบ่งตามตาราง โดยเลื่อนเส้นแบ่งไปตรงที่ตัดผ่านภาพน้อยที่สุด (±25% ของขนาดช่อง)"""
    W, H = img.size; ap = alpha.load()
    def best_cut(target, lo, hi, count):
        span = (hi - lo) / (a.cols if hi == W else a.rows)
        rng = range(max(lo, int(target - 0.25 * span)), min(hi, int(target + 0.25 * span)) + 1)
        return min(rng, key=lambda v: (count(v), abs(v - target)))
    rh = H / a.rows
    ys = [0] + [best_cut(r * rh, 0, H, lambda y: sum(1 for x in range(0, W, 2) if ap[x, y] > 40))
                for r in range(1, a.rows)] + [H]
    pieces = []
    for r in range(a.rows):
        y0, y1 = ys[r], ys[r + 1]; cw = W / a.cols
        xs = [0] + [best_cut(c * cw, 0, W, lambda x: sum(1 for y in range(y0, y1, 2) if ap[x, y] > 40))
                    for c in range(1, a.cols)] + [W]
        for c in range(a.cols):
            cell = drop_specks(img.crop((xs[c], y0, xs[c + 1], y1)))
            m = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0)
            box = m.getbbox()
            if not box: raise SystemExit(f"แถว {r+1} ช่อง {c+1} ว่าง")
            crop = cell.crop(box); k = r * a.cols + c; w = widths[k]
            h = max(1, round(crop.height * w / crop.width))
            pieces.append((names[k], crop.resize((w, h), Image.BOX)))
    finish(pieces, a)


if __name__ == "__main__":
    main()
