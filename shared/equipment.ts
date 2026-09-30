// อุปกรณ์: ช่องใส่ 10 ช่องแบบ Ragnarok ค่าพลังจาก shared/data/equipment.json
// (สร้างจากชีต "อุปกรณ์" ใน balance/siam-legends-balance.xlsx ด้วย python tools/export_balance.py ห้ามแก้ JSON ด้วยมือ)
import DATA from "./data/equipment.json";
import type { Stats, StatKey } from "./game";

export const SLOTS = [
  { key: "head_top", name: "หัวบน" },
  { key: "head_mid", name: "หัวกลาง" },
  { key: "head_low", name: "หัวล่าง" },
  { key: "armor", name: "ชุด" },
  { key: "weapon", name: "อาวุธ" },
  { key: "shield", name: "โล่" },
  { key: "garment", name: "ผ้าคลุม" },
  { key: "shoes", name: "รองเท้า" },
  { key: "acc1", name: "เครื่องประดับ 1" },
  { key: "acc2", name: "เครื่องประดับ 2" },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];
const SLOT_KEYS = SLOTS.map((s) => s.key) as SlotKey[];

export interface EquipDef {
  item: string;
  slot: string; // ช่องในชีต (accessory = ใส่ได้ทั้ง acc1 / acc2)
  level: number;
  atk: number;
  defPct: number;
  mdefPct: number;
  bonus: Stats;
}
export const EQUIP: Record<string, EquipDef> = Object.fromEntries(DATA.map((d) => [d.item, d as EquipDef]));

/** ช่องที่ของชิ้นนี้ใส่ได้ */
export const slotsFor = (item: string): SlotKey[] => {
  const s = EQUIP[item]?.slot;
  if (!s) return [];
  return s === "accessory" ? ["acc1", "acc2"] : SLOT_KEYS.includes(s as SlotKey) ? [s as SlotKey] : [];
};

/** ของที่ใส่อยู่: ช่อง → id ไอเท็ม */
export type Equipped = Partial<Record<SlotKey, string>>;

export function parseEquip(raw: unknown): Equipped {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const out: Equipped = {};
    for (const k of SLOT_KEYS) {
      const item = v?.[k];
      if (typeof item === "string" && slotsFor(item).includes(k)) out[k] = item;
    }
    return out;
  } catch {
    return {};
  }
}

/** ค่ารวมจากของที่ใส่อยู่ */
export interface Gear {
  atk: number;
  defPct: number;
  mdefPct: number;
  bonus: Stats;
}
export const NO_GEAR: Gear = { atk: 0, defPct: 0, mdefPct: 0, bonus: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 } };

export function gearOf(eq: Equipped): Gear {
  const g: Gear = { atk: 0, defPct: 0, mdefPct: 0, bonus: { ...NO_GEAR.bonus } };
  for (const item of Object.values(eq)) {
    const d = item ? EQUIP[item] : undefined;
    if (!d) continue;
    g.atk += d.atk;
    g.defPct += d.defPct;
    g.mdefPct += d.mdefPct;
    for (const k of Object.keys(g.bonus) as StatKey[]) g.bonus[k] += d.bonus[k] ?? 0;
  }
  return g;
}
