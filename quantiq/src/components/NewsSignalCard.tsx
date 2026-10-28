import React, { useState } from 'react';
import type { PipnexNewsSignal, AnalystLane } from '../lib/news';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  Users, 
  BarChart2, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Send,
  Lock
} from 'lucide-react';
import { formatSymbolPrice } from '../lib/livePrices';

export interface NewsSignalCardProps {
  signal: PipnexNewsSignal;
  onExecuteTrade?: (sig: PipnexNewsSignal) => void;
  isExecuting?: boolean;
}

export const NewsSignalCard: React.FC<NewsSignalCardProps> = ({
  signal,
  onExecuteTrade,
  isExecuting = false,
}) => {
  const [showLanes, setShowLanes] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  const { event, council, econometric, proximity, risk, entrySuggestion } = signal;
  const isBuy = signal.direction === 'BUY';
  const isImminent = risk.isExecutionGated;

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      isImminent 
        ? 'bg-[#120d18] border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
        : 'bg-[#0e121b] border-[#1e2538] hover:border-purple-500/40 shadow-lg'
    }`}>
      {/* Top Banner: Proximity & Risk State */}
      <div className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-mono font-bold ${
        risk.riskState === 'IMMINENT' || risk.riskState === 'ACTIVE'
          ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          : risk.riskState === 'HIGH'
          ? 'bg-amber-950/30 border-amber-500/30 text-amber-300'
          : 'bg-[#131826] border-[#1a2133] text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-purple-400" />
          <span>{proximity.timeLabel}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">{event.country} ({event.currency})</span>
        </div>

        <div className="flex items-center gap-2">
          {risk.riskState === 'IMMINENT' && (
            <span className="flex items-center gap-1 text-[11px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 animate-pulse">
              <ShieldAlert className="h-3 w-3" />
              <span>IMMINENT HAZARD</span>
            </span>
          )}
          {risk.riskState === 'HIGH' && (
            <span className="flex items-center gap-1 text-[11px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
              <AlertTriangle className="h-3 w-3" />
              <span>HIGH RISK</span>
            </span>
          )}
          {risk.riskState === 'NORMAL' && (
            <span className="flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
              <ShieldCheck className="h-3 w-3" />
              <span>NORMAL RISK</span>
            </span>
          )}
          {risk.riskState === 'POST_EVENT' && (
            <span className="flex items-center gap-1 text-[11px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/30">
              <Zap className="h-3 w-3" />
              <span>ABSORPTION</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Event Header & Data Points */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                event.impact === 'high'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {event.impact} IMPACT
              </span>
              <span className="text-xs text-purple-400 font-bold uppercase">{event.category || 'Macro'}</span>
            </div>
            <h3 className="text-base font-extrabold text-white">{event.name}</h3>
          </div>

          {/* Historical vs Consensus Stats */}
          <div className="flex items-center gap-3 bg-[#0a0d14] px-3 py-2 rounded-xl border border-[#1b2233] text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Consensus</span>
              <span className="font-bold text-white">{event.consensus || 'N/A'}</span>
            </div>
            <div className="h-6 w-[1px] bg-[#1f2637]" />
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Previous</span>
              <span className="font-bold text-slate-300">{event.previous || 'N/A'}</span>
            </div>
            {event.actual && (
              <>
                <div className="h-6 w-[1px] bg-[#1f2637]" />
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Actual</span>
                  <span className="font-extrabold text-emerald-400">{event.actual}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* AI Council Consensus Box */}
        <div className="rounded-xl border border-[#21293c] bg-[#111624] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2333] pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl flex items-center justify-center ${
                isBuy ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}>
                {isBuy ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-black ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                    AI COUNCIL: {signal.direction} {signal.symbol}
                  </span>
                  <span className="text-xs font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-lg">
                    {signal.confidencePct}% Conviction
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vote: {council.voteTally.buy} BUY / {council.voteTally.sell} SELL / {council.voteTally.neutral} NEUTRAL
                </p>
              </div>
            </div>

            {/* Expected Volatility Tag */}
            <div className="text-right font-mono text-xs">
              <span className="text-[10px] text-slate-500 block uppercase">Expected Range</span>
              <span className="font-bold text-amber-300">±{econometric.expectedRangePips} Pips</span>
            </div>
          </div>

          {/* Cross-Asset Drivers Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            {council.drivers.map((d, i) => (
              <div key={i} className="bg-[#0b0e16] p-2 rounded-lg border border-[#1b2234]">
                <span className="text-[10px] text-slate-400 font-bold block truncate">{d.asset}</span>
                <span className={`font-black ${
                  d.direction === 'Bullish' ? 'text-emerald-400' : d.direction === 'Bearish' ? 'text-rose-400' : 'text-slate-300'
                }`}>
                  {d.direction}
                </span>
              </div>
            ))}
          </div>

          {/* Toggle 5-Analyst Desk Breakdown */}
          <button
            onClick={() => setShowLanes(!showLanes)}
            className="w-full flex items-center justify-between text-xs font-bold text-purple-400 hover:text-purple-300 pt-1"
          >
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {showLanes ? 'Hide 5-Analyst Desk Breakdown' : 'View 5-Analyst Institutional Desk Breakdown'}
            </span>
            {showLanes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Expanded 5-Analyst Desks */}
          {showLanes && (
            <div className="space-y-2 pt-2 border-t border-[#1d2435]">
              {Object.values(council.lanes).map((lane: AnalystLane, idx) => (
                <div key={idx} className="bg-[#0b0f19] p-2.5 rounded-lg border border-[#1a2133] text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-white flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                      {lane.agentName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        lane.vote === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : lane.vote === 'SELL' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {lane.vote} ({lane.convictionPct}%)
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{lane.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Econometric Probabilities & Scenarios */}
        <div className="rounded-xl border border-[#1b2234] bg-[#0c101a] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-purple-400" />
              Econometric Distribution Probabilities
            </span>
            {econometric.isCoinFlip && (
              <span className="text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Binary Trap Hazard (Coin-Flip Risk)
              </span>
            )}
          </div>

          {/* Probability Bars */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="bg-[#111624] p-2 rounded-lg border border-[#1e2538]">
              <span className="text-[10px] text-slate-400 block uppercase">Beat</span>
              <span className="font-extrabold text-emerald-400 text-sm">{econometric.probabilities.beat}%</span>
            </div>
            <div className="bg-[#111624] p-2 rounded-lg border border-[#1e2538]">
              <span className="text-[10px] text-slate-400 block uppercase">Meet</span>
              <span className="font-extrabold text-sky-400 text-sm">{econometric.probabilities.meet}%</span>
            </div>
            <div className="bg-[#111624] p-2 rounded-lg border border-[#1e2538]">
              <span className="text-[10px] text-slate-400 block uppercase">Miss</span>
              <span className="font-extrabold text-rose-400 text-sm">{econometric.probabilities.miss}%</span>
            </div>
          </div>

          {/* Toggle Scenarios */}
          <button
            onClick={() => setShowScenarios(!showScenarios)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white pt-1"
          >
            <span>{showScenarios ? 'Hide Reaction Matrix' : 'View 3-Way Economic Reaction Matrix'}</span>
            {showScenarios ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {/* Expanded Reaction Scenarios */}
          {showScenarios && (
            <div className="space-y-2 pt-2 border-t border-[#1c2333]">
              {econometric.scenarios.map((sc, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-[#080b12] border border-[#1a2133] text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{sc.outcome}</span>
                    <span className="font-mono text-purple-300 font-bold">{sc.expectedDisplacementPips}</span>
                  </div>
                  <p className="text-slate-400">{sc.marketReaction}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execution Gating & Action Controls */}
        <div className="pt-2">
          {isImminent ? (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-start gap-3 text-xs text-rose-300">
              <Lock className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Execution Gated (Safety Halt)</span>
                <p className="text-[11px] text-rose-300/80 mt-0.5">{risk.cautionMessage}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0a0d14] p-3 rounded-xl border border-[#1b2233]">
              {entrySuggestion && (
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Entry</span>
                    <span className="font-bold text-white">${formatSymbolPrice(signal.symbol, entrySuggestion.entry)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400 block uppercase">Stop Loss</span>
                    <span className="font-bold text-rose-300">${formatSymbolPrice(signal.symbol, entrySuggestion.stopLoss)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block uppercase">Target (2.3R)</span>
                    <span className="font-bold text-emerald-300">${formatSymbolPrice(signal.symbol, entrySuggestion.takeProfit)}</span>
                  </div>
                </div>
              )}

              {onExecuteTrade && (
                <button
                  onClick={() => onExecuteTrade(signal)}
                  disabled={isExecuting}
                  className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    isBuy
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                      : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isExecuting ? 'Sending to MT5...' : `Execute ${signal.direction} (${signal.symbol})`}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
