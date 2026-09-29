import type { Cell } from "./pathfind";
import type { Look } from "./appearance";

export type EntityKind = "player" | "mob";

export interface EntityState {
  id: string;
  kind: EntityKind;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  moveMs: number;
  path: Cell[];
  mobType?: string;
  look?: Look; // เฉพาะผู้เล่น
  dead?: boolean; // ผู้เล่นที่สลบอยู่ (รอกดกลับเมือง)
}

/** ของที่หล่นบนพื้น (item = key ใน shared/items.ts) */
export interface GroundItem {
  id: string;
  item: string;
  x: number;
  y: number;
}

/** ของในกระเป๋า */
export interface InvItem {
  item: string;
  count: number;
}

export interface PlayerStats {
  level: number;
  exp: number;
  expNext: number;
  atk: number;
  hp: number;
  maxHp: number;
  money: number; // เบี้ย
}

// client → server
export type ClientMsg =
  | { t: "move"; x: number; y: number }
  | { t: "attack"; target: string }
  | { t: "auto"; on: boolean }
  | { t: "pickup"; id: string } // เดินไปเก็บของบนพื้น
  | { t: "revive" }            // สลบอยู่ → กลับเมือง (ฟื้นที่จุดเกิด)
  | { t: "use"; item: string }  // ใช้ไอเท็มในกระเป๋า (ยา)
  | { t: "buy"; item: string; count: number } // ซื้อของด้วยเบี้ย
  | { t: "bot"; potionAt: number }; // กินยาอัตโนมัติเมื่อเลือดต่ำกว่ากี่ % (0 = ปิด)

// server → client
export type ServerMsg =
  | { t: "welcome"; you: string; entities: EntityState[]; self: PlayerStats; ground: GroundItem[]; inv: InvItem[] }
  | { t: "spawn"; e: EntityState }
  | { t: "despawn"; id: string }
  | { t: "move"; id: string; from: Cell; path: Cell[]; moveMs: number }
  | { t: "hit"; src: string; dst: string; dmg: number; crit: boolean; hp: number }
  | { t: "die"; id: string }
  | { t: "dead"; id: string; cause: string }           // ผู้เล่นเลือดหมด สลบอยู่กับที่ (cause = สาเหตุ เช่น "ปูแดง Lv.3 โจมตี")
  | { t: "respawn"; id: string; x: number; y: number } // กดกลับเมืองแล้ว → ฟื้นที่จุดเกิด
  | { t: "exp"; x: number; y: number; exp: number; money: number } // ส่งให้คนที่ตีมอนตาย: ได้ EXP/เบี้ยเท่าไหร่ (x,y = ช่องที่มอนตาย)
  | { t: "heal"; id: string; amount: number } // ผู้เล่นกินยา (ทุกคนเห็นตัวเลขเขียว)
  | { t: "drop"; g: GroundItem }          // ของหล่นบนพื้น
  | { t: "picked"; id: string; by: string } // ของบนพื้นถูกเก็บแล้ว (by = id ผู้เล่นที่เก็บ)
  | { t: "inv"; items: InvItem[] }          // กระเป๋าของเราเปลี่ยน
  | { t: "expire"; id: string }             // ของบนพื้นหมดเวลา หายไป
  | { t: "stats"; self: PlayerStats }
  | { t: "target"; id: string | null }
  | { t: "auto"; on: boolean }
  | { t: "kicked" };

/** ข้อมูลตัวละครที่ Worker โหลดจาก D1 แล้วส่งต่อให้ MapRoom */
export interface JoinCharacter {
  userId: string;
  name: string;
  level: number;
  exp: number;
  x: number;
  y: number;
  look: Look;
  inv: InvItem[];
  money: number;
}

/** close code ที่ client ต้องรู้ */
export const CLOSE_KICKED = 4001; // บัญชีเดียวกันเข้าจากที่อื่น
