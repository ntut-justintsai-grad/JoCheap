# KCouper 優惠券來源

2026-10-18：肯德基正式資料僅使用此資料鏈，已停用其他整理站的肯德基記載。本站讀取 KCouper 公開快照，並非直接逐券呼叫官方 API。

依上游公開程式確認。KCouper 是第三方維護的整理工具，上游是肯德基官方點餐 API。

[抓取與轉換程式](https://github.com/Winedays/KCouper/blob/master/script/gatherer/coupon.py)：

1. `customer/v1/getEVoucherAPI` 查券碼並取得商品代號。
2. `customer/v1/checkCouponProduct` 依設定門市、日期、餐期與外送／外帶方式檢查適用情況。
3. `menu/v1/GetQueryFoodDetail` 讀取預設餐點、可選替換及價格。
4. 套餐價為 `Original_Price` 加上各餐點第一個 `MList` 項的 `MListPrice × MinCount`。其餘選項整理為替換與加價，不是每種選項都同價。

API 位於 `https://olo-api.kfcclub.com.tw/`。本站使用上游發布的 [coupon.js](https://winedays.github.io/KCouper/coupon.js)，並非直接查詢所有門市，也沒有下訂單。

[上游工作流程](https://github.com/Winedays/KCouper/blob/master/.github/workflows/main.yml)：每日台北 00:30 快速更新，保留尚未過期的舊券；每週六 00:30 完整掃描，排程可能延遲。因此上游資料檔更新不代表每張券當天都重新查過。

適用方式與餐期在上游分別存成集合，未保留每組通路／餐期的對應，不能把所有交叉組合宣稱皆可用；本站保留此限制提醒。設定門市查到的配置也不保證全台門市、庫存或結帳一定接受。

本站每週日 08:17 重新讀取解析上游資料，分開保留上游檔案時間、本站讀取時間及額外的逐券核對時間。
