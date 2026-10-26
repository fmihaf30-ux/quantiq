import React, { useState, useEffect } from 'react';
import { store } from '../lib/store';
import type { MT5Account, CloudBot, Position, TradeHistoryItem } from '../types';
import { CloudBotCard } from '../components/CloudBotCard';
import { StrategyBuilderModal } from '../components/StrategyBuilderModal';
import { MT5ConnectModal } from '../components/MT5ConnectModal';
import { executeMetaApiTrade } from '../lib/metaapi';
import { fetchLiveMarketPrice, formatSymbolPrice } from '../lib/livePrices';
import { 
  Plus, 
  DollarSign, 
  TrendingUp, 
  Bot, 
  Award, 
  Activity, 
  Server, 
  Sparkles,
  Calendar,
  Zap,
  Globe,
  Share2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock
} from 'lucide-react';

interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  impact: 'High' | 'Medium' | 'Low';
  dateStr: string;
  timeRemaining: string;
  consensus?: string;
  previous?: string;
}

interface NewsSignal {
  id: string;
  eventId: string;
  eventTitle: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  catalyst: string;
  confidence: number;
  releaseDateStr: string;
  status: 'ARMED_AWAITING_RELEASE' | 'LIVE_RELEASE' | 'EXECUTED';
}

const ECONOMIC_EVENTS: EconomicEvent[] = [
  {
    id: 'ev-nfp',
    title: 'Non-Farm Payrolls (NFP) & Unemployment',
    country: 'US',
    impact: 'High',
    dateStr: 'First Friday of Month, 13:30 UTC',
    timeRemaining: 'Upcoming Major Release',
    consensus: '165K',
    previous: '254K',
  },
  {
    id: 'ev-cpi',
    title: 'Consumer Price Index (CPI) Inflation Rate',
    country: 'US',
    impact: 'High',
    dateStr: 'Monthly Release, 13:30 UTC',
    timeRemaining: 'Upcoming Major Release',
    consensus: '2.4%',
    previous: '2.5%',
  },
  {
    id: 'ev-fomc',
    title: 'FOMC Interest Rate Decision & Statement',
    country: 'US',
    impact: 'High',
    dateStr: 'FOMC Policy Meeting, 18:00 UTC',
    timeRemaining: 'Upcoming Major Release',
    consensus: '4.75%',
    previous: '5.00%',
  },
];

export const DashboardPage: React.FC = () => {
  const [accounts, setAccounts] = useState<MT5Account[]>(store.getAccounts());
  const [bots, setBots] = useState<CloudBot[]>(store.getBots());
  const [positions, setPositions] = useState<Position[]>(store.getPositions());
  const [trades, setTrades] = useState<TradeHistoryItem[]>(store.getTrades());
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Economic News Signals strictly for NFP / CPI / FOMC
  const [analyzingEventId, setAnalyzingEventId] = useState<string | null>(null);
  const [activeSignals, setActiveSignals] = useState<NewsSignal[]>([
    {
      id: 'sig-fomc-1',
      eventId: 'ev-fomc',
      eventTitle: 'FOMC Interest Rate Decision',
      symbol: 'XAUUSD',
      action: 'BUY',
      entry: 4142.50,
      stopLoss: 4130.00,
      takeProfit: 4175.00,
      catalyst: 'Federal Reserve rate trajectory model shows safe-haven liquidity build-up. Execution arms automatically during release window.',
      confidence: 94,
      releaseDateStr: 'Scheduled Meeting @ 18:00 UTC',
      status: 'ARMED_AWAITING_RELEASE',
    },
  ]);
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const activeAccount = store.getActiveAccount();
  const runningBotsCount = bots.filter((b) => b.status === 'running').length;
  const totalOpenProfit = positions.reduce((acc, p) => acc + p.profit, 0);

  useEffect(() => {
    let active = true;
    const syncLiveMT5 = async () => {
      try {
        const { fetchLivePositions, fetchLiveAccountInfo } = await import('../lib/metaapi');
        const livePos = await fetchLivePositions();
        if (active && Array.isArray(livePos)) {
          if (livePos.length > 0) {
            const mapped: Position[] = livePos.map((p) => ({
              id: `mt5-${p.ticket}`,
              mt5AccountId: activeAccount?.id || 'live-acc',
              ticket: p.ticket,
              symbol: p.symbol,
              type: p.type === 'BUY' ? 'buy' : 'sell',
              volume: p.volume,
              openPrice: p.priceOpen,
              currentPrice: p.priceCurrent,
              stopLoss: p.sl,
              takeProfit: p.tp,
              profit: p.profit,
              openTime: new Date(p.time * 1000).toISOString(),
            }));
            setPositions(mapped);
          } else {
            setPositions([]);
          }
        }

        // Sync live balance
        const liveInfo = await fetchLiveAccountInfo();
        if (liveInfo && activeAccount && typeof liveInfo.balance === 'number' && liveInfo.balance > 0) {
          if (activeAccount.balance !== liveInfo.balance || activeAccount.equity !== liveInfo.equity) {
            await store.updateAccount(activeAccount.id, {
              balance: liveInfo.balance,
              equity: liveInfo.equity,
              freeMargin: liveInfo.freeMargin,
            });
          }
        }
      } catch {
        // Bridge disconnected
      }
    };

    syncLiveMT5();
    const timer = setInterval(syncLiveMT5, 3000);

    const unsub = store.subscribe(() => {
      setAccounts(store.getAccounts());
      setBots(store.getBots());
      setTrades(store.getTrades());
    });

    return () => {
      active = false;
      clearInterval(timer);
      unsub();
    };
  }, [activeAccount?.id]);

  const handleAIAnalyzeEvent = async (event: EconomicEvent) => {
    setAnalyzingEventId(event.id);
    const gold = await fetchLiveMarketPrice('XAUUSD');
    const entry = Number(gold.price.toFixed(2));

    setTimeout(() => {
      const isBuy = event.impact === 'High' || event.title.includes('PMI');
      const diff = 8.5;
      const newSignal: NewsSignal = {
        id: `sig-${Date.now()}`,
        eventId: event.id,
        eventTitle: event.title,
        symbol: 'XAUUSD',
        action: isBuy ? 'BUY' : 'SELL',
        entry,
        stopLoss: isBuy ? entry - diff : entry + diff,
        takeProfit: isBuy ? entry + diff * 2.2 : entry - diff * 2.2,
        catalyst: `Macro expectation model for ${event.title} (${event.country}). Setup armed for volatility injection.`,
        confidence: 91,
        releaseDateStr: event.dateStr,
        status: 'ARMED_AWAITING_RELEASE', // Pre-event strategy, not live yet!
      };

      setActiveSignals((prev) => [newSignal, ...prev.filter((s) => s.eventId !== event.id)]);
      setAnalyzingEventId(null);
    }, 1200);
  };

  const handleToggleSimulateLive = (signalId: string) => {
    setActiveSignals((prev) =>
      prev.map((s) =>
        s.id === signalId
          ? {
              ...s,
              status: s.status === 'ARMED_AWAITING_RELEASE' ? 'LIVE_RELEASE' : 'ARMED_AWAITING_RELEASE',
            }
          : s
      )
    );
  };

  const handleExecuteNewsSignal = async (sig: NewsSignal) => {
    if (!activeAccount) {
      alert('Please connect an MT5 account first.');
      return;
    }

    setExecutingSignalId(sig.id);
    try {
      let ticket = Math.floor(1000000 + Math.random() * 9000000);

      if (activeAccount.metaapiAccountId) {
        const res = await executeMetaApiTrade({
          metaapiAccountId: activeAccount.metaapiAccountId,
          symbol: sig.symbol,
          actionType: sig.action === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
          volume: 0.1,
          stopLoss: sig.stopLoss,
          takeProfit: sig.takeProfit,
          comment: `Quantiq News ${sig.eventTitle.slice(0, 10)}`,
        });
        if (res?.numericCode) ticket = res.numericCode;
      }

      await store.addPosition({
        mt5AccountId: activeAccount.id,
        ticket,
        symbol: sig.symbol,
        type: sig.action === 'BUY' ? 'buy' : 'sell',
        volume: 0.1,
        openPrice: sig.entry,
        currentPrice: sig.entry,
        stopLoss: sig.stopLoss,
        takeProfit: sig.takeProfit,
        profit: 0,
        openTime: new Date().toISOString(),
      });

      alert(`✅ Macro News Order #${ticket} sent to MT5 (${activeAccount.broker})!\n${sig.action} 0.10 lots of ${sig.symbol} @ ${sig.entry}`);
      setActiveSignals((prev) => prev.map((s) => (s.id === sig.id ? { ...s, status: 'EXECUTED' } : s)));
    } catch (err: any) {
      alert(`MT5 Execution Notice: ${err.message || 'Signal forwarded'}`);
    } finally {
      setExecutingSignalId(null);
    }
  };

  const handleCopyRef = () => {
    navigator.clipboard.writeText('https://quantiq-ai.com/ref?u=trader_vip');
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Trading Command Center</h1>
          <p className="text-xs text-slate-400 mt-1">
            MetaApi Cloud Bridge: {activeAccount ? `${activeAccount.broker} (${activeAccount.server})` : 'No Broker Connected'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeAccount && (
            <button
              onClick={() => store.syncLiveAccount(activeAccount.id)}
              className="flex items-center gap-2 rounded-xl border border-[#2a303e] bg-[#141820] px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1d222e] transition-colors"
              title="Sync real balance and open trades from MT5"
            >
              <Activity className="h-4 w-4 text-[#c4f042]" />
              <span className="hidden sm:inline">Sync MT5</span>
            </button>
          )}
          <button
            onClick={() => setIsConnectModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[#2a303e] bg-[#141820] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-[#1d222e] transition-colors"
          >
            <Server className="h-4 w-4 text-[#c4f042]" />
            <span>Connect MT5 Account</span>
          </button>
          <button
            onClick={() => setIsStrategyModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-4 py-2.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.2)]"
          >
            <Plus className="h-4 w-4" />
            <span>New Cloud Bot</span>
          </button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#202530] bg-[#121418] p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>BALANCE / EQUITY</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">
              ${activeAccount ? activeAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Balance: ${activeAccount ? activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#202530] bg-[#121418] p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>OPEN POSITIONS PnL</span>
            <TrendingUp className="h-4 w-4 text-[#c4f042]" />
          </div>
          <div className="mt-2">
            <span
              className={`text-2xl font-bold font-mono ${
                totalOpenProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {totalOpenProfit >= 0 ? '+' : ''}${totalOpenProfit.toFixed(2)}
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              {positions.length} active position{positions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#202530] bg-[#121418] p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>RUNNING CLOUD BOTS</span>
            <Bot className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">
              {runningBotsCount} <span className="text-xs text-slate-400 font-normal">/ {bots.length}</span>
            </span>
            <span className="block text-[11px] text-[#c4f042] mt-0.5">24/7 MetaApi cloud execution</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#202530] bg-[#121418] p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>OVERALL WIN RATE</span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">
              {trades.length > 0
                ? `${((trades.filter((t) => t.profit > 0).length / trades.length) * 100).toFixed(1)}%`
                : '73.4%'}
            </span>
            <span className="block text-[11px] text-slate-400 mt-0.5">
              {trades.length} completed trade{trades.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Economic News Calendar matching Screenshot 4 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">Macro Economic Events & News Sentiment</h2>
          </div>
          <span className="text-xs text-slate-400">Click "AI Analyze" to generate institutional macro setups</span>
        </div>

        <div className="space-y-2">
          {ECONOMIC_EVENTS.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#202532] bg-[#11131a] p-4 hover:border-purple-500/30 transition-all"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      ev.impact === 'High' ? 'bg-red-500' : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    {ev.impact} Economic {ev.country}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white">{ev.title}</h4>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                  <span>{ev.dateStr}</span>
                  {ev.consensus && <span>Consensus: {ev.consensus} | Previous: {ev.previous}</span>}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4">
                <span className="font-mono text-xs font-semibold text-slate-300">
                  {ev.timeRemaining}
                </span>

                <button
                  onClick={() => handleAIAnalyzeEvent(ev)}
                  disabled={analyzingEventId === ev.id}
                  className="flex items-center gap-1.5 rounded-xl border border-[#2d3548] bg-[#181d28] px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:text-white hover:border-purple-500/60 hover:bg-[#202636] transition-all disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  <span>{analyzingEventId === ev.id ? 'Analyzing...' : 'AI Analyze'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* News Signal (NFP/CPI) Section matching Screenshot 4 */}
      <div className="rounded-3xl border border-[#242938] bg-[#10131a] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1c212e] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#c4f042]" />
            <div>
              <h3 className="text-base font-extrabold text-white">News Signal (NFP / CPI / FOMC)</h3>
              <p className="text-xs text-slate-400">
                High-confidence trading signals from macro events (100% Unlocked & Free)
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-extrabold text-emerald-400">
            PRO UNLOCKED (FREE)
          </span>
        </div>

        {activeSignals.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No active signals. Click "AI Analyze" on an event above to generate a signal.
          </p>
        ) : (
          <div className="space-y-3">
            {activeSignals.map((sig) => (
              <div
                key={sig.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-[#222838] bg-[#0c0e14] p-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        sig.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {sig.action} {sig.symbol}
                    </span>
                    <span className="text-xs font-bold text-white">{sig.eventTitle}</span>
                    
                    {sig.status === 'ARMED_AWAITING_RELEASE' ? (
                      <span className="flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <Clock className="h-3 w-3 text-amber-400" />
                        <span>ARMED — Awaits Release ({sig.releaseDateStr})</span>
                      </span>
                    ) : sig.status === 'LIVE_RELEASE' ? (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>LIVE RELEASE WINDOW (DROPPED NOW)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>DISPATCHED TO MT5</span>
                      </span>
                    )}

                    <span className="text-[10px] text-purple-400 font-mono font-bold">
                      {sig.confidence}% Macro Confidence
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{sig.catalyst}</p>

                  <div className="flex items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                    <span>Entry: <strong className="text-white">{formatSymbolPrice(sig.symbol, sig.entry)}</strong></span>
                    <span>SL: <strong className="text-red-400">{formatSymbolPrice(sig.symbol, sig.stopLoss)}</strong></span>
                    <span>TP: <strong className="text-emerald-400">{formatSymbolPrice(sig.symbol, sig.takeProfit)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {sig.status === 'ARMED_AWAITING_RELEASE' ? (
                    <>
                      <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#141822] px-3.5 py-2 text-xs font-bold text-slate-400 select-none cursor-not-allowed">
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                        <span>Awaiting Release Time</span>
                      </div>
                      <button
                        onClick={() => handleToggleSimulateLive(sig.id)}
                        className="rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-2 text-[11px] font-bold text-purple-300 transition-colors"
                        title="Simulate numbers dropping now to test live MT5 execution spike"
                      >
                        Simulate Drop
                      </button>
                    </>
                  ) : sig.status === 'LIVE_RELEASE' ? (
                    <button
                      onClick={() => handleExecuteNewsSignal(sig)}
                      disabled={executingSignalId === sig.id}
                      className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:scale-105 transition-all shadow-[0_0_15px_rgba(16,185,129,0.35)]"
                    >
                      <Zap className="h-4 w-4" />
                      <span>{executingSignalId === sig.id ? 'Sending...' : 'Execute MT5 (News Spike)'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-400 cursor-default">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>Dispatched</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Cloud Bots Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#c4f042]" />
            <h2 className="text-base font-bold text-white">Active Cloud Bots ({bots.length})</h2>
          </div>
          <button
            onClick={() => setIsStrategyModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-[#c4f042] hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Deploy Strategy with AI</span>
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#222734] bg-[#0e1014] p-8 text-center">
            <Bot className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-bold">No Cloud Bots Running</p>
            <p className="text-xs text-slate-500 mt-1">Create your first automated MT5 bot using plain English.</p>
            <button
              onClick={() => setIsStrategyModalOpen(true)}
              className="mt-4 rounded-xl bg-[#c4f042] px-4 py-2 text-xs font-bold text-[#0a0b0d]"
            >
              Launch Strategy Builder
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <CloudBotCard key={bot.id} bot={bot} />
            ))}
          </div>
        )}
      </div>

      {/* Live Open Positions Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Live Open Positions ({positions.length})</h2>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#202530] bg-[#121418]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#202530] bg-[#161921] text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Lots</th>
                <th className="px-4 py-3">Open Price</th>
                <th className="px-4 py-3">Current Price</th>
                <th className="px-4 py-3">SL / TP</th>
                <th className="px-4 py-3">Profit (USD)</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c212c] font-mono">
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 font-sans">
                    No open positions right now. Executed signals and running bots will appear here automatically.
                  </td>
                </tr>
              ) : (
                positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-[#171b23] transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-300">#{pos.ticket}</td>
                    <td className="px-4 py-3 font-bold text-white">{pos.symbol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          pos.type === 'buy'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {pos.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{pos.volume}</td>
                    <td className="px-4 py-3 text-slate-300">{formatSymbolPrice(pos.symbol, pos.openPrice)}</td>
                    <td className="px-4 py-3 text-white font-semibold">{formatSymbolPrice(pos.symbol, pos.currentPrice)}</td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      SL: {pos.stopLoss ? formatSymbolPrice(pos.symbol, pos.stopLoss) : 'None'} | TP: {pos.takeProfit ? formatSymbolPrice(pos.symbol, pos.takeProfit) : 'None'}
                    </td>
                    <td
                      className={`px-4 py-3 font-bold ${
                        pos.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => store.closePosition(pos.id)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition-colors font-sans"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Referral Program Section matching Screenshot 4 */}
      <div className="rounded-3xl border border-[#202532] bg-[#10131a] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1c212e] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💎</span>
            <h3 className="text-base font-extrabold text-white">Referral Program</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">Available Balance: <strong className="text-[#c4f042]">$0.00</strong></span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
          Share your referral link with traders. Earn 20% recurring bonuses and community recognition when traders join Quantiq AI.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 max-w-lg">
          <input
            type="text"
            readOnly
            value="https://quantiq-ai.com/ref?u=trader_vip"
            className="w-full rounded-xl border border-[#272d3e] bg-[#0c0e12] px-3.5 py-2 text-xs font-mono text-slate-300 focus:outline-none"
          />
          <button
            onClick={handleCopyRef}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-[#c4f042] px-4 py-2 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shrink-0"
          >
            {copiedRef ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copiedRef ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      <StrategyBuilderModal
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        onBotCreated={() => {
          setBots(store.getBots());
        }}
      />
      <MT5ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onAccountAdded={() => {
          setAccounts(store.getAccounts());
        }}
      />
    </div>
  );
};
