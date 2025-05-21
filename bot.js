require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;

const getPriceData = async (symbol) => {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  const data = await res.json();
  return {
    price: data.lastPrice,
    high: data.highPrice,
    low: data.lowPrice,
    change: data.priceChangePercent + '%',
    volume: data.volume,
    quoteVolume: data.quoteVolume,
    open: data.openPrice,
    closeTime: new Date(data.closeTime).toLocaleTimeString(),
  };
};

const getIndicators = async (symbol, interval) => {
  const indicators = ['sma', 'ema', 'rsi', 'macd', 'bbands'];
  const queries = indicators.map(indicator =>
    `https://api.twelvedata.com/${indicator}?symbol=${symbol}&interval=${interval}&apikey=${TWELVE_API_KEY}`
  );
  const results = await Promise.all(queries.map(url => fetch(url).then(r => r.json())));
  return {
    sma: results[0].values?.[0]?.sma,
    ema: results[1].values?.[0]?.ema,
    rsi: results[2].values?.[0]?.rsi,
    macd: results[3].values?.[0]?.macd,
    bbands: {
      upper: results[4].values?.[0]?.upper_band,
      middle: results[4].values?.[0]?.middle_band,
      lower: results[4].values?.[0]?.lower_band,
    }
  };
};

bot.start((ctx) => {
  ctx.reply('👋 Send /btc1h or /eth15m to get crypto analysis!');
});

bot.hears(/^\/(btc|eth|link)(15m|1h|4h)$/i, async (ctx) => {
  const input = ctx.message.text.replace('/', '');
  const [coin, timeframe] = [input.slice(0, -timeframeLength(input)), input.slice(-timeframeLength(input))];
  const symbolMap = { btc: 'BTCUSDT', eth: 'ETHUSDT', link: 'LINKUSDT' };
  const twelveSymbolMap = { btc: 'BTC/USD', eth: 'ETH/USD', link: 'LINK/USD' };

  try {
    ctx.reply(`📊 Fetching data for ${coin.toUpperCase()} - ${timeframe}...`);

    const priceData = await getPriceData(symbolMap[coin]);
    const indicators = await getIndicators(twelveSymbolMap[coin], timeframe);

    const message = `
📊 ${coin.toUpperCase()} ${timeframe.toUpperCase()} Analysis

💰 Price: $${priceData.price}
📈 24h High: $${priceData.high}
📉 24h Low: $${priceData.low}
🔁 Change: ${priceData.change}
🧮 Volume: ${priceData.volume}
💵 Quote Volume: ${priceData.quoteVolume}
🔓 Open Price: $${priceData.open}
⏰ Close Time: ${priceData.closeTime}

📊 Indicators:
SMA: ${indicators.sma}
EMA: ${indicators.ema}
RSI: ${indicators.rsi}
MACD: ${indicators.macd}
Bollinger Bands:
↗️ Upper: ${indicators.bbands.upper}
➡️ Mid: ${indicators.bbands.middle}
↘️ Lower: ${indicators.bbands.lower}
    `;

    ctx.reply(message);
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error fetching data. Please try again later.');
  }
});

const timeframeLength = (tf) => {
  if (tf === '15m') return 3;
  if (tf === '1h') return 2;
  if (tf === '4h') return 2;
  return 3;
};

bot.launch();
console.log('🚀 Bot is running...');
