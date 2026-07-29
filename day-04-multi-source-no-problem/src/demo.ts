import { MULTI_SOURCE_FIXTURE } from "./fixture.ts";
import { synchronizeCaptures } from "./synchronize.ts";

console.log(JSON.stringify({ fixture: true, ...synchronizeCaptures(MULTI_SOURCE_FIXTURE) }, null, 2));
