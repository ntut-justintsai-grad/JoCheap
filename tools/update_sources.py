"""Conservative, dependency-free source refresher.

Only approved configurations that can be reproduced exactly are refreshed.
Unknown/new/changed offers are written to candidates.json for review.
No missing field is interpreted as permission. Real records stay estimates.
"""
import argparse
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SOURCE = {'KFC':'https://info.talk.tw/kfc-coupon/','PH':'https://info.talk.tw/pizzahut-coupon/'}
VOID = {'br','img','input','meta','link','hr','source','wbr','area','base','embed','param','track','col'}
SKIP = {'script','style','nav','footer','aside','form'}

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag=tag; self.attrs=dict(attrs or []); self.children=[]
    def text(self):
        return ''.join(c.text() if isinstance(c,Node) else c for c in self.children)
    def all(self, tags):
        out=[]
        for c in self.children:
            if isinstance(c,Node):
                if c.tag in tags:out.append(c)
                out.extend(c.all(tags))
        return out

class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root=Node('document');self.stack=[self.root];self.feed(html)
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag=='br':n.children.append('\n')
        if tag not in VOID:self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,data):self.stack[-1].children.append(data)

def clean(s):return re.sub(r'\s+',' ',s).strip()
def blocks(n):
    for c in n.children:
        if not isinstance(c,Node) or c.tag in SKIP:continue
        if c.tag in {'h1','h2','h3','h4','h5','h6','p','table','li'}:
            yield c
        else:yield from blocks(c)

def table_grid(table):
    """Expand actual row/column spans without parsing a flattened page."""
    grid=[];pending={}
    for r,tr in enumerate(table.all({'tr'})):
        row={c:v for (rr,c),v in pending.items() if rr==r};col=0
        for cell in [c for c in tr.children if isinstance(c,Node) and c.tag in {'td','th'}]:
            while col in row:col+=1
            rs=max(1,min(30,int(cell.attrs.get('rowspan','1'))));cs=max(1,min(30,int(cell.attrs.get('colspan','1'))))
            value=clean(cell.text())
            for rr in range(r,r+rs):
                for cc in range(col,col+cs):
                    pending[(rr,cc)]=value
                    if rr==r:row[cc]=value
            col+=cs
        if row:grid.append([row.get(i,'') for i in range(max(row)+1)])
    return grid

def record_from_text(text,context,kind):
    code=re.search(r'優惠代[號碼]\s*[:：]?\s*([A-Za-z0-9-]+)',text)
    if not code:return None
    price=re.search(r'優惠價格\s*[:：]?\s*(?:NT\$?|\$)?\s*(\d+)\s*(?:元)?',text,re.I)
    if not price:price=re.search(r'=\s*(?:NT\$?|\$)\s*(\d+)',text,re.I)
    return dict(code=code.group(1),text=text,context=context,kind=kind,
        priceMinor=int(price.group(1))*100 if price else None)

def parse_page(html):
    doc=Document(html)
    # Semantic containers only; never assume an unobserved site-specific selector.
    articles=doc.root.all({'article'}) or doc.root.all({'main'})
    if not articles:raise ValueError('找不到 article/main 主文邊界，拒絕全頁解析')
    article=max(articles,key=lambda n:len(re.findall('優惠代[號碼]',n.text())))
    if not re.search('優惠代[號碼]',article.text()):raise ValueError('主文沒有優惠欄位')
    records=[];parts=[];heading='';context='';previous=''
    def flush():
        if parts:
            rec=record_from_text(clean(' '.join(parts)),context,'paragraph')
            if rec:records.append(rec)
            parts.clear()
    for b in blocks(article):
        text=clean(b.text())
        if b.tag.startswith('h'):
            flush();heading=text;context=heading;previous='';continue
        if b.tag=='table':
            flush();grid=table_grid(b)
            if not grid:continue
            headers=grid[0]
            ci=next((i for i,x in enumerate(headers) if '代碼' in x or '代號' in x),None)
            pi=next((i for i,x in enumerate(headers) if '優惠價' in x),None)
            ti=next((i for i,x in enumerate(headers) if '餐點' in x or '內容' in x),None)
            if ci is None or pi is None or ti is None:continue
            for row in grid[1:]:
                if len(row)<=max(ci,pi,ti):continue
                code=re.fullmatch(r'[A-Za-z0-9-]+',row[ci]);price=re.fullmatch(r'(?:NT\$?|\$)?\s*(\d+)\s*元?',row[pi],re.I)
                if code:records.append(dict(code=code.group(),text=row[ti],context=context,kind='table',priceMinor=int(price.group(1))*100 if price else None))
            continue
        if '使用期限' in text:
            flush();parts.extend([previous,text]);context=heading+' '+text
        elif parts:parts.append(text)
        elif '優惠代' in text:parts.extend([previous,text])
        previous=text if len(text)<150 else ''
    flush()
    if not records:raise ValueError('主文可讀，但未抽出結構化優惠，保留舊快照')
    return records

PATTERNS={
    'paperChicken':[r'(\d+)\s*份\s*香草紙包雞'],
    'fishRings':[r'(\d+)\s*份\s*鱈魚圈圈'],
    'pasta':[r'(\d+)\s*份\s*泡菜起司雪花牛筆管麵'],
    'chickenCartilageSmall':[r'(\d+)\s*份\s*黃金雞軟骨\(小\)'],
    'drinkMedium':[r'(\d+)\s*杯\s*(?:冰)?(?:無糖綠茶|百事可樂)\(中\)'],
    'chicken':[r'(\d+)\s*塊\s*咔啦脆雞',r'咔啦脆雞\s*[x×]\s*(\d+)'],
    'tart':[r'(\d+)\s*顆\s*原味蛋撻',r'原味蛋撻\s*[x×]\s*(\d+)'],
    'burger':[r'(\d+)\s*個\s*(?:雙層|花生熔岩)?咔啦雞腿堡',r'(\d+)\s*個\s*原味脆雞堡\(小\)'],
    'friesSmall':[r'(\d+)\s*份\s*香酥脆薯\(小\)'],
    'drinkSmall':[r'(\d+)\s*杯\s*(?:冰)?(?:無糖綠茶|百事可樂)\(小\)'],
    'nuggets':[r'(\d+)\s*塊\s*上校雞塊'],
    'qq':[r'(\d+)\s*顆\s*雙色轉轉QQ球'],
    'bottle1250':[r'1\.25L可樂乙瓶'],
    'pizza9':[r'(\d+)\s*個\s*9吋(?:[^+•]{0,15}?)比薩'],
    'pizza13':[r'(\d+)\s*個\s*13吋(?:[^+•]{0,15}?)比薩'],
    'roast':[r'(\d+)\s*塊\s*厚燒醬烤腿排'],
}
def simple_items(text):
    if re.search(r'選\s*\d|\d\s*選|或|禮盒|薯餅|加購',text):return None
    out={}
    for key,patterns in PATTERNS.items():
        for pattern in patterns:
            matches=list(re.finditer(pattern,text,re.I))
            if matches:
                out[key]=sum(int(m.group(1)) if m.lastindex else 1 for m in matches);break
    return out

def expiry(text):
    # Multiple intervals/unknown years intentionally require review.
    if re.search(r'\\|、|除外|停用|假日',text):return None
    found=re.findall(r'(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日',text)
    if len(found)!=1:return None
    try:return (datetime(*map(int,found[0]))+timedelta(days=1)).date().isoformat()
    except ValueError:return None

def refresh(data,brand,records,stamp):
    bycode={}
    for rec in records:bycode.setdefault(rec['code'],[]).append(rec)
    refreshed=0;conflicts=0
    for offer in data['offers']:
        if offer['brand']!=brand:continue
        seen=bycode.get(offer['code'],[])
        distinct={(r['priceMinor'],clean(r['text'])) for r in seen}
        if len(distinct)>1:
            offer['dataStatus']='conflict';offer['provenance']['conflictGroupId']=brand+'-'+offer['code'];conflicts+=1;continue
        if not seen or offer['dataStatus']=='conflict':continue
        rec=seen[0];v=offer['variants'][0]
        parsed=simple_items(rec['text'])
        same=(len(offer['variants'])==1 and not v.get('choice') and parsed==v['items'] and
              rec['priceMinor']==v['priceMinor'] and expiry(rec['context'])==offer['validity']['validWindows'][0].get('toExclusive'))
        if not same:
            offer['dataStatus']='pending';continue
        offer['dataStatus']='estimate'
        offer['provenance'].update(fetchedAt=stamp,parsedAt=stamp,method='html_parser_exact_approved_configuration',contentHash=sha256((rec['context']+rec['text']).encode()).hexdigest())
        refreshed+=1
    return refreshed,conflicts

def update(data,fetcher,stamp):
    candidates=[]
    for status in data['sources']:
        brand=status['brand'];status['lastAttemptAt']=stamp
        try:
            html=fetcher(SOURCE[brand]);records=parse_page(html)
            previous=status.get('parsedCount')
            if previous and len(records)<previous*.5:raise ValueError('解析筆數下降超過 50%，等待覆核')
            refreshed,conflicts=refresh(data,brand,records,stamp)
            status.update(lastSuccessAt=stamp,status='partial' if refreshed else 'needs_review',errorSummary=f'刷新 {refreshed} 筆已核對配置；{conflicts} 筆衝突；新券與選項待覆核。',parsedCount=len(records))
            candidates.extend(dict(brand=brand,**r) for r in records)
        except Exception as err:
            status.update(status='error',errorSummary=str(err)[:200])
            # Successful timestamps and the last readable records remain untouched.
    data['lastAttemptAt']=stamp;data['updateStatus']='attempted';data['datasetVersion']=stamp
    return data,candidates

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'FeastSaver/0.1 (public coupon aggregation; contact via repository)'})
    with urllib.request.urlopen(req,timeout=25) as response:
        if response.status!=200:raise ValueError(f'HTTP {response.status}')
        if 'text/html' not in response.headers.get('Content-Type',''):raise ValueError('來源不是 HTML')
        return response.read(5_000_000).decode('utf-8',errors='strict')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--snapshot',default=str(ROOT/'data/offers.json'));args=parser.parse_args()
    path=Path(args.snapshot);data=json.loads(path.read_text(encoding='utf-8'))
    stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
    before=json.loads(json.dumps(data));result,candidates=update(data,fetch,stamp)
    path.with_suffix('.previous.json').write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf-8')
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    (path.parent/'candidates.json').write_text(json.dumps(dict(fetchedAt=stamp,records=candidates),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps([dict(brand=s['brand'],status=s['status'],summary=s['errorSummary']) for s in result['sources']],ensure_ascii=False))

if __name__=='__main__':main()
