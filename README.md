# 30 Days of Fintech — Tutorial Repository

A hands-on tutorial series following [The FinTech Builder](https://thefintechbuilder.com/) 30-day fintech curriculum. Each day folder contains the full implementation, tests, and run instructions for that day's topic.

## Prerequisites

- **Node.js 22 or newer** (required for `--experimental-strip-types` support)
- An **Alpaca** account (free IEX feed is enough for Day 1 and Day 2)
- Optional: **Finnhub** API key (Day 2, free tier)
- Optional: **FMP** paid WebSocket plan (Day 2, Day 4)
- Day 4 requires **at least two providers** with valid credentials and verified clock synchronization
- Day 5 is the Arc 1 capstone — it composes the provider, health, and calendar boundaries from Days 1–4

## Repository Structure

> Day 3 reuses the Day 2 provider adapters and adds a feed health check.

```
30-days-fintech-series/
├── package.json              # dependencies and npm scripts
├── tsconfig.json             # root TypeScript config
├── .env.example              # copy this to .env and fill in your keys
├── .gitignore
├── shared/
│   └── data/
│       └── alpaca.ts         # shared Alpaca market data adapter
├── day-01-what-you-need-to-know-before-your-first-price-feed/
│   ├── tsconfig.json
│   └── src/
│       ├── alpaca.ts         # re-exports from shared adapter
│       ├── types.ts          # re-exports NormalizedTrade, AlpacaFeed
│       ├── bars.ts           # four bar-construction rules (time, tick, volume, dollar)
│       ├── build.ts          # live capture + comparison report
│       ├── peek.ts           # print 5 raw trades (quick connection test)
│       └── bars.test.ts      # deterministic unit test (no credentials needed)
└── day-02-your-price-feed-is-lying-to-you/
    ├── tsconfig.json
    └── src/
        ├── providers/
        │   ├── types.ts      # normalized event contracts + capability metadata
        │   ├── alpaca.ts     # Day 2 Alpaca wrapper
        │   ├── finnhub.ts    # Finnhub WebSocket trade mapper
        │   ├── fmp.ts        # FMP trade, quote, and break mapper
        │   └── index.ts      # provider selection by MARKET_DATA_PROVIDER
        ├── quality.ts        # six-stage quality gate
        ├── report.ts         # formatted quality report output
        ├── build.ts          # live capture + quality gate runner
        ├── fixture.ts        # labeled synthetic test data
        ├── demo.ts           # deterministic failure laboratory
        ├── quality.test.ts   # six-stage quality gate tests
        └── provider-contract.test.ts  # provider mapping + capability tests
└── day-03-is-my-feed-healthy-right-now/
    ├── tsconfig.json
    └── src/
        ├── health.ts        # four-algorithm feed health assessment
        ├── build.ts         # live capture + health report (JSON)
        ├── fixture.ts       # labeled synthetic capture for demo/tests
        ├── demo.ts          # deterministic health demo (no credentials)
        └── health.test.ts   # clock, gap, schema, and availability tests
└── day-04-multi-source-no-problem/
    ├── tsconfig.json
    └── src/
        ├── synchronize.ts       # six-algorithm multi-provider alignment
        ├── build.ts             # live concurrent capture + quorum report
        ├── fixture.ts           # labeled three-provider synthetic captures
        ├── demo.ts              # deterministic quorum demo (no credentials)
        └── synchronize.test.ts  # consensus and provider-loss tests
└── day-05-why-the-5-minute-candle-is-the-worst-way-to-sample/
    ├── tsconfig.json
    └── src/
        ├── compare-bars.ts       # four bar-clock comparison (time, tick-imbalance, volume-imbalance, tick-run)
        ├── build.ts             # live capture + calendar filter + bar comparison
        ├── fixture.ts           # 240-trade synthetic stream with burst pattern
        ├── demo.ts              # deterministic bar comparison demo (no credentials)
        └── compare-bars.test.ts # lineage and merge-guard tests
```

## Quick Start (3 Steps)

### 1. Install dependencies

```bash
npm install
```

### 2. Copy the environment template

```bash
cp .env.example .env
```

Open `.env` and fill in your Alpaca credentials at minimum:

```dotenv
APCA_API_KEY_ID=your_alpaca_key_id
APCA_API_SECRET_KEY=your_alpaca_secret_key
```

If you don't have Alpaca credentials yet, you can still run the tests and demos (see below).

### 3. Run something

Pick any command from the tables below. Tests and demos require **no credentials**.

---

## Day 1 — Bar Construction from a Live Trade Feed

**What it does:** Connects to Alpaca's real-time trade WebSocket, captures individual trades, and builds four types of bars side by side — time bars, tick bars, volume bars, and dollar bars — so you can see how each rule groups the same tape differently.

### Commands

| Command | What it does | Credentials needed? |
|---|---|---|
| `npm run test:article:1` | Runs the unit test with 12 synthetic trades | No |
| `npm run typecheck:article:1` | Type-checks all Day 1 source files | No |
| `npm run article:1` | Live capture from Alpaca + bar comparison report | Yes (Alpaca) |

### Running the live capture

Make sure your `.env` has Alpaca credentials, then:

```bash
npm run article:1
```

You'll see output like:

```
Connecting to Alpaca's IEX trade feed for SPY...
Capturing up to 10,000 trades for 60 seconds.

LIVE CAPTURE
source       Alpaca Market Data WebSocket (iex)
symbol       SPY
trades       1,247 (duration)
...

ONE TAPE, FOUR BAR-CLOSING RULES
rule       threshold            bars  rule  partial   first ticks
time       10s                     6     5        1            2
tick       208 trades              6     6        0          208
volume     20,800 shares           6     6        0          208
dollar     $2,080,000              6     6        0          208

FIRST BAR FROM EACH RULE
time     14:30:00-14:30:10  O 500.12  H 500.18  L 500.10  C 500.15  4,160 sh  interval
tick     14:30:00-14:30:03  O 500.12  H 500.14  L 500.10  C 500.13  4,160 sh  threshold
...
```

### Optional Day 1 settings (in `.env`)

| Variable | Default | Description |
|---|---|---|
| `SYMBOL` | `SPY` | US equity ticker to capture |
| `ALPACA_FEED` | `iex` | Alpaca feed: `iex`, `sip`, or `delayed_sip` |
| `CAPTURE_SECONDS` | `60` | How long to capture (minimum 10) |
| `TIME_BAR_SECONDS` | `10` | Interval for time bars in seconds |
| `MAX_TRADES` | `10000` | Maximum trades to capture |

### Running the unit test (no credentials)

```bash
npm run test:article:1
```

Expected output:

```
Article #1 bar comparison: 12 labeled test trades passed all assertions.
```

### Quick connection check

To verify your Alpaca credentials work without building bars, you can run the peek script directly:

```bash
node --env-file=.env --experimental-strip-types day-01-what-you-need-to-know-before-your-first-price-feed/src/peek.ts
```

This prints the first 5 raw trade messages and disconnects.

---

## Day 2 — Multi-Provider Quality Gate

**What it does:** Scales Day 1 from one provider to three (Alpaca, Finnhub, FMP), normalizes their different event shapes into one contract, and runs a six-stage quality gate: OHLC consistency, Hampel filter, MAD outlier filter, quote geometry, trade lifecycle, and staleness detection.

### Commands

| Command | What it does | Credentials needed? |
|---|---|---|
| `npm run test:article:2` | Runs quality gate tests + provider contract tests | No |
| `npm run typecheck:article:2` | Type-checks all Day 2 source files | No |
| `npm run demo:article:2` | Runs the deterministic failure laboratory | No |
| `npm run article:2` | Live capture from selected provider + quality report | Yes (depends on provider) |

### Running the deterministic demo (no credentials)

This runs the quality gate against labeled synthetic data designed to trigger every stage:

```bash
npm run demo:article:2
```

You'll see a full report covering all six stages with findings like invalid OHLC bars, price outliers, crossed/locked quotes, trade lifecycle corrections, and stale quotes — all from synthetic fixture data.

### Running the live capture

Set `MARKET_DATA_PROVIDER` in `.env` and provide credentials for that provider:

**Using Alpaca (default):**

```dotenv
MARKET_DATA_PROVIDER=alpaca
APCA_API_KEY_ID=your_key
APCA_API_SECRET_KEY=your_secret
```

**Using Finnhub:**

```dotenv
MARKET_DATA_PROVIDER=finnhub
FINNHUB_API_KEY=your_key
```

**Using FMP (paid):**

```dotenv
MARKET_DATA_PROVIDER=fmp
FMP_API_KEY=your_key
FMP_WEBSOCKET_URL=wss://your-cluster-endpoint
FMP_WEBSOCKET_AUTH=login
```

Then run:

```bash
npm run article:2
```

The live command never falls back to synthetic data. If credentials, authentication, entitlement, or market events are unavailable, it exits with an explanation.

### Running the tests (no credentials)

```bash
npm run test:article:2
```

Expected output:

```
Article #2 quality gate: 11 labeled findings across all six stages passed.
Article #2 provider contract: mappings and capability-aware unavailable states passed.
```

### Optional Day 2 settings (in `.env`)

| Variable | Default | Description |
|---|---|---|
| `SYMBOL` | `SPY` | US equity ticker to capture |
| `ALPACA_FEED` | `iex` | Alpaca feed (used only when provider is alpaca) |
| `CAPTURE_SECONDS` | `60` | How long to capture (minimum 10) |
| `MAX_EVENTS` | `25000` | Maximum events (trades + quotes + breaks) |
| `QUALITY_BAR_SECONDS` | `10` | Bar interval for the OHLC consistency stage |
| `MARKET_SESSION_STATE` | `ACTIVE` | `ACTIVE`, `INACTIVE`, or `HALTED` |
| `ACTIVITY_EXPECTED` | `true` | Whether market activity is expected |
| `CLOCK_SYNC_VERIFIED` | `false` | Set to `true` only after verifying host/source clock sync |

---

## Day 3 — Feed Health Check

**What it does:** Reuses the Day 2 provider adapters and runs four health algorithms on the captured data: feed latency monitor, missing-bar gap classifier, schema-drift detector, and point-in-time availability guard. The result is a JSON health report with a top-level verdict of `healthy` or `attention`.

### Commands

| Command | What it does | Credentials needed? |
|---|---|---|
| `npm run test:article:3` | Runs 3 health tests (synchronized, unverified clocks, negative latency) | No |
| `npm run typecheck:article:3` | Type-checks all Day 3 source files | No |
| `npm run demo:article:3` | Runs the deterministic fixture health report | No |
| `npm run article:3` | Live capture from selected provider + health report | Yes (depends on provider) |

### Running the deterministic demo (no credentials)

```bash
npm run demo:article:3
```

This prints a JSON health report from a labeled synthetic fixture with two trades. The verdict is `healthy` because the fixture clocks are synchronized, no events are critical, a trade is present, the schema is unchanged, and no future-available record leaks into the snapshot.

### Running the live capture

Use the same `.env` provider configuration as Day 2, then:

```bash
npm run article:3
```

The live command never falls back to synthetic data. It outputs a JSON health report with latency percentiles, gap classification, schema drift status, and a point-in-time availability snapshot.

### Running the tests (no credentials)

```bash
npm run test:article:3
```

Expected output:

```
# tests 3
# pass 3
# fail 0
```

The three tests verify:
1. A synchronized deterministic capture is healthy
2. Unverified clocks cannot produce a healthy latency verdict
3. A negative observed latency is treated as a clock error

### Optional Day 3 settings (in `.env`)

| Variable | Default | Description |
|---|---|---|
| `SYMBOL` | `SPY` | US equity ticker to capture |
| `CAPTURE_SECONDS` | `30` | How long to capture (minimum 10) |
| `MAX_EVENTS` | `25000` | Maximum events to capture |
| `CLOCK_SYNC_VERIFIED` | `false` | Set `true` only after verifying host/source clock sync |
| `CLOCK_MAX_OFFSET_MS` | `1` | Maximum clock offset in ms (only when `CLOCK_SYNC_VERIFIED=true`) |
| `LATENCY_WARNING_MS` | `250` | Latency warning threshold in ms |
| `LATENCY_CRITICAL_MS` | `1000` | Latency critical threshold in ms |

---

## Day 4 — Multi-Provider Quorum and Synchronization

**What it does:** Captures Alpaca, Finnhub, and FMP concurrently using `Promise.allSettled`, admits each through the Day 3 health check, then runs six synchronization algorithms: previous-tick interpolation, refresh-time sampling, price-source consensus check, linear quote interpolation, exchange-calendar alignment, and asynchronous-return diagnostics.

### Commands

| Command | What it does | Credentials needed? |
|---|---|---|
| `npm run test:article:4` | Runs 2 tests (consensus + provider loss) | No |
| `npm run typecheck:article:4` | Type-checks all Day 4 source files | No |
| `npm run demo:article:4` | Runs the deterministic three-provider fixture | No |
| `npm run article:4` | Live concurrent capture from selected providers + quorum report | Yes (at least 2 providers) |

### Running the deterministic demo (no credentials)

```bash
npm run demo:article:4
```

This prints a JSON synchronization report from a labeled synthetic fixture with three providers (Alpaca, Finnhub, FMP). The consensus status is `consensus` because all three prices agree within the tolerance band.

### Running the live quorum

Day 4 requires **verified clock synchronization** and **at least two successful providers**. Set these in `.env`:

```dotenv
CLOCK_SYNC_VERIFIED=true
CLOCK_MAX_OFFSET_MS=1
MARKET_DATA_PROVIDERS=alpaca,finnhub,fmp

APCA_API_KEY_ID=your_key
APCA_API_SECRET_KEY=your_secret
FINNHUB_API_KEY=your_key
FMP_API_KEY=your_key
FMP_WEBSOCKET_URL=wss://your-cluster
```

Then run:

```bash
npm run article:4
```

If one provider fails but two succeed, the report contains the real failure and continues with the smaller quorum. If fewer than two succeed, it stops. The live command never falls back to fixture data.

### Running the tests (no credentials)

```bash
npm run test:article:4
```

Expected output:

```
# tests 2
# pass 2
# fail 0
```

The two tests verify:
1. Three provider streams form a contract-compatible consensus
2. Provider loss is visible and never replaced by fixture data

### Optional Day 4 settings (in `.env`)

| Variable | Default | Description |
|---|---|---|
| `MARKET_DATA_PROVIDERS` | `alpaca,finnhub,fmp` | Comma-separated providers to capture |
| `SYMBOL` | `SPY` | US equity ticker to capture |
| `CAPTURE_SECONDS` | `30` | How long to capture (minimum 10) |
| `MAX_EVENTS` | `25000` | Maximum events per provider |
| `MAX_SOURCE_AGE_MS` | `5000` | Maximum age in ms for a source observation to be eligible |
| `CLOCK_SYNC_VERIFIED` | `false` | Must be `true` for live Day 4 runs |
| `CLOCK_MAX_OFFSET_MS` | `1` | Maximum clock offset in ms |

---

## Day 5 — Arc 1 Bar-Construction Capstone

**What it does:** Captures one corrected, ordered provider trade lineage, filters it through the Day 4 teaching calendar to keep only regular-session trades, then compares four bar clocks on exactly that input: time bars, tick-imbalance bars, volume-imbalance bars, and tick-run bars.

### Commands

| Command | What it does | Credentials needed? |
|---|---|---|
| `npm run test:article:5` | Runs 2 tests (lineage + merge guard) | No |
| `npm run typecheck:article:5` | Type-checks all Day 5 source files | No |
| `npm run demo:article:5` | Runs the deterministic 240-trade fixture comparison | No |
| `npm run article:5` | Live capture from one provider + bar comparison | Yes (one provider) |

### Running the deterministic demo (no credentials)

```bash
npm run demo:article:5
```

This prints a JSON report comparing all four bar types on 240 synthetic trades with a burst pattern. The fixture uses 30-second time bars so the output stays compact.

### Running the live capture

Choose one provider and configure credentials as in Day 2:

```dotenv
MARKET_DATA_PROVIDER=alpaca
SYMBOL=SPY
CAPTURE_SECONDS=60
MAX_EVENTS=50000
TIME_BAR_SECONDS=300
```

Then run:

```bash
npm run article:5
```

The live command filters trades through the 09:30–16:00 `America/New_York` teaching schedule. If no trades fall inside the configured session, it stops and suggests the deterministic demo. It never falls back to fixture data.

### Running the tests (no credentials)

```bash
npm run test:article:5
```

Expected output:

```
# tests 2
# pass 2
# fail 0
```

The two tests verify:
1. All four clocks consume the same 240-trade lineage (time, tick-imbalance, volume-imbalance, tick-run)
2. Provider tapes cannot be silently merged (mixing Alpaca and Finnhub sources throws an error)

### Optional Day 5 settings (in `.env`)

| Variable | Default | Description |
|---|---|---|
| `SYMBOL` | `SPY` | US equity ticker to capture |
| `CAPTURE_SECONDS` | `60` | How long to capture (minimum 10) |
| `MAX_EVENTS` | `50000` | Maximum events to capture |
| `TIME_BAR_SECONDS` | `300` | Time bar interval in seconds (5 minutes) |

---

## All npm Scripts Reference

| Script | Description | Credentials |
|---|---|---|
| `npm run test:article:1` | Day 1 unit test | No |
| `npm run typecheck:article:1` | Day 1 type check | No |
| `npm run article:1` | Day 1 live capture + bar comparison | Alpaca |
| `npm run test:article:2` | Day 2 quality + provider contract tests | No |
| `npm run typecheck:article:2` | Day 2 type check | No |
| `npm run demo:article:2` | Day 2 deterministic failure lab | No |
| `npm run article:2` | Day 2 live capture + quality gate | Depends on provider |
| `npm run test:article:3` | Day 3 health tests | No |
| `npm run typecheck:article:3` | Day 3 type check | No |
| `npm run demo:article:3` | Day 3 deterministic health demo | No |
| `npm run article:3` | Day 3 live capture + health report | Depends on provider |
| `npm run test:article:4` | Day 4 synchronization tests | No |
| `npm run typecheck:article:4` | Day 4 type check | No |
| `npm run demo:article:4` | Day 4 deterministic quorum demo | No |
| `npm run article:4` | Day 4 live concurrent capture + quorum report | At least 2 providers |
| `npm run test:article:5` | Day 5 bar comparison tests | No |
| `npm run typecheck:article:5` | Day 5 type check | No |
| `npm run demo:article:5` | Day 5 deterministic bar comparison | No |
| `npm run article:5` | Day 5 live capture + four-bar comparison | One provider |

---

## Environment Variables Reference

All variables are optional unless marked **required**. Copy `.env.example` to `.env` and fill in what you need.

### Provider Selection

| Variable | Default | Description |
|---|---|---|
| `MARKET_DATA_PROVIDER` | `alpaca` | `alpaca`, `finnhub`, or `fmp` |

### Alpaca Credentials (Day 1 & 2)

| Variable | Required for | Description |
|---|---|---|
| `APCA_API_KEY_ID` | Alpaca runs | Your Alpaca API key ID |
| `APCA_API_SECRET_KEY` | Alpaca runs | Your Alpaca API secret key |

### Finnhub Credentials (Day 2)

| Variable | Required for | Description |
|---|---|---|
| `FINNHUB_API_KEY` | Finnhub runs | Your Finnhub API key |

### FMP Credentials (Day 2, paid plan)

| Variable | Required for | Description |
|---|---|---|
| `FMP_API_KEY` | FMP runs | Your FMP API key |
| `FMP_WEBSOCKET_URL` | FMP runs | wss:// cluster URL from your paid account |
| `FMP_WEBSOCKET_AUTH` | FMP runs | `login` (default) or `query` |

### Capture Settings

| Variable | Default | Description |
|---|---|---|
| `SYMBOL` | `SPY` | US equity ticker |
| `ALPACA_FEED` | `iex` | `iex`, `sip`, or `delayed_sip` |
| `CAPTURE_SECONDS` | `60` | Capture duration (min 10) |
| `MAX_TRADES` | `10000` | Day 1 max trades |
| `MAX_EVENTS` | `25000` | Day 2 max events |

### Day 1 Bar Settings

| Variable | Default | Description |
|---|---|---|
| `TIME_BAR_SECONDS` | `10` | Time bar interval in seconds |

### Day 2 Quality Gate Settings

| Variable | Default | Description |
|---|---|---|
| `QUALITY_BAR_SECONDS` | `10` | Bar interval for OHLC stage |
| `MARKET_SESSION_STATE` | `ACTIVE` | `ACTIVE`, `INACTIVE`, or `HALTED` |
| `ACTIVITY_EXPECTED` | `true` | Whether market activity is expected |
| `CLOCK_SYNC_VERIFIED` | `false` | Set `true` only after verifying clock sync |

### Day 3 Health Check Settings

| Variable | Default | Description |
|---|---|---|
| `CLOCK_MAX_OFFSET_MS` | `1` | Maximum clock offset in ms (only when `CLOCK_SYNC_VERIFIED=true`) |
| `LATENCY_WARNING_MS` | `250` | Latency warning threshold in ms |
| `LATENCY_CRITICAL_MS` | `1000` | Latency critical threshold in ms |

### Day 4 Multi-Source Settings

| Variable | Default | Description |
|---|---|---|
| `MARKET_DATA_PROVIDERS` | `alpaca,finnhub,fmp` | Comma-separated providers to capture concurrently |
| `MAX_SOURCE_AGE_MS` | `5000` | Maximum age in ms for source eligibility |

---

## Troubleshooting

### "Missing Alpaca credentials"

Your `.env` file is missing `APCA_API_KEY_ID` or `APCA_API_SECRET_KEY`. Copy `.env.example` to `.env` and fill them in.

### "Alpaca returned no SPY trades"

The market may be closed or the feed entitlement may not cover the symbol. Try again during US market hours (9:30–16:00 ET, Monday–Friday). IEX feed works with a free Alpaca account.

### "Finnhub returned no trades"

Same reason — Finnhub's free WebSocket trades endpoint only delivers data during active market hours. One API key can open one WebSocket connection at a time.

### PowerShell execution policy error on Windows

If `npm` is blocked by PowerShell, run commands through `cmd`:

```bash
cmd /c npm install
cmd /c npm run test:article:1
```

### Node version too old

This project uses `--experimental-strip-types` which requires Node 22+. Check your version:

```bash
node --version
```

---

## Key Concepts

- **Trades vs candles:** A trade feed delivers individual market events. Bars (candles) are constructed by applying a closing rule to those events. The same tape produces different bars depending on the rule.
- **Bar construction rules:** Time bars close on a clock interval. Tick bars close after N trades. Volume bars close after N shares. Dollar bars close after N dollars of notional.
- **Provider normalization:** Each provider (Alpaca, Finnhub, FMP) sends data in a different shape. The adapter layer normalizes them into one contract while preserving each provider's capabilities.
- **Quality gate:** Six stages that clean and validate market data: OHLC consistency, causal Hampel filter, MAD outlier filter, quote geometry (crossed/locked markets), trade lifecycle (duplicates, corrections, cancels), and staleness detection.
- **Capability-aware checks:** The quality gate only runs a stage if the provider supplies enough evidence. For example, Finnhub doesn't supply quotes, so quote geometry and staleness are reported as "unavailable" rather than failing.
- **Feed health:** A separate set of checks that answer "is the feed usable right now?" — latency (only when clocks are comparable), gap classification (why is an interval empty?), schema drift (did the normalized contract change?), and point-in-time availability (was a value knowable at the time?).
- **Multi-provider quorum:** Capturing multiple providers concurrently and aligning their observations. Previous-tick interpolation carries the last price forward with staleness tracking. Refresh-time sampling waits for every stream to advance. Consensus checks whether prices agree within a robust band. Calendar alignment labels which events belong to a regular session. Asynchronous-return diagnostics report interval overlap geometry without estimating covariance.
- **Information-driven bars:** Time bars close on a clock interval. Tick-imbalance bars close when signed tick pressure crosses a frozen threshold. Volume-imbalance bars weight ticks by trade size. Tick-run bars track directional persistence. Each rule samples the same tape differently — the choice is explicit, not neutral.

## References

- [The FinTech Builder](https://thefintechbuilder.com/)
- [`fintech-algorithms` on npm](https://www.npmjs.com/package/fintech-algorithms)
- [Alpaca Market Data Docs](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data)
- [Finnhub WebSocket Docs](https://api.finnhub.io/docs/api/websocket-trades)
- [FMP WebSocket Docs](https://site.financialmodelingprep.com/developer/docs/websocket-api)

## License

MIT
