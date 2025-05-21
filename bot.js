import { Telegraf } from "telegraf";
import axios from "axios";
import ti from "technicalindicators";
import express from "express";

// --- Bot Init ---
const BOT_TOKEN = "7726468556:AAFQbeh4hmom8_4gRRxVzTwOxx5beWdQJB0";
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// --- Utility Functions ---
function parseCommand(command) {
  const cmd = command.toLowerCase();
  const match = cmd.match(/^\/(\w+)(\d+)(m|h)$/);
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

function formatNum(num) {
  return parseFloat(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// --- Binance Data Fetch ---
async function getBinanceData(symbol, interval) {
  const [priceRes, candlesRes] = await Promise.all([
    axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
    axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`)
  ]);

  const priceData = priceRes.data;
  const candles = candlesRes.data.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));

  return { priceData, candles };
}

// --- Indicator Calculations ---
function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  return {
    sma5: formatNum(ti.SMA.calculate({ period: 5, values: close }).slice(-1)[0]),
    sma13: formatNum(ti.SMA.calculate({ period: 13, values: close }).slice(-1)[0]),
    sma21: formatNum(ti.SMA.calculate({ period: 21, values: close }).slice(-1)[0]),
    sma50: formatNum(ti.SMA.calculate({ period: 50, values: close }).slice(-1)[0]),
    sma100: formatNum(ti.SMA.calculate({ period: 100, values: close }).slice(-1)[0]),
    sma200: formatNum(ti.SMA.calculate({ period: 200, values: close }).slice(-1)[0]),

    ema5: formatNum(ti.EMA.calculate({ period: 5, values: close }).slice(-1)[0]),
    ema13: formatNum(ti.EMA.calculate({ period: 13, values: close }).slice(-1)[0]),
    ema21: formatNum(ti.EMA.calculate({ period: 21, values: close }).slice(-1)[0]),
    ema50: formatNum(ti.EMA.calculate({ period: 50, values: close }).slice(-1)[0]),
    ema100: formatNum(ti.EMA.calculate({ period: 100, values: close }).slice(-1)[0]),
    ema200: formatNum(ti.EMA.calculate({ period: 200, values: close }).slice(-1)[0]),

    wma5: formatNum(ti.WMA.calculate({ period: 5, values: close }).slice(-1)[0]),
    wma13: formatNum(ti.WMA.calculate({ period: 13, values: close }).slice(-1)[0]),
    wma21: formatNum(ti.WMA.calculate({ period: 21, values: close }).slice(-1)[0]),
    wma50: formatNum(ti.WMA.calculate({ period: 50, values: close }).slice(-1)[0]),
    wma100: formatNum(ti.WMA.calculate({ period: 100, values: close }).slice(-1)[0]),

    macd: ti.MACD.calculate({
      values: close,
      fastPeriod: 3,
      slowPeriod: 10,
      signalPeriod: 16,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }).slice(-1)[0] || { fast: 0, slow: 0, signal: 0 },

    bb: ti.BollingerBands.calculate({
      period: 20,
      values: close,
      stdDev: 2
    }).slice(-1)[0] || { upper: 0, middle: 0, lower: 0 },

    rsi5: formatNum(ti.RSI.calculate({ period: 5, values: close }).slice(-1)[0]),
    rsi14: formatNum(ti.RSI.calculate({ period: 14, values: close }).slice(-1)[0]),
  };
}

// --- Output Message Generator ---
function generateOutput(binanceData, indicators, name = "Symbol", tfLabel = "Timeframe") {
  const header = 
`📊 ${name} ${tfLabel} Analysis

💰 Price: $${formatNum(binanceData.lastPrice)}
📈 24h High: $${formatNum(binanceData.highPrice)}
📉 24h Low: $${formatNum(binanceData.lowPrice)}
🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
🧮 Volume: ${formatNum(binanceData.volume)}
💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}
🔓 Open Price: $${formatNum(binanceData.openPrice)}
⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}

`;

  const smaSection = 
`📊 Simple Moving Averages (SMA):
 - SMA 5: $${indicators.sma5}
 - SMA 13: $${indicators.sma13}
 - SMA 21: $${indicators.sma21}
 - SMA 50: $${indicators.sma50}
 - SMA 100: $${indicators.sma100}
 - SMA 200: $${indicators.sma200}

`;

  const emaSection =
`📈 Exponential Moving Averages (EMA):
 - EMA 5: $${indicators.ema5}
 - EMA 13: $${indicators.ema13}
 - EMA 21: $${indicators.ema21}
 - EMA 50: $${indicators.ema50}
 - EMA 100: $${indicators.ema100}
 - EMA 200: $${indicators.ema200}

`;

  const wmaSection =
`⚖️ Weighted Moving Averages (WMA):
 - WMA 5: $${indicators.wma5}
 - WMA 13: $${indicators.wma13}
 - WMA 21: $${indicators.wma21}
 - WMA 50: $${indicators.wma50}
 - WMA 100: $${indicators.wma100}

`;

  const macd = indicators.macd;
  const macdSection =
`📉 MACD:
 - Fast: ${formatNum(macd.fast)}
 - Slow: ${formatNum(macd.slow)}
 - Signal: ${formatNum(macd.signal)}

`;

  const bb = indicators.bb;
  const bbSection =
`🎯 Bollinger Bands (20, 2 StdDev):
 - Upper Band: $${formatNum(bb.upper)}
 - Middle Band: $${formatNum(bb.middle)}
 - Lower Band: $${formatNum(bb.lower)}

`;

  const rsiSection =
`⚡ Relative Strength Index (RSI):
 - RSI (5): ${indicators.rsi5}
 - RSI (14): ${indicators.rsi14}

`;

  return header + smaSection + emaSection + wmaSection + macdSection + bbSection + rsiSection;
}

// --- Command Handler ---
bot.on("text", async (ctx) => {
  const parsed = parseCommand(ctx.message.text);
  if (!parsed) return ctx.reply("❌ Invalid format. Try `/eth1h`, `/btc15m`, `/link4h`");

  try {
    const { symbol, interval } = parsed;
    const { priceData, candles } = await getBinanceData(symbol, interval);
    const indicators = calculateIndicators(candles);
    
    // Derive friendly names
    const name = symbol.replace("USDT", "");
    const tfLabel = interval.toUpperCase();
    
    const message = generateOutput(priceData, indicators, name, tfLabel);
    ctx.reply(message);
  } catch (error) {
    console.error(error);
    ctx.reply("⚠️ Error fetching data. Please try again.");
  }
});

// --- Web Server (keep-alive for Render/Heroku) ---
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
