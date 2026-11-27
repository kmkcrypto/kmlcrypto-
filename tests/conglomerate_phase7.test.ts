import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireTargetCompany,
  advanceOneStep,
  buildDefaultConglomerate,
  containParentSpillover,
  createNewGameState,
  developShellCoin,
  formatUndergroundDivisionReport,
  fundBusinessTurnaround,
  getUndergroundDivisionEffects,
  grantAllSixBusinessesForScenario,
  hardenShellSubsidiary,
  MAX_SUBSIDIARY_SHIELD_PCT,
  resolvePendingEvent,
  runAuditFirewallSweep,
  startUndergroundContract,
  stepUndergroundDivision,
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

describe('Conglomerate Phase 7 — Underground Subsidiary & Parent Risk Spillover', () => {
  it('1. Early-game underground tools stay untouched while B6 division commands gate cleanly', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE7_EARLY');
    const richEarly: GameState = {
      ...base,
      cash: 25_000_000,
      unlockedResearch: ['res_gen5_exascale'],
    };

    // Early ops command still works before acquiring Business 6
    const shellRes = developShellCoin(richEarly, 'SHAD', 'Shadow Token');
    assert.equal(shellRes.ok, true);
    assert.equal(getUndergroundDivisionEffects(shellRes.nextState).active, false);

    // Gated prior to ownership
    const preOwn = hardenShellSubsidiary(shellRes.nextState);
    assert.equal(preOwn.ok, false);
    assert.match(preOwn.summary, /not owned yet/i);

    // Gated while RECOVERING after Gen 5 buyout
    const congBias = buildDefaultConglomerate(shellRes.nextState, shellRes.nextState.conglomerate);
    const atGen5 = stepMany(
      {
        ...shellRes.nextState,
        conglomerate: {
          ...congBias,
          affinity: {
            ...congBias.affinity,
            scores: { ...congBias.affinity.scores, UNDERGROUND: 600 },
          },
        },
      },
      1
    );
    const acq = acquireTargetCompany(atGen5, 'underground');
    assert.equal(acq.ok, true, acq.summary);

    const recoverBlocked = startUndergroundContract(acq.nextState, 'escrow');
    assert.equal(recoverBlocked.ok, false);
    assert.match(recoverBlocked.summary, /RECOVERING/i);
  });

  it('2. Shell shielding, firewall sweep, spillover containment & unstable heat-sensitive contracts', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE7_OPS');
    const congBias = buildDefaultConglomerate(base, base.conglomerate);
    const atGen5 = stepMany(
      {
        ...base,
        cash: 30_000_000,
        unlockedResearch: ['res_gen5_exascale'],
        regulatoryScrutiny: 10,
        conglomerate: {
          ...congBias,
          affinity: {
            ...congBias.affinity,
            scores: { ...congBias.affinity.scores, UNDERGROUND: 600 },
          },
        },
      },
      1
    );
    const acq = acquireTargetCompany(atGen5, 'underground');
    assert.equal(acq.ok, true, acq.summary);
    let active = fundBusinessTurnaround(acq.nextState, 'underground').nextState;
    active = { ...active, regulatoryScrutiny: 8 };

    // 1. Harden shell subsidiary toward MAX_SUBSIDIARY_SHIELD_PCT
    const shield1 = hardenShellSubsidiary(active);
    assert.equal(shield1.ok, true, shield1.summary);
    assert.ok(
      shield1.nextState.conglomerate!.undergroundDiv.shellSubsidiaryShieldPct >
        active.conglomerate!.undergroundDiv.shellSubsidiaryShieldPct
    );
    assert.ok(getUndergroundDivisionEffects(shield1.nextState).effectiveShieldPct > 25);

    let maxShielded = shield1.nextState;
    for (let i = 0; i < 6; i++) {
      const next = hardenShellSubsidiary(maxShielded);
      if (!next.ok) break;
      maxShielded = next.nextState;
    }
    assert.equal(
      maxShielded.conglomerate!.undergroundDiv.shellSubsidiaryShieldPct,
      MAX_SUBSIDIARY_SHIELD_PCT
    );
    assert.equal(hardenShellSubsidiary(maxShielded).ok, false);

    // 2. Low-heat contract settles full base payout cleanly
    const ctrLowHeat = startUndergroundContract(
      { ...maxShielded, regulatoryScrutiny: 5 },
      'escrow'
    );
    assert.equal(ctrLowHeat.ok, true, ctrLowHeat.summary);
    assert.equal(
      startUndergroundContract(ctrLowHeat.nextState, 'liquidity').ok,
      false,
      'Only 1 active subsidiary contract allowed'
    );
    const expectedBase = ctrLowHeat.nextState.conglomerate!.undergroundDiv.activeContract!.basePayoutUsd;
    const revBeforeLow = ctrLowHeat.nextState.conglomerate!.businesses.UNDERGROUND.ledger.totalRevenueUsd;
    const afterLow = stepMany(ctrLowHeat.nextState, 4);
    assert.equal(afterLow.conglomerate!.undergroundDiv.activeContract, null);
    assert.ok(
      afterLow.conglomerate!.businesses.UNDERGROUND.ledger.totalRevenueUsd >= revBeforeLow + expectedBase - 0.01
    );

    // 3. High-heat/sanctioned contract experiences regulatory seizure haircut
    const hotState: GameState = {
      ...afterLow,
      regulatoryScrutiny: 88,
      underground: {
        ...afterLow.underground,
        investigationStage: 'SANCTIONED',
        marketConfidencePenaltyPct: 5,
      },
    };
    const ctrHot = startUndergroundContract(hotState, 'liquidity');
    assert.equal(ctrHot.ok, true, ctrHot.summary);
    const hotBase = ctrHot.nextState.conglomerate!.undergroundDiv.activeContract!.basePayoutUsd;
    const hotStep = stepUndergroundDivision(
      { ...ctrHot.nextState, regulatoryScrutiny: 90 },
      {
        ...ctrHot.nextState.conglomerate!,
        undergroundDiv: {
          ...ctrHot.nextState.conglomerate!.undergroundDiv,
          activeContract: {
            ...ctrHot.nextState.conglomerate!.undergroundDiv.activeContract!,
            stepsRemaining: 1,
          },
        },
      },
      ctrHot.nextState.stepCount + 1,
      'S_HOT'
    );
    assert.ok(
      hotStep.conglomerate.businesses.UNDERGROUND.ledger.totalRevenueUsd -
        ctrHot.nextState.conglomerate!.businesses.UNDERGROUND.ledger.totalRevenueUsd <
        hotBase,
      'Sanctioned / high-heat contract must incur seizure haircut'
    );

    // 4. Firewall sweep reduces Heat + suspicion and enforces 4-step cooldown; containment restores credibility
    const sweep = runAuditFirewallSweep(hotState);
    assert.equal(sweep.ok, true, sweep.summary);
    assert.ok(sweep.nextState.regulatoryScrutiny < hotState.regulatoryScrutiny);
    assert.equal(runAuditFirewallSweep(sweep.nextState).ok, false);

    const contained = containParentSpillover({
      ...sweep.nextState,
      mediaCredibility: 60,
    });
    assert.equal(contained.ok, true, contained.summary);
    assert.equal(contained.nextState.mediaCredibility, 65);
    assert.ok(
      (contained.nextState.underground.marketConfidencePenaltyPct ?? 0) <
        (hotState.underground.marketConfidencePenaltyPct ?? 0)
    );
  });

  it('3. High Heat triggers parent risk spillover, and shell shielding cuts spillover damage', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE7_SPILL');
    const allCong = grantAllSixBusinessesForScenario(
      buildDefaultConglomerate(base, base.conglomerate),
      0
    );

    const unshieldedHot: GameState = {
      ...base,
      cash: 2_000_000,
      regulatoryScrutiny: 82,
      mediaCredibility: 80,
      underground: {
        ...base.underground,
        investigationStage: 'FORMAL_AUDIT',
        scandalMarks: 2,
      },
      conglomerate: {
        ...allCong,
        undergroundDiv: {
          subsidiaryStructured: false,
          shellSubsidiaryShieldPct: 0,
          parentRiskSpilloverCount: 0,
          launderCapacityBonusPct: 0,
        },
      },
    };

    const unshieldedOut = stepUndergroundDivision(
      unshieldedHot,
      unshieldedHot.conglomerate!,
      2,
      'S2'
    );
    assert.equal(unshieldedOut.alertHit, true);
    assert.equal(unshieldedOut.conglomerate.undergroundDiv.parentRiskSpilloverCount, 1);
    assert.ok(unshieldedOut.mediaCredibilityDelta < 0);
    assert.ok(unshieldedOut.confidencePenaltyDeltaPct > 0);
    assert.ok(unshieldedOut.cashDeltaUsd < -1_000);

    const shieldedHot: GameState = {
      ...unshieldedHot,
      conglomerate: {
        ...unshieldedHot.conglomerate!,
        undergroundDiv: {
          subsidiaryStructured: true,
          shellSubsidiaryShieldPct: 60,
          parentRiskSpilloverCount: 0,
          launderCapacityBonusPct: 20,
        },
      },
    };
    const shieldedOut = stepUndergroundDivision(
      shieldedHot,
      shieldedHot.conglomerate!,
      4,
      'S4'
    );
    assert.equal(shieldedOut.conglomerate.undergroundDiv.parentRiskSpilloverCount, 1);
    assert.ok(
      Math.abs(shieldedOut.mediaCredibilityDelta) < Math.abs(unshieldedOut.mediaCredibilityDelta),
      'Hardened shell subsidiary must reduce credibility hit to parent'
    );
    assert.ok(
      shieldedOut.cashDeltaUsd > unshieldedOut.cashDeltaUsd,
      'Hardened shell subsidiary must reduce parent legal defense cash hit'
    );
  });

  it('4. Phase 7 determinism & Underground division report formatting', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE7_DET');
    const scenario: GameState = {
      ...base,
      cash: 50_000_000,
      conglomerate: grantAllSixBusinessesForScenario(
        buildDefaultConglomerate(base, base.conglomerate),
        0
      ),
    };
    const shielded = hardenShellSubsidiary(scenario).nextState;
    const withCtr = startUndergroundContract(shielded, 'pressure').nextState;

    const runA = stepMany(withCtr, 5);
    const runB = stepMany(withCtr, 5);
    assert.equal(runA.cash, runB.cash);
    assert.equal(runA.mediaCredibility, runB.mediaCredibility);
    assert.deepEqual(runA.conglomerate, runB.conglomerate);

    const report = formatUndergroundDivisionReport(runA);
    assert.match(report, /BUSINESS 6 \/\/ UNDERGROUND SUBSIDIARY/);
    assert.match(report, /RING-FENCED SPV/);
  });
});
