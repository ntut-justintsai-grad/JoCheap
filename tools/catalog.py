"""Public coupon feeds: preserve observations, expand known choices, and quarantine conflicts."""
from datetime import datetime,timedelta
from hashlib import sha256
from itertools import combinations,product
import copy,json,re,unicodedata
from update_sources import Document,Node,blocks,table_grid,clean,parse_page
from food_parser import atomic,add,CATALOG,norm
from ordering_rules import parse_ordering
from data_quality import meal_issues

FEEDS=[
 dict(id='talk-kfc',brand='KFC',publisher='好康情報誌',url='https://info.talk.tw/kfc-coupon/',format='talk'),
 dict(id='talk-ph',brand='PH',publisher='好康情報誌',url='https://info.talk.tw/pizzahut-coupon/',format='talk'),
 dict(id='calling-kfc',brand='KFC',publisher='Calling Taiwan',url='https://www.callingtaiwan.com.tw/kfc-coupon-code/',format='calling'),
 dict(id='calling-ph',brand='PH',publisher='Calling Taiwan',url='https://www.callingtaiwan.com.tw/pizzahut-coupon-code/',format='calling'),
 dict(id='kcouper',brand='KFC',publisher='KCouper 公開資料',url='https://winedays.github.io/KCouper/coupon.js',format='kcouper'),
]

def windows(text):
    s=unicodedata.normalize('NFKC',text)
    dates=re.findall(r'(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?',s)
    out=[]
    try:
        parsed=list(dict.fromkeys(datetime(*map(int,d)).date() for d in dates))
        if not parsed:return []
        if len(parsed)==1:return [dict(from_=None,toExclusive=(parsed[0]+timedelta(days=1)).isoformat())]
        for i in range(0,len(parsed)-1,2):out.append(dict(from_=parsed[i].isoformat(),toExclusive=(parsed[i+1]+timedelta(days=1)).isoformat()))
    except ValueError:return []
    return out

def source_records(body,feed,stamp):
    if feed['format']=='kcouper':
        match=re.fullmatch(r'\s*window\.COUPON_DICT\s*=\s*([\s\S]*?)\s*;?\s*',body)
        if not match:raise ValueError('KCouper 格式改變，拒絕執行 JavaScript')
        raw=json.loads(match[1]);rows=[]
        for code,v in raw['coupon_by_code'].items():
            rows.append(dict(code=str(code),text=v['name'],priceMinor=round(v['price']*100),priceType='fixed',windows=[dict(from_=v['start_date'],toExclusive=(datetime.fromisoformat(v['end_date']).date()+timedelta(days=1)).isoformat())],structured=v,sourceUpdatedAt=raw.get('last_update')))
        return rows
    doc=Document(body);articles=doc.root.all({'article'}) or doc.root.all({'main'})
    if not articles:raise ValueError('主文邊界缺失')
    article=max(articles,key=lambda a:len(re.findall('優惠代[碼號]',a.text())))
    if feed['format']=='calling':
        rows=[]
        for table in article.all({'table'}):
            grid=table_grid(table)
            if not grid or not all(k in ''.join(grid[0]) for k in ['有效期限','優惠代碼','內容']):continue
            for row in grid[1:]:
                if len(row)<4:continue
                code=re.match(r'\s*([A-Za-z0-9-]+)',row[3]);price=re.search(r'(\d[\d,]*)\s*元',row[2])
                if not code:continue
                rows.append(dict(code=code[1],text=row[1],priceMinor=int(price[1].replace(',',''))*100 if price else None,priceType='from' if '起' in row[2] else 'fixed',windows=windows(row[0]),dateText=row[0]))
        if not rows:raise ValueError('找不到優惠清單表格')
        return rows
    rows=parse_page(body)
    for row in rows:
        row['termsText']=row['text']+' '+row.get('context','')
        s=unicodedata.normalize('NFKC',row['text'])
        if row['priceMinor'] is None:
            price=re.search(r'(?:優惠價(?:格)?[:：]?|=)\s*(?:特價|優惠價)?\s*(?:NT\$?|\$)?\s*([\d,]+)',s,re.I)
            if price:row['priceMinor']=int(price[1].replace(',',''))*100
        row['windows']=windows(row['text']) or windows(row['context'])
        # Repeated text/context dates are not independent intervals.
        unique=[]
        for w in row['windows']:
            if w not in unique:unique.append(w)
        row['windows']=unique
        row['priceType']='from' if re.search(r'(?:\d元?|\$\d+)起',s) else 'fixed'
        content=re.search(r'優惠內容[:：]?\s*([\s\S]+)',s)
        if content:
            row['text']=re.split(r'注意事項|使用限制|優惠代[碼號]|使用期限|附註',content[1])[0]
            exact_price=re.search(r'(?:=\s*(?:特價|優惠價)?|特價)\s*(?:NT\$?|\$)?\s*(\d+)',row['text'],re.I)
            if exact_price:row['priceMinor']=int(exact_price[1])*100
    return rows

def split_top(s,chars='+＋'):
    parts=[];depth=0;start=0
    for i,c in enumerate(s):
        if c in '(（':depth+=1
        elif c in ')）':depth=max(0,depth-1)
        elif c in chars and depth==0:parts.append(s[start:i]);start=i+1
    parts.append(s[start:]);return [p.strip() for p in parts if p.strip()]

def menu_component(text,brand):
    """Parse one literal item, excluding price caps and flavor descriptions from counts."""
    s=unicodedata.normalize('NFKC',text).strip()
    s=re.sub(r'^\s*[A-Z]餐\s*','',s)
    s=re.sub(r'^(?:【[^】]*】|\[[^]]*\])','',s)
    # Separate outer descriptions while preserving serving size parentheses.
    descriptions=re.findall(r'\((?:限定|指定口味|限原價|原價|可選)[^)]*(?:\)[^)]*)?\)',s)
    s=re.sub(r'\((?:限定|指定口味|限原價|原價|可選)[\s\S]*\)\s*$','',s)
    s=re.sub(r'\((?:口味[^)]*)\)','',s)
    # Expanded platters include both a named bundle and its contents: count the bundle once.
    s=re.sub(r'(拼盤\s*[x×]\s*\d+)\s*\([\s\S]*\)$',r'\1',s)
    m=re.fullmatch(r'(.+?)\s*[x×]\s*(\d+)',s,re.I)
    if m:name,qty=m[1],int(m[2])
    else:
        m=re.fullmatch(r'(\d+)\s*(?:塊|顆|個|份|杯|瓶|條)\s*(.+)',s)
        if m:qty,name=int(m[1]),m[2]
        elif re.fullmatch(r'1\.25L可樂乙瓶',norm(s)):name,qty='1.25L可樂',1
        elif re.search(r'(?:\d+元?|NT\$?\d+|優惠價|只要|買.+送)',s):raise ValueError('套餐敘述尚待分解：'+s[:60])
        else:name,qty=s,1
    name=re.sub(r'^\s*5\s*塊雞\(桶\)$','5塊咔啦脆雞',name)
    name=re.sub(r'^\s*6\s*塊雞\(桶\)$','6塊咔啦脆雞',name)
    name=name.replace('13 吋','13吋').replace('9 吋','9吋').replace('6 吋','6吋')
    items,drinks=atomic(name,qty)
    slots=[]
    pizza=next((k for k in items if k in {'pizza6','pizza9','pizza13'}),None)
    if pizza:
        flavors=re.search(r'指定口味\s*(\d+)\s*選\s*1[:：]\s*([^)]*)',unicodedata.normalize('NFKC',text))
        if flavors:
            names=[p.strip() for p in re.split(r'[/／]',flavors[2]) if p.strip()]
            if len(names)==int(flavors[1]):slots=[dict(size=pizza,names=names)]*items[pizza]
    return items,drinks,slots

def parse_meal(text,brand):
    s=unicodedata.normalize('NFKC',text)
    if s.count('(')!=s.count(')'):raise ValueError('餐點括號不完整，無法確認套餐邊界')
    s=re.sub(r'^\s*【[^】]*】','',s)
    # Exclude promotional arithmetic without dropping food from a recognized list.
    if '，包含' in s:s=s.split('，包含',1)[1]
    s=re.split(r'=\s*(?:NT\$?|\$)|注意事項',s)[0]
    base={};beverages=[];slots=[];groups=[]
    for part in split_top(s):
        choice=re.match(r'^([^()]*?)\s*(\d+)\s*選\s*(\d+)\s*\(([\s\S]*)\)\s*$',part)
        if choice:
            count,pick=int(choice[2]),int(choice[3]);inside=choice[4]
            if not(1<=pick<=count<=12):raise ValueError('選項數量待確認')
            options=split_top(inside,'/／、')
            if len(options)!=count:raise ValueError(f'來源寫 {count} 選 {pick}，實際列出 {len(options)} 項')
            parsed=[]
            for option in options:
                its,ds,ps=menu_component(option,brand);parsed.append(dict(name=option,items=its,beverages=ds,pizzaSlots=ps,surchargeMinor=0))
            groups.append(dict(id='group-'+str(len(groups)+1),pick=pick,distinct=True,options=parsed,label=choice[1] or '餐點'))
        else:
            its,ds,ps=menu_component(part,brand);add(base,its);beverages+=ds;slots+=ps
    configs=[dict(items=base,beverages=beverages,pizzaSlots=slots,choices=[])]
    for group in groups:
        next_configs=[]
        for current,indices in product(configs,combinations(range(len(group['options'])),group['pick'])):
            row=dict(items=dict(current['items']),beverages=list(current['beverages']),pizzaSlots=list(current['pizzaSlots']),choices=list(current['choices']))
            for i in indices:
                o=group['options'][i];add(row['items'],o['items']);row['beverages']+=o['beverages'];row['pizzaSlots']+=o['pizzaSlots'];row['choices'].append(o['name'])
            next_configs.append(row)
            if len(next_configs)>240:raise ValueError('選項組合超過 240，保留清單等待進一步支援')
        configs=next_configs
    if not any(c['items'] for c in configs):raise ValueError('沒有可計算的餐點')
    return configs,groups

def kcouper_variant(raw):
    items={};beverages=[];groups=[]
    for i,part in enumerate(raw['items']):
        count=part['count']
        if not isinstance(count,int) or count<0 or count>60:raise ValueError('餐點數量無效')
        if count==0:continue
        base,drinks=atomic(part['name'],count);add(items,base);beverages+=drinks
        options=[]
        for opt in [dict(name=part['name'],addition_price=0)]+part.get('flavors',[]):
            its,ds=atomic(opt['name']);cost=opt.get('addition_price')
            if isinstance(cost,bool) or not isinstance(cost,(int,float)) or cost<0:raise ValueError('替換差額不完整，不能略過選項')
            options.append(dict(name=opt['name'],items=its,beverages=ds,surchargeMinor=round(cost*100)))
        if len(options)>1:groups.append(dict(id='slot-'+str(i+1),count=count,baseItems=base,baseBeverages=drinks,options=options,label=part['name']))
    burger=items.get('burger',0)
    channels=[name for code,name in [(1,'delivery'),(2,'takeaway')] if code in raw.get('order_types',[])] or ['unknown']
    return dict(id='standard',priceMinor=round(raw['price']*100),surchargeMinor=0,items=items,beverages=beverages,optionGroups=groups,individualMains=burger+items.get('paperChicken',0)+items.get('pasta',0),individualMainItems={k:items[k] for k in ['burger','paperChicken','pasta'] if items.get(k)},channels=channels,choice=None)

def make_offer(rec,feed,stamp):
    issue=None;variants=[];choice_groups=[]
    try:
        if rec.get('structured'):variants=[kcouper_variant(rec['structured'])]
        else:
            configs,choice_groups=parse_meal(rec['text'],feed['brand'])
            for i,c in enumerate(configs):
                variants.append(dict(id='v'+str(i+1),priceMinor=rec['priceMinor'],surchargeMinor=0,items=c['items'],beverages=c['beverages'],pizzaSlotNames=c['pizzaSlots'],individualMains=sum(c['items'].get(k,0) for k in ['burger','paperChicken','pasta']),individualMainItems={k:c['items'][k] for k in ['burger','paperChicken','pasta'] if c['items'].get(k)},channels=['unknown'],choice='；'.join(c['choices']) or None))
        if ('紙包雞' in rec['text'] and not re.search(r'替換|換購|換成|可換|[0-9一二三]選|加價|升級|或|[/／]',rec['text'])
            and variants and all(not v['items'].get('paperChicken') for v in variants)
            and any(v['items'].get('chicken') for v in variants)):
            issue='餐點身分不一致：標題記載紙包雞，但來源預設內容是炸雞；不可直接當作同一品項'
        if rec['priceMinor'] is None:issue='缺少確定價格'
        elif rec.get('priceType')=='from':issue='來源標示起價，升級差額尚未完整確認'
        elif re.search(r'滿\s*\d+|現折|折抵|折扣|買.+送|加購',rec['text']) and not rec.get('structured'):issue='折扣或加購的前置條件待確認'
    except (ValueError,KeyError,TypeError) as err:issue=str(err)
    quality_issues=meal_issues(variants)
    if quality_issues and not issue:issue='；'.join(quality_issues)
    if issue:status='pending'
    else:status='estimate'
    windows_=[{'from':w.get('from_'), 'toExclusive':w['toExclusive']} for w in rec.get('windows',[])]
    structured=rec.get('structured',{})
    ordering=parse_ordering(rec.get('termsText',rec['text']))
    if ordering['fulfilments'] is not None:
        for v in variants:
            known=[c for c in v['channels'] if c!='unknown']
            v['channels']=[c for c in (known or ordering['fulfilments']) if c in ordering['fulfilments']]
    periods=structured.get('meal_periods',[])
    times=[]
    if 1 in periods:times.append((480,630))
    if 2 in periods or 3 in periods:times.append((630,1020))
    if 4 in periods or 5 in periods:times.append((1020,1380))
    if times:windows_=[dict(w,startMinute=start,endMinute=end) for w in windows_ for start,end in times]
    observation=dict(sourceId=feed['id'],sourcePublisher=feed['publisher'],sourceUrl=feed['url'],fetchedAt=stamp,code=rec['code'],text=rec['text'],priceMinor=rec['priceMinor'],priceType=rec.get('priceType'),validWindows=windows_,contentHash=sha256(json.dumps(rec,ensure_ascii=False,sort_keys=True).encode()).hexdigest())
    offer=dict(id=feed['brand'].lower()+'-'+rec['code'],brand=feed['brand'],code=rec['code'],title=rec['text'] if not structured else structured['name'],rawText=rec['text'],priceType=rec.get('priceType','fixed'),displayPriceMinor=rec['priceMinor'],dataStatus=status,reviewReason=issue,officialUrl=('https://www.kfcclub.com.tw/coupon' if feed['brand']=='KFC' else 'https://www.pizzahut.com.tw/'),variants=variants,choiceGroups=choice_groups,ordering=ordering,validity=dict(validWindows=windows_,startUnknown=not windows_ or any(not w['from'] for w in windows_),timeBasis='order_time',timezone='Asia/Taipei'),eligibility=dict(memberRequired=bool(re.search('會員限定|會員專屬',rec.get('termsText',rec['text']))),appRequired=ordering['platforms']==['pk_app'],storeScope='unknown'),limits=dict(maxUsesPerUserPerDay=1 if re.search('每日限購1|每日限購一',rec['text']) else None,sharedLimitGroup=None),combinationPolicy=dict(sameOrder='unknown',separateOrders='unknown'),conditions=['來源整理資料，門市、通路、限購及併用條件仍需於官方確認。']+([issue] if issue else [])+ordering['evidence']+(['供餐時段與取餐方式依 KCouper 資料分類，仍需向門市核對。'] if structured else []),provenance=dict(sourceUrl=feed['url'],sourcePublisher=feed['publisher'],sourceType='public_dataset' if structured else 'aggregator',fetchedAt=stamp,parsedAt=stamp,officialVerifiedAt=None,officialEvidenceUrl=None,method='public_feed_parser_v5',reviewStatus='needs_official_confirmation',contentHash=observation['contentHash'],sourceBlockId=rec['code']),observations=[observation],sourceMetadata=dict(mealPeriods=structured.get('meal_periods'),orderTypes=structured.get('order_types'),productCode=structured.get('product_code'),sourceUpdatedAt=rec.get('sourceUpdatedAt')))
    observation['ordering']=ordering
    observation['parsedConfigurations']=[dict(items=v['items'],priceMinor=v['priceMinor']) for v in variants]
    observation['parseIssues']=list(dict.fromkeys(quality_issues+([issue] if issue else [])))
    if structured:observation['sourceItems']=copy.deepcopy(structured['items'])
    offer['qualityIssues']=list(dict.fromkeys(quality_issues+([issue] if issue else [])))
    return offer

def signature(offer):
    if offer['dataStatus']=='pending':return None
    if any(k.startswith('food_') for v in offer['variants'] for k in v['items']):return None
    # Only compare like units. Named source packs are intentionally not guessed as piece counts.
    core=['chicken','tart','burger','burgerSmall','paperChicken','pasta','pizza6','pizza9','pizza13','drinkSmall','drinkMedium','bottle1250','greenTea1250','greenTea580','nuggets','friesSmall','friesLarge','hashBrown','roast']
    return sorted(set(json.dumps({k:v['items'][k] for k in core if v['items'].get(k)},sort_keys=True) for v in offer['variants']))

def merge(observations,previous,stamp):
    grouped={}
    for offer in observations:grouped.setdefault((offer['brand'],offer['code']),[]).append(offer)
    prior={(o['brand'],o['code']):o for o in previous.get('offers',[])}
    result=[]
    for key,rows in sorted(grouped.items()):
        # Prefer structured choices; every alternative observation remains available for auditing.
        rows.sort(key=lambda o:(o['dataStatus']=='pending',not bool(o['sourceMetadata'].get('productCode')),-len(o['variants'])))
        best=copy.deepcopy(rows[0]);best['observations']=[x for o in rows for x in o['observations']]
        known=[set(o['ordering']['platforms']) for o in rows if o['ordering']['platforms'] is not None]
        if known:
            platforms=set.intersection(*known);best['ordering']['platforms']=sorted(platforms)
            if not platforms:best['dataStatus']='conflict';best['reviewReason']='來源記載的下單方式互相衝突'
        best['ordering']['excludedPlatforms']=sorted(set(p for o in rows for p in o['ordering']['excludedPlatforms']))
        best['ordering']['onlinePaymentRequired']=any(o['ordering']['onlinePaymentRequired'] for o in rows)
        best['ordering']['evidence']=list(dict.fromkeys(e for o in rows for e in o['ordering']['evidence']))
        fulfilments=[set(o['ordering']['fulfilments']) for o in rows if o['ordering']['fulfilments'] is not None]
        if fulfilments:
            allowed=set.intersection(*fulfilments);best['ordering']['fulfilments']=sorted(allowed)
            for v in best['variants']:v['channels']=[c for c in (v['channels'] if 'unknown' not in v['channels'] else sorted(allowed)) if c in allowed]
            if not allowed:best['dataStatus']='conflict';best['reviewReason']='來源記載的取餐方式互相衝突'
        best['conditions']+=best['ordering']['evidence']
        best['eligibility']['memberRequired']=any(o['eligibility']['memberRequired'] for o in rows)
        best['eligibility']['appRequired']=best['ordering']['platforms']==['pk_app']
        prices={o['displayPriceMinor'] for o in rows if o['priceType']=='fixed' and o['displayPriceMinor'] is not None}
        # Price conflict is a real blocker, even if an unknown food cannot yet be normalized.
        if len(prices)>1:
            best['dataStatus']='conflict';best['reviewReason']='不同來源或同一來源的同碼價格不一致';best['provenance']['conflictGroupId']=best['id']
        else:
            comparable=[o for o in rows if signature(o) is not None]
            # Check shared core fields of literal single configurations; options retain their own domains.
            single=[o for o in comparable if len(o['variants'])==1]
            if len({json.dumps(signature(o)) for o in single})>1:
                best['dataStatus']='conflict';best['reviewReason']='同碼的主餐或已知規格數量不同';best['provenance']['conflictGroupId']=best['id']
        old=prior.get(key)
        if old and best['dataStatus']=='estimate':
            # Retain reviewed pizza flavor domains only when physical meal and price still match.
            for v in best['variants']:
                old_v=next((a for a in old['variants'] if a['priceMinor']==v['priceMinor'] and a['items']==v['items'] and a.get('pizzaSlots')),None)
                if old_v:v['pizzaSlots']=old_v['pizzaSlots'];v['distinctPizzaSlots']=old_v.get('distinctPizzaSlots',False)
        result.append(best)
    return result

def assign_flavor_ids(offers,catalog):
    for o in offers:
        for v in o['variants']:
            if v.get('pizzaSlotNames'):
                slots=[]
                for slot in v.pop('pizzaSlotNames'):
                    ids=[]
                    for name in slot['names']:
                        fid='flavor-'+sha256(norm(name).encode()).hexdigest()[:12]
                        tags=[]
                        if re.search('海鮮|蝦|蟹|章魚|鱈魚|干貝|明太子|鮮蚵|鰻',name):tags.append('seafood')
                        if re.search('雞|牛|豬|培根|肉|夏威夷|總匯|小福',name):tags.append('meat')
                        catalog[fid]=dict(name=name,tags=tags);ids.append(fid)
                    slots.append(dict(size=slot['size'],allowed=ids))
                v['pizzaSlots']=slots
            if v['items'].get('pasta'):
                names=' '.join([o['rawText'],v.get('choice') or ''])
                v['pastaTags']=[tag for tag,pattern in [('seafood','海鮮|蝦|蟹|蛤蜊'),('meat','雞|牛|豬|培根|肉')] if re.search(pattern,names)]
