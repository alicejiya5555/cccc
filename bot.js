import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";

// ✅ Replace this with your actual Telegram bot token (no .env needed)
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const bot = new Telegraf(BOT_TOKEN);
const PORT = 3000;

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
    closeTime: candle[6]
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

function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  const last = arr => arr?.[arr.length - 1] ?? null;
  const sma = p => ti.SMA.calculate({ period: p, values: close });
  const ema = p => ti.EMA.calculate({ period: p, values: close });
  const wma = p => ti.WMA.calculate({ period: p, values: close });

  const safe = fn => { try { return last(fn()); } catch { return null; } };

  return {
    ema: { 5: last(ema(5)), 13: last(ema(13)), 21: last(ema(21)), 50: last(ema(50)) },
    rsi: { 5: safe(() => ti.RSI.calculate({ period: 5, values: close })), 14: safe(() => ti.RSI.calculate({ period: 14, values: close })) },
    macd: safe(() => ti.MACD.calculate({ values: close, fastPeriod: 3, slowPeriod: 10, signalPeriod: 16, SimpleMAOscillator: false, SimpleMASignal: false })),
    mfi: safe(() => ti.MFI.calculate({ high, low, close, volume, period: 14 })),
    stoch: safe(() => ti.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 })),
    vwap: { 1: calculateVWAP(candles, 1), 5: calculateVWAP(candles, 5) },
    bb: safe(() => ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: close })),
    sar: safe(() => ti.SAR.calculate({ high, low, step: 0.02, max: 0.2 })),
    atr: safe(() => ti.ATR.calculate({ high, low, close, period: 14 })),
    obv: safe(() => ti.OBV.calculate({ close, volume })),
  };
}

function formatOutput(data, symbol, interval) {
  const bb = data.bb ?? {};
  const bbTop = bb.upper ?? "N/A";
  const bbMid = bb.middle ?? "N/A";
  const bbLow = bb.lower ?? "N/A";

  return `
📊 *${symbol}* — Interval: *${interval}*

🟢 *EMA* 5/13/21/50: ${data.ema[5]?.toFixed(2)} / ${data.ema[13]?.toFixed(2)} / ${data.ema[21]?.toFixed(2)} / ${data.ema[50]?.toFixed(2)}

📈 *RSI* (5): ${data.rsi[5]?.toFixed(2)} | (14): ${data.rsi[14]?.toFixed(2)}
💹 *MACD*: ${JSON.stringify(data.macd)}
💧 *MFI* (14): ${data.mfi?.toFixed(2)}

📉 *Stochastic*: ${JSON.stringify(data.stoch)}
📊 *VWAP*: 1 = ${data.vwap[1]?.toFixed(2)}, 5 = ${data.vwap[5]?.toFixed(2)}
📐 *BBANDS* (20): Top = ${bbTop?.toFixed(2)}, Mid = ${bbMid?.toFixed(2)}, Low = ${bbLow?.toFixed(2)}

🌀 *SAR*: ${data.sar?.toFixed(2)}
🔥 *ATR* (14): ${data.atr?.toFixed(2)}
📦 *OBV*: ${data.obv?.toFixed(2)}
  `;
}

// Handle commands like /eth1h
bot.on("text", async ctx => {
  const parsed = parseCommand(ctx.message.text);
  if (!parsed) return ctx.reply("❌ Invalid command format.\nTry /eth1h, /btc4h, /link15m etc.");

  const { symbol, interval } = parsed;
  try {
    const candles = await fetchCandles(symbol, interval);
    const indicators = calculateIndicators(candles);
    const message = formatOutput(indicators, symbol, interval);
    ctx.replyWithMarkdown(message);
  } catch (err) {
    ctx.reply("❌ Error fetching data or calculating indicators.");
    console.error(err);
  }
});

// Start webhook (optional for Render)
bot.launch();
console.log(`🤖 Bot running on port ${PORT}`);
