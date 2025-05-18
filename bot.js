const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Your Telegram bot token
const token = '7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do';
const bot = new TelegramBot(token, { polling: true });

// Your Twelve Data API key (replace with your real key)
const TWELVE_API_KEY = 'YOUR_TWELVE_DATA_API_KEY';

const symbolsMap = {
  eth1h: 'ETHUSDT',
  eth4h: 'ETHUSDT',
  btc1h: 'BTCUSDT',
  btc4h: 'BTCUSDT',
  link1h: 'LINKUSDT',
  link4h: 'LINKUSDT'
};

const intervalsMap = {
  eth1h: '1h',
  eth4h: '4h',
  btc1h: '1h',
  btc4h: '4h',
  link1h: '1h',
  link4h: '4h'
};

function formatTimeframe(cmd) {
  if (cmd.endsWith('1h')) return '1 Hour';
  if (cmd.endsWith('4h')) return '4 Hour';
  return '';
}

function formatNum(num) {
  return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

// Fetch multiple indicators from Twelve Data API
async function getTwelveIndicators(symbol, interval) {
  try {
    // Example indicators: EMA(20), ADX(14), ATR(14)
    const indicators = ['ema', 'adx', 'atr'];
    const promises = indicators.map(async (ind) => {
      const url = `https://api.twelvedata.com/technical_indicator?symbol=${symbol}&interval=${interval}&indicator=${ind}&time_period=14&apikey=${TWELVE_API_KEY}`;
      const res = await axios.get(url);
      // Return the latest value if data exists
      if (res.data && res.data.values && res.data.values.length > 0) {
        return { name: ind.toUpperCase(), value: res.data.values[0].value };
      } else {
        return { name: ind.toUpperCase(), value: 'N/A' };
      }
    });

    const results = await Promise.all(promises);
    return results;
  } catch (err) {
    console.error('Twelve Data API error:', err.message);
    return null;
  }
}

bot.onText(/\/(eth1h|eth4h|btc1h|btc4h|link1h|link4h)/, async (msg, match) => {
  const command = match[1];
  const symbol = symbolsMap[command];
  const interval = intervalsMap[command];
  const tf = formatTimeframe(command);

  const binanceData = await getBinanceData(symbol);
  if (!binanceData) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch data from Binance.');
    return;
  }

  const indicators = await getTwelveIndicators(symbol, interval);
  if (!indicators) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch indicators from Twelve Data.');
    return;
  }

  // Build indicator message part
  let indicatorMsg = indicators.map(ind => `${ind.name}: ${ind.value === 'N/A' ? 'N/A' : formatNum(ind.value)}`).join('\n');

  const message = `📊 ${symbol} ${tf} Analysis

💰 Price: $${formatNum(binanceData.lastPrice)}
🔼 High 24h: $${formatNum(binanceData.highPrice)}
🔽 Low 24h: $${formatNum(binanceData.lowPrice)}

📈 24h Change: ${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
📦 Volume: ${formatNum(binanceData.volume)} ${symbol.replace('USDT', '')}
💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}

⚙️ Indicators:
${indicatorMsg}

🕰️ Updated: ${new Date().toLocaleString('en-UK')}
`;

  bot.sendMessage(msg.chat.id, message);
});

// Express server to bind port for Render
app.get('/', (req, res) => {
  res.send('Telegram Bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
