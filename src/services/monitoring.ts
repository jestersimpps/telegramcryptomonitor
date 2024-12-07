import { cryptoService } from './crypto';
import { storageService } from './storage';
import { PriceVolume, AnomalyAlert } from '../types';

class MonitoringService {
  private priceHistory: Map<string, PriceVolume[]> = new Map();
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

    const currentMetrics = await cryptoService.getPricesAndVolumes(tickers);
    
    currentMetrics.forEach(metric => {
      let history = this.priceHistory.get(metric.id) || [];
      
      // Add new data point
      history.push(metric);
      
      // Keep only last 24 hours
      if (history.length > this.HISTORY_LENGTH) {
        history = history.slice(-this.HISTORY_LENGTH);
      }
      
      this.priceHistory.set(metric.id, history);

      // Check for anomalies if we have enough history
      if (history.length > 2) {
        const dayAgoIndex = Math.max(0, history.length - 1440);
        const hourAgoIndex = Math.max(0, history.length - 60);
        
        const currentPrice = metric.price;
        const dayAgoPrice = history[dayAgoIndex].price;
        const hourAgoPrice = history[hourAgoIndex].price;
        
        const currentVolume = metric.volume;
        const dayAgoVolume = history[dayAgoIndex].volume;
        const hourAgoVolume = history[hourAgoIndex].volume;

        // Calculate percentage changes
        const dayPriceChange = ((currentPrice - dayAgoPrice) / dayAgoPrice) * 100;
        const hourPriceChange = ((currentPrice - hourAgoPrice) / hourAgoPrice) * 100;
        const dayVolumeChange = ((currentVolume - dayAgoVolume) / dayAgoVolume) * 100;
        const hourVolumeChange = ((currentVolume - hourAgoVolume) / hourAgoVolume) * 100;

        // Check for significant changes
        if (Math.abs(dayPriceChange) >= this.PRICE_THRESHOLD) {
          alerts.push({
            type: 'price',
            coin: metric.symbol.toUpperCase(),
            change: dayPriceChange,
            period: '24h',
            currentValue: currentPrice,
            previousValue: dayAgoPrice
          });
        }

        if (Math.abs(hourPriceChange) >= this.PRICE_THRESHOLD) {
          alerts.push({
            type: 'price',
            coin: metric.symbol.toUpperCase(),
            change: hourPriceChange,
            period: '1h',
            currentValue: currentPrice,
            previousValue: hourAgoPrice
          });
        }

        if (Math.abs(dayVolumeChange) >= this.VOLUME_THRESHOLD) {
          alerts.push({
            type: 'volume',
            coin: metric.symbol.toUpperCase(),
            change: dayVolumeChange,
            period: '24h',
            currentValue: currentVolume,
            previousValue: dayAgoVolume
          });
        }

        if (Math.abs(hourVolumeChange) >= this.VOLUME_THRESHOLD) {
          alerts.push({
            type: 'volume',
            coin: metric.symbol.toUpperCase(),
            change: hourVolumeChange,
            period: '1h',
            currentValue: currentVolume,
            previousValue: hourAgoVolume
          });
        }
      }
    });

    return alerts;
  }
}

export const monitoringService = new MonitoringService();
