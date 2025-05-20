const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const token = '7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do';
const bot = new TelegramBot(token, { polling: true });

const twelveDataApiKey = '4682ca818a8048e8a8559617a7076638';

const symbolsMap = {
  eth1h: { symbol: 'ETHUSDT', interval: '1h', name: 'ETH' },
  eth4h: { symbol: 'ETHUSDT', interval: '4h', name: 'ETH' },
  btc1h: { symbol: 'BTCUSDT', interval: '1h', name: 'BTC' },
  btc4h: { symbol: 'BTCUSDT', interval: '4h', name: 'BTC' },
  link1h: { symbol: 'LINKUSDT', interval: '1h', name: 'LINK' },
  link4h: { symbol: 'LINKUSDT', interval: '4h', name: 'LINK' }
};

function formatNum(num) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatTimeframeLabel(cmd) {
  if (cmd.endsWith('1h')) return '1h';
  if (cmd.endsWith('4h')) return '4h';
  return '';
}

async function getBinanceData(symbol) {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    console.error('Binance API error:', err.message);
    return null;
  }
}

async function getTwelveDataIndicators(symbol, interval) {
  try {
    const base = symbol.replace('USDT', '');
    const indicators = ['ema', 'adx', 'atr', 'bbands'];
    const indicatorRequests = indicators.map(ind => {
      const url = `https://api.twelvedata.com/${ind}?symbol=${base}/USD&interval=${interval}&apikey=${twelveDataApiKey}&format=json&outputsize=1`;
      return axios.get(url).then(res => ({ [ind]: res.data }));
    });

    const smaPeriods = [5, 13, 21, 50, 100, 200];
    const smaRequests = smaPeriods.map(period => {
      const url = `https://api.twelvedata.com/ma?symbol=${base}/USD&interval=${interval}&type=sma&time_period=${period}&apikey=${twelveDataApiKey}&format=json&outputsize=1`;
      return axios.get(url).then(res => ({ [`sma${period}`]: res.data }));
    });

    const allRequests = await Promise.all([...indicatorRequests, ...smaRequests]);
    return allRequests.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  } catch (err) {
    console.error('Twelve Data API error:', err.message);
    return null;
  }
}

bot.onText(/\/(eth1h|eth4h|btc1h|btc4h|link1h|link4h)/, async (msg, match) => {
  const command = match[1];
  const { symbol, interval, name } = symbolsMap[command];
  const tfLabel = formatTimeframeLabel(command);

  const binanceData = await getBinanceData(symbol);
  if (!binanceData) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch data from Binance.');
    return;
  }

  const indicatorsData = await getTwelveDataIndicators(symbol, interval);
  if (!indicatorsData) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch indicator data.');
    return;
  }

  const getValue = (data, key) =>
    data?.values ? formatNum(data.values[0][key]) : 'N/A';

  const message = `📊 ${name} ${tfLabel} Analysis

💰 Price: $${formatNum(binanceData.lastPrice)}
📈 24h High: $${formatNum(binanceData.highPrice)}
📉 24h Low: $${formatNum(binanceData.lowPrice)}
🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
🧮 Volume: ${formatNum(binanceData.volume)}
💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}
🔓 Open Price: $${formatNum(binanceData.openPrice)}
⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}

📊 Indicators:
EMA: ${getValue(indicatorsData.ema, 'ema')}
ADX: ${getValue(indicatorsData.adx, 'adx')}
ATR: ${getValue(indicatorsData.atr, 'atr')}
BBANDS:
  ┗ Upper: ${getValue(indicatorsData.bbands, 'upperband')}
  ┗ Middle: ${getValue(indicatorsData.bbands, 'middleband')}
  ┗ Lower: ${getValue(indicatorsData.bbands, 'lowerband')}

SMA Levels:
  ┗ SMA(5): ${getValue(indicatorsData.sma5, 'value')}
  ┗ SMA(13): ${getValue(indicatorsData.sma13, 'value')}
  ┗ SMA(21): ${getValue(indicatorsData.sma21, 'value')}
  ┗ SMA(50): ${getValue(indicatorsData.sma50, 'value')}
  ┗ SMA(100): ${getValue(indicatorsData.sma100, 'value')}
  ┗ SMA(200): ${getValue(indicatorsData.sma200, 'value')}
`;

  bot.sendMessage(msg.chat.id, message);
});

// Minimal web server to satisfy Render hosting
app.get('/', (req, res) => {
  res.send('Telegram Bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
