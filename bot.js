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

// Extract highs and lows (needed for many indicators)
function extractHighs(klines) {
  return klines.map(k => parseFloat(k[2]));
}
function extractLows(klines) {
  return klines.map(k => parseFloat(k[3]));
}

// Extract volumes (for OBV, MFI)
function extractVolumes(klines) {
  return klines.map(k => parseFloat(k[5]));
}

// Extract typical prices (used in some indicators)
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
  const emaFast = calculateEMAArray(closes, fastPeriod);
  const emaSlow = calculateEMAArray(closes, slowPeriod);
  const macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + (slowPeriod - fastPeriod)] - emaSlow[i]);
  }
  const signalLine = calculateEMAArray(macdLine, signalPeriod);
  if (!signalLine.length) return null;
  const macdHist = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: macdHist
  };
}

function calculateEMAArray(closes, period) {
  const emaArray = [];
  if (closes.length < period) return emaArray;
  let ema = calculateSMA(closes.slice(0, period), period);
  emaArray.push(ema);
  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
}

// --- Bollinger Bands ---
function calculateBollingerBands(closes, period = 20, stdDevMult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = calculateSMA(closes, period);
  const variance = slice.reduce((acc, val) => acc + (val - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + stdDevMult * stdDev,
    middle: sma,
    lower: sma - stdDevMult * stdDev
  };
}

// --- OBV ---
function calculateOBV(closes, volumes) {
  if (closes.length !== volumes.length) return null;
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  return obv;
}

// --- ATR ---
function calculateATR(highs, lows, closes, period) {
  if (highs.length < period + 1) return null;
  const trs = [];
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

// --- ROC ---
function calculateROC(closes, period) {
  if (closes.length <= period) return null;
  return ((closes[closes.length - 1] - closes[closes.length - 1 - period]) / closes[closes.length - 1 - period]) * 100;
}

// --- VWAP (approximate) ---
function calculateVWAP(klines, period) {
  if (klines.length < period) return null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (let i = klines.length - period; i < klines.length; i++) {
    const typicalPrice = (parseFloat(klines[i][2]) + parseFloat(klines[i][3]) + parseFloat(klines[i][4])) / 3;
    const volume = parseFloat(klines[i][5]);
    cumulativePV += typicalPrice * volume;
    cumulativeVolume += volume;
  }
  return cumulativePV / cumulativeVolume;
}

// --- DMI & ADX (simplified) ---
function calculateDMI(highs, lows, closes, period) {
  if (highs.length < period + 1) return null;
  const plusDM = [];
  const minusDM = [];
  const tr = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  function smooth(arr) {
    let smoothed = [];
    let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
    smoothed[period - 1] = sum;
    for (let i = period; i < arr.length; i++) {
      sum = smoothed[i - 1] - (smoothed[i - 1] / period) + arr[i];
      smoothed[i] = sum;
    }
    return smoothed;
  }
  const smPlusDM = smooth(plusDM);
  const smMinusDM = smooth(minusDM);
  const smTR = smooth(tr);
  if (!smPlusDM.length || !smMinusDM.length || !smTR.length) return null;
  const plusDI = (smPlusDM[smPlusDM.length - 1] / smTR[smTR.length - 1]) * 100;
  const minusDI = (smMinusDM[smMinusDM.length - 1] / smTR[smTR.length - 1]) * 100;
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  // ADX smooth
  let adx = dx;
  // For simplicity, just return current dx as ADX (real ADX needs longer smoothing)
  return {
    plusDI,
    minusDI,
    adx
  };
}

// --- CCI ---
function calculateCCI(klines, period) {
  if (klines.length < period) return null;
  const typicalPricesArr = typicalPrices(klines);
  const slice = typicalPricesArr.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = slice.reduce((acc, val) => acc + Math.abs(val - sma), 0) / period;
  if (meanDeviation === 0) return null;
  const lastTypicalPrice = typicalPricesArr[typicalPricesArr.length - 1];
  return (lastTypicalPrice - sma) / (0.015 * meanDeviation);
}

// --- Williams %R ---
function calculateWilliamsR(highs, lows, closes, period) {
  if (highs.length < period) return null;
  const highSlice = highs.slice(-period);
  const lowSlice = lows.slice(-period);
  const highestHigh = Math.max(...highSlice);
  const lowestLow = Math.min(...lowSlice);
  const lastClose = closes[closes.length - 1];
  return ((highestHigh - lastClose) / (highestHigh - lowestLow)) * -100;
}

// --- SAR (Parabolic SAR) ---
function calculateSAR(highs, lows, step = 0.02, maxStep = 0.2) {
  // Simple implementation (needs at least 2 bars)
  if (highs.length < 2) return null;
  let sar = lows[0];
  let ep = highs[0];
  let af = step;
  let upTrend = true;
  let sarArr = [];
  for (let i = 1; i < highs.length; i++) {
    sar = sar + af * (ep - sar);
    if (upTrend) {
      if (lows[i] < sar) {
        upTrend = false;
        sar = ep;
        ep = lows[i];
        af = step;
      } else {
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (highs[i] > sar) {
        upTrend = true;
        sar = ep;
        ep = highs[i];
        af = step;
      } else {
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + step, maxStep);
        }
      }
    }
    sarArr.push(sar);
  }
  return sarArr[sarArr.length - 1];
}

// --- TRIX ---
function calculateTRIX(closes, period) {
  if (closes.length < period * 3) return null;
  // Triple EMA smooth
  let ema1 = calculateEMAArray(closes, period);
  let ema2 = calculateEMAArray(ema1, period);
  let ema3 = calculateEMAArray(ema2, period);
  if (ema3.length < 2) return null;
  const trixValue = ((ema3[ema3.length - 1] - ema3[ema3.length - 2]) / ema3[ema3.length - 2]) * 100;
  return trixValue;
}

// --- MTM (Momentum) ---
function calculateMTM(closes, period) {
  if (closes.length <= period) return null;
  return closes[closes.length - 1] - closes[closes.length - 1 - period];
}

// --- KDJ ---
function calculateKDJ(klines, period = 14) {
  if (klines.length < period) return null;
  const highs = klines.map(k => parseFloat(k[2]));
  const lows = klines.map(k => parseFloat(k[3]));
  const closes = klines.map(k => parseFloat(k[4]));
  let rsv = 0;
  const lowPeriod = Math.min(klines.length, period);
  const highPeriod = Math.min(klines.length, period);
  const recentLow = Math.min(...lows.slice(-lowPeriod));
  const recentHigh = Math.max(...highs.slice(-highPeriod));
  const lastClose = closes[closes.length - 1];
  rsv = ((lastClose - recentLow) / (recentHigh - recentLow)) * 100;
  // For simplicity, just return RSV as K, D, J are smoothed values (would require historical data)
  return {
    k: rsv,
    d: rsv,
    j: 3 * rsv - 2 * rsv
  };
}

// --- Volume ---
function calculateVolume(klines) {
  return klines.reduce((acc, k) => acc + parseFloat(k[5]), 0);
}

// --- Williams %R ---
function calculateWilliamsR(highs, lows, closes, period) {
  if (highs.length < period) return null;
  const highSlice = highs.slice(-period);
  const lowSlice = lows.slice(-period);
  const highestHigh = Math.max(...highSlice);
  const lowestLow = Math.min(...lowSlice);
  const lastClose = closes[closes.length - 1];
  return ((highestHigh - lastClose) / (highestHigh - lowestLow)) * -100;
}

// Telegram Bot setup

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Helper: Send message to chat
async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown"
    });
  } catch (error) {
    console.error("Error sending message:", error.message);
  }
}

// Endpoint for Telegram webhook
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) {
    return res.sendStatus(200);
  }
  const chatId = message.chat.id;
  const text = message.text.trim().toLowerCase();

  // Sample command processing
  if (text === "/start") {
    await sendMessage(chatId, "Welcome to your advanced trading bot. Send me a symbol like BTCUSDT and I will provide technical analysis.");
    return res.sendStatus(200);
  }

  // Parse symbol from message (e.g. BTCUSDT)
  const symbol = text.toUpperCase();

  // Fetch klines data from Binance API
  try {
    const limit = 100;
    const interval = "15m";
    const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const klines = response.data;

    // Extract OHLC and volume data
    const opens = klines.map(k => parseFloat(k[1]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const closes = klines.map(k => parseFloat(k[4]));
    const volumes = klines.map(k => parseFloat(k[5]));

    // Calculate indicators
    const sma20 = calculateSMA(closes, 20)?.toFixed(4);
    const ema20 = calculateEMA(closes, 20)?.toFixed(4);
    const macd = calculateMACD(closes, 12, 26, 9);
    const bbands = calculateBollingerBands(closes, 20, 2);
    const obv = calculateOBV(closes, volumes);
    const atr = calculateATR(highs, lows, closes, 14)?.toFixed(4);
    const roc = calculateROC(closes, 12)?.toFixed(2);
    const vwap = calculateVWAP(klines, 14)?.toFixed(4);
    const dmi = calculateDMI(highs, lows, closes, 14);
    const cci = calculateCCI(klines, 20)?.toFixed(2);
    const willr = calculateWilliamsR(highs, lows, closes, 14)?.toFixed(2);
    const sar = calculateSAR(highs, lows)?.toFixed(4);
    const trix = calculateTRIX(closes, 15)?.toFixed(2);
    const mtm = calculateMTM(closes, 12)?.toFixed(4);
    const kdj = calculateKDJ(klines, 14);

    // Format message
    let messageText = `*Technical Analysis for ${symbol} (15m)*\n\n`;
    messageText += `SMA(20): ${sma20}\n`;
    messageText += `EMA(20): ${ema20}\n`;
    if (macd) {
      messageText += `MACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)}, Histogram: ${macd.histogram.toFixed(4)}\n`;
    }
    if (bbands) {
      messageText += `Bollinger Bands:\n  Upper: ${bbands.upper.toFixed(4)}\n  Middle: ${bbands.middle.toFixed(4)}\n  Lower: ${bbands.lower.toFixed(4)}\n`;
    }
    messageText += `OBV: ${obv}\n`;
    messageText += `ATR(14): ${atr}\n`;
    messageText += `ROC(12): ${roc}%\n`;
    messageText += `VWAP(14): ${vwap}\n`;
    if (dmi) {
      messageText += `DMI: +DI: ${dmi.plusDI.toFixed(2)}, -DI: ${dmi.minusDI.toFixed(2)}, ADX: ${dmi.adx.toFixed(2)}\n`;
    }
    messageText += `CCI(20): ${cci}\n`;
    messageText += `Williams %R(14): ${willr}\n`;
    messageText += `SAR: ${sar}\n`;
    messageText += `TRIX(15): ${trix}\n`;
    messageText += `MTM(12): ${mtm}\n`;
    messageText += `KDJ: K=${kdj.k.toFixed(2)}, D=${kdj.d.toFixed(2)}, J=${kdj.j.toFixed(2)}\n`;

    await sendMessage(chatId, messageText);
  } catch (error) {
    console.error("Error fetching data or calculating indicators:", error.message);
    await sendMessage(chatId, "Sorry, I couldn't retrieve data for that symbol. Please check the symbol and try again.");
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Telegram bot is running on port ${PORT}`);
});
