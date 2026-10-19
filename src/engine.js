(function(root){
  'use strict';
  const FRESH_MS=24*60*60*1000;
  const ITEMS={
    burgerSmall:{name:'脆雞堡（小）',unit:'個',emoji:'🍔'},
    chickenPorridge:{name:'紅藜燕麥脆雞粥',unit:'份',emoji:'🥣'},
    omeletFlatbread:{name:'總匯歐姆蛋燒餅',unit:'份',emoji:'🥙'},
    chickenFlatbread:{name:'吮指脆雞燒餅',unit:'份',emoji:'🥙'},
    chicken:{name:'原塊炸雞',unit:'塊',emoji:'🍗'},
    tart:{name:'原味蛋撻',unit:'顆',emoji:'🥧'},
    burger:{name:'漢堡',unit:'個',emoji:'🍔'},
    paperChicken:{name:'紙包雞',unit:'份',emoji:'🍗'},
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
  function extendItems(dataset){for(const [id,meta] of Object.entries(dataset.foodCatalog||{}))if(!ITEMS[id]&&/^(?:food_[a-f0-9]{12}|[a-zA-Z][a-zA-Z0-9]*)$/.test(id)){ITEMS[id]=meta;physicalIds.push(id);}root.Planner?.extendSnacks(dataset);}
  const drinkMatch=(d,preference='any')=>d.size!=='bottle'&&(preference==='any'?d.kind!=='soup':preference==='soda'?['cola','soda'].includes(d.kind):preference==='coldMilkTea'?d.kind==='milkTea'&&d.name.includes('冰'):preference==='hotMilkTea'?d.kind==='milkTea'&&d.name.includes('熱'):d.kind===preference);
  function drinkCount(beverages,preference){return sum((beverages||[]).filter(d=>drinkMatch(d,preference)).map(d=>d.quantity));}
  function applyOptions(variant,selections={},at=null){
    const fallback=[['drinkSmall','small'],['drinkMedium','medium'],['milkTeaCup','cup']].filter(([k])=>variant.items[k]).map(([item,size])=>({name:ITEMS[item].name,quantity:variant.items[item],kind:'unknown',size,item}));
    const v={...variant,items:{...variant.items},beverages:[...(variant.beverages??fallback)],optionChoices:[],selectionIndices:Object.fromEntries((variant.optionGroups||[]).map(g=>[g.id,[...(selections[g.id]||Array(g.count).fill(0))]])),surchargeMinor:variant.surchargeMinor||0};
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
    const snackSignature=o=>Object.entries(o.items).filter(([k])=>meta[k]&&!meta[k].selectionOnly).map(([k,n])=>[meta[k].group,n/meta[k].portion]).sort();
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
    if(r.orderMethod==='auto'){
      const options=Object.keys(ORDER_METHODS).filter(m=>ORDER_METHODS[m].channels.includes(r.channel)).map(method=>orderingCheck(o,{...r,orderMethod:method,paymentMethod:o.ordering?.onlinePaymentRequired&&(!r.paymentMethod||r.paymentMethod==='any')?'online':r.paymentMethod})).filter(x=>x.allowed);
      return options.find(x=>x.status==='source_stated')||options[0]||{allowed:false,status:'excluded',reason:'沒有符合取餐與付款條件的下單管道'};
    }
    const method=r.orderMethod||(r.app?'pk_app':'official_web'),rule=o.ordering||{};
    if(o.eligibility?.appRequired&&method!=='pk_app')return {allowed:false,status:'excluded',reason:'限 APP 下單'};
    if(rule.platforms&&!rule.platforms.includes(method))return {allowed:false,status:'excluded',reason:'不適用目前下單方式'};
    if(rule.excludedPlatforms?.includes(method))return {allowed:false,status:'excluded',reason:'來源明列排除此下單方式'};
    if(rule.fulfilments&&!rule.fulfilments.includes(r.channel))return {allowed:false,status:'excluded',reason:'不適用目前取餐方式'};
    if(rule.onlinePaymentRequired&&r.paymentMethod==='in_store')return {allowed:false,status:'excluded',reason:'限線上付款'};
    const confirmed=!!rule.platforms?.includes(method)&&(!rule.onlinePaymentRequired||r.paymentMethod==='online');
    if(!confirmed&&r.allowUnknownOrdering===false)return {allowed:false,status:'unknown',reason:'下單方式條件尚未確認'};
    return {allowed:true,status:confirmed?'source_stated':'unknown',method,paymentMethod:rule.onlinePaymentRequired?'online':r.paymentMethod||'any',reason:confirmed?'來源載明可用此方式':'目前下單／付款方式尚未確認'};
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
    if(r.orderMethod&&r.orderMethod!=='auto'&&(!ORDER_METHODS[r.orderMethod]||!ORDER_METHODS[r.orderMethod].channels.includes(r.channel)))throw Error('目前下單方式不支援所選取餐方式。');
    if(r.dataScope&&!['all','consistent','official'].includes(r.dataScope))throw Error('請選擇有效的資料範圍。');
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
  function couponTerms(o){
    // Keep ingestion diagnostics in the dataset, outside customer-facing terms.
    const diagnostic=/^(?:基本組合與套餐價採官方 API|官方查詢參考門市：|點餐明細與餐點說明未能完整配對|來源整理資料，|供餐時段與取餐方式依 KCouper|KCouper 將可用餐期與取餐方式|本次官方查詢失敗，沿用|含未完成對照的餐點；|來源標示起價，升級差額|套餐敘述尚待分解：|活動名稱提及紙包雞；)/;
    return [...new Set((o.conditions||[]).filter(note=>typeof note==='string'&&note.trim()&&!diagnostic.test(note.trim())&&!note.includes('於查詢當下回報售罄；本配置僅供估算')) )];
  }
  function planContents(plan){
    // Sum purchased physical foods, including extras. Derived demand counters
    // (burgerMain, drinkServing, snackPortions) must never count as more food.
    const totals={};
    for(const order of plan.orders||[])for(const [id,n] of Object.entries(order.items||{})){
      if(physicalIds.includes(id)&&Number.isSafeInteger(n)&&n>0)totals[id]=(totals[id]||0)+n;
    }
    return Object.fromEntries(physicalIds.filter(id=>totals[id]>0).map(id=>[id,totals[id]]));
  }
  function mealIdentityIssue(o){
    if(o.sourceMetadata?.compositionBasis==='structured_items')return null;
    const title=[o.title,o.rawText].filter(Boolean).join(' '),variants=o.variants||[];
    return title.includes('紙包雞')&&!/替換|換購|換成|可換|[0-9一二三]選|加價|升級|或|[/／]/.test(title)&&variants.length&&variants.every(v=>!v.items.paperChicken)&&variants.some(v=>v.items.chicken>0)
      ?'餐點身分不一致：標題記載紙包雞，但來源預設內容是炸雞；需核對來源':null;
  }
  const verificationFields=['brand','code','title','priceType','displayPriceMinor','variants','validity','ordering','eligibility','limits','combinationPolicy','officialUrl'];
  function stableJson(value){
    if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function contentSignature(o){return stableJson(Object.fromEntries(verificationFields.map(k=>[k,o[k]??null])));}
  function verificationCheck(o,now=Date.now()){
    const v=o.verification;
    if(['pending','conflict'].includes(o.dataStatus)||o.priceType!=='fixed')return {allowed:false,reason:'價格、品項或來源衝突仍待確認'};
    if(v?.status!=='checked')return {allowed:false,reason:v?.reason||'尚未完成官方配置核對'};
    if(!['https://www.kfcclub.com.tw/coupon','https://www.pizzahut.com.tw/promotions/?mode=cpSch&type=plu'].includes(v.sourceUrl))return {allowed:false,reason:'缺少可核對的官方來源'};
    const checked=Date.parse(v.checkedAt),until=Date.parse(v.validUntil),review=Date.parse(v.reviewBy);
    if(![checked,until,review].every(Number.isFinite)||checked>now||now>=until||now>review||now-checked>24*3600000)return {allowed:false,reason:'官方查核已過期，需重新核對'};
    if(!v.contentSignature||contentSignature(o)!==v.contentSignature)return {allowed:false,reason:'餐點、價格或適用條件已異動，需重新核對'};
    if(!v.imageHash||!v.evidencePath||!v.scope?.length)return {allowed:false,reason:'官方查核證據不完整'};
    return {allowed:true,reason:'官方基本配置已核對'};
  }
  function couponLookupCheck(o,now=Date.now()){
    if(o.brand!=='PH')return {allowed:true,status:'not_applicable',label:''};
    const query=o.couponLookup,record=query?.status==='error'?query.lastSuccess:query;
    const bound=query?.code===o.code&&query?.endpoint===record?.endpoint&&record?.code===o.code&&record?.endpoint==='https://www.pizzahut.com.tw/order/?m=ajax';
    const checked=Date.parse(record?.checkedAt),age=now-checked;
    if(!bound||!Number.isFinite(checked)||age<0)return {allowed:false,status:'pending',label:'官方查碼尚未配對・待確認'};
    if(record.status==='invalid')return {allowed:false,status:'invalid',label:query.status==='error'?'上次官方查碼不接受此碼・重查失敗':'官方查碼目前不接受此碼'};
    if(record.status!=='matched'||!Number.isSafeInteger(record.productId)||record.productId<=0||!Number.isSafeInteger(record.typeId)||record.typeId<=0)return {allowed:false,status:'pending',label:'官方商品配對資料不完整'};
    const retained=query.status==='error',stale=age>8*86400000;
    return {allowed:true,status:'matched',productId:record.productId,typeId:record.typeId,checkedAt:record.checkedAt,detailUrl:'https://www.pizzahut.com.tw/order/?'+new URLSearchParams({mode:'step_2',type_id:record.typeId,cno:o.code}).toString(),label:retained?'本次查碼失敗・沿用上次商品配對':stale?'上次官方查碼已配對・資料較舊':'官方查碼已配對',retained,stale};
  }
  function sourceConfidence(o,now=Date.now()){
    if(o.kind==='direct_menu')return {level:'official_menu',label:'官方單點菜單・供應以門市為準'};
    if(o.brand==='KFC'&&o.sourceMetadata?.compositionBasis==='official_intro')return {level:'official_description',label:'官方餐點說明・依原組合估算'};
    if(o.brand==='PH'&&o.couponLookup){const paired=couponLookupCheck(o,now);return {level:paired.allowed?'code_matched':paired.status==='invalid'?'invalid_code':'lookup_pending',label:paired.label+(paired.allowed?'・餐點價目依來源估算':'')+(o.sourceConflict?'・來源版本有差異':'')};}
    if(verificationCheck(o,now).allowed)return {level:'official',label:'官方基本配置已核對'};
    if(o.sourceConflict)return {level:'conflict',label:'來源版本有差異・需核對'};
    const signatures=new Map();
    for(const obs of o.observations||[]){
      if(obs.parseIssues?.length||!obs.parsedConfigurations?.length)continue;
      const sig=stableJson(obs.parsedConfigurations.map(v=>({items:v.items,priceMinor:v.priceMinor})).sort((a,b)=>stableJson(a).localeCompare(stableJson(b))));
      if(!signatures.has(sig))signatures.set(sig,new Set());signatures.get(sig).add(obs.sourcePublisher||obs.sourceId);
    }
    const own=stableJson((o.variants||[]).map(v=>({items:v.items,priceMinor:v.priceMinor})).sort((a,b)=>stableJson(a).localeCompare(stableJson(b))));
    if((signatures.get(own)?.size||0)>1)return {level:'corroborated',label:'多來源基本餐點與價格一致・估算'};
    return {level:'source',label:o.provenance?.sourcePublisher==='KCouper 公開資料'?'KCouper 官網 API 整理・估算':'來源記載・估算'};
  }
  function recommendationCheck(dataset,o,now=Date.now(),r={}){
    if(o.kind==='direct_menu'){
      const m=o.menuSnapshot,checked=Date.parse(m?.checkedAt),until=Date.parse(m?.recheckBy),at=Date.parse(r.at);
      const officialSource=o.brand==='PH'?m?.productId>0&&m.sourceUrl?.startsWith('https://www.pizzahut.com.tw/order/?'):o.brand==='KFC'&&/^[A-Za-z0-9]{1,24}$/.test(m?.productId||'')&&/^https:\/\/www\.kfcclub\.com\.tw\/menu\?menuId=(?:5|184)$/.test(m.sourceUrl||'')&&['takeaway','delivery'].includes(m.channel)&&o.variants?.every(v=>v.channels?.length===1&&v.channels[0]===m.channel);
      const valid=officialSource&&m.contentSignature===contentSignature(o)&&m.contentHash&&Number.isFinite(checked)&&Number.isFinite(until)&&until>checked&&until-checked<=8*86400000&&now>=checked&&now<until&&(!Number.isFinite(at)||at>=checked&&at<until)&&o.priceType==='fixed'&&o.variants?.length&&o.variants.every(v=>Number.isSafeInteger(v.priceMinor)&&v.priceMinor>0&&Object.keys(v.items||{}).length&&!Object.keys(v.items).some(k=>k.startsWith('food_')));
      return {allowed:!!valid&&r.dataScope!=='official',reason:valid?'官方單點菜單・供應以門市為準':'官方單點菜單待更新'};
    }
    if(dataset.mode==='demo')return {allowed:!['pending','conflict'].includes(o.dataStatus),reason:'合成示範，不能兌換'};
    if(o.brand==='KFC'&&dataset.sourcePolicy?.KFC?.compositionBasis==='official_intro'&&o.sourceMetadata?.compositionBasis!=='official_intro')return {allowed:false,reason:'待取得官方餐點說明，不以預設選項代替基本組合'};
    if(o.brand==='PH'&&(o.couponLookup||dataset.sourcePolicy?.PH?.apiIntegration==='code_lookup')){const paired=couponLookupCheck(o,now);if(!paired.allowed)return {allowed:false,reason:paired.label};}
    if(dataset.recommendationPolicy?.requireOfficial||r.dataScope==='official')return verificationCheck(o,now);
    if(dataset.recommendationPolicy?.allowAllSources){
      if(o.dataStatus==='official')return verificationCheck(o,now);
      if(o.dataStatus==='pending'||o.priceType!=='fixed'||!o.variants?.length||mealIdentityIssue(o))return {allowed:false,reason:o.reviewReason||'缺少可計價的完整配置'};
      if(o.dataStatus==='conflict'&&!o.sourceVersionKey)return {allowed:false,reason:'請分開使用各來源版本，不能混合矛盾內容'};
      if(r.dataScope==='consistent'&&o.sourceConflict)return {allowed:false,reason:'已排除來源版本有差異的券'};
      if(o.variants.some(v=>Object.keys(v.items||{}).some(k=>k.startsWith('food_'))))return {allowed:false,reason:'餐點仍未完整辨識'};
      return {allowed:true,reason:sourceConfidence(o,now).label};
    }
    return {allowed:!['pending','conflict'].includes(o.dataStatus),reason:'來源估算，尚未官方核對'};
  }
  function catalogOffer(root,key,now=Date.now()){
    if((!key||key==='official')&&verificationCheck(root,now).allowed)return root;
    const versions=root.sourceVersions||[];
    const version=versions.find(v=>v.sourceVersionKey===key)||versions.find(v=>v.dataStatus==='estimate')||versions[0];
    if(!version)return root;
    const paired=couponLookupCheck(root,now);
    return {...version,couponLookup:root.couponLookup,officialUrl:paired.detailUrl||version.officialUrl,observations:root.observations,sourceVersions:versions,sourceConflict:root.dataStatus==='conflict',conflictReason:root.dataStatus==='conflict'?root.reviewReason:null,verification:{status:'unverified',reason:'此來源版本未完成官方逐配置核對'}};
  }
  function planningOffers(dataset,r,now){
    if(!dataset.recommendationPolicy?.allowAllSources)return [...dataset.offers,...(dataset.menuOffers||[])];
    const out=[];
    for(const root of dataset.offers){
      const checked=verificationCheck(root,now).allowed;
      if(checked)out.push({...root,sourceVersionKey:'official',versionExclusive:true});
      if(r.dataScope==='official')continue;
      const versions=root.sourceVersions||[root],seen=new Set();
      for(const v of versions){
        if(v.dataStatus==='official')continue;
        const sig=stableJson([v.variants,v.validity,v.ordering,v.eligibility,v.limits,v.priceType]);if(seen.has(sig))continue;seen.add(sig);
        const paired=couponLookupCheck(root,now);
        const o={...v,id:root.id,couponLookup:root.couponLookup,officialUrl:paired.detailUrl||v.officialUrl,sourceVersionKey:v.sourceVersionKey||'source',sourceConflict:root.dataStatus==='conflict',conflictReason:root.dataStatus==='conflict'?root.reviewReason:null,versionExclusive:checked||versions.length>1,observations:root.observations,verification:{status:'unverified',reason:'此來源版本未完成官方逐配置核對'}};
        const restrictions=root.ordering?.officialRestrictionEvidence||[];
        if(restrictions.length){
          const excluded=new Set(restrictions.flatMap(x=>x.excludedFulfilments||[]));
          o.ordering={...o.ordering,fulfilments:(o.ordering?.fulfilments||['takeaway','delivery','dinein']).filter(c=>!excluded.has(c)),officialRestrictionEvidence:restrictions};
        }
        out.push(o);
      }
    }
    if(r.dataScope!=='official')out.push(...(dataset.menuOffers||[]));
    return out;
  }
  function catalogChoice(o,category='all',at=new Date().toISOString()){
    let best=null;
    for(const base of o.variants||[]){
      const variants=category==='all'?[applyOptions(base,{},at)]:expandOptions(base,{demand:{[category]:1},at,drinkPreference:'any',avoid:[]}).variants;
      for(const selected of variants){
        if(category!=='all'&&!(selected.items[category]>0))continue;
        const total=selected.priceMinor===null?null:selected.priceMinor+(selected.surchargeMinor||0);
        if(!best||(total??Infinity)<(best.total??Infinity))best={base,selected,selections:selected.selectionIndices,total};
      }
    }
    return best;
  }
  function chooseCandidates(dataset,r,now,bannedSources=[]){
    extendItems(dataset);const candidates=[],excluded=[];let optionsComplete=true;
    for(const o of planningOffers(dataset,r,now)){
      if(bannedSources.includes(o.id+'/'+(o.sourceVersionKey||'')))continue;
      const reasons=[];
      const verification=recommendationCheck(dataset,o,now,r);if(!verification.allowed)reasons.push(verification.reason);
      const ordering=orderingCheck(o,r);if(!ordering.allowed)reasons.push(ordering.reason);
      if(!r.brands.includes(o.brand))reasons.push('未選品牌');
      if(o.dataStatus==='conflict')reasons.push('同碼內容衝突');
      if(o.dataStatus==='pending'||o.priceType!=='fixed')reasons.push('價格或品項待確認');
      if(mealIdentityIssue(o))reasons.push(mealIdentityIssue(o));
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
        items.snackPortions=sum(Object.entries(v.items).map(([k,n])=>meta[k]&&!meta[k].selectionOnly?n/meta[k].portion:0));
        const snackGroups=[...new Set(Object.entries(v.items).filter(([k,n])=>n>0&&meta[k]&&!meta[k].selectionOnly).map(([k])=>meta[k].group))];
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
        candidates.push({id:o.id+'/'+(o.sourceVersionKey?o.sourceVersionKey+'/':'')+v.id,offer:o,variant:v,items,snackGroups,ordering,base:v.priceMinor+(v.surchargeMinor||0),maxUses:o.limits?.maxUsesPerUserPerDay??(r.estimate?r.maxOrders:1),group:o.limits?.sharedLimitGroup||null,groupLimit:o.limits?.sharedGroupMax??null});
       }
      }
    }
    candidates.sort((a,b)=>a.base-b.base||a.id.localeCompare(b.id));
    // Equivalent unrestricted coupons can be represented by their cheapest code.
    const unique=new Map(),limited=[];
    for(const c of candidates){if(c.maxUses<r.maxOrders||c.group||c.offer.versionExclusive){limited.push(c);continue;}const key=JSON.stringify([c.offer.brand,c.items,c.snackGroups,c.variant.pizzaSlots,c.variant.distinctPizzaSlots,drinkCount(c.variant.beverages,r.drinkPreference),c.ordering.status]);if(!unique.has(key))unique.set(key,c);}
    let reduced=[...unique.values(),...limited].sort((a,b)=>a.base-b.base||a.id.localeCompare(b.id));
    if(!r.exact&&r.allowExtras!==false){
      const requested=Object.keys(r.demand).filter(k=>r.demand[k]>0),kept=[];
      const flavorKey=c=>(r.pizzaPreference?.minKinds||0)>0?JSON.stringify(c.variant.pizzaSlots||[]):'';
      for(const b of reduced){
        // A strictly cheaper unrestricted order with at least the same requested
        // contents replaces B in any plan without changing order count or fees.
        const dominated=!b.offer.versionExclusive&&kept.some(a=>!a.offer.versionExclusive&&a.base<b.base&&a.offer.brand===b.offer.brand&&a.maxUses>=r.maxOrders&&!a.group&&a.ordering.status===b.ordering.status&&flavorKey(a)===flavorKey(b)&&requested.every(k=>(a.items[k]||0)>=Math.min(r.demand[k],b.items[k]||0))&&(!(r.snackGoal?.minTypes>0)||b.snackGroups.every(g=>a.snackGroups.includes(g))));
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
    const {candidates:cs,excluded,optionsComplete}=chooseCandidates(dataset,r,now,config.bannedSources||[]);
    const sourceKey=o=>(o.offerId||o.id)+'/'+(o.sourceVersionKey||'');
    if(r.snackGoal||r.pizzaPreference)cs.sort((a,b)=>{
      const utility=c=>sum(Object.entries(r.demand).filter(([,n])=>n>0).map(([k,n])=>Math.min(n,c.items[k]||0)/n*(k==='snackPortions'?.35:1)))/(c.base||1);
      return utility(b)-utility(a)||a.id.localeCompare(b.id);
    });
    const maxStates=config.maxStates??1800000,timeLimit=config.timeLimitMs??1800;
    let states=0,complete=true,minAny=null,minWithin=null,closest=null,bestSingle=null,bestFew=null,bestMixed=null;
    const leaders=[],oneBrand=[],fewOrders=[],mixedBrand=[];
    const demandKeys=Object.keys(r.demand).filter(k=>r.demand[k]>0);
    const mixedPossible=r.cross&&r.brands.length>1&&r.maxOrders>1&&new Set(cs.filter(c=>!demandKeys.every(k=>(c.items[k]||0)>=r.demand[k])).map(c=>c.offer.brand)).size>1;
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
    function versionCompatible(selected,c){return selected.every(a=>a.offer.id!==c.offer.id||a.offer.sourceVersionKey===c.offer.sourceVersionKey);}
    function keep(arr,p,cmp=compare){if(arr.some(x=>x.id===p.id))return;arr.push(p);arr.sort(cmp);if(arr.length>12)arr.length=12;}
    function makePlan(selected,counts){
      const flavorPlan=assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors);
      const brandSlots={};
      const orders=selected.map((c,index)=>{
        const slot=brandSlots[c.offer.brand]||0;brandSlots[c.offer.brand]=slot+1;
        const fee=r.channel==='delivery'?(r.fees?.[c.offer.brand]?.[slot]??null):0;
        const service=r.channel==='delivery'?(r.serviceFees?.[c.offer.brand]?.[slot]??0):0;
        return {index,feeSlot:slot,brand:c.offer.brand,offerId:c.offer.id,variantId:c.variant.id,code:c.offer.code,kind:c.offer.kind||'coupon',menuSnapshot:c.offer.menuSnapshot||null,title:c.offer.title,items:c.variant.items,base:c.base,mealBase:c.variant.priceMinor,surchargeMinor:c.variant.surchargeMinor||0,beverages:c.variant.beverages||[],optionChoices:c.variant.optionChoices||[],orderMethod:c.ordering.method||r.orderMethod||'official_web',paymentMethod:c.ordering.paymentMethod||r.paymentMethod||'any',orderingStatus:c.ordering.status,orderingNote:c.ordering.reason,fee,service,total:fee===null?null:c.base+fee+service,sourceUrl:c.offer.provenance?.sourceUrl,officialUrl:c.offer.officialUrl,verification:c.offer.verification||null,couponLookup:c.offer.couponLookup||null,officialMeal:c.offer.sourceMetadata?.officialMeal||null,validity:c.offer.validity,confidence:sourceConfidence(c.offer,now),sourceVersionKey:c.offer.sourceVersionKey||null,sourceConflict:!!c.offer.sourceConflict,conflictReason:c.offer.conflictReason||null,sourceFetchedAt:c.offer.provenance?.fetchedAt,sourcePublisher:c.offer.provenance?.sourcePublisher,sourceText:c.offer.rawText,sourceUpdatedAt:c.offer.sourceMetadata?.sourceUpdatedAt,conditions:c.offer.conditions||[],eligibility:c.offer.eligibility||{},limits:c.offer.limits||{},choice:c.variant.choice||null,pizzaChoices:flavorPlan.assignments.filter(a=>a.order===index),mainDescription:c.variant.mainDescription||null};
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
      return {id:selected.map(c=>c.id).sort().join('|'),orders,coverage,supplied:{...counts},extras,extraCount:sum(Object.values(extras)),snackTypes,pizzaFlavors:flavorPlan.distinct,brandCount:new Set(orders.map(o=>o.brand)).size,knownSubtotal,totalCost:total,unknownCosts:unknown,eligibilityStatus:dataset.mode==='demo'?'demo':orders.every(o=>o.confidence.level==='official')?'official_configuration_checked':(r.estimate?'needs_confirmation':'eligible_in_scope'),searchComplete:complete};
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
          if(p.brandCount>1&&(!bestMixed||compare(p,bestMixed)<0))bestMixed=p;
          if(!bestFew||p.orders.length<bestFew.orders.length||p.orders.length===bestFew.orders.length&&compare(p,bestFew)<0)bestFew=p;
          if(r.budgetMinor===null||p.totalCost!==null&&p.totalCost<=r.budgetMinor){
            keep(leaders,p);if(p.brandCount===1)keep(oneBrand,p);else keep(mixedBrand,p);
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
        const canImproveMixed=mixedPossible&&(!bestMixed||lower<=(bestMixed.totalCost??Infinity)+.0001)&&minOrders<=r.maxOrders;
        if(!canImproveMain&&(config.priceReferenceOnly||!canImproveSingle&&!canImproveFew&&!canImproveMixed))return;
      }
      for(let i=from;i<cs.length;i++){
        const c=cs[i],o=c.offer;
        if((uses[o.id]||0)>=c.maxUses||!versionCompatible(selected,c))continue;
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
    {
      // Start from current coupon candidates that cover each requested food.
      // A rare main must get a feasible starting point before the timed search
      // spends its budget enumerating many cheap side/drink combinations.
      const seeds=[null],seedIds=new Set();
      for(const k of demandKeys){
        const ranked=cs.filter(c=>c.maxUses>=1&&(!c.group||c.groupLimit===null||c.groupLimit>=1)&&c.items[k]>0&&(!r.exact||demandKeys.every(id=>(c.items[id]||0)<=r.demand[id]))).sort((a,b)=>a.base/Math.min(r.demand[k],a.items[k])-b.base/Math.min(r.demand[k],b.items[k])||a.id.localeCompare(b.id));
        for(const c of ranked.slice(0,2))if(!seedIds.has(c.id)){seedIds.add(c.id);seeds.push(c);}
      }
      for(const seed of seeds)for(const factor of [0.5,1,2]){
        const selected=seed?[seed]:[],counts=seed?{...seed.items}:{},uses=seed?{[seed.offer.id]:1}:{},groups=seed?.group?{[seed.group]:1}:{};
        if(seed&&demandKeys.every(k=>(counts[k]||0)>=r.demand[k])&&seed.snackGroups.length>=(r.snackGoal?.minTypes||0)&&assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors).complete){visit(cs.length,selected,counts,uses,groups);continue;}
        while(selected.length<r.maxOrders){
          const currentGroups=new Set(selected.flatMap(c=>c.snackGroups));let best=null,score=0;
          for(const c of cs){if(!versionCompatible(selected,c)||(uses[c.offer.id]||0)>=c.maxUses||c.group&&c.groupLimit!==null&&(groups[c.group]||0)>=c.groupLimit||!r.cross&&selected.length&&selected[0].offer.brand!==c.offer.brand)continue;
            if(r.exact&&demandKeys.some(k=>(counts[k]||0)+(c.items[k]||0)>r.demand[k]))continue;
            const gain=sum(demandKeys.map(k=>Math.min(Math.max(0,r.demand[k]-(counts[k]||0)),c.items[k]||0)/r.demand[k]*(['paperChicken','pasta','burgerMain','chicken','pizza6','pizza9','pizza13','burgerSmall','chickenPorridge','omeletFlatbread','chickenFlatbread'].includes(k)?8:1)))+Math.max(0,(r.snackGoal?.minTypes||0)-currentGroups.size)*c.snackGroups.filter(g=>!currentGroups.has(g)).length*.2;
            const value=gain/Math.pow(Math.max(c.base,1),factor);if(value>score){score=value;best=c;}
          }
          if(!best||!score)break;selected.push(best);uses[best.offer.id]=(uses[best.offer.id]||0)+1;if(best.group)groups[best.group]=(groups[best.group]||0)+1;for(const [k,n] of Object.entries(best.items))counts[k]=(counts[k]||0)+n;
          if(demandKeys.every(k=>(counts[k]||0)>=r.demand[k])&&new Set(selected.flatMap(c=>c.snackGroups)).size>=(r.snackGoal?.minTypes||0)&&assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors).complete){visit(cs.length,selected,counts,uses,groups);break;}
        }
      }
    }
    visit(0,[],{}, {},{});complete=complete&&optionsComplete;
    // A bounded fallback explores affordable partial meals even when a missing
    // item makes the complete-cover lower bound reject the entire search tree.
    const partials=[];
    if(!leaders.length&&config.collectPartials!==false&&config.collectAlternatives!==false){
      const partialStart=Date.now(),limit=config.partialTimeLimitMs??350;
      const mains=new Set(['individual','burgerMain','burger','paperChicken','pasta','chicken','pizza6','pizza9','pizza13','burgerSmall','chickenPorridge','omeletFlatbread','chickenFlatbread']);
      const rank=(a,b)=>a.mainDeficit-b.mainDeficit||a.deficit-b.deficit||(a.totalCost??Infinity)-(b.totalCost??Infinity)||a.knownSubtotal-b.knownSubtotal||a.selected.length-b.selected.length||a.key.localeCompare(b.key);
      let beam=[{selected:[],counts:{},uses:{},groups:{},from:0,knownSubtotal:0,totalCost:0}],examined=0;
      const retained=new Map();
      searchPartial: for(let depth=0;depth<r.maxOrders;depth++){
        const next=[];
        for(const s of beam)for(let i=s.from;i<cs.length;i++){
          if(++examined>30000||Date.now()-partialStart>limit)break searchPartial;
          const c=cs[i],o=c.offer;
          if(!versionCompatible(s.selected,c)||(s.uses[o.id]||0)>=c.maxUses||c.group&&c.groupLimit!==null&&(s.groups[c.group]||0)>=c.groupLimit||!r.cross&&s.selected.length&&s.selected[0].offer.brand!==o.brand)continue;
          const counts={...s.counts};for(const [k,n] of Object.entries(c.items))counts[k]=(counts[k]||0)+n;
          if(r.exact&&demandKeys.some(k=>counts[k]>r.demand[k]))continue;
          const slot=s.selected.filter(a=>a.offer.brand===o.brand).length;
          const fee=r.channel==='delivery'?(r.fees?.[o.brand]?.[slot]??null):0;
          const service=r.channel==='delivery'?(r.serviceFees?.[o.brand]?.[slot]??0):0;
          const totalCost=s.totalCost===null||fee===null?null:s.totalCost+c.base+fee+service;
          if(r.budgetMinor!==null&&(totalCost===null||totalCost>r.budgetMinor))continue;
          const selected=[...s.selected,c],snacks=new Set(selected.flatMap(a=>a.snackGroups));
          const flavors=assignFlavors(selected,r.pizzaPreference,dataset.pizzaFlavors);
          const missing=demandKeys.filter(k=>(counts[k]||0)<r.demand[k]).map(id=>({id,quantity:r.demand[id]-(counts[id]||0)}));
          const snackShortfall=Math.max(0,(r.snackGoal?.minTypes||0)-snacks.size),flavorShortfall=Math.max(0,(r.pizzaPreference?.minKinds||0)-flavors.distinct);
          const parts=demandKeys.length+Number((r.snackGoal?.minTypes||0)>0)+Number((r.pizzaPreference?.minKinds||0)>0);
          const deficit=sum(missing.map(m=>m.quantity/r.demand[m.id]))+(snackShortfall/(r.snackGoal?.minTypes||1))+(flavorShortfall/(r.pizzaPreference?.minKinds||1));
          const mainDeficit=sum(missing.filter(m=>mains.has(m.id)).map(m=>m.quantity/r.demand[m.id]));
          if(deficit>=parts||s.deficit!==undefined&&deficit>=s.deficit-1e-9)continue;
          const key=selected.map(a=>a.id).sort().join('|');
          const item={selected,counts,uses:{...s.uses,[o.id]:(s.uses[o.id]||0)+1},groups:{...s.groups,...(c.group?{[c.group]:(s.groups[c.group]||0)+1}:{})},from:i,knownSubtotal:s.knownSubtotal+c.base,totalCost,key,mainDeficit,deficit,missing,snackShortfall,flavorShortfall,coveragePercent:Math.floor((1-deficit/parts)*100)};
          if(!missing.length&&!snackShortfall&&!flavorShortfall&&flavors.complete){
            const p=makePlan(selected,counts);keep(leaders,p);if(p.brandCount===1)keep(oneBrand,p);else keep(mixedBrand,p);keep(fewOrders,p,(a,b)=>a.orders.length-b.orders.length||compare(a,b));
            if(!minAny||compare(p,minAny)<0)minAny=p;
          }else{
            retained.set(key,item);
            // Keep only promising states, without claiming a globally closest meal.
            if(retained.size>100){const best=[...retained.values()].sort(rank).slice(0,12);retained.clear();for(const p of best)retained.set(p.key,p);}
          }
          next.push(item);
        }
        beam=next.sort(rank).filter((s,i,all)=>!i||s.key!==all[i-1].key).slice(0,36);
        if(!beam.length)break;
      }
      if(!leaders.length){
        const seen=new Set();
        for(const s of [...retained.values()].sort(rank)){
          const key=s.selected.map(c=>sourceKey(c.offer)).sort().join('|');if(seen.has(key))continue;seen.add(key);
          partials.push({...makePlan(s.selected,s.counts),partial:true,label:'目前最接近的配置',missing:s.missing,snackShortfall:s.snackShortfall,flavorShortfall:s.flavorShortfall,coveragePercent:s.coveragePercent,searchComplete:false});
          if(partials.length===3)break;
        }
      }
    }
    if(r.budgetMinor!==null&&minAny?.totalCost===null){keep(leaders,minAny);}
    const alternatives=[];
    const mealKey=p=>p.orders.map(o=>o.brand+'/'+o.offerId+'/'+(o.sourceVersionKey||'')).sort().join('|');
    function add(p,label){if(p&&alternatives.length<3&&!alternatives.some(x=>mealKey(x)===mealKey(p))){alternatives.push({...p,label,searchComplete:p.searchComplete&&complete});if(!minAny||compare(p,minAny)<0)minAny=p;}}
    add(leaders[0],complete?'金額最低':'目前較低金額');add(oneBrand[0],'只買一家');add(mixedBrand[0],'兩家混搭');add(fewOrders[0],'訂單較少');
    for(const p of leaders)if(alternatives.length<3)add(p,'其他組合');
    // Minimum-price pruning may collapse equivalent or dominated coupons. Search
    // a few exclusions separately so real alternative coupons can still appear.
    if(alternatives.length&&alternatives.length<3&&config.collectAlternatives!==false){
      const queue=[...new Set(alternatives[0].orders.map(sourceKey))].map(id=>[id]);
      for(let attempt=0;attempt<3&&queue.length;attempt++){
        const banned=queue.shift();
        const other=solve(dataset,r,{...config,bannedSources:[...(config.bannedSources||[]),...banned],collectAlternatives:false,timeLimitMs:Math.min(timeLimit,600),maxStates:Math.min(maxStates,150000)});
        states+=other.states;
        for(const p of other.plans)if(alternatives.length<3)add(p,'不同優惠組合');
        if(alternatives.length>=3)break;
        if(other.plans[0])queue.push([...new Set([...banned,...other.plans[0].orders.map(sourceKey)])]);
      }
    }
    alternatives.sort(compare);
    const missing=closest?Object.entries(r.demand).filter(([k,n])=>(closest.counts[k]||0)<n).map(([k,n])=>({id:k,quantity:n-(closest.counts[k]||0)})):Object.entries(r.demand).filter(([,n])=>n>0).map(([id,quantity])=>({id,quantity}));
    return {plans:alternatives,partials,more:leaders.slice(0,12),minimumIgnoringBudget:minAny?{...minAny,searchComplete:complete}:null,missing:partials[0]?.missing||missing,searchComplete:complete,states,elapsedMs:Date.now()-start,candidateCount:cs.length,excluded,orderLimit:r.maxOrders,mode:dataset.mode};
  }
  function nextTimeReference(dataset,r,config){
    const now=config.now??Date.now(),at=Date.parse(r.at),day=86400000,offset=8*3600000;
    const midnight=Math.floor((at+offset)/day)*day-offset,points=new Set();
    // Only propose recorded window starts in the next seven days. Every quote
    // still goes through the normal date, channel, eligibility and order checks.
    for(const o of planningOffers(dataset,r,now))for(const w of o.validity?.validWindows||[]){
      for(let d=0;d<=7;d++){
        const t=midnight+d*day+(w.startMinute||0)*60000;
        if(t>at&&t<=at+7*day)points.add(t);
      }
    }
    const times=[...points].sort((a,b)=>a-b),channels=[r.channel];
    if(r.channel!=='takeaway'&&(!r.orderMethod||r.orderMethod==='auto'||ORDER_METHODS[r.orderMethod]?.channels.includes('takeaway')))channels.push('takeaway');
    const keys=Object.keys(r.demand).filter(k=>r.demand[k]>0),seen=new Set();let attempts=0;
    for(const channel of channels)for(const t of times){
      const future={...r,at:new Date(t).toISOString(),channel,budgetMinor:null};
      const candidates=chooseCandidates(dataset,future,now).candidates;
      if(!keys.every(k=>candidates.some(c=>c.items[k]>0)))continue;
      const signature=JSON.stringify([channel,candidates.map(c=>[c.id,c.base,c.maxUses])]);
      if(seen.has(signature))continue;seen.add(signature);
      if(attempts++>=4)return null;
      const x=solve(dataset,future,{...config,priceReferenceOnly:true,collectAlternatives:false,collectPartials:false,maxStates:config.referenceMaxStates??600000,timeLimitMs:config.referenceTimeLimitMs??1200});
      const p=x.minimumIgnoringBudget;if(!p)continue;
      return {at:future.at,channel,originalAt:r.at,originalChannel:r.channel,plan:{...p,effectiveRequest:{...r,at:future.at,channel},budgetGapMinor:r.budgetMinor===null||p.totalCost===null?null:Math.max(0,p.totalCost-r.budgetMinor)}};
    }
    return null;
  }
  function recommend(dataset,request,config={}){
    extendItems(dataset);const started=Date.now(),r=validateRequest(request),result=solve(dataset,r,config);
    // Complete plans already satisfy the requested meal. Do not pad this list
    // with a different meal merely to reach a recommendation count.
    if(result.plans.length)return {...result,suggestions:[],unpricedAlternative:null,elapsedMs:Date.now()-started};
    // Reserve an independent search for the exact original meal with only the
    // budget removed. Near matches must never become its required-price quote.
    if(result.candidateCount&&(!result.minimumIgnoringBudget||!result.searchComplete)){
      const reference=solve(dataset,{...r,budgetMinor:null},{...config,priceReferenceOnly:true,collectAlternatives:false,collectPartials:false,maxStates:config.referenceMaxStates??600000,timeLimitMs:config.referenceTimeLimitMs??1200});
      result.states+=reference.states;
      const p=reference.minimumIgnoringBudget;
      if(p&&(!result.minimumIgnoringBudget||p.totalCost!==null&&(result.minimumIgnoringBudget.totalCost===null||p.totalCost<result.minimumIgnoringBudget.totalCost)))result.minimumIgnoringBudget=p;
    }
    let fullQuote=result.minimumIgnoringBudget;
    // A quote requiring more orders is a separately labelled proposal. Do not
    // silently change the user's order cap, meal, eligibility or payment rules.
    if(!fullQuote&&result.candidateCount&&r.maxOrders<12){
      const expanded={...r,budgetMinor:null,maxOrders:12};
      const reference=solve(dataset,expanded,{...config,priceReferenceOnly:true,collectAlternatives:false,collectPartials:false,maxStates:config.referenceMaxStates??600000,timeLimitMs:config.referenceTimeLimitMs??1200});
      result.states+=reference.states;
      if(reference.minimumIgnoringBudget){
        const p=reference.minimumIgnoringBudget;
        if(p.orders.length<=r.maxOrders){result.minimumIgnoringBudget=p;fullQuote=p;}
        else fullQuote={...p,effectiveRequest:{...r,maxOrders:p.orders.length},requiredMaxOrders:p.orders.length};
      }
    }
    if(fullQuote)fullQuote={...fullQuote,priceReference:true,overBudget:r.budgetMinor!==null&&fullQuote.totalCost!==null&&fullQuote.totalCost>r.budgetMinor,budgetGapMinor:r.budgetMinor===null||fullQuote.totalCost===null?null:Math.max(0,fullQuote.totalCost-r.budgetMinor)};
    if(fullQuote&&!fullQuote.requiredMaxOrders&&(r.budgetMinor===null||fullQuote.totalCost!==null&&fullQuote.totalCost<=r.budgetMinor)){
      return {...result,plans:[fullQuote],fullQuote,suggestions:[],unpricedAlternative:null,elapsedMs:Date.now()-started};
    }
    result.fullQuote=fullQuote||null;
    if(!fullQuote){
      const candidates=chooseCandidates(dataset,r,config.now??Date.now()).candidates;
      const missingItems=Object.entries(r.demand).filter(([id,n])=>n>0&&!candidates.some(c=>c.items[id]>0)).map(([id,quantity])=>({id,quantity}));
      result.quoteUnavailable={reason:missingItems.length?'missing_items':!result.searchComplete?'search_limit':'conditions',missingItems};
      if(missingItems.length&&r.channel!=='takeaway'&&(!r.orderMethod||r.orderMethod==='auto'||ORDER_METHODS[r.orderMethod]?.channels.includes('takeaway'))){
        const takeaway={...r,channel:'takeaway',budgetMinor:null};
        const available=chooseCandidates(dataset,takeaway,config.now??Date.now()).candidates;
        const channelMismatchItems=missingItems.filter(m=>available.some(c=>c.items[m.id]>0));
        if(channelMismatchItems.length){
          result.quoteUnavailable.channelMismatchItems=channelMismatchItems;
          const reference=solve(dataset,takeaway,{...config,priceReferenceOnly:true,collectAlternatives:false,collectPartials:false,maxStates:config.referenceMaxStates??600000,timeLimitMs:config.referenceTimeLimitMs??1200});
          result.states+=reference.states;
          const p=reference.minimumIgnoringBudget;
          if(p)result.channelReference={channel:'takeaway',originalChannel:r.channel,plan:{...p,effectiveRequest:{...r,channel:'takeaway'},budgetGapMinor:r.budgetMinor===null||p.totalCost===null?null:Math.max(0,p.totalCost-r.budgetMinor)}};
        }
      }
      if(missingItems.length&&!result.channelReference&&result.excluded.some(o=>o.reasons.includes('不在有效時段'))){
        const reference=nextTimeReference(dataset,r,config);
        if(reference)result.timeReference=reference;
      }
    }
    const suggestions=[],tried=new Set(),mainIds=['individual','burgerMain','burger','paperChicken','pasta','chicken','pizza6','pizza9','pizza13','burgerSmall','chickenPorridge','omeletFlatbread','chickenFlatbread'];
    const mainSet=new Set(mainIds),meta=(root.Planner||(typeof require==='function'?require('./planner.js'):{})).SNACK_META||{};
    const noSnacks=Object.fromEntries(Object.entries(r.demand).filter(([k])=>k!=='snackPortions'&&!meta[k]));
    const noSnackGoal={minTypes:0,servings:0};
    const deadline=Date.now()+(config.suggestionTimeLimitMs??2200),maxSuggestions=3;
    const mealKey=p=>p.orders.map(o=>o.brand+'/'+o.offerId+'/'+(o.sourceVersionKey||'')+'/'+o.variantId).sort().join('|');
    const seen=new Set(result.plans.map(mealKey));
    let attempts=0;
    function describe(q){
      const notes=[];
      for(const id of new Set([...Object.keys(r.demand),...Object.keys(q.demand)])){
        const before=r.demand[id]||0,after=q.demand[id]||0;
        if(before!==after)notes.push(`${ITEMS[id].name}：${before} → ${after} ${ITEMS[id].unit}`);
      }
      if((r.snackGoal?.minTypes||0)!==(q.snackGoal?.minTypes||0))notes.push(`點心種類：至少 ${r.snackGoal.minTypes} 類 → ${q.snackGoal?.minTypes?'至少 '+q.snackGoal.minTypes+' 類':'不另限制'}`);
      if(JSON.stringify(r.pizzaPreference)!==JSON.stringify(q.pizzaPreference)||r.pastaPreference!==q.pastaPreference)notes.push('披薩／義大利麵口味改為不限');
      if(r.drinkPreference!==q.drinkPreference)notes.push('飲料種類改為不限，杯數照需求保留');
      if(r.maxOrders!==q.maxOrders)notes.push(`可分開購買的訂單上限：${r.maxOrders} → ${q.maxOrders} 筆`);
      if(JSON.stringify(r.brands)!==JSON.stringify(q.brands)||r.cross!==q.cross)notes.push('改為肯德基與必勝客一起比較，可跨品牌購買');
      if(q.servingNote)notes.push(q.servingNote);
      return notes;
    }
    function attempt(q,label){
      if(suggestions.length>=maxSuggestions||attempts>=9||Date.now()>=deadline)return;
      if(!Object.values(q.demand).some(n=>n>0)||Object.values(q.demand).some(n=>!Number.isInteger(n)||n<0||n>60))return;
      const key=JSON.stringify([q.demand,q.snackGoal,q.pizzaPreference,q.pastaPreference,q.drinkPreference,q.maxOrders,q.brands,q.cross,q.budgetMinor]);
      if(tried.has(key))return;tried.add(key);attempts++;
      const x=solve(dataset,q,{...config,collectAlternatives:false,timeLimitMs:Math.min(350,Math.max(1,deadline-Date.now())),maxStates:Math.min(config.maxStates??150000,100000)});
      result.states+=x.states;
      const p=x.plans[0];if(!p||seen.has(mealKey(p)))return;
      // Rescue searches never change validity, membership, payment, channel,
      // excluded ingredients, or prices. Changed meal preferences are explicit.
      seen.add(mealKey(p));
      const originalCoverage=Object.entries(r.demand).filter(([,n])=>n>0).map(([id,need])=>({id,need,got:p.supplied[id]||0}));
      const distance=sum(originalCoverage.map(c=>Math.max(0,c.need-c.got)/c.need*(mainSet.has(c.id)?2:1)));
      suggestions.push({...p,label,substitution:true,effectiveRequest:q,adjustments:describe(q),originalCoverage,requestDistance:distance,overBudget:r.budgetMinor!==null&&p.totalCost!==null&&p.totalCost>r.budgetMinor});
    }
    // Relax one preference at a time, keeping every requested food and count.
    if(r.pizzaPreference&&(r.pizzaPreference.tag!=='any'||r.pizzaPreference.minKinds>0)||r.pastaPreference&&r.pastaPreference!=='any')attempt({...r,pizzaPreference:null,pastaPreference:'any'},'餐點份量不變・口味不限');
    if(r.drinkPreference&&r.drinkPreference!=='any')attempt({...r,drinkPreference:'any'},'餐點份量不變・飲料種類不限');
    // Small quantity changes retain every selected food, at least 75% of each
    // requested quantity, and the original snack variety and checkout rules.
    for(const ratio of [.9,.8,.75]){
      const demand=Object.fromEntries(Object.entries(r.demand).map(([id,n])=>[id,n>0?Math.max(1,Math.ceil(n*ratio)):0]));
      attempt({...r,demand,snackGoal:r.snackGoal?{...r.snackGoal,servings:demand.snackPortions||0}:undefined},'原餐點・份量略減');
    }
    if(!(config.allowMealReplacement===true||r.allowMealReplacement===true)){
      suggestions.sort((a,b)=>a.requestDistance-b.requestDistance||(a.totalCost??Infinity)-(b.totalCost??Infinity));
      const unpriced=!suggestions.length&&!result.partials.length&&!result.minimumIgnoringBudget&&!result.fullQuote;
      return {...result,suggestions,unpricedAlternative:unpriced?{items:{...r.demand},label:'原需求清單（未計價）',note:'保留你選的餐點，尚無可計價優惠；可至官方菜單確認單點價格。'}:null,elapsedMs:Date.now()-started};
    }
    const light={...r,demand:noSnacks,snackGoal:noSnackGoal};
    if(!result.plans.length){
      attempt(light,'主餐保留・減少點心');
      const flexible={...light,pizzaPreference:null,pastaPreference:'any',drinkPreference:'any'};
      attempt(flexible,'主餐保留・口味不限');
    }
    // Different main families are complete alternative meals for the same
    // headcount; their serving assumptions are shown alongside the quantities.
    const units={burgerMain:1,paperChicken:1,pasta:1,chicken:2,pizza9:.5,pizza13:.25,burgerSmall:1,chickenPorridge:1,omeletFlatbread:1,chickenFlatbread:1};
    const servingNotes={burgerSmall:'替代主餐按每人 1 個小脆雞堡估算',chickenPorridge:'替代主餐按每人 1 份脆雞粥估算',omeletFlatbread:'替代主餐按每人 1 份歐姆蛋燒餅估算',chickenFlatbread:'替代主餐按每人 1 份脆雞燒餅估算',burgerMain:'替代主餐按每人 1 個一般漢堡估算',paperChicken:'替代主餐按每人 1 份紙包雞估算',pasta:'替代主餐按每人 1 份義大利麵估算',chicken:'替代主餐按每人 2 塊原塊炸雞估算',pizza9:'替代主餐按小披薩切 6 片、每人 3 片估算',pizza13:'替代主餐按大披薩切 8 片、每人 2 片估算'};
    const families=Object.keys(units);
    const base={...light,pizzaPreference:null,pastaPreference:'any',drinkPreference:'any',maxOrders:r.maxOrders};
    const probe=chooseCandidates(dataset,{...base,demand:Object.fromEntries(families.map(id=>[id,1]))},config.now??Date.now()).candidates;
    const cost=id=>Math.min(...probe.filter(c=>c.items[id]>0).map(c=>c.base/(c.items[id]/units[id])));
    for(const id of families.sort((a,b)=>cost(a)-cost(b))){
      if(!Number.isFinite(cost(id)))continue;
      const demand=Object.fromEntries(Object.entries(noSnacks).filter(([k])=>!mainSet.has(k)));
      demand[id]=Math.ceil(r.people*units[id]);
      attempt({...base,demand,servingNote:servingNotes[id]},'換主餐・'+ITEMS[id].name);
    }
    if(!result.plans.length&&!suggestions.length){
      const flexible={...base,budgetMinor:null};
      attempt(flexible,'保留主餐・調整預算參考');
      for(const id of ['burgerMain','chicken','pizza9']){
        const demand=Object.fromEntries(Object.entries(noSnacks).filter(([k])=>!mainSet.has(k)));demand[id]=Math.ceil(r.people*units[id]);
        attempt({...flexible,demand,servingNote:servingNotes[id]},'替代主餐・預算參考');
      }
    }
    const unpriced=!result.plans.length&&!suggestions.length&&!result.minimumIgnoringBudget&&!result.fullQuote;
    return {...result,suggestions,unpricedAlternative:unpriced?{items:{...r.demand},label:'完整需求清單（未計價）',note:'這份清單保留原餐點需求，可向官方確認單點價格與供應。請與其他替代配置擇一參考，不直接相加。'}:null,elapsedMs:Date.now()-started};
  }
  const api={ITEMS,SNACKS,physicalIds,ORDER_METHODS,orderingCheck,extendItems,applyOptions,expandOptions,drinkMatch,drinkCount,buildDemand,validateRequest,isActive,couponTerms,planContents,mealIdentityIssue,contentSignature,verificationCheck,recommendationCheck,couponLookupCheck,sourceConfidence,planningOffers,catalogOffer,catalogChoice,chooseCandidates,assignFlavors,solve,recommend,taipeiDate};
  root.Feast=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
