const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/engine'),P=require('../src/planner'),demo=require('../data/demo.json');
function food(code,items,price){const o=structuredClone(demo.offers[0]);return {...o,id:code,code,brand:'KFC',variants:[{id:'base',items,priceMinor:price,channels:['takeaway']}],limits:{},eligibility:{},ordering:{}};}
const req={people:4,budgetMinor:null,brands:['KFC'],cross:false,channel:'takeaway',orderMethod:'auto',at:'2026-10-16T13:00:00+08:00',maxOrders:2,estimate:true,allowExtras:true};
test('snack choices are kinds: drinks, soup, sauces and opaque boxes are excluded',()=>{
 const data=require('../data/offers.json'),now=Date.parse(data.kfcMenu.attemptedAt)+1000;
 const menu=P.planningContext(data,{...req,at:'2026-10-21T13:00:00+08:00',dataScope:'all'},now);
 assert(menu.snacks.includes('snackFries'));assert(menu.snacks.includes('snackNuggets'));assert(menu.snacks.includes('snackKfcQQ'));
 for(const id of menu.snacks){assert(P.isSnackChoice(id));assert(!['飲料與湯','醬料','綜合拼盤'].includes(P.SNACK_META[id].group));assert(!P.SNACK_ALIASES[id]);}
 for(const id of ['friesSmall','friesMedium','friesLarge','qq','qqPack'])assert(!menu.snacks.includes(id));
 assert(menu.items.includes('soupSmall'),'soup remains available through drink/advanced controls');
});
test('fries sizes and QQ units use explicit planning portions without inventing purchased pieces',()=>{
 assert.equal(P.snackQuantity('snackFries',{friesSmall:1,friesMedium:1,friesLarge:1}),4.5);
 assert.equal(P.snackQuantity('snackKfcQQ',{qq:4,qqPack:2}),3);
 assert.equal(P.snackQuantity('snackPhQQ',{chocolateQQ:5,mochiQQ:5}),2);
 assert.deepEqual(P.normalizeSnacks(['friesSmall','friesLarge','qq','qqPack','soupSmall']),['snackFries','snackKfcQQ']);
 const x=F.solve({...demo,offers:[food('qq',{qq:4,qqPack:2},10000)]},{...req,demand:{snackKfcQQ:3},maxOrders:1}).plans[0];
 assert(x);assert.deepEqual(F.planContents(x),{qq:4,qqPack:2});assert.deepEqual(x.extras,{});
});
test('one priced combo contributes both real foods once; the solver can mix sizes and packs',()=>{
 const data={...demo,offers:[food('small',{friesSmall:1},4000),food('large',{friesLarge:1},6000),food('nuggets',{nuggets:8},10000),food('box',{friesSmall:1,nuggets:4},7000)]};
 const x=F.solve(data,{...req,demand:{snackFries:2,snackNuggets:2}}).plans[0];
 assert.equal(x.totalCost,14000);assert.equal(x.orders.length,2);assert(x.orders.every(o=>o.code==='box'));
 assert.deepEqual(F.planContents(x),{friesSmall:2,nuggets:8});assert.deepEqual(x.extras,{});
 assert.equal(F.solve({...data,offers:[food('only fries',{friesLarge:3},1000)]},{...req,demand:{snackFries:2,snackNuggets:2}}).plans.length,0);
});
test('a per-coupon food replacement is expanded for a selected snack kind',()=>{
 const o=food('option',{nuggets:8},10000);o.variants[0].optionGroups=[{id:'side',count:1,baseItems:{nuggets:8},options:[{name:'雞塊8塊',items:{nuggets:8},surchargeMinor:0},{name:'大薯',items:{friesLarge:1},surchargeMinor:500}]}];
 const x=F.solve({...demo,offers:[o]},{...req,maxOrders:1,demand:{snackFries:2}}).plans[0];assert(x);assert.equal(x.totalCost,10500);assert.deepEqual(F.planContents(x),{friesLarge:1});
});
test('richness scales selected kinds across the party and explicit counts replace their generic goal',()=>{
 const builds=['light','normal','rich'].map(richness=>P.buildSimple({people:6,mealMode:'snack',fixedSnacks:['friesSmall','nuggets'],richness}));
 assert.deepEqual(builds.map(b=>b.snackGoal.servings),[3,5,6]);
 assert(builds.every(b=>b.demand.snackFries>=1&&b.demand.snackNuggets>=1&&b.snackGoal.minTypes===2));
 assert.equal(builds[1].demand.snackFries+builds[1].demand.snackNuggets,5);
 const changed=P.applyExplicitDemand(builds[1].demand,{nuggets:4});assert(!changed.snackNuggets);assert.equal(changed.nuggets,4);
});
test('saved size-specific choices migrate once into kinds without dropping main quantities',()=>{
 const next=P.migrateSnackDemand({chicken:6,friesSmall:1,friesLarge:1,qq:4,qqPack:1},['friesSmall','friesLarge','qq','qqPack']);
 assert.deepEqual(next,{chicken:6,snackFries:3,snackKfcQQ:2});
 assert.deepEqual(P.migrateSnackDemand(next,['snackFries','snackKfcQQ']),next);
});
