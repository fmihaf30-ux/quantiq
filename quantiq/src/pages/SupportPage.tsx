import React from 'react';
import { Headphones, MessageSquare, Code2, Send, HelpCircle, ExternalLink, Sparkles } from 'lucide-react';

export const SupportPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8 max-w-4xl mx-auto">
      <div className="border-b border-[#1c202a] pb-4">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">
          <Headphones className="h-4 w-4" />
          <span>Community & Technical Support</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">Contact Support</h1>
        <p className="text-xs text-slate-400 mt-1">
          Get help with your MetaTrader 5 bridge, cloud bot configuration, or chart vision questions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-6 space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
            <MessageSquare className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-white">Live AI Assistant</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Trish Assistant is available 24/7 across the platform to diagnose SMC chart questions, broker server connectivity, and trade execution.
          </p>
        </div>

        <div className="rounded-2xl border border-[#202532] bg-[#11131a] p-6 space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c4f042]/20 text-[#c4f042]">
            <Code2 className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-white">Open Source Community</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Report bugs, request broker server adapters, or inspect algorithmic strategy code on our open-source repository.
          </p>
        </div>
      </div>
    </div>
  );
};
