import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireTargetCompany,
  advanceOneStep,
  analyzeCoinForecast,
  buildDefaultConglomerate,
  createNewGameState,
  dropHostingClient,
  establishCorporateHQ,
  expandHostingInfrastructure,
  expandIntelSubscriptions,
  formatMarketForecastReport,
  formatMarketIntelReport,
  formatMiningServicesReport,
  fundBusinessTurnaround,
  getMaxIntelSubscriptions,
  getSubscriptionStepRevenueUsd,
  grantAllSixBusinessesForScenario,
  leaseComputeCapacity,
  onboardHostingClient,
  performServicesSlaAudit,
  resolvePendingEvent,
  runMarketForecastModel,
  sellPredictionSoftwareLicenses,
  setCommercialPoolFee,
  stepMiningServicesDivision,
  toggleCommercialPool,
  toggleIntelAdvisory,
  toggleSynergyPolicy,
  upgradePredictionModel,
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

describe('Conglomerate Phase 5 — Market Intelligence & Mining Services Division Loops', () => {
  it('1. Market Intelligence gates pre-ownership/RECOVERING and supports forecast runs, model upgrades, subscriptions, licensing & advisory RP', () => {
    const base = createNewGameState('STANDARD', false, 'PHASE5_MARKET_INTEL');
    const rich: GameState = {
      ...base,
      cash: 12_000_000,
      unlockedResearch: ['res_gen5_exascale'],
    };

    // Blocked before owning Market Intelligence
    const preOwn = runMarketForecastModel(rich);
    assert.equal(preOwn.ok, false);
    assert.match(preOwn.summary, /not owned yet/i);

    // Reach Gen 5 and acquire Market Intelligence (starts RECOVERING)
    const atGen5 = stepMany(rich, 1);
    const acq = acquireTargetCompany(atGen5, 'market_intel');
    assert.equal(acq.ok, true, acq.summary);

    const blockedRecover = runMarketForecastModel(acq.nextState);
    assert.equal(blockedRecover.ok, false);
    assert.match(blockedRecover.summary, /RECOVERING/i);

    // Fund turnaround -> ACTIVE
    const activeState = fundBusinessTurnaround(acq.nextState, 'market_intel').nextState;
    const prevAcc = activeState.conglomerate!.marketIntel.predictionAccuracyPct;
    const prevRp = activeState.researchPoints;

    // 1. Run forecast model -> accuracy & RP increase, 3-step cooldown blocks immediate repeat
    const run1 = runMarketForecastModel(activeState);
    assert.equal(run1.ok, true, run1.summary);
    assert.ok(run1.nextState.conglomerate!.marketIntel.predictionAccuracyPct > prevAcc);
    assert.ok(run1.nextState.researchPoints > prevRp);
    const runCooldown = runMarketForecastModel(run1.nextState);
    assert.equal(runCooldown.ok, false);
    assert.match(runCooldown.summary, /recalibrating/i);

    // 2. Upgrade forecasting model -> Tier 2, higher subscription cap
    const capTier1 = getMaxIntelSubscriptions(
      run1.nextState,
      run1.nextState.conglomerate!.marketIntel,
      run1.nextState.conglomerate!.businesses.MARKET_INTEL.level
    );
    const upg = upgradePredictionModel(run1.nextState);
    assert.equal(upg.ok, true, upg.summary);
    assert.equal(upg.nextState.conglomerate!.marketIntel.modelTier, 2);
    const capTier2 = getMaxIntelSubscriptions(
      upg.nextState,
      upg.nextState.conglomerate!.marketIntel,
      upg.nextState.conglomerate!.businesses.MARKET_INTEL.level
    );
    assert.ok(capTier2 > capTier1);

    // 3. Onboard subscriptions up to cap, then verify cap enforcement
    const subFill = expandIntelSubscriptions(upg.nextState, 100);
    assert.equal(subFill.ok, true, subFill.summary);
    assert.equal(subFill.nextState.conglomerate!.marketIntel.activeSubscriptions, capTier2);
    const subOver = expandIntelSubscriptions(subFill.nextState, 1);
    assert.equal(subOver.ok, false);
    assert.match(subOver.summary, /capacity full/i);

    // 4. Sell prediction software licenses -> cash + 4-step cooldown
    const cashBeforeLic = subFill.nextState.cash;
    const lic1 = sellPredictionSoftwareLicenses(subFill.nextState, 2);
    assert.equal(lic1.ok, true, lic1.summary);
    assert.ok(lic1.nextState.cash > cashBeforeLic);
    assert.equal(lic1.nextState.conglomerate!.marketIntel.softwareLicensesSold, 2);
    const licCooldown = sellPredictionSoftwareLicenses(lic1.nextState, 1);
    assert.equal(licCooldown.ok, false);
    assert.match(licCooldown.summary, /recharging/i);

    // 5. Toggle advisory desk ON -> formatMarketForecastReport includes Intel header & steps generate recurring sub revenue + advisory RP
    const advOn = toggleIntelAdvisory(lic1.nextState);
    assert.equal(advOn.ok, true, advOn.summary);
    assert.equal(advOn.nextState.conglomerate!.marketIntel.advisoryActive, true);
    const forecastReport = formatMarketForecastReport(advOn.nextState);
    assert.match(forecastReport, /Quant Desk: DIVISION ACTIVE/i);
    assert.ok(Number.isFinite(analyzeCoinForecast(advOn.nextState.coins.BTC, advOn.nextState).projectedBiasPct));

    const expectedSubRev = getSubscriptionStepRevenueUsd(
      advOn.nextState.conglomerate!.marketIntel,
      advOn.nextState.conglomerate!.businesses.MARKET_INTEL.efficiencyMult
    );
    assert.ok(expectedSubRev > 0);
    const revBeforeStep = advOn.nextState.conglomerate!.businesses.MARKET_INTEL.ledger.totalRevenueUsd;
    const rpBeforeStep = advOn.nextState.researchPoints;
    const afterStep = advanceOneStep(advOn.nextState).nextState;
    assert.ok(
      afterStep.conglomerate!.businesses.MARKET_INTEL.ledger.totalRevenueUsd >= revBeforeStep + expectedSubRev - 0.01,
      'Expected recurring subscription revenue logged on MARKET_INTEL ledger'
    );
    assert.ok(afterStep.researchPoints > rpBeforeStep, 'Expected advisory RP bonus on step');
  });

  it('2. Mining Services supports commercial pool, colocation expansion, client limits, 12-step compute leases, SLA audits & MFG synergy boost', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'PHASE5_MINING_SERVICES');
    const allCong = grantAllSixBusinessesForScenario(buildDefaultConglomerate(base), base.stepCount);
    const startState: GameState = {
      ...base,
      cash: 10_000_000,
      conglomerate: {
        ...allCong,
        hq: {
          ...allCong.hq,
          established: true,
          hqLevel: 3,
          activeSynergies: [],
        },
        miningServices: {
          ...allCong.miningServices,
          poolOperatorActive: false,
          poolFeePct: 1.5,
          rentedCapacityKw: 40,
          hostedClientsCount: 0,
          slaCompliancePct: 76,
        },
      },
    };

    // Commercial pool toggle & fee bounds validation
    const poolOn = toggleCommercialPool(startState);
    assert.equal(poolOn.ok, true);
    assert.equal(poolOn.nextState.conglomerate!.miningServices.poolOperatorActive, true);

    const badFee = setCommercialPoolFee(poolOn.nextState, 8.0);
    assert.equal(badFee.ok, false);
    const goodFee = setCommercialPoolFee(poolOn.nextState, 1.85);
    assert.equal(goodFee.ok, true);
    assert.equal(goodFee.nextState.conglomerate!.miningServices.poolFeePct, 1.85);

    // 40 kW fits 2 clients (18 kW each = 36 kW); 3rd client rejected until expanded
    const onboard2 = onboardHostingClient(goodFee.nextState, 5);
    assert.equal(onboard2.ok, true, onboard2.summary);
    assert.equal(onboard2.nextState.conglomerate!.miningServices.hostedClientsCount, 2);
    const fullBlocked = onboardHostingClient(onboard2.nextState, 1);
    assert.equal(fullBlocked.ok, false);
    assert.match(fullBlocked.summary, /full/i);

    // Expand +50 kW -> 90 kW total -> room for compute lease + additional clients
    const expanded = expandHostingInfrastructure(onboard2.nextState, 50);
    assert.equal(expanded.ok, true, expanded.summary);
    assert.equal(expanded.nextState.conglomerate!.miningServices.rentedCapacityKw, 90);

    // Lease 2 compute pods (24 kW) for 12 steps
    const leased = leaseComputeCapacity(expanded.nextState, 2);
    assert.equal(leased.ok, true, leased.summary);
    assert.equal(leased.nextState.conglomerate!.miningServices.activeComputeLeases, 2);
    assert.equal(leased.nextState.conglomerate!.miningServices.computeLeaseStepsRemaining, 12);

    // Test dropHostingClient frees capacity cleanly
    const dropped = dropHostingClient(leased.nextState, 1);
    assert.equal(dropped.ok, true, dropped.summary);
    assert.equal(dropped.nextState.conglomerate!.miningServices.hostedClientsCount, 1);

    // SLA audit restores +18% SLA compliance
    const audited = performServicesSlaAudit(dropped.nextState);
    assert.equal(audited.ok, true, audited.summary);
    assert.equal(audited.nextState.conglomerate!.miningServices.slaCompliancePct, 94);

    // Breaker overload degrades SLA in stepMiningServicesDivision; MFG_TO_SERVICES lifts net hosting revenue
    const overloadStep = stepMiningServicesDivision(
      audited.nextState,
      audited.nextState.conglomerate!,
      audited.nextState.stepCount + 1,
      'S1',
      { breakerOverloaded: true, facilityRate: 0.08, strikeStepsRemaining: 0 }
    );
    assert.ok(
      overloadStep.conglomerate.miningServices.slaCompliancePct < 94,
      'Breaker overload must erode Mining Services SLA compliance'
    );

    const normalNoSyn = stepMiningServicesDivision(
      audited.nextState,
      audited.nextState.conglomerate!,
      audited.nextState.stepCount + 1,
      'S1',
      { breakerOverloaded: false, facilityRate: 0.08, strikeStepsRemaining: 0 }
    );
    const withMfgSyn = toggleSynergyPolicy(audited.nextState, 'MFG_TO_SERVICES').nextState;
    const normalWithSyn = stepMiningServicesDivision(
      withMfgSyn,
      withMfgSyn.conglomerate!,
      withMfgSyn.stepCount + 1,
      'S1',
      { breakerOverloaded: false, facilityRate: 0.08, strikeStepsRemaining: 0 }
    );
    assert.ok(
      normalWithSyn.cashDeltaUsd > normalNoSyn.cashDeltaUsd,
      'MFG_TO_SERVICES should boost Mining Services hosting/lease revenue'
    );

    // Step 12 times in full engine -> 12-step compute lease settles & completes with news
    const after12 = stepMany(withMfgSyn, 12);
    assert.equal(after12.conglomerate!.miningServices.activeComputeLeases, 0);
    assert.equal(after12.conglomerate!.miningServices.computeLeaseStepsRemaining, 0);
    assert.ok(after12.conglomerate!.businesses.MINING_SERVICES.ledger.totalRevenueUsd > 0);
    assert.ok(
      after12.news.some((n) => /Compute Rental Contract Completed/i.test(n.title)),
      'Expected lease completion news entry'
    );
  });

  it('3. Preserves deterministic step RNG and renders Market Intel & Mining Services reports cleanly', () => {
    const s1 = createNewGameState('STANDARD', false, 'PHASE5_DET_SEED');
    const s2Base = createNewGameState('STANDARD', false, 'PHASE5_DET_SEED');
    const s2Cong = grantAllSixBusinessesForScenario(buildDefaultConglomerate(s2Base), s2Base.stepCount);
    const s2: GameState = {
      ...s2Base,
      conglomerate: {
        ...s2Cong,
        marketIntel: {
          ...s2Cong.marketIntel,
          activeSubscriptions: 4,
          advisoryActive: true,
        },
        miningServices: {
          ...s2Cong.miningServices,
          poolOperatorActive: true,
          rentedCapacityKw: 100,
          hostedClientsCount: 2,
          activeComputeLeases: 1,
          computeLeaseStepsRemaining: 6,
        },
      },
    };

    const next1 = stepMany(s1, 10);
    const next2 = stepMany(s2, 10);

    // BTC price & market regime remain byte-identical because Phase 5 division steps never touch stepRng
    assert.equal(next1.coins.BTC.priceUsd, next2.coins.BTC.priceUsd);
    assert.equal(next1.marketRegime, next2.marketRegime);

    assert.match(formatMarketIntelReport(next2), /BUSINESS 2 \/\/ MARKET INTELLIGENCE/);
    assert.match(formatMiningServicesReport(next2), /BUSINESS 5 \/\/ MINING SERVICES/);
  });
});
