import TelegramBot from "node-telegram-bot-api";
import schedule from "node-schedule";
import dotenv from "dotenv";
import { storageService } from "./services/storage";
import { cryptoService } from "./services/crypto";
import { KeyboardButton } from "node-telegram-bot-api";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
 throw new Error("TELEGRAM_BOT_TOKEN must be provided!");
}

// Helper function to format prices with appropriate decimal places
function formatPrice(price: number): string {
 if (price < 0.01) {
  return price.toFixed(8);
 } else if (price < 1) {
  return price.toFixed(4);
 } else {
  return price.toFixed(2);
 }
}

const bot = new TelegramBot(token, { polling: true });

// Command handlers
// Keyboard setup
const mainKeyboard = {
 reply_markup: {
  keyboard: [
    [{ text: "📊 Get Prices" }],
    [{ text: "📈 Pi Cycle" }],
    [{ text: "❓ Help" }]
  ],
  resize_keyboard: true,
 },
};

bot.onText(/\/start/, (msg) => {
 const chatId = msg.chat.id;
 bot.sendMessage(
  chatId,
  "Welcome to CryptoMonitor Bot!🚀\n\n" +
   "Use the buttons below or type /help to see all available commands.\n\n" +
   "📊 Get Prices - View current prices and portfolio value\n" +
   "📈 Pi Cycle - Check Bitcoin Pi Cycle Top indicator\n" +
   "❓ Help - Show all commands",
  mainKeyboard
 );
});

bot.onText(/\/help/, (msg) => {
 const chatId = msg.chat.id;
 bot.sendMessage(
  chatId,
  "Available Commands:\n\n" +
   "📊 Get Prices - View current prices and portfolio value\n\n" +
   "Crypto Commands:\n" +
   "/add <amount> <ticker> - Add crypto to portfolio\n" +
   "/remove <ticker> - Remove crypto from portfolio\n" +
   "/list - List all your crypto holdings\n\n" +
   "Update Timer:\n" +
   "/settime HH:mm - Set daily update time (24h format)\n" +
   "/removetime - Remove daily update timer\n\n" +
   "Indicators:\n" +
   "/picycle - Show Bitcoin Pi Cycle Top indicator"
 );
});

// Handle button clicks
bot.on("message", async (msg) => {
 const chatId = msg.chat.id;

 switch (msg.text) {
  case "📈 Pi Cycle": {
   const prices = await cryptoService.getPrices(["bitcoin"]);

   if (prices.length === 0 || !prices[0].piCycle) {
    bot.sendMessage(chatId, "Unable to fetch Bitcoin Pi Cycle data at the moment.");
    return;
   }

   const btc = prices[0];
   if (!btc.piCycle) {
    bot.sendMessage(chatId, "Unable to calculate Pi Cycle indicators at the moment.");
    return;
   }

   const { sma111, sma350x2, distance } = btc.piCycle;

   const message =
    `Bitcoin Pi Cycle Top Indicator:\n\n` +
    `Current Price: $${formatPrice(btc.current_price)}\n` +
    `111 SMA: $${formatPrice(sma111)}\n` +
    `350 SMA × 2: $${formatPrice(sma350x2)}\n` +
    `Distance: ${distance.toFixed(2)}%\n` +
    `${btc.piCycle.daysToTop ? `Estimated Days to Top: ${btc.piCycle.daysToTop} days\n` : ""}` +
    `\nWhen the 111 SMA crosses above the 350 SMA × 2,\n` +
    `it historically indicates a market top.`;

   bot.sendMessage(chatId, message);
   break;
  }
  case "📊 Get Prices": {
   const userData = storageService.getUser(chatId);
   if (!userData || userData.tickers.size === 0) {
    bot.sendMessage(chatId, "You have no tickers in your monitoring list.");
    return;
   }
   sendTokenList(chatId, userData.tickers);
   break;
  }
  case "❓ Help": {
   bot.sendMessage(
    chatId,
    "Available Commands:\n\n" +
     "📊 Get Prices - View current prices and portfolio value\n\n" +
     "Crypto Commands:\n" +
     "/add <amount> <ticker> - Add crypto to portfolio\n" +
     "/remove <ticker> - Remove crypto from portfolio\n" +
     "/list - List all your crypto holdings\n\n" +
     "Update Timer:\n" +
     "/settime HH:mm - Set daily update time (24h format)\n" +
     "/removetime - Remove daily update timer" +
     "Indicators:\n" +
     "/picycle - Show Bitcoin Pi Cycle Top indicator"
   );
   break;
  }
 }
});

bot.onText(/\/add (.+)/, (msg, match) => {
 if (!match) return;
 const chatId = msg.chat.id;
 const parts = match[1].trim().split(" ");
 if (parts.length !== 2) {
  bot.sendMessage(
   chatId,
   "Usage: /add <amount> <ticker>\nExample: /add 0.5 btc"
  );
  return;
 }
 const [amountStr, ticker] = parts;
 const amount = parseFloat(amountStr);
 if (isNaN(amount) || amount <= 0) {
  bot.sendMessage(chatId, "Please provide a valid positive number for amount");
  return;
 }
 storageService.addTicker(chatId, ticker, amount);
 bot.sendMessage(
  chatId,
  `Added ${amount} ${ticker.toUpperCase()} to your monitoring list.`
 );
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
  bot.sendMessage(chatId, "You have no tickers in your monitoring list.");
  return;
 }
 await sendTokenList(chatId, userData.tickers);
});

// Function to send token list with prices
async function sendTokenList(chatId: number, tickers: Map<string, number>) {
 const tickerIds = Array.from(tickers.keys());
 const prices = await cryptoService.getPrices(tickerIds);
 if (prices.length === 0) {
  bot.sendMessage(chatId, "Unable to fetch prices at the moment.");
  return;
 }

 let totalValue = 0;
 const tokenList = prices
  .map((price) => {
   const amount = tickers.get(price.id) || 0;
   const value = amount * price.current_price;
   totalValue += value;
   return `${price.symbol.toUpperCase()}: ${amount} @ $${formatPrice(
    price.current_price
   )} = $${formatPrice(value)}`;
  })
  .join("\n");

 const message = `Your monitored tokens:\n${tokenList}\n\nTotal Portfolio Value: $${totalValue.toFixed(
  2
 )}`;
 bot.sendMessage(chatId, message);
}

// Function to send price updates
async function sendPriceUpdate(chatId: number, tickers: Map<string, number>) {
 const tickerIds = Array.from(tickers.keys());
 const prices = await cryptoService.getPrices(tickerIds);
 if (prices.length === 0) {
  bot.sendMessage(chatId, "Unable to fetch prices at the moment.");
  return;
 }

 let totalValue = 0;
 const priceMessages = prices.map((price) => {
  const amount = tickers.get(price.id) || 0;
  const value = amount * price.current_price;
  totalValue += value;
  const priceChange =
   price.price_change_percentage_24h !== undefined &&
   price.price_change_percentage_24h !== null
    ? ` (${price.price_change_percentage_24h.toFixed(2)}% 24h)`
    : "";

  let message = `${price.symbol.toUpperCase()} (${amount}):\n$${formatPrice(
   price.current_price
  )}${priceChange}\nValue: $${formatPrice(value)}`;

  // Add Pi Cycle indicator for Bitcoin
  if (price.id === "bitcoin" && price.piCycle) {
   const { sma111, sma350x2, distance } = price.piCycle;
   message += `\nPi Cycle:\nSMA111: $${formatPrice(
    sma111
   )}\nSMA350*2: $${formatPrice(sma350x2)}\nDistance: ${distance.toFixed(2)}%`;
  }

  return message;
 });

 const message = `Current Portfolio:\n\n${priceMessages.join(
  "\n\n"
 )}\n\nTotal Portfolio Value: $${totalValue.toFixed(2)}`;
 bot.sendMessage(chatId, message);
}

// Handle update time setting
bot.onText(/\/settime (.+)/, (msg, match) => {
 if (!match) return;
 const chatId = msg.chat.id;
 const timeStr = match[1].trim();

 // Validate time format (HH:mm)
 const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
 if (!timeRegex.test(timeStr)) {
  bot.sendMessage(
   chatId,
   "Please provide time in 24-hour format (HH:mm)\nExample: /settime 08:30"
  );
  return;
 }

 storageService.setUpdateTime(chatId, timeStr);
 bot.sendMessage(chatId, `Daily update time set to ${timeStr}`);
});

bot.onText(/\/removetime/, (msg) => {
 const chatId = msg.chat.id;
 storageService.removeUpdateTime(chatId);
 bot.sendMessage(chatId, "Daily update timer removed");
});

// Schedule updates for each user based on their preferred time
schedule.scheduleJob("* * * * *", async () => {
 const users = storageService.getAllUsers();
 const now = new Date();
 const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
  .getMinutes()
  .toString()
  .padStart(2, "0")}`;

 for (const user of users) {
  if (user.updateTime === currentTime && user.tickers.size > 0) {
   await sendPriceUpdate(user.chatId, user.tickers);
  }
 }
});

// Handle Pi Cycle command
bot.onText(/\/picycle/, async (msg) => {
 const chatId = msg.chat.id;
 const prices = await cryptoService.getPrices(["bitcoin"]);

 if (prices.length === 0 || !prices[0].piCycle) {
  bot.sendMessage(
   chatId,
   "Unable to fetch Bitcoin Pi Cycle data at the moment."
  );
  return;
 }

 const btc = prices[0];
 if (!btc.piCycle) {
  bot.sendMessage(
   chatId,
   "Unable to calculate Pi Cycle indicators at the moment."
  );
  return;
 }

 const { sma111, sma350x2, distance } = btc.piCycle;

 const message =
  `Bitcoin Pi Cycle Top Indicator:\n\n` +
  `Current Price: $${formatPrice(btc.current_price)}\n` +
  `111 SMA: $${formatPrice(sma111)}\n` +
  `350 SMA × 2: $${formatPrice(sma350x2)}\n` +
  `Distance: ${distance.toFixed(2)}%\n` +
  `${
   btc.piCycle.daysToTop
    ? `Estimated Days to Top: ${btc.piCycle.daysToTop} days\n`
    : ""
  }` +
  `\nWhen the 111 SMA crosses above the 350 SMA × 2,\n` +
  `it historically indicates a market top.`;

 bot.sendMessage(chatId, message);
});

console.log("Bot is running...");
