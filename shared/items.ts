// ไอเท็ม — รูปอยู่ที่ client/public/sprites/items/<icon>-16.png (หล่นบนพื้น) และ <icon>-64.png (ในกระเป๋า)
// ต้นฉบับอยู่ที่ art/items/
/** ชนิดไอเท็ม ใช้กรองตามแท็บในกระเป๋า (ใช้ได้ / อุปกรณ์ / วัตถุดิบ / เควส) */
export type ItemKind = "use" | "equip" | "material" | "quest";

export interface ItemDef {
  name: string;
  kind: ItemKind;
  icon?: string; // ไม่มี = ยังไม่มีภาพ (กระเป๋าแสดงชื่อแทน)
  heal?: number;  // ใช้แล้วเติมเลือดเท่านี้ (ยา)
  price?: number; // ซื้อได้ในหน้าเงิน ราคาเป็นเบี้ย
}

export const ITEMS: Record<string, ItemDef> = {
  crab_claw: { name: "ก้ามปูนา", kind: "material", icon: "crab-claw" },
  red_crab_claw: { name: "ก้ามปูแดง", kind: "material", icon: "red-crab-claw" },
  // รูปยาเป็นรูปชั่วคราววาดด้วยโค้ด (tools/placeholder_potion.py) รอรูปจริง
  straw_hat: { name: "หมวกฟาง", kind: "equip", icon: "straw-hat" },     // ดรอปหุ่นไล่กา
  lotus: { name: "ดอกบัว", kind: "material", icon: "lotus" },                // ดรอปกบบัว
  sickle: { name: "เคียว", kind: "equip", icon: "sickle" },              // ดรอปตั๊กแตนเคียว
  iron_helmet: { name: "หมวกเหล็ก", kind: "equip", icon: "iron-helmet" }, // ดรอปหมึกหมวกเหล็ก
  sai_sin: { name: "สายสิญจน์", kind: "equip" },                          // รางวัลเควส q001 ยังไม่มีภาพ/ค่าพลัง
  herb_potion: { name: "ยาสมุนไพร", kind: "use", icon: "herb-potion", heal: 60, price: 10 },
};
