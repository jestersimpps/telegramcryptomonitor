export interface UserData {
  chatId: number;
  tickers: Map<string, number>; // ticker -> amount mapping
  commodities: Map<string, number>; // commodity -> amount mapping
}

export interface CryptoPrice {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export interface CommodityPrice {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
}
