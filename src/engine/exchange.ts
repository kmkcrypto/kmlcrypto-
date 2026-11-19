import {
  CoinMarketState,
  CoinSymbol,
  GameState,
  LimitOrder,
  NewsItem,
  ShortPosition,
  TransactionEntry,
} from '../types/game';
import { formatCoinAmount, formatStepLabel, formatUsd } from '../utils/format';

const ALL_COINS: CoinSymbol[] = ['BTC', 'LTC', 'DOGE', 'XMR', 'ETH', 'XCH'];

export function buildDefaultWallet(
  prev?: Partial<Record<CoinSymbol, number>>
): Record<CoinSymbol, number> {
  return {
    BTC: typeof prev?.BTC === 'number' && Number.isFinite(prev.BTC) ? Math.max(0, prev.BTC) : 0,
    LTC: typeof prev?.LTC === 'number' && Number.isFinite(prev.LTC) ? Math.max(0, prev.LTC) : 0,
    DOGE: typeof prev?.DOGE === 'number' && Number.isFinite(prev.DOGE) ? Math.max(0, prev.DOGE) : 0,
    XMR: typeof prev?.XMR === 'number' && Number.isFinite(prev.XMR) ? Math.max(0, prev.XMR) : 0,
    ETH: typeof prev?.ETH === 'number' && Number.isFinite(prev.ETH) ? Math.max(0, prev.ETH) : 0,
    XCH: typeof prev?.XCH === 'number' && Number.isFinite(prev.XCH) ? Math.max(0, prev.XCH) : 0,
  };
}

export function getSpotExchangeFeePct(
  state: Pick<GameState, 'unlockedResearch' | 'employees'>
): number {
  let fee = 0.012; // 1.2%
  if (state.unlockedResearch?.includes('res_quant_forecasting')) {
    fee *= 0.75;
  }
  const analystLvls = (state.employees ?? [])
    .filter((e) => e.role === 'ANALYST')
    .reduce((s, e) => s + (e.skillLevel ?? 1), 0);
  fee *= Math.max(0.45, 1 - analystLvls * 0.08);
  return Number(Math.max(0.0035, fee).toFixed(4));
}

export function getWalletMarketValueUsd(state: Pick<GameState, 'wallet' | 'coins'>): number {
  const wallet = buildDefaultWallet(state.wallet);
  return ALL_COINS.reduce((sum, sym) => {
    const qty = wallet[sym] ?? 0;
    const px = state.coins[sym]?.priceUsd ?? 0;
    return sum + qty * px;
  }, 0);
}

export function computeShortEquity(pos: ShortPosition, currentPriceUsd: number): number {
  // 1x collateralized short: profit = coinSize * (entry - current)
  const pnl = pos.coinSize * (pos.entryPriceUsd - currentPriceUsd);
  return pos.collateralUsd + pnl;
}

export function getShortPositionsEquityUsd(
  state: Pick<GameState, 'shortPositions' | 'coins'>
): number {
  return (state.shortPositions ?? []).reduce((sum, pos) => {
    const px = state.coins[pos.coin]?.priceUsd ?? pos.entryPriceUsd;
    return sum + Math.max(0, computeShortEquity(pos, px));
  }, 0);
}

export function executeSpotBuy(
  state: GameState,
  coin: CoinSymbol,
  usdAmount: number
): { ok: boolean; nextState: GameState; summary: string } {
  const targetCoin = state.coins[coin];
  if (!targetCoin) return { ok: false, nextState: state, summary: `Unknown coin "${coin}".` };
  if (!Number.isFinite(usdAmount) || usdAmount < 10) {
    return { ok: false, nextState: state, summary: 'Minimum spot buy order is $10.' };
  }
  if (state.cash < usdAmount) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash (need ${formatUsd(usdAmount)}).`,
    };
  }

  const feePct = getSpotExchangeFeePct(state);
  const feeUsd = usdAmount * feePct;
  const netSpend = usdAmount - feeUsd;
  const coinsBought = netSpend / Math.max(1e-6, targetCoin.priceUsd);

  const wallet = buildDefaultWallet(state.wallet);
  const costBasis = buildDefaultWallet(state.walletCostBasis);
  wallet[coin] += coinsBought;
  costBasis[coin] += usdAmount;

  const tx: TransactionEntry = {
    id: `tx_exbuy_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'EXCHANGE',
    amountUsd: -usdAmount,
    description: `Spot Buy ${formatCoinAmount(coinsBought)} ${coin} @ ${formatUsd(targetCoin.priceUsd)}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - usdAmount,
      wallet,
      walletCostBasis: costBasis,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Bought ${formatCoinAmount(coinsBought)} ${coin} for ${formatUsd(usdAmount)} (Fee ${(
      feePct * 100
    ).toFixed(2)}% = ${formatUsd(feeUsd)}).`,
  };
}

export function executeSpotSell(
  state: GameState,
  coin: CoinSymbol,
  amountOrAll: number | 'ALL'
): { ok: boolean; nextState: GameState; summary: string } {
  const targetCoin = state.coins[coin];
  if (!targetCoin) return { ok: false, nextState: state, summary: `Unknown coin "${coin}".` };

  const wallet = buildDefaultWallet(state.wallet);
  const held = wallet[coin] ?? 0;
  if (held <= 1e-8) {
    return { ok: false, nextState: state, summary: `Your wallet holds 0 ${coin}.` };
  }

  const sellQty = amountOrAll === 'ALL' ? held : Math.min(held, amountOrAll);
  if (!Number.isFinite(sellQty) || sellQty <= 1e-8) {
    return { ok: false, nextState: state, summary: 'Specify a valid positive coin quantity or "all".' };
  }

  const feePct = getSpotExchangeFeePct(state);
  const grossUsd = sellQty * targetCoin.priceUsd;
  const feeUsd = grossUsd * feePct;
  const netUsd = grossUsd - feeUsd;

  const costBasis = buildDefaultWallet(state.walletCostBasis);
  const fracSold = Math.min(1, sellQty / Math.max(1e-8, held));
  const basisUsed = costBasis[coin] * fracSold;
  const realizedPnl = netUsd - basisUsed;
  wallet[coin] = Math.max(0, held - sellQty);
  costBasis[coin] = Math.max(0, costBasis[coin] - basisUsed);

  const tx: TransactionEntry = {
    id: `tx_exsell_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'EXCHANGE',
    amountUsd: netUsd,
    description: `Spot Sell ${formatCoinAmount(sellQty)} ${coin} @ ${formatUsd(targetCoin.priceUsd)}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + netUsd,
      wallet,
      walletCostBasis: costBasis,
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Sold ${formatCoinAmount(sellQty)} ${coin} for +${formatUsd(netUsd)} net (Realized P&L: ${
      realizedPnl >= 0 ? '+' : '-'
    }${formatUsd(Math.abs(realizedPnl))}).`,
  };
}

export function placeLimitOrder(
  state: GameState,
  side: 'BUY' | 'SELL',
  coin: CoinSymbol,
  targetPriceUsd: number,
  amount: number
): { ok: boolean; nextState: GameState; summary: string } {
  const targetCoin = state.coins[coin];
  if (!targetCoin) return { ok: false, nextState: state, summary: `Unknown coin "${coin}".` };
  if (!Number.isFinite(targetPriceUsd) || targetPriceUsd <= 0) {
    return { ok: false, nextState: state, summary: 'Limit price must be > $0.' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, nextState: state, summary: 'Order amount must be > 0.' };
  }

  const wallet = buildDefaultWallet(state.wallet);
  let nextCash = state.cash;

  if (side === 'BUY') {
    if (amount < 10) return { ok: false, nextState: state, summary: 'Minimum BUY limit is $10.' };
    if (state.cash < amount) {
      return {
        ok: false,
        nextState: state,
        summary: `Need ${formatUsd(amount)} cash to escrow BUY limit order.`,
      };
    }
    nextCash -= amount;
  } else {
    if ((wallet[coin] ?? 0) < amount) {
      return {
        ok: false,
        nextState: state,
        summary: `Insufficient ${coin} in wallet (have ${formatCoinAmount(wallet[coin] ?? 0)}).`,
      };
    }
    wallet[coin] -= amount;
  }

  const order: LimitOrder = {
    id: `ord_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    side,
    coin,
    targetPriceUsd,
    amount,
    reservedUsd: side === 'BUY' ? amount : undefined,
    createdStep: state.stepCount,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: nextCash,
      wallet,
      limitOrders: [...(state.limitOrders ?? []), order],
    },
    summary:
      side === 'BUY'
        ? `Placed LIMIT BUY ${coin} for ${formatUsd(amount)} when spot <= ${formatUsd(targetPriceUsd)} (cash escrowed).`
        : `Placed LIMIT SELL ${formatCoinAmount(amount)} ${coin} when spot >= ${formatUsd(targetPriceUsd)} (coins escrowed).`,
  };
}

export function cancelLimitOrder(
  state: GameState,
  orderIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const orders = state.limitOrders ?? [];
  const ord = orders[orderIdx];
  if (!ord) return { ok: false, nextState: state, summary: `Limit order #${orderIdx + 1} not found.` };

  let nextCash = state.cash;
  const wallet = buildDefaultWallet(state.wallet);
  if (ord.side === 'BUY') {
    nextCash += ord.reservedUsd ?? ord.amount;
  } else {
    wallet[ord.coin] += ord.amount;
  }

  return {
    ok: true,
    nextState: {
      ...state,
      cash: nextCash,
      wallet,
      limitOrders: orders.filter((_, i) => i !== orderIdx),
    },
    summary: `Cancelled ${ord.side} limit order #${orderIdx + 1} (${ord.coin}); escrowed funds returned.`,
  };
}

export function openShortPosition(
  state: GameState,
  coin: CoinSymbol,
  collateralUsd: number
): { ok: boolean; nextState: GameState; summary: string } {
  const targetCoin = state.coins[coin];
  if (!targetCoin) return { ok: false, nextState: state, summary: `Unknown coin "${coin}".` };
  if (!Number.isFinite(collateralUsd) || collateralUsd < 100) {
    return { ok: false, nextState: state, summary: 'Minimum short position collateral is $100.' };
  }
  if (state.cash < collateralUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `Insufficient cash for ${formatUsd(collateralUsd)} short margin collateral.`,
    };
  }

  const feePct = getSpotExchangeFeePct(state);
  const feeUsd = collateralUsd * feePct;
  const netMargin = collateralUsd - feeUsd;
  const coinSize = netMargin / Math.max(1e-6, targetCoin.priceUsd);

  const pos: ShortPosition = {
    id: `short_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    coin,
    entryPriceUsd: targetCoin.priceUsd,
    collateralUsd: netMargin,
    coinSize,
    openedStep: state.stepCount,
  };

  const tx: TransactionEntry = {
    id: `tx_short_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'EXCHANGE',
    amountUsd: -collateralUsd,
    description: `Opened ${coin} short (${formatCoinAmount(coinSize)} ${coin} @ ${formatUsd(
      targetCoin.priceUsd
    )})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - collateralUsd,
      shortPositions: [...(state.shortPositions ?? []), pos],
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Opened ${coin} SHORT (${formatCoinAmount(coinSize)} ${coin} @ ${formatUsd(
      targetCoin.priceUsd
    )}, collateral ${formatUsd(netMargin)}; auto-liquidates at +85% rally).`,
  };
}

export function closeShortPosition(
  state: GameState,
  posIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const positions = state.shortPositions ?? [];
  const pos = positions[posIdx];
  if (!pos) return { ok: false, nextState: state, summary: `Short position #${posIdx + 1} not found.` };

  const curPx = state.coins[pos.coin]?.priceUsd ?? pos.entryPriceUsd;
  const equity = Math.max(0, computeShortEquity(pos, curPx));
  const pnl = equity - pos.collateralUsd;

  const tx: TransactionEntry = {
    id: `tx_short_close_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'EXCHANGE',
    amountUsd: equity,
    description: `Closed ${pos.coin} short @ ${formatUsd(curPx)} (${pnl >= 0 ? '+' : '-'}${formatUsd(
      Math.abs(pnl)
    )})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + equity,
      shortPositions: positions.filter((_, i) => i !== posIdx),
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Closed ${pos.coin} SHORT @ ${formatUsd(curPx)} -> Returned ${formatUsd(equity)} (P&L: ${
      pnl >= 0 ? '+' : '-'
    }${formatUsd(Math.abs(pnl))}).`,
  };
}

export function stepExchangeOrdersAndShorts(
  state: {
    cash: number;
    wallet: Record<CoinSymbol, number>;
    walletCostBasis: Record<CoinSymbol, number>;
    limitOrders: LimitOrder[];
    shortPositions: ShortPosition[];
    unlockedResearch: string[];
    employees: GameState['employees'];
  },
  nextCoins: Record<CoinSymbol, CoinMarketState>,
  nextStep: number,
  stepLabel: string
): {
  cash: number;
  wallet: Record<CoinSymbol, number>;
  walletCostBasis: Record<CoinSymbol, number>;
  limitOrders: LimitOrder[];
  shortPositions: ShortPosition[];
  news: NewsItem[];
  transactions: TransactionEntry[];
  alertHit: boolean;
} {
  let cash = state.cash;
  const wallet = { ...state.wallet };
  const costBasis = { ...state.walletCostBasis };
  const remainingOrders: LimitOrder[] = [];
  const remainingShorts: ShortPosition[] = [];
  const news: NewsItem[] = [];
  const transactions: TransactionEntry[] = [];
  let alertHit = false;

  const feePct = getSpotExchangeFeePct(state);

  for (const ord of state.limitOrders) {
    const px = nextCoins[ord.coin]?.priceUsd ?? 0;
    if (ord.side === 'BUY' && px > 0 && px <= ord.targetPriceUsd) {
      const spend = ord.reservedUsd ?? ord.amount;
      const net = spend * (1 - feePct);
      const bought = net / px;
      wallet[ord.coin] += bought;
      costBasis[ord.coin] += spend;
      news.push({
        id: `news_lim_buy_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Limit BUY Filled: ${ord.coin}`,
        detail: `Bought ${formatCoinAmount(bought)} ${ord.coin} @ ${formatUsd(px)} (target <= ${formatUsd(
          ord.targetPriceUsd
        )}).`,
        category: 'MARKET',
      });
      transactions.push({
        id: `tx_lim_buy_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'EXCHANGE',
        amountUsd: 0,
        description: `Limit BUY filled: ${formatCoinAmount(bought)} ${ord.coin} @ ${formatUsd(px)}`,
      });
    } else if (ord.side === 'SELL' && px >= ord.targetPriceUsd) {
      const gross = ord.amount * px;
      const proceeds = gross * (1 - feePct);
      cash += proceeds;
      news.push({
        id: `news_lim_sell_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Limit SELL Filled: ${ord.coin}`,
        detail: `Sold ${formatCoinAmount(ord.amount)} ${ord.coin} @ ${formatUsd(px)} for +${formatUsd(
          proceeds
        )}.`,
        category: 'MARKET',
      });
      transactions.push({
        id: `tx_lim_sell_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'EXCHANGE',
        amountUsd: proceeds,
        description: `Limit SELL filled: ${formatCoinAmount(ord.amount)} ${ord.coin} @ ${formatUsd(px)}`,
      });
    } else {
      remainingOrders.push(ord);
    }
  }

  for (const pos of state.shortPositions) {
    const px = nextCoins[pos.coin]?.priceUsd ?? pos.entryPriceUsd;
    const eq = computeShortEquity(pos, px);
    if (eq <= pos.collateralUsd * 0.15) {
      const salvage = Math.max(0, eq);
      cash += salvage;
      alertHit = true;
      news.push({
        id: `news_liq_${pos.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Short Liquidated: ${pos.coin}`,
        detail: `${pos.coin} surged to ${formatUsd(px)}; short closed with ${formatUsd(salvage)} remaining margin.`,
        category: 'ALERT',
      });
      transactions.push({
        id: `tx_liq_${pos.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        category: 'EXCHANGE',
        amountUsd: salvage,
        description: `Liquidated ${pos.coin} short @ ${formatUsd(px)}`,
      });
    } else {
      remainingShorts.push(pos);
    }
  }

  return {
    cash,
    wallet,
    walletCostBasis: costBasis,
    limitOrders: remainingOrders,
    shortPositions: remainingShorts,
    news,
    transactions,
    alertHit,
  };
}

export function formatWalletAndExchangeReport(state: GameState): string {
  const wallet = buildDefaultWallet(state.wallet);
  const basis = buildDefaultWallet(state.walletCostBasis);
  const feePct = getSpotExchangeFeePct(state);
  const holdRigs = state.rigs.filter((r) => r.payoutMode === 'HOLD').length;

  let totalValueUsd = 0;
  const holdingRows = ALL_COINS.map((sym) => {
    const qty = wallet[sym];
    const px = state.coins[sym].priceUsd;
    const val = qty * px;
    totalValueUsd += val;
    const cb = basis[sym];
    const pnl = val - cb;
    const pnlStr =
      qty <= 1e-8
        ? '$0'
        : `${pnl >= 0 ? '+' : '-'}${formatUsd(Math.abs(pnl))}`;
    return `  ${sym.padEnd(5)} ${formatCoinAmount(qty).padStart(12)}  Spot:${formatUsd(px).padStart(
      10
    )}  Value:${formatUsd(val).padStart(11)}  UnrealP&L:${pnlStr.padStart(10)}`;
  });

  const orders = state.limitOrders ?? [];
  const orderRows =
    orders.length === 0
      ? ['  (No open limit orders)']
      : orders.map(
          (o, i) =>
            `  #${i + 1} ${o.side.padEnd(4)} ${o.coin.padEnd(4)} @ Target ${formatUsd(
              o.targetPriceUsd
            )}  Amt: ${
              o.side === 'BUY' ? formatUsd(o.amount) : `${formatCoinAmount(o.amount)} ${o.coin}`
            }`
        );

  const shorts = state.shortPositions ?? [];
  const shortRows =
    shorts.length === 0
      ? ['  (No open short positions)']
      : shorts.map((p, i) => {
          const curPx = state.coins[p.coin]?.priceUsd ?? p.entryPriceUsd;
          const eq = Math.max(0, computeShortEquity(p, curPx));
          const pnl = eq - p.collateralUsd;
          return `  #${i + 1} SHORT ${p.coin} (${formatCoinAmount(p.coinSize)} @ ${formatUsd(
            p.entryPriceUsd
          )}) -> Equity ${formatUsd(eq)} (${pnl >= 0 ? '+' : '-'}${formatUsd(Math.abs(pnl))})`;
        });

  return [
    `  TREASURY WALLET & EXCHANGE DESK (Spot Fee: ${(feePct * 100).toFixed(2)}% | HOLD Rigs: ${holdRigs}/${
      state.rigs.length
    })`,
    `  Liquid Cash: ${formatUsd(state.cash)}   Coin Treasury Value: ${formatUsd(totalValueUsd)}`,
    ``,
    ...holdingRows,
    ``,
    `  OPEN LIMIT ORDERS ("exchange limit <buy|sell> <COIN> <price> <amt>" | "exchange cancel <#>")`,
    ...orderRows,
    ``,
    `  ACTIVE MARGIN SHORTS ("exchange short <COIN> <usd>" | "exchange close <#>")`,
    ...shortRows,
    ``,
    `  COMMANDS:`,
    `    rig <#|all> payout <hold|sell>         Hold mined coins in wallet or auto-sell every step`,
    `    exchange buy <COIN> <usd>              Buy spot coins into treasury wallet`,
    `    exchange sell <COIN> <qty|all>         Sell held coins to USD`,
    `    exchange limit <buy|sell> <COIN> <px> <amt>   Auto-execute when spot hits target`,
    `    exchange short <COIN> <collateralUsd>  Profit from price drops (1x margin)`,
  ].join('\n');
}
