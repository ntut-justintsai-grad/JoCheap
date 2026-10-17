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

    def test_real_26900_title_conflict_is_quarantined_without_guessing_a_correct_meal(self):
        snapshot=json.loads((Path(__file__).parent/'fixtures/paper_chicken_20261017.json').read_text())
        row=snapshot['rawRecords'][0]
        feed=next(f for f in c.FEEDS if f['id']==row['sourceId'])
        offer=c.make_offer(row['record'],feed,'2026-10-17T00:00:00+00:00')
        self.assertEqual(offer['dataStatus'],'pending')
        self.assertIn('身分不一致',offer['reviewReason'])
        self.assertEqual(offer['variants'][0]['items']['chicken'],2)
        self.assertNotIn('paperChicken',offer['variants'][0]['items'])
        self.assertEqual(offer['rawText'],row['record']['text'])
        self.assertEqual(offer['observations'][0]['text'],row['record']['text'])
        explicit=copy.deepcopy(row['record'])
        explicit['text']=explicit['structured']['name']='炸雞可加價換紙包雞'
        self.assertEqual(c.make_offer(explicit,feed,'now')['dataStatus'],'estimate')

    def test_different_meals_in_different_sources_remain_a_conflict(self):
        row=dict(code='12345',text='咔啦脆雞 × 2',priceMinor=9900,priceType='fixed',windows=[])
        a=c.make_offer(row,c.FEEDS[2],'now')
        b=c.make_offer(dict(row,text='香草紙包雞 × 1'),c.FEEDS[0],'now')
        merged=c.merge([a,b],{},'now')[0]
        self.assertEqual(merged['dataStatus'],'conflict')
        self.assertEqual(len(merged['observations']),2)

if __name__=='__main__':unittest.main()
