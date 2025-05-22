const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Bot credentials
const TOKEN = '7655482876:AAHsd4CU3uLo1Kb0C7aWa_hgESOFmOQrNw0';
const CHAT_ID = '7538764539';
const bot = new TelegramBot(TOKEN, { polling: true });

// Binance API endpoint
const BASE_URL = 'https://api.binance.com';

// Format number
const formatNum = (num) => parseFloat(num).toFixed(4);

// Get indicator direction symbol
const direction = (curr, prev) => (curr > prev ? '📈 +' : curr < prev ? '📉 -' : '➖');

// Get Binance OHLCV + indicators (mocked where necessary)
async function fetchAnalysis(symbol = 'ETHUSDT', interval = '1h') {
  const priceRes = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`, {
    params: { symbol },
  });

  const klinesRes = await axios.get(`${BASE_URL}/api/v3/klines`, {
    params: { symbol, interval, limit: 200 },
  });

  const candles = klinesRes.data.map(c => ({
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));

  const closes = candles.map(c => c.close);
  const rsi5 = calcRSI(closes, 5);
  const rsi14 = calcRSI(closes, 14);
  const sma = [5, 13, 21, 50, 100, 200].reduce((acc, len) => {
    acc[`sma${len}`] = formatNum(calcSMA(closes, len));
    return acc;
  }, {});
  const ema = [5, 13, 21, 50, 100, 200].reduce((acc, len) => {
    acc[`ema${len}`] = formatNum(calcEMA(closes, len));
    return acc;
  }, {});
  const wma = [5, 13, 21, 50, 100].reduce((acc, len) => {
    acc[`wma${len}`] = formatNum(calcWMA(closes, len));
    return acc;
  }, {});
  const { macd, signal, histogram } = calcMACD(closes);

  // Determine majority
  let bullish = 0, bearish = 0;
  [5, 13, 21, 50, 100, 200].forEach(len => {
    if (closes.at(-1) > calcEMA(closes, len)) bullish++;
    else bearish++;
  });

  const mood = bullish > bearish ? '🟢 Bullish Majority' :
               bearish > bullish ? '🔴 Bearish Majority' : '⚪️ Neutral';

  const text = `
📊 ${symbol} ${interval.toUpperCase()} Analysis

💰 Price: $${formatNum(priceRes.data.lastPrice)}
📈 24h High: $${formatNum(priceRes.data.highPrice)}
📉 24h Low: $${formatNum(priceRes.data.lowPrice)}
🔁 Change: ${direction(priceRes.data.lastPrice, priceRes.data.openPrice)} $${formatNum(priceRes.data.priceChange)} (${priceRes.data.priceChangePercent}%)
💵 Volume: ${formatNum(priceRes.data.volume)}
🧮 Quote Volume: $${formatNum(priceRes.data.quoteVolume)}
🔓 Open: $${formatNum(priceRes.data.openPrice)}
⏰ Close Time: ${new Date(priceRes.data.closeTime).toLocaleString('en-UK')}

${mood}

📊 Simple Moving Averages (SMA):
 - SMA 5: $${sma.sma5}
 - SMA 13: $${sma.sma13}
 - SMA 21: $${sma.sma21}
 - SMA 50: $${sma.sma50}
 - SMA 100: $${sma.sma100}
 - SMA 200: $${sma.sma200}

📈 Exponential Moving Averages (EMA):
 - EMA 5: $${ema.ema5}
 - EMA 13: $${ema.ema13}
 - EMA 21: $${ema.ema21}
 - EMA 50: $${ema.ema50}
 - EMA 100: $${ema.ema100}
 - EMA 200: $${ema.ema200}

⚖️ Weighted Moving Averages (WMA):
 - WMA 5: $${wma.wma5}
 - WMA 13: $${wma.wma13}
 - WMA 21: $${wma.wma21}
 - WMA 50: $${wma.wma50}
 - WMA 100: $${wma.wma100}

📉 MACD:
 - MACD: ${formatNum(macd)}
 - Signal: ${formatNum(signal)}
 - Histogram: ${formatNum(histogram)}

⚡ RSI Alerts:
 - RSI (5): ${rsi5} ${rsi5 > 70 ? '📛 Overbought' : rsi5 < 30 ? '💚 Oversold' : ''}
 - RSI (14): ${rsi14} ${rsi14 > 70 ? '📛 Overbought' : rsi14 < 30 ? '💚 Oversold' : ''}
  ${rsi5 > rsi14 ? '🔼 RSI Crossover: Bullish' : rsi5 < rsi14 ? '🔽 RSI Crossover: Bearish' : ''}

📣 Powered by Binance API
  `;

  return text;
}

// Commands
bot.onText(/\/(eth|btc|trx|link)(1h|4h)/, async (msg, match) => {
  const symbol = match[1].toUpperCase() + 'USDT';
  const interval = match[2];
  const text = await fetchAnalysis(symbol, interval);
  bot.sendMessage(msg.chat.id, text);
});

// ========== INDICATOR FUNCTIONS ========== //

function calcSMA(arr, len) {
  if (arr.length < len) return 0;
  const slice = arr.slice(-len);
  return slice.reduce((a, b) => a + b, 0) / len;
}

function calcEMA(arr, len) {
  if (arr.length < len) return 0;
  const k = 2 / (len + 1);
  return arr.reduce((prev, curr, i) => i === 0 ? curr : (curr * k + prev * (1 - k)));
}

function calcWMA(arr, len) {
  if (arr.length < len) return 0;
  const weights = Array.from({ length: len }, (_, i) => i + 1);
  const slice = arr.slice(-len);
  const weighted = slice.map((v, i) => v * weights[i]);
  return weighted.reduce((a, b) => a + b) / weights.reduce((a, b) => a + b);
}

function calcRSI(arr, len) {
  let gains = 0, losses = 0;
  for (let i = arr.length - len; i < arr.length - 1; i++) {
    const change = arr[i + 1] - arr[i];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = gains / (losses || 1);
  return formatNum(100 - 100 / (1 + rs));
}

function calcMACD(arr, fast = 12, slow = 26, signal = 9) {
  const emaFast = arr.map((_, i) => calcEMA(arr.slice(0, i + 1), fast));
  const emaSlow = arr.map((_, i) => calcEMA(arr.slice(0, i + 1), slow));
  const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
  const signalLine = macdLine.map((_, i) => calcEMA(macdLine.slice(0, i + 1), signal));
  const histogram = macdLine.map((val, i) => val - signalLine[i]);
  return {
    macd: macdLine.at(-1),
    signal: signalLine.at(-1),
    histogram: histogram.at(-1),
  };
}
