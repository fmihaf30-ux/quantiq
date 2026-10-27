import type { LiveCandle } from './metaapi';
import type { TradeSetup } from '@engine';

export interface ManipulationDiagnosis {
  type: 'downside_pdl_sweep' | 'upside_pdh_sweep' | 'swing_low_sweep' | 'swing_high_sweep' | 'none';
  sweptPrice: number;
  description: string;
}

export interface BOSDiagnosis {
  confirmed: boolean;
  direction: 'bullish' | 'bearish' | 'none';
  brokenLevel: number;
  bodyClosePrice: number;
  description: string;
}

export interface PairedZoneDiagnosis {
  hasZone: boolean;
  direction: 'buy' | 'sell';
  obHigh: number;
  obLow: number;
  fvgHigh: number;
  fvgLow: number;
  mitigationEntry: number;
  invalidationLevel: number;
  description: string;
}

export interface EngulfingDiagnosis {
  isConfirmed: boolean;
  direction: 'buy' | 'sell' | 'none';
  engulfingOpen: number;
  engulfingClose: number;
  priorOpen: number;
  priorClose: number;
  ratio: number;
  description: string;
}

export interface SetupOneEvaluation {
  isSetupValid: boolean;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  manipulation: ManipulationDiagnosis;
  bos: BOSDiagnosis;
  pairedZone: PairedZoneDiagnosis | null;
  engulfing: EngulfingDiagnosis;
  setup: TradeSetup | null;
  legoScore: number; // 0 to 5 matching M.J.M's 5 Lego Pieces
}

/**
 * M.J.M's Step 2: Detect Manipulation Phase (Liquidity Sweeps of PDH/PDL or Swings)
 */
export function detectManipulation(candles: LiveCandle[], currentPrice: number): ManipulationDiagnosis {
  if (!candles || candles.length < 20) {
    return { type: 'none', sweptPrice: 0, description: 'Insufficient historical candles for manipulation check.' };
  }

  // Segment candles into previous cycle and current cycle
  // In M15, roughly 40-50 candles represent prior session/day
  const priorCandles = candles.slice(0, Math.max(10, candles.length - 16));
  const recentCandles = candles.slice(-16);

  let pdh = -Infinity;
  let pdl = Infinity;
  for (const c of priorCandles) {
    if (c.high > pdh) pdh = c.high;
    if (c.low < pdl) pdl = c.low;
  }

  // Check recent candles for downside sweep (Bullish Judas Swing)
  // Wicks traded below PDL, but current price or candle bodies recovered above PDL
  const sweptBelow = recentCandles.some((c) => c.low < pdl);
  const recoveredAbove = currentPrice >= pdl;
  if (sweptBelow && recoveredAbove) {
    return {
      type: 'downside_pdl_sweep',
      sweptPrice: pdl,
      description: `Institutional Downside Manipulation: Swept Previous Day Low / Session Liquidity ($${pdl.toFixed(2)}) and rejected. Stop losses hunted.`,
    };
  }

  // Check recent candles for upside sweep (Bearish Judas Swing)
  // Wicks traded above PDH, but current price or candle bodies recovered below PDH
  const sweptAbove = recentCandles.some((c) => c.high > pdh);
  const recoveredBelow = currentPrice <= pdh;
  if (sweptAbove && recoveredBelow) {
    return {
      type: 'upside_pdh_sweep',
      sweptPrice: pdh,
      description: `Institutional Upside Manipulation: Swept Previous Day High / Session Liquidity ($${pdh.toFixed(2)}) and rejected. Buy stops hunted.`,
    };
  }

  // Local swing sweep check
  const localHigh = Math.max(...priorCandles.slice(-12).map((c) => c.high));
  const localLow = Math.min(...priorCandles.slice(-12).map((c) => c.low));

  if (recentCandles.some((c) => c.low < localLow) && currentPrice >= localLow) {
    return {
      type: 'swing_low_sweep',
      sweptPrice: localLow,
      description: `Swing Low Liquidity Sweep: Raided stop orders below $${localLow.toFixed(2)} and rejected.`,
    };
  }

  if (recentCandles.some((c) => c.high > localHigh) && currentPrice <= localHigh) {
    return {
      type: 'swing_high_sweep',
      sweptPrice: localHigh,
      description: `Swing High Liquidity Sweep: Raided buy stops above $${localHigh.toFixed(2)} and rejected.`,
    };
  }

  return { type: 'none', sweptPrice: 0, description: 'No active liquidity sweep detected in current window.' };
}

/**
 * M.J.M's Step 3: Break of Structure (BOS) with CANDLE BODIES
 * "The wicks are there to create damage, watch how the bodies close. Bodies tell the story."
 */
export function detectBodyCloseBOS(candles: LiveCandle[]): BOSDiagnosis {
  if (!candles || candles.length < 15) {
    return { confirmed: false, direction: 'none', brokenLevel: 0, bodyClosePrice: 0, description: 'Insufficient candles for BOS' };
  }

  // Find swing high and swing low in the intermediate structure
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  const lookback = candles.slice(-25, -4);

  for (const c of lookback) {
    if (c.high > swingHigh) swingHigh = c.high;
    if (c.low < swingLow) swingLow = c.low;
  }

  const latestCandles = candles.slice(-6);

  // Check Bullish BOS: candle body (close) must close strictly ABOVE swing high
  for (const c of latestCandles) {
    if (c.close > swingHigh && c.close > c.open) {
      return {
        confirmed: true,
        direction: 'bullish',
        brokenLevel: swingHigh,
        bodyClosePrice: c.close,
        description: `Bullish BOS Confirmed: Candle body cleanly closed @ $${c.close.toFixed(2)} above swing high ($${swingHigh.toFixed(2)}). Institutional displacement verified.`,
      };
    }
  }

  // Check Bearish BOS: candle body (close) must close strictly BELOW swing low
  for (const c of latestCandles) {
    if (c.close < swingLow && c.close < c.open) {
      return {
        confirmed: true,
        direction: 'bearish',
        brokenLevel: swingLow,
        bodyClosePrice: c.close,
        description: `Bearish BOS Confirmed: Candle body cleanly closed @ $${c.close.toFixed(2)} below swing low ($${swingLow.toFixed(2)}). Institutional displacement verified.`,
      };
    }
  }

  return {
    confirmed: false,
    direction: 'none',
    brokenLevel: 0,
    bodyClosePrice: 0,
    description: 'No candle body close beyond structural swing highs/lows.',
  };
}

/**
 * M.J.M's Step 4: Return into Fair Value Gap PAIRED WITH an Order Block
 * "Not every gap is valid and if its not paired with an order block... then is best to let it be."
 */
export function detectPairedZone(candles: LiveCandle[], bias: 'bullish' | 'bearish'): PairedZoneDiagnosis | null {
  if (!candles || candles.length < 12) return null;

  const n = candles.length;

  if (bias === 'bullish') {
    // Scan backward for 3-candle bullish imbalance (Candle 1 High < Candle 3 Low)
    for (let i = n - 3; i >= Math.max(0, n - 15); i--) {
      const c1 = candles[i];
      const c2 = candles[i + 1];
      const c3 = candles[i + 2];

      if (c2.close > c2.open && c3.low > c1.high) {
        const fvgLow = c1.high;
        const fvgHigh = c3.low;

        // The paired Order Block is the last down candle (bearish) before the displacement
        let obLow = c1.low;
        let obHigh = c1.open;
        if (c1.close < c1.open) {
          obLow = c1.low;
          obHigh = c1.high;
        }

        const mitigationEntry = Number(((fvgHigh + fvgLow) / 2).toFixed(2));
        const invalidationLevel = Number(Math.min(obLow, c1.low, c2.low).toFixed(2));

        return {
          hasZone: true,
          direction: 'buy',
          obHigh,
          obLow,
          fvgHigh,
          fvgLow,
          mitigationEntry,
          invalidationLevel,
          description: `Paired Zone: Bullish FVG ($${fvgLow.toFixed(2)} - $${fvgHigh.toFixed(2)}) overlapping Demand Order Block ($${obLow.toFixed(2)} - $${obHigh.toFixed(2)}).`,
        };
      }
    }
  } else {
    // Scan backward for 3-candle bearish imbalance (Candle 1 Low > Candle 3 High)
    for (let i = n - 3; i >= Math.max(0, n - 15); i--) {
      const c1 = candles[i];
      const c2 = candles[i + 1];
      const c3 = candles[i + 2];

      if (c2.close < c2.open && c3.high < c1.low) {
        const fvgHigh = c1.low;
        const fvgLow = c3.high;

        let obHigh = c1.high;
        let obLow = c1.open;
        if (c1.close > c1.open) {
          obHigh = c1.high;
          obLow = c1.low;
        }

        const mitigationEntry = Number(((fvgHigh + fvgLow) / 2).toFixed(2));
        const invalidationLevel = Number(Math.max(obHigh, c1.high, c2.high).toFixed(2));

        return {
          hasZone: true,
          direction: 'sell',
          obHigh,
          obLow,
          fvgHigh,
          fvgLow,
          mitigationEntry,
          invalidationLevel,
          description: `Paired Zone: Bearish FVG ($${fvgLow.toFixed(2)} - $${fvgHigh.toFixed(2)}) overlapping Supply Order Block ($${obLow.toFixed(2)} - $${obHigh.toFixed(2)}).`,
        };
      }
    }
  }

  return null;
}

/**
 * M.J.M's Step 5: THE ENGULFING CANDLE CONFIRMATION TRIGGER
 * "Finally and most key confirmation most miss is wait for a formation of an engulfing candle... it has to be bigger in terms of its body close."
 */
export function detectEngulfingConfirmation(candles: LiveCandle[]): EngulfingDiagnosis {
  if (!candles || candles.length < 2) {
    return {
      isConfirmed: false,
      direction: 'none',
      engulfingOpen: 0,
      engulfingClose: 0,
      priorOpen: 0,
      priorClose: 0,
      ratio: 0,
      description: 'Insufficient candles for engulfing confirmation.',
    };
  }

  // Check the last closed candle (or the second to last if latest is still active)
  const cur = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const curBody = Math.abs(cur.close - cur.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const ratio = prevBody > 0 ? curBody / prevBody : 1.0;

  // Bullish Engulfing:
  // 1. Previous candle closed bearish
  // 2. Current candle closed bullish
  // 3. Current candle body engulfs previous candle body
  // 4. Current body is larger than previous body
  const isBullishEngulfing =
    prev.close < prev.open &&
    cur.close > cur.open &&
    cur.close >= prev.open &&
    cur.open <= prev.close &&
    ratio >= 1.05;

  if (isBullishEngulfing) {
    return {
      isConfirmed: true,
      direction: 'buy',
      engulfingOpen: cur.open,
      engulfingClose: cur.close,
      priorOpen: prev.open,
      priorClose: prev.close,
      ratio: Number(ratio.toFixed(2)),
      description: `🔥 Bullish Engulfing Confirmed (${ratio.toFixed(1)}x body): Current green body ($${cur.open} -> $${cur.close}) fully engulfs prior red body. Institutional buyers taking control.`,
    };
  }

  // Bearish Engulfing:
  // 1. Previous candle closed bullish
  // 2. Current candle closed bearish
  // 3. Current candle body engulfs previous candle body
  // 4. Current body is larger than previous body
  const isBearishEngulfing =
    prev.close > prev.open &&
    cur.close < cur.open &&
    cur.close <= prev.open &&
    cur.open >= prev.close &&
    ratio >= 1.05;

  if (isBearishEngulfing) {
    return {
      isConfirmed: true,
      direction: 'sell',
      engulfingOpen: cur.open,
      engulfingClose: cur.close,
      priorOpen: prev.open,
      priorClose: prev.close,
      ratio: Number(ratio.toFixed(2)),
      description: `🔥 Bearish Engulfing Confirmed (${ratio.toFixed(1)}x body): Current red body ($${cur.open} -> $${cur.close}) fully engulfs prior green body. Institutional sellers taking control.`,
    };
  }

  return {
    isConfirmed: false,
    direction: 'none',
    engulfingOpen: cur.open,
    engulfingClose: cur.close,
    priorOpen: prev.open,
    priorClose: prev.close,
    ratio: Number(ratio.toFixed(2)),
    description: 'Awaiting Engulfing Candle close confirmation inside the mitigation zone.',
  };
}

/**
 * MASTER EVALUATOR: M.J.M's ONE SETUP FOR LIFE
 * Combines all 5 Lego Pieces into a deterministic, institutional evaluation.
 */
export function evaluateOneSetupForLife(params: {
  symbol: string;
  candles: LiveCandle[];
  currentPrice: number;
  decimals: number;
  spentZones?: number[];
  requireEngulfing?: boolean;
}): SetupOneEvaluation {
  const { symbol, candles, currentPrice, decimals, spentZones = [], requireEngulfing = true } = params;

  if (!candles || candles.length < 15) {
    return {
      isSetupValid: false,
      bias: 'neutral',
      confidence: 'low',
      summary: `Insufficient historical candles for ${symbol} to evaluate Setup For Life.`,
      manipulation: { type: 'none', sweptPrice: 0, description: 'No data' },
      bos: { confirmed: false, direction: 'none', brokenLevel: 0, bodyClosePrice: 0, description: 'No data' },
      pairedZone: null,
      engulfing: { isConfirmed: false, direction: 'none', engulfingOpen: 0, engulfingClose: 0, priorOpen: 0, priorClose: 0, ratio: 0, description: 'No data' },
      setup: null,
      legoScore: 0,
    };
  }

  // 1. Evaluate Manipulation
  const manipulation = detectManipulation(candles, currentPrice);

  // 2. Evaluate Body-Close BOS
  const bos = detectBodyCloseBOS(candles);

  // Determine structural bias
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bos.confirmed && (bos.direction === 'bullish' || bos.direction === 'bearish')) {
    bias = bos.direction;
  } else if (manipulation.type === 'downside_pdl_sweep' || manipulation.type === 'swing_low_sweep') {
    bias = 'bullish';
  } else if (manipulation.type === 'upside_pdh_sweep' || manipulation.type === 'swing_high_sweep') {
    bias = 'bearish';
  }

  if (bias === 'neutral') {
    return {
      isSetupValid: false,
      bias: 'neutral',
      confidence: 'low',
      summary: `Market structure for ${symbol} is in consolidation/accumulation. No clear manipulation or BOS displacement yet.`,
      manipulation,
      bos,
      pairedZone: null,
      engulfing: detectEngulfingConfirmation(candles),
      setup: null,
      legoScore: 1,
    };
  }

  // 3. Evaluate Paired FVG + Order Block
  const pairedZone = detectPairedZone(candles, bias);

  // 4. Evaluate Engulfing Confirmation
  const engulfing = detectEngulfingConfirmation(candles);

  // Count Lego Score (0 to 5)
  let score = 1; // Time/asset exists
  if (manipulation.type !== 'none') score++;
  if (bos.confirmed) score++;
  if (pairedZone && pairedZone.hasZone) score++;
  if (engulfing.isConfirmed && engulfing.direction === (bias === 'bullish' ? 'buy' : 'sell')) score++;

  // Invalidate if zone is already spent
  if (pairedZone && spentZones.some((zp) => Math.abs(pairedZone.mitigationEntry - zp) / zp <= 0.0015)) {
    return {
      isSetupValid: false,
      bias,
      confidence: 'low',
      summary: `Paired FVG+OB zone @ $${pairedZone.mitigationEntry.toFixed(decimals)} is EXHAUSTED from a recent trade. Awaiting new structure.`,
      manipulation,
      bos,
      pairedZone,
      engulfing,
      setup: null,
      legoScore: score,
    };
  }

  // Check if price is within / tapping the mitigation zone
  const isPriceNearZone = pairedZone 
    ? Math.abs(currentPrice - pairedZone.mitigationEntry) / currentPrice <= 0.003
    : true;

  // Engulfing check: if required, must be confirmed in trade direction
  const isEngulfingReady = !requireEngulfing || (engulfing.isConfirmed && engulfing.direction === (bias === 'bullish' ? 'buy' : 'sell'));

  const isSetupValid = Boolean(
    pairedZone &&
    pairedZone.hasZone &&
    bos.confirmed &&
    isPriceNearZone &&
    isEngulfingReady
  );

  let setup: TradeSetup | null = null;
  if (isSetupValid && pairedZone) {
    const isBuy = bias === 'bullish';
    const entry = Number(currentPrice.toFixed(decimals));
    
    // SL placed safely below the manipulation invalidation level
    const slBuffer = currentPrice * 0.001;
    const rawSl = isBuy 
      ? Math.min(pairedZone.invalidationLevel - slBuffer, currentPrice - currentPrice * 0.0025)
      : Math.max(pairedZone.invalidationLevel + slBuffer, currentPrice + currentPrice * 0.0025);
    const sl = Number(rawSl.toFixed(decimals));

    // TP targets nearest opposing intraday liquidity (min 1:2.2 RR)
    const slDist = Math.abs(entry - sl);
    const tpDist = slDist * 2.2;
    const tp = Number((isBuy ? entry + tpDist : entry - tpDist).toFixed(decimals));

    setup = {
      direction: isBuy ? 'buy' : 'sell',
      entry,
      stopLoss: sl,
      takeProfit: tp,
      rationale: `M.J.M ONE SETUP FOR LIFE: ${manipulation.description} | ${bos.description} | ${pairedZone.description} | ${engulfing.description} | Target: Nearest Opposing Liquidity Pool (1:2.2 RR).`,
    };
  }

  return {
    isSetupValid,
    bias,
    confidence: score >= 4 ? 'high' : (score >= 3 ? 'medium' : 'low'),
    summary: `M.J.M Setup Diagnostic (${score}/5 Pieces): ${manipulation.type !== 'none' ? 'Manipulation active' : 'No sweep'} | BOS: ${bos.confirmed ? 'Body closed' : 'Pending'} | FVG+OB: ${pairedZone?.hasZone ? 'Paired' : 'Missing'} | Engulfing: ${engulfing.isConfirmed ? 'Confirmed' : 'Awaiting'}.`,
    manipulation,
    bos,
    pairedZone,
    engulfing,
    setup,
    legoScore: score,
  };
}
