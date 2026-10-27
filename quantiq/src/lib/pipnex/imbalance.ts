// ============================================================================
// imbalance.ts — 3-Bar Fair Value Gap & Inverted FVG (IFVG) Engine
// ============================================================================

import type { Bar, FairValueGap, ZoneState } from './types';
import { medianBarRange } from './mathUtils';

const MIN_GAP_FACTOR = 0.5;

export function detectFairValueGaps(bars: Bar[]): FairValueGap[] {
  if (bars.length < 3) return [];

  const medianRange = medianBarRange(bars, 50) || 1;
  const fvgs: FairValueGap[] = [];

  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2];
    const b = bars[i - 1];
    const c = bars[i];

    // 1. Check Bullish FVG (Gap between Bar A High and Bar C Low)
    if (a.high < c.low) {
      const gapHeight = c.low - a.high;
      if (gapHeight >= MIN_GAP_FACTOR * medianRange) {
        let state: ZoneState = 'fresh';
        let isInverted = false;
        const top = c.low;
        const bottom = a.high;
        const mid = (top + bottom) / 2;

        // Track lifecycle across subsequent candles
        for (let j = i + 1; j < bars.length; j++) {
          const pb = bars[j];
          // Invalidation: candle close below bottom of gap
          if (pb.close < bottom) {
            state = 'invalidated';
            isInverted = true; // Inverted FVG: broken bullish FVG flips to resistance
            break;
          }
          // Mitigation: penetration past 50%
          if (pb.low <= mid) {
            state = 'mitigated';
          } else if (pb.low <= top) {
            if (state === 'fresh') state = 'tested';
          }
        }

        fvgs.push({
          id: `fvg_bullish_${b.time}`,
          barAIndex: i - 2,
          barCIndex: i,
          time: b.time,
          type: 'bullish',
          top,
          bottom,
          height: gapHeight,
          state,
          isInverted,
        });
      }
    }

    // 2. Check Bearish FVG (Gap between Bar C High and Bar A Low)
    if (a.low > c.high) {
      const gapHeight = a.low - c.high;
      if (gapHeight >= MIN_GAP_FACTOR * medianRange) {
        let state: ZoneState = 'fresh';
        let isInverted = false;
        const top = a.low;
        const bottom = c.high;
        const mid = (top + bottom) / 2;

        for (let j = i + 1; j < bars.length; j++) {
          const pb = bars[j];
          if (pb.close > top) {
            state = 'invalidated';
            isInverted = true; // Inverted FVG: broken bearish FVG flips to support
            break;
          }
          if (pb.high >= mid) {
            state = 'mitigated';
          } else if (pb.high >= bottom) {
            if (state === 'fresh') state = 'tested';
          }
        }

        fvgs.push({
          id: `fvg_bearish_${b.time}`,
          barAIndex: i - 2,
          barCIndex: i,
          time: b.time,
          type: 'bearish',
          top,
          bottom,
          height: gapHeight,
          state,
          isInverted,
        });
      }
    }
  }

  return fvgs;
}
