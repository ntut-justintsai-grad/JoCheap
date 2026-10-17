"""Reproduce the small, manually transcribed source snapshot (not a crawler)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = '2026-10-16T06:36:00Z'
SNACK_STAMP = '2026-10-16T06:58:00Z'
SOURCE = {'KFC': 'https://info.talk.tw/kfc-coupon/', 'PH': 'https://info.talk.tw/pizzahut-coupon/'}
OFFICIAL = {'KFC': 'https://www.kfcclub.com.tw/coupon', 'PH': 'https://www.pizzahut.com.tw/promotions/?mode=cpSch&type=plu'}

def offer(brand, code, title, price, items, expiry, *, mains=0, choice=None, conditions=None, suffix=''):
    return dict(id=f'{brand.lower()}-{code}{suffix}', brand=brand, code=code, title=title,
        priceType='fixed', dataStatus='estimate', officialUrl=OFFICIAL[brand],
        variants=[dict(id='standard', priceMinor=price*100, surchargeMinor=0,
            items=items, individualMains=mains, channels=['unknown'], choice=choice)],
        validity=dict(validWindows=[dict(from_=None,toExclusive=expiry)],startUnknown=True,timeBasis='order_time',timezone='Asia/Taipei'),
        eligibility=dict(memberRequired=None,appRequired=None,storeScope='unknown'),
        limits=dict(maxUsesPerUserPerDay=None,sharedLimitGroup=None),
        combinationPolicy=dict(sameOrder='unknown',separateOrders='unknown'),
        conditions=conditions or ['適用通路、門市、限購及多券使用規則待確認。'],
        provenance=dict(sourceUrl=SOURCE[brand],sourcePublisher='好康情報誌',sourceType='aggregator',
            fetchedAt=STAMP,parsedAt=STAMP,officialVerifiedAt=None,officialEvidenceUrl=None,
            method='manual_transcription_from_readable_source',reviewStatus='source_fields_checked',sourceBlockId=code))

rows = [
    offer('KFC','16845','4 件好時光',135,dict(burger=1,tart=1,friesSmall=1,drinkSmall=1),'2027-03-01',mains=1),
    offer('KFC','16844','雙層暖心點',167,dict(burger=1,tart=1,drinkSmall=1),'2027-03-01',mains=1),
    offer('KFC','16843','花生好事多',169,dict(burger=1,tart=1,friesSmall=1,drinkSmall=1),'2027-03-01',mains=1),
    offer('KFC','16858','QQ 雞套餐',130,dict(chicken=2,qq=10),'2027-03-01'),
    offer('KFC','16839','炸雞雞塊獨享餐',139,dict(chicken=2,nuggets=4,drinkSmall=1),'2027-03-01'),
    offer('KFC','16842','炸雞經典餐',163,dict(chicken=2,tart=1,friesSmall=1,drinkSmall=1),'2027-03-01'),
    offer('KFC','16840','雙雞饗宴 8 件組',168,dict(chicken=2,nuggets=4,tart=1,drinkSmall=1),'2027-03-01'),
    offer('KFC','16859','雞塊富翁餐',189,dict(nuggets=20,drinkSmall=1),'2027-03-01'),
    offer('KFC','16388','午茶三件組',80,dict(tart=2,drinkSmall=1),'2027-01-21'),
    offer('KFC','26975','蛋撻五件組',141,dict(tart=4,drinkSmall=1),'2026-12-01'),
    offer('KFC','16658','蛋撻與瓶裝可樂',148,dict(tart=4,bottle1250=1),'2027-04-01'),
    offer('KFC','16720','雙小堡與綠茶',99,dict(burger=2,drinkSmall=2),'2026-12-30',conditions=['小型原味脆雞堡，不自動計作獨立主餐。','適用通路、門市、限購及多券使用規則待確認。']),
    offer('PH','16448','雙 9 吋披薩組',250,dict(pizza9=2),'2027-04-01',choice='A 區：超級總匯；B 區：日式照燒雞，皆為鬆厚餅皮。'),
    offer('PH','16420','雙披薩分享組',298,dict(pizza9=2),'2027-04-01',choice='超級總匯、超級夏威夷，各 1 個 9 吋鬆厚披薩。'),
    offer('PH','16419','小披薩與烤腿排',298,dict(pizza9=1,roast=4),'2027-04-01',choice='9 吋超級總匯鬆厚披薩 1 個；烤腿排不算原塊炸雞。'),
    offer('PH','16171','兩款 9 吋披薩',298,dict(pizza9=2),'2027-02-01',choice='夏威夷與超級總匯各 1 個，鬆厚餅皮。'),
    offer('PH','16007','大小披薩組',368,dict(pizza13=1,pizza9=1),'2027-02-01',choice='13 吋炙燒豬肉總匯與 9 吋超級總匯，鬆厚餅皮。'),
]

def choices(row, base, options, prefix):
    template=row['variants'][0]
    row['variants']=[]
    for label, items in options:
        variant=dict(template,id='choice-'+str(len(row['variants'])+1),items=dict(base,**items),choice=prefix+'；配餐選 '+label)
        row['variants'].append(variant)
    row['conditions'].append('每次優惠僅選本配置的一種配餐；不同選項共用此優惠的使用限額。')
    return row

snack_rows=[
    offer('KFC','50551','四塊脆雞與綠茶',175,dict(chicken=4,drinkSmall=2),'2026-10-20'),
    offer('KFC','16849','雞塊大薯共享組',239,dict(nuggets=20,friesLarge=1,drinkSmall=2),'2027-03-01'),
    offer('KFC','16851','脆雞薯餅組',79,dict(chicken=1,hashBrown=1,drinkSmall=1),'2027-03-01'),
    offer('KFC','16125','蛋撻綠茶午茶組',50,dict(tart=1,drinkSmall=1),'2026-12-01'),
    offer('KFC','16672','蛋撻大福奶茶組',88,dict(tart=1,daifuku=1,milkTeaCup=1),'2026-12-21'),
    offer('KFC','26833','雙蛋撻蘋果汁組',85,dict(tart=2,appleJuiceBottle=1),'2026-11-01'),
    offer('KFC','16399','雙蛋撻大福組',115,dict(tart=2,daifuku=1,drinkSmall=1),'2026-12-21'),
    offer('KFC','16722','雙小堡薯餅組',118,dict(burger=2,hashBrown=2),'2026-12-30'),
    offer('KFC','16724','雙小堡大福組',158,dict(burger=2,daifuku=2),'2026-12-30'),
    offer('KFC','16848','超蝦點心拼盤組',179,dict(seafoodPlatter=1,drinkSmall=2),'2027-03-01',conditions=['拼盤含超蝦塊、魚圈圈、雙色 QQ 球及大薯，但各單品數量未明，僅以完整拼盤 1 份計數。','通路、門市、限購及多券使用條款待確認。']),
    offer('KFC','16852','漢堡雞塊雙杯組',219,dict(burger=1,nuggets=8,tart=2,drinkSmall=2),'2027-03-01',mains=1),
    offer('KFC','16853','雙堡點心組',245,dict(burger=2,tart=1,friesSmall=1,nuggets=4,drinkSmall=2),'2027-03-01',mains=2),
    offer('PH','16402','小披薩辣芝心腸組',288,dict(pizza9=1,spicySausage=6),'2027-04-01',choice='9 吋火辣辣墨西哥鬆厚披薩，搭配 6 條火辣辣芝心腸。'),
    choices(offer('PH','16449','雙小披薩歡聚配餐',398,{},'2027-04-01'),dict(pizza9=2),[
        ('5 塊厚燒醬烤腿排',dict(roast=5)),('1 份 BBQ 烤雞組（3 腿 3 翅）',dict(bbqChickenSet=1)),
        ('10 塊和風鱈魚塊',dict(codBites=10)),('6 條德國芝心腸',dict(germanSausage=6)),('6 條火辣辣芝心腸',dict(spicySausage=6))
    ],'兩個 9 吋鬆厚披薩，依來源限原價 410 元以下口味；尚未指定口味，須結帳確認'),
    choices(offer('PH','16450','三款小披薩配點心',419,{},'2027-04-01'),dict(pizza9=3),[
        ('4 顆巧克力 QQ 球',dict(chocolateQQ=4)),('1 瓶 1.25L 可樂',dict(bottle1250=1)),('2 杯玉米濃湯',dict(soupCup=2))
    ],'9 吋霸王雙雞、炙燒明太子嫩雞及日式照燒雞鬆厚披薩各 1 個'),
    choices(offer('PH','26823','大披薩點心分享組',633,{},'2026-12-01'),dict(pizza13=1,potatoCoinsSmall=1,chocolateQQ=5,bottle1250=1),[
        ('4 塊烤腿排',dict(roast=4)),('6 條德國芝心腸',dict(germanSausage=6))
    ],'13 吋超級總匯鬆厚披薩；另含小薯金幣、巧克力 QQ 球及可樂'),
    choices(offer('PH','16422','松露小披薩配點心',222,{},'2027-01-01'),dict(pizza9=1),[
        ('1 份大薯金幣',dict(potatoCoinsLarge=1)),('10 顆麻糬 QQ 球',dict(mochiQQ=10)),('1 瓶原萃綠茶 1.25L',dict(greenTea1250=1))
    ],'9 吋松露起司丁鬆厚披薩'),
    choices(offer('PH','16425','雙披薩薯金幣組',298,{},'2027-01-01'),dict(pizza9=2,potatoCoinsSmall=1),[
        ('1 瓶原萃綠茶 580ml',dict(greenTea580=1)),('5 顆巧克力 QQ 球',dict(chocolateQQ=5))
    ],'兩個 9 吋彩蔬鮮菇鬆厚披薩，另附 1 份小薯金幣'),
    choices(offer('PH','16325','小披薩幸福配餐',139,{},'2027-02-01'),dict(pizza9=1),[
        ('1 包樂事 mini',dict(chipsMini=1)),('4 顆巧克力 QQ 球',dict(chocolateQQ=4)),('1 瓶茉香柚茶',dict(yuzuTeaBottle=1))
    ],'9 吋夏威夷鬆厚披薩'),
    choices(offer('PH','16168','海鮮小披薩配餐',299,{},'2027-02-01'),dict(pizza9=1),[
        ('5 顆巧克力 QQ 球',dict(chocolateQQ=5)),('1 份小黃金雞軟骨',dict(chickenCartilageSmall=1)),('1 份小薯金幣',dict(potatoCoinsSmall=1))
    ],'9 吋松露干貝鮮蝦起司鬆厚披薩'),
]
for row in snack_rows:
    row['provenance'].update(fetchedAt=SNACK_STAMP,parsedAt=SNACK_STAMP)
    if row['code'] in {'16722','16724'}:row['conditions'].append('小型漢堡不自動計為獨立主餐。')
rows.extend(snack_rows)
# Preserve the two conflicting records under each code; never pick the cheaper row.
for row in [
    offer('KFC','26953','蛋撻與瓶裝可樂（衝突紀錄 1）',209,dict(tart=6,bottle1250=1),'2026-11-01',suffix='-a'),
    offer('KFC','26953','蛋撻與紙包雞（衝突紀錄 2）',262,dict(tart=6),'2027-02-01',suffix='-b'),
    offer('PH','26701','兩個 6 吋披薩（衝突紀錄 1）',399,{},'2026-11-01',suffix='-a'),
    offer('PH','26701','13 吋大披薩組（衝突紀錄 2）',399,dict(pizza13=1),'2026-11-01',suffix='-b'),
]:
    row['dataStatus']='conflict';row['provenance']['conflictGroupId']=row['brand']+'-'+row['code']
    row['conditions']=['同一來源的相同優惠碼對應不同內容，已排除計算。'];rows.append(row)

for row in rows:
    for w in row['validity']['validWindows']:w['from']=w.pop('from_')
    row['provenance']['expectedItems']=row['variants'][0]['items']
data=dict(schemaVersion=1,datasetVersion='2026-10-16-selected-v2',mode='real',generatedAt=SNACK_STAMP,
    updateStatus='configured_not_verified',coverage='partial',sources=[dict(brand=b,sourceUrl=SOURCE[b],
    sourcePublisher='好康情報誌',sourceType='aggregator',coverage='partial',lastAttemptAt=STAMP,
    lastSuccessAt=STAMP,status='manual_snapshot',errorSummary='開發環境直接 HTTP 連線不可用；由可讀來源逐筆轉錄，定時更新尚未實測。') for b in SOURCE],offers=rows)
ROOT.joinpath('data/offers.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
demo=[]
for code,brand,title,price,items,limit in [
    ('A','KFC','炸雞蛋撻組',139,dict(chicken=2,tart=1),2),
    ('B','KFC','單塊炸雞',65,dict(chicken=1),6),
    ('C','KFC','六顆蛋撻',199,dict(tart=6),6),
    ('D','PH','大披薩',199,dict(pizza13=1),6),
    ('E','KFC','四塊炸雞',249,dict(chicken=4),6),
    ('F','KFC','四塊雞與兩顆蛋撻',299,dict(chicken=4,tart=2),6),
    ('G','KFC','漢堡個人餐',129,dict(burger=1,drinkSmall=1),6),
    ('H','PH','雙小披薩',250,dict(pizza9=2),6),
]:
    row=offer(brand,'DEMO-'+code,'示範 '+title,price,items,'2099-01-01',mains=1 if code=='G' else 0)
    row['dataStatus']='demo';row['isDemo']=True;row['variants'][0]['channels']=['takeaway','delivery']
    row['eligibility']=dict(memberRequired=False,appRequired=False,storeScope='demo_all')
    row['limits']['maxUsesPerUserPerDay']=limit;row['combinationPolicy']['separateOrders']='allowed'
    row['provenance']['sourceUrl']=None;row['provenance']['method']='synthetic_fixture'
    if code=='G':row['variants'][0]['items']['friesSmall']=1
    row['conditions']=['合成示範資料，不能兌換。'];demo.append(row)
ROOT.joinpath('data/demo.json').write_text(json.dumps(dict(schemaVersion=1,datasetVersion='demo-v2',mode='demo',generatedAt=STAMP,sources=[],offers=demo),ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Wrote {len(rows)} source records and {len(demo)} demonstration records')
from enrich_data import main as enrich_main
enrich_main()
