import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";
import express from "express";

// --- Bot Init ---
const BOT_TOKEN = "7726468556:AAGh0k7uIk0uM3zs0zkqTu7fqGudMS_9x8c";
const bot = new Telegraf(BOT_TOKEN);
const PORT = 3000; // Open port, no env file

// --- Utils ---
function parseCommand(command) {
  const cmd = command.toLowerCase();
  const match = cmd.match(/^\/(\w+)(\d+)(m|h)$/);
  if (!match) return null;
  const [, symbolRaw, intervalNum, intervalUnit] = match;
  const symbol =
    symbolRaw === "eth" ? "ETHUSDT" :
    symbolRaw === "btc" ? "BTCUSDT" :
    symbolRaw === "link" ? "LINKUSDT" :
    null;
  if (!symbol) return null;
  const interval = `${intervalNum}${intervalUnit}`;
  return { symbol, interval };
}

function formatNum(num) {
  if (typeof num !== "number" || isNaN(num)) return "N/A";
  return parseFloat(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

// --- Binance Data Fetch ---
async function getBinanceData(symbol, interval) {
  // 24h ticker
  const priceRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
  // Candles (limit 200 for calculations)
  const candlesRes = await axios.get(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`
  );

  const priceData = priceRes.data;
  const candles = candlesRes.data.map((c) => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));

  return { priceData, candles };
}

// --- Custom Indicator Calculations ---

// VWAP calculation for period n (default 1 or 5)
function calculateVWAP(candles, period = 1) {
  // VWAP = SUM(Typical Price * Volume) / SUM(Volume)
  // Typical Price = (High + Low + Close) / 3
  const tpv = [];
  const vol = [];
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    tpv.push(tp * candles[i].volume);
    vol.push(candles[i].volume);
  }

  // Calculate rolling sum of tpv and volume over 'period'
  const vwapValues = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      vwapValues.push(null);
      continue;
    }
    let tpvSum = 0,
      volSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      tpvSum += tpv[j];
      volSum += vol[j];
    }
    vwapValues.push(tpvSum / volSum);
  }
  return vwapValues;
}

// Supertrend calculation (basic implementation)
function calculateSupertrend(candles, period = 7, multiplier = 3) {
  // ATR calculation needed
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const atr = ti.ATR.calculate({ period, high: highs, low: lows, close: closes });

  // Initialize arrays
  const basicUpperBand = [];
  const basicLowerBand = [];
  const finalUpperBand = [];
  const finalLowerBand = [];
  const supertrend = [];
  let trend = 1; // 1 = uptrend, -1 = downtrend

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      basicUpperBand.push(null);
      basicLowerBand.push(null);
      finalUpperBand.push(null);
      finalLowerBand.push(null);
      supertrend.push(null);
      continue;
    }
    const hl2 = (candles[i].high + candles[i].low) / 2;
    basicUpperBand.push(hl2 + multiplier * atr[i - (period - 1)]);
    basicLowerBand.push(hl2 - multiplier * atr[i - (period - 1)]);
    // Final Bands
    if (i === period - 1) {
      finalUpperBand.push(basicUpperBand[i]);
      finalLowerBand.push(basicLowerBand[i]);
      supertrend.push(basicLowerBand[i]);
      continue;
    }
    // Final Upper Band
    if (basicUpperBand[i] < finalUpperBand[i - 1] || candles[i - 1].close > finalUpperBand[i - 1]) {
      finalUpperBand.push(basicUpperBand[i]);
    } else {
      finalUpperBand.push(finalUpperBand[i - 1]);
    }
    // Final Lower Band
    if (basicLowerBand[i] > finalLowerBand[i - 1] || candles[i - 1].close < finalLowerBand[i - 1]) {
      finalLowerBand.push(basicLowerBand[i]);
    } else {
      finalLowerBand.push(finalLowerBand[i - 1]);
    }
    // Supertrend
    if (supertrend[i - 1] === finalUpperBand[i - 1]) {
      if (candles[i].close <= finalUpperBand[i]) {
        supertrend.push(finalUpperBand[i]);
      } else {
        supertrend.push(finalLowerBand[i]);
        trend = 1;
      }
    } else if (supertrend[i - 1] === finalLowerBand[i - 1]) {
      if (candles[i].close >= finalLowerBand[i]) {
        supertrend.push(finalLowerBand[i]);
      } else {
        supertrend.push(finalUpperBand[i]);
        trend = -1;
      }
    } else {
      supertrend.push(null);
    }
  }
  return supertrend;
}

// Keltner Channel calculation
function calculateKeltnerChannel(candles, period = 20, atrMultiplier = 2) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const ema = ti.EMA.calculate({ period, values: close });
  const atr = ti.ATR.calculate({ period, high, low, close });

  const upperBand = [];
  const lowerBand = [];

  for (let i = 0; i < ema.length; i++) {
    upperBand.push(ema[i] + atrMultiplier * atr[i]);
    lowerBand.push(ema[i] - atrMultiplier * atr[i]);
  }

  return { upperBand, lowerBand };
}

// Ultimate Oscillator calculation
function calculateUltimateOscillator(candles, shortPeriod = 7, mediumPeriod = 14, longPeriod = 28) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  return ti.UltimateOscillator.calculate({ high, low, close, shortPeriod, mediumPeriod, longPeriod }).slice(-1)[0];
}

// Williams %R calculation
function calculateWilliamsR(candles, period = 14) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  return ti.WilliamsR.calculate({ period, high, low, close }).slice(-1)[0];
}

// MTM (Momentum) calculation
function calculateMTM(candles, period) {
  const close = candles.map(c => c.close);
  return ti.MTM.calculate({ period, values: close }).slice(-1)[0];
}

// ROC calculation
function calculateROC(candles, period = 14) {
  const close = candles.map(c => c.close);
  return ti.ROC.calculate({ period, values: close }).slice(-1)[0];
}

// ADOSC (Accumulation/Distribution Oscillator) calculation
function calculateADOSC(candles, fastPeriod = 3, slowPeriod = 10) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  const volume = candles.map(c => c.volume);
  return ti.ADOSC.calculate({ high, low, close, volume, fastPeriod, slowPeriod }).slice(-1)[0];
}

// Accumulation/Distribution calculation
function calculateAccumDist(candles) {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  const volume = candles.map(c => c.volume);
  return ti.ADOSC.calculate({ high, low, close, volume, fastPeriod: 3, slowPeriod: 10 }).slice(-1)[0];
}

// --- Main Indicator Calculation ---
function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  // Basic SMAs & EMAs & WMAs
  const sma5 = ti.SMA.calculate({ period: 5, values: close }).slice(-1)[0];
  const sma13 = ti.SMA.calculate({ period: 13, values: close }).slice(-1)[0];
  const sma21 = ti.SMA.calculate({ period: 21, values: close }).slice(-1)[0];
  const sma50 = ti.SMA.calculate({ period: 50, values: close }).slice(-1)[0];
  const sma100 = ti.SMA.calculate({ period: 100, values: close }).slice(-1)[0];
  const sma200 = ti.SMA.calculate({ period: 200, values: close }).slice(-1)[0];

  const ema5 = ti.EMA.calculate({ period: 5, values: close }).slice(-1)[0];
  const ema8 = ti.EMA.calculate({ period: 8, values: close }).slice(-1)[0];
  const ema13 = ti.EMA.calculate({ period: 13, values: close }).slice(-1)[0];
  const ema21 = ti.EMA.calculate({ period: 21, values: close }).slice(-1)[0];
  const ema50 = ti.EMA.calculate({ period: 50, values: close }).slice(-1)[0];
  const ema100 = ti.EMA.calculate({ period: 100, values: close }).slice(-1)[0];
  const ema200 = ti.EMA.calculate({ period: 200, values: close }).slice(-1)[0];

  // MACD fixed
  const macd = ti.MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }).slice(-1)[0];

  // RSI
  const rsi14 = ti.RSI.calculate({ period: 14, values: close }).slice(-1)[0];
  const rsi5 = ti.RSI.calculate({ period: 5, values: close }).slice(-1)[0];

  // Stochastic RSI 14, 14, 3, 3
  const stochRsi = ti.StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3,
  }).slice(-1)[0];

  // SAR(0.02, 0.2)
  const sar = ti.SAR.calculate({ step: 0.02, max: 0.2, high, low }).slice(-1)[0];

  // ATR(14)
  const atr14 = ti.ATR.calculate({ period: 14, high, low, close }).slice(-1)[0];

  // ADX(14)
  const adx14 = ti.ADX.calculate({ period: 14, high, low, close }).slice(-1)[0];

  // KDJ - K, D, J
  // KDJ is a variation of Stochastic Oscillator:
  // K = %K, D = %D, J = 3*K - 2*D
  const stochastic = ti.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 });
  const lastStoch = stochastic.slice(-1)[0];
  let k = lastStoch ? lastStoch.k : null;
  let d = lastStoch ? lastStoch.d : null;
  let j = k !== null && d !== null ? 3 * k - 2 * d : null;

  // MTM(14)
  const mtm14 = calculateMTM(candles, 14);

  // Williams %R(14)
  const williamsR14 = calculateWilliamsR(candles, 14);

  // Supertrend(7,3)
  const supertrend = calculateSupertrend(candles, 7, 3).slice(-1)[0];

  // Ultimate Oscillator
  const ultimateOsc = calculateUltimateOscillator(candles);

  // Keltner Channel(20,2)
  const keltner = calculateKeltnerChannel(candles, 20, 2);
  const kcUpper = keltner.upperBand.slice(-1)[0];
  const kcLower = keltner.lowerBand.slice(-1)[0];

  // ROC(14)
  const roc14 = calculateROC(candles, 14);

  // VWAP 1 and 5
  const vwap1 = calculateVWAP(candles, 1).slice(-1)[0];
  const vwap5 = calculateVWAP(candles, 5).slice(-1)[0];

  // MFI(14,20)
  const mfi14 = ti.MFI.calculate({ period: 14, high, low, close, volume }).slice(-1)[0];
  const mfi20 = ti.MFI.calculate({ period: 20, high, low, close, volume }).slice(-1)[0];

  // OBV
  const obv = ti.OBV.calculate({ close, volume }).slice(-1)[0];

  // CCI (7, 10, 20)
  const cci7 = ti.CCI.calculate({ period: 7, high, low, close }).slice(-1)[0];
  const cci10 = ti.CCI.calculate({ period: 10, high, low, close }).slice(-1)[0];
  const cci20 = ti.CCI.calculate({ period: 20, high, low, close }).slice(-1)[0];

  // MTM (7,14,21)
  const mtm7 = calculateMTM(candles, 7);
  const mtm21 = calculateMTM(candles, 21);

  // Accumulation/Distribution & ADOSC
  const accumDist = calculateAccumDist(candles);
  const adosc = calculateADOSC(candles);

  return {
    sma5,
    sma13,
    sma21,
    sma50,
    sma100,
    sma200,
    ema5,
    ema8,
    ema13,
    ema21,
    ema50,
    ema100,
    ema200,
    macd,
    rsi14,
    rsi5,
    stochRsi,
    sar,
    atr14,
    adx14,
    kdj: { k, d, j },
    mtm7,
    mtm14,
    mtm21,
    williamsR14,
    supertrend,
    ultimateOsc,
    kcUpper,
    kcLower,
    roc14,
    vwap1,
    vwap5,
    mfi14,
    mfi20,
    obv,
    cci7,
    cci10,
    cci20,
    accumDist,
    adosc,
  };
}

// --- Format message ---
function formatIndicators(ind) {
  return `
SMA: 5:${formatNum(ind.sma5)} 13:${formatNum(ind.sma13)} 21:${formatNum(ind.sma21)} 50:${formatNum(ind.sma50)}
EMA: 5:${formatNum(ind.ema5)} 8:${formatNum(ind.ema8)} 13:${formatNum(ind.ema13)} 21:${formatNum(ind.ema21)} 50:${formatNum(ind.ema50)}
MACD: ${ind.macd ? formatNum(ind.macd.MACD) : "N/A"}, Signal: ${ind.macd ? formatNum(ind.macd.signal) : "N/A"}, Histogram: ${ind.macd ? formatNum(ind.macd.histogram) : "N/A"}
RSI: 14:${formatNum(ind.rsi14)} 5:${formatNum(ind.rsi5)}
StochRSI: K:${formatNum(ind.stochRsi.k)} D:${formatNum(ind.stochRsi.d)}
SAR: ${formatNum(ind.sar)}
ATR(14): ${formatNum(ind.atr14)}
ADX(14): ${formatNum(ind.adx14.AdX)}
KDJ: K:${formatNum(ind.kdj.k)} D:${formatNum(ind.kdj.d)} J:${formatNum(ind.kdj.j)}
MTM: 7:${formatNum(ind.mtm7)} 14:${formatNum(ind.mtm14)} 21:${formatNum(ind.mtm21)}
Williams %R(14): ${formatNum(ind.williamsR14)}
Supertrend: ${formatNum(ind.supertrend)}
Ultimate Oscillator: ${formatNum(ind.ultimateOsc)}
Keltner Channel Upper: ${formatNum(ind.kcUpper)} Lower: ${formatNum(ind.kcLower)}
ROC(14): ${formatNum(ind.roc14)}
VWAP(1): ${formatNum(ind.vwap1)} VWAP(5): ${formatNum(ind.vwap5)}
MFI: 14:${formatNum(ind.mfi14)} 20:${formatNum(ind.mfi20)}
OBV: ${formatNum(ind.obv)}
CCI: 7:${formatNum(ind.cci7)} 10:${formatNum(ind.cci10)} 20:${formatNum(ind.cci20)}
Accum/Dist: ${formatNum(ind.accumDist)}
ADOSC: ${formatNum(ind.adosc)}
  `.trim();
}

// --- Bot Command Handling ---
bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  // Expect commands like /eth1h, /btc4h, /link15m
  if (!text.startsWith("/")) {
    return;
  }
  const parsed = parseCommand(text);
  if (!parsed) {
    await ctx.reply("Please send a valid command like /eth1h or /btc15m");
    return;
  }

  const { symbol, interval } = parsed;

  try {
    await ctx.reply(`Fetching data for ${symbol} interval ${interval}...`);
    const { priceData, candles } = await getBinanceData(symbol, interval);
    const indicators = calculateIndicators(candles);
    const message = `
Symbol: ${symbol}
Interval: ${interval}
Price: $${formatNum(parseFloat(priceData.lastPrice))}
24h Change: ${formatNum(parseFloat(priceData.priceChangePercent))}%

Indicators:
${formatIndicators(indicators)}
    `;
    await ctx.reply(message);
  } catch (error) {
    console.error(error);
    await ctx.reply("Error fetching or calculating indicators.");
  }
});

// --- Express webhook for bot ---
const app = express();
app.use(express.json());
app.use(bot.webhookCallback("/bot"));
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
bot.telegram.setWebhook(`https://yourdomain.com/bot`); // Change this to your domain + /bot

