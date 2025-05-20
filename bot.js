const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '7655482876:AAFF_GVN8nqdzBZYctRHHCIQpVvXNZBM1Do';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const COIN_MAP = {
  btc: { name: 'Bitcoin', twelve: 'BTC/USDT', binance: 'BTCUSDT' },
  eth: { name: 'Ethereum', twelve: 'ETH/USDT', binance: 'ETHUSDT' },
  link: { name: 'Chainlink', twelve: 'LINK/USDT', binance: 'LINKUSDT' },
};

const SMA_PERIODS = [5, 13, 21, 50, 100, 200];
const EMA_PERIODS = [5, 13, 21, 50, 100, 200];
const WMA_PERIODS = [5, 13, 21, 50, 100];
const MACD_SETTINGS = { short: 3, long: 10, signal: 16 };

function formatNum(num) {
  return parseFloat(num).toFixed(4);
}

async function fetchBinanceData(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    console.error('Binance fetch error:', err.message);
    return null;
  }
}

async function fetchIndicator(type, symbol, interval, period) {
  const url = `https://api.twelvedata.com/ma?symbol=${symbol}&interval=${interval}&type=${type}&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}&timezone=utc`;
  try {
    const res = await axios.get(url);
    return res.data.values?.[0]?.value || 'N/A';
  } catch (err) {
    return 'N/A';
  }
}

async function fetchMACD(symbol, interval) {
  const url = `https://api.twelvedata.com/macd?symbol=${symbol}&interval=${interval}&short_period=${MACD_SETTINGS.short}&long_period=${MACD_SETTINGS.long}&signal_period=${MACD_SETTINGS.signal}&apikey=${TWELVE_DATA_API_KEY}`;
  try {
    const res = await axios.get(url);
    const v = res.data.values?.[0];
    return v
      ? `MACD: ${formatNum(v.macd)} | Signal: ${formatNum(v.signal)} | Histogram: ${formatNum(v.histogram)}`
      : 'MACD data not available';
  } catch (err) {
    return 'MACD fetch failed';
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `👋 Hello Natalia!\n\nUse commands like:\neth1h, btc4h, link1h\n\nI will show:\n✅ SMA, EMA, WMA, MACD (TwelveData)\n✅ Price & Volume (Binance)\n`);
});

bot.onText(/^(eth|btc|link)(1h|4h)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const [_, coinKey, interval] = match;
  const tfLabel = interval === '1h' ? '1 Hour' : '4 Hour';

  const coin = COIN_MAP[coinKey.toLowerCase()];
  const symbolTD = coin.twelve;
  const symbolBN = coin.binance;

  let response = `📊 ${coin.name} ${tfLabel} Analysis\n\n`;

  // Binance Data
  const binanceData = await fetchBinanceData(symbolBN);
  if (binanceData) {
    response += `💰 Price: $${formatNum(binanceData.lastPrice)}\n📈 High: $${formatNum(binanceData.highPrice)}\n📉 Low: $${formatNum(binanceData.lowPrice)}\n🔁 Change: ${binanceData.priceChangePercent}%\n📊 Volume: ${formatNum(binanceData.volume)}\n💵 Quote Vol: $${formatNum(binanceData.quoteVolume)}\n🧮 Open: $${formatNum(binanceData.openPrice)}\n⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}\n\n`;
  }

  // SMA
  response += `📏 SMA:\n`;
  const smaVals = await Promise.all(SMA_PERIODS.map(p => fetchIndicator('sma', symbolTD, interval, p)));
  SMA_PERIODS.forEach((p, i) => response += `SMA(${p}): ${formatNum(smaVals[i])}\n`);

  // EMA
  response += `\n📐 EMA:\n`;
  const emaVals = await Promise.all(EMA_PERIODS.map(p => fetchIndicator('ema', symbolTD, interval, p)));
  EMA_PERIODS.forEach((p, i) => response += `EMA(${p}): ${formatNum(emaVals[i])}\n`);

  // WMA
  response += `\n⚖️ WMA:\n`;
  const wmaVals = await Promise.all(WMA_PERIODS.map(p => fetchIndicator('wma', symbolTD, interval, p)));
  WMA_PERIODS.forEach((p, i) => response += `WMA(${p}): ${formatNum(wmaVals[i])}\n`);

  // MACD
  const macdLine = await fetchMACD(symbolTD, interval);
  response += `\n📊 MACD (3,10,16):\n${macdLine}`;

  bot.sendMessage(chatId, response);
});

// Invalid message fallback
bot.on('message', (msg) => {
  const text = msg.text.toLowerCase();
  if (!/^(eth|btc|link)(1h|4h)$/.test(text) && !text.startsWith('/start')) {
    bot.sendMessage(msg.chat.id, `❌ Unknown command. Please use eth1h, btc4h, or /start for help.`);
  }
});
