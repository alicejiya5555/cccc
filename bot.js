const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const technicalindicators = require('technicalindicators');

const app = require('express')();
const PORT = process.env.PORT || 3000;

const token = '7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk';
const bot = new TelegramBot(token, { polling: true });

const symbolsMap = {
  eth1h: { symbol: 'ETHUSDT', interval: '1h', name: 'ETH' },
  eth4h: { symbol: 'ETHUSDT', interval: '4h', name: 'ETH' },
  eth12h: { symbol: 'ETHUSDT', interval: '12h', name: 'ETH' },
  btc1h: { symbol: 'BTCUSDT', interval: '1h', name: 'BTC' },
  btc4h: { symbol: 'BTCUSDT', interval: '4h', name: 'BTC' },
  btc12h: { symbol: 'BTCUSDT', interval: '12h', name: 'BTC' },
  link1h: { symbol: 'LINKUSDT', interval: '1h', name: 'LINK' },
  link4h: { symbol: 'LINKUSDT', interval: '4h', name: 'LINK' },
  link12h: { symbol: 'LINKUSDT', interval: '12h', name: 'LINK' }
};

// Helper to calculate VWAP for 1 and 5 period - custom implementation
function calculateVWAP(candles, period) {
  let vwapArr = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    let tpSum = 0, volSum = 0;
    slice.forEach(c => {
      const tp = (c.high + c.low + c.close) / 3;
      tpSum += tp * c.volume;
      volSum += c.volume;
    });
    vwapArr.push(tpSum / volSum);
  }
  return vwapArr;
}

async function fetchCandles(symbol, interval, limit = 300) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  try {
    const response = await axios.get(url);
    return response.data.map(c => ({
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      time: c[0]
    }));
  } catch (error) {
    console.error('Binance API error:', error.message);
    throw error;
  }
}

function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  // SMA & EMA & WMA periods
  const periodsSMA_EMA = [5, 13, 21, 50, 100, 200];
  const periodsWMA = [5, 13, 21, 50, 100];

  // SMA
  let sma = {};
  periodsSMA_EMA.forEach(p => {
    sma[p] = technicalindicators.SMA.calculate({ period: p, values: close });
  });

  // EMA
  let ema = {};
  periodsSMA_EMA.forEach(p => {
    ema[p] = technicalindicators.EMA.calculate({ period: p, values: close });
  });

  // WMA
  let wma = {};
  periodsWMA.forEach(p => {
    wma[p] = technicalindicators.WMA.calculate({ period: p, values: close });
  });

  // RSI 5, 14
  const rsi5 = technicalindicators.RSI.calculate({ period: 5, values: close });
  const rsi14 = technicalindicators.RSI.calculate({ period: 14, values: close });

  // MACD (3,10,16)
  const macd = technicalindicators.MACD.calculate({
    values: close,
    fastPeriod: 3,
    slowPeriod: 10,
    signalPeriod: 16,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });

  // Stochastic RSI (14,14,3,3)
  const stochRSI = technicalindicators.StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3
  });

  // DMI (14)
  const dmi = technicalindicators.DMI.calculate({
    high,
    low,
    close,
    period: 14
  });

  // MFI (14 and 21)
  const mfi14 = technicalindicators.MFI.calculate({ high, low, close, volume, period: 14 });
  const mfi21 = technicalindicators.MFI.calculate({ high, low, close, volume, period: 21 });

  // Bollinger Bands (20, 2)
  const bb = technicalindicators.BollingerBands.calculate({
    period: 20,
    values: close,
    stdDev: 2
  });

  // VWAP (1 and 5)
  const vwap1 = calculateVWAP(candles, 1);
  const vwap5 = calculateVWAP(candles, 5);

  // TRIX (9)
  const trix = technicalindicators.TRIX.calculate({ values: close, period: 9 });

  // ATR (14)
  const atr = technicalindicators.ATR.calculate({ high, low, close, period: 14 });

  // OBV
  const obv = technicalindicators.OBV.calculate({ close, volume });

  // SAR (0.02, 0.2)
  const sar = technicalindicators.SAR.calculate({ high, low, step: 0.02, max: 0.2 });

  // Williams %R (14)
  const williamsR = technicalindicators.WilliamsR.calculate({ high, low, close, period: 14 });

  // CCI (7,10,20)
  const cci7 = technicalindicators.CCI.calculate({ high, low, close, period: 7 });
  const cci10 = technicalindicators.CCI.calculate({ high, low, close, period: 10 });
  const cci20 = technicalindicators.CCI.calculate({ high, low, close, period: 20 });

  // MTM (7,14,21)
  const mtm7 = technicalindicators.MTM.calculate({ values: close, period: 7 });
  const mtm14 = technicalindicators.MTM.calculate({ values: close, period: 14 });
  const mtm21 = technicalindicators.MTM.calculate({ values: close, period: 21 });

  // KDJ Approximation (using Stoch)
  const stochastic = technicalindicators.Stochastic.calculate({
    high,
    low,
    close,
    period: 14,
    signalPeriod: 3
  });

  // Extract last values safely
  function last(arr) {
    return arr.length ? arr[arr.length - 1] : null;
  }

  return {
    sma: Object.fromEntries(periodsSMA_EMA.map(p => [p, last(sma[p])])),
    ema: Object.fromEntries(periodsSMA_EMA.map(p => [p, last(ema[p])])),
    wma: Object.fromEntries(periodsWMA.map(p => [p, last(wma[p])])),
    rsi5: last(rsi5),
    rsi14: last(rsi14),
    macd: last(macd),
    stochRSI: last(stochRSI),
    dmi: last(dmi),
    mfi14: last(mfi14),
    mfi21: last(mfi21),
    bb: last(bb),
    vwap1: last(vwap1),
    vwap5: last(vwap5),
    trix: last(trix),
    atr: last(atr),
    obv: last(obv),
    sar: last(sar),
    williamsR: last(williamsR),
    cci7: last(cci7),
    cci10: last(cci10),
    cci20: last(cci20),
    mtm7: last(mtm7),
    mtm14: last(mtm14),
    mtm21: last(mtm21),
    stochastic: last(stochastic)
  };
}

function formatIndicatorOutput(ind) {
  return `
SMA: 5=${ind.sma[5]?.toFixed(3)}, 13=${ind.sma[13]?.toFixed(3)}, 21=${ind.sma[21]?.toFixed(3)}, 50=${ind.sma[50]?.toFixed(3)}, 100=${ind.sma[100]?.toFixed(3)}, 200=${ind.sma[200]?.toFixed(3)}
EMA: 5=${ind.ema[5]?.toFixed(3)}, 13=${ind.ema[13]?.toFixed(3)}, 21=${ind.ema[21]?.toFixed(3)}, 50=${ind.ema[50]?.toFixed(3)}, 100=${ind.ema[100]?.toFixed(3)}, 200=${ind.ema[200]?.toFixed(3)}
WMA: 5=${ind.wma[5]?.toFixed(3)}, 13=${ind.wma[13]?.toFixed(3)}, 21=${ind.wma[21]?.toFixed(3)}, 50=${ind.wma[50]?.toFixed(3)}, 100=${ind.wma[100]?.toFixed(3)}

RSI: 5=${ind.rsi5?.toFixed(2)}, 14=${ind.rsi14?.toFixed(2)}
MACD: MACD=${ind.macd?.MACD.toFixed(3)}, Signal=${ind.macd?.signal.toFixed(3)}, Histogram=${ind.macd?.histogram.toFixed(3)}
Stoch RSI: K=${ind.stochRSI?.k.toFixed(2)}, D=${ind.stochRSI?.d.toFixed(2)}
DMI: +DI=${ind.dmi?.pdi.toFixed(2)}, -DI=${ind.dmi?.mdi.toFixed(2)}, ADX=${ind.dmi?.adx.toFixed(2)}
MFI: 14=${ind.mfi14?.toFixed(2)}, 21=${ind.mfi21?.toFixed(2)}
Bollinger Bands: Lower=${ind.bb?.lower.toFixed(3)}, Middle=${ind.bb?.middle.toFixed(3)}, Upper=${ind.bb?.upper.toFixed(3)}
VWAP: 1=${ind.vwap1?.toFixed(3)}, 5=${ind.vwap5?.toFixed(3)}
TRIX: ${ind.trix?.toFixed(3)}
ATR: ${ind.atr?.toFixed(3)}
OBV: ${ind.obv?.toFixed(0)}
SAR: ${ind.sar?.toFixed(3)}
Williams %R: ${ind.williamsR?.toFixed(2)}
CCI: 7=${ind.cci7?.toFixed(2)}, 10=${ind.cci10?.toFixed(2)}, 20=${ind.cci20?.toFixed(2)}
MTM: 7=${ind.mtm7?.toFixed(3)}, 14=${ind.mtm14?.toFixed(3)}, 21=${ind.mtm21?.toFixed(3)}
KDJ (Stoch): K=${ind.stochastic?.k.toFixed(2)}, D=${ind.stochastic?.d.toFixed(2)}, J=${(3 * ind.stochastic?.k - 2 * ind.stochastic?.d).toFixed(2)}
`.trim();
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `Hello ${msg.from.first_name}, welcome to your Crypto Indicator Bot! 
Send me commands like 'eth1h', 'btc4h', 'link12h' to get detailed indicators.`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  if (!text || !symbolsMap[text]) return; // Ignore unknown messages

  const { symbol, interval, name } = symbolsMap[text];

  bot.sendMessage(chatId, `Fetching ${name} data for ${interval}... Please wait.`);

  try {
    const candles = await fetchCandles(symbol, interval);
    const indicators = calculateIndicators(candles);
    const output = formatIndicatorOutput(indicators);

    bot.sendMessage(chatId, `📊 *${name} ${interval} Technical Indicators:*\n\n${output}`, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, 'Sorry, there was an error fetching data. Please try again later.');
  }
});

// Basic express setup so you can deploy on Render or Heroku easily
app.get('/', (req, res) => {
  res.send('Crypto Indicator Bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
