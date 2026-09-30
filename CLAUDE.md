# Siam Legends Online

เกม MMORPG ธีมไทย เล่นผ่านเว็บทั้งมือถือและคอม แนว Ragnarok (คลิกเป้าหมายแล้วตี) มุมมองเอียงจากด้านบน 8 ทิศ

## วิธีทำงานกับผู้ใช้

- **ตอบเป็นภาษาไทยเสมอ**
- เมื่อผู้ใช้เขียน spec มา ให้ทำเฉพาะที่ spec บอก ห้ามเพิ่มเงื่อนไขหรือกฎที่ผู้ใช้ไม่ได้ระบุ
- ผู้ใช้ใช้ Windows (PowerShell) เวลาให้คำสั่ง terminal ให้ใช้รูปแบบที่ใช้ได้บน PowerShell
- ก่อนแก้โค้ดชุดใหญ่ แนะนำให้ผู้ใช้ commit ขึ้น GitHub ก่อน จะได้ย้อนกลับได้

## เทคโนโลยี

| ส่วน | ใช้ |
|---|---|
| ฝั่งเกม (client) | Phaser 3 + TypeScript + Vite (`client/`) |
| เซิร์ฟเวอร์ | Cloudflare Workers + Durable Objects (`server/`) |
| ฐานข้อมูลตัวละคร | Cloudflare D1 (`migrations/`) |
| ระบบบัญชี | Supabase Auth: อีเมล/รหัสผ่าน, Google, Guest (anonymous) |
| ภาพตัวละคร | PixelLab (48×48 px, Low Top-Down, 8 ทิศ) |

Supabase project ref: `ctmbapudylwizbrhfcoy` (ค่า URL และ anon key อยู่ใน `wrangler.toml` ส่วน `[vars]`)

## คำสั่ง

```powershell
npm install
npm run dev             # คำสั่งเดียว: migration + build อัตโนมัติเมื่อแก้โค้ด + wrangler dev → เปิด http://localhost:8787 (แก้แล้วรอ build แล้วกดรีเฟรช)
npm run db:migrate      # ใช้ migration กับ D1 บนเครื่อง (ต้องรันทุกครั้งที่มีไฟล์ใหม่ใน migrations/)
npm run build           # build client ไปที่ client/dist (wrangler เสิร์ฟจากตรงนี้)
npx wrangler dev        # เปิด http://localhost:8787 (เปิดด้วย localhost ไม่ใช่ 127.0.0.1 เพราะ redirect ของ Supabase)
npm run dev:client      # vite ที่ :5173 แก้ client แบบเห็นผลทันที (ต้องเปิด wrangler dev คู่กัน)
npm run typecheck       # tsc ทั้ง client และ server
```

`wrangler d1 migrations apply` อาจถามยืนยัน ถ้ารันแบบอัตโนมัติให้ตั้ง `CI=true`

## โครงสร้าง

- `shared/` ใช้ร่วมกันทั้งสองฝั่ง
  - `constants.ts` ค่าตัวเลขเกม (TILE=32, tick 100ms, ความเร็วเดิน, ระยะตี, รัศมี auto) และ `NAME_RE` กติกาชื่อตัวละคร (client ตรวจก่อนส่ง server ตรวจซ้ำ)
  - `data/levels.json`, `data/monsters.json` ตัวเลขสมดุลที่ export จาก Excel (ดูหัวข้อ "ตัวเลขสมดุลเกม")
  - `map.ts` อ่านแมพจาก **layout ของผู้ใช้** `shared/data/maps/ban-pak-ao.json` (60×44 ช่อง): `terrain` ตัวอักษรต่อช่อง G/S/W/D/P/F (F = ป่า เดินไม่ได้), `props` พิกัดพิกเซล = จุดยึดกึ่งกลางฐาน, `start` จุดเกิด, `npcs` ตำแหน่ง NPC, `spawns` กรอบเกิดมอน+จำนวน, `exits` ทางออก **แก้แมพให้แก้ JSON ห้ามวางของในโค้ด** ชื่อใน layout ที่ต่างจากไฟล์ภาพแปลงใน `PROP_ALIAS` (lantern-pole, rattan-baskets, notice-board) ชื่อมอนแปลงใน `MOB_ID` (rice-crab→mud_crab ฯลฯ) ขวางทาง (`isSolidProp`) ตาม `docs/map-system.md`: ฐาน = แถบล่างกว้าง 70% ของภาพ สูง 1 ช่อง (ภาพกว้างเกิน 3 ช่อง ฐานสูง 2 ช่อง) ขนาดภาพอ่านจาก props.json ของทุกชุด ยกเว้นของเตี้ยในรายการ `NOT_SOLID` และของที่กว้างไม่ถึงครึ่งช่อง ประตูหมู่บ้านขวางเฉพาะเสา สะพานปลาเดินได้บนน้ำ รหัสแมพในเกม `ban_pak_ao`
  - `pathfind.ts` A* 8 ทิศ ห้ามตัดมุม
  - `game.ts` ข้อมูลมอน, สูตร EXP/ดาเมจ
  - `protocol.ts` รูปแบบข้อความ client↔server
  - `appearance.ts` เพศ / สีผม / สีตา (key ที่ใช้เก็บใน D1)
- `server/src/index.ts` Worker: `/api/config`, `/api/character` (GET/POST), `/ws` (ตรวจ token กับ Supabase แล้วส่งต่อให้ Durable Object ของแมพ)
- `server/src/MapRoom.ts` Durable Object 1 ตัว = 1 แมพ: game loop, AI มอน, ตี, auto, บันทึก D1
- `client/index.html` หน้าล็อกอิน (ล็อบบี้แนวตั้ง: โลโก้ → การ์ดเข้าสู่ระบบ → ลิงก์ผู้เล่น → Discord → ดาวน์โหลดแอป → footer) / สร้างตัวละคร / HUD (CSS อยู่ในไฟล์นี้)
- `client/src/main.ts` ระบบล็อกอินและลำดับหน้าจอ
  - ปุ่ม Guest → ไปหน้าสร้างตัวละครทันที บัญชี anonymous สร้างตอนกด "เข้าเกม" แล้วเข้าเกมเลย
  - ลิงก์ที่ยังเป็น `href="#" data-soon` กดแล้วขึ้น "เร็ว ๆ นี้"
- `client/src/creator.ts` หน้าสร้างตัวละคร (ตัวอย่างหมุนได้ 8 ทิศ)
- `client/src/recolor.ts` เปลี่ยนสีผม/ตาของ sprite base ตอนโหลด
- `client/src/GameScene.ts` ฉากเกม Phaser
- `client/src/inventory.ts` หน้ากระเป๋าจากภาพ `ui/inventory-panel.webp` + พิกัด `shared/data/inventory-layout.json` (Alt+E)
- `client/src/quests.ts` หน้าคุยกับ NPC + รายการเควส (เปิดจากปุ่มเควสในกระเป๋า)
- `shared/quests.ts` NPC/เควสจาก `shared/data/npcs.json` + `quests.json` (ตำแหน่ง NPC จาก layout แมพ) server ตัดสิน รับ/นับ/ส่งเควส สถานะเก็บใน D1 คอลัมน์ `quests` (JSON)
- `shared/equipment.ts` ช่องใส่ 10 ช่องแบบ Ragnarok + ค่ารวมจากอุปกรณ์ (ATK อาวุธ, DEF/MDEF %, โบนัสค่าพลัง) ค่าจาก `shared/data/equipment.json` เก็บใน D1 คอลัมน์ `equip` (JSON) ของที่ใส่อยู่ไม่อยู่ในกระเป๋า
- `client/src/worldmap.ts` แผนที่โลก (ปุ่มแผนที่ / คีย์ M) จุด "คุณอยู่ที่นี่" ตามพิกัดพิกเซลของภาพ เพิ่มแมพใหม่ต้องเพิ่มพิกัด
- `client/src/controls.ts` จอยสติ๊ก + ปุ่มโจมตี แสดงทั้งมือถือและคอม (สเปก `docs/ui-controls.md`, ต้นฉบับภาพ `art/ui/`)
- `client/src/forest.ts` ต้นไม้ในช่องป่า: ช่องละ 2 ต้น สุ่มจากพิกัดช่อง พลิกซ้าย-ขวาครึ่งหนึ่ง ต้นดอก (หางนกยูง, ราชพฤกษ์) ~12% ต้นด้านในวาดรวมกับภาพพื้น ต้นริมป่าเป็น sprite เรียงตาม y ช่องป่าที่ด้านบนเดินได้ใช้พุ่มเตี้ย (ไม่บังตัวละครเกินครึ่งตัว)
- ทางออก (`EXITS`): ยังไม่มีแมพอื่น เดินเข้าแล้ว server ส่ง `notice` "เส้นทางนี้ยังไม่เปิด" และหยุดก่อนถึงช่องทางออก ชื่อปลายทางลอยเหนือทางออกเมื่อเข้าใกล้ 7 ช่อง
- `docs/map-system.md` สเปกระบบแมพจากผู้ใช้ (Tiled .tmj → `tools/build_map.py` → JSON) **ยังไม่ได้ทำส่วน Tiled/build_map** ตอนนี้แก้ `shared/data/maps/ban-pak-ao.json` ตรง ๆ
- `client/src/mapRender.ts` วาดพื้นทั้งแผ่นเป็นภาพเดียวตอนเข้าเกม: ลายพื้น 64×64 ปูซ้ำตามพิกัดโลก, ขอบโค้งด้วย noise (`WARP`), ทรายเปียกริมน้ำ, ฟองคลื่น, เส้นขอบหญ้า 1px
- `client/public/sprites/base-male/`, `base-female/` ภาพ base 8 ทิศ (ผมดำ)
- `client/public/ui/` ภาพพื้นหลังหน้าล็อกอินและโลโก้

## กฎที่ตัดสินใจไว้แล้ว (อย่าเปลี่ยนโดยไม่ถามผู้ใช้)

- **server เป็นผู้ตัดสินทุกอย่าง** client ส่งได้แค่ความตั้งใจ (`move`, `attack`, `auto`, `pickup`, `revive`, `use`, `buy`, `bot`) ห้ามให้ client ส่งตำแหน่ง ดาเมจ เงิน หรือผลลัพธ์มาเอง
- **การเดิน:** server หาเส้นทางแล้ว broadcast path ครั้งเดียว client เดินตาม path เอง ไม่ส่งตำแหน่งทุก tick
- **auto ตีมอนทำงานบน server** และทำงาน**เฉพาะตอนเชื่อมต่ออยู่** หลุดหรือปิดเกม = ตัวละครออกจากแมพทันที auto หยุด
- เดินเอง = ยกเลิกเป้าหมายและ auto
- 1 บัญชี = 1 ตัวละคร, ชื่อห้ามซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่), ชื่อ 2–16 ตัว ไทย/อังกฤษ/ตัวเลข/_
- บัญชีเดียวกันเข้าซ้ำ → server ส่ง `{t:"kicked"}` แล้วปิด socket เก่า (close code 4001)
- บันทึกเลเวล/EXP/ตำแหน่งลง D1 ทุก 30 วินาที และตอนออกจากเกม
- **หน้า HTML:** ห้ามเปลี่ยน `id` ของปุ่มและช่องกรอก (`email`, `password`, `btn-signin`, `btn-signup`, `btn-google`, `btn-guest`, `char-name`, `btn-create`, `btn-create-back`, `preview`, `gender-opts`, `hair-opts`, `eye-opts`, `link-google`, `btn-settings` ฯลฯ) เพราะ `main.ts`/`creator.ts` อ้างอิงอยู่
- **ภาพตัวละคร:** ทุกตัวต้องใช้สไตล์และขนาดเดียวกับ base (48×48, Low Top-Down) อุปกรณ์จะใช้ "ระบบผสม" คือชุดเป็นสกินทั้งตัว ส่วนอาวุธ/หมวกเป็นภาพแยกซ้อนตามจุดมือ/หัว (ไม่ใช่ paper doll เต็มรูปแบบ เพราะ AI ทำชุดแยกชิ้นให้พอดีทุกเฟรมไม่ได้)
- **เปลี่ยนสีผม/ตา (`recolor.ts`):** หาตาก่อน (พิกเซลที่ไม่ใช่ผิวและอยู่ติดตาขาว แล้วลามภายในระยะ 3 ช่อง) จากนั้นหาผม (ก้อนสีเข้มโทนน้ำเงินเทาขนาดใหญ่ที่เริ่มภายใน 12 แถวจากหัว ตัดที่เส้นเอว = เท้า − 11 แถว) ตำแหน่งวัดจากตัวละครจริงในภาพทุกครั้ง จึงใช้ได้ทั้งกรอบ 48×48 และ 64×64 และท่าที่ตัวขยับขึ้นลง (ทดสอบกับท่ายืนหายใจแล้ว)
- **ท่ายืน/ท่าเดินมีแค่ 5 ทิศ** (south, south-east, east, north-east, north) ทิศ west / south-west / north-west ใช้ภาพของ east / south-east / north-east กลับซ้าย-ขวา (`MIRROR` + `animSource()` ใน `client/src/sprites.ts`) ภาพนิ่ง base ยังใช้ครบ 8 ทิศ
- **ธีมไทย:** ห้ามทำพระพุทธรูปเป็นมอนหรือของที่ทำลายได้, ไม่ใช้พระสงฆ์เป็นอาชีพต่อสู้ (ใช้ฤๅษี/หมอยาแทน), ใช้อาณาจักรสมมติ ไม่อ้างอิงสถาบันพระมหากษัตริย์จริง, นาคาต้องดูสง่างาม
- **มอนทุกตัวต้องมีของดรอปตอนตาย** และของต้องเข้ากับตัวมอน เช่น ปูนา → ก้ามปูนา ของดรอปทุกชิ้นมีรูป ใช้รูปเดียวทั้งตอนหล่นบนพื้นและเป็นไอคอนในกระเป๋า
- **มอนตีกลับ** (ผู้ใช้ตัดสินใจ, ตอนนี้เปิดเฉพาะปูนาด้วย `retaliate: true`): โดนผู้เล่นตีแล้วจำคนตีคนแรก ไล่ตามได้ไม่เกิน 8 ช่องจากจุดที่โดนตี (`MOB_CHASE_RANGE`) เกินนั้นเลิกไล่กลับไปเดินเล่น ตีทุก 1.5 วิ ระยะ 1 ช่อง พลังโจมตีจาก `monsters.json`
- **HP ผู้เล่น:** เลือดหมด → สลบอยู่กับที่ (ตัวเป็นสีเทา ทำอะไรไม่ได้ มอนเลิกไล่ ยกเลิกเป้าหมาย/auto) ขึ้นหน้าต่างบอกสาเหตุ (ข้อความ `dead` เช่น "ปูแดง Lv.3 โจมตี") + ปุ่ม "กลับเมือง" (ข้อความ `revive`) → ฟื้นที่จุดเกิด (`SPAWN` = เมืองหลักชั่วคราว) เลือดเต็ม ไม่เสีย EXP (ข้อความ `respawn`) ออกเกมตอนสลบ = เข้าใหม่ที่จุดเกิด ไม่มีปุ่มฟื้นที่เดิม (ผู้ใช้ไม่ได้ขอ) / ไม่ได้สู้ (ไม่ตี-ไม่โดนตี) 5 วิ เลือดฟื้น 2% ของเลือดสูงสุดทุก 1 วิ
- ชื่อมอนแสดงเลเวลจาก `monsters.json` ต่อท้าย เช่น "ปูนา Lv.1" / ตีมอนตาย คนที่ตีได้ข้อความ `exp` ขึ้น "+EXP" ลอยที่จุดที่มอนตาย
- **เบี้ย (เงิน):** ตีมอนตาย คนที่ฆ่าได้เบี้ยสุ่มระหว่าง `moneyMin`–`moneyMax` ใน `monsters.json` เข้ากระเป๋าเงินทันที (ไม่หล่นพื้น) ขึ้น "+N เบี้ย" คู่กับ "+EXP" เก็บในคอลัมน์ `money` (migration 0004) Poring ไม่ให้เบี้ย
- **ยา:** `herb_potion` ยาสมุนไพร เติมเลือด 60 ราคา 10 เบี้ย (`shared/items.ts`) ซื้อได้จากหน้าเบี้ยทุกที่ (ยังไม่มี NPC ร้านค้า) กดที่ยาในกระเป๋าเพื่อกิน คูลดาวน์ 1 วิ (`POTION_COOLDOWN_MS`) เลือดเต็มกินไม่ได้ **รูปยาเป็นรูปชั่วคราว** วาดด้วย `tools/placeholder_potion.py` ได้รูปจริงให้วางทับ `art/items/herb-potion-16/32/64.png` แล้วคัดลอกไป `client/public/sprites/items/`
- **บอท (กินยาอัตโนมัติ):** เปิด/ปิด + เลือดต่ำกว่ากี่ % (10–90) ทำงานบน server ใน tick (`autoPotion`) ตั้งค่าเก็บใน localStorage ของเครื่อง ส่งให้ server ตอนเข้าแมพ/เปลี่ยนค่า ทำงานเฉพาะตอนเชื่อมต่ออยู่
- **ค่าพลัง (ระบบแบบ Ragnarok):** สเปกเต็มอยู่ที่ `docs/stat-system.md` — 6 ค่า STR/AGI/VIT/INT/DEX/LUK เริ่มที่ 5 สูงสุด 150, ได้แต้ม floor(เลเวลใหม่/5)+3 ต่อเลเวล, อัป x→x+1 ใช้ floor((x-1)/10)+2 แต้ม ไม่คืนแต้ม ยังไม่มีรีเซ็ต สูตรค่ารอง (ATK/MATK/HIT/FLEE/หลบสมบูรณ์/คริ/HP/SP/DEF/MDEF/ASPD/ฟื้น HP ทุก 6 วิ, SP ทุก 8 วิ ตอนยืนนิ่ง) อยู่ใน `derive()` และการตีใน `physicalAttack()` ของ `shared/game.ts` client ส่ง `{t:"stat_add", stat, amount}` server ตรวจแต้มเอง ข้อความ `stats` มีค่าหลัก แต้มว่าง และค่ารองทั้งหมด บันทึกคอลัมน์ str/agi/vit/int/dex/luk + stat_points (migration 0008 รีเซ็ตทุกค่าเป็น 5 และให้แต้มย้อนหลังตามเลเวล) หน้าต่างค่าพลังเปิดด้วยปุ่มสถานะหรือ Alt+A มีช่องโบนัสสีเหลือง (ว่างไว้จนกว่าจะมีอุปกรณ์) กด + ค้างเพื่อเพิ่มต่อเนื่อง จุดแดงบนปุ่มเมื่อมีแต้มเหลือ
- **แถบเมนูล่าง:** สถานะ / กระเป๋า / เบี้ย / บอท (`#menu` ใน `client/index.html`, ตรรกะใน `bindHud()` ของ `main.ts`) เปิดได้ทีละหน้า คีย์ลัด C / I / G / B (แป้นไทยตำแหน่งเดียวกัน) ปุ่มอื่น (Skills, Equipment, Class, Map ฯลฯ) ค่อยเพิ่มตอนมีระบบรองรับ
- **Poring เอาออกจากเกมแล้ว** (ผู้ใช้สั่ง) แมพเดิม (`prontera_field`) ยังเป็นชื่อจาก Ragnarok (Gravity) ต้องเปลี่ยนก่อนเปิดจริง
- **เงาที่พื้น:** วงรีสีดำโปร่งใต้เท้าผู้เล่น มอนจาก sheet และของที่ดรอป อยู่กับที่ ไม่ขยับตามตัวตอนเด้ง/เดิน

- **หน้าล็อกอิน:** มีองค์ประกอบครบแบบเว็บเกมทั่วไป แต่ต้องไม่ลอกการจัดวาง/แบรนด์ของเกมอื่น (เช่น Lumivara) ใช้ธีมทอง-รักดำ-ลายไทยของเกมเอง

## ลิงก์

- Discord: https://discord.gg/fUrrAPxnQ
- GitHub: https://github.com/tinthawong/siam-legends-online (private, branch `main`)

## แผนงาน

**ช่วงที่ 1 (ทำต่อจากนี้)**
1. เปลี่ยนมอน/แมพเป็นธีมไทย โดยอ่านค่าจาก `shared/data/monsters.json` (มอนตัวแรกในร่าง: ข้าวเหนียวปั้น, แมพแรก: ทุ่งนาริมคลอง — ยืนยันกับผู้ใช้ก่อน)
2. มอนตีกลับ + HP ผู้เล่น + ตายแล้วเกิดใหม่
3. ยา + auto กินยา (ต้องมาคู่กับข้อ 2)
4. เอฟเฟกต์การตี: ประกาย, จอสั่น, หยุดชั่ววูบ (hit-stop), ตัวเลขดาเมจสวย ๆ (โค้ดล้วน)
5. ท่ายืน/เดิน/ตีจาก PixelLab (รอภาพจากผู้ใช้)

**ช่วงที่ 2:** ไอเท็ม ดรอป กระเป๋า / ใส่อุปกรณ์ / อาชีพ + สกิล (เริ่มนักมวยกับหมอยา) / แมพจาก Tiled
**ช่วงที่ 3:** deploy ขึ้น Cloudflare จริง แล้วให้คน 10–30 คนทดสอบ
**ช่วงที่ 4:** เมือง, portal ข้ามแมพ, NPC, เควส + auto เดินนำเควส, ร้านค้า, อาชีพเพิ่ม
**ช่วงที่ 5:** แชท, ปาร์ตี้, เทรด, กิลด์, ระบบหารายได้

## ตัวเลขสมดุลเกม (มอน / เลเวล / EXP)

- แหล่งข้อมูลหลักคือ `balance/siam-legends-balance.xlsx` (ชีต ตั้งค่า / เลเวล / มอน / สายเลี้ยงตัว) ทุกค่าเป็นสูตร แก้ที่ชีต "ตั้งค่า"
- เกมอ่านจาก `shared/data/levels.json`, `shared/data/monsters.json` และ `shared/data/equipment.json` (ชีต "อุปกรณ์") ซึ่งสร้างด้วย `python tools/export_balance.py` (ห้ามแก้ JSON ด้วยมือ ให้แก้ Excel แล้ว export ใหม่)
- ชีต "สายเลี้ยงตัว" มี 3 สาย (สายตี STR/DEX, สายหลบ AGI/STR, สายอึด VIT/STR) คำนวณค่าพลังตามเลเวล ชีต มอน มีคอลัมน์ AGI/DEX/HIT/FLEE/DEF%/DEF เสริม/MDEF% (P–V), "ตีกี่ทีตาย" (N) คิดจากสายตี และ "มอนตีกี่ทีผู้เล่นตาย" (W) — สร้างครั้งเดียวด้วย `tools/add_stat_sheets.py` (รันแล้ว ไม่ต้องรันซ้ำ)
- ค่าเริ่มต้น: เลเวลสูงสุด 100, 400 ชั่วโมงถึงเลเวลสูงสุด, มอนเลเวลเท่ากันตี 4 ทีตาย, EXP ขึ้นเลเวล = 15 × L^3
- ผู้ใช้ตัดสินใจ**ไม่ใช้ข้อมูลจาก MapleStory** (เรื่องสิทธิ์ และระบบตีทีละตัวของเราต่างจากเขา) ตัวเลขทั้งหมดคำนวณเอง
- เกมใช้ EXP ขึ้นเลเวลจาก `levels.json` (15 × L³) และค่ามอนจาก `monsters.json` แล้ว · เวลาต่อการฆ่าในชีตเลเวลใช้ความเร็วตีของสายตี (tools/kill_time_from_build.py)
- เงินในเกมตั้งชื่อชั่วคราวว่า "เบี้ย"

## งานภาพ (ไฟล์และสถานะ)

- ภาพต้นฉบับจาก PixelLab เก็บที่ `art/pixellab/<ชื่อภาษาอังกฤษ>/` (ตั้งชื่อโฟลเดอร์และไฟล์เป็นภาษาอังกฤษเสมอ) แต่ละชุดมี `metadata.json` บอกทิศและเฟรม ถ้า `animations` ว่าง แปลว่ามีแค่ภาพนิ่ง 8 ทิศ
- ภาพมอนเก็บที่ `art/monsters/<ชื่อภาษาอังกฤษ>/`
- **ของประดับ/วัตถุในแมพ (ChatGPT):** sheet 4×4 หนึ่งช่องหนึ่งชิ้น ChatGPT มักวาดทุกชิ้นเต็มช่องเท่ากัน จึงตัดด้วย `tools/slice_props.py` ที่กำหนดความกว้างในเกมทีละชิ้น (ตัวละครกว้างราว 22px) ได้ `<ชื่อ>.png`, `props.json` (ขนาด, จุดยึดกึ่งกลางฐาน, ความกว้างเงา) และ `preview.png`
  - ชุดแรก `art/props/set1/sheet.png` (ใช้ในแมพแล้ว ไฟล์เกมที่ `client/public/sprites/props/set1/`): `python tools/slice_props.py art/props/set1/sheet.png art/props/set1 --cols 4 --rows 4 --names flowers-yellow,flowers-pink,tall-grass,fern,bush,rock,rocks-3,mossy-boulder,seashell,starfish,driftwood,coconut,beach-grass,rice-straw,clay-jar,lotus --widths 14,14,14,18,24,14,18,28,8,9,18,10,14,14,14,18`
  - ชุดที่ 2 (ต้นไม้ใหญ่) `art/props/set2/sheet.png`: `python tools/slice_props.py art/props/set2/sheet.png art/props/set2 --cols 3 --rows 2 --names banyan,coconut-palm,sugar-palm,coconut-palm-leaning,bamboo,hibiscus-bush --widths 112,64,56,68,52,36` (ต้นมะพร้าวต้องสูงราว 2 เท่าของตัวละคร) ใช้ในแมพแล้ว: ไทรบนหญ้า, มะพร้าวบนทรายริมคลอง, ตาลริมนา, ไผ่/ชบาบนหญ้า ต้นไม้ขวางทางเฉพาะช่องฐาน วางห่างของอื่นตามระยะ (`space` ใน `scatter`)
  - ชุดที่ 3 (สิ่งก่อสร้างหมู่บ้าน) `art/props/set3/sheet.png`: `python tools/slice_props.py art/props/set3/sheet.png art/props/set3 --cols 3 --rows 3 --names stilt-house,stilt-hut,sala,market-stall,fish-rack,village-gate,pier,longtail-boat,dragon-jars --widths 104,80,80,52,56,72,40,88,40` (สะพานปลาเป็นชิ้นสั้น 40×40 วางต่อกันแนวตั้งหลายชิ้นเป็นสะพานยาว — ยังไม่ได้ใช้ เพราะคลองในแมพแรกเป็นแนวตั้ง)
  - ชิ้นในแมพบ้านปากอ่าววางด้วยมือทีละชิ้นใน `shared/map.ts` (ไม่สุ่ม) ตามภาพตัวอย่างของผู้ใช้ (ภาพตัวอย่าง 1536px ≈ 48 ช่อง จึงอ่านพิกัดจากภาพได้ตรง ๆ ÷32)
  - ชื่อและแถบ HP ของตัวละคร/มอนอยู่ชั้นบนสุด (`oc` ใน GameScene) ไม่โดนต้นไม้หรือหลังคาบัง ส่วนตัวละครเรียงลำดับตามแกน y กับของประดับ (เดินหลังบ้าน/ต้นไม้ถูกบังได้)
  - ชุดของประดับลงทะเบียนใน `PROP_SETS` (`shared/map.ts`) ไฟล์เกมที่ `client/public/sprites/props/<ชุด>/`
  - ชุดที่ 4 (ย่านบ้านเรือน/ลานกลาง) `art/props/set4/sheet.png`: `python tools/slice_props.py art/props/set4/sheet.png art/props/set4 --cols 4 --rows 4 --names fence-wood,fence-bamboo,fence-corner,fence-gate,clothesline,firewood,well,potted-plant,bench,quest-board,lantern-post,baskets,barrel,crate,stepping-stone,signpost --widths 32,32,28,32,44,28,40,22,36,36,24,28,18,20,18,26`
  - ชุดที่ 5 (ท่าเรือ/นาข้าว/ชายหาด) `art/props/set5/sheet.png`: `python tools/slice_props.py art/props/set5/sheet.png art/props/set5 --cols 4 --rows 4 --names net-rack,net-pile,fish-trap,rowboat-upturned,oars,rope-coil,buoys,anchor,scarecrow,ox-cart,field-hut,water-wheel,shore-rocks,tide-pool,hammock,morning-glory --widths 40,30,20,44,20,20,26,28,30,52,48,44,40,36,40,24`
  - ชุดที่ 6 (ต้นไม้/ป่า) `art/props/set6/sheet.png`: `python tools/slice_props.py art/props/set6/sheet.png art/props/set6 --cols 4 --rows 4 --names mango-tree,jackfruit-tree,tamarind-tree,rain-tree,golden-shower,flame-tree,frangipani,indian-almond,banana-tree,papaya-tree,areca-palm,round-tree,tall-forest-tree,young-tree,dense-shrub,shrub-cluster --widths 52,52,56,64,52,56,44,56,40,36,36,48,36,36,40,36` (ชื่อและความกว้าง Claude ตั้งเอง ปรับได้)
  - `slice_props.py` แยกชิ้นตามก้อนภาพ (connected components) ไม่ใช่แถวว่าง จึงใช้ได้แม้วัตถุในแถวบนกับแถวล่างติดกัน ชิ้นเล็กที่หลุดออกมาติดไปกับก้อนที่ใกล้ที่สุด
  - ถ้าชิ้นแตะกันบาง ๆ (ปลายใบไม้ประดับฐาน) จะกัดขอบ mask ทีละชั้นจนแยกครบแล้วขยายกลับ (erosion + BFS) ถ้ายังไม่ได้จึงใช้วิธีแบ่งตามตาราง (เลื่อนเส้นแบ่งไปจุดที่ตัดผ่านภาพน้อยที่สุด ±25% และลบจุดเล็กที่หลงมา) — ผลกับชุด 1–3 เหมือนเดิมทุกชิ้น
  - วาดเงาด้วยโค้ด: วงรีสีดำโปร่งแสง (alpha ~70/255) ใต้จุดยึดของวัตถุ ตัวละคร และมอนทุกตัว เรียงลำดับการวาดตามแกน y
- ลายพื้นเก็บที่ `art/tiles/` (grass, sand, water, dirt, paddy ขนาด 64×64 ต่อกันไร้รอยต่อ ผู้ใช้เลือกสีสดตามต้นฉบับ ภาพต้นฉบับจาก ChatGPT ที่ `art/tiles/source/`) ขอบระหว่างพื้นทำให้โค้งด้วย noise, ทรายริมน้ำเข้มขึ้น, ฟองคลื่นสีขาวที่ขอบน้ำ, เส้นหญ้าเข้ม 1px ที่ขอบหญ้า
  - ในเกมใช้ครบทั้ง 5 แบบแล้ว (ไฟล์เกม `client/public/sprites/tiles/`) ผังพื้นอยู่ใน `shared/map.ts` วาดด้วย `client/src/mapRender.ts` (หิน/ต้นไม้ที่เคยวาดด้วยโค้ดเลิกใช้ ใช้ของประดับแทน)
- รูปไอเท็ม/ของดรอปเก็บที่ `art/items/` เป็น pixel art ขนาด 32×32 (มีสำรอง 64×64 ได้) พื้นโปร่งใส
  - มีแล้ว: `crab-claw-16.png`, `crab-claw-32.png`, `crab-claw-64.png` (ก้ามปูนา; 16 ย่อจาก 64 แบบลงตัว 4:1), `red-crab-claw-16/32/64.png` (ก้ามปูแดง, ต้นแบบ `red-crab-claw-source.png`)
  - ของบนพื้นหายเองหลัง 60 นาที (`GROUND_ITEM_MS`, ผู้ใช้กำหนด) ใครกดเก็บก็ได้ ต้องกดที่ของเอง (auto ไม่เก็บให้) ตอนนี้ปูนาดรอปก้ามปูนา 100%
  - ในเกม: หล่นบนพื้นใช้ `<icon>-16.png` (ผู้ใช้ขอให้เล็กลง, พื้นที่กดยังเท่า 1 ช่อง) ในกระเป๋าใช้ `<icon>-64.png` วางไฟล์เกมที่ `client/public/sprites/items/` และลงทะเบียนใน `shared/items.ts`
- สไตล์ท้าย prompt ที่ต้องใช้เหมือนกันทุกชิ้น:
  - ตัวละคร: `stylized anime chibi hero, large head about 40% of total height, sharp anime eyes with bright highlights, smooth soft shading, colored darker outlines instead of pure black, vivid saturated colors`
  - มอน: `cute chibi monster, big expressive eyes with bright highlights, smooth soft shading, colored darker outlines instead of pure black, vivid saturated colors`
  - ไอเท็ม: `centered, fills most of the frame, pixel art, clean pixels, limited color palette, cute stylized game item, colored darker outlines instead of pure black, vivid saturated colors, transparent background, no text`
- ห้ามย่อ/ขยาย pixel art ด้วยอัตราส่วนที่ไม่ลงตัว (เช่น 48→32) ในเกม เพราะพิกเซลจะขาด ให้สร้างภาพใหม่ในขนาดที่ต้องการแทน
- **ท่ายืน (idle) ผู้เล่น:** มีแล้วเฉพาะทิศใต้ ชาย/หญิง 9 เฟรม 200ms/เฟรม กรอบ 64×64 (ตัวเลื่อน +8px จาก base, เท้าบรรทัด 53) ต้นฉบับที่ `art/pixellab/base-<เพศ>-idle/` ไฟล์เกมที่ `client/public/sprites/base-<เพศ>/idle-south/0..8.png` รอ export ทิศ south-east, east, north-east, north ได้มาแล้ว: วางไฟล์ `idle-<ทิศ>/` แล้วเพิ่มทิศใน `IDLE_DIRS` (`client/src/sprites.ts` ใช้ร่วมกันทั้งเกมและหน้าสร้างตัวละคร) — ยืนนิ่ง/หมุนตัวอย่างมาทิศที่มี idle (หรือทิศกระจก) = เล่น animation นอกนั้นใช้ภาพนิ่ง
  - ปลายผมยาวที่ต่ำกว่าเส้นเอว (ข้างมือ) ไม่ถูกเปลี่ยนสี เป็นแบบนี้ทั้งภาพนิ่งและ idle
- **ท่าเดิน:** ยังไม่มีไฟล์
- **มอนสร้างด้วย ChatGPT** (ผู้ใช้ตัดสินใจ): ใช้ทิศเดียว (หันหน้าเข้ากล้อง) ไม่หันตามทิศที่เดิน ขั้นตอนคือ สร้างตัวมอนภาพเดียว → ใช้ภาพนั้นเป็นต้นแบบสร้าง sheet 4 คอลัมน์ × 3 แถว (walk, attack, death) → ตัดด้วย `tools/slice_sheet.py` (ต้องมี Pillow: `pip install pillow`)
  - ตัวอย่าง: `python tools/slice_sheet.py art/monsters/rice-crab/sheet.png art/monsters/rice-crab --cols 4 --rows 3 --names walk,attack,death --width 32 --colors 40`
  - ได้ไฟล์ `<ท่า>_<ลำดับ>.png`, `preview.png` และ `sheet.json` (ขนาดเฟรม, จุดยึดที่เท้า, ลำดับเฟรม, ms ต่อเฟรม, loop)
  - ถ้าชุดใหม่ของมอนตัวเดิมมีท่าแรกกว้าง/แคบไม่เท่าชุดเก่า ต้องลองหลายค่า `--width` แล้ววางเทียบกระดอง/ลำตัวกับเฟรมชุดเก่าด้วยตา (การนับตามสีไม่แม่น เพราะสีแต่ละชุดจาก ChatGPT ต่างกันเล็กน้อย)
  - `--ref <ลำดับเฟรม>` ใช้เฟรมท่าปกติวัดขนาด (ค่าเริ่มต้นคือเฟรม 0) ถ้าเฟรมแรกไม่ใช่ท่าปกติ เช่นท่า hit ที่ปูหดตัว ต้องใช้ `--ref 2`
  - sheet แต่ละชุดให้ออกคนละโฟลเดอร์ เพราะสคริปต์เขียน `sheet.json` ทับ (ขนาดเฟรมและจุดยึดของแต่ละชุดอาจต่างกัน วางด้วยจุดยึดที่เท้าเสมอ)
  - ท่ายืนของมอนทำด้วยโค้ด (ขยับขึ้นลง) ใช้เฟรมแรกของ walk เป็นภาพยืน
  - ท่าโดนตี (hit) เล่นพร้อมกะพริบขาวด้วยโค้ด ไม่ขัดท่า attack ที่กำลังเล่นอยู่
  - **ใส่เข้าเกม:** คัดลอก `<ท่า>_*.png` + `sheet.json` ไป `client/public/sprites/monsters/<ชื่อ>/` แล้วตั้ง `sheet: "<ชื่อ>"` ใน `MOBS` (`shared/game.ts`) ชุดท่าเพิ่มที่ตัดแยกโฟลเดอร์ให้คัดลอกไป `client/public/sprites/monsters/<ชื่อ>/<ชุด>/` และใส่ `sheetParts: ["<ชุด>"]` — GameScene โหลด sheet.json สร้าง animation ตาม ms ต่อเฟรม วางจุดยึดเท้าระดับเดียวกับเท้าผู้เล่น เดิน = walk, ยืน = walk_0 + ขยับขึ้นลง, โดนตี = เล่น hit (ถ้ามี) + กะพริบขาว แล้วกลับท่าเดิม, ตาย = เล่น death จนจบแล้วจางหาย (attack ยังไม่ได้ใช้ เพราะมอนยังไม่ตีกลับ) แต่ละท่าตั้งจุดยึดเท้าตาม sheet.json ของชุดตัวเอง
- **ปูนา (rice-crab):** ใช้ชุดจาก ChatGPT แทนตัวจาก PixelLab (ตัวเก่า 48px ใหญ่เกินไป เลิกใช้ — ต้นฉบับยังเก็บที่ `art/pixellab/rice-field-crab/`) ภาพต้นแบบ `art/monsters/rice-crab/source.png` ภาพนิ่ง 32×32 `art/monsters/rice-crab/rice-crab.png` และ sheet ต้นฉบับ 12 เฟรมที่ `art/monsters/rice-crab/sheet.png` ตัวกว้าง 32px ในเฟรม 35×32 จุดยึด (17,30) และท่าโดนตี 3 เฟรมที่ `art/monsters/rice-crab/hit-sheet.png` (ตัดด้วย `--cols 3 --rows 1 --names hit --width 32 --ref 2 --colors 40 --ms hit=80` ออกไปที่ `art/monsters/rice-crab/hit` ได้เฟรม 35×28 จุดยึด (17,26))
  - ท่ายืนประจำตัว (โบกก้าม) 6 เฟรม 150ms ที่ `art/monsters/rice-crab/idle-sheet.png` (ตัดด้วย `--cols 6 --rows 1 --names idle --width 33 --colors 40 --ms idle=150` ออกไปที่ `art/monsters/rice-crab/idle` ได้เฟรม 35×31 จุดยึด (18,29) — ใช้ 33 ไม่ใช่ 32 เพราะเฟรมแรกกางก้ามกว้างกว่าท่าเดิน เทียบด้วยตาแล้วกระดองเท่ากันที่ 33) มีท่า idle แล้วเกมเล่นท่านี้ตอนยืนแทนการขยับขึ้นลงด้วยโค้ด
  - อยู่ในเกมแล้ว (ทดสอบ): `mud_crab` ใน `shared/game.ts` เกิด 8 ตัวในแมพแรกคู่กับ Poring ค่าพลังจาก `monsters.json` (mob003) ยังไม่มีของดรอป

- **ปูแดง (red-crab, mob039):** มอนจาก ChatGPT Lv.3 ในทุ่งนาริมคลอง (แถวที่ 43 ท้ายชีต มอน, ตัวคูณ HP 1.3 / EXP 1.15 → HP 81, ATK 10, EXP 43) ตีกลับเหมือนปูนา เกิด 6 ตัว ดรอปก้ามปูแดง 100%
  - หน้าโกรธ ภาพตัวหลัก `art/monsters/red-crab/red-crab-source.png` (= `source.png`)
  - sheet หลัก 4×4 (walk, attack, hit, death) ตัดด้วย `--cols 4 --rows 4 --names walk,attack,hit,death --width 35 --colors 40 --ms walk=120,attack=90,hit=80,death=140` (ใช้ 35 เพราะก้ามใหญ่ ที่ 35 กระดองเท่าปูนา) ได้เฟรม 38×30 จุดยึด (19,29)
  - ท่ายืนประจำตัว (ฮึดฮัด หนีบก้าม มีไอพ่นเหนือหัวเฟรม 3–4) 6 เฟรมที่ `art/monsters/red-crab/idle-sheet.png` ตัดด้วย `--cols 6 --rows 1 --names idle --width 33 --colors 40 --ms idle=150` ออกไปที่ `art/monsters/red-crab/idle` ได้เฟรม 36×34 จุดยึด (18,33) (33 ตรงกับขนาดชุดท่าหลักที่ 35)
  - มอนใหม่ให้เพิ่มแถว**ท้าย**ชีต มอน เสมอ (id มอนนับจากลำดับแถว แทรกกลางจะทำให้ id ตัวอื่นเลื่อน)

## มอน / NPC ที่เพิ่มแล้ว (ภาพจาก ChatGPT, ทิศเดียว, 5 ท่า walk/attack/hit/death/idle)

| id ในเกม | ชื่อ | ตารางสมดุล | โซน | ดรอป | สถานะ |
|---|---|---|---|---|---|
| `mud_crab` | ปูนา | mob003 Lv1 | นาข้าว ×10 | ก้ามปูนา | ในเกม |
| `red_crab` | ปูแดง | mob039 Lv3 | ชายหาด ×8 | ก้ามปูแดง | ในเกม |
| `lotus_frog` | กบบัว | mob005 Lv5 (เดิมชื่อกบเขียว) | สระบัว ×6 | ดอกบัว `lotus` | ในเกม |
| `scarecrow` | หุ่นไล่กาเดินได้ | mob007 Lv8 | นาข้าวฝั่งตะวันออก ×4 | หมวกฟาง `straw_hat` | ในเกม |
| `grasshopper` | ตั๊กแตนเคียว | mob040 Lv10 (แถวท้ายชีต) | ข้างกังหันน้ำ ×5 | เคียว `sickle` | ในเกม |
| `octopus` | หมึกหมวกเหล็ก | mob041 Lv12 (แถวท้ายชีต) | ท่าเรือ ×5 | หมวกเหล็ก `iron_helmet` | ในเกม ท่าแยก 4 ชุด: sheet (walk,attack 4×2), hit/, death/, idle/ |

- จำนวนและโซนเกิดมาจาก `spawns` ใน layout (`ZONES` ใน `shared/map.ts`) มอนที่ไม่มีใน spawns ไม่เกิด ค่าพลังจาก `monsters.json`

- ตัดด้วย `slice_sheet.py --width 32 --colors 40 --ms walk=120,attack=90,hit=80,death=140,idle=150` (sheet 4×4 + idle-sheet 4×1 → idle/) ต้นฉบับ `art/monsters/<ชื่อ>/sheet.png`, `idle-sheet.png`
- ไอคอนไอเท็มใหม่: ย่อจากภาพต้นฉบับ (`<ชื่อ>-source.png`) ให้พอดี 60px ในกรอบ 64 แล้วได้ 32/16 แบบลงตัว
- ไอเท็มที่ไม่มีภาพ (`icon` ว่าง) กระเป๋าแสดงชื่อแทน: `sai_sin` สายสิญจน์ (รางวัลเควส q001 ยังไม่มีภาพ/ค่าพลัง)
- **NPC:** พระ (`art/npcs/monk/` idle 4 เฟรม --width 30 --ms idle=400) ตัดแล้ว ยังไม่ได้ใส่ในเกม ผู้ใหญ่ทองดียังไม่มีภาพ (ใช้ภาพพระเปลี่ยนสีชั่วคราว) ข้อมูล `shared/data/npcs.json`, `quests.json` — ระบบเควสรอ `docs/quest-system.md`
- **กติกาเควส:** พระให้เฉพาะเควสที่ไม่ฆ่าสัตว์ เควสล่ามอนให้ NPC อื่นเป็นคนให้

## เครื่องมือจัดภาพจาก ChatGPT (ต้องมี Pillow, numpy, scipy)

- `tools/fix_checker.py input.png output.png` ลบพื้นหลังลายตารางหมากรุกปลอม (เทา/ขาว) ที่ ChatGPT วาดติดมา ไล่เติมจากขอบภาพ ลบเฉพาะสีเทาอ่อน/ขาวที่ต่อกับขอบ (ตาขาว แสงวาวข้างในเส้นขอบไม่โดน) ภาพโปร่งใสอยู่แล้วจะคัดลอกไปเฉย ๆ
- `tools/regrid_sheet.py` จัดเรียง sheet ที่ผิดสูตร (จำนวนแถว/คอลัมน์ไม่ตรง หรือสองท่าในแถวเดียว) ให้เป็นตารางที่ `slice_sheet.py` ตัดได้ ภาพต้องโปร่งใสก่อน
  - ดูก่อนว่าแต่ละแถวเจอกี่ตัว: `python tools/regrid_sheet.py raw.png --rows 5 --list`
  - หยิบแถว 2–5 (แถวละ 4 ตัวแรก) ทำ sheet 4×4: `python tools/regrid_sheet.py raw.png sheet.png --rows 5 --layout "2.1-4/3.1-4/4.1-4/5.1-4"`
  - หยิบแถวแรกทำ idle-sheet: `python tools/regrid_sheet.py raw.png idle-sheet.png --rows 5 --layout "1.1-4"`
  - `--layout`: แถวผลลัพธ์คั่นด้วย `/` แต่ละแถวคือ "แถว.ตัวที่" คั่นด้วย `,` ใช้ช่วง 1-4 ได้ ขีดเอฟเฟกต์เล็ก ๆ ติดไปกับตัวที่ใกล้ที่สุด

## วิธีส่งภาพใหม่ (ผู้ใช้)

วางไฟล์ใน `art/_incoming/` (หรือ Downloads) ตั้งชื่อ `<ชื่อ>_<ไฟล์>` เช่น `scarecrow_sheet.png`, `scarecrow_idle-sheet.png`, `monk_idle-sheet.png`, `item_straw-hat.png` ชื่อภาษาอังกฤษตัวเล็กคั่นด้วย `-` แล้วบอกว่าเป็นอะไร เลเวล/โซน/ดรอป Claude ย้าย ตัด ใส่เกม และ push ให้

## หลักการจัดวางแมพ (ผู้ใช้ต้องการให้ทุกแมพเป็นธีมเดียวกัน ห้ามวางของกระจายมั่ว)

- แบ่งแมพเป็นโซนตามหน้าที่ ของแต่ละชนิดอยู่ในโซนที่มีเหตุผล ไม่วางของกระจายสุ่มทั่วแมพ
- ถนนดินเส้นหลักเชื่อมทุกโซน เริ่มจากทางเข้า/ทางออกของแมพ ผู้เล่นเดินตามถนนแล้วเจอทุกจุดสำคัญ
- ของขึ้นเป็นกลุ่ม (บ้าน + โอ่ง + ดอกไม้, ต้นไม้ + พุ่มไม้ + ก้อนหิน) ไม่วางเดี่ยว ๆ ห่างกัน
- ของชิ้นใหญ่ (ต้นไทร, ศาลา) เป็นจุดเด่นของแต่ละโซน ใช้ต้นไม้/ไผ่วางตามขอบแมพเป็นกรอบ
- แมพบ้านปากอ่าว (ทำแล้ว): ทางเข้าหมู่บ้าน (เหนือ: ประตูไม้ + พุ่มไม้ข้างประตู), ย่านบ้านเรือน (ตะวันตก: เรือนใต้ถุนสูง, กระท่อม, โอ่งมังกร), ลานกลาง (ต้นไทร, ศาลา, แผงขายของ = จุดเกิด/เมืองหลัก), นาข้าว (ตะวันออกเฉียงเหนือ: ต้นตาลเรียงคันนา, ฟ่อนข้าว, ที่เกิดปูนา), ท่าเรือ (ตะวันตกเฉียงใต้: สะพานปลา, เรือหางยาว, ราวตากปลา), ชายหาด (ตะวันออกเฉียงใต้: มะพร้าว, เปลือกหอย, ขอนไม้, ที่เกิดปูแดง) ทะเลตลอดขอบใต้
- มอนเกิดและเดินเล่นเฉพาะในโซนของตัวเอง (`zone` ใน `MOBS` + `ZONES` ใน `shared/map.ts`) ไล่ตามผู้เล่นออกนอกโซนได้

## ไอเดียที่คุยไว้แล้ว

- **เผ่า:** มนุษย์ (สมดุล), ยักษ์ (HP/พลังโจมตีสูง ช้า), นาคา (ผิวฟ้า เกล็ด ครีบ มีขา ไม่ใช่หางปลา; เวทแรง) ใช้โครงร่างเดียวกัน เปลี่ยนสีผิวด้วยโค้ด + ภาพส่วนเสริมบนหัว
- **อาชีพที่วางไว้:** นักมวย, หมอยา, ฤๅษี, พรานป่า (ช่วงแรก) และอื่น ๆ เช่น นักกระบี่กระบอง, หมอผี, นักเชิดหนังตะลุง, นักดนตรีไทย
- **ภาพเอฟเฟกต์:** ใช้ AI สร้างภาพนิ่งชิ้นเดียว (วงยันต์, รอยฟัน, ประกาย, กลีบบัว) แล้วใช้โค้ดทำให้เคลื่อนไหว + blend แบบ ADD
- **โลโก้ปัจจุบันเขียนว่า "SIAM LEGEND"** (ไม่มี S) ยังไม่ได้ตัดสินใจว่าจะเปลี่ยนชื่อหรือทำโลโก้ใหม่
