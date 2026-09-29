// แมพสร้างจาก seed ตายตัว ทั้ง client และ server จึงได้แมพเดียวกันเสมอ
// (ภายหลังเปลี่ยนเป็นโหลด JSON จาก Tiled ได้ โดยให้ export TILES / isWalkable แบบเดิม)
export const MAP_W = 48;
export const MAP_H = 36;
export const GRASS = 0;
export const ROCK = 1;
export const TREE = 2;
export const SPAWN = { x: 6, y: 6 };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(): Uint8Array {
  const t = new Uint8Array(MAP_W * MAP_H);
  const rng = mulberry32(20260929);
  const set = (x: number, y: number, v: number) => {
    if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) t[y * MAP_W + x] = v;
  };

  // ขอบแมพเป็นต้นไม้
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) t[y * MAP_W + x] = TREE;

  // กลุ่มหิน/ต้นไม้กระจาย
  for (let i = 0; i < 90; i++) {
    const cx = 1 + Math.floor(rng() * (MAP_W - 2));
    const cy = 1 + Math.floor(rng() * (MAP_H - 2));
    const kind = rng() < 0.45 ? ROCK : TREE;
    const r = rng() < 0.6 ? 0 : 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (rng() < 0.8) set(cx + dx, cy + dy, kind);
  }

  // เคลียร์จุดเกิด
  for (let y = SPAWN.y - 3; y <= SPAWN.y + 3; y++)
    for (let x = SPAWN.x - 3; x <= SPAWN.x + 3; x++) set(x, y, GRASS);

  // ช่องหญ้าที่เดินไปไม่ถึงจากจุดเกิด เปลี่ยนเป็นหิน (กันมอนเกิดในที่ปิดตาย)
  const seen = new Uint8Array(MAP_W * MAP_H);
  const stack = [SPAWN.y * MAP_W + SPAWN.x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * MAP_W + (x + dx);
      if (!seen[n] && t[n] === GRASS) { seen[n] = 1; stack.push(n); }
    }
  }
  for (let i = 0; i < t.length; i++) if (t[i] === GRASS && !seen[i]) t[i] = ROCK;
  return t;
}

export const TILES = generate();

export function isWalkable(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && TILES[y * MAP_W + x] === GRASS;
}
