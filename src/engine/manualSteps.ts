import type { GameState } from '../types/game';

export const MANUAL_STEP_CAPACITY = 5;
export const MANUAL_STEP_REFILL_SECONDS = 30;
const REFILL_MS = MANUAL_STEP_REFILL_SECONDS * 1000;

export function getManualStepBudget(
  saved: GameState['manualStepBudget'],
  now: number
): NonNullable<GameState['manualStepBudget']> {
  if (!saved) return { available: MANUAL_STEP_CAPACITY, refillStartedAt: now };

  const refillStartedAt = Math.min(saved.refillStartedAt, now);
  const refilled = Math.floor((now - refillStartedAt) / REFILL_MS);
  const available = Math.min(MANUAL_STEP_CAPACITY, saved.available + refilled);
  return {
    available,
    refillStartedAt: available === MANUAL_STEP_CAPACITY ? now : refillStartedAt + refilled * REFILL_MS,
  };
}

export function getManualStepWaitSeconds(refillStartedAt: number, now: number): number {
  return Math.ceil((refillStartedAt + REFILL_MS - now) / 1000);
}
