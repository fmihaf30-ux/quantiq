// Supabase Edge Function: connect-mt5
// Real MetaApi Cloud Provisioning Bridge

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const METAAPI_BASE_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, broker, server, login, password, accountName, metaapiAccountId } = await req.json();

    const token = Deno.env.get('METAAPI_TOKEN');
    if (!token) {
      // Return simulated success if token is not yet configured
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: 'METAAPI_TOKEN not configured; running in simulated bridge mode.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const headers = {
      'auth-token': token,
      'Content-Type': 'application/json',
    };

    if (action === 'connect') {
      // 1. Provision account on MetaApi
      const createRes = await fetch(`${METAAPI_BASE_URL}/users/current/accounts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: accountName || `${broker} ${login}`,
          type: 'cloud',
          login: String(login),
          password: String(password),
          server: String(server),
          platform: 'mt5',
          magic: 1001,
          quoteStreamingIntervalInSeconds: 2.5,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`MetaApi provisioning error (${createRes.status}): ${err}`);
      }

      const createdAccount = await createRes.json();
      const accountId = createdAccount.id;

      // 2. Deploy account instance
      await fetch(`${METAAPI_BASE_URL}/users/current/accounts/${accountId}/deploy`, {
        method: 'POST',
        headers,
      });

      return new Response(
        JSON.stringify({
          success: true,
          metaapiAccountId: accountId,
          state: createdAccount.state,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'refresh' && metaapiAccountId) {
      const getRes = await fetch(`${METAAPI_BASE_URL}/users/current/accounts/${metaapiAccountId}`, {
        method: 'GET',
        headers,
      });
      const data = await getRes.json();

      return new Response(
        JSON.stringify({
          success: true,
          account: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete' && metaapiAccountId) {
      await fetch(`${METAAPI_BASE_URL}/users/current/accounts/${metaapiAccountId}/undeploy`, {
        method: 'POST',
        headers,
      });
      await fetch(`${METAAPI_BASE_URL}/users/current/accounts/${metaapiAccountId}`, {
        method: 'DELETE',
        headers,
      });

      return new Response(
        JSON.stringify({ success: true, deleted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
