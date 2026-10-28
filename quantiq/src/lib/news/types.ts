// ============================================================================
// types.ts — Pipnex News IQ & Fundamental Intelligence Domain Models
// Reconstructed from Pipnex Trade Lens v0.80.7 News IQ Architecture
// ============================================================================

export type EventImpact = 'high' | 'medium' | 'low';

export type EventStatus =
  | 'upcoming'
  | 'releasing'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'postponed';

export interface NewsEvent {
  eventId: string;
  name: string;
  country: string;
  currency: string;
  eventTime: string; // ISO 8601 string
  timezone: string;
  impact: EventImpact;
  consensus: string | null;
  previous: string | null;
  actual: string | null;
  revised?: string | null;
  unit?: string;
  status: EventStatus;
  category?: 'inflation' | 'employment' | 'central_bank' | 'growth' | 'sentiment';
}

export type ProximityState =
  | 'UPCOMING_FAR'   // > 240 min (> 4 hours)
  | 'UPCOMING'       // 30 min < dt <= 240 min
  | 'IMMINENT'       // 0 < dt <= 30 min (high volatility danger window)
  | 'ACTIVE'         // currently releasing / wire transmission
  | 'JUST_RELEASED'  // 0 <= -dt <= 15 min
  | 'RECENT'         // 15 min < -dt <= 120 min
  | 'CANCELLED'
  | 'POSTPONED'
  | 'UNKNOWN';

export interface EventProximityResult {
  state: ProximityState;
  deltaMinutes: number; // positive = future, negative = past
  minutesUntil: number | null;
  minutesSince: number | null;
  timeLabel: string;
  isActionable: boolean;
}

export type NewsRiskState =
  | 'NORMAL'
  | 'ELEVATED'
  | 'HIGH'
  | 'IMMINENT'
  | 'ACTIVE'
  | 'POST_EVENT'
  | 'UNKNOWN';

export interface NewsRiskEvaluation {
  riskState: NewsRiskState;
  isExecutionGated: boolean; // True if IMMINENT or ACTIVE (execution pause mandatory)
  cautionMessage: string;
  eventId?: string;
  eventName?: string;
}

export type CouncilVote = 'BUY' | 'SELL' | 'NEUTRAL' | 'ABSTAIN';

export interface AnalystLane {
  lane: 'macro' | 'technical' | 'liquidity' | 'sentiment' | 'risk';
  agentName: string;
  vote: CouncilVote;
  convictionPct: number;
  reason: string;
}

export interface DecisionDriver {
  asset: string;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  rationale: string;
}

export interface AICouncilResult {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  overallConviction: number; // 0..100%
  voteTally: {
    buy: number;
    sell: number;
    neutral: number;
    abstain: number;
  };
  lanes: Record<'macro' | 'technical' | 'liquidity' | 'sentiment' | 'risk', AnalystLane>;
  drivers: DecisionDriver[];
  verdictSummary: string;
}

export interface ReactionScenario {
  outcome: 'Hot Print (Beat)' | 'In-Line Print (Meet)' | 'Cool Print (Miss)';
  probabilityPct: number;
  expectedDisplacementPips: string;
  marketReaction: string;
}

export interface EconometricMatrix {
  expectedRangePips: number;
  probabilities: {
    beat: number;
    meet: number;
    miss: number;
  };
  isCoinFlip: boolean;
  scenarios: ReactionScenario[];
}

export interface PipnexNewsSignal {
  id: string;
  eventId: string;
  event: NewsEvent;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidencePct: number;
  proximity: EventProximityResult;
  risk: NewsRiskEvaluation;
  council: AICouncilResult;
  econometric: EconometricMatrix;
  entrySuggestion?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
  };
  generatedAt: string;
}
