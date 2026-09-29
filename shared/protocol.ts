import type { Cell } from "./pathfind";

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
}

export interface PlayerStats {
  level: number;
  exp: number;
  expNext: number;
  atk: number;
  hp: number;
  maxHp: number;
}

// client → server
export type ClientMsg =
  | { t: "move"; x: number; y: number }
  | { t: "attack"; target: string }
  | { t: "auto"; on: boolean };

// server → client
export type ServerMsg =
  | { t: "welcome"; you: string; entities: EntityState[]; self: PlayerStats }
  | { t: "spawn"; e: EntityState }
  | { t: "despawn"; id: string }
  | { t: "move"; id: string; from: Cell; path: Cell[]; moveMs: number }
  | { t: "hit"; src: string; dst: string; dmg: number; crit: boolean; hp: number }
  | { t: "die"; id: string }
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
}

/** close code ที่ client ต้องรู้ */
export const CLOSE_KICKED = 4001; // บัญชีเดียวกันเข้าจากที่อื่น
