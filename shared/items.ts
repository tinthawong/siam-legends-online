// ไอเท็ม — รูปอยู่ที่ client/public/sprites/items/<icon>-16.png (หล่นบนพื้น) และ <icon>-64.png (ในกระเป๋า)
// ต้นฉบับอยู่ที่ art/items/
export interface ItemDef {
  name: string;
  icon: string;
  heal?: number;  // ใช้แล้วเติมเลือดเท่านี้ (ยา)
  price?: number; // ซื้อได้ในหน้าเงิน ราคาเป็นเบี้ย
}

export const ITEMS: Record<string, ItemDef> = {
  crab_claw: { name: "ก้ามปูนา", icon: "crab-claw" },
  red_crab_claw: { name: "ก้ามปูแดง", icon: "red-crab-claw" },
  // รูปยาเป็นรูปชั่วคราววาดด้วยโค้ด (tools/placeholder_potion.py) รอรูปจริง
  herb_potion: { name: "ยาสมุนไพร", icon: "herb-potion", heal: 60, price: 10 },
};
