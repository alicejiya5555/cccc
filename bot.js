const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

// Replace with your actual API keys and Chat ID
const TELEGRAM_TOKEN = '7655482876:AAEblBNa0nqu6RTGao17OMbH7VAuwVzkxkk';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';
const CHAT_ID = '7538764539';

// Express app setup
const app = express();
app.use(express.json());

// Create bot with webhook
const bot = new TelegramBot(TELEGRAM_TOKEN);
bot.setWebHook(`https://yourdomain.com/bot${TELEGRAM_TOKEN}`);

// Helper function to format numbers
const formatNum = (num) => {
  return parseFloat(num).toFixed(2);
};

// Mapping for commands to symbols and intervals
const commandMap = {
  '/eth1h': { symbol: 'ETH', interval: '1h' },
  '/eth4h': { symbol: 'ETH', interval: '4h' },
  '/btc1h': { symbol: 'BTC', interval: '1h' },
  '/btc4h': { symbol: 'BTC', interval: '4h' },
  '/link1h': { symbol: 'LINK', interval: '1h' },
  '/link4h': { symbol: 'LINK', interval: '4h' },
};

// Function to fetch SMA data
const fetchSMAData = async (symbol, interval) => {
  const periods = [5, 13, 21, 50, 100, 200];
  const smaData = {};

  for (const period of periods) {
    const url = `https://api.twelvedata.com/ma?symbol=${symbol}/USD&interval=${interval}&type=sma&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}&timezone=utc`;
    try {
      const response = await axios.get(url);
      if (response.data && response.data.values && response.data.values.length > 0) {
        smaData[`SMA(${period})`] = response.data.values[0].value;
      } else {
        smaData[`SMA(${period})`] = 'N/A';
      }
    } catch (error) {
      console.error(`Error fetching SMA(${period}) for ${symbol}:`, error.message);
      smaData[`SMA(${period})`] = 'Error';
    }
  }

  return smaData;
};

// Function to fetch Binance market data
const fetchBinanceData = async (symbol) => {
  const binanceSymbol = symbol + 'USDT';
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching Binance data for ${symbol}:`, error.message);
    return null;
  }
};

// Webhook endpoint
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  const msg = req.body.message;
  const chatId = msg.chat.id;
  const command = msg.text.toLowerCase();

  if (commandMap[command]) {
    const { symbol, interval } = commandMap[command];
    const tfLabel = interval === '1h' ? '1-Hour' : '4-Hour';

    // Fetch data
    const [smaData, binanceData] = await Promise.all([
      fetchSMAData(symbol, interval),
      fetchBinanceData(symbol),
    ]);

    // Construct message
    let message = `📊 ${symbol}/USD ${tfLabel} Analysis\n\n`;

    if (binanceData) {
      message += `💰 Price: $${formatNum(binanceData.lastPrice)}\n`;
      message += `📈 24h High: $${formatNum(binanceData.highPrice)}\n`;
      message += `📉 24h Low: $${formatNum(binanceData.lowPrice)}\n`;
      message += `🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)\n`;
      message += `🧮 Volume: ${formatNum(binanceData.volume)}\n`;
      message += `💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}\n`;
      message += `🔓 Open Price: $${formatNum(binanceData.openPrice)}\n`;
      message += `⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}\n\n`;
    } else {
      message += '⚠️ Unable to fetch Binance data.\n\n';
    }

    message += '📐 SMA Indicators:\n';
    for (const [key, value] of Object.entries(smaData)) {
      message += `- ${key}: ${value}\n`;
    }

    // Send message
    bot.sendMessage(chatId, message);
  }

  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server is listening on ${PORT}`);
});
