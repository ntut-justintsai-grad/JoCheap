const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine.js'),snapshot=require('./fixtures/paper_chicken_20261017.json');
F.extendItems(snapshot);
const at='2026-10-17T13:00:00+08:00';
const request={demand:{paperChicken:1},people:1,budgetMinor:null,brands:['KFC'],cross:false,channel:'takeaway',at,maxOrders:1,estimate:true,allowExtras:true,drinkPreference:'any'};
test('26900 conflicting title and structured contents cannot enter recommendations, even from an old snapshot',()=>{
 const offer=snapshot.offers.find(o=>o.code==='26900');
 assert.equal(offer.dataStatus,'estimate'); // The captured record previously passed ingestion.
 assert.match(F.mealIdentityIssue(offer),/不一致/);
 for(const demand of [{paperChicken:1},{chicken:2}]){
  const result=F.chooseCandidates({offers:[offer]}, {...request,demand},Date.parse(at));
  assert.equal(result.candidates.length,0);
  assert(result.excluded[0].reasons.some(r=>r.includes('不一致')));
 }
});
test('paper chicken catalogue selection shows the replacement quantity and its actual surcharge',()=>{
 const offer=snapshot.offers.find(o=>o.code==='16144');
 assert.equal(F.mealIdentityIssue(offer),null);
 const plain=F.catalogChoice(offer,'all',at),paper=F.catalogChoice(offer,'paperChicken',at);
 assert.equal(plain.selected.items.chicken,2);assert.equal(plain.selected.items.paperChicken,undefined);
 assert.equal(paper.selected.items.paperChicken,1);assert.equal(paper.selected.items.chicken,undefined);
 assert.equal(paper.total,plain.total+1300);
 assert.equal(paper.selections['slot-2'][0],1);
 assert.deepEqual(F.applyOptions(paper.base,paper.selections,at).items,paper.selected.items);
 const plan=F.solve({offers:[offer]},request).plans[0];
 assert.equal(plan.totalCost,paper.total);assert.equal(plan.orders[0].items.paperChicken,1);
 assert.equal(F.solve({offers:[offer]},{...request,budgetMinor:plain.total}).plans.length,0);
 assert.equal(F.catalogChoice(offer,'pizza13',at),null);
});
