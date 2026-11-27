import {
  AcquisitionTarget,
  BusinessId,
  ConglomerateState,
  GameState,
  NewsItem,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { getBusinessTutorialTopicId } from '../data/onboarding';
import { createSeededRng } from '../utils/rng';
import {
  BUSINESS_CATALOG,
  BUSINESS_ORDER,
  getRankedAffinityBusinesses,
} from './affinity';
import {
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  getOwnedBusinessIds,
  isBusinessOwned,
  recordDivisionFinancials,
} from './conglomerate';
import { evaluateGenerationMilestones } from './generations';

interface DivisionDistressProfile {
  companies: string[];
  reasons: string[];
  assets: string[];
  baseEquityUsd: number;
  baseDebtUsd: number;
  baseTurnaroundUsd: number;
  recoverySteps: number;
  staffCount: number;
}

const DISTRESS_PROFILES: Record<Exclude<BusinessId, 'MINING'>, DivisionDistressProfile> = {
  MARKET_INTEL: {
    companies: ['Kestrel Quant Analytics', 'Vektor Chain Telemetry', 'Meridian Alpha Research'],
    reasons: [
      'Collapsed after mispricing a multi-exchange liquidity crunch.',
      'Burned runway on unmonetized institutional data terminals.',
      'Founder exodus left subscription contracts stalled in receivership.',
    ],
    assets: [
      '2 enterprise client feeds, historical order-book archive & 3 quants',
      'Proprietary sentiment scraper cluster & 2 analyst workstations',
      'Forecasting software codebase, trademark & 3 retained analysts',
    ],
    baseEquityUsd: 220_000,
    baseDebtUsd: 85_000,
    baseTurnaroundUsd: 45_000,
    recoverySteps: 5,
    staffCount: 3,
  },
  HARDWARE_ENG: {
    companies: ['Aether Silicon Labs', 'Stratos Microarchitecture', 'Caldera Compute R&D'],
    reasons: [
      'Bankrupted by tape-out NRE overruns before volume shipments.',
      'Failed verification bench left patent portfolio up for auction.',
      'Over-extended on optical interconnect prototyping debt.',
    ],
    assets: [
      'EDA simulation farm, patent library & 4 principal silicon architects',
      'Thermal/power verification lab & licensed reference schematics',
      'Prototype bench rigs, HDL IP blocks & 3 systems engineers',
    ],
    baseEquityUsd: 420_000,
    baseDebtUsd: 165_000,
    baseTurnaroundUsd: 85_000,
    recoverySteps: 6,
    staffCount: 4,
  },
  MANUFACTURING: {
    companies: ['Helios WaferWorks', 'Northstar Semiconductor Foundry', 'Apex Fab & Assembly'],
    reasons: [
      'Stranded wafer inventory and idle cleanroom lines after OEM cancelation.',
      'Defaulted on lithography tool lease payments during crypto downturn.',
      'Quality-control recall triggered creditor liquidation.',
    ],
    assets: [
      '1 cleanroom assembly line, QA metrology racks & 5 fab technicians',
      'Surface-mount assembly bay, serial laser etchers & wafer stock',
      'Certified semiconductor packaging line & supplier contracts',
    ],
    baseEquityUsd: 580_000,
    baseDebtUsd: 240_000,
    baseTurnaroundUsd: 110_000,
    recoverySteps: 7,
    staffCount: 5,
  },
  MINING_SERVICES: {
    companies: ['Titan Colocation Group', 'Argon Stratum Hosting', 'Boreal Compute Exchange'],
    reasons: [
      'Over-leveraged long-term power leases when hosting tenants churned.',
      'Stratum pool payout insolvency forced emergency restructuring.',
      'Underutilized MW rack bays pushed creditors to auction.',
    ],
    assets: [
      'Stratum pool cluster, 40 kW colocation cages & 2 hosting clients',
      'Tier-3 SLA monitoring NOC, client billing engine & rack PDUs',
      'Pre-wired hosting pods & commercial hashrate brokerage desk',
    ],
    baseEquityUsd: 310_000,
    baseDebtUsd: 125_000,
    baseTurnaroundUsd: 60_000,
    recoverySteps: 6,
    staffCount: 4,
  },
  UNDERGROUND: {
    companies: ['Obsidian Shadow Syndicate', 'Nocturne Darknet Clearing', 'Cipher Vault Brokers'],
    reasons: [
      'Operator vanished after a disputed dark-liquidity settlement.',
      'Shadow hash-brokerage frozen during rival cyber retaliation.',
      'Offshore shell structure auctioned privately to solvent syndicates.',
    ],
    assets: [
      'Encrypted escrow channels, gray-market supplier list & shell shielding',
      'Covert relay nodes, obfuscated liquidity routers & 2 operators',
      'Private black-market procurement desk & risk-masking ledgers',
    ],
    baseEquityUsd: 260_000,
    baseDebtUsd: 95_000,
    baseTurnaroundUsd: 55_000,
    recoverySteps: 4,
    staffCount: 2,
  },
};

const REFRESH_INTERVAL_STEPS = 18;

export function isAcquisitionUnlocked(state: GameState): boolean {
  if (state.devUnlockAll || state.isSandbox) return true;
  const cong = state.conglomerate;
  if (!cong) return false;
  return Boolean(
    cong.acquisitions.expansionOpportunityUnlocked ||
      cong.generation.gen5ExpansionTriggered ||
      cong.generation.highestGenerationReached >= 5
  );
}

function buildTargetForBusiness(
  businessId: Exclude<BusinessId, 'MINING'>,
  affinityMatchPct: number,
  stepCount: number,
  runSeed: string,
  boardIdx: number
): AcquisitionTarget {
  const profile = DISTRESS_PROFILES[businessId];
  const rng = createSeededRng(`${runSeed}|acq_target|${stepCount}|${businessId}|${boardIdx}`);
  const companyName = profile.companies[Math.floor(rng() * profile.companies.length)];
  const distressReason = profile.reasons[Math.floor(rng() * profile.reasons.length)];
  const existingAssetSummary = profile.assets[Math.floor(rng() * profile.assets.length)];

  const jitter = 0.9 + rng() * 0.2;
  // Strong affinity yields up to an 18% strategic synergy discount on equity purchase.
  const affinityDiscount = Math.min(0.18, (affinityMatchPct / 100) * 0.24);
  const purchasePriceUsd = Math.round(profile.baseEquityUsd * jitter * (1 - affinityDiscount) / 500) * 500;
  const assumedDebtUsd = Math.round(profile.baseDebtUsd * (0.9 + rng() * 0.2) / 500) * 500;
  const turnaroundCostUsd = Math.round(profile.baseTurnaroundUsd * (0.95 + rng() * 0.1) / 500) * 500;

  return {
    id: `acq_${businessId.toLowerCase()}_${stepCount}_${boardIdx}`,
    businessId,
    companyName,
    distressReason,
    purchasePriceUsd,
    assumedDebtUsd,
    turnaroundCostUsd,
    recoverySteps: profile.recoverySteps,
    existingStaffCount: profile.staffCount,
    existingAssetSummary,
    affinityMatchPct,
    inspected: false,
    expiresAtStep: stepCount + REFRESH_INTERVAL_STEPS,
  };
}

export function generateAcquisitionBoard(
  state: GameState,
  congInput?: ConglomerateState,
  stepOverride?: number
): AcquisitionTarget[] {
  const step = stepOverride ?? state.stepCount;
  const cong = congInput ?? buildDefaultConglomerate(state, state.conglomerate);
  const owned = getOwnedBusinessIds({ conglomerate: cong });
  const ranked = getRankedAffinityBusinesses(cong.affinity, {
    excludeIds: owned,
  }).filter((entry): entry is { businessId: Exclude<BusinessId, 'MINING'>; score: number; sharePct: number } =>
    entry.businessId !== 'MINING'
  );

  if (ranked.length === 0) return [];

  // Always prioritize the highest-affinity unowned business at #1, then include up to 2 distressed alternatives.
  const picked: typeof ranked = [ranked[0]];
  if (ranked.length > 1) {
    const rng = createSeededRng(`${state.runSeed}|acq_board|${step}`);
    const rest = ranked.slice(1);
    // Deterministic shuffle of remaining unowned businesses after first expansion offer.
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    picked.push(...rest.slice(0, 2));
  }

  return picked.map((entry, idx) =>
    buildTargetForBusiness(entry.businessId, entry.sharePct, step, state.runSeed, idx + 1)
  );
}

export function resolveAcquisitionTarget(
  targets: AcquisitionTarget[],
  query: string
): AcquisitionTarget | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const idx = parseInt(q, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= targets.length) {
    return targets[idx - 1];
  }
  return targets.find(
    (t) =>
      t.id.toLowerCase() === q ||
      t.businessId.toLowerCase() === q ||
      t.businessId.toLowerCase().replace('_', '') === q.replace(/[-_\s]/g, '') ||
      BUSINESS_CATALOG[t.businessId].shortName.toLowerCase().includes(q) ||
      t.companyName.toLowerCase().includes(q)
  );
}

export function resolveBusinessQuery(query: string): BusinessId | undefined {
  const q = query.trim().toLowerCase().replace(/[-_\s]/g, '');
  if (!q) return undefined;
  const aliases: Record<string, BusinessId> = {
    b1: 'MINING',
    mining: 'MINING',
    cryptomining: 'MINING',
    b2: 'MARKET_INTEL',
    intel: 'MARKET_INTEL',
    marketintel: 'MARKET_INTEL',
    marketintelligence: 'MARKET_INTEL',
    b3: 'HARDWARE_ENG',
    eng: 'HARDWARE_ENG',
    engineering: 'HARDWARE_ENG',
    hweng: 'HARDWARE_ENG',
    hardwareeng: 'HARDWARE_ENG',
    hardwareengineering: 'HARDWARE_ENG',
    b4: 'MANUFACTURING',
    mfg: 'MANUFACTURING',
    fab: 'MANUFACTURING',
    foundry: 'MANUFACTURING',
    manufacturing: 'MANUFACTURING',
    b5: 'MINING_SERVICES',
    services: 'MINING_SERVICES',
    hosting: 'MINING_SERVICES',
    pool: 'MINING_SERVICES',
    miningservices: 'MINING_SERVICES',
    b6: 'UNDERGROUND',
    ug: 'UNDERGROUND',
    ops: 'UNDERGROUND',
    underground: 'UNDERGROUND',
  };
  return aliases[q] ?? BUSINESS_ORDER.find((id) => id.toLowerCase().replace('_', '') === q);
}

export function inspectAcquisitionTarget(
  state: GameState,
  targetQuery: string
): { ok: boolean; nextState: GameState; summary: string; target?: AcquisitionTarget } {
  if (!isAcquisitionUnlocked(state)) {
    return {
      ok: false,
      nextState: state,
      summary: 'Corporate Acquisitions unlock once your operation reaches Generation 5 scale.',
    };
  }
  let cong = buildDefaultConglomerate(state, state.conglomerate);
  if (cong.acquisitions.availableTargets.length === 0 && !areAllSixBusinessesOwned(state)) {
    cong = {
      ...cong,
      acquisitions: {
        ...cong.acquisitions,
        expansionOpportunityUnlocked: true,
        availableTargets: generateAcquisitionBoard(state, cong),
        lastRefreshStep: state.stepCount,
      },
    };
  }

  const target = resolveAcquisitionTarget(cong.acquisitions.availableTargets, targetQuery);
  if (!target) {
    return {
      ok: false,
      nextState: state,
      summary: `Acquisition target "${targetQuery}" not found. Run "acquire" to view listings.`,
    };
  }

  const updatedTarget: AcquisitionTarget = { ...target, inspected: true };
  const nextTargets = cong.acquisitions.availableTargets.map((t) =>
    t.id === target.id ? updatedTarget : t
  );
  const nextState: GameState = {
    ...state,
    conglomerate: {
      ...cong,
      acquisitions: {
        ...cong.acquisitions,
        availableTargets: nextTargets,
      },
    },
  };

  return {
    ok: true,
    nextState,
    target: updatedTarget,
    summary: formatTargetDueDiligence(updatedTarget, nextState),
  };
}

export function refreshAcquisitionMarket(state: GameState): {
  ok: boolean;
  nextState: GameState;
  summary: string;
} {
  if (!isAcquisitionUnlocked(state)) {
    return {
      ok: false,
      nextState: state,
      summary: 'Distressed acquisition market unlocks at Generation 5.',
    };
  }
  if (areAllSixBusinessesOwned(state)) {
    return {
      ok: false,
      nextState: state,
      summary: 'All six conglomerate businesses are already owned.',
    };
  }

  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const nextTargets = generateAcquisitionBoard(state, cong, state.stepCount);
  const nextState: GameState = {
    ...state,
    conglomerate: {
      ...cong,
      acquisitions: {
        ...cong.acquisitions,
        expansionOpportunityUnlocked: true,
        availableTargets: nextTargets,
        lastRefreshStep: state.stepCount,
      },
    },
  };
  return {
    ok: true,
    nextState,
    summary: `Refreshed distressed M&A board (${nextTargets.length} candidate${nextTargets.length === 1 ? '' : 's'} listed).`,
  };
}

export function acquireTargetCompany(
  state: GameState,
  targetQuery: string
): { ok: boolean; nextState: GameState; summary: string } {
  if (!isAcquisitionUnlocked(state)) {
    return {
      ok: false,
      nextState: state,
      summary: 'Corporate Acquisitions unlock at Generation 5 scale.',
    };
  }

  let cong = buildDefaultConglomerate(state, state.conglomerate);
  if (cong.acquisitions.availableTargets.length === 0 && !areAllSixBusinessesOwned(state)) {
    cong = {
      ...cong,
      acquisitions: {
        ...cong.acquisitions,
        expansionOpportunityUnlocked: true,
        availableTargets: generateAcquisitionBoard(state, cong),
        lastRefreshStep: state.stepCount,
      },
    };
  }

  const target = resolveAcquisitionTarget(cong.acquisitions.availableTargets, targetQuery);
  if (!target) {
    return {
      ok: false,
      nextState: state,
      summary: `Acquisition target "${targetQuery}" not found. Run "acquire" to list available companies.`,
    };
  }

  if (isBusinessOwned({ conglomerate: cong }, target.businessId)) {
    return {
      ok: false,
      nextState: state,
      summary: `You already own the ${BUSINESS_CATALOG[target.businessId].name} division.`,
    };
  }

  const totalClosingCost = target.purchasePriceUsd + target.assumedDebtUsd;
  if (state.cash < totalClosingCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash for buyout + debt settlement (${formatUsd(totalClosingCost)} required; have ${formatUsd(state.cash)}).`,
    };
  }

  const stepLabel = formatStepLabel(state.stepCount);
  const meta = BUSINESS_CATALOG[target.businessId];
  const prevDiv = cong.businesses[target.businessId];

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      [target.businessId]: {
        ...prevDiv,
        name: meta.name,
        acquiredCompanyName: target.companyName,
        status: 'RECOVERING',
        acquiredStep: state.stepCount,
        recoveryStepsRemaining: target.recoverySteps,
        turnaroundCostUsd: target.turnaroundCostUsd,
        staffAssigned: target.existingStaffCount,
        reputation: 35,
        efficiencyMult: 0.75,
      },
    },
    acquisitions: {
      ...cong.acquisitions,
      expansionOpportunityUnlocked: true,
      completedCount: cong.acquisitions.completedCount + 1,
      availableTargets: cong.acquisitions.availableTargets.filter(
        (t) => t.businessId !== target.businessId
      ),
    },
  };

  nextCong = recordDivisionFinancials(nextCong, target.businessId, {
    expenseUsd: totalClosingCost,
  });

  // Seed inherited assets for the acquired division cleanly
  let nextFab = state.fab;
  if (target.businessId === 'MANUFACTURING') {
    if (nextFab && nextFab.linesCount < 1) {
      nextFab = { ...nextFab, linesCount: 1 };
    }
    nextCong = {
      ...nextCong,
      manufacturing: {
        ...nextCong.manufacturing,
        contractSlots: Math.max(1, nextCong.manufacturing.contractSlots),
      },
    };
  } else if (target.businessId === 'MARKET_INTEL') {
    nextCong = {
      ...nextCong,
      marketIntel: {
        ...nextCong.marketIntel,
        activeSubscriptions: Math.max(2, nextCong.marketIntel.activeSubscriptions),
        predictionAccuracyPct: Math.max(62, nextCong.marketIntel.predictionAccuracyPct),
      },
    };
  } else if (target.businessId === 'HARDWARE_ENG') {
    nextCong = {
      ...nextCong,
      hardwareEng: {
        ...nextCong.hardwareEng,
        labTier: Math.max(2, nextCong.hardwareEng.labTier),
      },
    };
  } else if (target.businessId === 'MINING_SERVICES') {
    nextCong = {
      ...nextCong,
      miningServices: {
        ...nextCong.miningServices,
        poolOperatorActive: true,
        hostedClientsCount: Math.max(2, nextCong.miningServices.hostedClientsCount),
        rentedCapacityKw: Math.max(40, nextCong.miningServices.rentedCapacityKw),
      },
    };
  } else if (target.businessId === 'UNDERGROUND') {
    nextCong = {
      ...nextCong,
      undergroundDiv: {
        ...nextCong.undergroundDiv,
        subsidiaryStructured: true,
        shellSubsidiaryShieldPct: Math.max(10, nextCong.undergroundDiv.shellSubsidiaryShieldPct),
      },
    };
  }

  // Replenish board if unowned divisions remain and board became empty
  const tempStateForGen: GameState = {
    ...state,
    cash: state.cash - totalClosingCost,
    fab: nextFab,
    conglomerate: nextCong,
  };
  if (nextCong.acquisitions.availableTargets.length === 0 && !areAllSixBusinessesOwned(tempStateForGen)) {
    nextCong = {
      ...nextCong,
      acquisitions: {
        ...nextCong.acquisitions,
        availableTargets: generateAcquisitionBoard(tempStateForGen, nextCong),
        lastRefreshStep: state.stepCount,
      },
    };
  }

  const nextGen = evaluateGenerationMilestones(tempStateForGen, nextCong);
  nextCong = { ...nextCong, generation: nextGen };

  const ownedNow = getOwnedBusinessIds({ conglomerate: nextCong }).length;
  const tx: TransactionEntry = {
    id: `tx_acq_${target.businessId}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -totalClosingCost,
    description: `Acquired ${target.companyName} (${meta.name})`,
  };

  const topicId = getBusinessTutorialTopicId(target.businessId);
  const newsItems: NewsItem[] = [
    {
      id: `news_acq_${target.businessId}_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      title: `Acquired ${target.companyName} (${meta.shortName})`,
      detail: `Closed buyout for ${formatUsd(totalClosingCost)}. Division recovering (${target.recoverySteps} steps) — run "corp turnaround ${meta.shortName.toLowerCase()}" or "tutorial ${topicId}". Conglomerate: ${ownedNow}/6 businesses.`,
      category: 'MILESTONE',
    },
  ];

  if (nextGen.gen7ConglomerateUnlocked && !cong.generation.gen7ConglomerateUnlocked) {
    newsItems.unshift({
      id: `news_gen7_conglomerate_${state.stepCount}`,
      step: state.stepCount,
      stepLabel,
      title: 'ALL 6 BUSINESSES OWNED — GEN 7 PROGRAM UNLOCKED!',
      detail: 'Your conglomerate spans every crypto-industry pillar. Generation 7 Quantum & Photonic Silicon R&D is now accessible!',
      category: 'MILESTONE',
    });
  }

  const nextState: GameState = {
    ...state,
    cash: state.cash - totalClosingCost,
    fab: nextFab,
    conglomerate: nextCong,
    transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    news: [...newsItems, ...state.news].slice(0, 60),
    currentCycleStats: {
      ...state.currentCycleStats,
      otherSpendUsd: state.currentCycleStats.otherSpendUsd + totalClosingCost,
    },
  };

  return {
    ok: true,
    nextState,
    summary: `Acquired ${target.companyName} as your ${meta.name} division for ${formatUsd(totalClosingCost)}! (${ownedNow}/6 businesses owned; ${target.recoverySteps} steps to full stabilization · Run "tutorial ${topicId}" for briefing)`,
  };
}

export function fundBusinessTurnaround(
  state: GameState,
  businessQuery: string
): { ok: boolean; nextState: GameState; summary: string } {
  const bizId = resolveBusinessQuery(businessQuery);
  if (!bizId || bizId === 'MINING') {
    return {
      ok: false,
      nextState: state,
      summary: `Specify a recovering acquired division (market_intel, hardware_eng, manufacturing, mining_services, underground).`,
    };
  }
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses[bizId];
  if (div.status !== 'RECOVERING') {
    return {
      ok: false,
      nextState: state,
      summary:
        div.status === 'ACTIVE'
          ? `${div.name} is already fully stabilized (ACTIVE).`
          : `${div.name} has not been acquired yet.`,
    };
  }

  const cost = div.turnaroundCostUsd ?? DISTRESS_PROFILES[bizId].baseTurnaroundUsd;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash to fund ${div.name} turnaround (${formatUsd(cost)} required).`,
    };
  }

  const stepLabel = formatStepLabel(state.stepCount);
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      [bizId]: {
        ...div,
        status: 'ACTIVE',
        recoveryStepsRemaining: 0,
        efficiencyMult: 1,
        reputation: Math.max(45, div.reputation + 10),
      },
    },
  };
  nextCong = recordDivisionFinancials(nextCong, bizId, { expenseUsd: cost });

  const tx: TransactionEntry = {
    id: `tx_turnaround_${bizId}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Turnaround stabilization funded for ${div.acquiredCompanyName ?? div.name}`,
  };
  const news: NewsItem = {
    id: `news_turnaround_${bizId}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `${div.name} Fully Stabilized`,
    detail: `Turnaround package (${formatUsd(cost)}) restored full operational efficiency at ${div.acquiredCompanyName ?? div.name}.`,
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
    summary: `Turnaround funded for ${formatUsd(cost)} — ${div.name} (${div.acquiredCompanyName ?? div.name}) is now ACTIVE!`,
  };
}

/**
 * Advances Gen 5 expansion offer unlocks, distressed market refreshes, and division recovery countdowns.
 * Does NOT consume stepRng so existing simulation RNG sequences remain deterministic.
 */
export function stepAcquisitionsAndRecoveries(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number,
  stepLabel: string
): { conglomerate: ConglomerateState; news: NewsItem[]; milestoneHit: boolean } {
  let cong = congInput;
  const news: NewsItem[] = [];
  let milestoneHit = false;

  // 1. Trigger Gen 5 Expansion Opportunity once Gen 5 is reached (or sandbox override)
  const shouldUnlockExpansion =
    !cong.acquisitions.expansionOpportunityUnlocked &&
    (cong.generation.gen5ExpansionTriggered ||
      cong.generation.highestGenerationReached >= 5 ||
      Boolean(state.isSandbox || state.devUnlockAll));

  if (shouldUnlockExpansion) {
    const initialTargets = generateAcquisitionBoard(state, cong, nextStep);
    cong = {
      ...cong,
      acquisitions: {
        ...cong.acquisitions,
        expansionOpportunityUnlocked: true,
        expansionOfferStep: cong.acquisitions.expansionOfferStep ?? nextStep,
        availableTargets: initialTargets,
        lastRefreshStep: nextStep,
      },
    };

    if (cong.generation.gen5ExpansionTriggered && !state.isSandbox) {
      milestoneHit = true;
      const lead = initialTargets[0];
      news.push({
        id: `news_gen5_expansion_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: 'Gen-5 Corporate Expansion Opportunity Unlocked!',
        detail: lead
          ? `Your operational track record drew distressed M&A attention — "${lead.companyName}" (${BUSINESS_CATALOG[lead.businessId].shortName}) is seeking a buyer. Run "acquire" to review.`
          : 'Run "acquire" to inspect bankrupt crypto-industry companies available for buyout.',
        category: 'MILESTONE',
      });
    }
  }

  // 2. Tick recovering divisions down toward ACTIVE status
  const nextBusinesses = { ...cong.businesses };
  let businessesChanged = false;
  for (const id of BUSINESS_ORDER) {
    const div = nextBusinesses[id];
    if (div.status === 'RECOVERING') {
      const rem = Math.max(0, div.recoveryStepsRemaining - 1);
      if (rem === 0) {
        nextBusinesses[id] = {
          ...div,
          status: 'ACTIVE',
          recoveryStepsRemaining: 0,
          efficiencyMult: 1,
          reputation: Math.max(40, div.reputation + 5),
        };
        milestoneHit = true;
        news.push({
          id: `news_div_active_${id}_${nextStep}`,
          step: nextStep,
          stepLabel,
          title: `${div.name} Turnaround Complete`,
          detail: `${div.acquiredCompanyName ?? div.name} has exited restructuring and is now fully ACTIVE.`,
          category: 'FACILITY',
        });
      } else {
        nextBusinesses[id] = {
          ...div,
          recoveryStepsRemaining: rem,
        };
      }
      businessesChanged = true;
    }
  }
  if (businessesChanged) {
    cong = { ...cong, businesses: nextBusinesses };
  }

  // 3. Auto-refresh expired distressed market listings every REFRESH_INTERVAL_STEPS if unowned remain
  if (cong.acquisitions.expansionOpportunityUnlocked && !areAllSixBusinessesOwned({ conglomerate: cong })) {
    const expired = cong.acquisitions.availableTargets.some((t) => nextStep >= t.expiresAtStep);
    if (cong.acquisitions.availableTargets.length === 0 || expired) {
      const refreshed = generateAcquisitionBoard(state, cong, nextStep);
      cong = {
        ...cong,
        acquisitions: {
          ...cong.acquisitions,
          availableTargets: refreshed,
          lastRefreshStep: nextStep,
        },
      };
    }
  }

  return { conglomerate: cong, news, milestoneHit };
}

export function formatTargetDueDiligence(target: AcquisitionTarget, state: GameState): string {
  const meta = BUSINESS_CATALOG[target.businessId];
  const closingCost = target.purchasePriceUsd + target.assumedDebtUsd;
  const canAfford = state.cash >= closingCost;

  return [
    `  DUE DILIGENCE DOSSIER — ${target.companyName} [${meta.code} · ${meta.name}]`,
    `    Distress Cause  : ${target.distressReason}`,
    `    Strategic Fit   : ${target.affinityMatchPct >= 25 ? 'Strong operational alignment' : 'Cross-sector expansion'} (${meta.sector})`,
    `    Equity Buyout   : ${formatUsd(target.purchasePriceUsd)}`,
    `    Assumed Debt    : ${formatUsd(target.assumedDebtUsd)}`,
    `    Total Closing   : ${formatUsd(closingCost)} (${canAfford ? 'AFFORDABLE' : `SHORT ${formatUsd(closingCost - state.cash)}`})`,
    `    Turnaround Plan : ${target.recoverySteps} steps auto-recovery OR ${formatUsd(target.turnaroundCostUsd)} fast-track`,
    `    Inherited Staff : ${target.existingStaffCount} specialists`,
    `    Assets Included : ${target.existingAssetSummary}`,
    `    Listing Expires : Step ${target.expiresAtStep} (${Math.max(0, target.expiresAtStep - state.stepCount)} steps left)`,
  ].join('\n');
}

export function formatAcquisitionsReport(state: GameState): string {
  if (!isAcquisitionUnlocked(state)) {
    const gen = state.conglomerate?.generation.currentGeneration ?? 1;
    return [
      `  DISTRESSED M&A MARKET [LOCKED UNTIL GEN 5]`,
      `  Current Scale: Generation ${gen}/7 · Owned Divisions: ${getOwnedBusinessIds(state).length}/6`,
      `  Grow your mining company through Gen 4/5 (unlock Gen-5 2nm Exascale R&D or deploy Gen 5 rigs)`,
      `  to attract distressed acquisition opportunities shaped by your operating style.`,
    ].join('\n');
  }

  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const owned = getOwnedBusinessIds(state);
  const targets =
    cong.acquisitions.availableTargets.length > 0
      ? cong.acquisitions.availableTargets
      : generateAcquisitionBoard(state, cong);

  const lines: string[] = [
    `  DISTRESSED ACQUISITION MARKET (${owned.length}/6 Businesses Owned · Completed M&A: ${cong.acquisitions.completedCount})`,
    `  Cash Available: ${formatUsd(state.cash)}`,
    '',
  ];

  if (areAllSixBusinessesOwned(state)) {
    lines.push('  All six cryptocurrency-industry businesses are owned by your conglomerate!');
    lines.push('  Run "corp" to view division P&L or "research" to pursue Gen-7 Quantum & Photonic R&D.');
    return lines.join('\n');
  }

  if (targets.length === 0) {
    lines.push('  (No active acquisition candidates on the market. Run "acquire refresh".)');
  } else {
    targets.forEach((t, idx) => {
      const meta = BUSINESS_CATALOG[t.businessId];
      const closingCost = t.purchasePriceUsd + t.assumedDebtUsd;
      const inspTag = t.inspected ? '[INSPECTED]' : '[UNINSPECTED]';
      const leadTag = idx === 0 ? ' · ★ STRATEGIC FIT' : '';
      lines.push(
        `  #${idx + 1} [${meta.code}] ${t.companyName} (${meta.shortName}) ${inspTag}${leadTag}`
      );
      lines.push(
        `     Closing Cost: ${formatUsd(closingCost)} (${formatUsd(t.purchasePriceUsd)} equity + ${formatUsd(t.assumedDebtUsd)} debt) · Recovery: ${t.recoverySteps}st`
      );
      lines.push(`     Summary     : ${t.distressReason}`);
    });
    lines.push('');
    lines.push('  COMMANDS: "acquire inspect <#>" | "acquire buy <#>" | "acquire refresh"');
  }

  return lines.join('\n');
}

export function formatCorporateStatusReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const ownedCount = getOwnedBusinessIds(state).length;
  const gen = cong.generation;

  const divRows = BUSINESS_ORDER.map((id) => {
    const div = cong.businesses[id];
    const meta = BUSINESS_CATALOG[id];
    const statusStr =
      div.status === 'ACTIVE'
        ? 'ACTIVE'
        : div.status === 'RECOVERING'
        ? `RECOVERING (${div.recoveryStepsRemaining}st)`
        : 'UNOWNED';
    const companyNote = div.acquiredCompanyName ? ` · ${div.acquiredCompanyName}` : '';
    const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;
    const pnlStr = div.status === 'UNOWNED' ? '-' : `${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`;
    return `  ${meta.code}  ${meta.name.padEnd(23)} ${statusStr.padEnd(18)} Net P&L: ${pnlStr.padStart(12)}${companyNote}`;
  });

  const recovering = BUSINESS_ORDER.map((id) => cong.businesses[id]).filter(
    (d) => d.status === 'RECOVERING'
  );

  return [
    `  CORPORATE CONGLOMERATE OVERVIEW — ${cong.hq.companyName}`,
    `  Generation    : Gen ${gen.currentGeneration}/7 (Peak Gen ${gen.highestGenerationReached}) · Businesses Owned: ${ownedCount}/6`,
    `  Gen 5 M&A     : ${cong.acquisitions.expansionOpportunityUnlocked ? 'OPEN ("acquire")' : 'Locks until Gen 5 scale'}`,
    `  Gen 7 Program : ${gen.gen7ConglomerateUnlocked ? 'UNLOCKED (All 6 divisions owned)' : `LOCKED (Own all 6 businesses: ${ownedCount}/6)`}`,
    '',
    `  DIVISIONS & P&L:`,
    ...divRows,
    ...(recovering.length > 0
      ? [
          '',
          `  RECOVERING SUBSIDIARIES ("corp turnaround <division>"):`,
          ...recovering.map(
            (d) =>
              `    -> ${d.name} (${d.acquiredCompanyName ?? d.name}): ${d.recoveryStepsRemaining}st left or ${formatUsd(d.turnaroundCostUsd ?? 50_000)} fast-track`
          ),
        ]
      : []),
    '',
    `  COMMANDS: "acquire" | "acquire inspect <#>" | "acquire buy <#>" | "corp turnaround <biz>"`,
  ].join('\n');
}
