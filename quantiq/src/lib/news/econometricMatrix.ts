// ============================================================================
// econometricMatrix.ts — Pipnex Econometric Modeling & Scenario Matrix
// Reconstructed from Pipnex Trade Lens v0.80.7 (Phase 6Z / eventOutlook.js)
// ============================================================================

import type { NewsEvent, EconometricMatrix, ReactionScenario } from './types';

export function calculateEconometricMatrix(
  event: NewsEvent,
  symbol: string = 'XAUUSD'
): EconometricMatrix {
  const name = event.name.toLowerCase();
  const cleanSym = symbol.toUpperCase().replace('/', '').replace(/M$/, '');

  // Base dispersion in pips based on event tier and asset
  let expectedRangePips = 45;
  if (name.includes('non-farm') || name.includes('nfp') || name.includes('payrolls')) {
    expectedRangePips = cleanSym.includes('XAU') ? 95 : 65;
  } else if (name.includes('cpi') || name.includes('inflation')) {
    expectedRangePips = cleanSym.includes('XAU') ? 85 : 55;
  } else if (name.includes('fomc') || name.includes('interest rate') || name.includes('fed')) {
    expectedRangePips = cleanSym.includes('XAU') ? 110 : 75;
  } else if (name.includes('gdp') || name.includes('retail sales')) {
    expectedRangePips = cleanSym.includes('XAU') ? 60 : 40;
  } else if (name.includes('pmi')) {
    expectedRangePips = cleanSym.includes('XAU') ? 45 : 30;
  }

  // Outcome probabilities
  let beatProb = 46;
  let meetProb = 34;
  let missProb = 20;

  if (name.includes('cpi')) {
    beatProb = 42;
    meetProb = 38;
    missProb = 20;
  } else if (name.includes('nfp')) {
    beatProb = 48;
    meetProb = 28;
    missProb = 24;
  } else if (name.includes('rate') || name.includes('fomc')) {
    beatProb = 12;
    meetProb = 82; // Rate hold is usually high consensus
    missProb = 6;
  }

  // Binary Coin-Flip Trap Filter: true if probabilities between beat and miss are close (< 10% diff)
  const isCoinFlip = Math.abs(beatProb - (100 - beatProb - meetProb)) <= 10 && event.impact === 'high';

  const isGoldOrForexInverse = cleanSym.includes('XAU') || cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP');

  const scenarios: ReactionScenario[] = [
    {
      outcome: 'Hot Print (Beat)',
      probabilityPct: beatProb,
      expectedDisplacementPips: `±${Math.round(expectedRangePips * 0.9)} pips`,
      marketReaction: isGoldOrForexInverse
        ? `Surprise hawkish spike: USD strengthens abruptly. ${cleanSym} tests lower liquidity band before absorption.`
        : `Surprise hawkish spike: USD strengthens; ${cleanSym} surges past local resistance.`,
    },
    {
      outcome: 'In-Line Print (Meet)',
      probabilityPct: meetProb,
      expectedDisplacementPips: `±${Math.round(expectedRangePips * 0.45)} pips`,
      marketReaction: `Initial two-sided whipsaw as algorithmic traders digest nuances, followed by continuation of prevailing technical trend.`,
    },
    {
      outcome: 'Cool Print (Miss)',
      probabilityPct: missProb,
      expectedDisplacementPips: `±${Math.round(expectedRangePips * 1.1)} pips`,
      marketReaction: isGoldOrForexInverse
        ? `Aggressive dovish relief: USD dumps sharply. Massive expansion for ${cleanSym} into upper buy-side liquidity.`
        : `Aggressive dovish relief: USD dumps sharply; ${cleanSym} breaks below key support.`,
    },
  ];

  return {
    expectedRangePips,
    probabilities: {
      beat: beatProb,
      meet: meetProb,
      miss: missProb,
    },
    isCoinFlip,
    scenarios,
  };
}
