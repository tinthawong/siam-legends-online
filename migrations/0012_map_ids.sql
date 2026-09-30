-- ระบบหลายแมพ: id แมพใน D1 ใช้ชื่อไฟล์ผัง (shared/data/maps/<id>.json) เช่น ban-pak-ao, thung-na
-- ของเก่า (ban_pak_ao / prontera_field / อื่น ๆ) → แมพเริ่มต้น บ้านปากอ่าว
UPDATE characters SET map = 'ban-pak-ao' WHERE map NOT IN ('ban-pak-ao', 'thung-na');
