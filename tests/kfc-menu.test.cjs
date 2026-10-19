const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine'),P=require('../src/planner'),data=require('../data/offers.json');
const menuOffers=(data.menuOffers||[]).filter(o=>o.brand==='KFC');
const now=Date.parse(menuOffers[0].menuSnapshot.checkedAt)+1000;
const request={brands:['KFC'],channel:'takeaway',orderMethod:'auto',paymentMethod:'any',dataScope:'all',at:'2026-10-19T13:00:00+08:00',people:1,budgetMinor:null,cross:false,maxOrders:6,estimate:true,allowExtras:true};
F.extendItems(data);
const biscuit=Object.keys(data.foodCatalog).find(k=>data.foodCatalog[k].name==='金黃比司吉');
test('official KFC missing snacks are selectable and actually priced with coupons',()=>{
 const menu=P.planningContext(data,request,now);assert(menu.snacks.includes(biscuit));
 for(const name of ['青花椒薯條','青花椒雞塊','南洋酸甜雙拼點心盒','BBQ煙燻雙拼點心盒','樂享三拼小盒','分享拼盤']){
  const id=Object.keys(data.foodCatalog).find(k=>data.foodCatalog[k].name===name);assert(id,name);assert(menu.snacks.includes(id),name);
 }
 const result=F.recommend(data,{...request,demand:{[biscuit]:1,tart:1},snackGoal:{minTypes:0,servings:0}},{now,timeLimitMs:300,maxStates:10000});
 assert(result.plans.length,result.quoteUnavailable?.reason);assert.equal(F.planContents(result.plans[0])[biscuit],1);
 assert(result.plans[0].orders.some(o=>o.kind==='direct_menu'&&o.menuSnapshot.productId==='FA168'&&!o.code));
 assert.equal(result.plans[0].orders.find(o=>o.menuSnapshot?.productId==='FA168').base,5900);
});
test('KFC single-menu source binding, expiry, channels and breakfast remain distinct',()=>{
 const o=menuOffers.find(o=>o.menuSnapshot.productId==='FA168');assert(F.recommendationCheck(data,o,now,request).allowed);
 const tampered=structuredClone(o);tampered.variants[0].priceMinor++;assert(!F.recommendationCheck(data,tampered,now,request).allowed);
 assert(!F.recommendationCheck(data,o,now+9*86400000,request).allowed);
 const breakfast=F.chooseCandidates(data,{...request,at:'2026-10-19T08:10:00+08:00',demand:{[biscuit]:1}},now).candidates;
 assert(!breakfast.some(c=>c.offer.kind==='direct_menu'&&c.offer.menuSnapshot.productId==='FA168'));
 assert(!F.chooseCandidates(data,{...request,channel:'delivery',demand:{[biscuit]:1}},now).candidates.some(c=>c.offer.kind==='direct_menu'&&c.offer.menuSnapshot.channel==='takeaway'));
});
test('sauces and beverages do not silently satisfy the snack variety requirement',()=>{
 P.planningContext(data,request,now);
 const id=Object.keys(data.foodCatalog).find(k=>!k.startsWith('food_')&&data.foodCatalog[k].name==='韓式辣醬');assert(id);
 const built=P.buildSimple({people:1,mealMode:'snack',fixedSnacks:[id],richness:'none'});
 assert.equal(built.snackGoal.minTypes,0);
 const candidates=F.chooseCandidates(data,{...request,demand:{[id]:1}},now).candidates;
 const sauce=candidates.find(c=>c.offer.menuSnapshot?.productId==='CA391');assert(sauce);assert.equal(sauce.items.snackPortions,0);assert.deepEqual(sauce.snackGroups,[]);
});
