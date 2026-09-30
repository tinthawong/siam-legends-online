-- ซ่อมตัวละครที่สร้างหลัง migration 0008: ตอนสร้างไม่ได้ใส่ค่าพลัง str/agi/vit/luk จึงได้ค่าเริ่มต้นของคอลัมน์ (0) แทน 5
-- ค่าไหนต่ำกว่า 5 ให้เป็น 5 (ค่าที่อัปเกิน 5 แล้วคงไว้)
UPDATE characters SET str = MAX(str, 5), agi = MAX(agi, 5), vit = MAX(vit, 5), int = MAX(int, 5), dex = MAX(dex, 5), luk = MAX(luk, 5);
