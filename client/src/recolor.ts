// เปลี่ยนสีผมและสีตาของ sprite ตัว base โดยคงแสงเงาเดิม
import { HAIR_COLORS, EYE_COLORS, type Look, type RGB } from "../../shared/appearance";

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** ขอบบน/ล่างของตัวละครในภาพ (รองรับทั้งกรอบ 48 และ 64 และท่าที่ตัวขยับขึ้นลง) */
function spriteBounds(d: ImageData): { top: number; bottom: number } {
  const { width: W, height: H, data } = d;
  let top = -1, bottom = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3]) { if (top < 0) top = y; bottom = y; break; }
  return { top: Math.max(0, top), bottom: Math.max(0, bottom) };
}

/** ผม = ก้อนสีเข้มโทนน้ำเงินเทาขนาดใหญ่ที่เริ่มจากบนหัว ตัดที่แนวเอว
 *  ตัว base 48px: หัวแถว 2, เท้าแถว 45 → ผมต้องเริ่มก่อนแถว 14 (หัว+12), เอวที่แถว 34 (เท้า−11) */
export function hairMask(d: ImageData, eyes: Set<number>): Set<number> {
  const { width: W, height: H, data } = d;
  const { top: spriteTop, bottom } = spriteBounds(d);
  const hairStart = spriteTop + 12, waist = bottom - 11;
  const ok = (i: number) => {
    if (data[i * 4 + 3] === 0 || eyes.has(i)) return false; // ตาไม่นับเป็นผม แม้จะอยู่ติดคิ้ว
    const [h, s, l] = hsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (l < 0.05 || l > 0.55) return false; // เส้นขอบดำสนิท / สีสว่าง
    return (h >= 200 && h <= 310) || s < 0.1;
  };
  const seen = new Uint8Array(W * H);
  const mask = new Set<number>();
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !ok(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (!seen[n] && ok(n)) { seen[n] = 1; stack.push(n); }
        }
    }
    const top = Math.min(...comp.map((i) => (i / W) | 0));
    if (comp.length >= 12 && top < hairStart) for (const i of comp) if (((i / W) | 0) < waist) mask.add(i);
  }
  return mask;
}

/** ม่านตา = พิกเซลในช่วงหัวที่ไม่ใช่ผิวหรือเส้นขอบ และอยู่ติดกับตาขาว */
export function eyeMask(d: ImageData): Set<number> {
  const { width: W, height: H, data } = d;
  let top = 0;
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { top = y; break outer; }
  const px = (i: number) => hsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const opaque = (i: number) => data[i * 4 + 3] > 0;
  const sclera = (i: number) => { const [h, , l] = px(i); return opaque(i) && l > 0.72 && h >= 160 && h <= 240; };
  const lo = top + 10, hi = Math.min(H - 1, top + 20);
  const inBand = (y: number) => y >= lo && y <= hi;
  const iris = (i: number) => {
    if (!opaque(i)) return false;
    const [h, s, l] = px(i);
    if (l < 0.12 || l > 0.68) return false;           // เส้นขอบ/รูม่านตาดำสนิท หรือตาขาว
    return !(s > 0.25 && (h < 40 || h > 340));          // ไม่ใช่ผิว
  };
  // ตาขาวในช่วงหัว
  const whites: [number, number][] = [];
  for (let y = lo; y <= hi; y++) for (let x = 0; x < W; x++) if (sclera(y * W + x)) whites.push([x, y]);
  const nearWhite = (x: number, y: number, r: number) =>
    whites.some(([wx, wy]) => Math.max(Math.abs(wx - x), Math.abs(wy - y)) <= r);

  // เริ่มจากพิกเซลตาที่ติดตาขาว แล้วลามไปพิกเซลตาที่ต่อกัน ภายในระยะ 3 ช่องจากตาขาว
  const mask = new Set<number>();
  const stack: number[] = [];
  for (let y = lo; y <= hi; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (iris(i) && nearWhite(x, y, 1)) { mask.add(i); stack.push(i); }
    }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * W + nx;
        if (nx < 0 || nx >= W || !inBand(ny) || mask.has(n)) continue;
        if (iris(n) && nearWhite(nx, ny, 3)) { mask.add(n); stack.push(n); }
      }
  }
  return mask;
}

function applyRamp(d: ImageData, mask: Set<number>, [dark, lite]: [RGB, RGB]) {
  if (!mask.size) return;
  const data = d.data;
  const ls = [...mask].map((i) => hsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[2]);
  const lo = Math.min(...ls), hi = Math.max(...ls);
  let k = 0;
  for (const i of mask) {
    const t = (ls[k++] - lo) / (hi - lo || 1);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(dark[c] + (lite[c] - dark[c]) * t);
  }
}

/** สร้างภาพใหม่จากภาพ base ตามสีผม/สีตาที่เลือก */
export function recolorSprite(src: CanvasImageSource & { width: number; height: number }, look: Look): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const hairRamp = HAIR_COLORS[look.hair]?.ramp;
  const eyeRamp = EYE_COLORS[look.eyes]?.ramp;
  if (!hairRamp && !eyeRamp) return cv;
  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  const eyes = eyeMask(d);        // หาตาก่อน แล้วกันออกจากผม (หาจากภาพต้นฉบับก่อนเปลี่ยนสี)
  const hair = hairMask(d, eyes);
  if (hairRamp) applyRamp(d, hair, hairRamp);
  if (eyeRamp) applyRamp(d, eyes, eyeRamp);
  ctx.putImageData(d, 0, 0);
  return cv;
}
