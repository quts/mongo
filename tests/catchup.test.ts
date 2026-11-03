import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { it, expect } from "vitest";
import { Core, createState } from "../src/simulation/core";
import { roadPlan } from "../src/simulation/world";
import { validateCheckpoint } from "../src/persistence/checkpoint";
const end = 1000 + 4320 * 60000;
function setup() {
  const c = new Core(createState("catchup"));
  c.command({
    id: "hq",
    type: "placeHQ",
    bounds: { minX: 25, minY: 25, maxXExclusive: 27, maxYExclusive: 27 },
    timestamp: 1000,
  });
  return c;
}
it("idle bookkeeping keeps snapshot identity/revision; checkpoint preserves partial tick and pause semantics", () => {
  const c = setup(),
    before = c.getSnapshot();
  let notifications = 0;
  c.subscribe(() => notifications++);
  c.elapse(31000);
  expect(c.getSnapshot()).toBe(before);
  expect(notifications).toBe(0);
  c.commitClock();
  expect(notifications).toBe(1);
  expect(c.getSnapshot().scheduler.accumulatedMs).toBe(30000);
  const restored = new Core(validateCheckpoint(c.getSnapshot()));
  restored.elapse(61000, true);
  expect(restored.getSnapshot().tick).toBe(1);
  c.command({ id: "pause", type: "time", speed: 1, paused: true });
  const paused = c.getSnapshot();
  c.elapse(1000000000);
  c.commitClock();
  expect(c.getSnapshot()).toBe(paused);
  c.command({ id: "resume", type: "time", speed: 1, paused: false });
  c.elapse(1000030000);
  expect(c.getSnapshot().tick).toBe(1);
});
it("batched 4320-tick replay preserves every complete state hash and domain event; yields after at most 8 ticks", async () => {
  const sync = setup(),
    async = setup();
  for (const c of [sync, async])
    c.command({
      id: "farm",
      type: "zone",
      zone: "agriculture",
      bounds: { minX: 30, minY: 30, maxXExclusive: 32, maxYExclusive: 32 },
    });
  const a: string[] = [],
    b: string[] = [],
    ea: unknown[] = [],
    eb: unknown[] = [];
  const hash = (c: Core) =>
    createHash("sha256").update(JSON.stringify(c.getSnapshot())).digest("hex");
  sync.subscribe(() => a.push(hash(sync)));
  async.subscribe(() => b.push(hash(async)));
  sync.onEvents((e) => ea.push(e));
  async.onEvents((e) => eb.push(e));
  sync.elapse(end, true);
  let last = 0,
    yields = 0;
  const ticks = await async.elapseBatched(end, true, {
    yieldControl: async () => {
      const current = async.getSnapshot().tick;
      expect(current - last).toBeLessThanOrEqual(8);
      last = current;
      yields++;
      expect(
        async.command({
          id: "interleave",
          type: "time",
          speed: 4,
          paused: true,
        }).ok,
      ).toBe(false);
      expect(async.advanceOneTick()).toBe(false);
      expect(async.elapse(end)).toBe(0);
      const snapshot = async.getSnapshot();
      async.commitClock();
      expect(async.getSnapshot()).toBe(snapshot);
    },
  });
  expect(ticks).toBe(4320);
  expect(yields).toBe(539);
  expect(a).toEqual(b);
  expect(ea).toEqual(eb);
  expect(validateCheckpoint(async.getSnapshot())).toEqual(sync.getSnapshot());
}, 60000);
it("72h mixed-island catch-up lets real event-loop tasks run between batches and reports measured cost", async () => {
  const c = setup();
  // Mixed development plus repeated invalid small parcels exercises the retry path.
  for (let y = 16; y <= 40; y += 4)
    for (let x = 20; x <= 40; x += 4)
      c.command({
        id: `parcel-${x}-${y}`,
        type: "zone",
        zone: x % 8 === 0 ? "residential" : "agriculture",
        bounds: {
          minX: x,
          minY: y,
          maxXExclusive: x + (y % 8 === 0 ? 1 : 2),
          maxYExclusive: y + 2,
        },
      });
  let beats = 0,
    lastTick = 0,
    maxBatchTicks = 0,
    maxBatchMs = 0,
    lastYield = performance.now();
  const start = lastYield;
  await c.elapseBatched(end, true, {
    yieldControl: () => {
      const now = performance.now();
      maxBatchMs = Math.max(maxBatchMs, now - lastYield);
      maxBatchTicks = Math.max(maxBatchTicks, c.getSnapshot().tick - lastTick);
      lastTick = c.getSnapshot().tick;
      return new Promise((resolve) =>
        setTimeout(() => {
          beats++;
          lastYield = performance.now();
          resolve();
        }, 0),
      );
    },
  });
  expect(beats).toBe(539);
  expect(maxBatchTicks).toBeLessThanOrEqual(8);
  expect(c.getSnapshot().tick).toBe(4320);
  validateCheckpoint(c.getSnapshot());
  // A generous smoke budget catches severe regressions; real-device profiling is separate.
  expect(performance.now() - start).toBeLessThan(30000);
  console.info(
    JSON.stringify({
      benchmark: "72h-mixed-island",
      parcels: Object.keys(c.getSnapshot().parcels).length,
      buildings: Object.keys(c.getSnapshot().buildings).length,
      totalMs: Math.round(performance.now() - start),
      maxBatchMs: Math.round(maxBatchMs * 10) / 10,
      yields: beats,
    }),
  );
}, 60000);
it("bootstrap intentionally starts an independent segment when existing roads are unreachable", () => {
  const c = setup();
  c.command({
    id: "farm",
    type: "zone",
    zone: "agriculture",
    bounds: { minX: 30, minY: 30, maxXExclusive: 32, maxYExclusive: 32 },
  });
  const s = structuredClone(c.getSnapshot());
  // A synthetic sea channel splits otherwise valid test land into two islands.
  for (let y = 0; y < 64; y++) {
    s.tiles[y * 64 + 35].land = false;
    s.tiles[y * 64 + 35].terrain = "sea";
  }
  s.tiles[30 * 64 + 40].road = true;
  const before = JSON.stringify(s);
  expect(roadPlan(s, s.parcels.p1)).toEqual([29 * 64 + 30]);
  expect(JSON.stringify(s)).toBe(before);
});
