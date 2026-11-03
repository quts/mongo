import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import * as persistence from "../src/persistence/checkpoint";
import { Runtime } from "../src/runtime";
import { Core, createState } from "../src/simulation/core";
const bounds = { minX: 25, minY: 25, maxXExclusive: 27, maxYExclusive: 27 };
async function ready(r: Runtime) {
  await r.start();
  for (let i = 0; !r.writable && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(r.writable).toBe(true);
  await r.save();
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(1000);
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("window", { setInterval, clearInterval });
  vi.stubGlobal("navigator", {
    locks: {
      request: (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<void>,
      ) => callback({}),
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("runtime checkpoint and recovery regressions", () => {
  it("unstarted and paused islands publish/write nothing during long idle periods", async () => {
    const write = vi.spyOn(persistence, "writeCheckpoint");
    const r = new Runtime();
    await ready(r);
    const unsub = vi.fn();
    r.core.subscribe(unsub);
    const empty = r.core.getSnapshot();
    await vi.advanceTimersByTimeAsync(300000);
    await r.save();
    expect(write).not.toHaveBeenCalled();
    expect(unsub).not.toHaveBeenCalled();
    expect(r.core.getSnapshot()).toBe(empty);
    r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await r.save();
    r.command({ id: "pause", type: "time", speed: 4, paused: true });
    await r.save();
    write.mockClear();
    unsub.mockClear();
    const paused = r.core.getSnapshot();
    await vi.advanceTimersByTimeAsync(300000);
    await r.save();
    expect(write).not.toHaveBeenCalled();
    expect(unsub).not.toHaveBeenCalled();
    expect(r.core.getSnapshot()).toBe(paused);
    await r.stop();
    expect(write).not.toHaveBeenCalled();
  });
  it("active sub-tick bookkeeping has a 15s heartbeat, not 1s writes; resume excludes paused wall time", async () => {
    const write = vi.spyOn(persistence, "writeCheckpoint"),
      r = new Runtime();
    await ready(r);
    r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await r.save();
    write.mockClear();
    await vi.advanceTimersByTimeAsync(14000);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await r.save();
    expect(write).toHaveBeenCalledTimes(1);
    expect(r.core.getSnapshot().scheduler.accumulatedMs).toBe(15000);
    r.command({ id: "pause", type: "time", speed: 1, paused: true });
    await r.save();
    await vi.advanceTimersByTimeAsync(300000);
    r.command({ id: "resume", type: "time", speed: 1, paused: false });
    await r.save();
    await vi.advanceTimersByTimeAsync(45000);
    await r.save();
    expect(r.core.getSnapshot().tick).toBe(1);
    await r.stop();
  });
  it("reports last durable revision and unsaved progress on quota failure; stops simulation", async () => {
    const r = new Runtime();
    await ready(r);
    r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await r.save();
    const durable = { ...r.lastSaved! };
    vi.spyOn(persistence, "writeCheckpoint").mockRejectedValue(
      Error("QuotaExceededError"),
    );
    r.command({
      id: "farm",
      type: "zone",
      zone: "agriculture",
      bounds: { minX: 30, minY: 30, maxXExclusive: 32, maxYExclusive: 32 },
    });
    await r.save();
    expect(r.lastSaved).toEqual(durable);
    expect(r.unsaved).toBe(true);
    expect(r.writable).toBe(false);
    expect(r.storageStatus).toContain("重新載入會回到上次存檔");
    expect(r.storageStatus).toContain(`版本 ${durable.revision}`);
    const failed = r.core.getSnapshot();
    await vi.advanceTimersByTimeAsync(300000);
    expect(r.core.getSnapshot()).toBe(failed);
    const db = await persistence.openDatabase();
    expect((await persistence.readCheckpoint(db))?.stateRevision).toBe(
      durable.revision,
    );
    db.close();
    await r.stop();
  });
  it("failed first save and failed restart distinguish absent/previous-island saves", async () => {
    const r = new Runtime();
    await ready(r);
    const spy = vi
      .spyOn(persistence, "writeCheckpoint")
      .mockRejectedValueOnce(Error("quota"));
    r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await r.save();
    expect(r.lastSaved).toBeNull();
    expect(r.storageStatus).toContain("重新載入將無法保留");
    await r.stop();
    spy.mockRestore();
    const next = new Runtime();
    await ready(next);
    next.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await next.save();
    vi.spyOn(persistence, "writeCheckpoint").mockRejectedValue(Error("quota"));
    await next.restart();
    expect(next.unsaved).toBe(true);
    expect(next.storageStatus).toContain("上一座島嶼");
    await next.stop();
  });
  it("stale CAS failure also exposes the unchanged last durable checkpoint", async () => {
    const r = new Runtime();
    await ready(r);
    r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    await r.save();
    const db = await persistence.openDatabase(),
      saved = (await persistence.readCheckpoint(db))!;
    const changed = structuredClone(saved);
    changed.stateRevision++;
    await persistence.writeCheckpoint(db, changed, saved.stateRevision);
    r.command({ id: "pause", type: "time", speed: 1, paused: true });
    await r.save();
    expect(r.status).toContain("CHECKPOINT_CONFLICT");
    expect(r.storageStatus).toContain("重新載入會讀取磁碟最新存檔");
    expect(r.unsaved).toBe(true);
    expect(r.lastSaved?.revision).toBe(saved.stateRevision);
    db.close();
    await r.stop();
  });
  it("cancels catch-up without persisting a partial result", async () => {
    const c = new Core(createState("offline"));
    c.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
    const db = await persistence.openDatabase();
    await persistence.writeCheckpoint(db, c.getSnapshot(), null);
    db.close();
    vi.setSystemTime(1000 + 4320 * 60000);
    const write = vi.spyOn(persistence, "writeCheckpoint"),
      r = new Runtime();
    let stopping: Promise<void> | undefined;
    r.subscribe(() => {
      if (r.core.getSnapshot().tick > 0 && !stopping) stopping = r.stop();
    });
    await r.start();
    await vi.waitUntil(() => !!stopping);
    await stopping;
    expect(write).not.toHaveBeenCalled();
    const check = await persistence.openDatabase();
    expect((await persistence.readCheckpoint(check))?.tick).toBe(0);
    check.close();
  });
});

it("a command after a suspended background clock schedules catch-up instead of synchronously applying it", async () => {
  const r = new Runtime();
  await ready(r);
  r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
  await r.save();
  vi.setSystemTime(Date.now() + 300000);
  const result = r.command({
    id: "farm",
    type: "zone",
    zone: "agriculture",
    bounds: { minX: 30, minY: 30, maxXExclusive: 32, maxYExclusive: 32 },
  });
  expect(result).toEqual({ ok: false, code: "RUNTIME_BUSY" });
  expect(Object.keys(r.core.getSnapshot().parcels)).toHaveLength(0);
  for (let i = 0; !r.writable && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(r.core.getSnapshot().tick).toBe(5);
  expect(r.writable).toBe(true);
  await r.stop();
});

it("does not overlap scheduler pumps while a slow heartbeat checkpoint is in flight", async () => {
  const r = new Runtime();
  await ready(r);
  r.command({ id: "hq", type: "placeHQ", bounds, timestamp: Date.now() });
  await r.save();
  const original = persistence.writeCheckpoint;
  let release: (() => void) | undefined;
  vi.spyOn(persistence, "writeCheckpoint").mockImplementationOnce(
    (db, state, revision) =>
      new Promise<void>((resolve, reject) => {
        release = () => {
          void original(db, state, revision).then(resolve, reject);
        };
      }),
  );
  await vi.advanceTimersByTimeAsync(15000);
  expect(release).toBeDefined();
  const pump = vi.spyOn(r.core, "elapseBatched");
  await vi.advanceTimersByTimeAsync(5000);
  expect(pump).not.toHaveBeenCalled();
  release!();
  await r.save();
  await vi.advanceTimersByTimeAsync(1000);
  expect(pump).toHaveBeenCalledTimes(1);
  await r.stop();
});
