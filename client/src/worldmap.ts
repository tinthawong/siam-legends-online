// แผนที่โลก: ภาพ ui/world-map.webp (ต้นฉบับ art/ui/world-map-labeled.png, แบบไม่มีป้าย world-map.png)
// จุด "คุณอยู่ที่นี่" วางตามพิกัดพิกเซลของภาพเต็ม — เพิ่มแมพใหม่ = เพิ่มพิกัดในตารางนี้ (id แมพตาม shared/data/maps)
const SIZE = [1448, 1086];
const PINS: Record<string, [number, number]> = {
  "ban-pak-ao": [728, 906], // บ้านปากอ่าว Lv.1–12
  "thung-na": [1206, 823],  // ทุ่งนาริมคลอง Lv.12–20
};

export function setWorldMapPin(mapId: string) {
  const pin = document.getElementById("wm-pin")!;
  const p = PINS[mapId];
  pin.hidden = !p;
  if (p) {
    pin.style.left = `${(p[0] / SIZE[0]) * 100}%`;
    pin.style.top = `${(p[1] / SIZE[1]) * 100}%`;
  }
}
