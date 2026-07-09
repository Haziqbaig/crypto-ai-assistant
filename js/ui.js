/**
 * ui.js — Reusable UI helpers & components for CryptoSage AI.
 */
const UI = (() => {
  const CUR_SYM = { usd: '$', eur: '€', pkr: '₨' };

  /** Format a fiat number compactly. */
  function money(v, cur = 'usd', opts = {}) {
    if (v == null || isNaN(v)) return '—';
    const s = CUR_SYM[cur] || '$';
    const abs = Math.abs(v);
    if (opts.compact || abs >= 1e9) {
      if (abs >= 1e12) return s + (v / 1e12).toFixed(2) + 'T';
      if (abs >= 1e9) return s + (v / 1e9).toFixed(2) + 'B';
      if (abs >= 1e6) return s + (v / 1e6).toFixed(2) + 'M';
      if (abs >= 1e3) return s + (v / 1e3).toFixed(1) + 'K';
    }
    if (abs >= 1000) return s + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (abs >= 1) return s + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs === 0) return s + '0';
    return s + v.toPrecision(3);
  }

  /** Signed percentage with color class. */
  function pct(v) {
    if (v == null || isNaN(v)) return '<span class="text-dim">—</span>';
    const cls = v >= 0 ? 'text-emerald-400' : 'text-rose-400';
    return `<span class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
  }

  /** Rating badge with themed colors. */
  function ratingBadge(rating, small = false) {
    const map = {
      'Strong Buy': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      'Buy': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'Hold': 'bg-amber-500/10 text-amber-300 border-amber-500/25',
      'Reduce': 'bg-orange-500/10 text-orange-300 border-orange-500/25',
      'Sell': 'bg-rose-500/10 text-rose-300 border-rose-500/25',
      'Strong Sell': 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    };
    const cls = map[rating] || 'bg-slate-500/10 text-slate-300 border-slate-500/25';
    return `<span class="inline-block border rounded-lg font-medium ${small ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} ${cls}">${rating}</span>`;
  }

  /** Fear & Greed semicircle gauge (SVG). */
  function fngGauge(value, label) {
    const angle = -90 + (value / 100) * 180;
    const color = value <= 25 ? '#f43f5e' : value <= 45 ? '#fb923c' : value <= 55 ? '#facc15' : value <= 75 ? '#a3e635' : '#34d399';
    return `
    <svg viewBox="0 0 200 118" class="w-full max-w-[220px] mx-auto">
      <defs><linearGradient id="fngGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f43f5e"/><stop offset="35%" stop-color="#fb923c"/>
        <stop offset="55%" stop-color="#facc15"/><stop offset="100%" stop-color="#34d399"/>
      </linearGradient></defs>
      <path d="M 15 105 A 85 85 0 0 1 185 105" fill="none" stroke="url(#fngGrad)" stroke-width="13" stroke-linecap="round" opacity="0.85"/>
      <g transform="rotate(${angle} 100 105)">
        <line x1="100" y1="105" x2="100" y2="34" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="100" cy="105" r="6" fill="${color}"/>
      </g>
      <text x="100" y="88" text-anchor="middle" font-size="26" font-weight="700" fill="${color}" font-family="Space Grotesk">${value}</text>
      <text x="100" y="116" text-anchor="middle" font-size="11" fill="#94a3b8">${label}</text>
    </svg>`;
  }

  /** Skeleton block helpers. */
  function skeleton(h = 'h-5', w = 'w-full') { return `<div class="skeleton ${h} ${w}"></div>`; }
  function skeletonCard(lines = 3) {
    return `<div class="glass p-5 space-y-3">${Array.from({length: lines}, (_, i) =>
      skeleton('h-4', i === 0 ? 'w-1/3' : 'w-full')).join('')}</div>`;
  }

  /** Error card with retry hook. */
  function errorCard(msg, retryFn) {
    return `<div class="glass p-6 text-center space-y-3">
      <div class="text-rose-400 text-sm">⚠️ ${msg}</div>
      <button onclick="${retryFn}" class="px-4 py-2 rounded-xl text-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">Retry</button>
    </div>`;
  }

  /** Toast notification. */
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  return { money, pct, ratingBadge, fngGauge, skeleton, skeletonCard, errorCard, toast, CUR_SYM };
})();
