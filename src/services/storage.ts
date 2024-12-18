import fs from 'fs';
import path from 'path';
import { UserData } from '../types';

class StorageService {
  private dataPath: string;
  private users: Map<number, UserData>;

  constructor() {
    this.dataPath = path.join(__dirname, '../../data/users.json');
    this.users = new Map();
    this.loadData();
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        this.users = new Map(
          Object.entries(data).map(([key, value]: [string, any]) => {
            // Reconstruct the tickers Map from the plain object
            const userData = value as UserData;
            userData.tickers = new Map(Object.entries(userData.tickers || {}));
            return [parseInt(key), userData];
          })
        );
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  private saveData(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(
        Array.from(this.users.entries()).map(([key, userData]) => [
          key,
          {
            ...userData,
            tickers: Object.fromEntries(userData.tickers)
          }
        ])
      );
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  public getUser(chatId: number): UserData | undefined {
    return this.users.get(chatId);
  }

  public addTicker(chatId: number, ticker: string, amount: number): void {
    const userData = this.users.get(chatId) || { chatId, tickers: new Map(), updateTime: undefined };
    userData.tickers.set(ticker.toLowerCase(), amount);
    this.users.set(chatId, userData);
    this.saveData();
  }

  public removeTicker(chatId: number, ticker: string): void {
    const userData = this.users.get(chatId);
    if (userData) {
      userData.tickers.delete(ticker.toLowerCase());
      this.users.set(chatId, userData);
      this.saveData();
    }
  }

  public getAllUsers(): UserData[] {
    return Array.from(this.users.values());
  }

  public setUpdateTime(chatId: number, time: string): void {
    const userData: UserData = this.users.get(chatId) || { chatId, tickers: new Map(), updateTime: undefined };
    userData.updateTime = time;
    this.users.set(chatId, userData);
    this.saveData();
  }

  public removeUpdateTime(chatId: number): void {
    const userData = this.users.get(chatId);
    if (userData) {
      delete userData.updateTime;
      this.users.set(chatId, userData);
      this.saveData();
    }
  }

}

export const storageService = new StorageService();
