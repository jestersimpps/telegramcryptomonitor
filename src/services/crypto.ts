import axios from 'axios';
import { CryptoPrice, PriceVolume } from '../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
  return sum / period;
};

class CryptoService {
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  
  private async makeRequest<T>(url: string, params: any): Promise<T> {
    let retries = 0;
    let delay = INITIAL_RETRY_DELAY;

    while (retries < MAX_RETRIES) {
      try {
        const response = await axios.get(url, { params });
        await sleep(1000); // Wait 1 second between successful requests
        return response.data;
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          retries++;
          if (retries === MAX_RETRIES) throw error;
          
          console.log(`Rate limited, waiting ${delay}ms before retry ${retries}`);
          await sleep(delay);
          delay = Math.min(delay * 2, MAX_RETRY_DELAY);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  public async getPricesAndVolumes(tickers: string[]): Promise<Array<PriceVolume>> {
    try {
      // Process tickers in smaller batches to avoid rate limits
      const BATCH_SIZE = 3;
      const results: PriceVolume[] = [];
      
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batchTickers = tickers.slice(i, i + BATCH_SIZE);
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      
        const batchPromises = batchTickers.map(async ticker => {
          const data = await this.makeRequest(`${this.baseUrl}/coins/${ticker}/market_chart`, {
            vs_currency: 'usd',
            from: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000),
            to: Math.floor(Date.now() / 1000),
            interval: 'hourly'
          });
          
          const prices = data.prices || [];
          const volumes = data.total_volumes || [];
          
          return {
            id: ticker,
            symbol: ticker,
            price: prices[prices.length - 1]?.[1] || 0,
            volume: volumes[volumes.length - 1]?.[1] || 0,
            timestamp: Date.now()
          };
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches
        if (i + BATCH_SIZE < tickers.length) {
          await sleep(2000); // 2 second delay between batches
        }
      }

      return results;
      
      return responses.map((response, index) => {
        const data = response.data;
        const prices = data.prices || [];
        const volumes = data.total_volumes || [];
        
        // Get latest values
        const latestPrice = prices[prices.length - 1]?.[1] || 0;
        const latestVolume = volumes[volumes.length - 1]?.[1] || 0;
        
        return {
          id: tickers[index],
          symbol: tickers[index],
          price: latestPrice,
          volume: latestVolume,
          timestamp: now
        };
      });
    } catch (error) {
      console.error('Error fetching candle data:', error);
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
