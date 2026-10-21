"""Dated KFC official standalone menus; literal packs never imply guessed contents.

Keep fulfilment prices and meal-period visibility separate. Failed queries retain
original observation times; a successful removal removes its products.
"""
import copy,json,re,urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
from hashlib import sha256
from pathlib import Path
from data_quality import content_signature
from food_parser import atomic

API='https://olo-api.kfcclub.com.tw/menu/v1/'
SHOP='TWI104'
MENUS=['5','184']
SLOTS=['08:10','11:00','15:00','18:00','22:00']
CHANNELS={'takeaway':'2','delivery':'1'}
TZ=timezone(timedelta(hours=8))
# Only literal identities/quantities are shared with coupon components.
IDENTITIES={
 '香酥脆薯(小)':{'friesSmall':1},'香酥脆薯(中)':{'friesMedium':1},'香酥脆薯(大)':{'friesLarge':1},
 '上校雞塊4塊':{'nuggets':4},'上校雞塊8塊':{'nuggets':8},'上校雞塊分享盒(20塊)':{'nuggets':20},
 '薯餅':{'hashBrown':1},'雙色轉轉QQ球':{'qqPack':1},'黃金超蝦塊3塊':{'shrimpPieces':3},'鱈魚圈圈':{'fishRings':1},
 '草苺起司冰淇淋大福':{'daifuku':1},'原味蛋撻':{'tart':1},'紅豆奶皇蛋撻':{'redBeanTart':1},
 '1顆原味蛋撻+1顆紅豆奶皇蛋撻':{'tart':1,'redBeanTart':1},
 '原味蛋撻買6顆送6顆紅豆奶皇':{'tart':6,'redBeanTart':6},
 '雞汁風味飯(加量不加價)':{'chickenRice':1},'青花椒醬飯':{'pepperRice':1},'蒜香白醬飯':{'creamRice':1},
 '咔啦脆雞':{'chicken':1},'咔啦爆脆雞(不辣)':{'chicken':1},'青花椒香麻脆雞':{'chicken':1},
 '爆脆無骨雞腿霸':{'bonelessChicken':1},'超蝦點心拼盤':{'seafoodPlatter':1},
 '玉米濃湯(小)':{'soupSmall':1},'玉米濃湯(大)':{'soupLarge':1},
}
def norm(s):return re.sub(r'\s+','',s).replace('（','(').replace('）',')')
def digest(value):return sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def fixed_components(detail):
 """Only mandatory single-food groups prove a box's physical contents."""
 items={}
 for group in detail.get('Details',[]):
  if group.get('MType')=='DD':continue  # Optional dipping sauces are separate.
  low,high=group.get('MinCount'),group.get('MaxCount')
  if low==0:continue
  options=group.get('MList',[])
  if isinstance(low,bool) or not isinstance(low,int) or low!=high or not 1<=low<=60 or len(options)!=1 or options[0].get('HasOptions'):return {}
  try:foods,_=atomic(options[0]['Name'],low,allow_generic=False)
  except (ValueError,KeyError):return {}
  for id,n in foods.items():items[id]=items.get(id,0)+n
 return items if len(items)>1 and all(n<=60 for n in items.values()) else {}
def fetch(endpoint,query):
 req=urllib.request.Request(API+endpoint,data=json.dumps(query).encode(),headers={'Content-Type':'application/json','User-Agent':'JoCheap/1.0 public official menu reader','Origin':'https://www.kfcclub.com.tw'})
 with urllib.request.urlopen(req,timeout=20) as response:
  raw=response.read(2_000_001)
  if response.status!=200 or len(raw)>2_000_000:raise ValueError('Invalid official response')
 return json.loads(raw)
def minute(s):
 h,m=map(int,s.split(':'));n=h*60+m
 if not 0<=n<=1440:raise ValueError('Invalid period boundary')
 return n

def refresh(previous,fetcher,stamp):
 pages={};records={};errors=[];periods={}
 def read_period(job):
  channel,time=job
  try:
   r=fetcher('GetMealPeriodID',dict(ordertype=CHANNELS[channel],time=time,channel='1',shopCode=SHOP))
   p=r.get('Data') if r.get('Success') is True else None
   if not isinstance(p,dict) or not re.fullmatch(r'[1-5]',str(p.get('MealPeriodID',''))):raise ValueError('Missing official meal period')
   start,end=minute(p['StartTime']),minute(p['EndTime'])
   if end<=start:raise ValueError('Invalid period')
   return channel,str(p['MealPeriodID']),[start,end],None
  except Exception as e:return channel,time,None,str(e)[:160]
 with ThreadPoolExecutor(max_workers=4) as pool:
  for channel,period,window,error in pool.map(read_period,[(c,t) for c in CHANNELS for t in SLOTS]):
   if error:errors.append(dict(channel=channel,time=period,error=error))
   else:periods[(channel,period)]=window
 # Retain each failed period independently, without renewing its observation.
 jobs=[(channel,period,menu) for channel in CHANNELS for period in [str(x) for x in range(1,6)] for menu in MENUS]
 def read(job):
  channel,period,menu=job;key='|'.join(job)
  try:
   if (channel,period) not in periods:raise ValueError('Official period unavailable')
   query=dict(shopcode=SHOP,mealperiod=period,ordertype=CHANNELS[channel],ismember='0',menuid=menu,parentid='0',orderdate=datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(TZ).strftime('%Y/%m/%d'),channel='1',IsPKAPP='0')
   r=fetcher('GetQueryFood',query)
   groups=(r.get('Data') or {}).get('Foods')
   if r.get('Success') is not True or not isinstance(groups,list) or not groups:raise ValueError('Official menu unavailable')
   rows=[]
   for group in groups:
    if str(group.get('MenuID'))!=menu:raise ValueError('Wrong official menu')
    for row in group.get('Details',[]):
     if not re.fullmatch(r'[A-Za-z0-9]{1,24}',row.get('Fcode','')) or not row.get('Name'):continue
     rows.append({k:row.get(k) for k in ['Fcode','Name','Upa_Group','StartDate','EndDate','SoldOut','Intro','hasMultipleItems']})
   return key,dict(checkedAt=stamp,window=periods[(channel,period)],records=[digest(row) for row in rows]),rows,None
  except Exception as e:return key,copy.deepcopy(previous.get('pages',{}).get(key)),[],str(e)[:160]
 with ThreadPoolExecutor(max_workers=4) as pool:
  for key,page,rows,error in pool.map(read,jobs):
   if error:errors.append(dict(query=key,error=error))
   if page:
    pages[key]=page
    for row in rows:records[digest(row)]=row
    for code in page['records']:
     if code not in records and code in previous.get('records',{}):records[code]=copy.deepcopy(previous['records'][code])
 # Fetch recipes once per boxed product. Failure leaves the box unexpanded;
 # neither its name nor its picture proves the number of chicken nuggets.
 products={r['Fcode']:r for r in records.values() if any(x in r['Name'] for x in ['點心盒','三拼小盒'])}
 for code,row in products.items():
  try:
   result=fetcher('GetQueryFoodDetail',dict(fcode=code,menuid='5',mealperiod='2',ordertype='2',orderdate=datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(TZ).strftime('%Y/%m/%d')+' 13:00',shopcode=SHOP,channel='1'))
   if result.get('Success') is not True:continue
   detail=next(x for x in result['Data']['FoodDetail'] if norm(x['Name'])==norm(row['Name']))
   components=fixed_components(detail)
   if components:
    for r in records.values():
     if r['Fcode']==code:r.update(Components=components,ComponentsCheckedAt=stamp)
  except (ValueError,KeyError,TypeError,StopIteration,OSError):pass
 remapped={digest(row):row for row in records.values()};lookup={old:digest(row) for old,row in records.items()}
 for page in pages.values():page['records']=[lookup[key] for key in page['records']]
 return dict(version=1,attemptedAt=stamp,shopcode=SHOP,pages=pages,records=remapped,errors=errors)

def food(row):
 if row.get('Components') and all(isinstance(n,int) and not isinstance(n,bool) and 0<n<=60 and id in {k for v in IDENTITIES.values() for k in v} for id,n in row['Components'].items()):return dict(row['Components']),{}
 name=norm(row['Name']);items=IDENTITIES.get(name)
 if items:return items,{}
 # A named box/assortment remains one pack, not fabricated individual pieces.
 id='kfcMenu'+sha256(name.encode()).hexdigest()[:12]
 group='醬料' if name.endswith(('醬','醬(大)','醬(小)')) else '飲料與湯' if any(x in name for x in ['茶','可樂','七喜','蘋果汁','濃湯']) else '蛋撻' if '蛋撻' in name else '冰淇淋甜點' if '大福' in name else '綜合拼盤' if any(x in name for x in ['盒','拼盤','特餐']) else '薯類' if '薯' in name else '雞肉小食' if '雞' in name else '烘焙點心'
 unit='盒' if '盒' in name else '瓶' if '瓶' in name else '杯' if group=='飲料與湯' else '份';emoji='🥤' if group=='飲料與湯' else '🥣' if group=='醬料' else '🥧' if group=='蛋撻' else '🥐' if group=='烘焙點心' else '🍽️'
 return {id:1},{id:dict(name=row['Name'],unit=unit,emoji=emoji,snackGroup=group)}

def apply(data,cache):
 offers=[];foods={};snacks={};pending=[]
 for key,page in cache.get('pages',{}).items():
  channel,period,menu=key.split('|');checked=datetime.fromisoformat(page['checkedAt'].replace('Z','+00:00'));review=checked+timedelta(days=8)
  for signature in page['records']:
   row=cache['records'].get(signature)
   if not row:continue
   price=row['Upa_Group']
   if row.get('SoldOut') or row.get('hasMultipleItems') or isinstance(price,bool) or not isinstance(price,(int,float)) or price<=0 or not float(price*100).is_integer():
    pending.append(dict(code=row['Fcode'],channel=channel,period=period,reason='售罄、起價或未完成固定價格核對'));continue
   items,new=food(row);foods.update(new)
   for id in items:
    if id=='chicken':continue
    group=new.get(id,{}).get('snackGroup') or ('蛋撻' if id in {'tart','redBeanTart'} else '飯類' if id in {'chickenRice','pepperRice','creamRice'} else '飲料與湯' if id.startswith('soup') else '雞肉小食' if id in {'nuggets','bonelessChicken'} else '海鮮小食' if id=='shrimpPieces' else None)
    if group:snacks[id]=dict(brand='KFC',group=group,portion=4 if id=='nuggets' else 3 if id=='shrimpPieces' else 1,perPerson=2 if id=='nuggets' else 1,perGroup=group in {'綜合拼盤','醬料'},selectionOnly=group in {'醬料','飲料與湯'})
   start,end=page['window']
   if '供應至20:00' in (row.get('Intro') or ''):end=min(end,1200)
   if end<=start:continue
   try:
    from_date=max(checked.astimezone(TZ).date(),datetime.strptime(row['StartDate'],'%Y/%m/%d %H:%M:%S').date()).isoformat()
    to_date=(datetime.strptime(row['EndDate'],'%Y/%m/%d %H:%M:%S')+timedelta(seconds=1)).date().isoformat()
   except (TypeError,ValueError):continue
   if to_date<=from_date:continue
   source='https://www.kfcclub.com.tw/menu?menuId='+menu;intro=(row.get('Intro') or '').replace('\\n','\n').strip()
   beverages=[]
   if any(x in row['Name'] for x in ['茶','可樂','七喜','蘋果汁','濃湯']) and not any(x in row['Name'] for x in ['盒','特餐','半價']):
    kind='soup' if '濃湯' in row['Name'] else 'unsweetened' if '無糖' in row['Name'] else 'milkTea' if '奶茶' in row['Name'] else 'cola' if '可樂' in row['Name'] else 'soda' if '七喜' in row['Name'] else 'other'
    size='bottle' if '瓶' in row['Name'] else 'small' if '(小)' in norm(row['Name']) else 'medium' if '(中)' in norm(row['Name']) else 'cup'
    beverages=[dict(name=row['Name'],quantity=n,kind=kind,size=size,item=id) for id,n in items.items()]
   m=dict(productId=row['Fcode'],checkedAt=page['checkedAt'],recheckBy=review.isoformat(timespec='seconds'),sourceUrl=source,contentHash=signature,channel=channel,mealPeriod=period,shopcode=SHOP,limited=any(x in intro+row['Name'] for x in ['期間限定','限時','售完為止']))
   if row.get('Components'):m['componentsCheckedAt']=row.get('ComponentsCheckedAt')
   # Official campaign end is honoured, without labelling every rotating menu
   # administrative EndDate as a marketing "limited edition".
   o=dict(id='kfc-menu-'+channel+'-'+period+'-'+row['Fcode'],brand='KFC',kind='direct_menu',code='',title=row['Name'],rawText=row['Name'],dataStatus='estimate',priceType='fixed',displayPriceMinor=round(price*100),officialUrl='https://www.kfcclub.com.tw/meal/'+row['Fcode']+'?menuId='+menu,variants=[dict(id='menu',priceMinor=round(price*100),items=items,channels=[channel],beverages=beverages,mainDescription=intro or row['Name'])],ordering=dict(platforms=['official_web'],fulfilments=[channel],status='known'),validity=dict(validWindows=[dict(from_=from_date,toExclusive=to_date,startMinute=start,endMinute=end)],timezone='Asia/Taipei'),eligibility={},limits={},conditions=['單點價格與供應以實際門市為準。'],provenance=dict(sourceUrl=source,sourcePublisher='肯德基官方單點 API',fetchedAt=page['checkedAt']),menuSnapshot=m,sourceMetadata=dict(mealPeriods=[int(period)]),sourceVersionKey='official-menu')
   o['validity']['validWindows'][0]['from']=o['validity']['validWindows'][0].pop('from_')
   if m['limited']:o['conditions'].append('限時供應，依官方活動期限與門市庫存為準。')
   o['menuSnapshot']['contentSignature']=content_signature(o);offers.append(o)
 # Equal products/prices across periods are one purchasable option, with all
 # observed windows. Different fulfilment prices remain separate options.
 merged={}
 for o in offers:
  m=o['menuSnapshot'];key=(m['channel'],m['productId'],m['contentHash'],m['checkedAt'])
  if key not in merged:
   o['id']='kfc-menu-'+m['channel']+'-'+m['productId']+'-'+m['contentHash'][:8];m['mealPeriods']=[m.pop('mealPeriod')];merged[key]=o
  else:
   target=merged[key];target['validity']['validWindows'].extend(o['validity']['validWindows']);target['sourceMetadata']['mealPeriods'].extend(o['sourceMetadata']['mealPeriods']);target['menuSnapshot']['mealPeriods'].append(m['mealPeriod'])
 offers=list(merged.values())
 for o in offers:o['menuSnapshot']['contentSignature']=content_signature(o)
 data['menuOffers']=[o for o in data.get('menuOffers',[]) if o['brand']!='KFC']+offers
 data.setdefault('foodCatalog',{}).update(foods);data.setdefault('snackCatalog',{}).update(snacks)
 data['kfcMenu']=dict(attemptedAt=cache.get('attemptedAt'),products=len(set(o['menuSnapshot']['productId'] for o in offers)),options=len(offers),pending=pending,errors=cache.get('errors',[]))
 return data['kfcMenu']

def update_file(target,fetcher=fetch,stamp=None,apply_cache=False):
 target=Path(target);path=target.parent/'kfc_menu.json';old=json.loads(path.read_text()) if path.exists() else {}
 stamp=stamp or datetime.now(timezone.utc).isoformat(timespec='seconds');cache=old if apply_cache else refresh(old,fetcher,stamp)
 data=json.loads(target.read_text());report=apply(data,cache)
 if not apply_cache:path.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')))
 target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));return report
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--snapshot',default=str(Path(__file__).resolve().parent.parent/'data/offers.json'));p.add_argument('--apply-cache',action='store_true');a=p.parse_args();print(json.dumps(update_file(a.snapshot,apply_cache=a.apply_cache),ensure_ascii=False))
