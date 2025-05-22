// bot.js
import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";
import express from "express";

// --- Init ---
const BOT_TOKEN = "7726468556:AAFQbeh4hmom8_4gRRxVzTwOxx5beWdQJB0";
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// --- Express Keep-Alive ---
const app = express();
app.get("/", (_, res) => res.send("Bot is running"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- Utils ---
function parseCommand(command) {
  const match = command.toLowerCase().match(/^\/(\w+)(\d+)(m|h)$/);
  if (!match) return null;
  const [, symbolRaw, num, unit] = match;
  const symbolMap = { eth: "ETHUSDT", btc: "BTCUSDT", link: "LINKUSDT" };
  const symbol = symbolMap[symbolRaw];
  if (!symbol) return null;
  return { symbol, interval: `${num}${unit}`, tfLabel: `${num}${unit.toUpperCase()}`, name: symbolRaw.toUpperCase() };
}

const formatNum = (n) =>
  n === undefined || n === null || isNaN(n)
    ? "N/A"
    : parseFloat(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

// --- Binance Fetch ---
async function getBinanceData(symbol, interval) {
  const [priceRes, candleRes] = await Promise.all([
    axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
    axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`),
  ]);

  const priceData = priceRes.data;
  const candles = candleRes.data.map((c) => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));

  return { priceData, candles };
}

// --- Indicator Logic ---
function calculateIndicators(candles) {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);
  const last = (arr) => arr.length ? arr[arr.length - 1] : NaN;

  const macd = last(ti.MACD.calculate({ values: close, fastPeriod: 3, slowPeriod: 10, signalPeriod: 16, SimpleMAOscillator: false, SimpleMASignal: false })) || {};
  const bb = last(ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: close })) || {};

  return {
    sma5: formatNum(last(ti.SMA.calculate({ period: 5, values: close }))),
    sma13: formatNum(last(ti.SMA.calculate({ period: 13, values: close }))),
    sma21: formatNum(last(ti.SMA.calculate({ period: 21, values: close }))),
    sma50: formatNum(last(ti.SMA.calculate({ period: 50, values: close }))),
    sma100: formatNum(last(ti.SMA.calculate({ period: 100, values: close }))),
    sma200: formatNum(last(ti.SMA.calculate({ period: 200, values: close }))),

    ema5: formatNum(last(ti.EMA.calculate({ period: 5, values: close }))),
    ema13: formatNum(last(ti.EMA.calculate({ period: 13, values: close }))),
    ema21: formatNum(last(ti.EMA.calculate({ period: 21, values: close }))),
    ema50: formatNum(last(ti.EMA.calculate({ period: 50, values: close }))),
    ema100: formatNum(last(ti.EMA.calculate({ period: 100, values: close }))),
    ema200: formatNum(last(ti.EMA.calculate({ period: 200, values: close }))),

    wma5: formatNum(last(ti.WMA.calculate({ period: 5, values: close }))),
    wma13: formatNum(last(ti.WMA.calculate({ period: 13, values: close }))),
    wma21: formatNum(last(ti.WMA.calculate({ period: 21, values: close }))),
    wma50: formatNum(last(ti.WMA.calculate({ period: 50, values: close }))),
    wma100: formatNum(last(ti.WMA.calculate({ period: 100, values: close }))),

    macdValue: formatNum(macd.MACD),
    macdSignal: formatNum(macd.signal),
    macdHistogram: formatNum(macd.histogram),

    bbUpper: formatNum(bb.upper),
    bbMiddle: formatNum(bb.middle),
    bbLower: formatNum(bb.lower),

    rsi5: formatNum(last(ti.RSI.calculate({ period: 5, values: close }))),
    rsi14: formatNum(last(ti.RSI.calculate({ period: 14, values: close }))),
  };
}

// --- Output ---
function generateOutput(price, ind, name, tf) {
  return `📊 ${name} ${tf} Analysis

💰 Price: $${formatNum(price.lastPrice)}
📈 24h High: $${formatNum(price.highPrice)}
📉 24h Low: $${formatNum(price.lowPrice)}
🔁 Change: $${formatNum(price.priceChange)} (${price.priceChangePercent}%)
💵 Volume: ${formatNum(price.volume)} | $${formatNum(price.quoteVolume)}
🕰 Close Time: ${new Date(price.closeTime).toLocaleString('en-UK')}

📊 SMA:
 - SMA 5/13/21/50/100/200: ${ind.sma5} / ${ind.sma13} / ${ind.sma21} / ${ind.sma50} / ${ind.sma100} / ${ind.sma200}

📈 EMA:
 - EMA 5/13/21/50/100/200: ${ind.ema5} / ${ind.ema13} / ${ind.ema21} / ${ind.ema50} / ${ind.ema100} / ${ind.ema200}

⚖️ WMA:
 - WMA 5/13/21/50/100: ${ind.wma5} / ${ind.wma13} / ${ind.wma21} / ${ind.wma50} / ${ind.wma100}

📉 MACD:
 - MACD: ${ind.macdValue}, Signal: ${ind.macdSignal}, Histogram: ${ind.macdHistogram}

🎯 Bollinger Bands:
 - Upper: ${ind.bbUpper}, Mid: ${ind.bbMiddle}, Lower: ${ind.bbLower}

⚡ RSI:
 - RSI 5: ${ind.rsi5}, RSI 14: ${ind.rsi14}

📍 Final Signal Summary & Strategy Guide:
🔁 Trend Direction
🕯️ Entry/Exit Timing (UTC)
🧮 Reversal or Continuation Clarity
📈 Fibonacci Zones + Momentum Heatmap
🐋 Whale vs Retail Behavior
🛠 Strategy Suggestion
📅 3-Day / Weekly Forecast Ready`;
}

// --- Bot Command Handler ---
bot.on("text", async (ctx) => {
  const parsed = parseCommand(ctx.message.text);
  if (!parsed) return ctx.reply("❌ Use format like /eth1h, /btc15m, /link4h");

  try {
    const { symbol, interval, name, tfLabel } = parsed;
    const { priceData, candles } = await getBinanceData(symbol, interval);
    const indicators = calculateIndicators(candles);
    const output = generateOutput(priceData, indicators, name, tfLabel);
    ctx.reply(output);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Failed to fetch data or indicators. Try again later.");
  }
});

// --- Start Bot ---
bot.launch();
