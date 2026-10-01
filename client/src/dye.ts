// เสื้อแบบ "ย้อมสี": หาพิกเซลเสื้อกล้ามในเฟรมตัวละคร แล้วเปลี่ยนสีตามความสว่าง (ใช้ได้ทุกท่า เพราะทำจากเฟรมนั้นเอง)
// ผลลัพธ์ = ภาพขนาดเท่าเฟรม มีเฉพาะพิกเซลเสื้อที่ย้อมแล้ว ที่เหลือโปร่งใส → วาดทับตัวละครตรงตำแหน่งเดียวกัน

export interface DyeOutfit { id: string; type: "dye"; shades: [string, string, string, string]; trim: string }

const MIN_BLOB = 6; // ก้อนเล็กกว่านี้ไม่ใช่เสื้อ (ตาขาว, ประกายผม)

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function dyeCanvas(src: HTMLImageElement | HTMLCanvasElement, o: DyeOutfit): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), p = img.data;

  // พิกเซลเสื้อ: ทึบ, เฉลี่ย >= 130, (B-R >= 12 หรือ min > 200), max-min < 70
  const shirt = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2], a = p[i * 4 + 3];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (a === 255 && (r + g + b) / 3 >= 130 && (b - r >= 12 || mn > 200) && mx - mn < 70) shirt[i] = 1;
  }
  // ตัดก้อนเล็ก (ติดกัน 8 ทิศ)
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!shirt[i] || seen[i]) continue;
    const blob = [i];
    seen[i] = 1;
    for (let k = 0; k < blob.length; k++) {
      const x = blob[k] % w, y = (blob[k] / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !shirt[j] || seen[j]) continue;
        seen[j] = 1;
        blob.push(j);
      }
    }
    if (blob.length < MIN_BLOB) for (const j of blob) shirt[j] = 0;
  }

  const shades = o.shades.map(rgb), trim = rgb(o.trim);
  for (let i = 0; i < w * h; i++) {
    if (!shirt[i]) { p[i * 4 + 3] = 0; continue; }
    // ขอบล่างชายเสื้อ: ข้างล่างไม่ใช่เสื้อแต่ยังเป็นตัวละคร (ลูปเดินบนลงล่าง alpha ข้างล่างยังเป็นค่าเดิม)
    const below = i + w;
    const isTrim = below < w * h && !shirt[below] && p[below * 4 + 3] > 0;
    let c: number[];
    if (isTrim) c = trim;
    else {
      const t = ((p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3 - 130) / 115;
      c = shades[Math.max(0, Math.min(3, Math.floor(t * 4)))];
    }
    p[i * 4] = c[0]; p[i * 4 + 1] = c[1]; p[i * 4 + 2] = c[2];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
