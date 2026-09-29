import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import {
  TICK_MS, PLAYER_MOVE_MS, PLAYER_ASPD_MS, PLAYER_RANGE, AUTO_RADIUS, MOB_RESPAWN_MS,
  stepMs, cheb,
} from "../../shared/constants";
import { MAP_W, MAP_H, SPAWN, isWalkable } from "../../shared/map";
import { pathTo, pathNear, type Cell } from "../../shared/pathfind";
import { MOBS, expToNext, playerAtk, playerMaxHp, rollDamage } from "../../shared/game";
import { CLOSE_KICKED } from "../../shared/protocol";
import type { ClientMsg, ServerMsg, EntityState, PlayerStats, JoinCharacter } from "../../shared/protocol";

const SAVE_EVERY_MS = 30_000;

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
  ws: WebSocket;
  level: number;
  exp: number;
  target: string | null;
  auto: boolean;
  nextAttackAt: number;
  chaseKey: string | null; // ตำแหน่งมอนตอนคำนวณเส้นทางไล่ล่าสุด
}

interface Mob extends Ent {
  kind: "mob";
  type: string;
  alive: boolean;
  respawnAt: number;
  nextWanderAt: number;
}

type Entity = Player | Mob;

/**
 * 1 instance = 1 แมพ
 * server เป็นผู้ตัดสินทุกอย่าง: client ส่งแค่ความตั้งใจ (เดินไปช่องนี้ / ตีตัวนี้ / เปิด auto)
 */
export class MapRoom extends DurableObject<Env> {
  private players = new Map<string, Player>();
  private mobs = new Map<string, Mob>();
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
      ch = { ...ch, level: old.level, exp: old.exp, x: old.x, y: old.y };
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

    const p: Player = {
      id, kind: "player", name: ch.name, userId: ch.userId,
      x: pos.x, y: pos.y,
      hp: playerMaxHp(ch.level), maxHp: playerMaxHp(ch.level),
      moveMs: PLAYER_MOVE_MS, path: [], nextStepAt: 0,
      ws: server, level: ch.level, exp: ch.exp,
      target: null, auto: false, nextAttackAt: 0, chaseKey: null,
    };
    this.players.set(id, p);

    this.send(p, { t: "welcome", you: id, entities: this.snapshot(), self: this.stats(p) });
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
        this.setPath(p, path, now);
        break;
      }
      case "attack": {
        const m = this.mobs.get(String(msg.target));
        if (!m || !m.alive) return;
        p.target = m.id;
        p.chaseKey = null;
        this.send(p, { t: "target", id: m.id });
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
    await this.save([p]);
  }

  // ---------- บันทึก ----------

  private async save(list: Player[]) {
    if (!list.length) return;
    const now = Date.now();
    const stmt = this.env.DB.prepare(
      "UPDATE characters SET level = ?, exp = ?, x = ?, y = ?, updated_at = ? WHERE user_id = ?",
    );
    try {
      await this.env.DB.batch(list.map((p) => stmt.bind(p.level, p.exp, p.x, p.y, now, p.userId)));
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
      if (m.path.length === 0 && now >= m.nextWanderAt) this.wander(m, now);
    }
    for (const p of this.players.values()) this.updatePlayer(p, now);

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
    // auto: ไม่มีเป้าหมายที่ยังมีชีวิต → หามอนที่ใกล้ที่สุดในรัศมี
    if (p.auto && !this.aliveMob(p.target)) {
      const t = this.nearestMob(p);
      if (t !== p.target) {
        p.target = t;
        p.chaseKey = null;
        this.send(p, { t: "target", id: t });
      }
    }
    if (!p.target) return;

    const m = this.aliveMob(p.target);
    if (!m) { p.target = null; this.send(p, { t: "target", id: null }); return; }

    // อยู่ในระยะ → หยุดเดินแล้วตีตาม ASPD
    if (cheb(p.x, p.y, m.x, m.y) <= PLAYER_RANGE) {
      if (p.path.length) this.setPath(p, [], now);
      if (now >= p.nextAttackAt) this.attack(p, m, now);
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
    p.nextAttackAt = now + PLAYER_ASPD_MS;
    const { dmg, crit } = rollDamage(playerAtk(p.level), MOBS[m.type].def);
    m.hp = Math.max(0, m.hp - dmg);
    this.broadcast({ t: "hit", src: p.id, dst: m.id, dmg, crit, hp: m.hp });
    if (m.hp === 0) this.killMob(m, p, now);
  }

  private killMob(m: Mob, killer: Player, now: number) {
    m.alive = false;
    m.path = [];
    m.respawnAt = now + MOB_RESPAWN_MS;
    this.broadcast({ t: "die", id: m.id });

    killer.exp += MOBS[m.type].exp;
    while (killer.exp >= expToNext(killer.level)) {
      killer.exp -= expToNext(killer.level);
      killer.level++;
      killer.maxHp = playerMaxHp(killer.level);
      killer.hp = killer.maxHp;
    }
    this.send(killer, { t: "stats", self: this.stats(killer) });
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
        const c = this.randomCell();
        const id = "m" + ++n;
        this.mobs.set(id, {
          id, kind: "mob", type, name: def.name,
          x: c.x, y: c.y, hp: def.maxHp, maxHp: def.maxHp,
          moveMs: def.moveMs, path: [], nextStepAt: 0,
          alive: true, respawnAt: 0, nextWanderAt: Date.now() + Math.random() * 3000,
        });
      }
    }
  }

  private respawnMob(m: Mob, now: number) {
    const c = this.randomCell();
    m.x = c.x; m.y = c.y;
    m.hp = m.maxHp;
    m.alive = true;
    m.path = [];
    m.nextWanderAt = now + 2000;
    this.broadcast({ t: "spawn", e: this.view(m) });
  }

  /** Poring เดินสุ่มระยะสั้น ๆ */
  private wander(m: Mob, now: number) {
    m.nextWanderAt = now + 2500 + Math.random() * 4000;
    for (let i = 0; i < 6; i++) {
      const x = m.x + Math.floor(Math.random() * 7) - 3;
      const y = m.y + Math.floor(Math.random() * 7) - 3;
      if ((x === m.x && y === m.y) || !isWalkable(x, y)) continue;
      const path = pathTo(m.x, m.y, x, y);
      if (path && path.length <= 8) { this.setPath(m, path, now); return; }
    }
  }

  private randomCell(): Cell {
    for (;;) {
      const x = Math.floor(Math.random() * MAP_W);
      const y = Math.floor(Math.random() * MAP_H);
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
      atk: playerAtk(p.level), hp: p.hp, maxHp: p.maxHp,
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
