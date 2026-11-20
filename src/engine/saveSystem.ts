import { createInitialCoins } from '../data/history';
import { FACILITY_TIERS, RESEARCH_NODES } from '../data/catalog';
import {
  CoinSymbol,
  EmpireStats,
  GameState,
  HiredEmployee,
  MiningRig,
  SaveFileEnvelope,
} from '../types/game';
import { generateRandomSeed } from '../utils/rng';
import { buildDefaultWallet } from './exchange';
import { buildDefaultFab } from './fab';
import { createInitialRivals } from './rivals';
import { buildDefaultWorld } from './world';
import {
  computeAverageRigHealth,
  ensureRigComponentHealth,
  generateUsedMarketListings,
} from './usedMarket';

export const CAREER_STORAGE_KEY = 'blockworks_tycoon_save_v2';
export const CAREER_BACKUP_KEY = 'blockworks_tycoon_backup_v2';
export const SANDBOX_STORAGE_KEY = 'blockworks_tycoon_sandbox_v2';
export const SANDBOX_BACKUP_KEY = 'blockworks_tycoon_sandbox_backup_v2';

export function buildDefaultStats(prev?: Partial<EmpireStats>): EmpireStats {
  return {
    soloBlocksHit: prev?.soloBlocksHit ?? 0,
    contractsCompleted: prev?.contractsCompleted ?? 0,
    contractsFailed: prev?.contractsFailed ?? 0,
    covertOpsCount: prev?.covertOpsCount ?? 0,
    raidsSurvived: prev?.raidsSurvived ?? 0,
    totalFinesAndBribesUsd: prev?.totalFinesAndBribesUsd ?? 0,
    totalRevenueUsd: prev?.totalRevenueUsd ?? 0,
    totalElectricityCostUsd: prev?.totalElectricityCostUsd ?? 0,
    totalMaintenanceCostUsd: prev?.totalMaintenanceCostUsd ?? 0,
    totalPayrollCostUsd: prev?.totalPayrollCostUsd ?? 0,
    totalHardwareSpendUsd: prev?.totalHardwareSpendUsd ?? 0,
    totalHardwareSalesUsd: prev?.totalHardwareSalesUsd ?? 0,
    totalFacilitySpendUsd: prev?.totalFacilitySpendUsd ?? 0,
    totalResearchSpendUsd: prev?.totalResearchSpendUsd ?? 0,
    totalCoolingSpendUsd: prev?.totalCoolingSpendUsd ?? 0,
    totalContractIncomeUsd: prev?.totalContractIncomeUsd ?? 0,
    peakFleetHashScore: prev?.peakFleetHashScore ?? 0,
    equipmentFailuresCount: prev?.equipmentFailuresCount ?? 0,
    repairsCompleted: prev?.repairsCompleted ?? 0,
    rigPurchasesCount: prev?.rigPurchasesCount ?? 0,
    usedRigPurchasesCount: prev?.usedRigPurchasesCount ?? 0,
    maxPowerKwObserved: prev?.maxPowerKwObserved ?? 0,
    pristineHealthStreak: prev?.pristineHealthStreak ?? 0,
    usedOnlyEligible: prev?.usedOnlyEligible ?? true,
  };
}

function migrateRig(r: MiningRig, idx: number): MiningRig {
  const componentHealth = ensureRigComponentHealth(r);
  const avgHealth = computeAverageRigHealth(componentHealth);
  return {
    ...r,
    gridX: typeof r.gridX === 'number' ? r.gridX : 1 + (idx % 4),
    gridY: typeof r.gridY === 'number' ? r.gridY : 1 + Math.floor(idx / 4),
    poolMode: r.poolMode ?? 'PPS',
    firmwareProfile: r.firmwareProfile ?? 'BALANCED',
    pasteStepsRemaining: typeof r.pasteStepsRemaining === 'number' ? r.pasteStepsRemaining : 8,
    soloBlocksWon: typeof r.soloBlocksWon === 'number' ? r.soloBlocksWon : 0,
    lastStepBlockHit: Boolean(r.lastStepBlockHit),
    illicitMod: r.illicitMod ?? null,
    payoutMode: r.payoutMode === 'HOLD' ? 'HOLD' : 'AUTOSELL',
    customAsicSpec: r.customAsicSpec,
    lastStepCoins: typeof r.lastStepCoins === 'number' ? r.lastStepCoins : 0,
    lastStepUsd: typeof r.lastStepUsd === 'number' ? r.lastStepUsd : 0,
    totalEarnedUsd: typeof r.totalEarnedUsd === 'number' ? r.totalEarnedUsd : 0,
    healthPct: avgHealth,
    componentHealth,
    conditionTier: r.conditionTier ?? 'NEW',
    ageSteps: typeof r.ageSteps === 'number' ? r.ageSteps : 0,
    failureCount: typeof r.failureCount === 'number' ? r.failureCount : 0,
  };
}

function migrateEmployee(e: HiredEmployee): HiredEmployee {
  return {
    ...e,
    skillLevel: typeof e.skillLevel === 'number' ? e.skillLevel : 1,
    experienceXp: typeof e.experienceXp === 'number' ? e.experienceXp : 0,
  };
}

export function hydrateSavedState(rawInput: unknown): GameState | null {
  try {
    if (!rawInput || typeof rawInput !== 'object') return null;
    const obj = rawInput as Record<string, unknown>;
    const candidate =
      obj.format === 'BLOCKWORKS_SAVE_V2' && obj.state && typeof obj.state === 'object'
        ? (obj.state as Partial<GameState> & { dayCount?: number })
        : (obj as Partial<GameState> & { dayCount?: number });

    if (
      typeof candidate.cash !== 'number' ||
      !Number.isFinite(candidate.cash) ||
      !candidate.coins ||
      typeof candidate.coins !== 'object' ||
      !Array.isArray(candidate.rigs)
    ) {
      return null;
    }

    const runSeed = typeof candidate.runSeed === 'string' && candidate.runSeed ? candidate.runSeed : generateRandomSeed();
    const defaultCoins = createInitialCoins(runSeed);
    const migratedCoins = { ...defaultCoins };
    (Object.keys(defaultCoins) as CoinSymbol[]).forEach((sym) => {
      const savedCoin = candidate.coins?.[sym];
      if (savedCoin && typeof savedCoin.tier === 'number' && typeof savedCoin.priceUsd === 'number') {
        migratedCoins[sym] = {
          ...defaultCoins[sym],
          ...savedCoin,
        };
      }
    });

    const stepCount =
      typeof candidate.stepCount === 'number' && Number.isFinite(candidate.stepCount)
        ? candidate.stepCount
        : typeof candidate.dayCount === 'number'
        ? candidate.dayCount
        : 0;

    const validFacility = FACILITY_TIERS.some((f) => f.id === candidate.facilityId)
      ? (candidate.facilityId as string)
      : 'fac_bedroom';

    const validResearchIds = new Set(RESEARCH_NODES.map((n) => n.id));
    const unlockedResearch = Array.isArray(candidate.unlockedResearch)
      ? candidate.unlockedResearch.filter((id): id is string => typeof id === 'string' && validResearchIds.has(id))
      : [];

    const hydrated: GameState = {
      mode: candidate.mode === 'PLAYING' ? 'PLAYING' : 'TITLE_MENU',
      difficulty: candidate.difficulty ?? 'STANDARD',
      isSandbox: Boolean(candidate.isSandbox) || candidate.difficulty === 'SANDBOX',
      sandboxConfig: candidate.sandboxConfig,
      runSeed,
      stepCount,
      soundEnabled: candidate.soundEnabled !== false,
      cash: candidate.cash,
      researchPoints: typeof candidate.researchPoints === 'number' ? candidate.researchPoints : 0,
      unlockedResearch,
      activeResearchId:
        typeof candidate.activeResearchId === 'string' && validResearchIds.has(candidate.activeResearchId)
          ? candidate.activeResearchId
          : null,
      activeResearchProgress:
        typeof candidate.activeResearchProgress === 'number' ? candidate.activeResearchProgress : 0,
      facilityId: validFacility,
      ownedFacilityIds: Array.isArray(candidate.ownedFacilityIds) && candidate.ownedFacilityIds.length > 0
        ? candidate.ownedFacilityIds
        : ['fac_bedroom'],
      facilityUpgrades: candidate.facilityUpgrades ?? {},
      facilityExtraRooms:
        typeof candidate.facilityExtraRooms === 'number' && Number.isFinite(candidate.facilityExtraRooms)
          ? Math.max(0, Math.min(2, Math.floor(candidate.facilityExtraRooms)))
          : 0,
      powerContractId: candidate.powerContractId ?? 'contract_standard',
      rigs: candidate.rigs.map((r, i) => migrateRig(r, i)),
      backupRigs: Array.isArray(candidate.backupRigs)
        ? candidate.backupRigs.map((r, i) => migrateRig(r, i))
        : [],
      coolingUnits: Array.isArray(candidate.coolingUnits) ? candidate.coolingUnits : [],
      usedMarketListings: Array.isArray(candidate.usedMarketListings)
        ? candidate.usedMarketListings
        : [],
      usedMarketRefreshStep:
        typeof candidate.usedMarketRefreshStep === 'number'
          ? candidate.usedMarketRefreshStep
          : stepCount + 8,
      activeMarketModifiers: Array.isArray(candidate.activeMarketModifiers)
        ? candidate.activeMarketModifiers
        : [],
      coins: migratedCoins,
      marketRegime: candidate.marketRegime ?? 'ACCUMULATION',
      regimeStepsRemaining:
        typeof candidate.regimeStepsRemaining === 'number' ? candidate.regimeStepsRemaining : 14,
      employees: Array.isArray(candidate.employees)
        ? candidate.employees.map(migrateEmployee)
        : [],
      strikeStepsRemaining:
        typeof candidate.strikeStepsRemaining === 'number'
          ? Math.max(0, candidate.strikeStepsRemaining)
          : 0,
      mediaCredibility:
        typeof candidate.mediaCredibility === 'number' ? candidate.mediaCredibility : 40,
      regulatoryScrutiny:
        typeof candidate.regulatoryScrutiny === 'number' ? candidate.regulatoryScrutiny : 4,
      activeCampaigns: Array.isArray(candidate.activeCampaigns) ? candidate.activeCampaigns : [],
      campaignCooldowns: candidate.campaignCooldowns ?? {},
      rivals:
        Array.isArray(candidate.rivals) && candidate.rivals.length > 0
          ? candidate.rivals.map((rv, idx) => ({
              ...createInitialRivals(runSeed)[idx % 4],
              ...rv,
            }))
          : createInitialRivals(runSeed),
      availableContracts: Array.isArray(candidate.availableContracts)
        ? candidate.availableContracts
        : [],
      activeContract: candidate.activeContract ?? null,
      underground: {
        powerSiphonActive: false,
        botnetCoin: null,
        botnetBonusHash: 0,
        botnetStepsRemaining: 0,
        washCooldownStep: 0,
        launderCooldownStep: 0,
        bribeProtectionSteps: 0,
        blackMarketListings: [],
        blackMarketRefreshStep: stepCount + 15,
        shellCoins: [],
        raidCooldownStep: 0,
        ...(candidate.underground ?? {}),
      },
      pendingEvent: candidate.pendingEvent ?? null,
      ledger: Array.isArray(candidate.ledger)
        ? candidate.ledger.map((l) => ({
            ...l,
            maintenanceCostUsd:
              typeof l.maintenanceCostUsd === 'number' ? l.maintenanceCostUsd : 0,
          }))
        : [],
      transactions: Array.isArray(candidate.transactions) ? candidate.transactions : [],
      performanceHistory: Array.isArray(candidate.performanceHistory)
        ? candidate.performanceHistory
        : [],
      currentCycleStats: {
        miningRevenueUsd: candidate.currentCycleStats?.miningRevenueUsd ?? 0,
        electricitySpendUsd: candidate.currentCycleStats?.electricitySpendUsd ?? 0,
        maintenanceSpendUsd: candidate.currentCycleStats?.maintenanceSpendUsd ?? 0,
        otherSpendUsd: candidate.currentCycleStats?.otherSpendUsd ?? 0,
      },
      unlockedMilestones: Array.isArray(candidate.unlockedMilestones)
        ? candidate.unlockedMilestones
        : [],
      unlockedAchievements: Array.isArray(candidate.unlockedAchievements)
        ? candidate.unlockedAchievements
        : [],
      activeChallengeId: candidate.activeChallengeId ?? null,
      completedChallenges: Array.isArray(candidate.completedChallenges)
        ? candidate.completedChallenges
        : [],
      failedChallenges: Array.isArray(candidate.failedChallenges)
        ? candidate.failedChallenges
        : [],
      news: Array.isArray(candidate.news) ? candidate.news : [],
      competitorTechScore:
        typeof candidate.competitorTechScore === 'number' ? candidate.competitorTechScore : 10,
      noiseFinesTotal:
        typeof candidate.noiseFinesTotal === 'number' ? candidate.noiseFinesTotal : 0,
      stats: buildDefaultStats(candidate.stats),
      tutorialStep: typeof candidate.tutorialStep === 'number' ? candidate.tutorialStep : 0,
      onboardingMode:
        candidate.onboardingMode === 'VETERAN' || candidate.onboardingMode === 'GUIDED'
          ? candidate.onboardingMode
          : stepCount > 5
          ? 'VETERAN'
          : 'GUIDED',
      seenTutorials: Array.isArray(candidate.seenTutorials)
        ? candidate.seenTutorials.filter((id): id is string => typeof id === 'string')
        : [],
      claimedObjectives: Array.isArray(candidate.claimedObjectives)
        ? candidate.claimedObjectives.filter((id): id is string => typeof id === 'string')
        : [],
      devMode: Boolean(candidate.devMode),
      devUnlockAll: Boolean(candidate.devUnlockAll),
      wallet: buildDefaultWallet(candidate.wallet),
      walletCostBasis: buildDefaultWallet(candidate.walletCostBasis),
      limitOrders: Array.isArray(candidate.limitOrders) ? candidate.limitOrders : [],
      shortPositions: Array.isArray(candidate.shortPositions) ? candidate.shortPositions : [],
      fab: buildDefaultFab(candidate.fab),
      scenarioId: candidate.scenarioId,
      world: {
        ...buildDefaultWorld(candidate.runSeed),
        ...(candidate.world && typeof candidate.world === 'object' ? candidate.world : {}),
      },
      seasonHistory: Array.isArray(candidate.seasonHistory) ? candidate.seasonHistory : [],
    };

    if (hydrated.usedMarketListings.length === 0) {
      hydrated.usedMarketListings = generateUsedMarketListings(hydrated);
    }

    return hydrated;
  } catch {
    return null;
  }
}

export function loadSavedState(key = CAREER_STORAGE_KEY): GameState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hydrateSavedState(parsed);
  } catch {
    return null;
  }
}

export function serializeSaveEnvelope(state: GameState): string {
  const envelope: SaveFileEnvelope = {
    format: 'BLOCKWORKS_SAVE_V2',
    exportedAt: new Date().toISOString(),
    version: 2,
    isSandbox: Boolean(state.isSandbox),
    state,
  };
  return JSON.stringify(envelope, null, 2);
}

export function validateAndParseImportedSave(jsonText: string): {
  ok: boolean;
  state?: GameState;
  error?: string;
} {
  if (!jsonText || jsonText.trim().length < 10) {
    return { ok: false, error: 'Save file is empty or unreadable.' };
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Invalid save JSON structure.' };
    }
    const hydrated = hydrateSavedState(parsed);
    if (!hydrated) {
      return {
        ok: false,
        error: 'Validation failed: file is missing valid HASHRATE cash, coins, or rig records.',
      };
    }
    return { ok: true, state: { ...hydrated, mode: 'PLAYING' } };
  } catch {
    return { ok: false, error: 'Malformed JSON file. Existing save was not modified.' };
  }
}

export function createLocalBackup(state: GameState): boolean {
  try {
    const key = state.isSandbox ? SANDBOX_BACKUP_KEY : CAREER_BACKUP_KEY;
    localStorage.setItem(key, serializeSaveEnvelope(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalBackup(sandbox = false): GameState | null {
  return loadSavedState(sandbox ? SANDBOX_BACKUP_KEY : CAREER_BACKUP_KEY);
}

export function clearSavedState(sandbox = false): void {
  try {
    if (sandbox) {
      localStorage.removeItem(SANDBOX_STORAGE_KEY);
    } else {
      localStorage.removeItem(CAREER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}
