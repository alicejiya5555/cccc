const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

const TOKEN = '7655482876:AAHsd4CU3uLo1Kb0C7aWa_hgESOFmOQrNw0';
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const PORT = process.env.PORT || 3000;

// Supported pairs and intervals
const supportedPairs = ['eth', 'btc', 'link'];
const supportedTimeframes = ['15m', '1h', '4h', '1d'];

// Map custom timeframes to Binance API intervals
const intervalMap = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

// Helper to get Binance symbol (USDT pairs)
function getBinanceSymbol(pair) {
  return pair.toUpperCase() + 'USDT';
}

// Fetch candlestick data from Binance API
async function fetchCandles(symbol, interval, limit = 200) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await axios.get(url);
  // Map to OHLCV objects
  return res.data.map(c => ({
    openTime: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
    closeTime: c[6]
  }));
}

// Indicator calculations (simplified versions)

// SMA calculation
function calculateSMA(data, period) {
  let sma = [];
  for (let i = 0; i <= data.length - period; i++) {
    const slice = data.slice(i, i + period);
    const sum = slice.reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

// EMA calculation
function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

// RSI calculation
function calculateRSI(data, period) {
  let gains = 0, losses = 0;
  let rsi = [];

  for (let i = 1; i < period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi.slice(period);
}

// MACD calculation (fast=3, slow=10, signal=16)
function calculateMACD(data, fast=3, slow=10, signal=16) {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  let macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + (slow - fast)] - emaSlow[i]);
  }
  const signalLine = calculateEMA(macdLine, signal);
  let histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + (signal - 1)] - signalLine[i]);
  }
  // Return latest values
  return {
    MACD: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1]
  };
}

// Bollinger Bands (20, 2)
function calculateBollinger(data, period=20, stdDevMultiplier=2) {
  let bands = [];
  for (let i = 0; i <= data.length - period; i++) {
    const slice = data.slice(i, i + period);
    const mean = slice.reduce((a,b) => a+b, 0) / period;
    const variance = slice.reduce((a,b) => a + (b - mean)**2, 0) / period;
    const stdDev = Math.sqrt(variance);
    bands.push({
      upper: mean + stdDevMultiplier * stdDev,
      middle: mean,
      lower: mean - stdDevMultiplier * stdDev,
    });
  }
  return bands;
}

// VWAP calculation for simplicity on close prices & volume (window=5)
function calculateVWAP(high, low, close, volume, window=5) {
  let vwap5 = [];
  let vwap1 = [];
  for(let i = 0; i <= close.length - window; i++) {
    let typicalPrices = 0;
    let totalVolume = 0;
    for(let j = i; j < i + window; j++) {
      const tp = (high[j] + low[j] + close[j]) / 3;
      typicalPrices += tp * volume[j];
      totalVolume += volume[j];
    }
    vwap5.push(typicalPrices / totalVolume);
  }
  // For VWAP(1), just typical price of last candle
  for(let i = 0; i < close.length; i++) {
    vwap1.push((high[i] + low[i] + close[i]) / 3);
  }
  return { vwap5, vwap1 };
}

// DMI calculation (simplified for demonstration)
function calculateDMI(high, low, close, period=14) {
  let plusDM = [];
  let minusDM = [];
  let tr = [];
  for (let i = 1; i < high.length; i++) {
    const upMove = high[i] - high[i-1];
    const downMove = low[i-1] - low[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i-1]), Math.abs(low[i] - close[i-1])));
  }

  // Smooth the DM and TR (Wilder's smoothing)
  function smooth(data) {
    let smoothed = [data.slice(0, period).reduce((a,b) => a+b, 0)];
    for(let i = period; i < data.length; i++) {
      smoothed.push(smoothed[smoothed.length-1] - (smoothed[smoothed.length-1]/period) + data[i]);
    }
    return smoothed;
  }

  const smPlusDM = smooth(plusDM);
  const smMinusDM = smooth(minusDM);
  const smTR = smooth(tr);

  let pdi = [];
  let mdi = [];
  let adx = [];
  for (let i = 0; i < smTR.length; i++) {
    pdi.push((smPlusDM[i]/smTR[i]) * 100);
    mdi.push((smMinusDM[i]/smTR[i]) * 100);
    adx.push(100 * Math.abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i]));
  }

  return pdi.map((_, i) => ({
    pdi: pdi[i] || 0,
    mdi: mdi[i] || 0,
    adx: adx[i] || 0,
  })).slice(-period);
}

// ATR calculation
function calculateATR(high, low, close, period=14) {
  let trs = [];
  for(let i=1; i<high.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i-1]),
      Math.abs(low[i] - close[i-1])
    );
    trs.push(tr);
  }
  // Wilder's smoothing for ATR
  let atr = [];
  atr[0] = trs.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for(let i=period; i<trs.length; i++) {
    atr[i - period + 1] = (atr[i - period] * (period - 1) + trs[i]) / period;
  }
  return atr;
}

// Signal color helper
function getSignalColor(signal) {
  if (signal === 'Bullish') return '🟢';
  if (signal === 'Bearish') return '🔴';
  if (signal === 'Neutral') return '🟡';
  return '';
}

// Main handler to analyze and respond to commands like /eth1h
async function handleCommand(msg, match) {
  const chatId = msg.chat.id;
  const input = match[1].toLowerCase(); // e.g. eth1h or btc4h
  let pair = null;
  let timeframe = null;

  // Identify pair and timeframe from input
  for (const p of supportedPairs) {
    if (input.startsWith(p)) {
      pair = p;
      timeframe = input.slice(p.length);
      break;
    }
  }

  if (!pair || !supportedTimeframes.includes(timeframe)) {
    bot.sendMessage(chatId, `Sorry, I support only these commands: ${supportedPairs.map(p => supportedTimeframes.map(tf => `/${p}${tf}`).join(', ')).join(', ')}`);
    return;
  }

  bot.sendMessage(chatId, `Fetching data for ${pair.toUpperCase()} on ${timeframe}...`);

  try {
    const symbol = getBinanceSymbol(pair);
    const interval = intervalMap[timeframe];
    const candles = await fetchCandles(symbol, interval, 200);

    const closePrices = candles.map(c => c.close);
    const highPrices = candles.map(c => c.high);
    const lowPrices = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // Calculate indicators
    const sma50 = calculateSMA(closePrices, 50);
    const sma21 = calculateSMA(closePrices, 21);
    const sma8 = calculateSMA(closePrices, 8);
    const ema50 = calculateEMA(closePrices, 50);
    const ema21 = calculateEMA(closePrices, 21);
    const ema8 = calculateEMA(closePrices, 8);
    const rsi14 = calculateRSI(closePrices, 14);
    const macd = calculateMACD(closePrices, 3, 10, 16);
    const bollinger = calculateBollinger(closePrices, 20, 2);
    const vwap = calculateVWAP(highPrices, lowPrices, closePrices, volumes, 5);
    const dmi = calculateDMI(highPrices, lowPrices, closePrices, 14);
    const atr = calculateATR(highPrices, lowPrices, closePrices, 14);

    // Latest values
    const latestClose = closePrices[closePrices.length - 1];
    const latestRSI = rsi14[rsi14.length - 1].toFixed(2);
    const latestMACD = macd.MACD.toFixed(4);
    const latestSignal = macd.signal.toFixed(4);
    const latestHistogram = macd.histogram.toFixed(4);
    const latestBB = bollinger[bollinger.length - 1];
    const latestVWAP5 = vwap.vwap5[vwap.vwap5.length - 1];
    const latestDMI = dmi[dmi.length - 1];
    const latestATR = atr[atr.length - 1].toFixed(5);

    // Determine signals (simplified logic)
    const rsiSignal = latestRSI > 70 ? 'Bearish' : (latestRSI < 30 ? 'Bullish' : 'Neutral');
    const macdSignal = latestMACD > latestSignal ? 'Bullish' : (latestMACD < latestSignal ? 'Bearish' : 'Neutral');
    const priceVsVWAPSignal = latestClose > latestVWAP5 ? 'Bullish' : 'Bearish';
    const dmiSignal = (latestDMI.adx > 25) && (latestDMI.pdi > latestDMI.mdi) ? 'Bullish' : ((latestDMI.adx > 25 && latestDMI.pdi < latestDMI.mdi) ? 'Bearish' : 'Neutral');

    // Compose message
    let message = `<b>${pair.toUpperCase()} / ${timeframe.toUpperCase()} Technical Analysis</b>\n\n`;
    message += `Close Price: $${latestClose.toFixed(4)}\n`;
    message += `RSI(14): ${latestRSI} ${getSignalColor(rsiSignal)} (${rsiSignal})\n`;
    message += `MACD: ${latestMACD} Signal: ${latestSignal} Histogram: ${latestHistogram} ${getSignalColor(macdSignal)} (${macdSignal})\n`;
    message += `VWAP(5): ${latestVWAP5.toFixed(4)} Price vs VWAP: ${getSignalColor(priceVsVWAPSignal)} (${priceVsVWAPSignal})\n`;
    message += `DMI: ADX=${latestDMI.adx.toFixed(2)} PDI=${latestDMI.pdi.toFixed(2)} MDI=${latestDMI.mdi.toFixed(2)} Signal: ${getSignalColor(dmiSignal)} (${dmiSignal})\n`;
    message += `ATR(14): ${latestATR}\n`;
    message += `Bollinger Bands:\n  Upper: ${latestBB.upper.toFixed(4)}\n  Middle: ${latestBB.middle.toFixed(4)}\n  Lower: ${latestBB.lower.toFixed(4)}\n\n`;
    message += `<i>Note: Signals are simplified and for informational purposes only.</i>`;

    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    bot.sendMessage(chatId, `Error fetching or processing data: ${error.message}`);
  }
}

// Listen to commands like /eth1h or /btc4h
bot.onText(/\/([a-z]+[0-9]+[mh])/i, handleCommand);

// Simple express app to keep alive
app.get('/', (req, res) => {
  res.send('Telegram Bot is running...');
});

app.listen(PORT, () => {
  console.log(`Bot server is listening on port ${PORT}`);
});
