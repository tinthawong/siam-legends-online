// NPC และเควส อ่านจาก shared/data/npcs.json + quests.json (ตำแหน่ง NPC มาจาก layout แมพ: NPC_POS)
// ใช้ร่วมกัน: server ตัดสินทุกอย่าง (รับเควส นับมอน ส่งเควส ให้รางวัล) client ใช้แสดงผล (! ? เหนือหัว, รายการเควส)
import NPC_DATA from "./data/npcs.json";
import QUEST_DATA from "./data/quests.json";
import { MOB_ID, NPC_POS } from "./map";
import { ITEMS } from "./items";

export interface NpcDef {
  id: string;
  name: string;
  sprite: string; // โฟลเดอร์ภาพใน client/public/sprites/ (ยังไม่มีภาพ = ใช้ภาพชั่วคราว)
  quests: string[];
  x: number; // ช่อง
  y: number;
}

export type QuestType = "talk" | "kill" | "collect";

export interface QuestDef {
  id: string;
  npc: string;       // NPC ที่ให้เควส
  name: string;
  minLevel: number;
  requires: string[];
  type: QuestType;
  target: string;    // talk = id NPC, kill = id มอนในเกม (MOBS), collect = id ไอเท็ม (ITEMS)
  count: number;
  turnIn: string;    // NPC ที่ต้องไปส่ง: talk = เป้าหมาย, อื่น ๆ = คนให้เควส
  text: { offer: string; progress: string; done: string };
  reward: { exp: number; money: number; items: { item: string; count: number }[] };
}

/** ข้อมูลเควสใช้ชื่อแบบ layout/ภาพ (rice-crab, red-crab-claw) → แปลงเป็น id ในเกม */
const itemId = (s: string) => s.replace(/-/g, "_");

export const NPCS: Record<string, NpcDef> = Object.fromEntries(
  NPC_DATA.filter((n) => NPC_POS[n.id]).map((n) => [n.id, { id: n.id, name: n.name, sprite: n.sprite, quests: n.quests, ...NPC_POS[n.id] }]),
);

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  QUEST_DATA.map((q) => {
    const type = q.type as QuestType;
    const target = type === "kill" ? MOB_ID[q.target] ?? q.target : type === "collect" ? itemId(q.target) : q.target;
    return [q.id, {
      id: q.id, npc: q.npc, name: q.name, minLevel: q.minLevel, requires: q.requires, type, target, count: q.count,
      turnIn: type === "talk" ? q.target : q.npc,
      text: q.text,
      reward: {
        exp: q.reward.exp, money: q.reward.money,
        items: q.reward.items.map((i) => ({ item: itemId(i.id), count: i.count })).filter((i) => ITEMS[i.item]),
      },
    } satisfies QuestDef];
  }),
);

/** สถานะเควสของผู้เล่น (เก็บใน D1 คอลัมน์ quests เป็น JSON) active = id → จำนวนที่ทำได้ (kill) */
export interface QuestLog {
  active: Record<string, number>;
  done: string[];
}
export const emptyLog = (): QuestLog => ({ active: {}, done: [] });

export function parseLog(raw: unknown): QuestLog {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const active: Record<string, number> = {};
    for (const [k, n] of Object.entries(v?.active ?? {})) if (QUESTS[k]) active[k] = Math.max(0, Math.floor(Number(n)) || 0);
    const done = Array.isArray(v?.done) ? v.done.filter((k: unknown) => typeof k === "string" && QUESTS[k]) : [];
    return { active, done };
  } catch {
    return emptyLog();
  }
}

/** รับเควสนี้ได้ไหม (ยังไม่เคยรับ, เลเวลถึง, ทำเควสก่อนหน้าครบ) */
export const canAccept = (q: QuestDef, level: number, log: QuestLog) =>
  !(q.id in log.active) && !log.done.includes(q.id) && level >= q.minLevel && q.requires.every((r) => log.done.includes(r));

/** ทำครบแล้วหรือยัง (talk = ครบทันทีเมื่อไปคุยกับเป้าหมาย, collect = นับจากกระเป๋า) */
export function isComplete(q: QuestDef, log: QuestLog, invCount: (item: string) => number): boolean {
  if (!(q.id in log.active)) return false;
  if (q.type === "talk") return true;
  if (q.type === "kill") return log.active[q.id] >= q.count;
  return invCount(q.target) >= q.count;
}

/** ความคืบหน้าที่แสดงผล เช่น 3 / 10 */
export function progressOf(q: QuestDef, log: QuestLog, invCount: (item: string) => number): number {
  if (q.type === "kill") return Math.min(q.count, log.active[q.id] ?? 0);
  if (q.type === "collect") return Math.min(q.count, invCount(q.target));
  return 0;
}

export type NpcTalk =
  | { stage: "done" | "progress" | "offer"; quest: QuestDef }
  | { stage: "idle"; quest: null };

/** คุยกับ NPC แล้วได้อะไร: ส่งเควสที่ครบ > เควสที่ค้างอยู่กับคนนี้ > เควสใหม่ > ไม่มีงาน */
export function talkTo(npc: string, level: number, log: QuestLog, invCount: (item: string) => number): NpcTalk {
  const active = Object.keys(log.active).map((k) => QUESTS[k]);
  const ready = active.find((q) => q.turnIn === npc && isComplete(q, log, invCount));
  if (ready) return { stage: "done", quest: ready };
  const pending = active.find((q) => q.npc === npc || q.turnIn === npc);
  if (pending) return { stage: "progress", quest: pending };
  const offer = (NPCS[npc]?.quests ?? []).map((k) => QUESTS[k]).find((q) => q && canAccept(q, level, log));
  // เควสที่ไม่ได้อยู่ในรายการของ NPC แต่ NPC นี้เป็นคนให้ (เช่น q002 ของหลวงพี่)
  const extra = offer ?? Object.values(QUESTS).find((q) => q.npc === npc && canAccept(q, level, log));
  return extra ? { stage: "offer", quest: extra } : { stage: "idle", quest: null };
}

/** เครื่องหมายเหนือหัว NPC: ? = มีเควสส่งได้, ! = มีเควสใหม่ให้รับ */
export function npcMark(npc: string, level: number, log: QuestLog, invCount: (item: string) => number): "?" | "!" | null {
  const t = talkTo(npc, level, log, invCount);
  return t.stage === "done" ? "?" : t.stage === "offer" ? "!" : null;
}
