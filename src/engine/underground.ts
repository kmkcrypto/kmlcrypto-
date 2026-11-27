import {
  CoinSymbol,
  GameState,
  InvestigationStage,
  NewsItem,
  PreparedRaidPlan,
  RaidApproachId,
  ShellCoinState,
  TransactionEntry,
  UndergroundOpRecord,
  UndergroundState,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';

export const SHELL_COIN_DEV_COST = 900;
export const SHELL_COIN_LAUNCH_COST = 2500;
export const SHELL_COIN_MAX_ACTIVE = 3;
export const SHELL_COIN_START_PRICE = 0.05;
export const SHELL_COIN_SUPPLY = 1_000_000;
export const SHELL_SHILL_COST = 750;
export const RAID_PREP_COST = 1200;
export const RAID_COOLDOWN_STEPS = 18;
export const RAID_BONUS_STEPS = 8;

export type UndergroundResult =
  | { ok: false; reason: string }
  | { ok: true; nextState: GameState; summary: string; cost?: number };

function makeTx(
  step: number,
  amountUsd: number,
  description: string
): TransactionEntry {
  return {
    id: `tx_${step}_ug_${Math.random().toString(36).slice(2, 7)}`,
    step,
    stepLabel: formatStepLabel(step),
    category: 'EVENT',
    amountUsd,
    description,
  };
}

export function appendUndergroundRecord(
  underground: UndergroundState,
  step: number,
  opType: UndergroundOpRecord['opType'],
  summary: string,
  outcome: UndergroundOpRecord['outcome'],
  cashDeltaUsd = 0,
  heatDelta = 0,
  repDelta = 0
): UndergroundState {
  const rec: UndergroundOpRecord = {
    id: `uop_${step}_${opType}_${Math.random().toString(36).slice(2, 6)}`,
    step,
    stepLabel: formatStepLabel(step),
    opType,
    summary,
    outcome,
    cashDeltaUsd: Math.round(cashDeltaUsd),
    heatDelta: Math.round(heatDelta * 10) / 10,
    repDelta: Math.round(repDelta * 10) / 10,
  };
  return {
    ...underground,
    operationRecords: [rec, ...(underground.operationRecords ?? [])].slice(0, 80),
  };
}

export function getShellCoins(state: Pick<GameState, 'underground'>): ShellCoinState[] {
  return state.underground.shellCoins ?? [];
}

export function findShellCoin(
  state: Pick<GameState, 'underground'>,
  ticker: string
): ShellCoinState | undefined {
  const needle = ticker.trim().toUpperCase();
  return getShellCoins(state).find((c) => c.ticker === needle);
}

/** Phase 1 of deep shell-coin lifecycle: develop whitepaper & contract concept. */
export function developShellCoin(
  prev: GameState,
  tickerInput: string,
  nameInput: string
): UndergroundResult {
  const ticker = tickerInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return { ok: false, reason: 'Ticker must be 2-6 letters/numbers (e.g. "ops coin dev MOON Moon Coin").' };
  }
  if (prev.coins[ticker as CoinSymbol]) {
    return { ok: false, reason: `${ticker} is a real listed coin — pick a different ticker.` };
  }
  if (findShellCoin(prev, ticker)) {
    return { ok: false, reason: `Shell coin $${ticker} already exists in your registry.` };
  }
  const active = getShellCoins(prev).filter((c) => !c.rugged && c.stage !== 'COLLAPSED');
  if (active.length >= SHELL_COIN_MAX_ACTIVE) {
    return { ok: false, reason: `You already run ${SHELL_COIN_MAX_ACTIVE} shell coins. Rug or close one first.` };
  }
  if (prev.cash < SHELL_COIN_DEV_COST) {
    return { ok: false, reason: `Insufficient cash (need ${formatUsd(SHELL_COIN_DEV_COST)}).` };
  }

  const name = (nameInput || `${ticker} Protocol`).slice(0, 28);
  const coin: ShellCoinState = {
    ticker,
    name,
    launchedStep: prev.stepCount,
    stage: 'CONCEPT',
    auditSpoofed: false,
    priceUsd: 0.01,
    hype: 18,
    liquidityUsd: 0,
    supply: SHELL_COIN_SUPPLY,
    extractedUsd: 0,
    rugged: false,
  };

  const summary = `Drafted shell token $${ticker} ("${name}") in CONCEPT stage for ${formatUsd(
    SHELL_COIN_DEV_COST
  )} (+5 Heat). Next: "ops coin seed ${ticker} <usd> [spoof]".`;
  const nextUnderground = appendUndergroundRecord(
    {
      ...prev.underground,
      shellCoins: [...getShellCoins(prev), coin],
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 4,
    },
    prev.stepCount,
    'SHELL_DEV',
    summary,
    'SUCCESS',
    -SHELL_COIN_DEV_COST,
    5,
    0
  );

  return {
    ok: true,
    cost: SHELL_COIN_DEV_COST,
    summary,
    nextState: {
      ...prev,
      cash: prev.cash - SHELL_COIN_DEV_COST,
      regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 5),
      currentCycleStats: {
        ...prev.currentCycleStats,
        otherSpendUsd: prev.currentCycleStats.otherSpendUsd + SHELL_COIN_DEV_COST,
      },
      transactions: [
        makeTx(prev.stepCount, -SHELL_COIN_DEV_COST, `Shell token dev & whitepaper ($${ticker})`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      underground: nextUnderground,
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    },
  };
}

/** Phase 2 of deep shell-coin lifecycle: seed pool liquidity and optionally spoof a fake security audit. */
export function seedShellCoinLiquidity(
  prev: GameState,
  tickerInput: string,
  addLiquidityUsd = 1500,
  spoofAudit = false
): UndergroundResult {
  const coin = findShellCoin(prev, tickerInput);
  if (!coin) return { ok: false, reason: `No shell coin "$${tickerInput.toUpperCase()}" found.` };
  if (coin.rugged || coin.stage === 'COLLAPSED') {
    return { ok: false, reason: `$${coin.ticker} is already dead.` };
  }
  const liq = Math.max(500, Math.round(addLiquidityUsd));
  const spoofFee = spoofAudit && !coin.auditSpoofed ? 1200 : 0;
  const totalCost = liq + spoofFee;
  if (prev.cash < totalCost) {
    return { ok: false, reason: `Need ${formatUsd(totalCost)} to seed liquidity${spoofFee > 0 ? ' + spoof audit' : ''}.` };
  }
  const heatGain = 6 + (spoofFee > 0 ? 10 : 0);
  const hypeGain = 16 + (spoofAudit ? 18 : 0);
  const nextPrice = Number(Math.max(SHELL_COIN_START_PRICE, coin.priceUsd * (spoofAudit ? 1.55 : 1.25)).toFixed(4));
  const nextStage: ShellCoinState['stage'] = coin.stage === 'ACTIVE' ? 'ACTIVE' : 'SEEDED';

  const updatedCoins = getShellCoins(prev).map((c) =>
    c.ticker === coin.ticker
      ? {
          ...c,
          stage: nextStage,
          auditSpoofed: c.auditSpoofed || spoofAudit,
          liquidityUsd: c.liquidityUsd + Math.round(liq * 0.92),
          hype: Math.min(100, c.hype + hypeGain),
          priceUsd: nextPrice,
        }
      : c
  );

  const summary = `Seeded $${coin.ticker} (${nextStage}) with ${formatUsd(liq)}${
    spoofAudit ? ' + spoofed audit badge' : ''
  }. Pool ${formatUsd(coin.liquidityUsd + Math.round(liq * 0.92))} (+${heatGain} Heat).`;
  const nextUnderground = appendUndergroundRecord(
    {
      ...prev.underground,
      shellCoins: updatedCoins,
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + (spoofAudit ? 10 : 5),
    },
    prev.stepCount,
    'SHELL_DEV',
    summary,
    'SUCCESS',
    -totalCost,
    heatGain,
    spoofAudit ? -2 : 0
  );

  return {
    ok: true,
    cost: totalCost,
    summary,
    nextState: {
      ...prev,
      cash: prev.cash - totalCost,
      regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + heatGain),
      mediaCredibility: spoofAudit ? Math.max(5, prev.mediaCredibility - 2) : prev.mediaCredibility,
      currentCycleStats: {
        ...prev.currentCycleStats,
        otherSpendUsd: prev.currentCycleStats.otherSpendUsd + totalCost,
      },
      transactions: [
        makeTx(prev.stepCount, -totalCost, `Seeded shell pool ($${coin.ticker})${spoofAudit ? ' + audit spoof' : ''}`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      underground: nextUnderground,
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    },
  };
}

/** Launch a scam token directly (or promote CONCEPT/SEEDED to ACTIVE). Costs cash and draws regulator attention. */
export function launchShellCoin(
  prev: GameState,
  tickerInput: string,
  nameInput: string
): UndergroundResult {
  const ticker = tickerInput.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return { ok: false, reason: 'Ticker must be 2-6 letters/numbers (e.g. "ops coin MOON Moon Coin").' };
  }
  if (prev.coins[ticker as CoinSymbol]) {
    return { ok: false, reason: `${ticker} is a real listed coin — pick a different ticker.` };
  }
  const existing = findShellCoin(prev, ticker);
  if (existing && (existing.stage === 'CONCEPT' || existing.stage === 'SEEDED')) {
    if (prev.cash < 800) {
      return { ok: false, reason: 'Insufficient cash ($800 needed for public DEX listing).' };
    }
    const updatedCoins = getShellCoins(prev).map((c) =>
      c.ticker === existing.ticker
        ? {
            ...c,
            stage: 'ACTIVE' as const,
            launchedStep: prev.stepCount,
            hype: Math.min(100, Math.max(46, c.hype + 22)),
            liquidityUsd: Math.max(1200, c.liquidityUsd + 600),
            priceUsd: Math.max(SHELL_COIN_START_PRICE, c.priceUsd * 1.35),
          }
        : c
    );
    const summary = `Listed $${existing.ticker} ("${existing.name}") onto shadow DEX as ACTIVE token (+10 Heat).`;
    const nextUnderground = appendUndergroundRecord(
      {
        ...prev.underground,
        shellCoins: updatedCoins,
        suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 9,
      },
      prev.stepCount,
      'SHELL_LAUNCH',
      summary,
      'SUCCESS',
      -800,
      10,
      -2
    );
    return {
      ok: true,
      cost: 800,
      summary,
      nextState: {
        ...prev,
        cash: prev.cash - 800,
        regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 10),
        mediaCredibility: Math.max(5, prev.mediaCredibility - 2),
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + 800,
        },
        transactions: [
          makeTx(prev.stepCount, -800, `Shell coin DEX listing ($${existing.ticker})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        underground: nextUnderground,
        stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
      },
    };
  }

  const active = getShellCoins(prev).filter((c) => !c.rugged);
  if (active.length >= SHELL_COIN_MAX_ACTIVE) {
    return { ok: false, reason: `You already run ${SHELL_COIN_MAX_ACTIVE} shell coins. Rug one first.` };
  }
  if (prev.cash < SHELL_COIN_LAUNCH_COST) {
    return { ok: false, reason: `Insufficient cash (need ${formatUsd(SHELL_COIN_LAUNCH_COST)}).` };
  }
  const name = (nameInput || `${ticker} Coin`).slice(0, 28);
  const coin: ShellCoinState = {
    ticker,
    name,
    launchedStep: prev.stepCount,
    stage: 'ACTIVE',
    auditSpoofed: false,
    priceUsd: SHELL_COIN_START_PRICE,
    hype: 42,
    liquidityUsd: Math.round(SHELL_COIN_LAUNCH_COST * 0.8),
    supply: SHELL_COIN_SUPPLY,
    extractedUsd: 0,
    rugged: false,
  };
  const summary = `Launched $${ticker} ("${name}") at ${formatUsd(
    SHELL_COIN_START_PRICE
  )} with ${formatUsd(coin.liquidityUsd)} of liquidity (+18 Heat).`;
  const nextUnderground = appendUndergroundRecord(
    {
      ...prev.underground,
      shellCoins: [...getShellCoins(prev), coin],
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 12,
    },
    prev.stepCount,
    'SHELL_LAUNCH',
    summary,
    'SUCCESS',
    -SHELL_COIN_LAUNCH_COST,
    18,
    -3
  );
  const nextState: GameState = {
    ...prev,
    cash: prev.cash - SHELL_COIN_LAUNCH_COST,
    regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 18),
    mediaCredibility: Math.max(5, prev.mediaCredibility - 3),
    currentCycleStats: {
      ...prev.currentCycleStats,
      otherSpendUsd: prev.currentCycleStats.otherSpendUsd + SHELL_COIN_LAUNCH_COST,
    },
    transactions: [
      makeTx(prev.stepCount, -SHELL_COIN_LAUNCH_COST, `Shell coin launch ($${ticker})`),
      ...(prev.transactions ?? []),
    ].slice(0, 200),
    underground: nextUnderground,
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    cost: SHELL_COIN_LAUNCH_COST,
    summary,
  };
}

/** Buy manufactured hype for a shell coin and deepen its thin pool. */
export function shillShellCoin(prev: GameState, ticker: string): UndergroundResult {
  const coin = findShellCoin(prev, ticker);
  if (!coin) return { ok: false, reason: `No shell coin "$${ticker.toUpperCase()}" found.` };
  if (coin.rugged) return { ok: false, reason: `$${coin.ticker} has already been rugged.` };
  if (prev.cash < SHELL_SHILL_COST) {
    return { ok: false, reason: `Insufficient cash (need ${formatUsd(SHELL_SHILL_COST)}).` };
  }
  const spoofMult = coin.auditSpoofed ? 1.18 : 1.0;
  const nextPrice = coin.priceUsd * (coin.auditSpoofed ? 1.16 : 1.12);
  const nextHype = Math.min(100, coin.hype + Math.round(24 * spoofMult));
  const summary = `Shilled $${coin.ticker}: hype ${Math.round(nextHype)}/100, price ${formatUsd(nextPrice)} (+6 Heat).`;
  const updatedUnderground = appendUndergroundRecord(
    {
      ...prev.underground,
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 5,
      shellCoins: getShellCoins(prev).map((c) =>
        c.ticker === coin.ticker
          ? {
              ...c,
              stage: c.stage === 'CONCEPT' ? 'ACTIVE' : c.stage ?? 'ACTIVE',
              hype: nextHype,
              priceUsd: nextPrice,
              liquidityUsd: c.liquidityUsd + (coin.auditSpoofed ? 750 : 500),
            }
          : c
      ),
    },
    prev.stepCount,
    'SHELL_SHILL',
    summary,
    'SUCCESS',
    -SHELL_SHILL_COST,
    6,
    0
  );

  const nextState: GameState = {
    ...prev,
    cash: prev.cash - SHELL_SHILL_COST,
    regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 6),
    currentCycleStats: {
      ...prev.currentCycleStats,
      otherSpendUsd: prev.currentCycleStats.otherSpendUsd + SHELL_SHILL_COST,
    },
    transactions: [
      makeTx(prev.stepCount, -SHELL_SHILL_COST, `Influencer shill campaign ($${coin.ticker})`),
      ...(prev.transactions ?? []),
    ].slice(0, 200),
    underground: updatedUnderground,
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    cost: SHELL_SHILL_COST,
    summary,
  };
}

/** Pull the liquidity and leave holders with a worthless token. */
export function rugShellCoin(prev: GameState, ticker: string): UndergroundResult {
  const coin = findShellCoin(prev, ticker);
  if (!coin) return { ok: false, reason: `No shell coin "$${ticker.toUpperCase()}" found.` };
  if (coin.rugged) return { ok: false, reason: `$${coin.ticker} was already rugged.` };

  const rng = createSeededRng(`${prev.runSeed}-rug-${coin.ticker}-${prev.stepCount}`);
  const payout = Math.max(
    0,
    Math.min(coin.liquidityUsd, Math.round(coin.supply * coin.priceUsd * 0.9))
  );
  const traceChance = Math.min(0.65, 0.25 + (coin.auditSpoofed ? 0.14 : 0) + (prev.underground.scandalMarks ?? 0) * 0.05);
  const traced = rng() < traceChance;
  const fine = traced ? Math.round((prev.cash + payout) * 0.15) : 0;
  const heatGain = 30 + (traced ? 10 : 0);
  const repLoss = traced ? 18 : 12;

  const summary = traced
    ? `Rugged $${coin.ticker} for ${formatUsd(payout)}, but chain analysts traced it: ${formatUsd(
        fine
      )} fine, +40 Heat, -18 Rep.`
    : `Rugged $${coin.ticker} for ${formatUsd(payout)} with no trace. +30 Heat, -12 Rep.`;

  const baseUg: UndergroundState = {
    ...prev.underground,
    suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + (traced ? 34 : 18),
    scandalMarks: (prev.underground.scandalMarks ?? 0) + (traced ? 1 : 0),
    marketConfidencePenaltyPct: Math.min(
      35,
      (prev.underground.marketConfidencePenaltyPct ?? 0) + (traced ? 6 : 2)
    ),
    shellCoins: getShellCoins(prev).map((c) =>
      c.ticker === coin.ticker
        ? {
            ...c,
            stage: 'RUGGED' as const,
            priceUsd: 0.0001,
            hype: 0,
            liquidityUsd: 0,
            rugged: true,
            ruggedStep: prev.stepCount,
            tracedScandal: traced,
            extractedUsd: c.extractedUsd + payout,
          }
        : c
    ),
  };
  const nextUnderground = appendUndergroundRecord(
    baseUg,
    prev.stepCount,
    'SHELL_RUG',
    summary,
    traced ? 'TRACED' : 'SUCCESS',
    payout - fine,
    heatGain,
    -repLoss
  );

  const nextState: GameState = {
    ...prev,
    cash: prev.cash + payout - fine,
    regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + heatGain),
    mediaCredibility: Math.max(5, prev.mediaCredibility - repLoss),
    transactions: [
      ...(fine > 0
        ? [makeTx(prev.stepCount, -fine, `Regulator fine: traced rug pull ($${coin.ticker})`)]
        : []),
      makeTx(prev.stepCount, payout, `Rug pull proceeds ($${coin.ticker})`),
      ...(prev.transactions ?? []),
    ].slice(0, 200),
    underground: nextUnderground,
    stats: {
      ...prev.stats,
      covertOpsCount: prev.stats.covertOpsCount + 1,
      totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + fine,
    },
  };
  return {
    ok: true,
    nextState,
    summary,
  };
}

/**
 * Per-step shell-coin dynamics: hype decays, organic money flows in while a
 * token is hot, and a dead token collapses. Deterministic per run seed.
 */
export function stepShellCoins(
  underground: UndergroundState,
  step: number,
  runSeed: string
): { underground: UndergroundState; collapsed: ShellCoinState[] } {
  const coins = underground.shellCoins ?? [];
  if (coins.length === 0) return { underground, collapsed: [] };
  const collapsed: ShellCoinState[] = [];

  const next = coins.map((coin) => {
    if (coin.rugged || coin.stage === 'COLLAPSED') return coin;
    const rng = createSeededRng(`${runSeed}-shell-${coin.ticker}-${step}`);
    const hypeDecayBase = coin.stage === 'CONCEPT' ? 1.5 : 3.5;
    const hype = Math.max(0, Math.min(100, coin.hype - (hypeDecayBase + rng() * 3.5)));

    let liquidity = coin.liquidityUsd;
    if (coin.stage !== 'CONCEPT') {
      if (hype > 50) liquidity += Math.round(hype * (coin.auditSpoofed ? 4.2 : 3));
      else if (hype < 30) liquidity = Math.max(0, liquidity - Math.round((30 - hype) * 2.5));
    }

    const drift = (hype - 42) / 900 + (rng() - 0.5) * 0.07;
    let price = Math.max(0.0001, coin.priceUsd * (1 + drift));
    if (hype <= 1) price = 0.0001;

    const didCollapse = hype <= 1 && coin.priceUsd > 0.0002;
    const updated: ShellCoinState = {
      ...coin,
      stage: didCollapse ? 'COLLAPSED' : coin.stage ?? 'ACTIVE',
      hype,
      priceUsd: price,
      liquidityUsd: didCollapse ? 0 : liquidity,
    };
    if (didCollapse) collapsed.push(updated);
    return updated;
  });

  const extraPenalty = collapsed.length > 0 ? collapsed.length * 2 : 0;
  return {
    underground: {
      ...underground,
      shellCoins: next,
      marketConfidencePenaltyPct: Math.min(
        35,
        (underground.marketConfidencePenaltyPct ?? 0) + extraPenalty
      ),
    },
    collapsed,
  };
}

/** Phase 1 of 2-phase Vault Raid: Recon target rival defenses and build an execution plan. */
export function prepareVaultRaid(prev: GameState, rivalId: string): UndergroundResult {
  const rival = prev.rivals.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, reason: 'Rival syndicate not found.' };
  const cooldown = prev.underground.raidCooldownStep ?? 0;
  if (prev.stepCount < cooldown) {
    return { ok: false, reason: `Raid crew is lying low: ${cooldown - prev.stepCount} steps left.` };
  }
  if (prev.cash < RAID_PREP_COST) {
    return { ok: false, reason: `Recon & exploit kit costs ${formatUsd(RAID_PREP_COST)}.` };
  }

  const rng = createSeededRng(`${prev.runSeed}-raidprep-${prev.stepCount}-${rival.id}`);
  const defenseRating = Math.max(
    18,
    Math.min(95, Math.round(32 + rival.facilityTierIndex * 9 + rival.hostility * 0.38 - (rival.disruptedSteps > 0 ? 18 : 0)))
  );
  const intelConfidencePct = Math.round(62 + rng() * 32);
  const baseLoot = Math.max(400, Math.min(35000, Math.round(rival.cashReserveUsd * 0.1)));
  const estimatedLootMinUsd = Math.round(baseLoot * 0.72);
  const estimatedLootMaxUsd = Math.round(baseLoot * 1.45);
  const detectionRiskPct = Math.round(
    Math.max(12, Math.min(82, 22 + prev.regulatoryScrutiny * 0.35 + rival.hostility * 0.25))
  );
  const recommendedApproach: RaidApproachId =
    rival.hostility >= 55
      ? 'STEALTH_SIPHON'
      : prev.cash >= 15000 && detectionRiskPct >= 45
      ? 'INSIDER_BRIBE'
      : 'ZERO_DAY_BREACH';

  const plan: PreparedRaidPlan = {
    id: `plan_${prev.stepCount}_${rival.id}`,
    targetRivalId: rival.id,
    targetName: rival.name,
    preparedStep: prev.stepCount,
    defenseRating,
    intelConfidencePct,
    estimatedLootMinUsd,
    estimatedLootMaxUsd,
    detectionRiskPct,
    recommendedApproach,
  };

  const summary = `Prepared raid dossier on ${rival.name} (Def ${defenseRating}/100, Loot ${formatUsd(
    estimatedLootMinUsd
  )}-${formatUsd(estimatedLootMaxUsd)}, Detect ${detectionRiskPct}%). Recommended: ${recommendedApproach}. Execute with "ops raid exec <stealth|zeroday|bribe>".`;

  const nextUg = appendUndergroundRecord(
    {
      ...prev.underground,
      preparedRaid: plan,
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 4,
    },
    prev.stepCount,
    'RAID_PREP',
    summary,
    'SUCCESS',
    -RAID_PREP_COST,
    4,
    0
  );

  return {
    ok: true,
    cost: RAID_PREP_COST,
    summary,
    nextState: {
      ...prev,
      cash: prev.cash - RAID_PREP_COST,
      regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 4),
      currentCycleStats: {
        ...prev.currentCycleStats,
        otherSpendUsd: prev.currentCycleStats.otherSpendUsd + RAID_PREP_COST,
      },
      transactions: [
        makeTx(prev.stepCount, -RAID_PREP_COST, `Raid recon dossier (${rival.name})`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      underground: nextUg,
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    },
  };
}

/** Phase 2 of 2-phase Vault Raid: Execute prepared raid using chosen approach. */
export function executePreparedRaid(
  prev: GameState,
  approachInput: RaidApproachId | undefined,
  playerHashIndex: number
): UndergroundResult {
  const plan = prev.underground.preparedRaid;
  if (!plan) {
    return { ok: false, reason: 'No raid dossier prepared. Run "ops raid prep <#>" first.' };
  }
  const rival = prev.rivals.find((r) => r.id === plan.targetRivalId);
  if (!rival) return { ok: false, reason: 'Target rival no longer exists.' };
  const cooldown = prev.underground.raidCooldownStep ?? 0;
  if (prev.stepCount < cooldown) {
    return { ok: false, reason: `Raid crew is lying low: ${cooldown - prev.stepCount} steps left.` };
  }

  const approach = approachInput ?? plan.recommendedApproach;
  const bribeCost = approach === 'INSIDER_BRIBE' ? 2500 : 0;
  if (prev.cash < bribeCost) {
    return { ok: false, reason: `INSIDER_BRIBE requires ${formatUsd(bribeCost)} upfront.` };
  }

  const rng = createSeededRng(`${prev.runSeed}-raidexec-${prev.stepCount}-${rival.id}-${approach}`);
  const approachBonus =
    approach === 'ZERO_DAY_BREACH'
      ? 0.14
      : approach === 'INSIDER_BRIBE'
      ? 0.24
      : 0.18;
  const heatMod = approach === 'STEALTH_SIPHON' ? 0.55 : approach === 'INSIDER_BRIBE' ? 0.75 : 1.15;
  const lootMult = approach === 'ZERO_DAY_BREACH' ? 1.38 : approach === 'INSIDER_BRIBE' ? 1.15 : 0.88;

  const chance = Math.max(
    0.18,
    Math.min(0.92, 0.45 + approachBonus + (playerHashIndex - rival.hashPowerIndex) / 280 - plan.defenseRating / 320)
  );
  const success = rng() < chance;

  if (!success) {
    const fine = Math.max(250, Math.round(prev.cash * 0.07)) + bribeCost;
    const heatDelta = Math.round(28 * heatMod);
    const summary = `Prepared ${approach} raid on ${rival.name} failed! Burned ${formatUsd(fine)}, +${heatDelta} Heat, -12 Rep.`;
    const nextUg = appendUndergroundRecord(
      {
        ...prev.underground,
        preparedRaid: null,
        raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS,
        suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 22,
        retaliationRiskPct: Math.min(90, (prev.underground.retaliationRiskPct ?? 0) + 28),
      },
      prev.stepCount,
      'RAID_EXEC',
      summary,
      'FAILED',
      -fine,
      heatDelta,
      -12
    );
    return {
      ok: true,
      summary,
      nextState: {
        ...prev,
        cash: prev.cash - fine,
        regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + heatDelta),
        mediaCredibility: Math.max(5, prev.mediaCredibility - 12),
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + fine,
        },
        transactions: [
          makeTx(prev.stepCount, -fine, `Failed ${approach} raid (${rival.name})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rivals: prev.rivals.map((rv) =>
          rv.id === rival.id
            ? {
                ...rv,
                hostility: Math.min(100, rv.hostility + 28),
                lastActionSummary: `Repelled ${approach} intrusion`,
              }
            : rv
        ),
        underground: nextUg,
        stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
      },
    };
  }

  const rawStolen =
    plan.estimatedLootMinUsd + rng() * Math.max(100, plan.estimatedLootMaxUsd - plan.estimatedLootMinUsd);
  const stolen = Math.max(400, Math.round(rawStolen * lootMult));
  const netCash = stolen - bribeCost;
  const bonusHash = Math.max(0.8, rival.hashPowerIndex * (approach === 'STEALTH_SIPHON' ? 0.12 : 0.09));
  const heatDelta = Math.round(20 * heatMod);
  const repLoss = approach === 'STEALTH_SIPHON' ? 4 : 8;
  const summary = `Executed ${approach} raid on ${rival.name}: +${formatUsd(
    netCash
  )} net loot, hijacked ${bonusHash.toFixed(2)} hash on ${rival.specialtyCoin} for ${RAID_BONUS_STEPS}st (+${heatDelta} Heat).`;

  const nextUg = appendUndergroundRecord(
    {
      ...prev.underground,
      preparedRaid: null,
      raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS,
      raidBonusHash: bonusHash,
      raidStepsRemaining: RAID_BONUS_STEPS,
      raidCoin: rival.specialtyCoin,
      raidSourceName: rival.name,
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + Math.round(14 * heatMod),
      retaliationRiskPct: Math.min(90, (prev.underground.retaliationRiskPct ?? 0) + 18),
    },
    prev.stepCount,
    'RAID_EXEC',
    summary,
    'SUCCESS',
    netCash,
    heatDelta,
    -repLoss
  );

  return {
    ok: true,
    summary,
    nextState: {
      ...prev,
      cash: prev.cash + netCash,
      regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + heatDelta),
      mediaCredibility: Math.max(5, prev.mediaCredibility - repLoss),
      transactions: [
        makeTx(prev.stepCount, netCash, `Vault raid (${approach} vs ${rival.name})`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      rivals: prev.rivals.map((rv) =>
        rv.id === rival.id
          ? {
              ...rv,
              cashReserveUsd: Math.max(1000, rv.cashReserveUsd - stolen),
              hashPowerIndex: Math.max(20, Math.round(rv.hashPowerIndex * 0.93)),
              disruptedSteps: Math.max(rv.disruptedSteps, 5),
              hostility: Math.min(100, rv.hostility + 20),
              lastActionSummary: `Breached via ${approach}`,
            }
          : rv
      ),
      underground: nextUg,
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    },
  };
}

/** Direct single-command raid on a rival's vault (preserved for compatibility & fast runs). */
export function resolveRaid(
  prev: GameState,
  rivalId: string,
  playerHashIndex: number
): UndergroundResult {
  const rival = prev.rivals.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, reason: 'Rival not found.' };
  const cooldown = prev.underground.raidCooldownStep ?? 0;
  if (prev.stepCount < cooldown) {
    return { ok: false, reason: `Raid crew is lying low: ${cooldown - prev.stepCount} steps left.` };
  }
  if (prev.regulatoryScrutiny >= 90) {
    return { ok: false, reason: 'Heat too high — the crew will not move against a watched target.' };
  }

  const rng = createSeededRng(`${prev.runSeed}-raid-${prev.stepCount}-${rivalId}`);
  const heatPenalty = prev.regulatoryScrutiny / 400;
  const chance = Math.max(
    0.12,
    Math.min(0.82, 0.42 + (playerHashIndex - rival.hashPowerIndex) / 260 - heatPenalty)
  );
  const success = rng() < chance;

  if (!success) {
    const fine = Math.max(100, Math.round(prev.cash * 0.08));
    const summary = `Raid on ${rival.name} failed: crew burned ${formatUsd(
      fine
    )} and +32 Heat, -14 Rep. Their hostility is rising.`;
    const nextUg = appendUndergroundRecord(
      {
        ...prev.underground,
        raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS,
        suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 18,
        retaliationRiskPct: Math.min(90, (prev.underground.retaliationRiskPct ?? 0) + 22),
      },
      prev.stepCount,
      'RAID_EXEC',
      summary,
      'FAILED',
      -fine,
      32,
      -14
    );
    const nextState: GameState = {
      ...prev,
      cash: prev.cash - fine,
      regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 32),
      mediaCredibility: Math.max(5, prev.mediaCredibility - 14),
      currentCycleStats: {
        ...prev.currentCycleStats,
        otherSpendUsd: prev.currentCycleStats.otherSpendUsd + fine,
      },
      transactions: [
        makeTx(prev.stepCount, -fine, `Failed raid on ${rival.name} (damages & bail)`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      rivals: prev.rivals.map((rv) =>
        rv.id === rivalId
          ? {
              ...rv,
              hostility: Math.min(100, rv.hostility + 25),
              lastActionSummary: 'Repelled a vault raid',
            }
          : rv
      ),
      underground: nextUg,
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    };
    return {
      ok: true,
      nextState,
      summary,
    };
  }

  const stolen = Math.max(250, Math.min(15000, Math.round(rival.cashReserveUsd * 0.08)));
  const bonusHash = Math.max(0.5, rival.hashPowerIndex * 0.09);
  const summary = `Raided ${rival.name} for ${formatUsd(
    stolen
  )} and hijacked ${bonusHash.toFixed(2)} of their hash on ${
    rival.specialtyCoin
  } for ${RAID_BONUS_STEPS} steps (+24 Heat, -8 Rep).`;
  const nextUg = appendUndergroundRecord(
    {
      ...prev.underground,
      raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS,
      raidBonusHash: bonusHash,
      raidStepsRemaining: RAID_BONUS_STEPS,
      raidCoin: rival.specialtyCoin,
      raidSourceName: rival.name,
      suspiciousActivityScore: (prev.underground.suspiciousActivityScore ?? 0) + 15,
      retaliationRiskPct: Math.min(90, (prev.underground.retaliationRiskPct ?? 0) + 15),
    },
    prev.stepCount,
    'RAID_EXEC',
    summary,
    'SUCCESS',
    stolen,
    24,
    -8
  );

  const nextState: GameState = {
    ...prev,
    cash: prev.cash + stolen,
    regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 24),
    mediaCredibility: Math.max(5, prev.mediaCredibility - 8),
    transactions: [
      makeTx(prev.stepCount, stolen, `Vault raid proceeds (${rival.name})`),
      ...(prev.transactions ?? []),
    ].slice(0, 200),
    rivals: prev.rivals.map((rv) =>
      rv.id === rivalId
        ? {
            ...rv,
            cashReserveUsd: Math.max(1000, rv.cashReserveUsd - stolen),
            hashPowerIndex: Math.max(20, Math.round(rv.hashPowerIndex * 0.94)),
            disruptedSteps: Math.max(rv.disruptedSteps, 4),
            hostility: Math.min(100, rv.hostility + 18),
            lastActionSummary: 'Vault raided, racks hijacked',
          }
        : rv
    ),
    underground: nextUg,
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    summary,
  };
}

/**
 * Cumulative regulatory investigation ladder & rival retaliation consequences.
 * Stage progression: NONE -> WATCHLIST -> FORMAL_AUDIT -> SANCTIONED -> PROBATION.
 */
export function advanceUndergroundInvestigation(
  underground: UndergroundState,
  regulatoryScrutiny: number,
  step: number,
  stepLabel: string,
  runSeed: string
): {
  underground: UndergroundState;
  news: NewsItem[];
  alertHit: boolean;
  sanctionFineUsd: number;
} {
  const news: NewsItem[] = [];
  let alertHit = false;
  let sanctionFineUsd = 0;

  let suspicious = Math.max(0, (underground.suspiciousActivityScore ?? 0) - (regulatoryScrutiny < 25 ? 1.2 : 0.3));
  if (underground.powerSiphonActive) suspicious += 1.4;
  if (underground.botnetStepsRemaining > 0) suspicious += 1.6;
  if ((underground.raidStepsRemaining ?? 0) > 0) suspicious += 1.1;
  if (regulatoryScrutiny >= 55) suspicious += 1.2;

  const currentStage: InvestigationStage = underground.investigationStage ?? 'NONE';
  let nextStage: InvestigationStage = currentStage;
  let stepsRem = Math.max(0, (underground.investigationStepsRemaining ?? 0) - 1);

  if (currentStage === 'NONE' && (regulatoryScrutiny >= 38 || suspicious >= 35)) {
    nextStage = 'WATCHLIST';
    stepsRem = 12;
    alertHit = true;
    news.push({
      id: `news_inv_watch_${step}`,
      step,
      stepLabel,
      title: 'Regulatory Notice: Placed on Watchlist',
      detail: 'Cumulative Heat and suspicious on-chain patterns triggered WATCHLIST scrutiny. Lower Heat or run "ops audit".',
      category: 'UNDERGROUND',
    });
  } else if (currentStage === 'WATCHLIST' && (regulatoryScrutiny >= 62 || suspicious >= 68)) {
    nextStage = 'FORMAL_AUDIT';
    stepsRem = 14;
    alertHit = true;
    news.push({
      id: `news_inv_audit_${step}`,
      step,
      stepLabel,
      title: 'FORMAL REGULATORY AUDIT OPENED',
      detail: 'Auditors opened a docket against your operation. Run "ops comply" or "ops settle" before sanctions hit.',
      category: 'ALERT',
    });
  } else if (currentStage === 'FORMAL_AUDIT' && (regulatoryScrutiny >= 82 || (stepsRem === 0 && suspicious >= 55))) {
    nextStage = 'SANCTIONED';
    stepsRem = 16;
    alertHit = true;
    sanctionFineUsd = 2500;
    news.push({
      id: `news_inv_sanc_${step}`,
      step,
      stepLabel,
      title: 'SANCTIONS IMPOSED: Exchange & Contract Penalties',
      detail: 'Failed to clear Formal Audit in time: -$2,500 compliance levy, -15% mining payout efficiency while SANCTIONED. Run "ops settle".',
      category: 'ALERT',
    });
  } else if (stepsRem === 0 && currentStage !== 'NONE') {
    if (currentStage === 'WATCHLIST' && regulatoryScrutiny < 25) {
      nextStage = 'NONE';
      news.push({
        id: `news_inv_clear_${step}`,
        step,
        stepLabel,
        title: 'Watchlist Cleared',
        detail: 'Sustained low Heat closed your regulatory watchlist file.',
        category: 'UNDERGROUND',
      });
    } else if (currentStage === 'PROBATION') {
      nextStage = 'NONE';
      news.push({
        id: `news_inv_prob_done_${step}`,
        step,
        stepLabel,
        title: 'Compliance Probation Completed',
        detail: 'Your company exited Compliance Probation with clean standing.',
        category: 'MILESTONE',
      });
    } else if (currentStage === 'SANCTIONED' && regulatoryScrutiny < 45) {
      nextStage = 'PROBATION';
      stepsRem = 10;
    }
  }

  // Natural decay of confidence penalty when scandal-free
  const confPenalty = Math.max(0, (underground.marketConfidencePenaltyPct ?? 0) - 0.15);
  const retRisk = Math.max(0, (underground.retaliationRiskPct ?? 0) - 0.5);

  let nextUg: UndergroundState = {
    ...underground,
    suspiciousActivityScore: Number(suspicious.toFixed(1)),
    investigationStage: nextStage,
    investigationStepsRemaining: stepsRem,
    marketConfidencePenaltyPct: Number(confPenalty.toFixed(2)),
    retaliationRiskPct: Number(retRisk.toFixed(1)),
  };

  if (nextStage !== currentStage) {
    nextUg = appendUndergroundRecord(
      nextUg,
      step,
      'INVESTIGATION',
      `Investigation shifted ${currentStage} -> ${nextStage}`,
      nextStage === 'NONE' ? 'RECOVERY' : 'PENALTY',
      -sanctionFineUsd,
      0,
      0
    );
  } else {
    void createSeededRng(`${runSeed}-inv-${step}`);
  }

  return { underground: nextUg, news, alertHit, sanctionFineUsd };
}

/** Recovery action: cooperate with audit (severs active siphon/botnet cleanly and shifts audit toward probation). */
export function complyWithAudit(prev: GameState): UndergroundResult {
  const stage = prev.underground.investigationStage ?? 'NONE';
  if (stage === 'NONE' && prev.regulatoryScrutiny < 20) {
    return { ok: false, reason: 'No active investigation or audit requiring compliance.' };
  }
  const heatDrop = 22;
  const nextStage: InvestigationStage = stage === 'SANCTIONED' ? 'FORMAL_AUDIT' : stage === 'FORMAL_AUDIT' ? 'PROBATION' : 'NONE';
  const summary = `Filed full compliance disclosure: disconnected active siphon/botnet, -${heatDrop} Heat, status -> ${nextStage}.`;
  const nextUg = appendUndergroundRecord(
    {
      ...prev.underground,
      powerSiphonActive: false,
      botnetStepsRemaining: 0,
      botnetBonusHash: 0,
      botnetCoin: null,
      suspiciousActivityScore: Math.max(0, (prev.underground.suspiciousActivityScore ?? 0) * 0.45),
      investigationStage: nextStage,
      investigationStepsRemaining: nextStage === 'PROBATION' ? 8 : 0,
    },
    prev.stepCount,
    'COMPLY',
    summary,
    'RECOVERY',
    0,
    -heatDrop,
    4
  );

  return {
    ok: true,
    summary,
    nextState: {
      ...prev,
      regulatoryScrutiny: Math.max(0, prev.regulatoryScrutiny - heatDrop),
      mediaCredibility: Math.min(100, prev.mediaCredibility + 4),
      underground: nextUg,
    },
  };
}

/** Recovery action: pay legal settlement to clear sanctions/audit and reduce scandal market drag. */
export function payComplianceSettlement(prev: GameState): UndergroundResult {
  const stage = prev.underground.investigationStage ?? 'NONE';
  const baseFee =
    stage === 'SANCTIONED'
      ? 12000
      : stage === 'FORMAL_AUDIT'
      ? 6000
      : stage === 'WATCHLIST'
      ? 2500
      : 1500;
  const settlement = Math.round(baseFee + (prev.underground.scandalMarks ?? 0) * 1500);
  if (prev.cash < settlement) {
    return { ok: false, reason: `Compliance settlement requires ${formatUsd(settlement)}.` };
  }
  const summary = `Paid ${formatUsd(settlement)} civil compliance settlement: cleared ${stage} -> PROBATION, -30 Heat, +6 Rep.`;
  const nextUg = appendUndergroundRecord(
    {
      ...prev.underground,
      suspiciousActivityScore: Math.max(0, (prev.underground.suspiciousActivityScore ?? 0) * 0.25),
      investigationStage: 'PROBATION',
      investigationStepsRemaining: 8,
      marketConfidencePenaltyPct: Math.max(0, (prev.underground.marketConfidencePenaltyPct ?? 0) * 0.5),
    },
    prev.stepCount,
    'SETTLE',
    summary,
    'RECOVERY',
    -settlement,
    -30,
    6
  );

  return {
    ok: true,
    cost: settlement,
    summary,
    nextState: {
      ...prev,
      cash: prev.cash - settlement,
      regulatoryScrutiny: Math.max(0, prev.regulatoryScrutiny - 30),
      mediaCredibility: Math.min(100, prev.mediaCredibility + 6),
      currentCycleStats: {
        ...prev.currentCycleStats,
        otherSpendUsd: prev.currentCycleStats.otherSpendUsd + settlement,
      },
      transactions: [
        makeTx(prev.stepCount, -settlement, `Regulatory compliance settlement (${stage})`),
        ...(prev.transactions ?? []),
      ].slice(0, 200),
      underground: nextUg,
      stats: {
        ...prev.stats,
        totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + settlement,
      },
    },
  };
}

export function formatUndergroundReport(state: GameState): string {
  const ug = state.underground;
  const stage = ug.investigationStage ?? 'NONE';
  const shells = ug.shellCoins ?? [];
  const prep = ug.preparedRaid;
  const logs = (ug.operationRecords ?? []).slice(0, 8);

  const lines = [
    `  REGULATORY STATUS : Stage=${stage} (${ug.investigationStepsRemaining ?? 0}st rem) · Heat=${state.regulatoryScrutiny.toFixed(0)}/100 · Suspicion=${(ug.suspiciousActivityScore ?? 0).toFixed(0)}`,
    `  SCANDAL & RISK    : Scandal Marks=${ug.scandalMarks ?? 0} · Confidence Drag=-${(ug.marketConfidencePenaltyPct ?? 0).toFixed(1)}% · Rival Retaliation=${(ug.retaliationRiskPct ?? 0).toFixed(0)}%`,
    `  PREPARED RAID     : ${
      prep
        ? `${prep.targetName} (Def ${prep.defenseRating}, Loot ${formatUsd(prep.estimatedLootMinUsd)}-${formatUsd(
            prep.estimatedLootMaxUsd
          )}, Rec: ${prep.recommendedApproach})`
        : 'None ("ops raid prep <#>")'
    }`,
    '',
    '  SHELL COINS ("ops coin dev|seed|launch|shill|rug ..."):',
    ...(shells.length === 0
      ? ['    (none active)']
      : shells.map(
          (c) =>
            `    $${c.ticker.padEnd(6)} ${c.name.slice(0, 18).padEnd(18)} [${(c.stage ?? (c.rugged ? 'RUGGED' : 'ACTIVE')).padEnd(9)}] Hype ${Math.round(
              c.hype
            )
              .toString()
              .padStart(3)}% · Pool ${formatUsd(c.liquidityUsd)}${c.auditSpoofed ? ' · SPOOFED-AUDIT' : ''}${
              c.tracedScandal ? ' · TRACED' : ''
            }`
        )),
    '',
    '  RECENT UNDERGROUND LEDGER:',
    ...(logs.length === 0
      ? ['    (no recorded underground ops yet)']
      : logs.map((r) => `    [${r.stepLabel}] ${r.opType.padEnd(13)} ${r.outcome.padEnd(8)} | ${r.summary}`)),
  ];
  return lines.join('\n');
}
