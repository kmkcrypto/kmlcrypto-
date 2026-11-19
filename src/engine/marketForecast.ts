import { MARKET_REGIME_SPECS } from '../data/catalog';
import { CoinMarketState, CoinSymbol, GameState } from '../types/game';
import { formatUsd } from '../utils/format';

export type MarketSignal =
  | 'STRONG BUY'
  | 'ACCUMULATE'
  | 'NEUTRAL'
  | 'OVERBOUGHT'
  | 'DISTRIBUTION';

export interface CoinMarketForecast {
  symbol: CoinSymbol;
  name: string;
  spotUsd: number;
  sma5Usd: number;
  sma14Usd: number;
  momentum5Pct: number;
  momentum14Pct: number;
  rsi14: number;
  volatilityPct: number;
  supportUsd: number;
  resistanceUsd: number;
  signal: MarketSignal;
  projectedBiasPct: number;
  catalysts: string[];
  summary: string;
}

function computeRsi(prices: number[], period = 14): number {
  if (prices.length < 3) return 50;
  const slice = prices.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const n = Math.max(1, slice.length - 1);
  const avgGain = gains / n;
  const avgLoss = losses / n;
  if (avgLoss <= 1e-9) return avgGain > 0 ? 88 : 50;
  const rs = avgGain / avgLoss;
  return Math.round(Math.max(5, Math.min(95, 100 - 100 / (1 + rs))));
}

function computeVolatilityPct(prices: number[]): number {
  if (prices.length < 3) return 3.2;
  const recent = prices.slice(-15);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) {
      returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
    }
  }
  if (returns.length === 0) return 3.2;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Number((Math.sqrt(variance) * 100).toFixed(2));
}

export function analyzeCoinForecast(
  coin: CoinMarketState,
  state: Pick<
    GameState,
    'marketRegime' | 'regimeStepsRemaining' | 'activeMarketModifiers' | 'activeCampaigns' | 'unlockedResearch' | 'employees'
  >
): CoinMarketForecast {
  const prices = coin.priceHistory.map((p) => p.price);
  if (prices.length === 0) prices.push(coin.priceUsd);

  const slice5 = prices.slice(-5);
  const slice14 = prices.slice(-14);
  const sma5Usd = slice5.reduce((s, v) => s + v, 0) / slice5.length;
  const sma14Usd = slice14.reduce((s, v) => s + v, 0) / slice14.length;

  const ref5 = prices[Math.max(0, prices.length - 5)];
  const ref14 = prices[Math.max(0, prices.length - 14)];
  const momentum5Pct = ref5 > 0 ? ((coin.priceUsd - ref5) / ref5) * 100 : 0;
  const momentum14Pct = ref14 > 0 ? ((coin.priceUsd - ref14) / ref14) * 100 : 0;

  const rsi14 = computeRsi(prices, 14);
  const volatilityPct = computeVolatilityPct(prices);
  const minWindow = Math.min(...slice14, coin.priceUsd);
  const maxWindow = Math.max(...slice14, coin.priceUsd);
  const supportUsd = minWindow * 0.96;
  const resistanceUsd = maxWindow * 1.04;

  const reg = MARKET_REGIME_SPECS[state.marketRegime];
  const modDrift = (state.activeMarketModifiers ?? []).reduce(
    (s, m) => s + m.coinPriceDriftDelta,
    0
  );
  const campaignDrift = (state.activeCampaigns ?? [])
    .filter((c) => c.targetCoin === coin.symbol)
    .reduce((s, c) => s + c.stepPriceImpulse, 0);
  const meanReversion = Math.log(coin.basePriceUsd / Math.max(1e-5, coin.priceUsd)) * 0.045;
  const sentimentBias = (coin.sentiment / 100) * 0.006;

  const stepExpectedDrift =
    reg.stepDrift + modDrift + campaignDrift + meanReversion + sentimentBias;
  const projectedBiasPct = Number((stepExpectedDrift * 100 * 5).toFixed(2)); // 5-step drift outlook

  const catalysts: string[] = [];
  catalysts.push(`${reg.label} (${state.regimeStepsRemaining}st left)`);
  if (coin.stepsUntilHalving <= 12) {
    catalysts.push(`Halving in ${coin.stepsUntilHalving}st (+24% supply shock ahead)`);
  }
  if (campaignDrift > 0.002) catalysts.push('Active HYPE PR tailwind');
  if (campaignDrift < -0.002) catalysts.push('Active FUD PR pressure');
  if (coin.priceUsd < coin.basePriceUsd * 0.82) catalysts.push('Deep discount vs long-run baseline');
  if (coin.priceUsd > coin.basePriceUsd * 1.35) catalysts.push('Extended above baseline valuation');

  let score = 0;
  if (coin.priceUsd > sma5Usd) score += 1;
  if (sma5Usd > sma14Usd) score += 1;
  if (rsi14 <= 34) score += 2;
  else if (rsi14 >= 72) score -= 2;
  if (projectedBiasPct >= 3) score += 2;
  else if (projectedBiasPct <= -3) score -= 2;
  if (coin.stepsUntilHalving <= 10) score += 2;

  const signal: MarketSignal =
    score >= 4
      ? 'STRONG BUY'
      : score >= 2
      ? 'ACCUMULATE'
      : score <= -3
      ? 'DISTRIBUTION'
      : score <= -1
      ? 'OVERBOUGHT'
      : 'NEUTRAL';

  const hasQuantDesk =
    state.unlockedResearch?.includes('res_quant_forecasting') ||
    (state.employees ?? []).some((e) => e.role === 'ANALYST');

  const summary = hasQuantDesk
    ? `5st Outlook: ${projectedBiasPct >= 0 ? '+' : ''}${projectedBiasPct}% | Band ${formatUsd(
        supportUsd
      )}–${formatUsd(resistanceUsd)} | ${catalysts[0] ?? 'Balanced flow'}`
    : `${catalysts[0] ?? 'Balanced flow'} · RSI ${rsi14} (${signal})`;

  return {
    symbol: coin.symbol,
    name: coin.name,
    spotUsd: coin.priceUsd,
    sma5Usd,
    sma14Usd,
    momentum5Pct: Number(momentum5Pct.toFixed(2)),
    momentum14Pct: Number(momentum14Pct.toFixed(2)),
    rsi14,
    volatilityPct,
    supportUsd,
    resistanceUsd,
    signal,
    projectedBiasPct,
    catalysts,
    summary,
  };
}

export function formatMarketForecastReport(
  state: GameState,
  targetCoin?: CoinSymbol
): string {
  const reg = MARKET_REGIME_SPECS[state.marketRegime];
  const hasQuant =
    state.unlockedResearch?.includes('res_quant_forecasting') ||
    state.employees.some((e) => e.role === 'ANALYST');

  const symbols: CoinSymbol[] = targetCoin
    ? [targetCoin]
    : (Object.keys(state.coins) as CoinSymbol[]);

  const forecasts = symbols.map((s) => analyzeCoinForecast(state.coins[s], state));

  if (targetCoin && forecasts.length === 1) {
    const f = forecasts[0];
    const c = state.coins[targetCoin];
    return [
      `  TECHNICAL & FUNDAMENTAL BRIEF: ${f.name} (${f.symbol})`,
      `    Spot Price:     ${formatUsd(f.spotUsd)}   (Long-run Base: ${formatUsd(c.basePriceUsd)})`,
      `    SMA(5) / SMA14: ${formatUsd(f.sma5Usd)} / ${formatUsd(f.sma14Usd)}`,
      `    Momentum 5/14:  ${f.momentum5Pct >= 0 ? '+' : ''}${f.momentum5Pct.toFixed(1)}%  /  ${
        f.momentum14Pct >= 0 ? '+' : ''
      }${f.momentum14Pct.toFixed(1)}%`,
      `    RSI(14) / Vol:  ${f.rsi14}/100  ·  ${f.volatilityPct}% step σ`,
      `    Support / Res:  ${formatUsd(f.supportUsd)}  ..  ${formatUsd(f.resistanceUsd)}`,
      `    Sentiment:      ${Math.round(c.sentiment)}/100   Halving in: ${c.stepsUntilHalving} steps`,
      `    Desk Signal:    [${f.signal}]${
        hasQuant ? ` (Quant 5-step drift bias: ${f.projectedBiasPct >= 0 ? '+' : ''}${f.projectedBiasPct}%)` : ''
      }`,
      `    Catalysts:      ${f.catalysts.join(' · ')}`,
    ].join('\n');
  }

  const header = `  COIN  ${'SPOT'.padStart(10)} ${'5ST%'.padStart(7)} ${'14ST%'.padStart(7)} ${'RSI'.padStart(
    4
  )} ${'VOL%'.padStart(6)} ${'5ST BIAS'.padStart(9)}  ${'SIGNAL'.padEnd(13)} CATALYST`;
  const rows = forecasts.map((f) => {
    const biasStr = hasQuant
      ? `${f.projectedBiasPct >= 0 ? '+' : ''}${f.projectedBiasPct.toFixed(1)}%`
      : 'R&D/Anlyst';
    return `  ${f.symbol.padEnd(5)} ${formatUsd(f.spotUsd).padStart(10)} ${(
      (f.momentum5Pct >= 0 ? '+' : '') + f.momentum5Pct.toFixed(1) + '%'
    ).padStart(7)} ${(
      (f.momentum14Pct >= 0 ? '+' : '') + f.momentum14Pct.toFixed(1) + '%'
    ).padStart(7)} ${String(f.rsi14).padStart(4)} ${(f.volatilityPct.toFixed(1) + '%').padStart(
      6
    )} ${biasStr.padStart(9)}  ${f.signal.padEnd(13)} ${f.catalysts[0] ?? ''}`;
  });

  return [
    `  MACRO REGIME: ${reg.label} (${state.regimeStepsRemaining}st left) · Quant Desk: ${
      hasQuant ? 'ACTIVE (5-step drift unlocked)' : 'Basic (Research Quant Forecasting or hire Analyst)'
    }`,
    ``,
    header,
    '-'.repeat(header.length + 18),
    ...rows,
    ``,
    `  Tip: Run "market forecast <COIN>" for support/resistance bands and full technicals.`,
  ].join('\n');
}
