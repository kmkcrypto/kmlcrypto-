import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
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
  DifficultyLevel,
  EmpireAlignment,
  FacilityTier,
  FacilityUpgradeId,
  GameState,
  IllicitModId,
  MarketModifierType,
  MarketRegime,
  MiningAlgorithm,
  MiningRig,
  NewsItem,
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
  TransactionCategory,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng, generateRandomSeed } from '../utils/rng';
import { generateContractBoard } from './contracts';
import { computeCompanyValuation, evaluateProgression } from './milestones';
import { createInitialRivals, getPlayerRivalComparison, stepRivalSyndicates } from './rivals';
import { buildDefaultStats } from './saveSystem';
import {
  calculateBaseRigPartsCost,
  calculateRigResaleValue,
  computeAverageRigHealth,
  createInitialComponentHealth,
  ensureRigComponentHealth,
  generateUsedMarketListings,
  getGlobalHardwarePriceMult,
  getRigGeneration,
} from './usedMarket';

export {
  calculateRigResaleValue,
  computeAverageRigHealth,
  computeCompanyValuation,
  createInitialComponentHealth,
  createInitialRivals,
  ensureRigComponentHealth,
  generateContractBoard,
  generateUsedMarketListings,
  getPlayerRivalComparison,
};

export const BILLING_CYCLE_STEPS = 30;

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

export function getPartBundle(config: RigBuildConfig) {
  const chassis = CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0];
  const compute = COMPUTE_PARTS.find((c) => c.id === config.computeId) ?? COMPUTE_PARTS[0];
  const gpus = config.gpuIds
    .map((id) => GPU_PARTS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const storage = STORAGE_PARTS.find((s) => s.id === config.storageId) ?? STORAGE_PARTS[0];
  const psu = PSU_PARTS.find((p) => p.id === config.psuId) ?? PSU_PARTS[0];
  const cooling = COOLING_PARTS.find((c) => c.id === config.coolingId) ?? COOLING_PARTS[0];
  const os = OS_PARTS.find((o) => o.id === config.osId) ?? OS_PARTS[0];
  return { chassis, compute, gpus, storage, psu, cooling, os };
}

export function calculateRigBuildCost(
  config: RigBuildConfig,
  state?: Pick<GameState, 'activeMarketModifiers'>
): number {
  const base = calculateBaseRigPartsCost(config);
  const mult = state ? getGlobalHardwarePriceMult(state) : 1.0;
  return Math.round(base * mult);
}

export function calculatePartTradeInCost(oldCost: number, newCost: number): number {
  const tradeInCredit = Math.round(oldCost * 0.6);
  return newCost - tradeInCredit;
}

export function getTechnicianBonuses(state: Pick<GameState, 'employees' | 'unlockedResearch'>) {
  const techs = state.employees.filter((e) => e.role === 'TECHNICIAN');
  const totalSkill = techs.reduce((s, e) => s + (e.skillLevel ?? 1), 0);
  const repairDiscount = Math.min(0.5, totalSkill * 0.12);
  const wearReduction = Math.min(0.45, totalSkill * 0.1) + (state.unlockedResearch.includes('res_auto_maint') ? 0.22 : 0);
  const repairPerStep = techs.reduce((s, e) => s + 0.24 * (1 + ((e.skillLevel ?? 1) - 1) * 0.25), 0);
  const hasThermalTech = techs.some((t) => t.priority === 'THERMAL_SAFETY');
  return { count: techs.length, totalSkill, repairDiscount, wearReduction: Math.min(0.65, wearReduction), repairPerStep, hasThermalTech };
}

export function getElectricianBonuses(state: Pick<GameState, 'employees'>) {
  const elecs = state.employees.filter((e) => e.role === 'ELECTRICIAN');
  const totalSkill = elecs.reduce((s, e) => s + (e.skillLevel ?? 1), 0);
  const capBonusPct = Math.min(0.28, totalSkill * 0.05);
  const powerWasteReduction = Math.min(0.2, totalSkill * 0.04);
  const electricalMaintDiscount = Math.min(0.4, totalSkill * 0.09);
  return { count: elecs.length, totalSkill, capBonusPct, powerWasteReduction, electricalMaintDiscount };
}

export function getManagerBonuses(state: Pick<GameState, 'employees'>) {
  const mgrs = state.employees.filter((e) => e.role === 'MANAGER');
  const totalSkill = mgrs.reduce((s, e) => s + (e.skillLevel ?? 1), 0);
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
  return Math.max(12, Math.round(Math.min(180, buildCost * 0.04)));
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
    healthPct?: number;
    componentHealth?: RigComponentHealth;
    pasteStepsRemaining?: number;
    illicitMod?: IllicitModId | null;
    conditionTier?: MiningRig['conditionTier'];
    ageSteps?: number;
    status?: MiningRig['status'];
  },
  facility: FacilityTier,
  unlockedResearch: string[],
  sysEngineerBonus: number,
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1,
  facilityUpgrades?: Partial<Record<FacilityUpgradeId, number>>,
  electricianPowerSave = 0
): ComputedRigTelemetry {
  const { chassis, compute, gpus, storage, psu, cooling, os } = getPartBundle(rig);
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

  const gpuWatts = gpus.reduce((s, g) => s + g.watts, 0);
  const gpuHeat = gpus.reduce((s, g) => s + g.heatC, 0);

  const rawWatts = Math.round(
    (chassis.baseWatts +
      (compute.watts + gpuWatts) * Math.pow(ocRatio, 1.48) +
      storage.watts +
      cooling.watts) *
      os.powerMultiplier *
      undervoltMult *
      distSaveMult *
      fw.powerMult *
      (illicit?.powerMult ?? 1)
  );
  const wallWatts = Math.round(rawWatts / psu.efficiency);
  const isUnderpowered = rawWatts > psu.maxWatts;

  const isImmersion = cooling.id === 'cool_immersion' || cooling.id === 'cool_cryo_phase';
  const gpuNoise =
    gpus.length > 0 ? Math.max(...gpus.map((g) => g.noiseDba)) + gpus.length * 1.8 : 0;
  const ventBaffle = (facilityUpgrades?.ventilation_ducts ?? 0) * 3;
  const rawNoise =
    30 +
    compute.noiseDba * 0.65 +
    gpuNoise * 0.55 +
    cooling.noiseDba * 0.6 +
    psu.noiseDba * 0.3 +
    chassis.noiseModifier +
    (ocRatio - 1) * 18 +
    (rig.firmwareProfile === 'TURBO' ? 4 : rig.firmwareProfile === 'ECO' ? -4 : 0) +
    (illicit?.noiseDeltaDba ?? 0) -
    ventBaffle;
  const noiseDba = Math.round(
    isImmersion ? Math.min(48, Math.max(24, rawNoise * 0.55)) : Math.max(24, rawNoise)
  );

  const wearHeat = healthPct < 75 ? Math.round((75 - healthPct) * 0.16) : 0;
  const heatLoad =
    (compute.heatC + gpuHeat + storage.heatC) *
      Math.pow(ocRatio, 1.4) *
      undervoltMult *
      fw.heatMult +
    (illicit?.extraHeatC ?? 0) +
    wearHeat;
  const effectiveCooling = cooling.coolingPowerC + chassis.coolingBonus + pasteBonusC;
  const roomCoolingBonus = computeSpatialCoolingBonus(
    rig.gridX,
    rig.gridY,
    coolingUnits,
    activeRigCount,
    facility,
    facilityUpgrades
  );
  const equilibriumTempC = Math.round(
    Math.max(
      facility.ambientTempC + 4,
      facility.ambientTempC + 24 + heatLoad - effectiveCooling * 0.72 - roomCoolingBonus
    )
  );

  const algos: MiningAlgorithm[] = ['SHA256', 'SCRYPT', 'RANDOMX', 'ETHASH', 'POST'];
  const baseHashrateByAlgo: Record<MiningAlgorithm, number> = {
    SHA256: 0,
    SCRYPT: 0,
    RANDOMX: 0,
    ETHASH: 0,
    POST: 0,
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

  const algoMap: Record<CoinSymbol, MiningAlgorithm> = {
    BTC: 'SHA256',
    LTC: 'SCRYPT',
    DOGE: 'SCRYPT',
    XMR: 'RANDOMX',
    ETH: 'ETHASH',
    XCH: 'POST',
  };
  const targetAlgo = algoMap[rig.targetCoin];
  const baseHash = baseHashrateByAlgo[targetAlgo];

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
    (1 + storage.efficiencyBonus) *
    ocRatio *
    fw.hashMult *
    (illicit?.hashMult ?? 1) *
    (1 + sysEngineerBonus) *
    thermalFactor *
    healthFactor *
    condTierFactor *
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
  state: Pick<GameState, 'unlockedResearch' | 'employees'>
): number {
  const analysts = state.employees.filter((e) => e.role === 'ANALYST');
  const quantBonus = state.unlockedResearch.includes('res_quant_desk') ? 0.06 : 0;
  const analystBonus = Math.min(0.12, analysts.reduce((s, a) => s + 0.03 * (1 + ((a.skillLevel ?? 1) - 1) * 0.15), 0));
  const mgrBonus = getManagerBonuses(state).opsEfficiencyBonus * 0.35;
  return 1 + quantBonus + analystBonus + mgrBonus;
}

export function computeStepCoinOutput(
  effectiveHashrate: number,
  coin: CoinMarketState,
  efficiencyFactor: number,
  autoSellMult: number,
  poolMode: PoolMode = 'PPS',
  deterministicEstimate = false
): { minedCoins: number; autoSoldUsd: number; soloBlockHit: boolean } {
  if (!coin.unlocked || effectiveHashrate <= 0 || efficiencyFactor <= 0) {
    return { minedCoins: 0, autoSoldUsd: 0, soloBlockHit: false };
  }
  const ratio = effectiveHashrate / Math.max(1e-6, coin.baselineHash);
  let scale = 0;
  if (ratio < 1) {
    scale = Math.pow(ratio, 0.72);
  } else if (coin.algorithm === 'SCRYPT' && ratio > 1000) {
    scale = Math.pow(1000, coin.hashExponent) * Math.pow(ratio / 1000, 0.34);
  } else {
    scale = Math.pow(ratio, coin.hashExponent);
  }

  const diffFactor = 1 / Math.max(0.5, coin.networkDifficulty ?? 1);
  const halvingScale = coin.blockRewardScale ?? 1;
  const rawCoins = coin.baseStepCoins * scale * efficiencyFactor * diffFactor * halvingScale;

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
    poolMult = 1.05 * (0.85 + Math.random() * 0.3);
  } else if (poolMode === 'SOLO') {
    const hitChance = Math.max(0.06, Math.min(0.36, 0.08 + Math.log10(1 + ratio) * 0.065));
    if (Math.random() < hitChance) {
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

export function getSysEngineerBonus(state: Pick<GameState, 'employees'>): number {
  const engineers = state.employees.filter((e) => e.role === 'SYS_ENGINEER');
  const raw = engineers.reduce((sum, e) => {
    const shiftMult = e.shift === 'ROTATION_24_7' ? 1.25 : 1.0;
    const prioMult = e.priority === 'HASHRATE_TUNING' ? 1.3 : 1.0;
    const skillMult = 1 + ((e.skillLevel ?? 1) - 1) * 0.2;
    return sum + 0.06 * shiftMult * prioMult * skillMult;
  }, 0);
  return Math.min(0.38, raw);
}

export function getEffectiveFacilityMaxRigs(
  state: Pick<GameState, 'facilityId' | 'facilityUpgrades'>
): number {
  const facility = getFacility(state.facilityId);
  const bayLvl = state.facilityUpgrades?.bay_expansion ?? 0;
  return Math.max(facility.maxRigs, Math.round(facility.maxRigs * (1 + bayLvl * 0.2)));
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

export function getFacilityTotals(state: GameState): {
  totalPowerKw: number;
  maxNoiseDba: number;
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
  let peakNoise = 28;
  const enabledCount = state.rigs.filter((r) => r.enabled).length;

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
      elecBonus.powerWasteReduction
    );
    totalWatts += t.wallWatts;
    if (t.noiseDba > peakNoise) {
      peakNoise = t.noiseDba + Math.min(8, enabledCount * 0.7);
    }
  }

  const coolingSummary = computeFacilityCoolingSummary(
    state.coolingUnits ?? [],
    enabledCount,
    facility,
    state.facilityUpgrades
  );
  totalWatts += coolingSummary.totalCoolingWatts;
  if (coolingSummary.maxCoolingNoiseDba > peakNoise) {
    peakNoise = coolingSummary.maxCoolingNoiseDba;
  }

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
  const elecMaintDisc = 1 - elecBonus.electricalMaintDiscount;
  const cycleMaintenanceUsd = Math.round(
    (facility.maintenanceCostPerCycle * adminDisc +
      coolingSummary.cycleCoolingMaintUsd +
      upgradeUpkeep * elecMaintDisc) *
      sandboxMult
  );

  const contract = getPowerContract(state.powerContractId);
  const cycleFixedContractFee = Math.round(contract.cycleFixedFee * sandboxMult);

  return {
    totalPowerKw,
    maxNoiseDba: Math.round(peakNoise),
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
      description: `Zero-serial surplus rig bypassing R&D gates (${preset.config.targetCoin}).`,
      costUsd: discountedCost,
      heatGain: 18,
      discountPct,
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
  initialChallengeId: ChallengeId | null = null
): GameState {
  const runSeed = customSeed?.trim() || generateRandomSeed();
  const rng = createSeededRng(`${runSeed}-init`);
  const isSandbox = difficulty === 'SANDBOX' || Boolean(sandboxConfig);

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
    sandboxConfig,
    runSeed,
    stepCount: 0,
    soundEnabled: true,
    cash: startingCash,
    researchPoints: devMode ? 1000 : isSandbox ? 250 : difficulty === 'TYCOON_SANDBOX' ? 80 : 12,
    unlockedResearch,
    activeResearchId: null,
    activeResearchProgress: 0,
    facilityId: startingFacilityId,
    ownedFacilityIds,
    facilityUpgrades: {},
    powerContractId: 'contract_standard',
    rigs: starterRigs,
    backupRigs: [],
    coolingUnits: [],
    usedMarketListings: [],
    usedMarketRefreshStep: 8,
    activeMarketModifiers: [],
    coins,
    marketRegime,
    regimeStepsRemaining,
    employees: [],
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
    },
    pendingEvent: null,
    ledger: [],
    transactions: [],
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
    tutorialStep: devMode || isSandbox ? 0 : 1,
    devMode,
    devUnlockAll: devMode,
  };

  baseState.availableContracts = generateContractBoard(baseState, 4);
  baseState.usedMarketListings = generateUsedMarketListings(baseState);
  baseState.underground.blackMarketListings = generateBlackMarketListings(baseState);
  return baseState;
}

function pickNextMarketRegime(current: MarketRegime): { regime: MarketRegime; duration: number } {
  const transitions: Record<MarketRegime, MarketRegime[]> = {
    ACCUMULATION: ['BULL_RUN', 'BULL_RUN', 'CRYPTO_WINTER', 'ACCUMULATION'],
    BULL_RUN: ['MANIA_PEAK', 'CORRECTION', 'BULL_RUN'],
    MANIA_PEAK: ['CORRECTION', 'CORRECTION', 'CRYPTO_WINTER'],
    CORRECTION: ['ACCUMULATION', 'CRYPTO_WINTER', 'BULL_RUN'],
    CRYPTO_WINTER: ['ACCUMULATION', 'ACCUMULATION', 'BULL_RUN'],
  };
  const choices = transitions[current];
  const next = choices[Math.floor(Math.random() * choices.length)];
  const spec = MARKET_REGIME_SPECS[next];
  const duration = Math.round(spec.minSteps + Math.random() * (spec.maxSteps - spec.minSteps));
  return { regime: next, duration };
}

function createEconomicMarketModifier(step: number): ActiveMarketModifier {
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

  const picked = catalog[Math.floor(Math.random() * catalog.length)];
  return {
    ...picked,
    id: `mod_${step}_${picked.type}`,
  };
}

export function generateInteractiveEvent(
  state: GameState,
  forcedCategory?: PendingEventCategory
): PendingEvent {
  const step = state.stepCount;
  const unlockedCoins = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (s) => state.coins[s].unlocked
  );
  const hotCoin = unlockedCoins[unlockedCoins.length - 1] ?? 'BTC';
  const targetRig = state.rigs[0];
  const targetRival = state.rivals[Math.floor(Math.random() * state.rivals.length)];
  const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));

  let category = forcedCategory;
  if (!category) {
    if (
      state.regulatoryScrutiny >= 58 &&
      (state.underground?.bribeProtectionSteps ?? 0) === 0 &&
      Math.random() < 0.65
    ) {
      category = 'RAID';
    } else {
      const pool: PendingEventCategory[] = ['MARKET', 'GRID', 'HARDWARE', 'RIVAL', 'OPERATIONS'];
      category = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  if (category === 'RAID') {
    const fineCost = Math.max(350, Math.round(Math.max(state.cash * 0.22, stepRev * 6)));
    const bribeCost = Math.max(220, Math.round(fineCost * 0.55));
    return {
      id: `evt_raid_${step}`,
      category: 'RAID',
      title: 'Utility & Regulatory Raid Warning',
      description: `Inspectors flagged abnormal load and heat (${Math.round(
        state.regulatoryScrutiny
      )}/100 scrutiny) near your ${getFacility(state.facilityId).name}.`,
      triggeredStep: step,
      targetRigId: targetRig?.id,
      options: [
        {
          key: '1',
          label: `Pay hush bribe (${formatUsd(bribeCost)})`,
          costUsd: bribeCost,
          riskNote: 'Clears immediate raid, -28 Heat, 10-step shield',
          resolutionId: 'raid_bribe',
        },
        {
          key: '2',
          label: 'Scrub logs & dump illegal gear',
          riskNote: 'Disables siphon/botnet, strips 1 mod, -38 Heat',
          resolutionId: 'raid_scrub',
        },
        {
          key: '3',
          label: 'Stonewall & face civil fine',
          riskNote: `70% chance of ${formatUsd(fineCost)} seizure, -10 reputation`,
          resolutionId: 'raid_resist',
        },
      ],
    };
  }

  if (category === 'GRID') {
    const contract = getPowerContract(state.powerContractId);
    const upsLvl = state.facilityUpgrades?.backup_power ?? 0;
    const protection = Math.min(0.95, contract.brownoutProtectionPct / 100 + upsLvl * 0.35);
    const rawTariff = Math.max(120, Math.round(stepRev * 3.5));
    const tariffUsd = Math.max(40, Math.round(rawTariff * (1 - protection)));
    return {
      id: `evt_grid_${step}`,
      category: 'GRID',
      title: 'Regional Grid Peak Tariff & Brownout',
      description: `A severe power crunch hit your substation. Backup protection cut surcharge exposure by ${Math.round(
        protection * 100
      )}%.`,
      triggeredStep: step,
      options: [
        {
          key: '1',
          label: `Pay surge surcharge (${formatUsd(tariffUsd)})`,
          costUsd: tariffUsd,
          riskNote: 'Keeps full hashrate running uninterrupted',
          resolutionId: 'grid_pay',
        },
        {
          key: '2',
          label: 'Emergency ECO undervolt across fleet',
          riskNote: 'Switches all rigs to ECO (-power/-heat), no cash fee',
          resolutionId: 'grid_eco',
        },
        {
          key: '3',
          label: 'Tap un-metered line bypass (Illegal)',
          riskNote: 'Enables Power Siphon (-65% bills), +18 Heat',
          resolutionId: 'grid_siphon',
        },
      ],
    };
  }

  if (category === 'OPERATIONS') {
    const investCost = Math.max(240, Math.round(stepRev * 4.2));
    return {
      id: `evt_ops_${step}`,
      category: 'OPERATIONS',
      title: 'Strategic Operations Dilemma',
      description:
        'A regional data-center liquidator offers surplus parts, while your engineers request urgent R&D funding.',
      triggeredStep: step,
      options: [
        {
          key: '1',
          label: `Fund engineering telemetry sprint (${formatUsd(investCost)})`,
          costUsd: investCost,
          riskNote: '+24 Research Points & +4 Reputation',
          resolutionId: 'ops_rd_sprint',
        },
        {
          key: '2',
          label: 'Overhaul maintenance routines conservatively',
          riskNote: 'Restores +12% fleet condition & -6°C cool-down, pauses OC to 100%',
          resolutionId: 'ops_maint_pass',
        },
        {
          key: '3',
          label: 'Broker used hardware lot for quick margin',
          riskNote: `+${formatUsd(Math.round(investCost * 0.75))} cash, -2 Reputation`,
          resolutionId: 'ops_flip_lot',
        },
      ],
    };
  }

  if (category === 'HARDWARE' && targetRig) {
    const patchCost = Math.max(90, Math.round(getRigRepairCost(targetRig, state) + 120));
    return {
      id: `evt_hw_${step}`,
      category: 'HARDWARE',
      title: `VRM Voltage Spike on ${targetRig.name}`,
      description: `Telemetry caught unstable ripple on ${targetRig.name}. Unchecked transients could cripple silicon health.`,
      triggeredStep: step,
      targetRigId: targetRig.id,
      options: [
        {
          key: '1',
          label: `Emergency recap & repaste (${formatUsd(patchCost)})`,
          costUsd: patchCost,
          riskNote: 'Restores 100% condition + fresh thermal paste',
          resolutionId: 'hw_fix',
        },
        {
          key: '2',
          label: 'Run diagnostic firmware dump',
          riskNote: '-18% rig condition, +12 Research Points',
          resolutionId: 'hw_research',
        },
        {
          key: '3',
          label: 'Push TURBO through the storm',
          riskNote: 'Sets TURBO + 2x step bonus cash now, +14°C & -22% condition',
          resolutionId: 'hw_push',
        },
      ],
    };
  }

  if (category === 'RIVAL' && targetRival) {
    const counterCost = Math.max(200, Math.round(stepRev * 4));
    const opsCost = Math.max(250, Math.round(stepRev * 4.5));
    return {
      id: `evt_rival_${step}`,
      category: 'RIVAL',
      title: `${targetRival.name} Launches Hash Blitz`,
      description: `${targetRival.name} is dumping supply and flooding ${hotCoin} pools to squeeze competitors out.`,
      triggeredStep: step,
      targetCoin: hotCoin,
      targetRivalId: targetRival.id,
      options: [
        {
          key: '1',
          label: `Sponsor pool counter-bounty (${formatUsd(counterCost)})`,
          costUsd: counterCost,
          riskNote: '+8 Reputation, +15 RP, lifts coin sentiment',
          resolutionId: 'rival_counter',
        },
        {
          key: '2',
          label: `Black-hat DDoS retaliation (${formatUsd(opsCost)})`,
          costUsd: opsCost,
          riskNote: 'Disrupts rival for 10 steps, +16 Heat',
          resolutionId: 'rival_ddos',
        },
        {
          key: '3',
          label: 'Hunker down and weather volatility',
          riskNote: 'No cost; rival gains +8% hash index',
          resolutionId: 'rival_ignore',
        },
      ],
    };
  }

  // MARKET event fallback
  const hedgeCost = Math.max(160, Math.round(stepRev * 3.8));
  return {
    id: `evt_mkt_${step}`,
    category: 'MARKET',
    title: `Whale Liquidity Shock on ${hotCoin}`,
    description: `Unusual order-book depth just appeared across ${hotCoin} spot desks—market makers are bracing for a sharp move.`,
    triggeredStep: step,
    targetCoin: hotCoin,
    options: [
      {
        key: '1',
        label: `Fund market-maker hype (${formatUsd(hedgeCost)})`,
        costUsd: hedgeCost,
        riskNote: `Pumps ${hotCoin} +22% & shifts sentiment bullish`,
        resolutionId: 'mkt_pump',
      },
      {
        key: '2',
        label: 'Coordinate dark-pool wash spike (Illegal)',
        riskNote: `+28% ${hotCoin} price spike, +18 Heat, -6 Reputation`,
        resolutionId: 'mkt_wash',
      },
      {
        key: '3',
        label: 'Stay neutral and let market clear',
        riskNote: `${hotCoin} whipsaws +-12%, +6 RP data insight`,
        resolutionId: 'mkt_neutral',
      },
    ],
  };
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
    const seized = Math.random() < 0.7;
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
    next.researchPoints += 24;
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 4);
    summary = 'Funded R&D telemetry sprint (+24.0 RP, +4 Reputation).';
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
  } else if (res === 'ops_flip_lot') {
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const gain = Math.round(Math.max(240, stepRev * 4.2) * 0.75);
    next.cash += gain;
    next.mediaCredibility = Math.max(5, next.mediaCredibility - 2);
    next.transactions.unshift({
      id: `tx_lot_${Date.now()}`,
      step: state.stepCount,
      stepLabel,
      category: 'SALE',
      amountUsd: gain,
      description: 'Surplus hardware brokerage profit',
    });
    summary = `Flipped surplus hardware lot for +${formatUsd(gain)} (-2 Reputation).`;
  } else if (res === 'hw_fix') {
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const nextComp = createInitialComponentHealth(r.gpuIds.length, 100);
      return {
        ...r,
        componentHealth: nextComp,
        healthPct: 100,
        pasteStepsRemaining: 16,
        status: r.enabled ? 'MINING' : 'PAUSED',
      };
    });
    next.stats.repairsCompleted += 1;
    summary = 'Replaced VRM caps and repasted target rig (100% component health).';
    milestoneHit = true;
  } else if (res === 'hw_research') {
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const c = ensureRigComponentHealth(r);
      const nextComp: RigComponentHealth = {
        ...c,
        compute: Math.max(20, Number((c.compute - 22).toFixed(1))),
        gpus: c.gpus.map((g) => Math.max(20, Number((g - 18).toFixed(1)))),
        psu: Math.max(20, Number((c.psu - 14).toFixed(1))),
      };
      return {
        ...r,
        componentHealth: nextComp,
        healthPct: computeAverageRigHealth(nextComp),
      };
    });
    next.researchPoints += 12;
    summary = 'Captured silicon telemetry logs (+12.0 RP, degraded core/GPU condition).';
  } else if (res === 'hw_push') {
    const bonus = Math.max(80, Math.round(state.rigs.reduce((s, r) => s + r.lastStepUsd, 0) * 2));
    next.cash += bonus;
    next.rigs = next.rigs.map((r) => {
      if (r.id !== evt.targetRigId) return r;
      const c = ensureRigComponentHealth(r);
      const nextComp: RigComponentHealth = {
        ...c,
        compute: Math.max(20, Number((c.compute - 26).toFixed(1))),
        gpus: c.gpus.map((g) => Math.max(20, Number((g - 24).toFixed(1)))),
        psu: Math.max(20, Number((c.psu - 20).toFixed(1))),
        cooling: Math.max(20, Number((c.cooling - 15).toFixed(1))),
      };
      return {
        ...r,
        firmwareProfile: 'TURBO',
        temperatureC: Math.min(98, r.temperatureC + 14),
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
    summary = `Pushed TURBO! Captured +${formatUsd(bonus)} surge payout at heavy thermal/wear cost.`;
  } else if (res === 'rival_counter') {
    next.mediaCredibility = Math.min(100, next.mediaCredibility + 8);
    next.researchPoints += 15;
    if (evt.targetCoin) {
      const c = next.coins[evt.targetCoin];
      next.coins = {
        ...next.coins,
        [evt.targetCoin]: { ...c, sentiment: Math.min(100, c.sentiment + 18) },
      };
    }
    summary = 'Counter-bounty boosted Reputation (+8) and R&D (+15 RP).';
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
      const swing = Math.random() < 0.5 ? 0.9 : 1.12;
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
  const facility = getFacility(prev.facilityId);
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === prev.facilityId));
  const nextStats = buildDefaultStats(prev.stats);

  let milestoneHit = false;
  let alertHit = false;
  let soloBlocksHit = 0;

  const newNews: NewsItem[] = [...prev.news];
  const newTransactions: TransactionEntry[] = [...(prev.transactions ?? [])];

  const pushNews = (title: string, detail: string, category: NewsItem['category']) => {
    newNews.unshift({
      id: `news_${nextStep}_${Math.random().toString(36).slice(2, 7)}`,
      step: nextStep,
      stepLabel,
      title,
      detail,
      category,
    });
  };
  const pushTx = (category: TransactionCategory, amountUsd: number, description: string) => {
    if (Math.abs(amountUsd) < 0.01) return;
    newTransactions.unshift({
      id: `tx_${nextStep}_${Math.random().toString(36).slice(2, 7)}`,
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
    const picked = pickNextMarketRegime(prev.marketRegime);
    nextRegime = picked.regime;
    nextRegimeRem = picked.duration;
    const spec = MARKET_REGIME_SPECS[nextRegime];
    pushNews(`Market Cycle Shift: ${spec.label}`, spec.summary, 'MARKET');
  }
  const regimeSpec = MARKET_REGIME_SPECS[nextRegime];

  let nextModifiers = (prev.activeMarketModifiers ?? [])
    .map((m) => ({ ...m, stepsRemaining: m.stepsRemaining - 1 }))
    .filter((m) => m.stepsRemaining > 0);

  if (nextStep >= 8 && nextStep % 14 === 0 && nextModifiers.length < 2 && Math.random() < 0.65) {
    const newMod = createEconomicMarketModifier(nextStep);
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

  // 3. Employee progression & bonuses
  const techBonus = getTechnicianBonuses(prev);
  const elecBonus = getElectricianBonuses(prev);
  const mgrBonus = getManagerBonuses(prev);
  const researchers = prev.employees.filter((e) => e.role === 'RESEARCHER');
  const nextEmployees = prev.employees.map((e) => {
    const xpGain = e.shift === 'ROTATION_24_7' ? 14 : 10;
    const totalXp = (e.experienceXp ?? 0) + xpGain;
    const nextSkill = Math.min(5, 1 + Math.floor(totalXp / 180));
    return {
      ...e,
      experienceXp: totalXp,
      skillLevel: nextSkill,
    };
  });

  // 4. Advance dynamic market prices, network difficulty & halvings
  const activeRivalFactor = prev.rivals.reduce(
    (sum, rv) => sum + (rv.disruptedSteps > 0 ? rv.hashPowerIndex * 0.45 : rv.hashPowerIndex),
    0
  );

  const nextCoins: Record<CoinSymbol, CoinMarketState> = { ...prev.coins };
  (Object.keys(nextCoins) as CoinSymbol[]).forEach((sym) => {
    const coin = nextCoins[sym];
    const logGap = Math.log(coin.basePriceUsd / Math.max(0.00001, coin.priceUsd));
    const pull = logGap * 0.045;

    const baseVol = sym === 'DOGE' ? 0.07 : sym === 'XCH' ? 0.048 : 0.036;
    const randWave = (Math.random() - 0.5) * 2 * baseVol * regimeSpec.volatilityMult;
    const prBoost = prImpulseByCoin[sym] ?? 0;

    let nextSentiment = Math.max(
      -100,
      Math.min(100, coin.sentiment * 0.95 + (prSentimentByCoin[sym] ?? 0))
    );
    const sentimentDrift = (nextSentiment / 100) * 0.006;

    let nextHalvingRem = coin.stepsUntilHalving - 1;
    let nextHalvingCount = coin.halvingCount;
    let nextBlockScale = coin.blockRewardScale;
    let halvingSupplyShock = 0;

    if (nextHalvingRem <= 0) {
      nextHalvingRem = coin.halvingEverySteps;
      nextHalvingCount += 1;
      nextBlockScale = Number((coin.blockRewardScale * 0.5).toFixed(4));
      halvingSupplyShock = 0.24;
      nextSentiment = Math.min(100, nextSentiment + 26);
      milestoneHit = true;
      pushNews(
        `${coin.symbol} Block Halving #${nextHalvingCount}!`,
        `Block emission halved (x${nextBlockScale}); supply shock boosted ${coin.symbol} spot price +24%.`,
        'MILESTONE'
      );
    }

    const diffStepScale =
      1 + 0.0022 * (1 + Math.min(1.2, activeRivalFactor / 7500));
    const nextDiff = Number(Math.min(12, coin.networkDifficulty * diffStepScale).toFixed(3));

    const multiplier = Math.max(
      0.55,
      1 +
        pull +
        randWave +
        regimeSpec.stepDrift +
        modCoinDrift +
        prBoost +
        sentimentDrift +
        halvingSupplyShock
    );
    const nextPrice = Math.max(0.001, coin.priceUsd * multiplier);

    const history = [...coin.priceHistory, { step: nextStep, stepLabel, price: nextPrice }];
    if (history.length > 365) history.shift();

    nextCoins[sym] = {
      ...coin,
      prevPriceUsd: coin.priceUsd,
      priceUsd: nextPrice,
      priceHistory: history,
      sentiment: nextSentiment,
      networkDifficulty: nextDiff,
      stepsUntilHalving: nextHalvingRem,
      halvingCount: nextHalvingCount,
      blockRewardScale: nextBlockScale,
    };
  });

  // 5. RP generation & active research progress
  const stepRp =
    0.75 +
    researchers.reduce((sum, r) => {
      const mult = r.shift === 'ROTATION_24_7' ? 1.35 : 1.0;
      const prio = r.priority === 'RESEARCH_OUTPUT' ? 1.35 : 1.0;
      const skill = 1 + ((r.skillLevel ?? 1) - 1) * 0.22;
      return sum + 4.5 * mult * prio * skill;
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
  let peakNoiseDba = 28;
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
      elecBonus.powerWasteReduction
    );
    totalWallWatts += t.wallWatts;
    if (t.noiseDba > peakNoiseDba) {
      peakNoiseDba = t.noiseDba + Math.min(8, enabledRigsCount * 0.7);
    }
  }

  const coolingSummary = computeFacilityCoolingSummary(
    prev.coolingUnits ?? [],
    enabledRigsCount,
    facility,
    prev.facilityUpgrades
  );
  totalWallWatts += coolingSummary.totalCoolingWatts;
  if (coolingSummary.maxCoolingNoiseDba > peakNoiseDba) {
    peakNoiseDba = coolingSummary.maxCoolingNoiseDba;
  }

  const totalPowerKw = totalWallWatts / 1000;
  nextStats.maxPowerKwObserved = Math.max(nextStats.maxPowerKwObserved, Number(totalPowerKw.toFixed(2)));
  const effectivePowerCap = getEffectiveFacilityPowerCapKw(prev);
  const breakerOverloaded = totalPowerKw > effectivePowerCap;
  const noiseExceeded = peakNoiseDba > facility.noiseLimitDba;

  let nextCash = prev.cash;
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

  const autoSellMult = getAutoSellMultiplier({
    unlockedResearch: nextUnlocked,
    employees: prev.employees,
  });

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
    if (!coin.unlocked) {
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
      elecBonus.powerWasteReduction
    );

    let nextTemp = Math.round(rig.temperatureC * 0.4 + telemetry.equilibriumTempC * 0.6);
    if (techBonus.hasThermalTech && nextTemp > 84) {
      nextTemp = Math.max(79, nextTemp - 5);
    }

    let status: MiningRig['status'] = 'MINING';
    let efficiencyFactor = 1.0;

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
      elecBonus.powerWasteReduction
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
      false
    );

    if (soloBlockHit) {
      soloBlocksHit += 1;
      milestoneHit = true;
      pushNews(
        `SOLO BLOCK HIT! ${rig.name}`,
        `Found an independent ${rig.targetCoin} block: +${formatUsd(autoSoldUsd)} auto-sold!`,
        'MILESTONE'
      );
    }

    if (minedCoins > 0 && autoSoldUsd > 0) {
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
    const applyDelta = (cur: number, mult: number) => {
      const jitter = 0.85 + Math.random() * 0.3;
      const nextVal = cur - totalWear * mult * jitter + techBonus.repairPerStep;
      return Number(Math.max(20, Math.min(100, nextVal)).toFixed(1));
    };

    const nextCompHealth: RigComponentHealth = {
      chassis: applyDelta(compH.chassis, 0.4),
      compute: applyDelta(compH.compute, nextTemp > 80 ? 1.4 : 1.15),
      gpus: compH.gpus.map((gh) => applyDelta(gh, nextTemp > 80 ? 1.45 : 1.25)),
      storage: applyDelta(compH.storage, storage.storageTb >= 40 ? 0.95 : 0.65),
      psu: applyDelta(compH.psu, psuRatio > 0.85 ? 1.4 : 1.0),
      cooling: applyDelta(compH.cooling, rig.firmwareProfile === 'TURBO' ? 1.25 : 0.95),
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

    let finalStatus: MiningRig['status'] =
      nextHealth <= 20 || minCompHealth <= 20 ? 'NEEDS_REPAIR' : status;
    let nextFailures = rig.failureCount ?? 0;
    if (failChance > 0 && Math.random() < failChance) {
      finalStatus = 'FAILED';
      nextFailures += 1;
      nextStats.equipmentFailuresCount += 1;
      anyFailureOrOverheatThisStep = true;
      alertHit = true;
      pushNews(
        `Equipment Failure: ${rig.name}`,
        `Component fault at ${nextHealth.toFixed(0)}% avg condition. Run "inspect <#>" or "repair".`,
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
      componentHealth: nextCompHealth,
      healthPct: nextHealth,
      pasteStepsRemaining: nextPaste,
      failureCount: nextFailures,
      status: finalStatus,
      soloBlocksWon: rig.soloBlocksWon + (soloBlockHit ? 1 : 0),
      lastStepBlockHit: soloBlockHit,
      lastStepCoins: minedCoins,
      lastStepUsd: autoSoldUsd,
      totalMinedCoins: rig.totalMinedCoins + minedCoins,
      totalEarnedUsd: rig.totalEarnedUsd + autoSoldUsd,
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
  const nextCredibility = Math.min(100, prev.mediaCredibility + 0.08);

  // 9. Update rival companies & market share
  const playerPowerScore = Math.max(
    12,
    Math.round(20 + stepFleetEffectiveHash * 0.25 + nextRigs.length * 14)
  );
  nextStats.peakFleetHashScore = Math.max(nextStats.peakFleetHashScore, playerPowerScore);
  const calibratedRivals = stepRivalSyndicates(
    prev.rivals,
    nextStep,
    nextRegime,
    playerPowerScore,
    modRivalGrowth
  );

  // 10. Active Contract tracking (including expanded contract types)
  let nextActiveContract = prev.activeContract ? { ...prev.activeContract } : null;
  let nextAvailableContracts = prev.availableContracts;
  nextStats.soloBlocksHit += soloBlocksHit;
  let finalCredibility = nextCredibility;
  let finalRp = nextRp;

  if (nextActiveContract) {
    nextActiveContract.stepsRemaining -= 1;
    if (nextActiveContract.type === 'COIN_REVENUE' && nextActiveContract.targetCoin) {
      nextActiveContract.progress += stepCoinUsdEarned[nextActiveContract.targetCoin] ?? 0;
    } else if (nextActiveContract.type === 'POOL_HASH') {
      nextActiveContract.progress += stepMiningUsd;
    } else if (nextActiveContract.type === 'LOW_NOISE_RUN') {
      if (peakNoiseDba <= facility.noiseLimitDba - 4 && enabledRigsCount > 0) {
        nextActiveContract.progress += 1;
      }
    } else if (nextActiveContract.type === 'MAINTENANCE_SLA') {
      const targetCond = nextActiveContract.targetConditionPct ?? 85;
      if (enabledRigsCount > 0 && activeAvgHealth >= targetCond) {
        nextActiveContract.progress += 1;
      }
    } else if (nextActiveContract.type === 'RESEARCH_PARTNERSHIP') {
      nextActiveContract.progress += stepRp;
    } else if (nextActiveContract.type === 'FACILITY_EXPANSION') {
      if (facIdx >= (nextActiveContract.targetFacilityIndex ?? 1)) {
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

  if (nextStep % 12 === 0 || nextAvailableContracts.length === 0) {
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
      4
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
    usedMarketListings: nextUsedListings,
    usedMarketRefreshStep: nextUsedRefresh,
    activeMarketModifiers: nextModifiers,
    coins: nextCoins,
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

  // 12. Evaluate milestones, achievements, and challenges
  const prog = evaluateProgression(nextState, playerPowerScore, {
    hadZeroFaultCycle: nextStep % BILLING_CYCLE_STEPS === 0 && !anyFailureOrOverheatThisStep,
  });
  nextState = prog.nextState;
  if (prog.milestoneHit) milestoneHit = true;

  // 13. Interactive Decision Event Roll
  let eventTriggered: PendingEvent | null = null;
  const raidChance =
    nextScrutiny >= 75 && nextUnderground.bribeProtectionSteps === 0
      ? 0.28
      : nextScrutiny >= 55 && nextUnderground.bribeProtectionSteps === 0
      ? 0.14
      : 0;
  const regularEventChance = nextStep >= 4 ? 0.095 : 0;

  if (Math.random() < raidChance) {
    eventTriggered = generateInteractiveEvent(nextState, 'RAID');
  } else if (Math.random() < regularEventChance) {
    eventTriggered = generateInteractiveEvent(nextState);
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
