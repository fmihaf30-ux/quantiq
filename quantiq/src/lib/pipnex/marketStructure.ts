// ============================================================================
// marketStructure.ts — Deterministic Market Structure Engine
// Implements k=3 fractal detection, internal/external swing promotion,
// trend automaton, and candle-close BOS vs CHOCH breaks.
// ============================================================================

import type { Bar, Swing, SwingType, SwingLabel, StructureBreak, TrendDirection } from './types';
import { medianBarRange } from './mathUtils';

const K = 3; // Fractal window: 2k + 1 = 7 bars

export interface MarketStructureState {
  swings: Swing[];
  breaks: StructureBreak[];
  currentTrend: TrendDirection;
  protectedHigh: Swing | null;
  protectedLow: Swing | null;
}

/**
 * Detects k=3 fractals across closed bars.
 * Center bar at index i is a Swing High iff:
 *   ∀ j < i: bar[j].high < bar[i].high (strict left)
 *   ∀ j > i: bar[j].high <= bar[i].high (non-strict right)
 */
export function detectFractalSwings(bars: Bar[]): Swing[] {
  if (bars.length < 2 * K + 1) return [];

  const rawSwings: { index: number; time: number; price: number; type: SwingType }[] = [];
  const medRange = medianBarRange(bars, 20) || 1;

  for (let i = K; i < bars.length - K; i++) {
    const center = bars[i];

    // 1. Check Swing High
    let isHigh = true;
    for (let j = i - K; j < i; j++) {
      if (bars[j].high >= center.high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let j = i + 1; j <= i + K; j++) {
        if (bars[j].high > center.high) {
          isHigh = false;
          break;
        }
      }
    }

    // 2. Check Swing Low
    let isLow = true;
    for (let j = i - K; j < i; j++) {
      if (bars[j].low <= center.low) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let j = i + 1; j <= i + K; j++) {
        if (bars[j].low < center.low) {
          isLow = false;
          break;
        }
      }
    }

    if (isHigh) rawSwings.push({ index: i, time: center.time, price: center.high, type: 'high' });
    if (isLow) rawSwings.push({ index: i, time: center.time, price: center.low, type: 'low' });
  }

  // Label swings (HH, HL, LH, LL) and compute strength
  const swings: Swing[] = [];
  let prevHigh: Swing | null = null;
  let prevLow: Swing | null = null;

  for (const s of rawSwings) {
    let label: SwingLabel;
    let strength = 0.5;

    if (s.type === 'high') {
      if (!prevHigh || s.price > prevHigh.price) {
        label = 'HH';
      } else {
        label = 'LH';
      }
      const deltaP = prevLow ? Math.abs(s.price - prevLow.price) : medRange;
      const x = deltaP / medRange;
      strength = Math.min(0.99, x / (x + 1));
    } else {
      if (!prevLow || s.price < prevLow.price) {
        label = 'LL';
      } else {
        label = 'HL';
      }
      const deltaP = prevHigh ? Math.abs(s.price - prevHigh.price) : medRange;
      const x = deltaP / medRange;
      strength = Math.min(0.99, x / (x + 1));
    }

    const swingObj: Swing = {
      index: s.index,
      time: s.time,
      price: s.price,
      type: s.type,
      label,
      level: 'internal', // Default, promoted below
      strength,
    };

    if (s.type === 'high') prevHigh = swingObj;
    else prevLow = swingObj;

    swings.push(swingObj);
  }

  return swings;
}

export const detectSwings = detectFractalSwings;

/**
 * Evaluates market structure breaks (BOS vs CHOCH) on a strict candle-close basis.
 * Follows Pipnex ADR-0004:
 * - Counter-trend boundary is ALWAYS evaluated first for CHOCH.
 * - Trend forms when two consecutive external swing labels agree (HH+HL -> bull, LH+LL -> bear).
 */
export function evaluateMarketStructure(bars: Bar[]): MarketStructureState {
  const swings = detectFractalSwings(bars);
  const breaks: StructureBreak[] = [];

  let currentTrend: TrendDirection = 'bullish';
  let protectedHigh: Swing | null = null;
  let protectedLow: Swing | null = null;

  if (swings.length === 0) {
    return { swings, breaks, currentTrend, protectedHigh, protectedLow };
  }

  // Seed protected highs and lows from initial swings
  for (const s of swings) {
    if (s.type === 'high') {
      if (!protectedHigh || s.price >= protectedHigh.price) {
        protectedHigh = s;
        s.level = 'external';
      }
    } else {
      if (!protectedLow || s.price <= protectedLow.price) {
        protectedLow = s;
        s.level = 'external';
      }
    }
  }

  // Scan closed bars for breaks
  // Break confirmation requires candle close beyond protected level
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (currentTrend === 'bullish') {
      // 1. Counter-trend priority: Check CHOCH (break below protected low)
      if (protectedLow && bar.close < protectedLow.price && i > protectedLow.index + K) {
        breaks.push({
          index: i,
          time: bar.time,
          price: protectedLow.price,
          type: 'CHOCH',
          direction: 'bearish',
          brokenSwing: protectedLow,
        });

        currentTrend = 'bearish';
        const priorHighs = swings.filter((s) => s.type === 'high' && s.index < i);
        if (priorHighs.length) {
          protectedHigh = priorHighs[priorHighs.length - 1];
          protectedHigh.level = 'external';
        }
      }
      // 2. Trend continuation: Check BOS (break above protected high)
      else if (protectedHigh && bar.close > protectedHigh.price && i > protectedHigh.index + K) {
        breaks.push({
          index: i,
          time: bar.time,
          price: protectedHigh.price,
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: protectedHigh,
        });

        // Promote origin low to protected external low
        const highIdx = protectedHigh.index;
        const originLows = swings.filter((s) => s.type === 'low' && s.index < i && s.index > highIdx);
        if (originLows.length) {
          protectedLow = originLows[0];
          protectedLow.level = 'external';
        }
      }
    } else {
      // Bearish trend
      // 1. Counter-trend priority: Check CHOCH (break above protected high)
      if (protectedHigh && bar.close > protectedHigh.price && i > protectedHigh.index + K) {
        breaks.push({
          index: i,
          time: bar.time,
          price: protectedHigh.price,
          type: 'CHOCH',
          direction: 'bullish',
          brokenSwing: protectedHigh,
        });

        currentTrend = 'bullish';
        const priorLows = swings.filter((s) => s.type === 'low' && s.index < i);
        if (priorLows.length) {
          protectedLow = priorLows[priorLows.length - 1];
          protectedLow.level = 'external';
        }
      }
      // 2. Trend continuation: Check BOS (break below protected low)
      else if (protectedLow && bar.close < protectedLow.price && i > protectedLow.index + K) {
        breaks.push({
          index: i,
          time: bar.time,
          price: protectedLow.price,
          type: 'BOS',
          direction: 'bearish',
          brokenSwing: protectedLow,
        });

        // Promote origin high to protected external high
        const lowIdx = protectedLow.index;
        const originHighs = swings.filter((s) => s.type === 'high' && s.index < i && s.index > lowIdx);
        if (originHighs.length) {
          protectedHigh = originHighs[0];
          protectedHigh.level = 'external';
        }
      }
    }
  }

  return {
    swings,
    breaks,
    currentTrend,
    protectedHigh,
    protectedLow,
  };
}

export function detectStructureBreaks(bars: Bar[]): StructureBreak[] {
  return evaluateMarketStructure(bars).breaks;
}
