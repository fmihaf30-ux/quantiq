// ============================================================================
// types.ts — Pipnex Engine Domain Model
// Reconstructed from Pipnex Trade Lens Specification
// ============================================================================

export interface Bar {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type SwingType = 'high' | 'low';
export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL';
export type SwingLevel = 'internal' | 'external';

export interface Swing {
  index: number;
  time: number;
  price: number;
  type: SwingType;
  label: SwingLabel;
  level: SwingLevel;
  strength: number; // 0..1
}

export type BreakType = 'BOS' | 'CHOCH';
export type TrendDirection = 'bullish' | 'bearish';

export interface StructureBreak {
  index: number;
  time: number;
  price: number;
  type: BreakType;
  direction: TrendDirection;
  brokenSwing: Swing;
}

export type ZoneState = 'fresh' | 'tested' | 'mitigated' | 'invalidated';

export interface OrderBlock {
  id: string;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  type: 'bullish' | 'bearish';
  proximal: number; // Entry edge (Base High for demand, Base Low for supply)
  distal: number;   // Invalidation edge (Base Low for demand, Base High for supply)
  baseSpan: number;
  departureFactor: number;
  state: ZoneState;
  testCount: number;
  qualityScore: number; // 0..1
}

export interface FairValueGap {
  id: string;
  barAIndex: number;
  barCIndex: number;
  time: number;
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  height: number;
  state: ZoneState;
  isInverted: boolean; // True if invalidated and polarity-flipped (IFVG)
}

export type LiquidityPoolType = 'EQH' | 'EQL' | 'BSL' | 'SSL';
export type LiquidityPoolState = 'active' | 'swept' | 'consumed';

export interface LiquidityPool {
  id: string;
  type: LiquidityPoolType;
  price: number;
  tolerance: number;
  members: Swing[];
  strength: number; // 0..1
  state: LiquidityPoolState;
  sweepExtreme?: number;
  sweepBarIndex?: number;
}

export interface SubFloorObstacle {
  price: number;
  type: string;
  rr: number;
}

export interface RiskTargetResult {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  riskReward: number;
  invalidationPrice: number;
  atr14: number;
  obstacles: SubFloorObstacle[];
  isTradable: boolean;
  lateEntryProgress: number; // 0..1
  reason?: string;
}

export interface SmcElementsView {
  supportZones?: { high: number; low: number; label?: string; type?: 'support' | 'resistance' | 'ob_bullish' | 'ob_bearish' | 'fvg_bullish' | 'fvg_bearish' }[];
  resistanceZones?: { high: number; low: number; label?: string; type?: 'support' | 'resistance' | 'ob_bullish' | 'ob_bearish' | 'fvg_bullish' | 'fvg_bearish' }[];
  orderBlocks?: { high: number; low: number; label?: string; type?: 'ob_bullish' | 'ob_bearish' }[];
  fairValueGaps?: { high: number; low: number; label?: string; type?: 'fvg_bullish' | 'fvg_bearish' }[];
  structureBreaks?: { price: number; type: 'BOS' | 'ChoCH' | 'CHoCH'; direction: 'bullish' | 'bearish' }[];
  roleReversals?: { price: number; original_type?: string; new_type?: string; label?: string }[];
  liquidityZones?: { price: number; type: 'buy_side' | 'sell_side' | 'equal_highs' | 'equal_lows'; label?: string }[];
}

export interface PipnexOpportunity {
  symbol: string;
  timeframe: string;
  bias: TrendDirection;
  direction: 'LONG' | 'SHORT';
  orderType: 'MARKET' | 'LIMIT';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  riskReward: number;
  confidence: number; // 0..1
  strategy: string;
  rationale: string;
  setupScore: number; // 0..1
  entryTime?: number;
  smcElements: SmcElementsView;
  rawEntities: {
    swings: Swing[];
    breaks: StructureBreak[];
    orderBlocks: OrderBlock[];
    fvgs: FairValueGap[];
    liquidityPools: LiquidityPool[];
  };
}
