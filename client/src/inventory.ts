import LAYOUT from "../../shared/data/inventory-layout.json";
import { ITEMS, type ItemKind } from "../../shared/items";
import type { InvItem } from "../../shared/protocol";

// หน้ากระเป๋าจากภาพ ui/inventory-panel.webp (docs/ui-controls.md)
// พิกัดใน shared/data/inventory-layout.json เป็นพิกเซลของภาพเต็ม → แปลงเป็น % ของกรอบ ย่อขยายตามภาพได้เอง
// แถบเลื่อนทองถูกลบออกจากภาพแล้ว (ต้นฉบับอยู่ art/ui/) วาดใหม่เป็น ui/inventory-thumb.webp ขยับตามหน้าที่อยู่

const [W, H] = LAYOUT.size;
const PER_PAGE = LAYOUT.slots.length;
// ตำแหน่งแถบเลื่อน (วัดจากภาพ): ขอบบนต่ำสุด / สูงสุดที่ขยับได้
const THUMB = { x: 806, w: 32, h: 356, top: 318, bottom: 759 };

const TABS: { name: string; kind: ItemKind | null }[] = [
  { name: "ทั้งหมด", kind: null },
  { name: "ใช้ได้", kind: "use" },
  { name: "อุปกรณ์", kind: "equip" },
  { name: "วัตถุดิบ", kind: "material" },
  { name: "เควส", kind: "quest" },
];

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
function place(el: HTMLElement, x: number, y: number, w: number, h: number) {
  el.style.left = pct(x, W);
  el.style.top = pct(y, H);
  el.style.width = pct(w, W);
  el.style.height = pct(h, H);
}

export interface Inventory {
  setItems(items: InvItem[]): void;
  setMoney(money: number): void;
}

/**
 * root = <section id="bag"> (ว่างเปล่า) — เปิด/ปิดโดย main.ts
 * onUse: แตะไอเท็มที่ใช้ได้ · onClose: กดปุ่มกระเป๋าในกรอบ
 */
export function createInventory(root: HTMLElement, onUse: (item: string) => void, onClose: () => void): Inventory {
  let items: InvItem[] = [];
  let tab = 0;
  let page = 0;

  root.classList.add("inv");
  const img = document.createElement("img");
  img.className = "inv-bg";
  img.src = "/ui/inventory-panel.webp";
  img.alt = "";
  img.draggable = false;
  root.appendChild(img);

  const tabEls = TABS.map((t, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inv-tab";
    b.textContent = t.name;
    const r = LAYOUT.tabs[i];
    place(b, r.cx - r.w / 2, r.cy - r.h / 2, r.w, r.h);
    b.onclick = () => { tab = i; page = 0; render(); };
    root.appendChild(b);
    return b;
  });

  const slotEls = LAYOUT.slots.map((r) => {
    const s = document.createElement("div");
    s.className = "inv-slot";
    place(s, r.x, r.y, r.w, r.h);
    root.appendChild(s);
    return s;
  });

  const thumb = document.createElement("img");
  thumb.className = "inv-thumb";
  thumb.src = "/ui/inventory-thumb.webp";
  thumb.alt = "";
  thumb.draggable = false;
  root.appendChild(thumb);

  const circle = (c: { cx: number; cy: number; r: number }, label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inv-hit";
    b.setAttribute("aria-label", label);
    place(b, c.cx - c.r, c.cy - c.r, c.r * 2, c.r * 2);
    b.onclick = fn;
    root.appendChild(b);
    return b;
  };
  circle(LAYOUT.pageUp, "หน้าก่อน", () => { if (page > 0) { page--; render(); } });
  circle(LAYOUT.pageDown, "หน้าถัดไป", () => { if (page < pages() - 1) { page++; render(); } });

  const money = document.createElement("div");
  money.className = "inv-money";
  place(money, LAYOUT.moneyBar.x, LAYOUT.moneyBar.y, LAYOUT.moneyBar.w, LAYOUT.moneyBar.h);
  root.appendChild(money);
  // gemBar: ยังไม่ใช้ ปล่อยว่าง

  // ปุ่มล่าง: ปุ่มที่ยังไม่มีหน้าปลายทาง กดแล้วไม่เกิดอะไร
  const NAV: Record<string, [string, (() => void) | null]> = {
    bag: ["กระเป๋า", onClose],
    consumables: ["ของใช้ได้", () => { tab = 1; page = 0; render(); }],
    quest: ["เควส", null],
    settings: ["ตั้งค่า", null],
    menu: ["เมนู", null],
  };
  for (const n of LAYOUT.navButtons) {
    const [label, fn] = NAV[n.id] ?? [n.id, null];
    circle(n, label, fn ?? (() => {}));
  }

  const shown = () => {
    const kind = TABS[tab].kind;
    return items.filter((it) => ITEMS[it.item] && (!kind || ITEMS[it.item].kind === kind));
  };
  const pages = () => Math.max(1, Math.ceil(shown().length / PER_PAGE));

  function render() {
    const list = shown();
    const n = pages();
    page = Math.min(page, n - 1);
    tabEls.forEach((b, i) => {
      b.classList.toggle("on", i === tab);
      b.setAttribute("aria-pressed", String(i === tab));
    });

    slotEls.forEach((s, i) => {
      const it = list[page * PER_PAGE + i];
      s.replaceChildren();
      s.onclick = null;
      s.className = "inv-slot";
      s.removeAttribute("title");
      if (!it) return;
      const def = ITEMS[it.item];
      s.title = `${def.name} ×${it.count}${def.heal ? ` · กดเพื่อกิน (เติมเลือด ${def.heal})` : ""}`;
      if (def.icon) {
        const icon = document.createElement("img");
        icon.src = `/sprites/items/${def.icon}-64.png`;
        icon.alt = def.name;
        icon.draggable = false;
        s.appendChild(icon);
      } else {
        // ไอเท็มที่ยังไม่มีภาพ แสดงชื่อแทน
        const name = document.createElement("small");
        name.textContent = def.name;
        s.appendChild(name);
      }
      if (it.count > 1) {
        const c = document.createElement("span");
        c.className = "n";
        c.textContent = String(it.count);
        s.appendChild(c);
      }
      if (def.heal) {
        s.classList.add("usable");
        s.onclick = () => onUse(it.item);
      }
    });

    const top = n > 1 ? THUMB.top + ((THUMB.bottom - THUMB.top) * page) / (n - 1) : THUMB.top;
    place(thumb, THUMB.x, top, THUMB.w, THUMB.h);
  }

  render();
  return {
    setItems(next) { items = next; render(); },
    setMoney(v) { money.textContent = v.toLocaleString("th-TH"); },
  };
}
