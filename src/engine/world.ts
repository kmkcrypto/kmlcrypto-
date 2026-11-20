import {
  CoinSymbol,
  GameState,
  SharedWorldState,
  WorldBlockRecord,
  WorldPlayerSnapshot,
} from '../types/game';
import { hashSeed } from '../utils/rng';
import { formatUsd } from '../utils/format';

/**
 * Shared-world (multiplayer) simulation primitives.
 *
 * The real multiplayer service does not exist yet, so the world is simulated
 * locally from the player's own fleet and the rival syndicates. The data model
 * (block clock, block history, player shares, season, reward mode) is the one a
 * future authoritative server would drive, so the UI and economy already speak
 * the shared-world language.
 */

/** A shared-world block is mined every 10 minutes of game time. */
export const BLOCK_INTERVAL_MINUTES = 10;
/** One simulation step represents one 10-minute block window. */
export const MINUTES_PER_STEP = 10;
export const STEPS_PER_BLOCK = Math.max(1, Math.round(BLOCK_INTERVAL_MINUTES / MINUTES_PER_STEP));

/** Hash power permanently held by miners outside the known companies. */
const BACKGROUND_NETWORK_HASH = 1200;
const MAX_BLOCK_HISTORY = 24;

const BLOCK_REWARD_COINS: Record<CoinSymbol, number> = {
  BTC: 3.125,
  LTC: 12.5,
  DOGE: 10_000,
  RVN: 2_500,
  XMR: 0.6,
  ETH: 2,
  ZEC: 2.5,
  XCH: 2,
  QBC: 4.5,
};

const AI_POOLS: Array<{ id: string; name: string; hashIndex: number }> = [
  { id: 'pool_ocean', name: 'OceanPool (AI)', hashIndex: 640 },
  { id: 'pool_f2pool', name: 'F2 Syndicate Pool', hashIndex: 520 },
  { id: 'pool_solo', name: 'Independent Solo Miners', hashIndex: 380 },
];

export function buildDefaultWorld(runSeed = 'DEFAULT'): SharedWorldState {
  const players: WorldPlayerSnapshot[] = AI_POOLS.map((pool) => ({
    id: pool.id,
    name: pool.name,
    isHuman: false,
    hashIndex: pool.hashIndex,
    sharePct: 0,
    blocksWon: 0,
  }));

  return {
    worldId: `world_${hashSeed(runSeed).toString(36)}`,
    seasonId: 1,
    seasonLabel: 'Season 1 · Genesis Epoch',
    blockHeight: 0,
    blockIntervalMinutes: BLOCK_INTERVAL_MINUTES,
    minutesPerStep: MINUTES_PER_STEP,
    stepsPerBlock: STEPS_PER_BLOCK,
    stepAccumulator: 0,
    rewardMode: 'PROPORTIONAL',
    networkHashIndex: BACKGROUND_NETWORK_HASH + AI_POOLS.reduce((s, p) => s + p.hashIndex, 0),
    players,
    blocks: [],
    totalPlayerBlocksWon: 0,
    totalPlayerCoins: 0,
    totalPlayerUsd: 0,
    lastBlockSummary: 'World initialized. Waiting for the first block.',
  };
}

/** The player's fleet hash index, matching the scale used for rival syndicates. */
export function getPlayerHashIndex(
  state: Pick<GameState, 'performanceHistory' | 'stats'>
): number {
  const history = state.performanceHistory ?? [];
  const last = history[history.length - 1];
  return Math.max(12, Math.round(last?.fleetHashScore ?? state.stats.peakFleetHashScore ?? 12));
}

export function getWorldNetworkHashIndex(state: Pick<GameState, 'rivals'>): number {
  return (
    BACKGROUND_NETWORK_HASH +
    AI_POOLS.reduce((s, p) => s + p.hashIndex, 0) +
    state.rivals.reduce((s, r) => s + Math.max(0, r.hashPowerIndex), 0)
  );
}

function pickBlockCoin(state: Pick<GameState, 'coins'>): CoinSymbol {
  const unlocked = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (sym) => state.coins[sym].unlocked
  );
  return unlocked.length > 0 ? unlocked[0] : 'BTC';
}

function roll(worldId: string, height: number, salt: string): number {
  return hashSeed(`${worldId}:${height}:${salt}`) / 4294967296;
}

export interface WorldStepResult {
  nextWorld: SharedWorldState;
  /** Coins credited to the player's wallet for blocks won this step. */
  rewardByCoin: Partial<Record<CoinSymbol, number>>;
  rewardUsd: number;
  block: WorldBlockRecord | null;
}

export function stepSharedWorld(
  worldInput: SharedWorldState | undefined,
  state: Pick<GameState, 'rivals' | 'coins' | 'runSeed' | 'stepCount' | 'devMode'>,
  playerHashIndex: number
): WorldStepResult {
  const world = worldInput ?? buildDefaultWorld(state.runSeed);
  const accumulator = world.stepAccumulator + 1;
  if (accumulator < world.stepsPerBlock) {
    return {
      nextWorld: { ...world, stepAccumulator: accumulator },
      rewardByCoin: {},
      rewardUsd: 0,
      block: null,
    };
  }

  const height = world.blockHeight + 1;
  const coin = pickBlockCoin(state);
  const networkHashIndex = getWorldNetworkHashIndex(state);
  const playerHash = Math.max(0, Math.round(playerHashIndex));
  const totalHash = Math.max(1, networkHashIndex + playerHash);
  const share = playerHash / totalHash;
  const blockRewardCoins = BLOCK_REWARD_COINS[coin] ?? state.coins[coin]?.baseStepCoins * 25 ?? 2;

  // Deterministic block-winner draw so a save replays identically.
  const winnerRoll = roll(world.worldId, height, 'winner');
  const playerWins = winnerRoll < share;
  const rivalShareTotal = networkHashIndex / totalHash;
  let winnerName = 'Background Network';
  if (!playerWins) {
    let cursor = winnerRoll - share;
    for (const rv of state.rivals) {
      const rvShare = Math.max(0, rv.hashPowerIndex) / totalHash;
      if (cursor < rvShare) {
        winnerName = rv.name;
        break;
      }
      cursor -= rvShare;
    }
    if (winnerName === 'Background Network' && rivalShareTotal <= 0) {
      winnerName = 'Background Network';
    }
  }

  let playerRewardCoins = 0;
  if (world.rewardMode === 'WINNER_TAKE_ALL') {
    playerRewardCoins = playerWins ? blockRewardCoins : 0;
    if (playerWins) winnerName = 'You';
  } else {
    playerRewardCoins = blockRewardCoins * share;
    if (playerWins) winnerName = 'You';
  }

  const price = state.coins[coin]?.priceUsd ?? 0;
  const playerRewardUsd = playerRewardCoins * price;

  const block: WorldBlockRecord = {
    height,
    step: state.stepCount,
    stepLabel: `Step ${state.stepCount}`,
    coin,
    networkHashIndex,
    playerHashIndex: playerHash,
    playerSharePct: Number((share * 100).toFixed(3)),
    winnerName,
    blockRewardCoins,
    playerRewardCoins,
    playerRewardUsd,
  };

  const players = world.players.map((p) => ({
    ...p,
    sharePct: Number(((p.hashIndex / totalHash) * 100).toFixed(3)),
    blocksWon: p.blocksWon,
  }));

  const rewardByCoin: Partial<Record<CoinSymbol, number>> = {};
  if (playerRewardCoins > 0) rewardByCoin[coin] = playerRewardCoins;

  return {
    nextWorld: {
      ...world,
      blockHeight: height,
      stepAccumulator: 0,
      networkHashIndex,
      players,
      blocks: [block, ...world.blocks].slice(0, MAX_BLOCK_HISTORY),
      totalPlayerBlocksWon: world.totalPlayerBlocksWon + (playerWins ? 1 : 0),
      totalPlayerCoins: world.totalPlayerCoins + playerRewardCoins,
      totalPlayerUsd: world.totalPlayerUsd + playerRewardUsd,
      lastBlockSummary: `Block #${height} · ${coin} · ${winnerName} won · your share ${(
        share * 100
      ).toFixed(2)}%`,
    },
    rewardByCoin,
    rewardUsd: playerRewardUsd,
    block,
  };
}

export function getWorldPlayerSnapshots(
  world: SharedWorldState,
  playerHashIndex: number,
  playerName = 'Your Company'
): WorldPlayerSnapshot[] {
  const total = Math.max(1, world.networkHashIndex + playerHashIndex);
  const rows: WorldPlayerSnapshot[] = [
    {
      id: 'human',
      name: playerName,
      isHuman: true,
      hashIndex: Math.round(playerHashIndex),
      sharePct: Number(((playerHashIndex / total) * 100).toFixed(3)),
      blocksWon: world.totalPlayerBlocksWon,
    },
    ...world.players.map((p) => ({
      ...p,
      sharePct: Number(((p.hashIndex / total) * 100).toFixed(3)),
    })),
  ];
  return rows.sort((a, b) => b.hashIndex - a.hashIndex);
}

export function formatWorldReport(state: GameState, playerHashIndex: number): string {
  const world = state.world ?? buildDefaultWorld(state.runSeed);
  const rows = getWorldPlayerSnapshots(world, playerHashIndex).map(
    (p) =>
      `  ${p.isHuman ? '>' : ' '} ${p.name.padEnd(28)} ${String(p.hashIndex).padStart(8)} H/s-index  ${p.sharePct
        .toFixed(2)
        .padStart(6)}%  blocks:${String(p.blocksWon).padStart(4)}`
  );
  const blockRows =
    world.blocks.length === 0
      ? ['  (No blocks mined yet)']
      : world.blocks.slice(0, 6).map(
          (b) =>
            `  #${String(b.height).padStart(5)}  ${b.coin.padEnd(5)} ${b.winnerName.padEnd(
              26
            )} share:${b.playerSharePct.toFixed(2)}%  reward:${b.playerRewardCoins.toFixed(
              4
            )} ${b.coin} (${formatUsd(b.playerRewardUsd)})`
        );

  return [
    `  SHARED BLOCKCHAIN WORLD · ${world.worldId} · ${world.seasonLabel}`,
    `  Block height: ${world.blockHeight} · interval: ${world.blockIntervalMinutes} min/block (${world.stepsPerBlock} step) · reward mode: ${world.rewardMode}`,
    `  Network hash index: ${world.networkHashIndex} · your hash index: ${Math.round(playerHashIndex)}`,
    `  Lifetime: ${world.totalPlayerBlocksWon} blocks won · ${world.totalPlayerCoins.toFixed(
      4
    )} coins · ${formatUsd(world.totalPlayerUsd)}`,
    '',
    '  PLAYERS & POOLS',
    ...rows,
    '',
    '  RECENT BLOCKS',
    ...blockRows,
    '',
    `  ${world.lastBlockSummary}`,
  ].join('\n');
}
