import React from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, Zap, Bot, BarChart3, Radio, Server, Code2, Heart } from 'lucide-react';
import { Link } from 'react-router';

export const PricingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-400">
          <Sparkles className="h-4 w-4" />
          <span>100% Free & Open Source Platform</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          Zero Subscriptions. Zero Paywalls.
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
          Quantiq gives you all of Quantiq's institutional features — Trade Lens, Trish AI Vision, Auto Trading Bots, and MT5 Cloud Bridge — completely free for everyone.
        </p>
      </div>

      {/* Main Free Open Source Hero Card */}
      <div className="relative rounded-3xl border border-[#2a3142] bg-gradient-to-b from-[#141722] to-[#0d1017] p-8 sm:p-10 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-[#c4f042]/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#202532] pb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#c4f042]">Community Edition</span>
            <h2 className="text-3xl font-extrabold text-white mt-1">Unlimited Free Tier</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Full algorithmic autonomy. Connect your MT5 account and trade without credits, restrictions, or monthly billing.
            </p>
          </div>

          <div className="text-left md:text-right">
            <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white">$0</span>
            <span className="text-xs text-emerald-400 font-bold block mt-1">LIFETIME FREE ACCESS</span>
          </div>
        </div>

        {/* Unlocked Features Checklist */}
        <div className="py-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Quantiq Trade Lens (Live TradingView streaming candles)',
            'Trish Assistant Multimodal SMC Vision (Google Gemini Flash)',
            'Unlimited 24/7 Autonomous Cloud MT5 Bots',
            'Direct 1-Click MT5 Dispatch (Market orders with exact SL/TP)',
            'Upload Chart Lens (PNG/JPG chart screenshot analysis)',
            'Conversational AI Trading Desk with prompt-to-trade',
            'Real-Time Pulse Signals across Gold, Forex, and Crypto',
            'Unlimited Multi-Account MT5 Terminal Switching',
            'Full Source Code Transparency & Self-Hostable',
            'Zero Credit Counters & Zero Forced Upgrades',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <span className="text-xs text-slate-200 font-medium">{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto text-center rounded-2xl bg-[#c4f042] px-8 py-3.5 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_20px_rgba(196,240,66,0.3)] hover:scale-105"
          >
            Launch Trading Terminal Now
          </Link>

          <Link
            to="/how-to-use"
            className="w-full sm:w-auto text-center rounded-2xl border border-[#2a303e] bg-[#12151d] px-6 py-3.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-[#1a1e28] transition-colors"
          >
            Watch Video Walkthrough
          </Link>
        </div>
      </div>
    </div>
  );
};
