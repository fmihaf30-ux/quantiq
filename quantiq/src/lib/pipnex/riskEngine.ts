// ============================================================================
// riskEngine.ts — Pipnex Universal Risk Engine & Target Ladders
// Reconstructed from Pipnex Trade Lens Specification
//
// Implements:
// 1. Stop First Rule (invalidation + protected swing widening + 0.5 ATR-14 buffer)
// 2. Universal 2.1R Floor (MIN_ACCEPTABLE_RR = 2.1)
// 3. Distance-Ordered TP1, TP2, TP3 Ladder
// 4. Sub-Floor Obstacles Engine
// 5. Late Entry Policy (<50% tradable, 50-75% risky, >75% missed)
// ============================================================================

import type { Swing, RiskTargetResult, SubFloorObstacle } from './types';

export const UNIVERSAL_MIN_RR = 2.1;
export const BASELINE_AUTO_RR = 1.2;

export interface ObjectiveCandidate {
  price: number;
  type: string;
  weight: number; // 0..1 (e.g., liquidity 1.0, opposing zone 0.9, swing 0.5)
}

export interface RiskEngineParams {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  invalidationAnchor: number;
  swings: Swing[];
  atr14: number;
  currentPrice: number;
  candidates?: ObjectiveCandidate[];
  minRR?: number;
}

export function evaluateRiskAndTargets({
  direction,
  entryPrice,
  invalidationAnchor,
  swings,
  atr14,
  currentPrice,
  candidates = [],
  minRR = UNIVERSAL_MIN_RR,
}: RiskEngineParams): RiskTargetResult {
  const isLong = direction === 'LONG';
  const effectiveAtr = Math.max(1e-5, atr14);

  // --------------------------------------------------------------------------
  // 1. Stop First Rule: Invalidation + Protected Structure Widening + ATR Buffer
  // --------------------------------------------------------------------------
  let widenedInvalidation = invalidationAnchor;

  if (isLong) {
    // Invalidation is below entry. Search for protected external swing lows below
    const lowerExternalSwings = swings.filter(
      (s) => s.type === 'low' && s.level === 'external' && s.price <= invalidationAnchor
    );
    if (lowerExternalSwings.length > 0) {
      const lowestSwing = Math.min(...lowerExternalSwings.map((s) => s.price));
      widenedInvalidation = Math.min(widenedInvalidation, lowestSwing);
    }
  } else {
    // Invalidation is above entry. Search for protected external swing highs above
    const higherExternalSwings = swings.filter(
      (s) => s.type === 'high' && s.level === 'external' && s.price >= invalidationAnchor
    );
    if (higherExternalSwings.length > 0) {
      const highestSwing = Math.max(...higherExternalSwings.map((s) => s.price));
      widenedInvalidation = Math.max(widenedInvalidation, highestSwing);
    }
  }

  // Add 0.5 * ATR(14) buffer beyond invalidation
  const stopLoss = isLong
    ? widenedInvalidation - 0.5 * effectiveAtr
    : widenedInvalidation + 0.5 * effectiveAtr;

  const riskDistance = isLong ? entryPrice - stopLoss : stopLoss - entryPrice;

  if (riskDistance <= 0) {
    return {
      entry: entryPrice,
      stopLoss,
      takeProfit1: entryPrice,
      riskReward: 0,
      invalidationPrice: widenedInvalidation,
      atr14: effectiveAtr,
      obstacles: [],
      isTradable: false,
      lateEntryProgress: 1,
      reason: 'invalid_risk_distance',
    };
  }

  // --------------------------------------------------------------------------
  // 2. Candidate Objectives, Obstacles, and TP Ladder
  // --------------------------------------------------------------------------
  // Filter for objectives in the trade direction
  const favorableCandidates = candidates
    .filter((c) => (isLong ? c.price > entryPrice : c.price < entryPrice))
    .map((c) => {
      const rewardDist = Math.abs(c.price - entryPrice);
      const rr = rewardDist / riskDistance;
      return {
        ...c,
        rewardDist,
        rr,
      };
    })
    .sort((a, b) => a.rewardDist - b.rewardDist);

  const obstacles: SubFloorObstacle[] = [];
  const qualifyingObjectives: { price: number; rr: number; type: string }[] = [];

  for (const c of favorableCandidates) {
    if (c.rr < minRR) {
      obstacles.push({
        price: c.price,
        type: c.type,
        rr: Number(c.rr.toFixed(2)),
      });
    } else {
      qualifyingObjectives.push({
        price: c.price,
        rr: Number(c.rr.toFixed(2)),
        type: c.type,
      });
    }
  }

  // Synthesize TPs if insufficient structural targets exist
  const tp1Price = qualifyingObjectives[0]?.price ??
    (isLong ? entryPrice + minRR * riskDistance : entryPrice - minRR * riskDistance);

  const tp2Price = qualifyingObjectives[1]?.price ??
    (isLong ? entryPrice + 3.0 * riskDistance : entryPrice - 3.0 * riskDistance);

  const tp3Price = qualifyingObjectives[2]?.price ??
    (isLong ? entryPrice + 4.2 * riskDistance : entryPrice - 4.2 * riskDistance);

  const finalRR = Math.abs(tp1Price - entryPrice) / riskDistance;

  // --------------------------------------------------------------------------
  // 3. Late Entry Policy
  // --------------------------------------------------------------------------
  const targetDist = Math.abs(tp1Price - entryPrice);
  const moveDirection = isLong ? 1 : -1;
  const progressToTarget = (currentPrice - entryPrice) * moveDirection;
  const lateEntryProgress = Math.max(0, Math.min(1.0, progressToTarget / targetDist));

  let isTradable = true;
  let reason: string | undefined;

  if (finalRR < minRR) {
    isTradable = false;
    reason = `reward_below_floor (${finalRR.toFixed(2)}R < ${minRR}R)`;
  } else if (lateEntryProgress > 0.75) {
    isTradable = false;
    reason = `late_entry_exceeded (progress ${(lateEntryProgress * 100).toFixed(0)}% > 75%)`;
  } else {
    // Check remaining RR from current market price
    const remainingReward = Math.abs(tp1Price - currentPrice);
    const remainingRisk = Math.abs(currentPrice - stopLoss);
    const remainingRR = remainingRisk > 0 ? remainingReward / remainingRisk : 0;

    if (progressToTarget > 0 && remainingRR < 1.0) {
      isTradable = false;
      reason = `remaining_rr_exhausted (${remainingRR.toFixed(2)}R < 1.0R)`;
    }
  }

  return {
    entry: Number(entryPrice.toFixed(4)),
    stopLoss: Number(stopLoss.toFixed(4)),
    takeProfit1: Number(tp1Price.toFixed(4)),
    takeProfit2: Number(tp2Price.toFixed(4)),
    takeProfit3: Number(tp3Price.toFixed(4)),
    riskReward: Number(finalRR.toFixed(2)),
    invalidationPrice: Number(widenedInvalidation.toFixed(4)),
    atr14: Number(effectiveAtr.toFixed(4)),
    obstacles,
    isTradable,
    lateEntryProgress: Number(lateEntryProgress.toFixed(3)),
    reason,
  };
}
