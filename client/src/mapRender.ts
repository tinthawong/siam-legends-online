// วาดพื้นแมพทั้งแผ่นเป็นภาพเดียว (ครั้งเดียวตอนเข้าเกม)
// - ลายพื้น 64×64 ปูซ้ำตามพิกัดโลก (ไม่ย่อ/ขยาย)
// - ขอบระหว่างพื้นต่างชนิดโค้งด้วย noise (เฉพาะภาพ ช่องเดินได้/ไม่ได้ยังเป็นตารางเดิม)
// - ทรายริมน้ำเข้มขึ้น, ฟองคลื่นสีขาวที่ขอบน้ำ, เส้นหญ้าเข้ม 1px ที่ขอบหญ้า
import { MAP_W, MAP_H, TERRAIN, GRASS, WATER, SAND, FOREST, TERRAIN_NAMES } from "../../shared/map";
import { TILE } from "../../shared/constants";

const TEX = 64;       // ขนาดลายพื้น
const WARP = 9;       // ขอบโค้งได้มากสุดกี่พิกเซล
const WARP_SCALE = 20; // ความถี่ของความโค้ง (พิกเซลต่อคลื่น)

/** value noise แบบเรียบ ค่า -1..1 (ตายตัวตามพิกัด) */
function noise2(x: number, y: number, seed: number): number {
  const h = (ix: number, iy: number) => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1;
  };
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** ระยะแบบ chamfer (3-4) จากพิกเซลที่ src[i] = true */
function distance(src: (i: number) => boolean, W: number, H: number): Uint16Array {
  const INF = 60000;
  const d = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = src(i) ? 0 : INF;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 3);
        if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
      }
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 3);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
      }
      d[i] = v;
    }
  return d;
}

/** tiles[ชนิดพื้น] = รูปลายพื้น 64×64 → คืน canvas ขนาดแมพทั้งแผ่น */
export function renderGround(tiles: HTMLImageElement[]): HTMLCanvasElement {
  const W = MAP_W * TILE, H = MAP_H * TILE;

  // พิกเซลของลายพื้นแต่ละชนิด
  const pix = tiles.map((img) => {
    const c = document.createElement("canvas");
    c.width = TEX; c.height = TEX;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, TEX, TEX).data;
  });

  // ชนิดพื้นของแต่ละพิกเซล โดยเยื้องตำแหน่งที่อ่านด้วย noise ให้ขอบโค้ง
  const kind = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ox = noise2(x / WARP_SCALE, y / WARP_SCALE, 1) * WARP;
      const oy = noise2(x / WARP_SCALE, y / WARP_SCALE, 2) * WARP;
      const tx = Math.min(MAP_W - 1, Math.max(0, Math.floor((x + ox) / TILE)));
      const ty = Math.min(MAP_H - 1, Math.max(0, Math.floor((y + oy) / TILE)));
      const t = TERRAIN[ty * MAP_W + tx];
      kind[y * W + x] = t === FOREST ? GRASS : t; // ใต้ป่าวาดเป็นหญ้า
    }

  const toWater = distance((i) => kind[i] === WATER, W, H); // ระยะถึงน้ำ (×3 ต่อพิกเซล)
  const toLand = distance((i) => kind[i] !== WATER, W, H);  // ระยะถึงฝั่ง

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const out = ctx.createImageData(W, H);
  const o = out.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = kind[i];
      const s = ((y % TEX) * TEX + (x % TEX)) * 4;
      let r = pix[k][s], g = pix[k][s + 1], b = pix[k][s + 2];

      if (k === SAND) {
        // ทรายเปียกริมน้ำ: เข้มขึ้นเมื่อใกล้น้ำ (ภายใน ~6px)
        const d = toWater[i] / 3;
        if (d < 6) { const f = 0.72 + 0.28 * (d / 6); r *= f; g *= f; b *= f * 0.95; }
      } else if (k === WATER) {
        // ฟองคลื่นสีขาวตามขอบน้ำ ขาด ๆ หาย ๆ ตาม noise
        const d = toLand[i] / 3;
        const foam = noise2(x / 5, y / 5, 7);
        if (d <= 1.5 || (d <= 3 && foam > 0.1)) { const f = d <= 1.5 ? 0.75 : 0.45; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
      } else if (k === GRASS) {
        // เส้นหญ้าเข้ม 1px ตรงขอบที่ติดพื้นชนิดอื่น
        const edge =
          (x > 0 && kind[i - 1] !== GRASS) || (x < W - 1 && kind[i + 1] !== GRASS) ||
          (y > 0 && kind[i - W] !== GRASS) || (y < H - 1 && kind[i + W] !== GRASS);
        if (edge) { r *= 0.55; g *= 0.62; b *= 0.5; }
      }
      o[i * 4] = r; o[i * 4 + 1] = g; o[i * 4 + 2] = b; o[i * 4 + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return cv;
}

export const TILE_URLS = TERRAIN_NAMES.map((n) => `sprites/tiles/${n}.png`);
