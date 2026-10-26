// Supabase Edge Function: bot-runner
// Scheduled 24/7 Cloud Bot Executor

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { evaluateSignal, type Candle, type StrategySpec } from '../_shared/engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch running bots
    const { data: runningBots, error: botErr } = await supabase
      .from('cloud_bots')
      .select('*, mt5_accounts(*)')
      .eq('status', 'running');

    if (botErr) throw botErr;

    const results = [];

    for (const bot of runningBots || []) {
      const spec: StrategySpec = bot.strategy_spec;
      const account = bot.mt5_accounts;

      // Log tick check
      await supabase.from('cloud_bot_logs').insert({
        user_id: bot.user_id,
        bot_id: bot.id,
        log_type: 'debug',
        message: `Heartbeat: checking strategy criteria for ${spec.symbol} ${spec.timeframe} on ${account.server}`,
      });

      results.push({ botId: bot.id, status: 'checked' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        botsChecked: results.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Runner failure' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
