"""Coupon-specific ordering evidence. Collection method and fulfilment are separate."""
import re,unicodedata
from datetime import datetime

def parse_ordering(text):
    t=unicodedata.normalize('NFKC',text)
    platforms=None;excluded=[];evidence=[];fulfilments=None
    def has(pattern):
        match=re.search(pattern,t,re.I)
        if match:evidence.append(match[0]);return True
        return False
    if has(r'(?:APP|PK雙饗卡APP).{0,5}(?:專屬|限定|訂餐限定)|(?:限|僅限).{0,8}(?:PK雙饗卡)?APP(?:訂餐|購買)?'):platforms=['pk_app']
    elif has(r'(?:官網|官方網站).{0,5}(?:限定|專屬)|(?:僅限|限)(?:官網|官方網站)'):platforms=['official_web']
    elif has(r'(?:網路|線上).{0,6}(?:訂餐|訂購).{0,5}(?:限定|專屬)|限(?:網路|線上)(?:訂餐|訂購)'):platforms=['official_web','pk_app']
    elif has(r'(?:僅限|限)(?:臨櫃|櫃檯)|(?:臨櫃|櫃檯)(?:限定|專屬)'):platforms=['counter']
    elif has(r'(?:僅限|限)(?:自助點餐機|自助機)|(?:自助點餐機|自助機)(?:限定|專屬)'):platforms=['kiosk']
    elif has(r'(?:僅限|限)電話訂餐|電話訂餐(?:限定|專屬)'):platforms=['phone']
    elif has(r'(?:foodpanda|Uber\s*Eats|LINE點餐).{0,5}(?:限定|專屬)'):platforms=['third_party']
    for segment in re.findall(r'(?:不適用|不可使用|不得使用|不支援)[^。；;\n]{0,100}',t,re.I):
        for key,pattern in [('kiosk','自助點餐機|自助機'),('pk_app','APP'),('official_web','官網|官方網站'),('counter','櫃檯|臨櫃'),('phone','電話'),('third_party','第三方|foodpanda|Uber|LINE點餐')]:
            if re.search(pattern,segment,re.I):excluded.append(key);evidence.append(segment)
    if has(r'(?:限|僅限|限定)外帶|外帶限定|限自取'):fulfilments=['takeaway']
    elif has(r'(?:限|僅限|限定)外送|外送限定'):fulfilments=['delivery']
    elif has(r'(?:限|僅限|限定)內用|內用限定'):fulfilments=['dinein']
    for method,pattern in [('delivery',r'不(?:適用|可|提供)(?:於)?外送|外送不適用'),('takeaway',r'外帶不適用|不適用外帶'),('dinein',r'內用不適用|不適用內用')]:
        if has(pattern):fulfilments=[v for v in (fulfilments or ['takeaway','delivery','dinein']) if v!=method]
    online=has(r'限線上(?:結帳|付款)|須線上(?:結帳|付款)|僅限線上(?:結帳|付款)')
    if online and platforms is None:platforms=['official_web','pk_app']
    return dict(platforms=platforms,excludedPlatforms=sorted(set(excluded)),fulfilments=fulfilments,onlinePaymentRequired=online,evidence=list(dict.fromkeys(evidence)),status='source_explicit' if evidence else 'unknown')


def apply_reviewed_ordering(data, reviews, stamp):
    """Apply dated, product-specific negative evidence without verifying the whole coupon."""
    today=datetime.fromisoformat(stamp.replace('Z','+00:00')).date()
    for review in reviews:
        if not (datetime.fromisoformat(review['checkedAt']).date() <= today <= datetime.fromisoformat(review['reviewBy']).date()):continue
        for offer in data['offers']:
            if (offer['brand'],offer['code'],offer.get('sourceMetadata',{}).get('productCode')) != (review['brand'],review['code'],review['productCode']):continue
            rule=offer['ordering']
            excluded=set(review.get('excludedFulfilments',[]))
            rule['fulfilments']=[c for c in (rule.get('fulfilments') if rule.get('fulfilments') is not None else ['takeaway','delivery','dinein']) if c not in excluded]
            rule.setdefault('evidence',[]).append(review['finding'])
            rule.setdefault('officialRestrictionEvidence',[]).append(dict(review))
            rule['status']='official_partial_restriction'
            offer['conditions'].append(review['finding'])
            for variant in offer['variants']:
                variant['channels']=[c for c in variant['channels'] if c not in excluded]
            if not rule['fulfilments']:
                offer['dataStatus']='conflict';offer['reviewReason']='已查核限制與來源取餐方式沒有交集'
    return data
