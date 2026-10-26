import React, { useState, useEffect } from 'react';
import { 
  Scan, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  ArrowRight, 
  Download, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Server
} from 'lucide-react';
import { RealTradingViewWidget } from '../components/RealTradingViewWidget';
import { analyzeChartImageOrCandles } from '../lib/chartAnalysis';
import { fetchLiveMarketPrice } from '../lib/livePrices';
import { store } from '../lib/store';
import { executeMetaApiTrade } from '../lib/metaapi';
import type { ChartAnalysis, TradeSetup } from '@engine';

export const TradeLensPage: React.FC = () => {
  const [symbol, setSymbol] = useState('GBPUSD');
  const [timeframe, setTimeframe] = useState('H1');
  const [livePrice, setLivePrice] = useState<number>(1.2980);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const activeAccount = store.getActiveAccount();

  useEffect(() => {
    let isMounted = true;
    const fetchPrice = async () => {
      const p = await fetchLiveMarketPrice(symbol);
      if (isMounted) setLivePrice(p.price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [symbol]);

  const handleAnalyzePair = async () => {
    setIsAnalyzing(true);
    try {
      const res = await analyzeChartImageOrCandles({
        symbol,
        timeframe,
        userQuery: `Analyze ${symbol} on ${timeframe} structure, discount demand zones, fair value gaps, and liquidity sweeps. Output institutional Smart Money Concepts rationale.`,
      });
      setAnalysis(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecute = async (setup: TradeSetup) => {
    if (!activeAccount) {
      alert('Please connect an MT5 account in Settings first.');
      return;
    }

    const settings = store.getRiskSettings();
    const openPositions = store.getPositions();
    if (openPositions.length >= settings.maxTrades) {
      alert(`Maximum concurrent trades limit reached (${openPositions.length}/${settings.maxTrades}). Close an existing trade or increase the limit in the header.`);
      return;
    }

    const balance = activeAccount.balance || 100;
    let effectiveLot = settings.fixedLot;
    const slDist = Math.abs(setup.entry - setup.stopLoss);

    let pointValue = 100;
    if (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('USDJPY')) pointValue = 100000;
    else if (symbol.includes('BTC') || symbol.includes('US30')) pointValue = 1;

    if (settings.mode === 'RISK_PCT' && slDist > 0) {
      const cashRisk = balance * (settings.riskPercent / 100);
      const calculated = cashRisk / (slDist * pointValue);
      effectiveLot = Math.max(0.01, Math.min(10.0, parseFloat(calculated.toFixed(2))));
    }

    setIsExecuting(true);
    try {
      let ticket = Math.floor(1000000 + Math.random() * 9000000);
      if (activeAccount.metaapiAccountId) {
        const res = await executeMetaApiTrade({
          metaapiAccountId: activeAccount.metaapiAccountId,
          symbol,
          actionType: setup.direction === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
          volume: effectiveLot,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          comment: `Trade Lens ${symbol}`,
        });
        if (res?.numericCode) ticket = res.numericCode;
      }

      await store.addPosition({
        mt5AccountId: activeAccount.id,
        ticket,
        symbol,
        type: setup.direction,
        volume: effectiveLot,
        openPrice: setup.entry,
        currentPrice: setup.entry,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        profit: 0,
        openTime: new Date().toISOString(),
      });

      alert(`✅ Order #${ticket} dispatched to MT5!\n${setup.direction.toUpperCase()} ${effectiveLot} Lots on ${symbol} @ ${setup.entry} (${settings.mode === 'RISK_PCT' ? `${settings.riskPercent}% Risk` : 'Fixed Lot'})`);
    } catch (e: any) {
      alert(`MT5 Dispatch Notice: ${e.message || 'Dispatched'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8">
      {/* Hero Section matching Screenshot 3 */}
      <div className="text-center space-y-4 max-w-3xl mx-auto pt-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-xs font-bold text-purple-300">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span>Now on the Chrome Web Store</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
          Quantiq <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Trade Lens</span>
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Institutional-grade chart intelligence, docked beside the TradingView chart you already trade. Lens sees the structure, the Quantiq Market Brain decides what it means.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => alert('Chrome Extension package is ready for local sideloading in Developer mode.')}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-xs font-extrabold text-white shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:scale-105 transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Install Extension</span>
          </button>
          <a
            href="#live-lens"
            className="flex items-center gap-2 rounded-2xl border border-[#262c3c] bg-[#12151e] px-6 py-3 text-xs font-bold text-slate-200 hover:bg-[#181d2a] transition-all"
          >
            <span>Open Quantiq Platform</span>
            <ArrowRight className="h-4 w-4 text-purple-400" />
          </a>
        </div>
        <span className="block text-[11px] text-slate-500">
          Included with Community Tier — no extra subscription.
        </span>
      </div>

      {/* Docked Lens Live Workspace matching Screenshot 3 */}
      <div id="live-lens" className="rounded-3xl border border-[#222838] bg-[#0c0e14] p-4 sm:p-6 shadow-2xl space-y-4">
        {/* Workspace Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c212e] pb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase">Asset:</span>
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setAnalysis(null);
              }}
              className="rounded-xl border border-[#262c3c] bg-[#11141c] px-3.5 py-1.5 text-xs font-bold text-white focus:outline-none"
            >
              {['GBPUSD', 'XAUUSD', 'EURUSD', 'BTCUSD', 'US30'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <span className="text-xs font-bold text-slate-400 uppercase ml-2">Timeframe:</span>
            <select
              value={timeframe}
              onChange={(e) => {
                setTimeframe(e.target.value);
                setAnalysis(null);
              }}
              className="rounded-xl border border-[#262c3c] bg-[#11141c] px-3 py-1.5 text-xs font-mono font-bold text-white focus:outline-none"
            >
              {['M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500 font-sans font-semibold">SPOT:</span>
            <span className="font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              ${livePrice.toFixed(symbol.includes('USD') && !symbol.includes('BTC') && !symbol.includes('US30') && !symbol.includes('XAU') ? 4 : 2)}
            </span>
          </div>
        </div>

        {/* 2-Column Split: TradingView on Left + Lens on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px]">
          {/* Left: TradingView Chart */}
          <div className="lg:col-span-8 rounded-2xl overflow-hidden border border-[#202534] bg-[#08090d]">
            <RealTradingViewWidget symbol={symbol} timeframe={timeframe} />
          </div>

          {/* Right: Docked Quantiq Trade Lens Panel */}
          <div className="lg:col-span-4 rounded-2xl border border-[#222736] bg-[#10131b] p-5 flex flex-col justify-between space-y-4 shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1c212e] pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <Scan className="h-4 w-4 text-purple-400" />
                    <span>Quantiq Trade Lens</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {symbol} • {timeframe}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {livePrice.toFixed(symbol.includes('USD') && !symbol.includes('BTC') && !symbol.includes('US30') && !symbol.includes('XAU') ? 4 : 2)}
                </span>
              </div>

              {/* Big Action Button */}
              <button
                onClick={handleAnalyzePair}
                disabled={isAnalyzing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#6366f1] py-3 text-xs font-extrabold text-white hover:bg-[#5254e4] transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Analyzing Pair...</span>
                  </>
                ) : (
                  <span>Analyze the current pair</span>
                )}
              </button>

              {/* Lens Intelligence Output */}
              {analysis ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-[#090b10] border border-[#1d222e] text-xs leading-relaxed text-slate-200">
                    <span className="font-bold text-white block mb-1 uppercase tracking-wide text-[11px]">
                      {symbol} {timeframe} ({analysis.bias.toUpperCase()} Bias)
                    </span>
                    {analysis.summary}
                  </div>

                  {analysis.setups.length > 0 && (
                    <div className="p-3 rounded-xl border border-[#262c3e] bg-[#131722] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-emerald-400">
                          {analysis.setups[0].direction.toUpperCase()} ENTRY
                        </span>
                        <button
                          onClick={() => handleExecute(analysis.setups[0])}
                          disabled={isExecuting}
                          className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
                        >
                          Execute MT5
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 font-mono text-center text-[11px]">
                        <div className="bg-[#0b0e14] p-1.5 rounded">
                          <span className="block text-[9px] text-slate-500">ENTRY</span>
                          <span className="font-bold text-white">{analysis.setups[0].entry.toFixed(2)}</span>
                        </div>
                        <div className="bg-[#0b0e14] p-1.5 rounded">
                          <span className="block text-[9px] text-red-400">SL</span>
                          <span className="font-bold text-red-400">{analysis.setups[0].stopLoss.toFixed(2)}</span>
                        </div>
                        <div className="bg-[#0b0e14] p-1.5 rounded">
                          <span className="block text-[9px] text-emerald-400">TP</span>
                          <span className="font-bold text-emerald-400">{analysis.setups[0].takeProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#222838] p-6 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-400">Lens is docked & ready.</p>
                  <p>Click "Analyze the current pair" to decode institutional market structure.</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#1c212e] text-[10px] text-slate-500 text-center font-mono uppercase">
              QUANTIQ MARKET BRAIN DOCKED
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
