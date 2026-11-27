import { FACILITY_TIERS } from '../data/catalog';
import {
  ActiveMarketModifier,
  CoinSymbol,
  EmployeeRole,
  GameState,
  HiredEmployee,
  MiningRig,
  NewsItem,
  PendingEvent,
  PendingEventCategory,
  RepairComponentSlot,
  RigComponentHealth,
} from '../types/game';
import { formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';

export interface WorkloadSummary {
  demandUnits: number;
  capacityUnits: number;
  workloadPct: number;
  avgMorale: number;
  lowMoraleCount: number;
  criticalMoraleCount: number;
  strikeActive: boolean;
  strikeStepsRemaining: number;
  statusLabel: 'STRIKE' | 'OVERLOADED' | 'STRAINED' | 'BALANCED' | 'RELAXED';
}

export function getEmployeeEfficiencyMult(
  emp: HiredEmployee,
  strikeStepsRemaining = 0
): number {
  if (strikeStepsRemaining > 0) return 0;
  const m = emp.morale ?? 85;
  if (m >= 88) return 1.08;
  if (m >= 65) return 1.0;
  if (m >= 40) return 0.72 + ((m - 40) / 25) * 0.25;
  return 0.48;
}

export function getTopSkillForRole(state: Pick<GameState, 'employees' | 'strikeStepsRemaining'>, role: EmployeeRole): number {
  if ((state.strikeStepsRemaining ?? 0) > 0) return 0;
  let best = 0;
  for (const e of state.employees) {
    if (e.role === role && (e.morale ?? 80) >= 25) {
      best = Math.max(best, e.skillLevel ?? 1);
    }
  }
  return best;
}

export function computeWorkloadSummary(
  state: Pick<
    GameState,
    'rigs' | 'coolingUnits' | 'facilityId' | 'employees' | 'strikeStepsRemaining'
  >
): WorkloadSummary {
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === state.facilityId));
  const enabledRigs = state.rigs.filter((r) => r.enabled).length;
  const demandUnits =
    state.rigs.length * 14 +
    enabledRigs * 4 +
    (state.coolingUnits?.length ?? 0) * 6 +
    facIdx * 10;

  const capacityUnits = state.employees.reduce((sum, e) => {
    const roleCap = e.role === 'TECHNICIAN' || e.role === 'MANAGER' ? 42 : 28;
    const skillScale = 1 + ((e.skillLevel ?? 1) - 1) * 0.18;
    const shiftScale = e.shift === 'ROTATION_24_7' ? 1.25 : 1.0;
    return sum + roleCap * skillScale * shiftScale;
  }, 0);

  const employeesCount = state.employees.length;
  const avgMorale =
    employeesCount > 0
      ? Math.round(
          state.employees.reduce((s, e) => s + (e.morale ?? 85), 0) / employeesCount
        )
      : 100;
  const lowMoraleCount = state.employees.filter((e) => (e.morale ?? 85) < 45).length;
  const criticalMoraleCount = state.employees.filter((e) => (e.morale ?? 85) < 25).length;
  const strikeStepsRemaining = state.strikeStepsRemaining ?? 0;
  const strikeActive = strikeStepsRemaining > 0;

  const workloadPct =
    employeesCount === 0
      ? 0
      : Math.min(220, Math.round((demandUnits / Math.max(20, capacityUnits)) * 100));

  const statusLabel: WorkloadSummary['statusLabel'] = strikeActive
    ? 'STRIKE'
    : workloadPct > 135
    ? 'OVERLOADED'
    : workloadPct > 105
    ? 'STRAINED'
    : workloadPct >= 65
    ? 'BALANCED'
    : 'RELAXED';

  return {
    demandUnits,
    capacityUnits: Math.round(capacityUnits),
    workloadPct,
    avgMorale,
    lowMoraleCount,
    criticalMoraleCount,
    strikeActive,
    strikeStepsRemaining,
    statusLabel,
  };
}

export function stepEmployeesWorkloadAndMorale(
  state: GameState,
  nextStep: number,
  stepLabel: string
): {
  nextEmployees: HiredEmployee[];
  nextStrikeSteps: number;
  triggeredStrikeNow: boolean;
  workload: WorkloadSummary;
  alerts: NewsItem[];
} {
  const alerts: NewsItem[] = [];
  const workload = computeWorkloadSummary(state);
  let nextStrikeSteps = Math.max(0, (state.strikeStepsRemaining ?? 0) - 1);
  let triggeredStrikeNow = false;

  if ((state.strikeStepsRemaining ?? 0) > 0 && nextStrikeSteps === 0) {
    alerts.push({
      id: `news_strike_end_${nextStep}`,
      step: nextStep,
      stepLabel,
      title: 'Staff Strike Concluded',
      detail: 'Crew returned to work, though morale remains fragile. Use "staff bonus all" to stabilize.',
      category: 'FACILITY',
    });
  }

  if (state.employees.length === 0) {
    return {
      nextEmployees: [],
      nextStrikeSteps: 0,
      triggeredStrikeNow: false,
      workload,
      alerts,
    };
  }

  const managersCount = state.employees.filter(
    (e) => e.role === 'MANAGER' && (e.morale ?? 85) >= 35
  ).length;
  const hotOrFailedCount = state.rigs.filter(
    (r) => r.status === 'OVERHEATED' || r.status === 'FAILED' || r.status === 'NEEDS_REPAIR'
  ).length;

  const overloadDelta =
    workload.workloadPct > 140
      ? -2.3
      : workload.workloadPct > 110
      ? -0.95
      : workload.workloadPct <= 85
      ? 0.65
      : 0.15;
  const cashStressDelta = state.cash < 0 ? -2.4 : state.cash < 150 ? -0.6 : 0;
  const safetyDelta = hotOrFailedCount >= 2 ? -0.8 : 0;
  const managerRelief = Math.min(1.6, managersCount * 0.45);
  const strikeDrain = nextStrikeSteps > 0 ? -0.5 : 0;

  const survivedEmployees: HiredEmployee[] = [];

  for (const e of state.employees) {
    const xpGain = nextStrikeSteps > 0 ? 2 : e.shift === 'ROTATION_24_7' ? 14 : 10;
    const totalXp = (e.experienceXp ?? 0) + xpGain;
    const nextSkill = Math.min(5, 1 + Math.floor(totalXp / 180));

    const shiftFatigue =
      e.shift === 'ROTATION_24_7' ? -0.85 * Math.max(0.55, 1 - managersCount * 0.15) : 0.1;
    const rawMorale =
      (e.morale ?? 85) +
      overloadDelta +
      cashStressDelta +
      safetyDelta +
      managerRelief +
      shiftFatigue +
      strikeDrain;
    const nextMorale = Number(Math.max(0, Math.min(100, rawMorale)).toFixed(1));

    // Individual resignation at extreme burnout
    const quitRng = createSeededRng(`${state.runSeed}|emp_quit|${nextStep}|${e.id}`);
    if (nextMorale <= 12 && quitRng() < 0.28) {
      alerts.push({
        id: `news_quit_${e.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Staff Resignation: ${e.name}`,
        detail: `${e.name} (${e.role} Lv${nextSkill}) walked out due to burnout & low morale (${nextMorale.toFixed(0)}%).`,
        category: 'ALERT',
      });
      continue;
    }

    survivedEmployees.push({
      ...e,
      experienceXp: totalXp,
      skillLevel: nextSkill,
      morale: nextMorale,
    });
  }

  // Graduated Mass Strike escalation:
  // If >=10 employees have low morale (<45) OR >=65% of a >=3-person crew has low morale and avg <42
  const postLowMorale = survivedEmployees.filter((e) => (e.morale ?? 85) < 45).length;
  const postAvgMorale =
    survivedEmployees.length > 0
      ? survivedEmployees.reduce((s, e) => s + (e.morale ?? 85), 0) /
        survivedEmployees.length
      : 100;

  const strikeThresholdMet =
    postLowMorale >= 10 ||
    (survivedEmployees.length >= 3 &&
      postLowMorale >= Math.max(3, Math.ceil(survivedEmployees.length * 0.65)) &&
      postAvgMorale < 42);

  if (strikeThresholdMet && nextStrikeSteps === 0) {
    nextStrikeSteps = 6;
    triggeredStrikeNow = true;
    alerts.push({
      id: `news_strike_${nextStep}`,
      step: nextStep,
      stepLabel,
      title: 'CREW LABOR STRIKE DECLARED!',
      detail: `${postLowMorale} employees with low morale halted shift duties (-35% mining output, 0% crew bonuses for 6 steps). Run "staff negotiate" or resolve strike event!`,
      category: 'ALERT',
    });
  }

  return {
    nextEmployees: survivedEmployees,
    nextStrikeSteps,
    triggeredStrikeNow,
    workload,
    alerts,
  };
}

export function buildStrikeNegotiationEvent(state: GameState): PendingEvent {
  const count = state.employees.length;
  const mgrSkill = getTopSkillForRole(state, 'MANAGER');
  const mgrDisc = Math.max(0.65, 1 - mgrSkill * 0.07);
  const settleCost = Math.round(Math.max(350, count * 220) * mgrDisc);
  const lowCount = state.employees.filter((e) => (e.morale ?? 85) < 45).length;

  return {
    id: `evt_strike_${state.stepCount}`,
    category: 'EMPLOYEE',
    title: `Facility-Wide Labor Strike (${lowCount} Discontent Staff)`,
    description: `${lowCount} of ${count} crew members walked off the floor due to ${
      state.cash < 0 ? 'financial distress & ' : ''
    }workload strain.${mgrSkill > 0 ? ` Manager Lv${mgrSkill} discounted settlement by ${Math.round((1 - mgrDisc) * 100)}%.` : ''}`,
    triggeredStep: state.stepCount,
    options: [
      {
        key: '1',
        label: `Sign retention bonus & overtime backpay (${formatUsd(settleCost)})`,
        costUsd: settleCost,
        riskNote: 'Ends strike immediately, +30 morale to all staff',
        resolutionId: 'strike_settle',
      },
      {
        key: '2',
        label: 'Abolish 24/7 rotations & redistribute shifts',
        riskNote: 'Moves all staff to DAY shift, cuts strike to 2 steps, +18 morale',
        resolutionId: 'strike_dayshifts',
      },
      {
        key: '3',
        label: 'Hold firm & let contractors cover',
        riskNote: 'Strike continues for remaining steps, -10 morale across crew',
        resolutionId: 'strike_hardline',
      },
    ],
  };
}

export function generateDynamicEvent(
  state: GameState,
  forcedCategory?: PendingEventCategory
): PendingEvent {
  const step = state.stepCount;
  const rng = createSeededRng(`${state.runSeed}|dyn_evt|${step}|${forcedCategory ?? 'auto'}`);
  const facility = FACILITY_TIERS.find((f) => f.id === state.facilityId) ?? FACILITY_TIERS[0];
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === state.facilityId));
  const unlockedCoins = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (s) => state.coins[s].unlocked
  );
  const hotCoin = unlockedCoins[unlockedCoins.length - 1] ?? 'BTC';
  const damagedRig = [...state.rigs].sort((a, b) => a.healthPct - b.healthPct)[0];
  const targetRig = damagedRig ?? state.rigs[0];
  const targetRival = state.rivals[Math.floor(rng() * state.rivals.length)];
  const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));

  const techSkill = getTopSkillForRole(state, 'TECHNICIAN');
  const elecSkill = getTopSkillForRole(state, 'ELECTRICIAN');
  const mgrSkill = getTopSkillForRole(state, 'MANAGER');
  const resSkill = getTopSkillForRole(state, 'RESEARCHER');
  const prSkill = getTopSkillForRole(state, 'PR_STRATEGIST');

  const workload = computeWorkloadSummary(state);
  const hotRigs = state.rigs.filter((r) => r.enabled && r.temperatureC >= 80);

  let category = forcedCategory;
  if (!category) {
    if (
      state.regulatoryScrutiny >= 58 &&
      (state.underground?.bribeProtectionSteps ?? 0) === 0 &&
      rng() < 0.65
    ) {
      category = 'RAID';
    } else if ((state.strikeStepsRemaining ?? 0) > 0 && rng() < 0.5) {
      category = 'EMPLOYEE';
    } else {
      const weighted: PendingEventCategory[] = ['MARKET', 'GRID', 'OPERATIONS', 'FACILITY', 'INDUSTRY'];
      if (state.rigs.length > 0) weighted.push('HARDWARE');
      if (damagedRig && damagedRig.healthPct < 75) weighted.push('HARDWARE', 'HARDWARE');
      if (hotRigs.length > 0) weighted.push('GRID', 'FACILITY');
      if (state.employees.length > 0) {
        weighted.push('EMPLOYEE');
        if (workload.lowMoraleCount > 0 || workload.workloadPct > 115) {
          weighted.push('EMPLOYEE', 'EMPLOYEE');
        }
      }
      if (state.rigs.length >= 2 || facIdx >= 1) weighted.push('RIVAL');
      if (state.cash < 300) weighted.push('OPERATIONS', 'MARKET');
      category = weighted[Math.floor(rng() * weighted.length)];
    }
  }

  // 1. RAID (with employee skill mitigation)
  if (category === 'RAID') {
    const mgrCut = Math.max(0.65, 1 - mgrSkill * 0.06);
    const fineCost = Math.max(350, Math.round(Math.max(state.cash * 0.22, stepRev * 6) * mgrCut));
    const bribeCost = Math.max(220, Math.round(fineCost * 0.55));
    return {
      id: `evt_raid_${step}`,
      category: 'RAID',
      title: 'Utility & Regulatory Raid Warning',
      description: `Inspectors flagged abnormal load and heat (${Math.round(
        state.regulatoryScrutiny
      )}/100 scrutiny) at your ${facility.name}.${
        mgrSkill > 0 ? ` Operations Manager Lv${mgrSkill} reduced exposure.` : ''
      }`,
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
          riskNote: `${prSkill >= 2 ? '50%' : '70%'} chance of ${formatUsd(fineCost)} seizure, -10 reputation`,
          resolutionId: 'raid_resist',
        },
      ],
    };
  }

  // 2. EMPLOYEE-SPECIFIC EVENTS
  if (category === 'EMPLOYEE' && state.employees.length > 0) {
    if ((state.strikeStepsRemaining ?? 0) > 0 || workload.lowMoraleCount >= 3) {
      return buildStrikeNegotiationEvent(state);
    }
    const leadEmp = state.employees[Math.floor(rng() * state.employees.length)];
    const bonusCost = Math.max(160, Math.round(state.employees.length * 140));
    return {
      id: `evt_emp_${step}`,
      category: 'EMPLOYEE',
      title: `${leadEmp.name} (${leadEmp.role} Lv${leadEmp.skillLevel}) Field Proposal`,
      description:
        leadEmp.role === 'RESEARCHER'
          ? `${leadEmp.name} wants lab budget to run custom silicon voltage-curve experiments.`
          : `${leadEmp.name} reports ${
              workload.workloadPct > 105
                ? `crew overload at ${workload.workloadPct}%`
                : 'an opportunity to optimize shift handoffs'
            } in the ${facility.name}.`,
      triggeredStep: step,
      options: [
        {
          key: '1',
          label: `Sponsor crew incentive & tools (${formatUsd(bonusCost)})`,
          costUsd: bonusCost,
          riskNote: `+18 Morale to crew, +${12 + (leadEmp.skillLevel ?? 1) * 4} RP, +40 XP`,
          resolutionId: 'emp_sponsor',
        },
        {
          key: '2',
          label: 'Approve overtime surge target for this cycle',
          riskNote: `+${formatUsd(Math.round(stepRev * 2.4))} productivity bonus, -10 Morale`,
          resolutionId: 'emp_overtime',
        },
        {
          key: '3',
          label: 'Grant paid recovery rotation',
          riskNote: '+14 Morale, zero cash cost',
          resolutionId: 'emp_rest',
        },
      ],
    };
  }

  // 3. FACILITY-SPECIFIC EVENTS (depends on facility tier & cooling/noise)
  if (category === 'FACILITY') {
    const fixCost = Math.max(
      140,
      Math.round((160 + facIdx * 240) * Math.max(0.6, 1 - elecSkill * 0.08 - mgrSkill * 0.06))
    );
    const facTitles = [
      'Bedroom Landlord Acoustic Inspection',
      'Garage Sub-Panel Thermal Breaker Inspection',
      'Commercial Strip Zoning & HVAC Audit',
      'Warehouse Loading Dock & Air-Handling Failure',
      'Industrial Substation Harmonic Compliance Notice',
      'Mega-Complex Municipal Power Authority Review',
    ];
    const facDescs = [
      `Neighbors in your apartment building complained about fan whine from ${state.rigs.length} rig(s).`,
      `Your suburban garage breaker box is running warm under ${Math.max(1, state.rigs.length)} rig(s).`,
      `Strip-mall management flagged heat exhaust & acoustic hum around your commercial unit.`,
      `Dust buildup and louver strain reduced intake airflow across your Warehouse bays.`,
      `Regional grid engineers flagged harmonic distortion on your Industrial feeder line.`,
      `City utility regulators offered a mega-scale efficiency audit for your mining complex.`,
    ];
    return {
      id: `evt_fac_${step}`,
      category: 'FACILITY',
      title: facTitles[facIdx] ?? 'Facility Infrastructure Audit',
      description: facDescs[facIdx] ?? `Routine infrastructure check at ${facility.name}.`,
      triggeredStep: step,
      options: [
        {
          key: '1',
          label: `Hire acoustic/electrical retrofit (${formatUsd(fixCost)})`,
          costUsd: fixCost,
          riskNote: '-10 Heat, +6 Reputation, +8% fleet health',
          resolutionId: 'fac_retrofit',
        },
        {
          key: '2',
          label: 'Throttle peak rigs temporarily during inspection',
          riskNote: 'Sets hot rigs to BALANCED, -6°C cool-down, no cash cost',
          resolutionId: 'fac_throttle',
        },
        {
          key: '3',
          label: 'Ignore inspector advisory & keep hashing',
          riskNote: `+12 Heat, -5 Reputation, +${formatUsd(Math.round(stepRev * 1.4))} saved margin`,
          resolutionId: 'fac_ignore',
        },
      ],
    };
  }

  // 4. INDUSTRY-WIDE MACRO EVENTS
  if (category === 'INDUSTRY') {
    const variant = step % 3;
    if (variant === 0) {
      const prepCost = Math.max(220, Math.round(stepRev * 3.2));
      return {
        id: `evt_ind_chip_${step}`,
        category: 'INDUSTRY',
        title: 'INDUSTRY EVENT: Global Silicon Foundry Crunch',
        description:
          'A major wafer fab outage tightened global GPU & ASIC supply. Hardware prices are jumping +25% for 10 steps.',
        triggeredStep: step,
        options: [
          {
            key: '1',
            label: `Lock wholesale parts futures (${formatUsd(prepCost)})`,
            costUsd: prepCost,
            riskNote: '+16 RP & buffers resale value (+20% modifier, 10 steps)',
            resolutionId: 'ind_foundry_hedge',
          },
          {
            key: '2',
            label: 'Liquidate spare scrap & refurbish existing rigs',
            riskNote: `+${formatUsd(Math.round(prepCost * 0.65))} cash, applies +25% HW Crunch (10 steps)`,
            resolutionId: 'ind_foundry_sell',
          },
          {
            key: '3',
            label: 'Wait out the semiconductor shortage',
            riskNote: 'Applies +25% Hardware Shortage modifier for 10 steps',
            resolutionId: 'ind_foundry_wait',
          },
        ],
      };
    }
    if (variant === 1) {
      const lobbyCost = Math.max(260, Math.round(stepRev * 3.5));
      return {
        id: `evt_ind_energy_${step}`,
        category: 'INDUSTRY',
        title: 'INDUSTRY EVENT: Clean-Grid Rebate vs Carbon Levy',
        description:
          'Energy regulators are rolling out new commercial mining tariffs across all regional networks.',
        triggeredStep: step,
        options: [
          {
            key: '1',
            label: `File green-efficiency compliance packet (${formatUsd(lobbyCost)})`,
            costUsd: lobbyCost,
            riskNote: 'Triggers -20% Power Rebate for 10 steps & +8 Reputation',
            resolutionId: 'ind_energy_rebate',
          },
          {
            key: '2',
            label: 'Shift telemetry to R&D grid-balancing consortium',
            riskNote: `+${14 + resSkill * 4} Research Points, +4 Reputation`,
            resolutionId: 'ind_energy_rd',
          },
          {
            key: '3',
            label: 'Accept standard commercial tariff hike',
            riskNote: 'Triggers +22% Power Spike modifier for 8 steps',
            resolutionId: 'ind_energy_spike',
          },
        ],
      };
    }
    return {
      id: `evt_ind_boom_${step}`,
      category: 'INDUSTRY',
      title: 'INDUSTRY EVENT: Institutional ETF Liquidity Wave',
      description: `Global institutional desks just opened spot inflows across ${hotCoin} and major proof-of-work networks.`,
      triggeredStep: step,
      targetCoin: hotCoin,
      options: [
        {
          key: '1',
          label: `Co-market hash capacity with PR desk (${formatUsd(Math.max(200, Math.round(stepRev * 2.8)))})`,
          costUsd: Math.max(200, Math.round(stepRev * 2.8)),
          riskNote: 'Triggers Mining Boom (+coin drift, 10st) & +10 Reputation',
          resolutionId: 'ind_etf_join',
        },
        {
          key: '2',
          label: 'Sell analyst telemetry to trading desks',
          riskNote: `+${formatUsd(Math.max(180, Math.round(stepRev * 2.2)))} cash, Mining Boom (10st)`,
          resolutionId: 'ind_etf_data',
        },
        {
          key: '3',
          label: 'Stay focused on core mining uptime',
          riskNote: 'Triggers Mining Boom modifier (10st) +5 RP',
          resolutionId: 'ind_etf_stay',
        },
      ],
    };
  }

  // 5. COMPONENT-SPECIFIC HARDWARE FAILURE EVENTS
  if (category === 'HARDWARE' && targetRig) {
    const slotChoices: { slot: RepairComponentSlot; label: string }[] = [
      { slot: targetRig.gpuIds.length > 0 ? 'gpu' : 'compute', label: targetRig.gpuIds.length > 0 ? 'GPU VRM & Memory Bank' : 'Compute ASIC/CPU Core' },
      { slot: 'psu', label: 'PSU Primary Capacitor Stage' },
      { slot: 'cooling', label: 'Cooling Fan / Pump Assembly' },
    ];
    const picked = slotChoices[step % slotChoices.length];
    const targetGpuIdx = picked.slot === 'gpu' ? 0 : undefined;
    const techCut = Math.max(0.55, 1 - techSkill * 0.1);
    const patchCost = Math.max(85, Math.round((110 + facIdx * 50) * techCut));

    return {
      id: `evt_hw_${step}`,
      category: 'HARDWARE',
      title: `Component Fault Alert: ${targetRig.name} (${picked.label})`,
      description: `Sensor telemetry detected imminent degradation on ${targetRig.name}'s ${picked.label} (Rig Health ${targetRig.healthPct.toFixed(0)}%, ${targetRig.temperatureC}°C).${
        techSkill > 0 ? ` Technician Lv${techSkill} reduced bench cost.` : ''
      }`,
      triggeredStep: step,
      targetRigId: targetRig.id,
      targetComponentSlot: picked.slot,
      targetGpuIdx,
      options: [
        {
          key: '1',
          label: `Replace stressed ${picked.slot.toUpperCase()} module (${formatUsd(patchCost)})`,
          costUsd: patchCost,
          riskNote: `Restores ${picked.slot.toUpperCase()} to 100% + fresh paste`,
          resolutionId: 'hw_comp_fix',
        },
        {
          key: '2',
          label: 'Run stress-trace & dump diagnostic telemetry',
          riskNote: `${picked.slot.toUpperCase()} drops -24% condition, +${12 + resSkill * 3} RP`,
          resolutionId: 'hw_comp_dump',
        },
        {
          key: '3',
          label: 'Push TURBO through voltage ripple',
          riskNote: `Instant +${formatUsd(Math.max(80, Math.round(stepRev * 2)))} cash, -28% ${picked.slot.toUpperCase()} & +12°C`,
          resolutionId: 'hw_comp_push',
        },
      ],
    };
  }

  // 6. GRID (influenced by Electrician skill & UPS)
  if (category === 'GRID') {
    const elecCut = Math.max(0.55, 1 - elecSkill * 0.09);
    const upsLvl = state.facilityUpgrades?.backup_power ?? 0;
    const protection = Math.min(0.95, upsLvl * 0.35 + elecSkill * 0.08);
    const rawTariff = Math.max(110, Math.round(stepRev * 3.4));
    const tariffUsd = Math.max(40, Math.round(rawTariff * (1 - protection) * elecCut));
    return {
      id: `evt_grid_${step}`,
      category: 'GRID',
      title: 'Regional Grid Peak Tariff & Brownout',
      description: `A severe power crunch hit ${facility.name}. Grid shields & Electrician skill cut surcharge exposure by ${Math.round(
        (1 - (1 - protection) * elecCut) * 100
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

  // 7. RIVAL
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
          riskNote: `+${8 + prSkill * 2} Reputation, +15 RP, lifts coin sentiment`,
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

  // 8. OPERATIONS / FINANCIAL CONDITION
  if (category === 'OPERATIONS') {
    if (state.cash < 300) {
      return {
        id: `evt_fin_${step}`,
        category: 'OPERATIONS',
        title: 'Cashflow Crunch: Emergency Hashrate Pre-Sale',
        description: `With reserves tight (${formatUsd(state.cash)}), an institutional broker offers upfront working capital for a share of compute telemetry.`,
        triggeredStep: step,
        options: [
          {
            key: '1',
            label: 'Accept $650 advance against future contracts',
            riskNote: '+$650 immediate cash, -6 Reputation',
            resolutionId: 'fin_advance',
          },
          {
            key: '2',
            label: 'Run emergency maintenance & optimize power',
            riskNote: '+10% fleet condition, sets rigs BALANCED',
            resolutionId: 'ops_maint_pass',
          },
          {
            key: '3',
            label: 'Sell raw analytics logs to quant desk',
            riskNote: `+${formatUsd(Math.max(180, Math.round(stepRev * 2.5)))} cash, -2 RP`,
            resolutionId: 'ops_flip_lot',
          },
        ],
      };
    }

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
          riskNote: `+${24 + resSkill * 5} Research Points & +4 Reputation`,
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

  // 9. MARKET fallback
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

export function patchRigSingleSlot(
  rig: MiningRig,
  compHealth: RigComponentHealth,
  slot: RepairComponentSlot,
  gpuIdx: number | undefined,
  deltaOrSet: number,
  isAbsoluteSet = false
): RigComponentHealth {
  const clamp = (v: number) => Number(Math.max(20, Math.min(100, v)).toFixed(1));
  const nextVal = (cur: number) => (isAbsoluteSet ? clamp(deltaOrSet) : clamp(cur + deltaOrSet));

  if (slot === 'gpu') {
    const nextGpus = compHealth.gpus.map((g, idx) =>
      gpuIdx === undefined || idx === gpuIdx ? nextVal(g) : g
    );
    return { ...compHealth, gpus: nextGpus };
  }
  return {
    ...compHealth,
    [slot]: nextVal(compHealth[slot]),
  };
}

export function createMacroModifier(
  type: ActiveMarketModifier['type'],
  step: number
): ActiveMarketModifier {
  if (type === 'HARDWARE_SHORTAGE') {
    return {
      id: `mod_ind_hw_${step}`,
      type: 'HARDWARE_SHORTAGE',
      label: 'Global Silicon Shortage',
      stepsRemaining: 10,
      hardwarePriceMult: 1.25,
      powerRateMult: 1.0,
      resaleValueMult: 1.2,
      rivalGrowthMult: 0.9,
      coinPriceDriftDelta: 0.002,
      summary: '+25% hardware cost, +20% rig resale value.',
    };
  }
  if (type === 'POWER_REBATE') {
    return {
      id: `mod_ind_reb_${step}`,
      type: 'POWER_REBATE',
      label: 'Clean-Grid Tariff Rebate',
      stepsRemaining: 10,
      hardwarePriceMult: 1.0,
      powerRateMult: 0.8,
      resaleValueMult: 1.0,
      rivalGrowthMult: 1.05,
      coinPriceDriftDelta: 0,
      summary: '-20% facility electricity cost.',
    };
  }
  if (type === 'POWER_SPIKE') {
    return {
      id: `mod_ind_spk_${step}`,
      type: 'POWER_SPIKE',
      label: 'Commercial Power Tariff Spike',
      stepsRemaining: 8,
      hardwarePriceMult: 1.0,
      powerRateMult: 1.22,
      resaleValueMult: 0.96,
      rivalGrowthMult: 0.92,
      coinPriceDriftDelta: -0.002,
      summary: '+22% facility electricity cost.',
    };
  }
  return {
    id: `mod_ind_boom_${step}`,
    type: 'MINING_BOOM',
    label: 'Institutional ETF Boom',
    stepsRemaining: 10,
    hardwarePriceMult: 1.08,
    powerRateMult: 1.0,
    resaleValueMult: 1.15,
    rivalGrowthMult: 1.2,
    coinPriceDriftDelta: 0.012,
    summary: 'Strong institutional inflows & bullish coin drift.',
  };
}
