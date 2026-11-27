import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireTargetCompany,
  advanceOneStep,
  BILLING_CYCLE_STEPS,
  buildDefaultConglomerate,
  buildFabLine,
  calculateRigBuildCost,
  computeCompanyValuation,
  computeValuationBreakdown,
  createNewGameState,
  designCustomChipBlueprint,
  establishCorporateHQ,
  formatCorporateHQReport,
  formatDivisionLedgerReport,
  formatSynergiesReport,
  fundBusinessTurnaround,
  getCorporateSynergyEffects,
  getSpotExchangeFeePct,
  grantAllSixBusinessesForScenario,
  HQ_ESTABLISH_COST_USD,
  HQ_LEVEL_SPECS,
  renameCorporateHQ,
  resolvePendingEvent,
  toggleSynergyPolicy,
  upgradeBusinessDivision,
  upgradeCorporateHQ,
} from '../src/engine/simulation';
import { CHASSIS_PARTS, COMPUTE_PARTS, COOLING_PARTS, OS_PARTS, PSU_PARTS, STORAGE_PARTS } from '../src/data/catalog';
import { GameState, RigBuildConfig } from '../src/types/game';

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

describe('Conglomerate Phase 4 — Corporate HQ, Division Upgrades & Inter-Business Synergies', () => {
  it('1. Enforces HQ establishment prerequisites, Lv 1..5 governance progression & rename', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE4_HQ_RULES');
    const richBase: GameState = {
      ...base,
      cash: 12_000_000,
    };

    // Career mode with only 1 business cannot incorporate HQ
    const earlyAttempt = establishCorporateHQ(richBase, 'Apex Crypto Holdings');
    assert.equal(earlyAttempt.ok, false);
    assert.match(earlyAttempt.summary, /at least 2 businesses/i);

    // Trigger Gen 5 and buy Market Intel -> 2 businesses owned
    const gen5State: GameState = {
      ...richBase,
      unlockedResearch: ['res_gen5_exascale'],
      conglomerate: buildDefaultConglomerate({
        ...richBase,
        unlockedResearch: ['res_gen5_exascale'],
      }),
    };
    const steppedGen5 = stepMany(gen5State, 1);
    const acq = acquireTargetCompany(steppedGen5, '1');
    assert.equal(acq.ok, true, acq.summary);

    const est = establishCorporateHQ(acq.nextState, 'Obsidian Apex Corp');
    assert.equal(est.ok, true, est.summary);
    assert.equal(est.nextState.cash, acq.nextState.cash - HQ_ESTABLISH_COST_USD);
    assert.equal(est.nextState.conglomerate?.hq.established, true);
    assert.equal(est.nextState.conglomerate?.hq.hqLevel, 1);
    assert.equal(est.nextState.conglomerate?.hq.companyName, 'Obsidian Apex Corp');

    // Rename HQ
    const renamed = renameCorporateHQ(est.nextState, 'Titan Hash Holdings');
    assert.equal(renamed.ok, true);
    assert.equal(renamed.nextState.conglomerate?.hq.companyName, 'Titan Hash Holdings');

    // Lv 2 requires only 2 owned businesses -> succeeds
    const upg2 = upgradeCorporateHQ(renamed.nextState);
    assert.equal(upg2.ok, true, upg2.summary);
    assert.equal(upg2.nextState.conglomerate?.hq.hqLevel, 2);

    // Lv 3 requires 3 owned businesses -> blocked while owning 2
    const blockedUpg3 = upgradeCorporateHQ(upg2.nextState);
    assert.equal(blockedUpg3.ok, false);
    assert.match(blockedUpg3.summary, /3 businesses/i);

    // Grant all 6 businesses -> upgrade HQ cleanly all the way to Level 5
    const allSix: GameState = {
      ...upg2.nextState,
      conglomerate: grantAllSixBusinessesForScenario(upg2.nextState.conglomerate!, upg2.nextState.stepCount),
    };
    let hqCur = allSix;
    for (let lvl = 3; lvl <= 5; lvl += 1) {
      const res = upgradeCorporateHQ(hqCur);
      assert.equal(res.ok, true, res.summary);
      hqCur = res.nextState;
      assert.equal(hqCur.conglomerate?.hq.hqLevel, lvl);
    }
    const maxCap = upgradeCorporateHQ(hqCur);
    assert.equal(maxCap.ok, false);
    assert.match(maxCap.summary, /maximum Level 5/i);
  });

  it('2. Enforces synergy slot limits & ACTIVE status requirements, and auto-pauses invalid synergies', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE4_SYNERGY_CAPS');
    const gen5Setup: GameState = {
      ...base,
      cash: 8_000_000,
      unlockedResearch: ['res_gen5_exascale'],
    };
    const atGen5 = stepMany(gen5Setup, 1);

    // Buy Market Intel (starts RECOVERING)
    const acq = acquireTargetCompany(atGen5, 'market_intel');
    assert.equal(acq.ok, true);
    const est = establishCorporateHQ(acq.nextState);
    assert.equal(est.ok, true);

    // While MARKET_INTEL is RECOVERING, INTEL_TO_MINING cannot be activated
    const blockedRecover = toggleSynergyPolicy(est.nextState, 'INTEL_TO_MINING');
    assert.equal(blockedRecover.ok, false);
    assert.match(blockedRecover.summary, /ACTIVE/i);

    // Fund turnaround -> MARKET_INTEL becomes ACTIVE
    const turned = fundBusinessTurnaround(est.nextState, 'market_intel');
    assert.equal(turned.ok, true);

    // Activate INTEL_TO_MINING (1/1 slots at HQ Lv 1)
    const syn1 = toggleSynergyPolicy(turned.nextState, 'INTEL_TO_MINING');
    assert.equal(syn1.ok, true, syn1.summary);
    assert.deepEqual(syn1.nextState.conglomerate?.hq.activeSynergies, ['INTEL_TO_MINING']);

    // Activating second synergy at HQ Lv 1 fails on slot limit (1/1)
    const syn2Blocked = toggleSynergyPolicy(syn1.nextState, 'INTEL_TO_TREASURY');
    assert.equal(syn2Blocked.ok, false);
    assert.match(syn2Blocked.summary, /1\/1/);

    // Upgrade HQ to Lv 2 (2 synergy slots) -> second synergy activates cleanly
    const hq2 = upgradeCorporateHQ(syn1.nextState);
    assert.equal(hq2.ok, true);
    const syn2 = toggleSynergyPolicy(hq2.nextState, 'INTEL_TO_TREASURY');
    assert.equal(syn2.ok, true, syn2.summary);
    assert.equal(syn2.nextState.conglomerate?.hq.activeSynergies.length, 2);

    // If a division drops to RECOVERING, advanceOneStep auto-pauses its dependent synergies
    const degradedState: GameState = {
      ...syn2.nextState,
      conglomerate: {
        ...syn2.nextState.conglomerate!,
        businesses: {
          ...syn2.nextState.conglomerate!.businesses,
          MARKET_INTEL: {
            ...syn2.nextState.conglomerate!.businesses.MARKET_INTEL,
            status: 'RECOVERING',
            recoveryStepsRemaining: 3,
          },
        },
      },
    };
    const afterStep = advanceOneStep(degradedState).nextState;
    assert.equal(afterStep.conglomerate?.hq.activeSynergies.length, 0);
  });

  it('3. Applies real economic synergy effects: exchange fee cut, rig build discount, fab NRE discount, auto-sell & RP boost', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'PHASE4_REAL_EFFECTS');
    const baseCong = grantAllSixBusinessesForScenario(
      buildDefaultConglomerate(base),
      base.stepCount
    );
    const sandboxAll: GameState = {
      ...base,
      cash: 15_000_000,
      facilityId: 'fac_warehouse',
      unlockedResearch: ['res_wafer_lithography', 'res_asic_tapeout', 'res_gen4_hyperhash'],
      conglomerate: {
        ...baseCong,
        hq: {
          ...baseCong.hq,
          established: true,
          hqLevel: 5,
          activeSynergies: [],
        },
      },
    };

    const rigCfg: RigBuildConfig = {
      name: 'Synergy Bench Rig',
      chassisId: CHASSIS_PARTS[0].id,
      computeId: COMPUTE_PARTS[0].id,
      gpuIds: [],
      storageId: STORAGE_PARTS[0].id,
      psuId: PSU_PARTS[0].id,
      coolingId: COOLING_PARTS[0].id,
      osId: OS_PARTS[0].id,
      targetCoin: 'BTC',
      overclockPct: 100,
    };

    const baselineFee = getSpotExchangeFeePct(sandboxAll);
    const baselineRigCost = calculateRigBuildCost(rigCfg, sandboxAll);
    const baselineFab = buildFabLine(sandboxAll).nextState;
    const bpNoSyn = designCustomChipBlueprint(baselineFab, 'BaseChipA', 'SHA256', '7nm');
    assert.equal(bpNoSyn.ok, true, bpNoSyn.summary);
    const baselineNre = baselineFab.cash - bpNoSyn.nextState.cash;

    // Activate INTEL_TO_TREASURY, MFG_TO_MINING, ENG_TO_MFG, INTEL_TO_MINING
    let synState = sandboxAll;
    for (const pid of ['INTEL_TO_TREASURY', 'MFG_TO_MINING', 'ENG_TO_MFG', 'INTEL_TO_MINING']) {
      const t = toggleSynergyPolicy(synState, pid);
      assert.equal(t.ok, true, t.summary);
      synState = t.nextState;
    }

    const synEffects = getCorporateSynergyEffects(synState);
    assert.equal(synEffects.exchangeFeeMult, 0.7);
    assert.equal(synEffects.rigPartDiscountMult, 0.9);
    assert.ok(synEffects.fabNreMult < 0.8);
    assert.ok(synEffects.miningAutoSellBonusPct > 0);
    assert.equal(synEffects.wearReductionPct, 0.12);

    const discountedFee = getSpotExchangeFeePct(synState);
    assert.ok(discountedFee < baselineFee, `Expected ${discountedFee} < ${baselineFee}`);

    const discountedRigCost = calculateRigBuildCost(rigCfg, synState);
    assert.ok(
      discountedRigCost < baselineRigCost,
      `Expected discounted rig cost ${discountedRigCost} < ${baselineRigCost}`
    );

    const synFab = buildFabLine(synState).nextState;
    const bpWithSyn = designCustomChipBlueprint(synFab, 'SynChipA', 'SHA256', '7nm');
    assert.equal(bpWithSyn.ok, true, bpWithSyn.summary);
    const discountedNre = synFab.cash - bpWithSyn.nextState.cash;
    assert.ok(discountedNre < baselineNre, `Expected Fab NRE ${discountedNre} < ${baselineNre}`);

    // Step across a full 30-step billing cycle -> HQ cycle upkeep & internal synergy credits recorded
    const afterCycle = stepMany(synState, BILLING_CYCLE_STEPS);
    assert.ok((afterCycle.conglomerate?.hq.totalSynergyValueUsd ?? 0) > 0);
    assert.ok(
      (afterCycle.conglomerate?.businesses.MARKET_INTEL.ledger.totalRevenueUsd ?? 0) > 0,
      'INTEL_TO_TREASURY should record treasury execution revenue for Market Intel'
    );
    assert.ok(
      (afterCycle.conglomerate?.businesses.MARKET_INTEL.ledger.totalInternalCreditsUsd ?? 0) > 0,
      'INTEL_TO_MINING should track internal advisory transfer credits'
    );
    assert.ok(
      afterCycle.transactions.some((tx) => tx.category === 'CORPORATE' && tx.amountUsd === -HQ_LEVEL_SPECS[5].cycleUpkeepUsd),
      '30-step cycle should deduct HQ Level 5 governance upkeep'
    );
  });

  it('4. Upgrades individual divisions Lv 1..5, updates company valuation equity & formats reports cleanly', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'PHASE4_DIV_UPGRADES');
    const cong = grantAllSixBusinessesForScenario(buildDefaultConglomerate(base), base.stepCount);
    const startState: GameState = {
      ...base,
      cash: 15_000_000,
      conglomerate: cong,
    };

    const valBefore = computeValuationBreakdown(startState);
    assert.ok(valBefore.conglomerateEquityUsd > 0, 'Subsidiaries + HQ must contribute to conglomerateEquityUsd');
    assert.equal(computeCompanyValuation(startState), valBefore.totalUsd);

    let cur = startState;
    for (let targetLvl = 2; targetLvl <= 5; targetLvl += 1) {
      const upg = upgradeBusinessDivision(cur, 'market_intel');
      assert.equal(upg.ok, true, upg.summary);
      cur = upg.nextState;
      assert.equal(cur.conglomerate?.businesses.MARKET_INTEL.level, targetLvl);
      assert.equal(cur.conglomerate?.marketIntel.modelTier, targetLvl);
    }
    const maxAttempt = upgradeBusinessDivision(cur, 'market_intel');
    assert.equal(maxAttempt.ok, false);

    // Equity from division upgrades increases conglomerateEquityUsd (excluding cash drop)
    const valAfter = computeValuationBreakdown(cur);
    assert.ok(valAfter.conglomerateEquityUsd > valBefore.conglomerateEquityUsd);

    // Formatters render clean text reports
    assert.match(formatCorporateHQReport(cur), /CORPORATE HEADQUARTERS/);
    assert.match(formatSynergiesReport(cur), /INTER-BUSINESS SYNERGY BOARD/);
    assert.match(formatDivisionLedgerReport(cur), /CONSOLIDATED DIVISION P&L LEDGER/);
  });
});
