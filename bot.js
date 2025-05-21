const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');
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

// Helper: fetch OHLCV candles from Binance
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

// Helper: fetch 24hr price stats (last price, 24h high/low, volume, etc)
async function fetch24hTicker(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const response = await axios.get(url);
  return response.data;
}

// Your VWAP calculation (unchanged)
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

// Calculate all indicators including your 10 new ones
function calculateIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);

  const last = arr => (arr.length ? arr[arr.length - 1] : null);

  // Existing indicators (as in your original code)
  const sma = p => ti.SMA.calculate({ period: p, values: close });
  const ema = p => ti.EMA.calculate({ period: p, values: close });
  const wma = p => ti.WMA.calculate({ period: p, values: close });

  // New Indicators:
  // Ultimate Oscillator (UO)
  const uo = ti.UltimateOscillator.calculate({ 
    high, low, close, 
    period1: 7, period2: 14, period3: 28 
  });

  // Chande Momentum Oscillator (CMO)
  const cmo = ti.CMO.calculate({ period: 14, values: close });

  // Know Sure Thing (KST)
  const kst = ti.KST.calculate({
    values: close,
    ROCPer1: 10, ROCPer2: 15, ROCPer3: 20, ROCPer4: 30,
    SMAROCPer1: 10, SMAROCPer2: 10, SMAROCPer3: 10, SMAROCPer4: 15,
    signalPeriod: 9
  });

  // Ease of Movement (EMV)
  const emv = ti.EaseOfMovement.calculate({ high, low, volume, period: 14 });

  // Detrended Price Oscillator (DPO)
  const dpo = ti.DPO.calculate({ values: close, period: 20 });

  // Rate of Change (ROC)
  const roc = ti.ROC.calculate({ values: close, period: 9 });

  // Donchian Channels
  const donchian = ti.DonchianChannel.calculate({ high, low, period: 20 });

  // Aroon
  const aroon = ti.Aroon.calculate({ high, low, period: 25 });

  // Mass Index
  const massIndex = ti.MassIndex.calculate({ high, low, period: 25 });

  // Chaikin Oscillator
  const chaikinOsc = ti.ChaikinOscillator.calculate({ high, low, close, volume });

  return {
    sma: { 5: last(sma(5)), 13: last(sma(13)), 21: last(sma(21)), 50: last(sma(50)), 100: last(sma(100)), 200: last(sma(200)) },
    ema: { 5: last(ema(5)), 13: last(ema(13)), 21: last(ema(21)), 50: last(ema(50)), 100: last(ema(100)), 200: last(ema(200)) },
    wma: { 5: last(wma(5)), 13: last(wma(13)), 21: last(wma(21)), 50: last(wma(50)), 100: last(wma(100)) },
    // Your existing indicators
    rsi5: last(ti.RSI.calculate({ period: 5, values: close })),
    rsi14: last(ti.RSI.calculate({ period: 14, values: close })),
    macd: last(ti.MACD.calculate({ values: close, fastPeriod: 3, slowPeriod: 10, signalPeriod: 16, SimpleMAOscillator: false, SimpleMASignal: false })),
    stochRSI: last(ti.StochasticRSI.calculate({ values: close, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 })),
    dmi: last(ti.DMI.calculate({ high, low, close, period: 14 })),
    mfi14: last(ti.MFI.calculate({ high, low, close, volume, period: 14 })),
    mfi21: last(ti.MFI.calculate({ high, low, close, volume, period: 21 })),
    bb: last(ti.BollingerBands.calculate({ period: 20, values: close, stdDev: 2 })),
    vwap1: last(calculateVWAP(candles, 1)),
    vwap5: last(calculateVWAP(candles, 5)),
    trix: last(ti.TRIX.calculate({ values: close, period: 9 })),
    atr: last(ti.ATR.calculate({ high, low, close, period: 14 })),
    obv: last(ti.OBV.calculate({ close, volume })),
    sar: last(ti.SAR.calculate({ high, low, step: 0.02, max: 0.2 })),
    williamsR: last(ti.WilliamsR.calculate({ high, low, close, period: 14 })),
    cci7: last(ti.CCI.calculate({ high, low, close, period: 7 })),
    cci10: last(ti.CCI.calculate({ high, low, close, period: 10 })),
    cci20: last(ti.CCI.calculate({ high, low, close, period: 20 })),
    mtm7: last(ti.MTM.calculate({ values: close, period: 7 })),
    mtm14: last(ti.MTM.calculate({ values: close, period: 14 })),
    mtm21: last(ti.MTM.calculate({ values: close, period: 21 })),
    adx: last(ti.ADX.calculate({ high, low, close, period: 14 })),
    // New indicators:
    uo: last(uo),
    cmo: last(cmo),
    kst: last(kst && kst.signal ? kst.signal : null),
    emv: last(emv),
    dpo: last(dpo),
    roc: last(roc),
    donchianUpper: donchian.length ? donchian[donchian.length - 1].upper : null,
    donchianLower: donchian.length ? donchian[donchian.length - 1].lower : null,
    aroonUp: aroon ? last(aroon.up) : null,
    aroonDown: aroon ? last(aroon.down) : null,
    massIndex: last(massIndex),
    chaikinOsc: last(chaikinOsc)
  };
}

function formatNumber(num, decimals = 4) {
  if (num === null || num === undefined) return 'N/A';
  return num.toFixed(decimals);
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase().trim();

  if (!text) return;

  if (!(text in symbolsMap)) {
    return bot.sendMessage(chatId, 'Sorry, I do not recognize that command. Try commands like eth1h, btc4h, link12h etc.');
  }

  const { symbol, interval, name } = symbolsMap[text];

  try {
    const candles = await fetchCandles(symbol, interval, 100);
    const indicators = calculateIndicators(candles);

    const ticker24h = await fetch24hTicker(symbol);

    // Construct reply text
    const reply = `
*${name} / USDT* (${interval} chart)
Price: $${formatNumber(parseFloat(ticker24h.lastPrice), 4)}
24h High / Low: $${formatNumber(parseFloat(ticker24h.highPrice), 4)} / $${formatNumber(parseFloat(ticker24h.lowPrice), 4)}
24h Volume: ${formatNumber(parseFloat(ticker24h.volume), 2)} ${name}

--- Indicators ---
SMA 5: ${formatNumber(indicators.sma[5])} | 13: ${formatNumber(indicators.sma[13])} | 21: ${formatNumber(indicators.sma[21])}
EMA 5: ${formatNumber(indicators.ema[5])} | 13: ${formatNumber(indicators.ema[13])} | 21: ${formatNumber(indicators.ema[21])}
RSI 14: ${formatNumber(indicators.rsi14)}
MACD Signal: ${indicators.macd ? formatNumber(indicators.macd.signal) : 'N/A'}

Ultimate Oscillator (UO): ${formatNumber(indicators.uo)}
Chande Momentum Oscillator (CMO): ${formatNumber(indicators.cmo)}
Know Sure Thing (KST) Signal: ${formatNumber(indicators.kst)}
Ease of Movement (EMV): ${formatNumber(indicators.emv)}
Detrended Price Oscillator (DPO): ${formatNumber(indicators.dpo)}
Rate of Change (ROC): ${formatNumber(indicators.roc)}
Donchian Channel Upper: ${formatNumber(indicators.donchianUpper)}
Donchian Channel Lower: ${formatNumber(indicators.donchianLower)}
Aroon Up: ${formatNumber(indicators.aroonUp)} | Down: ${formatNumber(indicators.aroonDown)}
Mass Index: ${formatNumber(indicators.massIndex)}
Chaikin Oscillator: ${formatNumber(indicators.chaikinOsc)}

VWAP (1): ${formatNumber(indicators.vwap1)} | VWAP (5): ${formatNumber(indicators.vwap5)}

*Data from Binance API*
`;

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, 'Oops! Something went wrong while fetching data.');
  }
});

app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
