import axios from 'axios';
import { CryptoPrice } from '../types';

class CryptoService {
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  public async getPrices(tickers: string[]): Promise<CryptoPrice[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/simple/price`, {
        params: {
          ids: tickers.join(','),
          vs_currencies: 'usd',
          include_24hr_change: true
        }
      });
      
      return Object.entries(response.data).map(([id, data]: [string, any]) => ({
        id,
        symbol: id,
        current_price: data.usd,
        price_change_percentage_24h: data.usd_24h_change
      }));
    } catch (error) {
      console.error('Error fetching crypto prices:', error);
      return [];
    }
  }
}

export const cryptoService = new CryptoService();
