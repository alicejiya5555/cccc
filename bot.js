const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Replace with your bot token
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// Binance Kline Fetcher
async function fetchKlines(symbol, interval, limit = 300) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await axios.get(url);
  return response.data.map(k => ({
    time: k[0],
    close: parseFloat(k[4])
  }));
}

// EMA Calculator
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let emaArray = [];
  let ema = data.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  emaArray[period - 1] = ema;

  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaArray[i] = ema;
  }

  return emaArray;
}

// SMA Calculator
function calculateSMA(data, period) {
  let smaArray = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sma = slice.reduce((sum, v) => sum + v, 0) / period;
    smaArray[i] = sma;
  }
  return smaArray;
}

// Master Processor
async function getMAData(symbol, interval) {
  const data = await fetchKlines(symbol, interval);
  const closes = data.map(d => d.close);

  const emaPeriods = [5, 13, 21, 50, 100, 200];
  const smaPeriods = [5, 13, 21, 50, 100, 200];

  let result = `📊 ${symbol} - ${interval} MAs\n`;

  for (let p of emaPeriods) {
    const ema = calculateEMA(closes, p);
    const last = ema[ema.length - 1];
    result += `🔵 EMA${p}: ${last?.toFixed(2)}\n`;
  }

  for (let p of smaPeriods) {
    const sma = calculateSMA(closes, p);
    const last = sma[sma.length - 1];
    result += `🟢 SMA${p}: ${last?.toFixed(2)}\n`;
  }

  return result;
}

// Bot Commands
bot.onText(/\/ma (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const parts = match[1].split(' ');
  const symbol = (parts[0] || 'BTCUSDT').toUpperCase();
  const interval = parts[1] || '1h';

  bot.sendMessage(chatId, `🔍 Fetching MAs for ${symbol} (${interval})...`);

  try {
    const result = await getMAData(symbol, interval);
    bot.sendMessage(chatId, result);
  } catch (err) {
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});
