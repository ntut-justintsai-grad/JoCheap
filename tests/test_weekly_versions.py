import json,sys,subprocess,tempfile,unittest
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools'))
from food_parser import atomic
import catalog as c

class WeeklyVersionTests(unittest.TestCase):
    def test_new_foods_are_literal_without_invented_sizes_or_meal_families(self):
        for text,key in [('蜂蜜風味紅茶','honeyTeaCup'),('熱紅茶','hotTeaCup'),('紅豆奶皇蛋撻','redBeanTart'),('青花椒醬脆雞飯','pepperChickenRice'),('愛心蝦球','shrimpBalls'),('0.33L百事可樂','soda330')]:
            self.assertEqual(atomic(text,1)[0],{key:1},text)
        self.assertEqual(atomic('0.33L百事可樂',1)[1][0]['size'],'bottle')

    def test_text_ball_counts_do_not_become_source_packs(self):
        for text,n in [('雙色轉轉QQ球 × 10',10),('1顆雙色轉轉QQ球',1)]:
            configs,_=c.parse_meal(text,'KFC');self.assertEqual(configs[0]['items'],{'qq':n})
        self.assertEqual(atomic('雙色轉轉QQ球',2)[0],{'qqPack':2})

    def test_merge_preserves_each_recipe_price_and_source_as_one_version(self):
        a=c.make_offer(dict(code='12345',text='咔啦脆雞 × 2',priceMinor=9900,priceType='fixed',windows=[]),c.PARSER_FEEDS[2],'2026-10-18T00:00:00Z')
        b=c.make_offer(dict(code='12345',text='香草紙包雞 × 1',priceMinor=13900,priceType='fixed',windows=[]),c.PARSER_FEEDS[0],'2026-10-18T00:00:00Z')
        merged=c.merge([a,b],{},'now')[0]
        versions=merged['sourceVersions'];self.assertEqual(len(versions),2)
        recipes={(v['variants'][0]['priceMinor'],tuple(v['variants'][0]['items'].items())) for v in versions}
        self.assertEqual(recipes,{(9900,(('chicken',2),)),(13900,(('paperChicken',1),))})
        self.assertTrue(all(v['sourceConflict'] for v in versions))

    def test_push_rebuild_reuses_current_week_snapshot_without_fetching(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'offers.json';snapshot={'parserVersion':6,'generatedAt':datetime.now(timezone.utc).isoformat()};path.write_text(json.dumps(snapshot))
            p=subprocess.run([sys.executable,str(ROOT/'tools/crawl_catalog.py'),'--if-due','--snapshot',str(path)],capture_output=True,text=True,timeout=5)
            self.assertEqual(p.returncode,0,p.stderr);self.assertEqual(json.loads(path.read_text()),snapshot)
            self.assertFalse((path.parent/'source_records.json').exists())

if __name__=='__main__':unittest.main()
