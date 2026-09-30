import { MAP_ID } from "../../shared/constants";

// แผนที่โลก: ภาพ ui/world-map.webp (ต้นฉบับ art/ui/world-map-labeled.png, แบบไม่มีป้าย world-map.png)
// จุด "คุณอยู่ที่นี่" วางตามพิกัดพิกเซลของภาพเต็ม — เพิ่มแมพใหม่ = เพิ่มพิกัดในตารางนี้
const SIZE = [1448, 1086];
const PINS: Record<string, [number, number]> = {
  ban_pak_ao: [728, 906], // บ้านปากอ่าว Lv.1–12
};

export function bindWorldMap() {
  const pin = document.getElementById("wm-pin")!;
  const p = PINS[MAP_ID];
  pin.hidden = !p;
  if (p) {
    pin.style.left = `${(p[0] / SIZE[0]) * 100}%`;
    pin.style.top = `${(p[1] / SIZE[1]) * 100}%`;
  }
}
