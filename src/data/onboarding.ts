import { FACILITY_TIERS } from './catalog';
import {
  GameState,
  GuidedOnboardingState,
  GuidedPaceMode,
  GuidedSystemStatus,
  OnboardingMode,
} from '../types/game';

/** Facility names/specs are read from the live catalog so guide text can never drift from the data. */
const GARAGE_FACILITY_NAME = FACILITY_TIERS[1]?.name ?? 'Garage Operation';
const FIRST_FACILITY = FACILITY_TIERS[0];
const LAST_FACILITY = FACILITY_TIERS[FACILITY_TIERS.length - 1];

const FACILITY_TIER_NOTES: string[] = [
  'Starter home setup, strict residential noise cap.',
  'Unlocks Tier-1 staff & stronger circuits.',
  'Unlocks senior staff & commercial power.',
  'Industrial floor for dense GPU/ASIC rows.',
  'Substation power + heavy cooling headroom.',
  'Institutional hyperscale mining campus.',
];

const FACILITY_TIER_LINES = FACILITY_TIERS.flatMap((f, idx) => [
  `    ${idx + 1}. ${f.name} (${f.maxRigs} slots, ${f.maxPowerKw} kW, ${f.noiseLimitDba} dBA)`,
  `       -> ${FACILITY_TIER_NOTES[idx] ?? ''}`,
]);

export type GuidedSystemId =
  | 'contracts'
  | 'staff'
  | 'rivals'
  | 'pr'
  | 'ops'
  | 'blackmarket'
  | 'fab'
  | 'coins'
  | 'gen7';

export interface SystemUnlockStatus {
  contracts: boolean;
  staff: boolean;
  rivals: boolean;
  pr: boolean;
  ops: boolean;
  blackmarket: boolean;
  fab: boolean;
  coins: boolean;
  gen7: boolean;
  unlockNotes: Record<GuidedSystemId, string>;
}

export interface GuidedStageTask {
  id: string;
  label: string;
  hintCommand: string;
  autoCheck: (state: GameState) => boolean;
}

export interface GuidedStageSpec {
  id: string;
  stageNumber: number;
  title: string;
  unlocksLabel: string;
  unlockSystems: GuidedSystemId[];
  tasks: GuidedStageTask[];
}

export const GUIDED_STAGES: GuidedStageSpec[] = [
  {
    id: 'stage_1_boot',
    stageNumber: 1,
    title: 'Stage 1: Boot Rig & Telemetry Basics',
    unlocksLabel: 'Core terminal mining, inspection, and R&D loop',
    unlockSystems: [],
    tasks: [
      {
        id: 'task_inspect_starter',
        label: 'Inspect your starter rig & component health bars',
        hintCommand: 'inspect 1',
        autoCheck: (s) => (s.seenTutorials ?? []).includes('ctx_inspect') || (s.seenTutorials ?? []).includes('ctx_rigs') || s.stepCount >= 2,
      },
      {
        id: 'task_first_steps',
        label: 'Mine 3 steps of live crypto revenue',
        hintCommand: 'step 3',
        autoCheck: (s) => s.stepCount >= 3,
      },
    ],
  },
  {
    id: 'stage_2_contracts',
    stageNumber: 2,
    title: 'Stage 2: Contracts & First R&D',
    unlocksLabel: 'Unlocks Enterprise Contracts ("contracts")',
    unlockSystems: ['contracts'],
    tasks: [
      {
        id: 'task_start_or_finish_rd',
        label: 'Queue or complete an R&D technology node',
        hintCommand: 'research start 1',
        autoCheck: (s) => Boolean(s.activeResearchId) || s.unlockedResearch.length >= 1,
      },
      {
        id: 'task_expand_or_repair',
        label: 'Add a 2nd rig or service existing hardware',
        hintCommand: 'build preset 1  (or "repair 1" / "repaste 1")',
        autoCheck: (s) =>
          s.rigs.length >= 2 ||
          (s.stats?.rigPurchasesCount ?? 0) >= 1 ||
          (s.stats?.repairsCompleted ?? 0) >= 1 ||
          (s.seenTutorials ?? []).includes('ctx_repaste'),
      },
    ],
  },
  {
    id: 'stage_3_staff',
    stageNumber: 3,
    title: 'Stage 3: Facilities & Crew Management',
    unlocksLabel: 'Unlocks Staff Hiring ("staff") & Rivals/PR ("rivals" / "pr")',
    unlockSystems: ['staff', 'rivals', 'pr'],
    tasks: [
      {
        id: 'task_facility_or_cash',
        label: `Rent ${GARAGE_FACILITY_NAME} or reach $1,800 cash`,
        hintCommand: 'facilities',
        autoCheck: (s) => s.facilityId !== 'fac_bedroom' || s.cash >= 1800 || s.stepCount >= 8,
      },
      {
        id: 'task_hire_staff_or_contract',
        label: 'Complete a contract or hire your first specialist',
        hintCommand: 'staff  (or "contracts")',
        autoCheck: (s) => s.employees.length >= 1 || (s.stats?.contractsCompleted ?? 0) >= 1 || s.stepCount >= 10,
      },
    ],
  },
  {
    id: 'stage_4_underground',
    stageNumber: 4,
    title: 'Stage 4: Underground Ops & Risk Control',
    unlocksLabel: 'Unlocks Covert Ops & Black Market ("ops" / "blackmarket")',
    unlockSystems: ['ops', 'blackmarket'],
    tasks: [
      {
        id: 'task_check_rivals',
        label: 'Review rival market share & spot prices',
        hintCommand: 'rivals',
        autoCheck: (s) =>
          s.facilityId !== 'fac_bedroom' || s.stepCount >= 14 || s.regulatoryScrutiny >= 18 || (s.stats?.covertOpsCount ?? 0) >= 1,
      },
    ],
  },
  {
    id: 'stage_5_fab_coins',
    stageNumber: 5,
    title: 'Stage 5: Custom Foundry & Coin Economics',
    unlocksLabel: 'Unlocks Custom Fab Engineering ("fab") & Coin Creation ("coin create")',
    unlockSystems: ['fab', 'coins'],
    tasks: [
      {
        id: 'task_wafer_rd',
        label: 'Unlock Semiconductor Wafer Lithography or reach Warehouse tier',
        hintCommand: 'research',
        autoCheck: (s) =>
          s.unlockedResearch.includes('res_wafer_lithography') ||
          FACILITY_TIERS.findIndex((f) => f.id === s.facilityId) >= 3 ||
          (s.fab?.linesCount ?? 0) > 0,
      },
      {
        id: 'task_prototype_or_coin',
        label: 'Build a Fab Line, test a prototype, or launch a legitimate custom coin',
        hintCommand: 'fab  (or "coin create")',
        autoCheck: (s) =>
          (s.fab?.blueprints.length ?? 0) >= 1 ||
          Object.values(s.coins).some((c) => Boolean(c.isPlayerCreated)),
      },
    ],
  },
  {
    id: 'stage_6_gen7',
    stageNumber: 6,
    title: 'Stage 6: Gen-7 Quantum & Photonic Frontier',
    unlocksLabel: 'Unlocks Gen-7 Quantum Cryo & Optical Matrix Engineering',
    unlockSystems: ['gen7'],
    tasks: [
      {
        id: 'task_gen7_rd',
        label: 'Research Quantum-Photonic Hybrid Architecture',
        hintCommand: 'tutorial gen7',
        autoCheck: (s) => s.unlockedResearch.includes('res_gen7_quantum_photonic'),
      },
    ],
  },
];

export function buildDefaultGuidedState(): GuidedOnboardingState {
  return {
    paused: false,
    pace: 'NORMAL',
    currentStageIdx: 0,
    systemStatuses: {
      contracts: 'LOCKED',
      staff: 'LOCKED',
      rivals: 'LOCKED',
      pr: 'LOCKED',
      ops: 'LOCKED',
      blackmarket: 'LOCKED',
      fab: 'LOCKED',
      coins: 'LOCKED',
      gen7: 'LOCKED',
    },
    completedChecklistIds: [],
    revisitedTopics: [],
  };
}

export function getEffectiveOnboardingMode(
  state: Pick<GameState, 'onboardingMode' | 'devMode' | 'isSandbox'>
): OnboardingMode {
  if (state.devMode || state.isSandbox) return 'VETERAN';
  return state.onboardingMode ?? 'GUIDED';
}

export function evaluateGuidedChecklist(state: GameState): {
  mode: OnboardingMode;
  paused: boolean;
  pace: GuidedPaceMode;
  currentStageIdx: number;
  stages: Array<{
    spec: GuidedStageSpec;
    completed: boolean;
    active: boolean;
    tasks: Array<GuidedStageTask & { done: boolean }>;
  }>;
  completedTaskCount: number;
  totalTaskCount: number;
  nextHintCommand: string;
} {
  const mode = getEffectiveOnboardingMode(state);
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  const manualDone = new Set(guided.completedChecklistIds ?? []);

  let allPriorDone = true;
  let activeIdx = GUIDED_STAGES.length - 1;
  let foundActive = false;

  const stages = GUIDED_STAGES.map((spec, idx) => {
    const tasks = spec.tasks.map((t) => ({
      ...t,
      done: manualDone.has(t.id) || t.autoCheck(state),
    }));
    const completed = allPriorDone && tasks.every((t) => t.done);
    const active = !completed && allPriorDone && !foundActive;
    if (active) {
      activeIdx = idx;
      foundActive = true;
    }
    if (!completed) allPriorDone = false;
    return { spec, completed, active, tasks };
  });

  const completedTaskCount = stages.reduce(
    (s, st) => s + st.tasks.filter((t) => t.done).length,
    0
  );
  const totalTaskCount = stages.reduce((s, st) => s + st.tasks.length, 0);
  const activeStage = stages[activeIdx];
  const nextTask = activeStage?.tasks.find((t) => !t.done);
  const nextHintCommand = nextTask?.hintCommand ?? 'status';

  return {
    mode,
    paused: guided.paused,
    pace: guided.pace,
    currentStageIdx: activeIdx,
    stages,
    completedTaskCount,
    totalTaskCount,
    nextHintCommand,
  };
}

export function completeGuidedTask(state: GameState, taskIdOrNum: string): { ok: boolean; nextState: GameState; summary: string } {
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  const checklist = evaluateGuidedChecklist(state);
  const flatTasks = checklist.stages.flatMap((st) => st.tasks);

  let target = flatTasks.find((t) => t.id === taskIdOrNum);
  const numIdx = Number.parseInt(taskIdOrNum, 10);
  if (!target && Number.isFinite(numIdx) && numIdx >= 1 && numIdx <= flatTasks.length) {
    target = flatTasks[numIdx - 1];
  }
  if (!target) {
    return { ok: false, nextState: state, summary: `Checklist task "${taskIdOrNum}" not found.` };
  }
  const doneSet = new Set(guided.completedChecklistIds ?? []);
  doneSet.add(target.id);
  const nextGuided: GuidedOnboardingState = {
    ...guided,
    completedChecklistIds: Array.from(doneSet),
  };
  const nextState = { ...state, guidedOnboarding: nextGuided };
  const after = evaluateGuidedChecklist(nextState);
  return {
    ok: true,
    nextState: {
      ...nextState,
      guidedOnboarding: { ...nextGuided, currentStageIdx: after.currentStageIdx },
    },
    summary: `Checked off guided task: "${target.label}". Progress: ${after.completedTaskCount}/${after.totalTaskCount}.`,
  };
}

export function pauseGuidedOnboarding(state: GameState, paused: boolean): GameState {
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  return {
    ...state,
    guidedOnboarding: { ...guided, paused },
  };
}

export function setGuidedPace(state: GameState, pace: GuidedPaceMode): GameState {
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  return {
    ...state,
    guidedOnboarding: { ...guided, pace },
  };
}

export function dismissGuidedSystem(state: GameState, sysId: string): GameState {
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  return {
    ...state,
    guidedOnboarding: {
      ...guided,
      systemStatuses: {
        ...guided.systemStatuses,
        [sysId]: 'DISMISSED' as GuidedSystemStatus,
      },
    },
  };
}

export function revisitGuidedTopic(state: GameState, topicId: string): GameState {
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  const list = Array.from(new Set([...(guided.revisitedTopics ?? []), topicId]));
  return {
    ...state,
    guidedOnboarding: {
      ...guided,
      revisitedTopics: list,
    },
  };
}

export function getUnlockedSystems(
  state: Pick<
    GameState,
    | 'onboardingMode'
    | 'guidedOnboarding'
    | 'devMode'
    | 'devUnlockAll'
    | 'isSandbox'
    | 'stepCount'
    | 'rigs'
    | 'unlockedResearch'
    | 'facilityId'
    | 'cash'
    | 'regulatoryScrutiny'
    | 'employees'
    | 'stats'
    | 'fab'
    | 'coins'
  >
): SystemUnlockStatus {
  const mode = getEffectiveOnboardingMode(state);
  const allOpen = mode === 'VETERAN' || state.devUnlockAll;
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === state.facilityId));
  const doneIds = new Set(state.guidedOnboarding?.completedChecklistIds ?? []);

  const contracts =
    allOpen ||
    state.stepCount >= 3 ||
    state.rigs.length >= 2 ||
    state.unlockedResearch.length >= 1 ||
    (state.stats?.contractsCompleted ?? 0) > 0 ||
    doneIds.has('task_first_steps');

  const staff =
    allOpen ||
    facIdx >= 1 ||
    state.cash >= 1800 ||
    state.stepCount >= 8 ||
    state.employees.length > 0 ||
    doneIds.has('task_facility_or_cash');

  const rivals =
    allOpen ||
    facIdx >= 1 ||
    state.rigs.length >= 2 ||
    state.stepCount >= 10 ||
    doneIds.has('task_hire_staff_or_contract');

  const pr = rivals;

  const ops =
    allOpen ||
    facIdx >= 1 ||
    state.stepCount >= 14 ||
    state.regulatoryScrutiny >= 18 ||
    (state.stats?.covertOpsCount ?? 0) > 0 ||
    doneIds.has('task_check_rivals');

  const blackmarket = ops;

  const fab =
    allOpen ||
    facIdx >= 3 ||
    state.unlockedResearch.includes('res_wafer_lithography') ||
    (state.fab?.linesCount ?? 0) > 0 ||
    doneIds.has('task_wafer_rd');

  const coins =
    allOpen ||
    facIdx >= 2 ||
    state.cash >= 5000 ||
    Object.values(state.coins ?? {}).some((c) => Boolean(c.isPlayerCreated)) ||
    doneIds.has('task_prototype_or_coin');

  const gen7 =
    allOpen ||
    state.unlockedResearch.includes('res_gen7_quantum_photonic') ||
    doneIds.has('task_gen7_rd');

  return {
    contracts,
    staff,
    rivals,
    pr,
    ops,
    blackmarket,
    fab,
    coins,
    gen7,
    unlockNotes: {
      contracts: 'Unlocks at Step 3, 2nd rig, or 1st completed R&D node',
      staff: `Unlocks at ${GARAGE_FACILITY_NAME}, $1,800 Cash, or Step 8`,
      rivals: `Unlocks at ${GARAGE_FACILITY_NAME}, 2nd rig, or Step 10`,
      pr: `Unlocks at ${GARAGE_FACILITY_NAME}, 2nd rig, or Step 10`,
      ops: `Unlocks at ${GARAGE_FACILITY_NAME}, Step 14, or Heat >= 18`,
      blackmarket: `Unlocks alongside Underground Ops at ${GARAGE_FACILITY_NAME} or Step 14`,
      fab: 'Unlocks at Warehouse tier or "Semiconductor Wafer Lithography" R&D',
      coins: `Unlocks at Commercial tier, $5,000 Cash, or Checklist Stage 5`,
      gen7: 'Unlocks with "Quantum-Photonic Hybrid Architecture" R&D',
    },
  };
}

export interface EarlyObjective {
  id: string;
  title: string;
  hint: string;
  rewardCash: number;
  rewardRp: number;
  completed: boolean;
}

export function evaluateEarlyObjectives(state: GameState): EarlyObjective[] {
  const seen = new Set(state.seenTutorials ?? []);
  const claimed = new Set(state.claimedObjectives ?? []);

  return [
    {
      id: 'obj_inspect_rig',
      title: 'Inspect your starter rig & component health',
      hint: 'Run "inspect 1" or "rigs" to check chassis, CPU, PSU & cooling health.',
      rewardCash: 60,
      rewardRp: 3,
      completed:
        claimed.has('obj_inspect_rig') ||
        seen.has('ctx_inspect') ||
        seen.has('ctx_rigs') ||
        state.stepCount >= 2,
    },
    {
      id: 'obj_advance_steps',
      title: 'Mine your first 3 steps of crypto revenue',
      hint: 'Run "step 3" (or let the 30s auto-step advance) to earn auto-sold USD.',
      rewardCash: 100,
      rewardRp: 4,
      completed: claimed.has('obj_advance_steps') || state.stepCount >= 3,
    },
    {
      id: 'obj_second_rig',
      title: 'Expand your fleet to 2 mining rigs',
      hint: 'Run "build rig", "presets" -> "build preset 1", or buy from "usedmarket".',
      rewardCash: 150,
      rewardRp: 6,
      completed:
        claimed.has('obj_second_rig') ||
        state.rigs.length >= 2 ||
        (state.stats?.rigPurchasesCount ?? 0) >= 1,
    },
    {
      id: 'obj_first_research',
      title: 'Complete your first R&D technology node',
      hint: 'Run "research", pick "research start 1", then advance steps to finish it.',
      rewardCash: 175,
      rewardRp: 8,
      completed: claimed.has('obj_first_research') || state.unlockedResearch.length >= 1,
    },
    {
      id: 'obj_maintain_rig',
      title: 'Maintain a rig or component (repair or repaste)',
      hint: 'Run "repair 1 <part>", "repair 1", or "repaste 1" to keep thermals & health high.',
      rewardCash: 125,
      rewardRp: 5,
      completed:
        claimed.has('obj_maintain_rig') ||
        (state.stats?.repairsCompleted ?? 0) >= 1 ||
        seen.has('ctx_repaste'),
    },
    {
      id: 'obj_first_contract',
      title: 'Complete 1 Enterprise Contract',
      hint: 'Run "contracts" -> "contract accept 1" and mine the target volume.',
      rewardCash: 250,
      rewardRp: 10,
      completed: claimed.has('obj_first_contract') || (state.stats?.contractsCompleted ?? 0) >= 1,
    },
    {
      id: 'obj_upgrade_facility',
      title: `Expand to ${GARAGE_FACILITY_NAME} (or larger facility)`,
      hint: 'Run "facilities" and rent/buy tier 2 when your Bedroom slots/kW cap out.',
      rewardCash: 400,
      rewardRp: 12,
      completed: claimed.has('obj_upgrade_facility') || state.facilityId !== 'fac_bedroom',
    },
  ];
}

export interface TutorialTopicGuide {
  id: string;
  title: string;
  summary: string;
  lines: string[];
  nextCommand: string;
}

export const TUTORIAL_TOPICS: Record<string, TutorialTopicGuide> = {
  hardware: {
    id: 'hardware',
    title: 'HARDWARE, RIG BUILDING & INDIVIDUAL COMPONENT HEALTH',
    summary: 'How rig parts, hybrid ASIC+GPU chassis, individual wear, and single-part repairs work.',
    lines: [
      '  8-PART RIG ARCHITECTURE:',
      '    Chassis   -> Sets GPU slot limit (or ASIC rack / Hybrid ASIC+GPU mode) & passive cooling.',
      '    Compute   -> CPU/FPGA/ASIC/QPU core hashing engine & algorithm family.',
      '    GPUs      -> Stackable ETHASH/KAWPOW/EQUIHASH/SCRYPT/QHASH accelerators.',
      '    Storage   -> RAM/NVMe efficiency bonus (+% revenue) & POST storage plots.',
      '    PSU       -> Watt ceiling MUST cover raw component draw or rig halts.',
      '    Cooling   -> Drops equilibrium temperature; Cryo-rated units stabilize Quantum QPUs.',
      '    OS Kernel -> Multiplies hashrate & power draw; improves crash stability.',
      '',
      '  INDIVIDUAL COMPONENT HEALTH & TARGETED REPAIRS:',
      '    - Every rig tracks separate health % for chassis, compute, each GPU, storage, PSU, and cooling.',
      '    - Overall rig health shown in "rigs" is the AVERAGE of all installed components.',
      '    - If ANY single component falls to <= 20%, the entire rig halts (NEEDS_REPAIR).',
      '    - Run "inspect <#>" to see component bars, serial numbers, and single-part repair prices.',
      '    - Repair commands: "repair 1 gpu", "repair 1 gpu 2", "repair 1 psu", or "repair 1".',
      '    - Run "tinker <#>" to swap individual parts with 60% trade-in credit.',
    ],
    nextCommand: 'inspect 1',
  },
  power: {
    id: 'power',
    title: 'ELECTRICITY CONTRACTS & THERMAL COOLING',
    summary: 'Managing kW breaker limits, billing cycles, thermal throttling, and spatial cooling.',
    lines: [
      '  ELECTRICITY & POWER CONTRACTS ("power"):',
      '    - Power costs accrue continuously every step based on active wall kW x $/kWh.',
      '    - Utility bills, facility rent, and payroll settle every 30 steps.',
      '    - Exceeding your facility kW cap trips breakers and halts rigs (UNDERPOWERED).',
      '    - Use "power contract <1..4>" to trade $/kWh rate vs. kW capacity headroom:',
      '        Spot Budget (-rate, lower cap) | Standard | High-Cap (+cap) | Dispatch Flex.',
      '    - Upgrade circuits via "facility upgrade 1" or hire a Master Electrician.',
      '',
      '  THERMAL & COOLING MANAGEMENT ("cool" / "repaste"):',
      '    - Below 82C: 100% hash output.  82C-95C: THROTTLED.  >= 96C: THERMAL SHUTDOWN.',
      '    - Thermal paste wears down over steps; run "repaste <#>" for -6C relief.',
      '    - Place room cooling ("cool add <fan|indfan|ac|liquid|chiller|hvac>") to cool nearby rigs.',
      '    - Overclocking ("overclock") and TURBO firmware spike watts & heat nonlinearly.',
    ],
    nextCommand: 'power',
  },
  facilities: {
    id: 'facilities',
    title: 'FACILITY PROGRESSION & INFRASTRUCTURE UPGRADES',
    summary: `Scaling from ${FIRST_FACILITY.name} to ${LAST_FACILITY.name}, rent vs ownership, and noise limits.`,
    lines: [
      `  ${FACILITY_TIERS.length} FACILITY TIERS ("facilities"):`,
      ...FACILITY_TIER_LINES,
      '',
      '  RENT vs BUY, ROOMS & UPGRADES:',
      '    - Renting costs low upfront cash + recurring 30-step rent; Buying eliminates rent.',
      '    - Run "rooms" (or "floorplan") to view your ASCII room floor-plan blueprint.',
      '    - Move rigs into cooler bays ("rig <#> room <#>") and add room coolers ("cool room <#> <room#>").',
      '    - Construct extra expansion wings anytime via "room expand".',
      '    - Run "facility upgrade <1..6>" for extra circuits, ducts, bays, and cooling loops.',
      '    - Exceeding facility dBA noise limit triggers city noise ordinance fines every 5 steps.',
    ],
    nextCommand: 'rooms',
  },
  employees: {
    id: 'employees',
    title: 'EMPLOYEE ROLES, SKILLS, SHIFTS & MORALE',
    summary: 'Hiring specialists, managing shifts/priorities, and avoiding workload burnout.',
    lines: [
      '  7 SPECIALIST ROLES ("staff" / "hire <role>"):',
      '    tech     Hardware Technician -> Slows wear, discounts repairs, caps >84C heat.',
      '    elec     Master Electrician  -> Expands kW capacity, cuts electrical waste.',
      '    eng      Systems Engineer    -> Boosts fleet hashrate via kernel tuning.',
      '    res      Research Scientist  -> Generates RP/step & speeds active R&D.',
      '    mgr      Operations Manager  -> Cuts rent/maint overhead & lifts efficiency.',
      '    pr       PR Strategist       -> Amplifies PR campaigns & cuts cooldowns.',
      '    analyst  Market Analyst      -> Improves automatic coin liquidation payouts.',
      '',
      '  SHIFTS, TRAINING & MORALE:',
      '    - Staff gain XP every step (Skill Lv 1..5); use "train <#>" to boost immediately.',
      '    - "shift <#> <day|night|24/7>": 24/7 boosts Engineer/Researcher output at +35% pay.',
      '    - "priority <#> <thermal|care|hash|research>": focuses specialist bonuses.',
      '    - Keep payroll covered & workload balanced: mass low morale can trigger a strike!',
    ],
    nextCommand: 'staff',
  },
  contracts: {
    id: 'contracts',
    title: 'ENTERPRISE CONTRACTS & REPUTATION',
    summary: 'Accepting timed hash/coin delivery SLAs and building media credibility.',
    lines: [
      '  HOW CONTRACTS WORK ("contracts"):',
      '    - Enterprise clients post 3-4 contracts gated by your Reputation (Media Credibility).',
      '    - Starter 0-Rep contracts are always available so you can earn early bonuses.',
      '    - Higher Reputation tiers unlock multi-thousand-dollar institutional deals.',
      '',
      '  FULFILLING & MANAGING RISK:',
      '    - Only 1 contract can be active at a time ("contract accept <1..4>").',
      '    - Progress fills automatically each step as your rigs mine the target coin.',
      '    - Completing before the deadline pays bonus Cash, RP, and Reputation.',
      '    - Missing the deadline or running "contract abandon" incurs a fine & rep penalty.',
    ],
    nextCommand: 'contracts',
  },
  ops: {
    id: 'ops',
    title: 'PR CAMPAIGNS, RIVALS & REPUTATION OPERATIONS',
    summary: 'Tracking rival syndicates, running legal PR hype/FUD, and balancing Heat.',
    lines: [
      '  RIVAL SYNDICATES ("rivals" / "rivals compare"):',
      '    - AI mining syndicates grow each step, lifting global network difficulty.',
      '    - Compare your Cash, Net Worth, Reputation, and Hash Share against them.',
      '',
      '  LEGAL PR OPERATIONS ("pr"):',
      '    - Launch Hype campaigns on coins you mine to boost spot prices & sentiment.',
      '    - Launch FUD campaigns on rival coins (costs some media credibility + small Heat).',
      '    - Watch Regulatory Scrutiny ("Heat" 0-100): high Heat escalates investigations.',
    ],
    nextCommand: 'rivals',
  },
  blackmarket: {
    id: 'blackmarket',
    title: 'UNDERGROUND OPS, SHELL LIFECYCLE, RAIDS & AUDITS',
    summary:
      'Staged shell coins, 2-phase vault raids, cumulative investigations, compliance recovery & illicit ROMs.',
    lines: [
      '  STAGED SHELL TOKENS ("ops coin ...") — ILLEGAL SCAM TOKENS:',
      '    - "ops coin dev <TICKER> <Name>": Draft token in CONCEPT stage.',
      '    - "ops coin seed <TICKER> <usd> [spoof]": Seed pool & optionally spoof an audit badge.',
      '    - "ops coin <TICKER> <Name>" / "ops shill" / "ops rug": Launch, pump hype, pull pool.',
      '    - Traced rugs leave permanent Scandal Marks and drag market confidence.',
      '',
      '  2-PHASE VAULT RAIDS & CUMULATIVE INVESTIGATIONS:',
      '    - "ops raid prep <rival#>": Recon defenses & loot range before striking.',
      '    - "ops raid exec <stealth|zeroday|bribe>": Strike with tailored risk/loot/heat.',
      '    - Heat & Suspicion climb through: NONE -> WATCHLIST -> FORMAL_AUDIT -> SANCTIONED -> PROBATION.',
      '    - Sanctions penalize mining payout (-15%); recover via "ops comply" or "ops settle".',
      '    - "ops log" shows persistent underground ledger records.',
    ],
    nextCommand: 'ops',
  },
  engineering: {
    id: 'engineering',
    title: 'ADVANCED HARDWARE ENGINEERING & BLUEPRINT REVISIONS',
    summary: 'Architecting custom parts across 7 slots, live manufacturability, drafts & revisions.',
    lines: [
      '  MULTI-COMPONENT DESIGN WIZARD ("fab design"):',
      '    - Design custom Chassis, Compute (ASIC/CPU/QPU), GPUs, Storage, PSU, Cooling, or OS.',
      '    - Tune topology (MONOLITHIC / CHIPLET_QUAD / MESH_TENSOR), bus width, SRAM,',
      '      voltage/clock bias, GPU HBM3/Optical memory, and Cryo vs Photonic Gen-7 parameters.',
      '    - Balance the engineering point budget across Density, Efficiency, Thermals, Reliability.',
      '    - Watch live Manufacturability % — extreme clocks/tiny nodes cut yield unless tuned!',
      '',
      '  DRAFTS, REVISIONS & COMPARISON:',
      '    - Save work-in-progress inside the wizard as a Draft blueprint, or Tape Out immediately.',
      '    - "fab revise <bp#> [profile]": Spin Rev 2+ from an existing blueprint for an incremental fee.',
      '    - "fab compare <bp1#> <bp2#>": Side-by-side telemetry, watts, mfg %, and cost breakdown.',
    ],
    nextCommand: 'fab',
  },
  manufacturing: {
    id: 'manufacturing',
    title: 'PROTOTYPE QA, PRODUCTION BATCHES & SERIAL REGISTRY',
    summary: 'Bench validation, serial numbers, inspection reports, and wafer yield tracking.',
    lines: [
      '  PROTOTYPE BENCH TESTING ("fab proto <bp#>"):',
      '    - Validate designs BEFORE mass production to discover flaws and earn Yield & Wear bonuses.',
      '    - Unvalidated risky blueprints suffer higher scrap rates on the fab line.',
      '',
      '  BATCHES, SERIALS & QUALITY CONTROL:',
      '    - Every queued batch ("fab produce <bp#> <qty>") earns a unique Batch ID & Serial Numbers.',
      '    - "fab batch [batch#]" inspects QC grade (A/B/C), defect scrap count, and serial roster.',
      '    - "fab serial <SERIAL>" traces measured hash/watt calibration, wear resistance & installed rig.',
      '    - "fab history" prints the chronological manufacturing & deployment log.',
    ],
    nextCommand: 'fab',
  },
  gen7: {
    id: 'gen7',
    title: 'GEN-7 QUANTUM CRYO vs PHOTONIC OPTICAL BRANCHES',
    summary: 'Distinct late-game hardware paradigms: mK Dilution Quantum QPUs vs Optical Mesh Photonics.',
    lines: [
      '  TWO DISTINCT GEN-7 TECHNOLOGY BRANCHES:',
      '    QUANTUM Branch ("res_gen7_dilution_cryo"):',
      '      - Superconducting Qubit Cores tuned with logical qubits, coherence (us) & mK target.',
      '      - Excels on QHASH (QBC) and extreme density, but REQUIRES Cryo cooling or Cryo bay.',
      '      - Without Cryo-rated cooling/chassis, thermal decoherence drops output to 0.70x!',
      '',
      '    PHOTONIC Branch ("res_gen7_photonic_waveguides"):',
      '      - Laser-Matrix waveguided compute & Optical QGPUs tuned by lanes, wavelength (1310/1550nm), WDM.',
      '      - Runs vastly cooler with ultra-low watt-per-hash, thriving in Optical Backplane chassis.',
      '      - Check "rig <#> inspect" or "fab design" to verify Cryo / Optical compatibility.',
    ],
    nextCommand: 'research',
  },
  coins: {
    id: 'coins',
    title: 'LEGITIMATE MINEABLE COINS & HARDWARE CONSTRAINTS',
    summary: 'Multi-algorithm mining, VRAM/RAM/branch requirements, and launching your own coin.',
    lines: [
      '  9 STARTER COINS ACROSS 8 ALGORITHMS ("coins"):',
      '    BTC (SHA256) · LTC/DOGE (SCRYPT) · RVN (KAWPOW >=4GB VRAM) · XMR (RANDOMX)',
      '    ETH (ETHASH >=6GB VRAM) · ZEC (EQUIHASH >=4GB VRAM) · XCH (POST) · QBC (QHASH Quantum/Photonic)',
      '',
      '  LAUNCHING YOUR OWN LEGITIMATE COIN ("coin create"):',
      '    - Completely separate from illegal underground shell coins ("ops coin").',
      '    - Seed a real liquidity pool ($500+), choose algorithm, halving interval, and dev fee (0-5%).',
      '    - Any rig can mine it ("rig <#> coin <SYM>"), earning spot payouts, wallet holdings, and dev fees!',
      '    - Market adoption & price evolve organically with mining activity and PR sentiment.',
    ],
    nextCommand: 'coins',
  },
};

export const CONTEXTUAL_GUIDES: Record<
  string,
  { title: string; body: string; tipCommand?: string }
> = {
  ctx_inspect: {
    title: 'COMPONENT HEALTH DIAGNOSTICS',
    body: 'Rig health is the average of every installed component. If any single part drops to <=20%, the rig stops mining. Repair individual worn parts with "repair <rig#> <part>" (e.g. "repair 1 psu") or "repair 1 gpu <slot#>".',
    tipCommand: 'tutorial hardware',
  },
  ctx_repair: {
    title: 'PREVENTIVE MAINTENANCE',
    body: 'Fixing individual worn parts before a full breakdown avoids the 1.35x FAILED surcharge. Overclocking and temps >82C accelerate wear on GPUs, compute, PSU, and cooling.',
    tipCommand: 'tutorial hardware',
  },
  ctx_repaste: {
    title: 'THERMAL PASTE SERVICE',
    body: 'Fresh thermal paste gives -6C equilibrium cooling for 16 steps. Reapply whenever a rig runs warm before spending cash on bigger cooling units.',
    tipCommand: 'tutorial power',
  },
  ctx_power: {
    title: 'POWER CONTRACTS & GRID CAPACITY',
    body: 'Your facility kW limit caps how much wattage can run simultaneously. Switch power contracts ("power contract <1..4>") or add circuit upgrades ("facility upgrade 1") before adding heavy GPUs/ASICs.',
    tipCommand: 'tutorial power',
  },
  ctx_cool: {
    title: 'ROOM COOLING INFRASTRUCTURE',
    body: 'Room cooling units lower equilibrium temperatures for nearby rigs, cutting throttling and wear. Remember cooling units also draw watts and carry 30-step upkeep!',
    tipCommand: 'tutorial power',
  },
  ctx_facilities: {
    title: 'SCALING FACILITIES',
    body: 'Renting expands rig slots and kW caps quickly; buying eliminates recurring 30-step rent. Watch each tier noise limit (dBA) to avoid city noise fines.',
    tipCommand: 'tutorial facilities',
  },
  ctx_usedmarket: {
    title: 'USED & SURPLUS HARDWARE MARKET',
    body: 'Listings refresh automatically every 8 steps (or immediately via "usedmarket refresh"). Inspect condition % carefully—DAMAGED rigs are cheap upfront but carry higher wear and immediate repair needs.',
    tipCommand: 'tutorial hardware',
  },
  ctx_research: {
    title: 'R&D TECH TREE',
    body: 'Research unlocks higher-generation chassis, GPUs, ASICs, power distribution, and automation. Pick an active node ("research start <#>") and advance steps to spend RP automatically.',
    tipCommand: 'codex research',
  },
  ctx_contracts: {
    title: 'ENTERPRISE CONTRACTS UNLOCKED',
    body: 'Contracts pay guaranteed Cash, RP, and Reputation upon hitting hash/coin delivery targets before the deadline. Start with slot 1 (0-Rep starter deals) to grow your Reputation!',
    tipCommand: 'tutorial contracts',
  },
  ctx_staff: {
    title: 'CREW & PAYROLL MANAGEMENT',
    body: 'Specialists automate maintenance, expand kW headroom, boost hashrate, and generate RP. Salaries bill every 30 steps—train high-value staff ("train <#>") and balance shifts to protect morale.',
    tipCommand: 'tutorial employees',
  },
  ctx_rivals: {
    title: 'RIVAL SYNDICATES & MARKET SHARE',
    body: 'Rival firms expand alongside you and drive up global network difficulty. Track their net worth with "rivals compare" and target less-crowded coins when difficulty climbs.',
    tipCommand: 'tutorial ops',
  },
  ctx_pr: {
    title: 'PR CAMPAIGNS & CREDIBILITY',
    body: 'Hype campaigns lift coin spot prices and grow Media Credibility (unlocking lucrative contracts). FUD campaigns suppress rival coins at a small cost to credibility and Regulatory Heat.',
    tipCommand: 'tutorial ops',
  },
  ctx_ops: {
    title: 'COVERT OPERATIONS & REGULATORY HEAT',
    body: 'Covert shortcuts escalate Suspicion through WATCHLIST -> FORMAL_AUDIT -> SANCTIONED. Use "ops raid prep <#>" before striking, and recover via "ops comply" / "ops settle".',
    tipCommand: 'tutorial blackmarket',
  },
  ctx_blackmarket: {
    title: 'BLACK MARKET SURPLUS & ILLICIT BIOS',
    body: 'Black market drops bypass normal R&D prerequisites with discounted rigs and overclocked BIOS flashes—but raise Heat significantly and risk audit seizures.',
    tipCommand: 'tutorial blackmarket',
  },
  ctx_overheat: {
    title: 'THERMAL ALERT: HIGH RIG TEMPERATURE',
    body: 'A rig just ran hot (>=82C throttles hashrate; >=96C forces thermal shutdown). Run "repaste 1", switch firmware ("rig 1 profile eco"), lower overclock, or add cooling ("cool").',
    tipCommand: 'tutorial power',
  },
  ctx_low_health: {
    title: 'HARDWARE WEAR ALERT',
    body: 'A component dropped to critical condition! Run "inspect <#>" to pinpoint which component is degraded, then run "repair <rig#> <part>" to fix just that part or "repair <#>" for the full rig.',
    tipCommand: 'tutorial hardware',
  },
  ctx_fab: {
    title: 'CUSTOM FOUNDRY WORKSPACE',
    body: 'Design all 7 hardware categories via "fab design", validate prototypes with "fab proto <#>", inspect batches ("fab batch") and serial numbers ("fab serial <ID>").',
    tipCommand: 'tutorial engineering',
  },
  ctx_proto: {
    title: 'PROTOTYPE BENCH TESTING',
    body: 'Testing a blueprint with "fab proto <#>" catches layout flaws early, raises production yield, and improves wear resistance on deployed parts.',
    tipCommand: 'tutorial manufacturing',
  },
  ctx_coins: {
    title: 'PLAYER-CREATED MINEABLE COINS',
    body: 'Launch your own legitimate mineable cryptocurrency with "coin create" to earn dev fees and trade on the spot market.',
    tipCommand: 'tutorial coins',
  },
  ctx_gen7: {
    title: 'GEN-7 QUANTUM & PHOTONIC ARCHITECTURE',
    body: 'Pair Quantum QPUs with Cryo-rated cooling/chassis and Photonic cores with Optical backplanes to avoid coherence & coupling penalties.',
    tipCommand: 'tutorial gen7',
  },
};

export interface CodexEntry {
  key: string;
  title: string;
  category: 'CORE' | 'HARDWARE' | 'ECONOMY' | 'OPERATIONS' | 'PROGRESSION';
  keywords: string[];
  relatedKeys?: string[];
  body: string[];
}

export const CODEX_ENTRIES: CodexEntry[] = [
  {
    key: 'mining',
    title: 'CORE MINING LOOP & AUTO-SELL',
    category: 'CORE',
    keywords: ['step', 'hashrate', 'pps', 'pplns', 'solo', 'coin', 'payout'],
    relatedKeys: ['market', 'custom_coins'],
    body: [
      '  - Time advances only when you run "step [n]" or while the 30s auto-step timer runs.',
      '  - Every step, active rigs mine their target coin and AUTO-SELL output (or HOLD to Wallet).',
      '  - Pool modes ("rig <#> pool <pps|pplns|solo>"): PPS = steady 98%; PPLNS = ~105% with',
      '    variance; SOLO = low hit chance per step for massive block jackpot payouts.',
      '  - Overclock ("overclock <#> <80..150>") trades nonlinearly higher watts/heat for hash.',
    ],
  },
  {
    key: 'hardware',
    title: 'RIG ARCHITECTURE, HYBRID CHASSIS & COMPONENT HEALTH',
    category: 'HARDWARE',
    keywords: ['chassis', 'compute', 'gpu', 'psu', 'storage', 'os', 'health', 'repair', 'tinker', 'hybrid'],
    relatedKeys: ['hybrid_rigs', 'gen7', 'fab'],
    body: [
      '  - Each rig combines Chassis, Compute, optional GPUs, Storage/RAM, PSU, Cooling, and OS.',
      '  - Every physical part has its own 0-100% health; Rig Health = average across parts.',
      '  - If average health OR any single component reaches <=20%, the rig halts (NEEDS_REPAIR).',
      '  - Hybrid Converged chassis allow 1 ASIC/QPU AND multiple GPUs simultaneously!',
      '  - Target a single part: "repair 1 psu", "repair 1 gpu", or "repair 1 gpu 2".',
      '  - Swap parts anytime via "tinker <#>" with 60% trade-in credit on replaced hardware.',
    ],
  },
  {
    key: 'power',
    title: 'ELECTRICITY, CONTRACTS & COOLING',
    category: 'HARDWARE',
    keywords: ['watt', 'kw', 'breaker', 'bill', 'cycle', 'cooling', 'repaste', 'thermal', 'noise'],
    relatedKeys: ['facilities', 'gen7'],
    body: [
      '  - Facility power cap (kW) limits total simultaneous wall draw of rigs + room cooling.',
      '  - Exceeding kW cap trips breakers and halts rigs (UNDERPOWERED). Use "power contract <1..4>".',
      '  - Thermal zones: <82C optimal | 82-95C throttled | >=96C emergency thermal shutdown.',
      '  - Refresh paste ("repaste <#>") for -6C relief over 16 steps or add cooling units ("cool").',
      '  - Exceeding facility noise cap (dBA) incurs municipal fines every 5 steps.',
    ],
  },
  {
    key: 'facilities',
    title: 'FACILITIES, ROOMS & INFRASTRUCTURE UPGRADES',
    category: 'PROGRESSION',
    keywords: ['bedroom', 'garage', 'warehouse', 'rent', 'buy', 'upgrade', 'rooms', 'floorplan', 'expand'],
    relatedKeys: ['power', 'employees'],
    body: [
      `  - ${FACILITY_TIERS.length} progression tiers from ${FIRST_FACILITY.name} (${FIRST_FACILITY.maxRigs} slots, ${FIRST_FACILITY.maxPowerKw} kW) to ${LAST_FACILITY.name} (${LAST_FACILITY.maxRigs} slots, ${LAST_FACILITY.maxPowerKw} kW).`,
      '  - Renting requires lower upfront cash; Buying removes recurring 30-step rent.',
      '  - Run "rooms" for an interactive ASCII floor-plan; move rigs ("rig <#> room <#>") into',
      '    Cold Aisles or baffled Cleanrooms, place coolers ("cool room <#> <room#>"), or "room expand".',
      '  - Facility Upgrades ("facility upgrade <1..6>") add circuits, ventilation, bays, and UPS power.',
    ],
  },
  {
    key: 'employees',
    title: 'STAFF SPECIALISTS, SHIFTS & MORALE',
    category: 'OPERATIONS',
    keywords: ['staff', 'hire', 'train', 'shift', 'priority', 'payroll', 'morale', 'strike'],
    relatedKeys: ['facilities', 'research'],
    body: [
      '  - 7 roles: Technician, Electrician, Manager, Sys Engineer, Researcher, PR, Analyst.',
      '  - Staff earn XP each step up to Lv 5; "train <#>" levels them up faster (+10 morale).',
      '  - "shift <#> <day|night|24/7>" and "priority <#>" tune focus vs. +35% 24/7 salary.',
      '  - Low morale cuts output, triggers resignations, and mass burnout triggers Strikes.',
    ],
  },
  {
    key: 'market',
    title: 'CRYPTO MARKET, ALGORITHMS, REGIMES & HALVINGS',
    category: 'ECONOMY',
    keywords: ['btc', 'ltc', 'doge', 'rvn', 'xmr', 'eth', 'zec', 'xch', 'qbc', 'regime', 'halving', 'chart'],
    relatedKeys: ['custom_coins', 'exchange'],
    body: [
      '  - 9 starter coins across 8 algorithms: BTC (SHA256), LTC/DOGE (SCRYPT), RVN (KAWPOW),',
      '    XMR (RANDOMX), ETH (ETHASH), ZEC (EQUIHASH), XCH (POST), QBC (QHASH Quantum/Photonic).',
      '  - KAWPOW/ETHASH/EQUIHASH enforce minimum GPU VRAM (4-6 GB) to avoid DAG thrash penalties.',
      '  - Block Halvings cut coin emission by 50% and lift long-run fair value (+22%).',
    ],
  },
  {
    key: 'custom_coins',
    title: 'PLAYER-CREATED MINEABLE CRYPTOCURRENCIES',
    category: 'ECONOMY',
    keywords: ['coin', 'create', 'launch', 'mainnet', 'dev fee', 'liquidity', 'adoption'],
    relatedKeys: ['market', 'exchange', 'contracts'],
    body: [
      '  - Legitimate custom coins ("coin create") are full mainnet coins on the Exchange.',
      '  - Completely separate from illegal underground shell coins ("ops coin").',
      '  - Creators pick algorithm, halving cadence, seed liquidity ($500+), and 0-5% dev fee.',
      '  - Active mining builds Adoption Score, appreciating price and creator revenue over time.',
    ],
  },
  {
    key: 'contracts',
    title: 'CONTRACTS, RIVALS & COVERT OPS',
    category: 'OPERATIONS',
    keywords: ['contract', 'rival', 'pr', 'ops', 'blackmarket', 'heat', 'raid', 'siphon', 'shell'],
    relatedKeys: ['investigation', 'market'],
    body: [
      '  - Enterprise Contracts ("contracts") award Cash, RP & Reputation on completion.',
      '  - Rivals ("rivals") grow continuously and raise network difficulty across shared coins.',
      '  - PR Campaigns ("pr") legally shift coin prices/sentiment.',
      '  - Underground shell coins ("ops coin dev|seed|launch|shill|rug") & 2-phase Vault Raids',
      '    ("ops raid prep" -> "ops raid exec") generate quick cash at major Heat/Scandal risk.',
    ],
  },
  {
    key: 'investigation',
    title: 'REGULATORY INVESTIGATION LADDER & RECOVERY',
    category: 'OPERATIONS',
    keywords: ['audit', 'sanction', 'watchlist', 'probation', 'comply', 'settle', 'scandal', 'heat'],
    relatedKeys: ['contracts', 'exchange'],
    body: [
      '  - Cumulative Heat & suspicion progress across: NONE -> WATCHLIST -> FORMAL_AUDIT -> SANCTIONED -> PROBATION.',
      '  - SANCTIONED status enforces fines and -15% mining payout penalty until cleared.',
      '  - Traced shell-coin rugs leave Scandal Marks that dampen market confidence.',
      '  - Recover via "ops comply" (disconnect illegal ops) or "ops settle" (pay civil settlement).',
    ],
  },
  {
    key: 'seasons',
    title: 'SEASONS, LEADERBOARDS & HALL OF FAME',
    category: 'PROGRESSION',
    keywords: ['season', 'leaderboard', 'rank', 'score', 'hall', 'fame', 'champion'],
    relatedKeys: ['contracts', 'market'],
    body: [
      '  - A season lasts 60 steps. Run "leaderboard" (or "season") for live standings vs. every rival.',
      '  - Season score = company valuation + hash index x600 + reputation x450 + 5 per unspent RP.',
      '  - Finish a season at #1 to unlock the "Season Champion" achievement.',
    ],
  },
  {
    key: 'research',
    title: 'R&D TREE, ACHIEVEMENTS & CHALLENGES',
    category: 'PROGRESSION',
    keywords: ['rp', 'research', 'milestone', 'achievement', 'challenge', 'gen7'],
    relatedKeys: ['gen7', 'fab'],
    body: [
      '  - Research spans Hardware, Electrical, Cooling, Automation, and Business.',
      '  - Base RP accrues at +0.75/step plus Research Scientist output.',
      '  - Gen-7 branches diverge into Dilution Cryo (Quantum) and Optical Interconnect (Photonic).',
    ],
  },
  {
    key: 'exchange',
    title: 'TREASURY WALLET, HOLD PAYOUT & CRYPTO EXCHANGE',
    category: 'ECONOMY',
    keywords: ['wallet', 'exchange', 'trade', 'hold', 'limit', 'short', 'margin'],
    relatedKeys: ['market', 'custom_coins'],
    body: [
      '  - Switch any rig between Auto-Sell and Treasury Hold ("rig <#|all> payout <hold|sell>").',
      '  - Trade spot ("exchange buy <COIN> <usd>", "exchange sell <COIN> <qty|all>"), limit orders,',
      '    and 1x collateralized shorts across all core and player-created coins.',
    ],
  },
  {
    key: 'fab',
    title: 'PROPRIETARY CHIP DESIGN, PROTOTYPE QA & FOUNDRY',
    category: 'HARDWARE',
    keywords: ['fab', 'foundry', 'chip', 'asic', 'wafer', 'design', 'manufacture', 'prototype', 'serial', 'batch', 'revision'],
    relatedKeys: ['gen7', 'hardware'],
    body: [
      '  - Design custom parts across all 7 slots ("fab design") with Draft save & "fab revise".',
      '  - Compare specs side-by-side ("fab compare <bp1#> <bp2#>") before committing wafers.',
      '  - Test prototypes ("fab proto <bp#>") to boost yield, cut scrap, and verify Gen-7 margins.',
      '  - Every production batch issues a Batch ID & tracked Serial Numbers ("fab batch" / "fab serial").',
    ],
  },
  {
    key: 'gen7',
    title: 'GEN-7 QUANTUM vs PHOTONIC SYSTEMS',
    category: 'HARDWARE',
    keywords: ['quantum', 'photonic', 'qpu', 'qgpu', 'cryo', 'optical', 'qhash', 'qbc'],
    relatedKeys: ['fab', 'hardware', 'research'],
    body: [
      '  - Quantum QPU hardware uses Cryo dilution (mK target, qubit topology, coherence us).',
      '    Requires Cryo-rated cooling or Cryo chassis to avoid 0.70x decoherence penalty.',
      '  - Photonic Matrix hardware uses Laser Wavelengths (1310/1550nm), WDM & waveguide lanes.',
      '    Thrives in Optical Backplane chassis at ultra-low thermal footprint.',
    ],
  },
  {
    key: 'presets',
    title: 'CAREER PRESETS & GUIDED CHECKLIST',
    category: 'PROGRESSION',
    keywords: ['preset', 'onboarding', 'guided', 'checklist', 'pause', 'pace'],
    relatedKeys: ['facilities', 'mining'],
    body: [
      '  - Create, duplicate, rename, and launch custom reusable Career Presets from the Title Menu.',
      '  - Presets toggle Starting Cash, Facility/Contract, Market Rules, and Starter Rig config.',
      '  - Guided Mode enforces a strict stage checklist ("guide checklist", "guide pause", "guide pace").',
    ],
  },
];

export function searchCodexEntries(query: string, category?: string): CodexEntry[] {
  const q = query.trim().toLowerCase();
  const cat = category?.trim().toUpperCase();
  return CODEX_ENTRIES.filter((entry) => {
    if (cat && cat !== 'ALL' && entry.category !== cat) return false;
    if (!q) return true;
    const hay = `${entry.key} ${entry.title} ${entry.keywords.join(' ')} ${entry.body.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}
