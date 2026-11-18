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
  rivalGrowthMult = 1.0
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

    // Strategy-driven operating economics
    const powerDiscount = rv.strategy === 'CHEAP_POWER' ? 0.68 : 1.0;
    const overheadMult = rv.strategy === 'LOW_OVERHEAD' ? 0.72 : 1.0;
    const qualityMult = rv.strategy === 'EFFICIENT_HARDWARE' ? 1.18 : 1.0;

    const grossStepRev = rv.hashPowerIndex * 18 * qualityMult * regimeProfitMult;
    const stepOpCost =
      (rv.rigCount * 36 * powerDiscount + rv.facilityTierIndex * 95) * overheadMult;
    let nextCash = Math.round(rv.cashReserveUsd + grossStepRev - stepOpCost);
    let nextFacilityIdx = rv.facilityTierIndex;
    let nextQuality = rv.hardwareQuality;
    let nextRigs = rv.rigCount;
    let action = rv.lastActionSummary;

    const growthBias =
      (rv.strategy === 'RAPID_EXPANSION' ? 1.28 : rv.strategy === 'LOW_OVERHEAD' ? 0.85 : 1.0) *
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
      (rv.strategy === 'EFFICIENT_HARDWARE' || rv.strategy === 'ADVANCED_TECH') &&
      nextCash > 6500 &&
      step % 5 === 0
    ) {
      const spend = Math.round(nextCash * 0.28);
      nextCash -= spend;
      nextQuality = Number(Math.min(4.0, nextQuality + 0.08).toFixed(2));
      action = `Upgraded fleet silicon to Q${nextQuality.toFixed(1)}`;
    } else if (nextCash > 3500 && Math.random() < 0.35 * growthBias) {
      const facCap = FACILITY_TIERS[nextFacilityIdx]?.maxRigs ?? 24;
      if (nextRigs < facCap) {
        nextRigs += 1;
        nextCash -= 1800;
        action = `Deployed ${rv.specialtyCoin} rig #${nextRigs}`;
      }
    }

    const growth = Math.max(0.004, (rv.baseGrowthRate - 1) * growthBias * (regimeProfitMult > 0.8 ? 1 : 0.45));
    const qualityBoost = 1 + (nextQuality - rv.hardwareQuality) * 0.35;
    const nextHash = Math.min(
      999_999,
      Math.max(20, Math.round(rv.hashPowerIndex * (1 + growth * (0.45 + Math.random() * 0.45)) * qualityBoost))
    );

    return {
      ...rv,
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
      status: rv.disruptedSteps > 0 ? `DISRUPTED (${rv.disruptedSteps}st)` : 'ACTIVE',
    })),
  ].sort((a, b) => b.hashPowerIndex - a.hashPowerIndex);

  return entries;
}
