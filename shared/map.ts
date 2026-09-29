// แมพ "ทุ่งนาริมคลอง" สร้างจาก seed ตายตัว ทั้ง client และ server จึงได้แมพเดียวกันเสมอ
// ชั้นพื้น (TERRAIN) + ของประดับ (PROPS) บางชิ้นขวางทาง (BLOCKING_PROPS)
// (ภายหลังเปลี่ยนเป็นโหลด JSON จาก Tiled ได้ โดยให้ export TERRAIN / PROPS / isWalkable แบบเดิม)
export const MAP_W = 48;
export const MAP_H = 36;
export const SPAWN = { x: 6, y: 6 };

// พื้น: รูปอยู่ที่ client/public/sprites/tiles/<ชื่อ>.png (64×64 ปูซ้ำ)
export const GRASS = 0;
export const WATER = 1; // เดินไม่ได้
export const SAND = 2;
export const DIRT = 3;
export const PADDY = 4;
export const TERRAIN_NAMES = ["grass", "water", "sand", "dirt", "paddy"] as const;

/** ของประดับชิ้นหนึ่งในแมพ (kind = ชื่อไฟล์ใน art/props/<ชุด>/) */
export interface MapProp {
  x: number;
  y: number;
  kind: string;
}

// ชุดของประดับ: ไฟล์เกมที่ client/public/sprites/props/<ชุด>/ (มี props.json ของแต่ละชุด)
export const PROP_SETS: Record<string, string[]> = {
  set1: ["flowers-yellow", "flowers-pink", "tall-grass", "fern", "bush", "rock", "rocks-3", "mossy-boulder",
    "seashell", "starfish", "driftwood", "coconut", "beach-grass", "rice-straw", "clay-jar", "lotus"],
  set2: ["banyan", "coconut-palm", "sugar-palm", "coconut-palm-leaning", "bamboo", "hibiscus-bush"], // ต้นไม้ใหญ่
};
export const PROP_SET_OF: Record<string, string> = Object.fromEntries(
  Object.entries(PROP_SETS).flatMap(([set, kinds]) => kinds.map((k) => [k, set])),
);

// ชิ้นที่ขวางทาง (เดินทะลุไม่ได้ เฉพาะช่องฐาน) นอกนั้นเป็นของประดับเดินผ่านได้
export const BLOCKING_PROPS = new Set(["bush", "rock", "rocks-3", "mossy-boulder", "clay-jar", ...PROP_SETS.set2]);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** แนวกลางคลองในแถว y (คลองคดไปมา) */
const canalX = (y: number) => Math.round(26 + 3 * Math.sin(y * 0.2) + Math.sin(y * 0.5 + 1)); // เลื่อนไม่เกิน ~1 ช่องต่อแถว ขอบจึงไม่เป็นขั้นบันได
const FORDS = [9, 26]; // แถวที่มีทางข้ามทราย (กว้าง 2 แถว)

function generate() {
  const T = new Uint8Array(MAP_W * MAP_H); // GRASS
  const at = (x: number, y: number) => T[y * MAP_W + x];
  const put = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) T[y * MAP_W + x] = v;
  };
  const rng = mulberry32(20260929);

  // คลอง + ทรายริมตลิ่ง
  for (let y = 0; y < MAP_H; y++) {
    const cx = canalX(y);
    for (let x = cx - 2; x <= cx + 2; x++) put(x, y, Math.abs(x - cx) <= 1 ? WATER : SAND);
  }
  // ทางข้ามทราย
  for (const fy of FORDS)
    for (let y = fy; y <= fy + 1; y++) {
      const cx = canalX(y);
      for (let x = cx - 2; x <= cx + 2; x++) put(x, y, SAND);
    }

  // นาข้าว: แปลง 5×4 มีคันนา (ดิน) คั่น ฝั่งตะวันออกของคลอง และมุมตะวันตกเฉียงใต้
  const paddyArea = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (at(x, y) !== GRASS) continue;
        const path = (x - x0) % 6 === 5 || (y - y0) % 5 === 4;
        put(x, y, path ? DIRT : PADDY);
      }
  };
  paddyArea(33, 3, MAP_W - 4, 20);
  paddyArea(33, 24, MAP_W - 4, MAP_H - 4);
  paddyArea(4, 21, 17, MAP_H - 4);

  // ถนนดินจากจุดเกิดไปทางข้ามทรายด้านบน แล้วต่อเข้านาฝั่งตะวันออก
  for (let x = 3; x < MAP_W - 3; x++)
    for (const y of [FORDS[0], FORDS[0] + 1]) if (at(x, y) === GRASS || at(x, y) === PADDY) put(x, y, DIRT);
  for (let y = SPAWN.y - 1; y <= FORDS[0]; y++) put(SPAWN.x, y, DIRT);
  // ทางลงไปทางข้ามด้านล่าง
  for (let y = FORDS[0]; y <= FORDS[1] + 1; y++) if (at(12, y) === GRASS) put(12, y, DIRT);
  for (let x = 12; x < MAP_W - 3; x++)
    for (const y of [FORDS[1], FORDS[1] + 1]) if (at(x, y) === GRASS || at(x, y) === PADDY) put(x, y, DIRT);

  // ของประดับ
  const props: MapProp[] = [];
  const taken = new Uint8Array(MAP_W * MAP_H);
  const place = (x: number, y: number, kind: string) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || taken[y * MAP_W + x]) return false;
    taken[y * MAP_W + x] = 1;
    props.push({ x, y, kind });
    return true;
  };
  const nearSpawn = (x: number, y: number) => Math.abs(x - SPAWN.x) <= 2 && Math.abs(y - SPAWN.y) <= 2;
  const onFord = (y: number) => FORDS.some((f) => y === f || y === f + 1);

  // ขอบแมพเป็นพุ่มไม้ (ยกเว้นตรงน้ำ ให้คลองไหลออกขอบ)
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if ((x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) && at(x, y) !== WATER) place(x, y, "bush");

  // space = ต้องไม่มีของอื่นในระยะกี่ช่อง (ต้นไม้ใหญ่ต้องการที่ว่างรอบ ๆ ไม่ให้ภาพทับกัน)
  const clear = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && taken[ny * MAP_W + nx]) return false;
      }
    return true;
  };
  const scatter = (count: number, kinds: string[], on: number[], ok: (x: number, y: number) => boolean = () => true, space = 0) => {
    let n = 0;
    for (let tries = 0; n < count && tries < count * 60; tries++) {
      const x = 1 + Math.floor(rng() * (MAP_W - 2));
      const y = 1 + Math.floor(rng() * (MAP_H - 2));
      if (!on.includes(at(x, y)) || nearSpawn(x, y) || !ok(x, y) || !clear(x, y, space)) continue;
      if (place(x, y, kinds[Math.floor(rng() * kinds.length)])) n++;
    }
  };
  // ต้นไม้ใหญ่ก่อน (ต้องการที่ว่างรอบตัว) แล้วค่อยโรยของเล็ก
  const nearTerrain = (x: number, y: number, kind: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(Math.min(MAP_W - 1, Math.max(0, x + dx)), Math.min(MAP_H - 1, Math.max(0, y + dy))) === kind) return true;
    return false;
  };
  const inner = (x: number, y: number) => x > 2 && y > 3 && x < MAP_W - 3 && y < MAP_H - 2;
  scatter(3, ["banyan"], [GRASS], (x, y) => inner(x, y) && !nearTerrain(x, y, DIRT, 1), 3);
  scatter(10, ["coconut-palm", "coconut-palm-leaning"], [SAND], (x, y) => !onFord(y) && y > 2, 2);
  scatter(7, ["sugar-palm"], [GRASS], (x, y) => y > 2 && nearTerrain(x, y, PADDY, 2), 2);
  scatter(5, ["bamboo"], [GRASS], (x, y) => inner(x, y), 2);
  scatter(7, ["hibiscus-bush"], [GRASS], (x, y) => y > 1, 1);
  place(SPAWN.x + 2, SPAWN.y - 2, "clay-jar");
  place(SPAWN.x - 2, SPAWN.y - 2, "clay-jar");
  scatter(7, ["mossy-boulder"], [GRASS]);
  scatter(10, ["rock", "rocks-3"], [GRASS, SAND], (x, y) => !onFord(y));
  scatter(12, ["bush"], [GRASS]);
  scatter(45, ["flowers-yellow", "flowers-pink"], [GRASS]);
  scatter(35, ["tall-grass", "fern"], [GRASS]);
  scatter(9, ["lotus"], [WATER]);
  scatter(14, ["seashell", "starfish", "driftwood", "coconut", "beach-grass"], [SAND], (x, y) => !onFord(y));
  scatter(10, ["rice-straw"], [DIRT]);

  // ช่องที่เดินได้แต่ไปไม่ถึงจากจุดเกิด → กันไว้ ไม่ให้มอนเกิดในที่ปิดตาย
  const blocked = new Uint8Array(MAP_W * MAP_H);
  for (const p of props) if (BLOCKING_PROPS.has(p.kind)) blocked[p.y * MAP_W + p.x] = 1;
  const open = (i: number) => T[i] !== WATER && !blocked[i];
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

  return { T, props, blocked };
}

const GEN = generate();
export const TERRAIN = GEN.T;
export const PROPS: readonly MapProp[] = GEN.props;
const BLOCKED = GEN.blocked;

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const i = y * MAP_W + x;
  return TERRAIN[i] !== WATER && !BLOCKED[i];
}
