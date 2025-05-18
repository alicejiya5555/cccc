const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TELEGRAM_TOKEN = "7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do";
const CHAT_ID = "7538764539";
const CMC_API_KEY = "d0fb14c7-6905-4d42-8aa8-0558bfaea824";
const TWELVE_API_KEY = "4682ca818a8048e8a8559617a7076638";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
const PORT = 3000;

const assets = {
  eth: "ETH/USD",
  btc: "BTC/USD",
  link: "LINK/USD"
};

const timeframes = {
  "1h": "1h",
  "4h": "4h"
};

// Get CMC price
async function getPrice(symbol) {
  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`;
    const res = await axios.get(url, {
      headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY }
    });
    const data = res.data.data[symbol];
    return {
      price: data.quote.USD.price.toFixed(2),
      high: data.quote.USD.high_24h?.toFixed(2),
      low: data.quote.USD.low_24h?.toFixed(2)
    };
  } catch (e) {
    return { error: "Price error" };
  }
}

// Get Indicator
async function getIndicator(name, symbol, interval, extra = "") {
  try {
    const url = `https://api.twelvedata.com/${name}?symbol=${symbol}&interval=${interval}&apikey=${TWELVE_API_KEY}${extra}`;
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    return { error: `${name} error` };
  }
}

// Format message
function formatMsg(asset, interval, priceData, indicators) {
  return `
📊 *${asset.toUpperCase()} ${interval} Analysis*

💰 *Price:* $${priceData.price}
🔼 *High 24h:* $${priceData.high}
🔽 *Low 24h:* $${priceData.low}

📈 *Indicators:*
- ATR: ${indicators.atr?.value || "N/A"}
- ADX: ${indicators.adx?.adx || "N/A"}
- BBANDS: U=${indicators.bbands?.upper_band}, M=${indicators.bbands?.middle_band}, L=${indicators.bbands?.lower_band}
- EMA(9): ${indicators.ema9?.value}, EMA(12): ${indicators.ema12?.value}, EMA(26): ${indicators.ema26?.value}
`.trim();
}

// Main command handler
bot.on("message", async (msg) => {
  const text = msg.text.toLowerCase();
  const match = text.match(/(eth|btc|link)(1h|4h)/);

  if (!match) return;

  const [_, assetKey, interval] = match;
  const symbol = assets[assetKey];

  const priceData = await getPrice(assetKey.toUpperCase());

  const indicators = {
    atr: await getIndicator("atr", symbol, interval, "&time_period=14"),
    adx: await getIndicator("adx", symbol, interval, "&time_period=14"),
    bbands: await getIndicator("bbands", symbol, interval, "&time_period=20&stddev=2"),
    ema9: await getIndicator("ema", symbol, interval, "&time_period=9"),
    ema12: await getIndicator("ema", symbol, interval, "&time_period=12"),
    ema26: await getIndicator("ema", symbol, interval, "&time_period=26")
  };

  const message = formatMsg(assetKey, interval, priceData, indicators);
  bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
});

// Start server for Render deployment
app.get("/", (_, res) => res.send("Bot is live!"));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
