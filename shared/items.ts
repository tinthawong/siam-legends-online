// ไอเท็ม — รูปอยู่ที่ client/public/sprites/items/<icon>-16.png (หล่นบนพื้น) และ <icon>-64.png (ในกระเป๋า)
// ต้นฉบับอยู่ที่ art/items/
export interface ItemDef {
  name: string;
  icon?: string; // ไม่มี = ยังไม่มีภาพ (กระเป๋าแสดงชื่อแทน)
  heal?: number;  // ใช้แล้วเติมเลือดเท่านี้ (ยา)
  price?: number; // ซื้อได้ในหน้าเงิน ราคาเป็นเบี้ย
}

export const ITEMS: Record<string, ItemDef> = {
  crab_claw: { name: "ก้ามปูนา", icon: "crab-claw" },
  red_crab_claw: { name: "ก้ามปูแดง", icon: "red-crab-claw" },
  // รูปยาเป็นรูปชั่วคราววาดด้วยโค้ด (tools/placeholder_potion.py) รอรูปจริง
  straw_hat: { name: "หมวกฟาง", icon: "straw-hat" },     // ดรอปหุ่นไล่กา
  lotus: { name: "ดอกบัว", icon: "lotus" },                // ดรอปกบบัว
  sickle: { name: "เคียว", icon: "sickle" },              // ดรอปตั๊กแตนเคียว
  iron_helmet: { name: "หมวกเหล็ก", icon: "iron-helmet" }, // ดรอปหมึกหมวกเหล็ก
  sai_sin: { name: "สายสิญจน์" },                          // รางวัลเควส q001 ยังไม่มีภาพ/ค่าพลัง
  herb_potion: { name: "ยาสมุนไพร", icon: "herb-potion", heal: 60, price: 10 },
};
