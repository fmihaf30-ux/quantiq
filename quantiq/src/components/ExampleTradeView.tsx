import { PipnexLightweightChart } from "./pipnex-chart/PipnexLightweightChart";

export function ExampleTradeView({ candles }: { candles: any[] }) {
  return (
    <PipnexLightweightChart
      symbol="XAUUSD"
      timeframe="M15"
      candles={candles}
      height={600}
      showSignalLevels={true}
      signal={{
        direction: "LONG",
        entry: 2650.0,
        stopLoss: 2642.5,
        takeProfit1: 2662.0,
        takeProfit2: 2672.5,
        confidence: 0.87,
        strategy: "SMC Sweep + OB",
      }}
      smcElements={{
        supportZones: [{ high: 2645.0, low: 2642.0, label: "Demand / Bullish OB", type: "ob_bullish" }],
        resistanceZones: [{ high: 2674.0, low: 2671.5, label: "HTF Supply", type: "resistance" }],
        structureBreaks: [{ price: 2655.2, type: "BOS", direction: "bullish" }],
        liquidityZones: [{ price: 2672.5, type: "buy_side", label: "Buy-side Liq (EQH)" }],
      }}
    />
  );
}
