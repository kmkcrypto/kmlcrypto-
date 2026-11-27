import {
  BusinessDivisionState,
  BusinessId,
  ConglomerateState,
  GameState,
  NewsItem,
  SynergyPolicyId,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { resolveBusinessQuery } from './acquisitions';
import { BUSINESS_CATALOG, BUSINESS_ORDER } from './affinity';
import {
  buildDefaultConglomerate,
  isBusinessActive,
  recordDivisionFinancials,
} from './conglomerate';
import {
  getCorporateSynergyEffects,
  getHQLevelSpec,
  isSynergyPrerequisitesMet,
  SYNERGY_POLICIES,
} from './corporate';

export const MAX_DIVISION_LEVEL = 5;

const BASE_DIVISION_UPGRADE_COSTS = [0, 120_000, 320_000, 780_000, 1_800_000] as const;

const DIVISION_COST_SCALE: Record<BusinessId, number> = {
  MINING: 1.0,
  MARKET_INTEL: 0.85,
  HARDWARE_ENG: 1.15,
  MANUFACTURING: 1.25,
  MINING_SERVICES: 0.95,
  UNDERGROUND: 0.9,
};

export function getDivisionUpgradeCost(businessId: BusinessId, currentLevel: number): number {
  if (currentLevel >= MAX_DIVISION_LEVEL) return 0;
  const base = BASE_DIVISION_UPGRADE_COSTS[Math.max(1, Math.min(4, currentLevel))] ?? 1_800_000;
  return Math.round((base * DIVISION_COST_SCALE[businessId]) / 500) * 500;
}

export function upgradeBusinessDivision(
  state: GameState,
  businessQuery: string
): { ok: boolean; nextState: GameState; summary: string } {
  const bizId = resolveBusinessQuery(businessQuery);
  if (!bizId) {
    return {
      ok: false,
      nextState: state,
      summary: `Unknown division "${businessQuery}". Valid: mining, market_intel, hardware_eng, manufacturing, mining_services, underground.`,
    };
  }

  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses[bizId];
  const meta = BUSINESS_CATALOG[bizId];

  if (div.status === 'UNOWNED') {
    return {
      ok: false,
      nextState: state,
      summary: `${meta.name} has not been acquired yet. Run "acquire" at Gen 5+.`,
    };
  }
  if (div.status !== 'ACTIVE') {
    return {
      ok: false,
      nextState: state,
      summary: `${meta.name} is currently ${div.status}. Complete stabilization ("corp turnaround ${meta.shortName.toLowerCase()}") before upgrading.`,
    };
  }
  if (div.level >= MAX_DIVISION_LEVEL) {
    return {
      ok: false,
      nextState: state,
      summary: `${meta.name} is already at maximum Division Level ${MAX_DIVISION_LEVEL}.`,
    };
  }

  const cost = getDivisionUpgradeCost(bizId, div.level);
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Upgrading ${meta.name} to Level ${div.level + 1} requires ${formatUsd(cost)} (have ${formatUsd(state.cash)}).`,
    };
  }

  const nextLevel = div.level + 1;
  const stepLabel = formatStepLabel(state.stepCount);

  const upgradedDiv: BusinessDivisionState = {
    ...div,
    level: nextLevel,
    efficiencyMult: Number((div.efficiencyMult + 0.08).toFixed(2)),
    reputation: Math.min(100, div.reputation + 5),
    staffAssigned: div.staffAssigned + 1,
  };

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      [bizId]: upgradedDiv,
    },
  };

  // Scale division-specific infrastructure alongside executive division level
  if (bizId === 'MARKET_INTEL') {
    nextCong = {
      ...nextCong,
      marketIntel: {
        ...nextCong.marketIntel,
        modelTier: nextLevel,
        predictionAccuracyPct: Math.min(96, nextCong.marketIntel.predictionAccuracyPct + 5),
        activeSubscriptions: nextCong.marketIntel.activeSubscriptions + 1,
      },
    };
  } else if (bizId === 'HARDWARE_ENG') {
    nextCong = {
      ...nextCong,
      hardwareEng: {
        ...nextCong.hardwareEng,
        labTier: nextLevel,
      },
    };
  } else if (bizId === 'MANUFACTURING') {
    nextCong = {
      ...nextCong,
      manufacturing: {
        ...nextCong.manufacturing,
        contractSlots: Math.max(nextCong.manufacturing.contractSlots, nextLevel),
        defectRateMult: Number(Math.max(0.55, 1 - (nextLevel - 1) * 0.1).toFixed(2)),
      },
    };
  } else if (bizId === 'MINING_SERVICES') {
    nextCong = {
      ...nextCong,
      miningServices: {
        ...nextCong.miningServices,
        rentedCapacityKw: nextCong.miningServices.rentedCapacityKw + 25,
        poolFeePct: Number(Math.min(3.5, nextCong.miningServices.poolFeePct + 0.25).toFixed(2)),
      },
    };
  } else if (bizId === 'UNDERGROUND') {
    nextCong = {
      ...nextCong,
      undergroundDiv: {
        ...nextCong.undergroundDiv,
        shellSubsidiaryShieldPct: Math.min(60, nextCong.undergroundDiv.shellSubsidiaryShieldPct + 8),
        launderCapacityBonusPct: nextCong.undergroundDiv.launderCapacityBonusPct + 8,
      },
    };
  }

  nextCong = recordDivisionFinancials(nextCong, bizId, { expenseUsd: cost });

  const tx: TransactionEntry = {
    id: `tx_div_upg_${bizId}_${nextLevel}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Upgraded ${meta.name} division to Level ${nextLevel}`,
  };
  const news: NewsItem = {
    id: `news_div_upg_${bizId}_${nextLevel}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `${meta.name} Upgraded -> Lv ${nextLevel}`,
    detail: `Division efficiency boosted to ${(upgradedDiv.efficiencyMult * 100).toFixed(0)}% (+1 staff, tier capabilities expanded).`,
    category: 'FACILITY',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
    },
    summary: `Upgraded ${meta.name} to Level ${nextLevel} for ${formatUsd(cost)} (Efficiency ${(upgradedDiv.efficiencyMult * 100).toFixed(0)}%, Rep ${upgradedDiv.reputation}).`,
  };
}

export interface CorporateStepContext {
  stepMiningUsd: number;
  enabledRigsCount: number;
  fabQueueActive: boolean;
  isCycleBillingStep: boolean;
}

/**
 * Advances Corporate HQ upkeep, synergy transfer-credit ledgers, and policy pruning each step.
 * Deterministic and RNG-free.
 */
export function stepCorporateAndSynergies(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number,
  stepLabel: string,
  context: CorporateStepContext
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
  billsAddedUsd: number;
  news: NewsItem[];
  transactions: TransactionEntry[];
} {
  let cong = congInput;
  const news: NewsItem[] = [];
  const transactions: TransactionEntry[] = [];
  let cashDeltaUsd = 0;
  let billsAddedUsd = 0;

  // Prune any active synergy whose division requirements fell out of ACTIVE status
  if (cong.hq.established && cong.hq.activeSynergies.length > 0) {
    const kept: SynergyPolicyId[] = [];
    for (const pid of cong.hq.activeSynergies) {
      const check = isSynergyPrerequisitesMet({ conglomerate: cong }, pid);
      if (check.met) {
        kept.push(pid);
      } else {
        news.push({
          id: `news_syn_paused_${pid}_${nextStep}`,
          step: nextStep,
          stepLabel,
          title: `Synergy Paused: ${SYNERGY_POLICIES[pid].name}`,
          detail: check.reason ?? 'Prerequisite division is no longer active.',
          category: 'ALERT',
        });
      }
    }
    if (kept.length !== cong.hq.activeSynergies.length) {
      cong = {
        ...cong,
        hq: {
          ...cong.hq,
          activeSynergies: kept,
        },
      };
    }
  }

  const effects = getCorporateSynergyEffects({ conglomerate: cong });
  let stepSynergyRealizedUsd = 0;

  if (effects.hqEstablished) {
    // INTEL_TO_MINING: internal advisory credit proportional to realized auto-sell lift
    if (effects.activePolicyIds.includes('INTEL_TO_MINING') && context.stepMiningUsd > 0) {
      const baseWithoutIntel = context.stepMiningUsd / (1 + effects.miningAutoSellBonusPct);
      const liftUsd = Math.max(0, context.stepMiningUsd - baseWithoutIntel);
      if (liftUsd > 0.01) {
        cong = recordDivisionFinancials(cong, 'MARKET_INTEL', { internalCreditUsd: liftUsd });
        stepSynergyRealizedUsd += liftUsd;
      }
    }

    // INTEL_TO_TREASURY: real modest treasury routing/execution alpha for active Market Intel desk
    if (effects.activePolicyIds.includes('INTEL_TO_TREASURY')) {
      const intelDiv = cong.businesses.MARKET_INTEL;
      const accuracyFactor = cong.marketIntel.predictionAccuracyPct / 100;
      const treasuryAlphaUsd = Number(
        (85 * intelDiv.level * intelDiv.efficiencyMult * accuracyFactor).toFixed(2)
      );
      if (treasuryAlphaUsd > 0) {
        cashDeltaUsd += treasuryAlphaUsd;
        cong = recordDivisionFinancials(cong, 'MARKET_INTEL', { revenueUsd: treasuryAlphaUsd });
        stepSynergyRealizedUsd += treasuryAlphaUsd;
      }
    }

    // MFG_TO_MINING: internal fleet hardware/wear mitigation credit
    if (effects.activePolicyIds.includes('MFG_TO_MINING') && context.enabledRigsCount > 0) {
      const mfgDiv = cong.businesses.MANUFACTURING;
      const supplyCredit = Number((context.enabledRigsCount * 14 * mfgDiv.efficiencyMult).toFixed(2));
      cong = recordDivisionFinancials(cong, 'MANUFACTURING', { internalCreditUsd: supplyCredit });
      stepSynergyRealizedUsd += supplyCredit;
    }

    // ENG_TO_MFG: internal IP co-design credit when wafer lines are actively running
    if (effects.activePolicyIds.includes('ENG_TO_MFG') && context.fabQueueActive) {
      const engDiv = cong.businesses.HARDWARE_ENG;
      const ipCredit = Number((95 * engDiv.level * engDiv.efficiencyMult).toFixed(2));
      cong = recordDivisionFinancials(cong, 'HARDWARE_ENG', { internalCreditUsd: ipCredit });
      stepSynergyRealizedUsd += ipCredit;
    }

    // MFG_TO_SERVICES: internal colocation rack credit when Mining Services is active
    if (effects.activePolicyIds.includes('MFG_TO_SERVICES') && isBusinessActive({ conglomerate: cong }, 'MINING_SERVICES')) {
      const mfgDiv = cong.businesses.MANUFACTURING;
      const rackCredit = Number((40 * mfgDiv.level * mfgDiv.efficiencyMult).toFixed(2));
      cong = recordDivisionFinancials(cong, 'MANUFACTURING', { internalCreditUsd: rackCredit });
      stepSynergyRealizedUsd += rackCredit;
    }

    // Cycle HQ executive governance upkeep
    if (context.isCycleBillingStep) {
      const hqSpec = getHQLevelSpec(cong.hq.hqLevel);
      const upkeep = hqSpec.cycleUpkeepUsd;
      if (upkeep > 0) {
        cashDeltaUsd -= upkeep;
        billsAddedUsd += upkeep;
        cong = recordDivisionFinancials(cong, 'MINING', { expenseUsd: upkeep });
        transactions.push({
          id: `tx_hq_upkeep_${nextStep}`,
          step: nextStep,
          stepLabel,
          category: 'CORPORATE',
          amountUsd: -upkeep,
          description: `HQ Level ${hqSpec.level} governance & audit upkeep`,
        });
      }
    }

    if (stepSynergyRealizedUsd > 0 || context.isCycleBillingStep) {
      cong = {
        ...cong,
        hq: {
          ...cong.hq,
          totalSynergyValueUsd: Number((cong.hq.totalSynergyValueUsd + stepSynergyRealizedUsd).toFixed(2)),
          lastConsolidatedStep: nextStep,
        },
      };
    }
  }

  return {
    conglomerate: cong,
    cashDeltaUsd,
    billsAddedUsd,
    news,
    transactions,
  };
}

export function formatDivisionLedgerReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  let grandRev = 0;
  let grandExp = 0;
  let grandCredits = 0;

  const rows = BUSINESS_ORDER.map((id) => {
    const div = cong.businesses[id];
    const meta = BUSINESS_CATALOG[id];
    const l = div.ledger;
    const netCash = l.totalRevenueUsd - l.totalExpenseUsd;
    grandRev += l.totalRevenueUsd;
    grandExp += l.totalExpenseUsd;
    grandCredits += l.totalInternalCreditsUsd;

    const status =
      div.status === 'ACTIVE'
        ? `ACTIVE Lv${div.level}`
        : div.status === 'RECOVERING'
        ? `RECOV (${div.recoveryStepsRemaining}st)`
        : 'UNOWNED';

    if (div.status === 'UNOWNED') {
      return `  ${meta.code} ${meta.shortName.padEnd(11)} ${status.padEnd(12)}   -`;
    }

    const upgCost = div.level < MAX_DIVISION_LEVEL ? formatUsd(getDivisionUpgradeCost(id, div.level)) : 'MAX';
    return [
      `  ${meta.code} ${meta.shortName.padEnd(11)} ${status.padEnd(12)} Eff:${Math.round(div.efficiencyMult * 100)}% Staff:${div.staffAssigned} NextUpg:${upgCost}`,
      `       Cash Rev: ${formatUsd(l.totalRevenueUsd).padStart(10)} | Cash Exp: ${formatUsd(l.totalExpenseUsd).padStart(10)} | Net: ${(netCash >= 0 ? '+' : '') + formatUsd(netCash)} | Syn Credits: +${formatUsd(l.totalInternalCreditsUsd)}`,
    ].join('\n');
  });

  const grandNet = grandRev - grandExp;
  return [
    `  CONSOLIDATED DIVISION P&L LEDGER — ${cong.hq.companyName}`,
    `  Shared Treasury Cash: ${formatUsd(state.cash)} · HQ Level: ${cong.hq.established ? cong.hq.hqLevel : 0}`,
    '',
    ...rows,
    '',
    `  CONSOLIDATED TOTALS: Cash Rev ${formatUsd(grandRev)} | Cash Exp ${formatUsd(grandExp)} | Net ${(grandNet >= 0 ? '+' : '') + formatUsd(grandNet)} | Internal Synergies ${formatUsd(grandCredits)}`,
    `  COMMAND: "corp upgrade <division>" | "hq" | "hq synergy"`,
  ].join('\n');
}
