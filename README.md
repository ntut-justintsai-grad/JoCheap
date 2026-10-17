# JoCheap｜揪省・今天怎麼點最省 v0.5

肯德基必勝客任你選，越揪越省！

給 5～8 人聚餐使用的肯德基 × 必勝客優惠組合工具，預設 6 人。主餐可混搭，接受多出的餐點，以包含已知費用的低總額方案優先。直接開啟 `index.html`，或部署到 GitHub Pages。

## 使用

1. 選人數、共享／每人一份、預算。
2. 複選披薩、炸雞、漢堡、紙包雞、義大利麵。系統依人數分配，每種已選主餐都是必要需求；可展開調整份量。
3. 點心用「有一點／剛剛好／很豐富」選擇，指定點心依品牌分組。
4. 有需要再展開進一步調整，選口味、飲料／湯、下單及取餐方式。
5. 比較結果列出每筆券碼、餐點、飲料名稱、逐杯換購差額與多出的餐點。

文字框可輸入「六人，紙包雞 3 份、3 份義大利麵，點心有一點，冰奶茶，官網外帶」，先看解析摘要再套用。這是本機規則解析，無須 API 金鑰；無法理解的部分會提示。

披薩先用小披薩 6 片、大披薩 8 片估份，依食量提供每人片數建議，均可調整。份量只是規劃假設。預設不指定口味種類；若指定海鮮、肉類或口味數，只使用有對應口味資料的配置。口味標籤不能用於過敏原保證。

## 點餐方式與限制

預設「官方網站」，另可選 PK 雙饗卡 APP、櫃檯、自助點餐機、電話。平台與外帶／外送／內用分開選，不支援的組合停用。會員資格與線上付款各自判斷，登入會員不代表使用 APP。

有明確限制的券，不符合時不參與推薦。沒寫清楚的券標示「下單／付款方式尚未確認」，預設允許作來源估算；取消「納入下單方式待確認的來源估算」即可排除。未記載限制不等於所有平台可用。

2026-10-17 抽查 KFC 16845、26383、16298 官方餐點資料，均載明不適用外送，已加入排除。此查核只確認這項限制，未確認整張券可成功結帳；須符合相同產品代號，並於 2026-10-24 前複查。更新時超期停止套用，未更新的固定快照保留當時規則。

每張券按獨立訂單估算，逐筆計費與套用已知限購。重複使用、門市供應、是否出示圖檔等，未查明時仍待確認。外送費未知時總額保持未知，不當零元。

## 資料與換購

2026-10-17 成功下載五個公開來源，1,964 筆紀錄去重為 1,167 個品牌／券碼：KFC 973、必勝客 194。其中 1,035 張來源估算、92 張衝突、40 張待解析。這不是當下全部可用的券數，仍須篩選日期、需求與資格；衝突與待解析可瀏覽，但不進入計算。

| 來源 | 紀錄數 |
| --- | ---: |
| [好康情報誌 KFC](https://info.talk.tw/kfc-coupon/) | 297 |
| [好康情報誌必勝客](https://info.talk.tw/pizzahut-coupon/) | 81 |
| [Calling Taiwan KFC](https://www.callingtaiwan.com.tw/kfc-coupon-code/) | 427 |
| [Calling Taiwan 必勝客](https://www.callingtaiwan.com.tw/pizzahut-coupon-code/) | 188 |
| [KCouper 公開資料](https://winedays.github.io/KCouper/coupon.js) | 971 |

KCouper 僅作公開優惠事實與選項資料來源，保留歸屬，未納入其介面程式。所有來源估算未逐券完成官方結帳驗證。紀錄、雜湊、抓取時間與衝突觀察在 `data/`。

飲料／餐點替換綁定原券選項槽，按杯／份替換原餐點並加價。例如 26383 小飲料改冰奶茶每杯加 5 元，兩杯加 10 元；26382 原中飲料對應替換同價，不能跨券套用。冷熱奶茶與湯可分開選。

必勝客加 1 元副食、燉飯加塔、A＋B 副食 69 元起等已放在研究區；公開資料沒有完整門市配置價，暫不當固定價單買優惠。詳見 [研究與限制](docs/coupon_research_v05.md)。

## GitHub Pages 部署

1. 建立儲存庫，預設分支 `main`。
2. 解壓縮，將內容完整提交至儲存庫根目錄，包含 `.github/workflows/pages.yml`。不要只上傳 ZIP。
3. **Settings → Pages → Build and deployment → Source → GitHub Actions**。
4. **Settings → Actions → General → Workflow permissions** 允許讀寫，以保留更新快照；組織儲存庫須配合組織政策。
5. **Actions → Update coupons and deploy Pages → Run workflow**。
6. 成功後從部署結果或 **Settings → Pages** 取得網址。

流程先跑測試，再抓五個來源、驗證、建置、部署；每六小時排程一次。抓取失敗或筆數突降超過一半時保留該來源上次成功紀錄與時間。GitHub 排程可能延遲或因長期無活動而停用。實際部署狀態請查看儲存庫的 Actions 與 Settings → Pages。

若只要固定快照，只上傳 `index.html`，將 Pages 設為 **Deploy from a branch → main → /(root)**；此方式不自動更新。

## 開發

Node.js 22 以上、Python 3.12 以上，無第三方套件依賴。

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
npm run build
npm start
```

實際抓取：`python tools/crawl_catalog.py`。

- `src/engine.js`：計算、換購、資格與搜尋。
- `src/planner.js`：混搭分配、點心份量、中文規則解析。
- `src/catalog-ui.js`：分頁瀏覽、每份選項與來源證據。
- `src/app.js`：互動與本機偏好保存。
- `tools/crawl_catalog.py`：新券納入、失敗保留與報告。
- `tools/catalog.py`、`food_parser.py`、`ordering_rules.py`：解析與限制。
- `data/ordering_reviews.json`：具期限及產品識別的官方限制抽查。
- `tools/build.mjs`：產出單一 HTML。

舊 `tools/update_sources.py` 保留為解析工具與回歸測試，排程已改用新版 crawler。固定價格案例與即時資料驗證分開。

搜尋有時間、狀態與選項上限；未完成時只稱「目前找到的方案」，不宣稱已證明最低價。[驗證紀錄](docs/validation.md) 列出已通過與尚未完成項目。
