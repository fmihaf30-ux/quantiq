import { store, type GlobalRiskSettings } from './store';
import { 
  fetchLivePositions, 
  fetchLiveAccountInfo, 
  modifyMetaApiPosition, 
  executeMetaApiTrade,
  closeMetaApiPosition
} from './metaapi';
import { analyzeChartImageOrCandles, sanitizeAndValidateSetups } from './chartAnalysis';
import { fetchLiveMarketPrice, formatSymbolPrice } from './livePrices';

export interface AutonomousEngineStatus {
  isRunning: boolean;
  activeAsset: string;
  statusText: string;
  lastActionTime: string;
  openTradesCount: number;
  maxTradesAllowed: number;
  protectedTradesCount: number;
  trailingProtectedCount: number;
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

    const settings = store.getRiskSettings();
    store.addLog({
      botId: 'autonomous-growth-engine',
      userId: activeAccount?.userId || 'system',
      type: 'status_change',
      message: `🚀 Autonomous Account Growth Engine ACTIVATED. Sizing: ${settings.mode === 'RISK_PCT' ? `${settings.riskPercent}% Risk` : `${settings.fixedLot} Lots`} • Order Mode: ${settings.orderDispatchMode || 'AUTO'} • Max Concurrent Trades: ${settings.maxTrades} • Step Trailing SL: ${settings.trailingStop ? 'ON' : 'OFF'} • Breakeven Guard: ON`,
    });

    this.intervalId = setInterval(() => this.runAutonomousLoop(), 8000);
    this.notify();
    this.runAutonomousLoop();
  }

  public stop() {
    if (!this.isRunning) return;
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

    const activeAccount = store.getActiveAccount();
    store.addLog({
      botId: 'autonomous-growth-engine',
      userId: activeAccount?.userId || 'system',
      type: 'status_change',
      message: '⏸️ Autonomous Account Growth Engine PAUSED by user.',
    });

    this.notify();
  }

  public toggle() {
    if (this.isRunning) this.stop();
    else this.start();
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

      // 2. SMART BREAKEVEN GUARD, STEP TRAILING SL & PARTIAL PROFIT TAKING
      if (currentPositions.length > 0) {
        // Clean up closed tickets from internal maps
        const activeTickets = new Set(currentPositions.map((p) => p.ticket));
        for (const t of Array.from(this.initialRiskDistances.keys())) {
          if (!activeTickets.has(t)) {
            this.initialRiskDistances.delete(t);
            this.initialRiskDollars.delete(t);
            this.trailingStages.delete(t);
            this.partialClosedTickets.delete(t);
            this.protectedTickets.delete(t);
          }
        }

        for (const pos of currentPositions) {
          const isBuy = pos.type === 'BUY' || String(pos.type).toLowerCase() === 'buy';
          const openPrice = pos.priceOpen || (pos as any).openPrice;
          const curPrice = pos.priceCurrent || (pos as any).currentPrice || openPrice;
          const profit = pos.profit || 0;

          const decimals = pos.symbol.includes('USD') && !pos.symbol.includes('XAU') && !pos.symbol.includes('BTC') && !pos.symbol.includes('US30') ? 4 : 2;
          const spreadBuffer = decimals === 4 ? 0.0003 : (pos.symbol.includes('BTC') ? 2.0 : 0.40);

          // Point value conversion for exact dollar risk tracking
          let pointVal = 100;
          if (pos.symbol.includes('EUR') || pos.symbol.includes('GBP') || pos.symbol.includes('USDJPY')) {
            pointVal = 100000;
          } else if (pos.symbol.includes('BTC') || pos.symbol.includes('US30')) {
            pointVal = 1;
          }

          const rawSl = pos.sl || (pos as any).stopLoss || 0;
          const rawTp = pos.tp || (pos as any).takeProfit || 0;

          // Record initial risk baseline on first discovery before SL is modified!
          if (!this.initialRiskDistances.has(pos.ticket)) {
            const calculatedDist = rawSl > 0 
              ? Math.abs(openPrice - rawSl) 
              : Math.max(decimals === 4 ? 0.0018 : 4.5, openPrice * 0.0025);

            // Only lock if the SL is well away from openPrice (i.e. not already at BE)
            if (calculatedDist > spreadBuffer * 2.5) {
              this.initialRiskDistances.set(pos.ticket, calculatedDist);
              this.initialRiskDollars.set(pos.ticket, pos.volume * pointVal * calculatedDist);
            }
          }

          const slDist = this.initialRiskDistances.get(pos.ticket) 
            || (rawSl > 0 ? Math.abs(openPrice - rawSl) : Math.max(decimals === 4 ? 0.0018 : 4.5, openPrice * 0.0025));
          const initialRiskCash = this.initialRiskDollars.get(pos.ticket) 
            || (pos.volume * pointVal * slDist);

          // Exact R Multiple Calculation:
          // If profit in cash is provided by the broker and positive, calculate via dollar ratio
          // Otherwise calculate via price displacement ratio
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
          // Default trigger is 1.0R (or user-chosen breakevenTriggerR).
          // Strictly requires currentR >= breakevenThresholdR.
          // NEVER triggers on early micro-movements (like $26 profit on $55 risk) so trade has full room to breathe!
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

      // 3. TARGET DAILY GROWTH & LOSS LIMIT PROTECTION
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

      // 4. AUTONOMOUS TRADE DISPATCH IF BELOW MAX CONCURRENT TRADES
      if (currentPositions.length < settings.maxTrades) {
        // Rotate watchlist
        this.activeAssetIndex = (this.activeAssetIndex + 1) % this.watchlist.length;
        const targetSymbol = this.watchlist[this.activeAssetIndex];

        // Check if we already have an open trade on this symbol
        const hasOpenOnSymbol = currentPositions.some((p) => p.symbol.toUpperCase().replace(/M$/, '') === targetSymbol);

        if (!hasOpenOnSymbol) {
          // A) Check Post-Trade Cooldown for this symbol (prevent overtrading churn)
          const cooldownMinutes = settings.tradeCooldownMinutes || 5;
          const cooldownMs = cooldownMinutes * 60 * 1000;
          const lastTime = this.lastTradeTimeBySymbol.get(targetSymbol) || 0;
          if (Date.now() - lastTime < cooldownMs) {
            const remMins = Math.ceil((cooldownMs - (Date.now() - lastTime)) / 60000);
            this.statusText = `${targetSymbol} in post-trade cooldown (${remMins}m remaining). Awaiting fresh market cycle...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          // B) Fetch Live Market Price and Check Spread Safety
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

          this.statusText = `Scanning institutional SMC structure for ${targetSymbol} M15...`;
          this.notify();

          // C) Deep SMC Scan: Detect Order Block Mitigation & Fair Value Gaps
          const analysis = await analyzeChartImageOrCandles({
            symbol: targetSymbol,
            timeframe: 'M15',
            userQuery: `Autonomous high-probability SMC setup scan for ${targetSymbol}. Check Fair Value Gap & Order block mitigation.`,
          });

          // D) Quality & Confidence Gating: Don't force trades on neutral or low-confidence structures
          if (analysis.bias === 'neutral' || analysis.confidence === 'low' || !analysis.setups || analysis.setups.length === 0) {
            this.statusText = `Watching ${targetSymbol} M15 — No valid Order Block mitigation yet. Awaiting liquidity sweep...`;
            this.notify();
            this.isProcessingLoop = false;
            return;
          }

          const validSetups = sanitizeAndValidateSetups(analysis.setups || [], livePrice, decimals, analysis.bias || 'bullish');

          if (validSetups && validSetups.length > 0) {
            const setup = validSetups[0];

            // E) SMART ORDER MODE SELECTION (LIMIT vs MARKET)
            // If price has expanded away from the Order Block, place a pending LIMIT order.
            // If price is actively inside/tapping the Order Block now, execute a MARKET order.
            const orderModePref = settings.orderDispatchMode || 'AUTO';
            let chosenOrderType: 'MARKET' | 'LIMIT' = 'MARKET';
            let execPrice = livePrice;
            let orderRationale = '';

            const targetEntry = setup.entry || livePrice;
            const priceDistancePct = Math.abs(livePrice - targetEntry) / livePrice;
            // Within 0.08% distance means price is actively inside the mitigation zone (~$2.20 on Gold)
            const isTappingOrderBlock = priceDistancePct <= 0.0008;

            if (orderModePref === 'LIMIT') {
              chosenOrderType = 'LIMIT';
              execPrice = targetEntry;
              orderRationale = `User Forced Limit @ Order Block Mitigation ($${formatSymbolPrice(targetSymbol, execPrice)})`;
            } else if (orderModePref === 'MARKET') {
              chosenOrderType = 'MARKET';
              execPrice = livePrice;
              orderRationale = `User Forced Market Entry @ Current Spot ($${formatSymbolPrice(targetSymbol, execPrice)})`;
            } else {
              // AUTO (AI SMC SMART ROUTING):
              if (isTappingOrderBlock) {
                chosenOrderType = 'MARKET';
                execPrice = livePrice;
                orderRationale = `SMC Tapping Zone: Price is actively inside Order Block demand/supply ($${formatSymbolPrice(targetSymbol, livePrice)}) — Instant Market Execution`;
              } else {
                chosenOrderType = 'LIMIT';
                execPrice = targetEntry;
                orderRationale = `SMC Retracement: Price is ${(priceDistancePct * 100).toFixed(2)}% away from Order Block ($${formatSymbolPrice(targetSymbol, execPrice)}) — Placed Pending Limit to avoid chasing`;
              }
            }

            // F) Protective SL and Strict 1:2.2+ R:R Take Profit
            const minSlDist = Math.max(decimals === 4 ? 0.0015 : 4.0, execPrice * 0.0025);
            let sl = setup.stopLoss;
            let tp = setup.takeProfit;

            if (setup.direction === 'buy') {
              if (!sl || sl >= execPrice) sl = execPrice - minSlDist;
              const slDist = Math.abs(execPrice - sl);
              tp = Number((execPrice + slDist * 2.2).toFixed(decimals));
              sl = Number(sl.toFixed(decimals));
            } else {
              if (!sl || sl <= execPrice) sl = execPrice + minSlDist;
              const slDist = Math.abs(sl - execPrice);
              tp = Number((execPrice - slDist * 2.2).toFixed(decimals));
              sl = Number(sl.toFixed(decimals));
            }

            // G) Dynamic Lot Sizing & Free Margin Safety Cap
            let pointValue = 100;
            let contractSize = 100; // Gold
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

            // Margin Safety Guard (never risk margin calls on small accounts)
            const freeMargin = activeAccount.freeMargin || activeAccount.balance || 80;
            const leverage = activeAccount.leverage || 200;
            const marginPerLot = (contractSize * livePrice) / leverage;
            const maxSafeLots = Math.max(0.01, parseFloat(((freeMargin * 0.28) / marginPerLot).toFixed(2)));
            if (effectiveLot > maxSafeLots) {
              effectiveLot = maxSafeLots;
            }

            // H) Save full setup to state for 100% user visibility
            this.latestSMCSetup = {
              symbol: targetSymbol,
              bias: analysis.bias,
              confidence: analysis.confidence,
              orderBlockPrice: setup.entry,
              fvgLevel: (analysis.keyLevels || []).find((k) => k.kind === 'fvg')?.price,
              entry: execPrice,
              stopLoss: sl,
              takeProfit: tp,
              orderType: chosenOrderType,
              rationale: orderRationale || setup.rationale,
              timestamp: new Date().toLocaleTimeString(),
            };

            this.statusText = `Placing Autonomous ${chosenOrderType} ${setup.direction.toUpperCase()} (${effectiveLot} Lots) on ${targetSymbol}...`;
            this.notify();

            // I) Execute order on MT5 (Market or Pending Limit)
            let ticket = Math.floor(1000000 + Math.random() * 9000000);
            try {
              const execRes = await executeMetaApiTrade({
                metaapiAccountId: activeAccount.metaapiAccountId,
                symbol: targetSymbol,
                actionType: setup.direction === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
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

            // J) Add position to store if Market order
            if (chosenOrderType === 'MARKET') {
              await store.addPosition({
                mt5AccountId: activeAccount.id,
                ticket,
                symbol: targetSymbol,
                type: setup.direction,
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
              message: `⚡ SMC AUTOPILOT: Placed ${chosenOrderType} ${setup.direction.toUpperCase()} (${effectiveLot} lots) on ${targetSymbol} @ ${formatSymbolPrice(targetSymbol, execPrice)} | SL: ${formatSymbolPrice(targetSymbol, sl)}, TP: ${formatSymbolPrice(targetSymbol, tp)} | Mode: ${orderRationale}`,
            });
          }
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
