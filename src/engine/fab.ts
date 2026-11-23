import {
  CHASSIS_PARTS,
  FACILITY_TIERS,
  GPU_PARTS,
  RESEARCH_NODES,
} from '../data/catalog';
import {
  BlueprintRevisionEntry,
  ChipProcessNode,
  ChipQualityGrade,
  CustomAsicInventoryItem,
  CustomChipBlueprint,
  CustomComponentSpec,
  DesignProfile,
  FabArchitectureId,
  FabBatchRecord,
  FabComponentParams,
  FabEngineeringAllocation,
  FabProductionOrder,
  FabState,
  FabSubFeatureId,
  GameState,
  HardwareGen,
  ManufacturingHistoryEntry,
  MiningAlgorithm,
  NewsItem,
  PartCategory,
  PrototypeTestReport,
  RigCustomPartsMap,
  SerializedComponentRecord,
  TechBranch,
  TransactionEntry,
} from '../types/game';
import { formatHashrate, formatStepLabel, formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';
import {
  computeAverageRigHealth,
  ensureRigComponentHealth,
  getEffectivePartBundle,
  getGlobalHardwarePriceMult,
} from './usedMarket';

const LINE_COSTS = [18000, 42000, 110000];

/**
 * Blueprint design trade-offs. Every tape-out can pick a final macro profile
 * on top of custom engineering allocations.
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
    blurb: '+15% output, +18% power draw',
  },
  BALANCED: {
    label: 'Balanced',
    hashMult: 1,
    wattMult: 1,
    heatMult: 1,
    costMult: 1,
    blurb: 'Reference spec, no trade-off',
  },
  EFF: {
    label: 'Efficiency',
    hashMult: 0.9,
    wattMult: 0.8,
    heatMult: 0.9,
    costMult: 1.15,
    blurb: '-20% power draw, -10% output',
  },
  COMPACT: {
    label: 'Compact',
    hashMult: 0.95,
    wattMult: 0.85,
    heatMult: 0.7,
    costMult: 1.05,
    blurb: '-30% heat/noise, -15% power, -5% output',
  },
};

export interface FabCategorySpec {
  id: PartCategory;
  label: string;
  shortLabel: string;
  researchRequired?: string;
  summary: string;
}

export const FAB_CATEGORY_SPECS: FabCategorySpec[] = [
  {
    id: 'compute',
    label: 'Compute Silicon (ASIC / CPU / FPGA / QPU)',
    shortLabel: 'COMPUTE',
    summary: 'Custom ASIC blades, multi-chiplet RandomX CPUs, FPGA cores, & Gen-7 Quantum/Photonic dies.',
  },
  {
    id: 'gpu',
    label: 'Accelerator Cards (Mining, AI & QGPU)',
    shortLabel: 'GPU',
    researchRequired: 'res_gpu_kernel',
    summary: 'Binned GDDR/HBM/Optical cards tuned for Ethash, KawPoW, Equihash, Scrypt & QHash.',
  },
  {
    id: 'chassis',
    label: 'Thermal Enclosures & Rack Chassis',
    shortLabel: 'CHASSIS',
    summary: 'Open 6–12 GPU frames, ASIC shelves, hybrid ASIC+GPU pods, or Cryo/Optical backplanes.',
  },
  {
    id: 'storage',
    label: 'NVMe Plot Arrays & ECC RAM Banks',
    shortLabel: 'STORAGE',
    summary: 'Petabyte-scale Chia PoST vaults or ultra-low-latency memory efficiency banks.',
  },
  {
    id: 'psu',
    label: 'GaN & HVDC Power Delivery Units',
    shortLabel: 'PSU',
    summary: 'Ultra-high-efficiency 99%+ power stages from 1.2 kW silent rails to 24 kW HVDC.',
  },
  {
    id: 'cooling',
    label: 'Vapor, Liquid & Cryo Immersion Loops',
    shortLabel: 'COOLING',
    summary: 'High-CFM vapor chambers, cold-plate manifolds, immersion tanks & He-3 dilution loops.',
  },
  {
    id: 'os',
    label: 'Custom Baremetal Kernel & Microcode OS',
    shortLabel: 'OS',
    summary: 'Compiled low-jitter firmware kernels boosting hash, power & fault stability.',
  },
];

export interface FabArchitectureSpec {
  id: FabArchitectureId;
  category: PartCategory;
  label: string;
  researchRequired?: string;
  blurb: string;
}

export const FAB_ARCHITECTURES: FabArchitectureSpec[] = [
  // COMPUTE
  {
    id: 'ASIC_BLADE',
    category: 'compute',
    label: 'Monolithic ASIC / QPU Blade',
    researchRequired: 'res_wafer_lithography',
    blurb: 'Extreme primary-algo silicon or Gen-7 QPU; seats inside ASIC Racks & Converged Racks.',
  },
  {
    id: 'CHIPLET_CPU',
    category: 'compute',
    label: '3D-V-Cache Chiplet CPU',
    blurb: 'Fits standard GPU/ATX frames; high L3 cache density for RandomX + host work.',
  },
  {
    id: 'HYBRID_FPGA',
    category: 'compute',
    label: 'Reconfigurable FPGA / Optical Matrix',
    researchRequired: 'res_fpga_gateware',
    blurb: 'Dual-algo gateware (primary + secondary trickle); fits GPU frames & ASIC shelves.',
  },
  // GPU
  {
    id: 'HASH_CORE',
    category: 'gpu',
    label: 'Dense Compute Shader Core',
    blurb: 'Balanced core/VRAM layout for Ethash, KawPoW, Equihash & Scrypt multi-GPU rigs.',
  },
  {
    id: 'HBM_MONSTER',
    category: 'gpu',
    label: 'Wide-Bus HBM3 / Optical Accelerator',
    researchRequired: 'res_gen3_silicon',
    blurb: '+28% memory-bound DAG throughput, wider VRAM capacity, higher die cost.',
  },
  {
    id: 'LOW_VOLT_CARD',
    category: 'gpu',
    label: 'Golden-Binned Low-Volt Card',
    blurb: '-22% power draw & whisper acoustics for cramped/power-capped bays.',
  },
  // CHASSIS
  {
    id: 'OPEN_GPU_FRAME',
    category: 'chassis',
    label: 'Modular Open GPU Mining Frame',
    blurb: '6–12 GPU riser slots + heavy passive convective cooling.',
  },
  {
    id: 'ASIC_BLADE_SHELF',
    category: 'chassis',
    label: 'High-Density ASIC / Cryo Blade Shelf',
    researchRequired: 'res_wafer_lithography',
    blurb: 'Reinforced blind-mate ASIC rack enclosure with dual airflow / cryo plenums.',
  },
  {
    id: 'SEALED_BAFFLE',
    category: 'chassis',
    label: 'Acoustic-Baffled Server Box',
    blurb: '-12 to -18 dBA acoustic dampening + 6–8 GPU slots for strict zoning caps.',
  },
  {
    id: 'CONVERGED_SUPER',
    category: 'chassis',
    label: 'Converged Hybrid ASIC+GPU Super-Rack',
    researchRequired: 'res_gen4_hyperhash',
    blurb: 'Seats BOTH up to 10 GPUs AND a custom ASIC/QPU blade with optional Cryo/Optical bus.',
  },
  // STORAGE
  {
    id: 'NVME_ARRAY',
    category: 'storage',
    label: 'Dense Gen5 NVMe Plot Vault',
    researchRequired: 'res_mega_storage',
    blurb: 'Massive multi-hundred-TB PoST array engineered for Chia (XCH) supremacy.',
  },
  {
    id: 'HIGH_BW_DDR',
    category: 'storage',
    label: 'Low-Latency ECC HBM-RAM Bank',
    blurb: 'Maximizes `% efficiencyBonus` (+10% to +30% fleet hash) on low watts.',
  },
  {
    id: 'HYBRID_CACHE',
    category: 'storage',
    label: 'Dual-Tier Optane + SAS Cache',
    blurb: 'Balanced TB capacity + solid efficiency bonus at friendly unit cost.',
  },
  // PSU
  {
    id: 'GAN_HIGH_EFF',
    category: 'psu',
    label: 'Gallium-Nitride (GaN) Active Stage',
    blurb: 'Ultra-high 95%–99.6% conversion efficiency, cutting wall watts & bill overhead.',
  },
  {
    id: 'INDUSTRIAL_RAIL',
    category: 'psu',
    label: '3-Phase HVDC Megawatt Busbar',
    researchRequired: 'res_smart_pdu',
    blurb: 'Massive 3.5 kW–26 kW maxWatts rating for extreme OC ASICs and 10-GPU clusters.',
  },
  {
    id: 'SILENT_PASSIVE',
    category: 'psu',
    label: 'Zero-Fan Conduction Power Rail',
    blurb: 'Whisper-quiet 2–5 dBA power delivery for noise-restricted rooms.',
  },
  // COOLING
  {
    id: 'VAPOR_AIR',
    category: 'cooling',
    label: 'Sintered Vapor-Chamber Array',
    blurb: 'Strong solid-state heatpipe cooling at very low pump/fan wattage.',
  },
  {
    id: 'DIRECT_LIQUID',
    category: 'cooling',
    label: 'Direct-to-Chip Cold-Plate Loop',
    researchRequired: 'res_vapor_chambers',
    blurb: 'Heavy closed-loop thermal capacity (-120°C to -280°C) with low noise.',
  },
  {
    id: 'CRYO_IMMERSION',
    category: 'cooling',
    label: 'Two-Phase Immersion / Cryo Dilution Tank',
    researchRequired: 'res_immersion_cooling',
    blurb: 'Full immersion / He-3 tank: caps rig acoustics <=48 dBA with extreme -°C dissipation.',
  },
  // OS
  {
    id: 'BARE_METAL_ASM',
    category: 'os',
    label: 'Zero-Overhead Assembly Kernel',
    blurb: 'Maximum raw `hashrateMultiplier` (+14% to +46%) bypassing OS abstractions.',
  },
  {
    id: 'UNDERCLOCK_SCHED',
    category: 'os',
    label: 'Dynamic DVFS Power Governor',
    blurb: 'Drives `powerMultiplier` down (0.74x–0.90x) to slash kW draw & thermal load.',
  },
  {
    id: 'SELF_HEAL_RT',
    category: 'os',
    label: 'ECC Watchdog & Self-Heal RTOS',
    researchRequired: 'res_predictive_telemetry',
    blurb: 'Up to +72% `stabilityBonus` + balanced hash/power gains, curbing faults & wear.',
  },
];

export interface FabSubFeatureSpec {
  id: FabSubFeatureId;
  label: string;
  researchRequired?: string;
  nreAddUsd: number;
  unitCostMult: number;
  perfMult: number;
  wattMult: number;
  heatMult: number;
  noiseDelta: number;
  wearResistance: number;
  qualityFloorBoost: number;
  blurb: string;
}

export const FAB_SUBFEATURES: FabSubFeatureSpec[] = [
  {
    id: 'STD',
    label: 'Standard Reference Spec',
    nreAddUsd: 0,
    unitCostMult: 1.0,
    perfMult: 1.0,
    wattMult: 1.0,
    heatMult: 1.0,
    noiseDelta: 0,
    wearResistance: 0,
    qualityFloorBoost: 0,
    blurb: 'Baseline BOM & layout with zero extra NRE fee.',
  },
  {
    id: 'COPPER_BUS',
    label: 'Oxygen-Free Copper Bus & Traces',
    nreAddUsd: 350,
    unitCostMult: 1.12,
    perfMult: 1.07,
    wattMult: 0.94,
    heatMult: 0.96,
    noiseDelta: 0,
    wearResistance: 0.04,
    qualityFloorBoost: 0.01,
    blurb: '+7% output, -6% watts, +4% durability (+12% unit cost, +$350 NRE).',
  },
  {
    id: 'GRAPHENE_TIM',
    label: 'Graphene Thermal Matrix',
    researchRequired: 'res_vapor_chambers',
    nreAddUsd: 480,
    unitCostMult: 1.15,
    perfMult: 1.02,
    wattMult: 0.97,
    heatMult: 0.82,
    noiseDelta: -4,
    wearResistance: 0.06,
    qualityFloorBoost: 0.02,
    blurb: '-18% heat, -4 dBA noise, +6% durability (+15% unit cost, +$480 NRE).',
  },
  {
    id: 'REDUNDANT_VRM',
    label: '12-Phase Redundant VRM / Rail',
    researchRequired: 'res_power_factor',
    nreAddUsd: 550,
    unitCostMult: 1.18,
    perfMult: 1.05,
    wattMult: 0.92,
    heatMult: 0.94,
    noiseDelta: -1,
    wearResistance: 0.14,
    qualityFloorBoost: 0.03,
    blurb: '+14% wear resistance, -8% watts, +5% output (+18% unit cost, +$550 NRE).',
  },
  {
    id: 'ECC_SHIELD',
    label: 'Hardware ECC & Acoustic Baffle',
    researchRequired: 'res_predictive_telemetry',
    nreAddUsd: 720,
    unitCostMult: 1.22,
    perfMult: 1.06,
    wattMult: 0.96,
    heatMult: 0.9,
    noiseDelta: -6,
    wearResistance: 0.18,
    qualityFloorBoost: 0.05,
    blurb: '+18% wear resistance, -6 dBA, +0.05 silicon grade floor (+22% unit cost, +$720 NRE).',
  },
];

export interface FabFocusOption {
  id: string;
  label: string;
  blurb: string;
}

export function getFocusOptionsForDesign(
  category: PartCategory,
  architecture: FabArchitectureId
): FabFocusOption[] {
  if (category === 'compute' || category === 'gpu') {
    if (category === 'gpu') {
      return [
        { id: 'ETHASH', label: 'Ethash Primary (+KawPoW/Equihash secondary)', blurb: 'Memory-hard Ethash / Ethereum Classic specialization.' },
        { id: 'KAWPOW', label: 'KawPoW ProgPoW Focus (+Ethash/Equihash)', blurb: 'Balanced ALU + GDDR6X focus for Ravencoin (RVN).' },
        { id: 'EQUIHASH', label: 'Equihash Solver Focus (+KawPoW)', blurb: 'Wide-bus solver acceleration for Zcash (ZEC).' },
        { id: 'SCRYPT', label: 'Scrypt Compute Focus (+Ethash)', blurb: 'Tuned for Litecoin/Dogecoin GPU kernels.' },
        { id: 'RANDOMX', label: 'RandomX General Compute (+Ethash)', blurb: 'Hybrid L1/cache compute bias for Monero.' },
        { id: 'SHA256', label: 'SHA-256 CUDA/Optical Hash Core', blurb: 'Integer ALU optimization for SHA-256 workloads.' },
        { id: 'QHASH', label: 'QHash Quantum-Hybrid Kernel', blurb: 'Post-quantum lattice proof tensor pipeline for QBC.' },
      ];
    }
    return [
      { id: 'SHA256', label: 'SHA256 (Bitcoin Core ASIC/Gateware)', blurb: 'High-difficulty TH/s–PH/s SHA-256 hashing.' },
      { id: 'SCRYPT', label: 'SCRYPT (Litecoin / Dogecoin)', blurb: 'Memory-hard GH/s Scrypt pipeline.' },
      { id: 'RANDOMX', label: 'RANDOMX (Monero L3 Cache)', blurb: 'Low-wattage CPU/Gateware cache lane.' },
      { id: 'ETHASH', label: 'ETHASH (DAG Compute Engine)', blurb: 'Wide-bus DAG hashing core.' },
      { id: 'KAWPOW', label: 'KAWPOW (Ravencoin ProgPoW Core)', blurb: 'ProgPoW DAG + high-bandwidth memory core.' },
      { id: 'EQUIHASH', label: 'EQUIHASH (Zcash Memory-Hard Core)', blurb: 'Solver array for Zcash Equihash proofs.' },
      { id: 'POST', label: 'POST (Chia Co-Processor)', blurb: 'Compression & lookup accelerator for PoST.' },
      { id: 'QHASH', label: 'QHASH (QubitCoin Post-Quantum Core)', blurb: 'Native lattice / quantum-resistant QHash core.' },
    ];
  }
  if (category === 'chassis') {
    if (architecture === 'ASIC_BLADE_SHELF') {
      return [
        { id: 'SINGLE_BLADE', label: 'High-Airflow 1-Blade ASIC Bay', blurb: 'Compact, cool, quiet 1-blade ASIC rack.' },
        { id: 'HYDRO_BAY', label: 'Industrial Hydro / Cryo ASIC Shelf', blurb: 'Extra -18°C chassis cooling for 6–12 kW custom ASICs/QPUs.' },
      ];
    }
    if (architecture === 'CONVERGED_SUPER') {
      return [
        { id: 'HYBRID_8_1', label: '8-GPU + 1-ASIC Converged Pod', blurb: 'Accepts BOTH multi-GPU rigs and custom ASIC blades.' },
        { id: 'HYBRID_10_1', label: '10-GPU + 1-ASIC Hyperscale Pod', blurb: 'Maximum density converged AI + ASIC chassis.' },
        { id: 'HYBRID_CRYO_6_1', label: 'Gen-7 Cryo 6-QGPU + 1-QPU Bay', blurb: 'Cryo-rated superconducting bay for Quantum ASICs + accelerators.' },
        { id: 'HYBRID_OPTICAL_8_1', label: 'Gen-7 Optical 8-QGPU + 1-Photonic Bay', blurb: 'All-optical WDM backplane for Photonic ASICs + QGPUs.' },
      ];
    }
    return [
      { id: 'GPU_6', label: '6-Slot Compact Frame', blurb: 'Low base watts & strong thermal margin.' },
      { id: 'GPU_8', label: '8-Slot Standard Mining Frame', blurb: 'Balanced multi-GPU density.' },
      { id: 'GPU_12', label: '12-Slot Ultra-Dense Rack', blurb: 'Maximum GPU slots per bay (higher base draw).' },
    ];
  }
  if (category === 'storage') {
    return [
      { id: 'BANDWIDTH_EFF', label: 'High-Bandwidth ECC RAM Focus', blurb: 'Maximizes +% rig efficiency bonus across all coins.' },
      { id: 'CHIA_VAULT', label: 'Petabyte Chia PoST Vault Focus', blurb: 'Maximizes raw TB storage for huge XCH yield.' },
      { id: 'BALANCED_ARRAY', label: 'Balanced NVMe + Cache Array', blurb: 'Strong mix of TB storage and efficiency bonus.' },
    ];
  }
  if (category === 'psu') {
    return [
      { id: 'HIGH_WATTS', label: 'Max Capacity Rail (High kW)', blurb: 'Pushes maxWatts cap as high as possible.' },
      { id: 'ULTRA_EFF', label: 'Ultra-Efficiency Stage (Lowest Loss)', blurb: 'Maximizes PSU efficiency (up to 99.6%) & quietness.' },
      { id: 'BALANCED_RAIL', label: 'Balanced Industrial Rail', blurb: 'Solid headroom and 95%–98.8% efficiency.' },
    ];
  }
  if (category === 'cooling') {
    return [
      { id: 'MAX_THERMAL', label: 'Maximum -°C Heat Extraction', blurb: 'Maximum coolingPowerC for extreme 150% overclocks.' },
      { id: 'SILENT_FLOW', label: 'Acoustic-Damped Low-dBA Mode', blurb: 'Minimizes noiseDba and pump watts.' },
      { id: 'BALANCED_THERMAL', label: 'Balanced Static-Flow Curve', blurb: 'Strong cooling per watt & moderate footprint.' },
      { id: 'CRYO_LOOP', label: 'Cryo-Rated Sub-Zero Dilution Loop', blurb: 'Cryo-rated thermal loop required for Gen-7 Quantum QPUs.' },
    ];
  }
  // OS
  return [
    { id: 'MAX_HASH', label: 'Aggressive Hash Scheduler', blurb: 'Pushes hashrateMultiplier to maximum.' },
    { id: 'ECO_GOV', label: 'Undervolt Power Governor', blurb: 'Cuts powerMultiplier steeply for tight breakers.' },
    { id: 'ZERO_FAULT', label: 'Deterministic Watchdog Kernel', blurb: 'Maximizes stabilityBonus & lowers wear.' },
  ];
}

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

export function getPresetEngineeringForProfile(
  profile: DesignProfile,
  budget = 10
): FabEngineeringAllocation {
  const clamp = (v: number) => Math.max(0, Math.min(5, v));
  if (profile === 'PERF') {
    return {
      density: clamp(Math.min(5, Math.ceil(budget * 0.45))),
      efficiency: 1,
      thermals: 2,
      reliability: clamp(budget - Math.min(5, Math.ceil(budget * 0.45)) - 3),
    };
  }
  if (profile === 'EFF') {
    return {
      density: 2,
      efficiency: clamp(Math.min(5, Math.ceil(budget * 0.45))),
      thermals: 2,
      reliability: clamp(budget - 4 - Math.min(5, Math.ceil(budget * 0.45))),
    };
  }
  if (profile === 'COMPACT') {
    return {
      density: 1,
      efficiency: 3,
      thermals: clamp(Math.min(5, Math.ceil(budget * 0.45))),
      reliability: clamp(budget - 4 - Math.min(5, Math.ceil(budget * 0.45))),
    };
  }
  const base = Math.floor(budget / 4);
  const rem = budget - base * 4;
  return {
    density: clamp(base + (rem > 0 ? 1 : 0)),
    efficiency: clamp(base + (rem > 1 ? 1 : 0)),
    thermals: clamp(base + (rem > 2 ? 1 : 0)),
    reliability: clamp(base),
  };
}

function qualityGradeFromRoll(roll: number): { grade: ChipQualityGrade; mult: number } {
  if (roll >= 0.85) return { grade: 'A', mult: 1.06 };
  if (roll >= 0.4) return { grade: 'B', mult: 1 };
  return { grade: 'C', mult: 0.94 };
}

const NODE_RESEARCH: Record<ChipProcessNode, string> = {
  '7nm': 'res_asic_tapeout',
  '5nm': 'res_gen3_silicon',
  '3nm': 'res_gen4_hyperhash',
  '2nm': 'res_gen5_exascale',
  '1nm': 'res_gen6_ai_convergence',
  photonic: 'res_gen7_quantum_photonic',
};

const NODE_GENERATION: Record<ChipProcessNode, HardwareGen> = {
  '7nm': 3,
  '5nm': 4,
  '3nm': 4,
  '2nm': 5,
  '1nm': 6,
  photonic: 7,
};

export const NODE_SPECS: Record<
  ChipProcessNode,
  {
    gradeLabel: string;
    nreUsd: number;
    unitCostUsd: number;
    gpuBaseCost: number;
    waferSteps: number;
    wholesaleMult: number;
    asicWatts: number;
    asicHeatC: number;
    compactWatts: number;
    compactHeatC: number;
    gpuEthash: number;
    gpuWatts: number;
    gpuHeatC: number;
    chassisBaseCost: number;
    storageBaseCost: number;
    psuBaseCost: number;
    coolingBaseCost: number;
    osBaseCost: number;
  }
> = {
  '7nm': {
    gradeLabel: '7nm / Gen-3 Industrial',
    nreUsd: 5500,
    unitCostUsd: 4800,
    gpuBaseCost: 3400,
    waferSteps: 4,
    wholesaleMult: 1.46,
    asicWatts: 2950,
    asicHeatC: 64,
    compactWatts: 340,
    compactHeatC: 36,
    gpuEthash: 130,
    gpuWatts: 290,
    gpuHeatC: 33,
    chassisBaseCost: 3200,
    storageBaseCost: 2900,
    psuBaseCost: 2400,
    coolingBaseCost: 2600,
    osBaseCost: 2100,
  },
  '5nm': {
    gradeLabel: '5nm / Gen-3+ Precision',
    nreUsd: 9500,
    unitCostUsd: 8600,
    gpuBaseCost: 5900,
    waferSteps: 5,
    wholesaleMult: 1.48,
    asicWatts: 3350,
    asicHeatC: 66,
    compactWatts: 410,
    compactHeatC: 40,
    gpuEthash: 165,
    gpuWatts: 340,
    gpuHeatC: 36,
    chassisBaseCost: 4800,
    storageBaseCost: 5400,
    psuBaseCost: 3600,
    coolingBaseCost: 3900,
    osBaseCost: 2900,
  },
  '3nm': {
    gradeLabel: '3nm / Gen-4 Hydro',
    nreUsd: 22000,
    unitCostUsd: 26000,
    gpuBaseCost: 19500,
    waferSteps: 7,
    wholesaleMult: 1.5,
    asicWatts: 4300,
    asicHeatC: 68,
    compactWatts: 520,
    compactHeatC: 44,
    gpuEthash: 220,
    gpuWatts: 390,
    gpuHeatC: 38,
    chassisBaseCost: 17500,
    storageBaseCost: 19000,
    psuBaseCost: 14500,
    coolingBaseCost: 16500,
    osBaseCost: 13000,
  },
  '2nm': {
    gradeLabel: '2nm / Gen-5 Exascale',
    nreUsd: 72000,
    unitCostUsd: 132000,
    gpuBaseCost: 112000,
    waferSteps: 8,
    wholesaleMult: 1.54,
    asicWatts: 5200,
    asicHeatC: 70,
    compactWatts: 640,
    compactHeatC: 48,
    gpuEthash: 465,
    gpuWatts: 455,
    gpuHeatC: 41,
    chassisBaseCost: 92000,
    storageBaseCost: 105000,
    psuBaseCost: 84000,
    coolingBaseCost: 88000,
    osBaseCost: 74000,
  },
  '1nm': {
    gradeLabel: '1nm / Gen-6 AI Fabric',
    nreUsd: 260000,
    unitCostUsd: 540000,
    gpuBaseCost: 510000,
    waferSteps: 10,
    wholesaleMult: 1.58,
    asicWatts: 6800,
    asicHeatC: 68,
    compactWatts: 760,
    compactHeatC: 46,
    gpuEthash: 1020,
    gpuWatts: 520,
    gpuHeatC: 42,
    chassisBaseCost: 460000,
    storageBaseCost: 510000,
    psuBaseCost: 430000,
    coolingBaseCost: 470000,
    osBaseCost: 410000,
  },
  photonic: {
    gradeLabel: 'Photonic / Gen-7 Quantum',
    nreUsd: 920000,
    unitCostUsd: 2350000,
    gpuBaseCost: 2150000,
    waferSteps: 12,
    wholesaleMult: 1.62,
    asicWatts: 8200,
    asicHeatC: 64,
    compactWatts: 620,
    compactHeatC: 36,
    gpuEthash: 2250,
    gpuWatts: 560,
    gpuHeatC: 38,
    chassisBaseCost: 1950000,
    storageBaseCost: 2100000,
    psuBaseCost: 1850000,
    coolingBaseCost: 1900000,
    osBaseCost: 1750000,
  },
};

const BASE_ALGO_HASHRATES: Record<MiningAlgorithm, Record<ChipProcessNode, number>> = {
  SHA256: {
    '7nm': 125_000_000,
    '5nm': 240_000_000,
    '3nm': 510_000_000,
    '2nm': 1_550_000_000,
    '1nm': 4_400_000_000,
    photonic: 12_800_000_000,
  },
  SCRYPT: {
    '7nm': 14_500,
    '5nm': 24_000,
    '3nm': 46_000,
    '2nm': 115_000,
    '1nm': 295_000,
    photonic: 790_000,
  },
  RANDOMX: {
    '7nm': 0.072,
    '5nm': 0.098,
    '3nm': 0.14,
    '2nm': 0.28,
    '1nm': 0.62,
    photonic: 1.55,
  },
  ETHASH: {
    '7nm': 260,
    '5nm': 420,
    '3nm': 640,
    '2nm': 960,
    '1nm': 1550,
    photonic: 2450,
  },
  KAWPOW: {
    '7nm': 110,
    '5nm': 185,
    '3nm': 295,
    '2nm': 640,
    '1nm': 1850,
    photonic: 6400,
  },
  EQUIHASH: {
    '7nm': 460,
    '5nm': 890,
    '3nm': 1800,
    '2nm': 4200,
    '1nm': 8800,
    photonic: 22000,
  },
  POST: {
    '7nm': 340,
    '5nm': 520,
    '3nm': 760,
    '2nm': 1400,
    '1nm': 2750,
    photonic: 5400,
  },
  QHASH: {
    '7nm': 12,
    '5nm': 24,
    '3nm': 48,
    '2nm': 110,
    '1nm': 280,
    photonic: 6800,
  },
};

export function getFabEngineeringPointBudget(
  state: Pick<GameState, 'unlockedResearch' | 'devUnlockAll'>
): number {
  if (state.devUnlockAll) return 14;
  let budget = 10;
  if (state.unlockedResearch.includes('res_gen4_hyperhash')) budget += 1;
  if (state.unlockedResearch.includes('res_gen5_exascale')) budget += 1;
  if (state.unlockedResearch.includes('res_gen6_ai_convergence')) budget += 1;
  if (state.unlockedResearch.includes('res_gen7_quantum_photonic')) budget += 1;
  return budget;
}

export function getUnlockedFabCategories(
  state: Pick<GameState, 'unlockedResearch' | 'devUnlockAll'>
): FabCategorySpec[] {
  if (state.devUnlockAll) return FAB_CATEGORY_SPECS;
  return FAB_CATEGORY_SPECS.filter(
    (c) => !c.researchRequired || state.unlockedResearch.includes(c.researchRequired)
  );
}

export function getUnlockedFabArchitectures(
  state: Pick<GameState, 'unlockedResearch' | 'devUnlockAll'>,
  category: PartCategory
): FabArchitectureSpec[] {
  const all = FAB_ARCHITECTURES.filter((a) => a.category === category);
  if (state.devUnlockAll) return all;
  return all.filter(
    (a) => !a.researchRequired || state.unlockedResearch.includes(a.researchRequired)
  );
}

export function getNodeRequiredResearchForCategory(
  _category: PartCategory,
  node: ChipProcessNode
): string | undefined {
  if (node === '7nm' || node === '5nm') return 'res_wafer_lithography';
  return NODE_RESEARCH[node];
}

export function getUnlockedFabNodes(
  state: Pick<GameState, 'unlockedResearch' | 'devUnlockAll'>,
  category: PartCategory
): ChipProcessNode[] {
  const nodes: ChipProcessNode[] = ['7nm', '5nm', '3nm', '2nm', '1nm', 'photonic'];
  if (state.devUnlockAll) return nodes;
  return nodes.filter((n) => {
    const req = getNodeRequiredResearchForCategory(category, n);
    return !req || state.unlockedResearch.includes(req);
  });
}

export function getUnlockedFabSubFeatures(
  state: Pick<GameState, 'unlockedResearch' | 'devUnlockAll'>
): FabSubFeatureSpec[] {
  if (state.devUnlockAll) return FAB_SUBFEATURES;
  return FAB_SUBFEATURES.filter(
    (f) => !f.researchRequired || state.unlockedResearch.includes(f.researchRequired)
  );
}

export function buildDefaultFab(prev?: Partial<FabState>): FabState {
  return {
    linesCount:
      typeof prev?.linesCount === 'number' && Number.isFinite(prev.linesCount)
        ? Math.max(0, Math.min(3, Math.floor(prev.linesCount)))
        : 0,
    blueprints: Array.isArray(prev?.blueprints) ? prev.blueprints : [],
    draftBlueprints: Array.isArray(prev?.draftBlueprints) ? prev.draftBlueprints : [],
    productionQueue: Array.isArray(prev?.productionQueue) ? prev.productionQueue : [],
    inventory: Array.isArray(prev?.inventory) ? prev.inventory : [],
    batchRecords: Array.isArray(prev?.batchRecords) ? prev.batchRecords : [],
    serialRegistry: Array.isArray(prev?.serialRegistry) ? prev.serialRegistry : [],
    manufacturingHistory: Array.isArray(prev?.manufacturingHistory) ? prev.manufacturingHistory : [],
    nextBatchSeq: typeof prev?.nextBatchSeq === 'number' ? prev.nextBatchSeq : 1,
    nextSerialSeq: typeof prev?.nextSerialSeq === 'number' ? prev.nextSerialSeq : 1,
    totalUnitsManufactured:
      typeof prev?.totalUnitsManufactured === 'number' ? prev.totalUnitsManufactured : 0,
    totalUnitsScrapped: typeof prev?.totalUnitsScrapped === 'number' ? prev.totalUnitsScrapped : 0,
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

function appendFabHistory(
  history: ManufacturingHistoryEntry[] | undefined,
  step: number,
  kind: ManufacturingHistoryEntry['kind'],
  summary: string
): ManufacturingHistoryEntry[] {
  const entry: ManufacturingHistoryEntry = {
    id: `fabhist_${step}_${kind}_${Math.random().toString(36).slice(2, 6)}`,
    step,
    stepLabel: formatStepLabel(step),
    kind,
    summary,
  };
  return [entry, ...(history ?? [])].slice(0, 120);
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
    title: `Foundry Fab Line #${nextLines} Online`,
    detail: `Manufacturing throughput increased to ${nextLines}x/step (+${formatUsd(
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
    )} (${nextLines}x parallel manufacturing speed).`,
  };
}

export function getDefaultComponentParams(
  category: PartCategory,
  processNode: ChipProcessNode,
  branch?: TechBranch
): FabComponentParams {
  const effectiveBranch: TechBranch =
    branch ?? (processNode === 'photonic' ? 'PHOTONIC' : 'SILICON');
  if (category === 'compute') {
    if (effectiveBranch === 'QUANTUM') {
      return {
        branch: 'QUANTUM',
        layoutTopology: 'CHIPLET_QUAD',
        qubitTopology: 'SURFACE_CODE',
        logicalQubits: 512,
        coherenceTimeUs: 450,
        cryoTargetMk: 20,
        voltageBiasPct: 100,
        clockBiasPct: 100,
      };
    }
    if (effectiveBranch === 'PHOTONIC') {
      return {
        branch: 'PHOTONIC',
        layoutTopology: 'MESH_TENSOR',
        waveguideLanes: 24,
        laserWavelengthNm: 1550,
        wdmChannels: 16,
        opticalSwitchMode: 'MZ_INTERFERO',
        voltageBiasPct: 100,
        clockBiasPct: 100,
      };
    }
    return {
      branch: 'SILICON',
      layoutTopology: 'MONOLITHIC',
      memoryBusWidth: 256,
      sramCacheMb: 64,
      voltageBiasPct: 100,
      clockBiasPct: 100,
    };
  }
  if (category === 'gpu') {
    return {
      branch: effectiveBranch,
      gpuComputeArch: effectiveBranch === 'PHOTONIC' ? 'OPTICAL_SHADER' : 'SIMD_DENSE',
      vramType: effectiveBranch === 'PHOTONIC' ? 'OPTICAL_MEM' : processNode === '1nm' || processNode === '2nm' ? 'HBM3' : 'GDDR6X',
      vramGb: processNode === 'photonic' ? 96 : processNode === '1nm' ? 48 : processNode === '2nm' ? 32 : 16,
      workloadBias: effectiveBranch !== 'SILICON' ? 'AI_CONVERGED' : 'ETHASH_DAG',
      voltageBiasPct: 100,
      clockBiasPct: 100,
    };
  }
  if (category === 'chassis') {
    return {
      branch: effectiveBranch,
      hybridAsicSupport: effectiveBranch !== 'SILICON',
      isCryoRated: effectiveBranch === 'QUANTUM',
      isOpticalBackplane: effectiveBranch === 'PHOTONIC',
    };
  }
  if (category === 'storage') {
    return { branch: effectiveBranch, eccDepth: 2 };
  }
  if (category === 'psu') {
    return { branch: effectiveBranch, railPhases: 12 };
  }
  if (category === 'cooling') {
    return {
      branch: effectiveBranch,
      flowGeometry: effectiveBranch === 'QUANTUM' ? 'CRYO_CASCADE' : 'JET_IMPINGEMENT',
      isCryoRated: effectiveBranch === 'QUANTUM',
    };
  }
  return { branch: effectiveBranch, schedulerTickHz: 1000 };
}

export function computeManufacturabilityPct(
  processNode: ChipProcessNode,
  partCategory: PartCategory,
  eng: FabEngineeringAllocation,
  params: FabComponentParams,
  researcherSkill: number,
  subFeature: FabSubFeatureId
): number {
  const nodeBase: Record<ChipProcessNode, number> = {
    '7nm': 92,
    '5nm': 89,
    '3nm': 85,
    '2nm': 81,
    '1nm': 77,
    photonic: 74,
  };
  let score = nodeBase[processNode] ?? 84;
  score += Math.max(0, eng.reliability - 2) * 3.5;
  score -= Math.max(0, eng.density - 3) * 2.5;
  if (subFeature === 'ECC_SHIELD') score += 4;
  if (subFeature === 'REDUNDANT_VRM') score += 3;
  score += Math.max(0, researcherSkill - 1) * 2.2;

  if (params.layoutTopology === 'CHIPLET_QUAD') score -= 4;
  if (params.layoutTopology === 'MESH_TENSOR') score -= 7;
  if ((params.clockBiasPct ?? 100) > 105) score -= ((params.clockBiasPct ?? 100) - 105) * 0.65;
  if ((params.voltageBiasPct ?? 100) > 105) score -= ((params.voltageBiasPct ?? 100) - 105) * 0.55;

  if (partCategory === 'compute' && params.branch === 'QUANTUM') {
    const q = params.logicalQubits ?? 512;
    if (q > 1024) score -= 7;
    if (params.qubitTopology === 'TOPOLOGICAL_BRAID') score -= 5;
  }
  if (partCategory === 'compute' && params.branch === 'PHOTONIC') {
    const w = params.wdmChannels ?? 16;
    if (w > 24) score -= 5;
  }
  if (partCategory === 'gpu' && (params.vramGb ?? 16) >= 64) {
    score -= 4;
  }

  return Math.round(Math.max(38, Math.min(99, score)));
}

export interface CustomBlueprintDesignInput {
  name: string;
  partCategory: PartCategory;
  architecture: FabArchitectureId;
  processNode: ChipProcessNode;
  focus: string;
  branch?: TechBranch;
  engineering?: FabEngineeringAllocation;
  componentParams?: FabComponentParams;
  subFeature?: FabSubFeatureId;
  profile?: DesignProfile;
}

export interface CustomBlueprintPreviewResult {
  ok: boolean;
  reason?: string;
  nreCostUsd: number;
  waferSteps: number;
  designProfile: DesignProfile;
  qualityGrade: ChipQualityGrade;
  qualityMult: number;
  manufacturabilityPct: number;
  branch: TechBranch;
  engineering: FabEngineeringAllocation;
  componentParams: FabComponentParams;
  subFeature: FabSubFeatureId;
  spec: CustomComponentSpec;
  algo: MiningAlgorithm;
  primaryHashRate: number;
  primaryWatts: number;
  primaryHeatC: number;
}

export function previewCustomComponentDesign(
  state: GameState,
  input: CustomBlueprintDesignInput,
  blueprintIdPreview = 'bp_preview'
): CustomBlueprintPreviewResult {
  const { partCategory, architecture, processNode, focus } = input;
  const spec = NODE_SPECS[processNode] ?? NODE_SPECS['7nm'];
  const subSpec =
    FAB_SUBFEATURES.find((f) => f.id === (input.subFeature ?? 'STD')) ?? FAB_SUBFEATURES[0];
  const profile = input.profile ?? 'BALANCED';
  const profileSpec = DESIGN_PROFILE_SPECS[profile] ?? DESIGN_PROFILE_SPECS.BALANCED;
  const budget = getFabEngineeringPointBudget(state);
  const rawEng = input.engineering ?? { density: 2, efficiency: 2, thermals: 2, reliability: 2 };
  const clampPt = (v: number) => Math.max(0, Math.min(5, Math.floor(v)));
  const eng: FabEngineeringAllocation = {
    density: clampPt(rawEng.density),
    efficiency: clampPt(rawEng.efficiency),
    thermals: clampPt(rawEng.thermals),
    reliability: clampPt(rawEng.reliability),
  };

  const inferredBranch: TechBranch =
    input.branch ??
    input.componentParams?.branch ??
    (processNode === 'photonic'
      ? focus.toUpperCase() === 'QHASH' &&
        state.unlockedResearch.includes('res_gen7_quantum_coherence') &&
        !state.unlockedResearch.includes('res_gen7_photonic_waveguides')
        ? 'QUANTUM'
        : 'PHOTONIC'
      : 'SILICON');

  const params: FabComponentParams = {
    ...getDefaultComponentParams(partCategory, processNode, inferredBranch),
    ...(input.componentParams ?? {}),
    branch: inferredBranch,
  };

  const failRes = (reason: string): CustomBlueprintPreviewResult => ({
    ok: false,
    reason,
    nreCostUsd: 0,
    waferSteps: spec.waferSteps,
    designProfile: profile,
    qualityGrade: 'B',
    qualityMult: 1,
    manufacturabilityPct: 0,
    branch: inferredBranch,
    engineering: eng,
    componentParams: params,
    subFeature: subSpec.id,
    spec: {
      blueprintId: blueprintIdPreview,
      partCategory,
      architecture,
      subFeature: subSpec.id,
      branch: inferredBranch,
      name: input.name,
      processNode,
      generation: NODE_GENERATION[processNode],
      unitCostUsd: 0,
      wholesaleValueUsd: 0,
    },
    algo: 'SHA256',
    primaryHashRate: 0,
    primaryWatts: 0,
    primaryHeatC: 0,
  });

  const usedPts = eng.density + eng.efficiency + eng.thermals + eng.reliability;
  if (usedPts > budget) {
    return failRes(`Engineering points exceed budget (${usedPts}/${budget}).`);
  }

  const gate = isFabUnlocked(state);
  if (!gate.ok) return failRes(gate.reason ?? 'Foundry locked.');

  const fab = buildDefaultFab(state.fab);
  if (fab.linesCount < 1) {
    return failRes('Commission Fab Line #1 first ("fab line build").');
  }

  const nodeResearchId = getNodeRequiredResearchForCategory(partCategory, processNode);
  if (nodeResearchId && !state.devUnlockAll && !state.unlockedResearch.includes(nodeResearchId)) {
    const node = RESEARCH_NODES.find((n) => n.id === nodeResearchId);
    return failRes(`${processNode} process requires R&D "${node?.name ?? nodeResearchId}".`);
  }

  // Distinct Gen-7 branch R&D gates when targeting explicit Quantum vs Photonic sub-parameters
  if (
    processNode === 'photonic' &&
    inferredBranch === 'QUANTUM' &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes('res_gen7_quantum_coherence') &&
    !state.unlockedResearch.includes('res_gen7_quantum_photonic')
  ) {
    return failRes('Quantum branch requires R&D "Quantum Coherence & Surface-Code QPU".');
  }
  if (
    inferredBranch === 'QUANTUM' &&
    params.qubitTopology === 'TOPOLOGICAL_BRAID' &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes('res_gen7_quantum_coherence')
  ) {
    return failRes('Topological Braid Qubit topology requires R&D "Quantum Coherence & Surface-Code QPU".');
  }
  if (
    inferredBranch === 'PHOTONIC' &&
    (params.wdmChannels ?? 16) > 20 &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes('res_gen7_photonic_waveguides')
  ) {
    return failRes('Dense WDM (>20 channels) requires R&D "Silicon-Photonic WDM Waveguides".');
  }

  const archSpec = FAB_ARCHITECTURES.find(
    (a) => a.id === architecture && a.category === partCategory
  );
  if (!archSpec) {
    return failRes(`Architecture "${architecture}" is invalid for ${partCategory}.`);
  }
  if (
    archSpec.researchRequired &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes(archSpec.researchRequired)
  ) {
    const node = RESEARCH_NODES.find((n) => n.id === archSpec.researchRequired);
    return failRes(`${archSpec.label} requires R&D "${node?.name ?? archSpec.researchRequired}".`);
  }
  if (
    subSpec.researchRequired &&
    !state.devUnlockAll &&
    !state.unlockedResearch.includes(subSpec.researchRequired)
  ) {
    const node = RESEARCH_NODES.find((n) => n.id === subSpec.researchRequired);
    return failRes(`${subSpec.label} requires R&D "${node?.name ?? subSpec.researchRequired}".`);
  }

  const cleanName = input.name.trim().slice(0, 28);
  if (!cleanName) {
    return failRes('Provide a blueprint name.');
  }

  const maxResearcherSkill = (state.employees ?? [])
    .filter((e) => e.role === 'RESEARCHER')
    .reduce((m, e) => Math.max(m, e.skillLevel ?? 1), 1);
  const skillBonusMult = 1 + Math.max(0, maxResearcherSkill - 1) * 0.05;
  const yieldCut = state.unlockedResearch.includes('res_wafer_lithography') ? 0.94 : 1.0;

  const densDelta = eng.density - 2;
  const effDelta = eng.efficiency - 2;
  const thermDelta = eng.thermals - 2;
  const relDelta = eng.reliability - 2;

  const clockRatio = Math.max(0.85, Math.min(1.25, (params.clockBiasPct ?? 100) / 100));
  const voltRatio = Math.max(0.85, Math.min(1.2, (params.voltageBiasPct ?? 100) / 100));
  const layoutMult =
    params.layoutTopology === 'MESH_TENSOR'
      ? 1.15
      : params.layoutTopology === 'CHIPLET_QUAD'
      ? 1.09
      : 1.0;
  const layoutCostMult =
    params.layoutTopology === 'MESH_TENSOR'
      ? 1.12
      : params.layoutTopology === 'CHIPLET_QUAD'
      ? 1.06
      : 1.0;

  const densOutputMult = (1 + densDelta * 0.065) * layoutMult * (0.9 + clockRatio * 0.1);
  const effWattMult = Math.max(
    0.7,
    (1 - effDelta * 0.055) * Math.pow(voltRatio, 1.45) * (0.92 + clockRatio * 0.08)
  );
  const thermHeatMult = Math.max(
    0.68,
    (1 - thermDelta * 0.07) * Math.pow(voltRatio, 1.3)
  );
  const thermNoiseDelta = -thermDelta * 2 + subSpec.noiseDelta;
  const engCostMult = Math.max(
    0.88,
    (1 + densDelta * 0.045 + effDelta * 0.04 + thermDelta * 0.03 + relDelta * 0.04) * layoutCostMult
  );

  const rawRoll = createSeededRng(
    `${state.runSeed}|proto|${cleanName}|${partCategory}|${architecture}|${focus}|${processNode}|${profile}|${subSpec.id}|${inferredBranch}`
  )();
  const floorLift = Math.max(0, relDelta * 0.05 + subSpec.qualityFloorBoost);
  const boostedRoll = Math.min(0.999, rawRoll + floorLift * (1 - rawRoll));
  const { grade: qualityGrade, mult: gradeMult } = qualityGradeFromRoll(boostedRoll);
  const qualityMult = Number(
    (gradeMult * (0.94 + Math.min(1, Math.max(0, boostedRoll)) * 0.06)).toFixed(4)
  );

  const wearResistance = Number(
    Math.max(
      0,
      Math.min(
        0.4,
        Math.max(0, relDelta) * 0.05 +
          subSpec.wearResistance +
          ((params.eccDepth ?? 1) - 1) * 0.02
      )
    ).toFixed(2)
  );
  const wholesalePrestigeMult = 1 + Math.max(0, relDelta) * 0.04;
  const manufacturabilityPct = computeManufacturabilityPct(
    processNode,
    partCategory,
    eng,
    params,
    maxResearcherSkill,
    subSpec.id
  );

  const nodeMult =
    processNode === '7nm'
      ? 1.0
      : processNode === '5nm'
      ? 1.28
      : processNode === '3nm'
      ? 1.65
      : processNode === '2nm'
      ? 2.15
      : processNode === '1nm'
      ? 2.85
      : 3.75;
  const generation = NODE_GENERATION[processNode];

  const waferSteps = Math.max(
    2,
    spec.waferSteps +
      (partCategory === 'chassis' || partCategory === 'os' ? -1 : 0) +
      (eng.reliability >= 4 ? 1 : 0)
  );

  const nreBase =
    partCategory === 'compute'
      ? spec.nreUsd
      : partCategory === 'gpu'
      ? Math.round(spec.nreUsd * 0.85)
      : partCategory === 'chassis'
      ? Math.round(spec.nreUsd * 0.55)
      : partCategory === 'storage'
      ? Math.round(spec.nreUsd * 0.65)
      : partCategory === 'psu'
      ? Math.round(spec.nreUsd * 0.5)
      : partCategory === 'cooling'
      ? Math.round(spec.nreUsd * 0.6)
      : Math.round(spec.nreUsd * 0.45);
  const nreCostUsd = Math.round((nreBase + subSpec.nreAddUsd) * layoutCostMult);

  let baseUnitUsd =
    partCategory === 'compute'
      ? spec.unitCostUsd
      : partCategory === 'gpu'
      ? spec.gpuBaseCost
      : partCategory === 'chassis'
      ? spec.chassisBaseCost
      : partCategory === 'storage'
      ? spec.storageBaseCost
      : partCategory === 'psu'
      ? spec.psuBaseCost
      : partCategory === 'cooling'
      ? spec.coolingBaseCost
      : spec.osBaseCost;

  let algo: MiningAlgorithm = 'SHA256';
  let primaryHashRate = 0;
  let primaryWatts = 0;
  let primaryHeatC = 0;

  let customSpec: CustomComponentSpec = {
    blueprintId: blueprintIdPreview,
    revisionNumber: 1,
    partCategory,
    architecture,
    subFeature: subSpec.id,
    branch: inferredBranch,
    name: cleanName,
    processNode,
    generation,
    unitCostUsd: 0,
    wholesaleValueUsd: 0,
    qualityGrade,
    qualityRoll: qualityMult,
    wearResistance,
    manufacturabilityPct,
    componentParams: params,
  };

  if (partCategory === 'compute') {
    const validAlgos: MiningAlgorithm[] = [
      'SHA256',
      'SCRYPT',
      'RANDOMX',
      'ETHASH',
      'KAWPOW',
      'EQUIHASH',
      'POST',
      'QHASH',
    ];
    algo = (validAlgos.includes(focus.toUpperCase() as MiningAlgorithm)
      ? focus.toUpperCase()
      : 'SHA256') as MiningAlgorithm;

    const archHashMult =
      architecture === 'ASIC_BLADE'
        ? 1.0
        : architecture === 'HYBRID_FPGA'
        ? 0.72
        : 0.55;
    const archWattMult =
      architecture === 'ASIC_BLADE' ? 1.0 : architecture === 'HYBRID_FPGA' ? 0.42 : 0.22;
    const isPowerAsic =
      (algo === 'SHA256' || algo === 'SCRYPT' || algo === 'KAWPOW' || algo === 'QHASH') &&
      architecture === 'ASIC_BLADE';

    let branchMult = 1.0;
    let branchWattMult = 1.0;
    let branchHeatMult = 1.0;
    if (inferredBranch === 'QUANTUM') {
      const qubitFactor = 0.85 + Math.min(2048, params.logicalQubits ?? 512) / 2560;
      const topoMult =
        params.qubitTopology === 'TOPOLOGICAL_BRAID'
          ? 1.24
          : params.qubitTopology === 'ANNEAL_LATTICE'
          ? 1.12
          : 1.0;
      branchMult = qubitFactor * topoMult * (algo === 'QHASH' || algo === 'EQUIHASH' ? 1.25 : 1.0);
      branchWattMult = 1.06;
      branchHeatMult = 1.08;
    } else if (inferredBranch === 'PHOTONIC') {
      const wdmFactor = 0.88 + Math.min(32, params.wdmChannels ?? 16) / 64;
      const laneFactor = 0.92 + Math.min(64, params.waveguideLanes ?? 24) / 160;
      branchMult = wdmFactor * laneFactor * (algo === 'SHA256' || algo === 'KAWPOW' ? 1.14 : 1.0);
      branchWattMult = 0.82;
      branchHeatMult = 0.78;
    }

    const busMult =
      (algo === 'ETHASH' || algo === 'KAWPOW' || algo === 'EQUIHASH') &&
      (params.memoryBusWidth ?? 256) >= 512
        ? 1.16
        : 1.0;
    const sramMult =
      (algo === 'RANDOMX' || algo === 'QHASH') && (params.sramCacheMb ?? 64) >= 128 ? 1.18 : 1.0;

    const rawHash =
      BASE_ALGO_HASHRATES[algo][processNode] *
      archHashMult *
      skillBonusMult *
      profileSpec.hashMult *
      densOutputMult *
      subSpec.perfMult *
      qualityMult *
      branchMult *
      busMult *
      sramMult;
    primaryHashRate = algo === 'RANDOMX' ? Number(rawHash.toFixed(4)) : Math.round(rawHash);

    const baseW = isPowerAsic ? spec.asicWatts : spec.compactWatts;
    primaryWatts = Math.max(
      45,
      Math.round(
        baseW *
          archWattMult *
          profileSpec.wattMult *
          effWattMult *
          (1 + Math.max(0, densDelta) * 0.06) *
          subSpec.wattMult *
          branchWattMult
      )
    );
    const baseH = isPowerAsic ? spec.asicHeatC : spec.compactHeatC;
    primaryHeatC = Math.max(
      14,
      Math.round(baseH * profileSpec.heatMult * thermHeatMult * subSpec.heatMult * branchHeatMult)
    );
    const noise = Math.max(8, Math.round((isPowerAsic ? 32 : 16) + thermNoiseDelta));

    const hashrates: Partial<Record<MiningAlgorithm, number>> = { [algo]: primaryHashRate };
    if (architecture === 'HYBRID_FPGA') {
      const secAlgo: MiningAlgorithm = algo === 'SHA256' ? 'ETHASH' : 'SHA256';
      hashrates[secAlgo] = Math.round(BASE_ALGO_HASHRATES[secAlgo][processNode] * 0.25);
    } else if (architecture === 'CHIPLET_CPU' && algo !== 'RANDOMX') {
      hashrates.RANDOMX = Number((BASE_ALGO_HASHRATES.RANDOMX[processNode] * 0.4).toFixed(4));
    }

    if (architecture === 'CHIPLET_CPU') baseUnitUsd = Math.round(baseUnitUsd * 0.58);
    if (architecture === 'HYBRID_FPGA') baseUnitUsd = Math.round(baseUnitUsd * 0.86);

    customSpec = {
      ...customSpec,
      algo,
      computeKind:
        architecture === 'ASIC_BLADE'
          ? 'ASIC'
          : architecture === 'HYBRID_FPGA'
          ? 'FPGA'
          : 'CPU',
      requiresCryoCooling: inferredBranch === 'QUANTUM',
      requiresOpticalChassis: inferredBranch === 'PHOTONIC',
      hashrates,
      watts: primaryWatts,
      heatC: primaryHeatC,
      noiseDba: noise,
    };
  } else if (partCategory === 'gpu') {
    const validGpuAlgos: MiningAlgorithm[] = [
      'ETHASH',
      'KAWPOW',
      'EQUIHASH',
      'SCRYPT',
      'RANDOMX',
      'SHA256',
      'QHASH',
    ];
    algo = (validGpuAlgos.includes(focus.toUpperCase() as MiningAlgorithm)
      ? focus.toUpperCase()
      : 'ETHASH') as MiningAlgorithm;
    const archHashMult =
      architecture === 'HBM_MONSTER' ? 1.28 : architecture === 'LOW_VOLT_CARD' ? 0.88 : 1.06;
    const archWattMult =
      architecture === 'HBM_MONSTER' ? 1.15 : architecture === 'LOW_VOLT_CARD' ? 0.78 : 1.0;
    if (architecture === 'HBM_MONSTER') baseUnitUsd = Math.round(baseUnitUsd * 1.22);
    if (architecture === 'LOW_VOLT_CARD') baseUnitUsd = Math.round(baseUnitUsd * 0.94);

    const vramMult = params.vramType === 'OPTICAL_MEM' ? 1.18 : params.vramType === 'HBM3' ? 1.12 : 1.0;
    const gpuArchBoost =
      params.gpuComputeArch === 'OPTICAL_SHADER'
        ? 1.16
        : params.gpuComputeArch === 'TENSOR_MATRIX'
        ? 1.1
        : 1.0;
    const vramGb = Math.max(8, Math.min(128, params.vramGb ?? (processNode === 'photonic' ? 96 : 24)));

    const ethBase =
      spec.gpuEthash *
      archHashMult *
      vramMult *
      gpuArchBoost *
      skillBonusMult *
      profileSpec.hashMult *
      densOutputMult *
      subSpec.perfMult *
      qualityMult;
    const ethRate = Math.round(ethBase);
    const kawpowRate = Math.round(ethRate * (params.workloadBias === 'KAWPOW_ALU' ? 0.74 : 0.56));
    const equihashRate = Math.round(ethRate * (params.workloadBias === 'EQUIHASH_MEM' ? 13.5 : 9.8));
    const scryptRate = Number((ethRate * 0.017).toFixed(2));
    const rxRate = Number((ethRate * 0.00003).toFixed(4));
    const shaRate = Math.round(ethRate * 1.6);
    const qhashRate = Math.round(ethRate * (inferredBranch !== 'SILICON' ? 0.95 : 0.14));

    const hashrates: Partial<Record<MiningAlgorithm, number>> = {
      ETHASH: algo === 'ETHASH' ? ethRate : Math.round(ethRate * 0.75),
      KAWPOW: algo === 'KAWPOW' ? Math.round(kawpowRate * 1.25) : kawpowRate,
      EQUIHASH: algo === 'EQUIHASH' ? Math.round(equihashRate * 1.25) : equihashRate,
      SCRYPT: algo === 'SCRYPT' ? Number((scryptRate * 1.45).toFixed(2)) : scryptRate,
      RANDOMX: algo === 'RANDOMX' ? Number((rxRate * 1.45).toFixed(4)) : rxRate,
      ...(algo === 'SHA256' ? { SHA256: shaRate } : {}),
      ...(algo === 'QHASH' || inferredBranch !== 'SILICON' ? { QHASH: qhashRate } : {}),
    };
    primaryHashRate = hashrates[algo] ?? ethRate;
    primaryWatts = Math.max(
      95,
      Math.round(
        spec.gpuWatts *
          archWattMult *
          profileSpec.wattMult *
          effWattMult *
          (1 + Math.max(0, densDelta) * 0.06) *
          subSpec.wattMult
      )
    );
    primaryHeatC = Math.max(
      18,
      Math.round(spec.gpuHeatC * profileSpec.heatMult * thermHeatMult * subSpec.heatMult)
    );
    const noise = Math.max(
      8,
      Math.round((architecture === 'LOW_VOLT_CARD' ? 10 : 15) + thermNoiseDelta)
    );

    customSpec = {
      ...customSpec,
      algo,
      vramGb,
      requiresCryoCooling: inferredBranch === 'QUANTUM',
      requiresOpticalChassis:
        inferredBranch === 'PHOTONIC' || params.gpuComputeArch === 'OPTICAL_SHADER',
      hashrates,
      watts: primaryWatts,
      heatC: primaryHeatC,
      noiseDba: noise,
    };
  } else if (partCategory === 'chassis') {
    const isAsicRack = architecture === 'ASIC_BLADE_SHELF';
    const isConverged = architecture === 'CONVERGED_SUPER';
    const maxAsics = isAsicRack || isConverged ? 1 : 0;
    const baseGpuSlots =
      focus === 'GPU_12' || focus === 'HYBRID_10_1'
        ? focus === 'HYBRID_10_1'
          ? 10
          : 12
        : focus === 'HYBRID_CRYO_6_1' || focus === 'GPU_6'
        ? 6
        : isAsicRack
        ? 0
        : 8;
    const bonusSlot = !isAsicRack && eng.density >= 4 ? 1 : 0;
    const maxGpus = isAsicRack ? 0 : Math.min(14, baseGpuSlots + bonusSlot);
    const maxStorage = isConverged ? 14 : Math.max(6, maxGpus + 2);
    const baseWatts = Math.max(
      25,
      Math.round((isConverged ? 90 : isAsicRack ? 70 : 45) * effWattMult * profileSpec.wattMult)
    );
    const isCryoRated =
      Boolean(params.isCryoRated) ||
      focus === 'HYBRID_CRYO_6_1' ||
      inferredBranch === 'QUANTUM';
    const isOpticalBackplane =
      Boolean(params.isOpticalBackplane) ||
      focus === 'HYBRID_OPTICAL_8_1' ||
      inferredBranch === 'PHOTONIC';
    const coolingBonus = Math.round(
      (22 + nodeMult * 12 + (focus === 'HYDRO_BAY' || isCryoRated ? 18 : 0)) *
        (1 + thermDelta * 0.08) *
        (subSpec.id === 'GRAPHENE_TIM' ? 1.18 : 1)
    );
    const noiseMod = Math.round(
      (architecture === 'SEALED_BAFFLE' ? -14 : isConverged ? -6 : 2) + thermNoiseDelta * 0.7
    );
    if (isConverged) baseUnitUsd = Math.round(baseUnitUsd * 1.45);
    if (architecture === 'SEALED_BAFFLE') baseUnitUsd = Math.round(baseUnitUsd * 1.15);

    primaryHashRate = maxGpus > 0 ? maxGpus : coolingBonus;
    primaryWatts = baseWatts;
    primaryHeatC = -coolingBonus;
    const allowedBranches: TechBranch[] = ['SILICON'];
    if (isCryoRated) allowedBranches.push('QUANTUM');
    if (isOpticalBackplane) allowedBranches.push('PHOTONIC');

    customSpec = {
      ...customSpec,
      maxGpus,
      maxStorage,
      isAsicRack,
      maxAsics,
      supportsHybridAsicGpu: isConverged && maxAsics > 0 && maxGpus > 0,
      allowedBranches,
      isCryoRated,
      isOpticalBackplane,
      baseWatts,
      coolingBonus,
      noiseModifier: noiseMod,
    };
  } else if (partCategory === 'storage') {
    algo = 'POST';
    const eccBoost = ((params.eccDepth ?? 2) - 1) * 0.015;
    const ramBase = Math.round(32 * nodeMult * (focus === 'BANDWIDTH_EFF' ? 2 : 1));
    const tbBase =
      focus === 'CHIA_VAULT'
        ? 220 * nodeMult
        : focus === 'BALANCED_ARRAY'
        ? 110 * nodeMult
        : 16 * nodeMult;
    const storageTb = Number(
      (tbBase * densOutputMult * profileSpec.hashMult * subSpec.perfMult * qualityMult).toFixed(1)
    );
    const effBase =
      (focus === 'BANDWIDTH_EFF'
        ? 0.11 + nodeMult * 0.042
        : focus === 'BALANCED_ARRAY'
        ? 0.08 + nodeMult * 0.025
        : 0.06 + nodeMult * 0.015) + eccBoost;
    const efficiencyBonus = Number(
      Math.min(
        0.32,
        effBase * (1 + Math.max(0, effDelta) * 0.08) * (architecture === 'HIGH_BW_DDR' ? 1.18 : 1)
      ).toFixed(3)
    );
    primaryHashRate = storageTb;
    primaryWatts = Math.max(
      14,
      Math.round((25 + storageTb * 0.32) * effWattMult * profileSpec.wattMult * subSpec.wattMult)
    );
    primaryHeatC = Math.max(
      4,
      Math.round((6 + storageTb * 0.022) * thermHeatMult * profileSpec.heatMult * subSpec.heatMult)
    );
    if (focus === 'CHIA_VAULT') baseUnitUsd = Math.round(baseUnitUsd * 1.25);

    customSpec = {
      ...customSpec,
      algo: 'POST',
      ramGb: ramBase,
      storageTb,
      efficiencyBonus,
      watts: primaryWatts,
      heatC: primaryHeatC,
    };
  } else if (partCategory === 'psu') {
    const focusMult =
      focus === 'HIGH_WATTS' ? 1.28 : focus === 'ULTRA_EFF' ? 0.85 : 1.05;
    const archWattsMult =
      architecture === 'INDUSTRIAL_RAIL' ? 1.3 : architecture === 'SILENT_PASSIVE' ? 0.72 : 1.0;
    const phaseBoost = 1 + Math.max(0, (params.railPhases ?? 12) - 12) * 0.012;
    const maxWatts = Math.round(
      3400 *
        nodeMult *
        focusMult *
        archWattsMult *
        phaseBoost *
        densOutputMult *
        profileSpec.hashMult *
        subSpec.perfMult *
        qualityMult
    );
    const baseEff =
      architecture === 'GAN_HIGH_EFF' ? 0.96 : architecture === 'SILENT_PASSIVE' ? 0.945 : 0.94;
    const efficiency = Number(
      Math.min(
        0.996,
        baseEff +
          nodeMult * 0.009 +
          effDelta * 0.004 +
          (focus === 'ULTRA_EFF' ? 0.012 : 0) +
          (subSpec.id === 'REDUNDANT_VRM' ? 0.008 : 0)
      ).toFixed(3)
    );
    const noise = Math.max(
      1,
      Math.round((architecture === 'SILENT_PASSIVE' ? 3 : 10) + thermNoiseDelta * 0.5)
    );
    primaryHashRate = maxWatts;
    primaryWatts = maxWatts;
    primaryHeatC = 0;

    customSpec = {
      ...customSpec,
      maxWatts,
      efficiency,
      noiseDba: noise,
    };
  } else if (partCategory === 'cooling') {
    const isImmersion = architecture === 'CRYO_IMMERSION' || focus === 'CRYO_LOOP';
    const isCryoRated =
      Boolean(params.isCryoRated) ||
      focus === 'CRYO_LOOP' ||
      params.flowGeometry === 'CRYO_CASCADE' ||
      inferredBranch === 'QUANTUM';
    const archCoolMult =
      isImmersion ? 1.45 : architecture === 'DIRECT_LIQUID' ? 1.2 : 0.95;
    const focusCoolMult =
      focus === 'MAX_THERMAL' || focus === 'CRYO_LOOP' ? 1.2 : focus === 'SILENT_FLOW' ? 0.92 : 1.04;
    const coolingPowerC = Math.round(
      95 *
        nodeMult *
        archCoolMult *
        focusCoolMult *
        densOutputMult *
        profileSpec.hashMult *
        subSpec.perfMult *
        qualityMult
    );
    primaryWatts = Math.max(
      18,
      Math.round(
        (isImmersion ? 130 : architecture === 'DIRECT_LIQUID' ? 85 : 42) *
          Math.pow(nodeMult, 0.5) *
          effWattMult *
          profileSpec.wattMult *
          subSpec.wattMult
      )
    );
    const noise = Math.max(
      2,
      Math.round(
        (isImmersion ? 3 : focus === 'SILENT_FLOW' ? 6 : 14) + thermNoiseDelta * 0.6
      )
    );
    if (isImmersion) baseUnitUsd = Math.round(baseUnitUsd * 1.38);

    primaryHashRate = coolingPowerC;
    primaryHeatC = -coolingPowerC;
    customSpec = {
      ...customSpec,
      coolingPowerC,
      watts: primaryWatts,
      noiseDba: noise,
      isImmersion,
      isCryoRated,
      isCryoRatedCooling: isCryoRated,
    };
  } else {
    // OS kernel
    const archHash =
      architecture === 'BARE_METAL_ASM' ? 1.12 : architecture === 'UNDERCLOCK_SCHED' ? 1.03 : 1.06;
    const focusHash = focus === 'MAX_HASH' ? 1.08 : focus === 'ECO_GOV' ? 0.96 : 1.0;
    const tickBoost = (params.schedulerTickHz ?? 1000) >= 2000 ? 1.03 : 1.0;
    const hashrateMultiplier = Number(
      Math.min(
        1.52,
        (1.06 + nodeMult * 0.085) *
          archHash *
          focusHash *
          tickBoost *
          (1 + densDelta * 0.025) *
          (profileSpec.hashMult >= 1
            ? 1 + (profileSpec.hashMult - 1) * 0.5
            : 1 - (1 - profileSpec.hashMult) * 0.4) *
          Math.min(1.04, qualityMult)
      ).toFixed(3)
    );
    const archPwr =
      architecture === 'UNDERCLOCK_SCHED' ? 0.88 : architecture === 'BARE_METAL_ASM' ? 0.98 : 0.93;
    const focusPwr = focus === 'ECO_GOV' ? 0.91 : focus === 'MAX_HASH' ? 1.03 : 0.96;
    const powerMultiplier = Number(
      Math.max(0.72, archPwr * focusPwr * (1 - effDelta * 0.02) * profileSpec.wattMult).toFixed(3)
    );
    const stabilityBonus = Number(
      Math.min(
        0.74,
        (architecture === 'SELF_HEAL_RT' ? 0.34 : 0.16) +
          nodeMult * 0.07 +
          Math.max(0, relDelta) * 0.05 +
          (focus === 'ZERO_FAULT' ? 0.12 : 0) +
          wearResistance * 0.3
      ).toFixed(2)
    );

    primaryHashRate = hashrateMultiplier;
    primaryWatts = Math.round(powerMultiplier * 100);
    primaryHeatC = Math.round(stabilityBonus * 100);
    customSpec = {
      ...customSpec,
      hashrateMultiplier,
      powerMultiplier,
      stabilityBonus,
    };
  }

  const unitCostUsd = Math.max(
    60,
    Math.round(baseUnitUsd * yieldCut * profileSpec.costMult * engCostMult * subSpec.unitCostMult)
  );
  const wholesaleValueUsd = Math.max(
    90,
    Math.round(
      baseUnitUsd *
        spec.wholesaleMult *
        profileSpec.costMult *
        engCostMult *
        subSpec.unitCostMult *
        wholesalePrestigeMult *
        qualityMult
    )
  );

  customSpec.unitCostUsd = unitCostUsd;
  customSpec.wholesaleValueUsd = wholesaleValueUsd;

  return {
    ok: true,
    nreCostUsd,
    waferSteps,
    designProfile: profile,
    qualityGrade,
    qualityMult,
    manufacturabilityPct,
    branch: inferredBranch,
    engineering: eng,
    componentParams: params,
    subFeature: subSpec.id,
    spec: customSpec,
    algo,
    primaryHashRate,
    primaryWatts,
    primaryHeatC,
  };
}

export function formatEngineeringPreviewReport(preview: CustomBlueprintPreviewResult): string {
  if (!preview.ok) return `  PREVIEW ERROR: ${preview.reason}`;
  const s = preview.spec;
  return [
    `  ENGINEERING PREVIEW: "${s.name}" [${s.partCategory.toUpperCase()} · ${s.processNode} · Branch: ${preview.branch}]`,
    `    Architecture : ${s.architecture} · Profile: ${preview.designProfile} · Sub: ${preview.subFeature}`,
    `    Spec Summary : ${formatCustomComponentSummaryLine(s)}`,
    `    Est. Grade   : ${preview.qualityGrade} (${(preview.qualityMult * 100).toFixed(1)}%) · Manufacturability: ${preview.manufacturabilityPct}%`,
    `    Tooling NRE  : ${formatUsd(preview.nreCostUsd)} · Unit Cost: ${formatUsd(s.unitCostUsd)} · Wholesale: ${formatUsd(s.wholesaleValueUsd)} · Wafer Steps: ${preview.waferSteps}`,
  ].join('\n');
}

export function formatCustomComponentSummaryLine(spec: CustomComponentSpec): string {
  const branchTag = spec.branch && spec.branch !== 'SILICON' ? `[${spec.branch}] ` : '';
  switch (spec.partCategory) {
    case 'compute': {
      const algo = spec.algo ?? 'SHA256';
      const h = spec.hashrates?.[algo] ?? 0;
      return `${branchTag}${spec.computeKind ?? 'ASIC'} ${algo} @ ${formatHashrate(h, algo)}, ${spec.watts ?? 0}W, ${spec.heatC ?? 0}°C`;
    }
    case 'gpu': {
      const algo = spec.algo ?? 'ETHASH';
      const h = spec.hashrates?.[algo] ?? 0;
      return `${branchTag}GPU (${spec.vramGb ?? 16}GB) ${algo} @ ${formatHashrate(h, algo)}, ${spec.watts ?? 0}W, ${spec.noiseDba ?? 14}dBA`;
    }
    case 'chassis':
      return `${branchTag}${spec.supportsHybridAsicGpu ? `Hybrid ${spec.maxGpus ?? 6}GPU+1ASIC` : spec.isAsicRack ? 'ASIC Rack' : `${spec.maxGpus ?? 8} GPU`} · -${spec.coolingBonus ?? 0}°C${spec.isCryoRated ? ' · CRYO' : ''}${spec.isOpticalBackplane ? ' · OPTICAL' : ''}`;
    case 'storage':
      return `${spec.storageTb ?? 0}TB · ${spec.ramGb ?? 0}GB RAM · +${Math.round((spec.efficiencyBonus ?? 0) * 100)}% eff`;
    case 'psu':
      return `${spec.maxWatts ?? 0}W cap · ${((spec.efficiency ?? 0.95) * 100).toFixed(1)}% eff · ${spec.noiseDba ?? 8}dBA`;
    case 'cooling':
      return `${branchTag}-${spec.coolingPowerC ?? 0}°C · ${spec.watts ?? 0}W · ${spec.isCryoRated ? 'Cryo-Rated' : spec.isImmersion ? 'Immersion' : `${spec.noiseDba ?? 10}dBA`}`;
    case 'os':
      return `x${(spec.hashrateMultiplier ?? 1).toFixed(2)} hash · x${(spec.powerMultiplier ?? 1).toFixed(2)} pwr · +${Math.round((spec.stabilityBonus ?? 0) * 100)}% stab`;
  }
}

export function designCustomComponentBlueprint(
  state: GameState,
  input: CustomBlueprintDesignInput
): { ok: boolean; nextState: GameState; summary: string } {
  const cleanName = input.name.trim().slice(0, 28);
  const fab = buildDefaultFab(state.fab);
  if (fab.blueprints.some((b) => b.name.toLowerCase() === cleanName.toLowerCase())) {
    return { ok: false, nextState: state, summary: `Blueprint "${cleanName}" already exists.` };
  }

  const bpId = `bp_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`;
  const preview = previewCustomComponentDesign(state, input, bpId);
  if (!preview.ok) {
    return { ok: false, nextState: state, summary: preview.reason ?? 'Blueprint validation failed.' };
  }

  if (state.cash < preview.nreCostUsd) {
    return {
      ok: false,
      nextState: state,
      summary: `${input.processNode} ${input.partCategory.toUpperCase()} NRE tooling costs ${formatUsd(
        preview.nreCostUsd
      )}.`,
    };
  }

  const revEntry: BlueprintRevisionEntry = {
    revisionNumber: 1,
    step: state.stepCount,
    summary: `Initial tape-out (${input.processNode}, ${preview.branch}, ${preview.designProfile})`,
    hashRate: preview.primaryHashRate,
    watts: preview.primaryWatts,
    heatC: preview.primaryHeatC,
    manufacturabilityPct: preview.manufacturabilityPct,
  };

  const bp: CustomChipBlueprint = {
    id: bpId,
    name: cleanName,
    partCategory: input.partCategory,
    architecture: input.architecture,
    subFeature: preview.subFeature,
    branch: preview.branch,
    engineering: preview.engineering,
    componentParams: preview.componentParams,
    customSpec: preview.spec,
    nreCostUsd: preview.nreCostUsd,
    manufacturabilityPct: preview.manufacturabilityPct,
    revisionNumber: 1,
    revisionHistory: [revEntry],
    algo: preview.algo,
    processNode: input.processNode,
    unitCostUsd: preview.spec.unitCostUsd,
    waferSteps: preview.waferSteps,
    hashRate: preview.primaryHashRate,
    watts: preview.primaryWatts,
    heatC: preview.primaryHeatC,
    wholesaleValueUsd: preview.spec.wholesaleValueUsd,
    createdStep: state.stepCount,
    designProfile: preview.designProfile,
    qualityGrade: preview.qualityGrade,
    qualityMult: preview.qualityMult,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_nre_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -preview.nreCostUsd,
    description: `Tape-out ${input.partCategory} "${cleanName}" (${input.processNode})`,
  };

  const nextHistory = appendFabHistory(
    fab.manufacturingHistory,
    state.stepCount,
    'TAPEOUT',
    `Taped out ${cleanName} rev 1 (${input.partCategory.toUpperCase()} · ${input.processNode} · ${preview.branch} · Mfg ${preview.manufacturabilityPct}%)`
  );

  const profileSpec = DESIGN_PROFILE_SPECS[preview.designProfile];
  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - preview.nreCostUsd,
      fab: {
        ...fab,
        blueprints: [...fab.blueprints, bp],
        manufacturingHistory: nextHistory,
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + preview.nreCostUsd,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Taped out ${input.partCategory.toUpperCase()} "${cleanName}" rev 1 [${profileSpec.label} · Grade ${preview.qualityGrade} · Mfg ${preview.manufacturabilityPct}%] (${formatCustomComponentSummaryLine(
      preview.spec
    )}) for ${formatUsd(preview.nreCostUsd)} NRE. Unit: ${formatUsd(
      preview.spec.unitCostUsd
    )}, Export: ${formatUsd(preview.spec.wholesaleValueUsd)}.`,
  };
}

/** Save an un-funded draft blueprint to revisit & tape out later (Section 1). */
export function saveDraftBlueprint(
  state: GameState,
  input: CustomBlueprintDesignInput
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const cleanName = input.name.trim().slice(0, 28) || `Draft-${(fab.draftBlueprints?.length ?? 0) + 1}`;
  const draftId = `draft_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`;
  const preview = previewCustomComponentDesign(state, { ...input, name: cleanName }, draftId);
  if (!preview.ok) {
    return { ok: false, nextState: state, summary: preview.reason ?? 'Draft validation failed.' };
  }

  const draft: CustomChipBlueprint = {
    id: draftId,
    name: cleanName,
    partCategory: input.partCategory,
    architecture: input.architecture,
    subFeature: preview.subFeature,
    branch: preview.branch,
    engineering: preview.engineering,
    componentParams: preview.componentParams,
    customSpec: preview.spec,
    nreCostUsd: preview.nreCostUsd,
    manufacturabilityPct: preview.manufacturabilityPct,
    isDraft: true,
    revisionNumber: 0,
    algo: preview.algo,
    processNode: input.processNode,
    unitCostUsd: preview.spec.unitCostUsd,
    waferSteps: preview.waferSteps,
    hashRate: preview.primaryHashRate,
    watts: preview.primaryWatts,
    heatC: preview.primaryHeatC,
    wholesaleValueUsd: preview.spec.wholesaleValueUsd,
    createdStep: state.stepCount,
    designProfile: preview.designProfile,
    qualityGrade: preview.qualityGrade,
    qualityMult: preview.qualityMult,
  };

  const filtered = (fab.draftBlueprints ?? []).filter(
    (d) => d.name.toLowerCase() !== cleanName.toLowerCase()
  );

  return {
    ok: true,
    nextState: {
      ...state,
      fab: {
        ...fab,
        draftBlueprints: [...filtered, draft],
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'DRAFT',
          `Saved draft blueprint "${cleanName}" (${input.partCategory.toUpperCase()} ${input.processNode})`
        ),
      },
    },
    summary: `Saved draft blueprint "${cleanName}" (${preview.manufacturabilityPct}% Mfg · NRE ${formatUsd(
      preview.nreCostUsd
    )}). Tape it out anytime with "fab draft tapeout <#>".`,
  };
}

export function deleteDraftBlueprint(
  state: GameState,
  draftIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const target = fab.draftBlueprints?.[draftIdx];
  if (!target) {
    return { ok: false, nextState: state, summary: `Draft #${draftIdx + 1} not found.` };
  }
  return {
    ok: true,
    nextState: {
      ...state,
      fab: {
        ...fab,
        draftBlueprints: (fab.draftBlueprints ?? []).filter((_, i) => i !== draftIdx),
      },
    },
    summary: `Deleted draft blueprint "${target.name}".`,
  };
}

/** Create a numbered revision on an existing taped-out blueprint (40% NRE discount). */
export function reviseBlueprint(
  state: GameState,
  blueprintIdx: number,
  updates: Partial<CustomBlueprintDesignInput> & { revisionNote?: string }
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const existing = fab.blueprints[blueprintIdx];
  if (!existing) {
    return { ok: false, nextState: state, summary: `Blueprint #${blueprintIdx + 1} not found.` };
  }

  const nextInput: CustomBlueprintDesignInput = {
    name: existing.name,
    partCategory: existing.partCategory ?? 'compute',
    architecture: updates.architecture ?? existing.architecture ?? 'ASIC_BLADE',
    processNode: updates.processNode ?? existing.processNode,
    focus: updates.focus ?? existing.algo,
    branch: updates.branch ?? existing.branch,
    engineering: updates.engineering ?? existing.engineering,
    componentParams: updates.componentParams ?? existing.componentParams,
    subFeature: updates.subFeature ?? existing.subFeature,
    profile: updates.profile ?? existing.designProfile ?? 'BALANCED',
  };

  const preview = previewCustomComponentDesign(state, nextInput, existing.id);
  if (!preview.ok) {
    return { ok: false, nextState: state, summary: preview.reason ?? 'Revision validation failed.' };
  }

  const revFee = Math.round(preview.nreCostUsd * 0.45);
  if (state.cash < revFee) {
    return {
      ok: false,
      nextState: state,
      summary: `Blueprint revision fee (45% NRE) requires ${formatUsd(revFee)}.`,
    };
  }

  const nextRev = (existing.revisionNumber ?? 1) + 1;
  const revEntry: BlueprintRevisionEntry = {
    revisionNumber: nextRev,
    step: state.stepCount,
    summary: updates.revisionNote ?? `Rev ${nextRev} (${preview.designProfile}, ${preview.subFeature})`,
    hashRate: preview.primaryHashRate,
    watts: preview.primaryWatts,
    heatC: preview.primaryHeatC,
    manufacturabilityPct: preview.manufacturabilityPct,
  };

  const updatedSpec: CustomComponentSpec = {
    ...preview.spec,
    revisionNumber: nextRev,
  };

  const updatedBp: CustomChipBlueprint = {
    ...existing,
    architecture: nextInput.architecture,
    subFeature: preview.subFeature,
    branch: preview.branch,
    engineering: preview.engineering,
    componentParams: preview.componentParams,
    customSpec: updatedSpec,
    manufacturabilityPct: preview.manufacturabilityPct,
    revisionNumber: nextRev,
    revisionHistory: [...(existing.revisionHistory ?? []), revEntry],
    prototypeReport: undefined, // Reset validation after architectural revision
    algo: preview.algo,
    processNode: nextInput.processNode,
    unitCostUsd: updatedSpec.unitCostUsd,
    waferSteps: preview.waferSteps,
    hashRate: preview.primaryHashRate,
    watts: preview.primaryWatts,
    heatC: preview.primaryHeatC,
    wholesaleValueUsd: updatedSpec.wholesaleValueUsd,
    designProfile: preview.designProfile,
    qualityGrade: preview.qualityGrade,
    qualityMult: preview.qualityMult,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_rev_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -revFee,
    description: `Revision ${nextRev} for "${existing.name}"`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - revFee,
      fab: {
        ...fab,
        blueprints: fab.blueprints.map((b, i) => (i === blueprintIdx ? updatedBp : b)),
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'REVISION',
          `Revised "${existing.name}" to Rev ${nextRev} (Mfg ${preview.manufacturabilityPct}%, Unit ${formatUsd(updatedSpec.unitCostUsd)})`
        ),
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + revFee,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Revised "${existing.name}" to Rev ${nextRev} for ${formatUsd(revFee)}! (${formatCustomComponentSummaryLine(
      updatedSpec
    )} · Mfg ${preview.manufacturabilityPct}%).`,
  };
}

/** Compare any two taped-out blueprints side by side (Section 1). */
export function compareBlueprints(
  state: GameState,
  idxA: number,
  idxB: number
): string {
  const fab = buildDefaultFab(state.fab);
  const a = fab.blueprints[idxA];
  const b = fab.blueprints[idxB];
  if (!a || !b) {
    return `Specify two valid blueprint numbers (#1..#${fab.blueprints.length}).`;
  }
  const catA = (a.partCategory ?? 'compute').toUpperCase();
  const catB = (b.partCategory ?? 'compute').toUpperCase();
  const revA = a.revisionNumber ?? 1;
  const revB = b.revisionNumber ?? 1;
  const mfgA = a.manufacturabilityPct ?? 85;
  const mfgB = b.manufacturabilityPct ?? 85;
  return [
    `  BLUEPRINT COMPARISON: #${idxA + 1} "${a.name}" vs #${idxB + 1} "${b.name}"`,
    `    Category / Rev : [${catA}] Rev ${revA}             vs  [${catB}] Rev ${revB}`,
    `    Node / Branch  : ${a.processNode} / ${a.branch ?? 'SILICON'}      vs  ${b.processNode} / ${b.branch ?? 'SILICON'}`,
    `    Profile / Grade: ${a.designProfile ?? 'BALANCED'} (${a.qualityGrade ?? 'B'})     vs  ${b.designProfile ?? 'BALANCED'} (${b.qualityGrade ?? 'B'})`,
    `    Manufacturabil.: ${mfgA}%                         vs  ${mfgB}%`,
    `    Proto Tested   : ${a.prototypeReport ? `${a.prototypeReport.status} (${a.prototypeReport.validatedScore}/100)` : 'UNVALIDATED'}   vs  ${b.prototypeReport ? `${b.prototypeReport.status} (${b.prototypeReport.validatedScore}/100)` : 'UNVALIDATED'}`,
    `    Watts / Heat   : ${a.watts}W / ${a.heatC}°C              vs  ${b.watts}W / ${b.heatC}°C`,
    `    Unit / Export  : ${formatUsd(a.unitCostUsd)} / ${formatUsd(a.wholesaleValueUsd)}  vs  ${formatUsd(b.unitCostUsd)} / ${formatUsd(b.wholesaleValueUsd)}`,
    `    #1 Spec        : ${a.customSpec ? formatCustomComponentSummaryLine(a.customSpec) : a.algo}`,
    `    #2 Spec        : ${b.customSpec ? formatCustomComponentSummaryLine(b.customSpec) : b.algo}`,
  ].join('\n');
}

export const formatBlueprintComparisonReport = compareBlueprints;

/** Prototype bench validation & calibration (Section 2 & 3). */
export function runPrototypeTest(
  state: GameState,
  blueprintIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  const fab = buildDefaultFab(state.fab);
  const bp = fab.blueprints[blueprintIdx];
  if (!bp) {
    return { ok: false, nextState: state, summary: `Blueprint #${blueprintIdx + 1} not found.` };
  }

  const testCost = Math.max(350, Math.round(bp.unitCostUsd * 0.16));
  if (state.cash < testCost) {
    return {
      ok: false,
      nextState: state,
      summary: `Prototype bench validation requires ${formatUsd(testCost)}.`,
    };
  }

  const prevRuns = bp.prototypeReport?.runsCount ?? 0;
  const maxResSkill = (state.employees ?? [])
    .filter((e) => e.role === 'RESEARCHER' || e.role === 'SYS_ENGINEER')
    .reduce((m, e) => Math.max(m, e.skillLevel ?? 1), 1);

  const mfg = bp.manufacturabilityPct ?? 82;
  const rng = createSeededRng(`${state.runSeed}|prototest|${bp.id}|${prevRuns}|${state.stepCount}`);
  const iterationLift = prevRuns * 9;
  const rawScore =
    mfg * 0.68 +
    maxResSkill * 4.5 +
    iterationLift +
    ((bp.engineering?.reliability ?? 2) * 3) +
    (rng() * 14 - 4);
  const validatedScore = Math.max(25, Math.min(99, Math.round(rawScore)));

  const flaws: string[] = [];
  const params = bp.componentParams;
  if ((params?.voltageBiasPct ?? 100) >= 112 && prevRuns === 0) {
    flaws.push('VRM transient droop above 112% voltage bias');
  }
  if (bp.branch === 'QUANTUM' && (params?.cryoTargetMk ?? 20) < 15 && !state.unlockedResearch.includes('res_gen7_dilution_cryo')) {
    flaws.push('Millikelvin thermal noise without Dilution Cryo R&D');
  }
  if (bp.branch === 'PHOTONIC' && (params?.wdmChannels ?? 16) > 24 && prevRuns === 0) {
    flaws.push('Inter-channel optical crosstalk calibrated in run #' + (prevRuns + 1));
  }
  if (validatedScore < 60 && flaws.length === 0) {
    flaws.push('Mask alignment drift on outer wafer reticle');
  }

  const status: PrototypeTestReport['status'] =
    validatedScore >= 76 && flaws.length === 0
      ? 'PASSED'
      : validatedScore >= 52
      ? 'MARGINAL'
      : 'FAILED_FLAW';

  const yieldBonusPct = Number(
    (status === 'PASSED' ? 3.5 + prevRuns * 0.8 : status === 'MARGINAL' ? 1.5 : 0).toFixed(1)
  );
  const defectReductionPct = status === 'PASSED' ? 75 : status === 'MARGINAL' ? 40 : 10;
  const reliabilityBonus = Number((status === 'PASSED' ? 0.06 : status === 'MARGINAL' ? 0.03 : 0).toFixed(2));

  const report: PrototypeTestReport = {
    testedStep: state.stepCount,
    runsCount: prevRuns + 1,
    status,
    validatedScore,
    thermalMarginC: Math.max(4, Math.round(28 - Math.max(0, bp.heatC) * 0.18 + maxResSkill * 2)),
    voltageStabilityPct: Math.min(99.9, Number((92 + validatedScore * 0.075).toFixed(1))),
    branchCalibrationPct:
      bp.branch === 'QUANTUM' || bp.branch === 'PHOTONIC'
        ? Math.min(99, Math.round(74 + validatedScore * 0.25))
        : 100,
    discoveredFlaws: flaws,
    yieldBonusPct,
    defectReductionPct,
    reliabilityBonus,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_proto_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -testCost,
    description: `Prototype test #${report.runsCount} for "${bp.name}"`,
  };

  const updatedBp: CustomChipBlueprint = {
    ...bp,
    prototypeReport: report,
    customSpec: bp.customSpec
      ? {
          ...bp.customSpec,
          prototypeValidated: status === 'PASSED',
          wearResistance: Number(
            Math.min(0.45, (bp.customSpec.wearResistance ?? 0) + (prevRuns === 0 ? reliabilityBonus : 0)).toFixed(2)
          ),
        }
      : bp.customSpec,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - testCost,
      fab: {
        ...fab,
        blueprints: fab.blueprints.map((b, i) => (i === blueprintIdx ? updatedBp : b)),
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'PROTOTYPE',
          `Prototype #${report.runsCount} "${bp.name}": ${status} (Score ${validatedScore}/100, +${yieldBonusPct}% batch yield)`
        ),
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + testCost,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Prototype Test #${report.runsCount} for "${bp.name}" [${status} · Score ${validatedScore}/100]: Voltage stab ${report.voltageStabilityPct}%, Thermal margin +${report.thermalMarginC}°C, Batch yield +${yieldBonusPct}%, Defect reduction -${defectReductionPct}%${
      flaws.length > 0 ? `. Flaws: ${flaws.join('; ')}` : '.'
    }`,
  };
}

/**
 * Legacy 1-line ASIC tape-out API (kept 100% compatible with existing commands & tests).
 */
export function designCustomChipBlueprint(
  state: GameState,
  name: string,
  algo: MiningAlgorithm,
  processNode: ChipProcessNode,
  profile: DesignProfile = 'BALANCED'
): { ok: boolean; nextState: GameState; summary: string } {
  if (!NODE_SPECS[processNode]) {
    return {
      ok: false,
      nextState: state,
      summary: 'Process node must be 7nm, 5nm, 3nm, 2nm, 1nm, or photonic.',
    };
  }
  const arch: FabArchitectureId = 'ASIC_BLADE';
  return designCustomComponentBlueprint(state, {
    name,
    partCategory: 'compute',
    architecture: arch,
    processNode,
    focus: algo,
    engineering: { density: 2, efficiency: 2, thermals: 2, reliability: 2 },
    subFeature: 'STD',
    profile,
  });
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
  const protoBonus = (bp.prototypeReport?.yieldBonusPct ?? 0) / 100;
  const baseRoll =
    0.95 + createSeededRng(`${state.runSeed}|batch|${bp.id}|${state.stepCount}|${cleanQty}`)() * 0.1;
  const qualityRoll = Number(Math.min(1.12, baseRoll + protoBonus).toFixed(3));
  const batchSeq = fab.nextBatchSeq ?? 1;
  const batchId = `BATCH-${String(batchSeq).padStart(4, '0')}`;

  const order: FabProductionOrder = {
    id: `ord_fab_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    batchId,
    blueprintId: bp.id,
    blueprintName: bp.name,
    revisionNumber: bp.revisionNumber ?? 1,
    qty: cleanQty,
    stepsRemaining: batchSteps,
    totalSteps: batchSteps,
    qualityRoll,
    prototypeValidated: bp.prototypeReport?.status === 'PASSED',
    manufacturabilityPct: bp.manufacturabilityPct ?? 85,
  };

  const tx: TransactionEntry = {
    id: `tx_fab_prod_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -totalCost,
    description: `Queued ${batchId}: ${cleanQty}x custom ${bp.partCategory ?? 'compute'} "${bp.name}"`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - totalCost,
      fab: {
        ...fab,
        nextBatchSeq: batchSeq + 1,
        productionQueue: [...fab.productionQueue, order],
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + totalCost,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Queued ${batchId} (${cleanQty}x "${bp.name}" rev ${bp.revisionNumber ?? 1}) for ${formatUsd(
      totalCost
    )} (~${Math.ceil(batchSteps / fab.linesCount)} steps at ${
      fab.linesCount
    }x line throughput). Projected batch yield: ${(qualityRoll * 100).toFixed(1)}%${
      bp.prototypeReport ? ` (${bp.prototypeReport.status})` : ' (Unvalidated)'
    }.`,
  };
}

function applyYieldToCustomSpec(
  baseSpec: CustomComponentSpec,
  roll: number
): CustomComponentSpec {
  const scaledWholesale = Math.round(baseSpec.wholesaleValueUsd * roll);
  const next: CustomComponentSpec = {
    ...baseSpec,
    qualityRoll: roll,
    wholesaleValueUsd: scaledWholesale,
  };
  if (baseSpec.hashrates) {
    const scaledHashes: Partial<Record<MiningAlgorithm, number>> = {};
    (Object.keys(baseSpec.hashrates) as MiningAlgorithm[]).forEach((algo) => {
      const val = baseSpec.hashrates?.[algo];
      if (typeof val === 'number') {
        scaledHashes[algo] =
          algo === 'RANDOMX' ? Number((val * roll).toFixed(4)) : Math.round(val * roll);
      }
    });
    next.hashrates = scaledHashes;
  }
  if (typeof baseSpec.coolingPowerC === 'number') {
    next.coolingPowerC = Math.round(baseSpec.coolingPowerC * roll);
  }
  if (typeof baseSpec.storageTb === 'number') {
    next.storageTb = Number((baseSpec.storageTb * roll).toFixed(1));
  }
  if (typeof baseSpec.maxWatts === 'number') {
    next.maxWatts = Math.round(baseSpec.maxWatts * roll);
  }
  if (typeof baseSpec.hashrateMultiplier === 'number') {
    next.hashrateMultiplier = Number(
      (1 + (baseSpec.hashrateMultiplier - 1) * roll).toFixed(3)
    );
  }
  return next;
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
  const nextInventory: CustomAsicInventoryItem[] = fab.inventory.map((i) => ({
    ...i,
    serialNumbers: i.serialNumbers ? [...i.serialNumbers] : undefined,
  }));
  const nextBatches: FabBatchRecord[] = [...(fab.batchRecords ?? [])];
  const nextSerials: SerializedComponentRecord[] = [...(fab.serialRegistry ?? [])];
  let nextHistory = [...(fab.manufacturingHistory ?? [])];
  let nextSerialSeq = fab.nextSerialSeq ?? 1;
  let nextBatchSeq = fab.nextBatchSeq ?? 1;

  let manufacturedAdd = 0;
  let scrappedAdd = 0;
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
      const roll = ord.qualityRoll ?? 1;
      const mfgPct = ord.manufacturabilityPct ?? bp?.manufacturabilityPct ?? 85;
      const defectRelief = bp?.prototypeReport ? bp.prototypeReport.defectReductionPct / 100 : 0;

      // Guarantee full output on small batches / high manufacturability, penalize pushing risky large lots without QC
      let defectRate = Math.max(0, (74 - mfgPct) / 140) * (1 - defectRelief);
      if (bp?.prototypeReport?.status === 'FAILED_FLAW') defectRate = Math.max(defectRate, 0.25);
      const rawScrap = ord.qty >= 3 ? Math.floor(ord.qty * defectRate) : 0;
      const scrappedQty = Math.min(Math.max(0, ord.qty - 1), rawScrap);
      const passedQty = Math.max(1, ord.qty - scrappedQty);

      manufacturedAdd += passedQty;
      scrappedAdd += scrappedQty;

      const batchId = ord.batchId ?? `BATCH-${String(nextBatchSeq++).padStart(4, '0')}`;
      const cat: PartCategory = bp?.partCategory ?? 'compute';
      const branch: TechBranch = bp?.branch ?? 'SILICON';
      const gen = NODE_GENERATION[bp?.processNode ?? '3nm'] ?? 4;
      const batchSerials: string[] = [];

      for (let u = 0; u < passedQty; u++) {
        const serialNumber = `HW-G${gen}${branch[0]}-${String(nextSerialSeq++).padStart(4, '0')}`;
        batchSerials.push(serialNumber);
        nextSerials.unshift({
          serialNumber,
          batchId,
          blueprintId: ord.blueprintId,
          revisionNumber: ord.revisionNumber ?? bp?.revisionNumber ?? 1,
          name: ord.blueprintName,
          partCategory: cat,
          processNode: bp?.processNode ?? '3nm',
          branch,
          qualityGrade: bp?.qualityGrade ?? 'B',
          measuredHashMult: roll,
          measuredWattMult: Number((bp?.prototypeReport?.status === 'PASSED' ? 0.98 : 1.0).toFixed(3)),
          wearResistance: Number(
            Math.min(
              0.45,
              (bp?.customSpec?.wearResistance ?? 0) + (bp?.prototypeReport?.reliabilityBonus ?? 0)
            ).toFixed(2)
          ),
          manufacturedStep: nextStep,
          status: 'IN_STOCK',
          history: [`${stepLabel}: QA passed in ${batchId} (${(roll * 100).toFixed(1)}% yield)`],
        });
      }

      const qcScore = Math.max(
        55,
        Math.min(
          100,
          Math.round(mfgPct * 0.45 + roll * 45 + (ord.prototypeValidated ? 10 : 0) - scrappedQty * 3)
        )
      );

      if (bp) {
        nextBatches.unshift({
          batchId,
          blueprintId: bp.id,
          blueprintName: bp.name,
          revisionNumber: ord.revisionNumber ?? bp.revisionNumber ?? 1,
          partCategory: cat,
          processNode: bp.processNode,
          branch,
          requestedQty: ord.qty,
          passedQty,
          scrappedDefectQty: scrappedQty,
          qcScore,
          qualityGrade: bp.qualityGrade ?? 'B',
          qualityRoll: roll,
          prototypeValidated: Boolean(ord.prototypeValidated),
          completedStep: nextStep,
          stepLabel,
          serialNumbers: batchSerials,
          notes:
            scrappedQty > 0
              ? `${scrappedQty} unit(s) scrapped due to ${mfgPct}% manufacturability limits.`
              : `100% wafer pass (${qcScore}/100 QC).`,
        });

        const stackHash =
          cat === 'compute' || cat === 'gpu'
            ? bp.algo === 'RANDOMX'
              ? Number((bp.hashRate * roll).toFixed(4))
              : Math.round(bp.hashRate * roll)
            : cat === 'storage'
            ? Number((bp.hashRate * roll).toFixed(1))
            : cat === 'os'
            ? Number((1 + (bp.hashRate - 1) * roll).toFixed(3))
            : Math.round(bp.hashRate * roll);
        const scaledSpec = bp.customSpec ? applyYieldToCustomSpec(bp.customSpec, roll) : undefined;
        if (scaledSpec) {
          scaledSpec.batchId = batchId;
          scaledSpec.prototypeValidated = Boolean(ord.prototypeValidated);
        }
        const existing = nextInventory.find(
          (i) => i.blueprintId === bp.id && Math.abs((i.qualityRoll ?? 1) - roll) < 1e-9
        );
        if (existing) {
          existing.qty += passedQty;
          existing.serialNumbers = [...(existing.serialNumbers ?? []), ...batchSerials];
          existing.batchId = existing.batchId ?? batchId;
        } else {
          nextInventory.push({
            blueprintId: bp.id,
            name: bp.name,
            partCategory: cat,
            architecture: bp.architecture,
            subFeature: bp.subFeature,
            branch,
            customSpec: scaledSpec,
            algo: bp.algo,
            processNode: bp.processNode,
            hashRate: stackHash,
            watts: bp.watts,
            heatC: bp.heatC,
            wholesaleValueUsd: Math.round(bp.wholesaleValueUsd * roll),
            qty: passedQty,
            qualityGrade: bp.qualityGrade,
            qualityRoll: roll,
            serialNumbers: batchSerials,
            batchId,
          });
        }
      }

      nextHistory = appendFabHistory(
        nextHistory,
        nextStep,
        'BATCH_DONE',
        `${batchId}: ${passedQty}/${ord.qty}x "${ord.blueprintName}" passed QA (QC ${qcScore}/100 · Serials ${batchSerials[0]}..${batchSerials[batchSerials.length - 1]})`
      );

      news.push({
        id: `news_fab_done_${ord.id}_${nextStep}`,
        step: nextStep,
        stepLabel,
        title: `Fab Batch Complete: ${passedQty}x ${ord.blueprintName} (${batchId})`,
        detail: `${passedQty}/${ord.qty} units passed QA (QC ${qcScore}/100). Run "fab batch 1" or "fab" to inspect/deploy.`,
        category: 'MILESTONE',
      });
    }
  }

  return {
    nextFab: {
      ...fab,
      productionQueue: remainingQueue,
      inventory: nextInventory,
      batchRecords: nextBatches.slice(0, 60),
      serialRegistry: nextSerials.slice(0, 250),
      manufacturingHistory: nextHistory.slice(0, 120),
      nextBatchSeq,
      nextSerialSeq,
      totalUnitsManufactured: fab.totalUnitsManufactured + manufacturedAdd,
      totalUnitsScrapped: (fab.totalUnitsScrapped ?? 0) + scrappedAdd,
    },
    news,
  };
}

export function inventoryItemToCustomSpec(item: CustomAsicInventoryItem): CustomComponentSpec {
  if (item.customSpec) {
    return {
      ...item.customSpec,
      branch: item.branch ?? item.customSpec.branch,
      qualityGrade: item.qualityGrade ?? item.customSpec.qualityGrade,
      qualityRoll: item.qualityRoll ?? item.customSpec.qualityRoll,
      wholesaleValueUsd: item.wholesaleValueUsd,
    };
  }
  const cat: PartCategory = item.partCategory ?? 'compute';
  return {
    blueprintId: item.blueprintId,
    partCategory: cat,
    architecture: item.architecture ?? 'ASIC_BLADE',
    subFeature: item.subFeature ?? 'STD',
    branch: item.branch ?? 'SILICON',
    name: item.name,
    processNode: item.processNode,
    generation: NODE_GENERATION[item.processNode] ?? 4,
    unitCostUsd: Math.round(item.wholesaleValueUsd * 0.68),
    wholesaleValueUsd: item.wholesaleValueUsd,
    qualityGrade: item.qualityGrade,
    qualityRoll: item.qualityRoll,
    algo: item.algo,
    computeKind: 'ASIC',
    hashrates: { [item.algo]: item.hashRate },
    watts: item.watts,
    heatC: item.heatC,
    noiseDba: 30,
  };
}

export function deployCustomInventoryToRig(
  state: GameState,
  invIdx: number,
  rigIdx: number,
  gpuSlotIdx?: number
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

  const serialAllocated = item.serialNumbers?.[0];
  const spec = {
    ...inventoryItemToCustomSpec(item),
    ...(serialAllocated ? { serialNumber: serialAllocated } : {}),
  };
  const cat = spec.partCategory;
  const { chassis } = getEffectivePartBundle(rig);

  if (cat === 'compute') {
    const isAsic = (spec.computeKind ?? 'ASIC') === 'ASIC';
    if (isAsic && chassis.maxAsics < 1) {
      return {
        ok: false,
        nextState: state,
        summary: `Rig #${rigIdx + 1} uses ${chassis.name}, which cannot seat an ASIC blade. Rebuild or install a custom ASIC/Converged chassis.`,
      };
    }
    if (!isAsic && chassis.isAsicRack && chassis.maxGpus === 0) {
      return {
        ok: false,
        nextState: state,
        summary: `Rig #${rigIdx + 1} uses ${chassis.name} (ASIC-only bay), incompatible with desktop/CPU chiplet compute.`,
      };
    }
  } else if (cat === 'gpu') {
    if (chassis.maxGpus <= 0) {
      return {
        ok: false,
        nextState: state,
        summary: `Rig #${rigIdx + 1} uses ${chassis.name} (0 GPU slots). Install a GPU chassis first.`,
      };
    }
    const slotTarget =
      typeof gpuSlotIdx === 'number' && !isNaN(gpuSlotIdx) ? gpuSlotIdx : rig.gpuIds.length;
    if (slotTarget >= chassis.maxGpus) {
      return {
        ok: false,
        nextState: state,
        summary: `${rig.name}'s GPU slots are full (${rig.gpuIds.length}/${chassis.maxGpus}). Specify a slot to replace: "fab deploy ${
          invIdx + 1
        } ${rigIdx + 1} 1".`,
      };
    }
  } else if (cat === 'chassis') {
    const nextMaxGpus = spec.maxGpus ?? 0;
    if (rig.gpuIds.length > nextMaxGpus) {
      return {
        ok: false,
        nextState: state,
        summary: `${rig.name} currently has ${rig.gpuIds.length} GPUs installed, exceeding "${spec.name}"'s ${nextMaxGpus}-GPU capacity.`,
      };
    }
    if (rig.customAsicSpec && (spec.maxAsics ?? 0) < 1) {
      return {
        ok: false,
        nextState: state,
        summary: `${rig.name} currently houses custom ASIC "${rig.customAsicSpec.name}". Strip the ASIC first before moving to a non-ASIC chassis.`,
      };
    }
  }

  const nextInventory = fab.inventory
    .map((entry, i) =>
      i === invIdx
        ? {
            ...entry,
            qty: entry.qty - 1,
            serialNumbers: (entry.serialNumbers ?? []).slice(1),
          }
        : entry
    )
    .filter((entry) => entry.qty > 0);

  let warningNote = '';

  const nextRigs = state.rigs.map((r, i) => {
    if (i !== rigIdx) return r;
    const compH = ensureRigComponentHealth(r);
    const nextParts: RigCustomPartsMap = {
      ...(r.customParts ?? {}),
      gpus: r.customParts?.gpus ? [...r.customParts.gpus] : undefined,
    };
    const nextSerials = { ...(r.customPartSerials ?? {}) };
    let nextComp = { ...compH };
    let nextGpuIds = [...r.gpuIds];
    let nextCustomAsic = r.customAsicSpec;

    if (cat === 'compute') {
      nextParts.compute = spec;
      if (serialAllocated) nextSerials.compute = serialAllocated;
      nextComp.compute = 100;
      const algo = spec.algo ?? item.algo;
      nextCustomAsic = {
        blueprintId: spec.blueprintId,
        name: spec.name,
        algo,
        processNode: spec.processNode,
        hashRate: spec.hashrates?.[algo] ?? item.hashRate,
        watts: spec.watts ?? item.watts,
        heatC: spec.heatC ?? item.heatC,
        serialNumber: serialAllocated,
        branch: spec.branch,
      };
    } else if (cat === 'gpu') {
      const targetIdx =
        typeof gpuSlotIdx === 'number' && gpuSlotIdx >= 0 && gpuSlotIdx < nextGpuIds.length
          ? gpuSlotIdx
          : nextGpuIds.length;
      const gpusArr: (CustomComponentSpec | null)[] = nextGpuIds.map(
        (_, idx) => nextParts.gpus?.[idx] ?? null
      );
      const gpuSerialsArr: (string | null)[] = nextGpuIds.map(
        (_, idx) => nextSerials.gpus?.[idx] ?? null
      );
      if (targetIdx === nextGpuIds.length) {
        nextGpuIds.push(GPU_PARTS[0].id);
        gpusArr.push(spec);
        gpuSerialsArr.push(serialAllocated ?? null);
        nextComp.gpus = [...nextComp.gpus, 100];
      } else {
        gpusArr[targetIdx] = spec;
        gpuSerialsArr[targetIdx] = serialAllocated ?? null;
        nextComp.gpus = nextComp.gpus.map((h, gi) => (gi === targetIdx ? 100 : h));
      }
      nextParts.gpus = gpusArr;
      nextSerials.gpus = gpuSerialsArr;
    } else if (cat === 'chassis') {
      nextParts.chassis = spec;
      if (serialAllocated) nextSerials.chassis = serialAllocated;
      nextComp.chassis = 100;
    } else if (cat === 'storage') {
      nextParts.storage = spec;
      if (serialAllocated) nextSerials.storage = serialAllocated;
      nextComp.storage = 100;
    } else if (cat === 'psu') {
      nextParts.psu = spec;
      if (serialAllocated) nextSerials.psu = serialAllocated;
      nextComp.psu = 100;
    } else if (cat === 'cooling') {
      nextParts.cooling = spec;
      if (serialAllocated) nextSerials.cooling = serialAllocated;
      nextComp.cooling = 100;
    } else if (cat === 'os') {
      nextParts.os = spec;
      if (serialAllocated) nextSerials.os = serialAllocated;
    }

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

    const updated = {
      ...r,
      gpuIds: nextGpuIds,
      customAsicSpec: nextCustomAsic,
      customParts: nextParts,
      customPartSerials: nextSerials,
      componentHealth: nextComp,
      healthPct: avgHealth,
      status: recoveredStatus,
    };

    if (cat === 'compute' || cat === 'gpu') {
      const bundle = getEffectivePartBundle(updated);
      const drawW = (spec.watts ?? item.watts) + 80;
      if (drawW > bundle.psu.maxWatts) {
        warningNote = ` WARNING: Check PSU capacity (${bundle.psu.maxWatts}W) via "tinker ${
          rigIdx + 1
        }" to avoid UNDERPOWERED!`;
      }
    }
    return updated;
  });

  const nextSerialRegistry = serialAllocated
    ? (fab.serialRegistry ?? []).map((sr) =>
        sr.serialNumber === serialAllocated
          ? {
              ...sr,
              status: 'INSTALLED' as const,
              installedRigId: rig.id,
              history: [...sr.history, `${formatStepLabel(state.stepCount)}: Installed in ${rig.name}`],
            }
          : sr
      )
    : fab.serialRegistry;

  return {
    ok: true,
    nextState: {
      ...state,
      rigs: nextRigs,
      fab: {
        ...fab,
        inventory: nextInventory,
        serialRegistry: nextSerialRegistry,
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'DEPLOY',
          `Deployed "${item.name}"${serialAllocated ? ` [${serialAllocated}]` : ''} into ${rig.name}`
        ),
      },
    },
    summary: `Installed custom ${item.processNode} ${cat.toUpperCase()} "${item.name}"${
      serialAllocated ? ` [${serialAllocated}]` : ''
    } (${formatCustomComponentSummaryLine(spec)}) into ${rig.name}.${warningNote}`,
  };
}

export function deployCustomAsicToRig(
  state: GameState,
  invIdx: number,
  rigIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  return deployCustomInventoryToRig(state, invIdx, rigIdx);
}

export function stripCustomPartFromRig(
  state: GameState,
  rigIdx: number,
  slot: PartCategory = 'compute',
  gpuSlotIdx = 0
): { ok: boolean; nextState: GameState; summary: string } {
  const rig = state.rigs[rigIdx];
  if (!rig) return { ok: false, nextState: state, summary: `Rig #${rigIdx + 1} not found.` };

  let specToStrip: CustomComponentSpec | undefined;
  let resolvedGpuIdx = gpuSlotIdx;
  let serialToRestore: string | undefined;

  if (slot === 'compute') {
    if (rig.customParts?.compute) {
      specToStrip = rig.customParts.compute;
      serialToRestore = specToStrip.serialNumber ?? rig.customPartSerials?.compute;
    } else if (rig.customAsicSpec) {
      const a = rig.customAsicSpec;
      const bp = state.fab?.blueprints.find((b) => b.id === a.blueprintId);
      serialToRestore = a.serialNumber ?? rig.customPartSerials?.compute;
      specToStrip = {
        blueprintId: a.blueprintId,
        serialNumber: serialToRestore,
        partCategory: 'compute',
        architecture: bp?.architecture ?? 'ASIC_BLADE',
        subFeature: bp?.subFeature ?? 'STD',
        branch: a.branch ?? bp?.branch ?? 'SILICON',
        name: a.name,
        processNode: a.processNode,
        generation: NODE_GENERATION[a.processNode] ?? 4,
        unitCostUsd: bp?.unitCostUsd ?? Math.round(a.watts * 2),
        wholesaleValueUsd: bp?.wholesaleValueUsd ?? Math.round(a.watts * 3),
        qualityGrade: bp?.qualityGrade,
        qualityRoll: bp?.qualityMult,
        algo: a.algo,
        computeKind: 'ASIC',
        hashrates: { [a.algo]: a.hashRate },
        watts: a.watts,
        heatC: a.heatC,
        noiseDba: 30,
      };
    }
  } else if (slot === 'gpu') {
    const gpus = rig.customParts?.gpus ?? [];
    if (gpus[gpuSlotIdx]) {
      specToStrip = gpus[gpuSlotIdx] ?? undefined;
      serialToRestore = specToStrip?.serialNumber ?? rig.customPartSerials?.gpus?.[gpuSlotIdx] ?? undefined;
    } else {
      const firstCustomIdx = gpus.findIndex((g) => Boolean(g));
      if (firstCustomIdx >= 0) {
        resolvedGpuIdx = firstCustomIdx;
        specToStrip = gpus[firstCustomIdx] ?? undefined;
        serialToRestore = specToStrip?.serialNumber ?? rig.customPartSerials?.gpus?.[firstCustomIdx] ?? undefined;
      }
    }
  } else {
    specToStrip = rig.customParts?.[slot];
    serialToRestore = specToStrip?.serialNumber ?? rig.customPartSerials?.[slot];
  }

  if (!specToStrip) {
    return {
      ok: false,
      nextState: state,
      summary: `Rig #${rigIdx + 1} has no custom ${slot.toUpperCase()} installed.`,
    };
  }

  const fab = buildDefaultFab(state.fab);
  const bp = fab.blueprints.find((b) => b.id === specToStrip!.blueprintId);
  const wholesaleValueUsd =
    specToStrip.wholesaleValueUsd ?? bp?.wholesaleValueUsd ?? Math.round((specToStrip.watts ?? 500) * 3);
  const refurbFee = Math.max(100, Math.round(wholesaleValueUsd * 0.02));
  if (state.cash < refurbFee) {
    return {
      ok: false,
      nextState: state,
      summary: `Extraction & refurbishment costs ${formatUsd(refurbFee)}.`,
    };
  }

  const algo = specToStrip.algo ?? 'SHA256';
  const primaryHash =
    specToStrip.partCategory === 'compute' || specToStrip.partCategory === 'gpu'
      ? specToStrip.hashrates?.[algo] ?? bp?.hashRate ?? 0
      : specToStrip.partCategory === 'storage'
      ? specToStrip.storageTb ?? 0
      : specToStrip.partCategory === 'psu'
      ? specToStrip.maxWatts ?? 0
      : specToStrip.partCategory === 'cooling'
      ? specToStrip.coolingPowerC ?? 0
      : specToStrip.partCategory === 'os'
      ? specToStrip.hashrateMultiplier ?? 1
      : specToStrip.maxGpus ?? 0;

  const nextInventory = fab.inventory.map((i) => ({
    ...i,
    serialNumbers: i.serialNumbers ? [...i.serialNumbers] : undefined,
  }));
  const existing = nextInventory.find(
    (i) =>
      i.blueprintId === specToStrip!.blueprintId &&
      Math.abs(i.hashRate - primaryHash) < 1e-6 &&
      (i.partCategory ?? 'compute') === specToStrip!.partCategory
  );
  if (existing) {
    existing.qty += 1;
    if (serialToRestore) existing.serialNumbers = [...(existing.serialNumbers ?? []), serialToRestore];
  } else {
    nextInventory.push({
      blueprintId: specToStrip.blueprintId,
      name: specToStrip.name,
      partCategory: specToStrip.partCategory,
      architecture: specToStrip.architecture,
      subFeature: specToStrip.subFeature,
      branch: specToStrip.branch,
      customSpec: specToStrip,
      algo,
      processNode: specToStrip.processNode,
      hashRate: primaryHash,
      watts: specToStrip.watts ?? specToStrip.baseWatts ?? 0,
      heatC: specToStrip.heatC ?? 0,
      wholesaleValueUsd,
      qty: 1,
      qualityGrade: specToStrip.qualityGrade ?? bp?.qualityGrade,
      qualityRoll: specToStrip.qualityRoll ?? bp?.qualityMult,
      serialNumbers: serialToRestore ? [serialToRestore] : undefined,
    });
  }

  const tx: TransactionEntry = {
    id: `tx_fab_strip_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: -refurbFee,
    description: `Extracted custom ${slot} "${specToStrip.name}" from ${rig.name}`,
  };

  const nextRigs = state.rigs.map((r, i) => {
    if (i !== rigIdx) return r;
    const nextParts: RigCustomPartsMap = { ...(r.customParts ?? {}) };
    const nextSerials = { ...(r.customPartSerials ?? {}) };
    let nextGpuIds = [...r.gpuIds];
    let nextComp = ensureRigComponentHealth(r);

    if (slot === 'compute') {
      delete nextParts.compute;
      delete nextSerials.compute;
      return {
        ...r,
        customAsicSpec: undefined,
        customParts: nextParts,
        customPartSerials: nextSerials,
      };
    } else if (slot === 'gpu') {
      nextGpuIds = nextGpuIds.filter((_, gi) => gi !== resolvedGpuIdx);
      const nextGpus = (nextParts.gpus ?? []).filter((_, gi) => gi !== resolvedGpuIdx);
      nextParts.gpus = nextGpus;
      if (nextSerials.gpus) {
        nextSerials.gpus = nextSerials.gpus.filter((_, gi) => gi !== resolvedGpuIdx);
      }
      nextComp = { ...nextComp, gpus: nextComp.gpus.filter((_, gi) => gi !== resolvedGpuIdx) };
      const avgHealth = computeAverageRigHealth(nextComp);
      return {
        ...r,
        gpuIds: nextGpuIds,
        customParts: nextParts,
        customPartSerials: nextSerials,
        componentHealth: nextComp,
        healthPct: avgHealth,
      };
    } else {
      delete nextParts[slot];
      delete nextSerials[slot];
      return {
        ...r,
        customParts: nextParts,
        customPartSerials: nextSerials,
      };
    }
  });

  const nextSerialRegistry = serialToRestore
    ? (fab.serialRegistry ?? []).map((sr) =>
        sr.serialNumber === serialToRestore
          ? {
              ...sr,
              status: 'IN_STOCK' as const,
              installedRigId: undefined,
              history: [...sr.history, `${formatStepLabel(state.stepCount)}: Stripped from ${rig.name}`],
            }
          : sr
      )
    : fab.serialRegistry;

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash - refurbFee,
      rigs: nextRigs,
      fab: {
        ...fab,
        inventory: nextInventory,
        serialRegistry: nextSerialRegistry,
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'STRIP',
          `Extracted "${specToStrip.name}"${serialToRestore ? ` [${serialToRestore}]` : ''} from ${rig.name}`
        ),
      },
      currentCycleStats: {
        ...state.currentCycleStats,
        otherSpendUsd: state.currentCycleStats.otherSpendUsd + refurbFee,
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Extracted custom ${slot.toUpperCase()} "${specToStrip.name}"${
      serialToRestore ? ` [${serialToRestore}]` : ''
    } from ${rig.name} for ${formatUsd(refurbFee)}. It is back in foundry inventory.`,
  };
}

export function stripCustomAsicFromRig(
  state: GameState,
  rigIdx: number
): { ok: boolean; nextState: GameState; summary: string } {
  return stripCustomPartFromRig(state, rigIdx, 'compute');
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

  const exportedSerials = new Set((item.serialNumbers ?? []).slice(0, sellQty));
  const nextInventory = fab.inventory
    .map((entry, i) =>
      i === invIdx
        ? {
            ...entry,
            qty: entry.qty - sellQty,
            serialNumbers: (entry.serialNumbers ?? []).slice(sellQty),
          }
        : entry
    )
    .filter((entry) => entry.qty > 0);

  const nextSerialRegistry =
    exportedSerials.size > 0
      ? (fab.serialRegistry ?? []).map((sr) =>
          exportedSerials.has(sr.serialNumber)
            ? {
                ...sr,
                status: 'EXPORTED' as const,
                history: [...sr.history, `${formatStepLabel(state.stepCount)}: Exported wholesale`],
              }
            : sr
        )
      : fab.serialRegistry;

  const tx: TransactionEntry = {
    id: `tx_fab_sell_${state.stepCount}_${Math.random().toString(36).slice(2, 6)}`,
    step: state.stepCount,
    stepLabel: formatStepLabel(state.stepCount),
    category: 'FAB',
    amountUsd: revenue,
    description: `Wholesale export ${sellQty}x "${item.name}" (${(item.partCategory ?? 'compute').toUpperCase()})`,
  };

  return {
    ok: true,
    nextState: {
      ...state,
      cash: state.cash + revenue,
      fab: {
        ...fab,
        inventory: nextInventory,
        serialRegistry: nextSerialRegistry,
        totalExportRevenueUsd: fab.totalExportRevenueUsd + revenue,
        manufacturingHistory: appendFabHistory(
          fab.manufacturingHistory,
          state.stepCount,
          'EXPORT',
          `Exported ${sellQty}x "${item.name}" for +${formatUsd(revenue)}`
        ),
      },
      transactions: [tx, ...(state.transactions ?? [])].slice(0, 200),
    },
    summary: `Exported ${sellQty}x "${item.name}" wholesale for +${formatUsd(revenue)}!`,
  };
}

export function inspectBatchReport(state: GameState, batchQuery: string): string {
  const fab = buildDefaultFab(state.fab);
  const batches = fab.batchRecords ?? [];
  if (batches.length === 0) return '  No completed production batches recorded yet.';
  const idx = parseInt(batchQuery, 10);
  const batch = !isNaN(idx)
    ? batches[idx - 1]
    : batches.find((b) => b.batchId.toUpperCase() === batchQuery.trim().toUpperCase());
  if (!batch) return `  Batch "${batchQuery}" not found.`;
  return [
    `  PRODUCTION BATCH SPEC & QA REPORT: ${batch.batchId}`,
    `    Blueprint     : ${batch.blueprintName} (Rev ${batch.revisionNumber}) · [${batch.partCategory.toUpperCase()} · ${batch.processNode} · ${batch.branch}]`,
    `    Completed     : ${batch.stepLabel}`,
    `    Units Passed  : ${batch.passedQty}/${batch.requestedQty} (Scrapped: ${batch.scrappedDefectQty})`,
    `    QA / Yield    : QC Score ${batch.qcScore}/100 · Grade ${batch.qualityGrade} · Yield ${(batch.qualityRoll * 100).toFixed(1)}% · Proto: ${batch.prototypeValidated ? 'VALIDATED' : 'UNVALIDATED'}`,
    `    Serials       : ${batch.serialNumbers.join(', ') || 'None'}`,
    `    Notes         : ${batch.notes}`,
  ].join('\n');
}

export function inspectSerialReport(state: GameState, serialQuery: string): string {
  const fab = buildDefaultFab(state.fab);
  const needle = serialQuery.trim().toUpperCase();
  const sr = (fab.serialRegistry ?? []).find((s) => s.serialNumber.toUpperCase() === needle);
  if (!sr) {
    return `  Serial "${serialQuery}" not found in registry. Try "fab history" to see recent serials.`;
  }
  return [
    `  SERIALIZED COMPONENT INSPECTION: ${sr.serialNumber}`,
    `    Model / Batch : ${sr.name} (Rev ${sr.revisionNumber}) · Batch ${sr.batchId}`,
    `    Spec          : ${sr.partCategory.toUpperCase()} · ${sr.processNode} · Branch ${sr.branch} · Grade ${sr.qualityGrade}`,
    `    Binned Telemetry: Hash x${sr.measuredHashMult.toFixed(3)} · Watt x${sr.measuredWattMult.toFixed(3)} · Wear Resist +${Math.round(sr.wearResistance * 100)}%`,
    `    Status        : ${sr.status}${sr.installedRigId ? ` (Rig: ${sr.installedRigId})` : ''}`,
    `    Audit Trail   :`,
    ...sr.history.map((h) => `      - ${h}`),
  ].join('\n');
}

export function formatManufacturingHistoryReport(state: GameState): string {
  const fab = buildDefaultFab(state.fab);
  const batches = (fab.batchRecords ?? []).slice(0, 8);
  const hist = (fab.manufacturingHistory ?? []).slice(0, 12);
  const drafts = fab.draftBlueprints ?? [];
  return [
    `  FOUNDRY MANUFACTURING RECORDS (Built: ${fab.totalUnitsManufactured} · Scrapped: ${fab.totalUnitsScrapped ?? 0} · Serials Issued: ${(fab.serialRegistry ?? []).length})`,
    '',
    `  RECENT BATCHES ("fab batch <#|BATCH-ID>"):`,
    ...(batches.length === 0
      ? ['  (No completed batches yet)']
      : batches.map(
          (b, i) =>
            `  #${i + 1} ${b.batchId} · ${b.passedQty}/${b.requestedQty}x ${b.blueprintName} r${b.revisionNumber} [QC ${b.qcScore}/100 · ${(b.qualityRoll * 100).toFixed(1)}%] -> ${b.serialNumbers[0] ?? '-'}`
        )),
    '',
    `  SAVED DRAFTS (${drafts.length}):`,
    ...(drafts.length === 0
      ? ['  (None)']
      : drafts.map(
          (d, i) =>
            `  D#${i + 1} ${d.name} [${(d.partCategory ?? 'compute').toUpperCase()} ${d.processNode} · Mfg ${d.manufacturabilityPct ?? 85}%] · "fab draft tapeout ${i + 1}"`
        )),
    '',
    `  ACTIVITY LOG ("fab serial <SERIAL>"):`,
    ...(hist.length === 0
      ? ['  (No manufacturing log entries yet)']
      : hist.map((h) => `  [${h.stepLabel} · ${h.kind}] ${h.summary}`)),
  ].join('\n');
}

export function formatFabStatusReport(state: GameState): string {
  const gate = isFabUnlocked(state);
  const fab = buildDefaultFab(state.fab);
  const nextLineCost = fab.linesCount < 3 ? formatUsd(getFabLineCost(fab.linesCount)) : 'MAX';

  if (!gate.ok) {
    return [
      `  SEMICONDUCTOR & HARDWARE MANUFACTURING FOUNDRY [LOCKED]`,
      `  Requirement: ${gate.reason}`,
      `  Expand to a Warehouse (or higher) and complete "Semiconductor Wafer Lithography" in R&D.`,
    ].join('\n');
  }

  const bpRows =
    fab.blueprints.length === 0
      ? ['  (No blueprints taped out yet — run "fab design" to launch the Engineering Wizard)']
      : fab.blueprints.map((bp, i) => {
          const cat = (bp.partCategory ?? 'compute').toUpperCase().padEnd(7);
          const tag = `${DESIGN_PROFILE_SPECS[bp.designProfile ?? 'BALANCED'].label.slice(0, 4)}${
            bp.qualityGrade ? `-${bp.qualityGrade}` : ''
          }`;
          const protoTag = bp.prototypeReport ? bp.prototypeReport.status : 'UNTESTED';
          const specDesc = bp.customSpec
            ? formatCustomComponentSummaryLine(bp.customSpec)
            : `${bp.algo} ${formatHashrate(bp.hashRate, bp.algo)} · ${bp.watts}W`;
          return `  #${i + 1} [${cat}] ${bp.name.padEnd(20)} r${bp.revisionNumber ?? 1} ${bp.processNode.padEnd(8)} ${tag.padEnd(7)} Mfg:${bp.manufacturabilityPct ?? 85}% [${protoTag}] Unit:${formatUsd(
            bp.unitCostUsd,
            bp.unitCostUsd >= 10_000
          )} Export:${formatUsd(bp.wholesaleValueUsd, bp.wholesaleValueUsd >= 10_000)}\n     Spec: ${specDesc}`;
        });

  const qRows =
    fab.productionQueue.length === 0
      ? ['  (Production queue idle)']
      : fab.productionQueue.map(
          (q, i) =>
            `  #${i + 1} ${q.batchId ?? ''} ${q.qty}x ${q.blueprintName.padEnd(20)} [${q.totalSteps - q.stepsRemaining}/${
              q.totalSteps
            } fab pts · ~${Math.ceil(q.stepsRemaining / Math.max(1, fab.linesCount))}st left]`
        );

  const invRows =
    fab.inventory.length === 0
      ? ['  (Inventory empty)']
      : fab.inventory.map((it, i) => {
          const cat = (it.partCategory ?? 'compute').toUpperCase().padEnd(7);
          const yieldTag = `${((it.qualityRoll ?? 1) * 100).toFixed(1)}%${
            it.qualityGrade ? ` ${it.qualityGrade}` : ''
          }`;
          const spec = inventoryItemToCustomSpec(it);
          const serialPreview =
            it.serialNumbers && it.serialNumbers.length > 0
              ? ` · S/N: ${it.serialNumbers.slice(0, 2).join(', ')}${it.serialNumbers.length > 2 ? '…' : ''}`
              : '';
          return `  #${i + 1} ${String(it.qty).padStart(2)}x [${cat}] ${it.name.padEnd(20)} ${it.processNode.padEnd(
            8
          )} ${yieldTag.padEnd(9)} Export:${formatUsd(
            it.wholesaleValueUsd,
            it.wholesaleValueUsd >= 10_000
          )}/ea\n     Spec: ${formatCustomComponentSummaryLine(spec)}${serialPreview}`;
        });

  return [
    `  CUSTOM HARDWARE & SILICON FOUNDRY (Lines: ${fab.linesCount}/3 · Upkeep: ${formatUsd(
      getFabCycleUpkeep(fab.linesCount)
    )}/cycle · Built: ${fab.totalUnitsManufactured} · Exports: ${formatUsd(
      fab.totalExportRevenueUsd
    )})`,
    `  Next Fab Line Cost: ${nextLineCost} · Engineering Budget: ${getFabEngineeringPointBudget(state)} pts · Drafts: ${(fab.draftBlueprints ?? []).length}`,
    ``,
    `  BLUEPRINTS ("fab design" wizard | "fab proto <#>" | "fab revise <#>" | "fab compare <a#> <b#>")`,
    ...bpRows,
    ``,
    `  ACTIVE PRODUCTION QUEUE ("fab produce <bp#> <qty>")`,
    ...qRows,
    ``,
    `  FINISHED INVENTORY ("fab deploy <inv#> <rig#> [gpuSlot]" | "fab sell <inv#> <qty|all>")`,
    ...invRows,
    ``,
    `  COMMANDS:`,
    `    fab line build                               Commission cleanroom fab line (1..3)`,
    `    fab design                                   Interactive Component Engineering Wizard (All 7 parts)`,
    `    fab proto <bp#>                              Run prototype validation & calibration bench test`,
    `    fab revise <bp#> <perf|bal|eff|compact>      Create numbered blueprint revision (45% NRE)`,
    `    fab compare <bpA#> <bpB#>                    Compare specs, manufacturability & yield side-by-side`,
    `    fab produce <bp#> <qty>                      Manufacture tracked QA batch (1..20) with serials`,
    `    fab history | fab batch <#> | fab serial <S> Inspect batch QC & unit serial genealogy`,
    `    fab deploy <inv#> <rig#> [gpuSlot]           Install custom part into a rig`,
    `    fab strip <rig#> [slot] [gpuSlot]            Pull custom part back into inventory (2% refurb)`,
    `    fab sell <inv#> <qty|all>                    Export custom hardware wholesale`,
  ].join('\n');
}
