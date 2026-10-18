import copy,json,sys,unittest,subprocess,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools'))
from catalog import make_offer,FEEDS
import kfc_description as k

FIX=json.loads((ROOT/'tests/fixtures/kfc_intro_20261018.json').read_text())
STAMP='2026-10-18T06:00:00Z'
def offer(code='16725'):
    count=2 if code=='16725' else 4
    raw=dict(name=code+'-中秋雙雞',price=300,product_code=FIX[code]['detail']['Fcode'],items=[dict(name='咔啦脆雞(辣)',count=count,flavors=[]),dict(name='2塊咔啦脆雞(辣)',count=1,flavors=[dict(name='麻油紙包雞',addition_price=13)])],start_date='2026-09-02',end_date='2026-12-29',order_types=[2],meal_periods=[3])
    return make_offer(dict(code=code,text=raw['name'],priceMinor=30000,structured=raw,windows=[]),next(f for f in FEEDS if f['id']=='kcouper'),STAMP)

class OfficialDescriptionTests(unittest.TestCase):
    def test_real_codes_use_intro_instead_of_default_and_surcharge(self):
        for code,chicken in [('16725',2),('16726',4)]:
            o=offer(code);k.apply_entry(o,FIX[code]);v=o['variants'][0]
            self.assertEqual(v['priceMinor'],30000);self.assertEqual(v['surchargeMinor'],0)
            self.assertEqual(v['items']['chicken'],chicken);self.assertEqual(v['items']['paperChicken'],1)
            self.assertEqual(v['optionGroups'],[]);self.assertIn('香草紙包雞',v['mainDescription'])
            if code=='16725':self.assertEqual(v['items'],dict(chicken=2,paperChicken=1,nuggets=8,tart=2))
            self.assertTrue(o['sourceMetadata']['officialMeal']['orderingDiffers'])
            self.assertTrue(o['sourceMetadata']['officialMeal']['soldOut'])
            self.assertTrue(any('其他門市' in s for s in o['conditions']))
            self.assertEqual(o['sourceVersions'][0]['variants'],o['variants'])
            self.assertEqual(o['validity']['validWindows'][0]['toExclusive'],'2026-12-30')
    def test_empty_description_or_price_conflict_cannot_fall_back_to_default(self):
        for mutation in [dict(Intro=''),dict(Intro='1份香草紙包雞，價格依現場為準')]:
            e=copy.deepcopy(FIX['16725']);e['detail'].update(mutation);o=offer();k.apply_entry(o,e)
            self.assertEqual(o['dataStatus'],'pending');self.assertEqual(o['variants'],[])
            self.assertEqual(o['sourceVersions'][0]['variants'],[])
    def test_intro_price_includes_compulsory_drink_component(self):
        d=copy.deepcopy(FIX['16726']['detail']);d.update(Original_Price=97,Intro='1份香草紙包雞+1顆原味蛋撻+1杯冰無糖綠茶(小)=NT$130元(原價NT$213元)')
        variants,_,_=k.recipe(d,offer('16726'))
        self.assertEqual(variants[0]['priceMinor'],13000)
        self.assertEqual(variants[0]['items'],dict(paperChicken=1,tart=1,drinkSmall=1))
    def test_explicit_boxes_choices_and_piece_units_are_preserved(self):
        d=copy.deepcopy(FIX['16726']['detail'])
        d['Intro']='1盒原味蛋撻(6入)+黃金超蝦塊3塊+10顆雙色轉轉QQ球+(5選1):經典冰奶茶或可樂(中)或七喜(中)或冰檸檬紅茶(中)或無糖綠茶(中)=NT$300'
        variants,groups,_=k.recipe(d,offer('16726'))
        self.assertEqual(len(variants),5)
        for v in variants:
            self.assertEqual(v['items']['tart'],6);self.assertEqual(v['items']['shrimpPieces'],3);self.assertEqual(v['items']['qq'],10)
            self.assertNotIn('shrimpPack',v['items']);self.assertEqual(v['priceMinor'],30000)
    def test_explicit_unconditional_gifts_after_price_are_not_lost(self):
        d=copy.deepcopy(FIX['16726']['detail']);d['Intro']='買1盒原味蛋撻(6入)=NT$262元(原價NT$294元) 送1份香草紙包雞(市價$131)'
        variants,_,_=k.recipe(d,offer('16726'))
        self.assertEqual(variants[0]['priceMinor'],26200);self.assertEqual(variants[0]['items'],dict(tart=6,paperChicken=1))
        d['Intro']='買2塊咔啦脆雞=NT$139 會員才送1份香草紙包雞'
        with self.assertRaises(ValueError):k.recipe(d,offer('16726'))
    def test_rate_limit_defers_other_codes_without_faking_queries_or_invalidity(self):
        calls=[]
        def limited(q):
            calls.append(q);raise urllib.error.HTTPError(k.ENDPOINT,429,'limit',{},None)
        d=dict(offers=[offer('16725'),offer('16726')])
        cache,report=k.refresh(d,{},limited,STAMP,workers=1)
        self.assertEqual(len(calls),1);self.assertEqual(report['queried'],1);self.assertEqual(report['deferred'],1)
        self.assertTrue(all(o['dataStatus']=='pending' for o in d['offers']))
        self.assertTrue(all(e['status']=='error' for e in cache['byCode'].values()))
    def test_shared_physical_category_does_not_erase_flavor_counts(self):
        d=copy.deepcopy(FIX['16726']['detail']);d['Intro']='1塊咔啦脆雞+1塊青花椒香麻脆雞=NT$150'
        d['Details']=[dict(Title='炸雞',MinCount=2,MList=[dict(Name='咔啦脆雞(辣)',MListPrice=0,AddPrice=0),dict(Name='青花椒香麻脆雞',MListPrice=7,AddPrice=7)])]
        variants,_,differs=k.recipe(d,offer('16726'))
        self.assertTrue(differs);self.assertEqual(variants[0]['items'],dict(chicken=2));self.assertEqual(variants[0]['optionGroups'],[])
        d['Intro']='2塊咔啦脆雞=NT$150'
        variants,_,differs=k.recipe(d,offer('16726'))
        self.assertFalse(differs);self.assertEqual(variants[0]['optionGroups'][0]['count'],2)
    def test_response_is_bound_to_coupon_and_product(self):
        e=FIX['16725'];row=copy.deepcopy(e['detail']);row['couponCode']='16726'
        with self.assertRaises(ValueError):k.parse_response('16725',e['query'],dict(Success=True,Data=dict(FoodDetail=[row])),STAMP)
    def test_cache_reused_and_errors_keep_original_evidence_time(self):
        o=offer();d=dict(offers=[o]);cache=dict(version=1,byCode={'16725':FIX['16725']})
        def fail(q):raise TimeoutError('offline')
        result,report=k.refresh(d,cache,fail,STAMP)
        self.assertEqual(report['reused'],1)
        result,report=k.refresh(d,result,fail,'2026-10-26T06:00:00Z')
        self.assertEqual(report['retainedSuccessful'],1)
        self.assertEqual(d['offers'][0]['variants'][0]['priceMinor'],30000)
        self.assertEqual(d['offers'][0]['sourceMetadata']['officialMeal']['checkedAt'],FIX['16725']['checkedAt'])
        self.assertEqual(d['offers'][0]['sourceMetadata']['officialMeal']['status'],'error')
    def test_missing_or_mismatched_evidence_preserves_code_but_not_old_recipe(self):
        for old in [{},copy.deepcopy(FIX['16726'])]:
            o=offer();k.apply_entry(o,dict(status='error',lastSuccess=old))
            self.assertEqual(o['code'],'16725');self.assertEqual(o['dataStatus'],'pending');self.assertEqual(o['variants'],[])
    def test_solver_and_catalog_both_use_300_dollar_paper_chicken(self):
        for code,chicken in [('16725',2),('16726',4)]:
            o=offer(code);k.apply_entry(o,FIX[code])
            d=dict(mode='real',offers=[o],recommendationPolicy=dict(allowAllSources=True),sourcePolicy=dict(KFC=dict(compositionBasis='official_intro')))
            js="""const F=require('./src/engine.js'),assert=require('node:assert/strict');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const d=JSON.parse(s),r={demand:{paperChicken:1,chicken:CHICKEN},people:1,budgetMinor:30000,brands:['KFC'],channel:'takeaway',at:'2026-10-18T13:00:00+08:00',maxOrders:1,estimate:true,allowExtras:true,avoid:[],drinkPreference:'any'};const o=F.catalogOffer(d.offers[0]),c=F.catalogChoice(o,'paperChicken',r.at);assert.equal(c.total,30000);assert.equal(c.selected.items.paperChicken,1);assert.equal(c.selected.items.chicken,CHICKEN);const p=F.solve(d,r).plans[0];assert(p);assert.equal(p.totalCost,30000);assert.equal(p.orders[0].officialMeal.soldOut,true);});""".replace('CHICKEN',str(chicken))
            subprocess.run(['node','-e',js],input=json.dumps(d),text=True,cwd=ROOT,check=True,capture_output=True)

if __name__=='__main__':unittest.main()
