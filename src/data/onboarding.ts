import { FACILITY_TIERS } from './catalog';
import { GameState, OnboardingMode } from '../types/game';

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

export type GuidedSystemId = 'contracts' | 'staff' | 'rivals' | 'pr' | 'ops' | 'blackmarket';

export interface SystemUnlockStatus {
  contracts: boolean;
  staff: boolean;
  rivals: boolean;
  pr: boolean;
  ops: boolean;
  blackmarket: boolean;
  unlockNotes: Record<GuidedSystemId, string>;
}

export function getEffectiveOnboardingMode(
  state: Pick<GameState, 'onboardingMode' | 'devMode' | 'isSandbox'>
): OnboardingMode {
  if (state.devMode || state.isSandbox) return 'VETERAN';
  return state.onboardingMode ?? 'GUIDED';
}

export function getUnlockedSystems(
  state: Pick<
    GameState,
    | 'onboardingMode'
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
  >
): SystemUnlockStatus {
  const mode = getEffectiveOnboardingMode(state);
  const allOpen = mode === 'VETERAN' || state.devUnlockAll;
  const facIdx = Math.max(0, FACILITY_TIERS.findIndex((f) => f.id === state.facilityId));

  const contracts =
    allOpen ||
    state.stepCount >= 3 ||
    state.rigs.length >= 2 ||
    state.unlockedResearch.length >= 1 ||
    (state.stats?.contractsCompleted ?? 0) > 0;

  const staff =
    allOpen ||
    facIdx >= 1 ||
    state.cash >= 1800 ||
    state.stepCount >= 8 ||
    state.employees.length > 0;

  const rivals =
    allOpen ||
    facIdx >= 1 ||
    state.rigs.length >= 2 ||
    state.stepCount >= 10;

  const pr =
    allOpen ||
    facIdx >= 1 ||
    state.rigs.length >= 2 ||
    state.stepCount >= 10;

  const ops =
    allOpen ||
    facIdx >= 1 ||
    state.stepCount >= 14 ||
    state.regulatoryScrutiny >= 18 ||
    (state.stats?.covertOpsCount ?? 0) > 0;

  const blackmarket = ops;

  return {
    contracts,
    staff,
    rivals,
    pr,
    ops,
    blackmarket,
    unlockNotes: {
      contracts: 'Unlocks at Step 3, 2nd rig, or 1st completed R&D node',
      staff: `Unlocks at ${GARAGE_FACILITY_NAME}, $1,800 Cash, or Step 8`,
      rivals: `Unlocks at ${GARAGE_FACILITY_NAME}, 2nd rig, or Step 10`,
      pr: `Unlocks at ${GARAGE_FACILITY_NAME}, 2nd rig, or Step 10`,
      ops: `Unlocks at ${GARAGE_FACILITY_NAME}, Step 14, or Heat >= 18`,
      blackmarket: `Unlocks alongside Underground Ops at ${GARAGE_FACILITY_NAME} or Step 14`,
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
    summary: 'How rig parts, individual component wear, single-part repairs, and used hardware work.',
    lines: [
      '  8-PART RIG ARCHITECTURE:',
      '    Chassis   -> Sets GPU slot limit (or ASIC rack mode) and passive cooling.',
      '    Compute   -> CPU/FPGA/ASIC core hashing engine & algorithm family.',
      '    GPUs      -> Stackable ETHASH/SCRYPT accelerators on GPU-ready frames.',
      '    Storage   -> RAM/NVMe efficiency bonus (+% revenue) & POST storage plots.',
      '    PSU       -> Watt ceiling MUST cover raw component draw or rig halts.',
      '    Cooling   -> Drops equilibrium temperature; keeps rigs below 82C throttle.',
      '    OS Kernel -> Multiplies hashrate & power draw; improves crash stability.',
      '',
      '  INDIVIDUAL COMPONENT HEALTH & TARGETED REPAIRS:',
      '    - Every rig tracks separate health % for chassis, compute, each GPU, storage, PSU, and cooling.',
      '    - Overall rig health shown in "rigs" is the AVERAGE of all installed components.',
      '    - If ANY single component falls to <= 20%, the entire rig halts (NEEDS_REPAIR).',
      '    - Run "inspect <#>" to see component bars and exact single-part repair prices.',
      '    - Repair commands: "repair 1 gpu", "repair 1 gpu 2", "repair 1 psu", or "repair 1".',
      '    - Run "tinker <#>" to swap individual parts with 60% trade-in credit.',
      '    - Check "usedmarket" for discounted Factory, Refurb, Used & Damaged rigs.',
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
      '    - Keep payroll covered & workload balanced: low morale cuts output, risks quits,',
      '      and mass low morale across a crew can trigger a facility-wide strike!',
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
      '    - Watch Regulatory Scrutiny ("Heat" 0-100): high Heat increases audit/raid risk.',
    ],
    nextCommand: 'rivals',
  },
  blackmarket: {
    id: 'blackmarket',
    title: 'UNDERGROUND OPS & BLACK MARKET',
    summary:
      'High-risk covert actions: power siphoning, botnets, wash trading, pump & dumps, extortion, and illicit ROMs.',
    lines: [
      '  COVERT ACTIONS ("ops"):',
      '    - Power Siphon: -65% electricity bills & +25% grid cap, but +3.2 Heat every step.',
      '    - Botnet Rental: Temporary massive hash surge on a coin for a fee + Heat spike.',
      '    - Wash Trade / Rival Sabotage: Manipulate price or DDoS a rival syndicate.',
      '    - Pump & Dump ("ops pump <COIN>"): Harder price spike than a wash trade, but a',
      '      traceable pattern — regulators can fine you and Heat climbs faster.',
      '    - Protection Racket ("ops extort <#>"): Demand cash from a rival syndicate;',
      '      they may refuse, costing Heat, raising hostility and inviting retaliation.',
      '    - Heat Mitigation: Run "ops launder" or "ops bribe" to shield against raids.',
      '',
      '  BLACK MARKET ("blackmarket"):',
      '    - Buy illicit BIOS/firmware flashes (extra hash at higher wear/heat) or smuggled',
      '      zero-serial rigs that bypass R&D gates at 35% discount — for major Heat gain.',
      '    - WARNING: High Heat triggers Federal Audit / Raid events with heavy fines & seizures!',
    ],
    nextCommand: 'ops',
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
    body: 'Power siphoning, botnets, wash trading, pump & dumps, extortion and sabotage offer huge shortcuts at the cost of Regulatory Scrutiny ("Heat"). Bigger schemes can be traced and fined. Keep Heat controlled with "ops launder" / "ops bribe" or risk federal raids.',
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
};

export interface CodexEntry {
  key: string;
  title: string;
  keywords: string[];
  body: string[];
}

export const CODEX_ENTRIES: CodexEntry[] = [
  {
    key: 'mining',
    title: 'CORE MINING LOOP & AUTO-SELL',
    keywords: ['step', 'hashrate', 'pps', 'pplns', 'solo', 'coin', 'payout'],
    body: [
      '  - Time advances only when you run "step [n]" or while the 30s auto-step timer runs.',
      '  - Every step, active rigs mine their target coin and AUTO-SELL output into Cash.',
      '  - Pool modes ("rig <#> pool <pps|pplns|solo>"): PPS = steady 98%; PPLNS = ~105% with',
      '    variance; SOLO = low hit chance per step for massive block jackpot payouts.',
      '  - Overclock ("overclock <#> <80..150>") trades nonlinearly higher watts/heat for hash.',
    ],
  },
  {
    key: 'hardware',
    title: 'RIG ARCHITECTURE & COMPONENT HEALTH',
    keywords: ['chassis', 'compute', 'gpu', 'psu', 'storage', 'os', 'health', 'repair', 'tinker'],
    body: [
      '  - Each rig combines Chassis, Compute, optional GPUs, Storage/RAM, PSU, Cooling, and OS.',
      '  - Every physical part has its own 0-100% health; Rig Health = average across parts.',
      '  - If average health OR any single component reaches <=20%, the rig halts (NEEDS_REPAIR).',
      '  - Run "inspect <#>" to view per-part bars and exact repair prices.',
      '  - Target a single part: "repair 1 psu", "repair 1 gpu", or "repair 1 gpu 2".',
      '  - Swap parts anytime via "tinker <#>" with 60% trade-in credit on replaced hardware.',
    ],
  },
  {
    key: 'power',
    title: 'ELECTRICITY, CONTRACTS & COOLING',
    keywords: ['watt', 'kw', 'breaker', 'bill', 'cycle', 'cooling', 'repaste', 'thermal', 'noise'],
    body: [
      '  - Facility power cap (kW) limits total simultaneous wall draw of rigs + room cooling.',
      '  - Exceeding kW cap triggers UNDERPOWERED breaker trips. Use "power contract <1..4>"',
      '    or "facility upgrade 1" (circuits) to balance $/kWh rates vs. capacity.',
      '  - Thermal zones: <82C optimal | 82-95C throttled | >=96C emergency thermal shutdown.',
      '  - Refresh paste ("repaste <#>") for -6C relief over 16 steps or add cooling units ("cool").',
      '  - Exceeding facility noise cap (dBA) incurs municipal fines every 5 steps.',
    ],
  },
  {
    key: 'facilities',
    title: 'FACILITIES, ROOMS & INFRASTRUCTURE UPGRADES',
    keywords: ['bedroom', 'garage', 'warehouse', 'rent', 'buy', 'upgrade', 'rooms', 'floorplan', 'expand'],
    body: [
      `  - ${FACILITY_TIERS.length} progression tiers from ${FIRST_FACILITY.name} (${FIRST_FACILITY.maxRigs} slots, ${FIRST_FACILITY.maxPowerKw} kW) to ${LAST_FACILITY.name} (${LAST_FACILITY.maxRigs} slots, ${LAST_FACILITY.maxPowerKw} kW).`,
      '  - Renting requires lower upfront cash; Buying removes recurring 30-step rent.',
      '  - Run "rooms" for an interactive ASCII floor-plan; move rigs ("rig <#> room <#>") into',
      '    Cold Aisles or baffled Cleanrooms, place coolers ("cool room <#> <room#>"), or "room expand".',
      '  - Facility Upgrades ("facility upgrade <1..6>") add circuits, ventilation, bays, cooling',
      '    manifolds, power distribution savings, and backup UPS power.',
    ],
  },
  {
    key: 'employees',
    title: 'STAFF SPECIALISTS, SHIFTS & MORALE',
    keywords: ['staff', 'hire', 'train', 'shift', 'priority', 'payroll', 'morale', 'strike'],
    body: [
      '  - 7 roles: Technician, Electrician, Manager, Sys Engineer, Researcher, PR, Analyst.',
      '  - Staff earn XP each step up to Lv 5; "train <#>" levels them up faster (+10 morale).',
      '  - "shift <#> <day|night|24/7>" and "priority <#>" tune focus vs. +35% 24/7 salary.',
      '  - Billing cycles settle payroll every 30 steps; keep morale & staffing balanced.',
    ],
  },
  {
    key: 'market',
    title: 'CRYPTO MARKET, REGIMES & HALVINGS',
    keywords: ['btc', 'ltc', 'doge', 'xmr', 'eth', 'xch', 'regime', 'halving', 'chart'],
    body: [
      '  - Six coins across 5 hashing algorithms: BTC (SHA256), LTC/DOGE (SCRYPT), XMR',
      '    (RANDOMX), ETH (ETHASH), and XCH (POST storage). Unlock tiers via "unlock <COIN>".',
      '  - Market Regimes cycle through Accumulation, Bull Run, Mania Peak, Correction, Winter.',
      '  - Block Halvings cut coin emission by 50% and trigger +24% supply-shock price surges.',
      '  - View 1-step & 7-step changes in the right-side Crypto Market panel or "chart <COIN>".',
    ],
  },
  {
    key: 'contracts',
    title: 'CONTRACTS, RIVALS & COVERT OPS',
    keywords: ['contract', 'rival', 'pr', 'ops', 'blackmarket', 'heat', 'raid', 'siphon'],
    body: [
      '  - Enterprise Contracts ("contracts") award Cash, RP & Reputation on completion.',
      '  - Rivals ("rivals") grow continuously and raise network difficulty across shared coins.',
      '  - PR Campaigns ("pr") legally shift coin prices/sentiment; Covert Ops ("ops") and',
      '    Black Market ("blackmarket") trade big shortcuts for Regulatory Scrutiny ("Heat").',
      '  - Underground actions: "ops siphon", "ops botnet", "ops wash", "ops pump", "ops extort",',
      '    "ops sabotage", "ops raid", "ops launder", "ops bribe". Bigger schemes raise more Heat and',
      '    can be traced. Vault raids ("ops raid <#>") steal cash and hijack rival hashrate for 8 steps.',
      '  - Shell coins ("ops coin <TICKER> <Name>", "ops shill", "ops rug") are manufactured tokens:',
      '    hype decays every step, the liquidity pool is what a rug can take, and a traced rug draws a fine.',
    ],
  },
  {
    key: 'seasons',
    title: 'SEASONS, LEADERBOARDS & HALL OF FAME',
    keywords: ['season', 'leaderboard', 'rank', 'score', 'hall', 'fame', 'champion'],
    body: [
      '  - A season lasts 60 steps. Run "leaderboard" (or "season") for live standings vs. every rival.',
      '  - Season score = company valuation + hash index x600 + reputation x450 + 5 per unspent RP.',
      '  - When a season closes its standings are archived in the Hall of Fame and a champion is crowned.',
      '  - Finish a season at #1 to unlock the "Season Champion" achievement.',
    ],
  },
  {
    key: 'research',
    title: 'R&D TREE, ACHIEVEMENTS & CHALLENGES',
    keywords: ['rp', 'research', 'milestone', 'achievement', 'challenge'],
    body: [
      '  - Research spans Hardware, Electrical, Cooling, Automation, and Business.',
      '  - Base RP accrues at +0.75/step plus Research Scientist output.',
      '  - "milestones", "achievements", and "challenges" track long-term empire benchmarks.',
    ],
  },
  {
    key: 'exchange',
    title: 'TREASURY WALLET, HOLD PAYOUT & CRYPTO EXCHANGE',
    keywords: ['wallet', 'exchange', 'trade', 'hold', 'limit', 'short', 'margin'],
    body: [
      '  - Switch any rig between Auto-Sell and Treasury Hold ("rig <#|all> payout <hold|sell>").',
      '  - Held coins accumulate in your Wallet ("wallet") instead of converting immediately to USD.',
      '  - Trade spot ("exchange buy <COIN> <usd>", "exchange sell <COIN> <qty|all>"), place',
      '    automated limit orders ("exchange limit <buy|sell> <COIN> <px> <amt>"), or hedge',
      '    bear cycles with 1x collateralized shorts ("exchange short <COIN> <usd>").',
    ],
  },
  {
    key: 'fab',
    title: 'PROPRIETARY CHIP DESIGN & ASIC FOUNDRY',
    keywords: ['fab', 'foundry', 'chip', 'asic', 'wafer', 'lithography', 'design', 'manufacture'],
    body: [
      '  - Unlocked at Warehouse tier + "Semiconductor Wafer Lithography" R&D ("fab").',
      '  - Commission 1..3 cleanroom fab lines ("fab line build"), then tape out custom',
      '    silicon across 7nm, 5nm, 3nm, 2nm, 1nm, or photonic ("fab design <name> <algo> <node>").',
      '  - Manufacture wafer batches ("fab produce <bp#> <qty>") and either install finished',
      '    chips directly onto rigs ("fab deploy <inv#> <rig#>") or export wholesale ("fab sell").',
    ],
  },
];
