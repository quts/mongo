# Mongo · 發現新大陸

原創島嶼／城鄉經營遊戲。此分支實作 SDD P0 首個 Vertical Slice，**不代表完整 Phase 1 完成**。

## 本機開發

Node.js 24（`.nvmrc`）、npm：

```sh
npm ci
npm run dev
```

打開終端顯示的本機網址。Vercel 可直接使用 Vite preset，建置 `npm run build`、輸出 `dist`；不需要後端、帳號或環境變數。

## 操作

1. 在地圖點選合法陸地，預覽並免費放置 2×2 村委會大樓；放置後開始計時。
2. 選「農業」，拖曳框出完整矩形，檢查費用後確認。至少 2×2 且邊界外側留有道路空間才能開發；合法但不可開發的地塊會顯示原因。
3. 下一 Tick 開工，自動產生公共農路；再下一 Tick 完工並迎來島民。1× 每分鐘一 Tick，可用 2×／4× 加速。
4. 「檢視分區」可選取地塊；只有未開工地塊可取消或變更用途。退款為原實付的 80%，改用途顯示淨費用。
5. 「平移／縮放」以拖曳、雙指操作鏡頭；滾輪與右下角按鈕可縮放。
6. 自動保存單一本機存檔。暫停後關閉不補算；否則重啟以 1× 補算最多 72 小時。重新開始需要兩次確認。

需要支援 WebGL、IndexedDB、Web Locks 的安全來源（HTTPS 或 localhost）。第二分頁與無 Web Locks 瀏覽器唯讀；無法讀取／驗證存檔或寫入失敗會停止寫入並保留資料。此 Slice 無匯出／雲端備份，請勿任意清除網站資料。

## 驗證

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

CI 執行以上檢查與桌面／手機尺寸 Chromium 情境。瀏覽器測試會快轉固定時鐘，涵蓋 HQ、框選農地、完工移民、暫停重載、多分頁與重新開始。單元測試涵蓋財政原子性、道路、施工／容量、月界、4320 Tick 逐 Tick 重播、存檔驗證與 CAS。

## 架構與決策

- `src/simulation/`：不依賴 DOM、React 或 Three.js 的權威 Core；Commands、唯讀版本化 Snapshot、分離 Domain Events。
- `src/rendering/`：Three.js 直接管理正交規劃鏡頭、Instanced 地圖、Picking 與幾何建築；只投影狀態，不擁有規則。
- `src/runtime.ts`：時鐘與 UI Commands、Web Locks 單一 Writer、IndexedDB Checkpoint。
- `src/persistence/`：v1 驗證、原子讀寫與 revision CAS；未知版本拒絕載入，未建立不需要的 v2 遷移。
- `src/data/config.ts`：Experimental 平衡數值，版本化綁定存檔；更新數值必須更新版本並設計遷移，不能重算歷史費用／工期。
- `src/data/test-island.json`：固定版本的臨時測試地圖；不是最終島嶼資產。此版平地、海岸距離採 4-neighbor BFS。

私人道路／建築不扣公共財政，MVP 道路不收維護費。月界每 120 Tick、每年 1440 Tick；未定義的月收支為 0。PRNG seed/state 已保存；此版規劃與入住皆確定性排序，沒有額外隨機抽樣。商業定義與 Core 路徑已有測試，UI 依 Slice 範圍只開放農業、住宅。

規則權威：[Phase 1](docs/phase1_design.md)、[SDD-001～038 / P0](docs/sdd_001_038_consolidation.md)。主文件與 SDD 中較早標為 Proposed 的項目，後續 P0-01～10 已明確 Confirmed 者依該節實作；文件原有決策狀態未擅自改寫。

## 交付限制

- 本版是規劃模式 Slice；探索／tland 控制移植、商業操作 UI、完整需求與財政平衡、建築退出、人口遷出仍屬後續 Phase 1。
- 只有 Primitive 美術，無正式島嶼輪廓；居民以建築旁的簡單標記呈現，不模擬個體 AI。
- 手機尺寸瀏覽器測試不等同實體 iOS／Android 效能驗收；實機、Vercel Preview 與長期經濟平衡仍須另驗證。
- 依賴鎖定於 `package-lock.json`；Lint 工具鏈的 minimatch 覆寫至 11.x 修補版本，型別、Lint、建置與測試需共同驗證相容性。
