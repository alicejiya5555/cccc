const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const SMA_PERIODS = [5, 13, 21, 50, 100, 200];

// Map user commands to symbols and Binance trading pairs
const SYMBOLS = {
  btc: { tdSymbol: 'BTC/USD', binanceSymbol: 'BTCUSDT', name: 'Bitcoin' },
  eth: { tdSymbol: 'ETH/USD', binanceSymbol: 'ETHUSDT', name: 'Ethereum' },
  link: { tdSymbol: 'LINK/USD', binanceSymbol: 'LINKUSDT', name: 'Chainlink' },
  bnb: { tdSymbol: 'BNB/USD', binanceSymbol: 'BNBUSDT', name: 'Binance Coin' },
};

function formatNum(num) {
  if (!num) return 'N/A';
  if (parseFloat(num) >= 1000) return parseFloat(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return parseFloat(num).toFixed(4);
}

async function fetchSMA(symbol, interval, period) {
  const url = `https://api.twelvedata.com/sma?symbol=${symbol}&interval=${interval}&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}`;
  try {
    const response = await axios.get(url);
    if (response.data.values && response.data.values.length > 0) {
      return response.data.values[0].sma;
    } else if (response.data.value) {
      return response.data.value;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching SMA(${period}) for ${symbol} on ${interval}: ${error.message}`);
    return null;
  }
}

async function fetchBinanceData(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching Binance data for ${symbol}: ${error.message}`);
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `👋 Hello! Send commands like:\n\neth1h\neth4h\nbtc1h\nbtc4h\nlink1h\nlink4h\nbnb1h\nbnb4h\n\nI will reply with SMA(5,13,21,50,100,200) from Twelve Data and market data from Binance for that symbol & interval.`
  );
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase().trim();

  const match = text.match(/^(btc|eth|link|bnb)(1h|4h)$/);
  if (!match) {
    if (text !== '/start') {
      bot.sendMessage(chatId, "❌ Invalid command. Please send commands like 'eth1h', 'btc4h', 'bnb1h'.");
    }
    return;
  }

  const symbolKey = match[1];
  const interval = match[2];
  const symbolInfo = SYMBOLS[symbolKey];

  if (!symbolInfo) {
    bot.sendMessage(chatId, '❌ Unknown symbol.');
    return;
  }

  // Fetch SMA values from Twelve Data
  const smaPromises = SMA_PERIODS.map((period) => fetchSMA(symbolInfo.tdSymbol, interval, period));
  const smaValues = await Promise.all(smaPromises);

  // Fetch Binance market data
  const binanceData = await fetchBinanceData(symbolInfo.binanceSymbol);

  let reply = `📊 ${symbolInfo.name} (${symbolKey.toUpperCase()}) — Interval: ${interval}\n\n`;

  if (binanceData) {
    reply += `💰 Price: $${formatNum(binanceData.lastPrice)}\n`;
    reply += `📈 24h High: $${formatNum(binanceData.highPrice)}\n`;
    reply += `📉 24h Low: $${formatNum(binanceData.lowPrice)}\n`;
    reply += `🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)\n`;
    reply += `🧮 Volume: ${formatNum(binanceData.volume)}\n`;
    reply += `💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}\n`;
    reply += `🔓 Open Price: $${formatNum(binanceData.openPrice)}\n`;
    reply += `⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-GB')}\n\n`;
  } else {
    reply += "⚠️ Binance market data unavailable.\n\n";
  }

  reply += `📈 SMA values (from Twelve Data):\n`;
  SMA_PERIODS.forEach((period, idx) => {
    if (smaValues[idx]) {
      reply += `SMA(${period}): ${parseFloat(smaValues[idx]).toFixed(4)}\n`;
    } else {
      reply += `SMA(${period}): Data not available\n`;
    }
  });

  bot.sendMessage(chatId, reply);
});
