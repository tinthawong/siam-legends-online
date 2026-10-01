// ท่าทาง (animation) ผู้เล่นจาก PixelLab — ใช้ทั้งในเกม (GameScene) และหน้าสร้างตัวละคร (creator)

// ท่ายืน/ท่าเดินไม่ต้องมีครบ 8 ทิศ: ทิศที่ไม่มีใช้ภาพของทิศฝั่งตรงข้าม (ซ้าย↔ขวา) กลับซ้าย-ขวา
// (ภาพนิ่ง base ยังมีครบ 8 ทิศ ไม่ต้องกลับ)
export const MIRROR: Record<string, string> = {
  west: "east", east: "west",
  "south-west": "south-east", "south-east": "south-west",
  "north-west": "north-east", "north-east": "north-west",
};

/** ทิศนี้ใช้เฟรมของทิศไหน และต้องกลับซ้าย-ขวาไหม (null = ไม่มีท่านี้ในทิศนี้) */
export function animSource(available: readonly string[], dir: string): { dir: string; flip: boolean } | null {
  if (available.includes(dir)) return { dir, flip: false };
  const m = MIRROR[dir];
  return m && available.includes(m) ? { dir: m, flip: true } : null;
}

// ท่ายืน (idle): เฟรม 64×64 ตัวละครเลื่อน +8px จากภาพ base 48×48 (เท้าบรรทัด 53)
// ได้ทิศใหม่มา: วางไฟล์ที่ sprites/base-<เพศ>/idle-<ทิศ>/0..8.png แล้วเพิ่มทิศในลิสต์ของเพศนั้น
// ทิศซ้าย/ขวาต้องมีอย่างน้อยฝั่งเดียว อีกฝั่งกลับภาพให้เอง (ต้นฉบับอยู่ art/pixellab/base-<เพศ>-idle/)
export const IDLE_DIRS: Record<string, readonly string[]> = {
  male: ["south", "south-west", "west", "north-east", "north"],
  female: ["south"],
};
export const idleDirs = (gender: string) => IDLE_DIRS[gender] ?? [];
export const IDLE_FRAMES = 9;
export const IDLE_FPS = 5; // 200ms ต่อเฟรม ตามไฟล์ต้นฉบับ
export const IDLE_OFFSET = 8;

export const idleFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/idle-${dir}/${i}.png`;

// ท่าเดิน (walk) จาก PixelLab: เฟรม 64×64 ตัวละครอยู่ตำแหน่งเดียวกับภาพยืน 48×48 ที่วางกลางด้วยระยะ 8 px (เท้าแถว 53)
// ได้ทิศใหม่มา: วางไฟล์ที่ sprites/base-<เพศ>/walk-<ทิศ>/0..N.png แล้วเพิ่ม ทิศ: จำนวนเฟรม ของเพศนั้น
// (ต้นฉบับ GIF อยู่ art/pixellab/base-<เพศ>-walk/) ทิศฝั่งตรงข้ามที่ไม่มีใช้ภาพนี้กลับด้าน (MIRROR)
// ทิศที่ยังไม่มีเลย ใช้ท่าเดินที่สร้างด้วยโค้ด (walkgen.ts) · ทุกทิศใช้ความเร็วเฟรมเท่ากัน (WALK_FRAME_MS) วนตามจำนวนเฟรมของตัวเอง
export const WALK_ANIMS: Record<string, Record<string, number>> = {
  male: { south: 9, "south-east": 11, east: 11, "north-east": 11, north: 11 },
  female: {},
};
export const walkDirs = (gender: string) => Object.keys(WALK_ANIMS[gender] ?? {});
export const WALK_PAD = 8; // ระยะจากขอบภาพ 64 ถึงภาพยืน 48
export const walkFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/walk-${dir}/${i}.png`;

// ท่าต่อย (มือเปล่า เล่นครั้งเดียวต่อการตี) จาก PixelLab: เฟรม 64×64 วางแบบเดียวกับท่าเดิน (WALK_PAD)
// hit = เฟรมที่หมัดโดน (นับจาก 1) → เอฟเฟกต์/ตัวเลข/มอนโดนตีขึ้นตอนนี้ · ทิศฝั่งตรงข้ามที่ไม่มีใช้ภาพนี้กลับด้าน
// ทิศที่ไม่มีเลย (ตอนนี้ south, north) ใช้ท่าต่อยด้วยโค้ด (GameScene.punchFx) · ต้นฉบับ GIF อยู่ art/pixellab/base-<เพศ>-punch/
// south = ท่าถีบ (teep) แทนต่อย: folder ภาพ teep-<ทิศ>
// ทิศที่ไม่มี south/north ยืมท่าทแยง (GameScene.punchAnim)
export interface PunchAnim { frames: number; hit: number; frameMs?: number; folder?: string }
export const PUNCH_ANIMS: Record<string, Record<string, PunchAnim>> = {
  male: {
    east: { frames: 11, hit: 7 }, "south-east": { frames: 13, hit: 8 }, "north-east": { frames: 13, hit: 8 },
    south: { frames: 13, hit: 10, folder: "teep" },
  },
  female: {},
};
// ไม่ระบุ frameMs: ทั้งท่าใช้เวลาเท่าท่าต่อยด้วยโค้ดเดิม (ง้าง 80 + ต่อย 55 + กลับ 120 ms) เวลาต่อเฟรม = PUNCH_MS / จำนวนเฟรม
export const PUNCH_MS = 255;
export const punchFrameMs = (p: PunchAnim) => p.frameMs ?? PUNCH_MS / p.frames;
export const punchDirs = (gender: string) => Object.keys(PUNCH_ANIMS[gender] ?? {});
export const punchFrameUrl = (gender: string, dir: string, i: number) =>
  `sprites/base-${gender}/${PUNCH_ANIMS[gender][dir].folder ?? "punch"}-${dir}/${i}.png`;
