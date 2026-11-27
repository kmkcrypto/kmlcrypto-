import { FACILITY_TIERS, RIVAL_TEMPLATES } from '../data/catalog';
import { CoinSymbol, GameState, MarketRegime, RivalProject, RivalStrategy, RivalSyndicate } from '../types/game';
import { formatUsd } from '../utils/format';
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
  return RIVAL_TEMPLATES.map((tpl, idx) => ({
    id: tpl.id,
    name: tpl.name,
    archetype: tpl.archetype,
    strategy: tpl.strategy,
    specialtyCoin: tpl.desks[0],
    secondaryCoin: tpl.desks[1],
    hashPowerIndex: Math.round(tpl.baseHash * (0.85 + rng() * 0.35)),
    cashReserveUsd: Math.round(tpl.baseCash * (0.85 + rng() * 0.3)),
    facilityTierIndex: tpl.facilityTierIndex,
    hardwareQuality: Number((tpl.hardwareQuality + (rng() - 0.5) * 0.25).toFixed(2)),
    rigCount: Math.min(FACILITY_TIERS[tpl.facilityTierIndex].maxRigs, 3 + tpl.facilityTierIndex * 4),
    powerCapacityKw: FACILITY_TIERS[Math.min(FACILITY_TIERS.length - 1, tpl.facilityTierIndex)].maxPowerKw,
    baseGrowthRate: Number((tpl.baseGrowth + (rng() - 0.5) * 0.01).toFixed(4)),
    marketSharePct: Math.max(10, 26 - idx * 4),
    aggressiveness: Number(
      Math.min(0.95, Math.max(0.25, tpl.aggressiveness + (rng() - 0.5) * 0.16)).toFixed(2)
    ),
    hostility: Math.round(15 + rng() * 25),
    disruptedSteps: 0,
    lastActionSummary: `Opened ${tpl.desks.join(' and ')} desks`,
  }));
}

export function getRivalCoinPressure(rival: RivalSyndicate, coin: CoinSymbol): number {
  const split = rival.secondaryCoin && rival.secondaryCoin !== rival.specialtyCoin;
  const allocation = coin === rival.specialtyCoin ? (split ? 0.76 : 1) : split && coin === rival.secondaryCoin ? 0.24 : 0;
  return rival.hashPowerIndex * allocation * (rival.disruptedSteps > 0 ? 0.45 : 1);
}

export function getRivalDifficultyRise(rivals: RivalSyndicate[], coin: CoinSymbol): number {
  const pressure = rivals.reduce((sum, rival) => sum + getRivalCoinPressure(rival, coin), 0);
  return 0.0035 * pressure / (300 + pressure);
}

function getRivalProjectLabel(rival: RivalSyndicate, project: RivalProject): string {
  switch (project.kind) {
    case 'EXPAND': return `expand into ${FACILITY_TIERS[rival.facilityTierIndex + 1]?.name ?? 'a larger facility'}`;
    case 'ADD_RACKS': return `bring racks online for ${rival.specialtyCoin}`;
    case 'REFIT': return `refit ${rival.specialtyCoin} racks with higher-quality silicon`;
    case 'SWITCH_COIN': return `redirect its main desk from ${rival.specialtyCoin} to ${project.targetCoin}`;
    case 'LOCK_POWER': return 'switch to a fixed-rate power deal';
  }
}

interface RivalMarketContext {
  coins: GameState['coins'];
  playerPrimaryCoin?: CoinSymbol;
}

function chooseRivalProject(
  rival: RivalSyndicate, step: number, powerRateMult: number, market?: RivalMarketContext
): RivalProject | undefined {
  const facility = FACILITY_TIERS[rival.facilityTierIndex];
  const gap = facility.maxRigs - rival.rigCount;
  const reserve = (rival.rigCount * 36 + rival.facilityTierIndex * 95) * 4;
  const proposal = (kind: RivalProject['kind'], duration: number, costUsd: number, targetCoin?: CoinSymbol): RivalProject =>
    ({ kind, completesAt: step + duration, costUsd, targetCoin });
  const canAfford = (plan: RivalProject) => rival.cashReserveUsd - reserve >= plan.costUsd;
  const powerPlan = proposal('LOCK_POWER', 3, 2100 + rival.rigCount * 140);
  if (rival.strategy === 'CHEAP_POWER' && powerRateMult > 1.08 &&
      (rival.powerDealUntilStep ?? 0) < step + 4 && canAfford(powerPlan)) return powerPlan;

  if (market) {
    const flexible = rival.archetype === 'DARKNET_POOL';
    const responseCoin = flexible ? market.playerPrimaryCoin : undefined;
    const initialDesks = RIVAL_TEMPLATES.find((template) => template.id === rival.id)?.desks ?? [];
    const candidates: CoinSymbol[] = [rival.specialtyCoin, ...initialDesks];
    if (flexible) candidates.push('LTC', 'DOGE', 'RVN', ...(responseCoin ? [responseCoin] : []));
    const score = (symbol: CoinSymbol): number => {
      const coin = market.coins[symbol];
      if (!coin || coin.isPlayerCreated || coin.algorithm === 'QHASH' && rival.hardwareQuality < 2.75) return 0;
      return (coin.priceUsd / Math.max(0.01, coin.basePriceUsd)) *
        Math.sqrt((coin.blockRewardScale ?? 1) / Math.max(0.5, coin.networkDifficulty)) *
        (responseCoin === symbol ? 1.35 : 1);
    };
    const nextCoin = candidates.reduce((best, coin) => score(coin) > score(best) ? coin : best);
    const pivot = proposal('SWITCH_COIN', flexible ? 3 : 6, 1800 + rival.rigCount * (flexible ? 180 : 380), nextCoin);
    if (nextCoin !== rival.specialtyCoin && score(nextCoin) > score(rival.specialtyCoin) * 1.17 && canAfford(pivot)) {
      return { ...pivot, followsPlayer: nextCoin === responseCoin };
    }
  }

  const expand = proposal('EXPAND', rival.strategy === 'RAPID_EXPANSION' ? 4 : 7, Math.round(14_000 * Math.pow(1.9, rival.facilityTierIndex)));
  const refit = proposal('REFIT', rival.strategy === 'ADVANCED_TECH' ? 6 : 4, 3900 + rival.rigCount * 480);
  const racks = proposal('ADD_RACKS', rival.strategy === 'RAPID_EXPANSION' ? 2 : 4, 1900 * Math.min(gap, 3));
  const canRefit = rival.hardwareQuality < 4 && canAfford(refit);
  if (rival.facilityTierIndex < FACILITY_TIERS.length - 1 && gap <= 2 && canAfford(expand) && rival.strategy !== 'LOW_OVERHEAD') return expand;
  if (canRefit && (rival.strategy === 'EFFICIENT_HARDWARE' || rival.strategy === 'ADVANCED_TECH') && (gap < 4 || rival.hardwareQuality < 2.4)) return refit;
  if (gap > 0 && canAfford(racks)) return racks;
  return canRefit ? refit : undefined;
}

export function stepRivalSyndicates(
  rivals: RivalSyndicate[],
  step: number,
  marketRegime: MarketRegime,
  playerPowerScore: number,
  rivalGrowthMult = 1.0,
  runSeed = 'DEFAULT',
  powerRateMult = 1.0,
  market?: RivalMarketContext
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
        project: rv.project ? { ...rv.project, completesAt: rv.project.completesAt + 1 } : undefined,
      };
    }

    const rng = createSeededRng(`${runSeed}-rival-${rv.id}-step-${step}`);

    // Dynamic strategy pivot on macro regimes or power tariff shocks
    let nextStrategy: RivalStrategy = rv.strategy;
    let action = rv.lastActionSummary;
    let decisions = rv.decisions ?? [];
    const record = (summary: string) => {
      action = summary;
      decisions = [{ step, summary }, ...decisions].slice(0, 8);
    };
    if (step > 0 && step % 15 === 0) {
      if ((marketRegime === 'CRYPTO_WINTER' || powerRateMult > 1.15) && rv.strategy === 'RAPID_EXPANSION') {
        nextStrategy = powerRateMult > 1.15 ? 'CHEAP_POWER' : 'LOW_OVERHEAD';
        record(`Pivoted to ${getRivalStrategyLabel(nextStrategy)} (margin defense)`);
      } else if (
        (marketRegime === 'MANIA_PEAK' || marketRegime === 'BULL_RUN') &&
        (rv.strategy === 'LOW_OVERHEAD' || rv.strategy === 'CHEAP_POWER') &&
        rv.cashReserveUsd > 22000
      ) {
        nextStrategy = rng() < 0.55 ? 'RAPID_EXPANSION' : 'EFFICIENT_HARDWARE';
        record(`Pivoted to ${getRivalStrategyLabel(nextStrategy)} (bull surge)`);
      }
    }

    // Strategy-driven operating economics
    const powerDiscount = nextStrategy === 'CHEAP_POWER' ? 0.68 : 1.0;
    const overheadMult = nextStrategy === 'LOW_OVERHEAD' ? 0.72 : 1.0;
    const qualityMult = nextStrategy === 'EFFICIENT_HARDWARE' ? 1.18 : 1.0;
    const primary = market?.coins[rv.specialtyCoin];
    const secondary = rv.secondaryCoin ? market?.coins[rv.secondaryCoin] : undefined;
    const deskReturn = (coin: GameState['coins'][CoinSymbol] | undefined) => coin
      ? Math.min(1.65, Math.max(0.45, (coin.priceUsd / Math.max(0.01, coin.basePriceUsd)) /
        Math.sqrt(Math.max(0.5, coin.networkDifficulty))))
      : 1;
    const grossStepRev = rv.hashPowerIndex * 18 * qualityMult * regimeProfitMult *
      (deskReturn(primary) * 0.76 + deskReturn(secondary ?? primary) * 0.24);
    const effectiveTariff = (rv.powerDealUntilStep ?? 0) >= step ? Math.min(powerRateMult, 1.02) : powerRateMult;
    const stepOpCost =
      (rv.rigCount * 36 * powerDiscount * effectiveTariff + rv.facilityTierIndex * 95) * overheadMult;
    const next: RivalSyndicate = {
      ...rv,
      strategy: nextStrategy,
      cashReserveUsd: Math.max(0, Math.round(rv.cashReserveUsd + grossStepRev - stepOpCost)),
    };
    const project = rv.project;
    if (project && step >= project.completesAt) {
      next.project = undefined;
      switch (project.kind) {
        case 'EXPAND': {
          const idx = Math.min(FACILITY_TIERS.length - 1, rv.facilityTierIndex + 1);
          next.facilityTierIndex = idx;
          next.powerCapacityKw = FACILITY_TIERS[idx].maxPowerKw;
          record(`Expanded into ${FACILITY_TIERS[idx].name}. New rack space is available.`);
          break;
        }
        case 'ADD_RACKS': {
          const added = Math.max(0, Math.min(3, FACILITY_TIERS[rv.facilityTierIndex].maxRigs - rv.rigCount));
          next.rigCount += added;
          next.hashPowerIndex += Math.round(added * (4 + next.hardwareQuality * 2));
          record(`Commissioned ${added} rack(s) for ${rv.specialtyCoin}`);
          break;
        }
        case 'REFIT':
          next.hardwareQuality = Math.min(4, Number((rv.hardwareQuality + (rv.archetype === 'SILICON_CARTEL' ? 0.18 : 0.12)).toFixed(2)));
          next.hashPowerIndex += Math.round(next.rigCount * (next.hardwareQuality - rv.hardwareQuality) * 4);
          record(`Refitted ${rv.specialtyCoin} racks to Q${next.hardwareQuality.toFixed(2)} silicon`);
          break;
        case 'SWITCH_COIN':
          if (project.targetCoin && project.targetCoin !== rv.specialtyCoin) {
            next.specialtyCoin = project.targetCoin;
            next.secondaryCoin = rv.specialtyCoin;
            record(`Shifted its main desk from ${rv.specialtyCoin} to ${project.targetCoin}${project.followsPlayer ? ' to compete with your fleet' : ''}`);
          }
          break;
        case 'LOCK_POWER':
          next.powerDealUntilStep = step + 24;
          record('Secured a 24-step fixed-rate power deal');
          break;
      }
    }
    const capacity = Math.max(40, next.rigCount * (7 + next.hardwareQuality * 4));
    if (next.cashReserveUsd <= 0) {
      next.hashPowerIndex *= 0.985;
    } else if (next.hashPowerIndex < capacity && grossStepRev > stepOpCost) {
      const growth = Math.max(0, rv.baseGrowthRate - 1) * rivalGrowthMult *
        (0.28 + rng() * 0.34) * (regimeProfitMult > 0.8 ? 1 : 0.45);
      next.hashPowerIndex = Math.min(capacity, next.hashPowerIndex * (1 + growth));
    }
    next.hashPowerIndex = Math.max(20, Math.min(999_999, Math.round(next.hashPowerIndex)));

    const decisionOffset = Math.floor(createSeededRng(`${runSeed}-rival-review-${rv.id}`)() * 8);
    if (!project && (step + decisionOffset) % 8 === 0) {
      if (grossStepRev < stepOpCost && next.cashReserveUsd < stepOpCost * 3 && next.rigCount > 2) {
        const sold = Math.min(3, next.rigCount - 2);
        next.hashPowerIndex = Math.max(20, Math.round(next.hashPowerIndex * (1 - sold / next.rigCount)));
        next.rigCount -= sold;
        next.cashReserveUsd += 800 * sold;
        record(`Sold ${sold} rack(s) to cover operating costs`);
      } else {
        const proposal = chooseRivalProject(next, step, powerRateMult, market);
        if (proposal) {
          next.project = proposal;
          next.cashReserveUsd -= proposal.costUsd;
        }
      }
    }
    return { ...next, lastActionSummary: action, decisions };
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

export function hasRivalIntel(rival: RivalSyndicate, step: number): boolean {
  return (rival.intelRevealedUntilStep ?? 0) > step;
}

export function formatRivalIntel(state: GameState, rival: RivalSyndicate): string {
  if (!hasRivalIntel(rival, state.stepCount)) return `Recon is needed for ${rival.name}. Use "rivals investigate <#>".`;
  const windows = (rival.intelRevealedUntilStep ?? 0) - state.stepCount;
  const project = rival.project;
  const nextMove = project
    ? `Plans to ${getRivalProjectLabel(rival, project)} in ${Math.max(1, project.completesAt - state.stepCount)} steps. ${formatUsd(project.costUsd)} committed.${project.followsPlayer ? ' Following your highest-earning desk.' : ''}${rival.disruptedSteps > 0 ? ' Work is paused.' : ''}`
    : 'No funded project on the books.';
  const specialty = rival.secondaryCoin && rival.secondaryCoin !== rival.specialtyCoin
    ? `${rival.specialtyCoin} 76% · ${rival.secondaryCoin} 24%`
    : rival.specialtyCoin;
  return [
    `INTEL DOSSIER · ${rival.name} · ${windows} steps remaining`,
    `  Site & fleet   ${FACILITY_TIERS[rival.facilityTierIndex]?.name} · ${rival.rigCount} rigs · Q${rival.hardwareQuality.toFixed(2)} silicon · ${rival.powerCapacityKw} kW`,
    `  Liquid cash   ${formatUsd(rival.cashReserveUsd)} after project commitments`,
    `  Mining desks  ${specialty}`,
    `  Next move     ${nextMove}`,
    ...((rival.powerDealUntilStep ?? 0) > state.stepCount ? [`  Power deal    Fixed rate for ${(rival.powerDealUntilStep ?? 0) - state.stepCount} more steps`] : []),
  ].join('\n');
}

export function formatRivalMarkets(state: GameState, selectedCoin?: CoinSymbol): string {
  const symbols = selectedCoin ? [selectedCoin] : Object.keys(state.coins) as CoinSymbol[];
  return [
    '  COIN   DIFFICULTY   RIVAL RISE/STEP   ACTIVE RIVALS                     YOUR RIGS',
    ...symbols.map((symbol) => {
      const coin = state.coins[symbol];
      const rivals = state.rivals.map((rival) => ({ rival, pressure: getRivalCoinPressure(rival, symbol) }))
        .filter((entry) => entry.pressure > 0).sort((a, b) => b.pressure - a.pressure);
      const leaders = rivals.map(({ rival, pressure }) => `${rival.name} (${Math.round(pressure)})`).join(', ') || 'Open field';
      const rigCount = state.rigs.filter((rig) => rig.enabled && rig.status !== 'FAILED' && rig.targetCoin === symbol).length;
      return `  ${symbol.padEnd(6)} ${`${coin.networkDifficulty.toFixed(2)}x`.padStart(10)}   ${`+${(getRivalDifficultyRise(state.rivals, symbol) * 100).toFixed(3)}%`.padStart(15)}   ${leaders} · ${rigCount}${coin.unlocked ? '' : ' (desk locked)'}`;
    }),
    '',
    '  Parentheses show each rival’s active hash index on that coin. The listed rise is above normal network growth.',
  ].join('\n');
}

export function investigateRivalSyndicate(
  state: GameState,
  rivalIdx: number
): { ok: boolean; nextState: GameState; summary: string; cost: number } {
  const rival = state.rivals[rivalIdx];
  if (!rival) {
    return { ok: false, nextState: state, summary: `Rival #${rivalIdx + 1} not found.`, cost: 0 };
  }
  if (hasRivalIntel(rival, state.stepCount)) {
    return { ok: true, nextState: state, summary: formatRivalIntel(state, rival), cost: 0 };
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

  const summary = [
    `Recon opened for ${formatUsd(cost)} · +4 RP`,
    formatRivalIntel(nextState, nextRivals[rivalIdx]),
    `  Reopen with "rivals intel ${rivalIdx + 1}" while this window is active.`,
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
          : hasRivalIntel(rv, state.stepCount)
          ? 'INTEL ACTIVE'
          : 'ACTIVE',
    })),
  ].sort((a, b) => b.hashPowerIndex - a.hashPowerIndex);

  return entries;
}
