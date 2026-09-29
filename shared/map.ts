// แมพ "บ้านปากอ่าว" อ่านจาก layout ที่ผู้ใช้ออกแบบ: shared/data/maps/ban-pak-ao.json
//   terrain = ตัวอักษรต่อช่อง (G/S/W/D/P), props = ของประดับที่พิกัดพิกเซล (จุดยึดกึ่งกลางฐาน),
//   start = จุดเกิด, npcs = ตำแหน่ง NPC, spawns = กรอบเกิดมอน (พิกเซล) + จำนวน
// แก้แมพ = แก้ไฟล์ JSON นั้น (ห้ามวางของในโค้ด) ทั้ง client และ server ใช้ไฟล์เดียวกัน
import LAYOUT from "./data/maps/ban-pak-ao.json";

export const TILE_PX = LAYOUT.tile;
export const MAP_W = LAYOUT.width;
export const MAP_H = LAYOUT.height;
export const SPAWN = { x: Math.floor(LAYOUT.start.x / TILE_PX), y: Math.floor(LAYOUT.start.y / TILE_PX) };

// พื้น: รูปอยู่ที่ client/public/sprites/tiles/<ชื่อ>.png (64×64 ปูซ้ำ)
export const GRASS = 0;
export const WATER = 1; // เดินไม่ได้ (ยกเว้นช่องสะพาน)
export const SAND = 2;
export const DIRT = 3;
export const PADDY = 4;
export const TERRAIN_NAMES = ["grass", "water", "sand", "dirt", "paddy"] as const;
const LETTER: Record<string, number> = { G: GRASS, W: WATER, S: SAND, D: DIRT, P: PADDY };

// ชื่อมอนใน layout → id ในเกม (MOBS)
const MOB_ID: Record<string, string> = {
  "rice-crab": "mud_crab", "red-crab": "red_crab", "lotus-frog": "lotus_frog",
  grasshopper: "grasshopper", octopus: "octopus", scarecrow: "scarecrow",
};

/** โซนเกิดมอน (ช่อง) key = id มอนในเกม: มอนเกิดและเดินเล่นในกรอบนี้ ไล่ตามผู้เล่นออกนอกกรอบได้ */
export const ZONES: Record<string, { x0: number; y0: number; x1: number; y1: number; count: number }> = {};
for (const s of LAYOUT.spawns) {
  const id = MOB_ID[s.monster] ?? s.monster;
  ZONES[id] = {
    x0: Math.floor(s.x / TILE_PX), y0: Math.floor(s.y / TILE_PX),
    x1: Math.floor((s.x + s.w - 1) / TILE_PX), y1: Math.floor((s.y + s.h - 1) / TILE_PX), count: s.count,
  };
}
export const inZone = (zone: string, x: number, y: number) => {
  const z = ZONES[zone];
  return !!z && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
};

/** ตำแหน่ง NPC (ช่อง) จาก layout */
export const NPC_POS: Record<string, { x: number; y: number }> = Object.fromEntries(
  LAYOUT.npcs.map((n) => [n.npc, { x: Math.floor(n.x / TILE_PX), y: Math.floor(n.y / TILE_PX) }]),
);

/** ของประดับชิ้นหนึ่ง: px,py = จุดยึดกึ่งกลางฐาน (พิกเซล), x,y = ช่องที่ฐานอยู่ */
export interface MapProp {
  x: number;
  y: number;
  px: number;
  py: number;
  kind: string;
}

// ชุดของประดับ: ไฟล์เกมที่ client/public/sprites/props/<ชุด>/ (มี props.json ของแต่ละชุด)
export const PROP_SETS: Record<string, string[]> = {
  set1: ["flowers-yellow", "flowers-pink", "tall-grass", "fern", "bush", "rock", "rocks-3", "mossy-boulder",
    "seashell", "starfish", "driftwood", "coconut", "beach-grass", "rice-straw", "clay-jar", "lotus"],
  set2: ["banyan", "coconut-palm", "sugar-palm", "coconut-palm-leaning", "bamboo", "hibiscus-bush"], // ต้นไม้ใหญ่
  set3: ["stilt-house", "stilt-hut", "sala", "market-stall", "fish-rack", "village-gate", "pier", "longtail-boat", "dragon-jars"], // หมู่บ้าน
  set4: ["fence-wood", "fence-bamboo", "fence-corner", "fence-gate", "clothesline", "firewood", "well", "potted-plant",
    "bench", "quest-board", "lantern-post", "baskets", "barrel", "crate", "stepping-stone", "signpost"], // บ้านเรือน/ลานกลาง
  set5: ["net-rack", "net-pile", "fish-trap", "rowboat-upturned", "oars", "rope-coil", "buoys", "anchor",
    "scarecrow", "ox-cart", "field-hut", "water-wheel", "shore-rocks", "tide-pool", "hammock", "morning-glory"], // ท่าเรือ/นา/หาด
};
export const PROP_SET_OF: Record<string, string> = Object.fromEntries(
  Object.entries(PROP_SETS).flatMap(([set, kinds]) => kinds.map((k) => [k, set])),
);
// ชื่อใน layout ที่ต่างจากชื่อไฟล์
const PROP_ALIAS: Record<string, string> = { "lantern-pole": "lantern-post", "rattan-baskets": "baskets", "notice-board": "quest-board" };

/** ความกว้างฐานที่ขวางทาง (พิกเซล) ของชิ้นใหญ่ นอกนั้นขวางช่องเดียวตรงจุดยึด */
const FOOT_PX: Record<string, number> = {
  "stilt-house": 88, "stilt-hut": 64, sala: 72, "market-stall": 44, "ox-cart": 48, "field-hut": 44,
  "fish-rack": 48, "net-rack": 36, "rowboat-upturned": 40, "water-wheel": 40, banyan: 72, clothesline: 40,
};
// ชิ้นที่ขวางทาง นอกนั้นเดินผ่านได้
export const BLOCKING_PROPS = new Set([
  "bush", "rock", "rocks-3", "mossy-boulder", "clay-jar", ...PROP_SETS.set2,
  "stilt-house", "stilt-hut", "sala", "market-stall", "fish-rack", "village-gate", "dragon-jars",
  "fence-wood", "fence-bamboo", "fence-corner", "well", "clothesline", "firewood", "bench", "quest-board",
  "lantern-post", "barrel", "crate", "baskets", "signpost", "potted-plant",
  "net-rack", "rowboat-upturned", "scarecrow", "ox-cart", "field-hut", "water-wheel", "shore-rocks", "tide-pool", "hammock",
]);
// ชิ้นที่แบนราบกับพื้น วาดใต้ตัวละครเสมอ (สะพาน, หินทางเดิน)
export const FLAT_PROPS = new Set(["pier", "stepping-stone"]);

function generate() {
  const T = new Uint8Array(MAP_W * MAP_H);
  LAYOUT.terrain.forEach((row, y) => { for (let x = 0; x < MAP_W; x++) T[y * MAP_W + x] = LETTER[row[x]] ?? GRASS; });

  const props: MapProp[] = LAYOUT.props.map((p) => {
    const kind = PROP_ALIAS[p.name] ?? p.name;
    return { kind, px: p.x, py: p.y, x: Math.floor(p.x / TILE_PX), y: Math.floor((p.y - 1) / TILE_PX) };
  });

  const blocked = new Uint8Array(MAP_W * MAP_H);
  const bridge = new Uint8Array(MAP_W * MAP_H);
  const mark = (arr: Uint8Array, x: number, y: number) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) arr[y * MAP_W + x] = 1; };
  for (const p of props) {
    if (p.kind === "pier") { // สะพานชิ้นละ 40px ต่อกันแนวตั้ง: ทุกช่องที่ชิ้นทับเดินได้
      for (let y = Math.floor((p.py - 40) / TILE_PX); y <= p.y; y++) mark(bridge, p.x, y);
      continue;
    }
    if (!BLOCKING_PROPS.has(p.kind)) continue;
    if (p.kind === "village-gate") { // ขวางเฉพาะเสาสองข้าง เดินผ่านช่องกลางได้
      mark(blocked, Math.floor((p.px - 34) / TILE_PX), p.y);
      mark(blocked, Math.floor((p.px + 33) / TILE_PX), p.y);
      continue;
    }
    const half = (FOOT_PX[p.kind] ?? 0) / 2;
    for (let x = Math.floor((p.px - half) / TILE_PX); x <= Math.floor((p.px + half - 1) / TILE_PX); x++) mark(blocked, x, p.y);
  }

  // ช่องที่เดินได้แต่ไปไม่ถึงจากจุดเกิด → กันไว้ ไม่ให้มอนเกิดในที่ปิดตาย
  const open = (i: number) => (T[i] !== WATER || bridge[i]) && !blocked[i];
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

  return { T, props, blocked, bridge };
}

const GEN = generate();
export const TERRAIN = GEN.T;
export const PROPS: readonly MapProp[] = GEN.props;
const BLOCKED = GEN.blocked;
const BRIDGE = GEN.bridge;

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const i = y * MAP_W + x;
  return (TERRAIN[i] !== WATER || BRIDGE[i] === 1) && !BLOCKED[i];
}
