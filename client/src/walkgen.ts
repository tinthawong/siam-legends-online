// ท่าเดินผู้เล่นทำด้วยโค้ด (ไม่ใช้ท่าเดินจาก PixelLab): สร้าง 4 เฟรมจากภาพยืนนิ่ง 48×48 ครั้งเดียวตอนโหลด
// ขา = พิกเซลตั้งแต่แถว LEG_ROW ลงไป แบ่งซ้าย/ขวาที่คอลัมน์ว่างตรงกลาง (ไม่มี = กึ่งกลางความกว้างขา)
// เฟรม 1 ภาพเดิม | 2 ยกขาซ้าย 1 px | 3 ภาพเดิม | 4 ยกขาขวา 1 px   (ซ้าย/ขวา = ฝั่งซ้าย/ขวาของภาพ)

export const LEG_ROW = 40;
export const WALK_FRAME_MS = 160;
const LIFTS: [number, number][] = [[0, 0], [1, 0], [0, 0], [0, 1]]; // [ขาซ้าย, ขาขวา] ยกขึ้นกี่ px

/** ตำแหน่งเท้าในเฟรม (พิกัดภาพ 48×48): x = กึ่งกลางขา, y = แถวล่างสุดของขาหลังยก, lift = ยกขึ้นกี่ px */
export interface Foot { x: number; y: number; lift: number }
export interface WalkFrame { canvas: HTMLCanvasElement; left: Foot; right: Foot }

export function makeWalkFrames(still: HTMLCanvasElement): WalkFrame[] {
  const w = still.width, h = still.height;
  const px = still.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const solid = (x: number, y: number) => px.data[(y * w + x) * 4 + 3] > 0;

  // คอลัมน์ที่มีขา (แถว LEG_ROW ลงไป)
  const cols: boolean[] = [];
  for (let x = 0; x < w; x++) {
    cols[x] = false;
    for (let y = LEG_ROW; y < h; y++) if (solid(x, y)) { cols[x] = true; break; }
  }
  const minX = cols.indexOf(true), maxX = cols.lastIndexOf(true);
  // จุดแบ่ง: คอลัมน์ว่างระหว่างขาที่ใกล้กึ่งกลางที่สุด → ขาซ้าย = x < split
  const mid = (minX + maxX + 1) / 2;
  let split = Math.round(mid);
  let best = Infinity;
  for (let x = minX + 1; x < maxX; x++) {
    if (!cols[x] && Math.abs(x + 0.5 - mid) < best) { best = Math.abs(x + 0.5 - mid); split = x; }
  }

  const foot = (x0: number, x1: number, lift: number): Foot => {
    let fx0 = Infinity, fx1 = -Infinity, fy = -1;
    for (let x = x0; x < x1; x++) for (let y = LEG_ROW; y < h; y++) {
      if (!solid(x, y)) continue;
      fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy = Math.max(fy, y);
    }
    return fy < 0 ? { x: (x0 + x1) / 2, y: h - 1 - lift, lift } : { x: (fx0 + fx1 + 1) / 2, y: fy - lift, lift };
  };

  return LIFTS.map(([liftL, liftR]) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(still, 0, 0);
    // ยก = เลื่อนพิกเซลขาข้างนั้น (แถว LEG_ROW ลงไป) ขึ้นทั้งก้อน แถวล่างสุดที่ว่างปล่อยโปร่งใส
    const lift = (x0: number, x1: number, n: number) => {
      if (!n || x1 <= x0) return;
      ctx.clearRect(x0, LEG_ROW, x1 - x0, h - LEG_ROW); // ตัวเหนือแถว LEG_ROW คงเดิม ขาที่ยกวาดทับ
      ctx.drawImage(still, x0, LEG_ROW, x1 - x0, h - LEG_ROW, x0, LEG_ROW - n, x1 - x0, h - LEG_ROW);
    };
    lift(0, split, liftL);
    lift(split, w, liftR);
    return { canvas: cv, left: foot(0, split, liftL), right: foot(split, w, liftR) };
  });
}

/** ภาพกลับซ้าย-ขวา (ทิศซ้าย 3 ทิศ: กลับภาพก่อนแล้วค่อยแบ่งขา) */
export function flipCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d")!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return cv;
}
