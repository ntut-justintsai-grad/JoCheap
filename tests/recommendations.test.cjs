const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/engine.js');
const demo=require('../data/demo.json');
const at='2026-10-17T12:00:00+08:00';
function offer(id,items,price,brand='KFC'){
 const o=structuredClone(demo.offers[0]);o.id=id;o.code=id;o.brand=brand;o.title=id;
 o.limits={maxUsesPerUserPerDay:6};o.variants=[{id:'meal',items,priceMinor:price,channels:['takeaway','delivery']}];return o;
}
function solve(offers,patch={},config={}){
 return F.solve({...demo,offers},{demand:{chicken:4,tart:2},people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',at,maxOrders:4,estimate:false,exact:false,allowExtras:true,avoid:[],...patch},{timeLimitMs:10000,...config});
}
test('unavailable food still returns actual closest orders and exact shortfalls',()=>{
 const x=solve([offer('chicken',{chicken:2},1000)],{demand:{chicken:4,pasta:2},maxOrders:3});
 assert.equal(x.plans.length,0);assert(x.partials.length);const p=x.partials[0];
 assert.equal(p.orders.length,2);assert.equal(p.totalCost,2000);
 assert.deepEqual(p.missing,[{id:'pasta',quantity:2}]);assert.equal(p.partial,true);assert.equal(p.searchComplete,false);
 assert.equal(p.coveragePercent,50);assert.equal(p.coverage.find(c=>c.id==='pasta').got,0);
});
test('budget failure returns an affordable partial and the full over-budget reference',()=>{
 const x=solve([offer('meal',{chicken:2,tart:1},1000)],{budgetMinor:1500});
 assert.equal(x.plans.length,0);assert.equal(x.minimumIgnoringBudget.totalCost,2000);
 assert.equal(x.partials[0].totalCost,1000);
 assert.deepEqual(x.partials[0].missing,[{id:'chicken',quantity:2},{id:'tart',quantity:1}]);
 assert(x.partials.every(p=>p.totalCost<=1500));
 const zero=solve([offer('meal',{chicken:2,tart:1},1000)],{budgetMinor:0});assert.equal(zero.partials.length,0);
});
test('partial configurations respect use limits, no cross-brand, exact counts and delivery fees',()=>{
 const a=offer('chicken',{chicken:2},1000);a.limits.maxUsesPerUserPerDay=1;
 const x=solve([a,offer('tart',{tart:2},1000,'PH')],{cross:false,budgetMinor:5000});
 assert(x.partials.length);assert(x.partials.every(p=>p.brandCount===1&&p.orders.filter(o=>o.offerId==='chicken').length<=1));
 const y=solve([offer('chicken',{chicken:2},1000)],{demand:{chicken:3,pasta:1},exact:true});
 assert.equal(y.partials[0].coverage.find(c=>c.id==='chicken').got,2);
 const z=solve([offer('meal',{chicken:2,tart:1},1000)],{channel:'delivery',fees:{KFC:[700,700]},budgetMinor:2000});
 assert.equal(z.partials[0].totalCost,1700);assert.equal(z.partials[0].orders.length,1);
 const unknown=solve([a],{demand:{chicken:4,pasta:1},channel:'delivery',budgetMinor:5000});assert.equal(unknown.partials.length,0);
});
test('snack-type and flavor gaps are exposed even when physical quantities are met',()=>{
 const a=offer('pizza',{pizza9:2},1000);a.variants[0].pizzaSlots=[{size:'pizza9',allowed:['plain']}];
 const ds={...demo,pizzaFlavors:{plain:{name:'單一口味',tags:['meat']}},offers:[a]};
 const x=F.solve(ds,{demand:{pizza9:2},people:2,budgetMinor:null,brands:['KFC'],cross:true,channel:'takeaway',at,maxOrders:1,estimate:false,pizzaPreference:{tag:'any',minKinds:2}},{timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert.equal(x.partials[0].flavorShortfall,1);assert.deepEqual(x.partials[0].missing,[]);
 const y=solve([offer('snack',{tart:4},1000)],{demand:{tart:2},snackGoal:{minTypes:2,servings:0},maxOrders:1});
 assert.equal(y.plans.length,0);assert.equal(y.partials[0].snackShortfall,1);
});
test('equivalent coupons still produce three distinct valid alternatives',()=>{
 const x=solve([offer('a',{chicken:4,tart:2},1000),offer('b',{chicken:4,tart:2},1200),offer('c',{chicken:4,tart:2},1400)],{maxOrders:1});
 assert.equal(x.plans[0].totalCost,1000);assert.equal(x.plans.length,3);
 assert.equal(new Set(x.plans.map(p=>p.orders[0].offerId)).size,3);
 const tight=solve([offer('a',{chicken:4,tart:2},1000),offer('b',{chicken:4,tart:2},1200)],{maxOrders:1,budgetMinor:1100});
 assert.equal(tight.plans.length,1);assert.equal(tight.plans[0].orders[0].offerId,'a');
});
test('closest ranking agrees with an independent small-budget enumeration',()=>{
 const offers=[offer('a',{chicken:2},700),offer('b',{tart:1},400),offer('c',{chicken:1,tart:1},900)];
 const x=solve(offers,{demand:{chicken:4,tart:3,pasta:1},budgetMinor:2000,maxOrders:3});
 const candidates=[];
 for(let a=0;a<=3;a++)for(let b=0;b<=3;b++)for(let c=0;c<=3;c++){
  const n=a+b+c,cost=700*a+400*b+900*c;if(!n||n>3||cost>2000)continue;
  const deficit=Math.max(0,4-(2*a+c))/4+Math.max(0,3-(b+c))/3+1;
  candidates.push({mainDeficit:Math.max(0,4-(2*a+c))/4+1,deficit,cost,n});
 }
 candidates.sort((a,b)=>a.mainDeficit-b.mainDeficit||a.deficit-b.deficit||a.cost-b.cost||a.n-b.n);
 const p=x.partials[0],deficit=p.missing.reduce((n,m)=>n+m.quantity/({chicken:4,tart:3,pasta:1}[m.id]),0);
 assert.equal(deficit,candidates[0].deficit);assert.equal(p.totalCost,candidates[0].cost);
});
