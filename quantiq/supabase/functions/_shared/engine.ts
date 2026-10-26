// Quantiq strategy engine.
//
// Pure TypeScript with zero imports so the exact same code runs in the browser
// (Vite, via the `@engine` alias) and in Supabase Edge Functions (Deno).
// Everything here is deterministic: given the same candles and spec, the bot
// runner, the backtester and the demo simulator all produce the same signals.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';
export const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400,
};

export type EngineType = 'trend' | 'scalping' | 'range' | 'breakout' | 'swing';
export const ENGINE_TYPES: EngineType[] = ['trend', 'scalping', 'range', 'breakout', 'swing'];

export interface Candle {
  /** Candle open time, unix seconds (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StrategyParams {
  fastPeriod: number;
  slowPeriod: number;
  /** Long-term trend filter EMA. 0 disables the filter. */
  trendPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  channelPeriod: number;
  atrPeriod: number;
}

export interface RiskSettings {
  /** Fixed order volume in lots. */
  lotSize: number;
  /** Stop-loss distance as a multiple of ATR. */
  stopAtrMultiple: number;
  /** Take-profit distance as a multiple of the stop distance. */
  rewardRisk: number;
  maxOpenTrades: number;
}

export interface StrategySpec {
  name: string;
  summary: string;
  engine: EngineType;
  symbol: string;
  timeframe: Timeframe;
  params: StrategyParams;
  risk: RiskSettings;
  /** Human-readable rules, shown in the UI. Execution uses `engine` + `params`. */
  rules: string[];
}

export interface Signal {
  action: 'buy' | 'sell' | 'none';
  reason: string;
  time: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const ENGINE_INFO: Record<EngineType, { label: string; description: string }> = {
  trend: {
    label: 'Trend following',
    description: 'Fast/slow EMA crossover, optionally filtered by a long-term trend EMA.',
  },
  scalping: {
    label: 'Momentum scalping',
    description: 'Short EMA crossover confirmed by RSI momentum. Best on M1–M15.',
  },
  range: {
    label: 'Mean reversion',
    description: 'Buys when RSI recovers from oversold, sells when it falls back from overbought.',
  },
  breakout: {
    label: 'Channel breakout',
    description: 'Enters when price closes beyond the highest high / lowest low of the channel.',
  },
  swing: {
    label: 'Pullback swing',
    description: 'Trades RSI pullbacks in the direction of the long-term trend EMA.',
  },
};

export const DEFAULT_PARAMS: StrategyParams = {
  fastPeriod: 9,
  slowPeriod: 21,
  trendPeriod: 200,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  channelPeriod: 20,
  atrPeriod: 14,
};

export const DEFAULT_RISK: RiskSettings = {
  lotSize: 0.01,
  stopAtrMultiple: 1.5,
  rewardRisk: 2,
  maxOpenTrades: 1,
};

// ---------------------------------------------------------------------------
// Normalisation (anything coming from an LLM or a form passes through here)
// ---------------------------------------------------------------------------

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  Math.round(clamp(v, min, max, fallback));

export function normalizeSymbol(symbol: unknown): string {
  const s = String(symbol ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return s.length >= 3 ? s.slice(0, 16) : 'XAUUSD';
}

export function normalizeTimeframe(tf: unknown): Timeframe {
  const raw = String(tf ?? '').toUpperCase().trim();
  if ((TIMEFRAMES as string[]).includes(raw)) return raw as Timeframe;
  const m = raw.match(/^(\d+)\s*(M|MIN|H|D)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    const candidate = unit === 'H' ? `H${n}` : unit === 'D' ? 'D1' : `M${n}`;
    if ((TIMEFRAMES as string[]).includes(candidate)) return candidate as Timeframe;
  }
  return 'M15';
}

export function normalizeSpec(input: Partial<StrategySpec> & Record<string, unknown>): StrategySpec {
  const p = (input.params ?? {}) as Partial<StrategyParams>;
  const r = (input.risk ?? {}) as Partial<RiskSettings>;
  const engine = (ENGINE_TYPES as string[]).includes(String(input.engine))
    ? (input.engine as EngineType)
    : 'trend';

  let fast = clampInt(p.fastPeriod, 2, 200, DEFAULT_PARAMS.fastPeriod);
  let slow = clampInt(p.slowPeriod, 3, 400, DEFAULT_PARAMS.slowPeriod);
  if (fast >= slow) [fast, slow] = [Math.min(fast, slow), Math.max(fast, slow) + (fast === slow ? 1 : 0)];
  let ob = clamp(p.rsiOverbought, 51, 95, DEFAULT_PARAMS.rsiOverbought);
  let os = clamp(p.rsiOversold, 5, 49, DEFAULT_PARAMS.rsiOversold);
  if (os >= ob) { ob = 70; os = 30; }

  const rules = Array.isArray(input.rules)
    ? input.rules.map((x) => String(x).slice(0, 240)).filter(Boolean).slice(0, 12)
    : [];

  return {
    name: String(input.name ?? '').trim().slice(0, 80) || `${ENGINE_INFO[engine].label} bot`,
    summary: String(input.summary ?? '').trim().slice(0, 600) || ENGINE_INFO[engine].description,
    engine,
    symbol: normalizeSymbol(input.symbol),
    timeframe: normalizeTimeframe(input.timeframe),
    params: {
      fastPeriod: fast,
      slowPeriod: slow,
      trendPeriod: p.trendPeriod === 0 ? 0 : clampInt(p.trendPeriod, 20, 400, DEFAULT_PARAMS.trendPeriod),
      rsiPeriod: clampInt(p.rsiPeriod, 2, 50, DEFAULT_PARAMS.rsiPeriod),
      rsiOverbought: ob,
      rsiOversold: os,
      channelPeriod: clampInt(p.channelPeriod, 5, 200, DEFAULT_PARAMS.channelPeriod),
      atrPeriod: clampInt(p.atrPeriod, 2, 100, DEFAULT_PARAMS.atrPeriod),
    },
    risk: {
      lotSize: Math.round(clamp(r.lotSize, 0.01, 50, DEFAULT_RISK.lotSize) * 100) / 100,
      stopAtrMultiple: clamp(r.stopAtrMultiple, 0.3, 10, DEFAULT_RISK.stopAtrMultiple),
      rewardRisk: clamp(r.rewardRisk, 0.3, 10, DEFAULT_RISK.rewardRisk),
      maxOpenTrades: clampInt(r.maxOpenTrades, 1, 10, DEFAULT_RISK.maxOpenTrades),
    },
    rules: rules.length ? rules : describeRules(engine, { ...DEFAULT_PARAMS, ...p } as StrategyParams),
  };
}

export function describeRules(engine: EngineType, p: StrategyParams): string[] {
  const trend = p.trendPeriod > 0 ? ` and price is ${'{above|below}'} EMA ${p.trendPeriod}` : '';
  switch (engine) {
    case 'trend':
      return [
        `Buy when EMA ${p.fastPeriod} crosses above EMA ${p.slowPeriod}${trend.replace('{above|below}', 'above')}.`,
        `Sell when EMA ${p.fastPeriod} crosses below EMA ${p.slowPeriod}${trend.replace('{above|below}', 'below')}.`,
        'Stop-loss and take-profit are ATR-based.',
      ];
    case 'scalping':
      return [
        `Buy when EMA ${p.fastPeriod} crosses above EMA ${p.slowPeriod} with RSI(${p.rsiPeriod}) between 50 and ${p.rsiOverbought}.`,
        `Sell when EMA ${p.fastPeriod} crosses below EMA ${p.slowPeriod} with RSI(${p.rsiPeriod}) between ${p.rsiOversold} and 50.`,
      ];
    case 'range':
      return [
        `Buy when RSI(${p.rsiPeriod}) crosses back above ${p.rsiOversold}.`,
        `Sell when RSI(${p.rsiPeriod}) crosses back below ${p.rsiOverbought}.`,
      ];
    case 'breakout':
      return [
        `Buy when price closes above the highest high of the last ${p.channelPeriod} candles.`,
        `Sell when price closes below the lowest low of the last ${p.channelPeriod} candles.`,
      ];
    case 'swing':
      return [
        `Only buy above EMA ${p.trendPeriod || 200}; only sell below it.`,
        `Enter when RSI(${p.rsiPeriod}) turns back up through 45 (buys) or down through 55 (sells).`,
      ];
  }
}

// ---------------------------------------------------------------------------
// Indicators (arrays aligned with candles, NaN until enough data)
// ---------------------------------------------------------------------------

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = seed / period;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function atr(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)),
  );
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  out[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  return out;
}

const crossedAbove = (a: number[], b: number[], i: number) =>
  i > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i];
const crossedBelow = (a: number[], b: number[], i: number) =>
  i > 0 && a[i - 1] >= b[i - 1] && a[i] < b[i];
const ok = (...xs: number[]) => xs.every(Number.isFinite);

// ---------------------------------------------------------------------------
// Signal evaluation
// ---------------------------------------------------------------------------

interface Ctx {
  spec: StrategySpec;
  candles: Candle[];
  closes: number[];
  fast: number[];
  slow: number[];
  trend: number[];
  rsi: number[];
  atr: number[];
}

function buildCtx(spec: StrategySpec, candles: Candle[]): Ctx {
  const closes = candles.map((c) => c.close);
  const p = spec.params;
  const trendPeriod = spec.engine === 'swing' ? p.trendPeriod || 200 : p.trendPeriod;
  return {
    spec,
    candles,
    closes,
    fast: ema(closes, p.fastPeriod),
    slow: ema(closes, p.slowPeriod),
    trend: trendPeriod > 0 ? ema(closes, trendPeriod) : new Array(closes.length).fill(NaN),
    rsi: rsi(closes, p.rsiPeriod),
    atr: atr(candles, p.atrPeriod),
  };
}

function rawSignalAt(ctx: Ctx, i: number): { action: 'buy' | 'sell' | 'none'; reason: string } {
  const { spec, candles, closes, fast, slow, trend, rsi: r } = ctx;
  const p = spec.params;
  const close = closes[i];
  const none = { action: 'none' as const, reason: 'No setup on the last closed candle.' };

  switch (spec.engine) {
    case 'trend': {
      if (!ok(fast[i], slow[i], fast[i - 1], slow[i - 1])) return none;
      // Trend filter is applied only once it has enough data.
      const hasTrend = Number.isFinite(trend[i]);
      if (crossedAbove(fast, slow, i) && (!hasTrend || close > trend[i]))
        return { action: 'buy', reason: `EMA ${p.fastPeriod} crossed above EMA ${p.slowPeriod}${hasTrend ? ` above EMA ${p.trendPeriod}` : ''}.` };
      if (crossedBelow(fast, slow, i) && (!hasTrend || close < trend[i]))
        return { action: 'sell', reason: `EMA ${p.fastPeriod} crossed below EMA ${p.slowPeriod}${hasTrend ? ` below EMA ${p.trendPeriod}` : ''}.` };
      return none;
    }
    case 'scalping': {
      if (!ok(fast[i], slow[i], r[i])) return none;
      if (crossedAbove(fast, slow, i) && r[i] > 50 && r[i] < p.rsiOverbought)
        return { action: 'buy', reason: `EMA cross up with RSI ${r[i].toFixed(1)} confirming momentum.` };
      if (crossedBelow(fast, slow, i) && r[i] < 50 && r[i] > p.rsiOversold)
        return { action: 'sell', reason: `EMA cross down with RSI ${r[i].toFixed(1)} confirming momentum.` };
      return none;
    }
    case 'range': {
      if (!ok(r[i], r[i - 1])) return none;
      if (r[i - 1] < p.rsiOversold && r[i] >= p.rsiOversold)
        return { action: 'buy', reason: `RSI recovered above ${p.rsiOversold} (now ${r[i].toFixed(1)}).` };
      if (r[i - 1] > p.rsiOverbought && r[i] <= p.rsiOverbought)
        return { action: 'sell', reason: `RSI fell back below ${p.rsiOverbought} (now ${r[i].toFixed(1)}).` };
      return none;
    }
    case 'breakout': {
      const n = p.channelPeriod;
      if (i < n + 1) return none;
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i - n; k < i; k++) {
        hi = Math.max(hi, candles[k].high);
        lo = Math.min(lo, candles[k].low);
      }
      if (close > hi && closes[i - 1] <= hi)
        return { action: 'buy', reason: `Closed above the ${n}-candle high (${fmt(hi)}).` };
      if (close < lo && closes[i - 1] >= lo)
        return { action: 'sell', reason: `Closed below the ${n}-candle low (${fmt(lo)}).` };
      return none;
    }
    case 'swing': {
      if (!ok(trend[i], r[i], r[i - 1])) return none;
      if (close > trend[i] && r[i - 1] < 45 && r[i] >= 45)
        return { action: 'buy', reason: `Pullback ended in an uptrend (RSI ${r[i].toFixed(1)}, above trend EMA).` };
      if (close < trend[i] && r[i - 1] > 55 && r[i] <= 55)
        return { action: 'sell', reason: `Pullback ended in a downtrend (RSI ${r[i].toFixed(1)}, below trend EMA).` };
      return none;
    }
  }
}

function withStops(ctx: Ctx, i: number, action: 'buy' | 'sell', reason: string): Signal {
  const c = ctx.candles[i];
  const a = Number.isFinite(ctx.atr[i]) ? ctx.atr[i] : c.high - c.low;
  const stop = a * ctx.spec.risk.stopAtrMultiple;
  const target = stop * ctx.spec.risk.rewardRisk;
  const dir = action === 'buy' ? 1 : -1;
  return {
    action,
    reason,
    time: c.time,
    price: c.close,
    stopLoss: roundPrice(c.close - dir * stop, c.close),
    takeProfit: roundPrice(c.close + dir * target, c.close),
  };
}

/**
 * Evaluates the strategy on the LAST candle in `candles`.
 * Callers must pass closed candles only (drop the forming candle first).
 */
export function evaluateSignal(spec: StrategySpec, candles: Candle[]): Signal {
  const i = candles.length - 1;
  if (i < 2) return { action: 'none', reason: 'Not enough data.', time: candles[i]?.time ?? 0, price: candles[i]?.close ?? 0 };
  const ctx = buildCtx(spec, candles);
  const s = rawSignalAt(ctx, i);
  if (s.action === 'none') return { action: 'none', reason: s.reason, time: candles[i].time, price: candles[i].close };
  return withStops(ctx, i, s.action, s.reason);
}

// ---------------------------------------------------------------------------
// Backtesting
// ---------------------------------------------------------------------------

export interface BacktestTrade {
  side: 'buy' | 'sell';
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  /** Result in multiples of initial risk. */
  r: number;
  outcome: 'tp' | 'sl' | 'open';
}

export interface BacktestResult {
  trades: BacktestTrade[];
  stats: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    netR: number;
    profitFactor: number;
    maxDrawdownR: number;
  };
  equityR: { time: number; value: number }[];
}

/**
 * Bar-by-bar backtest. One position at a time, entry at signal candle close,
 * exit on SL/TP. If a candle touches both, the stop is assumed hit first
 * (conservative). Spread, slippage and commissions are not modelled.
 */
export function backtest(spec: StrategySpec, candles: Candle[]): BacktestResult {
  const ctx = buildCtx(spec, candles);
  const trades: BacktestTrade[] = [];
  const equityR: { time: number; value: number }[] = [];
  let open: { side: 'buy' | 'sell'; entry: number; sl: number; tp: number; time: number } | null = null;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    if (open) {
      const risk = Math.abs(open.entry - open.sl) || 1e-9;
      const hitSl = open.side === 'buy' ? c.low <= open.sl : c.high >= open.sl;
      const hitTp = open.side === 'buy' ? c.high >= open.tp : c.low <= open.tp;
      if (hitSl || hitTp) {
        const exit = hitSl ? open.sl : open.tp;
        const r = ((exit - open.entry) * (open.side === 'buy' ? 1 : -1)) / risk;
        trades.push({ side: open.side, entryTime: open.time, exitTime: c.time, entry: open.entry, exit, stopLoss: open.sl, takeProfit: open.tp, r, outcome: hitSl ? 'sl' : 'tp' });
        equity += r;
        peak = Math.max(peak, equity);
        maxDd = Math.max(maxDd, peak - equity);
        equityR.push({ time: c.time, value: equity });
        open = null;
      }
      continue;
    }
    const s = rawSignalAt(ctx, i);
    if (s.action !== 'none') {
      const sig = withStops(ctx, i, s.action, s.reason);
      open = { side: s.action, entry: sig.price, sl: sig.stopLoss!, tp: sig.takeProfit!, time: c.time };
    }
  }

  const closed = trades;
  const wins = closed.filter((t) => t.r > 0);
  const losses = closed.filter((t) => t.r <= 0);
  const grossWin = wins.reduce((a, t) => a + t.r, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.r, 0));
  return {
    trades,
    stats: {
      trades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      netR: equity,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      maxDrawdownR: maxDd,
    },
    equityR,
  };
}

// ---------------------------------------------------------------------------
// Rule-based chart reading (fallback analysis + context fed to the LLM)
// ---------------------------------------------------------------------------

export type LevelKind = 'support' | 'resistance' | 'liquidity' | 'order_block' | 'fvg';

export interface KeyLevel {
  price: number;
  kind: LevelKind;
  note: string;
}

export interface TradeSetup {
  direction: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  rationale: string;
}

export interface ChartAnalysis {
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  keyLevels: KeyLevel[];
  setups: TradeSetup[];
  risks: string[];
  source: 'gemini' | 'rules';
}

export interface MarketContext {
  last: number;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr14: number | null;
  swingHighs: number[];
  swingLows: number[];
  fvgs: { top: number; bottom: number; direction: 'bullish' | 'bearish'; time: number }[];
  structure: 'higher-highs' | 'lower-lows' | 'mixed';
}

export function marketContext(candles: Candle[]): MarketContext {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const a = atr(candles, 14);
  const last = closes[n - 1];
  const fin = (x: number) => (Number.isFinite(x) ? x : null);

  // 5-bar fractals
  const highs: { i: number; p: number }[] = [];
  const lows: { i: number; p: number }[] = [];
  for (let i = 2; i < n - 2; i++) {
    const c = candles[i];
    if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high && c.high > candles[i + 2].high)
      highs.push({ i, p: c.high });
    if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low && c.low < candles[i + 2].low)
      lows.push({ i, p: c.low });
  }

  // Unfilled fair value gaps in the last 60 candles
  const fvgs: MarketContext['fvgs'] = [];
  for (let i = Math.max(2, n - 60); i < n; i++) {
    const a2 = candles[i - 2];
    const c = candles[i];
    if (c.low > a2.high) {
      const filled = candles.slice(i + 1).some((k) => k.low <= a2.high);
      if (!filled) fvgs.push({ top: c.low, bottom: a2.high, direction: 'bullish', time: c.time });
    } else if (c.high < a2.low) {
      const filled = candles.slice(i + 1).some((k) => k.high >= a2.low);
      if (!filled) fvgs.push({ top: a2.low, bottom: c.high, direction: 'bearish', time: c.time });
    }
  }

  const lastHighs = highs.slice(-3).map((h) => h.p);
  const lastLows = lows.slice(-3).map((l) => l.p);
  const rising = (xs: number[]) => xs.length >= 2 && xs.every((x, i) => i === 0 || x > xs[i - 1]);
  const falling = (xs: number[]) => xs.length >= 2 && xs.every((x, i) => i === 0 || x < xs[i - 1]);
  const structure = rising(lastHighs) && rising(lastLows)
    ? 'higher-highs'
    : falling(lastHighs) && falling(lastLows)
      ? 'lower-lows'
      : 'mixed';

  return {
    last,
    ema50: fin(e50[n - 1]),
    ema200: fin(e200[n - 1]),
    rsi14: fin(r[n - 1]),
    atr14: fin(a[n - 1]),
    swingHighs: highs.slice(-6).map((h) => h.p),
    swingLows: lows.slice(-6).map((l) => l.p),
    fvgs: fvgs.slice(-4),
    structure,
  };
}

/** Deterministic, no-AI chart reading. Used in demo mode and as an LLM fallback. */
export function ruleBasedAnalysis(candles: Candle[]): ChartAnalysis {
  if (candles.length < 30) {
    return { bias: 'neutral', confidence: 'low', summary: 'Not enough candles to analyse.', keyLevels: [], setups: [], risks: [], source: 'rules' };
  }
  const ctx = marketContext(candles);
  const { last, ema50, ema200, rsi14, atr14 } = ctx;

  let score = 0;
  const notes: string[] = [];
  if (ema50 !== null) {
    score += last > ema50 ? 1 : -1;
    notes.push(`Price is ${last > ema50 ? 'above' : 'below'} EMA 50`);
  }
  if (ema50 !== null && ema200 !== null) {
    score += ema50 > ema200 ? 1 : -1;
    notes.push(`EMA 50 is ${ema50 > ema200 ? 'above' : 'below'} EMA 200`);
  }
  if (ctx.structure === 'higher-highs') { score += 1; notes.push('swings are making higher highs and higher lows'); }
  if (ctx.structure === 'lower-lows') { score -= 1; notes.push('swings are making lower highs and lower lows'); }

  const bias: ChartAnalysis['bias'] = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
  const confidence: ChartAnalysis['confidence'] = Math.abs(score) >= 3 ? 'high' : Math.abs(score) === 2 ? 'medium' : 'low';

  const resistances = [...new Set(ctx.swingHighs)].filter((p) => p > last).sort((a, b) => a - b).slice(0, 2);
  const supports = [...new Set(ctx.swingLows)].filter((p) => p < last).sort((a, b) => b - a).slice(0, 2);
  const keyLevels: KeyLevel[] = [
    ...resistances.map((p) => ({ price: p, kind: 'resistance' as const, note: 'Recent swing high' })),
    ...supports.map((p) => ({ price: p, kind: 'support' as const, note: 'Recent swing low' })),
    ...ctx.fvgs.slice(-2).map((g) => ({
      price: (g.top + g.bottom) / 2,
      kind: 'fvg' as const,
      note: `Unfilled ${g.direction} fair value gap ${fmt(g.bottom)}–${fmt(g.top)}`,
    })),
  ];

  const setups: TradeSetup[] = [];
  const unit = atr14 ?? last * 0.002;
  if (bias === 'bullish') {
    const sl = supports[0] !== undefined ? Math.min(supports[0], last - unit) : last - 1.5 * unit;
    const risk = last - sl;
    setups.push({ direction: 'buy', entry: last, stopLoss: roundPrice(sl, last), takeProfit: roundPrice(last + 2 * risk, last), rationale: 'Trend-aligned long with stop under the nearest swing low, 1:2 reward/risk.' });
  } else if (bias === 'bearish') {
    const sl = resistances[0] !== undefined ? Math.max(resistances[0], last + unit) : last + 1.5 * unit;
    const risk = sl - last;
    setups.push({ direction: 'sell', entry: last, stopLoss: roundPrice(sl, last), takeProfit: roundPrice(last - 2 * risk, last), rationale: 'Trend-aligned short with stop above the nearest swing high, 1:2 reward/risk.' });
  }

  const risks: string[] = [];
  if (rsi14 !== null && rsi14 > 70) risks.push(`RSI is overbought (${rsi14.toFixed(0)}); longs risk buying the top.`);
  if (rsi14 !== null && rsi14 < 30) risks.push(`RSI is oversold (${rsi14.toFixed(0)}); shorts risk selling the bottom.`);
  if (bias === 'neutral') risks.push('Mixed signals: wait for a clear break of structure before committing.');
  risks.push('Rule-based reading only; it does not account for news or fundamentals.');

  return {
    bias,
    confidence,
    summary: `${capitalize(bias)} bias: ${notes.join(', ')}.${rsi14 !== null ? ` RSI(14) is ${rsi14.toFixed(0)}.` : ''}`,
    keyLevels,
    setups,
    risks,
    source: 'rules',
  };
}

// ---------------------------------------------------------------------------
// Plain-English → spec heuristic (demo mode / LLM fallback)
// ---------------------------------------------------------------------------

const KNOWN_SYMBOLS = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GBPJPY', 'EURJPY', 'BTCUSD', 'ETHUSD', 'US30', 'NAS100', 'SPX500', 'GER40'];
const SYMBOL_ALIASES: Record<string, string> = { GOLD: 'XAUUSD', SILVER: 'XAGUSD', BITCOIN: 'BTCUSD', BTC: 'BTCUSD', ETH: 'ETHUSD', NASDAQ: 'NAS100', DOW: 'US30', DAX: 'GER40', 'S&P': 'SPX500' };

export function specFromPrompt(prompt: string, hints: { symbol?: string; timeframe?: Timeframe } = {}): StrategySpec {
  const text = prompt.toLowerCase();
  const upper = prompt.toUpperCase();

  // 1. Check prompt text first for symbol (EURUSD, XAUUSD, BTCUSD, etc.)
  let symbol: string | undefined = KNOWN_SYMBOLS.find((s) => upper.includes(s));
  if (!symbol) {
    const alias = Object.keys(SYMBOL_ALIASES).find((k) => new RegExp(`\\b${k.replace('&', '\\&')}\\b`).test(upper));
    if (alias) symbol = SYMBOL_ALIASES[alias];
  }
  if (!symbol) {
    symbol = hints.symbol;
  }

  // 2. Check prompt text first for timeframe (M1, M5, M15, M30, H1, etc.)
  let timeframe: Timeframe | undefined = undefined;
  const tfMatch = upper.match(/\b(M1|M5|M15|M30|H1|H4|D1)\b/) ?? upper.match(/\b(\d{1,2})\s?(MIN|M|H|HOUR|D|DAY)\b/);
  if (tfMatch) {
    timeframe = tfMatch[2] ? normalizeTimeframe(`${tfMatch[1]}${tfMatch[2][0]}`) : normalizeTimeframe(tfMatch[1]);
  } else {
    timeframe = hints.timeframe;
  }

  const has = (...words: string[]) => words.some((w) => text.includes(w));
  let engine: EngineType = 'trend';
  if (has('breakout', 'break out', 'donchian', 'channel', 'range high', 'range low')) engine = 'breakout';
  else if (has('mean reversion', 'oversold', 'overbought', 'bounce', 'reversal', 'range')) engine = 'range';
  else if (has('pullback', 'swing', 'retrace', 'dip')) engine = 'swing';
  else if (has('scalp', 'quick', 'm1', 'm5', 'momentum')) engine = 'scalping';

  const params: Partial<StrategyParams> = {};
  const emas = [...text.matchAll(/(?:ema|ma|moving average)\s*(\d{1,3})/g)].map((m) => Number(m[1]));
  const pair = text.match(/(\d{1,3})\s*(?:\/|and|&|,)\s*(\d{1,3})\s*(?:ema|ma)/);
  const periods = emas.length ? emas : pair ? [Number(pair[1]), Number(pair[2])] : [];
  if (periods.length >= 2) {
    const sorted = [...periods].sort((a, b) => a - b);
    params.fastPeriod = sorted[0];
    params.slowPeriod = sorted[1];
    if (sorted[2]) params.trendPeriod = sorted[2];
  }
  const rsiP = text.match(/rsi\s*\(?(\d{1,2})\)?/);
  if (rsiP) params.rsiPeriod = Number(rsiP[1]);
  const ob = text.match(/(?:above|over|overbought)\s*(\d{2})/);
  const os = text.match(/(?:below|under|oversold)\s*(\d{2})/);
  if (ob) params.rsiOverbought = Number(ob[1]);
  if (os) params.rsiOversold = Number(os[1]);
  const ch = text.match(/(\d{1,3})[\s-]*(?:candle|bar|period)s?\s*(?:high|low|channel|range)/);
  if (ch) params.channelPeriod = Number(ch[1]);
  if (has('no trend filter', 'without trend filter')) params.trendPeriod = 0;

  const risk: Partial<RiskSettings> = {};
  const rr = text.match(/1\s*:\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*r\b/);
  if (rr) risk.rewardRisk = Number(rr[1]);
  const lots = text.match(/(\d+(?:\.\d+)?)\s*lots?/);
  if (lots) risk.lotSize = Number(lots[1]);
  const maxT = text.match(/max(?:imum)?\s*(\d)\s*(?:open\s*)?trades?/);
  if (maxT) risk.maxOpenTrades = Number(maxT[1]);

  const merged = { ...DEFAULT_PARAMS, ...params };
  return normalizeSpec({
    name: `${symbol ?? 'XAUUSD'} ${ENGINE_INFO[engine].label}`,
    summary: prompt.trim().slice(0, 600),
    engine,
    symbol: symbol ?? 'XAUUSD',
    timeframe: timeframe ?? (engine === 'scalping' ? 'M5' : engine === 'swing' ? 'H1' : 'M15'),
    params: merged,
    risk: { ...DEFAULT_RISK, ...risk },
    rules: describeRules(engine, merged),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function decimalsFor(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 100) return 3;
  if (price >= 10) return 4;
  return 5;
}

export function roundPrice(value: number, reference: number): number {
  const d = decimalsFor(reference);
  return Math.round(value * 10 ** d) / 10 ** d;
}

export function fmt(price: number): string {
  return price.toFixed(decimalsFor(price));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
