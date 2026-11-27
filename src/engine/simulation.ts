import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_PROFILES,
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  FIRMWARE_PROFILE_SPECS,
  GPU_PARTS,
  ILLICIT_MOD_SPECS,
  MARKET_REGIME_SPECS,
  OS_PARTS,
  POOL_MODE_SPECS,
  POWER_CONTRACTS,
  PSU_PARTS,
  RESEARCH_NODES,
  RIG_PRESETS,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from '../data/catalog';
import { createInitialCoins } from '../data/history';
import {
  ActiveMarketModifier,
  BlackMarketListing,
  ChallengeId,
  CoinMarketState,
  CoinSymbol,
  CustomAsicSpec,
  DifficultyLevel,
  EmpireAlignment,
  FabState,
  FacilityTier,
  FacilityUpgradeId,
  GameState,
  IllicitModId,
  LimitOrder,
  MarketModifierType,
  MarketRegime,
  MiningAlgorithm,
  MiningRig,
  NewsItem,
  OnboardingMode,
  PendingEvent,
  PendingEventCategory,
  PlacedCoolingUnit,
  PoolMode,
  PowerContractId,
  PowerContractSpec,
  RepairComponentSlot,
  RigBuildConfig,
  RigComponentHealth,
  SandboxConfig,
  ShortPosition,
  TransactionCategory,
  TransactionEntry,
} from '../types/game';
import { announceGuidedUnlocks, EarlyObjective, evaluateEarlyObjectives, getEffectiveOnboardingMode, recordGuidedProgress } from '../data/onboarding';
import { formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng, generateRandomSeed } from '../utils/rng';
import { generateContractBoard, GUIDED_STARTER_CONTRACT_ID } from './contracts';
import {
  buildDefaultWallet,
  cancelLimitOrder,
  closeShortPosition,
  computeShortEquity,
  executeSpotBuy,
  executeSpotSell,
  formatWalletAndExchangeReport,
  getShortPositionsEquityUsd,
  getSpotExchangeFeePct,
  getWalletMarketValueUsd,
  openShortPosition,
  placeLimitOrder,
  stepExchangeOrdersAndShorts,
} from './exchange';
import {
  checkRigCoinCompatibility,
  createPlayerCoin,
  CreatePlayerCoinInput,
  formatCoinsCatalogReport,
} from './coins';
import {
  buildDefaultFab,
  buildFabLine,
  compareBlueprints,
  CustomBlueprintDesignInput,
  deleteDraftBlueprint,
  deployCustomAsicToRig,
  deployCustomInventoryToRig,
  designCustomChipBlueprint,
  designCustomComponentBlueprint,
  formatBlueprintComparisonReport,
  formatCustomComponentSummaryLine,
  formatFabStatusReport,
  formatManufacturingHistoryReport,
  getFabCycleUpkeep,
  getFabEngineeringPointBudget,
  getFabInventoryValueUsd,
  getFabLineCost,
  getFocusOptionsForDesign,
  getUnlockedFabArchitectures,
  getUnlockedFabCategories,
  getUnlockedFabNodes,
  getUnlockedFabSubFeatures,
  inspectBatchReport,
  inspectSerialReport,
  inventoryItemToCustomSpec,
  isFabUnlocked,
  previewCustomComponentDesign,
  queueFabProduction,
  reviseBlueprint,
  runPrototypeTest,
  saveDraftBlueprint,
  sellCustomAsicsWholesale,
  stepFabProduction,
  stripCustomAsicFromRig,
  stripCustomPartFromRig,
} from './fab';
import {
  computeCompanyValuation,
  computeValuationBreakdown,
  evaluateProgression,
} from './milestones';
import { buildDefaultWorld, stepSharedWorld } from './world';
import {
  createInitialRivals,
  getPlayerRivalComparison,
  getRivalDifficultyRise,
  getRivalInvestigateCost,
  investigateRivalSyndicate,
  stepRivalSyndicates,
} from './rivals';
import { analyzeCoinForecast, formatMarketForecastReport } from './marketForecast';
import {
  advanceUndergroundInvestigation,
  complyWithAudit,
  developShellCoin,
  executePreparedRaid,
  formatUndergroundReport,
  payComplianceSettlement,
  prepareVaultRaid,
  seedShellCoinLiquidity,
  stepShellCoins,
} from './underground';
import { archiveSeason, getSeasonId, getSeasonLabel } from './leaderboard';
import {
  buildDefaultStats,
} from './saveSystem';
import {
  getEffectiveMaxRigsWithRooms,
  getFacilityRooms,
  getRoomCoolingAndThermalEffect,
  resolveRigRoomId,
} from './rooms';
export {
  findOpenRoomId,
  formatAsciiFloorPlan,
  formatSingleRoomView,
  getFacilityRoomExpansionCost,
  getFacilityRooms,
  resolveCoolerRoomId,
  resolveRigRoomId,
} from './rooms';
import {
  buildStrikeNegotiationEvent,
  computeWorkloadSummary,
  createMacroModifier,
  generateDynamicEvent,
  getEmployeeEfficiencyMult,
  getTopSkillForRole,
  patchRigSingleSlot,
  stepEmployeesWorkloadAndMorale,
} from './eventsAndStaff';
export { computeWorkloadSummary, getEmployeeEfficiencyMult } from './eventsAndStaff';
import {
  calculateBaseRigPartsCost,
  calculateRigResaleValue,
  calculateStockBuildPartsCost,
  computeAverageRigHealth,
  createInitialComponentHealth,
  ensureRigComponentHealth,
  generateUsedMarketListings,
  getEffectivePartBundle,
  getGlobalHardwarePriceMult,
  getRigGeneration,
} from './usedMarket';

export type { CustomBlueprintDesignInput, CreatePlayerCoinInput };

export {
  analyzeCoinForecast,
  buildDefaultFab,
  buildDefaultWallet,
  buildFabLine,
  calculateRigResaleValue,
  cancelLimitOrder,
  checkRigCoinCompatibility,
  closeShortPosition,
  compareBlueprints,
  complyWithAudit,
  computeAverageRigHealth,
  computeCompanyValuation,
  computeShortEquity,
  computeValuationBreakdown,
  createInitialComponentHealth,
  createInitialRivals,
  createPlayerCoin,
  deleteDraftBlueprint,
  deployCustomAsicToRig,
  deployCustomInventoryToRig,
  designCustomChipBlueprint,
  designCustomComponentBlueprint,
  developShellCoin,
  ensureRigComponentHealth,
  executePreparedRaid,
  executeSpotBuy,
  executeSpotSell,
  formatBlueprintComparisonReport,
  formatCoinsCatalogReport,
  formatCustomComponentSummaryLine,
  formatFabStatusReport,
  formatManufacturingHistoryReport,
  formatMarketForecastReport,
  formatUndergroundReport,
  formatWalletAndExchangeReport,
  generateContractBoard,
  generateUsedMarketListings,
  getEffectivePartBundle,
  getFabCycleUpkeep,
  getFabEngineeringPointBudget,
  getFabInventoryValueUsd,
  getFabLineCost,
  getFocusOptionsForDesign,
  getPlayerRivalComparison,
  getRivalInvestigateCost,
  getShortPositionsEquityUsd,
  getSpotExchangeFeePct,
  getUnlockedFabArchitectures,
  getUnlockedFabCategories,
  getUnlockedFabNodes,
  getUnlockedFabSubFeatures,
  getWalletMarketValueUsd,
  inspectBatchReport,
  inspectSerialReport,
  inventoryItemToCustomSpec,
  investigateRivalSyndicate,
  isFabUnlocked,
  openShortPosition,
  payComplianceSettlement,
  placeLimitOrder,
  prepareVaultRaid,
  previewCustomComponentDesign,
  queueFabProduction,
  reviseBlueprint,
  runPrototypeTest,
  saveDraftBlueprint,
  seedShellCoinLiquidity,
  sellCustomAsicsWholesale,
  stripCustomAsicFromRig,
  stripCustomPartFromRig,
};

export const BILLING_CYCLE_STEPS = 30;

export function getStepsUntilNextBill(stepCount: number): number {
  return BILLING_CYCLE_STEPS - (stepCount % BILLING_CYCLE_STEPS);
}

export function getFacility(facilityId: string): FacilityTier {
  return FACILITY_TIERS.find((f) => f.id === facilityId) ?? FACILITY_TIERS[0];
}

export function getPowerContract(contractId?: PowerContractId): PowerContractSpec {
  return POWER_CONTRACTS.find((c) => c.id === contractId) ?? POWER_CONTRACTS[1];
}

export function getFacilityUpgradeCost(upgradeId: FacilityUpgradeId, currentLevel: number): number {
  const spec = FACILITY_UPGRADES.find((u) => u.id === upgradeId);
  if (!spec) return 0;
  return Math.round(spec.baseCost * Math.pow(spec.costScale, currentLevel));
}

export function getPartBundle(
  config: RigBuildConfig & {
    customAsicSpec?: CustomAsicSpec;
    customParts?: MiningRig['customParts'];
  }
) {
  return getEffectivePartBundle(config);
}

export function calculateRigBuildCost(
  config: RigBuildConfig,
  state?: Pick<GameState, 'activeMarketModifiers'> & { marketRegime?: GameState['marketRegime'] }
): number {
  const base = calculateStockBuildPartsCost(config);
  const mult = state ? getGlobalHardwarePriceMult(state) : 1.0;
  return Math.round(base * mult);
}

export function calculatePartTradeInCost(oldCost: number, newCost: number): number {
  const tradeInCredit = Math.round(oldCost * 0.6);
  return newCost - tradeInCredit;
}

export function getTechnicianBonuses(state: Pick<GameState, 'employees' | 'unlockedResearch' | 'strikeStepsRemaining'>) {
  const strike = state.strikeStepsRemaining ?? 0;
  const techs = state.employees.filter((e) => e.role === 'TECHNICIAN');
  const totalSkill = techs.reduce((s, e) => s + (e.skillLevel ?? 1) * getEmployeeEfficiencyMult(e, strike), 0);
  const repairDiscount = Math.min(0.5, totalSkill * 0.12);
  const wearReduction = Math.min(0.45, totalSkill * 0.1) + (state.unlockedResearch.includes('res_auto_maint') ? 0.22 : 0);
  const repairPerStep = techs.reduce((s, e) => s + 0.24 * (1 + ((e.skillLevel ?? 1) - 1) * 0.25) * getEmployeeEfficiencyMult(e, strike), 0);
  const hasThermalTech = strike <= 0 && techs.some((t) => t.priority === 'THERMAL_SAFETY' && (t.morale ?? 85) >= 30);
  return { count: techs.length, totalSkill, repairDiscount, wearReduction: Math.min(0.65, wearReduction), repairPerStep, hasThermalTech };
}

export function getElectricianBonuses(state: Pick<GameState, 'employees' | 'strikeStepsRemaining'>) {
  const strike = state.strikeStepsRemaining ?? 0;
  const elecs = state.employees.filter((e) => e.role === 'ELECTRICIAN');
  const totalSkill = elecs.reduce((s, e) => s + (e.skillLevel ?? 1) * getEmployeeEfficiencyMult(e, strike), 0);
  const capBonusPct = Math.min(0.28, totalSkill * 0.05);
  const powerWasteReduction = Math.min(0.2, totalSkill * 0.04);
  const electricalMaintDiscount = Math.min(0.4, totalSkill * 0.09);
  return { count: elecs.length, totalSkill, capBonusPct, powerWasteReduction, electricalMaintDiscount };
}

export function getManagerBonuses(state: Pick<GameState, 'employees' | 'strikeStepsRemaining'>) {
  const strike = state.strikeStepsRemaining ?? 0;
  const mgrs = state.employees.filter((e) => e.role === 'MANAGER');
  const totalSkill = mgrs.reduce((s, e) => s + (e.skillLevel ?? 1) * getEmployeeEfficiencyMult(e, strike), 0);
  const adminOverheadDiscount = Math.min(0.35, totalSkill * 0.08);
  const opsEfficiencyBonus = Math.min(0.18, totalSkill * 0.03);
  return { count: mgrs.length, totalSkill, adminOverheadDiscount, opsEfficiencyBonus };
}

export function getComponentRepairCost(
  rig: MiningRig,
  slot: RepairComponentSlot,
  gpuSlotIdx?: number,
  state?: Pick<GameState, 'employees' | 'unlockedResearch' | 'activeMarketModifiers'>
): number {
  const { chassis, compute, gpus, storage, psu, cooling } = getPartBundle(rig);
  const compHealth = ensureRigComponentHealth(rig);
  const techDiscount = state ? getTechnicianBonuses(state).repairDiscount : 0;
  const hwMult = state ? getGlobalHardwarePriceMult(state) : 1.0;

  const calcSingle = (partCost: number, health: number): number => {
    const missing = Math.max(0, 100 - health);
    if (missing < 0.5 && rig.status !== 'FAILED') return 0;
    const effectiveMissing = Math.max(missing, rig.status === 'FAILED' ? 18 : 0);
    const faultPenalty = rig.status === 'FAILED' || health <= 25 ? 1.35 : 1.0;
    return Math.max(
      8,
      Math.round((effectiveMissing / 100) * partCost * 0.36 * (1 - techDiscount) * hwMult * faultPenalty)
    );
  };

  if (slot === 'gpu') {
    if (gpus.length === 0) return 0;
    if (typeof gpuSlotIdx === 'number') {
      const gpuPart = gpus[gpuSlotIdx];
      if (!gpuPart) return 0;
      const gHealth = compHealth.gpus[gpuSlotIdx] ?? rig.healthPct;
      return calcSingle(gpuPart.cost, gHealth);
    }
    return gpus.reduce(
      (sum, g, i) => sum + calcSingle(g.cost, compHealth.gpus[i] ?? rig.healthPct),
      0
    );
  }

  if (slot === 'chassis') return calcSingle(chassis.cost, compHealth.chassis);
  if (slot === 'compute') return calcSingle(compute.cost, compHealth.compute);
  if (slot === 'storage') return calcSingle(storage.cost, compHealth.storage);
  if (slot === 'psu') return calcSingle(psu.cost, compHealth.psu);
  return calcSingle(cooling.cost, compHealth.cooling);
}

export function getRigRepairCost(
  rig: MiningRig,
  state?: Pick<GameState, 'employees' | 'unlockedResearch' | 'activeMarketModifiers'>
): number {
  const compHealth = ensureRigComponentHealth(rig);
  const avgHealth = rig.componentHealth ? computeAverageRigHealth(compHealth) : rig.healthPct;
  const anyDamaged =
    rig.status === 'FAILED' ||
    avgHealth < 99.5 ||
    compHealth.chassis < 99.5 ||
    compHealth.compute < 99.5 ||
    compHealth.storage < 99.5 ||
    compHealth.psu < 99.5 ||
    compHealth.cooling < 99.5 ||
    compHealth.gpus.some((h) => h < 99.5);
  if (!anyDamaged) return 0;

  const summed =
    getComponentRepairCost(rig, 'chassis', undefined, state) +
    getComponentRepairCost(rig, 'compute', undefined, state) +
    getComponentRepairCost(rig, 'gpu', undefined, state) +
    getComponentRepairCost(rig, 'storage', undefined, state) +
    getComponentRepairCost(rig, 'psu', undefined, state) +
    getComponentRepairCost(rig, 'cooling', undefined, state);
  return Math.max(15, summed);
}

export function getRigRepasteCost(rig: MiningRig): number {
  const buildCost = calculateBaseRigPartsCost(rig);
  return Math.max(12, Math.round(Math.min(25000, buildCost * 0.015)));
}

export function getEmpireAlignment(
  state: Pick<GameState, 'regulatoryScrutiny' | 'underground' | 'stats'>
): EmpireAlignment {
  const covert = state.stats?.covertOpsCount ?? 0;
  if (
    state.underground?.powerSiphonActive ||
    state.regulatoryScrutiny >= 55 ||
    covert >= 5
  ) {
    return 'SYNDICATE_OUTLAW';
  }
  if (covert >= 1 || state.regulatoryScrutiny >= 24) {
    return 'GREY_MARKET';
  }
  return 'INSTITUTIONAL';
}

export interface ComputedRigTelemetry {
  rawWatts: number;
  wallWatts: number;
  isUnderpowered: boolean;
  noiseDba: number;
  equilibriumTempC: number;
  baseHashrateByAlgo: Record<MiningAlgorithm, number>;
  effectiveHashrate: number;
  targetAlgo: MiningAlgorithm;
}

export function computeFacilityCoolingSummary(
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1,
  facility?: FacilityTier,
  facilityUpgrades?: Partial<Record<FacilityUpgradeId, number>>
): {
  totalCoolingPoints: number;
  effectiveCoolingPerRigC: number;
  totalCoolingWatts: number;
  maxCoolingNoiseDba: number;
  cycleCoolingMaintUsd: number;
  facilityCoolingBonusC: number;
} {
  let totalCoolingPoints = 0;
  let totalCoolingWatts = 0;
  let maxCoolingNoiseDba = 0;
  let cycleCoolingMaintUsd = 0;
  let totalSupportedRigs = 0;

  for (const unit of coolingUnits) {
    if (!unit.enabled) continue;
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === unit.type);
    if (!spec) continue;
    totalCoolingPoints += spec.coolingPowerC;
    totalCoolingWatts += spec.watts;
    cycleCoolingMaintUsd += spec.maintenancePerCycle;
    totalSupportedRigs += spec.maxRigsSupported;
    if (spec.noiseDba > maxCoolingNoiseDba) maxCoolingNoiseDba = spec.noiseDba;
  }

  const ventLvl = facilityUpgrades?.ventilation_ducts ?? 0;
  const indCoolLvl = facilityUpgrades?.industrial_cooling_loop ?? 0;
  const facilityCoolingBonusC =
    (facility?.coolingBonusC ?? 0) + ventLvl * 5 + indCoolLvl * 10;

  const rigsCount = Math.max(1, activeRigCount);
  const saturationRatio = totalSupportedRigs > 0 ? Math.min(1, totalSupportedRigs / rigsCount) : 0;
  const divisor = Math.max(1, Math.sqrt(rigsCount));
  const unitCoolingPerRig = (totalCoolingPoints / divisor) * (0.45 + 0.55 * saturationRatio);
  const effectiveCoolingPerRigC = Math.min(58, unitCoolingPerRig + facilityCoolingBonusC * 0.65);

  return {
    totalCoolingPoints,
    effectiveCoolingPerRigC,
    totalCoolingWatts,
    maxCoolingNoiseDba,
    cycleCoolingMaintUsd,
    facilityCoolingBonusC,
  };
}

export function computeSpatialCoolingBonus(
  _gridX: number | undefined,
  _gridY: number | undefined,
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1,
  facility?: FacilityTier,
  facilityUpgrades?: Partial<Record<FacilityUpgradeId, number>>
): number {
  return computeFacilityCoolingSummary(
    coolingUnits,
    activeRigCount,
    facility,
    facilityUpgrades
  ).effectiveCoolingPerRigC;
}

export function findOpenGridSlot(
  facility: FacilityTier,
  rigs: MiningRig[],
  coolingUnits: PlacedCoolingUnit[]
): { gridX: number; gridY: number } {
  const occupied = new Set<string>();
  rigs.forEach((r) => occupied.add(`${r.gridX},${r.gridY}`));
  coolingUnits.forEach((c) => occupied.add(`${c.gridX},${c.gridY}`));
  if (facility.id === 'fac_bedroom') {
    occupied.add('0,0');
    occupied.add('1,0');
    occupied.add('0,1');
  }
  for (let y = 1; y < facility.gridSize; y++) {
    for (let x = 1; x < facility.gridSize; x++) {
      if (!occupied.has(`${x},${y}`)) {
        return { gridX: x, gridY: y };
      }
    }
  }
  return { gridX: 1, gridY: 1 };
}

export function computeRigTelemetry(
  rig: RigBuildConfig & {
    temperatureC?: number;
    gridX?: number;
    gridY?: number;
    roomId?: string;
    healthPct?: number;
    componentHealth?: RigComponentHealth;
    pasteStepsRemaining?: number;
    illicitMod?: IllicitModId | null;
    conditionTier?: MiningRig['conditionTier'];
    ageSteps?: number;
    status?: MiningRig['status'];
    customAsicSpec?: CustomAsicSpec;
    customParts?: MiningRig['customParts'];
  },
  facility: FacilityTier,
  unlockedResearch: string[],
  sysEngineerBonus: number,
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1,
  facilityUpgrades?: Partial<Record<FacilityUpgradeId, number>>,
  electricianPowerSave = 0,
  facilityExtraRooms = 0,
  coinsMap?: Record<CoinSymbol, CoinMarketState>
): ComputedRigTelemetry {
  const bundle = getPartBundle(rig);
  const { chassis, compute, gpus, storage, psu, cooling, os } = bundle;
  const ocRatio = Math.max(0.8, Math.min(1.5, rig.overclockPct / 100));
  const undervoltMult = unlockedResearch.includes('res_undervolt') ? 0.88 : 1.0;
  const distLvl = facilityUpgrades?.power_distribution ?? 0;
  const distSaveMult = Math.max(0.75, 1 - distLvl * 0.06 - electricianPowerSave);

  const fw = FIRMWARE_PROFILE_SPECS[rig.firmwareProfile ?? 'BALANCED'];
  const illicit = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod] : null;
  const compHealth = rig.componentHealth
    ? ensureRigComponentHealth({ gpuIds: rig.gpuIds, healthPct: rig.healthPct ?? 100, componentHealth: rig.componentHealth })
    : null;
  const healthPct = compHealth ? computeAverageRigHealth(compHealth) : (rig.healthPct ?? 100);
  const minCompHealth = compHealth
    ? Math.min(compHealth.chassis, compHealth.compute, compHealth.storage, compHealth.psu, compHealth.cooling, ...(compHealth.gpus.length > 0 ? compHealth.gpus : [100]))
    : healthPct;
  const pasteBonusC = (rig.pasteStepsRemaining ?? 0) > 0 ? 6 : 0;

  // Component-specific degradation effects
  const psuWearPowerMult =
    compHealth && compHealth.psu < 65 ? 1 + (65 - compHealth.psu) * 0.0022 : 1.0;
  const coolingHealthMult =
    compHealth && compHealth.cooling < 75
      ? Math.max(0.55, 0.55 + 0.45 * (compHealth.cooling / 75))
      : 1.0;
  const chassisRattleDba =
    compHealth && compHealth.chassis < 65 ? Math.round((65 - compHealth.chassis) * 0.14) : 0;
  const storageHealthMult =
    compHealth && compHealth.storage < 65 ? Math.max(0.65, compHealth.storage / 65) : 1.0;

  const rooms = getFacilityRooms({
    facilityId: facility.id,
    facilityUpgrades: facilityUpgrades ?? {},
    facilityExtraRooms,
  });
  const effRoomId = resolveRigRoomId(rig, rooms, 0);
  const roomFx = getRoomCoolingAndThermalEffect(effRoomId, rooms, coolingUnits, activeRigCount);

  const gpuWatts = gpus.reduce((s, g) => s + g.watts, 0);
  const gpuHeat = gpus.reduce((s, g) => s + g.heatC, 0);
  const effComputeWatts = rig.customAsicSpec ? rig.customAsicSpec.watts : compute.watts;
  const effComputeHeatC = rig.customAsicSpec ? rig.customAsicSpec.heatC : compute.heatC;
  const effComputeNoise = rig.customAsicSpec ? Math.max(24, compute.noiseDba) : compute.noiseDba;

  const rawWatts = Math.round(
    (chassis.baseWatts +
      (effComputeWatts + gpuWatts) * Math.pow(ocRatio, 1.48) +
      storage.watts +
      cooling.watts) *
      os.powerMultiplier *
      undervoltMult *
      distSaveMult *
      fw.powerMult *
      psuWearPowerMult *
      (illicit?.powerMult ?? 1)
  );
  const wallWatts = Math.round(rawWatts / psu.efficiency);
  const isUnderpowered = rawWatts > psu.maxWatts;

  const isImmersion =
    cooling.id === 'cool_immersion' ||
    cooling.id === 'cool_cryo_phase' ||
    cooling.id === 'cool_two_phase_immersion' ||
    cooling.id === 'cool_ai_thermal_fabric' ||
    cooling.id === 'cool_quantum_dilution' ||
    Boolean(cooling.isImmersion);
  const gpuNoise =
    gpus.length > 0 ? Math.max(...gpus.map((g) => g.noiseDba)) + gpus.length * 1.8 : 0;
  const ventBaffle = (facilityUpgrades?.ventilation_ducts ?? 0) * 3;
  const rawNoise =
    30 +
    effComputeNoise * 0.65 +
    gpuNoise * 0.55 +
    cooling.noiseDba * 0.6 +
    psu.noiseDba * 0.3 +
    chassis.noiseModifier +
    chassisRattleDba +
    (ocRatio - 1) * 18 +
    (rig.firmwareProfile === 'TURBO' ? 4 : rig.firmwareProfile === 'ECO' ? -4 : 0) +
    (illicit?.noiseDeltaDba ?? 0) -
    ventBaffle -
    roomFx.noiseBaffleDba;
  const noiseDba = Math.round(
    isImmersion ? Math.min(48, Math.max(24, rawNoise * 0.55)) : Math.max(24, rawNoise)
  );

  const wearHeat = healthPct < 75 ? Math.round((75 - healthPct) * 0.16) : 0;
  const heatLoad =
    (effComputeHeatC + gpuHeat + storage.heatC) *
      Math.pow(ocRatio, 1.4) *
      undervoltMult *
      fw.heatMult +
    (illicit?.extraHeatC ?? 0) +
    wearHeat;
  const effectiveCooling =
    (cooling.coolingPowerC * coolingHealthMult + chassis.coolingBonus + pasteBonusC) *
    roomFx.airflowFactor;
  const louverAutoBonusC = unlockedResearch.includes('res_room_automation') ? 4 : 0;
  const roomCoolingBonus =
    computeSpatialCoolingBonus(
      rig.gridX,
      rig.gridY,
      coolingUnits,
      activeRigCount,
      facility,
      facilityUpgrades
    ) +
    roomFx.roomLocalCoolingBonusC +
    louverAutoBonusC;
  const localAmbient = facility.ambientTempC + roomFx.ambientTempDeltaC;
  const equilibriumTempC = Math.round(
    Math.max(
      localAmbient + 4,
      localAmbient + 24 + heatLoad - effectiveCooling * 0.72 - roomCoolingBonus
    )
  );

  const algos: MiningAlgorithm[] = [
    'SHA256',
    'SCRYPT',
    'RANDOMX',
    'ETHASH',
    'POST',
    'KAWPOW',
    'EQUIHASH',
    'QHASH',
  ];
  const baseHashrateByAlgo: Record<MiningAlgorithm, number> = {
    SHA256: 0,
    SCRYPT: 0,
    RANDOMX: 0,
    ETHASH: 0,
    POST: 0,
    KAWPOW: 0,
    EQUIHASH: 0,
    QHASH: 0,
  };

  for (const algo of algos) {
    if (algo === 'POST') {
      baseHashrateByAlgo.POST = storage.storageTb;
    } else {
      const cHash = compute.hashrates[algo] ?? 0;
      const gHash = gpus.reduce((s, g) => s + (g.hashrates[algo] ?? 0), 0);
      baseHashrateByAlgo[algo] = cHash + gHash;
    }
  }
  if (rig.customAsicSpec) {
    const customAlgo = rig.customAsicSpec.algo;
    baseHashrateByAlgo[customAlgo] =
      rig.customAsicSpec.hashRate +
      gpus.reduce((s, g) => s + (g.hashrates[customAlgo] ?? 0), 0);
  }

  const fallbackAlgoMap: Record<string, MiningAlgorithm> = {
    BTC: 'SHA256',
    LTC: 'SCRYPT',
    DOGE: 'SCRYPT',
    XMR: 'RANDOMX',
    ETH: 'ETHASH',
    XCH: 'POST',
    RVN: 'KAWPOW',
    ZEC: 'EQUIHASH',
    QBC: 'QHASH',
  };
  const coinObj = coinsMap?.[rig.targetCoin];
  const targetAlgo: MiningAlgorithm =
    coinObj?.algorithm ?? fallbackAlgoMap[rig.targetCoin] ?? 'SHA256';
  const baseHash = baseHashrateByAlgo[targetAlgo] ?? 0;
  const compatFactor = coinObj
    ? checkRigCoinCompatibility(rig, coinObj, bundle).efficiencyMult
    : 1.0;

  const currentTemp = rig.temperatureC ?? equilibriumTempC;
  let thermalFactor = 1.0;
  if (currentTemp >= 96) {
    thermalFactor = 0;
  } else if (currentTemp >= 82) {
    thermalFactor = Math.max(0.45, 1 - (currentTemp - 82) * 0.038);
  }

  let healthFactor = 1.0;
  if (rig.status === 'FAILED' || healthPct <= 20 || minCompHealth <= 20) {
    healthFactor = 0;
  } else if (healthPct < 75) {
    healthFactor = Math.max(0.5, 1 - (75 - healthPct) * 0.009);
  }

  const condTierFactor =
    rig.conditionTier === 'DAMAGED' ? 0.92 : rig.conditionTier === 'USED' ? 0.97 : 1.0;

  const totalMult =
    os.hashrateMultiplier *
    (1 + storage.efficiencyBonus * storageHealthMult) *
    ocRatio *
    fw.hashMult *
    (illicit?.hashMult ?? 1) *
    (1 + sysEngineerBonus) *
    thermalFactor *
    healthFactor *
    condTierFactor *
    compatFactor *
    (isUnderpowered ? 0 : 1);

  return {
    rawWatts,
    wallWatts,
    isUnderpowered,
    noiseDba,
    equilibriumTempC,
    baseHashrateByAlgo,
    effectiveHashrate: baseHash * totalMult,
    targetAlgo,
  };
}

export function getAutoSellMultiplier(
  state: Pick<GameState, 'unlockedResearch' | 'employees' | 'strikeStepsRemaining'>
): number {
  const strike = state.strikeStepsRemaining ?? 0;
  const analysts = state.employees.filter((e) => e.role === 'ANALYST');
  const quantBonus = state.unlockedResearch.includes('res_quant_desk') ? 0.06 : 0;
  const analystBonus = Math.min(0.12, analysts.reduce((s, a) => s + 0.03 * (1 + ((a.skillLevel ?? 1) - 1) * 0.15) * getEmployeeEfficiencyMult(a, strike), 0));
  const mgrBonus = getManagerBonuses(state).opsEfficiencyBonus * 0.35;
  return 1 + quantBonus + analystBonus + mgrBonus;
}

const MINING_PAYOUT_CURVES: Partial<Record<MiningAlgorithm, readonly (readonly [number, number])[]>> = {
  // Each band applies its exponent only to hashrate above the previous band's upper ratio.
  SHA256: [[2e4, 0.125], [2.2e5, 0.94], [7.5e5, 0.26], [2e9, 0.055], [2e11, 0.38], [Infinity, 0.5]],
  SCRYPT: [[96, 0.26], [1.6e6, 0.125], [1.5e7, 0.55], [Infinity, 0.7]],
  RANDOMX: [[18, 0.32], [135, 0.44], [Infinity, 0.65]],
  ETHASH: [[5, 0.54], [32, 0.60], [Infinity, 0.85]],
  POST: [[4, 0.62], [16, 0.75], [Infinity, 0.90]],
};

export function computeStepCoinOutput(
  effectiveHashrate: number,
  coin: CoinMarketState,
  efficiencyFactor: number,
  autoSellMult: number,
  poolMode: PoolMode = 'PPS',
  deterministicEstimate = false,
  rng: () => number = Math.random
): { minedCoins: number; autoSoldUsd: number; soloBlockHit: boolean } {
  if (!coin.unlocked || effectiveHashrate <= 0 || efficiencyFactor <= 0) {
    return { minedCoins: 0, autoSoldUsd: 0, soloBlockHit: false };
  }
  const ratio = effectiveHashrate / Math.max(1e-6, coin.baselineHash);
  const bands = MINING_PAYOUT_CURVES[coin.algorithm];
  let scale = Math.pow(ratio, ratio < 1 ? 0.72 : coin.hashExponent);
  if (ratio >= 1 && bands) {
    scale = 1;
    let lower = 1;
    for (const [upper, exponent] of bands) {
      scale *= Math.pow(Math.min(ratio, upper) / lower, exponent);
      if (ratio <= upper) break;
      lower = upper;
    }
  }

  const diffFactor = 1 / Math.max(0.5, coin.networkDifficulty ?? 1);
  const halvingScale = coin.blockRewardScale ?? 1;
  const marketPayout = coin.symbol === 'XCH' ? 0.45 : coin.symbol === 'ETH' ? 0.72 : 1;
  const rawCoins = coin.baseStepCoins * scale * efficiencyFactor * diffFactor * halvingScale * marketPayout;

  if (deterministicEstimate) {
    const evMult = poolMode === 'PPS' ? 0.98 : poolMode === 'PPLNS' ? 1.05 : 1.12;
    const minedCoins = rawCoins * evMult;
    return {
      minedCoins,
      autoSoldUsd: minedCoins * coin.priceUsd * autoSellMult,
      soloBlockHit: false,
    };
  }

  let poolMult = 0.98;
  let soloBlockHit = false;
  if (poolMode === 'PPLNS') {
    poolMult = 1.05 * (0.85 + rng() * 0.3);
  } else if (poolMode === 'SOLO') {
    const hitChance = Math.max(0.06, Math.min(0.36, 0.08 + Math.log10(1 + ratio) * 0.065));
    if (rng() < hitChance) {
      soloBlockHit = true;
      poolMult = (1 / hitChance) * 1.12;
    } else {
      return { minedCoins: 0, autoSoldUsd: 0, soloBlockHit: false };
    }
  }

  const minedCoins = rawCoins * poolMult;
  const autoSoldUsd = minedCoins * coin.priceUsd * autoSellMult;
  return { minedCoins, autoSoldUsd, soloBlockHit };
}

export function getSysEngineerBonus(state: Pick<GameState, 'employees' | 'strikeStepsRemaining'>): number {
  const strike = state.strikeStepsRemaining ?? 0;
  const engineers = state.employees.filter((e) => e.role === 'SYS_ENGINEER');
  const raw = engineers.reduce((sum, e) => {
    const shiftMult = e.shift === 'ROTATION_24_7' ? 1.25 : 1.0;
    const prioMult = e.priority === 'HASHRATE_TUNING' ? 1.3 : 1.0;
    const skillMult = 1 + ((e.skillLevel ?? 1) - 1) * 0.2;
    return sum + 0.06 * shiftMult * prioMult * skillMult * getEmployeeEfficiencyMult(e, strike);
  }, 0);
  return Math.min(0.38, raw);
}

/**
 * Normalizes raw fleet hashrate (which spans from H/s to PH/s) onto the same
 * index scale as rival syndicates. Without this, a Gen-6 fleet scored in the
 * billions next to rivals scoring in the dozens, so market share and block
 * share collapsed to 0%/100% instead of being a real competition.
 */
export function computeFleetHashIndex(fleetEffectiveHash: number, rigCount: number): number {
  const hash = Math.max(0, fleetEffectiveHash);
  return Math.max(12, Math.round(20 + Math.log10(1 + hash) * 40 + rigCount * 14));
}

/**
 * Live estimate of the player's fleet hash index on the same scale as rival
 * syndicates, for the shared-world report before the first step has run.
 */
export function estimateFleetHashIndex(state: GameState): number {
  const facility = getFacility(state.facilityId);
  const enabled = state.rigs.filter((r) => r.enabled);
  let hash = 0;
  for (const rig of enabled) {
    const t = computeRigTelemetry(
      rig,
      facility,
      state.unlockedResearch,
      0,
      state.coolingUnits ?? [],
      Math.max(1, enabled.length),
      state.facilityUpgrades,
      0,
      state.facilityExtraRooms ?? 0,
      state.coins
    );
    hash += t.effectiveHashrate;
  }
  return computeFleetHashIndex(hash, state.rigs.length);
}

export function getEffectiveFacilityMaxRigs(
  state: Pick<GameState, 'facilityId' | 'facilityUpgrades' | 'facilityExtraRooms'>
): number {
  return getEffectiveMaxRigsWithRooms(
    state.facilityId,
    state.facilityUpgrades,
    state.facilityExtraRooms ?? 0
  );
}

export function getEffectiveFacilityPowerCapKw(
  state: Pick<
    GameState,
    'facilityId' | 'facilityUpgrades' | 'powerContractId' | 'underground' | 'employees' | 'unlockedResearch'
  >
): number {
  const facility = getFacility(state.facilityId);
  const circuitLvl = state.facilityUpgrades?.additional_circuits ?? 0;
  const contract = getPowerContract(state.powerContractId);
  const elecBonus = getElectricianBonuses(state).capBonusPct;
  const pfBonus = state.unlockedResearch?.includes('res_power_factor') ? 0.08 : 0;
  const siphonMult = state.underground?.powerSiphonActive ? 1.25 : 1.0;

  const cap =
    facility.maxPowerKw *
    (1 + circuitLvl * 0.22 + elecBonus + pfBonus) *
    contract.capacityMultiplier *
    siphonMult;
  return Number(cap.toFixed(2));
}

export function getEffectiveElectricityRate(
  state: Pick<
    GameState,
    'facilityId' | 'powerContractId' | 'unlockedResearch' | 'activeMarketModifiers' | 'underground' | 'sandboxConfig'
  >
): number {
  const facility = getFacility(state.facilityId);
  const contract = getPowerContract(state.powerContractId);
  const ppaMult = state.unlockedResearch?.includes('res_hydro_ppa') ? 0.72 : 1.0;
  const siphonMult = state.underground?.powerSiphonActive ? 0.35 : 1.0;
  const evtMult = (state.activeMarketModifiers ?? []).reduce((m, x) => m * x.powerRateMult, 1.0);
  const sandboxMult = state.sandboxConfig?.operatingCostMult ?? 1.0;
  return facility.powerRatePerKwh * contract.rateMultiplier * ppaMult * siphonMult * evtMult * sandboxMult;
}

export function getFacilityNoiseDba(loudestRigDba: number, activeRigs: number, coolingNoiseDba: number): number {
  return Math.max(loudestRigDba + Math.min(8, activeRigs * 0.7), coolingNoiseDba);
}

export function getFacilityTotals(state: GameState): {
  totalPowerKw: number;
  maxNoiseDba: number;
  loudestRigDba: number;
  coolingNoiseDba: number;
  rigCount: number;
  maxRigs: number;
  stepPowerCostUsd: number;
  cyclePayrollUsd: number;
  cycleRentUsd: number;
  cycleMaintenanceUsd: number;
  cycleFixedContractFee: number;
} {
  const facility = getFacility(state.facilityId);
  const sysBonus = getSysEngineerBonus(state);
  const elecBonus = getElectricianBonuses(state);
  const mgrBonus = getManagerBonuses(state);
  const effectiveRate = getEffectiveElectricityRate(state);
  const sandboxMult = state.sandboxConfig?.operatingCostMult ?? 1.0;

  let totalWatts = 0;
  let loudestRigDba = 28;
  const enabledCount = state.rigs.filter((r) => r.enabled && r.status !== 'FAILED').length;

  for (const rig of state.rigs) {
    if (!rig.enabled || rig.status === 'FAILED') continue;
    const t = computeRigTelemetry(
      rig,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      enabledCount,
      state.facilityUpgrades,
      elecBonus.powerWasteReduction,
      state.facilityExtraRooms ?? 0,
      state.coins
    );
    totalWatts += t.wallWatts;
    loudestRigDba = Math.max(loudestRigDba, t.noiseDba);
  }

  const coolingSummary = computeFacilityCoolingSummary(
    state.coolingUnits ?? [],
    enabledCount,
    facility,
    state.facilityUpgrades
  );
  totalWatts += coolingSummary.totalCoolingWatts;

  const totalPowerKw = totalWatts / 1000;
  const stepPowerCostUsd = totalPowerKw * 24 * effectiveRate;

  const cyclePayrollUsd = Math.round(
    state.employees.reduce((sum, e) => {
      const spec = EMPLOYEE_SPECS.find((s) => s.role === e.role);
      const base = spec?.cycleSalary ?? 1500;
      const skillMult = 1 + ((e.skillLevel ?? 1) - 1) * 0.14;
      const shiftMult = e.shift === 'ROTATION_24_7' ? 1.35 : 1.0;
      return sum + base * skillMult * shiftMult;
    }, 0) * sandboxMult
  );

  const isOwned = state.ownedFacilityIds.includes(state.facilityId);
  const adminDisc = 1 - mgrBonus.adminOverheadDiscount;
  const cycleRentUsd = isOwned ? 0 : Math.round(facility.cycleRent * adminDisc * sandboxMult);

  let upgradeUpkeep = 0;
  for (const upg of FACILITY_UPGRADES) {
    const lvl = state.facilityUpgrades?.[upg.id] ?? 0;
    upgradeUpkeep += lvl * upg.cycleUpkeepPerLevel;
  }
  const profile = FACILITY_PROFILES[facility.id] ?? FACILITY_PROFILES.fac_bedroom;
  const extraRoomsUpkeep = (state.facilityExtraRooms ?? 0) * profile.expansionUpkeepPerCycle;
  const fabUpkeep = getFabCycleUpkeep(state.fab?.linesCount ?? 0);
  const elecMaintDisc = 1 - elecBonus.electricalMaintDiscount;
  const cycleMaintenanceUsd = Math.round(
    (facility.maintenanceCostPerCycle * adminDisc +
      coolingSummary.cycleCoolingMaintUsd +
      extraRoomsUpkeep +
      fabUpkeep +
      upgradeUpkeep * elecMaintDisc) *
      sandboxMult
  );

  const contract = getPowerContract(state.powerContractId);
  const cycleFixedContractFee = Math.round(contract.cycleFixedFee * sandboxMult);

  return {
    totalPowerKw,
    maxNoiseDba: Math.round(getFacilityNoiseDba(loudestRigDba, enabledCount, coolingSummary.maxCoolingNoiseDba)),
    loudestRigDba,
    coolingNoiseDba: coolingSummary.maxCoolingNoiseDba,
    rigCount: state.rigs.length,
    maxRigs: getEffectiveFacilityMaxRigs(state),
    stepPowerCostUsd,
    cyclePayrollUsd,
    cycleRentUsd,
    cycleMaintenanceUsd,
    cycleFixedContractFee,
  };
}

export function generateBlackMarketListings(
  state: Pick<GameState, 'stepCount' | 'coins' | 'runSeed' | 'rigs'>
): BlackMarketListing[] {
  const rng = createSeededRng(`${state.runSeed}-bm-${state.stepCount}-${Math.random()}`);
  const modIds: IllicitModId[] = ['DARK_VOLT_BIOS', 'SPOOFED_FIRMWARE', 'SHUNT_BYPASS'];
  const pickedMod = modIds[Math.floor(rng() * modIds.length)];
  const secondMod = modIds[(modIds.indexOf(pickedMod) + 1) % modIds.length];

  const unlockedCount = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (s) => state.coins[s].unlocked
  ).length;
  const presetIdx = Math.min(
    RIG_PRESETS.length - 1,
    unlockedCount >= 5 && rng() > 0.45
      ? 2
      : state.rigs.length >= 2 && rng() > 0.35
      ? 1
      : 0
  );
  const preset = RIG_PRESETS[presetIdx];
  const fullCost = calculateRigBuildCost({ ...preset.config, name: preset.label });
  const discountPct = 35;
  const discountedCost = Math.round(fullCost * (1 - discountPct / 100));

  const m1 = ILLICIT_MOD_SPECS[pickedMod];
  const m2 = ILLICIT_MOD_SPECS[secondMod];

  return [
    {
      id: `bm_mod1_${state.stepCount}`,
      kind: 'ILLICIT_MOD',
      title: m1.name,
      description: `Flash onto any rig: ${m1.summary}`,
      costUsd: pickedMod === 'SHUNT_BYPASS' ? 680 : 420,
      heatGain: 14,
      modId: pickedMod,
    },
    {
      id: `bm_mod2_${state.stepCount}`,
      kind: 'ILLICIT_MOD',
      title: m2.name,
      description: `Flash onto any rig: ${m2.summary}`,
      costUsd: secondMod === 'SHUNT_BYPASS' ? 680 : 420,
      heatGain: 14,
      modId: secondMod,
    },
    {
      id: `bm_rig_${state.stepCount}`,
      kind: 'SMUGGLED_RIG',
      title: `Smuggled ${preset.label} (-${discountPct}%)`,
      description: `Zero-serial rig bypassing R&D (${preset.config.targetCoin}; ~22% lemon defect risk).`,
      costUsd: discountedCost,
      heatGain: 18,
      discountPct,
      defectRiskPct: 22,
      presetConfig: {
        ...preset.config,
        targetCoin: state.coins[preset.config.targetCoin]?.unlocked
          ? preset.config.targetCoin
          : 'BTC',
      },
    },
  ];
}

export function createNewGameState(
  difficulty: DifficultyLevel,
  devMode = false,
  customSeed?: string,
  sandboxConfig?: SandboxConfig,
  initialChallengeId: ChallengeId | null = null,
  onboardingMode: OnboardingMode = 'GUIDED'
): GameState {
  const effectiveOnboarding: OnboardingMode =
    devMode || difficulty === 'SANDBOX' || Boolean(sandboxConfig)
      ? 'VETERAN'
      : onboardingMode;
  const runSeed = customSeed?.trim() || generateRandomSeed();
  const rng = createSeededRng(`${runSeed}-init`);
  const isSandbox = devMode || difficulty === 'SANDBOX' || Boolean(sandboxConfig);

  const startingCash = isSandbox && sandboxConfig
    ? sandboxConfig.startingCash
    : devMode
    ? 2_500_000
    : difficulty === 'BOOTSTRAP'
    ? 750
    : difficulty === 'STANDARD'
    ? 1450
    : 35000;

  const startingFacilityId =
    isSandbox && sandboxConfig ? sandboxConfig.startingFacilityId : 'fac_bedroom';
  const startFac = getFacility(startingFacilityId);

  const makeStarterRig = (idx: number): MiningRig => ({
    id: `rig_starter_${idx + 1}`,
    name: idx === 0 ? 'Bedroom Desk Tower #1' : `Sandbox Starter Rig #${idx + 1}`,
    chassisId: 'chassis_bedroom_tower',
    computeId: 'cpu_core2_duo',
    gpuIds: [],
    storageId: 'stor_ddr3_4gb',
    psuId: 'psu_450w',
    coolingId: 'cool_stock_air',
    osId: 'os_windows7',
    targetCoin: 'BTC',
    overclockPct: 100,
    poolMode: 'PPS',
    payoutMode: 'AUTOSELL',
    firmwareProfile: 'BALANCED',
    pasteStepsRemaining: 12,
    soloBlocksWon: 0,
    lastStepBlockHit: false,
    illicitMod: null,
    enabled: true,
    gridX: 1 + (idx % 4),
    gridY: 1 + Math.floor(idx / 4),
    temperatureC: startFac.ambientTempC + 28,
    healthPct: 100,
    componentHealth: createInitialComponentHealth(0, 100),
    conditionTier: 'NEW',
    ageSteps: 0,
    failureCount: 0,
    purchasePriceUsd: 355,
    status: 'MINING',
    lastStepCoins: 0,
    lastStepUsd: 0,
    totalMinedCoins: 0,
    totalEarnedUsd: 0,
    createdStep: 0,
  });

  const rigCount = isSandbox && sandboxConfig ? sandboxConfig.startingRigs : 1;
  const starterRigs = Array.from({ length: rigCount }, (_, idx) => makeStarterRig(idx));

  const coins = createInitialCoins(runSeed);
  if (devMode || sandboxConfig?.unlockAllCoins) {
    (Object.keys(coins) as CoinSymbol[]).forEach((sym) => {
      coins[sym] = { ...coins[sym], unlocked: true };
    });
  }

  const startRegimes: MarketRegime[] = ['ACCUMULATION', 'BULL_RUN', 'ACCUMULATION'];
  const marketRegime =
    isSandbox && sandboxConfig
      ? sandboxConfig.marketRegime
      : startRegimes[Math.floor(rng() * startRegimes.length)];
  const regSpec = MARKET_REGIME_SPECS[marketRegime];
  const regimeStepsRemaining = Math.round(
    regSpec.minSteps + rng() * (regSpec.maxSteps - regSpec.minSteps)
  );

  const unlockedResearch =
    isSandbox && sandboxConfig?.unlockAllResearch
      ? RESEARCH_NODES.map((n) => n.id)
      : [];

  const ownedFacilityIds = Array.from(new Set(['fac_bedroom', startingFacilityId]));

  const baseState: GameState = {
    mode: 'PLAYING',
    difficulty,
    isSandbox,
    isDevSession: devMode,
    sandboxConfig,
    runSeed,
    stepCount: 0,
    soundEnabled: true,
    stepSeconds: 30,
    stepHours: 24,
    cash: startingCash,
    researchPoints: devMode ? 1000 : isSandbox ? 250 : difficulty === 'TYCOON_SANDBOX' ? 80 : 12,
    unlockedResearch,
    activeResearchId: null,
    activeResearchProgress: 0,
    facilityId: startingFacilityId,
    ownedFacilityIds,
    facilityUpgrades: {},
    facilityExtraRooms: 0,
    powerContractId: 'contract_standard',
    rigs: starterRigs,
    backupRigs: [],
    coolingUnits: [],
    usedMarketListings: [],
    usedMarketRefreshStep: 8,
    activeMarketModifiers: [],
    coins,
    wallet: buildDefaultWallet(undefined, coins),
    walletCostBasis: buildDefaultWallet(undefined, coins),
    limitOrders: [],
    shortPositions: [],
    fab: buildDefaultFab(),
    world: buildDefaultWorld(runSeed),
    seasonHistory: [],
    marketRegime,
    regimeStepsRemaining,
    employees: [],
    strikeStepsRemaining: 0,
    mediaCredibility: devMode ? 90 : 40,
    regulatoryScrutiny: 4,
    activeCampaigns: [],
    campaignCooldowns: {},
    rivals: createInitialRivals(runSeed),
    availableContracts: [],
    activeContract: null,
    underground: {
      powerSiphonActive: false,
      botnetCoin: null,
      botnetBonusHash: 0,
      botnetStepsRemaining: 0,
      washCooldownStep: 0,
      launderCooldownStep: 0,
      bribeProtectionSteps: 0,
      blackMarketListings: [],
      blackMarketRefreshStep: 15,
      shellCoins: [],
      raidCooldownStep: 0,
      suspiciousActivityScore: 0,
      investigationStage: 'NONE',
      investigationStepsRemaining: 0,
      scandalMarks: 0,
      marketConfidencePenaltyPct: 0,
      retaliationRiskPct: 0,
      preparedRaid: null,
      operationRecords: [],
    },
    pendingEvent: null,
    ledger: [],
    transactions: [],
    performanceHistory: [],
    currentCycleStats: {
      miningRevenueUsd: 0,
      electricitySpendUsd: 0,
      maintenanceSpendUsd: 0,
      otherSpendUsd: 0,
    },
    unlockedMilestones: [],
    unlockedAchievements: [],
    activeChallengeId: initialChallengeId,
    completedChallenges: [],
    failedChallenges: [],
    news: [
      {
        id: 'news_init',
        step: 0,
        stepLabel: 'Step 0',
        title: isSandbox
          ? `Sandbox Mode Online (${runSeed})`
          : devMode
          ? `Dev Sandbox Online (${runSeed})`
          : `Terminal Online (${runSeed})`,
        detail: isSandbox
          ? 'Sandbox mode active: isolated save slot. Experiment freely with facilities, contracts, power, and fleets.'
          : devMode
          ? 'Dev Mode active: all coins, parts, and dev event triggers unlocked.'
          : 'Mined coins auto-sell every step. Explore "power", "facilities", "usedmarket", "staff", "contracts", "rivals", and "stats".',
        category: 'MILESTONE',
      },
    ],
    competitorTechScore: 10,
    noiseFinesTotal: 0,
    stats: buildDefaultStats({
      usedOnlyEligible: initialChallengeId === 'challenge_used_only' ? true : true,
    }),
    tutorialStep: effectiveOnboarding === 'VETERAN' ? 0 : 1,
    onboardingMode: effectiveOnboarding,
    seenTutorials: [],
    claimedObjectives: [],
    devMode,
    devUnlockAll: devMode,
  };

  baseState.availableContracts = generateContractBoard(baseState, 4, {
    earlyCareer: !isSandbox && !devMode,
    includeStarter: effectiveOnboarding === 'GUIDED',
  });
  baseState.usedMarketListings = generateUsedMarketListings(baseState);
  baseState.underground.blackMarketListings = generateBlackMarketListings(baseState);
  return baseState;
}

export function claimCompletedObjectives(state: GameState): {
  nextState: GameState;
  newlyCompleted: EarlyObjective[];
} {
  const claimed = new Set(state.claimedObjectives ?? []);
  const allObjectives = evaluateEarlyObjectives(state);
  const newlyCompleted = allObjectives.filter((o) => o.completed && !claimed.has(o.id));
  if (newlyCompleted.length === 0) {
    return { nextState: state, newlyCompleted: [] };
  }

  let cashAdd = 0;
  let rpAdd = 0;
  const addedNews: NewsItem[] = [];
  const addedTx: TransactionEntry[] = [];
  const stepLabel = formatStepLabel(state.stepCount);

  for (const obj of newlyCompleted) {
    claimed.add(obj.id);
    cashAdd += obj.rewardCash;
    rpAdd += obj.rewardRp;
    addedNews.push({
      id: `news_obj_${obj.id}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      title: `Objective Complete: ${obj.title}`,
      detail: `Earned +${formatUsd(obj.rewardCash)} and +${obj.rewardRp} RP. Check "objectives" for your next goal.`,
      category: 'MILESTONE',
    });
    addedTx.push({
      id: `tx_obj_${obj.id}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      category: 'REWARD',
      amountUsd: obj.rewardCash,
      description: `Objective reward: ${obj.title}`,
    });
  }

  return {
    nextState: {
      ...state,
      cash: state.cash + cashAdd,
      researchPoints: state.researchPoints + rpAdd,
      claimedObjectives: Array.from(claimed),
      news: [...addedNews, ...state.news].slice(0, 60),
      transactions: [...addedTx, ...(state.transactions ?? [])].slice(0, 200),
    },
    newlyCompleted,
  };
}

function pickNextMarketRegime(
  current: MarketRegime,
  rng: () => number = Math.random
): { regime: MarketRegime; duration: number } {
  const transitions: Record<MarketRegime, MarketRegime[]> = {
    ACCUMULATION: ['BULL_RUN', 'BULL_RUN', 'CRYPTO_WINTER', 'ACCUMULATION'],
    BULL_RUN: ['MANIA_PEAK', 'CORRECTION', 'BULL_RUN'],
    MANIA_PEAK: ['CORRECTION', 'CORRECTION', 'CRYPTO_WINTER'],
    CORRECTION: ['ACCUMULATION', 'CRYPTO_WINTER', 'BULL_RUN'],
    CRYPTO_WINTER: ['ACCUMULATION', 'ACCUMULATION', 'BULL_RUN'],
  };
  const choices = transitions[current];
  const next = choices[Math.floor(rng() * choices.length)];
  const spec = MARKET_REGIME_SPECS[next];
  const duration = Math.round(spec.minSteps + rng() * (spec.maxSteps - spec.minSteps));
  return { regime: next, duration };
}

function createEconomicMarketModifier(
  step: number,
  rng: () => number = Math.random
): ActiveMarketModifier {
  const catalog: Omit<ActiveMarketModifier, 'id'>[] = [
    {
      type: 'HARDWARE_SHORTAGE',
      label: 'Global Silicon Shortage',
      stepsRemaining: 14,
      hardwarePriceMult: 1.28,
      powerRateMult: 1.0,
      resaleValueMult: 1.18,
      rivalGrowthMult: 0.9,
      coinPriceDriftDelta: 0.002,
      summary: 'New rig & part prices +28%, used resale values +18% for 14 steps.',
    },
    {
      type: 'HARDWARE_CRASH',
      label: 'Warehouse Hardware Liquidation',
      stepsRemaining: 12,
      hardwarePriceMult: 0.76,
      powerRateMult: 1.0,
      resaleValueMult: 0.85,
      rivalGrowthMult: 1.15,
      coinPriceDriftDelta: 0,
      summary: 'Surplus silicon floods distributors: new hardware -24% cost for 12 steps.',
    },
    {
      type: 'POWER_SPIKE',
      label: 'Utility Grid Rate Surge',
      stepsRemaining: 12,
      hardwarePriceMult: 1.0,
      powerRateMult: 1.32,
      resaleValueMult: 1.0,
      rivalGrowthMult: 0.92,
      coinPriceDriftDelta: 0,
      summary: 'Regional electricity spot tariffs spiked +32% for 12 steps.',
    },
    {
      type: 'POWER_REBATE',
      label: 'Hydro Surplus Tariff Rebate',
      stepsRemaining: 14,
      hardwarePriceMult: 1.0,
      powerRateMult: 0.74,
      resaleValueMult: 1.0,
      rivalGrowthMult: 1.1,
      coinPriceDriftDelta: 0,
      summary: 'Wholesale power surplus cuts electricity tariffs by 26% for 14 steps.',
    },
    {
      type: 'MINING_BOOM',
      label: 'Institutional Mining Boom',
      stepsRemaining: 12,
      hardwarePriceMult: 1.14,
      powerRateMult: 1.0,
      resaleValueMult: 1.15,
      rivalGrowthMult: 1.22,
      coinPriceDriftDelta: 0.012,
      summary: 'Strong coin inflows lift prices and hardware resale (+15%) for 12 steps.',
    },
    {
      type: 'MINING_CRASH',
      label: 'Liquidity Capitulation Wave',
      stepsRemaining: 10,
      hardwarePriceMult: 0.9,
      powerRateMult: 1.0,
      resaleValueMult: 0.8,
      rivalGrowthMult: 0.75,
      coinPriceDriftDelta: -0.014,
      summary: 'Market selloff depresses coin drift and used rig resale (-20%) for 10 steps.',
    },
    {
      type: 'HIGH_COMPETITION',
      label: 'Hashrate Arms Race',
      stepsRemaining: 14,
      hardwarePriceMult: 1.08,
      powerRateMult: 1.0,
      resaleValueMult: 1.05,
      rivalGrowthMult: 1.4,
      coinPriceDriftDelta: 0,
      summary: 'Rival syndicates aggressively expand capacity (+40% rival growth) for 14 steps.',
    },
    {
      type: 'HARDWARE_RELEASE',
      label: 'New Silicon Batch Launch',
      stepsRemaining: 12,
      hardwarePriceMult: 0.88,
      powerRateMult: 0.96,
      resaleValueMult: 0.9,
      rivalGrowthMult: 1.12,
      coinPriceDriftDelta: 0.003,
      summary: 'Next-gen fabrication lowers new hardware cost (-12%) for 12 steps.',
    },
    {
      type: 'EQUIPMENT_DEMAND',
      label: 'Unexpected Enterprise Rig Demand',
      stepsRemaining: 12,
      hardwarePriceMult: 1.12,
      powerRateMult: 1.0,
      resaleValueMult: 1.3,
      rivalGrowthMult: 1.0,
      coinPriceDriftDelta: 0,
      summary: 'Cloud brokers are buying up rigs: resale & salvage value +30% for 12 steps.',
    },
  ];

  const picked = catalog[Math.floor(rng() * catalog.length)];
  return {
    ...picked,
    id: `mod_${step}_${picked.type}`,
  };
}

export function generateInteractiveEvent(
  state: GameState,
  forcedCategory?: PendingEventCategory
): PendingEvent {
  return generateDynamicEvent(state, forcedCategory);
}

export function resolvePendingEvent(
  state: GameState,
  optionKey: string
): {
  nextState: GameState;
  ok: boolean;
  summary: string;
  milestoneHit: boolean;
  alertHit: boolean;
} {
  const evt = state.pendingEvent;
  if (!evt) {
    return { nextState: state, ok: false, summary: 'No active event.', milestoneHit: false, alertHit: false };
  }
  const choice = evt.options.find((o) => o.key === optionKey);
  if (!choice) {
    return {
      nextState: state,
      ok: false,
      summary: `Invalid choice "${optionKey}". Pick 1, 2, or 3.`,
      milestoneHit: false,
      alertHit: false,
    };
  }
  if (choice.costUsd && state.cash < choice.costUsd) {
    return {
      nextState: state,
      ok: false,
      summary: `Insufficient cash (${formatUsd(choice.costUsd)} needed) for option ${choice.key}.`,
      milestoneHit: false,
      alertHit: false,
    };
  }

  const stepLabel = formatStepLabel(state.stepCount);
  const spend = choice.costUsd ?? 0;
  let next: GameState = {
    ...state,
    pendingEvent: null,
    cash: state.cash - spend,
    currentCycleStats: {
      ...state.currentCycleStats,
      otherSpendUsd: state.currentCycleStats.otherSpendUsd + spend,
    },
    stats: { ...state.stats },
    underground: { ...state.underground },
    transactions: [...(state.transactions ?? [])],
  };

  if (spend > 0) {
    next.transactions.unshift({
      id: `tx_evt_${Date.now()}`,
      step: state.stepCount,
      stepLabel,
      category: 'EVENT',
      amountUsd: -spend,
      description: `${evt.title}: ${choice.label}`,
    });
  }

  let summary = '';
  let milestoneHit = false;
  let alertHit = false;
  const res = choice.resolutionId;

  const evtRng = createSeededRng(`${state.runSeed}|evt_res|${state.stepCount}|${evt.id}|${optionKey}`);
  const prSkill = getTopSkillForRole(state, 'PR_STRATEGIST');
  const resSkill = getTopSkillForRole(state, 'RESEARCHER');

  if (res === 'raid_bribe') {
    next.regulatoryScrutiny = Math.max(0, next.regulatoryScrutiny - 28);
    next.underground.bribeProtectionSteps = 10;
    next.stats.covertOpsCount += 1;
    next.stats.raidsSurvived += 1;
    next.stats.totalFinesAndBribesUsd += spend;
    summary = 'Inspectors looked the other way (-28 Heat, 10-step audit shield).';
    milestoneHit = true;
  } else if (res === 'raid_scrub') {
    next.underground.powerSiphonActive = false;
    next.underground.botnetStepsRemaining = 0;
    next.regulatoryScrutiny = Math.max(0, next.regulatoryScrutiny - 38);
    let stripped = false;
    next.rigs = next.rigs.map((r) => {
      if (!stripped && r.illicitMod) {
        stripped = true;
        return { ...r, illicitMod: null };
      }
      return r;
    });
    next.stats.raidsSurvived += 1;
    summary = `Logs wiped, covert links severed${stripped ? ', 1 illicit mod dumped' : ''} (-38 Heat).`;
  } else if (res === 'raid_resist') {
    const seizeChance = prSkill >= 2 ? 0.5 : 0.7;
    const seized = evtRng() < seizeChance;
    if (seized) {
      const fine = Math.max(300, Math.round(next.cash * 0.2));
      next.cash -= fine;
      next.stats.totalFinesAndBribesUsd += fine;
      next.regulatoryScrutiny = Math.max(10, next.regulatoryScrutiny - 30);
      next.mediaCredibility = Math.max(5, next.mediaCredibility - 10);
      next.transactions.unshift({
        id: `tx_fine_${Date.now()}`,
        step: state.stepCount,
        stepLabel,
        category: 'EVENT',
        amountUsd: -fine,
        description: 'Regulatory audit civil penalty',
      });
      summary = `Inspectors levied ${formatUsd(fine)} fine (-30 Heat, -10 Reputation).`;
      alertHit = true;
    } else {
      next.regulatoryScrutiny = Math.max(5, next.regulatoryScrutiny - 18);
      summary = 'Your lawyers blocked the warrant! (-18 Heat).';
      milestoneHit = true;
    }
    next.stats.raidsSurvived += 1;
  } else if (res === 'grid_pay') {
    summary = `Paid ${formatUsd(spend)} peak tariff. Fleet remains at full output.`;
  } else if (res === 'grid_eco') {
    next.rigs = next.rigs.map((r) => ({ ...r, firmwareProfile: 'ECO' as const }));
    summary = 'All rigs switched to ECO firmware (-20% draw, -28% heat).';
  } else if (res === 'grid_siphon') {
    next.underground.powerSiphonActive = true;
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 18);
    next.stats.covertOpsCount += 1;
    summary = 'Meter siphon wired! Electricity bills -65%, breaker cap +25% (+18 Heat).';
    alertHit = true;
  } else if (res === 'ops_rd_sprint') {
    const rpGain = 24 + resSkill * 5;
    next.researchPoints += rpGain;
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 4);
    summary = `Funded R&D telemetry sprint (+${rpGain}.0 RP, +4 Reputation).`;
    milestoneHit = true;
  } else if (res === 'ops_maint_pass') {
    next.rigs = next.rigs.map((r) => {
      const c = ensureRigComponentHealth(r);
      const heal = (v: number) => Math.min(100, Number((v + 12).toFixed(1)));
      const nextComp: RigComponentHealth = {
        chassis: heal(c.chassis),
        compute: heal(c.compute),
        gpus: c.gpus.map(heal),
        storage: heal(c.storage),
        psu: heal(c.psu),
        cooling: heal(c.cooling),
      };
      return {
        ...r,
        componentHealth: nextComp,
        healthPct: computeAverageRigHealth(nextComp),
        temperatureC: Math.max(20, r.temperatureC - 6),
        overclockPct: Math.min(100, r.overclockPct),
        status: r.status === 'FAILED' || r.status === 'NEEDS_REPAIR' ? (r.enabled ? 'MINING' : 'PAUSED') : r.status,
      };
    });
    summary = 'Performed fleet maintenance sweep (+12% component health, -6°C, OC capped to 100%).';
  } else if (res === 'ops_flip_lot' || res === 'fin_advance') {
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const gain = res === 'fin_advance' ? 650 : Math.round(Math.max(240, stepRev * 4.2) * 0.75);
    next.cash += gain;
    next.mediaCredibility = Math.max(5, next.mediaCredibility - (res === 'fin_advance' ? 6 : 2));
    next.transactions.unshift({
      id: `tx_lot_${Date.now()}`,
      step: state.stepCount,
      stepLabel,
      category: 'SALE',
      amountUsd: gain,
      description: res === 'fin_advance' ? 'Emergency hashrate advance' : 'Surplus hardware brokerage profit',
    });
    summary = `Secured +${formatUsd(gain)} cash reserve (${res === 'fin_advance' ? '-6' : '-2'} Reputation).`;
  } else if (res === 'strike_settle') {
    next.strikeStepsRemaining = 0;
    next.employees = next.employees.map((e) => ({
      ...e,
      morale: Math.min(100, Number(((e.morale ?? 50) + 30).toFixed(1))),
    }));
    summary = 'Retention package signed! Labor strike ended and crew morale surged (+30).';
    milestoneHit = true;
  } else if (res === 'strike_dayshifts') {
    next.strikeStepsRemaining = Math.min(2, next.strikeStepsRemaining ?? 0);
    next.employees = next.employees.map((e) => ({
      ...e,
      shift: 'DAY',
      morale: Math.min(100, Number(((e.morale ?? 50) + 18).toFixed(1))),
    }));
    summary = 'Moved crew to DAY shifts (+18 morale, strike reduced to 2 steps).';
  } else if (res === 'strike_hardline') {
    next.employees = next.employees.map((e) => ({
      ...e,
      morale: Math.max(0, Number(((e.morale ?? 50) - 10).toFixed(1))),
    }));
    summary = 'Held firm against union demands (-10 crew morale; strike continues).';
    alertHit = true;
  } else if (res === 'emp_sponsor') {
    const rpGain = 12 + resSkill * 4;
    next.researchPoints += rpGain;
    next.employees = next.employees.map((e) => ({
      ...e,
      morale: Math.min(100, Number(((e.morale ?? 80) + 18).toFixed(1))),
      experienceXp: (e.experienceXp ?? 0) + 40,
      skillLevel: Math.min(5, 1 + Math.floor(((e.experienceXp ?? 0) + 40) / 180)),
    }));
    summary = `Crew tools & bonus delivered (+18 morale, +${rpGain} RP, +40 XP to staff).`;
    milestoneHit = true;
  } else if (res === 'emp_overtime') {
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const bonus = Math.round(stepRev * 2.4);
    next.cash += bonus;
    next.employees = next.employees.map((e) => ({
      ...e,
      morale: Math.max(0, Number(((e.morale ?? 80) - 10).toFixed(1))),
    }));
    next.transactions.unshift({
      id: `tx_ot_${Date.now()}`,
      step: state.stepCount,
      stepLabel,
      category: 'REWARD',
      amountUsd: bonus,
      description: 'Crew overtime sprint output',
    });
    summary = `Overtime sprint generated +${formatUsd(bonus)} (-10 crew morale).`;
  } else if (res === 'emp_rest') {
    next.employees = next.employees.map((e) => ({
      ...e,
      morale: Math.min(100, Number(((e.morale ?? 80) + 14).toFixed(1))),
    }));
    summary = 'Granted paid recovery rotation (+14 morale across crew).';
  } else if (res === 'fac_retrofit') {
    next.regulatoryScrutiny = Math.max(0, next.regulatoryScrutiny - 10);
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 6);
    next.rigs = next.rigs.map((r) => {
      const c = ensureRigComponentHealth(r);
      const heal = (v: number) => Math.min(100, Number((v + 8).toFixed(1)));
      const nextComp: RigComponentHealth = {
        chassis: heal(c.chassis),
        compute: heal(c.compute),
        gpus: c.gpus.map(heal),
        storage: heal(c.storage),
        psu: heal(c.psu),
        cooling: heal(c.cooling),
      };
      return { ...r, componentHealth: nextComp, healthPct: computeAverageRigHealth(nextComp) };
    });
    summary = 'Completed facility retrofit (-10 Heat, +6 Reputation, +8% fleet health).';
    milestoneHit = true;
  } else if (res === 'fac_throttle') {
    next.rigs = next.rigs.map((r) => ({
      ...r,
      firmwareProfile: r.temperatureC >= 78 ? 'BALANCED' : r.firmwareProfile,
      temperatureC: Math.max(20, r.temperatureC - 6),
    }));
    summary = 'Temporarily cooled hot rigs (-6°C, BALANCED firmware).';
  } else if (res === 'fac_ignore') {
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const margin = Math.round(stepRev * 1.4);
    next.cash += margin;
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 12);
    next.mediaCredibility = Math.max(5, next.mediaCredibility - 5);
    summary = `Kept rigs maxed (+${formatUsd(margin)}, +12 Heat, -5 Reputation).`;
    alertHit = true;
  } else if (res === 'ind_foundry_hedge' || res === 'ind_foundry_sell' || res === 'ind_foundry_wait') {
    const mod = createMacroModifier('HARDWARE_SHORTAGE', state.stepCount);
    next.activeMarketModifiers = [...(next.activeMarketModifiers ?? []).filter((m) => m.type !== mod.type), mod];
    if (res === 'ind_foundry_hedge') {
      next.researchPoints += 16;
      summary = 'Locked wholesale supply (+16 RP) as Global Silicon Shortage hits (+25% HW price, +20% resale).';
    } else if (res === 'ind_foundry_sell') {
      const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
      const gain = Math.round(Math.max(220, stepRev * 3.2) * 0.65);
      next.cash += gain;
      summary = `Liquidated spare stock for +${formatUsd(gain)} as Silicon Shortage hits (+25% HW prices).`;
    } else {
      summary = 'Global Silicon Shortage active: hardware prices +25% for 10 steps.';
    }
  } else if (res === 'ind_energy_rebate') {
    const mod = createMacroModifier('POWER_REBATE', state.stepCount);
    next.activeMarketModifiers = [...(next.activeMarketModifiers ?? []).filter((m) => m.type !== mod.type), mod];
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 8);
    summary = 'Qualified for Clean-Grid Power Rebate (-20% electricity for 10 steps, +8 Reputation)!';
    milestoneHit = true;
  } else if (res === 'ind_energy_rd') {
    const rpGain = 14 + resSkill * 4;
    next.researchPoints += rpGain;
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 4);
    summary = `Joined grid-balancing R&D consortium (+${rpGain} RP, +4 Reputation).`;
  } else if (res === 'ind_energy_spike') {
    const mod = createMacroModifier('POWER_SPIKE', state.stepCount);
    next.activeMarketModifiers = [...(next.activeMarketModifiers ?? []).filter((m) => m.type !== mod.type), mod];
    summary = 'Commercial Power Tariff Spike active (+22% electricity costs for 8 steps).';
    alertHit = true;
  } else if (res === 'ind_etf_join' || res === 'ind_etf_data' || res === 'ind_etf_stay') {
    const mod = createMacroModifier('MINING_BOOM', state.stepCount);
    next.activeMarketModifiers = [...(next.activeMarketModifiers ?? []).filter((m) => m.type !== mod.type), mod];
    if (res === 'ind_etf_join') {
      next.mediaCredibility = Math.min(100, next.mediaCredibility + 10);
      summary = 'Co-marketed institutional liquidity wave (+10 Reputation, Mining Boom 10st).';
      milestoneHit = true;
    } else if (res === 'ind_etf_data') {
      const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
      const gain = Math.max(180, Math.round(stepRev * 2.2));
      next.cash += gain;
      summary = `Sold desk telemetry (+${formatUsd(gain)}) during Institutional Boom (10st).`;
    } else {
      next.researchPoints += 5;
      summary = 'Mining Boom modifier active for 10 steps (+5 RP).';
    }
  } else if (res === 'hw_comp_fix' || res === 'hw_fix') {
    const slot = evt.targetComponentSlot;
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const curComp = ensureRigComponentHealth(r);
      const nextComp = slot
        ? patchRigSingleSlot(r, curComp, slot, evt.targetGpuIdx, 100, true)
        : createInitialComponentHealth(r.gpuIds.length, 100);
      return {
        ...r,
        componentHealth: nextComp,
        healthPct: computeAverageRigHealth(nextComp),
        pasteStepsRemaining: 16,
        status: r.enabled ? 'MINING' : 'PAUSED',
      };
    });
    next.stats.repairsCompleted += 1;
    summary = `Replaced stressed ${slot ? slot.toUpperCase() : 'hardware'} module and repasted rig.`;
    milestoneHit = true;
  } else if (res === 'hw_comp_dump' || res === 'hw_research') {
    const slot = evt.targetComponentSlot ?? 'compute';
    const rpGain = 12 + resSkill * 3;
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const c = ensureRigComponentHealth(r);
      const nextComp = patchRigSingleSlot(r, c, slot, evt.targetGpuIdx, -24, false);
      return {
        ...r,
        componentHealth: nextComp,
        healthPct: computeAverageRigHealth(nextComp),
      };
    });
    next.researchPoints += rpGain;
    summary = `Captured diagnostic trace (+${rpGain}.0 RP, ${slot.toUpperCase()} took -24% wear).`;
  } else if (res === 'hw_comp_push' || res === 'hw_push') {
    const slot = evt.targetComponentSlot ?? 'compute';
    const bonus = Math.max(80, Math.round(state.rigs.reduce((s, r) => s + r.lastStepUsd, 0) * 2));
    next.cash += bonus;
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const c = ensureRigComponentHealth(r);
      const nextComp = patchRigSingleSlot(r, c, slot, evt.targetGpuIdx, -28, false);
      return {
        ...r,
        firmwareProfile: 'TURBO',
        temperatureC: Math.min(98, r.temperatureC + 12),
        componentHealth: nextComp,
        healthPct: computeAverageRigHealth(nextComp),
      };
    });
    next.transactions.unshift({
      id: `tx_push_${Date.now()}`,
      step: state.stepCount,
      stepLabel,
      category: 'EVENT',
      amountUsd: bonus,
      description: 'TURBO surge event bonus payout',
    });
    summary = `Pushed TURBO! Captured +${formatUsd(bonus)} surge payout at heavy ${slot.toUpperCase()} wear.`;
  } else if (res === 'rival_counter') {
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 8 + prSkill * 2);
    next.researchPoints += 15;
    if (evt.targetCoin) {
      const c = next.coins[evt.targetCoin];
      next.coins = {
        ...next.coins,
        [evt.targetCoin]: { ...c, sentiment: Math.min(100, c.sentiment + 18) },
      };
    }
    summary = `Counter-bounty boosted Reputation (+${8 + prSkill * 2}) and R&D (+15 RP).`;
    milestoneHit = true;
  } else if (res === 'rival_ddos') {
    next.rivals = next.rivals.map((rv) =>
      rv.id === evt.targetRivalId
        ? {
            ...rv,
            disruptedSteps: 10,
            hostility: Math.min(100, rv.hostility + 20),
            lastActionSummary: 'Under heavy DDoS disruption',
          }
        : rv
    );
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 16);
    next.stats.covertOpsCount += 1;
    summary = 'Syndicate knocked offline for 10 steps (+16 Heat).';
    alertHit = true;
  } else if (res === 'rival_ignore') {
    next.rivals = next.rivals.map((rv) =>
      rv.id === evt.targetRivalId
        ? {
            ...rv,
            hashPowerIndex: Math.round(rv.hashPowerIndex * 1.08),
            lastActionSummary: 'Captured extra pool share',
          }
        : rv
    );
    summary = 'Rival expanded hash share uncontested.';
  } else if (res === 'mkt_pump' && evt.targetCoin) {
    const c = next.coins[evt.targetCoin];
    const nextPrice = c.priceUsd * 1.22;
    next.coins = {
      ...next.coins,
      [evt.targetCoin]: {
        ...c,
        prevPriceUsd: c.priceUsd,
        priceUsd: nextPrice,
        sentiment: Math.min(100, c.sentiment + 24),
        priceHistory: [...c.priceHistory, { step: next.stepCount, stepLabel, price: nextPrice }].slice(-365),
      },
    };
    summary = `${evt.targetCoin} rallied +22% on liquidity injection!`;
    milestoneHit = true;
  } else if (res === 'mkt_wash' && evt.targetCoin) {
    const c = next.coins[evt.targetCoin];
    const nextPrice = c.priceUsd * 1.28;
    next.coins = {
      ...next.coins,
      [evt.targetCoin]: {
        ...c,
        prevPriceUsd: c.priceUsd,
        priceUsd: nextPrice,
        sentiment: Math.min(100, c.sentiment + 28),
        priceHistory: [...c.priceHistory, { step: next.stepCount, stepLabel, price: nextPrice }].slice(-365),
      },
    };
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 18);
    next.mediaCredibility = Math.max(5, next.mediaCredibility - 6);
    next.stats.covertOpsCount += 1;
    summary = `Illicit wash volume spiked ${evt.targetCoin} +28% (+18 Heat, -6 Reputation).`;
    alertHit = true;
  } else {
    if (evt.targetCoin) {
      const c = next.coins[evt.targetCoin];
      const swing = evtRng() < 0.5 ? 0.9 : 1.12;
      const nextPrice = Math.max(0.001, c.priceUsd * swing);
      next.coins = {
        ...next.coins,
        [evt.targetCoin]: {
          ...c,
          prevPriceUsd: c.priceUsd,
          priceUsd: nextPrice,
          priceHistory: [...c.priceHistory, { step: next.stepCount, stepLabel, price: nextPrice }].slice(-365),
        },
      };
    }
    next.researchPoints += 6;
    summary = 'Observed market clearing safely (+6.0 RP quant data).';
  }

  next.news = [
    {
      id: `news_evt_${Date.now()}`,
      step: next.stepCount,
      stepLabel,
      title: `Resolved: ${evt.title}`,
      detail: summary,
      category: evt.category === 'RAID' ? ('UNDERGROUND' as const) : ('MARKET' as const),
    },
    ...next.news,
  ].slice(0, 60);
  next.transactions = next.transactions.slice(0, 200);

  return { nextState: next, ok: true, summary, milestoneHit, alertHit };
}

export interface StepAdvanceResult {
  nextState: GameState;
  milestoneHit: boolean;
  alertHit: boolean;
  miningCashEarned: number;
  rpEarned: number;
  billsSettledUsd: number;
  soloBlocksHit: number;
  eventTriggered: PendingEvent | null;
}

export function advanceOneStep(prev: GameState): StepAdvanceResult {
  if (prev.pendingEvent) {
    return {
      nextState: prev,
      milestoneHit: false,
      alertHit: false,
      miningCashEarned: 0,
      rpEarned: 0,
      billsSettledUsd: 0,
      soloBlocksHit: 0,
      eventTriggered: prev.pendingEvent,
    };
  }

  const nextStep = prev.stepCount + 1;
  const stepLabel = formatStepLabel(nextStep);
  const stepRng = createSeededRng(`${prev.runSeed}|step|${nextStep}`);
  let idSeq = 0;
  const facility = getFacility(prev.facilityId);
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === prev.facilityId));
  const nextStats = buildDefaultStats(prev.stats);

  let milestoneHit = false;
  let alertHit = false;
  let soloBlocksHit = 0;

  const newNews: NewsItem[] = [...prev.news];
  const newTransactions: TransactionEntry[] = [...(prev.transactions ?? [])];

  const pushNews = (title: string, detail: string, category: NewsItem['category']) => {
    idSeq += 1;
    newNews.unshift({
      id: `news_${nextStep}_${idSeq}`,
      step: nextStep,
      stepLabel,
      title,
      detail,
      category,
    });
  };
  const pushTx = (category: TransactionCategory, amountUsd: number, description: string) => {
    if (Math.abs(amountUsd) < 0.01) return;
    idSeq += 1;
    newTransactions.unshift({
      id: `tx_${nextStep}_${idSeq}`,
      step: nextStep,
      stepLabel,
      category,
      amountUsd,
      description,
    });
  };

  // 1. Advance Market Regime & Economic Modifiers
  let nextRegime = prev.marketRegime;
  let nextRegimeRem = prev.regimeStepsRemaining - 1;
  if (nextRegimeRem <= 0) {
    const picked = pickNextMarketRegime(prev.marketRegime, stepRng);
    nextRegime = picked.regime;
    nextRegimeRem = picked.duration;
    const spec = MARKET_REGIME_SPECS[nextRegime];
    pushNews(`Market Cycle Shift: ${spec.label}`, spec.summary, 'MARKET');
  }
  const regimeSpec = MARKET_REGIME_SPECS[nextRegime];

  let nextModifiers = (prev.activeMarketModifiers ?? [])
    .map((m) => ({ ...m, stepsRemaining: m.stepsRemaining - 1 }))
    .filter((m) => m.stepsRemaining > 0);

  if (nextStep >= 8 && nextStep % 14 === 0 && nextModifiers.length < 2 && stepRng() < 0.65) {
    const newMod = createEconomicMarketModifier(nextStep, stepRng);
    nextModifiers = [...nextModifiers, newMod];
    pushNews(`Economic Shift: ${newMod.label}`, newMod.summary, 'MARKET');
  }

  const modCoinDrift = nextModifiers.reduce((s, m) => s + m.coinPriceDriftDelta, 0);
  const modRivalGrowth = nextModifiers.reduce((s, m) => s * m.rivalGrowthMult, 1.0);

  // 2. Process active PR campaigns
  const nextCampaigns = [];
  const prImpulseByCoin: Partial<Record<CoinSymbol, number>> = {};
  const prSentimentByCoin: Partial<Record<CoinSymbol, number>> = {};
  for (const camp of prev.activeCampaigns) {
    prImpulseByCoin[camp.targetCoin] =
      (prImpulseByCoin[camp.targetCoin] ?? 0) + camp.stepPriceImpulse;
    prSentimentByCoin[camp.targetCoin] =
      (prSentimentByCoin[camp.targetCoin] ?? 0) + camp.sentimentDeltaPerStep;
    if (camp.stepsRemaining > 1) {
      nextCampaigns.push({ ...camp, stepsRemaining: camp.stepsRemaining - 1 });
    } else {
      pushNews(
        `PR Campaign Concluded: ${camp.name}`,
        `Media momentum around ${camp.targetCoin} is normalizing.`,
        'PR'
      );
    }
  }

  // 3. Employee progression, workload, graduated morale & strike checks
  const techBonus = getTechnicianBonuses(prev);
  const elecBonus = getElectricianBonuses(prev);
  const mgrBonus = getManagerBonuses(prev);
  const empStep = stepEmployeesWorkloadAndMorale(prev, nextStep, stepLabel);
  const nextEmployees = empStep.nextEmployees;
  const nextStrikeSteps = empStep.nextStrikeSteps;
  const triggeredStrikeNow = empStep.triggeredStrikeNow;
  for (const al of empStep.alerts) {
    newNews.unshift(al);
    if (al.category === 'ALERT') alertHit = true;
  }
  const researchers = nextEmployees.filter((e) => e.role === 'RESEARCHER');

  // 4. Advance dynamic market prices, network difficulty & halvings
  const confidenceDragMult = Math.max(
    0.72,
    1 - (prev.underground?.marketConfidencePenaltyPct ?? 0) / 100
  );

  const nextCoins: Record<CoinSymbol, CoinMarketState> = { ...prev.coins };
  (Object.keys(nextCoins) as CoinSymbol[]).forEach((sym) => {
    const coin = nextCoins[sym];
    const logGap = Math.log(coin.basePriceUsd / Math.max(0.00001, coin.priceUsd));
    const pull = logGap * 0.045;

    const baseVol =
      0.036 *
      (coin.volatilityMult ?? (sym === 'DOGE' ? 1.94 : sym === 'XCH' ? 1.33 : 1.0));
    const randWave = (stepRng() - 0.5) * 2 * baseVol * regimeSpec.volatilityMult;
    const prBoost = prImpulseByCoin[sym] ?? 0;

    let nextSentiment = Math.max(
      -100,
      Math.min(100, coin.sentiment * 0.95 + (prSentimentByCoin[sym] ?? 0))
    );
    const sentimentDrift = (nextSentiment / 100) * 0.006;

    let nextCreatorMeta = coin.creatorMeta;
    let customAdoptionDrift = 0;
    if (coin.isPlayerCreated && nextCreatorMeta) {
      const hasActiveMiners = prev.rigs.some((r) => r.enabled && r.targetCoin === sym);
      const adoptDelta = (hasActiveMiners ? 0.6 : -0.25) + (nextSentiment > 10 ? 0.35 : 0);
      const nextAdoption = Math.max(
        5,
        Math.min(100, Number((nextCreatorMeta.adoptionScore + adoptDelta).toFixed(2)))
      );
      nextCreatorMeta = {
        ...nextCreatorMeta,
        adoptionScore: nextAdoption,
      };
      customAdoptionDrift = ((nextAdoption - 35) / 100) * 0.008;
    }

    let nextHalvingRem = coin.stepsUntilHalving - 1;
    let nextHalvingCount = coin.halvingCount;
    let nextBlockScale = coin.blockRewardScale;
    let nextBasePrice = coin.basePriceUsd;
    let halvingSupplyShock = 0;

    if (nextHalvingRem <= 0) {
      nextHalvingRem = coin.halvingEverySteps;
      nextHalvingCount += 1;
      nextBlockScale = Number((coin.blockRewardScale * 0.5).toFixed(4));
      // Emission halves permanently, but scarcity lifts the long-run fair value.
      // Without this ratchet the revenue curve collapses exponentially (~0.5x per
      // halving) and the late game becomes unplayable no matter the hardware.
      nextBasePrice = Number((coin.basePriceUsd * 1.22).toFixed(6));
      halvingSupplyShock = 0.24;
      nextSentiment = Math.min(100, nextSentiment + 26);
      milestoneHit = true;
      pushNews(
        `${coin.symbol} Block Halving #${nextHalvingCount}!`,
        `Block emission halved (x${nextBlockScale}); supply shock boosted ${coin.symbol} spot price +24% and lifted its long-run fair value +22%.`,
        'MILESTONE'
      );
    }

    const diffStepScale = 1 + 0.0022 + getRivalDifficultyRise(prev.rivals, sym);
    const nextDiff = Number(Math.min(12, coin.networkDifficulty * diffStepScale).toFixed(3));

    const scandalDrag = coin.isPlayerCreated ? (confidenceDragMult - 1) * 0.15 : 0;
    const multiplier = Math.max(
      0.55,
      1 +
        pull +
        randWave +
        regimeSpec.stepDrift +
        modCoinDrift +
        prBoost +
        sentimentDrift +
        customAdoptionDrift +
        scandalDrag +
        halvingSupplyShock
    );
    const nextPrice = Math.max(0.001, coin.priceUsd * multiplier);

    const history = [...coin.priceHistory, { step: nextStep, stepLabel, price: nextPrice }];
    if (history.length > 365) history.shift();

    nextCoins[sym] = {
      ...coin,
      prevPriceUsd: coin.priceUsd,
      priceUsd: nextPrice,
      basePriceUsd: nextBasePrice,
      priceHistory: history,
      sentiment: nextSentiment,
      networkDifficulty: nextDiff,
      stepsUntilHalving: nextHalvingRem,
      halvingCount: nextHalvingCount,
      blockRewardScale: nextBlockScale,
      creatorMeta: nextCreatorMeta,
    };
  });

  // 5. RP generation & active research progress
  const stepRp =
    0.75 +
    researchers.reduce((sum, r) => {
      const mult = r.shift === 'ROTATION_24_7' ? 1.35 : 1.0;
      const prio = r.priority === 'RESEARCH_OUTPUT' ? 1.35 : 1.0;
      const skill = 1 + ((r.skillLevel ?? 1) - 1) * 0.22;
      const moraleEff = getEmployeeEfficiencyMult(r, nextStrikeSteps);
      return sum + 4.5 * mult * prio * skill * moraleEff;
    }, 0);

  let nextRp = prev.researchPoints + stepRp;
  let nextActiveResearchId = prev.activeResearchId;
  let nextActiveProgress = prev.activeResearchProgress;
  const nextUnlocked = [...prev.unlockedResearch];

  if (nextActiveResearchId) {
    const node = RESEARCH_NODES.find((n) => n.id === nextActiveResearchId);
    if (node) {
      const rpSpend = Math.min(nextRp, 4 + researchers.length * 3.5);
      nextRp -= rpSpend;
      nextActiveProgress += rpSpend;
      if (nextActiveProgress >= node.costRp) {
        nextUnlocked.push(node.id);
        nextActiveResearchId = null;
        nextActiveProgress = 0;
        milestoneHit = true;
        pushNews(`Research Complete: ${node.name}`, node.effectSummary, 'FACILITY');
      }
    }
  }

  // 6. Fleet power, breaker cap & noise check
  const sysBonus = getSysEngineerBonus(prev);
  let totalWallWatts = 0;
  let loudestRigDba = 28;
  const enabledRigsCount = prev.rigs.filter((r) => r.enabled && r.status !== 'FAILED').length;

  for (const r of prev.rigs) {
    if (!r.enabled || r.status === 'FAILED') continue;
    const t = computeRigTelemetry(
      r,
      facility,
      nextUnlocked,
      sysBonus,
      prev.coolingUnits ?? [],
      enabledRigsCount,
      prev.facilityUpgrades,
      elecBonus.powerWasteReduction,
      prev.facilityExtraRooms ?? 0,
      nextCoins
    );
    totalWallWatts += t.wallWatts;
    loudestRigDba = Math.max(loudestRigDba, t.noiseDba);
  }

  const coolingSummary = computeFacilityCoolingSummary(
    prev.coolingUnits ?? [],
    enabledRigsCount,
    facility,
    prev.facilityUpgrades
  );
  totalWallWatts += coolingSummary.totalCoolingWatts;
  const peakNoiseDba = getFacilityNoiseDba(loudestRigDba, enabledRigsCount, coolingSummary.maxCoolingNoiseDba);

  const totalPowerKw = totalWallWatts / 1000;
  nextStats.maxPowerKwObserved = Math.max(nextStats.maxPowerKwObserved, Number(totalPowerKw.toFixed(2)));
  const effectivePowerCap = getEffectiveFacilityPowerCapKw(prev);
  const breakerOverloaded = totalPowerKw > effectivePowerCap;
  const noiseExceeded = peakNoiseDba > facility.noiseLimitDba;

  const exStep = stepExchangeOrdersAndShorts(
    {
      cash: prev.cash,
      wallet: buildDefaultWallet(prev.wallet, nextCoins),
      walletCostBasis: buildDefaultWallet(prev.walletCostBasis, nextCoins),
      limitOrders: prev.limitOrders ?? [],
      shortPositions: prev.shortPositions ?? [],
      unlockedResearch: nextUnlocked,
      employees: nextEmployees,
    },
    nextCoins,
    nextStep,
    stepLabel
  );
  if (exStep.alertHit) alertHit = true;
  if (exStep.news.length > 0) newNews.unshift(...exStep.news);
  if (exStep.transactions.length > 0) newTransactions.unshift(...exStep.transactions);

  const fabStep = stepFabProduction(prev.fab, nextStep, stepLabel);
  if (fabStep.news.length > 0) {
    newNews.unshift(...fabStep.news);
    milestoneHit = true;
  }

  let nextCash = exStep.cash;
  const nextWallet = { ...exStep.wallet };
  const nextWalletBasis = { ...exStep.walletCostBasis };
  let stepMiningUsd = 0;
  let stepNoiseFine = 0;
  let stepFleetEffectiveHash = 0;
  let anyFailureOrOverheatThisStep = breakerOverloaded;
  const stepCoinUsdEarned: Partial<Record<CoinSymbol, number>> = {};

  if (noiseExceeded && enabledRigsCount > 0 && nextStep % 5 === 0) {
    stepNoiseFine = Math.round((peakNoiseDba - facility.noiseLimitDba) * 4.5);
    nextCash -= stepNoiseFine;
    alertHit = true;
    pushTx('EVENT', -stepNoiseFine, `Noise ordinance fine (${Math.round(peakNoiseDba)} dBA)`);
    pushNews(
      'Noise Ordinance Fine',
      `Facility noise (${Math.round(peakNoiseDba)} dBA) exceeded ${facility.noiseLimitDba} dBA limit. Fined $${stepNoiseFine}.`,
      'ALERT'
    );
  }

  const sanctionPayoutMult =
    prev.underground?.investigationStage === 'SANCTIONED' ? 0.85 : 1.0;
  const autoSellMult =
    getAutoSellMultiplier({
      unlockedResearch: nextUnlocked,
      employees: nextEmployees,
      strikeStepsRemaining: nextStrikeSteps,
    }) * sanctionPayoutMult;

  // 7. Step each mining rig + condition wear, failures, auto-maintenance, and payouts
  const nextRigs: MiningRig[] = prev.rigs.map((rig) => {
    const baseAge = (rig.ageSteps ?? 0) + 1;

    if (rig.status === 'FAILED') {
      anyFailureOrOverheatThisStep = true;
      return {
        ...rig,
        ageSteps: baseAge,
        temperatureC: Math.max(facility.ambientTempC, rig.temperatureC - 6),
        lastStepCoins: 0,
        lastStepUsd: 0,
        lastStepBlockHit: false,
      };
    }

    if (!rig.enabled) {
      return {
        ...rig,
        ageSteps: baseAge,
        temperatureC: Math.max(facility.ambientTempC, rig.temperatureC - 6),
        status: rig.healthPct <= 20 ? 'NEEDS_REPAIR' : 'PAUSED',
        lastStepCoins: 0,
        lastStepUsd: 0,
        lastStepBlockHit: false,
      };
    }

    if (rig.healthPct <= 20) {
      anyFailureOrOverheatThisStep = true;
      return {
        ...rig,
        ageSteps: baseAge,
        temperatureC: Math.max(facility.ambientTempC, rig.temperatureC - 4),
        status: 'NEEDS_REPAIR',
        lastStepCoins: 0,
        lastStepUsd: 0,
        lastStepBlockHit: false,
      };
    }

    const coin = nextCoins[rig.targetCoin];
    if (!coin || !coin.unlocked) {
      return {
        ...rig,
        ageSteps: baseAge,
        status: 'COIN_LOCKED',
        lastStepCoins: 0,
        lastStepUsd: 0,
        lastStepBlockHit: false,
      };
    }

    const telemetry = computeRigTelemetry(
      rig,
      facility,
      nextUnlocked,
      sysBonus,
      prev.coolingUnits ?? [],
      enabledRigsCount,
      prev.facilityUpgrades,
      elecBonus.powerWasteReduction,
      prev.facilityExtraRooms ?? 0,
      nextCoins
    );

    let nextTemp = Math.round(rig.temperatureC * 0.4 + telemetry.equilibriumTempC * 0.6);
    if (techBonus.hasThermalTech && nextTemp > 84) {
      nextTemp = Math.max(79, nextTemp - 5);
    }

    let status: MiningRig['status'] = 'MINING';
    let efficiencyFactor = nextStrikeSteps > 0 ? 0.65 : 1.0;

    if (telemetry.isUnderpowered || breakerOverloaded) {
      status = 'UNDERPOWERED';
      efficiencyFactor = 0;
      anyFailureOrOverheatThisStep = true;
    } else if (nextTemp >= 96) {
      status = 'OVERHEATED';
      efficiencyFactor = 0;
      anyFailureOrOverheatThisStep = true;
      if (rig.status !== 'OVERHEATED') {
        alertHit = true;
        pushNews(
          `Thermal Shutdown: ${rig.name}`,
          `Reached ${nextTemp}°C. Switch to ECO firmware, repaste, or add cooling.`,
          'ALERT'
        );
      }
    } else if (nextTemp >= 82 || noiseExceeded) {
      status = 'THROTTLED';
      if (noiseExceeded) efficiencyFactor *= 0.8;
    }

    const finalTelemetry = computeRigTelemetry(
      { ...rig, temperatureC: nextTemp },
      facility,
      nextUnlocked,
      sysBonus,
      prev.coolingUnits ?? [],
      enabledRigsCount,
      prev.facilityUpgrades,
      elecBonus.powerWasteReduction,
      prev.facilityExtraRooms ?? 0,
      nextCoins
    );

    // Subtle generational competitiveness scaling: older hardware still mines profitably on matched tiers,
    // while Gen 3/4 out-scales global difficulty growth cleanly.
    const gen = getRigGeneration(rig);
    const genFactor =
      prev.competitorTechScore > 45 && gen === 1
        ? 0.92
        : 1.0;
    const weightedHash = finalTelemetry.effectiveHashrate * genFactor;
    stepFleetEffectiveHash += weightedHash;

    const { minedCoins, autoSoldUsd, soloBlockHit } = computeStepCoinOutput(
      weightedHash,
      coin,
      efficiencyFactor,
      autoSellMult,
      rig.poolMode,
      false,
      stepRng
    );

    const isHold = rig.payoutMode === 'HOLD';
    const rigStepUsd = !isHold ? autoSoldUsd : 0;

    if (soloBlockHit) {
      soloBlocksHit += 1;
      milestoneHit = true;
      pushNews(
        `SOLO BLOCK HIT! ${rig.name}`,
        isHold
          ? `Found an independent ${rig.targetCoin} block: +${minedCoins.toFixed(6)} ${rig.targetCoin} vaulted to wallet!`
          : `Found an independent ${rig.targetCoin} block: +${formatUsd(autoSoldUsd)} auto-sold!`,
        'MILESTONE'
      );
    }

    if (minedCoins > 0) {
      const targetC = nextCoins[rig.targetCoin];
      if (targetC.isPlayerCreated && targetC.creatorMeta && targetC.creatorMeta.creatorFeePct > 0) {
        const feeUsd = Math.max(0, minedCoins * targetC.priceUsd * (targetC.creatorMeta.creatorFeePct / 100));
        if (feeUsd > 0) {
          nextCash += feeUsd;
          stepMiningUsd += feeUsd;
          nextStats.totalRevenueUsd += feeUsd;
        }
        nextCoins[rig.targetCoin] = {
          ...targetC,
          creatorMeta: {
            ...targetC.creatorMeta,
            totalSupplyMinted: targetC.creatorMeta.totalSupplyMinted + minedCoins,
          },
        };
      }
      if (isHold) {
        nextWallet[rig.targetCoin] = (nextWallet[rig.targetCoin] ?? 0) + minedCoins;
        nextCoins[rig.targetCoin] = {
          ...nextCoins[rig.targetCoin],
          totalMined: nextCoins[rig.targetCoin].totalMined + minedCoins,
        };
      } else if (autoSoldUsd > 0) {
        nextCash += autoSoldUsd;
        stepMiningUsd += autoSoldUsd;
        nextStats.totalRevenueUsd += autoSoldUsd;
        stepCoinUsdEarned[rig.targetCoin] =
          (stepCoinUsdEarned[rig.targetCoin] ?? 0) + autoSoldUsd;
        nextCoins[rig.targetCoin] = {
          ...nextCoins[rig.targetCoin],
          totalMined: nextCoins[rig.targetCoin].totalMined + minedCoins,
          totalEarnedUsd: nextCoins[rig.targetCoin].totalEarnedUsd + autoSoldUsd,
        };
      }
    }

    const fwWearMult = FIRMWARE_PROFILE_SPECS[rig.firmwareProfile].wearMult;
    const modWearMult = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod].wearMult : 1;
    const ocWearMult = rig.overclockPct > 100 ? 1 + (rig.overclockPct - 100) / 80 : 1;
    const distWearRelief = Math.max(0.65, 1 - (prev.facilityUpgrades?.power_distribution ?? 0) * 0.1);
    const condTierWear =
      rig.conditionTier === 'DAMAGED' ? 1.35 : rig.conditionTier === 'USED' ? 1.15 : 1.0;
    const baseWear = nextTemp > 86 ? 0.95 : nextTemp > 76 ? 0.36 : 0.17;
    const totalWear =
      baseWear *
      fwWearMult *
      modWearMult *
      ocWearMult *
      distWearRelief *
      condTierWear *
      (1 - techBonus.wearReduction);

    const compH = ensureRigComponentHealth(rig);
    const { psu, storage, os } = getPartBundle(rig);
    const psuRatio = psu.maxWatts > 0 ? finalTelemetry.rawWatts / psu.maxWatts : 1;
    const cp = rig.customParts;
    const applyDelta = (cur: number, mult: number, resistance = 0) => {
      const jitter = 0.85 + stepRng() * 0.3;
      const resMult = Math.max(0.55, 1 - Math.max(0, Math.min(0.45, resistance)));
      const nextVal = cur - totalWear * mult * resMult * jitter + techBonus.repairPerStep;
      return Number(Math.max(20, Math.min(100, nextVal)).toFixed(1));
    };

    const nextCompHealth: RigComponentHealth = {
      chassis: applyDelta(compH.chassis, 0.4, cp?.chassis?.wearResistance ?? 0),
      compute: applyDelta(
        compH.compute,
        nextTemp > 80 ? 1.4 : 1.15,
        cp?.compute?.wearResistance ?? 0
      ),
      gpus: compH.gpus.map((gh, gi) =>
        applyDelta(gh, nextTemp > 80 ? 1.45 : 1.25, cp?.gpus?.[gi]?.wearResistance ?? 0)
      ),
      storage: applyDelta(
        compH.storage,
        storage.storageTb >= 40 ? 0.95 : 0.65,
        cp?.storage?.wearResistance ?? 0
      ),
      psu: applyDelta(compH.psu, psuRatio > 0.85 ? 1.4 : 1.0, cp?.psu?.wearResistance ?? 0),
      cooling: applyDelta(
        compH.cooling,
        rig.firmwareProfile === 'TURBO' ? 1.25 : 0.95,
        cp?.cooling?.wearResistance ?? 0
      ),
    };
    const nextHealth = computeAverageRigHealth(nextCompHealth);
    const minCompHealth = Math.min(
      nextCompHealth.chassis,
      nextCompHealth.compute,
      nextCompHealth.storage,
      nextCompHealth.psu,
      nextCompHealth.cooling,
      ...(nextCompHealth.gpus.length > 0 ? nextCompHealth.gpus : [100])
    );

    // Spontaneous hardware failure risk when condition < 65% or running very hot
    const telemetrySafety = nextUnlocked.includes('res_predictive_telemetry') ? 0.65 : 1.0;
    const stabOffset = Math.max(0.45, 1 - os.stabilityBonus);
    let failChance = 0;
    if (minCompHealth < 62) {
      failChance = ((62 - minCompHealth) / 100) * 0.08 * telemetrySafety * stabOffset;
    }
    if (nextTemp > 88) {
      failChance += 0.03 * telemetrySafety;
    }

    let finalCompHealth = nextCompHealth;
    let finalHealth = nextHealth;
    let finalStatus: MiningRig['status'] =
      nextHealth <= 20 || minCompHealth <= 20 ? 'NEEDS_REPAIR' : status;
    let nextFailures = rig.failureCount ?? 0;
    if (failChance > 0 && stepRng() < failChance) {
      finalStatus = 'FAILED';
      nextFailures += 1;
      nextStats.equipmentFailuresCount += 1;
      anyFailureOrOverheatThisStep = true;
      alertHit = true;

      // Target the lowest-health component slot specifically
      const candidates: { slot: RepairComponentSlot; gpuIdx?: number; val: number; label: string }[] = [
        { slot: 'compute', val: nextCompHealth.compute, label: 'Compute' },
        { slot: 'psu', val: nextCompHealth.psu, label: 'PSU' },
        { slot: 'cooling', val: nextCompHealth.cooling, label: 'Cooling' },
        { slot: 'storage', val: nextCompHealth.storage, label: 'Storage' },
        ...nextCompHealth.gpus.map((g, gi) => ({
          slot: 'gpu' as const,
          gpuIdx: gi,
          val: g,
          label: `GPU #${gi + 1}`,
        })),
      ];
      candidates.sort((a, b) => a.val - b.val);
      const faultPart = candidates[0];
      finalCompHealth = patchRigSingleSlot(rig, nextCompHealth, faultPart.slot, faultPart.gpuIdx, 18, true);
      finalHealth = computeAverageRigHealth(finalCompHealth);
      const repairHint =
        faultPart.slot === 'gpu' && faultPart.gpuIdx !== undefined
          ? `repair ${rig.name} gpu ${faultPart.gpuIdx + 1}`
          : `repair <rig#> ${faultPart.slot}`;
      pushNews(
        `Component Failure: ${rig.name} (${faultPart.label})`,
        `${faultPart.label} dropped to 18% health (Rig Avg ${finalHealth.toFixed(0)}%). Run "inspect <#>" or "${repairHint}".`,
        'ALERT'
      );
    }

    const nextPaste =
      nextUnlocked.includes('res_auto_maint') && rig.pasteStepsRemaining <= 2
        ? 12
        : Math.max(0, rig.pasteStepsRemaining - 1);

    return {
      ...rig,
      ageSteps: baseAge,
      temperatureC: nextTemp,
      componentHealth: finalCompHealth,
      healthPct: finalHealth,
      pasteStepsRemaining: nextPaste,
      failureCount: nextFailures,
      status: finalStatus,
      soloBlocksWon: rig.soloBlocksWon + (soloBlockHit ? 1 : 0),
      lastStepBlockHit: soloBlockHit,
      lastStepCoins: minedCoins,
      lastStepUsd: rigStepUsd,
      totalMinedCoins: rig.totalMinedCoins + minedCoins,
      totalEarnedUsd: rig.totalEarnedUsd + rigStepUsd,
    };
  });

  // Track pristine condition streak for challenge
  const activeAvgHealth =
    nextRigs.filter((r) => r.enabled).length > 0
      ? nextRigs.filter((r) => r.enabled).reduce((s, r) => s + r.healthPct, 0) /
        nextRigs.filter((r) => r.enabled).length
      : 0;
  if (nextRigs.filter((r) => r.enabled).length >= 3 && activeAvgHealth >= 90) {
    nextStats.pristineHealthStreak = (nextStats.pristineHealthStreak ?? 0) + 1;
  } else {
    nextStats.pristineHealthStreak = 0;
  }

  // 8. Underground active ops
  const nextUnderground = { ...prev.underground };
  let stepScrutinyDelta = nextUnderground.bribeProtectionSteps > 0 ? -0.35 : -0.15;

  if (nextUnderground.powerSiphonActive) {
    stepScrutinyDelta += nextUnderground.bribeProtectionSteps > 0 ? 0.45 : 1.7;
  }

  if (nextUnderground.botnetStepsRemaining > 0 && nextUnderground.botnetCoin) {
    const bCoin = nextCoins[nextUnderground.botnetCoin];
    const botnetRes = computeStepCoinOutput(
      nextUnderground.botnetBonusHash,
      bCoin,
      1,
      autoSellMult,
      'PPS',
      true
    );
    if (botnetRes.autoSoldUsd > 0) {
      nextCash += botnetRes.autoSoldUsd;
      stepMiningUsd += botnetRes.autoSoldUsd;
      nextStats.totalRevenueUsd += botnetRes.autoSoldUsd;
      stepCoinUsdEarned[bCoin.symbol] =
        (stepCoinUsdEarned[bCoin.symbol] ?? 0) + botnetRes.autoSoldUsd;
      nextCoins[bCoin.symbol] = {
        ...nextCoins[bCoin.symbol],
        totalMined: nextCoins[bCoin.symbol].totalMined + botnetRes.minedCoins,
        totalEarnedUsd: nextCoins[bCoin.symbol].totalEarnedUsd + botnetRes.autoSoldUsd,
      };
    }
    nextUnderground.botnetStepsRemaining -= 1;
    stepScrutinyDelta += nextUnderground.bribeProtectionSteps > 0 ? 0.6 : 2.3;
    if (nextUnderground.botnetStepsRemaining === 0) {
      nextUnderground.botnetCoin = null;
      nextUnderground.botnetBonusHash = 0;
      pushNews('Botnet Lease Expired', 'Rented shadow nodes disconnected cleanly.', 'UNDERGROUND');
    }
  }

  if ((nextUnderground.raidStepsRemaining ?? 0) > 0 && nextUnderground.raidCoin) {
    const rCoin = nextCoins[nextUnderground.raidCoin];
    const raidRes = computeStepCoinOutput(
      nextUnderground.raidBonusHash ?? 0,
      rCoin,
      1,
      autoSellMult,
      'PPS',
      true
    );
    if (raidRes.autoSoldUsd > 0) {
      nextCash += raidRes.autoSoldUsd;
      stepMiningUsd += raidRes.autoSoldUsd;
      nextStats.totalRevenueUsd += raidRes.autoSoldUsd;
      stepCoinUsdEarned[rCoin.symbol] =
        (stepCoinUsdEarned[rCoin.symbol] ?? 0) + raidRes.autoSoldUsd;
      nextCoins[rCoin.symbol] = {
        ...nextCoins[rCoin.symbol],
        totalMined: nextCoins[rCoin.symbol].totalMined + raidRes.minedCoins,
        totalEarnedUsd: nextCoins[rCoin.symbol].totalEarnedUsd + raidRes.autoSoldUsd,
      };
    }
    nextUnderground.raidStepsRemaining = (nextUnderground.raidStepsRemaining ?? 0) - 1;
    stepScrutinyDelta += nextUnderground.bribeProtectionSteps > 0 ? 0.5 : 1.9;
    if (nextUnderground.raidStepsRemaining === 0) {
      nextUnderground.raidBonusHash = 0;
      nextUnderground.raidCoin = undefined;
      pushNews(
        'Hijacked Hash Expired',
        `${nextUnderground.raidSourceName ?? 'A rival'}'s racks were re-secured. The free hashrate is gone.`,
        'UNDERGROUND'
      );
      nextUnderground.raidSourceName = undefined;
    }
  }

  if (nextUnderground.bribeProtectionSteps > 0) {
    nextUnderground.bribeProtectionSteps -= 1;
  }

  if (nextStep >= nextUnderground.blackMarketRefreshStep) {
    nextUnderground.blackMarketListings = generateBlackMarketListings({
      stepCount: nextStep,
      coins: nextCoins,
      runSeed: prev.runSeed,
      rigs: nextRigs,
    });
    nextUnderground.blackMarketRefreshStep = nextStep + 15;
  }

  const shellStep = stepShellCoins(nextUnderground, nextStep, prev.runSeed);
  let nextUgAfterShell = shellStep.underground;
  for (const dead of shellStep.collapsed) {
    pushNews(
      `Shell Coin Collapsed: $${dead.ticker}`,
      `$${dead.ticker} ("${dead.name}") lost all hype. Price flatlined at $0.0001 and the pool dried up.`,
      'UNDERGROUND'
    );
  }

  // Used Equipment Market Refresh every 10 steps
  let nextUsedListings = prev.usedMarketListings ?? [];
  let nextUsedRefresh = prev.usedMarketRefreshStep ?? nextStep + 10;
  if (nextStep >= nextUsedRefresh || nextUsedListings.length === 0) {
    nextUsedListings = generateUsedMarketListings({
      stepCount: nextStep,
      unlockedResearch: nextUnlocked,
      coins: nextCoins,
      runSeed: prev.runSeed,
      activeMarketModifiers: nextModifiers,
      devUnlockAll: prev.devUnlockAll,
    });
    nextUsedRefresh = nextStep + 10;
  }

  const nextScrutiny = Math.max(0, Math.min(100, prev.regulatoryScrutiny + stepScrutinyDelta));
  const invStep = advanceUndergroundInvestigation(
    nextUgAfterShell,
    nextScrutiny,
    nextStep,
    stepLabel,
    prev.runSeed
  );
  nextUgAfterShell = invStep.underground;
  if (invStep.news.length > 0) newNews.unshift(...invStep.news);
  if (invStep.alertHit) alertHit = true;
  if (invStep.sanctionFineUsd > 0) {
    nextCash -= invStep.sanctionFineUsd;
    nextStats.totalFinesAndBribesUsd += invStep.sanctionFineUsd;
    pushTx('EVENT', -invStep.sanctionFineUsd, 'Regulatory sanctions compliance penalty');
  }
  Object.assign(nextUnderground, nextUgAfterShell);

  const nextCredibility = Math.min(100, prev.mediaCredibility + 0.08);

  // 9. Update rival companies & market share
  const playerPowerScore = computeFleetHashIndex(stepFleetEffectiveHash, nextRigs.length);
  nextStats.peakFleetHashScore = Math.max(nextStats.peakFleetHashScore, playerPowerScore);

  // 9b. Advance the shared blockchain world (simulated locally until multiplayer lands)
  const worldStep = stepSharedWorld(
    prev.world,
    { ...prev, coins: nextCoins, stepCount: nextStep },
    playerPowerScore
  );
  const nextWorld = {
    ...worldStep.nextWorld,
    seasonId: getSeasonId(nextStep),
    seasonLabel: `Season ${getSeasonId(nextStep)} · ${getSeasonLabel(getSeasonId(nextStep))}`,
  };
  (Object.keys(worldStep.rewardByCoin) as CoinSymbol[]).forEach((sym) => {
    const amount = worldStep.rewardByCoin[sym] ?? 0;
    if (amount > 0) nextWallet[sym] = (nextWallet[sym] ?? 0) + amount;
  });
  if (worldStep.block && worldStep.block.winnerName === 'You' && worldStep.block.playerRewardCoins > 0) {
    milestoneHit = true;
    pushNews(
      `World Block #${worldStep.block.height} Won`,
      `Your fleet captured block #${worldStep.block.height}: +${worldStep.block.playerRewardCoins.toFixed(
        4
      )} ${worldStep.block.coin} (${formatUsd(
        worldStep.block.playerRewardUsd
      )}) credited to your wallet.`,
      'MILESTONE'
    );
  }

  const modPowerMult = nextModifiers.reduce((s, m) => s * m.powerRateMult, 1.0);
  const miningByDesk: Partial<Record<CoinSymbol, number>> = {};
  for (const rig of nextRigs) {
    const value = rig.lastStepCoins * (nextCoins[rig.targetCoin]?.priceUsd ?? 0);
    miningByDesk[rig.targetCoin] = (miningByDesk[rig.targetCoin] ?? 0) + value;
  }
  const topDesk = Object.entries(miningByDesk).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  const calibratedRivals = stepRivalSyndicates(
    prev.rivals,
    nextStep,
    nextRegime,
    playerPowerScore,
    modRivalGrowth,
    prev.runSeed,
    modPowerMult,
    { coins: nextCoins, playerPrimaryCoin: (topDesk?.[1] ?? 0) >= 120 ? topDesk?.[0] : undefined }
  );
  for (const [idx, rival] of calibratedRivals.entries()) {
    const previous = prev.rivals[idx];
    if (previous.specialtyCoin !== rival.specialtyCoin) {
      pushNews(`${rival.name} shifts to ${rival.specialtyCoin}`,
        `The ${rival.specialtyCoin} network will face more competition. Run "rivals markets ${rival.specialtyCoin}" to see who is mining there.`, 'MARKET');
    }
  }

  // 10. Active Contract tracking (including expanded contract types)
  let nextActiveContract = prev.activeContract ? { ...prev.activeContract } : null;
  let nextAvailableContracts = prev.availableContracts;
  nextStats.soloBlocksHit += soloBlocksHit;
  let finalCredibility = nextCredibility;
  let finalRp = nextRp;
  const earningRigs = nextRigs.filter((rig) => rig.lastStepCoins > 0).length;

  if (nextActiveContract) {
    nextActiveContract.stepsRemaining -= 1;
    if (nextActiveContract.type === 'COIN_REVENUE' && nextActiveContract.targetCoin) {
      nextActiveContract.progress += stepCoinUsdEarned[nextActiveContract.targetCoin] ?? 0;
    } else if (nextActiveContract.type === 'POOL_HASH') {
      nextActiveContract.progress += stepMiningUsd;
    } else if (nextActiveContract.type === 'LOW_NOISE_RUN') {
      const quietLimit = Math.min(facility.noiseLimitDba - 4, nextActiveContract.targetNoiseDba ?? Infinity);
      const hasOutput = nextActiveContract.targetNoiseDba === undefined ? enabledRigsCount > 0 : earningRigs > 0;
      if (peakNoiseDba <= quietLimit && hasOutput) {
        nextActiveContract.progress += 1;
      }
    } else if (nextActiveContract.type === 'MAINTENANCE_SLA') {
      const targetCond = nextActiveContract.targetConditionPct ?? 85;
      if (enabledRigsCount > 0 && activeAvgHealth >= targetCond) {
        nextActiveContract.progress += 1;
      }
    } else if (nextActiveContract.type === 'UPTIME_STREAK') {
      const hasOutput = nextActiveContract.id === GUIDED_STARTER_CONTRACT_ID ? earningRigs > 0 : enabledRigsCount > 0;
      if (hasOutput && !anyFailureOrOverheatThisStep) {
        nextActiveContract.progress += 1;
      } else {
        nextActiveContract.progress = 0;
      }
    } else if (nextActiveContract.type === 'EFFICIENCY_CAP') {
      if (enabledRigsCount > 0 && totalPowerKw <= effectivePowerCap * 0.85) {
        nextActiveContract.progress += 1;
      }
    } else if (nextActiveContract.type === 'RESEARCH_PARTNERSHIP') {
      nextActiveContract.progress += stepRp;
    } else if (nextActiveContract.type === 'FACILITY_EXPANSION') {
      const atSite = facIdx >= (nextActiveContract.targetFacilityIndex ?? 1);
      if (nextActiveContract.targetFleetSize !== undefined) {
        nextActiveContract.progress = atSite && earningRigs >= nextActiveContract.targetFleetSize && !anyFailureOrOverheatThisStep
          ? nextActiveContract.progress + 1 : 0;
      } else if (atSite) {
        nextActiveContract.progress = nextActiveContract.targetAmount;
      }
    } else if (nextActiveContract.type === 'EQUIPMENT_SUPPLY') {
      nextActiveContract.progress = Math.max(nextActiveContract.progress, enabledRigsCount);
    }

    if (nextActiveContract.progress >= nextActiveContract.targetAmount) {
      nextCash += nextActiveContract.rewardCash;
      finalRp += nextActiveContract.rewardRp;
      finalCredibility = Math.min(100, finalCredibility + 5);
      nextStats.contractsCompleted += 1;
      nextStats.totalContractIncomeUsd += nextActiveContract.rewardCash;
      if (nextActiveContract.targetFleetSize !== undefined && nextActiveContract.targetFacilityIndex !== undefined) {
        nextStats.highestCommissionedFacilityIndex = Math.max(
          nextStats.highestCommissionedFacilityIndex ?? 0, nextActiveContract.targetFacilityIndex
        );
      }
      milestoneHit = true;
      pushTx('CONTRACT', nextActiveContract.rewardCash, `Contract complete: ${nextActiveContract.title}`);
      pushNews(
        `Contract Completed: ${nextActiveContract.title}`,
        `Paid +${formatUsd(nextActiveContract.rewardCash)} and +${nextActiveContract.rewardRp} RP! (+5 Reputation)`,
        'CONTRACT'
      );
      nextActiveContract = null;
    } else if (nextActiveContract.stepsRemaining <= 0) {
      finalCredibility = Math.max(
        5,
        finalCredibility - nextActiveContract.penaltyCredibility
      );
      const fine = Math.min(Math.max(0, nextCash), nextActiveContract.penaltyCash ?? 0);
      if (fine > 0) {
        nextCash -= fine;
        pushTx('CONTRACT', -fine, `Missed contract penalty: ${nextActiveContract.title}`);
      }
      nextStats.contractsFailed += 1;
      alertHit = true;
      pushNews(
        `Contract Missed: ${nextActiveContract.title}`,
        `Deadline expired (-${nextActiveContract.penaltyCredibility} Reputation${
          fine > 0 ? `, -${formatUsd(fine)} penalty` : ''
        }).`,
        'ALERT'
      );
      nextActiveContract = null;
    }
  }

  if (nextStep % 12 === 0 || nextAvailableContracts.length === 0 || (!nextActiveContract && prev.activeContract)) {
    nextAvailableContracts = generateContractBoard(
      {
        stepCount: nextStep,
        rigs: nextRigs,
        coins: nextCoins,
        facilityId: prev.facilityId,
        runSeed: prev.runSeed,
        mediaCredibility: finalCredibility,
        unlockedResearch: nextUnlocked,
      },
      4,
      {
        earlyCareer: !prev.isSandbox && !prev.devMode,
        includeStarter: getEffectiveOnboardingMode(prev) === 'GUIDED' &&
          nextStats.contractsCompleted === 0 && nextActiveContract?.id !== GUIDED_STARTER_CONTRACT_ID,
        highestCommissionedFacilityIndex: nextStats.highestCommissionedFacilityIndex,
      }
    );
  }

  // 11. Continuous electricity accounting & 30-step Cycle settlement
  const effectiveRate = getEffectiveElectricityRate({
    facilityId: prev.facilityId,
    powerContractId: prev.powerContractId,
    unlockedResearch: nextUnlocked,
    activeMarketModifiers: nextModifiers,
    underground: nextUnderground,
    sandboxConfig: prev.sandboxConfig,
  });
  const stepElecCost = totalPowerKw * 24 * effectiveRate;
  nextStats.totalElectricityCostUsd += stepElecCost;

  let nextCycleStats = {
    miningRevenueUsd: (prev.currentCycleStats?.miningRevenueUsd ?? 0) + stepMiningUsd,
    electricitySpendUsd: (prev.currentCycleStats?.electricitySpendUsd ?? 0) + stepElecCost,
    maintenanceSpendUsd: prev.currentCycleStats?.maintenanceSpendUsd ?? 0,
    otherSpendUsd: prev.currentCycleStats?.otherSpendUsd ?? 0,
  };
  const nextLedger = [...prev.ledger];
  let billsSettledUsd = 0;

  if (nextStep % BILLING_CYCLE_STEPS === 0) {
    const cycleNumber = nextStep / BILLING_CYCLE_STEPS;
    const startStep = nextStep - BILLING_CYCLE_STEPS + 1;
    const cycleLabel = `C${cycleNumber} (${startStep}-${nextStep})`;

    const totalsNow = getFacilityTotals({
      ...prev,
      unlockedResearch: nextUnlocked,
      activeMarketModifiers: nextModifiers,
      rigs: nextRigs,
      employees: nextEmployees,
      fab: fabStep.nextFab,
    });

    const cycleElec = nextCycleStats.electricitySpendUsd + totalsNow.cycleFixedContractFee;
    const cycleRent = totalsNow.cycleRentUsd;
    const cyclePayroll = totalsNow.cyclePayrollUsd;
    const cycleMaint = totalsNow.cycleMaintenanceUsd;

    billsSettledUsd = cycleElec + cycleRent + cyclePayroll + cycleMaint;
    nextCash -= billsSettledUsd;
    nextStats.totalPayrollCostUsd += cyclePayroll;
    nextStats.totalMaintenanceCostUsd += cycleMaint;

    pushTx('POWER', -cycleElec, `Cycle ${cycleNumber} electricity & contract demand`);
    if (cycleRent > 0) pushTx('FACILITY', -cycleRent, `Cycle ${cycleNumber} facility rent`);
    if (cyclePayroll > 0) pushTx('STAFF', -cyclePayroll, `Cycle ${cycleNumber} employee payroll`);
    if (cycleMaint > 0) pushTx('REPAIR', -cycleMaint, `Cycle ${cycleNumber} facility/cooling upkeep`);

    const netCashflow =
      nextCycleStats.miningRevenueUsd -
      billsSettledUsd -
      nextCycleStats.otherSpendUsd;

    nextLedger.unshift({
      cycleNumber,
      label: cycleLabel,
      facilityId: prev.facilityId,
      miningRevenueUsd: nextCycleStats.miningRevenueUsd,
      electricityCostUsd: cycleElec,
      rentCostUsd: cycleRent,
      payrollCostUsd: cyclePayroll,
      maintenanceCostUsd: cycleMaint + nextCycleStats.maintenanceSpendUsd,
      otherSpendUsd: nextCycleStats.otherSpendUsd,
      netCashflowUsd: netCashflow,
    });

    if (nextCash < 0) {
      alertHit = true;
      pushNews(
        `Cycle ${cycleNumber} Bills Alert`,
        `Bills of ${formatUsd(billsSettledUsd)} pushed cash negative (${formatUsd(nextCash)}).`,
        'ALERT'
      );
    }

    nextCycleStats = {
      miningRevenueUsd: 0,
      electricitySpendUsd: 0,
      maintenanceSpendUsd: 0,
      otherSpendUsd: 0,
    };
  }

  let nextState: GameState = {
    ...prev,
    stepCount: nextStep,
    cash: nextCash,
    researchPoints: finalRp,
    unlockedResearch: nextUnlocked,
    activeResearchId: nextActiveResearchId,
    activeResearchProgress: nextActiveProgress,
    rigs: nextRigs,
    employees: nextEmployees,
    strikeStepsRemaining: nextStrikeSteps,
    usedMarketListings: nextUsedListings,
    usedMarketRefreshStep: nextUsedRefresh,
    activeMarketModifiers: nextModifiers,
    coins: nextCoins,
    wallet: nextWallet,
    walletCostBasis: nextWalletBasis,
    limitOrders: exStep.limitOrders,
    shortPositions: exStep.shortPositions,
    fab: fabStep.nextFab,
    world: nextWorld,
    marketRegime: nextRegime,
    regimeStepsRemaining: nextRegimeRem,
    activeCampaigns: nextCampaigns,
    mediaCredibility: finalCredibility,
    regulatoryScrutiny: nextScrutiny,
    rivals: calibratedRivals,
    availableContracts: nextAvailableContracts,
    activeContract: nextActiveContract,
    underground: nextUnderground,
    ledger: nextLedger.slice(0, 48),
    transactions: newTransactions.slice(0, 200),
    currentCycleStats: nextCycleStats,
    news: newNews.slice(0, 60),
    competitorTechScore: Math.min(100, prev.competitorTechScore + 0.08),
    noiseFinesTotal: prev.noiseFinesTotal + stepNoiseFine,
    stats: nextStats,
  };

  // 11b. Close out a season when the step clock crosses its boundary
  const seasonHistory = archiveSeason(prev, playerPowerScore);
  if (seasonHistory) {
    const closed = seasonHistory[0];
    nextState = {
      ...nextState,
      seasonHistory,
      unlockedAchievements:
        closed.playerRank === 1 && !nextState.unlockedAchievements.includes('ach_season_champion')
          ? [...nextState.unlockedAchievements, 'ach_season_champion']
          : nextState.unlockedAchievements,
      news: [
        {
          id: `news_season_${closed.seasonId}`,
          step: nextStep,
          stepLabel,
          title: `Season ${closed.seasonId} Closed — ${closed.label}`,
          detail:
            closed.playerRank === 1
              ? 'You finished #1 and claimed the Season Champion title.'
              : `You finished #${closed.playerRank} of ${closed.standings.length}. Run "leaderboard" for the standings.`,
          category: 'MILESTONE' as const,
        },
        ...nextState.news,
      ].slice(0, 60),
    };
    if (closed.playerRank === 1) milestoneHit = true;
  }

  // 12. Evaluate milestones, achievements, challenges & early objectives
  const prog = evaluateProgression(nextState, playerPowerScore, {
    hadZeroFaultCycle: nextStep % BILLING_CYCLE_STEPS === 0 && !anyFailureOrOverheatThisStep,
  });
  nextState = prog.nextState;
  if (prog.milestoneHit) milestoneHit = true;

  const snapTotals = getFacilityTotals(nextState);
  const snapElecCost = snapTotals.stepPowerCostUsd;
  const snapshot: import('../types/game').PerformanceSnapshot = {
    step: nextStep,
    stepLabel,
    cash: nextState.cash,
    valuation: computeCompanyValuation(nextState),
    revenuePerStepUsd: stepMiningUsd,
    powerCostPerStepUsd: snapElecCost,
    netPerStepUsd: stepMiningUsd - snapElecCost,
    fleetHashScore: playerPowerScore,
    powerKw: snapTotals.totalPowerKw,
  };
  nextState = {
    ...nextState,
    performanceHistory: [...(prev.performanceHistory ?? []), snapshot].slice(-60),
  };

  const objClaim = claimCompletedObjectives(nextState);
  if (objClaim.newlyCompleted.length > 0) {
    nextState = objClaim.nextState;
    milestoneHit = true;
  }

  // Notify player if Guided mode unlocked new systems on this step
  const recorded = recordGuidedProgress(nextState);
  nextState = announceGuidedUnlocks(prev, recorded);
  if (nextState !== recorded) milestoneHit = true;

  // 13. Interactive Decision Event Roll (Strike takes priority)
  let eventTriggered: PendingEvent | null = null;
  if (triggeredStrikeNow) {
    eventTriggered = buildStrikeNegotiationEvent(nextState);
  } else {
    const raidChance =
      nextScrutiny >= 75 && nextUnderground.bribeProtectionSteps === 0
        ? 0.28
        : nextScrutiny >= 55 && nextUnderground.bribeProtectionSteps === 0
        ? 0.14
        : 0;
    const regularEventChance = nextStep >= 4 ? 0.095 : 0;

    if (stepRng() < raidChance) {
      eventTriggered = generateInteractiveEvent(nextState, 'RAID');
    } else if (stepRng() < regularEventChance) {
      eventTriggered = generateInteractiveEvent(nextState);
    }
  }

  if (eventTriggered) {
    alertHit = true;
    nextState = { ...nextState, pendingEvent: eventTriggered };
  }

  return {
    nextState,
    milestoneHit,
    alertHit,
    miningCashEarned: stepMiningUsd,
    rpEarned: stepRp,
    billsSettledUsd,
    soloBlocksHit,
    eventTriggered,
  };
}
