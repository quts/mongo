export type Zone = "agriculture" | "residential" | "commercial";
export type Bounds = {
  minX: number;
  minY: number;
  maxXExclusive: number;
  maxYExclusive: number;
};
export type Tile = {
  land: boolean;
  terrain: "plain" | "sea";
  elevation: number;
  coastDistance: number;
  road: boolean;
  parcelId?: string;
  buildingId?: string;
};
export type Parcel = {
  id: string;
  bounds: Bounds;
  zone: Zone;
  createdTick: number;
  createdSequence: number;
  zoningPaidAmount: number;
  lifecycle: "ZONED" | "CONSTRUCTING" | "DEVELOPED";
  completionTick?: number;
  buildingId?: string;
  lastFailureCode?: string;
};
export type Building = {
  id: string;
  parcelId?: string;
  definitionId: Zone | "hq";
  definitionVersion: string;
  footprint: number[];
  housingCapacity: number;
  jobCapacity: number;
  residents: number;
  creationSequence: number;
  active: boolean;
  startTick: number;
  completionTick: number;
};
export type LedgerEntry = {
  transactionId: string;
  tick: number;
  type: "zoning" | "refund" | "settlement";
  amount: number;
  parcelId?: string;
};
export type Scheduler = {
  speed: 1 | 2 | 4;
  paused: boolean;
  lastWallClockTimestamp: number;
  accumulatedMs: number;
};
export type GameState = {
  schemaVersion: 1;
  configVersion: string;
  mapVersion: string;
  gameId: string;
  stateRevision: number;
  tick: number;
  seed: number;
  prngState: number;
  scheduler: Scheduler;
  lastSettledMonthIndex: number;
  nextParcelSequence: number;
  nextBuildingSequence: number;
  roadRevision: number;
  started: boolean;
  startTimestamp?: number;
  tiles: Tile[];
  parcels: Record<string, Parcel>;
  buildings: Record<string, Building>;
  treasury: number;
  ledger: LedgerEntry[];
  commandIds: string[];
};
export type Command = { id: string } & (
  | { type: "placeHQ"; bounds: Bounds; timestamp: number }
  | { type: "zone"; bounds: Bounds; zone: Zone }
  | { type: "cancel"; parcelId: string }
  | { type: "change"; parcelId: string; zone: Zone }
  | { type: "time"; speed: 1 | 2 | 4; paused: boolean }
);
export type DomainEvent = {
  tick: number;
  phase: number;
  subject: string;
  type: string;
  amount?: number;
};
export type Result =
  { ok: true; cost?: number; warning?: string } | { ok: false; code: string };
export type Definition = {
  width: number;
  height: number;
  housing: number;
  jobs: number;
  duration: number;
};
export type Config = {
  version: string;
  seed: number;
  initialTreasury: number;
  baseLandValue: number;
  zoneFactor: Record<Zone, number>;
  coastalFactor: Record<Zone, number>;
  definitions: Record<Zone, Definition>;
  jobsRatio: number;
  migrationLimit: number;
  startsPerTick: number;
  monthlyIncome: number;
  monthlyExpense: number;
};
