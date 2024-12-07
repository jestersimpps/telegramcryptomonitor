export interface UserData {
  chatId: number;
  tickers: Map<string, number>; // ticker -> amount mapping
}

export interface CryptoPrice {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
}
