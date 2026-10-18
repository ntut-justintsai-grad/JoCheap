import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from pizzahut_menu import parse_listing,refresh,apply,URLS

STAMP='2026-10-18T16:30:00+00:00'
def card(pid=10989,name='酥炸嫩雞球',price='$69',description=''):
 return f'<div id="itemss_d{pid}"><a href="?mode=step_2&amp;ct=5&amp;cu=28&amp;pd={pid}"><div class="pro-li-name">{name}</div><div class="pro-list-descContent">{description}</div><span class="priceTxt"><span>{price}</span></span></a></div>'
class MenuTests(unittest.TestCase):
 def test_exact_prices_and_units_no_guessed_chicken_counts(self):
  cache=refresh({},lambda u:card()+card(5181,'黃金雞柳條8條','$199'),STAMP)
  data={'foodCatalog':{}};apply(data,cache)
  self.assertEqual(data['menuOffers'][0]['variants'][0]['items'],{'chickenBalls':1})
  self.assertEqual(data['menuOffers'][1]['variants'][0]['items'],{'chickenStrips':8})
  self.assertFalse(any('chicken' in o['variants'][0]['items'] for o in data['menuOffers']))
 def test_changed_name_unknown_food_and_from_price_are_not_guessed(self):
  rows=parse_listing(card(name='期間限定全新雞球')+card(99999,'神秘拼盤')+card(5181,'黃金雞柳條8條','$199起'),URLS[0],STAMP)
  d={'foodCatalog':{}};apply(d,{'pages':{'x':{'products':rows}}})
  self.assertEqual(d['menuOffers'],[]);self.assertEqual(len(d['pizzahutMenu']['pending']),2)
 def test_removed_items_disappear_and_network_failure_keeps_original_timestamp(self):
  original=refresh({},lambda u:card()+card(11565,'酥炸杏鮑菇','$75'),STAMP)
  newer='2026-10-25T16:30:00+00:00'
  removed=refresh(original,lambda u:card(),newer)
  self.assertEqual(len(removed['pages'][URLS[0]]['products']),1)
  def fail(u):raise OSError('offline')
  retained=refresh(original,fail,newer)
  self.assertEqual(retained['pages'][URLS[0]]['checkedAt'],STAMP)
  self.assertEqual(len(retained['errors']),2)
 def test_limited_stock_is_explicit_new_is_not_a_sale_end(self):
  rows=parse_listing(card(18128,'榴槤起司冰淇淋','$69','期間限定口味售完為止')+card(18487,'吳寶春聯名 蜜桃冰心起司塔1顆','$75','NEW'),URLS[0],STAMP)
  d={'foodCatalog':{}};apply(d,{'pages':{'x':{'products':rows}}})
  self.assertTrue(d['menuOffers'][0]['menuSnapshot']['limited'])
  self.assertFalse(d['menuOffers'][1]['menuSnapshot']['limited'])
  self.assertNotIn('toExclusive',d['menuOffers'][0]['validity']['validWindows'][0])
  self.assertEqual(d['menuOffers'][0]['code'],'')

if __name__=='__main__':unittest.main()
