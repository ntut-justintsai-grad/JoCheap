"""Add reviewed meal families and allowed flavor sets; no guessed coupon prices."""
import copy
from datetime import datetime,timezone
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def enrich(data):
    flavors={}
    def f(name):
        if name not in flavors:
            tag='seafood' if any(x in name for x in ['海鮮','章魚','蝦','蛤','干貝','鱈魚']) else 'meat' if any(x in name for x in ['牛','豬','雞','培根','臘腸','墨西哥','夏威夷']) else 'other'
            flavors[name]={'name':name,'tags':[tag],'classification':'name_based_preference_not_dietary'}
        return name
    def slot(size,names):return {'size':size,'allowed':[f(n) for n in names]}
    common=['和風章魚燒','韓式泡菜豬五花','超級總匯','炙燒明太子嫩雞','超級夏威夷','火辣辣墨西哥']
    common14=common+['彩蔬鮮菇','BBQ黃金嫩雞','熱帶鳳梨海鮮總匯','日式照燒雞','義式培根薯金幣','四小福','夏威夷','蒜香起司燻雞培根']
    slots={
        '16448':[slot('pizza9',common+['松露蕈菇起司丁']),slot('pizza9',['炙燒豬肉總匯','蒜香起司燻雞培根','熱帶鳳梨海鮮總匯','彩蔬鮮菇','日式照燒雞','醬燒鮮蛤田園'])],
        '16420':[slot('pizza9',common),slot('pizza9',common)],
        '16419':[slot('pizza9',common)],
        '16171':[slot('pizza9',['夏威夷','四小福','彩蔬鮮菇']),slot('pizza9',['和風章魚燒','韓式泡菜豬五花','超級總匯'])],
        '16007':[slot('pizza13',['炙燒豬肉總匯','彩蔬鮮菇']),slot('pizza9',common14)],
        '16402':[slot('pizza9',['火辣辣墨西哥'])],
        '16450':[slot('pizza9',[n]) for n in ['霸王雙雞','炙燒明太子嫩雞','日式照燒雞']],
        '26823':[slot('pizza13',['經典海鮮四重奏','鐵板雙牛','韓式泡菜豬五花','炙燒明太子嫩雞','超級夏威夷','超級總匯','BBQ黃金嫩雞','彩蔬鮮菇','熱帶鳳梨海鮮總匯'])],
        '16422':[slot('pizza9',['松露起司丁'])],
        '16425':[slot('pizza9',['彩蔬鮮菇']),slot('pizza9',['彩蔬鮮菇'])],
        '16168':[slot('pizza9',['松露干貝鮮蝦起司','法式海陸盛宴','千島海鮮盛宴'])],
        '16118':[slot('pizza13',['和風章魚燒','鐵板雙牛','超級總匯','炙燒明太子嫩雞','松露蕈菇起司丁']),slot('pizza13',['香濃蒜香海鮮','彩蔬鮮菇','四小福','夏威夷','日式照燒雞','蒜香起司燻雞培根','義式培根薯金幣','炙燒豬肉總匯'])],
    }
    stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    def row(brand,code,title,price,items,expiry,description=None):
        template=copy.deepcopy(next(o for o in data['offers'] if o['brand']==brand and o['dataStatus']!='conflict'))
        template.update(id=brand.lower()+'-'+code,code=code,title=title,dataStatus='estimate')
        template['variants']=[dict(id='standard',priceMinor=price*100,surchargeMinor=0,items=items,individualMains=0,channels=['unknown'],choice=None,mainDescription=description)]
        template['validity']['validWindows']=[dict(from_=None,toExclusive=expiry)];template['validity']['validWindows'][0]['from']=template['validity']['validWindows'][0].pop('from_')
        template['provenance'].update(fetchedAt=stamp,parsedAt=stamp,sourceBlockId=code,method='manual_transcription_from_readable_source')
        template['provenance'].pop('expectedItems',None)
        template['conditions']=['來源價格與數量已轉錄；通路、限購及門市須於官方結帳確認。']
        return template
    new=[
        row('KFC','16298','香草紙包雞雙雞餐',159,dict(paperChicken=1,chicken=1,drinkSmall=1),'2027-02-01','香草紙包雞 1 份；另有原塊炸雞 1 塊'),
        row('KFC','16461','紙包雞鱈魚圈圈餐',145,dict(paperChicken=1,fishRings=1,drinkMedium=1),'2027-02-01','香草紙包雞 1 份；飲料為中杯，不當成小杯數量'),
        row('PH','16400','泡菜起司雪花牛筆管麵餐',222,dict(pasta=1,chickenCartilageSmall=1),'2027-04-01','泡菜起司雪花牛筆管麵 1 份'),
        row('PH','16358','私廚筆管麵與小披薩',309,dict(pasta=1,pizza9=1),'2026-12-11'),
        row('PH','16118','兩個大披薩組',555,dict(pizza13=2),'2027-01-01'),
    ]
    for o in new:
        if not any(x['id']==o['id'] for x in data['offers']):data['offers'].append(o)
    pasta=next(o for o in data['offers'] if o['brand']=='PH' and o['code']=='16358')
    base=pasta['variants'][0]
    pasta['variants']=[]
    for i,name in enumerate(['泡菜起司雪花牛','明太子干貝鮮蝦','青醬干貝鱈魚','白醬干貝鱈魚','白醬炭烤雞肉','紅醬嫩牛乳酪']):
        v=copy.deepcopy(base);v.update(id='pasta-'+str(i+1),mainDescription=name+'筆管麵 1 份',pastaTags=['seafood' if any(c in name for c in ['蝦','干貝','鱈魚']) else 'meat'],choice='小披薩依來源限原價 410 元以下口味；口味未指定，需結帳確認。')
        pasta['variants'].append(v)
    # Reading the full source revealed a second, incompatible use of code 16325.
    existing=[o for o in data['offers'] if o['brand']=='PH' and o['code']=='16325']
    if len(existing)==1:
        second=row('PH','16325','飯麵與個人披薩（同碼衝突）',189,dict(pasta=1),'2027-04-01')
        second['id']='ph-16325-conflict-other';data['offers'].append(second)
    for o in data['offers']:
        if o['brand']=='PH' and o['code']=='16325':
            o['dataStatus']='conflict';o['provenance']['conflictGroupId']='PH-16325'
        for v in o['variants']:
            if o['brand']=='PH' and o['code'] in slots:
                v['pizzaSlots']=copy.deepcopy(slots[o['code']]);v['choice']='披薩口味依本券各區允許名單分配；'+(v.get('choice','').split('；配餐選 ')[-1] if '；配餐選 ' in (v.get('choice') or '') else '結果會列出實際口味。')
                if o['code']=='16420':v['distinctPizzaSlots']=True
            if v['items'].get('pasta'):
                v['individualMains']=v['items']['pasta'];v['individualMainItems']={'pasta':v['items']['pasta']}
                if o['code']=='16400':v['pastaTags']=['meat']
            if v['items'].get('paperChicken'):
                v['individualMains']=v['items']['paperChicken'];v['individualMainItems']={'paperChicken':v['items']['paperChicken']}
    data['pizzaFlavors']=flavors;data['datasetVersion']='2026-10-16-v3-simple';data['generatedAt']=stamp
    return data

def main():
    path=ROOT/'data/offers.json';data=enrich(json.loads(path.read_text(encoding='utf-8')));path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    dp=ROOT/'data/demo.json';demo=json.loads(dp.read_text(encoding='utf-8'));demo['pizzaFlavors']={'demo-sea-a':{'name':'示範鮮蝦','tags':['seafood']},'demo-sea-b':{'name':'示範蛤蜊','tags':['seafood']},'demo-meat':{'name':'示範雞肉','tags':['meat']}}
    for o in demo['offers']:
        for v in o['variants']:
            slots=[]
            for size in ['pizza9','pizza13']:
                slots.extend({'size':size,'allowed':list(demo['pizzaFlavors'])} for _ in range(v['items'].get(size,0)))
            if slots:v['pizzaSlots']=slots
    if not any(o['code']=='DEMO-I' for o in demo['offers']):
        for code,item,title,price in [('DEMO-I','pasta','示範義大利麵餐',159),('DEMO-J','paperChicken','示範紙包雞餐',179)]:
            o=copy.deepcopy(next(o for o in demo['offers'] if o['code']=='DEMO-G'));o.update(id='demo-'+code,code=code,title=title)
            o['variants'][0].update(items={item:1,'friesSmall':1,'drinkSmall':1},individualMains=1,individualMainItems={item:1},priceMinor=price*100,mainDescription=title)
            if item=='pasta':o['variants'][0]['pastaTags']=['meat']
            demo['offers'].append(o)
    dp.write_text(json.dumps(demo,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Enriched source records:',len(data['offers']))

if __name__=='__main__':main()
