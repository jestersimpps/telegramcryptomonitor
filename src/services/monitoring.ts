import axios from 'axios';
import { cryptoService } from './crypto';
import { storageService } from './storage';
import { PriceVolume, AnomalyAlert } from '../types';

class MonitoringService {
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  private priceHistory: Map<string, PriceVolume[]> = new Map();

  public getHistory(ticker: string): PriceVolume[] | undefined {
    return this.priceHistory.get(ticker);
  }
  private readonly HISTORY_LENGTH = 1440; // 24 hours of minute data
  private readonly PRICE_THRESHOLD = 5; // 5% change
  private readonly VOLUME_THRESHOLD = 5; // 5% change

  public async updateMetrics(): Promise<AnomalyAlert[]> {
    const alerts: AnomalyAlert[] = [];
    const users = storageService.getAllUsers();
    const uniqueTickers = new Set<string>();
    
    users.forEach(user => {
      user.tickers.forEach((_, ticker) => uniqueTickers.add(ticker));
    });

    const tickers = Array.from(uniqueTickers);
    if (tickers.length === 0) return alerts;

    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      
      const candlePromises = tickers.map(ticker => 
        axios.get(`${this.baseUrl}/coins/${ticker}/market_chart`, {
          params: {
            vs_currency: 'usd',
            from: Math.floor(oneDayAgo / 1000),
            to: Math.floor(now / 1000),
            interval: 'hourly'
          }
        })
      );

      const responses = await Promise.all(candlePromises);
      
      responses.forEach((response: any, index: number) => {
        const ticker = tickers[index];
        const data = response.data;
        const prices = data.prices || [];
        const volumes = data.total_volumes || [];
        
        if (prices.length < 2 || volumes.length < 2) return;

        const currentPrice = prices[prices.length - 1][1];
        const hourAgoPrice = prices[prices.length - 2][1];
        const dayAgoPrice = prices[0][1];
        
        const currentVolume = volumes[volumes.length - 1][1];
        const hourAgoVolume = volumes[volumes.length - 2][1];
        const dayAgoVolume = volumes[0][1];

        // Calculate percentage changes
        const dayPriceChange = ((currentPrice - dayAgoPrice) / dayAgoPrice) * 100;
        const hourPriceChange = ((currentPrice - hourAgoPrice) / hourAgoPrice) * 100;
        const dayVolumeChange = ((currentVolume - dayAgoVolume) / dayAgoVolume) * 100;
        const hourVolumeChange = ((currentVolume - hourAgoVolume) / hourAgoVolume) * 100;

        // Check for significant changes
        if (Math.abs(dayPriceChange) >= this.PRICE_THRESHOLD) {
          alerts.push({
            type: 'price',
            coin: ticker.toUpperCase(),
            change: dayPriceChange,
            period: '24h',
            currentValue: currentPrice,
            previousValue: dayAgoPrice
          });
        }

        if (Math.abs(hourPriceChange) >= this.PRICE_THRESHOLD) {
          alerts.push({
            type: 'price',
            coin: ticker.toUpperCase(),
            change: hourPriceChange,
            period: '1h',
            currentValue: currentPrice,
            previousValue: hourAgoPrice
          });
        }

        if (Math.abs(dayVolumeChange) >= this.VOLUME_THRESHOLD) {
          alerts.push({
            type: 'volume',
            coin: ticker.toUpperCase(),
            change: dayVolumeChange,
            period: '24h',
            currentValue: currentVolume,
            previousValue: dayAgoVolume
          });
        }

        if (Math.abs(hourVolumeChange) >= this.VOLUME_THRESHOLD) {
          alerts.push({
            type: 'volume',
            coin: ticker.toUpperCase(),
            change: hourVolumeChange,
            period: '1h',
            currentValue: currentVolume,
            previousValue: hourAgoVolume
          });
        }
      });
    } catch (error) {
      console.error('Error fetching candle data:', error);
    }

    return alerts;
  }
}

export const monitoringService = new MonitoringService();
