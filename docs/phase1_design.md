# Phase 1 Design — Rural Development Simulation

**Status:** Draft for review  
**Version:** 0.1  
**Date:** 2026-11-02  
**Target:** Single-developer, mobile-friendly Web MVP  
**Scope:** Rendering, zoning, autonomous development, simplified economy, migration

## 1. Executive summary

Build a playable 64×64 fixed-map, cozy low-poly 3D rural development simulation. The player is a fictional **Rural Development Director** responsible for land-use planning, special/public buildings, and a shared treasury. Private agriculture, residential, and commercial buildings develop autonomously in response to economic demand and land conditions. Roads are generated with zones/buildings, never painted manually.

**Core playable loop:** zone land → pay planning costs → wait for autonomous development → observe jobs, population, production and tax changes → reinvest or recover.

Phase 1 is a deliberately narrow vertical slice, **not** the complete agriculture, tourism, contract, election or land-market game.

## 2. Decision register

### Confirmed product decisions

| ID | Decision | Notes |
| --- | --- | --- |
| D-01 | Player is a fictional Rural Development Director | Can manage planning and cooperative-like economic activities |
| D-02 | Core is city planning and making money | Strategy arises from land opportunity cost and treasury |
| D-03 | Fixed 64×64 map (4,096 tiles) | No procedural infinite expansion |
| D-04 | Fixed-angle orthographic cozy low-poly 3D | No 2D renderer or free-roaming 3D camera |
| D-05 | Mobile and desktop web browser | Touch controls required |
| D-06 | Hybrid construction | Zone-based private development plus player-placed special/public buildings |
| D-07 | Agriculture, residential and commercial zones | Phase 1 playable zone types |
| D-08 | Zoning and conversion incur costs | Demolition/compensation may incur costs |
| D-09 | Zones/buildings generate their own roads | No manual road placement |
| D-10 | Autonomous population and business migration | Demand-driven and observable |
| D-11 | Shared public treasury | Commercial taxes, eligible public-land rent, public facilities and agricultural trade can eventually contribute |
| D-12 | Public/private land distinction | Phase 1 may defer detailed ownership transactions |
| D-13 | Long-term overdraft cap: 10 million | Full debt/insolvency model deferred |
| D-14 | Long-term game ends when player loses reelection | Elections deferred beyond Phase 1 |
| D-15 | One wholesale market per crop in initial agriculture expansion | Market expansion deferred |
| D-16 | Guaranteed crop purchase contracts and flexible spot prices | Deferred beyond Phase 1 |
| D-17 | Farmers independently choose crops with growth-time lock-in | Detailed model deferred |
| D-18 | No mandatory village development archetypes | Agricultural, commercial, cultural/tourism outcomes emerge from policies and zoning |

### Proposed engineering defaults — **not yet approved**

| Area | Proposal | Trade-off / validation |
| --- | --- | --- |
| Renderer | Three.js with TypeScript | Verify device compatibility and build/asset workflow |
| UI | Lightweight web UI (framework undecided) | Avoid choosing framework before UI prototype |
| Simulation | Pure TypeScript, browser-local initially | Deterministic tests; server authority not needed for offline MVP |
| Persistence | Local save with versioned schema | Cloud sync later |
| Tick | Monthly economic tick; pause/1×/2×/4× | Test whether feedback feels responsive |
| Terrain | Pre-authored small height variation; no terrain editing | Slope/building placement complexity contained |
| Map | Tile grid + parcel instances | Building footprints may span multiple tiles |
| Backend | None required for Phase 1 gameplay | Vercel can host static frontend; AWS EC2 reserved for later need |

## 3. Scope and exclusions

### In scope

1. A visually coherent 64×64 low-poly map with fixed orthographic angle.
2. Mouse and touch pan/zoom, accurate tile picking, visible placement preview.
3. Agriculture/residential/commercial zoning; zone painting, undo/cancel, treasury deduction.
4. Auto-generated visual roads as part of zone/parcel presentation.
5. Simple parcels and private building spawn/abandonment/one-level growth.
6. Aggregate agriculture, residential and commercial demand.
7. Monthly treasury and population changes, with an understandable dashboard.
8. One or two player-placed special buildings to validate hybrid construction.
9. Local save/load, deterministic simulation tests and mobile performance checks.

### Explicitly out of scope

- Elections, detailed approval ratings and game-over politics.
- Guaranteed purchase contracts, detailed crop lifecycle, per-farmer capital and inventories.
- Crop perishability, cold storage, multiple wholesale markets and processing chains.
- Tourism economy, heritage preservation and scripted village archetypes.
- Dynamic weather, seasonal disasters and random events.
- Realistic road/pathfinding/traffic simulation.
- Land auctions, ownership transfer and compensation negotiation.
- Multiplayer, authentication, cloud saves, EC2 service and database.
- Fully simulated individual residents or shops.
- 2D fallback, unrestricted 3D camera and free terrain sculpting.

Deferring a feature does **not** revoke the long-term design decision.

## 4. System architecture

```text
Web UI (tools, treasury, overlays, dashboard)
             |
        Game Controller
             |
   Commands / State / Events
             |
+------------+------------------+
| Simulation Core (pure TS)      |
| Map / Zoning / Parcels         |
| Development / Economy         |
| Population / Time             |
+------------+------------------+
             |
       Render Projection
             |
 Three.js Renderer (3D only)
             |
        Browser GPU
```

**Separation rule:** simulation code cannot import Three.js, browser DOM or UI framework APIs. Rendering reads state snapshots and events; it does not own economic rules. UI emits validated commands, never mutates the simulation directly.

Proposed package/module boundaries (not a mandatory monorepo):

- `src/simulation/`: pure state transitions, formulas, seeded RNG, commands.
- `src/world/`: tiles, parcels, zoning constraints, building definitions.
- `src/rendering/`: scene, orthographic camera, instancing, picking, render projection.
- `src/ui/`: zoning controls, budget, time controls, overlays.
- `src/persistence/`: save schema, migrations, storage adapter.
- `src/data/`: versioned balancing tables for costs and demand.
- `tests/`: unit, scenario, integration and performance tests.

## 5. Map, zoning and parcels

### Map invariants

- Width = height = 64; exactly 4,096 tile positions.
- A tile may be empty, reserved, zoned, or occupied according to an explicit state model.
- Building footprints may consume multiple tiles; therefore **4,096 is not the actual building count**.
- Map dimensions remain data-driven even though the first scenario is fixed at 64×64.
- Terrain elevation is independent of zone and ownership.
- Ownership (public/private) is distinct from land use; detailed rent transactions are Phase 2.

### Proposed core data

```ts
type ZoneType = "none" | "agriculture" | "residential" | "commercial";

interface Tile {
  x: number;
  y: number;
  elevation: number;
  zone: ZoneType;
  parcelId?: string;
  buildingId?: string;
}

interface Parcel {
  id: string;
  zone: Exclude<ZoneType, "none">;
  tiles: number[];
  developmentLevel: number;
  buildingId?: string;
}

interface Building {
  id: string;
  kind: string;
  parcelId?: string;
  footprint: number[];
  level: number;
  status: "active" | "vacant" | "abandoned";
}
```

Data structures are illustrative. Parcel splitting/merging, footprint placement and ownership must be deterministic and independently tested.

### Zoning commands

`ApplyZone(tiles, targetZone)` should:
1. Validate map bounds, immutable/reserved land, footprint conflicts and terrain constraints.
2. Compute cost and show preview before commit.
3. Reject unaffordable operations atomically; no partial silent changes.
4. Apply zoning, update parcels and record treasury transaction.
5. Emit events for rendering/UI.

**Cost proposal:**

```text
zoningCost = sum(baseZoneCost[zone] × terrainMultiplier[tile])
conversionCost = sum(conversionFee[fromZone][toZone])
totalCost = zoningCost + conversionCost + demolitionAndCompensation
```

No specific prices are locked until playtesting. Avoid charging the player the full cost of private buildings; private development is funded by the simulated private sector.

### Automatic roads

Roads are **not a player-painted network**. Each zone/parcel/building may generate road/footpath visuals and include a bundled infrastructure cost. Phase 1 uses simple access/terrain modifiers rather than a graph traffic simulation. Ensure road visuals do not secretly create extra buildable capacity or overlap structures.

## 6. Autonomous development

### Development pipeline (per monthly tick)

1. Compute aggregate zone demand from population, employment, production and treasury conditions.
2. Determine feasible vacant parcels (zone, footprint, terrain, available capacity).
3. Compute a development score using demand, suitability, infrastructure and costs.
4. Use seeded probabilistic selection with a per-tick development cap.
5. Spawn, upgrade or abandon buildings; emit explainable events.
6. Update occupied capacity and economic aggregates.

Proposed illustrative formula (parameters subject to tuning):

```text
score(parcel, zone) =
    wDemand × normalizedDemand[zone]
  + wSuitability × suitability[parcel]
  + wAccess × accessibility[parcel]
  - wCost × developmentFriction[parcel]

probability = sigmoid(score)
```

**Important:** do not allow unconstrained compounding. Development requires both demand and physical capacity; use hysteresis/cooldowns to prevent rapid build-demolish oscillation. One development stage (vacant → level 1) is sufficient for the first playable version.

## 7. Population and economic simulation

### Minimal state

- Household count, population and available residential capacity.
- Agricultural production index and commercial activity index.
- Employment capacity and unemployment proxy.
- Treasury balance, recurring revenues and maintenance expenses.
- Demand indices for three zone types.
- Optional recent trend history for the dashboard.

### Migration

Migration is driven by a village attractiveness score and available residential/jobs capacity; use a bounded expected household flow and seeded rounding. People must not move in without available housing. Outmigration should react to prolonged poor economic conditions rather than a single tick.

```text
attractiveness = incomeOpportunity + services + environment - livingCost - risk
expectedInflow = min(housingVacancy, max(0, migrationRate × (attractiveness - baseline)))
expectedOutflow = min(existingHouseholds, max(0, exitRate × (baseline - attractiveness)))
```

These are **prototype formulas**, not final balance equations. Define normalizations, units and parameter ranges in data tables. Distinguish residents, households, businesses and buildings so occupancy cannot exceed capacity.

### Simplified treasury

```text
closingCash = openingCash
            + commercialTax
            + agriculturalPublicRevenue
            + eligibleFacilityRevenue
            - zoneAndSpecialConstruction
            - infrastructureMaintenance
            - publicOperatingCost
```

Phase 1 should show each revenue and expense separately. Avoid treating all private commercial turnover or tourism spending as public income. Public land rent and detailed agricultural purchase/resale profit are future extensions.

**Debt:** preserve the confirmed 10-million maximum overdraft as a configurable guardrail, but postpone interest, creditor behavior and election penalties. Never allow a transaction to bypass the applicable credit limit.

### Economic invariants

- No money appears in the treasury merely because a building is placed.
- No double counting of private revenue as public income.
- No migration beyond physical housing capacity.
- No private development on blocked or occupied land.
- Zoning expense and recurring maintenance are visible and testable.
- Scenarios should not grow indefinitely without demand or constraints.

## 8. Time and determinism

Use a fixed simulation step separate from rendering frames. Proposed monthly tick, with pause and 1×/2×/4× speed controls. Real-time interpolation is presentation-only.

Seed the PRNG. Given the same initial state, command sequence, balance table version and seed, the simulation must produce identical state hashes. Keep a bounded event log for explainability and debugging.

Recommended tick order:

1. Apply validated player commands.
2. Update production and business activity.
3. Calculate income, costs and treasury.
4. Calculate zone demand.
5. Process development and occupancy.
6. Process migration.
7. Publish snapshot/events and advance month.

Use explicit prior-state reads or staged updates to avoid accidental ordering dependencies. Record which variables use current-tick versus previous-tick values.

## 9. Rendering and mobile UX

### Rendering proposal

- Three.js + TypeScript, fixed orthographic camera, fixed angle.
- Stylized low-poly meshes with small material palette and limited lighting.
- Chunked terrain mesh, instancing for repeated crops/trees/props, batched static geometry where appropriate.
- Frustum culling, capped device pixel ratio, reduced shadows/post-processing.
- Render only changes required by simulation/interaction; avoid full scene rebuild each tick.
- Tile/parcel selection via raycasting against simple collision proxies, not high-poly visual meshes.

### Controls

Desktop: click/tap to select, drag to paint, drag/pan camera, wheel/pinch zoom, clear placement preview and cost.

Mobile: single-finger selection/paint with an explicit active tool, two-finger pan/zoom or a clearly defined alternative; protect against accidental zoning while navigating. Provide undo before irreversible demolition, readable HUD, and responsive hit targets.

### Performance targets (proposed acceptance gates)

- Target 30 FPS or better on a **specified midrange phone**, not an unspecified device.
- Desktop target 60 FPS on a documented test machine.
- No persistent frame spikes during zoning or monthly simulation.
- Record scene draw calls, triangle count, texture memory estimates, first interactive load time and browser memory where measurable.
- Establish an asset budget only after a real device baseline; do not invent universal memory limits.

Performance targets are provisional until actual device testing.

## 10. Save/load and deployment

Phase 1: versioned local JSON state, schema validation and migration hook; use browser storage appropriate to measured save size (IndexedDB if needed). Autosave at safe simulation boundaries; provide export/import only if useful for QA.

Deploy static frontend to Vercel. No EC2 or Docker runtime is needed for the first browser-local gameplay loop. Preserve an adapter boundary so AWS services can be introduced when accounts, cloud saves, multiplayer or authoritative simulation actually justify the cost.

Mac mini M4/ARM64 is the development environment. Avoid a required backend during Phase 1.

## 11. Milestones and deliverables

| Milestone | Goal | Main deliverable | Exit gate |
| --- | --- | --- | --- |
| M0 | Project bootstrap | TypeScript build, tests, lint, CI, Vercel preview | Reproducible local and CI build |
| M1 | 3D scene | 64×64 terrain, fixed camera, sample assets | Stable desktop/mobile navigation |
| M2 | Spatial interaction | Tile picking, zone paint/preview, cost/undo | No invalid or partial zoning commits |
| M3 | Parcels and roads | Parcel placement, generated road visuals, footprints | No overlaps; deterministic parcels |
| M4 | Autonomous growth | Demand, spawn/abandon, event explanations | Same seed/commands produce same growth |
| M5 | Economy and migration | Treasury, tax, costs, households, capacity | Budget and population invariants hold |
| M6 | Persistence and polish | Save/load, HUD, QA scenarios, profiling | Full gameplay loop on target devices |

**Rough estimate:** 33–57 focused engineering days for one developer, **not a delivery commitment**. Art pipeline, mobile bugs and balancing are the largest uncertainties. Re-estimate after M1/M2.

### Suggested build order

- M0–M2 first: validate rendering, camera and zoning UX before implementing economy.
- M3–M4: demonstrate visible autonomous growth.
- M5: make planning financially consequential.
- M6: make it reliably playable and reviewable.

Each milestone should end with a deployable Vercel preview and a short decision/issue log.

## 12. Testing strategy

### Unit and property tests

- Tile index/coordinate conversion, bounds and footprint collision.
- Zone conversion cost, atomic transaction and credit limit.
- Parcel formation and ownership of occupied tiles.
- Deterministic RNG and simulation state transitions.
- Treasury conservation/accounting invariants.
- Migration bounded by housing and household counts.
- Save/load round-trip and schema version rejection/migration.

### Scenario tests

1. **Agricultural village:** agriculture-focused zoning should produce agriculture activity without forcing commercial growth.
2. **Commercial transition:** converting agricultural land to commercial should cost money and reduce agricultural capacity.
3. **No demand:** empty demand should not produce unlimited buildings.
4. **Over-budget zoning:** insufficient funds should reject the whole operation.
5. **Population stress:** residential capacity limits migration.
6. **Reproducibility:** same seed + actions + parameters yields identical outcomes.

### UI and performance tests

- Desktop mouse and mobile touch gestures.
- Camera limits and no accidental paint while panning.
- Visual selection corresponds to underlying tiles at all zoom levels.
- Browser reload restores valid state.
- FPS and memory profiling on at least one real iOS and Android device if available.
- Smoke test Vercel preview on each milestone.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Low-poly assets consume excessive production time | High | Start with procedural primitives and a tiny consistent palette |
| 3D mobile rendering overhead | High | Instancing, culling, simple materials, measured device gates |
| Zoning/parcel complexity | High | Start with simple rectangular parcels; test spatial invariants |
| Economy exploits / runaway growth | High | Bounded flows, explicit costs, seeded scenario regression |
| Road auto-generation overlaps footprints | Medium | Generate roads from parcel templates and validate geometry |
| Player cannot understand why buildings appear | High | Show demand indicators and development event reasons |
| Scope creep into tourism/agriculture/elections | High | Enforce Phase 1 exclusions; defer through issue backlog |
| Framework/backend premature commitment | Medium | Pure simulation boundary and browser-first deployment |

## 14. Definition of done

Phase 1 is accepted when:

1. A 64×64 low-poly village loads in a desktop and mobile browser.
2. The player can pan/zoom, select land, zone agriculture/residential/commercial, and place at least one special building.
3. Every zoning operation previews cost and respects budget, terrain and occupied-land constraints.
4. Roads appear automatically as part of development; no manual road tool exists.
5. Private buildings develop over time based on observable demand rather than direct player placement.
6. Population can move in/out while respecting housing capacity.
7. Treasury changes through explicit costs, recurring expenses and at least agricultural/commercial public revenue proxies.
8. Different zoning strategies produce meaningfully different trajectories under identical initial conditions.
9. Save/load and seeded scenario tests pass.
10. A real mobile-device performance report is attached to the milestone review.

**Not required for acceptance:** realistic crop contracts, tourist simulation, elections, full land markets, multiplayer or cloud backend.

## 15. Phase 2+ roadmap (non-binding)

- Agriculture depth: multiple crops, growth time, farm household decisions, spot price and wholesale supply decay.
- Guaranteed procurement contracts, inventory, spoilage, processing and financial credit.
- Public/private land ownership, rent and property transactions.
- Tourism, heritage, cultural landmarks and environmental effects.
- Governance, stakeholder satisfaction, reelection and endgame.
- More advanced market competition and optional server-backed features.

Sequence these only after Phase 1 playtests demonstrate that zoning, autonomous growth and fiscal trade-offs are fun.

## 16. Review checklist / open questions

- [ ] Approve Three.js as initial rendering engine after M1 performance spike.
- [ ] Approve the first-pass map elevation and parcel footprint constraints.
- [ ] Confirm monthly economic tick and initial speed controls.
- [ ] Choose a minimal special building for the first hybrid-construction test.
- [ ] Define baseline starting treasury and zoning prices **through balancing tests**, not arbitrary permanent values.
- [ ] Choose target mobile devices and record actual FPS/interaction data.
- [ ] Decide whether initial scenario starts with a small existing village (recommended) or empty map.

**Design rule:** This document distinguishes confirmed product decisions from proposed engineering defaults. Approval of this PR approves the Phase 1 plan for implementation; it does not silently finalize every open question.
