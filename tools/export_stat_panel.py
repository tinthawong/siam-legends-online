"""ภาพหน้าต่างค่าพลัง art/ui/stats/ → client/public/ui/stats/ (webp)
กรอบใช้ขนาดเต็ม (พิกัดใน shared/data/stat-panel-layout.json อิงขนาดนี้) ไอคอนย่อเหลือ 96 px (บนจอแสดงราว 30–60 px)
python tools/export_stat_panel.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/ui/stats"
OUT = ROOT / "client/public/ui/stats"
ICON = 96

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "icons").mkdir(exist_ok=True)
Image.open(SRC / "stat-panel.png").save(OUT / "stat-panel.webp", quality=88, method=6)
for p in sorted((SRC / "icons").glob("*.png")):
    im = Image.open(p).convert("RGBA").resize((ICON, ICON), Image.LANCZOS)
    im.save(OUT / "icons" / f"{p.stem}.webp", quality=90, method=6)
print("ok", OUT)
