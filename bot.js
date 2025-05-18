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

async function getPriceData(symbol) {
  try {
    const [priceRes, ohlcvRes] = await Promise.all([
      axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`, {
        headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY }
      }),
      axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/ohlcv/latest?symbol=${symbol}`, {
        headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY }
      })
    ]);

    const price = priceRes.data.data[symbol].quote.USD.price.toFixed(2);
    const high = ohlcvRes.data.data[symbol].quote.USD.high.toFixed(2);
    const low = ohlcvRes.data.data[symbol].quote.USD.low.toFixed(2);

    return { price, high, low };
  } catch (err) {
    console.error("CMC error:", err.message);
    return { price: "N/A", high: "N/A", low: "N/A" };
  }
}

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

function formatMsg(asset, interval, priceData, indicators) {
  const bb = indicators.bbands || {};
  return `
📊 *${asset.toUpperCase()} ${interval} Analysis*

💰 *Price:* $${priceData.price}
🔼 *High 24h:* $${priceData.high}
🔽 *Low 24h:* $${priceData.low}

📈 *Indicators:*
- ATR: ${indicators.atr?.value || "N/A"}
- ADX: ${indicators.adx?.adx || "N/A"}
- BBANDS: U=${bb.upper_band || "N/A"}, M=${bb.middle_band || "N/A"}, L=${bb.lower_band || "N/A"}
- EMA(9): ${indicators.ema9?.value || "N/A"}, EMA(12): ${indicators.ema12?.value || "N/A"}, EMA(26): ${indicators.ema26?.value || "N/A"}
`.trim();
}

bot.on("message", async (msg) => {
  const text = msg.text.toLowerCase();
  const match = text.match(/(eth|btc|link)(1h|4h)/);
  if (!match) return;

  const [_, assetKey, interval] = match;
  const symbol = assets[assetKey];
  const priceData = await getPriceData(assetKey.toUpperCase());

  const [atr, adx, bbands, ema9, ema12, ema26] = await Promise.all([
    getIndicator("atr", symbol, interval, "&time_period=14"),
    getIndicator("adx", symbol, interval, "&time_period=14"),
    getIndicator("bbands", symbol, interval, "&time_period=20&stddev=2"),
    getIndicator("ema", symbol, interval, "&time_period=9"),
    getIndicator("ema", symbol, interval, "&time_period=12"),
    getIndicator("ema", symbol, interval, "&time_period=26")
  ]);

  const indicators = { atr, adx, bbands, ema9, ema12, ema26 };
  const message = formatMsg(assetKey, interval, priceData, indicators);

  bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
});

app.get("/", (_, res) => res.send("Bot is live!"));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
