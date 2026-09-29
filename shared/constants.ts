export const TILE = 32;              // ขนาดช่องเป็นพิกเซล
export const TICK_MS = 100;          // server tick 10 ครั้ง/วินาที
export const MAP_ID = "prontera_field";
export const NAME_RE = /^[\p{L}\p{M}\p{N}_]{2,16}$/u; // ชื่อตัวละคร: ไทย/อังกฤษ/ตัวเลข/_ ยาว 2–16

export const PLAYER_MOVE_MS = 150;   // เวลาเดิน 1 ช่อง (แนวตรง)
export const PLAYER_ASPD_MS = 700;   // ตีได้ทุก ๆ กี่ ms
export const PLAYER_RANGE = 1;       // ระยะตี (ช่อง)
export const AUTO_RADIUS = 12;       // รัศมีหามอนของระบบ auto (ช่อง)
export const MOB_RESPAWN_MS = 8000;
export const GROUND_ITEM_MS = 60 * 60_000; // ของบนพื้นหายเองหลัง 60 นาที (ผู้ใช้กำหนด)

// มอนตีกลับ (เฉพาะมอนที่ตั้ง retaliate ใน MOBS)
export const MOB_ASPD_MS = 1500;     // มอนตีได้ทุก ๆ กี่ ms
export const MOB_RANGE = 1;          // ระยะตีของมอน (ช่อง)
export const MOB_CHASE_RANGE = 8;    // ไล่ตามได้ไกลสุดกี่ช่องจากจุดที่โดนตีครั้งแรก เกินนี้เลิกไล่

// เลือดผู้เล่นฟื้นเอง: ไม่ได้สู้ (ไม่ตี/ไม่โดนตี) ครบเวลานี้ แล้วฟื้นทีละ % ของเลือดสูงสุด
export const REGEN_DELAY_MS = 5000;
export const REGEN_EVERY_MS = 1000;
export const REGEN_PCT = 0.02;

export const DIAG = 1.4142;

/** เวลาที่ใช้เดิน 1 ก้าว — แนวทแยงช้ากว่าแนวตรง */
export function stepMs(dx: number, dy: number, moveMs: number): number {
  return dx !== 0 && dy !== 0 ? moveMs * DIAG : moveMs;
}

/** ระยะแบบกระดานหมากรุก (ทแยงนับ 1 ช่อง) */
export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
