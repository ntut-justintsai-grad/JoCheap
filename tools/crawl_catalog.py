"""Fetch all public feeds, ingest new codes, and keep last successful data on failures."""
import argparse,copy,json,sys,time
from collections import Counter
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
import urllib.request
from catalog import FEEDS,source_records,make_offer,merge,assign_flavor_ids
from food_parser import CATALOG
from ordering_rules import apply_reviewed_ordering

ROOT=Path(__file__).resolve().parent.parent
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'FeastSaver/0.5 (public coupon aggregation)'})
    with urllib.request.urlopen(req,timeout=35) as response:
        if response.status!=200:raise ValueError('HTTP '+str(response.status))
        body=response.read(8_000_001)
        if len(body)>8_000_000:raise ValueError('來源超過 8 MB')
    return body.decode('utf-8-sig')

def crawl(previous,previous_records,fetcher,stamp):
    all_records=[];source_status=[];observations=[]
    for feed in FEEDS:
        status=dict(brand=feed['brand'],sourceId=feed['id'],sourceUrl=feed['url'],sourcePublisher=feed['publisher'],sourceType='public_dataset' if feed['format']=='kcouper' else 'aggregator',lastAttemptAt=stamp,coverage='parsed_public_feed')
        old=[r for r in previous_records if r['sourceId']==feed['id']]
        try:
            body=fetcher(feed['url']);records=source_records(body,feed,stamp)
            if not records or old and len(records)<len(old)*.5:raise ValueError('筆數異常下降超過 50%，保留上次資料')
            selected=[dict(sourceId=feed['id'],fetchedAt=stamp,record=r) for r in records]
            status.update(status='parsed_success',lastSuccessAt=stamp,parsedCount=len(records),contentHash=sha256(body.encode()).hexdigest(),responseBytes=len(body.encode()),errorSummary=None)
        except Exception as err:
            selected=old
            prior=next((s for s in previous.get('sources',[]) if s.get('sourceId')==feed['id']),{})
            status.update(status='error_retained',lastSuccessAt=prior.get('lastSuccessAt'),parsedCount=len(old),contentHash=prior.get('contentHash'),responseBytes=prior.get('responseBytes'),errorSummary=str(err)[:250])
        all_records.extend(selected)
        for row in selected:observations.append(make_offer(row['record'],feed,row['fetchedAt']))
        source_status.append(status)
    if not observations:return previous,all_records,dict(status='all_failed',sources=source_status)
    data=copy.deepcopy(previous)
    data.update(schemaVersion=2,datasetVersion=stamp,generatedAt=stamp,updateStatus='crawled',coverage='public_feeds_with_review_queue',sources=source_status)
    data['offers']=merge(observations,previous,stamp)
    reviews=ROOT/'data/ordering_reviews.json'
    if reviews.exists():apply_reviewed_ordering(data,json.loads(reviews.read_text(encoding='utf-8')),stamp)
    # On a failed feed without a stored raw cache, retain its previous exclusive offers.
    observed={(o['brand'],o['code']) for o in data['offers']}
    failed={s['sourceUrl'] for s in source_status if s['status']=='error_retained'}
    for old in previous.get('offers',[]):
        if old['provenance']['sourceUrl'] in failed and (old['brand'],old['code']) not in observed:data['offers'].append(copy.deepcopy(old))
    data.setdefault('pizzaFlavors',{})
    assign_flavor_ids(data['offers'],data['pizzaFlavors'])
    data['foodCatalog']=dict(CATALOG)
    research=ROOT/'data/research.json'
    if research.exists():data['upgradeResearch']=json.loads(research.read_text(encoding='utf-8'))
    report=dict(fetchedAt=stamp,status='parsed' if all(s['status']=='parsed_success' for s in source_status) else 'partial_failure',sources=source_status,sourceRows=len(all_records),uniqueCodes=len(data['offers']),byBrand=dict(Counter(o['brand'] for o in data['offers'])),byStatus=dict(Counter(o['dataStatus'] for o in data['offers'])),variants=sum(len(o['variants']) for o in data['offers']),optionGroups=sum(len(v.get('optionGroups',[])) for o in data['offers'] for v in o['variants']))
    data['crawlReport']=report
    return data,all_records,report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache-dir');parser.add_argument('--snapshot',default=str(ROOT/'data/offers.json'));args=parser.parse_args()
    target=Path(args.snapshot);old=json.loads(target.read_text(encoding='utf-8'))
    cache=target.parent/'source_records.json'
    old_records=json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else []
    if args.cache_dir:
        directory=Path(args.cache_dir)
        def fetcher(url):
            feed=next(f for f in FEEDS if f['url']==url)
            with (directory/('kcouper-coupons.js' if feed['id']=='kcouper' else feed['id']+'.html')).open(encoding='utf-8',newline='') as handle:return handle.read()
    else:fetcher=fetch
    stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    if args.cache_dir:
        stamp=datetime.fromtimestamp(min(p.stat().st_mtime for p in directory.iterdir() if p.name in {'talk-kfc.html','talk-ph.html','calling-kfc.html','calling-ph.html','kcouper-coupons.js'}),timezone.utc).isoformat(timespec='seconds')
    data,records,report=crawl(old,old_records,fetcher,stamp)
    if report['status']=='all_failed':
        (target.parent/'crawl_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        raise SystemExit('All sources failed; previous snapshot retained.')
    target.with_suffix('.previous.json').write_text(json.dumps(old,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    cache.write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (target.parent/'crawl_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (target.parent/'review_queue.json').write_text(json.dumps([dict(brand=o['brand'],code=o['code'],status=o['dataStatus'],reason=o['reviewReason'],sources=o['observations']) for o in data['offers'] if o['dataStatus']!='estimate'],ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='sources'},ensure_ascii=False))
    for source in report['sources']:print(json.dumps(source,ensure_ascii=False))

if __name__=='__main__':main()
