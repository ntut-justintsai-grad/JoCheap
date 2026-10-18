const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine'),P=require('../src/planner'),production=require('../data/offers.json');
F.extendItems(production);
const first=production.menuOffers[0],now=Date.parse(first.menuSnapshot.checkedAt)+1000;
const at=new Date(now+60*60000).toISOString();
const request={demand:{friedMushrooms:1,coldCheeseTart:1},people:1,budgetMinor:null,brands:['PH'],cross:false,channel:'takeaway',orderMethod:'auto',paymentMethod:'any',dataScope:'all',at,maxOrders:4,estimate:true,allowExtras:true};
test('official menu needs its binding and current snapshot, without a fabricated coupon',()=>{
 assert(F.recommendationCheck(production,first,now,request).allowed);
 assert.equal(first.code,'');assert.equal(first.kind,'direct_menu');
 const changed=structuredClone(first);changed.variants[0].priceMinor--;
 assert.equal(F.recommendationCheck(production,changed,now,request).allowed,false);
 assert.equal(F.recommendationCheck(production,first,now+9*86400000,request).allowed,false);
 assert.equal(F.recommendationCheck(production,first,now,{...request,at:new Date(now+9*86400000).toISOString()}).allowed,false);
});
test('new sides really participate in optimization alongside existing coupon sources',()=>{
 const data={...production,offers:[]};
 const result=F.recommend(data,request,{now,timeLimitMs:300,maxStates:20000});
 assert(result.plans.length,result.quoteUnavailable?.reason);
 const p=result.plans[0];assert.equal(p.totalCost,13400);
 assert(p.orders.some(o=>o.items.friedMushrooms===1));assert(p.orders.some(o=>o.items.coldCheeseTart===1));
 assert(p.orders.every(o=>o.kind==='direct_menu'&&!o.code&&o.officialUrl.includes('pd=')));
 assert.equal(P.planTimeWindows(p,at).unknown,true);
});
test('Pizza Hut selections include all mapped sides, and respect channel and snapshot coverage',()=>{
 const data={...production,offers:[]};
 const menu=P.planningContext(data,request,now);
 for(const id of ['chickenBalls','friedMushrooms','cheesePork','fishCakeTrio','peachCheeseTart','basque4','durianIceCream'])assert(menu.snacks.includes(id),id);
 assert.equal(menu.snacks.length,28);assert(!menu.items.includes('chicken'));
 assert.equal(P.planningContext(data,{...request,channel:'delivery'},now).items.length,0);
 const built=P.buildSimple({people:6,mealMode:'snack',richness:'none',fixedSnacks:['basque8','coldCheeseTart']});
 assert.equal(built.demand.basque8,1);assert.equal(built.demand.coldCheeseTart,6);
});

test('a fresh browser worker registers new menu identities before validating requests',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),context=vm.createContext({});
 vm.runInContext(fs.readFileSync(require.resolve('../src/engine.js'),'utf8')+'\n'+fs.readFileSync(require.resolve('../src/planner.js'),'utf8'),context);
 const x=context.Feast.recommend({...production,offers:[]},request,{now,timeLimitMs:300,maxStates:20000});
 assert(x.plans.length);assert.equal(x.plans[0].totalCost,13400);
});
