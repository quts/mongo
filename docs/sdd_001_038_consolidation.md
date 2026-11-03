# Mongo SDD-001～038 決策索引與整合審查

**狀態：** Review Required（Conflict-01～05 已裁決；P0 細節與測試仍待完成）  
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

## 三、與既有 Phase 1 主文件的衝突（五項均已裁決）

### RESOLVED-01：第一批移民是否需要住宅分區

- `phase1_design.md` D-27、§8、§10.1、M3 明確確認：**第一塊農地後 1～3 分鐘出現農舍與首批移民；農舍提供住宅容量，初期不要求住宅分區**。
- SDD-035～038 明確確認：**住宅容量 + 工作機會共同限制移民**；農場提供工作、住宅提供容量的開局示例，容易被解讀為必須另外劃設住宅區。
- **不能直接把「必須先劃住宅區」寫成已確認需求。**
- **Confirmed（使用者選 A，2026-11-03）：農場 Building 在 ACTIVE 後同時提供 Jobs 與少量 Housing Capacity（農舍）。** 不必先劃住宅區即可迎來首批移民；農舍不是額外自動生成的獨立 Building，也不需要獨立 Parcel／施工流程。
- SDD-035～038 之 Housing 計算與分配，適用於所有 ACTIVE 且 `housingCapacity > 0` 的 Building（包含農場），不只 Residential Zone 的 Building。人口 Aggregate 記錄在提供住宅容量的 Building 上。
- `CONSTRUCTING` 農場不提供 Jobs、Housing，也不直接產生人口。ACTIVE 後仍由每 Tick 的 R / M / 可用容量規則遷入，依穩定 Building 建立順序入住。
- 建議以 Building Definition 的 `housingCapacity`、`jobCapacity` 表示容量，具體欄位與數值仍為 Proposed / Experimental。
- 保留原始 Phase 1 D-27 與 1～3 分鐘目標；需在 Golden Scenario 實測，並確認 Tick Phase 順序。

### RESOLVED-02：Phase 1 範圍與首個 Vertical Slice 範圍不同

- **Confirmed（使用者選 A，2026-11-03）：分階段交付，完整 Phase 1 目標不變。** 首個 Vertical Slice 是中間的可玩驗證里程碑，不是縮小版 Phase 1，也不取代既有 M0～M6 或 Phase 1 Definition of Done。
- **Vertical Slice DoD：** 64×64 測試島嶼、最小 Three.js 規劃互動、農業優先開局（ACTIVE 農場提供少量 Housing 與 Jobs）、基本住宅分區、開工／完工、移民、基本分區財政、最小存檔／離線驗證；桌面可玩並做手機初步驗證。
- **Phase 1 DoD 保持不變：** 探索＋規劃雙模式、農業／住宅／商業三種分區、桌面與手機完整操作、簡化財政月結算、人口遷入／遷出及主文件已確認的其餘範圍。
- **邊界：** Slice 未實作的商業、完整財政、遷出與探索模式，不得標為 Rejected 或從 Phase 1 移除；只標示為後續 Phase 1 Milestones。Slice 完成不得宣稱 Phase 1 完成。
- **相容性：** SDD-001～038 的 Simulation / Zoning / Construction / Migration 規則不變；此決策只規範交付順序與兩套不同的驗收門檻。

### RESOLVED-03：建築退出／人口遷出 vs. 不可取消施工

- **Confirmed（使用者選 A，2026-11-03）：保留 Simulation 自主建築退出與人口遷出作為完整 Phase 1 需求，但延後至首個 Vertical Slice 之後。** 不刪除主文件 D-10、§6、§7 及 Phase 1 DoD 的既有產品目標。
- **SDD-031 不變：** 玩家只能取消／變更 `ZONED` Parcel；`CONSTRUCTING` 或 `DEVELOPED` Parcel 不可由玩家取消或改分區。這項玩家操作限制不禁止未來 Simulation 讓營運建築停業或退出。
- **SDD-029～034 不變：** 首個 Vertical Slice 僅處理分區、開工、固定工期、完工與 ACTIVE；不提前實作停業、廢棄、拆除或重新營運。
- **SDD-035～038 不變：** 首個 Vertical Slice 僅驗收 ACTIVE 建築提供容量及人口遷入；完整 Phase 1 後續設計人口遷出，不能將尚未實作的遷出宣稱已完成。
- **Conflict-01 / 02 相容：** ACTIVE 農場可同時提供 Housing 與 Jobs；首個 Slice 聚焦農業開局與人口成長。未來農場停業時容量與住戶如何處理，仍為未決規格。
- **Proposed，非本次批准：** 將 Construction Lifecycle 與 Operational Lifecycle 分離，未來可考慮 `ACTIVE / INACTIVE / ABANDONED`；具體停業條件、遷出速率、拆除、復業及人口處置規則全部待後續決策。

### RESOLVED-04：道路生成時機

- **Confirmed（使用者選 A，2026-11-03）：一般私人 Parcel 的實體自動道路僅在 Development System 開工時生成，不在分區建立時生成。** `phase1_design.md` §5.3 已同步精確化；D-09 的「玩家無需手動鋪路」仍然有效。
- **SDD-010～017 相容：** Road Tile Grid 為權威資料；道路與工地在同一 Atomic Development Command 提交；道路屬公共道路，由抽象私人開發商支付，不直接扣玩家財政；可形成不連接 HQ 的獨立聚落；不得占用已分區／已占用 Tile 或切割 Parcel。
- **SDD-018～022 相容：** 尚未開工的 `ZONED` Parcel 可取消／改分區，不需要刪除因該 Parcel 生成的實體道路（因為此時尚未生成）。
- **SDD-029～034 相容：** 先 Validate Parcel、Plan Road + Building、Validate Occupancy / Cost，再原子提交 Road Tiles、Building Footprint 與 `CONSTRUCTING` 狀態；任何驗證失敗均不得部分提交。道路開工後立即可用，建築 ACTIVE 前不提供 Housing / Jobs。
- **Conflict-01～03 相容：** 農場的 Housing / Jobs、Vertical Slice 交付邊界與未來建築退出規則不變。
- **仍未決：** 村委會與特殊建築道路的時機、成本與配置另依其規格設計；Road Preview 只屬可選 UX 提案，並未在本次批准。

### RESOLVED-05：主文件舊 Schema、存檔與公式同步

- **Confirmed（使用者選 A，2026-11-03）：** Phase 1 主文件維持唯一產品與範圍權威；經使用者批准的詳細 SDD 是對應技術／模擬規則的權威依據。當早期概念描述與已批准 SDD 不一致時，修訂主文件，不得反向推翻已確認產品需求。Conflict-01～04 保持有效。
- **Confirmed，已同步主文件：** SDD-001～004 Main Thread / Core Single Writer / Commands / Snapshots；SDD-007 IndexedDB 原子 Checkpoint；SDD-018～028 分區費、80% 原實付退款與靜態地價；SDD-029～034 Parcel 施工生命週期與 `completionTick`；SDD-035～038 ACTIVE Building 的 H/J、R/M 與穩定入住順序。ACTIVE 農場可同時提供少量 Housing 與 Jobs。
- **Schema 邊界：** `ZONED → CONSTRUCTING → DEVELOPED` 是 Parcel 開發階段；Building ACTIVE 表示完工並開始提供容量。主文件舊 `active / vacant / abandoned` 僅為營運狀態概念，非本次核准的完整狀態機；最終欄位/API 未定。
- **Experimental，禁止升級為 Confirmed：** 海岸倍率（農業 0.8／住宅 1.3／商業 1.1）、R=2、M=3、每 Tick 開工 N=2、Farm/Residential=1 Tick 與 Commercial=2 Ticks。
- **Proposed／未決：** 海岸距離算法、定價逐 Tile 加總與整數取整、完整 Schema、遷入示例公式的最終形式、開工排序、Tick 相位、Checkpoint 遷移與多分頁協調。
- **Deferred（保留完整 Phase 1 目標）：** 建築停業／退出、人口遷出、空置／廢棄／復業的具體規則。舊吸引力／遷出公式不是首個 Vertical Slice 的權威 Migration Algorithm。
- **文件治理：** 本索引是補充性 SDD 決策索引，不取代 `phase1_design.md`；本次同步不代表 P0 未決細節或遊戲平衡參數已完成審核。

## 四、實作前 P0 規格收斂

| 項目 | 待決定 | 建議預設（未批准） |
| --- | --- | --- |
| Map Initialization | 固定 LandMask、HQ 合法位置與開局起算 | 固定測試地圖；玩家先免費放置 HQ |
| Parcel Geometry | **Confirmed：** 首個 Vertical Slice 一次框選一個完整軸對齊矩形 Parcel；4-neighbor 連通、禁止重疊、非法整筆拒絕 | **Experimental：** minParcelArea=1 Tile；**Proposed：** 最小長寬／可建面積、UI 警告、正式 Schema 與未來遷移 |
| Road Planner | **Confirmed：** 最小合法接入既有公共道路；無合法路徑時獨立 Bootstrap；合法 Parcel 邊界接觸；開工原子提交 | **Proposed：** 1-Tile 寬、4-neighbor、BFS 成本／tie-break、Bootstrap 最小長度、錯誤碼 |
| Building Selection | Zone→Building Type、Footprint、Capacity | 每種 Zone 先一種 Building |
| Economy | 初始資金、分區費率、成本取整 | 固定精度，禁止透支 |
| Tick Order | **Confirmed：** Command Boundary → Completion → Development → Migration → Monthly Settlement（僅月界）→ Snapshot / Domain Events | **Proposed：** completionTick 算式、最短工期、月結算採 Tick 結束狀態；月界精確映射待測 |
| Development Order | 候選順序、無效候選重試 | 建立順序 FIFO，失敗跳過 |
| Migration Atomicity | 住宅分配與人口守恆 | Plan→Validate→Commit |
| Persistence | v1 Schema、Config Version、PRNG、Checkpoint | IndexedDB 原子 Checkpoint |

### P0 Road Planner — Confirmed（使用者選 A，2026-11-03）

- **策略：** 開工時先尋找可接入既有公共道路的最小合法新增道路路徑；若不存在合法連接路徑，允許生成獨立最小合法公共道路（Bootstrap），不強制連接 HQ 或全島道路網。Bootstrap 仍須有合法的 Parcel 邊界接觸點；沒有合法接觸點即不得開工，不能把「BFS 失敗」視為自動開工成功。
- **權威與限制：** Road Tile Grid 權威、Road Graph 衍生（SDD-010）；不得占用已分區／已占用 Tile、海洋或非法地形，不得切割矩形 Parcel（SDD-017；Parcel Geometry A）。既有道路可作連接端點，但不能重複當作新增道路占用。
- **成本與歸屬：** 新道路是公共道路，成本由抽象私人開發商負擔，不扣玩家公共財政；無道路維護費 MVP（SDD-012～014）。
- **開工原子性：** 僅在 Development Phase 生成道路；Road Plan、Building Footprint 與 Parcel `CONSTRUCTING` 同筆驗證、原子提交；失敗保持 `ZONED`，不留下部分道路／工地／扣款（SDD-011、029～034；Conflict-04）。成功後道路立即可用；建築仍待 Completion Phase 才提供 Housing／Jobs（Conflict-01；Tick Order A）。
- **開局驗收：** 獨立 Bootstrap 讓第一塊農地不依賴 HQ 道路連通，但不能保證 1× 的 1～3 分鐘移民目標；需用固定 LandMask、合法農地、Scheduler 相位、Development 順序、工期及 Migration 容量做 Golden Scenario 測試。
- **Proposed／未決：** 1-Tile 道路寬度、4-neighbor 道路連通及 Parcel 正交接觸、確定性 BFS（最少新增 Road Tile）、固定 Tile Index tie-break、起點／終點候選枚舉、Bootstrap 最小長度、合法道路接觸點選擇、錯誤碼、Road Revision 更新與未來路型擴充。選 A **不代表這些細節已 Confirmed**。
- **相容性：** SDD-010～017、矩形 Parcel、Conflict-01～05、Completion → Development → Migration → Settlement → Publish 不變；取消 `ZONED` Parcel 不刪除已存在的公共道路（SDD-018～022）。

### P0 Parcel Geometry — Confirmed（使用者選 A，2026-11-03）

- **首個 Vertical Slice：** 玩家一次矩形框選只建立一個非空、完整、軸對齊的矩形 Parcel；不自動裁切、拆分或合併。這是 Slice 範圍限制，不永久排除未來不規則 Parcel。
- **4-neighbor：** 完整矩形天然為單一 4-neighbor connected component；兩個僅對角接觸的 Parcel 不合併。Parcel Tile 歸屬唯一且與 Dense Tile Grid 保持一致（SDD-008）。
- **合法性與 Atomicity：** 矩形範圍內不得有海洋、非法地形、既有道路、Parcel 或 Building 占用；任一 Tile 不合法則整筆分區 Command 拒絕，不允許部分提交，也不因失敗收取部分費用。
- **Road Planner / Development：** 道路不得占用已分區或已占用 Tile，也不得切割 Parcel（SDD-010～017）；開工時才原子提交道路、Building Footprint 與工地（SDD-029～034），路徑規劃失敗不得部分開工。
- **取消／退款：** 僅 `ZONED` Parcel 可取消或改分區（SDD-018～022）；80% 退款基於原實付 `zoningPaidAmount`，不因目前地價或未來地價重算。改分區仍為同一原子退款／收費交易。
- **Conflict-01～05 與 Tick Order A：** ACTIVE 農場 Housing + Jobs、首個 Slice 的交付範圍、建築退出延期、道路開工時生成、主文件／SDD 權威原則均不變；Completion → Development → Migration → Settlement → Publish 順序不變。
- **Experimental：** `minParcelArea = 1 Tile` 僅作原型測試，**不是已批准的正式下限**。Parcel 可合法建立不代表一定能放下 Building Footprint 或連接合法道路。
- **Proposed／未決：** 最小長寬、最小可建面積、不可開發 Parcel 的 UI 警告、矩形 Bounds 與 Tile 集合的正式 Schema／驗證 API，以及未來支援不規則 Parcel 時的 ID、幾何、費用成本基礎與存檔版本遷移策略。

### P0 Tick Order — Confirmed（使用者選 A，2026-11-03）

- **Tick 順序：** 已驗證 Commands 於 Command Boundary 套用；`Construction Completion → Development → Migration → Monthly Settlement（僅遊戲月邊界）→ Snapshot / Domain Event Publication`。
- **Construction / Migration：** 到期工地先完工；ACTIVE Building（包含提供 Housing + Jobs 的農場）當 Tick 即可參與 Migration。當 Tick 新開工建築不可跳過工期，施工中不提供容量。
- **Atomicity：** Development 仍須一次提交合法道路、Building Footprint 與 `CONSTRUCTING`；Phase 結束前不發布不一致的外部狀態。不得重複月結算。
- **Offline / Replay：** 線上、背景及離線補算使用同一條 deterministic Core Tick Pipeline；離線以 1× 逐 Tick 邏輯推進，最多 72 小時／4320 Ticks，暫停關閉不補算。任何效能優化不得改變結算或 PRNG 結果。
- **1～3 分鐘目標：** 保留 Phase 1 D-27 的首批農舍與移民 UX 驗收；1 Tick 施工工期只是 Experimental，是否在 1～3 分鐘內出現須以 Scheduler 相位、Development 選取及容量的 Golden Scenario 實測，**尚未宣稱通過**。
- **Proposed / 未決：** `completionTick = startTick + durationTicks`、`durationTicks >= 1`、月結算使用 Tick 結束狀態、精確日曆／月界映射與事件發布失敗策略。以上不因選 A 自動變成 Confirmed。

## 五、首個 Vertical Slice：建議驗收範圍

**不等於完整 Phase 1 DoD。** Conflict-01 已解決：農場 ACTIVE 後同時提供住宅與工作容量；首塊農地可觸發首批移民，具體時間需測試。

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

1. **Docs reconciliation**：Conflict-01～05 均已裁決並同步；後續依 P0 未決項逐項審核與補充測試。
2. **Core foundation**：GameState、Commands、Tick、Snapshot、Domain Events、Determinism Tests。
3. **World and zoning**：Tile Grid、Parcel、靜態地價、退款及原子交易。
4. **Road and development**：Road Planner、開工／完工、Building Definitions。
5. **Migration**：H/J/R/M、具住宅容量的 Building Aggregate（含 ACTIVE 農場）、依建立順序分配。
6. **Playable prototype and persistence**：Three.js 操作、IndexedDB、離線補算與 Golden Scenario。

## 七、驗證紀錄與限制

- 本文件是根據對話中的 SDD-001～038 與 Repository `main` 的 `docs/phase1_design.md` 進行**文件層級整合**。
- 已讀取主文件與 README；未取得完整 Repository Tree，因此**不能宣稱已審核全部程式碼、測試或 CI**。
- 未執行測試、建置、遊戲原型或效能量測。
- 本 PR 不修改遊戲程式碼，不變更主設計文件既有 Confirmed 決策，不自動合併。
