import { FACILITY_TIERS } from './catalog';
import {
  BusinessId,
  GameState,
  CycleLedgerEntry,
  GuidedOnboardingState,
  GuidedPaceMode,
  GuidedSystemStatus,
  OnboardingMode,
} from '../types/game';

export function getBusinessTutorialTopicId(businessId: BusinessId): string {
  switch (businessId) {
    case 'MINING':
      return 'hardware';
    case 'MARKET_INTEL':
      return 'market_intel';
    case 'HARDWARE_ENG':
      return 'hardware_eng';
    case 'MANUFACTURING':
      return 'manufacturing_div';
    case 'MINING_SERVICES':
      return 'mining_services';
    case 'UNDERGROUND':
      return 'underground_div';
  }
}

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
  | 'coinUnlocks'
  | 'exchange'
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
  coinUnlocks: boolean;
  exchange: boolean;
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
  title: string;
  unlocksLabel: string;
  unlockSystems: GuidedSystemId[];
  tasks: GuidedStageTask[];
}

const facilityTier = (state: GameState) => FACILITY_TIERS.findIndex((facility) => facility.id === state.facilityId);

export function getCycleOperatingProfit(cycle: CycleLedgerEntry): number {
  return cycle.miningRevenueUsd - cycle.electricityCostUsd - cycle.rentCostUsd -
    cycle.payrollCostUsd - cycle.maintenanceCostUsd;
}

const profitableCycles = (state: GameState, minimumSite: number) =>
  state.ledger.filter((cycle) =>
    FACILITY_TIERS.findIndex((facility) => facility.id === (cycle.facilityId ?? state.facilityId)) >= minimumSite &&
    getCycleOperatingProfit(cycle) > 0
  ).length;

export const GUIDED_STAGES: GuidedStageSpec[] = [
  {
    title: 'Stage 1 — Get your operation online',
    unlocksLabel: 'Enterprise contracts',
    unlockSystems: ['contracts'],
    tasks: [
      {
        id: 'inspect_operating_rig',
        label: 'Inspect a mining rig',
        hintCommand: 'inspect 1',
        autoCheck: (s) =>
          (s.seenTutorials ?? []).some((id) => id === 'inspected_rig' || id === 'ctx_inspect') ||
          s.stats.contractsCompleted > 0,
      },
      {
        id: 'mine_three_steps',
        label: 'Earn mining revenue on three steps',
        hintCommand: 'step 1',
        autoCheck: (s) =>
          (s.performanceHistory ?? []).filter((step) => step.revenuePerStepUsd > 0).length >= 3 ||
          s.stats.contractsCompleted > 0,
      },
    ],
  },
  {
    title: 'Stage 2 — Expand beyond the bedroom',
    unlocksLabel: 'Staff and rival reports',
    unlockSystems: ['staff', 'rivals'],
    tasks: [
      {
        id: 'finish_first_research',
        label: 'Complete one research project',
        hintCommand: 'research',
        autoCheck: (s) => s.unlockedResearch.length > 0,
      },
      {
        id: 'improve_fleet',
        label: 'Add a second rig or repair worn hardware',
        hintCommand: 'tutorial build',
        autoCheck: (s) => s.rigs.length >= 2 || s.stats.rigPurchasesCount > 0 || s.stats.repairsCompleted > 0,
      },
      {
        id: 'reach_garage',
        label: 'Move to the Garage or a larger facility',
        hintCommand: 'facility preview 2',
        autoCheck: (s) => facilityTier(s) >= 1,
      },
      {
        id: 'deliver_first_contract',
        label: 'Complete one client contract',
        hintCommand: 'contracts',
        autoCheck: (s) => s.stats.contractsCompleted > 0,
      },
    ],
  },
  {
    title: 'Stage 3 — Tune a sustainable operation',
    unlocksLabel: 'PR campaigns, additional mining coins, and exchange trading',
    unlockSystems: ['coinUnlocks', 'exchange', 'pr'],
    tasks: [
      {
        id: 'qualify_rig_tuning',
        label: 'Qualify an efficient, high-output, or quiet rig in the Garage or above',
        hintCommand: 'benchmark 1',
        autoCheck: (s) => (s.rigQualifications ?? []).some((result) => result.reference === 'balanced'),
      },
      {
        id: 'first_profitable_cycle',
        label: 'Cover operating costs with mining revenue for one billing cycle at the Garage or above',
        hintCommand: 'ledger',
        autoCheck: (s) => profitableCycles(s, 1) >= 1,
      },
    ],
  },
  {
    title: 'Stage 4 — Scale to commercial operations',
    unlocksLabel: 'Custom coin launches and the optional underground market',
    unlockSystems: ['coins', 'ops', 'blackmarket'],
    tasks: [
      {
        id: 'reach_commercial',
        label: 'Move to Small Commercial or a larger facility',
        hintCommand: 'facility preview 3',
        autoCheck: (s) => facilityTier(s) >= 2,
      },
      {
        id: 'two_profitable_cycles',
        label: 'Finish two profitable billing cycles at Commercial or above',
        hintCommand: 'ledger',
        autoCheck: (s) => profitableCycles(s, 2) >= 2,
      },
    ],
  },
  {
    title: 'Stage 5 — Prepare the foundry',
    unlocksLabel: 'Foundry engineering and production',
    unlockSystems: ['fab'],
    tasks: [
      {
        id: 'reach_warehouse',
        label: 'Move to the Warehouse or a larger facility',
        hintCommand: 'facility preview 4',
        autoCheck: (s) => facilityTier(s) >= 3,
      },
      {
        id: 'finish_wafer_lithography',
        label: 'Complete Semiconductor Wafer Lithography',
        hintCommand: 'research',
        autoCheck: (s) => s.unlockedResearch.includes('res_wafer_lithography'),
      },
    ],
  },
  {
    title: 'Stage 6 — Qualify for Gen-7 design',
    unlocksLabel: 'Gen-7 foundry design',
    unlockSystems: ['gen7'],
    tasks: [
      {
        id: 'produce_first_part',
        label: 'Produce a custom part that passes QA',
        hintCommand: 'tutorial manufacturing',
        autoCheck: (s) => (s.fab?.totalUnitsManufactured ?? 0) > 0,
      },
      {
        id: 'finish_gen7_research',
        label: 'Complete Gen-7 Quantum & Photonic Silicon',
        hintCommand: 'tutorial research',
        autoCheck: (s) => s.unlockedResearch.includes('res_gen7_quantum_photonic'),
      },
    ],
  },
  {
    title: 'Stage 7 — Build a part worth replacing stock',
    unlocksLabel: 'Foundry campaign completion',
    unlockSystems: [],
    tasks: [
      {
        id: 'prove_custom_part',
        label: 'Qualify a custom-equipped rig against its stock configuration',
        hintCommand: 'benchmark 1 stock',
        autoCheck: (s) => (s.rigQualifications ?? []).some((result) => result.reference === 'stock'),
      },
    ],
  },
];

const guidedTasks = GUIDED_STAGES.flatMap((stage) => stage.tasks);
const SYSTEM_UNLOCK_SPACING = 2;
export const GUIDED_LESSON_SPACING: Record<GuidedPaceMode, number> = { SLOW: 4, NORMAL: 2, FAST: 0 };
const SYSTEM_LABELS: Record<GuidedSystemId, string> = {
  contracts: 'Contracts', staff: 'Staff', rivals: 'Rivals', coinUnlocks: 'Mining coin access',
  exchange: 'Exchange', pr: 'PR campaigns', coins: 'Custom coins', ops: 'Underground operations',
  blackmarket: 'Black market', fab: 'Foundry', gen7: 'Gen-7 foundry design',
};

function getEarnedGuidedTasks(state: GameState): Set<string> {
  const earned = new Set(state.guidedOnboarding?.earnedChecklistIds ?? []);
  for (const task of guidedTasks) {
    if (!earned.has(task.id) && task.autoCheck(state)) earned.add(task.id);
  }
  return earned;
}

function getSystemOpenTimes(state: GameState, earned: Set<string>, preserveEarned = false): Record<string, number> {
  let opens = state.guidedOnboarding?.systemOpensAt ?? {};
  let nextOpening = state.stepCount;
  for (const stage of GUIDED_STAGES) {
    if (!stage.tasks.every((task) => earned.has(task.id))) break;
    for (const system of stage.unlockSystems) {
      const existing = opens[system];
      if (!Number.isFinite(existing)) opens = { ...opens, [system]: preserveEarned ? state.stepCount : nextOpening };
      nextOpening = Math.max(nextOpening, opens[system] + SYSTEM_UNLOCK_SPACING);
    }
  }
  return opens;
}

export function announceGuidedUnlocks(previous: GameState, next: GameState): GameState {
  if (getEffectiveOnboardingMode(previous) !== 'GUIDED' ||
      getEffectiveOnboardingMode(next) !== 'GUIDED' || next.devUnlockAll) return next;
  const before = getUnlockedSystems(previous);
  const after = getUnlockedSystems(next);
  const unlocked = (Object.keys(SYSTEM_LABELS) as GuidedSystemId[]).filter((system) => !before[system] && after[system]);
  if (!unlocked.length) return next;
  return {
    ...next,
    news: [
      {
        id: `guided_unlock_${next.stepCount}_${unlocked[0]}`,
        step: next.stepCount,
        stepLabel: `Step ${next.stepCount}`,
        title: `Guided unlock: ${unlocked.map((system) => SYSTEM_LABELS[system]).join(' · ')}`,
        detail: 'Run "guide" for your next milestone or "tutorial list" for practical lessons.',
        category: 'MILESTONE' as const,
      },
      ...next.news,
    ].slice(0, 60),
  };
}

/** Keep milestones earned from gameplay even after selling equipment or moving to a smaller site. */
export function recordGuidedProgress(state: GameState, preserveEarned = false): GameState {
  if (getEffectiveOnboardingMode(state) !== 'GUIDED' || state.devUnlockAll) return state;
  const earned = getEarnedGuidedTasks(state);
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  const systemOpensAt = getSystemOpenTimes(state, earned, preserveEarned);
  const currentStageIdx = GUIDED_STAGES.findIndex((stage) => stage.tasks.some((task) => !earned.has(task.id)));
  const stage = currentStageIdx < 0 ? GUIDED_STAGES.length - 1 : currentStageIdx;
  const lesson = (guided.lessonQueue ?? []).find((id) => guided.systemStatuses[id] === 'ENCOUNTERED');
  const activate = lesson && !guided.paused && !getActiveGuidedLesson(state) &&
    state.stepCount >= (guided.lastLessonAt ?? -Infinity) + GUIDED_LESSON_SPACING[guided.pace];
  if (!activate && earned.size === (guided.earnedChecklistIds?.length ?? 0) &&
      systemOpensAt === guided.systemOpensAt && stage === guided.currentStageIdx) return state;
  return {
    ...state,
    guidedOnboarding: {
      ...guided,
      earnedChecklistIds: [...earned],
      systemOpensAt,
      currentStageIdx: stage,
      ...(activate ? { systemStatuses: { ...guided.systemStatuses, [lesson]: 'TASK_ACTIVE' as const } } : {}),
    },
  };
}

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
      coinUnlocks: 'LOCKED',
      exchange: 'LOCKED',
      gen7: 'LOCKED',
    },
    completedChecklistIds: [],
    revisitedTopics: [],
    systemOpensAt: {},
    lessonQueue: [],
  };
}

export function getEffectiveOnboardingMode(
  state: Pick<GameState, 'onboardingMode' | 'isSandbox' | 'isDevSession'>
): OnboardingMode {
  if (state.isSandbox && !state.isDevSession) return 'VETERAN';
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
  const earned = getEarnedGuidedTasks(state);

  let allPriorDone = true;
  let activeIdx = GUIDED_STAGES.length - 1;
  let foundActive = false;

  const stages = GUIDED_STAGES.map((spec, idx) => {
    const tasks = spec.tasks.map((t) => ({
      ...t,
      done: earned.has(t.id),
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
  const checklist = evaluateGuidedChecklist(state);
  const flatTasks = checklist.stages.flatMap((st) => st.tasks);

  let target = flatTasks.find((t) => t.id === taskIdOrNum);
  const numIdx = Number(taskIdOrNum);
  if (!target && Number.isInteger(numIdx) && numIdx >= 1 && numIdx <= flatTasks.length) {
    target = flatTasks[numIdx - 1];
  }
  if (!target) {
    return { ok: false, nextState: state, summary: `Checklist task "${taskIdOrNum}" not found.` };
  }
  if (!target.done) {
    return { ok: false, nextState: state, summary: `Still to do: ${target.label}. Try "${target.hintCommand}".` };
  }
  return {
    ok: true,
    nextState: recordGuidedProgress(state),
    summary: `Milestone earned: ${target.label}. Progress: ${checklist.completedTaskCount}/${checklist.totalTaskCount}.`,
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
      ...(guided.systemStatuses[sysId] === 'TASK_ACTIVE' ? { lastLessonAt: state.stepCount } : {}),
      systemStatuses: {
        ...guided.systemStatuses,
        [sysId]: 'DISMISSED' as GuidedSystemStatus,
      },
    },
  };
}

export function getActiveGuidedLesson(state: GameState): GuidedSystemId | undefined {
  return (state.guidedOnboarding?.lessonQueue ?? []).find((system) =>
    state.guidedOnboarding?.systemStatuses[system] === 'TASK_ACTIVE'
  ) as GuidedSystemId | undefined;
}

export function encounterGuidedLesson(state: GameState, system: GuidedSystemId): GameState {
  if (getEffectiveOnboardingMode(state) !== 'GUIDED' || !getUnlockedSystems(state)[system]) return state;
  const guided = state.guidedOnboarding ?? buildDefaultGuidedState();
  if (guided.systemStatuses[system] && guided.systemStatuses[system] !== 'LOCKED') return state;
  return recordGuidedProgress({ ...state, guidedOnboarding: {
    ...guided,
    lessonQueue: [...(guided.lessonQueue ?? []), system],
    systemStatuses: { ...guided.systemStatuses, [system]: 'ENCOUNTERED' },
  } });
}

export function finishGuidedLesson(state: GameState): GameState {
  const lesson = getActiveGuidedLesson(state);
  const guided = state.guidedOnboarding;
  if (!lesson || !guided) return state;
  return recordGuidedProgress({ ...state, guidedOnboarding: {
    ...guided,
    lastLessonAt: state.stepCount,
    systemStatuses: { ...guided.systemStatuses, [lesson]: 'LEARNED' },
  } });
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

export function getUnlockedSystems(state: GameState): SystemUnlockStatus {
  const allOpen = getEffectiveOnboardingMode(state) === 'VETERAN' || Boolean(state.devUnlockAll);
  const earned = allOpen ? new Set<string>() : getEarnedGuidedTasks(state);
  const opens = allOpen ? {} : getSystemOpenTimes(state, earned);
  const status = { unlockNotes: {} } as SystemUnlockStatus;
  let nextTask: GuidedStageTask | undefined;
  for (const stage of GUIDED_STAGES) {
    if (!allOpen) nextTask ??= stage.tasks.find((task) => !earned.has(task.id));
    for (const system of stage.unlockSystems) {
      const remaining = opens[system] - state.stepCount;
      status[system] = allOpen || (!nextTask && remaining <= 0);
      status.unlockNotes[system] = nextTask
        ? `Next milestone: ${nextTask.label} (try "${nextTask.hintCommand}")`
        : remaining > 0 ? `Opens in ${remaining} steps` : 'Guided milestones complete';
    }
  }
  return status;
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
      hint: 'Run "tutorial build" to compare options, then "build rig" or "usedmarket".',
      rewardCash: 75,
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
  optimization: {
    id: 'optimization',
    title: 'COMMISSION A RIG FOR A PARTICULAR JOB',
    summary: 'Compare efficiency, output, and noise under the same operating conditions.',
    lines: [
      '  Decision: which constraint limits this rig’s value at your facility?',
      '  1. Run "benchmark <#>" to compare with balanced firmware at 100% clock.',
      '  2. Try Eco for efficiency, Turbo for output, or a cooler and quieter build. Compare their trade-offs before committing.',
      '  3. At the Garage or above, record the result with "commission <#> <efficiency|output|quiet>".',
      '  4. At the foundry, install a custom part and add "stock" to compare against the same rig with its catalog parts.',
    ],
    nextCommand: 'benchmark 1',
  },
  hardware: {
    id: 'hardware',
    title: 'KEEP A RIG EARNING',
    summary: "Diagnose whether to repair, cool, or replace a part.",
    lines: [
      "  Decision: is this rig losing output because it is hot, worn, or mismatched to its coin?",
      "  1. Run \"rigs\", then \"inspect <#>\". Read temperature, current output, and each component’s health.",
      "  2. Compare \"repair <#> <part>\" with a full \"repair <#>\". A single failing part can stop an otherwise healthy rig.",
      "  3. Use \"repaste <#>\" for temporary cooling or \"tinker <#>\" to price a component swap. Keep the cheaper fix if output recovers.",
      "  Check: advance one step and inspect the same rig. Compare output and temperature before buying replacement hardware.",
    ],
    nextCommand: 'inspect 1',
  },
  power: {
    id: 'power',
    title: 'BUY HEADROOM WHERE IT PAYS',
    summary: "Compare power rates, cooling costs, and safe output.",
    lines: [
      "  Decision: do you need more power, lower draw, or more cooling?",
      "  1. Run \"power\" and \"rigs\". Separate a full facility circuit from an overloaded PSU or a hot rig.",
      "  2. Compare rates, caps, and fees in \"power\" before switching with \"power contract <#>\".",
      "  3. Run \"cool compare\". A lower clock or a cooler room can recover throttled output without adding a powered cooler.",
      "  Check: leave headroom below the breaker limit and compare mining revenue after power costs. Heat starts reducing output at 82°C.",
    ],
    nextCommand: 'power',
  },
  facilities: {
    id: 'facilities',
    title: 'MOVE ONLY WHEN THE NEW SPACE EARNS ITS RENT',
    summary: "Evaluate rent, purchase price, noise, and spare capacity.",
    lines: [
      "  Decision: is the company short on rig slots, grid capacity, or noise allowance?",
      "  1. Run \"facilities\", then \"facility preview <#>\" for a lease or \"facility preview <#> buy\" for a purchase.",
      "  2. Compare the move cost, recurring rent, and revenue from the extra rigs you can actually fund.",
      "  3. Type \"facility rent 2\" to lease the Garage when ready. \"facility upgrade <#>\" buys an improvement at the current site.",
      "  Check: use \"rooms\" for placement and \"ledger\" after billing. Extra empty slots only pay off once there is a use for them.",
    ],
    nextCommand: 'facility preview 2',
  },
  employees: {
    id: 'employees',
    title: 'HIRE FOR A BOTTLENECK',
    summary: "Compare a specialist’s benefit against the next payroll.",
    lines: [
      "  Decision: which problem costs more than a specialist’s wages?",
      "  1. Run \"staff\" and compare hire fees, wages, and facility requirements. A technician addresses wear; a researcher speeds R&D.",
      "  2. Check current workload and morale. Try one role with \"hire <role>\", then adjust \"shift <#> <day|night|24/7>\" or \"priority <#> <task>\".",
      "  3. Compare repair bills or research progress after a cycle. Train when the extra output has a purpose.",
      "  Check: use \"ledger\" to see whether mining can still cover payroll, rent, power, and upkeep.",
    ],
    nextCommand: 'staff',
  },
  contracts: {
    id: 'contracts',
    title: 'CHECK THE DEADLINE BEFORE YOU SIGN',
    summary: "Compare a contract’s target with the fleet’s reliable capacity.",
    lines: [
      "  Decision: which offer fits your fleet today?",
      "  1. Run \"contracts\". The starter trial covers five fault-free mining steps. Quiet Hours pays for mining under its dBA cap. Try Eco firmware if the rig is too loud.",
      "  2. For Delivery Sprint, compare the requested payout per step with what the fleet earns on that coin. Commissioning pays only after two working rigs run at the new site for three consecutive steps.",
      "  3. Check the penalty and deadline, then use \"contract accept <#>\" to sign. Use \"contracts\" to track progress and reinvest the payment in the next job.",
      "  Check: if the contract falls behind, estimate what is required per remaining step before investing more cash.",
    ],
    nextCommand: 'contracts',
  },
  ops: {
    id: 'ops',
    title: 'USE RIVAL DATA BEFORE PAYING FOR PR',
    summary: "Evaluate market share, credibility, and campaign costs.",
    lines: [
      "  Decision: will a campaign earn more than it costs, or should you invest in your fleet?",
      "  1. Run \"rivals compare\" and \"forecast <COIN>\". Look at difficulty and your own production before choosing a market.",
      "  2. When PR opens, run \"pr\" and compare spending, duration, credibility, and scrutiny. A coin you mine regularly gives you a clearer way to measure the effect.",
      "  Check: compare revenue during and after the campaign with the campaign cost. Market changes can happen with or without it.",
    ],
    nextCommand: 'rivals compare',
  },
  rivals: {
    id: 'rivals',
    title: 'COMPETE WHERE YOUR FLEET HAS AN EDGE',
    summary: 'Read which markets are getting crowded and what your competitors are building.',
    lines: [
      '  Decision: hold your market, or move some rigs before the pressure rises?',
      '  1. Run "rivals markets" to see who is adding difficulty on each coin. Compare the projected pressure and your earnings before committing to a new mining desk.',
      '  2. Read "rivals log <#>" for completed moves. Use "rivals investigate <#>" for the funded project, due date, and cash buffer. "rivals intel <#>" reopens the report while it is active.',
      '  3. If a competitor is building capacity, compare "forecast <COIN>" and "inspect <#>". Move a single compatible rig with "rig <#> coin <COIN>" and check its actual margin before moving the fleet.',
      '  Check: a strong hydro operator can ride out tariff shocks. A flexible pool can follow a profitable desk. Price the response that fits your setup.',
    ],
    nextCommand: 'rivals markets',
  },
  blackmarket: {
    id: 'blackmarket',
    title: 'PRICE THE RISK OF A DISCOUNT',
    summary: "Compare legal purchases with the game’s optional underground operations.",
    lines: [
      "  Decision: can the company absorb the downside if a discounted deal goes wrong?",
      "  1. Compare \"blackmarket\" with \"usedmarket\". Consider condition, possible seizure, and how much you can afford to lose.",
      "  2. Use \"ops\" to read in-game scrutiny, sanctions, and open decisions. Underground activity is optional.",
      "  Check: review the fictional operation ledger with \"ops log\". If scrutiny rises, read the in-game compliance options before committing more cash.",
    ],
    nextCommand: 'blackmarket',
  },
  engineering: {
    id: 'engineering',
    title: 'DESIGN A PART FOR A RIG OR A BUYER',
    summary: "Plan tooling, compatible hardware, and manufacturability.",
    lines: [
      "  Decision: will this part solve a fleet bottleneck or earn export revenue?",
      "  1. Use \"guide\" for the Warehouse and Wafer Lithography milestones. At the foundry, check \"fab\" for line cost, upkeep, and tooling budget.",
      "  2. Commission a line with \"fab line build\". In \"fab design\", pick a category, architecture, node, and specialization for a specific use.",
      "  3. Compare Performance for throughput, Efficiency for power limits, Compact for heat and noise, and Balanced for unit cost. Type \"draft\" at review to save a design before paying for tooling.",
      "  Check: confirm the intended rig can seat the part. Compare taped-out designs with \"fab compare <a#> <b#>\" before committing to production.",
    ],
    nextCommand: 'fab',
  },
  manufacturing: {
    id: 'manufacturing',
    title: 'PROVE THE DESIGN WITH ONE UNIT',
    summary: "Validate a prototype, inspect a batch, and choose whether to deploy or sell.",
    lines: [
      "  Decision: is the design ready for a large batch?",
      "  1. Run \"fab proto <bp#>\" to validate the blueprint. If the results are marginal, weigh the cost of a revision against the risk of scrap.",
      "  2. Start with \"fab produce <bp#> 1\" and advance the quoted number of steps. Read \"fab batch <#>\" for units passed, scrap, and serials.",
      "  3. Use \"fab serial <ID>\" for the individual part, then choose \"fab deploy <inv#> <rig#>\" or \"fab sell <inv#> 1\".",
      "  Check: after deployment, run \"benchmark <#> stock\". Record a passing objective with \"commission <#> <efficiency|output|quiet> stock\" before you scale production.",
    ],
    nextCommand: 'fab',
  },
  gen7: {
    id: 'gen7',
    title: 'CHOOSE A GEN-7 PLATFORM',
    summary: "Compare Quantum Cryo and Photonic Optical against facility constraints.",
    lines: [
      "  Decision: is your limiting factor cooling, electrical load, or the target algorithm?",
      "  1. Run \"research\" and \"guide\". Gen-7 foundry design follows a completed production batch and Gen-7 Quantum & Photonic Silicon research.",
      "  2. Price a complete Quantum rig with Cryo hardware or a Photonic rig with an Optical backplane. Check the proposed coin, power cap, and cooling before buying.",
      "  3. Compare both designs in the foundry quote before tape-out. Run a small batch first.",
      "  Check: inspect output, noise, and temperatures on the commissioned rig before multiplying the design.",
    ],
    nextCommand: 'research',
  },
  coins: {
    id: 'coins',
    title: 'MATCH THE COIN TO THE HARDWARE',
    summary: "Compare mining alternatives and budget for a legitimate coin launch.",
    lines: [
      "  Decision: should the fleet keep its current coin, switch algorithms, or fund a new network?",
      "  1. Use \"coin info <SYM>\" for algorithm, memory, difficulty, and halving. Compare with \"inspect <#>\" before paying \"unlock <SYM>\".",
      "  2. Try the new target on one compatible rig with \"rig <#> coin <SYM>\". Check actual output after a step before switching the fleet.",
      "  3. When \"coin create\" opens, budget the liquidity pool separately from bills. Choose an algorithm available in your fleet and review issuance and fees.",
      "  Check: monitor adoption and actual mining payouts before spending more on the new network.",
    ],
    nextCommand: 'coins',
  },
  research: {
    id: 'research',
    title: 'FUND THE PROJECT YOU CAN USE',
    summary: "Choose an R&D node that supports the next operating upgrade.",
    lines: [
      "  Decision: what should the next project let the company do?",
      "  1. Run \"research\". Compare the cash fee, research points, and effect with the bottleneck you see in \"rigs\" or \"power\".",
      "  2. Choose \"research start <#>\" and advance steps. Progress spends available research points over time.",
      "  3. For late projects, use \"staff\" to price research scientists. They generate points and speed up active projects. Add payroll after the fleet can cover it.",
      "  Check: after completion, price the unlocked part and reserve enough cash for the next bill.",
    ],
    nextCommand: 'research',
  },
  usedmarket: {
    id: 'usedmarket',
    title: 'COMPARE PRICE WITH CONDITION',
    summary: "Estimate the true cost of a secondhand rig.",
    lines: [
      "  Decision: is the discount large enough to cover repair and downtime?",
      "  1. Run \"usedmarket\" and \"usedmarket preview <#>\". Compare condition, target coin, power, and payback with a new build.",
      "  2. If the deal works at your facility, use \"usedmarket buy <#>\". Inspect the rig and budget any work before running it at full speed.",
      "  Check: advance one step and compare actual earnings and wear with the listing estimate.",
    ],
    nextCommand: 'usedmarket',
  },
  exchange: {
    id: 'exchange',
    title: 'KEEP THE NEXT BILL IN CASH',
    summary: "Separate working cash from holdings and trading risk.",
    lines: [
      "  Decision: how much cash can the company afford to put at risk?",
      "  1. Run \"wallet\" and \"market\". Keep a reserve for operating costs before taking a position.",
      "  2. Compare automatic sales for predictable bill money with holding a portion on one rig. Check the order size, fees, and what a price drop would cost.",
      "  3. Use \"exchange\" for commands. Review open positions and orders regularly so they do not consume money needed for operations.",
      "  Check: compare realized cash with the next bill and your hardware budget.",
    ],
    nextCommand: 'wallet',
  },
  conglomerate: {
    id: 'conglomerate',
    title: 'EXPAND VIA M&A AND CORPORATE HQ',
    summary: 'Acquire bankrupt industry companies, incorporate HQ, and unlock Gen-7.',
    lines: [
      '  Decision: which division adds the strongest margin or synergy next?',
      '  1. Reaching Gen 5 opens distressed M&A targets matching your hidden operational affinity. Run "acquire" and "acquire inspect <#>".',
      '  2. Newly acquired firms start RECOVERING. Run "corp turnaround <biz>" to stabilize immediately or let steps finish recovery.',
      '  3. With 2+ businesses owned, run "hq establish" ($75k) to unlock HQ Governance, Upgrade Tiers, and Synergy Policies ("hq synergy").',
      '  Check: owning all 6 businesses unlocks Gen-7 Quantum & Photonic R&D and grants a +10% Apex RP Dividend.',
    ],
    nextCommand: 'corp',
  },
  market_intel: {
    id: 'market_intel',
    title: 'MARKET INTELLIGENCE DIVISION (B2)',
    summary: 'Monetize crypto forecasting models, subscriptions, and treasury advisory.',
    lines: [
      '  Decision: should Market Intel focus on recurring client subscriptions or internal trading alpha?',
      '  1. Run "intel" for model tier, forecast accuracy, and subscriber count. Run "intel forecast" to calibrate market predictions.',
      '  2. Scale recurring cycle income with "intel sub [qty]" and sell prediction packs via "intel license [1..3]".',
      '  3. Toggle "intel advisory" and enable SYN-4 / SYN-5 in "hq synergy" to lift mining auto-sell payouts and cut exchange fees.',
      '  Check: review Market Intel Net P&L in "corp ledger" after billing.',
    ],
    nextCommand: 'intel',
  },
  hardware_eng: {
    id: 'hardware_eng',
    title: 'HARDWARE ENGINEERING DIVISION (B3)',
    summary: 'License foundry silicon IP, fulfill design contracts, and tune fleet thermals.',
    lines: [
      '  Decision: license custom blueprints externally or upgrade lab efficiency for Foundry synergy?',
      '  1. Run "eng" to inspect Lab Tier, royalties, and thermal tuning bonuses.',
      '  2. Monetize tested blueprints from "fab" via "eng license <bp#>" for recurring royalty payouts, or bid on "eng contract".',
      '  3. Run "eng tune" to optimize fleet power/cooling draw, or "eng upgrade" to raise lab capacity.',
      '  Check: link Hardware Eng to Manufacturing via SYN-1 ("hq synergy") to cut NRE tooling fees.',
    ],
    nextCommand: 'eng',
  },
  manufacturing_div: {
    id: 'manufacturing_div',
    title: 'MANUFACTURING DIVISION (B4)',
    summary: 'Execute OEM fabrication contracts, sister-division supply orders, and fab QC.',
    lines: [
      '  Decision: ship fab inventory to external OEM buyers or supply sister divisions internally?',
      '  1. Run "mfg" to review active OEM contract slots, QC yield score, and Foundry lines.',
      '  2. Accept third-party runs with "mfg oem start [cat] [qty]" and fulfill from stock using "mfg oem fulfill <inv#>".',
      '  3. Fulfill internal supply ("mfg supply <mining|services>") to credit Mining/Services equipment discounts, and run "mfg qc" to cut scrap.',
      '  Check: activate SYN-2 and SYN-3 in "hq synergy" for vertical hardware savings.',
    ],
    nextCommand: 'mfg',
  },
  mining_services: {
    id: 'mining_services',
    title: 'MINING SERVICES DIVISION (B5)',
    summary: 'Operate commercial pools, expand colocation hosting racks, and enforce SLAs.',
    lines: [
      '  Decision: expand rack kW capacity for long-term hosting or lease spare power short-term?',
      '  1. Run "services" to view pool status, pool fee %, hosted clients, and SLA compliance.',
      '  2. Toggle your commercial pool ("services pool toggle") and tune competitive fees ("services pool fee <0.25..5.0>").',
      '  3. Expand colocation capacity ("services expand [kW]"), onboard clients ("services client add"), and run "services sla" to prevent churn.',
      '  Check: activate SYN-3 with Manufacturing for turnkey colocation margin bonuses.',
    ],
    nextCommand: 'services',
  },
  underground_div: {
    id: 'underground_div',
    title: 'UNDERGROUND SUBSIDIARY (B6)',
    summary: 'Run shell-shielded covert contracts while containing regulatory spillover.',
    lines: [
      '  Decision: push high-yield covert contracts or prioritize shell shielding to protect the parent corp?',
      '  1. Run "ug" to check Subsidiary Shield %, audit firewall status, and spillover count.',
      '  2. Harden separation via "ug shield" before accepting contracts ("ug contract [escrow|liquidity|pressure]").',
      '  3. When Heat climbs, run "ug sweep" to scrub audit trails or "ug contain" to absorb regulatory spillover from Mining HQ.',
      '  Check: watch Heat in "ops" — unshielded scandals still damage parent corporate credibility.',
    ],
    nextCommand: 'ug',
  },
};

export const CONTEXTUAL_GUIDES: Record<
  string,
  { title: string; body: string; topic: string; system?: GuidedSystemId }
> = {
  ctx_benchmark: {
    title: 'TUNE FOR A JOB',
    body: 'A higher hashrate can cost more power or heat. Pick the benchmark that fits the business, then compare it against the reference.',
    topic: 'optimization',
  },
  ctx_inspect: {
    title: 'READ THE WEAKEST PART',
    body: "Compare output, heat, and the weakest component. One worn part can stop a rig whose average health still looks good.",
    topic: 'hardware',
  },
  ctx_repair: {
    title: 'PRICE THE SMALLEST FIX',
    body: "Inspect the rig first. If one component is failing, compare its repair quote with a full service before spending.",
    topic: 'hardware',
  },
  ctx_repaste: {
    title: 'TRY A SHORT-TERM COOLING FIX',
    body: "Fresh paste helps for a limited time. If temperatures climb again, compare a lower clock, a better room, or permanent cooling.",
    topic: 'power',
  },
  ctx_power: {
    title: 'CHECK WHAT IS LIMITING YOUR GRID',
    body: "Compare the load and breaker cap before changing the rate. A cheap contract can cost more if it forces you to turn off a profitable rig.",
    topic: 'power',
  },
  ctx_cool: {
    title: 'CHECK WHAT THE COOLER SAVES',
    body: "Compare the recovery in mining output with the cooler’s power and upkeep. A layout change or lower clock may cost less.",
    topic: 'power',
  },
  ctx_facilities: {
    title: 'QUOTE THE MOVE FIRST',
    body: "Use \"facility preview <#>\" to price the move and the recurring rent. \"facility rent <#>\" moves sites; \"facility upgrade <#>\" changes this site.",
    topic: 'facilities',
  },
  ctx_usedmarket: {
    title: 'COMPARE THE WHOLE COST',
    body: "Use \"usedmarket preview <#>\". A low price helps only if the rig fits your grid and the discount covers condition and likely repairs.",
    topic: 'usedmarket',
  },
  ctx_research: {
    title: 'BUY A CAPABILITY YOU CAN USE',
    body: "Compare what each project enables with the bottleneck you have now. Budget the project fee and the cost of the upgrade it unlocks.",
    topic: 'research',
  },
  ctx_contracts: {
    title: 'COMPARE THE TARGET WITH YOUR FLEET',
    body: 'Pick a job your fleet can deliver. Quiet Hours measures live noise, Delivery Sprint measures the chosen coin, and the move-in job requires two earning rigs at the new site.',
    topic: 'contracts',
    system: 'contracts',
  },
  ctx_staff: {
    title: 'CHECK PAYROLL BEFORE HIRING',
    body: "Pick a specialist for a specific bottleneck. Compare the recurring salary with what the role could save or earn each billing cycle.",
    topic: 'employees',
    system: 'staff',
  },
  ctx_rivals: {
    title: 'WATCH THE MARKET YOU MINE',
    body: 'Use "rivals markets" to see which competitors are driving difficulty. Scout a rival to see its next funded move and decide whether to respond.',
    topic: 'rivals',
    system: 'rivals',
  },
  ctx_pr: {
    title: 'MEASURE THE RETURN ON A CAMPAIGN',
    body: "Compare campaign spend and scrutiny with the revenue it could add. Choose an outcome you can check when the campaign ends.",
    topic: 'ops',
    system: 'pr',
  },
  ctx_ops: {
    title: 'CHECK WHAT THE COMPANY CAN LOSE',
    body: "This is an optional fictional risk system. Inspect scrutiny and possible sanctions before spending operating cash.",
    topic: 'blackmarket',
    system: 'ops',
  },
  ctx_blackmarket: {
    title: 'PRICE THE DOWNSIDE',
    body: "Compare the listing with a legal used rig and check the impact an audit or seizure could have on the company.",
    topic: 'blackmarket',
    system: 'blackmarket',
  },
  ctx_overheat: {
    title: 'RECOVER OUTPUT BEFORE ADDING HARDWARE',
    body: "Use \"rigs\" to find the hot rig. Try a lower clock, a cooler room, or fresh paste, then inspect it after a step to see what worked.",
    topic: 'power',
  },
  ctx_low_health: {
    title: 'FIND THE PART STOPPING THE RIG',
    body: "Use \"inspect <#>\" to identify the worn part. Compare a targeted repair with full service and check output after the repair.",
    topic: 'hardware',
  },
  ctx_fab: {
    title: 'CHECK THE FIRST-PART BUDGET',
    body: "Budget line upkeep, tooling, prototype, and production. Pick an existing rig or a buyer for the first part before you pay for the design.",
    topic: 'engineering',
    system: 'fab',
  },
  ctx_proto: {
    title: 'TEST BEFORE ORDERING A BATCH',
    body: "Compare a prototype’s score and thermal margin with your target. A one-unit order limits the cost of learning whether a design passes QA.",
    topic: 'manufacturing',
  },
  ctx_coins: {
    title: 'RING-FENCE THE LIQUIDITY BUDGET',
    body: "A new network ties up cash. Check what your fleet can mine and set aside bill money before committing liquidity.",
    topic: 'coins',
    system: 'coins',
  },
  ctx_coin_unlocks: {
    title: 'PRICE THE NEXT MINING DESK',
    body: 'Check "coin info <COIN>" and "inspect <#>" before paying to open a desk. Compare the new coin on one compatible rig before moving the fleet.',
    topic: 'coins',
    system: 'coinUnlocks',
  },
  ctx_gen7: {
    title: 'PRICE THE COMPLETE PLATFORM',
    body: "Compare a Quantum chip plus Cryo gear with a Photonic chip plus its Optical backplane. Check coin compatibility and total load.",
    topic: 'gen7',
    system: 'gen7',
  },
  ctx_exchange: {
    title: 'PROTECT WORKING CASH',
    body: "Review holdings and orders in \"wallet\". Reserve money for bills before adding exposure to coin prices.",
    topic: 'exchange',
    system: 'exchange',
  },
  ctx_corp: {
    title: 'CONSOLIDATE YOUR HOLDING COMPANY',
    body: 'Check "corp ledger" for per-division net P&L, "acquire" for distressed buyouts, and "hq" for inter-division synergies.',
    topic: 'conglomerate',
  },
  ctx_intel: {
    title: 'CALIBRATE DATA BEFORE SELLING',
    body: 'Run "intel forecast" and scale model tiers before adding subscribers. Link SYN-4 / SYN-5 once HQ is incorporated.',
    topic: 'market_intel',
  },
  ctx_eng: {
    title: 'MONETIZE VALIDATED BLUEPRINTS',
    body: 'Prototype-tested parts from "fab" can be licensed via "eng license <bp#>" for recurring royalties without burning line capacity.',
    topic: 'hardware_eng',
  },
  ctx_mfg: {
    title: 'BALANCE OEM RUNS & INTERNAL SUPPLY',
    body: 'Keep Foundry batches moving with "mfg qc", fulfill external OEM slots for cash, and use "mfg supply" to lower sister-division costs.',
    topic: 'manufacturing_div',
  },
  ctx_services: {
    title: 'PROTECT HOSTING SLA UPTIME',
    body: 'Keep colocation power headroom above contracted kW and run "services sla" when SLA drops so hosted clients stay retained.',
    topic: 'mining_services',
  },
  ctx_ug: {
    title: 'SHIELD THE PARENT CORPORATION',
    body: 'Build shell insulation with "ug shield" before running "ug contract". Run "ug contain" if subsidiary heat threatens parent credibility.',
    topic: 'underground_div',
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
      '  - The early board offers quiet mining, coin delivery, and one commissioning job for each of the first two moves.',
      '  - Rivals fund rack, silicon, facility, and power projects. Their active mining desks raise difficulty on those coins.',
      '  - "rivals markets" shows local competition. "rivals log <#>" lists completed moves. Paid recon reveals funded projects for 12 steps.',
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
      '  - "guide" lists business milestones that earn access. "guide pause" and "guide pace" control tips.',
    ],
  },
  {
    key: 'conglomerate',
    title: 'CORPORATE CONGLOMERATE, M&A & GEN-7 GATE',
    category: 'PROGRESSION',
    keywords: ['corp', 'conglomerate', 'hq', 'synergy', 'acquire', 'buyout', 'turnaround', 'gen7', 'affinity', 'ledger'],
    relatedKeys: ['divisions', 'gen7', 'research'],
    body: [
      '  - At Gen 5+, hidden Industry Affinity shapes your lead distressed M&A buyout offer ("acquire").',
      '  - Acquired divisions begin RECOVERING at 0.75x efficiency; run "corp turnaround <biz>" or step to stabilize.',
      '  - Incorporate Corporate HQ ("hq establish") at 2+ businesses to unlock HQ tiers and 6 Synergy Policies.',
      '  - Career mode requires owning all 6 businesses simultaneously to unlock Gen-7 Quantum & Photonic R&D.',
      '  - Having all 6 businesses ACTIVE with HQ established awards a +10% Apex RP Dividend.',
    ],
  },
  {
    key: 'divisions',
    title: 'THE SIX BUSINESS PILLARS & DIVISION OPERATIONS',
    category: 'OPERATIONS',
    keywords: ['intel', 'eng', 'mfg', 'services', 'ug', 'oem', 'pool', 'hosting', 'firewall', 'subsidiary', 'divisions'],
    relatedKeys: ['conglomerate', 'fab', 'investigation'],
    body: [
      '  - B1 Mining: Core facilities, rigs, power/cooling, and crypto production.',
      '  - B2 Market Intel ("intel"): Forecasting models, data subscriptions, software licenses, treasury advisory.',
      '  - B3 Hardware Eng ("eng"): External blueprint IP licensing, engineering contracts, cooling/power tuning.',
      '  - B4 Manufacturing ("mfg"): OEM manufacturing contracts, QC audits, internal supply to Mining/Services.',
      '  - B5 Mining Services ("services"): Commercial mining pools, colocation kW hosting, compute leases & SLAs.',
      '  - B6 Underground ("ug"): Shell shielding, covert escrow/liquidity contracts, audit firewalls & spillover containment.',
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
