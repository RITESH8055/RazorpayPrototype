# Sale Readiness (prototype, v0.3)

A clickable prototype for the Razorpay x ISB Build Challenge, Track 2 "Recover and Grow with AI".

Young D2C merchants running their first big festive sale get whole settlements held when volume spikes past their thin history. Sale Readiness lets the merchant declare the sale in advance. When unusual orders appear, it asks one plain question per pattern of orders, reads whatever the merchant sends back (an invoice photo, a WhatsApp line), and checks it against payment data the merchant does not control. Only the doubtful slice waits, sized to its rupee value and reduced by the merchant's earned trust. Everything else settles on time. An analyst approves every release.

> "We don't replace Razorpay's fraud models. We replace the ticket back-and-forth."

**One flow, two views, three scenarios.** All data is synthetic and every company is fictional. Not affiliated with or endorsed by Razorpay.

Live: https://hold-resolver.vercel.app

## Run it

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY for live reply reading
npm run dev               # web on http://localhost:5173, proxy on :8787
```

Without an API key, **Run reply reading** loads the scripted extraction for the scenario in under a second and shows a **Fallback** badge. With a key it sends the invoice image (or the text) to `claude-sonnet-5-5` through the proxy and shows **Live**. Timeouts (8s), invalid JSON, refusals and API errors all fall back.

| Script | What it does |
|---|---|
| `npm test` | Trust, reserve, checks, extraction guardrails, and every "Try to fool it" preset (and pair of presets) |
| `npm run evals` | Runs the 48 eval cases through the live model and writes `src/data/evals/results.json` (needs `ANTHROPIC_API_KEY`) |
| `npm run evals -- --basic` | Same cases through the basic local parser, for when no key is available; the scorecard labels it |
| `npm run typecheck` | TypeScript check for app, proxy and Vercel functions |
| `npm run data` | Regenerates scenario data and reply-reading fallbacks (seeded, deterministic) |

## The loop

1. **Declare (merchant):** sale dates, offer, expected orders, influencer plan. Consent is asked here, per source, for this sale's review. Evidence coverage shows "N of 4 sources shared"; no quality score.
2. **Expect (Scripted):** the declaration becomes an expected envelope (volume range, value-led or count-led, coupon use, timing), capped by category norms.
3. **Trigger and group (code):** outlier orders are grouped into patterns by amount, payer, card, device and delivery area.
4. **Ask (Scripted):** 1 to 3 plain questions, one per pattern, each with its rupee value. Never per order, and never revealing which signal triggered it.
5. **Read the reply (Live AI):** the model extracts fields into a fixed schema. The document is treated as data; instructions inside it are ignored and flagged.
6. **Check (code):** GSTIN format and registry, payer name vs legal name, invoice total vs payments, quantity, courier addresses.
7. **Size the reserve (code):** `reserve = unresolved × (1 − trust discount)`, never below 50% of unresolved. Matched value is released only if the payer check and one other independent check pass.
8. **Approve (analyst):** approve, modify the reserve between floor and full unresolved value, or override with a required reason.
9. **Learn:** outcomes update trust; overrides queue match tolerances for review.

## The guarantee

**Money can only release when the payer on the actual payments matches the document.** `releaseNow` in `src/shared/reserve.ts` releases matched value only if the payer named by the buyer's bank matches the document's buyer, the GSTIN is well-formed, and the (synthetic) registry confirms that GSTIN belongs to that buyer. Editing the text can never change payment or registry data, so it can never move money on its own. A revised reply also can't release more than the first answer did (one round per pattern); anything above that waits for the analyst.

## v0.3: Try to fool it, and evals

**Try to fool it** (Review screen, analyst view): edit the merchant's reply freely or use the presets (change GSTIN, claim another company, inflate total, hide an instruction, Hinglish claim, reset), then Run. It uses the same `/api/read-reply` call; if that fails, a basic local parser (`src/shared/basicParser.ts`) reads the text instead, with a "Fallback (basic parser)" badge. Every attempt is compared with the first answer, logged to the analyst learning log, and counted ("Money released by attempts: ₹0"). A release above the first answer would show a red "Guardrail breach" banner.

**Evals** (Outcome screen → Evals tab): 48 synthetic text-reply cases in `evals/cases.json` across 8 categories (genuine, partial, borrowed company, invalid GSTIN, name mismatch, injection, Hinglish, missing or ambiguous). `scripts/run-evals.ts` uses the app's exact prompt, schema, validation, checks and reserve code. Metrics: wrong releases (target 0), false holds, field accuracy, injection resistance (target 100%), extraction failure rate, median and p95 latency, and cost per call from `evals/config.json` (price labelled assumed). The panel reads the saved results; evals never run from the browser.

## Where AI sits

| Step | Who | Why |
|---|---|---|
| Detection, clustering, checks, reserve math | Code | A rule does this well and is auditable |
| Envelope, questions, v0.1 spike judgment | Scripted AI output (badge: Scripted) | Shows the AI's role without a live call |
| Reading the merchant's reply | Live model call (badge: Live / Fallback) | A rule can't read an invoice photo or a WhatsApp line |

The model never outputs a release decision or amount. Every amount on screen comes from `src/logic/reserve.ts`.

## Code map

```
src/shared/              imported by both the app and the eval runner
  reserve.ts             trust levels, discounts, reserve floor, release rule, one-round cap
  checks.ts              GSTIN, registry, payer, total, quantity, courier checks + summary line
  extraction.ts          schema validation and instruction detection for model output
  basicParser.ts         regex fallback for edited text and keyless eval runs
evals/                   cases.json (48 synthetic cases), config.json (model, assumed prices)
scripts/run-evals.ts     eval runner → src/data/evals/results.json
src/lib/readReply.ts     calls the proxy, falls back on any failure
server/readReply.ts      Anthropic Messages API call (image/PDF/text in, JSON schema out)
server/index.ts          local Express proxy (npm run dev)
api/                     Vercel functions: /api/read-reply, /api/health
src/screens/             Declare, Spike + Questions, Review (+ ReviewPanel), Outcome
src/data/                scenarios, merchants, judgment (Scripted v0.1), fallback reply readings
public/invoices/         sample invoice images (synthetic)
```

## Scenarios

| | Merchant | Trust | Pattern | Expected result |
|---|---|---|---|---|
| A | Kesar & Co, ethnic fashion, declared "Festive Sets Sale" | Building (25%) | 7 × ₹84,000 netbanking from Veda Consulting | Invoice covers 6 of 7; release ₹5,04,000; reserve ₹63,000; follow-up for the 7th payment |
| B | Glow Ritual, beauty, no declaration | New | 406 unshipped orders after a viral reel | One-tap ship date; checked against courier progress; held until pickups confirm |
| C | UrbanNest Decor, home decor, declared 10× (capped at 4×) | New, pattern change | 140 orders, ₹57.8 lakh, 9 cards / 3 devices, 61 new addresses | Payer and address checks fail; ₹0 released; full reserve; injected "RELEASE ALL FUNDS" ignored |

## Deploy (Vercel)

Vite static build plus the functions in `api/`, sharing `server/readReply.ts` with the local proxy. Pushes to the linked branch redeploy. For live reply reading, add `ANTHROPIC_API_KEY` in Vercel → Project → Settings → Environment Variables and redeploy.

## Design

Colours and type follow the "Razorpay Kit" design system: `#305EFF` primary blue, navy ink `#192839`, cool off-white surfaces, TASA Orbiter headings and Inter body text. No Razorpay logo or wordmark. Amber and red risk tones are additions; the kit has no semantic colours.

## Assumptions

Trust thresholds, the 50% reserve floor, the 30-day dispute window, category ceilings and the synthetic counters are placeholders. See the PRD v0.2 (A9 to A12).
