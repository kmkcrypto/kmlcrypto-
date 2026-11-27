import {
  ConglomerateState,
  GameState,
  NewsItem,
  TransactionEntry,
  UndergroundDivisionContract,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import {
  buildDefaultConglomerate,
  isBusinessActive,
  isBusinessOwned,
  recordDivisionFinancials,
} from './conglomerate';
import { appendUndergroundRecord } from './underground';

export const MAX_SUBSIDIARY_SHIELD_PCT = 60;

type UndergroundContractKind = UndergroundDivisionContract['kind'];

const UG_CONTRACT_SPECS: Record<
  UndergroundContractKind,
  {
    codeName: string;
    collateralUsd: number;
    basePayoutUsd: number;
    steps: number;
    heatGain: number;
  }
> = {
  OFFSHORE_ESCROW: {
    codeName: 'Nominee Offshore Escrow Settlement',
    collateralUsd: 16_000,
    basePayoutUsd: 27_500,
    steps: 3,
    heatGain: 4,
  },
  DARK_POOL_LIQUIDITY: {
    codeName: 'Dark-Pool Shadow Liquidity Conduit',
    collateralUsd: 24_000,
    basePayoutUsd: 42_000,
    steps: 4,
    heatGain: 6,
  },
  RIVAL_PROXY_PRESSURE: {
    codeName: 'Rival Syndicate Hash-Proxy Disruption',
    collateralUsd: 19_000,
    basePayoutUsd: 33_500,
    steps: 3,
    heatGain: 5,
  },
};

function requireActiveUndergroundDiv(state: GameState): {
  ok: boolean;
  reason?: string;
  cong: ConglomerateState;
} {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!isBusinessOwned({ conglomerate: cong }, 'UNDERGROUND')) {
    return {
      ok: false,
      cong,
      reason: 'Underground Subsidiary division is not owned yet. Early "ops" tools remain active; reach Gen 5+ and acquire Business 6 via "acquire".',
    };
  }
  if (!isBusinessActive({ conglomerate: cong }, 'UNDERGROUND')) {
    const div = cong.businesses.UNDERGROUND;
    return {
      ok: false,
      cong,
      reason: `Underground Subsidiary (${div.acquiredCompanyName ?? div.name}) is RECOVERING (${div.recoveryStepsRemaining}st left). Fund stabilization with "corp turnaround underground".`,
    };
  }
  return { ok: true, cong };
}

export interface UndergroundDivisionEffects {
  active: boolean;
  subsidiaryStructured: boolean;
  effectiveShieldPct: number;
  parentSpilloverMult: number;
  launderBoostMult: number;
}

export function getUndergroundDivisionEffects(
  state: Pick<GameState, 'conglomerate'>
): UndergroundDivisionEffects {
  if (!isBusinessActive(state, 'UNDERGROUND')) {
    return {
      active: false,
      subsidiaryStructured: false,
      effectiveShieldPct: 0,
      parentSpilloverMult: 1,
      launderBoostMult: 1,
    };
  }
  const ugDiv = state.conglomerate!.undergroundDiv;
  const structuredBonus = ugDiv.subsidiaryStructured ? 15 : 0;
  const effectiveShieldPct = Math.min(75, ugDiv.shellSubsidiaryShieldPct + structuredBonus);
  return {
    active: true,
    subsidiaryStructured: ugDiv.subsidiaryStructured,
    effectiveShieldPct,
    parentSpilloverMult: Number(Math.max(0.25, 1 - effectiveShieldPct / 100).toFixed(3)),
    launderBoostMult: Number((1 + ugDiv.launderCapacityBonusPct / 100).toFixed(2)),
  };
}

export function hardenShellSubsidiary(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveUndergroundDiv(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const div = cong.businesses.UNDERGROUND;
  const ugDiv = cong.undergroundDiv;

  if (ugDiv.subsidiaryStructured && ugDiv.shellSubsidiaryShieldPct >= MAX_SUBSIDIARY_SHIELD_PCT) {
    return {
      ok: false,
      nextState: state,
      summary: `Shell subsidiary compliance firewall is already hardened to maximum ${MAX_SUBSIDIARY_SHIELD_PCT}%.`,
    };
  }

  const isInitialSetup = !ugDiv.subsidiaryStructured;
  const cost = isInitialSetup
    ? 32_000
    : Math.round(22_000 + ugDiv.shellSubsidiaryShieldPct * 400);
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `${isInitialSetup ? 'Incorporating offshore shell SPV' : 'Layering shell nominee firewall'} costs ${formatUsd(cost)}.`,
    };
  }

  const nextShield = isInitialSetup
    ? Math.min(MAX_SUBSIDIARY_SHIELD_PCT, Math.max(22, ugDiv.shellSubsidiaryShieldPct + 18))
    : Math.min(MAX_SUBSIDIARY_SHIELD_PCT, ugDiv.shellSubsidiaryShieldPct + 12);
  const nextLaunderBonus = ugDiv.launderCapacityBonusPct + (isInitialSetup ? 12 : 10);

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      UNDERGROUND: {
        ...div,
        reputation: Math.min(100, div.reputation + 2),
      },
    },
    undergroundDiv: {
      ...ugDiv,
      subsidiaryStructured: true,
      shellSubsidiaryShieldPct: nextShield,
      launderCapacityBonusPct: nextLaunderBonus,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'UNDERGROUND', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const desc = isInitialSetup
    ? `Incorporated ring-fenced offshore shell subsidiary (${nextShield}% shield)`
    : `Hardened shell subsidiary firewall (${nextShield}% shield)`;

  const tx: TransactionEntry = {
    id: `tx_ug_shield_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: desc,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
      underground: appendUndergroundRecord(
        state.underground,
        state.stepCount,
        'INVESTIGATION',
        desc,
        'RECOVERY',
        -cost,
        0,
        0
      ),
    },
    summary: `${desc} for ${formatUsd(cost)}. Parent spillover shield now ${Math.min(75, nextShield + 15)}% · Launder efficiency +${nextLaunderBonus}%.`,
  };
}

export function startUndergroundContract(
  state: GameState,
  kindRaw?: string
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveUndergroundDiv(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const div = cong.businesses.UNDERGROUND;
  const ugDiv = cong.undergroundDiv;

  if (ugDiv.activeContract) {
    return {
      ok: false,
      nextState: state,
      summary: `Underground syndicate already running "${ugDiv.activeContract.codeName}" (${ugDiv.activeContract.stepsRemaining}st left).`,
    };
  }

  const norm = (kindRaw ?? 'escrow').trim().toLowerCase();
  const kind: UndergroundContractKind =
    norm.includes('pool') || norm.includes('liq') || norm === 'dark'
      ? 'DARK_POOL_LIQUIDITY'
      : norm.includes('rival') || norm.includes('proxy') || norm.includes('press')
      ? 'RIVAL_PROXY_PRESSURE'
      : 'OFFSHORE_ESCROW';
  const spec = UG_CONTRACT_SPECS[kind];

  if (state.cash < spec.collateralUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `Contract escrow collateral for ${spec.codeName} requires ${formatUsd(spec.collateralUsd)}.`,
    };
  }

  const eff = getUndergroundDivisionEffects({ conglomerate: cong });
  const heatGain = Number(Math.max(1.5, spec.heatGain * eff.parentSpilloverMult).toFixed(1));
  const payoutUsd = Math.round(
    spec.basePayoutUsd * (0.9 + div.level * 0.08) * div.efficiencyMult
  );

  const contract: UndergroundDivisionContract = {
    id: `ug_ctr_${state.stepCount}`,
    codeName: spec.codeName,
    kind,
    stepsRemaining: spec.steps,
    totalSteps: spec.steps,
    basePayoutUsd: payoutUsd,
    riskHeat: heatGain,
  };

  let nextCong: ConglomerateState = {
    ...cong,
    undergroundDiv: {
      ...ugDiv,
      activeContract: contract,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'UNDERGROUND', { expenseUsd: spec.collateralUsd });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_ug_ctr_start_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -spec.collateralUsd,
    description: `Underground division contract escrow: ${spec.codeName}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - spec.collateralUsd,
      regulatoryScrutiny: Math.min(100, state.regulatoryScrutiny + heatGain),
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + spec.collateralUsd,
      },
      underground: appendUndergroundRecord(
        {
          ...state.underground,
          suspiciousActivityScore: (state.underground.suspiciousActivityScore ?? 0) + heatGain,
        },
        state.stepCount,
        kind === 'RIVAL_PROXY_PRESSURE' ? 'SABOTAGE' : 'LAUNDER',
        `Launched "${spec.codeName}" (escrow ${formatUsd(spec.collateralUsd)}, est payout ${formatUsd(payoutUsd)})`,
        'SUCCESS',
        -spec.collateralUsd,
        heatGain,
        0
      ),
    },
    summary: `Launched "${spec.codeName}" (${spec.steps} steps · Escrow ${formatUsd(spec.collateralUsd)} · Est. Payout ${formatUsd(payoutUsd)}, +${heatGain} Heat). Keep Heat low to avoid seizure haircuts.`,
  };
}

export function runAuditFirewallSweep(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveUndergroundDiv(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const ugDiv = cong.undergroundDiv;

  const cooldown = 4;
  if (
    typeof ugDiv.lastAuditFirewallStep === 'number' &&
    state.stepCount - ugDiv.lastAuditFirewallStep < cooldown
  ) {
    const rem = cooldown - (state.stepCount - ugDiv.lastAuditFirewallStep);
    return {
      ok: false,
      nextState: state,
      summary: `Shell accounting firewall sweep cooling down (${rem} step${rem === 1 ? '' : 's'} remaining).`,
    };
  }

  const cost = 8_500;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Audit firewall scrub requires ${formatUsd(cost)}.`,
    };
  }

  const eff = getUndergroundDivisionEffects({ conglomerate: cong });
  const heatDrop = Math.min(28, Math.round(14 * eff.launderBoostMult));
  const nextScrutiny = Math.max(0, state.regulatoryScrutiny - heatDrop);

  let nextCong: ConglomerateState = {
    ...cong,
    undergroundDiv: {
      ...ugDiv,
      lastAuditFirewallStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'UNDERGROUND', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_ug_sweep_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Underground accounting firewall sweep (-${heatDrop} Heat)`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      regulatoryScrutiny: nextScrutiny,
      mediaCredibility: Math.min(100, state.mediaCredibility + 1.5),
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
      underground: appendUndergroundRecord(
        {
          ...state.underground,
          suspiciousActivityScore: Math.max(
            0,
            Number(((state.underground.suspiciousActivityScore ?? 0) * 0.7).toFixed(1))
          ),
        },
        state.stepCount,
        'LAUNDER',
        `Firewall audit scrub (-${heatDrop} Heat, -30% suspicion)`,
        'RECOVERY',
        -cost,
        -heatDrop,
        1.5
      ),
    },
    summary: `Executed shell accounting firewall sweep for ${formatUsd(cost)} -> -${heatDrop} Heat (now ${nextScrutiny.toFixed(0)}/100), -30% forensic suspicion, +1.5 parent credibility.`,
  };
}

export function containParentSpillover(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveUndergroundDiv(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const ugDiv = cong.undergroundDiv;
  const hasExposure =
    state.regulatoryScrutiny >= 20 ||
    (state.underground.marketConfidencePenaltyPct ?? 0) > 0 ||
    (state.underground.retaliationRiskPct ?? 0) > 0 ||
    (state.underground.investigationStage ?? 'NONE') !== 'NONE';

  if (!hasExposure) {
    return {
      ok: false,
      nextState: state,
      summary: 'No active regulatory spillover, confidence drag, or retaliation exposure requires containment right now.',
    };
  }

  const cost = 14_000;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Corporate spillover isolation retainer costs ${formatUsd(cost)}.`,
    };
  }

  const nextConfDrag = Number(
    Math.max(0, (state.underground.marketConfidencePenaltyPct ?? 0) * 0.55).toFixed(2)
  );
  const nextRetRisk = Number(
    Math.max(0, (state.underground.retaliationRiskPct ?? 0) - 20).toFixed(1)
  );
  const nextScrutiny = Math.max(0, state.regulatoryScrutiny - 10);

  let nextCong: ConglomerateState = { ...cong };
  nextCong = recordDivisionFinancials(nextCong, 'UNDERGROUND', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_ug_contain_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: 'Parent corporation spillover & PR containment',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      regulatoryScrutiny: nextScrutiny,
      mediaCredibility: Math.min(100, state.mediaCredibility + 5),
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
      underground: appendUndergroundRecord(
        {
          ...state.underground,
          marketConfidencePenaltyPct: nextConfDrag,
          retaliationRiskPct: nextRetRisk,
        },
        state.stepCount,
        'SETTLE',
        'Isolated subsidiary risk from parent conglomerate (+5 Credibility, -10 Heat)',
        'RECOVERY',
        -cost,
        -10,
        5
      ),
    },
    summary: `Contained subsidiary risk spillover for ${formatUsd(cost)}: +5 Parent Credibility, -10 Heat, confidence drag reduced to -${nextConfDrag}%.`,
  };
}

/**
 * Advances Business 6 (Underground Subsidiary) contracts, overhead, and
 * parent-corporation regulatory/reputational spillover. Deterministic & RNG-free.
 */
export function stepUndergroundDivision(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number,
  stepLabel: string
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
  mediaCredibilityDelta: number;
  confidencePenaltyDeltaPct: number;
  alertHit: boolean;
  news: NewsItem[];
  transactions: TransactionEntry[];
} {
  if (!isBusinessActive({ conglomerate: congInput }, 'UNDERGROUND')) {
    return {
      conglomerate: congInput,
      cashDeltaUsd: 0,
      mediaCredibilityDelta: 0,
      confidencePenaltyDeltaPct: 0,
      alertHit: false,
      news: [],
      transactions: [],
    };
  }

  let cong = congInput;
  const div = cong.businesses.UNDERGROUND;
  const ugDiv = cong.undergroundDiv;
  const eff = getUndergroundDivisionEffects({ conglomerate: cong });
  const stage = state.underground.investigationStage ?? 'NONE';
  const scrutiny = state.regulatoryScrutiny;
  const scandalMarks = state.underground.scandalMarks ?? 0;

  let cashDelta = 0;
  let revenueUsd = 0;
  let expenseUsd = 0;
  let mediaCredDelta = 0;
  let confPenaltyDelta = 0;
  let alertHit = false;
  let contractsCompleted = ugDiv.contractsCompleted ?? 0;
  let totalExtracted = ugDiv.totalExtractedUsd ?? 0;
  let spilloverCount = ugDiv.parentRiskSpilloverCount;
  let nextContract = ugDiv.activeContract ?? null;
  let nextRep = div.reputation;
  const news: NewsItem[] = [];
  const transactions: TransactionEntry[] = [];

  // 1. Advance active underground contract with unstable payout profile
  if (nextContract) {
    const rem = nextContract.stepsRemaining - 1;
    if (rem > 0) {
      nextContract = { ...nextContract, stepsRemaining: rem };
    } else {
      // Unstable settlement depends on current heat & sanctions
      let settlementMult = 1.0;
      let outcomeNote = 'clean clearance';
      if (stage === 'SANCTIONED' || scrutiny >= 75) {
        settlementMult = 0.42;
        outcomeNote = 'PARTIAL SEIZURE HAIRCUT (-58% due to active sanctions/heat)';
        alertHit = true;
      } else if (stage === 'FORMAL_AUDIT' || scrutiny >= 50) {
        settlementMult = 0.72;
        outcomeNote = 'regulatory freeze haircut (-28%)';
      }
      const settledUsd = Math.round(nextContract.basePayoutUsd * settlementMult);
      cashDelta += settledUsd;
      revenueUsd += settledUsd;
      contractsCompleted += 1;
      totalExtracted = Number((totalExtracted + settledUsd).toFixed(2));
      if (settlementMult >= 0.99) {
        nextRep = Math.min(100, nextRep + 2);
      }

      news.push({
        id: `news_ug_ctr_done_${nextContract.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Underground Contract Settled: ${nextContract.codeName} (+${formatUsd(settledUsd)})`,
        detail: `Completed with ${outcomeNote}.`,
        category: 'UNDERGROUND',
      });
      transactions.push({
        id: `tx_ug_ctr_done_${nextContract.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'CORPORATE',
        amountUsd: settledUsd,
        description: `Underground division contract settled (${outcomeNote})`,
      });
      nextContract = null;
    }
  }

  // 2. Parent corporation risk spillover when heat / audits escalate
  const highRiskExposure =
    scrutiny >= 65 ||
    stage === 'FORMAL_AUDIT' ||
    stage === 'SANCTIONED' ||
    (scandalMarks >= 2 && scrutiny >= 45);

  if (highRiskExposure) {
    const cadence =
      eff.effectiveShieldPct >= 40 ? 4 : eff.subsidiaryStructured ? 3 : 2;
    if (nextStep % cadence === 0) {
      spilloverCount += 1;
      const legalFeeUsd = Math.round(
        (4_200 + scandalMarks * 1_200 + (stage === 'SANCTIONED' ? 4_000 : 0)) *
          eff.parentSpilloverMult
      );
      const credLoss = Number((2.4 * eff.parentSpilloverMult).toFixed(2));
      const confGain = Number((0.9 * eff.parentSpilloverMult).toFixed(2));

      cashDelta -= legalFeeUsd;
      expenseUsd += legalFeeUsd;
      mediaCredDelta -= credLoss;
      confPenaltyDelta += confGain;
      alertHit = true;

      news.push({
        id: `news_ug_spillover_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Parent Corp Risk Spillover (#${spilloverCount})`,
        detail: `Underground heat (${scrutiny.toFixed(0)}/100, ${stage}) leaked onto parent holding company: -${formatUsd(legalFeeUsd)} legal defense, -${credLoss} credibility (Shield ${eff.effectiveShieldPct}%).`,
        category: 'ALERT',
      });
      transactions.push({
        id: `tx_ug_spillover_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'CORPORATE',
        amountUsd: -legalFeeUsd,
        description: `Parent spillover defense cost (Shield ${eff.effectiveShieldPct}%)`,
      });
    }
  }

  // 3. Routine nominee maintenance overhead
  const nomineeUpkeepUsd = Number((120 * Math.max(1, div.level)).toFixed(2));
  cashDelta -= nomineeUpkeepUsd;
  expenseUsd += nomineeUpkeepUsd;

  cong = {
    ...cong,
    businesses: {
      ...cong.businesses,
      UNDERGROUND: {
        ...div,
        reputation: nextRep,
      },
    },
    undergroundDiv: {
      ...ugDiv,
      activeContract: nextContract,
      contractsCompleted,
      totalExtractedUsd: totalExtracted,
      parentRiskSpilloverCount: spilloverCount,
    },
  };
  cong = recordDivisionFinancials(cong, 'UNDERGROUND', {
    revenueUsd,
    expenseUsd,
    setStepSnapshot: true,
  });

  return {
    conglomerate: cong,
    cashDeltaUsd: Number(cashDelta.toFixed(2)),
    mediaCredibilityDelta: mediaCredDelta,
    confidencePenaltyDeltaPct: confPenaltyDelta,
    alertHit,
    news,
    transactions,
  };
}

export function formatUndergroundDivisionReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses.UNDERGROUND;
  const ugDiv = cong.undergroundDiv;
  const eff = getUndergroundDivisionEffects({ conglomerate: cong });
  const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;
  const active = ugDiv.activeContract;

  return [
    `  BUSINESS 6 // UNDERGROUND SUBSIDIARY — ${div.acquiredCompanyName ?? div.name}`,
    `    Status           : ${div.status}${div.status === 'RECOVERING' ? ` (${div.recoveryStepsRemaining}st left — "corp turnaround underground")` : ` · Div Lv ${div.level}/5 · Eff ${Math.round(div.efficiencyMult * 100)}%`}`,
    `    Shell Firewall   : ${ugDiv.subsidiaryStructured ? 'RING-FENCED SPV' : 'UNSHIELDED'} · Base Shield ${ugDiv.shellSubsidiaryShieldPct}% (Eff ${eff.effectiveShieldPct}% Parent Insulation)`,
    `    Launder & Risk   : +${ugDiv.launderCapacityBonusPct}% Launder Boost · Parent Spillover Incidents: ${ugDiv.parentRiskSpilloverCount}`,
    `    Parent Exposure  : Heat ${state.regulatoryScrutiny.toFixed(0)}/100 · Stage ${state.underground.investigationStage ?? 'NONE'} · Confidence Drag -${(state.underground.marketConfidencePenaltyPct ?? 0).toFixed(1)}%`,
    `    Active Contract  : ${
      active
        ? `${active.codeName} (${active.stepsRemaining}/${active.totalSteps}st · Base ${formatUsd(active.basePayoutUsd)})`
        : `Idle (${ugDiv.contractsCompleted ?? 0} settled · Total Extracted ${formatUsd(ugDiv.totalExtractedUsd ?? 0)})`
    }`,
    `    Division P&L     : Rev ${formatUsd(div.ledger.totalRevenueUsd)} | Exp ${formatUsd(div.ledger.totalExpenseUsd)} | Net ${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`,
    '',
    `  COMMANDS (Early "ops" & "blackmarket" remain active too):`,
    `    ug shield                        Incorporate / harden offshore shell firewall (max 60% base shield)`,
    `    ug contract [escrow|liquidity|pressure]  Launch high-risk, heat-sensitive subsidiary contract`,
    `    ug sweep                         Run corporate accounting audit firewall (-Heat & -30% suspicion)`,
    `    ug contain                       Isolate parent conglomerate from spillover & restore credibility`,
  ].join('\n');
}
