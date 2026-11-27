import {
  CoinSymbol,
  ConglomerateState,
  GameState,
  MarketIntelDivisionState,
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
import { analyzeCoinForecast } from './marketForecast';

export const MAX_INTEL_MODEL_TIER = 5;

const MODEL_TIER_NAMES: Record<number, string> = {
  1: 'Baseline Order-Book Regression',
  2: 'Multi-Factor Sentiment Ensemble',
  3: 'Cross-Exchange Arbitrage Neural Net',
  4: 'Macro Regime Transformer Engine',
  5: 'Institutional Predictive Oracle',
};

const MODEL_UPGRADE_COSTS: Record<number, number> = {
  1: 45_000,
  2: 110_000,
  3: 240_000,
  4: 520_000,
};

function requireActiveMarketIntel(state: GameState): {
  ok: boolean;
  reason?: string;
  cong: ConglomerateState;
} {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  if (!isBusinessOwned({ conglomerate: cong }, 'MARKET_INTEL')) {
    return {
      ok: false,
      cong,
      reason: 'Market Intelligence division is not owned yet. Reach Gen 5+ and acquire it via "acquire".',
    };
  }
  if (!isBusinessActive({ conglomerate: cong }, 'MARKET_INTEL')) {
    const div = cong.businesses.MARKET_INTEL;
    return {
      ok: false,
      cong,
      reason: `Market Intelligence (${div.acquiredCompanyName ?? div.name}) is RECOVERING (${div.recoveryStepsRemaining}st left). Fund stabilization with "corp turnaround market_intel".`,
    };
  }
  return { ok: true, cong };
}

export function getMaxIntelSubscriptions(
  state: Pick<GameState, 'employees'>,
  intel: MarketIntelDivisionState,
  divLevel: number
): number {
  const analysts = (state.employees ?? []).filter((e) => e.role === 'ANALYST').length;
  return 4 + intel.modelTier * 3 + divLevel * 2 + analysts * 2;
}

export function getSubscriptionStepRevenueUsd(
  intel: MarketIntelDivisionState,
  efficiencyMult: number
): number {
  if (intel.activeSubscriptions <= 0) return 0;
  const accuracyMult = 0.72 + intel.predictionAccuracyPct / 140;
  return Number(
    (intel.activeSubscriptions * 380 * intel.modelTier * accuracyMult * efficiencyMult).toFixed(2)
  );
}

/**
 * Calibrates forecasting models, refreshes live market signals, and produces RP & accuracy gains.
 */
export function runMarketForecastModel(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMarketIntel(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const intel = cong.marketIntel;
  const div = cong.businesses.MARKET_INTEL;

  const cooldown = 3;
  if (
    typeof intel.lastModelRunStep === 'number' &&
    state.stepCount - intel.lastModelRunStep < cooldown
  ) {
    const rem = cooldown - (state.stepCount - intel.lastModelRunStep);
    return {
      ok: false,
      nextState: state,
      summary: `Forecast model cluster recalibrating (${rem} step${rem === 1 ? '' : 's'} remaining).`,
    };
  }

  const runCost = 1_500 + intel.modelTier * 1_250;
  if (state.cash < runCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Forecast calibration requires ${formatUsd(runCost)} compute budget.`,
    };
  }

  const analysts = (state.employees ?? []).filter((e) => e.role === 'ANALYST');
  const analystBoost = analysts.reduce((s, a) => s + (a.skillLevel ?? 1) * 0.6, 0);
  const accGain = Number(Math.min(4.2, 1.4 + intel.modelTier * 0.45 + analystBoost * 0.3).toFixed(2));
  const nextAccuracy = Number(Math.min(97, intel.predictionAccuracyPct + accGain).toFixed(1));
  const rpGain = Number((5 + intel.modelTier * 3.5 + analystBoost).toFixed(1));

  const forecasts = (Object.keys(state.coins) as CoinSymbol[]).map((sym) =>
    analyzeCoinForecast(state.coins[sym], state)
  );
  const topPick = [...forecasts].sort((a, b) => b.projectedBiasPct - a.projectedBiasPct)[0];
  const score = Math.min(
    99,
    Math.round(nextAccuracy * 0.78 + intel.modelTier * 4 + (topPick ? Math.abs(topPick.projectedBiasPct) : 0))
  );

  let nextCong: ConglomerateState = {
    ...cong,
    marketIntel: {
      ...intel,
      predictionAccuracyPct: nextAccuracy,
      lastForecastScore: score,
      lastModelRunStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MARKET_INTEL', { expenseUsd: runCost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_intel_run_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -runCost,
    description: `Market Intel calibration (${MODEL_TIER_NAMES[intel.modelTier] ?? `Tier ${intel.modelTier}`})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - runCost,
      researchPoints: state.researchPoints + rpGain,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + runCost,
      },
    },
    summary: `Calibrated Tier-${intel.modelTier} model for ${formatUsd(runCost)} -> Accuracy ${nextAccuracy}% (+${accGain.toFixed(1)}%), Score ${score}/100, +${rpGain} RP. Top outlook: ${topPick?.symbol ?? 'BTC'} (${topPick?.signal ?? 'NEUTRAL'}, ${topPick && topPick.projectedBiasPct >= 0 ? '+' : ''}${topPick?.projectedBiasPct ?? 0}%).`,
  };
}

export function upgradePredictionModel(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMarketIntel(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const intel = cong.marketIntel;

  if (intel.modelTier >= MAX_INTEL_MODEL_TIER) {
    return {
      ok: false,
      nextState: state,
      summary: `Forecasting stack is already at Tier ${MAX_INTEL_MODEL_TIER} (${MODEL_TIER_NAMES[MAX_INTEL_MODEL_TIER]}).`,
    };
  }

  const cost = MODEL_UPGRADE_COSTS[intel.modelTier] ?? 520_000;
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Upgrading forecasting engine to Tier ${intel.modelTier + 1} requires ${formatUsd(cost)}.`,
    };
  }

  const nextTier = intel.modelTier + 1;
  const nextAcc = Number(Math.min(97, intel.predictionAccuracyPct + 4.5).toFixed(1));
  let nextCong: ConglomerateState = {
    ...cong,
    marketIntel: {
      ...intel,
      modelTier: nextTier,
      predictionAccuracyPct: nextAcc,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MARKET_INTEL', { expenseUsd: cost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_intel_tier_${nextTier}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -cost,
    description: `Upgraded Market Intel Model -> Tier ${nextTier}`,
  };
  const news: NewsItem = {
    id: `news_intel_tier_${nextTier}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Market Intel Deployed Tier-${nextTier} Model`,
    detail: `${MODEL_TIER_NAMES[nextTier]} online — accuracy lifted to ${nextAcc}% and subscription ARPU increased.`,
    category: 'MARKET',
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
    summary: `Upgraded prediction engine to Tier ${nextTier} (${MODEL_TIER_NAMES[nextTier]}) for ${formatUsd(cost)} — Accuracy now ${nextAcc}%!`,
  };
}

export function expandIntelSubscriptions(
  state: GameState,
  count = 1
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMarketIntel(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const intel = cong.marketIntel;
  const div = cong.businesses.MARKET_INTEL;
  const cap = getMaxIntelSubscriptions(state, intel, div.level);

  if (intel.activeSubscriptions >= cap) {
    return {
      ok: false,
      nextState: state,
      summary: `Institutional feed capacity full (${intel.activeSubscriptions}/${cap} seats). Upgrade model tier ("intel upgrade"), upgrade division ("corp upgrade intel"), or hire an Analyst.`,
    };
  }

  const seatsToAdd = Math.max(1, Math.min(cap - intel.activeSubscriptions, Math.floor(count)));
  const acquisitionCost = seatsToAdd * (5_500 + intel.modelTier * 2_500);
  if (state.cash < acquisitionCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Onboarding ${seatsToAdd} data subscription(s) costs ${formatUsd(acquisitionCost)}.`,
    };
  }

  const nextSubs = intel.activeSubscriptions + seatsToAdd;
  const nextIntel: MarketIntelDivisionState = {
    ...intel,
    activeSubscriptions: nextSubs,
  };
  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MARKET_INTEL: {
        ...div,
        reputation: Math.min(100, div.reputation + seatsToAdd),
      },
    },
    marketIntel: nextIntel,
  };
  nextCong = recordDivisionFinancials(nextCong, 'MARKET_INTEL', { expenseUsd: acquisitionCost });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_intel_sub_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: -acquisitionCost,
    description: `Onboarded ${seatsToAdd} Market Intel subscriber seat(s)`,
  };
  const recurringPerStep = getSubscriptionStepRevenueUsd(nextIntel, div.efficiencyMult);

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - acquisitionCost,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + acquisitionCost,
      },
    },
    summary: `Onboarded +${seatsToAdd} institutional data subscriber(s) for ${formatUsd(acquisitionCost)} (${nextSubs}/${cap} active · ${formatUsd(recurringPerStep)}/step gross recurring).`,
  };
}

export function sellPredictionSoftwareLicenses(
  state: GameState,
  packs = 1
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMarketIntel(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const intel = cong.marketIntel;
  const div = cong.businesses.MARKET_INTEL;

  const cooldown = 4;
  if (
    typeof intel.lastLicenseSaleStep === 'number' &&
    state.stepCount - intel.lastLicenseSaleStep < cooldown
  ) {
    const rem = cooldown - (state.stepCount - intel.lastLicenseSaleStep);
    return {
      ok: false,
      nextState: state,
      summary: `Enterprise licensing pipeline recharging (${rem} step${rem === 1 ? '' : 's'} until next buyer cohort).`,
    };
  }

  const cleanPacks = Math.max(1, Math.min(3, Math.floor(packs)));
  const unitValue =
    14_000 *
    intel.modelTier *
    (0.65 + intel.predictionAccuracyPct / 110) *
    div.efficiencyMult;
  const grossRevenue = Math.round(unitValue * cleanPacks);

  let nextCong: ConglomerateState = {
    ...cong,
    businesses: {
      ...cong.businesses,
      MARKET_INTEL: {
        ...div,
        reputation: Math.min(100, div.reputation + cleanPacks),
      },
    },
    marketIntel: {
      ...intel,
      softwareLicensesSold: intel.softwareLicensesSold + cleanPacks,
      lastLicenseSaleStep: state.stepCount,
    },
  };
  nextCong = recordDivisionFinancials(nextCong, 'MARKET_INTEL', { revenueUsd: grossRevenue });

  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_intel_lic_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'CORPORATE',
    amountUsd: grossRevenue,
    description: `Sold ${cleanPacks}x Tier-${intel.modelTier} Prediction Software license(s)`,
  };
  const news: NewsItem = {
    id: `news_intel_lic_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Prediction Software Licensed (+${formatUsd(grossRevenue)})`,
    detail: `Sold ${cleanPacks} enterprise license package(s) of ${MODEL_TIER_NAMES[intel.modelTier] ?? `Tier-${intel.modelTier}`}.`,
    category: 'MARKET',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + grossRevenue,
      conglomerate: nextCong,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
    },
    summary: `Sold ${cleanPacks} prediction software license pack(s) for +${formatUsd(grossRevenue)}! (Total sold: ${intel.softwareLicensesSold + cleanPacks})`,
  };
}

export function toggleIntelAdvisory(
  state: GameState
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = requireActiveMarketIntel(state);
  if (!gate.ok) {
    return { ok: false, nextState: state, summary: gate.reason! };
  }
  const cong = gate.cong;
  const nextAdvisory = !cong.marketIntel.advisoryActive;

  return {
    ok: true,
    nextState: {
      ...state,
      conglomerate: {
        ...cong,
        marketIntel: {
          ...cong.marketIntel,
          advisoryActive: nextAdvisory,
        },
      },
    },
    summary: nextAdvisory
      ? 'Corporate Advisory Desk ACTIVE: live forecast calibration & +RP research telemetry enabled across your conglomerate.'
      : 'Corporate Advisory Desk placed on STANDBY.',
  };
}

/**
 * Steps recurring Market Intelligence subscriptions, overhead, and live forecast telemetry.
 * Deterministic and RNG-free.
 */
export function stepMarketIntelDivision(
  state: GameState,
  congInput: ConglomerateState,
  nextStep: number
): {
  conglomerate: ConglomerateState;
  cashDeltaUsd: number;
  rpBonus: number;
} {
  if (!isBusinessActive({ conglomerate: congInput }, 'MARKET_INTEL')) {
    return { conglomerate: congInput, cashDeltaUsd: 0, rpBonus: 0 };
  }

  let cong = congInput;
  const div = cong.businesses.MARKET_INTEL;
  const intel = cong.marketIntel;

  const grossSubRev = getSubscriptionStepRevenueUsd(intel, div.efficiencyMult);
  const deskOpCost = Number((140 * intel.modelTier + (intel.advisoryActive ? 160 : 0)).toFixed(2));
  const netCash = Number((grossSubRev - deskOpCost).toFixed(2));

  // Advisory desk emits subtle RP research telemetry & refreshes forecast score deterministically
  let nextAcc = intel.predictionAccuracyPct;
  let rpBonus = 0;
  if (intel.advisoryActive) {
    rpBonus = Number((0.4 + intel.modelTier * 0.25).toFixed(2));
    if (nextStep % 6 === 0 && nextAcc < 92) {
      nextAcc = Number(Math.min(92, nextAcc + 0.2).toFixed(1));
    }
  }

  const forecastScore = Math.min(
    99,
    Math.round(nextAcc * 0.8 + intel.modelTier * 3.5 + (intel.advisoryActive ? 3 : 0))
  );

  cong = {
    ...cong,
    marketIntel: {
      ...intel,
      predictionAccuracyPct: nextAcc,
      lastForecastScore: forecastScore,
    },
  };
  cong = recordDivisionFinancials(cong, 'MARKET_INTEL', {
    revenueUsd: grossSubRev,
    expenseUsd: deskOpCost,
    setStepSnapshot: true,
  });

  return {
    conglomerate: cong,
    cashDeltaUsd: netCash,
    rpBonus,
  };
}

export function formatMarketIntelReport(state: GameState): string {
  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const div = cong.businesses.MARKET_INTEL;
  const intel = cong.marketIntel;
  const cap = getMaxIntelSubscriptions(state, intel, div.level);
  const subStepRev = isBusinessActive({ conglomerate: cong }, 'MARKET_INTEL')
    ? getSubscriptionStepRevenueUsd(intel, div.efficiencyMult)
    : 0;
  const upgCost =
    intel.modelTier < MAX_INTEL_MODEL_TIER
      ? formatUsd(MODEL_UPGRADE_COSTS[intel.modelTier] ?? 520_000)
      : 'MAX TIER';

  const pnl = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd + div.ledger.totalInternalCreditsUsd;

  return [
    `  BUSINESS 2 // MARKET INTELLIGENCE — ${div.acquiredCompanyName ?? div.name}`,
    `    Status          : ${div.status}${div.status === 'RECOVERING' ? ` (${div.recoveryStepsRemaining}st left — "corp turnaround market_intel")` : ` · Div Lv ${div.level}/5 · Eff ${Math.round(div.efficiencyMult * 100)}%`}`,
    `    Forecast Engine : Tier ${intel.modelTier}/${MAX_INTEL_MODEL_TIER} — ${MODEL_TIER_NAMES[intel.modelTier] ?? 'Custom Quant'} (Next Tier: ${upgCost})`,
    `    Accuracy / Score: ${intel.predictionAccuracyPct.toFixed(1)}% · Live Score ${intel.lastForecastScore}/100`,
    `    Subscriptions   : ${intel.activeSubscriptions}/${cap} institutional feeds (${formatUsd(subStepRev)}/step gross)`,
    `    Software Sales  : ${intel.softwareLicensesSold} enterprise license packs sold`,
    `    Corp Advisory   : ${intel.advisoryActive ? 'ACTIVE (+RP quant telemetry & model tuning)' : 'STANDBY'}`,
    `    Division P&L    : Rev ${formatUsd(div.ledger.totalRevenueUsd)} | Exp ${formatUsd(div.ledger.totalExpenseUsd)} | Syn Credits +${formatUsd(div.ledger.totalInternalCreditsUsd)} | Net ${pnl >= 0 ? '+' : ''}${formatUsd(pnl)}`,
    '',
    `  COMMANDS:`,
    `    intel forecast       Calibrate forecasting model (+accuracy, +RP & top signal)`,
    `    intel upgrade        Upgrade predictive engine to next model tier`,
    `    intel sub [qty]      Onboard institutional data subscribers`,
    `    intel license [1..3] Sell prediction software license packs`,
    `    intel advisory       Toggle internal conglomerate trading advisory`,
  ].join('\n');
}
