"""วาดพื้นแมพเป็นภาพเดียว (ทะเลไล่เฉด คลื่น ปะการังใต้น้ำ หาดทราย)

ตัวอย่าง:
    python tools/bake_sea.py maps/ban-pak-ao.layout.json client/public/maps/ban-pak-ao/ground.png

ใช้ลายพื้นใน art/tiles/ (water-shallow, water, water-deep, sand, grass, dirt)
ต้องมี Pillow, numpy, scipy
"""
import json, numpy as np, random
from PIL import Image, ImageFilter
from scipy import ndimage
random.seed(4); np.random.seed(4)
import argparse
ap=argparse.ArgumentParser(description='วาดพื้นแมพทั้งแผ่น: ทะเลไล่เฉดตื้น-ลึก ฟองคลื่น แนวปะการัง หาดทราย')
ap.add_argument('layout'); ap.add_argument('out'); ap.add_argument('--tiles',default='art/tiles')
ap.add_argument('--seed',type=int,default=4)
ap.add_argument('--tint',type=float,default=0.1,help='น้ำหนักสีไล่เฉดทับลายน้ำ (0 = ใช้สีลายเต็มที่) เดิม 0.4')
A=ap.parse_args(); random.seed(A.seed); np.random.seed(A.seed)
L=json.load(open(A.layout,encoding='utf-8'))
T=L['tile']; G=L['terrain']; W,H=L['width']*T,L['height']*T
# หน้ากากน้ำความละเอียดพิกเซล: ขยายตาราง แล้วเบลอ + noise ให้ชายฝั่งโค้งธรรมชาติ
grid=np.array([[1.0 if c=='W' else 0.0 for c in r] for r in G])
m=np.array(Image.fromarray((grid*255).astype(np.uint8)).resize((W,H),Image.BICUBIC)).astype(float)/255
def noise(scale,amp):
    n=np.random.rand(H//scale+2,W//scale+2)
    return np.array(Image.fromarray((n*255).astype(np.uint8)).resize((W+scale*2,H+scale*2),Image.BICUBIC)).astype(float)[:H,:W]/255*amp
m=ndimage.gaussian_filter(m,6)+noise(24,0.35)-0.175
water=m>0.5
# ระยะห่างจากฝั่ง (px)
d=ndimage.distance_transform_edt(water)
dl=ndimage.distance_transform_edt(~water)      # ระยะจากน้ำ ฝั่งแผ่นดิน
def tex(name):
    t=np.array(Image.open(f'{A.tiles}/{name}.png').convert('RGB')).astype(float)
    return np.tile(t,(H//t.shape[0]+1,W//t.shape[1]+1,1))[:H,:W]  # ลายขนาดใดก็ได้ (น้ำใช้ 384 px)
shallow,mid,deep=tex('water-shallow'),tex('water'),tex('water-deep')
sand,grass,dirt=tex('sand'),tex('grass'),tex('dirt')
# ไล่ระดับความลึก: 0-70px ตื้น, 70-220 กลาง, >220 ลึก (มี noise ให้ขอบเฉดเป็นคลื่น)
dd=d+noise(48,60)-30
w1=np.clip(1-(dd-20)/80,0,1)            # ตื้น
w3=np.clip((dd-170)/140,0,1)            # ลึก
w2=np.clip(1-w1-w3,0,1)
sea=shallow*w1[...,None]+mid*w2[...,None]+deep*w3[...,None]
# ปรับสีตามความลึกให้ไล่นุ่มขึ้น (ตื้นสว่างอมเขียว, ลึกเข้ม)
tint=np.stack([np.interp(dd,[0,60,200,420],[90,30,10,5]),np.interp(dd,[0,60,200,420],[230,180,110,70]),np.interp(dd,[0,60,200,420],[220,220,190,150])],-1)
sea=sea*(1-A.tint)+tint*A.tint
# แนวปะการัง/โขดหินใต้น้ำ: หย่อมมืดในเขตน้ำตื้น-กลาง
reef=np.zeros((H,W))
for _ in range(90):
    cx,cy=random.randint(0,W-1),random.randint(0,H-1)
    if not water[cy,cx] or not (40<d[cy,cx]<260): continue
    r=random.randint(18,55); yy,xx=np.ogrid[:H,:W]
    reef+=np.exp(-(((xx-cx)/r)**2+((yy-cy)/(r*0.7))**2))
reef=np.clip(reef*(0.6+noise(8,0.8)),0,1)*(water)
coral_col=np.array([35,85,80]); sea=sea*(1-0.55*reef[...,None])+coral_col*0.55*reef[...,None]
# ขอบบนของก้อนหินใต้น้ำสว่างขึ้นนิดหน่อย ให้มีมิติ
hl=np.clip(reef-np.roll(reef,4,0),0,1); sea=sea+hl[...,None]*np.array([60,90,80])*0.8
# กอปะการังใต้น้ำ: ก้อนสีนุ่ม ๆ ถูกน้ำกลืนสี (เบลอ + จางตามความลึก)
cor=np.zeros((H,W,3)); ca=np.zeros((H,W))
cand=np.argwhere((reef>0.45)&(d<200))
for i in np.random.choice(len(cand),min(70,len(cand)),replace=False):
    y,x=cand[i]; col=np.array(random.choice([(235,110,140),(245,150,90),(180,120,220),(250,200,110)]))
    for _ in range(random.randint(3,6)):
        cx=x+random.randint(-10,10); cy=y+random.randint(-6,6); r=random.randint(3,6)
        y0,y1,x0,x1=max(0,cy-r),min(H,cy+r),max(0,cx-r),min(W,cx+r)
        yy_,xx_=np.ogrid[y0:y1,x0:x1]; k=np.clip(1-(((xx_-cx)/r)**2+((yy_-cy)/r)**2),0,1)
        cor[y0:y1,x0:x1]=np.where(k[...,None]>ca[y0:y1,x0:x1,None],col,cor[y0:y1,x0:x1]); ca[y0:y1,x0:x1]=np.maximum(ca[y0:y1,x0:x1],k)
ca=ndimage.gaussian_filter(ca,1.2)*np.clip(1-d/260,0.25,1)*0.75
sea=sea*(1-ca[...,None])+cor*ca[...,None]
# แสงระยิบในน้ำตื้น (caustics) — เพิ่มความสว่างตามลายน้ำเดิม
# คลื่น: ฟองขาวที่ชายฝั่ง + เส้นคลื่นขนานฝั่ง
foam=np.clip(1-d/13,0,1)*(0.55+noise(5,0.8))+np.clip(1-abs(d-15)/3,0,1)*(noise(7,1)>0.5)*0.6
bands=np.zeros((H,W))
for k,(dist,wid,a) in enumerate([(22,4,0.55),(46,3,0.35),(78,3,0.2)]):
    wave=np.exp(-((d-(dist+noise(40,14)-7))/wid)**2)
    broken=noise(10,1.0)>0.45
    bands+=wave*a*broken
white=np.clip(foam+bands,0,1)*water
sea=sea*(1-white[...,None])+255*white[...,None]
# แผ่นดิน: ทรายเปียกใกล้น้ำ, ทราย, หญ้า, ทางดิน (ตามผัง)
lg=np.array([[c for c in r] for r in G])
big=lambda ch:np.array(Image.fromarray(((lg==ch)*255).astype(np.uint8)).resize((W,H),Image.NEAREST))>0
landimg=grass.copy()
for ch,t in (('S',sand),('D',dirt)):
    mk=ndimage.gaussian_filter(big(ch).astype(float),3)
    landimg=landimg*(1-mk[...,None])+t*mk[...,None]
paddy=big('P'); landimg[paddy]=landimg[paddy]*0.5+np.array([120,185,70])*0.5
forest=big('F'); landimg[forest]=landimg[forest]*0.55+np.array([30,90,35])*0.45
yy=np.arange(H)[:,None]*np.ones((1,W))
beach=(dl<34+noise(20,24))&(~water)&(yy>H*0.55)
bm=ndimage.gaussian_filter(beach.astype(float),4)
landimg=landimg*(1-bm[...,None])+sand*bm[...,None]
wet=np.clip(1-dl/14,0,1)*(~water); landimg=landimg*(1-0.35*wet[...,None])+np.array([150,120,70])*0.35*wet[...,None]
out=np.where(water[...,None],sea,landimg)
img=Image.fromarray(np.clip(out,0,255).astype(np.uint8)); img.save(A.out); print('บันทึก',A.out,img.size)
