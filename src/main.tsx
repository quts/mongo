import {
  Component,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { newId } from "./platform/id";
import { createRoot } from "react-dom/client";
import { Runtime } from "./runtime";
import { Island, type Tool } from "./rendering/island";
import { totals } from "./simulation/core";
import { refundAmount } from "./simulation/world";
import type { Bounds, Command, Result, Zone } from "./simulation/types";
import { Icon } from "./ui/Icon";
import "./style.css";
const names = { agriculture: "農業", residential: "住宅", commercial: "商業" };
const errors: Record<string, string> = {
  HQ_REQUIRED: "請先放置村委會大樓",
  TILE_UNAVAILABLE: "範圍內含海洋、道路或已占用土地",
  INVALID_BOUNDS: "請選擇島嶼格網內的完整矩形",
  INSUFFICIENT_FUNDS: "公共財政不足，整筆操作未執行",
  NO_BUILDING_FOOTPRINT: "合法，但面積不足以容納建築",
  NO_ROAD_ACCESS: "合法，但目前沒有可用的道路接觸點",
  CONSTRUCTION_LOCKED: "開工後不可取消或變更用途",
  READ_ONLY: "目前無法操作，請確認唯讀或補算狀態",
  RUNTIME_BUSY: "正在補算經過時間，完成後請重試操作",
  PARCEL_NOT_FOUND: "請先選取一塊分區",
};
function App() {
  const [runtime] = useState(() => new Runtime());
  const [, redraw] = useState(0);
  const [tool, setTool] = useState<Tool>("hq");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selected, setSelected] = useState<string>();
  const [message, setMessage] = useState("");
  const [resetStage, setResetStage] = useState(0);
  const [tab, setTab] = useState<"build" | "zones">("build");
  const [dialog, setDialog] = useState<"menu" | "help" | null>(null);
  const [grid, setGrid] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Island | null>(null);
  useEffect(() => {
    const unsub = runtime.subscribe(() => redraw((n) => n + 1));
    void runtime
      .start()
      .catch((e) =>
        setMessage(
          `無法讀取存檔：${String(e)}；原資料保留，請勿清除瀏覽器資料。`,
        ),
      );
    return () => {
      unsub();
      void runtime.stop();
    };
  }, [runtime]);
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new Island(
        host.current,
        (b, done) => {
          setDrawing(!done);
          setBounds(b);
          setSelected(undefined);
        },
        (i) => {
          const s = runtime.core.getSnapshot();
          setSelected(s.tiles[i].parcelId);
          setBounds(null);
        },
      );
    } catch (e) {
      setMessage(`3D 場景無法啟動：${String(e)}`);
    }
    return () => scene.current?.dispose();
  }, [runtime]);
  const state = runtime.core.getSnapshot(),
    stats = totals(state);
  useEffect(() => {
    if (state.started && tool === "hq") {
      setTool("agriculture");
      setTab("zones");
    }
  }, [state.started, tool]);
  useEffect(() => {
    scene.current?.project(state);
  }, [state]);
  useEffect(() => {
    scene.current?.setTool(tool);
  }, [tool]);
  useEffect(() => {
    scene.current?.setGridVisible(grid);
  }, [grid]);
  const id = () => newId();
  const candidate: Command | null = bounds
    ? tool === "hq"
      ? { id: "preview", type: "placeHQ", bounds, timestamp: Date.now() }
      : tool in names
        ? { id: "preview", type: "zone", bounds, zone: tool as Zone }
        : null
    : null;
  const preview = candidate ? runtime.core.preview(candidate) : null;
  useEffect(() => {
    scene.current?.showBounds(bounds, preview?.ok ?? true);
  }, [bounds, preview?.ok]);
  const act = (command: Command) => {
    const result = runtime.command(command);
    report(result);
    if (result.ok) {
      setBounds(null);
      if (command.type === "placeHQ") {
        setTool("agriculture");
        setTab("zones");
      }
      setDrawing(false);
    }
    return result;
  };
  function report(r: Result) {
    setMessage(
      r.ok
        ? r.warning
          ? (errors[r.warning] ?? r.warning)
          : "操作完成，進度已排入儲存。"
        : (errors[r.code] ?? r.code),
    );
  }
  const parcel = selected ? state.parcels[selected] : undefined;
  const switchTool = (t: Tool) => {
    setTool(t);
    setBounds(null);
    setSelected(undefined);
  };
  const modify = (zone?: Zone) => {
    if (!selected) return;
    act(
      zone
        ? { id: id(), type: "change", parcelId: selected, zone }
        : { id: id(), type: "cancel", parcelId: selected },
    );
  };
  const isIssue = /HTTP|唯讀|停止|不支援|正在補算/.test(runtime.status);
  const failedSave =
    runtime.unsaved && !runtime.writable && /停止/.test(runtime.status);
  const toolName =
    tool === "hq"
      ? "村委會大樓"
      : tool === "select"
        ? "檢視分區"
        : tool === "pan"
          ? "平移地圖"
          : `${names[tool]}分區`;
  const chooseTab = (tab: "build" | "zones") => {
    setTab(tab);
    switchTool(
      !runtime.writable
        ? "pan"
        : tab === "zones"
          ? "agriculture"
          : state.started
            ? "pan"
            : "hq",
    );
  };
  const cancelSelection = () => {
    setBounds(null);
    setSelected(undefined);
    setDrawing(false);
  };
  return (
    <main className="game-shell">
      <div ref={host} className="world" />
      <div className="hud-left">
        <div className="mode-pill">
          <Icon name="map" />
          <div>
            <h1>發現新大陸</h1>
            <span>規劃模式</span>
          </div>
        </div>
        <div className="calendar-pill">
          <Icon name="calendar" />
          <span>
            第 {Math.floor(state.tick / 1440) + 1} 年{" "}
            {Math.floor((state.tick % 1440) / 120) + 1} 月{" "}
            {(state.tick % 120) + 1} 日
          </span>
        </div>
      </div>
      <div className="resources" aria-label="島嶼概況">
        <div className="resource-pill" title="公共財政">
          <Icon name="coin" />
          <strong data-testid="treasury">
            {state.treasury.toLocaleString()}
          </strong>
          <span className="sr-only">公共財政</span>
        </div>
        <div className="resource-pill" title="島民／住宅容量">
          <Icon name="people" />
          <strong data-testid="population">
            {stats.population} <small>/ {stats.housing}</small>
          </strong>
          <span className="sr-only">島民／住宅容量</span>
        </div>
        <div className="resource-pill jobs-pill" title="工作容量">
          <Icon name="jobs" />
          <strong>{stats.jobs}</strong>
          <span className="sr-only">工作容量</span>
        </div>
      </div>
      <button
        className="round-button menu-button"
        aria-label="開啟選單"
        onClick={() => setDialog("menu")}
      >
        <Icon name="menu" />
        <span
          className={`save-dot ${runtime.unsaved ? "unsaved" : ""}`}
          aria-label={runtime.unsaved ? "有未儲存進度" : "進度已儲存"}
        />
      </button>
      <nav className="map-tools" aria-label="地圖操作">
        <button
          className="round-button"
          aria-label="平移 / 縮放"
          aria-pressed={tool === "pan"}
          onClick={() => switchTool("pan")}
        >
          <Icon name="pan" />
        </button>
        <button
          className="round-button"
          aria-label="檢視分區"
          aria-pressed={tool === "select"}
          onClick={() => switchTool("select")}
        >
          <Icon name="inspect" />
        </button>
        <button
          className="round-button"
          aria-label="顯示格線"
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          <Icon name="grid" />
        </button>
        <button
          className="round-button"
          aria-label="回到島嶼中央"
          onClick={() => scene.current?.resetView()}
        >
          <Icon name="center" />
        </button>
      </nav>
      <div className="zoom-controls">
        <button
          className="round-button"
          aria-label="放大地圖"
          onClick={() => scene.current?.zoom(1.25)}
        >
          ＋
        </button>
        <button
          className="round-button"
          aria-label="縮小地圖"
          onClick={() => scene.current?.zoom(0.8)}
        >
          −
        </button>
      </div>
      <div className="notice-stack">
        {isIssue && (
          <div
            className={`world-notice ${failedSave ? "error-notice" : ""}`}
            role="status"
          >
            {runtime.status}
          </div>
        )}
        {!isIssue && (
          <span className="sr-only" role="status">
            {runtime.status}
          </span>
        )}
        <p
          data-testid="storage-status"
          className={failedSave ? "save-warning" : "sr-only"}
        >
          {runtime.storageStatus}
        </p>
      </div>
      {!state.started && !isIssue && !bounds && (
        <div className="guide-note">
          <Icon name="hq" />
          <div>
            <strong>幹事，歡迎登島。</strong>
            <p>在島上點一處空地，免費設立村委會。</p>
          </div>
          <button aria-label="操作說明" onClick={() => setDialog("help")}>
            <Icon name="help" />
          </button>
        </div>
      )}
      {message && !bounds && !parcel && !isIssue && (
        <div className="action-toast" role="status">
          {message}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {bounds && preview && (
        <section
          className={`context-card ${drawing ? "is-drawing" : ""}`}
          aria-label="選址預覽"
        >
          <div className="context-heading">
            <Icon
              name={
                tool === "hq" ? "hq" : tool === "residential" ? "house" : "farm"
              }
            />
            <div>
              <h2>{tool === "hq" ? "村委會選址" : `${toolName}預覽`}</h2>
              <span>
                {bounds.maxXExclusive - bounds.minX} ×{" "}
                {bounds.maxYExclusive - bounds.minY} 格
              </span>
            </div>
            <button
              className="icon-close"
              aria-label="關閉選址預覽"
              onClick={cancelSelection}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className={`cost-preview ${!preview.ok ? "invalid" : ""}`}>
            <Icon name="coin" />
            {preview.ok
              ? `${preview.cost ?? 0} ${tool === "hq" ? "· 首次免費" : ""}`
              : (errors[preview.code] ?? preview.code)}
          </p>
          {preview.ok && preview.warning && (
            <p className="warning">{errors[preview.warning]}</p>
          )}
          {!drawing && (
            <div className="context-actions">
              <button
                className="primary-button"
                disabled={!runtime.writable || !preview.ok}
                onClick={() => candidate && act({ ...candidate, id: id() })}
              >
                <Icon name="check" />
                確認{tool === "hq" ? "放置" : "分區"}
              </button>
              <button className="soft-button" onClick={cancelSelection}>
                取消選取
              </button>
            </div>
          )}
        </section>
      )}
      {parcel && (
        <section className="context-card parcel-card" aria-label="分區資訊">
          <div className="context-heading">
            <Icon name={parcel.zone === "agriculture" ? "farm" : "house"} />
            <div>
              <h2>{names[parcel.zone]}分區</h2>
              <span>
                {parcel.lifecycle === "ZONED"
                  ? "等待開發"
                  : parcel.lifecycle === "CONSTRUCTING"
                    ? `施工中 · 第 ${parcel.completionTick} 日完工`
                    : "已完工"}
              </span>
            </div>
            <button
              className="icon-close"
              aria-label="關閉分區資訊"
              onClick={() => setSelected(undefined)}
            >
              <Icon name="close" />
            </button>
          </div>
          <p>
            原實付 {parcel.zoningPaidAmount} · 退款{" "}
            {refundAmount(parcel.zoningPaidAmount)}
          </p>
          {parcel.lastFailureCode && (
            <p className="warning">
              {errors[parcel.lastFailureCode] ?? parcel.lastFailureCode}
            </p>
          )}
          {parcel.lifecycle === "ZONED" ? (
            <>
              <div className="context-actions">
                {(["agriculture", "residential"] as Zone[]).map((zone) => {
                  const quote = runtime.core.preview({
                    id: "preview-change",
                    type: "change",
                    parcelId: parcel.id,
                    zone,
                  });
                  return (
                    <button
                      className="soft-button"
                      key={zone}
                      disabled={!runtime.writable || !quote.ok}
                      onClick={() => modify(zone)}
                    >
                      {names[zone]} {quote.ok ? `(${quote.cost ?? 0})` : ""}
                    </button>
                  );
                })}
                <button
                  className="soft-button"
                  disabled={!runtime.writable}
                  onClick={() => modify()}
                >
                  取消分區 · 退回 80%
                </button>
              </div>
            </>
          ) : (
            <p className="warning">已開工，不能取消或改分區。</p>
          )}
        </section>
      )}
      <section className="construction-dock" aria-label="規劃工具列">
        <div className="dock-top">
          <div className="dock-tabs" role="tablist" aria-label="工具分類">
            <button
              role="tab"
              aria-selected={tab === "build"}
              onClick={() => chooseTab("build")}
            >
              <Icon name="hq" />
              建設
            </button>
            <button
              role="tab"
              aria-selected={tab === "zones"}
              disabled={!state.started}
              onClick={() => chooseTab("zones")}
            >
              <Icon name="grid" />
              分區
            </button>
          </div>
          <div className="time-controls">
            <button
              aria-label={state.scheduler.paused ? "繼續" : "暫停"}
              title={state.scheduler.paused ? "繼續" : "暫停"}
              disabled={!runtime.writable || !state.started}
              onClick={() =>
                act({
                  id: id(),
                  type: "time",
                  speed: state.scheduler.speed,
                  paused: !state.scheduler.paused,
                })
              }
            >
              <Icon name={state.scheduler.paused ? "play" : "pause"} />
            </button>
            <select
              aria-label="遊戲速度"
              value={state.scheduler.speed}
              disabled={!runtime.writable || !state.started}
              onChange={(e) =>
                act({
                  id: id(),
                  type: "time",
                  speed: Number(e.target.value) as 1 | 2 | 4,
                  paused: false,
                })
              }
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <button
            className="dock-help"
            aria-label="操作說明"
            onClick={() => setDialog("help")}
          >
            <Icon name="help" />
          </button>
        </div>
        <div
          className="tool-cards"
          role="tabpanel"
          aria-label={tab === "build" ? "公共建設" : "土地分區"}
        >
          {tab === "build" ? (
            <>
              <button
                className="tool-card"
                aria-label="村委會大樓"
                aria-pressed={tool === "hq"}
                disabled={!runtime.writable || state.started}
                onClick={() => switchTool("hq")}
              >
                <Icon name="hq" />
                <span>村委會大樓</span>
                <small>{state.started ? "已設立" : "首次免費"}</small>
              </button>
              <div className="tool-description">
                <strong>
                  {state.started
                    ? "島嶼開拓，從這裡開始。"
                    : "選一處喜歡的地方。"}
                </strong>
                <p>
                  {state.started
                    ? "村委會是島嶼的第一座公共建築。"
                    : "點選 2×2 空地，確認後就任幹事。"}
                </p>
                <span>公共建設</span>
              </div>
            </>
          ) : (
            <>
              <button
                className="tool-card"
                aria-label="農業"
                aria-pressed={tool === "agriculture"}
                disabled={!runtime.writable}
                onClick={() => switchTool("agriculture")}
              >
                <Icon name="farm" />
                <span>農業</span>
                <small>農舍與工作</small>
              </button>
              <button
                className="tool-card"
                aria-label="住宅"
                aria-pressed={tool === "residential"}
                disabled={!runtime.writable}
                onClick={() => switchTool("residential")}
              >
                <Icon name="house" />
                <span>住宅</span>
                <small>島民的家</small>
              </button>
              <div className="tool-description">
                <strong>
                  {tool === "residential"
                    ? "讓島民在這裡安家。"
                    : "讓第一片農地長出故事。"}
                </strong>
                <p>框選完整矩形，確認費用後分區。</p>
                <span>私人建築會隨時間自主發展</span>
              </div>
            </>
          )}
        </div>
      </section>
      <span className="world-caption">開拓島 · 測試地形</span>
      <span className="sr-only" data-testid="tick">
        Tick {state.tick} ·{" "}
        {!state.started
          ? "等待就任"
          : state.scheduler.paused
            ? "暫停"
            : `${state.scheduler.speed}×`}
      </span>
      {dialog && (
        <Modal
          title={dialog === "menu" ? "村委會手札" : "幹事操作指南"}
          close={() => setDialog(null)}
        >
          {dialog === "menu" ? (
            <>
              <div className="dialog-title">
                <Icon name="save" />
                <div>
                  <h2>村委會手札</h2>
                  <p>發現新大陸 · 開拓島</p>
                </div>
              </div>
              <section className="menu-section">
                <h3>本機進度</h3>
                <p>{runtime.storageStatus}</p>
                <p>{runtime.status}</p>
              </section>
              <button className="menu-row" onClick={() => setDialog("help")}>
                <Icon name="help" />
                <span>操作指南</span>
                <span>›</span>
              </button>
              <button
                className="menu-row danger-row"
                aria-label="重新開始"
                disabled={!runtime.writable}
                onClick={() => {
                  setDialog(null);
                  setResetStage(1);
                }}
              >
                <Icon name="restart" />
                <span>重新開始</span>
                <span>›</span>
              </button>
              <p className="dialog-footnote">
                目前為規劃模式。探索模式與完整經濟將在後續里程碑實作。
              </p>
            </>
          ) : (
            <>
              <div className="dialog-title">
                <Icon name="map" />
                <div>
                  <h2>幹事操作指南</h2>
                  <p>慢慢規劃，讓聚落自然成長。</p>
                </div>
              </div>
              <ol className="guide-steps">
                <li>
                  <Icon name="hq" />
                  <div>
                    <strong>設立村委會</strong>
                    <p>先點選合法空地，免費放置 2×2 村委會大樓。</p>
                  </div>
                </li>
                <li>
                  <Icon name="farm" />
                  <div>
                    <strong>規劃第一塊農地</strong>
                    <p>
                      選「分區 → 農業」，拖曳至少 2×2
                      土地，邊界旁留出道路空間，查看費用後確認。
                    </p>
                  </div>
                </li>
                <li>
                  <Icon name="people" />
                  <div>
                    <strong>迎接第一批島民</strong>
                    <p>
                      農場會自動開工並生成農路，完工後提供工作與農舍。1× 約 1～3
                      分鐘能觀察到首批移民。
                    </p>
                  </div>
                </li>
                <li>
                  <Icon name="pan" />
                  <div>
                    <strong>移動與查看</strong>
                    <p>
                      左側十字切換平移，拖動／雙指縮放。放大鏡可查看分區；格線可自由開關。
                    </p>
                  </div>
                </li>
              </ol>
            </>
          )}
        </Modal>
      )}
      {resetStage > 0 && (
        <Modal title="重新開始確認" close={() => setResetStage(0)}>
          <div className="dialog-title">
            <Icon name="restart" />
            <div>
              <h2>
                {resetStage === 1
                  ? "重新開始這座島嶼？"
                  : "最後確認：清除所有進度？"}
              </h2>
            </div>
          </div>
          <p>目前只有一個本機存檔。這會清除目前的建設與島民，回到空白島嶼。</p>
          <div className="context-actions">
            <button className="soft-button" onClick={() => setResetStage(0)}>
              保留島嶼
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (resetStage === 1) setResetStage(2);
                else {
                  void runtime.restart();
                  setResetStage(0);
                  setBounds(null);
                  setSelected(undefined);
                  setTool("hq");
                  setTab("build");
                  setMessage("");
                }
              }}
            >
              {resetStage === 1 ? "繼續確認" : "清除並重新開始"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function Modal({
  title,
  close,
  children,
}: PropsWithChildren<{ title: string; close: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog-sheet"
      aria-label={title}
      onCancel={close}
    >
      <button
        className="icon-close dialog-close"
        aria-label="關閉視窗"
        onClick={close}
        autoFocus
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
class StartupBoundary extends Component<
  PropsWithChildren,
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error)
      return (
        <section className="panel" role="alert">
          <h1>遊戲無法啟動</h1>
          <p>請重新整理；若仍然失敗，請回報下方錯誤。</p>
          <p>{this.state.error}</p>
          <button onClick={() => location.reload()}>重新整理</button>
        </section>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <StartupBoundary>
    <App />
  </StartupBoundary>,
);
