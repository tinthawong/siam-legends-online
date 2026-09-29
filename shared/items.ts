// ไอเท็ม — รูปอยู่ที่ client/public/sprites/items/<icon>-16.png (หล่นบนพื้น) และ <icon>-64.png (ในกระเป๋า)
// ต้นฉบับอยู่ที่ art/items/
export interface ItemDef {
  name: string;
  icon: string;
}

export const ITEMS: Record<string, ItemDef> = {
  crab_claw: { name: "ก้ามปูนา", icon: "crab-claw" },
  red_crab_claw: { name: "ก้ามปูแดง", icon: "red-crab-claw" },
};
