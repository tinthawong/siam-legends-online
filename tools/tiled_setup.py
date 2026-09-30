"""สร้างโปรเจกต์ Tiled ใน maps/ (docs/map-system.md + map-grid.md) — รันซ้ำได้ (สร้าง tileset ใหม่ทุกครั้ง แมพ .tmj สร้างเฉพาะที่ยังไม่มี)

    python tools/tiled_setup.py

- maps/siam.tiled-project           เปิดไฟล์นี้ใน Tiled
- maps/tilesets/terrain.tsx          พื้น 6 แบบ 64×64 (property terrain)
- maps/tilesets/block.tsx            ช่องเดินไม่ได้เพิ่มเอง (สีแดงโปร่งแสง)
- maps/tilesets/props.tsx            ของประดับทุกชิ้น (property solid / deck / arch) จุดยึด = กึ่งกลางขอบล่าง
                                     ของที่ยังไม่มีภาพ = กล่องชั่วคราวพร้อมชื่อ (maps/tilesets/placeholder/) ได้ภาพจริงแล้วรันสคริปต์นี้ใหม่
- maps/<id>.tmj                      แมพตั้งต้นจากผังล่าสุด (ถ้ายังไม่มีไฟล์)
แก้แมพเสร็จ: npm run map  (tools/build_map.py → shared/data/maps/<id>.json)
"""
import json, os, shutil, sys
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / "maps"
TS = MAPS / "tilesets"
PROPS_DIR = ROOT / "client/public/sprites/props"
TILE = 64

TERRAINS = ["grass", "sand", "water", "dirt", "paddy", "forest"]
LETTER = {"grass": "G", "sand": "S", "water": "W", "dirt": "D", "paddy": "P", "forest": "F"}

# ของเตี้ย/เล็ก เดินผ่านได้ (map-system.md) + ของที่เป็นพื้นไม้เดินได้
NOT_SOLID = {"flowers-yellow", "flowers-pink", "tall-grass", "fern", "seashell", "starfish", "stepping-stone",
             "rice-straw", "morning-glory", "lotus", "pier", "pier-plank", "seashells"}
DECKS = {"pier", "pier-plank"}          # ท่าเรือ: ช่องน้ำใต้พื้นเดินได้
ARCHES = {"bridge-main", "bridge-foot"}  # สะพานโค้ง: ภาพ -back/-front (docs/bridges.md)


def xml_props(d):
    items = []
    for k, v in d.items():
        t = "bool" if isinstance(v, bool) else "int" if isinstance(v, int) else "string"
        val = ("true" if v else "false") if isinstance(v, bool) else escape(str(v))
        items.append(f'   <property name="{k}" type="{t}" value="{val}"/>')
    return "  <properties>\n" + "\n".join(items) + "\n  </properties>\n" if items else ""


def write_terrain():
    d = TS / "terrain"
    d.mkdir(parents=True, exist_ok=True)
    for t in TERRAINS[:-1]:
        shutil.copy(ROOT / f"client/public/sprites/tiles/{t}.png", d / f"{t}.png")
    # ป่า: หญ้า + ต้นไม้ย่อ (ใช้แค่ตอนระบายใน Tiled ในเกมเติมต้นไม้เอง)
    im = Image.open(ROOT / "client/public/sprites/tiles/grass.png").convert("RGBA")
    tree = Image.open(PROPS_DIR / "set6/tall-forest-tree.png").convert("RGBA")
    tree.thumbnail((56, 60))
    im.alpha_composite(tree, ((64 - tree.width) // 2, 64 - tree.height - 2))
    im.save(d / "forest.png")
    tiles = "".join(
        f' <tile id="{i}">\n{xml_props({"terrain": t})}  <image width="64" height="64" source="terrain/{t}.png"/>\n </tile>\n'
        for i, t in enumerate(TERRAINS))
    (TS / "terrain.tsx").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.12.2" name="terrain" tilewidth="64" tileheight="64" '
        f'tilecount="{len(TERRAINS)}" columns="0">\n <grid orientation="orthogonal" width="1" height="1"/>\n{tiles}</tileset>\n', encoding="utf-8")


def write_block():
    im = Image.new("RGBA", (64, 64), (230, 40, 40, 110))
    ImageDraw.Draw(im).rectangle([0, 0, 63, 63], outline=(255, 60, 60, 220), width=2)
    im.save(TS / "block.png")
    (TS / "block.tsx").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.12.2" name="block" tilewidth="64" tileheight="64" '
        'tilecount="1" columns="0">\n <grid orientation="orthogonal" width="1" height="1"/>\n'
        ' <tile id="0">\n  <image width="64" height="64" source="block.png"/>\n </tile>\n</tileset>\n', encoding="utf-8")


def write_shore():
    """shore.tsx: tile ชายฝั่งจาก shore-tiles-64.png (หาใน maps/tilesets, art/tiles, Downloads) ทุก tile terrain = water
    (เดินไม่ได้ ผู้เล่นหยุดที่ทราย) ตั้งทั้งระดับ tileset และทีละ tile — ไม่มีไฟล์ = ข้าม"""
    cands = [TS / "shore-tiles-64.png", ROOT / "art/tiles/shore-tiles-64.png", Path.home() / "Downloads/shore-tiles-64.png"]
    src = next((c for c in cands if c.exists()), None)
    if not src:
        print("ไม่พบ shore-tiles-64.png (ข้าม shore.tsx) วางไฟล์ไว้ที่ art/tiles/ แล้วรันใหม่")
        return
    if src != TS / "shore-tiles-64.png":
        shutil.copy(src, TS / "shore-tiles-64.png")
    im = Image.open(src)
    cols, rows = im.width // TILE, im.height // TILE
    water = xml_props({"terrain": "water"})
    NL = "\n"
    tiles = "".join(f' <tile id="{i}">{NL}{water} </tile>{NL}' for i in range(cols * rows))
    (TS / "shore.tsx").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>{NL}<tileset version="1.10" tiledversion="1.12.2" name="shore" tilewidth="64" tileheight="64" '
        f'tilecount="{cols * rows}" columns="{cols}">{NL}{water} <image source="shore-tiles-64.png" width="{im.width}" height="{im.height}"/>{NL}'
        f'{tiles}</tileset>{NL}',
        encoding="utf-8")
    print(f"สร้าง shore.tsx ({cols * rows} tile, terrain = water) เพิ่มเข้าแมพใน Tiled: Map → Add External Tileset")


def placeholder(name):
    d = TS / "placeholder"
    d.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGBA", (64, 64), (255, 0, 200, 90))
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 63, 63], outline=(255, 0, 200, 255), width=2)
    for i, part in enumerate([name[j:j + 10] for j in range(0, len(name), 10)][:4]):
        dr.text((3, 3 + i * 12), part, fill=(255, 255, 255, 255))
    p = d / f"{name}.png"
    im.save(p)
    return f"placeholder/{name}.png", 64, 64


def write_props(extra_names):
    """props.tsx: ทุกชิ้นใน client/public/sprites/props/*/props.json + ชื่อในผังที่ยังไม่มีภาพ (กล่องชั่วคราว)"""
    entries = {}
    for pj in sorted(PROPS_DIR.glob("*/props.json")):
        meta = json.loads(pj.read_text(encoding="utf-8"))
        for name, m in meta.items():
            entries[name] = (os.path.relpath(pj.parent / m["file"], TS).replace("\\", "/"), m["width"], m["height"])
    # สะพานโค้ง: ภาพตัวอย่างรวมชั้นหลัง+หน้า (ในผังใช้ชื่อ bridge-main / bridge-foot)
    for a in ARCHES:
        back, front = PROPS_DIR / f"bridges/{a}-back.png", PROPS_DIR / f"bridges/{a}-front.png"
        if back.exists() and front.exists():
            im = Image.open(back).convert("RGBA"); im.alpha_composite(Image.open(front).convert("RGBA"))
            (TS / "arch").mkdir(parents=True, exist_ok=True)
            im.save(TS / f"arch/{a}.png")
            entries[a] = (f"arch/{a}.png", im.width, im.height)
        entries.pop(f"{a}-back", None); entries.pop(f"{a}-front", None)
    missing = []
    for n in sorted(extra_names):
        if n not in entries:
            entries[n] = placeholder(n)
            missing.append(n)
    names = sorted(entries)
    tiles = []
    for i, n in enumerate(names):
        src, w, h = entries[n]
        props = {"name": n, "solid": n not in NOT_SOLID and w >= 16 and n not in ARCHES}
        if n in DECKS: props["deck"] = True
        if n in ARCHES: props["arch"] = True
        tiles.append(f' <tile id="{i}">\n{xml_props(props)}  <image width="{w}" height="{h}" source="{src}"/>\n </tile>\n')
    mw = max(e[1] for e in entries.values()); mh = max(e[2] for e in entries.values())
    (TS / "props.tsx").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.12.2" name="props" tilewidth="{mw}" tileheight="{mh}" '
        f'tilecount="{len(names)}" columns="0" objectalignment="bottom">\n <grid orientation="orthogonal" width="1" height="1"/>\n'
        + "".join(tiles) + "</tileset>\n", encoding="utf-8")
    return names, missing, {n: (e[1], e[2]) for n, e in entries.items()}


def layout_to_tmj(L, prop_names, sizes):
    """ผัง JSON (tile 64 หรือ 32) → .tmj ตาราง 64"""
    tile = L.get("tile", 32)
    step = TILE // tile  # 32 → ย่อ 2×2 เป็นช่องเดียว (เลือกพื้นที่มากที่สุดในกลุ่ม)
    W, H = L["width"] // step, L["height"] // step
    rev = {v: k for k, v in LETTER.items()}
    ground = []
    for y in range(H):
        for x in range(W):
            cells = [L["terrain"][y * step + dy][x * step + dx] for dy in range(step) for dx in range(step)]
            letter = max(set(cells), key=cells.count)
            ground.append(TERRAINS.index(rev.get(letter, "grass")) + 1)
    first_block = len(TERRAINS) + 1
    first_prop = first_block + 1
    oid = 1
    def obj(**kw):
        nonlocal oid
        o = {"id": oid, "name": "", "type": "", "rotation": 0, "visible": True, **kw}
        oid += 1
        return o
    def props_of(d):
        return [{"name": k, "type": "int" if isinstance(v, int) else "string", "value": v} for k, v in d.items()]
    alias = {"pier": "pier-plank"} if L["id"] == "thung-na" else {}  # ผังทุ่งนาใช้ท่าเรือแบบเก่า (แผ่นไม้ต่อกัน)
    prop_objs = []
    for p in L["props"]:
        n = alias.get(p["name"], p["name"])
        gid = first_prop + prop_names.index(n)
        if p.get("flipX"): gid |= 0x80000000
        w, h = sizes[n]
        prop_objs.append(obj(gid=gid, x=p["x"], y=p["y"], width=w, height=h))
    layers = [
        {"id": 1, "name": "ground", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": ground},
        {"id": 2, "name": "block", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 0.6, "visible": True, "data": [0] * (W * H)},
        {"id": 3, "name": "props", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": prop_objs},
        {"id": 4, "name": "spawns", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "color": "#ff5a5a",
         "objects": [obj(x=s["x"], y=s["y"], width=s["w"], height=s["h"], properties=props_of({"monster": s["monster"], "count": s["count"]})) for s in L.get("spawns", [])]},
        {"id": 5, "name": "npcs", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "color": "#ffd84a",
         "objects": [obj(x=n["x"], y=n["y"], width=0, height=0, point=True, properties=props_of({"npc": n["npc"]})) for n in L.get("npcs", [])]},
        {"id": 6, "name": "start", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "color": "#7ee08a",
         "objects": [obj(x=L["start"]["x"], y=L["start"]["y"], width=0, height=0, point=True)]},
        {"id": 8, "name": "entries", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "color": "#c08cff",
         "objects": [obj(name=e["name"], x=e["x"], y=e["y"], width=0, height=0, point=True) for e in L.get("entries", [])]},
        {"id": 7, "name": "exits", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True, "x": 0, "y": 0, "color": "#6cc8ff",
         "objects": [obj(x=e["x"], y=e["y"], width=e["w"], height=e["h"], properties=props_of({"to": e["to"], "label": e["label"], **({"entry": e["entry"]} if e.get("entry") else {})})) for e in L.get("exits", [])]},
    ]
    return {
        "type": "map", "version": "1.10", "tiledversion": "1.12.2", "orientation": "orthogonal", "renderorder": "right-down",
        "width": W, "height": H, "tilewidth": TILE, "tileheight": TILE, "infinite": False,
        "properties": [{"name": "id", "type": "string", "value": L["id"]}, {"name": "name", "type": "string", "value": L.get("name", L["id"])}],
        "layers": layers, "nextlayerid": 9, "nextobjectid": oid,
        "tilesets": [{"firstgid": 1, "source": "tilesets/terrain.tsx"}, {"firstgid": first_block, "source": "tilesets/block.tsx"},
                     {"firstgid": first_prop, "source": "tilesets/props.tsx"}],
    }


def main():
    TS.mkdir(parents=True, exist_ok=True)
    # แมพตั้งต้น: ผังล่าสุดที่ผู้ใช้ส่งมา (ถ้ามีใน Downloads) ไม่มีก็ใช้ของเกม
    dl = Path.home() / "Downloads"
    sources = {
        "ban-pak-ao": [dl / "ban-pak-ao.layout (3).json", ROOT / "shared/data/maps/ban-pak-ao.json"],
        "thung-na": [dl / "thung-na.layout (1).json"],
    }
    layouts = {}
    for mid, cands in sources.items():
        for c in cands:
            if c.exists():
                layouts[mid] = json.loads(c.read_text(encoding="utf-8")); break
    extra = {("pier-plank" if (p["name"] == "pier" and mid == "thung-na") else p["name"]) for mid, L in layouts.items() for p in L["props"]}
    # ชิ้นที่ผังระบุว่าเป็นพื้นไม้เดินได้ (decks) → property deck
    DECKS.update(d["name"] for L in layouts.values() for d in L.get("decks", []))
    NOT_SOLID.update(DECKS)
    write_terrain(); write_block(); write_shore()
    names, missing, sizes = write_props(extra)
    (MAPS / "siam.tiled-project").write_text(json.dumps({"automappingRulesFile": "", "commands": [], "extensionsPath": "extensions",
                                                        "folders": ["."], "propertyTypes": []}, indent=4), encoding="utf-8")
    for mid, L in layouts.items():
        out = MAPS / f"{mid}.tmj"
        if out.exists():
            print(f"ข้าม {out.name} (มีอยู่แล้ว ไม่เขียนทับ)"); continue
        out.write_text(json.dumps(layout_to_tmj(L, names, sizes), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"สร้าง {out.name}")
    print(f"props.tsx: {len(names)} ชิ้น, ยังไม่มีภาพ (กล่องชั่วคราว) {len(missing)} ชิ้น: {', '.join(missing)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
