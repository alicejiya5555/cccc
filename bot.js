const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = '7655482876:AAEblBNa0nqu6RTGao17OMbH7VAuwVzkxkk';
const CHAT_ID = '7538764539';
const TWELVE_DATA_API_KEY = '4682ca818a8048e8a8559617a7076638';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const formatNum = (num) => parseFloat(num).toFixed(2);

const sendMessage = async (message) => {
  try {
    await bot.sendMessage(CHAT_ID, message);
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

const getBinanceData = async (symbol) => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching Binance data:', error);
  }
};

const getTwelveDataIndicators = async (symbol, interval) => {
  const indicators = [5, 13, 21, 50, 100, 200];
  const indicatorData = {};

  for (const period of indicators) {
    try {
      const response = await fetch(`https://api.twelvedata.com/ma?symbol=${symbol}&interval=${interval}&type=sma&time_period=${period}&apikey=${TWELVE_DATA_API_KEY}&timezone=utc`);
      const data = await response.json();
      indicatorData[period] = data.value;
    } catch (error) {
      console.error(`Error fetching SMA(${period}) for ${symbol} ${interval}:`, error);
    }
  }

  return indicatorData;
};

const generateMessage = (symbol, interval, binanceData, indicatorData) => {
  const tfLabel = interval === '1h' ? '1-Hour' : '4-Hour';
  const indicators = Object.entries(indicatorData)
    .map(([period, value]) => `# SMA(${period}): ${formatNum(value)}`)
    .join('\n');

  return `
    📊 ${symbol} ${tfLabel} Analysis

    💰 Price: $${formatNum(binanceData.lastPrice)}
    📈 24h High: $${formatNum(binanceData.highPrice)}
    📉 24h Low: $${formatNum(binanceData.lowPrice)}
    🔁 Change: $${formatNum(binanceData.priceChange)} (${binanceData.priceChangePercent}%)
    🧮 Volume: ${formatNum(binanceData.volume)}
    💵 Quote Volume: $${formatNum(binanceData.quoteVolume)}
    🔓 Open Price: $${formatNum(binanceData.openPrice)}
    ⏰ Close Time: ${new Date(binanceData.closeTime).toLocaleString('en-UK')}

    Indicators:
    ${indicators}
  `;
};

const handleCommand = async (msg) => {
  const chatId = msg.chat.id;
  const command = msg.text.toLowerCase();

  let symbol, interval;

  switch (command) {
    case '/eth1h':
      symbol = 'ETH/USD';
      interval = '1h';
      break;
    case '/eth4h':
      symbol = 'ETH/USD';
      interval = '4h';
      break;
    case '/btc1h':
      symbol = 'BTC/USD';
      interval = '1h';
      break;
    case '/btc4h':
      symbol = 'BTC/USD';
      interval = '4h';
      break;
    case '/link1h':
      symbol = 'LINK/USD';
      interval = '1h';
      break;
    case '/link4h':
      symbol = 'LINK/USD';
      interval = '4h';
      break;
    default:
      return;
  }

  const binanceData = await getBinanceData(symbol.replace('/', ''));
  const indicatorData = await getTwelveDataIndicators(symbol, interval);
  const message = generateMessage(symbol, interval, binanceData, indicatorData);

  sendMessage(message);
};

bot.onText(/\/(eth1h|eth4h|btc1h|btc4h|link1h|link4h)/, handleCommand);
