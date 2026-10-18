import copy,json,sys,unittest
from pathlib import Path
from hashlib import sha256
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from official_verification import refresh_official,API,COUPON_URL
from data_quality import content_signature,meal_issues,source_signature
import catalog as c

ROOT=Path(__file__).resolve().parent.parent
STAMP='2026-10-17T10:15:00+00:00'

def fixture():
    data=json.loads((ROOT/'tests/fixtures/official_base_20261017.json').read_text())
    reviews=json.loads((ROOT/'data/official_reviews.json').read_text())
    images={r['imageUrl']:('test image '+r['code']).encode() for r in reviews}
    for review in reviews:review['imageHash']=sha256(images[review['imageUrl']]).hexdigest()
    terms=' '.join(reviews[0]['requiredTerms'])
    def fetch(url,payload=None):
        if url==API+'GetMealPeriodID':
            assert payload==dict(ordertype='2',time='18:15',channel='1')
            return json.dumps(dict(Success=True,Data=dict(MealPeriodID='4',StartTime='17:01',EndTime='20:01'))).encode()
        if url==API+'QueryCoupons':
            assert payload==dict(mealPeriod='4',orderType='2',orderDate='2026/10/17')
            return json.dumps(dict(Success=True,Data=data['officialRecords'])).encode()
        if url==COUPON_URL:return b'<script src="/_next/static/chunks/app/(routes)/coupon/page-fixture.js"></script>'
        if url.endswith('page-fixture.js'):return terms.encode()
        return images[url]
    return data,reviews,fetch

class OfficialVerificationTests(unittest.TestCase):
    def test_exact_official_base_is_bound_to_time_food_price_and_conditions(self):
        data,reviews,fetch=fixture();refresh_official(data,reviews,fetch,STAMP)
        self.assertEqual(data['officialRefresh']['checked'],5)
        self.assertFalse(data['recommendationPolicy']['requireOfficial'])
        self.assertTrue(data['recommendationPolicy']['allowAllSources'])
        expected={'50529':({'chicken':6,'tart':6},33300),'50551':({'chicken':4,'drinkSmall':2},17500),'50512':({'burger':1,'drinkSmall':1},10500),'50514':({'burger':1,'nuggets':4,'drinkSmall':1},12900),'50516':({'tart':1,'hashBrown':1,'milkTeaCup':1},9900)}
        for o in data['offers']:
            self.assertEqual(o['verification']['status'],'checked')
            self.assertEqual(o['verification']['contentSignature'],content_signature(o))
            self.assertEqual((o['variants'][0]['items'],o['variants'][0]['priceMinor']),expected[o['code']])
            self.assertEqual(o['variants'][0]['optionGroups'],[])
            self.assertEqual(o['ordering']['platforms'],['official_web'])
            self.assertEqual(o['limits']['maxUsesPerUserPerDay'],1)
            self.assertEqual(o['validity']['validWindows'],[{'from':'2026-10-17','toExclusive':'2026-10-18','startMinute':1021,'endMinute':1201}])

    def test_content_image_or_terms_changes_cannot_reuse_old_approval(self):
        for field in ['Price','Intro','image','terms','source']:
            data,reviews,fetch=fixture()
            if field in {'Price','Intro'}:next(r for r in data['officialRecords'] if r['CouponCode']=='50529')[field]='changed'
            if field=='source':data['offers'][0]['variants'][0]['items']['chicken']=99
            def changed(url,payload=None):
                if field=='image' and url==reviews[0]['imageUrl']:return b'new official image'
                if field=='terms' and url.endswith('page-fixture.js'):return b'new terms'
                return fetch(url,payload)
            refresh_official(data,reviews,changed,STAMP)
            target=next(o for o in data['offers'] if o['code']==('50529' if field!='source' else data['offers'][0]['code']))
            self.assertNotEqual(target['verification']['status'],'checked',field)
        data,reviews,fetch=fixture();refresh_official(data,reviews,fetch,STAMP)
        self.assertNotIn('options',data['offers'][0]['verification']['scope'])

    def test_missing_code_review_expiry_and_network_failure_fail_closed(self):
        data,reviews,fetch=fixture();data['officialRecords']=[]
        refresh_official(data,reviews,fetch,STAMP);self.assertEqual(data['officialRefresh']['checked'],0)
        data,reviews,fetch=fixture()
        for r in reviews:r['reviewBy']='2026-10-16T00:00:00+00:00'
        refresh_official(data,reviews,fetch,STAMP);self.assertTrue(all(o['verification']['status']=='expired' for o in data['offers']))
        data,reviews,fetch=fixture()
        def offline(url,payload=None):raise TimeoutError('offline')
        refresh_official(data,reviews,offline,STAMP)
        self.assertEqual(data['officialRefresh']['status'],'error')
        self.assertTrue(all(o['verification']['status']!='checked' for o in data['offers']))

    def test_read_time_does_not_invalidate_approval_but_source_content_does(self):
        data,_,_=fixture();o=data['offers'][0];before=source_signature(o)
        o['provenance']['fetchedAt']='later'
        for obs in o['observations']:obs['fetchedAt']='later'
        self.assertEqual(source_signature(o),before)
        o['observations'][0]['text']='changed meal'
        self.assertNotEqual(source_signature(o),before)

    def test_unknown_foods_and_invalid_choices_are_kept_for_review(self):
        rec=dict(code='X',text='咔啦雞腿堡 2顆原味蛋撻',priceMinor=10000,priceType='fixed',windows=[])
        offer=c.make_offer(rec,c.FEEDS[2],STAMP)
        self.assertEqual(offer['dataStatus'],'pending')
        self.assertTrue(meal_issues(offer['variants']))
        self.assertEqual(offer['observations'][0]['text'],rec['text'])
        raw=dict(name='X',price=100,items=[dict(name='2塊咔啦脆雞',count=1,addition_price=0,flavors=[dict(name='紙包雞',addition_price=None)])])
        offer=c.make_offer(dict(rec,text='X',structured=raw),c.FEEDS[4],STAMP)
        self.assertEqual(offer['dataStatus'],'pending');self.assertIn('不能略過選項',offer['reviewReason'])
        with self.assertRaises(ValueError):c.parse_meal('咔啦脆雞 × 2（未完成','KFC')

if __name__=='__main__':unittest.main()
