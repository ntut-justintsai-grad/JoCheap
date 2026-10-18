// Validate refreshed production data independently of historical fixtures.
const assert=require('node:assert/strict'),F=require('../src/engine.js'),data=require('../data/offers.json');
assert.equal(data.recommendationPolicy?.allowAllSources,true);
assert.equal(data.recommendationPolicy?.requireOfficial,false);
assert.equal(data.parserVersion,6);
assert.deepEqual(data.sources.map(s=>s.sourceId).sort(),['calling-ph','kcouper','talk-ph']);
assert.equal(data.qualityReport?.total,data.offers.length);
assert.equal(data.sourcePolicy.PH.apiIntegration,'code_lookup');
const ph=data.offers.filter(o=>o.brand==='PH');
assert.equal(data.pizzahutLookup.total,ph.length);
for(const o of ph){assert.equal(o.couponLookup?.code,o.code);assert.equal(o.couponLookup.endpoint,'https://www.pizzahut.com.tw/order/?m=ajax');assert(['matched','invalid','error'].includes(o.couponLookup.status));}
const now=Date.parse(data.generatedAt),checked=data.offers.filter(o=>F.verificationCheck(o,Date.parse(data.officialRefresh.attemptedAt)||now).allowed);
assert.equal(checked.length,data.officialRefresh.checked||0);
for(const o of checked){assert.equal(o.dataStatus,'official');assert(o.variants.every(v=>!v.optionGroups?.length));assert.equal(o.limits.maxUsesPerUserPerDay,1);}
for(const o of data.offers){if(o.brand==='KFC'){assert(o.observations.every(x=>x.sourceId==='kcouper'));assert(o.sourceVersions.every(x=>x.provenance.sourceUrl==='https://winedays.github.io/KCouper/coupon.js'));}assert(o.sourceVersions?.length,'Missing versions: '+o.id);assert.equal(o.sourceVersions.length,o.observations.length);}
const req={demand:Object.fromEntries(['chicken','burgerMain','paperChicken','pasta','pizza9','pizza13','tart','drinkServing'].map(k=>[k,1])),people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',orderMethod:'official_web',paymentMethod:'any',dataScope:'all',allowUnknownOrdering:true,at:data.generatedAt,maxOrders:12,estimate:true,avoid:[],allowExtras:true};
const {candidates}=F.chooseCandidates(data,req,now);
assert(candidates.length>5);
assert.deepEqual([...new Set(candidates.map(c=>c.offer.brand))].sort(),['KFC','PH']);
for(const c of candidates){assert(F.recommendationCheck(data,c.offer,now,req).allowed);assert(Number.isSafeInteger(c.base)&&c.base>=0);assert(c.offer.sourceVersionKey);if(c.offer.brand==='PH')assert(F.couponLookupCheck(c.offer,now).allowed);assert(!Object.keys(c.variant.items).some(k=>k.startsWith('food_')));if(c.offer.sourceConflict)assert.notEqual(c.offer.sourceVersionKey,'official');}
const priced=new Set(F.planningOffers(data,req,now).filter(o=>F.recommendationCheck(data,o,now,req).allowed).map(o=>o.id));
console.log(JSON.stringify({total:data.offers.length,priceableCodes:priced.size,sourceVersions:data.offers.reduce((n,o)=>n+o.sourceVersions.length,0),candidates:candidates.length,officialConfigurations:checked.length,officialRefresh:data.officialRefresh.status}));
