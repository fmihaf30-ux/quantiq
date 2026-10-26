import type { StrategySpec, Candle, Signal, ChartAnalysis } from '@engine';

export type { StrategySpec, Candle, Signal, ChartAnalysis };

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  plan: 'free' | 'pro' | 'ultimate' | 'platinum';
  planStatus: 'active' | 'trial' | 'past_due' | 'canceled';
  aiCreditsRemaining: number;
  createdAt: string;
}

export interface MT5Account {
  id: string;
  userId: string;
  accountNumber: string;
  broker: string;
  server: string;
  accountName: string;
  currency: string;
  balance: number;
  equity: number;
  freeMargin: number;
  leverage: number;
  status: 'connected' | 'disconnected' | 'reauth_required' | 'connecting';
  metaapiAccountId?: string;
  isSimulated: boolean;
  lastConnectedAt: string;
}

export interface CloudBot {
  id: string;
  userId: string;
  mt5AccountId: string;
  name: string;
  symbol: string;
  timeframe: string;
  status: 'running' | 'stopped' | 'starting' | 'error';
  strategySpec: StrategySpec;
  totalTrades: number;
  winningTrades: number;
  totalProfit: number;
  winRate: number;
  createdAt: string;
  lastRunAt?: string;
}

export interface Position {
  id: string;
  botId?: string;
  mt5AccountId: string;
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  openTime: string;
}

export interface TradeHistoryItem {
  id: string;
  botId?: string;
  mt5AccountId: string;
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  closePrice: number;
  profit: number;
  openTime: string;
  closeTime: string;
  exitReason: 'tp' | 'sl' | 'manual' | 'bot_stop';
}

export interface BotLog {
  id: string;
  botId: string;
  userId: string;
  type: 'trade' | 'signal' | 'status_change' | 'error' | 'debug';
  message: string;
  createdAt: string;
}
