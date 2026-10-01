import WEAPON_DATA from "../../shared/data/weapons2.json";
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
import { MIRROR, PICKUP_ANIMS, PUNCH_ANIMS, WALK_ANIMS, WALK_PAD, animSource, pickupDirs, pickupFrameUrl, punchDirs, punchFrameMs, punchFrameUrl, walkDirs, walkFrameUrl } from "./sprites";
import { PICKUP_FRAME_MS } from "../../shared/constants";
import { dyeCanvas, type DyeOutfit } from "./dye";
import { WALK_FRAME_MS, flipCanvas, makeWalkFrames, walkShift, type Foot } from "./walkgen";

interface View {
  id: string;
  kind: EntityState["kind"];
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics | null;
  inner: Phaser.GameObjects.Container; // ตัว + เงา (ยกขึ้นตอนอยู่บนสะพานโค้ง)
  outfit: Phaser.GameObjects.Image | null; // เสื้อ: ภาพทับขนาดเท่าตัวละคร ทิศละไฟล์ (ทดสอบ)
  skin: Phaser.GameObjects.Image | null;   // พิกเซลสีผิวของเฟรมตัวที่เล่นอยู่ วาดทับเสื้อ (มีเฉพาะตอนใส่เสื้อ)
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
  breathing: boolean; // ผู้เล่นยืนนิ่ง: สลับภาพนิ่ง/ภาพหายใจเข้า (update)
  breath0: number;    // จุดเริ่มจังหวะหายใจ (สุ่ม ทุกคนไม่พร้อมกัน)
  sheet: string | null;  // มี = มอนจาก sheet (ทิศเดียว มีท่า walk/attack/death)
  bob: Phaser.Tweens.Tween | null; // ท่ายืนของมอนจาก sheet (ขยับขึ้นลงด้วยโค้ด)
  topY: number;          // ขอบบนของตัว (ใช้วางแถบ HP / ตัวเลขดาเมจ)
  dir: Dir;              // ทิศที่หันอยู่
  pose: string;          // texture/animation ที่แสดงอยู่ (กันตั้งซ้ำทุกเฟรม)
  acting: boolean;       // ผู้เล่นกำลังเล่นท่าครั้งเดียว (ต่อย/ก้มเก็บของ) ห้ามท่ายืน/หายใจทับ จนกว่าจะจบหรือสั่งเดินใหม่
  actDir: string;        // ทิศของท่าที่เล่นอยู่ (ต่อยหัน south/north ยืมทิศทแยง จบท่ากลับไปใช้ dir เดิม)
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
// ท่ายืนผู้เล่น (โค้ดล้วน): สลับภาพนิ่ง ↔ หายใจเข้า ทุก 660 ms
// หายใจเข้า = แถว y 0–32 เลื่อนขึ้น 1 px (แถว y ใช้ค่าจากแถว y+1) แถว 33 คงเดิม แถว 34 ลงไป (ขา) ไม่ขยับ
const BREATH_MS = 660, BREATH_ROW = 33;
/** เฟรมหายใจเข้า (ตัวละครและเสื้อ): แถว 0..32 ← แถว 1..33 ของภาพนิ่ง ที่เหลือคงเดิม */
function inhaleCanvas(still: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = still.width; cv.height = still.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(still, 0, 0);
  ctx.clearRect(0, 0, still.width, BREATH_ROW);
  ctx.drawImage(still, 0, 1, still.width, BREATH_ROW, 0, 0, still.width, BREATH_ROW);
  return cv;
}
/** ชั้นสีผิว: เก็บเฉพาะพิกเซลสีผิวของเฟรมตัว (R>180, 100<G<190, 70<B<170, R-B>40) ที่เหลือโปร่งใส
 *  วาดทับเสื้อ → แขนที่แกว่งผ่านหน้าลำตัวอยู่หน้าเสื้อเสมอ หน้าไม่โดนทับ (สร้างครั้งเดียวต่อเฟรมตอนโหลด) */
function skinCanvas(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, cv.width, cv.height), p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    if (!(r > 180 && g > 100 && g < 190 && b > 70 && b < 170 && r - b > 40)) p[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
const skinKey = (bodyKey: string) => `${bodyKey}_skin`;
// เสื้อมี 2 แบบ
// - "dye" ย้อมสี (dye.ts): ย้อมเสื้อกล้ามของตัวละครในทุกเฟรม ใช้ได้ทุกท่า texture ย้อมแล้วสร้างครั้งเดียวต่อเฟรมตอนใส่เสื้อ
//   shades = สีเข้ม → สว่าง 4 ระดับตามความสว่างของเสื้อเดิม, trim = ขอบล่างชายเสื้อ
// - "overlay" ภาพทับ (เสื้อทรงอื่น): ภาพ 48×48 ทิศละไฟล์ sprites/equipment/body/<id>/<id>-<ทิศ>.png
//   วาดซ้อนตำแหน่งเดียวกับตัวละคร ไม่ย่อ · หายใจเข้าใช้เฟรมเลื่อนแบบเดียวกับตัว (ไฟล์ไม่ครบ 8 ทิศ = ไม่ขึ้นในปุ่มทดสอบ)
type Outfit = DyeOutfit | { id: string; type: "overlay" };
const BODY_OUTFITS: Outfit[] = [
  { id: "muay-shirt", type: "dye", shades: ["#70060A", "#9E0E10", "#C41E1E", "#E23A32"], trim: "#E8B43C" },
  { id: "red-vest", type: "overlay" },
  { id: "black-armor", type: "overlay" },
];
const outfitKey = (id: string, dir: string) => `outfit_${id}_${dir}`;
const dyeKey = (bodyKey: string, id: string) => `${bodyKey}_dye_${id}`;
// อาวุธในมือ (ทดสอบ) ภาพ sprites/weapons/<file> ตาม shared/data/weapons2.json (ต้นฉบับ art/equipment/weapon-angle-guide.png)
// ภาพแนวตั้ง ปลายชี้ขึ้น ขนาดจริง 1 พิกเซล = 1 พิกเซลตัวละคร จุดหมุน = grip
// ไฟล์ภาพที่ยังไม่มีจะโหลดไม่ขึ้น → ไม่อยู่ในรายการปุ่มทดสอบ
const WEAPONS = Object.entries(WEAPON_DATA).map(([id, w]) => ({ id, ...w }));
// ต่อทิศ: จุดมือในภาพ 48×48, deg = ทิศปลายอาวุธ (ทวนเข็ม 0° = ขวา 90° = ขึ้น), len = ความยาวที่เหลือตามความลึก,
// back = วาดก่อนตัวละคร (อยู่หลังตัว)
const HAND: Record<string, { x: number; y: number; deg: number; len: number; back: boolean }> = {
  south: { x: 15, y: 33, deg: -100, len: 0.62, back: false },
  "south-east": { x: 18, y: 34, deg: -55, len: 0.82, back: false },
  east: { x: 24, y: 33, deg: -25, len: 1, back: false },
  "north-east": { x: 31, y: 34, deg: 55, len: 0.82, back: false },
  north: { x: 32, y: 33, deg: 95, len: 0.62, back: true },
  "north-west": { x: 30, y: 32, deg: 130, len: 0.82, back: true },
  west: { x: 23, y: 33, deg: -155, len: 1, back: true },
  "south-west": { x: 15, y: 33, deg: -125, len: 0.82, back: true },
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
  private weaponId: string | null = null; // ปุ่มทดสอบอาวุธ: id ใน weapons2.json (null = มือเปล่า)
  private outfitId: string | null = null; // ปุ่มทดสอบเสื้อ (เห็นเฉพาะตัวเอง ยังไม่มีระบบอุปกรณ์)
  /** ตำแหน่งเท้าซ้าย/ขวาของแต่ละเฟรมท่าเดิน (key = ชื่อ texture) ไว้วางรองเท้าในอนาคต */
  readonly walkFeet = new Map<string, { left: Foot; right: Foot }>();
  /** ท่าเดินจาก PixelLab: ตัวในเฟรมเลื่อนจากภาพยืนเท่าไหร่ (key = ชื่อ texture เฟรม) ใช้เลื่อนเสื้อ/จุดมือ — หาเองตอนโหลด */
  private walkShifts = new Map<string, { dx: number; dy: number }>();
  /** animation ท่าเดินที่เล่นแบบกลับด้าน (ทิศฝั่งตรงข้ามของภาพ PixelLab) */
  private walkFlip = new Set<string>();
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
    // ของบนพื้น: ภาพพิกเซล 32×32 ใช้ขนาดจริง นอกนั้นใช้ภาพ 16
    for (const it of Object.values(ITEMS)) if (it.icon) this.load.image(`item_${it.icon}`, `sprites/items/${it.icon}-${it.pixel ? 32 : 16}.png`);
    for (const w of WEAPONS) this.load.image(`weapon_${w.id}`, `sprites/weapons/${w.file}`);
    // ท่าเดินจาก PixelLab (sprites.ts WALK_ANIMS) ทิศที่ไม่มีใช้ท่าเดินที่สร้างด้วยโค้ด
    for (const [g, dirs] of Object.entries(WALK_ANIMS))
      for (const [d, n] of Object.entries(dirs))
        for (let i = 0; i < n; i++) this.load.image(`base_${g}_walk_${d}_${i}`, walkFrameUrl(g, d, i));
    for (const [g, dirs] of Object.entries(PUNCH_ANIMS))
      for (const [d, p] of Object.entries(dirs))
        for (let i = 0; i < p.frames; i++) this.load.image(`base_${g}_punch_${d}_${i}`, punchFrameUrl(g, d, i));
    for (const [g, dirs] of Object.entries(PICKUP_ANIMS))
      for (const [d, p] of Object.entries(dirs))
        for (let i = 0; i < p.frames; i++) this.load.image(`base_${g}_pickup_${d}_${i}`, pickupFrameUrl(g, d, i));
    for (const { id } of BODY_OUTFITS.filter((o) => o.type === "overlay"))
      for (const d of DIRS) this.load.image(outfitKey(id, d), `sprites/equipment/body/${id}/${id}-${d}.png`);
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
        { const mv = this.views.get(m.you); if (mv) { this.setOutfit(mv); this.setWeapon(mv); } }
        for (const g of m.ground) this.addGround(g, false);
        // กล้องล็อกตัวเรา (lerp 1): ถ้าไล่ตามช้า ๆ กล้องกับตัวปัดเศษพิกเซลคนละจังหวะ ตัวละครสั่นไปมา 1 px ตอนเดิน
        this.cameras.main.startFollow(this.views.get(m.you)!.c, true, 1, 1);
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
      case "pickup_start":
        this.pickupStart(m.id, m.gid);
        break;
      case "picked": {
        const img = this.groundViews.get(m.id);
        if (!img) break;
        this.groundViews.delete(m.id);
        const name = ITEMS[img.getData("item") as string]?.name;
        const by = this.views.get(m.by);
        if (m.by === this.me && name && by) this.floatText(by.c.x, by.c.y - by.lift + by.topY - 12, `ได้รับ ${name} ×1`, "#b9f0c8", 1300);
        // ท่าก้มเก็บ (เฟรมที่ 5): ของบนพื้นหาย ไอคอนโผล่ที่มือ ลอยขึ้นหาหัวแล้วจางหาย 0.4 วินาที
        const hand = by ? this.pickupHand(by) : null;
        if (by && hand) {
          const icon = this.add.image(hand.x, hand.y, img.texture.key).setDepth(by.c.y + 5);
          img.destroy();
          this.tweens.add({ targets: icon, x: by.c.x, y: by.c.y - by.lift + by.topY, alpha: 0, duration: 400, ease: "Quad.easeOut",
            onComplete: () => icon.destroy() });
          break;
        }
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
        // สั่งเดินใหม่จริง = เลิกต่อย · path ว่าง (server หยุดตัวเพื่อตี) ไม่เลิก ท่าต่อยเล่นไปพร้อมเลื่อนเข้าช่องให้จบ
        if (m.path.length) v.acting = false;
        break;
      }
      case "hit": {
        const dst = this.views.get(m.dst);
        const src = this.views.get(m.src);
        if (src && dst) this.face(src, dst.c.x - src.c.x, dst.c.y - src.c.y);
        // ผู้เล่นมือเปล่าที่มีท่าต่อย PixelLab ของทิศนี้: หมัดโดนตอนถึงเฟรม hit
        const punchAnim = src && this.isPunch(src.id) ? this.punchAnim(src, dst) : null;
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
          if (punchAnim) this.time.delayedCall(punchAnim.hitMs, () => { impact(); hitAnim(); });
          else if (this.isPunch(m.src)) this.time.delayedCall(PUNCH_WINDUP_MS, impact);
          else if (this.views.get(m.src)?.weapon) this.time.delayedCall(SWING_HIT_MS, impact);
          else impact();
          // มอนจาก sheet ที่มีท่าโดนตี: เล่นพร้อมกะพริบขาว แต่ไม่ขัดท่า attack ที่กำลังเล่นอยู่
          // (ท่าต่อย PixelLab: เล่นตอนหมัดโดน ไม่ใช่ตอนได้ข้อความ)
          const hitAnim = () => {
            if (!dst.body.active || !dst.sheet || dst.pose === "attack" || !this.anims.exists(`${dst.sheet}_hit`)) return;
            dst.pose = "hit";
            dst.bob?.pause(); dst.body.y = 8;
            this.playSheet(dst, "hit");
            dst.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + `${dst.sheet}_hit`, () => {
              dst.pose = "";
              this.updatePose(dst);
            });
          };
          if (!punchAnim) hitAnim();
        }
        // ผู้เล่นตี: พุ่งตัว + รอยฟัน (ตีพลาดก็เห็นท่าเหวี่ยง)
        if (src && punchAnim) this.playPunch(src, punchAnim, dst, m.crit, !m.miss);
        else if (src?.kind === "player" && dst) {
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
      id: e.id, kind: e.kind, c, oc, body, hpBar, inner, lift: 0, outfit: null, skin: null, weapon: null, swing: { a: 0 }, hp: e.hp, maxHp: e.maxHp, path: e.path.slice(), moveMs: e.moveMs,
      sprite, look: e.look ?? null, dead: !!e.dead, breathing: false, breath0: Math.random() * BREATH_MS * 2, sheet: sheet?.name ?? null, bob, topY, dir: "south", pose: "", acting: false, actDir: "",
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
    // พื้นที่กด 32×32 ตรงกลางภาพ (ภาพ 16 หรือ 32)
    (img.input!.hitArea as Phaser.Geom.Rectangle).setPosition(img.width / 2 - 16, img.height / 2 - 16);
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

  /** ท่าต่อย PixelLab ของทิศที่หันอยู่ (ไม่มี = null ใช้ท่าต่อยด้วยโค้ด) + เวลาจากเริ่มท่าถึงเฟรมที่หมัดโดน
   *  south มีท่าถีบ (teep) ของตัวเอง · หัน south/north ที่ไม่มีท่าของทิศนั้น: ยืมทิศทแยง มอนอยู่ขวาหรือตรงกลาง (หรือไม่มีเป้า) = -east, อยู่ซ้าย = -west */
  private punchAnim(v: View, dst?: View): { key: string; dir: string; hitMs: number } | null {
    if (!v.sprite || !v.look || v.dead) return null;
    let dir = v.dir;
    if ((dir === "south" || dir === "north") && !punchDirs(v.look.gender).includes(dir)) dir = `${dir}-${!dst || dst.c.x >= v.c.x ? "east" : "west"}`;
    const key = `${v.sprite}_punch_${dir}`;
    const src = animSource(punchDirs(v.look.gender), dir);
    if (!src || !this.anims.exists(key)) return null;
    const p = PUNCH_ANIMS[v.look.gender][src.dir];
    return { key, dir, hitMs: (p.hit - 1) * punchFrameMs(p) };
  }

  /** เล่นท่าต่อยครั้งเดียว (ตีซ้ำระหว่างท่า = เริ่มใหม่) จบแล้วกลับท่ายืน · โดน = แรงกระแทก (strikeFx) ที่มอนตอนถึงเฟรม hit */
  private playPunch(v: View, p: { key: string; dir: string; hitMs: number }, dst: View | undefined, crit: boolean, hit: boolean) {
    this.playAction(v, p.key, p.dir);
    if (hit && dst) this.time.delayedCall(p.hitMs, () => { if (dst.body.active) this.strikeFx(v, dst, crit); });
  }

  /** เล่นท่าครั้งเดียว (ต่อย/ก้มเก็บ) เล่นซ้ำระหว่างท่า = เริ่มใหม่ · จบแล้วกลับท่ายืน (หายใจ)
   *  faceEnd: จบท่าแล้วหันตามทิศของท่า (ก้มเก็บ) ไม่งั้นกลับทิศเดิม (ต่อยที่ยืมท่าทแยง) */
  private playAction(v: View, key: string, dir: string, faceEnd = false) {
    v.acting = true;
    v.actDir = dir;
    v.breathing = false;
    v.pose = key;
    v.body.setFlipX(this.walkFlip.has(key)).setOrigin(0.5, (45 + WALK_PAD) / (48 + WALK_PAD * 2)).setScale(1);
    v.body.play(key);
    v.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + key, () => {
      if (!v.acting || v.pose !== key) return;
      v.acting = false;
      v.pose = "";
      if (faceEnd) v.dir = dir as View["dir"];
      this.updatePose(v);
    });
  }

  /** server: ผู้เล่นถึงของแล้ว → หันหน้าไปทางของ แล้วเล่นท่าก้มเก็บ (ไม่มีภาพท่านี้ = หันหน้าอย่างเดียว) */
  private pickupStart(id: string, gid: string) {
    const v = this.views.get(id), img = this.groundViews.get(gid);
    if (!v?.sprite || !v.look || !img) return;
    this.face(v, img.x - v.c.x, img.y - v.c.y);
    const key = `${v.sprite}_pickup_${v.dir}`;
    if (this.anims.exists(key)) this.playAction(v, key, v.dir, true);
  }

  /** ตำแหน่งมือในท่าก้มเก็บ (พิกัดโลก) จากตาราง PICKUP_ANIMS · ทิศกลับด้าน x = 63 - x */
  private pickupHand(v: View): { x: number; y: number } | null {
    if (!v.look || !v.acting || !v.pose.startsWith(`${v.sprite}_pickup_`)) return null;
    const src = animSource(pickupDirs(v.look.gender), v.actDir);
    if (!src) return null;
    const [hx, hy] = PICKUP_ANIMS[v.look.gender][src.dir].hand;
    const x = src.flip ? 63 - hx : hx;
    // body: จุดยึด (0.5, 53/64) อยู่ที่ (0, 8) ของ inner
    return { x: v.c.x + x - 32, y: v.c.y - v.lift + 8 + hy - (45 + WALK_PAD) };
  }

  /** แรงกระแทกตอนต่อย/ถีบโดน (โค้ดล้วน หันตามทิศที่ตี): เส้นความเร็วพุ่งเข้าหาจุดโดน + แสงวาบรีตามแนวตี
   *  + วงกระแทกครึ่งวงด้านหลังเป้า + เศษแสงกระเด็นไปทางเดียวกับแรงตี · คริ = สีทองและใหญ่กว่า */
  private strikeFx(src: View, dst: View, crit: boolean) {
    const ADD = Phaser.BlendModes.ADD;
    const a = Math.atan2(dst.c.y - src.c.y, dst.c.x - src.c.x);
    const ux = Math.cos(a), uy = Math.sin(a) * 0.7; // มุมมองเอียง: แกนตั้งแบนลง
    const nx = -Math.sin(a), ny = Math.cos(a) * 0.7;
    const x = dst.c.x - ux * 4, y = dst.c.y - dst.lift + dst.topY / 2 - uy * 4, depth = dst.c.y + 2;
    const main = crit ? 0xffd84a : 0xffffff, glow = crit ? 0xfff2b0 : 0xbfe3ff;
    const k = crit ? 1.35 : 1;

    // เส้นความเร็ว: มาจากฝั่งคนตี พุ่งเข้าจุดโดนแล้วหดหาย
    for (const off of crit ? [-9, -5, -1, 3, 7] : [-7, -3, 1, 5]) {
      const len = (16 + Math.random() * 8) * k;
      const g = this.add.graphics({ x: x + nx * off, y: y + ny * off }).setBlendMode(ADD).setDepth(depth);
      g.lineStyle(off === -1 || off === 1 ? 3 : 2, off % 2 ? glow : main, 1).lineBetween(-ux * (len + 10), -uy * (len + 10), -ux * 4, -uy * 4);
      this.tweens.add({ targets: g, x: g.x + ux * 8, y: g.y + uy * 8, alpha: 0, duration: 140, ease: "Quad.easeOut", onComplete: () => g.destroy() });
    }
    // แสงวาบรีตามแนวตี
    const flash = this.add.ellipse(x, y, 22 * k, 10 * k, main).setRotation(a).setBlendMode(ADD).setDepth(depth + 1).setScale(0.3);
    this.tweens.add({ targets: flash, scaleX: 1.6, scaleY: 1.1, alpha: 0, duration: 150, ease: "Quad.easeOut", onComplete: () => flash.destroy() });
    // วงกระแทกครึ่งวง ด้านหลังเป้า (ฝั่งที่แรงพุ่งออกไป)
    const arc = this.add.graphics({ x: x + ux * 4, y: y + uy * 4 }).setBlendMode(ADD).setDepth(depth + 1);
    arc.lineStyle(3, glow, 1).beginPath().arc(0, 0, 9 * k, a - 1.1, a + 1.1).strokePath();
    arc.setScale(1, 0.75);
    this.tweens.add({ targets: arc, scaleX: 2.2, scaleY: 1.6, x: arc.x + ux * 10, y: arc.y + uy * 10, alpha: 0, duration: 220,
      ease: "Cubic.easeOut", onComplete: () => arc.destroy() });
    // เศษแสงกระเด็นไปทางเดียวกับแรงตี
    for (let i = 0; i < (crit ? 9 : 6); i++) {
      const b = a + (Math.random() - 0.5) * 1.6, d = (18 + Math.random() * 14) * k;
      const p = this.add.rectangle(x, y, 4, 2, i % 2 ? main : glow).setRotation(b).setBlendMode(ADD).setDepth(depth + 1);
      this.tweens.add({ targets: p, x: x + Math.cos(b) * d, y: y + Math.sin(b) * d * 0.7, scaleX: 0.2, alpha: 0,
        duration: 200 + Math.random() * 100, ease: "Quad.easeOut", onComplete: () => p.destroy() });
    }
  }

  /** ต่อย (โค้ดล้วน ใช้กับทิศที่ยังไม่มีภาพท่าต่อย): ง้าง = ถอยหลัง+เอนไปข้างหลัง → ต่อย = พุ่งไปข้างหน้า มีหมัดพุ่งออกไปหาเป้า + เส้นความเร็ว
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

  /** ปุ่มทดสอบ: สลับเสื้อ ไม่ใส่ → เสื้อแต่ละชุด (ภาพทับต้องมีไฟล์ครบ 8 ทิศ) → ไม่ใส่ (เฉพาะตัวเรา ฝั่ง client) คืน id */
  cycleOutfit(): string | null {
    const list = BODY_OUTFITS
      .filter((o) => o.type === "dye" || DIRS.every((d) => this.textures.exists(outfitKey(o.id, d))))
      .map((o) => o.id);
    const i = this.outfitId ? list.indexOf(this.outfitId) : -1;
    this.outfitId = list[i + 1] ?? null;
    const v = this.me ? this.views.get(this.me) : undefined;
    if (v) this.setOutfit(v);
    return this.outfitId;
  }

  private setOutfit(v: View) {
    v.outfit?.destroy();
    v.skin?.destroy();
    v.outfit = v.skin = null;
    const id = this.outfitId;
    const def = BODY_OUTFITS.find((o) => o.id === id);
    if (!id || !def || !v.sprite) return;
    if (def.type === "dye") {
      // ย้อมทุกเฟรมของตัวนี้ที่มีอยู่ (ยืน หายใจ เดิน) ครั้งเดียว เก็บไว้ · เฟรมท่าใหม่ที่ยังไม่มีย้อมตอนเจอครั้งแรก (placeOutfit)
      for (const k of this.textures.getTextureKeys())
        if (k.startsWith(`${v.sprite}_`) && !k.endsWith("_skin") && !k.includes("_dye_")) this.dyeFrame(k, def);
    } else if (!this.textures.exists(outfitKey(id, "south"))) return;
    // เฟรมหายใจเข้าของเสื้อภาพทับ สร้างครั้งแรกครั้งเดียว
    if (def.type === "overlay") for (const d of DIRS) {
      const k = outfitKey(id, d);
      if (this.textures.exists(k) && !this.textures.exists(`${k}_in`))
        this.textures.addCanvas(`${k}_in`, inhaleCanvas(this.textures.get(k).getSourceImage() as HTMLImageElement));
    }
    // ลำดับวาด: ตัวละคร → เสื้อ → สีผิวของตัว → อาวุธ (อาวุธด้านหน้าอยู่บนสุดของ inner, ด้านหลังอยู่ใต้ตัว)
    v.outfit = this.add.image(0, 0, def.type === "dye" ? "__MISSING" : outfitKey(id, v.dir));
    v.inner.addAt(v.outfit, v.inner.getIndex(v.body) + 1);
    v.skin = this.add.image(0, 0, "__MISSING");
    v.inner.addAt(v.skin, v.inner.getIndex(v.outfit) + 1);
    this.placeOutfit(v);
  }

  /** ตัวในเฟรมที่เล่นอยู่เลื่อนจากภาพยืนของทิศนั้นเท่าไหร่ (พิกัด inner):
   *  หายใจเข้า = ขึ้น 1 px · ท่าเดิน PixelLab = ค่าที่หาตอนโหลด (กลับด้าน = กลับเครื่องหมายแนวนอน) · ท่าเดินโค้ด = 0 */
  private bodyShift(v: View): { dx: number; dy: number } {
    const key = v.body.texture.key;
    if (key.endsWith("_in")) return { dx: 0, dy: -1 };
    const w = this.walkShifts.get(key);
    return w ? { dx: v.body.flipX ? -w.dx : w.dx, dy: w.dy } : { dx: 0, dy: 0 };
  }

  /** เสื้อซ้อนตรงตัวละครทุกเฟรม (ย้อมสี = ภาพย้อมของเฟรมนั้น, ภาพทับ = placeOverlay) แล้ววางชั้นสีผิวทับ */
  private placeOutfit(v: View) {
    const o = v.outfit!, b = v.body, id = this.outfitId!;
    const key = b.texture.key;
    const def = BODY_OUTFITS.find((x) => x.id === id);
    if (def?.type === "dye") {
      // ย้อมสี: ภาพย้อมของเฟรมที่ตัวเล่นอยู่ ตรงกับตัวทุกอย่าง (ต่อย/ท่าอื่นที่ขยับตัวด้วย tween ก็ตามไปด้วย)
      const dk = this.dyeFrame(key, def);
      if (o.texture.key !== dk) o.setTexture(dk);
      o.setFlipX(b.flipX).setOrigin(b.originX, b.originY).setPosition(b.x, b.y).setScale(b.scaleX, b.scaleY).setAngle(b.angle);
    } else this.placeOverlay(v, o, b, id, key);
    // ชั้นสีผิว: ตรงกับตัวทุกอย่าง (ภาพเฟรมเดียวกัน กลับด้าน/จุดยึดเดียวกัน)
    const sk = v.skin!, sKey = skinKey(key);
    sk.setVisible(this.textures.exists(sKey));
    if (sk.visible && sk.texture.key !== sKey) sk.setTexture(sKey);
    sk.setFlipX(b.flipX).setOrigin(b.originX, b.originY).setPosition(b.x, b.y).setScale(b.scaleX, b.scaleY).setAngle(b.angle);
  }

  /** texture ย้อมสีของเฟรมตัวละคร (สร้างครั้งแรกครั้งเดียว) คืนชื่อ texture */
  private dyeFrame(bodyKey: string, def: DyeOutfit): string {
    const k = dyeKey(bodyKey, def.id);
    if (!this.textures.exists(k))
      this.textures.addCanvas(k, dyeCanvas(this.textures.get(bodyKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement, def));
    return k;
  }

  /** ภาพทับ: ยืน = ภาพนิ่ง/หายใจเข้าตามตัว
   *  เดินท่า PixelLab = ภาพนิ่งเลื่อนตาม bodyShift (ทิศกลับด้านใช้ภาพทิศต้นฉบับกลับด้าน ให้ตรงกับตัว)
   *  เดินท่าโค้ด = ภาพนิ่ง (ทิศซ้ายใช้ภาพฝั่งขวากลับด้าน ให้ตรงกับตัว) */
  private placeOverlay(v: View, o: Phaser.GameObjects.Image, b: Phaser.GameObjects.Sprite, id: string, key: string) {
    const walking = key.startsWith(`${v.sprite}_walk_`) || this.walkShifts.has(key); // เดินโค้ด / เฟรม PixelLab (เดิน, ต่อย)
    const flip = walking && (b.flipX || (!this.walkShifts.has(key) && v.dir.endsWith("west")));
    const dir = v.acting ? v.actDir : v.dir; // ต่อยทิศทแยงที่ยืมมา: เสื้อตามทิศของท่า
    const k = outfitKey(id, flip ? MIRROR[dir] : dir) + (key.endsWith("_in") ? "_in" : "");
    if (o.texture.key !== k && this.textures.exists(k)) o.setTexture(k);
    const sh = this.walkShifts.has(key) ? this.bodyShift(v) : { dx: 0, dy: 0 };
    o.setFlipX(flip).setOrigin(0.5, 45 / 48).setPosition(b.x + sh.dx, b.y + sh.dy).setScale(b.scaleX, b.scaleY).setAngle(b.angle);
  }



  /** ปุ่มทดสอบ: สลับอาวุธ มือเปล่า → อาวุธที่มีภาพแต่ละชิ้น → มือเปล่า (เฉพาะตัวเรา ฝั่ง client) คืน id อาวุธ */
  cycleWeapon(): string | null {
    const list = WEAPONS.filter((w) => this.textures.exists(`weapon_${w.id}`)).map((w) => w.id);
    const i = this.weaponId ? list.indexOf(this.weaponId) : -1;
    this.weaponId = list[i + 1] ?? null;
    const v = this.me ? this.views.get(this.me) : undefined;
    if (v) this.setWeapon(v);
    return this.weaponId;
  }

  private setWeapon(v: View) {
    const w = WEAPONS.find((x) => x.id === this.weaponId);
    v.weapon?.destroy();
    v.weapon = null;
    this.tweens.killTweensOf(v.swing);
    v.swing.a = 0;
    if (!w || !this.textures.exists(`weapon_${w.id}`)) return;
    v.weapon = this.add.image(0, 0, `weapon_${w.id}`).setOrigin(w.grip[0] / w.size[0], w.grip[1] / w.size[1]);
    v.weapon.setData("back", null);
    this.placeWeapon(v);
  }

  /** วาง grip ที่มือตามทิศ เลื่อนขึ้นลงตามหัว · หมุนให้ปลายชี้ไปทาง deg · หดความยาวตาม len
   *  หลัง = ใต้ตัวละคร, หน้า = ทับตัวละคร (และเสื้อ) */
  private placeWeapon(v: View) {
    const w = v.weapon!, h = HAND[v.dir] ?? HAND.south;
    if (w.getData("back") !== h.back) {
      w.setData("back", h.back);
      if (w.parentContainer) v.inner.remove(w);
      v.inner.addAt(w, h.back ? v.inner.getIndex(v.body) : v.inner.length);
    }
    // ภาพปลายชี้ขึ้น (90°) → หมุนตามเข็มใน Phaser = 90 - deg · ท่าตี: ปลายชี้ซ้ายหมุนทิศตรงข้าม
    const side = Math.cos((h.deg * Math.PI) / 180) < 0 ? -1 : 1;
    w.setScale(1, h.len)
      .setPosition(v.body.x + h.x - 24 + this.bodyShift(v).dx, 8 + h.y - 45 + this.bodyShift(v).dy)
      .setAngle(90 - h.deg + side * v.swing.a);
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
      const stills: Record<string, HTMLCanvasElement> = {};
      for (const d of DIRS) {
        const src = this.textures.get(`base_${look.gender}_${d}`).getSourceImage() as HTMLImageElement;
        const still = recolorSprite(src, look);
        stills[d] = still;
        this.textures.addCanvas(`${prefix}_${d}`, still);
        const inhale = inhaleCanvas(still);
        this.textures.addCanvas(`${prefix}_${d}_in`, inhale);
        this.textures.addCanvas(skinKey(`${prefix}_${d}`), skinCanvas(still));
        this.textures.addCanvas(skinKey(`${prefix}_${d}_in`), skinCanvas(inhale));
      }
      // ท่าเดิน: มีภาพ PixelLab ของทิศนี้ (หรือทิศฝั่งตรงข้าม → กลับด้าน) ใช้ภาพนั้น (ผู้ชายมีครบทุกทิศแล้ว)
      // ไม่มี (เช่น ตัวละครที่ยังไม่มีท่าเดิน) = โค้ดล้วน (walkgen.ts) 4 เฟรมจากภาพยืนนิ่ง ทิศซ้าย 3 ทิศใช้ภาพฝั่งขวาที่กลับด้านแล้วค่อยแบ่งขา
      const pl = walkDirs(look.gender);
      for (const d of DIRS) {
        const src = animSource(pl, d);
        let frames: { key: string }[];
        if (src) {
          const n = WALK_ANIMS[look.gender][src.dir];
          frames = [];
          for (let i = 0; i < n; i++) {
            const key = `${prefix}_pwalk_${src.dir}_${i}`;
            if (!this.textures.exists(key)) {
              const raw = `base_${look.gender}_walk_${src.dir}_${i}`;
              if (!this.textures.exists(raw)) break;
              const img = this.textures.get(raw).getSourceImage() as HTMLImageElement;
              const frame = recolorSprite(img, look);
              this.textures.addCanvas(key, frame);
              this.textures.addCanvas(skinKey(key), skinCanvas(frame));
              const stand = this.textures.get(`base_${look.gender}_${src.dir}`).getSourceImage() as HTMLImageElement;
              this.walkShifts.set(key, walkShift(img, stand, WALK_PAD));
            }
            frames.push({ key });
          }
          if (src.flip) this.walkFlip.add(`${prefix}_walk_${d}`);
        } else {
          const left = d.endsWith("west");
          const base = left ? flipCanvas(stills[MIRROR[d]]) : stills[d];
          frames = makeWalkFrames(base).map((f, i) => {
            const key = `${prefix}_walk_${d}_${i}`;
            this.textures.addCanvas(key, f.canvas);
            this.textures.addCanvas(skinKey(key), skinCanvas(f.canvas));
            this.walkFeet.set(key, { left: f.left, right: f.right });
            return { key };
          });
        }
        if (frames.length) this.anims.create({ key: `${prefix}_walk_${d}`, frames, frameRate: 1000 / WALK_FRAME_MS, repeat: -1 });
      }
      // ท่าครั้งเดียวจาก PixelLab (ต่อย, ก้มเก็บของ)
      this.actionAnims(look, prefix, "punch", PUNCH_ANIMS[look.gender] ?? {}, (p) => punchFrameMs(p));
      this.actionAnims(look, prefix, "pickup", PICKUP_ANIMS[look.gender] ?? {}, () => PICKUP_FRAME_MS);
    }
    return prefix;
  }

  /** ท่าครั้งเดียวจาก PixelLab: เปลี่ยนสี + ชั้นสีผิว + ค่าเลื่อนตัว (เสื้อภาพทับ) ทุกเฟรม · ทิศที่ไม่มีใช้ทิศฝั่งตรงข้ามกลับด้าน
   *  เฟรมดิบ base_<เพศ>_<kind>_<ทิศ>_<i> → texture <prefix>_p<kind>_<ทิศ>_<i> → animation <prefix>_<kind>_<ทิศ> */
  private actionAnims<T extends { frames: number }>(look: Look, prefix: string, kind: string, table: Record<string, T>, frameMs: (p: T) => number) {
    for (const d of DIRS) {
      const src = animSource(Object.keys(table), d);
      if (!src) continue;
      const frames: { key: string }[] = [];
      for (let i = 0; i < table[src.dir].frames; i++) {
        const key = `${prefix}_p${kind}_${src.dir}_${i}`;
          if (!this.textures.exists(key)) {
          const raw = `base_${look.gender}_${kind}_${src.dir}_${i}`;
          if (!this.textures.exists(raw)) break;
          const img = this.textures.get(raw).getSourceImage() as HTMLImageElement;
          const frame = recolorSprite(img, look);
          this.textures.addCanvas(key, frame);
          this.textures.addCanvas(skinKey(key), skinCanvas(frame));
          const stand = this.textures.get(`base_${look.gender}_${src.dir}`).getSourceImage() as HTMLImageElement;
          this.walkShifts.set(key, walkShift(img, stand, WALK_PAD));
        }
        frames.push({ key });
      }
      if (!frames.length) continue;
      const anim = `${prefix}_${kind}_${d}`;
      if (!this.anims.exists(anim)) this.anims.create({ key: anim, frames, frameRate: 1000 / frameMs(table[src.dir]), repeat: 0 });
      if (src.flip) this.walkFlip.add(anim);
    }
  }

  /** หันหน้า: ผู้เล่นเปลี่ยนภาพตามทิศ, Poring พลิกซ้าย-ขวา, มอนจาก sheet หันเข้ากล้องตลอด */
  private face(v: View, dx: number, dy: number) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    v.dir = dirOf(dx, dy);
    if (v.sprite) this.updatePose(v);
    else if (!v.sheet && Math.abs(dx) > 0.5) v.body.setFlipX(dx < 0);
  }

  /** ผู้เล่น: ยืน = ภาพนิ่งของทิศ + หายใจ (update), เดิน = ท่าเดินของทิศนั้น (PixelLab หรือ walkgen.ts), สลบ = ภาพนิ่ง
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
    const walking = v.path.length > 0;
    const alive = v.kind === "player" && !v.dead;
    if (v.acting) {
      // ต่อยจนจบท่า (ANIMATION_COMPLETE ปลด) · สลบ = เลิกต่อย · สั่งเดินใหม่ = เลิก (ข้อความ move)
      // ยังเลื่อนเข้าช่องที่ server หยุดไม่เสร็จ ไม่นับว่าเดิน (ไม่อย่างนั้นท่าต่อยโดนยกเลิกทันที)
      if (alive) return;
      v.acting = false;
    }
    const walk = alive && walking && this.anims.exists(`${v.sprite}_walk_${v.dir}`) ? `${v.sprite}_walk_${v.dir}` : null;
    const pose = walk ?? `${v.sprite}_${v.dir}:${alive ? "breath" : "still"}`;
    if (pose === v.pose) return;
    v.pose = pose;
    v.breathing = !walk && alive && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    v.body.setScale(1);
    if (walk) {
      // ภาพ PixelLab 64×64: ภาพยืนอยู่กลางด้วยระยะ WALK_PAD → เท้า (แถว 45 ของภาพยืน) อยู่แถว 45 + WALK_PAD
      const pixellab = this.walkShifts.has(this.anims.get(walk).frames[0].textureKey);
      v.body.setFlipX(this.walkFlip.has(walk)).setOrigin(0.5, pixellab ? (45 + WALK_PAD) / (48 + WALK_PAD * 2) : 45 / 48);
      v.body.play(walk); // เปลี่ยนทิศระหว่างเดิน = เริ่มเฟรมแรกของทิศใหม่
    } else v.body.stop().setFlipX(false).setOrigin(0.5, 45 / 48).setTexture(`${v.sprite}_${v.dir}`);
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
      // หายใจ: สลับภาพนิ่ง/หายใจเข้าตามจังหวะของแต่ละคน (เสื้อ/จุดมืออาวุธตาม bodyShift)
      if (v.breathing) {
        const key = `${v.sprite}_${v.dir}${Math.floor((time + v.breath0) / BREATH_MS) % 2 ? "_in" : ""}`;
        if (v.body.texture.key !== key) v.body.setTexture(key);
      }
      if (v.path.length) {
        // ระยะที่เดินได้ในเฟรมนี้ ถึงช่องแล้วเหลือเท่าไหร่เดินต่อช่องถัดไป (ไม่ทิ้งเศษ ความเร็วสม่ำเสมอทุกช่อง)
        let rest = (TILE / v.moveMs) * dt; // ทแยงใช้เวลา ×1.414 ตรงกับ server
        let fx = 0, fy = 0;
        while (v.path.length && rest > 0) {
          const n = v.path[0];
          const tx = center(n.x), ty = center(n.y);
          const dx = tx - v.c.x, dy = ty - v.c.y;
          const dist = Math.hypot(dx, dy);
          fx = dx; fy = dy;
          if (dist <= rest) { v.c.setPosition(tx, ty); v.path.shift(); rest -= dist; }
          else { v.c.x += (dx / dist) * rest; v.c.y += (dy / dist) * rest; rest = 0; }
        }
        this.face(v, fx, fy);
      }
      this.updatePose(v);
      v.c.setDepth(v.c.y);
      const lift = this.gm.bridgeLift(v.c.x, v.c.y);
      if (lift !== v.lift) { v.lift = lift; v.inner.y = -lift; }
      v.oc.setPosition(v.c.x, v.c.y - v.lift);
      if (v.outfit) this.placeOutfit(v);
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
