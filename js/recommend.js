/**
 * recommend.js — Rule-based recommendation engine for CryptoSage AI.
 * Combines RSI, MACD, EMA trend, momentum, volume and Fear & Greed into a score.
 */
const Recommend = (() => {

  /**
   * Score an indicator snapshot (from Indicators.analyze) plus market Fear & Greed.
   * @param {object} ind result of Indicators.analyze
   * @param {number|null} fng Fear & Greed value 0–100 (null if unknown)
   * @returns {{rating:string, score:number, confidence:number, reasons:string[], risk:string,
   *            target:number|null, stopLoss:number|null, entry:string, exit:string}}
   */
  function recommend(ind, fng = null) {
    let score = 0; // -10 … +10
    const reasons = [];

    // RSI
    if (ind.rsi != null) {
      if (ind.rsi < 30) { score += 2.5; reasons.push(`RSI ${ind.rsi.toFixed(0)} — oversold, potential bounce`); }
      else if (ind.rsi < 45) { score += 1; reasons.push(`RSI ${ind.rsi.toFixed(0)} — below neutral, room to run`); }
      else if (ind.rsi > 70) { score -= 2.5; reasons.push(`RSI ${ind.rsi.toFixed(0)} — overbought, pullback risk`); }
      else if (ind.rsi > 60) { score -= 1; reasons.push(`RSI ${ind.rsi.toFixed(0)} — elevated`); }
      else reasons.push(`RSI ${ind.rsi.toFixed(0)} — neutral`);
    }

    // MACD
    if (ind.macd) {
      if (ind.macd.cross === 'bullish') { score += 2; reasons.push('Fresh MACD bullish cross'); }
      else if (ind.macd.cross === 'bearish') { score -= 2; reasons.push('Fresh MACD bearish cross'); }
      else if (ind.macd.momentum === 'bullish') { score += 1; reasons.push('MACD histogram positive'); }
      else if (ind.macd.momentum === 'bearish') { score -= 1; reasons.push('MACD histogram negative'); }
    }

    // EMA trend alignment
    const { price, ema20, ema50, ema200 } = ind;
    if (ema50 != null) {
      if (price > ema50) { score += 1; reasons.push('Price above EMA50 — uptrend'); }
      else { score -= 1; reasons.push('Price below EMA50 — downtrend'); }
    }
    if (ema20 != null && ema50 != null && ema200 != null) {
      if (ema20 > ema50 && ema50 > ema200) { score += 1.5; reasons.push('EMAs fully aligned bullish (20>50>200)'); }
      else if (ema20 < ema50 && ema50 < ema200) { score -= 1.5; reasons.push('EMAs fully aligned bearish (20<50<200)'); }
    }

    // 7d momentum
    if (ind.mom7d > 10) { score += 1; reasons.push(`Strong 7d momentum +${ind.mom7d.toFixed(1)}%`); }
    else if (ind.mom7d < -10) { score -= 1; reasons.push(`Weak 7d momentum ${ind.mom7d.toFixed(1)}%`); }

    // Volume trend
    if (ind.volTrend > 25) { score += 0.5; reasons.push('Rising volume confirms interest'); }
    else if (ind.volTrend < -25) { score -= 0.5; reasons.push('Falling volume — fading interest'); }

    // Fear & Greed (contrarian tilt)
    if (fng != null) {
      if (fng <= 25) { score += 1; reasons.push(`Extreme fear (${fng}) — contrarian buy zone`); }
      else if (fng >= 75) { score -= 1; reasons.push(`Extreme greed (${fng}) — market frothy`); }
    }

    // Map score → rating
    let rating;
    if (score >= 5) rating = 'Strong Buy';
    else if (score >= 2.5) rating = 'Buy';
    else if (score > -1.5) rating = 'Hold';
    else if (score > -3.5) rating = 'Reduce';
    else if (score > -5.5) rating = 'Sell';
    else rating = 'Strong Sell';

    const confidence = Math.min(95, Math.round(50 + Math.abs(score) * 6));
    const volatility = ind.bbUpper && ind.bbLower && ind.bbMiddle
      ? (ind.bbUpper - ind.bbLower) / ind.bbMiddle : 0.1;
    const risk = volatility > 0.25 ? 'High' : volatility > 0.12 ? 'Medium' : 'Low';

    const target = ind.resistance ?? null;
    const stopLoss = ind.support ?? null;
    const entry = score >= 2.5
      ? (ind.support ? `Accumulate near support ~${fmt(stopLoss)} or on breakout above ${fmt(target)}` : 'Accumulate on dips')
      : score > -1.5 ? 'Wait for a clearer setup; buy near support only'
      : 'Avoid new entries until trend improves';
    const exit = score <= -2.5
      ? `Reduce into strength; exit below support ${fmt(stopLoss)}`
      : `Take partial profits near resistance ${fmt(target)}; stop below ${fmt(stopLoss)}`;

    return { rating, score: +score.toFixed(1), confidence, reasons, risk, target, stopLoss, entry, exit };
  }

  function fmt(v) {
    if (v == null) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : v >= 1 ? v.toFixed(2) : v.toPrecision(3);
  }

  return { recommend };
})();
if (typeof module !== 'undefined') module.exports = Recommend;
