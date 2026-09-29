-- รูปลักษณ์ตัวละคร (ค่าเป็น key ใน shared/appearance.ts)
ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'male';
ALTER TABLE characters ADD COLUMN hair   TEXT NOT NULL DEFAULT 'black';
ALTER TABLE characters ADD COLUMN eyes   TEXT NOT NULL DEFAULT 'grey';
