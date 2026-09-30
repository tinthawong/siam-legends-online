import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import {
  TICK_MS, GROUND_ITEM_MS, PLAYER_MOVE_MS, PLAYER_RANGE, AUTO_RADIUS, MOB_RESPAWN_MS, MISS_LEVEL_GAP,
  MOB_ASPD_MS, MOB_RANGE, MOB_CHASE_RANGE,
  POTION_COOLDOWN_MS, MAX_BUY, REGEN_MS, REGEN_PCT, REGEN_MOVING,
  stepMs, cheb,
} from "../../shared/constants";
import { MAP_W, MAP_H, SPAWN, ZONES, isWalkable, inZone, exitAt } from "../../shared/map";
import { pathTo, pathNear, type Cell } from "../../shared/pathfind";
import { MOBS, expToNext, MAX_LEVEL, STAT_KEYS, STAT_MAX, statCostN, statPointsForLevel, derive, physicalAttack, type Stats, type Derived } from "../../shared/game";
import { ITEMS } from "../../shared/items";
import { NPCS, QUESTS, canAccept, isComplete, talkTo, type QuestLog } from "../../shared/quests";
import { SLOTS, gearOf, slotsFor, type Equipped, type Gear } from "../../shared/equipment";
import { SKILLS } from "../../shared/skills";
import { CLOSE_KICKED } from "../../shared/protocol";
import type { ClientMsg, ServerMsg, EntityState, PlayerStats, JoinCharacter, GroundItem, InvItem } from "../../shared/protocol";
import type { Look } from "../../shared/appearance";

const SAVE_EVERY_MS = 30_000;
const TALK_RANGE = 2; // คุย/รับ/ส่งเควสได้เมื่ออยู่ห่าง NPC ไม่เกินกี่ช่อง

interface Ent {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  moveMs: number;
  path: Cell[];
  nextStepAt: number; // เวลาที่จะถึงช่องถัดไปใน path
}

interface Player extends Ent {
  kind: "player";
  userId: string;
  look: Look;
  ws: WebSocket;
  level: number;
  exp: number;
  target: string | null;
  auto: boolean;
  nextAttackAt: number;
  chaseKey: string | null; // ตำแหน่งมอนตอนคำนวณเส้นทางไล่ล่าสุด
  nextHpRegenAt: number;   // ฟื้น HP ทุก 6 วิ / SP ทุก 8 วิ ตอนยืนนิ่ง
  nextSpRegenAt: number;
  sp: number;
  maxSp: number;
  pickup: string | null;   // ของบนพื้นที่กำลังเดินไปเก็บ
  dead: boolean;           // เลือดหมด สลบอยู่กับที่ จนกว่าจะกดกลับเมือง
  money: number;           // เบี้ย
  st: Stats;               // ค่าพลังหลัก 6 ค่า
  points: number;          // แต้มว่าง
  der: Derived;            // ค่าที่คำนวณจากค่าหลัก (คิดใหม่ทุกครั้งที่ค่าหลัก/เลเวลเปลี่ยน)
  potionAt: number;        // กินยาอัตโนมัติเมื่อเลือดต่ำกว่ากี่ % (0 = ปิด)
  nextPotionAt: number;
  skill: string | null;               // สกิลที่รอใช้กับเป้าหมาย (ใช้เมื่อเข้าระยะ)
  skillReady: Record<string, number>; // สกิล → เวลาที่ใช้ได้อีกครั้ง
  inv: Map<string, number>; // กระเป๋า: item → จำนวน
  quests: QuestLog;         // เควสที่รับอยู่ / ทำเสร็จแล้ว
  talk: string | null;      // NPC ที่กำลังเดินไปคุย
  equip: Equipped;          // ของที่ใส่อยู่ (ไม่อยู่ในกระเป๋า)
  gear: Gear;               // ค่ารวมจากของที่ใส่อยู่
}

interface Mob extends Ent {
  kind: "mob";
  type: string;
  alive: boolean;
  respawnAt: number;
  nextWanderAt: number;
  // ตีกลับ: ผู้เล่นที่กำลังไล่ตี / จุดที่โดนตีครั้งแรก (ไล่ได้ไม่เกิน MOB_CHASE_RANGE จากจุดนี้)
  aggro: string | null;
  aggroFrom: Cell | null;
  nextAttackAt: number;
  chaseKey: string | null;
}

type Entity = Player | Mob;

/**
 * 1 instance = 1 แมพ
 * server เป็นผู้ตัดสินทุกอย่าง: client ส่งแค่ความตั้งใจ (เดินไปช่องนี้ / ตีตัวนี้ / เปิด auto)
 */
export class MapRoom extends DurableObject<Env> {
  private players = new Map<string, Player>();
  private mobs = new Map<string, Mob>();
  private ground = new Map<string, GroundItem>(); // ของหล่นบนพื้น
  private groundExpire = new Map<string, number>(); // id ของบนพื้น → เวลาที่จะหาย
  private groundSeq = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private nextSaveAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // ถ้า DO ถูกโหลดใหม่ สถานะในหน่วยความจำหายหมด → ปิด socket ค้างให้ client เข้าใหม่
    for (const ws of ctx.getWebSockets()) {
      try { ws.close(4000, "server restarted"); } catch { /* ignore */ }
    }
    this.spawnMobs();
  }

  // ---------- การเชื่อมต่อ ----------

  async fetch(req: Request): Promise<Response> {
    // X-Character ถูกใส่โดย Worker หลังตรวจ token และโหลดจาก D1 แล้วเท่านั้น
    let ch: JoinCharacter;
    try { ch = JSON.parse(req.headers.get("X-Character") ?? ""); }
    catch { return new Response("bad request", { status: 400 }); }

    // บัญชีเดียวกันเข้าซ้ำ → เตะตัวเก่า และใช้ค่าล่าสุดในหน่วยความจำ (ใหม่กว่าใน D1)
    for (const old of this.players.values()) {
      if (old.userId !== ch.userId) continue;
      ch = { ...ch, level: old.level, exp: old.exp, x: old.x, y: old.y, inv: invList(old.inv), money: old.money, stats: { ...old.st }, points: old.points, quests: old.quests, equip: old.equip };
      this.players.delete(old.id);
      this.broadcast({ t: "despawn", id: old.id });
      this.send(old, { t: "kicked" }); // แจ้งก่อน เพราะ close event อาจมาช้า
      try { old.ws.close(CLOSE_KICKED, "logged in elsewhere"); } catch { /* ignore */ }
    }
    const pos = isWalkable(ch.x, ch.y) ? { x: ch.x, y: ch.y } : SPAWN;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = "p" + crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id });

    const gear = gearOf(ch.equip ?? {});
    const der0 = derive(ch.level, ch.stats, gear);
    const p: Player = {
      id, kind: "player", name: ch.name, userId: ch.userId, look: ch.look,
      x: pos.x, y: pos.y,
      hp: der0.maxHp, maxHp: der0.maxHp,
      sp: der0.maxSp, maxSp: der0.maxSp,
      moveMs: PLAYER_MOVE_MS, path: [], nextStepAt: 0,
      ws: server, level: ch.level, exp: ch.exp,
      target: null, auto: false, nextAttackAt: 0, chaseKey: null,
      nextHpRegenAt: 0, nextSpRegenAt: 0,
      pickup: null, dead: false, money: ch.money ?? 0, st: { ...ch.stats }, points: ch.points, der: der0, potionAt: 0, nextPotionAt: 0, inv: new Map((ch.inv ?? []).map((i) => [i.item, i.count])),
      quests: ch.quests ?? { active: {}, done: [] }, talk: null, equip: { ...(ch.equip ?? {}) }, gear, skill: null, skillReady: {},
    };
    this.players.set(id, p);

    this.send(p, {
      t: "welcome", you: id, entities: this.snapshot(), self: this.stats(p),
      ground: [...this.ground.values()], inv: invList(p.inv), quests: p.quests,
    });
    this.broadcast({ t: "spawn", e: this.view(p) }, id);
    this.ensureLoop();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const p = this.playerOf(ws);
    if (!p) { ws.close(4000, "rejoin"); return; }

    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch { return; }

    const now = Date.now();
    if (p.dead) {
      if (msg.t === "revive") this.revivePlayer(p, now);
      return; // สลบอยู่: ทำอะไรไม่ได้นอกจากกดกลับเมือง
    }
    switch (msg.t) {
      case "move": {
        const x = Math.floor(Number(msg.x)), y = Math.floor(Number(msg.y));
        if (!isWalkable(x, y)) return;
        const path = pathTo(p.x, p.y, x, y);
        if (!path) return;
        // เดินเองแปลว่ายกเลิกการตีและ auto
        if (p.auto) { p.auto = false; this.send(p, { t: "auto", on: false }); }
        if (p.target) { p.target = null; this.send(p, { t: "target", id: null }); }
        p.chaseKey = null;
        p.pickup = null;
        p.talk = null;
        p.skill = null;
        this.setPath(p, path, now);
        break;
      }
      case "pickup": {
        // กดที่ของบนพื้น = เดินไปเก็บ (ยกเลิกการตีและ auto เหมือนเดินเอง)
        const g = this.ground.get(String(msg.id));
        if (!g) return;
        if (p.auto) { p.auto = false; this.send(p, { t: "auto", on: false }); }
        if (p.target) { p.target = null; this.send(p, { t: "target", id: null }); }
        p.pickup = g.id;
        p.chaseKey = null;
        p.talk = null;
        p.skill = null;
        break;
      }
      case "skill": {
        const sk = SKILLS[String(msg.id)];
        const m = this.mobs.get(String(msg.target));
        if (!sk || !m || !m.alive || p.sp < sk.sp || now < (p.skillReady[sk.id] ?? 0)) return;
        p.pickup = null;
        p.talk = null;
        p.skill = sk.id;
        if (p.target !== m.id) { p.target = m.id; p.chaseKey = null; this.send(p, { t: "target", id: m.id }); }
        break;
      }
      case "attack": {
        const m = this.mobs.get(String(msg.target));
        if (!m || !m.alive) return;
        p.skill = null;
        p.pickup = null;
        p.talk = null;
        p.target = m.id;
        p.chaseKey = null;
        this.send(p, { t: "target", id: m.id });
        break;
      }
      case "use": {
        this.usePotion(p, String(msg.item), now);
        break;
      }
      case "buy": {
        const def = ITEMS[String(msg.item)];
        const n = Math.floor(Number(msg.count));
        if (!def?.price || !(n >= 1 && n <= MAX_BUY) || p.money < def.price * n) return;
        p.money -= def.price * n;
        p.inv.set(String(msg.item), (p.inv.get(String(msg.item)) ?? 0) + n);
        this.send(p, { t: "inv", items: invList(p.inv) });
        this.send(p, { t: "stats", self: this.stats(p) });
        break;
      }
      case "stat_add": {
        // ใช้แต้มค่าพลัง: server ตรวจชื่อค่า, ไม่เกิน STAT_MAX, แต้มพอ (ราคาขั้นละ floor((x-1)/10)+2)
        const k = msg.stat, n = Math.floor(Number(msg.amount));
        if (!STAT_KEYS.includes(k) || !(n >= 1) || p.st[k] + n > STAT_MAX) return;
        const cost = statCostN(p.st[k], n);
        if (cost > p.points) return;
        p.points -= cost;
        p.st[k] += n;
        this.recalc(p);
        this.send(p, { t: "stats", self: this.stats(p) });
        break;
      }
      case "bot": {
        const v = Math.round(Number(msg.potionAt));
        p.potionAt = v >= 0 && v <= 95 ? v : 0;
        break;
      }
      case "talk": {
        // กดที่ NPC = เดินไปหา (ยกเลิกการตีและ auto เหมือนเดินเอง) ถึงแล้วเปิดหน้าคุย
        const npc = NPCS[String(msg.npc)];
        if (!npc) return;
        if (p.auto) { p.auto = false; this.send(p, { t: "auto", on: false }); }
        if (p.target) { p.target = null; this.send(p, { t: "target", id: null }); }
        p.pickup = null;
        p.chaseKey = null;
        p.talk = npc.id;
        break;
      }
      case "quest_accept": {
        const q = QUESTS[String(msg.id)];
        if (!q || !this.nearNpc(p, q.npc) || !canAccept(q, p.level, p.quests)) return;
        p.quests.active[q.id] = 0;
        this.send(p, { t: "quests", log: p.quests });
        this.openDialog(p, q.npc); // เควสคุยกับคนให้เอง (q001) ส่งได้ทันที
        break;
      }
      case "quest_done": {
        const q = QUESTS[String(msg.id)];
        if (!q || !this.nearNpc(p, q.turnIn) || !isComplete(q, p.quests, (i) => p.inv.get(i) ?? 0)) return;
        this.completeQuest(p, q.id);
        this.openDialog(p, q.turnIn); // มีเควสต่อจากนี้ → เสนอต่อเลย
        break;
      }
      case "equip": {
        // ใส่ของจากกระเป๋า: ช่องว่างช่องแรกที่ใส่ได้ ถ้าเต็มทุกช่องสลับกับช่องแรก (ของเดิมกลับเข้ากระเป๋า)
        const item = String(msg.item);
        const slots = slotsFor(item);
        if (!slots.length || (p.inv.get(item) ?? 0) < 1) return;
        const slot = slots.find((s) => !p.equip[s]) ?? slots[0];
        const old = p.equip[slot];
        p.inv.set(item, (p.inv.get(item) ?? 0) - 1);
        if (old) p.inv.set(old, (p.inv.get(old) ?? 0) + 1);
        p.equip[slot] = item;
        this.gearChanged(p);
        break;
      }
      case "unequip": {
        const slot = SLOTS.find((s) => s.key === msg.slot)?.key;
        const item = slot ? p.equip[slot] : undefined;
        if (!slot || !item) return;
        delete p.equip[slot];
        p.inv.set(item, (p.inv.get(item) ?? 0) + 1);
        this.gearChanged(p);
        break;
      }
      case "auto": {
        p.auto = !!msg.on;
        this.send(p, { t: "auto", on: p.auto });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    await this.drop(ws);
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket) {
    await this.drop(ws);
  }

  /** หลุดการเชื่อมต่อ = ออกจากแมพทันที auto จึงหยุดไปด้วย แล้วบันทึกลง D1 */
  private async drop(ws: WebSocket) {
    const p = this.playerOf(ws);
    if (!p) return; // ถูกเตะไปแล้ว หรือไม่เคยเข้าแมพ
    this.players.delete(p.id);
    this.broadcast({ t: "despawn", id: p.id });
    if (this.players.size === 0) this.stopLoop();
    if (p.dead) { p.x = SPAWN.x; p.y = SPAWN.y; } // ออกเกมตอนสลบ = เข้าใหม่ที่จุดเกิด
    await this.save([p]);
  }

  // ---------- บันทึก ----------

  private async save(list: Player[]) {
    if (!list.length) return;
    const now = Date.now();
    const stmt = this.env.DB.prepare(
      "UPDATE characters SET level = ?, exp = ?, x = ?, y = ?, money = ?, str = ?, agi = ?, vit = ?, int = ?, dex = ?, luk = ?, stat_points = ?, quests = ?, equip = ?, updated_at = ? WHERE user_id = ?",
    );
    const invStmt = this.env.DB.prepare(
      "INSERT INTO inventory (user_id, item, count) VALUES (?, ?, ?) ON CONFLICT (user_id, item) DO UPDATE SET count = excluded.count",
    );
    try {
      await this.env.DB.batch(list.flatMap((p) => [
        stmt.bind(p.level, p.exp, p.x, p.y, p.money, p.st.str, p.st.agi, p.st.vit, p.st.int, p.st.dex, p.st.luk, p.points, JSON.stringify(p.quests), JSON.stringify(p.equip), now, p.userId),
        ...[...p.inv].map(([item, count]) => invStmt.bind(p.userId, item, count)),
      ]));
    } catch (e) {
      console.error("save failed", e);
    }
  }

  private playerOf(ws: WebSocket): Player | undefined {
    const id = (ws.deserializeAttachment() as { id?: string } | null)?.id;
    return id ? this.players.get(id) : undefined;
  }

  // ---------- game loop ----------

  private ensureLoop() {
    if (this.loop) return;
    this.nextSaveAt = Date.now() + SAVE_EVERY_MS;
    this.loop = setInterval(() => this.tick(), TICK_MS);
  }

  private stopLoop() {
    if (this.loop) { clearInterval(this.loop); this.loop = null; }
  }

  private tick() {
    const now = Date.now();
    for (const p of this.players.values()) this.advance(p, now);
    for (const m of this.mobs.values()) {
      if (!m.alive) { if (now >= m.respawnAt) this.respawnMob(m, now); continue; }
      this.advance(m, now);
      if (m.aggro) this.updateAggro(m, now);
      else if (m.path.length === 0 && now >= m.nextWanderAt) this.wander(m, now);
    }
    for (const p of this.players.values()) this.updatePlayer(p, now);
    for (const p of this.players.values()) this.regen(p, now);
    for (const p of this.players.values()) this.autoPotion(p, now);
    for (const [id, at] of this.groundExpire) {
      if (now < at) continue;
      this.groundExpire.delete(id);
      this.ground.delete(id);
      this.broadcast({ t: "expire", id });
    }

    // autosave เผื่อ DO ถูกปิดกะทันหัน จะเสียข้อมูลไม่เกินรอบนี้
    if (now >= this.nextSaveAt) {
      this.nextSaveAt = now + SAVE_EVERY_MS;
      void this.save([...this.players.values()]);
    }
  }

  /** เดินตาม path ตามเวลาจริง */
  private advance(e: Entity, now: number) {
    while (e.path.length && now >= e.nextStepAt) {
      const c = e.path.shift()!;
      // ผู้เล่นเดินเข้าทางออก: ยังไม่มีแมพอื่น → แจ้งแล้วดันถอยกลับช่องเดิม (ไม่เข้าช่องทางออก)
      if (e.kind === "player" && exitAt(c.x, c.y)) {
        e.path = [];
        this.setPath(e, [], now);
        this.send(e, { t: "notice", text: "เส้นทางนี้ยังไม่เปิด" });
        return;
      }
      e.x = c.x; e.y = c.y;
      if (e.path.length) {
        const n = e.path[0];
        e.nextStepAt += stepMs(n.x - e.x, n.y - e.y, e.moveMs);
      }
    }
  }

  /** ตั้งเส้นทางใหม่แล้วแจ้งทุกคน — client เดินตาม path เอง ไม่ต้องส่งตำแหน่งทุก tick */
  private setPath(e: Entity, path: Cell[], now: number) {
    e.path = path;
    if (path.length) e.nextStepAt = now + stepMs(path[0].x - e.x, path[0].y - e.y, e.moveMs);
    this.broadcast({ t: "move", id: e.id, from: { x: e.x, y: e.y }, path, moveMs: e.moveMs });
  }

  // ---------- ผู้เล่น: ตีเป้าหมาย / auto ----------

  private updatePlayer(p: Player, now: number) {
    if (p.dead) return;
    if (p.pickup) { this.updatePickup(p, now); return; }
    if (p.talk) { this.updateTalk(p, now); return; }
    // auto: ไม่มีเป้าหมายที่ยังมีชีวิต → หามอนที่ใกล้ที่สุดในรัศมี
    if (p.auto && !this.aliveMob(p.target)) {
      const t = this.nearestMob(p);
      if (t !== p.target) {
        p.target = t;
        p.chaseKey = null;
        this.send(p, { t: "target", id: t });
      }
    }
    if (!p.target) { p.skill = null; return; }

    const m = this.aliveMob(p.target);
    if (!m) { p.target = null; this.send(p, { t: "target", id: null }); return; }

    // อยู่ในระยะ → หยุดเดินแล้วตีตาม ASPD
    if (cheb(p.x, p.y, m.x, m.y) <= PLAYER_RANGE) {
      if (p.path.length) this.setPath(p, [], now);
      if (now >= p.nextAttackAt) { if (p.skill) this.castSkill(p, m, now); else this.attack(p, m, now); }
      return;
    }

    // ไม่อยู่ในระยะ → เดินไล่ (คำนวณใหม่เมื่อมอนย้ายช่อง)
    const key = `${m.x},${m.y}`;
    if (p.chaseKey !== key || p.path.length === 0) {
      p.chaseKey = key;
      const path = pathNear(p.x, p.y, m.x, m.y, PLAYER_RANGE);
      if (!path) { p.target = null; this.send(p, { t: "target", id: null }); return; }
      this.setPath(p, path, now);
    }
  }

  private attack(p: Player, m: Mob, now: number) {
    p.nextAttackAt = now + p.der.aspdMs;
    const def = MOBS[m.type];
    // ตีไม่พลาด ยกเว้นมอนเลเวลสูงกว่าเราตั้งแต่ MISS_LEVEL_GAP ขึ้นไป
    const noMiss = (def.level ?? 0) - p.level < MISS_LEVEL_GAP;
    const { dmg, crit, miss } = physicalAttack(
      { atk: p.der.atk, hit: p.der.hit, crit: p.der.crit, noMiss },
      { flee: def.flee ?? 0, defPct: def.defPct ?? 0, defBonus: def.defBonus ?? 0 },
    );
    m.hp = Math.max(0, m.hp - dmg);
    this.broadcast({ t: "hit", src: p.id, dst: m.id, dmg, crit, hp: m.hp, miss });
    if (m.hp === 0) { this.killMob(m, p, now); return; }
    this.provoke(m, p, now);
  }

  /** ใช้สกิล (ในระยะแล้ว): ตรวจ SP/คูลดาวน์อีกครั้ง, ตีหลายครั้ง ATK × power ต่อครั้ง (สูตรเดียวกับตีปกติ) */
  private castSkill(p: Player, m: Mob, now: number) {
    const sk = SKILLS[p.skill!];
    p.skill = null;
    if (!sk || p.sp < sk.sp || now < (p.skillReady[sk.id] ?? 0)) { this.attack(p, m, now); return; }
    p.sp -= sk.sp;
    p.skillReady[sk.id] = now + sk.cooldownMs;
    p.nextAttackAt = now + p.der.aspdMs;
    const def = MOBS[m.type];
    const noMiss = (def.level ?? 0) - p.level < MISS_LEVEL_GAP;
    const hits = Array.from({ length: sk.hits }, () => physicalAttack(
      { atk: Math.max(1, Math.round(p.der.atk * sk.power)), hit: p.der.hit, crit: p.der.crit, noMiss },
      { flee: def.flee ?? 0, defPct: def.defPct ?? 0, defBonus: def.defBonus ?? 0 },
    ));
    m.hp = Math.max(0, m.hp - hits.reduce((a, h) => a + h.dmg, 0));
    this.broadcast({ t: "skill_hit", src: p.id, dst: m.id, skill: sk.id, hits, hp: m.hp });
    this.send(p, { t: "stats", self: this.stats(p) });
    if (m.hp === 0) { this.killMob(m, p, now); return; }
    this.provoke(m, p, now);
  }

  /** มอนที่ตีกลับ: จำคนที่ตีมันคนแรก และจุดที่โดนตี แล้วเริ่มไล่ (ตีกลับหลังโดนตีครู่หนึ่ง ไม่ใช่ทันที) */
  private provoke(m: Mob, p: Player, now: number) {
    if (MOBS[m.type].retaliate && !m.aggro) {
      m.aggro = p.id;
      m.aggroFrom = { x: m.x, y: m.y };
      m.chaseKey = null;
      m.nextAttackAt = now + MOB_ASPD_MS / 2;
      if (m.path.length) this.setPath(m, [], now);
    }
  }

  // ---------- ของบนพื้น / กระเป๋า ----------

  /** เดินไปที่ของ ถึงช่องนั้นหรือช่องติดกันแล้วเก็บเข้ากระเป๋า */
  private updatePickup(p: Player, now: number) {
    const g = this.ground.get(p.pickup!);
    if (!g) { p.pickup = null; return; } // มีคนเก็บไปก่อน
    if (cheb(p.x, p.y, g.x, g.y) <= 1) {
      if (p.path.length) this.setPath(p, [], now);
      p.pickup = null;
      this.ground.delete(g.id);
      this.groundExpire.delete(g.id);
      p.inv.set(g.item, (p.inv.get(g.item) ?? 0) + 1);
      this.broadcast({ t: "picked", id: g.id, by: p.id });
      this.send(p, { t: "inv", items: invList(p.inv) });
      return;
    }
    if (p.path.length === 0) {
      const path = pathNear(p.x, p.y, g.x, g.y, 1);
      if (!path) { p.pickup = null; return; }
      this.setPath(p, path, now);
    }
  }

  // ---------- NPC / เควส ----------

  private nearNpc(p: Player, npc: string): boolean {
    const n = NPCS[npc];
    return !!n && cheb(p.x, p.y, n.x, n.y) <= TALK_RANGE;
  }

  /** เดินไปหา NPC ถึงระยะคุยแล้วเปิดหน้าคุย */
  private updateTalk(p: Player, now: number) {
    const n = NPCS[p.talk!];
    if (!n) { p.talk = null; return; }
    if (cheb(p.x, p.y, n.x, n.y) <= TALK_RANGE) {
      if (p.path.length) this.setPath(p, [], now);
      p.talk = null;
      this.openDialog(p, n.id);
      return;
    }
    if (p.path.length === 0) {
      const path = pathNear(p.x, p.y, n.x, n.y, TALK_RANGE);
      if (!path) { p.talk = null; return; }
      this.setPath(p, path, now);
    }
  }

  private openDialog(p: Player, npc: string) {
    const t = talkTo(npc, p.level, p.quests, (i) => p.inv.get(i) ?? 0);
    this.send(p, { t: "dialog", npc, stage: t.stage, quest: t.quest?.id ?? null });
  }

  /** ส่งเควส: เก็บของที่ต้องส่ง (collect) แล้วให้รางวัล EXP / เบี้ย / ไอเท็ม */
  private completeQuest(p: Player, id: string) {
    const q = QUESTS[id];
    if (q.type === "collect") p.inv.set(q.target, (p.inv.get(q.target) ?? 0) - q.count);
    delete p.quests.active[id];
    p.quests.done.push(id);
    for (const it of q.reward.items) p.inv.set(it.item, (p.inv.get(it.item) ?? 0) + it.count);
    p.money += q.reward.money;
    this.gainExp(p, q.reward.exp);
    this.send(p, { t: "quest_reward", id, exp: q.reward.exp, money: q.reward.money, items: q.reward.items.map((i) => ({ item: i.item, count: i.count })) });
    this.send(p, { t: "quests", log: p.quests });
    this.send(p, { t: "inv", items: invList(p.inv) });
    this.send(p, { t: "stats", self: this.stats(p) });
  }

  /** ฆ่ามอน: นับให้เควสล่ามอนที่รับอยู่ */
  private countKill(p: Player, type: string) {
    let changed = false;
    for (const [id, n] of Object.entries(p.quests.active)) {
      const q = QUESTS[id];
      if (q.type !== "kill" || q.target !== type || n >= q.count) continue;
      p.quests.active[id] = n + 1;
      changed = true;
      this.send(p, { t: "notice", text: `${q.name} ${n + 1}/${q.count}` });
    }
    if (changed) this.send(p, { t: "quests", log: p.quests });
  }

  // ---------- มอนตีกลับ ----------

  private updateAggro(m: Mob, now: number) {
    const p = this.players.get(m.aggro!);
    const from = m.aggroFrom!;
    // เป้าหมายออกจากแมพ / ฟื้นที่จุดเกิดแล้ว / หนีไกลเกินระยะไล่ → เลิกไล่ กลับไปเดินเล่น
    if (!p || p.dead || cheb(p.x, p.y, from.x, from.y) > MOB_CHASE_RANGE || cheb(m.x, m.y, from.x, from.y) > MOB_CHASE_RANGE) {
      this.dropAggro(m, now);
      return;
    }
    if (cheb(m.x, m.y, p.x, p.y) <= MOB_RANGE) {
      if (m.path.length) this.setPath(m, [], now);
      if (now >= m.nextAttackAt) this.mobAttack(m, p, now);
      return;
    }
    // ไม่อยู่ในระยะ → เดินไล่ (คำนวณใหม่เมื่อผู้เล่นย้ายช่อง)
    const key = `${p.x},${p.y}`;
    if (m.chaseKey !== key || m.path.length === 0) {
      m.chaseKey = key;
      const path = pathNear(m.x, m.y, p.x, p.y, MOB_RANGE);
      if (!path) { this.dropAggro(m, now); return; }
      this.setPath(m, path, now);
    }
  }

  private dropAggro(m: Mob, now: number) {
    m.aggro = null;
    m.aggroFrom = null;
    m.chaseKey = null;
    if (m.path.length) this.setPath(m, [], now);
    m.nextWanderAt = now + 1500;
  }

  private mobAttack(m: Mob, p: Player, now: number) {
    m.nextAttackAt = now + MOB_ASPD_MS;
    const def = MOBS[m.type];
    // มอนไม่มีคริ ผู้เล่นหลบสมบูรณ์ได้ หัก DEF % จากอุปกรณ์ และ DEF เสริมจาก VIT
    const { dmg, crit, miss } = physicalAttack(
      { atk: def.atk ?? 1, hit: def.hit ?? 0, crit: 0 },
      { flee: p.der.flee, defPct: p.der.defPct, defBonus: p.der.defBonus, perfectDodge: p.der.perfectDodge },
    );
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast({ t: "hit", src: m.id, dst: p.id, dmg, crit, hp: p.hp, miss });
    if (p.hp === 0) this.knockOut(p, `${MOBS[m.type].name}${MOBS[m.type].level ? ` Lv.${MOBS[m.type].level}` : ""} โจมตี`, now);
    else this.send(p, { t: "stats", self: this.stats(p) });
  }

  /** เลือดหมด → สลบอยู่กับที่ ยกเลิกเป้าหมาย/auto/เก็บของ มอนเลิกไล่ แล้วรอผู้เล่นกดกลับเมือง */
  private knockOut(p: Player, cause: string, now: number) {
    p.dead = true;
    for (const m of this.mobs.values()) if (m.aggro === p.id) this.dropAggro(m, now);
    if (p.path.length) this.setPath(p, [], now);
    p.chaseKey = null;
    p.pickup = null;
    p.talk = null;
    if (p.target) { p.target = null; this.send(p, { t: "target", id: null }); }
    if (p.auto) { p.auto = false; this.send(p, { t: "auto", on: false }); }
    this.broadcast({ t: "dead", id: p.id, cause });
    this.send(p, { t: "stats", self: this.stats(p) });
  }

  /** กดกลับเมือง → ฟื้นที่จุดเกิด (เมืองหลัก) เลือดเต็ม ไม่เสีย EXP */
  private revivePlayer(p: Player, now: number) {
    p.dead = false;
    p.path = [];
    p.x = SPAWN.x; p.y = SPAWN.y;
    p.hp = p.maxHp;
    p.sp = p.maxSp; // ฟื้นที่จุดเกิด: เลือดและ SP เต็ม
    this.broadcast({ t: "respawn", id: p.id, x: p.x, y: p.y });
    this.send(p, { t: "stats", self: this.stats(p) });
  }

  /** ใช้ยาในกระเป๋า: เติมเลือด (มีคูลดาวน์ POTION_COOLDOWN_MS) คืน true ถ้าได้กินจริง */
  private usePotion(p: Player, item: string, now: number): boolean {
    const heal = ITEMS[item]?.heal;
    if (!heal || p.dead || (p.inv.get(item) ?? 0) < 1 || now < p.nextPotionAt || p.hp >= p.maxHp) return false;
    p.nextPotionAt = now + POTION_COOLDOWN_MS;
    p.inv.set(item, (p.inv.get(item) ?? 0) - 1);
    const amount = Math.min(heal, p.maxHp - p.hp);
    p.hp += amount;
    this.broadcast({ t: "heal", id: p.id, amount });
    this.send(p, { t: "inv", items: invList(p.inv) });
    this.send(p, { t: "stats", self: this.stats(p) });
    return true;
  }

  /** Bot: เลือดต่ำกว่าที่ตั้งไว้ → กินยาตัวแรกที่มีในกระเป๋า */
  private autoPotion(p: Player, now: number) {
    if (!p.potionAt || p.dead || now < p.nextPotionAt || (p.hp / p.maxHp) * 100 >= p.potionAt) return;
    for (const [item, count] of p.inv) if (count > 0 && ITEMS[item]?.heal && this.usePotion(p, item, now)) return;
  }

  /** ฟื้น HP ทุก 6 วิ และ SP ทุก 8 วิ ตอนยืนนิ่ง (docs/stat-system.md) */
  private regen(p: Player, now: number) {
    if (p.dead || now < p.nextHpRegenAt) return;
    p.nextHpRegenAt = now + REGEN_MS;
    // ยืนนิ่งได้เต็ม เดิน/กำลังตี (มีเป้าหมาย) ได้ครึ่งหนึ่ง
    const mul = p.path.length || p.target ? REGEN_MOVING : 1;
    const hp = p.hp < p.maxHp ? Math.min(p.maxHp - p.hp, Math.ceil((p.maxHp * REGEN_PCT + p.der.hpRegen) * mul)) : 0;
    const sp = p.sp < p.maxSp ? Math.min(p.maxSp - p.sp, Math.ceil((p.maxSp * REGEN_PCT + p.der.spRegen) * mul)) : 0;
    if (!hp && !sp) return;
    p.hp += hp; p.sp += sp;
    this.send(p, { t: "regen", hp, sp });
    this.send(p, { t: "stats", self: this.stats(p) });
  }

  /** คิดค่าที่คำนวณใหม่ (หลังเพิ่มค่าหลัก เลเวลขึ้น หรือเปลี่ยนอุปกรณ์) HP/SP สูงสุดที่เพิ่มขึ้นเติมให้ทันที ลดลงไม่ต่ำกว่า 1 */
  private recalc(p: Player) {
    p.der = derive(p.level, p.st, p.gear);
    p.hp = Math.min(p.der.maxHp, Math.max(p.hp > 0 ? 1 : 0, p.hp + p.der.maxHp - p.maxHp)); p.maxHp = p.der.maxHp;
    p.sp = Math.min(p.der.maxSp, Math.max(0, p.sp + p.der.maxSp - p.maxSp)); p.maxSp = p.der.maxSp;
  }

  /** ใส่/ถอดอุปกรณ์แล้ว: คิดค่าใหม่ ส่งกระเป๋าและค่าพลังให้ผู้เล่น */
  private gearChanged(p: Player) {
    p.gear = gearOf(p.equip);
    this.recalc(p);
    this.send(p, { t: "inv", items: invList(p.inv) });
    this.send(p, { t: "stats", self: this.stats(p) });
  }

  private killMob(m: Mob, killer: Player, now: number) {
    m.alive = false;
    m.path = [];
    m.aggro = null; m.aggroFrom = null; m.chaseKey = null;
    m.respawnAt = now + MOB_RESPAWN_MS;
    this.broadcast({ t: "die", id: m.id });

    // ของดรอป: หล่นที่ช่องที่มอนตาย
    const drop = MOBS[m.type].drop;
    if (drop && ITEMS[drop.item] && Math.random() < drop.chance) {
      const g: GroundItem = { id: "g" + ++this.groundSeq, item: drop.item, x: m.x, y: m.y };
      this.ground.set(g.id, g);
      this.groundExpire.set(g.id, now + GROUND_ITEM_MS);
      this.broadcast({ t: "drop", g });
    }

    const def = MOBS[m.type];
    const money = def.money ? def.money[0] + Math.floor(Math.random() * (def.money[1] - def.money[0] + 1)) : 0;
    killer.money += money;
    this.gainExp(killer, def.exp);
    this.send(killer, { t: "exp", x: m.x, y: m.y, exp: def.exp, money });
    this.countKill(killer, m.type);
    this.send(killer, { t: "stats", self: this.stats(killer) });
  }

  /** ได้ EXP แล้วเลเวลขึ้นกี่ขั้นก็ได้ (เลือด/SP เต็มเมื่อขึ้นเลเวล) เลเวลสูงสุดแล้ว EXP ไม่เกินหลอด */
  private gainExp(p: Player, exp: number) {
    const before = p.level;
    p.exp += exp;
    if (p.level >= MAX_LEVEL) p.exp = Math.min(p.exp, expToNext(p.level));
    while (p.level < MAX_LEVEL && p.exp >= expToNext(p.level)) {
      p.exp -= expToNext(p.level);
      p.level++;
      p.points += statPointsForLevel(p.level);
      this.recalc(p);
      p.hp = p.maxHp;
      p.sp = p.maxSp;
    }
    // แถบ EXP (docs/hud-status.md): เจ้าตัวได้ค่าหลังได้ EXP, เลเวลขึ้น = ทุกคนในแมพเห็นแสง
    this.send(p, { t: "exp_gain", amount: exp, exp: p.exp, expNext: expToNext(p.level), level: p.level });
    if (p.level > before) this.broadcast({ t: "level_up", id: p.id, level: p.level });
  }

  private aliveMob(id: string | null): Mob | undefined {
    if (!id) return undefined;
    const m = this.mobs.get(id);
    return m && m.alive ? m : undefined;
  }

  private nearestMob(p: Player): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const m of this.mobs.values()) {
      if (!m.alive) continue;
      const d = cheb(p.x, p.y, m.x, m.y);
      if (d <= AUTO_RADIUS && d < bestD) { bestD = d; best = m.id; }
    }
    return best;
  }

  // ---------- มอนสเตอร์ ----------

  private spawnMobs() {
    let n = 0;
    for (const [type, def] of Object.entries(MOBS)) {
      for (let i = 0; i < def.count; i++) {
        const c = this.randomCell(def.zone);
        const id = "m" + ++n;
        this.mobs.set(id, {
          id, kind: "mob", type, name: def.name,
          x: c.x, y: c.y, hp: def.maxHp, maxHp: def.maxHp,
          moveMs: def.moveMs, path: [], nextStepAt: 0,
          alive: true, respawnAt: 0, nextWanderAt: Date.now() + Math.random() * 3000,
          aggro: null, aggroFrom: null, nextAttackAt: 0, chaseKey: null,
        });
      }
    }
  }

  private respawnMob(m: Mob, now: number) {
    const c = this.randomCell(MOBS[m.type].zone);
    m.x = c.x; m.y = c.y;
    m.hp = m.maxHp;
    m.alive = true;
    m.path = [];
    m.nextWanderAt = now + 2000;
    this.broadcast({ t: "spawn", e: this.view(m) });
  }

  /** มอนเดินสุ่มระยะสั้น ๆ */
  private wander(m: Mob, now: number) {
    m.nextWanderAt = now + 2500 + Math.random() * 4000;
    for (let i = 0; i < 6; i++) {
      const x = m.x + Math.floor(Math.random() * 7) - 3;
      const y = m.y + Math.floor(Math.random() * 7) - 3;
      const zone = MOBS[m.type].zone;
      if ((x === m.x && y === m.y) || !isWalkable(x, y) || (zone && !inZone(zone, x, y))) continue;
      const path = pathTo(m.x, m.y, x, y);
      if (path && path.length <= 8) { this.setPath(m, path, now); return; }
    }
  }

  private randomCell(zone?: string): Cell {
    const z = zone ? ZONES[zone] : undefined;
    for (;;) {
      const x = z ? z.x0 + Math.floor(Math.random() * (z.x1 - z.x0 + 1)) : Math.floor(Math.random() * MAP_W);
      const y = z ? z.y0 + Math.floor(Math.random() * (z.y1 - z.y0 + 1)) : Math.floor(Math.random() * MAP_H);
      if (isWalkable(x, y) && cheb(x, y, SPAWN.x, SPAWN.y) > 4) return { x, y };
    }
  }

  // ---------- ส่งข้อมูล ----------

  private view(e: Entity): EntityState {
    return {
      id: e.id, kind: e.kind, name: e.name,
      x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
      moveMs: e.moveMs, path: e.path,
      mobType: e.kind === "mob" ? e.type : undefined,
      look: e.kind === "player" ? e.look : undefined,
      dead: e.kind === "player" && e.dead ? true : undefined,
    };
  }

  private snapshot(): EntityState[] {
    const list: EntityState[] = [];
    for (const p of this.players.values()) list.push(this.view(p));
    for (const m of this.mobs.values()) if (m.alive) list.push(this.view(m));
    return list;
  }

  private stats(p: Player): PlayerStats {
    return {
      level: p.level, exp: p.exp, expNext: expToNext(p.level),
      atk: p.der.atk, hp: p.hp, maxHp: p.maxHp, sp: p.sp, maxSp: p.maxSp, money: p.money,
      stats: { ...p.st }, points: p.points, derived: p.der,
      bonus: { ...p.gear.bonus }, equip: { ...p.equip },
    };
  }

  private send(p: Player, msg: ServerMsg) {
    try { p.ws.send(JSON.stringify(msg)); } catch { /* socket closing */ }
  }

  private broadcast(msg: ServerMsg, exceptId?: string) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      try { p.ws.send(data); } catch { /* socket closing */ }
    }
  }
}

const invList = (inv: Map<string, number>): InvItem[] =>
  [...inv].filter(([, count]) => count > 0).map(([item, count]) => ({ item, count }));
