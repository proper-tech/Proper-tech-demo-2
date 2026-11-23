import cv2, numpy as np, glob, pickle, sys, time
import os
FR=os.environ.get('FRAMES','frames'); WK=os.environ.get('WORK','work'); os.makedirs(WK,exist_ok=True)
fs=sorted(glob.glob(FR+'/*.jpg'))
S=0.3333  # estimation scale (1280x720)
ims=[cv2.resize(cv2.imread(f),None,fx=S,fy=S,interpolation=cv2.INTER_AREA) for f in fs]
n=len(ims); t=time.time()
finder=cv2.SIFT_create(2500)
feats=[cv2.detail.computeImageFeatures2(finder,im) for im in ims]
for i,f in enumerate(feats): f.img_idx=i
mask=np.zeros((n,n),np.uint8)
for i in range(n):
    for j in range(n):
        if i!=j and (abs(i-j)<=3 or abs(i-j)>=n-int(sys.argv[1]) ): mask[i,j]=1
m=cv2.detail.BestOf2NearestMatcher(False,0.3)
pm=m.apply2(feats,mask)
print('matched',time.time()-t)
conf=np.array([p.confidence for p in pm]).reshape(n,n)
print('consecutive conf min',min(conf[i,i+1] for i in range(n-1)))
# wrap pairs
w=[(i,j,round(conf[i,j],2)) for i in range(n) for j in range(n) if abs(i-j)>3 and conf[i,j]>1]
print('wrap pairs',len(w),w[:12])
est=cv2.detail_HomographyBasedEstimator()
ok,cams=est.apply(feats,pm,None)
for c in cams: c.R=c.R.astype(np.float32)
ba=cv2.detail_BundleAdjusterRay(); ba.setConfThresh(0.5)
ok,cams=ba.apply(feats,pm,cams); print('ba',ok)
Rs=[c.R for c in cams]; Rs=cv2.detail.waveCorrect(Rs,cv2.detail.WAVE_CORRECT_HORIZ)
out=[dict(R=np.array(R),f=c.focal/S,ppx=c.ppx/S,ppy=c.ppy/S,aspect=c.aspect) for R,c in zip(Rs,cams)]
print('focal',np.median([o['f'] for o in out]))
pickle.dump(out,open(WK+'/cams.pkl','wb'))
