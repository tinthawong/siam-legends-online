// ท่าทาง (animation) ผู้เล่นจาก PixelLab — ใช้ทั้งในเกม (GameScene) และหน้าสร้างตัวละคร (creator)

// ท่ายืน/ท่าเดินมีแค่ 5 ทิศ ทิศฝั่งตะวันตกใช้ภาพของฝั่งตะวันออกกลับซ้าย-ขวา
// (ภาพนิ่ง base ยังมีครบ 8 ทิศ ไม่ต้องกลับ)
export const MIRROR: Record<string, string> = {
  west: "east",
  "south-west": "south-east",
  "north-west": "north-east",
};

/** ทิศนี้ใช้เฟรมของทิศไหน และต้องกลับซ้าย-ขวาไหม (null = ไม่มีท่านี้ในทิศนี้) */
export function animSource(available: readonly string[], dir: string): { dir: string; flip: boolean } | null {
  if (available.includes(dir)) return { dir, flip: false };
  const m = MIRROR[dir];
  return m && available.includes(m) ? { dir: m, flip: true } : null;
}

// ท่ายืน (idle): เฟรม 64×64 ตัวละครเลื่อน +8px จากภาพ base 48×48 (เท้าบรรทัด 53)
// ตอนนี้มีเฉพาะทิศใต้ ได้ทิศอื่นมาให้วางไฟล์ที่ sprites/base-<เพศ>/idle-<ทิศ>/0..8.png แล้วเพิ่มทิศในลิสต์นี้
// (ใส่แค่ south, south-east, east, north-east, north — ฝั่งตะวันตกกลับภาพให้เอง)
export const IDLE_DIRS: readonly string[] = ["south"];
export const IDLE_FRAMES = 9;
export const IDLE_FPS = 5; // 200ms ต่อเฟรม ตามไฟล์ต้นฉบับ
export const IDLE_OFFSET = 8;

export const idleFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/idle-${dir}/${i}.png`;
