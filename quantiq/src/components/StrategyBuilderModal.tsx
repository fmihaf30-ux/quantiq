import React, { useState, useEffect } from 'react';
import { 
  specFromPrompt, 
  backtest, 
  ENGINE_INFO, 
  type StrategySpec, 
  type Candle, 
  type BacktestResult 
} from '@engine';
import { store } from '../lib/store';
import { generateSyntheticCandles } from '../lib/mockStore';
import { X, Sparkles, Play, CheckCircle2, Sliders, ArrowRight } from 'lucide-react';

interface StrategyBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialSymbol?: string;
  onBotCreated?: () => void;
}

const PRESET_PROMPTS = [
  'EMA 9 and 21 crossover on Gold (XAUUSD) M15 with 1:2 reward risk and trend filter',
  'Fast momentum scalper on EURUSD M5 using RSI 14 and tight stops',
  'Channel breakout strategy on Bitcoin (BTCUSD) using 20-candle high/low',
  'Mean reversion RSI bounce for range trading with 0.1 lots',
];

export const StrategyBuilderModal: React.FC<StrategyBuilderModalProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
  initialSymbol = 'XAUUSD',
  onBotCreated,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt || PRESET_PROMPTS[0]);
  const [spec, setSpec] = useState<StrategySpec>(() =>
    specFromPrompt(initialPrompt || PRESET_PROMPTS[0])
  );
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const accounts = store.getAccounts();

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // When prompt changes, parse spec and run quick backtest
  const handleParse = (text: string) => {
    setPrompt(text);
    const parsed = specFromPrompt(text);
    setSpec(parsed);

    // Run backtest on 200 market wave candles
    const sampleCandles = generateSyntheticCandles(parsed.symbol, 200);
    const res = backtest(parsed, sampleCandles);
    setBacktestResult(res);
  };

  useEffect(() => {
    if (isOpen) {
      handleParse(prompt);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeploy = async () => {
    await store.createBot(
      spec.name,
      spec.symbol,
      spec.timeframe,
      spec,
      selectedAccountId
    );
    alert(`🤖 Cloud Bot Built & Deployed!\n\nBot Name: "${spec.name}"\nAsset: ${spec.symbol} • ${spec.timeframe}\nEngine: ${ENGINE_INFO[spec.engine].label}\nStatus: RUNNING 24/7 autonomous monitoring on connected account.`);
    if (onBotCreated) onBotCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#2a303e] bg-[#121418] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222630] px-6 py-4 bg-[#161921]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c4f042]/20 text-[#c4f042]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">AI Strategy Intent Builder</h3>
              <p className="text-xs text-slate-400">Describe your strategy in plain English or refine the rules</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#202532] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Prompt input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Strategy Description</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => handleParse(e.target.value)}
              placeholder="e.g. Scalping bot on XAUUSD M5 with EMA 9/21 cross and 1:2 RR"
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] p-3 text-xs text-white placeholder-slate-500 focus:border-[#c4f042] focus:outline-none"
            />
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_PROMPTS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleParse(p)}
                className="rounded-full border border-[#222734] bg-[#171b24] px-2.5 py-1 text-[11px] text-slate-300 hover:border-[#c4f042]/40 hover:text-white transition-colors"
              >
                Preset {i + 1}
              </button>
            ))}
          </div>

          {/* Engine & Configuration Card */}
          <div className="rounded-xl border border-[#242938] bg-[#161a22] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#c4f042]">
                <CheckCircle2 className="h-4 w-4" />
                Parsed Engine: {ENGINE_INFO[spec.engine].label}
              </span>
              <span className="rounded bg-[#202533] px-2 py-0.5 text-[11px] font-mono text-slate-300">
                {spec.symbol} • {spec.timeframe}
              </span>
            </div>

            <p className="text-xs text-slate-300">{spec.summary}</p>

            {/* Generated Execution Rules */}
            <div className="rounded-lg bg-[#0d0f13] p-3 text-xs font-mono space-y-1 border border-[#1e2330]">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                Active Execution Rules:
              </span>
              {spec.rules.map((rule, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                  <span className="text-[#c4f042]">›</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>

            {/* Risk & Order Sizing */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
              <div className="rounded bg-[#0d0f13] p-2 border border-[#1e2330]">
                <span className="block text-[10px] text-slate-400 mb-0.5">LOT SIZING</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  value={spec.risk.lotSize}
                  onChange={(e) => setSpec({ ...spec, risk: { ...spec.risk, lotSize: parseFloat(e.target.value) || 0.01 } })}
                  className="w-20 bg-transparent text-center font-bold text-white focus:outline-none border-b border-[#2a303e] hover:border-[#c4f042]"
                />
              </div>
              <div className="rounded bg-[#0d0f13] p-2 border border-[#1e2330]">
                <span className="block text-[10px] text-slate-400 mb-0.5">STOP ATR MULTIPLE</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5"
                  value={spec.risk.stopAtrMultiple}
                  onChange={(e) => setSpec({ ...spec, risk: { ...spec.risk, stopAtrMultiple: parseFloat(e.target.value) || 1.5 } })}
                  className="w-20 bg-transparent text-center font-bold text-amber-400 focus:outline-none border-b border-[#2a303e] hover:border-amber-400"
                />
              </div>
              <div className="rounded bg-[#0d0f13] p-2 border border-[#1e2330]">
                <span className="block text-[10px] text-slate-400 mb-0.5">MIN REWARD/RISK</span>
                <div className="flex items-center justify-center gap-0.5">
                  <span className="text-emerald-400 font-bold">1:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="1.5"
                    max="10"
                    value={spec.risk.rewardRisk}
                    onChange={(e) => setSpec({ ...spec, risk: { ...spec.risk, rewardRisk: parseFloat(e.target.value) || 2.0 } })}
                    className="w-14 bg-transparent text-center font-bold text-emerald-400 focus:outline-none border-b border-[#2a303e] hover:border-emerald-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Backtest Projection */}
          {backtestResult && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Sliders className="h-4 w-4" />
                Simulated 200-Candle Backtest
              </span>
              <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
                <div>
                  <span className="block text-[10px] text-slate-400">TRADES</span>
                  <span className="font-bold text-white">{backtestResult.stats.trades}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">WIN RATE</span>
                  <span className="font-bold text-emerald-400">
                    {(backtestResult.stats.winRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">NET R</span>
                  <span className="font-bold text-white">+{backtestResult.stats.netR.toFixed(1)}R</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">PROFIT FACTOR</span>
                  <span className="font-bold text-emerald-400">
                    {backtestResult.stats.profitFactor.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Destination MT5 Account */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Deploy To MT5 Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] p-2.5 text-xs text-white focus:border-[#c4f042] focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.broker} • #{acc.accountNumber} ({acc.accountName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#222630] px-6 py-4 bg-[#161921]">
          <span className="text-[11px] text-slate-400">Runs 24/7 on MetaApi cloud connection</span>
          <button
            onClick={handleDeploy}
            className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-5 py-2.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.3)]"
          >
            <Play className="h-4 w-4 fill-[#0a0b0d]" />
            <span>Deploy Cloud Bot</span>
          </button>
        </div>
      </div>
    </div>
  );
};
