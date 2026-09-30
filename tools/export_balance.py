"""แปลง balance/siam-legends-balance.xlsx เป็นไฟล์ข้อมูลเกม shared/data/*.json

วิธีใช้: แก้ตัวเลขใน Excel แล้วกด Save ใน Excel (ให้ Excel คำนวณสูตรใหม่ก่อน) จากนั้นรัน
    python tools/export_balance.py
ต้องมี openpyxl:  pip install openpyxl
"""
import json
from pathlib import Path
from openpyxl import load_workbook

root = Path(__file__).resolve().parent.parent
wb = load_workbook(root / "balance" / "siam-legends-balance.xlsx", data_only=True)
st, lv, mo = wb["ตั้งค่า"], wb["เลเวล"], wb["มอน"]

max_level = int(st["C6"].value)
rows = range(5, 5 + max_level)
if lv["B5"].value is None:
    raise SystemExit("ไม่มีค่าที่คำนวณแล้วในไฟล์ — เปิดใน Excel แล้วกด Save ก่อน")

levels = {
    "maxLevel": max_level,
    "expToNext": [int(lv[f"B{r}"].value) for r in rows],
    "playerAtk": [float(lv[f"D{r}"].value) for r in rows],
    "playerHp": [int(lv[f"E{r}"].value) for r in rows],
}

monsters = []
r = 5
while mo[f"A{r}"].value:
    monsters.append({
        "id": f"mob{r - 4:03d}",
        "name": mo[f"A{r}"].value,
        "map": mo[f"B{r}"].value,
        "level": int(mo[f"C{r}"].value),
        "boss": mo[f"D{r}"].value == "บอส",
        "aggressive": mo[f"E{r}"].value == "ตีก่อน",
        "hp": int(mo[f"H{r}"].value),
        "def": int(mo[f"I{r}"].value),
        "atk": int(mo[f"J{r}"].value),
        "exp": int(mo[f"K{r}"].value),
        "moneyMin": int(mo[f"L{r}"].value),
        "moneyMax": int(mo[f"M{r}"].value),
        # ค่าพลังแบบ Ragnarok (docs/stat-system.md) — def เดิมยังส่งออกแต่เกมไม่ใช้แล้ว
        "agi": int(mo[f"P{r}"].value or 0),
        "dex": int(mo[f"Q{r}"].value or 0),
        "hit": int(mo[f"R{r}"].value or 0),
        "flee": int(mo[f"S{r}"].value or 0),
        "defPct": int(mo[f"T{r}"].value or 0),
        "defBonus": int(mo[f"U{r}"].value or 0),
        "mdefPct": int(mo[f"V{r}"].value or 0),
    })
    r += 1

# อุปกรณ์ (ชีต "อุปกรณ์"): ช่องใส่ใช้ key ของตารางช่อง, ค่าพลังโบนัสว่าง = 0
eq = wb["อุปกรณ์"]
slot_key = {}
r = 9
while eq[f"A{r}"].value and eq[f"B{r}"].value:
    slot_key[eq[f"A{r}"].value] = eq[f"B{r}"].value
    r += 1
equipment = []
r = 23
while eq[f"A{r}"].value:
    equipment.append({
        "item": eq[f"A{r}"].value,
        "slot": slot_key[eq[f"C{r}"].value],
        "level": int(eq[f"E{r}"].value),
        "atk": int(eq[f"F{r}"].value or 0),
        "defPct": int(eq[f"G{r}"].value or 0),
        "mdefPct": int(eq[f"H{r}"].value or 0),
        "bonus": {k: int(eq[f"{c}{r}"].value or 0) for k, c in zip(["str", "agi", "vit", "int", "dex", "luk"], "IJKLMN")},
    })
    r += 1

out = root / "shared" / "data"
out.mkdir(parents=True, exist_ok=True)
(out / "levels.json").write_text(json.dumps(levels, ensure_ascii=False, indent=1), encoding="utf-8")
(out / "monsters.json").write_text(json.dumps(monsters, ensure_ascii=False, indent=1), encoding="utf-8")
(out / "equipment.json").write_text(json.dumps(equipment, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"เขียน levels.json ({max_level} เลเวล), monsters.json ({len(monsters)} ตัว) และ equipment.json ({len(equipment)} ชิ้น) แล้ว")
