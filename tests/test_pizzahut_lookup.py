import copy,sys,unittest,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from pizzahut_lookup import parse_response,refresh,ENDPOINT
STAMP='2026-10-18T05:20:00Z'
def ok(product=19169):return dict(success=True,data=dict(type='f',dType='plu',type_id=1025,p_id=product,local=1))
def dataset(codes=('16448',)):
    return dict(offers=[dict(brand='PH',code=code,variants=[dict(priceMinor=25000,items={'pizza9':2})],sourceVersions=[dict(priceMinor=25000),dict(priceMinor=26000)]) for code in codes]+[dict(brand='KFC',code='16448')])
def run(data,cache,fetch,**kwargs):return refresh(data,cache,fetch,STAMP,sleep=lambda _:None,clock=lambda:0,**kwargs)

class PizzaHutLookupTests(unittest.TestCase):
    def test_product_binding_requires_explicit_well_formed_success(self):
        x=parse_response('16448',ok(),STAMP)
        self.assertEqual((x['code'],x['productId'],x['typeId']),('16448',19169,1025))
        self.assertIn('cno=16448',x['detailUrl']);self.assertEqual(x['scope'],'coupon_code_product_only')
        for response in [[],{},dict(success=False),dict(errCode=500),ok(None),ok(True),ok('19169')]:
            with self.assertRaises(ValueError):parse_response('16448',response,STAMP)
        self.assertEqual(parse_response('00000',dict(errCode=101,errMsg='invalid'),STAMP)['status'],'invalid')
    def test_duplicate_sources_query_once_without_overwriting_external_recipe_or_price(self):
        data=dataset(('16448','16448'));before=copy.deepcopy(data);calls=[]
        cache,report=run(data,{},lambda code:(calls.append(code) or ok()))
        self.assertEqual(calls,['16448']);self.assertEqual(report['total'],1)
        for a,b in zip(data['offers'],before['offers']):
            self.assertEqual(a.get('variants'),b.get('variants'));self.assertEqual(a.get('sourceVersions'),b.get('sourceVersions'))
        self.assertNotIn('couponLookup',data['offers'][-1])
        self.assertEqual(data['offers'][0]['couponLookup']['productId'],19169)
        _,report=run(dataset(),cache,lambda code:self.fail('weekly cache should be reused'))
        self.assertEqual(report['queried'],0);self.assertEqual(report['reused'],1)
    def test_timeout_retains_previous_success_without_relabelling_as_current_or_invalid(self):
        old=parse_response('16448',ok(), '2026-10-17T05:00:00Z');cache=dict(version=1,byCode={'16448':old})
        def fail(code):raise TimeoutError('offline')
        data=dataset();new,report=run(data,cache,fail,force=True)
        row=new['byCode']['16448'];self.assertEqual(row['status'],'error');self.assertNotIn('checkedAt',row)
        self.assertEqual(row['lastSuccess']['checkedAt'],old['checkedAt']);self.assertEqual(row['lastSuccess']['productId'],19169)
        self.assertEqual(report['retainedSuccessful'],1);self.assertEqual(cache['byCode']['16448'],old)
    def test_invalid_clears_old_product_and_later_success_recovers(self):
        old=parse_response('16448',ok(),STAMP);cache=dict(version=1,byCode={'16448':old})
        new,_=run(dataset(),cache,lambda code:dict(errCode=101,errMsg='invalid'),force=True)
        self.assertEqual(new['byCode']['16448']['status'],'invalid');self.assertNotIn('productId',new['byCode']['16448'])
        new,_=run(dataset(),new,lambda code:ok(20000),force=True)
        self.assertEqual(new['byCode']['16448']['productId'],20000)
    def test_rate_limit_stops_batch_and_keeps_remaining_codes_pending(self):
        calls=[]
        def limited(code):calls.append(code);raise urllib.error.HTTPError(ENDPOINT,429,'rate limit',None,None)
        result,report=run(dataset(('16000','16001','16002')),{},limited,force=True)
        self.assertEqual(calls,['16000']);self.assertTrue(report['stopped']);self.assertEqual(report['queried'],1)
        self.assertEqual(report['byStatus'],{'error':3});self.assertTrue(all(r['status']=='error' for r in result['byCode'].values()))
    def test_old_and_mismatched_cache_entries_are_not_reused(self):
        old=parse_response('wrong',ok(),'2026-10-01T00:00:00Z');calls=[]
        _,report=run(dataset(),dict(version=1,byCode={'16448':old}),lambda code:(calls.append(code) or ok()))
        self.assertEqual(calls,['16448']);self.assertEqual(report['reused'],0)

if __name__=='__main__':unittest.main()
