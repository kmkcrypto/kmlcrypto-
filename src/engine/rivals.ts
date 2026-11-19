import { FACILITY_TIERS, RIVAL_TEMPLATES } from '../data/catalog';
import { CoinSymbol, GameState, MarketRegime, RivalStrategy, RivalSyndicate } from '../types/game';
import { createSeededRng } from '../utils/rng';

export function getRivalStrategyLabel(strategy: RivalStrategy): string {
  switch (strategy) {
    case 'CHEAP_POWER':
      return 'Cheap Power PPA';
    case 'EFFICIENT_HARDWARE':
      return 'High-Efficiency Silicon';
    case 'RAPID_EXPANSION':
      return 'Rapid Rack Expansion';
    case 'ADVANCED_TECH':
      return 'Advanced R&D Focus';
    case 'LOW_OVERHEAD':
      return 'Lean Overhead Ops';
  }
}

export function createInitialRivals(runSeed = 'DEFAULT'): RivalSyndicate[] {
  const rng = createSeededRng(`${runSeed}-rivals`);
  const coins: CoinSymbol[] = ['BTC', 'LTC', 'DOGE', 'XMR', 'ETH', 'XCH'];
  return RIVAL_TEMPLATES.map((tpl, idx) => ({
    id: tpl.id,
    name: tpl.name,
    archetype: tpl.archetype,
    strategy: tpl.strategy,
    specialtyCoin: coins[(idx * 2 + Math.floor(rng() * 3)) % coins.length],
    hashPowerIndex: Math.round(tpl.baseHash * (0.85 + rng() * 0.35)),
    cashReserveUsd: Math.round(tpl.baseCash * (0.85 + rng() * 0.3)),
    facilityTierIndex: tpl.facilityTierIndex,
    hardwareQuality: Number((tpl.hardwareQuality + (rng() - 0.5) * 0.25).toFixed(2)),
    rigCount: 3 + tpl.facilityTierIndex * 4,
    powerCapacityKw: FACILITY_TIERS[Math.min(FACILITY_TIERS.length - 1, tpl.facilityTierIndex)].maxPowerKw,
    baseGrowthRate: Number((tpl.baseGrowth + (rng() - 0.5) * 0.01).toFixed(4)),
    marketSharePct: Math.max(10, 26 - idx * 4),
    aggressiveness: Number(
      Math.min(0.95, Math.max(0.25, tpl.aggressiveness + (rng() - 0.5) * 0.16)).toFixed(2)
    ),
    hostility: Math.round(15 + rng() * 25),
    disruptedSteps: 0,
    lastActionSummary: `${getRivalStrategyLabel(tpl.strategy)} expansion`,
  }));
}

export function stepRivalSyndicates(
  rivals: RivalSyndicate[],
  step: number,
  marketRegime: MarketRegime,
  playerPowerScore: number,
  rivalGrowthMult = 1.0,
  runSeed = 'DEFAULT',
  powerRateMult = 1.0
): RivalSyndicate[] {
  const regimeProfitMult =
    marketRegime === 'MANIA_PEAK'
      ? 1.55
      : marketRegime === 'BULL_RUN'
      ? 1.25
      : marketRegime === 'ACCUMULATION'
      ? 1.0
      : marketRegime === 'CORRECTION'
      ? 0.78
      : 0.58;

  const updated = rivals.map((rv) => {
    if (rv.disruptedSteps > 0) {
      return {
        ...rv,
        disruptedSteps: rv.disruptedSteps - 1,
        cashReserveUsd: Math.max(1000, Math.round(rv.cashReserveUsd - 450)),
        hashPowerIndex: Math.max(20, Math.round(rv.hashPowerIndex * 0.99)),
      };
    }

    const rng = createSeededRng(`${runSeed}-rival-${rv.id}-step-${step}`);

    // Dynamic strategy pivot on macro regimes or power tariff shocks
    let nextStrategy: RivalStrategy = rv.strategy;
    let action = rv.lastActionSummary;
    if (step > 0 && step % 15 === 0) {
      if ((marketRegime === 'CRYPTO_WINTER' || powerRateMult > 1.15) && rv.strategy === 'RAPID_EXPANSION') {
        nextStrategy = powerRateMult > 1.15 ? 'CHEAP_POWER' : 'LOW_OVERHEAD';
        action = `Pivoted to ${getRivalStrategyLabel(nextStrategy)} (margin defense)`;
      } else if (
        (marketRegime === 'MANIA_PEAK' || marketRegime === 'BULL_RUN') &&
        (rv.strategy === 'LOW_OVERHEAD' || rv.strategy === 'CHEAP_POWER') &&
        rv.cashReserveUsd > 22000
      ) {
        nextStrategy = rng() < 0.55 ? 'RAPID_EXPANSION' : 'EFFICIENT_HARDWARE';
        action = `Pivoted to ${getRivalStrategyLabel(nextStrategy)} (bull surge)`;
      }
    }

    // Strategy-driven operating economics
    const powerDiscount = nextStrategy === 'CHEAP_POWER' ? 0.68 : 1.0;
    const overheadMult = nextStrategy === 'LOW_OVERHEAD' ? 0.72 : 1.0;
    const qualityMult = nextStrategy === 'EFFICIENT_HARDWARE' ? 1.18 : 1.0;

    const grossStepRev = rv.hashPowerIndex * 18 * qualityMult * regimeProfitMult;
    const stepOpCost =
      (rv.rigCount * 36 * powerDiscount * powerRateMult + rv.facilityTierIndex * 95) * overheadMult;
    let nextCash = Math.round(rv.cashReserveUsd + grossStepRev - stepOpCost);
    let nextFacilityIdx = rv.facilityTierIndex;
    let nextQuality = rv.hardwareQuality;
    let nextRigs = rv.rigCount;

    const growthBias =
      (nextStrategy === 'RAPID_EXPANSION' ? 1.28 : nextStrategy === 'LOW_OVERHEAD' ? 0.85 : 1.0) *
      rivalGrowthMult;

    // Reinvestment decisions every few steps
    const upgradeCost = Math.round(14000 * Math.pow(1.9, nextFacilityIdx));
    if (
      nextFacilityIdx < FACILITY_TIERS.length - 1 &&
      nextCash > upgradeCost * 1.25 &&
      step % 7 === 0
    ) {
      nextCash -= upgradeCost;
      nextFacilityIdx += 1;
      action = `Expanded into ${FACILITY_TIERS[nextFacilityIdx].name}`;
    } else if (
      (nextStrategy === 'EFFICIENT_HARDWARE' || nextStrategy === 'ADVANCED_TECH') &&
      nextCash > 6500 &&
      step % 5 === 0
    ) {
      const spend = Math.round(nextCash * 0.28);
      nextCash -= spend;
      nextQuality = Number(Math.min(4.0, nextQuality + 0.08).toFixed(2));
      action = `Upgraded fleet silicon to Q${nextQuality.toFixed(1)}`;
    } else if (nextCash > 3500 && rng() < 0.35 * growthBias) {
      const facCap = FACILITY_TIERS[nextFacilityIdx]?.maxRigs ?? 24;
      if (nextRigs < facCap) {
        nextRigs += 1;
        nextCash -= 1800;
        action = `Deployed ${rv.specialtyCoin} rig #${nextRigs}`;
      }
    }

    const growth = Math.max(
      0.004,
      (rv.baseGrowthRate - 1) * growthBias * (regimeProfitMult > 0.8 ? 1 : 0.45)
    );
    const qualityBoost = 1 + (nextQuality - rv.hardwareQuality) * 0.35;
    const nextHash = Math.min(
      999_999,
      Math.max(20, Math.round(rv.hashPowerIndex * (1 + growth * (0.45 + rng() * 0.45)) * qualityBoost))
    );

    return {
      ...rv,
      strategy: nextStrategy,
      cashReserveUsd: Math.max(0, nextCash),
      facilityTierIndex: nextFacilityIdx,
      hardwareQuality: nextQuality,
      rigCount: nextRigs,
      powerCapacityKw: FACILITY_TIERS[nextFacilityIdx]?.maxPowerKw ?? rv.powerCapacityKw,
      hashPowerIndex: nextHash,
      lastActionSummary: action,
    };
  });

  const totalEcosystem =
    Math.max(12, playerPowerScore) + updated.reduce((s, r) => s + r.hashPowerIndex, 0);

  return updated.map((rv) => ({
    ...rv,
    marketSharePct: Number(((rv.hashPowerIndex / Math.max(1, totalEcosystem)) * 100).toFixed(1)),
  }));
}

export function getRivalInvestigateCost(
  state: Pick<GameState, 'employees'>,
  rival: RivalSyndicate
): number {
  const base = 220 + rival.facilityTierIndex * 180;
  const scoutSkill = state.employees
    .filter((e) => e.role === 'ANALYST' || e.role === 'PR_STRATEGIST')
    .reduce((s, e) => s + (e.skillLevel ?? 1), 0);
  const disc = Math.min(0.45, scoutSkill * 0.08);
  return Math.max(110, Math.round(base * (1 - disc)));
}

export function investigateRivalSyndicate(
  state: GameState,
  rivalIdx: number
): { ok: boolean; nextState: GameState; summary: string; cost: number } {
  const rival = state.rivals[rivalIdx];
  if (!rival) {
    return { ok: false, nextState: state, summary: `Rival #${rivalIdx + 1} not found.`, cost: 0 };
  }
  const cost = getRivalInvestigateCost(state, rival);
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash for corporate recon (need $${cost.toLocaleString('en-US')}).`,
      cost,
    };
  }

  const nextUpgradeCost = Math.round(14000 * Math.pow(1.9, rival.facilityTierIndex));
  const expansionReady =
    rival.facilityTierIndex < FACILITY_TIERS.length - 1 && rival.cashReserveUsd > nextUpgradeCost * 1.1;
  const vulnNote =
    rival.strategy === 'RAPID_EXPANSION'
      ? 'Thin cash cushion — vulnerable to FUD on specialty coin or DDoS disruption'
      : rival.strategy === 'CHEAP_POWER'
      ? 'Grid-dependent PPA — loses edge if you undercut with Hydro PPA'
      : rival.strategy === 'EFFICIENT_HARDWARE'
      ? 'High silicon CapEx — slower fleet headcount scaling'
      : 'Balanced industrial operator — outscale via Gen-4/5 silicon or contracts';

  const revealUntil = state.stepCount + 12;
  const nextRivals = state.rivals.map((r, i) =>
    i === rivalIdx ? { ...r, intelRevealedUntilStep: revealUntil } : r
  );

  const nextState: GameState = {
    ...state,
    cash: state.cash - cost,
    researchPoints: state.researchPoints + 4,
    rivals: nextRivals,
    currentCycleStats: {
      ...state.currentCycleStats,
      otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
    },
  };

  const facName = FACILITY_TIERS[rival.facilityTierIndex]?.name ?? 'Facility';
  const summary = [
    `INTEL DOSSIER: ${rival.name} (Cost: $${cost.toLocaleString('en-US')}, +4 RP · tracked 12st)`,
    `  Site & Fleet: ${facName} · ${rival.rigCount} rigs · Q${rival.hardwareQuality.toFixed(2)} silicon · ${rival.powerCapacityKw} kW`,
    `  Treasury:     ~$${rival.cashReserveUsd.toLocaleString('en-US')} reserve · Aggression ${Math.round(
      rival.aggressiveness * 100
    )}% · Hostility ${rival.hostility}/100`,
    `  Expansion:    ${
      expansionReady
        ? `IMMINENT upgrade toward ${FACILITY_TIERS[rival.facilityTierIndex + 1]?.name} (threshold $${nextUpgradeCost.toLocaleString('en-US')})`
        : `Building capital (${Math.round((rival.cashReserveUsd / Math.max(1, nextUpgradeCost)) * 100)}% to next facility)`
    }`,
    `  Vulnerability:${' '}${vulnNote} (Specialty: ${rival.specialtyCoin})`,
  ].join('\n');

  return { ok: true, nextState, summary, cost };
}

export function getPlayerRivalComparison(state: GameState, playerPowerScore: number) {
  const totalEcosystem =
    Math.max(12, playerPowerScore) + state.rivals.reduce((s, r) => s + r.hashPowerIndex, 0);
  const playerSharePct = Number(((playerPowerScore / Math.max(1, totalEcosystem)) * 100).toFixed(1));
  const avgGen =
    state.rigs.length > 0
      ? state.rigs.reduce((s, r) => s + (r.healthPct / 100) * 1.5, 0) / state.rigs.length + 0.8
      : 1.0;

  const entries = [
    {
      id: 'player',
      name: 'HASHRATE Ops (YOU)',
      isPlayer: true,
      hashPowerIndex: playerPowerScore,
      marketSharePct: playerSharePct,
      cashReserveUsd: Math.round(state.cash),
      facilityName: FACILITY_TIERS.find((f) => f.id === state.facilityId)?.name ?? 'Bedroom',
      hardwareQuality: Number(avgGen.toFixed(2)),
      rigCount: state.rigs.length,
      strategy: 'Custom Strategy',
      status: 'ACTIVE',
    },
    ...state.rivals.map((rv) => ({
      id: rv.id,
      name: rv.name,
      isPlayer: false,
      hashPowerIndex: rv.hashPowerIndex,
      marketSharePct: rv.marketSharePct,
      cashReserveUsd: rv.cashReserveUsd,
      facilityName: FACILITY_TIERS[rv.facilityTierIndex]?.name ?? 'Facility',
      hardwareQuality: rv.hardwareQuality,
      rigCount: rv.rigCount,
      strategy: getRivalStrategyLabel(rv.strategy),
      status:
        rv.disruptedSteps > 0
          ? `DISRUPTED (${rv.disruptedSteps}st)`
          : (rv.intelRevealedUntilStep ?? 0) >= state.stepCount
          ? 'INTEL ACTIVE'
          : 'ACTIVE',
    })),
  ].sort((a, b) => b.hashPowerIndex - a.hashPowerIndex);

  return entries;
}
