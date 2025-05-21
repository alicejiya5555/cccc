const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const technicalindicators = require('technicalindicators');
const express = require('express');
const app = express();
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

async function fetchCandles(symbol, interval, limit = 100) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await axios.get(url);
  return response.data.map(c => ({
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
    time: c[0]
  }));
}

function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);
  const sma = p => technicalindicators.SMA.calculate({ period: p, values: close });
  const ema = p => technicalindicators.EMA.calculate({ period: p, values: close });
  const wma = p => technicalindicators.WMA.calculate({ period: p, values: close });
  const last = arr => arr.length ? arr[arr.length - 1] : null;

  return {
    sma: { 5: last(sma(5)), 13: last(sma(13)), 21: last(sma(21)), 50: last(sma(50)), 100: last(sma(100)), 200: last(sma(200)) },
    ema: { 5: last(ema(5)), 13: last(ema(13)), 21: last(ema(21)), 50: last(ema(50)), 100: last(ema(100)), 200: last(ema(200)) },
    wma: { 5: last(wma(5)), 13: last(wma(13)), 21: last(wma(21)), 50: last(wma(50)), 100: last(wma(100)) },
    rsi5: last(technicalindicators.RSI.calculate({ period: 5, values: close })),
    rsi14: last(technicalindicators.RSI.calculate({ period: 14, values: close })),
    macd: last(technicalindicators.MACD.calculate({ values: close, fastPeriod: 3, slowPeriod: 10, signalPeriod: 16, SimpleMAOscillator: false, SimpleMASignal: false })),
    stochRSI: last(technicalindicators.StochasticRSI.calculate({ values: close, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 })),
    dmi: last(technicalindicators.DMI.calculate({ high, low, close, period: 14 })),
    mfi14: last(technicalindicators.MFI.calculate({ high, low, close, volume, period: 14 })),
    mfi21: last(technicalindicators.MFI.calculate({ high, low, close, volume, period: 21 })),
    bb: last(technicalindicators.BollingerBands.calculate({ period: 20, values: close, stdDev: 2 })),
    vwap1: last(calculateVWAP(candles, 1)),
    vwap5: last(calculateVWAP(candles, 5)),
    trix: last(technicalindicators.TRIX.calculate({ values: close, period: 9 })),
    atr: last(technicalindicators.ATR.calculate({ high, low, close, period: 14 })),
    obv: last(technicalindicators.OBV.calculate({ close, volume })),
    sar: last(technicalindicators.SAR.calculate({ high, low, step: 0.02, max: 0.2 })),
    williamsR: last(technicalindicators.WilliamsR.calculate({ high, low, close, period: 14 })),
    cci7: last(technicalindicators.CCI.calculate({ high, low, close, period: 7 })),
    cci10: last(technicalindicators.CCI.calculate({ high, low, close, period: 10 })),
    cci20: last(technicalindicators.CCI.calculate({ high, low, close, period: 20 })),
    mtm7: last(technicalindicators.MTM.calculate({ values: close, period: 7 })),
    mtm14: last(technicalindicators.MTM.calculate({ values: close, period: 14 })),
    mtm21: last(technicalindicators.MTM.calculate({ values: close, period: 21 })),
    stochastic: last(technicalindicators.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }))
  };
}

function formatIndicatorOutput(ind) {
  return `
SMA: ${JSON.stringify(ind.sma)}
EMA: ${JSON.stringify(ind.ema)}
WMA: ${JSON.stringify(ind.wma)}
RSI: 5=${ind.rsi5?.toFixed(2)}, 14=${ind.rsi14?.toFixed(2)}
MACD: ${JSON.stringify(ind.macd)}
Stoch RSI: ${JSON.stringify(ind.stochRSI)}
DMI: ${JSON.stringify(ind.dmi)}
MFI: 14=${ind.mfi14?.toFixed(2)}, 21=${ind.mfi21?.toFixed(2)}
BB: ${JSON.stringify(ind.bb)}
VWAP: 1=${ind.vwap1?.toFixed(2)}, 5=${ind.vwap5?.toFixed(2)}
TRIX: ${ind.trix?.toFixed(2)}
ATR: ${ind.atr?.toFixed(2)}
OBV: ${ind.obv}
SAR: ${ind.sar}
Williams %R: ${ind.williamsR?.toFixed(2)}
CCI: 7=${ind.cci7?.toFixed(2)}, 10=${ind.cci10?.toFixed(2)}, 20=${ind.cci20?.toFixed(2)}
MTM: 7=${ind.mtm7?.toFixed(2)}, 14=${ind.mtm14?.toFixed(2)}, 21=${ind.mtm21?.toFixed(2)}
Stochastic: ${JSON.stringify(ind.stochastic)}
  `;
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();
  if (!symbolsMap[text]) return;

  try {
    const { symbol, interval, name } = symbolsMap[text];
    const candles = await fetchCandles(symbol, interval);
    const indicators = calculateIndicators(candles);
    const responseText = `${name} ${interval.toUpperCase()} Indicators:\n${formatIndicatorOutput(indicators)}`;
    bot.sendMessage(chatId, responseText);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, 'Error fetching data.');
  }
});

app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
