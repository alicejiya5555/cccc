import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";

const BOT_TOKEN = process.env.BOT_TOKEN || "7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk";
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

  const last = arr => arr.length ? arr[arr.length - 1] : null;

  // SMA, EMA, WMA
  const sma = p => ti.SMA.calculate({ period: p, values: close });
  const ema = p => ti.EMA.calculate({ period: p, values: close });
  const wma = p => ti.WMA.calculate({ period: p, values: close });

  // Indicators
  const rsi5 = last(ti.RSI.calculate({ period: 5, values: close }));
  const rsi14 = last(ti.RSI.calculate({ period: 14, values: close }));

  const macd = last(ti.MACD.calculate({
    values: close,
    fastPeriod: 3,
    slowPeriod: 10,
    signalPeriod: 16,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }));

  const stochRSI = last(ti.StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3
  }));

  const dmi = last(ti.DMI.calculate({ high, low, close, period: 14 }));

  const mfi14 = last(ti.MFI.calculate({ high, low, close, volume, period: 14 }));
  const mfi21 = last(ti.MFI.calculate({ high, low, close, volume, period: 21 }));

  const bb = last(ti.BollingerBands.calculate({ period: 20, values: close, stdDev: 2 }));

  const vwap1 = calculateVWAP(candles, 1);
  const vwap5 = calculateVWAP(candles, 5);

  const trix = last(ti.TRIX.calculate({ values: close, period: 9 }));

  const atr = last(ti.ATR.calculate({ high, low, close, period: 14 }));

  const obv = last(ti.OBV.calculate({ close, volume }));

  const sar = last(ti.SAR.calculate({ high, low, step: 0.02, max: 0.2 }));

  const williamsR = last(ti.WilliamsR.calculate({ high, low, close, period: 14 }));

  const cci7 = last(ti.CCI.calculate({ high, low, close, period: 7 }));
  const cci10 = last(ti.CCI.calculate({ high, low, close, period: 10 }));
  const cci20 = last(ti.CCI.calculate({ high, low, close, period: 20 }));

  const mtm7 = last(ti.MTM.calculate({ values: close, period: 7 }));
  const mtm14 = last(ti.MTM.calculate({ values: close, period: 14 }));
  const mtm21 = last(ti.MTM.calculate({ values: close, period: 21 }));

  const stochastic = last(ti.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }));

  // New indicators
  const uo = last(ti.UO.calculate({ high, low, close, period1: 7, period2: 14, period3: 28, weight1: 4, weight2: 2, weight3: 1 }));
  const cmo = last(ti.CMO.calculate({ period: 14, values: close }));
  const kst = last(ti.KST.calculate({ close, roc1: 10, roc2: 15, roc3: 20, roc4: 30, sma1: 10, sma2: 10, sma3: 10, sma4: 15 }));
  const emv = last(ti.EaseOfMovement.calculate({ high, low, volume, period: 14 }));
  const dpo = last(ti.DPO.calculate({ values: close, period: 14 }));
  const roc = last(ti.ROC.calculate({ values: close, period: 14 }));

  const donchian = last(ti.DonchianChannels.calculate({ high, low, period: 20 }));

  const aroon = last(ti.Aroon.calculate({ period: 25, values: close }));

  const massIndex = last(ti.MassIndex.calculate({ high, low, period: 25 }));

  const chaikin = last(ti.ChaikinOscillator.calculate({ high, low, close, volume, fastPeriod: 3, slowPeriod: 10 }));

  return {
    sma: { 5: last(sma(5)), 13: last(sma(13)), 21: last(sma(21)), 50: last(sma(50)), 100: last(sma(100)), 200: last(sma(200)) },
    ema: { 5: last(ema(5)), 13: last(ema(13)), 21: last(ema(21)), 50: last(ema(50)), 100: last(ema(100)), 200: last(ema(200)) },
    wma: { 5: last(wma(5)), 13: last(wma(13)), 21: last(wma(21)), 50: last(wma(50)), 100: last(wma(100)) },
    rsi5,
    rsi14,
    macd,
    stochRSI,
    dmi,
    mfi14,
    mfi21,
    bb,
    vwap1,
    vwap5,
    trix,
    atr,
    obv,
    sar,
    williamsR,
    cci7,
    cci10,
    cci20,
    mtm7,
    mtm14,
    mtm21,
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

// Format message output for Telegram
function formatIndicatorOutput(indicators) {
  return `
📊 *Technical Indicators Summary*

*SMA:* 5=${indicators.sma[5]?.toFixed(4)}, 13=${indicators.sma[13]?.toFixed(4)}, 21=${indicators.sma[21]?.toFixed(4)}, 50=${indicators.sma[50]?.toFixed(4)}, 100=${indicators.sma[100]?.toFixed(4)}, 200=${indicators.sma[200]?.toFixed(4)}

*EMA:* 5=${indicators.ema[5]?.toFixed(4)}, 13=${indicators.ema[13]?.toFixed(4)}, 21=${indicators.ema[21]?.toFixed(4)}, 50=${indicators.ema[50]?.toFixed(4)}, 100=${indicators.ema[100]?.toFixed(4)}, 200=${indicators.ema[200]?.toFixed(4)}

*WMA:* 5=${indicators.wma[5]?.toFixed(4)}, 13=${indicators.wma[13]?.toFixed(4)}, 21=${indicators.wma[21]?.toFixed(4)}, 50=${indicators.wma[50]?.toFixed(4)}, 100=${indicators.wma[100]?.toFixed(4)}

*RSI:* 5=${indicators.rsi5?.toFixed(2)}, 14=${indicators.rsi14?.toFixed(2)}

*MACD:* ${indicators.macd ? `MACD=${indicators.macd.MACD.toFixed(4)}, Signal=${indicators.macd.signal.toFixed(4)}` : "N/A"}

*StochRSI:* ${indicators.stochRSI?.k?.toFixed(4)}, D=${indicators.stochRSI?.d?.toFixed(4)}

*DMI:* ${indicators.dmi ? `PDI=${indicators.dmi.pdi.toFixed(2)}, MDI=${indicators.dmi.mdi.toFixed(2)}, ADX=${indicators.dmi.adx.toFixed(2)}` : "N/A"}

*MFI:* 14=${indicators.mfi14?.toFixed(2)}, 21=${indicators.mfi21?.toFixed(2)}

*Bollinger Bands:* Middle=${indicators.bb?.middle?.toFixed(4)}, Upper=${indicators.bb?.upper?.toFixed(4)}, Lower=${indicators.bb?.lower?.toFixed(4)}

*VWAP:* 1=${indicators.vwap1?.toFixed(4)}, 5=${indicators.vwap5?.toFixed(4)}

*TRIX:* ${indicators.trix?.toFixed(4)}

*ATR:* ${indicators.atr?.toFixed(4)}

*OBV:* ${indicators.obv?.toFixed(4)}

*SAR:* ${indicators.sar?.toFixed(4)}

*Williams %R:* ${indicators.williamsR?.toFixed(2)}

*CCI:* 7=${indicators.cci7?.toFixed(2)}, 10=${indicators.cci10?.toFixed(2)}, 20=${indicators.cci20?.toFixed(2)}

*MTM:* 7=${indicators.mtm7?.toFixed(4)}, 14=${indicators.mtm14?.toFixed(4)}, 21=${indicators.mtm21?.toFixed(4)}

*Stochastic:* ${indicators.stochastic?.k?.toFixed(2)}

*Ultimate Oscillator:* ${indicators.uo?.toFixed(4)}

*Chande Momentum Oscillator:* ${indicators.cmo?.toFixed(4)}

*KST:* ${indicators.kst?.toFixed(4)}

*Ease of Movement:* ${indicators.emv?.toFixed(4)}

*Detrended Price Oscillator:* ${indicators.dpo?.toFixed(4)}

*Rate of Change:* ${indicators.roc?.toFixed(4)}

*Donchian Channels:* Upper=${indicators.donchian?.upper?.toFixed(4)}, Lower=${indicators.donchian?.lower?.toFixed(4)}

*Aroon:* Up=${indicators.aroon?.up?.toFixed(2)}, Down=${indicators.aroon?.down?.toFixed(2)}

*Mass Index:* ${indicators.massIndex?.toFixed(4)}

*Chaikin Oscillator:* ${indicators.chaikin?.toFixed(4)}
  `;
}

bot.start((ctx) => ctx.reply("Welcome! Send commands like /eth1h, /btc4h, /link1h to get indicator summaries."));

bot.command(["eth1h", "eth4h", "btc1h", "btc4h", "link1h", "link4h"], async (ctx) => {
  try {
    const parsed = parseCommand(ctx.message.text);
    if (!parsed) {
      ctx.reply("Invalid command format. Use /eth1h, /btc4h, etc.");
      return;
    }
    await ctx.reply(`Fetching ${parsed.symbol} data for interval ${parsed.interval}...`);
    const candles = await fetchCandles(parsed.symbol, parsed.interval);
    const indicators = calculateIndicators(candles);
    const message = formatIndicatorOutput(indicators);
    ctx.replyWithMarkdownV2(message);
  } catch (error) {
    console.error(error);
    ctx.reply("Error fetching data or calculating indicators. Please try again later.");
  }
});

// Launch bot (polling)
bot.launch();

console.log(`Bot started on port ${PORT}`);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
