import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  GPU_PARTS,
  OS_PARTS,
  PSU_PARTS,
  STORAGE_PARTS,
} from '../data/catalog';
import {
  ChassisPart,
  CoinSymbol,
  ComputePart,
  CoolingPart,
  CustomAsicSpec,
  CustomComponentSpec,
  GameState,
  GpuPart,
  HardwareConditionTier,
  HardwareGen,
  MiningRig,
  OsPart,
  PsuPart,
  RigBuildConfig,
  RigComponentHealth,
  RigCustomPartsMap,
  StoragePart,
  UsedMarketListing,
} from '../types/game';
import { createSeededRng } from '../utils/rng';

export function createInitialComponentHealth(
  gpuCount: number,
  initialPct = 100
): RigComponentHealth {
  const val = Number(Math.max(20, Math.min(100, initialPct)).toFixed(1));
  return {
    chassis: val,
    compute: val,
    gpus: Array.from({ length: Math.max(0, gpuCount) }, () => val),
    storage: val,
    psu: val,
    cooling: val,
  };
}

export function ensureRigComponentHealth(
  rig: Pick<MiningRig, 'gpuIds' | 'healthPct' | 'componentHealth'>
): RigComponentHealth {
  const fallback = Number(Math.max(20, Math.min(100, rig.healthPct ?? 100)).toFixed(1));
  const c = rig.componentHealth;
  if (!c) {
    return createInitialComponentHealth(rig.gpuIds.length, fallback);
  }
  const gpus = rig.gpuIds.map((_, idx) => {
    const val = c.gpus?.[idx];
    return typeof val === 'number' && Number.isFinite(val)
      ? Number(Math.max(20, Math.min(100, val)).toFixed(1))
      : fallback;
  });
  const clamp = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Number(Math.max(20, Math.min(100, v)).toFixed(1))
      : fallback;
  return {
    chassis: clamp(c.chassis),
    compute: clamp(c.compute),
    gpus,
    storage: clamp(c.storage),
    psu: clamp(c.psu),
    cooling: clamp(c.cooling),
  };
}

export function computeAverageRigHealth(comp: RigComponentHealth): number {
  const vals = [
    comp.chassis,
    comp.compute,
    ...comp.gpus,
    comp.storage,
    comp.psu,
    comp.cooling,
  ];
  if (vals.length === 0) return 100;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Number(Math.max(20, Math.min(100, avg)).toFixed(1));
}

export function customSpecToChassis(spec: CustomComponentSpec): ChassisPart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'chassis',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    branch: spec.branch,
    allowedBranches: spec.allowedBranches,
    supportsHybridAsicGpu: spec.supportsHybridAsicGpu,
    isCryoRated: spec.isCryoRated,
    isOpticalBackplane: spec.isOpticalBackplane,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    maxGpus: spec.maxGpus ?? (spec.isAsicRack ? 0 : 8),
    maxStorage: spec.maxStorage ?? 8,
    isAsicRack: Boolean(spec.isAsicRack),
    maxAsics: spec.maxAsics ?? (spec.isAsicRack ? 1 : 0),
    baseWatts: spec.baseWatts ?? 45,
    coolingBonus: spec.coolingBonus ?? 24,
    noiseModifier: spec.noiseModifier ?? 0,
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} enclosure.`,
  };
}

export function customSpecToCompute(spec: CustomComponentSpec): ComputePart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'compute',
    kind: spec.computeKind ?? 'ASIC',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    branch: spec.branch,
    requiresCryoCooling: spec.requiresCryoCooling,
    requiresOpticalChassis: spec.requiresOpticalChassis,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    watts: spec.watts ?? 2800,
    heatC: spec.heatC ?? 60,
    noiseDba: spec.noiseDba ?? 32,
    hashrates: spec.hashrates ?? (spec.algo ? { [spec.algo]: 100 } : {}),
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} compute silicon.`,
  };
}

export function customSpecToGpu(spec: CustomComponentSpec): GpuPart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'gpu',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    branch: spec.branch,
    vramGb: spec.vramGb ?? (spec.generation >= 6 ? 48 : spec.generation >= 5 ? 32 : 16),
    requiresCryoCooling: spec.requiresCryoCooling,
    requiresOpticalChassis: spec.requiresOpticalChassis,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    watts: spec.watts ?? 320,
    heatC: spec.heatC ?? 36,
    noiseDba: spec.noiseDba ?? 14,
    hashrates: spec.hashrates ?? { ETHASH: 140 },
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} accelerator card.`,
  };
}

export function customSpecToStorage(spec: CustomComponentSpec): StoragePart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'storage',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    ramGb: spec.ramGb ?? 64,
    storageTb: spec.storageTb ?? 160,
    watts: spec.watts ?? 90,
    heatC: spec.heatC ?? 12,
    efficiencyBonus: spec.efficiencyBonus ?? 0.12,
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} memory & plot array.`,
  };
}

export function customSpecToPsu(spec: CustomComponentSpec): PsuPart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'psu',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    maxWatts: spec.maxWatts ?? 3600,
    efficiency: spec.efficiency ?? 0.96,
    noiseDba: spec.noiseDba ?? 9,
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} power delivery module.`,
  };
}

export function customSpecToCooling(
  spec: CustomComponentSpec
): CoolingPart & { isImmersion?: boolean } {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'cooling',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    branch: spec.branch,
    isCryoRated: spec.isCryoRated,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    coolingPowerC: spec.coolingPowerC ?? 120,
    watts: spec.watts ?? 80,
    noiseDba: spec.noiseDba ?? 10,
    isImmersion: spec.isImmersion,
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} thermal system.`,
  };
}

export function customSpecToOs(spec: CustomComponentSpec): OsPart {
  return {
    id: `custom_${spec.blueprintId}`,
    name: `[FAB] ${spec.name}`,
    category: 'os',
    era: spec.generation >= 7 ? 'QUANTUM' : spec.generation >= 6 ? 'AI' : 'ASIC',
    generation: spec.generation,
    cost: Math.max(spec.unitCostUsd, Math.round(spec.wholesaleValueUsd * 0.85)),
    hashrateMultiplier: spec.hashrateMultiplier ?? 1.18,
    powerMultiplier: spec.powerMultiplier ?? 0.92,
    stabilityBonus: spec.stabilityBonus ?? 0.3,
    description: `Custom Foundry ${spec.processNode} ${spec.architecture} firmware kernel.`,
  };
}

export function getEffectivePartBundle(
  config: RigBuildConfig & {
    customAsicSpec?: CustomAsicSpec;
    customParts?: RigCustomPartsMap;
  }
): {
  chassis: ChassisPart;
  compute: ComputePart;
  gpus: GpuPart[];
  storage: StoragePart;
  psu: PsuPart;
  cooling: CoolingPart & { isImmersion?: boolean };
  os: OsPart;
} {
  const cp = config.customParts;
  const chassis = cp?.chassis
    ? customSpecToChassis(cp.chassis)
    : CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0];
  const compute = cp?.compute
    ? customSpecToCompute(cp.compute)
    : COMPUTE_PARTS.find((c) => c.id === config.computeId) ?? COMPUTE_PARTS[0];
  const gpus = config.gpuIds
    .map((id, idx) => {
      const customG = cp?.gpus?.[idx];
      if (customG) return customSpecToGpu(customG);
      return GPU_PARTS.find((g) => g.id === id);
    })
    .filter((g): g is GpuPart => Boolean(g));
  const storage = cp?.storage
    ? customSpecToStorage(cp.storage)
    : STORAGE_PARTS.find((s) => s.id === config.storageId) ?? STORAGE_PARTS[0];
  const psu = cp?.psu
    ? customSpecToPsu(cp.psu)
    : PSU_PARTS.find((p) => p.id === config.psuId) ?? PSU_PARTS[0];
  const cooling = cp?.cooling
    ? customSpecToCooling(cp.cooling)
    : COOLING_PARTS.find((c) => c.id === config.coolingId) ?? COOLING_PARTS[0];
  const os = cp?.os
    ? customSpecToOs(cp.os)
    : OS_PARTS.find((o) => o.id === config.osId) ?? OS_PARTS[0];
  return { chassis, compute, gpus, storage, psu, cooling, os };
}

export function getRigGeneration(
  config: RigBuildConfig & {
    customAsicSpec?: MiningRig['customAsicSpec'];
    customParts?: RigCustomPartsMap;
  }
): HardwareGen {
  const cp = config.customParts;
  let customMax = 0;
  if (config.customAsicSpec) {
    if (config.customAsicSpec.processNode === 'photonic') customMax = Math.max(customMax, 7);
    else if (config.customAsicSpec.processNode === '1nm') customMax = Math.max(customMax, 6);
    else if (config.customAsicSpec.processNode === '2nm') customMax = Math.max(customMax, 5);
    else if (
      config.customAsicSpec.processNode === '3nm' ||
      config.customAsicSpec.processNode === '5nm'
    )
      customMax = Math.max(customMax, 4);
    else customMax = Math.max(customMax, 3);
  }
  if (cp) {
    const list: (CustomComponentSpec | null | undefined)[] = [
      cp.chassis,
      cp.compute,
      ...(cp.gpus ?? []),
      cp.storage,
      cp.psu,
      cp.cooling,
      cp.os,
    ];
    for (const s of list) {
      if (s?.generation) customMax = Math.max(customMax, s.generation);
    }
  }
  const ch = CHASSIS_PARTS.find((c) => c.id === config.chassisId);
  const comp = COMPUTE_PARTS.find((c) => c.id === config.computeId);
  const gpus = config.gpuIds
    .map((id) => GPU_PARTS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const maxGpuGen = gpus.reduce((m, g) => Math.max(m, g.generation ?? 1), 0);
  const g = Math.max(
    customMax,
    comp?.generation ?? 1,
    ch?.generation ?? 1,
    maxGpuGen
  ) as HardwareGen;
  return g;
}

export function getGlobalHardwarePriceMult(
  state: Pick<GameState, 'activeMarketModifiers'> & { marketRegime?: GameState['marketRegime'] }
): number {
  const mods = state.activeMarketModifiers ?? [];
  const modMult = mods.reduce((m, item) => m * item.hardwarePriceMult, 1.0);
  const regimeMult =
    state.marketRegime === 'MANIA_PEAK'
      ? 1.08
      : state.marketRegime === 'CRYPTO_WINTER'
      ? 0.92
      : 1.0;
  return Number((modMult * regimeMult).toFixed(4));
}

export function getGlobalResaleValueMult(
  state: Pick<GameState, 'activeMarketModifiers' | 'unlockedResearch'>
): number {
  const mods = state.activeMarketModifiers ?? [];
  const evtMult = mods.reduce((m, item) => m * item.resaleValueMult, 1.0);
  const brokerMult = state.unlockedResearch?.includes('res_secondary_broker') ? 1.12 : 1.0;
  return evtMult * brokerMult;
}

/**
 * Total replacement / valuation cost of all installed parts (including custom-manufactured parts).
 * Used for resale value, repaste fees, and company valuation.
 */
export function calculateBaseRigPartsCost(
  config: RigBuildConfig & { customAsicSpec?: CustomAsicSpec; customParts?: RigCustomPartsMap }
): number {
  const { chassis, compute, gpus, storage, psu, cooling, os } = getEffectivePartBundle(config);
  const gpuCost = gpus.reduce((sum, g) => sum + g.cost, 0);
  return chassis.cost + compute.cost + gpuCost + storage.cost + psu.cost + cooling.cost + os.cost;
}

/**
 * Retail checkout cost for building a rig, skipping slots supplied directly from Foundry Inventory
 * (which were already manufactured & paid for).
 */
export function calculateStockBuildPartsCost(config: RigBuildConfig): number {
  const cp = config.customParts;
  const chassisCost = cp?.chassis
    ? 0
    : (CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0]).cost;
  const computeCost = cp?.compute
    ? 0
    : (COMPUTE_PARTS.find((c) => c.id === config.computeId) ?? COMPUTE_PARTS[0]).cost;
  const gpuCost = config.gpuIds.reduce((sum, id, idx) => {
    if (cp?.gpus?.[idx]) return sum;
    return sum + (GPU_PARTS.find((g) => g.id === id)?.cost ?? 0);
  }, 0);
  const storageCost = cp?.storage
    ? 0
    : (STORAGE_PARTS.find((s) => s.id === config.storageId) ?? STORAGE_PARTS[0]).cost;
  const psuCost = cp?.psu
    ? 0
    : (PSU_PARTS.find((p) => p.id === config.psuId) ?? PSU_PARTS[0]).cost;
  const coolingCost = cp?.cooling
    ? 0
    : (COOLING_PARTS.find((c) => c.id === config.coolingId) ?? COOLING_PARTS[0]).cost;
  const osCost = cp?.os
    ? 0
    : (OS_PARTS.find((o) => o.id === config.osId) ?? OS_PARTS[0]).cost;
  return chassisCost + computeCost + gpuCost + storageCost + psuCost + coolingCost + osCost;
}

export function calculateRigResaleValue(
  rig: MiningRig,
  state?: Pick<GameState, 'activeMarketModifiers' | 'unlockedResearch'>
): number {
  const retailCost = calculateBaseRigPartsCost(rig);
  const conditionFactor = 0.25 + (Math.max(10, rig.healthPct) / 100) * 0.75;
  const ageDepreciation = Math.max(0.45, 1 - (rig.ageSteps ?? 0) * 0.0025);
  const baseSalvageRatio = 0.56;
  const marketMult = state ? getGlobalResaleValueMult(state) : 1.0;
  return Math.max(25, Math.round(retailCost * baseSalvageRatio * conditionFactor * ageDepreciation * marketMult));
}

export function getConditionLabel(tier: HardwareConditionTier): string {
  switch (tier) {
    case 'NEW':
      return 'Factory New';
    case 'REFURBISHED':
      return 'Refurbished';
    case 'USED':
      return 'Used Surplus';
    case 'DAMAGED':
      return 'Damaged Lot';
  }
}

export function generateUsedMarketListings(
  state: Pick<GameState, 'stepCount' | 'unlockedResearch' | 'coins' | 'runSeed' | 'activeMarketModifiers' | 'devUnlockAll'>
): UsedMarketListing[] {
  const rng = createSeededRng(`${state.runSeed}-used-${state.stepCount}-${Math.random()}`);
  const count = state.unlockedResearch?.includes('res_secondary_broker') ? 6 : 4;
  const unlockedCoins = (Object.keys(state.coins) as CoinSymbol[]).filter((s) => state.coins[s].unlocked);
  const hasSecondary = state.unlockedResearch?.includes('res_secondary_broker');
  const hwMult = getGlobalHardwarePriceMult(state);

  const isUnlocked = (req?: string) =>
    state.devUnlockAll || hasSecondary || !req || state.unlockedResearch.includes(req);

  const availChassis = CHASSIS_PARTS.filter((c) => isUnlocked(c.researchRequired));
  const availCpu = COMPUTE_PARTS.filter((c) => c.kind !== 'ASIC' && isUnlocked(c.researchRequired));
  const availAsic = COMPUTE_PARTS.filter((c) => c.kind === 'ASIC' && isUnlocked(c.researchRequired));
  const availGpus = GPU_PARTS.filter((g) => isUnlocked(g.researchRequired));
  const availStorage = STORAGE_PARTS.filter((s) => isUnlocked(s.researchRequired));
  const availPsus = PSU_PARTS.filter((p) => isUnlocked(p.researchRequired));
  const availCooling = COOLING_PARTS.filter((c) => isUnlocked(c.researchRequired));
  const availOs = OS_PARTS.filter((o) => isUnlocked(o.researchRequired));

  const listings: UsedMarketListing[] = [];

  for (let i = 0; i < count; i++) {
    const tierRoll = rng();
    const conditionTier: HardwareConditionTier =
      tierRoll < 0.16
        ? 'NEW'
        : tierRoll < 0.44
        ? 'REFURBISHED'
        : tierRoll < 0.8
        ? 'USED'
        : 'DAMAGED';

    const conditionPct =
      conditionTier === 'NEW'
        ? 100
        : conditionTier === 'REFURBISHED'
        ? Math.round(86 + rng() * 11)
        : conditionTier === 'USED'
        ? Math.round(58 + rng() * 24)
        : Math.round(28 + rng() * 24);

    const ageSteps =
      conditionTier === 'NEW'
        ? 0
        : conditionTier === 'REFURBISHED'
        ? Math.round(12 + rng() * 28)
        : conditionTier === 'USED'
        ? Math.round(35 + rng() * 75)
        : Math.round(70 + rng() * 110);

    const priceFactor =
      conditionTier === 'NEW'
        ? 0.94
        : conditionTier === 'REFURBISHED'
        ? 0.72 + rng() * 0.08
        : conditionTier === 'USED'
        ? 0.48 + rng() * 0.14
        : 0.26 + rng() * 0.11;

    const pick = <T>(arr: T[], fallback: T): T =>
      arr.length > 0 ? arr[Math.floor(rng() * arr.length)] : fallback;

    const ch = pick(availChassis, CHASSIS_PARTS[0]);
    const comp = ch.isAsicRack
      ? pick(availAsic, COMPUTE_PARTS.find((c) => c.kind === 'ASIC') ?? COMPUTE_PARTS[0])
      : pick(availCpu, COMPUTE_PARTS[0]);

    const gpuCount = ch.maxGpus > 0 && availGpus.length > 0 ? Math.min(ch.maxGpus, 1 + Math.floor(rng() * Math.min(4, ch.maxGpus))) : 0;
    const pickedGpu = availGpus.length > 0 ? pick(availGpus, availGpus[0]) : null;
    const gpuIds = pickedGpu && gpuCount > 0 ? Array(gpuCount).fill(pickedGpu.id) : [];

    const storage = pick(availStorage, STORAGE_PARTS[0]);
    const cool = pick(availCooling, COOLING_PARTS[0]);
    const os = pick(availOs, OS_PARTS[0]);

    // Pick a PSU that can power it (or close for damaged rigs!)
    const estWatts = ch.baseWatts + comp.watts + (pickedGpu?.watts ?? 0) * gpuCount + storage.watts + cool.watts;
    const matchingPsus = availPsus.filter((p) => p.maxWatts >= estWatts * 0.95);
    const psu = matchingPsus.length > 0 ? matchingPsus[0] : availPsus[availPsus.length - 1] ?? PSU_PARTS[0];

    let targetCoin: CoinSymbol = unlockedCoins[Math.floor(rng() * unlockedCoins.length)] ?? 'BTC';
    if (storage.storageTb >= 80 && unlockedCoins.includes('XCH')) targetCoin = 'XCH';
    else if (gpuCount >= 2 && unlockedCoins.includes('ETH')) targetCoin = 'ETH';
    else if (comp.kind === 'ASIC' && comp.hashrates.SCRYPT && unlockedCoins.includes('LTC')) targetCoin = 'LTC';

    const cfg: Omit<RigBuildConfig, 'name'> = {
      chassisId: ch.id,
      computeId: comp.id,
      gpuIds,
      storageId: storage.id,
      psuId: psu.id,
      coolingId: cool.id,
      osId: os.id,
      targetCoin,
      overclockPct: 100,
    };

    const spread =
      conditionTier === 'NEW'
        ? 0
        : conditionTier === 'REFURBISHED'
        ? 10
        : conditionTier === 'USED'
        ? 24
        : 28;
    const vary = (bias = 0) => {
      if (conditionTier === 'NEW') return 100;
      const v = conditionPct + bias + (rng() - 0.5) * spread;
      return Number(Math.max(22, Math.min(99, v)).toFixed(1));
    };
    const compHealth: RigComponentHealth = {
      chassis: vary(8),
      compute: vary(-2),
      gpus: Array.from({ length: gpuCount }, (_, gi) => vary(gi === 0 ? -4 : -10)),
      storage: vary(5),
      psu: vary(conditionTier === 'DAMAGED' ? -12 : -3),
      cooling: vary(-5),
    };
    const avgConditionPct = Math.round(computeAverageRigHealth(compHealth));

    const retailPriceUsd = Math.round(calculateBaseRigPartsCost({ ...cfg, name: 'Tmp' }) * hwMult);
    const listPriceUsd = Math.max(45, Math.round(retailPriceUsd * priceFactor));
    const generation = getRigGeneration({ ...cfg, name: 'Tmp' });

    const labelParts = [comp.name.split(' ')[0]];
    if (gpuCount > 0 && pickedGpu) labelParts.push(`${gpuCount}x ${pickedGpu.name.split(' ').slice(0, 2).join(' ')}`);
    const title = `${getConditionLabel(conditionTier)} ${labelParts.join(' + ')} (Gen ${generation})`;

    listings.push({
      id: `used_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      title,
      conditionTier,
      conditionPct: avgConditionPct,
      ageSteps,
      generation,
      listPriceUsd,
      retailPriceUsd,
      config: cfg,
      componentHealth: compHealth,
      summary: `${avgConditionPct}% cond · Age ${ageSteps}st · ${targetCoin} · Save ${Math.max(
        0,
        Math.round((1 - listPriceUsd / Math.max(1, retailPriceUsd)) * 100)
      )}% vs retail`,
    });
  }

  return listings;
}
