import map from "../data/test-island.json";
import type { Bounds, Config, GameState, Parcel, Tile, Zone } from "./types";
export const SIZE = 64;
export function neighbors(i: number): number[] {
  const x = i % SIZE,
    y = Math.floor(i / SIZE);
  return [
    x > 0 ? i - 1 : -1,
    x < SIZE - 1 ? i + 1 : -1,
    y > 0 ? i - SIZE : -1,
    y < SIZE - 1 ? i + SIZE : -1,
  ]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
}
export function indices(b: Bounds): number[] {
  if (
    ![b.minX, b.minY, b.maxXExclusive, b.maxYExclusive].every(
      Number.isInteger,
    ) ||
    b.minX < 0 ||
    b.minY < 0 ||
    b.maxXExclusive > SIZE ||
    b.maxYExclusive > SIZE ||
    b.minX >= b.maxXExclusive ||
    b.minY >= b.maxYExclusive
  )
    throw Error("INVALID_BOUNDS");
  const result: number[] = [];
  for (let y = b.minY; y < b.maxYExclusive; y++)
    for (let x = b.minX; x < b.maxXExclusive; x++) result.push(y * SIZE + x);
  return result;
}
export function initialTiles(): Tile[] {
  if (
    map.width !== SIZE ||
    map.height !== SIZE ||
    [map.landMask, map.terrainType, map.elevation, map.coastDistance].some(
      (a) => a.length !== SIZE * SIZE,
    )
  )
    throw Error("INVALID_MAP");
  return map.landMask.map((land, i) => {
    if (
      (land !== 0 && land !== 1) ||
      map.terrainType[i] !== (land ? "plain" : "sea") ||
      !Number.isFinite(map.elevation[i]) ||
      !Number.isInteger(map.coastDistance[i])
    )
      throw Error("INVALID_MAP");
    return {
      land: !!land,
      terrain: land ? "plain" : "sea",
      elevation: map.elevation[i],
      coastDistance: map.coastDistance[i],
      road: false,
    };
  });
}
export const MAP_VERSION = map.version;
export const free = (t: Tile) =>
  t.land && t.terrain === "plain" && !t.road && !t.parcelId && !t.buildingId;
export function price(
  state: GameState,
  bounds: Bounds,
  zone: Zone,
  c: Config,
): number {
  return indices(bounds).reduce((sum, i) => {
    const coastal =
      state.tiles[i].coastDistance <= 2 ? c.coastalFactor[zone] : 10000;
    return (
      sum +
      Math.floor(
        (Math.floor((c.baseLandValue * coastal) / 10000) * c.zoneFactor[zone]) /
          10000,
      )
    );
  }, 0);
}
export function footprint(
  state: GameState,
  p: Parcel,
  c: Config,
): number[] | undefined {
  const d = c.definitions[p.zone],
    b = p.bounds;
  for (let y = b.minY; y + d.height <= b.maxYExclusive; y++)
    for (let x = b.minX; x + d.width <= b.maxXExclusive; x++) {
      const tiles = indices({
        minX: x,
        minY: y,
        maxXExclusive: x + d.width,
        maxYExclusive: y + d.height,
      });
      if (
        tiles.every(
          (i) =>
            state.tiles[i].land &&
            state.tiles[i].parcelId === p.id &&
            !state.tiles[i].road &&
            !state.tiles[i].buildingId,
        )
      )
        return tiles;
    }
}
export function roadPlan(state: GameState, p: Parcel): number[] | undefined {
  const own = new Set(indices(p.bounds));
  const border = [
    ...new Set([...own].flatMap(neighbors).filter((i) => !own.has(i))),
  ].sort((a, b) => a - b);
  if (border.some((i) => state.tiles[i].road)) return [];
  const starts = border.filter((i) => free(state.tiles[i]));
  if (!starts.length) return undefined;
  // No target road exists: bootstrap without exploring the entire island.
  if (!state.tiles.some((tile) => tile.road)) return [starts[0]];
  // The sorted FIFO order is unchanged; parent links avoid copying every path.
  const queue = [...starts];
  const parent = new Int32Array(state.tiles.length).fill(-1);
  for (const i of starts) parent[i] = -2;
  for (let head = 0; head < queue.length; head++) {
    const last = queue[head];
    if (neighbors(last).some((i) => state.tiles[i].road)) {
      const path: number[] = [];
      for (let i = last; i >= 0; i = parent[i]) path.push(i);
      return path.reverse();
    }
    for (const next of neighbors(last))
      if (parent[next] === -1 && free(state.tiles[next])) {
        parent[next] = last;
        queue.push(next);
      }
  }
  return [starts[0]];
}

export function refundAmount(paidAmount: number): number {
  return Math.floor((paidAmount * 8000) / 10000);
}
