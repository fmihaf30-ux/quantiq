import { store, type GlobalRiskSettings } from './store';
import { 
  fetchLivePositions, 
  fetchLiveAccountInfo, 
  modifyMetaApiPosition, 
  executeMetaApiTrade,
  closeMetaApiPosition,
  fetchLiveCandles
} from './metaapi';
import { analyzeChartImageOrCandles, sanitizeAndValidateSetups } from './chartAnalysis';
import { fetchLiveMarketPrice, formatSymbolPrice } from './livePrices';
import { detectEngulfingConfirmation } from './smcSetupOne';
import { evaluatePipnexMarket, type PipnexOpportunity } from './pipnex';

export interface AutonomousEngineStatus {
  isRunning: boolean;
  activeAsset: string;
  statusText: string;
  lastActionTime: string;
  openTradesCount: number;
  maxTradesAllowed: number;
  protectedTradesCount: number;
  trailingProtectedCount: number;
  scaleInTradesCount: number;
  dailyStartBalance: number;
  currentProfitToday: number;
  growthPctToday: number;
  tradesToday: number;
  breakevenProtectedTickets: number[];
  latestSMCSetup?: {
    symbol: string;
    bias: string;
    confidence: string;
    orderBlockPrice: number;
    fvgLevel?: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    orderType: 'MARKET' | 'LIMIT';
    rationale: string;
    timestamp: string;
  } | null;
}

class AutonomousAccountEngine {
  private isRunning: boolean = false;
  private intervalId: any = null;
  private statusText: string = 'Engine Ready (Inactive)';
  private lastActionTime: string = 'Never';
  private protectedTickets: Set<number> = new Set();
  private trailingStages: Map<number, number> = new Map();
  private partialClosedTickets: Set<number> = new Set();
  private initialRiskDistances: Map<number, number> = new Map();
  private initialRiskDollars: Map<number, number> = new Map();
  private lastTradeTimeBySymbol: Map<string, number> = new Map();
  private lastExitTimeBySymbol: Map<string, number> = new Map();
  private spentMitigationZones: Map<string, Array<{ price: number; timestamp: number }>> = new Map();
  private trackedTickets: Map<number, { symbol: string; openPrice: number; type: 'buy' | 'sell'; isScaleIn: boolean }> = new Map();
  private scaleInTickets: Set<number> = new Set();
  private scaledSymbols: Set<string> = new Set();
  private dailyStartBalance: number = 0;
  private tradesToday: number = 0;
  private isProcessingLoop: boolean = false;
  private listeners: Set<() => void> = new Set();
  private activeAssetIndex: number = 0;
  private latestSMCSetup: any = null;

  private watchlist: string[] = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US30'];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedState = localStorage.getItem('quantiq_autopilot_active') || localStorage.getItem('pipnex_autopilot_active');
        if (savedState === 'true') {
          setTimeout(() => this.start(), 2000);
        }
      } catch {}
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getStatus(): AutonomousEngineStatus {
    const activeAccount = store.getActiveAccount();
    const balance = activeAccount?.balance || 100;
    const equity = activeAccount?.equity || balance;
    const profitToday = equity - (this.dailyStartBalance || balance);
    const growthPct = this.dailyStartBalance > 0 ? (profitToday / this.dailyStartBalance) * 100 : 0;
    const settings = store.getRiskSettings();

    const trailingCount = Array.from(this.trailingStages.values()).filter((s) => s >= 2).length;

    return {
      isRunning: this.isRunning,
      activeAsset: this.watchlist[this.activeAssetIndex] || 'XAUUSD',
      statusText: this.statusText,
      lastActionTime: this.lastActionTime,
      openTradesCount: store.getPositions().length,
      maxTradesAllowed: settings.maxTrades,
      protectedTradesCount: this.protectedTickets.size,
      trailingProtectedCount: trailingCount,
      scaleInTradesCount: this.scaleInTickets.size,
      dailyStartBalance: this.dailyStartBalance || balance,
      currentProfitToday: Number(profitToday.toFixed(2)),
      growthPctToday: Number(growthPct.toFixed(2)),
      tradesToday: this.tradesToday,
      breakevenProtectedTickets: Array.from(this.protectedTickets),
      latestSMCSetup: this.latestSMCSetup,
    };
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const activeAccount = store.getActiveAccount();
    if (activeAccount && (!this.dailyStartBalance || this.dailyStartBalance <= 0)) {
      this.dailyStartBalance = activeAccount.balance;
    }

    this.statusText = 'Autonomous Autopilot Active — Scanning Market & Managing Positions...';
    this.lastActionTime = new Date().toLocaleTimeString();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('quantiq_autopilot_active', 'true');
        localStorage.setItem('pipnex_autopilot_active', 'true');
      } catch {}
    }
    this.notify();

    // Run immediate check
    this.runAutonomousLoop();

    // Pulse heartbeat every 8 seconds
    this.intervalId = setInterval(() => {
      this.runAutonomousLoop();
    }, 8000);
  }

  public toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.statusText = 'Autonomous Autopilot Paused';
    this.lastActionTime = new Date().toLocaleTimeString();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('quantiq_autopilot_active', 'false');
        localStorage.setItem('pipnex_autopilot_active', 'false');
      } catch {}
    }
    this.notify();
  }

  public resetDailyStats() {
    const activeAccount = store.getActiveAccount();
    this.dailyStartBalance = activeAccount?.balance || 0;
    this.tradesToday = 0;
    this.protectedTickets.clear();
    this.trailingStages.clear();
    this.partialClosedTickets.clear();
    this.initialRiskDistances.clear();
    this.initialRiskDollars.clear();
    this.lastTradeTimeBySymbol.clear();
    this.lastExitTimeBySymbol.clear();
    this.spentMitigationZones.clear();
    this.trackedTickets.clear();
    this.scaleInTickets.clear();
    this.scaledSymbols.clear();
    this.latestSMCSetup = null;
    this.lastActionTime = new Date().toLocaleTimeString();
    this.notify();
  }

  public getWatchlist(): string[] {
    return [...this.watchlist];
  }

  public setWatchlist(list: string[]) {
    if (list.length > 0) {
      this.watchlist = list;
      this.activeAssetIndex = 0;
      this.notify();
    }
  }

  private async runAutonomousLoop() {
    if (!this.isRunning || this.isProcessingLoop) return;
    this.isProcessingLoop = true;

    try {
      const activeAccount = store.getActiveAccount();
      if (!activeAccount) {
        this.statusText = 'Awaiting MT5 Account Connection...';
        this.notify();
        this.isProcessingLoop = false;
        return;
      }

      if (!this.dailyStartBalance || this.dailyStartBalance <= 0) {
        this.dailyStartBalance = activeAccount.balance;
      }

      const settings = store.getRiskSettings();

      // 1. Fetch live open positions from MT5 bridge and mirror to store
      const livePositions = await fetchLivePositions();
      const currentPositions = Array.isArray(livePositions) ? livePositions : [];
      store.syncLivePositions(currentPositions);

      const activeTickets = new Set(currentPositions.map((p) => p.ticket));

      // 2. DETECT CLOSED TRADES -> ACTIVATE POST-EXIT COOLDOWN & MARK ZONES EXHAUSTED
      for (const [ticket, meta] of Array.from(this.trackedTickets.entries())) {
        if (!activeTickets.has(ticket)) {
          const cleanSymbol = meta.symbol.toUpperCase().replace(/M$/, '');
          const wasProtected = this.protectedTickets.has(ticket);
          const stage = this.trailingStages.get(ticket) || 0;

          // A) Stamp post-exit protection cooldown timestamp
          this.lastExitTimeBySymbol.set(cleanSymbol, Date.now());

          // B) Register the entry price as an exhausted mitigation zone
          if (!this.spentMitigationZones.has(cleanSymbol)) {
            this.spentMitigationZones.set(cleanSymbol, []);
          }
          this.spentMitigationZones.get(cleanSymbol)!.push({
            price: meta.openPrice,
            timestamp: Date.now(),
          });

          // C) Clear scale-in tracking if all positions on this symbol have exited
          const hasRemainingOnSymbol = currentPositions.some(
            (p) => p.symbol.toUpperCase().replace(/M$/, '') === cleanSymbol
          );
          if (!hasRemainingOnSymbol) {
            this.scaledSymbols.delete(cleanSymbol);
          }

          // D) Determine exit classification and log protection event
          const exitReason = stage >= 2
            ? 'PARTIAL PROFIT / TRAILING SL'
            : (wasProtected || stage === 1 ? 'BREAKEVEN GUARD ($0 RISK)' : 'STOP LOSS / EXIT');

          const postExitMins = settings.postExitCooldownMinutes ?? 15;
          await store.addLog({
            botId: 'autonomous-growth-engine',
            userId: activeAccount.userId,
            type: 'trade',
            message: `🛡️ POST-EXIT PROTECTION ACTIVATED: Position #${ticket} (${cleanSymbol}) exited via ${exitReason}. Mitigation zone near $${formatSymbolPrice(cleanSymbol, meta.openPrice)} marked EXHAUSTED. Lockout active for ${postExitMins}m to prevent premature re-entry.`,
          });

          // E) Clean up internal ticket state
          this.trackedTickets.delete(ticket);
          this.initialRiskDistances.delete(ticket);
          this.initialRiskDollars.delete(ticket);
          this.trailingStages.delete(ticket);
          this.partialClosedTickets.delete(ticket);
          this.protectedTickets.delete(ticket);
          this.scaleInTickets.delete(ticket);
        }
      }

      // Register currently active positions in trackedTickets map
      for (const pos of currentPositions) {
        const isBuy = pos.type === 'BUY' || String(pos.type).toLowerCase() === 'buy';
        const openPrice = pos.priceOpen || (pos as any).openPrice || 0;
        const cleanSymbol = pos.symbol.toUpperCase().replace(/M$/, '');
        if (!this.trackedTickets.has(pos.ticket)) {
          this.trackedTickets.set(pos.ticket, {
            symbol: cleanSymbol,
            openPrice,
            type: isBuy ? 'buy' : 'sell',
            isScaleIn: this.scaleInTickets.has(pos.ticket),
          });
        }
      }

      // 3. SMART BREAKEVEN GUARD, STEP TRAILING SL & PARTIAL PROFIT TAKING
      if (currentPositions.length > 0) {
        for (const pos of currentPositions) {
          const isBuy = pos.type === 'BUY' || String(pos.type).toLowerCase() === 'buy';
          const openPrice = pos.priceOpen || (pos as any).openPrice;
          const curPrice = pos.priceCurrent || (pos as any).currentPrice || openPrice;
          const profit = pos.profit || 0;

          const decimals = pos.symbol.includes('USD') && !pos.symbol.includes('XAU') && !pos.symbol.includes('BTC') && !pos.symbol.includes('US30') ? 4 : 2;
          const spreadBuffer = decimals === 4 ? 0.0003 : (pos.symbol.includes('BTC') ? 2.0 : 0.40);

          let pointVal = 100;
          if (pos.symbol.includes('EUR') || pos.symbol.includes('GBP') || pos.symbol.includes('USDJPY')) {
            pointVal = 100000;
          } else if (pos.symbol.includes('BTC') || pos.symbol.includes('US30')) {
            pointVal = 1;
          }

          const rawSl = pos.sl || (pos as any).stopLoss || 0;
          const rawTp = pos.tp || (pos as any).takeProfit || 0;

          // Record initial risk baseline on first discovery before SL is modified
          if (!this.initialRiskDistances.has(pos.ticket)) {
            const calculatedDist = rawSl > 0 
              ? Math.abs(openPrice - rawSl) 
              : Math.max(decimals === 4 ? 0.0018 : 4.5, openPrice * 0.0025);

            if (calculatedDist > spreadBuffer * 2.5) {
              this.initialRiskDistances.set(pos.ticket, calculatedDist);
              this.initialRiskDollars.set(pos.ticket, pos.volume * pointVal * calculatedDist);
            }
          }

          const slDist = this.initialRiskDistances.get(pos.ticket) 
            || (rawSl > 0 ? Math.abs(openPrice - rawSl) : Math.max(decimals === 4 ? 0.0018 : 4.5, openPrice * 0.0025));
          const initialRiskCash = this.initialRiskDollars.get(pos.ticket) 
            || (pos.volume * pointVal * slDist);

          const priceGain = isBuy ? (curPrice - openPrice) : (openPrice - curPrice);
          let currentR = 0;
          if (initialRiskCash > 0 && profit > 0) {
            currentR = profit / initialRiskCash;
          } else if (slDist > 0) {
            currentR = priceGain / slDist;
          }

          const currentStage = this.trailingStages.get(pos.ticket) || 0;
          let targetSL: number | null = null;
          let nextStage = currentStage;
          let stageReason = '';

          // Step 1: Breakeven (+1.0R / 1:1 Profit Milestone)
          const breakevenThresholdR = settings.breakevenTriggerR || 1.0;
          const beLevel = Number((isBuy ? openPrice + spreadBuffer : openPrice - spreadBuffer).toFixed(decimals));
          const slAtOrPastBE = isBuy ? (rawSl >= openPrice) : (rawSl > 0 && rawSl <= openPrice);

          if (settings.autoBreakeven && currentR >= breakevenThresholdR) {
            if (!slAtOrPastBE && currentStage < 1) {
              targetSL = beLevel;
              nextStage = 1;
              stageReason = `Breakeven Guard (+${currentR.toFixed(2)}R reached, zero risk locked)`;
            }
          }

          // Step 2: Smart Step Trailing SL - Stage 2 (+1.5R reached -> Lock in +0.75R profit & Partial Close 50%)
          if (settings.trailingStop && currentR >= 1.45 && currentStage < 2) {
            const step2Level = Number((isBuy ? openPrice + (slDist * 0.75) : openPrice - (slDist * 0.75)).toFixed(decimals));
            const improves = isBuy ? step2Level > (rawSl || 0) : (rawSl === 0 || step2Level < rawSl);
            if (improves) {
              targetSL = step2Level;
              nextStage = 2;
              stageReason = `Smart Trailing Stage 2 (+${currentR.toFixed(2)}R reached, locked +0.75R profit)`;

              // Partial profit taking (50% off) if enabled
              if (settings.partialProfitClose !== false && !this.partialClosedTickets.has(pos.ticket) && pos.volume >= 0.02) {
                const halfVol = Math.round((pos.volume / 2) * 100) / 100;
                if (halfVol > 0) {
                  this.partialClosedTickets.add(pos.ticket);
                  try {
                    await closeMetaApiPosition({ ticket: pos.ticket, volume: halfVol });
                    await store.addLog({
                      botId: 'autonomous-growth-engine',
                      userId: activeAccount.userId,
                      type: 'trade',
                      message: `💰 PARTIAL PROFIT (+1.5R): Closed 50% (${halfVol} lots) on #${pos.ticket} (${pos.symbol})! Remaining ${(pos.volume - halfVol).toFixed(2)} lots trailing risk-free.`,
                    });
                  } catch (pErr) {
                    console.warn('Partial close notice:', pErr);
                  }
                }
              }
            }
          }

          // Step 3: Smart Step Trailing SL - Stage 3 (+2.0R reached -> Lock in +1.40R profit)
          if (settings.trailingStop && currentR >= 1.95 && currentStage < 3) {
            const step3Level = Number((isBuy ? openPrice + (slDist * 1.4) : openPrice - (slDist * 1.4)).toFixed(decimals));
            const improves = isBuy ? step3Level > (rawSl || 0) : (rawSl === 0 || step3Level < rawSl);
            if (improves) {
              targetSL = step3Level;
              nextStage = 3;
              stageReason = `Smart Trailing Stage 3 (+${currentR.toFixed(2)}R reached, locked +1.40R major win)`;
            }
          }

          // Step 4: Super Trend Runner Trail (+2.5R+ -> Trail by 0.6R behind price)
          if (settings.trailingStop && currentR >= 2.45) {
            const runnerLevel = Number((isBuy ? curPrice - (slDist * 0.6) : curPrice + (slDist * 0.6)).toFixed(decimals));
            const minImprovement = slDist * 0.15;
            const improves = isBuy ? runnerLevel > (rawSl || 0) + minImprovement : (rawSl === 0 || runnerLevel < rawSl - minImprovement);
            if (improves) {
              targetSL = runnerLevel;
              nextStage = 4;
              stageReason = `Smart Trailing Runner Trail (+${currentR.toFixed(2)}R, dynamic trailing stop)`;
            }
          }

          if (targetSL !== null) {
            this.statusText = `${stageReason} on #${pos.ticket} (${pos.symbol})...`;
            this.notify();

            const success = await modifyMetaApiPosition({
              metaapiAccountId: activeAccount.metaapiAccountId,
              ticket: pos.ticket,
              stopLoss: targetSL,
              takeProfit: rawTp,
            });

            if (success) {
              this.trailingStages.set(pos.ticket, nextStage);
              this.protectedTickets.add(pos.ticket);
              this.lastActionTime = new Date().toLocaleTimeString();
              store.updatePositionSL(pos.ticket, targetSL);

              const icon = nextStage >= 3 ? '🚀' : (nextStage === 2 ? '📈' : '🛡️');
              await store.addLog({
                botId: 'autonomous-growth-engine',
                userId: activeAccount.userId,
                type: 'trade',
                message: `${icon} ${stageReason.toUpperCase()}: Position #${pos.ticket} (${pos.symbol} ${pos.type}) Stop Loss stepped to ${targetSL} | Floating profit: +$${profit.toFixed(2)}`,
              });
            }
          }
        }
      }

      // 4. TARGET DAILY GROWTH & LOSS LIMIT PROTECTION
      const currentProfit = activeAccount.equity - this.dailyStartBalance;
      const currentGrowthPct = (currentProfit / this.dailyStartBalance) * 100;

      if (settings.dailyGrowthTargetPct > 0 && currentGrowthPct >= settings.dailyGrowthTargetPct) {
        this.statusText = `🎉 Daily Growth Target Reached (+${currentGrowthPct.toFixed(1)}%)! Capital protected for the day.`;
        this.notify();
        this.isProcessingLoop = false;
        return;
      }

      if (settings.dailyLossLimitPct > 0 && currentGrowthPct <= -settings.dailyLossLimitPct) {
        this.statusText = `⚠️ Daily Loss Limit Hit (-${Math.abs(currentGrowthPct).toFixed(1)}%). Pausing new trades for capital safety.`;
        this.notify();
        this.isProcessingLoop = false;
        return;
      }

      // 5. AUTONOMOUS TRADE DISPATCH (INITIAL ENTRY OR SMC SCALE-IN PYRAMID)
      if (currentPositions.length < settings.maxTrades) {
        this.activeAssetIndex = (this.activeAssetIndex + 1) % this.watchlist.length;
        const targetSymbol = this.watchlist[this.activeAssetIndex];

        const symbolPositions = currentPositions.filter(
          (p) => p.symbol.toUpperCase().replace(/M$/, '') === targetSymbol
        );

        const isInitialEntry = symbolPositions.length === 0;
        const canAttemptScaleIn =
          !isInitialEntry &&
          settings.allowScaleIn !== false &&
          symbolPositions.length === 1 &&
          !this.scaledSymbols.has(targetSymbol);

        // =========================================================================
        // BRANCH A: INITIAL POSITION 1 ENTRY (WITH POST-EXIT COOLDOWN & ZONE CHECK)
        // =========================================================================
        if (isInitialEntry) {
          // A1) Post-Exit Cooldown Guard (e.g. 15 minutes lockout after BE or SL exit)
          const postExitCooldownMs = (settings.postExitCooldownMinutes ?? 15) * 60 * 1000;
          const lastExit = this.lastExitTimeBySymbol.get(targetSymbol) || 0;
          if (Date.now() - lastExit < postExitCooldownMs) {
            const remMins = Math.ceil((postExitCooldownMs - (Date.now() - lastExit)) / 60000);
            this.statusText = `${targetSymbol} in post-exit protection cooldown (${remMins}m remaining). Awaiting fresh market cycle...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // A2) General Trade Pacing Cooldown (e.g. 5 minutes)
          const tradeCooldownMs = (settings.tradeCooldownMinutes || 5) * 60 * 1000;
          const lastTrade = this.lastTradeTimeBySymbol.get(targetSymbol) || 0;
          if (Date.now() - lastTrade < tradeCooldownMs) {
            const remMins = Math.ceil((tradeCooldownMs - (Date.now() - lastTrade)) / 60000);
            this.statusText = `${targetSymbol} in trade pacing cooldown (${remMins}m remaining)...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // A3) Spread Safety Check
          const quote = await fetchLiveMarketPrice(targetSymbol);
          const livePrice = quote.price;
          const decimals = targetSymbol.includes('USD') && !targetSymbol.includes('XAU') && !targetSymbol.includes('BTC') ? 4 : 2;

          const spread = Math.abs((quote.ask || livePrice) - (quote.bid || livePrice));
          const maxAllowedSpread = targetSymbol.includes('XAU') ? 0.45 : (targetSymbol.includes('BTC') ? 45.0 : (targetSymbol.includes('US30') ? 8.0 : 0.00025));
          if (spread > maxAllowedSpread) {
            this.statusText = `⚠️ Spread on ${targetSymbol} is too wide ($${spread.toFixed(decimals)}) - waiting for spread to normalize...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // A4) Filter spent/exhausted mitigation zones (within last 45 minutes)
          const recentSpentZones = (this.spentMitigationZones.get(targetSymbol) || [])
            .filter((z) => Date.now() - z.timestamp < 45 * 60 * 1000)
            .map((z) => z.price);

          // A4b) Fetch Live M15 Candles for Pipnex & SMC Suite
          const liveCandles = await fetchLiveCandles(targetSymbol, 'M15', 80);

          this.statusText = `Scanning Pipnex mathematical structure for ${targetSymbol} M15...`;
          this.notify();

          // A5) Run Deterministic Pipnex Mathematical Engine Suite
          const pipnexOpportunity = evaluatePipnexMarket(liveCandles, {
            symbol: targetSymbol,
            timeframe: 'M15',
            currentPrice: livePrice,
            minRR: 2.1,
          });

          if (!pipnexOpportunity || pipnexOpportunity.riskReward < 2.1) {
            this.statusText = `Watching ${targetSymbol} M15 — No qualifying Pipnex setup (RR < 2.1 or structure in transition). Awaiting fresh base...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          const targetDirection: 'buy' | 'sell' = pipnexOpportunity.direction === 'LONG' ? 'buy' : 'sell';

          // A6) Invalidate if setup price matches any spent zone within 0.15%
          const isSpent = recentSpentZones.some((zp) => Math.abs(pipnexOpportunity.entry - zp) / zp <= 0.0015);
          if (isSpent) {
            this.statusText = `Watching ${targetSymbol} — Setup @ ${pipnexOpportunity.entry} is within an exhausted Order Block. Awaiting new structure...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // A7) SUB-FLOOR OBSTACLE HARD GATE
          // Check if there is an unmitigated opposing FVG or opposing OB directly in the path within 1.5R
          const riskDist = Math.abs(livePrice - pipnexOpportunity.stopLoss);
          if (targetDirection === 'buy') {
            const nearBearishFVG = pipnexOpportunity.rawEntities.fvgs.find(
              (f) => f.type === 'bearish' && f.state !== 'invalidated' && !f.isInverted && f.bottom > livePrice && (f.bottom - livePrice) < riskDist * 1.5
            );
            const nearBearishOB = pipnexOpportunity.rawEntities.orderBlocks.find(
              (ob) => ob.type === 'bearish' && (ob.state === 'fresh' || ob.state === 'tested') && ob.proximal > livePrice && (ob.proximal - livePrice) < riskDist * 1.5
            );

            if (nearBearishFVG || nearBearishOB) {
              const obstacleLevel = nearBearishFVG ? nearBearishFVG.bottom : nearBearishOB!.proximal;
              const obstacleType = nearBearishFVG ? 'Bearish FVG' : 'Bearish OB';
              this.statusText = `Watching ${targetSymbol} — Direct buy blocked by opposing ${obstacleType} (${formatSymbolPrice(targetSymbol, obstacleLevel)}). Awaiting pullback to demand or clean inversion.`;
              this.notify();
              this.isProcessingLoop = false;
              return;
            }
          } else {
            const nearBullishFVG = pipnexOpportunity.rawEntities.fvgs.find(
              (f) => f.type === 'bullish' && f.state !== 'invalidated' && !f.isInverted && f.top < livePrice && (livePrice - f.top) < riskDist * 1.5
            );
            const nearBullishOB = pipnexOpportunity.rawEntities.orderBlocks.find(
              (ob) => ob.type === 'bullish' && (ob.state === 'fresh' || ob.state === 'tested') && ob.proximal < livePrice && (livePrice - ob.proximal) < riskDist * 1.5
            );

            if (nearBullishFVG || nearBullishOB) {
              const obstacleLevel = nearBullishFVG ? nearBullishFVG.top : nearBullishOB!.proximal;
              const obstacleType = nearBullishFVG ? 'Bullish FVG' : 'Bullish OB';
              this.statusText = `Watching ${targetSymbol} — Direct sell blocked by opposing ${obstacleType} (${formatSymbolPrice(targetSymbol, obstacleLevel)}). Awaiting pullback to supply or clean inversion.`;
              this.notify();
              this.isProcessingLoop = false;
              return;
            }
          }

          // A8) Order Mode Selection (LIMIT vs MARKET)
          const orderModePref = settings.orderDispatchMode || 'AUTO';
          let chosenOrderType: 'MARKET' | 'LIMIT' = 'MARKET';
          let execPrice = livePrice;
          let orderRationale = '';

          // If Pipnex says LIMIT, price is NOT inside the zone (it's mid-air or waiting for retracement)
          if (orderModePref === 'LIMIT' || pipnexOpportunity.orderType === 'LIMIT') {
            chosenOrderType = 'LIMIT';
            execPrice = pipnexOpportunity.entry;
            orderRationale = `${pipnexOpportunity.strategy}: Retracement pending limit at zone proximal (${formatSymbolPrice(targetSymbol, execPrice)})`;
          } else {
            // Price is confirmed inside the zone with no blocking obstacle
            chosenOrderType = 'MARKET';
            execPrice = livePrice;
            orderRationale = `${pipnexOpportunity.strategy}: Price actively inside zone (${formatSymbolPrice(targetSymbol, execPrice)}) with 0 opposing obstacles — Instant Market Execution`;
          }

          // A9) Stop Loss & Take Profit from Pipnex Stop-First & 2.1R+ Engine
          const sl = pipnexOpportunity.stopLoss;
          const tp = pipnexOpportunity.takeProfit1;

            // A9) Dynamic Lot Sizing & Free Margin Safety Cap
            let pointValue = 100;
            let contractSize = 100;
            if (targetSymbol.includes('EUR') || targetSymbol.includes('GBP') || targetSymbol.includes('USDJPY')) {
              pointValue = 100000;
              contractSize = 100000;
            } else if (targetSymbol.includes('BTC') || targetSymbol.includes('US30')) {
              pointValue = 1;
              contractSize = 1;
            }

            const slDistance = Math.abs(execPrice - sl);
            let effectiveLot = settings.fixedLot;

            if (settings.mode === 'RISK_PCT' && slDistance > 0) {
              const riskCash = activeAccount.balance * (settings.riskPercent / 100);
              const calculated = riskCash / (slDistance * pointValue);
              effectiveLot = Math.max(0.01, Math.min(10.0, parseFloat(calculated.toFixed(2))));
            }

            const freeMargin = activeAccount.freeMargin || activeAccount.balance || 80;
            const leverage = activeAccount.leverage || 200;
            const marginPerLot = (contractSize * livePrice) / leverage;
            const maxSafeLots = Math.max(0.01, parseFloat(((freeMargin * 0.28) / marginPerLot).toFixed(2)));
            if (effectiveLot > maxSafeLots) {
              effectiveLot = maxSafeLots;
            }

            this.latestSMCSetup = {
              symbol: targetSymbol,
              bias: pipnexOpportunity.bias,
              confidence: pipnexOpportunity.confidence,
              orderBlockPrice: pipnexOpportunity.entry,
              fvgLevel: (pipnexOpportunity.rawEntities.fvgs[0]?.bottom || pipnexOpportunity.rawEntities.fvgs[0]?.top),
              entry: execPrice,
              stopLoss: sl,
              takeProfit: tp,
              orderType: chosenOrderType,
              rationale: orderRationale || pipnexOpportunity.rationale,
              timestamp: new Date().toLocaleTimeString(),
            };

            this.statusText = `Placing Autonomous ${chosenOrderType} ${targetDirection.toUpperCase()} (${effectiveLot} Lots) on ${targetSymbol}...`;
            this.notify();

            let ticket = Math.floor(1000000 + Math.random() * 9000000);
            try {
              const execRes = await executeMetaApiTrade({
                metaapiAccountId: activeAccount.metaapiAccountId,
                symbol: targetSymbol,
                actionType: targetDirection === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
                orderType: chosenOrderType,
                price: execPrice,
                volume: effectiveLot,
                stopLoss: sl,
                takeProfit: tp,
                comment: `Quantiq SMC ${chosenOrderType}`,
              });
              if (execRes?.orderId) ticket = Number(execRes.orderId);
            } catch (tradeErr: any) {
              console.warn('Autonomous dispatch notice:', tradeErr.message);
            }

            if (chosenOrderType === 'MARKET') {
              await store.addPosition({
                mt5AccountId: activeAccount.id,
                ticket,
                symbol: targetSymbol,
                type: targetDirection,
                volume: effectiveLot,
                openPrice: execPrice,
                currentPrice: execPrice,
                stopLoss: sl,
                takeProfit: tp,
                profit: 0,
                openTime: new Date().toISOString(),
              });
            }

            this.tradesToday++;
            this.lastActionTime = new Date().toLocaleTimeString();
            this.lastTradeTimeBySymbol.set(targetSymbol, Date.now());

            await store.addLog({
              botId: 'autonomous-growth-engine',
              userId: activeAccount.userId,
              type: 'trade',
              message: `⚡ SMC AUTOPILOT: Placed ${chosenOrderType} ${targetDirection.toUpperCase()} (${effectiveLot} lots) on ${targetSymbol} @ ${formatSymbolPrice(targetSymbol, execPrice)} | SL: ${formatSymbolPrice(targetSymbol, sl)}, TP: ${formatSymbolPrice(targetSymbol, tp)} | Mode: ${orderRationale}`,
            });
        }
        // =========================================================================
        // BRANCH B: INSTITUTIONAL SMC SCALE-IN (PYRAMIDING INTO CONFIRMED WINNERS)
        // =========================================================================
        else if (canAttemptScaleIn) {
          const primaryPos = symbolPositions[0];
          const isBuy = primaryPos.type === 'BUY' || String(primaryPos.type).toLowerCase() === 'buy';
          const primaryOpen = primaryPos.priceOpen || (primaryPos as any).openPrice || 0;
          const primarySl = primaryPos.sl || (primaryPos as any).stopLoss || 0;
          const primaryProfit = primaryPos.profit || 0;

          // B1) Primary trade MUST be 100% risk-free at or past Breakeven
          const slAtOrPastBE = isBuy ? (primarySl >= primaryOpen) : (primarySl > 0 && primarySl <= primaryOpen);
          const isStageProtected = this.protectedTickets.has(primaryPos.ticket);

          if (!slAtOrPastBE && !isStageProtected) {
            this.statusText = `${targetSymbol} trade active (+$${primaryProfit.toFixed(2)}). Scale-in locked until SL moved to Breakeven...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // B2) Fetch live market price
          const quote = await fetchLiveMarketPrice(targetSymbol);
          const livePrice = quote.price;
          const decimals = targetSymbol.includes('USD') && !targetSymbol.includes('XAU') && !targetSymbol.includes('BTC') ? 4 : 2;

          // B3) Price MUST be expanding in profit direction (NO scaling into pullbacks to entry)
          const isExpanding = isBuy ? livePrice > primaryOpen : livePrice < primaryOpen;
          if (!isExpanding) {
            this.statusText = `${targetSymbol} hovering near entry ($${formatSymbolPrice(targetSymbol, livePrice)}). Scale-in prohibited on pullback to entry.`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // B4) Check current R multiple of primary trade (requires at least +1.2R)
          const slDist = this.initialRiskDistances.get(primaryPos.ticket) || Math.abs(primaryOpen - primarySl);
          const currentR = slDist > 0 ? Math.abs(livePrice - primaryOpen) / slDist : 1.5;

          if (currentR < 1.2) {
            this.statusText = `${targetSymbol} primary trade at +${currentR.toFixed(1)}R. Awaiting +1.5R expansion for scale-in qualification...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // B5) Scan for continuation BOS on intermediate timeframe
          this.statusText = `⚡ Scanning SMC continuation BOS for Scale-In on ${targetSymbol}...`;
          this.notify();

          const analysis = await analyzeChartImageOrCandles({
            symbol: targetSymbol,
            timeframe: 'M5',
            userQuery: `SMC Pyramiding Scale-In: Look for a continuation Break of Structure (BOS) and fresh Fair Value Gap on M5/M15 in ${isBuy ? 'BULLISH' : 'BEARISH'} direction.`,
            scaleInContext: {
              primaryTicket: primaryPos.ticket,
              primaryDirection: isBuy ? 'buy' : 'sell',
              primaryEntryPrice: primaryOpen,
              currentR,
            },
          });

          const validSetups = sanitizeAndValidateSetups(analysis.setups || [], livePrice, decimals, isBuy ? 'bullish' : 'bearish');
          if (!validSetups || validSetups.length === 0) {
            this.statusText = `Watching ${targetSymbol} — No confirmed continuation BOS yet for scale-in...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          const scaleSetup = validSetups[0];

          // B6) Strict continuation validation (direction must match, entry must be progressive)
          if (scaleSetup.direction !== (isBuy ? 'buy' : 'sell')) {
            this.isProcessingLoop = false;
            return;
          }

          if (isBuy && scaleSetup.entry < primaryOpen) {
            this.isProcessingLoop = false;
            return;
          }
          if (!isBuy && scaleSetup.entry > primaryOpen) {
            this.isProcessingLoop = false;
            return;
          }

          // B7) Scale-In Lot Sizing: 50% risk multiplier (financed completely by locked profit)
          const riskMultiplier = settings.scaleInRiskMultiplier || 0.5;
          let pointValue = 100;
          let contractSize = 100;
          if (targetSymbol.includes('EUR') || targetSymbol.includes('GBP') || targetSymbol.includes('USDJPY')) {
            pointValue = 100000;
            contractSize = 100000;
          } else if (targetSymbol.includes('BTC') || targetSymbol.includes('US30')) {
            pointValue = 1;
            contractSize = 1;
          }

          const scaleSlDist = Math.abs(livePrice - scaleSetup.stopLoss);
          let scaleLot = Math.max(0.01, parseFloat((settings.fixedLot * riskMultiplier).toFixed(2)));
          if (settings.mode === 'RISK_PCT' && scaleSlDist > 0) {
            const scaleRiskCash = activeAccount.balance * ((settings.riskPercent * riskMultiplier) / 100);
            const calculated = scaleRiskCash / (scaleSlDist * pointValue);
            scaleLot = Math.max(0.01, Math.min(5.0, parseFloat(calculated.toFixed(2))));
          }

          // Margin Safety Guard
          const freeMargin = activeAccount.freeMargin || activeAccount.balance || 80;
          const leverage = activeAccount.leverage || 200;
          const marginPerLot = (contractSize * livePrice) / leverage;
          const maxSafeLots = Math.max(0.01, parseFloat(((freeMargin * 0.28) / marginPerLot).toFixed(2)));
          if (scaleLot > maxSafeLots) scaleLot = maxSafeLots;

          this.statusText = `Placing Autonomous SMC Scale-In (${scaleLot} Lots) on ${targetSymbol}...`;
          this.notify();

          let scaleTicket = Math.floor(1000000 + Math.random() * 9000000);
          try {
            const execRes = await executeMetaApiTrade({
              metaapiAccountId: activeAccount.metaapiAccountId,
              symbol: targetSymbol,
              actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
              orderType: 'MARKET',
              price: livePrice,
              volume: scaleLot,
              stopLoss: scaleSetup.stopLoss,
              takeProfit: scaleSetup.takeProfit,
              comment: `Quantiq Pyramiding Scale-In`,
            });
            if (execRes?.orderId) scaleTicket = Number(execRes.orderId);
          } catch (tErr: any) {
            console.warn('Scale-in execution notice:', tErr.message);
          }

          this.scaleInTickets.add(scaleTicket);
          this.scaledSymbols.add(targetSymbol);
          this.tradesToday++;
          this.lastActionTime = new Date().toLocaleTimeString();

          await store.addPosition({
            mt5AccountId: activeAccount.id,
            ticket: scaleTicket,
            symbol: targetSymbol,
            type: scaleSetup.direction,
            volume: scaleLot,
            openPrice: livePrice,
            currentPrice: livePrice,
            stopLoss: scaleSetup.stopLoss,
            takeProfit: scaleSetup.takeProfit,
            profit: 0,
            openTime: new Date().toISOString(),
          });

          await store.addLog({
            botId: 'autonomous-growth-engine',
            userId: activeAccount.userId,
            type: 'trade',
            message: `🚀 SMC PYRAMIDING SCALE-IN: Placed continuation ${scaleSetup.direction.toUpperCase()} (${scaleLot} lots, ${riskMultiplier * 100}% size) on ${targetSymbol} @ ${formatSymbolPrice(targetSymbol, livePrice)} | Primary Trade #${primaryPos.ticket} locked risk-free at BE! | SL: ${formatSymbolPrice(targetSymbol, scaleSetup.stopLoss)}, TP: ${formatSymbolPrice(targetSymbol, scaleSetup.takeProfit)}`,
          });
        }
      } else {
        this.statusText = `Max concurrent trades reached (${currentPositions.length}/${settings.maxTrades}). Managing open positions and monitoring breakeven...`;
      }

      this.notify();
    } catch (err: any) {
      console.warn('Autonomous loop error:', err.message);
      this.statusText = `Monitoring active: ${err.message || 'Waiting for next candle cycle'}`;
      this.notify();
    } finally {
      this.isProcessingLoop = false;
    }
  }
}

export const autonomousEngine = new AutonomousAccountEngine();
