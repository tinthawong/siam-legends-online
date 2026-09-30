// จอยสติ๊ก + ปุ่มโจมตี (docs/ui-controls.md) — แสดงทั้งมือถือและคอม (ผู้ใช้ตัดสินใจ)
// เป็น DOM ซ้อนบน canvas ภาพวาดความละเอียดสูง ย่อด้วยเบราว์เซอร์ (ไม่ใช้ pixelated)

const KNOB_RANGE = 0.3; // ลูกแก้วลากได้ไม่เกินขอบกระจก: รัศมีกระจก ≈ 30% ของความกว้างฐาน
const DEADZONE = 0.25;  // ลากน้อยกว่านี้ (สัดส่วนของรัศมีที่ลากได้) ยังไม่เดิน

/**
 * onMove(dx, dy) ทิศที่ลาก (ความยาว 1) หรือ null = ปล่อยนิ้ว / ยังไม่พ้นระยะเริ่มเดิน
 */
export function bindJoystick(root: HTMLElement, onMove: (dir: { dx: number; dy: number } | null) => void) {
  const knob = root.querySelector<HTMLElement>(".joy-knob")!;
  let pointer: number | null = null;
  let active = false;

  const set = (x: number, y: number) => { knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; };
  const update = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    const max = r.width * KNOB_RANGE;
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > max) { x *= max / d; y *= max / d; }
    set(x, y);
    if (d >= max * DEADZONE) { active = true; onMove({ dx: x / Math.hypot(x, y), dy: y / Math.hypot(x, y) }); }
    else if (active) { active = false; onMove(null); }
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    root.classList.remove("held");
    set(0, 0); // ดีดกลับกลาง
    if (active) { active = false; onMove(null); }
  };

  root.addEventListener("pointerdown", (e) => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    root.setPointerCapture(e.pointerId);
    root.classList.add("held");
    update(e);
  });
  root.addEventListener("pointermove", (e) => { if (e.pointerId === pointer) update(e); });
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
}

/** ปุ่มโจมตี: กดแล้วสลับเป็นภาพกดค้างจนกว่าจะปล่อย */
export function bindAttackButton(btn: HTMLButtonElement, onPress: () => void) {
  const img = btn.querySelector("img")!;
  const up = () => { img.src = "/ui/attack-button.webp"; };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    img.src = "/ui/attack-button-pressed.webp";
    onPress();
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, up);
  // โหลดภาพกดค้างไว้ก่อน จะได้ไม่กะพริบตอนกดครั้งแรก
  new Image().src = "/ui/attack-button-pressed.webp";
}
