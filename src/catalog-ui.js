(function(root){
 'use strict';let signature='',limit=24;
 function render(ctx){
  const {data,F,I,h,$,money,brandName,safeLink,onAdd,onCopy}=ctx;
  const q=$('browse-search').value.trim().toLowerCase(),brand=$('browse-brand').value,category=$('browse-category').value,rawMax=$('browse-max').value,max=rawMax===''?Infinity:Number(rawMax)*100;
  const key=JSON.stringify([data.datasetVersion,q,brand,category,rawMax,$('browse-active').checked,$('browse-sort').value]);if(key!==signature){signature=key;limit=24;}
  const format=items=>Object.entries(items||{}).filter(([k,n])=>I[k]&&n>0&&!['individual','snackPortions'].includes(k)).map(([k,n])=>`${I[k].name} ${n} ${I[k].unit}`).join('＋');
  const queryCategory=category==='all'&&q.includes('紙包雞')?'paperChicken':category;
  const rows=[...data.offers,...(data.menuOffers||[])].map(o=>F.catalogOffer(o)).map(o=>({o,choice:F.catalogChoice(o,queryCategory)})).filter(({o,choice})=>(brand==='all'||o.brand===brand)&&(!q||[o.title,o.code,o.rawText,...o.variants.map(v=>format(v.items))].join(' ').toLowerCase().includes(q))&&(queryCategory==='all'||choice)&&(!rawMax||(choice?.total??o.displayPriceMinor??Infinity)<=max)&&(!$('browse-active').checked||F.isActive(o,Date.now())!==false));
  const cost=row=>row.choice?.total??row.o.displayPriceMinor??Infinity;
  rows.sort((a,b)=>(F.recommendationCheck(data,b.o).allowed?1:0)-(F.recommendationCheck(data,a.o).allowed?1:0)||($('browse-sort').value==='price'?cost(a)-cost(b):(a.o.validity?.validWindows?.[0]?.toExclusive||'9999').localeCompare(b.o.validity?.validWindows?.[0]?.toExclusive||'9999'))||a.o.id.localeCompare(b.o.id));
  $('browse-summary').textContent=rows.length+' 個優惠';$('browse-grid').replaceChildren();
  for(const {o,choice} of rows.slice(0,limit)){
   const check=F.recommendationCheck(data,o),eligible=check.allowed&&!F.mealIdentityIssue(o),pair=o.brand==='PH'?F.couponLookupCheck(o):null;
   let base=choice?.base||o.variants[0],selected=choice?.selected||base,selections=choice?.selections||{};
   const card=h('article',{class:'coupon-card'},h('span',{class:'muted'},brandName(o.brand)+'・'+(o.kind==='direct_menu'?'官方單點':o.code)),h('h3',{},o.title.replace(new RegExp('^'+o.code+'[-－ ]*'),'')));
   if(!eligible)card.append(h('span',{class:'coupon-status'},pair?.status==='invalid'?'目前無法使用':'內容待確認'));
   const detailContents=h('p',{class:'coupon-selected-contents'});
   const price=h('div',{class:'coupon-price'}),contents=h('p',{class:'coupon-contents'}),drinks=h('p',{class:'helper'}),options=h('div');card.append(price,contents,drinks,options);
   const update=()=>{
    selected=base?F.applyOptions(base,selections,new Date().toISOString()):null;
    const total=selected&&Number.isFinite(selected.priceMinor)?selected.priceMinor+(selected.surchargeMinor||0):null;
    price.textContent=total===null?'價格待確認':money(total)+(o.priceType==='from'?' 起':'');
    contents.textContent=selected?format(selected.items):o.rawText||'餐點內容待確認';
    detailContents.textContent=selected?'目前選擇：'+format(selected.items):o.rawText||'餐點內容待確認';
    drinks.textContent=selected?.beverages?.map(d=>d.name+' × '+d.quantity).join('、')||'';drinks.hidden=!drinks.textContent;
   };
   const renderOptions=()=>{
    options.replaceChildren();if(!base?.optionGroups?.length)return;
    const detail=h('details',{class:'coupon-options'},h('summary',{},'更換飲料或餐點'));
    for(const g of base.optionGroups)for(let unit=0;unit<g.count;unit++){
     const select=h('select',{'aria-label':o.code+' '+g.label+'第 '+(unit+1)+' 份選項'});
     g.options.forEach((option,i)=>select.append(h('option',{value:i},option.name+(option.surchargeMinor?'（加 '+money(option.surchargeMinor)+'）':''))));select.value=String(selections[g.id]?.[unit]||0);
     select.addEventListener('change',()=>{selections[g.id]??=Array(g.count).fill(0);selections[g.id][unit]=Number(select.value);update();});detail.append(h('label',{class:'variant-label'},g.label+(g.count>1?' '+(unit+1):''),select));
    }
    options.append(detail);
   };
   if(o.variants.length>1){const select=h('select',{'aria-label':o.code+'套餐配置'});o.variants.forEach(v=>select.append(h('option',{value:v.id},v.choice||v.id)));select.value=base.id;select.addEventListener('change',()=>{base=o.variants.find(v=>v.id===select.value);selections={};renderOptions();update();});card.append(h('label',{class:'variant-label'},'餐點選擇',select));}
   if(o.eligibility?.memberRequired)card.append(h('p',{class:'helper'},'需會員資格'));
   const detail=h('details',{class:'coupon-options'},h('summary',{},'餐點與使用細節'));
   detail.append(detailContents);
   if(o.sourceMetadata?.officialMeal?.intro)detail.append(h('p',{},o.sourceMetadata.officialMeal.intro));else if(o.rawText)detail.append(h('p',{},o.rawText));if(o.reviewReason)detail.append(h('p',{class:'helper'},o.reviewReason));
   for(const c of F.couponTerms(o))detail.append(h('p',{class:'helper'},c));
   const end=o.validity?.validWindows?.[0]?.toExclusive;if(end&&o.kind!=='direct_menu')detail.append(h('p',{class:'helper'},'期限至 '+new Date(Date.parse(end+'T00:00:00+08:00')-86400000).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})));
   detail.append(safeLink(o.provenance.sourceUrl,'資料記錄'));card.append(detail);
   const actions=h('div',{class:'order-actions'});
   if(eligible&&base)actions.append(h('button',{type:'button',class:'outline-button',onclick:()=>onAdd(selected.items)},'加入配餐需求'));
   if(data.mode!=='demo')actions.append(h('button',{type:'button',class:'text-button',onclick:()=>onCopy([brandName(o.brand)+'・'+(o.kind==='direct_menu'?'官方單點':o.code),selected?format(selected.items):o.rawText,price.textContent,o.officialUrl].join('\n'))},o.kind==='direct_menu'?'複製餐點':'複製優惠碼與餐點'));
   if(eligible)actions.append(safeLink(o.officialUrl,'查看官方訂餐'));card.append(actions);renderOptions();update();$('browse-grid').append(card);
  }
  if(rows.length>limit)$('browse-grid').append(h('button',{type:'button',class:'outline-button browse-more',onclick:()=>{limit+=24;render(ctx);}},'再看 24 個優惠'));
  if(!rows.length)$('browse-grid').append(h('div',{class:'state-card'},h('h3',{},'沒有找到優惠'),h('p',{},'試試其他餐點或優惠碼。')));
 }
 root.CatalogUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);
