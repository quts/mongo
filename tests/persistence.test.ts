import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { Core, createState } from "../src/simulation/core";
import {
  migrateCheckpoint,
  openDatabase,
  readCheckpoint,
  validateCheckpoint,
  writeCheckpoint,
} from "../src/persistence/checkpoint";
const state = () => createState("storage");
describe("IndexedDB checkpoint integrity", () => {
  it("round-trips one atomic checkpoint and prevents stale writer / duplicate initialization", async () => {
    const db = await openDatabase(`test-${crypto.randomUUID()}`),
      s = state();
    expect(await readCheckpoint(db)).toBeNull();
    await writeCheckpoint(db, s, null);
    expect(await readCheckpoint(db)).toEqual(s);
    const next = structuredClone(s);
    next.stateRevision++;
    const outcomes = await Promise.allSettled([
      writeCheckpoint(db, next, 0),
      writeCheckpoint(db, next, 0),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(writeCheckpoint(db, s, null)).rejects.toThrow(
      "CHECKPOINT_CONFLICT",
    );
    expect((await readCheckpoint(db))?.stateRevision).toBe(1);
    db.close();
  });
  it.each([
    "schema",
    "config",
    "map",
    "treasury",
    "overlap",
    "population",
    "clock",
    "ledger",
  ])("rejects corrupted %s without changing source", (kind) => {
    const c = new Core(state());
    c.command({
      id: "hq",
      type: "placeHQ",
      bounds: { minX: 25, minY: 25, maxXExclusive: 27, maxYExclusive: 27 },
      timestamp: 1,
    });
    const s = structuredClone(c.getSnapshot());
    if (kind === "schema") Object.assign(s, { schemaVersion: 99 });
    if (kind === "config") s.configVersion = "unknown";
    if (kind === "map") s.tiles[0].land = true;
    if (kind === "treasury") s.treasury = -1;
    if (kind === "overlap") s.tiles[0].buildingId = "hq";
    if (kind === "population") s.buildings.hq.residents = 2;
    if (kind === "clock") s.scheduler.accumulatedMs = 60000;
    if (kind === "ledger") s.treasury++;
    const before = JSON.stringify(s);
    expect(() => migrateCheckpoint(s)).toThrow("INVALID_CHECKPOINT");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("preserves corrupt save instead of replacing it", async () => {
    const db = await openDatabase(`test-${crypto.randomUUID()}`);
    await new Promise<void>((resolve) => {
      const tx = db.transaction("checkpoint", "readwrite");
      tx.objectStore("checkpoint").put({ schemaVersion: 999 }, "single");
      tx.oncomplete = () => resolve();
    });
    await expect(readCheckpoint(db)).rejects.toThrow("INVALID_CHECKPOINT");
    await expect(writeCheckpoint(db, state(), null)).rejects.toThrow(
      "CHECKPOINT_CONFLICT",
    );
    db.close();
  });
  it("round-trip retains accumulated fraction, paused flag, original paid basis and deterministic IDs", () => {
    const c = new Core(state());
    c.command({
      id: "hq",
      type: "placeHQ",
      bounds: { minX: 25, minY: 25, maxXExclusive: 27, maxYExclusive: 27 },
      timestamp: 1,
    });
    c.command({
      id: "farm",
      type: "zone",
      zone: "agriculture",
      bounds: { minX: 30, minY: 30, maxXExclusive: 32, maxYExclusive: 32 },
    });
    c.elapse(30001);
    c.command({ id: "pause", type: "time", speed: 4, paused: true });
    const restored = new Core(
      validateCheckpoint(JSON.parse(JSON.stringify(c.getSnapshot()))),
    );
    expect(restored.getSnapshot()).toEqual(c.getSnapshot());
    expect(restored.elapse(1e9, true)).toBe(0);
    expect(restored.getSnapshot().parcels.p1.zoningPaidAmount).toBe(40);
  });
});
