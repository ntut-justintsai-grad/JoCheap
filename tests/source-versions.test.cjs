const test=require('node:test'),assert=require('node:assert/strict'),F=require('../src/engine.js'),demo=require('../data/demo.json');
const at='2026-10-18T12:00:00+08:00',now=Date.parse(at);
function version(key,items,price){const o=structuredClone(demo.offers[0]);return {...o,id:'same',code:'same',title:key,sourceVersionKey:key,dataStatus:'estimate',priceType:'fixed',verification:{status:'unverified'},variants:[{id:'base',items,priceMinor:price,channels:['takeaway']}],validity:{validWindows:[{from:'2026-10-01',toExclusive:'2026-11-01'}]},limits:{maxUsesPerUserPerDay:2},provenance:{...o.provenance,fetchedAt:'2026-10-15T00:00:00Z'}};}
function dataset(versions){return {...demo,mode:'real',recommendationPolicy:{allowAllSources:true},offers:[{...versions[0],dataStatus:'conflict',sourceVersions:versions,observations:[],reviewReason:'價格與餐點不同'}]};}
const req={demand:{chicken:2,tart:1},people:2,budgetMinor:null,brands:['KFC'],cross:true,channel:'takeaway',orderMethod:'official_web',allowUnknownOrdering:true,at,maxOrders:2,estimate:true,dataScope:'all',allowExtras:true};
test('conflicting sources are individually usable but cannot be mixed for the same code',()=>{
 const data=dataset([version('A',{chicken:2},10000),version('B',{tart:1},5000)]);
 const x=F.solve(data,req,{now,timeLimitMs:10000});
 assert.equal(x.plans.length,0);assert(x.partials.length);
 for(const p of x.partials)assert.equal(new Set(p.orders.map(o=>o.sourceVersionKey)).size,1);
 assert.equal(F.chooseCandidates(data,req,now).candidates.length,2);
 assert.equal(F.chooseCandidates(data,{...req,dataScope:'consistent'},now).candidates.length,0);
 assert.equal(F.chooseCandidates(data,{...req,dataScope:'official'},now).candidates.length,0);
});
test('each priced plan retains one complete source recipe and its own price, including after 24 hours',()=>{
 const data=dataset([version('A',{chicken:2,tart:1},12000),version('B',{chicken:4,tart:2},17000)]);
 const x=F.solve(data,req,{now,timeLimitMs:10000});assert(x.plans.length>=2);
 for(const p of x.plans){assert.equal(new Set(p.orders.map(o=>o.sourceVersionKey)).size,1);for(const o of p.orders){assert.equal(o.base,o.sourceVersionKey==='A'?12000:17000);assert.equal(o.confidence.level,'conflict');}}
 const expired=structuredClone(data);for(const v of expired.offers[0].sourceVersions)v.validity.validWindows=[{toExclusive:'2026-10-18'}];
 assert.equal(F.chooseCandidates(expired,req,now).candidates.length,0);
 const member=structuredClone(data);for(const v of member.offers[0].sourceVersions)v.eligibility={memberRequired:true};
 assert.equal(F.chooseCandidates(member,{...req,member:false},now).candidates.length,0);
});
test('missing prices and unidentified food remain available as raw records, never zero-price recommendations',()=>{
 const a=version('A',{food_abcdefabcdef:1},100),b=version('B',{chicken:2},null);a.dataStatus='pending';b.priceType='unknown';
 const data=dataset([a,b]);assert.equal(data.offers[0].sourceVersions.length,2);assert.equal(F.chooseCandidates(data,req,now).candidates.length,0);
});
