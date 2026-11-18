import React, { useEffect, useRef, useState } from 'react';
import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_TIERS,
  FIRMWARE_PROFILE_SPECS,
  GPU_PARTS,
  ILLICIT_MOD_SPECS,
  MARKET_REGIME_SPECS,
  OS_PARTS,
  POOL_MODE_SPECS,
  PR_CAMPAIGNS,
  PSU_PARTS,
  RESEARCH_NODES,
  RIG_PRESETS,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from '../data/catalog';
import {
  BILLING_CYCLE_STEPS,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  computeStepCoinOutput,
  getAutoSellMultiplier,
  getEffectiveFacilityPowerCapKw,
  getEmpireAlignment,
  getFacility,
  getFacilityTotals,
  getRigRepasteCost,
  getRigRepairCost,
  getSysEngineerBonus,
} from '../engine/simulation';
import {
  CoinSymbol,
  EmployeeRole,
  FirmwareProfile,
  GameState,
  MarketRegime,
  PendingEvent,
  PoolMode,
  RigBuildConfig,
  RoomCoolingType,
  ShiftType,
  TaskPriority,
} from '../types/game';
import {
  formatCoinAmount,
  formatHashrate,
  formatStepLabel,
  formatUsd,
  renderAsciiBar,
  renderAsciiSparkline,
} from '../utils/format';

export interface LogLine {
  id: string;
  kind: 'CMD' | 'HEAD' | 'OK' | 'WARN' | 'ERR' | 'TEXT' | 'PRE';
  text: string;
}

type BuildStep =
  | 'CHASSIS'
  | 'COMPUTE'
  | 'GPU'
  | 'STORAGE'
  | 'PSU'
  | 'COOLING'
  | 'OS'
  | 'COIN'
  | 'CONFIRM';

interface BuildWizardState {
  step: BuildStep;
  config: RigBuildConfig;
}

type TinkerSlot = 'MENU' | 'chassis' | 'compute' | 'gpu' | 'storage' | 'psu' | 'cooling' | 'os';

interface TinkerState {
  rigIndex: number;
  slot: TinkerSlot;
}

export interface TerminalCommandTrigger {
  seq: number;
  command: string;
}

export interface StepBatchResult {
  stepsRun: number;
  newStepCount: number;
  miningCashEarned: number;
  rpEarned: number;
  billsSettledUsd: number;
  soloBlocksHit: number;
  haltedByEvent: PendingEvent | null;
}

interface TextGameTerminalProps {
  state: GameState;
  commandTrigger: TerminalCommandTrigger | null;
  onStepSteps: (steps: number) => StepBatchResult | null;
  onResolveEvent: (choiceKey: string) => { ok: boolean; summary: string };
  onUnlockCoin: (symbol: CoinSymbol) => boolean;
  onDeployRig: (config: RigBuildConfig) => boolean;
  onSalvageRig: (rigId: string) => void;
  onRenameRig: (rigId: string, name: string) => void;
  onToggleRig: (rigId: string) => void;
  onChangeRigCoin: (rigId: string, coin: CoinSymbol) => void;
  onChangeRigOverclock: (rigId: string, oc: number) => void;
  onOverclockRigs: (rigIndexOrAll: number | 'ALL', oc: number) => boolean;
  onTinkerPart: (
    rigIndex: number,
    slot: 'chassis' | 'compute' | 'storage' | 'psu' | 'cooling' | 'os',
    partId: string
  ) => { ok: boolean; summary: string };
  onTinkerGpu: (
    rigIndex: number,
    action: 'ADD' | 'REMOVE' | 'CLEAR',
    gpuIdOrSlotIdx?: string | number,
    qty?: number
  ) => { ok: boolean; summary: string };
  onSetRigPool: (rigIndexOrAll: number | 'ALL', pool: PoolMode) => boolean;
  onSetRigProfile: (rigIndexOrAll: number | 'ALL', profile: FirmwareProfile) => boolean;
  onRepairRigs: (rigIndexOrAll: number | 'ALL') => { ok: boolean; count: number; cost: number };
  onRepasteRigs: (rigIndexOrAll: number | 'ALL') => { ok: boolean; count: number; cost: number };
  onAddCoolingUnit: (type: RoomCoolingType) => boolean;
  onToggleCoolingUnit: (coolingId: string) => void;
  onRemoveCoolingUnit: (coolingId: string) => void;
  onSelectFacility: (facilityId: string, action: 'RENT' | 'BUY') => boolean;
  onHireEmployee: (role: EmployeeRole) => boolean;
  onFireEmployee: (employeeId: string) => void;
  onUpdateEmployee: (employeeId: string, shift: ShiftType, priority: TaskPriority) => void;
  onStartResearch: (nodeId: string) => boolean;
  onLaunchCampaign: (templateId: string, targetCoin: CoinSymbol) => boolean;
  onAcceptContract: (contractId: string) => boolean;
  onAbandonContract: () => boolean;
  onToggleSiphon: (enable: boolean) => boolean;
  onRentBotnet: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onWashTrade: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onSabotageRival: (rivalId: string) => { ok: boolean; reason?: string; cost?: number };
  onLaunderHeat: () => { ok: boolean; reason?: string; cost?: number };
  onBribeInspectors: () => { ok: boolean; reason?: string; cost?: number };
  onBuyBlackMarket: (listingId: string, rigIdx?: number) => { ok: boolean; summary: string };
  onToggleDevMode: (enabled: boolean) => void;
  onOpenDevPanel: () => void;
  onToggleDevUnlockAll: () => void;
  onDevAddCash: (amount: number) => void;
  onDevAddRp: (amount: number) => void;
  onDevUnlockAllResearch: () => void;
  onDevOwnAllFacilities: () => void;
  onDevUnlockAllCoins: () => void;
  onDevResetRigTemps: () => void;
  onDevAdjustCoinPrice: (symbol: CoinSymbol, mult: number) => void;
  onDevTriggerEvent: (forceRaid?: boolean) => void;
  onDevSetRegime: (regime: MarketRegime) => void;
  onDevTriggerHalving: (symbol: CoinSymbol) => void;
  onDevSetHeat: (heat: number) => void;
  onDevRefreshBlackMarket: () => void;
  onSetTutorialStep: (step: number) => void;
}

const TOP_COMMANDS = [
  'help',
  'tutorial',
  'status',
  'step',
  'event',
  'decide',
  'build rig',
  'build preset',
  'presets',
  'overclock',
  'tinker',
  'rigs',
  'inspect',
  'rig',
  'repair',
  'repaste',
  'salvage',
  'rename',
  'cool',
  'facilities',
  'facility',
  'market',
  'unlock',
  'chart',
  'contracts',
  'contract',
  'rivals',
  'ops',
  'blackmarket',
  'staff',
  'hire',
  'fire',
  'shift',
  'priority',
  'research',
  'ledger',
  'pr',
  'log',
  'dev',
  'clear',
];

function padRight(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

export const TextGameTerminal: React.FC<TextGameTerminalProps> = ({
  state,
  commandTrigger,
  onStepSteps,
  onResolveEvent,
  onUnlockCoin,
  onDeployRig,
  onSalvageRig,
  onRenameRig,
  onToggleRig,
  onChangeRigCoin,
  onChangeRigOverclock,
  onOverclockRigs,
  onTinkerPart,
  onTinkerGpu,
  onSetRigPool,
  onSetRigProfile,
  onRepairRigs,
  onRepasteRigs,
  onAddCoolingUnit,
  onToggleCoolingUnit,
  onRemoveCoolingUnit,
  onSelectFacility,
  onHireEmployee,
  onFireEmployee,
  onUpdateEmployee,
  onStartResearch,
  onLaunchCampaign,
  onAcceptContract,
  onAbandonContract,
  onToggleSiphon,
  onRentBotnet,
  onWashTrade,
  onSabotageRival,
  onLaunderHeat,
  onBribeInspectors,
  onBuyBlackMarket,
  onToggleDevMode,
  onOpenDevPanel,
  onToggleDevUnlockAll,
  onDevAddCash,
  onDevAddRp,
  onDevUnlockAllResearch,
  onDevOwnAllFacilities,
  onDevUnlockAllCoins,
  onDevResetRigTemps,
  onDevAdjustCoinPrice,
  onDevTriggerEvent,
  onDevSetRegime,
  onDevTriggerHalving,
  onDevSetHeat,
  onDevRefreshBlackMarket,
  onSetTutorialStep,
}) => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [wizard, setWizard] = useState<BuildWizardState | null>(null);
  const [tinker, setTinker] = useState<TinkerState | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seenNewsIdsRef = useRef<Set<string>>(new Set());
  const seenEventIdRef = useRef<string | null>(null);
  const lastTutorialStepRef = useRef<number | null>(null);
  const bootedRef = useRef(false);

  const append = (entries: Omit<LogLine, 'id'>[]) => {
    setLines((prev) => [
      ...prev.slice(-280),
      ...entries.map((e, i) => ({
        ...e,
        id: `ln_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      })),
    ]);
  };

  const isPartUnlocked = (researchRequired?: string) => {
    if (state.devUnlockAll) return { ok: true, reason: '' };
    if (researchRequired && !state.unlockedResearch.includes(researchRequired)) {
      const node = RESEARCH_NODES.find((n) => n.id === researchRequired);
      return { ok: false, reason: `R&D: ${node?.name ?? researchRequired}` };
    }
    return { ok: true, reason: '' };
  };

  const printPendingEvent = (evt: PendingEvent) => {
    const optLines = evt.options.map(
      (o) => `  [${o.key}] ${o.label}\n      -> ${o.riskNote}`
    );
    append([
      {
        kind: 'ERR',
        text: `ALERT // TERMINAL DECISION REQUIRED [${evt.category}] — ${evt.title}`,
      },
      { kind: 'WARN', text: evt.description },
      { kind: 'PRE', text: optLines.join('\n') },
      {
        kind: 'TEXT',
        text: 'Enter 1, 2, or 3 (or click a decision button below). Read commands ("status", "ops", "market") remain available.',
      },
    ]);
  };

  const printStatus = () => {
    const facility = getFacility(state.facilityId);
    const totals = getFacilityTotals(state);
    const effectiveCap = getEffectiveFacilityPowerCapKw(state);
    const enabledCount = state.rigs.filter((r) => r.enabled).length;
    const cooling = computeFacilityCoolingSummary(state.coolingUnits ?? [], enabledCount);
    const slotsPct = Math.min(100, (totals.rigCount / facility.maxRigs) * 100);
    const powerPct = Math.min(100, (totals.totalPowerKw / effectiveCap) * 100);
    const noisePct = Math.min(100, (totals.maxNoiseDba / facility.noiseLimitDba) * 100);
    const stepRev = state.rigs.reduce((s, r) => s + r.lastStepUsd, 0);
    const activeRes = state.activeResearchId
      ? RESEARCH_NODES.find((n) => n.id === state.activeResearchId)
      : null;

    const stepsToBill =
      BILLING_CYCLE_STEPS - (state.stepCount % BILLING_CYCLE_STEPS || BILLING_CYCLE_STEPS);
    const unlockedCoinsCount = (Object.keys(state.coins) as CoinSymbol[]).filter(
      (s) => state.coins[s].unlocked
    ).length;
    const regimeLabel = MARKET_REGIME_SPECS[state.marketRegime].label;
    const alignment = getEmpireAlignment(state);

    const sysBonus = getSysEngineerBonus(state);
    const rigLines = state.rigs.map((rig, i) => {
      const t = computeRigTelemetry(
        rig,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount
      );
      const profTag = rig.firmwareProfile === 'BALANCED' ? 'BAL' : rig.firmwareProfile === 'TURBO' ? 'TRB' : 'ECO';
      const poolTag = rig.poolMode === 'PPLNS' ? 'PLN' : rig.poolMode;
      const modTag = rig.illicitMod ? '*' : ' ';
      return `| [R${i + 1}]${modTag}${padRight(rig.name, 19)} ${padRight(rig.status, 11)} ${padRight(
        `${rig.targetCoin}/${poolTag}`,
        8
      )} ${padRight(profTag, 3)} ${padLeft(`${Math.round(rig.healthPct)}%`, 4)} ${padLeft(
        `${rig.temperatureC}C`,
        4
      )} ${padLeft(formatUsd(rig.lastStepUsd) + '/st', 11)} |`;
    });

    const coolList = (state.coolingUnits ?? []).length
      ? (state.coolingUnits ?? [])
          .map((u, i) => {
            const label =
              u.type === 'cool_unit_fan'
                ? 'FAN'
                : u.type === 'cool_unit_ac'
                ? 'AC'
                : 'CHILLER';
            return `[C${i + 1}:${label}:${u.enabled ? 'ON' : 'OFF'}]`;
          })
          .join(' ')
      : 'none';

    const contractText = state.activeContract
      ? `${state.activeContract.title} (${Math.min(
          100,
          Math.round((state.activeContract.progress / state.activeContract.targetAmount) * 100)
        )}%, ${state.activeContract.stepsRemaining}st left)`
      : 'None (run "contracts")';

    const covertSummary = [
      state.underground.powerSiphonActive ? 'SIPHON:ON' : null,
      state.underground.botnetStepsRemaining > 0
        ? `BOTNET:${state.underground.botnetCoin}(${state.underground.botnetStepsRemaining}st)`
        : null,
      state.underground.bribeProtectionSteps > 0
        ? `SHIELD:${state.underground.bribeProtectionSteps}st`
        : null,
    ]
      .filter(Boolean)
      .join(' ');

    const box = [
      `+================================================================================+`,
      `| ${padRight(
        `${formatStepLabel(state.stepCount)} | ${facility.name} | Seed: ${state.runSeed}`,
        78
      )} |`,
      `| ${padRight(
        `Cash: ${formatUsd(state.cash)}  Rev: ${formatUsd(stepRev)}/st  Coins: ${unlockedCoinsCount}/6  RP: ${state.researchPoints.toFixed(1)}`,
        78
      )} |`,
      `| ${padRight(
        `Regime: ${regimeLabel} (${state.regimeStepsRemaining}st)  Heat: ${Math.round(
          state.regulatoryScrutiny
        )}/100  Align: ${alignment}`,
        78
      )} |`,
      `+--------------------------------------------------------------------------------+`,
      `| SLOTS [${renderAsciiBar(slotsPct, 14)}] ${padRight(
        `${totals.rigCount}/${facility.maxRigs}`,
        6
      )} POWER [${renderAsciiBar(powerPct, 14)}] ${padRight(
        `${totals.totalPowerKw.toFixed(2)}/${effectiveCap}kW`,
        13
      )} |`,
      `| NOISE [${renderAsciiBar(noisePct, 14)}] ${padRight(
        `${totals.maxNoiseDba}/${facility.noiseLimitDba}dBA`,
        9
      )} COOLING: ${padRight(
        `-${cooling.effectiveCoolingPerRigC.toFixed(1)}°C/rig (bill in ${stepsToBill}st)`,
        31
      )} |`,
      `+--------------------------------------------------------------------------------+`,
      ...(rigLines.length > 0
        ? rigLines
        : [`|  No rigs deployed. Run "build rig" or "build preset 1" to assemble one.        |`]),
      `+--------------------------------------------------------------------------------+`,
      `| COOLING: ${padRight(coolList, 28)} CONTRACT: ${padRight(contractText, 29)} |`,
      `| OPS: ${padRight(covertSummary || 'Clean baseline', 34)} R&D: ${padRight(
        activeRes
          ? `${activeRes.name.slice(0, 20)} (${Math.round(state.activeResearchProgress)}/${activeRes.costRp})`
          : 'Idle',
        33
      )} |`,
      `+================================================================================+`,
    ].join('\n');

    append([{ kind: 'PRE', text: box }]);
  };

  const getWizardTutorialHint = (step: BuildStep): string | null => {
    if (!state.tutorialStep || state.tutorialStep < 1 || state.tutorialStep > 4) return null;
    switch (step) {
      case 'CHASSIS':
        return 'GUIDE [1/8 Chassis]: Chassis sets max GPU slots, rack type & passive cooling. Type "1" (Mid-Tower ATX, $55) for a starter build.';
      case 'COMPUTE':
        return 'GUIDE [2/8 Compute]: CPU/ASIC sets base hashing power & watts. Type "1" (Celeron G620, $80) to stay inside your Bedroom power cap.';
      case 'GPU':
        return 'GUIDE [3/8 GPUs]: GPUs boost ETHASH/SCRYPT mining. Type "1" to slot a GPU, or "done" to skip GPUs for a cheap CPU rig.';
      case 'STORAGE':
        return 'GUIDE [4/8 Storage/RAM]: Adds +% efficiency to rig revenue. Type "1" (4GB DDR3, $65) for a budget build.';
      case 'PSU':
        return 'GUIDE [5/8 PSU]: PSU max watts MUST exceed "Current component load" ([FITS]). Type "1" (450W, $48) if it fits.';
      case 'COOLING':
        return 'GUIDE [6/8 Cooling]: Drops equilibrium °C so rigs do not throttle above 82°C. Type "1" (Stock Fans, $25) or "2" for extra cooling.';
      case 'OS':
        return 'GUIDE [7/8 OS]: OS scales fleet hash & power draw. Type "1" (Desktop OS, $0) — unlocked right from Step 1.';
      case 'COIN':
        return 'GUIDE [8/8 Coin]: Mined coin auto-sells every step for USD. Pick an unlocked coin like "1" (BTC) — others show unlock costs.';
      case 'CONFIRM':
        return 'GUIDE [Review]: Check Cost & Est Auto-Sell/st above. If there are no warnings, type "deploy" (or click "deploy") to launch Rig #2!';
    }
  };

  const printTutorialStep = (stepNum: number) => {
    if (stepNum === 1) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [1/5] — READING YOUR DASHBOARD (status)' },
        {
          kind: 'PRE',
          text: [
            `  Step & bill in Nst  Time only moves when you run "step [n]". Utility & rent`,
            `                      bills settle automatically every ${BILLING_CYCLE_STEPS} steps.`,
            `  Cash & Rev/st       All mined crypto AUTO-SELLS each step into Cash. "RP"`,
            `                      is Research Points spent in "research" to unlock parts.`,
            `  SLOTS/POWER/NOISE   Facility limits. Exceeding Power trips breakers; high`,
            `                      Noise triggers complaints & fines.`,
            `  Regime & Heat       Regime cycles (Accumulation -> Bull -> Mania -> Winter)`,
            `                      move coin prices. Heat (0-100) rises with illegal "ops".`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "rigs" to inspect your starter rig & tuning columns (or "tutorial next" / "tutorial skip").',
        },
      ]);
      return;
    }

    if (stepNum === 2) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [2/5] — RIGS, POOLS, OVERCLOCK & TINKER' },
        {
          kind: 'PRE',
          text: [
            `  COIN/POOL   PPS = steady payout each step (0% luck); PPLNS (PLN) = +12%`,
            `              avg with mild swings; SOLO = rare all-or-nothing block jackpots.`,
            `  PROFILE     ECO (-watts/heat/wear), BAL (standard), TRB (+hash, +heat/wear).`,
            `  HLTH & TEMP Temps > 82°C throttle speed. Maintain rigs with "repair"/"repaste".`,
            `  overclock   "overclock 1 115" pushes speed (80..150%) for extra watts & heat.`,
            `  tinker      "tinker 1" opens a workbench to swap parts (60% trade-in credit).`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "tutorial next" to learn the 8 rig parts, or jump straight into "build rig" to build Rig #2!',
        },
      ]);
      return;
    }

    if (stepNum === 3) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [3/5] — HOW TO BUILD A RIG (8 PARTS)' },
        {
          kind: 'PRE',
          text: [
            `  1. Chassis     Sets max GPU slots (or ASIC rack mode) & passive cooling.`,
            `  2. Compute     CPU, FPGA, or ASIC unit — provides base hash & core watts.`,
            `  3. GPUs        Stackable cards for ETHASH / SCRYPT coins (optional).`,
            `  4. Storage     RAM & NVMe tier — adds a +% rig efficiency multiplier.`,
            `  5. PSU         Watt cap MUST cover total rig load ([FITS]) to deploy.`,
            `  6. Cooling     Cuts rig temperature (°C) & sets fan noise (dBA).`,
            `  7. OS          Firmware kernel tuning hashrate & power multipliers.`,
            `  8. Coin        Picks target coin. [LOCKED] parts/coins stay visible to plan R&D!`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "build rig" (or click "build rig" below) to assemble Rig #2 with live guided tips!',
        },
      ]);
      return;
    }

    if (stepNum === 4) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [4/5] — BUILD YOUR FIRST CUSTOM RIG' },
        {
          kind: 'PRE',
          text: [
            `  You have an open Bedroom slot and enough Cash for a custom rig (~$273+).`,
            `  Inside "build rig", pick option numbers (e.g. "1") at each prompt — or`,
            `  type "preset 1" on Step 1/8 to quick-load a starter build.`,
            `  Review the final spec sheet and type "deploy" to bring Rig #2 online.`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "build rig" now to open the guided rig builder.',
        },
      ]);
      return;
    }

    if (stepNum === 5) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [5/5] — RUNNING STEPS & SCALING YOUR EMPIRE' },
        {
          kind: 'PRE',
          text: [
            `  step [n]      Advance N steps to earn auto-sell USD & RP. Interactive`,
            `                events pause stepping until you choose option 1, 2, or 3.`,
            `  contracts     Accept timed contracts for extra cash & RP payouts.`,
            `  market        Track halvings, regimes, charts, and "unlock <COIN>" tiers.`,
            `  research      Unlock high-tier chassis, GPUs, ASICs, and immersion cooling.`,
            `  ops / bm      Optional illegal ops (power siphon, botnet, blackmarket).`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Final step -> Type "step 5" to run your expanded fleet and finish the tutorial!',
        },
      ]);
    }
  };

  const printWizardPrompt = (wiz: BuildWizardState) => {
    const { config, step } = wiz;
    const chassis = CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0];
    const facility = getFacility(state.facilityId);
    const sysBonus = getSysEngineerBonus(state);
    const guideTip = getWizardTutorialHint(step);

    if (step === 'CHASSIS') {
      const rows = CHASSIS_PARTS.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        const cap = c.isAsicRack ? 'ASIC Rack' : `${c.maxGpus} GPU slots`;
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(formatUsd(c.cost), 8)}  ${padRight(
          cap,
          12
        )}  -${c.coolingBonus}°C  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 1/8 — SELECT CHASSIS' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text: 'Enter chassis number (e.g. "1"), or type "preset 1..4" to quick-load a preset, or "cancel".',
        },
      ]);
      return;
    }

    if (step === 'COMPUTE') {
      const compatible = COMPUTE_PARTS.filter((c) =>
        chassis.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC'
      );
      const incompatible = COMPUTE_PARTS.filter((c) =>
        chassis.isAsicRack ? c.kind !== 'ASIC' : c.kind === 'ASIC'
      );
      const rows = compatible.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 34)} ${padLeft(formatUsd(c.cost), 8)}  ${padLeft(
          `${c.watts}W`,
          6
        )}  ${padRight(hashLabel, 18)}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      const altPreview = incompatible.map((c) => {
        const lock = isPartUnlocked(c.researchRequired);
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        const chassisNeed = chassis.isAsicRack ? 'Needs Non-ASIC Chassis' : 'Needs ASIC Chassis (Step 1)';
        return `   -  ${padRight(c.name, 34)} ${padLeft(formatUsd(c.cost), 8)}  ${padLeft(
          `${c.watts}W`,
          6
        )}  ${padRight(hashLabel, 18)}  [LOCKED: ${lock.ok ? chassisNeed : `${lock.reason} + ${chassisNeed}`}]`;
      });
      append([
        { kind: 'HEAD', text: `RIG BUILDER STEP 2/8 — SELECT COMPUTE (${chassis.name})` },
        {
          kind: 'PRE',
          text: [
            ...rows,
            '',
            chassis.isAsicRack
              ? '  OTHER COMPUTE (CPU/FPGA — Not mountable in ASIC Blade Chassis):'
              : '  ASIC BLADES (Require 42U/Hydro ASIC Chassis in Step 1):',
            ...altPreview,
          ].join('\n'),
        },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter compatible compute number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'GPU') {
      const rows = GPU_PARTS.map((g, idx) => {
        const lock = isPartUnlocked(g.researchRequired);
        const eth = g.hashrates.ETHASH
          ? `ETH ${g.hashrates.ETHASH}MH`
          : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(formatUsd(g.cost), 8)}  ${padLeft(
          `${g.watts}W`,
          5
        )}  ${padRight(eth, 13)}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `RIG BUILDER STEP 3/8 — ADD GPUs (${config.gpuIds.length}/${chassis.maxGpus} installed)`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text: 'Type GPU number to add 1 card (or "1 x3" to add 3), "clear", "done" (or "0") to continue, or "back".',
        },
      ]);
      return;
    }

    if (step === 'STORAGE') {
      const rows = STORAGE_PARTS.map((s, idx) => {
        const lock = isPartUnlocked(s.researchRequired);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(s.name, 33)} ${padLeft(formatUsd(s.cost), 8)}  +${Math.round(
          s.efficiencyBonus * 100
        )}% eff  ${padRight(s.storageTb >= 1 ? `${s.storageTb}TB` : `${s.ramGb}GB RAM`, 8)}  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 4/8 — SELECT RAM & STORAGE' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter storage number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'PSU') {
      const t = computeRigTelemetry(config, facility, state.unlockedResearch, sysBonus);
      const rows = PSU_PARTS.map((p, idx) => {
        const lock = isPartUnlocked(p.researchRequired);
        const fit = t.rawWatts <= p.maxWatts ? 'FITS' : 'UNDERPOWERED';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(p.name, 31)} ${padLeft(formatUsd(p.cost), 8)}  ${padLeft(
          `${p.maxWatts}W`,
          6
        )}  ${Math.round(p.efficiency * 100)}% eff  [${padRight(fit, 12)}]  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        {
          kind: 'HEAD',
          text: `RIG BUILDER STEP 5/8 — SELECT PSU (Current component load: ${t.rawWatts}W)`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter PSU number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'COOLING') {
      const rows = COOLING_PARTS.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 32)} ${padLeft(formatUsd(c.cost), 8)}  -${padLeft(
          String(c.coolingPowerC),
          3
        )}°C  ${padLeft(`${c.noiseDba}dBA`, 5)}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 6/8 — SELECT COOLING SYSTEM' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter cooling number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'OS') {
      const rows = OS_PARTS.map((o, idx) => {
        const lock = isPartUnlocked(o.researchRequired);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(o.name, 30)} ${padLeft(formatUsd(o.cost), 8)}  x${o.hashrateMultiplier.toFixed(
          2
        )} hash  x${o.powerMultiplier.toFixed(2)} pwr  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 7/8 — SELECT OS KERNEL' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter OS number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'COIN') {
      const allCoins = Object.keys(state.coins) as CoinSymbol[];
      const t = computeRigTelemetry(config, facility, state.unlockedResearch, sysBonus);
      const autoSellMult = getAutoSellMultiplier(state);
      const rows = allCoins.map((sym, idx) => {
        const c = state.coins[sym];
        const algoHash = t.baseHashrateByAlgo[c.algorithm];
        const est = computeStepCoinOutput(
          algoHash,
          { ...c, unlocked: true },
          1,
          autoSellMult,
          config.poolMode ?? 'PPS',
          true
        );
        const lockLabel = c.unlocked
          ? '[OK]'
          : `[LOCKED: Unlock ${formatUsd(c.unlockCostUsd)} via "unlock ${sym}"]`;
        return `  ${idx + 1}. ${padRight(`${sym} (${c.name})`, 18)} ${padRight(
          c.algorithm,
          8
        )}  Hash: ${padRight(formatHashrate(algoHash, c.algorithm), 11)}  Est: ${padRight(
          formatUsd(est.autoSoldUsd) + '/st',
          12
        )}  ${lockLabel}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 8/8 — SELECT TARGET COIN (AUTO-SELLS EACH STEP)' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text: 'Enter an unlocked coin number or symbol (e.g. "1" or "BTC"), or "back".',
        },
      ]);
      return;
    }

    // CONFIRM
    const totalCost = calculateRigBuildCost(config);
    const activeCount = state.rigs.filter((r) => r.enabled).length + 1;
    const t = computeRigTelemetry(
      config,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      activeCount
    );
    const compute = COMPUTE_PARTS.find((c) => c.id === config.computeId)!;
    const storage = STORAGE_PARTS.find((s) => s.id === config.storageId)!;
    const psu = PSU_PARTS.find((p) => p.id === config.psuId)!;
    const cooling = COOLING_PARTS.find((c) => c.id === config.coolingId)!;
    const os = OS_PARTS.find((o) => o.id === config.osId)!;
    const coin = state.coins[config.targetCoin];
    const autoSellMult = getAutoSellMultiplier(state);
    const est = computeStepCoinOutput(
      t.effectiveHashrate,
      coin,
      1,
      autoSellMult,
      config.poolMode ?? 'PPS',
      true
    );

    const warnings: string[] = [];
    if (state.cash < totalCost) warnings.push(`Insufficient cash (need ${formatUsd(totalCost)})`);
    if (state.rigs.length >= facility.maxRigs) warnings.push(`Facility full (${facility.maxRigs} max rigs)`);
    if (t.isUnderpowered) warnings.push(`PSU overloaded (${t.rawWatts}W > ${psu.maxWatts}W)`);
    if (!coin.unlocked) warnings.push(`${coin.symbol} is locked (unlock it for ${formatUsd(coin.unlockCostUsd)})`);
    if (t.effectiveHashrate <= 0) warnings.push(`Zero hashrate for ${config.targetCoin} (${t.targetAlgo})`);

    const spec = [
      `+---------------- BUILD SPECIFICATION ----------------+`,
      `| Name:    ${padRight(config.name, 42)} |`,
      `| Chassis: ${padRight(chassis.name, 42)} |`,
      `| Compute: ${padRight(compute.name, 42)} |`,
      `| GPUs:    ${padRight(`${config.gpuIds.length}x installed`, 42)} |`,
      `| Storage: ${padRight(storage.name, 42)} |`,
      `| PSU:     ${padRight(`${psu.name} (${t.wallWatts}W wall / ${psu.maxWatts}W cap)`, 42)} |`,
      `| Cooling: ${padRight(`${cooling.name} (Est ${t.equilibriumTempC}°C / ${t.noiseDba}dBA)`, 42)} |`,
      `| Tune:    ${padRight(`${config.poolMode ?? 'PPS'} · ${config.firmwareProfile ?? 'BALANCED'} · OC ${config.overclockPct}%`, 42)} |`,
      `| OS/Coin: ${padRight(`${os.name} -> ${config.targetCoin} (${formatHashrate(t.effectiveHashrate, t.targetAlgo)})`, 42)} |`,
      `| Cost:    ${padRight(`${formatUsd(totalCost)} | Auto-Sell: ${formatUsd(est.autoSoldUsd)}/step`, 42)} |`,
      `+-----------------------------------------------------+`,
    ].join('\n');

    append([
      { kind: 'PRE', text: spec },
      ...(warnings.length > 0
        ? warnings.map((w) => ({ kind: 'ERR' as const, text: `WARNING: ${w}` }))
        : [{ kind: 'OK' as const, text: 'Build validated. Ready to deploy!' }]),
      ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
      {
        kind: 'TEXT',
        text: 'Type "deploy", "oc <80..150>", "pool <pps|pplns|solo>", "profile <eco|balanced|turbo>", "back", or "cancel".',
      },
    ]);
  };

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    state.news.forEach((n) => seenNewsIdsRef.current.add(n.id));
    append([
      {
        kind: 'HEAD',
        text: `BLOCKWORKS TYCOON // MATRIX TERMINAL (SEED: ${state.runSeed})`,
      },
      {
        kind: 'TEXT',
        text: 'Open-ended step simulation: tune rigs ("rig 1 pool solo", "rig 1 profile turbo"), chase "contracts" & "rivals", or go covert with "ops" & "blackmarket". Type "help" or "tutorial" anytime.',
      },
    ]);
    printStatus();
    if (state.tutorialStep && state.tutorialStep > 0) {
      lastTutorialStepRef.current = state.tutorialStep;
      printTutorialStep(state.tutorialStep);
    } else {
      lastTutorialStepRef.current = 0;
    }
    if (state.pendingEvent) {
      seenEventIdRef.current = state.pendingEvent.id;
      printPendingEvent(state.pendingEvent);
    }
  }, []);

  useEffect(() => {
    const stepVal = state.tutorialStep ?? 0;
    if (lastTutorialStepRef.current === null) {
      lastTutorialStepRef.current = stepVal;
      return;
    }
    if (stepVal !== lastTutorialStepRef.current) {
      lastTutorialStepRef.current = stepVal;
      if (stepVal > 0) {
        printTutorialStep(stepVal);
      }
    }
  }, [state.tutorialStep]);

  useEffect(() => {
    const fresh = state.news.filter((n) => !seenNewsIdsRef.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seenNewsIdsRef.current.add(n.id));
    append(
      [...fresh].reverse().map((n) => ({
        kind:
          n.category === 'ALERT'
            ? ('ERR' as const)
            : n.category === 'MILESTONE' || n.category === 'CONTRACT'
            ? ('HEAD' as const)
            : n.category === 'UNDERGROUND'
            ? ('WARN' as const)
            : ('OK' as const),
        text: `[${n.stepLabel}] ${n.category}: ${n.title} — ${n.detail}`,
      }))
    );
  }, [state.news]);

  useEffect(() => {
    if (state.pendingEvent && state.pendingEvent.id !== seenEventIdRef.current) {
      seenEventIdRef.current = state.pendingEvent.id;
      printPendingEvent(state.pendingEvent);
    } else if (!state.pendingEvent) {
      seenEventIdRef.current = null;
    }
  }, [state.pendingEvent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (!commandTrigger) return;
    executeCommand(commandTrigger.command);
    inputRef.current?.focus();
  }, [commandTrigger]);

  const handleWizardInput = (raw: string, wiz: BuildWizardState) => {
    const trimmed = raw.trim();
    const low = trimmed.toLowerCase();
    const parts = low.split(/\s+/);

    if (low === 'cancel' || low === 'exit' || low === 'quit') {
      setWizard(null);
      append([{ kind: 'WARN', text: 'Rig assembly wizard cancelled.' }]);
      return;
    }

    if (parts[0] === 'preset') {
      const idx = parseInt(parts[1] || '1', 10) - 1;
      const preset = RIG_PRESETS[idx];
      if (!preset) {
        append([{ kind: 'ERR', text: 'Usage: preset <1..4>' }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'CONFIRM',
        config: {
          ...preset.config,
          name: `${preset.label} #${state.rigs.length + 1}`,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    const chassis = CHASSIS_PARTS.find((c) => c.id === wiz.config.chassisId) ?? CHASSIS_PARTS[0];

    if (low === 'back') {
      const order: BuildStep[] = ['CHASSIS', 'COMPUTE', 'GPU', 'STORAGE', 'PSU', 'COOLING', 'OS', 'COIN', 'CONFIRM'];
      let prevIdx = Math.max(0, order.indexOf(wiz.step) - 1);
      if (order[prevIdx] === 'GPU' && chassis.maxGpus === 0) prevIdx--;
      const nextWiz: BuildWizardState = { ...wiz, step: order[prevIdx] };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'CHASSIS') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = CHASSIS_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${CHASSIS_PARTS.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}). Pick an unlocked chassis.` }]);
        return;
      }
      const firstCompute = COMPUTE_PARTS.find(
        (c) =>
          (picked.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC') &&
          isPartUnlocked(c.researchRequired).ok
      );
      const nextWiz: BuildWizardState = {
        step: 'COMPUTE',
        config: {
          ...wiz.config,
          chassisId: picked.id,
          gpuIds: [],
          computeId: firstCompute?.id ?? wiz.config.computeId,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COMPUTE') {
      const options = COMPUTE_PARTS.filter((c) =>
        chassis.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC'
      );
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: chassis.maxGpus > 0 ? 'GPU' : 'STORAGE',
        config: { ...wiz.config, computeId: picked.id },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'GPU') {
      if (low === 'clear') {
        const nextWiz: BuildWizardState = { ...wiz, config: { ...wiz.config, gpuIds: [] } };
        setWizard(nextWiz);
        printWizardPrompt(nextWiz);
        return;
      }
      if (low === 'done' || low === 'next' || low === '0') {
        const nextWiz: BuildWizardState = { ...wiz, step: 'STORAGE' };
        setWizard(nextWiz);
        printWizardPrompt(nextWiz);
        return;
      }
      const idx = parseInt(parts[0], 10) - 1;
      const picked = GPU_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: 'Enter GPU number (e.g. "1" or "1 x3"), "clear", or "done".' }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const qtyMatch = parts[1]?.match(/^x?(\d+)$/);
      const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
      const slotsLeft = chassis.maxGpus - wiz.config.gpuIds.length;
      if (slotsLeft <= 0) {
        append([{ kind: 'WARN', text: 'Chassis GPU slots are full. Type "done" to continue.' }]);
        return;
      }
      const toAdd = Math.min(slotsLeft, qty);
      const nextGpus = [...wiz.config.gpuIds, ...Array(toAdd).fill(picked.id)];
      const nextWiz: BuildWizardState = {
        step: nextGpus.length >= chassis.maxGpus ? 'STORAGE' : 'GPU',
        config: { ...wiz.config, gpuIds: nextGpus },
      };
      setWizard(nextWiz);
      append([{ kind: 'OK', text: `Added ${toAdd}x ${picked.name}.` }]);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'STORAGE') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = STORAGE_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${STORAGE_PARTS.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'PSU',
        config: { ...wiz.config, storageId: picked.id },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'PSU') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = PSU_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${PSU_PARTS.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'COOLING',
        config: { ...wiz.config, psuId: picked.id },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COOLING') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = COOLING_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${COOLING_PARTS.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'OS',
        config: { ...wiz.config, coolingId: picked.id },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'OS') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = OS_PARTS[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${OS_PARTS.length}.` }]);
        return;
      }
      const lock = isPartUnlocked(picked.researchRequired);
      if (!lock.ok) {
        append([{ kind: 'ERR', text: `Locked (${lock.reason}).` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'COIN',
        config: { ...wiz.config, osId: picked.id },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COIN') {
      const allCoins = Object.keys(state.coins) as CoinSymbol[];
      const asNum = parseInt(parts[0], 10);
      const picked =
        !isNaN(asNum) && allCoins[asNum - 1]
          ? allCoins[asNum - 1]
          : allCoins.find((s) => s.toLowerCase() === parts[0]);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a coin number (1..${allCoins.length}) or symbol (e.g. BTC).` }]);
        return;
      }
      if (!state.coins[picked].unlocked) {
        append([
          {
            kind: 'ERR',
            text: `${picked} is locked (unlock it for ${formatUsd(
              state.coins[picked].unlockCostUsd
            )} via "unlock ${picked}"). Pick an unlocked coin.`,
          },
        ]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'CONFIRM',
        config: { ...wiz.config, targetCoin: picked },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'CONFIRM') {
      if (parts[0] === 'oc' || parts[0] === 'overclock') {
        const ocVal = Math.max(80, Math.min(150, parseInt(parts[1] || '100', 10) || 100));
        const nextWiz: BuildWizardState = {
          ...wiz,
          config: { ...wiz.config, overclockPct: ocVal },
        };
        setWizard(nextWiz);
        printWizardPrompt(nextWiz);
        return;
      }
      if (parts[0] === 'pool') {
        const p = (parts[1] || '').toUpperCase() as PoolMode;
        if (!POOL_MODE_SPECS[p]) {
          append([{ kind: 'ERR', text: 'Usage: pool <pps|pplns|solo>' }]);
          return;
        }
        const nextWiz: BuildWizardState = { ...wiz, config: { ...wiz.config, poolMode: p } };
        setWizard(nextWiz);
        printWizardPrompt(nextWiz);
        return;
      }
      if (parts[0] === 'profile') {
        const prof = (parts[1] || '').toUpperCase() as FirmwareProfile;
        if (!FIRMWARE_PROFILE_SPECS[prof]) {
          append([{ kind: 'ERR', text: 'Usage: profile <eco|balanced|turbo>' }]);
          return;
        }
        const nextWiz: BuildWizardState = {
          ...wiz,
          config: { ...wiz.config, firmwareProfile: prof },
        };
        setWizard(nextWiz);
        printWizardPrompt(nextWiz);
        return;
      }
      if (low === 'deploy' || low === 'confirm' || low === 'yes' || low === 'y') {
        const ok = onDeployRig(wiz.config);
        if (ok) {
          setWizard(null);
          append([{ kind: 'OK', text: `Deployed "${wiz.config.name}" to facility.` }]);
          if (state.tutorialStep && state.tutorialStep >= 1 && state.tutorialStep <= 4) {
            onSetTutorialStep(5);
          }
        } else {
          append([{ kind: 'ERR', text: 'Deployment failed: check cash, facility rig cap, or PSU limit.' }]);
        }
        return;
      }
      append([{ kind: 'ERR', text: 'Type "deploy", "oc <80..150>", "pool <...>", "profile <...>", "back", or "cancel".' }]);
    }
  };

  const printTinkerPrompt = (tk: TinkerState) => {
    const rig = state.rigs[tk.rigIndex];
    if (!rig) {
      setTinker(null);
      return;
    }
    const facility = getFacility(state.facilityId);
    const sysBonus = getSysEngineerBonus(state);
    const enabledCount = state.rigs.filter((r) => r.enabled).length;
    const t = computeRigTelemetry(
      rig,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      enabledCount
    );
    const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
    const comp = COMPUTE_PARTS.find((c) => c.id === rig.computeId) ?? COMPUTE_PARTS[0];
    const stor = STORAGE_PARTS.find((s) => s.id === rig.storageId) ?? STORAGE_PARTS[0];
    const psu = PSU_PARTS.find((p) => p.id === rig.psuId) ?? PSU_PARTS[0];
    const cool = COOLING_PARTS.find((c) => c.id === rig.coolingId) ?? COOLING_PARTS[0];
    const os = OS_PARTS.find((o) => o.id === rig.osId) ?? OS_PARTS[0];

    if (tk.slot === 'MENU') {
      const sheet = [
        `  1. chassis  -> ${padRight(ch.name, 33)} (${formatUsd(ch.cost)})`,
        `  2. compute  -> ${padRight(comp.name, 33)} (${formatUsd(comp.cost)})`,
        `  3. gpu      -> ${padRight(`${rig.gpuIds.length}/${ch.maxGpus} GPUs installed`, 33)}`,
        `  4. storage  -> ${padRight(stor.name, 33)} (${formatUsd(stor.cost)})`,
        `  5. psu      -> ${padRight(`${psu.name} (${t.rawWatts}/${psu.maxWatts}W)`, 33)}`,
        `  6. cooling  -> ${padRight(`${cool.name} (Eq ${t.equilibriumTempC}°C)`, 33)}`,
        `  7. os       -> ${padRight(os.name, 33)} (${formatUsd(os.cost)})`,
      ].join('\n');
      append([
        {
          kind: 'HEAD',
          text: `WORKBENCH // TINKERING [R${tk.rigIndex + 1}] ${rig.name} · ${formatHashrate(
            t.effectiveHashrate,
            t.targetAlgo
          )} · ${t.wallWatts}W · Eq ${t.equilibriumTempC}°C`,
        },
        { kind: 'PRE', text: sheet },
        {
          kind: 'TEXT',
          text: 'Enter slot name or # (e.g. "gpu", "compute", "cooling"), "inspect", or "done" to exit workbench. (Old parts get 60% trade-in.)',
        },
      ]);
      return;
    }

    const fmtNet = (oldCost: number, newCost: number) => {
      const net = calculatePartTradeInCost(oldCost, newCost);
      return net >= 0 ? `Net +${formatUsd(net)}` : `Refund ${formatUsd(Math.abs(net))}`;
    };

    if (tk.slot === 'chassis') {
      const rows = CHASSIS_PARTS.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        const cur = c.id === rig.chassisId ? ' *INSTALLED*' : fmtNet(ch.cost, c.cost);
        const cap = c.isAsicRack ? 'ASIC Rack' : `${c.maxGpus} GPUs`;
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(formatUsd(c.cost), 7)}  ${padRight(
          cap,
          9
        )}  -${c.coolingBonus}°C  ${padRight(cur, 13)}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP CHASSIS (60% trade-in)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter chassis #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'compute') {
      const compatible = COMPUTE_PARTS.filter((c) =>
        ch.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC'
      );
      const rows = compatible.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        const cur = c.id === rig.computeId ? ' *INSTALLED*' : fmtNet(comp.cost, c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 33)} ${padLeft(
          formatUsd(c.cost),
          7
        )}  ${padLeft(`${c.watts}W`, 5)}  ${padRight(hashLabel, 17)}  ${padRight(cur, 13)}  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP COMPUTE (${ch.name})` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter compute #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'gpu') {
      const installed =
        rig.gpuIds.length === 0
          ? '  (no GPUs installed)'
          : rig.gpuIds
              .map((gid, sIdx) => {
                const g = GPU_PARTS.find((x) => x.id === gid);
                return `  [Slot ${sIdx + 1}] ${g?.name ?? gid} (Trade-in value: ${formatUsd(
                  Math.round((g?.cost ?? 0) * 0.6)
                )})`;
              })
              .join('\n');
      const catalogRows = GPU_PARTS.map((g, idx) => {
        const lock = isPartUnlocked(g.researchRequired);
        const eth = g.hashrates.ETHASH
          ? `ETH ${g.hashrates.ETHASH}MH`
          : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(
          formatUsd(g.cost),
          7
        )}  ${padLeft(`${g.watts}W`, 5)}  ${padRight(eth, 12)}  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      }).join('\n');
      append([
        {
          kind: 'HEAD',
          text: `TINKER R${tk.rigIndex + 1} · GPUs (${rig.gpuIds.length}/${ch.maxGpus} slots used)`,
        },
        { kind: 'PRE', text: `INSTALLED:\n${installed}\n\nADD GPU:\n${catalogRows}` },
        {
          kind: 'TEXT',
          text: 'Type "<#> [xN]" or "add <#> [N]" to install, "remove <slot#>" / "clear" for 60% refund, "back", or "done".',
        },
      ]);
      return;
    }

    if (tk.slot === 'storage') {
      const rows = STORAGE_PARTS.map((s, idx) => {
        const lock = isPartUnlocked(s.researchRequired);
        const cur = s.id === rig.storageId ? ' *INSTALLED*' : fmtNet(stor.cost, s.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(s.name, 33)} ${padLeft(
          formatUsd(s.cost),
          7
        )}  +${Math.round(s.efficiencyBonus * 100)}% eff  ${padRight(cur, 13)}  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP STORAGE / RAM` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter storage #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'psu') {
      const rows = PSU_PARTS.map((p, idx) => {
        const lock = isPartUnlocked(p.researchRequired);
        const cur = p.id === rig.psuId ? ' *INSTALLED*' : fmtNet(psu.cost, p.cost);
        const fit = t.rawWatts <= p.maxWatts ? 'FITS' : 'OVERLOAD';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(p.name, 31)} ${padLeft(
          formatUsd(p.cost),
          7
        )}  ${padLeft(`${p.maxWatts}W`, 6)}  [${padRight(fit, 8)}]  ${padRight(cur, 13)}  ${
          lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`
        }`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP PSU (Load: ${t.rawWatts}W)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter PSU #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'cooling') {
      const rows = COOLING_PARTS.map((c, idx) => {
        const lock = isPartUnlocked(c.researchRequired);
        const cur = c.id === rig.coolingId ? ' *INSTALLED*' : fmtNet(cool.cost, c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 32)} ${padLeft(
          formatUsd(c.cost),
          7
        )}  -${padLeft(String(c.coolingPowerC), 3)}°C  ${padLeft(
          `${c.noiseDba}dBA`,
          5
        )}  ${padRight(cur, 13)}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP COOLING` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter cooling #, "back", or "done".' },
      ]);
      return;
    }

    // OS
    const rows = OS_PARTS.map((o, idx) => {
      const lock = isPartUnlocked(o.researchRequired);
      const cur = o.id === rig.osId ? ' *INSTALLED*' : fmtNet(os.cost, o.cost);
      return `  ${padLeft(String(idx + 1), 2)}. ${padRight(o.name, 30)} ${padLeft(
        formatUsd(o.cost),
        7
      )}  x${o.hashrateMultiplier.toFixed(2)}h  x${o.powerMultiplier.toFixed(2)}p  ${padRight(
        cur,
        13
      )}  ${lock.ok ? '[OK]' : `[LOCKED: ${lock.reason}]`}`;
    });
    append([
      { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · FLASH OS KERNEL` },
      { kind: 'PRE', text: rows.join('\n') },
      { kind: 'TEXT', text: 'Enter OS #, "back", or "done".' },
    ]);
  };

  const handleTinkerInput = (raw: string, tk: TinkerState) => {
    const trimmed = raw.trim();
    const low = trimmed.toLowerCase();
    const parts = low.split(/\s+/);
    const rig = state.rigs[tk.rigIndex];
    if (!rig) {
      setTinker(null);
      append([{ kind: 'ERR', text: 'Target rig no longer exists. Exited workbench.' }]);
      return;
    }

    if (low === 'done' || low === 'exit' || low === 'quit' || low === 'cancel') {
      setTinker(null);
      append([{ kind: 'OK', text: `Closed workbench for ${rig.name}.` }]);
      return;
    }

    if (low === 'back' || low === 'menu') {
      const nextTk: TinkerState = { ...tk, slot: 'MENU' };
      setTinker(nextTk);
      printTinkerPrompt(nextTk);
      return;
    }

    if (low === 'inspect' || low === 'status') {
      const nextTk: TinkerState = { ...tk, slot: 'MENU' };
      printTinkerPrompt(nextTk);
      return;
    }

    const slotMap: Record<string, TinkerSlot> = {
      '1': 'chassis',
      chassis: 'chassis',
      case: 'chassis',
      '2': 'compute',
      compute: 'compute',
      cpu: 'compute',
      asic: 'compute',
      fpga: 'compute',
      '3': 'gpu',
      gpu: 'gpu',
      gpus: 'gpu',
      '4': 'storage',
      storage: 'storage',
      ram: 'storage',
      '5': 'psu',
      psu: 'psu',
      power: 'psu',
      '6': 'cooling',
      cooling: 'cooling',
      cool: 'cooling',
      '7': 'os',
      os: 'os',
    };

    if (tk.slot === 'MENU') {
      const targetSlot = slotMap[parts[0]];
      if (!targetSlot) {
        append([
          {
            kind: 'ERR',
            text: 'Pick a slot (chassis, compute, gpu, storage, psu, cooling, os), "inspect", or "done".',
          },
        ]);
        return;
      }
      const nextTk: TinkerState = { ...tk, slot: targetSlot };
      setTinker(nextTk);
      printTinkerPrompt(nextTk);
      return;
    }

    if (tk.slot === 'gpu') {
      if (parts[0] === 'clear') {
        const res = onTinkerGpu(tk.rigIndex, 'CLEAR');
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (parts[0] === 'remove' || parts[0] === 'rm' || parts[0] === 'sell') {
        const slotIdx = (parseInt(parts[1] || '1', 10) || 1) - 1;
        const res = onTinkerGpu(tk.rigIndex, 'REMOVE', slotIdx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      const rawIdx = parts[0] === 'add' ? parts[1] : parts[0];
      const rawQty = parts[0] === 'add' ? parts[2] : parts[1];
      const gpuIdx = parseInt(rawIdx || '', 10) - 1;
      const pickedGpu = GPU_PARTS[gpuIdx];
      if (!pickedGpu) {
        append([
          {
            kind: 'ERR',
            text: 'Usage: <gpu#> [xN], "add <gpu#> [N]", "remove <slot#>", "clear", or "back".',
          },
        ]);
        return;
      }
      const qtyMatch = rawQty?.match(/^x?(\d+)$/);
      const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
      const res = onTinkerGpu(tk.rigIndex, 'ADD', pickedGpu.id, qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return;
    }

    // Standard single-part slot swap
    const idx = parseInt(parts[0], 10) - 1;
    let pickedPartId: string | null = null;
    if (tk.slot === 'chassis') pickedPartId = CHASSIS_PARTS[idx]?.id ?? null;
    else if (tk.slot === 'compute') {
      const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
      const compat = COMPUTE_PARTS.filter((c) => (ch.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC'));
      pickedPartId = compat[idx]?.id ?? null;
    } else if (tk.slot === 'storage') pickedPartId = STORAGE_PARTS[idx]?.id ?? null;
    else if (tk.slot === 'psu') pickedPartId = PSU_PARTS[idx]?.id ?? null;
    else if (tk.slot === 'cooling') pickedPartId = COOLING_PARTS[idx]?.id ?? null;
    else if (tk.slot === 'os') pickedPartId = OS_PARTS[idx]?.id ?? null;

    if (!pickedPartId) {
      append([{ kind: 'ERR', text: 'Enter a valid part #, "back", or "done".' }]);
      return;
    }
    const res = onTinkerPart(tk.rigIndex, tk.slot, pickedPartId);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    if (res.ok) {
      const backMenu: TinkerState = { ...tk, slot: 'MENU' };
      setTinker(backMenu);
    }
  };

  const executeCommand = (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    setHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
    setHistoryIdx(-1);
    const promptPrefix = state.pendingEvent
      ? 'event(decision)>'
      : wizard
      ? `build(${wizard.step.toLowerCase()})>`
      : tinker
      ? `tinker(R${tinker.rigIndex + 1}${tinker.slot === 'MENU' ? '' : `:${tinker.slot}`})>`
      : 'miner@blockworks:~$';
    append([{ kind: 'CMD', text: `${promptPrefix} ${trimmed}` }]);

    if (wizard) {
      handleWizardInput(trimmed, wizard);
      return;
    }

    if (tinker) {
      handleTinkerInput(trimmed, tinker);
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg1 = parts[1]?.toLowerCase() ?? '';
    const arg2 = parts[2]?.toLowerCase() ?? '';
    const arg3 = parts[3]?.toLowerCase() ?? '';

    // Pending Event Decision Shortcut (1 | 2 | 3 or decide <n>)
    if (state.pendingEvent && (cmd === '1' || cmd === '2' || cmd === '3' || cmd === 'decide')) {
      const choiceKey = cmd === 'decide' ? arg1 : cmd;
      const res = onResolveEvent(choiceKey);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return;
    }

    if (cmd === 'event') {
      if (!state.pendingEvent) {
        append([{ kind: 'TEXT', text: 'No pending crisis or event right now. Step forward with "step".' }]);
      } else {
        printPendingEvent(state.pendingEvent);
      }
      return;
    }

    const facility = getFacility(state.facilityId);
    const coinSymbols = Object.keys(state.coins) as CoinSymbol[];

    if (cmd === 'clear' || cmd === 'cls') {
      setLines([]);
      return;
    }

    if (cmd === 'help' || cmd === '?') {
      append([
        { kind: 'HEAD', text: 'COMMAND REFERENCE MANUAL' },
        {
          kind: 'PRE',
          text: [
            `  STEPS, EVENTS & STATUS`,
            `    status | look                     Show facility map, regime, heat & fleet stats`,
            `    tutorial [next|skip|restart]      Walk through what stats mean & build your first rig`,
            `    step [n] | next [n]               Advance n steps (pauses if interactive event hits)`,
            `    event | decide <1|2|3>            View active crisis prompt or lock in choice`,
            `    log                               Show recent market, raid, contract & system logs`,
            `  HARDWARE, OVERCLOCK, TINKER & REPAIRS`,
            `    build rig | presets | build preset <1..4>   Assemble rig (shows all locked & unlocked parts)`,
            `    tinker [<#>] [<slot> <part#>]     Open workbench to swap rig parts (60% trade-in credit)`,
            `    overclock [<#|all>] <80..150>     Boost mining speed at steeper heat, power & wear cost`,
            `    rigs | inspect <#>                Roster or hardware telemetry sheet`,
            `    rig <#|all> <on|off|oc N|coin X>  Toggle, overclock (80..150), or assign coin`,
            `    rig <#|all> pool <pps|pplns|solo> Set pool payout strategy (steady vs solo block jackpot)`,
            `    rig <#|all> profile <eco|balanced|turbo>  Adjust voltage, watts, heat & wear`,
            `    repair [<#>|all] | repaste [<#>|all]      Restore rig health or refresh thermal paste`,
            `    rename <#> <name> | salvage <#>   Rename or dismantle rig for 55% refund`,
            `  COINS, REGIMES, RIVALS & CONTRACTS`,
            `    market | coins | unlock <COIN>    View market regime, halvings, difficulty & unlock tiers`,
            `    chart <COIN> [30|90|all]          Render monospace ASCII price chart`,
            `    contracts | contract accept <1..3> | contract abandon`,
            `    rivals                            Inspect competing AI syndicates & market share`,
            `    pr | pr launch <1..5> <COIN>      Legal PR campaigns`,
            `  UNDERGROUND & BLACK MARKET (ILLEGAL OPS)`,
            `    ops                               View Heat (0-100), covert toggles & illegal actions`,
            `    ops siphon <on|off>               Bypass power meters (-65% bills, +25% cap, +Heat)`,
            `    ops botnet <COIN>                 Rent zero-watt shadow hash burst (+Heat)`,
            `    ops wash <COIN>                   Dark-pool coin price spike (+Heat, -Credibility)`,
            `    ops sabotage <1..3>               DDoS & disrupt rival syndicate # (+Heat)`,
            `    ops launder | ops bribe           Spend cash to scrub Heat or buy audit immunity`,
            `    blackmarket | blackmarket buy <1..3> [rig#]   Rotating smuggled rigs & illicit BIOS mods`,
            `  COOLING, FACILITIES, STAFF & R&D`,
            `    cool [add <fan|ac|chiller>]       Manage room cooling units`,
            `    facilities | facility <rent|buy> <1..4>`,
            `    staff | hire <tech|eng|res|pr|analyst> | fire <#> | shift <#> <...> | priority <#> <...>`,
            `    research | research start <1..${RESEARCH_NODES.length}> | ledger`,
            `  DEV MODE`,
            `    dev <on|off|panel|event|raid|regime X|halve COIN|heat N|blackmarket|...>`,
          ].join('\n'),
        },
      ]);
      return;
    }

    if (cmd === 'status' || cmd === 'look') {
      printStatus();
      return;
    }

    if (cmd === 'log' || cmd === 'news') {
      append([
        { kind: 'HEAD', text: 'RECENT SYSTEM & MARKET LOG' },
        ...state.news.slice(0, 18).map((n) => ({
          kind: n.category === 'ALERT' ? ('ERR' as const) : n.category === 'UNDERGROUND' ? ('WARN' as const) : ('TEXT' as const),
          text: `[${n.stepLabel}] ${n.category} · ${n.title}: ${n.detail}`,
        })),
      ]);
      return;
    }

    if (cmd === 'tutorial' || cmd === 'guide') {
      const cur = state.tutorialStep ?? 0;
      if (arg1 === 'skip' || arg1 === 'off' || arg1 === 'done' || arg1 === 'exit') {
        lastTutorialStepRef.current = 0;
        onSetTutorialStep(0);
        append([{ kind: 'TEXT', text: 'Tutorial closed. Type "tutorial restart" anytime to replay it.' }]);
        return;
      }
      if (arg1 === 'restart' || arg1 === 'start') {
        lastTutorialStepRef.current = 1;
        onSetTutorialStep(1);
        printTutorialStep(1);
        return;
      }
      if (arg1 === 'next' || arg1 === 'continue') {
        if (cur <= 0) {
          lastTutorialStepRef.current = 1;
          onSetTutorialStep(1);
          printTutorialStep(1);
        } else if (cur >= 5) {
          lastTutorialStepRef.current = 0;
          onSetTutorialStep(0);
          append([{ kind: 'OK', text: 'Tutorial complete! Type "help" for all commands or "tutorial restart" anytime.' }]);
        } else {
          const next = cur + 1;
          lastTutorialStepRef.current = next;
          onSetTutorialStep(next);
          printTutorialStep(next);
        }
        return;
      }
      if (cur <= 0) {
        lastTutorialStepRef.current = 1;
        onSetTutorialStep(1);
        printTutorialStep(1);
      } else {
        printTutorialStep(cur);
      }
      return;
    }

    if (cmd === 'step' || cmd === 'next' || cmd === 'wait') {
      if (state.pendingEvent) {
        append([
          {
            kind: 'WARN',
            text: `Stepping paused: resolve "${state.pendingEvent.title}" first (type 1, 2, or 3).`,
          },
        ]);
        printPendingEvent(state.pendingEvent);
        return;
      }
      const steps = Math.max(1, Math.min(200, parseInt(arg1 || '1', 10) || 1));
      const res = onStepSteps(steps);
      if (res) {
        const billNote =
          res.billsSettledUsd > 0 ? ` | Cycle bills: -${formatUsd(res.billsSettledUsd)}` : '';
        const soloNote = res.soloBlocksHit > 0 ? ` | SOLO JACKPOTS: ${res.soloBlocksHit}!` : '';
        const haltNote = res.haltedByEvent ? ' | PAUSED BY EVENT' : '';
        append([
          {
            kind: res.haltedByEvent ? 'WARN' : 'OK',
            text: `Stepped +${res.stepsRun} -> Step ${res.newStepCount} | Auto-sold: +${formatUsd(
              res.miningCashEarned
            )} | RP: +${res.rpEarned.toFixed(1)}${soloNote}${billNote}${haltNote}`,
          },
        ]);
        if (state.tutorialStep === 5) {
          lastTutorialStepRef.current = 0;
          onSetTutorialStep(0);
          append([
            {
              kind: 'OK',
              text: 'Tutorial complete! Keep scaling with "contracts", "research", "facilities", or "ops". Type "tutorial restart" anytime.',
            },
          ]);
        }
      }
      return;
    }

    if (cmd === 'presets') {
      const rows = RIG_PRESETS.map((p, i) => {
        const ch = CHASSIS_PARTS.find((c) => c.id === p.config.chassisId)!;
        const comp = COMPUTE_PARTS.find((c) => c.id === p.config.computeId)!;
        const ok =
          isPartUnlocked(ch.researchRequired).ok &&
          isPartUnlocked(comp.researchRequired).ok;
        const cost = calculateRigBuildCost({ ...p.config, name: p.label });
        return `  ${i + 1}. ${padRight(p.label, 26)} ${padLeft(formatUsd(cost), 9)}  ${padRight(
          p.config.targetCoin,
          5
        )}  ${ok ? '[UNLOCKED]' : `[LOCKED: R&D]`}`;
      });
      append([
        { kind: 'HEAD', text: 'READY-TO-DEPLOY RIG PRESETS' },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Run "build preset <1..4>" to deploy immediately.' },
      ]);
      return;
    }

    if (cmd === 'build') {
      if (arg1 === 'preset') {
        const idx = parseInt(arg2 || '1', 10) - 1;
        const preset = RIG_PRESETS[idx];
        if (!preset) {
          append([{ kind: 'ERR', text: 'Usage: build preset <1..4>. Run "presets" to list.' }]);
          return;
        }
        const ch = CHASSIS_PARTS.find((c) => c.id === preset.config.chassisId)!;
        const comp = COMPUTE_PARTS.find((c) => c.id === preset.config.computeId)!;
        const chLock = isPartUnlocked(ch.researchRequired);
        const compLock = isPartUnlocked(comp.researchRequired);
        if (!chLock.ok || !compLock.ok) {
          append([{ kind: 'ERR', text: `Preset locked (${!chLock.ok ? chLock.reason : compLock.reason}).` }]);
          return;
        }
        const cfg: RigBuildConfig = {
          ...preset.config,
          targetCoin: state.coins[preset.config.targetCoin]?.unlocked
            ? preset.config.targetCoin
            : 'BTC',
          name: `${preset.label} #${state.rigs.length + 1}`,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
        };
        const ok = onDeployRig(cfg);
        append([
          ok
            ? { kind: 'OK', text: `Built & deployed "${cfg.name}" for ${formatUsd(calculateRigBuildCost(cfg))}.` }
            : { kind: 'ERR', text: 'Deploy failed: insufficient cash or facility rig cap reached.' },
        ]);
        if (ok && state.tutorialStep && state.tutorialStep >= 1 && state.tutorialStep <= 4) {
          onSetTutorialStep(5);
        }
        return;
      }

      if (state.tutorialStep && state.tutorialStep >= 1 && state.tutorialStep <= 3) {
        lastTutorialStepRef.current = 4;
        onSetTutorialStep(4);
        append([
          {
            kind: 'HEAD',
            text: 'TUTORIAL [4/5] — LIVE BUILD GUIDE ACTIVE (Follow the GUIDE tip at each step)',
          },
        ]);
      }

      const initialWiz: BuildWizardState = {
        step: 'CHASSIS',
        config: {
          name: `Mining Rig #${state.rigs.length + 1}`,
          chassisId: 'chassis_bedroom_tower',
          computeId: 'cpu_core2_duo',
          gpuIds: [],
          storageId: 'stor_ddr3_4gb',
          psuId: 'psu_450w',
          coolingId: 'cool_stock_air',
          osId: 'os_windows7',
          targetCoin: 'BTC',
          overclockPct: 100,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
        },
      };
      setWizard(initialWiz);
      printWizardPrompt(initialWiz);
      return;
    }

    if (cmd === 'rigs' || cmd === 'ls') {
      if (state.rigs.length === 0) {
        append([{ kind: 'TEXT', text: 'No rigs deployed. Run "build rig" to assemble one.' }]);
        return;
      }
      const sysBonus = getSysEngineerBonus(state);
      const enabledCount = state.rigs.filter((r) => r.enabled).length;
      const header = `  #  ${padRight('RIG NAME', 21)} ${padRight('STATUS', 11)} ${padRight(
        'COIN/POOL',
        10
      )} ${padRight('PROFILE', 8)} ${padLeft('HLTH', 5)} ${padLeft('TEMP', 5)} ${padLeft(
        'STEP USD',
        11
      )}`;
      const rows = state.rigs.map((rig, i) => {
        const modMark = rig.illicitMod ? '*' : '';
        return `  ${padRight(String(i + 1), 2)} ${padRight(rig.name + modMark, 21)} ${padRight(
          rig.status,
          11
        )} ${padRight(`${rig.targetCoin}/${rig.poolMode}`, 10)} ${padRight(
          rig.firmwareProfile,
          8
        )} ${padLeft(`${Math.round(rig.healthPct)}%`, 5)} ${padLeft(
          `${rig.temperatureC}C`,
          5
        )} ${padLeft(formatUsd(rig.lastStepUsd), 11)}`;
      });
      const avgHealth =
        state.rigs.reduce((s, r) => s + r.healthPct, 0) / Math.max(1, state.rigs.length);
      append([
        {
          kind: 'HEAD',
          text: `FLEET ROSTER (${state.rigs.length}/${facility.maxRigs}) · Avg Health: ${avgHealth.toFixed(
            0
          )}%`,
        },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        {
          kind: 'TEXT',
          text: 'Commands: "rig <#|all> pool <pps|pplns|solo>", "rig <#|all> profile <eco|balanced|turbo>", "overclock", "tinker <#>", "repair all", "inspect <#>". (* = illicit mod)',
        },
      ]);
      if (state.tutorialStep === 1) {
        onSetTutorialStep(2);
      }
      return;
    }

    if (cmd === 'inspect') {
      const idx = parseInt(arg1, 10) - 1;
      const rig = state.rigs[idx];
      if (!rig) {
        append([{ kind: 'ERR', text: 'Usage: inspect <rig#>' }]);
        return;
      }
      const sysBonus = getSysEngineerBonus(state);
      const enabledCount = state.rigs.filter((r) => r.enabled).length;
      const t = computeRigTelemetry(
        rig,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount
      );
      const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId);
      const comp = COMPUTE_PARTS.find((c) => c.id === rig.computeId);
      const stor = STORAGE_PARTS.find((s) => s.id === rig.storageId);
      const psu = PSU_PARTS.find((p) => p.id === rig.psuId);
      const cool = COOLING_PARTS.find((c) => c.id === rig.coolingId);
      const os = OS_PARTS.find((o) => o.id === rig.osId);
      const repairCost = getRigRepairCost(rig);
      const repasteCost = getRigRepasteCost(rig);
      const modSpec = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod] : null;
      append([
        { kind: 'HEAD', text: `RIG #${idx + 1} HARDWARE SHEET: ${rig.name}` },
        {
          kind: 'PRE',
          text: [
            `  Status:   ${rig.status} (${rig.enabled ? 'POWER ON' : 'PAUSED'})   Health: ${rig.healthPct}% (Repair: ${formatUsd(repairCost)})`,
            `  Tuning:   Pool ${rig.poolMode} (${POOL_MODE_SPECS[rig.poolMode].feePct}% fee)   Firmware: ${rig.firmwareProfile}   OC: ${rig.overclockPct}%`,
            `  Thermal:  ${rig.temperatureC}°C (Eq: ${t.equilibriumTempC}°C)   Paste: ${rig.pasteStepsRemaining}st left (Repaste: ${formatUsd(repasteCost)})`,
            `  Output:   ${rig.targetCoin} (${t.targetAlgo}) ${formatHashrate(t.effectiveHashrate, t.targetAlgo)}   Wall: ${t.wallWatts}W   Noise: ${t.noiseDba}dBA`,
            `  AutoSell: ${formatCoinAmount(rig.lastStepCoins)} ${rig.targetCoin}/st -> ${formatUsd(rig.lastStepUsd)}/st   Solo Wins: ${rig.soloBlocksWon}   Lifetime: ${formatUsd(rig.totalEarnedUsd)}`,
            `  Illicit:  ${modSpec ? `${modSpec.name} (${modSpec.summary})` : 'None (Stock legal ROM)'}`,
            `  Parts:    ${ch?.name} | ${comp?.name} | ${rig.gpuIds.length}x GPU | ${stor?.name}`,
            `            ${psu?.name} | ${cool?.name} | ${os?.name}`,
          ].join('\n'),
        },
      ]);
      return;
    }

    if (cmd === 'repair' || cmd === 'repaste') {
      const targetArg = !arg1 || arg1 === 'all' ? 'ALL' : parseInt(arg1, 10) - 1;
      if (targetArg !== 'ALL' && (isNaN(targetArg) || !state.rigs[targetArg])) {
        append([{ kind: 'ERR', text: `Usage: ${cmd} [<rig#>|all]` }]);
        return;
      }
      if (cmd === 'repair') {
        const res = onRepairRigs(targetArg);
        append([
          res.ok
            ? { kind: 'OK', text: `Repaired ${res.count} rig(s) to 100% health for ${formatUsd(res.cost)}.` }
            : { kind: 'ERR', text: res.cost > 0 ? `Insufficient cash (need ${formatUsd(res.cost)}).` : 'Rigs already at 100% health.' },
        ]);
      } else {
        const res = onRepasteRigs(targetArg);
        append([
          res.ok
            ? { kind: 'OK', text: `Repasted ${res.count} rig(s) (-6°C thermal relief for 16 steps) for ${formatUsd(res.cost)}.` }
            : { kind: 'ERR', text: `Insufficient cash (need ${formatUsd(res.cost)}).` },
        ]);
      }
      return;
    }

    if (cmd === 'rig') {
      const isAll = arg1 === 'all';
      const idx = parseInt(arg1, 10) - 1;
      const target = isAll ? state.rigs[0] : state.rigs[idx];
      if (!target) {
        append([{ kind: 'ERR', text: `Rig #${arg1 || '?'} not found. Run "rigs".` }]);
        return;
      }
      if (arg2 === 'pool') {
        const mode = arg3.toUpperCase() as PoolMode;
        if (!POOL_MODE_SPECS[mode]) {
          append([{ kind: 'ERR', text: 'Usage: rig <#|all> pool <pps|pplns|solo>' }]);
          return;
        }
        onSetRigPool(isAll ? 'ALL' : idx, mode);
        append([
          {
            kind: 'OK',
            text: `${isAll ? 'All rigs' : target.name} switched to ${mode} (${POOL_MODE_SPECS[mode].summary})`,
          },
        ]);
        return;
      }
      if (arg2 === 'profile') {
        const prof = arg3.toUpperCase() as FirmwareProfile;
        if (!FIRMWARE_PROFILE_SPECS[prof]) {
          append([{ kind: 'ERR', text: 'Usage: rig <#|all> profile <eco|balanced|turbo>' }]);
          return;
        }
        onSetRigProfile(isAll ? 'ALL' : idx, prof);
        append([
          {
            kind: 'OK',
            text: `${isAll ? 'All rigs' : target.name} firmware set to ${prof} (${FIRMWARE_PROFILE_SPECS[prof].summary})`,
          },
        ]);
        return;
      }
      if (isAll) {
        append([{ kind: 'ERR', text: 'Use "rig all pool <...>" or "rig all profile <...>".' }]);
        return;
      }
      if (arg2 === 'on' || arg2 === 'off') {
        const want = arg2 === 'on';
        if (target.enabled !== want) onToggleRig(target.id);
        append([{ kind: 'OK', text: `${target.name} turned ${want ? 'ON' : 'OFF'}.` }]);
        return;
      }
      if (arg2 === 'oc' || arg2 === 'overclock') {
        const parsed = parseInt(arg3, 10);
        if (isNaN(parsed)) {
          append([{ kind: 'ERR', text: 'Usage: rig <#> oc <80..150>' }]);
          return;
        }
        const val = Math.max(80, Math.min(150, parsed));
        onChangeRigOverclock(target.id, val);
        append([{ kind: 'OK', text: `${target.name} overclock set to ${val}% (watch temps & wattage).` }]);
        return;
      }
      if (arg2 === 'coin') {
        const sym = arg3.toUpperCase() as CoinSymbol;
        const c = state.coins[sym];
        if (!c) {
          append([{ kind: 'ERR', text: `Unknown coin "${arg3}".` }]);
          return;
        }
        if (!c.unlocked) {
          append([
            {
              kind: 'ERR',
              text: `${sym} is locked. Run "unlock ${sym}" (${formatUsd(c.unlockCostUsd)}) first.`,
            },
          ]);
          return;
        }
        onChangeRigCoin(target.id, sym);
        append([{ kind: 'OK', text: `${target.name} assigned to mine & auto-sell ${sym}.` }]);
        return;
      }
      append([
        {
          kind: 'ERR',
          text: 'Usage: rig <#|all> <on|off|oc N|coin SYM|pool pps/pplns/solo|profile eco/balanced/turbo>',
        },
      ]);
      return;
    }

    if (cmd === 'rename') {
      const idx = parseInt(arg1, 10) - 1;
      const target = state.rigs[idx];
      const newName = parts.slice(2).join(' ').trim();
      if (!target || !newName) {
        append([{ kind: 'ERR', text: 'Usage: rename <rig#> <new name>' }]);
        return;
      }
      onRenameRig(target.id, newName);
      append([{ kind: 'OK', text: `Renamed rig #${idx + 1} to "${newName}".` }]);
      return;
    }

    if (cmd === 'salvage') {
      const idx = parseInt(arg1, 10) - 1;
      const target = state.rigs[idx];
      if (!target) {
        append([{ kind: 'ERR', text: 'Usage: salvage <rig#>' }]);
        return;
      }
      const refund = Math.round(calculateRigBuildCost(target) * 0.55);
      onSalvageRig(target.id);
      append([{ kind: 'OK', text: `Salvaged ${target.name} for ${formatUsd(refund)}.` }]);
      return;
    }

    if (cmd === 'overclock' || cmd === 'oc') {
      if (state.rigs.length === 0) {
        append([{ kind: 'ERR', text: 'No rigs deployed. Run "build rig" first.' }]);
        return;
      }
      const sysBonus = getSysEngineerBonus(state);
      const enabledCount = state.rigs.filter((r) => r.enabled).length;
      const autoSellMult = getAutoSellMultiplier(state);

      // No arguments -> show current OC & thermal telemetry table
      if (!arg1) {
        const rows = state.rigs.map((rig, i) => {
          const t = computeRigTelemetry(
            rig,
            facility,
            state.unlockedResearch,
            sysBonus,
            state.coolingUnits ?? [],
            enabledCount
          );
          const coin = state.coins[rig.targetCoin];
          const est = computeStepCoinOutput(
            t.effectiveHashrate,
            coin,
            1,
            autoSellMult,
            rig.poolMode,
            true
          );
          return `  [R${i + 1}] ${padRight(rig.name, 22)} OC:${padLeft(
            `${rig.overclockPct}%`,
            5
          )}  ${padRight(formatHashrate(t.effectiveHashrate, t.targetAlgo), 11)}  ${padLeft(
            `${t.wallWatts}W`,
            6
          )}  Eq:${padLeft(`${t.equilibriumTempC}°C`, 4)}  Est:${formatUsd(est.autoSoldUsd)}/st`;
        });
        append([
          { kind: 'HEAD', text: 'RIG OVERCLOCK TELEMETRY (80%..150%)' },
          { kind: 'PRE', text: rows.join('\n') },
          {
            kind: 'TEXT',
            text: 'Usage: "overclock <#|all> <80..150>" or "overclock <80..150>" (applies to all rigs). Higher OC boosts coin yield at steeper heat, power & silicon wear.',
          },
        ]);
        return;
      }

      let targetArg: number | 'ALL' = 'ALL';
      let rawPct = '';
      if (!arg2) {
        // overclock <80..150>
        rawPct = arg1;
        targetArg = 'ALL';
      } else if (arg1 === 'all') {
        targetArg = 'ALL';
        rawPct = arg2;
      } else {
        const idx = parseInt(arg1, 10) - 1;
        if (isNaN(idx) || !state.rigs[idx]) {
          append([{ kind: 'ERR', text: `Rig #${arg1} not found. Run "rigs" to see rig numbers.` }]);
          return;
        }
        targetArg = idx;
        rawPct = arg2;
      }

      const parsedPct = parseInt(rawPct, 10);
      if (isNaN(parsedPct)) {
        append([{ kind: 'ERR', text: 'Usage: overclock [<#|all>] <80..150>' }]);
        return;
      }
      const nextOc = Math.max(80, Math.min(150, parsedPct));
      onOverclockRigs(targetArg, nextOc);

      const affected = state.rigs
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => targetArg === 'ALL' || i === targetArg);

      const deltaLines: string[] = [];
      let warnThermal = false;
      let warnPower = false;

      for (const { r, i } of affected) {
        const coin = state.coins[r.targetCoin];
        const beforeT = computeRigTelemetry(
          r,
          facility,
          state.unlockedResearch,
          sysBonus,
          state.coolingUnits ?? [],
          enabledCount
        );
        const afterT = computeRigTelemetry(
          { ...r, overclockPct: nextOc },
          facility,
          state.unlockedResearch,
          sysBonus,
          state.coolingUnits ?? [],
          enabledCount
        );
        const beforeEst = computeStepCoinOutput(
          beforeT.effectiveHashrate,
          coin,
          1,
          autoSellMult,
          r.poolMode,
          true
        );
        const afterEst = computeStepCoinOutput(
          afterT.effectiveHashrate,
          coin,
          1,
          autoSellMult,
          r.poolMode,
          true
        );
        if (afterT.isUnderpowered) warnPower = true;
        if (afterT.equilibriumTempC >= 82) warnThermal = true;
        deltaLines.push(
          `  [R${i + 1}] ${padRight(r.name, 20)} ${r.overclockPct}%->${nextOc}% | Hash: ${formatHashrate(
            afterT.effectiveHashrate,
            afterT.targetAlgo
          )} | Est: ${formatUsd(beforeEst.autoSoldUsd)}->${formatUsd(
            afterEst.autoSoldUsd
          )}/st | Wall: ${beforeT.wallWatts}W->${afterT.wallWatts}W | Eq: ${
            beforeT.equilibriumTempC
          }°C->${afterT.equilibriumTempC}°C${afterT.isUnderpowered ? ' [PSU OVERLOAD!]' : ''}`
        );
      }

      append([
        {
          kind: warnPower || warnThermal ? 'WARN' : 'OK',
          text: `Overclock tuned to ${nextOc}% (${
            targetArg === 'ALL' ? `all ${affected.length} rig(s)` : affected[0]?.r.name
          }):`,
        },
        { kind: 'PRE', text: deltaLines.join('\n') },
        ...(warnPower
          ? [
              {
                kind: 'ERR' as const,
                text: 'WARNING: PSU wattage exceeded! Swap to a higher-watt PSU with "tinker" or lower overclock.',
              },
            ]
          : []),
        ...(warnThermal
          ? [
              {
                kind: 'WARN' as const,
                text: 'Thermal alert: Equilibrium temp >= 82°C. Expect faster wear or throttling without better cooling.',
              },
            ]
          : []),
      ]);
      return;
    }

    if (cmd === 'tinker') {
      if (state.rigs.length === 0) {
        append([{ kind: 'ERR', text: 'No rigs deployed. Run "build rig" first.' }]);
        return;
      }

      const slotMap: Record<string, TinkerSlot> = {
        chassis: 'chassis',
        case: 'chassis',
        compute: 'compute',
        cpu: 'compute',
        asic: 'compute',
        fpga: 'compute',
        gpu: 'gpu',
        gpus: 'gpu',
        storage: 'storage',
        ram: 'storage',
        psu: 'psu',
        power: 'psu',
        cooling: 'cooling',
        cool: 'cooling',
        os: 'os',
      };

      // If no arg1 and multiple rigs, prompt which rig to tinker; if 1 rig, open R1 workbench
      if (!arg1) {
        if (state.rigs.length === 1) {
          const nextTk: TinkerState = { rigIndex: 0, slot: 'MENU' };
          setTinker(nextTk);
          printTinkerPrompt(nextTk);
          return;
        }
        const rows = state.rigs.map(
          (r, i) => `  ${i + 1}. ${padRight(r.name, 26)} (${r.targetCoin} · OC ${r.overclockPct}%)`
        );
        append([
          { kind: 'HEAD', text: 'SELECT RIG TO TINKER' },
          { kind: 'PRE', text: rows.join('\n') },
          { kind: 'TEXT', text: 'Usage: "tinker <rig#>" or "tinker <rig#> <slot> <part#>".' },
        ]);
        return;
      }

      const rigIdx = parseInt(arg1, 10) - 1;
      const rig = state.rigs[rigIdx];
      if (!rig) {
        append([{ kind: 'ERR', text: `Rig #${arg1} not found. Run "rigs".` }]);
        return;
      }

      if (!arg2) {
        const nextTk: TinkerState = { rigIndex: rigIdx, slot: 'MENU' };
        setTinker(nextTk);
        printTinkerPrompt(nextTk);
        return;
      }

      const targetSlot = slotMap[arg2];
      if (!targetSlot || targetSlot === 'MENU') {
        append([
          {
            kind: 'ERR',
            text: 'Unknown slot. Valid slots: chassis, compute, gpu, storage, psu, cooling, os.',
          },
        ]);
        return;
      }

      // Just "tinker 1 cooling" -> open interactive workbench directly on that slot
      if (!arg3) {
        const nextTk: TinkerState = { rigIndex: rigIdx, slot: targetSlot };
        setTinker(nextTk);
        printTinkerPrompt(nextTk);
        return;
      }

      // Direct one-line swap: "tinker 1 cooling 2" or "tinker 1 gpu add 3" / "tinker 1 gpu 3"
      if (targetSlot === 'gpu') {
        if (arg3 === 'clear') {
          const res = onTinkerGpu(rigIdx, 'CLEAR');
          append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
          return;
        }
        if (arg3 === 'remove' || arg3 === 'rm' || arg3 === 'sell') {
          const sIdx = (parseInt(parts[4] || '1', 10) || 1) - 1;
          const res = onTinkerGpu(rigIdx, 'REMOVE', sIdx);
          append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
          return;
        }
        const gArg = arg3 === 'add' ? parts[4] : arg3;
        const qArg = arg3 === 'add' ? parts[5] : parts[4];
        const gIdx = parseInt(gArg || '', 10) - 1;
        const gpu = GPU_PARTS[gIdx];
        if (!gpu) {
          append([
            {
              kind: 'ERR',
              text: `GPU #${gArg || '?'} not found. Run "tinker ${rigIdx + 1} gpu" to inspect catalog.`,
            },
          ]);
          return;
        }
        const qMatch = qArg?.toLowerCase().match(/^x?(\d+)$/);
        const qty = qMatch ? Math.max(1, parseInt(qMatch[1], 10)) : 1;
        const res = onTinkerGpu(rigIdx, 'ADD', gpu.id, qty);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }

      const partNum = parseInt(arg3, 10) - 1;
      let pickedId: string | null = null;
      if (targetSlot === 'chassis') pickedId = CHASSIS_PARTS[partNum]?.id ?? null;
      else if (targetSlot === 'compute') {
        const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
        const compat = COMPUTE_PARTS.filter((c) =>
          ch.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC'
        );
        pickedId = compat[partNum]?.id ?? null;
      } else if (targetSlot === 'storage') pickedId = STORAGE_PARTS[partNum]?.id ?? null;
      else if (targetSlot === 'psu') pickedId = PSU_PARTS[partNum]?.id ?? null;
      else if (targetSlot === 'cooling') pickedId = COOLING_PARTS[partNum]?.id ?? null;
      else if (targetSlot === 'os') pickedId = OS_PARTS[partNum]?.id ?? null;

      if (!pickedId) {
        append([
          {
            kind: 'ERR',
            text: `Part #${arg3} not found in ${targetSlot}. Run "tinker ${
              rigIdx + 1
            } ${targetSlot}" to inspect.`,
          },
        ]);
        return;
      }
      const res = onTinkerPart(rigIdx, targetSlot, pickedId);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return;
    }

    if (cmd === 'cool') {
      const units = state.coolingUnits ?? [];
      if (!arg1 || arg1 === 'list') {
        const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
        const coolingSummary = computeFacilityCoolingSummary(
          units,
          state.rigs.filter((r) => r.enabled).length
        );
        const installed =
          units.length === 0
            ? '  (none installed)'
            : units
                .map((u, i) => {
                  const spec = ROOM_COOLING_UNITS.find((s) => s.id === u.type);
                  return `  #${i + 1} ${padRight(spec?.name ?? u.type, 26)} [${
                    u.enabled ? 'ON ' : 'OFF'
                  }]  -${spec?.coolingPowerC ?? 0}°C cap  ${spec?.watts ?? 0}W`;
                })
                .join('\n');
        const shop = ROOM_COOLING_UNITS.map((u) => {
          const short = u.id === 'cool_unit_fan' ? 'fan' : u.id === 'cool_unit_ac' ? 'ac' : 'chiller';
          const ok = state.devUnlockAll || facIdx >= u.unlockFacilityIndex;
          return `  cool add ${padRight(short, 8)} ${padRight(u.name, 26)} ${padLeft(
            formatUsd(u.cost),
            7
          )}  +${u.coolingPowerC}°C  ${ok ? '[OK]' : `[At ${FACILITY_TIERS[u.unlockFacilityIndex].name}]`}`;
        }).join('\n');
        append([
          {
            kind: 'HEAD',
            text: `FACILITY COOLING (-${coolingSummary.effectiveCoolingPerRigC.toFixed(1)}°C/rig relief)`,
          },
          { kind: 'PRE', text: `INSTALLED:\n${installed}\n\nCATALOG:\n${shop}` },
        ]);
        return;
      }
      if (arg1 === 'add') {
        const map: Record<string, RoomCoolingType> = {
          fan: 'cool_unit_fan',
          ac: 'cool_unit_ac',
          chiller: 'cool_unit_chiller',
        };
        const type = map[arg2];
        if (!type) {
          append([{ kind: 'ERR', text: 'Usage: cool add <fan|ac|chiller>' }]);
          return;
        }
        const ok = onAddCoolingUnit(type);
        append([
          ok
            ? { kind: 'OK', text: `Installed ${ROOM_COOLING_UNITS.find((u) => u.id === type)?.name}.` }
            : { kind: 'ERR', text: 'Cannot install cooling unit (insufficient cash or facility tier).' },
        ]);
        return;
      }
      if (arg1 === 'toggle' || arg1 === 'sell') {
        const idx = parseInt(arg2, 10) - 1;
        const unit = units[idx];
        if (!unit) {
          append([{ kind: 'ERR', text: `Cooling unit #${arg2 || '?'} not found.` }]);
          return;
        }
        if (arg1 === 'toggle') {
          onToggleCoolingUnit(unit.id);
          append([{ kind: 'OK', text: `Toggled cooling unit #${idx + 1}.` }]);
        } else {
          onRemoveCoolingUnit(unit.id);
          append([{ kind: 'OK', text: `Sold cooling unit #${idx + 1}.` }]);
        }
        return;
      }
      append([{ kind: 'ERR', text: 'Usage: cool [list|add <fan|ac|chiller>|toggle <#>|sell <#>]' }]);
      return;
    }

    if (cmd === 'facilities') {
      const rows = FACILITY_TIERS.map((f, i) => {
        const owned = state.ownedFacilityIds.includes(f.id);
        const cur = state.facilityId === f.id;
        return `  ${i + 1}. ${padRight(f.name, 26)} ${padLeft(`${f.maxRigs} rigs`, 8)} ${padLeft(
          `${f.maxPowerKw}kW`,
          6
        )} ${padLeft(`${f.noiseLimitDba}dBA`, 6)} $${f.powerRatePerKwh}/kWh  Rent:${padLeft(
          formatUsd(f.cycleRent),
          8
        )}  Buy:${padLeft(formatUsd(f.buyoutPrice, true), 7)}  ${
          cur ? '[ACTIVE]' : owned ? '[OWNED]' : ''
        }`;
      });
      append([
        { kind: 'HEAD', text: 'FACILITY TIERS' },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Run "facility rent <1..4>" or "facility buy <1..4>" to relocate.' },
      ]);
      return;
    }

    if (cmd === 'facility') {
      const action = arg1 === 'buy' ? 'BUY' : arg1 === 'rent' ? 'RENT' : null;
      const idx = parseInt(arg2, 10) - 1;
      const target = FACILITY_TIERS[idx];
      if (!action || !target) {
        append([{ kind: 'ERR', text: 'Usage: facility <rent|buy> <1..4>' }]);
        return;
      }
      const ok = onSelectFacility(target.id, action);
      append([
        ok
          ? { kind: 'OK', text: `Relocated operations to ${target.name} (${action}).` }
          : { kind: 'ERR', text: 'Cannot relocate (insufficient cash or too many rigs for target site).' },
      ]);
      return;
    }

    if (cmd === 'market' || cmd === 'coins') {
      const reg = MARKET_REGIME_SPECS[state.marketRegime];
      const header = `  ${padRight('TIER', 5)} ${padRight('COIN', 6)} ${padRight(
        'NAME',
        9
      )} ${padLeft('SPOT USD', 10)} ${padLeft('STEP%', 7)}  ${padRight('TREND', 9)} ${padLeft(
        'DIFF',
        6
      )} ${padLeft('HALVE', 7)} ${padLeft('UNLOCK COST', 11)}  ${padRight('STATUS', 10)}`;
      const rows = coinSymbols.map((sym) => {
        const c = state.coins[sym];
        const pct =
          c.prevPriceUsd > 0 ? ((c.priceUsd - c.prevPriceUsd) / c.prevPriceUsd) * 100 : 0;
        const spark = renderAsciiSparkline(
          c.priceHistory.map((p) => p.price),
          8
        );
        return `  ${padRight(`T${c.tier}`, 5)} ${padRight(sym, 6)} ${padRight(
          c.name,
          9
        )} ${padLeft(formatUsd(c.priceUsd), 10)} ${padLeft(
          `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
          7
        )}  ${padRight(spark, 9)} ${padLeft(`${c.networkDifficulty.toFixed(2)}x`, 6)} ${padLeft(
          `${c.stepsUntilHalving}st`,
          7
        )} ${padLeft(c.unlockCostUsd === 0 ? 'FREE' : formatUsd(c.unlockCostUsd), 11)}  ${
          c.unlocked ? '[UNLOCKED]' : '[LOCKED]'
        }`;
      });
      append([
        {
          kind: 'HEAD',
          text: `COIN EXCHANGE · REGIME: ${reg.label.toUpperCase()} (${state.regimeStepsRemaining}st left) — ${reg.summary}`,
        },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        {
          kind: 'TEXT',
          text: 'Halvings cut coin emission by 50% and trigger supply-shock rallies. Commands: "unlock <COIN>", "chart <COIN>", "pr launch <1..5> <COIN>", "ops wash <COIN>".',
        },
      ]);
      return;
    }

    if (cmd === 'unlock' || (cmd === 'coin' && arg1 === 'unlock')) {
      const rawSym = cmd === 'unlock' ? arg1 : arg2;
      const sym = rawSym.toUpperCase() as CoinSymbol;
      const coin = state.coins[sym];
      if (!coin) {
        append([{ kind: 'ERR', text: 'Usage: unlock <BTC|LTC|DOGE|XMR|ETH|XCH>' }]);
        return;
      }
      if (coin.unlocked) {
        append([{ kind: 'OK', text: `${coin.name} (${sym}) is already unlocked! Assign a rig via "rig 1 coin ${sym}".` }]);
        return;
      }
      const ok = onUnlockCoin(sym);
      append([
        ok
          ? {
              kind: 'OK',
              text: `Unlocked ${coin.name} (${sym}) for ${formatUsd(coin.unlockCostUsd)}! Run "rig <#> coin ${sym}".`,
            }
          : {
              kind: 'ERR',
              text: `Insufficient cash to unlock ${sym} (need ${formatUsd(coin.unlockCostUsd)}).`,
            },
      ]);
      return;
    }

    if (cmd === 'chart') {
      const sym = arg1.toUpperCase() as CoinSymbol;
      const c = state.coins[sym];
      if (!c) {
        append([{ kind: 'ERR', text: `Unknown coin "${arg1 || '?'}".` }]);
        return;
      }
      const sliceCount = arg2 === '30' || arg2 === '30s' ? 30 : arg2 === 'all' ? 9999 : 90;
      const pts = c.priceHistory.slice(-sliceCount);
      if (pts.length < 2) {
        append([{ kind: 'TEXT', text: `Not enough history yet for ${sym}. Run "step 5" to generate market steps.` }]);
        return;
      }
      const rows = 9;
      const cols = 48;
      const sampled = Array.from({ length: cols }, (_, idx) => {
        const i = Math.min(pts.length - 1, Math.floor((idx / (cols - 1)) * (pts.length - 1)));
        return pts[i];
      });
      const pMin = Math.min(...sampled.map((s) => s.price));
      const pMax = Math.max(...sampled.map((s) => s.price));
      const span = pMax - pMin || pMax * 0.1 || 1;
      const chartLines = Array.from({ length: rows }, (_, r) => {
        const val = pMax - (r / (rows - 1)) * span;
        const lbl = padLeft(formatUsd(val, true), 9);
        const cells = sampled
          .map((pt) => {
            const rowIdx = Math.round(((pMax - pt.price) / span) * (rows - 1));
            return rowIdx === r ? '●' : rowIdx < r ? '│' : ' ';
          })
          .join('');
        return `${lbl} ┤ ${cells}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `${c.name} (${sym}) SPOT CHART · ${formatUsd(c.priceUsd)} · Diff ${c.networkDifficulty.toFixed(
            2
          )}x · Halving in ${c.stepsUntilHalving}st`,
        },
        {
          kind: 'PRE',
          text: `${chartLines.join('\n')}\n          ${padRight(sampled[0].stepLabel, 24)}${padLeft(
            sampled[sampled.length - 1].stepLabel,
            24
          )}`,
        },
      ]);
      return;
    }

    if (cmd === 'contracts') {
      const activeTxt = state.activeContract
        ? `ACTIVE CONTRACT: ${state.activeContract.title} (${state.activeContract.clientName})\n  ${
            state.activeContract.description
          }\n  Progress: ${Math.min(
            100,
            Math.round((state.activeContract.progress / state.activeContract.targetAmount) * 100)
          )}% (${
            state.activeContract.type === 'LOW_NOISE_RUN'
              ? `${state.activeContract.progress}/${state.activeContract.targetAmount} steps`
              : `${formatUsd(state.activeContract.progress)} / ${formatUsd(
                  state.activeContract.targetAmount
                )}`
          }) · ${state.activeContract.stepsRemaining}st left · Reward: ${formatUsd(
            state.activeContract.rewardCash
          )} + ${state.activeContract.rewardRp} RP`
        : 'ACTIVE CONTRACT: None (accept one below for bonus cash & RP)';

      const boardRows = state.availableContracts.map(
        (c, i) =>
          `  ${i + 1}. ${padRight(c.title, 26)} ${padLeft(formatUsd(c.rewardCash), 9)}  +${padLeft(
            `${c.rewardRp}RP`,
            5
          )}  ${padLeft(`${c.durationSteps}st`, 4)}  ${c.description}`
      );
      append([
        { kind: 'HEAD', text: `ENTERPRISE CLIENT CONTRACTS (Completed: ${state.stats.contractsCompleted})` },
        { kind: 'PRE', text: `${activeTxt}\n\nOPEN BOARD:\n${boardRows.join('\n')}` },
        {
          kind: 'TEXT',
          text: 'Run "contract accept <1..3>" to lock a deal, or "contract abandon" to drop active contract.',
        },
      ]);
      return;
    }

    if (cmd === 'contract') {
      if (arg1 === 'accept') {
        const idx = parseInt(arg2, 10) - 1;
        const target = state.availableContracts[idx];
        if (!target) {
          append([{ kind: 'ERR', text: 'Usage: contract accept <1..3>' }]);
          return;
        }
        const ok = onAcceptContract(target.id);
        append([
          ok
            ? { kind: 'OK', text: `Accepted contract: ${target.title} (${target.stepsRemaining}st deadline).` }
            : { kind: 'ERR', text: 'Cannot accept contract while another contract is active.' },
        ]);
        return;
      }
      if (arg1 === 'abandon') {
        const ok = onAbandonContract();
        append([
          ok
            ? { kind: 'WARN', text: 'Abandoned active contract (-4 Media Credibility).' }
            : { kind: 'ERR', text: 'No active contract to abandon.' },
        ]);
        return;
      }
      append([{ kind: 'ERR', text: 'Usage: contract <accept <1..3>|abandon>' }]);
      return;
    }

    if (cmd === 'rivals') {
      const header = `  #  ${padRight('SYNDICATE', 25)} ${padRight('COIN', 5)} ${padLeft(
        'HASH IDX',
        10
      )} ${padLeft('SHARE', 7)} ${padRight('STATUS / LAST MOVE', 32)}`;
      const rows = state.rivals.map((rv, i) => {
        const st =
          rv.disruptedSteps > 0
            ? `[DISRUPTED ${rv.disruptedSteps}st]`
            : rv.lastActionSummary;
        return `  ${padRight(String(i + 1), 2)} ${padRight(rv.name, 25)} ${padRight(
          rv.specialtyCoin,
          5
        )} ${padLeft(rv.hashPowerIndex.toLocaleString('en-US'), 10)} ${padLeft(
          `${rv.marketSharePct.toFixed(1)}%`,
          7
        )} ${st}`;
      });
      append([
        { kind: 'HEAD', text: 'RIVAL MINING SYNDICATES' },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        {
          kind: 'TEXT',
          text: 'Rival growth raises global network difficulty. Outscale them legally or disrupt them via "ops sabotage <1..3>".',
        },
      ]);
      return;
    }

    if (cmd === 'ops') {
      if (arg1 === 'siphon') {
        if (arg2 !== 'on' && arg2 !== 'off') {
          append([{ kind: 'ERR', text: 'Usage: ops siphon <on|off>' }]);
          return;
        }
        onToggleSiphon(arg2 === 'on');
        append([
          {
            kind: arg2 === 'on' ? 'WARN' : 'OK',
            text:
              arg2 === 'on'
                ? 'Meter Siphon ENGAGED: -65% electricity bills & +25% breaker headroom (+1.7 Heat/step).'
                : 'Meter Siphon disconnected.',
          },
        ]);
        return;
      }
      if (arg1 === 'botnet') {
        const sym = (arg2 || 'XMR').toUpperCase() as CoinSymbol;
        if (!state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Usage: ops botnet <COIN>' }]);
          return;
        }
        const res = onRentBotnet(sym);
        append([
          res.ok
            ? { kind: 'WARN', text: `Leased zero-watt shadow botnet on ${sym} for 8 steps (${formatUsd(res.cost ?? 0)}, +18 Heat).` }
            : { kind: 'ERR', text: res.reason ?? 'Botnet rental failed.' },
        ]);
        return;
      }
      if (arg1 === 'wash') {
        const sym = (arg2 || 'BTC').toUpperCase() as CoinSymbol;
        if (!state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Usage: ops wash <COIN>' }]);
          return;
        }
        const res = onWashTrade(sym);
        append([
          res.ok
            ? { kind: 'WARN', text: `Executed dark-pool wash spike on ${sym} (${formatUsd(res.cost ?? 0)}, +20 Heat).` }
            : { kind: 'ERR', text: res.reason ?? 'Wash trade failed.' },
        ]);
        return;
      }
      if (arg1 === 'sabotage') {
        const idx = parseInt(arg2, 10) - 1;
        const rival = state.rivals[idx];
        if (!rival) {
          append([{ kind: 'ERR', text: 'Usage: ops sabotage <1..3>' }]);
          return;
        }
        const res = onSabotageRival(rival.id);
        append([
          res.ok
            ? { kind: 'WARN', text: `Sabotaged ${rival.name} for 10 steps (${formatUsd(res.cost ?? 0)}, +18 Heat).` }
            : { kind: 'ERR', text: res.reason ?? 'Sabotage failed.' },
        ]);
        return;
      }
      if (arg1 === 'launder') {
        const res = onLaunderHeat();
        append([
          res.ok
            ? { kind: 'OK', text: `Laundered transaction trails via mixers (-24 Heat, cost ${formatUsd(res.cost ?? 0)}).` }
            : { kind: 'ERR', text: res.reason ?? 'Launder failed.' },
        ]);
        return;
      }
      if (arg1 === 'bribe') {
        const res = onBribeInspectors();
        append([
          res.ok
            ? { kind: 'OK', text: `Paid off municipal utility inspectors (-16 Heat & 12-step raid shield, cost ${formatUsd(res.cost ?? 0)}).` }
            : { kind: 'ERR', text: res.reason ?? 'Bribe failed.' },
        ]);
        return;
      }

      const alignment = getEmpireAlignment(state);
      const heat = Math.round(state.regulatoryScrutiny);
      const heatZone =
        heat >= 75 ? 'CRITICAL (High Raid Risk)' : heat >= 50 ? 'ELEVATED (Audit Watch)' : 'LOW';
      const botnetLine =
        state.underground.botnetStepsRemaining > 0
          ? `ACTIVE (${state.underground.botnetCoin}, ${state.underground.botnetStepsRemaining}st left)`
          : 'INACTIVE';

      append([
        {
          kind: 'HEAD',
          text: `UNDERGROUND OPERATIONS CONSOLE · Alignment: ${alignment}`,
        },
        {
          kind: 'PRE',
          text: [
            `  Heat / Scrutiny: [${renderAsciiBar(heat, 16)}] ${heat}/100  (${heatZone})`,
            `  Audit Shield:    ${state.underground.bribeProtectionSteps > 0 ? `${state.underground.bribeProtectionSteps} steps remaining` : 'None'}`,
            `  Power Siphon:    ${state.underground.powerSiphonActive ? 'ON (-65% electricity, +25% breaker, +1.7 Heat/st)' : 'OFF'}`,
            `  Shadow Botnet:   ${botnetLine}`,
            `  Raids Survived:  ${state.stats.raidsSurvived}   Covert Ops Run: ${state.stats.covertOpsCount}`,
            ``,
            `  ACTIONS:`,
            `    ops siphon <on|off>   Toggle bypassed power meter`,
            `    ops botnet <COIN>     Lease zero-watt shadow hash for 8 steps`,
            `    ops wash <COIN>       Spike coin spot price +26% via dark pools`,
            `    ops sabotage <1..3>   DDoS & disrupt a rival syndicate for 10 steps`,
            `    ops launder           Route funds through mixers (-24 Heat)`,
            `    ops bribe             Pay utility inspectors (-16 Heat + 12-step raid shield)`,
            `    blackmarket           Browse smuggled discounted rigs & illicit ROM mods`,
          ].join('\n'),
        },
      ]);
      return;
    }

    if (cmd === 'blackmarket' || cmd === 'bm') {
      if (arg1 === 'buy') {
        const idx = parseInt(arg2, 10) - 1;
        const listing = state.underground.blackMarketListings[idx];
        if (!listing) {
          append([{ kind: 'ERR', text: 'Usage: blackmarket buy <1..3> [rig#]' }]);
          return;
        }
        const rigIdx = arg3 ? parseInt(arg3, 10) - 1 : 0;
        const res = onBuyBlackMarket(listing.id, rigIdx);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.summary }]);
        return;
      }

      const refreshIn = Math.max(0, state.underground.blackMarketRefreshStep - state.stepCount);
      const rows = state.underground.blackMarketListings.map(
        (item, i) =>
          `  ${i + 1}. ${padRight(item.title, 30)} ${padLeft(formatUsd(item.costUsd), 9)}  +${item.heatGain} Heat  ${item.description}`
      );
      append([
        {
          kind: 'HEAD',
          text: `UNDERGROUND BLACK MARKET (Refreshes in ${refreshIn} steps)`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text: 'Run "blackmarket buy <1..3> [rig#]" (rig# needed when flashing an illicit BIOS/ROM mod onto a specific rig).',
        },
      ]);
      return;
    }

    if (cmd === 'staff') {
      const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
      const roster =
        state.employees.length === 0
          ? '  (none hired)'
          : state.employees
              .map(
                (e, i) =>
                  `  #${i + 1} ${padRight(e.name, 18)} ${padRight(e.role, 14)} ${padRight(
                    e.shift,
                    12
                  )} ${e.priority}`
              )
              .join('\n');
      const catalog = EMPLOYEE_SPECS.map((s) => {
        const key =
          s.role === 'TECHNICIAN'
            ? 'tech'
            : s.role === 'SYS_ENGINEER'
            ? 'eng'
            : s.role === 'RESEARCHER'
            ? 'res'
            : s.role === 'PR_STRATEGIST'
            ? 'pr'
            : 'analyst';
        const ok = state.devUnlockAll || facIdx >= s.unlockFacilityIndex;
        return `  hire ${padRight(key, 8)} ${padRight(s.title, 22)} Hire:${padLeft(
          formatUsd(s.hireCost),
          7
        )}  Sal:${padLeft(formatUsd(s.cycleSalary), 7)}/cyc  ${
          ok ? '[OK]' : `[At ${FACILITY_TIERS[s.unlockFacilityIndex].name}]`
        }`;
      }).join('\n');
      append([
        { kind: 'HEAD', text: 'STAFF ROSTER & RECRUITMENT' },
        { kind: 'PRE', text: `ACTIVE CREW:\n${roster}\n\nRECRUIT:\n${catalog}` },
      ]);
      return;
    }

    if (cmd === 'hire') {
      const roleMap: Record<string, EmployeeRole> = {
        tech: 'TECHNICIAN',
        technician: 'TECHNICIAN',
        eng: 'SYS_ENGINEER',
        engineer: 'SYS_ENGINEER',
        res: 'RESEARCHER',
        researcher: 'RESEARCHER',
        pr: 'PR_STRATEGIST',
        analyst: 'ANALYST',
      };
      const role = roleMap[arg1];
      if (!role) {
        append([{ kind: 'ERR', text: 'Usage: hire <tech|eng|res|pr|analyst>' }]);
        return;
      }
      const ok = onHireEmployee(role);
      append([
        ok
          ? { kind: 'OK', text: `Hired ${role}.` }
          : { kind: 'ERR', text: 'Cannot hire (insufficient cash or facility tier locked).' },
      ]);
      return;
    }

    if (cmd === 'fire') {
      const idx = parseInt(arg1, 10) - 1;
      const emp = state.employees[idx];
      if (!emp) {
        append([{ kind: 'ERR', text: 'Usage: fire <staff#>' }]);
        return;
      }
      onFireEmployee(emp.id);
      append([{ kind: 'OK', text: `Released ${emp.name}.` }]);
      return;
    }

    if (cmd === 'shift' || cmd === 'priority') {
      const idx = parseInt(arg1, 10) - 1;
      const emp = state.employees[idx];
      if (!emp) {
        append([{ kind: 'ERR', text: `Staff #${arg1 || '?'} not found.` }]);
        return;
      }
      if (cmd === 'shift') {
        const sMap: Record<string, ShiftType> = {
          day: 'DAY',
          night: 'NIGHT',
          '24/7': 'ROTATION_24_7',
        };
        const nextShift = sMap[arg2];
        if (!nextShift) {
          append([{ kind: 'ERR', text: 'Usage: shift <#> <day|night|24/7>' }]);
          return;
        }
        onUpdateEmployee(emp.id, nextShift, emp.priority);
        append([{ kind: 'OK', text: `${emp.name} shift set to ${nextShift}.` }]);
      } else {
        const pMap: Record<string, TaskPriority> = {
          thermal: 'THERMAL_SAFETY',
          care: 'HARDWARE_CARE',
          hash: 'HASHRATE_TUNING',
          research: 'RESEARCH_OUTPUT',
        };
        const nextPrio = pMap[arg2];
        if (!nextPrio) {
          append([{ kind: 'ERR', text: 'Usage: priority <#> <thermal|care|hash|research>' }]);
          return;
        }
        onUpdateEmployee(emp.id, emp.shift, nextPrio);
        append([{ kind: 'OK', text: `${emp.name} priority set to ${nextPrio}.` }]);
      }
      return;
    }

    if (cmd === 'research') {
      if (arg1 === 'start' && arg2) {
        const idx = parseInt(arg2, 10) - 1;
        const node =
          !isNaN(idx) && RESEARCH_NODES[idx]
            ? RESEARCH_NODES[idx]
            : RESEARCH_NODES.find(
                (n) => n.id.toLowerCase() === arg2 || n.id.toLowerCase() === `res_${arg2}`
              );
        if (!node) {
          append([{ kind: 'ERR', text: `Research "${arg2}" not found. Run "research" to list.` }]);
          return;
        }
        const ok = onStartResearch(node.id);
        append([
          ok
            ? { kind: 'OK', text: `Started R&D: ${node.name}.` }
            : { kind: 'ERR', text: 'Cannot start research (busy, prereq locked, or insufficient cash).' },
        ]);
        return;
      }

      const rows = RESEARCH_NODES.map((n, i) => {
        const done = state.unlockedResearch.includes(n.id);
        const active = state.activeResearchId === n.id;
        const preOk =
          state.devUnlockAll || n.prereqIds.every((p) => state.unlockedResearch.includes(p));
        const status = done
          ? '[DONE]'
          : active
          ? `[ACTIVE ${Math.round(state.activeResearchProgress)}/${n.costRp}]`
          : !preOk
          ? '[PREREQ]'
          : '[READY]';
        return `  ${i + 1}. ${padRight(n.name, 30)} ${padLeft(`${n.costRp} RP`, 6)} ${padLeft(
          formatUsd(n.costCash),
          7
        )}  ${padRight(status, 15)}  ${n.effectSummary}`;
      });
      append([
        { kind: 'HEAD', text: `R&D TECH TREE (${state.researchPoints.toFixed(1)} RP available)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: `Run "research start <1..${RESEARCH_NODES.length}>" to begin a project.` },
      ]);
      return;
    }

    if (cmd === 'ledger') {
      if (state.ledger.length === 0) {
        append([
          {
            kind: 'TEXT',
            text: `No cycle settlements yet. Utility & payroll bills settle every ${BILLING_CYCLE_STEPS} steps.`,
          },
        ]);
        return;
      }
      const header = `  ${padRight('CYCLE', 16)} ${padLeft('AUTO-SELL', 11)} ${padLeft(
        'POWER',
        9
      )} ${padLeft('RENT', 9)} ${padLeft('PAYROLL', 9)} ${padLeft('NET CASH', 11)}`;
      const rows = state.ledger.slice(0, 12).map((l) => {
        return `  ${padRight(l.label, 16)} ${padLeft(formatUsd(l.miningRevenueUsd), 11)} ${padLeft(
          '-' + formatUsd(l.electricityCostUsd),
          9
        )} ${padLeft('-' + formatUsd(l.rentCostUsd), 9)} ${padLeft(
          '-' + formatUsd(l.payrollCostUsd),
          9
        )} ${padLeft(formatUsd(l.netCashflowUsd), 11)}`;
      });
      append([
        { kind: 'HEAD', text: '30-STEP CYCLE FINANCIAL LEDGER' },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
      ]);
      return;
    }

    if (cmd === 'pr') {
      if (arg1 === 'launch' && arg2 && arg3) {
        const idx = parseInt(arg2, 10) - 1;
        const tpl = PR_CAMPAIGNS[idx];
        const sym = arg3.toUpperCase() as CoinSymbol;
        if (!tpl || !state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Usage: pr launch <1..5> <COIN>' }]);
          return;
        }
        const ok = onLaunchCampaign(tpl.id, sym);
        append([
          ok
            ? { kind: 'OK', text: `Launched ${tpl.name} targeting ${sym}.` }
            : { kind: 'ERR', text: 'Cannot launch (cooldown, credibility, or cash).' },
        ]);
        return;
      }
      if ((arg1 === 'hype' || arg1 === 'fud') && arg2) {
        const dir = arg1.toUpperCase() as 'HYPE' | 'FUD';
        const sym = arg2.toUpperCase() as CoinSymbol;
        const tpl = PR_CAMPAIGNS.find(
          (c) =>
            c.direction === dir &&
            (state.campaignCooldowns[c.id] ?? 0) <= state.stepCount &&
            state.mediaCredibility >= c.minCredibility &&
            state.cash >= c.cost
        );
        if (!tpl || !state.coins[sym]) {
          append([{ kind: 'ERR', text: 'No ready/affordable campaign or unknown coin.' }]);
          return;
        }
        onLaunchCampaign(tpl.id, sym);
        append([{ kind: 'OK', text: `Launched ${tpl.name} on ${sym}.` }]);
        return;
      }

      const rows = PR_CAMPAIGNS.map((c, i) => {
        const cd = Math.max(0, (state.campaignCooldowns[c.id] ?? 0) - state.stepCount);
        const status =
          cd > 0
            ? `[CD ${cd}st]`
            : state.mediaCredibility < c.minCredibility
            ? `[NEED ${c.minCredibility} CRED]`
            : '[READY]';
        return `  ${i + 1}. [${padRight(c.direction, 4)}] ${padRight(c.name, 28)} ${padLeft(
          formatUsd(c.cost),
          8
        )}  ${c.durationSteps}st  ${c.priceImpactPct >= 0 ? '+' : ''}${c.priceImpactPct}%  ${status}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `PR & MEDIA DESK (Credibility: ${Math.round(state.mediaCredibility)}/100 · Heat: ${Math.round(
            state.regulatoryScrutiny
          )}/100)`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Run "pr launch <1..5> <COIN>" (e.g. "pr launch 1 BTC") to pump payout prices.' },
      ]);
      return;
    }

    if (cmd === 'dev') {
      if (!arg1 || arg1 === 'panel') {
        if (!state.devMode) onToggleDevMode(true);
        else onOpenDevPanel();
        append([{ kind: 'OK', text: 'Opened Developer Testing Console.' }]);
        return;
      }
      if (arg1 === 'on') {
        onToggleDevMode(true);
        append([{ kind: 'OK', text: 'Dev Mode enabled.' }]);
        return;
      }
      if (arg1 === 'off') {
        onToggleDevMode(false);
        append([{ kind: 'OK', text: 'Dev Mode disabled.' }]);
        return;
      }
      if (arg1 === 'unlock') {
        onToggleDevUnlockAll();
        append([{ kind: 'OK', text: 'Toggled Dev Unlock All.' }]);
        return;
      }
      if (arg1 === 'cash') {
        const amt = Number(arg2) || 100_000;
        onDevAddCash(amt);
        append([{ kind: 'OK', text: `Added ${formatUsd(amt)} cash.` }]);
        return;
      }
      if (arg1 === 'rp') {
        const amt = Number(arg2) || 500;
        onDevAddRp(amt);
        append([{ kind: 'OK', text: `Added +${amt} RP.` }]);
        return;
      }
      if (arg1 === 'step') {
        const n = Math.max(1, Math.min(200, parseInt(arg2 || '10', 10) || 10));
        onStepSteps(n);
        append([{ kind: 'OK', text: `Advanced up to +${n} steps.` }]);
        return;
      }
      if (arg1 === 'research') {
        onDevUnlockAllResearch();
        append([{ kind: 'OK', text: 'Unlocked all R&D nodes.' }]);
        return;
      }
      if (arg1 === 'facilities') {
        onDevOwnAllFacilities();
        append([{ kind: 'OK', text: 'Granted ownership of all 4 facilities.' }]);
        return;
      }
      if (arg1 === 'coins') {
        onDevUnlockAllCoins();
        append([{ kind: 'OK', text: 'Unlocked all 6 coin tiers.' }]);
        return;
      }
      if (arg1 === 'cool') {
        onDevResetRigTemps();
        append([{ kind: 'OK', text: 'Cooled and repaired all rigs.' }]);
        return;
      }
      if (arg1 === 'event' || arg1 === 'raid') {
        onDevTriggerEvent(arg1 === 'raid');
        append([{ kind: 'WARN', text: `Triggered interactive ${arg1} event.` }]);
        return;
      }
      if (arg1 === 'regime') {
        const rMap: Record<string, MarketRegime> = {
          acc: 'ACCUMULATION',
          accumulation: 'ACCUMULATION',
          bull: 'BULL_RUN',
          mania: 'MANIA_PEAK',
          corr: 'CORRECTION',
          correction: 'CORRECTION',
          winter: 'CRYPTO_WINTER',
        };
        const reg = rMap[arg2];
        if (!reg) {
          append([{ kind: 'ERR', text: 'Usage: dev regime <acc|bull|mania|corr|winter>' }]);
          return;
        }
        onDevSetRegime(reg);
        append([{ kind: 'OK', text: `Market regime forced to ${MARKET_REGIME_SPECS[reg].label}.` }]);
        return;
      }
      if (arg1 === 'halve') {
        const sym = arg2.toUpperCase() as CoinSymbol;
        if (!state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Usage: dev halve <COIN>' }]);
          return;
        }
        onDevTriggerHalving(sym);
        append([{ kind: 'OK', text: `Triggered instant halving on ${sym}.` }]);
        return;
      }
      if (arg1 === 'heat') {
        const h = Math.max(0, Math.min(100, parseInt(arg2 || '50', 10) || 0));
        onDevSetHeat(h);
        append([{ kind: 'OK', text: `Regulatory Heat set to ${h}/100.` }]);
        return;
      }
      if (arg1 === 'blackmarket') {
        onDevRefreshBlackMarket();
        append([{ kind: 'OK', text: 'Refreshed Black Market inventory.' }]);
        return;
      }
      if (arg1 === 'pump' || arg1 === 'crash') {
        const sym = arg2.toUpperCase() as CoinSymbol;
        if (!state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Unknown coin.' }]);
          return;
        }
        onDevAdjustCoinPrice(sym, arg1 === 'pump' ? 1.5 : 0.5);
        append([{ kind: 'OK', text: `${arg1 === 'pump' ? 'Pumped +50%' : 'Crashed -50%'} ${sym}.` }]);
        return;
      }
      append([{ kind: 'ERR', text: 'Usage: dev <on|off|panel|event|raid|regime X|halve COIN|heat N|blackmarket|...>' }]);
      return;
    }

    append([{ kind: 'ERR', text: `Unknown command "${cmd}". Type "help" for full command list.` }]);
  };

  const contextualChips = state.pendingEvent
    ? [
        ...state.pendingEvent.options.map((o) => ({
          label: `[${o.key}] ${o.label.slice(0, 26)}`,
          cmd: o.key,
        })),
        { label: 'event', cmd: 'event' },
        { label: 'status', cmd: 'status' },
        { label: 'ops', cmd: 'ops' },
      ]
    : wizard
    ? wizard.step === 'GPU'
      ? [
          { label: '1', cmd: '1' },
          { label: '2', cmd: '2' },
          { label: 'done', cmd: 'done' },
          { label: 'clear', cmd: 'clear' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : wizard.step === 'CONFIRM'
      ? [
          { label: 'deploy', cmd: 'deploy' },
          { label: 'oc 130', cmd: 'oc 130' },
          { label: 'pool solo', cmd: 'pool solo' },
          { label: 'profile turbo', cmd: 'profile turbo' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : [
          { label: '1', cmd: '1' },
          { label: '2', cmd: '2' },
          { label: '3', cmd: '3' },
          ...(wizard.step === 'CHASSIS' ? [{ label: 'preset 1', cmd: 'preset 1' }] : []),
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
    : tinker
    ? tinker.slot === 'MENU'
      ? [
          { label: 'chassis', cmd: 'chassis' },
          { label: 'compute', cmd: 'compute' },
          { label: 'gpu', cmd: 'gpu' },
          { label: 'storage', cmd: 'storage' },
          { label: 'psu', cmd: 'psu' },
          { label: 'cooling', cmd: 'cooling' },
          { label: 'os', cmd: 'os' },
          { label: 'inspect', cmd: 'inspect' },
          { label: 'done', cmd: 'done' },
        ]
      : tinker.slot === 'gpu'
      ? [
          { label: 'add 1', cmd: 'add 1' },
          { label: 'remove 1', cmd: 'remove 1' },
          { label: 'clear', cmd: 'clear' },
          { label: 'back', cmd: 'back' },
          { label: 'done', cmd: 'done' },
        ]
      : [
          { label: '1', cmd: '1' },
          { label: '2', cmd: '2' },
          { label: '3', cmd: '3' },
          { label: 'back', cmd: 'back' },
          { label: 'done', cmd: 'done' },
        ]
    : [
        ...(state.tutorialStep && state.tutorialStep > 0
          ? [
              { label: 'tutorial next', cmd: 'tutorial next' },
              { label: 'tutorial skip', cmd: 'tutorial skip' },
            ]
          : []),
        { label: 'status', cmd: 'status' },
        { label: 'step 1', cmd: 'step 1' },
        { label: 'step 5', cmd: 'step 5' },
        { label: 'rigs', cmd: 'rigs' },
        { label: 'overclock', cmd: 'overclock' },
        { label: 'tinker 1', cmd: 'tinker 1' },
        { label: 'build rig', cmd: 'build rig' },
        { label: 'market', cmd: 'market' },
        { label: 'contracts', cmd: 'contracts' },
        { label: 'ops', cmd: 'ops' },
        { label: 'help', cmd: 'help' },
      ];

  const facility = getFacility(state.facilityId);
  const totals = getFacilityTotals(state);
  const effectiveCap = getEffectiveFacilityPowerCapKw(state);
  const enabledCount = state.rigs.filter((r) => r.enabled).length;
  const coolingSummary = computeFacilityCoolingSummary(state.coolingUnits ?? [], enabledCount);
  const heat = Math.round(state.regulatoryScrutiny);

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="relative bg-[#030A05]/84 backdrop-blur-[2px] border border-green-500/35 rounded-xl flex flex-col h-[calc(100vh-158px)] min-h-[540px] overflow-hidden cursor-text shadow-[0_0_45px_rgba(34,197,94,0.12)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 matrix-scanlines opacity-80"
      />

      {/* Inline Terminal Status Strip */}
      <div className="relative z-10 px-4 py-2 bg-[#041108]/92 border-b border-green-500/25 font-mono text-[11px] text-green-300/75 flex flex-wrap items-center justify-between gap-2 select-none">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-green-400 font-semibold matrix-glow">{facility.name}</span>
          <span className="text-green-700">·</span>
          <span className="tabular-nums text-green-200/90">
            Rigs {totals.rigCount}/{facility.maxRigs}
          </span>
          <span className="text-green-700">·</span>
          <span
            className={
              totals.totalPowerKw > effectiveCap
                ? 'text-rose-400 tabular-nums'
                : 'tabular-nums text-green-200/90'
            }
          >
            Power {totals.totalPowerKw.toFixed(2)}/{effectiveCap} kW
          </span>
          <span className="text-green-700">·</span>
          <span
            className={
              totals.maxNoiseDba > facility.noiseLimitDba
                ? 'text-rose-400 tabular-nums'
                : 'tabular-nums text-green-200/90'
            }
          >
            Noise {totals.maxNoiseDba}/{facility.noiseLimitDba} dBA
          </span>
          <span className="text-green-700">·</span>
          <span className="text-emerald-300 tabular-nums">
            Cool -{coolingSummary.effectiveCoolingPerRigC.toFixed(1)}°C/rig
          </span>
          <span className="text-green-700">·</span>
          <span className="text-green-300 tabular-nums">{state.researchPoints.toFixed(1)} RP</span>
          <span className="text-green-700">·</span>
          <span
            className={
              heat >= 70
                ? 'text-rose-400 font-semibold tabular-nums'
                : heat >= 40
                ? 'text-amber-300 tabular-nums'
                : 'text-green-300/80 tabular-nums'
            }
          >
            Heat {heat}/100
          </span>
        </div>
        {state.pendingEvent ? (
          <span className="text-amber-300 font-semibold">
            Decision Active: {state.pendingEvent.category}
          </span>
        ) : wizard ? (
          <span className="text-amber-300 font-semibold">
            Rig Builder Step: {wizard.step}
          </span>
        ) : tinker ? (
          <span className="text-amber-300 font-semibold">
            Tinker Workbench: Rig #{tinker.rigIndex + 1} ({tinker.slot})
          </span>
        ) : null}
      </div>

      {/* Main Scrollback Output */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto p-5 font-mono text-xs sm:text-[13px] leading-relaxed space-y-1.5"
      >
        {lines.map((ln) => {
          if (ln.kind === 'PRE') {
            return (
              <pre
                key={ln.id}
                className="text-green-300/95 whitespace-pre overflow-x-auto leading-snug py-1"
              >
                {ln.text}
              </pre>
            );
          }
          return (
            <div
              key={ln.id}
              className={
                ln.kind === 'CMD'
                  ? 'text-lime-200 font-semibold pt-1.5'
                  : ln.kind === 'HEAD'
                  ? 'text-green-400 font-bold pt-1 matrix-glow'
                  : ln.kind === 'OK'
                  ? 'text-emerald-300'
                  : ln.kind === 'WARN'
                  ? 'text-amber-300'
                  : ln.kind === 'ERR'
                  ? 'text-rose-400 font-semibold'
                  : 'text-green-100/85'
              }
            >
              {ln.text}
            </div>
          );
        })}
      </div>

      {/* Contextual Clickable Command Chips + Prompt */}
      <div className="relative z-10 bg-[#041108]/92 border-t border-green-500/25 px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {contextualChips.map((chip) => (
            <button
              key={chip.cmd}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                executeCommand(chip.cmd);
                inputRef.current?.focus();
              }}
              className={`px-2.5 py-1 rounded border text-[11px] font-mono transition-colors whitespace-nowrap shrink-0 ${
                state.pendingEvent && ['1', '2', '3'].includes(chip.cmd)
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/45 text-amber-200'
                  : 'bg-[#020804] hover:bg-green-950/70 border-green-500/30 hover:border-green-400/60 text-green-300'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(input);
            setInput('');
          }}
          className="flex items-center gap-2"
        >
          <span
            className={`font-mono text-xs sm:text-sm font-bold select-none shrink-0 ${
              state.pendingEvent ? 'text-amber-300' : 'text-green-400 matrix-glow'
            }`}
          >
            {state.pendingEvent
              ? 'event(decision)>'
              : wizard
              ? `build(${wizard.step.toLowerCase()})>`
              : tinker
              ? `tinker(R${tinker.rigIndex + 1}${tinker.slot === 'MENU' ? '' : `:${tinker.slot}`})>`
              : 'miner@blockworks:~$'}
          </span>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const val = input.trim().toLowerCase();
                if (!val) return;
                const match = TOP_COMMANDS.find((c) => c.startsWith(val));
                if (match) setInput(match + ' ');
              } else if (e.key === 'ArrowUp' && history.length > 0) {
                e.preventDefault();
                const nextIdx = Math.min(history.length - 1, historyIdx + 1);
                setHistoryIdx(nextIdx);
                setInput(history[nextIdx]);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIdx <= 0) {
                  setHistoryIdx(-1);
                  setInput('');
                } else {
                  const nextIdx = historyIdx - 1;
                  setHistoryIdx(nextIdx);
                  setInput(history[nextIdx]);
                }
              }
            }}
            placeholder={
              state.pendingEvent
                ? 'Type 1, 2, or 3 to resolve active event...'
                : wizard
                ? 'Type option number, "back", or "cancel"...'
                : tinker
                ? 'Pick slot or part #, "back", or "done"...'
                : 'Type a command ("step 5", "overclock 125", "tinker 1", "build rig", "help")...'
            }
            className="flex-1 bg-transparent font-mono text-xs sm:text-sm text-green-100 placeholder:text-green-800 caret-green-400 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 rounded bg-green-500 hover:bg-green-400 text-[#020804] font-mono font-bold text-xs transition-colors whitespace-nowrap shrink-0"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
};
