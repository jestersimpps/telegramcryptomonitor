import TelegramBot from "node-telegram-bot-api";
import schedule from "node-schedule";
import dotenv from "dotenv";
import { storageService } from "./services/storage";
import { cryptoService } from "./services/crypto";

// Types and Interfaces
interface PiCycleData {
 sma111: number;
 sma350x2: number;
 distance: number;
 daysToTop?: number;
}

interface CryptoPrice {
 id: string;
 symbol: string;
 current_price: number;
 price_change_percentage_24h?: number;
 piCycle?: PiCycleData;
}

// Constants
const CACHE_DURATION = 60 * 1000; // 1 minute
const RATE_LIMIT = 500; // 5 m seconds

// Environment setup
dotenv.config();

function validateEnvironment() {
 const requiredEnvVars = ["TELEGRAM_BOT_TOKEN"] as const;
 const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

 if (missingVars.length > 0) {
  throw new Error(
   `Missing required environment variables: ${missingVars.join(", ")}`
  );
 }
}

validateEnvironment();

const token = process.env.TELEGRAM_BOT_TOKEN!;

// Cache and Rate Limiting
const priceCache = new Map<string, { data: CryptoPrice; timestamp: number }>();
const rateLimiter = new Map<number, number>();
const userJobs = new Map<number, schedule.Job>();

// Logger
const logger = {
 error: (message: string, error?: any) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error || "");
 },
 info: (message: string, data?: any) => {
  console.log(`[${new Date().toISOString()}] INFO: ${message}`, data || "");
 },
};

// Helper Functions
function formatPrice(price: number): string {
 if (price < 0.01) return price.toFixed(8);
 if (price < 1) return price.toFixed(4);
 return price.toFixed(2);
}

function isRateLimited(chatId: number): boolean {
 const lastRequest = rateLimiter.get(chatId) || 0;
 const now = Date.now();

 if (now - lastRequest < RATE_LIMIT) {
  return true;
 }

 rateLimiter.set(chatId, now);
 return false;
}

async function getPricesWithCache(tickerIds: string[]): Promise<CryptoPrice[]> {
 try {
  const now = Date.now();
  const uncachedTickers = tickerIds.filter((id) => {
   const cached = priceCache.get(id);
   return !cached || now - cached.timestamp > CACHE_DURATION;
  });

  if (uncachedTickers.length > 0) {
   const newPrices = await cryptoService.getPrices(uncachedTickers);
   newPrices.forEach((price) => {
    priceCache.set(price.id, { data: price, timestamp: now });
   });
  }

  return tickerIds
   .map((id) => priceCache.get(id)?.data)
   .filter(Boolean) as CryptoPrice[];
 } catch (error) {
  logger.error("Error fetching prices with cache:", error);
  throw error;
 }
}

// Bot Setup
const bot = new TelegramBot(token, { polling: true });

const mainKeyboard = {
 reply_markup: {
  keyboard: [
   [{ text: "📊 Get Prices" }],
   [{ text: "📈 Pi Cycle" }],
   [{ text: "❓ Help" }],
  ],
  resize_keyboard: true,
 },
};

// Command Handlers
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

// Message Handler
bot.on("message", async (msg) => {
 try {
  const chatId = msg.chat.id;

  if (isRateLimited(chatId)) {
   bot.sendMessage(chatId, "Please wait a few seconds before trying again.");
   return;
  }

  switch (msg.text) {
   case "📈 Pi Cycle": {
    const prices = await getPricesWithCache(["bitcoin"]);

    if (prices.length === 0 || !prices[0].piCycle) {
     bot.sendMessage(
      chatId,
      "Unable to fetch Bitcoin Pi Cycle data at the moment."
     );
     return;
    }

    const btc = prices[0];

    if (btc.piCycle) {
     const { sma111, sma350x2, distance } = btc.piCycle;

     const message =
      `Bitcoin Pi Cycle Top Indicator:\n\n` +
      `Current Price: $${formatPrice(btc.current_price)}\n` +
      `111 SMA: $${formatPrice(sma111)}\n` +
      `350 SMA × 2: $${formatPrice(sma350x2)}\n` +
      `Distance: ${distance.toFixed(2)}%\n` +
      `${
       btc?.piCycle?.daysToTop
        ? `Estimated Days to Top: ${btc.piCycle.daysToTop} days\n`
        : ""
      }` +
      `\nWhen the 111 SMA crosses above the 350 SMA × 2,\n` +
      `it historically indicates a market top.`;

     bot.sendMessage(chatId, message);
    }
    break;
   }

   case "📊 Get Prices": {
    const userData = storageService.getUser(chatId);
    if (!userData || userData.tickers.size === 0) {
     bot.sendMessage(chatId, "You have no tickers in your monitoring list.");
     return;
    }
    await sendTokenList(chatId, userData.tickers);
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
      "/removetime - Remove daily update timer\n\n" +
      "Indicators:\n" +
      "/picycle - Show Bitcoin Pi Cycle Top indicator"
    );
    break;
   }
  }
 } catch (error) {
  logger.error("Error in message handler:", error);
  bot.sendMessage(msg.chat.id, "An error occurred. Please try again later.");
 }
});

// Portfolio Management Commands
bot.onText(/\/add (.+)/, (msg, match) => {
 try {
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
 } catch (error) {
  logger.error("Error in add command:", error);
  bot.sendMessage(msg.chat.id, "An error occurred while adding the ticker.");
 }
});

// Remove ticker command
bot.onText(/\/remove (.+)/, (msg, match) => {
 try {
  if (!match) return;
  const chatId = msg.chat.id;
  const ticker = match[1].trim();
  storageService.removeTicker(chatId, ticker);
  bot.sendMessage(
   chatId,
   `Removed ${ticker.toUpperCase()} from your monitoring list.`
  );
 } catch (error) {
  logger.error("Error in remove command:", error);
  bot.sendMessage(msg.chat.id, "An error occurred while removing the ticker.");
 }
});

// List command
bot.onText(/\/list/, async (msg) => {
 try {
  const chatId = msg.chat.id;

  if (isRateLimited(chatId)) {
   bot.sendMessage(chatId, "Please wait a few seconds before trying again.");
   return;
  }

  const userData = storageService.getUser(chatId);
  if (!userData || userData.tickers.size === 0) {
   bot.sendMessage(chatId, "You have no tickers in your monitoring list.");
   return;
  }

  await sendTokenList(chatId, userData.tickers);
 } catch (error) {
  logger.error("Error in list command:", error);
  bot.sendMessage(msg.chat.id, "An error occurred while fetching your list.");
 }
});

// Token list sending function
async function sendTokenList(chatId: number, tickers: Map<string, number>) {
 try {
  const tickerIds = Array.from(tickers.keys());
  const prices = await getPricesWithCache(tickerIds);

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

  const message = `Your monitored tokens:\n${tokenList}\n\nTotal Portfolio Value: $${formatPrice(
   totalValue
  )}`;
  bot.sendMessage(chatId, message);
 } catch (error) {
  logger.error("Error sending token list:", error);
  throw error;
 }
}

// Price update function
async function sendPriceUpdate(chatId: number, tickers: Map<string, number>) {
 try {
  const tickerIds = Array.from(tickers.keys());
  const prices = await getPricesWithCache(tickerIds);

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
    price.price_change_percentage_24h !== undefined
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
  )}\n\nTotal Portfolio Value: $${formatPrice(totalValue)}`;
  bot.sendMessage(chatId, message);
 } catch (error) {
  logger.error("Error sending price update:", error);
  throw error;
 }
}

// Time setting handlers
function removeUserSchedule(chatId: number) {
 const job = userJobs.get(chatId);
 if (job) {
  job.cancel();
  userJobs.delete(chatId);
 }
}

bot.onText(/\/settime (.+)/, (msg, match) => {
 try {
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

  // Remove existing schedule if any
  removeUserSchedule(chatId);

  // Create new schedule
  const [hours, minutes] = timeStr.split(":").map(Number);
  const job = schedule.scheduleJob(`${minutes} ${hours} * * *`, async () => {
   const userData = storageService.getUser(chatId);
   if (userData && userData.tickers.size > 0) {
    await sendPriceUpdate(chatId, userData.tickers);
   }
  });

  userJobs.set(chatId, job);
  storageService.setUpdateTime(chatId, timeStr);
  bot.sendMessage(chatId, `Daily update time set to ${timeStr}`);
 } catch (error) {
  logger.error("Error setting update time:", error);
  bot.sendMessage(
   msg.chat.id,
   "An error occurred while setting the update time."
  );
 }
});

bot.onText(/\/removetime/, (msg) => {
 try {
  const chatId = msg.chat.id;
  removeUserSchedule(chatId);
  storageService.removeUpdateTime(chatId);
  bot.sendMessage(chatId, "Daily update timer removed");
 } catch (error) {
  logger.error("Error removing update time:", error);
  bot.sendMessage(
   msg.chat.id,
   "An error occurred while removing the update timer."
  );
 }
});

// Pi Cycle command
bot.onText(/\/picycle/, async (msg) => {
 try {
  const chatId = msg.chat.id;

  // if (isRateLimited(chatId)) {
  //  bot.sendMessage(chatId, "Please wait a few seconds before trying again.");
  //  return;
  // }

  const prices = await getPricesWithCache(["bitcoin"]);

  if (prices.length === 0 || !prices[0].piCycle) {
   bot.sendMessage(
    chatId,
    "Unable to fetch Bitcoin Pi Cycle data at the moment."
   );
   return;
  }

  const btc = prices[0];

  if (btc.piCycle) {
   const { sma111, sma350x2, distance } = btc.piCycle;

   const message =
    `Bitcoin Pi Cycle Top Indicator:\n\n` +
    `Current Price: $${formatPrice(btc.current_price)}\n` +
    `111 SMA: $${formatPrice(sma111)}\n` +
    `350 SMA × 2: $${formatPrice(sma350x2)}\n` +
    `Distance: ${distance.toFixed(2)}%\n` +
    `${
     btc?.piCycle?.daysToTop
      ? `Estimated Days to Top: ${btc?.piCycle?.daysToTop} days\n`
      : ""
    }` +
    `\nWhen the 111 SMA crosses above the 350 SMA × 2,\n` +
    `it historically indicates a market top.`;

   bot.sendMessage(chatId, message);
  }
 } catch (error) {
  logger.error("Error fetching Pi Cycle data:", error);
  bot.sendMessage(
   msg.chat.id,
   "An error occurred while fetching Pi Cycle data."
  );
 }
});

// Error handling for the bot
bot.on("polling_error", (error) => {
 logger.error("Polling error:", error);
});

bot.on("error", (error) => {
 logger.error("Bot error:", error);
});

// Cleanup on process exit
process.on("SIGINT", () => {
 logger.info("Cleaning up...");
 Array.from(userJobs.values()).forEach((job) => job.cancel());
 process.exit(0);
});

logger.info("Bot started successfully");
