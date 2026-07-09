/** Quick sanity tests for indicators.js + recommend.js */
const Indicators = require('../js/indicators.js');
const Recommend = require('../js/recommend.js');

let fails = 0;
function assert(name, cond, extra = '') {
  if (cond) console.log('✓', name);
  else { console.error('✗', name, extra); fails++; }
}

// SMA
const smaOut = Indicators.sma([1,2,3,4,5], 3);
assert('SMA basic', smaOut[2] === 2 && smaOut[4] === 4, JSON.stringify(smaOut));
assert('SMA nulls before period', smaOut[0] === null && smaOut[1] === null);

// EMA: constant series → constant EMA
const emaC = Indicators.ema(Array(30).fill(10), 10);
assert('EMA constant', Math.abs(emaC[29] - 10) < 1e-9);

// RSI: all up → 100, all down → near 0
const up = Array.from({length: 30}, (_, i) => 100 + i);
const down = Array.from({length: 30}, (_, i) => 100 - i);
const rUp = Indicators.rsi(up, 14), rDown = Indicators.rsi(down, 14);
assert('RSI uptrend = 100', rUp[29] === 100, rUp[29]);
assert('RSI downtrend < 5', rDown[29] < 5, rDown[29]);

// RSI known value check (Wilder classic dataset)
const wilder = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
const rW = Indicators.rsi(wilder, 14);
assert('RSI Wilder ≈ 70.5 at idx14', Math.abs(rW[14] - 70.46) < 0.6, rW[14]);

// MACD: rising series → positive momentum
const trend = Array.from({length: 60}, (_, i) => 100 * Math.pow(1.01, i));
const m = Indicators.macd(trend);
assert('MACD bullish momentum on uptrend', m.momentum === 'bullish');
assert('MACD lengths align', m.macd.length === 60 && m.signal.length === 60);

// Bollinger: middle == SMA, upper > lower
const noisy = Array.from({length: 40}, (_, i) => 100 + Math.sin(i) * 5);
const bb = Indicators.bollinger(noisy, 20, 2);
assert('BB upper > middle > lower', bb.upper[39] > bb.middle[39] && bb.middle[39] > bb.lower[39]);

// Support/resistance
const sr = Indicators.supportResistance([10,9,8,7,8,9,10,11,12,11,10,9,10,11,12,13,12,11,10.5], 90);
assert('Support below price', sr.support <= 10.5, JSON.stringify(sr));
assert('Resistance above price', sr.resistance >= 10.5, JSON.stringify(sr));

// analyze + recommend end-to-end
const prices = Array.from({length: 100}, (_, i) => 100 + i * 0.8 + Math.sin(i / 3) * 4);
const vols = Array.from({length: 100}, () => 1e6);
const ind = Indicators.analyze(prices, vols);
assert('analyze returns rsi', ind.rsi != null && ind.rsi >= 0 && ind.rsi <= 100);
assert('analyze maTrend up on uptrend', ind.maTrend === 'up');
const rec = Recommend.recommend(ind, 50);
assert('recommend returns rating', typeof rec.rating === 'string' && rec.confidence >= 50);
assert('recommend has reasons', rec.reasons.length > 0);
console.log('Sample recommendation:', rec.rating, rec.score, rec.confidence + '%');

// Bearish scenario: overbought blow-off then rolling over (no fresh bullish cross)
const bear = Array.from({length: 250}, (_, i) => i < 200 ? 100 + i : 300 - (i - 200) * 2);
const indB = Indicators.analyze(bear, Array.from({length: 250}, (_, i) => i < 240 ? 2e6 : 5e5));
const recB = Recommend.recommend(indB, 80);
assert('rollover → non-buy rating', ['Hold','Reduce','Sell','Strong Sell'].includes(recB.rating), recB.rating + ' score=' + recB.score);

process.exit(fails ? 1 : 0);
