import React, { useState } from 'react';
import type { ChartAnalysis, TradeSetup } from '@engine';
import type { MT5Account } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles,
  Zap,
  Server,
  Layers,
  CheckCircle2
} from 'lucide-react';

interface SMCAnalysisCardProps {
  analysis: ChartAnalysis | null;
  isLoading: boolean;
  onDeploySetup?: (setup: TradeSetup) => void;
  onExecuteTrade?: (setup: TradeSetup, lots: number) => void;
  isExecutingTrade?: boolean;
  accounts?: MT5Account[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
}

export const SMCAnalysisCard: React.FC<SMCAnalysisCardProps> = ({
  analysis,
  isLoading,
  onDeploySetup,
  onExecuteTrade,
  isExecutingTrade = false,
  accounts = [],
  selectedAccountId,
  onSelectAccount,
}) => {
  const [lotSize, setLotSize] = useState<number>(0.10);
  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  if (isLoading) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-[#222630] bg-[#121418] p-6 text-center shadow-xl">
        <div className="relative mb-4">
          <div className="h-12 w-12 animate-spin rounded-full border-3 border-[#c4f042] border-t-transparent" />
          <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-[#c4f042] animate-pulse" />
        </div>
        <p className="text-sm font-bold text-white">Scanning Chart with Trish Assistant...</p>
        <p className="mt-1.5 max-w-xs text-xs text-slate-400">
          Detecting Fair Value Gaps, Order Blocks, Liquidity Sweeps, and institutional market structure
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-[#262c38] bg-[#0f1115] p-6 text-center shadow-xl">
        <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-3">
          <Sparkles className="h-6 w-6 text-purple-400" />
        </div>
        <h4 className="text-sm font-bold text-slate-200">AI SMC Chart Intelligence</h4>
        <p className="mt-1 max-w-xs text-xs text-slate-400 leading-relaxed">
          Click <span className="font-bold text-[#c4f042]">"Scan Chart with Trish AI"</span> above to analyze market bias, fair value gaps, and execute instant MT5 orders.
        </p>
      </div>
    );
  }

  const isBull = analysis.bias === 'bullish';
  const isBear = analysis.bias === 'bearish';

  return (
    <div className="flex flex-col space-y-4 rounded-2xl border border-[#222630] bg-[#121418] p-5 shadow-2xl">
      {/* Header & Bias */}
      <div className="flex items-center justify-between border-b border-[#222630] pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isBull
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : isBear
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
            }`}
          >
            {isBull ? (
              <TrendingUp className="h-5 w-5" />
            ) : isBear ? (
              <TrendingDown className="h-5 w-5" />
            ) : (
              <Minus className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold uppercase tracking-wide text-white">
                {analysis.bias} BIAS
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  analysis.confidence === 'high'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : analysis.confidence === 'medium'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-500/20 text-slate-400'
                }`}
              >
                {analysis.confidence} CONFIDENCE
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Source: {analysis.source === 'gemini' ? 'Trish Assistant (Google Gemini Vision)' : 'Institutional SMC Engine'}
            </span>
          </div>
        </div>
      </div>

      {/* Target MT5 Account Selector */}
      <div className="rounded-xl border border-[#222632] bg-[#0e1014] p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Server className="h-3.5 w-3.5 text-[#c4f042]" />
            <span>Target MT5 Terminal</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bridge Active
          </span>
        </div>

        {accounts.length > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedAccountId || activeAccount?.id}
              onChange={(e) => onSelectAccount?.(e.target.value)}
              className="flex-1 rounded-lg border border-[#2a303e] bg-[#141820] px-3 py-1.5 text-xs font-mono text-white focus:border-[#c4f042] focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.broker} ({acc.accountNumber}) — ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 bg-[#141820] border border-[#2a303e] px-2.5 py-1.5 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold">LOTS:</span>
              <input
                type="number"
                min={0.01}
                max={10.0}
                step={0.01}
                value={lotSize}
                onChange={(e) => setLotSize(parseFloat(e.target.value) || 0.01)}
                className="w-12 bg-transparent text-xs font-mono font-bold text-white focus:outline-none text-right"
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-300 flex items-center justify-between">
            <span>No connected MT5 account found.</span>
            <a href="/accounts" className="text-[#c4f042] underline font-bold">Connect Broker</a>
          </div>
        )}
      </div>

      {/* Summary */}
      <p className="text-xs leading-relaxed text-slate-300 bg-[#0e1014] p-3 rounded-xl border border-[#1e222c]">
        {analysis.summary}
      </p>

      {/* Actionable Setups */}
      {analysis.setups.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Actionable Trade Setup
            </span>
            <span className="text-[10px] text-[#c4f042] font-semibold">1-Click MT5 Dispatch</span>
          </div>

          {analysis.setups.map((setup, i) => (
            <div
              key={i}
              className="flex flex-col gap-2.5 rounded-xl border border-[#242938] bg-[#161922] p-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex items-center font-extrabold text-sm ${
                    setup.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {setup.direction === 'buy' ? (
                    <ArrowUpRight className="mr-1 h-5 w-5" />
                  ) : (
                    <ArrowDownRight className="mr-1 h-5 w-5" />
                  )}
                  {setup.direction.toUpperCase()} ENTRY
                </span>

                <div className="flex items-center gap-2">
                  {onExecuteTrade && (
                    <button
                      onClick={() => onExecuteTrade(setup, lotSize)}
                      disabled={isExecutingTrade || accounts.length === 0}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 disabled:opacity-50"
                      title="Send instant market order directly to connected MT5 account"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isExecutingTrade ? 'Executing...' : 'Execute MT5'}</span>
                    </button>
                  )}
                  {onDeploySetup && (
                    <button
                      onClick={() => onDeploySetup(setup)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#c4f042] px-3 py-1.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all"
                      title="Create 24/7 autonomous cloud bot from this setup"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Deploy Bot</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Price Grid */}
              <div className="grid grid-cols-3 gap-2 font-mono text-center">
                <div className="rounded-lg bg-[#0e1014] p-2 border border-[#202530]">
                  <span className="block text-[10px] text-slate-400 font-sans font-semibold">ENTRY</span>
                  <span className="font-bold text-white text-xs">{setup.entry.toFixed(2)}</span>
                </div>
                <div className="rounded-lg bg-[#0e1014] p-2 border border-[#202530]">
                  <span className="block text-[10px] text-red-400 font-sans font-semibold">STOP LOSS</span>
                  <span className="font-bold text-red-400 text-xs">{setup.stopLoss.toFixed(2)}</span>
                </div>
                <div className="rounded-lg bg-[#0e1014] p-2 border border-[#202530]">
                  <span className="block text-[10px] text-emerald-400 font-sans font-semibold">TAKE PROFIT</span>
                  <span className="font-bold text-emerald-400 text-xs">{setup.takeProfit.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 italic bg-[#111319] p-2 rounded-lg border border-[#1d222e]">
                {setup.rationale}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SMC Levels & Fair Value Gaps */}
      {analysis.keyLevels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <span>SMC Levels & Fair Value Gaps</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 font-mono text-xs max-h-40 overflow-y-auto pr-1">
            {analysis.keyLevels.map((lvl, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-[#0e1014] px-3 py-1.5 border border-[#1f2430]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      lvl.kind === 'support'
                        ? 'bg-emerald-400'
                        : lvl.kind === 'resistance'
                        ? 'bg-red-400'
                        : lvl.kind === 'fvg'
                        ? 'bg-amber-400'
                        : 'bg-purple-400'
                    }`}
                  />
                  <span className="text-slate-200 font-bold">{lvl.price.toFixed(2)}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 font-sans">
                    ({lvl.kind})
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-sans">{lvl.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Warnings */}
      {analysis.risks.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Institutional Risk Factors</span>
          </div>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-400 space-y-0.5">
            {analysis.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
