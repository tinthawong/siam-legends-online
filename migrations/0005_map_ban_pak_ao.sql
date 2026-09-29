-- แมพแรกเปลี่ยนชื่อจาก prontera_field (ชื่อจาก Ragnarok) เป็น ban_pak_ao (บ้านปากอ่าว)
-- ตำแหน่งเดิมใช้ไม่ได้กับผังใหม่ ให้ทุกคนเริ่มที่ลานกลาง (จุดเกิดใหม่ 24,16)
UPDATE characters SET map = 'ban_pak_ao', x = 24, y = 16 WHERE map = 'prontera_field';
