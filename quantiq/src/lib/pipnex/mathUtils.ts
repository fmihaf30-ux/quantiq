// ============================================================================
// mathUtils.ts — Mathematical Helpers & Bar Sanitization
// ============================================================================

import type { Bar } from './types';

const toFinite = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function sanitizeBars(raw: Partial<Bar & { epoch?: number }>[]): Bar[] {
  const list = Array.isArray(raw) ? raw : [];
  const map = new Map<number, Bar>();

  for (const item of list) {
    let t = toFinite(item?.epoch ?? item?.time);
    if (t > 1e12) t = Math.floor(t / 1000);

    const bar: Bar = {
      time: Math.floor(t),
      open: toFinite(item?.open),
      high: toFinite(item?.high),
      low: toFinite(item?.low),
      close: toFinite(item?.close),
      volume: toFinite(item?.volume) || 0,
    };

    const valid =
      bar.time > 0 &&
      [bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0) &&
      bar.high >= Math.max(bar.open, bar.close) &&
      bar.low <= Math.min(bar.open, bar.close);

    if (valid) {
      map.set(bar.time, bar);
    }
  }

  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function medianBarRange(bars: Bar[], windowSize = 40): number {
  if (!bars.length) return 0;
  const slice = bars.slice(-windowSize);
  const ranges = slice
    .map((b) => Math.abs(b.high - b.low))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);

  return ranges.length ? ranges[Math.floor(ranges.length / 2)] : 0;
}

export function calculateATR14(bars: Bar[]): number {
  if (bars.length < 2) return medianBarRange(bars) || 1;
  const trs: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }

  const recent = trs.slice(-14);
  const sum = recent.reduce((acc, v) => acc + v, 0);
  return sum / recent.length || 1;
}

export function filterSpikes(bars: Bar[]): Bar[] {
  if (bars.length < 12) return bars;
  const median = medianBarRange(bars, bars.length);
  if (!(median > 0)) return bars;

  return bars.filter((bar, idx) => {
    const prev = bars[idx - 1];
    const next = bars[idx + 1];
    if (!prev) return true;
    const range = Math.abs(bar.high - bar.low);
    if (!next) {
      const gap = Math.max(Math.abs(bar.close - prev.close), Math.abs(bar.open - prev.close));
      return !(gap > median * 10 || range > median * 15);
    }
    if (range <= median * 12) return true;
    const midpoint = (prev.close + next.open) / 2;
    return !(Math.max(Math.abs(bar.high - midpoint), Math.abs(bar.low - midpoint)) > median * 10);
  });
}
