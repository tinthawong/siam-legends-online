import { MapRoom } from "./MapRoom";
import { MAP_ID, NAME_RE } from "../../shared/constants";
import { SPAWN } from "../../shared/map";
import type { JoinCharacter } from "../../shared/protocol";
import { parseLook, DEFAULT_LOOK, type Look } from "../../shared/appearance";
import { parseLog } from "../../shared/quests";
import { parseEquip } from "../../shared/equipment";
export { MapRoom };

export interface Env {
  MAP_ROOM: DurableObjectNamespace<MapRoom>;
  DB: D1Database;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

interface CharacterRow {
  user_id: string;
  name: string;
  level: number;
  exp: number;
  map: string;
  x: number;
  y: number;
  gender: string;
  hair: string;
  eyes: string;
  money: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  stat_points: number;
  quests: string;
  equip: string;
}

const lookOf = (r: { gender: string; hair: string; eyes: string }): Look =>
  parseLook(r) ?? DEFAULT_LOOK;


const json = (data: unknown, status = 200) => Response.json(data, { status });

/** ถาม Supabase ว่า token นี้เป็นของใคร — คืน user id หรือ null */
async function authUser(env: Env, token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id ?? null;
}

const bearer = (req: Request) => req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // client ดึงค่า Supabase จากที่นี่ ตั้งค่าจุดเดียวใน wrangler.toml
    if (url.pathname === "/api/config") {
      return json({ supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY });
    }

    if (url.pathname === "/api/character") {
      const uid = await authUser(env, bearer(req));
      if (!uid) return json({ error: "กรุณาเข้าสู่ระบบใหม่" }, 401);

      if (req.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT name, level, exp, gender, hair, eyes FROM characters WHERE user_id = ?",
        ).bind(uid).first<{ name: string; level: number; exp: number; gender: string; hair: string; eyes: string }>();
        if (!row) return json({ character: null });
        return json({ character: { name: row.name, level: row.level, exp: row.exp, look: lookOf(row) } });
      }

      if (req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { name?: unknown; look?: unknown };
        const name = String(body.name ?? "").trim();
        if (!NAME_RE.test(name)) {
          return json({ error: "ชื่อต้องยาว 2–16 ตัว ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _" }, 400);
        }
        const look = parseLook(body.look);
        if (!look) return json({ error: "ข้อมูลรูปลักษณ์ไม่ถูกต้อง" }, 400);
        const now = Date.now();
        try {
          await env.DB.prepare(
            "INSERT INTO characters (user_id, name, level, exp, map, x, y, gender, hair, eyes, created_at, updated_at) VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).bind(uid, name, MAP_ID, SPAWN.x, SPAWN.y, look.gender, look.hair, look.eyes, now, now).run();
        } catch (e) {
          const msg = String(e);
          if (msg.includes("characters.name")) return json({ error: "ชื่อนี้มีคนใช้แล้ว" }, 409);
          if (msg.includes("characters.user_id")) return json({ error: "บัญชีนี้มีตัวละครแล้ว" }, 409);
          throw e;
        }
        return json({ character: { name, level: 1, exp: 0, look } });
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("ต้องเชื่อมต่อด้วย WebSocket", { status: 426 });
      }
      // เบราว์เซอร์ใส่ header ให้ WebSocket ไม่ได้ จึงส่ง token มาทาง query
      const uid = await authUser(env, url.searchParams.get("token"));
      if (!uid) return new Response("unauthorized", { status: 401 });

      const row = await env.DB.prepare("SELECT * FROM characters WHERE user_id = ?")
        .bind(uid).first<CharacterRow>();
      if (!row) return new Response("no character", { status: 404 });

      const inv = await env.DB.prepare("SELECT item, count FROM inventory WHERE user_id = ? AND count > 0")
        .bind(uid).all<{ item: string; count: number }>();
      const join: JoinCharacter = {
        userId: row.user_id, name: row.name, level: row.level, exp: row.exp, x: row.x, y: row.y,
        look: lookOf(row), inv: inv.results, money: row.money ?? 0,
        stats: { str: row.str, agi: row.agi, vit: row.vit, int: row.int, dex: row.dex, luk: row.luk },
        points: row.stat_points,
        quests: parseLog(row.quests),
        equip: parseEquip(row.equip),
      };
      // สร้าง request ใหม่ทั้งก้อน client จึงปลอม X-Character มาเองไม่ได้
      const headers = new Headers(req.headers);
      headers.set("X-Character", JSON.stringify(join));
      const room = env.MAP_ROOM.get(env.MAP_ROOM.idFromName(row.map));
      return room.fetch(new Request(req.url, { headers }));
    }

    return new Response("Not found", { status: 404 });
  },
};
