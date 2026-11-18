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
  CoinSymbol,
  GameState,
  HardwareConditionTier,
  HardwareGen,
  MiningRig,
  RigBuildConfig,
  RigComponentHealth,
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

export function getRigGeneration(config: RigBuildConfig): HardwareGen {
  const ch = CHASSIS_PARTS.find((c) => c.id === config.chassisId);
  const comp = COMPUTE_PARTS.find((c) => c.id === config.computeId);
  const gpus = config.gpuIds
    .map((id) => GPU_PARTS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const maxGpuGen = gpus.reduce((m, g) => Math.max(m, g.generation ?? 1), 0);
  const g = Math.max(comp?.generation ?? 1, ch?.generation ?? 1, maxGpuGen) as HardwareGen;
  return g;
}

export function getGlobalHardwarePriceMult(state: Pick<GameState, 'activeMarketModifiers'>): number {
  const mods = state.activeMarketModifiers ?? [];
  return mods.reduce((m, item) => m * item.hardwarePriceMult, 1.0);
}

export function getGlobalResaleValueMult(
  state: Pick<GameState, 'activeMarketModifiers' | 'unlockedResearch'>
): number {
  const mods = state.activeMarketModifiers ?? [];
  const evtMult = mods.reduce((m, item) => m * item.resaleValueMult, 1.0);
  const brokerMult = state.unlockedResearch?.includes('res_secondary_broker') ? 1.12 : 1.0;
  return evtMult * brokerMult;
}

export function calculateBaseRigPartsCost(config: RigBuildConfig): number {
  const chassis = CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0];
  const compute = COMPUTE_PARTS.find((c) => c.id === config.computeId) ?? COMPUTE_PARTS[0];
  const gpus = config.gpuIds
    .map((id) => GPU_PARTS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const storage = STORAGE_PARTS.find((s) => s.id === config.storageId) ?? STORAGE_PARTS[0];
  const psu = PSU_PARTS.find((p) => p.id === config.psuId) ?? PSU_PARTS[0];
  const cooling = COOLING_PARTS.find((c) => c.id === config.coolingId) ?? COOLING_PARTS[0];
  const os = OS_PARTS.find((o) => o.id === config.osId) ?? OS_PARTS[0];
  const gpuCost = gpus.reduce((sum, g) => sum + g.cost, 0);
  return chassis.cost + compute.cost + gpuCost + storage.cost + psu.cost + cooling.cost + os.cost;
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
      conditionPct,
      ageSteps,
      generation,
      listPriceUsd,
      retailPriceUsd,
      config: cfg,
      summary: `${conditionPct}% cond · Age ${ageSteps}st · ${targetCoin} · Save ${Math.max(
        0,
        Math.round((1 - listPriceUsd / Math.max(1, retailPriceUsd)) * 100)
      )}% vs retail`,
    });
  }

  return listings;
}
