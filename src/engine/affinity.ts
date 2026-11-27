import { RESEARCH_NODES } from '../data/catalog';
import {
  BusinessId,
  GameState,
  IndustryAffinityProfile,
} from '../types/game';

export const BUSINESS_ORDER: readonly BusinessId[] = [
  'MINING',
  'MARKET_INTEL',
  'HARDWARE_ENG',
  'MANUFACTURING',
  'MINING_SERVICES',
  'UNDERGROUND',
] as const;

export interface BusinessCatalogEntry {
  id: BusinessId;
  code: string;
  name: string;
  shortName: string;
  sector: string;
  summary: string;
  keyFocus: string;
}

export const BUSINESS_CATALOG: Record<BusinessId, BusinessCatalogEntry> = {
  MINING: {
    id: 'MINING',
    code: 'B1',
    name: 'Cryptocurrency Mining',
    shortName: 'Mining',
    sector: 'Digital Hash Infrastructure',
    summary: 'Operate mining facilities, build/maintain rigs, manage power & cooling, and optimize block output.',
    keyFocus: 'Fleet scale, energy efficiency, rig engineering & profitability.',
  },
  MARKET_INTEL: {
    id: 'MARKET_INTEL',
    code: 'B2',
    name: 'Market Intelligence',
    shortName: 'Market Intel',
    sector: 'Quantitative Analytics & Data',
    summary: 'Develop forecasting models, sell market data subscriptions & prediction software, and advise internal trading.',
    keyFocus: 'Analysts, exchange volume, PR sentiment shifts & forecast analysis.',
  },
  HARDWARE_ENG: {
    id: 'HARDWARE_ENG',
    code: 'B3',
    name: 'Hardware Engineering',
    shortName: 'HW Engineering',
    sector: 'Semiconductor & Systems R&D',
    summary: 'Design GPUs, ASICs, cooling and power systems, validate prototypes, and license IP externally or to Manufacturing.',
    keyFocus: 'Blueprint engineering, prototype validation, tinkering & hardware R&D.',
  },
  MANUFACTURING: {
    id: 'MANUFACTURING',
    code: 'B4',
    name: 'Manufacturing',
    shortName: 'Manufacturing',
    sector: 'Semiconductor Fabrication & Assembly',
    summary: 'Run fab lines, execute QA batches with serial genealogy, sell OEM hardware, and supply sister divisions.',
    keyFocus: 'Production throughput, yield quality, batch management & equipment maintenance.',
  },
  MINING_SERVICES: {
    id: 'MINING_SERVICES',
    code: 'B5',
    name: 'Mining Services',
    shortName: 'Mining Services',
    sector: 'Pools, Colocation & Compute Hosting',
    summary: 'Operate commercial mining pools, lease colocation racks, rent compute capacity, and fulfill high-uptime SLAs.',
    keyFocus: 'Contract reliability, multi-room infrastructure, high uptime & reputation.',
  },
  UNDERGROUND: {
    id: 'UNDERGROUND',
    code: 'B6',
    name: 'Underground Operations',
    shortName: 'Underground',
    sector: 'Covert Arbitrage & Black Market',
    summary: 'Coordinate black-market procurement, shell-coin engineering, shadow hash networks, and risk shielding.',
    keyFocus: 'Covert operations, black market deals, scrutiny management & illicit mods.',
  },
};

export type AffinitySignalMap = Partial<Record<BusinessId, number>>;

export function createZeroBusinessRecord(initial = 0): Record<BusinessId, number> {
  return {
    MINING: initial,
    MARKET_INTEL: initial,
    HARDWARE_ENG: initial,
    MANUFACTURING: initial,
    MINING_SERVICES: initial,
    UNDERGROUND: initial,
  };
}

export function computeDominantAffinity(scores: Record<BusinessId, number>): BusinessId {
  let bestId: BusinessId = 'MINING';
  let bestScore = -Infinity;
  for (const id of BUSINESS_ORDER) {
    const score = scores[id] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

export function buildDefaultAffinityProfile(
  seed?: Partial<IndustryAffinityProfile>
): IndustryAffinityProfile {
  const scores = createZeroBusinessRecord(0);
  const signalCounts = createZeroBusinessRecord(0);

  for (const id of BUSINESS_ORDER) {
    const s = seed?.scores?.[id];
    const c = seed?.signalCounts?.[id];
    scores[id] = typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : 0;
    signalCounts[id] =
      typeof c === 'number' && Number.isFinite(c) && c >= 0 ? Math.floor(c) : 0;
  }

  return {
    scores,
    signalCounts,
    lastUpdatedStep:
      typeof seed?.lastUpdatedStep === 'number' && Number.isFinite(seed.lastUpdatedStep)
        ? seed.lastUpdatedStep
        : 0,
    dominantBusinessId: computeDominantAffinity(scores),
  };
}

/**
 * Applies deterministic behavioral deltas to the hidden IndustryAffinityProfile.
 * Positive signals increment both score and behavioral signal count.
 */
export function recordAffinitySignals(
  profile: IndustryAffinityProfile,
  deltas: AffinitySignalMap,
  stepCount: number
): IndustryAffinityProfile {
  const nextScores = { ...profile.scores };
  const nextCounts = { ...profile.signalCounts };
  let changed = false;

  for (const id of BUSINESS_ORDER) {
    const delta = deltas[id];
    if (typeof delta === 'number' && Number.isFinite(delta) && delta > 0) {
      nextScores[id] = Number(((nextScores[id] ?? 0) + delta).toFixed(3));
      nextCounts[id] = (nextCounts[id] ?? 0) + 1;
      changed = true;
    }
  }

  if (!changed) {
    return profile;
  }

  return {
    scores: nextScores,
    signalCounts: nextCounts,
    lastUpdatedStep: stepCount,
    dominantBusinessId: computeDominantAffinity(nextScores),
  };
}

/**
 * Derives hidden affinity increments from a single simulation step without consuming RNG.
 */
export function computeStepBehavioralSignals(
  prev: GameState,
  next: GameState
): AffinitySignalMap {
  const deltas: AffinitySignalMap = {};

  const activeRigs = next.rigs.filter((r) => r.enabled && r.status !== 'FAILED');
  if (activeRigs.length > 0) {
    deltas.MINING = Number((0.45 + Math.min(2.0, activeRigs.length * 0.16)).toFixed(3));
  }

  const analysts = next.employees.filter((e) => e.role === 'ANALYST').length;
  const prActive = next.activeCampaigns.length;
  const openOrders = (next.limitOrders?.length ?? 0) + (next.shortPositions?.length ?? 0);
  const heldCoins = Object.values(next.wallet ?? {}).filter((qty) => qty > 0).length;
  const marketScore =
    analysts * 0.9 +
    prActive * 0.8 +
    Math.min(1.5, openOrders * 0.45) +
    Math.min(0.8, heldCoins * 0.2) +
    ((next.coins && Object.values(next.coins).some((c) => c.isPlayerCreated)) ? 0.4 : 0);
  if (marketScore > 0) {
    deltas.MARKET_INTEL = Number(marketScore.toFixed(3));
  }

  const researchers = next.employees.filter((e) => e.role === 'RESEARCHER').length;
  const sysEng = next.employees.filter((e) => e.role === 'SYS_ENGINEER').length;
  const blueprintsCount = (next.fab?.blueprints.length ?? 0) + (next.fab?.draftBlueprints?.length ?? 0);
  const prototypesTested = (next.fab?.blueprints ?? []).filter((b) => Boolean(b.prototypeReport)).length;
  const tunedRigs = next.rigs.filter((r) => r.overclockPct !== 100 || Boolean(r.customParts)).length;
  const hwCoolingResearch = next.unlockedResearch.filter((id) => {
    const node = RESEARCH_NODES.find((n) => n.id === id);
    return node && (node.category === 'HARDWARE' || node.category === 'COOLING');
  }).length;
  const engScore =
    researchers * 0.55 +
    sysEng * 0.45 +
    Math.min(1.8, blueprintsCount * 0.3 + prototypesTested * 0.45) +
    Math.min(1.0, tunedRigs * 0.22) +
    Math.min(1.2, hwCoolingResearch * 0.12) +
    (next.activeResearchId ? 0.35 : 0);
  if (engScore > 0) {
    deltas.HARDWARE_ENG = Number(engScore.toFixed(3));
  }

  const fabLines = next.fab?.linesCount ?? 0;
  const prodOrders = next.fab?.productionQueue.length ?? 0;
  const unitsBuiltDelta = Math.max(
    0,
    (next.fab?.totalUnitsManufactured ?? 0) - (prev.fab?.totalUnitsManufactured ?? 0)
  );
  const repairsDelta = Math.max(
    0,
    (next.stats?.repairsCompleted ?? 0) - (prev.stats?.repairsCompleted ?? 0)
  );
  const mfgScore =
    fabLines * 0.75 +
    prodOrders * 0.85 +
    unitsBuiltDelta * 0.7 +
    repairsDelta * 0.45 +
    Math.min(0.9, (next.fab?.batchRecords?.length ?? 0) * 0.25);
  if (mfgScore > 0) {
    deltas.MANUFACTURING = Number(mfgScore.toFixed(3));
  }

  const slaContractActive =
    next.activeContract &&
    ['POOL_HASH', 'UPTIME_STREAK', 'MAINTENANCE_SLA', 'LOW_NOISE_RUN', 'FACILITY_EXPANSION'].includes(
      next.activeContract.type
    )
      ? 0.9
      : 0;
  const completedContractsDelta = Math.max(
    0,
    (next.stats?.contractsCompleted ?? 0) - (prev.stats?.contractsCompleted ?? 0)
  );
  const poolDiversity = new Set(activeRigs.map((r) => r.poolMode)).size;
  const avgHealth =
    activeRigs.length > 0
      ? activeRigs.reduce((s, r) => s + r.healthPct, 0) / activeRigs.length
      : 0;
  const servicesScore =
    slaContractActive +
    completedContractsDelta * 1.4 +
    (next.facilityExtraRooms ?? 0) * 0.4 +
    (poolDiversity > 1 ? 0.35 : 0) +
    (avgHealth >= 88 && activeRigs.length >= 2 ? 0.35 : 0) +
    (next.mediaCredibility >= 60 ? 0.25 : 0);
  if (servicesScore > 0) {
    deltas.MINING_SERVICES = Number(servicesScore.toFixed(3));
  }

  const ug = next.underground;
  const ugRecordsDelta = Math.max(
    0,
    (ug?.operationRecords?.length ?? 0) - (prev.underground?.operationRecords?.length ?? 0)
  );
  const illicitRigs = next.rigs.filter((r) => Boolean(r.illicitMod)).length;
  const activeShells = (ug?.shellCoins ?? []).filter((c) => c.stage !== 'COLLAPSED' && c.stage !== 'RUGGED').length;
  const ugScore =
    (ug?.powerSiphonActive ? 1.1 : 0) +
    ((ug?.botnetStepsRemaining ?? 0) > 0 ? 1.3 : 0) +
    ((ug?.raidStepsRemaining ?? 0) > 0 ? 1.2 : 0) +
    activeShells * 0.75 +
    illicitRigs * 0.45 +
    ugRecordsDelta * 1.6 +
    (next.regulatoryScrutiny >= 25 ? 0.3 : 0);
  if (ugScore > 0) {
    deltas.UNDERGROUND = Number(ugScore.toFixed(3));
  }

  return deltas;
}

/**
 * Deterministic legacy backfill for pre-Phase-2 saves or mid-game scenarios.
 * Computes historical affinity strictly from persisted achievements/assets without consuming RNG.
 */
export function backfillAffinityFromState(state: GameState): IndustryAffinityProfile {
  const scores = createZeroBusinessRecord(0);
  const signalCounts = createZeroBusinessRecord(0);

  const stepWeight = Math.max(1, state.stepCount);
  scores.MINING = Number(
    (
      Math.min(40, stepWeight * 0.35) +
      state.rigs.length * 4.5 +
      (state.ownedFacilityIds?.length ?? 1) * 3.0
    ).toFixed(2)
  );
  signalCounts.MINING = Math.max(1, state.rigs.length);

  const analysts = state.employees.filter((e) => e.role === 'ANALYST').length;
  const customCoins = Object.values(state.coins ?? {}).filter((c) => c.isPlayerCreated).length;
  scores.MARKET_INTEL = Number(
    (
      analysts * 10 +
      (state.activeCampaigns?.length ?? 0) * 6 +
      ((state.limitOrders?.length ?? 0) + (state.shortPositions?.length ?? 0)) * 5 +
      customCoins * 8 +
      (state.unlockedResearch.includes('res_quant_forecasting') ? 10 : 0)
    ).toFixed(2)
  );
  signalCounts.MARKET_INTEL = analysts + customCoins;

  const blueprints = state.fab?.blueprints.length ?? 0;
  const protos = (state.fab?.blueprints ?? []).filter((b) => Boolean(b.prototypeReport)).length;
  const hwNodes = state.unlockedResearch.filter((id) => {
    const n = RESEARCH_NODES.find((node) => node.id === id);
    return n && (n.category === 'HARDWARE' || n.category === 'COOLING');
  }).length;
  scores.HARDWARE_ENG = Number(
    (blueprints * 8 + protos * 6 + hwNodes * 3.5).toFixed(2)
  );
  signalCounts.HARDWARE_ENG = blueprints + hwNodes;

  const fabLines = state.fab?.linesCount ?? 0;
  const unitsBuilt = state.fab?.totalUnitsManufactured ?? 0;
  scores.MANUFACTURING = Number(
    (
      fabLines * 10 +
      unitsBuilt * 1.5 +
      (state.stats?.repairsCompleted ?? 0) * 2
    ).toFixed(2)
  );
  signalCounts.MANUFACTURING = fabLines + (state.fab?.batchRecords?.length ?? 0);

  scores.MINING_SERVICES = Number(
    (
      (state.stats?.contractsCompleted ?? 0) * 5.5 +
      (state.facilityExtraRooms ?? 0) * 4 +
      (state.unlockedResearch.includes('res_enterprise_sla') ? 10 : 0)
    ).toFixed(2)
  );
  signalCounts.MINING_SERVICES = state.stats?.contractsCompleted ?? 0;

  const ugCount =
    (state.stats?.covertOpsCount ?? 0) + (state.underground?.operationRecords?.length ?? 0);
  scores.UNDERGROUND = Number(
    (
      ugCount * 7 +
      (state.underground?.shellCoins?.length ?? 0) * 6 +
      (state.underground?.scandalMarks ?? 0) * 5
    ).toFixed(2)
  );
  signalCounts.UNDERGROUND = ugCount;

  return {
    scores,
    signalCounts,
    lastUpdatedStep: state.stepCount,
    dominantBusinessId: computeDominantAffinity(scores),
  };
}

export interface RankedAffinityEntry {
  businessId: BusinessId;
  score: number;
  sharePct: number;
}

export function getRankedAffinityBusinesses(
  profile: IndustryAffinityProfile,
  options?: { excludeIds?: BusinessId[] }
): RankedAffinityEntry[] {
  const excluded = new Set(options?.excludeIds ?? []);
  const candidates = BUSINESS_ORDER.filter((id) => !excluded.has(id));
  const total = candidates.reduce((sum, id) => sum + Math.max(0, profile.scores[id] ?? 0), 0);

  return candidates
    .map((businessId) => {
      const score = Math.max(0, profile.scores[businessId] ?? 0);
      const sharePct = total > 0 ? Number(((score / total) * 100).toFixed(1)) : 0;
      return { businessId, score, sharePct };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return BUSINESS_ORDER.indexOf(a.businessId) - BUSINESS_ORDER.indexOf(b.businessId);
    });
}
