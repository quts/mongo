import { config } from "../data/config";
import { indices, initialTiles, MAP_VERSION } from "../simulation/world";
import type { GameState } from "../simulation/types";
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function validateCheckpoint(value: unknown): GameState {
  try {
    if (!value || typeof value !== "object") throw Error();
    const s = value as GameState,
      base = initialTiles();
    if (
      s.schemaVersion !== 1 ||
      s.configVersion !== config.version ||
      s.mapVersion !== MAP_VERSION ||
      typeof s.gameId !== "string" ||
      !s.gameId
    )
      throw Error();
    for (const v of [
      s.stateRevision,
      s.tick,
      s.seed,
      s.prngState,
      s.nextParcelSequence,
      s.nextBuildingSequence,
      s.roadRevision,
      s.treasury,
      s.lastSettledMonthIndex,
    ])
      if (!integer(v)) throw Error();
    if (
      s.nextParcelSequence < 1 ||
      s.nextBuildingSequence < 1 ||
      s.lastSettledMonthIndex !== Math.floor(s.tick / 120) ||
      typeof s.started !== "boolean"
    )
      throw Error();
    if (
      ![1, 2, 4].includes(s.scheduler.speed) ||
      typeof s.scheduler.paused !== "boolean" ||
      !Number.isFinite(s.scheduler.lastWallClockTimestamp) ||
      s.scheduler.lastWallClockTimestamp < 0 ||
      !Number.isFinite(s.scheduler.accumulatedMs) ||
      s.scheduler.accumulatedMs < 0 ||
      s.scheduler.accumulatedMs >= 60000
    )
      throw Error();
    if (
      !Array.isArray(s.tiles) ||
      s.tiles.length !== 4096 ||
      !s.parcels ||
      !s.buildings ||
      !Array.isArray(s.ledger) ||
      !Array.isArray(s.commandIds) ||
      new Set(s.commandIds).size !== s.commandIds.length ||
      s.commandIds.some((id) => typeof id !== "string" || !id)
    )
      throw Error();
    const parcelTiles = new Map<number, string>(),
      buildingTiles = new Map<number, string>();
    for (const [id, p] of Object.entries(s.parcels)) {
      if (
        p.id !== id ||
        id !== `p${p.createdSequence}` ||
        !integer(p.createdSequence) ||
        p.createdSequence < 1 ||
        p.createdSequence >= s.nextParcelSequence ||
        !integer(p.createdTick) ||
        p.createdTick > s.tick ||
        !integer(p.zoningPaidAmount) ||
        !Object.hasOwn(config.definitions, p.zone) ||
        !["ZONED", "CONSTRUCTING", "DEVELOPED"].includes(p.lifecycle)
      )
        throw Error();
      for (const i of indices(p.bounds)) {
        if (parcelTiles.has(i) || !s.tiles[i].land) throw Error();
        parcelTiles.set(i, id);
      }
      if (p.lifecycle === "ZONED") {
        if (p.buildingId !== undefined || p.completionTick !== undefined)
          throw Error();
      } else {
        const b = s.buildings[p.buildingId!];
        if (
          !b ||
          b.parcelId !== id ||
          b.completionTick !== p.completionTick ||
          b.active !== (p.lifecycle === "DEVELOPED")
        )
          throw Error();
      }
      if (
        p.lastFailureCode !== undefined &&
        typeof p.lastFailureCode !== "string"
      )
        throw Error();
    }
    for (const [id, b] of Object.entries(s.buildings)) {
      if (
        b.id !== id ||
        b.definitionVersion !== config.version ||
        !Array.isArray(b.footprint) ||
        !b.footprint.length ||
        new Set(b.footprint).size !== b.footprint.length ||
        !integer(b.residents) ||
        !integer(b.housingCapacity) ||
        !integer(b.jobCapacity) ||
        !integer(b.creationSequence) ||
        !integer(b.startTick) ||
        !integer(b.completionTick) ||
        typeof b.active !== "boolean" ||
        b.residents > b.housingCapacity ||
        (!b.active && b.residents !== 0)
      )
        throw Error();
      if (b.definitionId === "hq") {
        if (
          id !== "hq" ||
          b.creationSequence !== 0 ||
          b.parcelId !== undefined ||
          !b.active ||
          b.completionTick !== 0 ||
          b.startTick !== 0 ||
          b.housingCapacity !== 0 ||
          b.jobCapacity !== 0 ||
          b.footprint.length !== 4
        )
          throw Error();
      } else {
        const p = s.parcels[b.parcelId!],
          d = config.definitions[b.definitionId];
        if (
          !d ||
          !p ||
          p.buildingId !== id ||
          p.zone !== b.definitionId ||
          id !== `b${b.creationSequence}` ||
          b.creationSequence < 1 ||
          b.creationSequence >= s.nextBuildingSequence ||
          b.housingCapacity !== d.housing ||
          b.jobCapacity !== d.jobs ||
          b.footprint.length !== d.width * d.height ||
          b.startTick <= p.createdTick ||
          b.startTick > s.tick ||
          b.completionTick !== b.startTick + Math.max(1, d.duration) ||
          b.active !== b.completionTick <= s.tick
        )
          throw Error();
      }
      const first = b.footprint[0],
        width =
          b.definitionId === "hq"
            ? 2
            : config.definitions[b.definitionId].width,
        height =
          b.definitionId === "hq"
            ? 2
            : config.definitions[b.definitionId].height;
      const expected = indices({
        minX: first % 64,
        minY: Math.floor(first / 64),
        maxXExclusive: (first % 64) + width,
        maxYExclusive: Math.floor(first / 64) + height,
      });
      if (expected.some((i, n) => b.footprint[n] !== i)) throw Error();
      for (const i of b.footprint) {
        if (
          !integer(i) ||
          i >= 4096 ||
          !s.tiles[i].land ||
          buildingTiles.has(i) ||
          parcelTiles.get(i) !== b.parcelId
        )
          throw Error();
        buildingTiles.set(i, id);
      }
    }
    s.tiles.forEach((tile, i) => {
      const original = base[i];
      if (
        tile.land !== original.land ||
        tile.terrain !== original.terrain ||
        tile.elevation !== original.elevation ||
        tile.coastDistance !== original.coastDistance ||
        typeof tile.road !== "boolean" ||
        tile.parcelId !== parcelTiles.get(i) ||
        tile.buildingId !== buildingTiles.get(i) ||
        (tile.road && (!tile.land || !!tile.parcelId || !!tile.buildingId))
      )
        throw Error();
    });
    if (
      s.started !== !!s.buildings.hq ||
      (!s.started &&
        (s.tick !== 0 ||
          !s.scheduler.paused ||
          Object.keys(s.parcels).length > 0)) ||
      (s.started &&
        (!Number.isFinite(s.startTimestamp) || s.startTimestamp! < 0))
    )
      throw Error();
    const transactionIds = new Set<string>();
    let balance = config.initialTreasury;
    for (const e of s.ledger) {
      if (
        typeof e.transactionId !== "string" ||
        transactionIds.has(e.transactionId) ||
        !integer(e.tick) ||
        e.tick > s.tick ||
        !Number.isSafeInteger(e.amount) ||
        !["zoning", "refund", "settlement"].includes(e.type)
      )
        throw Error();
      transactionIds.add(e.transactionId);
      balance += e.amount;
      if (!integer(balance)) throw Error();
    }
    if (balance !== s.treasury) throw Error();
    return structuredClone(s);
  } catch {
    throw Error("INVALID_CHECKPOINT");
  }
}
// No older schema exists yet. Unsupported versions are preserved, never overwritten.
export function migrateCheckpoint(value: unknown): GameState {
  return validateCheckpoint(value);
}
export async function openDatabase(name = "mongo-v1"): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("checkpoint");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readCheckpoint(
  db: IDBDatabase,
): Promise<GameState | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkpoint", "readonly"),
      r = tx.objectStore("checkpoint").get("single");
    r.onsuccess = () => {
      try {
        resolve(r.result === undefined ? null : migrateCheckpoint(r.result));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export async function writeCheckpoint(
  db: IDBDatabase,
  state: GameState,
  expectedRevision: number | null,
): Promise<void> {
  const snapshot = validateCheckpoint(state);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkpoint", "readwrite"),
      store = tx.objectStore("checkpoint"),
      r = store.get("single");
    let conflict = false;
    r.onsuccess = () => {
      const current = r.result as GameState | undefined;
      if (
        (current === undefined ? null : current.stateRevision) !==
        expectedRevision
      ) {
        conflict = true;
        tx.abort();
      } else store.put(snapshot, "single");
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        Error(conflict ? "CHECKPOINT_CONFLICT" : "CHECKPOINT_WRITE_FAILED"),
      );
    tx.onerror = () => reject(tx.error);
  });
}
