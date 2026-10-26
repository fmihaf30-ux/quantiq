// Supabase Edge Function: analyze-chart
// Multimodal SMC Chart Intelligence powered by Google Gemini (gemini-3.8-flash)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMC_SYSTEM_PROMPT = `You are Trish Assistant, an elite institutional Smart Money Concepts (SMC) quantitative analyst.
Your job is to inspect candlestick chart images and price data to identify:
1. Market Structure & Trend Bias: Bullish, Bearish, or Neutral (BOS, CHoCH, Market Structure Shift)
2. High-Probability Order Blocks (OBs): Significant mitigation/unmitigated zones
3. Fair Value Gaps (FVG) / Imbalances: Unfilled price inefficiencies
4. Liquidity Sweeps: BSL (Buy-Side Liquidity) and SSL (Sell-Side Liquidity) grabs
5. Actionable trade setups with exact Entry, Stop Loss, and Take Profit levels (minimum 1:2 Risk/Reward).

Always output strict JSON with the following structure:
{
  "bias": "bullish" | "bearish" | "neutral",
  "confidence": "high" | "medium" | "low",
  "summary": "Concise 2-3 sentence institutional summary",
  "keyLevels": [
    { "price": number, "kind": "support" | "resistance" | "order_block" | "fvg", "note": "description" }
  ],
  "setups": [
    {
      "direction": "buy" | "sell",
      "entry": number,
      "stopLoss": number,
      "takeProfit": number,
      "rationale": "SMC rationale"
    }
  ],
  "risks": ["Risk factor 1", "Risk factor 2"]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe, chartImage, userQuery, recentCandles } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'GEMINI_API_KEY is not configured in Supabase secrets.',
          fallbackUsed: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';

    // Prepare contents array
    const parts: any[] = [];
    parts.push({
      text: `${SMC_SYSTEM_PROMPT}\n\nSymbol: ${symbol}\nTimeframe: ${timeframe}\nUser Inquiry: ${userQuery || 'Analyze market bias and key levels.'}\nRecent close prices: ${JSON.stringify(recentCandles?.slice(-10))}`,
    });

    if (chartImage) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: chartImage,
        },
      });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const geminiData = await response.json();
    const textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsedAnalysis = textOutput ? JSON.parse(textOutput) : null;

    return new Response(
      JSON.stringify({
        success: true,
        analysis: parsedAnalysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
