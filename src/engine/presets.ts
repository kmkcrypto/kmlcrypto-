import { FACILITY_TIERS, MARKET_REGIME_SPECS, RESEARCH_NODES } from '../data/catalog';
import {
  CareerPreset,
  CoinSymbol,
  GameState,
  MiningRig,
  OnboardingMode,
} from '../types/game';
import { generateRandomSeed } from '../utils/rng';
import { buildDefaultFab } from './fab';
import { generateContractBoard } from './contracts';
import { researchClosure } from './scenarios';
import { computeRigTelemetry, createNewGameState, getFacility, getEffectiveFacilityPowerCapKw, getFacilityRooms } from './simulation';
import { createInitialComponentHealth, generateUsedMarketListings, getRigChassisIssue } from './usedMarket';

export const CAREER_PRESETS_STORAGE_KEY = 'hashrate_career_presets_v1';

export const BUILT_IN_PRESETS: CareerPreset[] = [
  {
    id: 'preset_bootstrap_street',
    name: 'Street Bootstrapper',
    description: 'Low-capital bedroom start with standard market rules and Guided progression.',
    createdAt: '2025-01-01T00:00:00.000Z',
    isBuiltIn: true,
    includeCash: true,
    startingCash: 900,
    difficulty: 'BOOTSTRAP',
    onboardingMode: 'GUIDED',
    includeFacility: true,
    startingFacilityId: 'fac_bedroom',
    powerContractId: 'contract_budget',
    includeMarketRules: true,
    marketRegime: 'ACCUMULATION',
    operatingCostMult: 1.0,
    unlockAllCoins: false,
    unlockAllResearch: false,
    includeStarterRig: true,
    starterRigConfig: {
      chassisId: 'chassis_bedroom_tower',
      computeId: 'cpu_core2_duo',
      gpuIds: [],
      storageId: 'stor_ddr3_4gb',
      psuId: 'psu_450w',
      coolingId: 'cool_stock_air',
      osId: 'os_windows7',
      targetCoin: 'BTC',
      overclockPct: 100,
    },
  },
  {
    id: 'preset_gpu_wildcat',
    name: 'Garage GPU Wildcat',
    description: 'Opens in a rented Garage with a 3-GPU Radeon frame and Veteran controls.',
    createdAt: '2025-01-01T00:00:00.000Z',
    isBuiltIn: true,
    includeCash: true,
    startingCash: 8_500,
    difficulty: 'STANDARD',
    onboardingMode: 'VETERAN',
    includeFacility: true,
    startingFacilityId: 'fac_garage',
    startingFacilityOwned: false,
    powerContractId: 'contract_standard',
    includeMarketRules: true,
    marketRegime: 'BULL_RUN',
    operatingCostMult: 1.0,
    unlockAllCoins: true,
    unlockAllResearch: false,
    includeStarterRig: true,
    starterRigConfig: {
      chassisId: 'chassis_open_frame',
      computeId: 'cpu_core2_duo',
      gpuIds: ['gpu_hd5870', 'gpu_hd5870', 'gpu_hd5870'],
      storageId: 'stor_ddr3_4gb',
      psuId: 'psu_850w',
      coolingId: 'cool_noctua_array',
      osId: 'os_ubuntu_lts',
      targetCoin: 'BTC',
      overclockPct: 100,
      firmwareProfile: 'ECO',
    },
  },
  {
    id: 'preset_foundry_founder',
    name: 'Industrial Fab Founder',
    description: 'Warehouse operation with 1 Fab line and capital to test custom hardware & coins.',
    createdAt: '2025-01-01T00:00:00.000Z',
    isBuiltIn: true,
    includeCash: true,
    startingCash: 450_000,
    difficulty: 'TYCOON_SANDBOX',
    onboardingMode: 'VETERAN',
    includeFacility: true,
    startingFacilityId: 'fac_warehouse',
    startingResearchIds: ['res_wafer_lithography', 'res_mineros', 'res_smart_pdu'],
    powerContractId: 'contract_highcap',
    includeMarketRules: true,
    marketRegime: 'ACCUMULATION',
    operatingCostMult: 1.0,
    unlockAllCoins: true,
    unlockAllResearch: false,
    includeStarterRig: true,
    starterRigConfig: {
      chassisId: 'chassis_asic_rack',
      computeId: 'asic_antminer_s9',
      gpuIds: [],
      storageId: 'stor_ddr4_16gb',
      psuId: 'psu_3600w_pdu',
      coolingId: 'cool_delta_blowers',
      osId: 'os_mineros',
      targetCoin: 'BTC',
      overclockPct: 100,
    },
  },
];

let memoryPresetsCache: CareerPreset[] | null = null;

function readStoragePresets(): CareerPreset[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CAREER_PRESETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
        }
      }
    }
  } catch {
    // Ignore storage unavailability in headless tests
  }
  return memoryPresetsCache ?? [];
}

function writeStoragePresets(customPresets: CareerPreset[]): void {
  const customOnly = customPresets.filter((p) => !p.isBuiltIn);
  memoryPresetsCache = customOnly;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAREER_PRESETS_STORAGE_KEY, JSON.stringify(customOnly));
    }
  } catch {
    // Ignore storage unavailability
  }
}

export function listCareerPresets(): CareerPreset[] {
  const custom = readStoragePresets();
  return [...BUILT_IN_PRESETS, ...custom];
}

export function getCareerPreset(id: string): CareerPreset | undefined {
  return listCareerPresets().find((p) => p.id === id);
}

export function saveCareerPreset(
  presetInput: Omit<CareerPreset, 'id' | 'createdAt' | 'isBuiltIn'> & { id?: string }
): CareerPreset {
  const existingCustom = readStoragePresets();
  const cleanName = (presetInput.name || 'Custom Preset').trim().slice(0, 36);
  const validFacility = FACILITY_TIERS.some((f) => f.id === presetInput.startingFacilityId)
    ? presetInput.startingFacilityId
    : 'fac_bedroom';

  const targetId =
    presetInput.id && !BUILT_IN_PRESETS.some((b) => b.id === presetInput.id)
      ? presetInput.id
      : `preset_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const idx = existingCustom.findIndex((p) => p.id === targetId);
  const nextPreset: CareerPreset = {
    ...presetInput,
    id: targetId,
    name: cleanName,
    startingFacilityId: validFacility,
    createdAt: existingCustom[idx]?.createdAt ?? new Date().toISOString(),
    isBuiltIn: false,
  };

  const updated =
    idx >= 0
      ? existingCustom.map((p, i) => (i === idx ? nextPreset : p))
      : [...existingCustom, nextPreset];
  writeStoragePresets(updated);
  return nextPreset;
}

export function renameCareerPreset(id: string, newName: string): { ok: boolean; preset?: CareerPreset; reason?: string } {
  const clean = newName.trim().slice(0, 36);
  if (clean.length < 2) return { ok: false, reason: 'Preset name must be at least 2 characters.' };
  if (BUILT_IN_PRESETS.some((b) => b.id === id)) {
    return { ok: false, reason: 'Built-in presets cannot be renamed directly. Duplicate it first.' };
  }
  const existing = readStoragePresets();
  const target = existing.find((p) => p.id === id);
  if (!target) return { ok: false, reason: 'Preset not found.' };
  const updatedPreset = { ...target, name: clean };
  writeStoragePresets(existing.map((p) => (p.id === id ? updatedPreset : p)));
  return { ok: true, preset: updatedPreset };
}

export function duplicateCareerPreset(id: string, customName?: string): { ok: boolean; preset?: CareerPreset; reason?: string } {
  const source = getCareerPreset(id);
  if (!source) return { ok: false, reason: 'Source preset not found.' };
  const name = (customName?.trim() || `${source.name} Copy`).slice(0, 36);
  const copy = saveCareerPreset({
    ...source,
    id: undefined,
    name,
  });
  return { ok: true, preset: copy };
}

export function deleteCareerPreset(id: string): { ok: boolean; reason?: string } {
  if (BUILT_IN_PRESETS.some((b) => b.id === id)) {
    return { ok: false, reason: 'Built-in presets cannot be deleted.' };
  }
  const existing = readStoragePresets();
  if (!existing.some((p) => p.id === id)) {
    return { ok: false, reason: 'Preset not found.' };
  }
  writeStoragePresets(existing.filter((p) => p.id !== id));
  return { ok: true };
}

export function createNewGameStateFromPreset(
  preset: CareerPreset,
  customSeed?: string,
  onboardingOverride?: OnboardingMode
): GameState {
  const seed = customSeed?.trim() || generateRandomSeed();
  const effectiveOnboarding = onboardingOverride ?? preset.onboardingMode;
  const base = createNewGameState(
    preset.difficulty,
    false,
    seed,
    undefined,
    null,
    effectiveOnboarding
  );

  let nextCash = base.cash;
  if (preset.includeCash) {
    nextCash = Math.max(0, Math.round(preset.startingCash));
  }

  let nextFacilityId = base.facilityId;
  let nextOwned = base.ownedFacilityIds;
  let nextPowerContract = base.powerContractId;
  let nextFab = base.fab;
  if (preset.includeFacility) {
    nextFacilityId = getFacility(preset.startingFacilityId).id;
    nextOwned = preset.startingFacilityOwned === false ? ['fac_bedroom'] : Array.from(new Set(['fac_bedroom', nextFacilityId]));
    nextPowerContract = preset.powerContractId;
    if (nextFacilityId === 'fac_warehouse' || nextFacilityId === 'fac_industrial' || nextFacilityId === 'fac_megafarm') {
      nextFab = { ...buildDefaultFab(), linesCount: 1 };
    }
  }

  let nextCoins = { ...base.coins };
  let nextRegime = base.marketRegime;
  let nextUnlockedResearch = researchClosure((preset.startingResearchIds ?? []).filter((id) => RESEARCH_NODES.some((node) => node.id === id)));
  let nextSandboxConfig = base.sandboxConfig;
  if (preset.includeMarketRules) {
    nextRegime = preset.marketRegime;
    if (preset.unlockAllCoins) {
      (Object.keys(nextCoins) as CoinSymbol[]).forEach((sym) => {
        nextCoins[sym] = { ...nextCoins[sym], unlocked: true };
      });
    }
    if (preset.unlockAllResearch) {
      nextUnlockedResearch = RESEARCH_NODES.map((n) => n.id);
    }
    if (preset.operatingCostMult !== 1.0) {
      nextSandboxConfig = {
        startingCash: nextCash,
        startingFacilityId: nextFacilityId,
        startingRigs: 1,
        unlockAllResearch: preset.unlockAllResearch,
        unlockAllCoins: preset.unlockAllCoins,
        marketRegime: nextRegime,
        operatingCostMult: preset.operatingCostMult,
      };
    }
  }

  const fac = getFacility(nextFacilityId);
  const roomId = getFacilityRooms({ ...base, facilityId: fac.id })[0]?.id;
  let nextRigs: MiningRig[] = base.rigs.map((rig) => ({ ...rig, roomId, temperatureC: fac.ambientTempC + 24 }));
  if (preset.includeStarterRig) {
    const cfg = preset.starterRigConfig;
    const starter: MiningRig = {
      ...base.rigs[0],
      id: 'rig_preset_1',
      name: `${preset.name.slice(0, 18)} #1`,
      chassisId: cfg.chassisId,
      computeId: cfg.computeId,
      gpuIds: [...(cfg.gpuIds ?? [])],
      storageId: cfg.storageId,
      psuId: cfg.psuId,
      coolingId: cfg.coolingId,
      osId: cfg.osId,
      targetCoin: cfg.targetCoin,
      overclockPct: cfg.overclockPct ?? 100,
      firmwareProfile: cfg.firmwareProfile ?? 'BALANCED',
      poolMode: cfg.poolMode ?? 'PPS',
      payoutMode: cfg.payoutMode ?? 'AUTOSELL',
      roomId,
      temperatureC: fac.ambientTempC + 24,
      componentHealth: createInitialComponentHealth(cfg.gpuIds?.length ?? 0, 100),
      healthPct: 100,
    };
    nextRigs = [starter];
  }

  const state: GameState = {
    ...base,
    cash: nextCash,
    facilityId: nextFacilityId,
    ownedFacilityIds: nextOwned,
    powerContractId: nextPowerContract,
    coins: nextCoins,
    marketRegime: nextRegime,
    regimeStepsRemaining: nextRegime === base.marketRegime
      ? base.regimeStepsRemaining : MARKET_REGIME_SPECS[nextRegime].minSteps,
    unlockedResearch: nextUnlockedResearch,
    sandboxConfig: nextSandboxConfig,
    fab: nextFab,
    rigs: nextRigs,
    activePresetId: preset.id,
  };
  state.availableContracts = generateContractBoard(state, 4, { earlyCareer: true, includeStarter: effectiveOnboarding === 'GUIDED' });
  state.usedMarketListings = generateUsedMarketListings(state);
  return state;
}

export function getCareerPresetIssue(preset: CareerPreset): string | undefined {
  if (preset.name.trim().length < 2) return 'Use a preset name of at least two characters.';
  if (!preset.includeStarterRig) return;
  const state = createNewGameStateFromPreset(preset, 'PRESET-VALIDATION');
  const rig = state.rigs[0];
  const fitIssue = getRigChassisIssue(rig);
  if (fitIssue) return fitIssue;
  if (!state.coins[rig.targetCoin]?.unlocked) return 'Unlock coins in Market Rules or select an unlocked starter coin.';
  const facility = getFacility(state.facilityId);
  const telemetry = computeRigTelemetry(rig, facility, state.unlockedResearch, 0, [], 1, {}, 0, 0, state.coins);
  if (telemetry.isUnderpowered) return 'The starter rig needs a larger power supply.';
  if (telemetry.wallWatts / 1000 > getEffectiveFacilityPowerCapKw(state)) return 'The starter rig exceeds the starting facility’s power cap.';
  if (telemetry.equilibriumTempC >= 96) return 'The starter rig needs cooling to avoid a thermal shutdown.';
  if (telemetry.effectiveHashrate === 0) return 'The starter rig cannot mine the selected coin.';
}
