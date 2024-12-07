import TelegramBot from 'node-telegram-bot-api';
import schedule from 'node-schedule';
import dotenv from 'dotenv';
import { storageService } from './services/storage';
import { cryptoService } from './services/crypto';
import { KeyboardButton } from 'node-telegram-bot-api';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be provided!');
}

const bot = new TelegramBot(token, { polling: true });

// Command handlers
// Keyboard setup
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📊 Get Prices' }, { text: '📋 List Tokens' }]
    ],
    resize_keyboard: true
  }
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId, 
    'Welcome to CryptoMonitor Bot! 🚀\n\nUse the buttons below to manage your crypto portfolio:\n\n' +
    '📊 Get Prices - View current prices and portfolio value\n' +
    '📋 List Tokens - See your monitored tokens\n\n' +
    'Commands:\n' +
    '/add <amount> <ticker> - Add new token\n' +
    '/remove <ticker> - Remove token',
    mainKeyboard
  );
});

// Handle button clicks
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  
  switch (msg.text) {
    case '📊 Get Prices': {
      const userData = storageService.getUser(chatId);
      if (!userData || userData.tickers.size === 0) {
        bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
        return;
      }
      sendPriceUpdate(chatId, userData.tickers);
      break;
    }
    case '📋 List Tokens': {
      const userData = storageService.getUser(chatId);
      if (!userData || userData.tickers.size === 0) {
        bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
        return;
      }
      const tickerList = Array.from(userData.tickers.entries())
        .map(([ticker, amount]) => `${ticker.toUpperCase()}: ${amount}`)
        .join('\n');
      bot.sendMessage(chatId, `Your monitored tickers:\n${tickerList}`);
      break;
    }
  }
});

bot.onText(/\/add (.+)/, (msg, match) => {
  if (!match) return;
  const chatId = msg.chat.id;
  const parts = match[1].trim().split(' ');
  if (parts.length !== 2) {
    bot.sendMessage(chatId, 'Usage: /add <amount> <ticker>\nExample: /add 0.5 btc');
    return;
  }
  const [amountStr, ticker] = parts;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, 'Please provide a valid positive number for amount');
    return;
  }
  storageService.addTicker(chatId, ticker, amount);
  bot.sendMessage(chatId, `Added ${amount} ${ticker.toUpperCase()} to your monitoring list.`);
});

bot.onText(/\/remove (.+)/, (msg, match) => {
  if (!match) return;
  const chatId = msg.chat.id;
  const ticker = match[1].trim();
  storageService.removeTicker(chatId, ticker);
  bot.sendMessage(chatId, `Removed ${ticker} from your monitoring list.`);
});

bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  const userData = storageService.getUser(chatId);
  if (!userData || userData.tickers.size === 0) {
    bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
    return;
  }
  const tickerList = Array.from(userData.tickers.entries())
    .map(([ticker, amount]) => `${ticker.toUpperCase()}: ${amount}`)
    .join('\n');
  bot.sendMessage(chatId, `Your monitored tickers:\n${tickerList}`);
});

bot.onText(/\/prices/, async (msg) => {
  const chatId = msg.chat.id;
  const userData = storageService.getUser(chatId);
  if (!userData || userData.tickers.size === 0) {
    bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
    return;
  }
  
  await sendPriceUpdate(chatId, userData.tickers);
});

// Function to send price updates
async function sendPriceUpdate(chatId: number, tickers: Map<string, number>) {
  const tickerIds = Array.from(tickers.keys());
  const prices = await cryptoService.getPrices(tickerIds);
  if (prices.length === 0) {
    bot.sendMessage(chatId, 'Unable to fetch prices at the moment.');
    return;
  }

  let totalValue = 0;
  const priceMessages = prices.map(price => {
    const amount = tickers.get(price.id) || 0;
    const value = amount * price.current_price;
    totalValue += value;
    return `${price.symbol.toUpperCase()} (${amount}):\n$${price.current_price.toFixed(2)} (${price.price_change_percentage_24h.toFixed(2)}% 24h)\nValue: $${value.toFixed(2)}`;
  });

  const message = `Current Portfolio:\n\n${priceMessages.join('\n\n')}\n\nTotal Portfolio Value: $${totalValue.toFixed(2)}`;
  bot.sendMessage(chatId, message);
}

// Schedule daily updates at 8:30 AM
schedule.scheduleJob('30 8 * * *', async () => {
  const users = storageService.getAllUsers();
  for (const user of users) {
    if (user.tickers.size > 0) {
      await sendPriceUpdate(user.chatId, user.tickers);
    }
  }
});

console.log('Bot is running...');
