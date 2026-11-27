import { ACHIEVEMENTS, CHALLENGES, FACILITY_TIERS, MILESTONES } from '../data/catalog';
import {
  ChallengeId,
  GameState,
  NewsItem,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { getShortPositionsEquityUsd, getWalletMarketValueUsd } from './exchange';
import { getFabInventoryValueUsd } from './fab';
import { calculateRigResaleValue } from './usedMarket';
import { computeConglomerateEquityUsd } from './corporate';
import { BUSINESS_ORDER } from './affinity';
import {
  areAllSixBusinessesOwned,
  getOwnedBusinessIds,
  isBusinessActive,
} from './conglomerate';

export interface ValuationBreakdown {
  cashUsd: number;
  walletValueUsd: number;
  activeFleetUsd: number;
  backupVaultUsd: number;
  facilityEquityUsd: number;
  expansionWingsUsd: number;
  researchIpUsd: number;
  fabInventoryUsd: number;
  conglomerateEquityUsd: number;
  totalUsd: number;
}

export function computeValuationBreakdown(state: GameState): ValuationBreakdown {
  const cashUsd = Math.round(state.cash);
  const walletValueUsd = Math.round(
    getWalletMarketValueUsd(state) + getShortPositionsEquityUsd(state)
  );
  const activeFleetUsd = Math.round(
    state.rigs.reduce((s, r) => s + calculateRigResaleValue(r, state), 0)
  );
  const backupVaultUsd = Math.round(
    (state.backupRigs ?? []).reduce((s, r) => s + calculateRigResaleValue(r, state), 0)
  );
  const facilityEquityUsd = Math.round(
    state.ownedFacilityIds.reduce((s, fid) => {
      const f = FACILITY_TIERS.find((x) => x.id === fid);
      return s + (f?.buyoutPrice ?? 0);
    }, 0)
  );
  const expansionWingsUsd = Math.round((state.facilityExtraRooms ?? 0) * 1800);
  const researchIpUsd = state.unlockedResearch.length * 1400;
  const fabInventoryUsd = Math.round(getFabInventoryValueUsd(state.fab));
  const conglomerateEquityUsd = Math.round(computeConglomerateEquityUsd(state));
  const totalUsd = Math.round(
    cashUsd +
      walletValueUsd +
      activeFleetUsd +
      backupVaultUsd +
      facilityEquityUsd +
      expansionWingsUsd +
      researchIpUsd +
      fabInventoryUsd +
      conglomerateEquityUsd
  );
  return {
    cashUsd,
    walletValueUsd,
    activeFleetUsd,
    backupVaultUsd,
    facilityEquityUsd,
    expansionWingsUsd,
    researchIpUsd,
    fabInventoryUsd,
    conglomerateEquityUsd,
    totalUsd,
  };
}

export function computeCompanyValuation(state: GameState): number {
  return computeValuationBreakdown(state).totalUsd;
}

export function evaluateProgression(
  state: GameState,
  playerPowerScore: number,
  options?: { hadZeroFaultCycle?: boolean }
): {
  nextState: GameState;
  milestoneHit: boolean;
  newlyUnlockedMilestones: string[];
  newlyUnlockedAchievements: string[];
} {
  const stepLabel = formatStepLabel(state.stepCount);
  const facIdx = Math.max(
    0,
    FACILITY_TIERS.findIndex((f) => f.id === state.facilityId)
  );
  const totalRigsOwned = state.rigs.length + (state.backupRigs ?? []).length;
  const maxRigRetail = state.rigs.reduce(
    (m, r) => Math.max(m, r.purchasePriceUsd ?? 0),
    0
  );
  const hasProfitableCycle = state.ledger.some((l) => l.netCashflowUsd > 0);
  const rivalsBeaten = state.rivals.filter((rv) => playerPowerScore > rv.hashPowerIndex).length;
  const valuation = computeCompanyValuation(state);

  const unlockedMs = new Set(state.unlockedMilestones ?? []);
  const unlockedAch = new Set(state.unlockedAchievements ?? []);
  let bonusCash = 0;
  let bonusRp = 0;
  let bonusRep = 0;
  let milestoneHit = false;
  const newlyUnlockedMilestones: string[] = [];
  const newlyUnlockedAchievements: string[] = [];
  const addedNews: NewsItem[] = [];
  const addedTx: TransactionEntry[] = [];

  const triggerMs = (id: string) => {
    if (unlockedMs.has(id)) return;
    const spec = MILESTONES.find((m) => m.id === id);
    if (!spec) return;
    unlockedMs.add(id);
    newlyUnlockedMilestones.push(id);
    milestoneHit = true;
    bonusCash += spec.rewardCash;
    bonusRp += spec.rewardRp;
    bonusRep += spec.rewardReputation;
    addedNews.push({
      id: `news_ms_${id}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      title: `Milestone: ${spec.title}`,
      detail: `${spec.description} (+${formatUsd(spec.rewardCash)}, +${spec.rewardRp} RP, +${spec.rewardReputation} Rep)`,
      category: 'MILESTONE',
    });
    addedTx.push({
      id: `tx_ms_${id}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      category: 'REWARD',
      amountUsd: spec.rewardCash,
      description: `Milestone reward: ${spec.title}`,
    });
  };

  const triggerAch = (id: string) => {
    if (unlockedAch.has(id)) return;
    const spec = ACHIEVEMENTS.find((a) => a.id === id);
    if (!spec) return;
    unlockedAch.add(id);
    newlyUnlockedAchievements.push(id);
    milestoneHit = true;
    addedNews.push({
      id: `news_ach_${id}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      title: `Achievement Unlocked: ${spec.title}`,
      detail: spec.description,
      category: 'MILESTONE',
    });
  };

  if (state.stats.rigPurchasesCount > 0 || totalRigsOwned > 1) triggerMs('ms_first_rig');
  if (hasProfitableCycle) triggerMs('ms_profitable_cycle');
  if (maxRigRetail >= 2000) triggerMs('ms_major_hardware');
  if (facIdx >= 1) triggerMs('ms_first_expansion');
  if (state.employees.length > 0) triggerMs('ms_first_hire');
  if (facIdx >= 3) triggerMs('ms_warehouse');
  if (facIdx >= 4) triggerMs('ms_industrial');
  if (state.unlockedResearch.length >= 5) triggerMs('ms_research_breakthrough');
  if ((state.stats.maxPowerKwObserved ?? 0) >= 20) triggerMs('ms_power_level');
  if (rivalsBeaten >= Math.ceil(state.rivals.length / 2)) triggerMs('ms_top_company');
  if (state.stats.contractsCompleted >= 5 && state.mediaCredibility >= 70) {
    triggerMs('ms_clean_operator');
  }
  if (state.stats.covertOpsCount >= 5 && state.cash > 0) {
    triggerMs('ms_shadow_operator');
  }
  if (valuation >= 1_000_000) triggerMs('ms_millionaire_valuation');

  const ownedBusinesses = getOwnedBusinessIds(state);
  const allSixOwned = areAllSixBusinessesOwned(state);
  const allSixActive = BUSINESS_ORDER.every((id) => isBusinessActive(state, id));
  const hqEstablished = Boolean(state.conglomerate?.hq?.established);
  const hasGen7Tech = state.unlockedResearch.includes('res_gen7_quantum_photonic');

  if (hqEstablished && ownedBusinesses.length >= 2) {
    triggerMs('ms_conglomerate_hq');
  }
  if (allSixOwned) {
    triggerMs('ms_six_business_monopoly');
  }
  if (hasGen7Tech && allSixOwned) {
    triggerMs('ms_gen7_quantum_program');
  }

  // Achievements
  if (state.stats.rigPurchasesCount > 0 || totalRigsOwned > 1) triggerAch('ach_first_machine');
  if (hasProfitableCycle) triggerAch('ach_first_profit');
  if (totalRigsOwned >= 6) triggerAch('ach_collector');
  if (facIdx >= 4) triggerAch('ach_industrial_expansion');
  if (state.unlockedResearch.length >= 6) triggerAch('ach_research_pioneer');
  if (options?.hadZeroFaultCycle && state.rigs.filter((r) => r.enabled).length >= 4) {
    triggerAch('ach_efficient_operator');
  }
  if ((state.stats.repairsCompleted ?? 0) >= 5 && state.employees.length >= 2) {
    triggerAch('ach_master_tech');
  }
  if (valuation >= 500_000) triggerAch('ach_mining_empire');
  if (state.stats.contractsCompleted >= 10) triggerAch('ach_contract_titan');
  if (state.rigs.some((r) => r.enabled && r.overclockPct >= 135 && r.lastStepUsd > 0)) {
    triggerAch('ach_overclock_king');
  }
  if (state.unlockedResearch.length >= 12) triggerAch('ach_full_house');
  if (allSixActive && hqEstablished) triggerAch('ach_conglomerate_titan');
  if (hasGen7Tech && allSixOwned) triggerAch('ach_gen7_architect');

  // Active Challenge Evaluation
  let nextActiveChallenge: ChallengeId | null = state.activeChallengeId ?? null;
  const completedChallenges = new Set<ChallengeId>(state.completedChallenges ?? []);
  const failedChallenges = new Set<ChallengeId>(state.failedChallenges ?? []);

  if (nextActiveChallenge && !completedChallenges.has(nextActiveChallenge)) {
    const cSpec = CHALLENGES.find((c) => c.id === nextActiveChallenge);
    let won = false;
    let lost = false;

    if (nextActiveChallenge === 'challenge_bootstrap') {
      if (state.cash + bonusCash >= 3000) won = true;
      else if (state.stepCount >= 45) lost = true;
    } else if (nextActiveChallenge === 'challenge_power_cap') {
      if ((state.stats.maxPowerKwObserved ?? 0) > 3.2) lost = true;
      else if ((state.stats.totalRevenueUsd ?? 0) >= 4500) won = true;
    } else if (nextActiveChallenge === 'challenge_used_only') {
      if (!state.stats.usedOnlyEligible) lost = true;
      else if (
        state.rigs.filter((r) => r.enabled && r.isUsedPurchase).length >= 4
      ) {
        won = true;
      }
    } else if (nextActiveChallenge === 'challenge_warehouse_rush') {
      if (facIdx >= 3) won = true;
      else if (state.stepCount >= 90) lost = true;
    } else if (nextActiveChallenge === 'challenge_pristine') {
      if ((state.stats.pristineHealthStreak ?? 0) >= 30) won = true;
    }

    if (won && cSpec) {
      completedChallenges.add(cSpec.id);
      bonusCash += cSpec.rewardCash;
      bonusRp += cSpec.rewardRp;
      bonusRep += 6;
      milestoneHit = true;
      triggerAch(cSpec.achievementId);
      addedNews.push({
        id: `news_chg_win_${cSpec.id}_${state.stepCount}`,
        step: state.stepCount,
        stepLabel,
        title: `Challenge Completed: ${cSpec.title}`,
        detail: `Awarded +${formatUsd(cSpec.rewardCash)} and +${cSpec.rewardRp} RP!`,
        category: 'MILESTONE',
      });
      addedTx.push({
        id: `tx_chg_${cSpec.id}_${state.stepCount}`,
        step: state.stepCount,
        stepLabel,
        category: 'REWARD',
        amountUsd: cSpec.rewardCash,
        description: `Challenge payout: ${cSpec.title}`,
      });
      nextActiveChallenge = null;
    } else if (lost && cSpec) {
      failedChallenges.add(cSpec.id);
      addedNews.push({
        id: `news_chg_fail_${cSpec.id}_${state.stepCount}`,
        step: state.stepCount,
        stepLabel,
        title: `Challenge Failed: ${cSpec.title}`,
        detail: 'Constraint missed or deadline expired. You can attempt another challenge via "challenges".',
        category: 'ALERT',
      });
      nextActiveChallenge = null;
    }
  }

  return {
    nextState: {
      ...state,
      cash: state.cash + bonusCash,
      researchPoints: state.researchPoints + bonusRp,
      mediaCredibility: Math.min(100, state.mediaCredibility + bonusRep),
      unlockedMilestones: Array.from(unlockedMs),
      unlockedAchievements: Array.from(unlockedAch),
      activeChallengeId: nextActiveChallenge,
      completedChallenges: Array.from(completedChallenges),
      failedChallenges: Array.from(failedChallenges),
      news: addedNews.length > 0 ? [...addedNews, ...state.news].slice(0, 60) : state.news,
      transactions:
        addedTx.length > 0 ? [...addedTx, ...(state.transactions ?? [])].slice(0, 200) : state.transactions,
    },
    milestoneHit,
    newlyUnlockedMilestones,
    newlyUnlockedAchievements,
  };
}
