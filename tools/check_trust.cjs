// Validate the refreshed production snapshot, separately from historical fixtures.
const assert=require('node:assert/strict'),F=require('../src/engine.js'),data=require('../data/offers.json');
assert.equal(data.recommendationPolicy?.requireOfficial,true,'Production must require official checks');
assert.equal(data.qualityReport?.total,data.offers.length);
const now=Date.parse(data.generatedAt),checked=data.offers.filter(o=>F.verificationCheck(o,now).allowed);
assert.equal(checked.length,data.officialRefresh.checked||0);
for(const o of checked){
 assert.equal(o.dataStatus,'official');
 assert(o.variants.every(v=>!v.optionGroups?.length));
 assert.equal(o.limits.maxUsesPerUserPerDay,1);
}
const req={demand:Object.fromEntries(['chicken','burgerMain','paperChicken','pasta','pizza9','pizza13','tart','drinkServing'].map(k=>[k,1])),people:6,budgetMinor:null,brands:['KFC','PH'],cross:true,channel:'takeaway',orderMethod:'official_web',paymentMethod:'any',allowUnknownOrdering:true,at:data.generatedAt,maxOrders:12,estimate:true,avoid:[],allowExtras:true};
const {candidates}=F.chooseCandidates(data,req,now);
assert(candidates.every(c=>F.verificationCheck(c.offer,now).allowed));
console.log(JSON.stringify({total:data.offers.length,officialConfigurations:checked.length,officialRefresh:data.officialRefresh.status,qualityIssues:data.qualityReport.withQualityIssues}));
