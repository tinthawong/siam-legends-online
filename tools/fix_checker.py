"""ลบพื้นหลังลายตารางหมากรุกปลอม (เทา/ขาว) ที่ ChatGPT วาดติดมาในภาพ ให้เป็นโปร่งใสจริง

ตัวอย่าง:
    python tools/fix_checker.py input.png output.png

วิธีทำ: ไล่เติมจากขอบภาพเข้าไป ลบเฉพาะพิกเซลสีเทาอ่อน/ขาวที่ต่อเนื่องกับขอบ
ของที่อยู่ในเส้นขอบดำของตัวละคร (เช่น ตาขาว, แสงวาวบนเคียว) จะไม่ถูกลบ
ถ้าภาพโปร่งใสอยู่แล้ว สคริปต์จะคัดลอกไปเฉย ๆ
ต้องมี Pillow:  pip install pillow
"""
import sys
from collections import deque
from PIL import Image


def is_bg(p, lo=175):
    r, g, b = p[:3]
    return min(r, g, b) >= lo and max(r, g, b) - min(r, g, b) <= 22


def main(src, dst):
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    a = im.getchannel("A")
    if a.getextrema()[0] < 20 and sum(1 for v in a.getdata() if v < 20) > W * H * 0.05:
        im.save(dst); print("ภาพโปร่งใสอยู่แล้ว คัดลอกไปเฉย ๆ"); return
    px = im.load()
    seen = bytearray(W * H); q = deque()
    for x in range(W):
        for y in (0, H - 1): q.append((x, y))
    for y in range(H):
        for x in (0, W - 1): q.append((x, y))
    removed = 0
    while q:
        x, y = q.popleft(); i = y * W + x
        if seen[i]: continue
        seen[i] = 1
        if not is_bg(px[x, y]): continue
        px[x, y] = (0, 0, 0, 0); removed += 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]: q.append((nx, ny))
    # ขอบฟุ้งสีอ่อนที่ติดกับพื้นที่ลบแล้ว (เศษลายตารางรอบเส้นขอบ) ลบอีกชั้น
    for _ in range(2):
        kill = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                p = px[x, y]
                if p[3] and is_bg(p, 150) and any(px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    kill.append((x, y))
        for x, y in kill: px[x, y] = (0, 0, 0, 0)
        removed += len(kill)
    im.save(dst)
    print(f"ลบพื้นหลัง {removed * 100 // (W * H)}% ของภาพ -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
