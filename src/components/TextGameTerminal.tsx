import React, { useEffect, useRef, useState } from 'react';
import {
  ACHIEVEMENTS,
  CHALLENGES,
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_PROFILES,
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  FIRMWARE_PROFILE_SPECS,
  GPU_PARTS,
  MARKET_REGIME_SPECS,
  MILESTONES,
  OS_PARTS,
  POOL_MODE_SPECS,
  POWER_CONTRACTS,
  PR_CAMPAIGNS,
  PSU_PARTS,
  RESEARCH_NODES,
  RIG_PRESETS,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from '../data/catalog';
import { formatRivalIntel, formatRivalMarkets, getRivalStrategyLabel, hasRivalIntel } from '../engine/rivals';
import {
  buildSeasonStandings,
  getSeasonStatus,
  SEASON_LENGTH_STEPS,
} from '../engine/leaderboard';
import { formatWorldReport } from '../engine/world';
import { MANUAL_STEP_CAPACITY, MANUAL_STEP_REFILL_SECONDS } from '../engine/manualSteps';
import { getRigChassisIssue } from '../engine/usedMarket';
import {
  BILLING_CYCLE_STEPS,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  computeStepCoinOutput,
  computeWorkloadSummary,
  ensureRigComponentHealth,
  estimateFleetHashIndex,
  formatCustomComponentSummaryLine,
  getAutoSellMultiplier,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getEffectivePartBundle,
  getEmployeeEfficiencyMult,
  getEmpireAlignment,
  getFabEngineeringPointBudget,
  getFacility,
  getFacilityRooms,
  getFacilityTotals,
  getFocusOptionsForDesign,
  getPowerContract,
  getRivalInvestigateCost,
  getStepsUntilNextBill,
  getSysEngineerBonus,
  getUnlockedFabArchitectures,
  getUnlockedFabCategories,
  getUnlockedFabNodes as getResearchFabNodes,
  getUnlockedFabSubFeatures,
  inventoryItemToCustomSpec,
  isFabUnlocked,
  previewCustomComponentDesign,
  resolveCoolerRoomId,
} from '../engine/simulation';
import {
  DESIGN_PROFILE_SPECS,
  FAB_SUBFEATURES,
  formatEngineeringPreviewReport,
  getDefaultComponentParams,
  getPresetEngineeringForProfile,
  NODE_SPECS,
  parseDesignProfile,
} from '../engine/fab';
import { getGlobalHardwarePriceMult } from '../engine/usedMarket';
import {
  previewCoolingUnit,
  previewFacilityMove,
  previewRigEconomics,
} from '../engine/previews';
import {
  CONTEXTUAL_GUIDES,
  evaluateEarlyObjectives,
  getCycleOperatingProfit,
  getEffectiveOnboardingMode,
  getActiveGuidedLesson,
  getUnlockedSystems,
  GuidedSystemId,
  TUTORIAL_TOPICS,
} from '../data/onboarding';
import {
  ChallengeId,
  ChipProcessNode,
  CoinSymbol,
  CustomAsicInventoryItem,
  CustomComponentSpec,
  DesignProfile,
  EmployeeRole,
  FabArchitectureId,
  FabComponentParams,
  FabEngineeringAllocation,
  FabSubFeatureId,
  FirmwareProfile,
  GameState,
  InvestigationStage,
  MarketRegime,
  RaidApproachId,
  MiningAlgorithm,
  PartCategory,
  PendingEvent,
  PoolMode,
  RigBuildConfig,
  RigCustomPartsMap,
  RoomCoolingType,
  ShiftType,
  TaskPriority,
  TechBranch,
  TransactionCategory,
} from '../types/game';
import {
  formatGameDate,
  formatHashrate,
  formatStepLabel,
  formatUsd,
  renderAsciiBar,
} from '../utils/format';
import {
  formatAchievementsReport,
  formatChallengesReport,
  formatCoolingCompare,
  formatMilestonesReport,
  formatPortfolioChart,
  formatPowerReport,
  formatRivalsComparison,
  formatStatsReport,
  formatTransactionHistory,
  formatValuationReport,
  PortfolioChartMetric,
} from './terminal/reports';
import { handleCoinAndExchangeCommand } from './terminal/coinAndExchangeCommands';
import { handleFabCommand } from './terminal/fabCommands';
import { handleOnboardingAndCodexCommand } from './terminal/onboardingAndCodexCommands';
import { handleOpsAndBlackMarketCommand } from './terminal/opsAndBlackMarketCommands';
import { handleRigCommand } from './terminal/rigCommands';
import {
  LogLine,
  padLeft,
  padRight,
  StepBatchResult,
  TerminalCommandContext,
  TerminalCommandTrigger,
  TextGameTerminalProps,
} from './terminal/types';

export type { LogLine, StepBatchResult, TerminalCommandTrigger };

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

type FabDesignStep =
  | 'CATEGORY'
  | 'ARCHITECTURE'
  | 'NODE'
  | 'FOCUS'
  | 'ENGINEERING'
  | 'SUBFEATURE'
  | 'REVIEW';

interface FabDesignWizardState {
  step: FabDesignStep;
  name: string;
  partCategory: PartCategory;
  architecture: FabArchitectureId;
  processNode: ChipProcessNode;
  focus: string;
  branch: TechBranch;
  engineering: FabEngineeringAllocation;
  componentParams: FabComponentParams;
  subFeature: FabSubFeatureId;
  profile: DesignProfile;
}

type CoinCreateStep = 'SYMBOL_NAME' | 'ALGO' | 'ECONOMICS' | 'REQUIREMENTS' | 'CONFIRM';

interface CoinCreateWizardState {
  step: CoinCreateStep;
  symbol: string;
  name: string;
  algorithm: MiningAlgorithm;
  initialLiquidityUsd: number;
  halvingEverySteps: number;
  creatorFeePct: number;
  minVramGb: number;
  minRamGb: number;
  preferredBranch?: TechBranch;
}

const TOP_COMMANDS = [
  'help',
  'codex',
  'wiki',
  'objectives',
  'goals',
  'guide',
  'tutorial',
  'mode',
  'status',
  'step',
  'pause',
  'resume',
  'auto',
  'speed',
  'leaderboard',
  'season',
  'event',
  'decide',
  'build rig',
  'build preset',
  'presets',
  'usedmarket',
  'used',
  'overclock',
  'tinker',
  'rigs',
  'inspect',
  'rig',
  'repair',
  'repaste',
  'retire',
  'backup',
  'salvage',
  'sell',
  'rename',
  'cool',
  'power',
  'facilities',
  'facility',
  'rooms',
  'room',
  'floorplan',
  'move',
  'market',
  'forecast',
  'coins',
  'coin',
  'wallet',
  'exchange',
  'trade',
  'unlock',
  'chart',
  'fab',
  'foundry',
  'world',
  'blockchain',
  'contracts',
  'contract',
  'rivals',
  'ops',
  'blackmarket',
  'staff',
  'hire',
  'train',
  'fire',
  'shift',
  'priority',
  'research',
  'stats',
  'valuation',
  'history',
  'tx',
  'ledger',
  'milestones',
  'achievements',
  'challenges',
  'save',
  'pr',
  'log',
  'dev',
  'clear',
];

export const TextGameTerminal: React.FC<TextGameTerminalProps> = (allProps) => {
  const {
    state,
    commandTrigger,
    onStepSteps,
    onResolveEvent,
    onUnlockCoin,
    onCreatePlayerCoin,
    onDeployRig,
    onBuyUsedListing,
    onRefreshUsedMarket,
    onAddCoolingUnit,
    onToggleCoolingUnit,
    onRemoveCoolingUnit,
    onSelectFacility,
    onBuyFacilityUpgrade,
    onSelectPowerContract,
    onMoveCoolerToRoom,
    onExpandFacilityRooms,
    onHireEmployee,
    onTrainEmployee,
    onFireEmployee,
    onUpdateEmployee,
    onBonusStaff,
    onNegotiateStrike,
    onStartResearch,
    onStartChallenge,
    onLaunchCampaign,
    onAcceptContract,
    onAbandonContract,
    onInvestigateRival,
    onDesignCustomComponent,
    onSaveDraftBlueprint,
    onBackupSave,
    onRestoreBackup,
    onExportSave,
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
    onDevSetInvestigationStage,
    onDevGrantFabBatch,
    onDevFinishFabBatch,
    onDevLaunchCustomCoin,
    onDevRefreshBlackMarket,
    onSetTutorialStep,
    onMarkTutorialSeen,
    onSetOnboardingMode,
    onRevisitGuidedTopic,
    onSetSimSpeed,
    userPaused,
    autoPauseReason,
    autoCountdown,
    onSetUserPaused,
    onActiveModalChange,
    onTinkerPart,
    onTinkerGpu,
  } = allProps;
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [wizard, setWizard] = useState<BuildWizardState | null>(null);
  const [fabWizard, setFabWizard] = useState<FabDesignWizardState | null>(null);
  const [coinWizard, setCoinWizard] = useState<CoinCreateWizardState | null>(null);
  const [tinker, setTinker] = useState<TinkerState | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seenNewsIdsRef = useRef<Set<string>>(new Set());
  const seenEventIdRef = useRef<string | null>(null);
  const lastTutorialStepRef = useRef<number | null>(null);
  const rigLessonActiveRef = useRef(false);
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

  const getUnlockedChassis = () =>
    CHASSIS_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok);

  const getUnlockedComputeFor = (isAsicRack: boolean) =>
    COMPUTE_PARTS.filter(
      (c) =>
        (isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC') &&
        isPartUnlocked(c.researchRequired).ok
    );

  const getUnlockedGpus = () =>
    GPU_PARTS.filter((g) => isPartUnlocked(g.researchRequired).ok);

  const getUnlockedStorage = () =>
    STORAGE_PARTS.filter((s) => isPartUnlocked(s.researchRequired).ok);

  const getUnlockedPsus = () =>
    PSU_PARTS.filter((p) => isPartUnlocked(p.researchRequired).ok);

  const getUnlockedCooling = () =>
    COOLING_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok);

  const getUnlockedOs = () =>
    OS_PARTS.filter((o) => isPartUnlocked(o.researchRequired).ok);

  const getUnlockedCoins = () =>
    (Object.keys(state.coins) as CoinSymbol[]).filter((sym) => state.coins[sym].unlocked);

  const getUnlockedPresets = () =>
    RIG_PRESETS.filter((p) => {
      const ch = CHASSIS_PARTS.find((c) => c.id === p.config.chassisId);
      const comp = COMPUTE_PARTS.find((c) => c.id === p.config.computeId);
      const stor = STORAGE_PARTS.find((s) => s.id === p.config.storageId);
      const psu = PSU_PARTS.find((x) => x.id === p.config.psuId);
      const cool = COOLING_PARTS.find((c) => c.id === p.config.coolingId);
      const os = OS_PARTS.find((o) => o.id === p.config.osId);
      const gpusOk = p.config.gpuIds.every((gid) => {
        const g = GPU_PARTS.find((x) => x.id === gid);
        return Boolean(g && isPartUnlocked(g.researchRequired).ok);
      });
      return Boolean(
        ch &&
          comp &&
          stor &&
          psu &&
          cool &&
          os &&
          isPartUnlocked(ch.researchRequired).ok &&
          isPartUnlocked(comp.researchRequired).ok &&
          gpusOk &&
          isPartUnlocked(stor.researchRequired).ok &&
          isPartUnlocked(psu.researchRequired).ok &&
          isPartUnlocked(cool.researchRequired).ok &&
          isPartUnlocked(os.researchRequired).ok
      );
    });

  const getAccessibleResearch = () =>
    RESEARCH_NODES.filter((n) => {
      const done = state.unlockedResearch.includes(n.id);
      const active = state.activeResearchId === n.id;
      const preOk =
        state.devUnlockAll || n.prereqIds.every((p) => state.unlockedResearch.includes(p));
      return !done && (active || preOk);
    });

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
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    const effectiveCap = getEffectiveFacilityPowerCapKw(state);
    const contract = getPowerContract(state.powerContractId);
    const enabledCount = state.rigs.filter((r) => r.enabled).length;
    const cooling = computeFacilityCoolingSummary(
      state.coolingUnits ?? [],
      enabledCount,
      facility,
      state.facilityUpgrades
    );
    const slotsPct = Math.min(100, (totals.rigCount / Math.max(1, maxRigs)) * 100);
    const powerPct = Math.min(100, (totals.totalPowerKw / Math.max(0.1, effectiveCap)) * 100);
    const noiseCap = facility.noiseLimitDba + (state.facilityUpgrades?.ventilation_ducts ?? 0) * 3;
    const noisePct = Math.min(100, (totals.maxNoiseDba / noiseCap) * 100);
    const stepRev = state.rigs.reduce((s, r) => s + r.lastStepUsd, 0);
    const activeRes = state.activeResearchId
      ? RESEARCH_NODES.find((n) => n.id === state.activeResearchId)
      : null;

    const stepsToBill = getStepsUntilNextBill(state.stepCount);
    const totalListedCoins = Object.keys(state.coins).length;
    const unlockedCoinsCount = (Object.keys(state.coins) as CoinSymbol[]).filter(
      (s) => state.coins[s].unlocked
    ).length;
    const regimeLabel = MARKET_REGIME_SPECS[state.marketRegime].label;
    const alignment = getEmpireAlignment(state);

    const sysBonus = getSysEngineerBonus(state);
    const rigLines = state.rigs.map((rig, i) => {
      computeRigTelemetry(
        rig,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount,
        state.facilityUpgrades
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
                : u.type === 'cool_unit_ind_fan'
                ? 'IND-FAN'
                : u.type === 'cool_unit_ac'
                ? 'AC'
                : u.type === 'cool_unit_liquid'
                ? 'LIQ'
                : u.type === 'cool_unit_chiller'
                ? 'CHIL'
                : 'HVAC';
            return `[C${i + 1}:${label}:${u.enabled ? 'ON' : 'OFF'}]`;
          })
          .join(' ')
      : 'none';

    const contractText = state.activeContract
      ? `${state.activeContract.title} (${Math.min(
          100,
          Math.round((state.activeContract.progress / state.activeContract.targetAmount) * 100)
        )}%, ${state.activeContract.stepsRemaining}st)`
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

    const modBanner =
      (state.activeMarketModifiers ?? []).length > 0
        ? `| ${padRight(
            `ACTIVE EVENTS: ${(state.activeMarketModifiers ?? [])
              .map((m) => `${m.label} (${m.stepsRemaining}st)`)
              .join(', ')}`,
            78
          )} |`
        : null;

    const challengeSpec = state.activeChallengeId
      ? CHALLENGES.find((c) => c.id === state.activeChallengeId)
      : null;
    const onboardingMode = getEffectiveOnboardingMode(state);
    const unlockedSys = getUnlockedSystems(state);
    const earlyObjs = evaluateEarlyObjectives(state);
    const doneObjs = earlyObjs.filter((o) => o.completed).length;
    const nextObj = earlyObjs.find((o) => !o.completed);
    const opsSummaryLine = unlockedSys.ops
      ? `| OPS:     ${padRight(covertSummary || 'Clean institutional baseline', 28)} VAULT: ${padRight(
          `${(state.backupRigs ?? []).length} retired rig(s) | "stats"`,
          32
        )} |`
      : `| MODE:    ${padRight(
          `${onboardingMode} (Gradual progression)`,
          28
        )} VAULT: ${padRight(`${(state.backupRigs ?? []).length} retired | "codex"`, 32)} |`;
    const contractDisplay = unlockedSys.contracts
      ? contractText
      : 'Locked · see "guide"';

    const box = [
      `+================================================================================+`,
      `| ${padRight(
        `${formatStepLabel(state.stepCount)} | ${facility.name}${state.isSandbox ? ' [SANDBOX]' : ''} | Mode: ${onboardingMode} | Seed: ${state.runSeed}`,
        78
      )} |`,
      `| ${padRight(
        `Cash: ${formatUsd(state.cash)}  Rev: ${formatUsd(stepRev)}/st  Coins: ${unlockedCoinsCount}/${totalListedCoins}  RP: ${state.researchPoints.toFixed(1)}`,
        78
      )} |`,
      `| ${padRight(
        `Regime: ${regimeLabel} (${state.regimeStepsRemaining}st)  Heat: ${Math.round(
          state.regulatoryScrutiny
        )}/100  Rep: ${Math.round(state.mediaCredibility)}  Align: ${alignment}`,
        78
      )} |`,
      `| ${padRight(
        `Clock: ${formatGameDate(state.stepCount, state.stepHours ?? 24)}  Speed: ${
          state.stepSeconds ?? 30
        }s/step (${(30 / (state.stepSeconds ?? 30)).toFixed(2)}x)  ${state.stepHours ?? 24}h/step`,
        78
      )} |`,
      ...(modBanner ? [modBanner] : []),
      ...(challengeSpec
        ? [`| ${padRight(`CHALLENGE: ${challengeSpec.title} — ${challengeSpec.description}`, 78)} |`]
        : []),
      ...(nextObj && onboardingMode === 'GUIDED'
        ? [
            `| ${padRight(
              `NEXT OBJECTIVE (${doneObjs}/${earlyObjs.length}): ${nextObj.title}`,
              78
            )} |`,
          ]
        : []),
      `+--------------------------------------------------------------------------------+`,
      `| SLOTS [${renderAsciiBar(slotsPct, 14)}] ${padRight(
        `${totals.rigCount}/${maxRigs}`,
        6
      )} POWER [${renderAsciiBar(powerPct, 14)}] ${padRight(
        `${totals.totalPowerKw.toFixed(2)}/${effectiveCap}kW`,
        13
      )} |`,
      `| NOISE [${renderAsciiBar(noisePct, 14)}] ${padRight(
        `${totals.maxNoiseDba}/${noiseCap}dBA`,
        9
      )} COOLING: ${padRight(
        `-${cooling.effectiveCoolingPerRigC.toFixed(1)}°C/rig (bill in ${stepsToBill}st)`,
        31
      )} |`,
      `+--------------------------------------------------------------------------------+`,
      ...(rigLines.length > 0
        ? rigLines
        : [`|  No rigs deployed. Run "build rig", "usedmarket", or "build preset 1".        |`]),
      `+--------------------------------------------------------------------------------+`,
      `| COOLING: ${padRight(coolList, 28)} CONTRACT: ${padRight(contractDisplay, 29)} |`,
      `| POWER:   ${padRight(contract.name.slice(0, 28), 28)} R&D: ${padRight(
        activeRes
          ? `${activeRes.name.slice(0, 20)} (${Math.round(state.activeResearchProgress)}/${activeRes.costRp})`
          : 'Idle',
        34
      )} |`,
      opsSummaryLine,
      `+================================================================================+`,
    ].join('\n');

    append([{ kind: 'PRE', text: box }]);
  };

  const getWizardTutorialHint = (step: BuildStep): string | null => {
    const workingThroughTutorial = (state.tutorialStep ?? 0) >= 1 && (state.tutorialStep ?? 0) <= 4;
    if (state.guidedOnboarding?.paused || state.guidedOnboarding?.pace === 'FAST' ||
        (!rigLessonActiveRef.current && !workingThroughTutorial)) return null;
    const hints: Record<BuildStep, string> = {
      CHASSIS: 'Compare price, cooling, and the slots your future upgrades will need.',
      COMPUTE: 'Compare power draw and supported algorithms with the output you need from this slot.',
      GPU: 'Add a card if it helps your target coin and fits your power and cooling budget. Type "done" to finish this slot.',
      STORAGE: 'Buy enough memory and storage for the target coin. Check what the extra capacity will earn.',
      PSU: 'Pick a supply marked [FITS]. If you plan to add cards, compare headroom with the extra upfront cost.',
      COOLING: 'Compare cooler cost and fan noise with how much output you could lose to heat.',
      OS: 'Compare hashrate and power multipliers with the price of the kernel.',
      COIN: 'Compare estimated payouts for coins this hardware supports, then check the target’s difficulty in "market" later.',
      CONFIRM: 'Review cash left, estimated earnings after power, and grid load. Type "back" to revise, "cancel" to walk away, or "deploy" to buy.',
    };
    return `GUIDE: ${hints[step]}`;
  };

  const printRigBuildLesson = (title: string) => {
    rigLessonActiveRef.current = true;
    const facility = getFacility(state.facilityId);
    const totals = getFacilityTotals(state);
    const powerCap = getEffectiveFacilityPowerCapKw(state);
    const stepsToBill = getStepsUntilNextBill(state.stepCount);
    const estimatedBill =
      state.currentCycleStats.electricitySpendUsd + totals.stepPowerCostUsd * stepsToBill +
      totals.cycleFixedContractFee + totals.cycleRentUsd + totals.cyclePayrollUsd + totals.cycleMaintenanceUsd;
    const examples = [
      { label: 'KEEP CASH IN RESERVE', computeId: 'cpu_pentium_g620' },
      { label: 'EARN MORE PER RIG SLOT', computeId: 'cpu_i7_920' },
    ];
    append([
      { kind: 'HEAD', text: title },
      { kind: 'TEXT', text: `Your choice: add a rig without draining cash for the next bill or overloading the ${facility.name} grid.` },
      {
        kind: 'TEXT',
        text: 'Type "build rig" to choose parts. Use "back" to compare another setup and "deploy" when you are happy with the quote. Type "usedmarket preview <#>" to compare a used rig.',
      },
      {
        kind: 'PRE',
        text: [
          `  Cash ${formatUsd(state.cash)} · Grid ${totals.totalPowerKw.toFixed(2)}/${powerCap.toFixed(2)} kW · Slots ${totals.rigCount}/${totals.maxRigs}`,
          `  Next bill in ${stepsToBill} steps · estimated ${formatUsd(estimatedBill)} with your current fleet`,
          '',
          '  Both examples use the Mid-Tower ATX Case, no GPU, 4 GB DDR3,',
          '  450 W PSU, stock fans, Desktop OS, and BTC. Only the CPU differs.',
          ...examples.flatMap(({ label, computeId }) => {
            const config = { ...RIG_PRESETS[0].config, name: label, computeId };
            const cost = calculateRigBuildCost(config, state);
            const preview = previewRigEconomics(config, cost, state);
            const issues = [...preview.warnings];
            if (cost > state.cash) issues.push('Insufficient cash');
            else if (state.cash - cost < estimatedBill + preview.powerCostPerStepUsd * stepsToBill) {
              issues.push('Cash left falls below the estimated bill with this rig');
            }
            if (totals.rigCount >= totals.maxRigs) issues.push('No free rig slot');
            return [
              `  ${label} · ${getEffectivePartBundle(config).compute.name}`,
              `    ${formatUsd(cost)} upfront · ${formatUsd(state.cash - cost)} cash left`,
              `    ${formatUsd(preview.netPerStepUsd)}/step after power · +${preview.powerKw.toFixed(2)} kW · ${preview.equilibriumTempC}°C`,
              ...(issues.length ? [`    [!] ${issues.join(' · ')}`] : []),
            ];
          }),
          '',
          '  Estimates use current prices and exclude rent, payroll, and future repairs.',
        ].join('\n'),
      },
    ]);
  };

  const printRigBuildDebrief = (config: RigBuildConfig) => {
    const tutorialStep = state.tutorialStep ?? 0;
    if (!rigLessonActiveRef.current && (tutorialStep < 1 || tutorialStep > 4)) return;
    rigLessonActiveRef.current = false;
    const cost = calculateRigBuildCost(config, state);
    const preview = previewRigEconomics(config, cost, state);
    append([
      {
        kind: 'TEXT',
        text: `Build recap: you traded ${formatUsd(cost)} up front and ${preview.powerKw.toFixed(2)} kW of headroom for an estimated ${formatUsd(preview.netPerStepUsd)}/step after power. Cash left: ${formatUsd(state.cash - cost)}.`,
      },
      {
        kind: 'TEXT',
        text: `Run "step 1", then "inspect ${state.rigs.length + 1}" to check actual revenue and temperature. If cash is tight, wait for the bill before buying again. If heat is tight, compare cooling or a lower clock before adding more load.`,
      },
    ]);
  };

  const printTutorialStep = (stepNum: number) => {
    if (stepNum === 1) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [1/6] — READ YOUR CASH AND THE NEXT BILL' },
        { kind: 'PRE', text: [
          "  Decision: how much cash can you commit before the next billing cycle?",
          "  Run \"status\" to read cash, current rig output, and remaining grid capacity.",
          "  Run \"inspect 1\" to establish a baseline, then use \"step 1\" to see a payout.",
          "  Rent, electricity, payroll, and upkeep settle every 30 steps. \"ledger\" shows completed cycles.",
        ].join('\n') },
        { kind: 'TEXT', text: "Next: inspect your first rig, or type \"tutorial next\" to continue." },
      ]);
      return;
    }

    if (stepNum === 2) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [2/6] — DIAGNOSE BEFORE YOU SPEND' },
        { kind: 'PRE', text: [
          "  Decision: is the rig losing earnings to heat, worn hardware, or a poor coin match?",
          "  Use \"rigs\" to spot trouble, then \"inspect <#>\" for the weakest component.",
          "  Compare \"repaste <#>\", a targeted \"repair <#> <part>\", and a swap in \"tinker <#>\".",
          "  After a change, advance one step and compare output instead of replacing parts immediately.",
        ].join('\n') },
        { kind: 'TEXT', text: "Next: type \"tutorial build\" to compare builds now, or \"tutorial next\"." },
      ]);
      return;
    }

    if (stepNum === 3) {
      printRigBuildLesson('TUTORIAL [3/6] — CHOOSE YOUR NEXT RIG');
      return;
    }

    if (stepNum === 4) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [4/6] — REVIEW THE PURCHASE' },
        { kind: 'PRE', text: [
          "  Decision: will the new rig leave enough cash for the next bill?",
          "  On the build review, compare cost, earnings after power, grid load, and heat.",
          "  A PSU can fit the rig while the combined fleet still overloads the grid.",
          "  Type \"back\" to revise, \"cancel\" to keep your cash, or \"deploy\" to buy.",
        ].join('\n') },
        { kind: 'TEXT', text: "Next: try \"build rig\", or type \"tutorial next\" if you already have a plan." },
      ]);
      return;
    }

    if (stepNum === 5) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [5/6] — CHOOSE WHAT TO INVEST IN NEXT' },
        { kind: 'PRE', text: [
          "  Decision: will the next dollar earn more in research or in the current fleet?",
          "  Use \"power\" and \"cool compare\" when heat or electricity limits production.",
          "  Use \"research\" to compare project cost and what it unlocks. Fund a project you can use.",
          "  Check output and bill headroom before hiring or moving facilities.",
        ].join('\n') },
        { kind: 'TEXT', text: "Next: use \"research\" to price a project, then \"tutorial next\"." },
      ]);
      return;
    }

    if (stepNum === 6) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [6/6] — BUILD THE COMPANY IN STAGES' },
        { kind: 'PRE', text: [
          "  Use \"guide\" to see the next milestone and the systems it opens.",
          "  Contracts follow a fleet inspection and three earning steps. Further systems require business results such as a completed project, facility moves, and profitable billing cycles.",
          "  Use \"tutorial list\" for individual decisions, \"help\" for commands, and \"codex\" for mechanics.",
          "  Underground activity is optional. The foundry path runs through facility expansion and research.",
        ].join('\n') },
        { kind: 'TEXT', text: "Finish: type \"step 1\" or \"tutorial done\". Type \"guide\" to see what to work toward next." },
      ]);
      return;
    }
  };

  interface MatchingFabStockEntry {
    invIdx: number;
    item: CustomAsicInventoryItem;
    spec: CustomComponentSpec;
    availQty: number;
  }

  const getMatchingFabStock = (
    category: PartCategory,
    config: RigBuildConfig
  ): MatchingFabStockEntry[] => {
    const inv = state.fab?.inventory ?? [];
    const bundle = getEffectivePartBundle(config);
    const out: MatchingFabStockEntry[] = [];
    inv.forEach((item, invIdx) => {
      if (item.qty <= 0) return;
      const spec = inventoryItemToCustomSpec(item);
      if (spec.partCategory !== category) return;
      if (category === 'compute') {
        const isAsic = (spec.computeKind ?? 'ASIC') === 'ASIC';
        if (isAsic && bundle.chassis.maxAsics < 1) return;
        if (!isAsic && bundle.chassis.isAsicRack && bundle.chassis.maxGpus === 0) return;
      }
      let usedQty = 0;
      if (category === 'gpu') {
        usedQty = (config.customParts?.gpus ?? []).filter(
          (g) =>
            g &&
            g.blueprintId === spec.blueprintId &&
            Math.abs((g.qualityRoll ?? 1) - (spec.qualityRoll ?? 1)) < 1e-6
        ).length;
      } else if (
        config.customParts?.[category] &&
        config.customParts[category]?.blueprintId === spec.blueprintId &&
        Math.abs((config.customParts[category]?.qualityRoll ?? 1) - (spec.qualityRoll ?? 1)) < 1e-6
      ) {
        usedQty = 1;
      }
      const availQty = item.qty - usedQty;
      if (availQty > 0) {
        out.push({ invIdx, item, spec, availQty });
      }
    });
    return out;
  };

  const printWizardPrompt = (wiz: BuildWizardState) => {
    const { config, step } = wiz;
    const bundle = getEffectivePartBundle(config);
    const chassis = bundle.chassis;
    const facility = getFacility(state.facilityId);
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    const sysBonus = getSysEngineerBonus(state);
    const hwMult = getGlobalHardwarePriceMult(state);
    const priceOf = (cost: number) => Math.round(cost * hwMult);
    const guideTip = getWizardTutorialHint(step);

    if (step === 'CHASSIS') {
      const options = getUnlockedChassis();
      const fabStock = getMatchingFabStock('chassis', config);
      const presetCount = getUnlockedPresets().length;
      const rows = options.map((c, idx) => {
        const cap =
          c.maxAsics >= 1 && c.maxGpus > 0
            ? `Hybrid+${c.maxGpus}G`
            : c.isAsicRack
            ? 'ASIC Rack'
            : `${c.maxGpus} GPU slots`;
        const p = priceOf(c.cost);
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  ${padRight(
          cap,
          12
        )}  -${c.coolingBonus}°C  G${c.generation ?? 1}`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        return `  ${n}. [FAB x${f.availQty}] ${padRight(f.spec.name, 22)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 1/8 — SELECT CHASSIS' },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text:
            presetCount > 0
              ? `Enter chassis number (1..${options.length + fabStock.length}), "preset 1..${presetCount}", or "cancel".`
              : `Enter chassis number (1..${options.length + fabStock.length}) or "cancel".`,
        },
      ]);
      return;
    }

    if (step === 'COMPUTE') {
      const options = getUnlockedComputeFor(chassis.isAsicRack && chassis.maxGpus === 0);
      const filteredCatalog = chassis.maxAsics >= 1 && chassis.maxGpus > 0
        ? [
            ...COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok),
          ]
        : options;
      const fabStock = getMatchingFabStock('compute', config);
      const rows = filteredCatalog.map((c, idx) => {
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        const p = priceOf(c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 34)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  ${padLeft(
          `${c.watts}W`,
          6
        )}  ${padRight(hashLabel, 18)} G${c.generation ?? 1}`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = filteredCatalog.length + idx + 1;
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 25)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        { kind: 'HEAD', text: `RIG BUILDER STEP 2/8 — SELECT COMPUTE (${chassis.name})` },
        {
          kind: 'PRE',
          text:
            rows.length + fabRows.length > 0
              ? [...rows, ...fabRows].join('\n')
              : '  (No unlocked compute modules fit this chassis yet.)',
        },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter compatible compute number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'GPU') {
      const options = getUnlockedGpus();
      const fabStock = getMatchingFabStock('gpu', config);
      const rows = options.map((g, idx) => {
        const eth = g.hashrates.ETHASH
          ? `ETH ${g.hashrates.ETHASH}MH`
          : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
        const p = priceOf(g.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  ${padLeft(
          `${g.watts}W`,
          5
        )}  ${padRight(eth, 13)} G${g.generation ?? 1}`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 21)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `RIG BUILDER STEP 3/8 — ADD GPUs (${config.gpuIds.length}/${chassis.maxGpus} installed)`,
        },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text: 'Type GPU number to add 1 card (or "1 x3" to add 3), "clear", "done" (or "0") to continue, or "back".',
        },
      ]);
      return;
    }

    if (step === 'STORAGE') {
      const options = getUnlockedStorage();
      const fabStock = getMatchingFabStock('storage', config);
      const rows = options.map((s, idx) => {
        const p = priceOf(s.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(s.name, 33)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  +${Math.round(
          s.efficiencyBonus * 100
        )}% eff  ${padRight(s.storageTb >= 1 ? `${s.storageTb}TB` : `${s.ramGb}GB RAM`, 8)}`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 24)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 4/8 — SELECT RAM & STORAGE' },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter storage number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'PSU') {
      const t = computeRigTelemetry(config, facility, state.unlockedResearch, sysBonus);
      const options = getUnlockedPsus();
      const fabStock = getMatchingFabStock('psu', config);
      const rows = options.map((p, idx) => {
        const fit = t.rawWatts <= p.maxWatts ? 'FITS' : 'UNDERPOWERED';
        const costUsd = priceOf(p.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(p.name, 31)} ${padLeft(formatUsd(costUsd, costUsd >= 10_000), 8)}  ${padLeft(
          `${p.maxWatts}W`,
          6
        )}  ${Math.round(p.efficiency * 100)}% eff  [${padRight(fit, 12)}]`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        const maxW = f.spec.maxWatts ?? 1200;
        const fit = t.rawWatts <= maxW ? 'FITS' : 'UNDERPOWERED';
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 22)} ${padLeft('$0', 8)}  ${padLeft(`${maxW}W`, 6)}  [${padRight(fit, 12)}]`;
      });
      append([
        {
          kind: 'HEAD',
          text: `RIG BUILDER STEP 5/8 — SELECT PSU (Current component load: ${t.rawWatts}W)`,
        },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter PSU number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'COOLING') {
      const options = getUnlockedCooling();
      const fabStock = getMatchingFabStock('cooling', config);
      const rows = options.map((c, idx) => {
        const p = priceOf(c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 32)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  -${padLeft(
          String(c.coolingPowerC),
          3
        )}°C  ${padLeft(`${c.noiseDba}dBA`, 5)}`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 23)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 6/8 — SELECT COOLING SYSTEM' },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter cooling number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'OS') {
      const options = getUnlockedOs();
      const fabStock = getMatchingFabStock('os', config);
      const rows = options.map((o, idx) => {
        const p = priceOf(o.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(o.name, 30)} ${padLeft(formatUsd(p, p >= 10_000), 8)}  x${o.hashrateMultiplier.toFixed(
          2
        )} hash  x${o.powerMultiplier.toFixed(2)} pwr`;
      });
      const fabRows = fabStock.map((f, idx) => {
        const n = options.length + idx + 1;
        return `  ${padLeft(String(n), 2)}. [FAB x${f.availQty}] ${padRight(f.spec.name, 21)} ${padLeft('$0', 8)}  ${formatCustomComponentSummaryLine(f.spec)}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 7/8 — SELECT OS KERNEL' },
        { kind: 'PRE', text: [...rows, ...fabRows].join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter OS number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'COIN') {
      const unlockedCoins = getUnlockedCoins();
      const t = computeRigTelemetry(config, facility, state.unlockedResearch, sysBonus);
      const autoSellMult = getAutoSellMultiplier(state);
      const rows = unlockedCoins.map((sym, idx) => {
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
        return `  ${idx + 1}. ${padRight(`${sym} (${c.name})`, 18)} ${padRight(
          c.algorithm,
          8
        )}  Hash: ${padRight(formatHashrate(algoHash, c.algorithm), 11)}  Est: ${padRight(
          formatUsd(est.autoSoldUsd) + '/st',
          12
        )}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 8/8 — SELECT TARGET COIN (AUTO-SELLS EACH STEP)' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text: 'Enter coin number or symbol (e.g. "1" or "BTC"), or "back".',
        },
      ]);
      return;
    }

    // CONFIRM
    const totalCost = calculateRigBuildCost(config, state);
    const activeCount = state.rigs.filter((r) => r.enabled).length + 1;
    const t = computeRigTelemetry(
      config,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      activeCount,
      state.facilityUpgrades
    );
    const { compute, storage, psu, cooling, os } = bundle;
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

    const econ = previewRigEconomics(config, totalCost, state);
    const warnings: string[] = [];
    if (state.cash < totalCost) warnings.push(`Insufficient cash (need ${formatUsd(totalCost)})`);
    if (state.rigs.length >= maxRigs) warnings.push(`Facility full (${maxRigs} max rigs)`);
    if (t.isUnderpowered) warnings.push(`PSU overloaded (${t.rawWatts}W > ${psu.maxWatts}W)`);
    if (!coin.unlocked) warnings.push(`${coin.symbol} is locked (unlock it for ${formatUsd(coin.unlockCostUsd)})`);
    if (t.effectiveHashrate <= 0) warnings.push(`Zero hashrate for ${config.targetCoin} (${t.targetAlgo})`);
    for (const ew of econ.warnings) {
      if (!warnings.includes(ew)) warnings.push(ew);
    }

    const customGpuCount = (config.customParts?.gpus ?? []).filter(Boolean).length;
    const customStockCount =
      (config.customParts?.chassis ? 1 : 0) +
      (config.customParts?.compute ? 1 : 0) +
      customGpuCount +
      (config.customParts?.storage ? 1 : 0) +
      (config.customParts?.psu ? 1 : 0) +
      (config.customParts?.cooling ? 1 : 0) +
      (config.customParts?.os ? 1 : 0);

    const paybackLabel =
      econ.paybackSteps !== null ? `~${econ.paybackSteps} steps` : 'No payback (net <= 0)';
    const netLabel = `${econ.netPerStepUsd >= 0 ? '+' : '-'}${formatUsd(
      Math.abs(econ.netPerStepUsd)
    )}/st`;

    const spec = [
      `+---------------- BUILD SPECIFICATION ----------------+`,
      `| Name:    ${padRight(config.name, 42)} |`,
      `| Chassis: ${padRight(chassis.name, 42)} |`,
      `| Compute: ${padRight(compute.name, 42)} |`,
      `| GPUs:    ${padRight(`${config.gpuIds.length}x installed${customGpuCount > 0 ? ` (${customGpuCount} [FAB])` : ''}`, 42)} |`,
      `| Storage: ${padRight(storage.name, 42)} |`,
      `| PSU:     ${padRight(`${psu.name} (${t.wallWatts}W wall / ${psu.maxWatts}W cap)`, 42)} |`,
      `| Cooling: ${padRight(`${cooling.name} (Est ${t.equilibriumTempC}°C / ${t.noiseDba}dBA)`, 42)} |`,
      `| Tune:    ${padRight(`${config.poolMode ?? 'PPS'} · ${config.firmwareProfile ?? 'BALANCED'} · OC ${config.overclockPct}%`, 42)} |`,
      `| OS/Coin: ${padRight(`${os.name} -> ${config.targetCoin} (${formatHashrate(t.effectiveHashrate, t.targetAlgo)})`, 42)} |`,
      `+------------------ PURCHASE PREVIEW -----------------+`,
      `| Build Cost: ${padRight(`${formatUsd(totalCost)}${customStockCount > 0 ? ` (+${customStockCount} fab stock)` : ''}`, 39)} |`,
      `| Gross Rev:  ${padRight(`${formatUsd(est.autoSoldUsd)}/step`, 39)} |`,
      `| Power Draw: ${padRight(`${econ.powerKw.toFixed(2)} kW (-${formatUsd(econ.powerCostPerStepUsd)}/step)`, 39)} |`,
      `| Net Profit: ${padRight(`${netLabel} · Grid ${econ.projectedTotalKw.toFixed(2)}/${econ.facilityCapKw} kW`, 39)} |`,
      `| Est Payback:${padRight(` ${paybackLabel}`, 39)} |`,
      `+-----------------------------------------------------+`,
    ].join('\n');

    append([
      { kind: 'PRE', text: spec },
      ...(warnings.length > 0
        ? warnings.map((w) => ({ kind: 'WARN' as const, text: `[!] ${w}` }))
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
    const onboardingMode = getEffectiveOnboardingMode(state);
    append([
      {
        kind: 'HEAD',
        text: `HASHRATE // MATRIX TERMINAL (${onboardingMode} MODE · SEED: ${state.runSeed})`,
      },
      {
        kind: 'TEXT',
        text:
          onboardingMode === 'GUIDED'
            ? 'Guided Mode. Type "guide" for the next business milestone, "help" for commands, or "tutorial list" for a lesson.'
            : 'Veteran Mode. Systems use their normal research, facility, and cost requirements. Type "help" or "codex" anytime.',
      },
    ]);
    printStatus();
    if (state.tutorialStep && state.tutorialStep > 0 && !state.guidedOnboarding?.paused) {
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
    if (state.guidedOnboarding?.paused) {
      lastTutorialStepRef.current = 0;
      return;
    }
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
  }, [state.tutorialStep, state.guidedOnboarding?.paused]);

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

  const printContextualGuide = (guideId: string, alert = false) => {
    const guide = CONTEXTUAL_GUIDES[guideId];
    const practice = state.guidedOnboarding?.pace === 'SLOW'
      ? ` Try "${TUTORIAL_TOPICS[guide.topic].nextCommand}".`
      : '';
    append([{
      kind: alert ? 'WARN' : 'TEXT',
      text: `[GUIDE: ${guide.title}] ${guide.body}${practice} (More: "tutorial ${guide.topic}".)`,
    }]);
  };

  const maybeShowContextualGuide = (guideId: string, alert = false) => {
    const guide = CONTEXTUAL_GUIDES[guideId];
    const guided = state.guidedOnboarding;
    if (!guide || getEffectiveOnboardingMode(state) !== 'GUIDED' || guided?.systemStatuses?.[guideId] === 'DISMISSED') return;
    if (guide.system) {
      onMarkTutorialSeen(guideId);
      return;
    }
    if (guided?.paused || (!alert && guided?.pace === 'FAST') || state.seenTutorials?.includes(guideId)) return;
    onMarkTutorialSeen(guideId);
    printContextualGuide(guideId, alert);
  };

  const activeLesson = getActiveGuidedLesson(state);
  useEffect(() => {
    if (!activeLesson || state.guidedOnboarding?.paused || getEffectiveOnboardingMode(state) !== 'GUIDED') return;
    const entry = Object.entries(CONTEXTUAL_GUIDES).find(([, guide]) => guide.system === activeLesson);
    if (!entry) return;
    printContextualGuide(entry[0]);
    append([{ kind: 'TEXT', text: 'Try the lesson in the terminal, then enter "guide learned". Use "guide lesson" to see it again.' }]);
  }, [activeLesson, state.guidedOnboarding?.paused, state.onboardingMode]);

  useEffect(() => {
    if (state.rigs.some((rig) => rig.status === 'OVERHEATED' || rig.status === 'THROTTLED')) {
      maybeShowContextualGuide('ctx_overheat', true);
    }
    if (state.rigs.some((rig) => rig.status === 'NEEDS_REPAIR' || rig.status === 'FAILED')) {
      maybeShowContextualGuide('ctx_low_health', true);
    }
  }, [state.rigs, state.guidedOnboarding, state.onboardingMode]);

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
    onActiveModalChange(wizard || fabWizard || coinWizard ? 'BUILDER' : tinker ? 'TINKER' : null);
  }, [wizard, fabWizard, coinWizard, tinker, onActiveModalChange]);

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
      const unlockedPresets = getUnlockedPresets();
      const idx = parseInt(parts[1] || '1', 10) - 1;
      const preset = unlockedPresets[idx];
      if (!preset) {
        append([{ kind: 'ERR', text: `Usage: preset <1..${unlockedPresets.length}>` }]);
        return;
      }
      const nextWiz: BuildWizardState = {
        step: 'CONFIRM',
        config: {
          ...preset.config,
          targetCoin: state.coins[preset.config.targetCoin]?.unlocked
            ? preset.config.targetCoin
            : 'BTC',
          name: `${preset.label} #${state.rigs.length + 1}`,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    const bundle = getEffectivePartBundle(wiz.config);
    const chassis = bundle.chassis;

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
      const options = getUnlockedChassis();
      const fabStock = getMatchingFabStock('chassis', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}), gpus: [] };
      let isAsicOnly = false;
      let isHybrid = false;
      if (pickedFab) {
        nextCustomParts.chassis = pickedFab.spec;
        isAsicOnly = Boolean(pickedFab.spec.isAsicRack && (pickedFab.spec.maxGpus ?? 0) === 0);
        isHybrid = Boolean((pickedFab.spec.maxAsics ?? 0) >= 1 && (pickedFab.spec.maxGpus ?? 0) > 0);
      } else {
        delete nextCustomParts.chassis;
        isHybrid = Boolean(pickedCatalog && pickedCatalog.maxAsics >= 1 && pickedCatalog.maxGpus > 0);
        isAsicOnly = Boolean(pickedCatalog?.isAsicRack && (pickedCatalog?.maxGpus ?? 0) === 0);
      }
      // Clear incompatible custom compute if switching chassis compatibility
      if (nextCustomParts.compute) {
        const compIsAsic = (nextCustomParts.compute.computeKind ?? 'ASIC') === 'ASIC';
        const nextMaxAsics = pickedFab ? pickedFab.spec.maxAsics ?? 0 : pickedCatalog?.maxAsics ?? 0;
        if ((compIsAsic && nextMaxAsics < 1) || (!compIsAsic && isAsicOnly)) {
          delete nextCustomParts.compute;
        }
      }
      const firstCompute = isHybrid
        ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok)[0]
        : getUnlockedComputeFor(isAsicOnly)[0];
      const nextWiz: BuildWizardState = {
        step: 'COMPUTE',
        config: {
          ...wiz.config,
          chassisId: pickedCatalog ? pickedCatalog.id : CHASSIS_PARTS[0].id,
          gpuIds: [],
          computeId: firstCompute?.id ?? wiz.config.computeId,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COMPUTE') {
      const isAsicOnly = Boolean(chassis.isAsicRack && chassis.maxGpus === 0);
      const options =
        chassis.maxAsics >= 1 && chassis.maxGpus > 0
          ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok)
          : getUnlockedComputeFor(isAsicOnly);
      const fabStock = getMatchingFabStock('compute', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}) };
      if (pickedFab) {
        nextCustomParts.compute = pickedFab.spec;
      } else {
        delete nextCustomParts.compute;
      }
      const nextWiz: BuildWizardState = {
        step: chassis.maxGpus > 0 ? 'GPU' : 'STORAGE',
        config: {
          ...wiz.config,
          computeId: pickedCatalog ? pickedCatalog.id : COMPUTE_PARTS[0].id,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'GPU') {
      if (low === 'clear') {
        const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}), gpus: [] };
        const nextWiz: BuildWizardState = {
          ...wiz,
          config: { ...wiz.config, gpuIds: [], customParts: nextCustomParts },
        };
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
      const options = getUnlockedGpus();
      const fabStock = getMatchingFabStock('gpu', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([
          {
            kind: 'ERR',
            text: `Enter GPU number (1..${options.length + fabStock.length}), "clear", or "done".`,
          },
        ]);
        return;
      }
      const qtyMatch = parts[1]?.match(/^x?(\d+)$/);
      const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
      const slotsLeft = chassis.maxGpus - wiz.config.gpuIds.length;
      if (slotsLeft <= 0) {
        append([{ kind: 'WARN', text: 'Chassis GPU slots are full. Type "done" to continue.' }]);
        return;
      }
      const existingCustomGpus: (CustomComponentSpec | null)[] = wiz.config.gpuIds.map(
        (_, i) => wiz.config.customParts?.gpus?.[i] ?? null
      );
      if (pickedFab) {
        const toAdd = Math.min(slotsLeft, qty, pickedFab.availQty);
        const nextGpus = [...wiz.config.gpuIds, ...Array(toAdd).fill(GPU_PARTS[0].id)];
        const nextCustomGpus = [...existingCustomGpus, ...Array(toAdd).fill(pickedFab.spec)];
        const nextWiz: BuildWizardState = {
          step: nextGpus.length >= chassis.maxGpus ? 'STORAGE' : 'GPU',
          config: {
            ...wiz.config,
            gpuIds: nextGpus,
            customParts: { ...(wiz.config.customParts ?? {}), gpus: nextCustomGpus },
          },
        };
        setWizard(nextWiz);
        append([{ kind: 'OK', text: `Added ${toAdd}x [FAB] ${pickedFab.spec.name}.` }]);
        printWizardPrompt(nextWiz);
        return;
      }
      const toAdd = Math.min(slotsLeft, qty);
      const nextGpus = [...wiz.config.gpuIds, ...Array(toAdd).fill(pickedCatalog!.id)];
      const nextCustomGpus = [...existingCustomGpus, ...Array(toAdd).fill(null)];
      const nextWiz: BuildWizardState = {
        step: nextGpus.length >= chassis.maxGpus ? 'STORAGE' : 'GPU',
        config: {
          ...wiz.config,
          gpuIds: nextGpus,
          customParts: { ...(wiz.config.customParts ?? {}), gpus: nextCustomGpus },
        },
      };
      setWizard(nextWiz);
      append([{ kind: 'OK', text: `Added ${toAdd}x ${pickedCatalog!.name}.` }]);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'STORAGE') {
      const options = getUnlockedStorage();
      const fabStock = getMatchingFabStock('storage', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}) };
      if (pickedFab) nextCustomParts.storage = pickedFab.spec;
      else delete nextCustomParts.storage;
      const nextWiz: BuildWizardState = {
        step: 'PSU',
        config: {
          ...wiz.config,
          storageId: pickedCatalog ? pickedCatalog.id : STORAGE_PARTS[0].id,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'PSU') {
      const options = getUnlockedPsus();
      const fabStock = getMatchingFabStock('psu', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}) };
      if (pickedFab) nextCustomParts.psu = pickedFab.spec;
      else delete nextCustomParts.psu;
      const nextWiz: BuildWizardState = {
        step: 'COOLING',
        config: {
          ...wiz.config,
          psuId: pickedCatalog ? pickedCatalog.id : PSU_PARTS[0].id,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COOLING') {
      const options = getUnlockedCooling();
      const fabStock = getMatchingFabStock('cooling', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}) };
      if (pickedFab) nextCustomParts.cooling = pickedFab.spec;
      else delete nextCustomParts.cooling;
      const nextWiz: BuildWizardState = {
        step: 'OS',
        config: {
          ...wiz.config,
          coolingId: pickedCatalog ? pickedCatalog.id : COOLING_PARTS[0].id,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'OS') {
      const options = getUnlockedOs();
      const fabStock = getMatchingFabStock('os', wiz.config);
      const idx = parseInt(parts[0], 10) - 1;
      const pickedCatalog = idx >= 0 && idx < options.length ? options[idx] : undefined;
      const pickedFab = idx >= options.length ? fabStock[idx - options.length] : undefined;
      if (!pickedCatalog && !pickedFab) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length + fabStock.length}.` }]);
        return;
      }
      const nextCustomParts: RigCustomPartsMap = { ...(wiz.config.customParts ?? {}) };
      if (pickedFab) nextCustomParts.os = pickedFab.spec;
      else delete nextCustomParts.os;
      const nextWiz: BuildWizardState = {
        step: 'COIN',
        config: {
          ...wiz.config,
          osId: pickedCatalog ? pickedCatalog.id : OS_PARTS[0].id,
          customParts: nextCustomParts,
        },
      };
      setWizard(nextWiz);
      printWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'COIN') {
      const unlockedCoins = getUnlockedCoins();
      const asNum = parseInt(parts[0], 10);
      const picked =
        !isNaN(asNum) && unlockedCoins[asNum - 1]
          ? unlockedCoins[asNum - 1]
          : unlockedCoins.find((s) => s.toLowerCase() === parts[0]);
      if (!picked) {
        append([
          {
            kind: 'ERR',
            text: `Enter an unlocked coin number (1..${unlockedCoins.length}) or symbol (e.g. ${unlockedCoins[0] ?? 'BTC'}).`,
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
        const fitIssue = getRigChassisIssue(wiz.config);
        if (fitIssue) { append([{ kind: 'ERR', text: fitIssue }]); return; }
        const ok = onDeployRig(wiz.config);
        if (ok) {
          setWizard(null);
          append([{ kind: 'OK', text: `Deployed "${wiz.config.name}" to facility.` }]);
          printRigBuildDebrief(wiz.config);
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

  const getUnlockedFabNodes = (state: GameState, category: PartCategory) => {
    const nodes = getResearchFabNodes(state, category);
    return getUnlockedSystems(state).gen7 ? nodes : nodes.filter((node) => node !== 'photonic');
  };

  const getDefaultFabBlueprintName = (category: PartCategory): string => {
    const num = (state.fab?.blueprints.length ?? 0) + 1;
    const prefixMap: Record<PartCategory, string> = {
      compute: 'ApexSilicon',
      gpu: 'HeliosGPU',
      chassis: 'TitanFrame',
      storage: 'PetavaultNVMe',
      psu: 'VoltGaN',
      cooling: 'CryoLoop',
      os: 'BareHashOS',
    };
    return `${prefixMap[category]}-${num}`;
  };

  const printFabWizardPrompt = (wiz: FabDesignWizardState) => {
    const budget = getFabEngineeringPointBudget(state);

    if (wiz.step === 'CATEGORY') {
      const cats = getUnlockedFabCategories(state);
      const rows = cats.map(
        (c, idx) =>
          `  ${idx + 1}. [${padRight(c.shortLabel, 7)}] ${padRight(c.label, 38)} ${c.summary}`
      );
      append([
        { kind: 'HEAD', text: 'FOUNDRY DESIGN WIZARD STEP 1/7 — SELECT COMPONENT SUBSYSTEM' },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text: `Enter subsystem number (1..${cats.length}) or "cancel". (R&D unlocks additional categories like GPUs.)`,
        },
      ]);
      return;
    }

    if (wiz.step === 'ARCHITECTURE') {
      const archs = getUnlockedFabArchitectures(state, wiz.partCategory);
      const rows = archs.map(
        (a, idx) => `  ${idx + 1}. ${padRight(a.label, 34)} ${a.blurb}`
      );
      append([
        {
          kind: 'HEAD',
          text: `FOUNDRY DESIGN STEP 2/7 — SELECT ARCHITECTURE (${wiz.partCategory.toUpperCase()})`,
        },
        { kind: 'PRE', text: rows.length > 0 ? rows.join('\n') : '  (No unlocked architectures for this subsystem yet.)' },
        { kind: 'TEXT', text: `Enter architecture number (1..${archs.length}), "back", or "cancel".` },
      ]);
      return;
    }

    if (wiz.step === 'NODE') {
      const nodes = getUnlockedFabNodes(state, wiz.partCategory);
      const rows = nodes.map((n, idx) => {
        const s = NODE_SPECS[n];
        const preview = previewCustomComponentDesign(state, {
          name: wiz.name,
          partCategory: wiz.partCategory,
          architecture: wiz.architecture,
          processNode: n,
          focus: wiz.focus,
          branch: n === 'photonic' ? 'PHOTONIC' : wiz.branch,
          engineering: wiz.engineering,
          componentParams: wiz.componentParams,
          subFeature: wiz.subFeature,
          profile: wiz.profile,
        });
        return `  ${idx + 1}. ${padRight(n, 8)} ${padRight(s.gradeLabel, 24)} NRE:${padLeft(
          formatUsd(preview.nreCostUsd, preview.nreCostUsd >= 10_000),
          8
        )}  Unit:${padLeft(formatUsd(preview.spec.unitCostUsd, preview.spec.unitCostUsd >= 10_000), 8)}  ${preview.waferSteps} fab pts`;
      });
      append([
        {
          kind: 'HEAD',
          text: `FOUNDRY DESIGN STEP 3/7 — PROCESS NODE / PRECISION GRADE (${wiz.partCategory.toUpperCase()})`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text: `Enter node number (1..${nodes.length}) or node name ("7nm".."photonic"), "back", or "cancel".`,
        },
      ]);
      return;
    }

    if (wiz.step === 'FOCUS') {
      const focuses = getFocusOptionsForDesign(wiz.partCategory, wiz.architecture);
      const rows = focuses.map(
        (f, idx) => `  ${idx + 1}. ${padRight(f.label, 42)} ${f.blurb}`
      );
      append([
        {
          kind: 'HEAD',
          text: `FOUNDRY DESIGN STEP 4/7 — SPECIALIZATION FOCUS (${wiz.processNode})`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: `Enter specialization number (1..${focuses.length}), "back", or "cancel".` },
      ]);
      return;
    }

    if (wiz.step === 'ENGINEERING') {
      const e = wiz.engineering;
      const used = e.density + e.efficiency + e.thermals + e.reliability;
      const rem = Math.max(0, budget - used);
      const bar5 = (v: number) => `${'#'.repeat(v)}${'.'.repeat(5 - v)}`;
      const preview = previewCustomComponentDesign(state, {
        name: wiz.name,
        partCategory: wiz.partCategory,
        architecture: wiz.architecture,
        processNode: wiz.processNode,
        focus: wiz.focus,
        branch: wiz.branch,
        engineering: wiz.engineering,
        componentParams: wiz.componentParams,
        subFeature: wiz.subFeature,
        profile: wiz.profile,
      });
      const cp = preview.componentParams;
      const branchHint =
        wiz.branch === 'QUANTUM'
          ? `  Branch Param (QUANTUM): qubits=${cp.logicalQubits ?? 512}, cryoTarget=${cp.cryoTargetMk ?? 20}mK`
          : wiz.branch === 'PHOTONIC'
          ? `  Branch Param (PHOTONIC): wdm=${cp.wdmChannels ?? 16}ch, lanes=${cp.waveguideLanes ?? 24}, ${cp.laserWavelengthNm ?? 1550}nm`
          : `  Branch Param (${wiz.branch}): vram=${cp.vramGb ?? 16}GB, phases=${cp.railPhases ?? 12}, ecc=${cp.eccDepth ?? 2}`;
      const matrix = [
        `  Tech Branch: ${wiz.branch}   Manufacturability: ${preview.manufacturabilityPct}%   Points Used: ${used}/${budget} (${rem} left, max 5/axis)`,
        branchHint,
        ``,
        `  1. density     [${bar5(e.density)}] ${e.density}/5   Die / Slot / Output Density (+hash/TB/watts cap)`,
        `  2. efficiency  [${bar5(e.efficiency)}] ${e.efficiency}/5   Perf-per-Watt / Conversion Loss Reduction`,
        `  3. thermals    [${bar5(e.thermals)}] ${e.thermals}/5   Heat Dissipation (-°C) & Acoustic Dampening (-dBA)`,
        `  4. reliability [${bar5(e.reliability)}] ${e.reliability}/5   Wear Resistance (+durability) & Silicon Grade Floor`,
        ``,
        `  LIVE PROJECTED SPEC: ${formatEngineeringPreviewReport(preview)}`,
        `  Wear Resist: +${Math.round((preview.spec.wearResistance ?? 0) * 100)}% | Bias: ${cp.voltageBiasPct ?? 100}%V / ${cp.clockBiasPct ?? 100}%Clk`,
      ].join('\n');
      append([
        { kind: 'HEAD', text: 'FOUNDRY DESIGN STEP 5/7 — ENGINEERING & ARCHITECTURE MATRIX' },
        { kind: 'PRE', text: matrix },
        {
          kind: 'TEXT',
          text: 'Cmds: "alloc <d> <e> <t> <r>", "<density|eff|therm|qa> <+1|-1|N>", "branch <silicon|quantum|photonic>", "qubits|cryo|wdm|lanes|vram|phases|ecc <N>", "preset <perf|balanced|eff|compact>", "done", "back".',
        },
      ]);
      return;
    }

    if (wiz.step === 'SUBFEATURE') {
      const features = getUnlockedFabSubFeatures(state);
      const rows = features.map((f, idx) => {
        const fee = f.nreAddUsd > 0 ? `+${formatUsd(f.nreAddUsd)} NRE` : 'Included';
        return `  ${idx + 1}. ${padRight(f.label, 35)} ${padLeft(fee, 11)}  ${f.blurb}`;
      });
      append([
        { kind: 'HEAD', text: 'FOUNDRY DESIGN STEP 6/7 — TOPOLOGY & MATERIAL ENHANCEMENT' },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: `Enter enhancement number (1..${features.length}), "back", or "cancel".` },
      ]);
      return;
    }

    // REVIEW
    const preview = previewCustomComponentDesign(state, {
      name: wiz.name,
      partCategory: wiz.partCategory,
      architecture: wiz.architecture,
      processNode: wiz.processNode,
      focus: wiz.focus,
      branch: wiz.branch,
      engineering: wiz.engineering,
      componentParams: wiz.componentParams,
      subFeature: wiz.subFeature,
      profile: wiz.profile,
    });
    const archLabel =
      getUnlockedFabArchitectures(state, wiz.partCategory).find((a) => a.id === wiz.architecture)
        ?.label ?? wiz.architecture;
    const focusLabel =
      getFocusOptionsForDesign(wiz.partCategory, wiz.architecture).find((f) => f.id === wiz.focus)
        ?.label ?? wiz.focus;
    const subLabel = FAB_SUBFEATURES.find((f) => f.id === wiz.subFeature)?.label ?? wiz.subFeature;
    const e = wiz.engineering;
    const usedPts = e.density + e.efficiency + e.thermals + e.reliability;

    const dossier = [
      `+------------------ ENGINEERING TAPE-OUT DOSSIER ------------------+`,
      `| Blueprint Name: ${padRight(wiz.name, 48)} |`,
      `| Subsystem:      ${padRight(`${wiz.partCategory.toUpperCase()} · ${archLabel} (${preview.branch})`, 48)} |`,
      `| Process/Grade:  ${padRight(NODE_SPECS[wiz.processNode].gradeLabel, 48)} |`,
      `| Focus:          ${padRight(focusLabel, 48)} |`,
      `| Eng Allocation: ${padRight(`D:${e.density} E:${e.efficiency} T:${e.thermals} R:${e.reliability} (${usedPts}/${budget} pts)`, 48)} |`,
      `| Enhancement:    ${padRight(subLabel, 48)} |`,
      `| Macro Profile:  ${padRight(`${DESIGN_PROFILE_SPECS[wiz.profile].label} · Mfg ${preview.manufacturabilityPct}%`, 48)} |`,
      `+----------------------- TELEMETRY & ECONOMICS --------------------+`,
      `| Output Spec:    ${padRight(formatCustomComponentSummaryLine(preview.spec), 48)} |`,
      `| First Silicon:  ${padRight(`Grade ${preview.qualityGrade} (x${preview.qualityMult.toFixed(2)}) · +${Math.round((preview.spec.wearResistance ?? 0) * 100)}% wear resist`, 48)} |`,
      `| Tape-Out NRE:   ${padRight(`${formatUsd(preview.nreCostUsd)} (Cash: ${formatUsd(state.cash)})`, 48)} |`,
      `| Unit Fab Cost:  ${padRight(`${formatUsd(preview.spec.unitCostUsd)}/ea · ${preview.waferSteps} wafer pts`, 48)} |`,
      `| Export Value:   ${padRight(`${formatUsd(preview.spec.wholesaleValueUsd)}/ea wholesale`, 48)} |`,
      `+------------------------------------------------------------------+`,
    ].join('\n');

    append([
      { kind: 'PRE', text: dossier },
      ...(preview.ok && state.cash >= preview.nreCostUsd
        ? [{ kind: 'OK' as const, text: 'Design validated. Ready for cleanroom mask tape-out!' }]
        : [
            {
              kind: 'WARN' as const,
              text: !preview.ok
                ? `[!] ${preview.reason ?? 'Invalid design configuration.'}`
                : `[!] Insufficient cash for NRE tape-out (need ${formatUsd(preview.nreCostUsd)}).`,
            },
          ]),
      {
        kind: 'TEXT',
        text: 'Type "tapeout" (pay NRE & finish), "draft" (save draft free), "name <NewName>", "profile <perf|balanced|eff|compact>", "back", or "cancel".',
      },
    ]);
  };

  const handleFabWizardInput = (raw: string, wiz: FabDesignWizardState) => {
    const trimmed = raw.trim();
    const low = trimmed.toLowerCase();
    const parts = low.split(/\s+/);
    const budget = getFabEngineeringPointBudget(state);

    if (low === 'cancel' || low === 'exit' || low === 'quit') {
      setFabWizard(null);
      append([{ kind: 'WARN', text: 'Foundry engineering wizard cancelled.' }]);
      return;
    }

    if (low === 'back') {
      const order: FabDesignStep[] = [
        'CATEGORY',
        'ARCHITECTURE',
        'NODE',
        'FOCUS',
        'ENGINEERING',
        'SUBFEATURE',
        'REVIEW',
      ];
      const prevIdx = Math.max(0, order.indexOf(wiz.step) - 1);
      const nextWiz: FabDesignWizardState = { ...wiz, step: order[prevIdx] };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'CATEGORY') {
      const cats = getUnlockedFabCategories(state);
      const idx = parseInt(parts[0], 10) - 1;
      const picked =
        cats[idx] ??
        cats.find((c) => c.id === low || c.shortLabel.toLowerCase() === low);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter subsystem number (1..${cats.length}) or name.` }]);
        return;
      }
      const archs = getUnlockedFabArchitectures(state, picked.id);
      const nextArch = archs[0]?.id ?? 'ASIC_BLADE';
      const nodes = getUnlockedFabNodes(state, picked.id);
      const nextNode = nodes[0] ?? '7nm';
      const focuses = getFocusOptionsForDesign(picked.id, nextArch);
      const nextBranch: TechBranch = nextNode === 'photonic' ? 'PHOTONIC' : 'SILICON';
      const nextWiz: FabDesignWizardState = {
        ...wiz,
        step: 'ARCHITECTURE',
        partCategory: picked.id,
        architecture: nextArch,
        processNode: nextNode,
        focus: focuses[0]?.id ?? 'SHA256',
        branch: nextBranch,
        componentParams: getDefaultComponentParams(picked.id, nextNode, nextBranch),
        name: getDefaultFabBlueprintName(picked.id),
      };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'ARCHITECTURE') {
      const archs = getUnlockedFabArchitectures(state, wiz.partCategory);
      const idx = parseInt(parts[0], 10) - 1;
      const picked = archs[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter architecture number (1..${archs.length}), "back", or "cancel".` }]);
        return;
      }
      const focuses = getFocusOptionsForDesign(wiz.partCategory, picked.id);
      const nextWiz: FabDesignWizardState = {
        ...wiz,
        step: 'NODE',
        architecture: picked.id,
        focus: focuses[0]?.id ?? wiz.focus,
      };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'NODE') {
      const nodes = getUnlockedFabNodes(state, wiz.partCategory);
      const idx = parseInt(parts[0], 10) - 1;
      const picked = nodes[idx] ?? nodes.find((n) => n === parts[0]);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter node number (1..${nodes.length}) or unlocked node name.` }]);
        return;
      }
      const nextBranch: TechBranch = picked === 'photonic' ? 'PHOTONIC' : wiz.branch === 'PHOTONIC' ? 'SILICON' : wiz.branch;
      if (picked === 'photonic') maybeShowContextualGuide('ctx_gen7');
      const nextWiz: FabDesignWizardState = {
        ...wiz,
        step: 'FOCUS',
        processNode: picked,
        branch: nextBranch,
        componentParams: getDefaultComponentParams(wiz.partCategory, picked, nextBranch),
      };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'FOCUS') {
      const focuses = getFocusOptionsForDesign(wiz.partCategory, wiz.architecture);
      const idx = parseInt(parts[0], 10) - 1;
      const picked =
        focuses[idx] ?? focuses.find((f) => f.id.toLowerCase() === parts[0]);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter specialization number (1..${focuses.length}), "back", or "cancel".` }]);
        return;
      }
      const nextWiz: FabDesignWizardState = {
        ...wiz,
        step: 'ENGINEERING',
        focus: picked.id,
      };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    if (wiz.step === 'ENGINEERING') {
      if (low === 'done' || low === 'next' || low === '0') {
        const nextWiz: FabDesignWizardState = { ...wiz, step: 'SUBFEATURE' };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }
      if (parts[0] === 'branch') {
        const branchMap: Record<string, TechBranch> = {
          silicon: 'SILICON',
          quantum: 'QUANTUM',
          photonic: 'PHOTONIC',
        };
        const nextBranch = branchMap[parts[1]];
        if (!nextBranch) {
          append([{ kind: 'ERR', text: 'Usage: branch <silicon|quantum|photonic>' }]);
          return;
        }
        const gen7Open = state.devUnlockAll || getUnlockedSystems(state).gen7;
        if (nextBranch !== 'SILICON' && !gen7Open) {
          append([{ kind: 'ERR', text: `Gen-7 foundry design is locked. ${getUnlockedSystems(state).unlockNotes.gen7}.` }]);
          return;
        }
        if (nextBranch !== 'SILICON') maybeShowContextualGuide('ctx_gen7');
        const nextWiz: FabDesignWizardState = {
          ...wiz,
          branch: nextBranch,
          componentParams: {
            ...getDefaultComponentParams(wiz.partCategory, wiz.processNode, nextBranch),
            ...wiz.componentParams,
            branch: nextBranch,
          },
        };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }
      if (['qubits', 'cryo', 'wdm', 'lanes', 'wavelength', 'vram', 'phases', 'ecc', 'voltage', 'clock'].includes(parts[0])) {
        const val = parseInt(parts[1] ?? '', 10);
        if (isNaN(val)) {
          append([{ kind: 'ERR', text: `Usage: ${parts[0]} <numeric value>` }]);
          return;
        }
        const cp = { ...wiz.componentParams };
        if (parts[0] === 'qubits') cp.logicalQubits = Math.max(128, Math.min(2048, val));
        if (parts[0] === 'cryo') cp.cryoTargetMk = Math.max(10, Math.min(100, val));
        if (parts[0] === 'wdm') cp.wdmChannels = Math.max(4, Math.min(64, val));
        if (parts[0] === 'lanes') cp.waveguideLanes = Math.max(4, Math.min(64, val));
        if (parts[0] === 'wavelength') cp.laserWavelengthNm = val === 1310 ? 1310 : 1550;
        if (parts[0] === 'vram') cp.vramGb = Math.max(4, Math.min(192, val));
        if (parts[0] === 'phases') cp.railPhases = Math.max(4, Math.min(24, val));
        if (parts[0] === 'ecc') cp.eccDepth = Math.max(1, Math.min(5, val));
        if (parts[0] === 'voltage') cp.voltageBiasPct = Math.max(85, Math.min(115, val));
        if (parts[0] === 'clock') cp.clockBiasPct = Math.max(85, Math.min(115, val));
        const nextWiz: FabDesignWizardState = { ...wiz, componentParams: cp };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }
      if (parts[0] === 'preset') {
        const prof = parseDesignProfile(parts[1]);
        if (!prof) {
          append([{ kind: 'ERR', text: 'Usage: preset <perf|balanced|eff|compact>' }]);
          return;
        }
        const nextWiz: FabDesignWizardState = {
          ...wiz,
          profile: prof,
          engineering: getPresetEngineeringForProfile(prof, budget),
        };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }
      if (parts[0] === 'alloc') {
        const d = parseInt(parts[1] ?? '', 10);
        const e = parseInt(parts[2] ?? '', 10);
        const t = parseInt(parts[3] ?? '', 10);
        const r = parseInt(parts[4] ?? '', 10);
        if ([d, e, t, r].some((v) => isNaN(v) || v < 0 || v > 5)) {
          append([{ kind: 'ERR', text: 'Usage: alloc <0..5> <0..5> <0..5> <0..5>' }]);
          return;
        }
        if (d + e + t + r > budget) {
          append([{ kind: 'ERR', text: `Total exceeds engineering budget (${d + e + t + r}/${budget} pts).` }]);
          return;
        }
        const nextWiz: FabDesignWizardState = {
          ...wiz,
          engineering: { density: d, efficiency: e, thermals: t, reliability: r },
        };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }

      const axisMap: Record<string, keyof FabEngineeringAllocation> = {
        '1': 'density',
        d: 'density',
        dens: 'density',
        density: 'density',
        '2': 'efficiency',
        e: 'efficiency',
        eff: 'efficiency',
        efficiency: 'efficiency',
        '3': 'thermals',
        t: 'thermals',
        therm: 'thermals',
        thermal: 'thermals',
        thermals: 'thermals',
        '4': 'reliability',
        r: 'reliability',
        rel: 'reliability',
        qa: 'reliability',
        reliability: 'reliability',
      };
      const axis = axisMap[parts[0]];
      if (axis) {
        const modToken = parts[1] || '+1';
        let nextVal = wiz.engineering[axis];
        if (modToken === '+1' || modToken === '+') nextVal += 1;
        else if (modToken === '-1' || modToken === '-') nextVal -= 1;
        else {
          const parsed = parseInt(modToken, 10);
          if (isNaN(parsed)) {
            append([{ kind: 'ERR', text: `Usage: ${parts[0]} <+1|-1|0..5>` }]);
            return;
          }
          nextVal = parsed;
        }
        nextVal = Math.max(0, Math.min(5, nextVal));
        const nextEng: FabEngineeringAllocation = { ...wiz.engineering, [axis]: nextVal };
        const sum = nextEng.density + nextEng.efficiency + nextEng.thermals + nextEng.reliability;
        if (sum > budget) {
          append([
            {
              kind: 'ERR',
              text: `Insufficient engineering points (${sum}/${budget}). Lower another axis first.`,
            },
          ]);
          return;
        }
        const nextWiz: FabDesignWizardState = { ...wiz, engineering: nextEng };
        setFabWizard(nextWiz);
        printFabWizardPrompt(nextWiz);
        return;
      }

      append([
        {
          kind: 'ERR',
          text: 'Use "alloc <d> <e> <t> <r>", "<density|eff|therm|qa> <+1|-1|N>", "branch <silicon|quantum|photonic>", "preset <perf|balanced|eff|compact>", or "done".',
        },
      ]);
      return;
    }

    if (wiz.step === 'SUBFEATURE') {
      const features = getUnlockedFabSubFeatures(state);
      const idx = parseInt(parts[0], 10) - 1;
      const picked = features[idx] ?? features.find((f) => f.id.toLowerCase() === parts[0]);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter enhancement number (1..${features.length}), "back", or "cancel".` }]);
        return;
      }
      const nextWiz: FabDesignWizardState = {
        ...wiz,
        step: 'REVIEW',
        subFeature: picked.id,
      };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }

    // REVIEW
    if (parts[0] === 'name') {
      const nextName = trimmed.slice(4).trim().slice(0, 28);
      if (!nextName) {
        append([{ kind: 'ERR', text: 'Usage: name <BlueprintName>' }]);
        return;
      }
      const nextWiz: FabDesignWizardState = { ...wiz, name: nextName };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }
    if (parts[0] === 'profile') {
      const prof = parseDesignProfile(parts[1]);
      if (!prof) {
        append([{ kind: 'ERR', text: 'Usage: profile <perf|balanced|eff|compact>' }]);
        return;
      }
      const nextWiz: FabDesignWizardState = { ...wiz, profile: prof };
      setFabWizard(nextWiz);
      printFabWizardPrompt(nextWiz);
      return;
    }
    if (low === 'draft' || low === 'save') {
      const res = onSaveDraftBlueprint({
        name: wiz.name,
        partCategory: wiz.partCategory,
        architecture: wiz.architecture,
        processNode: wiz.processNode,
        focus: wiz.focus,
        branch: wiz.branch,
        engineering: wiz.engineering,
        componentParams: wiz.componentParams,
        subFeature: wiz.subFeature,
        profile: wiz.profile,
      });
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      if (res.ok) setFabWizard(null);
      return;
    }
    if (low === 'tapeout' || low === 'confirm' || low === 'deploy' || low === 'yes' || low === 'y') {
      const res = onDesignCustomComponent({
        name: wiz.name,
        partCategory: wiz.partCategory,
        architecture: wiz.architecture,
        processNode: wiz.processNode,
        focus: wiz.focus,
        branch: wiz.branch,
        engineering: wiz.engineering,
        componentParams: wiz.componentParams,
        subFeature: wiz.subFeature,
        profile: wiz.profile,
      });
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      if (res.ok) {
        setFabWizard(null);
        append([
          {
            kind: 'TEXT',
            text: `Blueprint saved (#${(state.fab?.blueprints.length ?? 0) + 1}). Run "fab proto ${(state.fab?.blueprints.length ?? 0) + 1}" or "fab produce ${(state.fab?.blueprints.length ?? 0) + 1} 1"!`,
          },
        ]);
      }
      return;
    }
    append([
      {
        kind: 'ERR',
        text: 'Type "tapeout" (or "confirm"), "draft", "name <NewName>", "profile <perf|balanced|eff|compact>", "back", or "cancel".',
      },
    ]);
  };

  const COIN_ALGOS: MiningAlgorithm[] = [
    'SHA256',
    'SCRYPT',
    'RANDOMX',
    'ETHASH',
    'KAWPOW',
    'EQUIHASH',
    'POST',
    'QHASH',
  ];

  const printCoinWizardPrompt = (cw: CoinCreateWizardState) => {
    if (cw.step === 'SYMBOL_NAME') {
      append([
        { kind: 'HEAD', text: 'LEGITIMATE COIN CREATOR [1/5] — TICKER & PROTOCOL NAME' },
        {
          kind: 'PRE',
          text: [
            `  Launch a legitimate mineable mainnet coin listed alongside BTC/ETH/QTM on the public exchange.`,
            `  Requires at least $500 initial liquidity pool. Completely separate from underground shell coins.`,
          ].join('\n'),
        },
        { kind: 'TEXT', text: 'Enter `<TICKER> <Protocol Name>` (e.g. "SOLR Solaris Hashnet") or "cancel".' },
      ]);
      return;
    }
    if (cw.step === 'ALGO') {
      const rows = COIN_ALGOS.map((a, i) => `  ${i + 1}. ${a}`);
      append([
        { kind: 'HEAD', text: `COIN CREATOR [2/5] — PROOF ALGORITHM (${cw.symbol})` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: `Enter algorithm number (1..${COIN_ALGOS.length}), name, "back", or "cancel".` },
      ]);
      return;
    }
    if (cw.step === 'ECONOMICS') {
      append([
        { kind: 'HEAD', text: `COIN CREATOR [3/5] — LIQUIDITY & TOKENOMICS (${cw.symbol})` },
        {
          kind: 'PRE',
          text: [
            `  Current Liquidity Pool : ${formatUsd(cw.initialLiquidityUsd)} (Cash: ${formatUsd(state.cash)})`,
            `  Halving Interval       : Every ${cw.halvingEverySteps} steps (30..240)`,
            `  Creator Dev Fee        : ${cw.creatorFeePct.toFixed(1)}% (0..5%)`,
          ].join('\n'),
        },
        {
          kind: 'TEXT',
          text: 'Commands: "liq <usd>", "halve <30..240>", "fee <0..5>", or "done" to continue ("back").',
        },
      ]);
      return;
    }
    if (cw.step === 'REQUIREMENTS') {
      append([
        { kind: 'HEAD', text: `COIN CREATOR [4/5] — HARDWARE COMPATIBILITY RULES (${cw.symbol})` },
        {
          kind: 'PRE',
          text: [
            `  Min GPU VRAM       : ${cw.minVramGb} GB (0 = any, 8-24 = high-DAG)`,
            `  Min System RAM     : ${cw.minRamGb} GB`,
            `  Preferred Branch   : ${cw.preferredBranch ?? 'ANY'}`,
          ].join('\n'),
        },
        {
          kind: 'TEXT',
          text: 'Commands: "vram <0..64>", "ram <0..128>", "branch <any|silicon|quantum|photonic>", or "done".',
        },
      ]);
      return;
    }
    append([
      { kind: 'HEAD', text: `COIN CREATOR [5/5] — CONFIRM MAINNET LAUNCH (${cw.symbol})` },
      {
        kind: 'PRE',
        text: [
          `  Ticker / Name      : ${cw.symbol} — ${cw.name}`,
          `  Algorithm          : ${cw.algorithm}`,
          `  Seed Liquidity     : ${formatUsd(cw.initialLiquidityUsd)} (Halving: ${cw.halvingEverySteps}st | Fee: ${cw.creatorFeePct.toFixed(1)}%)`,
          `  Min Spec           : VRAM >= ${cw.minVramGb}GB | RAM >= ${cw.minRamGb}GB | Branch: ${cw.preferredBranch ?? 'ANY'}`,
        ].join('\n'),
      },
      { kind: 'TEXT', text: 'Type "launch" (or "confirm"), "back", or "cancel".' },
    ]);
  };

  const handleCoinWizardInput = (raw: string, cw: CoinCreateWizardState) => {
    const trimmed = raw.trim();
    const low = trimmed.toLowerCase();
    const parts = low.split(/\s+/);

    if (low === 'cancel' || low === 'exit' || low === 'quit') {
      setCoinWizard(null);
      append([{ kind: 'WARN', text: 'Custom coin creation cancelled.' }]);
      return;
    }
    if (low === 'back') {
      const order: CoinCreateStep[] = ['SYMBOL_NAME', 'ALGO', 'ECONOMICS', 'REQUIREMENTS', 'CONFIRM'];
      const prevIdx = Math.max(0, order.indexOf(cw.step) - 1);
      const nextCw = { ...cw, step: order[prevIdx] };
      setCoinWizard(nextCw);
      printCoinWizardPrompt(nextCw);
      return;
    }
    if (cw.step === 'SYMBOL_NAME') {
      const rawTokens = trimmed.split(/\s+/);
      const sym = (rawTokens[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cname = rawTokens.slice(1).join(' ').trim() || `${sym} Mainnet`;
      if (sym.length < 2 || sym.length > 6) {
        append([{ kind: 'ERR', text: 'Ticker must be 2-6 alphanumeric characters (e.g. "SOLR Solaris Protocol").' }]);
        return;
      }
      const nextCw: CoinCreateWizardState = { ...cw, step: 'ALGO', symbol: sym, name: cname.slice(0, 28) };
      setCoinWizard(nextCw);
      printCoinWizardPrompt(nextCw);
      return;
    }
    if (cw.step === 'ALGO') {
      const idx = parseInt(parts[0], 10) - 1;
      const picked = COIN_ALGOS[idx] ?? COIN_ALGOS.find((a) => a.toLowerCase() === parts[0]);
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter number (1..${COIN_ALGOS.length}) or algorithm name.` }]);
        return;
      }
      const nextCw: CoinCreateWizardState = { ...cw, step: 'ECONOMICS', algorithm: picked };
      setCoinWizard(nextCw);
      printCoinWizardPrompt(nextCw);
      return;
    }
    if (cw.step === 'ECONOMICS') {
      if (low === 'done' || low === 'next' || low === '0') {
        const nextCw: CoinCreateWizardState = { ...cw, step: 'REQUIREMENTS' };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'liq' || parts[0] === 'liquidity') {
        const v = Number(parts[1]);
        if (!Number.isFinite(v) || v < 500) {
          append([{ kind: 'ERR', text: 'Minimum initial liquidity is $500.' }]);
          return;
        }
        const nextCw = { ...cw, initialLiquidityUsd: Math.round(v) };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'halve' || parts[0] === 'halving') {
        const v = parseInt(parts[1] ?? '', 10);
        if (isNaN(v)) {
          append([{ kind: 'ERR', text: 'Usage: halve <30..240>' }]);
          return;
        }
        const nextCw = { ...cw, halvingEverySteps: Math.max(30, Math.min(240, v)) };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'fee') {
        const v = parseFloat(parts[1] ?? '');
        if (isNaN(v)) {
          append([{ kind: 'ERR', text: 'Usage: fee <0..5>' }]);
          return;
        }
        const nextCw = { ...cw, creatorFeePct: Math.max(0, Math.min(5, v)) };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      append([{ kind: 'ERR', text: 'Use "liq <usd>", "halve <N>", "fee <pct>", or "done".' }]);
      return;
    }
    if (cw.step === 'REQUIREMENTS') {
      if (low === 'done' || low === 'next' || low === '0') {
        const nextCw: CoinCreateWizardState = { ...cw, step: 'CONFIRM' };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'vram') {
        const v = Math.max(0, Math.min(64, parseInt(parts[1] ?? '0', 10) || 0));
        const nextCw = { ...cw, minVramGb: v };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'ram') {
        const v = Math.max(0, Math.min(128, parseInt(parts[1] ?? '0', 10) || 0));
        const nextCw = { ...cw, minRamGb: v };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      if (parts[0] === 'branch') {
        const map: Record<string, TechBranch | undefined> = {
          any: undefined,
          silicon: 'SILICON',
          quantum: 'QUANTUM',
          photonic: 'PHOTONIC',
        };
        if (!(parts[1] in map)) {
          append([{ kind: 'ERR', text: 'Usage: branch <any|silicon|quantum|photonic>' }]);
          return;
        }
        const nextCw = { ...cw, preferredBranch: map[parts[1]] };
        setCoinWizard(nextCw);
        printCoinWizardPrompt(nextCw);
        return;
      }
      append([{ kind: 'ERR', text: 'Use "vram <N>", "ram <N>", "branch <any|silicon|quantum|photonic>", or "done".' }]);
      return;
    }
    if (low === 'launch' || low === 'confirm' || low === 'yes' || low === 'y') {
      const res = onCreatePlayerCoin({
        symbol: cw.symbol,
        name: cw.name,
        algorithm: cw.algorithm,
        initialLiquidityUsd: cw.initialLiquidityUsd,
        halvingEverySteps: cw.halvingEverySteps,
        creatorFeePct: cw.creatorFeePct,
        minVramGb: cw.minVramGb,
        minRamGb: cw.minRamGb,
        preferredBranch: cw.preferredBranch,
      });
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      if (res.ok) setCoinWizard(null);
      return;
    }
    append([{ kind: 'ERR', text: 'Type "launch", "back", or "cancel".' }]);
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
    const { chassis: ch, compute: comp, storage: stor, psu, cooling: cool, os } =
      getEffectivePartBundle(rig);

    if (tk.slot === 'MENU') {
      const compHealth = ensureRigComponentHealth(rig);
      const gpuHealthSummary =
        rig.gpuIds.length === 0
          ? '—'
          : `${Math.round(
              compHealth.gpus.reduce((s, h) => s + h, 0) / compHealth.gpus.length
            )}% avg`;
      const sheet = [
        `  1. chassis  -> ${padRight(ch.name, 31)} ${padLeft(`${Math.round(compHealth.chassis)}%`, 4)} (${formatUsd(ch.cost)})`,
        `  2. compute  -> ${padRight(comp.name, 31)} ${padLeft(`${Math.round(compHealth.compute)}%`, 4)} (${formatUsd(comp.cost)})`,
        `  3. gpu      -> ${padRight(`${rig.gpuIds.length}/${ch.maxGpus} GPUs installed`, 31)} ${padLeft(gpuHealthSummary, 4)}`,
        `  4. storage  -> ${padRight(stor.name, 31)} ${padLeft(`${Math.round(compHealth.storage)}%`, 4)} (${formatUsd(stor.cost)})`,
        `  5. psu      -> ${padRight(`${psu.name} (${t.rawWatts}/${psu.maxWatts}W)`, 31)} ${padLeft(`${Math.round(compHealth.psu)}%`, 4)}`,
        `  6. cooling  -> ${padRight(`${cool.name} (Eq ${t.equilibriumTempC}°C)`, 31)} ${padLeft(`${Math.round(compHealth.cooling)}%`, 4)}`,
        `  7. os       -> ${padRight(os.name, 31)}  SW  (${formatUsd(os.cost)})`,
      ].join('\n');
      append([
        {
          kind: 'HEAD',
          text: `WORKBENCH // TINKERING [R${tk.rigIndex + 1}] ${rig.name} · Avg Health ${Math.round(
            rig.healthPct
          )}% · ${formatHashrate(t.effectiveHashrate, t.targetAlgo)} · ${t.wallWatts}W · Eq ${
            t.equilibriumTempC
          }°C`,
        },
        { kind: 'PRE', text: sheet },
        {
          kind: 'TEXT',
          text: 'Enter slot name or # (e.g. "gpu", "compute", "cooling"), "inspect", or "done" to exit workbench. (Old parts get 60% trade-in.)',
        },
      ]);
      return;
    }

    const hwMult = getGlobalHardwarePriceMult(state);
    const fmtCost = (val: number) => formatUsd(val, val >= 10_000);
    const fmtNet = (oldCost: number, newCost: number) => {
      const net = calculatePartTradeInCost(oldCost, Math.round(newCost * hwMult));
      return net >= 0
        ? `Net +${formatUsd(net, net >= 10_000)}`
        : `Refund ${formatUsd(Math.abs(net), Math.abs(net) >= 10_000)}`;
    };

    if (tk.slot === 'chassis') {
      const options = getUnlockedChassis();
      const rows = options.map((c, idx) => {
        const cur = c.id === rig.chassisId ? ' *INSTALLED*' : fmtNet(ch.cost, c.cost);
        const cap =
          c.maxAsics >= 1 && c.maxGpus > 0
            ? `Hybrid+${c.maxGpus}G`
            : c.isAsicRack
            ? 'ASIC Rack'
            : `${c.maxGpus} GPUs`;
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(fmtCost(c.cost), 8)}  ${padRight(
          cap,
          10
        )}  -${c.coolingBonus}°C  ${padRight(cur, 15)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP CHASSIS (60% trade-in)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter chassis #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'compute') {
      const compatible =
        ch.maxAsics >= 1 && ch.maxGpus > 0
          ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok)
          : getUnlockedComputeFor(Boolean(ch.isAsicRack && ch.maxGpus === 0));
      const rows = compatible.map((c, idx) => {
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        const cur = c.id === rig.computeId ? ' *INSTALLED*' : fmtNet(comp.cost, c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 33)} ${padLeft(
          fmtCost(c.cost),
          8
        )}  ${padLeft(`${c.watts}W`, 5)}  ${padRight(hashLabel, 17)}  ${padRight(cur, 15)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP COMPUTE (${ch.name})` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter compute #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'gpu') {
      const compHealth = ensureRigComponentHealth(rig);
      const installed =
        rig.gpuIds.length === 0
          ? '  (no GPUs installed)'
          : rig.gpuIds
              .map((gid, sIdx) => {
                const g = GPU_PARTS.find((x) => x.id === gid);
                const gHealth = Math.round(compHealth.gpus[sIdx] ?? rig.healthPct);
                return `  [Slot ${sIdx + 1}] ${padRight(g?.name ?? gid, 26)} ${padLeft(
                  `${gHealth}% hlth`,
                  9
                )}  (Trade-in: ${fmtCost(Math.round((g?.cost ?? 0) * 0.6))})`;
              })
              .join('\n');
      const unlockedGpus = getUnlockedGpus();
      const catalogRows = unlockedGpus
        .map((g, idx) => {
          const eth = g.hashrates.ETHASH
            ? `ETH ${g.hashrates.ETHASH}MH`
            : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
          return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(
            fmtCost(g.cost),
            8
          )}  ${padLeft(`${g.watts}W`, 5)}  ${padRight(eth, 12)}`;
        })
        .join('\n');
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
      const options = getUnlockedStorage();
      const rows = options.map((s, idx) => {
        const cur = s.id === rig.storageId ? ' *INSTALLED*' : fmtNet(stor.cost, s.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(s.name, 33)} ${padLeft(
          fmtCost(s.cost),
          8
        )}  +${Math.round(s.efficiencyBonus * 100)}% eff  ${padRight(cur, 15)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP STORAGE / RAM` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter storage #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'psu') {
      const options = getUnlockedPsus();
      const rows = options.map((p, idx) => {
        const cur = p.id === rig.psuId ? ' *INSTALLED*' : fmtNet(psu.cost, p.cost);
        const fit = t.rawWatts <= p.maxWatts ? 'FITS' : 'OVERLOAD';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(p.name, 31)} ${padLeft(
          fmtCost(p.cost),
          8
        )}  ${padLeft(`${p.maxWatts}W`, 6)}  [${padRight(fit, 8)}]  ${padRight(cur, 15)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP PSU (Load: ${t.rawWatts}W)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter PSU #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'cooling') {
      const options = getUnlockedCooling();
      const rows = options.map((c, idx) => {
        const cur = c.id === rig.coolingId ? ' *INSTALLED*' : fmtNet(cool.cost, c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 32)} ${padLeft(
          fmtCost(c.cost),
          8
        )}  -${padLeft(String(c.coolingPowerC), 3)}°C  ${padLeft(
          `${c.noiseDba}dBA`,
          5
        )}  ${padRight(cur, 15)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP COOLING` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter cooling #, "back", or "done".' },
      ]);
      return;
    }

    // OS
    const osOptions = getUnlockedOs();
    const rows = osOptions.map((o, idx) => {
      const cur = o.id === rig.osId ? ' *INSTALLED*' : fmtNet(os.cost, o.cost);
      return `  ${padLeft(String(idx + 1), 2)}. ${padRight(o.name, 30)} ${padLeft(
        fmtCost(o.cost),
        8
      )}  x${o.hashrateMultiplier.toFixed(2)}h  x${o.powerMultiplier.toFixed(2)}p  ${padRight(
        cur,
        15
      )}`;
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
      const pickedGpu = getUnlockedGpus()[gpuIdx];
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
    if (tk.slot === 'chassis') pickedPartId = getUnlockedChassis()[idx]?.id ?? null;
    else if (tk.slot === 'compute') {
      const ch = getEffectivePartBundle(rig).chassis;
      const compatible =
        ch.maxAsics >= 1 && ch.maxGpus > 0
          ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok)
          : getUnlockedComputeFor(Boolean(ch.isAsicRack && ch.maxGpus === 0));
      pickedPartId = compatible[idx]?.id ?? null;
    } else if (tk.slot === 'storage') pickedPartId = getUnlockedStorage()[idx]?.id ?? null;
    else if (tk.slot === 'psu') pickedPartId = getUnlockedPsus()[idx]?.id ?? null;
    else if (tk.slot === 'cooling') pickedPartId = getUnlockedCooling()[idx]?.id ?? null;
    else if (tk.slot === 'os') pickedPartId = getUnlockedOs()[idx]?.id ?? null;

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

  const openRigWizard = () => {
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
  };

  const openFabWizard = () => {
    const cats = getUnlockedFabCategories(state);
    const defaultCat = cats[0]?.id ?? 'compute';
    const archs = getUnlockedFabArchitectures(state, defaultCat);
    const defaultArch = archs[0]?.id ?? 'CHIPLET_CPU';
    const nodes = getUnlockedFabNodes(state, defaultCat);
    const defaultNode = nodes[0] ?? '7nm';
    const focuses = getFocusOptionsForDesign(defaultCat, defaultArch);
    const budget = getFabEngineeringPointBudget(state);
    const defaultBranch: TechBranch = defaultNode === 'photonic' ? 'PHOTONIC' : 'SILICON';
    const initialFabWiz: FabDesignWizardState = {
      step: 'CATEGORY',
      name: getDefaultFabBlueprintName(defaultCat),
      partCategory: defaultCat,
      architecture: defaultArch,
      processNode: defaultNode,
      focus: focuses[0]?.id ?? 'SHA256',
      branch: defaultBranch,
      engineering: getPresetEngineeringForProfile('BALANCED', budget),
      componentParams: getDefaultComponentParams(defaultCat, defaultNode, defaultBranch),
      subFeature: 'STD',
      profile: 'BALANCED',
    };
    setFabWizard(initialFabWiz);
    printFabWizardPrompt(initialFabWiz);
  };

  const openCoinWizard = () => {
    const initialCw: CoinCreateWizardState = {
      step: 'SYMBOL_NAME',
      symbol: 'MYCN',
      name: 'MyChain Mainnet',
      algorithm: 'ETHASH',
      initialLiquidityUsd: 2500,
      halvingEverySteps: 90,
      creatorFeePct: 1.5,
      minVramGb: 4,
      minRamGb: 4,
      preferredBranch: undefined,
    };
    setCoinWizard(initialCw);
    printCoinWizardPrompt(initialCw);
  };

  const openTinkerWizard = (rigIndex: number, initialSlot: TinkerSlot = 'MENU') => {
    const nextTk: TinkerState = { rigIndex, slot: initialSlot };
    setTinker(nextTk);
    printTinkerPrompt(nextTk);
  };

  const unlockCoinCommand = (rawSym?: string) => {
    const sym = (rawSym || '').toUpperCase() as CoinSymbol;
    const coin = state.coins[sym];
    if (!coin) {
      append([{ kind: 'ERR', text: `Usage: unlock <${Object.keys(state.coins).join('|')}>` }]);
      return;
    }
    if (coin.unlocked) {
      append([
        {
          kind: 'OK',
          text: `${coin.name} (${sym}) is already unlocked! Assign a rig via "rig 1 coin ${sym}".`,
        },
      ]);
      return;
    }
    const unlocked = getUnlockedSystems(state);
    if (!unlocked.coinUnlocks) {
      append([{ kind: 'WARN', text: `Mining coin access is locked. ${unlocked.unlockNotes.coinUnlocks}. See "guide".` }]);
      return;
    }
    maybeShowContextualGuide('ctx_coin_unlocks');
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
      : fabWizard
      ? `fab(${fabWizard.step.toLowerCase()})>`
      : coinWizard
      ? `coin(${coinWizard.step.toLowerCase()})>`
      : tinker
      ? `tinker(R${tinker.rigIndex + 1}${tinker.slot === 'MENU' ? '' : `:${tinker.slot}`})>`
      : 'miner@hashrate:~$';
    append([{ kind: 'CMD', text: `${promptPrefix} ${trimmed}` }]);

    if (wizard) {
      handleWizardInput(trimmed, wizard);
      return;
    }

    if (fabWizard) {
      handleFabWizardInput(trimmed, fabWizard);
      return;
    }

    if (coinWizard) {
      handleCoinWizardInput(trimmed, coinWizard);
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
    const arg4 = parts[4]?.toLowerCase() ?? '';

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

    if (cmd === 'clear' || cmd === 'cls') {
      setLines([]);
      return;
    }

    const unlockedSys = getUnlockedSystems(state);
    const checkSystemUnlocked = (sysId: GuidedSystemId, label = String(sysId)): boolean => {
      if (unlockedSys[sysId]) return true;
      append([
        {
          kind: 'WARN',
          text: `${label} is locked in Guided Mode. ${unlockedSys.unlockNotes[sysId]}. Run "guide" for the full progression.`,
        },
      ]);
      return false;
    };

    if (cmd === 'help' || cmd === '?') {
      const onboardingMode = getEffectiveOnboardingMode(state);
      const gatedCommands: Array<[GuidedSystemId, string]> = [
        ['contracts', 'contracts'], ['staff', 'staff/hire'], ['rivals', 'rivals'], ['pr', 'pr'],
        ['coinUnlocks', 'unlock'], ['exchange', 'exchange (new positions)'], ['ops', 'ops/blackmarket'],
        ['coins', 'coin create'], ['fab', 'fab'], ['gen7', 'Gen-7 design'],
      ];
      const lockedUpcoming = gatedCommands.filter(([system]) => !unlockedSys[system]);

      append([
        { kind: 'HEAD', text: `COMMAND REFERENCE MANUAL (${onboardingMode} MODE)` },
        {
          kind: 'PRE',
          text: [
            `  STEPS, ONBOARDING & PROGRESSION`,
            `    status | look                     Facility grid, power contract & fleet`,
            `    guide [complete|pause|pace|revisit] Guided checklist gating & stage progression`,
            `    objectives | goals                Early-game guided goals & bonus Cash/RP rewards`,
            `    codex [cat|topic] | wiki [topic]  Permanent in-terminal mechanics encyclopedia`,
            `    tutorial [list|<topic>|restart]   Interactive & replayable topic tutorials`,
            `    mode <guided|veteran>             Switch between gradual unlocks or full access`,
            `    step [n] | pause | resume | auto  Advance steps or toggle auto-stepping`,
            `    Career manual steps: up to ${MANUAL_STEP_CAPACITY} available, with 1 restored every ${MANUAL_STEP_REFILL_SECONDS}s.`,
            `    speed [<5..300>|2x|clock <1..24>]   Real seconds per step & in-game hours per step`,
            `    event | decide <1|2|3>            View active event or lock in choice`,
            `    stats | valuation | history | milestones | achievements | challenges | save`,
            `    leaderboard | season              Seasonal standings vs rivals & hall of fame`,
            `  HARDWARE, USED MARKET & FOUNDRY`,
            `    build rig | presets | build preset <#>    Assemble custom rig (unlocked parts + Fab stock)`,
            `    usedmarket | used [buy <#>|refresh]       Browse/buy factory, refurb, used & damaged rigs`,
            `    tinker [<#>] [<slot> <part#>]             Swap rig parts (60% trade-in credit)`,
            `    overclock [<#|all>] <80..150>             Adjust clock multiplier (power/heat trade-off)`,
            `    rigs | inspect <#>                        Fleet roster, component health & serial genealogy`,
            `    benchmark <rig#> [stock] | commission <rig#> <efficiency|output|quiet> [stock]`,
            `    rig <#|all> <on|off|oc N|coin X|pool|profile|payout <hold|sell>> | rig <#> clone [qty]`,
            `    repair [<#>|all] [<part> [slot#]] | repaste [<#>|all]`,
            `    retire <#> | backup [deploy <#>] [sell <#>] | rename <#> <name> | sell <#>`,
            `    fab [line build|design|drafts|proto <#>|revise <#>|compare <a> <b>|produce <#> <qty>|batch|serial|history|deploy|strip|sell]`,
            `  POWER, COOLING, ROOMS, FACILITIES & STAFF`,
            `    power [contract <1..4> | upgrade <1..6>]  Manage power contracts & electrical grid`,
            `    cool [compare | add <type> [room <#>] | room <#> <room#> | toggle <#> | sell <#>]`,
            `    rooms | room [<#> | expand] | floorplan   ASCII room blueprint & wing expansion`,
            `    rig <#> room <#> | move <#> <room#>       Move rig into a cooler or baffled room`,
            `    facilities | facility <rent|buy|preview> <1..6> | facility <upgrade|expand>`,
            `    staff | hire <tech|elec|mgr|eng|res|pr|analyst> | train <#> | fire <#> | shift | priority`,
            `    research [done | start <#>] | world | blockchain | ledger`,
            `  MARKET, COINS, EXCHANGE, CONTRACTS, RIVALS & OPS`,
            `    coins | coin <list|create|info <SYM>|unlock <SYM>>   Coins & legitimate custom coin launcher`,
            `    market | forecast [COIN] | unlock <COIN> | chart <COIN|portfolio|cash|profit|hashrate|power>`,
            `    wallet | exchange [buy|sell|limit|cancel|short|close]   Treasury wallet & spot/margin desk`,
            `    contracts | contract <accept <1..4>|abandon>   Reputation-gated enterprise contracts`,
            `    rivals [markets [COIN] | compare | log <#> | investigate <#> | intel <#>]`,
            `    pr | pr launch <1..5> <COIN>              Legal PR campaigns`,
            `    ops [siphon|botnet|wash|pump|coin dev/seed/launch|shill|rug|raid prep/exec|audit|comply|settle|launder|bribe]`,
            `    blackmarket                               Smuggled rigs & illicit BIOS/ROM mods`,
            ...(lockedUpcoming.length > 0
              ? [
                  '',
                  `  LOCKED IN GUIDED MODE: ${lockedUpcoming.map(([, command]) => command).join(', ')}`,
                  `  ${unlockedSys.unlockNotes[lockedUpcoming[0][0]]}. See "guide" for later milestones.`,
                ]
              : []),
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

    if (cmd === 'tutorial') {
      const cur = state.tutorialStep ?? 0;
      const topicAliases: Record<string, string> = {
        hardware: 'hardware',
        health: 'hardware',
        component: 'hardware',
        components: 'hardware',
        repair: 'hardware',
        rig: 'hardware',
        rigs: 'hardware',
        power: 'power',
        electricity: 'power',
        cooling: 'power',
        cool: 'power',
        thermal: 'power',
        facility: 'facilities',
        facilities: 'facilities',
        employee: 'employees',
        employees: 'employees',
        staff: 'employees',
        hire: 'employees',
        contract: 'contracts',
        contracts: 'contracts',
        ops: 'ops',
        operations: 'ops',
        pr: 'ops',
        rivals: 'rivals',
        blackmarket: 'blackmarket',
        bm: 'blackmarket',
        underground: 'blackmarket',
        fab: 'engineering',
        foundry: 'engineering',
        engineering: 'engineering',
        manufacturing: 'manufacturing',
        research: 'research',
        usedmarket: 'usedmarket',
        benchmark: 'optimization',
        exchange: 'exchange',
        gen7: 'gen7',
        quantum: 'gen7',
        photonic: 'gen7',
        coin: 'coins',
        coins: 'coins',
        custom_coins: 'coins',
      };

      if (arg1 === 'list' || arg1 === 'topics' || arg1 === 'all') {
        const topicRows = Object.values(TUTORIAL_TOPICS).map(
          (t) => `  tutorial ${padRight(t.id, 13)} -> ${t.summary}`
        );
        append([
          { kind: 'HEAD', text: 'REPLAYABLE TUTORIAL DIRECTORY' },
          {
            kind: 'PRE',
            text: [
              `  tutorial general       -> 6-step interactive starter walkthrough (replayable)`,
              `  tutorial build         -> Compare two rigs against your current cash and grid limits`,
              `  tutorial context       -> List and replay first-use tips`,
              ...topicRows,
              `  tutorial veteran       -> Switch immediately to Veteran Mode (unlock all systems)`,
            ].join('\n'),
          },
          {
            kind: 'TEXT',
            text: 'Run any topic command above, "guide" for the checklist, or "codex" for quick reference.',
          },
        ]);
        return;
      }

      if (arg1 === 'veteran') {
        rigLessonActiveRef.current = false;
        onSetOnboardingMode('VETERAN');
        lastTutorialStepRef.current = 0;
        onSetTutorialStep(0);
        append([
          {
            kind: 'OK',
            text: 'Veteran Mode enabled: general walkthrough closed and all game systems unlocked.',
          },
        ]);
        return;
      }

      if (arg1 === 'skip' || arg1 === 'off' || arg1 === 'done' || arg1 === 'exit') {
        rigLessonActiveRef.current = false;
        lastTutorialStepRef.current = 0;
        onSetTutorialStep(0);
        append([
          {
            kind: 'TEXT',
            text: 'Tutorial closed. Type "tutorial restart", "tutorial list", "guide", or "codex" anytime to replay or read guides.',
          },
        ]);
        return;
      }

      const rawTopic = arg1 === 'replay' ? arg2 : arg1;
      if (arg1 === 'context') {
        const guideId = arg2.startsWith('ctx_') ? arg2 : `ctx_${arg2}`;
        if (arg2 && Object.hasOwn(CONTEXTUAL_GUIDES, guideId)) {
          printContextualGuide(guideId);
        } else {
          append([{
            kind: 'PRE',
            text: Object.entries(CONTEXTUAL_GUIDES).map(([id, guide]) =>
              `  tutorial context ${id.slice(4)} — ${guide.title}`
            ).join('\n'),
          }]);
        }
        return;
      }
      if (rawTopic === 'build') {
        printRigBuildLesson('TUTORIAL // CHOOSE YOUR NEXT RIG');
        return;
      }
      const mappedTopic = Object.hasOwn(TUTORIAL_TOPICS, rawTopic)
        ? rawTopic
        : Object.hasOwn(topicAliases, rawTopic) ? topicAliases[rawTopic] : undefined;
      if (mappedTopic && TUTORIAL_TOPICS[mappedTopic]) {
        const t = TUTORIAL_TOPICS[mappedTopic];
        onRevisitGuidedTopic(mappedTopic);
        append([
          { kind: 'HEAD', text: `TUTORIAL // ${t.title}` },
          { kind: 'PRE', text: t.lines.join('\n') },
          {
            kind: 'OK',
            text: `Try next -> "${t.nextCommand}" (or "tutorial list" to browse other guides).`,
          },
        ]);
        return;
      }

      if (arg1 === 'restart' || arg1 === 'start' || arg1 === 'replay' || arg1 === 'general') {
        onRevisitGuidedTopic('general');
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
        } else if (cur >= 6) {
          lastTutorialStepRef.current = 0;
          onSetTutorialStep(0);
          append([
            {
              kind: 'OK',
              text: 'Tutorial complete! Type "tutorial list", "guide", "objectives", or "codex" anytime.',
            },
          ]);
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

    const cmdCtx: TerminalCommandContext = {
      state,
      props: allProps,
      raw: trimmed,
      parts: parts.map((p) => p.toLowerCase()),
      cmd,
      arg1,
      arg2,
      arg3,
      arg4,
      append,
      maybeShowContextualGuide,
      checkSystemUnlocked: (sys, label) => checkSystemUnlocked(sys, label ?? sys),
      openFabWizard,
      openCoinWizard,
      openRigWizard,
      openTinkerWizard,
      unlockCoinCommand,
    };

    if (handleOnboardingAndCodexCommand(cmdCtx)) return;
    if (handleCoinAndExchangeCommand(cmdCtx)) return;
    if (handleFabCommand(cmdCtx)) return;
    if (handleRigCommand(cmdCtx)) return;
    if (handleOpsAndBlackMarketCommand(cmdCtx)) return;

    if (cmd === 'speed' || cmd === 'tick') {
      const stepSecs = state.stepSeconds ?? 30;
      const stepHrs = state.stepHours ?? 24;
      if (!arg1) {
        append([
          {
            kind: 'OK',
            text: `Simulation speed: 1 step every ${stepSecs}s (${(30 / stepSecs).toFixed(
              2
            )}x) | Game clock: ${stepHrs}h per step (now ${formatGameDate(
              state.stepCount,
              stepHrs
            )}).`,
          },
          {
            kind: 'TEXT',
            text: 'Usage: "speed <5..300>" real seconds per step | "speed <1x|2x|3x|4x|6x>" | "speed clock <1..24>" in-game hours per step.',
          },
        ]);
        return;
      }
      if (arg1 === 'clock') {
        const hrs = parseInt(arg2, 10);
        if (!Number.isFinite(hrs) || hrs < 1 || hrs > 24) {
          append([{ kind: 'ERR', text: 'Usage: speed clock <1..24> (in-game hours per step).' }]);
          return;
        }
        const res = onSetSimSpeed(stepSecs, hrs);
        append([{ kind: 'OK', text: res.summary }]);
        return;
      }
      const multMatch = arg1.match(/^(\d+(?:\.\d+)?)x$/);
      if (multMatch) {
        const mult = parseFloat(multMatch[1]);
        if (!(mult >= 0.1) || mult > 6) {
          append([{ kind: 'ERR', text: 'Multiplier must be between 0.1x and 6x (30s base).' }]);
          return;
        }
        const res = onSetSimSpeed(30 / mult);
        append([{ kind: 'OK', text: res.summary }]);
        return;
      }
      const secs = parseInt(arg1, 10);
      if (!Number.isFinite(secs) || secs < 5 || secs > 300) {
        append([
          {
            kind: 'ERR',
            text: 'Usage: speed <5..300> seconds per step, "speed 2x", or "speed clock <1..24>".',
          },
        ]);
        return;
      }
      const res = onSetSimSpeed(secs);
      append([{ kind: 'OK', text: res.summary }]);
      return;
    }

    if (cmd === 'pause') {
      onSetUserPaused(true);
      append([
        {
          kind: 'WARN',
          text: `Auto-stepping PAUSED (${state.stepSeconds ?? 30}s timer stopped). Manual "step [n]" still works; type "resume" anytime.`,
        },
      ]);
      return;
    }

    if (cmd === 'resume' || cmd === 'unpause' || cmd === 'play') {
      onSetUserPaused(false);
      const blockedBy = state.pendingEvent
        ? 'active event decision'
        : (state.tutorialStep ?? 0) > 0 && !state.guidedOnboarding?.paused
        ? 'onboarding tutorial'
        : null;
      append([
        {
          kind: blockedBy ? 'WARN' : 'OK',
          text: blockedBy
            ? `Manual pause cleared — auto-stepping (${state.stepSeconds ?? 30}s) will start automatically once the ${blockedBy} finishes.`
            : `Auto-stepping RESUMED (1 step every ${state.stepSeconds ?? 30}s). Type "pause" anytime.`,
        },
      ]);
      return;
    }

    if (cmd === 'auto') {
      if (arg1 === 'off' || arg1 === 'pause' || arg1 === 'stop') {
        onSetUserPaused(true);
        append([{ kind: 'WARN', text: 'Auto-stepping PAUSED. Type "resume" or "auto on" to restart.' }]);
        return;
      }
      if (arg1 === 'on' || arg1 === 'resume' || arg1 === 'start') {
        onSetUserPaused(false);
        append([
          {
            kind: 'OK',
            text: `Auto-stepping RESUMED (1 step every ${state.stepSeconds ?? 30}s).`,
          },
        ]);
        return;
      }
      append([
        {
          kind: autoPauseReason ? 'WARN' : 'OK',
          text: autoPauseReason
            ? `Auto-step (${state.stepSeconds ?? 30}s): PAUSED (${autoPauseReason}). Auto-pauses during events, rig building, tinkering, and tutorial.`
            : `Auto-step (${state.stepSeconds ?? 30}s): ACTIVE — next automatic step in ${autoCountdown}s. Type "pause" to stop.`,
        },
      ]);
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
        if (res.manualStepWaitSeconds !== undefined) {
          append([{
            kind: 'WARN',
            text: `Manual step limit reached. Next manual step in ${res.manualStepWaitSeconds}s.`,
          }]);
        }
        if (res.stepsRun === 0) return;
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
        if (state.tutorialStep === 6) {
          lastTutorialStepRef.current = 0;
          onSetTutorialStep(0);
          append([
            {
              kind: 'OK',
              text: 'Tutorial complete! Run "objectives", "codex", or "tutorial list" anytime.',
            },
          ]);
        }
      }
      return;
    }

    if (cmd === 'presets') {
      const unlockedPresets = getUnlockedPresets();
      const rows = unlockedPresets.map((p, i) => {
        const cfg: RigBuildConfig = {
          ...p.config,
          targetCoin: state.coins[p.config.targetCoin]?.unlocked ? p.config.targetCoin : 'BTC',
          name: p.label,
        };
        const cost = calculateRigBuildCost(cfg, state);
        const econ = previewRigEconomics(cfg, cost, state);
        const payback = econ.paybackSteps !== null ? `${econ.paybackSteps}st` : 'Never';
        return `  ${i + 1}. ${padRight(p.label, 24)} ${padLeft(formatUsd(cost, cost >= 10_000), 8)}  ${padRight(
          cfg.targetCoin,
          4
        )}  Net:${padLeft(`${econ.netPerStepUsd >= 0 ? '+' : ''}${formatUsd(econ.netPerStepUsd, Math.abs(econ.netPerStepUsd) >= 10_000)}/st`, 11)}  ROI:${payback}`;
      });
      append([
        { kind: 'HEAD', text: 'READY-TO-DEPLOY RIG PRESETS (WITH PURCHASE PREVIEW)' },
        { kind: 'PRE', text: rows.length > 0 ? rows.join('\n') : '  (No presets unlocked yet.)' },
        {
          kind: 'TEXT',
          text:
            unlockedPresets.length > 0
              ? `Run "build preset <1..${unlockedPresets.length}>" to deploy immediately.`
              : 'Unlock parts via R&D or run "build rig".',
        },
      ]);
      return;
    }

    if (cmd === 'usedmarket' || cmd === 'used') {
      maybeShowContextualGuide('ctx_usedmarket');
      if (arg1 === 'refresh') {
        const res = onRefreshUsedMarket();
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'preview') {
        const idx = parseInt(arg2, 10) - 1;
        const listing = (state.usedMarketListings ?? [])[idx];
        if (!listing) {
          append([{ kind: 'ERR', text: 'Usage: usedmarket preview <listing#>' }]);
          return;
        }
        const cfg: RigBuildConfig = { ...listing.config, name: listing.title };
        const econ = previewRigEconomics(cfg, listing.listPriceUsd, state);
        const ch = listing.componentHealth;
        const partLine = ch
          ? `  Part Health: Chassis ${Math.round(ch.chassis)}% · Compute ${Math.round(
              ch.compute
            )}% · PSU ${Math.round(ch.psu)}% · Cool ${Math.round(ch.cooling)}% · Stor ${Math.round(
              ch.storage
            )}%${
              ch.gpus.length > 0
                ? ` · GPUs [${ch.gpus.map((g) => `${Math.round(g)}%`).join(', ')}]`
                : ''
            }`
          : `  Part Health: Uniform ~${listing.conditionPct}% across all parts`;
        append([
          { kind: 'HEAD', text: `USED LISTING PREVIEW #${idx + 1}: ${listing.title}` },
          {
            kind: 'PRE',
            text: [
              `  Ask Price:   ${formatUsd(listing.listPriceUsd)} (Retail ${formatUsd(listing.retailPriceUsd)})`,
              `  Condition:   ${listing.conditionPct}% avg (${listing.conditionTier}) · Age ${listing.ageSteps} steps`,
              partLine,
              `  Est Output:  ${formatUsd(econ.grossRevPerStepUsd)}/step gross (${listing.config.targetCoin})`,
              `  Power Draw:  ${econ.powerKw.toFixed(2)} kW (-${formatUsd(econ.powerCostPerStepUsd)}/step)`,
              `  Est Net:     ${econ.netPerStepUsd >= 0 ? '+' : ''}${formatUsd(econ.netPerStepUsd)}/step · Payback: ${
                econ.paybackSteps !== null ? `~${econ.paybackSteps} steps` : 'No payback at current price'
              }`,
              `  Grid Impact: ${econ.projectedTotalKw.toFixed(2)} / ${econ.facilityCapKw} kW · Est ${econ.equilibriumTempC}°C / ${econ.noiseDba} dBA`,
            ].join('\n'),
          },
          ...(econ.warnings.length > 0
            ? econ.warnings.map((w) => ({ kind: 'WARN' as const, text: `[!] ${w}` }))
            : [{ kind: 'OK' as const, text: `Safe fit. Run "usedmarket buy ${idx + 1}" to purchase.` }]),
        ]);
        return;
      }
      if (arg1 === 'buy') {
        const idx = parseInt(arg2, 10) - 1;
        const listing = (state.usedMarketListings ?? [])[idx];
        if (!listing) {
          append([{ kind: 'ERR', text: 'Usage: usedmarket buy <listing#> [custom name]' }]);
          return;
        }
        const customName = parts.slice(3).join(' ').trim() || undefined;
        const res = onBuyUsedListing(listing.id, customName);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }

      const listings = state.usedMarketListings ?? [];
      const refreshIn = Math.max(0, (state.usedMarketRefreshStep ?? 0) - state.stepCount);
      const rows =
        listings.length === 0
          ? '  (No surplus listings currently available — run "usedmarket refresh".)'
          : listings
              .map((l, i) => {
                const savePct = Math.max(0, Math.round((1 - l.listPriceUsd / Math.max(1, l.retailPriceUsd)) * 100));
                const econ = previewRigEconomics({ ...l.config, name: l.title }, l.listPriceUsd, state);
                const roi = econ.paybackSteps !== null ? `${econ.paybackSteps}st` : '--';
                return `  ${i + 1}. ${padRight(l.title, 32)} ${padLeft(formatUsd(l.listPriceUsd, l.listPriceUsd >= 10_000), 8)} (-${savePct}%) ${l.conditionPct}% ${l.config.targetCoin}  Net:${padLeft(
                  `${econ.netPerStepUsd >= 0 ? '+' : ''}${formatUsd(econ.netPerStepUsd, Math.abs(econ.netPerStepUsd) >= 10_000)}`,
                  9
                )} ROI:${roi}`;
              })
              .join('\n');

      append([
        {
          kind: 'HEAD',
          text: `USED & REFURBISHED HARDWARE MARKETPLACE (Auto-refreshes in ${refreshIn}st)`,
        },
        { kind: 'PRE', text: rows },
        {
          kind: 'TEXT',
          text: 'Run "usedmarket preview <#>", "usedmarket buy <#> [name]", or "usedmarket refresh" ($75 broker fee unless Secondary Brokerage R&D unlocked).',
        },
      ]);
      return;
    }

    if (cmd === 'build') {
      if (arg1 === 'preset') {
        const unlockedPresets = getUnlockedPresets();
        const idx = parseInt(arg2 || '1', 10) - 1;
        const preset = unlockedPresets[idx];
        if (!preset) {
          append([
            {
              kind: 'ERR',
              text: `Usage: build preset <1..${unlockedPresets.length}>. Run "presets" to list.`,
            },
          ]);
          return;
        }
        const cfg: RigBuildConfig = {
          ...preset.config,
          targetCoin: state.coins[preset.config.targetCoin]?.unlocked
            ? preset.config.targetCoin
            : 'BTC',
          name: `${preset.label} #${state.rigs.length + 1}`,
          poolMode: 'PPS',
          firmwareProfile: preset.config.firmwareProfile ?? 'BALANCED',
        };
        const fitIssue = getRigChassisIssue(cfg);
        if (fitIssue) { append([{ kind: 'ERR', text: fitIssue }]); return; }
        const ok = onDeployRig(cfg);
        append([
          ok
            ? { kind: 'OK', text: `Built & deployed "${cfg.name}" for ${formatUsd(calculateRigBuildCost(cfg, state))}.` }
            : { kind: 'ERR', text: 'Deploy failed: insufficient cash or facility rig cap reached.' },
        ]);
        if (ok) printRigBuildDebrief(cfg);
        if (ok && state.tutorialStep && state.tutorialStep >= 1 && state.tutorialStep <= 4) {
          onSetTutorialStep(5);
        }
        return;
      }

      if (state.tutorialStep && state.tutorialStep >= 1 && state.tutorialStep <= 3) {
        if (!rigLessonActiveRef.current) printRigBuildLesson('TUTORIAL [3/6] — CHOOSE YOUR NEXT RIG');
        lastTutorialStepRef.current = 4;
        onSetTutorialStep(4);
        append([
          {
            kind: 'HEAD',
            text: 'TUTORIAL [4/6] — LIVE BUILD GUIDE (Check the GUIDE tip at each step)',
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

    // (rigs/inspect/repair/retire/backup/rig/move/rooms/rename/salvage/overclock/tinker handled by handleRigCommand)

    if (cmd === 'cool') {
      maybeShowContextualGuide('ctx_cool');
      const units = state.coolingUnits ?? [];
      if (arg1 === 'compare') {
        append([
          { kind: 'HEAD', text: 'COOLING INFRASTRUCTURE EFFICIENCY COMPARISON' },
          { kind: 'PRE', text: formatCoolingCompare(state) },
          {
            kind: 'TEXT',
            text: 'Install via "cool add <fan|indfan|ac|liquid|chiller|hvac>", toggle via "cool toggle <#>", or sell via "cool sell <#>".',
          },
        ]);
        return;
      }
      if (!arg1 || arg1 === 'list') {
        const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
        const coolingSummary = computeFacilityCoolingSummary(
          units,
          state.rigs.filter((r) => r.enabled).length,
          facility,
          state.facilityUpgrades
        );
        const roomsNow = getFacilityRooms(state);
        const installed =
          units.length === 0
            ? '  (none installed)'
            : units
                .map((u, i) => {
                  const spec = ROOM_COOLING_UNITS.find((s) => s.id === u.type);
                  const rid = resolveCoolerRoomId(u, roomsNow, i);
                  const rm = roomsNow.find((r) => r.id === rid);
                  return `  #${i + 1} ${padRight(spec?.name ?? u.type, 29)} [${
                    u.enabled ? 'ON ' : 'OFF'
                  }]  -${spec?.coolingPowerC ?? 0}°C  ${spec?.watts ?? 0}W  ${padRight(
                    rm ? `Rm#${rm.index}` : 'Rm#1',
                    5
                  )} ${formatUsd(spec?.maintenancePerCycle ?? 0)}/cyc`;
                })
                .join('\n');
        const shortKey: Record<RoomCoolingType, string> = {
          cool_unit_fan: 'fan',
          cool_unit_ind_fan: 'indfan',
          cool_unit_ac: 'ac',
          cool_unit_liquid: 'liquid',
          cool_unit_chiller: 'chiller',
          cool_unit_facility_hvac: 'hvac',
        };
        const shop = ROOM_COOLING_UNITS.map((u) => {
          const facOk = state.devUnlockAll || facIdx >= u.unlockFacilityIndex;
          const resOk =
            state.devUnlockAll ||
            !u.researchRequired ||
            state.unlockedResearch.includes(u.researchRequired);
          const gate =
            facOk && resOk
              ? '[READY]'
              : !facOk
              ? `[At ${FACILITY_TIERS[u.unlockFacilityIndex].name}]`
              : `[R&D: ${RESEARCH_NODES.find((r) => r.id === u.researchRequired)?.name ?? u.researchRequired}]`;
          return `  cool add ${padRight(shortKey[u.id], 8)} ${padRight(u.name, 30)} ${padLeft(
            formatUsd(u.cost),
            7
          )}  +${u.coolingPowerC}°C  ${u.watts}W  ${u.maxRigsSupported}rigs  ${gate}`;
        }).join('\n');
        append([
          {
            kind: 'HEAD',
            text: `FACILITY COOLING (-${coolingSummary.effectiveCoolingPerRigC.toFixed(1)}°C/rig relief · +${coolingSummary.facilityCoolingBonusC}°C passive)`,
          },
          { kind: 'PRE', text: `INSTALLED:\n${installed}\n\nCATALOG:\n${shop}` },
          { kind: 'TEXT', text: 'Run "cool compare", "cool add <type> [room <#>]", "cool room <cool#> <room#>", "cool toggle <#>", or "cool sell <#>".' },
        ]);
        return;
      }
      if (arg1 === 'preview') {
        const map: Record<string, RoomCoolingType> = {
          fan: 'cool_unit_fan',
          indfan: 'cool_unit_ind_fan',
          industrial: 'cool_unit_ind_fan',
          drum: 'cool_unit_ind_fan',
          ac: 'cool_unit_ac',
          liquid: 'cool_unit_liquid',
          chiller: 'cool_unit_chiller',
          hvac: 'cool_unit_facility_hvac',
          cryo: 'cool_unit_facility_hvac',
        };
        const type = map[arg2];
        const prev = type ? previewCoolingUnit(type, state) : null;
        if (!prev) {
          append([{ kind: 'ERR', text: 'Usage: cool preview <fan|indfan|ac|liquid|chiller|hvac>' }]);
          return;
        }
        append([
          { kind: 'HEAD', text: `COOLING PURCHASE PREVIEW: ${prev.name}` },
          {
            kind: 'PRE',
            text: [
              `  Upfront Cost:    ${formatUsd(prev.costUsd)} (${formatUsd(prev.costPerDegreeUsd)} per °C)`,
              `  Cooling Power:   -${prev.coolingC}°C · Power Draw: ${prev.powerKw.toFixed(2)} kW (-${formatUsd(prev.stepElecUsd)}/step)`,
              `  Cycle Upkeep:    ${formatUsd(prev.cycleMaintUsd)}/30-step cycle`,
              `  Hot Rigs (>=78°C): ${prev.hotRigsAffected} rig(s) currently running warm/hot`,
            ].join('\n'),
          },
        ]);
        return;
      }
      if (arg1 === 'room') {
        const unitIdx = parseInt(arg2, 10) - 1;
        const roomNum = parseInt(arg3, 10);
        if (isNaN(unitIdx) || isNaN(roomNum)) {
          append([{ kind: 'ERR', text: 'Usage: cool room <cooler#> <room#>' }]);
          return;
        }
        const res = onMoveCoolerToRoom(unitIdx, roomNum);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'add') {
        const map: Record<string, RoomCoolingType> = {
          fan: 'cool_unit_fan',
          indfan: 'cool_unit_ind_fan',
          industrial: 'cool_unit_ind_fan',
          drum: 'cool_unit_ind_fan',
          ac: 'cool_unit_ac',
          liquid: 'cool_unit_liquid',
          chiller: 'cool_unit_chiller',
          hvac: 'cool_unit_facility_hvac',
          cryo: 'cool_unit_facility_hvac',
        };
        const type = map[arg2];
        if (!type) {
          append([{ kind: 'ERR', text: 'Usage: cool add <fan|indfan|ac|liquid|chiller|hvac> [room <#>]' }]);
          return;
        }
        const roomNum = arg3 === 'room' ? parseInt(parts[4] || '', 10) : parseInt(arg3, 10);
        const ok = onAddCoolingUnit(type, isNaN(roomNum) ? undefined : roomNum);
        const spec = ROOM_COOLING_UNITS.find((u) => u.id === type);
        append([
          ok
            ? { kind: 'OK', text: `Installed ${spec?.name}${!isNaN(roomNum) ? ` in Room #${roomNum}` : ''}.` }
            : {
                kind: 'ERR',
                text: `Cannot install ${spec?.name ?? type}: check cash, facility stage, or required R&D.`,
              },
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
      append([{ kind: 'ERR', text: 'Usage: cool [list|compare|preview <type>|add <type> [room #]|room <#> <room#>|toggle <#>|sell <#>]' }]);
      return;
    }

    if (cmd === 'power') {
      maybeShowContextualGuide('ctx_power');
      if (arg1 === 'contract') {
        const idx = parseInt(arg2, 10) - 1;
        const spec = POWER_CONTRACTS[idx];
        if (!spec) {
          append([{ kind: 'ERR', text: `Usage: power contract <1..${POWER_CONTRACTS.length}>` }]);
          return;
        }
        const res = onSelectPowerContract(spec.id);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'upgrade') {
        const idx = parseInt(arg2, 10) - 1;
        const spec =
          !isNaN(idx) && FACILITY_UPGRADES[idx]
            ? FACILITY_UPGRADES[idx]
            : FACILITY_UPGRADES.find((u) => u.id === arg2);
        if (!spec) {
          append([{ kind: 'ERR', text: `Usage: power upgrade <1..${FACILITY_UPGRADES.length}>` }]);
          return;
        }
        const res = onBuyFacilityUpgrade(spec.id);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      append([
        { kind: 'HEAD', text: 'ELECTRICAL GRID, CONTRACTS & INFRASTRUCTURE' },
        { kind: 'PRE', text: formatPowerReport(state) },
      ]);
      return;
    }

    if (cmd === 'facilities') {
      maybeShowContextualGuide('ctx_facilities');
      const rows = FACILITY_TIERS.map((f, i) => {
        const owned = state.ownedFacilityIds.includes(f.id);
        const cur = state.facilityId === f.id;
        const prof = FACILITY_PROFILES[f.id];
        return `  ${i + 1}. ${padRight(f.name, 27)} ${padLeft(`${f.maxRigs} rigs`, 8)} ${padLeft(
          `${f.maxPowerKw}kW`,
          6
        )} ${padLeft(`${f.noiseLimitDba}dBA`, 6)} $${f.powerRatePerKwh}/kWh  Rent:${padLeft(
          formatUsd(f.cycleRent),
          8
        )}  Buy:${padLeft(formatUsd(f.buyoutPrice, true), 7)}  ${
          cur ? '[ACTIVE]' : owned ? '[OWNED]' : ''
        }${
          prof
            ? `\n     + Pros: ${prof.pros.join(' | ')}\n     - Cons: ${prof.cons.join(' | ')}`
            : ''
        }`;
      });
      append([
        { kind: 'HEAD', text: `FACILITY STAGES (1..${FACILITY_TIERS.length}) · PROS, CONS & UPGRADES` },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text: `Run "rooms" (ASCII floor-plan), "facility preview <1..${FACILITY_TIERS.length}> [buy]", "facility <rent|buy> <1..${FACILITY_TIERS.length}>", "facility upgrade [<1..${FACILITY_UPGRADES.length}>]", or "room expand".`,
        },
      ]);
      return;
    }

    if (cmd === 'facility') {
      maybeShowContextualGuide('ctx_facilities');
      if (arg1 === 'expand') {
        const res = onExpandFacilityRooms();
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'preview') {
        const idx = parseInt(arg2, 10) - 1;
        const target = FACILITY_TIERS[idx];
        const act = arg3 === 'buy' ? 'BUY' : 'RENT';
        const prev = target ? previewFacilityMove(target.id, act, state) : null;
        if (!prev) {
          append([{ kind: 'ERR', text: `Usage: facility preview <1..${FACILITY_TIERS.length}> [rent|buy]` }]);
          return;
        }
        append([
          { kind: 'HEAD', text: `FACILITY MOVE PREVIEW: ${prev.name} (${act})` },
          {
            kind: 'PRE',
            text: [
              `  Upfront Cost:      ${prev.alreadyOwned ? '$0 (Already Owned)' : formatUsd(prev.upfrontCostUsd)}`,
              `  Rig Slot Change:   ${prev.slotsDelta >= 0 ? '+' : ''}${prev.slotsDelta} slots`,
              `  Power Cap Change:  ${prev.powerCapDeltaKw >= 0 ? '+' : ''}${prev.powerCapDeltaKw} kW`,
              `  Noise Cap Change:  ${prev.noiseDeltaDba >= 0 ? '+' : ''}${prev.noiseDeltaDba} dBA`,
              `  Cycle Rent Delta:  ${prev.cycleRentDeltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(prev.cycleRentDeltaUsd))}/cycle`,
              `  Power Rate Delta:  ${prev.newStepElecDeltaUsd >= 0 ? '+' : '-'}${formatUsd(Math.abs(prev.newStepElecDeltaUsd))}/step at current load`,
            ].join('\n'),
          },
          !prev.rigFitOk
            ? { kind: 'ERR', text: '[!] Current rig count exceeds target facility slot limit.' }
            : { kind: 'OK', text: `Run "facility ${act.toLowerCase()} ${idx + 1}" to relocate.` },
        ]);
        return;
      }
      if (arg1 === 'upgrade' || arg1 === 'upgrades') {
        if (!arg2) {
          append([
            { kind: 'HEAD', text: 'FACILITY INFRASTRUCTURE UPGRADES' },
            { kind: 'PRE', text: formatPowerReport(state) },
          ]);
          return;
        }
        const idx = parseInt(arg2, 10) - 1;
        const spec =
          !isNaN(idx) && FACILITY_UPGRADES[idx]
            ? FACILITY_UPGRADES[idx]
            : FACILITY_UPGRADES.find((u) => u.id === arg2);
        if (!spec) {
          append([{ kind: 'ERR', text: `Usage: facility upgrade <1..${FACILITY_UPGRADES.length}>` }]);
          return;
        }
        const res = onBuyFacilityUpgrade(spec.id);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      const action = arg1 === 'buy' ? 'BUY' : arg1 === 'rent' ? 'RENT' : null;
      const idx = parseInt(arg2, 10) - 1;
      const target = FACILITY_TIERS[idx];
      if (!action || !target) {
        append([{ kind: 'ERR', text: `Usage: facility <rent|buy|preview> <1..${FACILITY_TIERS.length}> | facility upgrade [1..${FACILITY_UPGRADES.length}]` }]);
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

    // (forecast/market/unlock/chart/wallet/exchange handled by handleCoinAndExchangeCommand)

    if (cmd === 'world' || cmd === 'blockchain') {
      append([
        { kind: 'HEAD', text: 'WORLD & BLOCKCHAIN' },
        { kind: 'PRE', text: formatWorldReport(state, estimateFleetHashIndex(state)) },
      ]);
      return;
    }

    // (fab/foundry handled by handleFabCommand)

    if (cmd === 'contracts') {
      if (!checkSystemUnlocked('contracts', 'Enterprise Contracts')) return;
      maybeShowContextualGuide('ctx_contracts');
      const progressFmt = (c: NonNullable<GameState['activeContract']>) =>
        c.type === 'LOW_NOISE_RUN' || c.type === 'MAINTENANCE_SLA' ||
        c.type === 'UPTIME_STREAK' || c.type === 'EFFICIENCY_CAP' || c.type === 'OPERATIONAL_PERFORMANCE' ||
        (c.type === 'FACILITY_EXPANSION' && c.targetFleetSize !== undefined)
          ? `${c.progress}/${c.targetAmount} steps`
          : c.type === 'RESEARCH_PARTNERSHIP'
          ? `${c.progress.toFixed(1)}/${c.targetAmount} RP`
          : c.type === 'EQUIPMENT_SUPPLY' || c.type === 'FACILITY_EXPANSION'
          ? `${c.progress}/${c.targetAmount}`
          : `${formatUsd(c.progress)} / ${formatUsd(c.targetAmount)}`;

      const activeTxt = state.activeContract
        ? `ACTIVE CONTRACT: ${state.activeContract.title} (${state.activeContract.clientName})\n  ${
            state.activeContract.description
          }\n  Progress: ${Math.min(
            100,
            Math.round((state.activeContract.progress / Math.max(1, state.activeContract.targetAmount)) * 100)
          )}% (${progressFmt(state.activeContract)}) · ${state.activeContract.stepsRemaining}st left · Reward: ${formatUsd(
            state.activeContract.rewardCash
          )} + ${state.activeContract.rewardRp} RP (Penalty: ${formatUsd(state.activeContract.penaltyCash ?? 0)})`
        : 'ACTIVE CONTRACT: None (accept one below for bonus cash & RP)';

      const boardRows = state.availableContracts.map((c, i) => {
        const repGate = c.minReputation > 0 ? `[Rep>=${c.minReputation}]` : '[Open]';
        return `  ${i + 1}. ${padRight(c.title, 26)} ${padLeft(formatUsd(c.rewardCash), 9)}  +${padLeft(
          `${c.rewardRp}RP`,
          5
        )}  ${padLeft(`${c.durationSteps}st`, 4)}  ${padRight(repGate, 10)} ${c.description}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `ENTERPRISE CLIENT CONTRACTS (Rep: ${Math.round(
            state.mediaCredibility
          )}/100 · Won: ${state.stats.contractsCompleted} · Failed: ${state.stats.contractsFailed})`,
        },
        { kind: 'PRE', text: `${activeTxt}\n\nOPEN BOARD:\n${boardRows.join('\n')}` },
        {
          kind: 'TEXT',
          text: `Run "contract accept <1..${state.availableContracts.length}>" to lock a deal, or "contract abandon" to drop active contract.`,
        },
      ]);
      return;
    }

    if (cmd === 'contract') {
      if (!checkSystemUnlocked('contracts', 'Enterprise Contracts')) return;
      if (arg1 === 'accept') {
        const idx = parseInt(arg2, 10) - 1;
        const target = state.availableContracts[idx];
        if (!target) {
          append([{ kind: 'ERR', text: `Usage: contract accept <1..${state.availableContracts.length}>` }]);
          return;
        }
        const res = onAcceptContract(target.id);
        append([
          res.ok
            ? { kind: 'OK', text: `Accepted contract: ${target.title} (${target.stepsRemaining}st deadline).` }
            : { kind: 'ERR', text: res.reason ?? 'Cannot accept contract.' },
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
      append([{ kind: 'ERR', text: 'Usage: contract <accept <#>|abandon>' }]);
      return;
    }

    if (cmd === 'rivals') {
      if (!checkSystemUnlocked('rivals', 'Rival Syndicates')) return;
      maybeShowContextualGuide('ctx_rivals');
      if (arg1 === 'compare' || arg1 === 'rank' || arg1 === 'leaderboard') {
        append([
          { kind: 'HEAD', text: 'INDUSTRY BENCHMARK & MARKET SHARE COMPARISON' },
          { kind: 'PRE', text: formatRivalsComparison(state) },
        ]);
        return;
      }
      if (arg1 === 'markets' || arg1 === 'market') {
        const coin = arg2?.toUpperCase();
        if (coin && !Object.hasOwn(state.coins, coin)) {
          append([{ kind: 'ERR', text: `Unknown market "${coin}". Use "rivals markets" to list coins.` }]);
          return;
        }
        append([
          { kind: 'HEAD', text: 'RIVAL MINING DESKS' },
          { kind: 'PRE', text: formatRivalMarkets(state, coin) },
        ]);
        return;
      }
      if (['investigate', 'scout', 'intel', 'log', 'history'].includes(arg1)) {
        const idx = Number(arg2) - 1;
        const rival = state.rivals[idx];
        if (!rival) {
          append([{ kind: 'ERR', text: `Usage: rivals ${arg1} <1..${state.rivals.length}>` }]);
          return;
        }
        if (arg1 === 'intel') {
          append([{ kind: hasRivalIntel(rival, state.stepCount) ? 'PRE' : 'TEXT', text: formatRivalIntel(state, rival) }]);
        } else if (arg1 === 'log' || arg1 === 'history') {
          const moves = rival.decisions ?? [];
          append([
            { kind: 'HEAD', text: `PUBLIC FILINGS · ${rival.name}` },
            { kind: 'PRE', text: moves.length ? moves.map((move) => `  Step ${move.step}  ${move.summary}`).join('\n') : `  ${rival.lastActionSummary}` },
          ]);
        } else {
          const res = onInvestigateRival(idx);
          append([{ kind: res.ok ? 'PRE' : 'ERR', text: res.summary }]);
        }
        return;
      }
      const header = `  #  ${padRight('SYNDICATE', 24)} ${padRight('DESKS', 12)} ${padRight(
        'STRATEGY',
        21
      )} ${padLeft('HASH IDX', 9)} ${padLeft('SHARE', 7)}  STATUS / MOVE`;
      const rows = state.rivals.map((rv, i) => {
        const reconNote =
          hasRivalIntel(rv, state.stepCount)
            ? ` [INTEL${rv.project ? ` · project due in ${Math.max(1, rv.project.completesAt - state.stepCount)}st` : ''}]`
            : '';
        const st =
          rv.disruptedSteps > 0
            ? `[DISRUPTED ${rv.disruptedSteps}st]`
            : `${rv.lastActionSummary}${reconNote}`;
        return `  ${padRight(String(i + 1), 2)} ${padRight(rv.name, 24)} ${padRight(
          rv.secondaryCoin && rv.secondaryCoin !== rv.specialtyCoin ? `${rv.specialtyCoin}/${rv.secondaryCoin}` : rv.specialtyCoin,
          12
        )} ${padRight(getRivalStrategyLabel(rv.strategy), 21)} ${padLeft(
          rv.hashPowerIndex.toLocaleString('en-US'),
          9
        )} ${padLeft(`${rv.marketSharePct.toFixed(1)}%`, 7)}  ${st}`;
      });
      const sampleRecon = state.rivals[0] ? formatUsd(getRivalInvestigateCost(state, state.rivals[0])) : '$220';
      append([
        { kind: 'HEAD', text: 'RIVAL MINING SYNDICATES' },
        { kind: 'PRE', text: [header, '-'.repeat(header.length + 14), ...rows].join('\n') },
        {
          kind: 'TEXT',
          text: `Use "rivals markets [COIN]" to see where they compete, "rivals log <#>" for recent moves, and "rivals investigate <#>" (from ${sampleRecon}) for 12 steps of project intel. "rivals compare" shows overall rank.`,
        },
      ]);
      return;
    }

    if (cmd === 'leaderboard' || cmd === 'season' || cmd === 'seasons') {
      const hashIndex = estimateFleetHashIndex(state);
      const standings = buildSeasonStandings(state, hashIndex);
      const season = getSeasonStatus(state.stepCount);
      const playerRank = standings.findIndex((s) => s.isPlayer) + 1;
      const header = `  #  ${padRight('OPERATOR', 24)} ${padLeft('SEASON SCORE', 13)} ${padLeft(
        'HASH IDX',
        9
      )} ${padLeft('VALUATION', 11)}`;
      const rows = standings.map(
        (s, i) =>
          `  ${padRight(`${i + 1}.`, 3)} ${padRight(s.isPlayer ? `${s.name} (you)` : s.name, 24)} ${padLeft(
            formatUsd(s.score),
            13
          )} ${padLeft(String(Math.round(s.hashIndex)), 9)} ${padLeft(formatUsd(s.valuationUsd, true), 11)}`
      );
      const history = state.seasonHistory ?? [];
      const historyLines =
        history.length === 0
          ? ['  No completed seasons yet — the current one closes at step ' + season.endsAtStep + '.']
          : history
              .slice(0, 4)
              .map(
                (h) =>
                  `  S${h.seasonId} ${padRight(h.label, 18)} champion: ${padRight(
                    h.standings[0]?.name ?? '—',
                    22
                  )} you finished #${h.playerRank}`
              );
      append([
        {
          kind: 'HEAD',
          text: `SEASON ${season.seasonId} · ${season.label.toUpperCase()} — step ${state.stepCount}/${season.endsAtStep} (${season.stepsRemaining} left)`,
        },
        { kind: 'PRE', text: [header, '-'.repeat(header.length + 12), ...rows].join('\n') },
        { kind: 'HEAD', text: 'HALL OF FAME' },
        { kind: 'PRE', text: historyLines.join('\n') },
        {
          kind: 'TEXT',
          text: `You are #${playerRank} of ${standings.length} this season. Seasons close every ${SEASON_LENGTH_STEPS} steps; standings are archived automatically.`,
        },
      ]);
      return;
    }

    // (ops and blackmarket handled by handleOpsAndBlackMarketCommand)

    if (cmd === 'staff') {
      if (!checkSystemUnlocked('staff', 'Employee Management')) return;
      maybeShowContextualGuide('ctx_staff');
      if (arg1 === 'bonus') {
        if (!arg2) {
          append([{ kind: 'ERR', text: 'Usage: staff bonus <staff#|all>' }]);
          return;
        }
        const target = arg2 === 'all' ? 'ALL' : parseInt(arg2, 10) - 1;
        if (target !== 'ALL' && isNaN(target)) {
          append([{ kind: 'ERR', text: 'Usage: staff bonus <staff#|all>' }]);
          return;
        }
        const res = onBonusStaff(target);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'negotiate' || arg1 === 'settle') {
        const res = onNegotiateStrike();
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }

      const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
      const wl = computeWorkloadSummary(state);
      const totals = getFacilityTotals(state);
      const strike = state.strikeStepsRemaining ?? 0;

      const roster =
        state.employees.length === 0
          ? '  (none hired)'
          : state.employees
              .map((e, i) => {
                const eff = Math.round(getEmployeeEfficiencyMult(e, strike) * 100);
                const morale = Math.round(e.morale ?? 85);
                return `  #${i + 1} ${padRight(e.name, 16)} ${padRight(e.role, 13)} Lv${e.skillLevel ?? 1} Morale:${padLeft(
                  `${morale}%`,
                  4
                )} Eff:${padLeft(`${eff}%`, 4)} ${padRight(e.shift, 13)} ${e.priority}`;
              })
              .join('\n');
      const keyMap: Record<EmployeeRole, string> = {
        TECHNICIAN: 'tech',
        ELECTRICIAN: 'elec',
        MANAGER: 'mgr',
        SYS_ENGINEER: 'eng',
        RESEARCHER: 'res',
        PR_STRATEGIST: 'pr',
        ANALYST: 'analyst',
      };
      const catalog = EMPLOYEE_SPECS.map((s) => {
        const ok = state.devUnlockAll || facIdx >= s.unlockFacilityIndex;
        return `  hire ${padRight(keyMap[s.role], 8)} ${padRight(s.title, 22)} Hire:${padLeft(
          formatUsd(s.hireCost),
          7
        )}  Sal:${padLeft(formatUsd(s.cycleSalary), 7)}/cyc  ${
          ok ? '[OK]' : `[At ${FACILITY_TIERS[s.unlockFacilityIndex].name}]`
        }\n      ${s.summary}`;
      }).join('\n');
      append([
        {
          kind: wl.strikeActive ? 'ERR' : wl.workloadPct > 125 ? 'WARN' : 'HEAD',
          text: `STAFF ROSTER · WORKLOAD: ${wl.workloadPct}% (${wl.statusLabel}) · AVG MORALE: ${wl.avgMorale}% · PAYROLL: ${formatUsd(
            totals.cyclePayrollUsd
          )}/cyc`,
        },
        ...(wl.strikeActive
          ? [
              {
                kind: 'ERR' as const,
                text: `[!] ACTIVE LABOR STRIKE (${wl.strikeStepsRemaining} steps left): -35% mining output, 0% crew bonuses! Run "staff negotiate" to settle.`,
              },
            ]
          : []),
        { kind: 'PRE', text: `ACTIVE CREW (Cap ${wl.capacityUnits} vs Demand ${wl.demandUnits}):\n${roster}\n\nRECRUIT:\n${catalog}` },
        {
          kind: 'TEXT',
          text: 'Commands: "hire <role>", "train <#>", "staff bonus <#|all>", "staff negotiate", "shift <#> <day|night|24/7>", "priority <#> <thermal|care|hash|research>", "fire <#>".',
        },
      ]);
      return;
    }

    if (cmd === 'hire') {
      if (!checkSystemUnlocked('staff', 'Employee Management')) return;
      const roleMap: Record<string, EmployeeRole> = {
        tech: 'TECHNICIAN',
        technician: 'TECHNICIAN',
        elec: 'ELECTRICIAN',
        electrician: 'ELECTRICIAN',
        mgr: 'MANAGER',
        manager: 'MANAGER',
        eng: 'SYS_ENGINEER',
        engineer: 'SYS_ENGINEER',
        res: 'RESEARCHER',
        researcher: 'RESEARCHER',
        pr: 'PR_STRATEGIST',
        analyst: 'ANALYST',
      };
      const role = roleMap[arg1];
      if (!role) {
        append([{ kind: 'ERR', text: 'Usage: hire <tech|elec|mgr|eng|res|pr|analyst>' }]);
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

    if (cmd === 'train') {
      if (!checkSystemUnlocked('staff', 'Employee training')) return;
      const idx = parseInt(arg1, 10) - 1;
      if (isNaN(idx) || !state.employees[idx]) {
        append([{ kind: 'ERR', text: 'Usage: train <staff#>' }]);
        return;
      }
      const res = onTrainEmployee(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
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
      if (!checkSystemUnlocked('staff', 'Employee management')) return;
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
      maybeShowContextualGuide('ctx_research');
      if (arg1 === 'done' || arg1 === 'completed') {
        const completed = RESEARCH_NODES.filter((n) => state.unlockedResearch.includes(n.id));
        const doneRows =
          completed.length === 0
            ? '  (No technologies completed yet.)'
            : completed
                .map((n, i) => `  ${i + 1}. [${padRight(n.category, 10)}] ${padRight(n.name, 34)} ${n.effectSummary}`)
                .join('\n');
        append([
          { kind: 'HEAD', text: `COMPLETED R&D (${completed.length}/${RESEARCH_NODES.length})` },
          { kind: 'PRE', text: doneRows },
        ]);
        return;
      }

      const accessible = getAccessibleResearch();
      if (arg1 === 'start' && arg2) {
        const idx = parseInt(arg2, 10) - 1;
        const node =
          !isNaN(idx) && accessible[idx]
            ? accessible[idx]
            : accessible.find(
                (n) => n.id.toLowerCase() === arg2 || n.id.toLowerCase() === `res_${arg2}`
              );
        if (!node) {
          append([{ kind: 'ERR', text: `Available research "${arg2}" not found. Run "research" to list.` }]);
          return;
        }
        const ok = onStartResearch(node.id);
        append([
          ok
            ? { kind: 'OK', text: `Started R&D: ${node.name}.` }
            : { kind: 'ERR', text: 'Cannot start research (busy or insufficient cash).' },
        ]);
        return;
      }

      const rows = accessible.map((n, i) => {
        const active = state.activeResearchId === n.id;
        const status = active
          ? `[ACTIVE ${Math.round(state.activeResearchProgress)}/${n.costRp}]`
          : '[READY]';
        return `  ${i + 1}. [${padRight(n.category, 10)}] ${padRight(n.name, 31)} ${padLeft(`${n.costRp} RP`, 6)} ${padLeft(
          formatUsd(n.costCash),
          7
        )}  ${padRight(status, 14)} ${n.effectSummary}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `R&D TECH TREE (${state.researchPoints.toFixed(1)} RP · ${state.unlockedResearch.length}/${RESEARCH_NODES.length} completed)`,
        },
        {
          kind: 'PRE',
          text:
            rows.length > 0
              ? rows.join('\n')
              : '  All currently accessible R&D projects have been completed.',
        },
        {
          kind: 'TEXT',
          text:
            accessible.length > 0
              ? `Run "research start <1..${accessible.length}>" to begin an available project, or "research done" to review completed tech.`
              : 'Run "research done" to inspect completed technologies.',
        },
      ]);
      return;
    }

    if (cmd === 'valuation') {
      append([
        { kind: 'HEAD', text: 'COMPANY VALUATION & FLEET ROI AUDIT' },
        { kind: 'PRE', text: formatValuationReport(state) },
      ]);
      return;
    }

    if (cmd === 'stats' || cmd === 'analytics') {
      if (arg1 === 'chart' || arg1 === 'charts') {
        append([
          { kind: 'HEAD', text: 'ASCII HISTORICAL PERFORMANCE CHARTS' },
          { kind: 'PRE', text: formatPortfolioChart(state, 'portfolio') },
        ]);
        return;
      }
      if (arg1 === 'valuation' || arg1 === 'roi' || arg1 === 'value') {
        append([
          { kind: 'HEAD', text: 'COMPANY VALUATION & FLEET ROI AUDIT' },
          { kind: 'PRE', text: formatValuationReport(state) },
        ]);
        return;
      }
      append([
        { kind: 'HEAD', text: 'COMPANY FINANCIAL & OPERATIONAL ANALYTICS' },
        { kind: 'PRE', text: formatStatsReport(state) },
        { kind: 'TEXT', text: 'Tips: Run "valuation" (or "stats roi") for asset breakdown & ROI, or "chart portfolio" for ASCII trends.' },
      ]);
      return;
    }

    if (cmd === 'history' || cmd === 'tx' || cmd === 'transactions') {
      const catMap: Record<string, TransactionCategory> = {
        hardware: 'HARDWARE',
        hw: 'HARDWARE',
        sale: 'SALE',
        repair: 'REPAIR',
        facility: 'FACILITY',
        power: 'POWER',
        staff: 'STAFF',
        contract: 'CONTRACT',
        research: 'RESEARCH',
        event: 'EVENT',
        reward: 'REWARD',
        exchange: 'EXCHANGE',
        trade: 'EXCHANGE',
        fab: 'FAB',
        foundry: 'FAB',
      };
      const filterCat = arg1 ? catMap[arg1] : undefined;
      if (arg1 && !filterCat && arg1 !== 'all') {
        append([
          {
            kind: 'ERR',
            text: 'Filter options: hardware, sale, repair, facility, power, staff, contract, research, event, reward, exchange, fab',
          },
        ]);
        return;
      }
      append([
        {
          kind: 'HEAD',
          text: `TRANSACTION HISTORY (${filterCat ?? 'ALL'} · ${(state.transactions ?? []).length} entries)`,
        },
        { kind: 'PRE', text: formatTransactionHistory(state, filterCat ?? 'ALL') },
      ]);
      return;
    }

    if (cmd === 'milestones') {
      append([
        {
          kind: 'HEAD',
          text: `COMPANY MILESTONES (${(state.unlockedMilestones ?? []).length}/${MILESTONES.length})`,
        },
        { kind: 'PRE', text: formatMilestonesReport(state) },
      ]);
      return;
    }

    if (cmd === 'achievements') {
      append([
        {
          kind: 'HEAD',
          text: `CAREER ACHIEVEMENTS (${(state.unlockedAchievements ?? []).length}/${ACHIEVEMENTS.length})`,
        },
        { kind: 'PRE', text: formatAchievementsReport(state) },
      ]);
      return;
    }

    if (cmd === 'challenges') {
      if (arg1 === 'start' && arg2) {
        const idx = parseInt(arg2, 10) - 1;
        const spec = CHALLENGES[idx] ?? CHALLENGES.find((c) => c.id === arg2);
        if (!spec) {
          append([{ kind: 'ERR', text: `Usage: challenges start <1..${CHALLENGES.length}>` }]);
          return;
        }
        const res = onStartChallenge(spec.id);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      append([
        { kind: 'HEAD', text: 'OPERATIONAL CHALLENGES' },
        { kind: 'PRE', text: formatChallengesReport(state) },
        { kind: 'TEXT', text: `Run "challenges start <1..${CHALLENGES.length}>" to activate an optional challenge.` },
      ]);
      return;
    }

    if (cmd === 'save') {
      if (state.isDevSession) {
        append([{ kind: 'TEXT', text: 'This Dev session is temporary. Manage saved games from the title menu.' }]);
        return;
      }
      if (arg1 === 'backup') {
        const ok = onBackupSave();
        append([{ kind: ok ? 'OK' : 'ERR', text: ok ? 'Local save backup updated.' : 'Failed to create backup.' }]);
        return;
      }
      if (arg1 === 'restore') {
        const ok = onRestoreBackup();
        append([{ kind: ok ? 'OK' : 'ERR', text: ok ? 'Restored local backup.' : 'No local backup found.' }]);
        return;
      }
      if (arg1 === 'export') {
        const raw = onExportSave();
        if (!raw) {
          append([{ kind: 'ERR', text: 'Nothing to export.' }]);
          return;
        }
        try {
          const blob = new Blob([raw], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `blockworks-${state.isSandbox ? 'sandbox' : 'career'}-step${state.stepCount}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          append([{ kind: 'OK', text: 'Downloaded JSON save file.' }]);
        } catch {
          append([{ kind: 'ERR', text: 'Browser blocked file download; use Main Menu -> Saves to copy JSON.' }]);
        }
        return;
      }
      append([{ kind: 'ERR', text: 'Usage: save <backup|restore|export>' }]);
      return;
    }

    if (cmd === 'ledger') {
      if (arg1 === 'chart' || arg1 === 'charts') {
        append([
          { kind: 'HEAD', text: 'LEDGER PERFORMANCE CHARTS' },
          { kind: 'PRE', text: formatPortfolioChart(state, 'profit') },
        ]);
        return;
      }
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
      )} ${padLeft('RENT', 9)} ${padLeft('PAYROLL', 9)} ${padLeft('OPERATING', 11)} ${padLeft('NET CASH', 11)}`;
      const rows = state.ledger.slice(0, 12).map((l) => {
        return `  ${padRight(l.label, 16)} ${padLeft(formatUsd(l.miningRevenueUsd), 11)} ${padLeft(
          '-' + formatUsd(l.electricityCostUsd),
          9
        )} ${padLeft('-' + formatUsd(l.rentCostUsd), 9)} ${padLeft(
          '-' + formatUsd(l.payrollCostUsd),
          9
        )} ${padLeft(formatUsd(getCycleOperatingProfit(l)), 11)} ${padLeft(formatUsd(l.netCashflowUsd), 11)}`;
      });
      append([
        { kind: 'HEAD', text: '30-STEP CYCLE FINANCIAL LEDGER' },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        { kind: 'TEXT', text: 'OPERATING deducts power, rent, payroll, and maintenance from mining sales. Cycles with positive OPERATING count toward Guided milestones. NET CASH also reflects other spending. Run "ledger chart" for trends.' },
      ]);
      return;
    }

    if (cmd === 'pr') {
      if (!checkSystemUnlocked('pr', 'PR Campaigns')) return;
      maybeShowContextualGuide('ctx_pr');
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
      if (!state.isDevSession || !state.devMode) {
        append([{ kind: 'WARN', text: 'Run "dev on" to open a temporary copy before using developer commands.' }]);
        return;
      }
      if (arg1 === 'proto' || arg1 === 'qa') {
        const outcomes = { pass: 'PASSED', marginal: 'MARGINAL', fail: 'FAILED_FLAW' } as const;
        const forced = Object.hasOwn(outcomes, arg3) ? outcomes[arg3 as keyof typeof outcomes] : undefined;
        const blueprint = Number(arg2) - 1;
        const result = arg1 === 'proto' && forced && Number.isSafeInteger(blueprint) && blueprint >= 0
          ? allProps.onRunPrototypeTest(blueprint, forced)
          : arg1 === 'qa' && (arg2 === 'pass' || arg2 === 'scrap')
            ? onDevFinishFabBatch(arg2 === 'pass' ? 'PASS' : 'SCRAP')
            : { ok: false, summary: 'Usage: dev proto <blueprint#> <pass|marginal|fail> or dev qa <pass|scrap>.' };
        append([{ kind: result.ok ? 'OK' : 'ERR', text: result.summary }]);
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
        const result = onStepSteps(n);
        if (result?.stepsRun) {
          append([{ kind: 'OK', text: `Advanced +${result.stepsRun} steps.` }]);
        }
        return;
      }
      if (arg1 === 'research') {
        onDevUnlockAllResearch();
        append([{ kind: 'OK', text: 'Unlocked all R&D nodes.' }]);
        return;
      }
      if (arg1 === 'facilities') {
        onDevOwnAllFacilities();
        append([{ kind: 'OK', text: `Granted ownership of all ${FACILITY_TIERS.length} facilities.` }]);
        return;
      }
      if (arg1 === 'coins') {
        onDevUnlockAllCoins();
        append([{ kind: 'OK', text: `Unlocked all ${Object.keys(state.coins).length} coin tiers.` }]);
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
      if (arg1 === 'inv' || arg1 === 'investigation') {
        const stageMap: Record<string, InvestigationStage> = {
          none: 'NONE',
          watchlist: 'WATCHLIST',
          audit: 'FORMAL_AUDIT',
          formal_audit: 'FORMAL_AUDIT',
          sanctioned: 'SANCTIONED',
          probation: 'PROBATION',
        };
        const stage = stageMap[arg2];
        if (!stage) {
          append([{ kind: 'ERR', text: 'Usage: dev inv <none|watchlist|audit|sanctioned|probation> [marks]' }]);
          return;
        }
        const marks = arg3 ? Math.max(0, parseInt(arg3, 10) || 0) : undefined;
        onDevSetInvestigationStage(stage, marks);
        append([{ kind: 'OK', text: `Investigation stage set to ${stage}${marks !== undefined ? ` (${marks} marks)` : ''}.` }]);
        return;
      }
      if (arg1 === 'batch') {
        const validCats: PartCategory[] = ['chassis', 'compute', 'gpu', 'storage', 'psu', 'cooling', 'os'];
        const cat = validCats.includes(arg2 as PartCategory) ? (arg2 as PartCategory) : 'compute';
        const qty = Math.max(1, Math.min(20, parseInt(arg3 || '2', 10) || 2));
        const res = onDevGrantFabBatch(cat, qty);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'coin') {
        const sym = arg2 ? arg2.toUpperCase() : undefined;
        const algoRaw = (arg3 || '').toUpperCase() as MiningAlgorithm;
        const validAlgos: MiningAlgorithm[] = ['SHA256', 'SCRYPT', 'RANDOMX', 'ETHASH', 'KAWPOW', 'EQUIHASH', 'POST', 'QHASH'];
        const algo = validAlgos.includes(algoRaw) ? algoRaw : undefined;
        const coinName = parts.slice(4).join(' ') || undefined;
        const res = onDevLaunchCustomCoin(sym, coinName, algo);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
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
      append([{ kind: 'ERR', text: 'Usage: dev <on|off|panel|event|raid|regime X|halve COIN|heat N|inv STAGE|batch CAT QTY|coin SYM ALGO|blackmarket|...>' }]);
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
          ...Array.from(
            {
              length: Math.min(
                4,
                getUnlockedGpus().length + getMatchingFabStock('gpu', wizard.config).length
              ),
            },
            (_, idx) => ({ label: String(idx + 1), cmd: String(idx + 1) })
          ),
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
      : (() => {
          const ch = getEffectivePartBundle(wizard.config).chassis;
          const isAsicOnly = Boolean(ch.isAsicRack && ch.maxGpus === 0);
          const count =
            wizard.step === 'CHASSIS'
              ? getUnlockedChassis().length + getMatchingFabStock('chassis', wizard.config).length
              : wizard.step === 'COMPUTE'
              ? (ch.maxAsics >= 1 && ch.maxGpus > 0
                  ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok).length
                  : getUnlockedComputeFor(isAsicOnly).length) +
                getMatchingFabStock('compute', wizard.config).length
              : wizard.step === 'STORAGE'
              ? getUnlockedStorage().length + getMatchingFabStock('storage', wizard.config).length
              : wizard.step === 'PSU'
              ? getUnlockedPsus().length + getMatchingFabStock('psu', wizard.config).length
              : wizard.step === 'COOLING'
              ? getUnlockedCooling().length + getMatchingFabStock('cooling', wizard.config).length
              : wizard.step === 'OS'
              ? getUnlockedOs().length + getMatchingFabStock('os', wizard.config).length
              : getUnlockedCoins().length;
          return [
            ...Array.from({ length: Math.min(4, count) }, (_, i) => ({
              label: String(i + 1),
              cmd: String(i + 1),
            })),
            ...(wizard.step === 'CHASSIS' && getUnlockedPresets().length > 0
              ? [{ label: 'preset 1', cmd: 'preset 1' }]
              : []),
            { label: 'back', cmd: 'back' },
            { label: 'cancel', cmd: 'cancel' },
          ];
        })()
    : fabWizard
    ? fabWizard.step === 'ENGINEERING'
      ? [
          { label: 'density +1', cmd: 'density +1' },
          { label: 'eff +1', cmd: 'eff +1' },
          { label: 'therm +1', cmd: 'therm +1' },
          { label: 'qa +1', cmd: 'qa +1' },
          ...(state.devUnlockAll || getUnlockedSystems(state).gen7
            ? [
                { label: 'branch quantum', cmd: 'branch quantum' },
                { label: 'branch photonic', cmd: 'branch photonic' },
              ]
            : []),
          { label: 'preset perf', cmd: 'preset perf' },
          { label: 'preset eff', cmd: 'preset eff' },
          { label: 'done', cmd: 'done' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : fabWizard.step === 'REVIEW'
      ? [
          { label: 'tapeout', cmd: 'tapeout' },
          { label: 'draft', cmd: 'draft' },
          { label: 'profile perf', cmd: 'profile perf' },
          { label: 'profile eff', cmd: 'profile eff' },
          { label: 'profile compact', cmd: 'profile compact' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : (() => {
          const count =
            fabWizard.step === 'CATEGORY'
              ? getUnlockedFabCategories(state).length
              : fabWizard.step === 'ARCHITECTURE'
              ? getUnlockedFabArchitectures(state, fabWizard.partCategory).length
              : fabWizard.step === 'NODE'
              ? getUnlockedFabNodes(state, fabWizard.partCategory).length
              : fabWizard.step === 'FOCUS'
              ? getFocusOptionsForDesign(fabWizard.partCategory, fabWizard.architecture).length
              : getUnlockedFabSubFeatures(state).length;
          return [
            ...Array.from({ length: Math.min(4, count) }, (_, i) => ({
              label: String(i + 1),
              cmd: String(i + 1),
            })),
            ...(fabWizard.step !== 'CATEGORY' ? [{ label: 'back', cmd: 'back' }] : []),
            { label: 'cancel', cmd: 'cancel' },
          ];
        })()
    : coinWizard
    ? coinWizard.step === 'SYMBOL_NAME'
      ? [
          { label: 'SOLR SolarisNet', cmd: 'SOLR SolarisNet' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : coinWizard.step === 'ALGO'
      ? [
          ...COIN_ALGOS.slice(0, 6).map((a, idx) => ({
            label: `${idx + 1}. ${a}`,
            cmd: String(idx + 1),
          })),
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : coinWizard.step === 'ECONOMICS'
      ? [
          { label: 'liq 2500', cmd: 'liq 2500' },
          { label: 'liq 10000', cmd: 'liq 10000' },
          { label: 'halve 90', cmd: 'halve 90' },
          { label: 'fee 2', cmd: 'fee 2' },
          { label: 'done', cmd: 'done' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : coinWizard.step === 'REQUIREMENTS'
      ? [
          { label: 'vram 8', cmd: 'vram 8' },
          { label: 'ram 16', cmd: 'ram 16' },
          { label: 'done', cmd: 'done' },
          { label: 'back', cmd: 'back' },
          { label: 'cancel', cmd: 'cancel' },
        ]
      : [
          { label: 'launch', cmd: 'launch' },
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
          ...(getUnlockedGpus().length > 0 ? [{ label: 'add 1', cmd: 'add 1' }] : []),
          { label: 'remove 1', cmd: 'remove 1' },
          { label: 'clear', cmd: 'clear' },
          { label: 'back', cmd: 'back' },
          { label: 'done', cmd: 'done' },
        ]
      : (() => {
          const rig = state.rigs[tinker.rigIndex];
          const ch = rig ? getEffectivePartBundle(rig).chassis : CHASSIS_PARTS[0];
          const count =
            tinker.slot === 'chassis'
              ? getUnlockedChassis().length
              : tinker.slot === 'compute'
              ? ch.maxAsics >= 1 && ch.maxGpus > 0
                ? COMPUTE_PARTS.filter((c) => isPartUnlocked(c.researchRequired).ok).length
                : getUnlockedComputeFor(Boolean(ch.isAsicRack && ch.maxGpus === 0)).length
              : tinker.slot === 'storage'
              ? getUnlockedStorage().length
              : tinker.slot === 'psu'
              ? getUnlockedPsus().length
              : tinker.slot === 'cooling'
              ? getUnlockedCooling().length
              : getUnlockedOs().length;
          return [
            ...Array.from({ length: Math.min(3, count) }, (_, i) => ({
              label: String(i + 1),
              cmd: String(i + 1),
            })),
            { label: 'back', cmd: 'back' },
            { label: 'done', cmd: 'done' },
          ];
        })()
    : [
        ...(state.tutorialStep && state.tutorialStep > 0
          ? [
              { label: 'tutorial next', cmd: 'tutorial next' },
              { label: 'tutorial skip', cmd: 'tutorial skip' },
            ]
          : []),
        ...(state.onboardingMode === 'GUIDED' ? [{ label: 'guide', cmd: 'guide' }] : []),
        { label: 'status', cmd: 'status' },
        { label: userPaused ? 'resume' : 'pause', cmd: userPaused ? 'resume' : 'pause' },
        { label: 'step 1', cmd: 'step 1' },
        { label: 'step 5', cmd: 'step 5' },
        { label: 'rigs', cmd: 'rigs' },
        { label: 'overclock', cmd: 'overclock' },
        { label: 'tinker 1', cmd: 'tinker 1' },
        { label: 'build rig', cmd: 'build rig' },
        { label: 'coins', cmd: 'coins' },
        ...(state.devUnlockAll || getUnlockedSystems(state).fab ? [{ label: 'fab', cmd: 'fab' }] : []),
        { label: 'market', cmd: 'market' },
        { label: 'contracts', cmd: 'contracts' },
        { label: 'ops', cmd: 'ops' },
        { label: 'help', cmd: 'help' },
      ];

  const facility = getFacility(state.facilityId);
  const maxRigs = getEffectiveFacilityMaxRigs(state);
  const totals = getFacilityTotals(state);
  const effectiveCap = getEffectiveFacilityPowerCapKw(state);
  const enabledCount = state.rigs.filter((r) => r.enabled).length;
  const coolingSummary = computeFacilityCoolingSummary(
    state.coolingUnits ?? [],
    enabledCount,
    facility,
    state.facilityUpgrades
  );
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
          <span
            className="text-green-400 font-semibold matrix-glow"
            title="Current facility stage (run 'facilities' to inspect/upgrade)"
          >
            {facility.name}
          </span>
          <span className="text-green-700">·</span>
          <span
            className="tabular-nums text-green-200/90"
            title="Active & installed rigs / facility slot capacity"
          >
            Rigs {totals.rigCount}/{maxRigs}
          </span>
          <span className="text-green-700">·</span>
          <span
            title="Total fleet + cooling kW draw vs facility breaker limit (overload trips breakers)"
            className={
              totals.totalPowerKw > effectiveCap
                ? 'text-rose-400 tabular-nums font-semibold'
                : 'tabular-nums text-green-200/90'
            }
          >
            Power {totals.totalPowerKw.toFixed(2)}/{effectiveCap} kW
          </span>
          <span className="text-green-700">·</span>
          <span
            title="Peak acoustic output vs zoning limit (exceeding triggers fines every 5 steps)"
            className={
              totals.maxNoiseDba > facility.noiseLimitDba
                ? 'text-rose-400 tabular-nums font-semibold'
                : 'tabular-nums text-green-200/90'
            }
          >
            Noise {totals.maxNoiseDba}/{facility.noiseLimitDba} dBA
          </span>
          <span className="text-green-700">·</span>
          <span
            className="text-emerald-300 tabular-nums"
            title="Combined room cooling & ventilation offset per active rig"
          >
            Cool -{coolingSummary.effectiveCoolingPerRigC.toFixed(1)}°C/rig
          </span>
          <span className="text-green-700">·</span>
          <span
            className="text-green-300 tabular-nums"
            title="Research Points spent in 'research' to unlock new hardware & upgrades"
          >
            {state.researchPoints.toFixed(1)} RP
          </span>
          <span className="text-green-700">·</span>
          <span
            title="Regulatory Scrutiny (0-100): >=55 increases audit & raid risk"
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
            Decision Active · Auto-Paused
          </span>
        ) : wizard ? (
          <span className="text-amber-300 font-semibold">
            Rig Builder ({wizard.step}) · Auto-Paused
          </span>
        ) : fabWizard ? (
          <span className="text-amber-300 font-semibold">
            Fab Designer ({fabWizard.step}) · Auto-Paused
          </span>
        ) : coinWizard ? (
          <span className="text-amber-300 font-semibold">
            Coin Creator ({coinWizard.step}) · Auto-Paused
          </span>
        ) : tinker ? (
          <span className="text-amber-300 font-semibold">
            Tinker Workbench · Auto-Paused
          </span>
        ) : autoPauseReason ? (
          <span className="text-amber-300 font-semibold tabular-nums">
            Auto-Step Paused ({autoPauseReason})
          </span>
        ) : (
          <span className="text-green-400/90 tabular-nums">
            Auto-Step in {autoCountdown}s
          </span>
        )}
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
              title={`Execute "${chip.cmd}"`}
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
              : fabWizard
              ? `fab(${fabWizard.step.toLowerCase()})>`
              : coinWizard
              ? `coin(${coinWizard.step.toLowerCase()})>`
              : tinker
              ? `tinker(R${tinker.rigIndex + 1}${tinker.slot === 'MENU' ? '' : `:${tinker.slot}`})>`
              : 'miner@hashrate:~$'}
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
                : fabWizard
                ? 'Type option #, engineering cmd, "back", or "cancel"...'
                : coinWizard
                ? 'Type ticker/algo/liq cmd, "launch", "back", or "cancel"...'
                : tinker
                ? 'Pick slot or part #, "back", or "done"...'
                : 'Type a command ("guide", "step 5", "fab design", "coin create", "help")...'
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
