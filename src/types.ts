export interface UserData {
  chatId: number;
  tickers: Map<string, number>; // ticker -> amount mapping
  updateTime?: string; // Store time in "HH:mm" format
}

export interface CryptoPrice {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h?: number;
  piCycle?: {
    sma111: number;
    sma350x2: number;
    distance: number;
    daysToTop?: number;
  };
}

export interface PriceVolume {
  id: string;
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

export interface AnomalyAlert {
  type: 'price' | 'volume';
  coin: string;
  change: number;
  period: '1h' | '24h';
  currentValue: number;
  previousValue: number;
}
