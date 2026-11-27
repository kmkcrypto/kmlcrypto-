import {
  ConglomerateState,
  GameState,
  ManufacturingOemContract,
  NewsItem,
  PartCategory,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import {
  buildDefaultConglomerate,
  isBusinessActive,
  isBusinessOwned,
  recordDivisionFinancials,
} from './conglomerate';
import { getCorporateSynergyEffects } from './corporate';

const VALID_OEM_CATEGORIES: PartCategory[] = [
  'compute',
  'gpu',
  'chassis',
  'storage',
  'psu',
  'cooling',
  'os',
];

const OEM_SPECS: Record<
  PartCategory,
  { clientName: string; unitMatUsd: number; unitSaleUsd: number; baseSteps: number }
> = {
  compute: { clientName: 'Helios Hashworks', unitMatUsd: 3_600, unitSaleUsd: 5_900, baseSteps: 4 },
  gpu: { clientName: 'Vortex Compute Syndicate', unitMatUsd: 2_800, unitSaleUsd: 4_550, baseSteps: 4 },
  chassis: { clientName: 'Nordic Colocation Group', unitMatUsd: 1_900, unitSaleUsd: 3_150, baseSteps: 3 },
  storage: { clientName: 'Chronos Archive Cloud', unitMatUsd: 2_100, unitSaleUsd: 3_450, baseSteps: 3 },
  psu: { clientName: 'VoltEdge Industrial Grid', unitMatUsd: 1_650, unitSaleUsd: 2_750, baseSteps: 3 },
  cooling: { clientName: 'CryoBay Thermal Labs', unitMatUsd: 1_850, unitSaleUsd: 3_050, baseSteps: 3 },
  os: { clientName: 'Baremetal Kernel Partners', unitMatUsd: 1_200, unitSaleUsd: 2_100, baseSteps: 2 },
};

function requireActiveManufacturing(state: GameState): {
  ok: boolean;
  reason?: string;
  cong: ConglomerateState;
} {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!isBusinessOwned({ conglomerate: cong }, 'MANUFACTURING')) {
    return {
      ok: false,
      cong,
      reason: 'Manufacturing division is not owned yet. Reach Gen 5+ and acquire it via "acquire".',
    };
  }
  if (!isBusinessActive({ conglomerate: cong }, 'MANUFACTURING')) {
    const div = cong.businesses.MANUFACTURING;
    return {
      ok: false,
      cong,
      reason: `Manufacturing (${div.acquiredCompanyName ?? div.name}) is RECOVERING (${div.recoveryStepsRemaining}st left). Fund stabilization with "corp turnaround manufacturing".`,
    };
  }
  return { ok: true, cong };
}

export interface ManufacturingFabEffects {
  active: boolean;
  level: number;
  maxFabLines: number;
  maxBatchQty: number;
  defectRateMult: number;
  contractSlots: number;
}

export function getManufacturingFabEffects(
  state: Pick<GameState, 'conglomerate'>
): ManufacturingFabEffects {
  if (!isBusinessActive(state, 'MANUFACTURING')) {
    return {
      active: false,
      level: 1,
      maxFabLines: 3,
      maxBatchQty: 20,
      defectRateMult: 1,
      contractSlots: 1,
    };
  }
  const cong = state.conglomerate!;
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;
  return {
    active: true,
    level: div.level,
    maxFabLines: div.level >= 3 ? 5 : 4,
    maxBatchQty: 40,
    defectRateMult: mfg.defectRateMult,
    contractSlots: mfg.contractSlots,
  };
}

export function startOemManufacturingContract(
  state: GameState,
  categoryRaw?: string,
  qty = 4
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveManufacturing(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;
  const activeContracts = mfg.activeOemContracts ?? [];

  if (activeContracts.length >= mfg.contractSlots) {
    return {
      ok: false,
      nextState: state,
      summary: `OEM contract pipeline full (${activeContracts.length}/${mfg.contractSlots} slots). Wait for completion or run "corp upgrade manufacturing".`,
    };
  }

  const normalized = (categoryRaw ?? 'compute').trim().toLowerCase() as PartCategory;
  const partCategory: PartCategory = VALID_OEM_CATEGORIES.includes(normalized)
    ? normalized
    : 'compute';
  const spec = OEM_SPECS[partCategory];
  const cleanQty = Math.max(2, Math.min(12, Math.floor(qty)));

  const materialCost = Math.round(spec.unitMatUsd * cleanQty * (0.9 + mfg.defectRateMult * 0.1));
  if (state.cash < materialCost) {
    return {
      ok: false,
      nextState: state,
      summary: `OEM wafer/component materials for ${cleanQty}x ${partCategory.toUpperCase()} cost ${formatUsd(materialCost)}.`,
    };
  }

  const effects = getCorporateSynergyEffects({ conglomerate: cong });
  const engBonus = effects.activePolicyIds.includes('ENG_TO_MFG') ? 1.08 : 1.0;
  const payoutUsd = Math.round(
    spec.unitSaleUsd * cleanQty * (0.9 + div.level * 0.08) * div.efficiencyMult * engBonus
  );
  const totalSteps = Math.max(2, spec.baseSteps + Math.floor(cleanQty / 4));

  const contract: ManufacturingOemContract = {
    id: `oem_${state.stepCount}_${activeContracts.length + 1}`,
    clientName: spec.clientName,
    partCategory,
    qty: cleanQty,
    stepsRemaining: totalSteps,
    totalSteps,
    payoutUsd,
  };

  let nextCong: ConglomerateState = {
    ...cong,
    manufacturing: {
      ...mfg,
      activeOemContracts: [...activeContracts, contract],
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MANUFACTURING', { expenseUsd: materialCost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_mfg_oem_start_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -materialCost,
    description: `OEM production run: ${cleanQty}x ${partCategory.toUpperCase()} for ${spec.clientName}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - materialCost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + materialCost,
      },
    },
    summary: `Accepted OEM contract for ${spec.clientName} (${cleanQty}x ${partCategory.toUpperCase()}) · Material cost ${formatUsd(materialCost)}, Contract payout ${formatUsd(payoutUsd)} in ${totalSteps} work steps.`,
  };
}

export function fulfillOemOrderFromInventory(
  state: GameState,
  invIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveManufacturing(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const fab = state.fab;
  const item = fab?.inventory?.[invIdx];
  if (!fab || !item || item.qty <= 0) {
    return {
      ok: false,
      nextState: state,
      summary: `Foundry inventory lot #${invIdx + 1} not found.`,
    };
  }

  const cong = gate.cong;
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;

  const shipQty = Math.min(item.qty, 5);
  const contractPremium = 1.16 + Math.min(0.14, (div.level - 1) * 0.035);
  const revenueUsd = Math.round(item.wholesaleValueUsd * shipQty * contractPremium * div.efficiencyMult);
  const shippedSerials = new Set((item.serialNumbers ?? []).slice(0, shipQty));

  const nextInventory = fab.inventory
    .map((entry, idx) =>
      idx === invIdx
        ? {
            ...entry,
            qty: entry.qty - shipQty,
            serialNumbers: (entry.serialNumbers ?? []).slice(shipQty),
          }
        : entry
    )
    .filter((entry) => entry.qty > 0);

  const nextSerialRegistry =
    shippedSerials.size > 0
      ? (fab.serialRegistry ?? []).map((sr) =>
          shippedSerials.has(sr.serialNumber)
            ? {
                ...sr,
                status: 'EXPORTED' as const,
                history: [...sr.history, `${formatStepLabel(state.stepCount)}: Shipped via OEM Contract`],
              }
            : sr
        )
      : fab.serialRegistry;

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MANUFACTURING: {
        ...div,
        reputation: Math.min(100, div.reputation + 2),
      },
    },
    manufacturing: {
      ...mfg,
      oemContractsCompleted: mfg.oemContractsCompleted + 1,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MANUFACTURING', { revenueUsd });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_mfg_fulfill_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: revenueUsd,
    description: `OEM inventory contract fulfillment: ${shipQty}x "${item.name}"`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + revenueUsd,
      fab: {
        ...fab,
        inventory: nextInventory,
        serialRegistry: nextSerialRegistry,
        totalExportRevenueUsd: fab.totalExportRevenueUsd + revenueUsd,
      },
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Shipped ${shipQty}x "${item.name}" to OEM buyer (+${Math.round((contractPremium - 1) * 100)}% contract margin) for +${formatUsd(revenueUsd)}!`,
  };
}

export function fulfillInternalSupplyOrder(
  state: GameState,
  targetRaw?: string
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveManufacturing(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;

  const cooldown = 4;
  if (
    typeof mfg.lastInternalSupplyStep === 'number' &&
    state.stepCount - mfg.lastInternalSupplyStep < cooldown
  ) {
    const rem = cooldown - (state.stepCount - mfg.lastInternalSupplyStep);
    return {
      ok: false,
      nextState: state,
      summary: `Internal corporate supply staging cooling down (${rem} step${rem === 1 ? '' : 's'} remaining).`,
    };
  }

  const norm = (targetRaw ?? 'mining').trim().toLowerCase();
  const target: 'MINING' | 'MINING_SERVICES' =
    norm.includes('service') || norm === 'srv' || norm === 'b5' ? 'MINING_SERVICES' : 'MINING';

  if (target === 'MINING_SERVICES' && !isBusinessActive({ conglomerate: cong }, 'MINING_SERVICES')) {
    return {
      ok: false,
      nextState: state,
      summary: 'Mining Services division must be owned & ACTIVE to receive internal rack deliveries.',
    };
  }

  const materialExpenseUsd = target === 'MINING' ? 7_500 : 8_500;
  const internalTransferValueUsd = Math.round(
    (target === 'MINING' ? 14_500 : 16_000) * div.efficiencyMult
  );
  if (state.cash < materialExpenseUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `Internal supply order raw materials cost ${formatUsd(materialExpenseUsd)}.`,
    };
  }

  let nextRigs = state.rigs;
  let nextCong: ConglomerateState = {
    ...cong,
    manufacturing: {
      ...mfg,
      internalSupplyOrdersFilled: mfg.internalSupplyOrdersFilled + 1,
      lastInternalSupplyStep: state.stepCount,
    },
  };

  let detailSummary = '';
  if (target === 'MINING') {
    nextRigs = state.rigs.map((r) => {
      if (!r.enabled || r.status === 'FAILED') return r;
      const comp = r.componentHealth;
      const lift = (v: number) => Math.min(100, Number((v + 10).toFixed(1)));
      const nextComp = comp
        ? {
            chassis: lift(comp.chassis),
            compute: lift(comp.compute),
            gpus: comp.gpus.map(lift),
            storage: lift(comp.storage),
            psu: lift(comp.psu),
            cooling: lift(comp.cooling),
          }
        : undefined;
      return {
        ...r,
        healthPct: Math.min(100, Number((r.healthPct + 10).toFixed(1))),
        ...(nextComp ? { componentHealth: nextComp } : {}),
        pasteStepsRemaining: Math.min(20, (r.pasteStepsRemaining ?? 8) + 5),
      };
    });
    detailSummary = `Supplied replacement modules to Mining fleet (+10% component health & +5 paste steps on active rigs)`;
  } else {
    nextCong = {
      ...nextCong,
      miningServices: {
        ...nextCong.miningServices,
        rentedCapacityKw: nextCong.miningServices.rentedCapacityKw + 12,
        slaCompliancePct: Number(Math.min(100, nextCong.miningServices.slaCompliancePct + 6).toFixed(1)),
      },
    };
    detailSummary = `Delivered turnkey colocation racks to Mining Services (+12 kW rack capacity & +6% SLA compliance)`;
  }

  nextCong = recordDivisionFinancials(nextCong, 'MANUFACTURING', {
    expenseUsd: materialExpenseUsd,
    internalCreditUsd: internalTransferValueUsd,
  });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_mfg_supply_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -materialExpenseUsd,
    description: `Internal supply order -> ${target === 'MINING' ? 'Mining Fleet' : 'Mining Services'}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - materialExpenseUsd,
      rigs: nextRigs,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + materialExpenseUsd,
      },
    },
    summary: `${detailSummary}. Material spend: ${formatUsd(materialExpenseUsd)} (Internal synergy credit: +${formatUsd(internalTransferValueUsd)}).`,
  };
}

export function runManufacturingQcAudit(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveManufacturing(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const mfg = cong.manufacturing;
  const div = cong.businesses.MANUFACTURING;

  if (mfg.defectRateMult <= 0.46) {
    return {
      ok: false,
      nextState: state,
      summary: `Cleanroom QC calibration is already near theoretical zero-defect limits (Defect Mult ${mfg.defectRateMult.toFixed(2)}x).`,
    };
  }

  const cost = 6_500;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `ISO cleanroom metrology & QC calibration costs ${formatUsd(cost)}.`,
    };
  }

  const nextDefectMult = Number(Math.max(0.45, mfg.defectRateMult - 0.08).toFixed(2));
  const nextQcScore = Math.min(100, (mfg.qcAuditScorePct ?? 82) + 4);
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MANUFACTURING: {
        ...div,
        reputation: Math.min(100, div.reputation + 1),
      },
    },
    manufacturing: {
      ...mfg,
      defectRateMult: nextDefectMult,
      qcAuditScorePct: nextQcScore,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MANUFACTURING', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_mfg_qc_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Manufacturing cleanroom QC calibration (Defect ${nextDefectMult.toFixed(2)}x)`,
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
    },
    summary: `Calibrated Manufacturing QC metrology for ${formatUsd(cost)} -> Defect Mult ${nextDefectMult.toFixed(2)}x (ISO Audit ${nextQcScore}%).`,
  };
}

/**
 * Advances active external OEM wafer contracts & Manufacturing division overhead cleanly.
 * Deterministic and RNG-free.
 */
export function stepManufacturingDivision(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number,
  stepLabel: string
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
  news: NewsItem[];
  transactions: TransactionEntry[];
} {
  if (!isBusinessActive({ conglomerate: congInput }, 'MANUFACTURING')) {
    return { conglomerate: congInput, cashDeltaUsd: 0, news: [], transactions: [] };
  }

  let cong = congInput;
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;
  const active = mfg.activeOemContracts ?? [];

  const remaining: ManufacturingOemContract[] = [];
  let completedRevUsd = 0;
  let completedCount = 0;
  const news: NewsItem[] = [];
  const transactions: TransactionEntry[] = [];

  const speed = 1 + (div.level >= 4 ? 1 : 0);
  for (const ord of active) {
    const rem = ord.stepsRemaining - speed;
    if (rem > 0) {
      remaining.push({ ...ord, stepsRemaining: rem });
    } else {
      completedRevUsd += ord.payoutUsd;
      completedCount += 1;
      news.push({
        id: `news_mfg_oem_done_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `OEM Contract Delivered: ${ord.clientName} (+${formatUsd(ord.payoutUsd)})`,
        detail: `Delivered ${ord.qty}x ${ord.partCategory.toUpperCase()} wafer units cleanly.`,
        category: 'FACILITY',
      });
      transactions.push({
        id: `tx_mfg_oem_done_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'CORPORATE',
        amountUsd: ord.payoutUsd,
        description: `OEM Contract settled: ${ord.clientName} (${ord.qty}x ${ord.partCategory})`,
      });
    }
  }

  const slotOverheadUsd = Number((110 * Math.max(1, mfg.contractSlots)).toFixed(2));
  const netCash = Number((completedRevUsd - slotOverheadUsd).toFixed(2));

  cong = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MANUFACTURING: {
        ...div,
        reputation: Math.min(100, div.reputation + completedCount),
      },
    },
    manufacturing: {
      ...mfg,
      oemContractsCompleted: mfg.oemContractsCompleted + completedCount,
      activeOemContracts: remaining,
    },
  };
  cong = recordDivisionFinancials(cong, 'MANUFACTURING', {
    revenueUsd: completedRevUsd,
    expenseUsd: slotOverheadUsd,
    setStepSnapshot: true,
  });

  return {
    conglomerate: cong,
    cashDeltaUsd: netCash,
    news,
    transactions,
  };
}

export function formatManufacturingDivisionReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses.MANUFACTURING;
  const mfg = cong.manufacturing;
  const fx = getManufacturingFabEffects({ conglomerate: cong });
  const active = mfg.activeOemContracts ?? [];
  const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;

  return [
    `  BUSINESS 4 // MANUFACTURING — ${div.acquiredCompanyName ?? div.name}`,
    `    Status          : ${div.status}${div.status === 'RECOVERING' ? ` (${div.recoveryStepsRemaining}st left — "corp turnaround manufacturing")` : ` · Div Lv ${div.level}/5 · Eff ${Math.round(div.efficiencyMult * 100)}%`}`,
    `    Cleanroom Scale : Max Fab Lines ${fx.maxFabLines} (Online: ${state.fab?.linesCount ?? 0}) · Max Batch Qty: ${fx.maxBatchQty}`,
    `    Quality Control : Defect Mult ${mfg.defectRateMult.toFixed(2)}x · ISO QC Score ${mfg.qcAuditScorePct ?? 82}%`,
    `    OEM Contracts   : ${active.length}/${mfg.contractSlots} active · ${mfg.oemContractsCompleted} completed · Internal Supply Orders: ${mfg.internalSupplyOrdersFilled}`,
    ...(active.length > 0
      ? active.map(
          (o, idx) =>
            `      #${idx + 1} ${o.clientName} — ${o.qty}x ${o.partCategory.toUpperCase()} (${o.stepsRemaining}/${o.totalSteps}st · Payout ${formatUsd(o.payoutUsd)})`
        )
      : ['      (No active OEM wafer orders queued)']),
    `    Division P&L    : Rev ${formatUsd(div.ledger.totalRevenueUsd)} | Exp ${formatUsd(div.ledger.totalExpenseUsd)} | Syn Credits +${formatUsd(div.ledger.totalInternalCreditsUsd)} | Net ${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`,
    '',
    `  COMMANDS:`,
    `    mfg oem start [cat] [qty]   Accept external OEM manufacturing order`,
    `    mfg oem fulfill <inv#>      Ship finished foundry inventory lot at OEM premium`,
    `    mfg supply <mining|services>  Deliver internal replacement hardware/racks`,
    `    mfg qc                      Run cleanroom metrology calibration (-0.08x defect mult)`,
  ].join('\n');
}
