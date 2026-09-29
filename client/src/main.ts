import Phaser from "phaser";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { GameScene } from "./GameScene";
import { Net } from "./net";
import { CLOSE_KICKED } from "../../shared/protocol";
import type { Look } from "../../shared/appearance";
import { Creator } from "./creator";
import { NAME_RE } from "../../shared/constants";
import { ITEMS } from "../../shared/items";
import type { InvItem, PlayerStats } from "../../shared/protocol";

interface Character { name: string; level: number; exp: number; look: Look }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ["loading", "login", "create", "hud"];
function show(id: string) {
  for (const s of screens) $(s).hidden = s !== id;
}
function say(id: string, text: string, ok = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("ok", ok);
}

let toastTimer = 0;
function toast(text: string) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2600);
}

/** ลิงก์ที่ยังไม่มีปลายทาง (href="#" data-soon) และปุ่มตั้งค่าใน footer ทำงานได้แม้ยังไม่ได้ตั้งค่า Supabase */
function bindChrome() {
  document.querySelectorAll<HTMLAnchorElement>("a[data-soon]").forEach((a) => {
    a.addEventListener("click", (e: MouseEvent) => {
      if (a.getAttribute("href") !== "#") return;
      e.preventDefault();
      toast("เร็ว ๆ นี้");
    });
  });

  const btn = $("btn-settings"), pop = $("settings-pop"), fx = $<HTMLInputElement>("opt-fx");
  btn.onclick = () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
  };
  let fxOn = true;
  try { fxOn = localStorage.getItem("fx") !== "off"; } catch {}
  fx.checked = fxOn;
  document.body.classList.toggle("no-fx", !fxOn);
  fx.onchange = () => {
    document.body.classList.toggle("no-fx", !fx.checked);
    try { localStorage.setItem("fx", fx.checked ? "on" : "off"); } catch {}
  };
}

let sb: SupabaseClient;
let started = false;
let creator: Creator | null = null;

/** หน้าสร้างตัวละคร: guest = มาจากปุ่มผู้เยี่ยมชม ยังไม่มีบัญชี จะสร้างบัญชีตอนกดยืนยัน */
let guestFlow = false;
function showCreate(guest = false) {
  guestFlow = guest;
  $("btn-create").textContent = guest ? "เข้าเกม" : "สร้างตัวละคร";
  $("btn-create-back").hidden = !guest;
  $("create-guest-note").hidden = !guest;
  say("create-msg", "");
  show("create");
  creator ??= new Creator($<HTMLCanvasElement>("preview"));
  creator.init();
  $<HTMLInputElement>("char-name").focus();
}

async function api(path: string, session: Session, init: RequestInit = {}) {
  const r = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

/** ล็อกอินแล้ว: มีตัวละครหรือยัง */
async function afterLogin(session: Session) {
  if (started || guestFlow) return; // ระหว่างสร้างตัวละครผู้เยี่ยมชม ฟอร์มจัดการเอง
  show("loading");
  const r = await api("/api/character", session);
  if (r.status === 401) { await sb.auth.signOut(); show("login"); return; }
  if (!r.ok) { say("login-msg", r.body.error ?? "โหลดตัวละครไม่สำเร็จ ลองใหม่อีกครั้ง"); show("login"); return; }
  if (r.body.character) startGame(r.body.character, session);
  else showCreate(!!session.user.is_anonymous);
}

function startGame(ch: Character, session: Session) {
  if (started) return;
  started = true;
  show("hud");
  $("hud-name").textContent = ch.name;

  const net = new Net(session.access_token);
  net.onClose = (code) => {
    $("dc-text").textContent = code === CLOSE_KICKED
      ? "บัญชีนี้เข้าเกมจากอุปกรณ์อื่น การเชื่อมต่อนี้จึงถูกปิด"
      : "หลุดการเชื่อมต่อกับเซิร์ฟเวอร์ ตัวละครออกจากแมพแล้ว";
    $("dc").hidden = false;
  };
  $("logout").onclick = async () => {
    if (session.user.is_anonymous && !confirm("ตัวละครผู้เยี่ยมชมจะหายไปถาวรหลังออกจากระบบ ถ้ายังไม่ได้ผูก Google ต้องการออกจริงหรือไม่?")) return;
    net.close();
    await sb.auth.signOut();
    location.reload();
  };

  // ผู้เยี่ยมชม: ผูก Google เพื่อเก็บตัวละครไว้ถาวร (ต้องเปิด Manual Linking ใน Supabase)
  const link = $<HTMLButtonElement>("link-google");
  link.hidden = !session.user.is_anonymous;
  link.onclick = async () => {
    const { error } = await sb.auth.linkIdentity({ provider: "google", options: { redirectTo: location.origin } });
    if (error) toast(`ผูกบัญชีไม่สำเร็จ: ${error.message}`);
  };

  const scene = new GameScene(net);
  const hud = bindHud(net);
  scene.onInventory = hud.inventory;
  scene.onStats = hud.stats;
  scene.onJoined = hud.joined;
  // สลบ: แสดงสาเหตุ กดกลับเมืองแล้ว server ฟื้นให้ที่จุดเกิด
  scene.onKnockedOut = (cause) => {
    $("ko-cause").textContent = cause;
    $("ko").hidden = false;
    $<HTMLButtonElement>("ko-town").disabled = false;
    $("ko-town").focus();
  };
  scene.onRevived = () => { $("ko").hidden = true; };
  $("ko-town").onclick = () => {
    $<HTMLButtonElement>("ko-town").disabled = true;
    net.send({ t: "revive" });
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#3d6b35",
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [scene],
  });
}

function bindForms() {
  const email = $<HTMLInputElement>("email");
  const password = $<HTMLInputElement>("password");
  const busy = (on: boolean) => {
    for (const id of ["btn-signin", "btn-signup", "btn-google", "btn-guest"]) $<HTMLButtonElement>(id).disabled = on;
  };

  $<HTMLFormElement>("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(true); say("login-msg", "");
    const { data, error } = await sb.auth.signInWithPassword({ email: email.value, password: password.value });
    busy(false);
    if (error) return say("login-msg", `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
    afterLogin(data.session);
  });

  $("btn-signup").onclick = async () => {
    if (!$<HTMLFormElement>("login-form").reportValidity()) return;
    busy(true); say("login-msg", "");
    const { data, error } = await sb.auth.signUp({
      email: email.value, password: password.value,
      options: { emailRedirectTo: location.origin },
    });
    busy(false);
    if (error) return say("login-msg", `สมัครไม่สำเร็จ: ${error.message}`);
    if (data.session) afterLogin(data.session);
    else say("login-msg", "ส่งลิงก์ยืนยันไปที่อีเมลแล้ว กดลิงก์ในอีเมลเพื่อเข้าเกม", true);
  };

  $("btn-google").onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } });
    if (error) say("login-msg", `เข้าสู่ระบบด้วย Google ไม่สำเร็จ: ${error.message}`);
  };

  // Guest: ไปหน้าสร้างตัวละครก่อน บัญชีชั่วคราว (Supabase anonymous sign-in) สร้างตอนกด "เข้าเกม"
  $("btn-guest").onclick = () => {
    say("login-msg", "");
    showCreate(true);
  };
  $("btn-create-back").onclick = () => {
    guestFlow = false;
    show("login");
  };

  $<HTMLFormElement>("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>("char-name").value.trim();
    if (!NAME_RE.test(name)) return say("create-msg", "ชื่อต้องยาว 2–16 ตัว ใช้ได้เฉพาะตัวอักษร ตัวเลข หรือ _");

    const btn = $<HTMLButtonElement>("btn-create");
    btn.disabled = true;
    say("create-msg", "");
    try {
      let { data: { session } } = await sb.auth.getSession();
      // ผู้เยี่ยมชม: สร้างบัญชีตอนยืนยัน (ถ้ามีบัญชีผู้เยี่ยมชมค้างจากรอบก่อน ใช้อันเดิม)
      if (!session && guestFlow) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) return say("create-msg", /anonymous sign-ins are disabled/i.test(error.message)
          ? "ยังไม่ได้เปิดโหมด Guest: เปิด Allow anonymous sign-ins ใน Supabase (Authentication → Sign In / Providers)"
          : `เข้าแบบ Guest ไม่สำเร็จ: ${error.message}`);
        session = data.session;
      }
      if (!session) { show("login"); return; }

      const r = await api("/api/character", session, { method: "POST", body: JSON.stringify({ name, look: creator?.look }) });
      if (!r.ok) return say("create-msg", r.body.error ?? "สร้างตัวละครไม่สำเร็จ");
      startGame(r.body.character, session);
    } finally {
      btn.disabled = false;
    }
  });
}

/** แถบเมนูล่าง + หน้าต่าง สถานะ / กระเป๋า / เบี้ย / บอท */
function bindHud(net: Net) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#menu button[data-panel]"));
  const panels = buttons.map((b) => $(b.dataset.panel!));
  // เปิดได้ทีละหน้า: กดปุ่มเดิมซ้ำ = ปิด
  const toggle = (id: string, open?: boolean) => {
    for (const b of buttons) {
      const p = $(b.dataset.panel!);
      const show = b.dataset.panel === id ? open ?? p.hidden : false;
      p.hidden = !show;
      b.setAttribute("aria-expanded", String(show));
    }
  };
  for (const b of buttons) b.onclick = () => toggle(b.dataset.panel!);
  for (const p of panels) p.querySelector<HTMLButtonElement>(".panel-close")!.onclick = () => toggle(p.id, false);
  // คีย์ลัดบนคอม (รองรับแป้นไทยตำแหน่งเดียวกัน)
  const keys: Record<string, string> = { c: "stat-panel", "แ": "stat-panel", i: "bag", "ไ": "bag", g: "gold-panel", "เ": "gold-panel", b: "bot-panel", "ิ": "bot-panel" };
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const id = keys[e.key.toLowerCase()];
    if (id) toggle(id);
  });

  let money = 0;
  let inv: InvItem[] = [];

  // ร้าน (อยู่ในหน้าเบี้ย): ของที่มีราคาใน shared/items.ts
  const shop = $("shop");
  const shopItems = Object.entries(ITEMS).filter(([, d]) => d.price);
  const buyButtons: { btn: HTMLButtonElement; cost: number }[] = [];
  for (const [key, d] of shopItems) {
    const row = document.createElement("div");
    row.className = "shop-item";
    row.innerHTML = `<img src="/sprites/items/${d.icon}-64.png" alt="" /><div class="info">${d.name}<small>${d.heal ? `เติมเลือด ${d.heal} · ` : ""}${d.price} เบี้ย</small></div>`;
    for (const n of [1, 10]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `ซื้อ ×${n}`;
      btn.onclick = () => { net.send({ t: "buy", item: key, count: n }); say("shop-msg", `ซื้อ${d.name} ×${n}`, true); };
      row.appendChild(btn);
      buyButtons.push({ btn, cost: d.price! * n });
    }
    shop.appendChild(row);
  }

  // บอท: ตั้งค่าเก็บในเครื่อง ส่งให้ server ทุกครั้งที่เปลี่ยนและตอนเข้าเกม
  const chk = $<HTMLInputElement>("bot-potion"), pct = $<HTMLInputElement>("bot-pct");
  try {
    const saved = JSON.parse(localStorage.getItem("bot") ?? "null");
    if (saved) { chk.checked = !!saved.on; pct.value = String(saved.pct ?? 40); }
  } catch {}
  const sendBot = () => {
    $("bot-pct-text").textContent = `${pct.value}%`;
    net.send({ t: "bot", potionAt: chk.checked ? Number(pct.value) : 0 });
    try { localStorage.setItem("bot", JSON.stringify({ on: chk.checked, pct: Number(pct.value) })); } catch {}
  };
  chk.onchange = sendBot;
  pct.oninput = () => { $("bot-pct-text").textContent = `${pct.value}%`; };
  pct.onchange = sendBot;
  $("bot-pct-text").textContent = `${pct.value}%`;

  const renderBag = () => {
    const grid = $("bag-grid");
    grid.innerHTML = "";
    for (const it of inv) {
      const def = ITEMS[it.item];
      if (!def) continue;
      const slot = document.createElement("div");
      slot.className = "slot" + (def.heal ? " usable" : "");
      slot.title = `${def.name} ×${it.count}${def.heal ? ` · กดเพื่อกิน (เติมเลือด ${def.heal})` : ""}`;
      // ไอเท็มที่ยังไม่มีภาพ แสดงชื่อแทน
      const img = def.icon ? document.createElement("img") : document.createElement("small");
      if (img instanceof HTMLImageElement) { img.src = `/sprites/items/${def.icon}-64.png`; img.alt = def.name; }
      else { img.textContent = def.name; img.style.cssText = "font-size:11px;text-align:center;padding:2px"; }
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = String(it.count);
      slot.append(img, n);
      if (def.heal) slot.onclick = () => net.send({ t: "use", item: it.item });
      grid.appendChild(slot);
    }
    $("bag-empty").hidden = grid.children.length > 0;
    $("bot-potions").textContent = String(inv.filter((i) => ITEMS[i.item]?.heal).reduce((a, i) => a + i.count, 0));
  };

  // อัปสถานะ: ปุ่ม +1 และ +5 (server ตรวจแต้มเอง)
  const STATS: { key: "str" | "vit" | "agi" | "luk"; name: string; desc: string }[] = [
    { key: "str", name: "พลัง", desc: "+1 พลังโจมตี" },
    { key: "vit", name: "อึด", desc: "+5 พลังชีวิต" },
    { key: "agi", name: "ว่องไว", desc: "ตีเร็วขึ้น 1%" },
    { key: "luk", name: "โชค", desc: "คริ +0.5%" },
  ];
  const statVal: Record<string, HTMLElement> = {};
  const statBtns: HTMLButtonElement[] = [];
  for (const st of STATS) {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span>${st.name}<small>${st.desc}</small></span><span class="v">0</span>`;
    statVal[st.key] = row.querySelector(".v")!;
    for (const n of [1, 5]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `+${n}`;
      b.title = `${st.name} +${n}`;
      b.dataset.n = String(n);
      b.onclick = () => net.send({ t: "stat", stat: st.key, n });
      row.appendChild(b);
      statBtns.push(b);
    }
    $("stat-rows").appendChild(row);
  }

  return {
    inventory: (items: InvItem[]) => { inv = items; renderBag(); },
    stats: (s: PlayerStats) => {
      money = s.money;
      $("gold-amount").textContent = money.toLocaleString("th-TH");
      for (const { btn, cost } of buyButtons) btn.disabled = money < cost;
      $("st-lv").textContent = String(s.level);
      $("st-hp").textContent = `${s.hp} / ${s.maxHp}`;
      $("st-atk").textContent = String(s.atk);
      $("st-exp").textContent = `${s.exp} / ${s.expNext}`;
      $("st-money").textContent = money.toLocaleString("th-TH");
      $("st-aspd").textContent = `${(1000 / s.aspdMs).toFixed(2)} ครั้ง/วิ`;
      $("st-crit").textContent = `${Math.round(s.crit * 1000) / 10}%`;
      $("st-points").textContent = String(s.points);
      for (const k in statVal) statVal[k].textContent = String(s.stats[k as keyof typeof s.stats]);
      for (const b of statBtns) b.disabled = s.points < Number(b.dataset.n);
      const badge = $("stat-badge");
      badge.hidden = s.points <= 0;
      badge.textContent = `+${s.points}`;
    },
    joined: sendBot, // ส่งค่าบอทให้ server ตอนเข้าแมพ (server ไม่ได้เก็บค่านี้)
  };
}

async function main() {
  bindChrome();
  const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => null);
  if (!cfg?.supabaseUrl || String(cfg.supabaseUrl).includes("YOUR-PROJECT")) {
    say("loading-text", "ยังไม่ได้ตั้งค่า Supabase ใส่ SUPABASE_URL และ SUPABASE_ANON_KEY ใน wrangler.toml แล้วรัน wrangler dev ใหม่");
    return;
  }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  bindForms();

  // กลับมาจาก Google หรือจากลิงก์ยืนยันอีเมล supabase-js จะอ่าน session จาก URL ให้เอง
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) afterLogin(session);
  });

  const { data } = await sb.auth.getSession();
  if (data.session) afterLogin(data.session);
  else show("login");
}

main();
