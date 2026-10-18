(function(root){
 'use strict';
 const enums={mealMode:['meal','snack'],budgetType:['person','total'],richness:['none','light','normal','rich'],brandScope:['all','KFC','PH'],channel:['takeaway','delivery','dinein'],drinkPreference:['any','unsweetened','cola','soda','milkTea','coldMilkTea','hotMilkTea','soup'],appetite:['light','normal','big'],pizzaSize:['small','large'],flavorTag:['any','seafood','meat'],orderMethod:['auto','official_web','pk_app','counter','kiosk','phone'],paymentMethod:['any','online','in_store']};
 const mains=['pizza','chicken','burger','wrapped','pasta','smallBurger','porridge','eggFlatbread','chickenFlatbread'];
 const snacks=['tart','friesSmall','friesLarge','friesMedium','nuggets','qq','qqPack','hashBrown','daifuku','potatoCoinsSmall','potatoCoinsLarge','chickenCartilageSmall','chickenCartilageLarge','germanSausage','spicySausage','codBites','chocolateQQ','mochiQQ','seafoodPlatter','fishRings','chipsMini','shrimpPack'];
 const items=[...snacks,'burgerSmall','chickenPorridge','omeletFlatbread','chickenFlatbread','chicken','burgerMain','paperChicken','pasta','pizza9','pizza13','drinkServing','drinkSmall','drinkMedium'];
 const properties={};
 for(const [key,values] of Object.entries(enums))properties[key]={type:['string','null'],enum:[...values,null]};
 for(const key of ['people','budget','flavorKinds'])properties[key]={type:[key==='budget'?'number':'integer','null']};
 properties.drinks={type:['boolean','null']};properties.at={type:['string','null']};
 properties.mains={type:['array','null'],items:{type:'string',enum:mains}};
 properties.fixedSnacks={type:['array','null'],items:{type:'string',enum:snacks}};
 properties.explicitDemand={type:['array','null'],items:{type:'object',properties:{item:{type:'string',enum:items},quantity:{type:'integer'}},required:['item','quantity'],additionalProperties:false}};
 const schema={type:'object',properties:{patch:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},warnings:{type:'array',items:{type:'string'}}},required:['patch','warnings'],additionalProperties:false};
 function validate(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!payload.patch||Array.isArray(payload.patch)||typeof payload.patch!=='object')throw Error('需求格式不正確，請重試。');
  if(Object.keys(payload).some(k=>!['patch','warnings'].includes(k)))throw Error('回應含未支援的欄位。');
  const patch={};
  for(const [key,value] of Object.entries(payload.patch)){
   if(!(key in properties))throw Error('需求含未支援的欄位。');
   if(value===null)continue;
   if(enums[key]){if(!enums[key].includes(value))throw Error('需求選項不正確。');patch[key]=value;continue;}
   if(['people','budget','flavorKinds'].includes(key)){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||(key==='people'&&(!Number.isInteger(value)||value<1||value>30))||(key==='budget'&&value>300000)||(key==='flavorKinds'&&(!Number.isInteger(value)||value>3)))throw Error('人數、預算或口味數超出支援範圍。');
   }else if(key==='drinks'){if(typeof value!=='boolean')throw Error('飲料欄位不正確。');}
   else if(key==='at'){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(value)||!Number.isFinite(Date.parse(value+':00+08:00')))throw Error('點餐時間不正確。');}
   else if(key==='mains'||key==='fixedSnacks'){
    const allowed=key==='mains'?mains:snacks;
    if(!Array.isArray(value)||value.length>allowed.length||value.some(x=>!allowed.includes(x)))throw Error('餐點選項不正確。');
    patch[key]=[...new Set(value)];continue;
   }else if(key==='explicitDemand'){
    if(!Array.isArray(value)||value.length>items.length)throw Error('餐點數量格式不正確。');
    const demand={};for(const x of value){if(!x||Object.keys(x).some(k=>!['item','quantity'].includes(k))||!items.includes(x.item)||!Number.isInteger(x.quantity)||x.quantity<0||x.quantity>60||Object.hasOwn(demand,x.item))throw Error('餐點數量需為 0～60。');demand[x.item]=x.quantity;}
    patch.explicitDemand=demand;continue;
   }
   patch[key]=value;
  }
  if(patch.mealMode==='snack')patch.mains=[];
  if(patch.mealMode==='meal'&&patch.mains?.length===0)throw Error('正餐請保留至少一種主餐。');
  if(patch.orderMethod&&patch.orderMethod!=='auto'&&patch.channel&&(['counter','kiosk'].includes(patch.orderMethod)?!['takeaway','dinein'].includes(patch.channel):!['takeaway','delivery'].includes(patch.channel)))throw Error('下單管道與取餐方式無法搭配。');
  if(payload.warnings!==undefined&&(!Array.isArray(payload.warnings)||payload.warnings.length>12||payload.warnings.some(s=>typeof s!=='string'||s.length>200)))throw Error('提醒格式不正確。');
  return {patch,warnings:payload.warnings||[]};
 }
 const api={schema,validate,mains,snacks,items};root.MealIntent=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
