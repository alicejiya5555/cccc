const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's assigned port if set

const token = '7655482876:AAFF_GVN8NqdzBZYctRHHCIQpVvXNZBM1Do';
const bot = new TelegramBot(token, { polling: true });

const twelveDataApiKey = '4682ca818a8048e8a8559617a7076638'; // Your Twelve Data API key

const symbolsMap = {
  eth1h: { symbol: 'ETHUSDT', interval: '1h', name: 'ETH' },
  eth4h: { symbol: 'ETHUSDT', interval: '4h', name: 'ETH' },
  btc1h: { symbol: 'BTCUSDT', interval: '1h', name: 'BTC' },
  btc4h: { symbol: 'BTCUSDT', interval: '4h', name: 'BTC' },
  link1h: { symbol: 'LINKUSDT', interval: '1h', name: 'LINK' },
  link4h: { symbol: 'LINKUSDT', interval: '4h', name: 'LINK' }
};

function formatNum(num) {
  return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    // Request multiple indicators at once using batch endpoint for efficiency
    // Example indicators: EMA, ADX, ATR, BBANDS (choose your favorites)
    const indicators = ['ema', 'adx', 'atr', 'bbands'];
    const promises = indicators.map(indicator => {
      const url = `https://api.twelvedata.com/${indicator}?symbol=${symbol}&interval=${interval}&apikey=${twelveDataApiKey}&format=json&outputsize=1`;
      return axios.get(url).then(res => ({ [indicator]: res.data }));
    });
    const results = await Promise.all(promises);
    // Combine results
    return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
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

  const indicatorsData = await getTwelveDataIndicators(symbol.replace('USDT', ''), interval);
  if (!indicatorsData) {
    bot.sendMessage(msg.chat.id, '⚠️ Failed to fetch indicator data.');
    return;
  }

  // Extract relevant indicator values (check your actual API responses to adjust paths)
  const ema = indicatorsData.ema?.values ? indicatorsData.ema.values[0].ema : 'N/A';
  const adx = indicatorsData.adx?.values ? indicatorsData.adx.values[0].adx : 'N/A';
  const atr = indicatorsData.atr?.values ? indicatorsData.atr.values[0].atr : 'N/A';
  // BBANDS returns upper, middle, lower bands
  const bbandsUpper = indicatorsData.bbands?.values ? indicatorsData.bbands.values[0].upperband : 'N/A';
  const bbandsMiddle = indicatorsData.bbands?.values ? indicatorsData.bbands.values[0].middleband : 'N/A';
  const bbandsLower = indicatorsData.bbands?.values ? indicatorsData.bbands.values[0].lowerband : 'N/A';

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
EMA: ${ema !== 'N/A' ? formatNum(ema) : 'N/A'}
ADX: ${adx !== 'N/A' ? formatNum(adx) : 'N/A'}
ATR: ${atr !== 'N/A' ? formatNum(atr) : 'N/A'}
BBANDS Upper: ${bbandsUpper !== 'N/A' ? formatNum(bbandsUpper) : 'N/A'}
BBANDS Middle: ${bbandsMiddle !== 'N/A' ? formatNum(bbandsMiddle) : 'N/A'}
BBANDS Lower: ${bbandsLower !== 'N/A' ? formatNum(bbandsLower) : 'N/A'}
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
