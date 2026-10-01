// ไอเท็ม — รูปอยู่ที่ client/public/sprites/items/<icon>-16.png (หล่นบนพื้น) และ <icon>-64.png (ในกระเป๋า)
// pixel: ภาพพิกเซลจริง 32×32 → บนพื้นใช้ <icon>-32.png ขนาดจริง, กระเป๋าใช้ -64 (ขยาย NEAREST) ย่อขยายไม่เกลี่ยสี
// ต้นฉบับอยู่ที่ art/items/
/** ชนิดไอเท็ม ใช้กรองตามแท็บในกระเป๋า (ใช้ได้ / อุปกรณ์ / วัตถุดิบ / เควส) */
export type ItemKind = "use" | "equip" | "material" | "quest";

export interface ItemDef {
  name: string;
  kind: ItemKind;
  icon?: string; // ไม่มี = ยังไม่มีภาพ (กระเป๋าแสดงชื่อแทน)
  heal?: number;  // ใช้แล้วเติมเลือดเท่านี้ (ยา)
  sp?: number;    // ใช้แล้วเติม SP เท่านี้ (ยา)
  pixel?: boolean;
  price?: number; // ซื้อได้ในหน้าเงิน ราคาเป็นเบี้ย
}

export const ITEMS: Record<string, ItemDef> = {
  crab_claw: { name: "ก้ามปูนา", kind: "material", icon: "crab-claw" },
  red_crab_claw: { name: "ก้ามปูแดง", kind: "material", icon: "red-crab-claw" },
  straw_hat: { name: "หมวกฟาง", kind: "equip", icon: "straw-hat" },     // ดรอปหุ่นไล่กา
  lotus: { name: "ดอกบัว", kind: "material", icon: "lotus" },                // ดรอปกบบัว
  sickle: { name: "เคียว", kind: "equip", icon: "sickle" },              // ดรอปตั๊กแตนเคียว
  iron_helmet: { name: "หมวกเหล็ก", kind: "equip", icon: "iron-helmet" }, // ดรอปหมึกหมวกเหล็ก
  sai_sin: { name: "สายสิญจน์", kind: "equip" },                          // รางวัลเควส q001 ยังไม่มีภาพ/ค่าพลัง
  // ยา: มอนทุกตัวตอนตายสุ่มดรอปยาแดง 30% และยาฟ้า 30% แยกกัน (POTION_DROPS ใน server) · ยาแดงแทนยาสมุนไพรเดิม (migration 0013)
  potion_red: { name: "ยาแดง", kind: "use", icon: "potion-red", heal: 60, price: 10, pixel: true },
  potion_sky: { name: "ยาฟ้า", kind: "use", icon: "potion-sky", sp: 30, pixel: true },
};
