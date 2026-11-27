import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS_PARTS, COMPUTE_PARTS, RESEARCH_NODES, RIG_PRESETS } from '../src/data/catalog';
import {
  CODEX_ENTRIES,
  CONTEXTUAL_GUIDES,
  completeGuidedTask,
  encounterGuidedLesson,
  evaluateGuidedChecklist,
  finishGuidedLesson,
  getActiveGuidedLesson,
  getUnlockedSystems,
  pauseGuidedOnboarding,
  recordGuidedProgress,
  revisitGuidedTopic,
  setGuidedPace,
  TUTORIAL_TOPICS,
} from '../src/data/onboarding';
import {
  advanceOneStep,
  buildDefaultFab,
  buildFabLine,
  checkRigCoinCompatibility,
  compareBlueprints,
  complyWithAudit,
  createNewGameState,
  createPlayerCoin,
  deleteDraftBlueprint,
  deployCustomInventoryToRig,
  designCustomChipBlueprint,
  designCustomComponentBlueprint,
  developShellCoin,
  executePreparedRaid,
  formatBlueprintComparisonReport,
  formatManufacturingHistoryReport,
  getEffectivePartBundle,
  inspectBatchReport,
  inspectSerialReport,
  payComplianceSettlement,
  prepareVaultRaid,
  previewCustomComponentDesign,
  queueFabProduction,
  reviseBlueprint,
  runPrototypeTest,
  saveDraftBlueprint,
  seedShellCoinLiquidity,
} from '../src/engine/simulation';
import { finishDevFabBatch, stepFabProduction } from '../src/engine/fab';
import { benchmarkRig, qualifyRig } from '../src/engine/optimization';
import {
  BUILT_IN_PRESETS,
  createNewGameStateFromPreset,
  deleteCareerPreset,
  duplicateCareerPreset,
  listCareerPresets,
  renameCareerPreset,
  saveCareerPreset,
} from '../src/engine/presets';
import { createScenarioState, SCENARIOS } from '../src/engine/scenarios';
import { CAREER_STORAGE_KEY, forkDevSession, getGameSaveKey, hydrateSavedState, serializeSaveEnvelope } from '../src/engine/saveSystem';
import { launchShellCoin, rugShellCoin, shillShellCoin } from '../src/engine/underground';
import type { GameState } from '../src/types/game';

function createFoundryReadyState(seed = 'EXP_TEST'): GameState {
  const base = createNewGameState('TYCOON_SANDBOX', false, seed, undefined, null, 'VETERAN');
  return {
    ...base,
    cash: 15_000_000,
    facilityId: 'fac_megafarm',
    ownedFacilityIds: [
      'fac_bedroom',
      'fac_garage',
      'fac_commercial',
      'fac_warehouse',
      'fac_industrial',
      'fac_megafarm',
    ],
    unlockedResearch: RESEARCH_NODES.map((n) => n.id),
    fab: { ...buildDefaultFab(base.fab), linesCount: 2 },
  };
}

describe('HASHRATE 13-Section Expansion Suite', () => {
  it('1. Advanced hardware preview, manufacturability scoring, drafts, revisions & comparison work', () => {
    let state = createFoundryReadyState('EXP_FAB_ADV');

    const aggressivePreview = previewCustomComponentDesign(state, {
      name: 'HotWireQPU',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: 'photonic',
      focus: 'QHASH',
      branch: 'QUANTUM',
      engineering: { density: 5, efficiency: 2, thermals: 2, reliability: 1 },
      componentParams: {
        branch: 'QUANTUM',
        layoutTopology: 'MESH_TENSOR',
        qubitTopology: 'TOPOLOGICAL_BRAID',
        logicalQubits: 1536,
        cryoTargetMk: 12,
        clockBiasPct: 118,
        voltageBiasPct: 115,
      },
      subFeature: 'STD',
      profile: 'PERF',
    });
    assert.equal(aggressivePreview.ok, true, aggressivePreview.reason);
    assert.ok(
      aggressivePreview.manufacturabilityPct < 80,
      'Aggressive MESH_TENSOR + extreme clocks/qubits should lower manufacturability %'
    );

    const safePreview = previewCustomComponentDesign(state, {
      name: 'SafePhoton',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: 'photonic',
      focus: 'QHASH',
      branch: 'PHOTONIC',
      engineering: { density: 3, efficiency: 3, thermals: 3, reliability: 5 },
      componentParams: {
        branch: 'PHOTONIC',
        layoutTopology: 'MONOLITHIC',
        wdmChannels: 16,
        clockBiasPct: 100,
        voltageBiasPct: 100,
      },
      subFeature: 'ECC_SHIELD',
      profile: 'BALANCED',
    });
    assert.equal(safePreview.ok, true, safePreview.reason);
    assert.ok(
      safePreview.manufacturabilityPct > aggressivePreview.manufacturabilityPct,
      'High reliability + ECC_SHIELD + stock clocks must yield higher manufacturability'
    );

    // Save draft, verify list, delete second draft
    const draft1 = saveDraftBlueprint(state, {
      name: 'DraftAlpha',
      partCategory: 'gpu',
      architecture: 'HBM_MONSTER',
      processNode: '3nm',
      focus: 'ETHASH',
      engineering: { density: 4, efficiency: 3, thermals: 3, reliability: 2 },
      subFeature: 'COPPER_BUS',
      profile: 'PERF',
    });
    assert.equal(draft1.ok, true, draft1.summary);
    state = draft1.nextState;
    assert.equal(state.fab?.draftBlueprints?.length, 1);

    const delDraft = deleteDraftBlueprint(state, 0);
    assert.equal(delDraft.ok, true);
    state = delDraft.nextState;
    assert.equal(state.fab?.draftBlueprints?.length, 0);

    // Tape out two blueprints, revise #1 -> Rev 2, compare #1 vs #2
    const bp1 = designCustomComponentBlueprint(state, {
      name: 'ApexCore',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '3nm',
      focus: 'SHA256',
      engineering: { density: 4, efficiency: 3, thermals: 2, reliability: 3 },
      subFeature: 'COPPER_BUS',
      profile: 'BALANCED',
    });
    assert.equal(bp1.ok, true, bp1.summary);
    state = bp1.nextState;

    const bp2 = designCustomComponentBlueprint(state, {
      name: 'EcoCore',
      partCategory: 'compute',
      architecture: 'CHIPLET_CPU',
      processNode: '5nm',
      focus: 'RANDOMX',
      engineering: { density: 2, efficiency: 4, thermals: 3, reliability: 3 },
      subFeature: 'ECC_SHIELD',
      profile: 'EFF',
    });
    assert.equal(bp2.ok, true, bp2.summary);
    state = bp2.nextState;

    const revRes = reviseBlueprint(state, 0, {
      profile: 'PERF',
      subFeature: 'ECC_SHIELD',
      revisionNote: 'Perf + ECC spin',
    });
    assert.equal(revRes.ok, true, revRes.summary);
    state = revRes.nextState;
    assert.equal(state.fab!.blueprints[0].revisionNumber, 2);
    assert.equal(state.fab!.blueprints[0].revisionHistory?.length, 2);

    const cmpText = compareBlueprints(state, 0, 1);
    assert.equal(cmpText, formatBlueprintComparisonReport(state, 0, 1));
    assert.ok(cmpText.includes('ApexCore') && cmpText.includes('EcoCore'));
    assert.ok(cmpText.includes('Rev 2'));
  });

  it('2. Prototype bench QA, tracked batch production, scrap reduction, serial registry & genealogy work', () => {
    let state = createFoundryReadyState('EXP_QA_BATCH');
    const bpRes = designCustomComponentBlueprint(state, {
      name: 'QaShaderGpu',
      partCategory: 'gpu',
      architecture: 'HBM_MONSTER',
      processNode: '2nm',
      focus: 'KAWPOW',
      engineering: { density: 4, efficiency: 3, thermals: 3, reliability: 4 },
      subFeature: 'ECC_SHIELD',
      profile: 'PERF',
    });
    assert.equal(bpRes.ok, true, bpRes.summary);
    state = bpRes.nextState;

    const protoRes = runPrototypeTest(state, 0);
    assert.equal(protoRes.ok, true, protoRes.summary);
    state = protoRes.nextState;
    const report = state.fab!.blueprints[0].prototypeReport;
    assert.ok(report, 'Prototype bench run must attach PrototypeTestReport');
    assert.equal(report!.runsCount, 1);
    assert.ok(report!.validatedScore >= 25 && report!.validatedScore <= 99);

    // Queue batch & run fab until complete
    const prodRes = queueFabProduction(state, 0, 3);
    assert.equal(prodRes.ok, true, prodRes.summary);
    state = prodRes.nextState;
    const expectedBatchId = state.fab!.productionQueue[0].batchId!;
    assert.match(expectedBatchId, /^BATCH-\d{4}$/);

    for (let step = 1; step <= 25; step++) {
      const stepped = stepFabProduction(state.fab, step, `Step ${step}`);
      state = { ...state, fab: stepped.nextFab };
      if ((state.fab?.productionQueue.length ?? 0) === 0) break;
    }
    assert.equal(state.fab!.productionQueue.length, 0);

    const batches = state.fab!.batchRecords ?? [];
    assert.equal(batches.length, 1);
    assert.equal(batches[0].batchId, expectedBatchId);
    assert.ok(batches[0].passedQty >= 1);
    assert.equal(batches[0].serialNumbers.length, batches[0].passedQty);

    const firstSerial = batches[0].serialNumbers[0];
    assert.match(firstSerial, /^HW-G5[SQP]-\d{4}$/);

    const batchReport = inspectBatchReport(state, '1');
    assert.ok(batchReport.includes(expectedBatchId) && batchReport.includes('QaShaderGpu'));

    const serialReport = inspectSerialReport(state, firstSerial);
    assert.ok(serialReport.includes(firstSerial) && serialReport.includes('IN_STOCK'));

    // Deploy unit from inventory and confirm serial status tracks INSTALLED + installedRigId
    const deployRes = deployCustomInventoryToRig(state, 0, 0);
    assert.equal(deployRes.ok, true, deployRes.summary);
    state = deployRes.nextState;
    const trackedSerial = (state.fab!.serialRegistry ?? []).find((s) => s.serialNumber === firstSerial);
    assert.equal(trackedSerial?.status, 'INSTALLED');
    assert.equal(trackedSerial?.installedRigId, state.rigs[0].id);

    const historyText = formatManufacturingHistoryReport(state);
    assert.ok(historyText.includes(expectedBatchId));
  });

  it('3. Gen-7 Quantum Cryo vs Photonic branches enforce distinct cooling/backplane compatibility', () => {
    const gen7State = createScenarioState('GEN7');
    assert.ok(gen7State.unlockedResearch.includes('res_gen7_dilution_cryo'));
    assert.ok(gen7State.unlockedResearch.includes('res_gen7_photonic_waveguides'));

    // Build explicit Quantum rig without Cryo cooling/chassis to trigger penalty
    const nonCryoQuantumRig = {
      ...gen7State.rigs[0],
      chassisId: 'chassis_asic_rack',
      computeId: 'qpu_quantum_qhash_core',
      gpuIds: [],
      coolingId: 'cool_delta_blowers',
    };
    const qbc = gen7State.coins.QBC;
    const uncooledCompat = checkRigCoinCompatibility(nonCryoQuantumRig, qbc);
    assert.ok(
      uncooledCompat.warnings.some((w) => w.includes('Cryo')),
      'Quantum QPU without Cryo cooling/chassis must warn'
    );
    assert.ok(uncooledCompat.efficiencyMult < 1.0, 'Missing Cryo cooling must penalize efficiency');

    // Now test Cryo-rated enclosure + Photonic backplane chassis compatibility
    const hybridCryoChassis = CHASSIS_PARTS.find((c) => c.supportsHybridAsicGpu && c.isCryoRated);
    const hybridOpticalChassis = CHASSIS_PARTS.find((c) => c.supportsHybridAsicGpu && c.isOpticalBackplane);
    assert.ok(hybridCryoChassis, 'Catalog must include Cryo Hybrid Converged chassis');
    assert.ok(hybridOpticalChassis, 'Catalog must include Optical Hybrid Converged chassis');

    const cryoMatchedCompat = checkRigCoinCompatibility(
      { ...nonCryoQuantumRig, chassisId: hybridCryoChassis!.id, coolingId: 'cool_quantum_dilution' },
      qbc
    );
    assert.equal(cryoMatchedCompat.compatible, true);
    assert.ok(
      cryoMatchedCompat.efficiencyMult > uncooledCompat.efficiencyMult,
      'Matching Cryo Hybrid chassis + He-3 dilution cooling must eliminate Cryo penalty'
    );

    const opticalRig = {
      ...gen7State.rigs[0],
      chassisId: hybridOpticalChassis!.id,
      computeId: 'asic_photonic_sha_core',
      gpuIds: [],
      coolingId: 'cool_quantum_dilution',
    };
    const opticalBundle = getEffectivePartBundle(opticalRig);
    assert.equal(opticalBundle.chassis.isOpticalBackplane, true);
    assert.equal(opticalBundle.compute.branch, 'PHOTONIC');
    const opticalCompat = checkRigCoinCompatibility(opticalRig, qbc);
    assert.equal(opticalCompat.compatible, true);
    assert.ok(!opticalCompat.warnings.some((w) => w.includes('optical backplane')));
  });

  it('4. Legitimate player-created mineable coins stay separate from shell coins & mine cleanly', () => {
    let state = createFoundryReadyState('EXP_COINS');
    // Seed an active underground shell coin first to test collision protection
    const shell = launchShellCoin(state, 'RUGX', 'Rug Pull Token');
    if (!shell.ok) throw new Error(shell.reason);
    state = shell.nextState;

    const collision = createPlayerCoin(state, {
      symbol: 'RUGX',
      name: 'Legit RugX',
      algorithm: 'SHA256',
      initialLiquidityUsd: 10_000,
    });
    assert.equal(collision.ok, false, 'Player mainnet coin ticker must not collide with shell coin ticker');

    const launchRes = createPlayerCoin(state, {
      symbol: 'NOVA',
      name: 'Nova Chain',
      algorithm: 'ETHASH',
      initialLiquidityUsd: 25_000,
      halvingEverySteps: 60,
      creatorFeePct: 2.0,
      minVramGb: 6,
      preferredBranch: 'SILICON',
    });
    assert.equal(launchRes.ok, true, launchRes.summary);
    state = launchRes.nextState;
    assert.ok(state.coins.NOVA, 'Custom coin must be listed in state.coins');
    assert.equal(state.coins.NOVA.isPlayerCreated, true);
    assert.equal(state.coins.NOVA.creatorMeta?.creatorFeePct, 2.0);
    assert.ok(
      !(state.underground.shellCoins ?? []).some((s) => s.ticker === 'NOVA'),
      'Legitimate coin must never enter underground.shellCoins'
    );

    const lowVramRig = { ...state.rigs[0], chassisId: 'chassis_open_frame', gpuIds: ['gpu_r9_290x', 'gpu_r9_290x', 'gpu_r9_290x'] };
    const lowCheck = checkRigCoinCompatibility(lowVramRig, state.coins.NOVA);
    assert.ok(
      lowCheck.warnings.some((w) => w.includes('VRAM')),
      'Under-VRAM rig must receive VRAM warning on ETHASH coin'
    );
    assert.equal(lowCheck.efficiencyMult, 0.55);
    const headroom = checkRigCoinCompatibility({ ...lowVramRig, gpuIds: ['gpu_gtx1060'] }, state.coins.NOVA);
    const mixed = checkRigCoinCompatibility({ ...lowVramRig, gpuIds: ['gpu_gtx1060', 'gpu_r9_290x'] }, state.coins.NOVA);
    assert.ok(lowCheck.efficiencyMult < mixed.efficiencyMult && mixed.efficiencyMult < headroom.efficiencyMult);

    // Assign a rig to mine NOVA and advance a step
    state = {
      ...state,
      rigs: state.rigs.map((r, i) => (i === 0 ? { ...r, targetCoin: 'NOVA', gpuIds: ['gpu_gtx1060'] } : r)),
    };
    state = advanceOneStep({ ...state, pendingEvent: null }).nextState;
    assert.ok(state.coins.NOVA.totalMined > 0);
  });

  it('5. Staged shell-coin lifecycle, 2-phase Vault Raids, investigation escalation & compliance recovery work', () => {
    let state = createNewGameState('STANDARD', false, 'EXP_UG', undefined, null, 'VETERAN');
    state = { ...state, cash: 80_000, stepCount: 12 };

    // Staged shell coin: dev -> seed(spoof) -> launch -> shill -> rug
    const devRes = developShellCoin(state, 'SCAM', 'ScamFi');
    if (!devRes.ok) throw new Error(devRes.reason);
    state = devRes.nextState;
    assert.equal(state.underground.shellCoins?.[0].stage, 'CONCEPT');

    const seedRes = seedShellCoinLiquidity(state, 'SCAM', 3000, true);
    if (!seedRes.ok) throw new Error(seedRes.reason);
    state = seedRes.nextState;
    assert.equal(state.underground.shellCoins?.[0].stage, 'SEEDED');
    assert.equal(state.underground.shellCoins?.[0].auditSpoofed, true);

    const launchRes = launchShellCoin(state, 'SCAM', 'ScamFi');
    if (!launchRes.ok) throw new Error(launchRes.reason);
    state = launchRes.nextState;
    assert.equal(state.underground.shellCoins?.[0].stage, 'ACTIVE');

    const shillRes = shillShellCoin(state, 'SCAM');
    if (!shillRes.ok) throw new Error(shillRes.reason);
    state = shillRes.nextState;

    const rugRes = rugShellCoin(state, 'SCAM');
    if (!rugRes.ok) throw new Error(rugRes.reason);
    state = rugRes.nextState;
    assert.equal(state.underground.shellCoins?.[0].stage, 'RUGGED');
    assert.ok((state.underground.operationRecords?.length ?? 0) >= 5);

    // 2-phase Vault Raid: prep -> exec
    const prepRes = prepareVaultRaid(state, state.rivals[0].id);
    if (!prepRes.ok) throw new Error(prepRes.reason);
    state = prepRes.nextState;
    assert.ok(state.underground.preparedRaid, 'Prepared raid dossier must be stored');

    const execRes = executePreparedRaid(state, 'STEALTH_SIPHON', 3000);
    if (!execRes.ok) throw new Error(execRes.reason);
    state = execRes.nextState;
    assert.equal(state.underground.preparedRaid, null, 'Executing prepared raid consumes dossier');
    assert.ok(state.underground.raidCooldownStep! > state.stepCount);

    // Investigation ladder escalation -> comply & settle recovery
    state = {
      ...state,
      regulatoryScrutiny: 88,
      underground: {
        ...state.underground,
        investigationStage: 'NONE',
        suspiciousActivityScore: 75,
        powerSiphonActive: true,
      },
    };
    state = advanceOneStep({ ...state, pendingEvent: null }).nextState;
    assert.equal(state.underground.investigationStage, 'WATCHLIST');

    state = { ...state, regulatoryScrutiny: 88 };
    state = advanceOneStep({ ...state, pendingEvent: null }).nextState;
    assert.equal(state.underground.investigationStage, 'FORMAL_AUDIT');

    const complyRes = complyWithAudit(state);
    if (!complyRes.ok) throw new Error(complyRes.reason);
    state = complyRes.nextState;
    assert.equal(state.underground.powerSiphonActive, false);
    assert.equal(state.underground.investigationStage, 'PROBATION');

    const settleRes = payComplianceSettlement({
      ...state,
      underground: { ...state.underground, investigationStage: 'SANCTIONED' },
    });
    if (!settleRes.ok) throw new Error(settleRes.reason);
    assert.equal(settleRes.nextState.underground.investigationStage, 'PROBATION');
  });

  it('6. Guided unlocks require earned business milestones and survive save hydration', () => {
    let guided = createNewGameState('STANDARD', false, 'EXP_GUIDE', undefined, null, 'GUIDED');
    const initialLocks = getUnlockedSystems(guided);
    assert.equal(initialLocks.contracts, false);
    assert.equal(initialLocks.fab, false);
    assert.equal(initialLocks.coins, false);
    assert.equal(initialLocks.gen7, false);

    const cl0 = evaluateGuidedChecklist(guided);
    assert.equal(cl0.mode, 'GUIDED');
    assert.equal(cl0.currentStageIdx, 0);

    guided = pauseGuidedOnboarding(guided, true);
    assert.equal(evaluateGuidedChecklist(guided).paused, true);
    guided = setGuidedPace(guided, 'SLOW');
    assert.equal(evaluateGuidedChecklist(guided).pace, 'SLOW');
    guided = revisitGuidedTopic(guided, 'engineering');
    assert.ok(guided.guidedOnboarding?.revisitedTopics?.includes('engineering'));

    const checkRes = completeGuidedTask(guided, '1');
    assert.equal(checkRes.ok, false);
    const legacy = hydrateSavedState({
      ...guided,
      guidedOnboarding: {
        ...guided.guidedOnboarding,
        completedChecklistIds: ['task_first_steps', 'task_facility_or_cash', 'task_check_rivals', 'task_wafer_rd'],
      },
    })!;
    assert.deepEqual(getUnlockedSystems(legacy), getUnlockedSystems(guided));

    for (let i = 0; i < 20; i++) {
      guided = advanceOneStep({ ...guided, pendingEvent: null }).nextState;
    }
    assert.equal(guided.stepCount, 20);
    assert.deepEqual(getUnlockedSystems(guided), initialLocks);
    guided = recordGuidedProgress({ ...guided, seenTutorials: ['inspected_rig'] });
    assert.equal(getUnlockedSystems(guided).contracts, true);
    assert.equal(completeGuidedTask(guided, '1').ok, true);
    assert.equal(getUnlockedSystems(guided).staff, false);

    guided = recordGuidedProgress({
      ...guided,
      stepCount: 23,
      facilityId: 'fac_garage',
      unlockedResearch: ['res_gpu_kernel'],
      stats: { ...guided.stats, rigPurchasesCount: 1, contractsCompleted: 1 },
    });
    assert.equal(getUnlockedSystems(guided).staff, true);
    assert.equal(getUnlockedSystems(guided).rivals, false);
    guided = { ...guided, stepCount: 25 };
    assert.equal(getUnlockedSystems(guided).rivals, true);
    assert.equal(getUnlockedSystems(guided).pr, false);
    const profitableCycle = {
      cycleNumber: 1,
      label: 'Cycle 1',
      facilityId: 'fac_commercial',
      miningRevenueUsd: 2_000,
      electricityCostUsd: 100,
      rentCostUsd: 460,
      payrollCostUsd: 0,
      maintenanceCostUsd: 100,
      otherSpendUsd: 2_500,
      netCashflowUsd: -1_160,
    };
    guided = { ...guided, stepCount: 30, facilityId: 'fac_commercial', ledger: [profitableCycle] };
    assert.equal(getUnlockedSystems(guided).exchange, false);
    const eco = { ...guided.rigs[0], firmwareProfile: 'ECO' as const };
    guided = { ...guided, rigs: [eco] };
    assert.equal(qualifyRig(guided, eco, 'output', 'balanced').ok, false);
    const qualified = qualifyRig(guided, eco, 'efficiency', 'balanced');
    assert.equal(qualified.ok, true, qualified.summary);
    guided = recordGuidedProgress(qualified.nextState);
    assert.equal(getUnlockedSystems(guided).exchange, false);
    assert.equal(getUnlockedSystems(guided).coinUnlocks, true);
    guided = { ...guided, stepCount: 32 };
    assert.equal(getUnlockedSystems(guided).exchange, true);
    assert.equal(getUnlockedSystems(guided).coinUnlocks, true);
    assert.equal(getUnlockedSystems(guided).coins, false);
    assert.equal(getUnlockedSystems(guided).ops, false);

    guided = { ...guided, ledger: [profitableCycle, { ...profitableCycle, cycleNumber: 2, facilityId: 'fac_garage' }] };
    assert.equal(getUnlockedSystems(guided).ops, false);
    guided = recordGuidedProgress({ ...guided, stepCount: 60, ledger: [profitableCycle, { ...profitableCycle, cycleNumber: 2 }] });
    assert.equal(getUnlockedSystems(guided).ops, false);
    guided = { ...guided, stepCount: 62 };
    assert.equal(getUnlockedSystems(guided).ops, true);
    assert.equal(getUnlockedSystems(guided).coins, true);
    assert.equal(getUnlockedSystems(guided).fab, false);

    guided = {
      ...guided,
      stepCount: 66,
      facilityId: 'fac_warehouse',
    };
    assert.equal(getUnlockedSystems(guided).fab, false);
    guided = {
      ...guided,
      unlockedResearch: [...guided.unlockedResearch, 'res_wafer_lithography', 'res_gen7_quantum_photonic'],
    };
    assert.equal(getUnlockedSystems(guided).fab, true);
    assert.equal(getUnlockedSystems(guided).gen7, false);
    guided = recordGuidedProgress({
      ...guided,
      fab: { ...buildDefaultFab(guided.fab), totalUnitsManufactured: 1 },
    });
    assert.equal(getUnlockedSystems(guided).gen7, false);
    guided = { ...guided, stepCount: 68 };
    assert.equal(getUnlockedSystems(guided).gen7, true);
    const moved = hydrateSavedState({ ...guided, facilityId: 'fac_bedroom', ledger: [] })!;
    assert.equal(getUnlockedSystems(moved).gen7, true);
    assert.deepEqual(moved.rigQualifications, guided.rigQualifications);
    assert.equal(evaluateGuidedChecklist(guided).stages.at(-1)?.completed, false);
    assert.equal(getUnlockedSystems({ ...legacy, devMode: true }).fab, false);
    assert.equal(getUnlockedSystems({ ...legacy, onboardingMode: 'VETERAN' }).fab, true);

    for (const guide of Object.values(CONTEXTUAL_GUIDES)) {
      assert.ok(Object.hasOwn(TUTORIAL_TOPICS, guide.topic));
    }
    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'custom_coins'));
    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'investigation'));
  });

  it('Guided lessons wait for first use, pause and resume, and open at the selected pace', () => {
    const dev = createScenarioState('GUIDED_ONBOARDING');
    assert.equal(evaluateGuidedChecklist(dev).mode, 'GUIDED');
    assert.equal(getUnlockedSystems(dev).rivals, false);
    let state = recordGuidedProgress({ ...dev, facilityId: 'fac_garage', stepCount: 30,
      unlockedResearch: ['res_gpu_kernel'], stats: { ...dev.stats, contractsCompleted: 1, rigPurchasesCount: 1 } });
    state = { ...state, stepCount: 35 };
    assert.equal(getActiveGuidedLesson(state), undefined);
    state = pauseGuidedOnboarding(setGuidedPace(state, 'SLOW'), true);
    state = encounterGuidedLesson(encounterGuidedLesson(state, 'contracts'), 'staff');
    assert.equal(state.guidedOnboarding?.systemStatuses.staff, 'ENCOUNTERED');
    assert.equal(getActiveGuidedLesson(state), undefined);
    state = recordGuidedProgress(pauseGuidedOnboarding(state, false));
    assert.equal(getActiveGuidedLesson(state), 'contracts');
    state = finishGuidedLesson(state);
    assert.equal(state.guidedOnboarding?.systemStatuses.contracts, 'LEARNED');
    assert.equal(getActiveGuidedLesson(recordGuidedProgress({ ...state, stepCount: 38 })), undefined);
    assert.equal(getActiveGuidedLesson(hydrateSavedState({ ...state, stepCount: 39 })!), 'staff');
    assert.equal(getActiveGuidedLesson(recordGuidedProgress(setGuidedPace(state, 'FAST'))), 'staff');
  });

  it('Dev runs and forks never target a saved-game slot and can force prototype and batch outcomes', () => {
    const career = createNewGameState('STANDARD', false, 'DEV_ISOLATION');
    const titleDev = createNewGameState('TYCOON_SANDBOX', true, 'DEV_ISOLATION');
    const fork = forkDevSession(career);
    fork.rigs[0].name = 'Temporary change';
    assert.notEqual(career.rigs[0].name, fork.rigs[0].name);
    assert.equal(getGameSaveKey(career), CAREER_STORAGE_KEY);
    for (const session of [titleDev, fork, createScenarioState('MANUFACTURING'), { ...fork, devMode: false }]) {
      assert.equal(getGameSaveKey(session), null);
      assert.equal(getGameSaveKey(hydrateSavedState(JSON.parse(serializeSaveEnvelope(session)))!), null);
    }
    const fab = createScenarioState('MANUFACTURING');
    const design = designCustomChipBlueprint(fab, 'DevQA', 'SHA256', '7nm');
    assert.equal(design.ok, true, design.summary);
    const proto = runPrototypeTest(design.nextState, 0, 'FAILED_FLAW');
    assert.equal(proto.nextState.fab?.blueprints[0].prototypeReport?.status, 'FAILED_FLAW');
    const order = queueFabProduction(proto.nextState, 0, 1);
    const scrap = finishDevFabBatch(order.nextState, 'SCRAP');
    assert.equal(scrap.ok, true, scrap.summary);
    assert.equal(scrap.nextState.fab?.batchRecords?.[0].passedQty, 0);
    assert.equal(scrap.nextState.fab?.batchRecords?.[0].qcScore, 0);
    assert.equal(scrap.nextState.fab?.inventory.length, 0);
  });

  it('Photonic cards lose coupling in legacy frames and FAB rejects a GPU-only frame on a stock ASIC', () => {
    const lab = createScenarioState('QUANTUM_PHOTONIC');
    const rig = { ...lab.rigs[0], ...RIG_PRESETS[0].config, gpuIds: ['gpu_photonic_qgpu'] };
    const legacy = checkRigCoinCompatibility(rig, lab.coins.ETH);
    const optical = checkRigCoinCompatibility({ ...rig, chassisId: 'chassis_photonic_gpu_matrix' }, lab.coins.ETH);
    assert.match(legacy.warnings.join(' '), /optical backplane/);
    assert.ok(legacy.efficiencyMult < optical.efficiencyMult);
    const frame = designCustomComponentBlueprint(lab, { name: 'GPU frame', processNode: '7nm',
      architecture: 'OPEN_GPU_FRAME', partCategory: 'chassis', focus: 'GPU_6' });
    const batch = finishDevFabBatch(queueFabProduction(frame.nextState, 0, 1).nextState, 'PASS');
    assert.equal(batch.ok, true, batch.summary);
    assert.equal(batch.nextState.fab?.batchRecords?.[0].qcScore, 100);
    const state = { ...batch.nextState, rigs: [{ ...lab.rigs[0], ...BUILT_IN_PRESETS[2].starterRigConfig }] };
    const deploy = deployCustomInventoryToRig(state, 0, 0);
    assert.equal(deploy.ok, false);
    assert.match(deploy.summary, /cannot seat an ASIC/);
    assert.equal(deploy.nextState, state);
  });

  it('Career contracts pay only for quiet mining or consecutive operation at the new site', () => {
    const career = createNewGameState('STANDARD', false, 'HOME_JOBS');
    const quiet = career.availableContracts.find((offer) => offer.title === 'Quiet Hours')!;
    const commission = career.availableContracts.find((offer) => offer.targetFleetSize === 2)!;
    const tick = (state: GameState) => advanceOneStep({ ...state, pendingEvent: null }).nextState;
    const stock = tick({ ...career, activeContract: quiet });
    assert.equal(stock.activeContract?.progress, 0);
    const eco = { ...career.rigs[0], firmwareProfile: 'ECO' as const };
    let tuned = { ...career, rigs: [eco], activeContract: quiet } as GameState;
    for (let i = 0; i < quiet.targetAmount; i++) tuned = tick(tuned);
    assert.equal(tuned.stats.totalContractIncomeUsd, quiet.rewardCash);
    assert.ok(tuned.availableContracts.some((offer) => offer.title.includes('Delivery Sprint')));

    const secondRig = { ...eco, id: 'rig_two', gridX: eco.gridX + 1 };
    const home = tick({ ...career, rigs: [eco, secondRig], activeContract: commission });
    assert.equal(home.activeContract?.progress, 0);
    const first = tick({ ...home, facilityId: 'fac_garage' });
    assert.equal(first.activeContract?.progress, 1);
    const interrupted = tick({ ...first, rigs: [first.rigs[0], { ...first.rigs[1], enabled: false }] });
    assert.equal(interrupted.activeContract?.progress, 0);
    let commissioned: GameState = { ...interrupted, rigs: [interrupted.rigs[0], { ...interrupted.rigs[1], enabled: true }] };
    for (let i = 0; i < commission.targetAmount; i++) commissioned = tick(commissioned);
    assert.equal(commissioned.stats.totalContractIncomeUsd, commission.rewardCash);
    assert.equal(commissioned.stats.highestCommissionedFacilityIndex, 1);
    assert.ok(commissioned.availableContracts.some((offer) => offer.targetFacilityIndex === 2));
    const returned = tick({ ...commissioned, facilityId: 'fac_bedroom', availableContracts: [] });
    assert.ok(returned.availableContracts.every((offer) => offer.targetFacilityIndex !== 1));
  });

  it('a manufactured part can qualify against stock and late profiles specialize in different constraints', () => {
    const base = createFoundryReadyState('PROFILE_TRADEOFFS');
    const rig = { ...base.rigs[0], ...RIG_PRESETS[2].config };
    let state = { ...base, rigs: [rig] };
    assert.equal(qualifyRig(state, rig, 'output', 'stock').ok, false);

    const designed = designCustomChipBlueprint(state, 'FirstChip', 'SHA256', '7nm', 'EFF');
    assert.equal(designed.ok, true, designed.summary);
    const prototype = runPrototypeTest(designed.nextState, 0);
    assert.equal(prototype.ok, true, prototype.summary);
    const ordered = queueFabProduction(prototype.nextState, 0, 1);
    assert.equal(ordered.ok, true, ordered.summary);
    state = ordered.nextState;
    for (let i = 0; i < 10 && !state.fab?.inventory.length; i++) {
      state = advanceOneStep({ ...state, pendingEvent: null }).nextState;
    }
    const deployed = deployCustomInventoryToRig(state, 0, 0);
    assert.equal(deployed.ok, true, deployed.summary);
    const customRig = deployed.nextState.rigs[0];
    const benchmark = benchmarkRig(deployed.nextState, customRig, 'stock');
    assert.deepEqual(benchmark.issues, []);
    assert.ok(benchmark.qualified.output || benchmark.qualified.efficiency);
    const goal = benchmark.qualified.output ? 'output' : 'efficiency';
    const certificate = qualifyRig(deployed.nextState, customRig, goal, 'stock');
    assert.equal(certificate.ok, true, certificate.summary);
    assert.equal(certificate.nextState.rigQualifications?.[0].reference, 'stock');

    const preview = (profile: 'PERF' | 'BALANCED' | 'EFF' | 'COMPACT') => previewCustomComponentDesign(base, {
      name: 'OpticalSHA', partCategory: 'compute', architecture: 'ASIC_BLADE', processNode: 'photonic', focus: 'SHA256',
      engineering: { density: 4, efficiency: 4, thermals: 4, reliability: 2 }, profile,
    });
    const perf = preview('PERF');
    const balanced = preview('BALANCED');
    const efficiency = preview('EFF');
    const compact = preview('COMPACT');
    assert.ok([perf, balanced, efficiency, compact].every((design) => design.ok));
    assert.ok(perf.primaryHashRate > Math.max(...COMPUTE_PARTS.map((part) => part.hashrates.SHA256 ?? 0)));
    assert.ok(perf.primaryHashRate > efficiency.primaryHashRate);
    assert.ok(efficiency.primaryHashRate / efficiency.primaryWatts > perf.primaryHashRate / perf.primaryWatts);
    assert.ok(compact.primaryHeatC < efficiency.primaryHeatC);
    assert.ok(balanced.spec.unitCostUsd < compact.spec.unitCostUsd);

    const flagship = {
      ...base.rigs[0], ...RIG_PRESETS[6].config,
      computeId: 'asic_photonic_sha_core', targetCoin: 'BTC' as const, gpuIds: [],
    };
    const optical = designCustomComponentBlueprint({ ...base, rigs: [flagship] }, {
      name: 'OpticalSHA', partCategory: 'compute', architecture: 'ASIC_BLADE', processNode: 'photonic', focus: 'SHA256',
      engineering: { density: 4, efficiency: 4, thermals: 4, reliability: 2 }, profile: 'EFF',
    });
    assert.equal(optical.ok, true, optical.summary);
    const opticalOrder = queueFabProduction(optical.nextState, 0, 1);
    assert.equal(opticalOrder.ok, true, opticalOrder.summary);
    let opticalFab = opticalOrder.nextState.fab!;
    for (let step = 1; step <= 20 && opticalFab.productionQueue.length; step++) {
      opticalFab = stepFabProduction(opticalFab, step, `Day ${step + 1}`).nextFab;
    }
    const opticalDeploy = deployCustomInventoryToRig({ ...opticalOrder.nextState, fab: opticalFab }, 0, 0);
    assert.equal(opticalDeploy.ok, true, opticalDeploy.summary);
    const opticalRig = opticalDeploy.nextState.rigs[0];
    const flagshipTest = benchmarkRig(opticalDeploy.nextState, opticalRig, 'stock');
    assert.deepEqual(flagshipTest.issues, []);
    assert.ok(flagshipTest.powerRatio < 1);
    assert.ok(flagshipTest.qualified.efficiency);
  });

  it('7. Career Presets CRUD (save, duplicate, rename, delete) and preset game bootstrap work cleanly', () => {
    assert.ok(BUILT_IN_PRESETS.length >= 3);
    const created = saveCareerPreset({
      name: 'QA Test Preset',
      description: 'Verification preset',
      includeCash: true,
      startingCash: 75_000,
      difficulty: 'STANDARD',
      onboardingMode: 'VETERAN',
      includeFacility: true,
      startingFacilityId: 'fac_warehouse',
      powerContractId: 'contract_highcap',
      includeMarketRules: true,
      marketRegime: 'BULL_RUN',
      operatingCostMult: 1.0,
      unlockAllCoins: true,
      unlockAllResearch: true,
      includeStarterRig: true,
      starterRigConfig: BUILT_IN_PRESETS[2].starterRigConfig,
    });
    assert.ok(listCareerPresets().some((p) => p.id === created.id));
    const edited = saveCareerPreset({ ...created, startingCash: 82_000, startingFacilityOwned: false,
      starterRigConfig: { ...created.starterRigConfig, firmwareProfile: 'ECO' } });
    assert.equal(edited.createdAt, created.createdAt);
    assert.equal(listCareerPresets().filter((p) => p.id === created.id).length, 1);

    const dup = duplicateCareerPreset(created.id, 'QA Preset v2');
    assert.equal(dup.ok, true);
    assert.ok(dup.preset && dup.preset.id !== created.id);

    const ren = renameCareerPreset(dup.preset!.id, 'QA Preset Renamed');
    assert.equal(ren.ok, true);
    assert.equal(ren.preset?.name, 'QA Preset Renamed');

    const launched = createNewGameStateFromPreset(ren.preset!, 'SEED_PRESET_1');
    assert.equal(launched.cash, 82_000);
    assert.equal(launched.facilityId, 'fac_warehouse');
    assert.equal(launched.ownedFacilityIds.includes('fac_warehouse'), false);
    assert.equal(launched.rigs[0].firmwareProfile, 'ECO');
    assert.equal(launched.marketRegime, 'BULL_RUN');
    assert.equal(launched.unlockedResearch.length, RESEARCH_NODES.length);
    assert.equal(launched.fab?.linesCount, 1);
    const wildcat = createNewGameStateFromPreset(BUILT_IN_PRESETS[1], 'WILDCAT_RENT');
    assert.equal(wildcat.onboardingMode, 'VETERAN');
    assert.equal(wildcat.ownedFacilityIds.includes('fac_garage'), false);
    assert.ok(advanceOneStep(wildcat).nextState.rigs[0].lastStepCoins > 0);

    const del1 = deleteCareerPreset(created.id);
    const del2 = deleteCareerPreset(dup.preset!.id);
    assert.equal(del1.ok, true);
    assert.equal(del2.ok, true);
    assert.equal(listCareerPresets().some((p) => p.id === created.id), false);

    // Confirm existing scenarios still launch cleanly
    assert.ok(SCENARIOS.length >= 6);
    const s = createScenarioState('MANUFACTURING');
    assert.ok((s.fab?.linesCount ?? 0) >= 1);

    // Quick check buildFabLine to line 3 stays capped cleanly
    const fReady = createFoundryReadyState('EXP_LINE_CAP');
    const l3 = buildFabLine(fReady);
    assert.equal(l3.ok, true);
    const l4 = buildFabLine(l3.nextState);
    assert.equal(l4.ok, false);
  });
});
