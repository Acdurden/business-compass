"""
Provisional grade designs compared: owner-only capped at A, advisor half at midpoint, haircut.

Written 2026-10-04 in the Kriterion Cowork chat. Question set hard-coded from the live
database as of that date (19 scored founder questions = 60 pts, 18 advisor = 40 pts).
See docs/scoring-and-rating/SCORING-AND-BADGE.md. Run: python3 <this file>  (needs numpy)
"""
import numpy as np
rng=np.random.default_rng(11)
obj = [[0,2,3,5,6],[0,4,8],[0,2,4],[0,1,3],[0,1,2],[0,1,3,4,5],[0,1,2,3,4],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2],[0,1,2],[0,1,3],[0,1,2],[0,1,2],[0,1],[0,1,2],[0,1,2]]
adv = [[0,1,2,3,4],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,3],[0,1,2,3],[0,1,2],[0,1,2],[0,1,2],[0,1,2],[0,1],[0,1,2],[0,1,2],[0,1,1],[0,1,2],[0,1,2],[0,1,2],[0,1]]
N=300000
def sim(qs,tilt,beta,z):
    tot=np.zeros(N)
    for pts in qs:
        p=np.array(pts,float); n=len(p); r=np.arange(n)/(n-1)
        pr=np.exp(np.log(tilt)*r[None,:]+beta*z[:,None]*(r[None,:]-0.5)); pr/=pr.sum(1,keepdims=True)
        idx=(rng.random(N)[:,None]>pr.cumsum(1)).sum(1); tot+=p[np.minimum(idx,n-1)]
    return tot
cuts=[40,50,60,70,85]; names=["B","BB","BBB","A","AA","AAA"]
grade=lambda s: np.searchsorted(cuts,s,side='right')
for cname,beta in [("independent",0.0),("moderate corr",0.9)]:
  z=rng.standard_normal(N)
  for sname,(to,ta) in {"owner opt / advisor neutral":(2.2,1),"owner opt / advisor cautious":(2.2,1/2.2),"owner opt / advisor generous":(2.2,2.2)}.items():
    o=sim(obj,to,beta,z)/60; a=sim(adv,ta,beta,z)/40
    print("\n###",cname,"|",sname, "| mean adv frac %.2f"%a.mean())
    for wo,wa in [(60,40),(40,60),(30,70)]:
        f=grade(np.round(o*wo+a*wa,6))
        for lab,prov_s in {"objective-only capped A":None,"neutral fill a0=.50":0.5,"haircut a0=.40":0.4}.items():
            if prov_s is None: pg=np.minimum(grade(np.round(o*100,6)),3)
            else: pg=grade(np.round(o*wo+prov_s*wa,6))
            sh=" ".join("%s %.0f"%(n,(pg==i).mean()*100) for i,n in enumerate(names) if (pg==i).mean()>0.0005)
            d=f-pg
            print(" %d/%d %-24s prov: %-34s | final lower %2.0f same %2.0f higher %2.0f | 2+ lower %.0f"%(wo,wa,lab,sh,(d<0).mean()*100,(d==0).mean()*100,(d>0).mean()*100,(d<=-2).mean()*100))
