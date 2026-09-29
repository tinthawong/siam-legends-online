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

/** ผม = ก้อนสีเข้มโทนน้ำเงินเทาขนาดใหญ่ที่เริ่มจากบนหัว (ตัดที่แนวเอว) */
function hairMask(d: ImageData, waist = 34): Set<number> {
  const { width: W, height: H, data } = d;
  const ok = (i: number) => {
    if (data[i * 4 + 3] === 0) return false;
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
    if (comp.length >= 12 && top < 14) for (const i of comp) if (((i / W) | 0) < waist) mask.add(i);
  }
  return mask;
}

/** ม่านตา = พิกเซลโทนฟ้ากลาง ๆ ในช่วงหัว ที่อยู่ติดกับตาขาว */
function eyeMask(d: ImageData, hair: Set<number>): Set<number> {
  const { width: W, height: H, data } = d;
  let top = 0;
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { top = y; break outer; }
  const px = (i: number) => hsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const opaque = (i: number) => data[i * 4 + 3] > 0;
  const sclera = (i: number) => { const [h, , l] = px(i); return opaque(i) && l > 0.72 && h >= 160 && h <= 240; };
  const mask = new Set<number>();
  for (let y = top + 10; y <= Math.min(H - 1, top + 20); y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!opaque(i) || hair.has(i)) continue;
      const [h, s, l] = px(i);
      if (l < 0.12 || l > 0.6 || s < 0.12 || h < 190 || h > 260) continue;
      let nearWhite = false;
      for (let dy = -1; dy <= 1 && !nearWhite; dy++)
        for (let dx = -1; dx <= 1; dx++) if (sclera((y + dy) * W + x + dx)) { nearWhite = true; break; }
      if (nearWhite) mask.add(i);
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
  const hair = hairMask(d);
  const eyes = eyeMask(d, hair); // หาจากภาพต้นฉบับก่อนเปลี่ยนสี
  if (hairRamp) applyRamp(d, hair, hairRamp);
  if (eyeRamp) applyRamp(d, eyes, eyeRamp);
  ctx.putImageData(d, 0, 0);
  return cv;
}
