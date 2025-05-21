const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// === 🔐 Your API KEYS ===
const TELEGRAM_TOKEN = "7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk";
const TWELVE_API_KEY = "4682ca818a8048e8a8559617a7076638";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// === 🧠 UTILS ===
const formatNum = (num) =>
  num ? parseFloat(num).toFixed(2).toLocaleString("en-US") : "N/A";

// === 🔄 INDICATOR FETCH FUNCTION ===
async function fetchIndicator(url) {
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    console.log("Indicator error:", err.message);
    return {};
  }
}

// === 📡 MAIN HANDLER ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  const symbols = ["eth", "btc", "link"];
  const intervals = {
    "15m": "15min",
    "1h": "1h",
    "4h": "4h",
    "1d": "1day",
  };

  const matched = text?.match(/(eth|btc|link)(15m|1h|4h|1d)/);
  if (!matched) return;

  const [_, coin, tfKey] = matched;
  const name = coin.toUpperCase();
  const tfLabel = tfKey.toUpperCase();
  const interval = intervals[tfKey];
  const symbolPair = `${name}USDT`;

  // Binance Price Info
  const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolPair}`;
  const binanceData = (await fetchIndicator(binanceUrl)) || {};

  // Indicators from Twelve Data
  const baseUrl = `https://api.twelvedata.com`;
  const args = `symbol=${name}/USD&interval=${interval}&apikey=${TWELVE_API_KEY}`;

  const [ma5, ema5, macd, rsi5, bb] = await Promise.all([
    fetchIndicator(`${baseUrl}/ma?${args}&time_period=5&type=sma`),
    fetchIndicator(`${baseUrl}/ema?${args}&time_period=5`),
    fetchIndicator(`${baseUrl}/macd?${args}&fast_period=3&slow_period=10&signal_period=16`),
    fetchIndicator(`${baseUrl}/rsi?${args}&time_period=5`),
    fetchIndicator(`${baseUrl}/bbands?${args}`),
  ]);

  // Message Format
  const message = `📊 ${name} ${tfLabel} Analysis

💰 Price: $${formatNum(binanceData.lastPrice)}
📈 High: $${formatNum(binanceData.highPrice)}   📉 Low: $${formatNum(binanceData.lowPrice)}
🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
🧮 Volume: ${formatNum(binanceData.volume)}
💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}

📐 MA(5): ${ma5?.value || "No data"}
📐 EMA(5): ${ema5?.value || "No data"}
📈 MACD:
   ┗ MACD: ${macd?.macd || "No data"}
   ┗ Signal: ${macd?.signal || "No data"}
   ┗ Histogram: ${macd?.histogram || "No data"}
📊 RSI(5): ${rsi5?.value || "No data"}
🎯 Bollinger Bands:
   ┗ UP: ${bb?.upper_band || "No data"}
   ┗ MB: ${bb?.middle_band || "No data"}
   ┗ DN: ${bb?.lower_band || "No data"}
`;

  bot.sendMessage(chatId, message);
});
