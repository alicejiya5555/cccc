const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const token = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const bot = new TelegramBot(token, { polling: true });

const symbolsMap = {
  eth1h: { symbol: 'ETHUSDT', interval: '1h', name: 'ETH' },
  eth4h: { symbol: 'ETHUSDT', interval: '4h', name: 'ETH' },
  eth1d: { symbol: 'ETHUSDT', interval: '12h', name: 'ETH' },
  btc1h: { symbol: 'BTCUSDT', interval: '1h', name: 'BTC' },
  btc4h: { symbol: 'BTCUSDT', interval: '4h', name: 'BTC' },
  btc1d: { symbol: 'BTCUSDT', interval: '12h', name: 'BTC' },
  link1h: { symbol: 'LINKUSDT', interval: '1h', name: 'LINK' },
  link4h: { symbol: 'LINKUSDT', interval: '4h', name: 'LINK' },
  link1d: { symbol: 'LINKUSDT', interval: '12h', name: 'LINK' }
};

const periods = [5, 13, 21, 50, 100, 200];
const formatNum = (num) => parseFloat(num).toLocaleString('en-US', { maximumFractionDigits: 4 });
const formatTimeframeLabel = (cmd) => cmd.includes('1h') ? '1 Hour' : cmd.includes('4h') ? '4 Hour' : '12 Hour';

async function getBinanceStats(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await axios.get(url);
  return res.data;
}

async function getKlines(symbol, interval, limit = 250) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await axios.get(url);
  return res.data.map(kline => parseFloat(kline[4])); // close prices
}

function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const sum = closes.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = calculateSMA(closes.slice(0, period), period);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

bot.onText(/\/(eth1h|eth4h|eth1d|btc1h|btc4h|btc1d|link1h|link4h|link1d)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const command = match[1];
  const { symbol, interval, name } = symbolsMap[command];
  const tfLabel = formatTimeframeLabel(command);

  try {
    const [binanceData, closes] = await Promise.all([
      getBinanceStats(symbol),
      getKlines(symbol, interval)
    ]);

    let maText = '';
    for (const period of periods) {
      const sma = calculateSMA(closes, period);
      const ema = calculateEMA(closes, period);
      maText += `🟡 SMA-${period}: $${formatNum(sma)}\n🔵 EMA-${period}: $${formatNum(ema)}\n`;
    }

    const message = `📊 ${name} (${symbol}) - ${tfLabel} Analysis\n\n` +
      `💰 Price: $${formatNum(binanceData.lastPrice)}\n` +
      `📈 High: $${formatNum(binanceData.highPrice)} | 📉 Low: $${formatNum(binanceData.lowPrice)}\n` +
      `🔁 Change: ${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)\n` +
      `📊 Volume: ${formatNum(binanceData.volume)} | 💵 Quote Vol: $${formatNum(binanceData.quoteVolume)}\n` +
      `🔓 Open: $${formatNum(binanceData.openPrice)} | ⏰ Close: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}\n\n` +
      `📐 Moving Averages:\n${maText}`;

    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, `⚠️ Error fetching data: ${error.message}`);
  }
});

// Express endpoint to keep Render alive
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
