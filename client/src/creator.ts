// หน้าสร้างตัวละคร: ตัวอย่างหมุนได้ + เลือกเพศ / สีผม / สีตา
import { DEFAULT_LOOK, GENDERS, HAIR_COLORS, EYE_COLORS, lookKey, type Gender, type Look } from "../../shared/appearance";
import { recolorSprite } from "./recolor";

// เรียงตามเข็มนาฬิกาเวลามองจากด้านบน ใช้กับปุ่มหมุน
const ROTATION = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];

export class Creator {
  look: Look = { ...DEFAULT_LOOK };
  private dir = 0;
  private images = new Map<string, HTMLImageElement>();
  private cache = new Map<string, HTMLCanvasElement>();
  private ready: Promise<void> | null = null;

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
    const key = `${lookKey(this.look)}_${d}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      const img = this.images.get(`${this.look.gender}_${d}`);
      if (!img || !img.complete || !img.naturalWidth) return;
      sprite = recolorSprite(img, this.look);
      this.cache.set(key, sprite);
    }
    const ctx = this.canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = Math.floor(this.canvas.width / sprite.width);
    ctx.drawImage(sprite, (this.canvas.width - sprite.width * s) / 2, this.canvas.height - sprite.height * s, sprite.width * s, sprite.height * s);
  }
}
