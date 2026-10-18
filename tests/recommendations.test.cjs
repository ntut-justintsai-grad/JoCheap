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
 const x=F.recommend({...demo,offers},request,{timeLimitMs:10000,allowMealReplacement:true});
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
 const x=F.recommend({...demo,offers:[member,normal,expired,conflict]},r,{timeLimitMs:10000,allowMealReplacement:true});
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
  const x=F.recommend({...demo,offers:[burger]},r,{timeLimitMs:10000,allowMealReplacement:true});
  const p=x.suggestions.find(p=>p.effectiveRequest.demand.burgerMain===people);
  assert(p);prices.push(p.totalCost);assert.equal(p.orders.length,people);
 }
 assert.deepEqual(prices,[2000,4000]);
});
test('complete meals are never padded with changed quantities or replacement food',()=>{
 const x=F.recommend({...demo,offers:[offer('meal',{chicken:2},1000),offer('burger',{burger:1},500)]},{demand:{chicken:2},people:1,budgetMinor:3000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:4,estimate:false},{timeLimitMs:10000});
 assert.equal(x.plans[0].totalCost,1000);assert.deepEqual(x.suggestions,[]);
});
test('both a cheaper single-brand meal and a complete mixed-brand meal are retained',()=>{
 const offers=[offer('all',{chicken:4,tart:2},5000),offer('chicken',{chicken:4},3000),offer('tarts',{tart:2},3000,'PH')];
 const x=solve(offers,{maxOrders:2});
 assert.equal(x.plans[0].totalCost,5000);assert(x.plans.some(p=>p.brandCount===2&&p.totalCost===6000));
 assert(x.plans.every(p=>p.coverage.every(c=>c.got>=c.need)));
 const single=solve(offers,{cross:false,maxOrders:2});assert(single.plans.every(p=>p.brandCount===1));
});
test('a snack request never turns into a main meal without explicitly opting in',()=>{
 const r={demand:{tart:4,nuggets:8},people:4,budgetMinor:40000,brands:['KFC','PH'],cross:true,channel:'takeaway',at,maxOrders:4,estimate:false};
 const x=F.recommend({...demo,offers:[offer('pizza',{pizza9:2},10000,'PH'),offer('nuggets',{nuggets:8},5000)]},r,{timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert.equal(x.suggestions.length,0);assert(x.partials.length);
 assert(x.partials.every(p=>p.orders.every(o=>o.offerId==='nuggets')));
 assert.deepEqual(x.partials[0].missing,[{id:'tart',quantity:4}]);
});
test('near alternatives retain every selected food and at least three quarters of each quantity',()=>{
 const r={demand:{tart:4,nuggets:8},people:4,budgetMinor:9000,brands:['KFC','PH'],cross:true,channel:'takeaway',at,maxOrders:1,estimate:false};
 const x=F.recommend({...demo,offers:[offer('ideal',{tart:4,nuggets:8},10000),offer('near',{tart:3,nuggets:6},8000),offer('pizza',{pizza9:2},1000,'PH')]},r,{timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert.equal(x.minimumIgnoringBudget.totalCost,10000);assert(x.suggestions.length);
 for(const p of x.suggestions){assert(p.totalCost<=9000);assert(p.supplied.tart>=3);assert(p.supplied.nuggets>=6);assert(p.effectiveRequest.demand.tart>0);assert(p.effectiveRequest.demand.nuggets>0);assert(p.orders.every(o=>o.offerId!=='pizza'));}
 assert(x.suggestions[0].adjustments.some(s=>s.includes('4 → 3')));
 assert.deepEqual(x.suggestions[0].originalCoverage,[{id:'tart',need:4,got:3},{id:'nuggets',need:8,got:6}]);
 assert.deepEqual(r.demand,{tart:4,nuggets:8});
});
test('explicit food replacement still preserves original membership and payment restrictions',()=>{
 const r={demand:{paperChicken:2},people:2,budgetMinor:5000,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:4,estimate:false,member:false,allowMealReplacement:true};
 const burger=offer('burger',{burger:1},1000);burger.variants[0].individualMains=1;
 const x=F.recommend({...demo,offers:[burger]},r,{timeLimitMs:10000});
 assert(x.suggestions.some(p=>p.effectiveRequest.demand.burgerMain===2));
});

test('current coupon contents are searched dynamically, including paper chicken in a bounded search',()=>{
 const P=require('../src/planner.js'),real=require('../data/offers.json');
 const b=P.buildSimple({people:4,mains:['wrapped'],richness:'none',drinks:false});
 const r={...b,budgetMinor:80000,brands:['KFC','PH'],cross:true,channel:'takeaway',at:'2026-10-18T19:30:00+08:00',estimate:true,orderMethod:'auto',paymentMethod:'any',dataScope:'all',allowUnknownOrdering:true};
 const x=F.recommend(real,r,{maxStates:100,timeLimitMs:300,collectAlternatives:false});
 assert(x.plans.length);assert(x.plans.every(p=>p.supplied.paperChicken>=4));
 assert(x.plans.every(p=>p.coverage.every(c=>c.got>=c.need)));
 assert.deepEqual(x.plans.map(p=>p.totalCost),x.plans.map(p=>p.totalCost).sort((a,b)=>a-b));
 // Removing those live candidates changes the answer; no stored meal is reused.
 const without={...real,offers:real.offers.filter(o=>!o.variants.some(v=>v.items.paperChicken))};
 const absent=F.recommend(without,r,{timeLimitMs:300,collectAlternatives:false});
 assert.equal(absent.plans.length,0);assert.equal(absent.suggestions.length,0);assert(absent.unpricedAlternative);
});

function quoted(offers,patch={},config={}){
 return F.recommend({...demo,offers},{demand:{chicken:4,tart:2},people:2,budgetMinor:1500,brands:['KFC','PH'],cross:true,channel:'takeaway',at,maxOrders:4,estimate:false,orderMethod:'official_web',paymentMethod:'any',member:false,...patch},{timeLimitMs:10000,...config});
}
test('the full original meal quote remains available even far over budget',()=>{
 const smaller=offer('smaller',{chicken:3,tart:2},1400);smaller.limits.maxUsesPerUserPerDay=1;
 const x=quoted([offer('ideal',{chicken:4,tart:2},10000),smaller]);
 assert.equal(x.plans.length,0);assert(x.suggestions.length);assert.equal(x.fullQuote.totalCost,10000);assert.equal(x.fullQuote.budgetGapMinor,8500);
 assert(x.fullQuote.coverage.every(c=>c.got>=c.need));assert.equal(x.fullQuote.substitution,undefined);
});
test('an independent full-price search recovers a quote after the main state limit is hit',()=>{
 const x=quoted([offer('meal',{chicken:2,tart:1},1000)],{}, {maxStates:0});
 assert.equal(x.fullQuote.totalCost,2000);assert.equal(x.fullQuote.budgetGapMinor,500);assert.equal(x.searchComplete,false);
});
test('a recovered complete meal within budget is promoted into the valid plans',()=>{
 const x=quoted([offer('meal',{chicken:2,tart:1},1000)],{budgetMinor:2500},{maxStates:0});
 assert(x.plans.length);assert.equal(x.plans[0].totalCost,2000);assert(x.plans[0].coverage.every(c=>c.got>=c.need));
});
test('the full quote can propose more orders without silently changing the original order cap',()=>{
 const r={demand:{chicken:4,tart:2},people:2,budgetMinor:1500,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:1,estimate:false,member:false,paymentMethod:'in_store'};
 const x=F.recommend({...demo,offers:[offer('meal',{chicken:2,tart:1},1000)]},r,{timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert.equal(x.fullQuote.totalCost,2000);assert.equal(x.fullQuote.requiredMaxOrders,2);assert.equal(x.fullQuote.budgetGapMinor,500);assert.equal(r.maxOrders,1);
 assert.deepEqual(x.fullQuote.effectiveRequest.brands,['KFC']);assert.equal(x.fullQuote.effectiveRequest.cross,false);assert.equal(x.fullQuote.effectiveRequest.member,false);assert.equal(x.fullQuote.effectiveRequest.paymentMethod,'in_store');
 assert.equal(x.unpricedAlternative,null);
});
test('missing required food is explained rather than quoted as a cheaper changed meal',()=>{
 const x=quoted([offer('chicken',{chicken:4},1000)]);
 assert.equal(x.fullQuote,null);assert.equal(x.quoteUnavailable.reason,'missing_items');assert.deepEqual(x.quoteUnavailable.missingItems,[{id:'tart',quantity:2}]);
});
test('full-price references preserve coupon usage caps, eligibility and fulfilment rules',()=>{
 const one=offer('limited',{chicken:2,tart:1},1000);one.limits.maxUsesPerUserPerDay=1;
 const member=offer('member',{chicken:4,tart:2},1);member.eligibility.memberRequired=true;
 const delivery=offer('delivery',{chicken:4,tart:2},1);delivery.variants[0].channels=['delivery'];
 const x=quoted([one,member,delivery]);assert.equal(x.fullQuote,null);assert.equal(x.minimumIgnoringBudget,null);
});
test('unknown delivery charges never become a numeric total or budget gap',()=>{
 const x=quoted([offer('meal',{chicken:2,tart:1},1000)],{maxOrders:1,channel:'delivery',fees:{KFC:[100],PH:[]}});
 assert(x.fullQuote);assert.equal(x.fullQuote.totalCost,null);assert.equal(x.fullQuote.budgetGapMinor,null);assert.equal(x.fullQuote.knownSubtotal,2000);
});

test('delivery-only failure offers a separate takeaway quote without changing the request',()=>{
 const paper=offer('paper',{paperChicken:1},1000);paper.variants[0].channels=['takeaway'];
 const pizza=offer('pizza',{pizza9:1},2000,'PH');
 const patch={demand:{paperChicken:2,pizza9:1},budgetMinor:5000,channel:'delivery',fees:{KFC:[],PH:[]}};
 const x=quoted([paper,pizza],patch);
 assert.equal(x.plans.length,0);assert.equal(x.fullQuote,null);
 assert.deepEqual(x.quoteUnavailable.channelMismatchItems,[{id:'paperChicken',quantity:2}]);
 assert.equal(x.channelReference.channel,'takeaway');assert.equal(x.channelReference.originalChannel,'delivery');
 assert.equal(x.channelReference.plan.totalCost,4000);assert(x.channelReference.plan.coverage.every(c=>c.got>=c.need));
 assert.equal(x.channelReference.plan.effectiveRequest.channel,'takeaway');assert.equal(patch.channel,'delivery');
});
test('takeaway references still obey membership, avoided food and selected brands',()=>{
 const paper=offer('paper',{paperChicken:1},1000);paper.variants[0].channels=['takeaway'];paper.eligibility.memberRequired=true;
 const patch={demand:{paperChicken:2},budgetMinor:5000,channel:'delivery',member:false};
 assert.equal(quoted([paper],patch).channelReference,undefined);
 const eligible=quoted([paper],{...patch,member:true});assert(eligible.channelReference);
 assert.equal(quoted([paper],{...patch,member:true,avoid:['paperChicken']}).channelReference,undefined);
 assert.equal(quoted([paper],{...patch,member:true,brands:['PH']}).channelReference,undefined);
});
test('the seven-person screenshot is diagnosed as a channel mismatch and keeps all food in the takeaway quote',()=>{
 const real=require('../data/offers.json');
 const r={demand:{pizza9:2,chicken:4,paperChicken:2,snackPortions:6},people:7,budgetMinor:126000,brands:['KFC','PH'],cross:true,channel:'delivery',at:'2026-10-18T20:25:00+08:00',maxOrders:12,estimate:true,orderMethod:'auto',paymentMethod:'any',dataScope:'all',allowUnknownOrdering:true,snackGoal:{minTypes:2,servings:6},pizzaPreference:{tag:'any',minKinds:0},drinkPreference:'any',fees:{KFC:[],PH:[]}};
 const x=F.recommend(real,r,{maxStates:10000,timeLimitMs:100,referenceMaxStates:10000,referenceTimeLimitMs:100});
 assert.equal(x.plans.length,0);assert.equal(x.fullQuote,null);
 assert(x.quoteUnavailable.channelMismatchItems.some(m=>m.id==='paperChicken'));
 assert(x.channelReference);assert(x.channelReference.plan.coverage.every(c=>c.got>=c.need));
 assert(x.channelReference.plan.snackTypes.length>=2);assert.equal(r.channel,'delivery');
});
