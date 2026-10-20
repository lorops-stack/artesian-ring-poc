const test=require('node:test'), assert=require('node:assert/strict');
const RS=require('./load')();
function scene(x=292,y=260){const c=RS.presetConfig('flat'),o={A:c.sensors.A,B:c.sensors.B,C:c.sensors.C,hand:c.hand,plane:c.plane};return {c,o,e:['A','B','C'].map(k=>[[RS.geo.range(o[k],x,y,c.hand.zwork)+(o[k].off||0),100]])};}
function solve(s){return RS.geo.associate3(...s.e,s.o);}
test('three ranges recover a grid independently of beam assumptions',()=>{for(let x=30;x<580;x+=55)for(let y=30;y<530;y+=50){const a=solve(scene(x,y));assert.equal(a.flag,0);assert.ok(Math.hypot(a.x-x,a.y-y)<.01);assert.equal(a.iC,0);}});
test('missing, disabled and inconsistent C never produce a fix',()=>{let s=scene();s.e[2]=[];assert.notEqual(solve(s).flag,0);s=scene();s.o.C.on=false;assert.notEqual(solve(s).flag,0);s=scene();s.e[2][0][0]+=200;assert.notEqual(solve(s).flag,0);});
test('C offset compensation and distractor selection',()=>{const s=scene();s.o.C.off=18;s.e[2][0][0]+=18;s.e[2].unshift([800,100]);const a=solve(s);assert.equal(a.flag,0);assert.equal(a.iC,1);assert.ok(Math.hypot(a.x-292,a.y-260)<.01);});
test('collinear geometry, masks and outside opening reject fixes',()=>{let s=scene();s.o.C.y=s.o.A.y;assert.notEqual(solve(s).flag,0);s=scene();s.o.masks=[{id:'test',t:'circle',x:292,y:260,r:40}];assert.equal(solve(s).flag,RS.FLAG.MASKED);assert.notEqual(solve(scene(-50,260)).flag,0);});
