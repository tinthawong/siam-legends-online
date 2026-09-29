// ท่ายืน (idle) ผู้เล่นจาก PixelLab — ใช้ทั้งในเกม (GameScene) และหน้าสร้างตัวละคร (creator)
// เฟรม 64×64 ตัวละครเลื่อน +8px จากภาพ base 48×48 (เท้าบรรทัด 53)
// ตอนนี้มีเฉพาะทิศใต้ ได้ทิศอื่นมาให้วางไฟล์ที่ sprites/base-<เพศ>/idle-<ทิศ>/0..8.png แล้วเพิ่มทิศในลิสต์นี้
export const IDLE_DIRS: readonly string[] = ["south"];
export const IDLE_FRAMES = 9;
export const IDLE_FPS = 5; // 200ms ต่อเฟรม ตามไฟล์ต้นฉบับ
export const IDLE_OFFSET = 8;

export const idleFrameUrl = (gender: string, dir: string, i: number) => `sprites/base-${gender}/idle-${dir}/${i}.png`;
