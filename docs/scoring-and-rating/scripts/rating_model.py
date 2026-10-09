"""
Rating model: letter-grade shares and provisional-vs-final agreement by split (simulation).

Written 2026-10-04 in the Kriterion Cowork chat. Question set hard-coded from the live
database as of that date (19 scored founder questions = 60 pts, 18 advisor = 40 pts).
See docs/scoring-and-rating/SCORING-AND-BADGE.md. Run: python3 <this file>  (needs numpy)
"""
import numpy as np
rng=np.random.default_rng(7)
obj = [[0,2,3,5,6],[0,4,8],[0,2,4],[0,1,3],[0,1,2],[0,1,3,4,5],[0,1,2,3,4],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2],[0,1,2],[0,1,3],[0,1,2],[0,1,2],[0,1],[0,1,2],[0,1,2]]
adv = [[0,1,2,3,4],[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,3],[0,1,2,3],[0,1,2],[0,1,2],[0,1,2],[0,1,2],[0,1],[0,1,2],[0,1,2],[0,1,1],[0,1,2],[0,1,2],[0,1,2],[0,1]]
N=200000
def sim(qs,tilt,beta,z):
    tot=np.zeros(N)
    for pts in qs:
        p=np.array(pts,float); n=len(p); r=np.arange(n)/(n-1)
        logit=np.log(tilt)*r[None,:]+beta*z[:,None]*(r[None,:]-0.5)
        pr=np.exp(logit); pr/=pr.sum(1,keepdims=True)
        c=pr.cumsum(1); u=rng.random(N)[:,None]
        idx=(u>c).sum(1); tot+=p[np.minimum(idx,n-1)]
    return tot
cuts=[40,50,60,70,85]; names=["B","BB","BBB","A","AA","AAA"]
def grade(s): return np.searchsorted(cuts,s,side='right')
for cname,beta in [("independent",0.0),("moderate correlation",0.9)]:
    z=rng.standard_normal(N)
    for sname,(to,ta) in {"owner optimistic, advisor neutral":(2.2,1),"both neutral":(1,1),"owner optimistic, advisor cautious":(2.2,1/2.2)}.items():
        o=sim(obj,to,beta,z); a=sim(adv,ta,beta,z)
        print("\n###",cname,"|",sname," corr(obj,adv)=%.2f"%np.corrcoef(o,a)[0,1], "obj sd %.1f adv sd %.1f"%(o.std(),a.std()))
        prov=np.minimum(grade(o/60*100),3)  # capped at A
        for lab,(wo,wa) in {"60/40":(60,40),"50/50":(50,50),"40/60":(40,60),"30/70":(30,70)}.items():
            v=o/60*wo+a/40*wa; g=grade(v)
            sh=[(g==i).mean()*100 for i in range(6)]
            vo=np.var(o/60*wo); va=np.var(a/40*wa)
            # influence: squared correlation of each half with total is messy when correlated; report corr of final with objective
            print(" %s mean %.1f sd %.1f | "%(lab,v.mean(),v.std())+" ".join("%s %.1f"%(n,s) for n,s in zip(names,sh))+" | vs provisional: lower %.0f same %.0f higher %.0f | corr(final,obj) %.2f"%((g<prov).mean()*100,(g==prov).mean()*100,(g>prov).mean()*100,np.corrcoef(v,o)[0,1]))
        gp=grade(o/60*100); print(" objective-only uncapped: "+" ".join("%s %.1f"%(n,(gp==i).mean()*100) for i,n in enumerate(names)))
