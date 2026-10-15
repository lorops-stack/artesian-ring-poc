"""Ideal 2D placement comparison, not measured coverage.
40x40 cell-centre grid over 584.2x533.4 mm, h=0, independent equal 8 mm range sigma.
Noise metric: sqrt(trace(sigma^2 * inverse(J^T J))), over every grid point.
Visibility: all three ranges 60..850 mm, ideal horizontal hard cones at 30/45/60 half angles.
Excludes vertical slot clipping, roll, material losses, multipath, hands and motion skew.
"""
import math
W,D=584.2,533.4
for name,c in [('front35',(W*.35,D,270)),('front50',(W*.5,D,270)),('front65',(W*.65,D,270)),('left-middle',(0,D*.5,0)),('front-left',(0,D,315)),('front-right',(W,D,225))]:
 poses=[(0,0,45),(W,0,135),c];errs=[];covered={30:0,45:0,60:0};total=40*40
 for j in range(40):
  for i in range(40):
   x=(i+.5)*W/40;y=(j+.5)*D/40;xx=xy=yy=0;angles=[];ranges=[]
   for sx,sy,yaw in poses:
    dx=x-sx;dy=y-sy;r=math.hypot(dx,dy);xx+=dx*dx/r**2;xy+=dx*dy/r**2;yy+=dy*dy/r**2
    ranges.append(r);angles.append(abs((math.degrees(math.atan2(dy,dx))-yaw+180)%360-180))
   det=xx*yy-xy*xy;errs.append(8*math.sqrt((xx+yy)/det) if det>1e-9 else float('inf'))
   for half in covered:
    if all(60<=r<=850 for r in ranges) and max(angles)<=half:covered[half]+=1
 errs.sort();print(name,round(errs[800],2),round(errs[1520],2),{a:round(100*n/total,1) for a,n in covered.items()})
