const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// SMA periods you want
const SMA_PERIODS = [5, 13, 21, 50, 100, 200];

// Map for symbol shortcuts
const SYMBOLS = {
  btc: 'BTC/USDT',
  eth: 'ETH/USDT',
  link: 'LINK/USDT',
};

async function fetchSMA(symbol, interval, period) {
  const url = `https://api.twelvedata.com/sma?symbol=${symbol}&interval=${interval}&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}`;

  try {
    const response = await axios.get(url);
    if (response.data.values && response.data.values.length > 0) {
      return response.data.values[0].sma;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error fetching SMA(${period}) for ${symbol} on ${interval}:`, error.message);
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 Hello! Send commands like:\n\nsma btc1h\nsma eth4h\nsma link1h\n\nand I will fetch SMA(5,13,21,50,100,200) values for you.`
  );
});

bot.onText(/sma (\w+)(\d+h)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbolKey = match[1].toLowerCase();
  const interval = match[2].toLowerCase();

  if (!SYMBOLS[symbolKey]) {
    bot.sendMessage(chatId, '❌ Unknown symbol. Use btc, eth, or link.');
    return;
  }

  const symbol = SYMBOLS[symbolKey];
  let reply = `📊 SMA values for ${symbol} on interval ${interval}:\n\n`;

  // Fetch all SMAs in parallel
  const smaPromises = SMA_PERIODS.map((period) => fetchSMA(symbol, interval, period));
  const smaValues = await Promise.all(smaPromises);

  SMA_PERIODS.forEach((period, idx) => {
    if (smaValues[idx]) {
      reply += `SMA(${period}): ${parseFloat(smaValues[idx]).toFixed(4)}\n`;
    } else {
      reply += `SMA(${period}): Data not available\n`;
    }
  });

  bot.sendMessage(chatId, reply);
});

// Fallback for wrong commands
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();
  if (!text.startsWith('sma') && !text.startsWith('/start')) {
    bot.sendMessage(chatId, "❓ Please send SMA command like 'sma btc1h' or '/start' for help.");
  }
});
