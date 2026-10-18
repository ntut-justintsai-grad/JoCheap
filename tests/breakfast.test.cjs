const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine'),P=require('../src/planner'),Intent=require('../src/intent'),data=require('../data/offers.json');
const at='2026-10-19T08:10:00+08:00';
const request={at,brands:['KFC'],channel:'takeaway',orderMethod:'auto',paymentMethod:'any',people:3,budgetMinor:null,maxOrders:6,cross:false,estimate:true,allowExtras:true};
test('breakfast mains have distinct identities and physical per-person quantities',()=>{
 const b=P.buildSimple({mealMode:'meal',people:3,mains:['porridge','eggFlatbread','chickenFlatbread'],richness:'none',drinks:false});
 assert.deepEqual(b.demand,{chickenPorridge:1,omeletFlatbread:1,chickenFlatbread:1});
 assert.equal(b.mainAllocation.reduce((n,x)=>n+x.people,0),3);
 assert(!('chicken' in b.demand));assert(!('burgerMain' in b.demand));
 const small=P.buildSimple({people:2,mains:['smallBurger'],richness:'none',drinks:false});
 assert.deepEqual(small.demand,{burgerSmall:2});
});
test('breakfast choices respect brand, method, and their actual time ranges',()=>{
 const menu=P.planningContext(data,{...request,demand:{chickenPorridge:1}});
 for(const id of ['porridge','eggFlatbread','chickenFlatbread','smallBurger'])assert(menu.mains.includes(id),id);
 for(const id of ['porridge','eggFlatbread','chickenFlatbread'])assert.deepEqual(menu.mainTimes[id],{windows:[[480,630]],unknown:false});
 assert.deepEqual(menu.mainTimes.chicken.windows,[[630,1380]]);
 const ph=P.planningContext(data,{...request,brands:['PH']});
 for(const id of ['porridge','eggFlatbread','chickenFlatbread','smallBurger'])assert(!ph.mains.includes(id),id);
 const delivery=P.planningContext(data,{...request,channel:'delivery'});
 for(const id of ['porridge','eggFlatbread','chickenFlatbread'])assert(!delivery.mains.includes(id),id);
 assert(!delivery.schedules[0].allPeriods.some(p=>p.label==='早餐優惠'));
 assert(menu.schedules[0].allPeriods.some(p=>p.label==='早餐優惠'));
});
test('08:10 breakfast searches satisfy all selected mains, with genuine official-description coupons',()=>{
 const demand={chickenPorridge:1,omeletFlatbread:1,chickenFlatbread:1};
 const x=F.recommend(data,{...request,demand},{timeLimitMs:700,maxStates:50000});
 assert(x.plans.length,x.quoteUnavailable?.reason);
 const p=x.plans[0];for(const [id,n] of Object.entries(demand))assert(p.supplied[id]>=n);
 assert.equal(p.missing?.length||0,0);
 assert(p.orders.every(o=>o.officialMeal?.intro));
 assert.equal(p.supplied.chicken||0,0);
 assert.equal(P.formatWindows(P.planTimeWindows(p,at).windows),'08:00–10:30');
 const late=F.chooseCandidates(data,{...request,demand,at:'2026-10-19T13:00:00+08:00'},Date.now()).candidates;
 assert(!late.some(c=>Object.keys(demand).some(id=>c.items[id]>0)));
});
test('text parsing recognizes breakfast mains without treating crispy-chicken porridge or flatbread as fried chicken',()=>{
 const parsed=P.interpret('3人，脆雞粥1份、總匯歐姆蛋燒餅1個、吮指脆雞燒餅1個，不要點心');
 assert.deepEqual(parsed.patch.mains,['porridge','eggFlatbread','chickenFlatbread']);
 assert.deepEqual(parsed.patch.explicitDemand,{chickenPorridge:1,omeletFlatbread:1,chickenFlatbread:1});
 const small=P.interpret('2人想吃小漢堡2個');assert.deepEqual(small.patch.mains,['smallBurger']);
 const validated=Intent.validate({patch:{mealMode:'meal',mains:parsed.patch.mains,explicitDemand:Object.entries(parsed.patch.explicitDemand).map(([item,quantity])=>({item,quantity}))},warnings:[]});
 assert.deepEqual(validated.patch.explicitDemand,parsed.patch.explicitDemand);
});
