// หน้าสร้างตัวละคร: ตัวอย่างหมุนได้ + เลือกเพศ / สีผม / สีตา
import { DEFAULT_LOOK, GENDERS, HAIR_COLORS, EYE_COLORS, lookKey, type Gender, type Look } from "../../shared/appearance";
import { recolorSprite } from "./recolor";
import { IDLE_DIRS, IDLE_FRAMES, IDLE_FPS, IDLE_OFFSET, idleFrameUrl } from "./sprites";

// เรียงตามเข็มนาฬิกาเวลามองจากด้านบน ใช้กับปุ่มหมุน
const ROTATION = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];

export class Creator {
  look: Look = { ...DEFAULT_LOOK };
  private dir = 0;
  private images = new Map<string, HTMLImageElement>();
  private cache = new Map<string, HTMLCanvasElement>();
  private ready: Promise<void> | null = null;
  private frame = 0; // เฟรมท่ายืนที่แสดงอยู่

  constructor(private canvas: HTMLCanvasElement) {}

  init() {
    if (this.ready) return this.ready;
    this.buildOptions("gender-opts", GENDERS, (k) => { this.look.gender = k as Gender; }, this.look.gender, null);
    this.buildOptions("hair-opts", HAIR_COLORS, (k) => { this.look.hair = k; }, this.look.hair, (k) => HAIR_COLORS[k].swatch);
    this.buildOptions("eye-opts", EYE_COLORS, (k) => { this.look.eyes = k; }, this.look.eyes, (k) => EYE_COLORS[k].swatch);
    document.getElementById("rot-left")!.onclick = () => { this.dir = (this.dir + 7) % 8; this.render(); };
    document.getElementById("rot-right")!.onclick = () => { this.dir = (this.dir + 1) % 8; this.render(); };

    const loads: Promise<void>[] = [];
    for (const g of Object.keys(GENDERS))
      for (const d of ROTATION) {
        const img = new Image();
        img.src = `/sprites/base-${g}/${d}.png`;
        this.images.set(`${g}_${d}`, img);
        loads.push(img.decode().catch(() => undefined));
      }
    // ท่ายืน: ทิศที่มีเฟรมจะเล่นวนเหมือนในเกม
    for (const g of Object.keys(GENDERS))
      for (const d of IDLE_DIRS)
        for (let i = 0; i < IDLE_FRAMES; i++) {
          const img = new Image();
          img.src = `/${idleFrameUrl(g, d, i)}`;
          this.images.set(`${g}_idle_${d}_${i}`, img);
          loads.push(img.decode().catch(() => undefined));
        }
    setInterval(() => {
      if (!this.canvas.offsetParent || !IDLE_DIRS.includes(ROTATION[this.dir])) return; // ซ่อนอยู่ / ทิศนี้ไม่มีท่ายืน
      this.frame = (this.frame + 1) % IDLE_FRAMES;
      this.render();
    }, 1000 / IDLE_FPS);
    this.ready = Promise.all(loads).then(() => this.render());
    return this.ready;
  }

  private buildOptions(
    id: string, opts: Record<string, { name: string } | string>,
    set: (k: string) => void, current: string, swatch: ((k: string) => string) | null,
  ) {
    const box = document.getElementById(id)!;
    box.innerHTML = "";
    for (const [key, v] of Object.entries(opts)) {
      const label = typeof v === "string" ? v : v.name;
      const b = document.createElement("button");
      b.type = "button";
      b.className = swatch ? "swatch" : "choice";
      b.setAttribute("aria-pressed", String(key === current));
      b.setAttribute("aria-label", label);
      b.title = label;
      if (swatch) b.style.setProperty("--c", swatch(key));
      else b.textContent = label;
      b.onclick = () => {
        for (const o of Array.from(box.children)) o.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        set(key);
        this.render();
      };
      box.appendChild(b);
    }
  }

  private render() {
    const d = ROTATION[this.dir];
    const idle = IDLE_DIRS.includes(d) ? `idle_${d}_${this.frame}` : null;
    const src = idle ?? d;
    const key = `${lookKey(this.look)}_${src}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      const img = this.images.get(`${this.look.gender}_${src}`);
      if (!img || !img.complete || !img.naturalWidth) return;
      sprite = recolorSprite(img, this.look, idle ? IDLE_OFFSET : 0);
      this.cache.set(key, sprite);
    }
    const ctx = this.canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // ขยายเท่ากับภาพ base 48px ทุกกรณี และเลื่อนเฟรม 64px กลับ 8px ให้ตัวละครอยู่ตำแหน่งเดียวกัน
    const s = Math.floor(this.canvas.width / 48);
    const off = idle ? IDLE_OFFSET * s : 0;
    ctx.drawImage(sprite, (this.canvas.width - 48 * s) / 2 - off, this.canvas.height - 48 * s - off, sprite.width * s, sprite.height * s);
  }
}
