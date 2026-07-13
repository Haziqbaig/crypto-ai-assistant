/**
 * api.js — Data layer for CryptoSage AI.
 * CoinGecko public API + Alternative.me Fear & Greed.
 * All responses cached in localStorage with per-endpoint TTL to respect rate limits.
 */
const API = (() => {
  const CG = 'https://api.coingecko.com/api/v3';
  const CACHE_PREFIX = 'cs_cache_';
  const DEFAULT_TTL = 60_000; // 60s

  /** Read cached value if fresh (or return stale copy via allowStale). */
  function readCache(key, ttl, allowStale = false) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < ttl) return d;
      return allowStale ? d : null;
    } catch { return null; }
  }

  function writeCache(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data })); }
    catch (e) { /* quota — prune old caches */ pruneCache(); }
  }

  function pruneCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
  }

  // ---- Global throttled request queue (CoinGecko free tier ≈ 5-15 req/min) ----
  const MIN_SPACING = 2200;       // ms between CoinGecko requests
  const RATE_LIMIT_COOLDOWN = 15_000; // wait after a 429 before next request
  let queueTail = Promise.resolve();
  let nextAllowedAt = 0;

  /** Serialize all CoinGecko requests with min spacing + 429 cooldown. */
  function enqueue(fn) {
    const run = queueTail.then(async () => {
      const wait = nextAllowedAt - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      return fn();
    });
    // keep the chain alive even on errors
    queueTail = run.catch(() => {});
    return run;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /**
   * Fetch JSON with cache, global throttle, 429 backoff + retry.
   * Falls back to stale cache on failure.
   * @param {string} url
   * @param {string} cacheKey
   * @param {number} ttl
   */
  async function cachedFetch(url, cacheKey, ttl = DEFAULT_TTL) {
    const fresh = readCache(cacheKey, ttl);
    if (fresh) return fresh;
    return enqueue(async () => {
      // re-check cache: an identical queued request may have already filled it
      const again = readCache(cacheKey, ttl);
      if (again) return again;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url);
          if (res.status === 429) {
            nextAllowedAt = Date.now() + RATE_LIMIT_COOLDOWN;
            throw new Error('rate-limited');
          }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          writeCache(cacheKey, data);
          nextAllowedAt = Date.now() + MIN_SPACING;
          return data;
        } catch (e) {
          if (attempt < 1 && e.message !== 'rate-limited') {
            await sleep(1500);
          } else {
            // fail fast to stale cache (UI has its own Binance fallbacks)
            const stale = readCache(cacheKey, Infinity, true);
            if (stale) return stale;
            throw e;
          }
        }
      }
    });
  }

  // ---- Binance public API (very generous limits: ~1200 req/min) ----
  const BINANCE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];

  /**
   * Fetch daily/hourly klines from Binance for SYMBOLUSDT and adapt to the
   * CoinGecko market_chart shape: { prices: [[t, close]], total_volumes: [[t, vol]] }.
   * Not queued — Binance limits are high enough for direct calls.
   * @param {string} symbol e.g. 'btc'
   * @param {number} days
   */
  async function binanceChart(symbol, days = 90) {
    const pair = symbol.toUpperCase() + 'USDT';
    // Intraday string ranges: '1h' → 1m candles, '4h' → 5m, '12h' → 15m
    let interval, limit, ttl;
    if (typeof days === 'string' && days.endsWith('h')) {
      const h = parseInt(days, 10) || 1;
      if (h <= 1) { interval = '1m'; limit = 60; }
      else if (h <= 4) { interval = '5m'; limit = 48; }
      else { interval = '15m'; limit = Math.min(Math.ceil(h * 4), 96); }
      ttl = 55_000;
    } else {
      interval = days <= 1 ? '1h' : '1d';
      limit = days <= 1 ? 24 : Math.min(days, 1000);
      ttl = days <= 1 ? 120_000 : 600_000;
    }
    const cacheKey = `bn2_${pair}_${interval}_${limit}`;
    const fresh2 = readCache(cacheKey, ttl);
    if (fresh2) return fresh2;
    let lastErr;
    for (const host of BINANCE_HOSTS) {
      try {
        const res = await fetch(`${host}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const k = await res.json();
        const data = {
          prices: k.map(r => [r[6], parseFloat(r[4])]),
          total_volumes: k.map(r => [r[6], parseFloat(r[7])]), // quote-asset volume (USDT)
          candles: k.map(r => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] })), // OHLC for candlestick charts
        };
        writeCache(cacheKey, data);
        return data;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('binance unavailable');
  }

  /**
   * Chart data with multi-API fallback: Binance first (USD/USDT), CoinGecko second.
   * @param {string} id CoinGecko id
   * @param {string|null} symbol ticker symbol (for Binance)
   * @param {number} days
   * @param {string} vs currency
   */
  async function chart(id, symbol, days = 90, vs = 'usd') {
    if (symbol && vs === 'usd') {
      try { return await binanceChart(symbol, days); } catch { /* fall through */ }
    }
    // CoinGecko has no minute-level endpoint on the free tier — use 1-day (5-min points)
    const cgDays = (typeof days === 'string' && days.endsWith('h')) ? 1 : days;
    return marketChartCG(id, cgDays, vs);
  }

  /** CoinGecko OHLC (fallback candles when Binance lacks the pair). */
  async function ohlcCG(id, days = 90, vs = 'usd') {
    const d = days <= 1 ? 1 : days <= 7 ? 7 : days <= 30 ? 30 : days <= 90 ? 90 : 365;
    const raw = await cachedFetch(`${CG}/coins/${id}/ohlc?vs_currency=${vs}&days=${d}`,
      `ohlc_${id}_${vs}_${d}`, d <= 1 ? 120_000 : 600_000);
    return raw.map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));
  }

  function marketChartCG(id, days = 90, vs = 'usd') {
    return cachedFetch(`${CG}/coins/${id}/market_chart?vs_currency=${vs}&days=${days}${days > 1 ? '&interval=daily' : ''}`,
      `chart_${id}_${vs}_${days}`, days <= 1 ? 120_000 : 600_000);
  }

  /**
   * Binance 24h tickers for a set of symbols → CoinGecko-markets-like rows.
   * Used as a fallback when CoinGecko /coins/markets is rate-limited.
   * (No market cap / 7d data from Binance — those fields are null.)
   * @param {Array<{id:string,symbol:string,name:string}>} coins
   */
  async function binanceTickers(coins) {
    const pairs = coins.map(c => `"${c.symbol.toUpperCase()}USDT"`).join(',');
    let lastErr;
    for (const host of BINANCE_HOSTS) {
      try {
        const res = await fetch(`${host}/api/v3/ticker/24hr?symbols=[${pairs}]`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const tickers = await res.json();
        const bySym = Object.fromEntries(tickers.map(t => [t.symbol, t]));
        return coins.map(c => {
          const t = bySym[c.symbol.toUpperCase() + 'USDT'];
          if (!t) return null;
          return {
            id: c.id, symbol: c.symbol, name: c.name,
            image: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530/128/color/${c.symbol.toLowerCase()}.png`,
            current_price: parseFloat(t.lastPrice),
            price_change_percentage_24h: parseFloat(t.priceChangePercent),
            price_change_percentage_24h_in_currency: parseFloat(t.priceChangePercent),
            price_change_percentage_7d_in_currency: null,
            total_volume: parseFloat(t.quoteVolume),
            market_cap: null,
          };
        }).filter(Boolean);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('binance unavailable');
  }

  /**
   * Coinpaprika tickers → CoinGecko-markets-like rows (fallback for Markets tab).
   * Free, keyless, generous limits. Returns top coins by rank, paged client-side.
   */
  async function paprikaMarkets(perPage = 25, page = 1) {
    const cacheKey = 'paprika_tickers';
    let all = readCache(cacheKey, 120_000);
    if (!all) {
      const res = await fetch('https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=500');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      all = await res.json();
      writeCache(cacheKey, all);
    }
    const start = (page - 1) * perPage;
    return all.slice(start, start + perPage).map(t => ({
      id: null, // paprika id ≠ coingecko id — use pk: prefix route
      pk_id: t.id,
      symbol: t.symbol.toLowerCase(),
      name: t.name,
      market_cap_rank: t.rank,
      image: `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530/128/color/${t.symbol.toLowerCase()}.png`,
      current_price: t.quotes.USD.price,
      price_change_percentage_24h: t.quotes.USD.percent_change_24h,
      price_change_percentage_24h_in_currency: t.quotes.USD.percent_change_24h,
      price_change_percentage_7d_in_currency: t.quotes.USD.percent_change_7d,
      total_volume: t.quotes.USD.volume_24h,
      market_cap: t.quotes.USD.market_cap,
    }));
  }

  return {
    chart,
    ohlcCG,
    binanceTickers,
    paprikaMarkets,
    /** Global market stats. */
    global: () => cachedFetch(`${CG}/global`, 'global', 120_000),
    /** Trending coins. */
    trending: () => cachedFetch(`${CG}/search/trending`, 'trending', 300_000),
    /** Markets list for coin ids (batched) in a vs currency. */
    markets: (ids, vs = 'usd') =>
      cachedFetch(`${CG}/coins/markets?vs_currency=${vs}&ids=${ids.join(',')}&price_change_percentage=24h,7d&sparkline=false`,
        `markets_${vs}_${ids.slice().sort().join(',')}`, 60_000),
    /** Paginated markets page by market cap. */
    marketsPage: (vs = 'usd', perPage = 25, page = 1) =>
      cachedFetch(`${CG}/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&price_change_percentage=24h,7d`,
        `mktpage_${vs}_${perPage}_${page}`, 60_000),
    /** Top N coins by market cap. */
    topMarkets: (vs = 'usd', n = 50) =>
      cachedFetch(`${CG}/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${n}&price_change_percentage=24h,7d`,
        `top_${vs}_${n}`, 60_000),
    /** Daily market chart (prices, volumes) for N days — CoinGecko direct. */
    marketChart: marketChartCG,
    /** Full coin detail. */
    coin: (id) =>
      cachedFetch(`${CG}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
        `coin_${id}`, 300_000),
    /** Search coins by query. */
    search: (q) => cachedFetch(`${CG}/search?query=${encodeURIComponent(q)}`, `search_${q.toLowerCase()}`, 3_600_000),
    /** Fear & Greed index, last 30 days. */
    fearGreed: () => cachedFetch('https://api.alternative.me/fng/?limit=30', 'fng', 3_600_000),
  };
})();
