import { Core, createState } from "./simulation/core";
import {
  openDatabase,
  readCheckpoint,
  writeCheckpoint,
} from "./persistence/checkpoint";
import type { Command } from "./simulation/types";
export class Runtime {
  core: Core = new Core(createState(crypto.randomUUID()));
  writable = false;
  status = "正在讀取本機島嶼…";
  private db?: IDBDatabase;
  private expectedRevision: number | null = null;
  private release?: () => void;
  private timer?: number;
  private saving: Promise<void> = Promise.resolve();
  private dead = false;
  private dirty = false;
  private listeners = new Set<() => void>();
  private detach?: () => void;
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
  async start() {
    this.db = await openDatabase();
    const saved = await readCheckpoint(this.db);
    if (this.dead) return;
    if (saved) {
      this.expectedRevision = saved.stateRevision;
      this.core = new Core(saved);
    }
    this.bind();
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
        // Read again after acquiring the lease; the previous writer may have just saved.
        try {
          const latest = await readCheckpoint(this.db!);
          if (this.dead) return;
          if (latest) {
            this.expectedRevision = latest.stateRevision;
            this.core = new Core(latest);
            this.bind();
          }
          this.writable = true;
          const ticks = this.core.elapse(Date.now(), true);
          this.status = ticks
            ? `已補算離線 ${ticks} 個遊戲日。`
            : "島嶼已就緒，進度會自動儲存。";
          this.notify();
          await this.save();
          this.timer = window.setInterval(() => {
            if (!this.writable) return;
            this.core.elapse(Date.now());
            void this.save();
          }, 1000);
          await new Promise<void>((resolve) => {
            this.release = resolve;
            if (this.dead) resolve();
          });
        } catch (e) {
          this.fail(e);
        }
      })
      .catch((e) => this.fail(e));
  }
  private fail(e: unknown) {
    this.writable = false;
    this.status = `${e instanceof Error ? e.message : "STORAGE_ERROR"}：已停止寫入，原存檔保留。`;
    this.notify();
  }
  command(command: Command) {
    if (!this.writable) return { ok: false as const, code: "READ_ONLY" };
    this.core.elapse(Date.now());
    const result = this.core.command(command);
    void this.save();
    return result;
  }
  save(): Promise<void> {
    this.saving = this.saving
      .then(async () => {
        if (!this.writable || !this.db || !this.dirty) return;
        const state = this.core.getSnapshot();
        await writeCheckpoint(this.db, state, this.expectedRevision);
        this.expectedRevision = state.stateRevision;
        this.dirty =
          this.core.getSnapshot().stateRevision !== state.stateRevision;
      })
      .catch((e) => this.fail(e));
    return this.saving;
  }
  async restart() {
    if (!this.writable) return;
    this.core.elapse(Date.now());
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
    await this.save();
    this.writable = false;
    this.release?.();
    this.detach?.();
    this.db?.close();
  }
}
