import { useCallback, useEffect, useState } from 'react';
import {
  Volume2,
  VolumeX,
  SkipForward,
  Wrench,
  Binary,
} from 'lucide-react';
import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  EMPLOYEE_SPECS,
  FACILITY_TIERS,
  GPU_PARTS,
  MARKET_REGIME_SPECS,
  OS_PARTS,
  PR_CAMPAIGNS,
  PSU_PARTS,
  RESEARCH_NODES,
  ROOM_COOLING_UNITS,
  STORAGE_PARTS,
} from './data/catalog';
import { createInitialCoins } from './data/history';
import {
  advanceOneStep,
  BILLING_CYCLE_STEPS,
  calculatePartTradeInCost,
  calculateRigBuildCost,
  createInitialRivals,
  createNewGameState,
  findOpenGridSlot,
  generateBlackMarketListings,
  generateContractBoard,
  generateInteractiveEvent,
  getEffectiveFacilityPowerCapKw,
  getFacility,
  getFacilityTotals,
  getRigRepasteCost,
  getRigRepairCost,
  resolvePendingEvent,
} from './engine/simulation';
import {
  CoinSymbol,
  DifficultyLevel,
  EmployeeRole,
  FirmwareProfile,
  GameState,
  MarketRegime,
  MiningRig,
  PlacedCoolingUnit,
  PoolMode,
  RigBuildConfig,
  RoomCoolingType,
  ShiftType,
  TaskPriority,
} from './types/game';
import { formatStepLabel, formatUsd } from './utils/format';
import { generateRandomSeed } from './utils/rng';
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

const STORAGE_KEY = 'blockworks_tycoon_save_v2';

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

function loadSavedState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState & { dayCount?: number };
    if (!parsed || typeof parsed.cash !== 'number' || !parsed.coins) return null;

    const runSeed = parsed.runSeed || generateRandomSeed();
    const defaultCoins = createInitialCoins(runSeed);
    const migratedCoins = { ...defaultCoins };
    (Object.keys(defaultCoins) as CoinSymbol[]).forEach((sym) => {
      const savedCoin = parsed.coins[sym];
      if (savedCoin && typeof savedCoin.tier === 'number') {
        migratedCoins[sym] = {
          ...defaultCoins[sym],
          ...savedCoin,
        };
      }
    });

    const coolingUnits = parsed.coolingUnits ?? [];
    const rigs: MiningRig[] = (parsed.rigs ?? []).map((r, idx) => ({
      ...r,
      gridX: typeof r.gridX === 'number' ? r.gridX : 1 + (idx % 4),
      gridY: typeof r.gridY === 'number' ? r.gridY : 1 + Math.floor(idx / 4),
      poolMode: r.poolMode ?? 'PPS',
      firmwareProfile: r.firmwareProfile ?? 'BALANCED',
      pasteStepsRemaining: typeof r.pasteStepsRemaining === 'number' ? r.pasteStepsRemaining : 8,
      soloBlocksWon: typeof r.soloBlocksWon === 'number' ? r.soloBlocksWon : 0,
      lastStepBlockHit: Boolean(r.lastStepBlockHit),
      illicitMod: r.illicitMod ?? null,
      lastStepCoins: typeof r.lastStepCoins === 'number' ? r.lastStepCoins : 0,
      lastStepUsd: typeof r.lastStepUsd === 'number' ? r.lastStepUsd : 0,
      totalEarnedUsd: typeof r.totalEarnedUsd === 'number' ? r.totalEarnedUsd : 0,
    }));

    const stepCount = typeof parsed.stepCount === 'number' ? parsed.stepCount : parsed.dayCount ?? 0;

    const hydrated: GameState = {
      ...parsed,
      runSeed,
      stepCount,
      rigs,
      coolingUnits,
      coins: migratedCoins,
      marketRegime: parsed.marketRegime ?? 'ACCUMULATION',
      regimeStepsRemaining:
        typeof parsed.regimeStepsRemaining === 'number' ? parsed.regimeStepsRemaining : 14,
      rivals: parsed.rivals?.length ? parsed.rivals : createInitialRivals(runSeed),
      availableContracts: parsed.availableContracts ?? [],
      activeContract: parsed.activeContract ?? null,
      underground: parsed.underground ?? {
        powerSiphonActive: false,
        botnetCoin: null,
        botnetBonusHash: 0,
        botnetStepsRemaining: 0,
        washCooldownStep: 0,
        launderCooldownStep: 0,
        bribeProtectionSteps: 0,
        blackMarketListings: [],
        blackMarketRefreshStep: stepCount + 15,
      },
      pendingEvent: parsed.pendingEvent ?? null,
      stats: parsed.stats ?? {
        soloBlocksHit: 0,
        contractsCompleted: 0,
        covertOpsCount: 0,
        raidsSurvived: 0,
        totalFinesAndBribesUsd: 0,
      },
      devMode: Boolean(parsed.devMode),
      devUnlockAll: Boolean(parsed.devUnlockAll),
      tutorialStep: typeof parsed.tutorialStep === 'number' ? parsed.tutorialStep : 0,
    };

    if (hydrated.availableContracts.length === 0) {
      hydrated.availableContracts = generateContractBoard(hydrated, 3);
    }
    if (hydrated.underground.blackMarketListings.length === 0) {
      hydrated.underground = {
        ...hydrated.underground,
        blackMarketListings: generateBlackMarketListings(hydrated),
      };
    }

    return hydrated;
  } catch {
    return null;
  }
}

export default function App() {
  const [savedSnapshot, setSavedSnapshot] = useState<GameState | null>(() => loadSavedState());
  const [state, setState] = useState<GameState | null>(() => {
    const saved = loadSavedState();
    if (saved) {
      return { ...saved, mode: 'TITLE_MENU' };
    }
    return null;
  });

  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [showEduLanding, setShowEduLanding] = useState<boolean>(true);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);
  const [matrixRain, setMatrixRain] = useState<boolean>(true);
  const [commandTrigger, setCommandTrigger] = useState<TerminalCommandTrigger | null>(null);

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSavedSnapshot(state);
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  const handleStartNew = (
    difficulty: DifficultyLevel,
    devMode = false,
    runSeed?: string
  ) => {
    soundFx.playMilestone();
    const fresh = createNewGameState(difficulty, devMode, runSeed);
    setState(fresh);
    setDevPanelOpen(false);
    if (devMode) {
      showBanner(`Dev Mode active (${fresh.runSeed}): $2.50M, 1,000 RP, all coins & dev event tools ready.`);
    } else {
      showBanner(`New run started on seed ${fresh.runSeed}.`);
    }
  };

  const handleResume = () => {
    soundFx.playClick();
    if (savedSnapshot) {
      setState({ ...savedSnapshot, mode: 'PLAYING' });
    }
  };

  const handleStepSteps = (steps: number): StepBatchResult | null => {
    if (!state) return null;
    if (state.pendingEvent) {
      soundFx.playAlert();
      showBanner(`Resolve "${state.pendingEvent.title}" in the terminal before stepping.`);
      return null;
    }
    soundFx.playClick();
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
    else if (totalMiningCash > 0) soundFx.playCash();

    setState(current);
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

    let netCost = 0;
    let nextRigPatch: Partial<MiningRig> = {};
    let detailNote = '';

    if (slot === 'chassis') {
      const oldPart = CHASSIS_PARTS.find((c) => c.id === rig.chassisId) ?? CHASSIS_PARTS[0];
      const newPart = CHASSIS_PARTS.find((c) => c.id === partId);
      if (!newPart) return { ok: false, summary: 'Chassis part not found.' };
      if (!isUnlocked(newPart.researchRequired)) {
        const node = RESEARCH_NODES.find((n) => n.id === newPart.researchRequired);
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }

      netCost += calculatePartTradeInCost(oldPart.cost, newPart.cost);

      // Keep GPUs within maxGpus, crediting 60% trade-in for removed cards
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

      // If switching between ASIC Rack and GPU/CPU frame, swap compute cleanly
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
        netCost += calculatePartTradeInCost(oldCompute.cost, replacement.cost);
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
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (chassis.isAsicRack && newPart.kind !== 'ASIC') {
        return { ok: false, summary: `${chassis.name} only accepts ASIC blades.` };
      }
      if (!chassis.isAsicRack && newPart.kind === 'ASIC') {
        return { ok: false, summary: `${chassis.name} requires a 42U/Hydro ASIC chassis for ASIC blades.` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, newPart.cost);
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
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, newPart.cost);
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
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, newPart.cost);
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
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already uses ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, newPart.cost);
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
        return { ok: false, summary: `Locked: requires R&D "${node?.name ?? newPart.researchRequired}".` };
      }
      if (oldPart.id === newPart.id) {
        return { ok: false, summary: `${rig.name} already runs ${newPart.name}.` };
      }
      netCost = calculatePartTradeInCost(oldPart.cost, newPart.cost);
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
            rigs: prev.rigs.map((r, i) => (i === rigIndex ? { ...r, ...nextRigPatch } : r)),
          }
        : prev
    );

    const costLabel =
      netCost >= 0 ? `Paid ${formatUsd(netCost)} net` : `Refunded +${formatUsd(Math.abs(netCost))}`;
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
              rigs: prev.rigs.map((r, i) => (i === rigIndex ? { ...r, gpuIds: [] } : r)),
            }
          : prev
      );
      return { ok: true, summary: `Removed all GPUs from ${rig.name} (+${formatUsd(refund)} trade-in).` };
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
              rigs: prev.rigs.map((r, i) =>
                i === rigIndex
                  ? { ...r, gpuIds: r.gpuIds.filter((_id, gIdx) => gIdx !== slotIdx) }
                  : r
              ),
            }
          : prev
      );
      return {
        ok: true,
        summary: `Removed ${spec?.name ?? 'GPU'} from slot #${slotIdx + 1} (+${formatUsd(refund)} trade-in).`,
      };
    }

    // ADD
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
      return { ok: false, summary: `Locked: requires R&D "${node?.name ?? gpuSpec.researchRequired}".` };
    }
    const toAdd = Math.min(slotsLeft, Math.max(1, qty));
    const totalCost = gpuSpec.cost * toAdd;
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
            rigs: prev.rigs.map((r, i) =>
              i === rigIndex ? { ...r, gpuIds: [...r.gpuIds, ...Array(toAdd).fill(gpuSpec.id)] } : r
            ),
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
    const targets = state.rigs.filter((r, idx) =>
      (rigIndexOrAll === 'ALL' || idx === rigIndexOrAll) && r.healthPct < 100
    );
    const totalCost = targets.reduce((s, r) => s + getRigRepairCost(r), 0);
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
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + totalCost,
        },
        rigs: prev.rigs.map((r) =>
          targetIds.has(r.id)
            ? {
                ...r,
                healthPct: 100,
                status: r.enabled ? 'MINING' : 'PAUSED',
              }
            : r
        ),
      };
    });
    return { ok: true, count: targets.length, cost: totalCost };
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
          otherSpendUsd: prev.currentCycleStats.otherSpendUsd + totalCost,
        },
        rigs: prev.rigs.map((r) =>
          targetIds.has(r.id) ? { ...r, pasteStepsRemaining: 16 } : r
        ),
      };
    });
    return { ok: true, count: targets.length, cost: totalCost };
  };

  const handleSalvageRig = (rigId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const target = prev.rigs.find((r) => r.id === rigId);
      if (!target) return prev;
      const refund = Math.round(calculateRigBuildCost(target) * 0.55);
      soundFx.playCash();
      showBanner(`Salvaged ${target.name} for ${formatUsd(refund)}.`);
      return {
        ...prev,
        cash: prev.cash + refund,
        rigs: prev.rigs.filter((r) => r.id !== rigId),
      };
    });
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
    const newCost = calculateRigBuildCost(config);
    const facility = getFacility(state.facilityId);
    if (state.cash < newCost || state.rigs.length >= facility.maxRigs) {
      return false;
    }

    setState((prev) => {
      if (!prev) return prev;
      const cost = calculateRigBuildCost(config);
      const fac = getFacility(prev.facilityId);
      if (prev.cash < cost || prev.rigs.length >= fac.maxRigs) return prev;
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
        rigs: [...prev.rigs, newRig],
      };
    });
    return true;
  };

  const handleAddCoolingUnit = (type: RoomCoolingType): boolean => {
    const spec = ROOM_COOLING_UNITS.find((u) => u.id === type);
    if (!spec || !state) return false;
    const facIndex = FACILITY_TIERS.findIndex((f) => f.id === state.facilityId);
    const unlocked = state.devUnlockAll || facIndex >= spec.unlockFacilityIndex;
    if (!unlocked || state.cash < spec.cost) return false;

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
        role === 'TECHNICIAN'
          ? 'HARDWARE_CARE'
          : role === 'SYS_ENGINEER'
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
        employees: [
          ...prev.employees,
          {
            id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name,
            role,
            shift: 'DAY',
            priority: defaultPriority,
            morale: 90,
            hiredStep: prev.stepCount,
          },
        ],
      };
    });
    return true;
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
      };
    });
    return true;
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
            detail: `${c.direction === 'HYPE' ? 'Bullish coverage' : 'Critical rumors'} circulating across crypto media.`,
            category: 'PR' as const,
          },
          ...prev.news,
        ].slice(0, 60),
      };
    });
    return true;
  };

  // Contracts Handlers
  const handleAcceptContract = (contractId: string): boolean => {
    if (!state || state.activeContract) return false;
    const target = state.availableContracts.find((c) => c.id === contractId);
    if (!target) return false;
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
    return true;
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
      const fac = getFacility(state.facilityId);
      if (state.rigs.length >= fac.maxRigs) {
        return { ok: false, summary: `Facility full (${fac.maxRigs} max rigs).` };
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
          stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
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
              stats: { ...prev.stats, covertOpsCount: prev.stats.covertOpsCount + 1 },
            }
          : prev
      );
      return {
        ok: true,
        summary: `Flashed ${item.title} onto ${targetRig.name} for ${formatUsd(item.costUsd)} (+${item.heatGain} Heat).`,
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
    showBanner('Dev Override: Deed granted for all 4 facility tiers.');
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
    showBanner(forceRaid ? 'Dev Trigger: Inspector Raid initiated.' : 'Dev Trigger: Interactive Event started.');
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
    return <EducationLanding onOpenPortal={() => { soundFx.playClick(); setShowEduLanding(false); }} />;
  }

  if (!state || state.mode === 'TITLE_MENU') {
    const savedSummary = savedSnapshot
      ? `${formatStepLabel(savedSnapshot.stepCount)} · ${formatUsd(savedSnapshot.cash, true)}`
      : undefined;
    return (
      <TitleMenu
        hasSavedGame={Boolean(savedSnapshot)}
        savedSummary={savedSummary}
        onStartNew={handleStartNew}
        onResume={handleResume}
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
    { label: 'Market', cmd: 'market' },
    { label: 'Contracts', cmd: 'contracts' },
    { label: 'Covert Ops', cmd: 'ops' },
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
            Blockworks Tycoon
          </button>

          <nav className="flex items-center gap-6 overflow-x-auto">
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

          <TextGameTerminal
            state={state}
            commandTrigger={commandTrigger}
            onStepSteps={handleStepSteps}
            onResolveEvent={handleResolveEvent}
            onUnlockCoin={handleUnlockCoin}
            onDeployRig={handleDeployRig}
            onSalvageRig={handleSalvageRig}
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
            onRepasteRigs={handleRepasteRigs}
            onAddCoolingUnit={handleAddCoolingUnit}
            onToggleCoolingUnit={handleToggleCoolingUnit}
            onRemoveCoolingUnit={handleRemoveCoolingUnit}
            onSelectFacility={handleSelectFacility}
            onHireEmployee={handleHireEmployee}
            onFireEmployee={handleFireEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onStartResearch={handleStartResearch}
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
          />
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
