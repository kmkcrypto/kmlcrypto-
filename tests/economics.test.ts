import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceOneStep, createNewGameState } from '../src/engine/simulation';
import {
  computeMarketSensitivity,
  computeRigContributions,
  computeStepEconomics,
  formatCashRunway,
} from '../src/engine/economics';
import { formatOperatingEconomicsReport, formatStatsReport } from '../src/components/terminal/reports';

function steppedGame(seed: string) {
  return advanceOneStep(createNewGameState('STANDARD', false, seed)).nextState;
}

describe('HASHRATE economics: operating profit, runway and per-rig contribution', () => {
  it('1. Operating economics reconcile revenue against every per-step cost', () => {
    const state = steppedGame('TEST-ECON-1');
    const econ = computeStepEconomics(state);
    const expectedCost =
      econ.powerCostPerStepUsd +
      econ.payrollPerStepUsd +
      econ.rentPerStepUsd +
      econ.maintenancePerStepUsd +
      econ.fixedFeePerStepUsd;

    assert.ok(econ.grossRevenuePerStepUsd > 0, 'starter rig should earn after one step');
    assert.ok(Math.abs(econ.operatingCostPerStepUsd - expectedCost) < 1e-6);
    assert.ok(
      Math.abs(
        econ.netOperatingPerStepUsd - (econ.grossRevenuePerStepUsd - expectedCost)
      ) < 1e-6
    );
    assert.ok(Math.abs(econ.breakEvenRevenuePerStepUsd - expectedCost) < 1e-6);
  });

  it('2. Cash runway and break-even power follow the operating result', () => {
    const econ = computeStepEconomics(steppedGame('TEST-ECON-2'));
    if (econ.netOperatingPerStepUsd < 0) {
      assert.ok(econ.cashRunwaySteps !== null && econ.cashRunwaySteps > 0);
      assert.ok(econ.breakEvenPowerRatePerKwh !== null);
      assert.ok(
        econ.breakEvenPowerRatePerKwh! < econ.currentPowerRatePerKwh,
        'losing money at the current rate means break-even power is lower'
      );
    } else {
      assert.equal(econ.cashRunwaySteps, null);
      assert.ok(
        econ.breakEvenPowerRatePerKwh === null ||
          econ.breakEvenPowerRatePerKwh > econ.currentPowerRatePerKwh
      );
    }
    assert.equal(formatCashRunway(null), 'Profitable — no cash burn');
    assert.match(formatCashRunway(12, 24), /12 steps \(~12 days\)/);
  });

  it('3. Per-rig contribution is revenue minus that rig power draw', () => {
    const state = steppedGame('TEST-ECON-3');
    const contributions = computeRigContributions(state);
    assert.equal(contributions.length, state.rigs.length);
    for (const c of contributions) {
      assert.ok(
        Math.abs(c.contributionPerStepUsd - (c.revenuePerStepUsd - c.powerCostPerStepUsd)) <
          1e-6
      );
      assert.ok(c.powerCostPerStepUsd >= 0);
    }
    assert.ok(
      contributions.some((c) => c.revenuePerStepUsd > 0),
      'at least one rig should report revenue'
    );
  });

  it('3b. A brand-new rig is not flagged underwater before its first step', () => {
    const state = createNewGameState('STANDARD', false, 'TEST-ECON-START');
    const contributions = computeRigContributions(state);
    assert.equal(
      contributions.filter(
        (c) => c.producing && c.hasOperated && c.contributionPerStepUsd < 0
      ).length,
      0
    );
    assert.equal(computeMarketSensitivity(state, -20).underwaterRigs, 0);
  });

  it('4. Market sensitivity moves net profit and underwater count with revenue', () => {
    const state = steppedGame('TEST-ECON-4');
    const spot = computeMarketSensitivity(state, 0);
    const down = computeMarketSensitivity(state, -20);
    const up = computeMarketSensitivity(state, 20);

    assert.ok(down.netPerStepUsd < spot.netPerStepUsd);
    assert.ok(up.netPerStepUsd > spot.netPerStepUsd);
    assert.ok(down.underwaterRigs >= spot.underwaterRigs);
    assert.ok(up.underwaterRigs <= spot.underwaterRigs);
  });

  it('5. The performance snapshot records full operating profit, not revenue minus power', () => {
    const state = steppedGame('TEST-ECON-5');
    const snapshot = state.performanceHistory![state.performanceHistory!.length - 1];
    const econ = computeStepEconomics(state);
    assert.ok(
      Math.abs(snapshot.netPerStepUsd - econ.netOperatingPerStepUsd) < 1,
      'snapshot net should include payroll, rent, maintenance and grid fees'
    );
  });

  it('6. The stats report surfaces the operating economics block', () => {
    const state = steppedGame('TEST-ECON-6');
    const report = formatOperatingEconomicsReport(state);
    assert.match(report, /NET OPERATING PROFIT/);
    assert.match(report, /Cash Runway/);
    assert.match(report, /Break-even Power/);
    assert.match(formatStatsReport(state), /OPERATING ECONOMICS/);
  });
});
