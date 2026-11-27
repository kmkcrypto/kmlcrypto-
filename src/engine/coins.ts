import { CORE_COIN_SYMBOLS } from '../data/history';
import {
  CoinMarketState,
  CoinSymbol,
  GameState,
  MiningAlgorithm,
  MiningRig,
  NewsItem,
  TechBranch,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { getEffectivePartBundle, getRigChassisIssue } from './usedMarket';

export interface CreatePlayerCoinInput {
  symbol: string;
  name: string;
  algorithm: MiningAlgorithm;
  initialLiquidityUsd: number;
  halvingEverySteps?: number;
  creatorFeePct?: number;
  minVramGb?: number;
  minRamGb?: number;
  preferredBranch?: TechBranch;
}

const ALGO_COIN_DEFAULTS: Record<
  MiningAlgorithm,
  {
    color: string;
    tier: number;
    baselineHash: number;
    hashExponent: number;
    baseStepCoins: number;
    unitLabel: string;
  }
> = {
  SHA256: { color: '#fbbf24', tier: 2, baselineHash: 1.0, hashExponent: 0.45, baseStepCoins: 0.015, unitLabel: 'MH/s' },
  SCRYPT: { color: '#38bdf8', tier: 2, baselineHash: 0.25, hashExponent: 0.55, baseStepCoins: 0.12, unitLabel: 'MH/s' },
  RANDOMX: { color: '#fb923c', tier: 3, baselineHash: 0.002, hashExponent: 0.85, baseStepCoins: 0.06, unitLabel: 'MH/s' },
  ETHASH: { color: '#a78bfa', tier: 3, baselineHash: 24, hashExponent: 0.72, baseStepCoins: 0.009, unitLabel: 'MH/s' },
  KAWPOW: { color: '#f43f5e', tier: 2, baselineHash: 14, hashExponent: 0.68, baseStepCoins: 14.0, unitLabel: 'MH/s' },
  EQUIHASH: { color: '#14b8a6', tier: 3, baselineHash: 350, hashExponent: 0.7, baseStepCoins: 0.055, unitLabel: 'Sol/s' },
  POST: { color: '#4ade80', tier: 4, baselineHash: 80, hashExponent: 0.78, baseStepCoins: 0.28, unitLabel: 'TB' },
  QHASH: { color: '#c084fc', tier: 5, baselineHash: 900, hashExponent: 0.74, baseStepCoins: 0.08, unitLabel: 'kQ/s' },
};

export function createPlayerCoin(
  state: GameState,
  input: CreatePlayerCoinInput
): { ok: boolean; nextState: GameState; summary: string; symbol?: CoinSymbol } {
  const sym = input.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const name = input.name.trim();
  if (sym.length < 2 || sym.length > 6) {
    return { ok: false, nextState: state, summary: 'Coin ticker symbol must be 2-6 alphanumeric characters.' };
  }
  if (!name || name.length < 3 || name.length > 28) {
    return { ok: false, nextState: state, summary: 'Coin name must be 3-28 characters.' };
  }
  if (state.coins[sym] || CORE_COIN_SYMBOLS.includes(sym as (typeof CORE_COIN_SYMBOLS)[number])) {
    return { ok: false, nextState: state, summary: `Ticker ${sym} is already listed on the exchange.` };
  }
  if ((state.underground?.shellCoins ?? []).some((s) => s.ticker.toUpperCase() === sym)) {
    return {
      ok: false,
      nextState: state,
      summary: `Ticker ${sym} collides with an underground shell coin. Legitimate coins require a clean ticker.`,
    };
  }

  const liquidity = Math.round(input.initialLiquidityUsd);
  if (!Number.isFinite(liquidity) || liquidity < 500) {
    return { ok: false, nextState: state, summary: 'Minimum legitimate coin launch liquidity is $500.' };
  }
  if (state.cash < liquidity) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash for ${formatUsd(liquidity)} initial liquidity pool.`,
    };
  }

  const defaults = ALGO_COIN_DEFAULTS[input.algorithm];
  if (!defaults) {
    return { ok: false, nextState: state, summary: `Unsupported mining algorithm "${input.algorithm}".` };
  }

  const halvingEverySteps = Math.max(30, Math.min(240, Math.round(input.halvingEverySteps ?? 90)));
  const creatorFeePct = Number(Math.max(0, Math.min(5, input.creatorFeePct ?? 1.5)).toFixed(2));
  const minVramGb = Math.max(0, Math.round(input.minVramGb ?? (input.algorithm === 'KAWPOW' || input.algorithm === 'ETHASH' ? 4 : 0)));
  const minRamGb = Math.max(0, Math.round(input.minRamGb ?? 0));

  const startPriceUsd = Number(Math.max(0.15, Math.min(450, liquidity / 450)).toFixed(2));
  const repBoost = Math.round((state.mediaCredibility - 40) * 0.35);
  const initialAdoption = Math.max(15, Math.min(65, 24 + Math.round(Math.log10(liquidity) * 5) + repBoost));
  const stepLabel = formatStepLabel(state.stepCount);

  const newCoin: CoinMarketState = {
    symbol: sym,
    name,
    algorithm: input.algorithm,
    color: defaults.color,
    tier: defaults.tier,
    unlocked: true,
    unlockCostUsd: 0,
    priceUsd: startPriceUsd,
    prevPriceUsd: startPriceUsd,
    basePriceUsd: startPriceUsd,
    priceHistory: [{ step: state.stepCount, stepLabel, price: startPriceUsd }],
    sentiment: Math.min(45, Math.max(-10, repBoost + 12)),
    networkDifficulty: 0.72,
    baselineHash: defaults.baselineHash,
    hashExponent: defaults.hashExponent,
    baseStepCoins: defaults.baseStepCoins,
    totalMined: 0,
    totalEarnedUsd: 0,
    halvingEverySteps,
    stepsUntilHalving: halvingEverySteps,
    halvingCount: 0,
    blockRewardScale: 1,
    payoutNote: `Player mainnet (${creatorFeePct}% dev fee · ${formatUsd(liquidity)} pool)`,
    minVramGb,
    minRamGb,
    preferredBranch: input.preferredBranch,
    volatilityMult: 1.25,
    isPlayerCreated: true,
    creatorMeta: {
      createdStep: state.stepCount,
      initialLiquidityUsd: liquidity,
      creatorFeePct,
      adoptionScore: initialAdoption,
      trustScore: Math.max(30, Math.min(95, state.mediaCredibility)),
      difficultyBias: 0.72,
      totalSupplyMinted: 0,
    },
  };

  const tx: TransactionEntry = {
    id: `tx_coinlaunch_${sym}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    category: 'EXCHANGE',
    amountUsd: -liquidity,
    description: `Seeded legitimate mineable coin ${name} (${sym}) on ${input.algorithm}`,
  };

  const news: NewsItem = {
    id: `news_coinlaunch_${sym}_${state.stepCount}`,
    step: state.stepCount,
    stepLabel,
    title: `Mainnet Launched: ${name} (${sym})`,
    detail: `${input.algorithm} mineable coin live at ${formatUsd(startPriceUsd)} (${formatUsd(
      liquidity
    )} liquidity · ${creatorFeePct}% dev fee). Point any rig with "rig <#> coin ${sym}".`,
    category: 'MILESTONE',
  };

  return {
    ok: true,
    symbol: sym,
    nextState: {
      ...state,
      cash: state.cash - liquidity,
      mediaCredibility: Math.min(100, state.mediaCredibility + 4),
      coins: {
        ...state.coins,
        [sym]: newCoin,
      },
      wallet: {
        ...state.wallet,
        [sym]: 0,
      },
      walletCostBasis: {
        ...state.walletCostBasis,
        [sym]: 0,
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + liquidity,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
    },
    summary: `Launched ${name} (${sym}) on ${input.algorithm} @ ${formatUsd(startPriceUsd)} with ${formatUsd(
      liquidity
    )} pool (Adoption ${initialAdoption}/100, Dev Fee ${creatorFeePct}%).`,
  };
}

export interface RigCoinCompatibilityResult {
  compatible: boolean;
  efficiencyMult: number;
  warnings: string[];
  notes: string[];
}

export function checkRigCoinCompatibility(
  rig: MiningRig | Parameters<typeof getEffectivePartBundle>[0],
  coin: CoinMarketState | undefined,
  existingBundle?: ReturnType<typeof getEffectivePartBundle>
): RigCoinCompatibilityResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!coin) {
    return { compatible: false, efficiencyMult: 0, warnings: ['Unknown target coin.'], notes };
  }

  const bundle = existingBundle ?? getEffectivePartBundle(rig);
  const fitIssue = getRigChassisIssue(rig, bundle);
  if (fitIssue) return { compatible: false, efficiencyMult: 0, warnings: [fitIssue], notes };
  const { chassis, compute, gpus, storage, cooling } = bundle;
  let efficiencyMult = 1.0;

  // 1. Hardware branch / chassis infrastructure compatibility
  const chassisBranches = chassis.allowedBranches;
  const legacyCompute = rig.customParts?.compute ? undefined : rig.customAsicSpec;
  const computeBranch = legacyCompute?.branch ?? compute.branch ?? 'SILICON';
  if (chassisBranches && computeBranch !== 'SILICON' && !chassisBranches.includes(computeBranch)) {
    warnings.push(
      `Chassis "${chassis.name}" lacks ${computeBranch} bay support (0.65x penalty).`
    );
    efficiencyMult *= 0.65;
  }
  if ((compute.requiresCryoCooling || legacyCompute?.branch === 'QUANTUM') && !cooling.isCryoRated && !chassis.isCryoRated) {
    warnings.push(
      `${compute.name} requires Cryo cooling or a Cryo-rated chassis for stable coherence (0.70x output).`
    );
    efficiencyMult *= 0.7;
  }
  if ((compute.requiresOpticalChassis || legacyCompute?.branch === 'PHOTONIC') && !chassis.isOpticalBackplane) {
    warnings.push(
      `${compute.name} lacks an optical backplane chassis (0.82x photonic coupling).`
    );
    efficiencyMult *= 0.82;
  }
  if (
    gpus.some((g) => g.requiresOpticalChassis) &&
    !chassis.isOpticalBackplane
  ) {
    warnings.push('Photonic QGPU cards perform best in an optical backplane chassis (0.88x).');
    efficiencyMult *= 0.88;
  }
  if (gpus.some((g) => g.requiresCryoCooling) && !cooling.isCryoRated && !chassis.isCryoRated) {
    warnings.push('Cryo QPU accelerators lose coherence without Cryo cooling (0.78x).');
    efficiencyMult *= 0.78;
  }

  // 2. Coin VRAM & RAM constraints
  if (coin.minVramGb && coin.minVramGb > 0) {
    const minVramGb = coin.minVramGb;
    const maxCardVram = gpus.reduce((m, g) => Math.max(m, g.vramGb ?? 4), 0);
    const customAsic = 'customAsicSpec' in rig ? rig.customAsicSpec : undefined;
    const computeAlgoHash = customAsic?.algo === coin.algorithm ? customAsic.hashRate : compute.hashrates[coin.algorithm] ?? 0;
    let nominalHash = computeAlgoHash;
    let memoryLimitedHash = 0;
    let limitedCards = 0;
    for (const gpu of gpus) {
      const hash = gpu.hashrates[coin.algorithm] ?? 0;
      nominalHash += hash;
      if (hash > 0 && (gpu.vramGb ?? 4) < minVramGb) {
        memoryLimitedHash += hash;
        limitedCards += 1;
      }
    }
    if (limitedCards > 0 && nominalHash > 0) {
      warnings.push(
        `${coin.symbol} needs ${minVramGb} GB VRAM per GPU. ${limitedCards} undersized card(s) run at 55% output.`
      );
      efficiencyMult *= 1 - (memoryLimitedHash / nominalHash) * 0.45;
    } else if (gpus.length === 0 && computeAlgoHash <= 0) {
      warnings.push(`${coin.symbol} (${coin.algorithm}) needs >=${coin.minVramGb} GB VRAM GPUs.`);
    } else if (gpus.length > 0 && maxCardVram >= coin.minVramGb * 2) {
      notes.push(`High VRAM headroom (${maxCardVram} GB vs ${coin.minVramGb} GB min)`);
    }
  }

  if (coin.minRamGb && coin.minRamGb > 0 && storage.ramGb < coin.minRamGb) {
    warnings.push(
      `${coin.symbol} recommends ${coin.minRamGb} GB RAM (rig has ${storage.ramGb} GB -> 0.72x).`
    );
    efficiencyMult *= 0.72;
  }

  // 3. Coin branch preference (e.g. QBC favors QUANTUM or PHOTONIC hardware)
  if (coin.preferredBranch) {
    const hasBranchMatch =
      compute.branch === coin.preferredBranch ||
      gpus.some((g) => g.branch === coin.preferredBranch) ||
      chassis.branch === coin.preferredBranch;
    if (hasBranchMatch) {
      efficiencyMult *= 1.18;
      notes.push(`${coin.preferredBranch} branch resonance (+18% yield)`);
    } else if (coin.algorithm === 'QHASH') {
      notes.push(`Standard hardware running ${coin.symbol} (Gen-7 ${coin.preferredBranch} earns +18%)`);
    }
  }

  // 4. Algorithm capability check
  const hasAlgoHash =
    coin.algorithm === 'POST'
      ? storage.storageTb > 0
      : (compute.hashrates[coin.algorithm] ?? 0) > 0 ||
        gpus.some((g) => (g.hashrates[coin.algorithm] ?? 0) > 0) ||
        ('customAsicSpec' in rig && rig.customAsicSpec?.algo === coin.algorithm);

  if (!hasAlgoHash) {
    warnings.push(`Installed parts produce 0 H/s on ${coin.algorithm}.`);
  }

  return {
    compatible: hasAlgoHash,
    efficiencyMult: Number(efficiencyMult.toFixed(3)),
    warnings,
    notes,
  };
}

export function formatCoinsCatalogReport(state: GameState): string {
  const symbols = Object.keys(state.coins);
  const header = `  COIN   ${'NAME'.padEnd(20)} ${'ALGO'.padEnd(9)} ${'SPOT'.padStart(10)} ${'VRAM/RAM'.padEnd(
    10
  )} ${'BRANCH'.padEnd(9)} STATUS`;
  const rows = symbols.map((sym) => {
    const c = state.coins[sym];
    const reqStr = `${c.minVramGb ? `${c.minVramGb}G` : '-'}/${c.minRamGb ? `${c.minRamGb}G` : '-'}`;
    const branch = c.preferredBranch ?? 'ANY';
    const status = c.isPlayerCreated
      ? `CUSTOM (Adopt ${c.creatorMeta?.adoptionScore ?? 25} · Fee ${c.creatorMeta?.creatorFeePct ?? 0}%)`
      : c.unlocked
      ? 'UNLOCKED'
      : `LOCKED (${formatUsd(c.unlockCostUsd)})`;
    return `  ${c.symbol.padEnd(6)} ${c.name.slice(0, 20).padEnd(20)} ${c.algorithm.padEnd(9)} ${formatUsd(
      c.priceUsd
    ).padStart(10)} ${reqStr.padEnd(10)} ${branch.padEnd(9)} ${status}`;
  });

  return [
    header,
    '-'.repeat(header.length + 18),
    ...rows,
    '',
    '  Legitimate Custom Coins ("coin create" wizard | "coin info <SYMBOL>"):',
    '  - Separate from illegal underground shell coins ("ops coin ...").',
    '  - Mineable on any rig once launched, traded on the Spot Exchange, with creator fee revenue.',
  ].join('\n');
}
