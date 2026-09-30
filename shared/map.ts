// แมพทั้งหมดของเกม อ่านจาก shared/data/maps/<id>.json (สร้างจาก Tiled ด้วย npm run map หรือผังที่ผู้ใช้ส่งมา)
//   terrain = ตัวอักษรต่อช่อง (G/S/W/D/P/F), props = ของประดับที่พิกัดพิกเซล (จุดยึดกึ่งกลางฐาน),
//   start = จุดเกิด, entries = จุดเข้าเมื่อวาปมาจากแมพอื่น, npcs, spawns, exits (to = id แมพปลายทาง, entry = ชื่อจุดเข้า)
// เพิ่มแมพใหม่: import ไฟล์แล้วใส่ใน MAPS ข้างล่าง · ทั้ง client และ server ใช้ไฟล์เดียวกัน
import BAN_PAK_AO from "./data/maps/ban-pak-ao.json";
import THUNG_NA from "./data/maps/thung-na.json";
import P1 from "../client/public/sprites/props/set1/props.json";
import P2 from "../client/public/sprites/props/set2/props.json";
import P3 from "../client/public/sprites/props/set3/props.json";
import P4 from "../client/public/sprites/props/set4/props.json";
import P5 from "../client/public/sprites/props/set5/props.json";
import P6 from "../client/public/sprites/props/set6/props.json";
import P7 from "../client/public/sprites/props/bridges/props.json";
/** ขนาดภาพของประดับทุกชิ้น (จาก props.json ของแต่ละชุด) ใช้คิดฐานที่ขวางทาง */
const PROP_SIZE: Record<string, { width: number; height: number }> = { ...P1, ...P2, ...P3, ...P4, ...P5, ...P6, ...P7 };

export const TILE_PX = 32; // ตารางเดิน (ทุกแมพ)

// พื้น: รูปอยู่ที่ client/public/sprites/tiles/<ชื่อ>.png (64×64 ปูซ้ำ)
export const GRASS = 0;
export const WATER = 1; // เดินไม่ได้ (ยกเว้นช่องสะพาน)
export const SAND = 2;
export const DIRT = 3;
export const PADDY = 4;
export const FOREST = 5; // เดินไม่ได้ ใต้ป่าวาดเป็นหญ้า แล้วเติมต้นไม้ชุด 6 (client/src/forest.ts)
export const TERRAIN_NAMES = ["grass", "water", "sand", "dirt", "paddy"] as const; // ลายพื้นที่มีภาพ (ป่าใช้ลายหญ้า)
const LETTER: Record<string, number> = { G: GRASS, W: WATER, S: SAND, D: DIRT, P: PADDY, F: FOREST };

// ชื่อมอนใน layout → id ในเกม (MOBS)
export const MOB_ID: Record<string, string> = {
  "rice-crab": "mud_crab", "red-crab": "red_crab", "lotus-frog": "lotus_frog",
  grasshopper: "grasshopper", octopus: "octopus", scarecrow: "scarecrow",
};

/** ของประดับชิ้นหนึ่ง: px,py = จุดยึดกึ่งกลางฐาน (พิกเซล), x,y = ช่องที่ฐานอยู่ */
export interface MapProp {
  x: number;
  y: number;
  px: number;
  py: number;
  kind: string;
  flip: boolean;     // พลิกซ้าย-ขวา (ตั้งใน Tiled)
  solid?: boolean;   // จาก Tiled (props.tsx) ไม่มี = ใช้กฎ isSolidProp
  deck?: boolean;    // พื้นไม้เดินได้บนน้ำ (ท่าเรือ/แพ) จาก Tiled
}
/** ผังจาก Tiled (tools/build_map.py) มีช่องเดินไม่ได้เพิ่ม และค่าต่อชิ้น — ผังเก่าไม่มี */
type LayoutProp = { name: string; x: number; y: number; flipX?: boolean; solid?: boolean; deck?: boolean };

// ชุดของประดับ: ไฟล์เกมที่ client/public/sprites/props/<ชุด>/ (มี props.json ของแต่ละชุด)
export const PROP_SETS: Record<string, string[]> = {
  set1: ["flowers-yellow", "flowers-pink", "tall-grass", "fern", "bush", "rock", "rocks-3", "mossy-boulder",
    "seashell", "starfish", "driftwood", "coconut", "beach-grass", "rice-straw", "clay-jar", "lotus"],
  set2: ["banyan", "coconut-palm", "sugar-palm", "coconut-palm-leaning", "bamboo", "hibiscus-bush"], // ต้นไม้ใหญ่
  set3: ["stilt-house", "stilt-hut", "sala", "market-stall", "fish-rack", "village-gate", "pier-plank", "longtail-boat", "dragon-jars"], // หมู่บ้าน (pier-plank = ท่าเรือแบบเก่า แผ่นไม้ต่อกัน)
  set4: ["fence-wood", "fence-bamboo", "fence-corner", "fence-gate", "clothesline", "firewood", "well", "potted-plant",
    "bench", "quest-board", "lantern-post", "baskets", "barrel", "crate", "stepping-stone", "signpost"], // บ้านเรือน/ลานกลาง
  set5: ["net-rack", "net-pile", "fish-trap", "rowboat-upturned", "oars", "rope-coil", "buoys", "anchor",
    "scarecrow", "ox-cart", "field-hut", "water-wheel", "shore-rocks", "tide-pool", "hammock", "morning-glory"], // ท่าเรือ/นา/หาด
  set6: ["mango-tree", "jackfruit-tree", "tamarind-tree", "rain-tree", "golden-shower", "flame-tree", "frangipani", "indian-almond",
    "banana-tree", "papaya-tree", "areca-palm", "round-tree", "tall-forest-tree", "young-tree", "dense-shrub", "shrub-cluster"], // ต้นไม้/ป่า
  // สะพานโค้ง/ท่าเรือ (docs/bridges.md) สะพานในผังชื่อ bridge-main / bridge-foot ภาพแยกเป็นชั้นหลัง (-back) กับชั้นหน้า (-front)
  bridges: ["bridge-main-back", "bridge-main-front", "bridge-foot-back", "bridge-foot-front", "pier"],
};
/** สะพานโค้งในผัง: วาดชั้นหลัง (ใต้ตัวละคร) + ชั้นหน้า (เรียงความลึก) */
export const ARCH_BRIDGES = new Set(["bridge-main", "bridge-foot"]);
export const PROP_SET_OF: Record<string, string> = Object.fromEntries(
  Object.entries(PROP_SETS).flatMap(([set, kinds]) => kinds.map((k) => [k, set])),
);
// ชื่อใน layout ที่ต่างจากชื่อไฟล์
const PROP_ALIAS: Record<string, string> = { "lantern-pole": "lantern-post", "rattan-baskets": "baskets", "notice-board": "quest-board" };

// ขวางทาง (solid) ตาม docs/map-system.md: ทุกชิ้นขวาง ยกเว้นของเตี้ย/เล็กกว่าครึ่งช่อง
const NOT_SOLID = new Set(["flowers-yellow", "flowers-pink", "tall-grass", "fern", "seashell", "starfish", "stepping-stone",
  "rice-straw", "morning-glory", "lotus", "pier", "pier-plank"]);
export const isSolidProp = (kind: string) => !NOT_SOLID.has(kind) && (PROP_SIZE[kind]?.width ?? 0) >= TILE_PX / 2;
// ชิ้นที่แบนราบกับพื้น วาดใต้ตัวละครเสมอ (สะพาน, หินทางเดิน)
export const FLAT_PROPS = new Set(["pier", "pier-plank", "stepping-stone"]);

/** สะพานโค้ง: แถวที่เดินได้ + ข้อมูลคิดความโค้ง (docs/bridges.md) */
export interface ArchBridge { cx: number; left: number; right: number; row: number; width: number }

interface Layout {
  id: string; name?: string; width: number; height: number; tile: number; terrain: string[];
  props: LayoutProp[]; start: { x: number; y: number }; blocked?: number[][];
  entries?: { name: string; x: number; y: number }[];
  exits?: { to: string; label: string; entry?: string; x: number; y: number; w: number; h: number }[];
  npcs?: { npc: string; x: number; y: number }[];
  spawns?: { monster: string; count: number; x: number; y: number; w: number; h: number }[];
}
export type Zone = { x0: number; y0: number; x1: number; y1: number; count: number };
export type MapExit = { to: string; label: string; entry: string | null; x0: number; y0: number; x1: number; y1: number };

/** แมพหนึ่งแมพ: ตารางเดิน, ของประดับ, โซนมอน, ทางออก, จุดเข้า, NPC */
export class GameMap {
  readonly id: string;
  readonly name: string;
  readonly W: number;
  readonly H: number;
  readonly spawn: { x: number; y: number };
  readonly terrain: Uint8Array;
  readonly props: readonly MapProp[];
  readonly arches: readonly ArchBridge[];
  readonly zones: Record<string, Zone> = {};  // key = id มอนในเกม
  readonly exits: readonly MapExit[];
  readonly entries: Record<string, { x: number; y: number }> = {};
  readonly npcPos: Record<string, { x: number; y: number }> = {};
  private blocked: Uint8Array;
  private bridge: Uint8Array;

  constructor(L: Layout) {
    const cell = (v: number) => Math.floor(v / TILE_PX);
    this.id = L.id; this.name = L.name ?? L.id; this.W = L.width; this.H = L.height;
    this.spawn = { x: cell(L.start.x), y: cell(L.start.y) };
    for (const s of L.spawns ?? []) {
      const id = MOB_ID[s.monster] ?? s.monster;
      this.zones[id] = { x0: cell(s.x), y0: cell(s.y), x1: cell(s.x + s.w - 1), y1: cell(s.y + s.h - 1), count: s.count };
    }
    this.exits = (L.exits ?? []).map((e) => ({ to: e.to, label: e.label, entry: e.entry ?? null,
      x0: cell(e.x), y0: cell(e.y), x1: cell(e.x + e.w - 1), y1: cell(e.y + e.h - 1) }));
    for (const e of L.entries ?? []) this.entries[e.name] = { x: cell(e.x), y: cell(e.y) };
    for (const n of L.npcs ?? []) this.npcPos[n.npc] = { x: cell(n.x), y: cell(n.y) };
    const g = generate(L, this.spawn);
    this.terrain = g.T; this.props = g.props; this.arches = g.arches; this.blocked = g.blocked; this.bridge = g.bridge;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const i = y * this.W + x, t = this.terrain[i];
    return ((t !== WATER && t !== FOREST) || this.bridge[i] === 1) && !this.blocked[i];
  }
  inZone(zone: string, x: number, y: number): boolean {
    const z = this.zones[zone];
    return !!z && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  }
  exitAt(x: number, y: number): MapExit | undefined {
    return this.exits.find((e) => x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1);
  }
  /** จุดเกิดเมื่อวาปเข้ามาทางจุดเข้าชื่อนี้ (ไม่มี = จุดเกิดปกติ) ถ้าช่องนั้นเดินไม่ได้ หาช่องเดินได้ใกล้สุด */
  entryCell(name: string | null): { x: number; y: number } {
    const e = (name && this.entries[name]) || this.spawn;
    for (let r = 0; r < 6; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (this.isWalkable(e.x + dx, e.y + dy)) return { x: e.x + dx, y: e.y + dy };
    return this.spawn;
  }
  /** ความสูงที่ยกภาพตัวละครบนสะพานโค้ง (px) — แค่วาด ตำแหน่งจริงไม่เปลี่ยน
   *  t = min(1, |x - กึ่งกลาง| / (กว้าง × 0.37)), ยก = 16 × (1 - t²) */
  bridgeLift(px: number, py: number): number {
    const row = Math.floor(py / TILE_PX);
    for (const b of this.arches) {
      if (row !== b.row || px < b.left || px >= b.right) continue;
      const t = Math.min(1, Math.abs(px - b.cx) / (b.width * 0.37));
      return 16 * (1 - t * t);
    }
    return 0;
  }
}

function generate(L: Layout, SPAWN: { x: number; y: number }) {
  const MAP_W = L.width, MAP_H = L.height, LAYOUT = L;
  const T = new Uint8Array(MAP_W * MAP_H);
  LAYOUT.terrain.forEach((row, y) => { for (let x = 0; x < MAP_W; x++) T[y * MAP_W + x] = LETTER[row[x]] ?? GRASS; });

  const props: MapProp[] = LAYOUT.props.map((p) => {
    const kind = PROP_ALIAS[p.name] ?? p.name;
    return { kind, px: p.x, py: p.y, x: Math.floor(p.x / TILE_PX), y: Math.floor((p.y - 1) / TILE_PX), flip: !!p.flipX, solid: p.solid, deck: p.deck };
  });

  const blocked = new Uint8Array(MAP_W * MAP_H);
  const bridge = new Uint8Array(MAP_W * MAP_H);
  const arches: ArchBridge[] = [];
  const mark = (arr: Uint8Array, x: number, y: number) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) arr[y * MAP_W + x] = 1; };
  for (const p of props) {
    if (p.kind === "pier-plank") { // ท่าเรือแบบเก่า ชิ้นละ 40px ต่อกันแนวตั้ง: ทุกช่องที่ชิ้นทับเดินได้
      for (let y = Math.floor((p.py - 40) / TILE_PX); y <= p.y; y++) mark(bridge, p.x, y);
      continue;
    }
    if (ARCH_BRIDGES.has(p.kind)) {
      // สะพานโค้ง: แถวช่องใต้เส้นเท้า (ขอบบนของภาพ + 37 px) เดินได้ตลอดความกว้าง แม้เป็นช่องน้ำ
      const s = PROP_SIZE[`${p.kind}-back`];
      if (!s) continue;
      const left = p.px - s.width / 2, row = Math.floor((p.py - s.height + 37) / TILE_PX);
      for (let x = Math.floor(left / TILE_PX); x <= Math.floor((left + s.width - 1) / TILE_PX); x++) mark(bridge, x, row);
      arches.push({ cx: p.px, left, right: left + s.width, row, width: s.width });
      continue;
    }
    if (p.deck && p.kind !== "pier" && p.kind !== "pier-plank") {
      // พื้นไม้อื่นจาก Tiled (deck = true): ช่องที่กึ่งกลางอยู่ในภาพ (หักขอบ 8 px) เดินได้ ยังไม่มีภาพ = ไม่รู้ขนาด ข้าม
      const s = PROP_SIZE[p.kind];
      if (!s) continue;
      const x0 = p.px - s.width / 2 + 8, x1 = p.px + s.width / 2 - 8, y0 = p.py - s.height + 8;
      for (let y = Math.floor(y0 / TILE_PX); y <= Math.floor((p.py - 1) / TILE_PX); y++)
        for (let x = Math.floor(x0 / TILE_PX); x <= Math.floor((x1 - 1) / TILE_PX); x++) {
          const cx = x * TILE_PX + TILE_PX / 2, cy = y * TILE_PX + TILE_PX / 2;
          if (cx >= x0 && cx < x1 && cy >= y0 && cy < p.py) mark(bridge, x, y);
        }
      continue;
    }
    if (p.kind === "pier") {
      // ท่าเรือ: ทุกช่องใต้พื้น (ภาพกว้าง 72 ตัดราวข้างละ 12 px) นับช่องที่กึ่งกลางอยู่บนพื้น
      const s = PROP_SIZE.pier;
      const x0 = p.px - s.width / 2 + 12, x1 = p.px + s.width / 2 - 12, y0 = p.py - s.height;
      for (let y = Math.floor(y0 / TILE_PX); y <= Math.floor((p.py - 1) / TILE_PX); y++)
        for (let x = Math.floor(x0 / TILE_PX); x <= Math.floor((x1 - 1) / TILE_PX); x++) {
          const cx = x * TILE_PX + TILE_PX / 2, cy = y * TILE_PX + TILE_PX / 2;
          if (cx >= x0 && cx < x1 && cy >= y0 && cy < p.py) mark(bridge, x, y);
        }
      continue;
    }
    if (!(p.solid ?? isSolidProp(p.kind)) || !PROP_SIZE[p.kind]) continue;
    if (p.kind === "village-gate") { // ขวางเฉพาะเสาสองข้าง เดินผ่านช่องกลางได้
      mark(blocked, Math.floor((p.px - 34) / TILE_PX), p.y);
      mark(blocked, Math.floor((p.px + 33) / TILE_PX), p.y);
      continue;
    }
    // ฐาน = แถบล่างของภาพ กว้าง 70% ตรงกลาง สูง 1 ช่อง (ภาพกว้างเกิน 3 ช่อง ฐานสูง 2 ช่อง)
    const w = PROP_SIZE[p.kind].width, half = w * 0.35;
    const rows = w > TILE_PX * 3 ? 2 : 1;
    for (let y = p.y - rows + 1; y <= p.y; y++)
      for (let x = Math.floor((p.px - half) / TILE_PX); x <= Math.floor((p.px + half - 1) / TILE_PX); x++) mark(blocked, x, y);
  }

  // ช่องเดินไม่ได้ที่ระบายเองในเลเยอร์ block ของ Tiled
  for (const [x, y] of LAYOUT.blocked ?? []) mark(blocked, x, y);

  // ช่องที่เดินได้แต่ไปไม่ถึงจากจุดเกิด → กันไว้ ไม่ให้มอนเกิดในที่ปิดตาย
  const open = (i: number) => ((T[i] !== WATER && T[i] !== FOREST) || bridge[i]) && !blocked[i];
  const seen = new Uint8Array(MAP_W * MAP_H);
  const stack = [SPAWN.y * MAP_W + SPAWN.x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const n = ny * MAP_W + nx;
      if (!seen[n] && open(n)) { seen[n] = 1; stack.push(n); }
    }
  }
  for (let i = 0; i < T.length; i++) if (open(i) && !seen[i]) blocked[i] = 1;

  return { T, props, blocked, bridge, arches };
}

/** แมพทั้งหมด (id = ชื่อไฟล์) */
export const MAPS: Record<string, GameMap> = Object.fromEntries(
  [BAN_PAK_AO, THUNG_NA].map((L) => [L.id, new GameMap(L as unknown as Layout)]),
);
/** แมพเริ่มต้น (ตัวละครใหม่ / ข้อมูลแมพที่ไม่รู้จัก) */
export const DEFAULT_MAP = "ban-pak-ao";
export const getMap = (id: string | null | undefined): GameMap => MAPS[id ?? ""] ?? MAPS[DEFAULT_MAP];
