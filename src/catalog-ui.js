(function(root){
  'use strict';
  let signature='',limit=24;
  function render(ctx){
    const {data,F,I,h,$,money,brandName,safeLink,onAdd,onCopy}=ctx;
    const q=$('browse-search').value.trim().toLowerCase(),brand=$('browse-brand').value,category=$('browse-category').value,rawMax=$('browse-max').value,max=rawMax===''?Infinity:Number(rawMax)*100,status=$('browse-status').value;
    const key=JSON.stringify([data.datasetVersion,q,brand,category,rawMax,status,$('browse-active').checked,$('browse-sort').value]);if(key!==signature){signature=key;limit=24;}
    const price=o=>o.displayPriceMinor??Math.min(...o.variants.map(v=>v.priceMinor??Infinity));
    const format=items=>Object.entries(items).filter(([k,n])=>I[k]&&n>0).map(([k,n])=>`${I[k].name} ${n} ${I[k].unit}`).join('＋');
    const drinkText=beverages=>{const names=new Map();for(const b of beverages||[])names.set(b.name,(names.get(b.name)||0)+b.quantity);return [...names].map(([n,q])=>n+' × '+q).join('、');};
    const queryCategory=category==='all'&&q.includes('紙包雞')?'paperChicken':category;
    const choices=new Map(data.offers.map(o=>[o.id,F.catalogChoice(o,queryCategory)]));
    const identity=o=>F.mealIdentityIssue(o);
    const checked=o=>F.verificationCheck(o).allowed;
    const effectivePrice=o=>choices.get(o.id)?.total??price(o);
    const searchable=o=>[o.title,o.code,o.rawText||'',...o.variants.flatMap(v=>[format(v.items),...(v.optionGroups||[]).flatMap(g=>g.options.map(a=>a.name+' '+format(a.items)))])].join(' ').toLowerCase();
    let rows=data.offers.filter(o=>(brand==='all'||o.brand===brand)&&(status==='all'||(status==='official'?checked(o):(identity(o)?'pending':o.dataStatus)===status))&&(!q||searchable(o).includes(q))&&(rawMax===''||effectivePrice(o)<=max)&&(queryCategory==='all'||choices.get(o.id))&&(!$('browse-active').checked||F.isActive(o,Date.now())!==false));
    const rank=o=>checked(o)?0:o.dataStatus==='conflict'?3:o.dataStatus==='pending'||identity(o)?2:1;
    rows.sort((a,b)=>rank(a)-rank(b)||($('browse-sort').value==='price'?effectivePrice(a)-effectivePrice(b):(a.validity.validWindows[0]?.toExclusive||'9999').localeCompare(b.validity.validWindows[0]?.toExclusive||'9999'))||a.id.localeCompare(b.id));
    $('browse-summary').textContent=`找到 ${rows.length} / ${data.offers.length} 個優惠碼，先顯示 ${Math.min(limit,rows.length)} 個。未完成官方配置核對的券僅供查詢，不參與配餐；原文與解析問題保留供核對。`;
    $('browse-grid').replaceChildren();
    for(const o of rows.slice(0,limit)){
      const choice=choices.get(o.id),identityIssue=identity(o);
      let base=choice?.base||o.variants[0],selected=choice?.selected||base,selections=choice?.selections||{};
      const demo=data.mode==='demo',eligible=!identityIssue&&F.recommendationCheck(data,o).allowed&&o.priceType==='fixed',verification=o.verification;
      const card=h('article',{class:'coupon-card'+(o.dataStatus==='conflict'?' conflict':'')},h('span',{class:'coupon-status'},identityIssue?'品項矛盾・不參與計算':demo?'合成示範・不能兌換':checked(o)?'官方基本配置已核對':o.dataStatus==='conflict'?'來源衝突・僅供查詢':o.dataStatus==='pending'?'解析待確認・僅供查詢':'未完成官方核對・僅供查詢'),h('span',{class:'muted'},brandName(o.brand)+'・'+o.code),h('h3',{},o.title));
      const priceBox=h('div',{class:'coupon-price'}),contents=h('p',{class:'coupon-contents'}),costs=h('p',{class:'selection-cost'}),drinks=h('p',{class:'order-choice'}),options=h('div');card.append(priceBox);
      const update=()=>{
        selected=base&&!identityIssue?F.applyOptions(base,selections,new Date().toISOString()):null;
        const total=selected?selected.priceMinor===null?null:selected.priceMinor+(selected.surchargeMinor||0):Number.isFinite(price(o))?price(o):null;
        priceBox.textContent=identityIssue?'來源記載 '+money(price(o))+'・內容待確認':total===null?'價格待確認':money(total)+(o.priceType==='from'?' 起':'');
        contents.textContent=identityIssue?'優惠標題與來源預設餐點不一致，暫不提供可計價配置。':selected?format(selected.items):o.rawText||'內容待確認';
        if(selected?.mainDescription)contents.textContent+='；券面餐點：'+selected.mainDescription;
        costs.textContent=selected?`基本餐 ${money(selected.priceMinor||0)}＋本次替換 ${money(selected.surchargeMinor||0)}`+(selected.optionChoices?.filter(c=>c.from!==c.name).length?'；已選：'+selected.optionChoices.filter(c=>c.from!==c.name).map(c=>c.from+' → '+c.name).join('、'):''):'';
        drinks.textContent=selected?.beverages?.length?'本次飲料／湯：'+drinkText(selected.beverages):'';drinks.hidden=!drinks.textContent;
      };
      const renderOptions=()=>{
        options.replaceChildren();
        if(base?.optionGroups?.length&&!identityIssue){
          const detail=h('details',{class:'coupon-options'},h('summary',{},'挑選飲料與餐點替換・查看加價'));
          if(Object.values(selections).some(indices=>indices.some(i=>i!==0)))detail.open=true;
          detail.append(h('p',{class:'helper'},'每份分開選擇；差額只適用這張券，會加進本張券總額。'));
          for(const g of base.optionGroups)for(let unit=0;unit<g.count;unit++){
            const select=h('select',{'aria-label':o.code+' '+g.label+'第 '+(unit+1)+' 份選項'});
            g.options.forEach((option,i)=>select.append(h('option',{value:i},option.name+'・'+(option.surchargeMinor?'加 '+money(option.surchargeMinor):'同價'))));
            select.value=String(selections[g.id]?.[unit]||0);
            select.addEventListener('change',()=>{selections[g.id]??=Array(g.count).fill(0);selections[g.id][unit]=Number(select.value);update();});
            detail.append(h('label',{class:'variant-label'},g.label+(g.count>1?'・第 '+(unit+1)+' 份':''),select));
          }
          options.append(detail);
        }
      };
      if(o.variants.length>1){const select=h('select',{'aria-label':o.code+'套餐配置',class:'variant-select'});o.variants.forEach(v=>select.append(h('option',{value:v.id},v.choice||v.id)));select.value=base.id;select.addEventListener('change',()=>{base=o.variants.find(v=>v.id===select.value);selections={};renderOptions();update();});card.append(h('label',{class:'variant-label'},`套餐配置・${o.variants.length} 種`,select));}
      card.append(contents,drinks,costs,options);
      if(identityIssue||o.reviewReason)card.append(h('p',{class:'warning-text'},identityIssue||o.reviewReason));
      if(verification){
        const proof=h('div',{class:'verification-proof'},h('strong',{},checked(o)?'核對範圍：'+verification.scope.join('、'):'推薦資格：'+F.verificationCheck(o).reason));
        if(verification.checkedAt)proof.append(h('p',{class:'helper'},'查核者：'+(verification.reviewedBy||'未載明')+'；官方讀取 '+new Date(verification.checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'；本次適用至 '+new Date(verification.validUntil).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})));
        if(verification.sourceUrl)proof.append(safeLink(verification.sourceUrl,'官方優惠頁'));
        if(verification.imageUrl)proof.append(safeLink(verification.imageUrl,'核對的官方券面'));
        if(verification.evidencePath)proof.append(safeLink('https://github.com/ntut-justintsai-grad/JoCheap/blob/main/'+verification.evidencePath,'查核紀錄'));
        for(const note of verification.limitations||[])proof.append(h('p',{class:'helper'},note));
        card.append(proof);
      }
      const platforms=o.ordering?.platforms?.map(p=>F.ORDER_METHODS[p]?.name||'指定平台').join('／')||'下單方式待確認',channels=[...new Set(o.variants.flatMap(v=>v.channels))].map(c=>({takeaway:'外帶',delivery:'官方外送',dinein:'內用',unknown:'取餐方式待確認'}[c]||c)).join('／');
      const excluded=o.ordering?.excludedPlatforms?.map(p=>F.ORDER_METHODS[p]?.name||'指定平台').join('／');
      const orderingText='下單：'+platforms+'；取餐：'+(channels||'待確認')+(excluded?'；不適用：'+excluded:'')+(o.ordering?.onlinePaymentRequired?'；限線上付款':'')+(o.eligibility?.memberRequired?'；限會員':'')+(o.limits?.conservativeCap?'；本站本次每碼最多 1 次（保守設定）':o.limits?.maxUsesPerUserPerDay?'；每日每人限用 '+o.limits.maxUsesPerUserPerDay+' 次':'');
      card.append(h('p',{class:'helper'},orderingText));
      const ends=[...new Set(o.validity.validWindows.map(w=>w.toExclusive).filter(Boolean))];card.append(h('p',{class:'helper'},verification?.validUntil?'查核適用至 '+new Date(verification.validUntil).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'；券面效期未另行核對':ends.length?'來源記載效期至 '+ends.map(s=>new Date(Date.parse(s+'T00:00:00+08:00')-86400000).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})).join('、'):'效期未完整確認'));
      const evidence=h('details',{class:'coupon-options'},h('summary',{},`來源與限制（${o.observations?.length||1} 筆記載）`));
      for(const obs of o.observations||[{sourcePublisher:o.provenance.sourcePublisher,sourceUrl:o.provenance.sourceUrl,text:o.rawText||o.title,priceMinor:price(o)}]){
        const block=h('div',{class:'source-observation'},safeLink(obs.sourceUrl,obs.sourcePublisher),h('p',{},obs.text),h('p',{class:'helper'},Number.isFinite(obs.priceMinor)?money(obs.priceMinor):'價格未完整辨識'));
        if(obs.sourceItems)block.append(h('p',{class:'helper'},'來源預設餐點：'+obs.sourceItems.filter(i=>i.count>0).map(i=>i.name+' × '+i.count).join('＋')));
        for(const issue of obs.parseIssues||[])block.append(h('p',{class:'warning-text'},'解析提醒：'+issue));
        evidence.append(block);
      }
      for(const condition of o.conditions||[])evidence.append(h('p',{class:'helper'},condition));
      for(const review of o.ordering?.officialRestrictionEvidence||[])evidence.append(h('p',{class:'helper'},safeLink(review.sourceUrl,'官方限制查核'),`・${review.checkedAt} 查閱，${review.reviewBy} 前需複查；僅確認所述限制。`));
      card.append(evidence);
      if(eligible&&base)card.append(h('button',{type:'button',class:'outline-button',onclick:()=>{if(!F.recommendationCheck(data,o).allowed){render(ctx);return;}onAdd(selected.items);}},'把目前選項加入需求'));
      if(!demo)card.append(h('button',{type:'button',class:'text-button',onclick:()=>onCopy([`【${brandName(o.brand)} ${o.code}・${eligible?'官方基本配置已核對':'未完成核對，僅供查詢'}】`,o.title,selected?format(selected.items):o.rawText,selected?'飲料／湯：'+drinkText(selected.beverages):'',priceBox.textContent,selected?'替換差額：'+money(selected.surchargeMinor||0):'',orderingText,verification?.checkedAt?'官方讀取：'+verification.checkedAt:'',...(verification?.limitations||[]),...(o.ordering?.officialRestrictionEvidence||[]).map(r=>r.finding),verification?.sourceUrl||o.provenance.sourceUrl,'門市供應與結帳接受情況仍需向官方確認。'].filter(Boolean).join('\n'))},'複製優惠與目前選項'));
      renderOptions();update();$('browse-grid').append(card);
    }
    if(rows.length>limit)$('browse-grid').append(h('button',{type:'button',class:'outline-button browse-more',onclick:()=>{limit+=24;render(ctx);}},'再看 24 個優惠'));
    if(!rows.length)$('browse-grid').append(h('div',{class:'state-card browse-empty'},h('h3',{},'沒有符合篩選的優惠'),h('p',{},'可調整品牌、餐點、時間或資料狀態。')));
  }
  root.CatalogUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);
