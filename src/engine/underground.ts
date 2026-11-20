import {
  CoinSymbol,
  GameState,
  ShellCoinState,
  TransactionEntry,
  UndergroundState,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';

export const SHELL_COIN_LAUNCH_COST = 2500;
export const SHELL_COIN_MAX_ACTIVE = 3;
export const SHELL_COIN_START_PRICE = 0.05;
export const SHELL_COIN_SUPPLY = 1_000_000;
export const SHELL_SHILL_COST = 750;
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

/** Launch a scam token. Costs cash and draws regulator attention immediately. */
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
    priceUsd: SHELL_COIN_START_PRICE,
    hype: 42,
    liquidityUsd: Math.round(SHELL_COIN_LAUNCH_COST * 0.8),
    supply: SHELL_COIN_SUPPLY,
    extractedUsd: 0,
    rugged: false,
  };
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
    underground: {
      ...prev.underground,
      shellCoins: [...getShellCoins(prev), coin],
    },
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    cost: SHELL_COIN_LAUNCH_COST,
    summary: `Launched $${ticker} ("${name}") at ${formatUsd(
      SHELL_COIN_START_PRICE
    )} with ${formatUsd(coin.liquidityUsd)} of liquidity (+18 Heat).`,
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
  const nextPrice = coin.priceUsd * 1.12;
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
    underground: {
      ...prev.underground,
      shellCoins: getShellCoins(prev).map((c) =>
        c.ticker === coin.ticker
          ? {
              ...c,
              hype: Math.min(100, c.hype + 24),
              priceUsd: nextPrice,
              liquidityUsd: c.liquidityUsd + 500,
            }
          : c
      ),
    },
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    cost: SHELL_SHILL_COST,
    summary: `Shilled $${coin.ticker}: hype ${Math.round(
      Math.min(100, coin.hype + 24)
    )}/100, price ${formatUsd(nextPrice)} (+6 Heat).`,
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
  const traced = rng() < 0.25;
  const fine = traced ? Math.round((prev.cash + payout) * 0.15) : 0;

  const nextState: GameState = {
    ...prev,
    cash: prev.cash + payout - fine,
    regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 30 + (traced ? 10 : 0)),
    mediaCredibility: Math.max(5, prev.mediaCredibility - (traced ? 18 : 12)),
    transactions: [
      ...(fine > 0
        ? [makeTx(prev.stepCount, -fine, `Regulator fine: traced rug pull ($${coin.ticker})`)]
        : []),
      makeTx(prev.stepCount, payout, `Rug pull proceeds ($${coin.ticker})`),
      ...(prev.transactions ?? []),
    ].slice(0, 200),
    underground: {
      ...prev.underground,
      shellCoins: getShellCoins(prev).map((c) =>
        c.ticker === coin.ticker
          ? {
              ...c,
              priceUsd: 0.0001,
              hype: 0,
              liquidityUsd: 0,
              rugged: true,
              ruggedStep: prev.stepCount,
              extractedUsd: c.extractedUsd + payout,
            }
          : c
      ),
    },
    stats: {
      ...prev.stats,
      covertOpsCount: prev.stats.covertOpsCount + 1,
      totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + fine,
    },
  };
  return {
    ok: true,
    nextState,
    summary: traced
      ? `Rugged $${coin.ticker} for ${formatUsd(payout)}, but chain analysts traced it: ${formatUsd(
          fine
        )} fine, +40 Heat, -18 Rep.`
      : `Rugged $${coin.ticker} for ${formatUsd(payout)} with no trace. +30 Heat, -12 Rep.`,
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
    if (coin.rugged) return coin;
    const rng = createSeededRng(`${runSeed}-shell-${coin.ticker}-${step}`);
    const hype = Math.max(0, Math.min(100, coin.hype - (3.5 + rng() * 3.5)));

    let liquidity = coin.liquidityUsd;
    if (hype > 50) liquidity += Math.round(hype * 3);
    else if (hype < 30) liquidity = Math.max(0, liquidity - Math.round((30 - hype) * 2.5));

    const drift = (hype - 42) / 900 + (rng() - 0.5) * 0.07;
    let price = Math.max(0.0001, coin.priceUsd * (1 + drift));
    if (hype <= 1) price = 0.0001;

    const updated: ShellCoinState = {
      ...coin,
      hype,
      priceUsd: price,
      liquidityUsd: liquidity,
    };
    if (hype <= 1 && coin.priceUsd > 0.0002) collapsed.push(updated);
    return updated;
  });

  return { underground: { ...underground, shellCoins: next }, collapsed };
}

/** Raid a rival's vault and hijack a slice of their hashrate for a few steps. */
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
      underground: { ...prev.underground, raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS },
      stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
    };
    return {
      ok: true,
      nextState,
      summary: `Raid on ${rival.name} failed: crew burned ${formatUsd(
        fine
      )} and +32 Heat, -14 Rep. Their hostility is rising.`,
    };
  }

  const stolen = Math.max(250, Math.min(15000, Math.round(rival.cashReserveUsd * 0.08)));
  const bonusHash = Math.max(0.5, rival.hashPowerIndex * 0.09);
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
    underground: {
      ...prev.underground,
      raidCooldownStep: prev.stepCount + RAID_COOLDOWN_STEPS,
      raidBonusHash: bonusHash,
      raidStepsRemaining: RAID_BONUS_STEPS,
      raidCoin: rival.specialtyCoin,
      raidSourceName: rival.name,
    },
    stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
  };
  return {
    ok: true,
    nextState,
    summary: `Raided ${rival.name} for ${formatUsd(
      stolen
    )} and hijacked ${bonusHash.toFixed(2)} of their hash on ${
      rival.specialtyCoin
    } for ${RAID_BONUS_STEPS} steps (+24 Heat, -8 Rep).`,
  };
}
