import axios from 'axios';
import { CryptoPrice } from '../types';

const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
  return sum / period;
};

class CryptoService {
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  
  public async getPricesAndVolumes(tickers: string[]): Promise<Array<PriceVolume>> {
    try {
      const response = await axios.get(`${this.baseUrl}/simple/price`, {
        params: {
          ids: tickers.join(','),
          vs_currencies: 'usd',
          include_24hr_vol: true
        }
      });

      return Object.entries(response.data).map(([id, data]: [string, any]) => ({
        id,
        symbol: id,
        price: data.usd,
        volume: data.usd_24h_vol || 0,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error fetching prices and volumes:', error);
      return [];
    }
  }

  public async getPrices(tickers: string[]): Promise<CryptoPrice[]> {
    try {
      const [currentPrices, historicalData] = await Promise.all([
        axios.get(`${this.baseUrl}/simple/price`, {
          params: {
            ids: tickers.join(','),
            vs_currencies: 'usd',
            include_24hr_change: true
          }
        }),
        // Only fetch historical data for Bitcoin
        tickers.includes('bitcoin') ? this.fetchHistoricalData('bitcoin') : Promise.resolve(null)
      ]);
      
      return Object.entries(currentPrices.data).map(([id, data]: [string, any]) => {
        const price: CryptoPrice = {
          id,
          symbol: id,
          current_price: data.usd,
          price_change_percentage_24h: data.usd_24h_change
        };

        // Add Pi Cycle data only for Bitcoin
        if (id === 'bitcoin' && historicalData) {
          const prices = historicalData.prices.map((p: number[]) => p[1]);
          const sma111 = calculateSMA(prices, 111);
          const sma350x2 = calculateSMA(prices, 350) * 2;
          // Calculate days to intersection using linear regression
          const recentPrices = prices.slice(-30); // Use last 30 days for trend
          const sma111Trend = recentPrices.map((_: number, i: number) => {
            return calculateSMA(prices.slice(0, prices.length - 29 + i), 111);
          });
          const sma350x2Trend = recentPrices.map((_: number, i: number) => {
            return calculateSMA(prices.slice(0, prices.length - 29 + i), 350) * 2;
          });

          // Calculate daily rate of change
          const sma111Rate = (sma111Trend[sma111Trend.length - 1] - sma111Trend[0]) / sma111Trend.length;
          const sma350x2Rate = (sma350x2Trend[sma350x2Trend.length - 1] - sma350x2Trend[0]) / sma350x2Trend.length;

          // Calculate days until intersection
          const currentGap = sma350x2 - sma111;
          const dailyGapChange = sma111Rate - sma350x2Rate;
          const daysToTop = dailyGapChange !== 0 ? Math.ceil(currentGap / dailyGapChange) : undefined;

          price.piCycle = {
            sma111,
            sma350x2,
            distance: ((sma111 / sma350x2) - 1) * 100, // Distance as percentage
            daysToTop: daysToTop && daysToTop > 0 ? daysToTop : undefined
          };
        }

        return price;
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Error fetching crypto prices:', {
          status: error.response?.status,
          data: error.response?.data,
          params: {
            ids: tickers.join(','),
            vs_currencies: 'usd',
            include_24hr_change: true
          }
        });
      } else {
        console.error('Unexpected error:', error);
      }
      return [];
    }
  }
  private async fetchHistoricalData(coin: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/coins/${coin}/market_chart`, {
          params: {
            vs_currency: 'usd',
            days: 350,
            interval: 'daily'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return null;
    }
  }
}

export const cryptoService = new CryptoService();
