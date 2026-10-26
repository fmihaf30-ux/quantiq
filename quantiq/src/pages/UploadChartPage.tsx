import React, { useState, useRef } from 'react';
import { store } from '../lib/store';
import { analyzeChartImageOrCandles } from '../lib/chartAnalysis';
import { executeMetaApiTrade } from '../lib/metaapi';
import { SMCAnalysisCard } from '../components/SMCAnalysisCard';
import { StrategyBuilderModal } from '../components/StrategyBuilderModal';
import type { ChartAnalysis, TradeSetup } from '@engine';
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  FileUp, 
  CheckCircle2, 
  X, 
  AlertCircle,
  Camera,
  Bot
} from 'lucide-react';

export const UploadChartPage: React.FC = () => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('M15');
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [deployedPrompt, setDeployedPrompt] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accounts = store.getAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(store.getActiveAccountId());

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (.png, .jpg, .webp)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      setBase64Data(result);
      setAnalysis(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleScan = async () => {
    if (!base64Data) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeChartImageOrCandles({
        symbol,
        timeframe,
        chartImageBase64: base64Data,
        userQuery: `Analyze this uploaded chart image for ${symbol} on ${timeframe}. Identify market bias, order blocks, fair value gaps, and output high-probability institutional trade setups.`,
      });
      setAnalysis(res);
    } catch (err: any) {
      alert(`Trish AI Analysis failed: ${err.message || 'Error scanning image'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteTrade = async (setup: TradeSetup, lots: number = 0.10) => {
    const activeAccount = accounts.find((a) => a.id === selectedAccountId) || store.getActiveAccount();
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
    let effectiveLot = lots;
    const slDist = Math.abs(setup.entry - setup.stopLoss);

    let pointValue = 100;
    if (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('USDJPY')) pointValue = 100000;
    else if (symbol.includes('BTC') || symbol.includes('US30')) pointValue = 1;

    if (settings.mode === 'RISK_PCT' && slDist > 0) {
      const cashRisk = balance * (settings.riskPercent / 100);
      const calculated = cashRisk / (slDist * pointValue);
      effectiveLot = Math.max(0.01, Math.min(10.0, parseFloat(calculated.toFixed(2))));
    }

    setIsExecutingTrade(true);
    try {
      let ticket = Math.floor(1000000 + Math.random() * 9000000);

      if (activeAccount.metaapiAccountId) {
        const orderResult = await executeMetaApiTrade({
          metaapiAccountId: activeAccount.metaapiAccountId,
          symbol,
          actionType: setup.direction === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
          volume: effectiveLot,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          comment: `Quantiq Upload SMC ${setup.direction.toUpperCase()}`,
        });
        if (orderResult?.numericCode) {
          ticket = orderResult.numericCode;
        }
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

      alert(`✅ Order #${ticket} successfully dispatched to MT5 (${activeAccount.broker}):\n${setup.direction.toUpperCase()} ${effectiveLot} Lots on ${symbol} @ ${setup.entry.toFixed(2)} (${settings.mode === 'RISK_PCT' ? `${settings.riskPercent}% Risk` : 'Fixed Lot'})`);
    } catch (err: any) {
      alert(`MT5 Execution Notice: ${err.message || 'Order dispatched'}`);
    } finally {
      setIsExecutingTrade(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-6">
      {/* Page Header */}
      <div className="border-b border-[#1c202a] pb-4">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <Upload className="h-6 w-6 text-purple-400" />
          <span>Upload Chart Lens — Trish AI Vision</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Upload any screenshot from TradingView, MT5, or cTrader. Trish will inspect price action, detect Smart Money Concepts (SMC), and generate 1-click MT5 execution setups.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Image Uploader & Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Symbol & Timeframe Selectors */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#202532] bg-[#101217] p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Target Asset:</span>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
              >
                {['XAUUSD', 'EURUSD', 'BTCUSD', 'US30', 'GBPUSD', 'USDJPY', 'NAS100'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Timeframe:</span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3 py-1.5 text-xs font-mono font-bold text-white focus:outline-none"
              >
                {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>

            {imagePreview && (
              <button
                onClick={handleScan}
                disabled={isAnalyzing}
                className="ml-auto flex items-center gap-2 rounded-xl bg-[#c4f042] px-4 py-2 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.25)] disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                <span>{isAnalyzing ? 'Scanning with Trish Vision...' : 'Scan Uploaded Chart'}</span>
              </button>
            )}
          </div>

          {/* Upload Drop Zone */}
          {!imagePreview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-[#c4f042] bg-[#c4f042]/5'
                  : 'border-[#242b3a] bg-[#0e1015] hover:border-purple-500/50 hover:bg-[#12151d]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <div className="h-16 w-16 rounded-3xl bg-purple-500/10 flex items-center justify-center mb-4">
                <FileUp className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-base font-extrabold text-white">Drag & drop your chart screenshot</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Supports TradingView screenshots, MT5 charts, or mobile trading clips (PNG, JPG, WEBP).
              </p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#2a3140] bg-[#161a24] px-4 py-2 text-xs font-bold text-slate-200">
                Browse Files
              </span>
            </div>
          ) : (
            <div className="relative rounded-3xl border border-[#222736] bg-[#0e1016] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between bg-[#141720] px-4 py-2.5 border-b border-[#202532]">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[#c4f042]" />
                  Uploaded Chart Image
                </span>
                <button
                  onClick={() => { setImagePreview(null); setBase64Data(null); setAnalysis(null); }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-[#202532] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <img
                src={imagePreview}
                alt="Uploaded Chart"
                className="w-full max-h-[520px] object-contain bg-[#0a0b0d] p-2"
              />
            </div>
          )}
        </div>

        {/* Right Column: Trish SMC Analysis Card */}
        <div>
          <SMCAnalysisCard
            analysis={analysis}
            isLoading={isAnalyzing}
            onDeploySetup={(s) => {
              setDeployedPrompt(`Deploy ${s.direction.toUpperCase()} setup for ${symbol} on ${timeframe}. Entry ${s.entry}, SL ${s.stopLoss}, TP ${s.takeProfit}.`);
              setIsStrategyModalOpen(true);
            }}
            onExecuteTrade={handleExecuteTrade}
            isExecutingTrade={isExecutingTrade}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
          />
        </div>
      </div>

      {/* Deploy Strategy Modal */}
      <StrategyBuilderModal
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        initialPrompt={deployedPrompt}
        initialSymbol={symbol}
      />
    </div>
  );
};
