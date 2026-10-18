const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine.js'),P=require('../src/planner.js'),demo=require('../data/demo.json');
const at='2026-10-19T13:00:00+08:00';
const request={at,brands:['KFC','PH'],channel:'takeaway',orderMethod:'auto',paymentMethod:'any',member:false};
function offer(id,brand,items,validity={validWindows:[{from:'2026-10-19',toExclusive:'2026-10-20',startMinute:630,endMinute:1380}]}){
 const o=structuredClone(demo.offers[0]);Object.assign(o,{id,code:id,brand,validity,ordering:{},eligibility:{},variants:[{id:'base',priceMinor:10000,items,channels:['takeaway']}]});return o;
}
test('brand and fulfilment choices determine the selectable menu, including at night',()=>{
 const data={...demo,offers:[offer('chicken','KFC',{chicken:4,paperChicken:1,tart:2}),offer('pizza','PH',{pizza9:1,pasta:1,potatoCoinsSmall:1})]};
 const ph=P.planningContext(data,{...request,brands:['PH'],at:'2026-10-19T23:59:00+08:00'});
 assert.deepEqual(ph.mains,['pizza','pasta']);assert(!ph.items.includes('chicken'));assert(!ph.snacks.includes('tart'));assert(ph.snacks.includes('potatoCoinsSmall'));
 const kfc=P.planningContext(data,{...request,brands:['KFC']});assert.deepEqual(kfc.mains,['chicken','wrapped']);assert(!kfc.items.includes('pizza9'));
 assert.equal(P.planningContext(data,{...request,channel:'delivery'}).items.length,0);
});
test('daily menu respects date, weekdays, exceptions, membership and ordering restrictions',()=>{
 const o=offer('meal','KFC',{chicken:4});o.validity.validWindows[0].days=[1];o.eligibility.memberRequired=true;
 const data={...demo,offers:[o]};assert.equal(P.planningContext(data,request).items.length,0);
 assert(P.planningContext(data,{...request,member:true}).items.includes('chicken'));
 assert.equal(P.planningContext(data,{...request,member:true,at:'2026-10-20T13:00:00+08:00'}).items.length,0);
 o.validity.excludedDates=['2026-10-19'];assert.equal(P.planningContext(data,{...request,member:true}).items.length,0);
 delete o.validity.excludedDates;o.ordering={platforms:['pk_app']};assert.equal(P.planningContext(data,{...request,member:true,orderMethod:'official_web'}).items.length,0);
});
test('selected foods intersect their coupon windows without filling a midday gap',()=>{
 const chicken=offer('chicken','KFC',{chicken:4},{validWindows:[{from:'2026-10-19',toExclusive:'2026-10-20',startMinute:630,endMinute:840},{from:'2026-10-19',toExclusive:'2026-10-20',startMinute:1020,endMinute:1380}]}),paper=offer('paper','KFC',{paperChicken:1},{validWindows:[{from:'2026-10-19',toExclusive:'2026-10-20',startMinute:720,endMinute:1320}]});
 const context=P.planningContext({...demo,offers:[chicken,paper]},{...request,demand:{chicken:8,paperChicken:3}});
 const hours=context.schedules.find(s=>s.brand==='KFC');assert.deepEqual(hours.windows,[[720,840],[1020,1320]]);assert.equal(P.formatWindows(hours.windows),'12:00–14:00、17:00–22:00');assert.equal(hours.unknown,false);
 const planHours=P.planTimeWindows({orders:[{validity:chicken.validity},{validity:paper.validity}]},at);assert.deepEqual(planHours.windows,hours.windows);
});
test('date-only validity is explicitly unknown for serving hours',()=>{
 const o=offer('pizza','PH',{pizza9:1},{validWindows:[{from:'2026-10-19',toExclusive:'2026-10-20'}]});
 const context=P.planningContext({...demo,offers:[o]},{...request,brands:['PH']});assert.equal(context.schedules[0].unknown,true);
 assert.equal(P.planTimeWindows({orders:[{validity:o.validity}]},at).unknown,true);
});
test('breakfast and regular meal windows remain distinguishable after changing settings',()=>{
 const breakfast=offer('breakfast','KFC',{hashBrown:1},{validWindows:[{from:'2026-10-19',startMinute:480,endMinute:630}]}),regular=offer('regular','KFC',{hashBrown:1,chicken:4},{validWindows:[{from:'2026-10-19',startMinute:630,endMinute:1380}]});
 breakfast.sourceMetadata={mealPeriods:[1]};regular.sourceMetadata={mealPeriods:[2,3,4,5]};
 const data={...demo,offers:[breakfast,regular]};
 for(const extra of [{},{people:7},{budgetMinor:30000}]){
  const s=P.planningContext(data,{...request,...extra,demand:{hashBrown:2}}).schedules[0];
  assert.deepEqual(s.periods,[{label:'早餐優惠',windows:[[480,630]]},{label:'一般餐點優惠',windows:[[630,1380]]}]);
 }
 const s=P.planningContext(data,{...request,demand:{hashBrown:2,chicken:8}}).schedules[0];
 assert.deepEqual(s.windows,[[630,1380]]);assert.equal(s.periods.length,1);assert.equal(s.periods[0].label,'一般餐點優惠');
 assert.deepEqual(s.allPeriods,[{label:'早餐優惠',windows:[[480,630]]},{label:'一般餐點優惠',windows:[[630,1380]]}]);
 assert.equal(s.allUnknown,false);
 // Selecting a regular meal cannot hide the breakfast reference. Brand/date/
 // fulfilment restrictions still apply to that reference, just like the menu.
 const dayOff=P.planningContext(data,{...request,at:'2026-10-18T13:00:00+08:00',demand:{chicken:8}}).schedules[0];
 assert.deepEqual(dayOff.allPeriods,[]);
 const delivery=P.planningContext(data,{...request,channel:'delivery',demand:{chicken:8}}).schedules[0];
 assert.deepEqual(delivery.allPeriods,[]);
});
test('production Pizza Hut menu excludes KFC mains and an 8-plus-3 quote exposes its full time range',()=>{
 const data=require('../data/offers.json');
 const menu=P.planningContext(data,{...request,brands:['PH']});assert(menu.mains.includes('pizza'));assert(!menu.mains.includes('chicken'));assert(!menu.items.includes('paperChicken'));assert(!menu.snacks.includes('tart'));
 const r={...request,demand:{chicken:8,paperChicken:3},people:6,budgetMinor:null,cross:true,maxOrders:6,estimate:true,at:'2026-10-18T23:43:00+08:00'};
 const x=F.recommend(data,r,{maxStates:10000,timeLimitMs:100,referenceMaxStates:10000,referenceTimeLimitMs:100});assert(x.timeReference);
 const hours=P.planTimeWindows(x.timeReference.plan,x.timeReference.at);assert.equal(hours.unknown,false);assert.equal(P.formatWindows(hours.windows),'10:30–23:00');
});
test('period badges require both the selected meal time and the selected food windows',()=>{
 const breakfast={windows:[[480,630]]},regular={windows:[[630,1380]]};
 const chicken={requested:['chicken'],unknown:false,windows:[[630,1380]]};
 assert.equal(P.periodStatus(chicken,breakfast,490),'unavailable'); // 08:10
 assert.equal(P.periodStatus(chicken,regular,490),'outside_period');
 assert.equal(P.periodStatus(chicken,breakfast,629),'unavailable');
 assert.equal(P.periodStatus(chicken,breakfast,630),'outside_period');
 assert.equal(P.periodStatus(chicken,regular,630),'matching');
 assert.equal(P.periodStatus(chicken,regular,780),'matching');
 assert.equal(P.periodStatus(chicken,regular,1380),'outside_period');
 const hashBrown={...chicken,requested:['hashBrown'],windows:[[480,1380]]};
 assert.equal(P.periodStatus(hashBrown,breakfast,490),'matching');
 assert.equal(P.periodStatus(hashBrown,regular,490),'outside_period');
 const lunchOnly={...chicken,windows:[[720,840],[1020,1320]]};
 assert.equal(P.periodStatus(lunchOnly,regular,900),'unavailable');
 assert.equal(P.periodStatus({...chicken,unknown:true},regular,780),'unknown');
 assert.equal(P.periodStatus({...chicken,requested:[]},breakfast,490),'no_selection');
});
