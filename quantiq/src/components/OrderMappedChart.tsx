import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  createChart, 
  ColorType, 
  type IChartApi, 
  type ISeriesApi, 
  CandlestickSeries,
  LineSeries,
  type IPriceLine,
  LineStyle,
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
  ExternalLink,
  BoxSelect
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

interface PositionBoxCoords {
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
  ticket?: number;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  trailingPrice: number | null;
  rrRatio: string;
  rewardCash: string;
  riskCash: string;
}

interface OBZoneCoords {
  visible: boolean;
  topY: number;
  bottomY: number;
  midY: number;
  startX: number;
  endX: number;
  highPrice: number;
  lowPrice: number;
  midPrice: number;
  bosPrice: number | null;
  bosY: number | null;
  label: string;
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
  const scaleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSwings, setShowSwings] = useState(true);
  const [showZones, setShowZones] = useState(true); // Shaded Demand/Order Block Zone (Matching Screenshot 2)
  const [showLimits, setShowLimits] = useState(true);
  const [showPriceLines, setShowPriceLines] = useState(false); // Clean TradingView Position Tool view
  const { theme } = useTheme();

  // Manual interactive drawing tool modes: 'AUTO' | 'LONG' | 'SHORT'
  const [activeTool, setActiveTool] = useState<'AUTO' | 'LONG' | 'SHORT'>('AUTO');
  const [selectedPendingTicket, setSelectedPendingTicket] = useState<number | null>(null);

  // Box overlay pixel coordinates
  const [boxCoords, setBoxCoords] = useState<PositionBoxCoords>({
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
    rrRatio: '2.20',
    rewardCash: '110.00',
    riskCash: '50.00',
  });

  // Order Block / FVG Demand Zone coordinates (Matching Screenshot 2)
  const [obZoneCoords, setObZoneCoords] = useState<OBZoneCoords>({
    visible: false,
    topY: 0,
    bottomY: 0,
    midY: 0,
    startX: 0,
    endX: 0,
    highPrice: 0,
    lowPrice: 0,
    midPrice: 0,
    bosPrice: null,
    bosY: null,
    label: '',
  });

  // Filter pending orders matching the current symbol
  const cleanSym = symbol.toUpperCase().replace('/', '').replace(/M$/, '');
  const relevantPending = pendingOrders.filter(
    (o) => o.symbol.toUpperCase().replace('/', '').replace(/M$/, '') === cleanSym
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
    const interval = setInterval(loadData, 4000);
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
        rightOffset: 25, // Breathing room for future position projection
        barSpacing: 9,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: isLight ? '#e2e8f0' : '#1e293b',
        autoScale: true,
        scaleMargins: {
          top: 0.16, // Ensure plenty of top margin for TP
          bottom: 0.16, // Ensure plenty of bottom margin for SL and OB Zone
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

    // Invisible anchor line series to ensure Lightweight Charts' vertical scale
    // automatically includes TP, SL, and OB demand levels into view
    const scaleSeries = chart.addSeries(LineSeries, {
      color: 'rgba(0, 0, 0, 0)',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lineVisible: false,
    });

    candleSeriesRef.current = candleSeries;
    scaleSeriesRef.current = scaleSeries;
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

  // Apply Theme dynamically
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

  // Helper: Detect Institutional Demand/Supply Zone (M.J.M Setup 1 - Matching Screenshot 2)
  const computeOBZone = useCallback((candleData: any[], isLong: boolean, latestSMC: any) => {
    if (!candleData || candleData.length < 15) return null;

    // A) If latestSMC provides pairedZone or orderBlockPrice, use that
    if (latestSMC?.pairedZone?.hasZone) {
      const pz = latestSMC.pairedZone;
      const obHigh = pz.obHigh;
      const obLow = pz.obLow;
      return {
        highPrice: Math.max(obHigh, obLow),
        lowPrice: Math.min(obHigh, obLow),
        midPrice: Number(((obHigh + obLow) / 2).toFixed(2)),
        bosPrice: latestSMC.bos?.brokenLevel || null,
        startCandleTime: candleData[Math.max(0, candleData.length - 35)].time,
        label: 'SMC PAIRED FVG + ORDER BLOCK ZONE',
      };
    }

    // B) Otherwise detect directly from the candle swing structure (M.J.M logic)
    if (isLong) {
      // Find the lowest low in the recent 60 candles (the PDL / Liquidity sweep)
      let minLow = Infinity;
      let minIdx = -1;
      const startIdx = Math.max(0, candleData.length - 60);
      for (let i = startIdx; i < candleData.length - 5; i++) {
        if (candleData[i].low < minLow) {
          minLow = candleData[i].low;
          minIdx = i;
        }
      }
      if (minIdx !== -1) {
        const obCandle = candleData[minIdx];
        const obLow = obCandle.low;
        const obHigh = Math.max(obCandle.open, obCandle.high);
        // Look for the swing high before the reversal (BOS level)
        let swingHigh = obHigh;
        for (let j = Math.max(0, minIdx - 15); j <= minIdx; j++) {
          if (candleData[j].high > swingHigh) swingHigh = candleData[j].high;
        }
        return {
          highPrice: obHigh,
          lowPrice: obLow,
          midPrice: Number(((obHigh + obLow) / 2).toFixed(2)),
          bosPrice: Number(swingHigh.toFixed(2)),
          startCandleTime: candleData[Math.max(0, minIdx - 2)].time,
          label: `DEMAND ZONE / ORDER BLOCK`,
        };
      }
    } else {
      // Bearish: Find the highest high in recent 60 candles
      let maxHigh = -Infinity;
      let maxIdx = -1;
      const startIdx = Math.max(0, candleData.length - 60);
      for (let i = startIdx; i < candleData.length - 5; i++) {
        if (candleData[i].high > maxHigh) {
          maxHigh = candleData[i].high;
          maxIdx = i;
        }
      }
      if (maxIdx !== -1) {
        const obCandle = candleData[maxIdx];
        const obHigh = obCandle.high;
        const obLow = Math.min(obCandle.open, obCandle.low);
        let swingLow = obLow;
        for (let j = Math.max(0, maxIdx - 15); j <= maxIdx; j++) {
          if (candleData[j].low < swingLow) swingLow = candleData[j].low;
        }
        return {
          highPrice: obHigh,
          lowPrice: obLow,
          midPrice: Number(((obHigh + obLow) / 2).toFixed(2)),
          bosPrice: Number(swingLow.toFixed(2)),
          startCandleTime: candleData[Math.max(0, maxIdx - 2)].time,
          label: `SUPPLY ZONE / ORDER BLOCK`,
        };
      }
    }
    return null;
  }, []);

  // 3. Update Candles & Swing High / Low Markers
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

      // If active position, place entry arrow
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
  }, [candles, showSwings, activePosition, activeTool, previewLimitPrice, selectedPendingTicket, latestSMCSetup, showZones]);

  // 4. Update Price Lines & Position Box Coordinates
  const updateBoxCoordinates = useCallback(() => {
    if (!candleSeriesRef.current || !chartInstanceRef.current || candles.length === 0) {
      setBoxCoords((prev) => ({ ...prev, visible: false }));
      setObZoneCoords((prev) => ({ ...prev, visible: false }));
      return;
    }

    try {
      const series = candleSeriesRef.current;
      const chart = chartInstanceRef.current;
      const container = chartContainerRef.current;
      if (!container) return;

      const lastCandle = candles[candles.length - 1];
      const firstCandle = candles[Math.max(0, candles.length - 25)];
      const lastClose = lastCandle.close;
      const decimals = symbol.includes('USD') && !symbol.includes('XAU') && !symbol.includes('BTC') ? 4 : 2;
      const minDistance = decimals === 4 ? 0.0020 : (symbol.includes('BTC') ? 150 : 5.0);

      // Determine mapped trade:
      let isLong = true;
      let isLimit = false;
      let label = '';
      let ticketNum: number | undefined = undefined;
      let entry = lastClose;
      let tp = 0;
      let sl = 0;
      let trailingSL: number | null = null;
      let lots = 0.05;
      let openTimeRaw: any = null;

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
        ticketNum = activePosition.ticket;
        label = `LIVE MT5 POSITION #${activePosition.ticket}`;
        lots = activePosition.volume || 0.05;
        openTimeRaw = activePosition.openTime;

        // Check if Stop Loss is moved past entry (Breakeven or Trailing SL)
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
        ticketNum = targetPending.ticket;
        label = `PENDING LIMIT ORDER #${targetPending.ticket}`;
        lots = targetPending.volume || 0.05;
      } else if (isLimitMode && previewLimitPrice && previewLimitPrice > 0) {
        isLimit = true;
        entry = previewLimitPrice;
        isLong = entry <= lastClose;
        sl = isLong ? entry - minDistance : entry + minDistance;
        tp = isLong ? entry + minDistance * 2.2 : entry - minDistance * 2.2;
        label = `PROJECTED LIMIT ORDER @ ${formatSymbolPrice(symbol, entry)}`;
      } else if (latestSMCSetup && latestSMCSetup.symbol.toUpperCase().replace('/', '').replace(/M$/, '') === cleanSym) {
        isLong = latestSMCSetup.bias === 'bullish';
        isLimit = latestSMCSetup.orderType === 'LIMIT';
        entry = latestSMCSetup.entry;
        sl = latestSMCSetup.stopLoss;
        tp = latestSMCSetup.takeProfit;
        label = `AI SMC ${latestSMCSetup.orderType} SETUP (${latestSMCSetup.bias.toUpperCase()})`;
      } else {
        // Fallback default setup projection
        isLong = true;
        entry = lastClose;
        sl = entry - minDistance;
        tp = entry + minDistance * 2.2;
        label = 'SMC SETUP PROJECTION';
      }

      // Compute mathematical pixels-per-point ratio for ironclad coordinate projection:
      // Even if TP or SL is slightly beyond the visible viewport, we NEVER hide the box!
      let pixelsPerPoint = 1.0;
      const cHighY = series.priceToCoordinate(lastCandle.high);
      const cLowY = series.priceToCoordinate(lastCandle.low);
      if (cHighY !== null && cLowY !== null && Math.abs(lastCandle.high - lastCandle.low) > 0.0001) {
        pixelsPerPoint = Math.abs(cLowY - cHighY) / Math.abs(lastCandle.high - lastCandle.low);
      } else {
        const cCloseY = series.priceToCoordinate(lastCandle.close);
        const fCloseY = series.priceToCoordinate(firstCandle.close);
        if (cCloseY !== null && fCloseY !== null && Math.abs(lastCandle.close - firstCandle.close) > 0.0001) {
          pixelsPerPoint = Math.abs(cCloseY - fCloseY) / Math.abs(lastCandle.close - firstCandle.close);
        }
      }

      // Safe coordinate calculation: project mathematically if priceToCoordinate is off-screen
      const rawEntryY = series.priceToCoordinate(entry);
      let entryY: number;
      if (rawEntryY !== null) {
        entryY = Number(rawEntryY);
      } else {
        const lastY = Number(series.priceToCoordinate(lastCandle.close) ?? (height / 2));
        entryY = Math.round(lastY - (entry - lastCandle.close) * pixelsPerPoint);
      }

      const rawTpY = series.priceToCoordinate(tp);
      const tpY: number = rawTpY !== null ? Number(rawTpY) : Math.round(entryY - (tp - entry) * pixelsPerPoint);

      const rawSlY = series.priceToCoordinate(sl);
      const slY: number = rawSlY !== null ? Number(rawSlY) : Math.round(entryY + (entry - sl) * pixelsPerPoint);

      const rawTrailY = trailingSL ? series.priceToCoordinate(trailingSL) : null;
      const trailingY: number | null = trailingSL 
        ? (rawTrailY !== null ? Number(rawTrailY) : Math.round(entryY - (trailingSL - entry) * pixelsPerPoint)) 
        : null;

      // Ensure chart scale includes TP, SL, and OB levels using invisible anchor series
      if (scaleSeriesRef.current && candles.length >= 2) {
        const minScalePrice = Math.min(sl, entry, tp);
        const maxScalePrice = Math.max(sl, entry, tp);
        scaleSeriesRef.current.setData([
          { time: candles[0].time, value: minScalePrice },
          { time: candles[candles.length - 1].time, value: maxScalePrice },
        ]);
      }

      // Time-based horizontal anchor: Starts at the EXACT candle bar where the order was taken
      let startX = Math.max(10, Math.floor(container.clientWidth * 0.35));
      let orderTimeSec: number | null = null;

      if (openTimeRaw) {
        const parsed = typeof openTimeRaw === 'number' 
          ? openTimeRaw 
          : Math.floor(new Date(openTimeRaw).getTime() / 1000);
        if (!isNaN(parsed) && parsed > 0) orderTimeSec = parsed;
      }

      if (orderTimeSec) {
        let matchedCandle = candles[candles.length - 1];
        for (let i = candles.length - 1; i >= 0; i--) {
          if (candles[i].time <= orderTimeSec) {
            matchedCandle = candles[i];
            break;
          }
        }
        const xCoord = chart.timeScale().timeToCoordinate(matchedCandle.time as any);
        if (xCoord !== null) {
          startX = Math.max(10, Math.round(Number(xCoord)));
        }
      } else if (activeTool !== 'AUTO') {
        const targetCandle = candles[Math.max(0, candles.length - 15)];
        const xCoord = chart.timeScale().timeToCoordinate(targetCandle.time as any);
        if (xCoord !== null) {
          startX = Math.max(10, Math.round(Number(xCoord)));
        }
      }

      // Span forward into future time / right edge of chart
      const endX = container.clientWidth - 68;

      const slDist = Math.abs(entry - sl);
      const tpDist = Math.abs(tp - entry);
      const rr = slDist > 0 ? (tpDist / slDist).toFixed(2) : '2.20';
      const contractMult = symbol.includes('EUR') || symbol.includes('GBP') ? 100000 : 1000;
      const rewardCashVal = (tpDist * lots * contractMult).toFixed(2);
      const riskCashVal = (slDist * lots * contractMult).toFixed(2);

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
        ticket: ticketNum,
        entryPrice: entry,
        tpPrice: tp,
        slPrice: sl,
        trailingPrice: trailingSL,
        rrRatio: rr,
        rewardCash: rewardCashVal,
        riskCash: riskCashVal,
      });

      // 5. Order Block / FVG Demand Zone Calculation (Matching Screenshot 2 bottom box)
      const obData = computeOBZone(candles, isLong, latestSMCSetup);
      if (obData && showZones) {
        const rawTopY = series.priceToCoordinate(obData.highPrice);
        const rawBottomY = series.priceToCoordinate(obData.lowPrice);
        const rawMidY = series.priceToCoordinate(obData.midPrice);
        const rawBosY = obData.bosPrice ? series.priceToCoordinate(obData.bosPrice) : null;

        const obTopY: number = rawTopY !== null ? Number(rawTopY) : Math.round(entryY - (obData.highPrice - entry) * pixelsPerPoint);
        const obBottomY: number = rawBottomY !== null ? Number(rawBottomY) : Math.round(entryY - (obData.lowPrice - entry) * pixelsPerPoint);
        const obMidY: number = rawMidY !== null ? Number(rawMidY) : Math.round(entryY - (obData.midPrice - entry) * pixelsPerPoint);
        const obBosY: number | null = obData.bosPrice
          ? (rawBosY !== null ? Number(rawBosY) : Math.round(entryY - (obData.bosPrice - entry) * pixelsPerPoint))
          : null;

        let zStartX = Math.max(10, Math.floor(container.clientWidth * 0.25));
        if (obData.startCandleTime) {
          const zx = chart.timeScale().timeToCoordinate(obData.startCandleTime as any);
          if (zx !== null) zStartX = Math.max(10, Math.round(Number(zx)));
        }
        const zEndX = Math.min(container.clientWidth - 68, Math.max(zStartX + 140, startX + 80));

        setObZoneCoords({
          visible: true,
          topY: Math.min(obTopY, obBottomY),
          bottomY: Math.max(obTopY, obBottomY),
          midY: obMidY,
          startX: zStartX,
          endX: zEndX,
          highPrice: obData.highPrice,
          lowPrice: obData.lowPrice,
          midPrice: obData.midPrice,
          bosPrice: obData.bosPrice,
          bosY: obBosY,
          label: obData.label,
        });
      } else {
        setObZoneCoords((prev) => ({ ...prev, visible: false }));
      }
    } catch (e) {
      // Ignored during rapid resize/scroll
    }
  }, [candles, symbol, activePosition, activeTool, previewLimitPrice, selectedPendingTicket, latestSMCSetup, isLimitMode, showLimits, showZones, cleanSym, relevantPending, computeOBZone, height]);

  // 6. Manage TradingView Price Scale Badges & Price Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    // Clear old lines
    priceLinesRef.current.forEach((pl) => {
      try {
        series.removePriceLine(pl);
      } catch (e) {
        // Ignored
      }
    });
    priceLinesRef.current = [];

    if (boxCoords.visible) {
      const isLight = theme === 'light';

      // 1) Target Price Line -> Sky Blue badge on right scale (Matching Screenshot 2)
      if (boxCoords.tpPrice) {
        const tpLine = series.createPriceLine({
          price: boxCoords.tpPrice,
          color: '#2196f3',
          lineWidth: 1,
          lineStyle: showPriceLines ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: true,
          title: '', // Pure clean badge with price only (Matching TradingView)
        });
        priceLinesRef.current.push(tpLine);
      }

      // 2) Entry Price Line -> Dark Slate badge on right scale (Matching Screenshot 2)
      if (boxCoords.entryPrice) {
        const entryLine = series.createPriceLine({
          price: boxCoords.entryPrice,
          color: boxCoords.isLimit ? '#f59e0b' : (isLight ? '#334155' : '#64748b'),
          lineWidth: 1,
          lineStyle: showPriceLines ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: '', // Pure clean badge with price only
        });
        priceLinesRef.current.push(entryLine);
      }

      // 3) Stop Loss Line -> Gray badge on right scale (Matching Screenshot 2)
      if (boxCoords.slPrice) {
        const slLine = series.createPriceLine({
          price: boxCoords.slPrice,
          color: '#787b86',
          lineWidth: 1,
          lineStyle: showPriceLines ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: true,
          title: '', // Pure clean badge with price only
        });
        priceLinesRef.current.push(slLine);
      }

      // 4) Trailing SL / Breakeven Protected Line
      if (boxCoords.trailingPrice) {
        const trailLine = series.createPriceLine({
          price: boxCoords.trailingPrice,
          color: '#06b6d4',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(trailLine);
      }
    }

    // 5) Demand / Order Block Zone Price Scale Badges (Matching Screenshot 2 cyan level)
    if (obZoneCoords.visible && showZones) {
      const obLowLine = series.createPriceLine({
        price: obZoneCoords.lowPrice,
        color: '#06b6d4',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
      priceLinesRef.current.push(obLowLine);

      if (obZoneCoords.bosPrice) {
        const bosLine = series.createPriceLine({
          price: obZoneCoords.bosPrice,
          color: '#38bdf8',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(bosLine);
      }
    }

    // 6) Other pending limit orders
    if (showLimits && relevantPending.length > 0) {
      relevantPending.forEach((ord) => {
        if (ord.ticket !== selectedPendingTicket) {
          const pLine = series.createPriceLine({
            price: ord.priceOpen,
            color: '#f59e0b',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `LIMIT #${ord.ticket}`,
          });
          priceLinesRef.current.push(pLine);
        }
      });
    }

    updateBoxCoordinates();
  }, [boxCoords.visible, boxCoords.entryPrice, boxCoords.tpPrice, boxCoords.slPrice, boxCoords.trailingPrice, obZoneCoords.visible, obZoneCoords.lowPrice, obZoneCoords.bosPrice, showZones, showLimits, showPriceLines, theme, relevantPending.length, selectedPendingTicket, updateBoxCoordinates]);

  // 7. Real-Time Tracking on Scroll, Pan, Zoom
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const timeScale = chartInstanceRef.current.timeScale();
    let rafId: number | null = null;
    const onMove = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateBoxCoordinates();
      });
    };

    timeScale.subscribeVisibleLogicalRangeChange(onMove);
    timeScale.subscribeVisibleTimeRangeChange(onMove);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      timeScale.unsubscribeVisibleLogicalRangeChange(onMove);
      timeScale.unsubscribeVisibleTimeRangeChange(onMove);
    };
  }, [updateBoxCoordinates]);

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePercent = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  // Box heights and dimensions
  const tpHeight = Math.max(4, Math.abs(boxCoords.entryY - boxCoords.tpY));
  const slHeight = Math.max(4, Math.abs(boxCoords.entryY - boxCoords.slY));
  const boxWidth = Math.max(10, boxCoords.endX - boxCoords.startX);

  // Demand / OB Zone dimensions
  const obZoneHeight = Math.max(6, obZoneCoords.bottomY - obZoneCoords.topY);
  const obZoneWidth = Math.max(20, obZoneCoords.endX - obZoneCoords.startX);

  return (
    <div className={`relative flex flex-col w-full h-full select-none overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-[#07090e]'}`}>
      {/* Chart Top Control Bar & Object Palette */}
      <div className={`flex flex-wrap items-center justify-between px-3 py-2 border-b text-xs font-mono gap-2 ${
        theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-800' : 'border-[#141824] bg-[#0c0f17] text-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`font-extrabold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{symbol}</span>
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

          {/* Demand / Order Block Zone Toggle (Matching Screenshot 2) */}
          <button
            onClick={() => setShowZones(!showZones)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              showZones
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                : (theme === 'light' ? 'bg-white text-slate-400 border-slate-200' : 'bg-[#121622] text-slate-500 border-[#222a3d]')
            }`}
            title="Toggle Shaded Institutional Demand / Order Block Zone Box"
          >
            <BoxSelect className="h-3 w-3" />
            <span>Zones</span>
          </button>

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
            <span className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
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

        {/* 1. ORDER BLOCK / DEMAND ZONE BOX (MATCHING SCREENSHOT 2) */}
        {obZoneCoords.visible && showZones && (
          <div
            className="absolute pointer-events-none transition-all duration-75 z-10"
            style={{
              left: `${obZoneCoords.startX}px`,
              top: `${obZoneCoords.topY}px`,
              width: `${obZoneWidth}px`,
              height: `${obZoneHeight}px`,
            }}
          >
            {/* Shaded Clean Rectangle Zone */}
            <div className="relative w-full h-full border border-cyan-400/50 bg-cyan-500/10 rounded-sm">
              {/* Dashed Midline at 50% Mean Threshold (Matching Screenshot 2) */}
              <div
                className="absolute left-0 w-full border-t border-dashed border-cyan-400/60"
                style={{
                  top: `${Math.max(2, obZoneCoords.midY - obZoneCoords.topY)}px`,
                }}
              />
            </div>
          </div>
        )}

        {/* 2. TRADINGVIEW-STYLE LONG / SHORT POSITION BOX (MATCHING SCREENSHOT 2) */}
        {boxCoords.visible && (
          <div
            className="absolute pointer-events-none transition-all duration-75 z-20"
            style={{
              left: `${boxCoords.startX}px`,
              top: `${Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
              width: `${boxWidth}px`,
              height: `${Math.max(boxCoords.entryY, boxCoords.tpY, boxCoords.slY) - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
            }}
          >
            {/* Case 1: LONG POSITION (Clean Sky Blue Profit on Top, Clean Neutral Gray Risk on Bottom) */}
            {boxCoords.isLong ? (
              <>
                {/* Take Profit Rectangle (Clean Sky Blue in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-sky-400/70 bg-sky-500/20 rounded-t-sm"
                  style={{
                    top: `${boxCoords.tpY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${tpHeight}px`,
                  }}
                />

                {/* Entry Divider Line */}
                <div
                  className="absolute left-0 w-full border-t border-slate-300 dark:border-white/80"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                  }}
                />

                {/* Stop Loss Rectangle (Clean Neutral Gray in TradingView) */}
                <div
                  className="absolute left-0 w-full border border-slate-400/50 bg-slate-400/20 rounded-b-sm"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${slHeight}px`,
                  }}
                >
                  {boxCoords.trailingY !== null && (
                    <div
                      className="absolute left-0 w-full border-t border-dashed border-cyan-400"
                      style={{
                        top: `${boxCoords.trailingY - boxCoords.entryY}px`,
                      }}
                    />
                  )}
                </div>
              </>
            ) : (
              /* Case 2: SHORT POSITION (Clean Neutral Gray on Top, Clean Sky Blue on Bottom) */
              <>
                {/* Stop Loss Rectangle (Clean Neutral Gray on Top) */}
                <div
                  className="absolute left-0 w-full border border-slate-400/50 bg-slate-400/20 rounded-t-sm"
                  style={{
                    top: `${boxCoords.slY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${slHeight}px`,
                  }}
                >
                  {boxCoords.trailingY !== null && (
                    <div
                      className="absolute left-0 w-full border-t border-dashed border-cyan-400"
                      style={{
                        top: `${boxCoords.trailingY - boxCoords.slY}px`,
                      }}
                    />
                  )}
                </div>

                {/* Entry Divider Line */}
                <div
                  className="absolute left-0 w-full border-t border-slate-300 dark:border-white/80"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                  }}
                />

                {/* Take Profit Rectangle (Clean Sky Blue on Bottom) */}
                <div
                  className="absolute left-0 w-full border border-sky-400/70 bg-sky-500/20 rounded-b-sm"
                  style={{
                    top: `${boxCoords.entryY - Math.min(boxCoords.entryY, boxCoords.tpY, boxCoords.slY)}px`,
                    height: `${tpHeight}px`,
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
