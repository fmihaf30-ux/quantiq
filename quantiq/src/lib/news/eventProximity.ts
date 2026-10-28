// ============================================================================
// eventProximity.ts — Pipnex Event Proximity Engine
// Reconstructed from Pipnex Trade Lens v0.80.7 (Task 37)
//
// Calculates distance in market time: Δt = eventTime - now
// Categorizes events into standard proximity windows.
// ============================================================================

import type { NewsEvent, EventProximityResult, ProximityState } from './types';

export const PROXIMITY_THRESHOLDS = {
  farMinutes: 240,       // 4 hours
  imminentMinutes: 30,   // 30 minutes (danger zone)
  justMinutes: 15,       // 15 minutes post-release
  lookbackMinutes: 120,  // 2 hours post-release
};

export function evaluateEventProximity(
  event: NewsEvent,
  nowMs: number = Date.now()
): EventProximityResult {
  const eventMs = new Date(event.eventTime).getTime();
  if (isNaN(eventMs)) {
    return {
      state: 'UNKNOWN',
      deltaMinutes: 0,
      minutesUntil: null,
      minutesSince: null,
      timeLabel: 'Unknown Time',
      isActionable: false,
    };
  }

  const status = (event.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') {
    return {
      state: 'CANCELLED',
      deltaMinutes: 0,
      minutesUntil: null,
      minutesSince: null,
      timeLabel: 'Cancelled',
      isActionable: false,
    };
  }

  if (status === 'postponed' || status === 'delayed') {
    return {
      state: 'POSTPONED',
      deltaMinutes: 0,
      minutesUntil: null,
      minutesSince: null,
      timeLabel: 'Postponed',
      isActionable: false,
    };
  }

  const deltaMs = eventMs - nowMs;
  const deltaMinutes = Math.round(deltaMs / 60000);

  if (status === 'releasing') {
    return {
      state: 'ACTIVE',
      deltaMinutes: 0,
      minutesUntil: 0,
      minutesSince: 0,
      timeLabel: '🔴 RELEASING NOW',
      isActionable: true,
    };
  }

  let state: ProximityState = 'UPCOMING_FAR';
  let minutesUntil: number | null = null;
  let minutesSince: number | null = null;
  let timeLabel = '';

  if (deltaMinutes > PROXIMITY_THRESHOLDS.farMinutes) {
    state = 'UPCOMING_FAR';
    minutesUntil = deltaMinutes;
    const hours = Math.floor(deltaMinutes / 60);
    const mins = deltaMinutes % 60;
    timeLabel = hours > 24 ? `In ${Math.floor(hours / 24)}d ${hours % 24}h` : `In ${hours}h ${mins}m`;
  } else if (deltaMinutes > PROXIMITY_THRESHOLDS.imminentMinutes) {
    state = 'UPCOMING';
    minutesUntil = deltaMinutes;
    const hours = Math.floor(deltaMinutes / 60);
    const mins = deltaMinutes % 60;
    timeLabel = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
  } else if (deltaMinutes > 0) {
    state = 'IMMINENT';
    minutesUntil = deltaMinutes;
    timeLabel = `⚠️ In ${deltaMinutes} min${deltaMinutes === 1 ? '' : 's'}`;
  } else {
    // Event is occurring or has occurred
    const since = Math.abs(deltaMinutes);
    minutesSince = since;

    if (since <= PROXIMITY_THRESHOLDS.justMinutes) {
      state = 'JUST_RELEASED';
      timeLabel = `⚡ Just Released (${since}m ago)`;
    } else if (since <= PROXIMITY_THRESHOLDS.lookbackMinutes) {
      state = 'RECENT';
      timeLabel = `Released ${since}m ago`;
    } else {
      state = 'RECENT';
      const hours = Math.floor(since / 60);
      timeLabel = `${hours}h ago`;
    }
  }

  return {
    state,
    deltaMinutes,
    minutesUntil,
    minutesSince,
    timeLabel,
    isActionable: state === 'UPCOMING' || state === 'IMMINENT' || state === 'JUST_RELEASED',
  };
}
