// ข้อมูลเกมและสูตรคำนวณ — อยู่ใน shared เพื่อให้ client/server ใช้ค่าเดียวกัน
import MONSTERS from "./data/monsters.json";

export interface MobDef {
  name: string;
  maxHp: number;
  def: number;
  exp: number;
  moveMs: number;
  count: number; // จำนวนที่เกิดในแมพ
  // ชุดภาพจาก tools/slice_sheet.py ที่ client/public/sprites/monsters/<sheet>/ (sheet.json + เฟรม)
  // หันหน้าเข้ากล้องทิศเดียว ไม่มี = วาดด้วยโค้ดแบบ Poring
  sheet?: string;
  // ชุดท่าเพิ่มที่ตัดแยกโฟลเดอร์ (sheet.json ของตัวเอง ขนาดเฟรม/จุดยึดต่างจากชุดหลักได้) เช่น ["hit"]
  sheetParts?: string[];
  level?: number;      // แสดงต่อท้ายชื่อ เช่น "ปูนา Lv.1"
  atk?: number;        // พลังโจมตี (ใช้ตอนตีกลับ)
  retaliate?: boolean; // โดนผู้เล่นตีแล้วตีกลับ + ไล่ตาม (ดู MOB_* ใน constants.ts)
  drop?: { item: string; chance: number }; // ตายแล้วหล่นของ (key ใน shared/items.ts, โอกาส 0–1)
}

/** ค่าพลังจาก shared/data/monsters.json (export จาก Excel) */
function fromData(id: string, extra: Pick<MobDef, "moveMs" | "count" | "sheet" | "sheetParts" | "retaliate" | "drop">): MobDef {
  const m = MONSTERS.find((x) => x.id === id);
  if (!m) throw new Error(`ไม่พบมอน ${id} ใน monsters.json`);
  return { name: m.name, level: m.level, maxHp: m.hp, def: m.def, exp: m.exp, atk: m.atk, ...extra };
}

export const MOBS: Record<string, MobDef> = {
  poring: { name: "Poring", maxHp: 50, def: 1, exp: 12, moveMs: 420, count: 16 },
  // ปูนา (ทดสอบ)
  mud_crab: fromData("mob003", { moveMs: 420, count: 8, sheet: "rice-crab", sheetParts: ["hit", "idle"], retaliate: true,
    drop: { item: "crab_claw", chance: 1 } }),
  // ปูแดง (mob039)
  red_crab: fromData("mob039", { moveMs: 420, count: 6, sheet: "red-crab", sheetParts: ["idle"], retaliate: true,
    drop: { item: "red_crab_claw", chance: 1 } }),
};

export const expToNext = (level: number) => 20 + level * 15;
export const playerAtk = (level: number) => 10 + level * 2;
export const playerMaxHp = (level: number) => 90 + level * 10;

export function rollDamage(atk: number, def: number, rng: () => number = Math.random) {
  let dmg = Math.max(1, Math.round(atk * (0.85 + rng() * 0.3)) - def);
  const crit = rng() < 0.1;
  if (crit) dmg = Math.round(dmg * 1.5);
  return { dmg, crit };
}
