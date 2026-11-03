import { config as defaultConfig } from "../data/config";
import {
  footprint,
  free,
  indices,
  initialTiles,
  MAP_VERSION,
  price,
  roadPlan,
  refundAmount,
} from "./world";
import type {
  Bounds,
  Command,
  Config,
  DomainEvent,
  GameState,
  Parcel,
  Result,
} from "./types";
export function createState(
  gameId: string,
  c: Config = defaultConfig,
): GameState {
  return {
    schemaVersion: 1,
    configVersion: c.version,
    mapVersion: MAP_VERSION,
    gameId,
    stateRevision: 0,
    tick: 0,
    seed: c.seed,
    prngState: c.seed,
    scheduler: {
      speed: 1,
      paused: true,
      lastWallClockTimestamp: 0,
      accumulatedMs: 0,
    },
    lastSettledMonthIndex: 0,
    nextParcelSequence: 1,
    nextBuildingSequence: 1,
    roadRevision: 0,
    started: false,
    tiles: initialTiles(),
    parcels: {},
    buildings: {},
    treasury: c.initialTreasury,
    ledger: [],
    commandIds: [],
  };
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(frozen);
  }
  return value;
}
export class Core {
  private state: GameState;
  private snapshot: GameState;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(events: readonly DomainEvent[]) => void>();
  private publishing = false;
  private pending: DomainEvent[] = [];
  constructor(
    state: GameState,
    readonly config: Config = defaultConfig,
  ) {
    this.state = structuredClone(state);
    this.snapshot = frozen(structuredClone(state));
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  onEvents = (fn: (events: readonly DomainEvent[]) => void) => {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  };
  private publish(events: DomainEvent[] = []) {
    const { tiles, ...rest } = this.state;
    const previous = this.snapshot.tiles;
    const projected = tiles.map((tile, i) => {
      const old = previous[i];
      return old &&
        old.road === tile.road &&
        old.parcelId === tile.parcelId &&
        old.buildingId === tile.buildingId
        ? old
        : { ...tile };
    });
    this.snapshot = frozen({ ...structuredClone(rest), tiles: projected });
    this.publishing = true;
    try {
      for (const fn of this.listeners) {
        try {
          fn();
        } catch {
          /* A subscriber cannot roll back the committed state. */
        }
      }
      const ordered = frozen(
        [...events].sort(
          (a, b) =>
            a.phase - b.phase ||
            a.subject.localeCompare(b.subject) ||
            a.type.localeCompare(b.type),
        ),
      );
      if (ordered.length)
        for (const fn of this.eventListeners) {
          try {
            fn(ordered);
          } catch {
            /* Delivery failure is isolated. */
          }
        }
    } finally {
      this.publishing = false;
    }
  }
  private attempt(state: GameState, cmd: Command): Result {
    if (cmd.type === "time") {
      if (!state.started) return { ok: false, code: "HQ_REQUIRED" };
      if (![1, 2, 4].includes(cmd.speed) || typeof cmd.paused !== "boolean")
        return { ok: false, code: "INVALID_SPEED" };
      state.scheduler.speed = cmd.speed;
      state.scheduler.paused = cmd.paused;
      return { ok: true };
    }
    if (cmd.type === "placeHQ") {
      if (state.started) return { ok: false, code: "HQ_EXISTS" };
      const tiles = indices(cmd.bounds);
      if (
        tiles.length !== 4 ||
        cmd.bounds.maxXExclusive - cmd.bounds.minX !== 2 ||
        !Number.isFinite(cmd.timestamp) ||
        cmd.timestamp < 0
      )
        return { ok: false, code: "INVALID_HQ" };
      if (!tiles.every((i) => free(state.tiles[i])))
        return { ok: false, code: "TILE_UNAVAILABLE" };
      state.buildings.hq = {
        id: "hq",
        definitionId: "hq",
        definitionVersion: state.configVersion,
        footprint: tiles,
        housingCapacity: 0,
        jobCapacity: 0,
        residents: 0,
        creationSequence: 0,
        active: true,
        startTick: 0,
        completionTick: 0,
      };
      tiles.forEach((i) => (state.tiles[i].buildingId = "hq"));
      state.started = true;
      state.startTimestamp = cmd.timestamp;
      state.scheduler = {
        speed: 1,
        paused: false,
        accumulatedMs: 0,
        lastWallClockTimestamp: cmd.timestamp,
      };
      return { ok: true };
    }
    if (!state.started) return { ok: false, code: "HQ_REQUIRED" };
    if (cmd.type === "zone") {
      if (!Object.hasOwn(this.config.definitions, cmd.zone))
        return { ok: false, code: "INVALID_ZONE" };
      const tiles = indices(cmd.bounds);
      if (!tiles.every((i) => free(state.tiles[i])))
        return { ok: false, code: "TILE_UNAVAILABLE" };
      const cost = price(state, cmd.bounds, cmd.zone, this.config);
      if (cost > state.treasury)
        return { ok: false, code: "INSUFFICIENT_FUNDS" };
      const sequence = state.nextParcelSequence++,
        id = `p${sequence}`;
      const p: Parcel = {
        id,
        bounds: { ...cmd.bounds },
        zone: cmd.zone,
        createdTick: state.tick,
        createdSequence: sequence,
        zoningPaidAmount: cost,
        lifecycle: "ZONED",
      };
      state.parcels[id] = p;
      tiles.forEach((i) => (state.tiles[i].parcelId = id));
      state.treasury -= cost;
      state.ledger.push({
        transactionId: cmd.id,
        tick: state.tick,
        type: "zoning",
        amount: -cost,
        parcelId: id,
      });
      const warning = !footprint(state, p, this.config)
        ? "NO_BUILDING_FOOTPRINT"
        : roadPlan(state, p) === undefined
          ? "NO_ROAD_ACCESS"
          : undefined;
      return { ok: true, cost, warning };
    }
    const p = state.parcels[cmd.parcelId];
    if (!p) return { ok: false, code: "PARCEL_NOT_FOUND" };
    if (p.lifecycle !== "ZONED")
      return { ok: false, code: "CONSTRUCTION_LOCKED" };
    if (cmd.type === "change" && p.zone === cmd.zone)
      return { ok: true, cost: 0 };
    const refund = refundAmount(p.zoningPaidAmount);
    if (cmd.type === "cancel") {
      indices(p.bounds).forEach((i) => delete state.tiles[i].parcelId);
      delete state.parcels[p.id];
      state.treasury += refund;
      state.ledger.push({
        transactionId: cmd.id,
        tick: state.tick,
        type: "refund",
        amount: refund,
        parcelId: p.id,
      });
      return { ok: true, cost: -refund };
    }
    if (!Object.hasOwn(this.config.definitions, cmd.zone))
      return { ok: false, code: "INVALID_ZONE" };
    const cost = price(state, p.bounds, cmd.zone, this.config);
    if (state.treasury + refund < cost)
      return { ok: false, code: "INSUFFICIENT_FUNDS" };
    state.treasury += refund - cost;
    p.zone = cmd.zone;
    p.zoningPaidAmount = cost;
    delete p.lastFailureCode;
    state.ledger.push(
      {
        transactionId: `${cmd.id}:refund`,
        tick: state.tick,
        type: "refund",
        amount: refund,
        parcelId: p.id,
      },
      {
        transactionId: cmd.id,
        tick: state.tick,
        type: "zoning",
        amount: -cost,
        parcelId: p.id,
      },
    );
    return {
      ok: true,
      cost: cost - refund,
      warning: !footprint(state, p, this.config)
        ? "NO_BUILDING_FOOTPRINT"
        : roadPlan(state, p) === undefined
          ? "NO_ROAD_ACCESS"
          : undefined,
    };
  }
  preview(cmd: Command): Result {
    try {
      return this.attempt(structuredClone(this.state), cmd);
    } catch {
      return { ok: false, code: "INVALID_BOUNDS" };
    }
  }
  command(cmd: Command): Result {
    if (this.publishing) return { ok: false, code: "REENTRANT_COMMAND" };
    if (!cmd.id) return { ok: false, code: "INVALID_COMMAND_ID" };
    if (this.state.commandIds.includes(cmd.id)) return { ok: true };
    const next = structuredClone(this.state);
    let result: Result;
    try {
      result = this.attempt(next, cmd);
    } catch {
      return { ok: false, code: "INVALID_BOUNDS" };
    }
    if (!result.ok) return result;
    if (
      cmd.type === "change" &&
      this.state.parcels[cmd.parcelId]?.zone === cmd.zone
    )
      return result;
    next.commandIds.push(cmd.id);
    next.stateRevision++;
    this.state = next;
    this.pending.push({
      tick: next.tick,
      phase: 0,
      subject: cmd.id,
      type: cmd.type,
    });
    this.publish();
    return result;
  }
  advanceOneTick(): boolean {
    if (this.publishing || !this.state.started || this.state.scheduler.paused)
      return false;
    const s = this.state,
      events = this.pending.splice(0);
    s.tick++;
    const t = s.tick;
    const emit = (
      phase: number,
      subject: string,
      type: string,
      amount?: number,
    ) => events.push({ tick: t, phase, subject, type, amount });
    const ordered = Object.values(s.buildings)
      .filter((b) => !b.active && b.completionTick <= t)
      .sort(
        (a, b) =>
          a.completionTick - b.completionTick ||
          a.creationSequence - b.creationSequence,
      );
    for (const b of ordered) {
      b.active = true;
      s.parcels[b.parcelId!].lifecycle = "DEVELOPED";
      emit(1, b.id, "completed");
    }
    let successes = 0;
    for (const p of Object.values(s.parcels)
      .filter((p) => p.lifecycle === "ZONED" && p.createdTick < t)
      .sort(
        (a, b) =>
          a.createdSequence - b.createdSequence || a.id.localeCompare(b.id),
      )) {
      if (successes >= this.config.startsPerTick) break;
      const fp = footprint(s, p, this.config),
        roads = fp ? roadPlan(s, p) : undefined;
      const failure = !fp
        ? "NO_BUILDING_FOOTPRINT"
        : roads === undefined
          ? "NO_ROAD_ACCESS"
          : undefined;
      if (failure) {
        if (p.lastFailureCode !== failure) emit(2, p.id, failure);
        p.lastFailureCode = failure;
        continue;
      }
      const d = this.config.definitions[p.zone],
        sequence = s.nextBuildingSequence++,
        id = `b${sequence}`;
      const completionTick = t + Math.max(1, d.duration);
      s.buildings[id] = {
        id,
        parcelId: p.id,
        definitionId: p.zone,
        definitionVersion: s.configVersion,
        footprint: fp!,
        housingCapacity: d.housing,
        jobCapacity: d.jobs,
        residents: 0,
        creationSequence: sequence,
        active: false,
        startTick: t,
        completionTick,
      };
      for (const i of roads!) s.tiles[i].road = true;
      if (roads!.length) s.roadRevision++;
      fp!.forEach((i) => (s.tiles[i].buildingId = id));
      p.buildingId = id;
      p.completionTick = completionTick;
      p.lifecycle = "CONSTRUCTING";
      delete p.lastFailureCode;
      successes++;
      emit(2, p.id, "started");
    }
    const active = Object.values(s.buildings)
      .filter((b) => b.active)
      .sort(
        (a, b) =>
          a.creationSequence - b.creationSequence || a.id.localeCompare(b.id),
      );
    const population = active.reduce((n, b) => n + b.residents, 0),
      housing = active.reduce((n, b) => n + b.housingCapacity, 0),
      jobs = active.reduce((n, b) => n + b.jobCapacity, 0);
    const incoming = Math.min(
      this.config.migrationLimit,
      Math.max(
        0,
        Math.min(housing, Math.floor(jobs * this.config.jobsRatio)) -
          population,
      ),
    );
    let remaining = incoming;
    const allocation = active.map((b) => {
      const count = Math.min(remaining, b.housingCapacity - b.residents);
      remaining -= count;
      return { b, count };
    });
    if (remaining !== 0) throw Error("MIGRATION_INVARIANT");
    for (const { b, count } of allocation)
      if (count) {
        b.residents += count;
        emit(3, b.id, "immigration", count);
      }
    if (t % 120 === 0 && Math.floor(t / 120) > s.lastSettledMonthIndex) {
      const income = this.config.monthlyIncome,
        expense = Math.min(s.treasury + income, this.config.monthlyExpense),
        net = income - expense;
      s.treasury += net;
      s.lastSettledMonthIndex = Math.floor(t / 120);
      s.ledger.push({
        transactionId: `month:${s.lastSettledMonthIndex}`,
        tick: t,
        type: "settlement",
        amount: net,
      });
      emit(4, `month:${s.lastSettledMonthIndex}`, "settled", net);
      if (expense < this.config.monthlyExpense)
        emit(
          4,
          "treasury",
          "unpaidExpense",
          this.config.monthlyExpense - expense,
        );
    }
    s.stateRevision++;
    this.publish(events);
    return true;
  }
  elapse(now: number, offline = false): number {
    if (this.publishing || !Number.isFinite(now) || now < 0) return 0;
    const s = this.state,
      sch = s.scheduler;
    const elapsed = Math.max(0, now - sch.lastWallClockTimestamp);
    sch.lastWallClockTimestamp = Math.max(now, sch.lastWallClockTimestamp);
    if (!s.started || sch.paused) {
      s.stateRevision++;
      this.publish();
      return 0;
    }
    const budget = offline ? Math.min(elapsed, 72 * 3600000) : elapsed;
    const total = sch.accumulatedMs + budget * (offline ? 1 : sch.speed);
    const ticks = Math.min(
      offline ? 4320 : Number.MAX_SAFE_INTEGER,
      Math.floor(total / 60000),
    );
    sch.accumulatedMs = total % 60000;
    for (let i = 0; i < ticks; i++) this.advanceOneTick();
    if (!ticks) {
      s.stateRevision++;
      this.publish();
    }
    return ticks;
  }
}
export function boundsBetween(a: number, b: number): Bounds {
  return {
    minX: Math.min(a % 64, b % 64),
    minY: Math.min(Math.floor(a / 64), Math.floor(b / 64)),
    maxXExclusive: Math.max(a % 64, b % 64) + 1,
    maxYExclusive: Math.max(Math.floor(a / 64), Math.floor(b / 64)) + 1,
  };
}
export function totals(s: GameState) {
  return Object.values(s.buildings)
    .filter((b) => b.active)
    .reduce(
      (r, b) => ({
        population: r.population + b.residents,
        housing: r.housing + b.housingCapacity,
        jobs: r.jobs + b.jobCapacity,
      }),
      { population: 0, housing: 0, jobs: 0 },
    );
}
