"""(ใช้ครั้งเดียว) HP มอนคิดจากดาเมจจริงของผู้เล่นสายตี (ชีตสายเลี้ยงตัว) แทนพลังโจมตีสูตรเก่าในชีตเลเวล
เดิม HP = ตีกี่ทีตาย × ดาเมจสูตรเก่า (Lv1 ATK 12) แต่ระบบค่าพลังใหม่ Lv1 ATK 7 และตีพลาดได้ → ปูนาต้องตี 10 ที
ใหม่ HP = ตั้งค่า!C20 (ตีกี่ทีตาย) × ดาเมจเฉลี่ยต่อทีของสายตีเลเวลเท่ามอน (รวมคริ/DEF มอน) × ตัวคูณ HP × บอส
ผู้เล่นตีมอนไม่พลาด (ยกเว้นมอนเลเวลสูงกว่า 30 เลเวลขึ้นไป) จึงไม่คิดโอกาสโดน · คอลัมน์ N (ตีกี่ทีตาย) ใช้ดาเมจเฉลี่ยเดียวกัน
หลังรันต้องให้ Excel คำนวณแล้ว Save ก่อน export
"""
from pathlib import Path
from openpyxl import load_workbook

root = Path(__file__).resolve().parent.parent
path = root / "balance" / "siam-legends-balance.xlsx"
wb = load_workbook(path)
mo = wb["มอน"]


def per_hit(r: int) -> str:
    """ดาเมจเฉลี่ยต่อทีของสายตีเลเวลเท่ามอน: คริ (×1.4 ไม่หัก DEF) + ไม่คริ (หัก DEF % และ DEF เสริม) ไม่มีตีพลาด"""
    lv = f"MIN(C{r},100)"
    crit = f"INDEX(สายเลี้ยงตัว!$H$5:$H$104,{lv})"
    atk = f"INDEX(สายเลี้ยงตัว!$E$5:$E$104,{lv})"
    return f"({crit}/100*{atk}*1.4+(1-{crit}/100)*MAX(1,{atk}*(1-T{r}/100)-U{r}))"


r = 5
n = 0
while mo[f"A{r}"].value:
    mo[f"H{r}"] = f'=ROUND(ตั้งค่า!$C$20*{per_hit(r)}*F{r}*IF(D{r}="บอส",ตั้งค่า!$C$29,1),0)'
    mo[f"N{r}"] = f"=ROUNDUP(H{r}/{per_hit(r)},0)"
    r += 1
    n += 1
wb.save(path)
print(f"เปลี่ยนสูตร HP มอน {n} ตัวแล้ว — ให้ Excel คำนวณแล้ว Save ก่อน export")
