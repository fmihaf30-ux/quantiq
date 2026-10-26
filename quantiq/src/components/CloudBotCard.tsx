import React from 'react';
import type { CloudBot } from '../types';
import { Play, Pause, Trash2, Bot, Activity, DollarSign, Award, Layers } from 'lucide-react';
import { store } from '../lib/store';

interface CloudBotCardProps {
  bot: CloudBot;
  onSelect?: (bot: CloudBot) => void;
}

export const CloudBotCard: React.FC<CloudBotCardProps> = ({ bot, onSelect }) => {
  const isRunning = bot.status === 'running';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.toggleBot(bot.id, isRunning ? 'stopped' : 'running');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete bot "${bot.name}"?`)) {
      store.deleteBot(bot.id);
    }
  };

  return (
    <div
      onClick={() => onSelect && onSelect(bot)}
      className={`relative flex flex-col rounded-xl border p-4 transition-all cursor-pointer ${
        isRunning
          ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.04] to-transparent hover:border-emerald-500/50'
          : 'border-[#222630] bg-[#121418] hover:border-[#2e3442]'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/20 text-slate-400'
            }`}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-white">{bot.name}</h4>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isRunning
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700/30 text-slate-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {bot.status}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>{bot.symbol}</span>
              <span>•</span>
              <span>{bot.timeframe}</span>
              <span>•</span>
              <span className="capitalize">{bot.strategySpec.engine}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggle}
            className={`rounded-lg p-2 text-xs transition-colors ${
              isRunning
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={isRunning ? 'Pause Bot' : 'Start Bot'}
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg p-2 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Delete Bot"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#1e232e] pt-3 font-mono text-center text-xs">
        <div className="rounded bg-[#0c0e12] p-2 border border-[#1b202a]">
          <span className="block text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            PROFIT
          </span>
          <span className={`font-bold ${bot.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${bot.totalProfit.toFixed(2)}
          </span>
        </div>
        <div className="rounded bg-[#0c0e12] p-2 border border-[#1b202a]">
          <span className="block text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Award className="h-3 w-3 text-amber-400" />
            WIN RATE
          </span>
          <span className="font-bold text-white">{bot.winRate.toFixed(1)}%</span>
        </div>
        <div className="rounded bg-[#0c0e12] p-2 border border-[#1b202a]">
          <span className="block text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Activity className="h-3 w-3 text-cyan-400" />
            TRADES
          </span>
          <span className="font-bold text-white">{bot.totalTrades}</span>
        </div>
      </div>
    </div>
  );
};
