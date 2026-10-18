"""Read official, publicly listed standalone sides. Coupon lookup stays separate.

Product IDs are bound to reviewed names and literal pack quantities. Unknown or
renamed products enter the review queue rather than receiving guessed contents.
Listing visibility is a dated observation, never evidence of permanent supply.
"""
import copy,json,re,urllib.request
from datetime import datetime,timedelta,timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from data_quality import content_signature

URLS=['https://www.pizzahut.com.tw/order/?mode=step_2&ct=5&cu=1701','https://www.pizzahut.com.tw/order/?mode=step_2&ct=6&cu=30']
MAX_AGE=8*86400
# Exact pack identities preserve unspecified amounts; platters are not exploded
# into guessed counts of chicken, sausages or fish.
PRODUCTS={
 4873:('HOT海陸大拼盤',{'phSeaLarge':1}),4886:('HOT燒大拼盤',{'phHotLarge':1}),4937:('HOT烤雞拼盤',{'phRoastPlatter':1}),
 4874:('HOT海陸小拼盤',{'phSeaSmall':1}),4885:('HOT燒小拼盤',{'phHotSmall':1}),18201:('單點台味三拼',{'phTaiwanTrio':1}),
 17926:('韓式海鮮煎餅',{'seafoodPancake':1}),10989:('酥炸嫩雞球',{'chickenBalls':1}),11565:('酥炸杏鮑菇',{'friedMushrooms':1}),
 16470:('起司三重奏豬肉條',{'cheesePork':1}),5137:('薯金幣(大份)',{'potatoCoinsLarge':1}),14447:('酥炸三味甜不辣',{'fishCakeTrio':1}),
 18411:('墨西哥辣椒芝心腸6條',{'mexicanSausage':6}),1303:('德國芝心腸',{'germanSausagePack':1}),2257:('黃金和風鱈魚塊(10個)',{'codBites':10}),
 5181:('黃金雞柳條8條',{'chickenStrips':8}),7119:('黃金雞軟骨',{'cartilageMenuPack':1}),4215:('厚燒醬烤BBQ(2腿2排)',{'bbqLegThighPack':1}),2725:('BBQ烤雞(4翅4腿)',{'bbqWingDrumPack':1}),
 18487:('吳寶春聯名蜜桃冰心起司塔1顆',{'peachCheeseTart':1}),18796:('吳寶春聯名蜜桃冰心起司塔2顆',{'peachCheeseTart':2}),18488:('冰藏起司塔禮盒(3顆原味+3顆蜜桃)',{'coldCheeseTart':3,'peachCheeseTart':3}),
 18128:('榴槤起司冰淇淋',{'durianIceCream':1}),18702:('榴槤起司冰淇淋2入',{'durianIceCream':2}),18703:('榴槤起司冰淇淋6入',{'durianIceCream':6}),
 13521:('巧克力QQ球5顆',{'chocolateQQ':5}),13509:('巧克力QQ球10顆',{'chocolateQQ':10}),6576:('巴斯克起司蛋糕(4吋)',{'basque4':1}),18165:('巴斯克起司蛋糕(8吋)',{'basque8':1}),
 4852:('冰藏起司塔1顆',{'coldCheeseTart':1}),4853:('冰藏起司塔2顆',{'coldCheeseTart':2}),4854:('冰藏起司塔禮盒',{'coldCheeseGift':1}),4119:('半熟起司塔1顆',{'warmCheeseTart':1}),4121:('半熟起司塔禮盒',{'warmCheeseGift':1}),
}
FOODS={
 'phSeaLarge':('海陸大拼盤','份','🍤'),'phHotLarge':('HOT 燒大拼盤','份','🍗'),'phRoastPlatter':('HOT 烤雞拼盤','份','🍗'),
 'phSeaSmall':('海陸小拼盤','份','🍤'),'phHotSmall':('HOT 燒小拼盤','份','🍗'),'phTaiwanTrio':('台味三拼','份','🍽️'),
 'seafoodPancake':('韓式海鮮煎餅','份','🦐'),'cheesePork':('起司三重奏豬肉條（份）','份','🧀'),'fishCakeTrio':('酥炸三味甜不辣','份','🐟'),
 'mexicanSausage':('墨西哥辣椒芝心腸','條','🌶️'),'germanSausagePack':('德國芝心腸（單點份）','份','🌭'),
 'cartilageMenuPack':('黃金雞軟骨（單點份）','份','🍗'),'bbqLegThighPack':('厚燒醬烤 BBQ（2 腿 2 排）','份','🍗'),
 'bbqWingDrumPack':('BBQ 烤雞（4 二節翅＋4 翅小腿）','份','🍗'),'peachCheeseTart':('蜜桃冰心起司塔','顆','🍑'),
 'coldCheeseTart':('冰藏起司塔','顆','🧀'),'durianIceCream':('榴槤起司冰淇淋','顆','🍨'),
 'basque4':('巴斯克起司蛋糕（4 吋）','個','🍰'),'basque8':('巴斯克起司蛋糕（8 吋）','個','🍰'),
 'coldCheeseGift':('冰藏起司塔禮盒（盒）','盒','🎁'),'warmCheeseTart':('半熟起司塔','顆','🧀'),'warmCheeseGift':('半熟起司塔禮盒（盒）','盒','🎁'),
}
def food_catalog():return {k:dict(name=n,unit=u,emoji=e) for k,(n,u,e) in FOODS.items()}
def norm(s):return re.sub(r'\s+','',s).replace('（','(').replace('）',')').replace('＋','+')

class Node:
 def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
 def text(self):return ''.join(c if isinstance(c,str) else c.text() for c in self.children)
 def find(self,cls):
  if cls in self.attrs.get('class','').split():return self
  return next((v for c in self.children if isinstance(c,Node) for v in [c.find(cls)] if v),None)
 def all(self):
  yield self
  for c in self.children:
   if isinstance(c,Node):yield from c.all()
class Tree(HTMLParser):
 def __init__(self):super().__init__();self.root=Node();self.stack=[self.root]
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs);self.stack[-1].children.append(n)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(n)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];return
 def handle_data(self,s):self.stack[-1].children.append(s)

def parse_listing(body,url,stamp):
 tree=Tree();tree.feed(body);products=[]
 for n in tree.root.all():
  match=re.fullmatch(r'itemss_d(\d+)',n.attrs.get('id',''))
  if not match:continue
  pid=int(match[1]);name=n.find('pro-li-name');price=n.find('priceTxt');description=n.find('pro-list-descContent')
  if name is None or price is None:continue
  p=re.fullmatch(r'\$(\d[\d,]*)',re.sub(r'\s','',price.text()))
  if not p:continue # ranges, add-on/from prices and missing prices are not fixed prices
  link=next((x.attrs['href'] for x in n.all() if x.tag=='a' and 'href' in x.attrs),'')
  if not re.search(r'(?:[?&])pd='+str(pid)+r'(?:&|$)',link):continue
  products.append(dict(productId=pid,name=name.text().strip(),priceMinor=int(p[1].replace(',',''))*100,description=(description.text().strip() if description else ''),officialUrl='https://www.pizzahut.com.tw/order/'+link,sourceUrl=url,checkedAt=stamp,contentHash=sha256(n.text().encode()).hexdigest()))
 if not products:raise ValueError('No fixed-price official product cards; retain dated snapshot')
 return products

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'JoCheap/0.9 public menu reader'})
 with urllib.request.urlopen(req,timeout=30) as r:
  raw=r.read(2_000_001)
  if r.status!=200 or len(raw)>2_000_000:raise ValueError('Invalid menu response')
 return raw.decode('utf-8-sig')

def refresh(cache,fetcher,stamp):
 pages={};errors=[]
 for url in URLS:
  try:pages[url]=dict(checkedAt=stamp,products=parse_listing(fetcher(url),url,stamp))
  except Exception as e:
   if url in cache.get('pages',{}):pages[url]=copy.deepcopy(cache['pages'][url])
   errors.append(dict(url=url,error=str(e)[:200]))
 return dict(version=1,attemptedAt=stamp,pages=pages,errors=errors)

def apply(data,cache):
 offers=[];pending=[];foods=set();seen=set()
 for page in cache.get('pages',{}).values():
  for p in page['products']:
   pid=p['productId'];rule=PRODUCTS.get(pid)
   if not rule or norm(p['name'])!=norm(rule[0]):
    if pid not in {17720,17721} and 'cu=31' not in p['officialUrl']:pending.append(dict(productId=pid,name=p['name'],reason='品項或名稱尚待人工對照'))
    continue
   if pid in seen:continue
   seen.add(pid)
   items=rule[1];foods.update(items);checked=datetime.fromisoformat(p['checkedAt'].replace('Z','+00:00'));review=(checked+timedelta(days=8)).isoformat(timespec='seconds')
   limited=any(k in p['description'] for k in ['期間限定','售完為止','限量供應'])
   # Specific official product terms confirm this flavour is limited. Refresh the
   # evidence too; a disappearing clause must not remain pinned permanently.
   evidence=cache.get('limitedEvidence',{})
   if pid in {18128,18702,18703} and evidence.get('limited'):limited=True
   conditions=['單點價格與供應以實際門市為準。']
   if limited:conditions.append('期間限定，售完為止；官網未公告固定結束日。')
   if '冷藏解凍2-3小時' in p['description']:conditions.append('冷凍商品，食用前需冷藏解凍 2–3 小時。')
   menu=dict(productId=pid,checkedAt=p['checkedAt'],recheckBy=review,sourceUrl=p['sourceUrl'],contentHash=p['contentHash'],limited=limited,endUnknown=True,limitedEvidence=evidence if pid in {18128,18702,18703} else None)
   offers.append(dict(id='ph-menu-'+str(pid),brand='PH',kind='direct_menu',code='',title=p['name'],rawText=p['name'],dataStatus='estimate',priceType='fixed',displayPriceMinor=p['priceMinor'],officialUrl=p['officialUrl'],variants=[dict(id='menu',priceMinor=p['priceMinor'],items=items,channels=['takeaway'],beverages=[],mainDescription=p['name'])],ordering=dict(platforms=['official_web'],fulfilments=['takeaway'],status='known'),validity=dict(validWindows=[{'from':(checked+timedelta(hours=8)).date().isoformat()}],timezone='Asia/Taipei'),eligibility={},limits={},conditions=conditions,provenance=dict(sourceUrl=p['sourceUrl'],sourcePublisher='必勝客官方菜單',fetchedAt=p['checkedAt']),menuSnapshot=menu,sourceVersionKey='official-menu'))
 for offer in offers:offer['menuSnapshot']['contentSignature']=content_signature(offer)
 data['menuOffers']=offers;data['foodCatalog'].update(food_catalog())
 data['pizzahutMenu']=dict(attemptedAt=cache.get('attemptedAt'),products=len(offers),foods=len(foods),pending=pending,errors=cache.get('errors',[]))
 return data['pizzahutMenu']

def update_file(target,fetcher=fetch,stamp=None):
 target=Path(target);stamp=stamp or datetime.now(timezone.utc).isoformat(timespec='seconds');path=target.parent/'pizzahut_menu.json'
 old=json.loads(path.read_text()) if path.exists() else {};cache=refresh(old,fetcher,stamp)
 # This small official package page contains the actual limited-stock clause.
 evidence_url='https://www.pizzahut.com.tw/order/?mode=step_2&p_id=18168'
 try:
  body=fetcher(evidence_url);tree=Tree();tree.feed(body)
  # Do not save full marketing copy; preserve only the factual stock clause.
  limited=bool(re.search(r'期間限定口味售完為止',tree.root.text()))
  cache['limitedEvidence']=dict(url=evidence_url,checkedAt=stamp,limited=limited,clause='期間限定口味售完為止' if limited else None)
 except Exception:
  if old.get('limitedEvidence'):cache['limitedEvidence']=old['limitedEvidence']
 data=json.loads(target.read_text());report=apply(data,cache)
 path.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')))
 target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--snapshot',default=str(Path(__file__).resolve().parent.parent/'data/offers.json'));p.add_argument('--apply-cache',action='store_true');args=p.parse_args()
 if args.apply_cache:
  target=Path(args.snapshot);data=json.loads(target.read_text());cache=json.loads((target.parent/'pizzahut_menu.json').read_text());apply(data,cache);target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 else:update_file(args.snapshot)
