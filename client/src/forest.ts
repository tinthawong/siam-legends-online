// ต้นไม้ในช่องป่า (พื้น F ใน layout) ตาม docs/map-system.md
// - ช่องละ 2 ต้น ตำแหน่งสุ่มในช่องจากพิกัดช่อง (หน้าตาเหมือนเดิมทุกครั้ง) พลิกซ้าย-ขวาสุ่มครึ่งหนึ่ง
// - ต้นในช่องป่าที่ไม่ติดช่องเดินได้ → วาดรวมกับภาพพื้น (sprite: false)
// - ต้นริมป่า (ติดช่องเดินได้) → วาดเป็น sprite แยก เรียงความลึกตาม y (sprite: true)
// - ช่องป่าที่ด้านบนเป็นช่องเดินได้ ใช้พุ่มเตี้ย ไม่ให้ต้นไม้บังตัวละครที่ยืนอยู่เหนือป่าเกินครึ่งตัว
import { FOREST, TILE_PX, type GameMap } from "../../shared/map";

const TREES = ["mango-tree", "jackfruit-tree", "tamarind-tree", "rain-tree", "round-tree", "tall-forest-tree", "indian-almond"];
const FLOWERING = ["flame-tree", "golden-shower"]; // ราว 12%
const LOW = ["dense-shrub", "shrub-cluster"];
export const FOREST_KINDS = [...TREES, ...FLOWERING, ...LOW];

export interface ForestTree { x: number; y: number; kind: string; flip: boolean; sprite: boolean }

function hash(x: number, y: number, k: number): number {
  let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(k, 83492791);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function forestTrees(m: GameMap): ForestTree[] {
  const MAP_W = m.W, MAP_H = m.H, TERRAIN = m.terrain;
  const isWalkable = (x: number, y: number) => m.isWalkable(x, y);
  const out: ForestTree[] = [];
  const isForest = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && TERRAIN[y * MAP_W + x] === FOREST;
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isForest(tx, ty)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isWalkable(tx + dx, ty + dy)) edge = true;
      const walkAbove = isWalkable(tx, ty - 1);
      for (let k = 0; k < 2; k++) {
        const r = hash(tx, ty, k);
        const list = walkAbove ? LOW : hash(tx, ty, k + 7) < 0.12 ? FLOWERING : TREES;
        out.push({
          kind: list[Math.floor(r * list.length)],
          x: tx * TILE_PX + 4 + Math.floor(hash(tx, ty, k + 3) * 24),
          y: ty * TILE_PX + 14 + Math.floor(hash(tx, ty, k + 5) * 17),
          flip: hash(tx, ty, k + 11) < 0.5,
          sprite: edge,
        });
      }
    }
  return out.sort((a, b) => a.y - b.y);
}
