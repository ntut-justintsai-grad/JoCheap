const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../src/engine.js');
const demo=JSON.parse(fs.readFileSync(__dirname+'/../data/demo.json','utf8'));
const real=JSON.parse(fs.readFileSync(__dirname+'/fixtures/approved_v03.json','utf8'));
const six={...demo,offers:demo.offers.slice(0,6)};
const NOW=Date.parse('2026-10-16T12:00:00+08:00');
function req(extra={}){return {demand:{chicken:4,tart:2},people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',at:'2026-10-16T12:00:00+08:00',maxOrders:4,estimate:false,exact:false,allowExtras:true,avoid:[],...extra};}
function solve(r,ds=six,config={}){return F.solve(ds,req(r),{now:NOW,timeLimitMs:10000,...config});}
function total(r,ds=six){return solve(r,ds).plans[0]?.totalCost;}
test('specification independent price examples',()=>{
 assert.equal(total({demand:{chicken:4}}),24900);
 assert.equal(total({}),27800);
 assert.equal(total({maxOrders:1}),29900);
 assert.equal(total({demand:{chicken:4,tart:2,pizza13:1}}),47700);
 assert.equal(total({demand:{chicken:4,tart:2,pizza13:1},maxOrders:2}),49800);
 assert.equal(solve({demand:{chicken:4,tart:2,pizza13:1},cross:false}).plans.length,0);
 const fees={KFC:[3900,3900,3900,3900],PH:[4900,4900,4900,4900]};
 assert.equal(total({demand:{chicken:4,tart:2,pizza13:1},channel:'delivery',fees}),58600);
 const under=solve({budgetMinor:27000});assert.equal(under.plans.length,0);assert.equal(under.minimumIgnoringBudget.totalCost,27800);
});
test('invalid inputs rejected and all-zero demand does not search',()=>{
 for(const demand of [{chicken:0},{chicken:-1},{chicken:1.5},{chicken:61},{chicken:NaN},{bad:1}])assert.throws(()=>solve({demand}));
 for(const budgetMinor of [-1,NaN,Infinity,1.1])assert.throws(()=>solve({budgetMinor}));
 assert.throws(()=>solve({fees:{KFC:[-1]}}));assert.throws(()=>solve({brands:[]}));assert.throws(()=>solve({people:0}));
});
test('at least, exact, extras and avoid have distinct behavior',()=>{
 const cheapExtra=structuredClone(six);cheapExtra.offers[4].variants[0].priceMinor=18000;
 assert.equal(total({demand:{chicken:3}},cheapExtra),18000); // four on sale costs less than three singles
 assert.equal(total({demand:{chicken:3},exact:true},cheapExtra),19500); // three DEMO-B
 assert.equal(total({demand:{chicken:4},allowExtras:false}),24900);
 assert.notEqual(total({avoid:['tart']}),27800);
 assert.equal(solve({avoid:['tart']}).plans.length,0);
});
test('fees are per order; missing fee is not zero and cannot prove budget',()=>{
 const x=solve({demand:{chicken:4,tart:2,pizza13:1},channel:'delivery',fees:{KFC:[3900],PH:[4900]}});
 assert.equal(x.plans[0].totalCost,58600); // one KFC order and one PH order
 const unknown=solve({channel:'delivery',budgetMinor:30000});
 assert.equal(unknown.plans[0].totalCost,null);assert.equal(unknown.plans[0].unknownCosts,true);
 const surcharge=structuredClone(six);surcharge.offers[0].variants[0].surchargeMinor=2000;
 assert.equal(total({},surcharge),29900);
});
test('limits apply across variants and shared groups; expired, app and add-on filtered',()=>{
 const ds=structuredClone(six);const a=ds.offers[0];
 a.limits.maxUsesPerUserPerDay=1;a.variants.push({...structuredClone(a.variants[0]),id:'second'});
 assert.equal(total({},ds),29900);
 ds.offers[5].eligibility.appRequired=true;
 assert.notEqual(total({},ds),29900);assert.equal(total({app:true},ds),29900);
 ds.offers[0].limits.sharedLimitGroup='one';ds.offers[0].limits.sharedGroupMax=1;
 ds.offers[1].limits.sharedLimitGroup='one';ds.offers[1].limits.sharedGroupMax=1;
 ds.offers[5].validity.validWindows=[{toExclusive:'2026-10-16'}];
 assert.notEqual(total({app:true},ds),29900);
 const addon=structuredClone(six.offers[0]);addon.id='addon';addon.requiresParent='main';addon.variants[0].priceMinor=100;
 assert.equal(total({},{...six,offers:[...six.offers,addon]}),27800);
});
test('Taipei midnight, separated windows, weekdays and time boundaries',()=>{
 const o={validity:{validWindows:[{from:'2026-10-01',toExclusive:'2026-10-16'},{from:'2026-10-18',toExclusive:'2026-10-20',startMinute:600,endMinute:660}]}};
 assert.equal(F.isActive(o,Date.parse('2026-10-15T23:59:59+08:00')),true);
 assert.equal(F.isActive(o,Date.parse('2026-10-16T00:00:00+08:00')),false);
 assert.equal(F.isActive(o,Date.parse('2026-10-18T10:00:00+08:00')),true);
 assert.equal(F.isActive(o,Date.parse('2026-10-18T11:00:00+08:00')),false);
});
test('real source conflicts never enter estimates; no unknown rule promoted to verified',()=>{
 const strict=solve({demand:{chicken:4}},real);assert.equal(strict.plans.length,0);
 const x=solve({demand:{chicken:4},estimate:true},real);
 assert(x.plans.length);assert.equal(x.plans[0].eligibilityStatus,'needs_confirmation');
 assert(x.plans.every(p=>p.orders.every(o=>!['26953','26701'].includes(o.code))));
 const stale=structuredClone(real);stale.offers.forEach(o=>o.dataStatus=o.dataStatus==='conflict'?'conflict':'ready');
 const y=solve({demand:{chicken:4}},stale,{now:NOW+48*3600000});assert.equal(y.plans.length,0);
});
test('timeout does not claim completion',()=>{
 const x=solve({demand:{chicken:4,tart:2},maxOrders:6},demo,{maxStates:1});assert.equal(x.searchComplete,false);
});
test('people mode: independent mains differ from shared pizza; six-person presets editable',()=>{
 assert.deepEqual(F.buildDemand({people:6,serving:'shared',preference:'mixed',appetite:'normal'}),{pizza9:2,chicken:6});
 assert.deepEqual(F.buildDemand({people:6,serving:'individual',preference:'mixed',appetite:'big'}),{individual:6,friesSmall:6,drinkSmall:6});
 assert.deepEqual(F.buildDemand({people:6,serving:'individual',side:'tart'}),{individual:6,tart:6,drinkSmall:6});
 assert.deepEqual(F.buildDemand({people:6,serving:'shared',preference:'mixed',snacks:['tart','nuggets','potatoCoinsSmall']}),{pizza9:2,chicken:6,tart:6,nuggets:12,potatoCoinsSmall:3});
 assert.equal(total({demand:{individual:6},maxOrders:6},demo),77400);
 assert.equal(solve({demand:{individual:6},brands:['PH'],maxOrders:6},demo).plans.length,0);
});
test('individual meal contains a side and drink, with mains not mislabeled as extras',()=>{
 const demand=F.buildDemand({people:6,serving:'individual'});
 const result=solve({demand,maxOrders:6},demo);
 assert.equal(result.plans[0].totalCost,77400);
 assert.equal(result.plans[0].extras.burger,undefined);
 assert.equal(result.plans[0].extras.friesSmall,undefined);
 const noSides=structuredClone(demo);noSides.offers=noSides.offers.filter(o=>o.code==='DEMO-G');noSides.offers[0].variants[0].items.friesSmall=0;
 assert.equal(solve({demand,maxOrders:6},noSides).plans.length,0);
});
test('snack catalogue has actual source variants; alternatives remain exclusive',()=>{
 for(const id of Object.keys(F.SNACKS))assert(real.offers.some(o=>o.dataStatus!=='conflict'&&o.variants.some(v=>v.items[id]>0)),'missing source snack '+id);
 const row=real.offers.find(o=>o.code==='16422');
 assert.equal(row.variants.length,3);
 assert(row.variants.every(v=>Number(Boolean(v.items.potatoCoinsLarge))+Number(Boolean(v.items.mochiQQ))+Number(Boolean(v.items.greenTea1250))===1));
 const ds={...real,offers:[row]};
 assert.equal(solve({demand:{potatoCoinsLarge:1,mochiQQ:10},maxOrders:1,estimate:true},ds).plans.length,0);
 assert.equal(solve({demand:{potatoCoinsLarge:1,mochiQQ:10},maxOrders:2,estimate:true},ds).plans[0].orders.length,2);
 const limited=structuredClone(ds);limited.offers[0].limits.maxUsesPerUserPerDay=1;
 assert.equal(solve({demand:{potatoCoinsLarge:1,mochiQQ:10},maxOrders:2,estimate:true},limited).plans.length,0);
});
test('production result matches an independent Cartesian product oracle',()=>{
 // This oracle enumerates use-count vectors rather than calling any production filtering/search helper.
 let seed=423;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let trial=0;trial<100;trial++){
  const offers=Array.from({length:4},(_,i)=>{const row=structuredClone(six.offers[i]);row.id='random'+i;row.brand=i%2?'PH':'KFC';row.variants=[{id:'v',priceMinor:Math.ceil(rand()*200)*100,surchargeMinor:0,channels:['takeaway'],items:{chicken:Math.floor(rand()*4),tart:Math.floor(rand()*3)}}];row.limits.maxUsesPerUserPerDay=1+Math.floor(rand()*3);return row;});
  const demand={chicken:1+Math.floor(rand()*6),tart:Math.floor(rand()*4)},limit=1+Math.floor(rand()*4);
  let best=Infinity;
  for(let a=0;a<=offers[0].limits.maxUsesPerUserPerDay;a++)for(let b=0;b<=offers[1].limits.maxUsesPerUserPerDay;b++)for(let c=0;c<=offers[2].limits.maxUsesPerUserPerDay;c++)for(let d=0;d<=offers[3].limits.maxUsesPerUserPerDay;d++){
    const uses=[a,b,c,d];if(uses.reduce((a,b)=>a+b,0)>limit)continue;
    const got={chicken:0,tart:0};let cost=0;for(let i=0;i<4;i++){const v=offers[i].variants[0];got.chicken+=uses[i]*v.items.chicken;got.tart+=uses[i]*v.items.tart;cost+=uses[i]*v.priceMinor;}
    if(got.chicken>=demand.chicken&&got.tart>=demand.tart)best=Math.min(best,cost);
  }
  const x=solve({demand,maxOrders:limit},{...six,offers});assert.equal(x.plans[0]?.totalCost??Infinity,best,'trial '+trial);assert.equal(x.searchComplete,true);
 }
});
test('deterministic tie order and readable source schema',()=>{
 const a=solve({}),b=solve({});assert.equal(a.plans[0].id,b.plans[0].id);
 for(const ds of [demo,real]){assert.equal(ds.schemaVersion,1);assert.equal(new Set(ds.offers.map(o=>o.id)).size,ds.offers.length);}
});
