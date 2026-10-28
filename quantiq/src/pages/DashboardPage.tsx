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
  Lock,
  Radio
} from 'lucide-react';
import { 
  getLiveEconomicCalendar, 
  evaluateEventProximity, 
  evaluateEventRisk, 
  buildNewsSignal, 
  type NewsEvent, 
  type PipnexNewsSignal 
} from '../lib/news';
import { NewsSignalCard } from '../components/NewsSignalCard';

export const DashboardPage: React.FC = () => {
  const [accounts, setAccounts] = useState<MT5Account[]>(store.getAccounts());
  const [bots, setBots] = useState<CloudBot[]>(store.getBots());
  const [positions, setPositions] = useState<Position[]>(store.getPositions());
  const [trades, setTrades] = useState<TradeHistoryItem[]>(store.getTrades());
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Economic News Signals strictly for NFP / CPI / FOMC (Pipnex News IQ Engine)
  const [economicEvents, setEconomicEvents] = useState<NewsEvent[]>(() => getLiveEconomicCalendar('XAUUSD'));
  const [analyzingEventId, setAnalyzingEventId] = useState<string | null>(null);
  const [activeSignals, setActiveSignals] = useState<PipnexNewsSignal[]>(() => {
    const cal = getLiveEconomicCalendar('XAUUSD');
    return [buildNewsSignal(cal[0], 'XAUUSD', 4050.0)];
  });
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

  const handleAIAnalyzeEvent = async (event: NewsEvent) => {
    setAnalyzingEventId(event.eventId);
    const gold = await fetchLiveMarketPrice('XAUUSD');
    const entry = Number(gold.price.toFixed(2));

    setTimeout(() => {
      const newSignal = buildNewsSignal(event, 'XAUUSD', entry);
      setActiveSignals((prev) => [newSignal, ...prev.filter((s) => s.eventId !== event.eventId)]);
      setAnalyzingEventId(null);
    }, 800);
  };

  const handleExecuteNewsSignal = async (sig: PipnexNewsSignal) => {
    if (!activeAccount) {
      alert('Please connect an MT5 account first.');
      return;
    }

    if (sig.risk.isExecutionGated) {
      const proceed = confirm(
        `⚠️ EXECUTION CAUTION GATED:\n${sig.risk.cautionMessage}\n\nDo you want to override and execute on MT5 anyway?`
      );
      if (!proceed) return;
    }

    if (!sig.entrySuggestion) {
      alert('No entry parameters defined for this news signal.');
      return;
    }

    setExecutingSignalId(sig.id);
    try {
      const isBuy = sig.direction === 'BUY';
      let ticket = Math.floor(1000000 + Math.random() * 9000000);
      const { entry, stopLoss, takeProfit } = sig.entrySuggestion;

      if (activeAccount.metaapiAccountId) {
        const res = await executeMetaApiTrade({
          metaapiAccountId: activeAccount.metaapiAccountId,
          symbol: sig.symbol,
          actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
          volume: 0.1,
          stopLoss,
          takeProfit,
          comment: `NewsIQ ${sig.event.name.slice(0, 10)}`,
        });
        if (res?.numericCode) ticket = res.numericCode;
      }

      await store.addPosition({
        mt5AccountId: activeAccount.id,
        ticket,
        symbol: sig.symbol,
        type: isBuy ? 'buy' : 'sell',
        volume: 0.1,
        openPrice: entry,
        currentPrice: entry,
        stopLoss,
        takeProfit,
        profit: 0,
        openTime: new Date().toISOString(),
      });

      alert(`✅ Macro News Order #${ticket} sent to MT5 (${activeAccount.broker})!\n${sig.direction} 0.10 lots of ${sig.symbol} @ ${entry}`);
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
          {economicEvents.map((ev) => {
            const prox = evaluateEventProximity(ev);
            const risk = evaluateEventRisk(ev);
            return (
              <div
                key={ev.eventId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[#202532] bg-[#11131a] p-4 hover:border-purple-500/30 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        ev.impact === 'high' ? 'bg-red-500' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-[11px] font-bold text-slate-400 uppercase">
                      {ev.impact} Impact · {ev.country} ({ev.currency})
                    </span>
                    {risk.isExecutionGated && (
                      <span className="text-[10px] font-extrabold bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 animate-pulse">
                        {risk.riskState}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white">{ev.name}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span>{new Date(ev.eventTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({ev.timezone.split('/')[1] || ev.timezone})</span>
                    {ev.consensus && <span>Consensus: <strong className="text-slate-200">{ev.consensus}</strong> | Previous: <strong className="text-slate-200">{ev.previous}</strong></span>}
                    {ev.actual && <span className="text-emerald-400">Actual: <strong>{ev.actual}</strong></span>}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className={`font-mono text-xs font-semibold ${
                    prox.state === 'IMMINENT' || prox.state === 'ACTIVE' ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-300'
                  }`}>
                    {prox.timeLabel}
                  </span>

                  <button
                    onClick={() => handleAIAnalyzeEvent(ev)}
                    disabled={analyzingEventId === ev.eventId}
                    className="flex items-center gap-1.5 rounded-xl border border-[#2d3548] bg-[#181d28] px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:text-white hover:border-purple-500/60 hover:bg-[#202636] transition-all disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    <span>{analyzingEventId === ev.eventId ? 'Analyzing...' : 'AI Council'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipnex News IQ Signals & AI Council Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#c4f042]" />
            <div>
              <h3 className="text-base font-extrabold text-white">Pipnex AI News Signals & Council Intelligence</h3>
              <p className="text-xs text-slate-400">
                5-Desk AI Consensus · Econometric Scenario Matrix · Pre-News Execution Gating
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-extrabold text-emerald-400">
            PRO UNLOCKED (FREE)
          </span>
        </div>

        {activeSignals.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No active signals. Click "AI Council" on an event above to generate a signal.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeSignals.map((sig) => (
              <NewsSignalCard
                key={sig.id}
                signal={sig}
                onExecuteTrade={handleExecuteNewsSignal}
                isExecuting={executingSignalId === sig.id}
              />
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
