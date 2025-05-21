const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const token = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const bot = new TelegramBot(token, { polling: true });
const app = express();
const PORT = process.env.PORT || 3000;

// Map commands to Binance symbols and intervals
const symbolsMap = {
  eth1h: { symbol: 'ETHUSDT', interval: '1h', name: 'ETH' },
  eth4h: { symbol: 'ETHUSDT', interval: '4h', name: 'ETH' },
  eth12h: { symbol: 'ETHUSDT', interval: '12h', name: 'ETH' },
  btc1h: { symbol: 'BTCUSDT', interval: '1h', name: 'BTC' },
  btc4h: { symbol: 'BTCUSDT', interval: '4h', name: 'BTC' },
  btc12h: { symbol: 'BTCUSDT', interval: '12h', name: 'BTC' },
  link1h: { symbol: 'LINKUSDT', interval: '1h', name: 'LINK' },
  link4h: { symbol: 'LINKUSDT', interval: '4h', name: 'LINK' },
  link12h: { symbol: 'LINKUSDT', interval: '12h', name: 'LINK' }
};

// Indicator periods & params
const smaPeriods = [5, 13, 21, 50, 100, 200];
const emaPeriods = smaPeriods;
const wmaPeriods = smaPeriods;
const rsiPeriods = [5, 14];
const stochRsiParams = { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 };
const macdParams = { fast: 3, slow: 10, signal: 16 };
const dmiPeriod = 14;
const trixPeriod = 9;
const cciPeriods = [7, 10, 20];
const mtmPeriods = [7, 14, 21];
const mfiPeriods = [14, 21];
const sarParams = { step: 0.02, maxStep: 0.2 };
const williamsRPeriod = 14;
const atrPeriod = 14;
const rocPeriod = 14;

// Utility to format numbers
function formatNum(num, decimals = 4) {
  if (num === null || num === undefined || isNaN(num)) return 'n/a';
  return parseFloat(num).toFixed(decimals);
}

// Fetch Klines (candlesticks) - returns array of klines
async function getKlines(symbol, interval, limit = 250) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await axios.get(url);
  return response.data;
}

// Extract close prices from klines
function extractCloses(klines) {
  return klines.map(k => parseFloat(k[4]));
}
function extractHighs(klines) {
  return klines.map(k => parseFloat(k[2]));
}
function extractLows(klines) {
  return klines.map(k => parseFloat(k[3]));
}
function extractVolumes(klines) {
  return klines.map(k => parseFloat(k[5]));
}
function typicalPrices(klines) {
  return klines.map(k => (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3);
}

// --- SMA ---
function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

// --- EMA ---
function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = calculateSMA(closes.slice(0, period), period);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// --- WMA ---
function calculateWMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  let denominator = (period * (period + 1)) / 2;
  let numerator = 0;
  for (let i = 0; i < period; i++) {
    numerator += slice[i] * (i + 1);
  }
  return numerator / denominator;
}

// --- RSI ---
function calculateRSI(closes, period) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  let rsi = 100 - 100 / (1 + rs);
  // Smooth RSI for rest of data
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    if (losses === 0) rsi = 100;
    else {
      const rs = gains / losses;
      rsi = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

// --- Stoch RSI ---
function calculateStochRSI(closes, rsiPeriod, stochPeriod, kPeriod, dPeriod) {
  const rsiValues = [];
  for (let i = rsiPeriod; i <= closes.length; i++) {
    const slice = closes.slice(i - rsiPeriod, i);
    rsiValues.push(calculateRSI(slice, rsiPeriod));
  }
  if (rsiValues.length < stochPeriod) return null;
  const stochRsiKValues = [];
  for (let i = stochPeriod; i <= rsiValues.length; i++) {
    const window = rsiValues.slice(i - stochPeriod, i);
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);
    const currentRsi = rsiValues[i - 1];
    const stochRsi = (currentRsi - minRsi) / (maxRsi - minRsi);
    stochRsiKValues.push(stochRsi);
  }
  // Smooth %K
  const smoothK = SMAorEMA(stochRsiKValues, kPeriod, 'SMA');
  if (smoothK.length < dPeriod) return null;
  // Smooth %D
  const smoothD = SMAorEMA(smoothK, dPeriod, 'SMA');
  if (smoothD.length === 0) return null;
  return {
    K: smoothK[smoothK.length - 1] * 100,
    D: smoothD[smoothD.length - 1] * 100,
  };
}

// Helper SMA/EMA for arrays
function SMAorEMA(values, period, type = 'SMA') {
  if (values.length < period) return [];
  const results = [];
  if (type === 'SMA') {
    for (let i = period; i <= values.length; i++) {
      const slice = values.slice(i - period, i);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      results.push(avg);
    }
  } else if (type === 'EMA') {
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    results.push(ema);
    const k = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
      results.push(ema);
    }
  }
  return results;
}

// --- MACD ---
function calculateMACD(closes, fastPeriod, slowPeriod, signalPeriod) {
  if (closes.length < slowPeriod + signalPeriod) return null;
  const emaFast = [];
  const emaSlow = [];
  let kFast = 2 / (fastPeriod + 1);
  let kSlow = 2 / (slowPeriod + 1);

  // Calculate EMA fast
  let emaF = calculateSMA(closes.slice(0, fastPeriod), fastPeriod);
  emaFast.push(emaF);
  for (let i = fastPeriod; i < closes.length; i++) {
    emaF = closes[i] * kFast + emaF * (1 - kFast);
    emaFast.push(emaF);
  }
  // Calculate EMA slow
  let emaS = calculateSMA(closes.slice(0, slowPeriod), slowPeriod);
  emaSlow.push(emaS);
  for (let i = slowPeriod; i < closes.length; i++) {
    emaS = closes[i] * kSlow + emaS * (1 - kSlow);
    emaSlow.push(emaS);
  }
  // MACD line = EMA_fast - EMA_slow, align lengths
  let macdLine = [];
  let startIndex = slowPeriod - fastPeriod;
  for (let i = 0; i < emaSlow.length; i++) {
    const idx = i + startIndex;
    if (idx >= 0 && idx < emaFast.length) {
      macdLine.push(emaFast[idx] - emaSlow[i]);
    }
  }
  // Signal line = EMA of MACD line
  let signalLine = [];
  let kSignal = 2 / (signalPeriod + 1);
  let signal = macdLine.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
  signalLine.push(signal);
  for (let i = signalPeriod; i < macdLine.length; i++) {
    signal = macdLine[i] * kSignal + signal * (1 - kSignal);
    signalLine.push(signal);
  }
  // Histogram = MACD line - Signal line
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + signalPeriod - 1] - signalLine[i]);
  }

  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1]
  };
}

// --- ATR ---
function calculateATR(klines, period) {
  if (klines.length <= period) return null;
  const highs = extractHighs(klines);
  const lows = extractLows(klines);
  const closes = extractCloses(klines);
  let trs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

// --- OBV ---
function calculateOBV(klines) {
  if (klines.length < 2) return null;
  const closes = extractCloses(klines);
  const volumes = extractVolumes(klines);
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  return obv;
}

// --- ROC ---
function calculateROC(closes, period) {
  if (closes.length <= period) return null;
  return ((closes[closes.length - 1] - closes[closes.length - 1 - period]) / closes[closes.length - 1 - period]) * 100;
}

// --- Williams %R ---
function calculateWilliamsR(klines, period) {
  if (klines.length < period) return null;
  const highs = extractHighs(klines);
  const lows = extractLows(klines);
  const closes = extractCloses(klines);
  const sliceHigh = highs.slice(-period);
  const sliceLow = lows.slice(-period);
  const highestHigh = Math.max(...sliceHigh);
  const lowestLow = Math.min(...sliceLow);
  const lastClose = closes[closes.length - 1];
  return ((highestHigh - lastClose) / (highestHigh - lowestLow)) * -100;
}

// --- Momentum (MTM) ---
function calculateMomentum(closes, period) {
  if (closes.length <= period) return null;
  return closes[closes.length - 1] - closes[closes.length - 1 - period];
}

// --- MFI ---
function calculateMFI(klines, period) {
  if (klines.length < period + 1) return null;
  let positiveFlow = 0;
  let negativeFlow = 0;
  for (let i = 1; i <= period; i++) {
    const tpCurrent = (parseFloat(klines[klines.length - 1 - period + i][2]) + parseFloat(klines[klines.length - 1 - period + i][3]) + parseFloat(klines[klines.length - 1 - period + i][4])) / 3;
    const tpPrev = (parseFloat(klines[klines.length - 1 - period + i - 1][2]) + parseFloat(klines[klines.length - 1 - period + i - 1][3]) + parseFloat(klines[klines.length - 1 - period + i - 1][4])) / 3;
    const volume = parseFloat(klines[klines.length - 1 - period + i][5]);
    if (tpCurrent > tpPrev) positiveFlow += tpCurrent * volume;
    else negativeFlow += tpCurrent * volume;
  }
  if (negativeFlow === 0) return 100;
  const moneyFlowRatio = positiveFlow / negativeFlow;
  const mfi = 100 - 100 / (1 + moneyFlowRatio);
  return mfi;
}

// --- Parabolic SAR (simplified) ---
function calculateSAR(klines, step = 0.02, maxStep = 0.2) {
  if (klines.length < 2) return null;
  let sar = parseFloat(klines[0][3]); // start with first low
  let ep = parseFloat(klines[0][2]);  // extreme point high
  let af = step;
  let uptrend = true;
  for (let i = 1; i < klines.length; i++) {
    let high = parseFloat(klines[i][2]);
    let low = parseFloat(klines[i][3]);
    if (uptrend) {
      sar = sar + af * (ep - sar);
      if (low < sar) {
        uptrend = false;
        sar = ep;
        ep = low;
        af = step;
      }
      if (high > ep) {
        ep = high;
        af = Math.min(af + step, maxStep);
      }
    } else {
      sar = sar + af * (ep - sar);
      if (high > sar) {
        uptrend = true;
        sar = ep;
        ep = high;
        af = step;
      }
      if (low < ep) {
        ep = low;
        af = Math.min(af + step, maxStep);
      }
    }
  }
  return sar;
}

// --- DMI (ADX simplified) ---
function calculateDMI(klines, period = 14) {
  if (klines.length < period + 1) return null;
  const highs = extractHighs(klines);
  const lows = extractLows(klines);
  const closes = extractCloses(klines);

  let plusDM = 0;
  let minusDM = 0;
  let trSum = 0;

  for (let i = 1; i < klines.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM += (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM += (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }

  if (trSum === 0) return null;
  const plusDI = (plusDM / trSum) * 100;
  const minusDI = (minusDM / trSum) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

  // ADX as average DX over period (simplified)
  let adx = dx;

  return {
    plusDI,
    minusDI,
    adx,
  };
}

// --- ROC ---
function calculateROC(closes, period) {
  if (closes.length <= period) return null;
  return ((closes[closes.length - 1] - closes[closes.length - 1 - period]) / closes[closes.length - 1 - period]) * 100;
}

// --- Compose response message ---
function composeMessage(symbol, interval, closes, klines) {
  let msg = `📊 *${symbol} ${interval} Technical Indicators*\n\n`;

  // SMA
  msg += `*SMA:* `;
  smaPeriods.forEach(p => {
    msg += `${p}: ${formatNum(calculateSMA(closes, p))}  `;
  });
  msg += `\n`;

  // EMA
  msg += `*EMA:* `;
  emaPeriods.forEach(p => {
    msg += `${p}: ${formatNum(calculateEMA(closes, p))}  `;
  });
  msg += `\n`;

  // WMA
  msg += `*WMA:* `;
  wmaPeriods.forEach(p => {
    msg += `${p}: ${formatNum(calculateWMA(closes, p))}  `;
  });
  msg += `\n`;

  // RSI
  msg += `*RSI:* `;
  rsiPeriods.forEach(p => {
    msg += `${p}: ${formatNum(calculateRSI(closes, p))}  `;
  });
  msg += `\n`;

  // Stoch RSI
  const stochRsi = calculateStochRSI(closes, stochRsiParams.rsiPeriod, stochRsiParams.stochPeriod, stochRsiParams.kPeriod, stochRsiParams.dPeriod);
  if (stochRsi) {
    msg += `*Stoch RSI:* K: ${formatNum(stochRsi.K)} D: ${formatNum(stochRsi.D)}\n`;
  }

  // MACD
  const macd = calculateMACD(closes, macdParams.fast, macdParams.slow, macdParams.signal);
  if (macd) {
    msg += `*MACD:* MACD: ${formatNum(macd.macd)} Signal: ${formatNum(macd.signal)} Histogram: ${formatNum(macd.histogram)}\n`;
  }

  // ATR
  const atr = calculateATR(klines, atrPeriod);
  if (atr) {
    msg += `*ATR (${atrPeriod}):* ${formatNum(atr)}\n`;
  }

  // OBV
  const obv = calculateOBV(klines);
  if (obv !== null) {
    msg += `*OBV:* ${formatNum(obv, 0)}\n`;
  }

  // ROC
  const roc = calculateROC(closes, rocPeriod);
  if (roc !== null) {
    msg += `*ROC (${rocPeriod}
