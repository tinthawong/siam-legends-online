import Phaser from "phaser";
import type { Net } from "./net";
import type { EntityState, PlayerStats, ServerMsg } from "../../shared/protocol";
import type { Cell } from "../../shared/pathfind";
import { TILE } from "../../shared/constants";
import { MAP_W, MAP_H, TILES, ROCK, TREE, isWalkable } from "../../shared/map";
import { DEFAULT_LOOK, GENDERS, lookKey, type Look } from "../../shared/appearance";
import { recolorSprite } from "./recolor";
import { MOBS } from "../../shared/game";

interface View {
  id: string;
  kind: EntityState["kind"];
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics | null;
  hp: number;
  maxHp: number;
  path: Cell[];
  moveMs: number;
  sprite: string | null; // มี = ภาพ 8 ทิศ (ผู้เล่น หรือมอนที่มีภาพ)
  topY: number;          // ขอบบนของตัว (ใช้วางแถบ HP / ตัวเลขดาเมจ)
}

const center = (n: number) => n * TILE + TILE / 2;

// 8 ทิศ เรียงตามมุม atan2 (แกน y ของจอชี้ลง = ทิศใต้)
const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"] as const;
type Dir = (typeof DIRS)[number];

function dirOf(dx: number, dy: number): Dir {
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRS[((i % 8) + 8) % 8];
}

// ผู้เล่นใช้ sprite 8 ทิศจาก PixelLab (client/public/sprites/)
// Poring, แมพ, วงเป้าหมาย ยังเป็นภาพ placeholder วาดด้วยโค้ดใน makeTextures() / drawMap()
export class GameScene extends Phaser.Scene {
  private views = new Map<string, View>();
  private me: string | null = null;
  private targetId: string | null = null;
  private targetRing!: Phaser.GameObjects.Image;
  private tapMarker!: Phaser.GameObjects.Image;
  private autoOn = false;
  private autoBtn = document.getElementById("auto-btn") as HTMLButtonElement;

  constructor(private net: Net) {
    super("game");
  }

  preload() {
    // ตัว base ของแต่ละเพศ (client/public/sprites/base-<เพศ>/<ทิศ>.png)
    for (const g of Object.keys(GENDERS))
      for (const d of DIRS) this.load.image(`base_${g}_${d}`, `sprites/base-${g}/${d}.png`);
    // มอนที่มีภาพ 8 ทิศ (client/public/sprites/<sprite>/<ทิศ>.png)
    for (const def of Object.values(MOBS))
      if (def.sprite) for (const d of DIRS) this.load.image(`mob_${def.sprite}_${d}`, `sprites/${def.sprite}/${d}.png`);
  }

  create() {
    this.makeTextures();
    this.drawMap();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on("resize", () => this.fitZoom());

    this.targetRing = this.add.image(0, 0, "ring").setVisible(false);
    this.tapMarker = this.add.image(0, 0, "marker").setVisible(false).setDepth(1);

    this.input.on("pointerdown", this.onTap, this);
    this.autoBtn.onclick = () => this.net.send({ t: "auto", on: !this.autoOn });

    this.net.listen((m) => this.onMsg(m));
  }

  private fitZoom() {
    const s = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(s < 520 ? 1.25 : 2);
  }

  // ---------- input ----------

  private onTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    const mob = over.find((o) => o.getData("mobId"));
    if (mob) {
      const id = mob.getData("mobId") as string;
      this.net.send({ t: "attack", target: id });
      this.setTarget(id);
      return;
    }
    const x = Math.floor(pointer.worldX / TILE);
    const y = Math.floor(pointer.worldY / TILE);
    if (!isWalkable(x, y)) return;
    this.net.send({ t: "move", x, y });

    this.tapMarker.setPosition(center(x), center(y)).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.add({ targets: this.tapMarker, alpha: 0, scale: 0.4, duration: 450 });
  }

  // ---------- ข้อความจาก server ----------

  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case "welcome":
        this.me = m.you;
        for (const e of m.entities) this.addView(e);
        this.cameras.main.startFollow(this.views.get(m.you)!.c, true, 0.2, 0.2);
        this.updateStats(m.self);
        break;
      case "spawn":
        this.addView(m.e);
        break;
      case "despawn":
        this.removeView(m.id);
        break;
      case "move": {
        const v = this.views.get(m.id);
        if (!v) break;
        const fx = center(m.from.x), fy = center(m.from.y);
        // ถ้าภาพเพี้ยนจาก server เกิน 1.5 ช่อง ให้กระโดดไปตำแหน่งจริง
        if (Phaser.Math.Distance.Between(v.c.x, v.c.y, fx, fy) > TILE * 1.5) v.c.setPosition(fx, fy);
        v.moveMs = m.moveMs;
        v.path = m.path.length ? m.path.slice() : [m.from]; // path ว่าง = หยุดที่ช่อง from
        break;
      }
      case "hit": {
        const dst = this.views.get(m.dst);
        if (dst) {
          dst.hp = m.hp;
          this.drawHp(dst);
          this.floatDamage(dst, m.dmg, m.crit);
          dst.body.setTintFill(0xffffff);
          this.time.delayedCall(70, () => dst.body.clearTint());
        }
        const src = this.views.get(m.src);
        if (src && dst) this.face(src, dst.c.x - src.c.x, dst.c.y - src.c.y);
        break;
      }
      case "die": {
        const v = this.views.get(m.id);
        if (m.id === this.targetId) this.setTarget(null);
        if (v) {
          this.views.delete(m.id);
          this.tweens.add({ targets: v.c, alpha: 0, scaleY: 0.2, duration: 300, onComplete: () => v.c.destroy() });
        }
        break;
      }
      case "stats":
        this.updateStats(m.self);
        break;
      case "target":
        this.setTarget(m.id);
        break;
      case "auto":
        this.autoOn = m.on;
        this.autoBtn.classList.toggle("on", m.on);
        this.autoBtn.setAttribute("aria-pressed", String(m.on));
        break;
    }
  }

  // ---------- entity ----------

  private addView(e: EntityState) {
    this.removeView(e.id);
    const c = this.add.container(center(e.x), center(e.y));
    const isMob = e.kind === "mob";
    const mobSprite = isMob && e.mobType ? MOBS[e.mobType]?.sprite : undefined;
    const sprite = isMob ? (mobSprite ? `mob_${mobSprite}` : null) : this.lookSprite(e.look ?? DEFAULT_LOOK);
    const tex = sprite ? `${sprite}_south` : "poring";
    // sprite 48px: ตั้ง origin ให้เท้าตรงกลางช่อง (ผู้เล่นเท้าอยู่บรรทัด 45, ปูนาบรรทัด 43)
    const feet = mobSprite ? 43 : 45;
    const body = sprite
      ? this.add.image(0, 8, tex).setOrigin(0.5, feet / 48)
      : this.add.image(0, 4, tex).setOrigin(0.5, 1);
    const topY = sprite ? 8 - feet + 2 : 4 - body.height;
    const label = this.add.text(0, 7, e.name, {
      fontFamily: "Mitr, sans-serif", fontSize: "10px", color: isMob ? "#ffe0ec" : "#ffffff",
      stroke: "#10192a", strokeThickness: 3,
    }).setOrigin(0.5, 0).setResolution(2);
    c.add([body, label]);

    let hpBar: Phaser.GameObjects.Graphics | null = null;
    if (isMob) {
      hpBar = this.add.graphics();
      c.add(hpBar);
      // พื้นที่แตะใหญ่กว่าตัว เพื่อให้กดบนมือถือง่าย
      body.setInteractive(new Phaser.Geom.Circle(body.width / 2, body.height / 2, 22), Phaser.Geom.Circle.Contains);
      body.setData("mobId", e.id);
      // เด้งดึ๋งเฉพาะ Poring (มอนที่มีภาพ 8 ทิศยังไม่มีท่าทาง ปล่อยนิ่งไว้)
      if (!sprite) this.tweens.add({
        targets: body, scaleY: 0.86, scaleX: 1.1, yoyo: true, repeat: -1,
        duration: 380 + Math.random() * 120, ease: "Sine.easeInOut",
      });
    }

    const v: View = { id: e.id, kind: e.kind, c, body, hpBar, hp: e.hp, maxHp: e.maxHp, path: e.path.slice(), moveMs: e.moveMs, sprite, topY };
    this.views.set(e.id, v);
    this.drawHp(v);
    c.setDepth(c.y);
  }

  private removeView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    v.c.destroy();
    this.views.delete(id);
  }

  private drawHp(v: View) {
    if (!v.hpBar) return;
    const g = v.hpBar.clear();
    if (v.hp >= v.maxHp) return; // เต็มแล้วไม่ต้องโชว์
    const y = v.topY - 7;
    g.fillStyle(0x10192a).fillRect(-13, y, 26, 5);
    g.fillStyle(0x6fe07a).fillRect(-12, y + 1, 24 * (v.hp / v.maxHp), 3);
  }

  private floatDamage(v: View, dmg: number, crit: boolean) {
    const t = this.add.text(v.c.x, v.c.y + v.topY - 9, String(dmg), {
      fontFamily: "Mitr, sans-serif", fontSize: crit ? "16px" : "12px",
      color: crit ? "#ffd84a" : "#ffffff", stroke: "#10192a", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100000).setResolution(2);
    this.tweens.add({ targets: t, y: t.y - 22, alpha: 0, duration: 750, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  /** สร้าง texture ของรูปลักษณ์นี้ครบ 8 ทิศ (ครั้งแรกครั้งเดียว) แล้วคืนชื่อนำหน้า */
  private lookSprite(look: Look): string {
    const prefix = `p_${lookKey(look)}`;
    if (!this.textures.exists(`${prefix}_south`)) {
      for (const d of DIRS) {
        const src = this.textures.get(`base_${look.gender}_${d}`).getSourceImage() as HTMLImageElement;
        this.textures.addCanvas(`${prefix}_${d}`, recolorSprite(src, look));
      }
    }
    return prefix;
  }

  /** หันหน้า: ตัวละคร 8 ทิศเปลี่ยนภาพ, มอนพลิกซ้าย-ขวา */
  private face(v: View, dx: number, dy: number) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    if (v.sprite) v.body.setTexture(`${v.sprite}_${dirOf(dx, dy)}`);
    else if (Math.abs(dx) > 0.5) v.body.setFlipX(dx < 0);
  }

  private setTarget(id: string | null) {
    this.targetId = id;
    this.targetRing.setVisible(!!id && this.views.has(id));
  }

  private updateStats(s: PlayerStats) {
    document.getElementById("hud-lv")!.textContent = `Lv ${s.level}`;
    (document.getElementById("hud-exp") as HTMLElement).style.width = `${(s.exp / s.expNext) * 100}%`;
    document.getElementById("hud-exp-text")!.textContent = `EXP ${s.exp} / ${s.expNext}`;
  }

  // ---------- เดินตาม path ทุกเฟรม ----------

  update(_time: number, dt: number) {
    for (const v of this.views.values()) {
      if (v.path.length) {
        const n = v.path[0];
        const tx = center(n.x), ty = center(n.y);
        const dx = tx - v.c.x, dy = ty - v.c.y;
        const dist = Math.hypot(dx, dy);
        const step = (TILE / v.moveMs) * dt; // ทแยงใช้เวลา ×1.414 ตรงกับ server
        if (dist <= step) { v.c.setPosition(tx, ty); v.path.shift(); }
        else { v.c.x += (dx / dist) * step; v.c.y += (dy / dist) * step; }
        this.face(v, dx, dy);
      }
      v.c.setDepth(v.c.y);
    }
    const t = this.targetId ? this.views.get(this.targetId) : undefined;
    if (t) this.targetRing.setPosition(t.c.x, t.c.y + 2).setDepth(t.c.y - 1).setVisible(true);
  }

  // ---------- ภาพ placeholder ----------

  private makeTextures() {
    const g = this.make.graphics({}, false);


    g.fillStyle(0x000000, 0.25).fillEllipse(14, 22, 22, 6);
    g.fillStyle(0xff8fb4).fillEllipse(14, 14, 26, 18);
    g.fillStyle(0xffd0e0).fillEllipse(9, 10, 7, 4);
    g.fillStyle(0x2a1a22).fillRect(9, 13, 2, 3).fillRect(17, 13, 2, 3);
    g.fillStyle(0xc2406a).fillRect(12, 18, 4, 1);
    g.generateTexture("poring", 28, 24);

    g.clear();
    g.lineStyle(2, 0xffd84a).strokeEllipse(18, 8, 32, 12);
    g.generateTexture("ring", 36, 16);

    g.clear();
    g.lineStyle(2, 0xffffff).strokeCircle(8, 8, 6);
    g.generateTexture("marker", 16, 16);

    g.destroy();
  }

  private drawMap() {
    const g = this.add.graphics().setDepth(-1);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = TILES[y * MAP_W + x];
        const px = x * TILE, py = y * TILE;
        g.fillStyle((x * 7 + y * 13) % 5 === 0 ? 0x4f8a42 : 0x55924a).fillRect(px, py, TILE, TILE);
        if (t === ROCK) {
          g.fillStyle(0x7d8590).fillRoundedRect(px + 3, py + 6, TILE - 6, TILE - 9, 6);
          g.fillStyle(0x9aa3ad).fillRoundedRect(px + 7, py + 8, 10, 6, 3);
        } else if (t === TREE) {
          g.fillStyle(0x5b3a1f).fillRect(px + 13, py + 18, 6, 12);
          g.fillStyle(0x2f5d2a).fillCircle(px + 16, py + 13, 12);
          g.fillStyle(0x3d7535).fillCircle(px + 12, py + 10, 6);
        }
      }
    }
  }
}
