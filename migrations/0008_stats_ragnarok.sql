-- ค่าพลังแบบ Ragnarok 6 ค่า (docs/stat-system.md): ทุกค่าเริ่ม 5 + แต้มว่าง
-- ตัวละครที่มีอยู่แล้ว: ล้างค่าที่อัปจากระบบเก่า (0007) กลับเป็น 5 แล้วให้แต้มย้อนหลังตามเลเวลปัจจุบัน
--   แต้มรวม = Σ_{l=2..L} (floor(l/5) + 3) = 3(L-1) + 5q(q-1)/2 + q(L - 5q + 1) โดย q = floor(L/5)
ALTER TABLE characters ADD COLUMN int INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN dex INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_points INTEGER NOT NULL DEFAULT 0;
UPDATE characters SET str = 5, agi = 5, vit = 5, int = 5, dex = 5, luk = 5,
  stat_points = 3 * (level - 1) + 5 * (level / 5) * ((level / 5) - 1) / 2 + (level / 5) * (level - 5 * (level / 5) + 1);
