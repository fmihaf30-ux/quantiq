import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { ema, type Candle, type Timeframe, type KeyLevel } from '@engine';
import { Camera, RefreshCw, Layers } from 'lucide-react';

interface TradingViewChartProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  keyLevels?: KeyLevel[];
  onCaptureChart?: (base64Image: string) => void;
  onRefreshData?: () => void;
  isCapturing?: boolean;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  timeframe,
  candles,
  keyLevels = [],
  onCaptureChart,
  onRefreshData,
  isCapturing = false,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [showIndicators, setShowIndicators] = useState(true);

  // Initialize and update lightweight chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up old chart if any
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0f12' },
        textColor: '#8b949e',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(34, 38, 48, 0.4)' },
        horzLines: { color: 'rgba(34, 38, 48, 0.4)' },
      },
      crosshair: {
        vertLine: { color: '#c4f042', width: 1, style: 3 },
        horzLine: { color: '#c4f042', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: '#222630',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: '#222630',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      width: container.clientWidth || 800,
      height: 520,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Format candle data for lightweight-charts
    const chartCandles = candles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(chartCandles);
    candleSeriesRef.current = candleSeries;

    // Optional EMAs overlay
    if (showIndicators && candles.length > 25) {
      const closes = candles.map((c) => c.close);
      const ema9 = ema(closes, 9);
      const ema21 = ema(closes, 21);

      const ema9Series = chart.addSeries(LineSeries, {
        color: '#06b6d4',
        lineWidth: 1,
        title: 'EMA 9',
      });
      ema9Series.setData(
        candles
          .map((c, i) => ({ time: c.time as any, value: ema9[i] }))
          .filter((d) => Number.isFinite(d.value))
      );

      const ema21Series = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        title: 'EMA 21',
      });
      ema21Series.setData(
        candles
          .map((c, i) => ({ time: c.time as any, value: ema21[i] }))
          .filter((d) => Number.isFinite(d.value))
      );
    }

    // Key Levels / SMC lines
    keyLevels.forEach((level) => {
      const color =
        level.kind === 'resistance' ? '#ef4444' : level.kind === 'support' ? '#10b981' : '#a855f7';
      candleSeries.createPriceLine({
        price: level.price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${level.kind.toUpperCase()}: ${level.note}`,
      });
    });

    chart.timeScale().fitContent();
    chartInstanceRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 480,
        });
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
  }, [candles, keyLevels, showIndicators]);

  // Capture canvas image to base64
  const handleCapture = () => {
    if (!chartContainerRef.current || !onCaptureChart) return;
    try {
      const canvas = chartContainerRef.current.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        onCaptureChart(base64);
      }
    } catch (e) {
      console.warn('Canvas capture error', e);
    }
  };

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePercent = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  return (
    <div className="relative flex flex-col rounded-xl border border-[#222630] bg-[#0d0f12] overflow-hidden">
      {/* Chart Top Controls */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#222630] px-4 py-2.5 bg-[#121418]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-white">{symbol}</span>
            <span className="rounded bg-[#1c212a] px-2 py-0.5 text-xs font-semibold text-slate-300">
              {timeframe}
            </span>
          </div>
          {lastCandle && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="font-semibold text-white">${lastCandle.close.toFixed(2)}</span>
              <span className={`font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Indicator toggle */}
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              showIndicators
                ? 'border-[#06b6d4]/40 bg-[#06b6d4]/10 text-cyan-300'
                : 'border-[#222630] bg-[#171a22] text-slate-400'
            }`}
            title="Toggle EMA 9 / 21 Indicators"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>EMA 9/21</span>
          </button>

          {/* Refresh button */}
          {onRefreshData && (
            <button
              onClick={onRefreshData}
              className="flex items-center gap-1 rounded-lg border border-[#222630] bg-[#171a22] p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh Market Data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Capture for AI */}
          {onCaptureChart && (
            <button
              onClick={handleCapture}
              disabled={isCapturing}
              className="flex items-center gap-1.5 rounded-lg bg-[#c4f042] px-3 py-1 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>{isCapturing ? 'Analyzing...' : 'Analyze Chart AI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        id="tradingview-chart"
        className="w-full h-[520px]"
      />
    </div>
  );
};
