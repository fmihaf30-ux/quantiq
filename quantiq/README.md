# Quantiq — Cloud MT5 Bots & SMC Chart Intelligence

A production-grade, architecturally transparent reconstruction and enhancement of the platform model used by Pipnex AI.

---

## What Quantiq Solves

Traditional automated forex and prop firm trading requires:
- Renting a $20–$40/mo Windows desktop VPS
- Downloading the MT5 desktop client
- Writing or compiling `.mq5` Expert Advisors
- Managing Windows updates, crashes, and lost connections

**Quantiq replaces this entire stack with a high-speed cloud execution bridge:**
1. **Cloud MT5 Execution (MetaApi):** Connects directly to your broker's MT5 server (IC Markets, Exness, FTMO, Pepperstone, Deriv) via MetaApi cloud terminal instances. Zero desktop software required.
2. **AI Strategy Intent Engine:** Translates plain-English descriptions into verified mathematical trading strategies (Trend, Momentum Scalper, Range Reversion, Breakout, Pullback Swing) and backtests them instantly.
3. **Smart Money Concepts (SMC) Vision AI:** Uses Google Gemini (Gemini 3.8 Flash) multimodal vision to scan candlestick charts, Fair Value Gaps (FVGs), Order Blocks, and Liquidity Sweeps to provide actionable trade setups.
4. **Transparent Payments:** Supports Credit/Debit Cards & Bank Wire (SyncPay), Crypto (USDT), and African Mobile Money (MTN / Airtel Uganda via Youganda-payment).

---

## Project Structure

```
quantiq/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx                # Top navigation, MT5 connection status & AI credits
│   │   ├── TradingViewChart.tsx      # Interactive TradingView lightweight-charts with EMA & SMC levels
│   │   ├── SMCAnalysisCard.tsx       # Fair Value Gaps, Order Blocks, Bullish/Bearish bias & setups
│   │   ├── StrategyBuilderModal.tsx  # Natural language strategy prompt parser & backtester
│   │   ├── MT5ConnectModal.tsx       # MetaApi MT5 account connection (simulated & live)
│   │   └── CloudBotCard.tsx          # Real-time bot metrics (PnL, Win Rate, Trades, Toggle)
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client with live/demo mode toggle
│   │   ├── mockStore.ts              # In-memory & localStorage mock store with market tick simulator
│   │   └── chartAnalysis.ts          # Orchestrator for Gemini Edge Function & rule engine fallback
│   ├── pages/
│   │   ├── LandingPage.tsx           # High-converting product landing page
│   │   ├── DashboardPage.tsx         # Account overview, open positions, history, running bots
│   │   ├── ChartPage.tsx             # Interactive charts + Trish Assistant AI conversational panel
│   │   ├── BotsPage.tsx              # Bot management & live execution terminal log stream
│   │   ├── PricingPage.tsx           # Pro ($69), Ultimate ($149), Platinum ($399) + Checkout modal
│   │   └── AuthPage.tsx              # Sign In / Sign Up with 1-click instant demo access
│   ├── types.ts                      # Core TypeScript definitions
│   ├── App.tsx                       # React Router configuration
│   └── main.tsx                      # Application bootstrap
├── supabase/
│   ├── functions/
│   │   ├── _shared/engine.ts         # Shared deterministic strategy engine (browser + Deno Edge Functions)
│   │   ├── analyze-chart/index.ts    # Gemini 3.8 Flash multimodal SMC chart analysis
│   │   ├── connect-mt5/index.ts      # MetaApi cloud provisioning REST bridge
│   │   └── bot-runner/index.ts       # 24/7 cloud runner scheduled executor
│   └── migrations/
│       └── 20261019_init.sql         # PostgreSQL schema with Row-Level Security (RLS) & Realtime
├── package.json
├── vite.config.ts
├── tsconfig.json
└── .env.example
```

---

## Quick Start (Demo Mode)

Quantiq runs out of the box with **zero configuration** in demo mode, simulating market data, live bot ticks, and MT5 execution.

```bash
cd quantiq
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## Production Deployment (Live Mode)

To enable live MT5 execution and real Gemini vision analysis:

1. **Deploy Supabase Schema & Edge Functions:**
   ```bash
   supabase db push
   supabase functions deploy analyze-chart
   supabase functions deploy connect-mt5
   supabase functions deploy bot-runner
   ```

2. **Configure Supabase Secrets:**
   ```bash
   supabase secrets set GEMINI_API_KEY=your_gemini_api_key
   supabase secrets set METAAPI_TOKEN=your_metaapi_token
   supabase secrets set RUNNER_SECRET=your_random_runner_secret
   ```

3. **Configure Frontend Environment (`.env`):**
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Build for Production:**
   ```bash
   npm run build
   ```
