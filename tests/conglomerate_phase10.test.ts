import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACHIEVEMENTS, MILESTONES, RESEARCH_NODES } from '../src/data/catalog';
import {
  CODEX_ENTRIES,
  CONTEXTUAL_GUIDES,
  getBusinessTutorialTopicId,
  TUTORIAL_TOPICS,
} from '../src/data/onboarding';
import { evaluateProgression } from '../src/engine/milestones';
import {
  hydrateSavedState,
  serializeSaveEnvelope,
  validateAndParseImportedSave,
} from '../src/engine/saveSystem';
import { createScenarioState, researchClosure, SCENARIOS } from '../src/engine/scenarios';
import {
  acquireTargetCompany,
  advanceOneStep,
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  BUSINESS_ORDER,
  canStartResearchNode,
  computeCompanyValuation,
  computeValuationBreakdown,
  createNewGameState,
  designCustomComponentBlueprint,
  establishCorporateHQ,
  expandHostingInfrastructure,
  expandIntelSubscriptions,
  formatCorporateHQReport,
  formatDivisionLedgerReport,
  formatSynergiesReport,
  fundBusinessTurnaround,
  getCorporateSynergyEffects,
  getOwnedBusinessIds,
  hardenShellSubsidiary,
  inspectAcquisitionTarget,
  isAcquisitionUnlocked,
  licenseBlueprintExternally,
  onboardHostingClient,
  queueFabProduction,
  refreshAcquisitionMarket,
  resolvePendingEvent,
  runPrototypeTest,
  startOemManufacturingContract,
  startUndergroundContract,
  SYNERGY_ORDER,
  toggleCommercialPool,
  toggleIntelAdvisory,
  toggleSynergyPolicy,
  upgradeBusinessDivision,
  upgradeCorporateHQ,
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

describe('Conglomerate Phase 10 — Full End-to-End Regression & Stress Verification', () => {
  it('1. Full Career Conglomerate Arc: Gen 1 -> Gen 5 M&A Refresh -> 6/6 Active -> HQ Lv 5 -> 6 Synergies -> Gen 7 Completion', () => {
    // 1. Fresh Gen-1 Career startup preserves early game
    const starter = createNewGameState('STANDARD', false, 'PHASE10_FULL_ARC', undefined, null, 'VETERAN');
    assert.equal(starter.conglomerate?.generation.currentGeneration, 1);
    assert.equal(getOwnedBusinessIds(starter).length, 1);
    assert.equal(isAcquisitionUnlocked(starter), false);
    assert.equal(canStartResearchNode(starter, 'res_gen7_quantum_photonic').ok, false);

    // 2. Advance early game with real mining + analyst + fab activity so affinity diverges organically
    let midState: GameState = {
      ...starter,
      cash: 85_000_000,
      researchPoints: 5000,
      facilityId: 'fac_megafarm',
      ownedFacilityIds: ['fac_bedroom', 'fac_garage', 'fac_commercial', 'fac_warehouse', 'fac_industrial', 'fac_megafarm'],
      employees: [
        {
          id: 'emp_p10_res',
          role: 'RESEARCHER',
          name: 'Dr. K. Patel',
          hiredStep: 0,
          morale: 92,
          shift: 'ROTATION_24_7',
          priority: 'RESEARCH_OUTPUT',
          skillLevel: 5,
          experienceXp: 2000,
        },
        {
          id: 'emp_p10_ana',
          role: 'ANALYST',
          name: 'J. Morales',
          hiredStep: 0,
          morale: 90,
          shift: 'DAY',
          priority: 'HASHRATE_TUNING',
          skillLevel: 4,
          experienceXp: 1500,
        },
      ],
      unlockedResearch: researchClosure([
        'res_gen5_exascale',
        'res_gen6_ai_convergence',
        'res_ai_thermal_fabric',
        'res_wafer_lithography',
      ]),
    };

    // Step across Gen 5 transition
    const gen5Boot = stepMany(midState, 2);
    assert.equal(gen5Boot.conglomerate?.generation.gen5ExpansionTriggered, true);
    assert.equal(isAcquisitionUnlocked(gen5Boot), true);
    const initialTargets = gen5Boot.conglomerate?.acquisitions.availableTargets ?? [];
    assert.ok(initialTargets.length >= 2);
    const firstOfferExpiry = initialTargets[0].expiresAtStep;

    // 3. Decline / let initial offers expire -> auto-refreshes without locking out any division
    const afterExpiry = stepMany(gen5Boot, firstOfferExpiry - gen5Boot.stepCount + 1);
    assert.ok(
      (afterExpiry.conglomerate?.acquisitions.availableTargets.length ?? 0) >= 2,
      'Expired M&A offers must replenish automatically'
    );
    assert.ok(
      afterExpiry.conglomerate!.acquisitions.lastRefreshStep >= firstOfferExpiry,
      'lastRefreshStep must advance on automatic expiry refresh'
    );

    // 4. Inspect, acquire, and stabilize all 5 non-mining divisions
    let congState = afterExpiry;
    for (let i = 0; i < 5; i += 1) {
      if ((congState.conglomerate?.acquisitions.availableTargets.length ?? 0) === 0) {
        congState = refreshAcquisitionMarket(congState).nextState;
      }
      const insp = inspectAcquisitionTarget(congState, '1');
      assert.equal(insp.ok, true, insp.summary);
      congState = insp.nextState;

      const buy = acquireTargetCompany(congState, '1');
      assert.equal(buy.ok, true, `Acquire #${i + 1} failed: ${buy.summary}`);
      congState = buy.nextState;
    }
    assert.equal(areAllSixBusinessesOwned(congState), true);
    assert.equal(getOwnedBusinessIds(congState).length, 6);

    // Stabilize all recovering subsidiaries
    for (const id of BUSINESS_ORDER) {
      if (id === 'MINING') continue;
      if (congState.conglomerate?.businesses[id].status === 'RECOVERING') {
        const turn = fundBusinessTurnaround(congState, id);
        assert.equal(turn.ok, true, turn.summary);
        congState = turn.nextState;
      }
      assert.equal(congState.conglomerate?.businesses[id].status, 'ACTIVE');
    }

    // 5. Establish Corporate HQ & upgrade to Level 5 (6 synergy slots)
    const hqEst = establishCorporateHQ(congState, 'Sovereign Apex Corp');
    assert.equal(hqEst.ok, true, hqEst.summary);
    congState = hqEst.nextState;

    for (let targetLvl = 2; targetLvl <= 5; targetLvl += 1) {
      const hqUpg = upgradeCorporateHQ(congState);
      assert.equal(hqUpg.ok, true, `HQ Lv ${targetLvl} upgrade failed: ${hqUpg.summary}`);
      congState = hqUpg.nextState;
    }
    assert.equal(congState.conglomerate?.hq.hqLevel, 5);

    // Activate all 6 synergy policies simultaneously
    for (const pid of SYNERGY_ORDER) {
      const syn = toggleSynergyPolicy(congState, pid);
      assert.equal(syn.ok, true, `Synergy ${pid} failed: ${syn.summary}`);
      congState = syn.nextState;
    }
    assert.equal(congState.conglomerate?.hq.activeSynergies.length, 6);

    const apexEffects = getCorporateSynergyEffects(congState);
    // HQ Lv 5 (+20% RP) + 6/6 Active Apex Dividend (+10% RP) => 1.30x
    assert.ok(Math.abs(apexEffects.rpBonusMult - 1.3) < 1e-6, `Expected 1.30x RP mult, got ${apexEffects.rpBonusMult}`);

    // 6. Start & complete Gen-7 Quantum & Photonic R&D node using RP
    const gateCheck = canStartResearchNode(congState, 'res_gen7_quantum_photonic');
    assert.equal(gateCheck.ok, true, gateCheck.reason);

    const gen7Node = RESEARCH_NODES.find((n) => n.id === 'res_gen7_quantum_photonic')!;
    congState = {
      ...congState,
      cash: congState.cash - gen7Node.costCash,
      activeResearchId: gen7Node.id,
      activeResearchProgress: 0,
      researchPoints: Math.max(congState.researchPoints, gen7Node.costRp + 500),
    };

    // Step until Gen-7 node finishes
    let safety = 0;
    while (!congState.unlockedResearch.includes('res_gen7_quantum_photonic') && safety < 120) {
      congState = stepMany(congState, 1);
      safety += 1;
    }
    assert.ok(
      congState.unlockedResearch.includes('res_gen7_quantum_photonic'),
      'Gen-7 Quantum & Photonic R&D should complete cleanly'
    );

    const prog = evaluateProgression(congState, 5000);
    congState = prog.nextState;
    assert.ok(congState.unlockedMilestones.includes('ms_conglomerate_hq'));
    assert.ok(congState.unlockedMilestones.includes('ms_six_business_monopoly'));
    assert.ok(congState.unlockedMilestones.includes('ms_gen7_quantum_program'));
    assert.ok(congState.unlockedAchievements.includes('ach_conglomerate_titan'));
    assert.ok(congState.unlockedAchievements.includes('ach_gen7_architect'));
    assert.match(formatCorporateHQReport(congState), /Sovereign Apex Corp/);
    assert.match(formatSynergiesReport(congState), /Slots Used: 6\/6/);
    assert.match(formatDivisionLedgerReport(congState), /CONSOLIDATED TOTALS/);
  });

  it('2. Save Round-Trip & Corrupted/Legacy Conglomerate Hydration Resilience', () => {
    const cong6 = createScenarioState('CONGLOMERATE_GEN6');
    const careerCong = {
      ...cong6,
      isSandbox: false,
      isDevSession: false,
      devUnlockAll: false,
      cash: 25_000_000,
    };

    // Exercise division ops + tutorial acknowledgement prior to serialization
    let active = upgradeBusinessDivision(careerCong, 'market_intel').nextState;
    active = {
      ...active,
      conglomerate: {
        ...buildDefaultConglomerate(active, active.conglomerate),
        businessTutorialsSeen: ['MARKET_INTEL', 'HARDWARE_ENG'],
      },
    };
    active = stepMany(active, 5);

    const json = serializeSaveEnvelope(active);
    const reloaded = validateAndParseImportedSave(json);
    assert.equal(reloaded.ok, true, reloaded.error);
    assert.ok(reloaded.state);
    assert.equal(reloaded.state.conglomerate?.hq.companyName, 'Apex Hash Holdings');
    assert.equal(reloaded.state.conglomerate?.hq.hqLevel, 3);
    assert.deepEqual(
      reloaded.state.conglomerate?.hq.activeSynergies,
      active.conglomerate?.hq.activeSynergies
    );
    assert.deepEqual(
      reloaded.state.conglomerate?.businessTutorialsSeen,
      ['MARKET_INTEL', 'HARDWARE_ENG']
    );
    assert.equal(
      reloaded.state.conglomerate?.businesses.MARKET_INTEL.ledger.totalRevenueUsd,
      active.conglomerate?.businesses.MARKET_INTEL.ledger.totalRevenueUsd
    );

    // Corrupt conglomerate fields in raw save JSON -> hydrateSavedState sanitizes safely
    const rawCorrupted = JSON.parse(json);
    rawCorrupted.state.conglomerate.hq.hqLevel = 999;
    rawCorrupted.state.conglomerate.hq.activeSynergies = ['ENG_TO_MFG', 'BOGUS_SYNERGY', 'ENG_TO_MFG'];
    rawCorrupted.state.conglomerate.businesses.MINING.status = 'UNOWNED';
    rawCorrupted.state.conglomerate.businesses.MINING.ledger.totalRevenueUsd = Number.NaN;
    rawCorrupted.state.conglomerate.businessTutorialsSeen = ['MARKET_INTEL', 'FAKE_BIZ'];

    const sanitized = hydrateSavedState(rawCorrupted);
    assert.ok(sanitized, 'Corrupted conglomerate fields must still hydrate cleanly');
    assert.equal(sanitized.conglomerate?.hq.hqLevel, 5);
    assert.deepEqual(sanitized.conglomerate?.hq.activeSynergies, ['ENG_TO_MFG']);
    assert.equal(sanitized.conglomerate?.businesses.MINING.status, 'ACTIVE');
    assert.equal(sanitized.conglomerate?.businesses.MINING.ledger.totalRevenueUsd, 0);
    assert.deepEqual(sanitized.conglomerate?.businessTutorialsSeen, ['MARKET_INTEL']);
  });

  it('3. 500-Step Full Conglomerate Stress Test & Byte-Identical Determinism', () => {
    const gen7 = createScenarioState('GEN7');
    let seedState: GameState = {
      ...gen7,
      isSandbox: false,
      isDevSession: false,
      devUnlockAll: false,
      cash: 80_000_000,
      regulatoryScrutiny: 18,
      unlockedResearch: researchClosure([...gen7.unlockedResearch, 'res_wafer_lithography']),
      fab: { ...gen7.fab!, linesCount: 4 },
    };

    // Activate all 6 synergies & initialize active workloads across all non-mining divisions
    for (const pid of SYNERGY_ORDER) {
      if (!seedState.conglomerate?.hq.activeSynergies.includes(pid)) {
        const syn = toggleSynergyPolicy(seedState, pid);
        if (syn.ok) seedState = syn.nextState;
      }
    }
    seedState = expandIntelSubscriptions(seedState, 3).nextState;
    seedState = toggleIntelAdvisory(seedState).nextState;
    seedState = toggleCommercialPool(seedState).nextState;
    seedState = expandHostingInfrastructure(seedState, 80).nextState;
    seedState = onboardHostingClient(seedState, 3).nextState;
    seedState = hardenShellSubsidiary(seedState).nextState;
    seedState = startUndergroundContract(seedState, 'escrow').nextState;

    const bp = designCustomComponentBlueprint(seedState, {
      name: 'Stress-Photonic-Core',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: '3nm',
      focus: 'SHA256',
      engineering: { density: 3, efficiency: 3, thermals: 2, reliability: 2 },
      subFeature: 'STD',
      profile: 'BALANCED',
    });
    assert.equal(bp.ok, true, bp.summary);
    seedState = runPrototypeTest(bp.nextState, 0, 'PASSED').nextState;
    seedState = licenseBlueprintExternally(seedState, 0).nextState;
    seedState = queueFabProduction(seedState, 0, 12).nextState;
    seedState = startOemManufacturingContract(seedState, 'compute', 4).nextState;

    // Build 2 lines of comparison runs of 500 steps for strict determinism + boundedness
    const runA = stepMany(seedState, 500);
    const runB = stepMany(seedState, 500);

    assert.equal(runA.stepCount, 500);
    assert.equal(runA.cash, runB.cash);
    assert.equal(runA.researchPoints, runB.researchPoints);
    assert.equal(runA.coins.BTC.priceUsd, runB.coins.BTC.priceUsd);
    assert.deepEqual(runA.conglomerate, runB.conglomerate);

    // Bounded history buffers & numeric hygiene
    assert.ok(Number.isFinite(runA.cash));
    assert.ok(Number.isFinite(runA.researchPoints));
    assert.ok(Number.isFinite(computeCompanyValuation(runA)));
    assert.ok(computeValuationBreakdown(runA).conglomerateEquityUsd > 0);
    assert.ok(runA.news.length <= 60);
    assert.ok(runA.transactions.length <= 200);
    assert.ok(runA.ledger.length <= 48);
    assert.ok((runA.performanceHistory?.length ?? 0) <= 60);
    assert.ok((runA.seasonHistory?.length ?? 0) >= 8, '500 steps must archive >= 8 seasons');

    for (const id of BUSINESS_ORDER) {
      const ledger = runA.conglomerate!.businesses[id].ledger;
      assert.ok(Number.isFinite(ledger.totalRevenueUsd) && ledger.totalRevenueUsd >= 0);
      assert.ok(Number.isFinite(ledger.totalExpenseUsd) && ledger.totalExpenseUsd >= 0);
      assert.ok(Number.isFinite(ledger.totalInternalCreditsUsd) && ledger.totalInternalCreditsUsd >= 0);
    }
    assert.ok(runA.conglomerate!.businesses.MARKET_INTEL.ledger.totalRevenueUsd > 0);
    assert.ok(runA.conglomerate!.businesses.HARDWARE_ENG.ledger.totalRevenueUsd > 0);
    assert.ok(runA.conglomerate!.businesses.MANUFACTURING.ledger.totalRevenueUsd > 0);
    assert.ok(runA.conglomerate!.businesses.MINING_SERVICES.ledger.totalRevenueUsd > 0);
    assert.ok(runA.conglomerate!.businesses.UNDERGROUND.ledger.totalRevenueUsd > 0);
  });

  it('4. Cross-Catalog Referential Integrity Audit (Scenarios, Research, Milestones, Onboarding)', () => {
    const researchIds = new Set(RESEARCH_NODES.map((n) => n.id));
    for (const node of RESEARCH_NODES) {
      for (const prereq of node.prereqIds) {
        assert.ok(researchIds.has(prereq), `Dangling prereq ${prereq} on ${node.id}`);
      }
    }

    for (const scenario of SCENARIOS) {
      const s = createScenarioState(scenario.id);
      assert.ok(s.conglomerate, `Scenario ${scenario.id} missing conglomerate state`);
      assert.ok(s.rigs.length >= 1, `Scenario ${scenario.id} has no rigs`);
    }

    for (const bizId of BUSINESS_ORDER) {
      const topic = getBusinessTutorialTopicId(bizId);
      assert.ok(Object.hasOwn(TUTORIAL_TOPICS, topic), `Missing tutorial topic ${topic}`);
    }

    for (const [key, guide] of Object.entries(CONTEXTUAL_GUIDES)) {
      assert.ok(Object.hasOwn(TUTORIAL_TOPICS, guide.topic), `Bad guide ${key} -> ${guide.topic}`);
    }

    assert.ok(CODEX_ENTRIES.some((e) => e.key === 'conglomerate'));
    assert.ok(CODEX_ENTRIES.some((e) => e.key === 'divisions'));
    assert.ok(MILESTONES.some((m) => m.id === 'ms_gen7_quantum_program'));
    assert.ok(ACHIEVEMENTS.some((a) => a.id === 'ach_gen7_architect'));
  });
});
