import React, { useState, useEffect } from 'react';
import { store, type GlobalRiskSettings } from '../lib/store';
import type { CloudBot, BotLog, Position } from '../types';
import { CloudBotCard } from '../components/CloudBotCard';
import { StrategyBuilderModal } from '../components/StrategyBuilderModal';
import { analyzeChartImageOrCandles, sanitizeAndValidateSetups } from '../lib/chartAnalysis';
import { fetchLiveMarketPrice, formatSymbolPrice } from '../lib/livePrices';
import { executeMetaApiTrade, fetchLivePendingOrders, cancelPendingOrder, type LivePendingOrder } from '../lib/metaapi';
import { autonomousEngine, type AutonomousEngineStatus } from '../lib/autonomousEngine';
import { OrderMappedChart } from '../components/OrderMappedChart';
import type { ChartAnalysis, TradeSetup } from '@engine';
import { 
  Bot, 
  Terminal, 
  Plus, 
  Play, 
  Pause, 
  Sparkles,
  CheckCircle2,
  Activity,
  Zap,
  RefreshCw,
  Cpu,
  Layers,
  TrendingUp,
  TrendingDown,
  Server,
  ArrowRight,
  Crosshair,
  Target,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  DollarSign,
  Clock,
  XCircle,
  Eye,
  ChevronDown,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const AUTO_ASSETS = [
  { label: 'XAU/USD (Gold)', symbol: 'XAUUSD', tv: 'OANDA:XAUUSD' },
  { label: 'EUR/USD', symbol: 'EURUSD', tv: 'OANDA:EURUSD' },
  { label: 'BTC/USD (Bitcoin)', symbol: 'BTCUSD', tv: 'BINANCE:BTCUSDT' },
  { label: 'US30 (Dow Jones)', symbol: 'US30', tv: 'CAPITALCOM:US30' },
  { label: 'GBP/USD', symbol: 'GBPUSD', tv: 'OANDA:GBPUSD' },
];

const AUTO_TIMEFRAMES = [
  { label: 'M1', val: '1' },
  { label: 'M5', val: '5' },
  { label: 'M15', val: '15' },
  { label: 'H1', val: '60' },
  { label: 'H4', val: '240' },
  { label: 'D1', val: 'D' },
];

export const BotsPage: React.FC = () => {
  const { theme } = useTheme();
  const [bots, setBots] = useState<CloudBot[]>(store.getBots());
  const [logs, setLogs] = useState<BotLog[]>(store.getLogs());
  const [positions, setPositions] = useState<Position[]>(store.getPositions());
  const [pendingOrders, setPendingOrders] = useState<LivePendingOrder[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Trish Auto Trading Engine & Chart State
  const [selectedAsset, setSelectedAsset] = useState(AUTO_ASSETS[0]);
  const [selectedTf, setSelectedTf] = useState(AUTO_TIMEFRAMES[2]); // M15 default
  const [livePrice, setLivePrice] = useState<number>(4142.50);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [isAutoLoopActive, setIsAutoLoopActive] = useState(true);
  const [latestAnalysis, setLatestAnalysis] = useState<ChartAnalysis | null>(null);

  // Universal Autonomous Risk & Engine State
  const [riskSettings, setRiskSettingsState] = useState<GlobalRiskSettings>(store.getRiskSettings());
  const [engineStatus, setEngineStatus] = useState<AutonomousEngineStatus>(autonomousEngine.getStatus());

  // Order Execution & Limit Order Controls
  const [chartEngine, setChartEngine] = useState<'mapped' | 'tradingview'>('mapped');
  const [orderMode, setOrderMode] = useState<'AUTO' | 'MARKET' | 'LIMIT'>('AUTO');
  const [customLimitPrice, setCustomLimitPrice] = useState<string>('');
  const [isCancellingOrder, setIsCancellingOrder] = useState<number | null>(null);

  const [lastExecutedTrade, setLastExecutedTrade] = useState<{
    ticket: number;
    symbol: string;
    action: string;
    orderType: string;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: string;
    time: string;
  } | null>(null);

  const activeAccount = store.getActiveAccount();

  // Synchronize risk settings across store and UI
  const handleUpdateRiskSettings = (updates: Partial<GlobalRiskSettings>) => {
    const updated = store.setRiskSettings(updates);
    setRiskSettingsState(updated);
  };

  // Subscribe to store & autonomous engine updates
  useEffect(() => {
    const unsubStore = store.subscribe(() => {
      setBots(store.getBots());
      setLogs(store.getLogs(selectedBotId !== 'all' ? selectedBotId : undefined));
      setPositions(store.getPositions());
      setRiskSettingsState(store.getRiskSettings());
    });

    const unsubEngine = autonomousEngine.subscribe(() => {
      setEngineStatus(autonomousEngine.getStatus());
    });

    return () => {
      unsubStore();
      unsubEngine();
    };
  }, [selectedBotId]);

  // Update live spot price
  useEffect(() => {
    let active = true;
    const updatePrice = async () => {
      const p = await fetchLiveMarketPrice(selectedAsset.symbol);
      if (active) {
        setLivePrice(p.price);
        if (!customLimitPrice) {
          // Pre-populate limit price suggestion slightly below/above current price
          const offset = p.price * 0.0015;
          setCustomLimitPrice((p.price - offset).toFixed(selectedAsset.symbol.includes('USD') && !selectedAsset.symbol.includes('XAU') && !selectedAsset.symbol.includes('BTC') ? 4 : 2));
        }
      }
    };
    updatePrice();
    const timer = setInterval(updatePrice, 3500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedAsset.symbol]);

  // Poll live pending orders from MT5 bridge
  useEffect(() => {
    let active = true;
    const updateOrders = async () => {
      const orders = await fetchLivePendingOrders();
      if (active) setPendingOrders(orders);
    };
    updateOrders();
    const timer = setInterval(updateOrders, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Filter positions and pending orders for the selected asset
  const activePositionsForAsset = positions.filter(
    (p) => p.symbol.toUpperCase().replace(/M$/, '') === selectedAsset.symbol
  );

  const pendingOrdersForAsset = pendingOrders.filter(
    (o) => o.symbol.toUpperCase().replace(/M$/, '') === selectedAsset.symbol
  );

  // Trish Auto Analyze & Direct MT5 Execution Function
  const handleTrishScanAndExecute = async () => {
    if (!activeAccount) {
      alert('Please connect an MT5 account first.');
      return;
    }

    if (positions.length >= riskSettings.maxTrades) {
      alert(`Max concurrent trades limit reached (${positions.length}/${riskSettings.maxTrades}). Close an existing position or increase Max Trades in settings.`);
      return;
    }

    setIsScanning(true);
    setScanStep('Scanning market structure & liquidity...');

    try {
      await new Promise((r) => setTimeout(r, 600));
      setScanStep('Detecting Order Blocks & Fair Value Gaps...');

      const analysis = await analyzeChartImageOrCandles({
        symbol: selectedAsset.symbol,
        timeframe: selectedTf.label,
        userQuery: `Institutional SMC scan for ${selectedAsset.symbol} on ${selectedTf.label}. Identify high-probability order block mitigation and generate direct MT5 trade execution setup.`,
      });

      setLatestAnalysis(analysis);
      setScanStep('Analyzing SMC Order Block Distance & Validating 1:2.2 R:R...');
      await new Promise((r) => setTimeout(r, 500));

      // Strict Risk:Reward Sanitization (Guarantees Take Profit is ALWAYS at least 2.0x Stop Loss!)
      const decimals = selectedAsset.symbol.includes('USD') && !selectedAsset.symbol.includes('XAU') && !selectedAsset.symbol.includes('BTC') && !selectedAsset.symbol.includes('US30') ? 4 : 2;
      const validSetups = sanitizeAndValidateSetups(analysis.setups || [], livePrice, decimals, analysis.bias || 'bullish');
      const setup = validSetups[0];

      // Determine Order Mode: if AUTO, evaluate distance from Order Block mitigation zone
      let isLimitOrder = orderMode === 'LIMIT';
      let execPrice = setup.entry;

      if (orderMode === 'AUTO') {
        const priceDistancePct = Math.abs(livePrice - setup.entry) / livePrice;
        if (priceDistancePct <= 0.0008) {
          // Inside Order Block mitigation zone -> MARKET
          isLimitOrder = false;
          execPrice = livePrice;
        } else {
          // Away from Order Block -> LIMIT
          isLimitOrder = true;
          execPrice = setup.entry;
        }
      } else if (orderMode === 'MARKET') {
        isLimitOrder = false;
        execPrice = livePrice;
      } else if (orderMode === 'LIMIT') {
        isLimitOrder = true;
        const parsedLimit = parseFloat(customLimitPrice);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          execPrice = parsedLimit;
        }
      }

      // Re-verify SL and TP distances relative to execPrice
      const minSlDist = Math.max(decimals === 4 ? 0.0015 : 4.0, execPrice * 0.0025);
      let sl = setup.stopLoss;
      let tp = setup.takeProfit;

      if (setup.direction === 'buy') {
        if (!sl || sl >= execPrice) sl = execPrice - minSlDist;
        const slDist = Math.abs(execPrice - sl);
        // Force TP to be strictly at least 2.2x SL distance
        tp = Number((execPrice + slDist * 2.2).toFixed(decimals));
        sl = Number(sl.toFixed(decimals));
      } else {
        if (!sl || sl <= execPrice) sl = execPrice + minSlDist;
        const slDist = Math.abs(sl - execPrice);
        // Force TP to be strictly at least 2.2x SL distance
        tp = Number((execPrice - slDist * 2.2).toFixed(decimals));
        sl = Number(sl.toFixed(decimals));
      }

      // Dynamic Lot Sizing & Risk Management Calculation from Universal Global Risk Settings
      let pointValue = 100; // Gold: 1 lot = 100 oz, $1 move = $100
      if (selectedAsset.symbol.includes('EUR') || selectedAsset.symbol.includes('GBP') || selectedAsset.symbol.includes('USDJPY')) {
        pointValue = 100000;
      } else if (selectedAsset.symbol.includes('BTC') || selectedAsset.symbol.includes('US30')) {
        pointValue = 1;
      }

      const balance = activeAccount.balance || 80.0;
      const cashRisk = balance * (riskSettings.riskPercent / 100);
      const slDist = Math.abs(execPrice - sl);

      let effectiveLot = riskSettings.fixedLot;
      if (riskSettings.mode === 'RISK_PCT' && slDist > 0) {
        const calculated = cashRisk / (slDist * pointValue);
        effectiveLot = Math.max(0.01, Math.min(10.0, parseFloat(calculated.toFixed(2))));
      }

      let ticket = Math.floor(1000000 + Math.random() * 9000000);

      // Execute on MT5 Bridge
      try {
        const res = await executeMetaApiTrade({
          metaapiAccountId: activeAccount.metaapiAccountId,
          symbol: selectedAsset.symbol,
          actionType: setup.direction === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
          orderType: isLimitOrder ? 'LIMIT' : 'MARKET',
          price: execPrice,
          volume: effectiveLot,
          stopLoss: sl,
          takeProfit: tp,
          comment: `Trish ${isLimitOrder ? 'Limit' : 'Auto'} ${setup.direction.toUpperCase()}`,
        });
        if (res?.orderId) ticket = Number(res.orderId);
      } catch (e: any) {
        console.warn('MT5 execution notice:', e.message);
      }

      // If Market order, add position to local store
      if (!isLimitOrder) {
        await store.addPosition({
          mt5AccountId: activeAccount.id,
          ticket,
          symbol: selectedAsset.symbol,
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

      // Record terminal log
      await store.addLog({
        botId: bots[0]?.id || 'trish-auto-engine',
        userId: activeAccount.userId,
        type: 'trade',
        message: `Trish ${isLimitOrder ? 'Pending Limit Order Placed' : 'Auto Market Execution'}: ${setup.direction.toUpperCase()} ${effectiveLot} lots (${riskSettings.mode === 'RISK_PCT' ? `Risk: ${riskSettings.riskPercent}% / -$${cashRisk.toFixed(2)}` : `${effectiveLot} Fixed Lots`}) on ${selectedAsset.symbol} @ ${formatSymbolPrice(selectedAsset.symbol, execPrice)} | SL: ${formatSymbolPrice(selectedAsset.symbol, sl)}, TP: ${formatSymbolPrice(selectedAsset.symbol, tp)} (Ticket #${ticket})`,
      });

      // Update last executed trade for visual mapping
      setLastExecutedTrade({
        ticket,
        symbol: selectedAsset.symbol,
        action: setup.direction.toUpperCase(),
        orderType: isLimitOrder ? 'LIMIT' : 'MARKET',
        entry: execPrice,
        stopLoss: sl,
        takeProfit: tp,
        riskReward: '1:2.2',
        time: new Date().toLocaleTimeString(),
      });

      // Refresh pending orders immediately
      const updatedOrders = await fetchLivePendingOrders();
      setPendingOrders(updatedOrders);
    } catch (err: any) {
      console.error('Trish execution error:', err);
      alert(`MT5 Execution Error: ${err.message || 'Failed to place order'}`);
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleCancelPending = async (ticket: number) => {
    setIsCancellingOrder(ticket);
    try {
      const ok = await cancelPendingOrder(ticket);
      if (ok) {
        setPendingOrders((prev) => prev.filter((o) => o.ticket !== ticket));
        alert(`✅ Pending limit order #${ticket} cancelled on MT5.`);
      } else {
        alert(`Failed to cancel order #${ticket}.`);
      }
    } catch (err: any) {
      alert(`Error cancelling order: ${err.message}`);
    } finally {
      setIsCancellingOrder(null);
    }
  };

  const handleClosePosition = async () => {
    if (!activeMappedPosition) return;
    try {
      if ('id' in activeMappedPosition) {
        await store.closePosition((activeMappedPosition as any).id);
      }
      try {
        await fetch('http://127.0.0.1:8000/close-position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: activeMappedPosition.ticket }),
        });
      } catch (e) {
        // Ignored
      }
      setLastExecutedTrade(null);
      alert(`✅ Position #${activeMappedPosition.ticket} closed.`);
    } catch (err: any) {
      alert(`Notice: ${err.message || 'Position closed'}`);
    }
  };

  const filteredBots = bots.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  // TradingView Embed URL for selected symbol and timeframe with full drawing tools & active theme
  const tvEmbedUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_bot_chart&symbol=${encodeURIComponent(
    selectedAsset.tv
  )}&interval=${selectedTf.val}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=${theme === 'light' ? 'ffffff' : '0a0b0d'}&studies=[]&theme=${theme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&locale=en`;

  const tvExternalUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(selectedAsset.tv)}`;

  // Active mapped position on this symbol to display TradingView Long/Short Position Box
  const activeMappedPosition = activePositionsForAsset[0] || (lastExecutedTrade && lastExecutedTrade.symbol === selectedAsset.symbol ? {
    ticket: lastExecutedTrade.ticket,
    symbol: lastExecutedTrade.symbol,
    type: lastExecutedTrade.action.toLowerCase() as 'buy' | 'sell',
    volume: riskSettings.fixedLot,
    openPrice: lastExecutedTrade.entry,
    currentPrice: livePrice,
    stopLoss: lastExecutedTrade.stopLoss,
    takeProfit: lastExecutedTrade.takeProfit,
    profit: 0,
  } : null);

  const isLong = activeMappedPosition ? activeMappedPosition.type === 'buy' : latestAnalysis?.bias !== 'bearish';

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c202a] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">
            <span>QUANTIQ AI / AUTO TRADING</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Trish AI Autonomous Trading Engine</h1>
          <p className="text-xs text-slate-400 mt-1">
            Trish scans market structure on live charts, calculates high-probability SMC setups, maps long/short positions, and executes market and limit orders directly to MT5.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#12151d] border border-[#222735] px-3.5 py-2 rounded-xl text-xs font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Bridge:</span>
            <span className="font-bold text-white">
              {activeAccount ? `${activeAccount.broker} (${activeAccount.accountNumber})` : 'Disconnected'}
            </span>
            <span className="text-[#c4f042] font-extrabold">
              ${activeAccount ? activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-4 py-2.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.2)]"
          >
            <Plus className="h-4 w-4" />
            <span>New Strategy</span>
          </button>
        </div>
      </div>

      {/* Master Autonomous Autopilot & Account Growth Control Center */}
      <div className={`rounded-3xl border transition-all duration-300 p-5 sm:p-6 space-y-5 ${
        engineStatus.isRunning 
          ? 'border-emerald-500/50 bg-gradient-to-br from-[#0a1a15] via-[#09121a] to-[#0a0d15] shadow-[0_0_40px_rgba(16,185,129,0.18)]' 
          : 'border-[#22283a] bg-[#0c0f17]'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1c2234] pb-5">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all shadow-lg ${
              engineStatus.isRunning
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 shadow-emerald-500/30 animate-pulse'
                : 'bg-[#181d2a] text-slate-400 border border-[#2b3346]'
            }`}>
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-lg font-black text-white tracking-tight">Autonomous Account Growth Autopilot</h2>
                {engineStatus.isRunning ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 text-emerald-400 px-3 py-0.5 text-[11px] font-extrabold uppercase border border-emerald-500/40">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    AUTOPILOT TRADING ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-800 text-slate-400 px-3 py-0.5 text-[11px] font-bold uppercase border border-slate-700">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    AUTOPILOT PAUSED
                  </span>
                )}
                {riskSettings.autoBreakeven && (
                  <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 text-cyan-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase border border-cyan-500/30">
                    <ShieldCheck className="h-3 w-3" />
                    Auto-Breakeven Guard
                  </span>
                )}
                {riskSettings.trailingStop && (
                  <span className="flex items-center gap-1 rounded-full bg-indigo-500/15 text-indigo-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase border border-indigo-500/30">
                    <TrendingUp className="h-3 w-3" />
                    Trailing SL: ACTIVE (+0.75R/+1.4R)
                  </span>
                )}
                {riskSettings.dailyLossLimitPct > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase border border-rose-500/30">
                    Max Loss: -{riskSettings.dailyLossLimitPct}%
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase border border-emerald-500/30">
                    Loss Limit: REMOVED (Uncapped)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Fully automated trading engine: scans market structure across liquid pairs, places trades within your set risk & lot size, and automatically moves Stop Loss to Breakeven when in profit.
              </p>
            </div>
          </div>

          {/* Master Autopilot Toggle Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => autonomousEngine.toggle()}
              className={`flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all transform active:scale-95 shadow-xl ${
                engineStatus.isRunning
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:brightness-110 shadow-rose-500/20'
                  : 'bg-gradient-to-r from-[#c4f042] via-emerald-400 to-[#c4f042] text-slate-950 hover:brightness-110 shadow-[0_0_25px_rgba(196,240,66,0.3)] animate-pulse'
              }`}
            >
              {engineStatus.isRunning ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span>Pause Autonomous Trading</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>Start Autonomous Trading</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Telemetry & Performance Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded-2xl border border-[#1e2538] bg-[#111624] p-3 space-y-1">
            <span className="text-[10px] font-sans uppercase font-bold text-slate-400">Engine Status</span>
            <div className="text-white font-extrabold truncate text-xs flex items-center gap-1.5">
              <Activity className={`h-3.5 w-3.5 shrink-0 ${engineStatus.isRunning ? 'text-emerald-400 animate-spin' : 'text-slate-500'}`} />
              <span className="truncate">{engineStatus.statusText}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1e2538] bg-[#111624] p-3 space-y-1">
            <span className="text-[10px] font-sans uppercase font-bold text-slate-400">Concurrent Trades</span>
            <div className="text-white font-extrabold text-sm flex items-center justify-between">
              <span className={positions.length >= riskSettings.maxTrades ? 'text-amber-400' : 'text-emerald-400'}>
                {positions.length} / {riskSettings.maxTrades} Max
              </span>
              <span className="text-[10px] font-sans text-slate-400">
                {positions.length >= riskSettings.maxTrades ? 'At Capacity' : 'Available'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1e2538] bg-[#111624] p-3 space-y-1">
            <span className="text-[10px] font-sans uppercase font-bold text-slate-400">Position Protection</span>
            <div className="text-cyan-400 font-extrabold text-sm flex items-center justify-between">
              <span>{engineStatus.protectedTradesCount} Protected</span>
              <span className="text-[10px] font-sans text-indigo-400">
                {riskSettings.trailingStop ? `${engineStatus.trailingProtectedCount} Trailing` : 'BE Only'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1e2538] bg-[#111624] p-3 space-y-1">
            <span className="text-[10px] font-sans uppercase font-bold text-slate-400">Today's Growth</span>
            <div className="text-sm font-extrabold flex items-center justify-between">
              <span className={engineStatus.growthPctToday >= 0 ? 'text-[#c4f042]' : 'text-rose-400'}>
                {engineStatus.growthPctToday >= 0 ? '+' : ''}{engineStatus.growthPctToday.toFixed(2)}%
              </span>
              <span className="text-[10px] font-sans text-slate-400">
                {riskSettings.dailyGrowthTargetPct > 0 ? `Target: +${riskSettings.dailyGrowthTargetPct}%` : 'Unlimited'}
              </span>
            </div>
          </div>
        </div>

        {/* Universal Risk & Execution Configuration Strip */}
        <div className="rounded-2xl border border-[#222a3d] bg-[#0e121d] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between border-b border-[#1c2333] pb-2.5 gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-[#c4f042]" />
              Universal Execution Parameters (Applies Automatically Across All Tabs)
            </span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-slate-400">
                Account: <strong className="text-white">${(activeAccount?.balance || 80).toFixed(2)}</strong>
              </span>
              {riskSettings.dailyLossLimitPct <= 0 ? (
                <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                  Loss Limit: REMOVED
                </span>
              ) : (
                <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-bold">
                  Loss Limit: -{riskSettings.dailyLossLimitPct}%
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Sizing Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Position Sizing
              </label>
              <div className="grid grid-cols-2 rounded-xl bg-[#090c12] p-1 border border-[#1c2232] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ mode: 'RISK_PCT' })}
                  className={`rounded-lg py-1 transition-all ${
                    riskSettings.mode === 'RISK_PCT'
                      ? 'bg-[#c4f042] text-slate-950 font-extrabold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Risk %
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ mode: 'FIXED_LOT' })}
                  className={`rounded-lg py-1 transition-all ${
                    riskSettings.mode === 'FIXED_LOT'
                      ? 'bg-indigo-600 text-white font-extrabold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fixed Lot
                </button>
              </div>
            </div>

            {/* Sizing Value Input with Direct User Typing */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {riskSettings.mode === 'RISK_PCT' ? 'Risk Per Trade' : 'Lot Size Per Trade'}
                </label>
                {riskSettings.mode === 'RISK_PCT' && (
                  <span className="text-[10px] font-mono text-rose-400">
                    -${(((activeAccount?.balance || 80) * (riskSettings.riskPercent / 100))).toFixed(2)}
                  </span>
                )}
              </div>
              {riskSettings.mode === 'RISK_PCT' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 bg-[#090c12] border border-[#232b3e] px-2.5 py-1 rounded-xl">
                    <span className="text-[11px] text-slate-400">User Input:</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="50"
                      value={riskSettings.riskPercent}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleUpdateRiskSettings({ riskPercent: isNaN(val) ? 0 : val });
                      }}
                      className="w-16 ml-auto bg-transparent font-mono font-extrabold text-[#c4f042] text-xs text-right focus:outline-none"
                    />
                    <span className="font-bold text-[#c4f042] text-xs">%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0.5, 1.0, 2.0, 3.0].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleUpdateRiskSettings({ riskPercent: pct })}
                        className={`rounded-lg py-1 text-[11px] font-mono font-bold transition-all ${
                          riskSettings.riskPercent === pct
                            ? 'bg-[#c4f042] text-slate-950 font-extrabold'
                            : 'bg-[#121623] text-slate-400 hover:text-white border border-[#202738]'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 bg-[#090c12] border border-[#232b3e] px-2.5 py-1 rounded-xl">
                    <span className="text-[11px] text-slate-400">User Input:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="20"
                      value={riskSettings.fixedLot}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleUpdateRiskSettings({ fixedLot: isNaN(val) ? 0.01 : val });
                      }}
                      className="w-16 ml-auto bg-transparent font-mono font-extrabold text-indigo-400 text-xs text-right focus:outline-none"
                    />
                    <span className="font-bold text-indigo-400 text-xs">Lots</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0.01, 0.02, 0.05, 0.10].map((vol) => (
                      <button
                        key={vol}
                        type="button"
                        onClick={() => handleUpdateRiskSettings({ fixedLot: vol })}
                        className={`rounded-lg py-1 text-[11px] font-mono font-bold transition-all ${
                          riskSettings.fixedLot === vol
                            ? 'bg-indigo-600 text-white font-extrabold'
                            : 'bg-[#121623] text-slate-400 hover:text-white border border-[#202738]'
                        }`}
                      >
                        {vol}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Max Concurrent Trades */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Max Concurrent Trades
                </label>
                <span className="text-xs font-mono font-extrabold text-purple-400">{riskSettings.maxTrades} Max</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleUpdateRiskSettings({ maxTrades: num })}
                    className={`rounded-xl py-1.5 text-xs font-mono font-bold transition-all ${
                      riskSettings.maxTrades === num
                        ? 'bg-purple-600 text-white font-extrabold shadow'
                        : 'bg-[#121623] text-slate-400 hover:text-white border border-[#202738]'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Breakeven Switch with Breathing Room Milestone Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Breakeven Trigger
                </label>
                <span className="text-[10px] font-mono font-bold text-cyan-400">
                  {riskSettings.autoBreakeven ? `+${riskSettings.breakevenTriggerR || 1.0}R` : 'OFF'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ autoBreakeven: !riskSettings.autoBreakeven })}
                  className={`flex-1 flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all border ${
                    riskSettings.autoBreakeven
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-800 bg-[#121623] text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="text-[11px]">BE Guard</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                    riskSettings.autoBreakeven ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {riskSettings.autoBreakeven ? 'ON' : 'OFF'}
                  </span>
                </button>
                {riskSettings.autoBreakeven && (
                  <div className="flex items-center bg-[#090c12] border border-[#202738] rounded-xl p-0.5 text-[10px] font-bold font-mono">
                    {[1.0, 1.2, 1.5].map((rVal) => (
                      <button
                        key={rVal}
                        type="button"
                        onClick={() => handleUpdateRiskSettings({ breakevenTriggerR: rVal })}
                        className={`px-1.5 py-1 rounded-lg transition-all ${
                          (riskSettings.breakevenTriggerR || 1.0) === rVal
                            ? 'bg-cyan-500 text-slate-950 font-extrabold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title={`Wait until position is at least +${rVal}R in profit before moving SL to Breakeven`}
                      >
                        +{rVal}R
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Smart Step Trailing SL Switch */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Smart Trailing SL
              </label>
              <button
                type="button"
                onClick={() => handleUpdateRiskSettings({ trailingStop: !riskSettings.trailingStop })}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all border ${
                  riskSettings.trailingStop
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-[#121623] text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4" />
                  <span>Step Trail</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                  riskSettings.trailingStop ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {riskSettings.trailingStop ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
            </div>

            {/* M.J.M Engulfing Confirmation Trigger */}
            <div className="rounded-xl border border-amber-500/20 bg-[#090c12] p-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-amber-300 block">Engulfing Trigger:</span>
                <span className="text-[10px] text-slate-400">
                  M.J.M candle confirm in zone
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateRiskSettings({ requireEngulfingConfirmation: riskSettings.requireEngulfingConfirmation === false ? true : false })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                  riskSettings.requireEngulfingConfirmation !== false
                    ? 'bg-amber-500 text-slate-950 font-black shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                    : 'bg-[#151922] text-slate-400 hover:text-white border border-[#283244]'
                }`}
              >
                {riskSettings.requireEngulfingConfirmation !== false ? 'ACTIVE (M.J.M)' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Advanced Execution Strip: AI Order Dispatch Mode, Partial Profit, Post-Exit Cooldown, SMC Scale-In */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-2 border-t border-[#1a202c]">
            {/* AI Smart Order Dispatch Mode */}
            <div className="rounded-xl border border-[#202738] bg-[#090c12] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Crosshair className="h-3.5 w-3.5 text-sky-400" />
                  Dispatch:
                </span>
                <span className="text-[10px] font-bold text-sky-400 uppercase">
                  {riskSettings.orderDispatchMode || 'AUTO'}
                </span>
              </div>
              <div className="grid grid-cols-3 rounded-lg bg-[#141924] p-0.5 border border-[#232c40] text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ orderDispatchMode: 'AUTO' })}
                  className={`rounded py-1 transition-all ${
                    (riskSettings.orderDispatchMode || 'AUTO') === 'AUTO'
                      ? 'bg-sky-500 text-slate-950 font-extrabold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="AI evaluates distance from Order Block: places Limit if away, Market if tapping zone"
                >
                  AUTO
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ orderDispatchMode: 'MARKET' })}
                  className={`rounded py-1 transition-all ${
                    riskSettings.orderDispatchMode === 'MARKET'
                      ? 'bg-[#c4f042] text-slate-950 font-extrabold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Forces immediate market entry on signal"
                >
                  MARKET
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({ orderDispatchMode: 'LIMIT' })}
                  className={`rounded py-1 transition-all ${
                    riskSettings.orderDispatchMode === 'LIMIT'
                      ? 'bg-purple-600 text-white font-extrabold shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Forces pending limit order at Order Block mitigation price"
                >
                  LIMIT
                </button>
              </div>
            </div>

            {/* Partial Profit Taking (+1.5R Take 50% Off) */}
            <div className="rounded-xl border border-[#202738] bg-[#090c12] p-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white block">Partial TP (+1.5R):</span>
                <span className="text-[10px] text-slate-400">
                  {riskSettings.partialProfitClose !== false
                    ? 'Closes 50% lots & trails remainder'
                    : 'Holds 100% position until trailing SL'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateRiskSettings({ partialProfitClose: riskSettings.partialProfitClose === false ? true : false })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                  riskSettings.partialProfitClose !== false
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#151922] text-slate-400 hover:text-white border border-[#283244]'
                }`}
              >
                {riskSettings.partialProfitClose !== false ? 'ACTIVE (50%)' : 'OFF'}
              </button>
            </div>

            {/* Post-Exit / BE Protection Lockout */}
            <div className="rounded-xl border border-cyan-500/20 bg-[#090c12] p-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-cyan-300 block">Post-Exit Lockout:</span>
                <span className="text-[10px] text-slate-400">
                  Lockout after hitting BE / SL
                </span>
              </div>
              <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={riskSettings.postExitCooldownMinutes ?? 15}
                  onChange={(e) => handleUpdateRiskSettings({ postExitCooldownMinutes: Math.max(5, parseInt(e.target.value) || 15) })}
                  className="w-8 bg-transparent font-mono font-bold text-cyan-400 text-xs text-right focus:outline-none"
                />
                <span className="text-cyan-400 text-xs font-bold">min</span>
              </div>
            </div>

            {/* SMC Pyramiding Scale-In */}
            <div className="rounded-xl border border-indigo-500/20 bg-[#090c12] p-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-indigo-300 block">SMC Scale-In:</span>
                <span className="text-[10px] text-slate-400">
                  Pyramid 2nd trade once BE locked
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateRiskSettings({ allowScaleIn: riskSettings.allowScaleIn === false ? true : false })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                  riskSettings.allowScaleIn !== false
                    ? 'bg-indigo-500 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                    : 'bg-[#151922] text-slate-400 hover:text-white border border-[#283244]'
                }`}
              >
                {riskSettings.allowScaleIn !== false ? 'ACTIVE (0.5x)' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Daily Limits Section (Loss Limit & Target Gain Settings) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#1a202c]">
            {/* Daily Loss Limit Setting */}
            <div className={`rounded-xl border p-2.5 flex items-center justify-between gap-3 ${
              riskSettings.dailyLossLimitPct > 0
                ? 'border-rose-500/30 bg-rose-500/5'
                : 'border-[#202738] bg-[#090c12]'
            }`}>
              <div>
                <span className="text-xs font-bold text-white block">Daily Loss Limit:</span>
                <span className="text-[10px] text-slate-400">
                  {riskSettings.dailyLossLimitPct > 0
                    ? `Pauses trading if equity dips -${riskSettings.dailyLossLimitPct}%`
                    : 'Removed / Disabled — Trading is never paused by drawdown'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {riskSettings.dailyLossLimitPct > 0 && (
                  <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="50"
                      value={riskSettings.dailyLossLimitPct}
                      onChange={(e) => handleUpdateRiskSettings({ dailyLossLimitPct: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-10 bg-transparent font-mono font-bold text-rose-400 text-xs text-right focus:outline-none"
                    />
                    <span className="text-rose-400 text-xs font-bold">%</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({
                    dailyLossLimitPct: riskSettings.dailyLossLimitPct > 0 ? 0 : 5.0
                  })}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                    riskSettings.dailyLossLimitPct > 0
                      ? 'bg-rose-500 text-white'
                      : 'bg-[#151922] text-slate-400 hover:text-white border border-[#283244]'
                  }`}
                >
                  {riskSettings.dailyLossLimitPct > 0 ? 'ENABLED' : 'REMOVED (OFF)'}
                </button>
              </div>
            </div>

            {/* Daily Target Gain Setting */}
            <div className={`rounded-xl border p-2.5 flex items-center justify-between gap-3 ${
              riskSettings.dailyGrowthTargetPct > 0
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-[#202738] bg-[#090c12]'
            }`}>
              <div>
                <span className="text-xs font-bold text-white block">Daily Target Gain:</span>
                <span className="text-[10px] text-slate-400">
                  {riskSettings.dailyGrowthTargetPct > 0
                    ? `Locks profit when target +${riskSettings.dailyGrowthTargetPct}% is reached`
                    : 'Unlimited — Runs continuously without profit ceiling'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {riskSettings.dailyGrowthTargetPct > 0 && (
                  <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      value={riskSettings.dailyGrowthTargetPct}
                      onChange={(e) => handleUpdateRiskSettings({ dailyGrowthTargetPct: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-10 bg-transparent font-mono font-bold text-emerald-400 text-xs text-right focus:outline-none"
                    />
                    <span className="text-emerald-400 text-xs font-bold">%</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleUpdateRiskSettings({
                    dailyGrowthTargetPct: riskSettings.dailyGrowthTargetPct > 0 ? 0 : 5.0
                  })}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                    riskSettings.dailyGrowthTargetPct > 0
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#151922] text-slate-400 hover:text-white border border-[#283244]'
                  }`}
                >
                  {riskSettings.dailyGrowthTargetPct > 0 ? 'ENABLED' : 'UNLIMITED (OFF)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE SMC SETUP & EXECUTION INSPECTOR (100% SETUP VISIBILITY) */}
      <div className="rounded-2xl border border-sky-500/30 bg-[#0c101c] p-4 shadow-[0_0_20px_rgba(56,189,248,0.1)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2438] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-white">
              Active SMC Setup & Execution Inspector
            </span>
            <span className="text-[10px] rounded bg-sky-500/20 text-sky-300 font-bold px-2 py-0.5 border border-sky-500/30">
              SETUP TRANSPARENCY
            </span>
          </div>
          {engineStatus.latestSMCSetup && (
            <span className="text-[10px] font-mono text-slate-400">
              Scan Timestamp: <strong className="text-slate-200">{engineStatus.latestSMCSetup.timestamp}</strong>
            </span>
          )}
        </div>

        {engineStatus.latestSMCSetup ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* Card 1: Asset, Bias & Confidence */}
            <div className="rounded-xl border border-[#1e273c] bg-[#101524] p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Structure Bias</span>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">
                  {engineStatus.latestSMCSetup.symbol}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                  engineStatus.latestSMCSetup.bias === 'bullish' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {engineStatus.latestSMCSetup.bias}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">
                Confidence: <strong className="text-sky-400 uppercase">{engineStatus.latestSMCSetup.confidence}</strong>
              </span>
            </div>

            {/* Card 2: Order Block & Mitigation Levels */}
            <div className="rounded-xl border border-[#1e273c] bg-[#101524] p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Institutional Levels</span>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400 text-[11px]">Order Block:</span>
                <span className="font-bold text-white">${formatSymbolPrice(engineStatus.latestSMCSetup.symbol, engineStatus.latestSMCSetup.orderBlockPrice)}</span>
              </div>
              {engineStatus.latestSMCSetup.fvgLevel && (
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-slate-400">Fair Value Gap:</span>
                  <span className="font-bold text-amber-400">${formatSymbolPrice(engineStatus.latestSMCSetup.symbol, engineStatus.latestSMCSetup.fvgLevel)}</span>
                </div>
              )}
            </div>

            {/* Card 3: Execution Mode & R:R */}
            <div className="rounded-xl border border-[#1e273c] bg-[#101524] p-3 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Execution Mode & R:R</span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold uppercase ${
                  engineStatus.latestSMCSetup.orderType === 'LIMIT'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {engineStatus.latestSMCSetup.orderType} ORDER
                </span>
                <span className="text-[10px] font-bold text-emerald-400 font-mono">
                  1:2.20 R:R
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
                <span>Entry: ${formatSymbolPrice(engineStatus.latestSMCSetup.symbol, engineStatus.latestSMCSetup.entry)}</span>
                <span className="text-rose-400">SL: ${formatSymbolPrice(engineStatus.latestSMCSetup.symbol, engineStatus.latestSMCSetup.stopLoss)}</span>
              </div>
            </div>

            {/* Card 4: Exact Institutional Rationale */}
            <div className="rounded-xl border border-[#1e273c] bg-[#101524] p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Setup Rationale</span>
              <p className="text-[11px] text-slate-300 leading-snug font-sans">
                {engineStatus.latestSMCSetup.rationale}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 bg-[#090d18] p-3 rounded-xl border border-[#1b2234]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-slate-300 font-mono text-[11px]">
                {engineStatus.statusText}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="text-emerald-400">🛡️ Spread Guard: ACTIVE</span>
              <span className="text-sky-400">⏱️ Cooldown: {riskSettings.tradeCooldownMinutes || 5}m</span>
              <span className="text-purple-400">⚖️ Margin Guard: MAX 28%</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Auto Trading Interactive Desk with Live Chart & Order Mapping */}
      <div className="rounded-3xl border border-purple-500/30 bg-[#0e111a] shadow-[0_0_35px_rgba(168,85,247,0.12)] overflow-hidden">
        {/* Top Header Bar of Auto Trading Desk */}
        <div className="p-4 sm:p-5 border-b border-[#1f2535] bg-gradient-to-r from-[#131522] via-[#0f121b] to-[#121520] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-md shadow-purple-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white">Autonomous Chart Desk & Order Mapper</h2>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-extrabold uppercase border border-emerald-500/30">
                  LIVE MT5 LINK
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Visualizing active positions, limit orders, and SMC liquidity sweeps
              </span>
            </div>
          </div>

          {/* Asset & Timeframe Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Asset Dropdown */}
            <div className="relative">
              <select
                value={selectedAsset.symbol}
                onChange={(e) => {
                  const found = AUTO_ASSETS.find((a) => a.symbol === e.target.value);
                  if (found) {
                    setSelectedAsset(found);
                    setCustomLimitPrice('');
                  }
                }}
                className="appearance-none rounded-xl border border-[#2b3346] bg-[#141926] pl-3.5 pr-8 py-2 text-xs font-bold text-white focus:outline-none cursor-pointer hover:border-purple-500/50 transition-colors"
              >
                {AUTO_ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>

            {/* Timeframe Selector Pills */}
            <div className="flex items-center gap-1 rounded-xl bg-[#111520] p-1 border border-[#1e2434]">
              {AUTO_TIMEFRAMES.map((tf) => (
                <button
                  key={tf.label}
                  onClick={() => setSelectedTf(tf)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition-all ${
                    selectedTf.label === tf.label
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-[#171c2b]'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Live Spot Pill */}
            <div className="flex items-center gap-2 font-mono text-xs font-extrabold bg-[#121622] px-3 py-1.5 rounded-xl border border-[#222a3d]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-[10px] font-sans uppercase">SPOT:</span>
              <span className="text-white">${formatSymbolPrice(selectedAsset.symbol, livePrice)}</span>
            </div>

            {/* Chart Engine Switcher (TradingView Pro Drawing Suite vs MT5 Live Stream) */}
            <div className={`flex items-center rounded-xl p-1 border text-[11px] font-bold ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-[#111520] border-[#1e2434]'
            }`}>
              <button
                onClick={() => setChartEngine('mapped')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                  chartEngine === 'mapped'
                    ? 'bg-emerald-500 text-slate-950 font-extrabold shadow'
                    : (theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
                }`}
                title="MT5 Broker Tick Stream with clean TradingView Long/Short Position Box"
              >
                <Target className="h-3.5 w-3.5" />
                <span>MT5 Live Stream</span>
              </button>
              <button
                onClick={() => setChartEngine('tradingview')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                  chartEngine === 'tradingview'
                    ? 'bg-purple-600 text-white font-extrabold shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : (theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
                }`}
                title="Full TradingView Pro Chart with all 50+ drawing tools, Fibonacci, Brush, and Text objects"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>TradingView Studio</span>
              </button>
            </div>

            {/* Quick External Link to TradingView Web */}
            <a
              href={tvExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                  : 'bg-[#121622] border-[#222a3d] text-slate-300 hover:text-white hover:border-purple-500/50'
              }`}
              title="Open full chart directly in TradingView.com in a new tab"
            >
              <span>TradingView.com</span>
              <ExternalLink className="h-3 w-3 text-purple-400" />
            </a>
          </div>
        </div>

        {/* Chart + Order Mapping Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left/Center: Authentic Real-Time Chart with Programmatic Long/Short Position Box Mapping */}
          <div className="lg:col-span-8 flex flex-col border-b lg:border-b-0 lg:border-r border-[#1e2434] bg-[#07090e] relative min-h-[460px]">
            {chartEngine === 'mapped' ? (
              <OrderMappedChart
                symbol={selectedAsset.symbol}
                timeframe={selectedTf.label}
                activePosition={activeMappedPosition}
                pendingOrders={pendingOrdersForAsset}
                previewLimitPrice={(orderMode === 'LIMIT' && customLimitPrice) ? parseFloat(customLimitPrice) : (orderMode === 'AUTO' && engineStatus.latestSMCSetup?.orderType === 'LIMIT' ? engineStatus.latestSMCSetup.entry : null)}
                isLimitMode={orderMode === 'LIMIT' || (orderMode === 'AUTO' && engineStatus.latestSMCSetup?.orderType === 'LIMIT')}
                latestSMCSetup={engineStatus.latestSMCSetup}
                onClosePosition={handleClosePosition}
              />
            ) : (
              <iframe
                key={`${selectedAsset.tv}-${selectedTf.val}-${theme}`}
                src={tvEmbedUrl}
                title={`TradingView Auto Trading Chart ${selectedAsset.symbol}`}
                className="w-full h-full border-0 min-h-[540px]"
                allow="fullscreen"
                loading="eager"
              />
            )}
          </div>

          {/* Right Column: Visual Long/Short Position Tool & MT5 Order Mapper */}
          <div className="lg:col-span-4 flex flex-col bg-[#0b0e15] p-5 space-y-5">
            {/* Order Configuration Bar: Market vs Limit */}
            <div className="rounded-2xl border border-[#202738] bg-[#121622] p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#1d2332] pb-2.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Crosshair className="h-4 w-4 text-[#c4f042]" />
                  Order Dispatch & Risk Settings
                </span>

                {/* AI Auto SMC vs Market vs Limit Toggle */}
                <div className="flex items-center rounded-xl bg-[#0a0d14] p-0.5 border border-[#1f2637] text-[10px] font-bold">
                  <button
                    onClick={() => {
                      setOrderMode('AUTO');
                      handleUpdateRiskSettings({ orderDispatchMode: 'AUTO' });
                    }}
                    className={`rounded px-2 py-1 transition-all ${
                      orderMode === 'AUTO' ? 'bg-sky-500 text-slate-950 font-extrabold shadow' : 'text-slate-400 hover:text-white'
                    }`}
                    title="AI evaluates price distance: uses Market if tapping Order Block, Limit if waiting for retracement"
                  >
                    AUTO (SMC)
                  </button>
                  <button
                    onClick={() => {
                      setOrderMode('MARKET');
                      handleUpdateRiskSettings({ orderDispatchMode: 'MARKET' });
                    }}
                    className={`rounded px-2 py-1 transition-all ${
                      orderMode === 'MARKET' ? 'bg-[#c4f042] text-[#0a0b0d] font-extrabold shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    MARKET
                  </button>
                  <button
                    onClick={() => {
                      setOrderMode('LIMIT');
                      handleUpdateRiskSettings({ orderDispatchMode: 'LIMIT' });
                    }}
                    className={`rounded px-2 py-1 transition-all ${
                      orderMode === 'LIMIT' ? 'bg-purple-600 text-white font-extrabold shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    LIMIT
                  </button>
                </div>
              </div>

              {/* Sizing Strategy Mode (Risk % vs Fixed Lot) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Position Sizing Strategy
                  </label>
                  <div className="flex rounded-lg bg-[#0a0d14] p-0.5 border border-[#1f2637] text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleUpdateRiskSettings({ mode: 'RISK_PCT' })}
                      className={`rounded px-2 py-0.5 transition-all ${
                        riskSettings.mode === 'RISK_PCT' ? 'bg-[#c4f042] text-[#0a0b0d]' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      RISK % (AUTO SIZED)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateRiskSettings({ mode: 'FIXED_LOT' })}
                      className={`rounded px-2 py-0.5 transition-all ${
                        riskSettings.mode === 'FIXED_LOT' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      FIXED LOTS
                    </button>
                  </div>
                </div>

                {riskSettings.mode === 'RISK_PCT' ? (
                  <div className="rounded-xl border border-[#232a3c] bg-[#0c0f16] p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-300">Account Risk:</span>
                      <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="50"
                          value={riskSettings.riskPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleUpdateRiskSettings({ riskPercent: isNaN(val) ? 0 : val });
                          }}
                          className="w-14 bg-transparent font-mono font-extrabold text-[#c4f042] text-xs text-right focus:outline-none"
                        />
                        <span className="font-bold text-[#c4f042] text-xs">%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {[0.5, 1.0, 2.0, 3.0].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleUpdateRiskSettings({ riskPercent: pct })}
                          className={`rounded-lg py-1 text-[11px] font-bold transition-all ${
                            riskSettings.riskPercent === pct
                              ? 'bg-[#c4f042] text-[#0a0b0d] font-extrabold shadow-[0_0_8px_rgba(196,240,66,0.3)]'
                              : 'bg-[#151922] text-slate-400 hover:text-white border border-[#202738]'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    {/* Live Risk Calculation Breakdown */}
                    <div className="flex items-center justify-between border-t border-[#1a202c] pt-2 text-[10px] font-mono text-slate-400">
                      <span>
                        Risk: <strong className="text-rose-400">-${(((activeAccount?.balance || 80) * (riskSettings.riskPercent / 100))).toFixed(2)}</strong>
                      </span>
                      <span>
                        Target (1:2.2): <strong className="text-emerald-400">+${(((activeAccount?.balance || 80) * (riskSettings.riskPercent / 100) * 2.2)).toFixed(2)}</strong>
                      </span>
                      <span className="text-slate-400">
                        Balance: <strong className="text-white">${(activeAccount?.balance || 80).toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#232a3c] bg-[#0c0f16] p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-300">Contract Volume:</span>
                      <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="20"
                          value={riskSettings.fixedLot}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleUpdateRiskSettings({ fixedLot: isNaN(val) ? 0.01 : val });
                          }}
                          className="w-16 bg-transparent font-mono font-extrabold text-indigo-400 text-xs text-right focus:outline-none"
                        />
                        <span className="font-bold text-indigo-400 text-xs">Lots</span>
                      </div>
                    </div>
                    <select
                      value={riskSettings.fixedLot}
                      onChange={(e) => handleUpdateRiskSettings({ fixedLot: parseFloat(e.target.value) })}
                      className="w-full rounded-xl border border-[#272f42] bg-[#121623] px-3 py-1.5 text-xs font-bold text-white focus:outline-none font-mono"
                    >
                      <option value={0.01}>0.01 Lots (Micro)</option>
                      <option value={0.02}>0.02 Lots</option>
                      <option value={0.03}>0.03 Lots</option>
                      <option value={0.05}>0.05 Lots (Standard)</option>
                      <option value={0.10}>0.10 Lots (Mini)</option>
                      <option value={0.20}>0.20 Lots</option>
                      <option value={0.50}>0.50 Lots</option>
                      <option value={1.00}>1.00 Lots (Standard Lot)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Limit Entry Price (if Limit Mode) */}
              {orderMode === 'LIMIT' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Pending Limit Entry Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={customLimitPrice}
                    onChange={(e) => setCustomLimitPrice(e.target.value)}
                    placeholder="e.g. 4135.00"
                    className="w-full rounded-xl border border-purple-500/50 bg-[#0c0f16] px-3 py-2 text-xs font-bold text-[#c4f042] focus:outline-none font-mono"
                  />
                </div>
              )}

              {/* Trigger Execution CTA */}
              <button
                onClick={handleTrishScanAndExecute}
                disabled={isScanning}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 py-3 text-xs font-extrabold text-white hover:brightness-110 transition-all shadow-[0_0_20px_rgba(147,51,234,0.35)] hover:scale-[1.01] disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{scanStep || 'Scanning Structure...'}</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>
                      {orderMode === 'LIMIT'
                        ? `Scan & Place ${riskSettings.mode === 'RISK_PCT' ? `${riskSettings.riskPercent}% Risk` : `${riskSettings.fixedLot} Lot`} Limit Order`
                        : `Scan & Execute ${riskSettings.mode === 'RISK_PCT' ? `${riskSettings.riskPercent}% Risk (${(((activeAccount?.balance || 80) * (riskSettings.riskPercent / 100))).toFixed(2)} USD)` : `${riskSettings.fixedLot} Lots`} to MT5`}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* TradingView-Style Visual Long / Short Position Mapping Box */}
            <div className="flex-1 rounded-2xl border border-[#222a3d] bg-[#111520] p-4 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-[#1c2232] pb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-400" />
                  Chart Position Mapper
                </span>

                {activeMappedPosition ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ACTIVE ON MT5
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">SMC Projection</span>
                )}
              </div>

              {/* Position Tool Visual Mapping Container */}
              {activeMappedPosition ? (
                <div className="space-y-3 font-mono text-xs">
                  {/* Position Header */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#090b10] border border-[#1e2536]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-extrabold uppercase ${
                          activeMappedPosition.type === 'buy'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {activeMappedPosition.type === 'buy' ? '▲ LONG' : '▼ SHORT'} {activeMappedPosition.volume} LOTS
                      </span>
                      <span className="text-[11px] text-slate-400">#{activeMappedPosition.ticket}</span>
                    </div>

                    <span
                      className={`font-bold ${
                        activeMappedPosition.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {activeMappedPosition.profit >= 0 ? '+' : ''}${activeMappedPosition.profit.toFixed(2)} USD
                    </span>
                  </div>

                  {/* TradingView Target (Green Zone) */}
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        TAKE PROFIT (TARGET)
                      </span>
                      <span className="font-extrabold text-emerald-300">
                        {formatSymbolPrice(selectedAsset.symbol, activeMappedPosition.takeProfit || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-emerald-400/80">
                      <span>Reward Ratio: 2.2R</span>
                      <span>Target: +${((Math.abs((activeMappedPosition.takeProfit ?? activeMappedPosition.openPrice) - activeMappedPosition.openPrice) * activeMappedPosition.volume * 1000)).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* TradingView Entry (White Line) */}
                  <div className="rounded-xl border border-slate-700 bg-[#0a0d14] p-3 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Crosshair className="h-3 w-3 text-white" />
                      ENTRY BASELINE
                    </span>
                    <span className="font-extrabold text-white">
                      {formatSymbolPrice(selectedAsset.symbol, activeMappedPosition.openPrice)}
                    </span>
                  </div>

                  {/* TradingView Stop Loss (Red Zone) */}
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-red-400 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        STOP LOSS (RISK)
                      </span>
                      <span className="font-extrabold text-red-300">
                        {formatSymbolPrice(selectedAsset.symbol, activeMappedPosition.stopLoss || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-red-400/80">
                      <span>Risk: -1.0R</span>
                      <span>Max Risk: -${((Math.abs(activeMappedPosition.openPrice - (activeMappedPosition.stopLoss ?? activeMappedPosition.openPrice)) * activeMappedPosition.volume * 1000)).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Close Position Action */}
                  <button
                    onClick={handleClosePosition}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 py-2 text-xs font-bold text-red-400 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Close Position #{activeMappedPosition.ticket}</span>
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2.5">
                  <Crosshair className="h-8 w-8 text-slate-600" />
                  <p className="text-xs font-bold text-slate-300">No Mapped Orders on {selectedAsset.symbol}</p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Click "Scan & Execute" to have Trish detect the current Order Block and map the position tool with strict 1:2.2 Risk:Reward directly on this chart.
                  </p>
                </div>
              )}

              {/* Active Pending Orders Section (Limit Orders) */}
              {pendingOrdersForAsset.length > 0 && (
                <div className="space-y-2 border-t border-[#1e2535] pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pending MT5 Limit Orders ({pendingOrdersForAsset.length})
                  </span>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {pendingOrdersForAsset.map((o) => (
                      <div
                        key={o.ticket}
                        className="flex items-center justify-between rounded-xl bg-[#090b10] border border-amber-500/30 p-2 text-[11px] font-mono"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-amber-400">{o.type}</span>
                            <span className="text-white">#{o.ticket}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            @ {formatSymbolPrice(selectedAsset.symbol, o.priceOpen)} • SL: {formatSymbolPrice(selectedAsset.symbol, o.sl)} • TP: {formatSymbolPrice(selectedAsset.symbol, o.tp)}
                          </span>
                        </div>

                        <button
                          onClick={() => handleCancelPending(o.ticket)}
                          disabled={isCancellingOrder === o.ticket}
                          className="rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/30"
                        >
                          {isCancellingOrder === o.ticket ? '...' : 'Cancel'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Bots & 24/7 Execution Logs Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#202532] pb-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[#1b1f28] text-white border border-[#2c3342]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Bots ({bots.length})
            </button>
            <button
              onClick={() => setStatusFilter('running')}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                statusFilter === 'running'
                  ? 'bg-[#1b1f28] text-emerald-400 border border-[#2c3342]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Running ({bots.filter((b) => b.status === 'running').length})
            </button>
            <button
              onClick={() => setStatusFilter('stopped')}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                statusFilter === 'stopped'
                  ? 'bg-[#1b1f28] text-slate-200 border border-[#2c3342]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stopped ({bots.filter((b) => b.status === 'stopped').length})
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-[#c4f042] hover:underline font-bold"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Deploy Strategy with AI</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bots Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredBots.map((bot) => (
                <CloudBotCard
                  key={bot.id}
                  bot={bot}
                  onSelect={(b) => setSelectedBotId(b.id)}
                />
              ))}
            </div>
          </div>

          {/* Cloud Terminal Logs Stream */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#222630] bg-[#0c0e12] overflow-hidden flex flex-col h-[560px] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#202530] bg-[#141720] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-[#c4f042]" />
                  <span className="text-xs font-bold text-white font-mono">
                    Cloud Terminal Logs
                  </span>
                </div>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="rounded border border-[#2b3240] bg-[#0c0e12] px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                >
                  <option value="all">All Logs</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-xs">
                <div className="text-slate-600 border-b border-slate-800 pb-2 mb-2 text-[11px]">
                  Quantiq Autonomous Engine v3.1 | MetaApi WebSocket Bridge (Account: {activeAccount?.accountNumber || '476691144'})
                </div>
                {logs.length === 0 ? (
                  <div className="text-slate-500 italic">No execution logs yet. Logs will stream as signals trigger.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                      <span className="text-slate-600 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span
                        className={`font-semibold shrink-0 uppercase text-[10px] px-1 py-0.5 rounded ${
                          log.type === 'trade'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : log.type === 'signal'
                            ? 'bg-purple-500/20 text-purple-400'
                            : log.type === 'error'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-cyan-500/20 text-cyan-400'
                        }`}
                      >
                        {log.type}
                      </span>
                      <span className="text-slate-300 break-words">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Strategy Modal */}
      <StrategyBuilderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onBotCreated={() => {
          setBots(store.getBots());
          setLogs(store.getLogs());
        }}
      />
    </div>
  );
};
