import {
  BusinessId,
  ConglomerateState,
  CorporateHQState,
  GameState,
  NewsItem,
  SynergyPolicyId,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { BUSINESS_CATALOG, BUSINESS_ORDER } from './affinity';
import {
  buildDefaultConglomerate,
  getOwnedBusinessIds,
  isBusinessActive,
  isBusinessOwned,
  recordDivisionFinancials,
} from './conglomerate';

export const HQ_ESTABLISH_COST_USD = 75_000;
export const MAX_HQ_LEVEL = 5;

export interface HQLevelSpec {
  level: number;
  title: string;
  upgradeCostUsd: number;
  minOwnedBusinesses: number;
  maxSynergies: number;
  rpBonusPct: number;
  scrutinyDecayBonus: number;
  nreDiscountPct: number;
  cycleUpkeepUsd: number;
  equityValueUsd: number;
}

export const HQ_LEVEL_SPECS: Record<number, HQLevelSpec> = {
  1: {
    level: 1,
    title: 'Holding Company Desk',
    upgradeCostUsd: 0,
    minOwnedBusinesses: 2,
    maxSynergies: 1,
    rpBonusPct: 3,
    scrutinyDecayBonus: 0,
    nreDiscountPct: 0,
    cycleUpkeepUsd: 4_000,
    equityValueUsd: 80_000,
  },
  2: {
    level: 2,
    title: 'Executive Boardroom',
    upgradeCostUsd: 250_000,
    minOwnedBusinesses: 2,
    maxSynergies: 2,
    rpBonusPct: 6,
    scrutinyDecayBonus: 0,
    nreDiscountPct: 4,
    cycleUpkeepUsd: 9_000,
    equityValueUsd: 280_000,
  },
  3: {
    level: 3,
    title: 'Multi-Sector Directorate',
    upgradeCostUsd: 650_000,
    minOwnedBusinesses: 3,
    maxSynergies: 3,
    rpBonusPct: 10,
    scrutinyDecayBonus: 0.1,
    nreDiscountPct: 8,
    cycleUpkeepUsd: 16_000,
    equityValueUsd: 780_000,
  },
  4: {
    level: 4,
    title: 'Global Compliance Tower',
    upgradeCostUsd: 1_500_000,
    minOwnedBusinesses: 4,
    maxSynergies: 4,
    rpBonusPct: 14,
    scrutinyDecayBonus: 0.25,
    nreDiscountPct: 11,
    cycleUpkeepUsd: 26_000,
    equityValueUsd: 1_900_000,
  },
  5: {
    level: 5,
    title: 'Sovereign Apex Conglomerate',
    upgradeCostUsd: 3_500_000,
    minOwnedBusinesses: 6,
    maxSynergies: 6,
    rpBonusPct: 20,
    scrutinyDecayBonus: 0.4,
    nreDiscountPct: 15,
    cycleUpkeepUsd: 42_000,
    equityValueUsd: 4_600_000,
  },
};

export interface SynergyPolicySpec {
  id: SynergyPolicyId;
  code: string;
  name: string;
  requiredBusinesses: BusinessId[];
  anyOfSecondary?: BusinessId[];
  summary: string;
  impactDetail: string;
}

export const SYNERGY_ORDER: SynergyPolicyId[] = [
  'ENG_TO_MFG',
  'MFG_TO_MINING',
  'MFG_TO_SERVICES',
  'INTEL_TO_MINING',
  'INTEL_TO_TREASURY',
  'UG_BLACK_SILICON',
];

export const SYNERGY_POLICIES: Record<SynergyPolicyId, SynergyPolicySpec> = {
  ENG_TO_MFG: {
    id: 'ENG_TO_MFG',
    code: 'SYN-1',
    name: 'Silicon Co-Design Pipeline',
    requiredBusinesses: ['HARDWARE_ENG', 'MANUFACTURING'],
    summary: 'Hardware Engineering <-> Manufacturing integration',
    impactDetail: '-12% Fab blueprint NRE, +1 line wafer throughput, +2.5% batch yield quality',
  },
  MFG_TO_MINING: {
    id: 'MFG_TO_MINING',
    code: 'SYN-2',
    name: 'Vertical Rig Supply Chain',
    requiredBusinesses: ['MANUFACTURING', 'MINING'],
    summary: 'Manufacturing -> Mining direct hardware fulfillment',
    impactDetail: '-10% rig build/tinker hardware part cost, -12% fleet wear rate',
  },
  MFG_TO_SERVICES: {
    id: 'MFG_TO_SERVICES',
    code: 'SYN-3',
    name: 'Turnkey Colocation Racks',
    requiredBusinesses: ['MANUFACTURING', 'MINING_SERVICES'],
    summary: 'Manufacturing -> Mining Services rack & host provisioning',
    impactDetail: '+18% hosting/services margin & SLA resilience on contracted pods',
  },
  INTEL_TO_MINING: {
    id: 'INTEL_TO_MINING',
    code: 'SYN-4',
    name: 'Quant Auto-Liquidation Routing',
    requiredBusinesses: ['MARKET_INTEL', 'MINING'],
    summary: 'Market Intelligence -> Mining optimal coin payout routing',
    impactDetail: '+4.5% to +8.5% mining auto-sell payout efficiency (scales w/ Intel tier)',
  },
  INTEL_TO_TREASURY: {
    id: 'INTEL_TO_TREASURY',
    code: 'SYN-5',
    name: 'Institutional Treasury Desk',
    requiredBusinesses: ['MARKET_INTEL'],
    summary: 'Market Intelligence -> Corporate Treasury & Exchange execution',
    impactDetail: '-30% spot/limit exchange fees, +20% PR lift & modest step treasury execution alpha',
  },
  UG_BLACK_SILICON: {
    id: 'UG_BLACK_SILICON',
    code: 'SYN-6',
    name: 'Gray-Channel Procurement & Shell',
    requiredBusinesses: ['UNDERGROUND'],
    anyOfSecondary: ['MANUFACTURING', 'MINING'],
    summary: 'Underground <-> Corporate gray supply & compliance shielding',
    impactDetail: '-15% black market acquisition cost & -0.35 extra Heat decay per step',
  },
};

export interface CorporateSynergyEffects {
  hqEstablished: boolean;
  hqLevel: number;
  activePolicyIds: SynergyPolicyId[];
  rpBonusMult: number;
  miningAutoSellBonusPct: number;
  wearReductionPct: number;
  rigPartDiscountMult: number;
  exchangeFeeMult: number;
  fabNreMult: number;
  fabExtraThroughput: number;
  fabQualityRollBonus: number;
  blackMarketDiscountMult: number;
  scrutinyDecayBonus: number;
  prBonusMult: number;
  servicesMarginBonusPct: number;
}

const BASE_DIVISION_EQUITY_USD: Record<Exclude<BusinessId, 'MINING'>, number> = {
  MARKET_INTEL: 240_000,
  HARDWARE_ENG: 460_000,
  MANUFACTURING: 650_000,
  MINING_SERVICES: 340_000,
  UNDERGROUND: 280_000,
};

export function getHQLevelSpec(level: number): HQLevelSpec {
  const clamped = Math.max(1, Math.min(MAX_HQ_LEVEL, Math.floor(level || 1)));
  return HQ_LEVEL_SPECS[clamped];
}

export function isSynergyPrerequisitesMet(
  state: Pick<GameState, 'conglomerate'>,
  policyId: SynergyPolicyId
): { met: boolean; reason?: string } {
  const cong = state.conglomerate;
  if (!cong || !cong.hq.established) {
    return { met: false, reason: 'Corporate HQ must be established first ("hq establish").' };
  }
  const spec = SYNERGY_POLICIES[policyId];
  for (const reqId of spec.requiredBusinesses) {
    if (!isBusinessActive(state, reqId)) {
      const div = cong.businesses[reqId];
      const statusHint =
        div.status === 'RECOVERING'
          ? `recovering (${div.recoveryStepsRemaining}st remaining)`
          : 'not yet acquired';
      return {
        met: false,
        reason: `${BUSINESS_CATALOG[reqId].name} must be ACTIVE (${statusHint}).`,
      };
    }
  }
  if (spec.anyOfSecondary && spec.anyOfSecondary.length > 0) {
    const anyOk = spec.anyOfSecondary.some((id) => isBusinessActive(state, id));
    if (!anyOk) {
      return {
        met: false,
        reason: `Requires at least one of ${spec.anyOfSecondary
          .map((id) => BUSINESS_CATALOG[id].shortName)
          .join(' or ')} to be ACTIVE.`,
      };
    }
  }
  return { met: true };
}

export function getCorporateSynergyEffects(
  state?: Pick<GameState, 'conglomerate'>
): CorporateSynergyEffects {
  const cong = state?.conglomerate;
  const hq = cong?.hq;
  if (!cong || !hq || !hq.established || hq.hqLevel < 1) {
    return {
      hqEstablished: false,
      hqLevel: 0,
      activePolicyIds: [],
      rpBonusMult: 1,
      miningAutoSellBonusPct: 0,
      wearReductionPct: 0,
      rigPartDiscountMult: 1,
      exchangeFeeMult: 1,
      fabNreMult: 1,
      fabExtraThroughput: 0,
      fabQualityRollBonus: 0,
      blackMarketDiscountMult: 1,
      scrutinyDecayBonus: 0,
      prBonusMult: 1,
      servicesMarginBonusPct: 0,
    };
  }

  const hqSpec = getHQLevelSpec(hq.hqLevel);
  const validPolicies = hq.activeSynergies.filter(
    (pid) => Boolean(SYNERGY_POLICIES[pid]) && isSynergyPrerequisitesMet({ conglomerate: cong }, pid).met
  );

  const hasEngMfg = validPolicies.includes('ENG_TO_MFG');
  const hasMfgMining = validPolicies.includes('MFG_TO_MINING');
  const hasMfgServices = validPolicies.includes('MFG_TO_SERVICES');
  const hasIntelMining = validPolicies.includes('INTEL_TO_MINING');
  const hasIntelTreasury = validPolicies.includes('INTEL_TO_TREASURY');
  const hasUgBlack = validPolicies.includes('UG_BLACK_SILICON');

  const intelDiv = cong.businesses.MARKET_INTEL;
  const intelAutoSellBonus = hasIntelMining
    ? Number((0.035 + Math.min(5, intelDiv.level) * 0.01).toFixed(4))
    : 0;

  const fabNreDiscount =
    (hqSpec.nreDiscountPct / 100) + (hasEngMfg ? 0.12 : 0);

  return {
    hqEstablished: true,
    hqLevel: hqSpec.level,
    activePolicyIds: validPolicies,
    rpBonusMult: Number((1 + hqSpec.rpBonusPct / 100).toFixed(3)),
    miningAutoSellBonusPct: intelAutoSellBonus,
    wearReductionPct: hasMfgMining ? 0.12 : 0,
    rigPartDiscountMult: hasMfgMining ? 0.9 : 1,
    exchangeFeeMult: hasIntelTreasury ? 0.7 : 1,
    fabNreMult: Number(Math.max(0.65, 1 - fabNreDiscount).toFixed(3)),
    fabExtraThroughput: hasEngMfg ? 1 : 0,
    fabQualityRollBonus: hasEngMfg ? 0.025 : 0,
    blackMarketDiscountMult: hasUgBlack ? 0.85 : 1,
    scrutinyDecayBonus: hqSpec.scrutinyDecayBonus + (hasUgBlack ? 0.35 : 0),
    prBonusMult: hasIntelTreasury ? 1.2 : 1,
    servicesMarginBonusPct: hasMfgServices ? 0.18 : 0,
  };
}

export function computeConglomerateEquityUsd(
  state: Pick<GameState, 'conglomerate'>
): number {
  const cong = state.conglomerate;
  if (!cong) return 0;

  let equity = 0;
  for (const id of BUSINESS_ORDER) {
    if (id === 'MINING') continue;
    const div = cong.businesses[id];
    if (div.status === 'UNOWNED') continue;
    const baseVal = BASE_DIVISION_EQUITY_USD[id];
    const levelMult = 0.8 + div.level * 0.25;
    const statusMult = div.status === 'ACTIVE' ? 1.0 : 0.65;
    equity += baseVal * levelMult * statusMult;
  }

  if (cong.hq.established && cong.hq.hqLevel >= 1) {
    equity += getHQLevelSpec(cong.hq.hqLevel).equityValueUsd;
  }

  return Math.round(equity);
}

export function resolveSynergyQuery(query: string): SynergyPolicyId | undefined {
  const q = query.trim().toLowerCase().replace(/[-_\s]/g, '');
  if (!q) return undefined;
  const idx = parseInt(q, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= SYNERGY_ORDER.length) {
    return SYNERGY_ORDER[idx - 1];
  }
  const aliases: Record<string, SynergyPolicyId> = {
    syn1: 'ENG_TO_MFG',
    engtomfg: 'ENG_TO_MFG',
    engmfg: 'ENG_TO_MFG',
    codesign: 'ENG_TO_MFG',
    syn2: 'MFG_TO_MINING',
    mfgtomining: 'MFG_TO_MINING',
    mfgmining: 'MFG_TO_MINING',
    supply: 'MFG_TO_MINING',
    syn3: 'MFG_TO_SERVICES',
    mfgtoservices: 'MFG_TO_SERVICES',
    mfgservices: 'MFG_TO_SERVICES',
    racks: 'MFG_TO_SERVICES',
    syn4: 'INTEL_TO_MINING',
    inteltomining: 'INTEL_TO_MINING',
    intelmining: 'INTEL_TO_MINING',
    routing: 'INTEL_TO_MINING',
    syn5: 'INTEL_TO_TREASURY',
    inteltotreasury: 'INTEL_TO_TREASURY',
    inteltreasury: 'INTEL_TO_TREASURY',
    treasury: 'INTEL_TO_TREASURY',
    syn6: 'UG_BLACK_SILICON',
    ugblacksilicon: 'UG_BLACK_SILICON',
    blacksilicon: 'UG_BLACK_SILICON',
    ug: 'UG_BLACK_SILICON',
  };
  return aliases[q] ?? SYNERGY_ORDER.find((id) => id.toLowerCase().replace(/_/g, '') === q);
}

export function establishCorporateHQ(
  state: GameState,
  companyName?: string
): { ok: boolean; nextState: GameState; summary: string } {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (cong.hq.established) {
    return {
      ok: false,
      nextState: state,
      summary: `Corporate HQ ("${cong.hq.companyName}") is already established at Level ${cong.hq.hqLevel}. Use "hq upgrade" or "hq rename <name>".`,
    };
  }

  const ownedCount = getOwnedBusinessIds({ conglomerate: cong }).length;
  if (ownedCount < 2 && !state.isSandbox && !state.devUnlockAll) {
    return {
      ok: false,
      nextState: state,
      summary: `Corporate HQ requires owning at least 2 businesses (${ownedCount}/2 currently owned). Reach Gen 5 and acquire your first subsidiary first.`,
    };
  }

  if (state.cash < HQ_ESTABLISH_COST_USD) {
    return {
      ok: false,
      nextState: state,
      summary: `Establishing Corporate HQ requires ${formatUsd(HQ_ESTABLISH_COST_USD)} incorporation capital.`,
    };
  }

  const cleanName =
    companyName && companyName.trim()
      ? companyName.trim().slice(0, 36)
      : cong.hq.companyName;
  const stepLabel = formatStepLabel(state.stepCount);

  const nextHQ: CorporateHQState = {
    ...cong.hq,
    established: true,
    hqLevel: 1,
    companyName: cleanName,
    lastConsolidatedStep: state.stepCount,
  };

  let nextCong: ConglomerateState = {
    ...cong,
    hq: nextHQ,
  };
  nextCong = recordDivisionFinancials(nextCong, 'MINING', {
    expenseUsd: HQ_ESTABLISH_COST_USD,
  });

  const tx: TransactionEntry = {
    id: `tx_hq_est_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -HQ_ESTABLISH_COST_USD,
    description: `Incorporated Corporate HQ: ${cleanName} (Lv 1)`,
  };
  const news: NewsItem = {
    id: `news_hq_est_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Corporate HQ Incorporated: ${cleanName}`,
    detail: `Central governance & inter-division synergy policies unlocked! Run "hq synergy" to configure your first corporate policy.`,
    category: 'MILESTONE',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - HQ_ESTABLISH_COST_USD,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + HQ_ESTABLISH_COST_USD,
      },
    },
    summary: `Established "${cleanName}" Corporate HQ (Level 1 — 1 Synergy Slot, +3% RP boost) for ${formatUsd(HQ_ESTABLISH_COST_USD)}!`,
  };
}

export function upgradeCorporateHQ(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!cong.hq.established) {
    return {
      ok: false,
      nextState: state,
      summary: 'Establish Corporate HQ first with "hq establish".',
    };
  }
  if (cong.hq.hqLevel >= MAX_HQ_LEVEL) {
    return {
      ok: false,
      nextState: state,
      summary: `Corporate HQ is already at maximum Level ${MAX_HQ_LEVEL} (${HQ_LEVEL_SPECS[MAX_HQ_LEVEL].title}).`,
    };
  }

  const nextLevel = cong.hq.hqLevel + 1;
  const spec = getHQLevelSpec(nextLevel);
  const ownedCount = getOwnedBusinessIds({ conglomerate: cong }).length;
  if (ownedCount < spec.minOwnedBusinesses && !state.isSandbox && !state.devUnlockAll) {
    return {
      ok: false,
      nextState: state,
      summary: `HQ Level ${nextLevel} (${spec.title}) requires owning at least ${spec.minOwnedBusinesses} businesses (currently ${ownedCount}/6).`,
    };
  }

  if (state.cash < spec.upgradeCostUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `HQ Level ${nextLevel} expansion requires ${formatUsd(spec.upgradeCostUsd)} (have ${formatUsd(state.cash)}).`,
    };
  }

  const stepLabel = formatStepLabel(state.stepCount);
  const nextCong: ConglomerateState = {
    ...cong,
    hq: {
      ...cong.hq,
      hqLevel: nextLevel,
    },
  };

  const tx: TransactionEntry = {
    id: `tx_hq_upg_${nextLevel}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -spec.upgradeCostUsd,
    description: `Upgraded Corporate HQ to Level ${nextLevel} (${spec.title})`,
  };
  const news: NewsItem = {
    id: `news_hq_upg_${nextLevel}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Corporate HQ Expanded -> Lv ${nextLevel}: ${spec.title}`,
    detail: `Synergy capacity raised to ${spec.maxSynergies} policies (+${spec.rpBonusPct}% RP, -${spec.nreDiscountPct}% Fab NRE).`,
    category: 'MILESTONE',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - spec.upgradeCostUsd,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + spec.upgradeCostUsd,
      },
    },
    summary: `Upgraded Corporate HQ to Level ${nextLevel} (${spec.title}) for ${formatUsd(spec.upgradeCostUsd)}! Max synergies: ${spec.maxSynergies}, RP boost: +${spec.rpBonusPct}%.`,
  };
}

export function renameCorporateHQ(
  state: GameState,
  newName: string
): { ok: boolean; nextState: GameState; summary: string } {
  const clean = newName.trim().slice(0, 36);
  if (!clean) {
    return { ok: false, nextState: state, summary: 'Specify a valid corporation name.' };
  }
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        hq: {
          ...cong.hq,
          companyName: clean,
        },
      },
    },
    summary: `Renamed holding corporation to "${clean}".`,
  };
}

export function toggleSynergyPolicy(
  state: GameState,
  query: string
): { ok: boolean; nextState: GameState; summary: string } {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!cong.hq.established) {
    return {
      ok: false,
      nextState: state,
      summary: 'Establish Corporate HQ first ("hq establish") before activating inter-division synergies.',
    };
  }

  const policyId = resolveSynergyQuery(query);
  if (!policyId) {
    return {
      ok: false,
      nextState: state,
      summary: `Unknown synergy policy "${query}". Run "hq synergy" to list policy numbers (1..6) and codes.`,
    };
  }

  const spec = SYNERGY_POLICIES[policyId];
  const isActive = cong.hq.activeSynergies.includes(policyId);

  if (isActive) {
    const nextList = cong.hq.activeSynergies.filter((id) => id !== policyId);
    return {
      ok: true,
      nextState: {
        ...state,
        conglomerate: {
          ...cong,
          hq: {
            ...cong.hq,
            activeSynergies: nextList,
          },
        },
      },
      summary: `Deactivated synergy [${spec.code}] ${spec.name}.`,
    };
  }

  const hqSpec = getHQLevelSpec(cong.hq.hqLevel);
  if (cong.hq.activeSynergies.length >= hqSpec.maxSynergies) {
    return {
      ok: false,
      nextState: state,
      summary: `Synergy capacity full (${cong.hq.activeSynergies.length}/${hqSpec.maxSynergies} slots at HQ Lv ${cong.hq.hqLevel}). Upgrade HQ or deactivate an existing synergy.`,
    };
  }

  const prereq = isSynergyPrerequisitesMet({ conglomerate: cong }, policyId);
  if (!prereq.met) {
    return {
      ok: false,
      nextState: state,
      summary: `Cannot activate ${spec.name}: ${prereq.reason}`,
    };
  }

  const nextList = [...cong.hq.activeSynergies, policyId];
  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        hq: {
          ...cong.hq,
          activeSynergies: nextList,
        },
      },
    },
    summary: `Activated synergy [${spec.code}] ${spec.name}: ${spec.impactDetail}.`,
  };
}

export function formatSynergiesReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const hq = cong.hq;
  const hqSpec = hq.established ? getHQLevelSpec(hq.hqLevel) : null;

  const rows = SYNERGY_ORDER.map((id, idx) => {
    const spec = SYNERGY_POLICIES[id];
    const active = hq.activeSynergies.includes(id);
    const prereq = isSynergyPrerequisitesMet({ conglomerate: cong }, id);
    const badge = active ? '[ACTIVE] ' : prereq.met ? '[READY]  ' : '[LOCKED] ';
    const reqText = active || prereq.met ? spec.impactDetail : `Locked: ${prereq.reason}`;
    return [
      `  #${idx + 1} ${badge} ${spec.code} ${spec.name}`,
      `     Link   : ${spec.summary}`,
      `     Effect : ${reqText}`,
    ].join('\n');
  });

  return [
    `  INTER-BUSINESS SYNERGY BOARD — ${hq.companyName}`,
    hq.established && hqSpec
      ? `  HQ Status : Level ${hq.hqLevel} (${hqSpec.title}) · Slots Used: ${hq.activeSynergies.length}/${hqSpec.maxSynergies} · Lifetime Synergy Value: ${formatUsd(hq.totalSynergyValueUsd)}`
      : `  HQ Status : NOT ESTABLISHED (Acquire 2+ businesses & run "hq establish" for ${formatUsd(HQ_ESTABLISH_COST_USD)})`,
    '',
    ...rows,
    '',
    `  COMMAND: "hq synergy toggle <# | code>"`,
  ].join('\n');
}

export function formatCorporateHQReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const hq = cong.hq;
  const owned = getOwnedBusinessIds(state);
  const effects = getCorporateSynergyEffects(state);

  if (!hq.established) {
    return [
      `  CORPORATE HEADQUARTERS — ${hq.companyName} [UNINCORPORATED]`,
      `  Businesses Owned : ${owned.length}/6 (${owned.map((id) => BUSINESS_CATALOG[id].shortName).join(', ')})`,
      `  Incorporation    : Own 2+ businesses (or Sandbox) + ${formatUsd(HQ_ESTABLISH_COST_USD)} to incorporate HQ Lv 1.`,
      `  Benefits         : Synergy Policy slots, conglomerate RP bonuses, governance compliance shields & HQ equity.`,
      '',
      `  COMMAND: "hq establish [Corporation Name]" · "corp" · "acquire"`,
    ].join('\n');
  }

  const curSpec = getHQLevelSpec(hq.hqLevel);
  const nextSpec = hq.hqLevel < MAX_HQ_LEVEL ? getHQLevelSpec(hq.hqLevel + 1) : null;
  const activePolicies = effects.activePolicyIds.map((id) => SYNERGY_POLICIES[id].name);

  let totalRev = 0;
  let totalExp = 0;
  let totalInternal = 0;
  for (const id of BUSINESS_ORDER) {
    const l = cong.businesses[id].ledger;
    totalRev += l.totalRevenueUsd;
    totalExp += l.totalExpenseUsd;
    totalInternal += l.totalInternalCreditsUsd;
  }

  return [
    `  CORPORATE HEADQUARTERS — ${hq.companyName}`,
    `  Executive Tier   : Level ${hq.hqLevel}/${MAX_HQ_LEVEL} — ${curSpec.title}`,
    `  Divisions Owned  : ${owned.length}/6 · HQ Equity Value: ${formatUsd(curSpec.equityValueUsd)}`,
    `  HQ Perks         : +${curSpec.rpBonusPct}% Research RP · -${Math.round((1 - effects.fabNreMult) * 100)}% Fab NRE · -${effects.scrutinyDecayBonus.toFixed(2)}/st Scrutiny Shield`,
    `  Cycle Governance : ${formatUsd(curSpec.cycleUpkeepUsd)} / 30-step cycle`,
    `  Synergy Slots    : ${hq.activeSynergies.length}/${curSpec.maxSynergies} Active (${activePolicies.length > 0 ? activePolicies.join(', ') : 'None'})`,
    `  Lifetime Synergy : ${formatUsd(hq.totalSynergyValueUsd)} value realized`,
    `  Consolidated P&L : Cash Rev ${formatUsd(totalRev)} | Cash Exp ${formatUsd(totalExp)} | Internal Credits ${formatUsd(totalInternal)} | Net ${totalRev - totalExp >= 0 ? '+' : ''}${formatUsd(totalRev - totalExp)}`,
    ...(nextSpec
      ? [
          `  Next HQ Upgrade  : Lv ${nextSpec.level} (${nextSpec.title}) — ${formatUsd(nextSpec.upgradeCostUsd)} (Req: ${nextSpec.minOwnedBusinesses}/6 businesses, ${nextSpec.maxSynergies} synergy slots)`,
        ]
      : ['  Next HQ Upgrade  : MAX LEVEL REACHED']),
    '',
    `  COMMANDS: "hq upgrade" | "hq rename <name>" | "hq synergy [toggle <#>]" | "corp ledger" | "corp upgrade <biz>"`,
  ].join('\n');
}

export function hasOwnedDivision(state: Pick<GameState, 'conglomerate'>, id: BusinessId): boolean {
  return isBusinessOwned(state, id);
}
