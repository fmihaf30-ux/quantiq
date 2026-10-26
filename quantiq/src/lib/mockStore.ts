import type { MT5Account, CloudBot, Position, TradeHistoryItem, BotLog, UserProfile, Candle } from '../types';
import { evaluateSignal, normalizeSpec, type StrategySpec } from '@engine';

const STORAGE_KEYS = {
  USER: 'quantiq_demo_user',
  ACCOUNTS: 'quantiq_demo_accounts',
  BOTS: 'quantiq_demo_bots',
  POSITIONS: 'quantiq_demo_positions',
  TRADES: 'quantiq_demo_trades',
  LOGS: 'quantiq_demo_logs',
};

const DEFAULT_USER: UserProfile = {
  id: 'demo-user-001',
  email: 'trader@quantiq.ai',
  fullName: 'Alpha Trader',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop',
  plan: 'platinum',
  planStatus: 'active',
  aiCreditsRemaining: 150,
  createdAt: new Date().toISOString(),
};

const DEFAULT_ACCOUNTS: MT5Account[] = [];

const DEFAULT_BOTS: CloudBot[] = [];
const DEFAULT_POSITIONS: Position[] = [];

const DEFAULT_TRADES: TradeHistoryItem[] = [
  {
    id: 'trade-1',
    botId: 'bot-gold-trend-1',
    mt5AccountId: 'acc-exness-primary',
    ticket: 8939101,
    symbol: 'XAUUSD',
    type: 'buy',
    volume: 0.05,
    openPrice: 4125.30,
    closePrice: 4141.50,
    profit: 81.00,
    openTime: new Date(Date.now() - 86400000 * 1).toISOString(),
    closeTime: new Date(Date.now() - 86400000 * 1 + 7200000).toISOString(),
    exitReason: 'tp',
  },
  {
    id: 'trade-2',
    botId: 'bot-gold-trend-1',
    mt5AccountId: 'acc-exness-primary',
    ticket: 8935402,
    symbol: 'XAUUSD',
    type: 'sell',
    volume: 0.03,
    openPrice: 4146.10,
    closePrice: 4138.00,
    profit: 24.30,
    openTime: new Date(Date.now() - 86400000 * 2).toISOString(),
    closeTime: new Date(Date.now() - 86400000 * 2 + 5400000).toISOString(),
    exitReason: 'tp',
  },
];

const DEFAULT_LOGS: BotLog[] = [
  {
    id: 'log-1',
    botId: 'bot-gold-trend-1',
    userId: 'demo-user-001',
    type: 'status_change',
    message: 'Bot started on MetaApi cloud terminal ICMarketsSC-Live02',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'log-2',
    botId: 'bot-gold-trend-1',
    userId: 'demo-user-001',
    type: 'signal',
    message: 'BUY signal detected: EMA 9 crossed above EMA 21 at 2682.40 (M15 closed candle)',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'log-3',
    botId: 'bot-gold-trend-1',
    userId: 'demo-user-001',
    type: 'trade',
    message: 'Executed BUY 0.10 lots XAUUSD @ 2682.40 | SL: 2674.00, TP: 2699.20 | Ticket #8941203',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

class MockStore {
  private user: UserProfile;
  private accounts: MT5Account[];
  private bots: CloudBot[];
  private positions: Position[];
  private trades: TradeHistoryItem[];
  private logs: BotLog[];
  private listeners: Set<() => void> = new Set();
  private tickerInterval: any = null;
  private bridgeConnected: boolean = false;
  private bridgePollerInterval: any = null;

  constructor() {
    this.user = this.load(STORAGE_KEYS.USER, DEFAULT_USER);
    
    // Purge stale mock storage if it had 5000 balance or stale old gold prices
    // Purge fake mock accounts if they had fake 80.00 balance
    const storedAccs = this.load<MT5Account[] | null>(STORAGE_KEYS.ACCOUNTS, null);
    if (storedAccs && storedAccs.some((a) => a.id === 'acc-exness-primary' || a.accountNumber === '476691144' || (a.balance === 80 && a.equity === 66.95))) {
      this.accounts = storedAccs.filter((a) => a.id !== 'acc-exness-primary' && a.accountNumber !== '476691144' && !(a.balance === 80 && a.equity === 66.95));
      try { localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(this.accounts)); } catch {}
    } else {
      this.accounts = storedAccs && storedAccs.length > 0 ? storedAccs : [];
    }

    // Purge fake mock bots and fake mock positions so user sees true clean state
    const storedBots = this.load<CloudBot[] | null>(STORAGE_KEYS.BOTS, null);
    if (!storedBots || storedBots.some((b) => b.id.startsWith('bot-gold-trend') || b.id.startsWith('bot-eur-scalper') || b.winRate > 100)) {
      this.bots = [];
      try { localStorage.setItem(STORAGE_KEYS.BOTS, JSON.stringify([])); } catch {}
    } else {
      this.bots = storedBots;
    }

    const storedPos = this.load<Position[] | null>(STORAGE_KEYS.POSITIONS, null);
    if (!storedPos || storedPos.some((p) => p.id.startsWith('pos-') || p.ticket === 3382494264 || p.ticket === 1156869)) {
      this.positions = [];
      try { localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([])); } catch {}
    } else {
      this.positions = storedPos;
    }

    this.trades = this.load(STORAGE_KEYS.TRADES, DEFAULT_TRADES);
    this.logs = this.load(STORAGE_KEYS.LOGS, DEFAULT_LOGS);

    this.startBridgePoller();
    this.startSimulationTicker();
  }

  private startBridgePoller() {
    if (typeof window === 'undefined') return;

    const poll = async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 1200);
        const [accRes, posRes] = await Promise.all([
          fetch('http://127.0.0.1:8000/account', { signal: ctrl.signal }),
          fetch('http://127.0.0.1:8000/positions', { signal: ctrl.signal }),
        ]);
        clearTimeout(timeout);

        if (accRes.ok) {
          const accData = await accRes.json();
          this.bridgeConnected = true;

          // Sync active account
          const accNumStr = String(accData.login);
          let matched = this.accounts.find((a) => a.accountNumber === accNumStr);
          if (!matched) {
            matched = {
              id: `acc-${accNumStr}`,
              userId: this.user.id,
              accountNumber: accNumStr,
              broker: 'Exness',
              server: accData.server,
              accountName: `Exness ${accNumStr}`,
              currency: accData.currency || 'USD',
              balance: Number(accData.balance),
              equity: Number(accData.equity),
              freeMargin: Number(accData.freeMargin ?? accData.balance),
              leverage: Number(accData.leverage),
              status: 'connected',
              isSimulated: false,
              metaapiAccountId: `mt5-${accNumStr}`,
              lastConnectedAt: new Date().toISOString(),
            };
            this.accounts.unshift(matched);
          } else {
            matched.balance = Number(accData.balance);
            matched.equity = Number(accData.equity);
            matched.freeMargin = Number(accData.freeMargin ?? accData.balance);
            matched.leverage = Number(accData.leverage);
            matched.server = accData.server;
            matched.accountNumber = accNumStr;
            matched.status = 'connected';
            matched.isSimulated = false;
          }

          // Sync live open positions from MT5
          if (posRes.ok) {
            const posData = await posRes.json();
            if (Array.isArray(posData.positions)) {
              this.positions = posData.positions.map((p: any) => ({
                id: `pos-${p.ticket}`,
                botId: 'bot-trish-live',
                mt5AccountId: matched?.id || 'acc-exness-primary',
                ticket: p.ticket,
                symbol: p.symbol.replace(/m$/, ''),
                type: p.type.toLowerCase() as 'buy' | 'sell',
                volume: p.volume,
                openPrice: p.priceOpen,
                currentPrice: p.priceCurrent,
                stopLoss: p.sl,
                takeProfit: p.tp,
                profit: p.profit,
                openTime: new Date(p.time * 1000).toISOString(),
              }));
            }
          }

          this.save();
        } else {
          this.bridgeConnected = false;
        }
      } catch {
        this.bridgeConnected = false;
      }
    };

    poll();
    this.bridgePollerInterval = setInterval(poll, 3000);
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(this.user));
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(this.accounts));
      localStorage.setItem(STORAGE_KEYS.BOTS, JSON.stringify(this.bots));
      localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(this.positions));
      localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(this.trades));
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    } catch (e) {
      console.warn('Storage save error', e);
    }
    this.notify();
  }

  public subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // Getters
  getUser(): UserProfile { return this.user; }
  getAccounts(): MT5Account[] { return this.accounts; }
  getBots(): CloudBot[] { return this.bots; }
  getPositions(): Position[] { return this.positions; }
  getTrades(): TradeHistoryItem[] { return this.trades; }
  getLogs(botId?: string): BotLog[] {
    return botId ? this.logs.filter((l) => l.botId === botId) : this.logs;
  }

  addAccount(acc: Omit<MT5Account, 'id' | 'userId' | 'lastConnectedAt'>): MT5Account {
    const existing = this.accounts.find((a) => a.accountNumber === acc.accountNumber);
    if (existing) {
      const updated = this.updateAccount(existing.id, acc);
      try {
        localStorage.setItem('quantiq_active_account_id', updated.id);
      } catch {}
      return updated;
    }
    const newAcc: MT5Account = {
      ...acc,
      id: `acc-${acc.accountNumber}-${Date.now()}`,
      userId: this.user.id,
      lastConnectedAt: new Date().toISOString(),
    };
    this.accounts = [newAcc, ...this.accounts];
    try {
      localStorage.setItem('quantiq_active_account_id', newAcc.id);
    } catch {}
    this.save();
    return newAcc;
  }

  updateAccount(id: string, updates: Partial<MT5Account>): MT5Account {
    this.accounts = this.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a));
    this.save();
    return this.accounts.find((a) => a.id === id)!;
  }

  deleteAccount(id: string) {
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.bots = this.bots.filter((b) => b.mt5AccountId !== id);
    this.save();
  }

  createBot(name: string, symbol: string, timeframe: string, spec: StrategySpec, mt5AccountId: string): CloudBot {
    const newBot: CloudBot = {
      id: `bot-${Date.now()}`,
      userId: this.user.id,
      mt5AccountId: mt5AccountId || this.accounts[0]?.id || 'acc-mt5-demo-1',
      name,
      symbol,
      timeframe,
      status: 'running',
      strategySpec: spec,
      totalTrades: 0,
      winningTrades: 0,
      totalProfit: 0,
      winRate: 0,
      createdAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
    };
    this.bots = [newBot, ...this.bots];
    this.logs.unshift({
      id: `log-${Date.now()}`,
      botId: newBot.id,
      userId: this.user.id,
      type: 'status_change',
      message: `Cloud Bot "${name}" initialized with ${spec.engine.toUpperCase()} engine on ${symbol} ${timeframe}`,
      createdAt: new Date().toISOString(),
    });
    this.save();
    return newBot;
  }

  toggleBot(botId: string, status: 'running' | 'stopped') {
    this.bots = this.bots.map((b) => (b.id === botId ? { ...b, status } : b));
    this.logs.unshift({
      id: `log-${Date.now()}`,
      botId,
      userId: this.user.id,
      type: 'status_change',
      message: `Bot status changed to: ${status.toUpperCase()}`,
      createdAt: new Date().toISOString(),
    });
    this.save();
  }

  deleteBot(botId: string) {
    this.bots = this.bots.filter((b) => b.id !== botId);
    this.positions = this.positions.filter((p) => p.botId !== botId);
    this.save();
  }

  addPosition(pos: Omit<Position, 'id'>): Position {
    const newPos: Position = {
      ...pos,
      id: `pos-${Date.now()}`,
    };
    this.positions.unshift(newPos);
    this.save();
    return newPos;
  }

  addLog(log: Omit<BotLog, 'id' | 'createdAt'>): BotLog {
    const newLog: BotLog = {
      ...log,
      id: `log-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.logs.unshift(newLog);
    this.save();
    return newLog;
  }

  closePosition(posId: string) {
    const pos = this.positions.find((p) => p.id === posId);
    if (!pos) return;
    this.positions = this.positions.filter((p) => p.id !== posId);
    this.trades.unshift({
      id: `trade-${Date.now()}`,
      botId: pos.botId,
      mt5AccountId: pos.mt5AccountId,
      ticket: pos.ticket,
      symbol: pos.symbol,
      type: pos.type,
      volume: pos.volume,
      openPrice: pos.openPrice,
      closePrice: pos.currentPrice,
      profit: pos.profit,
      openTime: pos.openTime,
      closeTime: new Date().toISOString(),
      exitReason: 'manual',
    });
    this.save();
  }

  deductAICredit() {
    if (this.user.aiCreditsRemaining > 0) {
      this.user = { ...this.user, aiCreditsRemaining: this.user.aiCreditsRemaining - 1 };
      this.save();
    }
  }

  // Periodic simulation for bots when not connected to native MT5
  private startSimulationTicker() {
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    this.tickerInterval = setInterval(() => {
      // If connected to native MT5 bridge, do NOT tamper with real live positions!
      if (this.bridgeConnected) return;

      let changed = false;

      // Update positions with slight price flutter
      this.positions = this.positions.map((p) => {
        const delta = (Math.random() - 0.48) * (p.symbol.includes('XAU') ? 0.4 : 0.0003);
        const newPrice = Math.max(0.001, p.currentPrice + delta);
        const dir = p.type === 'buy' ? 1 : -1;
        const profit = Number(((newPrice - p.openPrice) * dir * (p.volume * 1000)).toFixed(2));

        // Check TP / SL hit
        if (p.takeProfit && ((p.type === 'buy' && newPrice >= p.takeProfit) || (p.type === 'sell' && newPrice <= p.takeProfit))) {
          this.trades.unshift({
            id: `trade-${Date.now()}`,
            botId: p.botId,
            mt5AccountId: p.mt5AccountId,
            ticket: p.ticket,
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            openPrice: p.openPrice,
            closePrice: p.takeProfit,
            profit,
            openTime: p.openTime,
            closeTime: new Date().toISOString(),
            exitReason: 'tp',
          });
          this.logs.unshift({
            id: `log-${Date.now()}`,
            botId: p.botId || '',
            userId: this.user.id,
            type: 'trade',
            message: `Take Profit triggered for #${p.ticket} on ${p.symbol} (+${profit} USD)`,
            createdAt: new Date().toISOString(),
          });
          changed = true;
          return null as any;
        }

        if (p.stopLoss && ((p.type === 'buy' && newPrice <= p.stopLoss) || (p.type === 'sell' && newPrice >= p.stopLoss))) {
          this.trades.unshift({
            id: `trade-${Date.now()}`,
            botId: p.botId,
            mt5AccountId: p.mt5AccountId,
            ticket: p.ticket,
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            openPrice: p.openPrice,
            closePrice: p.stopLoss,
            profit,
            openTime: p.openTime,
            closeTime: new Date().toISOString(),
            exitReason: 'sl',
          });
          this.logs.unshift({
            id: `log-${Date.now()}`,
            botId: p.botId || '',
            userId: this.user.id,
            type: 'trade',
            message: `Stop Loss triggered for #${p.ticket} on ${p.symbol} (${profit} USD)`,
            createdAt: new Date().toISOString(),
          });
          changed = true;
          return null as any;
        }

        // Update bot metrics if trade exited
        if (p.botId) {
          const b = this.bots.find((bot) => bot.id === p.botId);
          if (b) {
            b.totalProfit = Number(((b.totalProfit || 0) + profit).toFixed(2));
            if (profit > 0) b.winningTrades = (b.winningTrades || 0) + 1;
            b.winRate = Number(((b.winningTrades / (b.totalTrades || 1)) * 100).toFixed(1));
          }
        }

        return { ...p, currentPrice: newPrice, profit };
      }).filter(Boolean);

      if (changed) this.save();
      else this.notify();
    }, 4000);
  }
}

export const mockStore = new MockStore();

// Synthetic Candle Generator with Realistic Institutional Market Waves
export function generateSyntheticCandles(symbol: string, count: number = 100): Candle[] {
  const candles: Candle[] = [];
  const sym = symbol.toUpperCase();
  const basePrice = sym.includes('XAU') ? 4142.50 : sym.includes('BTC') ? 81900 : sym.includes('EUR') ? 1.1212 : sym.includes('GBP') ? 1.3304 : 52040;
  const volatility = basePrice * 0.0010;
  const now = Math.floor(Date.now() / 1000);
  const interval = 900; // 15m

  let cur = basePrice;
  for (let i = count; i >= 0; i--) {
    const time = now - i * interval;
    const progress = count - i;
    const trendCycle = Math.sin(progress / 14) * volatility * 1.5 + Math.cos(progress / 35) * volatility * 0.8;
    const microJitter = (Math.random() - 0.49) * volatility * 0.3;
    const open = cur;
    const close = open + trendCycle + microJitter;
    const high = Math.max(open, close) + Math.random() * volatility * 0.25;
    const low = Math.min(open, close) - Math.random() * volatility * 0.25;
    const volume = Math.floor(100 + Math.random() * 500);

    candles.push({ time, open, high, low, close, volume });
    cur = close;
  }
  return candles;
}
