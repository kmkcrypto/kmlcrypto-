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
  ILLICIT_MOD_SPECS,
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
import { getRivalStrategyLabel } from '../engine/rivals';
import {
  buildSeasonStandings,
  getSeasonStatus,
  SEASON_LENGTH_STEPS,
} from '../engine/leaderboard';
import { getShellCoins } from '../engine/underground';
import { computeMarketSensitivity, computeRigContributions } from '../engine/economics';
import { formatWorldReport } from '../engine/world';
import {
  BILLING_CYCLE_STEPS,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  calculateRigResaleValue,
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  computeStepCoinOutput,
  computeWorkloadSummary,
  ensureRigComponentHealth,
  formatAsciiFloorPlan,
  formatFabStatusReport,
  formatMarketForecastReport,
  formatSingleRoomView,
  formatWalletAndExchangeReport,
  estimateFleetHashIndex,
  getAutoSellMultiplier,
  getComponentRepairCost,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getEmployeeEfficiencyMult,
  getEmpireAlignment,
  getFacility,
  getFacilityRooms,
  getFacilityTotals,
  getFacilityUpgradeCost,
  getPowerContract,
  getRigRepasteCost,
  getRigRepairCost,
  getRivalInvestigateCost,
  getSysEngineerBonus,
  resolveCoolerRoomId,
} from '../engine/simulation';
import { parseDesignProfile } from '../engine/fab';
import { getGlobalHardwarePriceMult, getRigGeneration } from '../engine/usedMarket';
import {
  previewCoolingUnit,
  previewFacilityMove,
  previewRigEconomics,
} from '../engine/previews';
import {
  CODEX_ENTRIES,
  CONTEXTUAL_GUIDES,
  evaluateEarlyObjectives,
  getEffectiveOnboardingMode,
  getUnlockedSystems,
  GuidedSystemId,
  TUTORIAL_TOPICS,
} from '../data/onboarding';
import {
  ChallengeId,
  ChipProcessNode,
  CoinSymbol,
  DesignProfile,
  EmployeeRole,
  FacilityUpgradeId,
  FirmwareProfile,
  GameState,
  MarketRegime,
  MiningAlgorithm,
  OnboardingMode,
  PendingEvent,
  PoolMode,
  PowerContractId,
  RepairComponentSlot,
  RigBuildConfig,
  RoomCoolingType,
  ShiftType,
  TaskPriority,
  TransactionCategory,
} from '../types/game';
import {
  formatCoinAmount,
  formatGameDate,
  formatHashrate,
  formatStepLabel,
  formatUsd,
  renderAsciiBar,
  renderAsciiSparkline,
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
  onSalvageRig: (rigId: string) => number;
  onRetireRig: (rigIndex: number) => { ok: boolean; summary: string };
  onDeployBackupRig: (backupIdx: number) => { ok: boolean; summary: string };
  onSellBackupRig: (backupIdx: number) => { ok: boolean; summary: string };
  onBuyUsedListing: (listingId: string, customName?: string) => { ok: boolean; summary: string };
  onRefreshUsedMarket: () => { ok: boolean; summary: string };
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
  onRepairComponent: (
    rigIndex: number,
    slot: RepairComponentSlot,
    gpuSlotIndex?: number
  ) => { ok: boolean; summary: string };
  onRepasteRigs: (rigIndexOrAll: number | 'ALL') => { ok: boolean; count: number; cost: number };
  onAddCoolingUnit: (type: RoomCoolingType, roomNumber?: number) => boolean;
  onToggleCoolingUnit: (coolingId: string) => void;
  onRemoveCoolingUnit: (coolingId: string) => void;
  onSelectFacility: (facilityId: string, action: 'RENT' | 'BUY') => boolean;
  onBuyFacilityUpgrade: (upgradeId: FacilityUpgradeId) => { ok: boolean; summary: string };
  onSelectPowerContract: (contractId: PowerContractId) => { ok: boolean; summary: string };
  onMoveRigToRoom: (rigIdxOrAll: number | 'ALL', roomNumber: number) => { ok: boolean; summary: string };
  onMoveCoolerToRoom: (unitIdx: number, roomNumber: number) => { ok: boolean; summary: string };
  onExpandFacilityRooms: () => { ok: boolean; summary: string };
  onHireEmployee: (role: EmployeeRole) => boolean;
  onTrainEmployee: (empIdx: number) => { ok: boolean; summary: string };
  onFireEmployee: (employeeId: string) => void;
  onUpdateEmployee: (employeeId: string, shift: ShiftType, priority: TaskPriority) => void;
  onBonusStaff: (empIdxOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onNegotiateStrike: () => { ok: boolean; summary: string };
  onStartResearch: (nodeId: string) => boolean;
  onStartChallenge: (challengeId: ChallengeId) => { ok: boolean; summary: string };
  onLaunchCampaign: (templateId: string, targetCoin: CoinSymbol) => boolean;
  onAcceptContract: (contractId: string) => { ok: boolean; reason?: string };
  onAbandonContract: () => boolean;
  onToggleSiphon: (enable: boolean) => boolean;
  onRentBotnet: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onWashTrade: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onPumpDump: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onExtortRival: (
    rivalId: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onSabotageRival: (rivalId: string) => { ok: boolean; reason?: string; cost?: number };
  onLaunchShellCoin: (
    ticker: string,
    name: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onShillShellCoin: (
    ticker: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onRugShellCoin: (
    ticker: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onRaidRival: (
    rivalId: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onInvestigateRival: (rivalIdx: number) => { ok: boolean; summary: string };
  onCloneRig: (rigIdx: number, qty: number) => { ok: boolean; summary: string };
  onLaunderHeat: () => { ok: boolean; reason?: string; cost?: number };
  onBribeInspectors: () => { ok: boolean; reason?: string; cost?: number };
  onBuyBlackMarket: (listingId: string, rigIdx?: number) => { ok: boolean; summary: string };
  onSetRigPayout: (rigIndexOrAll: number | 'ALL', payoutMode: 'AUTOSELL' | 'HOLD') => { ok: boolean; summary: string };
  onExchangeBuy: (coin: CoinSymbol, usdAmount: number) => { ok: boolean; summary: string };
  onExchangeSell: (coin: CoinSymbol, amountOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onPlaceLimitOrder: (
    side: 'BUY' | 'SELL',
    coin: CoinSymbol,
    targetPriceUsd: number,
    amount: number
  ) => { ok: boolean; summary: string };
  onCancelLimitOrder: (orderIdx: number) => { ok: boolean; summary: string };
  onOpenShort: (coin: CoinSymbol, collateralUsd: number) => { ok: boolean; summary: string };
  onCloseShort: (posIdx: number) => { ok: boolean; summary: string };
  onBuildFabLine: () => { ok: boolean; summary: string };
  onDesignCustomChip: (
    name: string,
    algo: MiningAlgorithm,
    node: ChipProcessNode,
    profile?: DesignProfile
  ) => { ok: boolean; summary: string };
  onQueueFabProduction: (bpIdx: number, qty: number) => { ok: boolean; summary: string };
  onDeployCustomAsic: (invIdx: number, rigIdx: number) => { ok: boolean; summary: string };
  onSellCustomAsic: (invIdx: number, qtyOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onStripCustomAsic: (rigIdx: number) => { ok: boolean; summary: string };
  onBackupSave: () => boolean;
  onRestoreBackup: () => boolean;
  onExportSave: () => string | null;
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
  onMarkTutorialSeen: (guideId: string) => void;
  onSetOnboardingMode: (mode: OnboardingMode) => void;
  onSetSimSpeed: (stepSeconds: number, stepHours?: number) => { ok: boolean; summary: string };
  onClaimObjectives: () => void;
  userPaused: boolean;
  autoPauseReason: string | null;
  autoCountdown: number;
  onSetUserPaused: (paused: boolean) => void;
  onActiveModalChange: (modal: 'BUILDER' | 'TINKER' | null) => void;
}

const TOP_COMMANDS = [
  'help',
  'codex',
  'wiki',
  'objectives',
  'goals',
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
  onRetireRig,
  onDeployBackupRig,
  onSellBackupRig,
  onBuyUsedListing,
  onRefreshUsedMarket,
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
  onRepairComponent,
  onRepasteRigs,
  onAddCoolingUnit,
  onToggleCoolingUnit,
  onRemoveCoolingUnit,
  onSelectFacility,
  onBuyFacilityUpgrade,
  onSelectPowerContract,
  onMoveRigToRoom,
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
  onToggleSiphon,
  onRentBotnet,
  onWashTrade,
  onPumpDump,
  onExtortRival,
  onSabotageRival,
  onLaunchShellCoin,
  onShillShellCoin,
  onRugShellCoin,
  onRaidRival,
  onInvestigateRival,
  onCloneRig,
  onLaunderHeat,
  onBribeInspectors,
  onBuyBlackMarket,
  onSetRigPayout,
  onExchangeBuy,
  onExchangeSell,
  onPlaceLimitOrder,
  onCancelLimitOrder,
  onOpenShort,
  onCloseShort,
  onBuildFabLine,
  onDesignCustomChip,
  onQueueFabProduction,
  onDeployCustomAsic,
  onSellCustomAsic,
  onStripCustomAsic,
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
  onDevRefreshBlackMarket,
  onSetTutorialStep,
  onMarkTutorialSeen,
  onSetOnboardingMode,
  onSetSimSpeed,
  onClaimObjectives,
  userPaused,
  autoPauseReason,
  autoCountdown,
  onSetUserPaused,
  onActiveModalChange,
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

    const stepsToBill =
      BILLING_CYCLE_STEPS - (state.stepCount % BILLING_CYCLE_STEPS || BILLING_CYCLE_STEPS);
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
      : `Locked (${unlockedSys.unlockNotes.contracts.slice(0, 22)}...)`;

    const box = [
      `+================================================================================+`,
      `| ${padRight(
        `${formatStepLabel(state.stepCount)} | ${facility.name}${state.isSandbox ? ' [SANDBOX]' : ''} | Mode: ${onboardingMode} | Seed: ${state.runSeed}`,
        78
      )} |`,
      `| ${padRight(
        `Cash: ${formatUsd(state.cash)}  Rev: ${formatUsd(stepRev)}/st  Coins: ${unlockedCoinsCount}/6  RP: ${state.researchPoints.toFixed(1)}`,
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

  const getWizardTutorialHint = (
    step: BuildStep,
    priceLabel: (cost: number) => string,
    isAsicRack: boolean
  ): string | null => {
    if (!state.tutorialStep || state.tutorialStep < 1 || state.tutorialStep > 4) return null;
    // Hints quote the actual option 1 the player is about to see, priced with current modifiers.
    const firstPick = (parts: { name: string; cost: number }[]): string | null =>
      parts[0] ? `${parts[0].name}, ${priceLabel(parts[0].cost)}` : null;
    switch (step) {
      case 'CHASSIS': {
        const pick = firstPick(getUnlockedChassis());
        return pick
          ? `GUIDE [1/8 Chassis]: Chassis sets max GPU slots, rack type & passive cooling. Type "1" (${pick}) for a starter build.`
          : null;
      }
      case 'COMPUTE': {
        const pick = firstPick(getUnlockedComputeFor(isAsicRack));
        return pick
          ? `GUIDE [2/8 Compute]: CPU/ASIC sets base hashing power & watts. Type "1" (${pick}) to stay inside your current power cap.`
          : null;
      }
      case 'GPU': {
        const pick = firstPick(getUnlockedGpus());
        return pick
          ? `GUIDE [3/8 GPUs]: GPUs boost ETHASH/SCRYPT mining. Type "1" (${pick}), or "done" to skip GPUs for a cheap CPU rig.`
          : 'GUIDE [3/8 GPUs]: No GPUs unlocked yet — type "done" to skip GPUs for a cheap CPU rig.';
      }
      case 'STORAGE': {
        const pick = firstPick(getUnlockedStorage());
        return pick
          ? `GUIDE [4/8 Storage/RAM]: Adds +% efficiency to rig revenue. Type "1" (${pick}) for a budget build.`
          : null;
      }
      case 'PSU': {
        const pick = firstPick(getUnlockedPsus());
        return pick
          ? `GUIDE [5/8 PSU]: PSU max watts MUST exceed "Current component load" ([FITS]). Type "1" (${pick}) if it fits.`
          : null;
      }
      case 'COOLING': {
        const pick = firstPick(getUnlockedCooling());
        return pick
          ? `GUIDE [6/8 Cooling]: Drops equilibrium °C so rigs do not throttle above 82°C. Type "1" (${pick}) or "2" for extra cooling.`
          : null;
      }
      case 'OS': {
        const pick = firstPick(getUnlockedOs());
        return pick
          ? `GUIDE [7/8 OS]: OS scales fleet hash & power draw. Type "1" (${pick}) to continue.`
          : null;
      }
      case 'COIN':
        return 'GUIDE [8/8 Coin]: Mined coin auto-sells every step for USD. Pick an unlocked coin like "1" (BTC).';
      case 'CONFIRM':
        return 'GUIDE [Review]: Check Cost & Est Auto-Sell/st above. If there are no warnings, type "deploy" (or click "deploy") to launch the rig!';
    }
  };

  const printTutorialStep = (stepNum: number) => {
    if (stepNum === 1) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [1/6] — READING YOUR DASHBOARD & OBJECTIVES' },
        {
          kind: 'PRE',
          text: [
            `  Step & bill in Nst  Advance with "step [n]" or let the auto-timer run (see "speed")`,
            `                      run. Rent, utility, and payroll bills settle every ${BILLING_CYCLE_STEPS} steps.`,
            `  Cash & Rev/st       Mined crypto AUTO-SELLS each step into Cash. "RP" is Research`,
            `                      Points spent in "research" to unlock stronger hardware.`,
            `  SLOTS/POWER/NOISE   Facility limits. Exceeding Power trips breakers; high Noise`,
            `                      triggers fines. Watch your early goals with "objectives".`,
            `  Codex & Guides      Type "codex" anytime for a permanent mechanic encyclopedia.`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "rigs" or "inspect 1" to check your starter rig (or "tutorial next" / "tutorial skip").',
        },
      ]);
      return;
    }

    if (stepNum === 2) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [2/6] — RIGS, COMPONENT HEALTH & MAINTENANCE' },
        {
          kind: 'PRE',
          text: [
            `  inspect <#>     Shows every component's individual health % (chassis, compute,`,
            `                  GPUs, storage, PSU, cooling). Rig Health = average of all parts.`,
            `  repair          "repair 1" repairs whole rig; "repair 1 psu" or "repair 1 gpu 1"`,
            `                  fixes just one worn part. If any part hits <=20%, rig halts!`,
            `  repaste <#>     Applies fresh paste (-6°C cooling for 16 steps).`,
            `  overclock/tinker "overclock 1 115" tunes speed/heat; "tinker 1" swaps parts (60% trade-in).`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "tutorial next" for Rig Building, or run "inspect 1" now!',
        },
      ]);
      return;
    }

    if (stepNum === 3) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [3/6] — HOW TO BUILD A RIG (8 PARTS)' },
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
            `  8. Coin        Picks target coin from your unlocked tiers (unlock more in "market").`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "build rig" (or "usedmarket" for surplus deals) to add Rig #2!',
        },
      ]);
      return;
    }

    if (stepNum === 4) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [4/6] — DEPLOYING YOUR SECOND RIG' },
        {
          kind: 'PRE',
          text: [
            `  You have open slots in your ${getFacility(state.facilityId).name} and enough Cash`,
            `  for a custom rig (~${formatUsd(
              Math.round(
                calculateRigBuildCost({
                  ...RIG_PRESETS[0].config,
                  name: RIG_PRESETS[0].label,
                }) * getGlobalHardwarePriceMult(state)
              )
            )}+) or a discounted surplus listing in "usedmarket".`,
            `  Inside "build rig", pick option numbers (e.g. "1") or "preset 1" to load a build.`,
            `  Review the spec sheet and type "deploy" to bring Rig #2 online.`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "build rig" now (or "tutorial next" to continue).',
        },
      ]);
      return;
    }

    if (stepNum === 5) {
      append([
        { kind: 'HEAD', text: 'TUTORIAL [5/6] — POWER, COOLING & R&D RESEARCH' },
        {
          kind: 'PRE',
          text: [
            `  power        View kW usage vs facility cap and switch power contracts.`,
            `  cool         Add room fans/AC/liquid coolers to prevent >82°C thermal throttling.`,
            `  research     Start an R&D project ("research start 1") to spend RP on GPUs/ASICs.`,
            `  objectives   Claim bonus Cash & RP as you complete early-game milestones.`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Next -> Type "tutorial next" for final scaling tips, or start "research" now.',
        },
      ]);
      return;
    }

    if (stepNum === 6) {
      const unlockNotes = getUnlockedSystems(state).unlockNotes;
      const sysNotes = {
        contracts: unlockNotes.contracts.replace(/^Unlocks (?:at|alongside)\s*/i, ''),
        staff: unlockNotes.staff.replace(/^Unlocks (?:at|alongside)\s*/i, ''),
        rivals: unlockNotes.rivals.replace(/^Unlocks (?:at|alongside)\s*/i, ''),
        blackmarket: unlockNotes.blackmarket.replace(/^Unlocks (?:at|alongside)\s*/i, ''),
      };
      append([
        { kind: 'HEAD', text: 'TUTORIAL [6/6] — GRADUATED SYSTEMS & SPECIALIST GUIDES' },
        {
          kind: 'PRE',
          text: [
            `  As your operation grows, Guided Mode gradually unlocks advanced systems:`,
            `    - Contracts ("tutorial contracts")  -> ${sysNotes.contracts}`,
            `    - Employees ("tutorial employees")  -> ${sysNotes.staff}`,
            `    - Rivals/PR ("tutorial ops")        -> ${sysNotes.rivals}`,
            `    - Black Market ("tutorial blackmarket") -> ${sysNotes.blackmarket}`,
            `  Type "tutorial list" to replay any guide, "codex" for full reference,`,
            `  or "tutorial veteran" anytime to unlock all commands immediately.`,
          ].join('\n'),
        },
        {
          kind: 'OK',
          text: 'Final step -> Type "step 3" to run your fleet and complete general onboarding!',
        },
      ]);
    }
  };

  const printWizardPrompt = (wiz: BuildWizardState) => {
    const { config, step } = wiz;
    const chassis = CHASSIS_PARTS.find((c) => c.id === config.chassisId) ?? CHASSIS_PARTS[0];
    const facility = getFacility(state.facilityId);
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    const sysBonus = getSysEngineerBonus(state);
    const hwMult = getGlobalHardwarePriceMult(state);
    const priceOf = (cost: number) => Math.round(cost * hwMult);
    const guideTip = getWizardTutorialHint(step, (cost) => formatUsd(priceOf(cost)), chassis.isAsicRack);

    if (step === 'CHASSIS') {
      const options = getUnlockedChassis();
      const presetCount = getUnlockedPresets().length;
      const rows = options.map((c, idx) => {
        const cap = c.isAsicRack ? 'ASIC Rack' : `${c.maxGpus} GPU slots`;
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(formatUsd(priceOf(c.cost)), 8)}  ${padRight(
          cap,
          12
        )}  -${c.coolingBonus}°C  G${c.generation ?? 1}`;
      });
      append([
        { kind: 'HEAD', text: 'RIG BUILDER STEP 1/8 — SELECT CHASSIS' },
        { kind: 'PRE', text: rows.join('\n') },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        {
          kind: 'TEXT',
          text:
            presetCount > 0
              ? `Enter chassis number (1..${options.length}), "preset 1..${presetCount}", or "cancel".`
              : `Enter chassis number (1..${options.length}) or "cancel".`,
        },
      ]);
      return;
    }

    if (step === 'COMPUTE') {
      const options = getUnlockedComputeFor(chassis.isAsicRack);
      const rows = options.map((c, idx) => {
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 34)} ${padLeft(formatUsd(priceOf(c.cost)), 8)}  ${padLeft(
          `${c.watts}W`,
          6
        )}  ${padRight(hashLabel, 18)} G${c.generation ?? 1}`;
      });
      append([
        { kind: 'HEAD', text: `RIG BUILDER STEP 2/8 — SELECT COMPUTE (${chassis.name})` },
        {
          kind: 'PRE',
          text: rows.length > 0 ? rows.join('\n') : '  (No unlocked compute modules fit this chassis yet.)',
        },
        ...(guideTip ? [{ kind: 'OK' as const, text: guideTip }] : []),
        { kind: 'TEXT', text: 'Enter compatible compute number, "back", or "cancel".' },
      ]);
      return;
    }

    if (step === 'GPU') {
      const options = getUnlockedGpus();
      const rows = options.map((g, idx) => {
        const eth = g.hashrates.ETHASH
          ? `ETH ${g.hashrates.ETHASH}MH`
          : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(formatUsd(priceOf(g.cost)), 8)}  ${padLeft(
          `${g.watts}W`,
          5
        )}  ${padRight(eth, 13)} G${g.generation ?? 1}`;
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
      const options = getUnlockedStorage();
      const rows = options.map((s, idx) => {
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(s.name, 33)} ${padLeft(formatUsd(priceOf(s.cost)), 8)}  +${Math.round(
          s.efficiencyBonus * 100
        )}% eff  ${padRight(s.storageTb >= 1 ? `${s.storageTb}TB` : `${s.ramGb}GB RAM`, 8)}`;
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
      const options = getUnlockedPsus();
      const rows = options.map((p, idx) => {
        const fit = t.rawWatts <= p.maxWatts ? 'FITS' : 'UNDERPOWERED';
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(p.name, 31)} ${padLeft(formatUsd(priceOf(p.cost)), 8)}  ${padLeft(
          `${p.maxWatts}W`,
          6
        )}  ${Math.round(p.efficiency * 100)}% eff  [${padRight(fit, 12)}]`;
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
      const options = getUnlockedCooling();
      const rows = options.map((c, idx) => {
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 32)} ${padLeft(formatUsd(priceOf(c.cost)), 8)}  -${padLeft(
          String(c.coolingPowerC),
          3
        )}°C  ${padLeft(`${c.noiseDba}dBA`, 5)}`;
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
      const options = getUnlockedOs();
      const rows = options.map((o, idx) => {
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(o.name, 30)} ${padLeft(formatUsd(priceOf(o.cost)), 8)}  x${o.hashrateMultiplier.toFixed(
          2
        )} hash  x${o.powerMultiplier.toFixed(2)} pwr`;
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
      `| GPUs:    ${padRight(`${config.gpuIds.length}x installed`, 42)} |`,
      `| Storage: ${padRight(storage.name, 42)} |`,
      `| PSU:     ${padRight(`${psu.name} (${t.wallWatts}W wall / ${psu.maxWatts}W cap)`, 42)} |`,
      `| Cooling: ${padRight(`${cooling.name} (Est ${t.equilibriumTempC}°C / ${t.noiseDba}dBA)`, 42)} |`,
      `| Tune:    ${padRight(`${config.poolMode ?? 'PPS'} · ${config.firmwareProfile ?? 'BALANCED'} · OC ${config.overclockPct}%`, 42)} |`,
      `| OS/Coin: ${padRight(`${os.name} -> ${config.targetCoin} (${formatHashrate(t.effectiveHashrate, t.targetAlgo)})`, 42)} |`,
      `+------------------ PURCHASE PREVIEW -----------------+`,
      `| Build Cost: ${padRight(formatUsd(totalCost), 39)} |`,
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
            ? 'Guided Mode active: start with "objectives", "rigs", "build rig", and "step". Type "codex" for the encyclopedia, "tutorial list" for guides, or "mode veteran" to unlock all systems.'
            : 'Veteran Mode active: all systems unlocked. Tune rigs ("rig 1 pool solo"), chase "contracts" & "rivals", or go covert with "ops" & "blackmarket". Type "help" or "codex" anytime.',
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
    const seen = state.seenTutorials ?? [];
    if (!seen.includes('ctx_overheat') && state.rigs.some((r) => r.status === 'OVERHEATED' || r.status === 'THROTTLED')) {
      const g = CONTEXTUAL_GUIDES.ctx_overheat;
      onMarkTutorialSeen('ctx_overheat');
      append([{ kind: 'WARN', text: `[FIRST-TIME GUIDE: ${g.title}] ${g.body} (Run "${g.tipCommand}".)` }]);
    }
    if (!seen.includes('ctx_low_health') && state.rigs.some((r) => r.status === 'NEEDS_REPAIR' || r.status === 'FAILED')) {
      const g = CONTEXTUAL_GUIDES.ctx_low_health;
      onMarkTutorialSeen('ctx_low_health');
      append([{ kind: 'WARN', text: `[FIRST-TIME GUIDE: ${g.title}] ${g.body} (Run "${g.tipCommand}".)` }]);
    }
  }, [state.rigs]);

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
    onActiveModalChange(wizard ? 'BUILDER' : tinker ? 'TINKER' : null);
  }, [wizard, tinker, onActiveModalChange]);

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
      const options = getUnlockedChassis();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
        return;
      }
      const firstCompute = getUnlockedComputeFor(picked.isAsicRack)[0];
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
      const options = getUnlockedComputeFor(chassis.isAsicRack);
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
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
      const options = getUnlockedGpus();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter GPU number (1..${options.length}), "clear", or "done".` }]);
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
      const options = getUnlockedStorage();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
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
      const options = getUnlockedPsus();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
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
      const options = getUnlockedCooling();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
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
      const options = getUnlockedOs();
      const idx = parseInt(parts[0], 10) - 1;
      const picked = options[idx];
      if (!picked) {
        append([{ kind: 'ERR', text: `Enter a number from 1 to ${options.length}.` }]);
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
    const fmtNet = (oldCost: number, newCost: number) => {
      const net = calculatePartTradeInCost(oldCost, Math.round(newCost * hwMult));
      return net >= 0 ? `Net +${formatUsd(net)}` : `Refund ${formatUsd(Math.abs(net))}`;
    };

    if (tk.slot === 'chassis') {
      const options = getUnlockedChassis();
      const rows = options.map((c, idx) => {
        const cur = c.id === rig.chassisId ? ' *INSTALLED*' : fmtNet(ch.cost, c.cost);
        const cap = c.isAsicRack ? 'ASIC Rack' : `${c.maxGpus} GPUs`;
        return `  ${idx + 1}. ${padRight(c.name, 30)} ${padLeft(formatUsd(c.cost), 7)}  ${padRight(
          cap,
          9
        )}  -${c.coolingBonus}°C  ${padRight(cur, 13)}`;
      });
      append([
        { kind: 'HEAD', text: `TINKER R${tk.rigIndex + 1} · SWAP CHASSIS (60% trade-in)` },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Enter chassis #, "back", or "done".' },
      ]);
      return;
    }

    if (tk.slot === 'compute') {
      const compatible = getUnlockedComputeFor(ch.isAsicRack);
      const rows = compatible.map((c, idx) => {
        const topAlgo = Object.entries(c.hashrates)[0];
        const hashLabel = topAlgo
          ? `${topAlgo[0]} ${formatHashrate(topAlgo[1] ?? 0, topAlgo[0] as never)}`
          : '—';
        const cur = c.id === rig.computeId ? ' *INSTALLED*' : fmtNet(comp.cost, c.cost);
        return `  ${padLeft(String(idx + 1), 2)}. ${padRight(c.name, 33)} ${padLeft(
          formatUsd(c.cost),
          7
        )}  ${padLeft(`${c.watts}W`, 5)}  ${padRight(hashLabel, 17)}  ${padRight(cur, 13)}`;
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
                )}  (Trade-in: ${formatUsd(Math.round((g?.cost ?? 0) * 0.6))})`;
              })
              .join('\n');
      const unlockedGpus = getUnlockedGpus();
      const catalogRows = unlockedGpus
        .map((g, idx) => {
          const eth = g.hashrates.ETHASH
            ? `ETH ${g.hashrates.ETHASH}MH`
            : `SCR ${g.hashrates.SCRYPT ?? 0}MH`;
          return `  ${padLeft(String(idx + 1), 2)}. ${padRight(g.name, 30)} ${padLeft(
            formatUsd(g.cost),
            7
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
          formatUsd(s.cost),
          7
        )}  +${Math.round(s.efficiencyBonus * 100)}% eff  ${padRight(cur, 13)}`;
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
          formatUsd(p.cost),
          7
        )}  ${padLeft(`${p.maxWatts}W`, 6)}  [${padRight(fit, 8)}]  ${padRight(cur, 13)}`;
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
          formatUsd(c.cost),
          7
        )}  -${padLeft(String(c.coolingPowerC), 3)}°C  ${padLeft(
          `${c.noiseDba}dBA`,
          5
        )}  ${padRight(cur, 13)}`;
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
        formatUsd(o.cost),
        7
      )}  x${o.hashrateMultiplier.toFixed(2)}h  x${o.powerMultiplier.toFixed(2)}p  ${padRight(
        cur,
        13
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
      const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
      pickedPartId = getUnlockedComputeFor(ch.isAsicRack)[idx]?.id ?? null;
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
      : 'miner@hashrate:~$';
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

    const maybeShowContextualGuide = (guideId: string) => {
      const seen = state.seenTutorials ?? [];
      if (seen.includes(guideId)) return;
      const guide = CONTEXTUAL_GUIDES[guideId];
      if (!guide) return;
      onMarkTutorialSeen(guideId);
      append([
        {
          kind: 'OK',
          text: `[FIRST-TIME GUIDE: ${guide.title}] ${guide.body}${
            guide.tipCommand ? ` (Run "${guide.tipCommand}" for the full guide.)` : ''
          }`,
        },
      ]);
    };

    const unlockedSys = getUnlockedSystems(state);
    const checkSystemUnlocked = (sysId: GuidedSystemId, label: string): boolean => {
      if (unlockedSys[sysId]) return true;
      append([
        {
          kind: 'WARN',
          text: `${label} not yet unlocked in Guided Mode: ${unlockedSys.unlockNotes[sysId]}. (Run "objectives" to track progress, or "tutorial veteran" to unlock all systems now.)`,
        },
      ]);
      return false;
    };

    if (cmd === 'help' || cmd === '?') {
      const onboardingMode = getEffectiveOnboardingMode(state);
      const lockedUpcoming: string[] = [];
      if (!unlockedSys.contracts) lockedUpcoming.push(`contracts (${unlockedSys.unlockNotes.contracts})`);
      if (!unlockedSys.staff) lockedUpcoming.push(`staff/hire (${unlockedSys.unlockNotes.staff})`);
      if (!unlockedSys.rivals) lockedUpcoming.push(`rivals/pr (${unlockedSys.unlockNotes.rivals})`);
      if (!unlockedSys.ops) lockedUpcoming.push(`ops/blackmarket (${unlockedSys.unlockNotes.ops})`);

      append([
        { kind: 'HEAD', text: `COMMAND REFERENCE MANUAL (${onboardingMode} MODE)` },
        {
          kind: 'PRE',
          text: [
            `  STEPS, ONBOARDING & PROGRESSION`,
            `    status | look                     Facility grid, power contract & fleet`,
            `    objectives | goals                Early-game guided goals & bonus Cash/RP rewards`,
            `    codex [topic] | wiki [topic]      Permanent in-terminal mechanics encyclopedia`,
            `    tutorial [list|<topic>|restart]   Interactive & replayable topic tutorials`,
            `    mode <guided|veteran>             Switch between gradual unlocks or full access`,
            `    step [n] | pause | resume | auto  Advance steps or toggle auto-stepping`,
            `    speed [<5..300>|2x|clock <1..24>]   Real seconds per step & in-game hours per step`,
            `    event | decide <1|2|3>            View active event or lock in choice`,
            `    stats | valuation | history | milestones | achievements | challenges | save`,
            `    leaderboard | season              Seasonal standings vs rivals & hall of fame`,
            `  HARDWARE, USED MARKET & MAINTENANCE`,
            `    build rig | presets | build preset <#>    Assemble custom rig (unlocked parts only)`,
            `    usedmarket | used [buy <#>|refresh]       Browse/buy factory, refurb, used & damaged rigs`,
            `    tinker [<#>] [<slot> <part#>]             Swap rig parts (60% trade-in credit)`,
            `    overclock [<#|all>] <80..150>             Adjust clock multiplier (power/heat trade-off)`,
            `    rigs | inspect <#>                        Fleet roster & per-component health breakdown`,
            `    rig <#|all> <on|off|oc N|coin X|pool|profile|payout <hold|sell>> | rig <#> clone [qty]`,
            `    repair [<#>|all] [<part> [slot#]] | repaste [<#>|all]  Repair full rig or 1 part (e.g. "repair 1 gpu")`,
            `    retire <#> | backup [deploy <#>] [sell <#>] | rename <#> <name> | sell <#>`,
            `  POWER, COOLING, ROOMS, FACILITIES${unlockedSys.staff ? ' & STAFF' : ''}`,
            `    power [contract <1..4> | upgrade <1..6>]  Manage power contracts & electrical grid`,
            `    cool [compare | add <type> [room <#>] | room <#> <room#> | toggle <#> | sell <#>]`,
            `    rooms | room [<#> | expand] | floorplan   ASCII room blueprint & wing expansion`,
            `    rig <#> room <#> | move <#> <room#>       Move rig into a cooler or baffled room`,
            `    facilities | facility <rent|buy|preview> <1..6> | facility <upgrade|expand>`,
            ...(unlockedSys.staff
              ? [`    staff | hire <tech|elec|mgr|eng|res|pr|analyst> | train <#> | fire <#> | shift | priority`]
              : []),
            `    research [done | start <#>] | fab [line build|design|produce|deploy|strip|sell] | ledger`,
            `    world | blockchain                          Shared block clock, network share & block history`,
            `  MARKET, EXCHANGE${unlockedSys.contracts || unlockedSys.rivals || unlockedSys.ops ? ', CONTRACTS, RIVALS & OPS' : ''}`,
            `    market | forecast [COIN] | unlock <COIN> | chart <COIN|portfolio|cash|profit|hashrate|power>`,
            `    wallet | exchange [buy|sell|limit|cancel|short|close]   Treasury wallet & spot/margin desk`,
            ...(unlockedSys.contracts
              ? [`    contracts | contract <accept <1..4>|abandon>   Reputation-gated enterprise contracts`]
              : []),
            ...(unlockedSys.rivals
              ? [
                  `    rivals [compare | investigate <#>]        Rival syndicates, rank & corporate recon`,
                  `    pr | pr launch <1..5> <COIN>              Legal PR campaigns`,
                ]
              : []),
            ...(unlockedSys.ops
              ? [
                  `    ops | blackmarket                         Underground ops (siphon/botnet/wash/pump/coin/raid/extort)`,
                ]
              : []),
            ...(lockedUpcoming.length > 0
              ? [``, `  UPCOMING GUIDED UNLOCKS (or run "mode veteran" to unlock now):`, ...lockedUpcoming.map((l) => `    - ${l}`)]
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

    if (cmd === 'objectives' || cmd === 'goals' || cmd === 'missions') {
      onClaimObjectives();
      const objs = evaluateEarlyObjectives(state);
      const done = objs.filter((o) => o.completed).length;
      const rows = objs.map((o, idx) => {
        const mark = o.completed ? '[x]' : '[ ]';
        return `  ${mark} ${idx + 1}. ${padRight(o.title, 46)} +${padLeft(formatUsd(o.rewardCash), 5)} +${padLeft(
          `${o.rewardRp}RP`,
          4
        )}\n         ${o.completed ? 'Completed!' : `How: ${o.hint}`}`;
      });
      append([
        {
          kind: 'HEAD',
          text: `EARLY-GAME OBJECTIVES (${done}/${objs.length} COMPLETED)`,
        },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text:
            done < objs.length
              ? 'Rewards deposit automatically as each objective finishes. Type "tutorial list" or "codex" for detailed help.'
              : 'All early-game objectives complete! Run "milestones", "challenges", or "contracts" for mid-game targets.',
        },
      ]);
      return;
    }

    if (cmd === 'codex' || cmd === 'wiki' || cmd === 'manual') {
      const q = [arg1, arg2].filter(Boolean).join(' ').trim().toLowerCase();
      if (!q) {
        const list = CODEX_ENTRIES.map(
          (e) => `  codex ${padRight(e.key, 12)} -> ${e.title}`
        ).join('\n');
        append([
          { kind: 'HEAD', text: 'HASHRATE PERMANENT CODEX & MECHANICS ENCYCLOPEDIA' },
          { kind: 'PRE', text: list },
          {
            kind: 'TEXT',
            text: 'Type "codex <topic>" (e.g. "codex hardware", "codex power", "codex employees") or search any keyword (e.g. "codex repair").',
          },
        ]);
        return;
      }

      const match =
        CODEX_ENTRIES.find((e) => e.key === q) ??
        CODEX_ENTRIES.find(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.keywords.some((k) => k.includes(q) || q.includes(k))
        );
      if (!match) {
        append([
          {
            kind: 'ERR',
            text: `No Codex topic matched "${q}". Run "codex" to list all ${CODEX_ENTRIES.length} entries.`,
          },
        ]);
        return;
      }
      append([
        { kind: 'HEAD', text: `CODEX // ${match.title}` },
        { kind: 'PRE', text: match.body.join('\n') },
        {
          kind: 'TEXT',
          text: 'Run "codex" to view all entries or "tutorial list" for interactive walkthroughs.',
        },
      ]);
      return;
    }

    if (cmd === 'mode') {
      if (arg1 === 'veteran' || arg1 === 'full' || arg1 === 'open') {
        onSetOnboardingMode('VETERAN');
        append([
          {
            kind: 'OK',
            text: 'Switched to VETERAN MODE: all commands (Contracts, Staff, Rivals, PR, Covert Ops, Black Market) are unlocked immediately.',
          },
        ]);
        return;
      }
      if (arg1 === 'guided') {
        onSetOnboardingMode('GUIDED');
        append([
          {
            kind: 'OK',
            text: 'Switched to GUIDED MODE: early-game objectives and progressive system pacing active.',
          },
        ]);
        return;
      }
      append([
        {
          kind: 'TEXT',
          text: `Current Experience Mode: ${getEffectiveOnboardingMode(state)}. Run "mode veteran" or "mode guided" to switch.`,
        },
      ]);
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
        rivals: 'ops',
        blackmarket: 'blackmarket',
        bm: 'blackmarket',
        underground: 'blackmarket',
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
              ...topicRows,
              `  tutorial veteran       -> Switch immediately to Veteran Mode (unlock all systems)`,
            ].join('\n'),
          },
          {
            kind: 'TEXT',
            text: 'Run any topic command above, "objectives" for early goals, or "codex" for quick reference.',
          },
        ]);
        return;
      }

      if (arg1 === 'veteran') {
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
        lastTutorialStepRef.current = 0;
        onSetTutorialStep(0);
        append([
          {
            kind: 'TEXT',
            text: 'Tutorial closed. Type "tutorial restart", "tutorial list", or "codex" anytime to replay or read guides.',
          },
        ]);
        return;
      }

      const rawTopic = arg1 === 'replay' ? arg2 : arg1;
      const mappedTopic = rawTopic ? topicAliases[rawTopic] : undefined;
      if (mappedTopic && TUTORIAL_TOPICS[mappedTopic]) {
        const t = TUTORIAL_TOPICS[mappedTopic];
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
              text: 'Tutorial complete! Type "tutorial list", "objectives", or "codex" anytime.',
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
        : (state.tutorialStep ?? 0) > 0
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
        return `  ${i + 1}. ${padRight(p.label, 24)} ${padLeft(formatUsd(cost), 8)}  ${padRight(
          cfg.targetCoin,
          4
        )}  Net:${padLeft(`${econ.netPerStepUsd >= 0 ? '+' : ''}${formatUsd(econ.netPerStepUsd)}/st`, 10)}  ROI:${payback}`;
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
                return `  ${i + 1}. ${padRight(l.title, 32)} ${padLeft(formatUsd(l.listPriceUsd), 7)} (-${savePct}%) ${l.conditionPct}% ${l.config.targetCoin}  Net:${padLeft(
                  `${econ.netPerStepUsd >= 0 ? '+' : ''}${formatUsd(econ.netPerStepUsd)}`,
                  8
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
          firmwareProfile: 'BALANCED',
        };
        const ok = onDeployRig(cfg);
        append([
          ok
            ? { kind: 'OK', text: `Built & deployed "${cfg.name}" for ${formatUsd(calculateRigBuildCost(cfg, state))}.` }
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
      const maxRigs = getEffectiveFacilityMaxRigs(state);
      if (state.rigs.length === 0) {
        append([
          {
            kind: 'TEXT',
            text: `No active rigs deployed (0/${maxRigs} slots, ${(state.backupRigs ?? []).length} in backup vault). Run "build rig" or "usedmarket".`,
          },
        ]);
        return;
      }
      const contributions = computeRigContributions(state);
      const header = `  #  ${padRight('RIG NAME', 21)} ${padRight('STATUS', 11)} ${padRight(
        'COIN/POOL',
        10
      )} ${padRight('GEN/COND', 10)} ${padLeft('HLTH', 5)} ${padLeft('TEMP', 5)} ${padLeft(
        'STEP USD',
        11
      )} ${padLeft('NET/ST', 10)}`;
      const rows = state.rigs.map((rig, i) => {
        const modMark = (rig.illicitMod ? '*' : '') + (rig.customAsicSpec ? '[F]' : '');
        const rigContribution = contributions[i];
        const contribution = rigContribution?.contributionPerStepUsd ?? 0;
        const lossTag =
          rigContribution?.producing && rigContribution.hasOperated && contribution < 0
            ? ' [LOSS]'
            : '';
        const gen = getRigGeneration(rig);
        const condShort = (rig.conditionTier ?? 'NEW').slice(0, 4);
        const coinLabel = rig.payoutMode === 'HOLD' ? `${rig.targetCoin}/HLD` : `${rig.targetCoin}/${rig.poolMode}`;
        return `  ${padRight(String(i + 1), 2)} ${padRight(rig.name + modMark, 21)} ${padRight(
          rig.status,
          11
        )} ${padRight(coinLabel, 10)} ${padRight(
          `G${gen}/${condShort}`,
          10
        )} ${padLeft(`${Math.round(rig.healthPct)}%`, 5)} ${padLeft(
          `${rig.temperatureC}C`,
          5
        )} ${padLeft(rig.payoutMode === 'HOLD' ? 'VAULTED' : formatUsd(rig.lastStepUsd), 11)} ${padLeft(
          `${contribution >= 0 ? '+' : '-'}${formatUsd(Math.abs(contribution))}`,
          10
        )}${lossTag}`;
      });
      const avgHealth =
        state.rigs.reduce((s, r) => s + r.healthPct, 0) / Math.max(1, state.rigs.length);
      append([
        {
          kind: 'HEAD',
          text: `FLEET ROSTER (${state.rigs.length}/${maxRigs}) · Avg Health: ${avgHealth.toFixed(
            0
          )}% · Vault: ${(state.backupRigs ?? []).length}`,
        },
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        {
          kind: 'TEXT',
          text: 'Commands: "inspect <#>", "repair all", "retire <#>", "backup", "sell <#>", "tinker <#>", "overclock". NET/ST = last step revenue minus rig power; [LOSS] = underwater at spot price. (* = illicit mod)',
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
      maybeShowContextualGuide('ctx_inspect');
      const sysBonus = getSysEngineerBonus(state);
      const enabledCount = state.rigs.filter((r) => r.enabled).length;
      const t = computeRigTelemetry(
        rig,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount,
        state.facilityUpgrades
      );
      const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId);
      const comp = COMPUTE_PARTS.find((c) => c.id === rig.computeId);
      const stor = STORAGE_PARTS.find((s) => s.id === rig.storageId);
      const psu = PSU_PARTS.find((p) => p.id === rig.psuId);
      const cool = COOLING_PARTS.find((c) => c.id === rig.coolingId);
      const os = OS_PARTS.find((o) => o.id === rig.osId);
      const compHealth = ensureRigComponentHealth(rig);
      const repairCost = getRigRepairCost(rig, state);
      const repasteCost = getRigRepasteCost(rig);
      const resaleVal = calculateRigResaleValue(rig, state);
      const gen = getRigGeneration(rig);
      const modSpec = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod] : null;

      const formatCompRow = (
        slotTag: string,
        label: string,
        hp: number,
        costUsd: number
      ): string => {
        const rounded = Math.round(hp);
        const bar = renderAsciiBar(rounded, 10);
        const warn = rounded <= 20 ? ' CRIT!' : rounded <= 45 ? ' WORN ' : '      ';
        const price = costUsd > 0 ? formatUsd(costUsd) : 'OK';
        return `    ${padRight(slotTag, 9)} ${padRight(label, 25)} ${bar} ${padLeft(
          `${rounded}%`,
          4
        )}${warn} Repair: ${padLeft(price, 7)}`;
      };

      const componentLines: string[] = [
        formatCompRow(
          'chassis',
          ch?.name ?? 'Chassis',
          compHealth.chassis,
          getComponentRepairCost(rig, 'chassis', undefined, state)
        ) + (compHealth.chassis < 65 ? '  (Rattle +dBA)' : ''),
        formatCompRow(
          'compute',
          comp?.name ?? 'Compute',
          compHealth.compute,
          getComponentRepairCost(rig, 'compute', undefined, state)
        ),
      ];
      if (rig.gpuIds.length === 0) {
        componentLines.push(`    ${padRight('gpu', 9)} (No discrete GPUs installed)`);
      } else {
        rig.gpuIds.forEach((gid, gIdx) => {
          const gpuPart = GPU_PARTS.find((g) => g.id === gid);
          const tag = rig.gpuIds.length === 1 ? 'gpu' : `gpu ${gIdx + 1}`;
          componentLines.push(
            formatCompRow(
              tag,
              gpuPart?.name ?? gid,
              compHealth.gpus[gIdx] ?? rig.healthPct,
              getComponentRepairCost(rig, 'gpu', gIdx, state)
            )
          );
        });
      }
      componentLines.push(
        formatCompRow(
          'storage',
          stor?.name ?? 'Storage',
          compHealth.storage,
          getComponentRepairCost(rig, 'storage', undefined, state)
        ) + (compHealth.storage < 65 ? '  (-Storage Eff)' : ''),
        formatCompRow(
          'psu',
          psu?.name ?? 'PSU',
          compHealth.psu,
          getComponentRepairCost(rig, 'psu', undefined, state)
        ) + (compHealth.psu < 65 ? '  (+Watts Ripple)' : ''),
        formatCompRow(
          'cooling',
          cool?.name ?? 'Cooling',
          compHealth.cooling,
          getComponentRepairCost(rig, 'cooling', undefined, state)
        ) + (compHealth.cooling < 75 ? '  (-Cooling Power)' : '')
      );

      append([
        { kind: 'HEAD', text: `RIG #${idx + 1} HARDWARE SHEET: ${rig.name}` },
        {
          kind: 'PRE',
          text: [
            `  Status:   ${rig.status} (${rig.enabled ? 'POWER ON' : 'PAUSED'})   Avg Health: ${Math.round(
              rig.healthPct
            )}% (Full Repair: ${formatUsd(repairCost)})`,
            `  Lifecycle: Gen ${gen} · Tier: ${rig.conditionTier ?? 'NEW'} · Age: ${rig.ageSteps ?? 0}st · Failures: ${
              rig.failureCount ?? 0
            } · Resale: ${formatUsd(resaleVal)}`,
            `  Tuning:   Pool ${rig.poolMode} (${POOL_MODE_SPECS[rig.poolMode].feePct}% fee)   Firmware: ${rig.firmwareProfile}   OC: ${rig.overclockPct}%   Payout: ${rig.payoutMode ?? 'AUTOSELL'}`,
            `  Thermal:  ${rig.temperatureC}°C (Eq: ${t.equilibriumTempC}°C)   Paste: ${
              rig.pasteStepsRemaining
            }st left (Repaste: ${formatUsd(repasteCost)})`,
            `  Output:   ${rig.targetCoin} (${t.targetAlgo}) ${formatHashrate(
              t.effectiveHashrate,
              t.targetAlgo
            )}   Wall: ${t.wallWatts}W   Noise: ${t.noiseDba}dBA`,
            `  Compute:  ${rig.customAsicSpec ? `Custom Fab ${rig.customAsicSpec.processNode} "${rig.customAsicSpec.name}" (${rig.customAsicSpec.algo})` : comp?.name ?? rig.computeId}`,
            `  Payout:   ${formatCoinAmount(rig.lastStepCoins)} ${rig.targetCoin}/st -> ${
              rig.payoutMode === 'HOLD' ? 'Vaulted to Wallet' : `${formatUsd(rig.lastStepUsd)}/st`
            }   Solo Wins: ${rig.soloBlocksWon}   Lifetime: ${formatUsd(rig.totalEarnedUsd)}`,
            `  Illicit:  ${modSpec ? `${modSpec.name} (${modSpec.summary})` : 'None (Stock legal ROM)'}`,
            `  OS Kernel: ${os?.name ?? rig.osId}`,
            ``,
            `  COMPONENT HEALTH (Rig health = average of installed components):`,
            ...componentLines,
          ].join('\n'),
        },
        {
          kind: 'TEXT',
          text:
            rig.gpuIds.length > 1
              ? `Repair tips: "repair ${idx + 1}" fixes whole rig, "repair ${
                  idx + 1
                } gpu" fixes all GPUs, or "repair ${idx + 1} gpu 1" / "repair ${
                  idx + 1
                } psu" fixes a single part.`
              : `Repair tips: "repair ${idx + 1}" fixes whole rig, or "repair ${
                  idx + 1
                } <chassis|compute|gpu|storage|psu|cooling>" fixes 1 part.`,
        },
      ]);
      return;
    }

    if (cmd === 'repair' || cmd === 'repaste') {
      maybeShowContextualGuide(cmd === 'repair' ? 'ctx_repair' : 'ctx_repaste');
      if (cmd === 'repair' && arg1 && arg1 !== 'all' && arg2 && arg2 !== 'all') {
        const rigIdx = parseInt(arg1, 10) - 1;
        if (isNaN(rigIdx) || !state.rigs[rigIdx]) {
          append([
            {
              kind: 'ERR',
              text: 'Usage: repair [<rig#>|all] OR repair <rig#> <chassis|compute|gpu|storage|psu|cooling> [gpuSlot#]',
            },
          ]);
          return;
        }

        const rawPart = arg2.toLowerCase();
        let slot: RepairComponentSlot | null = null;
        let gpuSlotIdx: number | undefined = undefined;

        if (['chassis', 'case', 'rack', 'frame'].includes(rawPart)) {
          slot = 'chassis';
        } else if (['compute', 'cpu', 'asic', 'fpga', 'blade', 'proc', 'processor'].includes(rawPart)) {
          slot = 'compute';
        } else if (['storage', 'ram', 'mem', 'memory', 'ssd', 'hdd', 'nvme', 'disk'].includes(rawPart)) {
          slot = 'storage';
        } else if (['psu', 'power', 'supply'].includes(rawPart)) {
          slot = 'psu';
        } else if (['cooling', 'cool', 'fan', 'fans', 'heatsink', 'aio'].includes(rawPart)) {
          slot = 'cooling';
        } else if (['gpu', 'gpus', 'card', 'cards', 'video'].includes(rawPart)) {
          slot = 'gpu';
          if (arg3) {
            const parsedSlot = parseInt(arg3.replace(/^#/, ''), 10);
            if (isNaN(parsedSlot) || parsedSlot < 1) {
              append([{ kind: 'ERR', text: `Invalid GPU slot "${arg3}". Example: repair ${rigIdx + 1} gpu 1` }]);
              return;
            }
            gpuSlotIdx = parsedSlot - 1;
          }
        } else {
          const gpuInlineMatch = rawPart.match(/^gpu#?(\d+)$/);
          if (gpuInlineMatch) {
            slot = 'gpu';
            gpuSlotIdx = parseInt(gpuInlineMatch[1], 10) - 1;
          }
        }

        if (!slot) {
          append([
            {
              kind: 'ERR',
              text: `Unknown component "${arg2}". Valid parts: chassis, compute, gpu [slot#], storage, psu, cooling.`,
            },
          ]);
          return;
        }

        const res = onRepairComponent(rigIdx, slot, gpuSlotIdx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }

      const targetArg = !arg1 || arg1 === 'all' ? 'ALL' : parseInt(arg1, 10) - 1;
      if (targetArg !== 'ALL' && (isNaN(targetArg) || !state.rigs[targetArg])) {
        append([
          {
            kind: 'ERR',
            text:
              cmd === 'repair'
                ? 'Usage: repair [<rig#>|all] OR repair <rig#> <chassis|compute|gpu|storage|psu|cooling> [gpuSlot#]'
                : 'Usage: repaste [<rig#>|all]',
          },
        ]);
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

    if (cmd === 'retire') {
      const idx = parseInt(arg1, 10) - 1;
      if (isNaN(idx) || !state.rigs[idx]) {
        append([{ kind: 'ERR', text: 'Usage: retire <rig#>' }]);
        return;
      }
      const res = onRetireRig(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return;
    }

    if (cmd === 'backup') {
      const vault = state.backupRigs ?? [];
      if (arg1 === 'deploy') {
        const idx = parseInt(arg2, 10) - 1;
        const res = onDeployBackupRig(idx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'sell') {
        const idx = parseInt(arg2, 10) - 1;
        const res = onSellBackupRig(idx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      const rows =
        vault.length === 0
          ? '  (Backup Hardware Vault is empty. Use "retire <rig#>" to store spare rigs.)'
          : vault
              .map((r, i) => {
                const resale = calculateRigResaleValue(r, state);
                return `  ${i + 1}. ${padRight(r.name, 24)} ${padRight(r.targetCoin, 5)} ${Math.round(
                  r.healthPct
                )}% hlth · Age ${r.ageSteps ?? 0}st · Resale ${formatUsd(resale)}`;
              })
              .join('\n');
      append([
        { kind: 'HEAD', text: `BACKUP HARDWARE VAULT (${vault.length} stored)` },
        { kind: 'PRE', text: rows },
        { kind: 'TEXT', text: 'Commands: "backup deploy <#>", "backup sell <#>", or "retire <active rig#>".' },
      ]);
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
      if (arg2 === 'room') {
        const roomNum = parseInt(arg3, 10);
        if (isNaN(roomNum)) {
          append([{ kind: 'ERR', text: 'Usage: rig <#|all> room <room#>. Run "rooms" to see the ASCII floor-plan.' }]);
          return;
        }
        const res = onMoveRigToRoom(isAll ? 'ALL' : idx, roomNum);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg2 === 'payout') {
        const mode =
          arg3 === 'hold' || arg3 === 'vault' || arg3 === 'wallet'
            ? 'HOLD'
            : arg3 === 'sell' || arg3 === 'autosell' || arg3 === 'cash'
            ? 'AUTOSELL'
            : null;
        if (!mode) {
          append([{ kind: 'ERR', text: 'Usage: rig <#|all> payout <hold|sell>' }]);
          return;
        }
        const res = onSetRigPayout(isAll ? 'ALL' : idx, mode);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg2 === 'clone' || arg2 === 'copy') {
        if (isAll) {
          append([{ kind: 'ERR', text: 'Specify a single rig to clone: rig <rig#> clone [qty]' }]);
          return;
        }
        const qty = arg3 ? parseInt(arg3, 10) : 1;
        if (isNaN(qty) || qty < 1) {
          append([{ kind: 'ERR', text: 'Usage: rig <rig#> clone [1..12]' }]);
          return;
        }
        const res = onCloneRig(idx, qty);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (isAll) {
        append([{ kind: 'ERR', text: 'Use "rig all pool <...>", "rig all profile <...>", "rig all payout <hold|sell>", or "rig all room <#>".' }]);
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
        append([{ kind: 'OK', text: `${target.name} assigned to mine ${sym}.` }]);
        return;
      }
      append([
        {
          kind: 'ERR',
          text: 'Usage: rig <#|all> <on|off|oc N|coin SYM|pool pps/pplns/solo|profile eco/balanced/turbo|payout hold/sell|room #|clone [qty]>',
        },
      ]);
      return;
    }

    if (cmd === 'move') {
      const rigIdx = parseInt(arg1, 10) - 1;
      const roomNum = parseInt(arg2 === 'room' ? arg3 : arg2, 10);
      if (isNaN(rigIdx) || isNaN(roomNum)) {
        append([{ kind: 'ERR', text: 'Usage: move <rig#> [room] <room#>' }]);
        return;
      }
      const res = onMoveRigToRoom(rigIdx, roomNum);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return;
    }

    if (cmd === 'rooms' || cmd === 'floorplan' || cmd === 'room') {
      if (arg1 === 'expand') {
        const res = onExpandFacilityRooms();
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      const maybeRoomNum = parseInt(arg1, 10);
      if (!isNaN(maybeRoomNum)) {
        const view = formatSingleRoomView(state, maybeRoomNum);
        if (!view) {
          const totalRooms = getFacilityRooms(state).length;
          append([{ kind: 'ERR', text: `Room #${maybeRoomNum} not found (1..${totalRooms}).` }]);
          return;
        }
        append([
          { kind: 'HEAD', text: `ROOM INSPECTOR — ROOM #${maybeRoomNum}` },
          { kind: 'PRE', text: view },
          {
            kind: 'TEXT',
            text: `Commands: "rooms" (full floor-plan), "rig <#> room ${maybeRoomNum}", "cool room <cool#> ${maybeRoomNum}", or "room expand".`,
          },
        ]);
        return;
      }
      append([
        { kind: 'HEAD', text: 'FACILITY ROOMS & ASCII FLOOR-PLAN SELECTOR' },
        { kind: 'PRE', text: formatAsciiFloorPlan(state) },
        {
          kind: 'TEXT',
          text: 'Select a room via "room <#>", move rigs via "rig <#> room <#>", place coolers via "cool room <cool#> <#>", or build wings via "room expand".',
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

    if (cmd === 'salvage' || cmd === 'sell') {
      const idx = parseInt(arg1, 10) - 1;
      const target = state.rigs[idx];
      if (!target) {
        append([{ kind: 'ERR', text: `Usage: ${cmd} <rig#>` }]);
        return;
      }
      const refund = onSalvageRig(target.id);
      append([{ kind: 'OK', text: `Sold/salvaged ${target.name} for ${formatUsd(refund)} (condition & market adjusted).` }]);
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
        const gpu = getUnlockedGpus()[gIdx];
        if (!gpu) {
          append([
            {
              kind: 'ERR',
              text: `GPU #${gArg || '?'} not available. Run "tinker ${rigIdx + 1} gpu" to inspect unlocked GPUs.`,
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
      if (targetSlot === 'chassis') pickedId = getUnlockedChassis()[partNum]?.id ?? null;
      else if (targetSlot === 'compute') {
        const ch = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
        const compat = getUnlockedComputeFor(ch.isAsicRack);
        pickedId = compat[partNum]?.id ?? null;
      } else if (targetSlot === 'storage') pickedId = getUnlockedStorage()[partNum]?.id ?? null;
      else if (targetSlot === 'psu') pickedId = getUnlockedPsus()[partNum]?.id ?? null;
      else if (targetSlot === 'cooling') pickedId = getUnlockedCooling()[partNum]?.id ?? null;
      else if (targetSlot === 'os') pickedId = getUnlockedOs()[partNum]?.id ?? null;

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

    if (cmd === 'forecast') {
      const sym = arg1 ? (arg1.toUpperCase() as CoinSymbol) : undefined;
      if (sym && !state.coins[sym]) {
        append([{ kind: 'ERR', text: `Unknown coin "${arg1}". Usage: forecast [BTC|LTC|DOGE|XMR|ETH|XCH]` }]);
        return;
      }
      append([
        { kind: 'HEAD', text: sym ? `MARKET FORECAST BRIEF: ${sym}` : 'CRYPTO MARKET TECHNICAL FORECAST' },
        { kind: 'PRE', text: formatMarketForecastReport(state, sym) },
      ]);
      return;
    }

    if (cmd === 'market' || cmd === 'coins') {
      if (arg1 === 'forecast' || arg1 === 'intel' || arg1 === 'analysis') {
        const sym = arg2 ? (arg2.toUpperCase() as CoinSymbol) : undefined;
        if (sym && !state.coins[sym]) {
          append([{ kind: 'ERR', text: `Unknown coin "${arg2}". Usage: market forecast [BTC|LTC|DOGE|XMR|ETH|XCH]` }]);
          return;
        }
        append([
          { kind: 'HEAD', text: sym ? `MARKET FORECAST BRIEF: ${sym}` : 'CRYPTO MARKET TECHNICAL FORECAST' },
          { kind: 'PRE', text: formatMarketForecastReport(state, sym) },
        ]);
        return;
      }
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
      const modLines = (state.activeMarketModifiers ?? []).map(
        (m) => `  * ${m.label} (${m.stepsRemaining}st left): ${m.summary}`
      );
      const spotImpact = computeMarketSensitivity(state, 0);
      const downImpact = computeMarketSensitivity(state, -20);
      const upImpact = computeMarketSensitivity(state, 20);
      const signedUsd = (v: number) => `${v >= 0 ? '+' : '-'}${formatUsd(Math.abs(v))}`;
      append([
        {
          kind: 'HEAD',
          text: `COIN EXCHANGE · REGIME: ${reg.label.toUpperCase()} (${state.regimeStepsRemaining}st left) — ${reg.summary}`,
        },
        ...(modLines.length > 0
          ? [{ kind: 'WARN' as const, text: `ACTIVE MARKET MODIFIERS:\n${modLines.join('\n')}` }]
          : []),
        { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
        {
          kind: downImpact.underwaterRigs > 0 ? ('WARN' as const) : ('TEXT' as const),
          text: `FLEET IMPACT AT SPOT: ${spotImpact.activeRigs} active rigs · net ${signedUsd(
            spotImpact.netPerStepUsd
          )}/step. Revenue -20% -> ${signedUsd(
            downImpact.netPerStepUsd
          )}/step (${downImpact.underwaterRigs} rigs underwater); +20% -> ${signedUsd(
            upImpact.netPerStepUsd
          )}/step.`,
        },
        {
          kind: 'TEXT',
          text: 'Commands: "market forecast [COIN]", "unlock <COIN>", "chart <COIN>", "usedmarket", "pr launch <1..5> <COIN>".',
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
      const metricKey = (arg1 || 'portfolio').toLowerCase();
      if (
        metricKey === 'portfolio' ||
        metricKey === 'cash' ||
        metricKey === 'valuation' ||
        metricKey === 'profit' ||
        metricKey === 'hashrate' ||
        metricKey === 'power'
      ) {
        append([
          { kind: 'HEAD', text: `ASCII PERFORMANCE ANALYTICS (${metricKey.toUpperCase()})` },
          { kind: 'PRE', text: formatPortfolioChart(state, metricKey as PortfolioChartMetric) },
        ]);
        return;
      }
      const sym = arg1.toUpperCase() as CoinSymbol;
      const c = state.coins[sym];
      if (!c) {
        append([
          {
            kind: 'ERR',
            text: `Unknown chart "${arg1}". Use: chart <BTC|ETH|...> or chart <portfolio|cash|valuation|profit|hashrate|power>.`,
          },
        ]);
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

    if (cmd === 'wallet') {
      append([
        { kind: 'HEAD', text: 'CRYPTO TREASURY WALLET & EXCHANGE DESK' },
        { kind: 'PRE', text: formatWalletAndExchangeReport(state) },
      ]);
      return;
    }

    if (cmd === 'exchange' || cmd === 'trade') {
      if (!arg1 || arg1 === 'status' || arg1 === 'book') {
        append([
          { kind: 'HEAD', text: 'CRYPTO EXCHANGE DESK' },
          { kind: 'PRE', text: formatWalletAndExchangeReport(state) },
        ]);
        return;
      }
      if (arg1 === 'buy') {
        const sym = arg2.toUpperCase() as CoinSymbol;
        const usd = parseFloat(arg3);
        if (!sym || isNaN(usd)) {
          append([{ kind: 'ERR', text: 'Usage: exchange buy <COIN> <usdAmount>' }]);
          return;
        }
        const res = onExchangeBuy(sym, usd);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'sell') {
        const sym = arg2.toUpperCase() as CoinSymbol;
        const qtyOrAll: number | 'ALL' =
          arg3 === 'all' ? 'ALL' : parseFloat(arg3);
        if (!sym || (qtyOrAll !== 'ALL' && isNaN(qtyOrAll))) {
          append([{ kind: 'ERR', text: 'Usage: exchange sell <COIN> <qty|all>' }]);
          return;
        }
        const res = onExchangeSell(sym, qtyOrAll);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'limit') {
        const sideRaw = arg2.toUpperCase();
        const side = sideRaw === 'BUY' || sideRaw === 'SELL' ? sideRaw : null;
        const sym = (arg3 || '').toUpperCase() as CoinSymbol;
        const targetPx = parseFloat(parts[4] || '');
        const amt = parseFloat(parts[5] || '');
        if (!side || !sym || isNaN(targetPx) || isNaN(amt)) {
          append([{ kind: 'ERR', text: 'Usage: exchange limit <buy|sell> <COIN> <targetPriceUsd> <usdOrCoinAmt>' }]);
          return;
        }
        const res = onPlaceLimitOrder(side, sym, targetPx, amt);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'cancel') {
        const idx = parseInt(arg2, 10) - 1;
        if (isNaN(idx)) {
          append([{ kind: 'ERR', text: 'Usage: exchange cancel <order#>' }]);
          return;
        }
        const res = onCancelLimitOrder(idx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'short') {
        const sym = arg2.toUpperCase() as CoinSymbol;
        const usd = parseFloat(arg3);
        if (!sym || isNaN(usd)) {
          append([{ kind: 'ERR', text: 'Usage: exchange short <COIN> <collateralUsd>' }]);
          return;
        }
        const res = onOpenShort(sym, usd);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'close') {
        const idx = parseInt(arg2, 10) - 1;
        if (isNaN(idx)) {
          append([{ kind: 'ERR', text: 'Usage: exchange close <short#>' }]);
          return;
        }
        const res = onCloseShort(idx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      append([
        {
          kind: 'ERR',
          text: 'Usage: exchange [buy <COIN> <usd> | sell <COIN> <qty|all> | limit <buy|sell> <COIN> <px> <amt> | cancel <#> | short <COIN> <usd> | close <#>]',
        },
      ]);
      return;
    }

    if (cmd === 'world' || cmd === 'blockchain') {
      append([
        { kind: 'HEAD', text: 'WORLD & BLOCKCHAIN' },
        { kind: 'PRE', text: formatWorldReport(state, estimateFleetHashIndex(state)) },
      ]);
      return;
    }

    if (cmd === 'fab' || cmd === 'foundry') {
      if (!arg1 || arg1 === 'status' || arg1 === 'list') {
        append([
          { kind: 'HEAD', text: 'SEMICONDUCTOR & PROPRIETARY ASIC FOUNDRY' },
          { kind: 'PRE', text: formatFabStatusReport(state) },
        ]);
        return;
      }
      if (arg1 === 'line' && arg2 === 'build') {
        const res = onBuildFabLine();
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'design') {
        const rawTokens = trimmed.split(/\s+/).slice(2);
        const bpName = rawTokens[0];
        const algoRaw = (rawTokens[1] || '').toUpperCase() as MiningAlgorithm;
        const nodeRaw = (rawTokens[2] || '').toLowerCase() as ChipProcessNode;
        const profile = parseDesignProfile(rawTokens[3]);
        const validAlgos: MiningAlgorithm[] = ['SHA256', 'SCRYPT', 'RANDOMX', 'ETHASH', 'POST'];
        const validNodes: ChipProcessNode[] = ['7nm', '5nm', '3nm', '2nm'];
        if (!bpName || !validAlgos.includes(algoRaw) || !validNodes.includes(nodeRaw) || !profile) {
          append([
            {
              kind: 'ERR',
              text: 'Usage: fab design <SingleWordName> <sha256|scrypt|randomx|ethash|post> <7nm|5nm|3nm|2nm> [perf|balanced|eff|compact]',
            },
          ]);
          return;
        }
        const res = onDesignCustomChip(bpName, algoRaw, nodeRaw, profile);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'strip') {
        const rigIdx = parseInt(arg2, 10) - 1;
        if (isNaN(rigIdx)) {
          append([{ kind: 'ERR', text: 'Usage: fab strip <rig#>' }]);
          return;
        }
        const res = onStripCustomAsic(rigIdx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'produce') {
        const bpIdx = parseInt(arg2, 10) - 1;
        const qty = parseInt(arg3 || '1', 10);
        if (isNaN(bpIdx) || isNaN(qty)) {
          append([{ kind: 'ERR', text: 'Usage: fab produce <blueprint#> <qty>' }]);
          return;
        }
        const res = onQueueFabProduction(bpIdx, qty);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'deploy') {
        const invIdx = parseInt(arg2, 10) - 1;
        const rigIdx = parseInt(arg3, 10) - 1;
        if (isNaN(invIdx) || isNaN(rigIdx)) {
          append([{ kind: 'ERR', text: 'Usage: fab deploy <inventory#> <rig#>' }]);
          return;
        }
        const res = onDeployCustomAsic(invIdx, rigIdx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      if (arg1 === 'sell') {
        const invIdx = parseInt(arg2, 10) - 1;
        const qtyOrAll: number | 'ALL' =
          arg3 === 'all' ? 'ALL' : parseInt(arg3 || '1', 10);
        if (isNaN(invIdx) || (qtyOrAll !== 'ALL' && isNaN(qtyOrAll))) {
          append([{ kind: 'ERR', text: 'Usage: fab sell <inventory#> <qty|all>' }]);
          return;
        }
        const res = onSellCustomAsic(invIdx, qtyOrAll);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      append([
        {
          kind: 'ERR',
          text: 'Usage: fab [line build | design <name> <algo> <node> [perf|balanced|eff|compact] | produce <bp#> <qty> | deploy <inv#> <rig#> | strip <rig#> | sell <inv#> <qty|all>]',
        },
      ]);
      return;
    }

    if (cmd === 'contracts') {
      if (!checkSystemUnlocked('contracts', 'Enterprise Contracts')) return;
      maybeShowContextualGuide('ctx_contracts');
      const progressFmt = (c: NonNullable<GameState['activeContract']>) =>
        c.type === 'LOW_NOISE_RUN' || c.type === 'MAINTENANCE_SLA'
          ? `${c.progress}/${c.targetAmount} steps`
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
      if (arg1 === 'investigate' || arg1 === 'scout' || arg1 === 'intel') {
        const idx = parseInt(arg2, 10) - 1;
        if (isNaN(idx) || !state.rivals[idx]) {
          append([{ kind: 'ERR', text: `Usage: rivals investigate <1..${state.rivals.length}>` }]);
          return;
        }
        const res = onInvestigateRival(idx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return;
      }
      const header = `  #  ${padRight('SYNDICATE', 24)} ${padRight('COIN', 5)} ${padRight(
        'STRATEGY',
        21
      )} ${padLeft('HASH IDX', 9)} ${padLeft('SHARE', 7)}  STATUS / MOVE`;
      const rows = state.rivals.map((rv, i) => {
        const reconNote =
          (rv.intelRevealedUntilStep ?? 0) >= state.stepCount
            ? ` [Res:${formatUsd(rv.cashReserveUsd, true)} Rigs:${rv.rigCount}]`
            : '';
        const st =
          rv.disruptedSteps > 0
            ? `[DISRUPTED ${rv.disruptedSteps}st]`
            : `${rv.lastActionSummary}${reconNote}`;
        return `  ${padRight(String(i + 1), 2)} ${padRight(rv.name, 24)} ${padRight(
          rv.specialtyCoin,
          5
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
          text: `Commands: "rivals compare", "rivals investigate <1..${state.rivals.length}>" (from ${sampleRecon}, +4 RP & reserve intel), or "ops sabotage <#>".`,
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

    if (cmd === 'ops') {
      if (!checkSystemUnlocked('ops', 'Covert Operations')) return;
      maybeShowContextualGuide('ctx_ops');
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
      if (arg1 === 'pump') {
        const sym = (arg2 || 'BTC').toUpperCase() as CoinSymbol;
        if (!state.coins[sym]) {
          append([{ kind: 'ERR', text: 'Usage: ops pump <COIN>' }]);
          return;
        }
        const res = onPumpDump(sym);
        append([
          res.ok
            ? {
                kind: 'WARN',
                text: res.summary ?? `Pumped & dumped ${sym} through shell accounts (${formatUsd(res.cost ?? 0)}).`,
              }
            : { kind: 'ERR', text: res.reason ?? 'Pump & dump failed.' },
        ]);
        return;
      }
      if (arg1 === 'extort') {
        const idx = parseInt(arg2, 10) - 1;
        const rival = state.rivals[idx];
        if (!rival) {
          append([{ kind: 'ERR', text: `Usage: ops extort <1..${state.rivals.length}>` }]);
          return;
        }
        const res = onExtortRival(rival.id);
        append([
          res.ok
            ? { kind: 'WARN', text: res.summary ?? `Squeezed ${rival.name} for protection money.` }
            : { kind: 'ERR', text: res.reason ?? 'Extortion attempt failed.' },
        ]);
        return;
      }
      if (arg1 === 'coin') {
        const ticker = (parts[2] ?? '').toUpperCase();
        if (!ticker) {
          append([
            {
              kind: 'ERR',
              text: 'Usage: ops coin <TICKER> <Name...>   Launch a shell coin ($2,500, +18 Heat).',
            },
          ]);
          return;
        }
        const res = onLaunchShellCoin(ticker, parts.slice(3).join(' '));
        append([
          {
            kind: res.ok ? 'WARN' : 'ERR',
            text: res.ok ? res.summary ?? `Launched $${ticker}.` : res.reason ?? 'Shell coin launch failed.',
          },
        ]);
        return;
      }
      if (arg1 === 'shill') {
        const ticker = (parts[2] ?? '').toUpperCase();
        if (!ticker) {
          append([{ kind: 'ERR', text: 'Usage: ops shill <TICKER>   Buy hype for a shell coin ($750, +6 Heat).' }]);
          return;
        }
        const res = onShillShellCoin(ticker);
        append([
          {
            kind: res.ok ? 'WARN' : 'ERR',
            text: res.ok ? res.summary ?? `Shilled $${ticker}.` : res.reason ?? 'Shill campaign failed.',
          },
        ]);
        return;
      }
      if (arg1 === 'rug') {
        const ticker = (parts[2] ?? '').toUpperCase();
        if (!ticker) {
          append([{ kind: 'ERR', text: 'Usage: ops rug <TICKER>   Pull liquidity and exit the token.' }]);
          return;
        }
        const res = onRugShellCoin(ticker);
        append([
          {
            kind: res.ok ? 'WARN' : 'ERR',
            text: res.ok ? res.summary ?? `Rugged $${ticker}.` : res.reason ?? 'Rug pull failed.',
          },
        ]);
        return;
      }
      if (arg1 === 'raid') {
        const idx = parseInt(arg2, 10) - 1;
        const rival = state.rivals[idx];
        if (!rival) {
          append([{ kind: 'ERR', text: `Usage: ops raid <1..${state.rivals.length}>` }]);
          return;
        }
        const res = onRaidRival(rival.id);
        append([
          {
            kind: res.ok ? 'WARN' : 'ERR',
            text: res.ok ? res.summary ?? `Raided ${rival.name}.` : res.reason ?? 'Raid failed.',
          },
        ]);
        return;
      }
      if (arg1 === 'coins' || arg1 === 'shell') {
        const shellCoins = getShellCoins(state);
        if (shellCoins.length === 0) {
          append([
            { kind: 'TEXT', text: 'No shell coins running. Launch one with "ops coin <TICKER> <Name...>".' },
          ]);
          return;
        }
        const rows = shellCoins.map(
          (c) =>
            `  $${padRight(c.ticker, 5)} ${padRight(c.name.slice(0, 14), 15)} ${padLeft(
              formatUsd(c.priceUsd),
              8
            )}  hype ${padLeft(`${Math.round(c.hype)}`, 3)}  pool ${padLeft(
              formatUsd(c.liquidityUsd, true),
              6
            )}${c.extractedUsd > 0 ? `  took ${formatUsd(c.extractedUsd, true)}` : ''}  ${
              c.rugged ? 'RUGGED' : 'ACTIVE'
            }`
        );
        append([
          { kind: 'HEAD', text: `SHELL COINS · ${shellCoins.filter((c) => !c.rugged).length}/3 active` },
          { kind: 'PRE', text: rows.join('\n') },
          {
            kind: 'TEXT',
            text: 'Shill the hype ("ops shill <TICKER>"), then pull the pool ("ops rug <TICKER>"). Hype decays every step.',
          },
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
      const raidRiskPct =
        state.underground.bribeProtectionSteps > 0
          ? '0% (Bribe Shield Active)'
          : heat >= 75
          ? '~18%/step (14-26% cash fine + illicit rig seizure)'
          : heat >= 50
          ? '~6%/step audit risk'
          : '<1%/step';
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
            `  Enforcement Risk:${' '}${raidRiskPct}`,
            `  Audit Shield:    ${state.underground.bribeProtectionSteps > 0 ? `${state.underground.bribeProtectionSteps} steps remaining` : 'None'}`,
            `  Power Siphon:    ${state.underground.powerSiphonActive ? 'ON (-65% electricity, +25% breaker, +1.7 Heat/st)' : 'OFF'}`,
            `  Shadow Botnet:   ${botnetLine}`,
            `  Hijacked Hash:   ${
              (state.underground.raidStepsRemaining ?? 0) > 0
                ? `${state.underground.raidSourceName ?? 'Rival'} · ${state.underground.raidStepsRemaining} steps left`
                : 'None'
            }`,
            `  Shell Coins:     ${getShellCoins(state).filter((c) => !c.rugged).length}/3 active`,
            `  Raids Survived:  ${state.stats.raidsSurvived}   Covert Ops Run: ${state.stats.covertOpsCount}`,
            ``,
            `  ACTIONS:`,
            `    ops siphon <on|off>   Toggle bypassed power meter (+1.7 Heat/step)`,
            `    ops botnet <COIN>     Lease zero-watt shadow hash for 8 steps (+18 Heat)`,
            `    ops wash <COIN>       Spike coin spot price +26% via dark pools (+20 Heat, -5 Rep)`,
            `    ops pump <COIN>       Pump & dump: +42% spike, traceable (+26 Heat, -8 Rep, fine risk)`,
            `    ops extort <1..4>     Protection racket on a rival (cash, +20 Heat, may refuse)`,
            `    ops sabotage <1..4>   DDoS & disrupt a rival syndicate for 10 steps (+18 Heat)`,
            `    ops coin <TICKER> <Name>  Launch a shell coin ($2,500, +18 Heat)`,
            `    ops shill <TICKER>    Manufacture hype for a shell coin ($750, +6 Heat)`,
            `    ops rug <TICKER>      Pull the pool & exit (heat spike, trace risk)`,
            `    ops coins             List your shell coins, hype & extracted cash`,
            `    ops raid <1..4>       Raid a rival vault & hijack their hash for 8 steps`,
            `    ops launder           Route funds through mixers (-24 Heat)`,
            `    ops bribe             Pay utility inspectors (-16 Heat + 12-step raid shield)`,
            `    blackmarket           Browse smuggled rigs (~22% lemon risk) & illicit ROM mods`,
          ].join('\n'),
        },
      ]);
      return;
    }

    if (cmd === 'blackmarket' || cmd === 'bm') {
      if (!checkSystemUnlocked('blackmarket', 'Black Market')) return;
      maybeShowContextualGuide('ctx_blackmarket');
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
        { kind: 'TEXT', text: 'Tip: Run "ledger chart" or "chart cash" for historical trends.' },
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
        append([{ kind: 'OK', text: `Granted ownership of all ${FACILITY_TIERS.length} facilities.` }]);
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
          ...getUnlockedGpus()
            .slice(0, 3)
            .map((_, idx) => ({ label: String(idx + 1), cmd: String(idx + 1) })),
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
          const ch = CHASSIS_PARTS.find((c) => c.id === wizard.config.chassisId) ?? CHASSIS_PARTS[0];
          const count =
            wizard.step === 'CHASSIS'
              ? getUnlockedChassis().length
              : wizard.step === 'COMPUTE'
              ? getUnlockedComputeFor(ch.isAsicRack).length
              : wizard.step === 'STORAGE'
              ? getUnlockedStorage().length
              : wizard.step === 'PSU'
              ? getUnlockedPsus().length
              : wizard.step === 'COOLING'
              ? getUnlockedCooling().length
              : wizard.step === 'OS'
              ? getUnlockedOs().length
              : getUnlockedCoins().length;
          return [
            ...Array.from({ length: Math.min(3, count) }, (_, i) => ({
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
          const ch = CHASSIS_PARTS.find((c) => c.id === rig?.chassisId) ?? CHASSIS_PARTS[0];
          const count =
            tinker.slot === 'chassis'
              ? getUnlockedChassis().length
              : tinker.slot === 'compute'
              ? getUnlockedComputeFor(ch.isAsicRack).length
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
        { label: 'status', cmd: 'status' },
        { label: userPaused ? 'resume' : 'pause', cmd: userPaused ? 'resume' : 'pause' },
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
