import cv2, numpy as np, math, sys
import os
FR=os.environ.get('FRAMES','frames'); WK=os.environ.get('WORK','work'); os.makedirs(WK,exist_ok=True)
W=6144; H=W//2
im=cv2.imread(WK+'/seam.png').astype(np.float32); m=cv2.imread(WK+'/seam_mask.png',0)
rx,ry,rw,rh=np.load(WK+'/roi.npy')
elev_fix=float(sys.argv[1]); north=float(sys.argv[2])
can=np.zeros((H,W,3),np.float32); cm=np.zeros((H,W),np.uint8)
dy=int(round(elev_fix/180*H)); y0=ry-dy
xs=(np.arange(rw)+rx+W//2)%W
can[y0:y0+rh][:,xs]=im; cm[y0:y0+rh][:,xs]=m
# fill empty columns from the left neighbour (wrap gap)
for c in range(W):
    if cm[:,c].max()==0: can[:,c]=can[:,c-1]; cm[:,c]=cm[:,c-1]
dark=can.sum(2)<90; dark[H//2:]=False; cm[dark]=0
cm=cv2.erode(cm,np.ones((15,15),np.uint8)); valid=cm>0
top=np.argmax(valid,0); bot=H-1-np.argmax(valid[::-1],0)
k=np.ones(61)/61
def sm(a,f): a=np.convolve(np.r_[a[-30:],a,a[:30]],k,'valid'); return f(a).astype(int)
top=np.maximum(sm(top,np.ceil),top)+16; bot=np.minimum(sm(bot,np.floor),bot)-3
cols=np.arange(W)
edge=np.array([can[top[c]:top[c]+10,c].mean(0) for c in cols])          # BGR
isSky=((edge[:,0]>edge[:,2]+40)&(edge[:,0]>120))|(edge.sum(1)>600)
isSky=cv2.morphologyEx(isSky.astype(np.uint8)[None],cv2.MORPH_OPEN,np.ones((1,15),np.uint8))[0]>0
# sky colour per column: interpolate from sky columns
idx=np.where(isSky)[0]
skyc=np.stack([np.interp(cols,idx,edge[idx,ch],period=W) for ch in range(3)],1)
skyc=cv2.GaussianBlur(skyc[None],(0,0),30)[0]
zen=np.array([150,92,32],np.float32)
out=np.zeros_like(can)
for c in cols:
    t=top[c]; a=(np.arange(t)/max(t,1))[:,None]**1.4
    out[:t,c]=zen*(1-a)+skyc[c]*a
# buildings cut by the frame top: continue their facade upward by repeating its upper part, then sky
facade_top=int(H*0.5-40/180*H)
for c in np.where(~isSky)[0]:
    t=top[c]; P=160; band=can[t:t+P,c]
    y=t-1; i=0
    while y>=facade_top:
        out[y,c]=band[P-1-(i%P)] if (i//P)%2==0 else band[i%P]; y-=1; i+=1
# soften the facade's invented top into the sky
fm=np.zeros((H,W),np.float32)
for c in np.where(~isSky)[0]: fm[facade_top:top[c],c]=1
fm=cv2.GaussianBlur(fm,(0,0),3)
# ground: flipped, compressed, blurred continuation of the lowest band, darkening toward the nadir
nad=np.array([88,92,96],np.float32)
for c in cols:
    b=bot[c]; n=H-1-b
    if n<=0: continue
    d=np.arange(1,n+1); src=np.clip(b-(d*0.12).astype(int),0,H-1)
    out[b+1:,c]=can[src,c]
low=out.copy(); 
gmask=np.zeros((H,W),np.float32)
for c in cols: gmask[bot[c]+1:,c]=1
blur=cv2.GaussianBlur(low,(0,0),22)
yy=np.arange(H)[:,None]; a=np.clip((yy-bot[None,:])/ (H-bot[None,:]),0,1)**0.7
ground=blur*(1-a[...,None])+nad*a[...,None]
out=np.where(gmask[...,None]>0,ground,out)
real=np.zeros((H,W),np.float32)
for c in cols: real[top[c]:bot[c]+1,c]=1
real=cv2.GaussianBlur(real,(0,0),4)
band=(np.arange(H)[:,None]>=top[None,:])&(np.arange(H)[:,None]<=bot[None,:])
can=np.where(band[...,None],can,out)
out=np.where(band[...,None],can,out)
res=can*real[...,None]+out*(1-real[...,None])
res=np.roll(res,int(round(-north/360*W)),1)
cv2.imwrite(sys.argv[3],res.clip(0,255).astype(np.uint8),[cv2.IMWRITE_JPEG_QUALITY,92])
