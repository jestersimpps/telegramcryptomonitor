import axios from 'axios';
import { CommodityPrice } from '../types';

class CommoditiesService {
  private readonly baseUrl = 'https://www.goldapi.io/api';
  private readonly apiKey = process.env.GOLDAPI_KEY || '';

  public async getPrices(symbols: string[]): Promise<CommodityPrice[]> {
    try {
      const prices: CommodityPrice[] = [];
      
      for (const symbol of symbols) {
        const response = await axios.get(`${this.baseUrl}/${symbol.toLowerCase()}/usd`, {
          headers: {
            'x-access-token': this.apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        prices.push({
          id: symbol.toLowerCase(),
          symbol: symbol.toUpperCase(),
          current_price: response.data.price,
          price_change_percentage_24h: ((response.data.price - response.data.prev_close_price) / response.data.prev_close_price) * 100
        });
      }
      
      return prices;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Error fetching commodity prices:', {
          status: error.response?.status,
          data: error.response?.data
        });
      } else {
        console.error('Unexpected error:', error);
      }
      return [];
    }
  }
}

export const commoditiesService = new CommoditiesService();
