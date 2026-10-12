# Hold Resolver (prototype)

A clickable prototype for the Razorpay x ISB Build Challenge, Track 2 "Recover and Grow with AI".

Young D2C merchants running their first big festive sale get their settlements held because a volume spike looks anomalous against thin history. Hold Resolver profiles the merchant in the background, judges whether a spike is explained by category, live offer and real demand, and turns that judgment into a recommended settlement action that a risk analyst approves. The merchant controls what evidence is shared.

**One flow, two views, three scenarios.** All data is synthetic. This prototype is not affiliated with or endorsed by Razorpay.

## Run it

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY for live analysis
npm run dev               # web on http://localhost:5173, proxy on :8787
```

Without an API key, "Run analysis" loads the scripted result for the scenario in under a second and shows a **Fallback** badge. With a key it calls `claude-sonnet-5-5` through the local proxy (the key never reaches the browser) and shows **Live**. Timeouts (8s), invalid JSON, refusals and API errors all fall back.

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | Checks the guardrails against the acceptance criteria |
| `npm run typecheck` | TypeScript check for app and proxy |
| `npm run data` | Regenerates `src/data/scenarios/*.json` (seeded, deterministic) |
| `npx tsx scripts/check-features.ts` | Prints the computed features for each scenario |

## Demo path (under 90 seconds)

1. **A · Kesar & Co**, Merchant view: Profile (Ready, 4 of 4 sources) → Next: spike alert → **Approve and share**.
2. Switch to **Risk analyst** → **Run analysis** → Explained, 0.86 → click an evidence chip (e.g. `E5`) to highlight its card → **Approve** → Outcome: clean, learning log entry.
3. Switch to **C · UrbanNest Decor** → **Run analysis** → Unexplained, hold → **Approve** (or **Override** to see a required reason logged) → Outcome: fraud, reserve covers the loss.

Optional: B · Glow Ritual shows "partly explained" with hold and request; withdraw a consent on the Profile screen to watch the readiness badge drop.

## How it works

```
src/data/            synthetic merchants, scenarios (72h baseline + 24h spike), scripted fallbacks
src/lib/features.ts  computes every number the AI sees (volume multiple, KS shift score,
                     cluster detection, coupon match, social lead/lag, card/device concentration)
                     and builds evidence snippets E1–E10
src/lib/guardrails.ts  code-enforced rules applied to live AND fallback output
src/lib/analysis.ts  calls the proxy, falls back on any failure
server/index.ts      Express proxy to the Anthropic Messages API (structured JSON output)
src/screens/         Profile, Spike + Pack, Analyst review, Outcome + learning
```

**Two stages.** A deterministic trigger (3x the hourly baseline for 3 consecutive hours) decides when to look. The model only judges whether the spike's shape is explained, and only from the features and evidence IDs it is given.

**Guardrails in code, not trusted to the model** (`src/lib/guardrails.ts`):

- `full_release` is never accepted from the AI; it is downgraded to `partial_release`. Full release is analyst-only.
- Release capped at 80%.
- Confidence below 0.6 forces `hold_and_request`, marked "insufficient evidence".
- Reasons citing no evidence ID, or an unknown one, are dropped and flagged.
- For partly explained and unexplained cases, the merchant message is replaced with a fixed general warning. Specific gaps go to the analyst only.

**Cold-start baseline.** Kesar & Co uses Account Aggregator history; Glow Ritual and UrbanNest Decor use a category peer median.

## Scenarios

| | Merchant | Spike | Expected result |
|---|---|---|---|
| A | Kesar & Co, ethnic fashion, 7 weeks, AA consented | 4.1x, AOV ₹1,885 → ₹3,110, whole range shifts, FESTIVE25 in 71%, reel 6h before | Explained, 0.86, release 80%, 20% reserve 30 days. Clean. |
| B | Glow Ritual, beauty, 5 weeks, no AA | 6.0x, AOV flat, no offer, viral reel 2h before, 7 delay complaints | Partly explained, 0.62, hold and request. Released day 3. |
| C | UrbanNest Decor, home decor, 3 weeks, no AA | 8.2x, 140 orders at ₹38k–45k, rest unchanged, coupon 4%, 9 cards / 3 devices | Unexplained, 0.81, hold. 31% of high-value orders charged back. |

## Design

Colours and type follow the "Razorpay Kit" design system: `#305EFF` primary blue, navy ink `#192839`, cool off-white surfaces, TASA Orbiter for headings and Inter for body text. No Razorpay logo or wordmark is used. The amber and red risk tones are additions, because the kit has no semantic colours.

## Assumptions

Thresholds (3x for 3h, 80% cap, 0.6 confidence floor), the synthetic counters on the Outcome screen and every merchant, order and post are placeholders. See the PRD (sections 7 to 10) for how real data would validate each one.
