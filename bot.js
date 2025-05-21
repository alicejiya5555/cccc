import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const bot = new Telegraf(BOT_TOKEN);

const PORT = process.env.PORT || 3000;

// Parse command: /eth1h => { symbol: 'ETHUSDT', interval: '1h' }
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

// Fetch OHLCV candles from Binance API
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
    closeTime: candle[6]
  }));
}

// Calculate VWAP helper
function calculateVWAP(candles, period) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  let cumPV = 0;
  let cumVol = 0;
  for (const c of slice) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const pv = typicalPrice * c.volume;
    cumPV += pv;
    cumVol += c.volume;
  }
  return cumVol === 0 ? null : cumPV / cumVol;
}

// Calculate all indicators
function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);
  const open = candles.map(c => c.open);

  const last = arr => (arr && arr.length) ? arr[arr.length - 1] : null;

  // SMA, EMA, WMA
  const sma = p => ti.SMA.calculate({ period: p, values: close });
  const ema = p => ti.EMA.calculate({ period: p, values: close });
  const wma = p => ti.WMA.calculate({ period: p, values: close });

  // Defensive wrapper to catch errors for indicator calculation
  function safeLastCalc(fn) {
    try {
      return last(fn);
    } catch {
      return null;
    }
  }

  // Indicators with safe wrappers
  const rsi5 = safeLastCalc(() => ti.RSI.calculate({ period: 5, values: close }));
  const rsi14 = safeLastCalc(() => ti.RSI.calculate({ period: 14, values: close }));

  const macd = safeLastCalc(() => ti.MACD.calculate({
    values: close,
    fastPeriod: 3,
    slowPeriod: 10,
    signalPeriod: 16,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }));

  const stochRSI = safeLastCalc(() => ti.StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3
  }));

  const dmi = safeLastCalc(() => ti.DMI.calculate({ high, low, close, period: 14 }));

  const mfi14 = safeLastCalc(() => ti.MFI.calculate({ high, low, close, volume, period: 14 }));
  const mfi21 = safeLastCalc(() => ti.MFI.calculate({ high, low, close, volume, period: 21 }));

  const bb = safeLastCalc(() => ti.BollingerBands.calculate({ period: 20, values: close, stdDev: 2 }));

  const vwap1 = calculateVWAP(candles, 1);
  const vwap5 = calculateVWAP(candles, 5);

  const trix = safeLastCalc(() => ti.TRIX.calculate({ values: close, period: 9 }));

  const atr = safeLastCalc(() => ti.ATR.calculate({ high, low, close, period: 14 }));

  const obv = safeLastCalc(() => ti.OBV.calculate({ close, volume }));

  const sar = safeLastCalc(() => ti.SAR.calculate({ high, low, step: 0.02, max: 0.2 }));

  const williamsR = safeLastCalc(() => ti.WilliamsR.calculate({ high, low, close, period: 14 }));

  const cci7 = safeLastCalc(() => ti.CCI.calculate({ high, low, close, period: 7 }));
  const cci10 = safeLastCalc(() => ti.CCI.calculate({ high, low, close, period: 10 }));
  const cci20 = safeLastCalc(() => ti.CCI.calculate({ high, low, close, period: 20 }));

  const mtm7 = safeLastCalc(() => ti.MTM.calculate({ values: close, period: 7 }));
  const mtm14 = safeLastCalc(() => ti.MTM.calculate({ values: close, period: 14 }));
  const mtm21 = safeLastCalc(() => ti.MTM.calculate({ values: close, period: 21 }));

  const stochastic = safeLastCalc(() => ti.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }));

  const uo = safeLastCalc(() => ti.UO.calculate({ high, low, close, period1: 7, period2: 14, period3: 28, weight1: 4, weight2: 2, weight3: 1 }));
  const cmo = safeLastCalc(() => ti.CMO.calculate({ period: 14, values: close }));
  const kst = safeLastCalc(() => ti.KST.calculate({ close, roc1: 10, roc2: 15, roc3: 20, roc4: 30, sma1: 10, sma2: 10, sma3: 10, sma4: 15 }));
  const emv = safeLastCalc(() => ti.EaseOfMovement.calculate({ high, low, volume, period: 14 }));
  const dpo = safeLastCalc(() => ti.DPO.calculate({ values: close, period: 14 }));
  const roc = safeLastCalc(() => ti.ROC.calculate({ values: close, period: 14 }));

  const donchian = safeLastCalc(() => ti.DonchianChannels.calculate({ high, low, period: 20 }));

  const aroon = safeLastCalc(() => ti.Aroon.calculate({ period: 25, values: close }));

  const massIndex = safeLastCalc(() => ti.MassIndex.calculate({ high, low, period: 25 }));

  const chaikin = safeLastCalc(() => ti.ChaikinOscillator.calculate({ high, low, close, volume, fastPeriod: 3, slowPeriod: 10 }));

  return {
    sma: { 5: last(sma(5)), 13: last(sma(13)), 21: last(sma(21)), 50: last(sma(50)) },
    ema: { 5: last(ema(5)), 13: last(ema(13)), 21: last(ema(21)), 50: last(ema(50)) },
    wma: { 5: last(wma(5)), 13: last(wma(13)), 21: last(wma(21)), 50: last(wma(50)) },
    rsi: { 5: rsi5, 14: rsi14 },
    macd,
    stochRSI,
    dmi,
    mfi: { 14: mfi14, 21: mfi21 },
    bb,
    vwap: { 1: vwap1, 5: vwap5 },
    trix,
    atr,
    obv,
    sar,
    williamsR,
    cci: { 7: cci7, 10: cci10, 20: cci20 },
    mtm: { 7: mtm7, 14: mtm14, 21: mtm21 },
    stochastic,
    uo,
    cmo,
    kst,
    emv,
    dpo,
    roc,
    donchian,
    aroon,
    massIndex,
    chaikin
  };
}

function formatIndicatorOutput(indicators, symbol, interval) {
  // Defensive fallback values
  const macdHist = indicators.macd?.histogram ?? "N/A";
  const macdSignal = indicators.macd?.signal ?? "N/A";
  const macdMacd = indicators.macd?.MACD ?? "N/A";

  return `
*${symbol}* — Interval: *${interval}*

*RSI:* 5 = ${indicators.rsi[5]?.toFixed(2) ?? "N/A"}, 14 = ${indicators.rsi[14]?.toFixed(2) ?? "N/A"}
*MACD:* MACD = ${macdMacd?.toFixed(4) ?? "N/A"}, Signal = ${macdSignal?.toFixed(4) ?? "N/A"}, Histogram = ${macdHist?.toFixed(4) ?? "N/A"}

*VWAP:* 1 = ${indicators.vwap[1]?.toFixed(4) ?? "N/A"}, 5 = ${indicators.vwap[5]?.toFixed(4) ?? "N/A"}

*Bollinger Bands:* Lower = ${indicators.bb?.lower?.toFixed(4) ?? "N/A"}, Middle = ${indicators.bb?.middle?.toFixed(4) ?? "N/A"}, Upper = ${indicators.bb?.upper?.toFixed(4) ?? "N/A"}

*ATR:* ${indicators.atr?.toFixed(4) ?? "N/A"}
*OBV:* ${indicators.obv?.toFixed(2) ?? "N/A"}

*Stoch RSI:* K = ${indicators.stochRSI?.k?.toFixed(2) ?? "N/A"}, D = ${indicators.stochRSI?.d?.toFixed(2) ?? "N/A"}

*DMI:* +DI = ${indicators.dmi?.pdi?.toFixed(2) ?? "N/A"}, -DI = ${indicators.dmi?.mdi?.toFixed(2) ?? "N/A"}, ADX = ${indicators.dmi?.adx?.toFixed(2) ?? "N/A"}

*Williams %R:* ${indicators.williamsR?.toFixed(2) ?? "N/A"}

*CCI (20):* ${indicators.cci[20]?.toFixed(2) ?? "N/A"}

*MTM (14):* ${indicators.mtm[14]?.toFixed(2) ?? "N/A"}

*UO:* ${indicators.uo?.toFixed(2) ?? "N/A"}

*CMO:* ${indicators.cmo?.toFixed(2) ?? "N/A"}

*KST:* ${indicators.kst?.toFixed(2) ?? "N/A"}

*EMV:* ${indicators.emv?.toFixed(2) ?? "N/A"}

*Donchian Channel:* Upper = ${indicators.donchian?.upper?.toFixed(4) ?? "N/A"}, Lower = ${indicators.donchian?.lower?.toFixed(4) ?? "N/A"}

*Chaikin Oscillator:* ${indicators.chaikin?.toFixed(4) ?? "N/A"}
`;
}

// Main handler
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const command = parseCommand(text);

  if (!command) {
    await ctx.reply("Sorry, I didn't understand that command. Please use commands like /eth1h, /btc15m, /link4h.");
    return;
  }

  try {
    await ctx.reply(`Fetching data for ${command.symbol} at interval ${command.interval}...`);

    const candles = await fetchCandles(command.symbol, command.interval);
    if (!candles || candles.length === 0) {
      await ctx.reply("No candle data retrieved.");
      return;
    }

    const indicators = calculateIndicators(candles);

    const message = formatIndicatorOutput(indicators, command.symbol, command.interval);
    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error("Error:", error);
    await ctx.reply("Oops! There was an error fetching or processing data. Please try again later.");
  }
});

// Start polling (or use webhook as needed)
bot.launch()
  .then(() => console.log("Bot started"))
  .catch(err => console.error("Bot launch error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
