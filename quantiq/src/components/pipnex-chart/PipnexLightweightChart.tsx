import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  Crosshair,
  Eye,
  EyeOff,
  Maximize2,
  ChevronsRightLeft,
  RefreshCw,
} from "lucide-react";

export interface CandleData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradeSignal {
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  confidence?: number; // 0..1 (e.g., 0.85 -> "85%")
  strategy?: string;
  orderType?: "MARKET" | "LIMIT";
  entryTime?: number; // Unix timestamp in seconds of entry candle
  ticket?: number;
}

export interface SmcZone {
  high: number;
  low: number;
  label?: string;
  type?:
    | "support"
    | "resistance"
    | "ob_bullish"
    | "ob_bearish"
    | "fvg_bullish"
    | "fvg_bearish";
}

export interface SmcStructureBreak {
  price: number;
  type: "BOS" | "ChoCH" | "CHoCH";
  direction: "bullish" | "bearish";
}

export interface SmcRoleReversal {
  price: number;
  original_type?: string;
  new_type?: string;
  label?: string;
}

export interface SmcLiquidityZone {
  price: number;
  type: "buy_side" | "sell_side" | "equal_highs" | "equal_lows";
  label?: string;
}

export interface SmcElements {
  supportZones?: SmcZone[];
  resistanceZones?: SmcZone[];
  orderBlocks?: SmcZone[];
  fairValueGaps?: SmcZone[];
  structureBreaks?: SmcStructureBreak[];
  roleReversals?: SmcRoleReversal[];
  liquidityZones?: SmcLiquidityZone[];
}

export interface PipnexLightweightChartProps {
  symbol: string;
  timeframe: string;
  candles: CandleData[];
  isLoading?: boolean;
  height?: number;
  showPriceLabel?: boolean;
  className?: string;
  signal?: TradeSignal | null;
  showSignalLevels?: boolean;
  smcElements?: SmcElements | null;
  showHeader?: boolean;
  onRefresh?: () => void;
}

const toFiniteNumber = (val: unknown): number => {
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  return Number.isFinite(num) ? num : NaN;
};

export function sanitizeCandles(
  rawCandles: Partial<CandleData & { epoch?: number }>[],
  _contextLabel = "chart"
): CandleData[] {
  const list = Array.isArray(rawCandles) ? rawCandles : [];
  const byTime = new Map<number, CandleData>();

  for (const item of list) {
    let timestamp = toFiniteNumber(item?.epoch ?? item?.time);
    if (timestamp > 1e12) {
      timestamp = Math.floor(timestamp / 1000);
    }
    const candle: CandleData = {
      time: Math.floor(timestamp),
      open: toFiniteNumber(item?.open),
      high: toFiniteNumber(item?.high),
      low: toFiniteNumber(item?.low),
      close: toFiniteNumber(item?.close),
    };

    const isValid =
      candle.time > 0 &&
      [candle.open, candle.high, candle.low, candle.close].every(
        (v) => Number.isFinite(v) && v > 0
      ) &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close);

    if (!isValid) continue;
    byTime.set(candle.time, candle);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function findEntryCandle(
  candles: CandleData[],
  entryPrice: number,
  entryTime?: number
): CandleData | null {
  if (!candles || candles.length === 0) return null;

  // 1. If entryTime is specified: find closest candle by timestamp
  if (entryTime && entryTime > 0) {
    let closest = candles[0];
    let minDiff = Math.abs(candles[0].time - entryTime);
    for (let i = 1; i < candles.length; i++) {
      const diff = Math.abs(candles[i].time - entryTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = candles[i];
      }
    }
    return closest;
  }

  // 2. If no entryTime, search backwards in the last 40 candles to find where price touched entryPrice
  const recent = candles.slice(-40);
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    if (c.low <= entryPrice && c.high >= entryPrice) {
      return c;
    }
  }

  // 3. Fallback: default to recent candle (e.g. 8 candles back)
  const fallbackIdx = Math.max(0, candles.length - 8);
  return candles[fallbackIdx];
}

interface TradePositionOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  signal: TradeSignal | null;
  visible: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  latestPrice?: number;
  candles?: CandleData[];
}

interface ProjectedPositionCoords {
  entry: number;
  sl: number;
  tp: number;
  tp1: number;
  containerWidth: number;
  boxLeft: number;
  boxWidth: number;
  isLimitOrder: boolean;
}

export function TradePositionOverlay({
  chart,
  series,
  signal,
  visible,
  containerRef,
  latestPrice,
  candles,
}: TradePositionOverlayProps) {
  const [coords, setCoords] = useState<ProjectedPositionCoords | null>(null);
  const rafRef = useRef<number>(0);

  const projectCoordinates = useCallback(() => {
    if (!chart || !series || !signal || !visible || !containerRef.current) {
      setCoords(null);
      return;
    }
    try {
      const entryY = series.priceToCoordinate(signal.entry);
      const slY = series.priceToCoordinate(signal.stopLoss);
      const tp1Y = series.priceToCoordinate(signal.takeProfit1);
      const tp2Y = signal.takeProfit2
        ? series.priceToCoordinate(signal.takeProfit2)
        : null;

      if (entryY === null || slY === null || tp1Y === null) {
        setCoords(null);
        return;
      }

      const containerWidth = containerRef.current.clientWidth;
      const rightAxisOffset = 70 + 8;

      const isLimitOrder =
        signal.orderType === "LIMIT" ||
        (signal.orderType !== "MARKET" &&
          latestPrice != null &&
          Math.abs(signal.entry - latestPrice) / latestPrice > 0.0015);

      let boxLeft: number;
      let boxWidth: number;

      if (isLimitOrder) {
        // LIMIT ORDER: The object sits far to the right, projected forward near the price scale (Screenshot 1)
        boxWidth = Math.max(140, Math.min(220, containerWidth * 0.18));
        boxLeft = containerWidth - rightAxisOffset - boxWidth;
      } else {
        // MARKET ORDER / EXECUTED ORDER: Attached directly ON THE CANDLE of execution (Screenshot 2)
        const timeScale = chart.timeScale();
        const entryCandle = findEntryCandle(
          candles || [],
          signal.entry,
          signal.entryTime
        );

        const entryCoord = entryCandle
          ? timeScale.timeToCoordinate(entryCandle.time as Time)
          : null;

        const lastCandle =
          candles && candles.length > 0 ? candles[candles.length - 1] : null;
        const lastCoord = lastCandle
          ? timeScale.timeToCoordinate(lastCandle.time as Time)
          : null;

        if (entryCoord !== null) {
          const startX = Number(entryCoord);
          const lastX = lastCoord !== null ? Number(lastCoord) : startX + 60;
          // Project forward past the latest candle by ~16 bars (approx 90px)
          const forwardOffset = 90;
          const targetEndX = Math.min(
            containerWidth - rightAxisOffset,
            Math.max(startX + 110, lastX + forwardOffset)
          );
          boxLeft = startX;
          boxWidth = Math.max(90, targetEndX - startX);
        } else {
          // If entry candle is scrolled off to the left of the screen
          boxLeft = 0;
          const lastX = lastCoord !== null ? Number(lastCoord) : 200;
          boxWidth = Math.min(
            containerWidth - rightAxisOffset,
            Math.max(120, lastX + 90)
          );
        }
      }

      setCoords({
        entry: Number(entryY),
        sl: Number(slY),
        tp: Number(tp2Y ?? tp1Y),
        tp1: Number(tp1Y),
        containerWidth,
        boxLeft,
        boxWidth,
        isLimitOrder,
      });
    } catch {
      setCoords(null);
    }
  }, [chart, series, signal, visible, containerRef, latestPrice, candles]);

  useEffect(() => {
    if (!chart || !series || !signal || !visible) {
      setCoords(null);
      return;
    }

    const onCrosshairMove = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(projectCoordinates);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const timeScale = chart.timeScale();
    const onVisibleLogicalRangeChange = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(projectCoordinates);
    };
    timeScale.subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);

    projectCoordinates();
    const intervalId = setInterval(projectCoordinates, 500);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      timeScale.unsubscribeVisibleLogicalRangeChange(
        onVisibleLogicalRangeChange
      );
      cancelAnimationFrame(rafRef.current);
      clearInterval(intervalId);
    };
  }, [chart, series, signal, visible, projectCoordinates]);

  if (!coords || !signal || !visible) return null;

  const isShort = signal.direction === "SHORT";
  const entryY = coords.entry;
  const slY = coords.sl;
  const tpY = coords.tp;
  const tp1Y = coords.tp1;
  const boxLeft = coords.boxLeft;
  const boxWidth = coords.boxWidth;
  const isLimitOrder = coords.isLimitOrder;

  const slBoxTop = Math.min(entryY, slY);
  const slBoxHeight = Math.abs(slY - entryY);
  const tpBoxTop = Math.min(entryY, tpY);
  const tpBoxHeight = Math.abs(tpY - entryY);

  const outerTargetPrice = signal.takeProfit2 ?? signal.takeProfit1;
  const rrText = `R:R ${(
    Math.abs(outerTargetPrice - signal.entry) /
    Math.max(0.0001, Math.abs(signal.entry - signal.stopLoss))
  ).toFixed(1)}`;
  const confidenceText = signal.confidence
    ? `${Math.round(signal.confidence * 100)}%`
    : null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[5]"
      style={{ overflow: "hidden" }}
    >
      {/* 1. Stop-Loss (Risk) Box */}
      <div
        className="absolute transition-all duration-75"
        style={{
          top: `${slBoxTop}px`,
          left: `${boxLeft}px`,
          width: `${boxWidth}px`,
          height: `${Math.max(slBoxHeight, 2)}px`,
          background: isLimitOrder
            ? "rgba(239, 68, 68, 0.25)"
            : isShort
              ? "rgba(56, 189, 248, 0.18)"
              : "rgba(148, 163, 184, 0.18)",
          borderTop: isShort
            ? isLimitOrder
              ? "2px dashed rgba(239, 68, 68, 0.8)"
              : "1.5px solid rgba(56, 189, 248, 0.8)"
            : "none",
          borderBottom: isShort
            ? "none"
            : isLimitOrder
              ? "2px dashed rgba(239, 68, 68, 0.8)"
              : "1.5px solid rgba(239, 68, 68, 0.8)",
          borderLeft: isLimitOrder
            ? "1px dashed rgba(239, 68, 68, 0.3)"
            : "1px solid rgba(148, 163, 184, 0.35)",
          borderRight: isLimitOrder
            ? "1px dashed rgba(239, 68, 68, 0.3)"
            : "1px solid rgba(148, 163, 184, 0.35)",
        }}
      />

      {/* 2. Take-Profit (Reward) Box */}
      <div
        className="absolute transition-all duration-75"
        style={{
          top: `${tpBoxTop}px`,
          left: `${boxLeft}px`,
          width: `${boxWidth}px`,
          height: `${Math.max(tpBoxHeight, 2)}px`,
          background: isLimitOrder
            ? "rgba(34, 197, 94, 0.20)"
            : isShort
              ? "rgba(239, 68, 68, 0.22)"
              : "rgba(56, 189, 248, 0.18)",
          borderTop: isShort
            ? "none"
            : isLimitOrder
              ? "2px dashed rgba(34, 197, 94, 0.8)"
              : "1.5px solid rgba(56, 189, 248, 0.85)",
          borderBottom: isShort
            ? isLimitOrder
              ? "2px dashed rgba(34, 197, 94, 0.8)"
              : "1.5px solid rgba(239, 68, 68, 0.85)"
            : "none",
          borderLeft: isLimitOrder
            ? "1px dashed rgba(34, 197, 94, 0.3)"
            : "1px solid rgba(56, 189, 248, 0.45)",
          borderRight: isLimitOrder
            ? "1px dashed rgba(34, 197, 94, 0.3)"
            : "1px solid rgba(56, 189, 248, 0.45)",
        }}
      />

      {/* Dividing Entry Line across the Box */}
      <div
        className="absolute"
        style={{
          top: `${entryY}px`,
          left: `${boxLeft}px`,
          width: `${boxWidth}px`,
          height: 0,
          borderTop: isLimitOrder
            ? "1.5px dashed #3B82F6"
            : "1.5px solid rgba(255, 255, 255, 0.75)",
        }}
      />

      {/* TradingView Selection Grip Handles (Matching Screenshot 2) */}
      {!isLimitOrder && (
        <>
          {/* Top-Left */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 -translate-x-1/2 -translate-y-1/2"
            style={{ top: `${Math.min(tpBoxTop, slBoxTop)}px`, left: `${boxLeft}px` }}
          />
          {/* Top-Right */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 translate-x-1/2 -translate-y-1/2"
            style={{ top: `${Math.min(tpBoxTop, slBoxTop)}px`, left: `${boxLeft + boxWidth}px` }}
          />
          {/* Bottom-Left */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 -translate-x-1/2 translate-y-1/2"
            style={{ top: `${Math.max(tpBoxTop + tpBoxHeight, slBoxTop + slBoxHeight)}px`, left: `${boxLeft}px` }}
          />
          {/* Bottom-Right */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 translate-x-1/2 translate-y-1/2"
            style={{ top: `${Math.max(tpBoxTop + tpBoxHeight, slBoxTop + slBoxHeight)}px`, left: `${boxLeft + boxWidth}px` }}
          />
          {/* Entry-Left */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 -translate-x-1/2 -translate-y-1/2"
            style={{ top: `${entryY}px`, left: `${boxLeft}px` }}
          />
          {/* Entry-Right */}
          <div
            className="absolute h-1.5 w-1.5 rounded-sm bg-white border border-sky-400 translate-x-1/2 -translate-y-1/2"
            style={{ top: `${entryY}px`, left: `${boxLeft + boxWidth}px` }}
          />
        </>
      )}

      {/* 3. Center Risk:Reward Ratio Pill (Above Entry) */}
      <div
        className="absolute flex items-center"
        style={{
          top: `${entryY - 24}px`,
          left: `${boxLeft + 16}px`,
        }}
      >
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950/85 text-sky-300 border border-sky-500/40 shadow-sm backdrop-blur-[2px]">
          {rrText}
        </span>
      </div>

      {/* 4. Entry Badge & Line Marker */}
      <div
        className="absolute flex items-center"
        style={{
          top: `${entryY - 11}px`,
          left: `${boxLeft}px`,
          maxWidth: `${Math.max(160, boxWidth)}px`,
        }}
      >
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold shadow-md truncate">
          <span className="text-[9px]">▶</span>
          <span>
            {isLimitOrder
              ? `Buy Limit Order ${signal.entry.toFixed(2)}`
              : `${signal.direction === "LONG" ? "Buy" : "Sell"} Order ${signal.entry.toFixed(2)}`}
          </span>
        </div>
      </div>

      {/* 5. Stop-Loss Badge on Right Edge */}
      <div
        className="absolute flex items-center justify-end"
        style={{
          top: `${slY - 11}px`,
          left: `${boxLeft + boxWidth - 96}px`,
          width: "96px",
        }}
      >
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#EF4444] text-white text-[10px] font-extrabold shadow-sm">
          <span>✕</span>
          <span>SL {signal.stopLoss.toFixed(2)}</span>
        </div>
      </div>

      {/* 6. TP1 Badge on Right Edge */}
      <div
        className="absolute flex items-center justify-end"
        style={{
          top: `${tp1Y - 11}px`,
          left: `${boxLeft + boxWidth - 100}px`,
          width: "100px",
        }}
      >
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#22C55E] text-slate-950 text-[10px] font-extrabold shadow-sm">
          <span>✓</span>
          <span>TP1 {signal.takeProfit1.toFixed(2)}</span>
        </div>
      </div>

      {/* 7. Optional TP2 Badge */}
      {signal.takeProfit2 && (
        <div
          className="absolute flex items-center justify-end"
          style={{
            top: `${tpY - 11}px`,
            left: `${boxLeft + boxWidth - 100}px`,
            width: "100px",
          }}
        >
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#16A34A] text-white text-[10px] font-extrabold shadow-sm">
            <span>✓</span>
            <span>TP2 {signal.takeProfit2.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* 8. Bottom Direction + Strategy Tag */}
      <div
        className="absolute flex items-center gap-1.5"
        style={{
          top: `${Math.max(entryY, slY) + 6}px`,
          left: `${boxLeft + 12}px`,
        }}
      >
        <span
          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded"
          style={{
            color: isShort ? "#fff" : "#022c22",
            background: isShort ? "#EF4444" : "#22C55E",
          }}
        >
          {signal.direction}
        </span>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#141a28] text-slate-300 border border-[#232d44]">
          {signal.strategy || (isLimitOrder ? "SMC Limit Setup" : "MT5 Market Position")}
        </span>
      </div>
    </div>
  );
}

interface SmcOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  smcElements: SmcElements | null;
  visible: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface ProjectedZone {
  top: number;
  height: number;
  label: string;
  type:
    | "support"
    | "resistance"
    | "ob_bullish"
    | "ob_bearish"
    | "fvg_bullish"
    | "fvg_bearish";
}

type LineVisualType =
  | "bos_bullish"
  | "bos_bearish"
  | "choch_bullish"
  | "choch_bearish"
  | "role_reversal"
  | "liquidity_buy"
  | "liquidity_sell";

interface ProjectedLine {
  y: number;
  label: string;
  type: LineVisualType;
}

export function SmcElementsOverlay({
  chart,
  series,
  smcElements,
  visible,
  containerRef,
}: SmcOverlayProps) {
  const [zones, setZones] = useState<ProjectedZone[]>([]);
  const [lines, setLines] = useState<ProjectedLine[]>([]);
  const rafRef = useRef<number>(0);

  const projectSmc = useCallback(() => {
    if (!chart || !series || !smcElements || !visible || !containerRef.current) {
      setZones([]);
      setLines([]);
      return;
    }

    const nextZones: ProjectedZone[] = [];
    const nextLines: ProjectedLine[] = [];

    const pushZone = (
      s: SmcZone,
      defaultLabel: string,
      defaultType: ProjectedZone["type"]
    ) => {
      if (s.high > 0 && s.low > 0) {
        const highY = series.priceToCoordinate(s.high);
        const lowY = series.priceToCoordinate(s.low);
        if (highY !== null && lowY !== null) {
          const top = Math.min(Number(highY), Number(lowY));
          const height = Math.min(Math.max(Math.abs(Number(lowY) - Number(highY)), 3), 8);
          nextZones.push({
            top,
            height,
            label: s.label || defaultLabel,
            type: s.type || defaultType,
          });
        }
      }
    };

    smcElements.supportZones?.forEach((s) => pushZone(s, "Support", "support"));
    smcElements.resistanceZones?.forEach((s) =>
      pushZone(s, "Resistance", "resistance")
    );
    smcElements.orderBlocks?.forEach((s) =>
      pushZone(s, "Order Block", s.type || "ob_bullish")
    );
    smcElements.fairValueGaps?.forEach((s) =>
      pushZone(s, "FVG", s.type || "fvg_bullish")
    );

    smcElements.structureBreaks?.forEach((s) => {
      if (s.price > 0) {
        const y = series.priceToCoordinate(s.price);
        if (y !== null) {
          const isBull = s.direction === "bullish";
          const lineType: LineVisualType =
            s.type === "BOS"
              ? isBull
                ? "bos_bullish"
                : "bos_bearish"
              : isBull
                ? "choch_bullish"
                : "choch_bearish";
          nextLines.push({
            y: Number(y),
            label: s.type === "ChoCH" || s.type === "CHoCH" ? "CHoCH" : "BOS",
            type: lineType,
          });
        }
      }
    });

    smcElements.roleReversals?.forEach((s) => {
      if (s.price > 0) {
        const y = series.priceToCoordinate(s.price);
        if (y !== null) {
          nextLines.push({
            y: Number(y),
            label: s.label || `${s.original_type}→${s.new_type}`,
            type: "role_reversal",
          });
        }
      }
    });

    smcElements.liquidityZones?.forEach((s) => {
      if (s.price > 0) {
        const y = series.priceToCoordinate(s.price);
        if (y !== null) {
          const isBuySide =
            s.type === "buy_side" || s.type === "equal_highs";
          nextLines.push({
            y: Number(y),
            label: s.label || (isBuySide ? "Buy-side Liq" : "Sell-side Liq"),
            type: isBuySide ? "liquidity_buy" : "liquidity_sell",
          });
        }
      }
    });

    setZones(nextZones);
    setLines(nextLines);
  }, [chart, series, smcElements, visible, containerRef]);

  useEffect(() => {
    if (!chart || !series || !smcElements || !visible) {
      setZones([]);
      setLines([]);
      return;
    }
    let active = true;
    const loop = () => {
      if (active) {
        projectSmc();
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [chart, series, smcElements, visible, projectSmc]);

  if (zones.length === 0 && lines.length === 0) return null;

  const containerWidth = containerRef.current?.clientWidth || 800;
  const priceScaleWidth = 70;
  const plotWidth = containerWidth - priceScaleWidth;

  const resolveLineStyle = (type: LineVisualType) => {
    switch (type) {
      case "bos_bullish":
      case "choch_bullish":
        return {
          color: "#10b981",
          bg: "rgba(16,185,129,0.15)",
          border: "rgba(16,185,129,0.4)",
        };
      case "bos_bearish":
      case "choch_bearish":
        return {
          color: "#f43f5e",
          bg: "rgba(244,63,94,0.15)",
          border: "rgba(244,63,94,0.4)",
        };
      case "role_reversal":
        return {
          color: "#f59e0b",
          bg: "rgba(245,158,11,0.15)",
          border: "rgba(245,158,11,0.4)",
        };
      case "liquidity_buy":
        return {
          color: "#a855f7",
          bg: "rgba(168,85,247,0.15)",
          border: "rgba(168,85,247,0.4)",
        };
      case "liquidity_sell":
        return {
          color: "#ec4899",
          bg: "rgba(236,72,153,0.15)",
          border: "rgba(236,72,153,0.4)",
        };
    }
  };

  const splitLineWidth = Math.min(200, plotWidth * 0.25);
  const splitLineLeft = (plotWidth - splitLineWidth) / 2;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[4]"
      style={{ overflow: "hidden" }}
    >
      {zones.map((zone, idx) => {
        const isSupport = zone.type === "support";
        const isBullOb = zone.type === "ob_bullish";
        const isBearOb = zone.type === "ob_bearish";
        const isBullFvg = zone.type === "fvg_bullish";
        const isBearFvg = zone.type === "fvg_bearish";
        const isOb = isBullOb || isBearOb;
        const isFvg = isBullFvg || isBearFvg;

        let bg: string;
        let border: string;
        let textColor: string;

        if (isBullOb) {
          bg = "rgba(34, 197, 94, 0.22)";
          border = "rgba(34, 197, 94, 0.7)";
          textColor = "#22c55e";
        } else if (isBearOb) {
          bg = "rgba(239, 68, 68, 0.22)";
          border = "rgba(239, 68, 68, 0.7)";
          textColor = "#ef4444";
        } else if (isBullFvg) {
          bg = "rgba(59, 130, 246, 0.18)";
          border = "rgba(59, 130, 246, 0.5)";
          textColor = "#3b82f6";
        } else if (isBearFvg) {
          bg = "rgba(249, 115, 22, 0.18)";
          border = "rgba(249, 115, 22, 0.5)";
          textColor = "#f97316";
        } else if (isSupport) {
          bg = "rgba(34, 197, 94, 0.18)";
          border = "rgba(34, 197, 94, 0.6)";
          textColor = "#22c55e";
        } else {
          bg = "rgba(239, 68, 68, 0.18)";
          border = "rgba(239, 68, 68, 0.6)";
          textColor = "#ef4444";
        }

        const borderStyle = isFvg ? "dashed" : "solid";
        const isBounded = isOb || isFvg;
        const width = isBounded ? Math.min(plotWidth * 0.6, plotWidth) : plotWidth;
        const left = isBounded ? (plotWidth - width) / 2 : 0;

        return (
          <div key={`zone-${idx}`}>
            <div
              className="absolute"
              style={{
                top: `${zone.top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${zone.height}px`,
                background: bg,
                borderTop: `1px ${borderStyle} ${border}`,
                borderBottom: `1px ${borderStyle} ${border}`,
                borderLeft: isBounded ? `1px ${borderStyle} ${border}` : "none",
                borderRight: isBounded ? `1px ${borderStyle} ${border}` : "none",
                borderRadius: isBounded ? "2px" : "0",
              }}
            />
            <div
              className="absolute"
              style={{
                top: `${zone.top + zone.height / 2 - 7}px`,
                left: isBounded ? `${left + width / 2 - 20}px` : undefined,
                right: isBounded ? undefined : `${priceScaleWidth + 4}px`,
                whiteSpace: "nowrap",
                opacity: 0.6,
              }}
            >
              <span
                className="text-[8px] font-medium px-1 py-0 rounded"
                style={{
                  color: textColor,
                  background: isBounded
                    ? bg
                    : isSupport
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(239,68,68,0.1)",
                }}
              >
                {zone.label}
              </span>
            </div>
          </div>
        );
      })}

      {lines.map((line, idx) => {
        const style = resolveLineStyle(line.type);
        const isDashed = !line.type.startsWith("liquidity");

        return (
          <div key={`line-${idx}`}>
            <div
              className="absolute"
              style={{
                top: `${line.y}px`,
                left: `${splitLineLeft}px`,
                width: `${splitLineWidth / 2 - 24}px`,
                height: 0,
                borderTop: `2px ${isDashed ? "dashed" : "dotted"} ${style.color}`,
              }}
            />
            <div
              className="absolute flex items-center justify-center"
              style={{
                top: `${line.y - 7}px`,
                left: `${splitLineLeft + splitLineWidth / 2 - 24}px`,
                width: "48px",
                opacity: 0.45,
              }}
            >
              <span
                className="text-[8px] font-medium px-1 py-0 rounded whitespace-nowrap"
                style={{ color: style.color, background: style.bg }}
              >
                {line.label}
              </span>
            </div>
            <div
              className="absolute"
              style={{
                top: `${line.y}px`,
                left: `${splitLineLeft + splitLineWidth / 2 + 24}px`,
                width: `${splitLineWidth / 2 - 24}px`,
                height: 0,
                borderTop: `2px ${isDashed ? "dashed" : "dotted"} ${style.color}`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const getSymbolPriceFormat = (symbol: string) => {
  const isGold = symbol.includes("XAU") || symbol.includes("GOLD");
  const isSynthetic =
    symbol.startsWith("V") ||
    symbol.includes("CRASH") ||
    symbol.includes("BOOM") ||
    symbol.includes("JUMP") ||
    symbol.includes("STEP") ||
    symbol.includes("RANGE") ||
    symbol.includes("DEX") ||
    symbol.includes("DSI");

  if (isSynthetic || isGold) {
    return { precision: 2, minMove: 0.01 };
  }
  if (symbol.includes("JPY")) {
    return { precision: 3, minMove: 0.001 };
  }
  return { precision: 5, minMove: 0.00001 };
};

const getSymbolFullName = (symbol: string): string => {
  const s = symbol.toUpperCase().replace('/', '').replace(/M$/, '');
  if (s.includes('XAU')) return 'Gold / US Dollar';
  if (s.includes('EURUSD')) return 'Euro / US Dollar';
  if (s.includes('GBPUSD')) return 'British Pound / US Dollar';
  if (s.includes('BTCUSD')) return 'Bitcoin / US Dollar';
  if (s.includes('US30')) return 'Dow Jones Industrial 30';
  if (s.includes('NAS100') || s.includes('USTEC')) return 'Nasdaq 100';
  return symbol;
};

export function PipnexLightweightChart({
  symbol,
  timeframe,
  candles,
  isLoading = false,
  height = 600,
  showPriceLabel = true,
  className = "",
  signal = null,
  showSignalLevels = true,
  smcElements = null,
  showHeader = true,
  onRefresh,
}: PipnexLightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const signalPriceLinesRef = useRef<IPriceLine[]>([]);
  const hasInitializedRangeRef = useRef<boolean>(false);
  const prevSymbolRef = useRef<string>(symbol);
  const prevTimeframeRef = useRef<string>(timeframe);

  const [overlaysVisible, setOverlaysVisible] = useState<boolean>(true);
  const [crosshairMode, setCrosshairMode] = useState<CrosshairMode>(CrosshairMode.Normal);

  const [hoveredOhlc, setHoveredOhlc] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(139, 92, 246, 0.08)" },
        horzLines: { color: "rgba(139, 92, 246, 0.08)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(139, 92, 246, 0.5)",
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(139, 92, 246, 0.5)",
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: { borderColor: "rgba(139, 92, 246, 0.2)" },
      timeScale: {
        borderColor: "rgba(139, 92, 246, 0.2)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: { touch: true, mouse: true },
    });

    const { precision, minMove } = getSymbolPriceFormat(symbol);
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision, minMove },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || height,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);
    window.addEventListener("resize", handleResize);
    handleResize();

    chart.subscribeCrosshairMove((param) => {
      if (param.time && seriesRef.current) {
        const data = param.seriesData.get(seriesRef.current) as
          | { open: number; high: number; low: number; close: number }
          | undefined;
        if (data) {
          setHoveredOhlc({
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
          });
        }
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      try {
        seriesRef.current = null;
        chartRef.current = null;
        chart.remove();
      } catch {}
    };
  }, [height, symbol]);

  useEffect(() => {
    if (symbol !== prevSymbolRef.current || timeframe !== prevTimeframeRef.current) {
      prevSymbolRef.current = symbol;
      prevTimeframeRef.current = timeframe;
      hasInitializedRangeRef.current = false;
      if (seriesRef.current) {
        seriesRef.current.setData([]);
        setHoveredOhlc(null);
        chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
        const { precision, minMove } = getSymbolPriceFormat(symbol);
        seriesRef.current.applyOptions({
          priceFormat: { type: "price", precision, minMove },
        });
      }
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    if (candles.length === 0) {
      seriesRef.current.setData([]);
      setHoveredOhlc(null);
      chartRef.current.priceScale("right").applyOptions({ autoScale: true });
      return;
    }

    const clean = sanitizeCandles(candles, `chart ${symbol}`).map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(clean);

    const last = clean[clean.length - 1];
    if (last) {
      setHoveredOhlc({
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
    }

    if (chartRef.current && clean.length > 0 && !hasInitializedRangeRef.current) {
      const count = Math.min(180, clean.length);
      const startIdx = Math.max(0, clean.length - count);
      chartRef.current.timeScale().setVisibleRange({
        from: clean[startIdx].time,
        to: clean[clean.length - 1].time,
      });
      hasInitializedRangeRef.current = true;
    }
  }, [candles, symbol]);

  useEffect(() => {
    if (!seriesRef.current) return;

    signalPriceLinesRef.current.forEach((line) => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch {}
    });
    signalPriceLinesRef.current = [];

    if (!signal || !showSignalLevels || candles.length === 0) return;

    const recent = candles.slice(-200);
    const lastClose = recent[recent.length - 1]?.close ?? 0;
    const isLong = signal.direction === "LONG";
    const entryTitle =
      lastClose > 0 && Math.abs(signal.entry - lastClose) / lastClose > 0.001
        ? `▶ ${isLong ? "Buy" : "Sell"} Limit Order ${signal.entry.toFixed(2)}`
        : `▶ Direct ${isLong ? "Buy" : "Sell"} ${signal.entry.toFixed(2)}`;

    if (signal.entry && signal.entry > 0) {
      signalPriceLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: signal.entry,
          color: "#3B82F6",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: entryTitle,
        })
      );
    }

    if (signal.stopLoss && signal.stopLoss > 0) {
      signalPriceLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: signal.stopLoss,
          color: "#EF4444",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `✕ SL ${signal.stopLoss.toFixed(2)}`,
        })
      );
    }

    if (signal.takeProfit1 && signal.takeProfit1 > 0) {
      signalPriceLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: signal.takeProfit1,
          color: "#22C55E",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `✓ TP1 ${signal.takeProfit1.toFixed(2)}`,
        })
      );
    }

    if (signal.takeProfit2 && signal.takeProfit2 > 0) {
      signalPriceLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: signal.takeProfit2,
          color: "#16A34A",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `✓ TP2 ${signal.takeProfit2.toFixed(2)}`,
        })
      );
    }

    return () => {
      signalPriceLinesRef.current.forEach((line) => {
        try {
          seriesRef.current?.removePriceLine(line);
        } catch {}
      });
      signalPriceLinesRef.current = [];
    };
  }, [signal, showSignalLevels, candles]);

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : 0;
  const { precision } = getSymbolPriceFormat(symbol);

  const outerTargetPrice = signal ? (signal.takeProfit2 ?? signal.takeProfit1) : 0;
  const rrVal = signal
    ? (
        Math.abs(outerTargetPrice - signal.entry) /
        Math.max(0.0001, Math.abs(signal.entry - signal.stopLoss))
      ).toFixed(1)
    : "2.6";
  const confPct = signal?.confidence ? Math.round(signal.confidence * 100) : 87;

  return (
    <div className={`relative flex flex-col w-full rounded-2xl overflow-hidden bg-[#07090e] border border-[#1b2234] ${className}`} ref={wrapperRef}>
      {/* Top Banner (Matching Screenshot) */}
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#0b0e17] border-b border-[#1b2234] text-xs font-mono gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-black text-white text-sm tracking-wide">{symbol}</span>
            <span className="text-slate-400 text-xs font-medium">{getSymbolFullName(symbol)}</span>
            <span className="bg-[#241a3e] text-purple-300 border border-purple-500/30 font-bold px-2 py-0.5 rounded text-[11px]">
              {timeframe}
            </span>
            <span className="text-slate-500 text-[11px] hidden sm:inline">
              Lightweight Charts™ v5.0.9 + Coordinate-Synced DOM Overlays (Oe & Le)
            </span>
          </div>

          {signal && showSignalLevels && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                AI Signal Active: {signal.direction} (R:R {rrVal} · {confPct}% Conf)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Chart Canvas & Overlay Container */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        {/* Floating Top-Left OHLC Banner (Matching Screenshot) */}
        {showPriceLabel && hoveredOhlc && (
          <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2 bg-[#0d111c]/90 border border-zinc-800/80 px-2.5 py-1 rounded-md text-[11px] font-mono shadow-lg">
            <span className="font-extrabold text-white">
              {hoveredOhlc.close.toFixed(precision)}
            </span>
            <span className={`font-semibold ${priceChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {priceChange >= 0 ? "+" : ""}
              {priceChangePct.toFixed(2)}%
            </span>
            <span className="text-slate-400 hidden sm:inline">
              O: {hoveredOhlc.open.toFixed(precision)} H: {hoveredOhlc.high.toFixed(precision)} L: {hoveredOhlc.low.toFixed(precision)}
            </span>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090e]/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
              <span className="h-4 w-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <span>Loading Candlesticks...</span>
            </div>
          </div>
        )}

        {/* Floating Right Action Toolbar (Matching Screenshot 1) */}
        <div className="absolute top-4 right-20 z-20 flex flex-col items-center gap-1.5 bg-[#0e1320]/85 border border-[#1e2638] p-1.5 rounded-xl backdrop-blur-md shadow-xl text-slate-400">
          <button
            onClick={() => {
              if (!chartRef.current) return;
              const nextMode =
                crosshairMode === CrosshairMode.Normal
                  ? CrosshairMode.Magnet
                  : CrosshairMode.Normal;
              setCrosshairMode(nextMode);
              chartRef.current.applyOptions({ crosshair: { mode: nextMode } });
            }}
            className={`p-1.5 rounded-lg transition-all ${
              crosshairMode === CrosshairMode.Magnet
                ? "text-purple-400 bg-purple-500/20"
                : "hover:text-white hover:bg-slate-800"
            }`}
            title="Toggle Magnet Crosshair"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setOverlaysVisible(!overlaysVisible)}
            className={`p-1.5 rounded-lg transition-all ${
              overlaysVisible
                ? "hover:text-white hover:bg-slate-800"
                : "text-amber-400 bg-amber-500/20"
            }`}
            title="Toggle Position & SMC Overlays"
          >
            {overlaysVisible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-all"
            title="Fit Chart to View"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => chartRef.current?.timeScale().resetTimeScale()}
            className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-all"
            title="Reset Time Scale"
          >
            <ChevronsRightLeft className="h-3.5 w-3.5 rotate-90" />
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-all"
              title="Refresh Candlesticks"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Layer 2A: Long/Short Position DOM Overlay */}
        <TradePositionOverlay
          chart={chartRef.current}
          series={seriesRef.current}
          signal={signal}
          visible={showSignalLevels && overlaysVisible}
          containerRef={chartContainerRef}
          latestPrice={hoveredOhlc?.close}
          candles={candles}
        />

        {/* Layer 2B: Smart Money Concepts DOM Overlay */}
        <SmcElementsOverlay
          chart={chartRef.current}
          series={seriesRef.current}
          smcElements={smcElements}
          visible={showSignalLevels && overlaysVisible}
          containerRef={chartContainerRef}
        />

        {/* Lightweight Charts Canvas Root */}
        <div
          ref={chartContainerRef}
          className="w-full h-full overflow-hidden"
          style={{ touchAction: "none", userSelect: "none" }}
        />

        {/* TradingView Brand Mark in Bottom Left (Matching Screenshot) */}
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none opacity-40 select-none">
          <svg className="h-4 w-6 fill-white" viewBox="0 0 36 28">
            <path d="M14 22H7V11h7v11zm11 0h-7V6h7v16zm11 0h-7V0h7v22z" opacity=".2"/>
            <path d="M3.6 20.8h6.8V9.6H3.6v11.2zm11 0h6.8V4.8h-6.8v16zm11 0h6.8V0h-6.8v20.8z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default PipnexLightweightChart;
