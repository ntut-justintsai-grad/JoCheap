const test=require('node:test'),assert=require('node:assert/strict'),F=require('../src/engine.js'),demo=require('../data/demo.json');
const at='2026-10-18T13:00:00+08:00',now=Date.parse(at),endpoint='https://www.pizzahut.com.tw/order/?m=ajax';
function lookup(status='matched'){return {code:'16448',endpoint,status,checkedAt:'2026-10-18T04:00:00Z',...(status==='matched'?{productId:19169,typeId:1025}:{})};}
function data(q=lookup()){
 const v={...structuredClone(demo.offers[0]),id:'ph-16448',code:'16448',brand:'PH',dataStatus:'estimate',priceType:'fixed',variants:[{id:'base',priceMinor:25000,items:{pizza9:2},channels:['takeaway']}],validity:{validWindows:[{from:'2026-10-01',toExclusive:'2026-12-01'}]},verification:{status:'unverified'},limits:{maxUsesPerUserPerDay:1}};
 return {mode:'real',recommendationPolicy:{allowAllSources:true},sourcePolicy:{PH:{apiIntegration:'code_lookup'}},offers:[{...v,couponLookup:q,sourceVersions:[{...v,sourceVersionKey:'A'},{...v,sourceVersionKey:'B',variants:[{...v.variants[0],priceMinor:26000}]}]}]};
}
const req={demand:{pizza9:2},people:2,budgetMinor:null,brands:['PH'],cross:true,channel:'takeaway',orderMethod:'official_web',allowUnknownOrdering:true,at,maxOrders:2,estimate:true,dataScope:'all',allowExtras:true};
test('official matching keeps external prices and recipes, and follows the code across source versions',()=>{
 const ds=data(),result=F.solve(ds,req,{now,timeLimitMs:10000});assert.equal(result.plans[0].totalCost,25000);
 for(const p of result.plans){assert.notEqual(p.eligibilityStatus,'official_configuration_checked');}for(const p of result.plans)for(const o of p.orders){assert.equal(o.couponLookup.productId,19169);assert(o.confidence.label.includes('餐點價目依來源估算'));assert(o.officialUrl.includes('cno=16448'));}
 const selected=F.catalogOffer(ds.offers[0],'B',now);assert.equal(selected.variants[0].priceMinor,26000);assert.equal(selected.couponLookup.productId,19169);
});
test('an explicitly rejected code cannot enter full, partial, over-budget or rescue plans through any source version',()=>{
 const ds=data(lookup('invalid'));const x=F.recommend(ds,{...req,budgetMinor:1},{now,timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert.equal(x.partials.length,0);assert.equal(x.suggestions.length,0);assert.equal(x.minimumIgnoringBudget,null);assert(x.unpricedAlternative);
 assert.equal(F.chooseCandidates(ds,req,now).candidates.length,0);
 assert.equal(F.couponLookupCheck(F.catalogOffer(ds.offers[0],'B',now),now).status,'invalid');
});
test('lookup failures remain pending, preserve prior successful time, and never revive prior invalid codes',()=>{
 const failed={code:'16448',endpoint,status:'error',attemptedAt:'2026-10-18T05:00:00Z'};
 assert.equal(F.couponLookupCheck(data(failed).offers[0],now).status,'pending');assert.equal(F.solve(data(failed),req,{now}).plans.length,0);
 const retained={...failed,lastSuccess:lookup()};const pair=F.couponLookupCheck(data(retained).offers[0],now);assert(pair.allowed);assert(pair.retained);assert.equal(pair.checkedAt,lookup().checkedAt);assert(pair.label.includes('沿用'));
 assert(F.solve(data(retained),req,{now}).plans.length);
 const invalid={...failed,lastSuccess:lookup('invalid')};assert.equal(F.couponLookupCheck(data(invalid).offers[0],now).status,'invalid');assert.equal(F.solve(data(invalid),req,{now}).plans.length,0);
});
test('foreign code mappings, future checks and missing mappings cannot satisfy the production policy',()=>{
 for(const q of [undefined,{...lookup(),code:'99999'},{...lookup(),productId:null},{...lookup(),checkedAt:'2026-10-19T00:00:00Z'}]){
  const ds=data(q);if(q===undefined)delete ds.offers[0].couponLookup;assert.equal(F.chooseCandidates(ds,req,now).candidates.length,0);
 }
 const stale={...lookup(),checkedAt:'2026-10-01T00:00:00Z'};assert(F.couponLookupCheck(data(stale).offers[0],now).stale);
});
