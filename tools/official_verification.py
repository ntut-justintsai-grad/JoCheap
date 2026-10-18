"""Only explicitly reviewed official recipes can be refreshed into recommendations.

The public query is read-only. A changed record, image, source meal or terms blocks
promotion. It never discovers a recipe or extends its review deadline.
"""
import copy,json,re,urllib.parse,urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
from hashlib import sha256
from data_quality import content_signature,source_signature

API='https://olo-api.kfcclub.com.tw/menu/v1/'
COUPON_URL='https://www.kfcclub.com.tw/coupon'
OFFICIAL_FIELDS=('CouponCode','Category','Fcode','ImgNameNew','NewName','Price','Intro','Hyperlink')
TZ=timezone(timedelta(hours=8))

def record_signature(row):
    return json.dumps({k:row.get(k) for k in OFFICIAL_FIELDS},ensure_ascii=False,sort_keys=True,separators=(',',':'))

def fetch_official(url,payload=None):
    host=urllib.parse.urlsplit(url).hostname
    if host not in {'olo-api.kfcclub.com.tw','www.kfcclub.com.tw','kfcoosfs.kfcclub.com.tw'}:raise ValueError('非允許的官方來源')
    request=urllib.request.Request(url,data=json.dumps(payload).encode() if payload is not None else None,headers={'User-Agent':'JoCheap/0.6 public coupon verification','Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=20) as response:
        raw=response.read(4_000_001)
        if response.status!=200 or len(raw)>4_000_000:raise ValueError('官方回應無效或過大')
        return raw

def refresh_official(data,reviews,fetcher,stamp):
    now=datetime.fromisoformat(stamp.replace('Z','+00:00'));local=now.astimezone(TZ)
    data['recommendationPolicy']=dict(requireOfficial=False,allowAllSources=True,refreshDays=7,version=2,label='全來源逐版本估算，官方核對另標示')
    for offer in data['offers']:
        offer['verification']=dict(status='unverified',reason='尚未完成官方餐點、價格及適用範圍核對')
    audit=dict(attemptedAt=stamp,status='not_checked',checked=0,reason='沒有可用的官方查核程序')
    approved=[r for r in reviews if r.get('status')=='approved_recipe']
    if not fetcher or not approved:
        data['officialRefresh']=audit;return data
    try:
        period_request=dict(ordertype='2',time=local.strftime('%H:%M'),channel='1')
        period=json.loads(fetcher(API+'GetMealPeriodID',period_request))
        if not period.get('Success') or not period.get('Data'):raise ValueError('官方未回傳目前外帶餐期')
        p=period['Data'];start,end=p['StartTime'],p['EndTime']
        minute=lambda t:int(t.split(':')[0])*60+int(t.split(':')[1])
        if not(0<=minute(start)<minute(end)<=1440):raise ValueError('餐期時間格式待確認')
        request=dict(mealPeriod=p['MealPeriodID'],orderType='2',orderDate=local.strftime('%Y/%m/%d'))
        response=json.loads(fetcher(API+'QueryCoupons',request))
        if not response.get('Success') or not isinstance(response.get('Data'),list):raise ValueError('官方清單未成功讀取')
        rows={r['CouponCode']:r for r in response['Data']}
        # Coupon-wide conditions are loaded by the official page's own route chunk.
        html=fetcher(COUPON_URL).decode('utf-8')
        scripts=re.findall(r'<script[^>]*src=["\']([^"\']+)',html)
        chunk=next((s for s in scripts if re.fullmatch(r'/_next/static/chunks/app/\(routes\)/coupon/page-[a-zA-Z0-9]+\.js',s)),None)
        if not chunk:raise ValueError('官方使用條件頁結構變動，需重新查核')
        terms=fetcher('https://www.kfcclub.com.tw'+chunk).decode('utf-8')
        image_urls={r['imageUrl'] for r in approved if r['code'] in rows}
        def image_hash(url):return url,sha256(fetcher(url)).hexdigest()
        with ThreadPoolExecutor(max_workers=4) as pool:images=dict(pool.map(image_hash,image_urls))
        audit.update(status='success',reason=None,query=request,mealPeriod=p,returnedCodes=len(rows),termsUrl=COUPON_URL)
        for review in approved:
            offer=next((o for o in data['offers'] if o['brand']==review['brand'] and o['code']==review['code']),None)
            if not offer:continue
            info=dict(status='partial',reason='待完成官方核對',reviewedBy=review.get('reviewedBy','未載明'),reviewedAt=review['reviewedAt'],reviewBy=review['reviewBy'],sourceUrl=COUPON_URL,imageUrl=review['imageUrl'],evidencePath=review['evidencePath'],scope=review['scope'],limitations=review['limitations'])
            offer['verification']=info
            if now>datetime.fromisoformat(review['reviewBy'].replace('Z','+00:00')):info.update(status='expired',reason='逐券查核已到複查期限');continue
            row=rows.get(review['code'])
            if not row:info.update(status='unavailable',reason='官方本次餐期清單未列此券');continue
            if record_signature(row)!=review['recordSignature'] or images.get(review['imageUrl'])!=review['imageHash']:
                info.update(status='changed',reason='官方券價、餐點或券面已異動，需重新核對');continue
            if not all(t in terms for t in review['requiredTerms']):info.update(status='changed',reason='官方使用條件已異動，需重新核對');continue
            if source_signature(offer)!=review['inputSignature']:info.update(status='changed',reason='收錄來源內容已異動，需重新核對');continue
            # Apply only the exact reviewed base recipe, not third-party upgrades.
            recipe=copy.deepcopy(review['configuration'])
            offer.update(title=row['NewName'],priceType='fixed',displayPriceMinor=int(row['Price'])*100,dataStatus='official',reviewReason=None,qualityIssues=[],variants=[recipe],choiceGroups=[],officialUrl='https://www.kfcclub.com.tw/meal/'+row['Fcode']+'?couponProduct='+row['CouponCode'])
            offer['validity']=dict(validWindows=[dict(from_=local.date().isoformat(),fromDate=local.date().isoformat(),toExclusive=(local.date()+timedelta(days=1)).isoformat(),startMinute=minute(start),endMinute=minute(end))],timeBasis='order_time',timezone='Asia/Taipei')
            # JS uses "from"; never inherit third-party future expiry dates.
            offer['validity']['validWindows'][0]['from']=offer['validity']['validWindows'][0].pop('from_')
            offer['validity']['validWindows'][0].pop('fromDate')
            offer['ordering']=dict(platforms=['official_web'],excludedPlatforms=[],fulfilments=['takeaway'],onlinePaymentRequired=False,evidence=['官方外帶優惠清單及券面'],status='official_scoped')
            offer['eligibility']=dict(memberRequired=False,appRequired=False,storeScope='official_page_scope')
            offer['limits']=dict(maxUsesPerUserPerDay=1,sharedLimitGroup=None,conservativeCap=True)
            offer['combinationPolicy']=dict(sameOrder='not_allowed',separateOrders='unknown')
            offer['conditions']=review['limitations']+['每碼本次最多使用一次，為本站保守限制，並非官方每日限購聲明。']
            until=datetime.combine(local.date(),datetime.strptime(end,'%H:%M').time(),tzinfo=TZ)
            info.update(status='checked',reason='官方基本餐點與券價已核對，僅適用本次外帶餐期',checkedAt=stamp,validUntil=until.isoformat(),query=request,mealPeriod=p,officialRecord={k:row.get(k) for k in OFFICIAL_FIELDS},imageHash=review['imageHash'])
            info['contentSignature']=content_signature(offer)
            audit['checked']+=1
    except Exception as err:
        # An incomplete refresh cannot leave a partially promoted catalogue.
        for offer in data['offers']:
            if offer.get('verification',{}).get('status')=='checked':
                offer['verification'].update(status='refresh_failed',reason='官方查核未完整完成，本次停止推薦')
        audit.update(status='error',checked=0,reason=str(err)[:250])
    data['officialRefresh']=audit
    return data
