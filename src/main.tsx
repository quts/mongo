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
        (b) => {
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
    if (state.started && tool === "hq") setTool("agriculture");
  }, [state.started, tool]);
  useEffect(() => {
    scene.current?.project(state);
  }, [state]);
  useEffect(() => {
    scene.current?.setTool(tool);
  }, [tool]);
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
      if (command.type === "placeHQ") setTool("agriculture");
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
  return (
    <main>
      <div ref={host} className="world" />
      <header>
        <div>
          <span className="eyebrow">MONGO / 開拓試作</span>
          <h1>發現新大陸</h1>
        </div>
        <div className="stats">
          <span>
            公共財政
            <strong data-testid="treasury">
              {state.treasury.toLocaleString()}
            </strong>
          </span>
          <span>
            島民
            <strong data-testid="population">
              {stats.population} <small>/ {stats.housing}</small>
            </strong>
          </span>
          <span>
            工作<strong>{stats.jobs}</strong>
          </span>
        </div>
      </header>
      <aside className="panel">
        <span className="eyebrow">村委會 · 規劃桌</span>
        <h2>{!state.started ? "幹事，歡迎登島。" : "讓聚落慢慢成長。"}</h2>
        <p>
          {!state.started
            ? "先選擇一處空地，免費放置 2×2 村委會大樓。完成前，時間不會推進。"
            : "框選一塊矩形農地，開工時會自動接入農路。農場完工後，就有工作與農舍迎接島民。"}
        </p>
        <div className="tools">
          {(!state.started
            ? ["hq", "pan"]
            : ["agriculture", "residential", "select", "pan"]
          ).map((t) => (
            <button
              key={t}
              disabled={!runtime.writable && t !== "pan"}
              aria-pressed={tool === t}
              onClick={() => switchTool(t as Tool)}
            >
              {t === "hq"
                ? "村委會大樓"
                : t === "select"
                  ? "檢視分區"
                  : t === "pan"
                    ? "平移 / 縮放"
                    : names[t as Zone]}
            </button>
          ))}
        </div>
        <p className="hint">
          框選模式：拖曳滑鼠或手指選地。平移模式：拖動地圖、雙指縮放。滾輪隨時縮放。
        </p>
        {bounds && preview && (
          <section className="selection">
            <h3>選址預覽</h3>
            <p>
              {bounds.maxXExclusive - bounds.minX} ×{" "}
              {bounds.maxYExclusive - bounds.minY} 格 ·{" "}
              {preview.ok
                ? `費用 ${preview.cost ?? 0}`
                : (errors[preview.code] ?? preview.code)}
            </p>
            {preview.ok && preview.warning && (
              <p role="status">{errors[preview.warning]}</p>
            )}
            <div className="actions">
              <button
                disabled={!runtime.writable || !preview.ok}
                onClick={() => candidate && act({ ...candidate, id: id() })}
              >
                確認{tool === "hq" ? "放置" : "分區"}
              </button>
              <button onClick={() => setBounds(null)}>取消選取</button>
            </div>
          </section>
        )}
        {parcel && (
          <section className="selection">
            <h3>
              {names[parcel.zone]}分區 · {parcel.id}
            </h3>
            <p>
              {parcel.lifecycle === "ZONED"
                ? "等待開發"
                : parcel.lifecycle === "CONSTRUCTING"
                  ? `施工中 · 第 ${parcel.completionTick} 日完工`
                  : "已完工"}
            </p>
            <p>
              原實付 {parcel.zoningPaidAmount} · 可退{" "}
              {refundAmount(parcel.zoningPaidAmount)}
            </p>
            {parcel.lastFailureCode && (
              <p>{errors[parcel.lastFailureCode] ?? parcel.lastFailureCode}</p>
            )}
            {parcel.lifecycle === "ZONED" ? (
              <>
                <div className="actions">
                  {(["agriculture", "residential"] as Zone[]).map((zone) => {
                    const quote = runtime.core.preview({
                      id: "preview-change",
                      type: "change",
                      parcelId: parcel.id,
                      zone,
                    });
                    return (
                      <button
                        key={zone}
                        disabled={!runtime.writable || !quote.ok}
                        onClick={() => modify(zone)}
                      >
                        {names[zone]} {quote.ok ? `(${quote.cost ?? 0})` : ""}
                      </button>
                    );
                  })}
                </div>
                <button disabled={!runtime.writable} onClick={() => modify()}>
                  取消分區 · 退回 80%
                </button>
              </>
            ) : (
              <p>已開工，不能取消或改分區。</p>
            )}
          </section>
        )}
        <div className="notice" role="status">
          {runtime.status}
          <p data-testid="storage-status">{runtime.storageStatus}</p>
          {message && <p>{message}</p>}
        </div>
      </aside>
      <div className="zoom">
        <button aria-label="放大地圖" onClick={() => scene.current?.zoom(1.25)}>
          ＋
        </button>
        <button aria-label="縮小地圖" onClick={() => scene.current?.zoom(0.8)}>
          －
        </button>
      </div>
      <footer>
        <div>
          <span className="eyebrow">島嶼時間</span>
          <strong>
            第 {Math.floor(state.tick / 1440) + 1} 年 ·{" "}
            {Math.floor((state.tick % 1440) / 120) + 1} 月 ·{" "}
            {(state.tick % 120) + 1} 日
          </strong>
          <small data-testid="tick">
            Tick {state.tick} ·{" "}
            {!state.started
              ? "等待就任"
              : state.scheduler.paused
                ? "暫停"
                : `${state.scheduler.speed}×`}
          </small>
        </div>
        <div className="actions">
          <button
            disabled={!runtime.writable || !state.started}
            aria-pressed={state.scheduler.paused}
            onClick={() =>
              act({
                id: id(),
                type: "time",
                speed: state.scheduler.speed,
                paused: !state.scheduler.paused,
              })
            }
          >
            {state.scheduler.paused ? "繼續" : "暫停"}
          </button>
          {([1, 2, 4] as const).map((speed) => (
            <button
              key={speed}
              disabled={!runtime.writable || !state.started}
              aria-pressed={
                !state.scheduler.paused && state.scheduler.speed === speed
              }
              onClick={() =>
                act({ id: id(), type: "time", speed, paused: false })
              }
            >
              {speed}×
            </button>
          ))}
        </div>
        <button
          disabled={!runtime.writable}
          className="reset"
          onClick={() => setResetStage(1)}
        >
          重新開始
        </button>
      </footer>
      {resetStage > 0 && (
        <div className="scrim">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="重新開始確認"
            className="panel"
          >
            <h2>
              {resetStage === 1
                ? "重新開始這座島嶼？"
                : "最後確認：清除所有進度？"}
            </h2>
            <p>
              目前只有一個本機存檔。這會清除目前的建設與島民，回到空白島嶼。
            </p>
            <div className="actions">
              <button onClick={() => setResetStage(0)}>保留島嶼</button>
              <button
                onClick={() => {
                  if (resetStage === 1) setResetStage(2);
                  else {
                    void runtime.restart();
                    setResetStage(0);
                    setBounds(null);
                    setSelected(undefined);
                    setTool("hq");
                    setMessage("");
                  }
                }}
              >
                {resetStage === 1 ? "繼續確認" : "清除並重新開始"}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="badge">
        測試島嶼 / Experimental v1 · 首個 Vertical Slice
      </div>
    </main>
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
