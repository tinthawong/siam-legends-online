// แมพ "บ้านปากอ่าว" จัดวางด้วยมือตามโซน (ตามภาพตัวอย่างของผู้ใช้ และหลักการจัดวางแมพใน CLAUDE.md)
//   เหนือ: ทางเข้าหมู่บ้าน (ประตูไม้ + พุ่มไม้ข้างประตู) ถนนดินลงมาถึงลานกลาง
//   ตะวันตก: ย่านบ้านเรือน (เรือนใต้ถุนสูง กระท่อม โอ่งมังกร บ่อน้ำ ราวตากผ้า รั้ว)
//   กลาง: ลานกลาง (ต้นไทร ศาลา แผงขายของ ป้ายประกาศ โคมไฟ) = จุดเกิด / เมืองหลัก
//   ตะวันออกเฉียงเหนือ: นาข้าว (ต้นตาลริมนา หุ่นไล่กา กังหันน้ำ เกวียน เถียงนา) ที่เกิดปูนา
//   ตะวันตกเฉียงใต้: ท่าเรือ (สะพานปลาเดินได้ เรือหางยาว ราวตากปลา แห อวน)
//   ตะวันออกเฉียงใต้: ชายหาด (มะพร้าว เปลญวน แอ่งน้ำ เปลือกหอย) ที่เกิดปูแดง
//   ใต้สุด: ทะเล (เดินไม่ได้ ยกเว้นสะพานปลา)
// ทั้ง client และ server ใช้ไฟล์นี้ร่วมกัน จึงได้แมพเดียวกันเสมอ
export const MAP_W = 48;
export const MAP_H = 36;
export const SPAWN = { x: 24, y: 16 };

// พื้น: รูปอยู่ที่ client/public/sprites/tiles/<ชื่อ>.png (64×64 ปูซ้ำ)
export const GRASS = 0;
export const WATER = 1; // เดินไม่ได้ (ยกเว้นช่องสะพาน)
export const SAND = 2;
export const DIRT = 3;
export const PADDY = 4;
export const TERRAIN_NAMES = ["grass", "water", "sand", "dirt", "paddy"] as const;

/** โซนที่เกิดมอน: มอนเกิดและเดินเล่นอยู่ในโซนของตัวเอง (ไล่ตามผู้เล่นออกนอกโซนได้) */
export const ZONES: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
  paddy: { x0: 33, y0: 1, x1: 44, y1: 11 },
  pond: { x0: 2, y0: 1, x1: 12, y1: 4 },   // สระบัวของหมู่บ้าน (กบบัว)
  beach: { x0: 29, y0: 22, x1: 46, y1: 27 },
};
export const inZone = (zone: string, x: number, y: number) => {
  const z = ZONES[zone];
  return !!z && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
};

/** ของประดับชิ้นหนึ่งในแมพ (kind = ชื่อไฟล์ใน art/props/<ชุด>/) */
export interface MapProp {
  x: number;
  y: number;
  kind: string;
  foot?: number[]; // ช่องที่ขวางทางในแถวฐาน (ระยะ x จากตัวชิ้น) — สิ่งก่อสร้างกว้างหลายช่อง / ประตูที่เว้นช่องกลาง
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

// ชิ้นที่ขวางทาง (เฉพาะช่องฐาน หรือตาม foot) นอกนั้นเดินผ่านได้
export const BLOCKING_PROPS = new Set([
  "bush", "rock", "rocks-3", "mossy-boulder", "clay-jar", ...PROP_SETS.set2,
  "stilt-house", "stilt-hut", "sala", "market-stall", "fish-rack", "village-gate", "dragon-jars",
  "fence-wood", "fence-bamboo", "fence-corner", "well", "clothesline", "firewood", "bench", "quest-board",
  "lantern-post", "barrel", "crate", "baskets", "signpost", "potted-plant",
  "net-rack", "rowboat-upturned", "scarecrow", "ox-cart", "field-hut", "water-wheel", "shore-rocks", "tide-pool", "hammock",
]);
// ชิ้นที่แบนราบกับพื้น วาดใต้ตัวละครเสมอ (สะพาน, หินทางเดิน)
export const FLAT_PROPS = new Set(["pier", "stepping-stone"]);

// ขอบทราย / ขอบทะเล เป็นคลื่นตามแนวนอน
const sandTop = (x: number) => 20 + Math.round(0.8 * Math.sin(x * 0.45) + 0.5 * Math.sin(x * 1.3));
const seaTop = (x: number) => 28 + Math.round(0.8 * Math.sin(x * 0.6 + 1) + 0.4 * Math.sin(x * 1.7));
const PIER_X = 11;

function generate() {
  const T = new Uint8Array(MAP_W * MAP_H);
  const at = (x: number, y: number) => T[y * MAP_W + x];
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number, only?: number[]) => {
    for (let y = Math.max(0, y0); y <= Math.min(MAP_H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(MAP_W - 1, x1); x++)
        if (!only || only.includes(at(x, y))) T[y * MAP_W + x] = v;
  };

  // ชั้นพื้น
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) T[y * MAP_W + x] = y >= seaTop(x) ? WATER : y >= sandTop(x) ? SAND : GRASS;
  rect(33, 0, 44, 11, PADDY);                         // นาข้าว
  // สระบัวของหมู่บ้าน (ย่านบ้านเรือน) — วงรีเล็ก
  for (let y = 1; y <= 4; y++)
    for (let x = 3; x <= 11; x++) if (((x - 7) / 3.2) ** 2 + ((y - 2.6) / 1.4) ** 2 <= 1) T[y * MAP_W + x] = WATER;
  // ลานดินเป็นวงรี (ไม่ใช่สี่เหลี่ยม) ให้ขอบดูเป็นธรรมชาติ
  const blob = (cx: number, cy: number, rx: number, ry: number, only?: number[]) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) rect(x, y, x, y, DIRT, only);
  };
  rect(24, 0, 27, 11, DIRT);                          // ถนนจากทางเข้า
  blob(22, 15, 8.5, 4);                               // ลานกลาง
  blob(36, 14, 4.5, 2, [GRASS]);                      // ลานข้างนา (เกวียน)
  rect(22, 18, 25, 20, DIRT, [GRASS, SAND]);          // ทางลงหาด ค่อย ๆ แคบลง
  rect(23, 21, 24, 22, DIRT, [GRASS, SAND]);

  // ของประดับ (x, y = ช่องฐาน)
  const props: MapProp[] = [];
  const bridge = new Uint8Array(MAP_W * MAP_H);
  const P = (x: number, y: number, kind: string, foot?: number[]) => props.push({ x, y, kind, foot });

  // กรอบแมพ: ไผ่/พุ่มไม้ตามขอบตะวันตก เหนือ ตะวันออก (เว้นถนนทางเข้า) มะพร้าวตรงมุมหาด
  for (let y = 0; y < sandTop(0); y++) P(0, y, y % 4 === 1 ? "bamboo" : "bush");
  for (let y = 0; y < sandTop(MAP_W - 1); y++) P(MAP_W - 1, y, y % 5 === 2 ? "bamboo" : "bush");
  for (let x = 1; x < MAP_W - 1; x++) if (x < 23 || x > 28) P(x, 0, x % 6 === 3 ? "bamboo" : "bush");
  for (let y = sandTop(0); y < seaTop(0); y++) P(0, y, "coconut-palm-leaning");
  for (let y = sandTop(MAP_W - 1); y < seaTop(MAP_W - 1); y++) P(MAP_W - 1, y, "coconut-palm");

  // ── ทางเข้าหมู่บ้าน (เหนือ) ──
  P(26, 3, "village-gate", [-1, 1]); // ขวางเฉพาะเสา เดินผ่านช่องกลาง
  P(24, 3, "bush"); P(28, 3, "bush"); P(23, 3, "bush"); P(29, 3, "bush");
  P(22, 4, "fern"); P(30, 4, "flowers-yellow");

  // ── สระบัว ──
  P(5, 2, "lotus"); P(8, 3, "lotus"); P(9, 2, "lotus");
  P(11, 1, "tall-grass"); P(2, 3, "fern"); P(12, 3, "flowers-pink");
  // ── ย่านบ้านเรือน (ตะวันตก) ──
  P(4, 7, "stilt-house", [-1, 0, 1]);
  P(8, 7, "dragon-jars");
  P(9, 5, "potted-plant");
  P(2, 8, "flowers-pink"); P(6, 8, "potted-plant");
  P(12, 6, "fence-corner"); P(13, 6, "fence-wood");
  P(2, 11, "well");
  P(7, 10, "clothesline");
  P(10, 14, "stilt-hut", [-1, 0, 1]);
  P(14, 13, "firewood");
  P(8, 12, "flowers-yellow"); P(12, 12, "tall-grass");
  for (let x = 1; x <= 7; x++) P(x, 17, x === 5 ? "fence-gate" : "fence-wood"); // รั้วกั้นย่านบ้านกับท่าเรือ (ประตูรั้วเดินผ่านได้)
  // กลุ่มไผ่ + พุ่ม + หิน ทางเหนือของย่านบ้าน
  P(15, 3, "bamboo"); P(16, 4, "bush"); P(17, 4, "rock"); P(14, 4, "fern"); P(18, 3, "tall-grass");

  // ── ลานกลาง (จุดเกิด) ──
  P(18, 11, "banyan", [-1, 0, 1]);
  P(19, 13, "bench");
  P(22, 13, "quest-board");
  P(23, 9, "lantern-post"); P(28, 13, "lantern-post");
  P(28, 9, "signpost");
  P(29, 16, "sala", [-1, 0, 1]);
  P(22, 18, "market-stall", [-1, 0, 1]);
  P(19, 18, "crate"); P(20, 18, "barrel"); P(25, 18, "baskets");
  P(21, 15, "stepping-stone"); P(26, 15, "stepping-stone"); P(16, 15, "stepping-stone");
  P(15, 10, "tall-grass"); P(21, 10, "fern"); P(16, 11, "flowers-pink");

  // ── กลุ่มหิน/พุ่มไม้ ระหว่างถนนกับนา ──
  P(30, 6, "mossy-boulder"); P(31, 7, "bush"); P(29, 7, "flowers-yellow"); P(31, 4, "rocks-3");

  // ── นาข้าว (ตะวันออกเฉียงเหนือ) ──
  P(32, 2, "sugar-palm"); P(32, 10, "sugar-palm"); P(46, 3, "sugar-palm"); P(46, 10, "sugar-palm");
  P(38, 6, "scarecrow");
  P(41, 12, "water-wheel");
  P(34, 14, "ox-cart", [-1, 0, 1]);
  P(44, 15, "field-hut", [-1, 0, 1]);
  P(36, 14, "rice-straw"); P(38, 13, "rice-straw"); P(33, 12, "rice-straw");

  // ── ท่าเรือ (ตะวันตกเฉียงใต้) ──
  P(2, 21, "net-rack"); P(6, 21, "fish-rack", [-1, 0, 1]);
  P(8, 24, "net-pile"); P(14, 22, "fish-trap"); P(17, 24, "rowboat-upturned", [-1, 0, 1]);
  P(15, 24, "oars"); P(13, 25, "rope-coil"); P(8, 26, "buoys"); P(5, 26, "anchor"); P(3, 25, "coconut-palm-leaning");
  for (let y = seaTop(PIER_X) - 1; y < MAP_H; y++) { P(PIER_X, y, "pier"); bridge[y * MAP_W + PIER_X] = 1; } // สะพานปลายื่นลงทะเล (เดินได้)
  P(15, 31, "longtail-boat");

  // ── ชายหาด (ตะวันออกเฉียงใต้) ──
  P(35, 24, "coconut-palm"); P(44, 22, "coconut-palm"); P(30, 23, "coconut-palm");
  P(32, 22, "morning-glory"); P(46, 21, "morning-glory"); P(31, 21, "beach-grass");
  P(39, 23, "hammock");
  P(36, 24, "coconut"); P(38, 26, "driftwood"); P(33, 27, "seashell"); P(41, 27, "starfish"); P(45, 26, "seashell");
  P(28, 27, "tide-pool"); P(46, 27, "shore-rocks");

  // ช่องที่ขวางทาง
  const blocked = new Uint8Array(MAP_W * MAP_H);
  for (const p of props)
    for (const dx of p.foot ?? (BLOCKING_PROPS.has(p.kind) ? [0] : []))
      if (p.x + dx >= 0 && p.x + dx < MAP_W) blocked[p.y * MAP_W + p.x + dx] = 1;

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
