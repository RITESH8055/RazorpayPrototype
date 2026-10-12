// Prints computed features for each scenario: npx tsx scripts/check-features.ts
import { computeFeatures } from "../src/lib/features";
import type { Scenario } from "../src/lib/types";
import a from "../src/data/scenarios/a.json";
import b from "../src/data/scenarios/b.json";
import c from "../src/data/scenarios/c.json";
for (const s of [a, b, c] as unknown as Scenario[]) console.log(s.id, computeFeatures(s));
