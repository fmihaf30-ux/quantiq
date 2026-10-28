// ============================================================================
// relevance.ts — Pipnex Symbol & Currency Relevance Engine
// Reconstructed from Pipnex Trade Lens v0.80.7 (Task 37)
// ============================================================================

import type { NewsEvent } from './types';

const SYMBOL_CURRENCIES: Record<string, string[]> = {
  XAUUSD: ['USD', 'XAU'],
  EURUSD: ['EUR', 'USD'],
  GBPUSD: ['GBP', 'USD'],
  USDJPY: ['USD', 'JPY'],
  USDCAD: ['USD', 'CAD'],
  AUDUSD: ['AUD', 'USD'],
  NZDUSD: ['NZD', 'USD'],
  USDCHF: ['USD', 'CHF'],
  EURGBP: ['EUR', 'GBP'],
  EURJPY: ['EUR', 'JPY'],
  GBPJPY: ['GBP', 'JPY'],
  US30: ['USD'],
  NAS100: ['USD'],
  SPX500: ['USD'],
  BTCUSD: ['USD', 'BTC'],
  ETHUSD: ['USD', 'ETH'],
};

/**
 * Extracts currencies structurally associated with a trading symbol.
 */
export function currenciesOfSymbol(symbol: string): string[] {
  const clean = symbol.toUpperCase().replace('/', '').replace(/M$/, '');
  if (SYMBOL_CURRENCIES[clean]) {
    return SYMBOL_CURRENCIES[clean];
  }

  // Fallback 6-char forex pair splitting
  if (clean.length === 6) {
    return [clean.slice(0, 3), clean.slice(3, 6)];
  }

  if (clean.endsWith('USD')) return ['USD'];
  if (clean.endsWith('EUR')) return ['EUR'];
  if (clean.endsWith('JPY')) return ['JPY'];
  return ['USD'];
}

/**
 * Checks whether an event bears on a target instrument.
 */
export function isEventRelevantToSymbol(event: NewsEvent, symbol: string): boolean {
  const eventCurrency = (event.currency || '').toUpperCase();
  const involvedCurrencies = currenciesOfSymbol(symbol);

  // Direct currency match
  if (involvedCurrencies.includes(eventCurrency)) {
    return true;
  }

  // Country code matching (e.g. US -> USD, EU -> EUR, GB -> GBP, JP -> JPY)
  const country = (event.country || '').toUpperCase();
  if (country === 'US' && involvedCurrencies.includes('USD')) return true;
  if ((country === 'EU' || country === 'DE' || country === 'FR') && involvedCurrencies.includes('EUR')) return true;
  if (country === 'GB' && involvedCurrencies.includes('GBP')) return true;
  if (country === 'JP' && involvedCurrencies.includes('JPY')) return true;
  if (country === 'AU' && involvedCurrencies.includes('AUD')) return true;
  if (country === 'CA' && involvedCurrencies.includes('CAD')) return true;

  // Global reserve currency impact: High-impact USD events affect all major assets
  if (eventCurrency === 'USD' && event.impact === 'high') {
    return true;
  }

  return false;
}
