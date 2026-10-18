import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import catalog as c
from food_parser import atomic

class MealIdentityTests(unittest.TestCase):
    def test_paper_and_fried_chicken_preserve_their_identity_and_units(self):
        self.assertEqual(atomic('香草紙包雞',1)[0],{'paperChicken':1})
        self.assertEqual(atomic('麻油紙包雞',1)[0],{'paperChicken':1})
        self.assertEqual(atomic('2塊咔啦脆雞(辣)',1)[0],{'chicken':2})

    def test_real_26900_uses_structured_contents_without_guessing_from_legacy_title(self):
        snapshot=json.loads((Path(__file__).parent/'fixtures/paper_chicken_20261017.json').read_text())
        row=snapshot['rawRecords'][0]
        feed=next(f for f in c.PARSER_FEEDS if f['id']==row['sourceId'])
        offer=c.make_offer(row['record'],feed,'2026-10-17T00:00:00+00:00')
        self.assertEqual(offer['dataStatus'],'estimate')
        self.assertEqual(offer['sourceMetadata']['compositionBasis'],'structured_items')
        self.assertTrue(any('不用品名' in note or '不用名稱' in note for note in offer['conditions']))
        self.assertEqual(offer['variants'][0]['items']['chicken'],2)
        self.assertNotIn('paperChicken',offer['variants'][0]['items'])
        self.assertEqual(offer['rawText'],row['record']['text'])
        self.assertEqual(offer['observations'][0]['text'],row['record']['text'])
        explicit=copy.deepcopy(row['record'])
        explicit['text']=explicit['structured']['name']='炸雞可加價換紙包雞'
        self.assertNotIn('身分不一致',c.make_offer(explicit,feed,'now')['reviewReason'] or '')

    def test_different_meals_in_different_sources_remain_a_conflict(self):
        row=dict(code='12345',text='咔啦脆雞 × 2',priceMinor=9900,priceType='fixed',windows=[])
        a=c.make_offer(row,c.PARSER_FEEDS[2],'now')
        b=c.make_offer(dict(row,text='香草紙包雞 × 1'),c.PARSER_FEEDS[0],'now')
        merged=c.merge([a,b],{},'now')[0]
        self.assertEqual(merged['dataStatus'],'conflict')
        self.assertEqual(len(merged['observations']),2)

if __name__=='__main__':unittest.main()
