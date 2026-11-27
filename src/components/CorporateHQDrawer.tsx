import React, { useEffect, useState } from 'react';
import { Briefcase, Building2, Check, Layers, RefreshCw, X } from 'lucide-react';
import { getBusinessTutorialTopicId } from '../data/onboarding';
import {
  getDivisionUpgradeCost,
  MAX_DIVISION_LEVEL,
} from '../engine/businesses';
import {
  getCorporateSynergyEffects,
  getHQLevelSpec,
  HQ_ESTABLISH_COST_USD,
  isSynergyPrerequisitesMet,
  MAX_HQ_LEVEL,
  SYNERGY_ORDER,
  SYNERGY_POLICIES,
} from '../engine/corporate';
import {
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  BUSINESS_CATALOG,
  BUSINESS_ORDER,
  getOwnedBusinessIds,
  isBusinessActive,
} from '../engine/simulation';
import { BusinessId, GameState } from '../types/game';
import { formatUsd } from '../utils/format';

type DrawerTab = 'OVERVIEW' | 'ACQUIRE' | 'SYNERGIES';

interface CorporateHQDrawerProps {
  state: GameState;
  onClose: () => void;
  onRunCommand: (cmd: string) => void;
  onEstablishHQ: (name?: string) => { ok: boolean; summary: string };
  onUpgradeHQ: () => { ok: boolean; summary: string };
  onRenameHQ: (name: string) => { ok: boolean; summary: string };
  onToggleSynergy: (policyId: string) => { ok: boolean; summary: string };
  onUpgradeDivision: (businessId: string) => { ok: boolean; summary: string };
  onFundTurnaround: (businessId: string) => { ok: boolean; summary: string };
  onInspectTarget: (targetId: string) => { ok: boolean; summary: string };
  onAcquireTarget: (targetId: string) => { ok: boolean; summary: string };
  onRefreshTargets: () => { ok: boolean; summary: string };
  onMarkBusinessTutorialSeen: (businessId: BusinessId) => void;
}

const DIVISION_COMMAND: Record<BusinessId, string> = {
  MINING: 'rigs',
  MARKET_INTEL: 'intel',
  HARDWARE_ENG: 'eng',
  MANUFACTURING: 'mfg',
  MINING_SERVICES: 'services',
  UNDERGROUND: 'ug',
};

export const CorporateHQDrawer: React.FC<CorporateHQDrawerProps> = ({
  state,
  onClose,
  onRunCommand,
  onEstablishHQ,
  onUpgradeHQ,
  onRenameHQ,
  onToggleSynergy,
  onUpgradeDivision,
  onFundTurnaround,
  onInspectTarget,
  onAcquireTarget,
  onRefreshTargets,
  onMarkBusinessTutorialSeen,
}) => {
  const [tab, setTab] = useState<DrawerTab>('OVERVIEW');
  const [editingName, setEditingName] = useState(false);
  const [hqNameDraft, setHqNameDraft] = useState(
    state.conglomerate?.hq?.companyName ?? 'Hashrate Holdings'
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const cong = buildDefaultConglomerate(state, state.conglomerate);
  const hq = cong.hq;
  const ownedIds = getOwnedBusinessIds({ conglomerate: cong });
  const allSixOwned = areAllSixBusinessesOwned({ conglomerate: cong });
  const allSixActive = BUSINESS_ORDER.every((id) => isBusinessActive({ conglomerate: cong }, id));
  const effects = getCorporateSynergyEffects({ conglomerate: cong });
  const curHqSpec = hq.established ? getHQLevelSpec(hq.hqLevel) : null;
  const nextHqSpec =
    hq.established && hq.hqLevel < MAX_HQ_LEVEL ? getHQLevelSpec(hq.hqLevel + 1) : null;

  const unseenAcquiredDivisions = ownedIds.filter(
    (id) => id !== 'MINING' && !cong.businessTutorialsSeen.includes(id)
  );
  const nextOrientationBizId = unseenAcquiredDivisions[0] ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const applyAction = (res: { ok: boolean; summary: string }) => {
    setFeedback({ ok: res.ok, text: res.summary });
  };

  let totalRev = 0;
  let totalExp = 0;
  let totalInternal = 0;
  for (const id of BUSINESS_ORDER) {
    const l = cong.businesses[id].ledger;
    totalRev += l.totalRevenueUsd;
    totalExp += l.totalExpenseUsd;
    totalInternal += l.totalInternalCreditsUsd;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Corporate Headquarters Drawer"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-[490px] h-full bg-[#030A05] border-l border-green-500/35 flex flex-col overflow-hidden text-green-50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-green-500/25 bg-[#041108] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-display font-semibold text-green-50 truncate">
              {hq.established ? hq.companyName : 'Corporate Expansion'}
            </h2>
            <p className="text-xs font-mono tabular-nums text-green-300/75 mt-0.5 truncate">
              {ownedIds.length}/6 Divisions
              {' · '}
              {hq.established ? `HQ Level ${hq.hqLevel}/${MAX_HQ_LEVEL}` : 'HQ Unincorporated'}
              {' · '}
              Gen-7 {allSixOwned ? 'Unlocked' : 'Locked'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Corporate HQ Drawer"
            className="p-2 rounded-lg bg-[#071A0C] hover:bg-green-950 border border-green-500/30 text-green-200 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="px-5 py-3 border-b border-green-500/20 bg-[#020804] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#041007] border border-green-500/20">
            <button
              type="button"
              onClick={() => setTab('OVERVIEW')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                tab === 'OVERVIEW'
                  ? 'bg-green-500/20 text-green-100 border border-green-500/40'
                  : 'text-green-300/70 hover:text-green-100'
              }`}
            >
              HQ &amp; Divisions
            </button>
            <button
              type="button"
              onClick={() => setTab('ACQUIRE')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                tab === 'ACQUIRE'
                  ? 'bg-green-500/20 text-green-100 border border-green-500/40'
                  : 'text-green-300/70 hover:text-green-100'
              }`}
            >
              M&amp;A Targets ({cong.acquisitions.availableTargets.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('SYNERGIES')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                tab === 'SYNERGIES'
                  ? 'bg-green-500/20 text-green-100 border border-green-500/40'
                  : 'text-green-300/70 hover:text-green-100'
              }`}
            >
              Synergies ({hq.activeSynergies.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onRunCommand('corp ledger')}
            className="px-3 py-1.5 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/25 text-xs font-mono text-green-200 transition-colors whitespace-nowrap shrink-0"
          >
            Full Ledger
          </button>
        </div>

        {/* Inline Action Feedback */}
        {feedback && (
          <div
            className={`mx-5 mt-3 px-3.5 py-2 rounded-lg border text-xs flex items-center justify-between gap-3 shrink-0 ${
              feedback.ok
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/35 text-rose-200'
            }`}
          >
            <span className="leading-snug">{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-medium opacity-80 hover:opacity-100 whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'OVERVIEW' && (
            <>
              {/* Post-Acquisition Division Orientation Notice */}
              {nextOrientationBizId && (
                <section className="p-4 rounded-lg bg-[#041108] border border-cyan-500/35 space-y-2.5">
                  <div className="text-xs font-semibold text-cyan-200">
                    New Division Orientation · {BUSINESS_CATALOG[nextOrientationBizId].name}
                  </div>
                  <p className="text-xs text-green-200/80 leading-relaxed">
                    {BUSINESS_CATALOG[nextOrientationBizId].summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const topicId = getBusinessTutorialTopicId(nextOrientationBizId);
                        onMarkBusinessTutorialSeen(nextOrientationBizId);
                        onRunCommand(`tutorial ${topicId}`);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-xs font-semibold text-cyan-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      Open Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkBusinessTutorialSeen(nextOrientationBizId)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#030A05] hover:bg-green-950 border border-green-500/25 text-xs font-medium text-green-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Mark Learned
                    </button>
                  </div>
                </section>
              )}

              {/* HQ Governance Section */}
              <section className="p-4 rounded-lg bg-[#020704] border border-green-500/25 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                      <Building2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span>
                        {hq.established && curHqSpec
                          ? `Level ${hq.hqLevel} · ${curHqSpec.title}`
                          : 'Holding Company Unincorporated'}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-green-300/75 mt-1">
                      {hq.established && curHqSpec
                        ? `+${curHqSpec.rpBonusPct + (allSixActive ? 10 : 0)}% RP · -${Math.round(
                            (1 - effects.fabNreMult) * 100
                          )}% Fab NRE · ${hq.activeSynergies.length}/${curHqSpec.maxSynergies} Synergies · Upkeep ${formatUsd(
                            curHqSpec.cycleUpkeepUsd
                          )}/cycle`
                        : `Own 2+ businesses and pay ${formatUsd(
                            HQ_ESTABLISH_COST_USD
                          )} to unlock Corporate HQ tiers and synergy policies.`}
                    </p>
                  </div>
                </div>

                {/* Consolidated P&L Summary */}
                <div className="pt-2 border-t border-green-500/15 grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                  <div>
                    <div className="text-[10px] text-green-400/65">Cash Revenue</div>
                    <div className="font-semibold text-emerald-300">{formatUsd(totalRev)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-green-400/65">Cash Expense</div>
                    <div className="font-semibold text-rose-300">{formatUsd(totalExp)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-green-400/65">Internal Credits</div>
                    <div className="font-semibold text-cyan-300">{formatUsd(totalInternal)}</div>
                  </div>
                </div>

                {/* HQ Controls */}
                <div className="pt-2 border-t border-green-500/15 flex flex-wrap items-center gap-2">
                  {!hq.established ? (
                    <button
                      type="button"
                      onClick={() => applyAction(onEstablishHQ())}
                      className="px-4 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-[#020804] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Incorporate HQ ({formatUsd(HQ_ESTABLISH_COST_USD)})
                    </button>
                  ) : (
                    <>
                      {nextHqSpec && (
                        <button
                          type="button"
                          onClick={() => applyAction(onUpgradeHQ())}
                          className="px-3.5 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/40 text-xs font-semibold text-green-200 transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums"
                        >
                          Upgrade Lv {nextHqSpec.level} ({formatUsd(nextHqSpec.upgradeCostUsd)})
                        </button>
                      )}
                      {editingName ? (
                        <form
                          className="flex items-center gap-1.5 flex-1 min-w-[180px]"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const res = onRenameHQ(hqNameDraft);
                            applyAction(res);
                            if (res.ok) setEditingName(false);
                          }}
                        >
                          <input
                            type="text"
                            value={hqNameDraft}
                            onChange={(e) => setHqNameDraft(e.target.value)}
                            maxLength={40}
                            aria-label="Corporate HQ Name"
                            className="flex-1 min-w-0 px-2.5 py-1 rounded bg-[#041007] border border-green-500/35 text-xs text-green-100 focus:outline-none focus:border-green-400"
                          />
                          <button
                            type="submit"
                            className="p-1.5 rounded bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-200"
                            aria-label="Save Name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setHqNameDraft(hq.companyName);
                            setEditingName(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/25 text-xs font-medium text-green-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          Rename
                        </button>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Six Corporate Divisions Table */}
              <section className="rounded-lg bg-[#020704] border border-green-500/25 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-green-500/20 bg-[#041108] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-green-100">
                    <Briefcase className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Corporate Divisions</span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-green-400/80">
                    {ownedIds.length}/6 Owned
                  </span>
                </div>

                <div className="divide-y divide-green-500/15">
                  {BUSINESS_ORDER.map((id) => {
                    const div = cong.businesses[id];
                    const meta = BUSINESS_CATALOG[id];
                    const owned = div.status === 'ACTIVE' || div.status === 'RECOVERING';
                    const netUsd = div.ledger.totalRevenueUsd - div.ledger.totalExpenseUsd;
                    const upgradeCost =
                      div.status === 'ACTIVE' && div.level < MAX_DIVISION_LEVEL
                        ? getDivisionUpgradeCost(id, div.level)
                        : 0;

                    return (
                      <div
                        key={id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-green-500/5 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-green-100 truncate">
                            {meta.code} · {meta.name}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-green-300/75 mt-0.5 truncate">
                            {div.status === 'ACTIVE' ? (
                              <span className="text-emerald-300">Active</span>
                            ) : div.status === 'RECOVERING' ? (
                              <span className="text-amber-300">
                                Recovering ({div.recoveryStepsRemaining}st)
                              </span>
                            ) : (
                              <span className="text-green-500/60">Unowned</span>
                            )}
                            {owned && (
                              <>
                                {' · '}Lv {div.level}
                                {' · '}Net {netUsd >= 0 ? '+' : ''}
                                {formatUsd(netUsd)}
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {div.status === 'RECOVERING' && (
                            <button
                              type="button"
                              onClick={() => applyAction(onFundTurnaround(id))}
                              className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-mono font-semibold text-amber-200 transition-colors whitespace-nowrap"
                            >
                              Turnaround ({formatUsd(div.turnaroundCostUsd ?? 0)})
                            </button>
                          )}
                          {upgradeCost > 0 && (
                            <button
                              type="button"
                              onClick={() => applyAction(onUpgradeDivision(id))}
                              className="px-2.5 py-1 rounded bg-green-500/15 hover:bg-green-500/25 border border-green-500/35 text-[11px] font-mono font-semibold text-green-200 transition-colors whitespace-nowrap"
                            >
                              Lv {div.level + 1} ({formatUsd(upgradeCost)})
                            </button>
                          )}
                          {owned ? (
                            <button
                              type="button"
                              onClick={() => onRunCommand(DIVISION_COMMAND[id])}
                              className="px-2.5 py-1 rounded bg-[#051409] hover:bg-green-950 border border-green-500/30 text-[11px] font-medium text-green-200 transition-colors whitespace-nowrap"
                            >
                              Manage
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setTab('ACQUIRE')}
                              className="px-2.5 py-1 rounded bg-[#030A05] hover:bg-green-950 border border-green-500/20 text-[11px] font-medium text-green-400/80 transition-colors whitespace-nowrap"
                            >
                              M&amp;A Board
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {tab === 'ACQUIRE' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-green-300/80">
                  {allSixOwned
                    ? 'All six industry businesses are consolidated under your corporate umbrella.'
                    : 'Distressed acquisition targets aligned with your operational history.'}
                </div>
                {!allSixOwned && (
                  <button
                    type="button"
                    onClick={() => applyAction(onRefreshTargets())}
                    className="px-3 py-1.5 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Board</span>
                  </button>
                )}
              </div>

              {allSixOwned ? (
                <div className="p-4 rounded-lg bg-[#041108] border border-cyan-500/35 text-xs text-cyan-100 space-y-2">
                  <div className="font-semibold">6/6 Industry Monopoly Achieved</div>
                  <p className="text-cyan-200/80 leading-relaxed">
                    Generation 7 Quantum &amp; Photonic R&amp;D is unlocked, and owning all six
                    ACTIVE divisions grants a +10% Apex RP Dividend.
                  </p>
                  <button
                    type="button"
                    onClick={() => onRunCommand('research')}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-xs font-semibold text-cyan-100 transition-colors"
                  >
                    Open R&amp;D Tree
                  </button>
                </div>
              ) : cong.acquisitions.availableTargets.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#020704] border border-green-500/20 text-xs text-green-300/80 space-y-2">
                  <p>
                    No distressed targets are currently listed. Reach Generation 5 or refresh the
                    M&amp;A board to solicit distressed sellers.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-[#020704] border border-green-500/25 divide-y divide-green-500/15">
                  {cong.acquisitions.availableTargets.map((target, idx) => {
                    const meta = BUSINESS_CATALOG[target.businessId];
                    const totalClosing = target.purchasePriceUsd + target.assumedDebtUsd;
                    return (
                      <div key={target.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-green-100">
                              #{idx + 1} · {target.companyName}
                            </div>
                            <div className="text-[11px] font-mono text-green-400/80 mt-0.5">
                              {meta.name} · {target.distressReason}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums text-xs font-semibold text-emerald-300 whitespace-nowrap">
                            {formatUsd(totalClosing)}
                          </div>
                        </div>

                        <div className="text-[11px] font-mono tabular-nums text-green-300/75">
                          Ask {formatUsd(target.purchasePriceUsd)} · Debt {formatUsd(target.assumedDebtUsd)}
                          {' · '}Recovery {target.recoverySteps}st (Turnaround{' '}
                          {formatUsd(target.turnaroundCostUsd)}) · Staff {target.existingStaffCount}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const res = onInspectTarget(target.businessId);
                              applyAction(res);
                              onRunCommand(`acquire inspect ${target.businessId.toLowerCase()}`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/30 text-xs font-medium text-green-200 transition-colors whitespace-nowrap"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => applyAction(onAcquireTarget(target.businessId))}
                            className="px-3.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-[#020804] text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            Acquire Division
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {tab === 'SYNERGIES' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between text-xs text-green-300/80">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  <span>
                    {hq.established && curHqSpec
                      ? `Slots Used: ${hq.activeSynergies.length}/${curHqSpec.maxSynergies} · Lifetime Value: ${formatUsd(
                          hq.totalSynergyValueUsd
                        )}`
                      : 'Incorporate Corporate HQ first to activate inter-division policies.'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-[#020704] border border-green-500/25 divide-y divide-green-500/15">
                {SYNERGY_ORDER.map((id) => {
                  const spec = SYNERGY_POLICIES[id];
                  const active = hq.activeSynergies.includes(id);
                  const prereq = isSynergyPrerequisitesMet({ conglomerate: cong }, id);

                  return (
                    <div key={id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-green-100">
                          {spec.code} · {spec.name}
                        </div>
                        <div className="text-[11px] text-green-300/75">{spec.summary}</div>
                        <div className="text-[11px] font-mono text-emerald-300/90 leading-snug">
                          {active || prereq.met ? spec.impactDetail : prereq.reason}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!active && !prereq.met}
                        onClick={() => applyAction(onToggleSynergy(id))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-emerald-500/20 hover:bg-rose-500/20 border-emerald-400/50 text-emerald-200 hover:text-rose-200 hover:border-rose-400/50'
                            : prereq.met
                            ? 'bg-green-500/15 hover:bg-green-500/25 border-green-500/40 text-green-200'
                            : 'bg-[#030A05] border-green-500/15 text-green-500/45 cursor-not-allowed'
                        }`}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
};
