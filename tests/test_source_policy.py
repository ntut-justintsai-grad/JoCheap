import copy,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools'))
import catalog as c
from crawl_catalog import crawl,active_previous

class SourcePolicyTests(unittest.TestCase):
    def raw(self):
        return dict(name='12345-API餐點',price=100,items=[dict(name='2塊咔啦脆雞',count=1,addition_price=0,flavors=[])],start_date='2026-01-01',end_date='2026-12-31',order_types=[2],meal_periods=[3])
    def test_production_fetches_no_retired_kfc_feed_and_does_not_reuse_its_cached_recipe(self):
        retired=dict(code='OLDONLY',text='咔啦脆雞 × 9',priceMinor=1,priceType='fixed',windows=[])
        raw=self.raw();record=dict(code='12345',text=raw['name'],priceMinor=10000,priceType='fixed',windows=[],structured=raw)
        cache=[dict(sourceId='calling-kfc',fetchedAt='old',record=retired),dict(sourceId='kcouper',fetchedAt='old',record=record)]
        called=[]
        def offline(url):called.append(url);raise TimeoutError('offline')
        data,records,_=crawl(dict(offers=[],sources=[]),cache,offline,'2026-10-18T00:00:00Z')
        self.assertEqual(set(called),{f['url'] for f in c.FEEDS})
        self.assertFalse(any('kfc-coupon' in url for url in called))
        self.assertEqual([o['code'] for o in data['offers']],['12345'])
        self.assertEqual({r['sourceId'] for r in records},{'kcouper'})
        self.assertEqual(data['offers'][0]['variants'][0]['items'],{'chicken':2})
        self.assertEqual(data['offers'][0]['provenance']['fetchedAt'],'old')
    def test_no_raw_cache_fallback_strips_retired_observations_and_conflicts(self):
        raw=self.raw();current=c.make_offer(dict(code='12345',text=raw['name'],priceMinor=10000,priceType='fixed',windows=[],structured=raw),c.PARSER_FEEDS[4],'old')
        retired=c.make_offer(dict(code='12345',text='咔啦脆雞 × 9',priceMinor=1,priceType='fixed',windows=[]),c.PARSER_FEEDS[2],'old')
        previous=dict(offers=c.merge([current,retired],{},'old'),sources=[])
        self.assertEqual(previous['offers'][0]['dataStatus'],'conflict')
        kept=active_previous(previous,c.FEEDS,'now')
        self.assertEqual(kept['offers'][0]['dataStatus'],'estimate')
        self.assertEqual(kept['offers'][0]['variants'][0]['priceMinor'],10000)
        self.assertEqual([o['sourceId'] for o in kept['offers'][0]['observations']],['kcouper'])
        self.assertEqual(previous['offers'][0]['dataStatus'],'conflict')

if __name__=='__main__':unittest.main()
