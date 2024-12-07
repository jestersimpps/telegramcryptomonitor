import TelegramBot from 'node-telegram-bot-api';
import schedule from 'node-schedule';
import dotenv from 'dotenv';
import { storageService } from './services/storage';
import { cryptoService } from './services/crypto';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be provided!');
}

const bot = new TelegramBot(token, { polling: true });

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to CryptoMonitor Bot!\n\nCommands:\n/add <ticker> - Add a crypto ticker to monitor\n/remove <ticker> - Remove a crypto ticker\n/list - List your monitored tickers\n/prices - Get current prices');
});

bot.onText(/\/add (.+)/, (msg, match) => {
  if (!match) return;
  const chatId = msg.chat.id;
  const ticker = match[1].trim();
  storageService.addTicker(chatId, ticker);
  bot.sendMessage(chatId, `Added ${ticker} to your monitoring list.`);
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
  if (!userData || userData.tickers.length === 0) {
    bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
    return;
  }
  bot.sendMessage(chatId, `Your monitored tickers:\n${userData.tickers.join('\n')}`);
});

bot.onText(/\/prices/, async (msg) => {
  const chatId = msg.chat.id;
  const userData = storageService.getUser(chatId);
  if (!userData || userData.tickers.length === 0) {
    bot.sendMessage(chatId, 'You have no tickers in your monitoring list.');
    return;
  }
  
  await sendPriceUpdate(chatId, userData.tickers);
});

// Function to send price updates
async function sendPriceUpdate(chatId: number, tickers: string[]) {
  const prices = await cryptoService.getPrices(tickers);
  if (prices.length === 0) {
    bot.sendMessage(chatId, 'Unable to fetch prices at the moment.');
    return;
  }

  const message = prices.map(price => 
    `${price.symbol.toUpperCase()}: $${price.current_price.toFixed(2)} (${price.price_change_percentage_24h.toFixed(2)}% 24h)`
  ).join('\n');

  bot.sendMessage(chatId, `Current Prices:\n${message}`);
}

// Schedule daily updates at 8:30 AM
schedule.scheduleJob('30 8 * * *', async () => {
  const users = storageService.getAllUsers();
  for (const user of users) {
    if (user.tickers.length > 0) {
      await sendPriceUpdate(user.chatId, user.tickers);
    }
  }
});

console.log('Bot is running...');
