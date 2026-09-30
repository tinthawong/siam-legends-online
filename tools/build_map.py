"""แปลงแมพ Tiled (maps/*.tmj) เป็นไฟล์แมพของเกม shared/data/maps/<id>.json (docs/map-system.md + map-grid.md)

    npm run map                 ทุกแมพใน maps/
    python tools/build_map.py maps/ban-pak-ao.tmj

- Tiled ช่องละ 64 px → ตารางเดิน 32 px (1 ช่อง Tiled = 2×2 ช่องเดิน)
- เลเยอร์: ground (พื้น), block (ช่องเดินไม่ได้เพิ่ม), props, spawns, npcs, start, exits
- props: จุดยึด = กึ่งกลางขอบล่าง (tileset props.tsx ตั้ง objectalignment="bottom") พลิกซ้าย-ขวาได้
  property ของแต่ละชิ้นใน props.tsx: solid (ขวางทาง), deck (พื้นไม้เดินได้บนน้ำ), arch (สะพานโค้ง)
- เจอปัญหา: แจ้งเป็นภาษาไทยแล้วหยุด (ไม่เขียนไฟล์)
"""
import json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WALK = 32
LETTER = {"grass": "G", "sand": "S", "water": "W", "dirt": "D", "paddy": "P", "forest": "F"}
FLIP_H, FLIP_V, FLIP_D = 0x80000000, 0x40000000, 0x20000000
REQUIRED = ["ground", "props", "spawns", "npcs", "start", "exits"]


class MapError(Exception):
    pass


def load_tileset(tmj_dir: Path, ref):
    """คืน [(firstgid, {local_id: {properties}})] อ่านจาก .tsx ภายนอก"""
    path = (tmj_dir / ref["source"]).resolve()
    root = ET.parse(path).getroot()
    tiles = {}
    for t in root.findall("tile"):
        props = {}
        for p in t.findall("properties/property"):
            v, typ = p.get("value"), p.get("type", "string")
            props[p.get("name")] = (v == "true") if typ == "bool" else int(v) if typ == "int" else v
        img = t.find("image")
        props["_image"] = img.get("source") if img is not None else ""
        tiles[int(t.get("id"))] = props
    return ref["firstgid"], root.get("name"), tiles


def build(tmj_path: Path) -> dict:
    tmj = json.loads(tmj_path.read_text(encoding="utf-8"))
    if tmj.get("tilewidth") != 64:
        raise MapError(f"ขนาดช่องใน Tiled ต้องเป็น 64 px (ตอนนี้ {tmj.get('tilewidth')})")
    mprops = {p["name"]: p["value"] for p in tmj.get("properties", [])}
    mid = mprops.get("id", tmj_path.stem)
    W, H = tmj["width"], tmj["height"]
    tilesets = sorted((load_tileset(tmj_path.parent, ts) for ts in tmj["tilesets"]), key=lambda t: t[0])

    def tile_of(gid):
        gid &= ~(FLIP_H | FLIP_V | FLIP_D)
        for first, name, tiles in reversed(tilesets):
            if gid >= first:
                return name, tiles.get(gid - first, {})
        return None, {}

    layers = {l["name"]: l for l in tmj["layers"]}
    for req in REQUIRED:
        if req not in layers:
            raise MapError(f"ไม่มีเลเยอร์ '{req}' (ต้องมี: {', '.join(REQUIRED)})")

    # ---- พื้น: 64 → ตาราง 32 (2×2) ----
    terrain = [[""] * (W * 2) for _ in range(H * 2)]
    for i, gid in enumerate(layers["ground"]["data"]):
        x, y = i % W, i // W
        ts, props = tile_of(gid) if gid else (None, {})
        name = props.get("terrain")
        if not gid or name not in LETTER:
            raise MapError(f"ช่องพื้นว่างหรือไม่ใช่ลายพื้นที่ช่อง ({x}, {y}) ของ Tiled — ทุกช่องในเลเยอร์ ground ต้องระบาย")
        for dy in (0, 1):
            for dx in (0, 1):
                terrain[y * 2 + dy][x * 2 + dx] = LETTER[name]

    # ---- block: ช่อง Tiled ที่ระบาย → 4 ช่องเดินไม่ได้ ----
    blocked = []
    if "block" in layers:
        for i, gid in enumerate(layers["block"]["data"]):
            if gid:
                x, y = i % W, i // W
                blocked += [[x * 2 + dx, y * 2 + dy] for dy in (0, 1) for dx in (0, 1)]

    # ---- props ----
    props_out, placeholders = [], set()
    for o in layers["props"]["objects"]:
        if "gid" not in o:
            continue
        _, tp = tile_of(o["gid"])
        name = tp.get("name")
        if not name:
            raise MapError(f"ของประดับ id {o['id']} ไม่ได้มาจาก tileset props")
        if tp.get("_image", "").startswith("placeholder/"):
            placeholders.add(name)
        p = {"name": name, "x": round(o["x"]), "y": round(o["y"])}
        if o["gid"] & FLIP_H: p["flipX"] = True
        p["solid"] = bool(tp.get("solid", True))
        if tp.get("deck"): p["deck"] = True
        props_out.append(p)

    def obj_props(o):
        return {p["name"]: p["value"] for p in o.get("properties", [])}

    starts = [o for o in layers["start"]["objects"]]
    if len(starts) != 1:
        raise MapError(f"เลเยอร์ start ต้องมีจุดเกิดผู้เล่น 1 จุด (ตอนนี้ {len(starts)})")
    start = {"x": round(starts[0]["x"]), "y": round(starts[0]["y"])}

    # ชื่อมอนในผัง (ชื่อแบบภาพ เช่น rice-crab) ต้องมีใน MOB_ID ของ shared/map.ts, NPC ต้องมีใน npcs.json
    map_ts = (ROOT / "shared/map.ts").read_text(encoding="utf-8")
    mob_block = re.search(r"MOB_ID[^{]*\{([^}]*)\}", map_ts).group(1)
    known_mobs = set(re.findall(r'"?([a-z-]+)"?\s*:', mob_block))
    known_npcs = {n["id"] for n in json.loads((ROOT / "shared/data/npcs.json").read_text(encoding="utf-8"))}

    def walkable_cell(px, py):
        cx, cy = int(px // WALK), int(py // WALK)
        if not (0 <= cx < W * 2 and 0 <= cy < H * 2):
            return False
        # พื้นไม้ที่ยังไม่มีภาพ ในเกมไม่รู้ขนาด = เดินไม่ได้ (map.ts) จึงไม่นับ
        on_deck = any(p.get("deck") and p["name"] not in placeholders and abs(p["x"] - px) < 40 and 0 <= p["y"] - py < 160 for p in props_out)
        return (terrain[cy][cx] not in "WF" or on_deck) and [cx, cy] not in blocked

    spawns = []
    for o in layers["spawns"]["objects"]:
        pr = obj_props(o)
        mon, cnt = pr.get("monster"), pr.get("count")
        if mon not in known_mobs:
            raise MapError(f"จุดเกิดมอน id {o['id']}: ไม่มีมอนชื่อ '{mon}' ในเกม (มี: {', '.join(sorted(known_mobs))})")
        if not isinstance(cnt, int) or cnt < 1:
            raise MapError(f"จุดเกิดมอน '{mon}' ต้องมี property count (int) อย่างน้อย 1")
        x0, y0, w, h = o["x"], o["y"], o["width"], o["height"]
        if not any(walkable_cell(x, y) for x in range(int(x0) + 16, int(x0 + w), 32) for y in range(int(y0) + 16, int(y0 + h), 32)):
            raise MapError(f"จุดเกิดมอน '{mon}' ไม่มีช่องที่เดินได้เลยในกรอบ")
        spawns.append({"monster": mon, "count": cnt, "x": round(x0), "y": round(y0), "w": round(w), "h": round(h)})

    npcs = []
    for o in layers["npcs"]["objects"]:
        npc = obj_props(o).get("npc")
        if npc not in known_npcs:
            raise MapError(f"NPC id {o['id']}: ไม่มี NPC ชื่อ '{npc}' ในเกม (มี: {', '.join(sorted(known_npcs))})")
        if not walkable_cell(o["x"], o["y"]):
            raise MapError(f"NPC '{npc}' อยู่บนช่องที่เดินไม่ได้ ({round(o['x'])}, {round(o['y'])})")
        npcs.append({"npc": npc, "x": round(o["x"]), "y": round(o["y"])})

    if not walkable_cell(start["x"], start["y"]):
        raise MapError(f"จุดเกิดผู้เล่น ({start['x']}, {start['y']}) อยู่บนช่องที่เดินไม่ได้ (น้ำ/ป่า/block) ถ้าอยู่บนท่าเรือ ต้องวางท่าเรือที่มีภาพแล้วทับด้วย")

    exits = []
    for o in layers["exits"]["objects"]:
        pr = obj_props(o)
        if not pr.get("to") or not pr.get("label"):
            raise MapError(f"ทางออก id {o['id']} ต้องมี property to และ label")
        exits.append({"to": pr["to"], "label": pr["label"], "x": round(o["x"]), "y": round(o["y"]), "w": round(o["width"]), "h": round(o["height"])})

    out = {
        "id": mid, "name": mprops.get("name", mid), "width": W * 2, "height": H * 2, "tile": WALK,
        "legend": {v: k for k, v in LETTER.items()},
        "terrain": ["".join(r) for r in terrain],
        "props": props_out, "blocked": blocked, "start": start, "exits": exits, "npcs": npcs, "spawns": spawns,
    }
    if placeholders:
        print(f"  คำเตือน: ยังไม่มีภาพ (ในเกมจะมองไม่เห็นและเดินทะลุได้): {', '.join(sorted(placeholders))}")
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    files = [Path(a) for a in sys.argv[1:]] or sorted((ROOT / "maps").glob("*.tmj"))
    if not files:
        print("ไม่พบไฟล์ .tmj ใน maps/ (รัน python tools/tiled_setup.py ก่อน)"); sys.exit(1)
    failed = 0
    for f in files:
        print(f"{f.name}:")
        try:
            data = build(f)
        except MapError as e:
            print(f"  ผิดพลาด: {e}\n  ไม่ได้เขียนไฟล์ของแมพนี้ (ไฟล์เดิมที่เกมใช้อยู่ไม่เปลี่ยน)")
            failed += 1
            continue
        out = ROOT / "shared/data/maps" / f"{data['id']}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  เขียน {out.relative_to(ROOT)} ({data['width']}×{data['height']} ช่องเดิน, ของประดับ {len(data['props'])} ชิ้น)")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
