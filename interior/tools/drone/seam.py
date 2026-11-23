import cv2, numpy as np, glob, pickle, math, sys
import os
FR=os.environ.get('FRAMES','frames'); WK=os.environ.get('WORK','work'); os.makedirs(WK,exist_ok=True)
fs=sorted(glob.glob(FR+'/*.jpg'))
cams=pickle.load(open(WK+'/cams.pkl','rb'))
use=[int(x) for x in sys.argv[1].split(',')]; W=int(sys.argv[2]); scale=W/(2*math.pi)
warper=cv2.PyRotationWarper('spherical',scale)
imgs=[];masks=[];corners=[];sizes=[]
for i in use:
    c=cams[i]; im=cv2.imread(fs[i])
    K=np.array([[c['f'],0,c['ppx']],[0,c['f']*c['aspect'],c['ppy']],[0,0,1]],np.float32)
    R=c['R'].astype(np.float32)
    corner,wi=warper.warp(im,K,R,cv2.INTER_LINEAR,cv2.BORDER_REFLECT)
    m=255*np.ones(im.shape[:2],np.uint8)
    m=cv2.erode(m,np.ones((9,9),np.uint8))
    _,wm=warper.warp(m,K,R,cv2.INTER_NEAREST,cv2.BORDER_CONSTANT)
    imgs.append(wi);masks.append(wm);corners.append(corner);sizes.append((wi.shape[1],wi.shape[0]))
print('warped',len(imgs),corners[:3])
# seams at low res
sf=0.25
li=[cv2.resize(x,None,fx=sf,fy=sf).astype(np.float32) for x in imgs]
lm=[cv2.resize(x,None,fx=sf,fy=sf,interpolation=cv2.INTER_NEAREST) for x in masks]
lc=[(int(c[0]*sf),int(c[1]*sf)) for c in corners]
sfd=cv2.detail_GraphCutSeamFinder('COST_COLOR_GRAD')
lm=sfd.find(li,lc,lm)
masks=[cv2.bitwise_and(cv2.resize(cv2.dilate(a,None),(m.shape[1],m.shape[0]),interpolation=cv2.INTER_LINEAR_EXACT),m) for a,m in zip(lm,masks)]
bl=cv2.detail_MultiBandBlender(); bl.setNumBands(6)
bl.prepare(cv2.detail.resultRoi(corners=corners,sizes=sizes))
for im,m,c in zip(imgs,masks,corners): bl.feed(im.astype(np.int16),m,c)
res,rm=bl.blend(None,None)
roi=cv2.detail.resultRoi(corners=corners,sizes=sizes)
print('roi',roi,res.shape)
np.save(WK+'/roi.npy',np.array(roi))
cv2.imwrite(WK+'/seam.png',res.clip(0,255).astype(np.uint8)); cv2.imwrite(WK+'/seam_mask.png',rm)
