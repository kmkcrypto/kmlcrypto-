import { MARKET_REGIME_SPECS } from '../../data/catalog';
import { getUnlockedSystems } from '../../data/onboarding';
import { formatCoinsCatalogReport } from '../../engine/coins';
import { formatMarketForecastReport, formatWalletAndExchangeReport } from '../../engine/simulation';
import { CoinSymbol, MiningAlgorithm } from '../../types/game';
import { formatCoinAmount, formatUsd, renderAsciiSparkline } from '../../utils/format';
import { formatPortfolioChart, PortfolioChartMetric } from './reports';
import { padLeft, padRight, TerminalCommandHandler } from './types';

export const handleCoinAndExchangeCommand: TerminalCommandHandler = (ctx) => {
  const {
    state,
    props,
    parts,
    cmd,
    arg1,
    arg2,
    arg3,
    arg4,
    append,
    checkSystemUnlocked,
    maybeShowContextualGuide,
    openCoinWizard,
    unlockCoinCommand,
  } = ctx;

  const coinSymbols = Object.keys(state.coins) as CoinSymbol[];

  if (cmd === 'forecast') {
    const sym = arg1 ? (arg1.toUpperCase() as CoinSymbol) : undefined;
    if (sym && !state.coins[sym]) {
      append([
        {
          kind: 'ERR',
          text: `Unknown coin "${arg1}". Usage: forecast [${coinSymbols.join('|')}]`,
        },
      ]);
      return true;
    }
    append([
      { kind: 'HEAD', text: sym ? `MARKET FORECAST BRIEF: ${sym}` : 'CRYPTO MARKET TECHNICAL FORECAST' },
      { kind: 'PRE', text: formatMarketForecastReport(state, sym) },
      {
        kind: 'TEXT',
        text: 'Use "market", "coins", "chart <COIN>", or "exchange buy/sell <COIN>" to trade regimes.',
      },
    ]);
    return true;
  }

  if (cmd === 'coins') {
    append([
      { kind: 'HEAD', text: 'CRYPTOCURRENCY CATALOG & COIN MECHANICS' },
      { kind: 'PRE', text: formatCoinsCatalogReport(state) },
      {
        kind: 'TEXT',
        text: 'Commands: "coin info <SYM>", "coin create" (wizard), "unlock <SYM>", "rig <#> coin <SYM>".',
      },
    ]);
    return true;
  }

  if (cmd === 'market') {
    if (arg1 === 'forecast' || arg1 === 'intel' || arg1 === 'analysis') {
      const sym = arg2 ? (arg2.toUpperCase() as CoinSymbol) : undefined;
      if (sym && !state.coins[sym]) {
        append([
          {
            kind: 'ERR',
            text: `Unknown coin "${arg2}". Usage: market forecast [${coinSymbols.join('|')}]`,
          },
        ]);
        return true;
      }
      append([
        { kind: 'HEAD', text: sym ? `MARKET FORECAST BRIEF: ${sym}` : 'CRYPTO MARKET TECHNICAL FORECAST' },
        { kind: 'PRE', text: formatMarketForecastReport(state, sym) },
      ]);
      return true;
    }
    const unlocked = getUnlockedSystems(state);
    const reg = MARKET_REGIME_SPECS[state.marketRegime];
    const header = `  ${padRight('TIER', 5)} ${padRight('COIN', 6)} ${padRight(
      'ALGO',
      8
    )} ${padLeft('SPOT USD', 10)} ${padLeft('STEP%', 7)}  ${padRight('TREND', 9)} ${padLeft(
      'DIFF',
      6
    )} ${padLeft('HALVE', 7)} ${padLeft('UNLOCK COST', 11)}  STATUS`;
    const rows = coinSymbols.map((sym) => {
      const c = state.coins[sym];
      const pct = c.prevPriceUsd > 0 ? ((c.priceUsd - c.prevPriceUsd) / c.prevPriceUsd) * 100 : 0;
      const spark = renderAsciiSparkline(
        c.priceHistory.map((p) => p.price),
        8
      );
      const status = c.isPlayerCreated
        ? '[PLAYER]'
        : c.unlocked
        ? '[UNLOCKED]'
        : unlocked.coinUnlocks
        ? `[LOCK ${formatUsd(c.unlockCostUsd)}]`
        : '[LOCKED]';
      return `  ${padRight(`T${c.tier}`, 5)} ${padRight(sym, 6)} ${padRight(
        c.algorithm,
        8
      )} ${padLeft(formatUsd(c.priceUsd), 10)} ${padLeft(
        `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
        7
      )}  ${padRight(spark, 9)} ${padLeft(`${c.networkDifficulty.toFixed(2)}x`, 6)} ${padLeft(
        `${c.stepsUntilHalving}st`,
        7
      )} ${padLeft(c.unlockCostUsd === 0 ? 'FREE' : formatUsd(c.unlockCostUsd), 11)}  ${status}`;
    });
    const modLines = (state.activeMarketModifiers ?? []).map(
      (m) => `  * ${m.label} (${m.stepsRemaining}st left): ${m.summary}`
    );
    append([
      {
        kind: 'HEAD',
        text: `COIN EXCHANGE (${coinSymbols.length} LISTED) · REGIME: ${reg.label.toUpperCase()} (${state.regimeStepsRemaining}st left) — ${reg.summary}`,
      },
      ...(modLines.length > 0
        ? [{ kind: 'WARN' as const, text: `ACTIVE MARKET MODIFIERS:\n${modLines.join('\n')}` }]
        : []),
      { kind: 'PRE', text: [header, '-'.repeat(header.length + 6), ...rows].join('\n') },
      {
        kind: 'TEXT',
        text: [
          'Commands: "coins", "coin info <SYM>", "market forecast [COIN]", "chart <COIN>".',
          unlocked.coinUnlocks ? '"unlock <COIN>"' : '',
          unlocked.coins ? '"coin create"' : '',
        ].filter(Boolean).join(' '),
      },
    ]);
    return true;
  }

  if (cmd === 'coin') {
    if (!arg1 || arg1 === 'list') {
      append([
        { kind: 'HEAD', text: 'CRYPTOCURRENCY CATALOG & COIN MECHANICS' },
        { kind: 'PRE', text: formatCoinsCatalogReport(state) },
        { text: 'Run "coin create" to launch a legitimate coin or "coin info <SYM>" to inspect specs.', kind: 'TEXT' },
      ]);
      return true;
    }
    if (arg1 === 'create' || arg1 === 'launch') {
      if (!checkSystemUnlocked('coins', 'launching a custom cryptocurrency')) return true;
      maybeShowContextualGuide('ctx_coins');
      if (arg2 && arg3) {
        const sym = arg2.toUpperCase();
        const algo = arg3.toUpperCase();
        const liq = Number(arg4) || 2500;
        const name = parts.slice(5).join(' ').replace(/^"|"$/g, '') || `${sym} Protocol`;
        const validAlgos: MiningAlgorithm[] = [
          'SHA256',
          'SCRYPT',
          'RANDOMX',
          'ETHASH',
          'KAWPOW',
          'EQUIHASH',
          'POST',
          'QHASH',
        ];
        if (validAlgos.includes(algo as MiningAlgorithm)) {
          const res = props.onCreatePlayerCoin({
            symbol: sym,
            name,
            algorithm: algo as MiningAlgorithm,
            initialLiquidityUsd: liq,
          });
          append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
          return true;
        }
      }
      openCoinWizard();
      return true;
    }
    if (arg1 === 'unlock') {
      unlockCoinCommand(arg2);
      return true;
    }
    if (arg1 === 'info' || state.coins[(arg1 || '').toUpperCase()]) {
      const sym = (arg1 === 'info' ? arg2 : arg1).toUpperCase() as CoinSymbol;
      const c = state.coins[sym];
      if (!c) {
        append([{ kind: 'ERR', text: `Coin "${sym}" not found. Run "coins" to list all symbols.` }]);
        return true;
      }
      const held = state.wallet?.[sym] ?? 0;
      const lines = [
        `  ${c.name} (${c.symbol}) · Algo: ${c.algorithm} · Status: ${
          c.unlocked ? 'UNLOCKED' : `LOCKED (${formatUsd(c.unlockCostUsd)})`
        }`,
        `  Spot Price    : ${formatUsd(c.priceUsd)} (Base ${formatUsd(c.basePriceUsd)})`,
        `  Network Diff  : ${c.networkDifficulty.toFixed(2)}x · Sentiment: ${c.sentiment.toFixed(0)}`,
        `  Halving Cycle : Every ${c.halvingEverySteps}st (${c.stepsUntilHalving}st until next · Scale ${c.blockRewardScale}x)`,
        `  Requirements  : VRAM >= ${c.minVramGb ?? 0} GB · RAM >= ${c.minRamGb ?? 0} GB${
          c.preferredBranch ? ` · Preferred Branch: ${c.preferredBranch}` : ''
        }`,
        `  Total Mined   : ${formatCoinAmount(held)} ${sym} in wallet · ${formatCoinAmount(
          c.totalMined
        )} ${sym} mined overall`,
        ...(c.isPlayerCreated
          ? [
              `  Player Mainnet: Dev Fee ${c.creatorMeta?.creatorFeePct ?? 1.5}% · Adoption ${(
                c.creatorMeta?.adoptionScore ?? 25
              ).toFixed(0)}/100 · Pool ${formatUsd(c.creatorMeta?.initialLiquidityUsd ?? 0)}`,
            ]
          : []),
      ];
      append([
        { kind: 'HEAD', text: `COIN SPEC: ${c.symbol}` },
        { kind: 'PRE', text: lines.join('\n') },
      ]);
      return true;
    }
    append([{ kind: 'ERR', text: 'Usage: coin <list|create|info <SYM>|unlock <SYM>>' }]);
    return true;
  }

  if (cmd === 'unlock') {
    unlockCoinCommand(arg1);
    return true;
  }

  if (cmd === 'chart') {
    const metricKey = (arg1 || 'portfolio').toLowerCase();
    if (
      metricKey === 'portfolio' ||
      metricKey === 'cash' ||
      metricKey === 'valuation' ||
      metricKey === 'profit' ||
      metricKey === 'hashrate' ||
      metricKey === 'power'
    ) {
      append([
        { kind: 'HEAD', text: `ASCII PERFORMANCE ANALYTICS (${metricKey.toUpperCase()})` },
        { kind: 'PRE', text: formatPortfolioChart(state, metricKey as PortfolioChartMetric) },
      ]);
      return true;
    }
    const sym = arg1.toUpperCase() as CoinSymbol;
    const c = state.coins[sym];
    if (!c) {
      append([
        {
          kind: 'ERR',
          text: `Unknown chart "${arg1}". Use: chart <${coinSymbols.slice(0, 9).join('|')}> or chart <portfolio|cash|valuation|profit|hashrate|power>.`,
        },
      ]);
      return true;
    }
    const sliceCount = arg2 === '30' || arg2 === '30s' ? 30 : arg2 === 'all' ? 9999 : 90;
    const pts = c.priceHistory.slice(-sliceCount);
    if (pts.length < 2) {
      append([
        {
          kind: 'TEXT',
          text: `Not enough history yet for ${sym}. Run "step 5" to generate market steps.`,
        },
      ]);
      return true;
    }
    const rows = 9;
    const cols = 48;
    const sampled = Array.from({ length: cols }, (_, idx) => {
      const i = Math.min(pts.length - 1, Math.floor((idx / (cols - 1)) * (pts.length - 1)));
      return pts[i];
    });
    const pMin = Math.min(...sampled.map((s) => s.price));
    const pMax = Math.max(...sampled.map((s) => s.price));
    const span = pMax - pMin || pMax * 0.1 || 1;
    const chartLines = Array.from({ length: rows }, (_, r) => {
      const val = pMax - (r / (rows - 1)) * span;
      const lbl = padLeft(formatUsd(val, true), 9);
      const cells = sampled
        .map((pt) => {
          const rowIdx = Math.round(((pMax - pt.price) / span) * (rows - 1));
          return rowIdx === r ? '●' : rowIdx < r ? '│' : ' ';
        })
        .join('');
      return `${lbl} ┤ ${cells}`;
    });
    append([
      {
        kind: 'HEAD',
        text: `${c.name} (${sym}) SPOT CHART · ${formatUsd(c.priceUsd)} · Diff ${c.networkDifficulty.toFixed(
          2
        )}x · Halving in ${c.stepsUntilHalving}st`,
      },
      {
        kind: 'PRE',
        text: `${chartLines.join('\n')}\n          ${padRight(sampled[0].stepLabel, 24)}${padLeft(
          sampled[sampled.length - 1].stepLabel,
          24
        )}`,
      },
    ]);
    return true;
  }

  if (cmd === 'wallet' || cmd === 'exchange' || cmd === 'trade') {
    const tradingOpen = getUnlockedSystems(state).exchange;
    if (tradingOpen) maybeShowContextualGuide('ctx_exchange');
    if (!arg1 || arg1 === 'status' || arg1 === 'book') {
      append([
        { kind: 'HEAD', text: 'TREASURY WALLET & CRYPTO EXCHANGE DESK' },
        { kind: 'PRE', text: formatWalletAndExchangeReport(state) },
        {
          kind: 'TEXT',
          text: tradingOpen
            ? 'Spot: "exchange buy <COIN> <usd>" · "exchange sell <COIN> <qty|all>" | Payouts: "rig <#|all> payout <hold|sell>"'
            : 'New positions and holding mining payouts unlock after the Stage 3 milestones. Existing holdings and positions can be sold or closed.',
        },
        ...(tradingOpen ? [{
          kind: 'TEXT' as const,
          text: 'Orders: "exchange limit <buy|sell> <COIN> <price> <coinQty>" · "exchange cancel <#>" | Shorts: "exchange short <COIN> <usd>" · "exchange close <#>"',
        }] : []),
      ]);
      return true;
    }
    if (!['sell', 'cancel', 'close'].includes(arg1) &&
        !checkSystemUnlocked('exchange', 'Opening an exchange position')) return true;
    if (arg1 === 'buy') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      const usd = parseFloat(arg3);
      if (!state.coins[coin] || isNaN(usd) || usd <= 0) {
        append([{ kind: 'ERR', text: 'Usage: exchange buy <COIN> <usdAmount>' }]);
        return true;
      }
      const res = props.onExchangeBuy(coin, usd);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'sell') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      const qtyOrAll: number | 'ALL' = arg3 === 'all' ? 'ALL' : parseFloat(arg3);
      if (!state.coins[coin] || !arg3 || (qtyOrAll !== 'ALL' && isNaN(qtyOrAll))) {
        append([{ kind: 'ERR', text: 'Usage: exchange sell <COIN> <coinQty|all>' }]);
        return true;
      }
      const res = props.onExchangeSell(coin, qtyOrAll);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'limit') {
      const sideRaw = arg2.toUpperCase();
      const side = sideRaw === 'BUY' || sideRaw === 'SELL' ? sideRaw : null;
      const coin = (arg3 || '').toUpperCase() as CoinSymbol;
      const targetPrice = parseFloat(arg4 || '');
      const amount = parseFloat(parts[5] || '');
      if (!side || !state.coins[coin] || isNaN(targetPrice) || isNaN(amount) || targetPrice <= 0 || amount <= 0) {
        append([{ kind: 'ERR', text: 'Usage: exchange limit <buy|sell> <COIN> <targetPriceUsd> <coinQty>' }]);
        return true;
      }
      const res = props.onPlaceLimitOrder(side, coin, targetPrice, amount);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'cancel') {
      const idx = parseInt(arg2, 10) - 1;
      if (isNaN(idx)) {
        append([{ kind: 'ERR', text: 'Usage: exchange cancel <order#>' }]);
        return true;
      }
      const res = props.onCancelLimitOrder(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'short') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      const usd = parseFloat(arg3);
      if (!state.coins[coin] || isNaN(usd) || usd <= 0) {
        append([{ kind: 'ERR', text: 'Usage: exchange short <COIN> <collateralUsd>' }]);
        return true;
      }
      const res = props.onOpenShort(coin, usd);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'close') {
      const idx = parseInt(arg2, 10) - 1;
      if (isNaN(idx)) {
        append([{ kind: 'ERR', text: 'Usage: exchange close <short#>' }]);
        return true;
      }
      const res = props.onCloseShort(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([
      {
        kind: 'ERR',
        text: 'Usage: exchange [buy <COIN> <usd> | sell <COIN> <qty|all> | limit <buy|sell> <COIN> <px> <amt> | cancel <#> | short <COIN> <usd> | close <#>]',
      },
    ]);
    return true;
  }

  return false;
};
