# CryptoSage AI 🔮

Premium, dark-mode-first crypto dashboard with client-side technical analysis and rule-based AI-style recommendations. Fully static — runs entirely in the browser, deployed on GitHub Pages.

**Live:** https://haziqbaig.github.io/crypto-ai-assistant/

## Features (Phase 1)
- **Dashboard** — total market cap, 24h change, BTC dominance, market sentiment, Fear & Greed gauge with 30-day history, top gainers/losers, trending coins
- **Watchlist** — default BTC/ETH/SOL/SUI/DOGE/LINK/XRP/ADA, add/remove via search (localStorage). Per coin: price, 24h/7d %, volume, market cap, RSI(14), MACD status, MA trend, support/resistance, AI rating badge
- **Indicator engine** — RSI(14), MACD(12,26,9), EMA20/50/200, SMA, Bollinger Bands, swing support/resistance (unit-tested: `node test/indicators.test.js`)
- **Recommendation engine** — rule-based scoring → Strong Buy … Strong Sell with confidence, reasons, risk, target/stop, entry/exit guidance
- **Coin detail** — Chart.js price chart (24h/7d/30d/90d/1y), all indicators, ATH/ATL, supply, links, AI card
- **Search** any coin (CoinGecko /search)
- **Settings** — currency USD/EUR/PKR, dark/light theme (persisted)

## Data
CoinGecko public API + Alternative.me Fear & Greed (free, no keys). Responses cached in localStorage (60s–1h TTL) with stale-fallback and retry to respect rate limits.

> **Binance access:** live prices, charts and 24h tickers use the keyless `data-api.binance.vision` mirror **first** (`api.binance.com` returns HTTP 451 in geo-restricted regions such as the US), with automatic fallback. Blocked hosts are detected at runtime and skipped for the rest of the session.

## Alerts email (privacy)
The 24/7 alert watcher reads the notification address from the **`ALERT_EMAIL`** GitHub Actions secret (`Settings → Secrets and variables → Actions`). Do **not** commit your email in `alerts.json` — leave `"email": ""` and set the secret instead.

## Architecture
```
index.html        — shell, Tailwind CDN config, glassmorphism styles
js/api.js         — data layer (cached fetch)
js/indicators.js  — pure technical-indicator functions
js/recommend.js   — rule-based recommendation engine
js/ui.js          — reusable UI components/helpers
js/app.js         — routing, views, state
test/             — indicator math tests
```

> Analysis is rule-based technical signal aggregation — **not financial advice**.
