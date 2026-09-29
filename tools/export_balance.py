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
    })
    r += 1

out = root / "shared" / "data"
out.mkdir(parents=True, exist_ok=True)
(out / "levels.json").write_text(json.dumps(levels, ensure_ascii=False, indent=1), encoding="utf-8")
(out / "monsters.json").write_text(json.dumps(monsters, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"เขียน levels.json ({max_level} เลเวล) และ monsters.json ({len(monsters)} ตัว) แล้ว")
