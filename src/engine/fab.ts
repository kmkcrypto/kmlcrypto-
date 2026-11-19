import { FACILITY_TIERS, PSU_PARTS } from '../data/catalog';
import {
  ChipProcessNode,
  CustomAsicInventoryItem,
  CustomAsicSpec,
  CustomChipBlueprint,
  FabProductionOrder,
  FabState,
  GameState,
  MiningAlgorithm,
  NewsItem,
  TransactionEntry,
} from '../types/game';
import { formatHashrate, formatStepLabel, formatUsd } from '../utils/format';
import {
  computeAverageRigHealth,
  ensureRigComponentHealth,
  getGlobalHardwarePriceMult,
} from './usedMarket';

const LINE_COSTS = [18000, 36000, 68000];

const NODE_SPECS: Record<
  ChipProcessNode,
  {
    nreUsd: number;
    unitCostUsd: number;
    waferSteps: number;
    wholesaleMult: number;
    asicWatts: number;
    asicHeatC: number;
    compactWatts: number;
    compactHeatC: number;
  }
> = {
  '7nm': {
    nreUsd: 2200,
    unitCostUsd: 1850,
    waferSteps: 4,
    wholesaleMult: 1.46,
    asicWatts: 2950,
    asicHeatC: 64,
    compactWatts: 340,
    compactHeatC: 36,
  },
  '5nm': {
    nreUsd: 3800,
    unitCostUsd: 2950,
    waferSteps: 5,
    wholesaleMult: 1.48,
    asicWatts: 3350,
    asicHeatC: 66,
    compactWatts: 410,
    compactHeatC: 40,
  },
  '3nm': {
    nreUsd: 5800,
    unitCostUsd: 4600,
    waferSteps: 7,
    wholesaleMult: 1.5,
    asicWatts: 4300,
    asicHeatC: 68,
    compactWatts: 520,
    compactHeatC: 44,
  },
  '2nm': {
    nreUsd: 8500,
    unitCostUsd: 7100,
    waferSteps: 8,
    wholesaleMult: 1.54,
    asicWatts: 4950,
    asicHeatC: 70,
    compactWatts: 640,
    compactHeatC: 48,
  },
};

const BASE_ALGO_HASHRATES: Record<MiningAlgorithm, Record<ChipProcessNode, number>> = {
  SHA256: {
    '7nm': 125_000_000,
    '5nm': 215_000_000,
    '3nm': 485_000_000,
    '2nm': 740_000_000,
  },
  SCRYPT: {
    '7nm': 13_500,
    '5nm': 20_500,
    '3nm': 28_000,
    '2nm': 38_000,
  },
  RANDOMX: {
    '7nm': 0.072,
    '5nm': 0.098,
    '3nm': 0.132,
    '2nm': 0.172,
  },
  ETHASH: {
    '7nm': 260,
    '5nm': 420,
    '3nm': 640,
    '2nm': 920,
  },
  POST: {
    '7nm': 340,
    '5nm': 520,
    '3nm': 760,
    '2nm': 1100,
  },
};

export function buildDefaultFab(prev?: Partial<FabState>): FabState {
  return {
    linesCount:
      typeof prev?.linesCount === 'number' && Number.isFinite(prev.linesCount)
        ? Math.max(0, Math.min(3, Math.floor(prev.linesCount)))
        : 0,
    blueprints: Array.isArray(prev?.blueprints) ? prev.blueprints : [],
    productionQueue: Array.isArray(prev?.productionQueue) ? prev.productionQueue : [],
    inventory: Array.isArray(prev?.inventory) ? prev.inventory : [],
    totalUnitsManufactured:
      typeof prev?.totalUnitsManufactured === 'number' ? prev.totalUnitsManufactured : 0,
    totalExportRevenueUsd:
      typeof prev?.totalExportRevenueUsd === 'number' ? prev.totalExportRevenueUsd : 0,
  };
}

export function getFabLineCost(linesCount: number): number {
  return LINE_COSTS[Math.max(0, Math.min(LINE_COSTS.length - 1, linesCount))] ?? 68000;
}

export function getFabCycleUpkeep(linesCount: number): number {
  return Math.max(0, linesCount) * 1200;
}

export function getFabInventoryValueUsd(fab?: FabState): number {
  if (!fab || !Array.isArray(fab.inventory)) return 0;
  return fab.inventory.reduce((sum, item) => sum + item.wholesaleValueUsd * item.qty, 0);
}

export function isFabUnlocked(
  state: Pick<GameState, 'unlockedResearch' | 'facilityId' | 'devUnlockAll'>
): { ok: boolean; reason?: string } {
  if (state.devUnlockAll) return { ok: true };
  const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
  if (facIdx < 3) {
    return {
      ok: false,
      reason: 'Chip Foundry requires a Warehouse (tier 4) or larger facility.',
    };
  }
  if (!state.unlockedResearch.includes('res_wafer_lithography')) {
    return {
      ok: false,
      reason: 'Locked: requires R&D "Semiconductor Wafer Lithography".',
    };
  }
  return { ok: true };
}

export function buildFabLine(state: GameState): {
  ok: boolean;
  nextState: GameState;
  summary: string;
} {
  const gate = isFabUnlocked(state);
  if (!gate.ok) return { ok: false, nextState: state, summary: gate.reason ?? 'Foundry locked.' };

  const fab = buildDefaultFab(state.fab);
  if (fab.linesCount >= 3) {
    return {
      ok: false,
      nextState: state,
      summary: 'Maximum 3 semiconductor fabrication lines already online.',
    };
  }

  const cost = getFabLineCost(fab.linesCount);
  if (state.cash < cost) {
    return {
      ok: false,
      nextState: state,
      summary: `Fabrication Line #${fab.linesCount + 1} cleanroom CapEx costs ${formatUsd(cost)}.`,
    };
  }

  const nextLines = fab.linesCount + 1;
  const stepLabel = formatStepLabel(state.stepCount);
  const tx: TransactionEntry = {
    id: `tx_fab_line_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel,
    category: 'FAB',
    amountUsd: -cost,
    description: `Commissioned ASIC Fab Line #${nextLines}`,
  };
  const news: NewsItem = {
    id: `news_fab_line_${state.stepCount}_${nextLines}`,
    step: state.stepCount,
    stepLabel,
    title: `ASIC Foundry Line #${nextLines} Online`,
    detail: `Wafer throughput increased to ${nextLines}x/step (+${formatUsd(
      getFabCycleUpkeep(1)
    )}/cycle upkeep).`,
    category: 'FACILITY',
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - cost,
      fab: { ...fab, linesCount: nextLines },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + cost,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
      news: [news, ...state.news].slice(0, 60),
    },
    summary: `Commissioned Fab Line #${nextLines} for ${formatUsd(
      cost
    )} (${nextLines}x parallel wafer speed).`,
  };
}

export function designCustomChipBlueprint(
  state: GameState,
  name: string,
  algo: MiningAlgorithm,
  processNode: ChipProcessNode
): { ok: boolean; nextState: GameState; summary: string } {
  const gate = isFabUnlocked(state);
  if (!gate.ok) return { ok: false, nextState: state, summary: gate.reason ?? 'Foundry locked.' };

  const fab = buildDefaultFab(state.fab);
  if (fab.linesCount < 1) {
    return {
      ok: false,
      nextState: state,
      summary: 'Commission Fab Line #1 first ("fab line build").',
    };
  }
  if (
    processNode === '2nm' &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes('res_gen5_exascale')
  ) {
    return {
      ok: false,
      nextState: state,
      summary: '2nm GAAFET process requires R&D "Gen-5 2nm GAAFET & Two-Phase Cryo".',
    };
  }

  const cleanName = name.trim().slice(0, 28);
  if (!cleanName) {
    return { ok: false, nextState: state, summary: 'Provide a chip blueprint name.' };
  }
  if (fab.blueprints.some((b) => b.name.toLowerCase() === cleanName.toLowerCase())) {
    return { ok: false, nextState: state, summary: `Blueprint "${cleanName}" already exists.` };
  }

  const spec = NODE_SPECS[processNode];
  if (!spec) {
    return { ok: false, nextState: state, summary: 'Process node must be 7nm, 5nm, 3nm, or 2nm.' };
  }
  if (state.cash < spec.nreUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `${processNode} tape-out NRE fee costs ${formatUsd(spec.nreUsd)}.`,
    };
  }

  const maxResearcherSkill = (state.employees ?? [])
    .filter((e) => e.role === 'RESEARCHER')
    .reduce((m, e) => Math.max(m, e.skillLevel ?? 1), 1);
  const skillBonusMult = 1 + Math.max(0, maxResearcherSkill - 1) * 0.05;
  const yieldCut = state.unlockedResearch.includes('res_wafer_lithography') ? 0.94 : 1.0;

  const isPowerAsic = algo === 'SHA256' || algo === 'SCRYPT';
  const rawHash = BASE_ALGO_HASHRATES[algo][processNode] * skillBonusMult;
  const hashRate = algo === 'RANDOMX' ? Number(rawHash.toFixed(4)) : Math.round(rawHash);
  const watts = isPowerAsic ? spec.asicWatts : spec.compactWatts;
  const heatC = isPowerAsic ? spec.asicHeatC : spec.compactHeatC;
  const unitCostUsd = Math.round(spec.unitCostUsd * yieldCut);
  const wholesaleValueUsd = Math.round(spec.unitCostUsd * spec.wholesaleMult);

  const bp: CustomChipBlueprint = {
    id: `bp_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    algo,
    processNode,
    unitCostUsd,
    waferSteps: spec.waferSteps,
    hashRate,
    watts,
    heatC,
    wholesaleValueUsd,
    createdStep: state.stepCount,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_nre_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -spec.nreUsd,
    description: `Tape-out blueprint ${cleanName} (${processNode} ${algo})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - spec.nreUsd,
      fab: { ...fab, blueprints: [...fab.blueprints, bp] },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + spec.nreUsd,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Taped out "${cleanName}" (${processNode} ${algo} @ ${formatHashrate(
      hashRate,
      algo
    )}, ${watts}W) for ${formatUsd(spec.nreUsd)} NRE. Unit fab cost: ${formatUsd(
      unitCostUsd
    )}, Wholesale value: ${formatUsd(wholesaleValueUsd)}.`,
  };
}

export function queueFabProduction(
  state: GameState,
  blueprintIdx: number,
  qty: number
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  if (fab.linesCount < 1) {
    return {
      ok: false,
      nextState: state,
      summary: 'No active fab lines. Run "fab line build" first.',
    };
  }
  const bp = fab.blueprints[blueprintIdx];
  if (!bp) {
    return { ok: false, nextState: state, summary: `Blueprint #${blueprintIdx + 1} not found.` };
  }
  const cleanQty = Math.max(1, Math.min(20, Math.floor(qty)));
  const totalCost = bp.unitCostUsd * cleanQty;
  if (state.cash < totalCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Producing ${cleanQty}x ${bp.name} costs ${formatUsd(totalCost)}.`,
    };
  }

  const batchSteps = bp.waferSteps + Math.max(0, cleanQty - 1);
  const order: FabProductionOrder = {
    id: `ord_fab_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    blueprintId: bp.id,
    blueprintName: bp.name,
    qty: cleanQty,
    stepsRemaining: batchSteps,
    totalSteps: batchSteps,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_prod_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -totalCost,
    description: `Queued ${cleanQty}x custom ASIC "${bp.name}"`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - totalCost,
      fab: { ...fab, productionQueue: [...fab.productionQueue, order] },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + totalCost,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Queued ${cleanQty}x "${bp.name}" wafers for ${formatUsd(totalCost)} (~${Math.ceil(
      batchSteps / fab.linesCount
    )} steps at ${fab.linesCount}x line throughput).`,
  };
}

export function stepFabProduction(
  fabInput: FabState | undefined,
  nextStep: number,
  stepLabel: string
): { nextFab: FabState; news: NewsItem[] } {
  const fab = buildDefaultFab(fabInput);
  if (fab.linesCount <= 0 || fab.productionQueue.length === 0) {
    return { nextFab: fab, news: [] };
  }

  let budget = fab.linesCount;
  const remainingQueue: FabProductionOrder[] = [];
  const nextInventory: CustomAsicInventoryItem[] = fab.inventory.map((i) => ({ ...i }));
  let manufacturedAdd = 0;
  const news: NewsItem[] = [];

  for (const ord of fab.productionQueue) {
    if (budget <= 0) {
      remainingQueue.push(ord);
      continue;
    }
    const work = Math.min(ord.stepsRemaining, budget);
    budget -= work;
    const rem = ord.stepsRemaining - work;
    if (rem > 0) {
      remainingQueue.push({ ...ord, stepsRemaining: rem });
    } else {
      const bp = fab.blueprints.find((b) => b.id === ord.blueprintId);
      manufacturedAdd += ord.qty;
      if (bp) {
        const existing = nextInventory.find((i) => i.blueprintId === bp.id);
        if (existing) {
          existing.qty += ord.qty;
        } else {
          nextInventory.push({
            blueprintId: bp.id,
            name: bp.name,
            algo: bp.algo,
            processNode: bp.processNode,
            hashRate: bp.hashRate,
            watts: bp.watts,
            heatC: bp.heatC,
            wholesaleValueUsd: bp.wholesaleValueUsd,
            qty: ord.qty,
          });
        }
      }
      news.push({
        id: `news_fab_done_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Wafer Batch Complete: ${ord.qty}x ${ord.blueprintName}`,
        detail: 'Finished custom ASICs moved to foundry inventory ("fab" to deploy or wholesale).',
        category: 'MILESTONE',
      });
    }
  }

  return {
    nextFab: {
      ...fab,
      productionQueue: remainingQueue,
      inventory: nextInventory,
      totalUnitsManufactured: fab.totalUnitsManufactured + manufacturedAdd,
    },
    news,
  };
}

export function deployCustomAsicToRig(
  state: GameState,
  invIdx: number,
  rigIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const item = fab.inventory[invIdx];
  if (!item || item.qty <= 0) {
    return {
      ok: false,
      nextState: state,
      summary: `Foundry inventory unit #${invIdx + 1} not found.`,
    };
  }
  const rig = state.rigs[rigIdx];
  if (!rig) {
    return { ok: false, nextState: state, summary: `Rig #${rigIdx + 1} not found.` };
  }

  const spec: CustomAsicSpec = {
    blueprintId: item.blueprintId,
    name: item.name,
    algo: item.algo,
    processNode: item.processNode,
    hashRate: item.hashRate,
    watts: item.watts,
    heatC: item.heatC,
  };

  const nextInventory = fab.inventory
    .map((entry, i) => (i === invIdx ? { ...entry, qty: entry.qty - 1 } : entry))
    .filter((entry) => entry.qty > 0);

  const nextRigs = state.rigs.map((r, i) => {
    if (i !== rigIdx) return r;
    const compH = ensureRigComponentHealth(r);
    const nextComp = { ...compH, compute: 100 };
    const avgHealth = computeAverageRigHealth(nextComp);
    const minComp = Math.min(
      nextComp.chassis,
      nextComp.compute,
      ...nextComp.gpus,
      nextComp.storage,
      nextComp.psu,
      nextComp.cooling
    );
    const recoveredStatus =
      (r.status === 'FAILED' || r.status === 'NEEDS_REPAIR') && avgHealth > 20 && minComp > 20
        ? r.enabled
          ? 'MINING'
          : 'PAUSED'
        : r.status;
    return {
      ...r,
      customAsicSpec: spec,
      componentHealth: nextComp,
      healthPct: avgHealth,
      status: recoveredStatus,
    };
  });

  const psu = PSU_PARTS.find((p) => p.id === rig.psuId);
  const psuNote =
    psu && spec.watts + 80 > psu.maxWatts
      ? ` WARNING: ${spec.name} draws ${spec.watts}W—upgrade PSU (currently ${psu.maxWatts}W) via "tinker ${
          rigIdx + 1
        }" to avoid UNDERPOWERED!`
      : '';

  return {
    ok: true,
    nextState: {
      ...state,
      rigs: nextRigs,
      fab: { ...fab, inventory: nextInventory },
    },
    summary: `Installed custom ${item.processNode} chip "${item.name}" (${formatHashrate(
      item.hashRate,
      item.algo
    )} on ${item.algo}) into ${rig.name}.${psuNote}`,
  };
}

export function sellCustomAsicsWholesale(
  state: GameState,
  invIdx: number,
  qtyOrAll: number | 'ALL'
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const item = fab.inventory[invIdx];
  if (!item || item.qty <= 0) {
    return {
      ok: false,
      nextState: state,
      summary: `Foundry inventory unit #${invIdx + 1} not found.`,
    };
  }
  const sellQty =
    qtyOrAll === 'ALL' ? item.qty : Math.max(1, Math.min(item.qty, Math.floor(qtyOrAll)));
  const brokerBonus = state.unlockedResearch.includes('res_secondary_broker') ? 1.12 : 1.0;
  const marketMult = getGlobalHardwarePriceMult(state);
  const revenue = Math.round(item.wholesaleValueUsd * sellQty * brokerBonus * marketMult);

  const nextInventory = fab.inventory
    .map((entry, i) => (i === invIdx ? { ...entry, qty: entry.qty - sellQty } : entry))
    .filter((entry) => entry.qty > 0);

  const tx: TransactionEntry = {
    id: `tx_fab_sell_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: revenue,
    description: `Wholesale export ${sellQty}x "${item.name}" ASICs`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + revenue,
      fab: {
        ...fab,
        inventory: nextInventory,
        totalExportRevenueUsd: fab.totalExportRevenueUsd + revenue,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Exported ${sellQty}x "${item.name}" wholesale for +${formatUsd(revenue)}!`,
  };
}

export function formatFabStatusReport(state: GameState): string {
  const gate = isFabUnlocked(state);
  const fab = buildDefaultFab(state.fab);
  const nextLineCost = fab.linesCount < 3 ? formatUsd(getFabLineCost(fab.linesCount)) : 'MAX';

  if (!gate.ok) {
    return [
      `  SEMICONDUCTOR & PROPRIETARY ASIC FOUNDRY [LOCKED]`,
      `  Requirement: ${gate.reason}`,
      `  Expand to a Warehouse (or higher) and complete "Semiconductor Wafer Lithography" in R&D.`,
    ].join('\n');
  }

  const bpRows =
    fab.blueprints.length === 0
      ? ['  (No chip blueprints taped out yet)']
      : fab.blueprints.map(
          (bp, i) =>
            `  #${i + 1} ${bp.name.padEnd(22)} ${bp.processNode} ${bp.algo.padEnd(8)} ${formatHashrate(
              bp.hashRate,
              bp.algo
            ).padStart(12)}  ${String(bp.watts).padStart(5)}W  Unit:${formatUsd(
              bp.unitCostUsd
            )}  Export:${formatUsd(bp.wholesaleValueUsd)}`
        );

  const qRows =
    fab.productionQueue.length === 0
      ? ['  (Production queue idle)']
      : fab.productionQueue.map(
          (q, i) =>
            `  #${i + 1} ${q.qty}x ${q.blueprintName.padEnd(22)} [${q.totalSteps - q.stepsRemaining}/${
              q.totalSteps
            } wafer pts · ~${Math.ceil(q.stepsRemaining / Math.max(1, fab.linesCount))}st left]`
        );

  const invRows =
    fab.inventory.length === 0
      ? ['  (Inventory empty)']
      : fab.inventory.map(
          (it, i) =>
            `  #${i + 1} ${String(it.qty).padStart(2)}x ${it.name.padEnd(22)} ${it.processNode} ${it.algo.padEnd(
              8
            )} ${formatHashrate(it.hashRate, it.algo).padStart(12)}  Wholesale:${formatUsd(
              it.wholesaleValueUsd
            )}/ea`
        );

  return [
    `  PROPRIETARY ASIC FOUNDRY (Lines: ${fab.linesCount}/3 · Upkeep: ${formatUsd(
      getFabCycleUpkeep(fab.linesCount)
    )}/cycle · Manufactured: ${fab.totalUnitsManufactured} · Exports: ${formatUsd(
      fab.totalExportRevenueUsd
    )})`,
    `  Next Fab Line Cost: ${nextLineCost}`,
    ``,
    `  CHIP BLUEPRINTS ("fab design <name> <sha256|scrypt|randomx|ethash|post> <7nm|5nm|3nm|2nm>")`,
    ...bpRows,
    ``,
    `  ACTIVE WAFER QUEUE ("fab produce <bp#> <qty>")`,
    ...qRows,
    ``,
    `  FINISHED INVENTORY ("fab deploy <inv#> <rig#>" | "fab sell <inv#> <qty|all>")`,
    ...invRows,
    ``,
    `  COMMANDS:`,
    `    fab line build                               Commission cleanroom fab line (1..3)`,
    `    fab design <name> <algo> <7nm|5nm|3nm|2nm>   Tape out proprietary chip blueprint`,
    `    fab produce <bp#> <qty>                      Manufacture custom chip batch (1..20)`,
    `    fab deploy <inv#> <rig#>                     Install custom chip into an active rig`,
    `    fab sell <inv#> <qty|all>                    Export finished ASICs for wholesale profit`,
  ].join('\n');
}
