import WEAPON_DATA from "../../shared/data/weapons.json";
import Phaser from "phaser";
import type { Net } from "./net";
import type { EntityState, PlayerStats, ServerMsg } from "../../shared/protocol";
import type { Cell } from "../../shared/pathfind";
import { TILE, AUTO_RADIUS, cheb } from "../../shared/constants";
import { FLAT_PROPS, TERRAIN_NAMES, PROP_SETS, ARCH_BRIDGES, isSolidProp, PROP_SET_OF, getMap, type GameMap, type MapExit } from "../../shared/map";
import { forestTrees, FOREST_KINDS } from "./forest";
import { renderGround, TILE_URLS } from "./mapRender";
import { DEFAULT_LOOK, GENDERS, lookKey, type Look } from "../../shared/appearance";
import { recolorSprite } from "./recolor";
import { MOBS } from "../../shared/game";
import { ITEMS } from "../../shared/items";
import type { GroundItem, InvItem } from "../../shared/protocol";
import { NPCS, QUESTS, emptyLog, isComplete, npcMark, type QuestLog } from "../../shared/quests";
import { SKILLS } from "../../shared/skills";
import { IDLE_FRAMES, IDLE_FPS, IDLE_OFFSET, WALK_FRAMES, WALK_FPS, WALK_OFFSET, WALK_SCALE, animSource, idleDirs, idleFrameUrl, walkDirs, walkFrameUrl } from "./sprites";

interface View {
  id: string;
  kind: EntityState["kind"];
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics | null;
  inner: Phaser.GameObjects.Container; // ตัว + เงา (ยกขึ้นตอนอยู่บนสะพานโค้ง)
  tunic: Phaser.GameObjects.Image | null; // เสื้อทับตัว (ทดสอบ)
  weapon: Phaser.GameObjects.Image | null; // อาวุธในมือ (ทดสอบ)
  swing: { a: number };                    // มุมเหวี่ยงอาวุธตอนตี (องศา ก่อนกลับด้าน)
  lift: number;                         // ยกขึ้นกี่ px (สะพานโค้ง) — ข้อความ/เอฟเฟกต์เหนือตัวต้องยกตาม
  oc: Phaser.GameObjects.Container; // ชื่อ + แถบ HP ลอยอยู่ชั้นบนสุด ไม่โดนต้นไม้/หลังคาบัง (ตามตำแหน่ง c ทุกเฟรม)
  hp: number;
  maxHp: number;
  path: Cell[];
  moveMs: number;
  sprite: string | null; // มี = ภาพ 8 ทิศ (ผู้เล่น หรือมอนที่มีภาพ)
  look: Look | null;     // ผู้เล่น: เพศใช้เลือกทิศที่มีท่ายืน
  dead: boolean;         // ผู้เล่นสลบ (นิ่ง ไม่ขยับ)
  motion: { mode: "breath" | "step"; tween: Phaser.Tweens.Tween } | null; // ผู้เล่นที่ไม่มีภาพท่านั้น: ขยับด้วยโค้ด
  sheet: string | null;  // มี = มอนจาก sheet (ทิศเดียว มีท่า walk/attack/death)
  bob: Phaser.Tweens.Tween | null; // ท่ายืนของมอนจาก sheet (ขยับขึ้นลงด้วยโค้ด)
  topY: number;          // ขอบบนของตัว (ใช้วางแถบ HP / ตัวเลขดาเมจ)
  dir: Dir;              // ทิศที่หันอยู่
  pose: string;          // texture/animation ที่แสดงอยู่ (กันตั้งซ้ำทุกเฟรม)
}

/** sheet.json ที่ได้จาก tools/slice_sheet.py */
interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number }; // จุดกึ่งกลางเท้า
  animations: Record<string, { frames: string[]; frameMs: number; loop: boolean }>;
}

/** ชุดภาพมอนทั้งหมดที่ต้องโหลด: ชุดหลัก (part = "") และชุดท่าเพิ่มในโฟลเดอร์ย่อย */
function sheetList(): { name: string; part: string }[] {
  const out = new Map<string, { name: string; part: string }>();
  for (const d of Object.values(MOBS)) {
    if (!d.sheet) continue;
    for (const part of ["", ...(d.sheetParts ?? [])]) out.set(`${d.sheet}/${part}`, { name: d.sheet, part });
  }
  return [...out.values()];
}

const center = (n: number) => n * TILE + TILE / 2;

// 8 ทิศ เรียงตามมุม atan2 (แกน y ของจอชี้ลง = ทิศใต้)
const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"] as const;
type Dir = (typeof DIRS)[number];

const DIR_VEC: Record<string, [number, number]> = {
  east: [1, 0], "south-east": [1, 1], south: [0, 1], "south-west": [-1, 1],
  west: [-1, 0], "north-west": [-1, -1], north: [0, -1], "north-east": [1, -1],
};
// ก้าวของแต่ละทิศ ตามลำดับ DIRS
const STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
const JOY_AHEAD = 4;     // จอยสติ๊ก: สั่งเดินไปช่องข้างหน้ากี่ช่อง
const JOY_RESEND_MS = 150;
const PUNCH_WINDUP_MS = 80;
// เสื้อทับตัว (ทดสอบ) ภาพ sprites/equipment/tunic/<ทิศ>.png ตาม tunic.json: เสื้ออยู่แถว TOP–BOTTOM ของภาพตัวละคร 48×48
const TUNIC_DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
const TUNIC_BOTTOM = 35, TUNIC_HD = 2;
const tunicTop = (dir: string) => (dir.startsWith("north") ? 20 : 18);
// อาวุธในมือ (ทดสอบ) ภาพ sprites/equipment/weapons/<id>.png (tools/make_weapons.py ย่อไว้ HD เท่าของ gameScale)
// ภาพเอียง 45° ปลายชี้ขึ้นขวา จุดหมุน = grip (พิกเซลของภาพเต็ม) · hand = false ใช้เป็นไอคอนอย่างเดียว
const WEAPON_HD = 2;
const HELD_WEAPONS = WEAPON_DATA.filter((w) => w.hand);
// จุดมือในภาพตัวละคร 48×48 ต่อทิศ: back = วาดก่อนตัวละคร, flip = กลับด้านภาพอาวุธ
const HAND: Record<string, { x: number; y: number; back: boolean; flip: boolean }> = {
  south: { x: 15, y: 33, back: false, flip: true },
  "south-east": { x: 18, y: 34, back: false, flip: true },
  east: { x: 24, y: 33, back: false, flip: false },
  "north-east": { x: 31, y: 34, back: false, flip: false },
  north: { x: 32, y: 33, back: true, flip: false },
  "north-west": { x: 30, y: 32, back: true, flip: false },
  west: { x: 23, y: 33, back: true, flip: true },
  "south-west": { x: 15, y: 33, back: true, flip: true },
};
// ตีปกติ: หมุนรอบ grip -10° → -60° → +85° → 0° รวม 0.3 วินาที (โดนเป้าตอนฟันลงสุด)
const SWING_STEPS = [{ a: -10, ms: 30 }, { a: -60, ms: 90 }, { a: 85, ms: 90 }, { a: 0, ms: 90 }];
const SWING_HIT_MS = 210;
const FX_NAMES = ["flurry", "golden-fist"]; // เอฟเฟกต์สกิล (ตีปกติวาดด้วยโค้ด: punchFx)
// มินิแมพ: ภาพพื้นแมพย่อเก็บไว้ที่สัดส่วนนี้ แสดงพื้นที่กว้าง MINI_VIEW px (โลก) รอบตัวเรา วาดใหม่ทุก 100 ms
const MINI_SCALE = 0.25;
const MINI_VIEW = 560; // ต่อย: ง้างก่อนกี่ ms แล้วค่อยแสดงผลที่เป้า (ตัวเลข/ประกาย)

function dirOf(dx: number, dy: number): Dir {
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRS[((i % 8) + 8) % 8];
}

// ผู้เล่นใช้ sprite 8 ทิศจาก PixelLab (client/public/sprites/)
// พื้นหญ้าใช้ภาพ sprites/tiles/grass.png / หิน ต้นไม้ วงเป้าหมาย ยังเป็นภาพ placeholder วาดด้วยโค้ดใน makeTextures() / drawMap()
export class GameScene extends Phaser.Scene {
  private views = new Map<string, View>();
  private exitLabels: { t: Phaser.GameObjects.Text; e: MapExit }[] = [];
  private groundViews = new Map<string, Phaser.GameObjects.Image>(); // ของบนพื้น
  private sheets = new Map<string, SheetMeta & { name: string }>();
  private animOrigin = new Map<string, [number, number]>(); // key animation → origin ของจุดยึดเท้า
  private me: string | null = null;
  private targetId: string | null = null;
  private targetRing!: Phaser.GameObjects.Image;
  private tapMarker!: Phaser.GameObjects.Image;
  private autoOn = false;
  private autoBtn = document.getElementById("auto-btn") as HTMLButtonElement;
  // จอยสติ๊ก: ทิศที่ลากอยู่ (index ใน DIRS) และคำสั่งเดินล่าสุดที่ส่งไป
  private joyDir: number | null = null;
  private joyMoved = false;
  private joySent = { dir: -1, x: -1, y: -1, at: 0 };

  /** กระเป๋าเปลี่ยน → main.ts วาดหน้ากระเป๋า (HTML) */
  onInventory: ((items: InvItem[]) => void) | null = null;
  /** เราสลบ (cause = สาเหตุ) / กลับเมืองแล้ว → main.ts เปิด-ปิดหน้าต่างสลบ */
  onKnockedOut: ((cause: string) => void) | null = null;
  onRevived: (() => void) | null = null;
  onStats: ((s: PlayerStats) => void) | null = null;
  onJoined: (() => void) | null = null;
  /** เควส: สถานะเปลี่ยน / NPC เปิดหน้าคุย / ส่งเควสสำเร็จ → main.ts แสดงหน้าต่าง */
  onQuests: ((log: QuestLog) => void) | null = null;
  onDialog: ((m: Extract<ServerMsg, { t: "dialog" }>) => void) | null = null;
  onQuestReward: ((m: Extract<ServerMsg, { t: "quest_reward" }>) => void) | null = null;
  /** เควสที่ทำครบแล้ว รอส่ง (null = ไม่มี) → main.ts แสดงป้าย "เควสสำเร็จ! แตะเพื่อไปรับของ" */
  onQuestGuide: ((g: { quest: string; npc: string; npcName: string } | null) => void) | null = null;
  /** ได้ EXP → main.ts เลื่อนแถบ EXP (docs/hud-status.md) */
  onExpGain: ((m: Extract<ServerMsg, { t: "exp_gain" }>) => void) | null = null;
  private guideNpc: string | null = null;
  private guideArrow!: Phaser.GameObjects.Graphics;
  private mini: { ctx: CanvasRenderingContext2D; src: HTMLCanvasElement; next: number } | null = null;

  // NPC: เครื่องหมาย ! / ? เหนือหัว คิดจากเลเวล กระเป๋า และสถานะเควสของเรา
  private npcMarks = new Map<string, Phaser.GameObjects.Text>();
  private questLog: QuestLog = emptyLog();
  private level = 1;
  private invCount = new Map<string, number>();
  private myWeapon = false; // เราถืออาวุธอยู่ไหม (มือเปล่า = ต่อย)
  private weaponIdx = -1;   // ปุ่มทดสอบอาวุธ: ลำดับใน HELD_WEAPONS (-1 = มือเปล่า)
  private tunicOn = false;  // ปุ่มทดสอบใส่เสื้อ (เห็นเฉพาะตัวเอง ยังไม่มีระบบอุปกรณ์)
  private alphaCache = new Map<string, { w: number; h: number; a: Uint8ClampedArray }>();
  /** เราใช้สกิลโดน → main.ts เริ่มนับคูลดาวน์ที่ปุ่ม */
  onSkillCast: ((id: string) => void) | null = null;

  /** แมพที่แสดงอยู่ (shared/map.ts) เปลี่ยนตอนวาป */
  private gm: GameMap;
  private resizeBound = false;
  /** เดินเข้าทางออกแล้ว server สั่งย้ายแมพ → main.ts ต่อ server ใหม่แล้วเรียก warpTo */
  onWarp: ((map: string, name: string) => void) | null = null;
  /** เข้าแมพแล้ว (ชื่อแมพ) → main.ts อัปเดตป้ายมินิแมพ/จุดบนแผนที่โลก */
  onMapReady: ((id: string, name: string) => void) | null = null;

  constructor(private net: Net, mapId: string) {
    super("game");
    this.gm = getMap(mapId);
  }

  /** วาป: ใช้การเชื่อมต่อใหม่กับห้องของแมพปลายทาง แล้วโหลดฉากใหม่ทั้งหมด */
  warpTo(mapId: string, net: Net) {
    this.net = net;
    this.gm = getMap(mapId);
    this.scene.restart();
  }

  /** เริ่มฉากใหม่ (ครั้งแรกและทุกครั้งที่วาป): ล้างสถานะของแมพเดิม (วัตถุในฉาก Phaser ลบให้เองตอน restart) */
  init() {
    this.views.clear();
    this.groundViews.clear();
    this.exitLabels = [];
    this.npcMarks.clear();
    this.mini = null;
    this.me = null;
    this.targetId = null;
    this.guideNpc = null;
    this.joyDir = null;
  }

  preload() {
    // ตัว base ของแต่ละเพศ (client/public/sprites/base-<เพศ>/<ทิศ>.png)
    for (const g of Object.keys(GENDERS))
      for (const d of DIRS) this.load.image(`base_${g}_${d}`, `sprites/base-${g}/${d}.png`);
    for (const g of Object.keys(GENDERS))
      for (const d of walkDirs(g))
        for (let i = 0; i < WALK_FRAMES; i++) this.load.image(`base_${g}_walk_${d}_${i}`, walkFrameUrl(g, d, i));
    for (const g of Object.keys(GENDERS))
      for (const d of idleDirs(g))
        for (let i = 0; i < IDLE_FRAMES; i++) this.load.image(`base_${g}_idle_${d}_${i}`, idleFrameUrl(g, d, i));
    // พื้นหญ้า 64×64 ปูซ้ำทั้งแมพ (ขนาดเดิม ไม่ย่อ/ขยาย)
    TILE_URLS.forEach((url, i) => this.load.image(`tile_${TERRAIN_NAMES[i]}`, url));
    // พื้นที่ bake แล้ว (npm run bake / npm run map) ถ้ามี ใช้แทนพื้นที่วาดด้วยโค้ด ไม่มี = วาดเอง (renderGround)
    this.load.image(`baked_${this.gm.id}`, `maps/${this.gm.id}/ground.webp`);
    // ของประดับในแมพ: props.json (ขนาด, จุดยึด, ความกว้างเงา) + รูปแต่ละชิ้น
    for (const set of Object.keys(PROP_SETS)) this.load.json(`props_${set}`, `sprites/props/${set}/props.json`);
    // สะพานโค้งใช้ภาพสองชั้น (-back/-front) ของที่ยังไม่มีภาพ (ไม่อยู่ในชุดไหน) ข้าม
    const kinds = new Set([...this.gm.props.flatMap((p) => ARCH_BRIDGES.has(p.kind) ? [`${p.kind}-back`, `${p.kind}-front`] : [p.kind]), ...FOREST_KINDS]);
    for (const kind of kinds) if (PROP_SET_OF[kind]) this.load.image(`prop_${kind}`, `sprites/props/${PROP_SET_OF[kind]}/${kind}.png`);
    // รูปไอเท็ม 16px ใช้ตอนหล่นบนพื้น (64px ใช้ในหน้ากระเป๋าซึ่งเป็น HTML)
    for (const it of Object.values(ITEMS)) if (it.icon) this.load.image(`item_${it.icon}`, `sprites/items/${it.icon}-16.png`);
    for (const w of HELD_WEAPONS) this.load.image(`weapon_${w.id}`, `sprites/equipment/weapons/${w.file}`);
    for (const d of TUNIC_DIRS) this.load.image(`tunic_${d}`, `sprites/equipment/tunic/${d}.png`);
    // เอฟเฟกต์การโจมตี/สกิล (tools/slice_fx.py): sprites/fx/<ชื่อ>/sheet.json + เฟรม
    for (const name of FX_NAMES) {
      const key = `fxsheet_${name}`;
      this.load.once(`filecomplete-json-${key}`, (_k: string, _t: string, data: { frames: string[] }) => {
        data.frames.forEach((f, i) => this.load.image(`fx_${name}_${i}`, `sprites/fx/${name}/${f}`));
      });
      this.load.json(key, `sprites/fx/${name}/sheet.json`);
    }
    // NPC: client/public/sprites/<sprite>/sheet.json (ท่ายืน) ยังไม่มีภาพ = โหลดไม่เจอ ใช้ภาพชั่วคราว (drawNpcs)
    for (const n of Object.values(NPCS).filter((n) => n.map === this.gm.id)) {
      const dir = `sprites/${n.sprite}`, key = `npcsheet_${n.id}`;
      this.load.once(`filecomplete-json-${key}`, (_key: string, _type: string, data: SheetMeta) => {
        for (const a of Object.values(data.animations))
          for (const f of a.frames) this.load.image(`${n.id}_${f.replace(/\.png$/, "")}`, `${dir}/${f}`);
      });
      this.load.json(key, `${dir}/sheet.json`);
    }
    // มอนจาก sheet: โหลด sheet.json ก่อน แล้วค่อยโหลดทุกเฟรมที่ระบุในนั้น (ชุดหลัก + ชุดท่าเพิ่มแต่ละโฟลเดอร์)
    for (const { name, part } of sheetList()) {
      const dir = `sprites/monsters/${name}${part ? `/${part}` : ""}`;
      const key = `sheet_${name}${part ? `_${part}` : ""}`;
      this.load.once(`filecomplete-json-${key}`, (_key: string, _type: string, data: SheetMeta) => {
        for (const a of Object.values(data.animations))
          for (const f of a.frames) this.load.image(`${name}_${f.replace(/\.png$/, "")}`, `${dir}/${f}`);
      });
      this.load.json(key, `${dir}/sheet.json`);
    }
  }

  /** สร้าง animation ของมอนจาก sheet ตาม ms ต่อเฟรมใน sheet.json และจำจุดยึดเท้าของแต่ละท่า */
  private makeSheetAnims() {
    for (const { name, part } of sheetList()) {
      const data = this.cache.json.get(`sheet_${name}${part ? `_${part}` : ""}`) as SheetMeta | undefined;
      if (!data) continue;
      if (!part) this.sheets.set(name, { name, ...data });
      for (const [anim, a] of Object.entries(data.animations)) {
        const key = `${name}_${anim}`;
        this.anims.create({
          key,
          frames: a.frames.map((f) => ({ key: `${name}_${f.replace(/\.png$/, "")}` })),
          frameRate: 1000 / a.frameMs,
          repeat: a.loop ? -1 : 0,
        });
        this.animOrigin.set(key, [data.anchor.x / data.frameWidth, data.anchor.y / data.frameHeight]);
      }
    }
  }

  /** เล่นท่าของมอนจาก sheet โดยตั้งจุดยึดเท้าตามชุดของท่านั้น (แต่ละชุดขนาดเฟรมไม่เท่ากัน) */
  private playSheet(v: View, anim: string) {
    const key = `${v.sheet}_${anim}`;
    const o = this.animOrigin.get(key);
    if (o) v.body.setOrigin(o[0], o[1]);
    v.body.play(key, true);
  }

  create() {
    this.makeTextures();
    this.makeSheetAnims();
    for (const name of FX_NAMES) {
      const d = this.cache.json.get(`fxsheet_${name}`) as { frames: string[]; frameMs: number; durations?: number[] } | undefined;
      if (!d) continue;
      // เวลาต่อเฟรมไม่เท่ากัน (durations): Phaser บวก duration เพิ่มจาก msPerFrame จึงตั้ง frameRate 1000 (1 ms) แล้วใส่ที่เหลือ
      if (d.durations) this.anims.create({ key: `fx_${name}`, frameRate: 1000, repeat: 0,
        frames: d.frames.map((_, i) => ({ key: `fx_${name}_${i}`, duration: d.durations![i] - 1 })) });
      else this.anims.create({ key: `fx_${name}`, frames: d.frames.map((_, i) => ({ key: `fx_${name}_${i}` })), frameRate: 1000 / d.frameMs, repeat: 0 });
    }
    this.drawMap();
    this.drawNpcs();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.gm.W * TILE, this.gm.H * TILE);
    cam.setRoundPixels(true);
    this.fitZoom();
    if (!this.resizeBound) { this.resizeBound = true; this.scale.on("resize", () => this.fitZoom()); }

    this.targetRing = this.add.image(0, 0, "ring").setVisible(false);
    this.tapMarker = this.add.image(0, 0, "marker").setVisible(false).setDepth(1);
    // ลูกศรนำทางไปส่งเควส: สามเหลี่ยมทองขอบเข้ม หมุนรอบตัวเราชี้ไปทาง NPC
    this.guideArrow = this.add.graphics().setDepth(90002).setVisible(false);
    this.guideArrow.fillStyle(0x3a1a05).fillTriangle(13, 0, -7, -10, -7, 10)
      .fillStyle(0xffd84a).fillTriangle(10, 0, -5, -7, -5, 7)
      .fillStyle(0xfff2b0).fillTriangle(8, -1, -3, -5, -3, -1);

    this.input.on("pointerdown", this.onTap, this);
    this.autoBtn.onclick = () => this.net.send({ t: "auto", on: !this.autoOn });

    this.net.listen((m) => this.onMsg(m));
    this.onMapReady?.(this.gm.id, this.gm.name);
  }

  private fitZoom() {
    const s = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(s < 520 ? 1.25 : 2);
  }

  // ---------- input ----------

  private onTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    // กดที่ NPC → เดินไปคุย
    const npc = over.find((o) => o.getData("npcId"));
    if (npc) {
      this.net.send({ t: "talk", npc: npc.getData("npcId") as string });
      this.setTarget(null);
      return;
    }
    // กดที่ของบนพื้น → เดินไปเก็บ
    const item = over.find((o) => o.getData("groundId"));
    if (item) {
      this.net.send({ t: "pickup", id: item.getData("groundId") as string });
      this.setTarget(null);
      return;
    }
    const mob = over.find((o) => o.getData("mobId"));
    if (mob) {
      const id = mob.getData("mobId") as string;
      this.net.send({ t: "attack", target: id });
      this.setTarget(id);
      return;
    }
    const x = Math.floor(pointer.worldX / TILE);
    const y = Math.floor(pointer.worldY / TILE);
    if (!this.gm.isWalkable(x, y)) return;
    this.net.send({ t: "move", x, y });

    this.tapMarker.setPosition(center(x), center(y)).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.add({ targets: this.tapMarker, alpha: 0, scale: 0.4, duration: 450 });
  }

  /** จอยสติ๊ก: dir = ทิศที่ลาก, null = ปล่อยนิ้ว (หยุดที่ช่องถัดไป) */
  setJoystick(dir: { dx: number; dy: number } | null) {
    if (dir) {
      const i = Math.round(Math.atan2(dir.dy, dir.dx) / (Math.PI / 4));
      this.joyDir = ((i % 8) + 8) % 8;
      return;
    }
    this.joyDir = null;
    const v = this.me ? this.views.get(this.me) : undefined;
    if (this.joyMoved && v && v.path.length > 1) this.net.send({ t: "move", x: v.path[0].x, y: v.path[0].y });
    this.joyMoved = false;
    this.joySent.dir = -1;
  }

  /** เดินตามจอย: server หาเส้นทางเอง client แค่บอกช่องปลายทางข้างหน้า แล้วส่งใหม่เมื่อใกล้ถึง/เปลี่ยนทิศ */
  private joyStep(time: number) {
    const v = this.me ? this.views.get(this.me) : undefined;
    if (!v || this.joyDir === null) return;
    if (this.joyDir === this.joySent.dir && v.path.length > 2) return;
    if (time - this.joySent.at < JOY_RESEND_MS) return;
    const cx = Math.floor(v.c.x / TILE), cy = Math.floor(v.c.y / TILE);
    // ติดกำแพงตรง ๆ ลองทิศข้างเคียง (ไถลเลียบกำแพง)
    for (const d of [this.joyDir, (this.joyDir + 1) % 8, (this.joyDir + 7) % 8]) {
      const [sx, sy] = STEPS[d];
      let k = 0;
      while (k < JOY_AHEAD && this.gm.isWalkable(cx + sx * (k + 1), cy + sy * (k + 1))) k++;
      if (!k) continue;
      const x = cx + sx * k, y = cy + sy * k;
      // ส่งปลายทางเดิมซ้ำเฉพาะเมื่อผ่านไปนานพอ (กันส่งรัวตอนเดินไม่ได้)
      if (x === this.joySent.x && y === this.joySent.y && time - this.joySent.at < 500) return;
      this.net.send({ t: "move", x, y });
      this.joySent = { dir: this.joyDir, x, y, at: time };
      this.joyMoved = true;
      return;
    }
  }

  /** ปุ่มโจมตี: ตีเป้าหมายที่เลือกอยู่ ถ้าไม่มี เลือกมอนที่ใกล้ที่สุดในระยะ (รัศมีเดียวกับ auto) */
  attackButton() {
    const id = this.pickTarget();
    if (!id) return;
    this.net.send({ t: "attack", target: id });
    this.setTarget(id);
  }

  /** ใช้สกิล: เป้าหมายที่เลือกอยู่ หรือมอนใกล้สุดในระยะ (server เดินเข้าระยะแล้วใช้ ตรวจ SP/คูลดาวน์เอง) */
  useSkill(skill: string) {
    const id = this.pickTarget();
    if (!id) return;
    this.net.send({ t: "skill", id: skill, target: id });
    this.setTarget(id);
  }

  private pickTarget(): string | null {
    let id = this.targetId && this.views.has(this.targetId) ? this.targetId : null;
    if (!id) {
      const me = this.me ? this.views.get(this.me) : undefined;
      if (!me) return null;
      const cx = Math.floor(me.c.x / TILE), cy = Math.floor(me.c.y / TILE);
      let best = Infinity;
      for (const v of this.views.values()) {
        if (v.kind !== "mob" || v.hp <= 0) continue;
        const d = cheb(cx, cy, Math.floor(v.c.x / TILE), Math.floor(v.c.y / TILE));
        if (d <= AUTO_RADIUS && d < best) { best = d; id = v.id; }
      }
    }
    return id;
  }

  // ---------- ข้อความจาก server ----------

  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case "welcome":
        this.me = m.you;
        for (const e of m.entities) this.addView(e);
        { const mv = this.views.get(m.you); if (mv) { if (this.tunicOn) this.setTunic(mv, true); this.setWeapon(mv); } }
        for (const g of m.ground) this.addGround(g, false);
        this.cameras.main.startFollow(this.views.get(m.you)!.c, true, 0.2, 0.2);
        this.updateStats(m.self);
        this.setInv(m.inv);
        this.questLog = m.quests;
        this.onQuests?.(m.quests);
        this.updateMarks();
        this.onJoined?.();
        break;
      case "quests":
        this.questLog = m.log;
        this.onQuests?.(m.log);
        this.updateMarks();
        break;
      case "dialog":
        this.onDialog?.(m);
        break;
      case "quest_reward": {
        const v = this.me ? this.views.get(this.me) : undefined;
        if (v) {
          this.floatText(v.c.x, v.c.y - v.lift + v.topY - 26, "เควสสำเร็จ!", "#ffd84a", 1500);
        }
        this.onQuestReward?.(m);
        break;
      }
      case "drop":
        this.addGround(m.g, true);
        break;
      case "picked": {
        const img = this.groundViews.get(m.id);
        if (!img) break;
        this.groundViews.delete(m.id);
        const name = ITEMS[img.getData("item") as string]?.name;
        if (m.by === this.me && name) this.floatText(img.x, img.y - 18, `+${name}`, "#b9f0c8", 1100);
        const by = this.views.get(m.by);
        // ของลอยเข้าหาคนเก็บแล้วหายไป
        this.tweens.killTweensOf(img);
        this.tweens.add({ targets: img, x: by?.c.x ?? img.x, y: (by?.c.y ?? img.y) - 16, alpha: 0, scale: 0.5, duration: 220, onComplete: () => img.destroy() });
        break;
      }
      case "inv":
        this.setInv(m.items);
        break;
      case "expire": {
        const img = this.groundViews.get(m.id);
        if (!img) break;
        this.groundViews.delete(m.id);
        this.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.destroy() });
        break;
      }
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
          // ต่อย: ง้างหมัดก่อน ตัวเลข/ประกายขึ้นตอนหมัดถึงเป้า
          const impact = () => {
            if (!dst.body.active) return;
            if (m.miss) this.floatText(dst.c.x, dst.c.y - dst.lift + dst.topY - 9, "พลาด", "#bfc7d5", 700);
            else { this.floatDamage(dst, m.dmg, m.crit); this.hitFx(dst, this.views.get(m.src), m.crit); }
            if (m.miss) return;
            dst.body.setTintFill(0xffffff);
            this.time.delayedCall(70, () => dst.body.clearTint());
          };
          if (this.isPunch(m.src)) this.time.delayedCall(PUNCH_WINDUP_MS, impact);
          else if (this.views.get(m.src)?.weapon) this.time.delayedCall(SWING_HIT_MS, impact);
          else impact();
          // มอนจาก sheet ที่มีท่าโดนตี: เล่นพร้อมกะพริบขาว แต่ไม่ขัดท่า attack ที่กำลังเล่นอยู่
          if (dst.sheet && dst.pose !== "attack" && this.anims.exists(`${dst.sheet}_hit`)) {
            dst.pose = "hit";
            dst.bob?.pause(); dst.body.y = 8;
            this.playSheet(dst, "hit");
            dst.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + `${dst.sheet}_hit`, () => {
              dst.pose = "";
              this.updatePose(dst);
            });
          }
        }
        const src = this.views.get(m.src);
        if (src && dst) this.face(src, dst.c.x - src.c.x, dst.c.y - src.c.y);
        // ผู้เล่นตี: พุ่งตัว + รอยฟัน (ตีพลาดก็เห็นท่าเหวี่ยง)
        if (src?.kind === "player" && dst) {
          if (src.weapon) this.weaponSwing(src);
          else if (this.isPunch(src.id)) this.punchFx(src, dst, m.crit);
          else this.swingFx(src, dst, m.crit);
        }
        // มอนจาก sheet ตีผู้เล่น: เล่นท่า attack จนจบแล้วกลับท่าเดิม
        if (src?.sheet && this.anims.exists(`${src.sheet}_attack`)) {
          src.pose = "attack";
          src.bob?.pause(); src.body.y = 8;
          this.playSheet(src, "attack");
          src.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + `${src.sheet}_attack`, () => {
            src.pose = "";
            this.updatePose(src);
          });
        }
        break;
      }
      case "dead": {
        const v = this.views.get(m.id);
        if (v) this.setDead(v, true);
        if (m.id === this.me) this.onKnockedOut?.(m.cause);
        break;
      }
      case "respawn": {
        const v = this.views.get(m.id);
        if (!v) break;
        this.setDead(v, false);
        if (m.id === this.me) this.onRevived?.();
        v.path = [];
        v.c.setPosition(center(m.x), center(m.y));
        v.dir = "south";
        this.updatePose(v);
        break;
      }
      case "notice": {
        const v = this.me ? this.views.get(this.me) : undefined;
        if (v) this.floatText(v.c.x, v.c.y - v.lift + v.topY - 12, m.text, "#ffe39a", 1600);
        break;
      }
      case "exp":
        // EXP ลอยเหนือหัวเรา (exp_gain) ที่ตัวมอนเหลือแค่เบี้ย
        if (m.money) this.floatText(center(m.x), center(m.y) - 12, `+${m.money} เบี้ย`, "#ffe39a", 1100);
        break;
      case "exp_gain": {
        const v = this.me ? this.views.get(this.me) : undefined;
        if (v && m.amount > 0) this.floatText(v.c.x, v.c.y - v.lift + v.topY - 14, `+${m.amount.toLocaleString("th-TH")} EXP`, "#ffd84a", 1200);
        this.onExpGain?.(m);
        break;
      }
      case "regen": {
        const v = this.me ? this.views.get(this.me) : undefined;
        if (!v) break;
        const y = v.c.y - v.lift + v.topY - 6;
        if (m.hp) this.floatText(v.c.x - (m.sp ? 10 : 0), y, `+${m.hp}`, "#7ee08a", 900);
        if (m.sp) this.floatText(v.c.x + (m.hp ? 10 : 0), y, `+${m.sp}`, "#6cc8ff", 900);
        break;
      }
      case "warp":
        this.onWarp?.(m.map, m.name);
        break;
      case "skill_hit":
        this.skillFx(m);
        break;
      case "level_up": {
        const v = this.views.get(m.id);
        if (v) this.levelUpFx(v);
        break;
      }
      case "heal": {
        const v = this.views.get(m.id);
        if (v) this.floatText(v.c.x, v.c.y - v.lift + v.topY - 9, `+${m.amount}`, "#7ee08a", 900);
        break;
      }
      case "die": {
        const v = this.views.get(m.id);
        if (m.id === this.targetId) this.setTarget(null);
        if (v) {
          this.views.delete(m.id);
          if (v.sheet && this.anims.exists(`${v.sheet}_death`)) {
            // มอนจาก sheet: เล่นท่าตายจนจบ แล้วค่อยจางหาย
            v.bob?.stop(); v.body.y = 8; v.hpBar?.clear();
            v.pose = "death";
            this.playSheet(v, "death");
            v.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
              this.tweens.add({ targets: [v.c, v.oc], alpha: 0, delay: 250, duration: 300, onComplete: () => { v.c.destroy(); v.oc.destroy(); } }));
          } else {
            this.tweens.add({ targets: [v.c, v.oc], alpha: 0, scaleY: 0.2, duration: 300, onComplete: () => { v.c.destroy(); v.oc.destroy(); } });
          }
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
    const sheetName = isMob && e.mobType ? MOBS[e.mobType]?.sheet : undefined;
    const sheet = sheetName ? this.sheets.get(sheetName) : undefined;
    const sprite = isMob ? null : this.lookSprite(e.look ?? DEFAULT_LOOK);
    const tex = sprite ? `${sprite}_south` : sheet ? `${sheet.name}_walk_0` : "poring";
    let body: Phaser.GameObjects.Sprite, topY: number;
    if (sprite) {
      // ผู้เล่น 48px: เท้าอยู่บรรทัด 45 ตั้ง origin ให้เท้าตรงกลางช่อง
      body = this.add.sprite(0, 8, tex).setOrigin(0.5, 45 / 48);
      topY = 8 - 45 + 2;
    } else if (sheet) {
      // มอนจาก sheet: จุดยึดที่เท้าตาม sheet.json วางระดับเดียวกับเท้าผู้เล่น
      body = this.add.sprite(0, 8, tex).setOrigin(sheet.anchor.x / sheet.frameWidth, sheet.anchor.y / sheet.frameHeight);
      topY = 8 - sheet.anchor.y;
    } else {
      body = this.add.sprite(0, 4, tex).setOrigin(0.5, 1);
      topY = 4 - body.height;
    }
    const lv = isMob && e.mobType ? MOBS[e.mobType]?.level : undefined;
    const label = this.add.text(0, 7, lv ? `${e.name} Lv.${lv}` : e.name, {
      fontFamily: "Mitr, sans-serif", fontSize: "10px", color: isMob ? "#ffe0ec" : "#ffffff",
      stroke: "#10192a", strokeThickness: 3,
    }).setOrigin(0.5, 0).setResolution(2);
    // เงาวงรีที่พื้นใต้เท้า (อยู่กับที่ ไม่ขยับตามตัวตอนเด้ง/เดิน/ท่ายืน): มอนจาก sheet และผู้เล่น
    const inner = this.add.container(0, 0);
    if (sheet) inner.add(this.add.ellipse(0, 7, 26, 8, 0x000000, 0.3));
    else if (sprite) inner.add(this.add.ellipse(0, 7, 22, 7, 0x000000, 0.3));
    inner.add(body);
    c.add(inner);
    const oc = this.add.container(c.x, c.y, [label]).setDepth(90000);

    let hpBar: Phaser.GameObjects.Graphics | null = null;
    if (isMob) {
      hpBar = this.add.graphics();
      oc.add(hpBar);
      // พื้นที่แตะใหญ่กว่าตัว เพื่อให้กดบนมือถือง่าย
      body.setInteractive(new Phaser.Geom.Circle(body.width / 2, body.height / 2, 22), Phaser.Geom.Circle.Contains);
      body.setData("mobId", e.id);
      // Poring เด้งดึ๋ง / มอนจาก sheet ใช้ท่ายืนเป็นการขยับขึ้นลงด้วยโค้ด (หยุดตอนเดิน ดู updatePose)
      if (!sheet) this.tweens.add({
        targets: body, scaleY: 0.86, scaleX: 1.1, yoyo: true, repeat: -1,
        duration: 380 + Math.random() * 120, ease: "Sine.easeInOut",
      });
    }
    const bob = sheet
      ? this.tweens.add({ targets: body, y: 7, yoyo: true, repeat: -1, duration: 450 + Math.random() * 150, ease: "Sine.easeInOut", paused: true })
      : null;

    const v: View = {
      id: e.id, kind: e.kind, c, oc, body, hpBar, inner, lift: 0, tunic: null, weapon: null, swing: { a: 0 }, hp: e.hp, maxHp: e.maxHp, path: e.path.slice(), moveMs: e.moveMs,
      sprite, look: e.look ?? null, dead: !!e.dead, motion: null, sheet: sheet?.name ?? null, bob, topY, dir: "south", pose: "",
    };
    this.views.set(e.id, v);
    if (e.dead) this.setDead(v, true);
    this.updatePose(v);
    this.drawHp(v);
    c.setDepth(c.y);
  }

  /** ของหล่นบนพื้น: รูป 16px ในช่องที่มอนตาย กดได้ทั้งช่อง (pop = เพิ่งหล่นจากมอน ให้เด้งออกมา) */
  private addGround(g: GroundItem, pop: boolean) {
    const def = ITEMS[g.item];
    if (!def || this.groundViews.has(g.id)) return;
    // จุดตกเยื้องจากกลางช่องเล็กน้อย (แค่ภาพ ตำแหน่งจริงบน server ยังเป็นช่องเดิม)
    const x1 = center(g.x) + (pop ? Phaser.Math.Between(-7, 7) : 0);
    const y1 = center(g.y) + 6 + (pop ? Phaser.Math.Between(-3, 3) : 0);
    const shadow = this.add.ellipse(x1, y1 + 7, 16, 6, 0x000000, 0.35).setDepth(center(g.y) - 3);
    const img = this.add.image(x1, y1, def.icon ? `item_${def.icon}` : "marker")
      .setDepth(center(g.y) - 2)
      // พื้นที่กดใหญ่เท่า 1 ช่อง (32px) แม้รูปจะเล็ก เพื่อให้กดบนมือถือง่าย
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-8, -8, 32, 32), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    img.setData("groundId", g.id).setData("item", g.item);
    this.groundViews.set(g.id, img);

    // ให้เห็นชัดบนพื้นหญ้า: เรืองแสงขอบขาว + ลอยขึ้นลงเบา ๆ + ประกายวิบวับเป็นระยะ
    img.preFX?.addGlow(0xffffff, 3, 0, false, 0.1, 10);
    const spark = this.add.star(x1 + 5, y1 - 7, 4, 1, 4, 0xfff6c0).setDepth(center(g.y) - 1).setScale(0).setBlendMode(Phaser.BlendModes.ADD);
    const twinkle = this.tweens.add({
      targets: spark, scale: { from: 0, to: 1 }, angle: 90, yoyo: true, duration: 260,
      repeat: -1, repeatDelay: 1400 + Math.random() * 800, delay: 600 + Math.random() * 800,
    });
    let bob: Phaser.Tweens.Tween | null = null;
    const startBob = () => {
      bob = this.tweens.add({ targets: img, y: img.y - 3, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
    };
    img.once(Phaser.GameObjects.Events.DESTROY, () => { shadow.destroy(); spark.destroy(); twinkle.remove(); bob?.remove(); });
    if (!pop) { startBob(); return; }

    // เด้งออกจากตัวมอนเป็นโค้ง (หมุนนิดหน่อย ขยายจากเล็กไปเต็ม) แล้วกระดอนเบา ๆ อีกครั้ง
    const x0 = center(g.x), y0 = center(g.y) - 8;
    const arc = (from: { x: number; y: number }, h: number, t: number) => ({
      x: Phaser.Math.Linear(from.x, x1, t),
      y: Phaser.Math.Linear(from.y, y1, t) - h * 4 * t * (1 - t),
    });
    const first = (t: number) => {
      const p = arc({ x: x0, y: y0 }, 22, t);
      img.setPosition(p.x, p.y).setScale(0.4 + 0.6 * t).setRotation((1 - t) * -0.9);
      shadow.setScale(0.3 + 0.7 * t).setAlpha(0.35 * t);
    };
    first(0);
    this.tweens.addCounter({
      from: 0, to: 1, duration: 480, ease: "Sine.easeOut",
      onUpdate: (tw) => first(tw.getValue() ?? 1),
      onComplete: () => {
        first(1);
        this.tweens.addCounter({
          from: 0, to: 1, duration: 200, ease: "Sine.easeInOut",
          onUpdate: (tw) => { const p = arc({ x: x1, y: y1 }, 4, tw.getValue() ?? 1); img.setPosition(p.x, p.y); },
          onComplete: () => { img.setPosition(x1, y1); startBob(); },
        });
      },
    });
  }

  /** สลบ: ตัวเป็นสีเทาและโปร่งลง (ทุกคนเห็น) */
  private setDead(v: View, dead: boolean) {
    v.path = [];
    v.dead = dead;
    v.pose = ""; // ให้ updatePose ตั้งท่าใหม่ (สลบ = นิ่ง)
    if (dead) v.body.setTint(0x6b6b6b).setAlpha(0.7);
    else v.body.clearTint().setAlpha(1);
  }

  private removeView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    v.c.destroy();
    v.oc.destroy();
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

  /** ตัวเลขดาเมจ: ตีมอน = ขาว (คริ = ทอง), ผู้เล่นโดนตี = แดง */
  /** ตัวเลขดาเมจ: เด้งขยายแล้วหดกลับ ลอยโค้งขึ้นไปด้านข้างแล้วจาง คริใหญ่กว่า สีทอง มี ! */
  private floatDamage(v: View, dmg: number, crit: boolean) {
    const mine = v.kind === "player";
    const t = this.add.text(v.c.x, v.c.y - v.lift + v.topY - 9, crit ? `${dmg}!` : String(dmg), {
      fontFamily: "Mitr, sans-serif", fontStyle: "bold", fontSize: crit ? "24px" : "17px",
      color: mine ? "#ff6b6b" : crit ? "#ffd84a" : "#ffffff",
      stroke: crit ? "#6b2400" : "#10192a", strokeThickness: crit ? 5 : 4,
      shadow: { offsetX: 0, offsetY: 1, color: "#000", blur: 2, fill: true, stroke: true },
    }).setOrigin(0.5).setDepth(100000).setResolution(2).setScale(0.3).setAlpha(0); // ซ่อนเฟรมแรก (กันภาพเพี้ยนก่อนเริ่มเด้ง)
    const drift = (Math.random() - 0.5) * 18;
    this.tweens.chain({
      targets: t,
      tweens: [
        { scale: crit ? 1.7 : 1.35, alpha: 1, duration: 90, ease: "Back.easeOut" },
        { scale: 1, duration: 110, ease: "Quad.easeOut" },
        { x: t.x + drift, y: t.y - (crit ? 30 : 22), alpha: 0, duration: crit ? 750 : 600, ease: "Cubic.easeIn" },
      ],
      onComplete: () => t.destroy(),
    });
  }

  /** ผู้เล่นมือเปล่า = ต่อย (ผู้เล่นคนอื่นยังไม่รู้ว่าถืออะไร ถือว่ามือเปล่า) */
  private isPunch(id: string): boolean {
    const v = this.views.get(id);
    return v?.kind === "player" && !v.weapon && !(id === this.me && this.myWeapon);
  }

  /** ต่อย (โค้ดล้วน ยังไม่มีภาพท่าตี): ง้าง = ถอยหลัง+เอนไปข้างหลัง → ต่อย = พุ่งไปข้างหน้า มีหมัดพุ่งออกไปหาเป้า + เส้นความเร็ว
   *  แขนอยู่ในภาพตัวละครภาพเดียว ขยับแยกไม่ได้ จึงใช้หมัดที่วาดด้วยโค้ดแทน */
  private punchFx(src: View, dst: View, crit: boolean) {
    const dx = dst.c.x - src.c.x, dy = dst.c.y - src.c.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const depth = Math.max(src.c.y, dst.c.y) + 2;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lean = ux >= 0 ? 1 : -1;

    // ง้าง แล้วต่อย (ขยับแค่ภาพตัว ตำแหน่งจริงบน server ไม่เปลี่ยน)
    if (!calm) {
      const bx = src.body.x, by = src.body.y;
      const push = crit ? 8 : 6;
      this.tweens.chain({
        targets: src.body,
        tweens: [
          { x: bx - ux * 3, y: by - uy * 2, angle: -lean * 8, duration: PUNCH_WINDUP_MS, ease: "Quad.easeOut" },
          { x: bx + ux * push, y: by + uy * push * 0.7, angle: lean * 7, duration: 55, ease: "Quad.easeIn" },
          { x: bx, y: by, angle: 0, duration: 120, ease: "Quad.easeOut" },
        ],
        onComplete: () => { src.body.setPosition(bx, by).setAngle(0); },
      });
    }

    // หมัด: วงกลมสีผิวขอบเข้ม พุ่งจากหน้าอกไปหาเป้าตอนต่อย แล้วจางหาย
    const sx = src.c.x + ux * 6, sy = src.c.y - 17 + uy * 4;
    const ex = src.c.x + ux * 24, ey = src.c.y - 15 + uy * 14;
    const r = crit ? 8 : 6;
    const fist = this.add.graphics({ x: sx, y: sy }).setDepth(depth).setAlpha(0);
    // หมัด: เงาเรือง + ขอบเข้ม + สีผิว + ข้อนิ้ว + ไฮไลต์
    fist.fillStyle(crit ? 0xffd84a : 0xffffff, 0.35).fillCircle(0, 0, r + 4)
      .fillStyle(0x5a2e1e).fillCircle(0, 0, r + 1.5)
      .fillStyle(crit ? 0xffd9a0 : 0xf0b089).fillCircle(0, 0, r)
      .lineStyle(1, 0x8a4a30, 0.9).lineBetween(-r * 0.5, -r * 0.2, -r * 0.5, r * 0.5).lineBetween(0, -r * 0.3, 0, r * 0.5).lineBetween(r * 0.5, -r * 0.2, r * 0.5, r * 0.5)
      .fillStyle(0xffffff, 0.7).fillCircle(-r * 0.35, -r * 0.45, r * 0.25);
    this.tweens.chain({
      targets: fist,
      tweens: [
        { alpha: 1, duration: 1, delay: PUNCH_WINDUP_MS - 10 },
        { x: ex, y: ey, duration: 55, ease: "Quad.easeIn" },
        { alpha: 0, scale: 1.6, duration: 130 },
      ],
      onComplete: () => fist.destroy(),
    });

    // เส้นความเร็วด้านหลังหมัด
    this.time.delayedCall(PUNCH_WINDUP_MS + 20, () => {
      const nx = -uy, ny = ux; // ตั้งฉากกับทิศต่อย
      for (const off of crit ? [-8, -4, 0, 4, 8] : [-6, -2, 2, 6]) {
        const g = this.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
        const ax = ex - ux * 9 + nx * off, ay = ey - uy * 7 + ny * off;
        const l = 14 + Math.random() * 6;
        g.lineStyle(2.5, crit ? 0xffd84a : 0xffffff, 0.95).lineBetween(ax, ay, ax - ux * l, ay - uy * l * 0.8);
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
      }
    });
  }

  /** เล่นเอฟเฟกต์จาก sprites/fx/<name> พุ่งจากตัว src ไปทาง dst (ภาพต้นฉบับหันขวา หมุนตามทิศ ทางซ้ายกลับหัวให้ตั้งตรง)
   *  ภาพเก็บที่ 2 เท่า (sheet.json scale) + ชั้นแสงเรืองซ้อนแบบ ADD ให้แสงสว่างจ้า */
  private playFx(name: string, src: View, dst: View, o: { from: number; to: number; height: number; scale: number; glow?: number }) {
    if (!this.anims.exists(`fx_${name}`)) return;
    const meta = this.cache.json.get(`fxsheet_${name}`) as { scale?: number } | undefined;
    const sc = (meta?.scale ?? 1) * o.scale;
    const dx = dst.c.x - src.c.x, dy = dst.c.y - src.c.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = Math.atan2(dy, dx);
    const y0 = src.c.y - src.lift + o.height;
    const depth = Math.max(src.c.y, dst.c.y) + 3;
    const mk = (add: boolean) => this.add.sprite(src.c.x + ux * o.from, y0 + uy * o.from * 0.7, `fx_${name}_0`)
      .setOrigin(0.92, 0.5).setRotation(a).setFlipY(Math.abs(a) > Math.PI / 2) /* จุดยึด = ปลายหมัด/เท้า */
      .setScale(add ? sc * 1.12 : sc).setDepth(add ? depth + 0.1 : depth)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setAlpha(add ? (o.glow ?? 0.45) : 1);
    const parts = [mk(false), mk(true)];
    const dur = this.anims.get(`fx_${name}`).duration;
    for (const fx of parts) {
      fx.play(`fx_${name}`);
      this.tweens.add({ targets: fx, x: src.c.x + ux * o.to, y: y0 + uy * o.to * 0.7, duration: dur * 0.6, ease: "Quad.easeOut" });
    }
    parts[0].once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.tweens.add({ targets: parts, alpha: 0, duration: 90, onComplete: () => parts.forEach((p) => p.destroy()) }));
  }

  /** หมัดทองชนเป้า: แสงวาบทั้งจอ, คลื่นทองขยาย 2 วง, ดาวทองพุ่ง, จอสั่นแรง */
  private goldenImpact(dst: View) {
    const x = dst.c.x, y = dst.c.y - dst.lift + dst.topY / 2, depth = dst.c.y + 4, ADD = Phaser.BlendModes.ADD;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!calm) { this.cameras.main.flash(90, 200, 160, 60); this.cameras.main.shake(260, 0.012); }
    for (let k = 0; k < 2; k++) {
      const ring = this.add.ellipse(x, y + 10, 24, 10).setStrokeStyle(4 - k, k ? 0xfff2b0 : 0xffc62a).setBlendMode(ADD).setDepth(depth);
      this.tweens.add({ targets: ring, scaleX: 4.5, scaleY: 4.5, alpha: 0, delay: k * 90, duration: 420, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    }
    const sun = this.add.star(x, y, 12, 8, 34, 0xffe27a).setBlendMode(ADD).setDepth(depth).setScale(0.3);
    this.tweens.add({ targets: sun, scale: 1.4, alpha: 0, angle: 30, duration: 300, ease: "Quad.easeOut", onComplete: () => sun.destroy() });
  }

  /** สกิลโดน: ชื่อสกิลเหนือหัว + เอฟเฟกต์สกิล แล้วตัวเลข/ประกายของแต่ละครั้งทยอยขึ้น */
  private skillFx(m: Extract<ServerMsg, { t: "skill_hit" }>) {
    const src = this.views.get(m.src), dst = this.views.get(m.dst);
    const sk = SKILLS[m.skill];
    if (!sk) return;
    if (src && dst) {
      this.face(src, dst.c.x - src.c.x, dst.c.y - src.c.y);
      this.floatText(src.c.x, src.c.y - src.lift + src.topY - 16, `${sk.name}!`, "#ffd84a", 900);
      if (m.skill === "flurry") this.playFx(sk.fx, src, dst, { from: 12, to: 28, height: -16, scale: 1.15, glow: 0.5 });
      else this.playFx(sk.fx, src, dst, { from: 10, to: 30, height: -16, scale: 1.35, glow: 0.7 });
      if (m.src === this.me) this.onSkillCast?.(m.skill);
    }
    if (!dst) return;
    const gap = m.skill === "flurry" ? 90 : 0;
    const start = m.skill === "flurry" ? 60 : 240; // หมัดทองชนเป้าตอนท้ายภาพ
    m.hits.forEach((h, i) => this.time.delayedCall(start + i * gap, () => {
      if (!dst.body.active) return;
      if (h.miss) { this.floatText(dst.c.x, dst.c.y - dst.lift + dst.topY - 9, "พลาด", "#bfc7d5", 700); return; }
      this.floatDamage(dst, h.dmg, h.crit || m.skill === "golden_fist");
      if (m.skill === "golden_fist") this.goldenImpact(dst);
      this.hitFx(dst, src, h.crit || m.skill === "golden_fist");
      dst.body.setTintFill(0xffffff);
      this.time.delayedCall(70, () => dst.body.clearTint());
    }));
    this.time.delayedCall(start + (m.hits.length - 1) * gap, () => { dst.hp = m.hp; this.drawHp(dst); });
  }

  /** ท่าตีของผู้เล่น (โค้ดล้วน ยังไม่มีภาพท่าตี): พุ่งเข้าหาเป้านิดหนึ่งแล้วดีดกลับ + รอยฟันโค้งกวาดไปทางเป้า
   *  มุมมองเอียงจากด้านบน จึงบีบแกนตั้งของรอยฟันให้แบนลง */
  private swingFx(src: View, dst: View, crit: boolean) {
    const dx = dst.c.x - src.c.x, dy = dst.c.y - src.c.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = Math.atan2(dy, dx);
    const cx = src.c.x + ux * 14, cy = src.c.y - src.lift - 14 + uy * 10;
    const depth = Math.max(src.c.y, dst.c.y) + 2;
    const sweep = 1.3; // ครึ่งมุมกวาด (เรเดียน)
    const dirSign = Math.random() < 0.5 ? 1 : -1; // ฟันสลับซ้าย-ขวา
    // ชั้นแรก = แถบเรืองหนา (ตัวรอยฟัน) ถัดมา = เส้นคม และขอบนอก
    const layers = crit
      ? [{ r: 22, w: 16, c: 0xffd84a, a: 0.3 }, { r: 28, w: 8, c: 0xffd84a, a: 1 }, { r: 35, w: 4, c: 0xfff2b0, a: 0.85 }]
      : [{ r: 18, w: 12, c: 0xbfe3ff, a: 0.25 }, { r: 24, w: 6, c: 0xffffff, a: 0.95 }, { r: 30, w: 3, c: 0xbfe3ff, a: 0.7 }];
    for (const [i, l] of layers.entries()) {
      const g = this.add.graphics({ x: cx, y: cy }).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setScale(1, 0.62);
      g.lineStyle(l.w, l.c, l.a);
      g.beginPath();
      g.arc(0, 0, l.r, -0.9, 0.9);
      g.strokePath();
      g.rotation = a - dirSign * sweep;
      this.tweens.add({
        targets: g, rotation: a + dirSign * sweep * 0.6, alpha: { from: 1, to: 0 },
        delay: i * 20, duration: crit ? 260 : 200, ease: "Cubic.easeOut", onComplete: () => g.destroy(),
      });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // พุ่งตัว: ขยับภาพตัวไปทางเป้าแล้วกลับที่เดิม (ตัวจริงบน server ไม่ได้ขยับ)
    const bx = src.body.x, by = src.body.y;
    const push = crit ? 7 : 5;
    this.tweens.add({
      targets: src.body, x: bx + ux * push, y: by + uy * push * 0.7, duration: 60, yoyo: true, ease: "Quad.easeOut",
      onComplete: () => { src.body.x = bx; src.body.y = by; },
    });
  }

  /** เอฟเฟกต์ตีโดน (โค้ดล้วน ใหญ่ ชัด): แสงวาบดาวแหลม + วงแสงกลาง + คลื่นกระแทก + ประกายกระจาย + เส้นแตก
   *  hit-stop + ตัวสั่น, จอสั่นทุกครั้งที่เราตีหรือโดนตี · เราโดนตี = สีแดง, คริ = สีทองและใหญ่กว่า */
  private hitFx(dst: View, src: View | undefined, crit: boolean) {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const x = dst.c.x, y = dst.c.y - dst.lift + dst.topY / 2, depth = dst.c.y + 1;
    const onMe = !!this.me && dst.id === this.me;
    const main = onMe ? 0xff5a5a : crit ? 0xffd84a : 0xffffff;
    const glow = onMe ? 0xff9a8a : crit ? 0xfff2b0 : 0xbfe3ff;
    const ADD = Phaser.BlendModes.ADD;

    // แสงวาบ: ดาวแหลม 8 แฉก ขยายเร็วแล้วหาย
    const burst = this.add.star(x, y, 8, crit ? 6 : 4, crit ? 26 : 18, main).setBlendMode(ADD).setDepth(depth + 1)
      .setScale(0.2).setAngle(Math.random() * 45);
    this.tweens.add({ targets: burst, scale: crit ? 1.25 : 1, alpha: 0, angle: burst.angle + 25, duration: crit ? 240 : 170,
      ease: "Quad.easeOut", onComplete: () => burst.destroy() });
    // วงแสงขาวตรงกลาง
    const flash = this.add.circle(x, y, crit ? 11 : 8, 0xffffff).setBlendMode(ADD).setDepth(depth + 1);
    this.tweens.add({ targets: flash, scale: 1.9, alpha: 0, duration: 130, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
    // คลื่นกระแทก (แบนตามมุมมองเอียง)
    for (let k = 0; k < (crit ? 3 : 2); k++) {
      const ring = this.add.circle(x, y, 8).setStrokeStyle(3 - k * 0.8, k ? glow : main).setBlendMode(ADD).setDepth(depth).setScale(1, 0.6);
      this.tweens.add({ targets: ring, scaleX: crit ? 4 : 3, scaleY: crit ? 2.4 : 1.8, alpha: 0, delay: k * 55, duration: 280,
        ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    }
    // ประกาย: ดาวพุ่งกระจาย
    const n = crit ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = (crit ? 30 : 22) + Math.random() * 14;
      const star = this.add.star(x, y, 4, 1.5, crit ? 6 : 4.5, i % 3 ? main : glow)
        .setBlendMode(ADD).setDepth(depth + 1).setAngle(Math.random() * 90);
      this.tweens.add({ targets: star, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, scale: 0, angle: star.angle + 180,
        duration: 260 + Math.random() * 120, ease: "Quad.easeOut", onComplete: () => star.destroy() });
    }
    // เส้นแตกพุ่งออกจากจุดโดน
    const streaks = this.add.graphics({ x, y }).setBlendMode(ADD).setDepth(depth + 1);
    streaks.lineStyle(crit ? 3 : 2, main, 1);
    for (let i = 0; i < (crit ? 8 : 6); i++) {
      const a = (i / (crit ? 8 : 6)) * Math.PI * 2 + Math.random() * 0.4, r0 = 6, r1 = (crit ? 22 : 16) + Math.random() * 6;
      streaks.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0 * 0.7, Math.cos(a) * r1, Math.sin(a) * r1 * 0.7);
    }
    this.tweens.add({ targets: streaks, scale: 1.4, alpha: 0, duration: 180, ease: "Quad.easeOut", onComplete: () => streaks.destroy() });
    if (calm) return;

    // hit-stop: หยุดท่าของทั้งคนตีและคนโดนชั่ววูบ ตัวที่โดนสั่นซ้ายขวา
    const stop = crit ? 140 : 80;
    for (const v of [dst, src]) v?.body.anims.pause();
    const bx = dst.body.x;
    this.tweens.add({ targets: dst.body, x: bx + 3, duration: stop / 4, yoyo: true, repeat: 1, onComplete: () => { dst.body.x = bx; } });
    this.time.delayedCall(stop, () => { for (const v of [dst, src]) if (v?.body.active) v.body.anims.resume(); });

    // จอสั่น: ทุกครั้งที่เราตีหรือเราโดนตี
    if (this.me && (src?.id === this.me || onMe))
      this.cameras.main.shake(crit ? 180 : onMe ? 140 : 90, crit ? 0.01 : onMe ? 0.007 : 0.004);
  }

  // ---------- มินิแมพ (มุมขวาบน) ----------

  /** ย่อภาพพื้นแมพ (รวมป่า) เก็บไว้ครั้งเดียว */
  private setupMinimap(ground: HTMLCanvasElement) {
    const cv = document.getElementById("minimap") as HTMLCanvasElement | null;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const src = document.createElement("canvas");
    src.width = Math.ceil(ground.width * MINI_SCALE);
    src.height = Math.ceil(ground.height * MINI_SCALE);
    const sctx = src.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(ground, 0, 0, src.width, src.height);
    this.mini = { ctx, src, next: 0 };
  }

  /** วาดพื้นที่รอบตัวเรา (เราอยู่กลางเสมอ แมพเลื่อนตาม) + จุด มอน (แดง) ผู้เล่น (ฟ้า) NPC (ทอง) ทางออก (เขียว) */
  private drawMinimap(time: number) {
    const m = this.mini;
    const me = this.me ? this.views.get(this.me) : undefined;
    if (!m || !me || time < m.next) return;
    m.next = time + 100;
    const cv = m.ctx.canvas;
    const px = Math.round(cv.clientWidth * (window.devicePixelRatio || 1));
    if (!px) return;
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    const ctx = m.ctx, W = cv.width, k = W / MINI_VIEW; // พิกเซลมินิแมพต่อพิกเซลโลก
    const cx = me.c.x, cy = me.c.y;
    ctx.fillStyle = "#0b1626";
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true;
    const sw = MINI_VIEW * MINI_SCALE;
    ctx.drawImage(m.src, (cx - MINI_VIEW / 2) * MINI_SCALE, (cy - MINI_VIEW / 2) * MINI_SCALE, sw, sw, 0, 0, W, W);
    const at = (x: number, y: number) => [(x - cx) * k + W / 2, (y - cy) * k + W / 2] as const;
    const dot = (x: number, y: number, r: number, fill: string) => {
      const [dx, dy] = at(x, y);
      if (dx < -r || dy < -r || dx > W + r || dy > W + r) return;
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.4); ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.stroke();
    };
    const r = Math.max(2, W / 60);
    for (const e of this.gm.exits) {
      const [x0, y0] = at(e.x0 * TILE, e.y0 * TILE), [x1, y1] = at((e.x1 + 1) * TILE, (e.y1 + 1) * TILE);
      ctx.fillStyle = "rgba(126, 224, 138, 0.8)";
      ctx.fillRect(x0, y0, Math.max(r, x1 - x0), Math.max(r, y1 - y0));
    }
    for (const n of Object.values(NPCS)) if (n.map === this.gm.id) dot(center(n.x), center(n.y), r * 1.1, "#ffd84a");
    for (const v of this.views.values()) {
      if (v.id === this.me) continue;
      dot(v.c.x, v.c.y, r * (v.kind === "mob" ? 0.9 : 1.1), v.kind === "mob" ? "#ff5a5a" : "#6cc8ff");
    }
    // เรา: ลูกศรชี้ทิศที่หัน
    const [vx, vy] = DIR_VEC[me.dir] ?? [1, 0];
    const a = Math.atan2(vy, vx);
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(a);
    const s = r * 2.2;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.65); ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.7, s * 0.65); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.5); ctx.strokeStyle = "#3a1a05"; ctx.stroke();
    ctx.restore();
  }

  /** เลเวลขึ้น (ทุกคนในแมพเห็น): เสาแสงทองพุ่งขึ้นรอบตัว + ประกายลอยขึ้น + วงแสงที่เท้า + ออร่าทองแบบซูเปอร์ไซย่า */
  private levelUpFx(v: View) {
    this.superAura(v);
    const x = v.c.x, y = v.c.y - v.lift, depth = v.c.y + 2, ADD = Phaser.BlendModes.ADD;
    const ring = this.add.ellipse(x, y + 6, 20, 8).setStrokeStyle(3, 0xffd84a).setBlendMode(ADD).setDepth(v.c.y - 1);
    this.tweens.add({ targets: ring, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 700, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    const beam = this.add.rectangle(x, y + 6, 26, 10, 0xffe27a, 0.55).setOrigin(0.5, 1).setBlendMode(ADD).setDepth(depth);
    this.tweens.add({ targets: beam, height: 90, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => beam.destroy() });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
      const sx = x + Math.cos(a) * r, sy = y + 4 + Math.sin(a) * r * 0.4;
      const star = this.add.star(sx, sy, 4, 1.2, 3 + Math.random() * 2, i % 3 ? 0xffd84a : 0xfff6c0).setBlendMode(ADD).setDepth(depth).setAlpha(0);
      this.tweens.add({ targets: star, y: sy - 50 - Math.random() * 40, alpha: { from: 1, to: 0 }, angle: 180,
        delay: Math.random() * 500, duration: 800 + Math.random() * 400, ease: "Quad.easeOut", onComplete: () => star.destroy() });
    }
  }

  /** ออร่าทอง (ราว 2.5 วิ): เปลวทองลุกท่วมรอบตัวจากเท้าถึงหัว, ตัวเรืองแสงทอง, ประกายไฟฟ้าแวบ ๆ
   *  เปลวอยู่ใน v.inner (หลังตัว) จึงเดินตามตัว (และยกตามสะพาน) */
  private superAura(v: View) {
    const ADD = Phaser.BlendModes.ADD;
    const H = -v.topY + 8; // ความสูงตัวจากเท้า
    const aura = this.add.container(0, 0);
    v.inner.addAt(aura, 0); // ข้างหลังตัว (เปลวทับหน้าตัวทำให้หน้าเป็นหย่อมเทา จึงอยู่หลังตัวทั้งหมด)
    const DUR = 2500;
    const flame = (parent: Phaser.GameObjects.Container, alpha: number) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (6 + Math.random() * 8), y = 8 - Math.random() * H * 0.9;
      // สามเหลี่ยมยอดแหลมชี้ขึ้น (พิกัดบวก: ฐานล่าง ยอดบน) จุดยึดกลางฐาน
      const h = 12 + Math.random() * 12;
      const f = this.add.triangle(x, y, 0, h, 4, 0, 8, h, Math.random() < 0.35 ? 0xfff2b0 : 0xffc62a, alpha)
        .setBlendMode(ADD).setOrigin(0.5, 1).setAngle(side * (6 + Math.random() * 12));
      parent.add(f);
      this.tweens.add({ targets: f, y: y - 14 - Math.random() * 12, scaleY: 1.6, scaleX: 0.5, alpha: 0, duration: 380 + Math.random() * 220,
        ease: "Quad.easeOut", onComplete: () => f.destroy() });
    };
    // แสงเรืองรอบตัว (วงรีหลายชั้น เต้นเป็นจังหวะ)
    const glow = this.add.ellipse(0, 8 - H / 2, 34, H + 12, 0xffd84a, 0.28).setBlendMode(ADD);
    aura.add(glow);
    this.tweens.add({ targets: glow, scaleX: 1.15, scaleY: 1.08, alpha: 0.42, yoyo: true, repeat: -1, duration: 160 });
    // ตัวเรืองแสงทอง: glow shader ถ้ามี (WebGL) ไม่มีก็ใช้สีทองทับ
    const fx = v.body.preFX?.addGlow(0xffd84a, 3, 0, false, 0.1, 12);
    if (!fx) v.body.setTint(0xfff0a0);
    const flames = this.time.addEvent({ delay: 45, repeat: Math.floor(DUR / 45), callback: () => {
      flame(aura, 0.85); flame(aura, 0.7);
    } });
    // ประกายไฟฟ้า: เส้นซิกแซกสีฟ้าอมขาวแวบ ๆ
    const sparks = this.time.addEvent({ delay: 260, repeat: Math.floor(DUR / 260), callback: () => {
      const g = this.add.graphics().setBlendMode(ADD);
      aura.add(g);
      let x = (Math.random() - 0.5) * 24, y = 8 - Math.random() * H;
      g.lineStyle(1.5, 0xd8f4ff, 1).beginPath().moveTo(x, y);
      for (let i = 0; i < 4; i++) { x += (Math.random() - 0.5) * 10; y -= 4 + Math.random() * 5; g.lineTo(x, y); }
      g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
    } });
    this.time.delayedCall(DUR, () => {
      flames.remove(); sparks.remove();
      if (fx) v.body.preFX?.remove(fx); else if (v.body.active) v.body.clearTint();
      this.tweens.add({ targets: aura, alpha: 0, duration: 400, onComplete: () => aura.destroy() });
    });
  }

  /** ปุ่มทดสอบ: ใส่/ถอดเสื้อ (เฉพาะตัวเรา ฝั่ง client) */
  toggleTunic(): boolean {
    this.tunicOn = !this.tunicOn;
    const v = this.me ? this.views.get(this.me) : undefined;
    if (v) this.setTunic(v, this.tunicOn);
    return this.tunicOn;
  }

  private setTunic(v: View, on: boolean) {
    if (on && !v.tunic) {
      v.tunic = this.add.image(0, 0, "tunic_south").setOrigin(0.5, 0);
      v.inner.addAt(v.tunic, v.inner.getIndex(v.body) + 1); // ทับหน้าตัวละครทุกทิศ
      this.placeTunic(v);
    } else if (!on && v.tunic) { v.tunic.destroy(); v.tunic = null; }
  }

  /** ค่าความทึบของภาพ (อ่านครั้งเดียวต่อ texture) */
  private alphaOf(key: string) {
    let c = this.alphaCache.get(key);
    if (!c) {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const cv = document.createElement("canvas");
      cv.width = src.width; cv.height = src.height;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const a = new Uint8ClampedArray(cv.width * cv.height);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      c = { w: cv.width, h: cv.height, a };
      this.alphaCache.set(key, c);
    }
    return c;
  }

  private topRow(al: { w: number; h: number; a: Uint8ClampedArray }) {
    for (let y = 0; y < al.h; y++) for (let x = 0; x < al.w; x++) if (al.a[y * al.w + x] > 40) return y;
    return 0;
  }

  /** วางเสื้อตามเฟรมที่เล่นอยู่ (พิกัดภาพ 48×48 ของตัวละคร):
   *  สูง = แถว 18–35 (หลัง 20–35) · กว้างตามสัดส่วนภาพเสื้อ · กึ่งกลางแนวนอน = กึ่งกลางพิกเซลทึบของตัวในแถว 22–30
   *  เดิน/ท่ายืน: เลื่อนขึ้นลงเท่าที่หัว (พิกเซลทึบบนสุด) ขยับจากภาพนิ่งของทิศนั้น */
  private placeTunic(v: View) {
    const t = v.tunic!, b = v.body, dir = v.dir;
    const fr = b.frame, al = this.alphaOf(fr.texture.key);
    const fw = fr.width, fh = fr.height, sx = b.scaleX, sy = b.scaleY, flip = b.flipX ? -1 : 1;
    const delta = this.headDelta(v);
    const top = 8 + (tunicTop(dir) - 45) + delta;
    // แถว 22–30 ของภาพ 48 (ขยับตามหัว) → แถวในเฟรมนี้
    const toFrameY = (wy: number) => Math.round(b.originY * fh + (wy - b.y) / sy);
    const y0 = Math.max(0, toFrameY(8 + 22 - 45 + delta)), y1 = Math.min(fh - 1, toFrameY(8 + 30 - 45 + delta));
    let minX = Infinity, maxX = -Infinity;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < al.w; x++) if (al.a[y * al.w + x] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    const cx = minX <= maxX ? (minX + maxX + 1) / 2 : fw / 2;
    const k = `tunic_${dir}`;
    if (t.texture.key !== k) t.setTexture(k);
    const h = (TUNIC_BOTTOM - tunicTop(dir) + 1) * Math.abs(sy);
    t.setScale(h / t.frame.height).setPosition(b.x + (cx - b.originX * fw) * sx * flip, top);
  }

  /** หัวตัวละคร (พิกเซลทึบบนสุดของเฟรมที่เล่นอยู่) ขยับจากภาพนิ่ง 48×48 ของทิศนั้นเท่าไหร่ (พิกัดใน inner, body.y ปกติ = 8 เท้าแถว 45) */
  private headDelta(v: View): number {
    const b = v.body;
    const baseTop = this.topRow(this.alphaOf(`${v.sprite}_${v.dir}`));
    const headNow = b.y + (this.topRow(this.alphaOf(b.frame.texture.key)) - b.originY * b.frame.height) * b.scaleY;
    return headNow - (8 + baseTop - 45);
  }

  /** ปุ่มทดสอบ: สลับอาวุธ มือเปล่า → อาวุธแต่ละชิ้น → มือเปล่า (เฉพาะตัวเรา ฝั่ง client) คืนชื่ออาวุธ */
  cycleWeapon(): string | null {
    this.weaponIdx = this.weaponIdx + 1 >= HELD_WEAPONS.length ? -1 : this.weaponIdx + 1;
    const v = this.me ? this.views.get(this.me) : undefined;
    if (v) this.setWeapon(v);
    return this.weaponIdx < 0 ? null : HELD_WEAPONS[this.weaponIdx].name;
  }

  private setWeapon(v: View) {
    const w = HELD_WEAPONS[this.weaponIdx];
    v.weapon?.destroy();
    v.weapon = null;
    this.tweens.killTweensOf(v.swing);
    v.swing.a = 0;
    if (!w) return;
    v.weapon = this.add.image(0, 0, `weapon_${w.id}`)
      .setOrigin(w.grip[0] / w.width, w.grip[1] / w.height)
      .setScale(1 / WEAPON_HD);
    v.weapon.setData("back", null);
    this.placeWeapon(v);
  }

  /** วาง grip ที่มือตามทิศ เลื่อนขึ้นลงตามหัว · หลัง = ใต้ตัวละคร, หน้า = ทับตัวละคร (และเสื้อ) */
  private placeWeapon(v: View) {
    const w = v.weapon!, h = HAND[v.dir] ?? HAND.south;
    if (w.getData("back") !== h.back) {
      w.setData("back", h.back);
      if (w.parentContainer) v.inner.remove(w);
      v.inner.addAt(w, h.back ? v.inner.getIndex(v.body) : v.inner.length);
    }
    w.setFlipX(h.flip)
      .setPosition(v.body.x + h.x - 24, 8 + h.y - 45 + this.headDelta(v))
      .setAngle(h.flip ? -v.swing.a : v.swing.a); // ภาพกลับด้าน หมุนทิศตรงข้าม
  }

  /** ตีปกติด้วยอาวุธ: หมุนรอบ grip ตาม SWING_STEPS */
  private weaponSwing(v: View) {
    this.tweens.killTweensOf(v.swing);
    v.swing.a = 0;
    this.tweens.chain({
      targets: v.swing,
      tweens: SWING_STEPS.map((st) => ({ a: st.a, duration: st.ms, ease: "Sine.easeInOut" })),
    });
  }

  /** ข้อความลอยขึ้นแล้วจางหาย (+EXP, ฟื้นที่จุดเกิด) */
  private floatText(x: number, y: number, text: string, color: string, ms: number) {
    const t = this.add.text(x, y, text, {
      fontFamily: "Mitr, sans-serif", fontSize: "12px", color, stroke: "#10192a", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100001).setResolution(2);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, delay: ms * 0.4, duration: ms * 0.6, ease: "Cubic.easeIn", onComplete: () => t.destroy() });
  }

  /** สร้าง texture ของรูปลักษณ์นี้ครบ 8 ทิศ (ครั้งแรกครั้งเดียว) แล้วคืนชื่อนำหน้า */
  private lookSprite(look: Look): string {
    const prefix = `p_${lookKey(look)}`;
    if (!this.textures.exists(`${prefix}_south`)) {
      for (const d of DIRS) {
        const src = this.textures.get(`base_${look.gender}_${d}`).getSourceImage() as HTMLImageElement;
        this.textures.addCanvas(`${prefix}_${d}`, recolorSprite(src, look));
      }
      // ท่ายืน: เปลี่ยนสีทุกเฟรม แล้วสร้าง animation (ทิศที่ไม่มีใช้ของฝั่งตรงข้ามกลับภาพ ดู updatePose)
      for (const d of idleDirs(look.gender)) {
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i < IDLE_FRAMES; i++) {
          const key = `base_${look.gender}_idle_${d}_${i}`;
          if (!this.textures.exists(key)) break;
          const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
          this.textures.addCanvas(`${prefix}_idle_${d}_${i}`, recolorSprite(src, look));
          frames.push({ key: `${prefix}_idle_${d}_${i}` });
        }
        if (frames.length === IDLE_FRAMES) this.anims.create({ key: `${prefix}_idle_${d}`, frames, frameRate: IDLE_FPS, repeat: -1 });
      }
      // ท่าเดิน: เหมือนท่ายืน
      for (const d of walkDirs(look.gender)) {
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i < WALK_FRAMES; i++) {
          const key = `base_${look.gender}_walk_${d}_${i}`;
          if (!this.textures.exists(key)) break;
          const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
          this.textures.addCanvas(`${prefix}_walk_${d}_${i}`, recolorSprite(src, look));
          frames.push({ key: `${prefix}_walk_${d}_${i}` });
        }
        if (frames.length === WALK_FRAMES) this.anims.create({ key: `${prefix}_walk_${d}`, frames, frameRate: WALK_FPS, repeat: -1 });
      }
    }
    return prefix;
  }

  /** หันหน้า: ผู้เล่นเปลี่ยนภาพตามทิศ, Poring พลิกซ้าย-ขวา, มอนจาก sheet หันเข้ากล้องตลอด */
  private face(v: View, dx: number, dy: number) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    v.dir = dirOf(dx, dy);
    if (v.sprite) this.updatePose(v);
    else if (!v.sheet && Math.abs(dx) > 0.5) v.body.setFlipX(dx < 0);
  }

  /** ผู้เล่น: ยืนนิ่งและมีท่ายืนของทิศนั้น (หรือทิศกระจก) = เล่น animation นอกนั้นใช้ภาพนิ่งของทิศ
   *  มอนจาก sheet: เดิน = ท่า walk, ยืน = เฟรมแรกของ walk + ขยับขึ้นลง */
  private updatePose(v: View) {
    if (v.sheet) {
      if (v.pose === "hit" || v.pose === "attack") return; // ท่าที่เล่นครั้งเดียว รอให้จบก่อน
      const pose = v.path.length ? "walk" : "stand";
      if (pose === v.pose) return;
      v.pose = pose;
      if (pose === "walk") {
        v.bob?.pause(); v.body.y = 8;
        this.playSheet(v, "walk");
      } else if (this.anims.exists(`${v.sheet}_idle`)) {
        // มีท่ายืนจากภาพ → เล่นวน (ไม่ต้องขยับขึ้นลงด้วยโค้ด)
        v.bob?.pause(); v.body.y = 8;
        this.playSheet(v, "idle");
      } else {
        v.body.stop(); v.body.setTexture(`${v.sheet}_walk_0`);
        const o = this.animOrigin.get(`${v.sheet}_walk`);
        if (o) v.body.setOrigin(o[0], o[1]);
        v.bob?.resume();
      }
      return;
    }
    if (!v.sprite) return;
    // ผู้เล่น: ยืน = ท่ายืน, เดิน = ท่าเดิน (ทิศที่ไม่มีใช้ของฝั่งตรงข้ามกลับภาพ)
    const walking = v.path.length > 0;
    const kind = walking ? "walk" : "idle";
    const src = v.kind === "player" && !v.dead && v.look ? animSource((walking ? walkDirs : idleDirs)(v.look.gender), v.dir) : null;
    const idle = src && this.anims.exists(`${v.sprite}_${kind}_${src.dir}`) ? `${v.sprite}_${kind}_${src.dir}` : null;
    // ไม่มีภาพท่าของทิศนี้: ภาพนิ่ง + ขยับด้วยโค้ด (ยืน = หายใจ, เดิน = เด้งตามก้าว, สลบ = นิ่ง)
    const motion = v.kind !== "player" || v.dead ? null : v.path.length ? "step" : "breath";
    const pose = idle ? `${idle}${src!.flip ? ":flip" : ""}` : `${v.sprite}_${v.dir}:${motion}`;
    if (pose === v.pose) return;
    v.pose = pose;
    if (idle) {
      this.setMotion(v, null);
      v.body.setFlipX(src!.flip).setOrigin(0.5, (45 + (walking ? WALK_OFFSET : IDLE_OFFSET)) / 64).play(idle, true);
      v.body.setScale(walking ? WALK_SCALE : 1); // ยึดเท้า ขยายแล้วเท้ายังติดพื้น
    } else {
      v.body.stop();
      v.body.setFlipX(false).setTexture(`${v.sprite}_${v.dir}`).setOrigin(0.5, 45 / 48);
      this.setMotion(v, motion);
    }
  }

  /** ท่าขยับด้วยโค้ดของผู้เล่นที่ยังไม่มีภาพท่านั้นจาก PixelLab (ยืดจากเท้า เพราะจุดยึดอยู่ที่เท้า) */
  private setMotion(v: View, mode: "breath" | "step" | null) {
    if ((v.motion?.mode ?? null) === mode) return;
    v.motion?.tween.remove();
    v.motion = null;
    v.body.setScale(1);
    v.body.y = 8; // ตำแหน่งเท้าผู้เล่น (addView)
    if (!mode || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = mode === "breath"
      ? this.tweens.add({ targets: v.body, scaleY: 1.035, scaleX: 0.985, yoyo: true, repeat: -1, duration: 900 + Math.random() * 200, ease: "Sine.easeInOut" })
      : this.tweens.add({ targets: v.body, y: 6, yoyo: true, repeat: -1, duration: v.moveMs / 2, ease: "Sine.easeOut" });
    v.motion = { mode, tween };
  }

  private setTarget(id: string | null) {
    this.targetId = id;
    this.targetRing.setVisible(!!id && this.views.has(id));
  }

  private setInv(items: InvItem[]) {
    this.invCount = new Map(items.map((i) => [i.item, i.count]));
    this.onInventory?.(items);
    this.updateMarks();
  }

  private updateMarks() {
    for (const [id, t] of this.npcMarks) {
      const mark = npcMark(id, this.level, this.questLog, (i) => this.invCount.get(i) ?? 0);
      t.setText(mark ?? "").setColor(mark === "?" ? "#7ee08a" : "#ffd84a");
    }
    // เควสที่ครบแล้ว (รวมเควสคุยที่แค่ต้องไปหาเป้าหมาย) → นำทางไปหา NPC ที่ต้องส่ง
    const ready = Object.keys(this.questLog.active).map((k) => QUESTS[k])
      .find((q) => q && NPCS[q.turnIn] && isComplete(q, this.questLog, (i) => this.invCount.get(i) ?? 0));
    this.guideNpc = ready ? ready.turnIn : null;
    this.onQuestGuide?.(ready ? { quest: ready.name, npc: ready.turnIn, npcName: NPCS[ready.turnIn].name } : null);
  }

  /** ป้ายนำทางถูกแตะ: เดินไปหา NPC ที่ต้องส่งเควส (ถึงแล้ว server เปิดหน้ารับรางวัลให้) */
  goToGuide() {
    if (!this.guideNpc) return;
    this.net.send({ t: "talk", npc: this.guideNpc });
    this.setTarget(null);
  }

  /** ลูกศรรอบตัวเรา ชี้ไปทาง NPC ที่ต้องส่งเควส (ใกล้แล้วซ่อน) ขยับเข้าออกเบา ๆ ให้สะดุดตา */
  private updateGuideArrow(time: number) {
    const me = this.me ? this.views.get(this.me) : undefined;
    const n = this.guideNpc ? NPCS[this.guideNpc] : undefined;
    if (!me || !n || n.map !== this.gm.id) { this.guideArrow.setVisible(false); return; }
    const dx = center(n.x) - me.c.x, dy = center(n.y) - me.c.y;
    const d = Math.hypot(dx, dy);
    if (d < TILE * 3) { this.guideArrow.setVisible(false); return; }
    const r = 30 + Math.sin(time / 180) * 3;
    this.guideArrow.setVisible(true).setRotation(Math.atan2(dy, dx))
      .setPosition(me.c.x + (dx / d) * r, me.c.y - me.lift - 14 + (dy / d) * r * 0.8);
  }

  /** NPC ยืนนิ่งตามตำแหน่งใน layout แมพ: ชื่อสีทอง + เครื่องหมายเควสเหนือหัว กดแล้วเดินไปคุย */
  private drawNpcs() {
    for (const n of Object.values(NPCS).filter((n) => n.map === this.gm.id)) {
      const x = center(n.x), y = center(n.y);
      const data = this.cache.json.get(`npcsheet_${n.id}`) as SheetMeta | undefined;
      let body: Phaser.GameObjects.Sprite;
      if (data?.animations.idle) {
        const frames = data.animations.idle.frames.map((f) => ({ key: `${n.id}_${f.replace(/\.png$/, "")}` }));
        if (!this.anims.exists(`${n.id}_idle`))
          this.anims.create({ key: `${n.id}_idle`, frames, frameRate: 1000 / data.animations.idle.frameMs, repeat: -1 });
        body = this.add.sprite(x, y, frames[0].key).setOrigin(data.anchor.x / data.frameWidth, data.anchor.y / data.frameHeight).play(`${n.id}_idle`);
      } else {
        // ยังไม่มีภาพ NPC: ใช้ตัว base ผู้ชายไปก่อน
        body = this.add.sprite(x, y, "base_male_south").setOrigin(0.5, 45 / 48);
      }
      this.add.ellipse(x, y, 20, 6, 0x000000, 70 / 255).setDepth(y - 0.5);
      body.setDepth(y).setInteractive({ useHandCursor: true }).setData("npcId", n.id);
      this.add.text(x, y + 7, n.name, {
        fontFamily: "Mitr, sans-serif", fontSize: "10px", color: "#ffe39a", stroke: "#10192a", strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(90000).setResolution(2);
      const mark = this.add.text(x, y - body.displayHeight - 2, "", {
        fontFamily: "Mitr, sans-serif", fontStyle: "bold", fontSize: "18px", color: "#ffd84a", stroke: "#3a1a05", strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(90001).setResolution(2);
      this.tweens.add({ targets: mark, y: mark.y - 4, yoyo: true, repeat: -1, duration: 600, ease: "Sine.easeInOut" });
      this.npcMarks.set(n.id, mark);
    }
  }

  private updateStats(s: PlayerStats) {
    this.onStats?.(s);
    if (s.level !== this.level) { this.level = s.level; this.updateMarks(); }
    this.myWeapon = !!s.equip.weapon;
  }

  // ---------- เดินตาม path ทุกเฟรม ----------

  update(time: number, dt: number) {
    if (this.joyDir !== null) this.joyStep(time);
    this.updateGuideArrow(time);
    this.drawMinimap(time);
    const meV = this.me ? this.views.get(this.me) : undefined;
    if (meV) for (const { t, e } of this.exitLabels) {
      const cx = ((e.x0 + e.x1 + 1) / 2) * TILE, cy = ((e.y0 + e.y1 + 1) / 2) * TILE;
      t.setVisible(Math.abs(meV.c.x - cx) < TILE * 7 && Math.abs(meV.c.y - cy) < TILE * 7);
    }
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
      this.updatePose(v);
      v.c.setDepth(v.c.y);
      const lift = this.gm.bridgeLift(v.c.x, v.c.y);
      if (lift !== v.lift) { v.lift = lift; v.inner.y = -lift; }
      v.oc.setPosition(v.c.x, v.c.y - v.lift);
      if (v.tunic) this.placeTunic(v);
      if (v.weapon) this.placeWeapon(v);
    }
    const t = this.targetId ? this.views.get(this.targetId) : undefined;
    if (t) this.targetRing.setPosition(t.c.x, t.c.y + 2 - t.lift).setDepth(t.c.y - 1).setVisible(true);
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
    // พื้นทั้งแผ่น (ลายพื้น + ขอบโค้ง + ทรายเปียก + ฟองคลื่น + เส้นขอบหญ้า) วาดครั้งเดียว
    const tiles = TERRAIN_NAMES.map((n) => this.textures.get(`tile_${n}`).getSourceImage() as HTMLImageElement);
    const meta0 = Object.assign({}, ...Object.keys(PROP_SETS).map((set) => this.cache.json.get(`props_${set}`) ?? {})) as Record<string, { width: number; height: number; anchor: { x: number; y: number }; shadowWidth: number }>;
    let ground: HTMLCanvasElement;
    if (this.textures.exists(`baked_${this.gm.id}`)) {
      ground = document.createElement("canvas");
      ground.width = this.gm.W * TILE; ground.height = this.gm.H * TILE;
      ground.getContext("2d")!.drawImage(this.textures.get(`baked_${this.gm.id}`).getSourceImage() as HTMLImageElement, 0, 0, ground.width, ground.height);
    } else ground = renderGround(this.gm, tiles);

    // ป่า: ต้นไม้ด้านในวาดรวมกับพื้น (ประหยัดเครื่อง) ต้นริมป่าเป็น sprite เรียงความลึกตาม y
    const gctx = ground.getContext("2d")!;
    gctx.imageSmoothingEnabled = false;
    for (const t of forestTrees(this.gm)) {
      const m = meta0[t.kind];
      if (!m) continue;
      const ox = m.anchor.x, oy = m.anchor.y + 1;
      if (t.sprite) {
        this.add.ellipse(t.x, t.y, m.shadowWidth * 0.8, 6, 0x000000, 70 / 255).setDepth(t.y - 8.5);
        this.add.image(t.x, t.y, `prop_${t.kind}`).setOrigin(ox / m.width, oy / m.height).setFlipX(t.flip).setDepth(t.y - 8);
        continue;
      }
      const img = this.textures.get(`prop_${t.kind}`).getSourceImage() as HTMLImageElement;
      gctx.fillStyle = "rgba(0,0,0,0.27)";
      gctx.beginPath(); gctx.ellipse(t.x, t.y, m.shadowWidth * 0.4, 3, 0, 0, Math.PI * 2); gctx.fill();
      gctx.save();
      gctx.translate(t.x, t.y);
      if (t.flip) gctx.scale(-1, 1);
      gctx.drawImage(img, -ox, -oy);
      gctx.restore();
    }
    if (this.textures.exists("map_ground")) this.textures.remove("map_ground"); // วาปมาแมพใหม่: พื้นของแมพเดิมทิ้ง
    this.textures.addCanvas("map_ground", ground);
    this.setupMinimap(ground);
    this.add.image(0, 0, "map_ground").setOrigin(0, 0).setDepth(-3);

    // ทางออก: ชื่อแมพปลายทางลอยเหนือทางออก เห็นเมื่อผู้เล่นเข้าใกล้ (ดู update)
    for (const e of this.gm.exits) {
      const t = this.add.text(((e.x0 + e.x1 + 1) / 2) * TILE, e.y0 * TILE + ((e.y1 - e.y0 + 1) * TILE) / 2, `➜ ${e.label}`, {
        fontFamily: "Mitr, sans-serif", fontSize: "11px", color: "#ffe39a", stroke: "#10192a", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(90001).setResolution(2).setVisible(false);
      this.exitLabels.push({ t, e });
    }

    // ของประดับ: จุดยึดกึ่งกลางฐานวางใกล้ขอบล่างของช่อง พร้อมเงาวงรี
    // ชิ้นที่ขวางทางเรียงลำดับตามแกน y กับตัวละคร/มอน ชิ้นเล็กเดินผ่านได้อยู่ระดับพื้น (ใต้ตัวละครเสมอ)
    const meta = Object.assign({}, ...Object.keys(PROP_SETS).map((set) => this.cache.json.get(`props_${set}`) ?? {})) as Record<string, { width: number; height: number; anchor: { x: number; y: number }; shadowWidth: number }>;
    for (const p of this.gm.props) {
      if (ARCH_BRIDGES.has(p.kind)) {
        // สะพานโค้ง: ชั้นหลัง (พื้น+ราวไกล) ใต้ตัวละครทุกตัว, ชั้นหน้า (ราวใกล้+เสา) เรียงความลึกตามขอบล่างของภาพ
        for (const [part, depth] of [["back", -1], ["front", p.py - 8]] as const) {
          const mm = meta[`${p.kind}-${part}`];
          if (mm) this.add.image(p.px, p.py, `prop_${p.kind}-${part}`).setOrigin(mm.anchor.x / mm.width, (mm.anchor.y + 1) / mm.height).setDepth(depth);
        }
        continue;
      }
      const m = meta[p.kind];
      if (!m) continue;
      const x = p.px, y = p.py; // จุดยึดกึ่งกลางฐานตาม layout (พิกเซล)
      // ชิ้นใหญ่ (ต้นไม้/สิ่งก่อสร้าง/เรือ) และชิ้นที่ขวางทาง เรียงตามแกน y กับตัวละคร ชิ้นแบนอยู่ใต้ตัวละครเสมอ
      const block = !FLAT_PROPS.has(p.kind) && (isSolidProp(p.kind) || PROP_SET_OF[p.kind] !== "set1");
      const depth = block ? y - 8 : -1;
      if (!FLAT_PROPS.has(p.kind))
        this.add.ellipse(x, y, m.shadowWidth, Math.max(3, Math.round(m.shadowWidth * 0.3)), 0x000000, 70 / 255).setDepth(block ? depth - 0.5 : -2);
      this.add.image(x, y, `prop_${p.kind}`).setOrigin(m.anchor.x / m.width, (m.anchor.y + 1) / m.height).setDepth(depth).setFlipX(p.flip);
    }
  }
}
