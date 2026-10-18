(()=>{
  'use strict';
  const $=id=>document.getElementById(id),F=globalThis.Feast,P=globalThis.Planner,I=F.ITEMS,Intent=globalThis.MealIntent;
  const llmConfig=JSON.parse($('llm-config').textContent);let llmReady=false;
  const snapshots={real:JSON.parse($('snapshot').textContent),demo:JSON.parse($('demo-snapshot').textContent)};
  F.extendItems(snapshots.real);
  const state={mealMode:'meal',mealMains:['pizza','chicken'],intentRun:0,mode:'real',mains:['pizza','chicken'],richness:'normal',fixedSnacks:[],demand:{},manual:false,result:null,lastRequest:null,worker:null,dirty:false,showMore:false,activePlan:0,autoEnabled:false,run:0};
  const brandName=b=>b==='KFC'?'肯德基':'必勝客';
  const money=n=>'NT$'+(n/100).toLocaleString('zh-TW',{maximumFractionDigits:2});
  const dateTime=s=>{const d=new Date(s);return Number.isFinite(+d)?d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未知';};
  const drinkNames={any:'不限飲料',cola:'可樂',soda:'汽水',unsweetened:'無糖茶',milkTea:'奶茶（冷熱皆可）',coldMilkTea:'冰奶茶',hotMilkTea:'熱奶茶',soup:'玉米濃湯'};
  function simpleConfig(){return {mealMode:state.mealMode,people:Number($('people').value),mains:state.mains,richness:state.richness,fixedSnacks:state.fixedSnacks,pizzaSize:$('pizza-size').value,flavorKinds:Number($('flavor-kinds').value),flavorTag:$('flavor-tag').value,appetite:$('appetite').value,smallCuts:Number($('small-cuts').value),largeCuts:Number($('large-cuts').value),drinks:$('drinks').checked};}
  function regenerate(force=false){
    try{state.built=P.buildSimple(simpleConfig());if(force||!state.manual)state.demand={...state.built.demand};else state.demand.snackPortions=state.built.demand.snackPortions||0;renderDemand();renderSummary();$('form-error').hidden=true;}
    catch(e){state.built=null;$('simple-summary').replaceChildren(h('p',{},e.message));$('main-portion-list').replaceChildren();$('form-error').textContent=e.message;$('form-error').hidden=false;}
  }
  function renderSummary(){
    const built=state.built;if(!built)return;
    $('simple-summary').replaceChildren(h('strong',{},'預計份量'),h('p',{class:'main-summary'},formatItems(state.demand)+(state.demand.drinkServing?'（'+drinkNames[$('drink-preference').value]+'）':'')));
    const pizza=built.mains.includes('pizza'),pasta=built.mains.includes('pasta');$('pizza-settings').hidden=!pizza;$('flavor-settings').hidden=!(pizza||pasta);$('main-portions').hidden=state.mealMode==='snack';
    $('portion-guide').textContent='份量按人數與食量估算，可在餐點數量中調整。披薩切法是試算用，不會改變整個披薩份量。';
  }
  function renderChoices(){
    $('main-choices').replaceChildren(...Object.entries(P.MAINS).map(([id,main])=>h('button',{type:'button','data-main':id,'aria-pressed':String(state.mains.includes(id))},h('span',{'aria-hidden':'true'},main.emoji),h('strong',{},main.name),h('small',{'aria-hidden':'true'},state.mains.includes(id)?'✓ 已選':'＋ 選擇'))));
    $('richness-choices').replaceChildren(...['light','normal','rich'].map(id=>h('button',{type:'button','data-richness':id,'aria-pressed':String(state.richness===id)},h('strong',{},P.RICHNESS[id].name),h('small',{},'至少 '+P.RICHNESS[id].types+' 類點心'))));
    $('no-snacks').setAttribute('aria-pressed',String(state.richness==='none'));
    $('no-snacks').textContent=state.mealMode==='snack'?(state.fixedSnacks.length?'只要選好的點心':'只要飲料'):'不另外要求點心';
    $('main-fieldset').hidden=state.mealMode==='snack';$('tea-fieldset').hidden=state.mealMode!=='snack';
    document.querySelectorAll('[data-meal-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mealMode===state.mealMode)));
    $('richness-label').textContent=state.mealMode==='snack'?'點心份量':'點心搭配';
    const picks=['tart','friesSmall','nuggets','qq','hashBrown','daifuku'];
    $('tea-snack-choices').replaceChildren(h('button',{type:'button','data-tea-snack':'any','aria-pressed':String(!state.fixedSnacks.length)},'幫我搭配'),...picks.map(id=>h('button',{type:'button','data-tea-snack':id,'aria-pressed':String(state.fixedSnacks.includes(id))},I[id].emoji+' '+I[id].name)));
    $('drink-preference').disabled=!$('drinks').checked;
  }
  function renderSnackGroups(){
    $('snack-groups').replaceChildren();
    for(const brand of ['KFC','PH']){
      const list=h('div',{class:'brand-snack-list'}),section=h('section',{class:'snack-brand-section'},h('h3',{},brandName(brand)),list);
      for(const [id,meta] of Object.entries(P.SNACK_META).filter(([,m])=>m.brand===brand)){
        const data=snapshots[state.mode],available=F.planningOffers(data,{dataScope:'all'},Date.now()).some(o=>F.recommendationCheck(data,o).allowed&&o.variants.some(v=>v.items[id]>0));
        list.append(h('label',{},h('input',{type:'checkbox','data-fixed-snack':id,checked:state.fixedSnacks.includes(id)}),I[id].name+(available?'':'（目前無可計價版本）')));
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
    return F.validateRequest({demand:{...state.demand},people,budgetMinor,brands:$('brand-scope').value==='all'?['KFC','PH']:[$('brand-scope').value],cross:$('cross-brand').checked,allowMealReplacement:$('meal-replacement').checked,channel:$('channel').value,at:at+':00+08:00',maxOrders:$('max-orders').value==='auto'?b.maxOrders:Number($('max-orders').value),estimate:state.mode==='real',exact:false,allowExtras:true,avoid:[],member:$('member').checked,app:$('order-method').value==='pk_app',orderMethod:$('order-method').value,paymentMethod:$('payment-method').value,dataScope:$('data-scope').value,allowUnknownOrdering:$('unknown-ordering').checked,fees,snackGoal:b.snackGoal,pizzaPreference:b.pizzaPreference,pastaPreference:b.pastaPreference,drinkPreference:$('drink-preference').value});
  }
  function feeUI(){
    const old=new Map(Array.from(document.querySelectorAll('[data-fee-brand]')).map(e=>[e.dataset.feeBrand+e.dataset.feeSlot,e.value]));$('fee-inputs').replaceChildren();
    let max=6;try{max=$('max-orders').value==='auto'?P.buildSimple(simpleConfig()).maxOrders:Number($('max-orders').value);}catch{}
    for(let slot=0;slot<max;slot++)$('fee-inputs').append(h('div',{class:'fee-row'},['KFC','PH'].map(b=>h('label',{},`${brandName(b)}第 ${slot+1} 筆`,h('input',{type:'number',min:0,placeholder:'未知','data-fee-brand':b,'data-fee-slot':slot,value:old.get(b+slot)||''})))));
    $('fees-section').hidden=$('channel').value!=='delivery';
  }
  function orderingUI(){
    const method=$('order-method').value,allowed=method==='auto'?['takeaway','delivery','dinein']:F.ORDER_METHODS[method].channels;
    for(const option of $('channel').options)option.disabled=!allowed.includes(option.value);
    if(!allowed.includes($('channel').value))$('channel').value='takeaway';
    if(['counter','kiosk'].includes(method)&&$('payment-method').value==='online')$('payment-method').value='in_store';
  }
  async function initIntent(){
    if(!llmConfig.endpoint)return;
    try{const endpoint=new URL(llmConfig.endpoint);if(endpoint.protocol!=='https:')return;
      const response=await fetch(endpoint.href.replace(/\/$/,'')+'/health',{credentials:'omit',signal:AbortSignal.timeout(8000)}),data=await response.json();
      llmReady=response.ok&&data.ready===true;$('intent-mode').textContent=llmReady?'AI 協助填寫':'基本文字辨識';
    }catch{llmReady=false;}
  }
  async function interpretText(){
    const text=$('meal-text').value.trim(),box=$('text-preview');if(!text){box.replaceChildren(h('p',{},'先告訴我人數、預算或想吃的。'));box.hidden=false;return;}
    const token=++state.intentRun;state.intentAbort?.abort();const controller=new AbortController();state.intentAbort=controller;
    const button=$('interpret-text');button.disabled=true;button.textContent='整理中…';box.hidden=true;
    let parsed;
    try{
      if(llmReady){
        const timeout=setTimeout(()=>controller.abort(),20000);let response;
        try{response=await fetch(llmConfig.endpoint.replace(/\/$/,'')+'/interpret',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:controller.signal});}finally{clearTimeout(timeout);}
        const result=await response.json();if(!response.ok)throw Error('AI 暫時無法使用');
        const validated=Intent.validate(result);const local=P.interpret(text);
        parsed={...validated,recognized:['AI 已整理需求'],method:'llm',text,warnings:[...new Set([...validated.warnings,...local.warnings.filter(x=>/限制|過敏|未驗證|完全排除/.test(x))])]};
      }else parsed=P.interpret(text);
      if(token!==state.intentRun)return;
      state.parsed=parsed;applyText();
    }catch(error){
      if(token!==state.intentRun)return;
      box.replaceChildren(h('p',{class:'warning-text'},error.message==='AI 暫時無法使用'||error.name==='AbortError'?'AI 目前無法完成，請稍後再試，或直接修改下方欄位。':error.message));box.hidden=false;
    }finally{if(token===state.intentRun){button.disabled=false;button.textContent='幫我填好';}}
  }
  function applyText(){
    const parsed=state.parsed,patch=parsed?.patch;if(!patch)return;
    const mode=patch.mealMode||state.mealMode,mains=mode==='snack'?[]:patch.mains||state.mealMains;
    const fixedSnacks=patch.fixedSnacks??(mode!==state.mealMode?[]:state.fixedSnacks);
    const config={...simpleConfig(),...patch,mealMode:mode,mains,fixedSnacks,people:patch.people??Number($('people').value)};
    P.buildSimple(config); // Validate the whole proposed state before touching controls.
    const mapping={people:'people',budget:'budget',budgetType:'budget-type',pizzaSize:'pizza-size',flavorKinds:'flavor-kinds',flavorTag:'flavor-tag',channel:'channel',orderMethod:'order-method',paymentMethod:'payment-method',drinkPreference:'drink-preference',brandScope:'brand-scope',appetite:'appetite',at:'at'};
    for(const [key,id] of Object.entries(mapping))if(patch[key]!==undefined)$(id).value=String(patch[key]);
    state.mealMode=mode;state.mains=P.normalizeMains({mealMode:mode,mains});if(mode==='meal')state.mealMains=[...state.mains];
    state.fixedSnacks=[...fixedSnacks];if(patch.richness)state.richness=patch.richness;
    if(patch.drinks!==undefined)$('drinks').checked=patch.drinks;else if(patch.drinkPreference)$('drinks').checked=true;
    orderingUI();state.manual=false;regenerate(true);if(patch.explicitDemand){state.demand={...state.demand,...patch.explicitDemand};state.manual=true;renderDemand();renderSummary();}
    renderChoices();renderSnackGroups();feeUI();markDirty();
    const box=$('text-preview');box.replaceChildren(h('p',{class:'applied-note'},'已填入 '+$('people').value+' 人・'+(mode==='snack'?'下午茶／點心':'正餐')+'，可以直接調整下方選項。'));
    for(const warning of parsed.warnings||[])box.append(h('p',{class:'warning-text'},warning));box.hidden=false;
  }
  function setMealMode(mode){
    if(mode===state.mealMode)return;
    if(state.mealMode==='meal')state.mealMains=[...state.mains];
    state.mealMode=mode;state.mains=mode==='snack'?[]:[...state.mealMains];state.fixedSnacks=[];state.richness='normal';state.manual=false;
    $('drinks').checked=mode==='snack';regenerate(true);renderChoices();renderSnackGroups();feeUI();markDirty();
  }
  const savedIds=['people','budget','budget-type','appetite','brand-scope','pizza-size','flavor-kinds','flavor-tag','small-cuts','large-cuts','drinks','drink-preference','order-method','payment-method','member','cross-brand','meal-replacement','channel','max-orders'];
  function save(){try{const values={};for(const id of savedIds)values[id]=$(id).type==='checkbox'?$(id).checked:$(id).value;localStorage.setItem('feast-simple-v6',JSON.stringify({values,mealMode:state.mealMode,mealMains:state.mealMains,mains:state.mains,richness:state.richness,fixedSnacks:state.fixedSnacks,manual:state.manual,demand:state.demand}));}catch{}}
  function restore(){try{const current=localStorage.getItem('feast-simple-v6'),s=JSON.parse(current||localStorage.getItem('feast-simple-v5')||localStorage.getItem('feast-simple-v4')||localStorage.getItem('feast-simple-v3'));if(!s)return;for(const id of savedIds)if((current||id!=='order-method')&&s.values?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=Boolean(s.values[id]);else $(id).value=String(s.values[id]);}state.mealMode=s.mealMode==='snack'?'snack':'meal';state.mains=P.normalizeMains({...s,mealMode:state.mealMode});state.mealMains=s.mealMains?.length?s.mealMains:state.mealMode==='meal'?[...state.mains]:['pizza','chicken'];if(P.RICHNESS[s.richness])state.richness=s.richness;state.fixedSnacks=(s.fixedSnacks||[]).filter(k=>P.SNACK_META[k]);if(s.manual&&Object.entries(s.demand||{}).every(([k,n])=>I[k]&&Number.isInteger(n)&&n>=0&&n<=60)){state.manual=true;state.demand={...s.demand};if(!current&&s.family==='burger'&&state.demand.individual){state.demand.burgerMain=state.demand.individual;delete state.demand.individual;}if(!current&&s.values?.drinks&&!state.demand.drinkServing){state.demand.drinkServing=state.demand.drinkSmall||Number($('people').value);delete state.demand.drinkSmall;}}}catch{}}

  function h(tag,attrs={},...children){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v===null||v===undefined)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='checked')e.checked=v;else e.setAttribute(k,v);}for(const c of children.flat(Infinity))if(c!==null&&c!==undefined)e.append(c instanceof Node?c:document.createTextNode(String(c)));return e;}
  function safeLink(url,text,cls='source-link'){try{const u=new URL(url);if(u.protocol!=='https:'||!['info.talk.tw','www.callingtaiwan.com.tw','winedays.github.io','www.kfcclub.com.tw','www.pizzahut.com.tw','kfcoosfs.kfcclub.com.tw'].includes(u.hostname)&&!(u.hostname==='github.com'&&(u.pathname.startsWith('/ntut-justintsai-grad/JoCheap/')||u.pathname.startsWith('/Winedays/KCouper/'))))return h('span',{},text+'（無可用連結）');return h('a',{href:u.href,target:'_blank',rel:'noopener noreferrer',class:cls},text);}catch{return h('span',{},text+'（無可用連結）');}}
  function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function setGroup(key,value){document.querySelectorAll('[data-'+key+']').forEach(b=>{const yes=b.dataset[key]===value;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});}
  function renderMainPortions(){
    $('main-portion-list').replaceChildren(...(state.built?.mainAllocation||[]).map(m=>h('label',{class:'main-portion-row'},h('span',{},I[m.item].name),h('span',{class:'main-quantity'},h('input',{type:'number',min:1,max:60,value:state.demand[m.item]??0,'data-main-quantity':m.item,'aria-label':I[m.item].name+'最低數量'}),I[m.item].unit))));
  }
  function renderDemand(){const box=$('demand-list');box.replaceChildren();for(const [id,n] of Object.entries(state.demand)){if(!I[id]||id==='snackPortions')continue;box.append(h('div',{class:'demand-row'},h('span',{class:'item-emoji','aria-hidden':'true'},I[id].emoji),h('span',{class:'item-name'},I[id].name,id==='burgerMain'?h('small',{},'一般漢堡；小漢堡不抵這項需求'):null),h('div',{class:'stepper'},h('button',{type:'button','data-item':id,'data-delta':-1,'aria-label':'減少'+I[id].name},'−'),h('input',{type:'number',value:n,min:0,max:60,'data-quantity':id,'aria-label':I[id].name+'數量'}),h('button',{type:'button','data-item':id,'data-delta':1,'aria-label':'增加'+I[id].name},'＋')),h('button',{type:'button',class:'remove-item','data-remove':id,'aria-label':'移除'+I[id].name},'×')));}renderMainPortions();}
  function formatItems(items){return Object.entries(items).filter(([k,n])=>I[k]&&n>0&&!['individual','snackPortions'].includes(k)).map(([k,n])=>`${I[k].name} ${n} ${I[k].unit}`).join('＋');}
  function trustUI(){
    const data=snapshots[state.mode],now=Date.now(),checked=data.offers.filter(o=>F.verificationCheck(o,now).allowed).length;
    const versions=F.planningOffers(data,{dataScope:'all'},now),priced=new Set(versions.filter(o=>F.recommendationCheck(data,o,now).allowed).map(o=>o.id)).size;
    $('trust-summary').hidden=true;
    $('trust-summary').textContent=`收錄 ${data.offers.length} 個優惠碼，${priced} 個有可計價版本（依日期與資格再篩選）。肯德基基本組合採官方 API 餐點說明；必勝客以外部來源搭配官方查碼配對。${checked?checked+' 張另有仍適用的官方基本配置核對。':''}來源不同的版本分開計算，不混合餐點與價格。`;
    return {checked,priced};
  }
  function sourceUI(){
    const data=snapshots[state.mode],counts=trustUI();
    $('offer-count').textContent=data.offers.length;$('dataset-label').textContent=state.mode==='demo'?'合成示範・不能兌換':'每週更新・全來源估算';$('snapshot-date').textContent=(state.mode==='demo'?'範例資料':'資料讀取 ')+dateTime(data.generatedAt);$('demo-notice').hidden=state.mode!=='demo';
    const div=$('source-content');div.replaceChildren(h('p',{class:'dialog-note'},state.mode==='demo'?'合成資料供測試與體驗，不能兌換。':'所有優惠碼均納入搜尋；有完整餐點及確定價格的來源版本均可估算。官方核對是額外標示，不是預設的推薦門檻。來源有差異的券會顯示各版本，缺價或未完整辨識的部分保留原文。'));
    div.append(h('p',{class:'dialog-note'},`收錄 ${data.offers.length} 個品牌／優惠碼；${counts.priced} 個有可計價版本，${counts.checked} 張另有適用中的官方基本配置核對。可實際配餐數量還會依時間、品牌、通路及資格篩選。`));
    div.append(h('p',{class:'dialog-note'},'肯德基以 KCouper 發現優惠碼與商品代碼，每週直接查詢官方 API。基本餐點以官方餐點說明（Intro）為主，套餐價格採官方說明所載金額，包含餐內飲料等品項。點餐預設選項不覆蓋原組合；明細不同時分開顯示，未確認的替換不加入計價。參考門市為台北雙連店，售罄快照不代表其他門市供應情況。'),safeLink('https://github.com/Winedays/KCouper/blob/master/script/gatherer/coupon.py','KCouper 抓取與換算程式'));
    div.append(h('p',{class:'dialog-note'},'本站每週日 08:17（台北）更新優惠碼與官方餐點說明。查詢失敗沿用上次成功的官方說明及時間；尚未取得說明的券保留查詢，等待重查。'));
    div.append(h('p',{class:'dialog-note'},'必勝客保留好康情報誌與 Calling Taiwan 的餐點、價目與條件，並將每個優惠碼配對至官方查碼回傳的商品 ID。查碼成功不代表餐點、價格及升級差額已經官方核對。官方不接受的碼保留查詢原文，但不參與配餐；查詢錯誤另標待確認，不冒充無效券。'),safeLink('https://github.com/ntut-justintsai-grad/JoCheap/blob/main/docs/pizzahut-api.md','必勝客 API 實測結果'));
    if(data.kfcDescriptions){const k=data.kfcDescriptions;div.append(h('p',{class:'dialog-note'},`肯德基共 ${k.total} 個碼：${k.parseStatus?.estimate||0} 個已依官方說明建立基本組合，${k.parseStatus?.pending||0} 個保留原文待確認。官方讀取成功 ${k.byStatus?.success||0} 個；本次查詢待確認 ${k.byStatus?.error||0} 個，其中 ${k.retainedSuccessful||0} 個沿用上次成功說明。`));}
    if(data.pizzahutLookup){const lookup=data.pizzahutLookup;div.append(h('p',{class:'dialog-note'},`必勝客查碼 ${lookup.total} 個：本次配對 ${lookup.byStatus?.matched||0} 個、官方不接受 ${lookup.byStatus?.invalid||0} 個、查詢待確認 ${lookup.byStatus?.error||0} 個；${lookup.retainedSuccessful||0} 個沿用上次成功查詢紀錄。每週與來源更新一起重新查碼。`));}
    for(const source of data.sources||[])div.append(h('div',{class:'source-block'},h('strong',{},brandName(source.brand)+'・'+source.sourcePublisher),h('p',{},'最後成功讀取：'+dateTime(source.lastSuccessAt)+'（台北）'),h('p',{},`擷取 ${source.parsedCount??'—'} 列・${source.status}`),h('p',{},source.errorSummary||'來源原文與版本差異保留供查核。'),safeLink(source.sourceUrl,'查看公開來源')));
    div.append(safeLink('https://github.com/ntut-justintsai-grad/JoCheap/blob/main/data/quality_report.json','完整資料稽核紀錄'),h('p',{class:'dialog-note'},'估算未確認的限購、門市供應與分筆購買需於使用前核對；已知不符條件仍會排除。週更新失敗保留前次資料與原讀取時間，不改成空資料。'));
  }
  function orderUsable(order,r){
    const data=snapshots[state.mode],o=F.planningOffers(data,r,Date.now()).find(o=>o.id===order.offerId&&(o.sourceVersionKey||null)===(order.sourceVersionKey||null));
    return o&&F.recommendationCheck(data,o,Date.now(),r).allowed&&F.isActive(o,Date.parse(r.at))!==false;
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
    if(orders.some(o=>!orderUsable(o,state.lastRequest)))search();
    const ages=data.offers.map(o=>Date.now()-Date.parse(o.provenance.fetchedAt));
    if(ages.some(age=>!Number.isFinite(age)||age>8*24*3600000))$('snapshot-date').textContent='來源讀取 '+dateTime(data.generatedAt)+'・含較舊查詢資料';
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
  function routeName(o,r){return F.ORDER_METHODS[o.orderMethod||r.orderMethod]?.name||'官方網站';}
  function planText(p){
    const r=p.effectiveRequest||state.lastRequest;
    if(state.mode!=='demo'&&p.orders.some(o=>!orderUsable(o,r)))return '餐點資料已變更，請重新試算。';
    const lines=['【揪省購買清單】',`${r.people} 人・${({takeaway:'外帶',delivery:'官方外送',dinein:'內用'}[r.channel])}`,p.totalCost===null?'餐點小計 '+money(p.knownSubtotal)+'（外送等費用另計）':'合計 '+money(p.totalCost),''];
    if(p.substitution)lines.push('替代方案：',...(p.adjustments||[]),'');
    if(p.requiredMaxOrders)lines.push('完整滿足原需求需分 '+p.requiredMaxOrders+' 筆購買（原上限 '+state.lastRequest.maxOrders+' 筆）','');
    if(p.partial)lines.push('還缺：'+shortageText(p),'');
    if(p.overBudget)lines.push('超出原預算 '+money(p.totalCost-state.lastRequest.budgetMinor),'');
    for(const [i,o] of p.orders.entries()){
      lines.push(`${i+1}. ${brandName(o.brand)} ${money(o.base)}`,formatItems(o.items),'優惠碼：'+o.code,'下單：'+routeName(o,r)+(o.paymentMethod==='online'?'・線上付款':''));
      if(o.beverages?.length)lines.push('飲料：'+o.beverages.map(d=>d.name+' × '+d.quantity).join('、'));
      if(o.optionChoices?.some(c=>c.surchargeMinor))lines.push('替換：'+o.optionChoices.filter(c=>c.surchargeMinor).map(c=>c.name+'（加 '+money(c.surchargeMinor)+'）').join('、'));
      if(o.pizzaChoices?.length)lines.push('口味：'+o.pizzaChoices.map(c=>c.name).join('、'));
      if(o.orderingStatus==='unknown')lines.push('此碼的適用下單管道需於點餐確認。');
      if(o.officialMeal?.soldOut===true)lines.push(o.officialMeal.shopName+'於資料查詢時售罄，請確認取餐門市供應。');
      if(state.mode!=='demo')lines.push(o.officialUrl);lines.push('');
    }
    lines.push('價格與供應以點餐時為準。');return lines.join('\n');
  }
  async function copy(text){try{if(!navigator.clipboard)throw Error('no clipboard');await navigator.clipboard.writeText(text);toast('已複製，貼到群組就能一起討論。');}catch{$('copy-text').value=text;$('copy-dialog').showModal();$('copy-text').focus();$('copy-text').select();}}
  function kfcProof(o){
    const m=o.officialMeal;
    const box=h('div',{class:'lookup-proof'},h('strong',{},'依官方餐點說明計算'),h('p',{},m.intro),h('p',{class:'helper'},'官方讀取 '+dateTime(m.checkedAt)+'（台北）；參考門市：'+m.shopName));
    if(m.soldOut===true)box.append(h('p',{class:'warning-text'},m.shopName+'於查詢當下回報售罄；其他門市未核對，本配置僅供估算。'));
    if(m.orderingDiffers)box.append(h('p',{class:'helper'},'點餐明細與說明未能完整配對；本組合採官方說明，未自動改成替代餐點。'));
    if(m.status==='error')box.append(h('p',{class:'warning-text'},'本次官方查詢失敗，沿用上次說明。'));
    return box;
  }
  function lookupProof(o){
    if(o.brand!=='PH'||!o.couponLookup)return null;
    const pair=F.couponLookupCheck(o),box=h('div',{class:'lookup-proof'},h('strong',{},pair.label));
    if(pair.productId)box.append(h('p',{class:'helper'},'官方商品 ID：'+pair.productId+'；查碼 '+dateTime(pair.checkedAt)+'（台北）'));
    box.append(h('p',{class:'helper'},'優惠碼與商品已配對；餐點、價目與升級差額仍依列出的外部來源估算。'));
    if(pair.detailUrl)box.append(safeLink(pair.detailUrl,'查看官方配對套餐'));
    return box;
  }
  function planCard(p,index){
    const r=p.effectiveRequest||state.lastRequest,isDemo=state.mode==='demo';
    const card=h('article',{class:'plan-card'+(index===0?' best':'')});
    const body=h('div',{class:'plan-body'}),title=p.priceReference?'完整滿足原需求':p.substitution?'接近原需求的搭配':p.partial?'先配到這些':p.overBudget?'多一點預算就能湊齊':'這份，可以這樣買';
    body.append(h('div',{class:'plan-price-row'},h('div',{},h('h3',{},title),h('div',{class:'price'},h('small',{},p.totalCost===null?'餐點 NT$':'NT$'),((p.totalCost??p.knownSubtotal)/100).toLocaleString('zh-TW')),h('p',{class:'per-person'},p.totalCost===null?'外送等額外費用另計':`每人約 ${money(Math.ceil(p.totalCost/r.people))}`)),h('span',{class:'chip'},(p.brandCount>1?'兩家混搭':'只買'+brandName(p.orders[0].brand))+'・'+p.orders.length+' 筆購買')));
    if(p.partial)body.append(h('p',{class:'shortfall-notice'},'還缺：'+shortageText(p)));
    if(p.substitution)body.append(h('div',{class:'shortfall-notice'},h('strong',{},'這份有調整'),h('ul',{},(p.adjustments||[]).map(x=>h('li',{},x)))));
    if(p.overBudget)body.append(h('p',{class:'shortfall-notice'},'超出預算 '+money(p.totalCost-state.lastRequest.budgetMinor)));
    if(p.requiredMaxOrders)body.append(h('p',{class:'shortfall-notice'},'需分 '+p.requiredMaxOrders+' 筆購買；你目前設定最多 '+state.lastRequest.maxOrders+' 筆。'));
    for(const [i,o] of p.orders.entries()){
      const row=h('div',{class:'order-row'},h('div',{class:'order-title'},h('span',{class:'brand-dot'+(o.brand==='PH'?' ph':'')},o.brand==='KFC'?'KFC':'PH'),h('strong',{},brandName(o.brand)),h('span',{},money(o.base))),h('p',{class:'order-items'},formatItems(o.items)));
      if(o.beverages?.length)row.append(h('p',{class:'order-choice'},o.beverages.map(d=>d.name+' × '+d.quantity).join('、')));
      if(o.pizzaChoices?.length)row.append(h('p',{class:'pizza-choice'},o.pizzaChoices.map(x=>x.name).join('、')));
      if(o.optionChoices?.some(c=>c.from!==c.name))row.append(h('p',{class:'order-choice'},'已選：'+o.optionChoices.filter(c=>c.from!==c.name).map(c=>c.name+(c.surchargeMinor?'（加 '+money(c.surchargeMinor)+'）':'')).join('、')));
      const guide=h('div',{class:'checkout-guide'},h('span',{class:'step-label'},'第 '+(i+1)+' 步・'+routeName(o,r)),h('p',{},'使用優惠碼 '+o.code+'・'+({takeaway:'外帶取餐',delivery:'官方外送',dinein:'店內用餐'}[r.channel])+(o.paymentMethod==='online'?'・線上付款':'')));
      const actions=h('div',{class:'order-actions'},h('button',{type:'button',class:'code-button',onclick:()=>copy(o.code),'aria-label':'複製優惠碼 '+o.code},'複製 '+o.code));
      if(!isDemo)actions.append(safeLink(o.officialUrl,o.orderMethod==='official_web'?'前往官方訂餐':'查看優惠','outline-button'));
      guide.append(actions);row.append(guide);
      if(o.orderingStatus==='unknown')row.append(h('p',{class:'helper'},'適用下單管道請於點餐確認。'));
      if(o.officialMeal?.soldOut===true)row.append(h('p',{class:'availability-note'},o.officialMeal.shopName+'曾回報售罄，請先確認取餐門市供應。'));
      const detail=h('details',{class:'minor-details'},h('summary',{},'餐點與使用細節'));
      if(o.mainDescription)detail.append(h('p',{},o.mainDescription));
      if(o.surchargeMinor)detail.append(h('p',{},'基本餐 '+money(o.mealBase)+'＋替換 '+money(o.surchargeMinor)));
      for(const note of o.conditions||[])detail.append(h('p',{class:'helper'},note));
      if(!isDemo)detail.append(safeLink(o.sourceUrl,'資料記錄'));row.append(detail);body.append(row);
    }
    if(Object.keys(p.extras||{}).length)body.append(h('details',{class:'minor-details'},h('summary',{},'另外得到的餐點'),h('p',{},formatItems(p.extras))));
    body.append(h('button',{type:'button',class:'primary-button full',onclick:()=>copy(planText(p))},'複製整份購買清單'),h('p',{class:'form-footnote'},isDemo?'示範資料，不能兌換。':'價格與供應以點餐時為準。'));
    card.append(body);return card;
  }
  function renderResults(){
    const x=state.result,r=state.lastRequest,box=$('results');box.replaceChildren();
    if(!x.searchComplete)box.append(h('div',{class:'notice'},'已達搜尋上限，以下是目前找到的方案，可先比較這幾份組合。'));
    let choices=[...x.plans],extra=[];
    if(x.plans.length){
      extra=x.more.filter(p=>!choices.some(q=>q.id===p.id));
      if(state.showMore)choices.push(...extra.map(p=>({...p,label:'更多餐點配置',searchComplete:x.searchComplete})));
      if(choices.length===1)box.append(h('p',{class:'recommendation-note'},'目前找到 1 份符合的組合。'));
    }else{
      const full=x.fullQuote;
      const near=(x.suggestions||[]).filter(p=>!full||p.id!==full.id);
      const partials=(x.partials||[]).filter(p=>!near.some(q=>q.id===p.id)&&(!full||p.id!==full.id)).slice(0,2);
      choices=[...(full?[full]:[]),...near,...partials];
      if(full){
        const summary=h('div',{class:'full-quote-summary'},h('strong',{},'照原需求湊齊'),h('div',{class:'quote-total'},full.totalCost===null?'餐點小計 '+money(full.knownSubtotal):money(full.totalCost)));
        if(r.budgetMinor!==null&&full.totalCost!==null)summary.append(h('p',{},'目前預算 '+money(r.budgetMinor)+'・'+(full.budgetGapMinor?'還差 '+money(full.budgetGapMinor):'預算足夠')));
        if(full.requiredMaxOrders)summary.append(h('p',{},'需分 '+full.requiredMaxOrders+' 筆購買（目前上限 '+r.maxOrders+' 筆）'));
        if(full.totalCost===null)summary.append(h('p',{},'外送等額外費用尚未填齊，還不能確認完整總額。'));
        else if(!full.searchComplete)summary.append(h('small',{},'這是目前找到的完整報價，還未確認最低價。'));
        box.append(summary);
      }else{
        const reason=x.quoteUnavailable;
        const detail=reason?.reason==='missing_items'?'目前條件下沒有可用優惠提供：'+reason.missingItems.map(m=>I[m.id].name).join('、')+'，暫時無法報出完整總價。':reason?.reason==='search_limit'?'完整組合尚未搜尋完成，暫時無法確認湊齊的總價。':'目前優惠的限購、口味或下單條件尚無法滿足全部需求，增加預算也未必能解決。';
        box.append(h('div',{class:'state-card'},h('h3',{},'完整需求尚未湊齊'),h('p',{},detail)));
      }
    }
    $('result-count').textContent=choices.length?`${choices.length} 個可比較配置`:'';
    if(x.unpricedAlternative){
      const menu=x.unpricedAlternative;box.append(h('article',{class:'plan-card'},h('div',{class:'plan-body'},h('h3',{},menu.label),h('p',{class:'recommendation-note'},menu.note),h('p',{},Object.entries(menu.items).filter(([id,n])=>I[id]&&n>0).map(([id,n])=>`${I[id].name} ${n} ${I[id].unit}`).join('＋')),h('p',{class:'shortfall-notice'},'價格請至官方菜單確認。'),h('div',{class:'plan-actions'},safeLink('https://www.kfcclub.com.tw/coupon','前往肯德基確認菜單'),safeLink('https://www.pizzahut.com.tw/','前往必勝客確認菜單')))));
    }
    if(choices.some(p=>p.unknownCosts))box.append(h('div',{class:'notice'},'額外費用未知，僅顯示已知餐點小計，尚不能確認符合預算。'));
    if(choices.length){
      state.activePlan=Math.min(state.activePlan,choices.length-1);
      box.append(h('p',{class:'recommendation-note'},'選一份想要的搭配'));
      const picker=h('div',{class:'recommendation-picker','aria-label':'比較餐點配置'});
      choices.forEach((p,i)=>{
        const price=p.totalCost===null?'餐點小計 '+money(p.knownSubtotal):money(p.totalCost);
        picker.append(h('button',{type:'button',class:'recommendation-option','aria-pressed':String(i===state.activePlan),'data-plan-choice':i,onclick:()=>{state.activePlan=i;renderResults();document.querySelector(`[data-plan-choice="${i}"]`).focus({preventScroll:true});}},h('strong',{},p.priceReference?'原需求・完整報價':p.partial?'原餐點・未湊齊':p.overBudget?(p.substitution?'換餐點・超出預算':'原餐點・超出預算'):p.substitution?p.label:'方案 '+(i+1)),h('span',{class:'recommendation-price'},price),h('small',{},(p.brandCount>1?'兩家混搭':'只買'+brandName(p.orders[0].brand))+'・'+p.orders.length+' 筆購買'),p.overBudget?h('small',{},'多 '+money(p.totalCost-r.budgetMinor)):p.partial?h('small',{},'缺 '+shortageText(p)):null));
      });
      box.append(picker,planCard(choices[state.activePlan],state.activePlan));
      const selected=choices[state.activePlan];
      if(selected.overBudget||selected.requiredMaxOrders)box.append(h('button',{type:'button',class:'outline-button full',onclick:()=>{if(selected.totalCost!==null){$('budget-type').value='total';$('budget').value=selected.totalCost/100;}if(selected.requiredMaxOrders)$('max-orders').value=String(selected.requiredMaxOrders);feeUI();markDirty();search();}},selected.requiredMaxOrders?'改為最多 '+selected.requiredMaxOrders+' 筆'+(selected.totalCost!==null?'、預算 '+money(selected.totalCost):'')+' 再試算':'將整團預算調為 '+money(selected.totalCost)+' 再試算'));
      if(extra.length&&!state.showMore)box.append(h('button',{type:'button',class:'outline-button more-button',onclick:()=>{state.showMore=true;renderResults();}},'再看其他搭配'));
    }
    if(!x.plans.length&&!r.allowMealReplacement)box.append(h('button',{type:'button',class:'outline-button full',onclick:()=>{$('meal-replacement').checked=true;search();}},'也看看更換餐點的方案'));
    $('search-meta').textContent=`從 ${x.candidateCount} 個可用優惠選項重新計算・探索 ${x.states.toLocaleString()} 個狀態・${x.elapsedMs} ms・${x.searchComplete?'完整組合搜尋完成':'搜尋未完成'}。${x.excluded.length} 筆因條件或資料不足未參與。${state.mode==='real'?'依本次資料範圍及各來源版本估算；門市供應與結帳接受情況仍需確認。':''}`;
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
  restore();orderingUI();regenerate();renderChoices();renderSnackGroups();feeUI();sourceUI();researchUI();initIntent();refreshAge();setInterval(refreshAge,60000);
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  $('main-choices').addEventListener('click',e=>{const b=e.target.closest('[data-main]');if(!b)return;const id=b.dataset.main;if(state.mains.includes(id)&&state.mains.length===1){toast('至少保留一種主餐；可先選另一種，再取消這一種。');return;}state.mains=state.mains.includes(id)?state.mains.filter(k=>k!==id):[...state.mains,id];state.mealMains=[...state.mains];state.manual=false;$('drinks').checked=state.mains.some(k=>['burger','wrapped','pasta'].includes(k));regenerate(true);renderChoices();feeUI();markDirty();});
  document.querySelectorAll('[data-meal-mode]').forEach(b=>b.addEventListener('click',()=>setMealMode(b.dataset.mealMode)));
  $('tea-snack-choices').addEventListener('click',e=>{const b=e.target.closest('[data-tea-snack]');if(!b)return;const id=b.dataset.teaSnack;state.fixedSnacks=id==='any'?[]:state.fixedSnacks.includes(id)?state.fixedSnacks.filter(x=>x!==id):[...state.fixedSnacks,id];state.richness=state.fixedSnacks.length?'none':'normal';state.manual=false;regenerate(true);renderChoices();renderSnackGroups();markDirty();});
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
  $('planner-form').addEventListener('change',e=>{if(e.target.id==='drink-preference')$('drinks').checked=true;if(['drinks','drink-preference'].includes(e.target.id)&&state.manual){if($('drinks').checked)state.demand.drinkServing=Number($('people').value);else delete state.demand.drinkServing;}if(regenerateIds.includes(e.target.id)){regenerate(e.target.id==='pizza-size');renderChoices();}if(e.target.id==='order-method')orderingUI();if(['people','channel','max-orders','order-method'].includes(e.target.id))feeUI();if(e.target.id!=='meal-text')markDirty();});
  $('planner-form').addEventListener('input',e=>{if(['budget','people'].includes(e.target.id)){if(e.target.id==='people')regenerate();markDirty();}else if(e.target.dataset.feeBrand)markDirty();});
  $('planner-form').addEventListener('submit',e=>{e.preventDefault();search();});
  $('cancel-search').addEventListener('click',()=>{stop();state.result=null;showState('這次試算已取消','需求已保留。');});
  $('interpret-text').addEventListener('click',interpretText);
  $('meal-text').addEventListener('input',()=>{state.intentRun++;state.intentAbort?.abort();state.parsed=null;$('text-preview').hidden=true;$('interpret-text').disabled=false;$('interpret-text').textContent='幫我填好';});
  $('text-example').addEventListener('click',()=>{$('meal-text').value='四人下午茶，每人 100，想吃蛋撻和雞塊，外帶';interpretText();});
  $('quick-example').addEventListener('click',()=>{setMealMode('snack');$('people').value=4;$('budget').value='100';$('budget-type').value='person';state.fixedSnacks=['tart','nuggets'];state.richness='none';$('brand-scope').value='all';$('channel').value='takeaway';$('drinks').checked=false;state.manual=false;regenerate(true);renderChoices();renderSnackGroups();feeUI();search();});
  $('data-mode').addEventListener('change',()=>{stop();state.mode=$('data-mode').value;state.result=null;sourceUI();refreshAge();renderSnackGroups();browse();$('request-summary').hidden=true;$('dirty-notice').hidden=true;$('search-meta').textContent='';$('result-count').textContent='';$('search-button').firstElementChild.textContent=state.mode==='demo'?'用示範資料試算':'比較優惠組合';showState(state.mode==='demo'?'已切換至合成示範':'已切換至全來源估算','需求已保留，請重新試算。');});
  ['browse-search','browse-brand','browse-category','browse-sort','browse-max','browse-active','browse-status'].forEach(id=>$(id).addEventListener('input',browse));
  $('clear-filters').addEventListener('click',()=>{$('browse-search').value='';$('browse-brand').value='all';$('browse-category').value='all';$('browse-sort').value='price';$('browse-max').value='';$('browse-status').value='all';$('browse-active').checked=true;browse();});
  for(const id of ['source-button'])$(id).addEventListener('click',()=>{sourceUI();$('source-dialog').showModal();});
  $('close-source').addEventListener('click',()=>$('source-dialog').close());$('close-copy').addEventListener('click',()=>$('copy-dialog').close());$('reload-data').addEventListener('click',()=>location.reload());
  $('clear-local').addEventListener('click',()=>{try{for(const key of ['feast-simple-v6','feast-simple-v5','feast-simple-v4','feast-simple-v3','feast-demand-v2','feast-demand-v1'])localStorage.removeItem(key);toast('已清除本機需求。');}catch{toast('目前無法使用本機儲存。');}});
})();
