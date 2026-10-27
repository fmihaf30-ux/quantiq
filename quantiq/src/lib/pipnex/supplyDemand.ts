// ============================================================================
// supplyDemand.ts — Color-Free Equilibrium & Departure Order Block Engine
// Rejects retail "last opposing candle". Detects institutional base equilibrium
// followed by >= 2.0x departure displacement with full 4-state lifecycle.
// ============================================================================

import type { Bar, OrderBlock, ZoneState, StructureBreak } from './types';
import { medianBarRange } from './mathUtils';

const MIN_BASE_BARS = 1;
const MAX_BASE_BARS = 5;
const MAX_BASE_SPAN_FACTOR = 1.5;
const DEPARTURE_WINDOW = 5;
const DEPARTURE_FACTOR = 2.0;
const MITIGATION_FRACTION = 0.5;

export function detectOrderBlocks(
  bars: Bar[],
  recentBreaks: StructureBreak[] = []
): OrderBlock[] {
  if (bars.length < MAX_BASE_BARS + DEPARTURE_WINDOW + 2) return [];

  const medianRange = medianBarRange(bars, 50) || 1;
  const blocks: OrderBlock[] = [];

  // 1. Scan for base equilibrium + displacement departures
  for (let startIdx = 0; startIdx < bars.length - (MAX_BASE_BARS + DEPARTURE_WINDOW); startIdx++) {
    for (let baseLen = MIN_BASE_BARS; baseLen <= MAX_BASE_BARS; baseLen++) {
      const endIdx = startIdx + baseLen - 1;
      const baseBars = bars.slice(startIdx, endIdx + 1);

      let baseHigh = -Infinity;
      let baseLow = Infinity;
      for (const b of baseBars) {
        if (b.high > baseHigh) baseHigh = b.high;
        if (b.low < baseLow) baseLow = b.low;
      }

      const baseSpan = baseHigh - baseLow;
      if (baseSpan > MAX_BASE_SPAN_FACTOR * medianRange) {
        continue; // Base too wide to be true institutional equilibrium
      }

      // 2. Scan departure window (1 to 5 bars after base)
      let detectedType: 'bullish' | 'bearish' | null = null;
      let departureDisp = 0;
      let departureEndIdx = endIdx;

      for (let depIdx = endIdx + 1; depIdx <= Math.min(bars.length - 1, endIdx + DEPARTURE_WINDOW); depIdx++) {
        const depBar = bars[depIdx];

        // Disqualification rule: if candle closes opposite boundary during departure
        if (depBar.close < baseLow && detectedType === 'bullish') {
          detectedType = null;
          break;
        }
        if (depBar.close > baseHigh && detectedType === 'bearish') {
          detectedType = null;
          break;
        }

        // Bullish Departure check
        const bullDisp = (depBar.close - baseHigh) / medianRange;
        if (bullDisp >= DEPARTURE_FACTOR) {
          detectedType = 'bullish';
          departureDisp = bullDisp;
          departureEndIdx = depIdx;
          break;
        }

        // Bearish Departure check
        const bearDisp = (baseLow - depBar.close) / medianRange;
        if (bearDisp >= DEPARTURE_FACTOR) {
          detectedType = 'bearish';
          departureDisp = bearDisp;
          departureEndIdx = depIdx;
          break;
        }
      }

      if (detectedType) {
        const proximal = detectedType === 'bullish' ? baseHigh : baseLow;
        const distal = detectedType === 'bullish' ? baseLow : baseHigh;

        // 3. Track subsequent price action lifecycle
        let state: ZoneState = 'fresh';
        let testCount = 0;
        const zoneDepth = Math.abs(proximal - distal);
        const midPoint = (proximal + distal) / 2;

        for (let postIdx = departureEndIdx + 1; postIdx < bars.length; postIdx++) {
          const pb = bars[postIdx];

          if (detectedType === 'bullish') {
            // Invalidation: candle close below distal edge
            if (pb.close < distal) {
              state = 'invalidated';
              break;
            }
            // Mitigation: penetration past 50% midpoint
            if (pb.low <= midPoint) {
              state = 'mitigated';
              testCount++;
            }
            // Tested: touch of proximal edge
            else if (pb.low <= proximal) {
              if (state === 'fresh') state = 'tested';
              testCount++;
            }
          } else {
            // Bearish
            if (pb.close > distal) {
              state = 'invalidated';
              break;
            }
            if (pb.high >= midPoint) {
              state = 'mitigated';
              testCount++;
            } else if (pb.high >= proximal) {
              if (state === 'fresh') state = 'tested';
              testCount++;
            }
          }
        }

        // 4. Calculate 5-Factor Quality Score
        // D (Displacement): x / (x + 1)
        const dScore = Math.min(1.0, (departureDisp / DEPARTURE_FACTOR) / ((departureDisp / DEPARTURE_FACTOR) + 1));
        // T (Tightness): 1 - span / (1.5 * medianRange)
        const tScore = Math.max(0, 1 - baseSpan / (MAX_BASE_SPAN_FACTOR * medianRange));
        // F (Freshness): 1 / (1 + testCount)
        const fScore = 1 / (1 + testCount);
        // B (Structure Break): 1.0 if departure broke structure
        const brokeStructure = recentBreaks.some(
          (brk) => brk.index >= startIdx && brk.index <= departureEndIdx + 2
        );
        const bScore = brokeStructure ? 1.0 : 0.0;
        // L (Liquidity Taken): placeholder (0.5 default)
        const lScore = 0.5;

        const qualityScore =
          0.35 * dScore + 0.15 * tScore + 0.20 * fScore + 0.15 * bScore + 0.15 * lScore;

        blocks.push({
          id: `ob_${detectedType}_${bars[startIdx].time}`,
          startIndex: startIdx,
          endIndex: departureEndIdx,
          startTime: bars[startIdx].time,
          endTime: bars[departureEndIdx].time,
          type: detectedType,
          proximal,
          distal,
          baseSpan,
          departureFactor: departureDisp,
          state,
          testCount,
          qualityScore,
        });

        // Skip to next region to prevent overlapping redundant bases
        startIdx = departureEndIdx;
        break;
      }
    }
  }

  return blocks;
}
