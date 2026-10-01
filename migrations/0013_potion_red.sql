-- ยาสมุนไพร (herb_potion) เปลี่ยนเป็นยาแดง (potion_red): ย้ายของในกระเป๋า รวมกับยาแดงที่มีอยู่แล้ว
INSERT INTO inventory (user_id, item, count)
  SELECT user_id, 'potion_red', count FROM inventory WHERE item = 'herb_potion' AND count > 0
  ON CONFLICT (user_id, item) DO UPDATE SET count = inventory.count + excluded.count;
DELETE FROM inventory WHERE item = 'herb_potion';
