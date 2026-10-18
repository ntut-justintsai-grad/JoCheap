"""Fail-closed meal checks and reproducible bindings for reviewed configurations."""
import json

BOUND_FIELDS=('brand','code','title','priceType','displayPriceMinor','variants','validity','ordering','eligibility','limits','combinationPolicy','officialUrl')

def content_signature(offer):
    return json.dumps({k:offer.get(k) for k in BOUND_FIELDS},ensure_ascii=False,sort_keys=True,separators=(',',':'))

def source_signature(offer):
    fields=('sourceId','text','priceMinor','priceType','validWindows','ordering','parsedConfigurations','parseIssues','sourceItems')
    rows=[{k:o.get(k) for k in fields} for o in offer.get('observations',[])]
    rows.sort(key=lambda r:json.dumps(r,ensure_ascii=False,sort_keys=True))
    return json.dumps(dict(content=json.loads(content_signature(offer)),observations=rows),ensure_ascii=False,sort_keys=True,separators=(',',':'))

def meal_issues(variants):
    issues=[]
    if not variants:issues.append('沒有完整可辨識的套餐配置')
    unknown=set()
    for v in variants:
        groups=v.get('optionGroups',[])
        for items in [v.get('items',{})]+[o.get('items',{}) for g in groups for o in g.get('options',[])]:
            unknown.update(k for k in items if k.startswith('food_'))
        if not v.get('items'):issues.append('配置沒有餐點')
        for g in groups:
            if not g.get('options') or len(g.get('options',[]))<2:issues.append('替換選項不完整')
    if unknown:issues.append('含未完成對照的餐點；保留原文，停止參與推薦')
    return list(dict.fromkeys(issues))

def audit_report(data,stamp):
    from collections import Counter
    entries=[]
    for o in data['offers']:
        issues=list(dict.fromkeys(o.get('qualityIssues',[])+meal_issues(o['variants'])+([o['reviewReason']] if o.get('reviewReason') else [])))
        v=o.get('verification',{})
        entries.append(dict(brand=o['brand'],code=o['code'],dataStatus=o['dataStatus'],verificationStatus=v.get('status','unverified'),issues=issues,sourceCount=len(o.get('observations',[])),checkedAt=v.get('checkedAt'),reviewBy=v.get('reviewBy')))
    return dict(generatedAt=stamp,total=len(entries),byDataStatus=dict(Counter(e['dataStatus'] for e in entries)),byVerificationStatus=dict(Counter(e['verificationStatus'] for e in entries)),withQualityIssues=sum(bool(e['issues']) for e in entries),recommendationPolicy='all_source_versions_with_evidence_labels',offers=entries)
