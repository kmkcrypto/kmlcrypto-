import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RESEARCH_NODES } from '../src/data/catalog';
import {
  advanceOneStep,
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  BUSINESS_ORDER,
  canStartResearchNode,
  createNewGameState,
  evaluateGenerationMilestones,
  getOwnedBusinessIds,
  getRankedAffinityBusinesses,
  grantAllSixBusinessesForScenario,
  resolvePendingEvent,
} from '../src/engine/simulation';
import { createScenarioState } from '../src/engine/scenarios';
import { hydrateSavedState, serializeSaveEnvelope } from '../src/engine/saveSystem';
import type { GameState } from '../src/types/game';

describe('Phase 2 — Conglomerate Data Model, Affinity, Generations & Save Migration', () => {
  it('1. New career game starts with Mining active, 5 divisions unowned, and Gen 1 state', () => {
    const state = createNewGameState('STANDARD', false, 'PHASE2_INIT');
    assert.ok(state.conglomerate, 'conglomerate state must be initialized');
    assert.equal(state.conglomerate.businesses.MINING.status, 'ACTIVE');
    for (const id of BUSINESS_ORDER) {
      if (id !== 'MINING') {
        assert.equal(state.conglomerate.businesses[id].status, 'UNOWNED');
      }
    }
    assert.deepEqual(getOwnedBusinessIds(state), ['MINING']);
    assert.equal(areAllSixBusinessesOwned(state), false);
    assert.equal(state.conglomerate.generation.currentGeneration, 1);
    assert.equal(state.conglomerate.generation.gen5ExpansionTriggered, false);
    assert.equal(state.conglomerate.generation.gen7ConglomerateUnlocked, false);
  });

  it('2. Step progression updates Mining division P&L without double-counting cycle electricity', () => {
    let state = createNewGameState('STANDARD', false, 'PHASE2_PNL', undefined, null, 'VETERAN');
    while (state.stepCount < 30) {
      if (state.pendingEvent) {
        state = resolvePendingEvent(state, state.pendingEvent.options[0].key).nextState;
      } else {
        state = advanceOneStep(state).nextState;
      }
    }

    const miningLedger = state.conglomerate?.businesses.MINING.ledger;
    assert.ok(miningLedger, 'Mining division ledger must exist');
    assert.ok(miningLedger.totalRevenueUsd > 0, 'Mining division should track mining revenue');
    assert.ok(miningLedger.totalExpenseUsd > 0, 'Mining division should track operating expenses');

    const latestCycle = state.ledger[0];
    assert.ok(latestCycle, 'Billing cycle entry should be recorded at step 30');
    const expectedTotal30StepExp =
      latestCycle.electricityCostUsd +
      latestCycle.rentCostUsd +
      latestCycle.payrollCostUsd +
      latestCycle.maintenanceCostUsd;
    assert.ok(
      Math.abs(miningLedger.totalExpenseUsd - expectedTotal30StepExp) < 0.05,
      `Division expense (${miningLedger.totalExpenseUsd}) should match total cycle expenses (${expectedTotal30StepExp})`
    );
  });

  it('3. Hidden behavioral affinity accurately detects Market Intel and Underground playstyles', () => {
    let marketHeavy = createNewGameState('STANDARD', false, 'PHASE2_AFF_MKT', undefined, null, 'VETERAN');
    marketHeavy = {
      ...marketHeavy,
      cash: 500_000,
      employees: [
        {
          id: 'emp_a1',
          role: 'ANALYST',
          name: 'Quant Lead',
          hiredStep: 0,
          morale: 90,
          shift: 'DAY',
          priority: 'HASHRATE_TUNING',
          skillLevel: 2,
          experienceXp: 20,
        },
      ],
      activeCampaigns: [
        {
          id: 'pr_test',
          templateId: 'pr_forum_thread',
          name: 'Market Spotlight',
          targetCoin: 'BTC',
          direction: 'HYPE',
          stepsRemaining: 5,
          totalSteps: 10,
          stepPriceImpulse: 0.01,
          sentimentDeltaPerStep: 2,
        },
      ],
    };

    for (let i = 0; i < 6; i += 1) {
      marketHeavy = advanceOneStep(marketHeavy).nextState;
    }

    const rankedMkt = getRankedAffinityBusinesses(marketHeavy.conglomerate!.affinity, {
      excludeIds: ['MINING'],
    });
    assert.equal(rankedMkt[0].businessId, 'MARKET_INTEL');
    assert.ok(rankedMkt[0].score > rankedMkt[1].score);

    let ugHeavy = createNewGameState('STANDARD', false, 'PHASE2_AFF_UG', undefined, null, 'VETERAN');
    ugHeavy = {
      ...ugHeavy,
      regulatoryScrutiny: 40,
      underground: {
        ...ugHeavy.underground,
        powerSiphonActive: true,
        botnetCoin: 'BTC',
        botnetBonusHash: 2500,
        botnetStepsRemaining: 6,
      },
    };
    for (let i = 0; i < 5; i += 1) {
      ugHeavy = advanceOneStep(ugHeavy).nextState;
    }
    const rankedUg = getRankedAffinityBusinesses(ugHeavy.conglomerate!.affinity, {
      excludeIds: ['MINING'],
    });
    assert.equal(rankedUg[0].businessId, 'UNDERGROUND');
  });

  it('4. Gen-7 research gate blocks Career mode until all 6 businesses are owned while honoring Sandbox/devUnlockAll', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE2_GEN7_GATE', undefined, null, 'VETERAN');
    const preGen7State: GameState = {
      ...base,
      cash: 5_000_000,
      unlockedResearch: ['res_gen6_ai_convergence', 'res_ai_thermal_fabric'],
    };

    const blocked = canStartResearchNode(preGen7State, 'res_gen7_quantum_photonic');
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason ?? '', /all 6 businesses/i);

    const allOwnedCong = grantAllSixBusinessesForScenario(
      buildDefaultConglomerate(preGen7State, preGen7State.conglomerate),
      preGen7State.stepCount
    );
    const unlockedState: GameState = {
      ...preGen7State,
      conglomerate: {
        ...allOwnedCong,
        generation: evaluateGenerationMilestones(preGen7State, allOwnedCong),
      },
    };
    assert.equal(areAllSixBusinessesOwned(unlockedState), true);
    assert.equal(canStartResearchNode(unlockedState, 'res_gen7_quantum_photonic').ok, true);

    const sandboxBypass: GameState = {
      ...preGen7State,
      isSandbox: true,
    };
    assert.equal(canStartResearchNode(sandboxBypass, 'res_gen7_quantum_photonic').ok, true);

    const gen7Scenario = createScenarioState('GEN7');
    assert.equal(areAllSixBusinessesOwned(gen7Scenario), true);
    assert.equal(gen7Scenario.conglomerate?.generation.gen7ConglomerateUnlocked, true);
  });

  it('5. Hydrating a legacy V2 save preserves owned Gen-7 research/gear while gating unstarted Gen-7 nodes', () => {
    const career = createNewGameState('STANDARD', false, 'PHASE2_LEGACY_MIGRATE', undefined, null, 'VETERAN');
    const legacyLikeState: GameState = {
      ...career,
      stepCount: 85,
      cash: 2_400_000,
      facilityId: 'fac_industrial',
      ownedFacilityIds: ['fac_bedroom', 'fac_garage', 'fac_commercial', 'fac_warehouse', 'fac_industrial'],
      unlockedResearch: [
        ...RESEARCH_NODES.filter((n) => n.era !== 'QUANTUM').map((n) => n.id),
        'res_gen7_quantum_photonic',
      ],
      fab: { ...career.fab!, linesCount: 2, totalUnitsManufactured: 5 },
    };
    delete legacyLikeState.conglomerate;

    const rawEnvelope = JSON.parse(serializeSaveEnvelope(legacyLikeState));
    delete rawEnvelope.state.conglomerate;

    const hydrated = hydrateSavedState(rawEnvelope);
    assert.ok(hydrated, 'Legacy save without conglomerate must hydrate cleanly');
    assert.equal(hydrated.cash, 2_400_000);
    assert.ok(hydrated.unlockedResearch.includes('res_gen7_quantum_photonic'));
    assert.ok(hydrated.conglomerate, 'Migrated save must receive conglomerate state');
    assert.equal(hydrated.conglomerate.businesses.MINING.status, 'ACTIVE');
    assert.equal(hydrated.conglomerate.businesses.MANUFACTURING.status, 'UNOWNED');
    assert.ok(hydrated.conglomerate.affinity.scores.MANUFACTURING > 0);
    assert.equal(hydrated.conglomerate.generation.gen5ExpansionTriggered, true);

    // Unstarted Gen 7 node still gated until all 6 businesses are acquired
    const nextGen7Gate = canStartResearchNode(hydrated, 'res_gen7_dilution_cryo');
    assert.equal(nextGen7Gate.ok, false);
    assert.match(nextGen7Gate.reason ?? '', /all 6 businesses/i);
  });
});
