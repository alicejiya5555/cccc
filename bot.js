// bot.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const SMA_PERIODS = [5, 13, 21, 50, 100, 200];

const SYMBOLS = {
  btc: { tdSymbol: 'BTC/USD', binanceSymbol: 'BTCUSDT', name: 'Bitcoin' },
  eth: { tdSymbol: 'ETH/USD', binanceSymbol: 'ETHUSDT', name: 'Ethereum' },
  link: { tdSymbol: 'LINK/USD', binanceSymbol: 'LINKUSDT', name: 'Chainlink' },
  bnb: { tdSymbol: 'BNB/USD', binanceSymbol: 'BNBUSDT', name: 'BNB Coin' },
};

function formatNum(num) {
  if (!num) return 'N/A';
  if (parseFloat(num) >= 1000) return parseFloat(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return parseFloat(num).toFixed(4);
}

async function fetchSMA(symbol, interval, period) {
  const url = `https://api.twelvedata.com/ma?symbol=${symbol}&interval=${interval}&type=sma&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}&timezone=utc`;
  try {
    const response = await axios.get(url);
    if (response.data?.values?.[0]?.value) {
      return response.data.values[0].value;
    } else if (response.data.value) {
      return response.data.value;
    }
    return null;
  } catch (err) {
    console.error(`SMA(${period}) error for ${symbol} ${interval}: ${err.message}`);
    return null;
  }
}

async function fetchBinanceData(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    console.error(`Binance error for ${symbol}: ${err.message}`);
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  const welcome = `👋 Welcome!\n\nSend one of these commands:\n/eth1h  /eth4h\n/btc1h  /btc4h\n/link1h /link4h\n/bnb1h  /bnb4h\n\nI'll return SMA values from Twelve Data and live Binance prices.`;
  bot.sendMessage(msg.chat.id, welcome);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase().trim();

  const match = text.match(/^(\/)?(btc|eth|link|bnb)(1h|4h)$/);
  if (!match) {
    if (text !== '/start') {
      bot.sendMessage(chatId, "❌ Invalid command. Use: /eth1h, /btc4h, etc.");
    }
    return;
  }

  const symbolKey = match[2];
  const interval = match[3];
  const symbol = SYMBOLS[symbolKey];

  // SMA values
  const smaResults = await Promise.all(
    SMA_PERIODS.map((p) => fetchSMA(symbol.tdSymbol, interval, p))
  );

  // Binance market stats
  const market = await fetchBinanceData(symbol.binanceSymbol);

  let reply = `📊 ${symbol.name} (${symbolKey.toUpperCase()}) — Interval: ${interval}\n\n`;

  if (market) {
    reply += `💰 Price: $${formatNum(market.lastPrice)}\n`;
    reply += `📈 High: $${formatNum(market.highPrice)} | 📉 Low: $${formatNum(market.lowPrice)}\n`;
    reply += `🔁 Change: $${formatNum(market.priceChange)} (${market.priceChangePercent}%)\n`;
    reply += `📊 Volume: ${formatNum(market.volume)} | 💵 Quote: $${formatNum(market.quoteVolume)}\n\n`;
  } else {
    reply += "⚠️ Binance market data not available\n\n";
  }

  reply += `📈 SMA values (Twelve Data):\n`;
  SMA_PERIODS.forEach((p, i) => {
    reply += `SMA(${p}): ${smaResults[i] ? parseFloat(smaResults[i]).toFixed(4) : 'N/A'}\n`;
  });

  bot.sendMessage(chatId, reply);
});
