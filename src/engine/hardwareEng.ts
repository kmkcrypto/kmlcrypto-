import {
  ConglomerateState,
  GameState,
  NewsItem,
  PartCategory,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { upgradeBusinessDivision } from './businesses';
import {
  buildDefaultConglomerate,
  isBusinessActive,
  isBusinessOwned,
  recordDivisionFinancials,
} from './conglomerate';

export const MAX_HW_LAB_TIER = 5;

const LAB_TIER_NAMES: Record<number, string> = {
  1: 'RTL Verification & Thermal Bench',
  2: 'Multi-Chiplet Packaging Studio',
  3: 'Lithography Mask & Cryo Co-Sim Lab',
  4: 'Optical Interconnect & Silicon R&D Center',
  5: 'Autonomous Architecture Cleanroom',
};

const CONTRACT_SPECS: Record<
  'compute' | 'gpu' | 'cooling' | 'psu',
  { label: string; baseFeeUsd: number; rpReward: number }
> = {
  compute: { label: 'Custom Hash Core & Tape-Out Audit', baseFeeUsd: 26_000, rpReward: 12 },
  gpu: { label: 'High-Bandwidth Accelerator Kernel Spec', baseFeeUsd: 22_000, rpReward: 10 },
  cooling: { label: 'Two-Phase Immersion & Cold-Plate Spec', baseFeeUsd: 19_000, rpReward: 9 },
  psu: { label: 'GaN HVDC Power Stage Reference Board', baseFeeUsd: 17_500, rpReward: 8 },
};

function requireActiveHardwareEng(state: GameState): {
  ok: boolean;
  reason?: string;
  cong: ConglomerateState;
} {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!isBusinessOwned({ conglomerate: cong }, 'HARDWARE_ENG')) {
    return {
      ok: false,
      cong,
      reason: 'Hardware Engineering division is not owned yet. Reach Gen 5+ and acquire it via "acquire".',
    };
  }
  if (!isBusinessActive({ conglomerate: cong }, 'HARDWARE_ENG')) {
    const div = cong.businesses.HARDWARE_ENG;
    return {
      ok: false,
      cong,
      reason: `Hardware Engineering (${div.acquiredCompanyName ?? div.name}) is RECOVERING (${div.recoveryStepsRemaining}st left). Fund stabilization with "corp turnaround hardware_eng".`,
    };
  }
  return { ok: true, cong };
}

export function getMaxLicensedBlueprints(labTier: number): number {
  return 2 + Math.max(1, labTier) * 2;
}

export interface HardwareEngFabEffects {
  active: boolean;
  labTier: number;
  extraEpBudget: number;
  nreDiscountMult: number;
  mfgLiftPts: number;
  protoScoreBonus: number;
}

export function getHardwareEngFabEffects(
  state: Pick<GameState, 'conglomerate'>
): HardwareEngFabEffects {
  if (!isBusinessActive(state, 'HARDWARE_ENG')) {
    return {
      active: false,
      labTier: 1,
      extraEpBudget: 0,
      nreDiscountMult: 1,
      mfgLiftPts: 0,
      protoScoreBonus: 0,
    };
  }
  const cong = state.conglomerate!;
  const labTier = Math.max(1, Math.min(MAX_HW_LAB_TIER, cong.hardwareEng.labTier));
  const coolBonusPct = cong.hardwareEng.coolingPowerEfficiencyBonusPct ?? 0;
  return {
    active: true,
    labTier,
    extraEpBudget: labTier >= 3 ? 2 : 1,
    nreDiscountMult: Number(Math.max(0.75, 1 - labTier * 0.02 - coolBonusPct * 0.005).toFixed(3)),
    mfgLiftPts: Math.min(10, labTier * 2),
    protoScoreBonus: Number((labTier * 2.5 + coolBonusPct * 0.25).toFixed(1)),
  };
}

export function getLicensedBlueprintStepRoyaltyUsd(
  state: GameState,
  congInput: ConglomerateState
): number {
  const licensedIds = congInput.hardwareEng.licensedBlueprintIds ?? [];
  if (licensedIds.length === 0) return 0;

  const blueprints = state.fab?.blueprints ?? [];
  const div = congInput.businesses.HARDWARE_ENG;
  const labTier = Math.max(1, congInput.hardwareEng.labTier);

  let sum = 0;
  for (const id of licensedIds) {
    const bp = blueprints.find((b) => b.id === id);
    const wholesaleRef = bp?.wholesaleValueUsd ?? 8_500;
    const protoMult = bp?.prototypeReport?.status === 'PASSED' ? 1.35 : 1.0;
    const baseStream = Math.max(420, Math.min(4_500, wholesaleRef * 0.032));
    sum += baseStream * protoMult * (0.85 + labTier * 0.15) * div.efficiencyMult;
  }
  return Number(sum.toFixed(2));
}

export function licenseBlueprintExternally(
  state: GameState,
  blueprintIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveHardwareEng(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const eng = cong.hardwareEng;
  const div = cong.businesses.HARDWARE_ENG;

  const bp = state.fab?.blueprints?.[blueprintIdx];
  if (!bp) {
    return {
      ok: false,
      nextState: state,
      summary: `Blueprint #${blueprintIdx + 1} not found. Tape out a design first ("fab design").`,
    };
  }

  const licensedIds = eng.licensedBlueprintIds ?? [];
  if (licensedIds.includes(bp.id)) {
    return {
      ok: false,
      nextState: state,
      summary: `Blueprint "${bp.name}" is already licensed to external hardware partners.`,
    };
  }

  const maxSlots = getMaxLicensedBlueprints(eng.labTier);
  if (licensedIds.length >= maxSlots) {
    return {
      ok: false,
      nextState: state,
      summary: `External IP licensing portfolio full (${licensedIds.length}/${maxSlots} blueprints). Upgrade division ("eng upgrade" / "corp upgrade eng").`,
    };
  }

  const protoMult = bp.prototypeReport?.status === 'PASSED' ? 1.45 : bp.prototypeReport?.status === 'MARGINAL' ? 1.15 : 1.0;
  const upfrontFee = Math.round(
    Math.max(12_000, bp.wholesaleValueUsd * 1.4) *
      protoMult *
      (0.85 + eng.labTier * 0.15) *
      div.efficiencyMult
  );

  const nextLicensedIds = [...licensedIds, bp.id];
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      HARDWARE_ENG: {
        ...div,
        reputation: Math.min(100, div.reputation + 2),
      },
    },
    hardwareEng: {
      ...eng,
      licensedDesignsCount: eng.licensedDesignsCount + 1,
      royaltyIncomeTotalUsd: Number((eng.royaltyIncomeTotalUsd + upfrontFee).toFixed(2)),
      licensedBlueprintIds: nextLicensedIds,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'HARDWARE_ENG', { revenueUsd: upfrontFee });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_eng_lic_${bp.id}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: upfrontFee,
    description: `Licensed "${bp.name}" IP externally (+royalty stream)`,
  };
  const news: NewsItem = {
    id: `news_eng_lic_${bp.id}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Hardware IP Licensed: ${bp.name} (+${formatUsd(upfrontFee)})`,
    detail: `External OEMs signed licensing terms for ${bp.processNode} ${(bp.partCategory ?? 'compute').toUpperCase()} blueprint "${bp.name}" (${bp.prototypeReport?.status === 'PASSED' ? 'Proto-Validated 1.45x' : 'Standard'}).`,
    category: 'MARKET',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + upfrontFee,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
    },
    summary: `Licensed "${bp.name}" IP externally for +${formatUsd(upfrontFee)} upfront + recurring per-step royalties (${nextLicensedIds.length}/${maxSlots} IP slots).`,
  };
}

export function completeExternalDesignContract(
  state: GameState,
  specialtyRaw?: string
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveHardwareEng(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const eng = cong.hardwareEng;
  const div = cong.businesses.HARDWARE_ENG;

  const cooldown = 4;
  if (typeof eng.lastContractStep === 'number' && state.stepCount - eng.lastContractStep < cooldown) {
    const rem = cooldown - (state.stepCount - eng.lastContractStep);
    return {
      ok: false,
      nextState: state,
      summary: `External engineering contract queue busy (${rem} step${rem === 1 ? '' : 's'} remaining).`,
    };
  }

  const normalized = (specialtyRaw ?? 'compute').trim().toLowerCase();
  const specialty: 'compute' | 'gpu' | 'cooling' | 'psu' =
    normalized === 'gpu' || normalized === 'cooling' || normalized === 'psu'
      ? normalized
      : 'compute';
  const spec = CONTRACT_SPECS[specialty];

  const matchingBp = (state.fab?.blueprints ?? []).some(
    (b) => (b.partCategory ?? 'compute') === specialty
  );
  const bpBonusMult = matchingBp ? 1.28 : 1.0;
  const payoutUsd = Math.round(
    spec.baseFeeUsd * (0.85 + eng.labTier * 0.22) * div.efficiencyMult * bpBonusMult
  );
  const rpGain = Math.round(spec.rpReward + eng.labTier * 2);

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      HARDWARE_ENG: {
        ...div,
        reputation: Math.min(100, div.reputation + 2),
      },
    },
    hardwareEng: {
      ...eng,
      externalDesignContractsCompleted: eng.externalDesignContractsCompleted + 1,
      lastContractStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'HARDWARE_ENG', { revenueUsd: payoutUsd });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_eng_contract_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: payoutUsd,
    description: `External HW Engineering contract (${spec.label})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + payoutUsd,
      researchPoints: state.researchPoints + rpGain,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Delivered ${spec.label} for +${formatUsd(payoutUsd)} and +${rpGain} RP${matchingBp ? ' (+28% matching-blueprint IP bonus!)' : '.'}`,
  };
}

export function runCoolingPowerEngineeringTune(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveHardwareEng(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const eng = cong.hardwareEng;
  const div = cong.businesses.HARDWARE_ENG;

  const cooldown = 3;
  if (typeof eng.lastTuningStep === 'number' && state.stepCount - eng.lastTuningStep < cooldown) {
    const rem = cooldown - (state.stepCount - eng.lastTuningStep);
    return {
      ok: false,
      nextState: state,
      summary: `Thermal & power R&D bench resetting (${rem} step${rem === 1 ? '' : 's'} remaining).`,
    };
  }

  const curBonus = eng.coolingPowerEfficiencyBonusPct ?? 0;
  if (curBonus >= 12) {
    return {
      ok: false,
      nextState: state,
      summary: `Cooling & power delivery architecture is already tuned to maximum +12% NRE & validation efficiency.`,
    };
  }

  const cost = 3_500 + eng.labTier * 1_500;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Thermal & power R&D bench simulation requires ${formatUsd(cost)}.`,
    };
  }

  const nextBonus = Math.min(12, curBonus + 2);
  const rpGain = 6 + eng.labTier * 2;
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      HARDWARE_ENG: {
        ...div,
        reputation: Math.min(100, div.reputation + 1),
      },
    },
    hardwareEng: {
      ...eng,
      coolingPowerEfficiencyBonusPct: nextBonus,
      lastTuningStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'HARDWARE_ENG', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_eng_tune_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: 'Hardware Engineering cooling & power systems R&D',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      researchPoints: state.researchPoints + rpGain,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
    },
    summary: `Completed cooling & power R&D calibration for ${formatUsd(cost)} -> +${rpGain} RP, NRE & Proto efficiency bonus now +${nextBonus}% (max 12%).`,
  };
}

export function upgradeHardwareEngLab(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  return upgradeBusinessDivision(state, 'hardware_eng');
}

/**
 * Advances recurring IP royalties & lab operating expenses for Business 3.
 * Deterministic and RNG-free.
 */
export function stepHardwareEngDivision(
  state: GameState,
  congInput: ConglomerateState,
  _nextStep: number
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
} {
  if (!isBusinessActive({ conglomerate: congInput }, 'HARDWARE_ENG')) {
    return { conglomerate: congInput, cashDeltaUsd: 0 };
  }

  let cong = congInput;
  const eng = cong.hardwareEng;
  const royaltyUsd = getLicensedBlueprintStepRoyaltyUsd(state, cong);
  const labOverheadUsd = Number((150 * Math.max(1, eng.labTier)).toFixed(2));
  const netCash = Number((royaltyUsd - labOverheadUsd).toFixed(2));

  if (royaltyUsd > 0) {
    cong = {
      ...cong,
      hardwareEng: {
        ...eng,
        royaltyIncomeTotalUsd: Number((eng.royaltyIncomeTotalUsd + royaltyUsd).toFixed(2)),
      },
    };
  }
  cong = recordDivisionFinancials(cong, 'HARDWARE_ENG', {
    revenueUsd: royaltyUsd,
    expenseUsd: labOverheadUsd,
    setStepSnapshot: true,
  });

  return {
    conglomerate: cong,
    cashDeltaUsd: netCash,
  };
}

export function formatHardwareEngReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses.HARDWARE_ENG;
  const eng = cong.hardwareEng;
  const fx = getHardwareEngFabEffects({ conglomerate: cong });
  const maxSlots = getMaxLicensedBlueprints(eng.labTier);
  const licensedIds = eng.licensedBlueprintIds ?? [];
  const stepRoyalty = isBusinessActive({ conglomerate: cong }, 'HARDWARE_ENG')
    ? getLicensedBlueprintStepRoyaltyUsd(state, cong)
    : 0;
  const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;

  const blueprints = state.fab?.blueprints ?? [];
  const licensedNames = licensedIds
    .map((id) => blueprints.find((b) => b.id === id)?.name ?? id)
    .join(', ');

  return [
    `  BUSINESS 3 // HARDWARE ENGINEERING — ${div.acquiredCompanyName ?? div.name}`,
    `    Status          : ${div.status}${div.status === 'RECOVERING' ? ` (${div.recoveryStepsRemaining}st left — "corp turnaround hardware_eng")` : ` · Div Lv ${div.level}/5 · Eff ${Math.round(div.efficiencyMult * 100)}%`}`,
    `    Engineering Lab : Tier ${eng.labTier}/${MAX_HW_LAB_TIER} — ${LAB_TIER_NAMES[eng.labTier] ?? 'Advanced Lab'}`,
    `    Foundry Perks   : +${fx.extraEpBudget} EP Budget · -${Math.round((1 - fx.nreDiscountMult) * 100)}% NRE · +${fx.mfgLiftPts}% Mfg Yield · +${fx.protoScoreBonus} Proto Score`,
    `    Licensed IP     : ${licensedIds.length}/${maxSlots} blueprints (${formatUsd(stepRoyalty)}/st royalties · Lifetime: ${formatUsd(eng.royaltyIncomeTotalUsd)})`,
    ...(licensedNames ? [`    Active Licenses : ${licensedNames}`] : []),
    `    Design Contracts: ${eng.externalDesignContractsCompleted} external specs delivered · Thermal/PSU Bonus: +${eng.coolingPowerEfficiencyBonusPct ?? 0}%`,
    `    Division P&L    : Rev ${formatUsd(div.ledger.totalRevenueUsd)} | Exp ${formatUsd(div.ledger.totalExpenseUsd)} | Syn Credits +${formatUsd(div.ledger.totalInternalCreditsUsd)} | Net ${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`,
    '',
    `  COMMANDS:`,
    `    eng license <bp#>                License a taped-out blueprint externally for fee + step royalties`,
    `    eng contract [compute|gpu|cooling|psu]  Deliver commissioned external hardware R&D spec`,
    `    eng tune                         Calibrate cooling & power delivery (+RP & NRE reduction)`,
    `    eng upgrade                      Expand engineering lab tier & licensing capacity`,
  ].join('\n');
}

export type HardwareEngContractSpecialty = keyof typeof CONTRACT_SPECS;
export type HardwareBlueprintPartCategory = PartCategory;
