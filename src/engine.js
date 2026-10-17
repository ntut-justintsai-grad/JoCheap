(function(root){
  'use strict';
  const FRESH_MS=24*60*60*1000;
  const ITEMS={
    chicken:{name:'原塊炸雞',unit:'塊',emoji:'🍗'},
    tart:{name:'原味蛋撻',unit:'顆',emoji:'🥧'},
    burger:{name:'漢堡',unit:'個',emoji:'🍔'},
    paperChicken:{name:'香草紙包雞',unit:'份',emoji:'🍗'},
    pasta:{name:'義大利麵',unit:'份',emoji:'🍝'},
    fishRings:{name:'鱈魚圈圈',unit:'份',emoji:'🐟'},
    pizza9:{name:'9 吋小披薩',unit:'個',emoji:'🍕'},
    pizza13:{name:'13 吋大披薩',unit:'個',emoji:'🍕'},
    drinkSmall:{name:'小杯飲料',unit:'杯',emoji:'🥤'},
    drinkMedium:{name:'中杯飲料',unit:'杯',emoji:'🥤'},
    bottle1250:{name:'1.25L 瓶裝飲料',unit:'瓶',emoji:'🧃'},
    friesSmall:{name:'小份薯條',unit:'份',emoji:'🍟'},
    friesLarge:{name:'大份薯條',unit:'份',emoji:'🍟'},
    nuggets:{name:'雞塊',unit:'塊',emoji:'🍗'},
    roast:{name:'厚燒醬烤腿排',unit:'塊',emoji:'🍗'},
    qq:{name:'雙色轉轉 QQ 球',unit:'顆',emoji:'🟠'},
    potatoCoinsSmall:{name:'薯金幣（小）',unit:'份',emoji:'🥔'},
    potatoCoinsLarge:{name:'薯金幣（大）',unit:'份',emoji:'🥔'},
    chickenCartilageSmall:{name:'黃金雞軟骨（小）',unit:'份',emoji:'🍗'},
    germanSausage:{name:'德國芝心腸',unit:'條',emoji:'🌭'},
    spicySausage:{name:'火辣辣芝心腸',unit:'條',emoji:'🌶️'},
    codBites:{name:'和風鱈魚塊',unit:'塊',emoji:'🐟'},
    chocolateQQ:{name:'巧克力 QQ 球',unit:'顆',emoji:'🍫'},
    mochiQQ:{name:'麻糬 QQ 球',unit:'顆',emoji:'🍡'},
    hashBrown:{name:'薯餅',unit:'塊',emoji:'🥔'},
    daifuku:{name:'草莓起司冰淇淋大福',unit:'個',emoji:'🍓'},
    seafoodPlatter:{name:'超蝦點心拼盤',unit:'份',emoji:'🍤'},
    bbqChickenSet:{name:'BBQ 烤雞組（3 腿 3 翅）',unit:'份',emoji:'🍗'},
    soupCup:{name:'玉米濃湯（杯，容量未標）',unit:'杯',emoji:'🥣'},
    appleJuiceBottle:{name:'100% 蘋果汁（瓶，容量未標）',unit:'瓶',emoji:'🧃'},
    milkTeaCup:{name:'經典冰奶茶（杯，容量未標）',unit:'杯',emoji:'🧋'},
    greenTea1250:{name:'原萃綠茶 1.25L',unit:'瓶',emoji:'🍵'},
    greenTea580:{name:'原萃綠茶 580ml',unit:'瓶',emoji:'🍵'},
    chipsMini:{name:'樂事 mini',unit:'包',emoji:'🥔'},
    yuzuTeaBottle:{name:'茉香柚茶（瓶，容量未標）',unit:'瓶',emoji:'🍋'},
    individual:{name:'獨立主餐',unit:'份',emoji:'🍽️'},
    burgerMain:{name:'一般漢堡主餐',unit:'個',emoji:'🍔'},
    drinkServing:{name:'指定飲料／湯',unit:'杯',emoji:'🥤'},
    snackPortions:{name:'分享點心',unit:'小份',emoji:'🍟'}
  };
  const physicalIds=Object.keys(ITEMS).filter(k=>!['individual','burgerMain','drinkServing','snackPortions'].includes(k));
  function extendItems(dataset){for(const [id,meta] of Object.entries(dataset.foodCatalog||{}))if(!ITEMS[id]&&/^(?:food_[a-f0-9]{12}|[a-zA-Z][a-zA-Z0-9]*)$/.test(id)){ITEMS[id]=meta;physicalIds.push(id);}}
  const drinkMatch=(d,preference='any')=>d.size!=='bottle'&&(preference==='any'?d.kind!=='soup':preference==='soda'?['cola','soda'].includes(d.kind):preference==='coldMilkTea'?d.kind==='milkTea'&&d.name.includes('冰'):preference==='hotMilkTea'?d.kind==='milkTea'&&d.name.includes('熱'):d.kind===preference);
  function drinkCount(beverages,preference){return sum((beverages||[]).filter(d=>drinkMatch(d,preference)).map(d=>d.quantity));}
  function applyOptions(variant,selections={},at=null){
    const fallback=[['drinkSmall','small'],['drinkMedium','medium'],['milkTeaCup','cup']].filter(([k])=>variant.items[k]).map(([item,size])=>({name:ITEMS[item].name,quantity:variant.items[item],kind:'unknown',size,item}));
    const v={...variant,items:{...variant.items},beverages:[...(variant.beverages??fallback)],optionChoices:[],surchargeMinor:variant.surchargeMinor||0};
    for(const g of variant.optionGroups||[]){
      const selection=selections[g.id]||Array(g.count).fill(0);
      if(selection.length!==g.count||selection.some(i=>!Number.isInteger(i)||!g.options[i]))throw Error('餐點替換選項無效。');
      for(const [k,n] of Object.entries(g.baseItems)){v.items[k]=(v.items[k]||0)-n;if(!v.items[k])delete v.items[k];}
      for(const d of g.baseBeverages||[]){let remaining=d.quantity;v.beverages=v.beverages.map(b=>{if(b.name!==d.name||!remaining)return b;const take=Math.min(remaining,b.quantity);remaining-=take;return {...b,quantity:b.quantity-take};}).filter(b=>b.quantity>0);}
      for(const i of selection){const o=g.options[i];for(const [k,n] of Object.entries(o.items))v.items[k]=(v.items[k]||0)+n;v.beverages.push(...(o.beverages||[]));v.surchargeMinor+=o.surchargeMinor;v.optionChoices.push({groupId:g.id,from:g.label,name:o.name,surchargeMinor:o.surchargeMinor});}
    }
    const minute=at?new Date(Date.parse(at)+8*3600000).getUTCHours()*60+new Date(Date.parse(at)+8*3600000).getUTCMinutes():null;
    if(minute!==null&&minute>=1200&&v.items.chickenRice){v.items.friesMedium=(v.items.friesMedium||0)+v.items.chickenRice;delete v.items.chickenRice;v.optionChoices.push({groupId:'rice-time',from:'雞汁風味飯',name:'20:00 後改供中薯',surchargeMinor:0});}
    if(variant.optionGroups?.some(g=>g.options.some(o=>['burger','paperChicken','pasta'].some(k=>o.items[k])))){v.individualMainItems=Object.fromEntries(['burger','paperChicken','pasta'].filter(k=>v.items[k]).map(k=>[k,v.items[k]]));v.individualMains=sum(Object.values(v.individualMainItems));}
    return v;
  }
  function expandOptions(variant,r){
    if(!variant.optionGroups?.length)return {variants:[applyOptions(variant,{},r.at)],complete:true};
    let choices=[{}],complete=true;
    const keys=Object.keys(r.demand).filter(k=>r.demand[k]>0&&!['snackPortions','drinkServing'].includes(k)).map(k=>k==='burgerMain'?'burger':k);
    const meta=(root.Planner||(typeof require==='function'?require('./planner.js'):{})).SNACK_META||{};
    const snackSignature=o=>Object.entries(o.items).filter(([k])=>meta[k]).map(([k,n])=>[meta[k].group,n/meta[k].portion]).sort();
    for(const g of variant.optionGroups){
      const base=g.options[0],indices=[0],seen=new Map();
      for(let i=0;i<g.options.length;i++){
        if(atOrAfterEight(r.at)&&/20:00前供應/.test(g.options[i].name))continue;
        const o=g.options[i],drinkGain=r.demand.drinkServing&&drinkCount(o.beverages,r.drinkPreference)>drinkCount(base.beverages,r.drinkPreference);
        const foodGain=keys.some(k=>(o.items[k]||0)>(base.items[k]||0));
        const snackChange=r.snackGoal&&JSON.stringify(snackSignature(o))!==JSON.stringify(snackSignature(base)),avoidGain=(r.avoid||[]).some(k=>base.items[k]&&!o.items[k]);
        if(!i||drinkGain||foodGain||snackChange||avoidGain){
          const signature=JSON.stringify([keys.map(k=>o.items[k]||0),r.demand.drinkServing?drinkCount(o.beverages,r.drinkPreference):0,r.snackGoal?snackSignature(o):null,(r.avoid||[]).map(k=>o.items[k]||0)]);
          const prev=seen.get(signature);if(prev===undefined||o.surchargeMinor<g.options[prev].surchargeMinor)seen.set(signature,i);
        }
      }
      indices.splice(0,indices.length,...new Set([0,...seen.values()]));
      const distributions=[];
      function fill(at,left,picked){if(distributions.length>=128){complete=false;return;}if(at===indices.length-1){distributions.push([...picked,...Array(left).fill(indices[at])]);return;}for(let n=left;n>=0;n--)fill(at+1,left-n,[...picked,...Array(n).fill(indices[at])]);}
      fill(0,g.count,[]);
      const next=[];for(const current of choices)for(const selection of distributions){if(next.length>=256){complete=false;break;}next.push({...current,[g.id]:selection});}
      choices=next;
    }
    const unique=new Map();for(const selection of choices){const v=applyOptions(variant,selection,r.at),sig=JSON.stringify([v.items,v.surchargeMinor,drinkCount(v.beverages,r.drinkPreference)]);if(!unique.has(sig))unique.set(sig,v);}
    return {variants:[...unique.values()].map((v,i)=>({...v,id:variant.id+'-options-'+i})),complete};
  }
  function atOrAfterEight(at){return new Date(Date.parse(at)+8*3600000).getUTCHours()>=20;}
  const ORDER_METHODS={official_web:{name:'官方網站',channels:['takeaway','delivery']},pk_app:{name:'PK 雙饗卡 APP',channels:['takeaway','delivery']},counter:{name:'臨櫃點餐',channels:['takeaway','dinein']},kiosk:{name:'自助點餐機',channels:['takeaway','dinein']},phone:{name:'電話訂餐',channels:['takeaway','delivery']}};
  function orderingCheck(o,r){
    const method=r.orderMethod||(r.app?'pk_app':'official_web'),rule=o.ordering||{};
    if(o.eligibility?.appRequired&&method!=='pk_app')return {allowed:false,status:'excluded',reason:'限 APP 下單'};
    if(rule.platforms&&!rule.platforms.includes(method))return {allowed:false,status:'excluded',reason:'不適用目前下單方式'};
    if(rule.excludedPlatforms?.includes(method))return {allowed:false,status:'excluded',reason:'來源明列排除此下單方式'};
    if(rule.fulfilments&&!rule.fulfilments.includes(r.channel))return {allowed:false,status:'excluded',reason:'不適用目前取餐方式'};
    if(rule.onlinePaymentRequired&&r.paymentMethod==='in_store')return {allowed:false,status:'excluded',reason:'限線上付款'};
    const confirmed=!!rule.platforms?.includes(method)&&(!rule.onlinePaymentRequired||r.paymentMethod==='online');
    if(!confirmed&&r.allowUnknownOrdering===false)return {allowed:false,status:'unknown',reason:'下單方式條件尚未確認'};
    return {allowed:true,status:confirmed?'source_stated':'unknown',reason:confirmed?'來源載明可用此方式':'目前下單／付款方式尚未確認'};
  }
  const SNACKS={tart:{name:'蛋撻',perPerson:1},friesSmall:{name:'小薯條',perPerson:.5},nuggets:{name:'雞塊',perPerson:2},potatoCoinsSmall:{name:'小薯金幣',perPerson:.5},chickenCartilageSmall:{name:'小雞軟骨',perPerson:1/3},germanSausage:{name:'德國芝心腸',perPerson:1},spicySausage:{name:'辣芝心腸',perPerson:1},codBites:{name:'鱈魚塊',perPerson:2},chocolateQQ:{name:'巧克力 QQ 球',perPerson:1},mochiQQ:{name:'麻糬 QQ 球',perPerson:1},qq:{name:'雙色 QQ 球',perPerson:2},hashBrown:{name:'薯餅',perPerson:1},daifuku:{name:'冰淇淋大福',perPerson:1}};
  const sum=xs=>xs.reduce((a,b)=>a+b,0);
  function validInt(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
  function taipeiDate(ms){return new Date(ms+8*3600000).toISOString().slice(0,10);}
  function validateRequest(r){
    if(!r||!r.demand||typeof r.demand!=='object')throw Error('請加入想吃的餐點。');
    const entries=Object.entries(r.demand);
    if(!entries.some(([,n])=>n>0))throw Error('先加入至少一項想吃的餐點。');
    for(const [k,n] of entries)if(!ITEMS[k]||!validInt(n,0,60))throw Error('餐點數量需為 0～60 的整數。');
    if(!validInt(r.people,1,30))throw Error('用餐人數需為 1～30 人。');
    if(!validInt(r.maxOrders,1,12))throw Error('訂單上限需為 1～12 筆。');
    if(r.snackGoal&&(!validInt(r.snackGoal.minTypes,0,3)||!validInt(r.snackGoal.servings,0,60)))throw Error('請選擇有效的點心豐富度。');
    if(r.drinkPreference&&!['any','cola','soda','unsweetened','milkTea','coldMilkTea','hotMilkTea','soup','other'].includes(r.drinkPreference))throw Error('請選擇有效的飲料偏好。');
    if(!['takeaway','delivery','dinein'].includes(r.channel))throw Error('請選擇取餐方式。');
    if(r.orderMethod&&(!ORDER_METHODS[r.orderMethod]||!ORDER_METHODS[r.orderMethod].channels.includes(r.channel)))throw Error('目前下單方式不支援所選取餐方式。');
    if(r.paymentMethod&&!['any','online','in_store'].includes(r.paymentMethod))throw Error('請選擇有效的付款方式。');
    if(!Array.isArray(r.brands)||!r.brands.length||r.brands.some(b=>!['KFC','PH'].includes(b)))throw Error('至少選一個品牌。');
    if(r.budgetMinor!==null&&(!validInt(r.budgetMinor,0,30000000)))throw Error('預算需為有效的非負金額。');
    for(const fees of [r.fees,r.serviceFees])if(fees)for(const rows of Object.values(fees))for(const fee of rows)if(fee!==null&&fee!==undefined&&!validInt(fee,0,30000000))throw Error('每筆額外費用需為有效的非負金額。');
    if(!Number.isFinite(Date.parse(r.at)))throw Error('請輸入有效的用餐時間。');
    return r;
  }
  function buildDemand(p){
    const n=Number(p.people), light=p.appetite==='light',big=p.appetite==='big';
    if(!validInt(n,1,30))throw Error('用餐人數需為 1～30 人。');
    let d={};
    if(p.serving==='individual'){
      const side=p.side||'friesSmall';
      if(!['friesSmall','tart'].includes(side))throw Error('請選擇個人餐配餐。');
      d.individual=n;d[side]=n;d.drinkSmall=n;
    }
    else if(p.preference==='chicken')d.chicken=Math.min(60,n*(light?1:big?3:2));
    else if(p.preference==='pizza')d.pizza9=Math.ceil(n/(light?3:big?1.5:2));
    else {d.pizza9=Math.ceil(n/(light?5:big?3:4));d.chicken=Math.ceil(n*(light?.5:big?1.5:1));}
    if(p.serving!=='individual')for(const id of (p.snacks??(p.tarts?['tart']:[]))){
      if(!SNACKS[id])throw Error('請選擇支援的小點心。');
      d[id]=Math.ceil(n*SNACKS[id].perPerson);
    }
    if(p.drinks)d.drinkSmall=n;
    return d;
  }
  function isActive(o,at){
    const date=taipeiDate(at);
    const v=o.validity||{};
    if(v.excludedDates?.includes(date))return false;
    const windows=v.validWindows||[];
    if(!windows.length)return null;
    const minute=((at+8*3600000)/60000)%1440;
    const day=new Date(at+8*3600000).getUTCDay();
    return windows.some(w=> (!w.from||date>=w.from)&&(!w.toExclusive||date<w.toExclusive)&&(!w.days||w.days.includes(day))&&(!w.startMinute||minute>=w.startMinute)&&(w.endMinute===undefined||minute<w.endMinute));
  }
  function chooseCandidates(dataset,r,now){
    extendItems(dataset);const candidates=[],excluded=[];let optionsComplete=true;
    for(const o of dataset.offers){
      const reasons=[];
      const ordering=orderingCheck(o,r);if(!ordering.allowed)reasons.push(ordering.reason);
      if(!r.brands.includes(o.brand))reasons.push('未選品牌');
      if(o.dataStatus==='conflict')reasons.push('同碼內容衝突');
      if(o.dataStatus==='pending'||o.priceType!=='fixed')reasons.push('價格或品項待確認');
      if(o.eligibility?.personalCoupon)reasons.push('個人專屬券未收錄');
      if(o.requiresParent)reasons.push('加購前置條件尚未支援');
      if(o.eligibility?.memberRequired&&!r.member)reasons.push('需要會員資格');
      const active=isActive(o,Date.parse(r.at));
      if(active===false)reasons.push('不在有效時段');
      if(!r.estimate&&active===null)reasons.push('效期待確認');
      const age=now-Date.parse(o.provenance?.fetchedAt||'');
      if(dataset.mode!=='demo'&&(!Number.isFinite(age)||age>FRESH_MS)&&!r.estimate)reasons.push('資料超過 24 小時或時間未知');
      if(o.dataStatus==='estimate'&&!r.estimate)reasons.push('通路、限購或門市條款待確認');
      if(!r.estimate&&o.combinationPolicy?.separateOrders!=='allowed')reasons.push('多券使用規則待確認');
      if(reasons.length){excluded.push({id:o.id,reasons});continue;}
      for(const raw of o.variants||[]){
       const expanded=expandOptions(raw,r);optionsComplete=optionsComplete&&expanded.complete;
       for(const v of expanded.variants){
        if(v.requiresParent||Object.entries(v.items||{}).some(([k,n])=>!ITEMS[k]||!validInt(n,0,60))){excluded.push({id:o.id,reasons:['品項或加購條件待確認']});continue;}
        if(!Number.isSafeInteger(v.priceMinor)||v.priceMinor<0||!Number.isSafeInteger(v.surchargeMinor??0)||(v.surchargeMinor??0)<0){excluded.push({id:o.id,reasons:['固定價格待確認']});continue;}
        const ch=v.channels||[];
        if(!ch.includes(r.channel)&&!(r.estimate&&ch.includes('unknown'))){excluded.push({id:o.id,reasons:['不適用此通路']});continue;}
        const items={...v.items};
        // Independent mains are explicitly classified; shared pizza never becomes an individual meal.
        items.individual=v.individualMains||0;
        items.burgerMain=Math.min(items.burger||0,v.individualMainItems?.burger??(!v.individualMainItems?v.individualMains||0:0));
        items.drinkServing=v.beverages?drinkCount(v.beverages,r.drinkPreference):r.drinkPreference&&r.drinkPreference!=='any'?0:(items.drinkSmall||0)+(items.drinkMedium||0)+(items.milkTeaCup||0);
        const meta=(root.Planner||(typeof require==='function'?require('./planner.js'):{})).SNACK_META||{};
        items.snackPortions=sum(Object.entries(v.items).map(([k,n])=>meta[k]?n/meta[k].portion:0));
        const snackGroups=[...new Set(Object.entries(v.items).filter(([k,n])=>n>0&&meta[k]).map(([k])=>meta[k].group))];
        if(r.pastaPreference&&r.pastaPreference!=='any'&&items.pasta&&!(v.pastaTags||[]).includes(r.pastaPreference))continue;
        if(r.pizzaPreference&&(items.pizza9||items.pizza13)){
          if(!v.pizzaSlots&&((r.pizzaPreference.minKinds||0)>0||r.pizzaPreference.tag!=='any'))continue;
          if(v.pizzaSlots&&v.pizzaSlots.some(slot=>!slot.allowed.some(id=>r.pizzaPreference.tag==='any'||dataset.pizzaFlavors?.[id]?.tags?.includes(r.pizzaPreference.tag))))continue;
          if(v.distinctPizzaSlots&&new Set(v.pizzaSlots.flatMap(slot=>slot.allowed.filter(id=>r.pizzaPreference.tag==='any'||dataset.pizzaFlavors?.[id]?.tags?.includes(r.pizzaPreference.tag)))).size<v.pizzaSlots.length)continue;
        }
        if(Object.keys(r.demand).every(k=>!r.demand[k]||!items[k]))continue;
        if((r.avoid||[]).some(k=>items[k]>0))continue;
        if(r.exact&&Object.entries(r.demand).some(([k,n])=>n>0&&(items[k]||0)>n))continue;
        if(r.allowExtras===false&&physicalIds.some(k=>items[k]>0&&!r.demand[k]&&!(k==='burger'&&r.demand.burgerMain&&items.burgerMain)&&!(r.demand.individual&&(v.individualMainItems?.[k]||(k==='burger'&&v.individualMains)))))continue;
        if(o.minimumSubtotalMinor&&v.priceMinor<o.minimumSubtotalMinor)continue;
        candidates.push({id:o.id+'/'+v.id,offer:o,variant:v,items,snackGroups,ordering,base:v.priceMinor+(v.surchargeMinor||0),maxUses:o.limits?.maxUsesPerUserPerDay??(r.estimate?r.maxOrders:1),group:o.limits?.sharedLimitGroup||null,groupLimit:o.limits?.sharedGroupMax??null});
       }
      }
    }
    candidates.sort((a,b)=>a.base-b.base||a.id.localeCompare(b.id));
    // Equivalent unrestricted coupons can be represented by their cheapest code.
    const unique=new Map(),limited=[];
    for(const c of candidates){if(c.maxUses<r.maxOrders||c.group){limited.push(c);continue;}const key=JSON.stringify([c.offer.brand,c.items,c.snackGroups,c.variant.pizzaSlots,c.variant.distinctPizzaSlots,drinkCount(c.variant.beverages,r.drinkPreference),c.ordering.status]);if(!unique.has(key))unique.set(key,c);}
    let reduced=[...unique.values(),...limited].sort((a,b)=>a.base-b.base||a.id.localeCompare(b.id));
    if(!r.exact&&r.allowExtras!==false){
      const requested=Object.keys(r.demand).filter(k=>r.demand[k]>0),kept=[];
      const flavorKey=c=>(r.pizzaPreference?.minKinds||0)>0?JSON.stringify(c.variant.pizzaSlots||[]):'';
      for(const b of reduced){
        // A strictly cheaper unrestricted order with at least the same requested
        // contents replaces B in any plan without changing order count or fees.
        const dominated=kept.some(a=>a.base<b.base&&a.offer.brand===b.offer.brand&&a.maxUses>=r.maxOrders&&!a.group&&a.ordering.status===b.ordering.status&&flavorKey(a)===flavorKey(b)&&requested.every(k=>(a.items[k]||0)>=Math.min(r.demand[k],b.items[k]||0))&&(!(r.snackGoal?.minTypes>0)||b.snackGroups.every(g=>a.snackGroups.includes(g))));
        if(!dominated)kept.push(b);
      }
      reduced=kept;
    }
    return {candidates:reduced,excluded,optionsComplete};
  }
  function assignFlavors(selected,preference,catalog={}){
    if(!preference)return {complete:true,assignments:[],distinct:0};
    const slots=[];for(const [order,c] of selected.entries())for(const slot of c.variant.pizzaSlots||[])slots.push({order,size:slot.size,allowed:slot.allowed.filter(id=>preference.tag==='any'||catalog[id]?.tags?.includes(preference.tag))});
    if(slots.some(s=>!s.allowed.length))return {complete:false,assignments:[],distinct:0};
    const owners=new Map();
    function match(i,seen){for(const flavor of slots[i].allowed){if(seen.has(flavor))continue;seen.add(flavor);if(!owners.has(flavor)||match(owners.get(flavor),seen)){owners.set(flavor,i);return true;}}return false;}
    slots.forEach((_,i)=>match(i,new Set()));const assigned=new Map([...owners].map(([flavor,i])=>[i,flavor]));
    const assignments=slots.map((slot,i)=>({order:slot.order,size:slot.size,flavorId:assigned.get(i)||slot.allowed[0],name:catalog[assigned.get(i)||slot.allowed[0]]?.name||assigned.get(i)||slot.allowed[0]}));
    for(const [order,c] of selected.entries())if(c.variant.distinctPizzaSlots){
      const seen=new Set();for(let i=0;i<assignments.length;i++)if(assignments[i].order===order){const a=assignments[i];if(seen.has(a.flavorId)){const replacement=slots[i].allowed.find(id=>!seen.has(id));if(!replacement)return {complete:false,assignments:[],distinct:0};a.flavorId=replacement;a.name=catalog[replacement]?.name||replacement;}seen.add(a.flavorId);}
    }
    const distinct=new Set(assignments.map(a=>a.flavorId)).size;
    return {complete:distinct>=(preference.minKinds||0),assignments,distinct};
  }
  function solve(dataset,request,config={}){
    extendItems(dataset);const r=validateRequest(request), now=config.now??Date.now(),start=Date.now();
    const {candidates:cs,excluded,optionsComplete}=chooseCandidates(dataset,r,now);
    if(r.snackGoal||r.pizzaPreference)cs.sort((a,b)=>{
      const utility=c=>sum(Object.entries(r.demand).filter(([,n])=>n>0).map(([k,n])=>Math.min(n,c.items[k]||0)/n*(k==='snackPortions'?.35:1)))/(c.base||1);
      return utility(b)-utility(a)||a.id.localeCompare(b.id);
    });
    const maxStates=config.maxStates??1800000,timeLimit=config.timeLimitMs??1800;
    let states=0,complete=true,minAny=null,minWithin=null,closest=null,bestSingle=null,bestFew=null;
    const leaders=[],oneBrand=[],fewOrders=[];
    const demandKeys=Object.keys(r.demand).filter(k=>r.demand[k]>0);
    const singleBrandPossible=r.brands.filter(brand=>demandKeys.every(k=>cs.some(c=>c.offer.brand===brand&&(c.items[k]||0)>0))&&new Set(cs.filter(c=>c.offer.brand===brand).flatMap(c=>c.snackGroups)).size>=(r.snackGoal?.minTypes||0));
    const bounds=cs.map((_,i)=>{
      const remaining=cs.slice(i),weights={},maximum={};
      for(const k of demandKeys){weights[k]=Infinity;maximum[k]=0;for(const c of remaining){const q=c.items[k]||0;if(q){weights[k]=Math.min(weights[k],c.base/q);maximum[k]=Math.max(maximum[k],q);}}}
      let scale=1;for(const c of remaining){const weighted=sum(demandKeys.map(k=>Number.isFinite(weights[k])?weights[k]*(c.items[k]||0):0));if(c.base===0&&weighted>0)scale=Infinity;else if(c.base)scale=Math.max(scale,weighted/c.base);}
      for(const k of demandKeys)if(Number.isFinite(weights[k]))weights[k]/=scale;
      return {weights,maximum};
    });
    // The fractional covering bound never charges the same bundle twice:
    // weights are scaled so every candidate's weighted contents cost no more than its price.
    const completeFees=r.channel==='takeaway'||r.brands.every(b=>Array.from({length:r.maxOrders},(_,i)=>r.fees?.[b]?.[i]).every(v=>v!==undefined&&v!==null));
    function compare(a,b){
      if(a.totalCost===null&&b.totalCost!==null)return 1;
      if(b.totalCost===null&&a.totalCost!==null)return -1;
      return (a.totalCost??a.knownSubtotal)-(b.totalCost??b.knownSubtotal)||a.brandCount-b.brandCount||a.orders.length-b.orders.length||a.extraCount-b.extraCount||a.id.localeCompare(b.id);
    }
    function keep(arr,p,cmp=compare){if(arr.some(x=>x.id===p.id))return;arr.push(p);arr.sort(cmp);if(arr.length>12)arr.length=12;}
    function makePlan(selected,counts){
      const flavorPlan=assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors);
      const brandSlots={};
      const orders=selected.map((c,index)=>{
        const slot=brandSlots[c.offer.brand]||0;brandSlots[c.offer.brand]=slot+1;
        const fee=r.channel==='delivery'?(r.fees?.[c.offer.brand]?.[slot]??null):0;
        const service=r.channel==='delivery'?(r.serviceFees?.[c.offer.brand]?.[slot]??0):0;
        return {index,feeSlot:slot,brand:c.offer.brand,offerId:c.offer.id,variantId:c.variant.id,code:c.offer.code,title:c.offer.title,items:c.variant.items,base:c.base,mealBase:c.variant.priceMinor,surchargeMinor:c.variant.surchargeMinor||0,beverages:c.variant.beverages||[],optionChoices:c.variant.optionChoices||[],orderingStatus:c.ordering.status,orderingNote:c.ordering.reason,fee,service,total:fee===null?null:c.base+fee+service,sourceUrl:c.offer.provenance?.sourceUrl,officialUrl:c.offer.officialUrl,conditions:c.offer.conditions||[],choice:c.variant.choice||null,pizzaChoices:flavorPlan.assignments.filter(a=>a.order===index),mainDescription:c.variant.mainDescription||null};
      });
      const unknown=orders.some(o=>o.total===null),knownSubtotal=sum(orders.map(o=>o.base));
      const total=unknown?null:sum(orders.map(o=>o.total));
      const consumed={...r.demand},allocated={};let mainNeed=r.demand.individual||0;
      for(const c of selected){
        const mainItems=c.variant.individualMainItems||(c.variant.individualMains&&c.items.burger?{burger:c.variant.individualMains}:{});
        for(const [k,n] of Object.entries(mainItems)){const take=Math.min(n,mainNeed);allocated[k]=(allocated[k]||0)+take;mainNeed-=take;}
      }
      for(const [k,n] of Object.entries(allocated))consumed[k]=Math.max(consumed[k]||0,n);
      if(r.demand.burgerMain)consumed.burger=Math.max(consumed.burger||0,r.demand.burgerMain);
      const allocatedDrinks={};let drinkNeed=r.demand.drinkServing||0;for(const c of selected)for(const d of c.variant.beverages||[]){if(!drinkMatch(d,r.drinkPreference)||!drinkNeed)continue;const take=Math.min(drinkNeed,d.quantity);allocatedDrinks[d.item]=(allocatedDrinks[d.item]||0)+take;drinkNeed-=take;}for(const [k,n] of Object.entries(allocatedDrinks))consumed[k]=Math.max(consumed[k]||0,n);
      if(r.demand.snackPortions){
        const meta=(root.Planner||(typeof require==='function'?require('./planner.js'):{})).SNACK_META||{};
        const ids=physicalIds.filter(k=>meta[k]&&(counts[k]||0)>0),groups=[...new Set(ids.map(k=>meta[k].group))];
        for(const group of groups.slice(0,r.snackGoal?.minTypes||0))if(!ids.some(k=>meta[k].group===group&&(consumed[k]||0)>0)){
          const k=ids.find(k=>meta[k].group===group);consumed[k]=1;
        }
        let remaining=Math.max(0,r.demand.snackPortions-sum(ids.map(k=>(consumed[k]||0)/meta[k].portion)));
        for(const k of ids){const available=Math.max(0,(counts[k]||0)-(consumed[k]||0)),take=Math.min(available,Math.ceil(remaining*meta[k].portion-1e-9));if(take>0){consumed[k]=(consumed[k]||0)+take;remaining=Math.max(0,remaining-take/meta[k].portion);}}
      }
      const extras=Object.fromEntries(physicalIds.map(k=>[k,Math.max(0,(counts[k]||0)-(consumed[k]||0))]).filter(([,n])=>n>0));
      const coverage=Object.entries(r.demand).filter(([,n])=>n>0).map(([k,n])=>({id:k,need:n,got:counts[k]||0}));
      const snackTypes=[...new Set(selected.flatMap(c=>c.snackGroups))];
      return {id:selected.map(c=>c.id).sort().join('|'),orders,coverage,extras,extraCount:sum(Object.values(extras)),snackTypes,pizzaFlavors:flavorPlan.distinct,brandCount:new Set(orders.map(o=>o.brand)).size,knownSubtotal,totalCost:total,unknownCosts:unknown,eligibilityStatus:dataset.mode==='demo'?'demo':(r.estimate?'needs_confirmation':'eligible_in_scope'),searchComplete:complete};
    }
    function visit(from,selected,counts,uses,groups){
      if(!complete)return;
      states++;
      if(states>maxStates||(states%128===0&&Date.now()-start>timeLimit)){complete=false;return;}
      if(selected.length){
        const missing=sum(Object.entries(r.demand).map(([k,n])=>Math.max(0,n-(counts[k]||0))));
        const exactOk=!r.exact||Object.entries(r.demand).every(([k,n])=>!n||(counts[k]||0)===n);
        const snackTypes=new Set(selected.flatMap(c=>c.snackGroups)).size;
        const flavors=missing===0?assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors):null;
        if(missing===0&&exactOk&&snackTypes>=(r.snackGoal?.minTypes||0)&&flavors.complete){
          const p=makePlan(selected,counts);
          if(!minAny||compare(p,minAny)<0)minAny=p;
          if(p.brandCount===1&&(!bestSingle||compare(p,bestSingle)<0))bestSingle=p;
          if(!bestFew||p.orders.length<bestFew.orders.length||p.orders.length===bestFew.orders.length&&compare(p,bestFew)<0)bestFew=p;
          if(r.budgetMinor===null||p.totalCost!==null&&p.totalCost<=r.budgetMinor){
            keep(leaders,p);if(p.brandCount===1)keep(oneBrand,p);
            keep(fewOrders,p,(a,b)=>a.orders.length-b.orders.length||compare(a,b));
            if(!minWithin||compare(p,minWithin)<0)minWithin=p;
          }
          // Adding a paid order cannot reduce the objective; zero-priced extras also increase order count.
          return;
        }
        if(!closest||missing<closest.missing){closest={missing,counts:{...counts}};}
      }
      if(selected.length>=r.maxOrders)return;
      if(!cs[from])return;
      const bound=bounds[from];let requiredOrders=0,lower=0;
      for(const k of demandKeys){const deficit=Math.max(0,r.demand[k]-(counts[k]||0));if(!deficit)continue;if(!bound.maximum[k])return;requiredOrders=Math.max(requiredOrders,Math.ceil(deficit/bound.maximum[k]));lower+=deficit*bound.weights[k];}
      if(requiredOrders>r.maxOrders-selected.length)return;
      if(completeFees&&minAny){
        const brandSlots={},currentCost=sum(selected.map(c=>{const slot=brandSlots[c.offer.brand]||0;brandSlots[c.offer.brand]=slot+1;return c.base+(r.channel==='delivery'?(r.fees[c.offer.brand][slot]||0)+(r.serviceFees?.[c.offer.brand]?.[slot]||0):0);}));
        lower+=currentCost;
        const canImproveMain=lower<=(minAny.totalCost??Infinity)+.0001;
        const brands=new Set(selected.map(c=>c.offer.brand));
        const canImproveSingle=brands.size<=1&&singleBrandPossible.some(b=>!brands.size||brands.has(b))&&(!bestSingle||lower<=(bestSingle.totalCost??Infinity)+.0001);
        const minOrders=selected.length+requiredOrders;
        const canImproveFew=!bestFew||minOrders<bestFew.orders.length||minOrders===bestFew.orders.length&&lower<=(bestFew.totalCost??Infinity)+.0001;
        if(!canImproveMain&&!canImproveSingle&&!canImproveFew)return;
      }
      for(let i=from;i<cs.length;i++){
        const c=cs[i],o=c.offer;
        if((uses[o.id]||0)>=c.maxUses)continue;
        if(c.group&&c.groupLimit!==null&&(groups[c.group]||0)>=c.groupLimit)continue;
        if(!r.cross&&selected.length&&selected[0].offer.brand!==o.brand)continue;
        const next={...counts};for(const [k,n] of Object.entries(c.items))next[k]=(next[k]||0)+n;
        if(r.exact&&Object.entries(r.demand).some(([k,n])=>n>0&&(next[k]||0)>n))continue;
        uses[o.id]=(uses[o.id]||0)+1;if(c.group)groups[c.group]=(groups[c.group]||0)+1;
        selected.push(c);visit(i,selected,next,uses,groups);selected.pop();uses[o.id]--;if(c.group)groups[c.group]--;
        if(!complete)break;
      }
    }
    // Seed a few feasible plans before exhaustive enumeration of the larger catalogue.
    if(r.snackGoal||r.drinkPreference){
      for(const factor of [0.5,1,2]){
        const selected=[],counts={},uses={},groups={};
        while(selected.length<r.maxOrders){
          const currentGroups=new Set(selected.flatMap(c=>c.snackGroups));let best=null,score=0;
          for(const c of cs){if((uses[c.offer.id]||0)>=c.maxUses||c.group&&c.groupLimit!==null&&(groups[c.group]||0)>=c.groupLimit||!r.cross&&selected.length&&selected[0].offer.brand!==c.offer.brand)continue;
            if(r.exact&&demandKeys.some(k=>(counts[k]||0)+(c.items[k]||0)>r.demand[k]))continue;
            const gain=sum(demandKeys.map(k=>Math.min(Math.max(0,r.demand[k]-(counts[k]||0)),c.items[k]||0)/r.demand[k]*(['paperChicken','pasta','burgerMain','chicken','pizza6','pizza9','pizza13'].includes(k)?8:1)))+Math.max(0,(r.snackGoal?.minTypes||0)-currentGroups.size)*c.snackGroups.filter(g=>!currentGroups.has(g)).length*.2;
            const value=gain/Math.pow(Math.max(c.base,1),factor);if(value>score){score=value;best=c;}
          }
          if(!best||!score)break;selected.push(best);uses[best.offer.id]=(uses[best.offer.id]||0)+1;if(best.group)groups[best.group]=(groups[best.group]||0)+1;for(const [k,n] of Object.entries(best.items))counts[k]=(counts[k]||0)+n;
          if(demandKeys.every(k=>(counts[k]||0)>=r.demand[k])&&new Set(selected.flatMap(c=>c.snackGroups)).size>=(r.snackGoal?.minTypes||0)&&assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors).complete){visit(cs.length,selected,counts,uses,groups);break;}
        }
      }
    }
    visit(0,[],{}, {},{});complete=complete&&optionsComplete;
    if(r.budgetMinor!==null&&minAny?.totalCost===null){keep(leaders,minAny);}
    const alternatives=[];
    function add(p,label){if(p&&!alternatives.some(x=>x.id===p.id))alternatives.push({...p,label,searchComplete:complete});}
    add(leaders[0], '金額最低');add(oneBrand[0],'只買一家');add(fewOrders[0],'訂單較少');
    for(const p of leaders)if(alternatives.length<3)add(p,'其他組合');
    const missing=closest?Object.entries(r.demand).filter(([k,n])=>(closest.counts[k]||0)<n).map(([k,n])=>({id:k,quantity:n-(closest.counts[k]||0)})):Object.entries(r.demand).filter(([,n])=>n>0).map(([id,quantity])=>({id,quantity}));
    return {plans:alternatives,more:leaders.slice(0,12),minimumIgnoringBudget:minAny?{...minAny,searchComplete:complete}:null,missing,searchComplete:complete,states,elapsedMs:Date.now()-start,candidateCount:cs.length,excluded,orderLimit:r.maxOrders,mode:dataset.mode};
  }
  const api={ITEMS,SNACKS,physicalIds,ORDER_METHODS,orderingCheck,extendItems,applyOptions,expandOptions,drinkMatch,drinkCount,buildDemand,validateRequest,isActive,chooseCandidates,assignFlavors,solve,taipeiDate};
  root.Feast=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
