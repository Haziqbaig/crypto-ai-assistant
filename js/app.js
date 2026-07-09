/**
 * app.js — Main application: routing, views, state for CryptoSage AI.
 */
const App = (() => {
  const DEFAULT_WATCHLIST = ['bitcoin','ethereum','solana','sui','dogecoin','chainlink','ripple','cardano'];
  /** Known coinId → {symbol,name} (lets Binance fallback work without CoinGecko). */
  const COIN_META = JSON.parse(localStorage.getItem('cs_coin_meta') || 'null') || {
    bitcoin:{symbol:'btc',name:'Bitcoin'}, ethereum:{symbol:'eth',name:'Ethereum'},
    solana:{symbol:'sol',name:'Solana'}, sui:{symbol:'sui',name:'Sui'},
    dogecoin:{symbol:'doge',name:'Dogecoin'}, chainlink:{symbol:'link',name:'Chainlink'},
    ripple:{symbol:'xrp',name:'XRP'}, cardano:{symbol:'ada',name:'Cardano'},
  };
  function saveCoinMeta() { try { localStorage.setItem('cs_coin_meta', JSON.stringify(COIN_META)); } catch {} }
  const state = {
    view: 'dashboard',
    coinId: null,
    watchlist: JSON.parse(localStorage.getItem('cs_watchlist') || 'null') || DEFAULT_WATCHLIST.slice(),
    currency: localStorage.getItem('cs_currency') || 'usd',
    theme: localStorage.getItem('cs_theme') || 'dark',
    fng: null,
    chart: null,
    range: '90',
    symbols: {}, // coinId → ticker symbol (for Binance chart fallback)
    mkPage: 1, mkPerPage: 25, // markets pagination
    wlPage: 1, // watchlist pagination
    portfolio: JSON.parse(localStorage.getItem('cs_portfolio') || '[]'),
    pfChart: null,
  };
  function savePortfolio() { localStorage.setItem('cs_portfolio', JSON.stringify(state.portfolio)); }
  const alertsStore = JSON.parse(localStorage.getItem('cs_alerts') || 'null') || { alerts: [], history: [], pfUp10: false, pfDown5: false, pfBase: null };
  function saveAlerts() { localStorage.setItem('cs_alerts', JSON.stringify(alertsStore)); }

  const $ = (s) => document.querySelector(s);
  const viewEl = () => $('#view');

  // Render token: prevents an older in-flight render from overwriting a newer view
  let renderSeq = 0;
  const newRender = () => ++renderSeq;
  const isCurrent = (tok) => tok === renderSeq;

  function saveWatchlist() { localStorage.setItem('cs_watchlist', JSON.stringify(state.watchlist)); }

  function applyTheme() {
    document.documentElement.classList.toggle('light', state.theme === 'light');
    document.documentElement.classList.toggle('dark', state.theme !== 'light');
  }

  /** Navigate between views. */
  function nav(view, coinId = null) {
    newRender();
    state.view = view; state.coinId = coinId;
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('tab-active', b.dataset.nav === view));
    if (view === 'dashboard') renderDashboard();
    else if (view === 'markets') renderMarkets();
    else if (view === 'watchlist') renderWatchlist();
    else if (view === 'portfolio') renderPortfolio();
    else if (view === 'alerts') renderAlerts();
    else if (view === 'news') renderNews();
    else if (view === 'settings') renderSettings();
    else if (view === 'coin') renderCoin(coinId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function getFng() {
    if (state.fng) return state.fng;
    try {
      const d = await API.fearGreed();
      state.fng = d.data.map(x => ({ v: +x.value, label: x.value_classification, t: +x.timestamp }));
    } catch { state.fng = []; }
    return state.fng;
  }

  /* ---------------- Dashboard ---------------- */
  async function renderDashboard() {
    const tok = renderSeq;
    viewEl().innerHTML = `<div class="grid gap-4 md:grid-cols-3">${UI.skeletonCard(3).repeat ? '' : ''}
      ${UI.skeletonCard(3)}${UI.skeletonCard(3)}${UI.skeletonCard(3)}</div>
      <div class="mt-4 grid gap-4 md:grid-cols-3">${UI.skeletonCard(6)}${UI.skeletonCard(6)}${UI.skeletonCard(6)}</div>`;
    try {
      // Partial-tolerant load: each section fails independently
      const [globalR, fngR, topR, trendingR] = await Promise.allSettled([
        API.global(), getFng(), API.topMarkets(state.currency, 50), API.trending()
      ]);
      if (globalR.status === 'rejected' && topR.status === 'rejected' && fngR.status === 'rejected') {
        throw new Error('all sources failed');
      }
      const g = globalR.status === 'fulfilled' ? globalR.value.data : null;
      const fng = fngR.status === 'fulfilled' ? fngR.value : [];
      const top = topR.status === 'fulfilled' ? topR.value : [];
      const trending = trendingR.status === 'fulfilled' ? trendingR.value : { coins: [] };
      if (!isCurrent(tok)) return; // user navigated away while loading
      const cur = state.currency;
      const mcap = g ? g.total_market_cap[cur] : null;
      const mcapChange = g ? g.market_cap_change_percentage_24h_usd : null;
      const btcDom = g ? g.market_cap_percentage.btc : null;
      const fngNow = fng[0] || { v: 50, label: 'Neutral' };
      const sentiment = fngNow.v <= 25 ? 'Extreme Fear' : fngNow.v <= 45 ? 'Fear' : fngNow.v <= 55 ? 'Neutral' : fngNow.v <= 75 ? 'Greed' : 'Extreme Greed';

      const sorted24 = top.filter(c => c.price_change_percentage_24h != null);
      const gainers = [...sorted24].sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0,5);
      const losers = [...sorted24].sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0,5);

      const miniHist = fng.slice(0, 30).reverse();
      const histBars = miniHist.map(d => {
        const c = d.v <= 25 ? '#f43f5e' : d.v <= 45 ? '#fb923c' : d.v <= 55 ? '#facc15' : d.v <= 75 ? '#a3e635' : '#34d399';
        return `<div title="${d.label}: ${d.v}" style="height:${Math.max(8, d.v * 0.5)}px;background:${c}" class="w-1.5 rounded-sm opacity-80"></div>`;
      }).join('');

      const coinRow = (c) => `
        <div class="flex items-center gap-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg px-2 transition" onclick="App.nav('coin','${c.id}')">
          <img src="${c.image}" class="w-6 h-6 rounded-full" alt="">
          <div class="flex-1 min-w-0"><div class="text-sm text-head font-medium truncate">${c.name}</div>
          <div class="text-xs text-dim uppercase">${c.symbol}</div></div>
          <div class="text-right"><div class="text-sm text-head">${UI.money(c.current_price, cur)}</div>
          <div class="text-xs">${UI.pct(c.price_change_percentage_24h)}</div></div>
        </div>`;

      const trendRow = (t) => `
        <div class="flex items-center gap-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg px-2 transition" onclick="App.nav('coin','${t.item.id}')">
          <img src="${t.item.small}" class="w-6 h-6 rounded-full" alt="">
          <div class="flex-1 min-w-0"><div class="text-sm text-head font-medium truncate">${t.item.name}</div>
          <div class="text-xs text-dim uppercase">${t.item.symbol}</div></div>
          <div class="text-xs text-dim">#${t.item.market_cap_rank ?? '—'}</div>
        </div>`;

      viewEl().innerHTML = `
      <div class="fade-in space-y-4">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">Total Market Cap</div>
            <div class="font-display text-2xl font-bold text-head">${UI.money(mcap, cur, {compact:true})}</div>
            <div class="text-sm mt-1">${UI.pct(mcapChange)} <span class="text-dim text-xs">24h</span></div>
          </div>
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">BTC Dominance</div>
            <div class="font-display text-2xl font-bold text-head">${btcDom != null ? btcDom.toFixed(1) + '%' : '—'}</div>
            <div class="text-sm mt-1 text-dim text-xs">ETH ${g?.market_cap_percentage?.eth?.toFixed(1) ?? '—'}%</div>
          </div>
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">Market Sentiment</div>
            <div class="font-display text-2xl font-bold text-head">${sentiment}</div>
            <div class="text-sm mt-1 text-dim text-xs">Fear & Greed: ${fngNow.v}/100</div>
          </div>
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">Active Coins</div>
            <div class="font-display text-2xl font-bold text-head">${g ? g.active_cryptocurrencies.toLocaleString() : '—'}</div>
            <div class="text-sm mt-1 text-dim text-xs">${g ? g.markets + ' markets' : 'data temporarily unavailable'}</div>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <div class="glass p-5">
            <div class="font-display font-semibold text-head mb-2">Fear & Greed Index</div>
            ${UI.fngGauge(fngNow.v, fngNow.label)}
            <div class="mt-3">
              <div class="text-[10px] text-dim uppercase tracking-wider mb-1.5">Last 30 days</div>
              <div class="flex items-end gap-[3px] h-14">${histBars}</div>
            </div>
          </div>
          <div class="glass p-5">
            <div class="font-display font-semibold text-head mb-2">🚀 Top Gainers <span class="text-xs text-dim font-normal">(24h, top 50)</span></div>
            ${gainers.length ? gainers.map(coinRow).join('') : '<div class="text-xs text-dim py-4">Temporarily unavailable — <button class="text-cyan-400 underline" onclick="App.nav(\'dashboard\')">retry</button></div>'}
          </div>
          <div class="glass p-5">
            <div class="font-display font-semibold text-head mb-2">📉 Top Losers <span class="text-xs text-dim font-normal">(24h, top 50)</span></div>
            ${losers.length ? losers.map(coinRow).join('') : '<div class="text-xs text-dim py-4">Temporarily unavailable — <button class="text-cyan-400 underline" onclick="App.nav(\'dashboard\')">retry</button></div>'}
          </div>
        </div>

        <div class="glass p-5">
          <div class="font-display font-semibold text-head mb-2">🔥 Trending on CoinGecko</div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
            ${trending.coins.length ? trending.coins.slice(0, 8).map(trendRow).join('') : '<div class="text-xs text-dim py-2">Temporarily unavailable</div>'}
          </div>
        </div>

        <div class="glass p-5" id="aiInsights">
          <div class="flex items-center justify-between mb-2">
            <div class="font-display font-semibold text-head">🧠 AI Insights <span class="text-xs text-dim font-normal">(rule-based)</span></div>
            <button onclick="App.regenInsights()" class="px-3 py-1.5 rounded-lg text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">↻ Regenerate</button>
          </div>
          <ul id="aiInsightsList" class="space-y-1.5 text-sm"><li>${UI.skeleton('h-4','w-2/3')}</li><li>${UI.skeleton('h-4','w-1/2')}</li></ul>
          <div class="mt-2 text-[10px] text-dim">Generated from cached market data — not financial advice.</div>
        </div>
      </div>`;
      renderInsights({ g, fngNow, top, tok });
    } catch (e) {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load market data. CoinGecko may be rate-limiting.', "App.nav('dashboard')");
    }
  }

  /* ---------------- AI Insights (rule-based) ---------------- */
  let lastInsightCtx = null;
  async function renderInsights(ctx) {
    if (ctx) lastInsightCtx = ctx;
    const c = lastInsightCtx;
    const list = document.getElementById('aiInsightsList');
    if (!list || !c) return;
    const bullets = [];
    try {
      const fng = await getFng().catch(() => []);
      const fngNow = fng[0] || c.fngNow || null;
      // BTC & ETH trend from cached charts (Binance-first, already cached from watchlist/coin views)
      for (const [id, sym, label] of [['bitcoin','btc','Bitcoin'], ['ethereum','eth','Ethereum']]) {
        try {
          const chart = await API.chart(id, sym, 90, 'usd');
          const ind = Indicators.analyze(chart.prices.map(p => p[1]), chart.total_volumes.map(v => v[1]));
          const rec = Recommend.recommend(ind, fngNow?.v ?? null);
          bullets.push(`<b>${label}</b> is trading ${ind.maTrend === 'up' ? 'above' : 'below'} its 50-day EMA with RSI ${ind.rsi?.toFixed(0) ?? '—'} and ${ind.macd.momentum} MACD momentum — rule-based rating: <b>${rec.rating}</b>.`);
        } catch {}
      }
      if (fngNow?.v != null) {
        const v = fngNow.v;
        bullets.push(`Fear & Greed sits at <b>${v}/100 (${fngNow.label})</b> — ${v <= 25 ? 'extreme fear has historically preceded local bottoms, but confirm with trend.' : v <= 45 ? 'cautious sentiment; watch for trend confirmation before adding risk.' : v <= 55 ? 'neutral sentiment; the market lacks a strong directional bias.' : v <= 75 ? 'greed is building; consider tightening stop levels.' : 'extreme greed often marks overheated conditions — pullback risk is elevated.'}`);
      }
      if (c.g?.market_cap_percentage?.btc != null) {
        const dom = c.g.market_cap_percentage.btc;
        bullets.push(`BTC dominance is <b>${dom.toFixed(1)}%</b> — ${dom >= 55 ? 'capital is concentrated in Bitcoin; altcoins typically underperform in this regime.' : dom >= 48 ? 'a balanced regime between Bitcoin and altcoins.' : 'lower dominance favors altcoin rotation, but with higher volatility.'}`);
      }
      if (c.g?.market_cap_change_percentage_24h_usd != null) {
        const mc = c.g.market_cap_change_percentage_24h_usd;
        bullets.push(`Total crypto market cap is ${mc >= 0 ? 'up' : 'down'} <b>${Math.abs(mc).toFixed(2)}%</b> over 24h${Math.abs(mc) > 3 ? ' — an outsized move; expect elevated volatility.' : '.'}`);
      }
      if (Array.isArray(c.top) && c.top.length) {
        const up = c.top.filter(x => (x.price_change_percentage_24h ?? 0) > 0).length;
        bullets.push(`Market breadth: <b>${up}/${c.top.length}</b> of the top coins are green over 24h — ${up / c.top.length > 0.6 ? 'broad-based strength.' : up / c.top.length < 0.4 ? 'broad-based weakness.' : 'mixed breadth.'}`);
      }
    } catch {}
    const list2 = document.getElementById('aiInsightsList');
    if (!list2) return;
    list2.innerHTML = bullets.length
      ? bullets.map(b => `<li class="flex gap-2"><span class="text-cyan-400">•</span><span>${b}</span></li>`).join('')
      : '<li class="text-xs text-dim">Insights unavailable right now — try Regenerate in a moment.</li>';
  }
  function regenInsights() {
    const list = document.getElementById('aiInsightsList');
    if (list) list.innerHTML = `<li>${UI.skeleton('h-4','w-2/3')}</li><li>${UI.skeleton('h-4','w-1/2')}</li>`;
    renderInsights();
  }

  /* ---------------- Markets (paginated) ---------------- */
  /** Load AI ratings lazily & sequentially for a list of market rows. */
  async function loadRatings(markets, tok, prefix) {
    const fng = await getFng().catch(() => []);
    const fngNow = fng[0]?.v ?? null;
    for (const c of markets) {
      if (!isCurrent(tok)) return;
      const el = document.getElementById(`${prefix}${c.id}`);
      if (!el) continue;
      try {
        const chart = await API.chart(c.id, c.symbol, 90, 'usd');
        const ind = Indicators.analyze(chart.prices.map(p => p[1]), chart.total_volumes.map(v => v[1]));
        const rec = Recommend.recommend(ind, fngNow);
        const el2 = document.getElementById(`${prefix}${c.id}`);
        if (el2) el2.innerHTML = UI.ratingBadge(rec.rating, true);
      } catch {
        const el2 = document.getElementById(`${prefix}${c.id}`);
        if (el2) el2.innerHTML = '<span class="text-[10px] text-dim">n/a</span>';
      }
    }
  }

  function mkSetPage(p) { state.mkPage = Math.max(1, p); renderMarkets(); }
  function mkSetPerPage(n) { state.mkPerPage = +n; state.mkPage = 1; renderMarkets(); }

  async function renderMarkets() {
    newRender();
    const tok = renderSeq;
    const cur = state.currency;
    viewEl().innerHTML = `<div class="space-y-3">${UI.skeletonCard(2)}${UI.skeletonCard(10)}</div>`;
    try {
      const rows = await API.marketsPage(cur, state.mkPerPage, state.mkPage);
      if (!isCurrent(tok)) return;
      rows.forEach(c => { COIN_META[c.id] = { symbol: c.symbol, name: c.name }; state.symbols[c.id] = c.symbol; });
      saveCoinMeta();
      const tr = (c) => `
        <tr class="border-b border-white/5 hover:bg-white/5 cursor-pointer transition" onclick="App.nav('coin','${c.id}')">
          <td class="py-3 pl-3 pr-2 text-dim text-xs">${c.market_cap_rank ?? '—'}</td>
          <td class="py-3 pr-2"><div class="flex items-center gap-2.5 min-w-[140px]">
            <img src="${c.image}" class="w-6 h-6 rounded-full" alt="" loading="lazy">
            <div><div class="text-sm text-head font-medium">${c.name}</div><div class="text-[10px] text-dim uppercase">${c.symbol}</div></div>
          </div></td>
          <td class="py-3 pr-2 text-sm text-head text-right">${UI.money(c.current_price, cur)}</td>
          <td class="py-3 pr-2 text-sm text-right">${UI.pct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h)}</td>
          <td class="py-3 pr-2 text-sm text-right hidden sm:table-cell">${UI.pct(c.price_change_percentage_7d_in_currency)}</td>
          <td class="py-3 pr-2 text-sm text-head text-right hidden md:table-cell">${UI.money(c.market_cap, cur, {compact:true})}</td>
          <td class="py-3 pr-2 text-sm text-head text-right hidden lg:table-cell">${UI.money(c.total_volume, cur, {compact:true})}</td>
          <td class="py-3 pr-3 text-right"><span id="mkr-${c.id}"><span class="skeleton inline-block h-4 w-14 align-middle"></span></span></td>
        </tr>`;
      const pager = `
        <div class="flex items-center justify-between flex-wrap gap-3 pt-3">
          <div class="flex items-center gap-2">
            <button onclick="App.mkSetPage(${state.mkPage - 1})" ${state.mkPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-dim opacity-40"' : 'class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-body hover:text-cyan-300 transition"'}>← Prev</button>
            <span class="text-xs text-dim px-2">Page ${state.mkPage}</span>
            <button onclick="App.mkSetPage(${state.mkPage + 1})" class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-body hover:text-cyan-300 transition">Next →</button>
          </div>
          <div class="flex items-center gap-2 text-xs text-dim">Per page
            <select onchange="App.mkSetPerPage(this.value)" class="glass !rounded-lg px-2 py-1 bg-transparent text-head outline-none">
              <option value="25" ${state.mkPerPage===25?'selected':''} class="bg-slate-900">25</option>
              <option value="50" ${state.mkPerPage===50?'selected':''} class="bg-slate-900">50</option>
            </select>
          </div>
        </div>`;
      viewEl().innerHTML = `
      <div class="fade-in space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-display text-xl font-bold text-head">Markets</h2>
          <div class="text-xs text-dim">Top coins by market cap · AI ratings load per row</div>
        </div>
        <div class="glass overflow-x-auto">
          <table class="w-full text-left min-w-[560px]">
            <thead><tr class="text-[10px] text-dim uppercase tracking-wider border-b border-white/10">
              <th class="py-2.5 pl-3 pr-2 font-medium">#</th><th class="py-2.5 pr-2 font-medium">Coin</th>
              <th class="py-2.5 pr-2 font-medium text-right">Price</th><th class="py-2.5 pr-2 font-medium text-right">24h</th>
              <th class="py-2.5 pr-2 font-medium text-right hidden sm:table-cell">7d</th>
              <th class="py-2.5 pr-2 font-medium text-right hidden md:table-cell">Mkt Cap</th>
              <th class="py-2.5 pr-2 font-medium text-right hidden lg:table-cell">Volume</th>
              <th class="py-2.5 pr-3 font-medium text-right">AI Rating</th>
            </tr></thead>
            <tbody>${rows.map(tr).join('')}</tbody>
          </table>
        </div>
        ${pager}
      </div>`;
      loadRatings(rows, tok, 'mkr-');
    } catch (e) {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load markets. CoinGecko may be rate-limiting.', "App.nav('markets')");
    }
  }

  /* ---------------- Watchlist ---------------- */
  async function renderWatchlist() {
    const tok = renderSeq;
    const cur = state.currency;
    viewEl().innerHTML = `<div class="space-y-3">${UI.skeletonCard(2)}${UI.skeletonCard(8)}</div>`;
    try {
      let markets;
      const fng = await getFng().catch(() => []);
      const fngNow = fng[0]?.v ?? null;
      try {
        markets = await API.markets(state.watchlist, cur);
        // remember symbol/name for future Binance fallbacks
        markets.forEach(c => { COIN_META[c.id] = { symbol: c.symbol, name: c.name }; });
        saveCoinMeta();
      } catch (e) {
        // CoinGecko down/rate-limited → Binance 24h tickers fallback
        const known = state.watchlist.filter(id => COIN_META[id]).map(id => ({ id, ...COIN_META[id] }));
        if (!known.length) throw e;
        markets = await API.binanceTickers(known);
        UI.toast('CoinGecko rate-limited — showing live Binance data');
      }
      if (!isCurrent(tok)) return;
      const order = state.watchlist;
      markets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

      // Paginate if >10 coins
      const WL_PER = 10;
      const totalPages = Math.max(1, Math.ceil(markets.length / WL_PER));
      if (state.wlPage > totalPages) state.wlPage = totalPages;
      const paged = markets.length > WL_PER;
      if (paged) markets = markets.slice((state.wlPage - 1) * WL_PER, state.wlPage * WL_PER);

      const head = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-display text-xl font-bold text-head">Watchlist</h2>
          <div class="text-xs text-dim">Indicators load per coin • add coins via search ↗</div>
        </div>`;

      const wlPager = paged ? `
        <div class="flex items-center gap-2 justify-center pt-1">
          <button onclick="App.wlSetPage(${state.wlPage - 1})" ${state.wlPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-dim opacity-40"' : 'class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-body hover:text-cyan-300 transition"'}>← Prev</button>
          <span class="text-xs text-dim px-2">Page ${state.wlPage} / ${totalPages}</span>
          <button onclick="App.wlSetPage(${state.wlPage + 1})" ${state.wlPage >= totalPages ? 'disabled class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-dim opacity-40"' : 'class="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-body hover:text-cyan-300 transition"'}>Next →</button>
        </div>` : '';

      const rows = markets.map(c => `
        <div class="glass glass-hover p-4" id="wl-${c.id}">
          <div class="flex items-center gap-3 flex-wrap">
            <img src="${c.image}" class="w-8 h-8 rounded-full cursor-pointer" onclick="App.nav('coin','${c.id}')" alt="">
            <div class="min-w-[110px] cursor-pointer" onclick="App.nav('coin','${c.id}')">
              <div class="text-head font-semibold text-sm">${c.name}</div>
              <div class="text-xs text-dim uppercase">${c.symbol}</div>
            </div>
            <div class="min-w-[90px]"><div class="text-head text-sm font-medium">${UI.money(c.current_price, cur)}</div><div class="text-[10px] text-dim">Price</div></div>
            <div class="min-w-[70px]"><div class="text-sm">${UI.pct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h)}</div><div class="text-[10px] text-dim">24h</div></div>
            <div class="min-w-[70px]"><div class="text-sm">${UI.pct(c.price_change_percentage_7d_in_currency)}</div><div class="text-[10px] text-dim">7d</div></div>
            <div class="min-w-[90px] hidden sm:block"><div class="text-head text-sm">${UI.money(c.total_volume, cur, {compact:true})}</div><div class="text-[10px] text-dim">Volume</div></div>
            <div class="min-w-[90px] hidden md:block"><div class="text-head text-sm">${UI.money(c.market_cap, cur, {compact:true})}</div><div class="text-[10px] text-dim">Mkt Cap</div></div>
            <div class="flex-1"></div>
            <div id="ind-${c.id}" class="flex items-center gap-3 flex-wrap text-xs">
              <div class="skeleton h-4 w-40"></div>
            </div>
            <button onclick="App.removeCoin('${c.id}')" title="Remove" class="text-dim hover:text-rose-400 transition px-1 text-lg leading-none">×</button>
          </div>
        </div>`).join('');

      viewEl().innerHTML = `<div class="fade-in space-y-3">${head}${rows}${wlPager}</div>`;

      markets.forEach(c => { state.symbols[c.id] = c.symbol; });
      // Load indicators sequentially (Binance primary — fast; CoinGecko fallback)
      for (const c of markets) {
        if (!isCurrent(tok)) return;
        try {
          const chart = await API.chart(c.id, c.symbol, 90, cur);
          const prices = chart.prices.map(p => p[1]);
          const vols = chart.total_volumes.map(v => v[1]);
          const ind = Indicators.analyze(prices, vols);
          const rec = Recommend.recommend(ind, fngNow);
          const el = document.getElementById(`ind-${c.id}`);
          if (!el) continue;
          const macdCls = ind.macd.momentum === 'bullish' ? 'text-emerald-400' : 'text-rose-400';
          el.innerHTML = `
            <div><span class="text-dim">RSI</span> <span class="${ind.rsi > 70 ? 'text-rose-400' : ind.rsi < 30 ? 'text-emerald-400' : 'text-head'}">${ind.rsi?.toFixed(0) ?? '—'}</span></div>
            <div><span class="text-dim">MACD</span> <span class="${macdCls}">${ind.macd.cross !== 'none' ? ind.macd.cross + ' cross' : ind.macd.momentum}</span></div>
            <div><span class="text-dim">Trend</span> <span class="${ind.maTrend === 'up' ? 'text-emerald-400' : 'text-rose-400'}">${ind.maTrend === 'up' ? '↑ above EMA50' : '↓ below EMA50'}</span></div>
            <div class="hidden lg:block"><span class="text-dim">S/R</span> <span class="text-head">${UI.money(ind.support, cur)} / ${UI.money(ind.resistance, cur)}</span></div>
            ${UI.ratingBadge(rec.rating, true)}`;
        } catch {
          const el = document.getElementById(`ind-${c.id}`);
          if (el) el.innerHTML = `<button onclick="App.retryIndicators('${c.id}')" class="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">indicators queued — tap to retry</button>`;
        }
      }
    } catch (e) {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load watchlist.', "App.nav('watchlist')");
    }
  }

  /** Retry loading indicators for one watchlist coin (after a rate-limit). */
  async function retryIndicators(id) {
    const el = document.getElementById(`ind-${id}`);
    if (!el) return;
    el.innerHTML = `<div class="skeleton h-4 w-40"></div>`;
    try {
      const cur = state.currency;
      const [chart, fngNow] = await Promise.all([API.chart(id, state.symbols[id], 90, cur), getFng()]);
      const prices = chart.prices.map(p => p[1]);
      const vols = chart.total_volumes.map(v => v[1]);
      const ind = Indicators.analyze(prices, vols);
      const rec = Recommend.recommend(ind, fngNow);
      const macdCls = ind.macd.momentum === 'bullish' ? 'text-emerald-400' : 'text-rose-400';
      el.innerHTML = `
        <div><span class="text-dim">RSI</span> <span class="${ind.rsi > 70 ? 'text-rose-400' : ind.rsi < 30 ? 'text-emerald-400' : 'text-head'}">${ind.rsi?.toFixed(0) ?? '—'}</span></div>
        <div><span class="text-dim">MACD</span> <span class="${macdCls}">${ind.macd.cross !== 'none' ? ind.macd.cross + ' cross' : ind.macd.momentum}</span></div>
        <div><span class="text-dim">Trend</span> <span class="${ind.maTrend === 'up' ? 'text-emerald-400' : 'text-rose-400'}">${ind.maTrend === 'up' ? '↑ above EMA50' : '↓ below EMA50'}</span></div>
        <div class="hidden lg:block"><span class="text-dim">S/R</span> <span class="text-head">${UI.money(ind.support, state.currency)} / ${UI.money(ind.resistance, state.currency)}</span></div>
        ${UI.ratingBadge(rec.rating, true)}`;
    } catch {
      el.innerHTML = `<button onclick="App.retryIndicators('${id}')" class="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">still rate-limited — tap to retry</button>`;
    }
  }

  function removeCoin(id) {
    state.watchlist = state.watchlist.filter(c => c !== id);
    saveWatchlist();
    document.getElementById(`wl-${id}`)?.remove();
    UI.toast('Removed from watchlist');
  }

  function addCoin(id, name) {
    if (!state.watchlist.includes(id)) {
      state.watchlist.push(id);
      saveWatchlist();
      UI.toast(`${name} added to watchlist`);
    } else UI.toast(`${name} already in watchlist`);
    $('#searchResults').classList.add('hidden');
    $('#searchInput').value = '';
    if (state.view === 'watchlist') renderWatchlist();
  }

  /* ---------------- Portfolio ---------------- */
  async function renderPortfolio() {
    newRender();
    const tok = renderSeq;
    const cur = state.currency;
    const lots = state.portfolio;
    const addForm = `
      <div class="glass p-5" id="pfAdd">
        <div class="font-display font-semibold text-head mb-3">Add Holding</div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="relative lg:col-span-2">
            <input id="pfCoinInput" type="text" placeholder="Search coin…" autocomplete="off" class="glass !rounded-xl px-3 py-2 text-sm w-full bg-transparent text-head placeholder:text-dim outline-none focus:border-cyan-400/50">
            <input type="hidden" id="pfCoinId"><input type="hidden" id="pfCoinSym"><input type="hidden" id="pfCoinName">
            <div id="pfCoinResults" class="absolute left-0 mt-1 w-full glass !rounded-xl shadow-2xl z-40 hidden max-h-56 overflow-y-auto"></div>
          </div>
          <input id="pfQty" type="number" step="any" min="0" placeholder="Quantity" class="glass !rounded-xl px-3 py-2 text-sm bg-transparent text-head placeholder:text-dim outline-none focus:border-cyan-400/50">
          <input id="pfPrice" type="number" step="any" min="0" placeholder="Buy price (USD)" class="glass !rounded-xl px-3 py-2 text-sm bg-transparent text-head placeholder:text-dim outline-none focus:border-cyan-400/50">
          <input id="pfDate" type="date" class="glass !rounded-xl px-3 py-2 text-sm bg-transparent text-head outline-none focus:border-cyan-400/50">
        </div>
        <button onclick="App.pfAdd()" class="mt-3 px-4 py-2 rounded-xl text-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">+ Add lot</button>
      </div>`;

    if (!lots.length) {
      viewEl().innerHTML = `<div class="fade-in space-y-4">
        <h2 class="font-display text-xl font-bold text-head">Portfolio</h2>
        ${addForm}
        <div class="glass p-8 text-center text-sm text-dim">No holdings yet — add your first lot above. Data stays in your browser (localStorage).</div>
      </div>`;
      initPfPicker();
      return;
    }

    viewEl().innerHTML = `<div class="space-y-3">${UI.skeletonCard(2)}${UI.skeletonCard(6)}</div>`;
    try {
      const ids = [...new Set(lots.map(l => l.coinId))];
      let markets;
      try {
        markets = await API.markets(ids, cur);
        markets.forEach(c => { COIN_META[c.id] = { symbol: c.symbol, name: c.name }; });
        saveCoinMeta();
      } catch (e) {
        const known = ids.filter(id => COIN_META[id]).map(id => ({ id, ...COIN_META[id] }));
        if (!known.length) throw e;
        markets = await API.binanceTickers(known);
        UI.toast('CoinGecko rate-limited — showing live Binance data');
      }
      if (!isCurrent(tok)) return;
      const byId = Object.fromEntries(markets.map(m => [m.id, m]));

      // group lots per coin
      const groups = {};
      lots.forEach(l => { (groups[l.coinId] = groups[l.coinId] || []).push(l); });
      let totalVal = 0, totalCost = 0, total24h = 0;
      const rowsData = Object.entries(groups).map(([id, ls]) => {
        const m = byId[id];
        const qty = ls.reduce((s, l) => s + l.qty, 0);
        const cost = ls.reduce((s, l) => s + l.qty * l.buyPrice, 0);
        const price = m?.current_price ?? null;
        const value = price != null ? qty * price : 0;
        const ch24 = m?.price_change_percentage_24h ?? null;
        const val24 = (price != null && ch24 != null) ? value - value / (1 + ch24 / 100) : 0;
        totalVal += value; totalCost += cost; total24h += val24;
        return { id, m, ls, qty, cost, price, value, ch24, avg: qty ? cost / qty : 0, name: m?.name || COIN_META[id]?.name || id, sym: (m?.symbol || COIN_META[id]?.symbol || '').toUpperCase(), img: m?.image };
      }).sort((a, b) => b.value - a.value);
      const totalPL = totalVal - totalCost;
      const totalPLPct = totalCost ? (totalPL / totalCost) * 100 : 0;

      const holdingRow = (r) => `
        <div class="glass glass-hover p-4">
          <div class="flex items-center gap-3 flex-wrap">
            <img src="${r.img || ''}" class="w-8 h-8 rounded-full cursor-pointer" onclick="App.nav('coin','${r.id}')" alt="" onerror="this.style.visibility='hidden'">
            <div class="min-w-[110px] cursor-pointer" onclick="App.nav('coin','${r.id}')">
              <div class="text-head font-semibold text-sm">${r.name}</div>
              <div class="text-xs text-dim">${r.qty.toLocaleString('en-US',{maximumFractionDigits:8})} ${r.sym}</div>
            </div>
            <div class="min-w-[90px]"><div class="text-head text-sm">${UI.money(r.price, cur)}</div><div class="text-[10px] text-dim">Price ${r.ch24 != null ? UI.pct(r.ch24) : ''}</div></div>
            <div class="min-w-[90px]"><div class="text-head text-sm font-medium">${UI.money(r.value, cur)}</div><div class="text-[10px] text-dim">Value · ${totalVal ? (r.value / totalVal * 100).toFixed(1) : 0}%</div></div>
            <div class="min-w-[90px]"><div class="text-sm ${r.value - r.cost >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${UI.money(r.value - r.cost, cur)}</div><div class="text-[10px] text-dim">P/L ${r.cost ? UI.pct((r.value - r.cost) / r.cost * 100) : ''}</div></div>
            <div class="min-w-[90px] hidden sm:block"><div class="text-head text-sm">${UI.money(r.avg, cur)}</div><div class="text-[10px] text-dim">Avg buy</div></div>
            <div class="flex-1"></div>
            <button onclick="App.pfToggleLots('${r.id}')" class="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">${r.ls.length} lot${r.ls.length > 1 ? 's' : ''}</button>
          </div>
          <div id="pfLots-${r.id}" class="hidden mt-3 border-t border-white/10 pt-2 space-y-1">
            ${r.ls.map(l => `<div class="flex items-center gap-3 text-xs py-1">
              <span class="text-dim">${l.date || '—'}</span>
              <span class="text-head">${l.qty} ${r.sym} @ ${UI.money(l.buyPrice, 'usd')}</span>
              <span class="${r.price != null ? (r.price >= l.buyPrice ? 'text-emerald-400' : 'text-rose-400') : 'text-dim'}">${r.price != null ? UI.money((r.price - l.buyPrice) * l.qty, cur) : '—'}</span>
              <span class="flex-1"></span>
              <button onclick="App.pfEditLot('${l.id}')" class="text-dim hover:text-cyan-300">edit</button>
              <button onclick="App.pfRemoveLot('${l.id}')" class="text-dim hover:text-rose-400">remove</button>
            </div>`).join('')}
          </div>
        </div>`;

      viewEl().innerHTML = `
      <div class="fade-in space-y-4">
        <h2 class="font-display text-xl font-bold text-head">Portfolio</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="glass glass-hover p-5"><div class="text-xs text-dim uppercase tracking-wider mb-1">Total Value</div>
            <div class="font-display text-2xl font-bold text-head">${UI.money(totalVal, cur)}</div></div>
          <div class="glass glass-hover p-5"><div class="text-xs text-dim uppercase tracking-wider mb-1">Total P/L</div>
            <div class="font-display text-2xl font-bold ${totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${UI.money(totalPL, cur)}</div>
            <div class="text-sm mt-1">${UI.pct(totalPLPct)}</div></div>
          <div class="glass glass-hover p-5"><div class="text-xs text-dim uppercase tracking-wider mb-1">24h P/L</div>
            <div class="font-display text-2xl font-bold ${total24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${UI.money(total24h, cur)}</div>
            <div class="text-sm mt-1">${totalVal ? UI.pct(total24h / (totalVal - total24h) * 100) : ''}</div></div>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2 space-y-3">${rowsData.map(holdingRow).join('')}</div>
          <div class="glass p-5"><div class="font-display font-semibold text-head mb-3">Allocation</div>
            <div class="max-w-[260px] mx-auto"><canvas id="pfDonut"></canvas></div></div>
        </div>
        ${addForm}
      </div>`;
      initPfPicker();

      // donut
      const ctx = document.getElementById('pfDonut');
      if (ctx && rowsData.length) {
        if (state.pfChart) { state.pfChart.destroy(); state.pfChart = null; }
        const palette = ['#22d3ee','#8b5cf6','#34d399','#fb923c','#f43f5e','#facc15','#60a5fa','#f472b6','#a3e635','#94a3b8'];
        state.pfChart = new Chart(ctx, {
          type: 'doughnut',
          data: { labels: rowsData.map(r => r.sym), datasets: [{ data: rowsData.map(r => r.value), backgroundColor: rowsData.map((_, i) => palette[i % palette.length]), borderWidth: 0 }] },
          options: { plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${UI.money(c.parsed, cur)} (${totalVal ? (c.parsed / totalVal * 100).toFixed(1) : 0}%)` } } }, cutout: '62%' }
        });
      }
    } catch (e) {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load portfolio prices.', "App.nav('portfolio')");
    }
  }

  /** Coin search picker used by portfolio (and alerts) forms. */
  function initPfPicker(inputId = 'pfCoinInput', resId = 'pfCoinResults') {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resId);
    if (!input || !results) return;
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      t = setTimeout(async () => {
        results.innerHTML = `<div class="p-3">${UI.skeleton('h-4','w-2/3')}</div>`;
        results.classList.remove('hidden');
        try {
          const data = await API.search(q);
          const coins = data.coins.slice(0, 6);
          results.innerHTML = coins.length ? coins.map(c => `
            <div class="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 cursor-pointer transition" onclick="App.pfPick('${c.id}','${c.symbol.toLowerCase()}','${c.name.replace(/'/g, '')}','${inputId}')">
              <img src="${c.thumb}" class="w-5 h-5 rounded-full" alt="">
              <div class="text-sm text-head">${c.name} <span class="text-xs text-dim uppercase">${c.symbol}</span></div>
            </div>`).join('') : `<div class="p-3 text-sm text-dim">No results</div>`;
        } catch { results.innerHTML = `<div class="p-3 text-sm text-rose-400">Search failed</div>`; }
      }, 400);
    });
  }

  function pfPick(id, sym, name, inputId = 'pfCoinInput') {
    COIN_META[id] = { symbol: sym, name }; saveCoinMeta();
    const prefix = inputId.replace('CoinInput', '');
    document.getElementById(prefix + 'CoinId').value = id;
    document.getElementById(prefix + 'CoinSym').value = sym;
    document.getElementById(prefix + 'CoinName').value = name;
    document.getElementById(inputId).value = `${name} (${sym.toUpperCase()})`;
    document.getElementById(prefix + 'CoinResults').classList.add('hidden');
  }

  function pfAdd() {
    const id = document.getElementById('pfCoinId').value;
    const qty = parseFloat(document.getElementById('pfQty').value);
    const price = parseFloat(document.getElementById('pfPrice').value);
    const date = document.getElementById('pfDate').value;
    if (!id) return UI.toast('Pick a coin from the search list');
    if (!qty || qty <= 0) return UI.toast('Enter a valid quantity');
    if (isNaN(price) || price < 0) return UI.toast('Enter a valid buy price');
    state.portfolio.push({ id: 'lot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), coinId: id, qty, buyPrice: price, date: date || new Date().toISOString().slice(0, 10) });
    savePortfolio();
    UI.toast('Holding added');
    renderPortfolio();
  }

  function pfRemoveLot(lotId) {
    state.portfolio = state.portfolio.filter(l => l.id !== lotId);
    savePortfolio(); UI.toast('Lot removed'); renderPortfolio();
  }

  function pfEditLot(lotId) {
    const lot = state.portfolio.find(l => l.id === lotId);
    if (!lot) return;
    const qty = parseFloat(prompt('Quantity:', lot.qty));
    if (isNaN(qty) || qty <= 0) return;
    const price = parseFloat(prompt('Buy price (USD):', lot.buyPrice));
    if (isNaN(price) || price < 0) return;
    lot.qty = qty; lot.buyPrice = price;
    savePortfolio(); UI.toast('Lot updated'); renderPortfolio();
  }

  function pfToggleLots(coinId) {
    document.getElementById('pfLots-' + coinId)?.classList.toggle('hidden');
  }

  /* ---------------- Alerts ---------------- */
  const COND_LABEL = {
    price_above: 'Price above', price_below: 'Price below',
    change_above: '24h % change above', rsi_above: 'RSI above', rsi_below: 'RSI below',
  };
  function condText(a) {
    const t = COND_LABEL[a.cond] || a.cond;
    const v = a.cond.startsWith('price') ? UI.money(a.threshold, 'usd') : a.threshold;
    return `${t} ${v}`;
  }

  async function renderAlerts() {
    newRender();
    const tok = renderSeq;
    const notifState = ('Notification' in window) ? Notification.permission : 'unsupported';
    const alertRow = (a) => `
      <div class="glass glass-hover p-4 flex items-center gap-3 flex-wrap" id="al-${a.id}">
        <div class="min-w-[120px]">
          <div class="text-head font-semibold text-sm">${a.coinName}</div>
          <div class="text-xs text-dim uppercase">${a.coinSym}</div>
        </div>
        <div class="text-sm text-body">${condText(a)}</div>
        <div class="flex-1"></div>
        ${a.triggered
          ? `<span class="text-xs px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/25">Triggered ${a.triggeredAt ? new Date(a.triggeredAt).toLocaleString() : ''}</span>
             <button onclick="App.alRearm('${a.id}')" class="px-3 py-1.5 rounded-lg text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">Re-arm</button>`
          : `<span class="text-xs px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">Armed</span>`}
        <button onclick="App.alRemove('${a.id}')" class="text-dim hover:text-rose-400 transition px-1 text-lg leading-none">×</button>
      </div>`;

    viewEl().innerHTML = `
    <div class="fade-in space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h2 class="font-display text-xl font-bold text-head">Price Alerts</h2>
        <div class="text-xs text-dim">Checked every 60s while the app is open</div>
      </div>
      ${notifState === 'default' ? `<div class="glass p-4 flex items-center gap-3 flex-wrap text-sm"><span>Enable browser notifications to get alerted even in another tab.</span><button onclick="App.alAskNotif()" class="px-3 py-1.5 rounded-lg text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">Enable notifications</button></div>` : notifState === 'denied' ? `<div class="glass p-4 text-xs text-dim">Browser notifications are blocked — you'll still get in-app toasts.</div>` : ''}
      <div class="glass p-5">
        <div class="font-display font-semibold text-head mb-3">New Alert</div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="relative">
            <input id="alCoinInput" type="text" placeholder="Search coin…" autocomplete="off" class="glass !rounded-xl px-3 py-2 text-sm w-full bg-transparent text-head placeholder:text-dim outline-none focus:border-cyan-400/50">
            <input type="hidden" id="alCoinId"><input type="hidden" id="alCoinSym"><input type="hidden" id="alCoinName">
            <div id="alCoinResults" class="absolute left-0 mt-1 w-full glass !rounded-xl shadow-2xl z-40 hidden max-h-56 overflow-y-auto"></div>
          </div>
          <select id="alCond" class="glass !rounded-xl px-3 py-2 text-sm bg-transparent text-head outline-none">
            ${Object.entries(COND_LABEL).map(([k, v]) => `<option value="${k}" class="bg-slate-900">${v}</option>`).join('')}
          </select>
          <input id="alThresh" type="number" step="any" placeholder="Threshold" class="glass !rounded-xl px-3 py-2 text-sm bg-transparent text-head placeholder:text-dim outline-none focus:border-cyan-400/50">
          <button onclick="App.alAdd()" class="px-4 py-2 rounded-xl text-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">+ Create alert</button>
        </div>
      </div>

      <div class="glass p-5">
        <div class="font-display font-semibold text-head mb-3">Portfolio Alerts</div>
        <div class="flex gap-4 flex-wrap text-sm">
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="alPfUp" ${alertsStore.pfUp10 ? 'checked' : ''} onchange="App.alPfToggle('pfUp10', this.checked)" class="accent-cyan-400"> Portfolio up 10%</label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="alPfDown" ${alertsStore.pfDown5 ? 'checked' : ''} onchange="App.alPfToggle('pfDown5', this.checked)" class="accent-cyan-400"> Portfolio down 5%</label>
        </div>
        <div class="text-[11px] text-dim mt-2">Measured against portfolio value when the toggle was switched on.</div>
      </div>

      <div class="space-y-3">
        ${alertsStore.alerts.length ? alertsStore.alerts.map(alertRow).join('') : '<div class="glass p-6 text-center text-sm text-dim">No alerts yet.</div>'}
      </div>

      <div class="glass p-5">
        <div class="font-display font-semibold text-head mb-2">History <span class="text-xs text-dim font-normal">(last 20)</span></div>
        ${alertsStore.history.length ? alertsStore.history.map(h => `
          <div class="flex items-center gap-3 text-xs py-1.5 border-b border-white/5 last:border-0">
            <span class="text-dim whitespace-nowrap">${new Date(h.t).toLocaleString()}</span>
            <span class="text-head">${h.msg}</span>
          </div>`).join('') : '<div class="text-xs text-dim py-2">No triggered alerts yet.</div>'}
      </div>
    </div>`;
    initPfPicker('alCoinInput', 'alCoinResults');
  }

  function alAskNotif() {
    if ('Notification' in window) Notification.requestPermission().then(() => renderAlerts());
  }

  function alAdd() {
    const id = document.getElementById('alCoinId').value;
    const cond = document.getElementById('alCond').value;
    const threshold = parseFloat(document.getElementById('alThresh').value);
    if (!id) return UI.toast('Pick a coin from the search list');
    if (isNaN(threshold)) return UI.toast('Enter a threshold');
    alertsStore.alerts.push({
      id: 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      coinId: id, coinSym: document.getElementById('alCoinSym').value.toUpperCase(),
      coinName: document.getElementById('alCoinName').value, cond, threshold, triggered: false, triggeredAt: null,
    });
    saveAlerts(); UI.toast('Alert created'); renderAlerts();
  }

  function alRemove(id) { alertsStore.alerts = alertsStore.alerts.filter(a => a.id !== id); saveAlerts(); renderAlerts(); }
  function alRearm(id) { const a = alertsStore.alerts.find(x => x.id === id); if (a) { a.triggered = false; a.triggeredAt = null; saveAlerts(); renderAlerts(); } }
  function alPfToggle(key, on) {
    alertsStore[key] = on;
    if (on) alertsStore.pfBase = null; // will be set on next check
    saveAlerts();
  }

  function fireAlert(msg) {
    alertsStore.history.unshift({ t: Date.now(), msg });
    alertsStore.history = alertsStore.history.slice(0, 20);
    saveAlerts();
    UI.toast('🔔 ' + msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('CryptoSage Alert', { body: msg }); } catch {}
  }

  async function checkAlerts() {
    try {
      const armed = alertsStore.alerts.filter(a => !a.triggered);
      const ids = [...new Set([...armed.map(a => a.coinId), ...state.portfolio.map(l => l.coinId)])];
      let byId = {};
      if (ids.length) {
        let markets;
        try { markets = await API.markets(ids, 'usd'); }
        catch {
          const known = ids.filter(id => COIN_META[id]).map(id => ({ id, ...COIN_META[id] }));
          if (!known.length) return;
          markets = await API.binanceTickers(known);
        }
        byId = Object.fromEntries(markets.map(m => [m.id, m]));
      }
      let dirty = false;
      for (const a of armed) {
        const m = byId[a.coinId];
        if (!m) continue;
        let hit = false;
        if (a.cond === 'price_above') hit = m.current_price > a.threshold;
        else if (a.cond === 'price_below') hit = m.current_price < a.threshold;
        else if (a.cond === 'change_above') hit = (m.price_change_percentage_24h ?? -Infinity) > a.threshold;
        else if (a.cond === 'rsi_above' || a.cond === 'rsi_below') {
          try {
            const chart = await API.chart(a.coinId, COIN_META[a.coinId]?.symbol || m.symbol, 90, 'usd');
            const ind = Indicators.analyze(chart.prices.map(p => p[1]), chart.total_volumes.map(v => v[1]));
            if (ind.rsi != null) hit = a.cond === 'rsi_above' ? ind.rsi > a.threshold : ind.rsi < a.threshold;
          } catch {}
        }
        if (hit) {
          a.triggered = true; a.triggeredAt = Date.now(); dirty = true;
          fireAlert(`${a.coinName} (${a.coinSym}): ${condText(a)} — now ${UI.money(m.current_price, 'usd')}`);
        }
      }
      // portfolio alerts
      if ((alertsStore.pfUp10 || alertsStore.pfDown5) && state.portfolio.length) {
        let val = 0;
        state.portfolio.forEach(l => { const m = byId[l.coinId]; if (m?.current_price != null) val += l.qty * m.current_price; });
        if (val > 0) {
          if (alertsStore.pfBase == null) { alertsStore.pfBase = val; dirty = true; }
          else {
            const chg = (val - alertsStore.pfBase) / alertsStore.pfBase * 100;
            if (alertsStore.pfUp10 && chg >= 10) { alertsStore.pfUp10 = false; dirty = true; fireAlert(`Portfolio up ${chg.toFixed(1)}% (now ${UI.money(val, 'usd')})`); }
            if (alertsStore.pfDown5 && chg <= -5) { alertsStore.pfDown5 = false; dirty = true; fireAlert(`Portfolio down ${Math.abs(chg).toFixed(1)}% (now ${UI.money(val, 'usd')})`); }
          }
        }
      }
      if (dirty) { saveAlerts(); if (state.view === 'alerts') renderAlerts(); }
    } catch { /* silent — retry next tick */ }
  }

  /* ---------------- News ---------------- */
  const NEWS_FEEDS = [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  ];
  const NEWS_FILTERS = {
    All: null,
    Bitcoin: ['bitcoin', 'btc'],
    Ethereum: ['ethereum', 'eth ', ' eth', 'vitalik'],
    Altcoins: ['solana', 'xrp', 'ripple', 'cardano', 'ada ', 'dogecoin', 'doge', 'altcoin', 'sol ', 'bnb', 'polkadot', 'avalanche', 'litecoin'],
    DeFi: ['defi', 'dex', 'lending', 'staking', 'yield', 'uniswap', 'aave', 'liquidity'],
    NFT: ['nft', 'non-fungible', 'opensea', 'collectible'],
  };
  let newsFilter = 'All';

  async function fetchFeed(feed) {
    const cacheKey = 'cs_news_' + feed.name;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) { const { t, d } = JSON.parse(raw); if (Date.now() - t < 600_000) return d; }
    } catch {}
    let items = null;
    // primary: rss2json
    try {
      const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feed.url));
      if (res.ok) {
        const j = await res.json();
        if (j.status === 'ok') items = j.items.map(i => ({ title: i.title, link: i.link, t: Date.parse(i.pubDate), source: feed.name }));
      }
    } catch {}
    // fallback: allorigins + XML parse
    if (!items) {
      try {
        const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(feed.url));
        if (res.ok) {
          const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
          items = [...xml.querySelectorAll('item')].map(it => ({
            title: it.querySelector('title')?.textContent?.trim() || '',
            link: it.querySelector('link')?.textContent?.trim() || '',
            t: Date.parse(it.querySelector('pubDate')?.textContent || '') || Date.now(),
            source: feed.name,
          })).filter(i => i.title && i.link);
        }
      } catch {}
    }
    if (items) { try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: items })); } catch {} return items; }
    // stale fallback
    try { const raw = localStorage.getItem(cacheKey); if (raw) return JSON.parse(raw).d; } catch {}
    return [];
  }

  function timeAgo(t) {
    if (!t || isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function newsSetFilter(f) { newsFilter = f; renderNews(); }

  async function renderNews() {
    newRender();
    const tok = renderSeq;
    const chips = Object.keys(NEWS_FILTERS).map(f =>
      `<button onclick="App.newsSetFilter('${f}')" class="px-3 py-1.5 rounded-xl text-xs border transition ${f === newsFilter ? 'tab-active' : 'border-white/10 text-dim hover:text-cyan-300'}">${f}</button>`).join('');
    viewEl().innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-display text-xl font-bold text-head">Crypto News</h2>
          <div class="flex gap-1.5 flex-wrap">${chips}</div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">${UI.skeletonCard(3)}${UI.skeletonCard(3)}${UI.skeletonCard(3)}${UI.skeletonCard(3)}</div>
      </div>`;
    try {
      const results = await Promise.allSettled(NEWS_FEEDS.map(fetchFeed));
      if (!isCurrent(tok)) return;
      let items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      items.sort((a, b) => b.t - a.t);
      const kws = NEWS_FILTERS[newsFilter];
      if (kws) items = items.filter(i => { const t = (i.title + ' ').toLowerCase(); return kws.some(k => t.includes(k)); });
      items = items.slice(0, 40);
      const card = (i) => `
        <a href="${i.link}" target="_blank" rel="noopener" class="glass glass-hover p-4 block">
          <div class="text-sm text-head font-medium leading-snug">${i.title}</div>
          <div class="flex items-center gap-2 mt-2 text-[11px] text-dim">
            <span class="px-2 py-0.5 rounded-md ${i.source === 'CoinDesk' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-violet-500/10 text-violet-300'}">${i.source}</span>
            <span>${timeAgo(i.t)}</span>
          </div>
        </a>`;
      viewEl().innerHTML = `
      <div class="fade-in space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-display text-xl font-bold text-head">Crypto News</h2>
          <div class="flex gap-1.5 flex-wrap">${chips}</div>
        </div>
        ${items.length ? `<div class="grid gap-3 sm:grid-cols-2">${items.map(card).join('')}</div>`
          : `<div class="glass p-8 text-center text-sm text-dim">No headlines${kws ? ' for ' + newsFilter : ''} right now — <button class="text-cyan-400 underline" onclick="App.nav('news')">retry</button></div>`}
        <div class="text-[11px] text-dim">Sources: CoinDesk & Cointelegraph RSS · cached 10 min</div>
      </div>`;
    } catch {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load news feeds.', "App.nav('news')");
    }
  }

  /* ---------------- Coin Detail ---------------- */
  async function renderCoin(id, range) {
    const tok = renderSeq;
    if (range) state.range = range; else state.range = '90';
    const cur = state.currency;
    viewEl().innerHTML = `<div class="space-y-4">${UI.skeletonCard(2)}${UI.skeletonCard(8)}${UI.skeletonCard(4)}</div>`;
    try {
      const coin = await API.coin(id);
      state.symbols[id] = coin.symbol;
      const [chart90, fng] = await Promise.all([
        API.chart(id, coin.symbol, 90, cur), getFng()
      ]);
      if (!isCurrent(tok)) return;
      const prices90 = chart90.prices.map(p => p[1]);
      const vols90 = chart90.total_volumes.map(v => v[1]);
      const ind = Indicators.analyze(prices90, vols90);
      const rec = Recommend.recommend(ind, fng[0]?.v ?? null);
      const m = coin.market_data;
      const price = m.current_price[cur];
      const sym = coin.symbol.toUpperCase();

      const stat = (label, val) => `<div class="glass p-3.5"><div class="text-[10px] text-dim uppercase tracking-wider">${label}</div><div class="text-sm text-head font-medium mt-0.5">${val}</div></div>`;

      viewEl().innerHTML = `
      <div class="fade-in space-y-4">
        <button onclick="history.length > 1 ? App.nav('dashboard') : App.nav('dashboard')" class="text-sm text-dim hover:text-cyan-300 transition">← Back</button>
        <div class="glass p-5 flex items-center gap-4 flex-wrap">
          <img src="${coin.image.large}" class="w-12 h-12 rounded-full" alt="">
          <div class="mr-auto">
            <div class="font-display text-2xl font-bold text-head">${coin.name} <span class="text-dim text-base font-normal">${sym} · #${coin.market_cap_rank ?? '—'}</span></div>
            <div class="text-xl text-head font-medium mt-0.5">${UI.money(price, cur)} <span class="text-sm">${UI.pct(m.price_change_percentage_24h)}</span></div>
          </div>
          <button onclick="App.addCoin('${id}', '${coin.name.replace(/'/g,'')}')" class="px-4 py-2 rounded-xl text-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">+ Watchlist</button>
        </div>

        <div class="glass p-5">
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div class="font-display font-semibold text-head">Price Chart</div>
            <div class="flex gap-1.5" id="rangeBtns">
              ${['1','7','30','90','365'].map(d => `<button data-d="${d}" class="range-btn px-3 py-1.5 rounded-lg text-xs border border-transparent ${state.range===d?'tab-active':'text-dim hover:text-cyan-300'} transition">${d==='1'?'24h':d==='365'?'1y':d+'d'}</button>`).join('')}
            </div>
          </div>
          <div class="h-72"><canvas id="priceChart"></canvas></div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="glass p-5">
            <div class="flex items-center justify-between mb-3">
              <div class="font-display font-semibold text-head">🤖 CryptoSage AI Recommendation</div>
              ${UI.ratingBadge(rec.rating)}
            </div>
            <div class="flex gap-4 mb-3 text-sm flex-wrap">
              <div><span class="text-dim">Confidence</span> <span class="text-head font-medium">${rec.confidence}%</span></div>
              <div><span class="text-dim">Risk</span> <span class="text-head font-medium">${rec.risk}</span></div>
              <div><span class="text-dim">Score</span> <span class="text-head font-medium">${rec.score}</span></div>
            </div>
            <ul class="space-y-1.5 text-sm mb-4">
              ${rec.reasons.map(r => `<li class="flex gap-2"><span class="text-cyan-400">•</span><span>${r}</span></li>`).join('')}
            </ul>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="glass p-3"><div class="text-[10px] text-dim uppercase">Target (resistance)</div><div class="text-emerald-400 font-medium">${UI.money(rec.target, cur)}</div></div>
              <div class="glass p-3"><div class="text-[10px] text-dim uppercase">Stop loss (support)</div><div class="text-rose-400 font-medium">${UI.money(rec.stopLoss, cur)}</div></div>
            </div>
            <div class="mt-3 text-xs space-y-1.5">
              <div><span class="text-dim">Entry:</span> ${rec.entry}</div>
              <div><span class="text-dim">Exit:</span> ${rec.exit}</div>
            </div>
            <div class="mt-3 text-[10px] text-dim">Rule-based technical analysis — not financial advice.</div>
          </div>

          <div class="glass p-5">
            <div class="font-display font-semibold text-head mb-3">Technical Indicators <span class="text-xs text-dim font-normal">(90d daily)</span></div>
            <div class="grid grid-cols-2 gap-3">
              ${stat('RSI (14)', ind.rsi?.toFixed(1) ?? '—')}
              ${stat('MACD', `<span class="${ind.macd.momentum==='bullish'?'text-emerald-400':'text-rose-400'}">${ind.macd.cross !== 'none' ? ind.macd.cross+' cross' : ind.macd.momentum}</span>`)}
              ${stat('EMA 20', UI.money(ind.ema20, cur))}
              ${stat('EMA 50', UI.money(ind.ema50, cur))}
              ${stat('EMA 200', ind.ema200 ? UI.money(ind.ema200, cur) : 'n/a (needs 200d)')}
              ${stat('Bollinger', `${UI.money(ind.bbLower, cur)} – ${UI.money(ind.bbUpper, cur)}`)}
              ${stat('Support', UI.money(ind.support, cur))}
              ${stat('Resistance', UI.money(ind.resistance, cur))}
              ${stat('7d Momentum', (ind.mom7d>=0?'+':'')+ind.mom7d.toFixed(1)+'%')}
              ${stat('Volume Trend', (ind.volTrend>=0?'+':'')+ind.volTrend.toFixed(1)+'% (7d vs prev)')}
            </div>
          </div>
        </div>

        <div class="glass p-5">
          <div class="font-display font-semibold text-head mb-3">Market Stats</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            ${stat('Market Cap', UI.money(m.market_cap[cur], cur, {compact:true}))}
            ${stat('24h Volume', UI.money(m.total_volume[cur], cur, {compact:true}))}
            ${stat('ATH', `${UI.money(m.ath[cur], cur)} <span class="text-xs">${UI.pct(m.ath_change_percentage[cur])}</span>`)}
            ${stat('ATL', `${UI.money(m.atl[cur], cur)} <span class="text-xs">${UI.pct(m.atl_change_percentage[cur])}</span>`)}
            ${stat('Circulating', m.circulating_supply ? m.circulating_supply.toLocaleString('en-US',{maximumFractionDigits:0}) + ' ' + sym : '—')}
            ${stat('Total Supply', m.total_supply ? m.total_supply.toLocaleString('en-US',{maximumFractionDigits:0}) : '∞')}
            ${stat('Max Supply', m.max_supply ? m.max_supply.toLocaleString('en-US',{maximumFractionDigits:0}) : '∞')}
            ${stat('Links', `${coin.links.homepage[0] ? `<a href="${coin.links.homepage[0]}" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">Website</a>` : ''} ${coin.links.blockchain_site?.[0] ? ` · <a href="${coin.links.blockchain_site[0]}" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">Explorer</a>` : ''}`)}
          </div>
        </div>
      </div>`;

      document.querySelectorAll('.range-btn').forEach(b =>
        b.addEventListener('click', () => drawChart(id, b.dataset.d)));
      drawChart(id, state.range, chart90);
    } catch (e) {
      if (!isCurrent(tok)) return;
      viewEl().innerHTML = UI.errorCard('Failed to load coin data.', `App.nav('coin','${id}')`);
    }
  }

  /** Render Chart.js price line for a coin & range. */
  async function drawChart(id, days, preloaded = null) {
    state.range = days;
    document.querySelectorAll('.range-btn').forEach(b => {
      b.classList.toggle('tab-active', b.dataset.d === days);
      b.classList.toggle('text-dim', b.dataset.d !== days);
    });
    try {
      const data = (preloaded && days === '90') ? preloaded : await API.chart(id, state.symbols[id], days, state.currency);
      const points = data.prices;
      const labels = points.map(p => {
        const d = new Date(p[0]);
        return days === '1' ? d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString([], {month:'short',day:'numeric'});
      });
      const values = points.map(p => p[1]);
      const up = values[values.length-1] >= values[0];
      const ctx = document.getElementById('priceChart');
      if (!ctx) return;
      if (state.chart) state.chart.destroy();
      const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 280);
      grad.addColorStop(0, up ? 'rgba(52,211,153,.25)' : 'rgba(244,63,94,.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      state.chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data: values, borderColor: up ? '#34d399' : '#f43f5e', backgroundColor: grad, fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false,
            callbacks: { label: (c) => UI.money(c.parsed.y, state.currency) } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } } },
            y: { grid: { color: 'rgba(148,163,184,.08)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => UI.money(v, state.currency, {compact:true}) } }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
      });
    } catch { UI.toast('Chart data unavailable (rate limit) — try again shortly'); }
  }

  /* ---------------- Settings ---------------- */
  function renderSettings() {
    viewEl().innerHTML = `
    <div class="fade-in max-w-lg space-y-4">
      <h2 class="font-display text-xl font-bold text-head">Settings</h2>
      <div class="glass p-5 space-y-5">
        <div>
          <div class="text-sm text-head font-medium mb-2">Currency</div>
          <select id="curSel" class="glass !rounded-xl px-4 py-2.5 text-sm w-full bg-transparent text-head outline-none">
            ${['usd','eur','pkr'].map(c => `<option value="${c}" ${state.currency===c?'selected':''} class="bg-slate-900">${c.toUpperCase()} (${UI.CUR_SYM[c]})</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="text-sm text-head font-medium mb-2">Theme</div>
          <div class="flex gap-2">
            <button id="themeDark" class="px-4 py-2 rounded-xl text-sm border ${state.theme!=='light'?'tab-active':'border-white/10 text-dim'}">🌙 Dark</button>
            <button id="themeLight" class="px-4 py-2 rounded-xl text-sm border ${state.theme==='light'?'tab-active':'border-white/10 text-dim'}">☀️ Light</button>
          </div>
        </div>
        <div>
          <div class="text-sm text-head font-medium mb-2">Watchlist</div>
          <div class="text-xs text-dim mb-2">${state.watchlist.length} coins tracked</div>
          <button id="resetWl" class="px-4 py-2 rounded-xl text-sm bg-rose-500/10 text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 transition">Reset to defaults</button>
        </div>
        <div class="text-[11px] text-dim border-t border-white/10 pt-4">
          CryptoSage AI v1.0 · Data: CoinGecko & Alternative.me (free tier, cached 60s+) · Analysis is rule-based, not financial advice.
        </div>
      </div>
    </div>`;
    $('#curSel').addEventListener('change', (e) => {
      state.currency = e.target.value;
      localStorage.setItem('cs_currency', state.currency);
      UI.toast('Currency set to ' + state.currency.toUpperCase());
    });
    $('#themeDark').addEventListener('click', () => { state.theme = 'dark'; localStorage.setItem('cs_theme','dark'); applyTheme(); renderSettings(); });
    $('#themeLight').addEventListener('click', () => { state.theme = 'light'; localStorage.setItem('cs_theme','light'); applyTheme(); renderSettings(); });
    $('#resetWl').addEventListener('click', () => {
      state.watchlist = DEFAULT_WATCHLIST.slice(); saveWatchlist(); UI.toast('Watchlist reset'); renderSettings();
    });
  }

  /* ---------------- Search ---------------- */
  function initSearch() {
    const input = $('#searchInput');
    const results = $('#searchResults');
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      t = setTimeout(async () => {
        results.innerHTML = `<div class="p-3">${UI.skeleton('h-4','w-2/3')}</div>`;
        results.classList.remove('hidden');
        try {
          const data = await API.search(q);
          const coins = data.coins.slice(0, 8);
          results.innerHTML = coins.length ? coins.map(c => `
            <div class="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 cursor-pointer transition" onclick="App.nav('coin','${c.id}')">
              <img src="${c.thumb}" class="w-6 h-6 rounded-full" alt="">
              <div class="flex-1 min-w-0"><div class="text-sm text-head truncate">${c.name}</div><div class="text-xs text-dim uppercase">${c.symbol} · #${c.market_cap_rank ?? '—'}</div></div>
              <button onclick="event.stopPropagation();App.addCoin('${c.id}','${c.name.replace(/'/g,'')}')" class="text-cyan-400 hover:text-cyan-300 text-lg px-1" title="Add to watchlist">+</button>
            </div>`).join('')
            : `<div class="p-3 text-sm text-dim">No results</div>`;
        } catch { results.innerHTML = `<div class="p-3 text-sm text-rose-400">Search failed — try again</div>`; }
      }, 400);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#searchInput') && !e.target.closest('#searchResults'))
        results.classList.add('hidden');
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    applyTheme();
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.addEventListener('click', () => nav(b.dataset.nav)));
    initSearch();
    nav('dashboard');
    setTimeout(checkAlerts, 8000);
    setInterval(checkAlerts, 60_000);
  }

  function wlSetPage(p) { state.wlPage = Math.max(1, p); renderWatchlist(); }

  document.addEventListener('DOMContentLoaded', init);
  return { nav, addCoin, removeCoin, retryIndicators, mkSetPage, mkSetPerPage, wlSetPage,
    pfPick, pfAdd, pfRemoveLot, pfEditLot, pfToggleLots,
    alAdd, alRemove, alRearm, alPfToggle, alAskNotif, newsSetFilter, regenInsights };
})();
