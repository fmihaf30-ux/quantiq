async function inspectCandleFetcher() {
  const chartChunkUrl = 'https://pipnex-ai.com/assets/TradingChart-BwuOwTUL.js';
  const res = await fetch(chartChunkUrl);
  const text = await res.text();

  // Find where candles `re` come from in TradingChart:
  // Search for `candles:` or `fetchCandles` or queryKey or endpoint
  const candleIdx = text.indexOf('candles:');
  console.log('Snippet around candles:');
  console.log(text.substring(Math.max(0, candleIdx - 300), Math.min(text.length, candleIdx + 800)));
}

inspectCandleFetcher();
