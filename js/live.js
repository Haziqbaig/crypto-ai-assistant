/**
 * live.js — Real-time price streaming for CryptoSage AI.
 * Uses the Binance combined miniTicker WebSocket stream (all symbols, 1s cadence).
 * Elements opt in via data attributes:
 *   data-live-price="BTCUSDT"  → textContent kept in sync with live price (+flash)
 *   data-live-pct="BTCUSDT"    → innerHTML kept in sync with live 24h % change
 * App calls Live.scan() after each render to (re)collect elements.
 */
const Live = (() => {
  // Primary stream host is geo-blocked (451) in some regions; the data-stream.binance.vision
  // mirror is tried first, with the main host as fallback. A failing host is skipped next time.
  const WS_HOSTS = ['wss://data-stream.binance.vision/ws/!miniTicker@arr', 'wss://stream.binance.com:9443/ws/!miniTicker@arr'];
  let hostIdx = 0;
  let ws = null;
  let retry = 1000;
  let priceEls = {};
  let pctEls = {};

  /** Re-scan the DOM for live-bound elements. Call after every render. */
  function scan() {
    priceEls = {}; pctEls = {};
    document.querySelectorAll('[data-live-price]').forEach(el => {
      (priceEls[el.dataset.livePrice] = priceEls[el.dataset.livePrice] || []).push(el);
    });
    document.querySelectorAll('[data-live-pct]').forEach(el => {
      (pctEls[el.dataset.livePct] = pctEls[el.dataset.livePct] || []).push(el);
    });
    ensureSocket();
  }

  function ensureSocket() {
    if (ws) return;
    if (!Object.keys(priceEls).length && !Object.keys(pctEls).length) return;
    connect();
  }

  function connect() {
    try {
      const url = WS_HOSTS[hostIdx % WS_HOSTS.length];
      ws = new WebSocket(url);
      ws.onopen = () => { retry = 1000; };
      ws.onmessage = (ev) => {
        let arr;
        try { arr = JSON.parse(ev.data); } catch { return; }
        if (!Array.isArray(arr)) return;
        for (const t of arr) {
          const pe = priceEls[t.s];
          const ce = pctEls[t.s];
          if (pe) {
            const price = parseFloat(t.c);
            for (const el of pe) {
              const prev = parseFloat(el.dataset.v);
              if (prev === price) continue;
              el.dataset.v = price;
              el.textContent = UI.money(price, 'usd');
              if (!isNaN(prev)) {
                el.classList.remove('flash-up', 'flash-down');
                void el.offsetWidth; // restart CSS animation
                el.classList.add(price > prev ? 'flash-up' : 'flash-down');
              }
            }
          }
          if (ce) {
            const open = parseFloat(t.o), close = parseFloat(t.c);
            if (open > 0) {
              const pct = (close - open) / open * 100;
              for (const el of ce) el.innerHTML = UI.pct(pct);
            }
          }
        }
      };
      ws.onclose = () => { ws = null; hostIdx++; setTimeout(ensureSocket, retry); retry = Math.min(retry * 2, 30000); };
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch { ws = null; }
  }

  return { scan };
})();
