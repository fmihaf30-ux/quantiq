// ============================================================================
// newsRisk.ts — Pipnex Consolidated News Risk Engine
// Reconstructed from Pipnex Trade Lens v0.80.7 (Task 37)
// ============================================================================

import type { NewsEvent, NewsRiskState, NewsRiskEvaluation } from './types';
import { evaluateEventProximity } from './eventProximity';

export const NEWS_RISK_PRECEDENCE: Record<NewsRiskState, number> = {
  NORMAL: 0,
  UNKNOWN: 1,
  ELEVATED: 2,
  POST_EVENT: 3,
  HIGH: 4,
  IMMINENT: 5,
  ACTIVE: 6,
};

/**
 * Evaluates the consolidated risk state for a single event at an instant.
 */
export function evaluateEventRisk(
  event: NewsEvent,
  nowMs: number = Date.now()
): NewsRiskEvaluation {
  const prox = evaluateEventProximity(event, nowMs);
  const isHighImpact = event.impact === 'high';

  let riskState: NewsRiskState = 'NORMAL';
  let cautionMessage = 'Market conditions normal. No imminent macroeconomic news hazard.';

  switch (prox.state) {
    case 'UPCOMING_FAR':
      riskState = 'NORMAL';
      cautionMessage = `Event is distant (${prox.timeLabel}). Normal trading flow.`;
      break;

    case 'UPCOMING':
      if (isHighImpact) {
        riskState = 'HIGH';
        cautionMessage = `Approaching high-impact ${event.name} (${prox.timeLabel}). Pre-news volatility starting.`;
      } else {
        riskState = 'ELEVATED';
        cautionMessage = `Approaching medium-impact ${event.name} (${prox.timeLabel}).`;
      }
      break;

    case 'IMMINENT':
      if (isHighImpact) {
        riskState = 'IMMINENT';
        cautionMessage = `🚨 IMMINENT HIGH-IMPACT RELEASE (${prox.timeLabel}): ${event.name}. Spread expansion and slippage spike risk. Freezing automated market execution!`;
      } else {
        riskState = 'HIGH';
        cautionMessage = `⚠️ Imminent news release (${prox.timeLabel}): ${event.name}. Heightened volatility expected.`;
      }
      break;

    case 'ACTIVE':
      riskState = 'ACTIVE';
      cautionMessage = `🔴 ACTIVE EVENT IN PROGRESS: Numbers hitting the wire for ${event.name}! Extreme volatility. Automated trading halted.`;
      break;

    case 'JUST_RELEASED':
      riskState = 'POST_EVENT';
      cautionMessage = `⚡ Just Released: Initial market reaction and absorption underway. Waiting for initial 15-minute candle close.`;
      break;

    case 'RECENT':
    case 'CANCELLED':
    case 'POSTPONED':
    default:
      riskState = 'NORMAL';
      cautionMessage = 'Market conditions normal.';
      break;
  }

  const isExecutionGated = riskState === 'IMMINENT' || riskState === 'ACTIVE';

  return {
    riskState,
    isExecutionGated,
    cautionMessage,
    eventId: event.eventId,
    eventName: event.name,
  };
}

/**
 * Combines multiple relevant events to determine the highest active risk state.
 */
export function evaluateConsolidatedRisk(
  events: NewsEvent[],
  nowMs: number = Date.now()
): NewsRiskEvaluation {
  if (!events || events.length === 0) {
    return {
      riskState: 'NORMAL',
      isExecutionGated: false,
      cautionMessage: 'No macroeconomic calendar events scheduled.',
    };
  }

  let highestEval: NewsRiskEvaluation = {
    riskState: 'NORMAL',
    isExecutionGated: false,
    cautionMessage: 'Market conditions normal.',
  };

  for (const ev of events) {
    const evRisk = evaluateEventRisk(ev, nowMs);
    if (NEWS_RISK_PRECEDENCE[evRisk.riskState] > NEWS_RISK_PRECEDENCE[highestEval.riskState]) {
      highestEval = evRisk;
    }
  }

  return highestEval;
}
