import React from 'react';
import {
  X,
  Wrench,
  DollarSign,
  FlaskConical,
  SkipForward,
  Building2,
  Coins,
  Megaphone,
  ThermometerSnowflake,
  Unlock,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import { MARKET_REGIME_SPECS } from '../data/catalog';
import { CoinSymbol, GameState, MarketRegime } from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';

interface DevPanelProps {
  state: GameState;
  onClose: () => void;
  onToggleDevMode: (enabled: boolean) => void;
  onToggleDevUnlockAll: () => void;
  onAddCash: (amount: number) => void;
  onClearDebt: () => void;
  onAddRp: (amount: number) => void;
  onStepSteps: (steps: number) => void;
  onUnlockAllResearch: () => void;
  onOwnAllFacilities: () => void;
  onResetRigTemps: () => void;
  onUnlockAllCoins: () => void;
  onAdjustCoinPrice: (symbol: CoinSymbol, multiplier: number) => void;
  onMaxPR: () => void;
  onResetPRCooldowns: () => void;
  onDevTriggerEvent: (forceRaid?: boolean) => void;
  onDevSetRegime: (regime: MarketRegime) => void;
  onDevTriggerHalving: (symbol: CoinSymbol) => void;
  onDevSetHeat: (heat: number) => void;
  onDevRefreshBlackMarket: () => void;
}

export const DevPanel: React.FC<DevPanelProps> = ({
  state,
  onClose,
  onToggleDevMode,
  onToggleDevUnlockAll,
  onAddCash,
  onClearDebt,
  onAddRp,
  onStepSteps,
  onUnlockAllResearch,
  onOwnAllFacilities,
  onResetRigTemps,
  onUnlockAllCoins,
  onAdjustCoinPrice,
  onMaxPR,
  onResetPRCooldowns,
  onDevTriggerEvent,
  onDevSetRegime,
  onDevTriggerHalving,
  onDevSetHeat,
  onDevRefreshBlackMarket,
}) => {
  const coinSymbols = Object.keys(state.coins) as CoinSymbol[];
  const regimes = Object.keys(MARKET_REGIME_SPECS) as MarketRegime[];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#030B05] border border-green-500/40 rounded-xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(34,197,94,0.16)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-green-500/25 bg-[#041108] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <h2 className="text-base font-display font-semibold text-green-50">
                Developer Testing Console
              </h2>
              <p className="text-xs text-green-300/70">
                Seed {state.runSeed} ·{' '}
                <span className="font-mono tabular-nums text-green-100">
                  {formatStepLabel(state.stepCount)}
                </span>{' '}
                · Cash:{' '}
                <span className="font-mono tabular-nums text-green-400">
                  {formatUsd(state.cash)}
                </span>{' '}
                · Heat:{' '}
                <span className="font-mono tabular-nums text-amber-300">
                  {Math.round(state.regulatoryScrutiny)}/100
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onToggleDevMode(false);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-[#071A0C] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-200 transition-colors"
            >
              Disable Dev Mode
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Developer Console"
              className="p-2 rounded-lg bg-[#071A0C] hover:bg-green-950 border border-green-500/30 text-green-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                  <Unlock className="w-4 h-4 text-green-400" />
                  <span>Catalog &amp; Gate Overrides</span>
                </div>
                <span
                  className={`text-[11px] font-mono font-semibold ${
                    state.devUnlockAll ? 'text-green-400' : 'text-green-800'
                  }`}
                >
                  {state.devUnlockAll ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
              <p className="text-xs text-green-200/70 leading-relaxed">
                Bypass R&amp;D prerequisites and facility tier gates for hardware parts, room cooling units, and staff hiring.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onToggleDevUnlockAll}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    state.devUnlockAll
                      ? 'bg-green-500 text-[#020804] hover:bg-green-400'
                      : 'bg-[#06180B] text-green-200 hover:bg-green-950 border border-green-500/30'
                  }`}
                >
                  {state.devUnlockAll ? 'All Catalog Unlocked (Click to Lock)' : 'Unlock All Catalog Items'}
                </button>
                <button
                  type="button"
                  onClick={onUnlockAllResearch}
                  className="px-3 py-2 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/35 text-xs font-semibold text-green-300 transition-colors inline-flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Complete All R&amp;D</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span>Capital &amp; Research Points</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onAddCash(10_000)}
                  className="px-3 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/35 text-xs font-mono font-semibold text-green-300 transition-colors"
                >
                  +$10k
                </button>
                <button
                  type="button"
                  onClick={() => onAddCash(100_000)}
                  className="px-3 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/35 text-xs font-mono font-semibold text-green-300 transition-colors"
                >
                  +$100k
                </button>
                <button
                  type="button"
                  onClick={() => onAddCash(10_000_000)}
                  className="px-3 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/35 text-xs font-mono font-semibold text-green-300 transition-colors"
                >
                  +$10M
                </button>
                <button
                  type="button"
                  onClick={onClearDebt}
                  className="px-3 py-1.5 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-200 transition-colors"
                >
                  Clear Debt
                </button>
                <button
                  type="button"
                  onClick={() => onAddRp(500)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-mono font-semibold text-emerald-300 transition-colors"
                >
                  +500 RP
                </button>
              </div>
            </div>
          </div>

          {/* Events, Regimes & Heat Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Events, Raids &amp; Underground Heat</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDevTriggerEvent(false);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-300 transition-colors"
                >
                  Trigger Random Event
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDevTriggerEvent(true);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-300 transition-colors"
                >
                  Trigger Inspector Raid
                </button>
                <button
                  type="button"
                  onClick={onDevRefreshBlackMarket}
                  className="px-3 py-1.5 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-200 transition-colors"
                >
                  Refresh Black Market
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-green-300/70">Set Heat:</span>
                {[0, 50, 85].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onDevSetHeat(h)}
                    className="px-2.5 py-1 rounded bg-[#030B05] hover:bg-green-950 border border-green-500/25 text-[11px] font-mono text-green-200"
                  >
                    {h}/100
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span>Market Regime Selector</span>
                </div>
                <span className="text-[11px] font-mono text-green-400">
                  {MARKET_REGIME_SPECS[state.marketRegime].label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {regimes.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onDevSetRegime(r)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                      state.marketRegime === r
                        ? 'bg-green-500 text-[#020804] border-green-400 font-bold'
                        : 'bg-[#030B05] text-green-200 border-green-500/25 hover:border-green-400/55'
                    }`}
                  >
                    {MARKET_REGIME_SPECS[r].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step Runner */}
          <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <SkipForward className="w-4 h-4 text-green-400" />
                <span>Batch Step Simulation</span>
              </div>
              <span className="text-xs font-mono tabular-nums text-green-400">
                Current: {formatStepLabel(state.stepCount)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[5, 15, 30, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onStepSteps(n)}
                  className="px-3 py-2 rounded-lg text-xs font-mono font-medium border bg-[#030B05] border-green-500/25 text-green-200 hover:border-green-400/60 hover:bg-green-950/60 transition-colors"
                >
                  +{n} Steps
                </button>
              ))}
            </div>
          </div>

          {/* Facilities, Rigs & PR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <Building2 className="w-4 h-4 text-green-400" />
                <span>Facilities &amp; Hardware Maintenance</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOwnAllFacilities}
                  className="px-3 py-2 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-100 transition-colors"
                >
                  Own All 6 Facilities
                </button>
                <button
                  type="button"
                  onClick={onResetRigTemps}
                  className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-medium text-emerald-200 transition-colors inline-flex items-center gap-1.5"
                >
                  <ThermometerSnowflake className="w-3.5 h-3.5" />
                  <span>Cool &amp; Repair All Rigs</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <Megaphone className="w-4 h-4 text-green-400" />
                <span>PR &amp; Regulatory Overrides</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onMaxPR}
                  className="px-3 py-2 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-100 transition-colors"
                >
                  100% Credibility / 0 Heat
                </button>
                <button
                  type="button"
                  onClick={onResetPRCooldowns}
                  className="px-3 py-2 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-100 transition-colors"
                >
                  Reset PR Cooldowns
                </button>
              </div>
            </div>
          </div>

          {/* Coin Tiers, Halving & Spot Rate Overrides */}
          <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                <Coins className="w-4 h-4 text-green-400" />
                <span>Coin Tiers, Halvings &amp; Spot Rate Overrides</span>
              </div>
              <button
                type="button"
                onClick={onUnlockAllCoins}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-300 transition-colors"
              >
                Unlock All 6 Coin Tiers
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {coinSymbols.map((sym) => {
                const c = state.coins[sym];
                return (
                  <div
                    key={sym}
                    className="p-3 rounded-lg bg-[#030B05] border border-green-500/20 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-green-50">{sym}</span>
                        <span className="text-[11px] text-green-300/70 ml-1.5">
                          T{c.tier} · {c.stepsUntilHalving}st
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          c.unlocked ? 'text-green-400' : 'text-amber-300/80'
                        }`}
                      >
                        {formatUsd(c.priceUsd)} {c.unlocked ? '' : '(Locked)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAdjustCoinPrice(sym, 1.5)}
                        className="flex-1 px-2 py-1 rounded bg-green-500/15 hover:bg-green-500/25 text-[11px] font-mono text-green-300 transition-colors"
                      >
                        +50%
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustCoinPrice(sym, 0.5)}
                        className="flex-1 px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-mono text-rose-300 transition-colors"
                      >
                        -50%
                      </button>
                      <button
                        type="button"
                        onClick={() => onDevTriggerHalving(sym)}
                        className="flex-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-[11px] font-mono text-amber-300 transition-colors"
                      >
                        Halve
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
