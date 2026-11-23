import { GameState, MiningRig } from '../types/game';
import {
  BILLING_CYCLE_STEPS,
  computeRigTelemetry,
  getEffectiveElectricityRate,
  getElectricianBonuses,
  getFacility,
  getFacilityTotals,
  getSysEngineerBonus,
} from './simulation';

/**
 * Company-level operating economics.
 *
 * The simulation already tracks lifetime totals and per-rig output, but the
 * player needs a forward-looking view: what the company earns and spends *per
 * step*, whether that leaves a profit, how long the cash lasts, and at what
 * power price the operation breaks even. These are pure read-only calculations
 * derived from the same helpers the simulation uses, so the numbers stay in
 * sync with the real step settlement.
 */

export interface StepEconomics {
  grossRevenuePerStepUsd: number;
  powerCostPerStepUsd: number;
  payrollPerStepUsd: number;
  rentPerStepUsd: number;
  maintenancePerStepUsd: number;
  fixedFeePerStepUsd: number;
  operatingCostPerStepUsd: number;
  netOperatingPerStepUsd: number;
  operatingMarginPct: number;
  /** Steps until cash hits zero at the current burn. `null` when profitable. */
  cashRunwaySteps: number | null;
  breakEvenRevenuePerStepUsd: number;
  /** Power rate that would make operating profit zero. Negative = unreachable. */
  breakEvenPowerRatePerKwh: number | null;
  currentPowerRatePerKwh: number;
}

export interface RigContribution {
  index: number;
  rigId: string;
  name: string;
  /** Enabled and not in a failed/repair state. */
  active: boolean;
  /** Enabled and currently mining (MINING or THROTTLED). */
  producing: boolean;
  /** Has earned revenue at least once, so a zero-revenue step is meaningful. */
  hasOperated: boolean;
  revenuePerStepUsd: number;
  powerCostPerStepUsd: number;
  contributionPerStepUsd: number;
  /** Power as a percentage of that rig's revenue. */
  powerSharePct: number;
}

export interface MarketSensitivity {
  revenueShiftPct: number;
  netPerStepUsd: number;
  underwaterRigs: number;
  activeRigs: number;
}

/** Cash value a rig produced on the last step, including held (unsold) coins. */
export function getRigStepRevenue(
  rig: MiningRig,
  state: Pick<GameState, 'coins'>
): number {
  if (!rig.enabled) return 0;
  if (rig.payoutMode === 'HOLD') {
    const price = state.coins[rig.targetCoin]?.priceUsd ?? 0;
    return Math.max(0, (rig.lastStepCoins ?? 0) * price);
  }
  return Math.max(0, rig.lastStepUsd ?? 0);
}

export function computeStepEconomics(state: GameState): StepEconomics {
  const totals = getFacilityTotals(state);
  const grossRevenuePerStepUsd = state.rigs.reduce(
    (sum, rig) => sum + getRigStepRevenue(rig, state),
    0
  );

  const powerCostPerStepUsd = totals.stepPowerCostUsd;
  const payrollPerStepUsd = totals.cyclePayrollUsd / BILLING_CYCLE_STEPS;
  const rentPerStepUsd = totals.cycleRentUsd / BILLING_CYCLE_STEPS;
  const maintenancePerStepUsd = totals.cycleMaintenanceUsd / BILLING_CYCLE_STEPS;
  const fixedFeePerStepUsd = totals.cycleFixedContractFee / BILLING_CYCLE_STEPS;

  const nonPowerOpex =
    payrollPerStepUsd + rentPerStepUsd + maintenancePerStepUsd + fixedFeePerStepUsd;
  const operatingCostPerStepUsd = powerCostPerStepUsd + nonPowerOpex;
  const netOperatingPerStepUsd = grossRevenuePerStepUsd - operatingCostPerStepUsd;
  const operatingMarginPct =
    grossRevenuePerStepUsd > 0
      ? (netOperatingPerStepUsd / grossRevenuePerStepUsd) * 100
      : netOperatingPerStepUsd < 0
      ? -100
      : 0;

  const cashRunwaySteps =
    netOperatingPerStepUsd >= -0.005
      ? null
      : state.cash <= 0
      ? 0
      : Math.ceil(state.cash / -netOperatingPerStepUsd);

  const currentPowerRatePerKwh = getEffectiveElectricityRate(state);
  const breakEvenPowerRatePerKwh =
    totals.totalPowerKw > 0.001
      ? (grossRevenuePerStepUsd - nonPowerOpex) / (totals.totalPowerKw * 24)
      : null;

  return {
    grossRevenuePerStepUsd,
    powerCostPerStepUsd,
    payrollPerStepUsd,
    rentPerStepUsd,
    maintenancePerStepUsd,
    fixedFeePerStepUsd,
    operatingCostPerStepUsd,
    netOperatingPerStepUsd,
    operatingMarginPct,
    cashRunwaySteps,
    breakEvenRevenuePerStepUsd: operatingCostPerStepUsd,
    breakEvenPowerRatePerKwh,
    currentPowerRatePerKwh,
  };
}

/** Per-rig contribution margin: last step's revenue minus that rig's own power. */
export function computeRigContributions(state: GameState): RigContribution[] {
  const facility = getFacility(state.facilityId);
  const sysBonus = getSysEngineerBonus(state);
  const elecBonus = getElectricianBonuses(state);
  const rate = getEffectiveElectricityRate(state);
  const enabledCount = Math.max(1, state.rigs.filter((r) => r.enabled).length);

  return state.rigs.map((rig, index) => {
    const producing = rig.enabled && (rig.status === 'MINING' || rig.status === 'THROTTLED');
    const revenuePerStepUsd = producing ? getRigStepRevenue(rig, state) : 0;
    const hasOperated =
      (rig.totalEarnedUsd ?? 0) > 0 ||
      (rig.lastStepUsd ?? 0) > 0 ||
      (rig.lastStepCoins ?? 0) > 0;
    let powerCostPerStepUsd = 0;
    if (producing) {
      const telemetry = computeRigTelemetry(
        rig,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount,
        state.facilityUpgrades,
        elecBonus.powerWasteReduction,
        state.facilityExtraRooms ?? 0
      );
      powerCostPerStepUsd = (telemetry.wallWatts / 1000) * 24 * rate;
    }
    const contributionPerStepUsd = revenuePerStepUsd - powerCostPerStepUsd;
    const active = rig.enabled && rig.status !== 'FAILED' && rig.status !== 'NEEDS_REPAIR';
    return {
      index,
      rigId: rig.id,
      name: rig.name,
      active,
      producing,
      hasOperated,
      revenuePerStepUsd,
      powerCostPerStepUsd,
      contributionPerStepUsd,
      powerSharePct:
        revenuePerStepUsd > 0
          ? (powerCostPerStepUsd / revenuePerStepUsd) * 100
          : powerCostPerStepUsd > 0
          ? 100
          : 0,
    };
  });
}

/** How the fleet's operating profit moves if mining revenue shifts by a percentage. */
export function computeMarketSensitivity(
  state: GameState,
  revenueShiftPct: number
): MarketSensitivity {
  const economics = computeStepEconomics(state);
  const contributions = computeRigContributions(state);
  const mult = 1 + revenueShiftPct / 100;
  const shiftedRevenue = economics.grossRevenuePerStepUsd * mult;
  const active = contributions.filter((r) => r.active);
  return {
    revenueShiftPct,
    netPerStepUsd: shiftedRevenue - economics.operatingCostPerStepUsd,
    underwaterRigs: active.filter(
      (r) => r.producing && r.hasOperated && r.revenuePerStepUsd * mult < r.powerCostPerStepUsd
    ).length,
    activeRigs: active.length,
  };
}

export function formatCashRunway(steps: number | null, stepHours = 24): string {
  if (steps === null) return 'Profitable — no cash burn';
  const days = Math.ceil((steps * Math.max(1, stepHours)) / 24);
  return `${steps} step${steps === 1 ? '' : 's'} (~${days} day${days === 1 ? '' : 's'})`;
}
