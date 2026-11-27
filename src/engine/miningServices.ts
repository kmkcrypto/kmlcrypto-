import {
  ConglomerateState,
  GameState,
  MiningServicesDivisionState,
  NewsItem,
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

const KW_PER_HOSTED_CLIENT = 18;
const KW_PER_COMPUTE_LEASE = 12;
const HOSTING_CAPEX_PER_KW_USD = 650;

function requireActiveMiningServices(state: GameState): {
  ok: boolean;
  reason?: string;
  cong: ConglomerateState;
} {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!isBusinessOwned({ conglomerate: cong }, 'MINING_SERVICES')) {
    return {
      ok: false,
      cong,
      reason: 'Mining Services division is not owned yet. Reach Gen 5+ and acquire it via "acquire".',
    };
  }
  if (!isBusinessActive({ conglomerate: cong }, 'MINING_SERVICES')) {
    const div = cong.businesses.MINING_SERVICES;
    return {
      ok: false,
      cong,
      reason: `Mining Services (${div.acquiredCompanyName ?? div.name}) is RECOVERING (${div.recoveryStepsRemaining}st left). Fund stabilization with "corp turnaround services".`,
    };
  }
  return { ok: true, cong };
}

export function getAllocatedHostingKw(ms: MiningServicesDivisionState): number {
  return (
    ms.hostedClientsCount * KW_PER_HOSTED_CLIENT +
    (ms.activeComputeLeases ?? 0) * KW_PER_COMPUTE_LEASE
  );
}

export function getMaxHostedClients(divLevel: number, rentedCapacityKw: number): number {
  const byKw = Math.floor(rentedCapacityKw / KW_PER_HOSTED_CLIENT);
  const byLevel = 2 + divLevel * 3;
  return Math.min(byKw, byLevel);
}

export function toggleCommercialPool(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const nextActive = !cong.miningServices.poolOperatorActive;

  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        miningServices: {
          ...cong.miningServices,
          poolOperatorActive: nextActive,
        },
      },
    },
    summary: nextActive
      ? `Commercial Mining Pool ONLINE (Pool Fee: ${cong.miningServices.poolFeePct.toFixed(2)}%).`
      : 'Commercial Mining Pool paused cleanly.',
  };
}

export function setCommercialPoolFee(
  state: GameState,
  feePct: number
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  if (!Number.isFinite(feePct) || feePct < 0.25 || feePct > 5.0) {
    return {
      ok: false,
      nextState: state,
      summary: 'Commercial pool fee must be between 0.25% and 5.00%.',
    };
  }
  const cleanFee = Number(feePct.toFixed(2));
  const cong = gate.cong;

  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        miningServices: {
          ...cong.miningServices,
          poolFeePct: cleanFee,
        },
      },
    },
    summary: `Set commercial pool fee to ${cleanFee.toFixed(2)}%${cleanFee > 3.0 ? ' (warning: fees above 3.0% reduce external miner hash inflow)' : ' (competitive institutional band)'}.`,
  };
}

export function expandHostingInfrastructure(
  state: GameState,
  addKw = 50
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cleanKw = Math.max(10, Math.min(500, Math.round(addKw)));
  const cost = cleanKw * HOSTING_CAPEX_PER_KW_USD;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Provisioning +${cleanKw} kW colocation infrastructure costs ${formatUsd(cost)}.`,
    };
  }

  const cong = gate.cong;
  const nextKw = cong.miningServices.rentedCapacityKw + cleanKw;
  let nextCong: ConglomerateState = {
    ...cong,
    miningServices: {
      ...cong.miningServices,
      rentedCapacityKw: nextKw,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MINING_SERVICES', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_srv_kw_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Provisioned +${cleanKw} kW Mining Services colocation racks`,
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
    summary: `Expanded Mining Services colocation capacity by +${cleanKw} kW for ${formatUsd(cost)} (Total: ${nextKw} kW).`,
  };
}

export function onboardHostingClient(
  state: GameState,
  count = 1
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const div = cong.businesses.MINING_SERVICES;
  const ms = cong.miningServices;
  const maxClients = getMaxHostedClients(div.level, ms.rentedCapacityKw);
  const freeKw = Math.max(0, ms.rentedCapacityKw - getAllocatedHostingKw(ms));

  if (freeKw < KW_PER_HOSTED_CLIENT || ms.hostedClientsCount >= maxClients) {
    return {
      ok: false,
      nextState: state,
      summary: `Colocation racks full (${ms.hostedClientsCount}/${maxClients} clients · ${freeKw} kW free). Run "services expand 50" or "corp upgrade services".`,
    };
  }

  const maxByFreeKw = Math.floor(freeKw / KW_PER_HOSTED_CLIENT);
  const addClients = Math.max(1, Math.min(count, maxClients - ms.hostedClientsCount, maxByFreeKw));
  const setupCost = addClients * 4_500;
  if (state.cash < setupCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Rack provisioning for ${addClients} client(s) requires ${formatUsd(setupCost)}.`,
    };
  }

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MINING_SERVICES: {
        ...div,
        reputation: Math.min(100, div.reputation + addClients),
      },
    },
    miningServices: {
      ...ms,
      hostedClientsCount: ms.hostedClientsCount + addClients,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MINING_SERVICES', { expenseUsd: setupCost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_srv_client_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -setupCost,
    description: `Onboarded ${addClients} colocation hosting tenant(s)`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - setupCost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + setupCost,
      },
    },
    summary: `Signed +${addClients} hosting tenant(s) for ${formatUsd(setupCost)} rack setup (${ms.hostedClientsCount + addClients}/${maxClients} active clients).`,
  };
}

export function dropHostingClient(
  state: GameState,
  count = 1
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const ms = cong.miningServices;
  if (ms.hostedClientsCount <= 0) {
    return { ok: false, nextState: state, summary: 'No active colocation clients to offboard.' };
  }
  const drop = Math.max(1, Math.min(ms.hostedClientsCount, Math.floor(count)));
  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        miningServices: {
          ...ms,
          hostedClientsCount: ms.hostedClientsCount - drop,
        },
      },
    },
    summary: `Offboarded ${drop} colocation client(s), freeing ${drop * KW_PER_HOSTED_CLIENT} kW of rack capacity.`,
  };
}

export function leaseComputeCapacity(
  state: GameState,
  units = 1
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const ms = cong.miningServices;
  const div = cong.businesses.MINING_SERVICES;
  const freeKw = Math.max(0, ms.rentedCapacityKw - getAllocatedHostingKw(ms));
  const maxUnits = Math.floor(freeKw / KW_PER_COMPUTE_LEASE);
  if (maxUnits < 1) {
    return {
      ok: false,
      nextState: state,
      summary: `Not enough spare rack capacity (${freeKw} kW free, need ${KW_PER_COMPUTE_LEASE} kW per compute lease). Run "services expand" or drop a client.`,
    };
  }
  const cleanUnits = Math.max(1, Math.min(maxUnits, Math.floor(units)));
  const setupCost = cleanUnits * 2_200;
  if (state.cash < setupCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Compute cluster provisioning (${cleanUnits} unit(s)) requires ${formatUsd(setupCost)}.`,
    };
  }

  const totalLeases = (ms.activeComputeLeases ?? 0) + cleanUnits;
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MINING_SERVICES: {
        ...div,
        reputation: Math.min(100, div.reputation + 1),
      },
    },
    miningServices: {
      ...ms,
      activeComputeLeases: totalLeases,
      computeLeaseStepsRemaining: Math.max(ms.computeLeaseStepsRemaining ?? 0, 12),
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MINING_SERVICES', { expenseUsd: setupCost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_srv_lease_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -setupCost,
    description: `Provisioned ${cleanUnits}x 12-step Compute Rental contract(s)`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - setupCost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + setupCost,
      },
    },
    summary: `Leased +${cleanUnits} compute rental pod(s) (${cleanUnits * KW_PER_COMPUTE_LEASE} kW) for 12 steps (setup ${formatUsd(setupCost)}).`,
  };
}

export function performServicesSlaAudit(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMiningServices(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const ms = cong.miningServices;
  if (ms.slaCompliancePct >= 99.5) {
    return {
      ok: false,
      nextState: state,
      summary: `SLA compliance is already optimal at ${ms.slaCompliancePct.toFixed(1)}%.`,
    };
  }
  const cost = 4_500;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Emergency SLA remediation costs ${formatUsd(cost)}.`,
    };
  }

  const nextSla = Number(Math.min(100, ms.slaCompliancePct + 18).toFixed(1));
  let nextCong: ConglomerateState = {
    ...cong,
    miningServices: {
      ...ms,
      slaCompliancePct: nextSla,
      lastHostingMaintStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MINING_SERVICES', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_srv_sla_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: 'Mining Services SLA compliance remediation',
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
    summary: `Completed SLA remediation for ${formatUsd(cost)} — SLA Compliance restored to ${nextSla}%.`,
  };
}

export interface MiningServicesStepContext {
  breakerOverloaded: boolean;
  facilityRate: number;
  strikeStepsRemaining: number;
}

/**
 * Advances commercial pool revenue, hosted colocation contracts, compute leases & SLA tracking.
 * Deterministic and RNG-free.
 */
export function stepMiningServicesDivision(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number,
  stepLabel: string,
  context: MiningServicesStepContext
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
  news: NewsItem[];
} {
  if (!isBusinessActive({ conglomerate: congInput }, 'MINING_SERVICES')) {
    return { conglomerate: congInput, cashDeltaUsd: 0, news: [] };
  }

  let cong = congInput;
  const div = cong.businesses.MINING_SERVICES;
  const ms = cong.miningServices;
  const effects = getCorporateSynergyEffects({ conglomerate: cong });
  const news: NewsItem[] = [];

  // SLA compliance responds to breaker health, strikes, and MFG_TO_SERVICES rack resilience
  const hasMfgResilience = effects.activePolicyIds.includes('MFG_TO_SERVICES');
  let nextSla = ms.slaCompliancePct;
  if (context.breakerOverloaded || context.strikeStepsRemaining > 0) {
    nextSla = Math.max(45, nextSla - (hasMfgResilience ? 2.0 : 3.5));
  } else {
    nextSla = Math.min(100, nextSla + (hasMfgResilience ? 1.5 : 0.8));
  }
  nextSla = Number(nextSla.toFixed(1));
  const slaMult = Math.max(0.45, nextSla / 100);
  const serviceMarginMult = 1 + effects.servicesMarginBonusPct;

  // 1. Commercial Mining Pool
  let poolRevenue = 0;
  let poolCost = 0;
  if (ms.poolOperatorActive) {
    const feeCompetitiveness =
      ms.poolFeePct <= 3.0 ? 1.0 : Math.max(0.4, 1 - (ms.poolFeePct - 3.0) * 0.28);
    const credibilityFactor = 0.7 + state.mediaCredibility / 140;
    poolRevenue = Number(
      (
        115 *
        div.level *
        (ms.poolFeePct / 1.25) *
        feeCompetitiveness *
        credibilityFactor *
        div.efficiencyMult *
        slaMult
      ).toFixed(2)
    );
    poolCost = Number((28 * div.level).toFixed(2));
  }

  // 2. Hosted Colocation Clients
  let hostingRevenue = 0;
  let hostingElecCost = 0;
  if (ms.hostedClientsCount > 0) {
    hostingRevenue = Number(
      (
        ms.hostedClientsCount *
        145 *
        (0.85 + div.level * 0.15) *
        div.efficiencyMult *
        slaMult *
        serviceMarginMult
      ).toFixed(2)
    );
    hostingElecCost = Number(
      (ms.hostedClientsCount * KW_PER_HOSTED_CLIENT * 24 * context.facilityRate).toFixed(2)
    );
  }

  // 3. Active Compute Capacity Leases
  let leaseRevenue = 0;
  let leaseElecCost = 0;
  let nextActiveLeases = ms.activeComputeLeases ?? 0;
  let nextLeaseRem = ms.computeLeaseStepsRemaining ?? 0;
  if (nextActiveLeases > 0 && nextLeaseRem > 0) {
    leaseRevenue = Number(
      (nextActiveLeases * 190 * div.efficiencyMult * slaMult * serviceMarginMult).toFixed(2)
    );
    leaseElecCost = Number(
      (nextActiveLeases * KW_PER_COMPUTE_LEASE * 24 * context.facilityRate).toFixed(2)
    );
    nextLeaseRem -= 1;
    if (nextLeaseRem === 0) {
      news.push({
        id: `news_srv_lease_done_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: 'Compute Rental Contract Completed',
        detail: `${nextActiveLeases} compute rental pod(s) finished their 12-step term and freed ${nextActiveLeases * KW_PER_COMPUTE_LEASE} kW capacity.`,
        category: 'FACILITY',
      });
      nextActiveLeases = 0;
    }
  }

  const grossRev = Number((poolRevenue + hostingRevenue + leaseRevenue).toFixed(2));
  const totalExp = Number((poolCost + hostingElecCost + leaseElecCost).toFixed(2));
  const netCash = Number((grossRev - totalExp).toFixed(2));

  cong = {
    ...cong,
    miningServices: {
      ...ms,
      slaCompliancePct: nextSla,
      totalPoolFeeUsd: Number((ms.totalPoolFeeUsd + poolRevenue).toFixed(2)),
      totalHostingUsd: Number((ms.totalHostingUsd + hostingRevenue + leaseRevenue).toFixed(2)),
      activeComputeLeases: nextActiveLeases,
      computeLeaseStepsRemaining: nextLeaseRem,
    },
  };
  cong = recordDivisionFinancials(cong, 'MINING_SERVICES', {
    revenueUsd: grossRev,
    expenseUsd: totalExp,
    setStepSnapshot: true,
  });

  return {
    conglomerate: cong,
    cashDeltaUsd: netCash,
    news,
  };
}

export function formatMiningServicesReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses.MINING_SERVICES;
  const ms = cong.miningServices;
  const maxClients = getMaxHostedClients(div.level, ms.rentedCapacityKw);
  const usedKw = getAllocatedHostingKw(ms);
  const freeKw = Math.max(0, ms.rentedCapacityKw - usedKw);
  const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;

  return [
    `  BUSINESS 5 // MINING SERVICES — ${div.acquiredCompanyName ?? div.name}`,
    `    Status           : ${div.status}${div.status === 'RECOVERING' ? ` (${div.recoveryStepsRemaining}st left — "corp turnaround services")` : ` · Div Lv ${div.level}/5 · Eff ${Math.round(div.efficiencyMult * 100)}%`}`,
    `    Commercial Pool  : ${ms.poolOperatorActive ? 'ONLINE' : 'PAUSED'} · Fee: ${ms.poolFeePct.toFixed(2)}% · Lifetime Pool Rev: ${formatUsd(ms.totalPoolFeeUsd)}`,
    `    Colocation Racks : ${usedKw}/${ms.rentedCapacityKw} kW allocated (${freeKw} kW free)`,
    `    Hosted Tenants   : ${ms.hostedClientsCount}/${maxClients} clients · Lifetime Hosting Rev: ${formatUsd(ms.totalHostingUsd)}`,
    `    Compute Leases   : ${ms.activeComputeLeases ?? 0} active pod(s)${(ms.computeLeaseStepsRemaining ?? 0) > 0 ? ` (${ms.computeLeaseStepsRemaining}st left)` : ''}`,
    `    SLA Compliance   : ${ms.slaCompliancePct.toFixed(1)}% (sensitive to breaker overloads & strikes)`,
    `    Division P&L     : Rev ${formatUsd(div.ledger.totalRevenueUsd)} | Exp ${formatUsd(div.ledger.totalExpenseUsd)} | Syn Credits +${formatUsd(div.ledger.totalInternalCreditsUsd)} | Net ${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`,
    '',
    `  COMMANDS:`,
    `    services pool toggle        Start/pause commercial mining pool`,
    `    services pool fee <0.25..5> Adjust commercial pool fee %`,
    `    services expand [kW]        Add colocation power racks ($650/kW)`,
    `    services client add [qty]   Onboard hosting tenants (${KW_PER_HOSTED_CLIENT} kW each)`,
    `    services client drop [qty]  Release colocation tenants`,
    `    services lease [units]      Run 12-step compute rental contracts (${KW_PER_COMPUTE_LEASE} kW each)`,
    `    services sla                Remediate SLA compliance ($4,500)`,
  ].join('\n');
}
