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
  // หันหน้าเข้ากล้องทิศเดียว ไม่มี = ใช้ภาพ placeholder วาดด้วยโค้ด ("poring" ใน GameScene.makeTextures)
  sheet?: string;
  // ชุดท่าเพิ่มที่ตัดแยกโฟลเดอร์ (sheet.json ของตัวเอง ขนาดเฟรม/จุดยึดต่างจากชุดหลักได้) เช่น ["hit"]
  sheetParts?: string[];
  level?: number;      // แสดงต่อท้ายชื่อ เช่น "ปูนา Lv.1"
  atk?: number;        // พลังโจมตี (ใช้ตอนตีกลับ)
  retaliate?: boolean; // โดนผู้เล่นตีแล้วตีกลับ + ไล่ตาม (ดู MOB_* ใน constants.ts)
  zone?: string; // โซนที่เกิด/เดินเล่น (ZONES ใน shared/map.ts) ไม่มี = ทั้งแมพ
  drop?: { item: string; chance: number }; // ตายแล้วหล่นของ (key ใน shared/items.ts, โอกาส 0–1)
  money?: [number, number]; // ตายแล้วคนที่ฆ่าได้เบี้ย สุ่มระหว่าง [ต่ำสุด, สูงสุด]
}

/** ค่าพลังจาก shared/data/monsters.json (export จาก Excel) */
function fromData(id: string, extra: Pick<MobDef, "moveMs" | "count" | "sheet" | "sheetParts" | "retaliate" | "drop" | "zone">): MobDef {
  const m = MONSTERS.find((x) => x.id === id);
  if (!m) throw new Error(`ไม่พบมอน ${id} ใน monsters.json`);
  return { name: m.name, level: m.level, maxHp: m.hp, def: m.def, exp: m.exp, atk: m.atk, money: [m.moneyMin, m.moneyMax], ...extra };
}

export const MOBS: Record<string, MobDef> = {
  // ปูนา (ทดสอบ)
  mud_crab: fromData("mob003", { moveMs: 420, count: 8, sheet: "rice-crab", sheetParts: ["hit", "idle"], retaliate: true,
    zone: "paddy", drop: { item: "crab_claw", chance: 1 } }),
  // ปูแดง (mob039)
  red_crab: fromData("mob039", { moveMs: 420, count: 6, sheet: "red-crab", sheetParts: ["idle"], retaliate: true,
    zone: "beach", drop: { item: "red_crab_claw", chance: 1 } }),
  // หุ่นไล่กา = หุ่นไล่กาเดินได้ (mob007) ในนาข้าว
  scarecrow: fromData("mob007", { moveMs: 480, count: 4, sheet: "scarecrow", sheetParts: ["idle"], retaliate: true,
    zone: "paddy", drop: { item: "straw_hat", chance: 1 } }),
  // กบบัว (mob005 เดิมชื่อกบเขียว) รอบสระบัว
  lotus_frog: fromData("mob005", { moveMs: 520, count: 6, sheet: "lotus-frog", sheetParts: ["idle"], retaliate: true,
    zone: "pond", drop: { item: "lotus", chance: 1 } }),
  // ยังไม่มีเลเวล/ค่าพลังในตารางสมดุล — ใส่ภาพกับของดรอปไว้ก่อน ยังไม่เกิดบนแมพ (count 0)
  grasshopper: { name: "ตั๊กแตนเคียว", maxHp: 1, def: 0, exp: 0, moveMs: 420, count: 0, sheet: "grasshopper", sheetParts: ["idle"],
    drop: { item: "sickle", chance: 1 } },
  octopus: { name: "หมึกหมวกเหล็ก", maxHp: 1, def: 0, exp: 0, moveMs: 420, count: 0, sheet: "octopus", sheetParts: ["hit", "death", "idle"],
    drop: { item: "iron_helmet", chance: 1 } },
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
