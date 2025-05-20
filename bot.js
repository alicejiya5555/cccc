const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const TELEGRAM_TOKEN = "7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk";
const CHAT_ID = "7538764539";
const TWELVE_API_KEY = "4682ca818a8048e8a8559617a7076638";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const timeFrames = {
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};

const symbols = {
  btc: "BTC",
  eth: "ETH",
  link: "LINK"
};

function formatNum(num) {
  return parseFloat(num).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function buildTwelveUrl(indicator, symbol, interval, extra = "") {
  return `https://api.twelvedata.com/${indicator}?symbol=${symbol}/USD&interval=${interval}&apikey=${TWELVE_API_KEY}${extra}`;
}

bot.on("message", async (msg) => {
  const text = msg.text.toLowerCase();

  const regex = /^(btc|eth|link)(15m|1h|4h|1d)$/;
  const match = text.match(regex);
  if (!match) return;

  const coin = match[1];
  const tf = match[2];
  const tfLabel = tf.toUpperCase();
  const interval = timeFrames[tf];
  const symbol = symbols[coin];

  try {
    // Binance Data
    const binanceRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
    const b = binanceRes.data;

    // Indicators
    const indicators = await Promise.all([
      axios.get(buildTwelveUrl("ma", symbol, interval, "&time_period=5&type=sma")),
      axios.get(buildTwelveUrl("ema", symbol, interval, "&time_period=13")),
      axios.get(buildTwelveUrl("wma", symbol, interval)),
      axios.get(buildTwelveUrl("rsi", symbol, interval, "&time_period=5")),
      axios.get(buildTwelveUrl("rsi", symbol, interval, "&time_period=14")),
      axios.get(buildTwelveUrl("macd", symbol, interval, "&fast_period=3&slow_period=10&signal_period=16")),
      axios.get(buildTwelveUrl("bbands", symbol, interval))
    ]);

    const [sma5, ema13, wma, rsi5, rsi14, macd, bb] = indicators.map((res) => res.data.values?.[0] || {});

    const message = `📊 ${symbol} ${tfLabel} Analysis

💰 Price: $${formatNum(b.lastPrice)}
📈 24h High: $${formatNum(b.highPrice)}
📉 24h Low: $${formatNum(b.lowPrice)}
🔁 Change: $${formatNum(b.priceChange)} (${b.priceChangePercent}%)
🧮 Volume: ${formatNum(b.volume)}
💵 Quote Volume: $${formatNum(b.quoteVolume)}
🔓 Open Price: $${formatNum(b.openPrice)}
⏰ Close Time: ${new Date(b.closeTime).toLocaleString('en-UK')}

📌 Indicators:
📏 SMA(5): ${sma5.value || "N/A"}
📏 EMA(13): ${ema13.value || "N/A"}
📏 WMA(5): ${wma.value || "N/A"}
📊 RSI(5): ${rsi5.value || "N/A"}
📊 RSI(14): ${rsi14.value || "N/A"}
📉 MACD: ${macd.macd || "N/A"} (Signal: ${macd.signal || "N/A"})
📈 Bollinger Bands:
  🔺 Upper: ${bb.upper_band || "N/A"}
  🔸 Middle: ${bb.middle_band || "N/A"}
  🔻 Lower: ${bb.lower_band || "N/A"}
`;

    bot.sendMessage(CHAT_ID, message);
  } catch (err) {
    console.error("Error:", err.message);
    bot.sendMessage(CHAT_ID, "⚠️ Failed to fetch data. Please try again later.");
  }
});
