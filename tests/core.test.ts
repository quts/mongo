import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { Core, createState, totals } from "../src/simulation/core";
import { config } from "../src/data/config";
import { indices, neighbors, price, roadPlan } from "../src/simulation/world";
import { validateCheckpoint } from "../src/persistence/checkpoint";
import type {
  Bounds,
  Command,
  Config,
  GameState,
} from "../src/simulation/types";
const rect = (x = 30, y = 30, w = 2, h = 2): Bounds => ({
  minX: x,
  minY: y,
  maxXExclusive: x + w,
  maxYExclusive: y + h,
});
function setup(c: Config = config) {
  const core = new Core(createState("test", c), c);
  core.command({
    id: "hq",
    type: "placeHQ",
    bounds: rect(25, 25),
    timestamp: 1000,
  });
  return core;
}
function zone(
  core: Core,
  bounds = rect(),
  zone: "agriculture" | "residential" | "commercial" = "agriculture",
  id = "zone",
) {
  return core.command({ id, type: "zone", bounds, zone });
}
const tick = (core: Core, n = 1) => {
  for (let i = 0; i < n; i++) core.advanceOneTick();
};
describe("P0 commands and geometry", () => {
  it("starts empty and never advances before HQ; rejected HQ has no side effects", () => {
    const c = new Core(createState("t")),
      before = c.getSnapshot();
    expect(c.advanceOneTick()).toBe(false);
    expect(
      c.command({
        id: "bad",
        type: "placeHQ",
        bounds: rect(0, 0),
        timestamp: 0,
      }).ok,
    ).toBe(false);
    expect(c.getSnapshot()).toBe(before);
    expect(Object.keys(before.buildings)).toHaveLength(0);
  });
  it("accepts free HQ only once and starts at tick zero", () => {
    const c = setup();
    expect(c.getSnapshot().tick).toBe(0);
    expect(c.getSnapshot().treasury).toBe(10000);
    expect(c.getSnapshot().scheduler.paused).toBe(false);
    expect(
      c.command({
        id: "another",
        type: "placeHQ",
        bounds: rect(),
        timestamp: 1000,
      }).ok,
    ).toBe(false);
  });
  it.each([
    rect(-1),
    rect(63),
    rect(30, 30, 0),
    rect(0, 0),
    rect(25, 25),
    rect(30.5),
  ])("rejects invalid rectangle atomically %j", (b) => {
    const c = setup(),
      before = c.getSnapshot();
    expect(zone(c, b).ok).toBe(false);
    expect(c.getSnapshot()).toBe(before);
  });
  it("keeps one complete rectangular parcel and rejects overlap", () => {
    const c = setup();
    expect(zone(c, rect(30, 30, 3, 4)).ok).toBe(true);
    expect(indices(c.getSnapshot().parcels.p1.bounds)).toHaveLength(12);
    const before = c.getSnapshot();
    expect(zone(c, rect(31, 31), "residential", "overlap").ok).toBe(false);
    expect(c.getSnapshot()).toBe(before);
  });
  it("uses exact tile pricing and persisted 80% refund; no repeated charges", () => {
    const c = setup();
    zone(c, rect(30, 30, 1, 1));
    expect(c.getSnapshot().treasury).toBe(9990);
    zone(c, rect(30, 30, 1, 1));
    expect(c.getSnapshot().treasury).toBe(9990);
    expect(
      c.command({
        id: "change",
        type: "change",
        parcelId: "p1",
        zone: "residential",
      }),
    ).toMatchObject({ ok: true, cost: 7 });
    expect(c.getSnapshot().parcels.p1.zoningPaidAmount).toBe(15);
    const before = c.getSnapshot();
    expect(
      c.command({
        id: "noop",
        type: "change",
        parcelId: "p1",
        zone: "residential",
      }),
    ).toMatchObject({ ok: true, cost: 0 });
    expect(c.getSnapshot()).toBe(before);
    c.command({ id: "cancel", type: "cancel", parcelId: "p1" });
    expect(c.getSnapshot().treasury).toBe(9995);
    expect(c.getSnapshot().ledger.map((e) => e.amount)).toEqual([
      -10, 8, -15, 12,
    ]);
  });
  it("supports net refunds and refuses unaffordable zoning / changes with no IDs consumed", () => {
    const c = setup();
    zone(c, rect(), "commercial");
    expect(
      c.command({
        id: "down",
        type: "change",
        parcelId: "p1",
        zone: "agriculture",
      }),
    ).toMatchObject({ ok: true, cost: -24 });
    const low = structuredClone(c.getSnapshot());
    low.treasury = 0;
    const poor = new Core(low);
    const before = poor.getSnapshot();
    expect(zone(poor, rect(35, 35), "residential", "poor").ok).toBe(false);
    expect(
      poor.command({
        id: "poorchange",
        type: "change",
        parcelId: "p1",
        zone: "commercial",
      }).ok,
    ).toBe(false);
    expect(poor.getSnapshot()).toBe(before);
  });
  it("prices coastal zones with floor at each multiplication", () => {
    const c = setup(),
      s = c.getSnapshot(),
      i = s.tiles.findIndex((t) => t.land && t.coastDistance <= 2);
    const b = rect(i % 64, Math.floor(i / 64), 1, 1);
    expect(price(s, b, "agriculture", config)).toBe(8);
    expect(price(s, b, "residential", config)).toBe(19);
    expect(price(s, b, "commercial", config)).toBe(22);
  });
  it("matches committed coast distances to 4-neighbor shortest distances", () => {
    const s = createState("map"),
      dist = s.tiles.map((t, i) =>
        !t.land
          ? 0
          : i % 64 === 0 || i % 64 === 63 || i < 64 || i >= 4032
            ? 1
            : Infinity,
      ),
      q = dist.flatMap((d, i) => (Number.isFinite(d) ? [i] : []));
    for (let h = 0; h < q.length; h++)
      for (const n of neighbors(q[h]))
        if (dist[n] > dist[q[h]] + 1) {
          dist[n] = dist[q[h]] + 1;
          q.push(n);
        }
    expect(s.tiles.map((t) => t.coastDistance)).toEqual(dist);
  });
});
describe("development, roads, construction and migration", () => {
  it("golden farm: road and construction at T1; ACTIVE and 3 residents at T2; 4 at T3", () => {
    const c = setup();
    zone(c);
    expect(c.getSnapshot().tiles.some((t) => t.road)).toBe(false);
    tick(c);
    expect(c.getSnapshot().parcels.p1.lifecycle).toBe("CONSTRUCTING");
    expect(c.getSnapshot().roadRevision).toBe(1);
    expect(totals(c.getSnapshot())).toEqual({
      population: 0,
      housing: 0,
      jobs: 0,
    });
    tick(c);
    expect(totals(c.getSnapshot())).toEqual({
      population: 3,
      housing: 4,
      jobs: 5,
    });
    expect(c.getSnapshot().parcels.p1.lifecycle).toBe("DEVELOPED");
    tick(c);
    expect(totals(c.getSnapshot()).population).toBe(4);
    expect(validateCheckpoint(c.getSnapshot())).toEqual(c.getSnapshot());
  });
  it("locks construction against cancel / rezone", () => {
    const c = setup();
    zone(c);
    tick(c);
    const before = c.getSnapshot();
    expect(c.command({ id: "cancel", type: "cancel", parcelId: "p1" }).ok).toBe(
      false,
    );
    expect(
      c.command({
        id: "change",
        type: "change",
        parcelId: "p1",
        zone: "residential",
      }).ok,
    ).toBe(false);
    expect(c.getSnapshot()).toBe(before);
  });
  it("failed small parcel remains ZONED, consumes no success slot or building ID", () => {
    const c = setup();
    expect(zone(c, rect(30, 30, 1, 1))).toMatchObject({
      ok: true,
      warning: "NO_BUILDING_FOOTPRINT",
    });
    zone(c, rect(35, 35), "agriculture", "second");
    tick(c);
    expect(c.getSnapshot().parcels.p1.lastFailureCode).toBe(
      "NO_BUILDING_FOOTPRINT",
    );
    expect(c.getSnapshot().parcels.p2.lifecycle).toBe("CONSTRUCTING");
    expect(c.getSnapshot().buildings.b1.parcelId).toBe("p2");
  });
  it("blocks roads surrounded by other parcels and leaves no partial construction", () => {
    const c = setup();
    zone(c);
    zone(c, rect(29, 29, 4, 1), "residential", "top");
    zone(c, rect(29, 32, 4, 1), "residential", "bottom");
    zone(c, rect(29, 30, 1, 2), "residential", "left");
    zone(c, rect(32, 30, 1, 2), "residential", "right");
    const money = c.getSnapshot().treasury;
    tick(c);
    expect(c.getSnapshot().parcels.p1).toMatchObject({
      lifecycle: "ZONED",
      lastFailureCode: "NO_ROAD_ACCESS",
    });
    expect(Object.keys(c.getSnapshot().buildings)).toEqual(["hq"]);
    expect(c.getSnapshot().tiles.some((t) => t.road)).toBe(false);
    expect(c.getSnapshot().treasury).toBe(money);
  });
  it("successful starts are throttled, do not charge treasury, and never overlap roads", () => {
    const c = setup();
    for (let j = 0; j < 3; j++)
      zone(c, rect(30 + j * 4, 30), "agriculture", `p${j}`);
    const money = c.getSnapshot().treasury;
    tick(c);
    expect(
      Object.values(c.getSnapshot().parcels).filter(
        (p) => p.lifecycle === "CONSTRUCTING",
      ),
    ).toHaveLength(2);
    expect(c.getSnapshot().treasury).toBe(money);
    for (const t of c.getSnapshot().tiles)
      if (t.road) {
        expect(t.parcelId).toBeUndefined();
        expect(t.buildingId).toBeUndefined();
      }
    tick(c);
    expect(
      Object.values(c.getSnapshot().parcels).every(
        (p) => p.lifecycle !== "ZONED",
      ),
    ).toBe(true);
  });
  it("road planner prefers shortest existing connection with lexicographic tie break", () => {
    const c = setup();
    zone(c);
    const s = structuredClone(c.getSnapshot());
    s.tiles[27 * 64 + 30].road = true;
    s.tiles[27 * 64 + 31].road = true;
    expect(roadPlan(s, s.parcels.p1)).toEqual([29 * 64 + 30, 28 * 64 + 30]);
    s.tiles[29 * 64 + 31].road = true;
    expect(roadPlan(s, s.parcels.p1)).toEqual([]);
  });
  it("retries blocked parcel after cancellation opens road access", () => {
    const c = setup();
    zone(c);
    zone(c, rect(29, 29, 4, 1), "residential", "top");
    zone(c, rect(29, 32, 4, 1), "residential", "bottom");
    zone(c, rect(29, 30, 1, 2), "residential", "left");
    zone(c, rect(32, 30, 1, 2), "residential", "right");
    tick(c);
    c.command({ id: "open", type: "cancel", parcelId: "p2" });
    tick(c);
    expect(c.getSnapshot().parcels.p1.lifecycle).toBe("CONSTRUCTING");
  });
  it("house alone cannot attract residents; jobs, capacity and oldest-first constrain allocation", () => {
    const c = setup();
    zone(c, rect(), "residential");
    tick(c, 3);
    expect(totals(c.getSnapshot()).population).toBe(0);
    zone(c, rect(35, 35), "agriculture", "farm");
    tick(c, 2);
    expect(c.getSnapshot().buildings.b1.residents).toBe(3);
    tick(c, 5);
    expect(c.getSnapshot().buildings.b1.residents).toBe(8);
    expect(c.getSnapshot().buildings.b2.residents).toBe(2);
    expect(totals(c.getSnapshot()).population).toBe(10);
  });
  it("persists two-tick commercial construction and does not activate early", () => {
    const c = setup();
    zone(c, rect(), "commercial");
    tick(c);
    expect(c.getSnapshot().buildings.b1.completionTick).toBe(3);
    tick(c);
    expect(totals(c.getSnapshot()).jobs).toBe(0);
    tick(c);
    expect(totals(c.getSnapshot()).jobs).toBe(8);
  });
});
describe("scheduler, replay and publication", () => {
  it.each([1, 2, 4] as const)(
    "golden wall clock bounds at %sx including phase extremes",
    (speed) => {
      for (const phase of [0, 1, 15000, 59999]) {
        const c = setup();
        c.elapse(1000 + phase);
        c.command({ id: "speed", type: "time", speed, paused: false });
        zone(c);
        const began = 1000 + phase;
        let now = began;
        while (!totals(c.getSnapshot()).population) {
          now += 1000;
          c.elapse(now);
        }
        const duration = (now - began) * speed;
        expect(duration).toBeGreaterThanOrEqual(60000);
        expect(duration).toBeLessThanOrEqual(180000);
      }
    },
  );
  it("background honors selected speed, fresh runtime catch-up is fixed 1x", () => {
    const c = setup();
    c.command({ id: "4x", type: "time", speed: 4, paused: false });
    const saved = c.getSnapshot();
    c.elapse(61000);
    expect(c.getSnapshot().tick).toBe(4);
    const offline = new Core(saved);
    offline.elapse(61000, true);
    expect(offline.getSnapshot().tick).toBe(1);
  });
  it("pause and HQ gate offline; 72h catch-up caps at 4320 ticks", () => {
    const c = setup();
    c.command({ id: "pause", type: "time", speed: 4, paused: true });
    expect(c.elapse(1000 + 100 * 3600000, true)).toBe(0);
    const empty = new Core(createState("empty"));
    expect(empty.elapse(1e10, true)).toBe(0);
    const live = setup();
    expect(live.elapse(1000 + 100 * 3600000, true)).toBe(4320);
    expect(live.getSnapshot().tick).toBe(4320);
  });
  it("4320-tick online/offline replay has identical per-tick hashes, state and events", () => {
    const online = setup(),
      offline = setup();
    zone(online);
    zone(offline);
    const a: string[] = [],
      b: string[] = [],
      eventsA: unknown[] = [],
      eventsB: unknown[] = [];
    const hash = (s: GameState) =>
      createHash("sha256").update(JSON.stringify(s)).digest("hex");
    online.subscribe(() => a.push(hash(online.getSnapshot())));
    offline.subscribe(() => b.push(hash(offline.getSnapshot())));
    online.onEvents((e) => eventsA.push(e));
    offline.onEvents((e) => eventsB.push(e));
    online.elapse(1000 + 4320 * 60000);
    offline.elapse(1000 + 4320 * 60000, true);
    expect(a).toEqual(b);
    expect(eventsA).toEqual(eventsB);
    expect(online.getSnapshot()).toEqual(offline.getSnapshot());
  }, 60000);
  it("settles exactly once at 120; reload at boundary cannot duplicate a month", () => {
    const c = setup();
    tick(c, 119);
    expect(c.getSnapshot().ledger).toHaveLength(0);
    tick(c);
    expect(c.getSnapshot().ledger).toHaveLength(1);
    const restored = new Core(validateCheckpoint(c.getSnapshot()));
    tick(restored);
    expect(restored.getSnapshot().ledger).toHaveLength(1);
  });
  it("shortage floors treasury at zero, records unpaid expense without debt", () => {
    const custom = { ...config, monthlyExpense: 11000 },
      c = setup(custom),
      events: unknown[] = [];
    c.onEvents((e) => events.push(...e));
    tick(c, 120);
    expect(c.getSnapshot().treasury).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "unpaidExpense", amount: 1000 }),
    );
  });
  it("publishes one complete immutable snapshot per tick and isolates failed subscribers", () => {
    const c = setup();
    zone(c);
    const snapshots: GameState[] = [];
    c.subscribe(() => {
      snapshots.push(c.getSnapshot());
      expect(
        c.command({ id: "reenter", type: "cancel", parcelId: "p1" }),
      ).toEqual({ ok: false, code: "REENTRANT_COMMAND" });
    });
    c.subscribe(() => {
      throw Error("subscriber");
    });
    tick(c, 2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].buildings.b1.active).toBe(true);
    expect(snapshots[1].buildings.b1.residents).toBe(3);
    expect(() => {
      snapshots[1].treasury = 1;
    }).toThrow();
  });
  it("rejects failed commands without changing PRNG, IDs, ledger or events", () => {
    const c = setup();
    tick(c);
    const events: unknown[] = [];
    c.onEvents((e) => events.push(...e));
    const before = c.getSnapshot();
    const invalid: Command = {
      id: "bad",
      type: "zone",
      bounds: rect(0, 0),
      zone: "agriculture",
    };
    expect(c.command(invalid).ok).toBe(false);
    expect(c.getSnapshot()).toBe(before);
    tick(c);
    expect(events).toHaveLength(0);
  });
});
