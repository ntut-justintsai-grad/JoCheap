# 必勝客官方查詢介面實測

2026-10-18 已以匿名連線確認官網實際使用的查碼介面及套餐內容。這是網站前端介面，尚未找到官方對外承諾穩定的開發者 API 文件，也未找到能一次列出所有優惠券、餐點與完整差額的 JSON 介面。

## 查碼 JSON

`POST https://www.pizzahut.com.tw/order/?m=ajax`，表單欄位：

```text
mode=get_dgtAll
type_id=
dType=plu
txtPLU=16448
```

官網 [優惠碼頁](https://www.pizzahut.com.tw/promotions/?mode=cpSch&type=plu) 的 `dgtCode_check` 函式也使用這個模式。

| 實測券碼 | 實際回應 | 可取得資訊 |
| --- | --- | --- |
| 16448 | success=true，type_id=1025，p_id=19169 | 券碼有效及商品識別 |
| 93034 | errCode=101 | 本次查詢不接受此碼；不能以舊整理文認定仍可用 |
| 00000 | errCode=101 | 無效碼對照 |

查碼 JSON 沒有套餐價格、餐點數量、口味範圍或升級差額，也不是券碼目錄。

## 官方套餐頁

`GET https://www.pizzahut.com.tw/order/?mode=step_2&type_id=1025&cno=16448`

匿名文字頁可取得：套餐 250 元、兩個 9 吋披薩，A 區七選一、B 區六選一。官網另提醒口味與餅皮升級可能加價，不把 250 元當成任意升級都同價。

需要結構化選單時，可建立匿名訂餐情境：

1. 讀套餐頁建立 session。
2. `POST /image/order_localization.php`（m=ajax、pl=p、path=order、sv 空白）取得當次情境欄位。
3. `POST /order/?m=ajax`（mode=step_1_update），選外帶門市與日期。
4. 重新讀取套餐頁，可得到 `psidss`、`pprcss`、`ctidss`、`exTopping` 等選單資料。

本次門市代碼 346、隔日外帶、券碼 16448 的情境設定成功，頁面有上述四組變數與 26 個選擇欄位。沒有加入購物車、提交訂單或付款；研究檔不保存 cookie 或情境權杖。這只能證明該情境取得選單，不能推定所有券、門市或時段都可用。

## 接入判斷

必勝客可採用「官方查碼 JSON → 官方套餐頁 → 指定情境的選單與價目」資料鏈；它比肯德基純 JSON 的餐點資料需要更多解析與上下文。目前必勝客正式配餐來源維持原設定，本次不把查碼成功當成整張券的所有配置均核對。

[實測摘要與原始查碼回應](../data/api_research/pizzahut-20261018.json)。調查線索來自 [HutDeals](https://github.com/happk/HutDeals)，其公開程式描述相同查詢流程；本次結果另以官方介面實測確認，未執行該專案程式。
