import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  SkipForward,
  Wrench,
  Binary,
  Pause,
  Play,
} from 'lucide-react';
import {
  CHALLENGES,
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
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
} from './data/catalog';
import {
  advanceOneStep,
  BILLING_CYCLE_STEPS,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  calculateRigResaleValue,
  computeAverageRigHealth,
  createInitialComponentHealth,
  createNewGameState,
  ensureRigComponentHealth,
  findOpenGridSlot,
  generateBlackMarketListings,
  generateInteractiveEvent,
  generateUsedMarketListings,
  getComponentRepairCost,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getFacility,
  getFacilityTotals,
  getFacilityUpgradeCost,
  getRigRepasteCost,
  getRigRepairCost,
  resolvePendingEvent,
} from './engine/simulation';
import { getGlobalHardwarePriceMult } from './engine/usedMarket';
import {
  CAREER_STORAGE_KEY,
  clearSavedState,
  createLocalBackup,
  loadLocalBackup,
  loadSavedState,
  SANDBOX_STORAGE_KEY,
  serializeSaveEnvelope,
  validateAndParseImportedSave,
} from './engine/saveSystem';
import {
  ChallengeId,
  CoinSymbol,
  DifficultyLevel,
  EmployeeRole,
  FacilityUpgradeId,
  FirmwareProfile,
  GameState,
  MarketRegime,
  MiningRig,
  PlacedCoolingUnit,
  PoolMode,
  PowerContractId,
  RepairComponentSlot,
  RigBuildConfig,
  RoomCoolingType,
  SandboxConfig,
  ShiftType,
  TaskPriority,
  TransactionCategory,
  TransactionEntry,
} from './types/game';
import { formatStepLabel, formatUsd } from './utils/format';
import { soundFx } from './utils/sound';
import { TitleMenu } from './components/TitleMenu';
import { EducationLanding } from './components/EducationLanding';
import { DevPanel } from './components/DevPanel';
import {
  StepBatchResult,
  TerminalCommandTrigger,
  TextGameTerminal,
} from './components/TextGameTerminal';
import { MatrixRainCanvas } from './components/MatrixRainCanvas';
import { SideTelemetryPanels } from './components/SideTelemetryPanels';

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

export default function App() {
  const [careerSnapshot, setCareerSnapshot] = useState<GameState | null>(() =>
    loadSavedState(CAREER_STORAGE_KEY)
  );
  const [sandboxSnapshot, setSandboxSnapshot] = useState<GameState | null>(() =>
    loadSavedState(SANDBOX_STORAGE_KEY)
  );
  const [state, setState] = useState<GameState | null>(() => {
    const saved = loadSavedState(CAREER_STORAGE_KEY);
    if (saved) {
      return { ...saved, mode: 'TITLE_MENU' };
    }
    return null;
  });

  const AUTO_STEP_SECONDS = 30;

  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [showEduLanding, setShowEduLanding] = useState<boolean>(true);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);
  const [matrixRain, setMatrixRain] = useState<boolean>(true);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [activeTerminalModal, setActiveTerminalModal] = useState<'BUILDER' | 'TINKER' | null>(
    null
  );
  const [autoCountdown, setAutoCountdown] = useState<number>(AUTO_STEP_SECONDS);
  const [commandTrigger, setCommandTrigger] = useState<TerminalCommandTrigger | null>(null);
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
    try {
      const key = state.isSandbox ? SANDBOX_STORAGE_KEY : CAREER_STORAGE_KEY;
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
    challengeId: ChallengeId | null = null
  ) => {
    soundFx.playMilestone();
    const fresh = createNewGameState(difficulty, devMode, runSeed, sandboxConfig, challengeId);
    setState(fresh);
    setDevPanelOpen(false);
    setActiveTerminalModal(null);
    setUserPaused(false);
    setAutoCountdown(AUTO_STEP_SECONDS);
    if (sandboxConfig || difficulty === 'SANDBOX') {
      showBanner(`Sandbox launched (${fresh.runSeed}): isolated save slot active.`);
    } else if (devMode) {
      showBanner(
        `Dev Mode active (${fresh.runSeed}): $2.50M, 1,000 RP, all coins & dev event tools ready.`
      );
    } else if (challengeId) {
      const ch = CHALLENGES.find((c) => c.id === challengeId);
      showBanner(`Challenge run "${ch?.title ?? challengeId}" started on seed ${fresh.runSeed}.`);
    } else {
      showBanner(`New career run started on seed ${fresh.runSeed}.`);
    }
  };

  const handleResume = (sandbox = false) => {
    soundFx.playClick();
    const snap = sandbox ? sandboxSnapshot : careerSnapshot;
    if (snap) {
      setState({ ...snap, mode: 'PLAYING' });
      setActiveTerminalModal(null);
      setAutoCountdown(AUTO_STEP_SECONDS);
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
    try {
      localStorage.setItem(
        playing.isSandbox ? SANDBOX_STORAGE_KEY : CAREER_STORAGE_KEY,
        JSON.stringify(playing)
      );
    } catch {
      // Ignore storage errors
    }
    if (playing.isSandbox) setSandboxSnapshot(playing);
    else setCareerSnapshot(playing);
    setState(playing);
    showBanner(`Restored ${sandbox ? 'Sandbox' : 'Career'} backup (Step ${playing.stepCount}).`);
    return true;
  };

  const handleExportSave = (sandbox = false): string | null => {
    const target =
      state && Boolean(state.isSandbox) === sandbox
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
    try {
      localStorage.setItem(
        imported.isSandbox ? SANDBOX_STORAGE_KEY : CAREER_STORAGE_KEY,
        JSON.stringify(imported)
      );
    } catch {
      // Ignore storage errors
    }
    if (imported.isSandbox) setSandboxSnapshot(imported);
    else setCareerSnapshot(imported);
    setState(imported);
    soundFx.playMilestone();
    showBanner(
      `Imported ${imported.isSandbox ? 'Sandbox' : 'Career'} save (Step ${imported.stepCount}).`
    );
    return {
      ok: true,
      summary: `Loaded ${imported.isSandbox ? 'Sandbox' : 'Career'} Step ${imported.stepCount} (${formatUsd(
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

  const handleStepSteps = (steps: number, silent = false): StepBatchResult | null => {
    if (!state) return null;
    if (state.pendingEvent) {
      if (!silent) {
        soundFx.playAlert();
        showBanner(`Resolve "${state.pendingEvent.title}" in the terminal before stepping.`);
      }
      return null;
    }
    if (!silent) soundFx.playClick();
    const count = Math.max(1, Math.min(200, Math.round(steps)));

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
    else if (!silent && totalMiningCash > 0) soundFx.playCash();

    setState(current);
    setAutoCountdown(AUTO_STEP_SECONDS);
    return {
      stepsRun,
      newStepCount: current.stepCount,
      miningCashEarned: totalMiningCash,
      rpEarned: totalRp,
      billsSettledUsd: totalBills,
      soloBlocksHit: totalSoloHits,
      haltedByEvent,
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
    : (state.tutorialStep ?? 0) > 0
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
      setAutoCountdown(AUTO_STEP_SECONDS);
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
      const compatible = newPart.isAsicRack
        ? oldCompute.kind === 'ASIC'
        : oldCompute.kind !== 'ASIC';
      if (!compatible) {
        const replacement = COMPUTE_PARTS.find(
          (c) =>
            (newPart.isAsicRack ? c.kind === 'ASIC' : c.kind !== 'ASIC') &&
            isUnlocked(c.researchRequired)
        );
        if (!replacement) {
          return {
            ok: false,
            summary: `Cannot convert chassis: no unlocked ${
              newPart.isAsicRack ? 'ASIC' : 'CPU/FPGA'
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
      const chassis = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
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
      if (chassis.isAsicRack && newPart.kind !== 'ASIC') {
        return { ok: false, summary: `${chassis.name} only accepts ASIC blades.` };
      }
      if (!chassis.isAsicRack && newPart.kind === 'ASIC') {
        return {
          ok: false,
          summary: `${chassis.name} requires a 42U/Hydro ASIC chassis for ASIC blades.`,
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
              return {
                ...r,
                ...nextRigPatch,
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
    const chassis = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
    const hwMult = getGlobalHardwarePriceMult(state);

    if (action === 'CLEAR') {
      if (rig.gpuIds.length === 0) {
        return { ok: false, summary: `${rig.name} has no GPUs to remove.` };
      }
      const refund = rig.gpuIds.reduce((s, gid) => {
        const g = GPU_PARTS.find((x) => x.id === gid);
        return s + Math.round((g?.cost ?? 0) * 0.6);
      }, 0);
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
      const spec = GPU_PARTS.find((g) => g.id === gid);
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
    if (!state) return false;
    const newCost = calculateRigBuildCost(config, state);
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.cash < newCost || state.rigs.length >= maxRigs) {
      return false;
    }

    setState((prev) => {
      if (!prev) return prev;
      const cost = calculateRigBuildCost(config, prev);
      const fac = getFacility(prev.facilityId);
      if (prev.cash < cost || prev.rigs.length >= getEffectiveFacilityMaxRigs(prev)) return prev;
      const slot = findOpenGridSlot(fac, prev.rigs, prev.coolingUnits ?? []);

      const newRig: MiningRig = {
        ...config,
        id: `rig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        poolMode: config.poolMode ?? 'PPS',
        firmwareProfile: config.firmwareProfile ?? 'BALANCED',
        pasteStepsRemaining: 16,
        soloBlocksWon: 0,
        lastStepBlockHit: false,
        illicitMod: null,
        enabled: true,
        gridX: slot.gridX,
        gridY: slot.gridY,
        temperatureC: fac.ambientTempC + 25,
        healthPct: 100,
        componentHealth: createInitialComponentHealth(config.gpuIds.length, 100),
        conditionTier: 'NEW',
        ageSteps: 0,
        failureCount: 0,
        isUsedPurchase: false,
        purchasePriceUsd: cost,
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
          makeTx(prev.stepCount, 'HARDWARE', -cost, `Built & deployed ${config.name}`),
          ...(prev.transactions ?? []),
        ].slice(0, 200),
        rigs: [...prev.rigs, newRig],
      };
    });
    return true;
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
      if (!item || prev.cash < item.listPriceUsd || prev.rigs.length >= getEffectiveFacilityMaxRigs(prev)) {
        return prev;
      }
      const fac = getFacility(prev.facilityId);
      const slot = findOpenGridSlot(fac, prev.rigs, prev.coolingUnits ?? []);
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
        temperatureC: fac.ambientTempC + 20,
        healthPct: item.conditionPct,
        componentHealth: createInitialComponentHealth(item.config.gpuIds.length, item.conditionPct),
        conditionTier: item.conditionTier,
        ageSteps: item.ageSteps,
        failureCount: 0,
        isUsedPurchase: true,
        purchasePriceUsd: item.listPriceUsd,
        status: item.conditionPct <= 20 ? 'NEEDS_REPAIR' : 'MINING',
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

  const handleAddCoolingUnit = (type: RoomCoolingType): boolean => {
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === type);
    if (!spec || !state) return false;
    const facIndex = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    const unlockedFac = state.devUnlockAll || facIndex >= spec.unlockFacilityIndex;
    const unlockedRes =
      state.devUnlockAll ||
      !spec.researchRequired ||
      state.unlockedResearch.includes(spec.researchRequired);
    if (!unlockedFac || !unlockedRes || state.cash < spec.cost) return false;

    setState((prev) => {
      if (!prev || prev.cash < spec.cost) return prev;
      const newUnit: PlacedCoolingUnit = {
        id: `cool_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type,
        gridX: 0,
        gridY: 0,
        enabled: true,
      };
      soundFx.playCash();
      showBanner(`Installed ${spec.name} (+${spec.coolingPowerC}°C facility cooling).`);
      return {
        ...prev,
        cash: prev.cash - spec.cost,
        coolingUnits: [...(prev.coolingUnits ?? []), newUnit],
        currentCycleStats: {
          ...prev.currentCycleStats,
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + spec.cost,
        },
        stats: {
          ...prev.stats,
          totalCoolingSpendUsd: prev.stats.totalCoolingSpendUsd + spec.cost,
        },
        transactions: [
          makeTx(prev.stepCount, 'FACILITY', -spec.cost, `Installed ${spec.name}`),
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
        ownedFacilityIds: nextOwned,
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

  const handleStartResearch = (nodeId: string): boolean => {
    if (!state || state.activeResearchId || state.unlockedResearch.includes(nodeId)) return false;
    const node = RESEARCH_NODES.find((n) => n.id === nodeId);
    if (!node || state.cash < node.costCash) return false;
    if (
      !state.devUnlockAll &&
      !node.prereqIds.every((p) => state.unlockedResearch.includes(p))
    ) {
      return false;
    }

    setState((prev) => {
      if (!prev || prev.activeResearchId || prev.unlockedResearch.includes(nodeId)) return prev;
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

  // Contracts Handlers
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

  // Underground & Black Market Handlers
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
    setState((prev) =>
      prev
        ? {
            ...prev,
            cash: prev.cash - cost,
            regulatoryScrutiny: Math.max(0, prev.regulatoryScrutiny - 24),
            underground: {
              ...prev.underground,
              launderCooldownStep: prev.stepCount + 10,
            },
            transactions: [
              makeTx(prev.stepCount, 'EVENT', -cost, 'Mixer scrubbing (-24 Heat)'),
              ...(prev.transactions ?? []),
            ].slice(0, 200),
            stats: {
              ...prev.stats,
              totalFinesAndBribesUsd: prev.stats.totalFinesAndBribesUsd + cost,
            },
          }
        : prev
    );
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
    if (state.cash < item.costUsd) {
      return { ok: false, summary: `Insufficient cash (need ${formatUsd(item.costUsd)}).` };
    }

    if (item.kind === 'SMUGGLED_RIG' && item.presetConfig) {
      const maxRigs = getEffectiveFacilityMaxRigs(state);
      if (state.rigs.length >= maxRigs) {
        return { ok: false, summary: `Facility full (${maxRigs} max rigs).` };
      }
      soundFx.playAlert();
      setState((prev) => {
        if (!prev) return prev;
        const f = getFacility(prev.facilityId);
        const slot = findOpenGridSlot(f, prev.rigs, prev.coolingUnits ?? []);
        const newRig: MiningRig = {
          ...item.presetConfig!,
          name: `Smuggled Rig #${prev.rigs.length + 1}`,
          id: `rig_bm_${Date.now()}`,
          poolMode: 'PPS',
          firmwareProfile: 'BALANCED',
          pasteStepsRemaining: 12,
          soloBlocksWon: 0,
          lastStepBlockHit: false,
          illicitMod: null,
          enabled: true,
          gridX: slot.gridX,
          gridY: slot.gridY,
          temperatureC: f.ambientTempC + 24,
          healthPct: 96,
          conditionTier: 'USED',
          ageSteps: 20,
          failureCount: 0,
          purchasePriceUsd: item.costUsd,
          status: 'MINING',
          lastStepCoins: 0,
          lastStepUsd: 0,
          totalMinedCoins: 0,
          totalEarnedUsd: 0,
          createdStep: prev.stepCount,
        };
        return {
          ...prev,
          cash: prev.cash - item.costUsd,
          regulatoryScrutiny: Math.min(100, prev.regulatoryScrutiny + item.heatGain),
          rigs: [...prev.rigs, newRig],
          underground: {
            ...prev.underground,
            blackMarketListings: prev.underground.blackMarketListings.filter(
              (b) => b.id !== listingId
            ),
          },
          transactions: [
            makeTx(prev.stepCount, 'HARDWARE', -item.costUsd, `Black market: ${item.title}`),
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
      return {
        ok: true,
        summary: `Acquired ${item.title} for ${formatUsd(item.costUsd)} (+${item.heatGain} Heat).`,
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
              cash: prev.cash - item.costUsd,
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
                  -item.costUsd,
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
        summary: `Flashed ${item.title} onto ${targetRig.name} for ${formatUsd(item.costUsd)} (+${
          item.heatGain
        } Heat).`,
      };
    }

    return { ok: false, summary: 'Invalid black-market item.' };
  };

  // Dev Overrides
  const handleToggleDevMode = (enabled: boolean) => {
    soundFx.playClick();
    setState((prev) =>
      prev
        ? {
            ...prev,
            devMode: enabled,
            devUnlockAll: enabled ? prev.devUnlockAll : false,
          }
        : prev
    );
    if (enabled) {
      setDevPanelOpen(true);
      showBanner('Developer Mode enabled. Open Dev Tools anytime from the toolbar.');
    } else {
      showBanner('Developer Mode disabled.');
    }
  };

  const handleToggleDevUnlockAll = () => {
    soundFx.playClick();
    setState((prev) => (prev ? { ...prev, devUnlockAll: !prev.devUnlockAll } : prev));
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
    showBanner('Dev Override: All 6 coin tiers unlocked.');
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

  if (showEduLanding && (!state || state.mode === 'TITLE_MENU')) {
    return (
      <EducationLanding
        onOpenPortal={() => {
          soundFx.playClick();
          setShowEduLanding(false);
        }}
      />
    );
  }

  if (!state || state.mode === 'TITLE_MENU') {
    const careerSummary = careerSnapshot
      ? `${formatStepLabel(careerSnapshot.stepCount)} · ${formatUsd(careerSnapshot.cash, true)}`
      : undefined;
    const sandboxSummary = sandboxSnapshot
      ? `${formatStepLabel(sandboxSnapshot.stepCount)} · ${formatUsd(sandboxSnapshot.cash, true)}`
      : undefined;
    return (
      <TitleMenu
        hasSavedGame={Boolean(careerSnapshot)}
        savedSummary={careerSummary}
        hasSavedSandbox={Boolean(sandboxSnapshot)}
        sandboxSummary={sandboxSummary}
        onStartNew={handleStartNew}
        onResume={() => handleResume(false)}
        onResumeSandbox={() => handleResume(true)}
        onExportSave={handleExportSave}
        onImportSave={handleImportSaveJson}
        onBackupSave={(sandbox) =>
          handleBackupSave((sandbox ? sandboxSnapshot : careerSnapshot) ?? undefined)
        }
        onRestoreBackup={handleRestoreBackup}
        onResetSave={handleResetSave}
        onReturnToStudy={() => {
          soundFx.playClick();
          setShowEduLanding(true);
        }}
      />
    );
  }

  const totals = getFacilityTotals(state);
  const effectiveCap = getEffectiveFacilityPowerCapKw(state);
  const stepRev = state.rigs.reduce((s, r) => s + r.lastStepUsd, 0);
  const stepsUntilBill =
    BILLING_CYCLE_STEPS - (state.stepCount % BILLING_CYCLE_STEPS || BILLING_CYCLE_STEPS);
  const regimeSpec = MARKET_REGIME_SPECS[state.marketRegime];

  const navCommands: { label: string; cmd: string }[] = [
    { label: 'Status', cmd: 'status' },
    { label: 'Rigs', cmd: 'rigs' },
    { label: 'Used Market', cmd: 'usedmarket' },
    { label: 'Power', cmd: 'power' },
    { label: 'Market', cmd: 'market' },
    { label: 'Contracts', cmd: 'contracts' },
    { label: 'Stats', cmd: 'stats' },
  ];

  return (
    <div className="relative min-h-screen bg-[#020603] text-green-50 flex flex-col overflow-x-hidden">
      <MatrixRainCanvas enabled={matrixRain} />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="relative z-10 border-b border-green-500/25 bg-[#030A05]/88 backdrop-blur-sm px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => triggerTerminalCommand('status')}
            className="font-display text-lg font-bold tracking-tight text-green-300 matrix-glow whitespace-nowrap shrink-0"
          >
            HASHRATE{state.isSandbox ? ' [SANDBOX]' : ''}
          </button>

          <nav className="flex items-center gap-5 overflow-x-auto">
            {navCommands.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => triggerTerminalCommand(item.cmd)}
                className="text-sm font-medium pb-0.5 border-b-2 border-transparent text-green-200/80 hover:text-green-300 hover:border-green-400 transition-colors whitespace-nowrap shrink-0"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setState((prev) => (prev ? { ...prev, mode: 'TITLE_MENU' } : prev));
            }}
            className="px-4 py-2 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/35 text-xs font-semibold text-green-200 transition-colors whitespace-nowrap shrink-0"
          >
            Main Menu
          </button>
        </div>
      </header>

      {/* Workspace Telemetry & Step Control Bar */}
      <div className="relative z-10 border-b border-green-500/20 bg-[#020804]/85 backdrop-blur-sm px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <div>
              <span className="text-green-400/70 mr-1.5">Step</span>
              <span className="font-mono tabular-nums font-semibold text-green-100">
                {state.stepCount}
              </span>
              <span className="text-green-700 mx-1.5">·</span>
              <span className="text-green-300/75 font-mono tabular-nums">
                Bill in {stepsUntilBill}st
              </span>
            </div>

            <div>
              <span className="text-green-400/70 mr-1.5">Cash</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  state.cash < 0 ? 'text-rose-400' : 'text-green-400'
                }`}
              >
                {formatUsd(state.cash)}
              </span>
            </div>

            <div>
              <span className="text-green-400/70 mr-1.5">Step Rev</span>
              <span className="font-mono tabular-nums font-semibold text-lime-300">
                +{formatUsd(stepRev)}
              </span>
            </div>

            <div className="hidden md:block">
              <span className="text-green-400/70 mr-1.5">Cycle</span>
              <span className="font-mono text-green-200">{regimeSpec.label}</span>
            </div>

            <div className="hidden lg:block">
              <span className="text-green-400/70 mr-1.5">Power</span>
              <span
                className={`font-mono tabular-nums ${
                  totals.totalPowerKw > effectiveCap ? 'text-rose-400' : 'text-green-200'
                }`}
              >
                {totals.totalPowerKw.toFixed(2)}/{effectiveCap} kW
              </span>
            </div>
          </div>

          {/* Step-Based Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#030D06] border border-green-500/25">
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 1')}
                className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-green-500 hover:bg-green-400 text-[#020804] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>+1 Step</span>
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 5')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 10')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +10
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 30')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +30
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setUserPaused((p) => !p);
              }}
              title={
                autoPauseReason === null
                  ? 'Pause automatic 30s stepping'
                  : userPaused
                  ? 'Resume automatic 30s stepping'
                  : `Auto-stepping paused (${autoPauseReason})`
              }
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                autoPauseReason === null
                  ? 'bg-green-500/15 hover:bg-green-500/25 border-green-500/40 text-green-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/45 text-amber-200'
              }`}
            >
              {autoPauseReason === null ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Auto {autoCountdown}s</span>
                </>
              ) : userPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Paused</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Paused: {autoPauseReason}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setMatrixRain((v) => !v);
              }}
              title={matrixRain ? 'Disable Matrix Rain' : 'Enable Matrix Rain'}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                matrixRain
                  ? 'bg-green-500/15 hover:bg-green-500/25 border-green-500/40 text-green-300'
                  : 'bg-[#030D06] hover:bg-green-950 border-green-500/20 text-green-600'
              }`}
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Rain</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setState((p) => (p ? { ...p, soundEnabled: !p.soundEnabled } : p))
              }
              title={state.soundEnabled ? 'Mute Audio' : 'Enable Audio'}
              className="p-2 rounded-lg bg-[#030D06] hover:bg-green-950 border border-green-500/25 text-green-300 transition-colors"
            >
              {state.soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-green-700" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!state.devMode) {
                  handleToggleDevMode(true);
                } else {
                  soundFx.playClick();
                  setDevPanelOpen(true);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                state.devMode
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
                  : 'bg-[#030D06] hover:bg-green-950 border-green-500/25 text-green-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{state.devMode ? 'Dev Tools' : 'Dev Mode'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full-Height Text-Based Terminal Game Viewport */}
      <main className="relative z-10 flex-1 px-6 py-4">
        <div className="max-w-[1440px] mx-auto space-y-3">
          {bannerMsg && (
            <div className="px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/40 text-xs font-mono text-green-200 flex items-center justify-between backdrop-blur-sm">
              <span>{bannerMsg}</span>
              <button
                type="button"
                onClick={() => setBannerMsg(null)}
                className="text-green-300 hover:text-white ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-1 min-w-0">
              <TextGameTerminal
                state={state}
                commandTrigger={commandTrigger}
                onStepSteps={handleStepSteps}
                onResolveEvent={handleResolveEvent}
                onUnlockCoin={handleUnlockCoin}
                onDeployRig={handleDeployRig}
                onSalvageRig={handleSalvageRig}
                onRetireRig={handleRetireRig}
                onDeployBackupRig={handleDeployBackupRig}
                onSellBackupRig={handleSellBackupRig}
                onBuyUsedListing={handleBuyUsedListing}
                onRefreshUsedMarket={handleRefreshUsedMarket}
                onRenameRig={handleRenameRig}
                onToggleRig={handleToggleRig}
                onChangeRigCoin={handleChangeRigCoin}
                onChangeRigOverclock={handleChangeRigOverclock}
                onOverclockRigs={handleOverclockRigs}
                onTinkerPart={handleTinkerPart}
                onTinkerGpu={handleTinkerGpu}
                onSetRigPool={handleSetRigPool}
                onSetRigProfile={handleSetRigProfile}
                onRepairRigs={handleRepairRigs}
                onRepairComponent={handleRepairComponent}
                onRepasteRigs={handleRepasteRigs}
                onAddCoolingUnit={handleAddCoolingUnit}
                onToggleCoolingUnit={handleToggleCoolingUnit}
                onRemoveCoolingUnit={handleRemoveCoolingUnit}
                onSelectFacility={handleSelectFacility}
                onBuyFacilityUpgrade={handleBuyFacilityUpgrade}
                onSelectPowerContract={handleSelectPowerContract}
                onHireEmployee={handleHireEmployee}
                onTrainEmployee={handleTrainEmployee}
                onFireEmployee={handleFireEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onStartResearch={handleStartResearch}
                onStartChallenge={handleStartChallenge}
                onLaunchCampaign={handleLaunchCampaign}
                onAcceptContract={handleAcceptContract}
                onAbandonContract={handleAbandonContract}
                onToggleSiphon={handleToggleSiphon}
                onRentBotnet={handleRentBotnet}
                onWashTrade={handleWashTrade}
                onSabotageRival={handleSabotageRival}
                onLaunderHeat={handleLaunderHeat}
                onBribeInspectors={handleBribeInspectors}
                onBuyBlackMarket={handleBuyBlackMarket}
                onBackupSave={() => handleBackupSave()}
                onRestoreBackup={() => handleRestoreBackup(Boolean(state.isSandbox))}
                onExportSave={() => handleExportSave(Boolean(state.isSandbox))}
                onToggleDevMode={handleToggleDevMode}
                onOpenDevPanel={() => setDevPanelOpen(true)}
                onToggleDevUnlockAll={handleToggleDevUnlockAll}
                onDevAddCash={handleDevAddCash}
                onDevAddRp={handleDevAddRp}
                onDevUnlockAllResearch={handleDevUnlockAllResearch}
                onDevOwnAllFacilities={handleDevOwnAllFacilities}
                onDevUnlockAllCoins={handleDevUnlockAllCoins}
                onDevResetRigTemps={handleDevResetRigTemps}
                onDevAdjustCoinPrice={handleDevAdjustCoinPrice}
                onDevTriggerEvent={handleDevTriggerEvent}
                onDevSetRegime={handleDevSetRegime}
                onDevTriggerHalving={handleDevTriggerHalving}
                onDevSetHeat={handleDevSetHeat}
                onDevRefreshBlackMarket={handleDevRefreshBlackMarket}
                onSetTutorialStep={handleSetTutorialStep}
                userPaused={userPaused}
                autoPauseReason={autoPauseReason}
                autoCountdown={autoCountdown}
                onSetUserPaused={setUserPaused}
                onActiveModalChange={setActiveTerminalModal}
              />
            </div>

            <SideTelemetryPanels state={state} onRunCommand={triggerTerminalCommand} />
          </div>
        </div>
      </main>

      {devPanelOpen && state.devMode && (
        <DevPanel
          state={state}
          onClose={() => setDevPanelOpen(false)}
          onToggleDevMode={handleToggleDevMode}
          onToggleDevUnlockAll={handleToggleDevUnlockAll}
          onAddCash={handleDevAddCash}
          onClearDebt={handleDevClearDebt}
          onAddRp={handleDevAddRp}
          onStepSteps={(n) => handleStepSteps(n)}
          onUnlockAllResearch={handleDevUnlockAllResearch}
          onOwnAllFacilities={handleDevOwnAllFacilities}
          onResetRigTemps={handleDevResetRigTemps}
          onUnlockAllCoins={handleDevUnlockAllCoins}
          onAdjustCoinPrice={handleDevAdjustCoinPrice}
          onMaxPR={handleDevMaxPR}
          onResetPRCooldowns={handleDevResetPRCooldowns}
          onDevTriggerEvent={handleDevTriggerEvent}
          onDevSetRegime={handleDevSetRegime}
          onDevTriggerHalving={handleDevTriggerHalving}
          onDevSetHeat={handleDevSetHeat}
          onDevRefreshBlackMarket={handleDevRefreshBlackMarket}
        />
      )}
    </div>
  );
}
