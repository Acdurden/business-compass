"""
Weighting model: exact score distributions under different founder/advisor splits.

Written 2026-10-04 in the Kriterion Cowork chat. Question set hard-coded from the live
database as of that date (19 scored founder questions = 60 pts, 18 advisor = 40 pts).
See docs/scoring-and-rating/SCORING-AND-BADGE.md. Run: python3 <this file>  (needs numpy)
"""
import numpy as np, itertools
obj = {"Q6":[0,2,3,5,6],"Q7":[0,4,8],"Q8":[0,2,4],"Q9":[0,1,3],"Q10":[0,1,2],"Q11":[0,1,3,4,5],"Q12":[4,3,2,1,0],"Q13":[0,1,2,3],"Q14":[0,1,2,3],"Q15":[0,1,2,3],"Q16":[0,1,2,3],"Q17":[0,1,2],"Q18":[0,1,2],"Q19":[0,1,3],"Q20":[0,1,2],"Q21":[0,1,2],"Q22":[0,1],"Q23":[0,1,2],"Q24":[0,1,2]}
adv = {"AQ1":[0,1,2,3,4],"AQ2":[0,1,2,3],"AQ3":[0,1,2,3],"AQ4":[0,1,2,3],"AQ5":[0,1,3],"AQ6":[0,1,2,3],"AQ7":[0,1,2],"AQ8":[0,1,2],"AQ9":[0,1,2],"AQ10":[0,1,2],"AQ11":[0,1],"AQ12":[0,1,2],"AQ13":[0,1,2],"AQ14":[0,1,1],"AQ15":[0,1,2],"AQ16":[0,1,2],"AQ17":[0,1,2],"AQ18":[0,1]}
print(sum(max(v) for v in obj.values()), sum(max(v) for v in adv.values()))
def w(pts, tilt):
    # rank options by points; geometric weights so best:worst = tilt
    p=np.array(sorted(pts)); n=len(p)
    r=np.arange(n)/(n-1)
    wt=tilt**r; wt/=wt.sum(); return p,wt
def ms(qs,tilt):
    m=v=0
    for pts in qs.values():
        p,wt=w(pts,tilt); mu=(p*wt).sum(); m+=mu; v+=((p-mu)**2*wt).sum()
    return m,v
def dist(qs,tilt,scale):
    d={0.0:1.0}
    for pts in qs.values():
        p,wt=w(pts,tilt); nd={}
        for k,pr in d.items():
            for a,b in zip(p,wt):
                kk=round(k+a*scale,4); nd[kk]=nd.get(kk,0)+pr*b
        d=nd
    return d
def conv(d1,d2):
    out={}
    for a,pa in d1.items():
        for b,pb in d2.items():
            k=round(a+b,4); out[k]=out.get(k,0)+pa*pb
    return out
def summ(d):
    ks=np.array(sorted(d)); ps=np.array([d[k] for k in ks]); c=np.cumsum(ps)
    m=(ks*ps).sum(); sd=np.sqrt(((ks-m)**2*ps).sum())
    q=lambda x: ks[np.searchsorted(c,x)]
    bands=[ps[ks<50].sum(), ps[(ks>=50)&(ks<70)].sum(), ps[(ks>=70)&(ks<85)].sum(), ps[ks>=85].sum()]
    return m,sd,q(.1),q(.5),q(.9),bands
for name,(to,ta) in {"neutral":(1,1),"owner optimistic 2.2, advisor neutral":(2.2,1),"both optimistic":(2.2,2.2),"owner opt, advisor cautious":(2.2,1/2.2)}.items():
    mo,vo=ms(obj,to); ma,va=ms(adv,ta)
    print("\n==",name); print(" obj mean %.1f/60 sd %.2f | adv mean %.1f/40 sd %.2f"%(mo,vo**.5,ma,va**.5))
    for lab,(so,sa) in {"60/40":(1,1),"70/30":(0.5,1.75),"50/50":(50/60,50/40)}.items():
        d=conv(dist(obj,to,so),dist(adv,ta,sa)); m,sd,a,b,c,bands=summ(d)
        share_adv = (sa**2*va)/((so**2*vo)+(sa**2*va))
        print("  %s mean %.1f sd %.2f p10 %.1f p50 %.1f p90 %.1f bands %s  adv share of variance %.0f%%"%(lab,m,sd,a,b,c,[round(x*100,1) for x in bands],share_adv*100))
