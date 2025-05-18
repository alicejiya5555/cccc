const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's assigned port if set

// Replace with your real Telegram bot token
const token = '7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do';

const bot = new TelegramBot(token, { polling: true });

const symbolsMap = {
  eth1h: 'ETHUSDT',
  eth4h: 'ETHUSDT',
  btc1h: 'BTCUSDT',
  btc4h: 'BTCUSDT',
  link1h: 'LINKUSDT',
  link4h: 'LINKUSDT'
};

// Convert command to timeframe label
function formatTimeframe(cmd) {
  if (cmd.endsWith('1h')) return '1 Hour';
  if (cmd.endsWith('4h')) return '4 Hour';
  return '';
}

// Format number with commas and 2 decimals
function formatNum(num) {
  return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Get data from Binance
async function getBinanceData(symbol) {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    console.error('Binance API error:', err.message);
    return null;
  }
}

bot.onText(/\/(eth1h|eth4h|btc1h|btc4h|link1h|link4h)/, async (msg, match) => {
  const command = match[1];
  const symbol = symbolsMap[command];
  const tf = formatTimeframe(command);

  const data = await getBinanceData(symbol);
  if (!data) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch data from Binance.');
    return;
  }

  const message = `📊 ${symbol} ${tf} Analysis

💰 Price: $${formatNum(data.lastPrice)}
🔼 High 24h: $${formatNum(data.highPrice)}
🔽 Low 24h: $${formatNum(data.lowPrice)}

📈 24h Change: ${formatNum(data.priceChange)} (${data.priceChangePercent}%)
📦 Volume: ${formatNum(data.volume)} ${symbol.replace('USDT', '')}
💵 Quote Volume: $${formatNum(data.quoteVolume)}

🕰️ Updated: ${new Date().toLocaleString('en-UK')}
`;

  bot.sendMessage(msg.chat.id, message);
});

// Minimal Express server to bind port for Render
app.get('/', (req, res) => {
  res.send('Telegram Bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
