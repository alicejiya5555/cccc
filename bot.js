const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do";
const CHAT_ID = "7538764539";
const TWELVE_API_KEY = "4682ca818a8048e8a8559617a7076638";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
const PORT = 3000;

// Binance symbols
const binanceSymbols = {
  eth: "ETHUSDT",
  btc: "BTCUSDT",
  link: "LINKUSDT"
};

// TwelveData symbols
const twelveSymbols = {
  eth: "ETH/USD",
  btc: "BTC/USD",
  link: "LINK/USD"
};

// Get Binance price data
async function getPriceData(binanceSymbol) {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
    const res = await axios.get(url);
    const data = res.data;

    return {
      price: parseFloat(data.lastPrice).toFixed(2),
      high: parseFloat(data.highPrice).toFixed(2),
      low: parseFloat(data.lowPrice).toFixed(2),
      change: parseFloat(data.priceChange).toFixed(2),
      changePercent: parseFloat(data.priceChangePercent).toFixed(2),
      volume: parseFloat(data.volume).toFixed(2),
      quoteVolume: parseFloat(data.quoteVolume).toFixed(2),
      open: parseFloat(data.openPrice).toFixed(2),
      closeTime: new Date(data.closeTime).toLocaleString()
    };
  } catch (err) {
    console.error("Binance API error:", err.message);
    return {
      price: "N/A", high: "N/A", low: "N/A",
      change: "N/A", changePercent: "N/A",
      volume: "N/A", quoteVolume: "N/A",
      open: "N/A", closeTime: "N/A"
    };
  }
}

// Get indicator from TwelveData
async function getIndicator(name, symbol, interval, extra = "") {
  try {
    const url = `https://api.twelvedata.com/${name}?symbol=${symbol}&interval=${interval}&apikey=${TWELVE_API_KEY}${extra}`;
    const res = await axios.get(url);
    if (res.data && !res.data.status) return res.data;
    console.error(`${name} failed:`, res.data);
    return null;
  } catch (err) {
    console.error(`${name} error:`, err.message);
    return null;
  }
}

// Format output message
function formatMsg(asset, interval, priceData, indicators) {
  const bb = indicators.bbands || {};
  return `
📊 *${asset.toUpperCase()} ${interval} Analysis*

💰 *Price:* $${priceData.price}
📈 *24h High:* $${priceData.high}
📉 *24h Low:* $${priceData.low}
🔁 *Change:* $${priceData.change} (${priceData.changePercent}%)
🧮 *Volume:* ${priceData.volume}
💵 *Quote Volume:* ${priceData.quoteVolume}
🔓 *Open Price:* $${priceData.open}
⏰ *Close Time:* ${priceData.closeTime}

📊 *Indicators:*
- ATR: ${indicators.atr?.value || "N/A"}
- ADX: ${indicators.adx?.adx || "N/A"}
- BBANDS: U=${bb.upper_band || "N/A"}, M=${bb.middle_band || "N/A"}, L=${bb.lower_band || "N/A"}
- EMA(9): ${indicators.ema9?.value || "N/A"}, EMA(12): ${indicators.ema12?.value || "N/A"}, EMA(26): ${indicators.ema26?.value || "N/A"}
`.trim();
}

// Bot listens for commands
bot.on("message", async (msg) => {
  const text = msg.text.toLowerCase();
  const match = text.match(/(eth|btc|link)(1h|4h)/);
  if (!match) return;

  const [_, assetKey, interval] = match;
  const binanceSymbol = binanceSymbols[assetKey];
  const twelveSymbol = twelveSymbols[assetKey];

  const priceData = await getPriceData(binanceSymbol);

  const [atr, adx, bbands, ema9, ema12, ema26] = await Promise.all([
    getIndicator("atr", twelveSymbol, interval, "&time_period=14"),
    getIndicator("adx", twelveSymbol, interval, "&time_period=14"),
    getIndicator("bbands", twelveSymbol, interval, "&time_period=20&stddev=2"),
    getIndicator("ema", twelveSymbol, interval, "&time_period=9"),
    getIndicator("ema", twelveSymbol, interval, "&time_period=12"),
    getIndicator("ema", twelveSymbol, interval, "&time_period=26")
  ]);

  const indicators = { atr, adx, bbands, ema9, ema12, ema26 };
  const message = formatMsg(assetKey, interval, priceData, indicators);

  bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
});

// Server setup
app.get("/", (_, res) => res.send("Bot is live!"));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
