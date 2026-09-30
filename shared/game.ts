// ข้อมูลเกมและสูตรคำนวณ — อยู่ใน shared เพื่อให้ client/server ใช้ค่าเดียวกัน
import MONSTERS from "./data/monsters.json";
import { NO_GEAR, type Gear } from "./equipment";
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
  hit?: number; flee?: number; defPct?: number; defBonus?: number; mdefPct?: number; // ค่าพลังแบบ Ragnarok จาก monsters.json
  retaliate?: boolean; // โดนผู้เล่นตีแล้วตีกลับ + ไล่ตาม (ดู MOB_* ใน constants.ts)
  zone?: string; // โซนที่เกิด/เดินเล่น (ZONES ใน shared/map.ts) ไม่มี = ทั้งแมพ
  drop?: { item: string; chance: number }; // ตายแล้วหล่นของ (key ใน shared/items.ts, โอกาส 0–1)
  money?: [number, number]; // ตายแล้วคนที่ฆ่าได้เบี้ย สุ่มระหว่าง [ต่ำสุด, สูงสุด]
}

/** ค่าพลังจาก shared/data/monsters.json (export จาก Excel) */
function fromData(id: string, extra: Pick<MobDef, "moveMs" | "count" | "sheet" | "sheetParts" | "retaliate" | "drop" | "zone">): MobDef {
  const m = MONSTERS.find((x) => x.id === id);
  if (!m) throw new Error(`ไม่พบมอน ${id} ใน monsters.json`);
  return { name: m.name, level: m.level, maxHp: m.hp, def: m.def, exp: m.exp, atk: m.atk, money: [m.moneyMin, m.moneyMax],
    hit: m.hit, flee: m.flee, defPct: m.defPct, defBonus: m.defBonus, mdefPct: m.mdefPct, ...extra };
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
// ---------- ค่าพลังแบบ Ragnarok (docs/stat-system.md) — server คำนวณทุกค่า ----------
export type StatKey = "str" | "agi" | "vit" | "int" | "dex" | "luk";
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: StatKey[] = ["str", "agi", "vit", "int", "dex", "luk"];
export const STAT_START = 5;   // ตัวละครใหม่ทุกค่าเริ่มที่ 5
export const STAT_MAX = 150;
export const newStats = (): Stats => ({ str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
/** แต้มที่ได้ตอนเลเวลขึ้นเป็น newLevel */
export const statPointsForLevel = (newLevel: number) => Math.floor(newLevel / 5) + 3;
/** แต้มรวมทั้งหมดที่ได้ตั้งแต่เลเวล 1 ถึง level */
export const statPointsTotal = (level: number) => { let n = 0; for (let l = 2; l <= level; l++) n += statPointsForLevel(l); return n; };
/** ราคาเพิ่มค่าจาก x เป็น x+1 */
export const statCost = (x: number) => Math.floor((x - 1) / 10) + 2;
/** ราคารวมเพิ่มจาก x ไป n ขั้น */
export const statCostN = (x: number, n: number) => { let c = 0; for (let i = 0; i < n; i++) c += statCost(x + i); return c; };

export interface Derived {
  defPct: number; mdefPct: number; // DEF / MDEF เกราะ (% จากอุปกรณ์)
  atk: number; ratk: number; matkMin: number; matkMax: number;
  hit: number; flee: number; perfectDodge: number; crit: number; // % ทั้งสองค่าหลัง
  maxHp: number; maxSp: number; defBonus: number; mdefBonus: number;
  aspdMs: number; castMul: number; hpRegen: number; spRegen: number; weight: number;
}
const f = Math.floor;
/** ค่าที่คำนวณจากค่าหลัก + อุปกรณ์ (โบนัสค่าพลังบวกเข้าค่าหลัก, ATK อาวุธบวกเข้า ATK) */
export function derive(level: number, base: Stats, gear: Gear = NO_GEAR): Derived {
  const s = { ...base };
  for (const k of STAT_KEYS) s[k] += gear.bonus[k];
  const maxHp = f((40 + level * 12) * (1 + s.vit / 100));
  const maxSp = f((10 + level * 2) * (1 + s.int / 100));
  return {
    defPct: gear.defPct, mdefPct: gear.mdefPct,
    atk: s.str + f(s.str / 10) ** 2 + f(s.dex / 5) + f(s.luk / 5) + gear.atk,
    ratk: s.dex + f(s.dex / 10) ** 2 + f(s.str / 5) + f(s.luk / 5) + gear.atk,
    matkMin: s.int + f(s.int / 7) ** 2,
    matkMax: s.int + f(s.int / 5) ** 2,
    hit: level + s.dex,
    flee: level + s.agi,
    perfectDodge: 1 + s.luk / 10,
    crit: 1 + s.luk * 0.3,
    maxHp, maxSp,
    defBonus: f(s.vit / 2),
    mdefBonus: s.int,
    aspdMs: Math.max(300, Math.round(1200 * (1 - (s.agi * 4 + s.dex) / 1000))),
    castMul: Math.max(0, 1 - s.dex / 150),
    hpRegen: 1 + f(s.vit / 5) + f(maxHp / 200),   // ทุก 6 วินาทีตอนยืนนิ่ง
    spRegen: 1 + f(s.int / 6) + f(maxSp / 100),   // ทุก 8 วินาทีตอนยืนนิ่ง
    weight: 2000 + s.str * 30,
  };
}

/** โจมตีกายภาพ 1 ครั้ง ตามสูตรใน docs/stat-system.md */
export function physicalAttack(
  att: { atk: number; hit: number; crit: number },                                   // crit เป็น %
  def: { flee: number; defPct: number; defBonus: number; perfectDodge?: number },    // perfectDodge % (เฉพาะผู้เล่น)
  rng: () => number = Math.random,
): { dmg: number; crit: boolean; miss: boolean } {
  // คริ: โดนแน่นอน ไม่หัก DEF
  if (rng() * 100 < att.crit) return { dmg: Math.max(1, Math.round(att.atk * 1.4)), crit: true, miss: false };
  const hitPct = Math.min(95, Math.max(5, 80 + att.hit - def.flee));
  if (rng() * 100 >= hitPct) return { dmg: 0, crit: false, miss: true };
  if (def.perfectDodge && rng() * 100 < def.perfectDodge) return { dmg: 0, crit: false, miss: true };
  const dmg = Math.round(att.atk * (0.9 + rng() * 0.2) * (1 - def.defPct / 100) - def.defBonus);
  return { dmg: Math.max(1, dmg), crit: false, miss: false };
}
