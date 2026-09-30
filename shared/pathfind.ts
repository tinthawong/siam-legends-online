import type { GameMap } from "./map";
import { DIAG, cheb } from "./constants";

export interface Cell { x: number; y: number }

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number) {
    const { k, p } = this;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= pri) break;
      k[i] = k[par]; p[i] = p[par]; i = par;
    }
    k[i] = key; p[i] = pri;
  }
  pop(): number {
    const { k, p } = this;
    const top = k[0];
    const lk = k.pop()!, lp = p.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && p[r] < p[l] ? r : l;
        if (p[c] >= lp) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}

const octile = (dx: number, dy: number) => {
  const a = Math.abs(dx), b = Math.abs(dy);
  return Math.max(a, b) + (DIAG - 1) * Math.min(a, b);
};

/** A* 8 ทิศ ห้ามตัดมุม — คืนเส้นทางที่ไม่รวมช่องเริ่มต้น หรือ null ถ้าไปไม่ได้ */
export function findPath(
  m: GameMap,
  sx: number, sy: number,
  isGoal: (x: number, y: number) => boolean,
  h: (x: number, y: number) => number,
  maxNodes = 6000,
): Cell[] | null {
  if (isGoal(sx, sy)) return [];
  const MAP_W = m.W;
  const isWalkable = (x: number, y: number) => m.isWalkable(x, y);
  const start = sy * MAP_W + sx;
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(start, h(sx, sy));
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    if (isGoal(cx, cy)) {
      const path: Cell[] = [];
      for (let n = cur; n !== start; n = came.get(n)!) path.push({ x: n % MAP_W, y: (n / MAP_W) | 0 });
      return path.reverse();
    }
    if (++expanded > maxNodes) return null;
    const cg = g.get(cur)!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!isWalkable(nx, ny)) continue;
      if (dx && dy && (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy))) continue;
      const ni = ny * MAP_W + nx;
      if (closed.has(ni)) continue;
      const ng = cg + (dx && dy ? DIAG : 1);
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, cur);
        open.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}

/** เดินไปช่องที่ระบุพอดี */
export function pathTo(m: GameMap, sx: number, sy: number, tx: number, ty: number): Cell[] | null {
  if (!m.isWalkable(tx, ty)) return null;
  return findPath(m, sx, sy, (x, y) => x === tx && y === ty, (x, y) => octile(x - tx, y - ty));
}

/** เดินไปให้อยู่ในระยะ range ช่องของเป้าหมาย (ใช้ตอนไล่ตีมอน) */
export function pathNear(m: GameMap, sx: number, sy: number, tx: number, ty: number, range: number): Cell[] | null {
  return findPath(
    m, sx, sy,
    (x, y) => cheb(x, y, tx, ty) <= range,
    (x, y) => Math.max(0, cheb(x, y, tx, ty) - range),
  );
}
