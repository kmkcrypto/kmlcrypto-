import { FACILITY_TIERS, RESEARCH_NODES } from '../data/catalog';
import {
  CoinSymbol,
  DevScenarioId,
  GameState,
  HiredEmployee,
  MarketRegime,
  MiningRig,
  SandboxConfig,
} from '../types/game';
import { createPlayerCoin } from './coins';
import { createInitialComponentHealth } from './usedMarket';
import { createNewGameState, getFacility } from './simulation';
import { buildDefaultFab } from './fab';
import { launchShellCoin, prepareVaultRaid } from './underground';
import { buildDefaultWorld, stepSharedWorld } from './world';

/**
 * Developer test scenarios.
 *
 * Each scenario launches an isolated sandbox save positioned at a known point in
 * the progression, so a late-game system can be exercised without replaying the
 * whole run. Sandbox saves live in their own storage slot, so a scenario can
 * never touch a normal career save.
 */

export interface ScenarioSpec {
  id: DevScenarioId;
  name: string;
  tagline: string;
  description: string;
}

export const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'MIDGAME',
    name: 'Midgame Company',
    tagline: 'Garage · Gen-3 hardware',
    description:
      'Established garage operator with GPU rigs, Gen-3 research and working capital to expand.',
  },
  {
    id: 'INDUSTRIAL',
    name: 'Industrial Operation',
    tagline: 'Warehouse · ASIC fleet',
    description:
      'A warehouse full of Gen-3 ASIC blades with contracts, staff and used-market access unlocked.',
  },
  {
    id: 'GEN5',
    name: 'Gen-5 Exascale',
    tagline: 'Industrial · 2nm blades',
    description:
      'Gen-5 2nm ExaBlades under two-phase immersion, with the full Gen-5 research tree complete.',
  },
  {
    id: 'GEN6',
    name: 'Gen-6 AI Convergence',
    tagline: 'Megafarm · AI-ASIC',
    description:
      'Gen-6 AI-ASIC blades and Neural Tensor GPUs on 16kW HVDC with AI thermal fabric cooling.',
  },
  {
    id: 'GEN7',
    name: 'Gen-7 Quantum & Photonic',
    tagline: 'Megafarm · He-3 Cryo',
    description:
      'Gen-7 Photonic Laser-Matrix cores and QGPU backplanes under dilution cryostats with full R&D.',
  },
  {
    id: 'MANUFACTURING',
    name: 'Custom Manufacturing',
    tagline: 'Foundry · 2 fab lines',
    description:
      'Foundry unlocked with two cleanroom lines and engineering staff, ready for custom chip design.',
  },
  {
    id: 'MULTIPLAYER',
    name: 'Shared World Test',
    tagline: 'Blockchain · block history',
    description:
      'Industrial fleet connected to the simulated shared blockchain world with live block competition.',
  },
  {
    id: 'QUANTUM_PHOTONIC',
    name: 'Quantum vs Photonic Lab',
    tagline: 'Gen-7 · Dual branch R&D',
    description:
      'Dual Gen-7 Cryo-Quantum QPU and Photonic Optical QGPU clusters with 3 fab lines for branch comparison.',
  },
  {
    id: 'UNDERGROUND_CRISIS',
    name: 'Underground Audit Crisis',
    tagline: 'Heat 68 · Formal Audit',
    description:
      'Syndicate under FORMAL_AUDIT with active shell tokens, prepared rival raid dossier, and compliance choices.',
  },
  {
    id: 'CUSTOM_COIN_EMPIRE',
    name: 'Custom Coin Economy',
    tagline: 'Mainnet · Multi-Algo Fleet',
    description:
      'Operates player-launched mainnet coin alongside RVN/ZEC/QBC rigs with spot liquidity and creator fees.',
  },
  {
    id: 'CUSTOM',
    name: 'Custom Scenario',
    tagline: 'Everything unlocked',
    description:
      'Free-form sandbox: all catalog gates bypassed, all coins unlocked and $25M in working capital.',
  },
];

const SCENARIO_SEED: Record<DevScenarioId, string> = {
  MIDGAME: 'DEV-MIDGAME',
  INDUSTRIAL: 'DEV-INDUSTRIAL',
  GEN5: 'DEV-GEN5',
  GEN6: 'DEV-GEN6',
  GEN7: 'DEV-GEN7',
  MANUFACTURING: 'DEV-FAB',
  MULTIPLAYER: 'DEV-WORLD',
  QUANTUM_PHOTONIC: 'DEV-QP-LAB',
  UNDERGROUND_CRISIS: 'DEV-UG-CRISIS',
  CUSTOM_COIN_EMPIRE: 'DEV-CUSTOM-COIN',
  CUSTOM: 'DEV-CUSTOM',
};

/** Research closure: every prerequisite of the named nodes, so the tree stays consistent. */
export function researchClosure(targetIds: string[]): string[] {
  const unlocked = new Set<string>();
  const visit = (id: string) => {
    if (unlocked.has(id)) return;
    const node = RESEARCH_NODES.find((n) => n.id === id);
    if (!node) return;
    unlocked.add(id);
    node.prereqIds.forEach(visit);
  };
  targetIds.forEach(visit);
  return Array.from(unlocked);
}

type RigParts = {
  chassisId: string;
  computeId: string;
  gpuIds?: string[];
  storageId: string;
  psuId: string;
  coolingId: string;
  osId: string;
  targetCoin?: CoinSymbol;
};

function makeScenarioRig(
  template: MiningRig,
  index: number,
  parts: RigParts,
  facilityId: string
): MiningRig {
  const facility = getFacility(facilityId);
  return {
    ...template,
    id: `rig_scn_${index + 1}`,
    name: `Scenario Rig #${index + 1}`,
    chassisId: parts.chassisId,
    computeId: parts.computeId,
    gpuIds: parts.gpuIds ?? [],
    storageId: parts.storageId,
    psuId: parts.psuId,
    coolingId: parts.coolingId,
    osId: parts.osId,
    targetCoin: parts.targetCoin ?? 'BTC',
    overclockPct: 100,
    poolMode: 'PPLNS',
    firmwareProfile: 'BALANCED',
    pasteStepsRemaining: 16,
    enabled: true,
    gridX: 1 + (index % 4),
    gridY: 1 + Math.floor(index / 4),
    temperatureC: facility.ambientTempC + 22,
    healthPct: 100,
    componentHealth: createInitialComponentHealth(parts.gpuIds?.length ?? 0, 100),
    conditionTier: 'NEW',
    ageSteps: 0,
    failureCount: 0,
    status: 'MINING',
    customAsicSpec: undefined,
  };
}

function buildEmployees(roles: Array<HiredEmployee['role']>, step = 0): HiredEmployee[] {
  const names = ['A. Vance', 'R. Okafor', 'M. Lindqvist', 'T. Nakamura', 'S. Duarte', 'K. Weiss'];
  return roles.map((role, i) => ({
    id: `emp_scn_${role}_${i}`,
    name: names[i % names.length],
    role,
    shift: 'ROTATION_24_7',
    priority: role === 'RESEARCHER' ? 'RESEARCH_OUTPUT' : 'HASHRATE_TUNING',
    morale: 82,
    skillLevel: 4,
    experienceXp: 1200,
    hiredStep: step,
  }));
}

function sandboxConfig(startingFacilityId: string, startingCash: number, marketRegime: MarketRegime): SandboxConfig {
  return {
    startingCash,
    startingFacilityId,
    startingRigs: 1,
    unlockAllResearch: false,
    unlockAllCoins: true,
    marketRegime,
    operatingCostMult: 1,
  };
}

export function createScenarioState(id: DevScenarioId): GameState {
  const seed = SCENARIO_SEED[id];
  const baseFacility = id === 'MIDGAME' || id === 'CUSTOM' ? 'fac_garage' : 'fac_warehouse';
  const base = createNewGameState('SANDBOX', true, seed, sandboxConfig(baseFacility, 500_000, 'ACCUMULATION'));

  const withRigs = (facilityId: string, parts: RigParts, count: number, cash: number): GameState => {
    const rigs = Array.from({ length: count }, (_, i) =>
      makeScenarioRig(base.rigs[0], i, parts, facilityId)
    );
    return {
      ...base,
      scenarioId: id,
      facilityId,
      ownedFacilityIds: FACILITY_TIERS.map((f) => f.id),
      cash,
      rigs,
      coolingUnits: [],
    };
  };

  const midParts: RigParts = {
    chassisId: 'chassis_open_frame',
    computeId: 'cpu_ryzen9_5950x',
    gpuIds: ['gpu_gtx1060', 'gpu_gtx1060'],
    storageId: 'stor_ddr4_16gb',
    psuId: 'psu_1200w',
    coolingId: 'cool_360_aio',
    osId: 'os_ubuntu_lts',
    targetCoin: 'ETH',
  };

  const industrialParts: RigParts = {
    chassisId: 'chassis_asic_rack',
    computeId: 'asic_s19_pro',
    storageId: 'stor_ddr4_32gb_nvme',
    psuId: 'psu_3600w_pdu',
    coolingId: 'cool_delta_blowers',
    osId: 'os_mineros',
    targetCoin: 'BTC',
  };

  const gen5Parts: RigParts = {
    chassisId: 'chassis_cryo_monolith',
    computeId: 'asic_chronos_2nm',
    storageId: 'stor_exascale_960tb',
    psuId: 'psu_9000w_hvdc',
    coolingId: 'cool_two_phase_immersion',
    osId: 'os_quantum_stratum',
    targetCoin: 'BTC',
  };

  const gen6Parts: RigParts = {
    chassisId: 'chassis_ai_hpc_rack',
    computeId: 'asic_ai_hybrid_phor',
    storageId: 'stor_ai_nvme_1280tb',
    psuId: 'psu_16000w_hvdc',
    coolingId: 'cool_ai_thermal_fabric',
    osId: 'os_neural_fleet',
    targetCoin: 'BTC',
  };

  const gen7Parts: RigParts = {
    chassisId: 'chassis_quantum_cryo_bay',
    computeId: 'asic_photonic_sha_core',
    storageId: 'stor_photonic_holo_2560tb',
    psuId: 'psu_24000w_supercond',
    coolingId: 'cool_quantum_dilution',
    osId: 'os_quantum_qec_kernel',
    targetCoin: 'BTC',
  };

  switch (id) {
    case 'MIDGAME': {
      const s = withRigs('fac_garage', midParts, 4, 220_000);
      return {
        ...s,
        unlockedResearch: researchClosure([
          'res_asic_tapeout',
          'res_mineros',
          'res_secondary_broker',
          'res_quant_forecasting',
        ]),
        employees: buildEmployees(['TECHNICIAN', 'MANAGER']),
      };
    }
    case 'INDUSTRIAL': {
      const s = withRigs('fac_warehouse', industrialParts, 10, 3_200_000);
      return {
        ...s,
        unlockedResearch: researchClosure([
          'res_gen4_hyperhash',
          'res_immersion_cooling',
          'res_enterprise_sla',
          'res_bulk_procurement',
          'res_room_automation',
        ]),
        employees: buildEmployees(['TECHNICIAN', 'ELECTRICIAN', 'MANAGER', 'RESEARCHER']),
      };
    }
    case 'GEN5': {
      const s = withRigs('fac_industrial', gen5Parts, 8, 18_000_000);
      return {
        ...s,
        unlockedResearch: researchClosure([
          'res_gen5_exascale',
          'res_cryo_cooling',
          'res_hydro_ppa',
          'res_quant_desk',
        ]),
        employees: buildEmployees([
          'TECHNICIAN',
          'TECHNICIAN',
          'ELECTRICIAN',
          'MANAGER',
          'RESEARCHER',
        ]),
      };
    }
    case 'GEN6': {
      const s = withRigs('fac_megafarm', gen6Parts, 6, 65_000_000);
      return {
        ...s,
        unlockedResearch: researchClosure(['res_gen6_ai_convergence', 'res_ai_thermal_fabric']),
        employees: buildEmployees([
          'TECHNICIAN',
          'TECHNICIAN',
          'ELECTRICIAN',
          'MANAGER',
          'RESEARCHER',
          'SYS_ENGINEER',
        ]),
      };
    }
    case 'GEN7': {
      const s = withRigs('fac_megafarm', gen7Parts, 6, 220_000_000);
      return {
        ...s,
        unlockedResearch: researchClosure([
          'res_gen7_quantum_photonic',
          'res_gen7_dilution_cryo',
          'res_gen7_quantum_coherence',
          'res_gen7_photonic_waveguides',
        ]),
        employees: buildEmployees([
          'TECHNICIAN',
          'TECHNICIAN',
          'ELECTRICIAN',
          'MANAGER',
          'RESEARCHER',
          'SYS_ENGINEER',
        ]),
      };
    }
    case 'MANUFACTURING': {
      const s = withRigs('fac_industrial', gen5Parts, 4, 16_000_000);
      return {
        ...s,
        unlockedResearch: researchClosure([
          'res_gen6_ai_convergence',
          'res_ai_thermal_fabric',
          'res_wafer_lithography',
        ]),
        fab: { ...buildDefaultFab(), linesCount: 2 },
        employees: buildEmployees([
          'RESEARCHER',
          'RESEARCHER',
          'SYS_ENGINEER',
          'TECHNICIAN',
          'MANAGER',
        ]),
      };
    }
    case 'MULTIPLAYER': {
      const s = withRigs('fac_warehouse', industrialParts, 6, 2_500_000);
      let world = { ...buildDefaultWorld(seed), seasonLabel: 'Season 1 · Open Beta World' };
      for (let i = 0; i < 12; i += 1) {
        world = stepSharedWorld(world, { ...s, stepCount: i }, 180).nextWorld;
      }
      return {
        ...s,
        unlockedResearch: researchClosure(['res_gen4_hyperhash', 'res_secondary_broker']),
        world,
        employees: buildEmployees(['TECHNICIAN', 'MANAGER']),
      };
    }
    case 'QUANTUM_PHOTONIC': {
      const s = withRigs('fac_megafarm', gen7Parts, 3, 180_000_000);
      const qRig1 = makeScenarioRig(
        base.rigs[0],
        0,
        {
          chassisId: 'chassis_quantum_cryo_bay',
          computeId: 'qpu_quantum_qhash_core',
          storageId: 'stor_photonic_holo_2560tb',
          psuId: 'psu_24000w_supercond',
          coolingId: 'cool_quantum_dilution',
          osId: 'os_quantum_qec_kernel',
          targetCoin: 'QBC',
        },
        'fac_megafarm'
      );
      const qRig2 = makeScenarioRig(
        base.rigs[0],
        1,
        {
          chassisId: 'chassis_gen7_photonic_blade_array',
          computeId: 'asic_photonic_sha_core',
          gpuIds: ['gpu_photonic_qgpu', 'gpu_photonic_qgpu'],
          storageId: 'stor_photonic_holo_2560tb',
          psuId: 'psu_24000w_supercond',
          coolingId: 'cool_quantum_dilution',
          osId: 'os_quantum_qec_kernel',
          targetCoin: 'QBC',
        },
        'fac_megafarm'
      );
      return {
        ...s,
        rigs: [qRig1, qRig2, ...s.rigs.slice(2)],
        unlockedResearch: researchClosure([
          'res_gen7_quantum_photonic',
          'res_gen7_dilution_cryo',
          'res_gen7_quantum_coherence',
          'res_gen7_photonic_waveguides',
          'res_gen7_hybrid_cryo_fabric',
          'res_wafer_lithography',
        ]),
        fab: { ...buildDefaultFab(), linesCount: 3 },
        employees: buildEmployees(['RESEARCHER', 'RESEARCHER', 'SYS_ENGINEER', 'ELECTRICIAN', 'TECHNICIAN']),
      };
    }
    case 'UNDERGROUND_CRISIS': {
      let s = withRigs('fac_warehouse', industrialParts, 5, 140_000);
      s = {
        ...s,
        regulatoryScrutiny: 68,
        mediaCredibility: 24,
        unlockedResearch: researchClosure(['res_gen4_hyperhash', 'res_secondary_broker']),
        employees: buildEmployees(['TECHNICIAN', 'PR_STRATEGIST', 'MANAGER']),
      };
      const sc = launchShellCoin(s, 'SHDW', 'Shadow Protocol');
      if (sc.ok) s = sc.nextState;
      const prep = prepareVaultRaid(s, s.rivals[0].id);
      if (prep.ok) s = prep.nextState;
      return {
        ...s,
        regulatoryScrutiny: 68,
        underground: {
          ...s.underground,
          investigationStage: 'FORMAL_AUDIT',
          investigationStepsRemaining: 10,
          suspiciousActivityScore: 72,
          scandalMarks: 2,
          marketConfidencePenaltyPct: 8,
        },
      };
    }
    case 'CUSTOM_COIN_EMPIRE': {
      let s = withRigs('fac_industrial', gen5Parts, 4, 8_500_000);
      s = {
        ...s,
        unlockedResearch: researchClosure(['res_gen5_exascale', 'res_quant_desk', 'res_wafer_lithography']),
        employees: buildEmployees(['ANALYST', 'PR_STRATEGIST', 'SYS_ENGINEER', 'TECHNICIAN', 'MANAGER']),
      };
      const launched = createPlayerCoin(s, {
        symbol: 'NOVA',
        name: 'NovaHash Network',
        algorithm: 'SHA256',
        initialLiquidityUsd: 250_000,
        halvingEverySteps: 90,
        creatorFeePct: 2.5,
      });
      if (launched.ok) {
        s = launched.nextState;
      }
      const gpuRig = makeScenarioRig(
        base.rigs[0],
        4,
        {
          chassisId: 'chassis_open_gpu_gen5',
          computeId: 'cpu_epyc_9654',
          gpuIds: ['gpu_rtx5090_ai', 'gpu_rtx5090_ai', 'gpu_rtx5090_ai'],
          storageId: 'stor_exascale_960tb',
          psuId: 'psu_9000w_hvdc',
          coolingId: 'cool_two_phase_immersion',
          osId: 'os_quantum_stratum',
          targetCoin: 'RVN',
        },
        'fac_industrial'
      );
      return {
        ...s,
        rigs: [
          ...s.rigs.map((r, i) => ({ ...r, targetCoin: i < 2 ? 'NOVA' : r.targetCoin })),
          gpuRig,
        ],
      };
    }
    case 'CUSTOM':
    default: {
      const s = withRigs('fac_garage', midParts, 2, 25_000_000);
      return {
        ...s,
        devUnlockAll: true,
        unlockedResearch: RESEARCH_NODES.map((n) => n.id),
        employees: buildEmployees(['TECHNICIAN', 'RESEARCHER']),
      };
    }
  }
}
