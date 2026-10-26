import { useEffect, useState } from 'react';
import { supabase, isLiveMode } from './supabase';
import { mockStore } from './mockStore';
import type { MT5Account, CloudBot, Position, TradeHistoryItem, BotLog, UserProfile } from '../types';
import type { StrategySpec } from '@engine';

export interface GlobalRiskSettings {
  mode: 'RISK_PCT' | 'FIXED_LOT';
  riskPercent: number; // e.g. 1.0%
  fixedLot: number;     // e.g. 0.02
  maxTrades: number;    // e.g. 2
  autoBreakeven: boolean; // default true
  breakevenTriggerR: number; // e.g. 1.0 R
  trailingStop: boolean; // default true
  orderDispatchMode?: 'AUTO' | 'MARKET' | 'LIMIT'; // AUTO: AI decides Limit vs Market based on SMC mitigation distance!
  partialProfitClose?: boolean; // default true: take 50% partial off at +1.5R, lock 50% to trail
  maxSpreadPoints?: number; // max allowable spread points
  tradeCooldownMinutes?: number; // default 5 minutes
  dailyGrowthTargetPct: number; // e.g. 5.0%
  dailyLossLimitPct: number;    // e.g. 3.0%
}

class DataService {
  private listeners = new Set<() => void>();
  private user: UserProfile | null = mockStore.getUser();
  private accounts: MT5Account[] = mockStore.getAccounts();
  private bots: CloudBot[] = mockStore.getBots();
  private positions: Position[] = mockStore.getPositions();
  private trades: TradeHistoryItem[] = mockStore.getTrades();
  private logs: BotLog[] = mockStore.getLogs();
  private riskSettings: GlobalRiskSettings = this.loadRiskSettings();
  private initialized = false;

  private loadRiskSettings(): GlobalRiskSettings {
    const defaultSettings: GlobalRiskSettings = {
      mode: 'RISK_PCT',
      riskPercent: 1.0,
      fixedLot: 0.02,
      maxTrades: 2,
      autoBreakeven: true,
      breakevenTriggerR: 1.0,
      trailingStop: true, // Smart Step Trailing SL enabled by default
      orderDispatchMode: 'AUTO', // AI selects LIMIT or MARKET based on SMC structure
      partialProfitClose: true, // Take 50% profit off at +1.5R and let 50% trail
      maxSpreadPoints: 45, // Protect against wide spreads
      tradeCooldownMinutes: 5, // 5-minute cooldown between entries on same asset
      dailyGrowthTargetPct: 0, // 0 = no limit / unlimited growth
      dailyLossLimitPct: 0,    // 0 = disabled by default / no daily loss limit
    };
    if (typeof window === 'undefined') return defaultSettings;
    try {
      const stored = localStorage.getItem('quantiq_global_risk_settings') || localStorage.getItem('pipnex_global_risk_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Reset legacy default of 3.0 to 0 (disabled) so it doesn't block trading
        if (parsed.dailyLossLimitPct === 3.0) {
          parsed.dailyLossLimitPct = 0;
        }
        return { ...defaultSettings, ...parsed };
      }
    } catch {}
    return defaultSettings;
  }

  getRiskSettings(): GlobalRiskSettings {
    return this.riskSettings;
  }

  setRiskSettings(newSettings: Partial<GlobalRiskSettings>): GlobalRiskSettings {
    this.riskSettings = { ...this.riskSettings, ...newSettings };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('quantiq_global_risk_settings', JSON.stringify(this.riskSettings));
        localStorage.setItem('pipnex_global_risk_settings', JSON.stringify(this.riskSettings));
      } catch {}
    }
    this.notify();
    return this.riskSettings;
  }

  constructor() {
    mockStore.subscribe(() => {
      this.user = mockStore.getUser();
      this.accounts = mockStore.getAccounts();
      this.bots = mockStore.getBots();
      this.positions = mockStore.getPositions();
      this.trades = mockStore.getTrades();
      this.logs = mockStore.getLogs();
      this.notify();
    });

    if (isLiveMode && supabase) {
      this.initSupabase();
    }
  }

  private async initSupabase() {
    if (!supabase) return;

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await this.loadLiveUserData(session.user.id, session.user.email || '');
      } else {
        this.user = mockStore.getUser();
        this.accounts = mockStore.getAccounts();
        this.bots = mockStore.getBots();
        this.positions = mockStore.getPositions();
        this.trades = mockStore.getTrades();
        this.logs = mockStore.getLogs();
        this.notify();
      }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await this.loadLiveUserData(session.user.id, session.user.email || '');
    }
  }

  private async loadLiveUserData(userId: string, email: string) {
    if (!supabase) return;

    // 1. Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      this.user = {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name || email.split('@')[0],
        avatarUrl: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop',
        plan: profile.plan || 'free',
        planStatus: profile.plan_status || 'active',
        aiCreditsRemaining: profile.ai_credits_remaining ?? 50,
        createdAt: profile.created_at,
      };
    } else {
      this.user = {
        id: userId,
        email,
        fullName: email.split('@')[0],
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop',
        plan: 'free',
        planStatus: 'active',
        aiCreditsRemaining: 50,
        createdAt: new Date().toISOString(),
      };
    }

    // 2. Fetch MT5 accounts
    const { data: accounts } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    this.accounts = (accounts || []).map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      accountNumber: a.account_number,
      broker: a.broker,
      server: a.server,
      accountName: a.account_name,
      currency: a.currency,
      balance: Number(a.balance),
      equity: Number(a.equity),
      freeMargin: Number(a.free_margin),
      leverage: a.leverage,
      status: a.status,
      metaapiAccountId: a.metaapi_account_id,
      isSimulated: a.is_simulated,
      lastConnectedAt: a.last_connected_at,
    }));

    // 3. Fetch bots
    const { data: bots } = await supabase
      .from('cloud_bots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    this.bots = (bots || []).map((b: any) => ({
      id: b.id,
      userId: b.user_id,
      mt5AccountId: b.mt5_account_id,
      name: b.name,
      symbol: b.symbol,
      timeframe: b.timeframe,
      status: b.status,
      strategySpec: b.strategy_spec,
      totalTrades: b.total_trades || 0,
      winningTrades: b.winning_trades || 0,
      totalProfit: Number(b.total_profit || 0),
      winRate: Number(b.win_rate || 0),
      createdAt: b.created_at,
      lastRunAt: b.last_run_at,
    }));

    // 4. Fetch open positions & trades
    const { data: trades } = await supabase
      .from('cloud_bot_trades')
      .select('*')
      .eq('user_id', userId)
      .order('open_time', { ascending: false });

    const openPositions: Position[] = [];
    const closedTrades: TradeHistoryItem[] = [];

    (trades || []).forEach((t: any) => {
      if (t.status === 'open') {
        openPositions.push({
          id: t.id,
          botId: t.bot_id,
          mt5AccountId: t.mt5_account_id,
          ticket: t.ticket,
          symbol: t.symbol,
          type: t.type,
          volume: Number(t.volume),
          openPrice: Number(t.open_price),
          currentPrice: Number(t.close_price || t.open_price),
          stopLoss: t.stop_loss ? Number(t.stop_loss) : undefined,
          takeProfit: t.take_profit ? Number(t.take_profit) : undefined,
          profit: Number(t.profit || 0),
          openTime: t.open_time,
        });
      } else {
        closedTrades.push({
          id: t.id,
          botId: t.bot_id,
          mt5AccountId: t.mt5_account_id,
          ticket: t.ticket,
          symbol: t.symbol,
          type: t.type,
          volume: Number(t.volume),
          openPrice: Number(t.open_price),
          closePrice: Number(t.close_price),
          profit: Number(t.profit),
          openTime: t.open_time,
          closeTime: t.close_time,
          exitReason: t.exit_reason || 'manual',
        });
      }
    });

    this.positions = openPositions;
    this.trades = closedTrades;

    // 5. Fetch logs
    const { data: logs } = await supabase
      .from('cloud_bot_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    this.logs = (logs || []).map((l: any) => ({
      id: l.id,
      botId: l.bot_id,
      userId: l.user_id,
      type: l.log_type,
      message: l.message,
      createdAt: l.created_at,
    }));

    this.subscribeRealtime(userId);
    this.notify();
  }

  private realtimeChannel: any = null;

  private subscribeRealtime(userId: string) {
    if (!supabase) return;

    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    this.realtimeChannel = supabase
      .channel(`cloud-bot-live-updates-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cloud_bot_logs', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const l = payload.new;
          this.logs.unshift({
            id: l.id,
            botId: l.bot_id,
            userId: l.user_id,
            type: l.log_type,
            message: l.message,
            createdAt: l.created_at,
          });
          this.notify();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cloud_bot_trades', filter: `user_id=eq.${userId}` },
        () => {
          if (this.user?.id) this.loadLiveUserData(this.user.id, this.user.email);
        }
      )
      .subscribe();
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
  getUser(): UserProfile | null {
    return (isLiveMode && this.user) ? this.user : mockStore.getUser();
  }

  getAccounts(): MT5Account[] {
    if (isLiveMode && this.user && this.accounts.length > 0) {
      return this.accounts;
    }
    return mockStore.getAccounts();
  }

  getBots(): CloudBot[] {
    if (isLiveMode && this.user && this.bots.length > 0) {
      return this.bots;
    }
    return mockStore.getBots();
  }

  getPositions(): Position[] {
    return this.positions;
  }

  /**
   * Bidirectional synchronization of active positions with live MT5 broker
   */
  syncLivePositions(livePositions: any[]) {
    if (!Array.isArray(livePositions)) return;
    const activeAccountId = this.getActiveAccountId() || 'active';
    
    const mapped: Position[] = livePositions.map((p) => ({
      id: `mt5-${p.ticket}`,
      ticket: Number(p.ticket),
      symbol: p.symbol,
      type: String(p.type).toLowerCase().includes('buy') ? 'buy' : 'sell',
      volume: Number(p.volume),
      openPrice: Number(p.priceOpen ?? p.openPrice ?? 0),
      currentPrice: Number(p.priceCurrent ?? p.currentPrice ?? p.priceOpen ?? 0),
      stopLoss: p.sl ? Number(p.sl) : undefined,
      takeProfit: p.tp ? Number(p.tp) : undefined,
      profit: Number(p.profit ?? 0),
      openTime: p.time ? new Date(p.time * 1000).toISOString() : new Date().toISOString(),
      mt5AccountId: activeAccountId,
    }));

    // Detect if a position was closed on the MT5 terminal
    if (this.positions.length > 0 && mapped.length < this.positions.length) {
      const liveTickets = new Set(mapped.map((m) => m.ticket));
      for (const oldPos of this.positions) {
        if (!liveTickets.has(oldPos.ticket)) {
          this.addLog({
            botId: 'autonomous-growth-engine',
            userId: 'system',
            type: 'trade',
            message: `🏁 Position #${oldPos.ticket} (${oldPos.symbol} ${oldPos.type.toUpperCase()}) closed on MT5. Trade slot freed.`,
          });
        }
      }
    }

    this.positions = mapped;
    this.notify();
  }

  getTrades(): TradeHistoryItem[] {
    if (isLiveMode && this.user && this.trades.length > 0) {
      return this.trades;
    }
    return mockStore.getTrades();
  }

  getLogs(botId?: string): BotLog[] {
    const list = (isLiveMode && this.user && this.logs.length > 0) ? this.logs : mockStore.getLogs();
    return botId && botId !== 'all' ? list.filter((l) => l.botId === botId) : list;
  }

  // Mutations
  async addAccount(acc: Omit<MT5Account, 'id' | 'userId' | 'lastConnectedAt'>): Promise<MT5Account> {
    if (isLiveMode && supabase && this.user) {
      try {
        const { data, error } = await supabase
          .from('mt5_accounts')
          .insert({
            user_id: this.user.id,
            account_number: acc.accountNumber,
            broker: acc.broker,
            server: acc.server,
            account_name: acc.accountName,
            currency: acc.currency,
            balance: acc.balance,
            equity: acc.equity,
            free_margin: acc.freeMargin,
            leverage: acc.leverage,
            status: acc.status,
            is_simulated: acc.isSimulated,
            metaapi_account_id: acc.metaapiAccountId,
          })
          .select()
          .single();

        if (!error && data) {
          const created: MT5Account = {
            id: data.id,
            userId: data.user_id,
            accountNumber: data.account_number,
            broker: data.broker,
            server: data.server,
            accountName: data.account_name,
            currency: data.currency,
            balance: Number(data.balance),
            equity: Number(data.equity),
            freeMargin: Number(data.free_margin),
            leverage: data.leverage,
            status: data.status,
            isSimulated: data.is_simulated,
            metaapiAccountId: data.metaapi_account_id,
            lastConnectedAt: data.last_connected_at,
          };
          this.accounts = [created, ...this.accounts.filter((a) => a.id !== created.id)];
          mockStore.addAccount(acc);
          this.setActiveAccountId(created.id);
          this.notify();
          return created;
        }
      } catch (e) {
        console.warn('Live account add error, falling back to local storage:', e);
      }
    }
    const created = mockStore.addAccount(acc);
    this.accounts = mockStore.getAccounts();
    this.setActiveAccountId(created.id);
    this.notify();
    return created;
  }

  getActiveAccountId(): string {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('quantiq_active_account_id') : null;
    const accs = this.getAccounts();
    if (stored && accs.some((a) => a.id === stored)) {
      return stored;
    }
    return accs[0]?.id || '';
  }

  setActiveAccountId(id: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quantiq_active_account_id', id);
    }
    this.notify();
  }

  getActiveAccount(): MT5Account | undefined {
    const id = this.getActiveAccountId();
    const accs = this.getAccounts();
    return accs.find((a) => a.id === id) || accs[0];
  }

  async updateAccount(id: string, updates: Partial<MT5Account>): Promise<MT5Account> {
    if (isLiveMode && supabase && this.user) {
      try {
        const payload: any = {};
        if (updates.balance !== undefined) payload.balance = updates.balance;
        if (updates.equity !== undefined) payload.equity = updates.equity;
        if (updates.freeMargin !== undefined) payload.free_margin = updates.freeMargin;
        if (updates.accountName !== undefined) payload.account_name = updates.accountName;
        if (updates.broker !== undefined) payload.broker = updates.broker;
        if (updates.server !== undefined) payload.server = updates.server;
        if (updates.accountNumber !== undefined) payload.account_number = updates.accountNumber;
        if (updates.status !== undefined) payload.status = updates.status;

        await supabase.from('mt5_accounts').update(payload).eq('id', id);
      } catch (e) {
        console.warn('Live account update error:', e);
      }
    }
    const updated = mockStore.updateAccount(id, updates);
    this.accounts = mockStore.getAccounts();
    this.notify();
    return updated;
  }

  async deleteAccount(id: string): Promise<void> {
    if (isLiveMode && supabase && this.user) {
      try {
        await supabase.from('mt5_accounts').delete().eq('id', id);
      } catch (e) {
        console.warn('Live account delete error:', e);
      }
    }
    mockStore.deleteAccount(id);
    this.accounts = mockStore.getAccounts();
    const activeId = this.getActiveAccountId();
    if (activeId === id && this.accounts.length > 0) {
      this.setActiveAccountId(this.accounts[0].id);
    }
    this.notify();
  }

  async syncLiveAccount(accountId: string) {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (!acc) return;

    if (acc.metaapiAccountId) {
      try {
        const { fetchLiveAccountInfo } = await import('./metaapi');
        const liveInfo = await fetchLiveAccountInfo(acc.metaapiAccountId);
        if (liveInfo && liveInfo.balance !== undefined) {
          if (isLiveMode && supabase) {
            await supabase
              .from('mt5_accounts')
              .update({
                balance: liveInfo.balance,
                equity: liveInfo.equity,
                free_margin: liveInfo.freeMargin,
                leverage: liveInfo.leverage,
                status: 'connected',
                last_connected_at: new Date().toISOString(),
              })
              .eq('id', accountId);
          }
          this.accounts = this.accounts.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  balance: liveInfo.balance,
                  equity: liveInfo.equity,
                  freeMargin: liveInfo.freeMargin,
                  leverage: liveInfo.leverage,
                  status: 'connected',
                }
              : a
          );
          this.notify();
        }
      } catch (err) {
        console.warn('Sync live account failed:', err);
      }
    }
  }

  async createBot(name: string, symbol: string, timeframe: string, spec: StrategySpec, mt5AccountId: string): Promise<CloudBot> {
    const created = mockStore.createBot(name, symbol, timeframe, spec, mt5AccountId);
    this.bots = mockStore.getBots();
    this.notify();

    if (isLiveMode && supabase && this.user) {
      try {
        await supabase
          .from('cloud_bots')
          .insert({
            user_id: this.user.id,
            mt5_account_id: mt5AccountId,
            name,
            symbol,
            timeframe,
            status: 'running',
            strategy_spec: spec,
          });
      } catch (err) {
        console.warn('Supabase bot sync skipped:', err);
      }
    }

    return created;
  }

  async toggleBot(botId: string, status: 'running' | 'stopped') {
    mockStore.toggleBot(botId, status);
    this.bots = mockStore.getBots();
    this.notify();

    if (isLiveMode && supabase) {
      try {
        await supabase.from('cloud_bots').update({ status }).eq('id', botId);
      } catch (err) {
        // Ignored
      }
    }
  }

  async deleteBot(botId: string) {
    mockStore.deleteBot(botId);
    this.bots = mockStore.getBots();
    this.notify();

    if (isLiveMode && supabase) {
      try {
        await supabase.from('cloud_bots').delete().eq('id', botId);
      } catch (err) {
        // Ignored
      }
    }
  }

  async addPosition(pos: Omit<Position, 'id'>): Promise<Position> {
    if (isLiveMode && supabase && this.user) {
      try {
        const { data, error } = await supabase
          .from('cloud_bot_trades')
          .insert({
            user_id: this.user.id,
            bot_id: pos.botId || null,
            mt5_account_id: pos.mt5AccountId,
            ticket: pos.ticket,
            symbol: pos.symbol,
            type: pos.type,
            volume: pos.volume,
            open_price: pos.openPrice,
            stop_loss: pos.stopLoss || null,
            take_profit: pos.takeProfit || null,
            profit: pos.profit || 0,
            status: 'open',
            open_time: pos.openTime || new Date().toISOString(),
          })
          .select()
          .single();

        if (!error && data) {
          const created: Position = {
            id: data.id,
            botId: data.bot_id || undefined,
            mt5AccountId: data.mt5_account_id,
            ticket: Number(data.ticket),
            symbol: data.symbol,
            type: data.type,
            volume: Number(data.volume),
            openPrice: Number(data.open_price),
            currentPrice: Number(data.open_price),
            stopLoss: data.stop_loss ? Number(data.stop_loss) : undefined,
            takeProfit: data.take_profit ? Number(data.take_profit) : undefined,
            profit: Number(data.profit || 0),
            openTime: data.open_time,
          };
          this.positions = [created, ...this.positions];
          this.notify();
          return created;
        }
      } catch (e) {
        console.warn('Failed to insert trade into Supabase, saving locally:', e);
      }
    }
    const created = mockStore.addPosition(pos);
    this.positions = [created, ...this.positions];
    this.notify();
    return created;
  }

  async addLog(log: Omit<BotLog, 'id' | 'createdAt'>): Promise<BotLog> {
    if (isLiveMode && supabase && this.user && log.botId) {
      try {
        const { data, error } = await supabase
          .from('cloud_bot_logs')
          .insert({
            user_id: this.user.id,
            bot_id: log.botId,
            log_type: log.type,
            message: log.message,
          })
          .select()
          .single();

        if (!error && data) {
          const created: BotLog = {
            id: data.id,
            botId: data.bot_id,
            userId: data.user_id,
            type: data.log_type,
            message: data.message,
            createdAt: data.created_at,
          };
          this.logs = [created, ...this.logs];
          this.notify();
          return created;
        }
      } catch (e) {
        console.warn('Failed to insert log into Supabase, saving locally:', e);
      }
    }
    const created = mockStore.addLog(log);
    this.logs = [created, ...this.logs];
    this.notify();
    return created;
  }

  updatePositionSL(ticket: number, newSL: number) {
    this.positions = this.positions.map((p) =>
      p.ticket === ticket ? { ...p, stopLoss: newSL } : p
    );
    this.notify();
  }

  async closePosition(posId: string) {
    if (isLiveMode && supabase) {
      await supabase
        .from('cloud_bot_trades')
        .update({ status: 'closed', close_time: new Date().toISOString(), exit_reason: 'manual' })
        .eq('id', posId);
      this.positions = this.positions.filter((p) => p.id !== posId);
      this.notify();
      return;
    }
    mockStore.closePosition(posId);
  }

  async deductAICredit() {
    if (isLiveMode && supabase && this.user) {
      const remaining = Math.max(0, this.user.aiCreditsRemaining - 1);
      await supabase
        .from('profiles')
        .update({ ai_credits_remaining: remaining })
        .eq('id', this.user.id);
      this.user = { ...this.user, aiCreditsRemaining: remaining };
      this.notify();
      return;
    }
    mockStore.deductAICredit();
  }
}

export const store = new DataService();
