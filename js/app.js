/**
 * app.js — Main application: routing, views, state for CryptoSage AI.
 */
const App = (() => {
  const DEFAULT_WATCHLIST = ['bitcoin','ethereum','solana','sui','dogecoin','chainlink','ripple','cardano'];
  const state = {
    view: 'dashboard',
    coinId: null,
    watchlist: JSON.parse(localStorage.getItem('cs_watchlist') || 'null') || DEFAULT_WATCHLIST.slice(),
    currency: localStorage.getItem('cs_currency') || 'usd',
    theme: localStorage.getItem('cs_theme') || 'dark',
    fng: null,
    chart: null,
    range: '90',
  };

  const $ = (s) => document.querySelector(s);
  const viewEl = () => $('#view');

  function saveWatchlist() { localStorage.setItem('cs_watchlist', JSON.stringify(state.watchlist)); }

  function applyTheme() {
    document.documentElement.classList.toggle('light', state.theme === 'light');
    document.documentElement.classList.toggle('dark', state.theme !== 'light');
  }

  /** Navigate between views. */
  function nav(view, coinId = null) {
    state.view = view; state.coinId = coinId;
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('tab-active', b.dataset.nav === view));
    if (view === 'dashboard') renderDashboard();
    else if (view === 'watchlist') renderWatchlist();
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
    viewEl().innerHTML = `<div class="grid gap-4 md:grid-cols-3">${UI.skeletonCard(3).repeat ? '' : ''}
      ${UI.skeletonCard(3)}${UI.skeletonCard(3)}${UI.skeletonCard(3)}</div>
      <div class="mt-4 grid gap-4 md:grid-cols-3">${UI.skeletonCard(6)}${UI.skeletonCard(6)}${UI.skeletonCard(6)}</div>`;
    try {
      const [global, fng, top, trending] = await Promise.all([
        API.global(), getFng(), API.topMarkets(state.currency, 50), API.trending()
      ]);
      const g = global.data;
      const cur = state.currency;
      const mcap = g.total_market_cap[cur];
      const mcapChange = g.market_cap_change_percentage_24h_usd;
      const btcDom = g.market_cap_percentage.btc;
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
            <div class="font-display text-2xl font-bold text-head">${btcDom.toFixed(1)}%</div>
            <div class="text-sm mt-1 text-dim text-xs">ETH ${g.market_cap_percentage.eth?.toFixed(1) ?? '—'}%</div>
          </div>
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">Market Sentiment</div>
            <div class="font-display text-2xl font-bold text-head">${sentiment}</div>
            <div class="text-sm mt-1 text-dim text-xs">Fear & Greed: ${fngNow.v}/100</div>
          </div>
          <div class="glass glass-hover p-5">
            <div class="text-xs text-dim uppercase tracking-wider mb-1">Active Coins</div>
            <div class="font-display text-2xl font-bold text-head">${g.active_cryptocurrencies.toLocaleString()}</div>
            <div class="text-sm mt-1 text-dim text-xs">${g.markets} markets</div>
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
            ${gainers.map(coinRow).join('')}
          </div>
          <div class="glass p-5">
            <div class="font-display font-semibold text-head mb-2">📉 Top Losers <span class="text-xs text-dim font-normal">(24h, top 50)</span></div>
            ${losers.map(coinRow).join('')}
          </div>
        </div>

        <div class="glass p-5">
          <div class="font-display font-semibold text-head mb-2">🔥 Trending on CoinGecko</div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
            ${trending.coins.slice(0, 8).map(trendRow).join('')}
          </div>
        </div>
      </div>`;
    } catch (e) {
      viewEl().innerHTML = UI.errorCard('Failed to load market data. CoinGecko may be rate-limiting.', "App.nav('dashboard')");
    }
  }

  /* ---------------- Watchlist ---------------- */
  async function renderWatchlist() {
    const cur = state.currency;
    viewEl().innerHTML = `<div class="space-y-3">${UI.skeletonCard(2)}${UI.skeletonCard(8)}</div>`;
    try {
      const [markets, fng] = await Promise.all([API.markets(state.watchlist, cur), getFng()]);
      const fngNow = fng[0]?.v ?? null;
      const order = state.watchlist;
      markets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

      const head = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-display text-xl font-bold text-head">Watchlist</h2>
          <div class="text-xs text-dim">Indicators load per coin • add coins via search ↗</div>
        </div>`;

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

      viewEl().innerHTML = `<div class="fade-in space-y-3">${head}${rows}</div>`;

      // Load indicators sequentially (rate-limit friendly)
      for (const c of markets) {
        try {
          const chart = await API.marketChart(c.id, 90, cur);
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
          await new Promise(r => setTimeout(r, 250));
        } catch {
          const el = document.getElementById(`ind-${c.id}`);
          if (el) el.innerHTML = `<span class="text-dim text-xs">indicators unavailable (rate limit) — open coin to retry</span>`;
        }
      }
    } catch (e) {
      viewEl().innerHTML = UI.errorCard('Failed to load watchlist.', "App.nav('watchlist')");
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

  /* ---------------- Coin Detail ---------------- */
  async function renderCoin(id, range) {
    if (range) state.range = range; else state.range = '90';
    const cur = state.currency;
    viewEl().innerHTML = `<div class="space-y-4">${UI.skeletonCard(2)}${UI.skeletonCard(8)}${UI.skeletonCard(4)}</div>`;
    try {
      const [coin, chart90, fng] = await Promise.all([
        API.coin(id), API.marketChart(id, 90, cur), getFng()
      ]);
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
      const data = (preloaded && days === '90') ? preloaded : await API.marketChart(id, days, state.currency);
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
  }

  document.addEventListener('DOMContentLoaded', init);
  return { nav, addCoin, removeCoin };
})();
