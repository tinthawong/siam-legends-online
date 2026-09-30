"""วาดพื้นทุกแมพเป็นภาพเดียวด้วย tools/bake_sea.py → client/public/maps/<id>/ground.webp (เกมโหลดแทนพื้นที่วาดด้วยโค้ด)

    npm run bake                      ทุกแมพใน shared/data/maps/
    python tools/bake_maps.py ban-pak-ao

ลายพื้นจาก art/tiles/ (water-shallow, water, water-deep, sand, grass, dirt) · ต้องมี Pillow, numpy, scipy
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def bake(map_id: str):
    src = ROOT / "shared/data/maps" / f"{map_id}.json"
    out = ROOT / "client/public/maps" / map_id / "ground.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "ground.png"
        subprocess.run([sys.executable, str(ROOT / "tools/bake_sea.py"), str(src), str(png), "--tiles", str(ROOT / "art/tiles")],
                       check=True, capture_output=True)
        Image.open(png).convert("RGB").save(out, quality=90, method=6)
    print(f"  พื้น: {out.relative_to(ROOT)}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ids = sys.argv[1:] or sorted(p.stem for p in (ROOT / "shared/data/maps").glob("*.json"))
    for i in ids:
        print(f"{i}:")
        bake(i)


if __name__ == "__main__":
    main()
