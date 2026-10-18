"""Intro is KFC's base recipe; Details are ordering choices, never its substitute.

KCouper discovers codes/product IDs. Refresh anonymous official details weekly.
A reference shop's SoldOut is scoped evidence, not nationwide stock.
"""
import copy,json,re,threading,time,unicodedata,urllib.error,urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timedelta,timezone
from html import unescape
from catalog import parse_meal,kcouper_variant
from food_parser import CATALOG
from data_quality import meal_issues

ENDPOINT='https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFoodDetail'
SHOP='TWI104'
SHOP_NAME='台北雙連店'
MAX_AGE=7*86400

def fetch_detail(query):
    req=urllib.request.Request(ENDPOINT,data=json.dumps(query).encode(),headers={'Content-Type':'application/json','User-Agent':'JoCheap/0.9 public coupon description','Origin':'https://www.kfcclub.com.tw','Referer':'https://www.kfcclub.com.tw/'})
    with urllib.request.urlopen(req,timeout=20) as response:
        raw=response.read(1_000_001)
        if len(raw)>1_000_000:raise ValueError('Official detail response too large')
    return json.loads(raw)

def query_for(offer,stamp):
    meta=offer.get('sourceMetadata',{});product=meta.get('productCode')
    if not isinstance(product,str) or not re.fullmatch(r'[A-Za-z0-9]{1,24}',product):raise ValueError('缺少官方商品代碼')
    date=datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%Y/%m/%d')
    periods=meta.get('mealPeriods') or [3];types=meta.get('orderTypes') or [2]
    return dict(shopcode=SHOP,fcode=product,menuid='',mealperiod=str(3 if 3 in periods else periods[0]),ordertype=str(2 if 2 in types else types[0]),orderdate=date)

def parse_response(code,query,response,stamp):
    if not isinstance(response,dict) or response.get('Success') is not True:raise ValueError('官方餐點查詢未成功')
    rows=(response.get('Data') or {}).get('FoodDetail')
    if not isinstance(rows,list) or len(rows)!=1:raise ValueError('官方餐點明細缺失')
    row=rows[0]
    if row.get('Fcode')!=query['fcode'] or str(row.get('couponCode',''))!=code:raise ValueError('官方餐點與優惠碼不一致')
    detail={k:copy.deepcopy(row.get(k)) for k in ['Fcode','couponCode','Name','Intro','Original_Price','SoldOut','StartDate','EndDate','Nutrition','Details']}
    for group in detail.get('Details') or []:
        group.pop('Options',None)
        for item in group.get('MList') or []:
            for key in list(item):
                if key not in {'Code','Name','MListPrice','AddPrice'}:item.pop(key)
    return dict(code=code,endpoint=ENDPOINT,status='success',checkedAt=stamp,query=query,detail=detail)

def prior_success(entry):
    return entry.get('lastSuccess') if entry.get('status')=='error' else entry if entry.get('status')=='success' else None

def matches(entry,offer):
    return bool(entry and entry.get('code')==offer['code'] and entry.get('endpoint')==ENDPOINT and entry.get('query',{}).get('fcode')==offer.get('sourceMetadata',{}).get('productCode') and entry.get('query',{}).get('shopcode')==SHOP)

def fresh(entry,offer,stamp):
    try:age=(datetime.fromisoformat(stamp.replace('Z','+00:00'))-datetime.fromisoformat(entry['checkedAt'].replace('Z','+00:00'))).total_seconds()
    except (ValueError,KeyError,TypeError):return False
    return entry.get('status')=='success' and matches(entry,offer) and 0<=age<MAX_AGE

def recipe(detail,offer):
    intro=detail.get('Intro')
    if not isinstance(intro,str) or not intro.strip():raise ValueError('官方餐點說明空白；不以預設選項猜測基本組合')
    text=unicodedata.normalize('NFKC',unescape(re.sub(r'<[^>]+>',' ',intro))).strip().strip('"')
    price=detail.get('Original_Price')
    # Original_Price can exclude compulsory components (e.g. the drink).
    # Prefer the complete price in Intro, and never confuse its retail value.
    advertised=re.split(r'\((?:原價|最高價值)',text)[0]
    amount=re.search(r'(?:NT\$?|\$)\s*([\d,]+(?:\.\d+)?)|=\s*(?:特價|優惠價)?\s*(\d+(?:\.\d+)?)',advertised,re.I)
    if not amount and (isinstance(price,bool) or not isinstance(price,(int,float)) or price<0 or not float(price*100).is_integer()):raise ValueError('官方基本價格無效')
    if amount:
        price=float((amount[1] or amount[2]).replace(',',''))
        after=text[amount.end():]
        text=text[:amount.start()].rstrip(' =特價優惠價')
        if '送' in after:
            before,gift=after.split('送',1)
            if not text.startswith('買') or re.search('若|滿|加購|才|會員|抽',before):raise ValueError('贈品前置條件待確認')
            gift=re.sub(r'\((?:現省|省|\$省|市價|原價|最高價值)[^)]*\)|\{省[^}]*\}','',gift).strip().strip('"')
            text=text[1:]+'+'+gift
        elif text.startswith('買') and ' 送' in text:
            bought,gift=text[1:].split(' 送',1);text=bought+'+'+gift
    text=re.sub(r'[【\[]\s*點心盒[A-Z]?\s*[:：]([^】\]]+)[】\]]',r'\1',text)
    text=re.sub(r'[【\[]\s*(?:群星盒|點心盒)[A-Z]?\s*[:：]([^】\]]+)[】\]]',r'\1',text)
    text=text.replace('【','').replace('】','')
    digits=dict(zip('一二三四五六七八九十兩',['1','2','3','4','5','6','7','8','9','10','2']))
    text=re.sub(r'[一二三四五六七八九十兩](?=塊|顆|個|份|杯|瓶|碗)',lambda m:digits[m[0]],text)
    text=re.sub(r'(\d+)碗',r'\1份',text)
    text=re.sub(r'(?<![0-9.])(\d+)(?=咔啦雞腿堡|冰無糖綠茶)',r'\1份',text)
    text=re.sub(r'(\d+)塊雞\(桶\)',r'\1塊咔啦脆雞',text).replace('(桶)','')
    text=re.sub(r'(?:1|一)盒原味蛋撻(?:禮盒)?\(6入\)',r'6顆原味蛋撻',text)
    text=re.sub(r'2盒原味蛋撻(?:禮盒)?\(12入\)',r'12顆原味蛋撻',text)
    text=re.sub(r'(\d+)盒原味蛋撻禮盒',r'\1份原味蛋撻禮盒',text)
    text=text.replace('原味蛋撻禮盒(6入)','6顆原味蛋撻')
    text=re.sub(r'(\d+)瓶(?=[0-9])',r'\1份',text)
    text=re.sub(r'上校雞塊分享盒\(20塊\)',r'20塊上校雞塊',text)
    # A named platter's parentheses explain its contents, not extra servings.
    marker='超蝦點心拼盤('
    while marker in text:
        start=text.index(marker)+len(marker)-1;depth=1;end=start+1
        while end<len(text) and depth:
            depth+=(text[end]=='(')-(text[end]==')');end+=1
        if depth:raise ValueError('拼盤說明括號不完整')
        text=text[:start]+text[end:]

    # Intro uses explicit '或' lists for same-price choices.
    parts=[]
    from catalog import split_top
    for part in split_top(text):
        if re.fullmatch(r'1\.25L(?:可樂|七喜)(?:乙瓶)?',part):part='1份'+part.removesuffix('乙瓶')
        tail=re.fullmatch(r'([^()]+?)(\d+)(塊|顆|杯|份)',part)
        if tail:part=tail[2]+tail[3]+tail[1]
        suffix=re.fullmatch(r'(.+)\{(\d+)選(\d+)\}',part)
        if suffix:part=suffix[2]+'選'+suffix[3]+':'+suffix[1]
        choice=re.fullmatch(r'(?:玉米濃湯預設\s*)?\(?(\d+)選(\d+)\)?[:：](.+)',part)
        if choice:
            options=choice[3].split('或')
            if len(options)!=int(choice[1]):raise ValueError('官方餐點選項數量不一致')
            part='餐點'+choice[1]+'選'+choice[2]+'('+ '/'.join(options)+')'
        parts.append(part)
    text='+'.join(parts)
    configs,groups=parse_meal(text,'KFC');variants=[]
    channels=[name for code,name in [(1,'delivery'),(2,'takeaway')] if code in offer.get('sourceMetadata',{}).get('orderTypes',[])] or ['unknown']
    for i,c in enumerate(configs):
        variants.append(dict(id='intro-'+str(i+1),priceMinor=round(price*100),surchargeMinor=0,items=c['items'],beverages=c['beverages'],optionGroups=[],individualMains=sum(c['items'].get(k,0) for k in ['burger','paperChicken','pasta']),individualMainItems={k:c['items'][k] for k in ['burger','paperChicken','pasta'] if c['items'].get(k)},channels=channels,choice='；'.join(c['choices']) or None,mainDescription=intro))
    issues=meal_issues(variants)
    if issues:raise ValueError('；'.join(issues))
    # Upgrades require both the complete default recipe AND its names to agree.
    # Physical categories alone lose the difference between paper-chicken flavors.
    raw=dict(price=price,order_types=offer.get('sourceMetadata',{}).get('orderTypes',[]),items=[])
    def option_name(name):return name[1:-1] if name.startswith('(') and name.endswith(')') else name
    for g in detail.get('Details') or []:
        opts=g.get('MList') or []
        if not opts or g.get('Title')=='其他':continue
        raw['items'].append(dict(name=option_name(opts[0]['Name']),count=g['MinCount'],flavors=[dict(name=option_name(x['Name']),addition_price=x['AddPrice']) for x in opts[1:]]))
    mismatch=True
    try:
        actual=kcouper_variant(raw)
        def literal(name):
            s=unicodedata.normalize('NFKC',name).replace('超極酥','')
            s=re.sub(r'\((?:辣|不辣)\)|\s+','',s);count=1
            for _ in range(2):
                front=re.match(r'^(\d+)(?:塊|顆|個|份|入|杯|瓶|條)(.+)$',s)
                if not front:break
                count*=int(front[1]);s=front[2]
            tail=re.fullmatch(r'(.+?)(\d+)(?:塊|顆|入)',s)
            if tail:s=tail[1];count*=int(tail[2])
            return s,count
        source_names=Counter();intro_names=Counter()
        for p in raw['items']:
            name,count=literal(p['name']);source_names[name]+=count*p['count']
        for part in parts:
            name,count=literal(part);intro_names[name]+=count
        same_names=source_names==intro_names
        mismatch=len(variants)!=1 or actual['items']!=variants[0]['items'] or not same_names
        if not amount:
            if mismatch:raise ValueError('官方餐點說明未載套餐價且明細不同，保留待確認')
            total=detail['Original_Price']
            for g in detail.get('Details') or []:
                count=g['MinCount'];component=g['MList'][0]['MListPrice']
                if type(count) is not int or isinstance(component,bool) or not isinstance(component,(int,float)) or count<0 or component<0:raise ValueError('官方組件價格不完整')
                total+=count*component
            variants[0]['priceMinor']=round(total*100)
        if not mismatch:variants[0]['optionGroups']=actual['optionGroups']
    except (ValueError,KeyError,TypeError):
        if not amount:raise ValueError('官方餐點說明未載確定套餐價，保留待確認')
    return variants,groups,mismatch

def apply_entry(offer,entry):
    record=prior_success(entry);bound=matches(record,offer)
    meta=offer.setdefault('sourceMetadata',{})
    offer['verification']=dict(status='unverified',reason='依官方餐點說明解析；門市供應、限制與結帳尚未完整核對')
    offer['sourceVersions']=[] # Never leave KCouper defaults selectable.
    issue=None
    if not bound:issue='尚無可用的官方餐點說明，保留優惠碼等待重查'
    else:
        d=record['detail'];meta['officialMeal']=dict(checkedAt=record['checkedAt'],query=record['query'],intro=d.get('Intro'),soldOut=d.get('SoldOut'),shopName=SHOP_NAME,status=entry['status'],orderingOptions=[dict(title=g.get('Title'),count=g.get('MinCount'),options=[dict(name=i.get('Name'),addPrice=i.get('AddPrice')) for i in g.get('MList',[])]) for g in d.get('Details') or [] if g.get('Title')!='其他'])
        offer['rawText']=d.get('Intro') or '';offer['title']=d.get('Name') or offer['title']
        offer['officialUrl']='https://www.kfcclub.com.tw/meal/'+d['Fcode']+'?couponProduct='+offer['code']
        offer['provenance'].update(sourceUrl=offer['officialUrl'],sourcePublisher='肯德基官方 API 餐點說明',sourceType='official_api',fetchedAt=record['checkedAt'],method='official_intro_v1')
        meta['compositionBasis']='official_intro';meta['upstream']='KFC 官方點餐 API（直接查詢）'
        try:
            variants,groups,mismatch=recipe(d,offer)
            offer.update(variants=variants,choiceGroups=groups,displayPriceMinor=variants[0]['priceMinor'],priceType='fixed',dataStatus='estimate',reviewReason=None,qualityIssues=[])
            meta['officialMeal']['orderingDiffers']=mismatch
            start=datetime.strptime(d['StartDate'],'%Y/%m/%d %H:%M:%S').date().isoformat();end=(datetime.strptime(d['EndDate'],'%Y/%m/%d %H:%M:%S').date()+timedelta(days=1)).isoformat()
            for w in offer['validity']['validWindows']:w.update({'from':start,'toExclusive':end})
            if not offer['validity']['validWindows']:offer['validity']['validWindows']=[{'from':start,'toExclusive':end}]
        except (ValueError,KeyError,TypeError) as err:issue=str(err)
        notes=['基本組合與套餐價採官方 API 餐點說明（Intro），不用點餐預設選項覆蓋。','官方查詢參考門市：'+SHOP_NAME+'；供應狀態僅適用查詢當下的該門市，其他門市待確認。']
        if meta['officialMeal'].get('orderingDiffers'):notes.append('點餐明細與餐點說明未能完整配對；替換內容僅供核對，不自動覆蓋或加入基本組合。')
        if d.get('SoldOut') is True:notes.append(SHOP_NAME+'於查詢當下回報售罄；本配置僅供估算，不能視為可直接購買。')
        if entry.get('status')=='error':notes.append('本次官方查詢失敗，沿用 '+record['checkedAt']+' 的餐點說明，供應狀態不是即時資料。')
        offer['conditions']=list(dict.fromkeys(notes+[d.get('Nutrition') or '']+offer.get('conditions',[])))
    if issue:offer.update(dataStatus='pending',reviewReason=issue,variants=[],choiceGroups=[],qualityIssues=[issue])
    version=copy.deepcopy({k:v for k,v in offer.items() if k not in {'observations','sourceVersions','verification'}})
    version['sourceVersionKey']='kfc-official-intro';offer['sourceVersions']=[version]

def refresh(data,cache,fetcher,stamp,force=False,on_progress=None,workers=8):
    prior=cache.get('byCode',{}) if cache.get('version')==1 else {};entries={};offers=[o for o in data['offers'] if o['brand']=='KFC']
    report=dict(total=len(offers),queried=0,reused=0,deferred=0,endpoint=ENDPOINT,attemptedAt=stamp,shopCode=SHOP,shopName=SHOP_NAME)
    lock=threading.Lock();stop=threading.Event();next_start=[0.0]
    def read(offer):
        code=offer['code'];old=prior.get(code,{})
        if not force and fresh(old,offer,stamp):return code,copy.deepcopy(old),'reused'
        queried=False
        try:
            if fetcher is None:raise RuntimeError('離線模式未查詢官方 API')
            if stop.is_set():raise RuntimeError('Official rate limit; remaining queries deferred')
            if fetcher is fetch_detail:
                with lock:
                    delay=max(0,next_start[0]-time.monotonic());time.sleep(delay);next_start[0]=time.monotonic()+.5
            if stop.is_set():raise RuntimeError('Official rate limit; remaining queries deferred')
            query=query_for(offer,stamp);queried=True;response=fetcher(query)
            checked=datetime.now(timezone.utc).isoformat(timespec='seconds') if fetcher is fetch_detail else stamp
            entry=parse_response(code,query,response,checked)
        except Exception as err:
            if isinstance(err,urllib.error.HTTPError) and err.code in {403,429}:stop.set()
            entry=dict(code=code,endpoint=ENDPOINT,status='error',attemptedAt=stamp,errorSummary=(type(err).__name__+': '+str(err))[:250])
            last=prior_success(old)
            if matches(last,offer):entry['lastSuccess']=copy.deepcopy(last)
        return code,entry,'queried' if queried else 'deferred'
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks=[pool.submit(read,o) for o in offers]
        for i,future in enumerate(as_completed(tasks),1):
            code,entry,action=future.result();entries[code]=entry;report[action]+=1
            if i%25==0 or i==len(offers):
                if on_progress:on_progress(dict(version=1,generatedAt=stamp,byCode={**prior,**entries}))
                print('KFC official descriptions: '+str(i)+'/'+str(len(offers)),flush=True)
    for offer in offers:apply_entry(offer,entries[offer['code']])
    report['byStatus']=dict(Counter(e['status'] for e in entries.values()));report['parseStatus']=dict(Counter(o['dataStatus'] for o in offers));report['retainedSuccessful']=sum(e['status']=='error' and bool(e.get('lastSuccess')) for e in entries.values())
    data['kfcDescriptions']=report;data['foodCatalog']=dict(CATALOG)
    data.setdefault('sourcePolicy',{})['KFC']=dict(sourceIds=['kcouper'],discovery='kcouper_codes_and_product_ids_only',transport='direct_official_api',compositionBasis='official_intro',upstream='KFC official ordering API')
    data.get('officialRefresh',{})['checked']=sum(o.get('verification',{}).get('status')=='checked' for o in data['offers'])
    return dict(version=1,generatedAt=stamp,byCode=entries),report
