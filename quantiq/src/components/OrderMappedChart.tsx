import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  ColorType, 
  type IChartApi, 
  type ISeriesApi, 
  CandlestickSeries,
  type IPriceLine
} from 'lightweight-charts';
import { fetchLiveCandles, formatSymbolPrice } from '../lib/livePrices';
import type { Position } from '../types';
import type { LivePendingOrder } from '../lib/metaapi';
import { 
  Crosshair, 
  ShieldAlert, 
  Target, 
  RefreshCw, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Sliders, 
  X, 
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface OrderMappedChartProps {
  symbol: string;
  timeframe: string;
  activePosition: Position | null;
  pendingOrders?: LivePendingOrder[];
  previewLimitPrice?: number | null;
  isLimitMode?: boolean;
  latestSMCSetup?: any;
  onClosePosition?: () => void;
  height?: number;
}

export const OrderMappedChart: React.FC<OrderMappedChartProps> = ({
  symbol,
  timeframe,
  activePosition,
  pendingOrders = [],
  previewLimitPrice = null,
  isLimitMode = false,
  latestSMCSetup = null,
  onClosePosition,
  height = 540,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSwings, setShowSwings] = useState(true);
  const [showLimits, setShowLimits] = useState(true);
  const [showPriceLines, setShowPriceLines] = useState(false); // Clean mode: default to NO harsh cross-screen lines!
  const { theme } = useTheme();

  // Manual interactive drawing tool modes: 'AUTO' | 'LONG' | 'SHORT' | 'LIMIT'
  const [activeTool, setActiveTool] = useState<'AUTO' | 'LONG' | 'SHORT'>('AUTO');
  const [selectedPendingTicket, setSelectedPendingTicket] = useState<number | null>(null);

  // Box overlay pixel coordinates
  const [boxCoords, setBoxCoords] = useState<{
    entryY: number;
    tpY: number;
    slY: number;
    trailingY: number | null;
    startX: number;
    endX: number;
    visible: boolean;
    isLong: boolean;
    isLimit: boolean;
    label: string;
    entryPrice: number;
    tpPrice: number;
    slPrice: number;
    trailingPrice: number | null;
  }>({
    entryY: 0,
    tpY: 0,
    slY: 0,
    trailingY: null,
    startX: 0,
    endX: 0,
    visible: false,
    isLong: true,
    isLimit: false,
    label: '',
    entryPrice: 0,
    tpPrice: 0,
    slPrice: 0,
    trailingPrice: null,
  });

  // Filter pending orders matching the current symbol
  const relevantPending = pendingOrders.filter(
    (o) => o.symbol.toUpperCase().replace(/M$/, '') === symbol.toUpperCase().replace(/M$/, '')
  );

  // 1. Fetch live candles on symbol or timeframe change
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const data = await fetchLiveCandles(symbol, timeframe, 120);
        if (isMounted && data && data.length > 0) {
          setCandles(data);
        }
      } catch (err) {
        console.warn('Failed to load candles for mapped chart:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [symbol, timeframe]);

  // 2. Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const isLight = theme === 'light';
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#07090e' },
        textColor: isLight ? '#475569' : '#94a3b8',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', -apple-system, BlinkMacSystemFont, monospace",
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        vertLine: { color: isLight ? '#6366f1' : '#c4f042', width: 1, style: 3 },
        horzLine: { color: isLight ? '#6366f1' : '#c4f042', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 16,
        barSpacing: 9,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
        autoScale: true,
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      width: container.clientWidth || 800,
      height: height,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    candleSeriesRef.current = candleSeries;
    chartInstanceRef.current = chart;

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height,
        });
        updateBoxCoordinates();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [height]);

  // Apply Theme dynamically to lightweight chart
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const isLight = theme === 'light';
    chartInstanceRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#07090e' },
        textColor: isLight ? '#475569' : '#94a3b8',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        vertLine: { color: isLight ? '#6366f1' : '#c4f042' },
        horzLine: { color: isLight ? '#6366f1' : '#c4f042' },
      },
      timeScale: {
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
      },
      rightPriceScale: {
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
      },
    });
  }, [theme]);

  // 3. Update Candles & Swing High / Swing Low Markers
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    candleSeriesRef.current.setData(candles);

    // Compute Swing Highs (SH) and Swing Lows (SL)
    if (showSwings && candles.length > 10) {
      const markers: any[] = [];
      for (let i = 2; i < candles.length - 2; i++) {
        const cur = candles[i];
        const isHigh = 
          cur.high > candles[i - 1].high &&
          cur.high > candles[i - 2].high &&
          cur.high > candles[i + 1].high &&
          cur.high > candles[i + 2].high;

        const isLow = 
          cur.low < candles[i - 1].low &&
          cur.low < candles[i - 2].low &&
          cur.low < candles[i + 1].low &&
          cur.low < candles[i + 2].low;

        if (isHigh) {
          markers.push({
            time: cur.time,
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'arrowDown',
            text: 'SH',
            size: 0.5,
          });
        } else if (isLow) {
          markers.push({
            time: cur.time,
            position: 'belowBar',
            color: '#38bdf8',
            shape: 'arrowUp',
            text: 'SL',
            size: 0.5,
          });
        }
      }

      // If active position, add entry arrow
      if (activePosition) {
        const lastCandle = candles[candles.length - 1];
        if (lastCandle) {
          markers.push({
            time: lastCandle.time,
            position: activePosition.type === 'buy' ? 'belowBar' : 'aboveBar',
            color: activePosition.type === 'buy' ? '#10b981' : '#ef4444',
            shape: activePosition.type === 'buy' ? 'arrowUp' : 'arrowDown',
            text: `${activePosition.type.toUpperCase()} #${activePosition.ticket}`,
            size: 1.5,
          });
        }
      }

      try {
        (candleSeriesRef.current as any).setMarkers(markers);
      } catch (e) {
        // Safe fallback
      }
    }

    updateBoxCoordinates();
  }, [candles, showSwings, activePosition, activeTool, previewLimitPrice, selectedPendingTicket, latestSMCSetup]);

  // 4. Update Price Lines & Position Box Coordinates
  const updateBoxCoordinates = () => {
    if (!candleSeriesRef.current || !chartInstanceRef.current || candles.length === 0) {
      setBoxCoords((prev) => ({ ...prev, visible: false }));
      return;
    }

    try {
      const series = candleSeriesRef.current;
      const container = chartContainerRef.current;
      if (!container) return;

      const lastClose = candles[candles.length - 1].close;
      const decimals = symbol.includes('USD') && !symbol.includes('XAU') && !symbol.includes('BTC') ? 4 : 2;
      const minDistance = decimals === 4 ? 0.0020 : (symbol.includes('BTC') ? 150 : 5.0);

      // Determine which position/object to map:
      // A) Active Live Position
      // B) Selected or first Pending Limit Order
      // C) Preview Limit Price (while setting up limit order)
      // D) Manual Interactive Tool (Long or Short)
      let isLong = true;
      let isLimit = false;
      let label = '';
      let entry = lastClose;
      let tp = 0;
      let sl = 0;
      let trailingSL: number | null = null;

      const targetPending = selectedPendingTicket 
        ? relevantPending.find((o) => o.ticket === selectedPendingTicket)
        : relevantPending[0];

      if (activeTool === 'LONG') {
        isLong = true;
        entry = lastClose;
        sl = entry - minDistance;
        tp = entry + minDistance * 2.2;
        label = 'INTERACTIVE LONG TOOL';
      } else if (activeTool === 'SHORT') {
        isLong = false;
        entry = lastClose;
        sl = entry + minDistance;
        tp = entry - minDistance * 2.2;
        label = 'INTERACTIVE SHORT TOOL';
      } else if (activePosition) {
        isLong = activePosition.type === 'buy';
        entry = activePosition.openPrice;
        sl = activePosition.stopLoss || (isLong ? entry - minDistance : entry + minDistance);
        tp = activePosition.takeProfit || (isLong ? entry + minDistance * 2.2 : entry - minDistance * 2.2);
        label = `LIVE MT5 POSITION #${activePosition.ticket}`;

        // Check if Stop Loss has been moved past entry (Smart Trailing SL or Breakeven)
        const isTrailingLocked = isLong ? (sl >= entry) : (sl > 0 && sl <= entry);
        if (isTrailingLocked) {
          trailingSL = sl;
        }
      } else if (targetPending && showLimits) {
        isLimit = true;
        isLong = targetPending.type.toUpperCase().includes('BUY');
        entry = targetPending.priceOpen;
        sl = targetPending.sl || (isLong ? entry - minDistance : entry + minDistance);
        tp = targetPending.tp || (isLong ? entry + minDistance * 2.2 : entry - minDistance * 2.2);
        label = `PENDING LIMIT ORDER #${targetPending.ticket}`;
      } else if (isLimitMode && previewLimitPrice && previewLimitPrice > 0) {
        isLimit = true;
        entry = previewLimitPrice;
        isLong = entry <= lastClose; // Buy limit below market, sell limit above
        sl = isLong ? entry - minDistance : entry + minDistance;
        tp = isLong ? entry + minDistance * 2.2 : entry - minDistance * 2.2;
        label = `PROJECTED LIMIT ORDER @ ${formatSymbolPrice(symbol, entry)}`;
      } else if (latestSMCSetup && latestSMCSetup.symbol.toUpperCase().replace(/M$/, '') === symbol.toUpperCase().replace(/M$/, '')) {
        isLong = latestSMCSetup.bias === 'bullish';
        isLimit = latestSMCSetup.orderType === 'LIMIT';
        entry = latestSMCSetup.entry;
        sl = latestSMCSetup.stopLoss;
        tp = latestSMCSetup.takeProfit;
        label = `AI SMC ${latestSMCSetup.orderType} SETUP (${latestSMCSetup.bias.toUpperCase()})`;
      } else {
        // Fallback: Default Projected Long SMC Setup
        isLong = true;
        entry = lastClose;
        sl = entry - minDistance;
        tp = entry + minDistance * 2.2;
        label = 'SMC SETUP PROJECTION';
      }

      const entryY = series.priceToCoordinate(entry);
      const tpY = series.priceToCoordinate(tp);
      const slY = series.priceToCoordinate(sl);
      const trailingY = trailingSL ? series.priceToCoordinate(trailingSL) : null;

      if (entryY === null || tpY === null || slY === null) {
        setBoxCoords((prev) => ({ ...prev, visible: false }));
        return;
      }

      // Span box across right section of chart
      const width = container.clientWidth;
      const startX = Math.max(20, Math.floor(width * 0.40));
      const endX = width - 68; // leave room for right price scale

      setBoxCoords({
        entryY,
        tpY,
        slY,
        trailingY,
        startX,
        endX,
        visible: true,
        isLong,
        isLimit,
        label,
        entryPrice: entry,
        tpPrice: tp,
        slPrice: sl,
        trailingPrice: trailingSL,
      });
    } catch (e) {
      // Ignored during rapid resize
    }
  };

  // 5. Manage TradingView Price Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    // Remove existing price lines
    priceLinesRef.current.forEach((pl) => {
      try {
        series.removePriceLine(pl);
      } catch (e) {
        // Ignored
      }
    });
    priceLinesRef.current = [];

    // Draw Price Lines for mapped object ONLY if showPriceLines is enabled
    if (boxCoords.visible && showPriceLines) {
      const isLight = theme === 'light';
      // Entry Line
      const entryLine = series.createPriceLine({
        price: boxCoords.entryPrice,
        color: boxCoords.isLimit ? '#f59e0b' : (isLight ? '#475569' : '#ffffff'),
        lineWidth: 1,
        lineStyle: 2, // Dashed for a clean, non-obtrusive look
        axisLabelVisible: true,
        title: `${boxCoords.isLimit ? 'LIMIT' : 'ENTRY'}: ${formatSymbolPrice(symbol, boxCoords.entryPrice)}`,
      });
      priceLinesRef.current.push(entryLine);

      // Take Profit Line
      if (boxCoords.tpPrice) {
        const tpLine = series.createPriceLine({
          price: boxCoords.tpPrice,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `TARGET (TP): ${formatSymbolPrice(symbol, boxCoords.tpPrice)}`,
        });
        priceLinesRef.current.push(tpLine);
      }

      // Stop Loss Line
      if (boxCoords.slPrice) {
        const slLine = series.createPriceLine({
          price: boxCoords.slPrice,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `STOP LOSS (SL): ${formatSymbolPrice(symbol, boxCoords.slPrice)}`,
        });
        priceLinesRef.current.push(slLine);
      }

      // Smart Trailing SL Protected Line
      if (boxCoords.trailingPrice) {
        const trailLine = series.createPriceLine({
          price: boxCoords.trailingPrice,
          color: '#06b6d4',
          lineWidth: 1,
          lineStyle: 1, // Dotted cyan
          axisLabelVisible: true,
          title: `🛡️ TRAILING SL: ${formatSymbolPrice(symbol, boxCoords.trailingPrice)}`,
        });
        priceLinesRef.current.push(trailLine);
      }
    }

    // Also draw subtle dashed lines for other pending limit orders
    if (showLimits && relevantPending.length > 0) {
      relevantPending.forEach((ord) => {
        if (ord.ticket !== selectedPendingTicket) {
          const pLine = series.createPriceLine({
            price: ord.priceOpen,
            color: '#f59e0b',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `LIMIT #${ord.ticket} @ ${formatSymbolPrice(symbol, ord.priceOpen)}`,
          });
          priceLinesRef.current.push(pLine);
        }
      });
    }

    updateBoxCoordinates();
  }, [boxCoords.visible, boxCoords.entryPrice, boxCoords.tpPrice, boxCoords.slPrice, boxCoords.trailingPrice, showLimits, showPriceLines, theme, relevantPending.length]);

  // Hook visible logical range changes to update box coordinates
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const timeScale = chartInstanceRef.current.timeScale();
    const handleRangeChange = () => {
      updateBoxCoordinates();
    };

    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
    };
  }, [activePosition, activeTool, previewLimitPrice, relevantPending]);

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePercent = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  // Box heights and vertical positions
  const tpHeight = Math.abs(boxCoords.entryY - boxCoords.tpY);
  const slHeight = Math.abs(boxCoords.entryY - boxCoords.slY);
  const boxWidth = Math.max(10, boxCoords.endX - boxCoords.startX);

  return (
    <div className={`relative flex flex-col w-full h-full select-none overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-[#07090e]'}`}>
      {/* Chart Top Control Bar & Object Palette */}
      <div className={`flex flex-wrap items-center justify-between px-3 py-2 border-b text-xs font-mono gap-2 ${
        theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'border-[#141824] bg-[#0c0f17] text-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`font-extrabold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{symbol}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold border ${
            theme === 'light' ? 'bg-white text-slate-700 border-slate-300' : 'bg-[#1a1f2c] text-slate-300 border-transparent'
          }`}>
            {timeframe}
          </span>
          {lastCandle && (
            <div className="flex items-center gap-2">
              <span className={`font-extrabold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                ${formatSymbolPrice(symbol, lastCandle.close)}
              </span>
              <span className={`font-semibold ${priceChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Chart Drawing Tools & Visibility Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Long Position Tool Button */}
          <button
            onClick={() => setActiveTool(activeTool === 'LONG' ? 'AUTO' : 'LONG')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              activeTool === 'LONG'
                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                : (theme === 'light' ? 'bg-white text-slate-700 hover:text-slate-900 border-slate-200' : 'bg-[#121622] text-slate-300 hover:text-white border-[#222a3d]')
            }`}
            title="Place / Preview TradingView Long Position Tool (Blue Profit / Gray Risk)"
          >
            <TrendingUp className="h-3 w-3" />
            <span>▲ Long Tool</span>
          </button>

          {/* Short Position Tool Button */}
          <button
            onClick={() => setActiveTool(activeTool === 'SHORT' ? 'AUTO' : 'SHORT')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              activeTool === 'SHORT'
                ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                : (theme === 'light' ? 'bg-white text-slate-700 hover:text-slate-900 border-slate-200' : 'bg-[#121622] text-slate-300 hover:text-white border-[#222a3d]')
            }`}
            title="Place / Preview TradingView Short Position Tool (Gray Risk / Blue Profit)"
          >
            <TrendingDown className="h-3 w-3" />
            <span>▼ Short Tool</span>
          </button>

          {/* Clean Mode / Full-width Price Lines Toggle */}
          <button
            onClick={() => setShowPriceLines(!showPriceLines)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              showPriceLines
                ? (theme === 'light' ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40')
                : (theme === 'light' ? 'bg-white text-slate-500 hover:text-slate-800 border-slate-200' : 'bg-[#121622] text-slate-400 hover:text-white border-[#222a3d]')
            }`}
            title={showPriceLines ? "Hide cross-screen price lines (Clean TradingView Box view)" : "Show horizontal price lines"}
          >
            <Sliders className="h-3 w-3" />
            <span>Lines: {showPriceLines ? 'ON' : 'OFF'}</span>
          </button>

          {/* Pending Limits Toggle */}
          {relevantPending.length > 0 && (
            <button
              onClick={() => setShowLimits(!showLimits)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                showLimits
                  ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                  : (theme === 'light' ? 'bg-white text-slate-400 border-slate-200' : 'bg-[#121622] text-slate-500 border-[#222a3d]')
              }`}
              title="Toggle visibility of Pending MT5 Limit Order Objects"
            >
              <Clock className="h-3 w-3" />
              <span>Limits ({relevantPending.length})</span>
            </button>
          )}

          {/* Swing Structure Toggle */}
          <button
            onClick={() => setShowSwings(!showSwings)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-all border ${
              showSwings
                ? 'bg-sky-500/20 text-sky-500 border-sky-500/30'
                : (theme === 'light' ? 'bg-white text-slate-400 border-slate-200' : 'bg-[#121622] text-slate-500 border-[#222a3d]')
            }`}
            title="Toggle SH (Swing High) and SL (Swing Low) Structural Labels"
          >
            <Layers className="h-3 w-3" />
            <span>Swings</span>
          </button>

          {/* Clear Manual Tool */}
          {activeTool !== 'AUTO' && (
            <button
              onClick={() => setActiveTool('AUTO')}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold border ${
                theme === 'light' ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Reset to Auto Position Mapping"
            >
              <X className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}

          {activePosition && (
            <span className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-bold text-emerald-500 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE #{activePosition.ticket}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div className="relative flex-1 w-full min-h-[460px]">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* TRADINGVIEW BACKGROUND WATERMARK (MATCHING SCREENSHOT) */}
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center select-none font-sans font-black text-6xl sm:text-7xl tracking-widest uppercase ${
          theme === 'light' ? 'text-slate-900/5' : 'text-slate-700/15'
        }`}>
          {symbol}, {timeframe}
        </div>

        {/* TRADINGVIEW-STYLE LONG / SHORT POSITION BOX OVERLAY */}
        {boxCoords.visible && (
          <div
            className="absolute pointer-events-none transition-all duration-75 font-mono"
            style={{
              left: `${boxCoords.startX}px`,
              top: `${Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
              width: `${boxWidth}px`,
              height: `${Math.max(boxCoords.entryY, boxCoords.tpY, boxCoords.slY) - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
            }}
          >
            {/* Case 1: LONG POSITION (Blue Take Profit on Top, Gray Stop Loss on Bottom) */}
            {boxCoords.isLong ? (
              <>
                {/* Take Profit Rectangle (Blue in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-sky-400/80 bg-sky-500/20 rounded-t-sm flex flex-col justify-between p-2 shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  style={{
                    top: `${boxCoords.tpY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${tpHeight}px`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      theme === 'light'
                        ? 'bg-white/95 text-sky-700 border-sky-300 shadow-sm'
                        : 'bg-[#07090e]/90 text-sky-300 border-sky-400/40'
                    }`}>
                      TARGET: +2.20R ({formatSymbolPrice(symbol, boxCoords.tpPrice)})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      theme === 'light' ? 'bg-white/90 text-sky-800 border border-sky-200' : 'bg-[#07090e]/75 text-sky-200'
                    }`}>
                      TP ZONE
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold self-end px-1.5 py-0.5 rounded ${
                    theme === 'light' ? 'text-sky-700 bg-white/90 shadow-sm' : 'text-sky-300/80 bg-[#07090e]/60'
                  }`}>
                    Reward: +$110.00 (1:2.2)
                  </span>
                </div>

                {/* Entry Divider Line */}
                <div
                  className={`absolute left-0 w-full border-t-2 shadow-[0_0_8px_rgba(255,255,255,0.6)] flex items-center justify-between px-2 ${
                    theme === 'light' ? 'border-slate-800' : 'border-white'
                  }`}
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                  }}
                >
                  <div className={`px-2 py-0.5 rounded -translate-y-1/2 text-[10px] font-extrabold border shadow ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 border-slate-400'
                      : 'bg-[#07090e]/95 text-white border-slate-500'
                  }`}>
                    <span>ENTRY: {formatSymbolPrice(symbol, boxCoords.entryPrice)}</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded -translate-y-1/2 text-[10px] font-extrabold border ${
                    boxCoords.isLimit
                      ? (theme === 'light' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/50')
                      : (theme === 'light' ? 'bg-white text-emerald-700 border-emerald-300' : 'bg-[#07090e]/90 text-[#c4f042] border-slate-700')
                  }`}>
                    <span>{boxCoords.label}</span>
                  </div>
                </div>

                {/* Stop Loss Rectangle (Gray/Neutral in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-slate-400/60 bg-slate-400/20 rounded-b-sm flex flex-col justify-between p-2"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${slHeight}px`,
                  }}
                >
                  {/* Trailing Stop Locked Line inside SL Zone */}
                  {boxCoords.trailingY !== null && (
                    <div
                      className="absolute left-0 w-full border-t-2 border-dashed border-cyan-400 flex items-center justify-between px-2"
                      style={{
                        top: `${boxCoords.trailingY - boxCoords.entryY}px`,
                      }}
                    >
                      <span className="bg-cyan-950/90 text-cyan-300 border border-cyan-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold -translate-y-1/2">
                        🛡️ TRAILING SL LOCKED @ {formatSymbolPrice(symbol, boxCoords.trailingPrice || 0)}
                      </span>
                    </div>
                  )}

                  <span className={`text-[10px] font-bold self-end px-1.5 py-0.5 rounded ${
                    theme === 'light' ? 'text-slate-700 bg-white/90 shadow-sm' : 'text-slate-300/80 bg-[#07090e]/60'
                  }`}>
                    Risk: -1.00R (-$50.00)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      theme === 'light'
                        ? 'bg-white/95 text-rose-700 border-rose-300 shadow-sm'
                        : 'bg-[#07090e]/90 text-slate-300 border-slate-400/40'
                    }`}>
                      STOP LOSS: -1.00R ({formatSymbolPrice(symbol, boxCoords.slPrice)})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      theme === 'light' ? 'bg-white/90 text-slate-700 border border-slate-200' : 'bg-[#07090e]/75 text-slate-300'
                    }`}>
                      SL ZONE
                    </span>
                  </div>
                </div>
              </>
            ) : (
              /* Case 2: SHORT POSITION (Gray Stop Loss on Top, Blue Take Profit on Bottom) */
              <>
                {/* Stop Loss Rectangle (Gray/Neutral on Top in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-slate-400/60 bg-slate-400/20 rounded-t-sm flex flex-col justify-between p-2"
                  style={{
                    top: `${boxCoords.slY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${slHeight}px`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      theme === 'light'
                        ? 'bg-white/95 text-rose-700 border-rose-300 shadow-sm'
                        : 'bg-[#07090e]/90 text-slate-300 border-slate-400/40'
                    }`}>
                      STOP LOSS: -1.00R ({formatSymbolPrice(symbol, boxCoords.slPrice)})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      theme === 'light' ? 'bg-white/90 text-slate-700 border border-slate-200' : 'bg-[#07090e]/75 text-slate-300'
                    }`}>
                      SL ZONE
                    </span>
                  </div>

                  {/* Trailing Stop Locked Line inside SL Zone */}
                  {boxCoords.trailingY !== null && (
                    <div
                      className="absolute left-0 w-full border-t-2 border-dashed border-cyan-400 flex items-center justify-between px-2"
                      style={{
                        top: `${boxCoords.trailingY - boxCoords.slY}px`,
                      }}
                    >
                      <span className="bg-cyan-950/90 text-cyan-300 border border-cyan-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold -translate-y-1/2">
                        🛡️ TRAILING SL LOCKED @ {formatSymbolPrice(symbol, boxCoords.trailingPrice || 0)}
                      </span>
                    </div>
                  )}

                  <span className={`text-[10px] font-bold self-end px-1.5 py-0.5 rounded ${
                    theme === 'light' ? 'text-slate-700 bg-white/90 shadow-sm' : 'text-slate-300/80 bg-[#07090e]/60'
                  }`}>
                    Risk: -1.00R (-$50.00)
                  </span>
                </div>

                {/* Entry Divider Line */}
                <div
                  className={`absolute left-0 w-full border-t-2 shadow-[0_0_8px_rgba(255,255,255,0.6)] flex items-center justify-between px-2 ${
                    theme === 'light' ? 'border-slate-800' : 'border-white'
                  }`}
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                  }}
                >
                  <div className={`px-2 py-0.5 rounded -translate-y-1/2 text-[10px] font-extrabold border shadow ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 border-slate-400'
                      : 'bg-[#07090e]/95 text-white border-slate-500'
                  }`}>
                    <span>ENTRY: {formatSymbolPrice(symbol, boxCoords.entryPrice)}</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded -translate-y-1/2 text-[10px] font-extrabold border ${
                    boxCoords.isLimit
                      ? (theme === 'light' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/50')
                      : (theme === 'light' ? 'bg-white text-purple-700 border-purple-300' : 'bg-[#07090e]/90 text-purple-400 border-slate-700')
                  }`}>
                    <span>{boxCoords.label}</span>
                  </div>
                </div>

                {/* Take Profit Rectangle (Blue on Bottom in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-sky-400/80 bg-sky-500/20 rounded-b-sm flex flex-col justify-between p-2 shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${tpHeight}px`,
                  }}
                >
                  <span className={`text-[10px] font-bold self-end px-1.5 py-0.5 rounded ${
                    theme === 'light' ? 'text-sky-700 bg-white/90 shadow-sm' : 'text-sky-300/80 bg-[#07090e]/60'
                  }`}>
                    Reward: +$110.00 (1:2.2)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      theme === 'light'
                        ? 'bg-white/95 text-sky-700 border-sky-300 shadow-sm'
                        : 'bg-[#07090e]/90 text-sky-300 border-sky-400/40'
                    }`}>
                      TARGET: +2.20R ({formatSymbolPrice(symbol, boxCoords.tpPrice)})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      theme === 'light' ? 'bg-white/90 text-sky-800 border border-sky-200' : 'bg-[#07090e]/75 text-sky-200'
                    }`}>
                      TP ZONE
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
