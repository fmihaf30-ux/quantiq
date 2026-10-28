// ============================================================================
// aiCouncilEngine.ts — Pipnex 5-Analyst AI Council Engine
// Reconstructed from Pipnex Trade Lens v0.80.7 (Phase 6X / newsPrediction.js)
//
// Simulates an institutional committee composed of 5 specialized desks:
// 1. Macro Economist Desk
// 2. Technical Analyst Desk
// 3. Liquidity Analyst Desk
// 4. Sentiment Analyst Desk
// 5. Risk Management Desk
// ============================================================================

import type { NewsEvent, AICouncilResult, AnalystLane, CouncilVote, DecisionDriver } from './types';

export function evaluateAICouncil(
  event: NewsEvent,
  symbol: string = 'XAUUSD',
  currentPrice?: number
): AICouncilResult {
  const eventName = event.name.toLowerCase();
  const isUSD = (event.currency || '').toUpperCase() === 'USD';
  const cleanSym = symbol.toUpperCase().replace('/', '').replace(/M$/, '');

  // 1. Determine Fundamental Expectation from consensus vs previous
  const prevVal = parseFloat(event.previous?.replace(/[^0-9.-]/g, '') || '0');
  const consVal = parseFloat(event.consensus?.replace(/[^0-9.-]/g, '') || '0');
  const isDovishExpectation = consVal < prevVal || eventName.includes('unemployment') || eventName.includes('claim');

  // For Gold (XAUUSD) or EURUSD: Dovish USD -> Bullish XAUUSD/EURUSD
  // For USDJPY: Dovish USD -> Bearish USDJPY
  const inverseToUSD = cleanSym.includes('XAU') || cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP');
  const baseBullish = isUSD ? (inverseToUSD ? isDovishExpectation : !isDovishExpectation) : true;

  // 1. Macro Economist Desk
  const macroVote: CouncilVote = baseBullish ? 'BUY' : 'SELL';
  const macroConviction = event.impact === 'high' ? 78 : 65;
  const macroReason = event.category === 'inflation'
    ? `Inflation data cooling towards 2% target pressures real Treasury yields, favoring non-yielding assets like ${cleanSym}.`
    : event.category === 'employment'
    ? `Labor market cooling prompts earlier rate cutting cycles, weakening USD demand and providing tailwinds for ${cleanSym}.`
    : `Central bank policy guidance indicates balanced terminal rate trajectory with downside USD risk.`;

  // 2. Technical Analyst Desk
  const techVote: CouncilVote = baseBullish ? 'BUY' : 'SELL';
  const techConviction = 72;
  const techReason = `Price structure successfully held key institutional demand base with higher-timeframe displacement.`;

  // 3. Liquidity Analyst Desk
  const liqVote: CouncilVote = baseBullish ? 'BUY' : 'SELL';
  const liqConviction = 68;
  const liqReason = baseBullish
    ? `Resting buy-side liquidity clusters above recent swing highs; pre-news stop runs favor upside expansion.`
    : `Resting sell-side liquidity clusters below recent swing lows; downside sweep anticipated.`;

  // 4. Sentiment Analyst Desk
  const sentimentVote: CouncilVote = 'NEUTRAL';
  const sentimentConviction = 55;
  const sentimentReason = `Commitments of Traders (COT) shows institutional positioning is balanced ahead of the release.`;

  // 5. Risk Management Desk
  const riskVote: CouncilVote = event.impact === 'high' ? (baseBullish ? 'BUY' : 'SELL') : 'ABSTAIN';
  const riskConviction = 62;
  const riskReason = `Risk parameters cleared for selective positioning with widened volatility stops (+0.5 ATR).`;

  const lanes: Record<'macro' | 'technical' | 'liquidity' | 'sentiment' | 'risk', AnalystLane> = {
    macro: {
      lane: 'macro',
      agentName: 'Macro Economist',
      vote: macroVote,
      convictionPct: macroConviction,
      reason: macroReason,
    },
    technical: {
      lane: 'technical',
      agentName: 'Technical Analyst',
      vote: techVote,
      convictionPct: techConviction,
      reason: techReason,
    },
    liquidity: {
      lane: 'liquidity',
      agentName: 'Liquidity Desk',
      vote: liqVote,
      convictionPct: liqConviction,
      reason: liqReason,
    },
    sentiment: {
      lane: 'sentiment',
      agentName: 'Sentiment Desk',
      vote: sentimentVote,
      convictionPct: sentimentConviction,
      reason: sentimentReason,
    },
    risk: {
      lane: 'risk',
      agentName: 'Risk Management',
      vote: riskVote,
      convictionPct: riskConviction,
      reason: riskReason,
    },
  };

  // Vote Tally
  let buyCount = 0;
  let sellCount = 0;
  let neutralCount = 0;
  let abstainCount = 0;

  Object.values(lanes).forEach((l) => {
    if (l.vote === 'BUY') buyCount++;
    else if (l.vote === 'SELL') sellCount++;
    else if (l.vote === 'NEUTRAL') neutralCount++;
    else abstainCount++;
  });

  const majorityDirection: 'BUY' | 'SELL' | 'NEUTRAL' =
    buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'NEUTRAL';

  // Overall conviction average across active voting desks
  const activeLanes = Object.values(lanes).filter((l) => l.vote !== 'ABSTAIN');
  const overallConviction = Math.round(
    activeLanes.reduce((sum, l) => sum + l.convictionPct, 0) / (activeLanes.length || 1)
  );

  // Cross-Asset Market Drivers
  const isBull = majorityDirection === 'BUY';
  const drivers: DecisionDriver[] = [
    {
      asset: 'US Dollar (USD)',
      direction: isBull ? 'Bearish' : 'Bullish',
      rationale: isBull
        ? 'Yield curve adjustments and rate-cut repricing weigh on DXY.'
        : 'Safe-haven inflows and hawkish rate premium support DXY.',
    },
    {
      asset: `Gold (${cleanSym})`,
      direction: isBull ? 'Bullish' : 'Bearish',
      rationale: isBull
        ? 'Real yield suppression sparks institutional bullion accumulation.'
        : 'Higher-for-longer opportunity cost dampens non-yielding metals.',
    },
    {
      asset: 'Bond Yields (10Y UST)',
      direction: isBull ? 'Bearish' : 'Bullish',
      rationale: isBull
        ? 'Fixed income bid pushes nominal yields lower.'
        : 'Sticky inflation or tight labor supply keeps yields elevated.',
    },
    {
      asset: 'US Equities (S&P 500 / US30)',
      direction: isBull ? 'Bullish' : 'Neutral',
      rationale: isBull
        ? 'Cheaper cost of capital and liquidity support risk assets.'
        : 'Valuation contraction due to discount rate pressure.',
    },
  ];

  const verdictSummary = `AI Council: ${buyCount} BUY / ${sellCount} SELL · ${overallConviction}% Conviction for ${cleanSym} on ${event.name}`;

  return {
    direction: majorityDirection,
    overallConviction,
    voteTally: {
      buy: buyCount,
      sell: sellCount,
      neutral: neutralCount,
      abstain: abstainCount,
    },
    lanes,
    drivers,
    verdictSummary,
  };
}
