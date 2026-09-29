-- แต้มสถานะที่ผู้เล่นอัปเอง (แต้มคงเหลือคำนวณจากเลเวล: (level-1) × STAT_POINTS_PER_LEVEL − ที่ใช้ไปแล้ว)
ALTER TABLE characters ADD COLUMN str INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN vit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN agi INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN luk INTEGER NOT NULL DEFAULT 0;
