import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateProgression } from '../src/engine/milestones';
import { createScenarioState } from '../src/engine/scenarios';
import {
  acquireTargetCompany,
  advanceOneStep,
  areAllSixBusinessesOwned,
  buildDefaultConglomerate,
  canStartResearchNode,
  createNewGameState,
  evaluateGenerationMilestones,
  formatCorporateHQReport,
  fundBusinessTurnaround,
  getCorporateSynergyEffects,
  getOwnedBusinessIds,
  grantAllSixBusinessesForScenario,
  resolvePendingEvent,
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

describe('Conglomerate Phase 8 — Gen-7 Endgame Gate, Scenarios, Milestones & Apex Dividend', () => {
  it('1. Enforces 6/6 business gate in Career mode and awards conglomerate + Gen-7 milestones/achievements + Apex RP bonus', () => {
    const cong6 = createScenarioState('CONGLOMERATE_GEN6');
    // Prepare state at 5/6 owned (missing UNDERGROUND) with all Gen-6 prereqs met
    const baseCong = buildDefaultConglomerate(cong6, cong6.conglomerate);
    const fiveOfSix: GameState = {
      ...cong6,
      isSandbox: false,
      isDevSession: false,
      devUnlockAll: false,
      cash: 500_000_000,
      conglomerate: {
        ...baseCong,
        businesses: {
          ...baseCong.businesses,
          MINING_SERVICES: {
            ...baseCong.businesses.MINING_SERVICES,
            status: 'ACTIVE',
            acquiredStep: 1,
            recoveryStepsRemaining: 0,
          },
          UNDERGROUND: {
            ...baseCong.businesses.UNDERGROUND,
            status: 'UNOWNED',
            acquiredStep: null,
          },
        },
      },
    };
    assert.equal(getOwnedBusinessIds(fiveOfSix).length, 5);
    const gateBlocked = canStartResearchNode(fiveOfSix, 'res_gen7_quantum_photonic');
    assert.equal(gateBlocked.ok, false);
    assert.match(gateBlocked.reason ?? '', /5\/6/);

    // At 5/6 active, Apex RP Dividend (+10%) is NOT active yet (HQ Lv 3 base = +10% => 1.10)
    const fx5 = getCorporateSynergyEffects(fiveOfSix);
    assert.ok(Math.abs(fx5.rpBonusMult - 1.1) < 1e-6, `Expected 1.10x RP mult, got ${fx5.rpBonusMult}`);

    // Now own all 6/6 active + HQ established
    const fullCong = grantAllSixBusinessesForScenario(fiveOfSix.conglomerate!, fiveOfSix.stepCount);
    const sixOfSix: GameState = {
      ...fiveOfSix,
      conglomerate: {
        ...fullCong,
        generation: evaluateGenerationMilestones(fiveOfSix, fullCong),
      },
    };
    assert.equal(areAllSixBusinessesOwned(sixOfSix), true);
    assert.equal(canStartResearchNode(sixOfSix, 'res_gen7_quantum_photonic').ok, true);

    // Apex RP Dividend (+10%) activates on top of HQ Lv 3 (+10%) => 1.20x
    const fx6 = getCorporateSynergyEffects(sixOfSix);
    assert.ok(Math.abs(fx6.rpBonusMult - 1.2) < 1e-6, `Expected 1.20x RP mult, got ${fx6.rpBonusMult}`);

    // Evaluate milestones before Gen-7 completion
    const prog1 = evaluateProgression(sixOfSix, 5000);
    assert.ok(prog1.nextState.unlockedMilestones.includes('ms_conglomerate_hq'));
    assert.ok(prog1.nextState.unlockedMilestones.includes('ms_six_business_monopoly'));
    assert.ok(prog1.nextState.unlockedAchievements.includes('ach_conglomerate_titan'));
    assert.equal(prog1.nextState.unlockedMilestones.includes('ms_gen7_quantum_program'), false);

    // Complete Gen-7 Quantum & Photonic Architecture -> unlocks Gen-7 milestone & achievement
    const withGen7: GameState = {
      ...prog1.nextState,
      unlockedResearch: [...prog1.nextState.unlockedResearch, 'res_gen7_quantum_photonic'],
    };
    const prog2 = evaluateProgression(withGen7, 8000);
    assert.ok(prog2.nextState.unlockedMilestones.includes('ms_gen7_quantum_program'));
    assert.ok(prog2.nextState.unlockedAchievements.includes('ach_gen7_architect'));
  });

  it('2. Scenarios CONGLOMERATE_GEN6, GEN5, GEN6, GEN7, and QUANTUM_PHOTONIC boot cleanly with conglomerate state', () => {
    const cong6 = createScenarioState('CONGLOMERATE_GEN6');
    assert.equal(cong6.scenarioId, 'CONGLOMERATE_GEN6');
    assert.equal(getOwnedBusinessIds(cong6).length, 4);
    assert.equal(cong6.conglomerate?.hq.established, true);
    assert.equal(cong6.conglomerate?.hq.hqLevel, 3);
    assert.equal(cong6.conglomerate?.hq.activeSynergies.length, 3);
    const targetIds = new Set(cong6.conglomerate?.acquisitions.availableTargets.map((t) => t.businessId));
    assert.deepEqual(targetIds, new Set(['MINING_SERVICES', 'UNDERGROUND']));

    const gen5 = createScenarioState('GEN5');
    assert.equal(gen5.conglomerate?.generation.gen5ExpansionTriggered, true);
    assert.ok((gen5.conglomerate?.acquisitions.availableTargets.length ?? 0) > 0);

    const gen6 = createScenarioState('GEN6');
    assert.equal(gen6.conglomerate?.generation.gen5ExpansionTriggered, true);
    assert.ok((gen6.conglomerate?.acquisitions.availableTargets.length ?? 0) > 0);

    const gen7 = createScenarioState('GEN7');
    assert.equal(areAllSixBusinessesOwned(gen7), true);
    assert.equal(gen7.conglomerate?.hq.established, true);
    assert.equal(gen7.conglomerate?.hq.hqLevel, 5);
    assert.equal(gen7.conglomerate?.generation.gen7ConglomerateUnlocked, true);

    const qp = createScenarioState('QUANTUM_PHOTONIC');
    assert.equal(areAllSixBusinessesOwned(qp), true);
    assert.equal(qp.conglomerate?.generation.gen7ConglomerateUnlocked, true);
  });

  it('3. Acquiring remaining targets from CONGLOMERATE_GEN6 unlocks Gen-7 R&D & updates HQ report cleanly', () => {
    const base = createScenarioState('CONGLOMERATE_GEN6');
    const careerCong6: GameState = {
      ...base,
      isSandbox: false,
      isDevSession: false,
      devUnlockAll: false,
      cash: 120_000_000,
    };

    // Locked report shows missing divisions
    const reportLocked = formatCorporateHQReport(careerCong6);
    assert.match(reportLocked, /Gen-7 Program\s+:\s+LOCKED \(Missing: Mining Services, Underground\)/);
    assert.equal(canStartResearchNode(careerCong6, 'res_gen7_quantum_photonic').ok, false);

    // Acquire both remaining divisions
    const acq1 = acquireTargetCompany(careerCong6, 'services');
    assert.equal(acq1.ok, true, acq1.summary);
    const acq2 = acquireTargetCompany(acq1.nextState, 'underground');
    assert.equal(acq2.ok, true, acq2.summary);

    assert.equal(areAllSixBusinessesOwned(acq2.nextState), true);
    assert.equal(canStartResearchNode(acq2.nextState, 'res_gen7_quantum_photonic').ok, true);

    // Before turnaround finishes, report shows UNLOCKED (6/6 Owned)
    const reportOwned = formatCorporateHQReport(acq2.nextState);
    assert.match(reportOwned, /Gen-7 Program\s+:\s+UNLOCKED \(6\/6 Owned\)/);

    // Fund turnarounds on both so all 6 are ACTIVE -> Apex RP Dividend shows in HQ report
    const turn1 = fundBusinessTurnaround(acq2.nextState, 'services');
    assert.equal(turn1.ok, true, turn1.summary);
    const turn2 = fundBusinessTurnaround(turn1.nextState, 'underground');
    assert.equal(turn2.ok, true, turn2.summary);

    const stepped = stepMany(turn2.nextState, 2);
    const reportApex = formatCorporateHQReport(stepped);
    assert.match(reportApex, /Gen-7 Program\s+:\s+UNLOCKED \(6\/6 Active · \+10% Apex RP Dividend\)/);

    // Fresh career game baseline still starts Gen 1 with 1/6 businesses owned
    const starter = createNewGameState('STANDARD', false, 'PHASE8_STARTER');
    assert.equal(getOwnedBusinessIds(starter).length, 1);
  });
});
