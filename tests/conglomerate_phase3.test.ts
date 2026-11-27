import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireTargetCompany,
  advanceOneStep,
  areAllSixBusinessesOwned,
  canStartResearchNode,
  createNewGameState,
  fundBusinessTurnaround,
  getOwnedBusinessIds,
  inspectAcquisitionTarget,
  isAcquisitionUnlocked,
  recordAffinitySignals,
  refreshAcquisitionMarket,
  resolvePendingEvent,
} from '../src/engine/simulation';
import type { GameState } from '../src/types/game';

function stepUntil(state: GameState, targetStep: number): GameState {
  let cur = state;
  while (cur.stepCount < targetStep) {
    if (cur.pendingEvent) {
      cur = resolvePendingEvent(cur, cur.pendingEvent.options[0].key).nextState;
    } else {
      cur = advanceOneStep(cur).nextState;
    }
  }
  return cur;
}

describe('Phase 3 — Gen 5 Expansion Opportunity & Bankrupt Company Acquisitions', () => {
  it('1. M&A market stays locked before Gen 5 in standard Career mode', () => {
    const early = createNewGameState('STANDARD', false, 'PHASE3_PREGEN5', undefined, null, 'VETERAN');
    assert.equal(isAcquisitionUnlocked(early), false);
    const blockedInspect = inspectAcquisitionTarget(early, '1');
    assert.equal(blockedInspect.ok, false);
    const blockedBuy = acquireTargetCompany(early, '1');
    assert.equal(blockedBuy.ok, false);
  });

  it('2. Reaching Gen 5 opens M&A and prioritizes the highest hidden affinity business', () => {
    let state = createNewGameState('STANDARD', false, 'PHASE3_GEN5_OFFER', undefined, null, 'VETERAN');
    state = {
      ...state,
      cash: 6_000_000,
      unlockedResearch: ['res_gen4_hyperhash', 'res_cryo_cooling', 'res_gen5_exascale'],
      conglomerate: {
        ...state.conglomerate!,
        affinity: recordAffinitySignals(
          state.conglomerate!.affinity,
          { HARDWARE_ENG: 120, MARKET_INTEL: 30 },
          state.stepCount
        ),
      },
    };

    state = stepUntil(state, 1);
    assert.equal(state.conglomerate?.generation.gen5ExpansionTriggered, true);
    assert.equal(isAcquisitionUnlocked(state), true);
    assert.equal(state.conglomerate?.acquisitions.expansionOpportunityUnlocked, true);

    const targets = state.conglomerate?.acquisitions.availableTargets ?? [];
    assert.ok(targets.length >= 2, 'Distressed acquisition board must be populated at Gen 5');
    assert.equal(
      targets[0].businessId,
      'HARDWARE_ENG',
      'Lead target #1 must match highest hidden affinity (HARDWARE_ENG)'
    );
  });

  it('3. Due diligence inspection, buyout, and natural or funded turnaround work end-to-end', () => {
    let state = createNewGameState('STANDARD', false, 'PHASE3_ACQUIRE', undefined, null, 'VETERAN');
    state = {
      ...state,
      cash: 8_000_000,
      unlockedResearch: ['res_gen5_exascale'],
    };
    state = stepUntil(state, 1);

    const inspectRes = inspectAcquisitionTarget(state, '1');
    assert.equal(inspectRes.ok, true);
    assert.equal(inspectRes.target?.inspected, true);
    assert.match(inspectRes.summary, /DUE DILIGENCE DOSSIER/);
    state = inspectRes.nextState;

    const target = state.conglomerate!.acquisitions.availableTargets[0];
    const closingCost = target.purchasePriceUsd + target.assumedDebtUsd;
    const cashBefore = state.cash;

    const buyRes = acquireTargetCompany(state, '1');
    assert.equal(buyRes.ok, true, buyRes.summary);
    state = buyRes.nextState;

    assert.equal(state.cash, cashBefore - closingCost);
    assert.equal(state.conglomerate?.businesses[target.businessId].status, 'RECOVERING');
    assert.equal(state.conglomerate?.generation.gen6Unlocked, true);
    assert.equal(getOwnedBusinessIds(state).length, 2);

    // Fund turnaround on target #1
    const turnRes = fundBusinessTurnaround(state, target.businessId);
    assert.equal(turnRes.ok, true, turnRes.summary);
    state = turnRes.nextState;
    assert.equal(state.conglomerate?.businesses[target.businessId].status, 'ACTIVE');
    assert.equal(state.conglomerate?.businesses[target.businessId].recoveryStepsRemaining, 0);

    // Acquire second target and let natural turnaround count down to ACTIVE
    const buy2 = acquireTargetCompany(state, '1');
    assert.equal(buy2.ok, true, buy2.summary);
    state = buy2.nextState;
    const secondBizId = state.conglomerate!.businesses
      ? Object.values(state.conglomerate!.businesses).find((b) => b.status === 'RECOVERING')?.id
      : undefined;
    assert.ok(secondBizId, 'Second acquired division should be RECOVERING');
    const recoverySteps = state.conglomerate!.businesses[secondBizId].recoveryStepsRemaining;
    state = stepUntil(state, state.stepCount + recoverySteps);
    assert.equal(state.conglomerate?.businesses[secondBizId].status, 'ACTIVE');
  });

  it('4. Acquiring all five non-mining businesses unlocks Gen 7 Quantum & Photonic R&D', () => {
    let state = createNewGameState('STANDARD', false, 'PHASE3_ALL6', undefined, null, 'VETERAN');
    state = {
      ...state,
      cash: 25_000_000,
      unlockedResearch: ['res_gen5_exascale', 'res_gen6_ai_convergence'],
    };
    state = stepUntil(state, 1);

    // Still locked before owning all 6
    assert.equal(canStartResearchNode(state, 'res_gen7_quantum_photonic').ok, false);

    for (let i = 0; i < 5; i += 1) {
      if ((state.conglomerate?.acquisitions.availableTargets.length ?? 0) === 0) {
        state = refreshAcquisitionMarket(state).nextState;
      }
      const res = acquireTargetCompany(state, '1');
      assert.equal(res.ok, true, `Acquisition #${i + 1} failed: ${res.summary}`);
      state = res.nextState;
    }

    assert.equal(getOwnedBusinessIds(state).length, 6);
    assert.equal(areAllSixBusinessesOwned(state), true);
    assert.equal(state.conglomerate?.generation.gen7ConglomerateUnlocked, true);
    assert.equal(canStartResearchNode(state, 'res_gen7_quantum_photonic').ok, true);
  });
});
