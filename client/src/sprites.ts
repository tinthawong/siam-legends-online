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
  male: ["south", "south-west", "north", "north-east"],
  female: ["south"],
};
export const idleDirs = (gender: string) => IDLE_DIRS[gender] ?? [];
export const IDLE_FRAMES = 9;
export const IDLE_FPS = 5; // 200ms ต่อเฟรม ตามไฟล์ต้นฉบับ
export const IDLE_OFFSET = 8;

export const idleFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/idle-${dir}/${i}.png`;

// ท่าเดิน (walk): เฟรม 64×64 จาก PixelLab ตัวละครเลื่อน +3px จากภาพ base (เท้าบรรทัด 48 วางให้เท้าติดพื้น)
// ได้ทิศใหม่มา: วางไฟล์ที่ sprites/base-<เพศ>/walk-<ทิศ>/0..5.png แล้วเพิ่มทิศในลิสต์ของเพศนั้น
// ทิศที่ยังไม่มีท่าเดิน ใช้ภาพนิ่ง + เด้งตามก้าวด้วยโค้ด (GameScene.setMotion)
export const WALK_DIRS: Record<string, readonly string[]> = {
  male: ["south"],
  female: [],
};
export const walkDirs = (gender: string) => WALK_DIRS[gender] ?? [];
export const WALK_FRAMES = 6;
export const WALK_FPS = 10; // ไฟล์ต้นฉบับ 200ms ต่อเฟรม เร่งให้ก้าวทันความเร็วเดินในเกม (150ms ต่อช่อง)
export const WALK_OFFSET = 3;
export const walkFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/walk-${dir}/${i}.png`;
