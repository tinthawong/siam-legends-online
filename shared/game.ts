// ข้อมูลเกมและสูตรคำนวณ — อยู่ใน shared เพื่อให้ client/server ใช้ค่าเดียวกัน
import MONSTERS from "./data/monsters.json";
import { ZONES } from "./map";

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
  mud_crab: fromData("mob003", { moveMs: 420, count: 0, sheet: "rice-crab", sheetParts: ["hit", "idle"], retaliate: true,
    drop: { item: "crab_claw", chance: 1 } }),                                   // ปูนา Lv1
  red_crab: fromData("mob039", { moveMs: 420, count: 0, sheet: "red-crab", sheetParts: ["idle"], retaliate: true,
    drop: { item: "red_crab_claw", chance: 1 } }),                               // ปูแดง Lv3
  lotus_frog: fromData("mob005", { moveMs: 520, count: 0, sheet: "lotus-frog", sheetParts: ["idle"], retaliate: true,
    drop: { item: "lotus", chance: 1 } }),                                       // กบบัว Lv5 (เดิมกบเขียว)
  scarecrow: fromData("mob007", { moveMs: 480, count: 0, sheet: "scarecrow", sheetParts: ["idle"], retaliate: true,
    drop: { item: "straw_hat", chance: 1 } }),                                   // หุ่นไล่กาเดินได้ Lv8
  grasshopper: fromData("mob040", { moveMs: 380, count: 0, sheet: "grasshopper", sheetParts: ["idle"], retaliate: true,
    drop: { item: "sickle", chance: 1 } }),                                      // ตั๊กแตนเคียว Lv10
  octopus: fromData("mob041", { moveMs: 500, count: 0, sheet: "octopus", sheetParts: ["hit", "death", "idle"], retaliate: true,
    drop: { item: "iron_helmet", chance: 1 } }),                                 // หมึกหมวกเหล็ก Lv12
};
// จำนวนและโซนเกิดมาจาก spawns ใน layout แมพ (shared/data/maps/ban-pak-ao.json) — มอนที่ไม่มีใน spawns ไม่เกิด
for (const [id, z] of Object.entries(ZONES)) if (MOBS[id]) { MOBS[id].count = z.count; MOBS[id].zone = id; }

export const expToNext = (level: number) => 20 + level * 15;
export const playerAtk = (level: number) => 10 + level * 2;
export const playerMaxHp = (level: number) => 90 + level * 10;

// ---------- แต้มสถานะ (อัปเองในหน้าสถานะ) ----------
export type StatKey = "str" | "vit" | "agi" | "luk";
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = ["str", "vit", "agi", "luk"];
export const STAT_POINTS_PER_LEVEL = 5;
export const statPointsTotal = (level: number) => (level - 1) * STAT_POINTS_PER_LEVEL;
export const statPointsLeft = (level: number, s: Stats) => statPointsTotal(level) - STAT_KEYS.reduce((a, k) => a + s[k], 0);
/** ค่าที่ได้จากแต้ม: พลัง +1 ATK/แต้ม, อึด +5 HP/แต้ม, ว่องไว ตีเร็วขึ้น 1%/แต้ม (สูงสุด 50%), โชค คริ +0.5%/แต้ม (สูงสุด 50%) */
export const statAtk = (level: number, s: Stats) => playerAtk(level) + s.str;
export const statMaxHp = (level: number, s: Stats) => playerMaxHp(level) + s.vit * 5;
export const statAspdMs = (base: number, s: Stats) => Math.round(base * (1 - Math.min(0.5, s.agi * 0.01)));
export const statCrit = (s: Stats) => Math.min(0.5, 0.1 + s.luk * 0.005);

export function rollDamage(atk: number, def: number, rng: () => number = Math.random, critChance = 0.1) {
  let dmg = Math.max(1, Math.round(atk * (0.85 + rng() * 0.3)) - def);
  const crit = rng() < critChance;
  if (crit) dmg = Math.round(dmg * 1.5);
  return { dmg, crit };
}
