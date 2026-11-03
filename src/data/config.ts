import type { Config } from "../simulation/types";
// Experimental balance values from SDD P0; changing these requires a new version.
export const config: Config = {
  version: "experimental-v1",
  seed: 20261103,
  initialTreasury: 10000,
  baseLandValue: 10,
  zoneFactor: { agriculture: 10000, residential: 15000, commercial: 20000 },
  coastalFactor: { agriculture: 8000, residential: 13000, commercial: 11000 },
  definitions: {
    agriculture: { width: 2, height: 2, housing: 4, jobs: 5, duration: 1 },
    residential: { width: 2, height: 2, housing: 8, jobs: 0, duration: 1 },
    commercial: { width: 2, height: 2, housing: 0, jobs: 8, duration: 2 },
  },
  jobsRatio: 2,
  migrationLimit: 3,
  startsPerTick: 2,
  monthlyIncome: 0,
  monthlyExpense: 0,
};
