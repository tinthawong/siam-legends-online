// หน้าต่างค่าพลัง (docs/stat-system.md): ภาพกรอบ ui/stats/stat-panel.webp + ทุกช่องวางตาม shared/data/stat-panel-layout.json
// root = <section id="stat-panel"> (มี img กรอบ, ปุ่มปิด .sp-close, #st-tip) — เปิด/ปิดโดย main.ts
import STAT_LAYOUT from "../../shared/data/stat-panel-layout.json";
import type { PlayerStats } from "../../shared/protocol";
import { statCost, STAT_MAX, type StatKey } from "../../shared/game";

export const STATS: { key: StatKey; name: string; desc: string; tip: string }[] = [
  { key: "str", name: "STR", desc: "พลัง", tip: "เพิ่ม ATK มาก และน้ำหนักที่แบกได้" },
  { key: "agi", name: "AGI", desc: "ว่องไว", tip: "เพิ่ม FLEE และความเร็วโจมตี (ASPD)" },
  { key: "vit", name: "VIT", desc: "อึด", tip: "เพิ่ม MAX HP, DEF เสริม และการฟื้น HP" },
  { key: "int", name: "INT", desc: "ปัญญา", tip: "เพิ่ม MATK, MAX SP, MDEF เสริม และการฟื้น SP" },
  { key: "dex", name: "DEX", desc: "แม่นยำ", tip: "เพิ่ม HIT, ATK เล็กน้อย, ASPD เล็กน้อย และร่ายเวทเร็วขึ้น" },
  { key: "luk", name: "LUK", desc: "โชค", tip: "เพิ่ม CRITICAL, หลบสมบูรณ์ และ ATK เล็กน้อย" },
];

/** onAdd: กด + ของค่านั้น (กดค้าง = เรียกซ้ำ) · update: ค่าใหม่จาก server */
export function createStatPanel(root: HTMLElement, onAdd: (stat: StatKey) => void): { update(s: PlayerStats): void } {
  let last: PlayerStats | null = null;
  const tipEl = root.querySelector<HTMLElement>("#st-tip")!;

  // ภาพหน้าต่าง: ทุกช่องวางตาม stat-panel-layout.json (พิกเซลของภาพเต็ม → % ของกรอบ ย่อแล้วตามสัดส่วนเอง)
  type Box = { x: number; y: number; w: number; h: number };
  const [PW, PH] = STAT_LAYOUT.size;
  const place = <T extends HTMLElement>(el: T, b: Box): T => {
    el.style.left = `${(b.x / PW) * 100}%`; el.style.top = `${(b.y / PH) * 100}%`;
    el.style.width = `${(b.w / PW) * 100}%`; el.style.height = `${(b.h / PH) * 100}%`;
    return el;
  };
  const spBox = (cls: string, b: Box, html = "") => {
    const el = document.createElement("div");
    el.className = `sp-box ${cls}`;
    el.innerHTML = html;
    root.insertBefore(place(el, b), tipEl);
    return el;
  };
  const spIcon = (b: Box, file: string) => spBox("sp-icon", b, `<img src="/ui/stats/icons/${file}.webp" alt="" draggable="false" />`);
  spBox("sp-title", STAT_LAYOUT.title, "ค่าพลัง");
  spBox("sp-head", STAT_LAYOUT.leftHeader, "ค่าพลังหลัก");
  spBox("sp-head", STAT_LAYOUT.rightHeader, "ความสามารถ");
  spBox("sp-points", STAT_LAYOUT.pointsBar, `แต้มว่าง <b id="st-points">0</b>`);
  const cl = STAT_LAYOUT.close;
  place(root.querySelector<HTMLElement>(".sp-close")!, { x: cl.cx - cl.r, y: cl.cy - cl.r, w: cl.r * 2, h: cl.r * 2 });

  // แตะหรือชี้ที่ช่องไหน ขึ้นคำอธิบายสั้น ๆ ใต้ช่องนั้น (ล้นขอบล่าง = ขึ้นเหนือช่อง)
  const showTip = (el: HTMLElement, text: string) => {
    tipEl.textContent = text;
    tipEl.hidden = false;
    const p = root.getBoundingClientRect(), r = el.getBoundingClientRect();
    const left = Math.max(0, Math.min(r.left - p.left, p.width - tipEl.offsetWidth));
    const below = r.bottom - p.top + 4;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${below + tipEl.offsetHeight > p.height ? r.top - p.top - tipEl.offsetHeight - 4 : below}px`;
  };
  const bindTip = (els: HTMLElement[], text: string) => {
    for (const el of els) {
      el.addEventListener("pointerenter", () => showTip(el, text));
      el.addEventListener("click", () => showTip(el, text));
      el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") tipEl.hidden = true; });
    }
  };
  // แตะที่อื่นในหน้าต่าง (ไม่ใช่ช่องที่มีคำอธิบาย) = ปิดคำอธิบาย
  root.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".sp-icon, .sp-value")) tipEl.hidden = true;
  });

  // ขวา: 10 ช่องตาม derivedOrder · ค่าอยู่ใน #dv-<key> (เติมใน update)
  const DV: Record<string, { key: string; icon: string; tip: string }> = {
    ATK: { key: "atk", icon: "atk", tip: "พลังโจมตีกายภาพ — เพิ่มจาก STR (มาก), DEX, LUK" },
    MATK: { key: "matk", icon: "matk", tip: "พลังเวท ต่ำสุด ~ สูงสุด — เพิ่มจาก INT" },
    HIT: { key: "hit", icon: "hit", tip: "ความแม่นยำ ยิ่งสูงยิ่งตีโดน — เพิ่มจากเลเวลและ DEX" },
    CRITICAL: { key: "crit", icon: "critical", tip: "โอกาสคริติคอล ตีโดนแน่นอน แรงขึ้น 40% ไม่สน DEF — เพิ่มจาก LUK" },
    "MAX HP": { key: "maxhp", icon: "maxhp", tip: "พลังชีวิตสูงสุด — เพิ่มจากเลเวลและ VIT" },
    DEF: { key: "def", icon: "def", tip: "DEF เกราะ + DEF เสริม ลดดาเมจกายภาพ — DEF เสริมเพิ่มจาก VIT" },
    MDEF: { key: "mdef", icon: "mdef", tip: "MDEF เกราะ + MDEF เสริม ลดดาเมจเวท — MDEF เสริมเพิ่มจาก INT" },
    FLEE: { key: "flee", icon: "flee", tip: "การหลบ + หลบสมบูรณ์ — FLEE เพิ่มจากเลเวลและ AGI, หลบสมบูรณ์เพิ่มจาก LUK" },
    ASPD: { key: "aspd", icon: "aspd", tip: "ความเร็วโจมตี ยิ่งสูงยิ่งตีถี่ — เพิ่มจาก AGI (มาก) และ DEX" },
    "MAX SP": { key: "maxsp", icon: "maxsp", tip: "พลังเวทสูงสุด — เพิ่มจากเลเวลและ INT" },
  };
  STAT_LAYOUT.derivedOrder.forEach((name, i) => {
    const d = DV[name], cell = STAT_LAYOUT.derivedCells[i];
    if (!d || !cell) return;
    const icon = spIcon(cell.icon, d.icon);
    const val = spBox("sp-value sp-dv", cell.value, `<span>${name}</span><b id="dv-${d.key}"></b>`);
    bindTip([icon, val], d.tip);
  });

  // ซ้าย: 6 แถวตาม baseOrder (ไอคอน · ชื่อ/ค่า · โบนัสสีทอง · ปุ่ม +) กด + ทีละ 1 หรือกดค้างเพิ่มต่อเนื่อง
  const statRow: Record<string, { v: HTMLElement; bonus: HTMLElement; btn: HTMLButtonElement }> = {};
  STAT_LAYOUT.baseOrder.forEach((name, i) => {
    const st = STATS.find((x) => x.name === name), row = STAT_LAYOUT.baseRows[i];
    if (!st || !row) return;
    const icon = spIcon(row.icon, st.key);
    const val = spBox("sp-value", row.value, `<span>${st.name}</span><b>5</b>`);
    const bonus = spBox("sp-bonus", row.bonus);
    bindTip([icon, val], `${st.name} (${st.desc}): ${st.tip}`);
    const btn = place(document.createElement("button"), row.plus);
    btn.type = "button";
    btn.className = "sp-box sp-plus";
    btn.setAttribute("aria-label", `เพิ่ม ${st.desc}`);
    btn.innerHTML = `<img src="/ui/stats/icons/plus.webp" alt="" draggable="false" />`;
    root.insertBefore(btn, tipEl);
    const img = btn.querySelector("img")!;
    statRow[st.key] = { v: val.querySelector("b")!, bonus, btn };
    let timer = 0;
    const stop = () => { clearTimeout(timer); clearInterval(timer); timer = 0; img.src = "/ui/stats/icons/plus.webp"; };
    const add = () => {
      if (!last || last.stats[st.key] >= STAT_MAX || last.points < statCost(last.stats[st.key])) { stop(); return; }
      onAdd(st.key);
      // คาดค่าล่วงหน้าไว้ก่อน server ตอบ กันกดค้างแล้วส่งเกินแต้ม (server ตรวจซ้ำเสมอ)
      last = { ...last, points: last.points - statCost(last.stats[st.key]), stats: { ...last.stats, [st.key]: last.stats[st.key] + 1 } };
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      img.src = "/ui/stats/icons/plus-pressed.webp"; // ตอนกด
      add();
      timer = window.setTimeout(() => { timer = window.setInterval(add, 110); }, 400);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
  });

  return {
    update(s: PlayerStats) {
      last = s;
      const dv = s.derived;
      const put = (id: string, v: string) => { root.querySelector(`#${id}`)!.textContent = v; };
      put("dv-atk", String(dv.atk));
      put("dv-matk", `${dv.matkMin} ~ ${dv.matkMax}`);
      put("dv-hit", String(dv.hit));
      put("dv-flee", `${dv.flee} + ${Math.round(dv.perfectDodge * 10) / 10}`);
      put("dv-crit", `${dv.crit.toFixed(1)}%`);
      put("dv-maxhp", String(s.maxHp));
      put("dv-maxsp", String(s.maxSp));
      put("dv-def", `${dv.defPct} + ${dv.defBonus}`);
      put("dv-mdef", `${dv.mdefPct} + ${dv.mdefBonus}`);
      put("dv-aspd", (200 - dv.aspdMs / 20).toFixed(1)); // แบบ Ragnarok
      put("st-points", String(s.points));
      for (const st of STATS) {
        const r = statRow[st.key], x = s.stats[st.key];
        if (!r) continue;
        r.v.textContent = String(x);
        r.bonus.textContent = s.bonus[st.key] ? `${s.bonus[st.key] > 0 ? "+" : ""}${s.bonus[st.key]}` : ""; // โบนัสจากอุปกรณ์
        r.btn.disabled = x >= STAT_MAX || s.points < statCost(x); // แต้มไม่พอ = ปุ่มจางครึ่งหนึ่ง
      }
    },
  };
}
