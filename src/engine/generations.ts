import { FACILITY_TIERS, RESEARCH_NODES } from '../data/catalog';
import {
  ConglomerateGeneration,
  ConglomerateState,
  GameState,
  GenerationMilestoneState,
} from '../types/game';
import {
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  getOwnedBusinessIds,
} from './conglomerate';
import { getRigGeneration } from './usedMarket';

export function isGen7ResearchNode(nodeId: string): boolean {
  if (nodeId.startsWith('res_gen7_')) return true;
  const node = RESEARCH_NODES.find((n) => n.id === nodeId);
  return node?.era === 'QUANTUM';
}

export function computeResearchGeneration(unlockedResearch: string[]): ConglomerateGeneration {
  const unlocked = new Set(unlockedResearch);
  if (
    unlocked.has('res_gen7_quantum_photonic') ||
    unlocked.has('res_gen7_dilution_cryo') ||
    unlocked.has('res_gen7_quantum_coherence') ||
    unlocked.has('res_gen7_photonic_waveguides') ||
    unlocked.has('res_gen7_hybrid_cryo_fabric')
  ) {
    return 7;
  }
  if (unlocked.has('res_gen6_ai_convergence') || unlocked.has('res_ai_thermal_fabric')) {
    return 6;
  }
  if (unlocked.has('res_gen5_exascale')) {
    return 5;
  }
  if (unlocked.has('res_gen4_hyperhash') || unlocked.has('res_cryo_cooling')) {
    return 4;
  }
  if (unlocked.has('res_gen3_silicon') || unlocked.has('res_immersion_cooling')) {
    return 3;
  }
  if (unlocked.has('res_fpga_gateware') || unlocked.has('res_asic_tapeout') || unlocked.has('res_gpu_kernel')) {
    return 2;
  }
  return 1;
}

export function computeCurrentGeneration(state: GameState): ConglomerateGeneration {
  const resGen = computeResearchGeneration(state.unlockedResearch ?? []);
  let rigMaxGen: number = 1;
  for (const rig of state.rigs ?? []) {
    rigMaxGen = Math.max(rigMaxGen, getRigGeneration(rig));
  }
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === state.facilityId));
  const facFloor = facIdx >= 4 ? 4 : facIdx >= 3 ? 3 : 1;

  const combined = Math.max(resGen, rigMaxGen, facFloor);
  return Math.max(1, Math.min(7, combined)) as ConglomerateGeneration;
}

export interface ResearchGateCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validates whether a player may begin an unstarted research project.
 * Already-unlocked Gen 7 nodes and owned Gen 7 hardware on legacy saves remain valid;
 * starting any NEW Gen 7 node in Career mode requires owning all 6 conglomerate businesses.
 */
export function canStartResearchNode(state: GameState, nodeId: string): ResearchGateCheck {
  if (state.activeResearchId) {
    return { ok: false, reason: 'Another R&D project is already in progress.' };
  }
  if (state.unlockedResearch.includes(nodeId)) {
    return { ok: false, reason: 'Research project already completed.' };
  }
  const node = RESEARCH_NODES.find((n) => n.id === nodeId);
  if (!node) {
    return { ok: false, reason: 'Research node not found.' };
  }
  if (state.cash < node.costCash) {
    return { ok: false, reason: `Insufficient cash ($${node.costCash.toLocaleString()} required).` };
  }
  if (!state.devUnlockAll) {
    const missingPrereqs = node.prereqIds.filter((p) => !state.unlockedResearch.includes(p));
    if (missingPrereqs.length > 0) {
      return { ok: false, reason: 'Prerequisite R&D nodes have not been completed yet.' };
    }
  }

  const bypassBusinessGate = Boolean(state.isSandbox || state.devUnlockAll);
  if (!bypassBusinessGate && isGen7ResearchNode(nodeId) && !areAllSixBusinessesOwned(state)) {
    const owned = getOwnedBusinessIds(state).length;
    return {
      ok: false,
      reason: `Gen-7 Quantum & Photonic R&D requires owning all 6 businesses in your corporate conglomerate (currently ${owned}/6).`,
    };
  }

  return { ok: true };
}

/**
 * Evaluates generation progression and expansion/conglomerate gates without mutating game cash or RNG.
 */
export function evaluateGenerationMilestones(
  state: GameState,
  prevConglomerate?: ConglomerateState
): GenerationMilestoneState {
  const base = prevConglomerate ?? state.conglomerate ?? buildDefaultConglomerate(state);
  const prevGen = base.generation;
  const currentGeneration = computeCurrentGeneration(state);
  const highestGenerationReached = Math.max(
    prevGen.highestGenerationReached,
    currentGeneration
  ) as ConglomerateGeneration;

  const ownedIds = getOwnedBusinessIds({ conglomerate: base });
  const ownsNonMining = ownedIds.some((id) => id !== 'MINING');
  const allSixOwned = areAllSixBusinessesOwned({ conglomerate: base });

  const gen5ExpansionTriggered =
    prevGen.gen5ExpansionTriggered ||
    highestGenerationReached >= 5 ||
    state.unlockedResearch.includes('res_gen5_exascale');
  const gen5ExpansionStep =
    prevGen.gen5ExpansionStep ?? (gen5ExpansionTriggered ? state.stepCount : null);

  const gen6Unlocked =
    prevGen.gen6Unlocked ||
    ownsNonMining ||
    highestGenerationReached >= 6;

  const gen7ConglomerateUnlocked = allSixOwned;
  const gen7UnlockedStep = allSixOwned
    ? prevGen.gen7UnlockedStep ?? state.stepCount
    : null;

  return {
    currentGeneration,
    highestGenerationReached,
    gen5ExpansionTriggered,
    gen5ExpansionStep,
    gen6Unlocked,
    gen7ConglomerateUnlocked,
    gen7UnlockedStep,
  };
}
