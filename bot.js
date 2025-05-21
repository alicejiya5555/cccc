import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";
import express from "express";
import dayjs from "dayjs";

const BOT_TOKEN = "7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk";
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// --- Utility Functions ---

function parseCommand(command) {
  const cmd = command.toLowerCase();
  const match = cmd.match(/^\/([a-z]+)(\d+)(m|h)$/);
  if (!match) return null;
  const [, symbolRaw, intervalNum, intervalUnit] = match;
  const symbol = symbolRaw === "eth" ? "ETHUSDT"
              : symbolRaw === "btc" ? "BTCUSDT"
              : symbolRaw === "link" ? "LINKUSDT"
              : null;
  if (!symbol) return null;
  const interval = `${intervalNum}${intervalUnit}`;
  return { symbol, interval };
}

async function fetchCandles(symbol, interval, limit = 200) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await axios.get(url);
  if (!response.data) throw new Error("No data from Binance");
  return response.data.map(candle => ({
    openTime: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
    closeTime: candle[6],
    quoteAssetVolume: parseFloat(candle[7]),
    numberOfTrades: candle[8],
    takerBuyBaseVolume: parseFloat(candle[9]),
    takerBuyQuoteVolume: parseFloat(candle[10])
  }));
}

function calculateVWAP(candles, period) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  let cumPV = 0;
  let cumVol = 0;
  for (const c of slice) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumPV += typicalPrice * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? null : cumPV / cumVol;
}

// Custom implementations for indicators not in technicalindicators package:

// KDJ Indicator
function calculateKDJ(high, low, close, period = 14, kPeriod = 3, dPeriod = 3) {
  // Calculate RSV (Raw Stochastic Value)
  const rsv = [];
  for (let i = period - 1; i < close.length; i++) {
    const lowPeriod = Math.min(...low.slice(i - period + 1, i + 1));
    const highPeriod = Math.max(...high.slice(i - period + 1, i + 1));
    const r = ((close[i] - lowPeriod) / (highPeriod - lowPeriod)) * 100;
    rsv.push(r);
  }
  // Smooth RSV with SMA kPeriod and dPeriod
  let k = [], d = [], j = [];
  let kPrev = 50, dPrev = 50;
  for (let i = 0; i < rsv.length; i++) {
    const kCurrent = (1 / kPeriod) * rsv[i] + ((kPeriod - 1) / kPeriod) * kPrev;
    const dCurrent = (1 / dPeriod) * kCurrent + ((dPeriod - 1) / dPeriod) * dPrev;
    k.push(kCurrent);
    d.push(dCurrent);
    j.push(3 * kCurrent - 2 * dCurrent);
    kPrev = kCurrent;
    dPrev = dCurrent;
  }
  return {
    k: k.length ? k[k.length - 1] : null,
    d: d.length ? d[d.length - 1] : null,
    j: j.length ? j[j.length - 1] : null
  };
}

// Williams %R
function calculateWilliamsR(high, low, close, period = 14) {
  if (close.length < period) return null;
  const highestHigh = Math.max(...high.slice(-period));
  const lowestLow = Math.min(...low.slice(-period));
  const lastClose = close[close.length - 1];
  return ((highestHigh - lastClose) / (highestHigh - lowestLow)) * -100;
}

// CCI - Commodity Channel Index
function calculateCCI(high, low, close, period = 20) {
  if (close.length < period) return null;
  const typicalPrices = close.map((c, i) => (high[i] + low[i] + c) / 3);
  const sma = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const slice = typicalPrices.slice(-period);
  const mean = sma(slice);
  const meanDeviation = slice.reduce((acc, val) => acc + Math.abs(val - mean), 0) / period;
  const lastTp = typicalPrices[typicalPrices.length - 1];
  return meanDeviation === 0 ? 0 : (lastTp - mean) / (0.015 * meanDeviation);
}

// MTM - Momentum
function calculateMTM(close, period = 14) {
  if (close.length <= period) return null;
  return close[close.length - 1] - close[close.length - 1 - period];
}

// Ichimoku components
function calculateIchimoku(candles) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);

  const conversionLinePeriod = 9;
  const baseLinePeriod = 26;
  const leadingSpanBPeriod = 52;

  const high9 = high.slice(-conversionLinePeriod);
  const low9 = low.slice(-conversionLinePeriod);
  const conversionLine = (Math.max(...high9) + Math.min(...low9)) / 2;

  const high26 = high.slice(-baseLinePeriod);
  const low26 = low.slice(-baseLinePeriod);
  const baseLine = (Math.max(...high26) + Math.min(...low26)) / 2;

  const leadingSpanA = (conversionLine + baseLine) / 2;

  const high52 = high.slice(-leadingSpanBPeriod);
  const low52 = low.slice(-leadingSpanBPeriod);
  const leadingSpanB = (Math.max(...high52) + Math.min(...low52)) / 2;

  const laggingSpan = close[close.length - 26] || close[close.length - 1];

  return { conversionLine, baseLine, leadingSpanA, leadingSpanB, laggingSpan };
}

// Supertrend Indicator (simplified)
function calculateSupertrend(candles, period = 7, multiplier = 3) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);

  // ATR Calculation
  const atrValues = ti.ATR.calculate({ high, low, close, period });

  if (atrValues.length === 0) return { value: null, direction: null };

  const lastAtr = atrValues[atrValues.length - 1];
  const hl2 = (high[high.length - 1] + low[low.length - 1]) / 2;

  const upperBand = hl2 + multiplier * lastAtr;
  const lowerBand = hl2 - multiplier * lastAtr;

  // Simplified Supertrend: close above upperBand means bullish, below lowerBand means bearish
  const lastClose = close[close.length - 1];
  const direction = lastClose > upperBand ? "Bullish" : lastClose < lowerBand ? "Bearish" : "Neutral";

  // Return middle price as Supertrend value
  return { value: hl2, direction };
}

// Ultimate Oscillator (using periods 7, 14, 28)
function calculateUltimateOscillator(high, low, close) {
  if (close.length < 28) return null;

  // Typical price = (High + Low + Close)/3
  // Buying pressure (BP) = Close - min(Low, previous Close)
  // True range (TR) = max(High, previous Close) - min(Low, previous Close)

  let bp = [];
  let tr = [];

  for (let i = 1; i < close.length; i++) {
    const closePrev = close[i - 1];
    const lowCurr = low[i];
    const highCurr = high[i];
    const closeCurr = close[i];

    const minLowClosePrev = Math.min(lowCurr, closePrev);
    const maxHighClosePrev = Math.max(highCurr, closePrev);

    bp.push(closeCurr - minLowClosePrev);
    tr.push(maxHighClosePrev - minLowClosePrev);
  }

  // Helper to sum arrays in period
  function sumArray(arr, start, length) {
    if (start - length + 1 < 0) return 0;
    return arr.slice(start - length + 1, start + 1).reduce((a, b) => a + b, 0);
  }

  const i = bp.length - 1;

  const avg7 = sumArray(bp, i, 7) / sumArray(tr, i, 7);
  const avg14 = sumArray(bp, i, 14) / sumArray(tr, i, 14);
  const avg28 = sumArray(bp, i, 28) / sumArray(tr, i, 28);

  if ([avg7, avg14, avg28].some(v => isNaN(v) || !isFinite(v))) return null;

  return 100 * ((4 * avg7) + (2 * avg14) + avg28) / 7;
}

// Keltner Channel - based on EMA and ATR
function calculateKeltnerChannel(candles, periodEMA = 20, periodATR = 10, multiplier = 1.5) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);

  const ema = ti.EMA.calculate({ period: periodEMA, values: close });
  const atr = ti.ATR.calculate({ period: periodATR, high, low, close });

  if (ema.length === 0 || atr.length === 0) return null;

  const lastEMA = ema[ema.length - 1];
  const lastATR = atr[atr.length - 1];

  return {
    upper: lastEMA + multiplier * lastATR,
    middle: lastEMA,
    lower: lastEMA - multiplier * lastATR
  };
}

// ROC - Rate of Change
function calculateROC(close, period = 14) {
  if (close.length <= period) return null;
  return ((close[close.length - 1] - close[close.length - 1 - period]) / close[close.length - 1 - period]) * 100;
}

// ADOSC - Chaikin A/D Oscillator
function calculateADOSC(candles, shortPeriod = 3, longPeriod = 10) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  const volume = candles.map(c => c.volume);

  let ad = [];

  for (let i = 0; i < candles.length; i++) {
    const highLowRange = high[i] - low[i];
    const clv = highLowRange === 0 ? 0 : ((close[i] - low[i]) - (high[i] - close[i])) / highLowRange;
    ad.push(clv * volume[i]);
  }

  const emaShort = ti.EMA.calculate({ period: shortPeriod, values: ad });
  const emaLong = ti.EMA.calculate({ period: longPeriod, values: ad });

  if (emaShort.length === 0 || emaLong.length === 0) return null;

  return emaShort[emaShort.length - 1] - emaLong[emaLong.length - 1];
}

// Format values nicely
function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return n.toFixed(decimals);
}

function formatDate(timestamp) {
  return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
}

// --- Bot Command Handler ---

bot.start((ctx) => ctx.reply("Welcome! Use commands like /eth1h, /btc15m, /link4h to get live indicator data."));

bot.on("text", async (ctx) => {
  const command = ctx.message.text.trim();
  const parsed = parseCommand(command);
  if (!parsed) {
    await ctx.reply("Invalid command format. Use /eth1h, /btc15m, /link4h etc.");
    return;
  }

  const { symbol, interval } = parsed;

  try {
    await ctx.reply(`Fetching ${symbol} data for interval ${interval}...`);

    const candles = await fetchCandles(symbol, interval);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    const volume = candles.map(c => c.volume);

    // Calculate indicators
    const lastClose = close[close.length - 1];
    const lastOpen = candles[candles.length - 1].open;

    // VWAP 14 & 20
    const vwap14 = calculateVWAP(candles, 14);
    const vwap20 = calculateVWAP(candles, 20);

    // EMA 5, 10, 20, 50, 100, 200
    const ema5 = ti.EMA.calculate({ period: 5, values: close }).slice(-1)[0];
    const ema10 = ti.EMA.calculate({ period: 10, values: close }).slice(-1)[0];
    const ema20 = ti.EMA.calculate({ period: 20, values: close }).slice(-1)[0];
    const ema50 = ti.EMA.calculate({ period: 50, values: close }).slice(-1)[0];
    const ema100 = ti.EMA.calculate({ period: 100, values: close }).slice(-1)[0];
    const ema200 = ti.EMA.calculate({ period: 200, values: close }).slice(-1)[0];

    // SMA 5, 10, 20, 50, 100, 200
    const sma5 = ti.SMA.calculate({ period: 5, values: close }).slice(-1)[0];
    const sma10 = ti.SMA.calculate({ period: 10, values: close }).slice(-1)[0];
    const sma20 = ti.SMA.calculate({ period: 20, values: close }).slice(-1)[0];
    const sma50 = ti.SMA.calculate({ period: 50, values: close }).slice(-1)[0];
    const sma100 = ti.SMA.calculate({ period: 100, values: close }).slice(-1)[0];
    const sma200 = ti.SMA.calculate({ period: 200, values: close }).slice(-1)[0];

    // RSI 7, 14
    const rsi7 = ti.RSI.calculate({ period: 7, values: close }).slice(-1)[0];
    const rsi14 = ti.RSI.calculate({ period: 14, values: close }).slice(-1)[0];

    // MACD (fast=12, slow=26, signal=9)
    const macd = ti.MACD.calculate({ values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).slice(-1)[0];

    // Stochastic RSI 7,14
    const stochrsi = ti.StochasticRSI.calculate({ values: close, rsiPeriod: 14, stochasticPeriod: 7, kPeriod: 3, dPeriod: 3 }).slice(-1)[0];

    // ATR 14
    const atr = ti.ATR.calculate({ high, low, close, period: 14 }).slice(-1)[0];

    // ADX 14
    const adx = ti.ADX.calculate({ high, low, close, period: 14 }).slice(-1)[0];

    // CCI 20 (custom)
    const cci = calculateCCI(high, low, close, 20);

    // Williams %R 14 (custom)
    const williamsR = calculateWilliamsR(high, low, close, 14);

    // KDJ (custom)
    const kdj = calculateKDJ(high, low, close);

    // MTM 14 (custom)
    const mtm = calculateMTM(close, 14);

    // Ichimoku (custom)
    const ichimoku = calculateIchimoku(candles);

    // Supertrend (custom)
    const supertrend = calculateSupertrend(candles);

    // Ultimate Oscillator (custom)
    const ultimateOsc = calculateUltimateOscillator(high, low, close);

    // Keltner Channel (custom)
    const keltner = calculateKeltnerChannel(candles);

    // ROC 14 (custom)
    const roc = calculateROC(close, 14);

    // ADOSC (custom)
    const adosc = calculateADOSC(candles);

    // Format output message
    let message = `📊 <b>${symbol} / Interval: ${interval}</b>\n`;
    message += `🕒 Time: ${formatDate(candles[candles.length - 1].closeTime)}\n\n`;

    message += `<b>Price:</b> Open: ${formatNumber(lastOpen)} / Close: ${formatNumber(lastClose)}\n`;
    message += `<b>VWAP:</b> 14: ${formatNumber(vwap14)} | 20: ${formatNumber(vwap20)}\n\n`;

    message += `<b>EMA:</b> 5: ${formatNumber(ema5)} | 10: ${formatNumber(ema10)} | 20: ${formatNumber(ema20)} | 50: ${formatNumber(ema50)} | 100: ${formatNumber(ema100)} | 200: ${formatNumber(ema200)}\n`;
    message += `<b>SMA:</b> 5: ${formatNumber(sma5)} | 10: ${formatNumber(sma10)} | 20: ${formatNumber(sma20)} | 50: ${formatNumber(sma50)} | 100: ${formatNumber(sma100)} | 200: ${formatNumber(sma200)}\n\n`;

    message += `<b>RSI:</b> 7: ${formatNumber(rsi7)} | 14: ${formatNumber(rsi14)}\n`;
    if(macd){
      message += `<b>MACD:</b> MACD: ${formatNumber(macd.MACD)} | Signal: ${formatNumber(macd.signal)} | Histogram: ${formatNumber(macd.histogram)}\n`;
    } else {
      message += `<b>MACD:</b> -\n`;
    }
    if(stochrsi){
      message += `<b>Stoch RSI:</b> K: ${formatNumber(stochrsi.k)} | D: ${formatNumber(stochrsi.d)}\n\n`;
    }

    message += `<b>ATR (14):</b> ${formatNumber(atr)} | <b>ADX (14):</b> ${adx ? formatNumber(adx.adx) : "-"}\n`;
    message += `<b>CCI (20):</b> ${formatNumber(cci)} | <b>Williams %R (14):</b> ${formatNumber(williamsR)}\n`;
    message += `<b>KDJ:</b> K: ${formatNumber(kdj.k)} | D: ${formatNumber(kdj.d)} | J: ${formatNumber(kdj.j)}\n`;
    message += `<b>MTM (14):</b> ${formatNumber(mtm)}\n\n`;

    message += `<b>Ichimoku:</b> Tenkan: ${formatNumber(ichimoku.tenkan)} | Kijun: ${formatNumber(ichimoku.kijun)} | SenkouA: ${formatNumber(ichimoku.senkouA)} | SenkouB: ${formatNumber(ichimoku.senkouB)}\n`;
    message += `<b>Supertrend:</b> ${supertrend ? formatNumber(supertrend.supertrend) : "-"}\n`;
    message += `<b>Ultimate Oscillator:</b> ${formatNumber(ultimateOsc)}\n`;
    if(keltner){
      message += `<b>Keltner Channel:</b> Upper: ${formatNumber(keltner.upper)} | Middle: ${formatNumber(keltner.middle)} | Lower: ${formatNumber(keltner.lower)}\n`;
    } else {
      message += `<b>Keltner Channel:</b> -\n`;
    }
    message += `<b>ROC (14):</b> ${formatNumber(roc)}\n`;
    message += `<b>ADOSC:</b> ${formatNumber(adosc)}\n`;

    await ctx.replyWithHTML(message);

  } catch (error) {
    console.error(error);
    await ctx.reply("Error fetching data or calculating indicators.");
  }
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
