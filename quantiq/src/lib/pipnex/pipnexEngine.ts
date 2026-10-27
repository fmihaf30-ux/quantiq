// ============================================================================
// pipnexEngine.ts — Master Deterministic Pipnex Market Evaluation Engine
// Reconstructed from Pipnex Trade Lens Specification
//
// Pipeline:
// 1. Data Layer: Sanitize bars, compute Median Range & ATR-14.
// 2. Detection Layer:
//    - Swings (k=3 fractals, internal/external protected structure)
//    - Structure Breaks (BOS vs CHoCH with close-basis)
//    - Order Blocks (Base equilibrium, 2.0x departure factor, 5-factor quality)
//    - Imbalance (FVG >= 0.5x median range, Inverted IFVG)
//    - Liquidity Pools (EQH, EQL, BSL, SSL via 0.15x tolerance clustering, 3-bar sweeps)
// 3. Candidate Generation & Elimination Hierarchy (SMC Confluence, Sweep Reclaim)
// 4. Universal Risk & Target Engine (Stop-First Rule, 2.1R Floor, TP ladder, Obstacles)
// 5. Cross-Family 10-Component Scoring & Tie-Break Chain
// 6. Primary Opportunity Selection & SMC View Mapping
// ============================================================================

import type {
  Bar,
  OrderBlock,
  FairValueGap,
  LiquidityPool,
  RiskTargetResult,
  PipnexOpportunity,
  SmcElementsView,
  TrendDirection,
} from './types';
import { sanitizeBars, medianBarRange, calculateATR14 } from './mathUtils';
import { detectSwings, detectStructureBreaks } from './marketStructure';
import { detectOrderBlocks } from './supplyDemand';
import { detectFairValueGaps } from './imbalance';
import { detectLiquidityPools } from './liquidity';
import { evaluateRiskAndTargets, UNIVERSAL_MIN_RR, ObjectiveCandidate } from './riskEngine';

export interface EvaluatePipnexOptions {
  symbol?: string;
  timeframe?: string;
  currentPrice?: number;
  activePosition?: {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    openTime?: number;
    stopLoss?: number;
    takeProfit?: number;
  } | null;
  minRR?: number; // default 2.1
}

interface CandidateSetup {
  strategy: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  invalidationAnchor: number;
  zone: OrderBlock | FairValueGap | LiquidityPool;
  zoneType: 'OB' | 'FVG' | 'SWEEP';
  orderType: 'MARKET' | 'LIMIT';
  entryCandleTime?: number;
  riskResult: RiskTargetResult;
  regimeFit: number;
  structureScore: number;
  freshness: number;
  compositeScore: number;
  rationale: string;
}

/**
 * Runs the full Pipnex AI deterministic evaluation pipeline over a series of closed bars.
 */
export function evaluatePipnexMarket(
  rawBars: Partial<Bar>[],
  options: EvaluatePipnexOptions = {}
): PipnexOpportunity | null {
  const bars = sanitizeBars(rawBars);
  if (bars.length < 20) return null;

  const symbol = options.symbol ?? 'MARKET';
  const timeframe = options.timeframe ?? 'M15';
  const lastBar = bars[bars.length - 1];
  const currentPrice = options.currentPrice && Number.isFinite(options.currentPrice)
    ? options.currentPrice
    : lastBar.close;

  // 1. Core Metrics
  const medRange = medianBarRange(bars, 50);
  const atr14 = calculateATR14(bars);

  // 2. Detection Layer
  const swings = detectSwings(bars);
  const breaks = detectStructureBreaks(bars);
  const orderBlocks = detectOrderBlocks(bars, breaks);
  const fvgs = detectFairValueGaps(bars);
  const pools = detectLiquidityPools(bars, swings, medRange, {
    tolFactor: 0.15,
    minMembers: 2,
    sweepWindow: 3,
  });

  // Determine prevailing structural bias
  const latestBreak = breaks[breaks.length - 1];
  const structuralBias: TrendDirection = latestBreak
    ? latestBreak.direction
    : swings.length >= 2
    ? swings[swings.length - 1].price >= swings[swings.length - 2].price
      ? 'bullish'
      : 'bearish'
    : 'bullish';

  // 3. Prepare Objective Candidates for Risk Engine
  const candidates: ObjectiveCandidate[] = [];
  for (const pool of pools) {
    if (pool.state === 'active') {
      candidates.push({ price: pool.price, type: `Liquidity Pool (${pool.type})`, weight: 1.0 });
    }
  }
  for (const ob of orderBlocks) {
    if (ob.state === 'fresh' || ob.state === 'tested') {
      candidates.push({ price: ob.proximal, type: `Opposing OB (${ob.type})`, weight: 0.9 });
    }
  }
  for (const swing of swings) {
    if (swing.level === 'external') {
      candidates.push({ price: swing.price, type: `Protected Swing ${swing.label}`, weight: 0.7 });
    }
  }

  // 4. Candidate Generation
  const candidateSetups: CandidateSetup[] = [];

  // A. If user provided an active position, anchor to it
  if (options.activePosition) {
    const active = options.activePosition;
    const isLong = active.direction === 'LONG';
    const entryPrice = active.entryPrice;

    // Find nearest supporting zone for invalidation
    let invalidation = active.stopLoss;
    if (!invalidation) {
      if (isLong) {
        const lowerOB = orderBlocks.find((ob) => ob.type === 'bullish' && ob.distal < entryPrice);
        invalidation = lowerOB ? lowerOB.distal : entryPrice - 2.5 * atr14;
      } else {
        const higherOB = orderBlocks.find((ob) => ob.type === 'bearish' && ob.distal > entryPrice);
        invalidation = higherOB ? higherOB.distal : entryPrice + 2.5 * atr14;
      }
    }

    const riskResult = evaluateRiskAndTargets({
      direction: active.direction,
      entryPrice,
      invalidationAnchor: invalidation,
      swings,
      atr14,
      currentPrice,
      candidates,
      minRR: options.minRR ?? UNIVERSAL_MIN_RR,
    });

    if (active.stopLoss) riskResult.stopLoss = active.stopLoss;
    if (active.takeProfit) riskResult.takeProfit1 = active.takeProfit;

    const activeSetup: CandidateSetup = {
      strategy: 'Active Market Position (Live MT5 Sync)',
      direction: active.direction,
      entryPrice,
      invalidationAnchor: invalidation,
      zone: orderBlocks[0] ?? ({} as OrderBlock),
      zoneType: 'OB',
      orderType: 'MARKET',
      entryCandleTime: active.openTime ?? lastBar.time,
      riskResult,
      regimeFit: 1.0,
      structureScore: 1.0,
      freshness: 1.0,
      compositeScore: 1.0,
      rationale: `Active ${active.direction} position managed with Stop-First invalidation and ${riskResult.riskReward.toFixed(2)}R target projection.`,
    };

    candidateSetups.push(activeSetup);
  } else {
    // B. SMC Order Block Setups
    const eligibleOBs = orderBlocks.filter(
      (ob) => ob.state === 'fresh' || ob.state === 'tested'
    );

    for (const ob of eligibleOBs) {
      const isBullish = ob.type === 'bullish';
      const direction: 'LONG' | 'SHORT' = isBullish ? 'LONG' : 'SHORT';

      // Discard counter-trend setups if latest structure break is strong opposing
      if (latestBreak && latestBreak.direction !== ob.type) {
        // Only allow if CHoCH occurred or zone quality > 0.85
        if (ob.qualityScore < 0.85 && latestBreak.type !== 'CHOCH') {
          continue;
        }
      }

      // Check price proximity
      const distToProximal = Math.abs(currentPrice - ob.proximal);
      if (distToProximal > 8 * atr14) continue; // Hard Gate 2: Distance <= 8 ATR-14

      // Age gate
      const ageBars = bars.length - 1 - ob.endIndex;
      if (ageBars > 80) continue; // Hard Gate 1: Age <= 80 bars

      // Determine order type:
      // If price is currently touching or inside the zone -> MARKET
      // If price is still away -> LIMIT
      const isInsideZone = isBullish
        ? currentPrice <= ob.proximal && currentPrice >= ob.distal
        : currentPrice >= ob.proximal && currentPrice <= ob.distal;

      const orderType: 'MARKET' | 'LIMIT' = isInsideZone ? 'MARKET' : 'LIMIT';
      const entryPrice = isInsideZone ? currentPrice : ob.proximal;
      const invalidationAnchor = ob.distal;

      const riskResult = evaluateRiskAndTargets({
        direction,
        entryPrice,
        invalidationAnchor,
        swings,
        atr14,
        currentPrice,
        candidates,
        minRR: options.minRR ?? UNIVERSAL_MIN_RR,
      });

      if (!riskResult.isTradable && !isInsideZone) continue; // Hard Gate 5: 2.1R floor

      // Find entry candle if MARKET order
      let entryCandleTime: number | undefined;
      if (orderType === 'MARKET') {
        for (let i = bars.length - 1; i >= ob.endIndex; i--) {
          const b = bars[i];
          if (
            (isBullish && b.low <= ob.proximal && b.high >= ob.distal) ||
            (!isBullish && b.high >= ob.proximal && b.low <= ob.distal)
          ) {
            entryCandleTime = b.time;
            break;
          }
        }
      }

      // 10-Component Composite Scoring
      const regimeFit = ob.type === structuralBias ? 0.95 : 0.4;
      const structureScore = latestBreak ? (latestBreak.type === 'CHOCH' ? 1.0 : 0.85) : 0.6;
      const locationScore = Math.max(0, 1 - distToProximal / (8 * atr14));
      const rrScore = Math.min(1.0, riskResult.riskReward / 4.0);
      const lateEntryScore = 1 - riskResult.lateEntryProgress;
      const freshnessScore = Math.max(0, 1 - ageBars / 80);
      const testScore = ob.state === 'fresh' ? 1.0 : 0.7;

      const compositeScore =
        0.15 * regimeFit +
        0.15 * structureScore +
        0.11 * locationScore +
        0.11 * rrScore +
        0.10 * lateEntryScore +
        0.10 * ob.qualityScore +
        0.09 * freshnessScore +
        0.07 * testScore +
        0.07 * 0.8 + // HTF alignment estimate
        0.05 * 0.9;  // Confidence

      candidateSetups.push({
        strategy: `Pipnex SMC: ${isBullish ? 'Demand / Bullish OB' : 'Supply / Bearish OB'}`,
        direction,
        entryPrice,
        invalidationAnchor,
        zone: ob,
        zoneType: 'OB',
        orderType,
        entryCandleTime,
        riskResult,
        regimeFit,
        structureScore,
        freshness: freshnessScore,
        compositeScore,
        rationale: `High-displacement ${ob.type} Order Block (quality: ${(ob.qualityScore * 100).toFixed(0)}%) with ${riskResult.riskReward.toFixed(2)}R yield and Stop-First invalidation.`,
      });
    }

    // C. Liquidity Sweep & Reclaim Setups
    const sweptPools = pools.filter((p) => p.state === 'swept' && p.sweepExtreme !== undefined);
    for (const pool of sweptPools) {
      const isBullishSweep = pool.type === 'EQL' || pool.type === 'SSL';
      const direction: 'LONG' | 'SHORT' = isBullishSweep ? 'LONG' : 'SHORT';
      const entryPrice = currentPrice;
      const invalidationAnchor = pool.sweepExtreme!;

      const riskResult = evaluateRiskAndTargets({
        direction,
        entryPrice,
        invalidationAnchor,
        swings,
        atr14,
        currentPrice,
        candidates,
        minRR: options.minRR ?? UNIVERSAL_MIN_RR,
      });

      if (!riskResult.isTradable) continue;

      candidateSetups.push({
        strategy: `Pipnex Liquidity: ${isBullishSweep ? 'SSL Sweep & Reclaim' : 'BSL Sweep & Reclaim'}`,
        direction,
        entryPrice,
        invalidationAnchor,
        zone: pool,
        zoneType: 'SWEEP',
        orderType: 'MARKET',
        entryCandleTime: pool.sweepBarIndex ? bars[pool.sweepBarIndex]?.time : lastBar.time,
        riskResult,
        regimeFit: 0.9,
        structureScore: 0.95,
        freshness: 0.9,
        compositeScore: 0.88,
        rationale: `Resting ${pool.type} liquidity swept at ${pool.sweepExtreme?.toFixed(2)} and reclaimed within 3 bars. Clean counter-liquidity expansion targeting opposing pool.`,
      });
    }

    // D. FVG Setups (Subordinated to Order Blocks as per spec)
    const eligibleFVGs = fvgs.filter((f) => f.state === 'fresh' && !f.isInverted);
    if (candidateSetups.length === 0) {
      for (const fvg of eligibleFVGs) {
        const isBullish = fvg.type === 'bullish';
        const direction: 'LONG' | 'SHORT' = isBullish ? 'LONG' : 'SHORT';
        const entryPrice = isBullish ? fvg.top : fvg.bottom;
        const invalidationAnchor = isBullish ? fvg.bottom : fvg.top;

        const riskResult = evaluateRiskAndTargets({
          direction,
          entryPrice,
          invalidationAnchor,
          swings,
          atr14,
          currentPrice,
          candidates,
          minRR: options.minRR ?? UNIVERSAL_MIN_RR,
        });

        if (!riskResult.isTradable) continue;

        candidateSetups.push({
          strategy: `Pipnex Imbalance: ${isBullish ? 'Bullish FVG' : 'Bearish FVG'}`,
          direction,
          entryPrice,
          invalidationAnchor,
          zone: fvg,
          zoneType: 'FVG',
          orderType: 'LIMIT',
          riskResult,
          regimeFit: 0.8,
          structureScore: 0.8,
          freshness: 0.9,
          compositeScore: 0.75,
          rationale: `Structural displacement 3-bar Fair Value Gap (${fvg.height.toFixed(2)} span) targeting structural expansion.`,
        });
      }
    }
  }

  // 5. Select Winning Primary Opportunity (Sort by compositeScore descending + tie-break)
  candidateSetups.sort((a, b) => {
    if (Math.abs(b.compositeScore - a.compositeScore) > 1e-4) {
      return b.compositeScore - a.compositeScore;
    }
    // Tie-break: Structure Coherence -> Freshness -> Risk Reward
    if (b.structureScore !== a.structureScore) return b.structureScore - a.structureScore;
    if (b.freshness !== a.freshness) return b.freshness - a.freshness;
    return b.riskResult.riskReward - a.riskResult.riskReward;
  });

  const winner = candidateSetups[0];

  // 6. Build SMC Elements View for UI Presentation
  const smcElements: SmcElementsView = {
    supportZones: [],
    resistanceZones: [],
    orderBlocks: [],
    fairValueGaps: [],
    structureBreaks: [],
    liquidityZones: [],
  };

  // Map Order Blocks
  for (const ob of orderBlocks) {
    const high = Math.max(ob.proximal, ob.distal);
    const low = Math.min(ob.proximal, ob.distal);
    const type = ob.type === 'bullish' ? 'ob_bullish' : 'ob_bearish';
    const label = `${ob.type === 'bullish' ? 'Bullish OB' : 'Bearish OB'} (${(ob.qualityScore * 100).toFixed(0)}%) [${ob.state}]`;

    smcElements.orderBlocks?.push({ high, low, label, type });

    if (ob.type === 'bullish') {
      smcElements.supportZones?.push({ high, low, label, type });
    } else {
      smcElements.resistanceZones?.push({ high, low, label, type });
    }
  }

  // Map FVGs
  for (const fvg of fvgs) {
    const high = fvg.top;
    const low = fvg.bottom;
    const type = fvg.type === 'bullish' ? 'fvg_bullish' : 'fvg_bearish';
    const label = `${fvg.isInverted ? 'IFVG' : 'FVG'} ${fvg.type.toUpperCase()}`;
    smcElements.fairValueGaps?.push({ high, low, label, type });
  }

  // Map Breaks
  for (const brk of breaks.slice(-6)) {
    smcElements.structureBreaks?.push({
      price: brk.price,
      type: brk.type === 'CHOCH' ? 'CHoCH' : brk.type,
      direction: brk.direction,
    });
  }

  // Map Liquidity Pools
  for (const pool of pools) {
    smcElements.liquidityZones?.push({
      price: pool.price,
      type: pool.type === 'EQH' ? 'equal_highs' : pool.type === 'EQL' ? 'equal_lows' : pool.type === 'BSL' ? 'buy_side' : 'sell_side',
      label: `${pool.type} (${pool.state})`,
    });
  }

  if (!winner) {
    // If no candidate cleared hard gates, synthesize a neutral or structure-following lens view
    const defaultBias = structuralBias === 'bullish' ? 'LONG' : 'SHORT';
    const fallbackEntry = currentPrice;
    const fallbackRisk = evaluateRiskAndTargets({
      direction: defaultBias,
      entryPrice: fallbackEntry,
      invalidationAnchor: defaultBias === 'LONG' ? fallbackEntry - 2 * atr14 : fallbackEntry + 2 * atr14,
      swings,
      atr14,
      currentPrice,
      candidates,
      minRR: options.minRR ?? UNIVERSAL_MIN_RR,
    });

    return {
      symbol,
      timeframe,
      bias: structuralBias,
      direction: defaultBias,
      orderType: 'MARKET',
      entry: fallbackEntry,
      stopLoss: fallbackRisk.stopLoss,
      takeProfit1: fallbackRisk.takeProfit1,
      takeProfit2: fallbackRisk.takeProfit2,
      takeProfit3: fallbackRisk.takeProfit3,
      riskReward: fallbackRisk.riskReward,
      confidence: 0.72,
      strategy: `Pipnex Structure Flow (${structuralBias.toUpperCase()})`,
      rationale: `Market showing ${structuralBias} bias following recent ${latestBreak?.type ?? 'trend'}. Standing by for key Order Block mitigation.`,
      setupScore: 0.70,
      entryTime: lastBar.time,
      smcElements,
      rawEntities: {
        swings,
        breaks,
        orderBlocks,
        fvgs,
        liquidityPools: pools,
      },
    };
  }

  return {
    symbol,
    timeframe,
    bias: structuralBias,
    direction: winner.direction,
    orderType: winner.orderType,
    entry: winner.entryPrice,
    stopLoss: winner.riskResult.stopLoss,
    takeProfit1: winner.riskResult.takeProfit1,
    takeProfit2: winner.riskResult.takeProfit2,
    takeProfit3: winner.riskResult.takeProfit3,
    riskReward: winner.riskResult.riskReward,
    confidence: Number(winner.compositeScore.toFixed(2)),
    strategy: winner.strategy,
    rationale: winner.rationale,
    setupScore: Number(winner.compositeScore.toFixed(3)),
    entryTime: winner.entryCandleTime,
    smcElements,
    rawEntities: {
      swings,
      breaks,
      orderBlocks,
      fvgs,
      liquidityPools: pools,
    },
  };
}
