// สกิลนักมวย (ช่วงแรกทุกคนใช้ได้ ยังไม่มีระบบอาชีพ) — server ตัดสินทั้งหมด: SP, คูลดาวน์, ระยะ, ดาเมจ
// ตัวเลขเป็นค่าชั่วคราว (ยังไม่มีในตารางสมดุล) ปรับได้ที่นี่ ภายหลังควรย้ายไปชีต Excel
export interface SkillDef {
  id: string;
  name: string;
  key: string;        // ปุ่มลัด
  sp: number;         // ใช้ SP
  cooldownMs: number;
  hits: number;       // ตีกี่ครั้ง
  power: number;      // ดาเมจต่อครั้ง = ATK × power
  fx: string;         // เอฟเฟกต์ใน client/public/sprites/fx/<fx>/
}

export const SKILLS: Record<string, SkillDef> = {
  flurry: { id: "flurry", name: "หมัดรัว", key: "1", sp: 6, cooldownMs: 3000, hits: 4, power: 0.6, fx: "flurry" },
  golden_fist: { id: "golden_fist", name: "หมัดทอง", key: "2", sp: 12, cooldownMs: 6000, hits: 1, power: 2.5, fx: "golden-fist" },
};
export const SKILL_LIST = Object.values(SKILLS);
