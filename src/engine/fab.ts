import { CHASSIS_PARTS, FACILITY_TIERS, PSU_PARTS, RESEARCH_NODES } from '../data/catalog';
import {
  ChipProcessNode,
  ChipQualityGrade,
  CustomAsicInventoryItem,
  CustomAsicSpec,
  CustomChipBlueprint,
  DesignProfile,
  FabProductionOrder,
  FabState,
  GameState,
  MiningAlgorithm,
  NewsItem,
  TransactionEntry,
} from '../types/game';
import { formatHashrate, formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';
import {
  computeAverageRigHealth,
  ensureRigComponentHealth,
  getGlobalHardwarePriceMult,
} from './usedMarket';

const LINE_COSTS = [18000, 36000, 68000];

/**
 * Blueprint design trade-offs. Every tape-out must pick where the silicon
 * spends its budget: raw hashrate, power efficiency, thermal density, or a
 * neutral reference design.
 */
export const DESIGN_PROFILE_SPECS: Record<
  DesignProfile,
  {
    label: string;
    hashMult: number;
    wattMult: number;
    heatMult: number;
    costMult: number;
    blurb: string;
  }
> = {
  PERF: {
    label: 'Performance',
    hashMult: 1.15,
    wattMult: 1.18,
    heatMult: 1.08,
    costMult: 1.08,
    blurb: '+15% hashrate, +18% power draw',
  },
  BALANCED: {
    label: 'Balanced',
    hashMult: 1,
    wattMult: 1,
    heatMult: 1,
    costMult: 1,
    blurb: 'Reference design, no trade-off',
  },
  EFF: {
    label: 'Efficiency',
    hashMult: 0.9,
    wattMult: 0.8,
    heatMult: 0.9,
    costMult: 1.15,
    blurb: '-20% power draw, -10% hashrate',
  },
  COMPACT: {
    label: 'Compact',
    hashMult: 0.95,
    wattMult: 0.85,
    heatMult: 0.7,
    costMult: 1.05,
    blurb: '-30% heat, -15% power, -5% hashrate',
  },
};

export function parseDesignProfile(raw?: string): DesignProfile | null {
  if (!raw) return 'BALANCED';
  switch (raw.trim().toUpperCase()) {
    case 'PERF':
    case 'PERFORMANCE':
    case 'HASH':
      return 'PERF';
    case 'BAL':
    case 'BALANCED':
    case 'STOCK':
      return 'BALANCED';
    case 'EFF':
    case 'EFFICIENCY':
    case 'ECO':
      return 'EFF';
    case 'COMPACT':
    case 'COOL':
    case 'QUIET':
      return 'COMPACT';
    default:
      return null;
  }
}

function qualityGradeFromRoll(roll: number): { grade: ChipQualityGrade; mult: number } {
  if (roll >= 0.85) return { grade: 'A', mult: 1.06 };
  if (roll >= 0.4) return { grade: 'B', mult: 1 };
  return { grade: 'C', mult: 0.94 };
}

/**
 * A foundry can only tape out a process node the wider hardware tree has
 * already reached: the fab follows research, it does not leapfrog it.
 */
const NODE_RESEARCH: Record<ChipProcessNode, string> = {
  '7nm': 'res_asic_tapeout',
  '5nm': 'res_gen3_silicon',
  '3nm': 'res_gen4_hyperhash',
  '2nm': 'res_gen5_exascale',
};

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
  processNode: ChipProcessNode,
  profile: DesignProfile = 'BALANCED'
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
  const nodeResearchId = NODE_RESEARCH[processNode];
  if (nodeResearchId && !state.devUnlockAll && !state.unlockedResearch.includes(nodeResearchId)) {
    const node = RESEARCH_NODES.find((n) => n.id === nodeResearchId);
    return {
      ok: false,
      nextState: state,
      summary: `${processNode} process requires R&D "${node?.name ?? nodeResearchId}".`,
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

  const profileSpec = DESIGN_PROFILE_SPECS[profile] ?? DESIGN_PROFILE_SPECS.BALANCED;
  // First-silicon quality: a seeded prototype roll decides how clean the
  // tape-out lands. Better researchers narrow the spread.
  const protoRoll = createSeededRng(
    `${state.runSeed}|proto|${cleanName}|${algo}|${processNode}|${profile}`
  )();
  const { grade: qualityGrade, mult: gradeMult } = qualityGradeFromRoll(protoRoll);
  const qualityMult = Number(
    (gradeMult * (0.94 + Math.min(1, Math.max(0, protoRoll)) * 0.06)).toFixed(4)
  );

  const isPowerAsic = algo === 'SHA256' || algo === 'SCRYPT';
  const rawHash =
    BASE_ALGO_HASHRATES[algo][processNode] * skillBonusMult * profileSpec.hashMult * qualityMult;
  const hashRate = algo === 'RANDOMX' ? Number(rawHash.toFixed(4)) : Math.round(rawHash);
  const baseWatts = isPowerAsic ? spec.asicWatts : spec.compactWatts;
  const watts = Math.round(baseWatts * profileSpec.wattMult);
  const heatC = Math.round((isPowerAsic ? spec.asicHeatC : spec.compactHeatC) * profileSpec.heatMult);
  const unitCostUsd = Math.round(spec.unitCostUsd * yieldCut * profileSpec.costMult);
  const wholesaleValueUsd = Math.round(
    spec.unitCostUsd * spec.wholesaleMult * profileSpec.costMult * qualityMult
  );

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
    designProfile: profile,
    qualityGrade,
    qualityMult,
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
    summary: `Taped out "${cleanName}" [${profileSpec.label} · Grade ${qualityGrade}] (${processNode} ${algo} @ ${formatHashrate(
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
  // Each wafer batch yields slightly differently; the roll is banked on the
  // order so the finished stack keeps its own measured specs.
  const qualityRoll = Number(
    (0.95 + createSeededRng(`${state.runSeed}|batch|${bp.id}|${state.stepCount}|${cleanQty}`)() * 0.1).toFixed(
      3
    )
  );
  const order: FabProductionOrder = {
    id: `ord_fab_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    blueprintId: bp.id,
    blueprintName: bp.name,
    qty: cleanQty,
    stepsRemaining: batchSteps,
    totalSteps: batchSteps,
    qualityRoll,
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
    )} steps at ${fab.linesCount}x line throughput). Projected yield: ${(
      qualityRoll * 100
    ).toFixed(1)}%.`,
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
        const roll = ord.qualityRoll ?? 1;
        const stackHash =
          bp.algo === 'RANDOMX'
            ? Number((bp.hashRate * roll).toFixed(4))
            : Math.round(bp.hashRate * roll);
        const existing = nextInventory.find(
          (i) => i.blueprintId === bp.id && Math.abs((i.qualityRoll ?? 1) - roll) < 1e-9
        );
        if (existing) {
          existing.qty += ord.qty;
        } else {
          nextInventory.push({
            blueprintId: bp.id,
            name: bp.name,
            algo: bp.algo,
            processNode: bp.processNode,
            hashRate: stackHash,
            watts: bp.watts,
            heatC: bp.heatC,
            wholesaleValueUsd: Math.round(bp.wholesaleValueUsd * roll),
            qty: ord.qty,
            qualityGrade: bp.qualityGrade,
            qualityRoll: roll,
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

  // A custom ASIC only produces hashrate inside an ASIC blade enclosure; without
  // this check it could be "installed" into a desktop tower and silently mine nothing.
  const chassis = CHASSIS_PARTS.find((c) => c.id === rig.chassisId);
  if (!chassis || chassis.maxAsics < 1) {
    return {
      ok: false,
      nextState: state,
      summary: `Rig #${rigIdx + 1} uses ${
        chassis?.name ?? 'an incompatible chassis'
      }, which cannot seat an ASIC blade. Rebuild it on a 42U ASIC shelf or better.`,
    };
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

/**
 * Pull an installed custom ASIC back into foundry inventory so it can be
 * re-deployed to a better rig or exported wholesale. Charged as a refurb fee.
 */
export function stripCustomAsicFromRig(
  state: GameState,
  rigIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const rig = state.rigs[rigIdx];
  if (!rig) return { ok: false, nextState: state, summary: `Rig #${rigIdx + 1} not found.` };
  const spec = rig.customAsicSpec;
  if (!spec) {
    return {
      ok: false,
      nextState: state,
      summary: `Rig #${rigIdx + 1} has no custom ASIC installed.`,
    };
  }

  const fab = buildDefaultFab(state.fab);
  const bp = fab.blueprints.find((b) => b.id === spec.blueprintId);
  const wholesaleValueUsd = bp?.wholesaleValueUsd ?? Math.round(spec.watts * 3);
  const refurbFee = Math.max(100, Math.round(wholesaleValueUsd * 0.02));
  if (state.cash < refurbFee) {
    return {
      ok: false,
      nextState: state,
      summary: `Extraction & refurbishment costs ${formatUsd(refurbFee)}.`,
    };
  }

  const nextInventory = fab.inventory.map((i) => ({ ...i }));
  const existing = nextInventory.find(
    (i) =>
      i.blueprintId === spec.blueprintId &&
      i.hashRate === spec.hashRate &&
      i.watts === spec.watts
  );
  if (existing) {
    existing.qty += 1;
  } else {
    nextInventory.push({
      blueprintId: spec.blueprintId,
      name: spec.name,
      algo: spec.algo,
      processNode: spec.processNode,
      hashRate: spec.hashRate,
      watts: spec.watts,
      heatC: spec.heatC,
      wholesaleValueUsd,
      qty: 1,
      qualityGrade: bp?.qualityGrade,
      qualityRoll: bp?.qualityMult,
    });
  }

  const tx: TransactionEntry = {
    id: `tx_fab_strip_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -refurbFee,
    description: `Extracted custom ASIC "${spec.name}" from ${rig.name}`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - refurbFee,
      rigs: state.rigs.map((r, i) => (i === rigIdx ? { ...r, customAsicSpec: undefined } : r)),
      fab: { ...fab, inventory: nextInventory },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + refurbFee,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Extracted "${spec.name}" from ${rig.name} for ${formatUsd(
      refurbFee
    )}. It is back in foundry inventory and can be redeployed or exported.`,
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
      : fab.blueprints.map((bp, i) => {
          const tag = `${DESIGN_PROFILE_SPECS[bp.designProfile ?? 'BALANCED'].label.slice(0, 4)}${
            bp.qualityGrade ? `-${bp.qualityGrade}` : ''
          }`;
          return `  #${i + 1} ${bp.name.padEnd(22)} ${bp.processNode} ${bp.algo.padEnd(8)} ${formatHashrate(
            bp.hashRate,
            bp.algo
          ).padStart(12)}  ${String(bp.watts).padStart(5)}W  ${tag.padEnd(8)} Unit:${formatUsd(
            bp.unitCostUsd
          )}  Export:${formatUsd(bp.wholesaleValueUsd)}`;
        });

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
      : fab.inventory.map((it, i) => {
          const yieldTag = `${((it.qualityRoll ?? 1) * 100).toFixed(1)}%${
            it.qualityGrade ? ` ${it.qualityGrade}` : ''
          }`;
          return `  #${i + 1} ${String(it.qty).padStart(2)}x ${it.name.padEnd(22)} ${it.processNode} ${it.algo.padEnd(
            8
          )} ${formatHashrate(it.hashRate, it.algo).padStart(12)}  ${yieldTag.padEnd(9)} Wholesale:${formatUsd(
            it.wholesaleValueUsd
          )}/ea`;
        });

  return [
    `  PROPRIETARY ASIC FOUNDRY (Lines: ${fab.linesCount}/3 · Upkeep: ${formatUsd(
      getFabCycleUpkeep(fab.linesCount)
    )}/cycle · Manufactured: ${fab.totalUnitsManufactured} · Exports: ${formatUsd(
      fab.totalExportRevenueUsd
    )})`,
    `  Next Fab Line Cost: ${nextLineCost}`,
    ``,
    `  CHIP BLUEPRINTS ("fab design <name> <sha256|scrypt|randomx|ethash|post> <7nm|5nm|3nm|2nm> [profile]")`,
    ...bpRows,
    ``,
    `  ACTIVE WAFER QUEUE ("fab produce <bp#> <qty>")`,
    ...qRows,
    ``,
    `  FINISHED INVENTORY ("fab deploy <inv#> <rig#>" | "fab sell <inv#> <qty|all>")`,
    ...invRows,
    ``,
    `  DESIGN PROFILES: ${(Object.keys(DESIGN_PROFILE_SPECS) as DesignProfile[])
      .map((p) => `${p.toLowerCase()}=${DESIGN_PROFILE_SPECS[p].blurb}`)
      .join(' | ')}`,
    `  Every tape-out also rolls first-silicon quality (Grade A/B/C) and every wafer batch rolls its own yield (95-105%).`,
    ``,
    `  COMMANDS:`,
    `    fab line build                               Commission cleanroom fab line (1..3)`,
    `    fab design <name> <algo> <node> [profile]    Tape out blueprint (node: 7nm|5nm|3nm|2nm)`,
    `    fab produce <bp#> <qty>                      Manufacture custom chip batch (1..20)`,
    `    fab deploy <inv#> <rig#>                     Install custom chip into an active rig`,
    `    fab strip <rig#>                             Pull an installed ASIC back into inventory`,
    `    fab sell <inv#> <qty|all>                    Export finished ASICs for wholesale profit`,
  ].join('\n');
}
