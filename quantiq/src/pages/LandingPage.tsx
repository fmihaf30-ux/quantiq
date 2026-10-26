import React from 'react';
import { Link } from 'react-router';
import { 
  Bot, 
  BarChart2, 
  ShieldCheck, 
  Zap, 
  Sparkles, 
  ArrowRight, 
  Server, 
  CheckCircle2, 
  TrendingUp, 
  Sliders, 
  Smartphone,
  Layers,
  ChevronRight
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[#0a0b0d] text-slate-100">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-28 border-b border-[#1b1f29]">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#c4f042]/10 via-[#8b5cf6]/10 to-transparent blur-3xl pointer-events-none rounded-full" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2e3544] bg-[#14171f] px-3.5 py-1 text-xs text-slate-300 mb-6">
            <span className="flex h-2 w-2 rounded-full bg-[#c4f042] animate-pulse" />
            <span className="font-medium">MetaApi Cloud MT5 Execution + Gemini Vision SMC</span>
            <ChevronRight className="h-3 w-3 text-slate-500" />
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Automate MetaTrader 5 with <span className="text-[#c4f042]">Cloud AI Bots</span> & Smart Money Concepts
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-slate-400 leading-relaxed">
            No VPS setup. No MetaEditor compilation. Connect any MT5 broker account to a high-speed cloud execution bridge, build strategies in plain English, and analyze charts with vision AI.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-6 py-3.5 text-sm font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_25px_rgba(196,240,66,0.25)] hover:scale-105"
            >
              <span>Launch Demo Platform</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/chart"
              className="flex items-center gap-2 rounded-xl border border-[#2a303e] bg-[#12151c] px-6 py-3.5 text-sm font-semibold text-slate-200 hover:bg-[#1a1f29] transition-all"
            >
              <BarChart2 className="h-4 w-4 text-[#c4f042]" />
              <span>Explore AI Chart Intelligence</span>
            </Link>
          </div>

          {/* Highlights */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left">
            <div className="rounded-xl border border-[#1e232e] bg-[#101318] p-3.5">
              <span className="block text-xl font-bold font-mono text-white">24/7</span>
              <span className="text-xs text-slate-400">Cloud bot execution</span>
            </div>
            <div className="rounded-xl border border-[#1e232e] bg-[#101318] p-3.5">
              <span className="block text-xl font-bold font-mono text-[#c4f042]">0 ms</span>
              <span className="text-xs text-slate-400">VPS management required</span>
            </div>
            <div className="rounded-xl border border-[#1e232e] bg-[#101318] p-3.5">
              <span className="block text-xl font-bold font-mono text-purple-400">SMC AI</span>
              <span className="text-xs text-slate-400">Fair Value Gaps & OBs</span>
            </div>
            <div className="rounded-xl border border-[#1e232e] bg-[#101318] p-3.5">
              <span className="block text-xl font-bold font-mono text-cyan-400">1-Click</span>
              <span className="text-xs text-slate-400">Plain English strategy bot</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillar 1: Transparent Cloud Architecture */}
      <section className="py-20 border-b border-[#1b1f29]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-[#c4f042]/10 px-3 py-1 text-xs font-bold text-[#c4f042]">
                <Server className="h-3.5 w-3.5" />
                <span>ARCHITECTURAL TRANSPARENCY</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white">
                Real Cloud MT5 Execution — Not Fake VPS Marketing
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Traditional solutions force you to pay $20–$40/month for a Windows remote desktop VPS, download MT5, compile `.mq5` Expert Advisors, and pray your VPS doesn't restart.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Quantiq orchestrates native MetaTrader 5 cloud terminals via <strong>MetaApi</strong> cloud architecture. Your bot strategies evaluate mathematically in cloud edge functions and dispatch trade executions directly to your broker's MT5 server with institutional speed.
              </p>
              <ul className="space-y-2.5 text-xs text-slate-300 font-medium">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#c4f042]" />
                  <span>Works with any MT5 broker: IC Markets, Exness, FTMO, Pepperstone, Deriv</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#c4f042]" />
                  <span>No software to install on your PC or phone</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#c4f042]" />
                  <span>Automatic reconnection, watchdog, and position recovery</span>
                </li>
              </ul>
            </div>

            {/* Visual Box */}
            <div className="rounded-2xl border border-[#252b38] bg-[#12151b] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#202530] pb-3">
                <span className="font-mono text-xs font-bold text-slate-300">
                  Cloud Terminal Bridge (#50821942)
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  CONNECTED
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="rounded-lg bg-[#0c0e12] p-3 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">BROKER SERVER</span>
                  <span className="text-white font-bold">ICMarketsSC-Live02</span>
                </div>
                <div className="rounded-lg bg-[#0c0e12] p-3 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">CLOUD LATENCY</span>
                  <span className="text-emerald-400 font-bold">12.4 ms</span>
                </div>
                <div className="rounded-lg bg-[#0c0e12] p-3 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">ACCOUNT BALANCE</span>
                  <span className="text-white font-bold">$10,450.80 USD</span>
                </div>
                <div className="rounded-lg bg-[#0c0e12] p-3 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">ACTIVE BOTS</span>
                  <span className="text-[#c4f042] font-bold">2 Running</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillar 2: Plain-English Strategy Builder */}
      <section className="py-20 border-b border-[#1b1f29] bg-[#0c0e12]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Visual Box */}
            <div className="rounded-2xl border border-[#252b38] bg-[#12151b] p-6 shadow-2xl space-y-4 order-2 lg:order-1">
              <div className="rounded-lg bg-[#0c0e12] p-3 border border-[#202633] text-xs font-mono text-slate-300">
                <span className="text-purple-400 font-bold block mb-1">PROMPT:</span>
                "Build an intraday scalper on Gold (XAUUSD) M5 using EMA 9 and 21 cross, 1:2 RR, and ATR stops."
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#c4f042]">
                <Sparkles className="h-4 w-4" />
                Parsed Engine & Backtested Instantly:
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="rounded-lg bg-[#0c0e12] p-2.5 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">WIN RATE</span>
                  <span className="text-emerald-400 font-bold">68.4%</span>
                </div>
                <div className="rounded-lg bg-[#0c0e12] p-2.5 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">PROFIT FACTOR</span>
                  <span className="text-white font-bold">2.14</span>
                </div>
                <div className="rounded-lg bg-[#0c0e12] p-2.5 border border-[#1a1f29]">
                  <span className="text-[10px] text-slate-500 block">NET R-MULTIPLE</span>
                  <span className="text-emerald-400 font-bold">+34.2 R</span>
                </div>
              </div>
            </div>

            <div className="space-y-5 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>PROMPT TRADING</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white">
                Turn Words into Algorithmic Bots in 5 Seconds
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Type your trading strategy in everyday language. The Strategy Intent Engine parses your concepts into mathematical execution rules, runs a 200-candle backtest, and deploys directly to your MT5 account.
              </p>
              <ul className="space-y-2.5 text-xs text-slate-300 font-medium">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-400" />
                  <span>5 Strategy Engines: Trend, Momentum Scalper, Range, Breakout, Swing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-400" />
                  <span>Built-in dynamic ATR-based Stop Loss & Take Profit sizing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-400" />
                  <span>No coding or MQL5 knowledge needed</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 100% Open Source Architecture Section */}
      <section className="py-20 border-b border-[#1b1f29] bg-[#0c0e12]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1 text-xs text-emerald-400 font-semibold mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>100% Free & Open Source</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">No Subscriptions. No Credits. No Paywalls.</h2>
          <p className="mt-3 text-sm text-slate-400 max-w-2xl mx-auto">
            Quantiq gives you complete ownership over your trading stack. Connect directly to your broker through MetaApi and use your own Gemini API key for unlimited AI vision.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Zero Platform Fees */}
            <div className="rounded-2xl border border-[#222734] bg-[#12151b] p-6 text-left flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#c4f042]">Self-Hosted Control</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">$0</span>
                  <span className="text-xs text-slate-400">/ forever free</span>
                </div>
                <p className="mt-3 text-xs text-slate-400">Run directly on your local machine or self-host anywhere.</p>
                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">✓ Unlimited Cloud Bots</li>
                  <li className="flex items-center gap-2">✓ Zero platform markup on trades</li>
                  <li className="flex items-center gap-2">✓ Full database ownership (Supabase)</li>
                </ul>
              </div>
              <Link
                to="/dashboard"
                className="mt-8 block w-full rounded-xl bg-[#c4f042] py-2.5 text-center text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-colors shadow"
              >
                Open Dashboard
              </Link>
            </div>

            {/* Unlimited AI */}
            <div className="relative rounded-2xl border-2 border-purple-500/40 bg-[#12151b] p-6 text-left flex flex-col justify-between shadow-[0_0_20px_rgba(139,92,246,0.15)]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Unlimited AI Intelligence</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">BYOK</span>
                  <span className="text-xs text-slate-400">(Bring Your Own Key)</span>
                </div>
                <p className="mt-3 text-xs text-slate-400">Use your own free Google Gemini API key with zero rate limits or artificial credit deducts.</p>
                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">✓ Unlimited SMC Chart Vision</li>
                  <li className="flex items-center gap-2">✓ Multi-turn Trish Assistant</li>
                  <li className="flex items-center gap-2">✓ Instant Fair Value Gap detection</li>
                </ul>
              </div>
              <Link
                to="/chart"
                className="mt-8 block w-full rounded-xl border border-purple-500/30 bg-purple-500/10 py-2.5 text-center text-xs font-bold text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                Analyze Charts
              </Link>
            </div>

            {/* Direct Broker Connection */}
            <div className="rounded-2xl border border-[#222734] bg-[#12151b] p-6 text-left flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Direct Broker Bridge</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">MetaApi</span>
                  <span className="text-xs text-slate-400">Cloud execution</span>
                </div>
                <p className="mt-3 text-xs text-slate-400">Connect to Exness, IC Markets, FTMO, or any MT5 broker with 24/7 cloud terminals.</p>
                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">✓ Automated capital & balance sync</li>
                  <li className="flex items-center gap-2">✓ 24/7 terminal uptime</li>
                  <li className="flex items-center gap-2">✓ Real-time log terminal streaming</li>
                </ul>
              </div>
              <Link
                to="/bots"
                className="mt-8 block w-full rounded-xl border border-[#2e3544] bg-[#171a22] py-2.5 text-center text-xs font-bold text-white hover:bg-[#202532] transition-colors"
              >
                Manage Cloud Bots
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1b1f29] bg-[#0c0e12] py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-300">
            <Zap className="h-4 w-4 text-[#c4f042]" />
            <span>Quantiq</span>
          </div>
          <p>© 2026 Quantiq AI Technologies. Autonomous algorithmic trading & MT5 cloud execution.</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-slate-300">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
