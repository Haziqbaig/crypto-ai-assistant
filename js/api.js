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

  /**
   * Fetch JSON with cache + retry. Falls back to stale cache on failure.
   * @param {string} url
   * @param {string} cacheKey
   * @param {number} ttl
   */
  async function cachedFetch(url, cacheKey, ttl = DEFAULT_TTL) {
    const fresh = readCache(cacheKey, ttl);
    if (fresh) return fresh;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429) throw new Error('rate-limited');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        writeCache(cacheKey, data);
        return data;
      } catch (e) {
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
        else {
          const stale = readCache(cacheKey, Infinity, true);
          if (stale) return stale;
          throw e;
        }
      }
    }
  }

  return {
    /** Global market stats. */
    global: () => cachedFetch(`${CG}/global`, 'global', 120_000),
    /** Trending coins. */
    trending: () => cachedFetch(`${CG}/search/trending`, 'trending', 300_000),
    /** Markets list for coin ids (batched) in a vs currency. */
    markets: (ids, vs = 'usd') =>
      cachedFetch(`${CG}/coins/markets?vs_currency=${vs}&ids=${ids.join(',')}&price_change_percentage=24h,7d&sparkline=false`,
        `markets_${vs}_${ids.slice().sort().join(',')}`, 60_000),
    /** Top N coins by market cap. */
    topMarkets: (vs = 'usd', n = 50) =>
      cachedFetch(`${CG}/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${n}&price_change_percentage=24h,7d`,
        `top_${vs}_${n}`, 60_000),
    /** Daily market chart (prices, volumes) for N days. */
    marketChart: (id, days = 90, vs = 'usd') =>
      cachedFetch(`${CG}/coins/${id}/market_chart?vs_currency=${vs}&days=${days}${days > 1 ? '&interval=daily' : ''}`,
        `chart_${id}_${vs}_${days}`, days <= 1 ? 120_000 : 600_000),
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
