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

test('unavailable requested main is replaced by a complete priced alternative with explicit changes',()=>{
 const offers=[offer('burger',{burger:1},1000)];offers[0].variants[0].individualMains=1;
 const request={demand:{paperChicken:3},people:3,budgetMinor:5000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:4,estimate:false};
 const x=F.recommend({...demo,offers},request,{timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert(x.suggestions.length);
 const p=x.suggestions.find(p=>p.effectiveRequest.demand.burgerMain===3);
 assert(p);assert.equal(p.totalCost,3000);assert.equal(p.orders.length,3);
 assert(p.adjustments.some(s=>s.includes('紙包雞')));assert(p.adjustments.some(s=>s.includes('一般漢堡')));
 assert.equal(p.effectiveRequest.member,request.member);assert.equal(p.substitution,true);
 assert.deepEqual(request.demand,{paperChicken:3});
});
test('rescue preserves hard coupon eligibility and exclusions',()=>{
 const member=offer('member',{burger:1},100);member.eligibility.memberRequired=true;member.variants[0].individualMains=1;
 const normal=offer('normal',{burger:1},1000);normal.variants[0].individualMains=1;
 const expired=offer('expired',{chicken:2},1);expired.validity.validWindows=[{toExclusive:'2026-10-01'}];
 const conflict=offer('conflict',{chicken:2},1);conflict.dataStatus='conflict';
 const r={demand:{paperChicken:2},people:2,budgetMinor:5000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:4,estimate:false,member:false,avoid:[]};
 const x=F.recommend({...demo,offers:[member,normal,expired,conflict]},r,{timeLimitMs:10000});
 assert(x.suggestions.length);assert(x.suggestions.every(p=>p.orders.every(o=>o.offerId==='normal')));
 const avoided=F.recommend({...demo,offers:[normal]}, {...r,avoid:['burger']},{timeLimitMs:10000});
 assert.equal(avoided.suggestions.length,0);assert(avoided.unpricedAlternative);
});
test('zero budget and no eligible coupons still provide an honest alternative',()=>{
 const request={demand:{chicken:4,tart:2},people:2,budgetMinor:0,brands:['KFC'],cross:true,channel:'takeaway',at,maxOrders:4,estimate:false};
 const a=F.recommend({...demo,offers:[offer('meal',{chicken:4,tart:2},2000)]},request,{timeLimitMs:10000});
 assert(a.suggestions.length||a.minimumIgnoringBudget||a.unpricedAlternative);
 assert(a.suggestions.every(p=>p.totalCost===null||p.totalCost>0&&p.overBudget));
 const b=F.recommend({...demo,offers:[]},request,{timeLimitMs:10000});
 assert(b.unpricedAlternative);assert.deepEqual(b.unpricedAlternative.items,request.demand);
 assert.equal(b.unpricedAlternative.totalCost,undefined);
});
test('headcount changes recompute real coupon quantities and prices',()=>{
 const burger=offer('burger',{burger:1},1000);burger.variants[0].individualMains=1;
 const prices=[];
 for(const people of [2,4]){
  const r={demand:{paperChicken:people},people,budgetMinor:10000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:6,estimate:false};
  const x=F.recommend({...demo,offers:[burger]},r,{timeLimitMs:10000});
  const p=x.suggestions.find(p=>p.effectiveRequest.demand.burgerMain===people);
  assert(p);prices.push(p.totalCost);assert.equal(p.orders.length,people);
 }
 assert.deepEqual(prices,[2000,4000]);
});
test('higher budget can offer a richer meal while preserving the original cheapest recommendation',()=>{
 const r={demand:{chicken:2},people:1,budgetMinor:3000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:4,estimate:false};
 const x=F.recommend({...demo,offers:[offer('chicken',{chicken:2},1000)]},r,{timeLimitMs:10000});
 assert.equal(x.plans[0].totalCost,1000);
 const richer=x.suggestions.find(p=>p.label==='預算內・主餐多一點');assert(richer);
 assert.equal(richer.totalCost,2000);assert(richer.coverage.every(c=>c.got>=c.need));assert(richer.totalCost<=r.budgetMinor);
});
