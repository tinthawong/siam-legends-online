-- อุปกรณ์ที่ใส่อยู่: JSON {"head_top": "straw_hat", "weapon": "sickle"} (shared/equipment.ts) ของที่ใส่ไม่อยู่ในตาราง inventory
ALTER TABLE characters ADD COLUMN equip TEXT NOT NULL DEFAULT '{}';
