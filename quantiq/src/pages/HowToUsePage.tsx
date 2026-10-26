import React from 'react';
import { 
  GraduationCap, 
  Play, 
  CheckCircle2, 
  Zap, 
  Scan, 
  Server, 
  ShieldCheck, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router';

export const HowToUsePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#1c202a] pb-4">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">
          <GraduationCap className="h-4 w-4" />
          <span>Platform Tutorial & Video Guide</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">How To Use Quantiq AI / Quantiq</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Master AI chart scanning with Trish, connecting your MetaTrader 5 account, and deploying 24/7 automated cloud bots.
        </p>
      </div>

      {/* Featured Video Tutorial Embed */}
      <div className="rounded-3xl border border-[#242938] bg-[#10131a] p-4 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white font-bold">
              <Play className="h-4 w-4 fill-white" />
            </span>
            <h2 className="text-base font-bold text-white">Official Video Guide: Getting Started</h2>
          </div>
          <a
            href="https://youtu.be/_JOyWOaFXgE"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#c4f042] hover:underline"
          >
            <span>Watch on YouTube</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Video Player */}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-[#1f2430]">
          <iframe
            src="https://www.youtube.com/embed/_JOyWOaFXgE"
            title="QUANTIQ AI - Official Platform Introduction | Getting Started"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>

      {/* 4-Step Walkthrough Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1 */}
        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 font-bold text-xs">
              01
            </div>
            <h3 className="text-sm font-bold text-white">Connect Your MT5 Broker Account</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Navigate to <strong className="text-slate-200">Settings</strong> or click <strong className="text-slate-200">Connect MT5</strong>. Enter your Broker name, MT5 Server (e.g. Exness-MT5Trial9), Account Login, and Capital. Your metrics sync automatically.
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#c4f042] hover:underline pt-1"
          >
            <span>Go to MT5 Settings</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#c4f042]/20 text-[#c4f042] font-bold text-xs">
              02
            </div>
            <h3 className="text-sm font-bold text-white">Scan Real-Time Charts with Trish AI</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Open <strong className="text-slate-200">Quantiq Trade Lens</strong>. Select your asset (Gold, Bitcoin, EURUSD, US30) and timeframe. Click <strong className="text-[#c4f042]">"Scan Chart with Trish AI"</strong> to extract Fair Value Gaps, Order Blocks, and market bias.
          </p>
          <Link
            to="/chart"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#c4f042] hover:underline pt-1"
          >
            <span>Open Trade Lens</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-xs">
              03
            </div>
            <h3 className="text-sm font-bold text-white">1-Click Instant MT5 Execution</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            When Trish proposes an Actionable Trade Setup (Entry, Stop Loss, Take Profit), verify the lot size and click <strong className="text-emerald-400">"Execute MT5"</strong>. The market order is dispatched to your terminal with real ticket logging.
          </p>
        </div>

        {/* Step 4 */}
        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 font-bold text-xs">
              04
            </div>
            <h3 className="text-sm font-bold text-white">Deploy 24/7 Autonomous Cloud Bots</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Want to trade hands-free? Click <strong className="text-[#c4f042]">"Deploy Bot"</strong> from any setup or in <strong className="text-slate-200">Auto Trading</strong>. Describe your strategy in plain English, and your bot runs 24/7 without needing your laptop on.
          </p>
          <Link
            to="/bots"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#c4f042] hover:underline pt-1"
          >
            <span>Open Auto Trading</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
