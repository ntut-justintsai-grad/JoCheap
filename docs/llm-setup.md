# 自然語言轉 JSON

前端依 `src/intent.js` 的同一份 schema 驗證回應，再填入人數、預算、正餐／下午茶、主餐、點心、飲料、取餐、品牌及明確數量。未提到的欄位為 null，保留使用者表單值。錯誤資料不套用，使用者可直接修改欄位。LLM 不產生餐點價格或優惠碼。

後端：`server/intent-service.mjs` 使用 OpenAI Responses API Structured Outputs（`text.format`、`json_schema`、`strict: true`）。官方文件：https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

## 啟用

1. 由 OpenAI Developers 的 `openai-platform-api-key` 技能依必要批准設定專案 API 金鑰，並確認專案費用限制。不要把金鑰貼到聊天或存入 GitHub。
2. 部署 `server/worker.mjs` 或 `server/start.mjs`，將 `OPENAI_API_KEY` 設為後端 runtime secret；`ALLOWED_ORIGINS=https://ntut-justintsai-grad.github.io`。可設定 `OPENAI_MODEL`，預設 gpt-4.1-mini。
3. GitHub repository variable `JOCHEAP_LLM_ENDPOINT` 設為 HTTPS 後端 origin（不包含 `/interpret`），重新執行 Pages 工作流程。也可在 `config/llm.json` 設定公開服務網址。這個網址不包含金鑰。
4. 確認 GET `/health` 回傳 `{ready:true}`，以實際網站呼叫 POST `/interpret` 並檢查欄位填入結果。無金鑰、無權限或未完成設定時，不宣稱 LLM 已連線；網站標示「基本文字辨識」。

公開 API 須經網站擁有者授權，並配置費用及防濫用措施。範例程式有來源檢查、輸入／輸出大小限制、逾時、每 IP 每小時 20 次與每個服務行程／隔離執行個體的每日請求上限；這些不是跨執行個體的硬性計費上限，正式大規模開放需配合平台的持久化限流與專案費用管理。

## 本機

Node.js 22，設定伺服器環境變數後執行 `node server/start.mjs`。`.env` 類檔案已排除於 Git，`.env.example` 僅列變數名稱。

## 測試範圍

測試涵蓋 JSON schema／欄位映射、下午茶無主餐、只喝飲料、錯誤回應、優惠資格與自動選定下單管道。模擬 API 測試不代表已連線真實模型；啟用前必須另做一次帶金鑰的實際端到端驗證。
