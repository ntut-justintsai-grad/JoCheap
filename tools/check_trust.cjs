// Validate refreshed production data independently of historical fixtures.
const assert=require('node:assert/strict'),F=require('../src/engine.js'),data=require('../data/offers.json');
assert.equal(data.recommendationPolicy?.allowAllSources,true);
assert.equal(data.recommendationPolicy?.requireOfficial,false);
assert.equal(data.parserVersion,7);
assert.equal(data.sourcePolicy.KFC.compositionBasis,'official_intro');
assert.equal(data.sourcePolicy.KFC.transport,'direct_official_api');
assert.deepEqual(data.sources.map(s=>s.sourceId).sort(),['calling-ph','kcouper','talk-ph']);
assert.equal(data.qualityReport?.total,data.offers.length);
assert.equal(data.sourcePolicy.PH.apiIntegration,'code_lookup');
const ph=data.offers.filter(o=>o.brand==='PH');
assert.equal(data.pizzahutLookup.total,ph.length);
for(const o of ph){assert.equal(o.couponLookup?.code,o.code);assert.equal(o.couponLookup.endpoint,'https://www.pizzahut.com.tw/order/?m=ajax');assert(['matched','invalid','error'].includes(o.couponLookup.status));}
const now=Date.parse(data.generatedAt),checked=data.offers.filter(o=>F.verificationCheck(o,Date.parse(data.officialRefresh.attemptedAt)||now).allowed);
assert.equal(checked.length,data.officialRefresh.checked||0);
for(const o of checked){assert.equal(o.dataStatus,'official');assert(o.variants.every(v=>!v.optionGroups?.length));assert.equal(o.limits.maxUsesPerUserPerDay,1);}
for(const o of data.offers){if(o.brand==='KFC'){assert(o.observations.every(x=>x.sourceId==='kcouper'));assert(o.sourceVersions.every(x=>x.sourceVersionKey==='kfc-official-intro'));for(const v of o.sourceVersions){assert(v.dataStatus==='pending'||v.sourceMetadata.compositionBasis==='official_intro');assert(!v.variants.some(x=>x.id==='standard'));}}assert(o.sourceVersions?.length,'Missing versions: '+o.id);assert.equal(o.sourceVersions.length,o.observations.length);}
const req={demand:Object.fromEntries(['chicken','burgerMain','paperChicken','pasta','pizza9','pizza13','tart','drinkServing'].map(k=>[k,1])),people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',orderMethod:'official_web',paymentMethod:'any',dataScope:'all',allowUnknownOrdering:true,at:data.generatedAt,maxOrders:12,estimate:true,avoid:[],allowExtras:true};
const {candidates}=F.chooseCandidates(data,req,now);
assert(candidates.length>5);
assert.deepEqual([...new Set(candidates.map(c=>c.offer.brand))].sort(),['KFC','PH']);
for(const c of candidates){assert(F.recommendationCheck(data,c.offer,now,req).allowed);assert(Number.isSafeInteger(c.base)&&c.base>=0);assert(c.offer.sourceVersionKey);if(c.offer.brand==='PH')assert(F.couponLookupCheck(c.offer,now).allowed);assert(!Object.keys(c.variant.items).some(k=>k.startsWith('food_')));if(c.offer.sourceConflict)assert.notEqual(c.offer.sourceVersionKey,'official');}
for(const [code,chicken] of [['16725',2],['16726',4]]){
 const root=data.offers.find(o=>o.brand==='KFC'&&o.code===code);assert(root,'Missing '+code);
 const o=F.catalogOffer(root),v=F.catalogChoice(o,'paperChicken',now);assert(v,code+' has no paper chicken');
 assert.equal(v.total,30000);assert.equal(v.selected.items.paperChicken,1);assert.equal(v.selected.items.chicken,chicken);
 assert.equal(v.selected.optionGroups?.length||0,0);assert(o.sourceMetadata.officialMeal.intro.includes('香草紙包雞'));
}
const priced=new Set(F.planningOffers(data,req,now).filter(o=>F.recommendationCheck(data,o,now,req).allowed).map(o=>o.id));
console.log(JSON.stringify({total:data.offers.length,priceableCodes:priced.size,sourceVersions:data.offers.reduce((n,o)=>n+o.sourceVersions.length,0),candidates:candidates.length,officialConfigurations:checked.length,officialRefresh:data.officialRefresh.status}));

const menu=data.menuOffers||[];assert.equal(new Set(menu.map(o=>o.id)).size,menu.length);
for(const o of menu){assert.equal(o.kind,'direct_menu');assert.equal(o.code,'');assert(['KFC','PH'].includes(o.brand));assert(F.recommendationCheck(data,o,Date.parse(o.menuSnapshot.checkedAt)+1000,{at:new Date(Date.parse(o.menuSnapshot.checkedAt)+2000).toISOString()}).allowed);if(o.brand==='PH'){assert(o.officialUrl.startsWith('https://www.pizzahut.com.tw/order/?'));assert(o.variants.every(v=>v.channels.join()==='takeaway'));}else{assert(o.officialUrl.startsWith('https://www.kfcclub.com.tw/meal/'));assert(o.variants.every(v=>v.channels.join()===o.menuSnapshot.channel));}}
