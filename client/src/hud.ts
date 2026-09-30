import LAYOUT from "../../shared/data/hud-layout.json";
import { MAX_LEVEL } from "../../shared/game";
import type { PlayerStats, ServerMsg } from "../../shared/protocol";

// แถบสถานะ (เลเวล HP SP) + แถบ EXP เต็มจอ ตาม docs/hud-status.md
// ภาพกรอบ ui/hud/status-frame.webp ตำแหน่งช่องจาก shared/data/hud-layout.json (พิกเซลภาพเต็ม → % ของกรอบ)

const FRAME = LAYOUT["status-frame.png"];
const [FW, FH] = FRAME.size;
const XP = LAYOUT.exp;

const $ = (id: string) => document.getElementById(id)!;
type Box = { x: number; y: number; w: number; h: number };
function place(el: HTMLElement, b: Box) {
  el.style.left = `${(b.x / FW) * 100}%`;
  el.style.top = `${(b.y / FH) * 100}%`;
  el.style.width = `${(b.w / FW) * 100}%`;
  el.style.height = `${(b.h / FH) * 100}%`;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** เปอร์เซ็นต์ทศนิยม 2 ตำแหน่ง ปัดลง (ไม่ขึ้น 100.00% ก่อนเลเวลขึ้นจริง) */
const pct = (exp: number, next: number) => (Math.floor((exp / Math.max(1, next)) * 10000) / 100).toFixed(2);

/** แถบ HP/SP: ค่าลดลง = ส่วนที่หายค้างเป็นสีขาวครู่หนึ่งแล้วค่อยหดตาม */
function bar(el: HTMLElement, label: string) {
  const fill = el.querySelector<HTMLElement>(".fill")!, ghost = el.querySelector<HTMLElement>(".ghost")!;
  const text = el.querySelector<HTMLElement>(".txt")!;
  let last = -1, timer = 0;
  return (cur: number, max: number) => {
    const w = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    fill.style.width = `${w}%`;
    text.textContent = `${label} ${cur} / ${max}`;
    clearTimeout(timer);
    if (w < last) timer = window.setTimeout(() => { ghost.style.width = `${w}%`; }, 400);
    else { ghost.style.transition = "none"; ghost.style.width = `${w}%`; void ghost.offsetWidth; ghost.style.transition = ""; }
    last = w;
    return w;
  };
}

export function createHud(name: string) {
  // กรอบสถานะ
  place($("hs-plate"), FRAME.namePlate);
  place($("hs-hp"), FRAME.hpBar);
  place($("hs-sp"), FRAME.spBar);
  $("hs-name").textContent = name;
  const hp = bar($("hs-hp"), "HP"), sp = bar($("hs-sp"), "SP");

  // แถบ EXP 3 ท่อน: สัดส่วนทุกช่องเทียบความสูงภาพ (68) ใส่เป็นตัวแปร CSS
  const xp = $("hud-exp");
  xp.style.setProperty("--cap", String(XP.capWidth / XP.height));
  xp.style.setProperty("--xl", String(XP.bar.insetLeft / XP.height));
  xp.style.setProperty("--xr", String(XP.bar.insetRight / XP.height));
  xp.style.setProperty("--xy", String(XP.bar.y / XP.height));
  xp.style.setProperty("--xbh", String(XP.bar.h / XP.height));
  const xpFill = $("xp-fill"), xpText = $("xp-text"), tip = $("xp-tip"), lv = $("hs-lv");

  // สิ่งที่แสดงอยู่ (อาจช้ากว่าค่าจริงระหว่างเล่นแถบวิ่ง)
  let shown = { level: 0, exp: 0, expNext: 1 };
  let animating = false;
  let pending: PlayerStats | null = null;

  const drawExp = (level: number, exp: number, next: number, smooth = true) => {
    const max = level >= MAX_LEVEL;
    const w = max ? 100 : Math.min(100, (exp / Math.max(1, next)) * 100);
    if (!smooth) { xpFill.style.transition = "none"; xpFill.style.width = `${w}%`; void xpFill.offsetWidth; xpFill.style.transition = ""; }
    else xpFill.style.width = `${w}%`;
    xpText.textContent = max ? "MAX" : `EXP ${exp.toLocaleString("th-TH")} (${pct(exp, next)}%)`;
    shown = { level, exp, expNext: next };
  };

  // ชี้เมาส์ / แตะ: กล่อง EXP : ปัจจุบัน / ที่ต้องใช้ [xx.xx%] หายเองใน 3 วินาที
  let tipTimer = 0;
  const showTip = () => {
    tip.textContent = shown.level >= MAX_LEVEL ? "EXP : MAX"
      : `EXP : ${shown.exp.toLocaleString("th-TH")} / ${shown.expNext.toLocaleString("th-TH")} [${pct(shown.exp, shown.expNext)}%]`;
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => { tip.hidden = true; }, 3000);
  };
  xp.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") showTip(); });
  xp.addEventListener("click", showTip);

  const setLevel = (level: number, bump: boolean) => {
    lv.textContent = `Lv. ${level}`;
    if (bump) { lv.classList.remove("bump"); void lv.offsetWidth; lv.classList.add("bump"); }
  };

  // LEVEL UP! กลางจอ 2 วินาที (ขึ้นหลายเลเวลในครั้งเดียว = แสดงครั้งเดียว บอกเลเวลสุดท้าย)
  let bannerTimer = 0;
  const levelUpBanner = (level: number) => {
    const b = $("levelup-banner");
    $("levelup-lv").textContent = `Lv. ${level}`;
    b.hidden = false;
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => { b.hidden = true; }, 2000);
  };

  let queue = Promise.resolve();
  const api = {
    stats(s: PlayerStats) {
      const hpW = hp(s.hp, s.maxHp);
      sp(s.sp, s.maxSp);
      $("hs-hp").classList.toggle("low", s.hp > 0 && hpW < 25); // HP ต่ำกว่า 25% กะพริบช้า ๆ
      if (animating) { pending = s; return; }
      if (shown.level && s.level !== shown.level) setLevel(s.level, false);
      else if (!shown.level) setLevel(s.level, false);
      drawExp(s.level, s.exp, s.expNext, shown.level === s.level);
    },
    /** ได้ EXP: แถบเลื่อนนุ่ม ๆ 0.3 วิ เลเวลขึ้น = วิ่งเต็ม → แวบ → กลับศูนย์ ทีละเลเวล แล้ววิ่งต่อด้วย EXP ที่เหลือ */
    expGain(m: Extract<ServerMsg, { t: "exp_gain" }>) {
      queue = queue.then(async () => {
        const ups = shown.level ? m.level - shown.level : 0;
        if (ups <= 0) { drawExp(m.level, m.exp, m.expNext); return; }
        animating = true;
        for (let i = 0; i < ups; i++) {
          xpFill.style.width = "100%";
          await wait(320);
          xp.classList.remove("flash"); void xp.offsetWidth; xp.classList.add("flash");
          await wait(180);
          setLevel(shown.level + 1, true);
          drawExp(shown.level + 1, 0, 1, false);
          await wait(40);
        }
        drawExp(m.level, m.exp, m.expNext);
        levelUpBanner(m.level);
        animating = false;
        if (pending) { const p = pending; pending = null; api.stats(p); }
      });
    },
  };
  return api;
}
