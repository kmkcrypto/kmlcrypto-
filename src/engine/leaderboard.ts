import { GameState, SeasonRecord, SeasonStanding } from '../types/game';
import { computeCompanyValuation } from './milestones';

/** A season lasts 60 steps — two full billing cycles. */
export const SEASON_LENGTH_STEPS = 60;

const SEASON_LABELS = [
  'Genesis Epoch',
  'Hash Wars',
  'Silicon Dawn',
  'Bear Country',
  'Mania Run',
  'Cold Storage',
  'Difficulty Bomb',
  'Halving Watch',
  'Liquidity Crunch',
  'Final Difficulty',
];

export function getSeasonId(stepCount: number): number {
  return Math.floor(Math.max(0, stepCount) / SEASON_LENGTH_STEPS) + 1;
}

export function getSeasonLabel(seasonId: number): string {
  const idx = (Math.max(1, seasonId) - 1) % SEASON_LABELS.length;
  const cycle = Math.floor((Math.max(1, seasonId) - 1) / SEASON_LABELS.length);
  const base = SEASON_LABELS[idx];
  return cycle > 0 ? `${base} ${cycle + 1}` : base;
}

export function getSeasonStatus(stepCount: number): {
  seasonId: number;
  label: string;
  stepsInto: number;
  stepsRemaining: number;
  endsAtStep: number;
} {
  const seasonId = getSeasonId(stepCount);
  const stepsInto = stepCount % SEASON_LENGTH_STEPS;
  return {
    seasonId,
    label: getSeasonLabel(seasonId),
    stepsInto,
    stepsRemaining: SEASON_LENGTH_STEPS - stepsInto,
    endsAtStep: seasonId * SEASON_LENGTH_STEPS,
  };
}

export function computePlayerSeasonScore(state: GameState, playerHashIndex: number): number {
  return Math.round(
    computeCompanyValuation(state) +
      playerHashIndex * 600 +
      state.mediaCredibility * 450 +
      state.researchPoints * 5
  );
}

function computeRivalSeasonScore(rival: GameState['rivals'][number]): number {
  return Math.round(
    rival.cashReserveUsd +
      rival.hashPowerIndex * 600 +
      rival.marketSharePct * 2200 +
      rival.rigCount * 400
  );
}

/** Current-season standings: the player against every rival syndicate. */
export function buildSeasonStandings(
  state: GameState,
  playerHashIndex: number
): SeasonStanding[] {
  const player: SeasonStanding = {
    name: 'You',
    isPlayer: true,
    score: computePlayerSeasonScore(state, playerHashIndex),
    hashIndex: playerHashIndex,
    valuationUsd: computeCompanyValuation(state),
  };
  const rivals: SeasonStanding[] = state.rivals.map((rv) => ({
    name: rv.name,
    isPlayer: false,
    score: computeRivalSeasonScore(rv),
    hashIndex: rv.hashPowerIndex,
    valuationUsd: rv.cashReserveUsd,
  }));
  return [player, ...rivals].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.isPlayer ? -1 : b.isPlayer ? 1 : 0;
  });
}

/**
 * Called by the simulation when a step crosses a season boundary. Returns the
 * updated history (newest first) or null when the season has not changed.
 */
export function archiveSeason(prev: GameState, playerHashIndex: number): SeasonRecord[] | null {
  const currentSeason = getSeasonId(prev.stepCount);
  if (getSeasonId(prev.stepCount + 1) === currentSeason) return null;

  const standings = buildSeasonStandings(prev, playerHashIndex);
  const playerRank = Math.max(1, standings.findIndex((s) => s.isPlayer) + 1);
  const record: SeasonRecord = {
    seasonId: currentSeason,
    label: getSeasonLabel(currentSeason),
    endedStep: prev.stepCount,
    playerRank,
    standings,
  };
  return [record, ...(prev.seasonHistory ?? [])].slice(0, 12);
}
