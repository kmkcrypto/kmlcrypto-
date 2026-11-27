import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepFabProduction } from '../src/engine/fab';
import {
  acquireTargetCompany,
  advanceOneStep,
  buildDefaultConglomerate,
  buildFabLine,
  completeExternalDesignContract,
  createNewGameState,
  designCustomComponentBlueprint,
  formatFabStatusReport,
  formatHardwareEngReport,
  formatManufacturingDivisionReport,
  fulfillInternalSupplyOrder,
  fulfillOemOrderFromInventory,
  fundBusinessTurnaround,
  getFabEngineeringPointBudget,
  getHardwareEngFabEffects,
  getLicensedBlueprintStepRoyaltyUsd,
  getManufacturingFabEffects,
  grantAllSixBusinessesForScenario,
  licenseBlueprintExternally,
  queueFabProduction,
  resolvePendingEvent,
  runCoolingPowerEngineeringTune,
  runManufacturingQcAudit,
  runPrototypeTest,
  sellCustomAsicsWholesale,
  startOemManufacturingContract,
  upgradeHardwareEngLab,
} from '../src/engine/simulation';
import { GameState } from '../src/types/game';

function stepMany(state: GameState, steps: number): GameState {
  let cur = state;
  const target = cur.stepCount + steps;
  while (cur.stepCount < target) {
    if (cur.pendingEvent) {
      cur = resolvePendingEvent(cur, cur.pendingEvent.options[0].key).nextState;
      continue;
    }
    cur = advanceOneStep(cur).nextState;
  }
  return cur;
}

describe('Conglomerate Phase 6 — Hardware Engineering & Manufacturing Division Loops', () => {
  it('1. Early-game fab caps & division gates remain completely preserved prior to owning B3 & B4', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE6_PRESERVE');
    const richEarly: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 25_000_000,
      unlockedResearch: ['res_wafer_lithography'],
    };

    // Neutral Fab Effects before owning HARDWARE_ENG & MANUFACTURING
    const engFxEarly = getHardwareEngFabEffects(richEarly);
    const mfgFxEarly = getManufacturingFabEffects(richEarly);
    assert.equal(engFxEarly.active, false);
    assert.equal(engFxEarly.extraEpBudget, 0);
    assert.equal(mfgFxEarly.active, false);
    assert.equal(mfgFxEarly.maxFabLines, 3);
    assert.equal(mfgFxEarly.maxBatchQty, 20);
    assert.equal(getFabEngineeringPointBudget(richEarly), 10);

    // buildFabLine still caps at 3 lines prior to MANUFACTURING acquisition
    let fabState = buildFabLine(richEarly).nextState;
    fabState = buildFabLine(fabState).nextState;
    fabState = buildFabLine(fabState).nextState;
    assert.equal(fabState.fab!.linesCount, 3);
    const line4Blocked = buildFabLine(fabState);
    assert.equal(line4Blocked.ok, false);

    // queueFabProduction still clamps qty to 20 prior to MANUFACTURING acquisition
    const bpRes = designCustomComponentBlueprint(fabState, {
      name: 'PreCorp-Core',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '7nm',
      focus: 'SHA256',
      engineering: { density: 3, efficiency: 3, thermals: 2, reliability: 2 },
      subFeature: 'STD',
      profile: 'BALANCED',
    });
    assert.equal(bpRes.ok, true, bpRes.summary);
    const qty25Clamped = queueFabProduction(bpRes.nextState, 0, 25);
    assert.equal(qty25Clamped.ok, true, qty25Clamped.summary);
    assert.equal(qty25Clamped.nextState.fab!.productionQueue[0].qty, 20);

    // Gating checks before ownership
    const blockedEng = licenseBlueprintExternally(bpRes.nextState, 0);
    assert.equal(blockedEng.ok, false);
    assert.match(blockedEng.summary, /not owned yet/i);

    const blockedMfg = startOemManufacturingContract(bpRes.nextState, 'compute', 4);
    assert.equal(blockedMfg.ok, false);
    assert.match(blockedMfg.summary, /not owned yet/i);

    // Gating checks while RECOVERING (bias affinity toward HARDWARE_ENG for deterministic Gen 5 lead offer)
    const congWithEngBias = buildDefaultConglomerate(bpRes.nextState, bpRes.nextState.conglomerate);
    const atGen5 = stepMany(
      {
        ...bpRes.nextState,
        unlockedResearch: ['res_wafer_lithography', 'res_gen5_exascale'],
        conglomerate: {
          ...congWithEngBias,
          affinity: {
            ...congWithEngBias.affinity,
            scores: { ...congWithEngBias.affinity.scores, HARDWARE_ENG: 500 },
          },
        },
      },
      1
    );
    const acqEng = acquireTargetCompany(atGen5, 'hardware_eng');
    assert.equal(acqEng.ok, true, acqEng.summary);
    const blockedRecover = licenseBlueprintExternally(acqEng.nextState, 0);
    assert.equal(blockedRecover.ok, false);
    assert.match(blockedRecover.summary, /RECOVERING/i);
  });

  it('2. Hardware Engineering (Business 3): external licensing royalties, R&D contracts, cooling/power tuning & fab perks', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE6_ENG');
    const congBase = buildDefaultConglomerate(base, base.conglomerate);
    const rich: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 30_000_000,
      unlockedResearch: ['res_wafer_lithography', 'res_gen5_exascale'],
      conglomerate: {
        ...congBase,
        affinity: {
          ...congBase.affinity,
          scores: { ...congBase.affinity.scores, HARDWARE_ENG: 500 },
        },
      },
    };
    const atGen5 = stepMany(rich, 1);
    const acq = acquireTargetCompany(atGen5, 'hardware_eng');
    assert.equal(acq.ok, true, acq.summary);
    const active = fundBusinessTurnaround(acq.nextState, 'hardware_eng').nextState;

    // Foundry EP & NRE perks immediately active (res_gen5_exascale gives +1, B3 gives +1 => 12)
    const fx1 = getHardwareEngFabEffects(active);
    assert.equal(fx1.active, true);
    assert.equal(fx1.extraEpBudget, 1);
    assert.ok(fx1.nreDiscountMult < 1);
    assert.equal(getFabEngineeringPointBudget(active), 12);

    // Build Fab Line #1 and design + validate blueprint -> logs NRE/proto expenses to HARDWARE_ENG ledger
    const withLine = buildFabLine(active).nextState;
    const bp = designCustomComponentBlueprint(withLine, {
      name: 'EngHelios-ASIC',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '7nm',
      focus: 'SHA256',
      engineering: { density: 3, efficiency: 3, thermals: 2, reliability: 2 },
      subFeature: 'STD',
      profile: 'PERF',
    });
    assert.equal(bp.ok, true, bp.summary);
    assert.ok(bp.nextState.conglomerate!.businesses.HARDWARE_ENG.ledger.totalExpenseUsd > 0);

    const proto = runPrototypeTest(bp.nextState, 0, 'PASSED');
    assert.equal(proto.ok, true, proto.summary);

    // 1. License blueprint externally -> upfront fee + duplicate guard + recurring royalty
    const lic = licenseBlueprintExternally(proto.nextState, 0);
    assert.equal(lic.ok, true, lic.summary);
    assert.ok(lic.nextState.cash > proto.nextState.cash);
    assert.equal(lic.nextState.conglomerate!.hardwareEng.licensedDesignsCount, 1);
    assert.ok(getLicensedBlueprintStepRoyaltyUsd(lic.nextState, lic.nextState.conglomerate!) > 0);

    const dup = licenseBlueprintExternally(lic.nextState, 0);
    assert.equal(dup.ok, false);
    assert.match(dup.summary, /already licensed/i);

    // 2. External R&D contract -> matching blueprint grants +28% bonus & RP; 4-step cooldown enforced
    const prevRp = lic.nextState.researchPoints;
    const contract1 = completeExternalDesignContract(lic.nextState, 'compute');
    assert.equal(contract1.ok, true, contract1.summary);
    assert.match(contract1.summary, /\+28%/);
    assert.ok(contract1.nextState.researchPoints > prevRp);
    const contractCooldown = completeExternalDesignContract(contract1.nextState, 'gpu');
    assert.equal(contractCooldown.ok, false);
    assert.match(contractCooldown.summary, /queue busy/i);

    // 3. Cooling/power R&D calibration + 3-step cooldown
    const tune = runCoolingPowerEngineeringTune(contract1.nextState);
    assert.equal(tune.ok, true, tune.summary);
    assert.equal(tune.nextState.conglomerate!.hardwareEng.coolingPowerEfficiencyBonusPct, 2);
    const tuneCooldown = runCoolingPowerEngineeringTune(tune.nextState);
    assert.equal(tuneCooldown.ok, false);

    // 4. Upgrade Hardware Engineering division to Lv 3 -> labTier 3 & +2 EP budget
    let upgraded = upgradeHardwareEngLab(tune.nextState);
    assert.equal(upgraded.ok, true, upgraded.summary);
    upgraded = upgradeHardwareEngLab(upgraded.nextState);
    assert.equal(upgraded.ok, true, upgraded.summary);
    assert.equal(upgraded.nextState.conglomerate!.hardwareEng.labTier, 3);
    assert.equal(getHardwareEngFabEffects(upgraded.nextState).extraEpBudget, 2);

    // Step forward -> recurring royalties logged & earned
    const revBefore = upgraded.nextState.conglomerate!.businesses.HARDWARE_ENG.ledger.totalRevenueUsd;
    const stepped = stepMany(upgraded.nextState, 2);
    assert.ok(
      stepped.conglomerate!.businesses.HARDWARE_ENG.ledger.totalRevenueUsd > revBefore,
      'Per-step IP royalties should credit HARDWARE_ENG ledger'
    );
  });

  it('3. Manufacturing (Business 4): lines 4-5, batch 40, QC audit, OEM contracts & non-inflationary internal supply', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE6_MFG');
    const congBase = buildDefaultConglomerate(base, base.conglomerate);
    const rich: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 40_000_000,
      unlockedResearch: ['res_wafer_lithography', 'res_gen5_exascale'],
      conglomerate: {
        ...congBase,
        affinity: {
          ...congBase.affinity,
          scores: { ...congBase.affinity.scores, MANUFACTURING: 500 },
        },
      },
    };
    const atGen5 = stepMany(rich, 1);
    const acq = acquireTargetCompany(atGen5, 'manufacturing');
    assert.equal(acq.ok, true, acq.summary);
    let active = fundBusinessTurnaround(acq.nextState, 'manufacturing').nextState;

    // Expanded fab caps: 4 lines at Lv 1, 5 lines at Lv 3+, batch up to 40
    // Buyout seeds 1 inherited line; building 3 more reaches 4 lines
    assert.equal(active.fab!.linesCount, 1);
    assert.equal(getManufacturingFabEffects(active).maxFabLines, 4);
    assert.equal(getManufacturingFabEffects(active).maxBatchQty, 40);

    for (let i = 0; i < 3; i++) {
      const b = buildFabLine(active);
      assert.equal(b.ok, true, b.summary);
      active = b.nextState;
    }
    assert.equal(active.fab!.linesCount, 4);

    // Line build expense should be logged into MANUFACTURING ledger
    assert.ok(active.conglomerate!.businesses.MANUFACTURING.ledger.totalExpenseUsd > 0);

    // QC calibration audit reduces defectRateMult & improves ISO QC score
    const prevDefect = active.conglomerate!.manufacturing.defectRateMult;
    const qc = runManufacturingQcAudit(active);
    assert.equal(qc.ok, true, qc.summary);
    assert.ok(qc.nextState.conglomerate!.manufacturing.defectRateMult < prevDefect);
    assert.equal(qc.nextState.conglomerate!.manufacturing.qcAuditScorePct, 86);

    // defectRateMult reduces scrapped units in stepFabProduction
    const withBp = designCustomComponentBlueprint(qc.nextState, {
      name: 'MfgBatch-Die',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '7nm',
      focus: 'SHA256',
      engineering: { density: 3, efficiency: 3, thermals: 2, reliability: 2 },
      subFeature: 'STD',
      profile: 'BALANCED',
    });
    assert.equal(withBp.ok, true, withBp.summary);
    const queued = queueFabProduction(withBp.nextState, 0, 24);
    assert.equal(queued.ok, true, queued.summary);

    const lowDefectOut = stepFabProduction(queued.nextState.fab, 5, 'S5', 'SCRAP', {
      defectRateMult: 0.45,
    });
    const baseDefectOut = stepFabProduction(queued.nextState.fab, 5, 'S5', 'SCRAP', {
      defectRateMult: 1.0,
    });
    assert.ok(lowDefectOut.nextFab.totalUnitsManufactured >= baseDefectOut.nextFab.totalUnitsManufactured);

    // Produce units cleanly for OEM inventory fulfillment & wholesale ledger attribution
    let curFab = queued.nextState.fab!;
    for (let s = 5; s <= 15 && curFab.productionQueue.length > 0; s += 1) {
      curFab = stepFabProduction(curFab, s, `S${s}`, 'PASS', {
        extraLines: 4,
        defectRateMult: qc.nextState.conglomerate!.manufacturing.defectRateMult,
      }).nextFab;
    }
    const invState: GameState = { ...queued.nextState, fab: curFab };
    const oemShip = fulfillOemOrderFromInventory(invState, 0);
    assert.equal(oemShip.ok, true, oemShip.summary);
    assert.ok(oemShip.nextState.cash > invState.cash);
    assert.ok(
      oemShip.nextState.fab!.serialRegistry!.some((sr) => sr.status === 'EXPORTED'),
      'Shipped serials must be marked EXPORTED'
    );

    const wholesaleShip = sellCustomAsicsWholesale(oemShip.nextState, 0, 2);
    assert.equal(wholesaleShip.ok, true, wholesaleShip.summary);

    // Start & complete external OEM contract across steps
    const oemStart = startOemManufacturingContract(wholesaleShip.nextState, 'gpu', 4);
    assert.equal(oemStart.ok, true, oemStart.summary);
    assert.equal(oemStart.nextState.conglomerate!.manufacturing.activeOemContracts!.length, 1);

    // Damage starter rig slightly, then run non-inflationary internal supply order -> MINING
    const bruised: GameState = {
      ...oemStart.nextState,
      rigs: oemStart.nextState.rigs.map((r, idx) =>
        idx === 0 ? { ...r, enabled: true, status: 'MINING', healthPct: 75, pasteStepsRemaining: 2 } : r
      ),
    };
    const cashBeforeSupply = bruised.cash;
    const supply = fulfillInternalSupplyOrder(bruised, 'mining');
    assert.equal(supply.ok, true, supply.summary);
    assert.ok(supply.nextState.cash < cashBeforeSupply, 'Internal supply spends materials rather than printing cash');
    assert.equal(supply.nextState.rigs[0].healthPct, 85);
    assert.equal(supply.nextState.rigs[0].pasteStepsRemaining, 7);
    assert.ok(supply.nextState.conglomerate!.businesses.MANUFACTURING.ledger.totalInternalCreditsUsd > 0);

    // Advance steps so active OEM contract finishes & pays out
    const revBeforeOem = supply.nextState.conglomerate!.businesses.MANUFACTURING.ledger.totalRevenueUsd;
    const afterOem = stepMany(supply.nextState, 6);
    assert.equal(afterOem.conglomerate!.manufacturing.activeOemContracts!.length, 0);
    assert.ok(afterOem.conglomerate!.manufacturing.oemContractsCompleted >= 2);
    assert.ok(afterOem.conglomerate!.businesses.MANUFACTURING.ledger.totalRevenueUsd > revBeforeOem);
  });

  it('4. Conglomerate RNG determinism & formatted Phase 6 status reports', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE6_DET');
    const scenario: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 100_000_000,
      unlockedResearch: ['res_wafer_lithography', 'res_gen5_exascale'],
      conglomerate: grantAllSixBusinessesForScenario(buildDefaultConglomerate(base, base.conglomerate), 0),
    };
    const withLine = buildFabLine(scenario).nextState;
    const bpRes = designCustomComponentBlueprint(withLine, {
      name: 'Det-Chip',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '7nm',
      focus: 'SHA256',
      engineering: { density: 3, efficiency: 3, thermals: 2, reliability: 2 },
      subFeature: 'STD',
      profile: 'BALANCED',
    });
    assert.equal(bpRes.ok, true, bpRes.summary);
    const b1 = licenseBlueprintExternally(bpRes.nextState, 0).nextState;

    const runA = stepMany(b1, 5);
    const runB = stepMany(b1, 5);
    assert.equal(runA.cash, runB.cash);
    assert.equal(runA.researchPoints, runB.researchPoints);
    assert.deepEqual(runA.conglomerate, runB.conglomerate);

    const engReport = formatHardwareEngReport(runA);
    assert.match(engReport, /BUSINESS 3 \/\/ HARDWARE ENGINEERING/);
    assert.match(engReport, /Licensed IP/);

    const mfgReport = formatManufacturingDivisionReport(runA);
    assert.match(mfgReport, /BUSINESS 4 \/\/ MANUFACTURING/);
    assert.match(mfgReport, /Max Fab Lines 4/);

    const fabReport = formatFabStatusReport(runA);
    assert.match(fabReport, /Corporate Divisions: HW Eng Lab/);
  });
});
