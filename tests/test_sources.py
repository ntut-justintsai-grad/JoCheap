import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('updater',ROOT/'tools/update_sources.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)

class SourceTests(unittest.TestCase):
    def test_main_boundary_and_paragraph(self):
        html='<nav>優惠代號：00000</nav><article><h2>活動</h2><p>套餐</p><p>使用期限：即日起至2027年2月28日止</p><p>優惠代號：16845</p><p>優惠內容：1個咔啦雞腿堡+1顆原味蛋撻+1份香酥脆薯(小)+1杯百事可樂(小)=NT$135</p></article>'
        r=u.parse_page(html);self.assertEqual(len(r),1);self.assertEqual(r[0]['code'],'16845');self.assertEqual(r[0]['priceMinor'],13500)
        self.assertEqual(u.simple_items(r[0]['text']),{'burger':1,'tart':1,'friesSmall':1,'drinkSmall':1})
    def test_table_headers_and_inheritance_stop_at_heading(self):
        html='<article><h2>A</h2><p>使用期限：2026年12月29日</p><table><tr><th>優惠代碼</th><th>餐點內容</th><th>優惠價</th><th>原價</th></tr><tr><td>01234</td><td>2個原味脆雞堡(小)<br>2杯冰無糖綠茶(小)</td><td>NT$99</td><td>NT$178</td></tr></table><h2>B</h2><p>優惠代號：56789</p><p>優惠內容：1顆原味蛋撻=NT$50</p></article>'
        r=u.parse_page(html);self.assertEqual(r[0]['priceMinor'],9900);self.assertEqual(r[0]['code'],'01234');self.assertIn('2026',r[0]['context']);self.assertNotIn('2026',r[1]['context'])
    def test_rowspan_and_mutually_exclusive_content(self):
        table=u.Document('<table><tr><td rowspan="2">A</td><td>1</td></tr><tr><td>2</td></tr></table>').root.all({'table'})[0]
        self.assertEqual(u.table_grid(table),[['A','1'],['A','2']])
        self.assertIsNone(u.simple_items('2選1：薯條或雞塊'))
    def test_missing_boundary_is_not_flattened(self):
        with self.assertRaises(ValueError):u.parse_page('<html><p>優惠代號：12345</p></html>')
    def test_failed_fetch_keeps_offers_and_success_timestamp(self):
        data=json.loads((ROOT/'tests/fixtures/approved_v03.json').read_text(encoding='utf-8'));old=copy.deepcopy(data)
        def fail(url):raise TimeoutError('timeout')
        x,c=u.update(data,fail,'2026-10-17T00:00:00Z')
        self.assertEqual(x['offers'],old['offers']);self.assertEqual(x['sources'][0]['lastSuccessAt'],old['sources'][0]['lastSuccessAt']);self.assertEqual(x['sources'][0]['status'],'error');self.assertEqual(c,[])
    def test_same_code_conflict_quarantined_not_cheapest(self):
        data=json.loads((ROOT/'tests/fixtures/approved_v03.json').read_text(encoding='utf-8'))
        rows=[dict(code='16845',priceMinor=13500,text='一',context=''),dict(code='16845',priceMinor=100,text='二',context='')]
        u.refresh(data,'KFC',rows,'2026-10-17T00:00:00Z')
        row=next(o for o in data['offers'] if o['code']=='16845');self.assertEqual(row['dataStatus'],'conflict');self.assertEqual(row['variants'][0]['priceMinor'],13500)
    def test_partial_success_and_no_empty_overwrite(self):
        data=json.loads((ROOT/'tests/fixtures/approved_v03.json').read_text(encoding='utf-8'));before=copy.deepcopy(data['offers'])
        def fetch(url):
            if 'pizzahut' in url:raise TimeoutError('PH unavailable')
            return '<article><h2>A</h2><p>使用期限：即日起至2027年2月28日止</p><p>優惠代號：16845</p><p>優惠內容：1個咔啦雞腿堡+1顆原味蛋撻+1份香酥脆薯(小)+1杯百事可樂(小)=NT$135</p></article>'
        x,c=u.update(data,fetch,'2026-10-17T00:00:00Z')
        self.assertEqual(x['sources'][0]['status'],'partial');self.assertEqual(x['sources'][1]['status'],'error')
        self.assertEqual([o for o in x['offers'] if o['brand']=='PH'],[o for o in before if o['brand']=='PH'])
        refreshed=next(o for o in x['offers'] if o['code']=='16845');self.assertEqual(refreshed['dataStatus'],'estimate');self.assertIsNone(refreshed['provenance']['officialVerifiedAt'])
    def test_disjoint_dates_require_review_not_one_continuous_range(self):
        self.assertIsNone(u.expiry('2026年10月26日止 \\ 2026年11月16日至11月30日'))
        self.assertIsNone(u.expiry('依照官方公告'))

if __name__=='__main__':unittest.main()
