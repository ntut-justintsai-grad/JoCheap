"""Match external Pizza Hut codes to its anonymous official code-lookup response.

This endpoint confirms a code/product association, not its meal, price or checkout.
Only explicit errCode 101 is treated as invalid. Transport/schema errors retain the
last successful response, and 403/429 stop the remaining batch.
"""
import argparse,copy,json,re,time,urllib.error,urllib.parse,urllib.request
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

ENDPOINT='https://www.pizzahut.com.tw/order/?m=ajax'
INTERVAL=1.0
MAX_AGE=7*86400

def fetch_coupon(code):
    if not re.fullmatch(r'[A-Za-z0-9-]{1,20}',code):raise ValueError('Unsupported public coupon code format')
    fields=dict(mode='get_dgtAll',type_id='',dType='plu',txtPLU=code)
    req=urllib.request.Request(ENDPOINT,data=urllib.parse.urlencode(fields).encode(),headers={'User-Agent':'JoCheap/0.8 public coupon lookup','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Origin':'https://www.pizzahut.com.tw','Referer':'https://www.pizzahut.com.tw/order/','X-Requested-With':'XMLHttpRequest','Accept':'application/json, text/javascript, */*; q=0.01'})
    with urllib.request.urlopen(req,timeout=15) as response:
        raw=response.read(128001)
        if response.status!=200 or len(raw)>128000:raise ValueError('Unexpected or oversized lookup response')
    return json.loads(raw.decode('utf-8-sig'))

def parse_response(code,response,stamp):
    if not isinstance(response,dict):raise ValueError('Lookup response must be an object')
    base=dict(code=code,endpoint=ENDPOINT,attemptedAt=stamp,checkedAt=stamp,scope='coupon_code_product_only')
    if response.get('success') is True:
        data=response.get('data') or {};product=data.get('p_id');kind=data.get('type_id')
        # Do not coerce null, booleans or arbitrary strings into a valid product ID.
        if type(product) is not int or product<=0 or type(kind) is not int or kind<=0 or data.get('dType')!='plu':raise ValueError('Missing or invalid product mapping')
        detail='https://www.pizzahut.com.tw/order/?'+urllib.parse.urlencode(dict(mode='step_2',type_id=kind,cno=code))
        base.update(status='matched',productId=product,typeId=kind,detailUrl=detail,response=dict(success=True,data={k:data.get(k) for k in ['type','dType','type_id','p_id','local']}))
    elif type(response.get('errCode')) is int and response['errCode']==101:
        base.update(status='invalid',reason=str(response.get('errMsg') or '官方查碼目前不接受此優惠碼')[:250],response=dict(errCode=101,errMsg=str(response.get('errMsg') or '')[:250]))
    else:raise ValueError('Unrecognized lookup result; not classified as invalid')
    return base

def successful(entry):
    candidate=entry.get('lastSuccess') if entry.get('status')=='error' else entry
    if candidate and candidate.get('status') in {'matched','invalid'}:return {k:copy.deepcopy(v) for k,v in candidate.items() if k!='lastSuccess'}
    return None

def fresh(entry,code,stamp):
    if entry.get('code')!=code or entry.get('endpoint')!=ENDPOINT or entry.get('status') not in {'matched','invalid'}:return False
    try:age=(datetime.fromisoformat(stamp.replace('Z','+00:00'))-datetime.fromisoformat(entry['checkedAt'].replace('Z','+00:00'))).total_seconds()
    except (ValueError,KeyError,TypeError):return False
    return 0<=age<MAX_AGE

def refresh(data,cache,fetcher,stamp,force=False,sleep=time.sleep,clock=time.monotonic,on_progress=None):
    prior=cache.get('byCode',{}) if cache.get('version')==1 else {};by_code={};codes=sorted({o['code'] for o in data['offers'] if o['brand']=='PH'})
    report=dict(attemptedAt=stamp,endpoint=ENDPOINT,total=len(codes),queried=0,reused=0,stopped=False)
    last_start=None;stop_reason=None
    for i,code in enumerate(codes):
        old=prior.get(code,{})
        if not force and fresh(old,code,stamp):entry=copy.deepcopy(old);report['reused']+=1
        else:
            try:
                if stop_reason:raise RuntimeError(stop_reason)
                if fetcher is None:raise RuntimeError('Official lookup not requested in offline cache mode')
                if last_start is not None:sleep(max(0,INTERVAL-(clock()-last_start)))
                last_start=clock();report['queried']+=1
                response=fetcher(code)
                checked=datetime.now(timezone.utc).isoformat(timespec='seconds') if fetcher is fetch_coupon else stamp
                entry=parse_response(code,response,checked)
            except Exception as err:
                if isinstance(err,urllib.error.HTTPError) and err.code in {403,429}:
                    stop_reason='Official lookup HTTP '+str(err.code)+'; remaining batch deferred';report['stopped']=True
                entry=dict(code=code,endpoint=ENDPOINT,status='error',attemptedAt=stamp,errorSummary=(type(err).__name__+': '+str(err))[:250],scope='coupon_code_product_only')
                last=successful(old)
                if last and last.get('code')==code and last.get('endpoint')==ENDPOINT:entry['lastSuccess']=last
        by_code[code]=entry
        if on_progress and ((i+1)%10==0 or i+1==len(codes)):on_progress(dict(version=1,generatedAt=stamp,byCode={**prior,**by_code}))
        if (i+1)%25==0:print('Pizza Hut lookup: '+str(i+1)+'/'+str(len(codes)),flush=True)
    for offer in data['offers']:
        if offer['brand']=='PH':offer['couponLookup']=copy.deepcopy(by_code[offer['code']])
    report['byStatus']=dict(Counter(e['status'] for e in by_code.values()))
    report['retainedSuccessful']=sum(e['status']=='error' and bool(e.get('lastSuccess')) for e in by_code.values())
    data['pizzahutLookup']=report
    data.setdefault('sourcePolicy',{}).setdefault('PH',{})['apiIntegration']='code_lookup'
    return dict(version=1,generatedAt=stamp,byCode=by_code),report

def save_cache(path,cache):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8');temp.replace(path)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--snapshot',default='data/offers.json');parser.add_argument('--cache',default='data/pizzahut_lookup.json');parser.add_argument('--if-due',action='store_true');args=parser.parse_args()
    target=Path(args.cache);cache=json.loads(target.read_text()) if target.exists() else {}
    data=json.loads(Path(args.snapshot).read_text());stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    cache,report=refresh(data,cache,fetch_coupon,stamp,force=not args.if_due,on_progress=lambda x:save_cache(target,x));save_cache(target,cache);print(json.dumps(report,ensure_ascii=False))
