import { Core, createState } from "./simulation/core";
import {
  openDatabase,
  readCheckpoint,
  writeCheckpoint,
} from "./persistence/checkpoint";
import type { Command } from "./simulation/types";

export class Runtime {
  core: Core = new Core(createState(crypto.randomUUID()));
  status = "正在讀取本機島嶼…";
  lastSaved: { gameId: string; revision: number; tick: number } | null = null;
  private writer = false;
  private processing = false;
  private db?: IDBDatabase;
  private expectedRevision: number | null = null;
  private release?: () => void;
  private timer?: number;
  private saving: Promise<void> = Promise.resolve();
  private pumping?: Promise<void>;
  private pumpActive = false;
  private dead = false;
  private dirty = false;
  private lastClockCheckpointAt = 0;
  private listeners = new Set<() => void>();
  private detach?: () => void;

  get writable() {
    return this.writer && !this.processing && !this.dead;
  }
  get unsaved() {
    const s = this.core.getSnapshot();
    return this.lastSaved
      ? s.gameId !== this.lastSaved.gameId ||
          s.stateRevision !== this.lastSaved.revision
      : this.dirty;
  }
  get storageStatus() {
    const saved = this.lastSaved;
    if (!saved)
      return this.unsaved
        ? "目前進度尚未儲存；重新載入將無法保留。"
        : "尚無本機存檔。";
    return `${this.unsaved ? "畫面含未儲存進度；重新載入會回到上次存檔。" : "進度已儲存。"}最後成功存檔：Tick ${saved.tick}（版本 ${saved.revision}）${saved.gameId !== this.core.getSnapshot().gameId ? "，屬於上一座島嶼。" : "。"}`;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private notify = () => {
    this.listeners.forEach((fn) => fn());
  };
  private bind() {
    this.detach?.();
    this.detach = this.core.subscribe(() => {
      this.dirty = true;
      this.notify();
    });
  }
  private restored(
    state: NonNullable<Awaited<ReturnType<typeof readCheckpoint>>>,
  ) {
    this.expectedRevision = state.stateRevision;
    this.lastSaved = {
      gameId: state.gameId,
      revision: state.stateRevision,
      tick: state.tick,
    };
    this.lastClockCheckpointAt = Date.now();
    this.core = new Core(state);
    this.bind();
  }
  async start() {
    this.db = await openDatabase();
    const saved = await readCheckpoint(this.db);
    if (this.dead) return;
    if (saved) this.restored(saved);
    else this.bind();
    if (!navigator.locks) {
      this.status = "此瀏覽器不支援安全寫入鎖，目前為唯讀。";
      this.notify();
      return;
    }
    void navigator.locks
      .request("mongo-single-writer", { ifAvailable: true }, async (lock) => {
        if (this.dead) return;
        if (!lock) {
          this.status =
            "另一個分頁正在管理島嶼，此分頁為唯讀；關閉後重新整理以接手。";
          this.notify();
          return;
        }
        try {
          const latest = await readCheckpoint(this.db!);
          if (this.dead) return;
          if (latest) this.restored(latest);
          this.writer = true;
          await this.pump(Date.now(), true);
          if (this.dead || !this.writer) return;
          this.timer = window.setInterval(() => {
            if (!this.writable) return;
            void this.pump(Date.now(), false);
          }, 1000);
          await new Promise<void>((resolve) => {
            this.release = resolve;
            if (this.dead) resolve();
          });
        } catch (e) {
          if (!this.dead) this.fail(e);
        }
      })
      .catch((e) => {
        if (!this.dead) this.fail(e);
      });
  }
  private pump(now: number, offline: boolean): Promise<void> {
    if (this.pumpActive) return this.pumping ?? Promise.resolve();
    this.pumpActive = true;
    this.processing = true;
    this.pumping = (async () => {
      try {
        const ticks = await this.core.elapseBatched(now, offline, {
          yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
          cancelled: () => this.dead,
          onProgress: (done, total) => {
            if (total > 8) {
              this.status = `正在補算${offline ? "離線" : "背景"}進度 ${done} / ${total} 個遊戲日；完成前暫停操作。`;
              this.notify();
            }
          },
        });
        if (this.dead) return;
        this.processing = false;
        if (offline || ticks) {
          this.status = ticks
            ? `已補算${offline ? "離線" : "經過時間"} ${ticks} 個遊戲日。`
            : "島嶼已就緒，進度會自動儲存。";
          this.notify();
        }
        const s = this.core.getSnapshot();
        // Active clocks get a bounded heartbeat; paused/unstarted islands never write idle checkpoints.
        if (
          this.dirty ||
          (s.started &&
            !s.scheduler.paused &&
            now - this.lastClockCheckpointAt >= 15000)
        )
          await this.save();
      } catch (e) {
        if (!this.dead) this.fail(e);
      } finally {
        this.processing = false;
        this.pumpActive = false;
      }
    })();
    return this.pumping;
  }
  private fail(e: unknown) {
    this.writer = false;
    if (this.timer) clearInterval(this.timer);
    this.status = `${e instanceof Error ? e.message : "STORAGE_ERROR"}：已停止寫入與模擬；畫面可能含未儲存進度。`;
    this.notify();
  }
  command(command: Command) {
    if (!this.writable) return { ok: false as const, code: "READ_ONLY" };
    const now = Date.now(),
      s = this.core.getSnapshot();
    if (
      s.started &&
      !s.scheduler.paused &&
      now - s.scheduler.lastWallClockTimestamp >= 60000 / s.scheduler.speed
    ) {
      void this.pump(now, false);
      return { ok: false as const, code: "RUNTIME_BUSY" };
    }
    this.core.elapse(now);
    const result = this.core.command(command);
    void this.save();
    return result;
  }
  save(): Promise<void> {
    this.saving = this.saving
      .then(async () => {
        if (!this.writer || this.processing || !this.db) return;
        this.core.commitClock();
        if (!this.dirty) return;
        const state = this.core.getSnapshot();
        await writeCheckpoint(this.db, state, this.expectedRevision);
        this.expectedRevision = state.stateRevision;
        this.lastSaved = {
          gameId: state.gameId,
          revision: state.stateRevision,
          tick: state.tick,
        };
        this.lastClockCheckpointAt = Date.now();
        this.dirty =
          this.core.getSnapshot().stateRevision !== state.stateRevision;
        this.notify();
      })
      .catch((e) => this.fail(e));
    return this.saving;
  }
  async restart() {
    if (!this.writable) return;
    const next = createState(crypto.randomUUID());
    next.stateRevision = this.core.getSnapshot().stateRevision + 1;
    this.core = new Core(next);
    this.bind();
    this.dirty = true;
    this.notify();
    await this.save();
  }
  async stop() {
    this.dead = true;
    if (this.timer) clearInterval(this.timer);
    const interrupted = this.processing;
    await this.pumping;
    // Interrupted catch-up has future scheduler metadata; never persist its partial result.
    if (!interrupted) await this.save();
    this.writer = false;
    this.release?.();
    this.detach?.();
    this.db?.close();
  }
}
