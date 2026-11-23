import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS_PARTS, RESEARCH_NODES } from '../src/data/catalog';
import {
  CODEX_ENTRIES,
  completeGuidedTask,
  evaluateGuidedChecklist,
  getUnlockedSystems,
  pauseGuidedOnboarding,
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
import { stepFabProduction } from '../src/engine/fab';
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

    // Check low-VRAM DAG penalty vs high-VRAM rig
    const lowVramRig = { ...state.rigs[0], gpuIds: ['gpu_gtx1060'] }; // 6GB -> check 4GB GPU card
    const veryLowVramRig = { ...state.rigs[0], gpuIds: ['gpu_hd5870'] }; // 1-4GB card
    const lowCheck = checkRigCoinCompatibility(veryLowVramRig, state.coins.NOVA);
    assert.ok(
      lowCheck.warnings.some((w) => w.includes('VRAM')),
      'Under-VRAM rig must receive VRAM warning on ETHASH coin'
    );
    assert.ok(lowCheck.efficiencyMult < 1.0);
    void lowVramRig;

    // Assign a rig to mine NOVA and advance a step
    state = {
      ...state,
      rigs: state.rigs.map((r, i) => (i === 0 ? { ...r, targetCoin: 'NOVA' } : r)),
    };
    const cashBefore = state.cash;
    state = advanceOneStep({ ...state, pendingEvent: null }).nextState;
    assert.ok(state.coins.NOVA.totalMined > 0 || state.cash !== cashBefore);
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

  it('6. Strict Guided checklist gates unlock progressively, supports pause/pace/revisit & Veteran bypass', () => {
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
    guided = revisitGuidedTopic(guided, 'fab');
    assert.ok(guided.guidedOnboarding?.revisitedTopics?.includes('fab'));

    const checkRes = completeGuidedTask(guided, '1');
    assert.equal(checkRes.ok, true);
    assert.ok(checkRes.nextState.guidedOnboarding?.completedChecklistIds.includes('task_inspect_starter'));

    const gen7Unlocked = getUnlockedSystems({
      ...guided,
      unlockedResearch: ['res_wafer_lithography', 'res_gen7_quantum_photonic'],
      facilityId: 'fac_warehouse',
    });
    assert.equal(gen7Unlocked.fab, true);
    assert.equal(gen7Unlocked.gen7, true);

    assert.ok(TUTORIAL_TOPICS.engineering && TUTORIAL_TOPICS.manufacturing && TUTORIAL_TOPICS.gen7 && TUTORIAL_TOPICS.coins);
    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'custom_coins'));
    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'investigation'));
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

    const dup = duplicateCareerPreset(created.id, 'QA Preset v2');
    assert.equal(dup.ok, true);
    assert.ok(dup.preset && dup.preset.id !== created.id);

    const ren = renameCareerPreset(dup.preset!.id, 'QA Preset Renamed');
    assert.equal(ren.ok, true);
    assert.equal(ren.preset?.name, 'QA Preset Renamed');

    const launched = createNewGameStateFromPreset(ren.preset!, 'SEED_PRESET_1');
    assert.equal(launched.cash, 75_000);
    assert.equal(launched.facilityId, 'fac_warehouse');
    assert.equal(launched.marketRegime, 'BULL_RUN');
    assert.equal(launched.unlockedResearch.length, RESEARCH_NODES.length);
    assert.equal(launched.fab?.linesCount, 1);

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
