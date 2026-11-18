import React from 'react';
import {
  AlertTriangle,
  Bell,
  Flame,
  Lock,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { MARKET_REGIME_SPECS } from '../data/catalog';
import {
  getEffectiveFacilityPowerCapKw,
  getFacility,
  getFacilityTotals,
} from '../engine/simulation';
import { CoinSymbol, GameState } from '../types/game';
import { formatUsd } from '../utils/format';

interface SideTelemetryPanelsProps {
  state: GameState;
  onRunCommand: (cmd: string) => void;
}

interface LiveAlertItem {
  id: string;
  severity: 'CRIT' | 'WARN' | 'INFO';
  tag: string;
  message: string;
  actionLabel?: string;
  actionCmd?: string;
}

function formatPctDelta(pct: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) {
    return { text: '0.0%', tone: 'flat' };
  }
  const sign = pct > 0 ? '+' : '';
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    tone: pct > 0 ? 'up' : 'down',
  };
}

export const SideTelemetryPanels: React.FC<SideTelemetryPanelsProps> = ({
  state,
  onRunCommand,
}) => {
  const coins = (Object.keys(state.coins) as CoinSymbol[]).map((sym) => state.coins[sym]);
  const regimeSpec = MARKET_REGIME_SPECS[state.marketRegime];
  const facility = getFacility(state.facilityId);
  const totals = getFacilityTotals(state);
  const effectiveCap = getEffectiveFacilityPowerCapKw(state);

  const liveAlerts: LiveAlertItem[] = [];

  if (state.pendingEvent) {
    liveAlerts.push({
      id: `alert_evt_${state.pendingEvent.id}`,
      severity: 'CRIT',
      tag: 'EVENT',
      message: `${state.pendingEvent.title} — awaiting decision (1 / 2 / 3).`,
      actionLabel: 'Inspect',
      actionCmd: 'event',
    });
  }

  if (totals.totalPowerKw > effectiveCap) {
    liveAlerts.push({
      id: 'alert_breaker_overload',
      severity: 'CRIT',
      tag: 'BREAKER',
      message: `Power overload: ${totals.totalPowerKw.toFixed(2)} kW exceeds ${effectiveCap} kW cap. Rigs halted.`,
      actionLabel: 'Power',
      actionCmd: 'power',
    });
  }

  const failedRigs = state.rigs.filter((r) => r.status === 'FAILED' || r.status === 'NEEDS_REPAIR');
  if (failedRigs.length > 0) {
    liveAlerts.push({
      id: 'alert_failed_rigs',
      severity: 'CRIT',
      tag: 'FAULT',
      message: `${failedRigs.length} rig${failedRigs.length > 1 ? 's' : ''} offline/damaged (${failedRigs
        .slice(0, 2)
        .map((r) => r.name)
        .join(', ')}).`,
      actionLabel: 'Repair All',
      actionCmd: 'repair all',
    });
  }

  const overheatedRigs = state.rigs.filter((r) => r.enabled && r.status === 'OVERHEATED');
  const throttledRigs = state.rigs.filter((r) => r.enabled && r.status === 'THROTTLED');
  if (overheatedRigs.length > 0) {
    liveAlerts.push({
      id: 'alert_overheat',
      severity: 'CRIT',
      tag: 'THERMAL',
      message: `${overheatedRigs.length} rig${overheatedRigs.length > 1 ? 's' : ''} shut down at >=96°C.`,
      actionLabel: 'Cooling',
      actionCmd: 'cool',
    });
  } else if (throttledRigs.length > 0) {
    liveAlerts.push({
      id: 'alert_throttled',
      severity: 'WARN',
      tag: 'THERMAL',
      message: `${throttledRigs.length} rig${throttledRigs.length > 1 ? 's' : ''} thermally throttled (>=82°C).`,
      actionLabel: 'Cooling',
      actionCmd: 'cool',
    });
  }

  const underpoweredRigs = state.rigs.filter(
    (r) => r.enabled && r.status === 'UNDERPOWERED' && totals.totalPowerKw <= effectiveCap
  );
  if (underpoweredRigs.length > 0) {
    liveAlerts.push({
      id: 'alert_psu',
      severity: 'CRIT',
      tag: 'PSU',
      message: `${underpoweredRigs.length} rig PSU overloaded. Upgrade PSU via tinker.`,
      actionLabel: 'Rigs',
      actionCmd: 'rigs',
    });
  }

  if (totals.maxNoiseDba > facility.noiseLimitDba) {
    liveAlerts.push({
      id: 'alert_noise',
      severity: 'WARN',
      tag: 'NOISE',
      message: `Noise ${totals.maxNoiseDba} dBA exceeds ${facility.noiseLimitDba} dBA limit (fines every 5 steps).`,
      actionLabel: 'Facilities',
      actionCmd: 'facilities',
    });
  }

  if (state.cash < 0) {
    liveAlerts.push({
      id: 'alert_cash',
      severity: 'CRIT',
      tag: 'CASH',
      message: `Negative balance (${formatUsd(state.cash)}). Pause upgrades or sell idle gear.`,
      actionLabel: 'Ledger',
      actionCmd: 'ledger',
    });
  }

  if (state.regulatoryScrutiny >= 55) {
    liveAlerts.push({
      id: 'alert_heat',
      severity: 'WARN',
      tag: 'SCRUTINY',
      message: `Regulatory heat at ${Math.round(state.regulatoryScrutiny)}/100 — raid probability elevated.`,
      actionLabel: 'Ops',
      actionCmd: 'ops',
    });
  }

  if (state.activeContract && state.activeContract.stepsRemaining <= 3) {
    liveAlerts.push({
      id: 'alert_contract_due',
      severity: 'WARN',
      tag: 'CONTRACT',
      message: `${state.activeContract.title}: ${state.activeContract.stepsRemaining} step(s) remaining!`,
      actionLabel: 'Contracts',
      actionCmd: 'contracts',
    });
  }

  for (const mod of state.activeMarketModifiers ?? []) {
    liveAlerts.push({
      id: `alert_mod_${mod.id}`,
      severity: 'INFO',
      tag: 'ECON',
      message: `${mod.label} (${mod.stepsRemaining}st): ${mod.summary}`,
      actionLabel: 'Market',
      actionCmd: 'market',
    });
  }

  const recentAlertNews = state.news
    .filter((n) => n.category === 'ALERT' || n.category === 'UNDERGROUND')
    .slice(0, 8);

  const criticalCount = liveAlerts.filter((a) => a.severity === 'CRIT').length;
  const warnCount = liveAlerts.filter((a) => a.severity === 'WARN').length;

  return (
    <aside className="w-full lg:w-[375px] xl:w-[410px] shrink-0 flex flex-col gap-3 lg:h-[calc(100vh-158px)] lg:min-h-[540px]">
      {/* Panel 1: Crypto Market */}
      <section className="relative bg-[#030A05]/84 backdrop-blur-[2px] border border-green-500/35 rounded-xl overflow-hidden shadow-[0_0_35px_rgba(34,197,94,0.1)] flex flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 matrix-scanlines opacity-75"
        />

        <div className="relative z-10 px-4 py-2.5 bg-[#041108]/92 border-b border-green-500/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <h2 className="font-mono text-xs font-bold tracking-wider text-green-300 matrix-glow whitespace-nowrap">
              CRYPTO MARKET
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-green-400/80 truncate">
              {regimeSpec.label}
            </span>
            <button
              type="button"
              onClick={() => onRunCommand('market')}
              className="px-2 py-0.5 rounded bg-[#020804] hover:bg-green-950 border border-green-500/30 font-mono text-[10px] text-green-300 transition-colors whitespace-nowrap"
            >
              market
            </button>
          </div>
        </div>

        <div className="relative z-10 p-3 overflow-x-auto">
          <table className="w-full font-mono text-[11px] border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-green-400/65 border-b border-green-500/20">
                <th className="text-left font-medium pb-1.5 pr-2">Coin</th>
                <th className="text-right font-medium pb-1.5 px-1.5">Price</th>
                <th className="text-right font-medium pb-1.5 px-1.5">1-Step</th>
                <th className="text-right font-medium pb-1.5 pl-1.5">7-Step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-500/10">
              {coins.map((coin) => {
                const stepPct =
                  coin.prevPriceUsd > 0
                    ? ((coin.priceUsd - coin.prevPriceUsd) / coin.prevPriceUsd) * 100
                    : 0;
                const hist = coin.priceHistory ?? [];
                const ref7Price =
                  hist.length > 0
                    ? hist[Math.max(0, hist.length - 8)].price
                    : coin.basePriceUsd;
                const sevenStepPct =
                  ref7Price > 0 ? ((coin.priceUsd - ref7Price) / ref7Price) * 100 : 0;

                const d1 = formatPctDelta(stepPct);
                const d7 = formatPctDelta(sevenStepPct);

                return (
                  <tr
                    key={coin.symbol}
                    onClick={() =>
                      onRunCommand(coin.unlocked ? `chart ${coin.symbol}` : 'market')
                    }
                    title={
                      coin.unlocked
                        ? `Click to view ${coin.name} (${coin.symbol}) chart`
                        : `${coin.name} (${coin.symbol}) locked — click for market info`
                    }
                    className={`cursor-pointer transition-colors hover:bg-green-500/10 ${
                      coin.unlocked ? 'text-green-100' : 'text-green-200/45'
                    }`}
                  >
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: coin.color }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 font-semibold leading-tight">
                            <span className="truncate">{coin.name}</span>
                            {!coin.unlocked && (
                              <Lock className="w-2.5 h-2.5 text-green-500/50 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] text-green-400/75 leading-tight">
                            {coin.symbol}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-2 px-1.5 text-right tabular-nums font-semibold whitespace-nowrap">
                      {formatUsd(coin.priceUsd)}
                    </td>

                    <td
                      className={`py-2 px-1.5 text-right tabular-nums whitespace-nowrap font-medium ${
                        d1.tone === 'up'
                          ? 'text-emerald-300'
                          : d1.tone === 'down'
                          ? 'text-rose-400'
                          : 'text-green-500/60'
                      }`}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {d1.tone === 'up' && <TrendingUp className="w-2.5 h-2.5" />}
                        {d1.tone === 'down' && <TrendingDown className="w-2.5 h-2.5" />}
                        <span>{d1.text}</span>
                      </span>
                    </td>

                    <td
                      className={`py-2 pl-1.5 text-right tabular-nums whitespace-nowrap font-medium ${
                        d7.tone === 'up'
                          ? 'text-emerald-300'
                          : d7.tone === 'down'
                          ? 'text-rose-400'
                          : 'text-green-500/60'
                      }`}
                    >
                      {d7.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Panel 2: System Alerts */}
      <section className="relative bg-[#030A05]/84 backdrop-blur-[2px] border border-green-500/35 rounded-xl overflow-hidden shadow-[0_0_35px_rgba(34,197,94,0.1)] flex-1 min-h-[220px] flex flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 matrix-scanlines opacity-75"
        />

        <div className="relative z-10 px-4 py-2.5 bg-[#041108]/92 border-b border-green-500/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {criticalCount > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : warnCount > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-green-400 shrink-0" />
            )}
            <h2 className="font-mono text-xs font-bold tracking-wider text-green-300 matrix-glow">
              ALERTS
            </h2>
          </div>

          <span
            className={`font-mono text-[10px] font-semibold tabular-nums ${
              criticalCount > 0
                ? 'text-rose-400'
                : warnCount > 0
                ? 'text-amber-300'
                : 'text-emerald-300'
            }`}
          >
            {criticalCount + warnCount > 0
              ? `${criticalCount + warnCount} ACTIVE`
              : 'ALL NOMINAL'}
          </span>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
          {liveAlerts.length === 0 ? (
            <div className="px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300/90 text-[11px] flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>All rigs, power buses, and thermal envelopes nominal.</span>
            </div>
          ) : (
            liveAlerts.map((alert) => {
              const cls =
                alert.severity === 'CRIT'
                  ? 'bg-rose-500/12 border-rose-500/40 text-rose-200'
                  : alert.severity === 'WARN'
                  ? 'bg-amber-500/12 border-amber-500/35 text-amber-200'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200';
              const tagCls =
                alert.severity === 'CRIT'
                  ? 'text-rose-400'
                  : alert.severity === 'WARN'
                  ? 'text-amber-300'
                  : 'text-cyan-300';

              return (
                <div key={alert.id} className={`px-3 py-2 rounded-lg border space-y-1 ${cls}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-bold text-[10px] tracking-wider inline-flex items-center gap-1 ${tagCls}`}>
                      {alert.tag === 'THERMAL' && <Flame className="w-3 h-3" />}
                      {alert.tag}
                    </span>
                    {alert.actionCmd && alert.actionLabel && (
                      <button
                        type="button"
                        onClick={() => onRunCommand(alert.actionCmd!)}
                        className="px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/70 border border-current/30 text-[10px] font-semibold transition-colors whitespace-nowrap"
                      >
                        {alert.actionLabel}
                      </button>
                    )}
                  </div>
                  <p className="leading-snug text-[11px] opacity-95">{alert.message}</p>
                </div>
              );
            })
          )}

          {recentAlertNews.length > 0 && (
            <div className="pt-2 border-t border-green-500/20 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-green-400/60">
                <span>Recent Alert Feed</span>
                <button
                  type="button"
                  onClick={() => onRunCommand('log')}
                  className="hover:text-green-300 transition-colors"
                >
                  log
                </button>
              </div>
              {recentAlertNews.map((item) => (
                <div
                  key={item.id}
                  className="px-2.5 py-1.5 rounded bg-[#020704]/90 border border-green-500/15 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span
                      className={
                        item.category === 'ALERT'
                          ? 'text-rose-400 font-semibold truncate'
                          : 'text-amber-300 font-semibold truncate'
                      }
                    >
                      {item.title}
                    </span>
                    <span className="text-green-500/70 shrink-0 tabular-nums">
                      {item.stepLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-green-200/75 leading-snug">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
};
