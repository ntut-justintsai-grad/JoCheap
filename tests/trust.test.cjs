const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine.js'),snapshot=require('./fixtures/official_verified_20261017.json'),demo=require('../data/demo.json');
const now=Date.parse('2026-10-17T10:15:00Z');
const req={demand:{chicken:6},people:3,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',orderMethod:'official_web',paymentMethod:'any',allowUnknownOrdering:false,at:'2026-10-17T18:15:00+08:00',maxOrders:6,estimate:true,allowExtras:true,avoid:[],drinkPreference:'any'};
function solve(data=snapshot,r=req){return F.recommend(data,r,{now,timeLimitMs:3000});}
test('Python review binding is checked identically by the browser engine',()=>{
 for(const o of snapshot.offers){assert.equal(F.contentSignature(o),o.verification.contentSignature);assert.equal(F.verificationCheck(o,now).allowed,true);}
 const result=solve();assert(result.plans.length);assert.equal(result.plans[0].totalCost,33300);
 assert(result.plans.every(p=>p.orders.every(o=>o.verification?.status==='checked')));
});
test('unverified cheap coupons cannot enter strict results or any rescue path',()=>{
 const data=structuredClone(snapshot),bad=structuredClone(demo.offers[0]);
 bad.id='unverified-cheap';bad.dataStatus='estimate';bad.variants[0].priceMinor=1;
 data.offers.push(bad);
 for(const demand of [{chicken:6},{pizza13:1},{paperChicken:2}]){
  const x=solve(data,{...req,demand});
  for(const p of [...x.plans,...x.suggestions,...x.partials,...(x.minimumIgnoringBudget?[x.minimumIgnoringBudget]:[])])assert(p.orders.every(o=>o.offerId!=='unverified-cheap'));
 }
 const only={...data,offers:[bad]};const x=solve(only);assert.equal(x.plans.length,0);assert.equal(x.suggestions.length,0);assert.equal(x.partials.length,0);assert(x.unpricedAlternative);
});
test('expired checks, future planned dates, wrong methods and unreviewed upgrades are excluded',()=>{
 for(const change of [o=>o.variants[0].priceMinor++,o=>o.variants[0].items.chicken++,o=>o.ordering.platforms.push('counter'),o=>o.variants[0].optionGroups.push({id:'fake',count:1,baseItems:{chicken:6},options:[]})]){
  const o=structuredClone(snapshot.offers.find(o=>o.code==='50529'));change(o);assert.equal(F.verificationCheck(o,now).allowed,false);
 }
 for(const time of ['2026-10-17T12:02:00Z','2026-10-25T10:15:00Z'])assert(snapshot.offers.every(o=>!F.verificationCheck(o,Date.parse(time)).allowed));
 assert.equal(F.chooseCandidates(snapshot,{...req,at:'2026-10-18T18:15:00+08:00'},now).candidates.length,0);
 assert.equal(F.chooseCandidates(snapshot,{...req,orderMethod:'counter'},now).candidates.length,0);
 assert.equal(F.chooseCandidates(snapshot,{...req,channel:'delivery'},now).candidates.length,0);
 assert(snapshot.offers.every(o=>o.variants.every(v=>!v.optionGroups.length)));
});
test('conservative usage caps also apply to alternatives; no unknown amounts become zero',()=>{
 const one={...snapshot,offers:[snapshot.offers.find(o=>o.code==='50529')]};
 const x=solve(one,{...req,demand:{chicken:12}});
 assert.equal(x.plans.length,0);
 for(const p of [...x.suggestions,...x.partials])assert(p.orders.filter(o=>o.code==='50529').length<=1);
 const none=solve({...snapshot,offers:[]});assert(none.unpricedAlternative);assert.equal(none.minimumIgnoringBudget,null);
});
