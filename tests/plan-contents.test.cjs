const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine');
test('plan overview sums repeated orders and extras without counting derived counters twice',()=>{
 const plan={demand:{chicken:4},supplied:{chicken:8,burgerMain:3,drinkServing:7},extras:{chicken:4},orders:[
  {items:{chicken:4,drinkSmall:2,individual:1,snackPortions:3}},
  {items:{chicken:4,drinkSmall:2,burgerMain:3}},
  {items:{paperChicken:3,drinkMedium:3,drinkServing:3}},
 ]};
 assert.deepEqual(F.planContents(plan),{chicken:8,paperChicken:3,drinkSmall:4,drinkMedium:3});
 assert.deepEqual(plan.orders[0].items,{chicken:4,drinkSmall:2,individual:1,snackPortions:3});
});
test('partial plan overview lists purchased food, without adding the unfulfilled request',()=>{
 assert.deepEqual(F.planContents({demand:{chicken:8,paperChicken:3},orders:[{items:{chicken:4,tart:2}}]}),{chicken:4,tart:2});
 assert.deepEqual(F.planContents({orders:[]}),{});
});
test('real 8 plus 3 recommendation overview agrees with all purchased coupon contents',()=>{
 const data=require('../data/offers.json');
 const request={at:'2026-10-19T13:00:00+08:00',brands:['KFC'],channel:'takeaway',orderMethod:'auto',paymentMethod:'any',people:6,budgetMinor:null,maxOrders:6,cross:false,estimate:true,allowExtras:true,demand:{chicken:8,paperChicken:3}};
 const x=F.recommend(data,request,{timeLimitMs:500,maxStates:50000});
 assert(x.plans.length);const p=x.plans[0];
 assert.deepEqual(F.planContents(p),{chicken:8,paperChicken:3,drinkSmall:4,drinkMedium:3});
 for(const order of p.orders){assert(order.officialMeal.intro);assert(order.eligibility);assert(order.limits);}
});
test('overview includes dynamically registered official single items and preserves distinct units',()=>{
 const data=require('../data/offers.json');F.extendItems(data);
 assert.deepEqual(F.planContents({orders:[{items:{friedMushrooms:1,coldCheeseTart:2}},{items:{coldCheeseTart:1}}]}),{friedMushrooms:1,coldCheeseTart:3});
});
