const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const token = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const chatId = '7538764539';
const twelveApiKey = '4682ca818a8048e8a8559617a7076638';
const bot = new TelegramBot(token, { polling: true });

// ──────────────────────────────────────
// HELPERS
const formatNum = num => Number(num).toLocaleString('en-UK', { maximumFractionDigits: 4 });
const pairs = {
  btc: 'BTC/USDT',
  eth: 'ETH/USDT',
  link: 'LINK/USDT'
};
const timeFrames = {
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day'
};

// ──────────────────────────────────────
// MAIN MESSAGE HANDLER
bot.on('message', async msg => {
  const text = msg.text.toLowerCase();
  const match = text.match(/(btc|eth|link)(15m|1h|4h|1d)/);

  if (!match) return;

  const symbol = match[1];
  const tf = match[2];
  const tfLabel = timeFrames[tf];
  const name = symbol.toUpperCase();

  const binanceSymbol = symbol.toUpperCase() + 'USDT';

  try {
    const binanceRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
    const binanceData = binanceRes.data;

    const ma5 = await axios.get(`https://api.twelvedata.com/ma?symbol=${pairs[symbol]}&interval=${tfLabel}&time_period=5&type=sma&apikey=${twelveApiKey}`);
    const ema5 = await axios.get(`https://api.twelvedata.com/ema?symbol=${pairs[symbol]}&interval=${tfLabel}&time_period=5&apikey=${twelveApiKey}`);
    const macd = await axios.get(`https://api.twelvedata.com/macd?symbol=${pairs[symbol]}&interval=${tfLabel}&fast_period=3&slow_period=10&signal_period=16&apikey=${twelveApiKey}`);
    const rsi5 = await axios.get(`https://api.twelvedata.com/rsi?symbol=${pairs[symbol]}&interval=${tfLabel}&time_period=5&apikey=${twelveApiKey}`);
    const boll = await axios.get(`https://api.twelvedata.com/bbands?symbol=${pairs[symbol]}&interval=${tfLabel}&apikey=${twelveApiKey}`);

    const message = `📊 ${name} ${tfLabel} Analysis

💰 Price: $${formatNum(binanceData.lastPrice)}
📈 High: $${formatNum(binanceData.highPrice)}   📉 Low: $${formatNum(binanceData.lowPrice)}
🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
🧮 Volume: ${formatNum(binanceData.volume)}
💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}

📐 MA(5): ${ma5.data.value}
📐 EMA(5): ${ema5.data.value}
📈 MACD: ${macd.data.macd} | Signal: ${macd.data.signal} | Histogram: ${macd.data.histogram}
📊 RSI(5): ${rsi5.data.value}
🎯 Bollinger Bands:
   ┗ UP: ${boll.data.upper_band}
   ┗ MB: ${boll.data.middle_band}
   ┗ DN: ${boll.data.lower_band}
`;

    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error:', error.message);
    bot.sendMessage(chatId, `❌ Error fetching data. Try again later.`);
  }
});

// ──────────────────────────────────────
// DUMMY EXPRESS SERVER FOR RENDER
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Telegram bot is running...');
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
