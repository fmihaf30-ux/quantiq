// ============================================================================
// liquidity.ts — Pipnex Liquidity Engine
// Reconstructed from Pipnex Trade Lens Specification
//
// Detects Equal Highs (EQH) / Buy-Side Liquidity (BSL) and
// Equal Lows (EQL) / Sell-Side Liquidity (SSL) via tolerance clustering,
// and evaluates the 3-bar sweep vs breach lifecycle.
// ============================================================================

import type { Bar, Swing, LiquidityPool, LiquidityPoolType, LiquidityPoolState } from './types';

export interface LiquidityEngineConfig {
  tolFactor?: number;      // 0.15 x medianBarRange (default 0.15)
  minMembers?: number;     // Minimum swing extremes to form a pool (default 2)
  sweepWindow?: number;    // Maximum bars allowed to close back inside (default 3)
}

/**
 * Detects liquidity pools and tracks their sweeps / breaches.
 */
export function detectLiquidityPools(
  bars: Bar[],
  swings: Swing[],
  medianRange: number,
  config: LiquidityEngineConfig = {}
): LiquidityPool[] {
  const tolFactor = config.tolFactor ?? 0.15;
  const minMembers = config.minMembers ?? 2;
  const sweepWindow = config.sweepWindow ?? 3;
  const tolerance = Math.max(1e-5, tolFactor * medianRange);

  const swingHighs = swings.filter((s) => s.type === 'high');
  const swingLows = swings.filter((s) => s.type === 'low');

  const pools: LiquidityPool[] = [];

  // 1. Cluster Swing Highs (EQH / BSL)
  const highClusters = clusterSwings(swingHighs, tolerance);
  for (const cluster of highClusters) {
    if (cluster.length >= minMembers) {
      pools.push(
        buildPool(bars, cluster, 'EQH', tolerance, sweepWindow)
      );
    }
  }

  // 2. Cluster Swing Lows (EQL / SSL)
  const lowClusters = clusterSwings(swingLows, tolerance);
  for (const cluster of lowClusters) {
    if (cluster.length >= minMembers) {
      pools.push(
        buildPool(bars, cluster, 'EQL', tolerance, sweepWindow)
      );
    }
  }

  // Also include major external swing levels as single-origin BSL / SSL if not in cluster
  for (const swing of swings) {
    if (swing.level === 'external') {
      const alreadyCovered = pools.some(
        (p) => Math.abs(p.price - swing.price) <= tolerance
      );
      if (!alreadyCovered) {
        pools.push(
          buildPool(
            bars,
            [swing],
            swing.type === 'high' ? 'BSL' : 'SSL',
            tolerance,
            sweepWindow
          )
        );
      }
    }
  }

  return pools;
}

/**
 * Groups swings whose prices fall within `tolerance` of the cluster running mean.
 */
function clusterSwings(swings: Swing[], tolerance: number): Swing[][] {
  const clusters: Swing[][] = [];

  for (const swing of swings) {
    let matchedCluster: Swing[] | null = null;

    for (const cluster of clusters) {
      const clusterMean =
        cluster.reduce((sum, s) => sum + s.price, 0) / cluster.length;
      if (Math.abs(swing.price - clusterMean) <= tolerance) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.push(swing);
    } else {
      clusters.push([swing]);
    }
  }

  return clusters;
}

/**
 * Builds and evaluates a liquidity pool lifecycle.
 */
function buildPool(
  bars: Bar[],
  members: Swing[],
  type: LiquidityPoolType,
  tolerance: number,
  sweepWindow: number
): LiquidityPool {
  const prices = members.map((m) => m.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const poolPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const spread = maxPrice - minPrice;

  // Strength calculation:
  // x = (members - 1) * (1 - spread / tolerance)
  // strength = x / (x + 1)
  const memberCount = members.length;
  const x = Math.max(0, (memberCount - 1) * Math.max(0, 1 - spread / tolerance));
  const strength = memberCount > 1 ? x / (x + 1) : 0.5;

  const latestSwingIndex = Math.max(...members.map((m) => m.index));

  let state: LiquidityPoolState = 'active';
  let sweepExtreme: number | undefined;
  let sweepBarIndex: number | undefined;

  const isHigh = type === 'EQH' || type === 'BSL';

  // Evaluate post-formation bars
  let penetrationStart = -1;
  let localExtreme = poolPrice;

  for (let i = latestSwingIndex + 1; i < bars.length; i++) {
    const bar = bars[i];

    if (isHigh) {
      if (bar.high > poolPrice) {
        if (penetrationStart === -1) {
          penetrationStart = i;
          localExtreme = bar.high;
        } else {
          localExtreme = Math.max(localExtreme, bar.high);
        }

        // Check if candle closes back inside
        if (bar.close <= poolPrice) {
          const barsElapsed = i - penetrationStart + 1;
          if (barsElapsed <= sweepWindow) {
            state = 'swept';
            sweepExtreme = localExtreme;
            sweepBarIndex = i;
            break;
          }
        }

        // If sweep window exceeded without close back inside -> consumed
        if (i - penetrationStart + 1 > sweepWindow) {
          state = 'consumed';
          break;
        }
      }
    } else {
      // Low side (EQL / SSL)
      if (bar.low < poolPrice) {
        if (penetrationStart === -1) {
          penetrationStart = i;
          localExtreme = bar.low;
        } else {
          localExtreme = Math.min(localExtreme, bar.low);
        }

        if (bar.close >= poolPrice) {
          const barsElapsed = i - penetrationStart + 1;
          if (barsElapsed <= sweepWindow) {
            state = 'swept';
            sweepExtreme = localExtreme;
            sweepBarIndex = i;
            break;
          }
        }

        if (i - penetrationStart + 1 > sweepWindow) {
          state = 'consumed';
          break;
        }
      }
    }
  }

  const id = `liq_${type}_${poolPrice.toFixed(2)}_${latestSwingIndex}`;

  return {
    id,
    type,
    price: poolPrice,
    tolerance,
    members,
    strength: Math.min(1.0, Math.max(0.0, strength)),
    state,
    sweepExtreme,
    sweepBarIndex,
  };
}
