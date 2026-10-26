import React, { useState, useEffect } from 'react';
import { store, type GlobalRiskSettings } from '../lib/store';
import { X, ShieldCheck, Percent, Sliders, Target, Check, AlertTriangle, TrendingUp, Crosshair, Clock } from 'lucide-react';

interface GlobalRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalRiskModal: React.FC<GlobalRiskModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<GlobalRiskSettings>(store.getRiskSettings());
  const activeAccount = store.getActiveAccount();
  const balance = activeAccount?.balance || 100;

  useEffect(() => {
    setSettings(store.getRiskSettings());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    store.setRiskSettings(settings);
    onClose();
  };

  const cashRisk = settings.mode === 'RISK_PCT' 
    ? (balance * (settings.riskPercent / 100))
    : (settings.fixedLot * 100 * 5.0); // estimated for gold

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-3xl border border-[#2a303e] bg-[#121418] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222630] px-6 py-4 bg-[#161921]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c4f042]/20 text-[#c4f042]">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Global Risk & Position Controls</h3>
              <p className="text-xs text-slate-400">Enforces sizing & limits across all trading tabs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#202532] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Position Sizing Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">Position Sizing Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, mode: 'RISK_PCT' })}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                  settings.mode === 'RISK_PCT'
                    ? 'border-[#c4f042] bg-[#c4f042]/10 text-white shadow-[0_0_12px_rgba(196,240,66,0.15)]'
                    : 'border-[#252c3c] bg-[#0c0f16] text-slate-400 hover:border-slate-600'
                }`}
              >
                <div>
                  <span className="block font-bold">Account Risk %</span>
                  <span className="text-[10px] text-slate-400">Dynamic lot for SL distance</span>
                </div>
                {settings.mode === 'RISK_PCT' && <Check className="h-4 w-4 text-[#c4f042]" />}
              </button>

              <button
                type="button"
                onClick={() => setSettings({ ...settings, mode: 'FIXED_LOT' })}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                  settings.mode === 'FIXED_LOT'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                    : 'border-[#252c3c] bg-[#0c0f16] text-slate-400 hover:border-slate-600'
                }`}
              >
                <div>
                  <span className="block font-bold">Fixed Lot Size</span>
                  <span className="text-[10px] text-slate-400">Static volume per trade</span>
                </div>
                {settings.mode === 'FIXED_LOT' && <Check className="h-4 w-4 text-indigo-400" />}
              </button>
            </div>
          </div>

          {/* Sizing Value Picker */}
          {settings.mode === 'RISK_PCT' ? (
            <div className="rounded-2xl border border-[#232a3c] bg-[#0c0f16] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-300 block text-xs">Risk % per Trade:</span>
                  <span className="text-[10px] text-slate-500">Auto-calculates lot size by Stop Loss distance</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#141924] border border-[#2b3346] px-2.5 py-1.5 rounded-xl">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="50"
                    value={settings.riskPercent}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSettings({ ...settings, riskPercent: isNaN(val) ? 0 : val });
                    }}
                    className="w-16 bg-transparent font-mono font-extrabold text-[#c4f042] text-sm text-right focus:outline-none"
                  />
                  <span className="font-bold text-[#c4f042] text-xs">%</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Quick Presets:</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.5, 1.0, 1.5, 2.0, 3.0].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setSettings({ ...settings, riskPercent: pct })}
                      className={`rounded-xl py-1 text-xs font-bold transition-all ${
                        settings.riskPercent === pct
                          ? 'bg-[#c4f042] text-[#0a0b0d] font-extrabold shadow-[0_0_10px_rgba(196,240,66,0.3)]'
                          : 'bg-[#151922] text-slate-400 hover:text-white border border-[#202738]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#1a202c] pt-2 text-[11px] font-mono text-slate-400">
                <span>Account Balance: <strong className="text-white">${balance.toFixed(2)}</strong></span>
                <span>Max Cash Risk: <strong className="text-rose-400">-${cashRisk.toFixed(2)}</strong></span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#232a3c] bg-[#0c0f16] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-300">Fixed Contract Volume:</label>
                  <span className="text-[10px] text-slate-500">Static lots used for every trade</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#141924] border border-[#2b3346] px-2.5 py-1.5 rounded-xl">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="20"
                    value={settings.fixedLot}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSettings({ ...settings, fixedLot: isNaN(val) ? 0.01 : val });
                    }}
                    className="w-16 bg-transparent font-mono font-extrabold text-indigo-400 text-sm text-right focus:outline-none"
                  />
                  <span className="font-bold text-indigo-400 text-xs">Lots</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Quick Presets:</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.01, 0.02, 0.05, 0.10, 0.50].map((vol) => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => setSettings({ ...settings, fixedLot: vol })}
                      className={`rounded-xl py-1 text-xs font-bold transition-all ${
                        settings.fixedLot === vol
                          ? 'bg-indigo-600 text-white font-extrabold shadow'
                          : 'bg-[#151922] text-slate-400 hover:text-white border border-[#202738]'
                      }`}
                    >
                      {vol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Max Concurrent Open Trades */}
          <div className="rounded-2xl border border-[#232a3c] bg-[#0c0f16] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-300 block">Max Concurrent Trades</span>
                <span className="text-[10px] text-slate-400">Limit active open positions across all tabs</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#141924] border border-[#2b3346] px-2.5 py-1 rounded-xl">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={settings.maxTrades}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSettings({ ...settings, maxTrades: isNaN(val) || val < 1 ? 1 : val });
                  }}
                  className="w-10 bg-transparent font-mono font-extrabold text-[#c4f042] text-sm text-right focus:outline-none"
                />
                <span className="font-bold text-[#c4f042] text-xs">Max</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 5, 10].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSettings({ ...settings, maxTrades: count })}
                  className={`rounded-xl py-1.5 text-xs font-bold transition-all ${
                    settings.maxTrades === count
                      ? 'bg-[#c4f042] text-[#0a0b0d] font-extrabold shadow-[0_0_10px_rgba(196,240,66,0.3)]'
                      : 'bg-[#151922] text-slate-400 hover:text-white border border-[#202738]'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Breakeven Guard */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white block">Auto Breakeven Guard</span>
                  <span className="text-[10px] text-emerald-300">Triggers only after full R multiple is achieved</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.autoBreakeven}
                onChange={(e) => setSettings({ ...settings, autoBreakeven: e.target.checked })}
                className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
              />
            </div>

            {settings.autoBreakeven && (
              <div className="flex items-center justify-between bg-[#10161a] border border-emerald-500/30 rounded-xl p-2 text-xs">
                <span className="text-slate-300 font-semibold text-[11px]">Breakeven Milestone:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-[10px]">
                  {[1.0, 1.2, 1.5].map((rVal) => (
                    <button
                      key={rVal}
                      type="button"
                      onClick={() => setSettings({ ...settings, breakevenTriggerR: rVal })}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        (settings.breakevenTriggerR || 1.0) === rVal
                          ? 'bg-emerald-500 text-slate-950 font-extrabold shadow'
                          : 'bg-[#152026] text-slate-400 hover:text-white'
                      }`}
                    >
                      +{rVal}R {rVal === 1.2 ? '(Recommended)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Moves Stop Loss to Breakeven once the position reaches at least <strong>+{settings.breakevenTriggerR || 1.0}R profit</strong> (e.g. +$55 profit on $55 risk). Gives the trade complete room to breathe and never suffocates early pullbacks!
            </p>
          </div>

          {/* Smart Step Trailing SL */}
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                <div>
                  <span className="font-bold text-white block">Smart Step Trailing SL</span>
                  <span className="text-[10px] text-indigo-300">Locks +0.75R @ +1.5R & +1.40R @ +2.0R</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.trailingStop}
                onChange={(e) => setSettings({ ...settings, trailingStop: e.target.checked })}
                className="h-4 w-4 rounded accent-indigo-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Systematically steps Stop Loss forward as the trade runs in profit: locks in +0.75R profit at +1.5R, +1.4R profit at +2.0R, and trails runners dynamically. Never give back big gains on sudden market reversals!
            </p>
          </div>

          {/* AI Order Dispatch Mode (Smart Limit vs Market) */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-sky-400" />
                <div>
                  <span className="font-bold text-white block">Order Dispatch Mode</span>
                  <span className="text-[10px] text-sky-300">Determines Market vs Pending Limit routing</span>
                </div>
              </div>
              <span className="text-xs font-mono font-extrabold text-sky-400 uppercase">
                {settings.orderDispatchMode || 'AUTO'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, orderDispatchMode: 'AUTO' })}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                  (settings.orderDispatchMode || 'AUTO') === 'AUTO'
                    ? 'bg-sky-500 text-slate-950 font-extrabold border-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                    : 'bg-[#151922] text-slate-400 hover:text-white border-[#242c3e]'
                }`}
              >
                AUTO (SMC)
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, orderDispatchMode: 'MARKET' })}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                  settings.orderDispatchMode === 'MARKET'
                    ? 'bg-[#c4f042] text-slate-950 font-extrabold border-[#c4f042] shadow-[0_0_10px_rgba(196,240,66,0.3)]'
                    : 'bg-[#151922] text-slate-400 hover:text-white border-[#242c3e]'
                }`}
              >
                MARKET
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, orderDispatchMode: 'LIMIT' })}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                  settings.orderDispatchMode === 'LIMIT'
                    ? 'bg-purple-600 text-white font-extrabold border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                    : 'bg-[#151922] text-slate-400 hover:text-white border-[#242c3e]'
                }`}
              >
                LIMIT
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              <strong>AUTO (Recommended):</strong> Automatically checks price distance to the Order Block. If price is tapping the mitigation zone, takes instant Market; if price is extended, places a discount Limit Order.
            </p>
          </div>

          {/* Partial Profit & Cooldown Controls */}
          <div className="grid grid-cols-2 gap-2">
            {/* Partial Profit Taking (+1.5R: Take 50% Off) */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-[11px]">Partial TP (+1.5R)</span>
                <input
                  type="checkbox"
                  checked={settings.partialProfitClose !== false}
                  onChange={(e) => setSettings({ ...settings, partialProfitClose: e.target.checked })}
                  className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Closes 50% volume at +1.5R profit and lets the other 50% run risk-free.
              </p>
            </div>

            {/* Post-Trade Cooldown */}
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-[11px]">Cooldown</span>
                <Clock className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div className="flex items-center gap-1 bg-[#141924] border border-[#2b3346] px-2 py-0.5 rounded-lg">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settings.tradeCooldownMinutes || 5}
                  onChange={(e) => setSettings({ ...settings, tradeCooldownMinutes: Math.max(1, parseInt(e.target.value) || 5) })}
                  className="w-8 bg-transparent font-mono font-bold text-purple-300 text-xs text-right focus:outline-none"
                />
                <span className="text-purple-300 text-[11px] font-bold">mins</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Prevents back-to-back overtrading churn on the same asset.
              </p>
            </div>
          </div>

          {/* Daily Account Growth & Loss Limits */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 text-xs uppercase tracking-wider">
                Daily Limits & Protection
              </span>
              {settings.dailyLossLimitPct <= 0 ? (
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Loss Limit: REMOVED (No Limit)
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                  Loss Limit: -{settings.dailyLossLimitPct}% Max
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {/* Daily Loss Limit Card */}
              <div className={`rounded-2xl border p-3 space-y-2 transition-all ${
                settings.dailyLossLimitPct > 0
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-[#232a3c] bg-[#0c0f16]'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Daily Loss Limit</span>
                  <button
                    type="button"
                    onClick={() => setSettings({
                      ...settings,
                      dailyLossLimitPct: settings.dailyLossLimitPct > 0 ? 0 : 5.0
                    })}
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all ${
                      settings.dailyLossLimitPct > 0
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {settings.dailyLossLimitPct > 0 ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {settings.dailyLossLimitPct > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 bg-[#141924] border border-[#2b3346] px-2.5 py-1 rounded-xl">
                      <span className="text-slate-400 text-xs">Pause if equity dips:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="50"
                        value={settings.dailyLossLimitPct}
                        onChange={(e) => setSettings({ ...settings, dailyLossLimitPct: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-12 ml-auto bg-transparent font-mono font-bold text-rose-400 text-right focus:outline-none"
                      />
                      <span className="font-bold text-rose-400 text-xs">%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[3.0, 5.0, 10.0].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setSettings({ ...settings, dailyLossLimitPct: pct })}
                          className={`py-0.5 rounded text-[10px] font-bold ${
                            settings.dailyLossLimitPct === pct ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' : 'bg-[#151922] text-slate-400'
                          }`}
                        >
                          -{pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 leading-tight">
                    No daily loss limit. The autopilot will never stop or pause new trades due to drawdown.
                  </p>
                )}
              </div>

              {/* Daily Target Gain Card */}
              <div className={`rounded-2xl border p-3 space-y-2 transition-all ${
                settings.dailyGrowthTargetPct > 0
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-[#232a3c] bg-[#0c0f16]'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Daily Target Gain</span>
                  <button
                    type="button"
                    onClick={() => setSettings({
                      ...settings,
                      dailyGrowthTargetPct: settings.dailyGrowthTargetPct > 0 ? 0 : 5.0
                    })}
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all ${
                      settings.dailyGrowthTargetPct > 0
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {settings.dailyGrowthTargetPct > 0 ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {settings.dailyGrowthTargetPct > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 bg-[#141924] border border-[#2b3346] px-2.5 py-1 rounded-xl">
                      <span className="text-slate-400 text-xs">Take profit at:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="100"
                        value={settings.dailyGrowthTargetPct}
                        onChange={(e) => setSettings({ ...settings, dailyGrowthTargetPct: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-12 ml-auto bg-transparent font-mono font-bold text-emerald-400 text-right focus:outline-none"
                      />
                      <span className="font-bold text-emerald-400 text-xs">%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[5.0, 10.0, 15.0].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setSettings({ ...settings, dailyGrowthTargetPct: pct })}
                          className={`py-0.5 rounded text-[10px] font-bold ${
                            settings.dailyGrowthTargetPct === pct ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'bg-[#151922] text-slate-400'
                          }`}
                        >
                          +{pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 leading-tight">
                    No profit cap. Autopilot runs continuously to grow the account without a daily ceiling.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#c4f042] py-3 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.3)]"
          >
            Apply Settings Across All Tabs
          </button>
        </div>
      </div>
    </div>
  );
};
