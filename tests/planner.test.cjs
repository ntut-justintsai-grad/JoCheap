const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../src/engine.js'),P=require('../src/planner.js');
const real=JSON.parse(fs.readFileSync(__dirname+'/fixtures/approved_v03.json','utf8'));
const demo=JSON.parse(fs.readFileSync(__dirname+'/../data/demo.json','utf8'));
function request(extra={}){return {demand:{pizza9:2},people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',at:'2026-10-16T18:30:00+08:00',maxOrders:4,estimate:true,allowExtras:true,...extra};}
test('richness levels add distinct categories and headcount-scaled small portions',()=>{
 const levels=['light','normal','rich'].map(richness=>P.buildSimple({people:6,family:'mixed',richness}));
 assert.deepEqual(levels.map(x=>x.snackGoal.minTypes),[1,2,3]);
 assert.deepEqual(levels.map(x=>x.snackGoal.servings),[3,5,6]);
 assert.deepEqual(levels[1].demand,{pizza9:2,chicken:6,snackPortions:5});
});
test('pizza slice estimates differ by selected size and editable cut assumption',()=>{
 const s=P.buildSimple({people:6,family:'pizza',pizzaSize:'small'}),l=P.buildSimple({people:6,family:'pizza',pizzaSize:'large'});
 assert.equal(s.demand.pizza9,3);assert.equal(l.demand.pizza13,2);
 assert.equal(s.portion.slicesPerPerson,3);assert.equal(l.portion.slicesPerPerson,2);assert.equal(s.portion.referenceOnly,true);
 assert.equal(P.buildSimple({people:6,family:'pizza',smallCuts:4}).demand.pizza9,5);
});
test('paper chicken and pasta are real main families with individual side/drink defaults',()=>{
 for(const [family,id] of [['wrapped','paperChicken'],['pasta','pasta']]){
  const b=P.buildSimple({people:6,family});assert.equal(b.demand[id],6);assert.equal(b.demand.drinkServing,6);assert.equal(b.demand.snackPortions,6);assert.equal(b.maxOrders,12);
  assert(real.offers.some(o=>o.dataStatus!=='conflict'&&o.variants.some(v=>v.items[id]>0)));
 }
});
test('two seafood flavors are actually assigned from their allowed source groups',()=>{
 const offer=real.offers.find(o=>o.code==='16448');const d={...real,offers:[offer]};
 const x=F.solve(d,request({maxOrders:1,pizzaPreference:{tag:'seafood',minKinds:2}}));
 assert.equal(x.plans[0].totalCost,25000);assert.equal(x.plans[0].pizzaFlavors,2);
 assert(x.plans[0].orders[0].pizzaChoices.every(c=>real.pizzaFlavors[c.flavorId].tags.includes('seafood')));
 const prohibited=real.offers.find(o=>o.code==='16420');
 assert.equal(F.solve({...real,offers:[prohibited]},request({maxOrders:1,pizzaPreference:{tag:'seafood',minKinds:1}})).plans.length,0);
});
test('repeating one fixed flavor never satisfies two kinds',()=>{
 const o=structuredClone(demo.offers.find(o=>o.code==='DEMO-H'));o.variants[0].pizzaSlots=[{size:'pizza9',allowed:['demo-sea-a']},{size:'pizza9',allowed:['demo-sea-a']}];
 const x=F.solve({...demo,offers:[o]},request({maxOrders:2,pizzaPreference:{tag:'seafood',minKinds:2}}));assert.equal(x.plans.length,0);
});
test('three QQ variants count as one snack type, not three',()=>{
 const o=structuredClone(demo.offers.find(o=>o.code==='DEMO-H'));Object.assign(o.variants[0].items,{qq:4,chocolateQQ:5,mochiQQ:5});
 const x=F.solve({...demo,offers:[o]},request({demand:{pizza9:2,snackPortions:3},maxOrders:1,snackGoal:{minTypes:3,servings:3}}));assert.equal(x.plans.length,0);
 const y=F.solve({...demo,offers:[o]},request({demand:{pizza9:2,snackPortions:3},maxOrders:1,snackGoal:{minTypes:1,servings:3}}));assert.equal(y.plans[0].snackTypes.length,1);
 assert.equal(Object.keys(y.plans[0].extras).length,0);
});
test('snacks remain explicitly grouped by brand',()=>{
 for(const [id,brand] of [['tart','KFC'],['nuggets','KFC'],['potatoCoinsSmall','PH'],['germanSausage','PH']])assert.equal(P.SNACK_META[id].brand,brand);
});
test('Chinese description becomes a reviewable patch without submitting a search',()=>{
 const x=P.interpret('六個人，每人200，海鮮披薩兩種口味，點心很豐富，外帶');
 assert.equal(x.patch.people,6);assert.equal(x.patch.budget,200);assert.equal(x.patch.budgetType,'person');assert.equal(x.patch.flavorTag,'seafood');assert.equal(x.patch.flavorKinds,2);assert.equal(x.patch.richness,'rich');assert.equal(x.method,'local_rules');
 assert.equal(P.interpret('八人總預算一千六，義大利麵').patch.budget,1600);
 assert.equal(P.number('一千零六'),1006);assert.equal(P.number('一百五'),150);
 assert.equal(P.interpret('一人150元，紙包雞').patch.people,undefined);
});
test('unverified exclusions, ambiguous headcounts and exact-only demands are surfaced',()=>{
 assert(P.interpret('6人不要辣，不吃牛，海鮮過敏').warnings.length);
 assert.equal(P.interpret('6～8人吃披薩').patch.people,undefined);
 const x=P.interpret('只要4塊炸雞和2顆蛋撻');assert.deepEqual(x.patch.explicitDemand,{chicken:4,tart:2});assert(x.warnings.length);
});
test('newly discovered source code conflict is quarantined in both records',()=>{
 const rows=real.offers.filter(o=>o.brand==='PH'&&o.code==='16325');assert.equal(rows.length,2);assert(rows.every(o=>o.dataStatus==='conflict'));
});
test('arbitrary main selections divide diners instead of multiplying full meals',()=>{
 const pair=P.buildSimple({people:6,mains:['pasta','wrapped']});
 assert.deepEqual(pair.mains,['wrapped','pasta']);
 assert.deepEqual(pair.demand,{paperChicken:3,pasta:3,drinkServing:6,snackPortions:6});
 const triple=P.buildSimple({people:6,mains:['pizza','wrapped','pasta'],flavorTag:'seafood'});
 assert.deepEqual(triple.mainAllocation.map(m=>m.people),[2,2,2]);
 assert.equal(triple.demand.pizza9,1);assert.equal(triple.demand.paperChicken,2);assert.equal(triple.demand.pasta,2);
 assert.equal(triple.pizzaPreference.tag,'seafood');assert.equal(triple.pastaPreference,'seafood');
 const odd=P.buildSimple({people:7,mains:['pasta','burger','wrapped']});
 assert.deepEqual(odd.mainAllocation.map(m=>m.people),[3,2,2]);
 assert.deepEqual(odd.demand,P.buildSimple({people:7,mains:['wrapped','burger','pasta','pasta']}).demand);
});
test('every nonempty main subset keeps at least one real unit and validates manual edits',()=>{
 const ids=Object.keys(P.MAINS);
 for(let mask=1;mask<32;mask++)for(const people of [1,5,6,8]){
  const mains=ids.filter((_,i)=>mask&(1<<i)),b=P.buildSimple({people,mains});
  assert.equal(b.mainAllocation.length,mains.length);
  assert.equal(b.mainAllocation.reduce((n,m)=>n+m.people,0),Math.max(people,mains.length));
  assert(b.mainAllocation.every(m=>b.demand[m.item]>=1));
  assert.doesNotThrow(()=>P.validateMainDemand(b,b.demand));
  const changed={...b.demand,[b.mainAllocation[0].item]:0};assert.throws(()=>P.validateMainDemand(b,changed),/取消主餐/);
 }
 assert.throws(()=>P.buildSimple({people:6,mains:[]}),/至少選一種/);
 assert.throws(()=>P.buildSimple({people:6,mains:['unknown']}),/有效/);
 assert.equal(P.buildSimple({people:1,mains:ids}).allocationOverflow,true);
 assert.deepEqual(P.normalizeMains({family:'mixed'}),['pizza','chicken']);
});
test('solver must cover every mixed main and never uses paper chicken or pasta as a burger',()=>{
 const b=P.buildSimple({people:6,mains:['burger','wrapped','pasta']});
 const result=F.solve(demo,request({...b,maxOrders:10}));
 assert(result.plans.length);assert(result.plans.every(p=>p.coverage.every(c=>c.got>=c.need)));
 const best=result.plans[0],counts={};for(const o of best.orders)for(const [id,n] of Object.entries(o.items))counts[id]=(counts[id]||0)+n;
 assert(counts.burger>=2&&counts.paperChicken>=2&&counts.pasta>=2);
 assert.equal(best.extras.burger,undefined);
 for(const code of ['DEMO-G','DEMO-I','DEMO-J']){
  const reduced={...demo,offers:demo.offers.filter(o=>o.code!==code)};
  assert.equal(F.solve(reduced,request({...b,maxOrders:10})).plans.length,0,'must not omit '+code);
 }
 const mini=structuredClone(demo.offers.find(o=>o.code==='DEMO-G'));mini.variants[0].individualMains=0;delete mini.variants[0].individualMainItems;
 assert.equal(F.solve({...demo,offers:[mini]},request({demand:{burgerMain:1},maxOrders:1})).plans.length,0);
});
test('mixed text preserves all mains and explicit counts in either order',()=>{
 const a=P.interpret('六人，紙包雞3份、3份義大利麵，點心有一點');
 assert.deepEqual(a.patch.mains,['wrapped','pasta']);assert.deepEqual(a.patch.explicitDemand,{paperChicken:3,pasta:3});
 assert(!a.warnings.length);
 const b=P.interpret('6人，披薩加漢堡、義大利麵，兩種口味');assert.deepEqual(b.patch.mains,['pizza','burger','pasta']);
 const c=P.interpret('披薩和義大利麵，不要炸雞');assert.deepEqual(c.patch.mains,['pizza','pasta']);assert(c.warnings.some(s=>s.includes('完全排除')));
 assert.deepEqual(P.interpret('2個漢堡和4塊炸雞').patch.explicitDemand,{chicken:4,burgerMain:2});
});
