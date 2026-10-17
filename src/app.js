(()=>{
  'use strict';
  const $=id=>document.getElementById(id),F=globalThis.Feast,P=globalThis.Planner,I=F.ITEMS;
  const snapshots={real:JSON.parse($('snapshot').textContent),demo:JSON.parse($('demo-snapshot').textContent)};
  F.extendItems(snapshots.real);
  const state={mode:'real',mains:['pizza','chicken'],richness:'normal',fixedSnacks:[],demand:{},manual:false,result:null,lastRequest:null,worker:null,dirty:false,showMore:false,activePlan:0,autoEnabled:false,run:0};
  const brandName=b=>b==='KFC'?'肯德基':'必勝客';
  const money=n=>'NT$'+(n/100).toLocaleString('zh-TW',{maximumFractionDigits:2});
  const dateTime=s=>{const d=new Date(s);return Number.isFinite(+d)?d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未知';};
  const drinkNames={any:'不限飲料',cola:'可樂',soda:'汽水',unsweetened:'無糖茶',milkTea:'奶茶（冷熱皆可）',coldMilkTea:'冰奶茶',hotMilkTea:'熱奶茶',soup:'玉米濃湯'};
  function simpleConfig(){return {people:Number($('people').value),mains:state.mains,richness:state.richness,fixedSnacks:state.fixedSnacks,pizzaSize:$('pizza-size').value,flavorKinds:Number($('flavor-kinds').value),flavorTag:$('flavor-tag').value,appetite:$('appetite').value,smallCuts:Number($('small-cuts').value),largeCuts:Number($('large-cuts').value),drinks:$('drinks').checked};}
  function regenerate(force=false){
    try{state.built=P.buildSimple(simpleConfig());if(force||!state.manual)state.demand={...state.built.demand};else state.demand.snackPortions=state.built.demand.snackPortions||0;renderDemand();renderSummary();$('form-error').hidden=true;}
    catch(e){state.built=null;$('simple-summary').replaceChildren(h('p',{},e.message));$('main-portion-list').replaceChildren();$('form-error').textContent=e.message;$('form-error').hidden=false;}
  }
  function renderSummary(){
    const built=state.built;if(!built)return;
    const box=$('simple-summary');box.replaceChildren(h('strong',{},'這一餐，先這樣安排'),h('p',{class:'main-summary'},formatItems(state.demand)),h('p',{},`至少 ${built.snackGoal.minTypes} 類分享點心，合計約 ${built.snackGoal.servings} 小份${$('drinks').checked?'；每人一杯（'+drinkNames[$('drink-preference').value]+'）':''}。`));
    if(built.mains.length>1)box.append(h('p',{},'主餐先按人數分配：'+built.mainAllocation.map(m=>`${m.name}約 ${m.people} 人的份量`).join('、')+'；可一起分享。'));
    if(built.allocationOverflow)box.append(h('p',{class:'manual-note'},'主餐種類比人數多，每種仍至少安排一份，可能多出餐點。'));
    const pizza=built.mains.includes('pizza'),pasta=built.mains.includes('pasta');$('pizza-settings').hidden=!pizza;$('flavor-settings').hidden=!(pizza||pasta);
    if(pizza){const portion=built.portion,total=(state.demand[portion.size]||0)*portion.cuts;box.append(h('p',{},`披薩分配約 ${portion.people} 人，每人先抓 ${portion.slicesPerPerson} 片${portion.size==='pizza9'?'小':'大'}披薩；合計約 ${total} 片，${built.pizzaPreference.minKinds?'至少 '+built.pizzaPreference.minKinds+' 種口味':'口味不指定'}。`));if((state.demand[portion.size]||0)<built.pizzaPreference.minKinds)box.append(h('p',{},'口味數多於披薩個數，試算時可能需要多買披薩。'));
    }
    if(pizza||pasta)box.append(h('p',{},'口味：'+({'any':'不限','seafood':'海鮮','meat':'肉類'}[$('flavor-tag').value]||'不限')));
    box.append(h('p',{},($('brand-scope').value==='all'?'兩家都比較':brandName($('brand-scope').value))+'・'+(({takeaway:'外帶',delivery:'官方外送',dinein:'內用'}[$('channel').value]))));
    if(state.manual)box.append(h('p',{class:'manual-note'},'目前採用你手動修改的份量。'));
    const raw=$('budget').value;if(raw!=='')box.append(h('p',{},$('budget-type').value==='person'?`整團預算 ${money(Math.round(Number(raw)*100)*built.people)}`:`整團預算 ${money(Math.round(Number(raw)*100))}`));
    $('portion-guide').replaceChildren(h('strong',{},'食量參考，先抓一個可修改的起點'),h('p',{},'分配吃披薩的人，小披薩每人先抓 2／3／4 片，大披薩每人先抓 1／2／3 片（輕鬆／一般／較多）。'),h('p',{},'混搭時先將人數分配給各種主餐，炸雞每人抓 1／2／3 塊，漢堡、紙包雞或義大利麵每人一份。這是配餐假設，並非營養標準或吃飽保證。'));
  }
  function renderChoices(){
    $('main-choices').replaceChildren(...Object.entries(P.MAINS).map(([id,main])=>h('button',{type:'button','data-main':id,'aria-pressed':String(state.mains.includes(id))},h('span',{'aria-hidden':'true'},main.emoji),h('strong',{},main.name),h('small',{'aria-hidden':'true'},state.mains.includes(id)?'✓ 已選':'＋ 選擇'))));
    $('richness-choices').replaceChildren(...['light','normal','rich'].map(id=>h('button',{type:'button','data-richness':id,'aria-pressed':String(state.richness===id)},h('strong',{},P.RICHNESS[id].name),h('small',{},'至少 '+P.RICHNESS[id].types+' 類點心'))));
    $('no-snacks').setAttribute('aria-pressed',String(state.richness==='none'));
  }
  function renderSnackGroups(){
    $('snack-groups').replaceChildren();
    for(const brand of ['KFC','PH']){
      const list=h('div',{class:'brand-snack-list'}),section=h('section',{class:'snack-brand-section'},h('h3',{},brandName(brand)),list);
      for(const [id,meta] of Object.entries(P.SNACK_META).filter(([,m])=>m.brand===brand)){
        const available=snapshots[state.mode].offers.some(o=>F.recommendationCheck(snapshots[state.mode],o).allowed&&o.variants.some(v=>v.items[id]>0));
        list.append(h('label',{},h('input',{type:'checkbox','data-fixed-snack':id,checked:state.fixedSnacks.includes(id)}),I[id].name+(available?'':'（目前無已核對券）')));
      }
      $('snack-groups').append(section);
    }
  }
  function markDirty(){
    const recalculate=state.autoEnabled;
    clearTimeout(state.autoTimer);
    if($('search-button').disabled){stop();state.result=null;showState('條件已變更，請重新試算。','前一次計算已取消。');}
    if(state.result){state.dirty=true;$('dirty-notice').textContent='條件已變更，正在重新試算…';$('dirty-notice').hidden=false;}renderSummary();save();
    if(recalculate)state.autoTimer=setTimeout(()=>{try{readRequest();}catch{return;}search();},650);
  }
  function readRequest(){
    const b=P.buildSimple(simpleConfig()),raw=$('budget').value,people=b.people;
    P.validateMainDemand(b,state.demand);
    if(raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0))throw Error('預算請填有效的非負金額。');
    const budgetMinor=raw===''?null:Math.round(Number(raw)*100)*($('budget-type').value==='person'?people:1);
    const fees={KFC:[],PH:[]};document.querySelectorAll('[data-fee-brand]').forEach(e=>{if(e.value!==''&&(!Number.isFinite(Number(e.value))||Number(e.value)<0))throw Error('外送費請填有效的非負金額。');fees[e.dataset.feeBrand][Number(e.dataset.feeSlot)]=e.value===''?null:Math.round(Number(e.value)*100);});
    const at=$('at').value;if(!at)throw Error('請填寫預計點餐時間。');
    return F.validateRequest({demand:{...state.demand},people,budgetMinor,brands:$('brand-scope').value==='all'?['KFC','PH']:[$('brand-scope').value],cross:$('cross-brand').checked,channel:$('channel').value,at:at+':00+08:00',maxOrders:$('max-orders').value==='auto'?b.maxOrders:Number($('max-orders').value),estimate:state.mode==='real',exact:false,allowExtras:true,avoid:[],member:$('member').checked,app:$('order-method').value==='pk_app',orderMethod:$('order-method').value,paymentMethod:$('payment-method').value,allowUnknownOrdering:false,fees,snackGoal:b.snackGoal,pizzaPreference:b.pizzaPreference,pastaPreference:b.pastaPreference,drinkPreference:$('drink-preference').value});
  }
  function feeUI(){
    const old=new Map(Array.from(document.querySelectorAll('[data-fee-brand]')).map(e=>[e.dataset.feeBrand+e.dataset.feeSlot,e.value]));$('fee-inputs').replaceChildren();
    let max=6;try{max=$('max-orders').value==='auto'?P.buildSimple(simpleConfig()).maxOrders:Number($('max-orders').value);}catch{}
    for(let slot=0;slot<max;slot++)$('fee-inputs').append(h('div',{class:'fee-row'},['KFC','PH'].map(b=>h('label',{},`${brandName(b)}第 ${slot+1} 筆`,h('input',{type:'number',min:0,placeholder:'未知','data-fee-brand':b,'data-fee-slot':slot,value:old.get(b+slot)||''})))));
    $('fees-section').hidden=$('channel').value!=='delivery';
  }
  function orderingUI(){
    const method=$('order-method').value,allowed=F.ORDER_METHODS[method].channels;
    for(const option of $('channel').options)option.disabled=!allowed.includes(option.value);
    if(!allowed.includes($('channel').value))$('channel').value='takeaway';
    if(['counter','kiosk'].includes(method)&&$('payment-method').value==='online')$('payment-method').value='in_store';
  }
  function interpretText(){
    const parsed=P.interpret($('meal-text').value);state.parsed=parsed;const box=$('text-preview');box.hidden=false;
    box.replaceChildren(h('strong',{},'我整理到的條件（尚未套用）'),h('ul',{},parsed.recognized.map(s=>h('li',{},s))));
    for(const warning of parsed.warnings)box.append(h('p',{class:'parse-warning'},warning));
    if(parsed.recognized.length)box.append(h('button',{type:'button',class:'outline-button',onclick:applyText},parsed.warnings.length?'我已核對提醒，套用已辨識條件':'套用這些條件'));
  }
  function applyText(){
    const patch=state.parsed?.patch;if(!patch)return;
    const mapping={people:'people',budget:'budget',budgetType:'budget-type',pizzaSize:'pizza-size',flavorKinds:'flavor-kinds',flavorTag:'flavor-tag',channel:'channel',orderMethod:'order-method',paymentMethod:'payment-method',drinkPreference:'drink-preference',brandScope:'brand-scope',appetite:'appetite'};
    for(const [key,id] of Object.entries(mapping))if(patch[key]!==undefined)$(id).value=String(patch[key]);
    if(patch.mains)state.mains=P.normalizeMains(patch);if(patch.richness)state.richness=patch.richness;
    if(patch.drinks!==undefined)$('drinks').checked=patch.drinks;else if(patch.mains)$('drinks').checked=state.mains.some(k=>['burger','wrapped','pasta'].includes(k));
    orderingUI();state.manual=false;regenerate(true);if(patch.explicitDemand){state.demand={...state.demand,...patch.explicitDemand};state.manual=true;renderDemand();renderSummary();}
    renderChoices();feeUI();markDirty();toast('已套用辨識到的條件，請核對這餐的摘要。');
    $('text-preview').append(h('p',{class:'applied-note'},'已套用；請檢查上方欄位及下方份量摘要。'));
  }
  const savedIds=['people','budget','budget-type','appetite','brand-scope','pizza-size','flavor-kinds','flavor-tag','small-cuts','large-cuts','drinks','drink-preference','order-method','payment-method','member','cross-brand','channel','max-orders'];
  function save(){try{const values={};for(const id of savedIds)values[id]=$(id).type==='checkbox'?$(id).checked:$(id).value;localStorage.setItem('feast-simple-v5',JSON.stringify({values,mains:state.mains,richness:state.richness,fixedSnacks:state.fixedSnacks,manual:state.manual,demand:state.demand}));}catch{}}
  function restore(){try{const current=localStorage.getItem('feast-simple-v5'),s=JSON.parse(current||localStorage.getItem('feast-simple-v4')||localStorage.getItem('feast-simple-v3'));if(!s)return;for(const id of savedIds)if(s.values?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=Boolean(s.values[id]);else $(id).value=String(s.values[id]);}state.mains=P.normalizeMains(s);if(P.RICHNESS[s.richness])state.richness=s.richness;state.fixedSnacks=(s.fixedSnacks||[]).filter(k=>P.SNACK_META[k]);if(s.manual&&Object.entries(s.demand||{}).every(([k,n])=>I[k]&&Number.isInteger(n)&&n>=0&&n<=60)){state.manual=true;state.demand={...s.demand};if(!current&&s.family==='burger'&&state.demand.individual){state.demand.burgerMain=state.demand.individual;delete state.demand.individual;}if(!current&&s.values?.drinks&&!state.demand.drinkServing){state.demand.drinkServing=state.demand.drinkSmall||Number($('people').value);delete state.demand.drinkSmall;}}}catch{}}

  function h(tag,attrs={},...children){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v===null||v===undefined)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='checked')e.checked=v;else e.setAttribute(k,v);}for(const c of children.flat(Infinity))if(c!==null&&c!==undefined)e.append(c instanceof Node?c:document.createTextNode(String(c)));return e;}
  function safeLink(url,text,cls='source-link'){try{const u=new URL(url);if(u.protocol!=='https:'||!['info.talk.tw','www.callingtaiwan.com.tw','winedays.github.io','www.kfcclub.com.tw','www.pizzahut.com.tw','kfcoosfs.kfcclub.com.tw'].includes(u.hostname)&&!(u.hostname==='github.com'&&u.pathname.startsWith('/ntut-justintsai-grad/JoCheap/')))return h('span',{},text+'（無可用連結）');return h('a',{href:u.href,target:'_blank',rel:'noopener noreferrer',class:cls},text);}catch{return h('span',{},text+'（無可用連結）');}}
  function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function setGroup(key,value){document.querySelectorAll('[data-'+key+']').forEach(b=>{const yes=b.dataset[key]===value;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});}
  function renderMainPortions(){
    $('main-portion-list').replaceChildren(...(state.built?.mainAllocation||[]).map(m=>h('label',{class:'main-portion-row'},h('span',{},I[m.item].name),h('span',{class:'main-quantity'},h('input',{type:'number',min:1,max:60,value:state.demand[m.item]??0,'data-main-quantity':m.item,'aria-label':I[m.item].name+'最低數量'}),I[m.item].unit))));
  }
  function renderDemand(){const box=$('demand-list');box.replaceChildren();for(const [id,n] of Object.entries(state.demand)){if(!I[id]||id==='snackPortions')continue;box.append(h('div',{class:'demand-row'},h('span',{class:'item-emoji','aria-hidden':'true'},I[id].emoji),h('span',{class:'item-name'},I[id].name,id==='burgerMain'?h('small',{},'一般漢堡；小漢堡不抵這項需求'):null),h('div',{class:'stepper'},h('button',{type:'button','data-item':id,'data-delta':-1,'aria-label':'減少'+I[id].name},'−'),h('input',{type:'number',value:n,min:0,max:60,'data-quantity':id,'aria-label':I[id].name+'數量'}),h('button',{type:'button','data-item':id,'data-delta':1,'aria-label':'增加'+I[id].name},'＋')),h('button',{type:'button',class:'remove-item','data-remove':id,'aria-label':'移除'+I[id].name},'×')));}renderMainPortions();}
  function formatItems(items){return Object.entries(items).filter(([k,n])=>I[k]&&n>0&&!['individual','snackPortions'].includes(k)).map(([k,n])=>`${I[k].name} ${n} ${I[k].unit}`).join('＋');}
  function trustUI(){
    const data=snapshots[state.mode],checked=data.offers.filter(o=>F.verificationCheck(o).allowed).length;
    $('trust-summary').hidden=state.mode==='demo';
    $('trust-summary').textContent=checked?`推薦僅使用 ${checked} 張已完成官方基本配置核對的券。其餘優惠只供查詢；適用日期、餐期與取餐方式見查核紀錄。門市供應仍需確認。`:'目前沒有仍在查核適用範圍內的優惠配置。未核對資料只供查詢；配餐會提供未計價的需求清單。可重新載入取得最新已發布查核。';
    return checked;
  }
  function sourceUI(){
    const data=snapshots[state.mode],checked=trustUI(),statuses={estimate:0,conflict:0,pending:0,official:0};for(const o of data.offers)statuses[o.dataStatus]=(statuses[o.dataStatus]||0)+1;
    $('offer-count').textContent=data.offers.length;$('dataset-label').textContent=state.mode==='demo'?'合成示範・不能兌換':'官方配置核對＋來源查詢';$('snapshot-date').textContent=(state.mode==='demo'?'範例資料':'資料讀取 ')+dateTime(data.generatedAt);$('demo-notice').hidden=state.mode!=='demo';
    const div=$('source-content');div.replaceChildren(h('p',{class:'dialog-note'},state.mode==='demo'?'合成資料供測試與體驗，不提供兌換操作。':'優惠搜尋保留各來源原文；配餐只使用核對完成的官方基本配置。核對包含餐點、份數、券價及當次外帶餐期，並不保證所有門市有貨或接受分筆購買。'));
    div.append(h('p',{class:'dialog-note'},`去重後 ${data.offers.length} 個優惠碼；目前 ${checked} 張官方基本配置在查核範圍內。${statuses.estimate} 張未完成官方核對、${statuses.conflict} 張來源衝突、${statuses.pending} 張解析待確認，均僅供查詢。可推薦數量另受時間、餐點與資格限制。`));
    div.append(h('p',{class:'dialog-note'},'官方更新：'+(data.officialRefresh?.status||'未查核')+(data.officialRefresh?.reason?'・'+data.officialRefresh.reason:'')),safeLink('https://github.com/ntut-justintsai-grad/JoCheap/blob/main/data/quality_report.json','完整資料稽核紀錄'));
    for(const s of data.sources||[])div.append(h('div',{class:'source-block'},h('strong',{},brandName(s.brand)+'・'+s.sourcePublisher),h('p',{},'最後成功讀取：'+dateTime(s.lastSuccessAt)+'（台北）'),h('p',{},`擷取 ${s.parsedCount??'—'} 列・${s.status}`),h('p',{},s.errorSummary||'原始資料列包含重複碼與待確認項目。'),safeLink(s.sourceUrl,'查看公開來源')));
    div.append(h('p',{class:'dialog-note'},'KCouper 提供逐券替換與差額資料，屬第三方整理。加價按該券、該品項與每份數量計算；不推定其他券同樣適用。'),h('p',{class:'dialog-note'},'每張核對券只開放已核對的基本配置，每碼本次最多用一次，是本站保守限制，並非官方每日限購聲明。多筆購買仍需向門市確認。'),h('p',{class:'dialog-note'},'每六小時嘗試更新。第三方讀取時間不等於官方核對時間；官方查核失敗、內容異動或到期，停止推薦。人工複查期限不會隨爬取自動延長。'));
  }
  function researchUI(){
    const box=$('upgrade-research');box.replaceChildren();
    for(const item of snapshots.real.upgradeResearch?.cases||[]){const section=h('section',{},h('strong',{},brandName(item.brand)+'・'+item.title),h('p',{},item.finding),h('p',{class:'warning-text'},item.limit));for(const url of item.sourceUrls)section.append(safeLink(url,item.status==='official_page_verified'?'官方說明':'公開來源'));box.append(section);}
    box.append(h('p',{},'有完整替換品項與差額的配置才會計價。綁套餐加購尚未取得完整價目時，先列查核資訊，避免以加購單價錯算整餐價格。'));
  }
  function setBusy(b){$('search-button').disabled=b;$('mobile-search-button').disabled=b;$('cancel-search').hidden=!b;$('results').setAttribute('aria-busy',String(b));}
  function refreshAge(){
    if(state.mode==='demo')return;
    trustUI();
    const data=snapshots.real,orders=state.result?[...state.result.plans,...(state.result.suggestions||[]),...(state.result.partials||[]),...(state.result.more||[]),...(state.result.minimumIgnoringBudget?[state.result.minimumIgnoringBudget]:[])].flatMap(p=>p.orders):[];
    if(orders.some(o=>!F.verificationCheck(data.offers.find(a=>a.id===o.offerId)||{}).allowed))search();
    const ages=data.offers.map(o=>Date.now()-Date.parse(o.provenance.fetchedAt));
    if(ages.some(age=>!Number.isFinite(age)||age>24*3600000))$('snapshot-date').textContent='來源讀取 '+dateTime(data.generatedAt)+'・含較舊查詢資料';
  }
  function stop(){clearTimeout(state.autoTimer);state.run++;if(state.worker){state.worker.terminate();state.worker=null;}setBusy(false);}
  function showState(title,description,button){$('results').replaceChildren(h('div',{class:'state-card'},h('h3',{},title),h('p',{},description),button));}
  function search(){
    stop();$('form-error').hidden=true;let r;try{r=readRequest();}catch(e){$('form-error').textContent=e.message;$('form-error').hidden=false;return;}
    state.lastRequest=r;state.dirty=false;state.showMore=false;state.activePlan=0;$('dirty-notice').hidden=true;save();
    $('request-summary').replaceChildren(h('span',{},`${r.people} 人`),h('span',{},({takeaway:'外帶',delivery:'官方外送',dinein:'內用'}[r.channel])),h('span',{},`最多 ${r.maxOrders} 筆`),h('span',{},r.exact?'指定數量剛好':'至少滿足需求'),h('span',{},r.budgetMinor===null?'不限預算':'整團 '+money(r.budgetMinor)));$('request-summary').hidden=false;
    setBusy(true);showState('正在幫這一餐算一算…','比較符合條件的優惠配置與訂單費用。');$('results').firstChild.prepend(h('div',{class:'loading-dot','aria-hidden':'true'}));$('search-meta').textContent='';const token=state.run;
    const done=result=>{if(token!==state.run)return;if(state.worker){state.worker.terminate();state.worker=null;}state.result=result;state.autoEnabled=true;setBusy(false);renderResults();if(window.innerWidth<=760)$('results-title').scrollIntoView({block:'start'});};
    try{const code=$('engine-source').textContent+'\nself.onmessage=e=>{try{self.postMessage({result:Feast.recommend(e.data.dataset,e.data.request)})}catch(err){self.postMessage({error:err.message})}};';const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));state.worker=new Worker(url);URL.revokeObjectURL(url);state.worker.onmessage=e=>{if(e.data.error){stop();showState('這次計算未完成',e.data.error);}else done(e.data.result);};state.worker.onerror=()=>{stop();showState('計算未能啟動','瀏覽器無法執行背景計算。請用新版瀏覽器開啟此頁再試。');};state.worker.postMessage({dataset:snapshots[state.mode],request:r});}catch{setTimeout(()=>{try{done(F.recommend(snapshots[state.mode],r,{timeLimitMs:500,maxStates:200000}));}catch(e){stop();showState('這次計算未完成',e.message);}},25);}
  }
  function shortageText(p){
    const parts=(p.missing||[]).map(m=>`${I[m.id].name} ${Number(m.quantity.toFixed(1))} ${I[m.id].unit}`);
    if(p.snackShortfall)parts.push(`點心種類 ${p.snackShortfall} 類`);
    if(p.flavorShortfall)parts.push(`披薩口味 ${p.flavorShortfall} 種`);
    return parts.join('、');
  }
  function planText(p){if(state.mode!=='demo'&&p.orders.some(o=>!F.verificationCheck(snapshots.real.offers.find(a=>a.id===o.offerId)||{}).allowed))return '查核已到期或配置異動，請重新載入並試算。';const original=state.lastRequest,r=p.effectiveRequest||original;let lines=[state.mode==='demo'?'【合成示範・不能兌換】':'【揪省・官方基本配置核對，門市供應待確認】',`${r.people} 人｜${({takeaway:'外帶',delivery:'官方外送',dinein:'內用'}[r.channel])}｜${p.orders.length} 筆訂單`,p.totalCost===null?`餐點小計 ${money(p.knownSubtotal)}，另加未確認費用`:`整團 ${money(p.totalCost)}，平均每人約 ${money(Math.ceil(p.totalCost/r.people))}`,'需求：'+p.coverage.map(c=>`${I[c.id].name} ${c.got}/${c.need}`).join('、'),''];if(p.substitution)lines.splice(1,0,'【替代餐單・已調整需求】',...(p.adjustments||[]));if(p.partial)lines.splice(1,0,'【部分配置・尚未滿足全部需求】','還缺：'+shortageText(p));if(p.overBudget)lines.splice(1,0,'【超出預算參考】超出整團預算 '+money(p.totalCost-original.budgetMinor));for(const [i,o] of p.orders.entries()){lines.push(`${i+1}. ${brandName(o.brand)}｜${o.title}｜${money(o.base)}`,formatItems(o.items),`優惠碼：${o.code}`);if(o.choice)lines.push(o.choice);lines.push('下單方式：'+F.ORDER_METHODS[r.orderMethod||'official_web'].name+'（'+(o.orderingStatus==='source_stated'?'來源載明適用':'待確認')+'）');if(o.verification?.checkedAt)lines.push('官方核對：'+o.verification.checkedAt,'查核適用至：'+o.verification.validUntil,'核對範圍：'+o.verification.scope.join('、'),'官方券面：'+o.verification.imageUrl,'查核紀錄：https://github.com/ntut-justintsai-grad/JoCheap/blob/main/'+o.verification.evidencePath,...o.verification.limitations);lines.push('價格明細：'+money(o.mealBase)+'＋替換 '+money(o.surchargeMinor||0)+'＝'+money(o.base));if(o.surchargeMinor)lines.push('基本餐 '+money(o.mealBase)+'＋替換升級 '+money(o.surchargeMinor));if(o.beverages?.length)lines.push('飲料／湯：'+o.beverages.map(d=>d.name+' × '+d.quantity).join('、'));if(o.mainDescription)lines.push(o.mainDescription);if(o.pizzaChoices?.length)lines.push('實際口味：'+o.pizzaChoices.map(a=>a.name+'（'+(a.size==='pizza9'?'小':'大')+'）').join('、'));if(r.channel==='delivery')lines.push('該筆額外費用：'+(o.fee===null?'未知':money(o.fee)));if(state.mode!=='demo')lines.push('來源：'+o.sourceUrl,'官方入口：'+o.officialUrl);lines.push('');}lines.push('多出餐點：'+(formatItems(p.extras)||'無'),`搜尋${p.searchComplete?'已完成':'未完成'}，最多 ${r.maxOrders} 筆；未核對門市與官方結帳結果。`);return lines.join('\n');}
  async function copy(text){try{if(!navigator.clipboard)throw Error('no clipboard');await navigator.clipboard.writeText(text);toast('已複製，貼到群組就能一起討論。');}catch{$('copy-text').value=text;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select();}}
  function planCard(p,index){const original=state.lastRequest,r=p.effectiveRequest||original,base=state.result.plans[0],isDemo=state.mode==='demo';const exactLabel=p.substitution?'替代餐單・已調整需求':p.partial?'部分配置・尚未湊齊':p.overBudget?'超出預算參考':isDemo?'示範結果':state.mode==='real'?'官方基本配置已核對':(p.searchComplete?'已收錄方案中最低價':'目前找到的較低價');const card=h('article',{class:'plan-card'+(index===0?' best':'')},h('div',{class:'plan-topline'},h('strong',{},index===0?'✦ '+exactLabel:p.label),h('span',{class:'warning-text'},isDemo?'不能兌換':p.partial?'尚未滿足全部需求':p.searchComplete?'門市供應與分筆購買待確認':'搜尋未完成・尚未確認最低')));const body=h('div',{class:'plan-body'});body.append(h('div',{class:'plan-price-row'},h('div',{},h('h3',{},p.substitution?p.label:p.partial?'目前最接近的配置':p.overBudget?'餐點湊齊，但超出預算':index===0?'這一餐，可以這樣點':p.label),h('div',{class:'price'},h('small',{},p.totalCost===null?'餐點 NT$':'NT$'),((p.totalCost??p.knownSubtotal)/100).toLocaleString('zh-TW')),h('p',{class:'per-person'},p.totalCost===null?'另加未確認費用，尚不能比較實付總額':`平均每人約 ${money(Math.ceil(p.totalCost/r.people))}`)),h('div',{class:'price-side'},h('span',{class:'chip'},`${p.brandCount} 個品牌`),h('span',{class:'chip'},`${p.orders.length} 筆訂單`))));if(index>0&&!p.partial&&!p.overBudget&&!p.substitution&&p.totalCost!==null&&base?.totalCost!=null)body.append(h('p',{class:'price-difference'},`比已核對配置中的較低價方案${p.totalCost>=base.totalCost?'多':'少'} ${money(Math.abs(p.totalCost-base.totalCost))}`));body.append(h('div',{class:'coverage'},p.coverage.map(c=>h('span',{class:c.got<c.need?'coverage-missing':null},`${c.got>=c.need?'✓':'尚缺'} ${I[c.id].name} ${Number(c.got.toFixed(1))} / ${c.need}`))),h('p',{class:'extras'},'另外得到：'+(formatItems(p.extras)||'沒有多出的餐點')));if(p.partial)body.append(h('div',{class:'shortfall-notice'},h('strong',{},'尚未滿足全部需求'),h('p',{},'還缺：'+shortageText(p)),h('p',{},'優先保留主餐份量，再比較各項需求達成比例與金額；這是目前找到的接近配置。')));if(p.substitution)body.append(h('div',{class:'shortfall-notice'},h('strong',{},'這份替代餐單調整了'),h('ul',{},(p.adjustments||[]).map(note=>h('li',{},note))),h('p',{},'上方勾選與預算不會被自動改動；以下份量按這份替代餐單計算。')));if(p.overBudget)body.append(h('div',{class:'shortfall-notice'},'超出整團預算 '+money(p.totalCost-original.budgetMinor)+'；僅供比較，尚未調高你的預算。'));for(const [i,o] of p.orders.entries()){const row=h('div',{class:'order-row'},h('div',{class:'order-title'},h('span',{class:'brand-dot'+(o.brand==='PH'?' ph':'')},o.brand==='KFC'?'KFC':'PH'),h('span',{},`第 ${i+1} 筆・${o.title}`),h('span',{},money(o.base))),h('p',{class:'order-items'},formatItems(o.items)));row.append(h('p',{class:'selection-cost'},'基本餐 '+money(o.mealBase)+'＋替換 '+money(o.surchargeMinor||0)+'＝'+money(o.base)));if(o.verification?.checkedAt){const proof=h('details',{class:'verification-proof'},h('summary',{},'查看這張券的官方核對證據'),h('p',{class:'helper'},'官方讀取：'+dateTime(o.verification.checkedAt)+'；本次適用至 '+dateTime(o.verification.validUntil)),h('p',{class:'helper'},'核對範圍：'+o.verification.scope.join('、')),safeLink(o.verification.sourceUrl,'官方優惠頁'),safeLink(o.verification.imageUrl,'核對的官方券面'),safeLink('https://github.com/ntut-justintsai-grad/JoCheap/blob/main/'+o.verification.evidencePath,'查核紀錄'));for(const note of o.verification.limitations)proof.append(h('p',{class:'helper'},note));row.append(proof);}row.append(h('p',{class:'helper'},F.ORDER_METHODS[r.orderMethod||'official_web'].name+'・'+(o.orderingStatus==='source_stated'?'來源載明適用':'下單方式待確認')));if(o.surchargeMinor)row.append(h('p',{class:'selection-cost'},'基本餐 '+money(o.mealBase)+'＋替換升級 '+money(o.surchargeMinor)));if(o.beverages?.length)row.append(h('p',{class:'order-choice'},'飲料／湯：'+o.beverages.map(d=>d.name+' × '+d.quantity).join('、')));if(o.optionChoices?.some(c=>c.surchargeMinor))row.append(h('p',{class:'order-choice'},'付費替換：'+o.optionChoices.filter(c=>c.surchargeMinor).map(c=>c.from+' → '+c.name+'（加 '+money(c.surchargeMinor)+'）').join('、')));if(o.pizzaChoices?.length)row.append(h('p',{class:'pizza-choice'},'本次口味：'+o.pizzaChoices.map(a=>a.name+'（'+(a.size==='pizza9'?'小':'大')+'）').join('、')));if(o.mainDescription)row.append(h('p',{class:'order-choice'},o.mainDescription));if(o.choice)row.append(h('p',{class:'order-choice'},'本次配置：'+o.choice));if(r.channel==='delivery')row.append(h('p',{class:'fee-line'},`本品牌第 ${o.feeSlot+1} 筆費用：${o.fee===null?'未知':money(o.fee)}${o.service?'＋服務費 '+money(o.service):''}`));const actions=h('div',{class:'order-actions'},isDemo?h('span',{class:'chip'},o.code+'・假碼'):h('button',{type:'button',class:'code-button',onclick:()=>copy(o.code),'aria-label':'複製優惠碼 '+o.code},'複製優惠碼 '+o.code));if(!isDemo)actions.append(safeLink(o.sourceUrl,'優惠資料來源'),safeLink(o.officialUrl,'前往官方訂餐'));row.append(actions);body.append(row);}body.append(h('p',{class:'plan-match'},'點心類型：'+(p.snackTypes?.join('、')||'無')+(p.pizzaFlavors?'；已配 '+p.pizzaFlavors+' 種披薩口味':'')));body.append(h('div',{class:'plan-actions'},h('button',{type:'button',class:'primary-button',onclick:()=>copy(planText(p))},isDemo?'複製示範清單':'複製購買清單'),h('button',{type:'button',class:'outline-button',onclick:()=>{$('source-dialog').showModal();}},'查看來源與範圍')));const conditions=[...new Set(p.orders.flatMap(o=>o.conditions))];body.append(h('details',{class:'plan-conditions'},h('summary',{},'計費、資格與使用前須確認的事'),h('p',{},`餐點小計 ${money(p.knownSubtotal)}${p.totalCost===null?'；額外費用未知。':`；必要額外費用 ${money(p.totalCost-p.knownSubtotal)}；合計 ${money(p.totalCost)}。`}`),h('ul',{},conditions.map(c=>h('li',{},c))),h('p',{},'一張券獨立計作一筆訂單，每碼本次最多一次；這是本站保守設定。各門市是否接受分筆購買仍須確認。結果只比較已核對且符合條件的配置，不代表市場全部優惠最低價。')));card.append(body);return card;}
  function renderResults(){
    const x=state.result,r=state.lastRequest,box=$('results');box.replaceChildren();
    if(!x.searchComplete)box.append(h('div',{class:'notice'},'已達搜尋上限，以下是目前找到的方案，尚未證明最低價。'));
    let choices=[...x.plans,...(x.suggestions||[])],extra=[];
    if(x.plans.length){
      extra=x.more.filter(p=>!choices.some(q=>q.id===p.id));
      if(state.showMore)choices.push(...extra.map(p=>({...p,label:'更多餐點配置',searchComplete:x.searchComplete})));
      if(choices.length===1)box.append(h('p',{class:'recommendation-note'},'目前條件下只找到 1 種完整組合；可調整預算、品牌或訂單上限再比較。'));
    }else{
      choices=[...(x.suggestions||[]),...(x.partials||[]).slice(0,1).map(p=>({...p,label:'保留原餐點・接近配置'}))];
      const best=x.minimumIgnoringBudget;
      if(best&&best.totalCost!==null&&r.budgetMinor!==null&&best.totalCost>r.budgetMinor&&!choices.some(p=>p.id===best.id))choices.push({...best,overBudget:true,label:'加預算就能湊齊'});
      box.append(h('div',{class:'state-card'},h('h3',{},choices.length?'先給你這幾種替代點法':'目前沒有符合需求的已核對計價組合'),h('p',{},choices.length?'替代餐單也只使用已核對的官方配置，會列出更換主餐、減少點心或預算差異。':'保留你的需求，提供未計價清單；未核對的優惠不會為了湊出價格而進入推薦。')));
    }
    $('result-count').textContent=choices.length?`${choices.length} 個可比較配置`:'';
    if(x.unpricedAlternative){
      const menu=x.unpricedAlternative;box.append(h('article',{class:'plan-card'},h('div',{class:'plan-body'},h('h3',{},menu.label),h('p',{class:'recommendation-note'},menu.note),h('p',{},Object.entries(menu.items).filter(([id,n])=>I[id]&&n>0).map(([id,n])=>`${I[id].name} ${n} ${I[id].unit}`).join('＋')),h('p',{class:'shortfall-notice'},'此方案不依賴優惠券，價格待門市或官網確認；沒有將未知價格算成 0 元。'),h('div',{class:'plan-actions'},safeLink('https://www.kfcclub.com.tw/coupon','前往肯德基確認菜單'),safeLink('https://www.pizzahut.com.tw/','前往必勝客確認菜單')))));
    }
    if(choices.some(p=>p.unknownCosts))box.append(h('div',{class:'notice'},'額外費用未知，僅顯示已知餐點小計，尚不能確認符合預算。'));
    if(choices.length){
      state.activePlan=Math.min(state.activePlan,choices.length-1);
      box.append(h('p',{class:'recommendation-note'},`依本次 ${r.people} 人與${r.budgetMinor===null?'不限預算':'整團 '+money(r.budgetMinor)}重新試算。點選餐單查看券價、份量與調整內容。`));
      const picker=h('div',{class:'recommendation-picker','aria-label':'比較餐點配置'});
      choices.forEach((p,i)=>{
        const price=p.totalCost===null?'餐點小計 '+money(p.knownSubtotal):money(p.totalCost);
        picker.append(h('button',{type:'button',class:'recommendation-option','aria-pressed':String(i===state.activePlan),'data-plan-choice':i,onclick:()=>{state.activePlan=i;renderResults();document.querySelector(`[data-plan-choice="${i}"]`).focus({preventScroll:true});}},h('strong',{},p.label),h('span',{class:'recommendation-price'},price),h('span',{},`${p.brandCount} 個品牌・${p.orders.length} 筆訂單`),h('small',{},p.partial?'還缺：'+shortageText(p):p.overBudget?'超出預算 '+money(p.totalCost-r.budgetMinor):p.substitution?(p.unknownCosts?'已調整需求・額外費用待確認':'已調整需求，點選查看差異'):p.unknownCosts?'餐點已湊齊・額外費用待確認':'符合餐點與已知預算條件')));
      });
      box.append(picker,planCard(choices[state.activePlan],state.activePlan));
      const selected=choices[state.activePlan];
      if(selected.overBudget)box.append(h('button',{type:'button',class:'outline-button full',onclick:()=>{$('budget-type').value='total';$('budget').value=selected.totalCost/100;markDirty();search();}},'將整團預算調為 '+money(selected.totalCost)+' 再試算'));
      if(extra.length&&!state.showMore)box.append(h('button',{type:'button',class:'outline-button more-button',onclick:()=>{state.showMore=true;renderResults();}},'查看更多配置（含同券不同選項）'));
    }
    $('search-meta').textContent=`從 ${x.candidateCount} 個可用優惠選項重新計算・探索 ${x.states.toLocaleString()} 個狀態・${x.elapsedMs} ms・${x.searchComplete?'完整組合搜尋完成':'搜尋未完成'}。${x.excluded.length} 筆因條件或資料不足未參與。${state.mode==='real'?'僅比較已核對基本配置；門市供應與結帳接受情況仍需確認。':''}`;
  }
  function browse(){globalThis.CatalogUI.render({data:snapshots[state.mode],F,I,h,$,money,brandName,safeLink,onCopy:copy,onAdd:items=>{for(const [id,n] of Object.entries(items))state.demand[id]=(state.demand[id]||0)+n;state.manual=true;renderDemand();renderSummary();$('advanced').open=true;setPage('planner');markDirty();toast('已加入目前選項的餐點數量；可再修改。');}});}
  function setPage(page){$('planner-page').hidden=page!=='planner';$('mobile-search').hidden=page!=='planner';$('browse-page').hidden=page!=='browse';document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(page==='browse')browse();}
  for(let n=1;n<=12;n++)$('max-orders').append(h('option',{value:n},n+' 筆'));
  for(const [id,item] of Object.entries(I))if(!id.startsWith('food_')&&!['individual','burgerMain','drinkServing','snackPortions'].includes(id)){
    const brands=[...new Set(snapshots.real.offers.filter(o=>o.variants.some(v=>v.items[id]>0)).map(o=>brandName(o.brand)))];
    $('add-item').append(h('option',{value:id},item.name+(brands.length?'・'+brands.join('／'):'')));
    $('browse-category').append(h('option',{value:id},item.name));
  }
  $('at').value=new Date(Date.now()+8*3600000).toISOString().slice(0,16);
  restore();orderingUI();regenerate();renderChoices();renderSnackGroups();feeUI();sourceUI();researchUI();refreshAge();setInterval(refreshAge,60000);
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  $('main-choices').addEventListener('click',e=>{const b=e.target.closest('[data-main]');if(!b)return;const id=b.dataset.main;if(state.mains.includes(id)&&state.mains.length===1){toast('至少保留一種主餐；可先選另一種，再取消這一種。');return;}state.mains=state.mains.includes(id)?state.mains.filter(k=>k!==id):[...state.mains,id];state.manual=false;$('drinks').checked=state.mains.some(k=>['burger','wrapped','pasta'].includes(k));regenerate(true);renderChoices();feeUI();markDirty();});
  $('main-portion-list').addEventListener('input',e=>{const id=e.target.dataset.mainQuantity;if(!id)return;state.demand[id]=e.target.value===''?NaN:Number(e.target.value);state.manual=true;renderSummary();markDirty();});
  $('main-portion-list').addEventListener('change',()=>renderDemand());
  $('reset-main-portions').addEventListener('click',()=>{state.manual=false;regenerate(true);markDirty();});
  $('richness-choices').addEventListener('click',e=>{const b=e.target.closest('[data-richness]');if(!b)return;state.richness=b.dataset.richness;regenerate();renderChoices();markDirty();});
  $('no-snacks').addEventListener('click',()=>{state.richness='none';regenerate();renderChoices();markDirty();});
  document.querySelectorAll('[data-person-delta]').forEach(b=>b.addEventListener('click',()=>{const next=Number($('people').value)+Number(b.dataset.personDelta);if(next<1||next>30)return;$('people').value=next;regenerate();feeUI();markDirty();}));
  $('snack-groups').addEventListener('change',e=>{const id=e.target.dataset.fixedSnack;if(!id)return;state.fixedSnacks=e.target.checked?[...new Set([...state.fixedSnacks,id])]:state.fixedSnacks.filter(k=>k!==id);if(state.manual){if(e.target.checked)state.demand[id]=Math.ceil(Number($('people').value)*(F.SNACKS[id]?.perPerson??.5));else delete state.demand[id];}regenerate();markDirty();});
  $('demand-list').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.remove)delete state.demand[b.dataset.remove];else if(b.dataset.item){const k=b.dataset.item;state.demand[k]=Math.max(0,Math.min(60,(state.demand[k]||0)+Number(b.dataset.delta)));}state.manual=true;renderDemand();markDirty();});
  $('demand-list').addEventListener('input',e=>{if(e.target.dataset.quantity){state.demand[e.target.dataset.quantity]=e.target.value===''?NaN:Number(e.target.value);state.manual=true;renderMainPortions();markDirty();}});
  $('add-demand').addEventListener('click',()=>{const id=$('add-item').value;state.demand[id]=Math.min(60,(state.demand[id]||0)+1);state.manual=true;renderDemand();markDirty();});
  $('reset-demand').addEventListener('click',()=>{state.manual=false;regenerate(true);markDirty();});
  const regenerateIds=['people','appetite','pizza-size','flavor-kinds','flavor-tag','small-cuts','large-cuts','drinks','drink-preference'];
  $('planner-form').addEventListener('change',e=>{if(e.target.id==='drink-preference')$('drinks').checked=true;if(['drinks','drink-preference'].includes(e.target.id)&&state.manual){if($('drinks').checked)state.demand.drinkServing=Number($('people').value);else delete state.demand.drinkServing;}if(regenerateIds.includes(e.target.id))regenerate(e.target.id==='pizza-size');if(e.target.id==='order-method')orderingUI();if(['people','channel','max-orders','order-method'].includes(e.target.id))feeUI();if(e.target.id!=='meal-text')markDirty();});
  $('planner-form').addEventListener('input',e=>{if(['budget','people'].includes(e.target.id)){if(e.target.id==='people')regenerate();markDirty();}else if(e.target.dataset.feeBrand)markDirty();});
  $('planner-form').addEventListener('submit',e=>{e.preventDefault();search();});
  $('cancel-search').addEventListener('click',()=>{stop();state.result=null;showState('這次試算已取消','需求已保留。');});
  $('interpret-text').addEventListener('click',interpretText);
  $('meal-text').addEventListener('input',()=>{state.parsed=null;$('text-preview').hidden=true;});
  $('text-example').addEventListener('click',()=>{$('meal-text').value='六個人，每人 200，海鮮披薩兩種口味，點心很豐富，外帶';interpretText();});
  $('quick-example').addEventListener('click',()=>{state.mains=['pizza','chicken'];state.richness='normal';state.manual=false;state.fixedSnacks=[];$('people').value=6;$('budget').value='';$('brand-scope').value='all';$('channel').value='takeaway';$('drinks').checked=false;regenerate(true);renderChoices();renderSnackGroups();feeUI();search();});
  $('data-mode').addEventListener('change',()=>{stop();state.mode=$('data-mode').value;state.result=null;sourceUI();refreshAge();renderSnackGroups();browse();$('request-summary').hidden=true;$('dirty-notice').hidden=true;$('search-meta').textContent='';$('result-count').textContent='';$('search-button').firstElementChild.textContent=state.mode==='demo'?'用示範資料試算':'比較已核對的組合';showState(state.mode==='demo'?'已切換至合成示範':'已切換至官方配置核對','需求已保留，請重新試算。');});
  ['browse-search','browse-brand','browse-category','browse-sort','browse-max','browse-active','browse-status'].forEach(id=>$(id).addEventListener('input',browse));
  $('clear-filters').addEventListener('click',()=>{$('browse-search').value='';$('browse-brand').value='all';$('browse-category').value='all';$('browse-sort').value='price';$('browse-max').value='';$('browse-status').value='all';$('browse-active').checked=true;browse();});
  for(const id of ['source-button','mode-help'])$(id).addEventListener('click',()=>{sourceUI();$('source-dialog').showModal();});
  $('close-source').addEventListener('click',()=>$('source-dialog').close());$('close-copy').addEventListener('click',()=>$('copy-dialog').close());$('reload-data').addEventListener('click',()=>location.reload());
  $('clear-local').addEventListener('click',()=>{try{for(const key of ['feast-simple-v5','feast-simple-v4','feast-simple-v3','feast-demand-v2','feast-demand-v1'])localStorage.removeItem(key);toast('已清除本機需求。');}catch{toast('目前無法使用本機儲存。');}});
})();
