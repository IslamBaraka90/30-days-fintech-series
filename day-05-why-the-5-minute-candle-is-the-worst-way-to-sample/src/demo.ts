import { compareBarClocks } from "./compare-bars.ts";
import { BAR_FIXTURE } from "./fixture.ts";

const result = compareBarClocks(
  BAR_FIXTURE,
  { "2025-01-02": "2025-01-02T14:30:00.000Z" },
  {
    intervalSeconds: 30,
    initialTickSign: 1,
    initialExpectedTicks: 20,
    initialExpectedTickImbalance: 0.5,
    initialExpectedSignedVolume: 10,
    initialBuyProbability: 0.5,
  },
);
console.log(JSON.stringify({ fixture: true, ...result }, null, 2));
