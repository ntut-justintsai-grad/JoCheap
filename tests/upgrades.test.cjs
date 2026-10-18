const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine.js'),P=require('../src/planner.js'),snapshot=require('./fixtures/upgrades_20261017.json'),live=require('../data/offers.json'),demo=require('../data/demo.json');
function req(extra={}){return {demand:{burgerMain:1,drinkServing:1},people:1,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',at:'2026-10-17T13:00:00+08:00',maxOrders:2,estimate:true,allowExtras:true,drinkPreference:'coldMilkTea',...extra};}
function offer(code){return structuredClone(snapshot.offers.find(o=>o.brand==='KFC'&&o.code===code));}
test('actual coupon drink surcharges apply per serving, with exact named choices',()=>{
 const o=offer('16845');assert.equal(o.dataStatus,'estimate');const ds={...snapshot,offers:[o]};
 const plain=F.solve(ds,req({drinkPreference:'cola',maxOrders:1})).plans[0],milk=F.solve(ds,req({maxOrders:1})).plans[0];
 assert.equal(plain.totalCost,13500);assert.equal(milk.totalCost,14000);assert.equal(milk.orders[0].surchargeMinor,500);assert(milk.orders[0].beverages.every(d=>d.kind==='milkTea'));
 const twice=F.solve(ds,req({demand:{burgerMain:2,drinkServing:2}})).plans[0];assert.equal(twice.totalCost,28000);assert.equal(twice.extras.drinkMedium,undefined);
 const pair=offer('26383');const ds2={...snapshot,offers:[pair]};const x=F.solve(ds2,req({demand:{drinkServing:2},maxOrders:1})).plans[0];
 assert.equal(x.orders[0].surchargeMinor,1000);assert.equal(x.totalCost,pair.variants[0].priceMinor+1000);
});
test('a middle drink can have a different zero-cost replacement than a small drink',()=>{
 const o=offer('26382');assert.equal(o.dataStatus,'estimate');
 const x=F.solve({...snapshot,offers:[o]},req({demand:{drinkServing:1},maxOrders:1})).plans[0];
 assert.equal(x.orders[0].surchargeMinor,0);assert(x.orders[0].beverages.some(d=>d.kind==='milkTea'));
});
test('mixed per-unit options replace rather than add, preserving coupon limits',()=>{
 const v=offer('26383').variants[0],g=v.optionGroups.find(g=>g.baseBeverages.length),milk=g.options.findIndex(o=>o.beverages.some(d=>d.kind==='milkTea'&&d.size==='medium'));
 const changed=F.applyOptions(v,{[g.id]:[0,milk]});
 assert.equal(changed.surchargeMinor,500);assert.equal(changed.beverages.reduce((s,b)=>s+b.quantity,0),2);
 assert.equal(changed.items.drinkSmall,1);assert.equal(changed.items.drinkMedium,1);
 assert.throws(()=>F.applyOptions(v,{[g.id]:[999,0]}));
 const o=offer('16845');o.limits.maxUsesPerUserPerDay=1;
 assert.equal(F.solve({...snapshot,offers:[o]},req({demand:{burgerMain:2,drinkServing:2}})).plans.length,0);
});
test('ordering platform, fulfilment, membership and online payment are independent',()=>{
 const o=offer('16845');o.ordering={platforms:['pk_app'],fulfilments:['takeaway'],excludedPlatforms:[],onlinePaymentRequired:true};o.eligibility.memberRequired=true;
 const ds={...snapshot,offers:[o]},base=req({orderMethod:'pk_app',paymentMethod:'online',member:true,maxOrders:1});
 assert(F.solve(ds,base).plans.length);
 for(const patch of [{orderMethod:'official_web'},{channel:'delivery'},{member:false},{paymentMethod:'in_store'}])assert.equal(F.solve(ds,{...base,...patch}).plans.length,0);
 assert.equal(F.solve(ds,{...base,paymentMethod:'any'}).plans[0].orders[0].orderingStatus,'unknown');
 assert.equal(F.solve(ds,{...base,paymentMethod:'any',allowUnknownOrdering:false}).plans.length,0);
 o.ordering={platforms:null,excludedPlatforms:['kiosk']};o.eligibility.memberRequired=false;
 assert.equal(F.orderingCheck(o,req({orderMethod:'kiosk'})).allowed,false);
 assert.throws(()=>F.validateRequest(req({orderMethod:'counter',channel:'delivery'})),/不支援/);
});
test('unknown ordering evidence is never reported as source-confirmed',()=>{
 const o=offer('16845');o.ordering={platforms:null,excludedPlatforms:[],onlinePaymentRequired:false};
 const x=F.solve({...snapshot,offers:[o]},req({maxOrders:1}));assert.equal(x.plans[0].orders[0].orderingStatus,'unknown');
 assert.equal(F.solve({...snapshot,offers:[o]},req({allowUnknownOrdering:false})).plans.length,0);
});
test('time-dependent rice replacement follows Taipei collection time',()=>{
 F.extendItems(snapshot);const v={id:'v',priceMinor:10000,items:{chickenRice:1},channels:['takeaway']};
 assert.equal(F.applyOptions(v,{},'2026-10-17T19:59:00+08:00').items.chickenRice,1);
 const late=F.applyOptions(v,{},'2026-10-17T20:00:00+08:00');assert.equal(late.items.chickenRice,undefined);assert.equal(late.items.friesMedium,1);
});
test('active source metadata agrees with preserved records and calculation versions',()=>{
 const snapshot=live;F.extendItems(snapshot);
 assert.equal(snapshot.schemaVersion,2);assert.equal(snapshot.offers.length,snapshot.crawlReport.uniqueCodes);
 assert.equal(new Set(snapshot.offers.map(o=>o.brand+'/'+o.code)).size,snapshot.offers.length);
 assert.equal(new Set(snapshot.sources.map(s=>s.sourceId)).size,snapshot.sources.length);
 if(snapshot.sourcePolicy?.KFC)assert.deepEqual(snapshot.sources.map(s=>s.sourceId).sort(),['calling-ph','kcouper','talk-ph']);
 assert(snapshot.sources.every(s=>s.parsedCount>0&&s.contentHash.length===64));
 assert(snapshot.offers.length>0);assert(snapshot.offers.some(o=>o.brand==='PH'&&o.variants.some(v=>v.pizzaSlots?.length)));
 for(const o of snapshot.offers){assert.equal(o.provenance.officialVerifiedAt,null);for(const v of o.variants)for(const [k,n] of Object.entries(v.items)){assert(F.ITEMS[k],k);assert(Number.isInteger(n)&&n>=0&&n<=60,k);}}
 const available=F.chooseCandidates(snapshot,req({demand:{chicken:1},drinkPreference:'any'}),Date.now()).candidates;
 assert(available.every(c=>!['pending','conflict'].includes(c.offer.dataStatus)));
});
