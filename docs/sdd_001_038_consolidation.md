# Mongo SDD-001～038 決策索引與整合審查

**狀態：** Review Required（文件整理完成，跨文件衝突尚待決議）  
**日期：** 2026-11-03  
**範圍：** 對話中已確認的 SDD-001～038；不代表 Repository 已實作或已通過測試  
**既有主文件：** [Phase 1 Design](phase1_design.md)

> 本文件是 SDD 決策索引與差異審查，不取代 `phase1_design.md`。如兩份文件有矛盾，不可默默以較新的 SDD 覆蓋既有 Confirmed 決策；必須由使用者明確裁決，再同步兩份文件。

## 一、決策狀態定義

- **Confirmed**：使用者在對話中已選定的方向；不代表提案中的範例數值、程式介面及演算法細節都獲批准。
- **Proposed**：架構審查建議，尚待批准。
- **Experimental**：只供 Prototype / Balance Test 使用。
- **Deferred**：不列入首個 Vertical Slice。
- **Conflict**：與既有主設計文件的 Confirmed 規則不一致，必須先裁決。

## 二、SDD-001～038 Decision Index

| SDD | 主題 | Confirmed 決策 | 尚未定案的部分 |
| --- | --- | --- | --- |
| 001 | Simulation Execution | Main Thread；量測後再考慮 Worker | 效能門檻 |
| 002 | State Ownership | Core Single Writer；Commands 修改權威 GameState | 具體 API |
| 003 | State Subscription | Subscribe + versioned snapshots / changed domains；Domain Events 分離 | Snapshot granularity |
| 004 | Command Atomicity | 同步原子 Commands；成功提交後才發布 Events | Error schema |
| 005 | Fixed Tick | 1×=60s、2×=30s、4×=15s；離線 1× 最多 72h / 4320 Ticks | 月結算相位 |
| 006 | Background Runtime | 執行中背景頁維持選定倍速；新 Runtime 離線以 1× 補算 | 多分頁 Lease |
| 007 | Persistence | IndexedDB 原子 Checkpoint；版本化 GameState / Tick / PRNG / scheduler metadata | Schema / migrations / Web Locks |
| 008 | Spatial Data | Dense Tile Grid；normalized Parcel / Building；deterministic IDs；不用 ECS | Parcel geometry |
| 009 | Population Storage | 每棟住宅 Building Aggregate；NPC 視覺獨立 | Population schema |
| 010 | Roads | Tile Grid 權威道路；roadRevision 衍生 Road Graph；允許不連通 | Graph implementation |
| 011 | Auto Road Commit | Parcel 開發時規劃道路、建築及成本，完整驗證後原子提交 | Path planner |
| 012 | Road Financing | 私人開發商抽象負擔道路，不建立開發商錢包 | Cost constraint |
| 013 | Road Maintenance | MVP 無道路維護 | 後期維護 |
| 014 | Road Ownership | 自動生成道路一律公共 | — |
| 015 | Road Access | Parcel 可接任意公共道路，不要求 HQ 連通 | Access geometry |
| 016 | Independent Bootstrap | 無既有道路時可原子生成最低限度道路與建築 | 最小道路形狀 |
| 017 | Road Exclusion | 自動道路不可占用已分區或已占用 Tile，不可切割 Parcel | Tie-break |
| 018 | Zoning Modification | 僅尚未開工 Parcel 可取消／改分區；已開發不可 | 與 031 共同精確化 |
| 019 | Cancel Refund | 未開工取消分區，部分退款 | — |
| 020 | Refund Basis | 退款為原實付 `zoningPaidAmount` 的 80% | 整數取整 |
| 021 | Change Zone | 同一原子交易：退舊實付 80% + 收新用途全額；重設成本基礎 | UI Preview |
| 022 | Net Refund | 降級可淨退款；檢查交易後 Treasury 非負 | — |
| 023 | Zoning Cost | Parcel 面積 × 地價 × Zone Factor | 固定精度與加總順序 |
| 024 | Land Value | MVP 靜態地價；動態變化延後 | Config version |
| 025 | Geography | Terrain Type + Coast Distance | 距離演算法 |
| 026 | Coastal Factors | 各 Zone 不同海岸係數，共用海岸距離快取 | 係數 |
| 027 | Coastal Pricing | 農業海岸折價、住宅溢價、商業輕微溢價 | 倍率均 Experimental |
| 028 | Coastal Attractiveness | 住宅海岸價格溢價保留；吸引力效果延後 | Gameplay validation |
| 029 | Development Lifecycle | `ZONED → CONSTRUCTING → DEVELOPED` | Planner / retries |
| 030 | Construction Start | 道路、建築 Footprint、工地同 Tick 原子提交；完工才提供容量 | Schema |
| 031 | Construction Lock | 開工後不可取消／改用途；只允許 `ZONED` 修改 | UI warning |
| 032 | Evaluation Timing | 新分區下一 Development Tick 即可評估，無保證開工 | 候選排序 |
| 033 | Start Throttle | 每 Tick 最多 N 個成功開工；N Data-driven | N=2 Experimental |
| 034 | Construction Duration | 各 Building Type 固定工期（Ticks），開始時持久化 completionTick | Farm/Residential=1、Commercial=2 為 Experimental |
| 035 | Migration Trigger | 住宅容量與工作機會共同限制；ACTIVE 建築才提供容量 | 道路可達性、詳細公式 |
| 036 | Jobs-to-Population | 固定 Jobs-to-Population Ratio R；不做完整就業分配 | R=2 Experimental |
| 037 | Migration Rate | 每 Simulation Tick 固定最大移民 M；Data-driven | M=3 Experimental |
| 038 | Residential Allocation | 依 Building 建立順序，先填滿較早住宅 | 同 Tick 穩定排序欄位 |

## 三、與既有 Phase 1 主文件的衝突（需使用者裁決）

### BLOCKER-01：第一批移民是否需要住宅分區

- `phase1_design.md` D-27、§8、§10.1、M3 明確確認：**第一塊農地後 1～3 分鐘出現農舍與首批移民；農舍提供住宅容量，初期不要求住宅分區**。
- SDD-035～038 明確確認：**住宅容量 + 工作機會共同限制移民**；農場提供工作、住宅提供容量的開局示例，容易被解讀為必須另外劃設住宅區。
- **不能直接把「必須先劃住宅區」寫成已確認需求。**
- 待決方案：
  1. **保留農舍**：農業開發同時產生可居住農舍（或農業 Building 同時提供 Housing Capacity 和 Jobs），沿用原先農地開局。
  2. **改為農業 + 住宅雙分區**：正式修訂 D-27、M3、開局引導與 1～3 分鐘驗收。
- 不論選哪個，R / M、人口入住順序、建築容量來源必須一致。

### BLOCKER-02：Phase 1 範圍與首個 Vertical Slice 範圍不同

- 既有主文件確認 **探索 + 規劃雙模式**、手機瀏覽器、三種分區、農舍、月結算及後期遷出為 Phase 1 方向。
- SDD Consolidation 建議的 **首個 Vertical Slice** 僅聚焦農業／住宅／移民，可先不交付完整商業、雙模式、遷出及完整財政。
- **建議保留主文件的 Phase 1 範圍，另標示較小的 Vertical Slice 驗收範圍**；不得把縮小 Vertical Slice 當作撤銷 Phase 1 已確認功能。

### BLOCKER-03：建築退出／人口遷出 vs. 不可取消施工

- 主文件 D-10、§6、§7、Phase 1 DoD 提及私人建築退出、人口遷出。
- SDD-031 禁止的是玩家在開工後取消／修改 Parcel；SDD-035～038 **尚未設計**人口遷出或建築退出。
- 不應把「施工不可取消」誤解成「建築永遠不能退出」，也不能在首個 Vertical Slice 假裝已有遷出。
- 建議把退出與遷出標成 Phase 1 後續工作，首個 Vertical Slice 明確不驗收。

### BLOCKER-04：道路生成時機

- 主文件 D-09、§5.3 使用「分區或建築自帶道路」與「分區、Parcel 或特殊建築建立時」的概念描述。
- SDD-011、030 明確要求 **Parcel 開發開始時** 才原子建立道路與工地。
- 建議在主文件將私人 Parcel 道路生成時機精確化為「開工時」，公共特殊建築道路規則另行定義。

### BLOCKER-05：現有概念 Schema 與已確認 Lifecycle

- 主文件 §5.1 的 Building Status 為 `active | vacant | abandoned`，並沒有施工狀態。
- SDD-029～034 需要 `CONSTRUCTING | ACTIVE` 及持久化 `completionTick`；空置／廢棄應是未來另一個維度，不宜混為同一狀態機。
- 主文件 §10 寫儲存方案依資料量決定；SDD-007 已選 **IndexedDB**。
- 主文件 §5.2、§7 的定價、人口吸引力公式是 Prototype 舊提案，**不應凌駕 SDD-020～028、035～038**。
- 待批准同步主文件後再調整概念 Schema 與文字。

## 四、實作前 P0 規格收斂

| 項目 | 待決定 | 建議預設（未批准） |
| --- | --- | --- |
| Map Initialization | 固定 LandMask、HQ 合法位置與開局起算 | 固定測試地圖；玩家先免費放置 HQ |
| Parcel Geometry | 建立、連通、最小面積、重疊 | 矩形且 4-neighbor connected |
| Road Planner | 起點、寬度、最短路、tie-break、失敗原因 | 確定性 Grid 搜尋 |
| Building Selection | Zone→Building Type、Footprint、Capacity | 每種 Zone 先一種 Building |
| Economy | 初始資金、分區費率、成本取整 | 固定精度，禁止透支 |
| Tick Order | Completion / Development / Migration / Month Settlement | Completion→Development→Migration→Settlement |
| Development Order | 候選順序、無效候選重試 | 建立順序 FIFO，失敗跳過 |
| Migration Atomicity | 住宅分配與人口守恆 | Plan→Validate→Commit |
| Persistence | v1 Schema、Config Version、PRNG、Checkpoint | IndexedDB 原子 Checkpoint |

## 五、首個 Vertical Slice：建議驗收範圍

**不等於完整 Phase 1 DoD。** 在 BLOCKER-01 解決前，開局驗收條件仍待確認。

1. 固定 64×64 測試島嶼，免費 HQ 選址，成功放置後開始 Tick。
2. 農業與住宅分區（商業資料可預留，完整經濟延後）。
3. 分區成本、80% 退款、改分區交易原子性。
4. 開發時道路與建築工地原子提交；工期以 Building Type 的 Tick 數決定。
5. ACTIVE 建築提供 Housing / Job Capacity；施工中不提供。
6. 固定 R、M；按 Building 建立順序分配移民；不超出容量。
7. Pause、1×/2×/4×、IndexedDB Save/Load、72h Offline Catch-up。
8. 最小 Three.js 場景與可操作分區 UI；玩家能觀察施工與首批移民。
9. Golden Scenario 可重播，人口守恆、財政非負、道路與建築不重疊。
10. 驗證首批移民 1× 1～3 分鐘目標；確切操作起點須與主文件一致。

## 六、建議第一批 PR / Work Items（非實作完成聲明）

1. **Docs reconciliation**：裁決 BLOCKER-01～05，更新 `phase1_design.md` 與本索引。
2. **Core foundation**：GameState、Commands、Tick、Snapshot、Domain Events、Determinism Tests。
3. **World and zoning**：Tile Grid、Parcel、靜態地價、退款及原子交易。
4. **Road and development**：Road Planner、開工／完工、Building Definitions。
5. **Migration**：H/J/R/M、Building Aggregate、FIFO 分配。
6. **Playable prototype and persistence**：Three.js 操作、IndexedDB、離線補算與 Golden Scenario。

## 七、驗證紀錄與限制

- 本文件是根據對話中的 SDD-001～038 與 Repository `main` 的 `docs/phase1_design.md` 進行**文件層級整合**。
- 已讀取主文件與 README；未取得完整 Repository Tree，因此**不能宣稱已審核全部程式碼、測試或 CI**。
- 未執行測試、建置、遊戲原型或效能量測。
- 本 PR 不修改遊戲程式碼，不變更主設計文件既有 Confirmed 決策，不自動合併。
