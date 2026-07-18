#!/usr/bin/env node
/**
 * check-alerts.js — 24/7 price alert checker, run by GitHub Actions on a schedule.
 *
 * Reads alerts.json (rules + email), fetches live prices from Binance,
 * and emails via FormSubmit when a rule triggers.
 *
 * Triggered-state is persisted in .alerts-state.json (committed back by the
 * workflow) so you don't get spammed every 5 minutes — each alert re-arms
 * after `rearmAfterHours` (default 24h).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'alerts.json');
const STATE_PATH = path.join(ROOT, '.alerts-state.json');

// data-api.binance.vision (keyless mirror) first — api.binance.com returns 451 in some regions
// (incl. GitHub Actions US runners).
const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getTickers(symbols) {
  const pairs = symbols.map(s => `"${s.toUpperCase()}USDT"`).join(',');
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      const data = await fetchJson(`${host}/api/v3/ticker/24hr?symbols=[${pairs}]`);
      return Object.fromEntries(data.map(t => [t.symbol, {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
      }]));
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function sendEmail(email, subject, lines) {
  const body = {
    _subject: subject,
    _template: 'box',
    _captcha: 'false',
    from: 'CryptoSage 24/7 watcher (GitHub Actions)',
    time: new Date().toUTCString(),
  };
  lines.forEach((l, i) => { body[`alert_${i + 1}`] = l; });
  const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false || d.success === 'false') {
    throw new Error('Email send failed: ' + (d.message || res.status));
  }
}

function fmt(v) {
  return v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toPrecision(3);
}

function condText(a, t) {
  switch (a.cond) {
    case 'price_above': return `${a.symbol} rose above ${fmt(a.threshold)} — now ${fmt(t.price)}`;
    case 'price_below': return `${a.symbol} fell below ${fmt(a.threshold)} — now ${fmt(t.price)}`;
    case 'change_above': return `${a.symbol} is up ${t.change24h.toFixed(2)}% in 24h (rule: > ${a.threshold}%) — now ${fmt(t.price)}`;
    case 'change_below': return `${a.symbol} is down ${t.change24h.toFixed(2)}% in 24h (rule: < ${a.threshold}%) — now ${fmt(t.price)}`;
    default: return `${a.symbol} triggered ${a.cond} ${a.threshold}`;
  }
}

function hit(a, t) {
  if (!t) return false;
  switch (a.cond) {
    case 'price_above': return t.price > a.threshold;
    case 'price_below': return t.price < a.threshold;
    case 'change_above': return t.change24h > a.threshold;
    case 'change_below': return t.change24h < a.threshold;
    default: return false;
  }
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const email = (process.env.ALERT_EMAIL || cfg.email || '').trim();
  if (!email || email.includes('YOUR_EMAIL_HERE')) {
    console.log('No email configured in alerts.json (or ALERT_EMAIL secret) — skipping.');
    return;
  }
  if (!Array.isArray(cfg.alerts) || !cfg.alerts.length) {
    console.log('No alerts configured — nothing to do.');
    return;
  }

  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch {}

  const rearmMs = (cfg.rearmAfterHours ?? 24) * 3600_000;
  const now = Date.now();

  const symbols = [...new Set(cfg.alerts.map(a => a.symbol.toUpperCase()))];
  const tickers = await getTickers(symbols);

  const fired = [];
  for (const a of cfg.alerts) {
    const t = tickers[a.symbol.toUpperCase() + 'USDT'];
    if (!t) { console.log(`No Binance ticker for ${a.symbol} — skipped`); continue; }
    const key = a.id || `${a.symbol}_${a.cond}_${a.threshold}`;
    const lastFired = state[key] || 0;
    if (now - lastFired < rearmMs) continue; // still cooling down
    if (hit(a, t)) {
      fired.push(condText(a, t));
      state[key] = now;
      console.log('TRIGGERED:', condText(a, t));
    } else {
      console.log(`ok: ${a.symbol} ${a.cond} ${a.threshold} (price ${fmt(t.price)}, 24h ${t.change24h.toFixed(2)}%)`);
    }
  }

  if (fired.length) {
    await sendEmail(email, `🔔 CryptoSage: ${fired.length} alert${fired.length > 1 ? 's' : ''} triggered`, fired);
    console.log(`Email sent to ${email}`);
  } else {
    console.log('No alerts triggered.');
  }

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
