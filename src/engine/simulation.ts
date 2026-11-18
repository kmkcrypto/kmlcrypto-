import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_TIERS,
  FIRMWARE_PROFILE_SPECS,
  GPU_PARTS,
  ILLICIT_MOD_SPECS,
  MARKET_REGIME_SPECS,
  OS_PARTS,
  POOL_MODE_SPECS,
  PSU_PARTS,
  RESEARCH_NODES,
  RIG_PRESETS,
  RIVAL_TEMPLATES,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from '../data/catalog';
import { createInitialCoins } from '../data/history';
import {
  BlackMarketListing,
  CoinMarketState,
  CoinSymbol,
  ContractSpec,
  DifficultyLevel,
  EmpireAlignment,
  FacilityTier,
  FirmwareProfile,
  GameState,
  IllicitModId,
  MarketRegime,
  MiningAlgorithm,
  MiningRig,
  NewsItem,
  PendingEvent,
  PendingEventCategory,
  PlacedCoolingUnit,
  PoolMode,
  RigBuildConfig,
  RivalSyndicate,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng, generateRandomSeed } from '../utils/rng';

export const BILLING_CYCLE_STEPS = 30;

export function getFacility(facilityId: string): FacilityTier {
  return FACILITY_TIERS.find((f) => f.id === facilityId) ?? FACILITY_TIERS[0];
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

export function calculateRigBuildCost(config: RigBuildConfig): number {
  const { chassis, compute, gpus, storage, psu, cooling, os } = getPartBundle(config);
  const gpuCost = gpus.reduce((sum, g) => sum + g.cost, 0);
  return chassis.cost + compute.cost + gpuCost + storage.cost + psu.cost + cooling.cost + os.cost;
}

export function calculatePartTradeInCost(oldCost: number, newCost: number): number {
  const tradeInCredit = Math.round(oldCost * 0.6);
  return newCost - tradeInCredit;
}

export function getRigRepairCost(rig: MiningRig): number {
  const missing = Math.max(0, 100 - rig.healthPct);
  if (missing < 0.5) return 0;
  const buildCost = calculateRigBuildCost(rig);
  return Math.max(15, Math.round((missing / 100) * buildCost * 0.35));
}

export function getRigRepasteCost(rig: MiningRig): number {
  const buildCost = calculateRigBuildCost(rig);
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
  activeRigCount = 1
): {
  totalCoolingPoints: number;
  effectiveCoolingPerRigC: number;
  totalCoolingWatts: number;
  maxCoolingNoiseDba: number;
} {
  let totalCoolingPoints = 0;
  let totalCoolingWatts = 0;
  let maxCoolingNoiseDba = 0;
  for (const unit of coolingUnits) {
    if (!unit.enabled) continue;
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === unit.type);
    if (!spec) continue;
    totalCoolingPoints += spec.coolingPowerC;
    totalCoolingWatts += spec.watts;
    if (spec.noiseDba > maxCoolingNoiseDba) maxCoolingNoiseDba = spec.noiseDba;
  }
  const divisor = Math.max(1, Math.sqrt(Math.max(1, activeRigCount)));
  const effectiveCoolingPerRigC = Math.min(34, totalCoolingPoints / divisor);
  return {
    totalCoolingPoints,
    effectiveCoolingPerRigC,
    totalCoolingWatts,
    maxCoolingNoiseDba,
  };
}

export function computeSpatialCoolingBonus(
  _gridX: number | undefined,
  _gridY: number | undefined,
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1
): number {
  return computeFacilityCoolingSummary(coolingUnits, activeRigCount).effectiveCoolingPerRigC;
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
    pasteStepsRemaining?: number;
    illicitMod?: IllicitModId | null;
  },
  facility: FacilityTier,
  unlockedResearch: string[],
  sysEngineerBonus: number,
  coolingUnits: PlacedCoolingUnit[] = [],
  activeRigCount = 1
): ComputedRigTelemetry {
  const { chassis, compute, gpus, storage, psu, cooling, os } = getPartBundle(rig);
  const ocRatio = Math.max(0.8, Math.min(1.5, rig.overclockPct / 100));
  const undervoltMult = unlockedResearch.includes('res_undervolt') ? 0.88 : 1.0;

  const fw = FIRMWARE_PROFILE_SPECS[rig.firmwareProfile ?? 'BALANCED'];
  const illicit = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod] : null;
  const healthPct = rig.healthPct ?? 100;
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
      fw.powerMult *
      (illicit?.powerMult ?? 1)
  );
  const wallWatts = Math.round(rawWatts / psu.efficiency);
  const isUnderpowered = rawWatts > psu.maxWatts;

  const isImmersion = cooling.id === 'cool_immersion' || cooling.id === 'cool_cryo_phase';
  const gpuNoise =
    gpus.length > 0 ? Math.max(...gpus.map((g) => g.noiseDba)) + gpus.length * 1.8 : 0;
  const rawNoise =
    30 +
    compute.noiseDba * 0.65 +
    gpuNoise * 0.55 +
    cooling.noiseDba * 0.6 +
    psu.noiseDba * 0.3 +
    chassis.noiseModifier +
    (ocRatio - 1) * 18 +
    (rig.firmwareProfile === 'TURBO' ? 4 : rig.firmwareProfile === 'ECO' ? -4 : 0) +
    (illicit?.noiseDeltaDba ?? 0);
  const noiseDba = Math.round(
    isImmersion ? Math.min(48, rawNoise * 0.55) : Math.max(26, rawNoise)
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
    activeRigCount
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
  if (healthPct <= 20) {
    healthFactor = 0;
  } else if (healthPct < 75) {
    healthFactor = Math.max(0.5, 1 - (75 - healthPct) * 0.009);
  }

  const totalMult =
    os.hashrateMultiplier *
    (1 + storage.efficiencyBonus) *
    ocRatio *
    fw.hashMult *
    (illicit?.hashMult ?? 1) *
    (1 + sysEngineerBonus) *
    thermalFactor *
    healthFactor *
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
  const analystBonus = Math.min(0.09, analysts.length * 0.03);
  return 1 + quantBonus + analystBonus;
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

export function getSysEngineerBonus(state: GameState): number {
  const engineers = state.employees.filter((e) => e.role === 'SYS_ENGINEER');
  const raw = engineers.reduce((sum, e) => {
    const shiftMult = e.shift === 'ROTATION_24_7' ? 1.25 : 1.0;
    const prioMult = e.priority === 'HASHRATE_TUNING' ? 1.3 : 1.0;
    return sum + 0.06 * shiftMult * prioMult;
  }, 0);
  return Math.min(0.35, raw);
}

export function getEffectiveFacilityPowerCapKw(state: Pick<GameState, 'facilityId' | 'underground'>): number {
  const facility = getFacility(state.facilityId);
  return state.underground?.powerSiphonActive
    ? Number((facility.maxPowerKw * 1.25).toFixed(2))
    : facility.maxPowerKw;
}

export function getFacilityTotals(state: GameState): {
  totalPowerKw: number;
  maxNoiseDba: number;
  rigCount: number;
  stepPowerCostUsd: number;
  cyclePayrollUsd: number;
  cycleRentUsd: number;
} {
  const facility = getFacility(state.facilityId);
  const sysBonus = getSysEngineerBonus(state);
  const ppaMult = state.unlockedResearch.includes('res_hydro_ppa') ? 0.72 : 1.0;
  const siphonMult = state.underground?.powerSiphonActive ? 0.35 : 1.0;

  let totalWatts = 0;
  let peakNoise = 28;
  const enabledCount = state.rigs.filter((r) => r.enabled).length;
  for (const rig of state.rigs) {
    if (!rig.enabled) continue;
    const t = computeRigTelemetry(
      rig,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      enabledCount
    );
    totalWatts += t.wallWatts;
    if (t.noiseDba > peakNoise) {
      peakNoise = t.noiseDba + Math.min(8, enabledCount * 0.7);
    }
  }
  for (const unit of state.coolingUnits ?? []) {
    if (!unit.enabled) continue;
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === unit.type);
    if (!spec) continue;
    totalWatts += spec.watts;
    if (spec.noiseDba > peakNoise) {
      peakNoise = spec.noiseDba;
    }
  }

  const totalPowerKw = totalWatts / 1000;
  const stepPowerCostUsd =
    totalPowerKw * 24 * facility.powerRatePerKwh * ppaMult * siphonMult;
  const cyclePayrollUsd = state.employees.reduce((sum, e) => {
    const spec = EMPLOYEE_SPECS.find((s) => s.role === e.role);
    const base = spec?.cycleSalary ?? 1500;
    const shiftMult = e.shift === 'ROTATION_24_7' ? 1.35 : 1.0;
    return sum + base * shiftMult;
  }, 0);
  const isOwned = state.ownedFacilityIds.includes(state.facilityId);
  const cycleRentUsd = isOwned ? 0 : facility.cycleRent;

  return {
    totalPowerKw,
    maxNoiseDba: Math.round(peakNoise),
    rigCount: state.rigs.length,
    stepPowerCostUsd,
    cyclePayrollUsd,
    cycleRentUsd,
  };
}

export function createInitialRivals(runSeed = 'DEFAULT'): RivalSyndicate[] {
  const rng = createSeededRng(`${runSeed}-rivals`);
  const coins: CoinSymbol[] = ['BTC', 'LTC', 'DOGE', 'XMR', 'ETH', 'XCH'];
  return RIVAL_TEMPLATES.map((tpl, idx) => ({
    id: tpl.id,
    name: tpl.name,
    archetype: tpl.archetype,
    specialtyCoin: coins[(idx * 2 + Math.floor(rng() * 3)) % coins.length],
    hashPowerIndex: Math.round(tpl.baseHash * (0.85 + rng() * 0.35)),
    baseGrowthRate: Number((tpl.baseGrowth + (rng() - 0.5) * 0.012).toFixed(4)),
    marketSharePct: 28 - idx * 4,
    aggressiveness: Number(Math.min(0.95, Math.max(0.25, tpl.aggressiveness + (rng() - 0.5) * 0.2)).toFixed(2)),
    hostility: Math.round(15 + rng() * 25),
    disruptedSteps: 0,
    lastActionSummary: 'Expanding baseline rack capacity',
  }));
}

export function generateContractBoard(
  state: Pick<GameState, 'stepCount' | 'rigs' | 'coins' | 'facilityId' | 'runSeed'>,
  count = 3
): ContractSpec[] {
  const rng = createSeededRng(`${state.runSeed}-contracts-${state.stepCount}-${Math.random()}`);
  const unlockedCoins = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (s) => state.coins[s].unlocked
  );
  const baseStepRev = Math.max(
    24,
    state.rigs.reduce((s, r) => s + r.lastStepUsd, 0)
  );
  const clients = [
    'Helios Clearing House',
    'Kestrel Cloud Arbitrage',
    'Meridian Validator Group',
    'Vanguard Custody Node',
    'Civic Grid Authority',
    'Boreal Liquidity Pool',
  ];

  const list: ContractSpec[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const clientName = clients[Math.floor(rng() * clients.length)];
    const duration = 8 + Math.floor(rng() * 8); // 8-15 steps
    const coin = unlockedCoins[Math.floor(rng() * unlockedCoins.length)] ?? 'BTC';

    if (roll < 0.45) {
      const targetAmount = Math.round(baseStepRev * duration * (1.1 + rng() * 0.35));
      const rewardCash = Math.round(targetAmount * (0.38 + rng() * 0.16));
      const rewardRp = Math.round(6 + duration * 1.4);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `${coin} Yield Sprint`,
        clientName,
        type: 'COIN_REVENUE',
        targetCoin: coin,
        targetAmount,
        progress: 0,
        durationSteps: duration,
        stepsRemaining: duration,
        rewardCash,
        rewardRp,
        penaltyCredibility: 5,
        description: `Generate ${formatUsd(targetAmount)} in ${coin} mining payouts within ${duration} steps.`,
      });
    } else if (roll < 0.8) {
      const targetAmount = Math.round(baseStepRev * duration * (1.2 + rng() * 0.3));
      const rewardCash = Math.round(targetAmount * (0.34 + rng() * 0.14));
      const rewardRp = Math.round(10 + duration * 1.6);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Dedicated Fleet Throughput',
        clientName,
        type: 'POOL_HASH',
        targetAmount,
        progress: 0,
        durationSteps: duration,
        stepsRemaining: duration,
        rewardCash,
        rewardRp,
        penaltyCredibility: 4,
        description: `Deliver ${formatUsd(targetAmount)} total fleet hash output over ${duration} steps.`,
      });
    } else {
      const quietSteps = 6 + Math.floor(rng() * 5);
      const rewardCash = Math.round(baseStepRev * quietSteps * 0.6 + 260);
      const rewardRp = Math.round(8 + quietSteps * 1.5);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Whisper-Quiet Compliance',
        clientName,
        type: 'LOW_NOISE_RUN',
        targetAmount: quietSteps,
        progress: 0,
        durationSteps: quietSteps + 3,
        stepsRemaining: quietSteps + 3,
        rewardCash,
        rewardRp,
        penaltyCredibility: 4,
        description: `Hold peak noise at least 4 dBA under limit for ${quietSteps} steps.`,
      });
    }
  }
  return list;
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
  customSeed?: string
): GameState {
  const runSeed = customSeed?.trim() || generateRandomSeed();
  const rng = createSeededRng(`${runSeed}-init`);

  const startingCash = devMode
    ? 2_500_000
    : difficulty === 'BOOTSTRAP'
    ? 750
    : difficulty === 'STANDARD'
    ? 1450
    : 35000;

  const starterRig: MiningRig = {
    id: 'rig_starter_1',
    name: 'Bedroom Desk Tower #1',
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
    gridX: 2,
    gridY: 2,
    temperatureC: 54,
    healthPct: 100,
    status: 'MINING',
    lastStepCoins: 0,
    lastStepUsd: 0,
    totalMinedCoins: 0,
    totalEarnedUsd: 0,
    createdStep: 0,
  };

  const coins = createInitialCoins(runSeed);
  if (devMode) {
    (Object.keys(coins) as CoinSymbol[]).forEach((sym) => {
      coins[sym] = { ...coins[sym], unlocked: true };
    });
  }

  const startRegimes: MarketRegime[] = ['ACCUMULATION', 'BULL_RUN', 'ACCUMULATION'];
  const marketRegime = startRegimes[Math.floor(rng() * startRegimes.length)];
  const regSpec = MARKET_REGIME_SPECS[marketRegime];
  const regimeStepsRemaining = Math.round(
    regSpec.minSteps + rng() * (regSpec.maxSteps - regSpec.minSteps)
  );

  const baseState: GameState = {
    mode: 'PLAYING',
    difficulty,
    runSeed,
    stepCount: 0,
    soundEnabled: true,
    cash: startingCash,
    researchPoints: devMode ? 1000 : difficulty === 'TYCOON_SANDBOX' ? 80 : 12,
    unlockedResearch: [],
    activeResearchId: null,
    activeResearchProgress: 0,
    facilityId: 'fac_bedroom',
    ownedFacilityIds: ['fac_bedroom'],
    rigs: [starterRig],
    coolingUnits: [],
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
    currentCycleStats: {
      miningRevenueUsd: 0,
      otherSpendUsd: 0,
    },
    news: [
      {
        id: 'news_init',
        step: 0,
        stepLabel: 'Step 0',
        title: devMode ? `Dev Sandbox Online (${runSeed})` : `Terminal Online (${runSeed})`,
        detail: devMode
          ? 'Dev Mode active: all coins, parts, and dev event triggers unlocked.'
          : 'Mined coins auto-sell every step. Explore pools ("rig 1 pool solo"), firmware ("rig 1 profile turbo"), "contracts", "rivals", or covert "ops" & "blackmarket".',
        category: 'MILESTONE',
      },
    ],
    competitorTechScore: 10,
    noiseFinesTotal: 0,
    stats: {
      soloBlocksHit: 0,
      contractsCompleted: 0,
      covertOpsCount: 0,
      raidsSurvived: 0,
      totalFinesAndBribesUsd: 0,
    },
    tutorialStep: devMode ? 0 : 1,
    devMode,
    devUnlockAll: devMode,
  };

  baseState.availableContracts = generateContractBoard(baseState, 3);
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
      const pool: PendingEventCategory[] = ['MARKET', 'GRID', 'HARDWARE', 'RIVAL'];
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
          riskNote: `70% chance of ${formatUsd(fineCost)} seizure, -10 credibility`,
          resolutionId: 'raid_resist',
        },
      ],
    };
  }

  if (category === 'GRID') {
    const tariffUsd = Math.max(120, Math.round(stepRev * 3.5));
    return {
      id: `evt_grid_${step}`,
      category: 'GRID',
      title: 'Regional Grid Peak Tariff & Brownout',
      description:
        'A severe power crunch just hit your substation. Spot kWh rates are spiking unless you shed load immediately.',
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

  if (category === 'HARDWARE' && targetRig) {
    const patchCost = Math.max(90, Math.round(getRigRepairCost(targetRig) + 120));
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
          riskNote: 'Restores 100% health + fresh thermal paste',
          resolutionId: 'hw_fix',
        },
        {
          key: '2',
          label: 'Run diagnostic firmware dump',
          riskNote: '-18% rig health, +12 Research Points',
          resolutionId: 'hw_research',
        },
        {
          key: '3',
          label: 'Push TURBO through the storm',
          riskNote: 'Sets TURBO + 2x step bonus cash now, +14°C & -22% health',
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
          riskNote: '+8 Credibility, +15 RP, lifts coin sentiment',
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
        riskNote: `+28% ${hotCoin} price spike, +18 Heat, -6 Credibility`,
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
  let next: GameState = {
    ...state,
    pendingEvent: null,
    cash: state.cash - (choice.costUsd ?? 0),
    currentCycleStats: {
      ...state.currentCycleStats,
      otherSpendUsd: state.currentCycleStats.otherSpendUsd + (choice.costUsd ?? 0),
    },
    stats: { ...state.stats },
    underground: { ...state.underground },
  };

  let summary = '';
  let milestoneHit = false;
  let alertHit = false;
  const res = choice.resolutionId;

  if (res === 'raid_bribe') {
    next.regulatoryScrutiny = Math.max(0, next.regulatoryScrutiny - 28);
    next.underground.bribeProtectionSteps = 10;
    next.stats.covertOpsCount += 1;
    next.stats.raidsSurvived += 1;
    next.stats.totalFinesAndBribesUsd += choice.costUsd ?? 0;
    summary = `Inspectors looked the other way (-28 Heat, 10-step audit shield).`;
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
      summary = `Inspectors levied ${formatUsd(fine)} fine (-30 Heat, -10 Credibility).`;
      alertHit = true;
    } else {
      next.regulatoryScrutiny = Math.max(5, next.regulatoryScrutiny - 18);
      summary = `Your lawyers blocked the warrant! (-18 Heat).`;
      milestoneHit = true;
    }
    next.stats.raidsSurvived += 1;
  } else if (res === 'grid_pay') {
    summary = `Paid ${formatUsd(choice.costUsd ?? 0)} peak tariff. Fleet remains at full output.`;
  } else if (res === 'grid_eco') {
    next.rigs = next.rigs.map((r) => ({ ...r, firmwareProfile: 'ECO' as const }));
    summary = `All rigs switched to ECO firmware (-20% draw, -28% heat).`;
  } else if (res === 'grid_siphon') {
    next.underground.powerSiphonActive = true;
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 18);
    next.stats.covertOpsCount += 1;
    summary = `Meter siphon wired! Electricity bills -65%, breaker cap +25% (+18 Heat).`;
    alertHit = true;
  } else if (res === 'hw_fix') {
    next.rigs = next.rigs.map((r) =>
      r.id === evt.targetRigId
        ? {
            ...r,
            healthPct: 100,
            pasteStepsRemaining: 16,
            status: r.enabled ? 'MINING' : 'PAUSED',
          }
        : r
    );
    summary = `Replaced VRM caps and repasted target rig (100% health).`;
    milestoneHit = true;
  } else if (res === 'hw_research') {
    next.rigs = next.rigs.map((r) =>
      r.id === evt.targetRigId
        ? {
            ...r,
            healthPct: Math.max(20, r.healthPct - 18),
          }
        : r
    );
    next.researchPoints += 12;
    summary = `Captured silicon telemetry logs (+12.0 RP, -18% rig health).`;
  } else if (res === 'hw_push') {
    const bonus = Math.max(80, Math.round(state.rigs.reduce((s, r) => s + r.lastStepUsd, 0) * 2));
    next.cash += bonus;
    next.rigs = next.rigs.map((r) =>
      r.id === evt.targetRigId
        ? {
            ...r,
            firmwareProfile: 'TURBO',
            temperatureC: Math.min(98, r.temperatureC + 14),
            healthPct: Math.max(20, r.healthPct - 22),
          }
        : r
    );
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
    summary = `Counter-bounty boosted Credibility (+8) and R&D (+15 RP).`;
    milestoneHit = true;
  } else if (res === 'rival_ddos') {
    next.rivals = next.rivals.map((rv) =>
      rv.id === evt.targetRivalId
        ? { ...rv, disruptedSteps: 10, hostility: Math.min(100, rv.hostility + 20), lastActionSummary: 'Under heavy DDoS disruption' }
        : rv
    );
    next.regulatoryScrutiny = Math.min(100, next.regulatoryScrutiny + 16);
    next.stats.covertOpsCount += 1;
    summary = `Syndicate knocked offline for 10 steps (+16 Heat).`;
    alertHit = true;
  } else if (res === 'rival_ignore') {
    next.rivals = next.rivals.map((rv) =>
      rv.id === evt.targetRivalId
        ? { ...rv, hashPowerIndex: Math.round(rv.hashPowerIndex * 1.08), lastActionSummary: 'Captured extra pool share' }
        : rv
    );
    summary = `Rival expanded hash share uncontested.`;
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
    summary = `Illicit wash volume spiked ${evt.targetCoin} +28% (+18 Heat, -6 Credibility).`;
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
    summary = `Observed market clearing safely (+6.0 RP quant data).`;
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

  let milestoneHit = false;
  let alertHit = false;
  let soloBlocksHit = 0;

  const newNews: NewsItem[] = [...prev.news];
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

  // 1. Advance Market Regime
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

  // 3. Rival syndicates progression & hash growth
  const activeRivalFactor = prev.rivals.reduce(
    (sum, rv) => sum + (rv.disruptedSteps > 0 ? rv.hashPowerIndex * 0.45 : rv.hashPowerIndex),
    0
  );
  const nextRivals = prev.rivals.map((rv) => {
    if (rv.disruptedSteps > 0) {
      return {
        ...rv,
        disruptedSteps: rv.disruptedSteps - 1,
        hashPowerIndex: Math.max(20, Math.round(rv.hashPowerIndex * 0.992)),
      };
    }
    const growth = rv.baseGrowthRate - 1;
    const nextHash = Math.round(rv.hashPowerIndex * (1 + growth * (0.4 + Math.random() * 0.5)));
    return {
      ...rv,
      hashPowerIndex: Math.min(999_999, nextHash),
      lastActionSummary:
        nextStep % 9 === 0 && Math.random() < rv.aggressiveness * 0.35
          ? `Deployed new ${rv.specialtyCoin} cluster`
          : rv.lastActionSummary,
    };
  });

  // 4. Update dynamic market prices, network difficulty & coin halvings
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

    // Halving check
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
      1 + 0.0022 * (1 + Math.min(1.2, activeRivalFactor / 6000));
    const nextDiff = Number(Math.min(12, coin.networkDifficulty * diffStepScale).toFixed(3));

    const multiplier = Math.max(
      0.55,
      1 + pull + randWave + regimeSpec.stepDrift + prBoost + sentimentDrift + halvingSupplyShock
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

  // 5. Employee automation & RP generation
  const technicians = prev.employees.filter((e) => e.role === 'TECHNICIAN');
  const researchers = prev.employees.filter((e) => e.role === 'RESEARCHER');
  const hasThermalTech = technicians.some((t) => t.priority === 'THERMAL_SAFETY');

  const stepRp =
    0.75 +
    researchers.reduce((sum, r) => {
      const mult = r.shift === 'ROTATION_24_7' ? 1.35 : 1.0;
      const prio = r.priority === 'RESEARCH_OUTPUT' ? 1.35 : 1.0;
      return sum + 4.5 * mult * prio;
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

  // 6. Fleet power, breaker cap (with siphon headroom) & noise check
  const sysBonus = getSysEngineerBonus(prev);
  let totalWallWatts = 0;
  let peakNoiseDba = 28;
  const enabledRigsCount = prev.rigs.filter((r) => r.enabled).length;

  for (const r of prev.rigs) {
    if (!r.enabled) continue;
    const t = computeRigTelemetry(
      r,
      facility,
      nextUnlocked,
      sysBonus,
      prev.coolingUnits ?? [],
      enabledRigsCount
    );
    totalWallWatts += t.wallWatts;
    if (t.noiseDba > peakNoiseDba) {
      peakNoiseDba = t.noiseDba + Math.min(8, enabledRigsCount * 0.7);
    }
  }
  for (const u of prev.coolingUnits ?? []) {
    if (!u.enabled) continue;
    const spec = ROOM_COOLING_UNITS.find((s) => s.id === u.type);
    if (spec) {
      totalWallWatts += spec.watts;
      if (spec.noiseDba > peakNoiseDba) peakNoiseDba = spec.noiseDba;
    }
  }

  const effectivePowerCap = getEffectiveFacilityPowerCapKw(prev);
  const breakerOverloaded = totalWallWatts / 1000 > effectivePowerCap;
  const noiseExceeded = peakNoiseDba > facility.noiseLimitDba;

  let nextCash = prev.cash;
  let stepMiningUsd = 0;
  let stepNoiseFine = 0;
  let stepFleetEffectiveHash = 0;
  const stepCoinUsdEarned: Partial<Record<CoinSymbol, number>> = {};

  if (noiseExceeded && enabledRigsCount > 0 && nextStep % 5 === 0) {
    stepNoiseFine = Math.round((peakNoiseDba - facility.noiseLimitDba) * 4.5);
    nextCash -= stepNoiseFine;
    alertHit = true;
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

  // 7. Step each mining rig + automatic coin selling + wear/solo variance
  const nextRigs: MiningRig[] = prev.rigs.map((rig) => {
    if (!rig.enabled) {
      return {
        ...rig,
        temperatureC: Math.max(facility.ambientTempC, rig.temperatureC - 6),
        status: rig.healthPct <= 20 ? 'NEEDS_REPAIR' : 'PAUSED',
        lastStepCoins: 0,
        lastStepUsd: 0,
        lastStepBlockHit: false,
      };
    }

    if (rig.healthPct <= 20) {
      return {
        ...rig,
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
      enabledRigsCount
    );

    let nextTemp = Math.round(rig.temperatureC * 0.4 + telemetry.equilibriumTempC * 0.6);
    if (hasThermalTech && nextTemp > 84) {
      nextTemp = Math.max(79, nextTemp - 5);
    }

    let status: MiningRig['status'] = 'MINING';
    let efficiencyFactor = 1.0;

    if (telemetry.isUnderpowered || breakerOverloaded) {
      status = 'UNDERPOWERED';
      efficiencyFactor = 0;
    } else if (nextTemp >= 96) {
      status = 'OVERHEATED';
      efficiencyFactor = 0;
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
      enabledRigsCount
    );
    stepFleetEffectiveHash += finalTelemetry.effectiveHashrate;

    const { minedCoins, autoSoldUsd, soloBlockHit } = computeStepCoinOutput(
      finalTelemetry.effectiveHashrate,
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
    const baseWear = nextTemp > 86 ? 0.95 : nextTemp > 76 ? 0.35 : 0.16;
    const repair = technicians.length > 0 ? 0.32 * technicians.length : 0;
    const nextHealth = Math.max(
      20,
      Math.min(100, rig.healthPct - baseWear * fwWearMult * modWearMult * ocWearMult + repair)
    );
    const finalStatus: MiningRig['status'] = nextHealth <= 20 ? 'NEEDS_REPAIR' : status;

    return {
      ...rig,
      temperatureC: nextTemp,
      healthPct: Number(nextHealth.toFixed(1)),
      pasteStepsRemaining: Math.max(0, rig.pasteStepsRemaining - 1),
      status: finalStatus,
      soloBlocksWon: rig.soloBlocksWon + (soloBlockHit ? 1 : 0),
      lastStepBlockHit: soloBlockHit,
      lastStepCoins: minedCoins,
      lastStepUsd: autoSoldUsd,
      totalMinedCoins: rig.totalMinedCoins + minedCoins,
      totalEarnedUsd: rig.totalEarnedUsd + autoSoldUsd,
    };
  });

  // 8. Underground active ops (botnet hash injection + power siphon heat + black market refresh)
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

  const nextScrutiny = Math.max(0, Math.min(100, prev.regulatoryScrutiny + stepScrutinyDelta));
  const nextCredibility = Math.min(100, prev.mediaCredibility + 0.08);

  // 9. Update rival market share relative to player
  const playerPowerScore = Math.max(12, Math.round(20 + stepFleetEffectiveHash * 0.25 + nextRigs.length * 14));
  const totalEcosystem = playerPowerScore + nextRivals.reduce((s, r) => s + r.hashPowerIndex, 0);
  const calibratedRivals = nextRivals.map((rv) => ({
    ...rv,
    marketSharePct: Number(((rv.hashPowerIndex / Math.max(1, totalEcosystem)) * 100).toFixed(1)),
  }));

  // 10. Active Contract tracking
  let nextActiveContract = prev.activeContract ? { ...prev.activeContract } : null;
  let nextAvailableContracts = prev.availableContracts;
  let nextStats = { ...prev.stats, soloBlocksHit: prev.stats.soloBlocksHit + soloBlocksHit };
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
    }

    if (nextActiveContract.progress >= nextActiveContract.targetAmount) {
      nextCash += nextActiveContract.rewardCash;
      finalRp += nextActiveContract.rewardRp;
      finalCredibility = Math.min(100, finalCredibility + 4);
      nextStats.contractsCompleted += 1;
      milestoneHit = true;
      pushNews(
        `Contract Completed: ${nextActiveContract.title}`,
        `Paid +${formatUsd(nextActiveContract.rewardCash)} and +${nextActiveContract.rewardRp} RP!`,
        'CONTRACT'
      );
      nextActiveContract = null;
    } else if (nextActiveContract.stepsRemaining <= 0) {
      finalCredibility = Math.max(
        5,
        finalCredibility - nextActiveContract.penaltyCredibility
      );
      alertHit = true;
      pushNews(
        `Contract Missed: ${nextActiveContract.title}`,
        `Deadline expired (-${nextActiveContract.penaltyCredibility} Credibility).`,
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
      },
      3
    );
  }

  // 11. Cycle settlement every 30 steps
  const ppaMult = nextUnlocked.includes('res_hydro_ppa') ? 0.72 : 1.0;
  const siphonMult = nextUnderground.powerSiphonActive ? 0.35 : 1.0;
  const stepElecCost =
    (totalWallWatts / 1000) * 24 * facility.powerRatePerKwh * ppaMult * siphonMult;

  let nextCycleStats = {
    ...prev.currentCycleStats,
    miningRevenueUsd: prev.currentCycleStats.miningRevenueUsd + stepMiningUsd,
  };
  const nextLedger = [...prev.ledger];
  let billsSettledUsd = 0;

  if (nextStep % BILLING_CYCLE_STEPS === 0) {
    const cycleNumber = nextStep / BILLING_CYCLE_STEPS;
    const startStep = nextStep - BILLING_CYCLE_STEPS + 1;
    const cycleLabel = `C${cycleNumber} (${startStep}-${nextStep})`;

    const cycleElec = stepElecCost * BILLING_CYCLE_STEPS;
    const isOwned = prev.ownedFacilityIds.includes(prev.facilityId);
    const cycleRent = isOwned ? 0 : facility.cycleRent;
    const cyclePayroll = prev.employees.reduce((sum, e) => {
      const spec = EMPLOYEE_SPECS.find((s) => s.role === e.role);
      const base = spec?.cycleSalary ?? 1500;
      return sum + base * (e.shift === 'ROTATION_24_7' ? 1.35 : 1.0);
    }, 0);

    billsSettledUsd = cycleElec + cycleRent + cyclePayroll;
    nextCash -= billsSettledUsd;

    const netCashflow =
      nextCycleStats.miningRevenueUsd - billsSettledUsd - nextCycleStats.otherSpendUsd;

    nextLedger.unshift({
      cycleNumber,
      label: cycleLabel,
      miningRevenueUsd: nextCycleStats.miningRevenueUsd,
      electricityCostUsd: cycleElec,
      rentCostUsd: cycleRent,
      payrollCostUsd: cyclePayroll,
      otherSpendUsd: nextCycleStats.otherSpendUsd,
      netCashflowUsd: netCashflow,
    });

    if (nextCash < 0) {
      alertHit = true;
      pushNews(
        `Cycle ${cycleNumber} Bills Alert`,
        `Bills of $${Math.round(billsSettledUsd)} pushed cash negative ($${Math.round(nextCash)}).`,
        'ALERT'
      );
    }

    nextCycleStats = {
      miningRevenueUsd: 0,
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
    currentCycleStats: nextCycleStats,
    news: newNews.slice(0, 60),
    competitorTechScore: Math.min(100, prev.competitorTechScore + 0.08),
    noiseFinesTotal: prev.noiseFinesTotal + stepNoiseFine,
    stats: nextStats,
  };

  // 12. Interactive Decision Event Roll (pauses batch step when triggered)
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
