import {
  ACHIEVEMENTS,
  CHALLENGES,
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  MILESTONES,
  POWER_CONTRACTS,
  RESEARCH_NODES,
  ROOM_COOLING_UNITS,
} from '../../data/catalog';
import {
  computeCompanyValuation,
  computeFacilityCoolingSummary,
  computeValuationBreakdown,
  estimateFleetHashIndex,
  getEffectiveElectricityRate,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getFacility,
  getFacilityTotals,
  getFacilityUpgradeCost,
  getPlayerRivalComparison,
  getPowerContract,
} from '../../engine/simulation';
import {
  previewPowerContract,
  renderAsciiLineChart,
} from '../../engine/previews';
import { GameState, TransactionCategory } from '../../types/game';
import { formatStepLabel, formatUsd } from '../../utils/format';

function padR(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function padL(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

export function formatValuationReport(state: GameState): string {
  const val = computeValuationBreakdown(state);
  const rigRows = state.rigs.slice(0, 10).map((r, i) => {
    const cost = Math.max(1, r.purchasePriceUsd ?? 355);
    const roiPct = Math.round(((r.totalEarnedUsd - cost) / cost) * 100);
    return `    #${i + 1} ${padR(r.name, 22)} Cost:${padL(formatUsd(cost, cost >= 10_000), 9)} Earned:${padL(
      formatUsd(r.totalEarnedUsd, r.totalEarnedUsd >= 10_000),
      9
    )} Last:${padL(formatUsd(r.lastStepUsd, r.lastStepUsd >= 10_000), 8)}/st  ROI:${padL(`${roiPct >= 0 ? '+' : ''}${roiPct}%`, 6)}`;
  });

  return [
    `  ITEMIZED COMPANY VALUATION BREAKDOWN`,
    `    Cash & Liquid Treasury: ${padL(formatUsd(val.cashUsd), 12)}`,
    `    Coin Treasury & Shorts: ${padL(formatUsd(val.walletValueUsd), 12)} (${(state.shortPositions ?? []).length} shorts)`,
    `    Active Fleet Resale:    ${padL(formatUsd(val.activeFleetUsd), 12)} (${state.rigs.length} rigs)`,
    `    Backup Vault Assets:    ${padL(formatUsd(val.backupVaultUsd), 12)} (${(state.backupRigs ?? []).length} rigs)`,
    `    Facility Real Estate:   ${padL(formatUsd(val.facilityEquityUsd), 12)} (${state.ownedFacilityIds.length} owned)`,
    `    Expansion Wings Equity: ${padL(formatUsd(val.expansionWingsUsd), 12)} (${state.facilityExtraRooms ?? 0} wings)`,
    `    R&D Patent IP Value:    ${padL(formatUsd(val.researchIpUsd), 12)} (${state.unlockedResearch.length} techs)`,
    `    Custom ASIC Inventory:  ${padL(formatUsd(val.fabInventoryUsd), 12)} (${(state.fab?.inventory ?? []).reduce((s, i) => s + i.qty, 0)} chips)`,
    ...(val.conglomerateEquityUsd > 0
      ? [`    Subsidiaries & HQ:      ${padL(formatUsd(val.conglomerateEquityUsd), 12)} (Corporate equity)`]
      : []),
    `    ────────────────────────────────────────`,
    `    TOTAL ENTERPRISE VALUE: ${padL(formatUsd(val.totalUsd), 12)}`,
    ``,
    `  FLEET LIFETIME ROI (top ${Math.min(10, state.rigs.length)} rigs)`,
    ...(rigRows.length > 0 ? rigRows : ['    (No active rigs deployed)']),
  ].join('\n');
}

export function formatStatsReport(state: GameState): string {
  const valuation = computeCompanyValuation(state);
  const st = state.stats;
  const activeRigs = state.rigs.filter((r) => r.enabled).length;
  const netMiningProfit =
    st.totalRevenueUsd +
    st.totalContractIncomeUsd -
    st.totalElectricityCostUsd -
    st.totalMaintenanceCostUsd -
    st.totalPayrollCostUsd -
    st.totalFinesAndBribesUsd;

  return [
    `  FINANCIAL OVERVIEW`,
    `    Cash on Hand:      ${padL(formatUsd(state.cash), 12)}   Company Valuation:  ${formatUsd(valuation)}`,
    `    Total Mining Rev:  ${padL(formatUsd(st.totalRevenueUsd), 12)}   Contract Income:    ${formatUsd(st.totalContractIncomeUsd)}`,
    `    Power Bills Paid:  ${padL('-' + formatUsd(st.totalElectricityCostUsd), 12)}   Maintenance Spend:  -${formatUsd(st.totalMaintenanceCostUsd)}`,
    `    Payroll Paid:      ${padL('-' + formatUsd(st.totalPayrollCostUsd), 12)}   Fines & Bribes:     -${formatUsd(st.totalFinesAndBribesUsd)}`,
    `    Hardware Bought:   ${padL('-' + formatUsd(st.totalHardwareSpendUsd), 12)}   Hardware Sold:      +${formatUsd(st.totalHardwareSalesUsd)}`,
    `    Facility & Cool:   ${padL('-' + formatUsd(st.totalFacilitySpendUsd + st.totalCoolingSpendUsd), 12)}   R&D Spend:          -${formatUsd(st.totalResearchSpendUsd)}`,
    `    Net Operating P&L: ${padL(formatUsd(netMiningProfit), 12)}`,
    ``,
    `  OPERATIONS & RELIABILITY`,
    `    Steps Simulated:   ${padL(String(state.stepCount), 8)} (${formatStepLabel(state.stepCount)})`,
    `    Active / Vault:    ${padL(`${activeRigs}/${state.rigs.length} active`, 14)}  ${(state.backupRigs ?? []).length} in backup vault`,
    `    Rigs Acquired:     ${padL(String(st.rigPurchasesCount), 8)} (${st.usedRigPurchasesCount} used/refurbished)`,
    `    Peak Hash Score:   ${padL(String(Math.round(st.peakFleetHashScore)), 8)}   Peak Grid Load:     ${st.maxPowerKwObserved.toFixed(2)} kW`,
    `    Hardware Failures: ${padL(String(st.equipmentFailuresCount), 8)}   Repairs Completed:  ${st.repairsCompleted}`,
    `    Solo Blocks Won:   ${padL(String(st.soloBlocksHit), 8)}   Contracts Won/Fail: ${st.contractsCompleted}/${st.contractsFailed}`,
    `    R&D Unlocked:      ${padL(`${state.unlockedResearch.length}/${RESEARCH_NODES.length}`, 8)}   Milestones / Ach:   ${(state.unlockedMilestones ?? []).length}/${MILESTONES.length} | ${(state.unlockedAchievements ?? []).length}/${ACHIEVEMENTS.length}`,
  ].join('\n');
}

export function formatTransactionHistory(
  state: GameState,
  filterCat: TransactionCategory | 'ALL' = 'ALL'
): string {
  const list = (state.transactions ?? []).filter(
    (tx) => filterCat === 'ALL' || tx.category === filterCat
  );
  if (list.length === 0) {
    return `  (No matching transactions${filterCat === 'ALL' ? '' : ` for ${filterCat}`}.)`;
  }
  const header = `  ${padR('WHEN', 16)} ${padR('TYPE', 10)} ${padL('AMOUNT', 12)}  DESCRIPTION`;
  const rows = list.slice(0, 24).map((tx) => {
    const amtStr =
      tx.amountUsd >= 0 ? `+${formatUsd(tx.amountUsd)}` : `-${formatUsd(Math.abs(tx.amountUsd))}`;
    return `  ${padR(tx.stepLabel, 16)} ${padR(tx.category, 10)} ${padL(amtStr, 12)}  ${tx.description}`;
  });
  return [header, '-'.repeat(header.length + 20), ...rows].join('\n');
}

export function formatPowerReport(state: GameState): string {
  const fac = getFacility(state.facilityId);
  const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
  const totals = getFacilityTotals(state);
  const capKw = getEffectiveFacilityPowerCapKw(state);
  const rate = getEffectiveElectricityRate(state);
  const contract = getPowerContract(state.powerContractId);

  const contractRows = POWER_CONTRACTS.map((c, idx) => {
    const active = c.id === state.powerContractId;
    const locked = !state.devUnlockAll && facIdx < c.unlockFacilityIndex;
    const gate = active
      ? '[ACTIVE]'
      : locked
      ? `[At ${FACILITY_TIERS[c.unlockFacilityIndex].name}]`
      : '[READY]';
    const prev = previewPowerContract(c.id, state);
    const deltaTxt =
      active || !prev
        ? 'current plan'
        : `${prev.netCycleDeltaUsd <= 0 ? 'saves ' : '+'}${formatUsd(
            Math.abs(prev.netCycleDeltaUsd)
          )}/cyc · Cap ${prev.capDeltaKw >= 0 ? '+' : ''}${prev.capDeltaKw}kW`;
    return `  ${idx + 1}. ${padR(c.name, 31)} Rate:${Math.round(c.rateMultiplier * 100)}% Cap:${Math.round(
      c.capacityMultiplier * 100
    )}% Fee:${padL(formatUsd(c.cycleFixedFee), 5)}/cyc  ${gate}\n     ${c.summary} (${deltaTxt})`;
  }).join('\n');

  const upgradeRows = FACILITY_UPGRADES.map((u, idx) => {
    const lvl = state.facilityUpgrades?.[u.id] ?? 0;
    const maxd = lvl >= u.maxLevel;
    const nextCost = maxd ? 0 : getFacilityUpgradeCost(u.id, lvl);
    const facOk = state.devUnlockAll || facIdx >= u.unlockFacilityIndex;
    const resOk =
      state.devUnlockAll || !u.researchRequired || state.unlockedResearch.includes(u.researchRequired);
    const status = maxd
      ? '[MAX]'
      : !facOk
      ? `[At ${FACILITY_TIERS[u.unlockFacilityIndex].name}]`
      : !resOk
      ? `[R&D: ${RESEARCH_NODES.find((r) => r.id === u.researchRequired)?.name ?? u.researchRequired}]`
      : `Next: ${formatUsd(nextCost)}`;
    return `  ${idx + 1}. ${padR(u.name, 31)} Lv ${lvl}/${u.maxLevel}  ${padR(status, 24)}  ${u.effectLabel}`;
  }).join('\n');

  return [
    `  ACTIVE GRID & CONTRACT SUMMARY (${fac.name})`,
    `    Current Draw / Cap: ${totals.totalPowerKw.toFixed(2)} / ${capKw} kW (${Math.round(
      (totals.totalPowerKw / Math.max(0.1, capKw)) * 100
    )}% load)`,
    `    Active Contract:    ${contract.name} ($${rate.toFixed(4)}/kWh effective · ${contract.brownoutProtectionPct}% surge shield)`,
    `    Step Power Cost:    ${formatUsd(totals.stepPowerCostUsd)}/step   Fixed Contract Fee: ${formatUsd(
      totals.cycleFixedContractFee
    )}/cycle`,
    `    Max Rig Slots:      ${totals.rigCount} / ${getEffectiveFacilityMaxRigs(state)} effective slots`,
    ``,
    `  POWER CONTRACTS ("power contract <1..4>")`,
    contractRows,
    ``,
    `  FACILITY INFRASTRUCTURE UPGRADES ("power upgrade <1..6>" or "facility upgrade <1..6>")`,
    upgradeRows,
  ].join('\n');
}

export function formatCoolingCompare(state: GameState): string {
  const fac = getFacility(state.facilityId);
  const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
  const enabledCount = state.rigs.filter((r) => r.enabled).length;
  const summary = computeFacilityCoolingSummary(
    state.coolingUnits ?? [],
    enabledCount,
    fac,
    state.facilityUpgrades
  );

  const header = `  #  ${padR('COOLING SYSTEM', 30)} ${padL('PRICE', 7)} ${padL('WATTS', 6)} ${padL(
    'COOL',
    6
  )} ${padL('RIGS', 5)} ${padL('UPKEEP', 7)} ${padL('$/°C', 7)}  ACCESS`;
  const rows = ROOM_COOLING_UNITS.map((u, idx) => {
    const facOk = state.devUnlockAll || facIdx >= u.unlockFacilityIndex;
    const resOk =
      state.devUnlockAll || !u.researchRequired || state.unlockedResearch.includes(u.researchRequired);
    const gate =
      facOk && resOk
        ? '[READY]'
        : !facOk
        ? `[${FACILITY_TIERS[u.unlockFacilityIndex].name}]`
        : `[R&D: ${RESEARCH_NODES.find((n) => n.id === u.researchRequired)?.name ?? 'Locked'}]`;
    const costPerC = (u.cost / u.coolingPowerC).toFixed(1);
    return `  ${idx + 1}. ${padR(u.name, 30)} ${padL(formatUsd(u.cost), 7)} ${padL(
      `${u.watts}W`,
      6
    )} ${padL(`-${u.coolingPowerC}°C`, 6)} ${padL(String(u.maxRigsSupported), 5)} ${padL(
      formatUsd(u.maintenancePerCycle),
      7
    )} ${padL(`$${costPerC}`, 7)}  ${gate}`;
  });

  return [
    `  Effective Facility Cooling: -${summary.effectiveCoolingPerRigC.toFixed(
      1
    )}°C/rig (Unit draw: ${summary.totalCoolingWatts}W · Passive bonus: +${summary.facilityCoolingBonusC}°C)`,
    ``,
    header,
    '-'.repeat(header.length + 18),
    ...rows,
  ].join('\n');
}

export function formatRivalsComparison(state: GameState): string {
  const rows = getPlayerRivalComparison(state, estimateFleetHashIndex(state));
  const header = `  RK ${padR('COMPANY', 25)} ${padR('FACILITY', 22)} ${padL(
    'HASH',
    8
  )} ${padL('SHARE', 7)} ${padL('QLT', 5)} ${padL('RIGS', 5)}  STRATEGY`;
  const body = rows.map(
    (entry, i) =>
      `  ${padR(`#${i + 1}`, 3)}${padR(entry.name, 25)} ${padR(entry.facilityName, 22)} ${padL(
        entry.hashPowerIndex.toLocaleString('en-US'),
        8
      )} ${padL(`${entry.marketSharePct.toFixed(1)}%`, 7)} ${padL(
        entry.hardwareQuality.toFixed(1),
        5
      )} ${padL(String(entry.rigCount), 5)}  ${entry.strategy}`
  );
  return [header, '-'.repeat(header.length + 14), ...body].join('\n');
}

export function formatMilestonesReport(state: GameState): string {
  const done = new Set(state.unlockedMilestones ?? []);
  return MILESTONES.map((m, i) => {
    const mark = done.has(m.id) ? '[DONE]' : '[OPEN]';
    return `  ${padL(String(i + 1), 2)}. ${mark} ${padR(m.title, 30)} +${formatUsd(
      m.rewardCash
    )} +${m.rewardRp}RP +${m.rewardReputation}Rep\n      ${m.description}`;
  }).join('\n');
}

export function formatAchievementsReport(state: GameState): string {
  const done = new Set(state.unlockedAchievements ?? []);
  return ACHIEVEMENTS.map((a, i) => {
    const mark = done.has(a.id) ? '[UNLOCKED]' : '[LOCKED]  ';
    return `  ${padL(String(i + 1), 2)}. ${mark} [${padR(a.category, 10)}] ${padR(
      a.title,
      26
    )} — ${a.description}`;
  }).join('\n');
}

export function formatChallengesReport(state: GameState): string {
  const done = new Set(state.completedChallenges ?? []);
  const failed = new Set(state.failedChallenges ?? []);
  return CHALLENGES.map((c, i) => {
    const status = done.has(c.id)
      ? '[COMPLETED]'
      : state.activeChallengeId === c.id
      ? '[ACTIVE]'
      : failed.has(c.id)
      ? '[FAILED - RETRYABLE]'
      : '[AVAILABLE]';
    return `  ${i + 1}. ${padR(c.title, 28)} ${padR(status, 20)} Reward: ${formatUsd(
      c.rewardCash
    )} + ${c.rewardRp} RP\n     ${c.description}`;
  }).join('\n');
}

export type PortfolioChartMetric = 'portfolio' | 'cash' | 'valuation' | 'profit' | 'hashrate' | 'power';

export function formatPortfolioChart(
  state: GameState,
  metric: PortfolioChartMetric = 'portfolio'
): string {
  const hist = state.performanceHistory ?? [];
  if (hist.length < 2) {
    return '  Not enough performance history yet. Run "step 3" to plot historical ASCII charts.';
  }
  const labels = hist.map((h) => h.stepLabel);

  if (metric === 'cash') {
    return [
      `  CASH RESERVE TREND (${hist.length} steps)`,
      renderAsciiLineChart(
        hist.map((h) => h.cash),
        labels,
        (v) => formatUsd(v, true)
      ),
    ].join('\n');
  }
  if (metric === 'valuation') {
    return [
      `  COMPANY VALUATION TREND (${hist.length} steps)`,
      renderAsciiLineChart(
        hist.map((h) => h.valuation),
        labels,
        (v) => formatUsd(v, true)
      ),
    ].join('\n');
  }
  if (metric === 'profit') {
    return [
      `  NET STEP PROFIT (MINING REV - POWER COST)`,
      renderAsciiLineChart(
        hist.map((h) => h.netPerStepUsd),
        labels,
        (v) => formatUsd(v, true)
      ),
    ].join('\n');
  }
  if (metric === 'hashrate') {
    return [
      `  FLEET HASH SCORE TREND (${hist.length} steps)`,
      renderAsciiLineChart(
        hist.map((h) => h.fleetHashScore),
        labels,
        (v) => `${Math.round(v)}`
      ),
    ].join('\n');
  }
  if (metric === 'power') {
    return [
      `  FACILITY POWER LOAD TREND (kW)`,
      renderAsciiLineChart(
        hist.map((h) => h.powerKw),
        labels,
        (v) => `${v.toFixed(1)}kW`
      ),
    ].join('\n');
  }

  return [
    `  1) NET OPERATING PROFIT PER STEP`,
    renderAsciiLineChart(
      hist.map((h) => h.netPerStepUsd),
      labels,
      (v) => formatUsd(v, true),
      6,
      40
    ),
    ``,
    `  2) COMPANY VALUATION`,
    renderAsciiLineChart(
      hist.map((h) => h.valuation),
      labels,
      (v) => formatUsd(v, true),
      6,
      40
    ),
    ``,
    `  Tip: Run "chart cash", "chart profit", "chart hashrate", "chart power", or "chart <COIN>".`,
  ].join('\n');
}

