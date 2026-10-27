import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchLiveCandles, formatSymbolPrice } from '../lib/livePrices';
import type { Position } from '../types';
import type { LivePendingOrder } from '../lib/metaapi';
import { 
  TrendingUp, 
  TrendingDown, 
  BoxSelect, 
  Sliders, 
  X, 
  ShieldAlert,
  Target
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  PipnexLightweightChart,
  type CandleData,
  type TradeSignal,
  type SmcElements,
  type SmcZone,
  type SmcStructureBreak,
  type SmcLiquidityZone,
} from './pipnex-chart/PipnexLightweightChart';

export interface OrderMappedChartProps {
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
  height = 620,
}) => {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showSignalLevels, setShowSignalLevels] = useState(true);
  const [activeTool, setActiveTool] = useState<'AUTO' | 'LONG' | 'SHORT'>('AUTO');
  const { theme } = useTheme();

  const cleanSym = symbol.toUpperCase().replace('/', '').replace(/M$/, '');

  // 1. Fetch live candles on symbol or timeframe change
  const loadData = useCallback(async () => {
    try {
      const data = await fetchLiveCandles(symbol, timeframe, 120);
      if (data && data.length > 0) {
        setCandles(data);
      }
    } catch (err) {
      console.warn('Failed to load candles for mapped chart:', err);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const livePrice = lastCandle?.close ?? 0;
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePercent = prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : 0;

  // 2. Derive Institutional SMC Elements from latestSMCSetup or live candles
  const smcElements: SmcElements = useMemo(() => {
    if (!showZones || candles.length < 10) {
      return {};
    }

    const recent = candles.slice(-60);
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    let swingHighIdx = 0;
    let swingLowIdx = 0;

    recent.forEach((c, idx) => {
      if (c.high > highestHigh) {
        highestHigh = c.high;
        swingHighIdx = idx;
      }
      if (c.low < lowestLow) {
        lowestLow = c.low;
        swingLowIdx = idx;
      }
    });

    const supportZones: SmcZone[] = [];
    const resistanceZones: SmcZone[] = [];
    const orderBlocks: SmcZone[] = [];
    const fairValueGaps: SmcZone[] = [];
    const structureBreaks: SmcStructureBreak[] = [];
    const liquidityZones: SmcLiquidityZone[] = [];

    // Order Blocks & FVGs from latestSMCSetup
    if (latestSMCSetup && latestSMCSetup.orderBlockPrice) {
      const obPrice = Number(latestSMCSetup.orderBlockPrice);
      const isBull = latestSMCSetup.bias !== 'bearish';
      const spread = obPrice * 0.0012;
      orderBlocks.push({
        high: obPrice + spread,
        low: Math.max(0, obPrice - spread),
        label: isBull ? 'Bullish OB' : 'Bearish OB',
        type: isBull ? 'ob_bullish' : 'ob_bearish',
      });
    } else if (swingLowIdx > 0 && lowestLow < Infinity) {
      // Automatic Bullish OB around swing low
      const obCandle = recent[swingLowIdx];
      const obHeight = Math.max(obCandle.high - obCandle.low, livePrice * 0.0015);
      orderBlocks.push({
        high: obCandle.low + obHeight,
        low: obCandle.low,
        label: 'Bullish OB',
        type: 'ob_bullish',
      });
    }

    if (latestSMCSetup && latestSMCSetup.fvgLevel) {
      const fvgPrice = Number(latestSMCSetup.fvgLevel);
      const isBull = latestSMCSetup.bias !== 'bearish';
      const spread = fvgPrice * 0.0008;
      fairValueGaps.push({
        high: fvgPrice + spread,
        low: Math.max(0, fvgPrice - spread),
        label: isBull ? 'Bullish FVG' : 'Bearish FVG',
        type: isBull ? 'fvg_bullish' : 'fvg_bearish',
      });
    }

    // Structure Breaks (BOS / CHoCH)
    if (highestHigh > 0 && highestHigh < Infinity) {
      structureBreaks.push({
        price: highestHigh,
        type: 'BOS',
        direction: 'bullish',
      });
    }

    // Key Support / Supply zones
    if (lowestLow > 0 && lowestLow < Infinity) {
      const supSpread = lowestLow * 0.001;
      supportZones.push({
        high: lowestLow,
        low: Math.max(0, lowestLow - supSpread),
        label: 'Key Support',
        type: 'support',
      });
    }

    if (highestHigh > 0 && highestHigh < Infinity) {
      const resSpread = highestHigh * 0.001;
      resistanceZones.push({
        high: highestHigh + resSpread,
        low: highestHigh,
        label: 'HTF Supply',
        type: 'resistance',
      });
    }

    // Liquidity zones
    if (highestHigh > 0 && highestHigh < Infinity) {
      liquidityZones.push({
        price: highestHigh,
        type: 'buy_side',
        label: 'Buy-side Liq (EQH)',
      });
    }

    return {
      supportZones,
      resistanceZones,
      orderBlocks,
      fairValueGaps,
      structureBreaks,
      liquidityZones,
    };
  }, [showZones, candles, latestSMCSetup, livePrice]);

  // 3. Derive Long/Short Trade Signal
  const tradeSignal: TradeSignal | null = useMemo(() => {
    if (!showSignalLevels || livePrice <= 0) return null;

    // A. Active MT5 Position (Executed Market Order -> locks onto candle)
    if (activePosition) {
      const isLong = activePosition.type.toLowerCase() === 'buy';
      const entry = activePosition.openPrice || livePrice;
      const defaultDist = entry * 0.004;
      const stopLoss = activePosition.stopLoss && activePosition.stopLoss > 0
        ? activePosition.stopLoss
        : isLong ? entry - defaultDist : entry + defaultDist;
      const takeProfit1 = activePosition.takeProfit && activePosition.takeProfit > 0
        ? activePosition.takeProfit
        : isLong ? entry + defaultDist * 2.5 : entry - defaultDist * 2.5;

      const entryTime = activePosition.openTime
        ? Math.floor(new Date(activePosition.openTime).getTime() / 1000)
        : undefined;

      return {
        direction: isLong ? 'LONG' : 'SHORT',
        entry,
        stopLoss,
        takeProfit1,
        confidence: 0.92,
        strategy: `MT5 #${activePosition.ticket}`,
        orderType: 'MARKET',
        entryTime,
        ticket: activePosition.ticket,
      };
    }

    // B. Manual Tool Override (Trader clicked ▲ Long Tool or ▼ Short Tool)
    if (activeTool === 'LONG') {
      const entry = previewLimitPrice || livePrice;
      const risk = entry * 0.0035;
      const isLimit = isLimitMode || (previewLimitPrice !== null && previewLimitPrice !== undefined);
      return {
        direction: 'LONG',
        entry,
        stopLoss: entry - risk,
        takeProfit1: entry + risk * 2.6,
        confidence: 0.88,
        strategy: 'Manual Long Tool',
        orderType: isLimit ? 'LIMIT' : 'MARKET',
      };
    }

    if (activeTool === 'SHORT') {
      const entry = previewLimitPrice || livePrice;
      const risk = entry * 0.0035;
      const isLimit = isLimitMode || (previewLimitPrice !== null && previewLimitPrice !== undefined);
      return {
        direction: 'SHORT',
        entry,
        stopLoss: entry + risk,
        takeProfit1: entry - risk * 2.6,
        confidence: 0.88,
        strategy: 'Manual Short Tool',
        orderType: isLimit ? 'LIMIT' : 'MARKET',
      };
    }

    // C. Autonomous Trish AI SMC Setup
    if (latestSMCSetup && latestSMCSetup.entry > 0) {
      const isLong = latestSMCSetup.bias !== 'bearish';
      const entry = previewLimitPrice || latestSMCSetup.entry;
      const stopLoss = latestSMCSetup.stopLoss || (isLong ? entry * 0.996 : entry * 1.004);
      const takeProfit1 = latestSMCSetup.takeProfit || (isLong ? entry * 1.01 : entry * 0.99);
      
      let rawConf = latestSMCSetup.confidence;
      if (typeof rawConf === 'string') rawConf = parseFloat(rawConf);
      if (rawConf > 1) rawConf = rawConf / 100;
      const confidence = rawConf || 0.87;

      const isLimit = isLimitMode || latestSMCSetup.orderType === 'LIMIT' || (previewLimitPrice !== null && previewLimitPrice !== undefined);

      return {
        direction: isLong ? 'LONG' : 'SHORT',
        entry,
        stopLoss,
        takeProfit1,
        confidence,
        strategy: latestSMCSetup.orderType ? `${latestSMCSetup.orderType} (SMC)` : 'SMC Sweep + OB',
        orderType: isLimit ? 'LIMIT' : 'MARKET',
      };
    }

    // D. Default High-Probability Institutional SMC Preview
    const recent = candles.slice(-40);
    if (recent.length > 5) {
      const swingLow = Math.min(...recent.map((c) => c.low));
      const swingHigh = Math.max(...recent.map((c) => c.high));
      const isTrendBullish = (lastCandle?.close ?? 0) >= (recent[0]?.open ?? 0);
      const entry = livePrice;
      const slDist = Math.max(Math.abs(entry - (isTrendBullish ? swingLow : swingHigh)), entry * 0.003);
      const stopLoss = isTrendBullish ? entry - slDist : entry + slDist;
      const takeProfit1 = isTrendBullish ? entry + slDist * 2.6 : entry - slDist * 2.6;
      const isLimit = isLimitMode;

      return {
        direction: isTrendBullish ? 'LONG' : 'SHORT',
        entry,
        stopLoss,
        takeProfit1,
        confidence: 0.87,
        strategy: isLimit ? 'SMC Limit Setup' : 'SMC Market Setup',
        orderType: isLimit ? 'LIMIT' : 'MARKET',
      };
    }

    return null;
  }, [
    activePosition,
    activeTool,
    previewLimitPrice,
    isLimitMode,
    latestSMCSetup,
    candles,
    livePrice,
    lastCandle,
    showSignalLevels,
  ]);

  return (
    <div className={`relative flex flex-col w-full h-full select-none overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-[#07090e]'}`}>
      {/* Top Toolbar Controls */}
      <div className={`flex flex-wrap items-center justify-between px-3 py-2 border-b text-xs font-mono gap-2 ${
        theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'border-[#141824] bg-[#0c0f17] text-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`font-extrabold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{symbol}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold border ${
            theme === 'light' ? 'bg-white text-slate-700 border-slate-300' : 'bg-[#1a1f2c] text-purple-300 border-purple-500/30'
          }`}>
            {timeframe}
          </span>
          {lastCandle && (
            <div className="flex items-center gap-2">
              <span className={`font-extrabold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                ${formatSymbolPrice(symbol, livePrice)}
              </span>
              <span className={`font-semibold ${priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons: Long Tool, Short Tool, Zones, Lines, Close Position */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Active MT5 Position Pill */}
          {activePosition && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg text-[11px] font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE #{activePosition.ticket} ({activePosition.type.toUpperCase()})</span>
              {onClosePosition && (
                <button
                  onClick={onClosePosition}
                  className="ml-1 hover:text-red-400 p-0.5 rounded transition-all"
                  title={`Close Position #${activePosition.ticket}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Long Position Tool Button */}
          <button
            onClick={() => setActiveTool(activeTool === 'LONG' ? 'AUTO' : 'LONG')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              activeTool === 'LONG'
                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                : (theme === 'light' ? 'bg-white text-slate-700 hover:text-slate-900 border-slate-200' : 'bg-[#121622] text-slate-300 hover:text-white border-[#222a3d]')
            }`}
            title="Place / Preview Long Position Risk-Reward Box"
          >
            <TrendingUp className="h-3 w-3 text-sky-400" />
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
            title="Place / Preview Short Position Risk-Reward Box"
          >
            <TrendingDown className="h-3 w-3 text-purple-400" />
            <span>▼ Short Tool</span>
          </button>

          {/* SMC Zones Toggle */}
          <button
            onClick={() => setShowZones(!showZones)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              showZones
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                : (theme === 'light' ? 'bg-white text-slate-400 border-slate-200' : 'bg-[#121622] text-slate-500 border-[#222a3d]')
            }`}
            title="Toggle Institutional Demand / Order Block / FVG Zones"
          >
            <BoxSelect className="h-3 w-3" />
            <span>Zones</span>
          </button>

          {/* Signal Levels & Overlay Toggle */}
          <button
            onClick={() => setShowSignalLevels(!showSignalLevels)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              showSignalLevels
                ? (theme === 'light' ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40')
                : (theme === 'light' ? 'bg-white text-slate-500 hover:text-slate-800 border-slate-200' : 'bg-[#121622] text-slate-400 hover:text-white border-[#222a3d]')
            }`}
            title="Toggle Trade Signal Box & Levels"
          >
            <Sliders className="h-3 w-3" />
            <span>Levels: {showSignalLevels ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main Pipnex Chart Canvas */}
      <div className="flex-1 w-full min-h-[500px]">
        <PipnexLightweightChart
          symbol={symbol}
          timeframe={timeframe}
          candles={candles}
          isLoading={isLoading}
          height={height}
          signal={tradeSignal}
          showSignalLevels={showSignalLevels}
          smcElements={smcElements}
          showHeader={false}
          onRefresh={loadData}
          className="border-0 rounded-none bg-transparent"
        />
      </div>
    </div>
  );
};

export default OrderMappedChart;
