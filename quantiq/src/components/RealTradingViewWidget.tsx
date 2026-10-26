import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, BarChart2, Layers, ExternalLink } from 'lucide-react';
import { fetchLiveMarketPrice, type MarketPrice } from '../lib/livePrices';
import { useTheme } from '../context/ThemeContext';

interface RealTradingViewWidgetProps {
  symbol: string;
  timeframe: string;
  onAnalyze?: (base64Image?: string) => void;
  isAnalyzing?: boolean;
}

// Map ticker symbol to real TradingView ticker
const TRADINGVIEW_SYMBOLS: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  EURUSD: 'OANDA:EURUSD',
  BTCUSD: 'BINANCE:BTCUSDT',
  US30: 'CAPITALCOM:US30',
  GBPUSD: 'OANDA:GBPUSD',
  USDJPY: 'OANDA:USDJPY',
  NAS100: 'CAPITALCOM:US100',
};

// Map timeframe to TradingView interval string
const INTERVAL_MAP: Record<string, string> = {
  M1: '1',
  M5: '5',
  M15: '15',
  M30: '30',
  H1: '60',
  H4: '240',
  D1: 'D',
};

export const RealTradingViewWidget: React.FC<RealTradingViewWidgetProps> = ({
  symbol,
  timeframe,
  onAnalyze,
  isAnalyzing = false,
}) => {
  const { theme } = useTheme();
  const [livePrice, setLivePrice] = useState<MarketPrice | null>(null);
  const tvSymbol = TRADINGVIEW_SYMBOLS[symbol] || `OANDA:${symbol}`;
  const interval = INTERVAL_MAP[timeframe] || '15';

  // Fetch real live price quote
  useEffect(() => {
    let active = true;
    const updatePrice = async () => {
      const p = await fetchLiveMarketPrice(symbol);
      if (active) setLivePrice(p);
    };
    updatePrice();
    const timer = setInterval(updatePrice, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [symbol]);

  // Construct guaranteed TradingView Embed URL with active theme and full toolbar
  const tvEmbedUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
    tvSymbol
  )}&interval=${interval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=${theme === 'light' ? 'ffffff' : '0a0b0d'}&studies=%5B%22STD%3BEMA%22%5D&theme=${theme}&style=1&timezone=Etc%2FUTC&locale=en`;

  return (
    <div className="relative flex flex-col rounded-2xl border border-[#222630] bg-[#0c0e12] overflow-hidden shadow-2xl">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#202530] px-4 py-3 bg-[#13161e]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-extrabold text-white">{symbol}</span>
            <span className="rounded-md bg-[#1d222e] px-2 py-0.5 text-xs font-bold text-[#c4f042] border border-[#2a303e]">
              {timeframe}
            </span>
            {livePrice && (
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                ${livePrice.price.toLocaleString(undefined, {
                  minimumFractionDigits: symbol.includes('JPY') ? 3 : symbol.includes('USD') && !symbol.includes('BTC') && !symbol.includes('US30') ? 2 : 2,
                })}
              </span>
            )}
            <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
              TradingView Live Feed ({tvSymbol})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAnalyze && (
            <button
              onClick={() => onAnalyze()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-4 py-2 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_20px_rgba(196,240,66,0.25)] hover:scale-105 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              <span>{isAnalyzing ? 'Scanning Structure...' : 'Scan Chart with Trish AI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Guaranteed Rock-Solid TradingView Iframe Canvas */}
      <div className="relative w-full h-[540px] sm:h-[600px] bg-[#0a0b0d]">
        <iframe
          key={`${tvSymbol}-${interval}-${theme}`}
          src={tvEmbedUrl}
          title={`TradingView Chart ${symbol}`}
          className="w-full h-full border-0"
          allow="fullscreen"
          loading="eager"
        />
      </div>
    </div>
  );
};
