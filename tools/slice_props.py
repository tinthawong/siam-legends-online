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
    alpha = img.getchannel("A"); ap = alpha.load()
    rows = bands([any(ap[x, y] > 40 for x in range(0, W, 2)) for y in range(H)], 20)
    rows = sorted(sorted(rows, key=lambda b: b[1] - b[0], reverse=True)[: a.rows])
    if len(rows) != a.rows: raise SystemExit(f"เจอ {len(rows)} แถว แต่ระบุ --rows {a.rows}")

    pieces = []
    for r, (y0, y1) in enumerate(rows):
        occ = [any(ap[x, y] > 40 for y in range(y0, y1, 2)) for x in range(W)]
        xb = sorted(sorted(bands(occ, 1), key=lambda t: t[1] - t[0], reverse=True)[: a.cols])
        if len(xb) != a.cols: raise SystemExit(f"แถว {r+1}: เจอ {len(xb)} ชิ้น แต่ระบุ --cols {a.cols}")
        for c, (x0, x1) in enumerate(xb):
            crop = img.crop((x0, y0, x1, y1)); box = crop.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            crop = crop.crop(box)
            k = r * a.cols + c; w = widths[k]; h = max(1, round(crop.height * w / crop.width))
            pieces.append((names[k], crop.resize((w, h), Image.BOX)))

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


if __name__ == "__main__":
    main()
