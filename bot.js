// bot.js
const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const technicalIndicators = require('technicalindicators');

const app = express();
const port = 3000;

const token = '7655482876:AAHsd4CU3uLo1Kb0C7aWa_hgESOFmOQrNw0';
const bot = new TelegramBot(token);
app.use(express.json());

const SYMBOLS = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  link: 'LINKUSDT'
};

const TIMEFRAMES = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '12h': '12h'
};

function getColor(value) {
  if (value > 0) return '🟢';
  if (value < 0) return '🔴';
  return '🟡';
}

function calculateIndicators(candles) {
  const close = candles.map(c => parseFloat(c[4]));
  const high = candles.map(c => parseFloat(c[2]));
  const low = candles.map(c => parseFloat(c[3]));
  const volume = candles.map(c => parseFloat(c[5]));

  const indicators = {
    sma: {},
    ema: {},
    wma: {},
    rsi: {},
    macd: {},
    bb: {},
    atr: {},
    obv: technicalIndicators.OBV.calculate({ close, volume }).at(-1)
  };

  [5, 13, 21, 50, 100, 200].forEach(p => {
    indicators.sma[p] = technicalIndicators.SMA.calculate({ period: p, values: close }).at(-1);
    indicators.ema[p] = technicalIndicators.EMA.calculate({ period: p, values: close }).at(-1);
  });

  [5, 13, 21, 50, 100].forEach(p => {
    indicators.wma[p] = technicalIndicators.WMA.calculate({ period: p, values: close }).at(-1);
  });

  [5, 14].forEach(p => {
    indicators.rsi[p] = technicalIndicators.RSI.calculate({ period: p, values: close }).at(-1);
  });

  indicators.macd = technicalIndicators.MACD.calculate({
    fastPeriod: 3,
    slowPeriod: 10,
    signalPeriod: 16,
    values: close,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }).at(-1);

  indicators.bb = technicalIndicators.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: close
  }).at(-1);

  indicators.atr = technicalIndicators.ATR.calculate({ period: 14, high, low, close }).at(-1);

  return indicators;
}

async function fetchCandles(symbol, interval) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`;
  const res = await axios.get(url);
  return res.data;
}

async function fetch24hStats(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await axios.get(url);
  return res.data;
}

async function handleCommand(msg, match) {
  const chatId = msg.chat.id;
  const command = match[1];
  const pair = command.match(/[a-z]+/i)[0];
  const tfcode = command.replace(pair, '');

  const symbol = SYMBOLS[pair];
  const tf = TIMEFRAMES[tfcode] || '1h';

  const candles = await fetchCandles(symbol, tf);
  const stats = await fetch24hStats(symbol);
  const ind = calculateIndicators(candles);

  const trend = ind.rsi[14] > 70 ? '🟢 Bullish' : ind.rsi[14] < 30 ? '🔴 Bearish' : '🟡 Neutral';

  const format = v => (v !== undefined ? v.toFixed(2) : 'N/A');

  const msgText = `
📊 ${symbol} (${tf}) Analysis

💰 Price: ${stats.lastPrice}
📈 24h High: ${stats.highPrice}
📉 24h Low: ${stats.lowPrice}
🔁 Change: ${stats.priceChangePercent}% ${getColor(stats.priceChangePercent)}
🧮 Volume: ${stats.volume}
💵 Quote Volume: ${stats.quoteVolume}
🔓 Open Price: ${stats.openPrice}
⏰ Close Time: ${new Date(stats.closeTime).toUTCString()}

📊 Indicators:

Indicators Values:
${[5,13,21,50,100,200].map(p=>`SMA(${p}): ${format(ind.sma[p])}`).join('\n')}
${[5,13,21,50,100,200].map(p=>`EMA(${p}): ${format(ind.ema[p])}`).join('\n')}
${[5,13,21,50,100].map(p=>`WMA(${p}): ${format(ind.wma[p])}`).join('\n')}

MACD(3,10,16): MACD: ${format(ind.macd.MACD)}, Signal: ${format(ind.macd.signal)}
Bollinger: UP ${format(ind.bb.upper)}, MB ${format(ind.bb.middle)}, DN ${format(ind.bb.lower)}
RSI(5): ${format(ind.rsi[5])}
RSI(14): ${format(ind.rsi[14])}

OBV: ${format(ind.obv)}
ATR: ${format(ind.atr)}

📍 Final Signal Summary: ${trend}
📉 Trend Direction
🕰 Best UTC Entry & Exit Times
🔮 Short-Term & Mid-Term Price Prediction
🛡 Entry Zone, Take Profit, Stop Loss
📢 Final Trade Advice (Mindset + Strategy)

📊 Indicator Behavior Breakdown
⚠️ Volatility + Breakout Scan
🔁 Reversal vs Continuation Clarity
🌡 Momentum Heatmap
📈 Volume & OBV Strength
🧮 Fibonacci Zones
⏳ Multi-Timeframe Comparison
🐋 Whale vs Retail Movement
🕯 Candle Pattern Alerts
🧠 Strategy Type Suggestion
📅 3-Day or Weekly Forecast
  `;

  bot.sendMessage(chatId, msgText);
}

bot.onText(/\/(btc1h|btc4h|btc12h|btc15m|eth1h|eth4h|eth12h|eth15m|link1h|link4h|link12h|link15m)/, handleCommand);

app.get('/', (req, res) => res.send('Bot is running'));
app.listen(port, () => console.log(`Bot live on http://localhost:${port}`));
