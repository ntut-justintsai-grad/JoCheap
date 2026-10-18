(function(root){
  'use strict';
  const F=root.Feast||(typeof require==='function'?require('./engine.js'):null);
  const FAMILY={mixed:'披薩＋炸雞',pizza:'披薩共享',chicken:'炸雞共享',burger:'漢堡個人餐',wrapped:'紙包雞',pasta:'義大利麵'};
  const MAINS={pizza:{name:'披薩',emoji:'🍕'},chicken:{name:'炸雞',emoji:'🍗'},burger:{name:'漢堡',emoji:'🍔'},wrapped:{name:'紙包雞',emoji:'🥘'},pasta:{name:'義大利麵',emoji:'🍝'}};
  const MAIN_ITEMS={pizza:['pizza9','pizza13'],chicken:['chicken'],burger:['burgerMain'],wrapped:['paperChicken'],pasta:['pasta']};
  function mergeWindows(windows){
    const out=[];for(const w of windows.sort((a,b)=>a[0]-b[0])){const last=out[out.length-1];if(last&&w[0]<=last[1])last[1]=Math.max(last[1],w[1]);else out.push([...w]);}return out;
  }
  function dayWindows(validity,date){
    const windows=validity?.validWindows||[];if(!windows.length)return {windows:[[0,1440]],unknown:true};
    const out=[];let unknown=false;
    for(const w of windows){
      const start=w.startMinute??0,end=w.endMinute??1440;
      const at=Date.parse(date+'T00:00:00+08:00')+(start+(end-start)/2)*60000;
      if(end<=start||!Number.isFinite(at)||F.isActive({validity:{...validity,validWindows:[w]}},at)!==true)continue;
      out.push([start,end]);if(w.startMinute===undefined||w.endMinute===undefined)unknown=true;
    }
    return {windows:mergeWindows(out),unknown};
  }
  function intersectWindows(a,b){return mergeWindows(a.flatMap(x=>b.map(y=>[Math.max(x[0],y[0]),Math.min(x[1],y[1])]).filter(w=>w[0]<w[1])));}
  function formatWindows(windows){const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return windows.map(w=>time(w[0])+'–'+time(w[1])).join('、');}
  function planningContext(dataset,request,now=Date.now()){
    const r={estimate:true,dataScope:'all',allowUnknownOrdering:true,orderMethod:'auto',paymentMethod:'any',...request};
    const date=F.taipeiDate(Date.parse(r.at)),records=[],items=new Set();
    for(const o of F.planningOffers(dataset,r,now)){
      if(!r.brands.includes(o.brand)||!F.recommendationCheck(dataset,o,now,r).allowed||!F.orderingCheck(o,r).allowed||o.eligibility?.personalCoupon||o.eligibility?.memberRequired&&!r.member||o.requiresParent)continue;
      const hours=dayWindows(o.validity,date);if(!hours.windows.length)continue;
      for(const v of o.variants||[]){
        if(v.requiresParent||!(v.channels||[]).includes(r.channel)&&!(v.channels||[]).includes('unknown')||!Number.isSafeInteger(v.priceMinor))continue;
        const ids=new Set(Object.keys(v.items||{}).filter(k=>v.items[k]>0));
        for(const g of v.optionGroups||[])for(const option of g.options||[])for(const [k,n] of Object.entries(option.items||{}))if(n>0)ids.add(k);
        if(v.individualMainItems?.burger||v.individualMains&&v.items?.burger)ids.add('burgerMain');
        for(const k of ids)items.add(k);records.push({brand:o.brand,items:ids,...hours});
      }
    }
    const schedules=r.brands.map(brand=>{
      const rows=records.filter(o=>o.brand===brand),requested=Object.keys(r.demand||{}).filter(k=>r.demand[k]>0&&!['snackPortions','drinkServing','individual'].includes(k)&&rows.some(o=>o.items.has(k)));
      let windows=mergeWindows(rows.flatMap(o=>o.windows)),unknown=false;
      for(const id of requested){const matches=rows.filter(o=>o.items.has(id));windows=intersectWindows(windows,mergeWindows(matches.flatMap(o=>o.windows)));unknown=unknown||matches.some(o=>o.unknown);}
      if(!requested.length)unknown=rows.some(o=>o.unknown);
      return {brand,windows,unknown};
    });
    return {date,items:[...items],mains:Object.keys(MAIN_ITEMS).filter(k=>MAIN_ITEMS[k].some(id=>items.has(id))),snacks:Object.keys(SNACK_META).filter(k=>items.has(k)),schedules};
  }
  function planTimeWindows(plan,at){
    const date=F.taipeiDate(Date.parse(at));let windows=[[0,1440]],unknown=false;
    for(const o of plan.orders){const hours=dayWindows(o.validity,date);windows=intersectWindows(windows,hours.windows);unknown=unknown||hours.unknown;}
    return {windows,unknown};
  }
  function normalizeMains(p){
    if(p.mealMode==='snack')return [];
    const raw=p.mains??(p.family==='mixed'||!p.family?['pizza','chicken']:[p.family]);
    if(!Array.isArray(raw)||raw.some(k=>!MAINS[k]))throw Error('請選擇有效的主餐種類。');
    const mains=Object.keys(MAINS).filter(k=>raw.includes(k));
    if(!mains.length)throw Error('請至少選一種主餐；想混搭可以選好幾種。');
    return mains;
  }
  function validateMainDemand(built,demand){
    for(const main of built.mainAllocation)if(!Number.isInteger(demand[main.item])||demand[main.item]<1)throw Error('已選「'+main.name+'」至少需要 1 '+F.ITEMS[main.item].unit+'；不想吃時請取消主餐勾選。');
    return demand;
  }
  const RICHNESS={none:{name:'不另外要求',types:0,ratio:0},light:{name:'有一點',types:1,ratio:.5},normal:{name:'剛剛好',types:2,ratio:.75},rich:{name:'很豐富',types:3,ratio:1}};
  const SNACK_META={
    tart:{brand:'KFC',group:'蛋撻',portion:1},friesSmall:{brand:'KFC',group:'薯類',portion:1},friesLarge:{brand:'KFC',group:'薯類',portion:1},nuggets:{brand:'KFC',group:'雞肉小食',portion:4},qq:{brand:'KFC',group:'QQ 球',portion:4},hashBrown:{brand:'KFC',group:'薯類',portion:1},daifuku:{brand:'KFC',group:'冰淇淋甜點',portion:1},seafoodPlatter:{brand:'KFC',group:'綜合拼盤',portion:1},fishRings:{brand:'KFC',group:'魚類小食',portion:1},
    potatoCoinsSmall:{brand:'PH',group:'薯類',portion:1},potatoCoinsLarge:{brand:'PH',group:'薯類',portion:1},chickenCartilageSmall:{brand:'PH',group:'雞肉小食',portion:1},germanSausage:{brand:'PH',group:'芝心腸',portion:3},spicySausage:{brand:'PH',group:'芝心腸',portion:3},codBites:{brand:'PH',group:'魚類小食',portion:5},chocolateQQ:{brand:'PH',group:'QQ 球',portion:5},mochiQQ:{brand:'PH',group:'QQ 球',portion:5},chipsMini:{brand:'PH',group:'薯類',portion:1}
  };
  Object.assign(SNACK_META,{qqPack:{brand:'KFC',group:'QQ 球',portion:1},shrimpPack:{brand:'KFC',group:'海鮮小食',portion:1},friesMedium:{brand:'KFC',group:'薯類',portion:1},chickenCartilageLarge:{brand:'PH',group:'雞肉小食',portion:1}});
  function buildSimple(p){
    const n=Number(p.people);if(!Number.isInteger(n)||n<1||n>30)throw Error('用餐人數請填 1～30 人。');
    const snack=p.mealMode==='snack',mains=normalizeMains(p),family=snack?'snack':mains.length===1?mains[0]:'mixed',rich=RICHNESS[p.richness||'normal'];if(!rich)throw Error('請選擇點心程度。');
    const demand={},pizza=mains.includes('pizza'),size=p.pizzaSize==='large'?'pizza13':'pizza9';
    const cuts=Number(size==='pizza9'?(p.smallCuts||6):(p.largeCuts||8));if(!Number.isInteger(cuts)||cuts<4||cuts>16)throw Error('每個披薩的試算切片數請填 4～16 片。');
    const appetite=p.appetite||'normal',light=appetite==='light',big=appetite==='big';
    const slicesPerPerson=size==='pizza9'?(light?2:big?4:3):(light?1:big?3:2);
    // Divide the diners across selected mains, then round whole purchasable units.
    // Canonical order makes the allocation stable regardless of click order.
    const mainAllocation=mains.map((id,i)=>{
      const people=Math.max(1,Math.floor(n/mains.length)+(i<n%mains.length?1:0));
      const item={pizza:size,chicken:'chicken',burger:'burgerMain',wrapped:'paperChicken',pasta:'pasta'}[id];
      const quantity=id==='pizza'?Math.ceil(people*slicesPerPerson/cuts):id==='chicken'?people*(light?1:big?3:2):people;
      demand[item]=quantity;return {id,item,name:MAINS[id].name,people,quantity};
    });
    const personal=mains.some(k=>['burger','wrapped','pasta'].includes(k));
    if(p.drinks??personal)demand.drinkServing=n;
    for(const id of p.fixedSnacks||[]){if(!SNACK_META[id])continue;demand[id]=Math.ceil(n*(F.SNACKS[id]?.perPerson??.5));}
    const snackGoal={minTypes:snack?(p.fixedSnacks?.length?Math.min(3,new Set(p.fixedSnacks.filter(id=>SNACK_META[id]).map(id=>SNACK_META[id].group)).size):rich.types?Math.min(rich.types,n):0):rich.types,servings:Math.ceil(n*rich.ratio)};
    if(snackGoal.servings)demand.snackPortions=snackGoal.servings;
    if(Object.values(demand).some(n=>!Number.isInteger(n)||n<0||n>60))throw Error('建議份量超過目前每項 60 的上限，請減少人數或調整食量。');
    const kinds=pizza?Number(p.flavorKinds??0):0;if(!Number.isInteger(kinds)||kinds<0||kinds>3)throw Error('披薩口味請選不指定或至少 1～3 種。');
    return {demand,snackGoal,mains,mainAllocation,allocationOverflow:mains.length>n,portion:{size,cuts,slicesPerPerson,people:mainAllocation.find(m=>m.id==='pizza')?.people||0,referenceOnly:true},pizzaPreference:pizza?{tag:p.flavorTag||'any',minKinds:kinds}:null,pastaPreference:mains.includes('pasta')?p.flavorTag||'any':null,family,mealMode:snack?'snack':'meal',people:n,richness:p.richness||'normal',maxOrders:personal?12:Math.max(6,Math.min(12,n))};
  }
  function number(s){
    if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);
    const digits={'零':0,'〇':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let total=0,current=0,lastUnit=1,tail='';
    for(const c of s){if(c in digits){current=digits[c];tail+=c;}else if(['十','百','千'].includes(c)){lastUnit={十:10,百:100,千:1000}[c];total+=(current||1)*lastUnit;current=0;tail='';}else return NaN;}
    if(lastUnit>=100&&tail.length===1&&current)current*=lastUnit/10;
    return total+current;
  }
  function interpret(text){
    const t=String(text).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'').trim();
    const patch={},recognized=[],warnings=[];const num='(?:[0-9]+(?:\\.[0-9]+)?|[零〇一二兩三四五六七八九十百千]+)';
    function take(regex,key,label,convert=number){const m=t.match(regex);if(m){patch[key]=convert(m[1]);recognized.push(label+'：'+m[1]);return m;}return null;}
    take(new RegExp('('+num+')\\s*(?:個人|位|人)(?![均份])'),'people','人數');
    const person=take(new RegExp('(?:每人|一人|人均|一個人)\\s*(?:預算|大約|約|最多|不超過|上限)?\\s*[$＄]?\\s*('+num+')'),'budget','每人預算');
    const total=take(new RegExp('(?:總預算|整團預算|總共|總額|預算)\\s*(?:大約|約|最多|不超過|上限|是|為)?\\s*[$＄]?\\s*('+num+')'),'totalBudget','整團預算');
    if(person){patch.budgetType='person';if(total&&patch.totalBudget!==patch.budget*(patch.people||0))warnings.push('同時寫了每人與整團預算，請核對要採用哪一個。');}
    else if(total){patch.budget=patch.totalBudget;patch.budgetType='total';}delete patch.totalBudget;
    if(person&&patch.people===1&&/一人\s*\d/.test(t)&&!/一個人|1\s*人|只有一人/.test(t)){delete patch.people;for(let i=recognized.length-1;i>=0;i--)if(recognized[i]==='人數：一')recognized.splice(i,1);warnings.push('「一人」可能指每人預算，請另外核對用餐人數。');}
    if(new RegExp(num+'\\s*[~～到至-]\\s*'+num+'\\s*(?:人|位)').test(t)){delete patch.people;warnings.push('人數是範圍，請選定實際用餐人數。');}
    if(/不加點心|不要點心|不用點心|不需要點心/.test(t)){patch.richness='none';patch.fixedSnacks=[];recognized.push('不另外要求點心');}
    else if(/很豐富|超豐富|豐盛|很多點心/.test(t)){patch.richness='rich';recognized.push('點心：很豐富');}
    else if(/剛剛好|適量點心|豐富一點|豐富點/.test(t)){patch.richness='normal';recognized.push('點心：剛剛好');}
    else if(/有一點|一點點心|少量點心|點心.{0,5}(?:不要太多|少一點)/.test(t)){patch.richness='light';recognized.push('點心：有一點');}
    const families=[];
    for(const [id,names] of Object.entries({pizza:'披薩|比薩|批薩|批撒|pizza',chicken:'炸雞|炸機|脆雞',burger:'漢堡',wrapped:'紙包雞',pasta:'義大利麵|義麵|意大利麵|筆管麵'})){
      const negative=new RegExp('(?:不要|不吃|不用|不想吃|不選|不點)\\s*(?:'+names+')','ig');
      if(negative.test(t))warnings.push('未要求「'+MAINS[id].name+'」，但優惠附帶餐點仍可能包含；尚未套用完全排除。');
      if(new RegExp(names,'i').test(t.replace(negative,'')))families.push(id);
    }
    if(families.length){patch.mains=families;patch.family=families.length===1?families[0]:'mixed';recognized.push('主餐混搭：'+families.map(id=>MAINS[id].name).join('＋'));}
    if(/下午茶|只(?:想|要)?吃(?:點心|小點)|不(?:要|用|吃)主餐/.test(t)){patch.mealMode='snack';patch.mains=[];patch.fixedSnacks=[];recognized.push('下午茶／點心');}
    else if(families.length)patch.mealMode='meal';
    const negSea=/不(?:要|吃|想吃)海鮮/.test(t);if(/海鮮/.test(t)&&!negSea){patch.flavorTag='seafood';recognized.push('偏好海鮮口味');}else if(/肉類|肉多|肉食/.test(t)){patch.flavorTag='meat';recognized.push('偏好肉類口味');}
    const kinds=t.match(new RegExp('('+num+')\\s*種(?:不同)?口味'));if(kinds){patch.flavorKinds=number(kinds[1]);recognized.push('至少 '+patch.flavorKinds+' 種披薩口味');}
    if(/大披薩|大比薩|大批薩|13\s*(?:吋|寸)/.test(t))patch.pizzaSize='large';else if(/小披薩|小比薩|9\s*(?:吋|寸)/.test(t))patch.pizzaSize='small';
    if(/外送/.test(t)){patch.channel='delivery';recognized.push('官方外送，費用另填');}else if(/外帶|自取/.test(t)){patch.channel='takeaway';recognized.push('外帶');}
    if(/不(?:要|用|加)飲料/.test(t))patch.drinks=false;else if(/飲料/.test(t))patch.drinks=true;
    for(const [pattern,id,name] of [[/無糖(?:綠茶|紅茶|茶)/,'unsweetened','無糖茶'],[/冰奶茶/,'coldMilkTea','冰奶茶'],[/熱奶茶/,'hotMilkTea','熱奶茶'],[/可樂/,'cola','可樂'],[/玉米濃湯/,'soup','玉米濃湯']])if(pattern.test(t)&&!/(?:不要|不喝|不吃).{0,3}(?:奶茶|茶|可樂|濃湯)/.test(t)){patch.drinkPreference=id;patch.drinks=true;recognized.push('每人飲料／湯：'+name);break;}
    const methods=[[/APP|雙饗卡/i,'pk_app','PK 雙饗卡 APP'],[/官網|官方網站/,'official_web','官方網站'],[/臨櫃|櫃檯/,'counter','臨櫃'],[/自助(?:點餐機|機)/,'kiosk','自助點餐機'],[/電話訂餐/,'phone','電話訂餐']].filter(([pattern])=>pattern.test(t));
    if(methods.length===1){patch.orderMethod=methods[0][1];recognized.push('下單方式：'+methods[0][2]);}else if(methods.length>1)warnings.push('寫到多種下單方式，請在欄位選定本次使用的方式。');
    if(/內用/.test(t)){patch.channel='dinein';recognized.push('內用');}
    if(/線上(?:付款|結帳)/.test(t)){patch.paymentMethod='online';recognized.push('線上付款');}else if(/到店付款|取餐(?:時)?付款/.test(t)){patch.paymentMethod='in_store';recognized.push('取餐時付款');}
    if(/肯德基|KFC/i.test(t)&&!/必勝客|pizza\s*hut/i.test(t))patch.brandScope='KFC';else if(/必勝客|pizza\s*hut/i.test(t)&&!/肯德基|KFC/i.test(t))patch.brandScope='PH';
    if(/很餓|吃很飽|食量大/.test(t))patch.appetite='big';else if(/小食量|吃少|輕食/.test(t))patch.appetite='light';
    const explicit={};
    for(const [id,unit,name] of [['chicken','塊','(?:原塊炸雞|炸雞|咔啦脆雞)'],['burgerMain','(?:個|份)','漢堡'],['tart','(?:顆|個)','(?:原味)?蛋撻'],['nuggets','塊','(?:上校)?雞塊'],['paperChicken','份','(?:香草)?紙包雞'],['pasta','份','(?:義大利麵|義麵|筆管麵)'],['pizza13','個','(?:13吋)?大(?:披薩|比薩|批薩|批撒)'],['pizza9','個','(?:9吋)?小(?:披薩|比薩|批薩|批撒)']]){
      const m=t.match(new RegExp('('+num+')\\s*'+unit+'\\s*'+name))||t.match(new RegExp(name+'\\s*(?:要|[:：])?\\s*('+num+')\\s*'+unit));if(m){explicit[id]=number(m[1]);recognized.push(F.ITEMS[id].name+'：'+m[1]+F.ITEMS[id].unit);}
    }
    if(Object.keys(explicit).length)patch.explicitDemand=explicit;
    if(patch.mealMode==='snack'){
      for(const [id,pattern] of [['tart',/蛋撻|蛋塔/],['friesSmall',/薯條/],['nuggets',/雞塊/],['qq',/QQ球|QQ 球/i],['hashBrown',/薯餅/],['daifuku',/大福/]])if(pattern.test(t)&&!new RegExp('不要'+pattern.source,'i').test(t))patch.fixedSnacks.push(id);
      if(patch.fixedSnacks.length)patch.richness='none';
    }
    if(/只要|剛好|不能多|不要多/.test(t))warnings.push('已辨識的餐點數量會當成最低需求；尚未套用「只能這些／不能多」的限制。');
    if(/不要辣|不吃辣|不要鳳梨|不吃牛|不吃豬|過敏|全素|奶素|蛋奶素|清真|素食/.test(t)||/無糖/.test(t)&&patch.drinkPreference!=='unsweetened'||negSea)warnings.push('有食材、辣度或飲食限制尚無法自動驗證，這些內容不會被當成已符合。請逐項核對官方資訊。');
    if(patch.people!==undefined&&(!Number.isInteger(patch.people)||patch.people<1||patch.people>30))warnings.push('目前支援 1～30 人，請修改人數。');
    if(patch.flavorKinds!==undefined&&(patch.flavorKinds<0||patch.flavorKinds>3))warnings.push('目前最多設定至少 3 種披薩口味。');
    if(patch.orderMethod&&patch.channel&&!F.ORDER_METHODS[patch.orderMethod].channels.includes(patch.channel)){delete patch.channel;for(let i=recognized.length-1;i>=0;i--)if(/^(?:外帶|外送|內用)/.test(recognized[i]))recognized.splice(i,1);warnings.push('下單與取餐方式無法同時套用，請在欄位核對；已暫不套用取餐方式。');}
    if(!recognized.length)warnings.push('尚未辨識到可套用條件，請補充人數、主餐、預算或點心程度。');
    return {patch,recognized,warnings,text:t,method:'local_rules',partial:true};
  }
  const api={FAMILY,MAINS,MAIN_ITEMS,RICHNESS,SNACK_META,planningContext,planTimeWindows,formatWindows,normalizeMains,validateMainDemand,buildSimple,interpret,number};root.Planner=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
