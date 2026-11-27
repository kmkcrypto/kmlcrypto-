import {
  FACILITY_TIERS,
  POWER_CONTRACTS,
  ROOM_COOLING_UNITS,
} from '../data/catalog';
import {
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  computeStepCoinOutput,
  findOpenRoomId,
  getAutoSellMultiplier,
  getElectricianBonuses,
  getEffectiveElectricityRate,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getFacility,
  getFacilityNoiseDba,
  getFacilityRooms,
  getFacilityTotals,
  getPowerContract,
  getSysEngineerBonus,
} from './simulation';
import {
  GameState,
  PowerContractId,
  RigBuildConfig,
  RoomCoolingType,
} from '../types/game';
import { formatUsd } from '../utils/format';

export interface RigPurchasePreview {
  costUsd: number;
  grossRevPerStepUsd: number;
  powerKw: number;
  powerCostPerStepUsd: number;
  netPerStepUsd: number;
  paybackSteps: number | null;
  equilibriumTempC: number;
  noiseDba: number;
  projectedTotalKw: number;
  facilityCapKw: number;
  exceedsBreaker: boolean;
  exceedsNoise: boolean;
  isHotOrThrottled: boolean;
  warnings: string[];
}

export function previewRigEconomics(
  config: RigBuildConfig,
  costUsd: number,
  state: GameState
): RigPurchasePreview {
  const facility = getFacility(state.facilityId);
  const sysBonus = getSysEngineerBonus(state);
  const activeCount = state.rigs.filter((r) => r.enabled && r.status !== 'FAILED').length + 1;
  const t = computeRigTelemetry(
    { ...config, roomId: config.roomId ?? findOpenRoomId(getFacilityRooms(state), state.rigs), pasteStepsRemaining: 16 },
    facility,
    state.unlockedResearch,
    sysBonus,
    state.coolingUnits ?? [],
    activeCount,
    state.facilityUpgrades,
    getElectricianBonuses(state).powerWasteReduction,
    state.facilityExtraRooms,
    state.coins
  );
  const coin = state.coins[config.targetCoin];
  const autoSellMult = getAutoSellMultiplier(state);
  const est = computeStepCoinOutput(
    t.effectiveHashrate,
    { ...coin, unlocked: true },
    1,
    autoSellMult,
    config.poolMode ?? 'PPS',
    true
  );

  const powerKw = t.wallWatts / 1000;
  const effRate = getEffectiveElectricityRate(state);
  const powerCostPerStepUsd = powerKw * 24 * effRate;
  const netPerStepUsd = est.autoSoldUsd - powerCostPerStepUsd;
  const paybackSteps =
    netPerStepUsd > 0.01 ? Math.ceil(costUsd / netPerStepUsd) : null;

  const totals = getFacilityTotals(state);
  const facilityCapKw = getEffectiveFacilityPowerCapKw(state);
  const projectedTotalKw = totals.totalPowerKw + powerKw;
  const exceedsBreaker = projectedTotalKw > facilityCapKw;
  const projectedNoiseDba = getFacilityNoiseDba(
    Math.max(t.noiseDba, totals.loudestRigDba), activeCount, totals.coolingNoiseDba
  );
  const exceedsNoise = projectedNoiseDba > facility.noiseLimitDba;
  const isHotOrThrottled = t.equilibriumTempC >= 82;

  const warnings: string[] = [];
  if (exceedsBreaker) {
    warnings.push(
      `Exceeds facility power cap (${projectedTotalKw.toFixed(2)} / ${facilityCapKw} kW)`
    );
  }
  if (exceedsNoise) {
    warnings.push(
      `Projected fleet noise ${projectedNoiseDba.toFixed(1)} dBA exceeds ${facility.name} limit (${facility.noiseLimitDba} dBA)`
    );
  }
  if (t.equilibriumTempC >= 96) {
    warnings.push(`Thermal shutdown risk (${t.equilibriumTempC}°C >= 96°C)`);
  } else if (isHotOrThrottled) {
    warnings.push(`Thermal throttling likely (${t.equilibriumTempC}°C >= 82°C)`);
  }
  if (netPerStepUsd <= 0) {
    warnings.push('Negative net cashflow per step at current spot price & power rate');
  }

  return {
    costUsd,
    grossRevPerStepUsd: est.autoSoldUsd,
    powerKw,
    powerCostPerStepUsd,
    netPerStepUsd,
    paybackSteps,
    equilibriumTempC: t.equilibriumTempC,
    noiseDba: t.noiseDba,
    projectedTotalKw,
    facilityCapKw,
    exceedsBreaker,
    exceedsNoise,
    isHotOrThrottled,
    warnings,
  };
}

export interface FacilityPreview {
  facilityId: string;
  name: string;
  upfrontCostUsd: number;
  slotsDelta: number;
  powerCapDeltaKw: number;
  noiseDeltaDba: number;
  cycleRentDeltaUsd: number;
  newStepElecDeltaUsd: number;
  alreadyOwned: boolean;
  rigFitOk: boolean;
}

export function previewFacilityMove(
  facilityId: string,
  action: 'RENT' | 'BUY',
  state: GameState
): FacilityPreview | null {
  const target = FACILITY_TIERS.find((f) => f.id === facilityId);
  if (!target) return null;
  const cur = getFacility(state.facilityId);
  const alreadyOwned = state.ownedFacilityIds.includes(target.id);
  const upfrontCostUsd = alreadyOwned
    ? 0
    : action === 'BUY'
    ? target.buyoutPrice
    : target.cycleRent;
  const cycleRent = alreadyOwned || action === 'BUY' ? 0 : target.cycleRent;
  const curOwned = state.ownedFacilityIds.includes(cur.id);
  const curCycleRent = curOwned ? 0 : cur.cycleRent;

  const contract = getPowerContract(state.powerContractId);
  const totals = getFacilityTotals(state);
  const curElec = totals.stepPowerCostUsd;
  const newRate = target.powerRatePerKwh * contract.rateMultiplier;
  const newElec = totals.totalPowerKw * 24 * newRate;

  const curMaxRigs = getEffectiveFacilityMaxRigs(state);
  const extraSlots = curMaxRigs - cur.maxRigs;
  const targetMaxRigs = target.maxRigs + extraSlots;

  const curCapKw = getEffectiveFacilityPowerCapKw(state);
  const extraKw = curCapKw - Math.round(cur.maxPowerKw * contract.capacityMultiplier);
  const targetCapKw = Math.round(target.maxPowerKw * contract.capacityMultiplier) + extraKw;

  return {
    facilityId: target.id,
    name: target.name,
    upfrontCostUsd,
    slotsDelta: targetMaxRigs - curMaxRigs,
    powerCapDeltaKw: targetCapKw - curCapKw,
    noiseDeltaDba: target.noiseLimitDba - cur.noiseLimitDba,
    cycleRentDeltaUsd: cycleRent - curCycleRent,
    newStepElecDeltaUsd: newElec - curElec,
    alreadyOwned,
    rigFitOk: state.rigs.length <= targetMaxRigs,
  };
}

export interface CoolingPreview {
  unitId: RoomCoolingType;
  name: string;
  costUsd: number;
  powerKw: number;
  stepElecUsd: number;
  cycleMaintUsd: number;
  coolingC: number;
  hotRigsAffected: number;
  costPerDegreeUsd: number;
}

export function previewCoolingUnit(
  unitId: RoomCoolingType,
  state: GameState
): CoolingPreview | null {
  const spec = ROOM_COOLING_UNITS.find((u) => u.id === unitId);
  if (!spec) return null;
  const effRate = getEffectiveElectricityRate(state);
  const powerKw = spec.watts / 1000;
  const stepElecUsd = powerKw * 24 * effRate;
  const hotRigsAffected = state.rigs.filter((r) => r.enabled && r.temperatureC >= 78).length;

  return {
    unitId: spec.id,
    name: spec.name,
    costUsd: spec.cost,
    powerKw,
    stepElecUsd,
    cycleMaintUsd: spec.maintenancePerCycle,
    coolingC: spec.coolingPowerC,
    hotRigsAffected,
    costPerDegreeUsd: spec.cost / Math.max(1, spec.coolingPowerC),
  };
}

export interface PowerContractPreview {
  contractId: PowerContractId;
  name: string;
  newRatePerKwh: number;
  newCapKw: number;
  capDeltaKw: number;
  cycleElecDeltaUsd: number;
  cycleFeeDeltaUsd: number;
  netCycleDeltaUsd: number;
}

export function previewPowerContract(
  contractId: PowerContractId,
  state: GameState
): PowerContractPreview | null {
  const next = POWER_CONTRACTS.find((c) => c.id === contractId);
  if (!next) return null;
  const cur = getPowerContract(state.powerContractId);
  const fac = getFacility(state.facilityId);
  const totals = getFacilityTotals(state);
  const curCap = getEffectiveFacilityPowerCapKw(state);

  const extraCap = curCap - Math.round(fac.maxPowerKw * cur.capacityMultiplier);
  const newCapKw = Math.round(fac.maxPowerKw * next.capacityMultiplier) + extraCap;
  const resDisc = state.unlockedResearch.includes('res_smart_grid') ? 0.92 : 1.0;
  const newRate = fac.powerRatePerKwh * next.rateMultiplier * resDisc;
  const curElecCycle = totals.stepPowerCostUsd * 30;
  const newElecCycle = totals.totalPowerKw * 24 * newRate * 30;
  const cycleElecDeltaUsd = newElecCycle - curElecCycle;
  const cycleFeeDeltaUsd = next.cycleFixedFee - cur.cycleFixedFee;

  return {
    contractId: next.id,
    name: next.name,
    newRatePerKwh: newRate,
    newCapKw,
    capDeltaKw: newCapKw - curCap,
    cycleElecDeltaUsd,
    cycleFeeDeltaUsd,
    netCycleDeltaUsd: cycleElecDeltaUsd + cycleFeeDeltaUsd,
  };
}

export function renderAsciiLineChart(
  values: number[],
  labels: string[],
  formatValue: (v: number) => string,
  rows = 8,
  cols = 44
): string {
  if (values.length < 2) {
    return '  (Need at least 2 simulated steps to render trend chart.)';
  }
  const sampledIdx = Array.from({ length: Math.min(cols, values.length) }, (_, idx) =>
    Math.min(
      values.length - 1,
      Math.floor((idx / Math.max(1, Math.min(cols, values.length) - 1)) * (values.length - 1))
    )
  );
  const sampledVals = sampledIdx.map((i) => values[i]);
  const vMin = Math.min(...sampledVals);
  const vMax = Math.max(...sampledVals);
  const span = vMax - vMin || Math.abs(vMax) * 0.1 || 1;

  const lines = Array.from({ length: rows }, (_, r) => {
    const val = vMax - (r / (rows - 1)) * span;
    const lbl = formatValue(val).padStart(10, ' ');
    const plot = sampledVals
      .map((v) => {
        const rowIdx = Math.round(((vMax - v) / span) * (rows - 1));
        return rowIdx === r ? '●' : rowIdx < r ? '│' : ' ';
      })
      .join('');
    return `${lbl} ┤ ${plot}`;
  });

  const firstLbl = labels[sampledIdx[0]] ?? 'Start';
  const lastLbl = labels[sampledIdx[sampledIdx.length - 1]] ?? 'Now';
  const axisWidth = Math.max(12, sampledVals.length);
  const axis = `${firstLbl.slice(0, 14).padEnd(Math.floor(axisWidth / 2) + 2, ' ')}${lastLbl
    .slice(0, 14)
    .padStart(axisWidth - Math.floor(axisWidth / 2) - 2, ' ')}`;

  const delta = values[values.length - 1] - values[0];
  const sign = delta >= 0 ? '+' : '-';
  const summary = `  Range: ${formatValue(vMin)} .. ${formatValue(vMax)}   Net Change: ${sign}${formatValue(
    Math.abs(delta)
  )}`;

  return [...lines, `           └─${'─'.repeat(axisWidth)}`, `             ${axis}`, summary].join('\n');
}

export function formatCoolingSummaryLine(state: GameState): string {
  const fac = getFacility(state.facilityId);
  const enabledCount = state.rigs.filter((r) => r.enabled).length;
  const summary = computeFacilityCoolingSummary(
    state.coolingUnits ?? [],
    enabledCount,
    fac,
    state.facilityUpgrades
  );
  return `-${summary.effectiveCoolingPerRigC.toFixed(1)}°C/rig`;
}

export { formatUsd };
