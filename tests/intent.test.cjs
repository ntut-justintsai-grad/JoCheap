const test=require('node:test'),assert=require('node:assert/strict'),Intent=require('../src/intent.js'),P=require('../src/planner.js'),F=require('../src/engine.js');
test('afternoon tea can have snacks and drinks without a main, including a drinks-only request',()=>{
 const b=P.buildSimple({people:4,mealMode:'snack',mains:[],fixedSnacks:['tart','nuggets'],richness:'none',drinks:true});
 assert.deepEqual(b.mains,[]);assert.deepEqual(b.demand,{drinkServing:4,tart:1,snackNuggets:1,snackPortions:2});assert.equal(b.snackGoal.minTypes,2);assert.equal(b.mainAllocation.length,0);
 const d=P.buildSimple({people:2,mealMode:'snack',richness:'none',drinks:true});assert.deepEqual(d.demand,{drinkServing:2});assert.equal(d.snackGoal.minTypes,0);
 assert.throws(()=>P.buildSimple({people:2,mealMode:'meal',mains:[]}));
});
test('natural-language tea input maps into snack controls and leaves unmentioned fields alone',()=>{
 const x=P.interpret('四人下午茶，每人100，要蛋撻和雞塊，外帶');assert.equal(x.patch.mealMode,'snack');assert.deepEqual(x.patch.mains,[]);assert.deepEqual(x.patch.fixedSnacks,['tart','nuggets']);assert.equal(x.patch.budget,100);assert.equal(x.patch.budgetType,'person');assert.equal(x.patch.people,4);
 const y=Intent.validate({patch:{people:4,budget:null,mealMode:'snack',mains:[],explicitDemand:[{item:'tart',quantity:6}]},warnings:[]});assert(!('budget'in y.patch));assert.deepEqual(y.patch.explicitDemand,{tart:6});
});
test('LLM JSON is constrained before applying and rejects unknown fields, units and impossible channels',()=>{
 for(const patch of [{people:300},{people:'四'},{budget:-1},{drinks:'yes'},{mains:['chicken','mystery']},{fixedSnacks:['food_fake']},{explicitDemand:[{item:'tart',quantity:61}]},{apiKey:'x'},{orderMethod:'counter',channel:'delivery'}])assert.throws(()=>Intent.validate({patch,warnings:[]}));
 assert.throws(()=>Intent.validate({patch:{},warnings:['x'.repeat(201)]}));
});
test('automatic checkout selects an allowed method and required payment instead of requiring an early choice',()=>{
 const o={ordering:{platforms:['pk_app'],excludedPlatforms:['official_web'],fulfilments:['takeaway'],onlinePaymentRequired:true},eligibility:{appRequired:true}};
 const x=F.orderingCheck(o,{orderMethod:'auto',channel:'takeaway',paymentMethod:'any'});assert.equal(x.allowed,true);assert.equal(x.method,'pk_app');assert.equal(x.paymentMethod,'online');assert.equal(x.status,'source_stated');
 assert.equal(F.orderingCheck(o,{orderMethod:'auto',channel:'dinein',paymentMethod:'any'}).allowed,false);
 assert.equal(F.orderingCheck(o,{orderMethod:'auto',channel:'takeaway',paymentMethod:'in_store'}).allowed,false);
});
test('server returns only validated structured output and protects the API key from client responses',async()=>{
 const {createIntentService}=await import('../server/intent-service.mjs');let sent;
 const handler=createIntentService({OPENAI_API_KEY:'test-server-secret',ALLOWED_ORIGINS:'https://example.test'},async(url,request)=>{sent={url,...request};return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({patch:{people:4,mealMode:'snack',mains:[]},warnings:[]})}]}]});});
 const response=await handler(new Request('https://api.test/interpret',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({text:'四人下午茶'})}),'client-1');
 assert.equal(response.status,200);const raw=await response.text();assert(!raw.includes('test-server-secret'));assert.equal(JSON.parse(raw).patch.people,4);assert.equal(sent.url,'https://api.openai.com/v1/responses');const body=JSON.parse(sent.body);assert.equal(body.text.format.strict,true);assert.deepEqual(body.text.format.schema,Intent.schema);assert.equal(body.store,false);
 const invalid=await handler(new Request('https://api.test/interpret',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'}),'client-2');assert.equal(invalid.status,403);
 const missing=createIntentService({ALLOWED_ORIGINS:'https://example.test'},()=>assert.fail('should not query'));assert.equal((await missing(new Request('https://api.test/health'))).status,200);assert.equal((await missing(new Request('https://api.test/interpret',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:'{"text":"hi"}'}))).status,503);
});
