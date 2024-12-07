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
        this.users = new Map(Object.entries(data).map(([key, value]) => [parseInt(key), value as UserData]));
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
      const data = Object.fromEntries(this.users);
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  public getUser(chatId: number): UserData | undefined {
    return this.users.get(chatId);
  }

  public addTicker(chatId: number, ticker: string): void {
    const userData = this.users.get(chatId) || { chatId, tickers: [] };
    if (!userData.tickers.includes(ticker.toLowerCase())) {
      userData.tickers.push(ticker.toLowerCase());
      this.users.set(chatId, userData);
      this.saveData();
    }
  }

  public removeTicker(chatId: number, ticker: string): void {
    const userData = this.users.get(chatId);
    if (userData) {
      userData.tickers = userData.tickers.filter(t => t !== ticker.toLowerCase());
      this.users.set(chatId, userData);
      this.saveData();
    }
  }

  public getAllUsers(): UserData[] {
    return Array.from(this.users.values());
  }
}

export const storageService = new StorageService();
