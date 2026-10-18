"""Normalize factual menu quantities; unknown named foods retain their own identity."""
from hashlib import sha256
import re, unicodedata

CATALOG={}
def norm(text):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',text)).replace('比薩','披薩').replace('苺','莓').replace('卡啦','咔啦')

def add(a,b,mult=1):
    for k,n in b.items():a[k]=a.get(k,0)+n*mult

def beverage(name,quantity,item):
    s=norm(name)
    if not re.search('可樂|七喜|綠茶|紅茶|奶茶|蘋果汁|茉香柚茶|玉米濃湯',s):return []
    kind='soup' if '濃湯' in s else 'milkTea' if '奶茶' in s else 'unsweetened' if '無糖' in s or '原萃' in s else 'cola' if '可樂' in s else 'soda' if '七喜' in s else 'other'
    size='bottle' if re.search(r'L|瓶裝|瓶',s,re.I) else 'small' if '(小)' in s else 'medium' if '(中)' in s or '冰奶茶' in s else 'large' if '(大)' in s else 'cup'
    return [dict(name=name,quantity=quantity,kind=kind,size=size,item=item)]

def atomic(name,quantity=1,allow_generic=True):
    """Return physical items + named beverages. quantity is the number of source packs."""
    raw=name.strip();s=norm(raw)
    s=re.sub(r'\((?:辣|不辣|加量不加價)\)','',s)
    s=re.sub(r'^20:00前供應','',s)
    # Composite option packs are retained as their constituent foods.
    parts=re.split(r'[+＋]',s)
    if len(parts)>1:
        items={};drinks=[]
        for part in parts:
            x,d=atomic(part,quantity,allow_generic);add(items,x);drinks+=d
        return items,drinks
    # Explicit quantity in a product label is per pack, not a second order count.
    count=1
    front=re.match(r'^(\d+)(?:塊|顆|個|份|入)(.+)$',s)
    tail=re.match(r'^(.+?)(\d+)(?:塊|顆|入)$',s)
    if front:count=int(front[1]);s=front[2]
    elif tail:count=int(tail[2]);s=tail[1]
    elif re.fullmatch(r'\d+雞塊',s):count=int(re.match(r'\d+',s)[0]);s='雞塊'
    s=s.replace('原味蛋撻超極酥','原味蛋撻')
    rules=[
      (r'(?:咔啦脆雞|咔啦爆脆雞|爆脆雞|青花椒香麻脆雞|青花椒咔啦脆雞)(?:1塊)?$','chicken',1),
      (r'(?:香草|義式香草|麻油)?紙包雞$','paperChicken',1),
      (r'原味蛋撻禮盒\(6入\)|原味蛋撻禮盒$','tart',6),
      (r'原味蛋撻$|原蛋$','tart',1),
      (r'.*(?:雞腿堡|海陸.*堡|起司.*堡)$','burger',1),
      (r'(?:原味|花生)脆雞堡(?:\(小\))?$','burgerSmall',1),
      (r'(?:香酥脆薯|薯條|小薯)\(小\)$|小薯$','friesSmall',1),
      (r'(?:香酥脆薯|薯條)\(中\)$','friesMedium',1),
      (r'(?:香酥脆薯|薯條)\(大\)$','friesLarge',1),
      (r'(?:上校)?雞塊$','nuggets',1),
      (r'薯餅$','hashBrown',1),
      (r'雙色轉轉QQ球$','qqPack',1),
      (r'鱈魚圈圈$','fishRings',1),
      (r'黃金超蝦塊$','shrimpPack',1),
      (r'草莓起司冰淇淋大福$','daifuku',1),
      (r'爆脆無骨雞腿霸$','bonelessChicken',1),
      (r'雞汁風味飯$','chickenRice',1),
      (r'玉米濃湯\(小\)$','soupSmall',1),
      (r'玉米濃湯\(大\)$','soupLarge',1),
      (r'玉米濃湯$','soupCup',1),
      (r'.*(?:可樂|七喜|紅茶|綠茶|奶茶)\(小\)$','drinkSmall',1),
      (r'.*(?:可樂|七喜|紅茶|綠茶|奶茶)\(中\)$|經典冰奶茶$|冰奶茶$','drinkMedium',1),
      (r'(?:1\.25L)?(?:瓶裝)?(?:百事)?(?:可樂|七喜)$','bottle1250',1),
      (r'1\.25L原萃綠茶$','greenTea1250',1),
      (r'(?:0\.58L|580ml)原萃綠茶$','greenTea580',1),
      (r'(?:100%)?蘋果汁$','appleJuiceBottle',1),
      (r'經典冰奶茶$','milkTeaCup',1),
      (r'茉香柚茶$','yuzuTeaBottle',1),
      (r'薯金幣\(小\)$','potatoCoinsSmall',1),
      (r'薯金幣\(大\)$','potatoCoinsLarge',1),
      (r'黃金雞軟骨\(小\)$','chickenCartilageSmall',1),
      (r'黃金雞軟骨(?:\(大\))?$','chickenCartilageLarge',1),
      (r'德國芝心腸$','germanSausage',1),
      (r'火辣辣芝心腸$','spicySausage',1),
      (r'(?:黃金)?和風鱈魚塊$','codBites',1),
      (r'巧克力QQ球$','chocolateQQ',1),
      (r'麻糬QQ球$','mochiQQ',1),
      (r'厚燒醬烤(?:腿排|雞腿)$','roast',1),
      (r'樂事mini$','chipsMini',1),
      (r'超蝦點心拼盤$','seafoodPlatter',1),
      (r'蜂蜜風味紅茶$','honeyTeaCup',1),
      (r'熱紅茶$','hotTeaCup',1),
      (r'青花椒醬飯$','pepperRice',1),
      (r'蒜香白醬飯$','creamRice',1),
      (r'青花椒醬脆雞飯$','pepperChickenRice',1),
      (r'蒜香白醬脆雞飯$','creamChickenRice',1),
      (r'紅豆奶皇蛋撻$','redBeanTart',1),
      (r'愛心蝦球$','shrimpBalls',1),
      (r'(?:黃金)?雞柳條$','chickenStrips',1),
      (r'酥炸嫩雞球$','chickenBalls',1),
      (r'酥炸杏鮑菇$','friedMushrooms',1),
      (r'0\.33L(?:百事)?(?:可樂|七喜)$','soda330',1),
      (r'0\.3L茉香柚茶$','yuzu300',1),
      (r'Flatzz手工個人薄披薩$','flatzzPersonal',1),
      (r'Flatzz手工義式薄披薩$','flatzzThin',1),
      (r'紅藜燕麥脆雞粥$','chickenPorridge',1),
      (r'總匯歐姆蛋燒餅$','omeletFlatbread',1),
      (r'吮指脆雞燒餅$','chickenFlatbread',1),
    ]
    # Calling Taiwan spells the literal ball count; the KCouper feed spells a pack.
    if '雙色轉轉QQ球'==s and count!=1:key='qq';factor=1
    else:
        match=next(((key,factor) for pattern,key,factor in rules if re.fullmatch(pattern,s,re.I)),None)
        if match:key,factor=match
        elif re.search('義大利麵|筆管麵|千層麵|(?:起司|彩蔬)麵',s):key,factor='pasta',1
        elif re.match(r'(6|9|13)吋.*披薩$',s):key,factor={'6':'pizza6','9':'pizza9','13':'pizza13'}[s[:s.index('吋')]],1
        elif not allow_generic:raise ValueError('品項對照待確認：'+raw)
        else:
            if not s or re.search(r'選|加價|加購|起$|限定|以下|以上|優惠代|使用期限|=|[:：]|滿\d',s):raise ValueError('內容未完整解析：'+raw)
            key='food_'+sha256(s.encode()).hexdigest()[:12];factor=1
            CATALOG[key]=dict(name=raw,unit='份',emoji='🍽️')
    n=quantity*count*factor
    if not isinstance(n,int) or n<0 or n>60:raise ValueError('數量超出範圍：'+raw)
    return {key:n},beverage(raw,n,key)

EXTENDED={
 'burgerSmall':dict(name='小漢堡',unit='個',emoji='🍔'),
 'friesMedium':dict(name='中份薯條',unit='份',emoji='🍟'),
 'qqPack':dict(name='雙色轉轉 QQ 球（份）',unit='份',emoji='🟠'),
 'shrimpPack':dict(name='黃金超蝦塊（份）',unit='份',emoji='🍤'),
 'bonelessChicken':dict(name='爆脆無骨雞腿霸',unit='塊',emoji='🍗'),
 'chickenRice':dict(name='雞汁風味飯',unit='份',emoji='🍚'),
 'soupSmall':dict(name='小杯玉米濃湯',unit='杯',emoji='🥣'),
 'soupLarge':dict(name='大杯玉米濃湯',unit='杯',emoji='🥣'),
 'chickenCartilageLarge':dict(name='黃金雞軟骨（大）',unit='份',emoji='🍗'),
 'pizza6':dict(name='6 吋個人披薩',unit='個',emoji='🍕'),
}
CATALOG.update(EXTENDED)
for key,name,unit in [
 ('honeyTeaCup','蜂蜜風味紅茶（容量未標）','杯'),('hotTeaCup','熱紅茶（容量未標）','杯'),
 ('pepperRice','青花椒醬飯','份'),('creamRice','蒜香白醬飯','份'),
 ('pepperChickenRice','青花椒醬脆雞飯','份'),('creamChickenRice','蒜香白醬脆雞飯','份'),
 ('redBeanTart','紅豆奶皇蛋撻','顆'),('shrimpBalls','愛心蝦球','顆'),('chickenStrips','雞柳條','條'),
 ('chickenBalls','酥炸嫩雞球','份'),('friedMushrooms','酥炸杏鮑菇','份'),('soda330','330ml 瓶裝汽水','瓶'),
 ('yuzu300','300ml 茉香柚茶','瓶'),('flatzzPersonal','Flatzz 手工個人薄披薩（尺寸未標）','個'),
 ('flatzzThin','Flatzz 手工義式薄披薩（尺寸未標）','個'),('chickenPorridge','紅藜燕麥脆雞粥','份'),
 ('omeletFlatbread','總匯歐姆蛋燒餅','份'),('chickenFlatbread','吮指脆雞燒餅','份')]:
    CATALOG[key]=dict(name=name,unit=unit,emoji='🍽️')
