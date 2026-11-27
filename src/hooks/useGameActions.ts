import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  CHALLENGES,
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_PROFILES,
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  GPU_PARTS,
  MARKET_REGIME_SPECS,
  OS_PARTS,
  POWER_CONTRACTS,
  PR_CAMPAIGNS,
  PSU_PARTS,
  RESEARCH_NODES,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from '../data/catalog';
import {
  announceGuidedUnlocks,
  completeGuidedTask,
  CONTEXTUAL_GUIDES,
  dismissGuidedSystem,
  encounterGuidedLesson,
  finishGuidedLesson,
  pauseGuidedOnboarding,
  recordGuidedProgress,
  revisitGuidedTopic,
  setGuidedPace,
} from '../data/onboarding';
import { getManualStepBudget, getManualStepWaitSeconds } from '../engine/manualSteps';
import { qualifyRig } from '../engine/optimization';
import {
  CreatePlayerCoinInput,
  createPlayerCoin,
} from '../engine/coins';
import {
  buildDefaultFab,
  buildFabLine,
  CustomBlueprintDesignInput,
  deleteDraftBlueprint,
  deployCustomInventoryToRig,
  designCustomChipBlueprint,
  designCustomComponentBlueprint,
  finishDevFabBatch,
  queueFabProduction,
  reviseBlueprint,
  runPrototypeTest,
  saveDraftBlueprint,
  sellCustomAsicsWholesale,
  stepFabProduction,
  stripCustomPartFromRig,
} from '../engine/fab';
import { createNewGameStateFromPreset } from '../engine/presets';
import {
  CAREER_STORAGE_KEY,
  clearSavedState,
  createLocalBackup,
  forkDevSession,
  getGameSaveKey,
  loadLocalBackup,
  loadSavedState,
  SANDBOX_STORAGE_KEY,
  serializeSaveEnvelope,
  validateAndParseImportedSave,
} from '../engine/saveSystem';
import { createScenarioState } from '../engine/scenarios';
import {
  advanceOneStep,
  buildDefaultConglomerate,
  BUSINESS_ORDER,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  calculateRigResaleValue,
  cancelLimitOrder,
  canStartResearchNode,
  claimCompletedObjectives,
  closeShortPosition,
  computeAverageRigHealth,
  createInitialComponentHealth,
  createNewGameState,
  ensureRigComponentHealth,
  estimateFleetHashIndex,
  evaluateGenerationMilestones,
  executeSpotBuy,
  executeSpotSell,
  findOpenGridSlot,
  findOpenRoomId,
  generateBlackMarketListings,
  generateInteractiveEvent,
  generateUsedMarketListings,
  getComponentRepairCost,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getEffectivePartBundle,
  getFacility,
  getFacilityRoomExpansionCost,
  getFacilityRooms,
  getFacilityUpgradeCost,
  grantAllSixBusinessesForScenario,
  getRigRepasteCost,
  getRigRepairCost,
  investigateRivalSyndicate,
  openShortPosition,
  placeLimitOrder,
  resolvePendingEvent,
} from '../engine/simulation';
import {
  acquireTargetCompany,
  fundBusinessTurnaround,
  inspectAcquisitionTarget,
  refreshAcquisitionMarket,
} from '../engine/acquisitions';
import {
  establishCorporateHQ,
  getCorporateSynergyEffects,
  renameCorporateHQ,
  toggleSynergyPolicy,
  upgradeCorporateHQ,
} from '../engine/corporate';
import { upgradeBusinessDivision } from '../engine/businesses';
import {
  expandIntelSubscriptions,
  runMarketForecastModel,
  sellPredictionSoftwareLicenses,
  toggleIntelAdvisory,
  upgradePredictionModel,
} from '../engine/marketIntel';
import {
  dropHostingClient,
  expandHostingInfrastructure,
  leaseComputeCapacity,
  onboardHostingClient,
  performServicesSlaAudit,
  setCommercialPoolFee,
  toggleCommercialPool,
} from '../engine/miningServices';
import {
  completeExternalDesignContract,
  licenseBlueprintExternally,
  runCoolingPowerEngineeringTune,
  upgradeHardwareEngLab,
} from '../engine/hardwareEng';
import {
  fulfillInternalSupplyOrder,
  fulfillOemOrderFromInventory,
  runManufacturingQcAudit,
  startOemManufacturingContract,
} from '../engine/manufacturing';
import {
  containParentSpillover,
  getUndergroundDivisionEffects,
  hardenShellSubsidiary,
  runAuditFirewallSweep,
  startUndergroundContract,
} from '../engine/undergroundDiv';
import {
  complyWithAudit,
  developShellCoin,
  executePreparedRaid,
  launchShellCoin,
  payComplianceSettlement,
  prepareVaultRaid,
  resolveRaid,
  rugShellCoin,
  seedShellCoinLiquidity,
  shillShellCoin,
} from '../engine/underground';
import { calculateBaseRigPartsCost, getGlobalHardwarePriceMult, getRigChassisIssue } from '../engine/usedMarket';
import {
  BusinessId,
  CareerPreset,
  ChallengeId,
  ChipProcessNode,
  CoinSymbol,
  CustomComponentSpec,
  DesignProfile,
  DevScenarioId,
  DifficultyLevel,
  EmployeeRole,
  FacilityUpgradeId,
  FirmwareProfile,
  GameState,
  GuidedPaceMode,
  InvestigationStage,
  MarketRegime,
  MiningAlgorithm,
  MiningRig,
  OnboardingMode,
  PartCategory,
  PlacedCoolingUnit,
  PoolMode,
  PowerContractId,
  RaidApproachId,
  RepairComponentSlot,
  RigBuildConfig,
  RigCustomPartSerialsMap,
  RoomCoolingType,
  SandboxConfig,
  ShiftType,
  TaskPriority,
  TransactionCategory,
  TransactionEntry,
} from '../types/game';
import { formatStepLabel, formatUsd } from '../utils/format';
import { soundFx } from '../utils/sound';

const EMPLOYEE_NAMES = [
  'Alex Mercer',
  'Priya Nair',
  'Marcus Vance',
  'Elena Rostova',
  'Kenji Takahashi',
  'Hannah Lindqvist',
  'Devon Brooks',
  'Sofia Alvarez',
  'Liam O’Connor',
  'Maya Patel',
];

export const DEFAULT_STEP_SECONDS = 30;
export const DEFAULT_STEP_HOURS = 24;

function makeTx(
  step: number,
  category: TransactionCategory,
  amountUsd: number,
  description: string
): TransactionEntry {
  return {
    id: `tx_${step}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    step,
    stepLabel: formatStepLabel(step),
    category,
    amountUsd,
    description,
  };
}

export function useGameActions() {
  const [careerSnapshot, setCareerSnapshot] = useState<GameState | null>(() =>
    loadSavedState(CAREER_STORAGE_KEY)
  );
  const [sandboxSnapshot, setSandboxSnapshot] = useState<GameState | null>(() =>
    loadSavedState(SANDBOX_STORAGE_KEY)
  );
  const [state, setGameState] = useState<GameState | null>(() => {
    const saved = loadSavedState(CAREER_STORAGE_KEY);
    if (saved) {
      return { ...saved, mode: 'TITLE_MENU' };
    }
    return null;
  });
  const setState = useCallback((action: SetStateAction<GameState | null>) => {
    setGameState((previous) => {
      const next = typeof action === 'function' ? action(previous) : action;
      if (!next) return null;
      const recorded = recordGuidedProgress(next);
      return previous && recorded !== previous && previous.runSeed === recorded.runSeed &&
        previous.mode === 'PLAYING' && recorded.mode === 'PLAYING' && previous.stepCount === recorded.stepCount
        ? announceGuidedUnlocks(previous, recorded)
        : recorded;
    });
  }, []);

  const autoStepSeconds = state?.stepSeconds ?? DEFAULT_STEP_SECONDS;

  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [showEduLanding, setShowEduLanding] = useState<boolean>(true);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);
  const [matrixRain, setMatrixRain] = useState<boolean>(true);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [activeTerminalModal, setActiveTerminalModal] = useState<'BUILDER' | 'TINKER' | null>(
    null
  );
  const [autoCountdown, setAutoCountdown] = useState<number>(autoStepSeconds);
  const [commandTrigger, setCommandTrigger] = useState<{ seq: number; command: string } | null>(
    null
  );
  const autoStepRef = useRef<() => void>(() => {});

  const triggerTerminalCommand = useCallback((cmd: string) => {
    soundFx.playClick();
    setCommandTrigger((prev) => ({ seq: (prev?.seq ?? 0) + 1, command: cmd }));
  }, []);

  const showBanner = useCallback((msg: string) => {
    setBannerMsg(msg);
  }, []);

  useEffect(() => {
    if (!bannerMsg) return;
    const t = setTimeout(() => setBannerMsg(null), 4000);
    return () => clearTimeout(t);
  }, [bannerMsg]);

  useEffect(() => {
    if (state) {
      soundFx.enabled = state.soundEnabled;
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const key = getGameSaveKey(state);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
      if (state.isSandbox) {
        setSandboxSnapshot(state);
      } else {
        setCareerSnapshot(state);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const handleStartNew = (
    difficulty: DifficultyLevel,
    devMode = false,
    runSeed?: string,
    sandboxConfig?: SandboxConfig,
    challengeId: ChallengeId | null = null,
    onboardingMode: OnboardingMode = 'GUIDED'
  ) => {
    soundFx.playMilestone();
    const fresh = createNewGameState(
      difficulty,
      devMode,
      runSeed,
      sandboxConfig,
      challengeId,
      onboardingMode
    );
    setState(fresh);
    setDevPanelOpen(false);
    setActiveTerminalModal(null);
    setUserPaused(false);
    setAutoCountdown(fresh.stepSeconds ?? DEFAULT_STEP_SECONDS);
    if (devMode) {
      showBanner(`Temporary Dev session active (${fresh.runSeed}). Career and Sandbox saves are protected.`);
    } else if (sandboxConfig || difficulty === 'SANDBOX') {
      showBanner(`Sandbox launched (${fresh.runSeed}): isolated save slot active.`);
    } else if (challengeId) {
      const ch = CHALLENGES.find((c) => c.id === challengeId);
      showBanner(`Challenge run "${ch?.title ?? challengeId}" started on seed ${fresh.runSeed}.`);
    } else {
      showBanner(`New career run started on seed ${fresh.runSeed}.`);
    }
  };

  const handleStartFromPreset = (
    preset: CareerPreset,
    runSeed?: string,
    onboardingOverride?: OnboardingMode
  ) => {
    soundFx.playMilestone();
    const fresh = createNewGameStateFromPreset(preset, runSeed, onboardingOverride);
    setState(fresh);
    setDevPanelOpen(false);
    setActiveTerminalModal(null);
    setUserPaused(false);
    setAutoCountdown(fresh.stepSeconds ?? DEFAULT_STEP_SECONDS);
    showBanner(`Preset "${preset.name}" launched on seed ${fresh.runSeed}.`);
  };

  const handleResume = (sandbox = false) => {
    soundFx.playClick();
    const snap = sandbox ? sandboxSnapshot : careerSnapshot;
    if (snap) {
      setState({ ...snap, mode: 'PLAYING' });
      setActiveTerminalModal(null);
      setAutoCountdown(snap.stepSeconds ?? DEFAULT_STEP_SECONDS);
    }
  };

  const handleBackupSave = (targetState?: GameState): boolean => {
    const src = targetState ?? state ?? careerSnapshot;
    if (!src) return false;
    const ok = createLocalBackup(src);
    if (ok) {
      soundFx.playClick();
      showBanner(`Created local backup for ${src.isSandbox ? 'Sandbox' : 'Career'} save.`);
    }
    return ok;
  };

  const handleRestoreBackup = (sandbox = false): boolean => {
    const backed = loadLocalBackup(sandbox);
    if (!backed) {
      soundFx.playAlert();
      showBanner(`No ${sandbox ? 'Sandbox' : 'Career'} backup found in local storage.`);
      return false;
    }
    soundFx.playMilestone();
    const playing: GameState = { ...backed, mode: 'PLAYING' };
    const key = getGameSaveKey(playing);
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(playing));
      } catch {
        // Ignore storage errors
      }
      if (playing.isSandbox) setSandboxSnapshot(playing);
      else setCareerSnapshot(playing);
    }
    setState(playing);
    setAutoCountdown(playing.stepSeconds ?? DEFAULT_STEP_SECONDS);
    showBanner(`Restored ${sandbox ? 'Sandbox' : 'Career'} backup (Step ${playing.stepCount}).`);
    return true;
  };

  const handleExportSave = (sandbox = false): string | null => {
    const target =
      state && getGameSaveKey(state) && Boolean(state.isSandbox) === sandbox
        ? state
        : sandbox
        ? sandboxSnapshot
        : careerSnapshot;
    if (!target) return null;
    return serializeSaveEnvelope(target);
  };

  const handleImportSaveJson = (
    jsonText: string
  ): { ok: boolean; error?: string; summary?: string } => {
    const res = validateAndParseImportedSave(jsonText);
    if (!res.ok || !res.state) {
      soundFx.playAlert();
      return { ok: false, error: res.error ?? 'Invalid save file.' };
    }
    const imported = res.state;
    const key = getGameSaveKey(imported);
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(imported));
      } catch {
        // Ignore storage errors
      }
      if (imported.isSandbox) setSandboxSnapshot(imported);
      else setCareerSnapshot(imported);
    }
    setState(imported);
    setAutoCountdown(imported.stepSeconds ?? DEFAULT_STEP_SECONDS);
    soundFx.playMilestone();
    showBanner(
      `Imported ${imported.isDevSession ? 'temporary Dev session' : imported.isSandbox ? 'Sandbox save' : 'Career save'} (Step ${imported.stepCount}).`
    );
    return {
      ok: true,
      summary: `Loaded ${imported.isDevSession ? 'Dev' : imported.isSandbox ? 'Sandbox' : 'Career'} Step ${imported.stepCount} (${formatUsd(
        imported.cash
      )}).`,
    };
  };

  const handleResetSave = (sandbox = false) => {
    clearSavedState(sandbox);
    if (sandbox) {
      setSandboxSnapshot(null);
      if (state?.isSandbox) setState(null);
    } else {
      setCareerSnapshot(null);
      if (state && !state.isSandbox) setState(null);
    }
    soundFx.playClick();
    showBanner(`Cleared ${sandbox ? 'Sandbox' : 'Career'} saved progress.`);
  };

  const handleStepSteps = (steps: number, automatic = false) => {
    if (!state) return null;
    if (state.pendingEvent) {
      if (!automatic) {
        soundFx.playAlert();
        showBanner(`Resolve "${state.pendingEvent.title}" in the terminal before stepping.`);
      }
      return null;
    }
    const requested = Math.max(1, Math.min(200, Math.round(steps)));
    const now = Date.now();
    const budget = automatic || state.isSandbox ? null : getManualStepBudget(state.manualStepBudget, now);
    const count = budget ? Math.min(requested, budget.available) : requested;
    if (!automatic && count > 0) soundFx.playClick();

    let current = state;
    let stepsRun = 0;
    let anyMilestone = false;
    let anyAlert = false;
    let totalMiningCash = 0;
    let totalRp = 0;
    let totalBills = 0;
    let totalSoloHits = 0;
    let haltedByEvent = null;

    for (let i = 0; i < count; i++) {
      const res = advanceOneStep(current);
      current = res.nextState;
      stepsRun += 1;
      if (res.milestoneHit) anyMilestone = true;
      if (res.alertHit) anyAlert = true;
      totalMiningCash += res.miningCashEarned;
      totalRp += res.rpEarned;
      totalBills += res.billsSettledUsd;
      totalSoloHits += res.soloBlocksHit;
      if (res.eventTriggered) {
        haltedByEvent = res.eventTriggered;
        break;
      }
    }

    if (anyAlert) soundFx.playAlert();
    else if (anyMilestone) soundFx.playMilestone();
    else if (!automatic && totalMiningCash > 0) soundFx.playCash();

    if (budget && (stepsRun > 0 || budget.refillStartedAt !== state.manualStepBudget?.refillStartedAt)) {
      current = {
        ...current,
        manualStepBudget: { ...budget, available: budget.available - stepsRun },
      };
    }
    if (current !== state) setState(current);
    if (stepsRun > 0) setAutoCountdown(autoStepSeconds);

    const manualStepWaitSeconds =
      budget && stepsRun === count && count < requested
        ? getManualStepWaitSeconds(budget.refillStartedAt, now)
        : undefined;
    if (manualStepWaitSeconds !== undefined) {
      showBanner(`Next manual step available in ${manualStepWaitSeconds}s.`);
    }

    return {
      stepsRun,
      newStepCount: current.stepCount,
      miningCashEarned: totalMiningCash,
      rpEarned: totalRp,
      billsSettledUsd: totalBills,
      soloBlocksHit: totalSoloHits,
      haltedByEvent,
      manualStepWaitSeconds,
    };
  };

  const autoPauseReason = !state
    ? 'Menu'
    : userPaused
    ? 'Manual'
    : state.pendingEvent
    ? 'Event'
    : activeTerminalModal === 'BUILDER'
    ? 'Builder'
    : activeTerminalModal === 'TINKER'
    ? 'Tinker'
    : (state.tutorialStep ?? 0) > 0 && !state.guidedOnboarding?.paused
    ? 'Tutorial'
    : devPanelOpen
    ? 'Dev Panel'
    : null;

  useEffect(() => {
    autoStepRef.current = () => {
      handleStepSteps(1, true);
    };
  });

  useEffect(() => {
    if (showEduLanding || !state || state.mode !== 'PLAYING' || autoPauseReason !== null) {
      return;
    }
    const timer = window.setInterval(() => {
      setAutoCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showEduLanding, state?.mode, autoPauseReason]);

  useEffect(() => {
    if (
      autoCountdown === 0 &&
      !showEduLanding &&
      state?.mode === 'PLAYING' &&
      autoPauseReason === null
    ) {
      autoStepRef.current();
      setAutoCountdown(autoStepSeconds);
    }
  }, [autoCountdown, showEduLanding, state?.mode, autoPauseReason]);

  const handleResolveEvent = (choiceKey: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No game active.' };
    const result = resolvePendingEvent(state, choiceKey);
    if (result.ok) {
      if (result.alertHit) soundFx.playAlert();
      else if (result.milestoneHit) soundFx.playMilestone();
      else soundFx.playClick();
      setState(result.nextState);
      showBanner(result.summary);
    } else {
      soundFx.playAlert();
    }
    return { ok: result.ok, summary: result.summary };
  };

  const handleUnlockCoin = (symbol: CoinSymbol): boolean => {
    if (!state) return false;
    const coin = state.coins[symbol];
    if (!coin || coin.unlocked || state.cash < coin.unlockCostUsd) {
      return false;
    }
    soundFx.playMilestone();
    showBanner(`Unlocked ${coin.name} (${symbol}) for ${formatUsd(coin.unlockCostUsd)}.`);
    setState((prev) => {
      if (!prev) return prev;
      const target = prev.coins[symbol];
      if (!target || target.unlocked || prev.cash < target.unlockCostUsd) return prev;
      return {
        ...prev,
        cash: prev.cash - target.unlockCostUsd,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + target.unlockCostUsd,
        },
        transactions: [
          makeTx(prev.stepCount, 'FACILITY', -target.unlockCostUsd, `Unlocked ${symbol} coin desk`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        coins: {
          ...prev.coins,
          [symbol]: {
            ...target,
            unlocked: true,
          },
        },
        news: [
          {
            id: `news_coin_${Date.now()}`,
            step: prev.stepCount,
            stepLabel: formatStepLabel(prev.stepCount),
            title: `Unlocked Coin Tier: ${target.name} (${symbol})`,
            detail: `Rigs can now mine ${symbol} (${target.algorithm}) with automatic step-by-step cash payouts.`,
            category: 'MILESTONE' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    return true;
  };

  const handleCreatePlayerCoin = (
    input: CreatePlayerCoinInput
  ): { ok: boolean; summary: string; symbol?: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = createPlayerCoin(state, input);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playMilestone();
    setState((prev) => (prev ? createPlayerCoin(prev, input).nextState : prev));
    showBanner(check.summary);
    return { ok: true, summary: check.summary, symbol: check.symbol };
  };

  const handleToggleRig = (rigId: string) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r) => (r.id === rigId ? { ...r, enabled: !r.enabled } : r)),
          }
        : prev
    );
  };

  const handleChangeRigCoin = (rigId: string, coin: CoinSymbol) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r) => (r.id === rigId ? { ...r, targetCoin: coin } : r)),
          }
        : prev
    );
  };

  const handleChangeRigOverclock = (rigId: string, oc: number) => {
    const clamped = Math.max(80, Math.min(150, Math.round(oc)));
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r) => (r.id === rigId ? { ...r, overclockPct: clamped } : r)),
          }
        : prev
    );
  };

  const handleOverclockRigs = (rigIndexOrAll: number | 'ALL', oc: number): boolean => {
    if (!state || state.rigs.length === 0) return false;
    const clamped = Math.max(80, Math.min(150, Math.round(oc)));
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rigs: prev.rigs.map((r, idx) =>
          rigIndexOrAll === 'ALL' || idx === rigIndexOrAll ? { ...r, overclockPct: clamped } : r
        ),
      };
    });
    return true;
  };

  const handleSetTutorialStep = (tutorialStep: number) => {
    setState((prev) => (prev ? { ...prev, tutorialStep } : prev));
  };

  const handleQualifyRig = (
    rigIndex: number,
    goal: Parameters<typeof qualifyRig>[2],
    reference: Parameters<typeof qualifyRig>[3]
  ) => {
    const rig = state?.rigs[rigIndex];
    if (!state || !rig) return { ok: false, summary: 'Choose a rig from "rigs".' };
    const result = qualifyRig(state, rig, goal, reference);
    if (result.ok) {
      setState((previous) => {
        const current = previous?.rigs.find((candidate) => candidate.id === rig.id);
        return previous && current ? qualifyRig(previous, current, goal, reference).nextState : previous;
      });
    }
    return { ok: result.ok, summary: result.summary };
  };

  const handleMarkTutorialSeen = (guideId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const system = CONTEXTUAL_GUIDES[guideId]?.system;
      if (system) return encounterGuidedLesson(prev, system);
      const existing = prev.seenTutorials ?? [];
      if (existing.includes(guideId)) return prev;
      return {
        ...prev,
        seenTutorials: [...existing, guideId],
      };
    });
  };

  const handleFinishGuidedLesson = () => setState((prev) => prev ? finishGuidedLesson(prev) : prev);

  const handleSetOnboardingMode = (onboardingMode: OnboardingMode) => {
    setState((prev) => prev
      ? { ...prev, onboardingMode, tutorialStep: onboardingMode === 'VETERAN' ? 0 : prev.tutorialStep }
      : prev);
  };

  const handleCompleteGuidedTask = (taskIdOrNum: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = completeGuidedTask(state, taskIdOrNum);
    if (!res.ok) return { ok: false, summary: res.summary };
    soundFx.playMilestone();
    setState((prev) => (prev ? completeGuidedTask(prev, taskIdOrNum).nextState : prev));
    return { ok: true, summary: res.summary };
  };

  const handlePauseGuidedOnboarding = (paused: boolean) => {
    soundFx.playClick();
    setState((prev) => (prev ? pauseGuidedOnboarding(prev, paused) : prev));
  };

  const handleSetGuidedPace = (pace: GuidedPaceMode) => {
    soundFx.playClick();
    setState((prev) => (prev ? setGuidedPace(prev, pace) : prev));
  };

  const handleDismissGuidedSystem = (sysId: string) => {
    soundFx.playClick();
    setState((prev) => (prev ? dismissGuidedSystem(prev, sysId) : prev));
  };

  const handleRevisitGuidedTopic = (topicId: string) => {
    setState((prev) => (prev ? revisitGuidedTopic(prev, topicId) : prev));
  };

  const handleSetSimSpeed = (
    stepSeconds: number,
    stepHours?: number
  ): { ok: boolean; summary: string } => {
    const seconds = Math.max(5, Math.min(300, Math.round(stepSeconds)));
    const hours =
      stepHours === undefined ? undefined : Math.max(1, Math.min(24, Math.round(stepHours)));
    setState((prev) =>
      prev
        ? { ...prev, stepSeconds: seconds, ...(hours !== undefined ? { stepHours: hours } : {}) }
        : prev
    );
    setAutoCountdown(seconds);
    const effectiveHours = hours ?? state?.stepHours ?? DEFAULT_STEP_HOURS;
    return {
      ok: true,
      summary: `Simulation speed: 1 step every ${seconds}s (${(DEFAULT_STEP_SECONDS / seconds).toFixed(
        2
      )}x) | Game clock: ${effectiveHours}h per step.`,
    };
  };

  const handleClaimObjectives = () => {
    setState((prev) => {
      if (!prev) return prev;
      const res = claimCompletedObjectives(prev);
      return res.newlyCompleted.length > 0 ? res.nextState : prev;
    });
  };

  const handleTinkerPart = (
    rigIndex: number,
    slot: 'chassis' | 'compute' | 'storage' | 'psu' | 'cooling' | 'os',
    partId: string
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const rig = state.rigs[rigIndex];
    if (!rig) return { ok: false, summary: `Rig #${rigIndex + 1} not found.` };

    const isUnlocked = (req?: string) =>
      state.devUnlockAll || !req || state.unlockedResearch.includes(req);
    const hwMult = getGlobalHardwarePriceMult(state);

    let netCost = 0;
    let nextRigPatch: Partial<MiningRig> = {};
    let detailNote = '';

    if (slot === 'chassis') {
      const oldPart = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
      const newPart = CHASSIS_PARTS.find((c) => c.id === partId);
      if (!newPart) return { ok: false, summary: 'Chassis part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }

      netCost += calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));

      let nextGpus = [...rig.gpuIds];
      if (nextGpus.length > newPart.maxGpus) {
        const removed = nextGpus.slice(newPart.maxGpus);
        nextGpus = nextGpus.slice(0, newPart.maxGpus);
        const gpuRefund = removed.reduce((s, gid) => {
          const g = GPU_PARTS.find((x) => x.id === gid);
          return s + Math.round((g?.cost ?? 0) * 0.6);
        }, 0);
        netCost -= gpuRefund;
        detailNote += ` (Removed ${removed.length} GPU(s) beyond slot cap)`;
      }

      let nextComputeId = rig.computeId;
      const oldCompute = COMPUTE_PARTS.find((c) => c.id === rig.computeId) ?? COMPUTE_PARTS[0];
      const supportsHybrid = newPart.maxAsics >= 1 && newPart.maxGpus > 0;
      const isAsicOnly = newPart.isAsicRack && newPart.maxGpus === 0;
      const compatible = supportsHybrid
        ? true
        : isAsicOnly
        ? oldCompute.kind === 'ASIC'
        : oldCompute.kind !== 'ASIC';
      if (!compatible) {
        const replacement = COMPUTE_PARTS.find(
          (c) =>
            (isAsicOnly ? c.kind === 'ASIC' : c.kind !== 'ASIC') &&
            isUnlocked(c.researchRequired)
        );
        if (!replacement) {
          return {
            ok: false,
            summary: `Cannot convert chassis: no unlocked ${
              isAsicOnly ? 'ASIC' : 'CPU/FPGA'
            } compute module available.`,
          };
        }
        netCost += calculatePartTradeInCost(oldCompute.cost, Math.round(replacement.cost * hwMult));
        nextComputeId = replacement.id;
        detailNote += ` & swapped compute to ${replacement.name}`;
      }

      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { chassisId: newPart.id, computeId: nextComputeId, gpuIds: nextGpus };
      detailNote = `Swapped chassis -> ${newPart.name}${detailNote}`;
    } else if (slot === 'compute') {
      const chassis = getEffectivePartBundle(rig).chassis;
      const oldPart = COMPUTE_PARTS.find((c) => c.id === rig.computeId) ?? COMPUTE_PARTS[0];
      const newPart = COMPUTE_PARTS.find((c) => c.id === partId);
      if (!newPart) return { ok: false, summary: 'Compute part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (newPart.kind === 'ASIC' && chassis.maxAsics < 1) {
        return {
          ok: false,
          summary: `${chassis.name} requires a 42U/Hydro ASIC or Hybrid chassis for ASIC blades.`,
        };
      }
      if (newPart.kind !== 'ASIC' && chassis.isAsicRack && chassis.maxGpus === 0) {
        return { ok: false, summary: `${chassis.name} only accepts ASIC blades.` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));
      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { computeId: newPart.id };
      detailNote = `Swapped compute -> ${newPart.name}`;
    } else if (slot === 'storage') {
      const oldPart = STORAGE_PARTS.find((s) => s.id === rig.storageId) ?? STORAGE_PARTS[0];
      const newPart = STORAGE_PARTS.find((s) => s.id === partId);
      if (!newPart) return { ok: false, summary: 'Storage part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));
      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { storageId: newPart.id };
      detailNote = `Swapped storage -> ${newPart.name}`;
    } else if (slot === 'psu') {
      const oldPart = PSU_PARTS.find((p) => p.id === rig.psuId) ?? PSU_PARTS[0];
      const newPart = PSU_PARTS.find((p) => p.id === partId);
      if (!newPart) return { ok: false, summary: 'PSU part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));
      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { psuId: newPart.id };
      detailNote = `Swapped PSU -> ${newPart.name}`;
    } else if (slot === 'cooling') {
      const oldPart = COOLING_PARTS.find((c) => c.id === rig.coolingId) ?? COOLING_PARTS[0];
      const newPart = COOLING_PARTS.find((c) => c.id === partId);
      if (!newPart) return { ok: false, summary: 'Cooling part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));
      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { coolingId: newPart.id };
      detailNote = `Swapped cooling -> ${newPart.name}`;
    } else if (slot === 'os') {
      const oldPart = OS_PARTS.find((o) => o.id === rig.osId) ?? OS_PARTS[0];
      const newPart = OS_PARTS.find((o) => o.id === partId);
      if (!newPart) return { ok: false, summary: 'OS part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return {
          ok: false,
          summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".`,
        };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already runs ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, Math.round(newPart.cost * hwMult));
      if (state.cash < netCost) {
        return {
          ok: false,
          summary: `Insufficient cash (need ${formatUsd(netCost)} after 60% trade-in).`,
        };
      }
      nextRigPatch = { osId: newPart.id };
      detailNote = `Flashed OS -> ${newPart.name}`;
    }

    const computeSwapped = slot === 'compute' || (nextRigPatch.computeId !== undefined && nextRigPatch.computeId !== rig.computeId);
    const fitIssue = getRigChassisIssue({
      ...rig, ...nextRigPatch,
      customAsicSpec: computeSwapped ? undefined : rig.customAsicSpec,
      customParts: rig.customParts ? {
        ...rig.customParts,
        chassis: slot === 'chassis' ? undefined : rig.customParts.chassis,
        compute: computeSwapped ? undefined : rig.customParts.compute,
      } : undefined,
    });
    if (fitIssue) return { ok: false, summary: fitIssue };
    soundFx.playCash();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - netCost,
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + Math.max(0, netCost),
            },
            stats: {
              ...prev.stats,
              totalHardwareSpendUsd: prev.stats.totalHardwareSpendUsd + Math.max(0, netCost),
              totalHardwareSalesUsd: prev.stats.totalHardwareSalesUsd + Math.max(0, -netCost),
            },
            transactions: [
              makeTx(
                prev.stepCount,
                netCost >= 0 ? 'HARDWARE' : 'SALE',
                -netCost,
                `${rig.name}: ${detailNote}`
              ),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            rigs: prev.rigs.map((r, i) => {
              if (i !== rigIndex) return r;
              const baseComp = ensureRigComponentHealth(r);
              const nextGpuLen = nextRigPatch.gpuIds ? nextRigPatch.gpuIds.length : r.gpuIds.length;
              const computeSwapped =
                slot === 'compute' ||
                (nextRigPatch.computeId !== undefined && nextRigPatch.computeId !== r.computeId);
              const nextComp = {
                chassis: slot === 'chassis' ? 100 : baseComp.chassis,
                compute: computeSwapped ? 100 : baseComp.compute,
                gpus: baseComp.gpus.slice(0, nextGpuLen),
                storage: slot === 'storage' ? 100 : baseComp.storage,
                psu: slot === 'psu' ? 100 : baseComp.psu,
                cooling: slot === 'cooling' ? 100 : baseComp.cooling,
              };
              const nextAvg = computeAverageRigHealth(nextComp);
              const minComp = Math.min(
                nextComp.chassis,
                nextComp.compute,
                ...nextComp.gpus,
                nextComp.storage,
                nextComp.psu,
                nextComp.cooling
              );
              const nextStatus =
                r.status === 'NEEDS_REPAIR' && nextAvg > 20 && minComp > 20
                  ? r.enabled
                    ? 'MINING'
                    : 'PAUSED'
                  : r.status;
              const nextCustomParts = r.customParts ? { ...r.customParts } : undefined;
              const nextSerials = r.customPartSerials ? { ...r.customPartSerials } : undefined;
              if (nextCustomParts) {
                if (slot === 'chassis') delete nextCustomParts.chassis;
                if (computeSwapped) delete nextCustomParts.compute;
                if (slot === 'storage') delete nextCustomParts.storage;
                if (slot === 'psu') delete nextCustomParts.psu;
                if (slot === 'cooling') delete nextCustomParts.cooling;
                if (slot === 'os') delete nextCustomParts.os;
                if (nextCustomParts.gpus) {
                  nextCustomParts.gpus = nextCustomParts.gpus.slice(0, nextGpuLen);
                }
              }
              if (nextSerials) {
                if (slot === 'chassis') delete nextSerials.chassis;
                if (computeSwapped) delete nextSerials.compute;
                if (slot === 'storage') delete nextSerials.storage;
                if (slot === 'psu') delete nextSerials.psu;
                if (slot === 'cooling') delete nextSerials.cooling;
                if (slot === 'os') delete nextSerials.os;
                if (nextSerials.gpus) {
                  nextSerials.gpus = nextSerials.gpus.slice(0, nextGpuLen);
                }
              }
              return {
                ...r,
                ...nextRigPatch,
                customAsicSpec: computeSwapped ? undefined : r.customAsicSpec,
                customParts: nextCustomParts,
                customPartSerials: nextSerials,
                componentHealth: nextComp,
                healthPct: nextAvg,
                status: nextStatus,
              };
            }),
          }
        : prev
    );

    const costLabel =
      netCost >= 0
        ? `Paid ${formatUsd(netCost)} net`
        : `Refunded +${formatUsd(Math.abs(netCost))}`;
    return { ok: true, summary: `${rig.name}: ${detailNote} (${costLabel} w/ 60% trade-in).` };
  };

  const handleTinkerGpu = (
    rigIndex: number,
    action: 'ADD' | 'REMOVE' | 'CLEAR',
    gpuIdOrSlotIdx?: string | number,
    qty = 1
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const rig = state.rigs[rigIndex];
    if (!rig) return { ok: false, summary: `Rig #${rigIndex + 1} not found.` };
    const chassis = getEffectivePartBundle(rig).chassis;
    const hwMult = getGlobalHardwarePriceMult(state);

    if (action === 'CLEAR') {
      if (rig.gpuIds.length === 0) {
        return { ok: false, summary: `${rig.name} has no GPUs to remove.` };
      }
      const { gpus: bundleGpus } = getEffectivePartBundle(rig);
      const refund = bundleGpus.reduce((s, g) => s + Math.round((g?.cost ?? 0) * 0.6), 0);
      soundFx.playCash();
      setState((prev) =>
        prev
          ? {
              ...prev,
              cash: prev.cash + refund,
              stats: {
                ...prev.stats,
                totalHardwareSalesUsd: prev.stats.totalHardwareSalesUsd + refund,
              },
              transactions: [
                makeTx(prev.stepCount, 'SALE', refund, `Removed all GPUs from ${rig.name}`),
                ...(prev.transactions ?? []),
              ].slice(0, 200),
              rigs: prev.rigs.map((r, i) => {
                if (i !== rigIndex) return r;
                const baseComp = ensureRigComponentHealth(r);
                const nextComp = { ...baseComp, gpus: [] };
                return {
                  ...r,
                  gpuIds: [],
                  customParts: r.customParts ? { ...r.customParts, gpus: [] } : undefined,
                  customPartSerials: r.customPartSerials
                    ? { ...r.customPartSerials, gpus: [] }
                    : undefined,
                  componentHealth: nextComp,
                  healthPct: computeAverageRigHealth(nextComp),
                };
              }),
            }
          : prev
      );
      return {
        ok: true,
        summary: `Removed all GPUs from ${rig.name} (+${formatUsd(refund)} trade-in).`,
      };
    }

    if (action === 'REMOVE') {
      const slotIdx = typeof gpuIdOrSlotIdx === 'number' ? gpuIdOrSlotIdx : 0;
      const gid = rig.gpuIds[slotIdx];
      if (!gid) return { ok: false, summary: `GPU slot #${slotIdx + 1} is empty.` };
      const spec = getEffectivePartBundle(rig).gpus[slotIdx] ?? GPU_PARTS.find((g) => g.id === gid);
      const refund = Math.round((spec?.cost ?? 0) * 0.6);
      soundFx.playCash();
      setState((prev) =>
        prev
          ? {
              ...prev,
              cash: prev.cash + refund,
              stats: {
                ...prev.stats,
                totalHardwareSalesUsd: prev.stats.totalHardwareSalesUsd + refund,
              },
              transactions: [
                makeTx(
                  prev.stepCount,
                  'SALE',
                  refund,
                  `Trade-in ${spec?.name ?? 'GPU'} from ${rig.name}`
                ),
                ...(prev.transactions ?? []),
              ].slice(0, 200),
              rigs: prev.rigs.map((r, i) => {
                if (i !== rigIndex) return r;
                const baseComp = ensureRigComponentHealth(r);
                const nextComp = {
                  ...baseComp,
                  gpus: baseComp.gpus.filter((_h, gIdx) => gIdx !== slotIdx),
                };
                return {
                  ...r,
                  gpuIds: r.gpuIds.filter((_id, gIdx) => gIdx !== slotIdx),
                  customParts: r.customParts
                    ? {
                        ...r.customParts,
                        gpus: (r.customParts.gpus ?? []).filter((_cg, gIdx) => gIdx !== slotIdx),
                      }
                    : undefined,
                  customPartSerials: r.customPartSerials
                    ? {
                        ...r.customPartSerials,
                        gpus: (r.customPartSerials.gpus ?? []).filter(
                          (_sg, gIdx) => gIdx !== slotIdx
                        ),
                      }
                    : undefined,
                  componentHealth: nextComp,
                  healthPct: computeAverageRigHealth(nextComp),
                };
              }),
            }
          : prev
      );
      return {
        ok: true,
        summary: `Removed ${spec?.name ?? 'GPU'} from slot #${slotIdx + 1} (+${formatUsd(
          refund
        )} trade-in).`,
      };
    }

    if (chassis.maxGpus <= 0) {
      return { ok: false, summary: `${chassis.name} does not support discrete GPUs.` };
    }
    const slotsLeft = chassis.maxGpus - rig.gpuIds.length;
    if (slotsLeft <= 0) {
      return { ok: false, summary: `All ${chassis.maxGpus} GPU slots on ${rig.name} are full.` };
    }
    const gpuSpec = GPU_PARTS.find((g) => g.id === gpuIdOrSlotIdx);
    if (!gpuSpec) return { ok: false, summary: 'GPU part not found.' };
    if (
      !state.devUnlockAll &&
      gpuSpec.researchRequired &&
      !state.unlockedResearch.includes(gpuSpec.researchRequired)
    ) {
      const node = RESEARCH_NODES.find((n) => n.id === gpuSpec.researchRequired);
      return {
        ok: false,
        summary: `Locked: requires R&D "${node?.name ?? gpuSpec.researchRequired}".`,
      };
    }
    const toAdd = Math.min(slotsLeft, Math.max(1, qty));
    const fitIssue = getRigChassisIssue({ ...rig, gpuIds: [...rig.gpuIds, ...Array(toAdd).fill(gpuSpec.id)] });
    if (fitIssue) return { ok: false, summary: fitIssue };
    const totalCost = Math.round(gpuSpec.cost * hwMult) * toAdd;
    if (state.cash < totalCost) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(totalCost)}).` };
    }
    soundFx.playCash();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - totalCost,
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + totalCost,
            },
            stats: {
              ...prev.stats,
              totalHardwareSpendUsd: prev.stats.totalHardwareSpendUsd + totalCost,
            },
            transactions: [
              makeTx(
                prev.stepCount,
                'HARDWARE',
                -totalCost,
                `Added ${toAdd}x ${gpuSpec.name} to ${rig.name}`
              ),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            rigs: prev.rigs.map((r, i) => {
              if (i !== rigIndex) return r;
              const baseComp = ensureRigComponentHealth(r);
              const nextComp = {
                ...baseComp,
                gpus: [...baseComp.gpus, ...Array(toAdd).fill(100)],
              };
              return {
                ...r,
                gpuIds: [...r.gpuIds, ...Array(toAdd).fill(gpuSpec.id)],
                componentHealth: nextComp,
                healthPct: computeAverageRigHealth(nextComp),
              };
            }),
          }
        : prev
    );
    return {
      ok: true,
      summary: `Installed ${toAdd}x ${gpuSpec.name} into ${rig.name} (${formatUsd(totalCost)}).`,
    };
  };

  const handleSetRigPool = (rigIndexOrAll: number | 'ALL', pool: PoolMode): boolean => {
    if (!state) return false;
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rigs: prev.rigs.map((r, idx) =>
          rigIndexOrAll === 'ALL' || idx === rigIndexOrAll ? { ...r, poolMode: pool } : r
        ),
      };
    });
    return true;
  };

  const handleSetRigProfile = (
    rigIndexOrAll: number | 'ALL',
    profile: FirmwareProfile
  ): boolean => {
    if (!state) return false;
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rigs: prev.rigs.map((r, idx) =>
          rigIndexOrAll === 'ALL' || idx === rigIndexOrAll
            ? { ...r, firmwareProfile: profile }
            : r
        ),
      };
    });
    return true;
  };

  const handleSetRigPayout = (
    rigIndexOrAll: number | 'ALL',
    payoutMode: 'AUTOSELL' | 'HOLD'
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    if (rigIndexOrAll !== 'ALL' && !state.rigs[rigIndexOrAll]) {
      return { ok: false, summary: `Rig #${rigIndexOrAll + 1} not found.` };
    }
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r, idx) =>
              rigIndexOrAll === 'ALL' || idx === rigIndexOrAll ? { ...r, payoutMode } : r
            ),
          }
        : prev
    );
    const scope =
      rigIndexOrAll === 'ALL'
        ? `All ${state.rigs.length} rig(s)`
        : state.rigs[rigIndexOrAll]?.name ?? `Rig #${rigIndexOrAll + 1}`;
    return {
      ok: true,
      summary:
        payoutMode === 'HOLD'
          ? `${scope} set to HOLD payouts (mined coins accumulate in Treasury Wallet).`
          : `${scope} set to AUTOSELL payouts (mined coins auto-liquidate every step).`,
    };
  };

  const handleExchangeBuy = (
    coin: CoinSymbol,
    usdAmount: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = executeSpotBuy(state, coin, usdAmount);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? executeSpotBuy(prev, coin, usdAmount).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleExchangeSell = (
    coin: CoinSymbol,
    amountOrAll: number | 'ALL'
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = executeSpotSell(state, coin, amountOrAll);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? executeSpotSell(prev, coin, amountOrAll).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handlePlaceLimitOrder = (
    side: 'BUY' | 'SELL',
    coin: CoinSymbol,
    targetPriceUsd: number,
    amount: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = placeLimitOrder(state, side, coin, targetPriceUsd, amount);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playClick();
    setState((prev) =>
      prev ? placeLimitOrder(prev, side, coin, targetPriceUsd, amount).nextState : prev
    );
    return { ok: true, summary: check.summary };
  };

  const handleCancelLimitOrder = (orderIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = cancelLimitOrder(state, orderIdx);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playClick();
    setState((prev) => (prev ? cancelLimitOrder(prev, orderIdx).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleOpenShort = (
    coin: CoinSymbol,
    collateralUsd: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = openShortPosition(state, coin, collateralUsd);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? openShortPosition(prev, coin, collateralUsd).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleCloseShort = (posIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = closeShortPosition(state, posIdx);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? closeShortPosition(prev, posIdx).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleBuildFabLine = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = buildFabLine(state);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playMilestone();
    setState((prev) => (prev ? buildFabLine(prev).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleDesignCustomComponent = (
    input: CustomBlueprintDesignInput
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = designCustomComponentBlueprint(state, input);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? designCustomComponentBlueprint(prev, input).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleSaveDraftBlueprint = (
    input: CustomBlueprintDesignInput
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = saveDraftBlueprint(state, input);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playClick();
    setState((prev) => (prev ? saveDraftBlueprint(prev, input).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleDeleteDraftBlueprint = (draftIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = deleteDraftBlueprint(state, draftIdx);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playClick();
    setState((prev) => (prev ? deleteDraftBlueprint(prev, draftIdx).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleTapeoutDraftBlueprint = (draftIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const fab = buildDefaultFab(state.fab);
    const draft = fab.draftBlueprints?.[draftIdx];
    if (!draft) return { ok: false, summary: `Draft #${draftIdx + 1} not found.` };
    const input: CustomBlueprintDesignInput = {
      name: draft.name,
      partCategory: draft.partCategory ?? 'compute',
      architecture: draft.architecture ?? 'ASIC_BLADE',
      processNode: draft.processNode,
      focus: draft.algo,
      branch: draft.branch,
      engineering: draft.engineering,
      componentParams: draft.componentParams,
      subFeature: draft.subFeature,
      profile: draft.designProfile,
    };
    const check = designCustomComponentBlueprint(state, input);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const d = buildDefaultFab(prev.fab).draftBlueprints?.[draftIdx];
      if (!d) return prev;
      const res = designCustomComponentBlueprint(prev, {
        name: d.name,
        partCategory: d.partCategory ?? 'compute',
        architecture: d.architecture ?? 'ASIC_BLADE',
        processNode: d.processNode,
        focus: d.algo,
        branch: d.branch,
        engineering: d.engineering,
        componentParams: d.componentParams,
        subFeature: d.subFeature,
        profile: d.designProfile,
      });
      if (!res.ok) return prev;
      const cleanedDrafts = (res.nextState.fab?.draftBlueprints ?? []).filter(
        (_item, i) => i !== draftIdx
      );
      return {
        ...res.nextState,
        fab: res.nextState.fab
          ? { ...res.nextState.fab, draftBlueprints: cleanedDrafts }
          : res.nextState.fab,
      };
    });
    return { ok: true, summary: check.summary };
  };

  const handleReviseBlueprint = (
    bpIdx: number,
    updates: Partial<CustomBlueprintDesignInput> & { revisionNote?: string }
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = reviseBlueprint(state, bpIdx, updates);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? reviseBlueprint(prev, bpIdx, updates).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleRunPrototypeTest = (bpIdx: number, forcedStatus?: Parameters<typeof runPrototypeTest>[2]): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = runPrototypeTest(state, bpIdx, forcedStatus);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playMilestone();
    setState((prev) => (prev ? runPrototypeTest(prev, bpIdx, forcedStatus).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleDevFinishFabBatch = (outcome: 'PASS' | 'SCRAP') => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const result = finishDevFabBatch(state, outcome);
    if (result.ok) setState((prev) => prev ? finishDevFabBatch(prev, outcome).nextState : prev);
    return result;
  };

  const handleDesignCustomChip = (
    name: string,
    algo: MiningAlgorithm,
    node: ChipProcessNode,
    profile: DesignProfile = 'BALANCED'
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = designCustomChipBlueprint(state, name, algo, node, profile);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) =>
      prev ? designCustomChipBlueprint(prev, name, algo, node, profile).nextState : prev
    );
    return { ok: true, summary: check.summary };
  };

  const handleStripCustomAsic = (
    rigIdx: number,
    slot: PartCategory = 'compute',
    gpuSlotIdx = 0
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = stripCustomPartFromRig(state, rigIdx, slot, gpuSlotIdx);
    if (!res.ok) return { ok: false, summary: res.summary };
    soundFx.playClick();
    setState((prev) =>
      prev ? stripCustomPartFromRig(prev, rigIdx, slot, gpuSlotIdx).nextState : prev
    );
    return { ok: true, summary: res.summary };
  };

  const handleQueueFabProduction = (
    bpIdx: number,
    qty: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = queueFabProduction(state, bpIdx, qty);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? queueFabProduction(prev, bpIdx, qty).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleDeployCustomAsic = (
    invIdx: number,
    rigIdx: number,
    gpuSlotIdx?: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = deployCustomInventoryToRig(state, invIdx, rigIdx, gpuSlotIdx);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playMilestone();
    setState((prev) =>
      prev ? deployCustomInventoryToRig(prev, invIdx, rigIdx, gpuSlotIdx).nextState : prev
    );
    return { ok: true, summary: check.summary };
  };

  const handleSellCustomAsic = (
    invIdx: number,
    qtyOrAll: number | 'ALL'
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const check = sellCustomAsicsWholesale(state, invIdx, qtyOrAll);
    if (!check.ok) return { ok: false, summary: check.summary };
    soundFx.playCash();
    setState((prev) => (prev ? sellCustomAsicsWholesale(prev, invIdx, qtyOrAll).nextState : prev));
    return { ok: true, summary: check.summary };
  };

  const handleRepairRigs = (
    rigIndexOrAll: number | 'ALL'
  ): { ok: boolean; count: number; cost: number } => {
    if (!state) return { ok: false, count: 0, cost: 0 };
    const targets = state.rigs.filter(
      (r, idx) =>
        (rigIndexOrAll === 'ALL' || idx === rigIndexOrAll) &&
        (getRigRepairCost(r, state) > 0 ||
          r.healthPct < 100 ||
          r.status === 'FAILED' ||
          r.status === 'NEEDS_REPAIR')
    );
    const totalCost = targets.reduce((s, r) => s + getRigRepairCost(r, state), 0);
    if (targets.length === 0 || state.cash < totalCost) {
      return { ok: false, count: 0, cost: totalCost };
    }
    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const targetIds = new Set(targets.map((t) => t.id));
      return {
        ...prev,
        cash: prev.cash - totalCost,
        currentCycleStats: {
          ...prev.currentCycleStats,
          maintenanceSpendUsd: prev.currentCycleStats.maintenanceSpendUsd + totalCost,
        },
        stats: {
          ...prev.stats,
          totalMaintenanceCostUsd: prev.stats.totalMaintenanceCostUsd + totalCost,
          repairsCompleted: prev.stats.repairsCompleted + targets.length,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'REPAIR',
            -totalCost,
            `Repaired ${targets.length} mining rig(s) to 100%`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: prev.rigs.map((r) =>
          targetIds.has(r.id)
            ? {
                ...r,
                componentHealth: createInitialComponentHealth(r.gpuIds.length, 100),
                healthPct: 100,
                status: r.enabled ? 'MINING' : 'PAUSED',
              }
            : r
        ),
      };
    });
    return { ok: true, count: targets.length, cost: totalCost };
  };

  const handleRepairComponent = (
    rigIndex: number,
    slot: RepairComponentSlot,
    gpuSlotIndex?: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const rig = state.rigs[rigIndex];
    if (!rig) return { ok: false, summary: `Rig #${rigIndex + 1} not found.` };

    if (slot === 'gpu') {
      if (rig.gpuIds.length === 0) {
        return { ok: false, summary: `${rig.name} has no GPUs installed.` };
      }
      if (
        typeof gpuSlotIndex === 'number' &&
        (gpuSlotIndex < 0 || gpuSlotIndex >= rig.gpuIds.length)
      ) {
        return {
          ok: false,
          summary: `GPU slot #${gpuSlotIndex + 1} not found on ${rig.name} (installed slots: 1..${rig.gpuIds.length}).`,
        };
      }
    }

    const cost = getComponentRepairCost(rig, slot, gpuSlotIndex, state);
    if (cost <= 0) {
      const partLabel =
        slot === 'gpu'
          ? typeof gpuSlotIndex === 'number'
            ? `GPU #${gpuSlotIndex + 1}`
            : 'GPUs'
          : slot.toUpperCase();
      return { ok: false, summary: `${rig.name} ${partLabel} is already at 100% health.` };
    }
    if (state.cash < cost) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(cost)}).` };
    }

    const baseComp = ensureRigComponentHealth(rig);
    const nextGpus =
      slot === 'gpu'
        ? typeof gpuSlotIndex === 'number'
          ? baseComp.gpus.map((h, i) => (i === gpuSlotIndex ? 100 : h))
          : baseComp.gpus.map(() => 100)
        : baseComp.gpus;
    const nextComp = {
      chassis: slot === 'chassis' ? 100 : baseComp.chassis,
      compute: slot === 'compute' ? 100 : baseComp.compute,
      gpus: nextGpus,
      storage: slot === 'storage' ? 100 : baseComp.storage,
      psu: slot === 'psu' ? 100 : baseComp.psu,
      cooling: slot === 'cooling' ? 100 : baseComp.cooling,
    };
    const nextAvg = computeAverageRigHealth(nextComp);
    const minCompHealth = Math.min(
      nextComp.chassis,
      nextComp.compute,
      ...nextComp.gpus,
      nextComp.storage,
      nextComp.psu,
      nextComp.cooling
    );
    const stillCritical = nextAvg <= 20 || minCompHealth <= 20;

    const partLabel =
      slot === 'gpu'
        ? typeof gpuSlotIndex === 'number'
          ? `GPU #${gpuSlotIndex + 1}`
          : `all ${rig.gpuIds.length} GPU(s)`
        : slot.toUpperCase();

    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cash: prev.cash - cost,
        currentCycleStats: {
          ...prev.currentCycleStats,
          maintenanceSpendUsd: prev.currentCycleStats.maintenanceSpendUsd + cost,
        },
        stats: {
          ...prev.stats,
          totalMaintenanceCostUsd: prev.stats.totalMaintenanceCostUsd + cost,
          repairsCompleted: prev.stats.repairsCompleted + 1,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'REPAIR',
            -cost,
            `Repaired ${partLabel} on ${rig.name} (avg health ${Math.round(nextAvg)}%)`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: prev.rigs.map((r, i) => {
          if (i !== rigIndex) return r;
          const nextStatus =
            r.status === 'FAILED' || r.status === 'NEEDS_REPAIR'
              ? stillCritical
                ? 'NEEDS_REPAIR'
                : r.enabled
                ? 'MINING'
                : 'PAUSED'
              : r.status;
          return {
            ...r,
            componentHealth: nextComp,
            healthPct: nextAvg,
            status: nextStatus,
          };
        }),
      };
    });

    return {
      ok: true,
      summary: `Repaired ${partLabel} on ${rig.name} to 100% for ${formatUsd(cost)} (Rig avg health: ${Math.round(
        nextAvg
      )}%${stillCritical ? ' — another component still <=20%!' : ''}).`,
    };
  };

  const handleRepasteRigs = (
    rigIndexOrAll: number | 'ALL'
  ): { ok: boolean; count: number; cost: number } => {
    if (!state) return { ok: false, count: 0, cost: 0 };
    const targets = state.rigs.filter(
      (_r, idx) => rigIndexOrAll === 'ALL' || idx === rigIndexOrAll
    );
    const totalCost = targets.reduce((s, r) => s + getRigRepasteCost(r), 0);
    if (targets.length === 0 || state.cash < totalCost) {
      return { ok: false, count: 0, cost: totalCost };
    }
    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const targetIds = new Set(targets.map((t) => t.id));
      return {
        ...prev,
        cash: prev.cash - totalCost,
        currentCycleStats: {
          ...prev.currentCycleStats,
          maintenanceSpendUsd: prev.currentCycleStats.maintenanceSpendUsd + totalCost,
        },
        stats: {
          ...prev.stats,
          totalMaintenanceCostUsd: prev.stats.totalMaintenanceCostUsd + totalCost,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'REPAIR',
            -totalCost,
            `Refreshed thermal paste on ${targets.length} rig(s)`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: prev.rigs.map((r) =>
          targetIds.has(r.id) ? { ...r, pasteStepsRemaining: 16 } : r
        ),
      };
    });
    return { ok: true, count: targets.length, cost: totalCost };
  };

  const handleSalvageRig = (rigId: string): number => {
    if (!state) return 0;
    const target = state.rigs.find((r) => r.id === rigId);
    if (!target) return 0;
    const refund = calculateRigResaleValue(target, state);
    setState((prev) => {
      if (!prev) return prev;
      const t = prev.rigs.find((r) => r.id === rigId);
      if (!t) return prev;
      const val = calculateRigResaleValue(t, prev);
      soundFx.playCash();
      showBanner(`Sold ${t.name} for ${formatUsd(val)}.`);
      return {
        ...prev,
        cash: prev.cash + val,
        stats: {
          ...prev.stats,
          totalHardwareSalesUsd: prev.stats.totalHardwareSalesUsd + val,
        },
        transactions: [
          makeTx(prev.stepCount, 'SALE', val, `Sold/salvaged ${t.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: prev.rigs.filter((r) => r.id !== rigId),
      };
    });
    return refund;
  };

  const handleRetireRig = (rigIndex: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const target = state.rigs[rigIndex];
    if (!target) return { ok: false, summary: `Rig #${rigIndex + 1} not found.` };
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      const t = prev.rigs[rigIndex];
      if (!t) return prev;
      return {
        ...prev,
        rigs: prev.rigs.filter((_r, idx) => idx !== rigIndex),
        backupRigs: [
          ...(prev.backupRigs ?? []),
          { ...t, enabled: false, lastStepCoins: 0, lastStepUsd: 0 },
        ],
      };
    });
    return {
      ok: true,
      summary: `Moved ${target.name} to Backup Hardware Vault (run "backup" to deploy or sell).`,
    };
  };

  const handleDeployBackupRig = (backupIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const target = (state.backupRigs ?? [])[backupIdx];
    if (!target) return { ok: false, summary: `Backup rig #${backupIdx + 1} not found.` };
    const fitIssue = getRigChassisIssue(target);
    if (fitIssue) return { ok: false, summary: fitIssue };
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.rigs.length >= maxRigs) {
      return { ok: false, summary: `Facility full (${maxRigs} max rigs).` };
    }
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      const item = (prev.backupRigs ?? [])[backupIdx];
      if (!item || prev.rigs.length >= getEffectiveFacilityMaxRigs(prev)) return prev;
      const fac = getFacility(prev.facilityId);
      const slot = findOpenGridSlot(fac, prev.rigs, prev.coolingUnits ?? []);
      return {
        ...prev,
        backupRigs: (prev.backupRigs ?? []).filter((_r, i) => i !== backupIdx),
        rigs: [
          ...prev.rigs,
          {
            ...item,
            enabled: true,
            gridX: slot.gridX,
            gridY: slot.gridY,
            temperatureC: fac.ambientTempC + 18,
            status:
              item.status === 'FAILED'
                ? 'FAILED'
                : item.healthPct <= 20
                ? 'NEEDS_REPAIR'
                : 'MINING',
          },
        ],
      };
    });
    return { ok: true, summary: `Re-deployed ${target.name} from Backup Vault into active bay.` };
  };

  const handleSellBackupRig = (backupIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const target = (state.backupRigs ?? [])[backupIdx];
    if (!target) return { ok: false, summary: `Backup rig #${backupIdx + 1} not found.` };
    const val = calculateRigResaleValue(target, state);
    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const item = (prev.backupRigs ?? [])[backupIdx];
      if (!item) return prev;
      const saleVal = calculateRigResaleValue(item, prev);
      return {
        ...prev,
        cash: prev.cash + saleVal,
        backupRigs: (prev.backupRigs ?? []).filter((_r, i) => i !== backupIdx),
        stats: {
          ...prev.stats,
          totalHardwareSalesUsd: prev.stats.totalHardwareSalesUsd + saleVal,
        },
        transactions: [
          makeTx(prev.stepCount, 'SALE', saleVal, `Sold backup rig ${item.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
      };
    });
    return { ok: true, summary: `Sold backup rig ${target.name} for ${formatUsd(val)}.` };
  };

  const handleRenameRig = (rigId: string, name: string) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r) => (r.id === rigId ? { ...r, name } : r)),
          }
        : prev
    );
  };

  const handleDeployRig = (config: RigBuildConfig): boolean => {
    if (!state || getRigChassisIssue(config)) return false;
    const newCost = calculateRigBuildCost(config, state);
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.cash < newCost || state.rigs.length >= maxRigs) {
      return false;
    }

    const usedCustomList = [
      config.customParts?.chassis,
      config.customParts?.compute,
      ...(config.customParts?.gpus ?? []).filter(Boolean),
      config.customParts?.storage,
      config.customParts?.psu,
      config.customParts?.cooling,
      config.customParts?.os,
    ].filter((s): s is CustomComponentSpec => Boolean(s));

    if (usedCustomList.length > 0) {
      const fabInv = buildDefaultFab(state.fab).inventory.map((i) => ({ ...i }));
      for (const spec of usedCustomList) {
        const match = fabInv.find(
          (item) =>
            item.blueprintId === spec.blueprintId &&
            (item.partCategory ?? 'compute') === spec.partCategory &&
            item.qty > 0
        );
        if (!match) return false;
        match.qty -= 1;
      }
    }

    setState((prev) => {
      if (!prev) return prev;
      const cost = calculateRigBuildCost(config, prev);
      const fac = getFacility(prev.facilityId);
      if (prev.cash < cost || prev.rigs.length >= getEffectiveFacilityMaxRigs(prev) || getRigChassisIssue(config)) return prev;

      const prevFab = buildDefaultFab(prev.fab);
      const nextFabInv = prevFab.inventory.map((i) => ({
        ...i,
        serialNumbers: i.serialNumbers ? [...i.serialNumbers] : undefined,
      }));

      const consumeSpecSerial = (spec?: CustomComponentSpec | null): string | undefined => {
        if (!spec) return undefined;
        const match = nextFabInv.find(
          (item) =>
            item.blueprintId === spec.blueprintId &&
            (item.partCategory ?? 'compute') === spec.partCategory &&
            item.qty > 0
        );
        if (!match) return undefined;
        match.qty -= 1;
        return match.serialNumbers?.shift();
      };

      const assignedSerials: RigCustomPartSerialsMap = {};
      const allocatedList: { spec: CustomComponentSpec; serial?: string }[] = [];

      if (config.customParts?.chassis) {
        const ser = consumeSpecSerial(config.customParts.chassis);
        if (ser) assignedSerials.chassis = ser;
        allocatedList.push({ spec: config.customParts.chassis, serial: ser });
      }
      let computeSerial: string | undefined;
      if (config.customParts?.compute) {
        computeSerial = consumeSpecSerial(config.customParts.compute);
        if (computeSerial) assignedSerials.compute = computeSerial;
        allocatedList.push({ spec: config.customParts.compute, serial: computeSerial });
      }
      if (config.customParts?.gpus && config.customParts.gpus.some(Boolean)) {
        assignedSerials.gpus = config.customParts.gpus.map((gSpec) => {
          if (!gSpec) return null;
          const ser = consumeSpecSerial(gSpec);
          allocatedList.push({ spec: gSpec, serial: ser });
          return ser ?? null;
        });
      }
      if (config.customParts?.storage) {
        const ser = consumeSpecSerial(config.customParts.storage);
        if (ser) assignedSerials.storage = ser;
        allocatedList.push({ spec: config.customParts.storage, serial: ser });
      }
      if (config.customParts?.psu) {
        const ser = consumeSpecSerial(config.customParts.psu);
        if (ser) assignedSerials.psu = ser;
        allocatedList.push({ spec: config.customParts.psu, serial: ser });
      }
      if (config.customParts?.cooling) {
        const ser = consumeSpecSerial(config.customParts.cooling);
        if (ser) assignedSerials.cooling = ser;
        allocatedList.push({ spec: config.customParts.cooling, serial: ser });
      }
      if (config.customParts?.os) {
        const ser = consumeSpecSerial(config.customParts.os);
        if (ser) assignedSerials.os = ser;
        allocatedList.push({ spec: config.customParts.os, serial: ser });
      }

      const cleanedFabInv = nextFabInv.filter((i) => i.qty > 0);

      const slot = findOpenGridSlot(fac, prev.rigs, prev.coolingUnits ?? []);
      const rooms = getFacilityRooms(prev);
      const assignedRoomId =
        config.roomId && rooms.some((r) => r.id === config.roomId)
          ? config.roomId
          : findOpenRoomId(rooms, prev.rigs);

      const newRigId = `rig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const stepLabel = formatStepLabel(prev.stepCount);

      const allocatedSerialSet = new Set(
        allocatedList.map((a) => a.serial).filter((s): s is string => Boolean(s))
      );
      const nextSerialRegistry =
        allocatedSerialSet.size > 0
          ? (prevFab.serialRegistry ?? []).map((sr) =>
              allocatedSerialSet.has(sr.serialNumber)
                ? {
                    ...sr,
                    status: 'INSTALLED' as const,
                    installedRigId: newRigId,
                    history: [...sr.history, `${stepLabel}: Factory-installed in ${config.name}`],
                  }
                : sr
            )
          : prevFab.serialRegistry;

      const deployHistEntries = allocatedList.map((a, idx) => ({
        id: `fabhist_${prev.stepCount}_DEPLOY_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        step: prev.stepCount,
        stepLabel,
        kind: 'DEPLOY' as const,
        summary: `Installed "${a.spec.name}"${a.serial ? ` [${a.serial}]` : ''} in new rig ${config.name}`,
      }));

      const nextHistory =
        deployHistEntries.length > 0
          ? [...deployHistEntries, ...(prevFab.manufacturingHistory ?? [])].slice(0, 120)
          : prevFab.manufacturingHistory;

      const customComp = config.customParts?.compute;
      const customAsicSpec = customComp
        ? {
            blueprintId: customComp.blueprintId,
            name: customComp.name,
            algo: customComp.algo ?? 'SHA256',
            processNode: customComp.processNode,
            hashRate: customComp.hashrates?.[customComp.algo ?? 'SHA256'] ?? 0,
            watts: customComp.watts ?? 2800,
            heatC: customComp.heatC ?? 60,
            serialNumber: computeSerial,
            branch: customComp.branch,
          }
        : undefined;

      const totalBuiltValue = Math.max(cost, Math.round(calculateBaseRigPartsCost(config)));

      const newRig: MiningRig = {
        ...config,
        id: newRigId,
        poolMode: config.poolMode ?? 'PPS',
        payoutMode: config.payoutMode ?? 'AUTOSELL',
        firmwareProfile: config.firmwareProfile ?? 'BALANCED',
        pasteStepsRemaining: 16,
        soloBlocksWon: 0,
        lastStepBlockHit: false,
        illicitMod: null,
        customAsicSpec,
        customPartSerials:
          Object.keys(assignedSerials).length > 0 ? assignedSerials : undefined,
        enabled: true,
        gridX: slot.gridX,
        gridY: slot.gridY,
        roomId: assignedRoomId,
        temperatureC: fac.ambientTempC + 25,
        healthPct: 100,
        componentHealth: createInitialComponentHealth(config.gpuIds.length, 100),
        conditionTier: 'NEW',
        ageSteps: 0,
        failureCount: 0,
        isUsedPurchase: false,
        purchasePriceUsd: totalBuiltValue,
        status: 'MINING',
        lastStepCoins: 0,
        lastStepUsd: 0,
        totalMinedCoins: 0,
        totalEarnedUsd: 0,
        createdStep: prev.stepCount,
      };

      soundFx.playCash();
      showBanner(`Deployed "${config.name}" into ${fac.name}.`);
      return {
        ...prev,
        cash: prev.cash - cost,
        fab:
          usedCustomList.length > 0
            ? {
                ...prevFab,
                inventory: cleanedFabInv,
                serialRegistry: nextSerialRegistry,
                manufacturingHistory: nextHistory,
              }
            : prev.fab,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
        },
        stats: {
          ...prev.stats,
          rigPurchasesCount: prev.stats.rigPurchasesCount + 1,
          totalHardwareSpendUsd: prev.stats.totalHardwareSpendUsd + cost,
          usedOnlyEligible: false,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'HARDWARE',
            -cost,
            usedCustomList.length > 0
              ? `Built & deployed ${config.name} (${usedCustomList.length} fab part(s))`
              : `Built & deployed ${config.name}`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: [...prev.rigs, newRig],
      };
    });
    return true;
  };

  const handleCloneRig = (rigIdx: number, qty: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const src = state.rigs[rigIdx];
    if (!src) return { ok: false, summary: `Rig #${rigIdx + 1} not found.` };
    const fitIssue = getRigChassisIssue({ ...src, customParts: undefined, customAsicSpec: undefined });
    if (fitIssue) return { ok: false, summary: `The catalog parts left in this clone would not fit. ${fitIssue}` };
    const count = Math.max(1, Math.min(12, qty));
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.rigs.length + count > maxRigs) {
      return {
        ok: false,
        summary: `Not enough bay slots (${state.rigs.length + count}/${maxRigs} max rigs).`,
      };
    }
    const baseUnitCost = calculateRigBuildCost({ ...src, customParts: undefined }, state);
    const hasBulkRd = state.unlockedResearch.includes('res_bulk_procurement');
    const discPct = hasBulkRd && count >= 2 ? 0.1 : count >= 3 ? 0.05 : 0;
    const unitCost = Math.round(baseUnitCost * (1 - discPct));
    const totalCost = unitCost * count;
    if (state.cash < totalCost) {
      return {
        ok: false,
        summary: `Cloning ${count}x ${src.name} costs ${formatUsd(totalCost)} (${formatUsd(unitCost)}/ea).`,
      };
    }
    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const f = getFacility(prev.facilityId);
      const curRigs = [...prev.rigs];
      for (let i = 0; i < count; i++) {
        const slot = findOpenGridSlot(f, curRigs, prev.coolingUnits ?? []);
        const roomId = findOpenRoomId(getFacilityRooms(prev), curRigs) ?? 'room_1';
        curRigs.push({
          chassisId: src.chassisId,
          computeId: src.computeId,
          gpuIds: [...src.gpuIds],
          storageId: src.storageId,
          psuId: src.psuId,
          coolingId: src.coolingId,
          osId: src.osId,
          targetCoin: src.targetCoin,
          overclockPct: src.overclockPct,
          name: `${src.name.split('#')[0].trim()} #${curRigs.length + 1}`,
          id: `rig_clone_${Date.now()}_${i}`,
          poolMode: src.poolMode,
          payoutMode: src.payoutMode ?? 'AUTOSELL',
          firmwareProfile: src.firmwareProfile,
          pasteStepsRemaining: 12,
          soloBlocksWon: 0,
          lastStepBlockHit: false,
          illicitMod: null,
          enabled: true,
          gridX: slot.gridX,
          gridY: slot.gridY,
          roomId,
          temperatureC: f.ambientTempC + 20,
          healthPct: 100,
          componentHealth: createInitialComponentHealth(src.gpuIds.length, 100),
          conditionTier: 'NEW',
          ageSteps: 0,
          failureCount: 0,
          purchasePriceUsd: unitCost,
          status: 'MINING',
          lastStepCoins: 0,
          lastStepUsd: 0,
          totalMinedCoins: 0,
          totalEarnedUsd: 0,
          createdStep: prev.stepCount,
        });
      }
      return {
        ...prev,
        cash: prev.cash - totalCost,
        rigs: curRigs,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + totalCost,
        },
        stats: {
          ...prev.stats,
          rigPurchasesCount: prev.stats.rigPurchasesCount + count,
          totalHardwareSpendUsd: prev.stats.totalHardwareSpendUsd + totalCost,
          usedOnlyEligible: false,
        },
        transactions: [
          makeTx(prev.stepCount, 'HARDWARE', -totalCost, `Bulk cloned ${count}x ${src.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
      };
    });
    return {
      ok: true,
      summary: `Deployed ${count}x cloned ${src.name} rigs for ${formatUsd(totalCost)}${
        discPct > 0 ? ` (-${Math.round(discPct * 100)}% bulk discount)` : ''
      }.`,
    };
  };

  const handleBuyUsedListing = (
    listingId: string,
    customName?: string
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const listing = (state.usedMarketListings ?? []).find((l) => l.id === listingId);
    if (!listing) return { ok: false, summary: 'Used listing unavailable.' };
    if (state.cash < listing.listPriceUsd) {
      return {
        ok: false,
        summary: `Insufficient cash (need ${formatUsd(listing.listPriceUsd)}).`,
      };
    }
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.rigs.length >= maxRigs) {
      return { ok: false, summary: `Facility full (${maxRigs} max rigs).` };
    }

    const coinUnlocked = state.coins[listing.config.targetCoin]?.unlocked;
    const assignedCoin: CoinSymbol = coinUnlocked ? listing.config.targetCoin : 'BTC';
    const rigName = customName?.trim() || `${listing.title.slice(0, 20)} #${state.rigs.length + 1}`;

    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const item = (prev.usedMarketListings ?? []).find((l) => l.id === listingId);
      if (
        !item ||
        prev.cash < item.listPriceUsd ||
        prev.rigs.length >= getEffectiveFacilityMaxRigs(prev)
      ) {
        return prev;
      }
      const fac = getFacility(prev.facilityId);
      const slot = findOpenGridSlot(fac, prev.rigs, prev.coolingUnits ?? []);
      const rooms = getFacilityRooms(prev);
      const assignedRoomId = findOpenRoomId(rooms, prev.rigs);
      const compHealth = item.componentHealth
        ? ensureRigComponentHealth({
            gpuIds: item.config.gpuIds,
            healthPct: item.conditionPct,
            componentHealth: item.componentHealth,
          })
        : createInitialComponentHealth(item.config.gpuIds.length, item.conditionPct);
      const avgHp = computeAverageRigHealth(compHealth);
      const newRig: MiningRig = {
        ...item.config,
        name: rigName,
        targetCoin: prev.coins[item.config.targetCoin]?.unlocked ? item.config.targetCoin : 'BTC',
        id: `rig_used_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        poolMode: 'PPS',
        firmwareProfile: 'BALANCED',
        pasteStepsRemaining: item.conditionTier === 'DAMAGED' ? 4 : 10,
        soloBlocksWon: 0,
        lastStepBlockHit: false,
        illicitMod: null,
        enabled: true,
        gridX: slot.gridX,
        gridY: slot.gridY,
        roomId: assignedRoomId,
        temperatureC: fac.ambientTempC + 20,
        healthPct: avgHp,
        componentHealth: compHealth,
        conditionTier: item.conditionTier,
        ageSteps: item.ageSteps,
        failureCount: 0,
        isUsedPurchase: true,
        purchasePriceUsd: item.listPriceUsd,
        status: avgHp <= 20 ? 'NEEDS_REPAIR' : 'MINING',
        lastStepCoins: 0,
        lastStepUsd: 0,
        totalMinedCoins: 0,
        totalEarnedUsd: 0,
        createdStep: prev.stepCount,
      };
      showBanner(`Purchased ${item.title} (${formatUsd(item.listPriceUsd)}).`);
      return {
        ...prev,
        cash: prev.cash - item.listPriceUsd,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + item.listPriceUsd,
        },
        stats: {
          ...prev.stats,
          rigPurchasesCount: prev.stats.rigPurchasesCount + 1,
          usedRigPurchasesCount: prev.stats.usedRigPurchasesCount + 1,
          totalHardwareSpendUsd: prev.stats.totalHardwareSpendUsd + item.listPriceUsd,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'HARDWARE',
            -item.listPriceUsd,
            `Used market purchase: ${item.title} (${assignedCoin})`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        usedMarketListings: (prev.usedMarketListings ?? []).filter((l) => l.id !== listingId),
        rigs: [...prev.rigs, newRig],
      };
    });
    return {
      ok: true,
      summary: `Acquired ${listing.title} for ${formatUsd(listing.listPriceUsd)} (${listing.conditionPct}% condition, mining ${assignedCoin}).`,
    };
  };

  const handleRefreshUsedMarket = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const fee =
      state.devUnlockAll || state.unlockedResearch.includes('res_secondary_broker') ? 0 : 75;
    if (state.cash < fee) {
      return { ok: false, summary: `Broker refresh fee requires ${formatUsd(fee)}.` };
    }
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cash: prev.cash - fee,
        usedMarketListings: generateUsedMarketListings(prev),
        usedMarketRefreshStep: prev.stepCount + 10,
        transactions:
          fee > 0
            ? [
                makeTx(prev.stepCount, 'HARDWARE', -fee, 'Used equipment broker search fee'),
                ...(prev.transactions ?? []),
              ].slice(0, 200)
            : prev.transactions,
      };
    });
    return {
      ok: true,
      summary:
        fee > 0
          ? `Refreshed used marketplace inventory (-${formatUsd(fee)} broker fee).`
          : 'Refreshed used marketplace inventory.',
    };
  };

  const handleAddCoolingUnit = (type: RoomCoolingType, roomNumber?: number): boolean => {
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === type);
    if (!spec || !state) return false;
    const facIndex = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    const unlockedFac = state.devUnlockAll || facIndex >= spec.unlockFacilityIndex;
    const unlockedRes =
      state.devUnlockAll ||
      !spec.researchRequired ||
      state.unlockedResearch.includes(spec.researchRequired);
    const unitCost = state.unlockedResearch.includes('res_bulk_procurement')
      ? Math.round(spec.cost * 0.92)
      : spec.cost;
    if (!unlockedFac || !unlockedRes || state.cash < unitCost) return false;

    setState((prev) => {
      if (!prev) return prev;
      const costNow = prev.unlockedResearch.includes('res_bulk_procurement')
        ? Math.round(spec.cost * 0.92)
        : spec.cost;
      if (prev.cash < costNow) return prev;
      const rooms = getFacilityRooms(prev);
      const pickedRoom =
        roomNumber && rooms[roomNumber - 1]
          ? rooms[roomNumber - 1]
          : rooms[(prev.coolingUnits ?? []).length % Math.max(1, rooms.length)];
      const newUnit: PlacedCoolingUnit = {
        id: `cool_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type,
        gridX: 0,
        gridY: 0,
        roomId: pickedRoom?.id ?? 'room_1',
        enabled: true,
      };
      soundFx.playCash();
      showBanner(
        `Installed ${spec.name} in ${pickedRoom?.name ?? 'Facility'} (+${spec.coolingPowerC}°C).`
      );
      return {
        ...prev,
        cash: prev.cash - costNow,
        coolingUnits: [...(prev.coolingUnits ?? []), newUnit],
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + costNow,
        },
        stats: {
          ...prev.stats,
          totalCoolingSpendUsd: prev.stats.totalCoolingSpendUsd + costNow,
        },
        transactions: [
          makeTx(prev.stepCount, 'FACILITY', -costNow, `Installed ${spec.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
      };
    });
    return true;
  };

  const handleToggleCoolingUnit = (coolingId: string) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            coolingUnits: (prev.coolingUnits ?? []).map((u) =>
              u.id === coolingId ? { ...u, enabled: !u.enabled } : u
            ),
          }
        : prev
    );
  };

  const handleRemoveCoolingUnit = (coolingId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const unit = (prev.coolingUnits ?? []).find((u) => u.id === coolingId);
      if (!unit) return prev;
      const spec = ROOM_COOLING_UNITS.find((u) => u.id === unit.type);
      const refund = Math.round((spec?.cost ?? 50) * 0.6);
      soundFx.playCash();
      showBanner(`Sold ${spec?.name ?? 'cooling unit'} for ${formatUsd(refund)}.`);
      return {
        ...prev,
        cash: prev.cash + refund,
        transactions: [
          makeTx(prev.stepCount, 'SALE', refund, `Sold ${spec?.name ?? 'cooling unit'}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        coolingUnits: (prev.coolingUnits ?? []).filter((u) => u.id !== coolingId),
      };
    });
  };

  const handleSelectFacility = (facilityId: string, action: 'RENT' | 'BUY'): boolean => {
    if (!state) return false;
    const target = FACILITY_TIERS.find((f) => f.id === facilityId);
    if (!target || state.rigs.length > target.maxRigs) return false;
    const alreadyOwned = state.ownedFacilityIds.includes(facilityId);
    const needed =
      action === 'BUY' && !alreadyOwned
        ? target.buyoutPrice
        : action === 'RENT' && !alreadyOwned
        ? target.cycleRent
        : 0;
    if (state.cash < needed) return false;

    setState((prev) => {
      if (!prev) return prev;
      const fac = FACILITY_TIERS.find((f) => f.id === facilityId);
      if (!fac || prev.rigs.length > fac.maxRigs) return prev;

      const isOwned = prev.ownedFacilityIds.includes(facilityId);
      let cost = 0;
      const nextOwned = [...prev.ownedFacilityIds];

      if (action === 'BUY' && !isOwned) {
        cost = fac.buyoutPrice;
        if (prev.cash < cost) return prev;
        nextOwned.push(facilityId);
      } else if (action === 'RENT' && !isOwned) {
        cost = fac.cycleRent;
        if (prev.cash < cost) return prev;
      }

      const newRooms = getFacilityRooms({
        facilityId,
        facilityUpgrades: prev.facilityUpgrades,
        facilityExtraRooms: 0,
      });
      const reallocatedRigs = prev.rigs.map((r, rIdx) => {
        const rm = newRooms[rIdx % Math.max(1, newRooms.length)];
        return { ...r, roomId: rm?.id ?? 'room_1' };
      });
      const reallocatedCoolers = (prev.coolingUnits ?? []).map((u, uIdx) => {
        const rm = newRooms[uIdx % Math.max(1, newRooms.length)];
        return { ...u, roomId: rm?.id ?? 'room_1' };
      });

      soundFx.playMilestone();
      showBanner(
        action === 'BUY'
          ? `Purchased ${fac.name} outright!`
          : `Moved mining operations to ${fac.name}.`
      );

      return {
        ...prev,
        cash: prev.cash - cost,
        facilityId,
        facilityExtraRooms: 0,
        ownedFacilityIds: nextOwned,
        rigs: reallocatedRigs,
        coolingUnits: reallocatedCoolers,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
        },
        stats: {
          ...prev.stats,
          totalFacilitySpendUsd: prev.stats.totalFacilitySpendUsd + cost,
        },
        transactions:
          cost > 0
            ? [
                makeTx(
                  prev.stepCount,
                  'FACILITY',
                  -cost,
                  `${action === 'BUY' ? 'Purchased' : 'Leased'} ${fac.name}`
                ),
                ...(prev.transactions ?? []),
              ].slice(0, 200)
            : prev.transactions,
        news: [
          {
            id: `news_fac_${Date.now()}`,
            step: prev.stepCount,
            stepLabel: formatStepLabel(prev.stepCount),
            title: `Facility Expansion: ${fac.name}`,
            detail:
              action === 'BUY'
                ? `Acquired full ownership of ${fac.name} (${fac.maxRigs} rig slots, ${fac.maxPowerKw} kW).`
                : `Relocated operations to ${fac.name} (${fac.maxRigs} rig slots, ${fac.maxPowerKw} kW).`,
            category: 'FACILITY' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    return true;
  };

  const handleMoveRigToRoom = (
    rigIdxOrAll: number | 'ALL',
    roomNumber: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const rooms = getFacilityRooms(state);
    const targetRoom = rooms[roomNumber - 1];
    if (!targetRoom) {
      return { ok: false, summary: `Room #${roomNumber} not found (1..${rooms.length}).` };
    }
    if (rigIdxOrAll === 'ALL') {
      const totalFit = rooms.reduce((s, rm) => s + rm.slotCapacity, 0);
      if (state.rigs.length > targetRoom.slotCapacity) {
        return {
          ok: false,
          summary: `${targetRoom.name} holds max ${targetRoom.slotCapacity} rigs (you have ${state.rigs.length} total across ${totalFit} facility slots).`,
        };
      }
      soundFx.playClick();
      setState((prev) =>
        prev ? { ...prev, rigs: prev.rigs.map((r) => ({ ...r, roomId: targetRoom.id })) } : prev
      );
      return { ok: true, summary: `Relocated all ${state.rigs.length} rig(s) into ${targetRoom.name}.` };
    }
    const targetRig = state.rigs[rigIdxOrAll];
    if (!targetRig) return { ok: false, summary: `Rig #${rigIdxOrAll + 1} not found.` };
    const occupants = state.rigs.filter(
      (r, i) => i !== rigIdxOrAll && (r.roomId ?? rooms[0]?.id) === targetRoom.id
    ).length;
    if (occupants >= targetRoom.slotCapacity) {
      return {
        ok: false,
        summary: `${targetRoom.name} is full (${occupants}/${targetRoom.slotCapacity} bays occupied).`,
      };
    }
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            rigs: prev.rigs.map((r, i) =>
              i === rigIdxOrAll ? { ...r, roomId: targetRoom.id } : r
            ),
          }
        : prev
    );
    return {
      ok: true,
      summary: `Moved ${targetRig.name} to Room #${targetRoom.index} (${targetRoom.name}).`,
    };
  };

  const handleMoveCoolerToRoom = (
    unitIdx: number,
    roomNumber: number
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const rooms = getFacilityRooms(state);
    const targetRoom = rooms[roomNumber - 1];
    if (!targetRoom) {
      return { ok: false, summary: `Room #${roomNumber} not found (1..${rooms.length}).` };
    }
    const unit = (state.coolingUnits ?? [])[unitIdx];
    if (!unit) return { ok: false, summary: `Cooling unit #${unitIdx + 1} not found.` };
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            coolingUnits: (prev.coolingUnits ?? []).map((u, i) =>
              i === unitIdx ? { ...u, roomId: targetRoom.id } : u
            ),
          }
        : prev
    );
    const spec = ROOM_COOLING_UNITS.find((s) => s.id === unit.type);
    return {
      ok: true,
      summary: `Placed cooling unit #${unitIdx + 1} (${spec?.name ?? unit.type}) inside ${targetRoom.name}.`,
    };
  };

  const handleExpandFacilityRooms = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const fac = getFacility(state.facilityId);
    const profile = FACILITY_PROFILES[fac.id] ?? FACILITY_PROFILES.fac_bedroom;
    const currentExtra = state.facilityExtraRooms ?? 0;
    if (currentExtra >= profile.maxExpansions) {
      return {
        ok: false,
        summary: `${fac.name} already has maximum expansion wings (${currentExtra}/${profile.maxExpansions}).`,
      };
    }
    const cost = getFacilityRoomExpansionCost(fac.id, currentExtra);
    if (state.cash < cost) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playMilestone();
    showBanner(`Built Expansion Wing #${currentExtra + 1} (+${profile.expansionSlots} cold-aisle slots).`);
    setState((prev) => {
      if (!prev) return prev;
      const cur = prev.facilityExtraRooms ?? 0;
      const c = getFacilityRoomExpansionCost(prev.facilityId, cur);
      if (cur >= profile.maxExpansions || prev.cash < c) return prev;
      return {
        ...prev,
        cash: prev.cash - c,
        facilityExtraRooms: cur + 1,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + c,
        },
        stats: {
          ...prev.stats,
          totalFacilitySpendUsd: prev.stats.totalFacilitySpendUsd + c,
        },
        transactions: [
          makeTx(prev.stepCount, 'FACILITY', -c, `Built ${fac.name} Expansion Wing #${cur + 1}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        news: [
          {
            id: `news_exp_${Date.now()}`,
            step: prev.stepCount,
            stepLabel: formatStepLabel(prev.stepCount),
            title: `Wing Constructed: ${fac.name}`,
            detail: `Added Expansion Wing #${cur + 1} (+${profile.expansionSlots} cold-aisle slots, -2°C ambient).`,
            category: 'FACILITY' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    return {
      ok: true,
      summary: `Constructed Expansion Wing #${currentExtra + 1} (+${profile.expansionSlots} rig slots, -2°C ambient) for ${formatUsd(cost)}.`,
    };
  };

  const handleBuyFacilityUpgrade = (
    upgradeId: FacilityUpgradeId
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const spec = FACILITY_UPGRADES.find((u) => u.id === upgradeId);
    if (!spec) return { ok: false, summary: 'Facility upgrade not found.' };
    const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    if (!state.devUnlockAll && facIdx < spec.unlockFacilityIndex) {
      return {
        ok: false,
        summary: `Locked: requires ${FACILITY_TIERS[spec.unlockFacilityIndex].name} or larger.`,
      };
    }
    if (
      !state.devUnlockAll &&
      spec.researchRequired &&
      !state.unlockedResearch.includes(spec.researchRequired)
    ) {
      const node = RESEARCH_NODES.find((n) => n.id === spec.researchRequired);
      return {
        ok: false,
        summary: `Locked: requires R&D "${node?.name ?? spec.researchRequired}".`,
      };
    }
    const curLevel = state.facilityUpgrades?.[upgradeId] ?? 0;
    if (curLevel >= spec.maxLevel) {
      return { ok: false, summary: `${spec.name} is already at max Level ${spec.maxLevel}.` };
    }
    const cost = getFacilityUpgradeCost(upgradeId, curLevel);
    if (state.cash < cost) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playMilestone();
    showBanner(`Upgraded ${spec.name} to Lv ${curLevel + 1}.`);
    setState((prev) => {
      if (!prev) return prev;
      const lvl = prev.facilityUpgrades?.[upgradeId] ?? 0;
      const c = getFacilityUpgradeCost(upgradeId, lvl);
      if (lvl >= spec.maxLevel || prev.cash < c) return prev;
      return {
        ...prev,
        cash: prev.cash - c,
        facilityUpgrades: {
          ...(prev.facilityUpgrades ?? {}),
          [upgradeId]: lvl + 1,
        },
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + c,
        },
        stats: {
          ...prev.stats,
          totalFacilitySpendUsd: prev.stats.totalFacilitySpendUsd + c,
        },
        transactions: [
          makeTx(prev.stepCount, 'FACILITY', -c, `Facility upgrade: ${spec.name} Lv ${lvl + 1}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
      };
    });
    return { ok: true, summary: `Upgraded ${spec.name} to Lv ${curLevel + 1} (${formatUsd(cost)}).` };
  };

  const handleSelectPowerContract = (
    contractId: PowerContractId
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const spec = POWER_CONTRACTS.find((c) => c.id === contractId);
    if (!spec) return { ok: false, summary: 'Power contract not found.' };
    const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    if (!state.devUnlockAll && facIdx < spec.unlockFacilityIndex) {
      return {
        ok: false,
        summary: `Locked: requires ${FACILITY_TIERS[spec.unlockFacilityIndex].name} or larger.`,
      };
    }
    if (state.powerContractId === contractId) {
      return { ok: false, summary: `Already signed to ${spec.name}.` };
    }
    soundFx.playClick();
    showBanner(`Switched utility power contract to ${spec.name}.`);
    setState((prev) =>
      prev
        ? {
            ...prev,
            powerContractId: contractId,
            news: [
              {
                id: `news_pwr_${Date.now()}`,
                step: prev.stepCount,
                stepLabel: formatStepLabel(prev.stepCount),
                title: `Power Contract: ${spec.name}`,
                detail: spec.summary,
                category: 'FACILITY' as const,
              },
              ...prev.news,
            ].slice(0, 60),
          }
        : prev
    );
    return { ok: true, summary: `Signed ${spec.name}: ${spec.summary}` };
  };

  const handleHireEmployee = (role: EmployeeRole): boolean => {
    if (!state) return false;
    const spec = EMPLOYEE_SPECS.find((s) => s.role === role);
    const facIdx = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    if (!spec || state.cash < spec.hireCost) return false;
    if (!state.devUnlockAll && facIdx < spec.unlockFacilityIndex) return false;

    setState((prev) => {
      if (!prev) return prev;
      const s = EMPLOYEE_SPECS.find((item) => item.role === role);
      if (!s || prev.cash < s.hireCost) return prev;

      const name =
        EMPLOYEE_NAMES[prev.employees.length % EMPLOYEE_NAMES.length] +
        (prev.employees.length >= EMPLOYEE_NAMES.length
          ? ` #${Math.floor(prev.employees.length / EMPLOYEE_NAMES.length) + 1}`
          : '');

      const defaultPriority: TaskPriority =
        role === 'TECHNICIAN' || role === 'ELECTRICIAN'
          ? 'HARDWARE_CARE'
          : role === 'SYS_ENGINEER' || role === 'MANAGER'
          ? 'HASHRATE_TUNING'
          : role === 'RESEARCHER'
          ? 'RESEARCH_OUTPUT'
          : 'THERMAL_SAFETY';

      soundFx.playCash();
      showBanner(`Hired ${name} (${s.title}).`);

      return {
        ...prev,
        cash: prev.cash - s.hireCost,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + s.hireCost,
        },
        transactions: [
          makeTx(prev.stepCount, 'STAFF', -s.hireCost, `Hired ${name} (${s.title})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        employees: [
          ...prev.employees,
          {
            id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name,
            role,
            shift: 'DAY',
            priority: defaultPriority,
            morale: 90,
            skillLevel: 1,
            experienceXp: 0,
            hiredStep: prev.stepCount,
          },
        ],
      };
    });
    return true;
  };

  const handleTrainEmployee = (empIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const emp = state.employees[empIdx];
    if (!emp) return { ok: false, summary: `Staff #${empIdx + 1} not found.` };
    const curLvl = emp.skillLevel ?? 1;
    if (curLvl >= 5) {
      return { ok: false, summary: `${emp.name} is already at max Skill Level 5.` };
    }
    const cost = 450 * curLvl;
    if (state.cash < cost) {
      return { ok: false, summary: `Training requires ${formatUsd(cost)}.` };
    }
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const target = prev.employees[empIdx];
      if (!target || (target.skillLevel ?? 1) >= 5 || prev.cash < cost) return prev;
      const nextLvl = Math.min(5, (target.skillLevel ?? 1) + 1);
      return {
        ...prev,
        cash: prev.cash - cost,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
        },
        transactions: [
          makeTx(
            prev.stepCount,
            'STAFF',
            -cost,
            `Trained ${target.name} (${target.role}) to Lv ${nextLvl}`
          ),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        employees: prev.employees.map((e, i) =>
          i === empIdx
            ? {
                ...e,
                skillLevel: nextLvl,
                experienceXp: (e.experienceXp ?? 0) + 180,
                morale: Math.min(100, e.morale + 10),
              }
            : e
        ),
      };
    });
    return {
      ok: true,
      summary: `Trained ${emp.name} to Skill Lv ${curLvl + 1} for ${formatUsd(cost)} (+10 morale).`,
    };
  };

  const handleFireEmployee = (employeeId: string) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            employees: prev.employees.filter((e) => e.id !== employeeId),
          }
        : prev
    );
  };

  const handleUpdateEmployee = (
    employeeId: string,
    shift: ShiftType,
    priority: TaskPriority
  ) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            employees: prev.employees.map((e) =>
              e.id === employeeId ? { ...e, shift, priority } : e
            ),
          }
        : prev
    );
  };

  const handleGiveStaffBonus = (
    empIdxOrAll: number | 'ALL'
  ): { ok: boolean; summary: string } => {
    if (!state || state.employees.length === 0) {
      return { ok: false, summary: 'No employees hired.' };
    }
    const targets =
      empIdxOrAll === 'ALL'
        ? state.employees
        : state.employees[empIdxOrAll]
        ? [state.employees[empIdxOrAll]]
        : [];
    if (targets.length === 0) {
      return { ok: false, summary: `Staff #${Number(empIdxOrAll) + 1} not found.` };
    }
    const cost = targets.reduce((s, e) => s + 150 * (e.skillLevel ?? 1), 0);
    if (state.cash < cost) {
      return { ok: false, summary: `Bonus requires ${formatUsd(cost)} cash.` };
    }
    const targetIds = new Set(targets.map((t) => t.id));
    soundFx.playMilestone();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
            },
            transactions: [
              makeTx(prev.stepCount, 'STAFF', -cost, `Spot morale bonus (${targets.length} staff)`),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            employees: prev.employees.map((e) =>
              targetIds.has(e.id)
                ? { ...e, morale: Math.min(100, Number(((e.morale ?? 80) + 18).toFixed(1))) }
                : e
            ),
          }
        : prev
    );
    return {
      ok: true,
      summary: `Paid ${formatUsd(cost)} spot bonus (+18 morale to ${targets.length} staff).`,
    };
  };

  const handleNegotiateStrike = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    if ((state.strikeStepsRemaining ?? 0) <= 0) {
      return { ok: false, summary: 'No labor strike is currently active.' };
    }
    const count = Math.max(1, state.employees.length);
    const mgrSkill = state.employees
      .filter((e) => e.role === 'MANAGER')
      .reduce((m, e) => Math.max(m, e.skillLevel ?? 1), 0);
    const cost = Math.round(Math.max(350, count * 220) * Math.max(0.65, 1 - mgrSkill * 0.07));
    if (state.cash < cost) {
      return { ok: false, summary: `Strike settlement requires ${formatUsd(cost)}.` };
    }
    soundFx.playMilestone();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            strikeStepsRemaining: 0,
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
            },
            transactions: [
              makeTx(prev.stepCount, 'STAFF', -cost, 'Labor strike settlement package'),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            employees: prev.employees.map((e) => ({
              ...e,
              morale: Math.min(100, Number(((e.morale ?? 50) + 28).toFixed(1))),
            })),
          }
        : prev
    );
    return {
      ok: true,
      summary: `Settled labor strike for ${formatUsd(cost)} (+28 morale, crew back to work).`,
    };
  };

  const handleStartResearch = (nodeId: string): boolean => {
    if (!state) return false;
    const gate = canStartResearchNode(state, nodeId);
    if (!gate.ok) {
      if (gate.reason) showBanner(gate.reason);
      return false;
    }

    setState((prev) => {
      if (!prev || !canStartResearchNode(prev, nodeId).ok) return prev;
      const n = RESEARCH_NODES.find((item) => item.id === nodeId);
      if (!n || prev.cash < n.costCash) return prev;

      soundFx.playClick();
      showBanner(`Started R&D project: ${n.name}.`);
      return {
        ...prev,
        cash: prev.cash - n.costCash,
        activeResearchId: nodeId,
        activeResearchProgress: 0,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + n.costCash,
        },
        stats: {
          ...prev.stats,
          totalResearchSpendUsd: prev.stats.totalResearchSpendUsd + n.costCash,
        },
        transactions: [
          makeTx(prev.stepCount, 'RESEARCH', -n.costCash, `Funded R&D: ${n.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
      };
    });
    return true;
  };

  const handleStartChallenge = (challengeId: ChallengeId): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const spec = CHALLENGES.find((c) => c.id === challengeId);
    if (!spec) return { ok: false, summary: 'Challenge not found.' };
    if (state.activeChallengeId === challengeId) {
      return { ok: false, summary: `Challenge "${spec.title}" is already active.` };
    }
    if ((state.completedChallenges ?? []).includes(challengeId)) {
      return { ok: false, summary: `Challenge "${spec.title}" already completed.` };
    }
    soundFx.playMilestone();
    setState((prev) =>
      prev
        ? {
            ...prev,
            activeChallengeId: challengeId,
            failedChallenges: (prev.failedChallenges ?? []).filter((id) => id !== challengeId),
            stats: {
              ...prev.stats,
              usedOnlyEligible:
                challengeId === 'challenge_used_only'
                  ? prev.stats.rigPurchasesCount - prev.stats.usedRigPurchasesCount === 0
                  : prev.stats.usedOnlyEligible,
            },
          }
        : prev
    );
    return { ok: true, summary: `Activated challenge: ${spec.title} — ${spec.description}` };
  };

  const handleLaunchCampaign = (templateId: string, targetCoin: CoinSymbol): boolean => {
    if (!state) return false;
    const tpl = PR_CAMPAIGNS.find((c) => c.id === templateId);
    if (
      !tpl ||
      state.cash < tpl.cost ||
      (state.campaignCooldowns[tpl.id] ?? 0) > state.stepCount ||
      state.mediaCredibility < tpl.minCredibility
    ) {
      return false;
    }

    setState((prev) => {
      if (!prev) return prev;
      const c = PR_CAMPAIGNS.find((item) => item.id === templateId);
      if (!c || prev.cash < c.cost) return prev;

      const prCount = prev.employees.filter((e) => e.role === 'PR_STRATEGIST').length;
      const impactMult = 1 + prCount * 0.25;
      const cdMult = Math.max(0.5, 1 - prCount * 0.15);

      const totalImpact = (c.priceImpactPct / 100) * impactMult;
      const stepImpulse = totalImpact / c.durationSteps;
      const sentimentPerStep = c.sentimentDelta / c.durationSteps;
      const nextScrutiny = Math.min(100, prev.regulatoryScrutiny + c.scrutinyRisk);
      const credibilityDelta = c.direction === 'FUD' ? -4 : 2;

      soundFx.playMilestone();
      showBanner(`Launched ${c.name} targeting ${targetCoin}.`);

      return {
        ...prev,
        cash: prev.cash - c.cost,
        mediaCredibility: Math.max(5, Math.min(100, prev.mediaCredibility + credibilityDelta)),
        regulatoryScrutiny: nextScrutiny,
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + c.cost,
        },
        transactions: [
          makeTx(prev.stepCount, 'EVENT', -c.cost, `PR Campaign: ${c.name} (${targetCoin})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        campaignCooldowns: {
          ...prev.campaignCooldowns,
          [c.id]: prev.stepCount + Math.round(c.cooldownSteps * cdMult),
        },
        activeCampaigns: [
          ...prev.activeCampaigns,
          {
            id: `camp_${Date.now()}`,
            templateId: c.id,
            name: c.name,
            targetCoin,
            direction: c.direction,
            stepsRemaining: c.durationSteps,
            totalSteps: c.durationSteps,
            stepPriceImpulse: stepImpulse,
            sentimentDeltaPerStep: sentimentPerStep,
          },
        ],
        news: [
          {
            id: `news_pr_${Date.now()}`,
            step: prev.stepCount,
            stepLabel: formatStepLabel(prev.stepCount),
            title: `${c.name} Hits ${targetCoin} Markets`,
            detail: `${
              c.direction === 'HYPE' ? 'Bullish coverage' : 'Critical rumors'
            } circulating across crypto media.`,
            category: 'PR' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    return true;
  };

  const handleAcceptContract = (contractId: string): { ok: boolean; reason?: string } => {
    if (!state) return { ok: false, reason: 'No active game.' };
    if (state.activeContract) {
      return { ok: false, reason: 'Finish or abandon your current contract first.' };
    }
    const target = state.availableContracts.find((c) => c.id === contractId);
    if (!target) return { ok: false, reason: 'Contract not found.' };
    if (!state.devUnlockAll && state.mediaCredibility < (target.minReputation ?? 0)) {
      return {
        ok: false,
        reason: `Requires ${target.minReputation} Media Credibility (current: ${Math.round(
          state.mediaCredibility
        )}).`,
      };
    }
    soundFx.playMilestone();
    setState((prev) =>
      prev && !prev.activeContract
        ? {
            ...prev,
            activeContract: target,
            availableContracts: prev.availableContracts.filter((c) => c.id !== contractId),
          }
        : prev
    );
    return { ok: true };
  };

  const handleAbandonContract = (): boolean => {
    if (!state || !state.activeContract) return false;
    soundFx.playAlert();
    setState((prev) =>
      prev && prev.activeContract
        ? {
            ...prev,
            activeContract: null,
            mediaCredibility: Math.max(5, prev.mediaCredibility - 4),
          }
        : prev
    );
    return true;
  };

  const handleInvestigateRival = (rivalIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = investigateRivalSyndicate(state, rivalIdx);
    if (res.ok && res.cost > 0) {
      soundFx.playMilestone();
      setState((prev) => {
        if (!prev) return prev;
        const recon = investigateRivalSyndicate(prev, rivalIdx);
        if (!recon.ok || recon.cost === 0) return prev;
        return {
          ...recon.nextState,
          transactions: [
            makeTx(prev.stepCount, 'EVENT', -recon.cost, `Corporate recon vs ${prev.rivals[rivalIdx].name}`),
            ...(prev.transactions ?? []),
          ].slice(0, 200),
        };
      });
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleToggleSiphon = (enable: boolean): boolean => {
    if (!state) return false;
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            underground: { ...prev.underground, powerSiphonActive: enable },
            stats: enable
              ? { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 }
              : prev.stats,
          }
        : prev
    );
    return true;
  };

  const handleRentBotnet = (
    coin: CoinSymbol
  ): { ok: boolean; reason?: string; cost?: number } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    if (state.underground.botnetStepsRemaining > 0) {
      return { ok: false, reason: 'Botnet lease already active.' };
    }
    const targetCoin = state.coins[coin];
    if (!targetCoin || !targetCoin.unlocked) {
      return { ok: false, reason: `${coin} is locked.` };
    }
    const stepRev = Math.max(30, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const cost = Math.max(180, Math.round(stepRev * 4.5));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    const bonusHash = Math.max(targetCoin.baselineHash * 3.5, 0.25);
    soundFx.playAlert();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 18),
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
            },
            transactions: [
              makeTx(prev.stepCount, 'EVENT', -cost, `Shadow botnet lease (${coin})`),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            underground: {
              ...prev.underground,
              botnetCoin: coin,
              botnetBonusHash: bonusHash,
              botnetStepsRemaining: 8,
            },
            stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
          }
        : prev
    );
    return { ok: true, cost };
  };

  const handleWashTrade = (
    coin: CoinSymbol
  ): { ok: boolean; reason?: string; cost?: number } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    if (state.stepCount < state.underground.washCooldownStep) {
      return {
        ok: false,
        reason: `Cooldown: ${state.underground.washCooldownStep - state.stepCount} steps left.`,
      };
    }
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const cost = Math.max(240, Math.round(stepRev * 5));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const target = prev.coins[coin];
      const nextPrice = target.priceUsd * 1.26;
      const stepLabel = formatStepLabel(prev.stepCount);
      return {
        ...prev,
        cash: prev.cash - cost,
        regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 20),
        mediaCredibility: Math.max(5, prev.mediaCredibility - 5),
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
        },
        transactions: [
          makeTx(prev.stepCount, 'EVENT', -cost, `Dark-pool wash spike (${coin})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        underground: {
          ...prev.underground,
          washCooldownStep: prev.stepCount + 12,
        },
        coins: {
          ...prev.coins,
          [coin]: {
            ...target,
            prevPriceUsd: target.priceUsd,
            priceUsd: nextPrice,
            sentiment: Math.min(100, target.sentiment + 26),
            priceHistory: [
              ...target.priceHistory,
              { step: prev.stepCount, stepLabel, price: nextPrice },
            ].slice(-365),
          },
        },
        stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
      };
    });
    return { ok: true, cost };
  };

  const handlePumpDump = (
    coin: CoinSymbol
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    if (state.stepCount < state.underground.washCooldownStep) {
      return {
        ok: false,
        reason: `Market desk cooling down: ${state.underground.washCooldownStep - state.stepCount} steps left.`,
      };
    }
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const cost = Math.max(620, Math.round(stepRev * 9));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    const traced = Math.random() < 0.3;
    const fine = traced ? Math.round(state.cash * 0.12) : 0;
    soundFx.playAlert();
    setState((prev) => {
      if (!prev) return prev;
      const target = prev.coins[coin];
      const nextPrice = target.priceUsd * 1.42;
      const stepLabel = formatStepLabel(prev.stepCount);
      return {
        ...prev,
        cash: prev.cash - cost - fine,
        regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 26 + (traced ? 8 : 0)),
        mediaCredibility: Math.max(5, prev.mediaCredibility - 8),
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost + fine,
        },
        transactions: [
          ...(fine > 0
            ? [
                makeTx(
                  prev.stepCount,
                  'EVENT',
                  -fine,
                  `Regulator fine: traced pump & dump (${coin})`
                ),
              ]
            : []),
          makeTx(prev.stepCount, 'EVENT', -cost, `Shell-account pump & dump (${coin})`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        underground: { ...prev.underground, washCooldownStep: prev.stepCount + 18 },
        coins: {
          ...prev.coins,
          [coin]: {
            ...target,
            prevPriceUsd: target.priceUsd,
            priceUsd: nextPrice,
            sentiment: Math.min(100, target.sentiment + 34),
            priceHistory: [
              ...target.priceHistory,
              { step: prev.stepCount, stepLabel, price: nextPrice },
            ].slice(-365),
          },
        },
        stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
      };
    });
    return {
      ok: true,
      cost,
      summary: traced
        ? `Pump & dump on ${coin} (${formatUsd(cost)}) traced by regulators: ${formatUsd(
            fine
          )} fine, +34 Heat, -8 Rep.`
        : `Pump & dump on ${coin} (${formatUsd(cost)}, +26 Heat, -8 Rep). No trace this time.`,
    };
  };

  const handleExtortRival = (
    rivalId: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const rival = state.rivals.find((r) => r.id === rivalId);
    if (!rival) return { ok: false, reason: 'Rival not found.' };
    const cooldownStep = state.underground.extortCooldownStep ?? 0;
    if (state.stepCount < cooldownStep) {
      return {
        ok: false,
        reason: `Rackets need to cool off: ${cooldownStep - state.stepCount} steps left.`,
      };
    }
    if (state.regulatoryScrutiny >= 92) {
      return { ok: false, reason: 'Heat too high — every rival is cooperating with regulators.' };
    }
    const demand = Math.min(8000, Math.max(150, Math.round(rival.cashReserveUsd * 0.04)));
    const refused = Math.random() < 0.25;
    soundFx.playAlert();
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cash: prev.cash + (refused ? 0 : demand),
        regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + (refused ? 28 : 20)),
        mediaCredibility: Math.max(5, prev.mediaCredibility - 6),
        transactions: refused
          ? prev.transactions ?? []
          : [
              makeTx(prev.stepCount, 'EVENT', demand, `Protection racket: ${rival.name}`),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
        rivals: prev.rivals.map((rv) =>
          rv.id === rivalId
            ? {
                ...rv,
                hostility: Math.min(100, rv.hostility + (refused ? 26 : 18)),
                lastActionSummary: refused
                  ? 'Refused extortion demand and tipped off regulators'
                  : 'Paid protection money under threat',
              }
            : rv
        ),
        underground: { ...prev.underground, extortCooldownStep: prev.stepCount + 10 },
        stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
      };
    });
    return {
      ok: true,
      summary: refused
        ? `${rival.name} refused the demand and tipped off regulators (+28 Heat, hostility up).`
        : `${rival.name} paid ${formatUsd(demand)} protection money (+20 Heat, -6 Rep).`,
    };
  };

  const handleSabotageRival = (
    rivalId: string
  ): { ok: boolean; reason?: string; cost?: number } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const rival = state.rivals.find((r) => r.id === rivalId);
    if (!rival) return { ok: false, reason: 'Rival not found.' };
    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const cost = Math.max(300, Math.round(stepRev * 5));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playAlert();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + 18),
            currentCycleStats: {
              ...prev.currentCycleStats,
              otherSpendUsd: prev.currentCycleStats.otherSpendUsd + cost,
            },
            transactions: [
              makeTx(prev.stepCount, 'EVENT', -cost, `DDoS sabotage vs ${rival.name}`),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            rivals: prev.rivals.map((rv) =>
              rv.id === rivalId
                ? {
                    ...rv,
                    disruptedSteps: 10,
                    hostility: Math.min(100, rv.hostility + 22),
                    lastActionSummary: 'Disabled by covert DDoS blitz',
                  }
                : rv
            ),
            stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
          }
        : prev
    );
    return { ok: true, cost };
  };

  const handleDevelopShellCoin = (
    ticker: string,
    name: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = developShellCoin(state, ticker, name);
    if (!res.ok) return res;
    soundFx.playClick();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleSeedShellCoinLiquidity = (
    ticker: string,
    addLiquidityUsd = 1500,
    spoofAudit = false
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = seedShellCoinLiquidity(state, ticker, addLiquidityUsd, spoofAudit);
    if (!res.ok) return res;
    soundFx.playCash();
    setState(res.nextState);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleLaunchShellCoin = (
    ticker: string,
    name: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = launchShellCoin(state, ticker, name);
    if (!res.ok) return res;
    soundFx.playAlert();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleShillShellCoin = (
    ticker: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = shillShellCoin(state, ticker);
    if (!res.ok) return res;
    soundFx.playClick();
    setState(res.nextState);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleRugShellCoin = (
    ticker: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = rugShellCoin(state, ticker);
    if (!res.ok) return res;
    soundFx.playMilestone();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, summary: res.summary };
  };

  const handlePrepareVaultRaid = (
    rivalId: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = prepareVaultRaid(state, rivalId);
    if (!res.ok) return res;
    soundFx.playClick();
    setState(res.nextState);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleExecutePreparedRaid = (
    approach?: RaidApproachId
  ): { ok: boolean; reason?: string; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = executePreparedRaid(state, approach, estimateFleetHashIndex(state));
    if (!res.ok) return res;
    soundFx.playAlert();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, summary: res.summary };
  };

  const handleRaidRival = (
    rivalId: string
  ): { ok: boolean; reason?: string; cost?: number; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = resolveRaid(state, rivalId, estimateFleetHashIndex(state));
    if (!res.ok) return res;
    soundFx.playAlert();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, summary: res.summary };
  };

  const handleComplyWithAudit = (): { ok: boolean; reason?: string; summary?: string } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = complyWithAudit(state);
    if (!res.ok) return res;
    soundFx.playMilestone();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, summary: res.summary };
  };

  const handlePayComplianceSettlement = (): {
    ok: boolean;
    reason?: string;
    cost?: number;
    summary?: string;
  } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const res = payComplianceSettlement(state);
    if (!res.ok) return res;
    soundFx.playCash();
    setState(res.nextState);
    showBanner(res.summary);
    return { ok: true, cost: res.cost, summary: res.summary };
  };

  const handleLaunderHeat = (): { ok: boolean; reason?: string; cost?: number } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    if (state.stepCount < state.underground.launderCooldownStep) {
      return {
        ok: false,
        reason: `Cooldown: ${state.underground.launderCooldownStep - state.stepCount} steps left.`,
      };
    }
    const cost = Math.max(250, Math.round(state.cash * 0.08));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playCash();
    setState((prev) => {
      if (!prev) return prev;
      const ugFx = getUndergroundDivisionEffects(prev);
      const heatDrop = Math.round(24 * ugFx.launderBoostMult);
      return {
        ...prev,
        cash: prev.cash - cost,
        regulatoryScrutiny: Math.max(0, prev.regulatoryScrutiny - heatDrop),
        underground: {
          ...prev.underground,
          launderCooldownStep: prev.stepCount + 10,
        },
        transactions: [
          makeTx(prev.stepCount, 'EVENT', -cost, `Mixer scrubbing (-${heatDrop} Heat)`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        stats: {
          ...prev.stats,
          totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + cost,
        },
      };
    });
    return { ok: true, cost };
  };

  const handleBribeInspectors = (): { ok: boolean; reason?: string; cost?: number } => {
    if (!state) return { ok: false, reason: 'No game active.' };
    const cost = Math.max(350, Math.round(state.cash * 0.1));
    if (state.cash < cost) {
      return { ok: false, reason: `Insufficient cash (need ${formatUsd(cost)}).` };
    }
    soundFx.playCash();
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            regulatoryScrutiny: Math.max(0, prev.regulatoryScrutiny - 16),
            underground: {
              ...prev.underground,
              bribeProtectionSteps: 12,
            },
            transactions: [
              makeTx(prev.stepCount, 'EVENT', -cost, 'Inspector hush bribe (12st shield)'),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            stats: {
              ...prev.stats,
              covertOpsCount: prev.stats.covertOpsCount + 1,
              totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + cost,
            },
          }
        : prev
    );
    return { ok: true, cost };
  };

  const handleBuyBlackMarket = (
    listingId: string,
    rigIdx = 0
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No game active.' };
    const item = state.underground.blackMarketListings.find((b) => b.id === listingId);
    if (!item) return { ok: false, summary: 'Black-market listing unavailable.' };
    const bmMult = getCorporateSynergyEffects(state).blackMarketDiscountMult;
    const effectiveCostUsd = Math.round(item.costUsd * bmMult);
    if (state.cash < effectiveCostUsd) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(effectiveCostUsd)}).` };
    }

    if (item.kind === 'SMUGGLED_RIG' && item.presetConfig) {
      const maxRigs = getEffectiveFacilityMaxRigs(state);
      if (state.rigs.length >= maxRigs) {
        return { ok: false, summary: `Facility full (${maxRigs} max rigs).` };
      }
      const isLemon = Math.random() < (item.defectRiskPct ?? 22) / 100;
      const traceHeat = Math.random() < 0.16 ? 4 : 0;
      const baseComp = createInitialComponentHealth(
        item.presetConfig.gpuIds.length,
        isLemon ? 74 : 96
      );
      if (isLemon) {
        baseComp.psu = 38;
        if (baseComp.gpus.length > 0) baseComp.gpus[0] = 44;
        else baseComp.compute = 44;
      }
      const avgHp = computeAverageRigHealth(baseComp);
      soundFx.playAlert();
      setState((prev) => {
        if (!prev) return prev;
        const f = getFacility(prev.facilityId);
        const slot = findOpenGridSlot(f, prev.rigs, prev.coolingUnits ?? []);
        const openRoomId = findOpenRoomId(getFacilityRooms(prev), prev.rigs) ?? 'room_1';
        const newRig: MiningRig = {
          ...item.presetConfig!,
          name: `Smuggled Rig #${prev.rigs.length + 1}`,
          id: `rig_bm_${Date.now()}`,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
          pasteStepsRemaining: isLemon ? 4 : 12,
          soloBlocksWon: 0,
          lastStepBlockHit: false,
          illicitMod: null,
          enabled: true,
          gridX: slot.gridX,
          gridY: slot.gridY,
          roomId: openRoomId,
          temperatureC: f.ambientTempC + 24,
          healthPct: avgHp,
          componentHealth: baseComp,
          conditionTier: isLemon ? 'DAMAGED' : 'USED',
          ageSteps: isLemon ? 45 : 20,
          failureCount: 0,
          purchasePriceUsd: effectiveCostUsd,
          status: 'MINING',
          lastStepCoins: 0,
          lastStepUsd: 0,
          totalMinedCoins: 0,
          totalEarnedUsd: 0,
          createdStep: prev.stepCount,
        };
        return {
          ...prev,
          cash: prev.cash - effectiveCostUsd,
          regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + item.heatGain + traceHeat),
          rigs: [...prev.rigs, newRig],
          underground: {
            ...prev.underground,
            blackMarketListings: prev.underground.blackMarketListings.filter(
              (b) => b.id !== listingId
            ),
          },
          transactions: [
            makeTx(prev.stepCount, 'HARDWARE', -effectiveCostUsd, `Black market: ${item.title}`),
            ...(prev.transactions ?? []),
          ].slice(0, 200),
          stats: {
            ...prev.stats,
            covertOpsCount: prev.stats.covertOpsCount + 1,
            rigPurchasesCount: prev.stats.rigPurchasesCount + 1,
            usedOnlyEligible: false,
          },
        };
      });
      const lemonNote = isLemon
        ? ' WARNING: Contraband arrived with a degraded PSU/compute rail (inspect & repair!).'
        : '';
      const traceNote = traceHeat > 0 ? ' (+4 serialized audit Heat)' : '';
      return {
        ok: true,
        summary: `Acquired ${item.title} for ${formatUsd(effectiveCostUsd)} (+${
          item.heatGain + traceHeat
        } Heat${traceNote}).${lemonNote}`,
      };
    }

    if (item.kind === 'ILLICIT_MOD' && item.modId) {
      const targetRig = state.rigs[rigIdx];
      if (!targetRig) {
        return { ok: false, summary: `Rig #${rigIdx + 1} not found.` };
      }
      soundFx.playAlert();
      setState((prev) =>
        prev
          ? {
              ...prev,
              cash: prev.cash - effectiveCostUsd,
              regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + item.heatGain),
              rigs: prev.rigs.map((r, i) =>
                i === rigIdx ? { ...r, illicitMod: item.modId! } : r
              ),
              underground: {
                ...prev.underground,
                blackMarketListings: prev.underground.blackMarketListings.filter(
                  (b) => b.id !== listingId
                ),
              },
              transactions: [
                makeTx(
                  prev.stepCount,
                  'HARDWARE',
                  -effectiveCostUsd,
                  `Flashed ${item.title} onto ${targetRig.name}`
                ),
                ...(prev.transactions ?? []),
              ].slice(0, 200),
              stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
            }
          : prev
      );
      return {
        ok: true,
        summary: `Flashed ${item.title} onto ${targetRig.name} for ${formatUsd(effectiveCostUsd)} (+${
          item.heatGain
        } Heat).`,
      };
    }

    return { ok: false, summary: 'Invalid black-market item.' };
  };

  // Dev Overrides
  const handleToggleDevMode = (enabled: boolean) => {
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      if (enabled && !prev.isDevSession) return forkDevSession(prev);
      return { ...prev, devMode: enabled, devUnlockAll: enabled ? prev.devUnlockAll : false };
    });
    if (enabled) {
      setDevPanelOpen(true);
      showBanner('Dev Mode is running in a temporary copy. Resume your saved game from the title menu.');
    } else {
      showBanner('Developer Mode disabled.');
    }
  };

  const handleToggleDevUnlockAll = () => {
    soundFx.playClick();
    setState((prev) => (prev ? { ...prev, devUnlockAll: !prev.devUnlockAll } : prev));
  };

  const handleDevLoadScenario = (id: DevScenarioId) => {
    soundFx.playMilestone();
    const scenario = createScenarioState(id);
    setState(scenario);
    setActiveTerminalModal(null);
    setUserPaused(false);
    setAutoCountdown(scenario.stepSeconds ?? DEFAULT_STEP_SECONDS);
    showBanner(
      `Temporary Dev scenario loaded (${scenario.runSeed}).`
    );
  };

  const handleDevAddCash = (amount: number) => {
    soundFx.playCash();
    setState((prev) => (prev ? { ...prev, cash: prev.cash + amount } : prev));
    showBanner(`Dev Grant: +${formatUsd(amount)} cash.`);
  };

  const handleDevClearDebt = () => {
    soundFx.playClick();
    setState((prev) => (prev ? { ...prev, cash: Math.max(0, prev.cash) } : prev));
    showBanner('Dev Override: Cash floored to $0 minimum.');
  };

  const handleDevAddRp = (amount: number) => {
    soundFx.playClick();
    setState((prev) => (prev ? { ...prev, researchPoints: prev.researchPoints + amount } : prev));
    showBanner(`Dev Grant: +${amount} Research Points.`);
  };

  const handleDevUnlockAllResearch = () => {
    soundFx.playMilestone();
    setState((prev) =>
      prev
        ? {
            ...prev,
            unlockedResearch: RESEARCH_NODES.map((n) => n.id),
            activeResearchId: null,
            activeResearchProgress: 0,
          }
        : prev
    );
    showBanner('Dev Override: All R&D nodes completed and unlocked.');
  };

  const handleDevOwnAllFacilities = () => {
    soundFx.playMilestone();
    setState((prev) =>
      prev
        ? {
            ...prev,
            ownedFacilityIds: FACILITY_TIERS.map((f) => f.id),
          }
        : prev
    );
    showBanner(`Dev Override: Deed granted for all ${FACILITY_TIERS.length} facility tiers.`);
  };

  const handleDevResetRigTemps = () => {
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      const fac = getFacility(prev.facilityId);
      return {
        ...prev,
        noiseFinesTotal: 0,
        rigs: prev.rigs.map((r) => ({
          ...r,
          temperatureC: fac.ambientTempC + 10,
          healthPct: 100,
          pasteStepsRemaining: 16,
          status: r.enabled ? 'MINING' : 'PAUSED',
        })),
      };
    });
    showBanner('Dev Override: All rigs cooled, repasted, and repaired to 100%.');
  };

  const handleDevUnlockAllCoins = () => {
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const nextCoins = { ...prev.coins };
      (Object.keys(nextCoins) as CoinSymbol[]).forEach((sym) => {
        nextCoins[sym] = {
          ...nextCoins[sym],
          unlocked: true,
        };
      });
      return { ...prev, coins: nextCoins };
    });
    showBanner('Dev Override: All coin tiers unlocked.');
  };

  const handleDevAdjustCoinPrice = (symbol: CoinSymbol, multiplier: number) => {
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      const c = prev.coins[symbol];
      if (!c) return prev;
      const newPrice = Math.max(0.001, c.priceUsd * multiplier);
      const stepLabel = formatStepLabel(prev.stepCount);
      return {
        ...prev,
        coins: {
          ...prev.coins,
          [symbol]: {
            ...c,
            prevPriceUsd: c.priceUsd,
            priceUsd: newPrice,
            priceHistory: [
              ...c.priceHistory,
              { step: prev.stepCount, stepLabel, price: newPrice },
            ].slice(-365),
          },
        },
      };
    });
  };

  const handleDevMaxPR = () => {
    soundFx.playClick();
    setState((prev) =>
      prev ? { ...prev, mediaCredibility: 100, regulatoryScrutiny: 0 } : prev
    );
    showBanner('Dev Override: Credibility set to 100%, Heat cleared.');
  };

  const handleDevResetPRCooldowns = () => {
    soundFx.playClick();
    setState((prev) => (prev ? { ...prev, campaignCooldowns: {} } : prev));
    showBanner('Dev Override: All PR campaign cooldowns reset.');
  };

  const handleDevTriggerEvent = (forceRaid = false) => {
    if (!state) return;
    soundFx.playAlert();
    setState((prev) => {
      if (!prev) return prev;
      const evt = generateInteractiveEvent(prev, forceRaid ? 'RAID' : undefined);
      return { ...prev, pendingEvent: evt };
    });
    showBanner(
      forceRaid ? 'Dev Trigger: Inspector Raid initiated.' : 'Dev Trigger: Interactive Event started.'
    );
  };

  const handleDevSetRegime = (regime: MarketRegime) => {
    soundFx.playClick();
    setState((prev) =>
      prev ? { ...prev, marketRegime: regime, regimeStepsRemaining: 16 } : prev
    );
    showBanner(`Market regime set to ${MARKET_REGIME_SPECS[regime].label}.`);
  };

  const handleDevTriggerHalving = (symbol: CoinSymbol) => {
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const c = prev.coins[symbol];
      if (!c) return prev;
      const nextCount = c.halvingCount + 1;
      const nextScale = Number((c.blockRewardScale * 0.5).toFixed(4));
      const nextPrice = c.priceUsd * 1.24;
      const stepLabel = formatStepLabel(prev.stepCount);
      return {
        ...prev,
        coins: {
          ...prev.coins,
          [symbol]: {
            ...c,
            halvingCount: nextCount,
            blockRewardScale: nextScale,
            stepsUntilHalving: c.halvingEverySteps,
            prevPriceUsd: c.priceUsd,
            priceUsd: nextPrice,
            sentiment: Math.min(100, c.sentiment + 26),
            priceHistory: [
              ...c.priceHistory,
              { step: prev.stepCount, stepLabel, price: nextPrice },
            ].slice(-365),
          },
        },
        news: [
          {
            id: `news_halve_${Date.now()}`,
            step: prev.stepCount,
            stepLabel,
            title: `${symbol} Block Halving #${nextCount}!`,
            detail: `Block emission halved (x${nextScale}); ${symbol} spot price surged +24%.`,
            category: 'MILESTONE' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    showBanner(`Triggered ${symbol} halving.`);
  };

  const handleDevSetHeat = (heat: number) => {
    soundFx.playClick();
    setState((prev) =>
      prev ? { ...prev, regulatoryScrutiny: Math.max(0, Math.min(100, heat)) } : prev
    );
    showBanner(`Heat set to ${heat}/100.`);
  };

  const handleDevSetInvestigationStage = (
    stage: InvestigationStage,
    scandalMarks?: number
  ) => {
    soundFx.playAlert();
    setState((prev) =>
      prev
        ? {
            ...prev,
            regulatoryScrutiny:
              stage === 'NONE'
                ? Math.min(prev.regulatoryScrutiny, 25)
                : Math.max(prev.regulatoryScrutiny, stage === 'SANCTIONED' ? 88 : 65),
            underground: {
              ...prev.underground,
              investigationStage: stage,
              investigationStepsRemaining: stage === 'NONE' ? 0 : 10,
              scandalMarks:
                typeof scandalMarks === 'number'
                  ? Math.max(0, Math.min(5, Math.round(scandalMarks)))
                  : prev.underground.scandalMarks ?? 0,
            },
          }
        : prev
    );
    showBanner(
      `Dev Investigation Stage -> ${stage}${
        typeof scandalMarks === 'number' ? ` (Marks: ${scandalMarks})` : ''
      }.`
    );
  };

  const handleDevGrantFabBatch = (
    partCategory: PartCategory = 'compute',
    qty = 2
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    let next: GameState = {
      ...state,
      devUnlockAll: true,
      cash: state.cash + 5_000_000,
      fab: { ...buildDefaultFab(state.fab), linesCount: Math.max(1, state.fab?.linesCount ?? 1) },
    };
    const archMap: Record<PartCategory, CustomBlueprintDesignInput['architecture']> = {
      compute: 'ASIC_BLADE',
      gpu: 'HBM_MONSTER',
      chassis: 'CONVERGED_SUPER',
      storage: 'NVME_ARRAY',
      psu: 'INDUSTRIAL_RAIL',
      cooling: 'CRYO_IMMERSION',
      os: 'BARE_METAL_ASM',
    };
    const focusMap: Record<PartCategory, string> = {
      compute: 'QHASH',
      gpu: 'ETHASH',
      chassis: 'HYBRID_8_1',
      storage: 'CHIA_VAULT',
      psu: 'HIGH_WATTS',
      cooling: 'CRYO_LOOP',
      os: 'MAX_HASH',
    };
    const bpName = `Dev-${partCategory.toUpperCase()}-${next.stepCount}-${Math.floor(
      Math.random() * 90 + 10
    )}`;
    const designRes = designCustomComponentBlueprint(next, {
      name: bpName,
      partCategory,
      architecture: archMap[partCategory],
      processNode: 'photonic',
      focus: focusMap[partCategory],
      branch: partCategory === 'compute' ? 'QUANTUM' : 'PHOTONIC',
      profile: 'PERF',
      subFeature: 'ECC_SHIELD',
    });
    if (!designRes.ok) {
      return { ok: false, summary: designRes.summary };
    }
    next = designRes.nextState;
    const bpIdx = (next.fab?.blueprints.length ?? 1) - 1;
    const protoRes = runPrototypeTest(next, bpIdx);
    if (protoRes.ok) next = protoRes.nextState;
    const qRes = queueFabProduction(next, bpIdx, Math.max(1, Math.min(6, qty)));
    if (!qRes.ok) return { ok: false, summary: qRes.summary };
    next = qRes.nextState;
    let guard = 0;
    while ((next.fab?.productionQueue.length ?? 0) > 0 && guard < 24) {
      const stepped = stepFabProduction(next.fab, next.stepCount + guard, formatStepLabel(next.stepCount));
      next = { ...next, fab: stepped.nextFab };
      guard += 1;
    }
    const finalState: GameState = {
      ...next,
      cash: state.cash,
      devUnlockAll: state.devUnlockAll,
    };
    soundFx.playMilestone();
    setState(finalState);
    const msg = `Dev Fab: Built & QA-certified ${qty}x "${bpName}" into inventory w/ serials.`;
    showBanner(msg);
    return { ok: true, summary: msg };
  };

  const handleDevLaunchCustomCoin = (
    symbol = 'DVC',
    name = 'DevCoin Protocol',
    algorithm: MiningAlgorithm = 'SHA256'
  ): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const preCash = state.cash;
    const funded: GameState = {
      ...state,
      cash: Math.max(state.cash, 250_000),
      devUnlockAll: true,
    };
    const res = createPlayerCoin(funded, {
      symbol,
      name,
      algorithm,
      initialLiquidityUsd: 250_000,
      halvingEverySteps: 90,
      creatorFeePct: 2.5,
    });
    if (!res.ok) return { ok: false, summary: res.summary };
    const finalState: GameState = {
      ...res.nextState,
      cash: preCash,
      devUnlockAll: state.devUnlockAll,
    };
    soundFx.playMilestone();
    setState(finalState);
    showBanner(res.summary);
    return { ok: true, summary: res.summary };
  };

  const handleDevRefreshBlackMarket = () => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            underground: {
              ...prev.underground,
              blackMarketListings: generateBlackMarketListings(prev),
              blackMarketRefreshStep: prev.stepCount + 15,
            },
          }
        : prev
    );
    showBanner('Black Market inventory refreshed.');
  };

  const handleDevGrantAllBusinesses = () => {
    soundFx.playMilestone();
    setState((prev) => {
      if (!prev) return prev;
      const seeded = buildDefaultConglomerate(prev, prev.conglomerate);
      const granted = grantAllSixBusinessesForScenario(seeded, prev.stepCount);
      const nextCong = {
        ...granted,
        hq: {
          ...granted.hq,
          established: true,
          hqLevel: Math.max(3, granted.hq.hqLevel),
        },
        acquisitions: {
          ...granted.acquisitions,
          expansionOpportunityUnlocked: true,
          expansionOfferStep: granted.acquisitions.expansionOfferStep ?? prev.stepCount,
          availableTargets: [],
        },
      };
      const withGen = {
        ...nextCong,
        generation: evaluateGenerationMilestones(prev, nextCong),
      };
      return {
        ...prev,
        conglomerate: withGen,
      };
    });
    showBanner('Dev Override: All 6 corporate divisions granted ACTIVE + HQ Lv 3+ established (Gen-7 unlocked).');
  };

  const handleDevStabilizeAllDivisions = () => {
    soundFx.playClick();
    setState((prev) => {
      if (!prev) return prev;
      const base = buildDefaultConglomerate(prev, prev.conglomerate);
      const nextBusinesses = { ...base.businesses };
      for (const id of BUSINESS_ORDER) {
        const cur = nextBusinesses[id];
        if (cur.status === 'RECOVERING' || cur.status === 'ACQUIRING') {
          nextBusinesses[id] = {
            ...cur,
            status: 'ACTIVE',
            recoveryStepsRemaining: 0,
            efficiencyMult: Math.max(1, cur.efficiencyMult),
          };
        }
      }
      const nextCong = {
        ...base,
        businesses: nextBusinesses,
      };
      return {
        ...prev,
        conglomerate: {
          ...nextCong,
          generation: evaluateGenerationMilestones(prev, nextCong),
        },
      };
    });
    showBanner('Dev Override: All recovering corporate divisions stabilized to ACTIVE.');
  };

  const handleInspectAcquisitionTarget = (targetQuery: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = inspectAcquisitionTarget(state, targetQuery);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleAcquireTargetCompany = (targetQuery: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = acquireTargetCompany(state, targetQuery);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRefreshAcquisitionMarket = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = refreshAcquisitionMarket(state);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return res;
  };

  const handleFundBusinessTurnaround = (businessQuery: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = fundBusinessTurnaround(state, businessQuery);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleEstablishCorporateHQ = (companyName?: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = establishCorporateHQ(state, companyName);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleUpgradeCorporateHQ = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = upgradeCorporateHQ(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRenameCorporateHQ = (companyName: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = renameCorporateHQ(state, companyName);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleToggleSynergyPolicy = (policyQuery: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = toggleSynergyPolicy(state, policyQuery);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleUpgradeBusinessDivision = (businessQuery: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = upgradeBusinessDivision(state, businessQuery);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRunMarketForecastModel = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = runMarketForecastModel(state);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleUpgradePredictionModel = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = upgradePredictionModel(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleExpandIntelSubscriptions = (count?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = expandIntelSubscriptions(state, count);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleSellPredictionSoftwareLicenses = (packs?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = sellPredictionSoftwareLicenses(state, packs);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleToggleIntelAdvisory = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = toggleIntelAdvisory(state);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleToggleCommercialPool = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = toggleCommercialPool(state);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleSetCommercialPoolFee = (feePct: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = setCommercialPoolFee(state, feePct);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleExpandHostingInfrastructure = (addKw?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = expandHostingInfrastructure(state, addKw);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleOnboardHostingClient = (count?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = onboardHostingClient(state, count);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleDropHostingClient = (count?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = dropHostingClient(state, count);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleLeaseComputeCapacity = (units?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = leaseComputeCapacity(state, units);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handlePerformServicesSlaAudit = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = performServicesSlaAudit(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleLicenseBlueprintExternally = (blueprintIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = licenseBlueprintExternally(state, blueprintIdx);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleCompleteExternalDesignContract = (specialty?: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = completeExternalDesignContract(state, specialty);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRunCoolingPowerEngineeringTune = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = runCoolingPowerEngineeringTune(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleUpgradeHardwareEngLab = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = upgradeHardwareEngLab(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleStartOemContract = (category?: string, qty?: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = startOemManufacturingContract(state, category, qty);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleFulfillOemFromInventory = (invIdx: number): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = fulfillOemOrderFromInventory(state, invIdx);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleFulfillInternalSupplyOrder = (target?: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = fulfillInternalSupplyOrder(state, target);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRunManufacturingQcAudit = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = runManufacturingQcAudit(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleHardenShellSubsidiary = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = hardenShellSubsidiary(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleStartUndergroundContract = (kind?: string): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = startUndergroundContract(state, kind);
    if (res.ok) {
      soundFx.playClick();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleRunAuditFirewallSweep = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = runAuditFirewallSweep(state);
    if (res.ok) {
      soundFx.playCash();
      setState(res.nextState);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleContainParentSpillover = (): { ok: boolean; summary: string } => {
    if (!state) return { ok: false, summary: 'No active game.' };
    const res = containParentSpillover(state);
    if (res.ok) {
      soundFx.playMilestone();
      setState(res.nextState);
      showBanner(res.summary);
    }
    return { ok: res.ok, summary: res.summary };
  };

  const handleMarkBusinessTutorialSeen = (businessId: BusinessId) => {
    setState((prev) => {
      if (!prev) return prev;
      const base = buildDefaultConglomerate(prev, prev.conglomerate);
      if (base.businessTutorialsSeen.includes(businessId)) return prev;
      return {
        ...prev,
        conglomerate: {
          ...base,
          businessTutorialsSeen: [...base.businessTutorialsSeen, businessId],
        },
      };
    });
  };

  return {
    state,
    setState,
    careerSnapshot,
    sandboxSnapshot,
    bannerMsg,
    setBannerMsg,
    showEduLanding,
    setShowEduLanding,
    devPanelOpen,
    setDevPanelOpen,
    matrixRain,
    setMatrixRain,
    userPaused,
    setUserPaused,
    activeTerminalModal,
    setActiveTerminalModal,
    autoCountdown,
    autoStepSeconds,
    autoPauseReason,
    commandTrigger,
    triggerTerminalCommand,
    handleStartNew,
    handleStartFromPreset,
    handleResume,
    handleBackupSave,
    handleRestoreBackup,
    handleExportSave,
    handleImportSaveJson,
    handleResetSave,
    handleStepSteps,
    handleQualifyRig,
    handleResolveEvent,
    handleUnlockCoin,
    handleCreatePlayerCoin,
    handleToggleRig,
    handleChangeRigCoin,
    handleChangeRigOverclock,
    handleOverclockRigs,
    handleSetTutorialStep,
    handleMarkTutorialSeen,
    handleFinishGuidedLesson,
    handleSetOnboardingMode,
    handleCompleteGuidedTask,
    handlePauseGuidedOnboarding,
    handleSetGuidedPace,
    handleDismissGuidedSystem,
    handleRevisitGuidedTopic,
    handleSetSimSpeed,
    handleClaimObjectives,
    handleTinkerPart,
    handleTinkerGpu,
    handleSetRigPool,
    handleSetRigProfile,
    handleSetRigPayout,
    handleExchangeBuy,
    handleExchangeSell,
    handlePlaceLimitOrder,
    handleCancelLimitOrder,
    handleOpenShort,
    handleCloseShort,
    handleBuildFabLine,
    handleDesignCustomComponent,
    handleSaveDraftBlueprint,
    handleDeleteDraftBlueprint,
    handleTapeoutDraftBlueprint,
    handleReviseBlueprint,
    handleRunPrototypeTest,
    handleDevFinishFabBatch,
    handleDesignCustomChip,
    handleStripCustomAsic,
    handleQueueFabProduction,
    handleDeployCustomAsic,
    handleSellCustomAsic,
    handleRepairRigs,
    handleRepairComponent,
    handleRepasteRigs,
    handleSalvageRig,
    handleRetireRig,
    handleDeployBackupRig,
    handleSellBackupRig,
    handleRenameRig,
    handleDeployRig,
    handleCloneRig,
    handleBuyUsedListing,
    handleRefreshUsedMarket,
    handleAddCoolingUnit,
    handleToggleCoolingUnit,
    handleRemoveCoolingUnit,
    handleSelectFacility,
    handleMoveRigToRoom,
    handleMoveCoolerToRoom,
    handleExpandFacilityRooms,
    handleBuyFacilityUpgrade,
    handleSelectPowerContract,
    handleHireEmployee,
    handleTrainEmployee,
    handleFireEmployee,
    handleUpdateEmployee,
    handleGiveStaffBonus,
    handleNegotiateStrike,
    handleStartResearch,
    handleStartChallenge,
    handleLaunchCampaign,
    handleAcceptContract,
    handleAbandonContract,
    handleInvestigateRival,
    handleToggleSiphon,
    handleRentBotnet,
    handleWashTrade,
    handlePumpDump,
    handleExtortRival,
    handleSabotageRival,
    handleDevelopShellCoin,
    handleSeedShellCoinLiquidity,
    handleLaunchShellCoin,
    handleShillShellCoin,
    handleRugShellCoin,
    handlePrepareVaultRaid,
    handleExecutePreparedRaid,
    handleRaidRival,
    handleComplyWithAudit,
    handlePayComplianceSettlement,
    handleLaunderHeat,
    handleBribeInspectors,
    handleBuyBlackMarket,
    handleToggleDevMode,
    handleToggleDevUnlockAll,
    handleDevLoadScenario,
    handleDevAddCash,
    handleDevClearDebt,
    handleDevAddRp,
    handleDevUnlockAllResearch,
    handleDevOwnAllFacilities,
    handleDevResetRigTemps,
    handleDevUnlockAllCoins,
    handleDevAdjustCoinPrice,
    handleDevMaxPR,
    handleDevResetPRCooldowns,
    handleDevTriggerEvent,
    handleDevSetRegime,
    handleDevTriggerHalving,
    handleDevSetHeat,
    handleDevSetInvestigationStage,
    handleDevGrantFabBatch,
    handleDevLaunchCustomCoin,
    handleDevRefreshBlackMarket,
    handleDevGrantAllBusinesses,
    handleDevStabilizeAllDivisions,
    handleInspectAcquisitionTarget,
    handleAcquireTargetCompany,
    handleRefreshAcquisitionMarket,
    handleFundBusinessTurnaround,
    handleEstablishCorporateHQ,
    handleUpgradeCorporateHQ,
    handleRenameCorporateHQ,
    handleToggleSynergyPolicy,
    handleUpgradeBusinessDivision,
    handleRunMarketForecastModel,
    handleUpgradePredictionModel,
    handleExpandIntelSubscriptions,
    handleSellPredictionSoftwareLicenses,
    handleToggleIntelAdvisory,
    handleToggleCommercialPool,
    handleSetCommercialPoolFee,
    handleExpandHostingInfrastructure,
    handleOnboardHostingClient,
    handleDropHostingClient,
    handleLeaseComputeCapacity,
    handlePerformServicesSlaAudit,
    handleLicenseBlueprintExternally,
    handleCompleteExternalDesignContract,
    handleRunCoolingPowerEngineeringTune,
    handleUpgradeHardwareEngLab,
    handleStartOemContract,
    handleFulfillOemFromInventory,
    handleFulfillInternalSupplyOrder,
    handleRunManufacturingQcAudit,
    handleHardenShellSubsidiary,
    handleStartUndergroundContract,
    handleRunAuditFirewallSweep,
    handleContainParentSpillover,
    handleMarkBusinessTutorialSeen,
  };
}
