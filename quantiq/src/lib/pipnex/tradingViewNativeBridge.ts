// ============================================================================
// tradingViewNativeBridge.ts
// Reconstructed from Pipnex Trade Lens v0.80.7 (`chartbridge.js` & `nativeShapeMap.js`)
//
// Shows how Pipnex injects the NATIVE TradingView Long/Short Position tool
// (`long_position` / `short_position`), rectangles, horizontal rays, and
// Fibonacci retracements directly into a live TradingView chart instance
// (`window.TradingViewApi.activeChart()`).
// ============================================================================

export interface TradingViewPoint {
  time: number; // Unix seconds
  price: number;
}

export interface NativePositionRequest {
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  t?: number | null; // Unix timestamp in seconds (defaults to right edge of visible range)
  key?: string;
  overrides?: Record<string, unknown>;
}

export interface NativeShapeRequest {
  shape:
    | "long_position"
    | "short_position"
    | "rectangle"
    | "horizontal_ray"
    | "horizontal_line"
    | "trend_line"
    | "fib_retracement"
    | "text"
    | "arrow_up"
    | "arrow_down";
  points: { t?: number | null; p: number }[];
  extend?: boolean;
  text?: string;
  overrides?: Record<string, unknown>;
}

/** Minimal interface for TradingView's activeChart() object */
export interface TradingViewActiveChart {
  getVisibleRange?: () => { from: number; to: number } | null;
  getVisiblePriceRange?: () => { from: number; to: number } | null;
  symbolExt?: () => { minmov?: number; minmove?: number; pricescale?: number } | null;
  priceFormatter?: () => {
    state?: () => { minMove?: number; priceScale?: number; fractional?: boolean } | null;
  } | null;
  createShape?: (point: TradingViewPoint, options: Record<string, unknown>) => unknown;
  createMultipointShape?: (
    points: TradingViewPoint[],
    options: Record<string, unknown>
  ) => unknown;
  removeEntity?: (entityId: string) => void;
  getAllShapes?: () => { id: string }[];
}

const attempt = <T>(fn: () => T, fallback: T): T => {
  try {
    const value = fn();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
};

/**
 * Resolves the active TradingView chart instance from `window.TradingViewApi`.
 */
export function getActiveTradingViewChart(): TradingViewActiveChart | null {
  return attempt(
    () => (window as unknown as { TradingViewApi?: { activeChart?: () => TradingViewActiveChart } })
      .TradingViewApi?.activeChart?.() ?? null,
    null
  );
}

/**
 * Extracts the exact instrument tick size from TradingView's chart runtime.
 * Required because TradingView's `long_position` and `short_position` tools
 * expect `stopLevel` and `profitLevel` in integer ticks, NOT raw price distances.
 */
export function getChartMinTick(chart: TradingViewActiveChart): number | null {
  // 1. Try chart.symbolExt()
  const ext = attempt(() => chart.symbolExt?.() ?? null, null);
  const minmov = Number(ext?.minmov ?? ext?.minmove);
  const pricescale = Number(ext?.pricescale);
  if (Number.isFinite(minmov) && Number.isFinite(pricescale) && pricescale > 0) {
    const tick = minmov / pricescale;
    if (tick > 0) return tick;
  }

  // 2. Fallback for live tradingview.com: chart.priceFormatter().state()
  const state = attempt(() => chart.priceFormatter?.()?.state?.() ?? null, null);
  const fmtMove = Number(state?.minMove);
  const fmtScale = Number(state?.priceScale);
  if (
    Number.isFinite(fmtMove) &&
    Number.isFinite(fmtScale) &&
    fmtScale > 0 &&
    state?.fractional !== true
  ) {
    const tick = fmtMove / fmtScale;
    if (tick > 0) return tick;
  }

  return null;
}

const rightEdgeTime = (chart: TradingViewActiveChart): number => {
  const range = attempt(() => chart.getVisibleRange?.() ?? null, null);
  const to = Number(range?.to);
  return Number.isFinite(to) ? to : Math.floor(Date.now() / 1000);
};

const leftEdgeTime = (chart: TradingViewActiveChart): number => {
  const range = attempt(() => chart.getVisibleRange?.() ?? null, null);
  const from = Number(range?.from);
  return Number.isFinite(from) ? from : Math.floor(Date.now() / 1000) - 86400;
};

const runwayTime = (chart: TradingViewActiveChart): number => {
  const range = attempt(() => chart.getVisibleRange?.() ?? null, null);
  const from = Number(range?.from);
  const to = Number(range?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return rightEdgeTime(chart);
  }
  return Math.round(to + (to - from));
};

const toPoints = (
  chart: TradingViewActiveChart,
  points: { t?: number | null; p: number }[],
  { extend = false } = {}
): TradingViewPoint[] =>
  (Array.isArray(points) ? points : [])
    .map((pt) => {
      const price = Number(pt?.p);
      if (!Number.isFinite(price)) return null;
      const open = pt?.t === null || pt?.t === undefined;
      const time = open
        ? extend
          ? runwayTime(chart)
          : rightEdgeTime(chart)
        : Number(pt.t);
      if (!Number.isFinite(time)) return null;
      return { time, price };
    })
    .filter((pt): pt is TradingViewPoint => pt !== null);

const settleEntityId = async (value: unknown): Promise<string | null> => {
  const resolved = await Promise.resolve(value).catch(() => null);
  if (resolved === null || resolved === undefined) return null;
  if (typeof resolved === "string") return resolved;
  if (typeof resolved === "number") return String(resolved);
  const inner = attempt(
    () =>
      (resolved as { id?: unknown; entityId?: unknown; toString?: () => unknown })
        .id ??
      (resolved as { entityId?: unknown }).entityId ??
      (resolved as { toString?: () => unknown }).toString?.(),
    null
  );
  return typeof inner === "string" || typeof inner === "number"
    ? String(inner)
    : null;
};

/**
 * Draws TradingView's native Long Position (`long_position`) or Short Position (`short_position`)
 * risk-reward box object on the active chart.
 */
export async function drawNativeTradingViewPosition(
  chart: TradingViewActiveChart,
  request: NativePositionRequest
): Promise<{ ok: boolean; entityId?: string; error?: string }> {
  const entry = Number(request.entry);
  const stop = Number(request.stop);
  const target = Number(request.target);
  if (![entry, stop, target].every(Number.isFinite)) {
    return { ok: false, error: "bad_levels" };
  }

  const tick = getChartMinTick(chart);
  if (tick === null) {
    return { ok: false, error: "no_tick_size" };
  }

  // Convert price distances from entry into integer tick counts
  const ticks = (a: number, b: number) =>
    Math.max(1, Math.round(Math.abs(a - b) / tick));
  const shape = request.side === "short" ? "short_position" : "long_position";

  const points = toPoints(chart, [{ t: request.t ?? null, p: entry }]);
  if (points.length === 0) return { ok: false, error: "no_points" };

  const raw = attempt(
    () =>
      chart.createMultipointShape?.(points, {
        shape,
        lock: false,
        disableSelection: false,
        disableSave: true,
        disableUndo: true,
        zOrder: "top",
        overrides: {
          stopLevel: ticks(entry, stop),
          profitLevel: ticks(entry, target),
          linewidth: 1,
          stopBackground: "#ef4444",
          profitBackground: "#22c55e",
          linecolor: "#38bdf8",
          ...(request.overrides ?? {}),
        },
      }) ?? null,
    null
  );

  const entityId = await settleEntityId(raw);
  if (entityId === null) return { ok: false, error: "create_refused" };
  return { ok: true, entityId };
}

/**
 * Draws any other native TradingView shape (`rectangle`, `horizontal_ray`, `fib_retracement`, etc.),
 * automatically degrading refused 1-point horizontal rays/lines into a flat 2-point `trend_line`.
 */
export async function drawNativeTradingViewShape(
  chart: TradingViewActiveChart,
  request: NativeShapeRequest
): Promise<{ ok: boolean; entityId?: string; degraded?: string; error?: string }> {
  const points = toPoints(chart, request.points, {
    extend: request.extend === true,
  });
  if (points.length === 0) return { ok: false, error: "no_points" };

  const options = {
    shape: request.shape,
    lock: false,
    disableSelection: false,
    disableSave: true,
    disableUndo: true,
    zOrder: "top",
    ...(request.text ? { text: request.text } : {}),
    ...(request.overrides ? { overrides: request.overrides } : {}),
  };

  const raw = attempt(() => {
    if (points.length === 1 && typeof chart.createShape === "function") {
      return chart.createShape(points[0], options);
    }
    return chart.createMultipointShape?.(points, options) ?? null;
  }, null);

  const entityId = await settleEntityId(raw);
  if (entityId !== null) return { ok: true, entityId };

  // Fallback for live tradingview.com builds that refuse 1-point horizontal shapes
  if (
    ["horizontal_ray", "horizontal_line", "cross_line"].includes(request.shape) &&
    points.length === 1
  ) {
    const price = points[0].price;
    const flatPoints: TradingViewPoint[] = [
      { time: Math.min(points[0].time, leftEdgeTime(chart)), price },
      { time: runwayTime(chart), price },
    ];
    const retried = attempt(
      () =>
        chart.createMultipointShape?.(flatPoints, {
          ...options,
          shape: "trend_line",
        }) ?? null,
      null
    );
    const retriedId = await settleEntityId(retried);
    if (retriedId !== null) {
      return { ok: true, entityId: retriedId, degraded: "trend_line" };
    }
  }

  return { ok: false, error: "create_refused" };
}
