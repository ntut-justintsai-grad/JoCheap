import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import catalog as c
import crawl_catalog as crawler
from ordering_rules import parse_ordering,apply_reviewed_ordering
from food_parser import atomic

class CatalogTests(unittest.TestCase):
    def test_calling_headers_codes_prices_and_separated_date_windows(self):
        html='<nav>00000</nav><article><table><tr><th>有效期限</th><th>優惠名稱/內容</th><th>金額</th><th>優惠代碼</th></tr><tr><td>2026/09/29-2026/10/26 2026/11/16-2026/11/30</td><td>【範例】咔啦脆雞 × 2 + 原味蛋撻禮盒（6入）× 1</td><td>299 元</td><td>00123 (點擊優惠代碼可複製)</td></tr></table></article>'
        rows=c.source_records(html,c.PARSER_FEEDS[2],'now');self.assertEqual(rows[0]['code'],'00123');self.assertEqual(rows[0]['priceMinor'],29900)
        self.assertEqual(rows[0]['windows'],[dict(from_='2026-09-29',toExclusive='2026-10-27'),dict(from_='2026-11-16',toExclusive='2026-12-01')])
        offer=c.make_offer(rows[0],c.PARSER_FEEDS[2],'now');self.assertEqual(offer['variants'][0]['items'],{'chicken':2,'tart':6})
    def test_choices_are_exclusive_and_may_not_silently_drop_an_option(self):
        configs,groups=c.parse_meal('9 吋披薩 × 1 + 副食 3 選 1（薯金幣（小）× 1／麻糬QQ球 × 5／德國芝心腸 × 3）','PH')
        self.assertEqual(len(configs),3);self.assertTrue(all(len(x['items'])==2 for x in configs))
        with self.assertRaises(ValueError):c.parse_meal('副食 4 選 1（薯金幣（小）× 1／麻糬QQ球 × 5／德國芝心腸 × 3）','PH')
        configs,_=c.parse_meal('副食 3 選 2（薯金幣（小）× 1／麻糬QQ球 × 5／德國芝心腸 × 3）','PH');self.assertEqual(len(configs),3)
    def test_structured_feed_is_json_not_executable_javascript(self):
        raw=dict(name='00123-測試',price=100,items=[dict(name='無糖綠茶(小)',count=2,addition_price=0,flavors=[dict(name='經典冰奶茶',addition_price=5)])],start_date='2026-01-01',end_date='2026-12-31',order_types=[2],meal_periods=[2,3,4,5])
        body='window.COUPON_DICT='+json.dumps(dict(coupon_by_code={'00123':raw}))+';'
        row=c.source_records(body,c.PARSER_FEEDS[4],'now')[0];offer=c.make_offer(row,c.PARSER_FEEDS[4],'now')
        self.assertEqual(offer['variants'][0]['channels'],['takeaway']);self.assertEqual(offer['variants'][0]['optionGroups'][0]['count'],2)
        self.assertEqual(offer['variants'][0]['optionGroups'][0]['options'][1]['surchargeMinor'],500)
        with self.assertRaises((ValueError,json.JSONDecodeError)):c.source_records('window.COUPON_DICT=fetch("https://example.invalid");',c.PARSER_FEEDS[4],'now')
    def test_food_units_do_not_promote_small_burgers_or_count_bundles_twice(self):
        self.assertEqual(atomic('原味脆雞堡(小)',2)[0],{'burgerSmall':2})
        self.assertEqual(atomic('2塊咔啦脆雞(辣)',1)[0],{'chicken':2})
        self.assertEqual(atomic('4塊上校雞塊+1顆原味蛋撻',2)[0],{'nuggets':8,'tart':2})
        self.assertEqual(atomic('雙色轉轉QQ球',1)[0],{'qqPack':1})
        self.assertEqual(atomic('10顆雙色轉轉QQ球',1)[0],{'qq':10})
        self.assertEqual(c.menu_component('超蝦點心拼盤 × 1（黃金超蝦塊 × 3 + 鱈魚圈圈 × 3）','KFC')[0],{'seafoodPlatter':1})
    def test_ordering_platform_and_fulfilment_and_payment_remain_separate(self):
        r=parse_ordering('PK雙饗卡APP專屬，限定外帶，限線上結帳。不適用自助點餐機及第三方外送平台。')
        self.assertEqual(r['platforms'],['pk_app']);self.assertEqual(r['fulfilments'],['takeaway']);self.assertTrue(r['onlinePaymentRequired']);self.assertIn('kiosk',r['excludedPlatforms'])
        self.assertIsNone(parse_ordering('限門市供應，冰奶茶')['platforms'])
        self.assertEqual(parse_ordering('僅限電話訂餐')['platforms'],['phone'])
        self.assertEqual(parse_ordering('外送限定')['fulfilments'],['delivery'])
        self.assertNotIn('delivery',parse_ordering('本券不適用於外送')['fulfilments'])
    def test_official_negative_evidence_is_product_specific_and_expires(self):
        base=dict(brand='KFC',code='16845',sourceMetadata=dict(productCode='TA10573'),ordering=dict(platforms=None,fulfilments=None,evidence=[]),conditions=[],variants=[dict(channels=['takeaway','delivery'])],dataStatus='estimate')
        review=dict(brand='KFC',code='16845',productCode='TA10573',checkedAt='2026-10-17',reviewBy='2026-10-24',excludedFulfilments=['delivery'],finding='官方餐點說明不適用外送')
        data=apply_reviewed_ordering(dict(offers=[copy.deepcopy(base)]),[review],'2026-10-17T00:00:00+00:00')
        self.assertEqual(data['offers'][0]['variants'][0]['channels'],['takeaway']);self.assertIsNone(data['offers'][0]['ordering']['platforms'])
        self.assertNotIn('delivery',data['offers'][0]['ordering']['fulfilments'])
        for stamp,product in [('2026-10-25T00:00:00+00:00','TA10573'),('2026-10-17T00:00:00+00:00','CHANGED')]:
            other=copy.deepcopy(base);other['sourceMetadata']['productCode']=product
            apply_reviewed_ordering(dict(offers=[other]),[review],stamp)
            self.assertIn('delivery',other['variants'][0]['channels'])
    def test_conflicts_preserve_each_observation_without_overwriting_evidence(self):
        rec=dict(code='00123',text='咔啦脆雞 × 2',priceMinor=9900,priceType='fixed',windows=[])
        a=c.make_offer(rec,c.PARSER_FEEDS[2],'now');b=c.make_offer(dict(rec,priceMinor=10900),c.PARSER_FEEDS[0],'now')
        b['ordering']=parse_ordering('APP專屬');before=copy.deepcopy(a['observations'])
        merged=c.merge([a,b],{},'now')[0];self.assertEqual(merged['dataStatus'],'conflict');self.assertEqual(len(merged['observations']),2);self.assertEqual(a['observations'],before)
    def test_new_codes_are_ingested_and_a_failed_feed_retains_its_old_raw_records(self):
        rec=dict(code='NEW123',text='原味蛋撻 × 2',priceMinor=9900,priceType='fixed',windows=[])
        cached=[dict(sourceId='calling-kfc',fetchedAt='old',record=rec)]
        previous=dict(offers=[],sources=[dict(sourceId='calling-kfc',lastSuccessAt='old',contentHash='a'*64,responseBytes=1000)])
        def fail(url):raise TimeoutError('offline')
        data,records,report=crawler.crawl(previous,cached,fail,'2026-10-17T00:00:00+00:00',feeds=c.PARSER_FEEDS)
        self.assertEqual(data['offers'][0]['code'],'NEW123');self.assertEqual(data['offers'][0]['provenance']['fetchedAt'],'old');self.assertEqual(data['sources'][2]['lastSuccessAt'],'old');self.assertEqual(report['status'],'partial_failure')
        self.assertEqual(data['sources'][2]['contentHash'],'a'*64);self.assertEqual(data['sources'][2]['responseBytes'],1000)

if __name__=='__main__':unittest.main()
