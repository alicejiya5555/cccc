// bot.js
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const technicalIndicators = require("technicalindicators");

const app = express();
const PORT = 3000;
const TELEGRAM_BOT_TOKEN = "7726468556:AAGGs7tVZekeVBcHJQYz4PPh5esQp3qkcjk";
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const BINANCE_BASE_URL = "https://api.binance.com/api/v3";

// Utility: Fetch klines
async function getKlines(symbol, interval, limit = 100) {
  const { data } = await axios.get(`${BINANCE_BASE_URL}/klines`, {
    params: { symbol, interval, limit },
  });
  return data.map(k => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// Indicator Calculations (simplified and can be extended further)
function calculateIndicators(data) {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  const ema = technicalIndicators.EMA.calculate({ period: 8, values: closes });
  const sma = technicalIndicators.SMA.calculate({ period: 8, values: closes });
  const rsi5 = technicalIndicators.RSI.calculate({ period: 5, values: closes });
  const rsi14 = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const macd = technicalIndicators.MACD.calculate({ fastPeriod: 3, slowPeriod: 10, signalPeriod: 16, values: closes });
  const stochrsi = technicalIndicators.StochasticRSI.calculate({ rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3, values: closes });
  const bb = technicalIndicators.BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const dmi = technicalIndicators.ADX.calculate({ period: 14, close: closes, high: highs, low: lows });
  const wma = technicalIndicators.WMA.calculate({ period: 21, values: closes });
  const obv = technicalIndicators.OBV.calculate({ close: closes, volume: volumes });
  const trix = technicalIndicators.TRIX.calculate({ period: 9, values: closes });
  const sar = technicalIndicators.SAR.calculate({ step: 0.02, max: 0.2, high: highs, low: lows });
  const williamsR = technicalIndicators.WilliamsR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const cci = technicalIndicators.CCI.calculate({ period: 20, high: highs, low: lows, close: closes });
  const atr = technicalIndicators.ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const mfi = technicalIndicators.MFI.calculate({ period: 14, high: highs, low: lows, close: closes, volume: volumes });
  const adx = technicalIndicators.ADX.calculate({ period: 14, close: closes, high: highs, low: lows });
  const roc = technicalIndicators.ROC.calculate({ period: 12, values: closes });

  return {
    ema8: ema.at(-1),
    sma8: sma.at(-1),
    rsi5: rsi5.at(-1),
    rsi14: rsi14.at(-1),
    macd: macd.at(-1),
    stochrsi: stochrsi.at(-1),
    bb: bb.at(-1),
    dmi: dmi.at(-1),
    wma: wma.at(-1),
    obv: obv.at(-1),
    trix: trix.at(-1),
    sar: sar.at(-1),
    williamsR: williamsR.at(-1),
    cci: cci.at(-1),
    atr: atr.at(-1),
    mfi: mfi.at(-1),
    adx: adx.at(-1),
    roc: roc.at(-1),
  };
}

// Respond to trading commands
bot.onText(/\/(eth|btc|link)(1h|4h)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [_, coin, interval] = match;
  const symbol = coin.toUpperCase() + "USDT";

  try {
    const klines = await getKlines(symbol, interval);
    const indicators = calculateIndicators(klines);

    let response = `📊 *${symbol} ${interval} Indicators*\n`;
    response += `EMA(8): ${indicators.ema8}\n`;
    response += `SMA(8): ${indicators.sma8}\n`;
    response += `RSI(5): ${indicators.rsi5}, RSI(14): ${indicators.rsi14}\n`;
    response += `MACD: ${JSON.stringify(indicators.macd)}\n`;
    response += `StochRSI: ${JSON.stringify(indicators.stochrsi)}\n`;
    response += `Bollinger Bands: ${JSON.stringify(indicators.bb)}\n`;
    response += `DMI/ADX: ${JSON.stringify(indicators.dmi)}\n`;
    response += `WMA(21): ${indicators.wma}\n`;
    response += `OBV: ${indicators.obv}\n`;
    response += `TRIX(9): ${indicators.trix}\n`;
    response += `SAR: ${indicators.sar}\n`;
    response += `Williams %R: ${indicators.williamsR}\n`;
    response += `CCI: ${indicators.cci}\n`;
    response += `ATR: ${indicators.atr}\n`;
    response += `MFI(14): ${indicators.mfi}\n`;
    response += `ADX: ${indicators.adx}\n`;
    response += `ROC: ${indicators.roc}\n`;

    bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `❌ Error fetching data for ${symbol}`);
  }
});

// Web server for Render
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));
