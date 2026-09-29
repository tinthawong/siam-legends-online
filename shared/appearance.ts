// รูปลักษณ์ตัวละคร — ใช้ทั้ง client (แสดงผล/หน้าสร้างตัวละคร) และ server (ตรวจค่า)
export type Gender = "male" | "female";
export type RGB = [number, number, number];

export interface Look {
  gender: Gender;
  hair: string;
  eyes: string;
}

export interface ColorOption {
  name: string;         // ชื่อที่แสดงในหน้าสร้างตัวละคร
  swatch: string;       // สีปุ่มตัวอย่าง
  ramp: [RGB, RGB] | null; // [สีเงา, สีสว่าง] / null = ใช้สีเดิมของภาพ
}

export const GENDERS: Record<Gender, string> = { male: "ชาย", female: "หญิง" };

export const HAIR_COLORS: Record<string, ColorOption> = {
  black:   { name: "ดำ",      swatch: "#23202f", ramp: null },
  brown:   { name: "น้ำตาล",  swatch: "#8a5530", ramp: [[40, 20, 12], [170, 110, 70]] },
  blonde:  { name: "ทอง",     swatch: "#e2bd62", ramp: [[120, 75, 25], [255, 230, 150]] },
  crimson: { name: "แดง",     swatch: "#b8243f", ramp: [[60, 5, 20], [235, 80, 100]] },
  silver:  { name: "เงิน",    swatch: "#c9ccd8", ramp: [[70, 75, 95], [245, 245, 255]] },
  blue:    { name: "น้ำเงิน", swatch: "#2f5fc9", ramp: [[10, 25, 80], [110, 170, 255]] },
};

export const EYE_COLORS: Record<string, ColorOption> = {
  grey:   { name: "เทาฟ้า",  swatch: "#6a86a8", ramp: null },
  brown:  { name: "น้ำตาล",  swatch: "#8a5a30", ramp: [[60, 30, 12], [185, 125, 70]] },
  green:  { name: "เขียว",   swatch: "#3aa35a", ramp: [[15, 70, 35], [120, 215, 130]] },
  gold:   { name: "ทอง",     swatch: "#e0a92a", ramp: [[120, 70, 10], [255, 215, 90]] },
  red:    { name: "แดง",     swatch: "#c93a3a", ramp: [[90, 10, 15], [240, 100, 95]] },
  violet: { name: "ม่วง",    swatch: "#8a5ad6", ramp: [[50, 20, 95], [195, 140, 255]] },
};

export const DEFAULT_LOOK: Look = { gender: "male", hair: "black", eyes: "grey" };

/** ตรวจค่าจาก client — คืน null ถ้าไม่ถูกต้อง */
export function parseLook(x: unknown): Look | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const gender = String(o.gender);
  const hair = String(o.hair);
  const eyes = String(o.eyes);
  if (!(gender in GENDERS) || !(hair in HAIR_COLORS) || !(eyes in EYE_COLORS)) return null;
  return { gender: gender as Gender, hair, eyes };
}

export const lookKey = (l: Look) => `${l.gender}_${l.hair}_${l.eyes}`;
