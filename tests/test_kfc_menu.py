import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from kfc_menu import refresh,apply
STAMP='2026-10-19T03:26:25+00:00'
PERIODS={'08:10':('1','06:50','10:30'),'11:00':('2','10:30','14:00'),'15:00':('3','14:00','17:01'),'18:00':('4','17:01','20:01'),'22:00':('5','20:01','23:59')}
def row(code='FA168',name='金黃比司吉',price=59):
 return dict(Fcode=code,Name=name,Upa_Group=price,StartDate='2026/10/01 00:00:00',EndDate='2026/11/02 23:59:59',SoldOut=False,hasMultipleItems=False,Intro='')
def reader(rows):
 def fetch(endpoint,q):
  if endpoint=='GetMealPeriodID':
   p,a,b=PERIODS[q['time']];return dict(Success=True,Data=dict(MealPeriodID=p,StartTime=a,EndTime=b))
  return dict(Success=True,Data=dict(Foods=[dict(MenuID=int(q['menuid']),Details=rows(q) if callable(rows) else rows)]))
 return fetch
class KfcMenuTests(unittest.TestCase):
 def test_literal_pack_no_invented_parts_and_channel_prices(self):
  cache=refresh({},reader(lambda q:[row(price=59 if q['ordertype']=='2' else 65),row('FA191','樂享三拼小盒',139),row('FA013','上校雞塊4塊',49)]),STAMP)
  d={'foodCatalog':{},'menuOffers':[{'brand':'PH','id':'retain'}]};apply(d,cache)
  takeaway=next(o for o in d['menuOffers'][1:] if o['menuSnapshot']['productId']=='FA168' and o['menuSnapshot']['channel']=='takeaway')
  delivery=next(o for o in d['menuOffers'][1:] if o['menuSnapshot']['productId']=='FA168' and o['menuSnapshot']['channel']=='delivery')
  self.assertEqual(takeaway['variants'][0]['priceMinor'],5900);self.assertEqual(delivery['variants'][0]['priceMinor'],6500)
  pack=next(o for o in d['menuOffers'][1:] if o['menuSnapshot']['productId']=='FA191')
  self.assertEqual(sum(pack['variants'][0]['items'].values()),1);self.assertNotIn('chicken',pack['variants'][0]['items'])
  self.assertEqual(next(o for o in d['menuOffers'][1:] if o['menuSnapshot']['productId']=='FA013')['variants'][0]['items'],{'nuggets':4})
  self.assertEqual(d['menuOffers'][0]['id'],'retain');self.assertEqual(takeaway['code'],'')
 def test_removed_menu_and_failed_refresh_preserve_original_timestamp(self):
  old=refresh({},reader([row()]),STAMP);newer='2026-10-25T03:00:00+00:00'
  removed=refresh(old,reader([]),newer);d={'foodCatalog':{}};apply(d,removed);self.assertEqual(d['menuOffers'],[])
  def fail(endpoint,q):raise OSError('offline')
  kept=refresh(old,fail,newer)
  self.assertEqual(kept['pages']['takeaway|2|5']['checkedAt'],STAMP)
  self.assertEqual(kept['pages']['takeaway|2|5']['window'],[630,840])
 def test_soldout_starting_prices_and_real_campaign_end(self):
  sold=row();sold['SoldOut']=True;start=row('X1','任選套餐',29);start['hasMultipleItems']=True
  d={'foodCatalog':{}};apply(d,refresh({},reader([sold,start,row('X2','限定點心',50)]),STAMP))
  self.assertTrue(d['menuOffers']);self.assertTrue(all(o['menuSnapshot']['productId']=='X2' for o in d['menuOffers']))
  self.assertTrue(all(o['validity']['validWindows'][0]['toExclusive']=='2026-11-03' for o in d['menuOffers']))
 def test_explicit_rice_cutoff_never_becomes_a_fries_order(self):
  rice=row('FA250','雞汁風味飯(加量不加價)',50);rice['Intro']='雞汁風味飯(供應至20:00)X1'
  d={'foodCatalog':{}};apply(d,refresh({},reader([rice]),STAMP))
  self.assertTrue(d['menuOffers']);self.assertTrue(all(o['validity']['validWindows'][0]['endMinute']<=1200 for o in d['menuOffers']))
 def test_name_change_does_not_reuse_prior_food_identity(self):
  a={'foodCatalog':{}};b={'foodCatalog':{}}
  apply(a,refresh({},reader([row()]),STAMP));apply(b,refresh({},reader([row(name='全新比司吉套餐')]),STAMP))
  self.assertNotEqual(a['menuOffers'][0]['variants'][0]['items'],b['menuOffers'][0]['variants'][0]['items'])
if __name__=='__main__':unittest.main()
