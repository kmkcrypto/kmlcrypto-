import type { GameState, MiningRig, RigQualification, RigQualificationGoal } from '../types/game';
import { formatHashrate } from '../utils/format';
import {
  computeRigTelemetry, getEffectiveFacilityPowerCapKw, getElectricianBonuses,
  getFacility, getFacilityTotals, getSysEngineerBonus,
} from './simulation';

export const RIG_QUALIFICATION_GOALS: Record<RigQualificationGoal, string> = {
  efficiency: 'Gain 8% hash per watt and retain at least 85% of output.',
  output: 'Gain 12% output within 135% of the reference power draw.',
  quiet: 'Cut noise by 3 dBA and retain at least 75% of output.',
};

export function benchmarkRig(state: GameState, rig: MiningRig, reference: RigQualification['reference']) {
  const facility = getFacility(state.facilityId);
  const activeCount = state.rigs.filter((rig) => rig.enabled && rig.status !== 'FAILED').length;
  const measure = (config: Parameters<typeof computeRigTelemetry>[0]) => computeRigTelemetry(
    config, facility, state.unlockedResearch, getSysEngineerBonus(state),
    state.coolingUnits, activeCount, state.facilityUpgrades,
    getElectricianBonuses(state).powerWasteReduction, state.facilityExtraRooms, state.coins,
  );
  // Compare the hardware under the same room, wear, coin and temperature assumptions.
  const steady = { ...rig, temperatureC: undefined };
  const current = measure(steady);
  const baseline = measure(reference === 'stock'
    ? { ...steady, customParts: undefined, customAsicSpec: undefined }
    : { ...steady, firmwareProfile: 'BALANCED', overclockPct: 100 });
  const hasCustom = Boolean(rig.customAsicSpec || (rig.customParts && Object.entries(rig.customParts).some(
    ([slot, part]) => slot === 'gpus' && Array.isArray(part) ? part.some(Boolean) : Boolean(part)
  )));
  const projectedGridKw = getFacilityTotals(state).totalPowerKw +
    (rig.enabled && rig.status !== 'FAILED' ? (current.wallWatts - measure(rig).wallWatts) : 0) / 1000;
  const gridLimit = getEffectiveFacilityPowerCapKw(state);
  const issues = [
    ...(!rig.enabled || !state.coins[rig.targetCoin]?.unlocked || current.effectiveHashrate <= 0
      ? ['The test rig must be powered on and able to mine an unlocked coin.'] : []),
    ...(baseline.effectiveHashrate <= 0 ? ['The reference configuration must support the same coin and have a working PSU.'] : []),
    ...(current.isUnderpowered || current.equilibriumTempC >= 82 || projectedGridKw > gridLimit ||
      current.noiseDba > facility.noiseLimitDba ? ['The test rig must fit the PSU, thermal, grid and noise limits.'] : []),
    ...(reference === 'stock' && !hasCustom ? ['Install a custom part before qualifying against stock.'] : []),
  ];
  const outputRatio = current.effectiveHashrate / Math.max(Number.EPSILON, baseline.effectiveHashrate);
  const powerRatio = current.wallWatts / Math.max(1, baseline.wallWatts);
  const efficiencyRatio = outputRatio / Math.max(Number.EPSILON, powerRatio);
  const qualified = {
    efficiency: outputRatio >= 0.85 && efficiencyRatio >= 1.08,
    output: outputRatio >= 1.12 && powerRatio <= 1.35,
    quiet: baseline.noiseDba - current.noiseDba >= 3 && outputRatio >= 0.75,
  };
  const describe = (result: typeof current) =>
    `${formatHashrate(result.effectiveHashrate, result.targetAlgo)} · ${result.wallWatts} W · ${result.equilibriumTempC}°C · ${result.noiseDba} dBA`;
  const percentChange = (ratio: number) => {
    const change = Math.round((ratio - 1) * 100);
    return `${change > 0 ? '+' : ''}${change}%`;
  };
  return {
    issues, qualified, outputRatio, powerRatio, current, baseline,
    report: [
      `  Current build         ${describe(current)}`,
      `  ${reference === 'stock' ? 'Stock parts' : 'Balanced at 100%'}`.padEnd(24) + describe(baseline),
      ...(baseline.effectiveHashrate > 0 ? [
        `  Change                ${percentChange(outputRatio)} hash · ${percentChange(powerRatio)} watts · ${percentChange(efficiencyRatio)} hash/watt`,
      ] : []),
      `  Facility grid         ${projectedGridKw.toFixed(2)} / ${gridLimit.toFixed(2)} kW`,
      '',
      ...issues.map((issue) => `  [!] ${issue}`),
      ...(Object.keys(RIG_QUALIFICATION_GOALS) as RigQualificationGoal[]).map((goal) =>
        `  [${qualified[goal] && !issues.length ? 'PASS' : '    '}] ${goal.toUpperCase()} · ${RIG_QUALIFICATION_GOALS[goal]}`
      ),
      '',
      '  Steady-state estimates use the same conditions for both configurations.',
    ].join('\n'),
  };
}

export function qualifyRig(
  state: GameState, rig: MiningRig, goal: RigQualificationGoal, reference: RigQualification['reference']
) {
  const qualification = benchmarkRig(state, rig, reference);
  const facility = getFacility(state.facilityId);
  if (facility.id === 'fac_bedroom') {
    return { ok: false, nextState: state, summary: 'Run a commissioning trial at the Garage or above.' };
  }
  if (qualification.issues.length || !qualification.qualified[goal]) {
    return {
      ok: false, nextState: state,
      summary: qualification.issues[0] ?? RIG_QUALIFICATION_GOALS[goal],
    };
  }
  const existing = state.rigQualifications ?? [];
  const remaining = existing.filter((result) => result.goal !== goal || result.reference !== reference);
  return {
    ok: true,
    nextState: { ...state, rigQualifications: [...remaining, { rigId: rig.id, goal, reference, step: state.stepCount }] },
    summary: `${rig.name} qualified for ${goal} against its ${reference === 'stock' ? 'stock parts' : 'balanced tuning'}.`,
  };
}
