import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPUTE_PARTS,
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  POWER_CONTRACTS,
  RESEARCH_NODES,
  ROOM_COOLING_UNITS,
} from '../src/data/catalog';
import { generateContractBoard } from '../src/engine/contracts';
import { computeValuationBreakdown, evaluateProgression } from '../src/engine/milestones';
import {
  getPlayerRivalComparison,
  investigateRivalSyndicate,
  stepRivalSyndicates,
} from '../src/engine/rivals';
import { analyzeCoinForecast, formatMarketForecastReport } from '../src/engine/marketForecast';
import {
  hydrateSavedState,
  serializeSaveEnvelope,
  validateAndParseImportedSave,
} from '../src/engine/saveSystem';
import { CODEX_ENTRIES, getUnlockedSystems, TUTORIAL_TOPICS } from '../src/data/onboarding';
import {
  previewCoolingUnit,
  previewFacilityMove,
  previewPowerContract,
  previewRigEconomics,
} from '../src/engine/previews';
import { formatPortfolioChart } from '../src/components/terminal/reports';
import {
  advanceOneStep,
  buildFabLine,
  cancelLimitOrder,
  claimCompletedObjectives,
  closeShortPosition,
  computeAverageRigHealth,
  computeCompanyValuation,
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  computeWorkloadSummary,
  createInitialComponentHealth,
  createNewGameState,
  deployCustomAsicToRig,
  designCustomChipBlueprint,
  ensureRigComponentHealth,
  executeSpotBuy,
  executeSpotSell,
  formatAsciiFloorPlan,
  formatSingleRoomView,
  generateInteractiveEvent,
  getComponentRepairCost,
  getEffectiveElectricityRate,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getElectricianBonuses,
  getFacility,
  getFacilityRooms,
  getFacilityTotals,
  getFacilityUpgradeCost,
  getManagerBonuses,
  getRigRepairCost,
  getTechnicianBonuses,
  openShortPosition,
  placeLimitOrder,
  queueFabProduction,
  resolvePendingEvent,
  sellCustomAsicsWholesale,
} from '../src/engine/simulation';
import {
  calculateRigResaleValue,
  generateUsedMarketListings,
  getGlobalHardwarePriceMult,
} from '../src/engine/usedMarket';

describe('Blockworks Tycoon 2.0 Simulation Engine', () => {
  it('1. Electricity & power contracts affect rates, capacity, and continuous billing', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_ELEC');
    const stdRate = getEffectiveElectricityRate(base);
    const budgetRate = getEffectiveElectricityRate({ ...base, powerContractId: 'contract_budget' });
    const premiumRate = getEffectiveElectricityRate({ ...base, powerContractId: 'contract_premium_flex' });

    assert.ok(budgetRate < stdRate, 'Budget spot contract should reduce $/kWh rate');
    assert.ok(premiumRate > stdRate, 'Premium dispatch contract should raise $/kWh rate');

    const stdCap = getEffectiveFacilityPowerCapKw(base);
    const budgetCap = getEffectiveFacilityPowerCapKw({ ...base, powerContractId: 'contract_budget' });
    const highCap = getEffectiveFacilityPowerCapKw({ ...base, powerContractId: 'contract_highcap' });
    const upgradedCap = getEffectiveFacilityPowerCapKw({
      ...base,
      facilityUpgrades: { additional_circuits: 2 },
    });

    assert.ok(budgetCap < stdCap, 'Budget contract should reduce kW capacity');
    assert.ok(highCap > stdCap, 'High-capacity contract should raise kW capacity');
    assert.ok(upgradedCap > stdCap, 'Circuit upgrades should expand kW capacity');

    const stepRes = advanceOneStep(base);
    assert.ok(
      stepRes.nextState.currentCycleStats.electricitySpendUsd > 0,
      'Advancing a step should accrue continuous electricity spend'
    );
  });

  it('2. Cooling units & ventilation reduce temperature and prevent thermal throttling', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_COOL');
    const fac = getFacility(base.facilityId);
    const hotRig = {
      ...base.rigs[0],
      computeId: 'cpu_i7_920',
      overclockPct: 145,
      firmwareProfile: 'TURBO' as const,
      temperatureC: 88,
    };

    const uncooled = computeRigTelemetry(hotRig, fac, [], 0, [], 1, {});
    const withFans = computeRigTelemetry(
      hotRig,
      fac,
      [],
      0,
      [
        { id: 'c1', type: 'cool_unit_ac', gridX: 2, gridY: 2, enabled: true },
      ],
      1,
      { ventilation_ducts: 2 }
    );

    assert.ok(
      withFans.equilibriumTempC < uncooled.equilibriumTempC,
      'Cooling unit + ventilation ducts must lower equilibrium temperature'
    );
    assert.ok(
      uncooled.effectiveHashrate <
        computeRigTelemetry({ ...hotRig, temperatureC: 65 }, fac, [], 0, [], 1, {}).effectiveHashrate,
      'Running above 82C should trigger thermal throttling penalty'
    );
    assert.equal(
      computeRigTelemetry({ ...hotRig, temperatureC: 97 }, fac, [], 0, [], 1, {}).effectiveHashrate,
      0,
      'Running >=96C should trigger thermal shutdown (0 hashrate)'
    );

    const summary = computeFacilityCoolingSummary(
      ROOM_COOLING_UNITS.map((u, idx) => ({
        id: `cu_${idx}`,
        type: u.id,
        gridX: 1,
        gridY: 1,
        enabled: true,
      })),
      6,
      fac,
      { industrial_cooling_loop: 1 }
    );
    assert.ok(summary.totalCoolingWatts > 0 && summary.cycleCoolingMaintUsd > 0);
  });

  it('3. Equipment wear, FAILED breakdowns, repair costs, and age/condition resale values', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_WEAR');
    const pristineRig = { ...base.rigs[0], healthPct: 100, ageSteps: 0, status: 'MINING' as const };
    const agedRig = { ...base.rigs[0], healthPct: 52, ageSteps: 120, status: 'MINING' as const };
    const failedRig = { ...base.rigs[0], healthPct: 52, ageSteps: 120, status: 'FAILED' as const };

    const pristineResale = calculateRigResaleValue(pristineRig, base);
    const agedResale = calculateRigResaleValue(agedRig, base);
    assert.ok(agedResale < pristineResale, 'Age and condition wear must depreciate resale value');

    const agedRepairCost = getRigRepairCost(agedRig, base);
    const failedRepairCost = getRigRepairCost(failedRig, base);
    assert.ok(failedRepairCost > agedRepairCost, 'FAILED breakdown surcharge should exceed normal wear repair');

    const withTech = {
      ...base,
      employees: [
        { id: 'e1', name: 'Tech A', role: 'TECHNICIAN' as const, shift: 'DAY' as const, priority: 'THERMAL_SAFETY' as const, hiredStep: 0, morale: 90, skillLevel: 3, experienceXp: 0 },
      ],
    };
    assert.ok(
      getRigRepairCost(failedRig, withTech) < failedRepairCost,
      'Hardware Technician should discount repair costs'
    );
  });

  it('4. Research tree spans 5 categories with prerequisite links', () => {
    const categories = new Set(RESEARCH_NODES.map((n) => n.category));
    assert.deepEqual(
      Array.from(categories).sort(),
      ['AUTOMATION', 'BUSINESS', 'COOLING', 'ELECTRICAL', 'HARDWARE']
    );
    const nodeIds = new Set(RESEARCH_NODES.map((n) => n.id));
    for (const node of RESEARCH_NODES) {
      for (const prereq of node.prereqIds) {
        assert.ok(nodeIds.has(prereq), `Missing prereq ${prereq} for ${node.id}`);
      }
    }
  });

  it('5. Expanded employee roles (Technician, Electrician, Manager) & skill levels apply real bonuses', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_STAFF');
    const staffed = {
      ...base,
      facilityId: 'fac_warehouse',
      employees: [
        { id: 't1', name: 'T1', role: 'TECHNICIAN' as const, shift: 'DAY' as const, priority: 'THERMAL_SAFETY' as const, hiredStep: 0, morale: 90, skillLevel: 3, experienceXp: 0 },
        { id: 'el1', name: 'E1', role: 'ELECTRICIAN' as const, shift: 'DAY' as const, priority: 'HARDWARE_CARE' as const, hiredStep: 0, morale: 90, skillLevel: 4, experienceXp: 0 },
        { id: 'm1', name: 'M1', role: 'MANAGER' as const, shift: 'DAY' as const, priority: 'HARDWARE_CARE' as const, hiredStep: 0, morale: 90, skillLevel: 3, experienceXp: 0 },
      ],
    };

    assert.ok(getTechnicianBonuses(staffed).repairDiscount > 0.3);
    assert.ok(getElectricianBonuses(staffed).capBonusPct > 0.15);
    assert.ok(getManagerBonuses(staffed).adminOverheadDiscount > 0.2);

    const unstaffedTotals = getFacilityTotals({ ...base, facilityId: 'fac_warehouse' });
    const staffedTotals = getFacilityTotals(staffed);
    assert.ok(
      staffedTotals.cycleRentUsd < unstaffedTotals.cycleRentUsd,
      'Manager should reduce facility cycle rent overhead'
    );
  });

  it('6. 6 facility progression tiers & facility upgrades scale slots, power, and costs', () => {
    assert.equal(FACILITY_TIERS.length, 6);
    assert.equal(FACILITY_UPGRADES.length, 6);
    assert.equal(POWER_CONTRACTS.length, 4);

    const base = createNewGameState('STANDARD', false, 'TEST_FAC');
    const bayUpgrade0 = getEffectiveFacilityMaxRigs(base);
    const bayUpgrade2 = getEffectiveFacilityMaxRigs({
      ...base,
      facilityUpgrades: { bay_expansion: 2 },
    });
    assert.ok(bayUpgrade2 > bayUpgrade0, 'Bay expansion should increase max rig slots');

    const costLvl0 = getFacilityUpgradeCost('additional_circuits', 0);
    const costLvl1 = getFacilityUpgradeCost('additional_circuits', 1);
    assert.ok(costLvl1 > costLvl0, 'Facility upgrade cost should scale with level');
  });

  it('7. Market modifiers & Used Equipment Marketplace pricing respond to conditions and shortages', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_MKT');
    const normalMult = getGlobalHardwarePriceMult(base);
    assert.equal(normalMult, 1);

    const shortageState = {
      ...base,
      activeMarketModifiers: [
        {
          id: 'mod_test',
          type: 'HARDWARE_SHORTAGE' as const,
          label: 'Silicon Shortage',
          stepsRemaining: 10,
          hardwarePriceMult: 1.3,
          powerRateMult: 1.0,
          resaleValueMult: 1.2,
          rivalGrowthMult: 1.0,
          coinPriceDriftDelta: 0,
          summary: 'Test shortage',
        },
      ],
    };
    assert.equal(getGlobalHardwarePriceMult(shortageState), 1.3);

    const listings = generateUsedMarketListings(base);
    assert.ok(listings.length >= 4);
    for (const item of listings) {
      assert.ok(item.listPriceUsd > 0 && item.retailPriceUsd >= item.listPriceUsd);
    }
  });

  it('8. Reputation-gated contracts & Rival syndicate comparison track progress accurately', () => {
    const lowRep = createNewGameState('STANDARD', false, 'TEST_CTR_LOW');
    lowRep.mediaCredibility = 5;
    const lowBoard = generateContractBoard(lowRep, 6);
    assert.ok(
      lowBoard.some((c) => c.minReputation === 0),
      'Starter operators should always have 0-reputation contracts available'
    );

    const steppedRivals = stepRivalSyndicates(lowRep.rivals, 7, 'BULL_RUN', 45, 1.0);
    assert.equal(steppedRivals.length, lowRep.rivals.length);

    const cmp = getPlayerRivalComparison(lowRep, 50);
    assert.ok(cmp.some((e) => e.isPlayer), 'Rival comparison table must include the player');
  });

  it('9. Milestones, achievements, and challenges evaluate win/fail states', () => {
    const boot = createNewGameState('BOOTSTRAP', false, 'TEST_CHG', undefined, 'challenge_bootstrap');
    boot.cash = 3500;
    const winRes = evaluateProgression(boot, 40);
    assert.ok(winRes.nextState.completedChallenges.includes('challenge_bootstrap'));
    assert.equal(winRes.nextState.activeChallengeId, null);

    const powerFail = createNewGameState('STANDARD', false, 'TEST_CHG_FAIL', undefined, 'challenge_power_cap');
    powerFail.stats.maxPowerKwObserved = 4.1;
    const failRes = evaluateProgression(powerFail, 40);
    assert.ok(failRes.nextState.failedChallenges.includes('challenge_power_cap'));
    assert.equal(failRes.nextState.activeChallengeId, null);
  });

  it('10. Save serialization, legacy migration, and corrupt JSON rejection work safely', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_SAVE');
    const json = serializeSaveEnvelope(base);
    const parsed = validateAndParseImportedSave(json);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.state?.runSeed, 'TEST_SAVE');
    assert.equal(parsed.state?.powerContractId, 'contract_standard');

    // Legacy v1 save object migration using `dayCount`
    const legacyRaw = {
      cash: 1950,
      dayCount: 24,
      facilityId: 'fac_garage',
      coins: base.coins,
      rigs: [
        {
          id: 'legacy_1',
          name: 'Legacy Miner',
          chassisId: 'chassis_bedroom_tower',
          computeId: 'cpu_core2_duo',
          gpuIds: [],
          storageId: 'stor_ddr3_4gb',
          psuId: 'psu_450w',
          coolingId: 'cool_stock_air',
          osId: 'os_windows7',
          targetCoin: 'BTC',
          overclockPct: 100,
          enabled: true,
          temperatureC: 54,
          healthPct: 88,
          status: 'MINING',
          lastStepCoins: 0,
          totalMinedCoins: 0,
          createdStep: 0,
        },
      ],
    };
    const migrated = hydrateSavedState(legacyRaw);
    assert.ok(migrated !== null);
    assert.equal(migrated?.stepCount, 24);
    assert.equal(migrated?.rigs[0].conditionTier, 'NEW');
    assert.equal(migrated?.powerContractId, 'contract_standard');

    const badJson = validateAndParseImportedSave('{not valid json');
    assert.equal(badJson.ok, false);
    const missingFields = validateAndParseImportedSave('{"foo": "bar"}');
    assert.equal(missingFields.ok, false);
  });

  it('11. Individual component health averages cleanly and single-part repair costs price individually', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_COMP_HLTH');
    const multiGpuRig = {
      ...base.rigs[0],
      gpuIds: ['gpu_gtx1060', 'gpu_r9_290x'],
      componentHealth: {
        chassis: 100,
        compute: 80,
        gpus: [50, 90],
        storage: 100,
        psu: 60,
        cooling: 80,
      },
      healthPct: 80,
    };

    // Average of [100, 80, 50, 90, 100, 60, 80] = 560 / 7 = 80
    assert.equal(computeAverageRigHealth(multiGpuRig.componentHealth), 80);

    const legacyRigWithoutMap = {
      ...base.rigs[0],
      gpuIds: ['gpu_gtx1060', 'gpu_r9_290x'],
      healthPct: 74,
      componentHealth: undefined,
    };
    const ensured = ensureRigComponentHealth(legacyRigWithoutMap);
    assert.equal(ensured.gpus.length, 2);
    assert.equal(ensured.chassis, 74);

    // Individual part repair cost vs full rig repair cost
    const gpu1RepairCost = getComponentRepairCost(multiGpuRig, 'gpu', 0, base);
    const gpu2RepairCost = getComponentRepairCost(multiGpuRig, 'gpu', 1, base);
    const allGpuRepairCost = getComponentRepairCost(multiGpuRig, 'gpu', undefined, base);
    const chassisRepairCost = getComponentRepairCost(multiGpuRig, 'chassis', undefined, base);
    const fullRigRepairCost = getRigRepairCost(multiGpuRig, base);

    assert.equal(chassisRepairCost, 0, 'Pristine component at 100% should cost $0 to repair');
    assert.ok(gpu1RepairCost > 0, 'Damaged GPU #1 should have positive repair cost');
    assert.equal(allGpuRepairCost, gpu1RepairCost + gpu2RepairCost, 'Repairing all GPUs should equal sum of individual GPU slot repair costs');
    assert.ok(
      gpu1RepairCost < fullRigRepairCost,
      'Repairing a single component should cost less than repairing the entire damaged rig'
    );

    // Verify advanceOneStep wears individual components and keeps rig.healthPct synced to average
    const stepped = advanceOneStep({
      ...base,
      rigs: [{ ...multiGpuRig, componentHealth: createInitialComponentHealth(2, 100), healthPct: 100 }],
    });
    const steppedRig = stepped.nextState.rigs[0];
    assert.ok(steppedRig.componentHealth, 'Stepped rig should retain componentHealth map');
    assert.equal(
      steppedRig.healthPct,
      computeAverageRigHealth(steppedRig.componentHealth),
      'Rig healthPct must equal the average of all individual components'
    );
  });

  it('12. Guided vs Veteran onboarding gates, topic tutorials, Codex, and early objective rewards work', () => {
    const guided = createNewGameState('STANDARD', false, 'TEST_GUIDE', undefined, null, 'GUIDED');
    const veteran = createNewGameState('STANDARD', false, 'TEST_VET', undefined, null, 'VETERAN');

    assert.equal(guided.onboardingMode, 'GUIDED');
    assert.equal(guided.tutorialStep, 1);
    assert.equal(veteran.onboardingMode, 'VETERAN');
    assert.equal(veteran.tutorialStep, 0);

    const guidedStartLocks = getUnlockedSystems(guided);
    assert.equal(guidedStartLocks.contracts, false, 'Contracts locked at Step 0 in Guided mode');
    assert.equal(guidedStartLocks.staff, false, 'Staff locked at Step 0 in Guided mode');
    assert.equal(guidedStartLocks.ops, false, 'Ops locked at Step 0 in Guided mode');

    const vetLocks = getUnlockedSystems(veteran);
    assert.equal(vetLocks.contracts, true, 'Veteran mode starts with contracts unlocked');
    assert.equal(vetLocks.staff, true, 'Veteran mode starts with staff unlocked');
    assert.equal(vetLocks.ops, true, 'Veteran mode starts with ops unlocked');

    // Advancing 3 steps unlocks contracts and awards early objective bonuses
    let s = guided;
    for (let i = 0; i < 3; i++) {
      s = advanceOneStep({ ...s, pendingEvent: null }).nextState;
    }
    assert.equal(getUnlockedSystems(s).contracts, true, 'Step 3 should unlock Contracts in Guided mode');
    const claimed = claimCompletedObjectives(s);
    assert.ok((claimed.nextState.claimedObjectives ?? []).includes('obj_advance_steps'));
    assert.ok(Object.keys(TUTORIAL_TOPICS).length >= 7);
    assert.ok(CODEX_ENTRIES.length >= 8);
  });

  it('13. Purchase payback previews and performance history ASCII charts operate accurately', () => {
    let s = createNewGameState('STANDARD', false, 'TEST_PREVIEWS', undefined, null, 'VETERAN');
    const preview = previewRigEconomics(
      {
        name: 'Preview Rig',
        chassisId: s.rigs[0].chassisId,
        computeId: s.rigs[0].computeId,
        gpuIds: s.rigs[0].gpuIds,
        storageId: s.rigs[0].storageId,
        psuId: s.rigs[0].psuId,
        coolingId: s.rigs[0].coolingId,
        osId: s.rigs[0].osId,
        targetCoin: 'BTC',
        overclockPct: 100,
      },
      300,
      s
    );
    assert.ok(preview.powerKw > 0);
    assert.ok(preview.grossRevPerStepUsd >= 0);

    const facPreview = previewFacilityMove('fac_garage', 'RENT', s);
    assert.ok(facPreview && facPreview.slotsDelta > 0);

    const coolPreview = previewCoolingUnit('cool_unit_fan', s);
    assert.ok(coolPreview && coolPreview.coolingC > 0);

    const pwrPreview = previewPowerContract('contract_budget', s);
    assert.ok(pwrPreview && typeof pwrPreview.netCycleDeltaUsd === 'number');

    for (let i = 0; i < 4; i++) {
      s = advanceOneStep({ ...s, pendingEvent: null }).nextState;
    }
    assert.equal(s.performanceHistory?.length, 4);
    const chartText = formatPortfolioChart(s, 'portfolio');
    assert.ok(chartText.includes('NET OPERATING PROFIT PER STEP'));
    assert.ok(chartText.includes('COMPANY VALUATION'));
  });

  it('14. Employee workload, graduated morale drain, 10-staff strike escalation, and settlement work', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_STRIKE', undefined, null, 'VETERAN');
    const tenLowMorale = Array.from({ length: 10 }, (_, idx) => ({
      id: `emp_${idx}`,
      name: `Worker ${idx + 1}`,
      role: (idx === 0 ? 'TECHNICIAN' : 'SYS_ENGINEER') as 'TECHNICIAN' | 'SYS_ENGINEER',
      shift: 'ROTATION_24_7' as const,
      priority: 'HASHRATE_TUNING' as const,
      morale: 32,
      skillLevel: 2,
      experienceXp: 0,
      hiredStep: 0,
    }));

    const strainedState = {
      ...base,
      facilityId: 'fac_industrial',
      cash: -200,
      employees: tenLowMorale,
    };

    const wl = computeWorkloadSummary(strainedState);
    assert.equal(wl.lowMoraleCount, 10);

    const stepped = advanceOneStep(strainedState);
    assert.ok((stepped.nextState.strikeStepsRemaining ?? 0) > 0, '10 low-morale staff must trigger a labor strike');
    assert.equal(stepped.nextState.pendingEvent?.category, 'EMPLOYEE');
    assert.equal(
      getTechnicianBonuses(stepped.nextState).repairDiscount,
      0,
      'Active strike must zero out employee bonuses'
    );

    const settled = resolvePendingEvent(
      { ...stepped.nextState, cash: 5000 },
      '1'
    );
    assert.equal(settled.ok, true);
    assert.equal(settled.nextState.strikeStepsRemaining, 0);
    assert.ok(getTechnicianBonuses(settled.nextState).repairDiscount > 0);
  });

  it('15. Dynamic events depend on facility, employee skills, component wear, and macro industry shifts', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_DYN_EVT', undefined, null, 'VETERAN');
    const facEvt = generateInteractiveEvent({ ...base, facilityId: 'fac_warehouse' }, 'FACILITY');
    assert.equal(facEvt.category, 'FACILITY');
    assert.ok(facEvt.title.includes('Warehouse'));

    const indEvt = generateInteractiveEvent(base, 'INDUSTRY');
    assert.equal(indEvt.category, 'INDUSTRY');
    const indResolved = resolvePendingEvent({ ...base, cash: 5000, pendingEvent: indEvt }, '1');
    assert.equal(indResolved.ok, true);
    assert.ok((indResolved.nextState.activeMarketModifiers ?? []).length > 0);

    const hwLowTech = generateInteractiveEvent(base, 'HARDWARE');
    const hwWithTech = generateInteractiveEvent(
      {
        ...base,
        employees: [
          {
            id: 't_expert',
            name: 'Lead Tech',
            role: 'TECHNICIAN',
            shift: 'DAY',
            priority: 'HARDWARE_CARE',
            morale: 95,
            skillLevel: 4,
            experienceXp: 600,
            hiredStep: 0,
          },
        ],
      },
      'HARDWARE'
    );
    assert.ok(
      (hwWithTech.options[0].costUsd ?? 0) < (hwLowTech.options[0].costUsd ?? 0),
      'Technician skill level must reduce hardware event repair cost'
    );
  });

  it('16. Rooms floor-plan placement, facility wing expansion, Gen 5 hardware, and part wear penalties work', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_ROOMS', undefined, null, 'VETERAN');
    const whState = {
      ...base,
      facilityId: 'fac_warehouse',
    };
    const rooms = getFacilityRooms(whState);
    assert.ok(rooms.length >= 4, 'Warehouse should have 4 distinct thermal rooms');

    const baseCap = getEffectiveFacilityMaxRigs(whState);
    const expanded = { ...whState, facilityExtraRooms: 1 };
    const expandedRooms = getFacilityRooms(expanded);
    assert.equal(expandedRooms.length, rooms.length + 1);
    assert.ok(getEffectiveFacilityMaxRigs(expanded) > baseCap, 'Expansion wing should add rig capacity');

    const whFac = getFacility('fac_warehouse');
    const coldRoom = rooms.find((r) => r.zoneType === 'COLD_AISLE') ?? rooms[0];
    const hotRoom = rooms.find((r) => r.zoneType === 'HOT_AISLE') ?? rooms[rooms.length - 1];
    const rigBase = whState.rigs[0];

    const cooler = [
      {
        id: 'c_local',
        type: 'cool_unit_ac' as const,
        gridX: 0,
        gridY: 0,
        roomId: coldRoom.id,
        enabled: true,
      },
    ];
    const coldTel = computeRigTelemetry(
      { ...rigBase, roomId: coldRoom.id },
      whFac,
      [],
      0,
      cooler,
      1
    );
    const hotTel = computeRigTelemetry(
      { ...rigBase, roomId: hotRoom.id },
      whFac,
      [],
      0,
      cooler,
      1
    );
    assert.ok(
      coldTel.equilibriumTempC < hotTel.equilibriumTempC,
      'Cold aisle with localized room cooler must run cooler than hot aisle'
    );

    // Component-specific degradation effects
    const wornTel = computeRigTelemetry(
      {
        ...rigBase,
        roomId: coldRoom.id,
        componentHealth: {
          chassis: 40,
          compute: 85,
          gpus: [],
          storage: 40,
          psu: 35,
          cooling: 40,
        },
      },
      whFac,
      [],
      0
    );
    const mintTel = computeRigTelemetry(
      {
        ...rigBase,
        roomId: coldRoom.id,
        componentHealth: createInitialComponentHealth(0, 100),
      },
      whFac,
      [],
      0
    );
    assert.ok(wornTel.wallWatts > mintTel.wallWatts, 'Worn PSU should increase wall power ripple');
    assert.ok(wornTel.equilibriumTempC > mintTel.equilibriumTempC, 'Worn cooling should raise equilibrium temperature');
    assert.ok(wornTel.noiseDba > mintTel.noiseDba, 'Worn chassis should raise acoustic rattle dBA');

    // ASCII floor-plan & room detail renders cleanly
    const floorAscii = formatAsciiFloorPlan({ ...whState, coolingUnits: cooler });
    assert.ok(floorAscii.includes('FLOOR-PLAN BLUEPRINT'));
    assert.ok(floorAscii.includes('North Cold Aisle'));
    const roomView = formatSingleRoomView({ ...whState, coolingUnits: cooler }, 1);
    assert.ok(roomView && roomView.includes('ASCII BAY LAYOUT'));

    // Gen 5 hardware & Used Market component health breakdown
    assert.ok(RESEARCH_NODES.some((n) => n.id === 'res_gen5_exascale'));
    assert.ok(COMPUTE_PARTS.some((p) => p.generation === 5));
    const used = generateUsedMarketListings(base);
    assert.ok(used.length > 0 && used.every((u) => Boolean(u.componentHealth)));
  });

  it('17. Market forecasting, regime hardware pricing, rival intel/pivots, expanded contracts & valuation breakdown work', () => {
    let state = createNewGameState('STANDARD', false, 'PHASE5-TEST', undefined, null, 'VETERAN');
    state.cash = 10000;
    for (let i = 0; i < 6; i++) {
      state = advanceOneStep(state).nextState;
    }

    // Market forecast technical analysis & formatted report
    const btcForecast = analyzeCoinForecast(state.coins.BTC, state);
    assert.ok(btcForecast.rsi14 >= 5 && btcForecast.rsi14 <= 95);
    assert.ok(btcForecast.supportUsd < btcForecast.resistanceUsd);
    const forecastTxt = formatMarketForecastReport(state, 'BTC');
    assert.ok(forecastTxt.includes('TECHNICAL & FUNDAMENTAL BRIEF: Bitcoin (BTC)'));

    // Hardware pricing tied to market regime
    const maniaMult = getGlobalHardwarePriceMult({ activeMarketModifiers: [], marketRegime: 'MANIA_PEAK' });
    const winterMult = getGlobalHardwarePriceMult({ activeMarketModifiers: [], marketRegime: 'CRYPTO_WINTER' });
    assert.ok(maniaMult > winterMult, 'Mania Peak hardware multiplier must exceed Crypto Winter');

    // Rival investigation & strategy pivot on step 15
    const recon = investigateRivalSyndicate(state, 0);
    assert.ok(recon.ok && recon.nextState.cash < state.cash);
    assert.ok(recon.nextState.researchPoints === state.researchPoints + 4);
    assert.ok((recon.nextState.rivals[0].intelRevealedUntilStep ?? 0) > state.stepCount);

    const rapidRival = { ...state.rivals[0], strategy: 'RAPID_EXPANSION' as const };
    const pivoted = stepRivalSyndicates([rapidRival], 15, 'CRYPTO_WINTER', 50, 1.0, 'PIVOT', 1.0);
    assert.equal(pivoted[0].strategy, 'LOW_OVERHEAD');

    // Expanded contracts (UPTIME_STREAK & EFFICIENCY_CAP) advance cleanly
    let streakState = {
      ...state,
      pendingEvent: null,
      activeContract: {
        id: 'ctr_streak',
        title: 'Zero-Fault Uptime Streak',
        clientName: 'Test Client',
        type: 'UPTIME_STREAK' as const,
        targetAmount: 3,
        minReputation: 0,
        progress: 0,
        durationSteps: 6,
        stepsRemaining: 6,
        rewardCash: 900,
        rewardRp: 12,
        penaltyCredibility: 4,
        penaltyCash: 100,
        description: 'Run 3 consecutive fault-free steps.',
      },
    };
    const s1 = advanceOneStep(streakState).nextState;
    assert.ok(s1.activeContract === null || s1.activeContract.progress >= 1);

    // Itemized valuation breakdown & Phase 5 R&D nodes
    const val = computeValuationBreakdown(state);
    assert.ok(val.totalUsd >= val.cashUsd + val.activeFleetUsd);
    assert.ok(RESEARCH_NODES.some((n) => n.id === 'res_wafer_lithography'));
    assert.ok(RESEARCH_NODES.some((n) => n.id === 'res_quant_forecasting'));
    assert.ok(RESEARCH_NODES.some((n) => n.id === 'res_bulk_procurement'));
  });

  it('18. Exchange spot/limit/short trading, HOLD wallet payouts, and Custom ASIC Foundry lifecycle work end-to-end', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'TEST_EXCHANGE_FAB');
    const holdState = {
      ...base,
      cash: 500_000,
      facilityId: 'fac_warehouse',
      ownedFacilityIds: ['fac_bedroom', 'fac_garage', 'fac_commercial', 'fac_warehouse'],
      unlockedResearch: ['res_wafer_lithography', 'res_asic_tapeout', 'res_gen4_hyperhash'],
      rigs: base.rigs.map((r) => ({
        ...r,
        chassisId: 'chassis_asic_rack',
        computeId: 'asic_s19_pro',
        psuId: 'psu_3600w_pdu',
        coolingId: 'cool_delta_blowers',
        payoutMode: 'HOLD' as const,
      })),
    };

    // 1) HOLD payout directs mined coins to treasury wallet rather than cash
    const step1 = advanceOneStep(holdState).nextState;
    assert.ok((step1.wallet?.BTC ?? 0) > 0, 'HOLD mode must credit mined BTC into wallet');
    assert.equal(step1.rigs[0].lastStepUsd, 0, 'HOLD rig must report $0 auto-sold cash');

    // 2) Spot buy & sell update wallet, cash, and EXCHANGE ledger entries
    const buy = executeSpotBuy(step1, 'BTC', 20_000);
    assert.equal(buy.ok, true, buy.summary);
    assert.ok(buy.nextState.cash === step1.cash - 20_000);
    assert.ok((buy.nextState.wallet?.BTC ?? 0) > (step1.wallet?.BTC ?? 0));
    assert.equal(buy.nextState.transactions[0]?.category, 'EXCHANGE');

    const sell = executeSpotSell(buy.nextState, 'BTC', 'ALL');
    assert.equal(sell.ok, true, sell.summary);
    assert.ok((sell.nextState.wallet?.BTC ?? 0) <= 1e-8);
    assert.ok(sell.nextState.cash > buy.nextState.cash);

    // 3) Limit buy & cancel + auto-fill on target price
    const curBtc = sell.nextState.coins.BTC.priceUsd;
    const limCancel = placeLimitOrder(sell.nextState, 'BUY', 'BTC', curBtc * 0.5, 1000);
    assert.equal(limCancel.ok, true);
    const cancelled = cancelLimitOrder(limCancel.nextState, 0);
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.nextState.cash, sell.nextState.cash);

    const limFillSetup = placeLimitOrder(sell.nextState, 'BUY', 'BTC', curBtc * 2.5, 5000);
    assert.equal(limFillSetup.ok, true);
    const limFilled = advanceOneStep(limFillSetup.nextState).nextState;
    assert.equal(limFilled.limitOrders?.length ?? 0, 0, 'In-the-money limit buy must auto-fill on step');
    assert.ok((limFilled.wallet?.BTC ?? 0) > 0);

    // 4) Short profit on price drop & auto-liquidation on surge
    const sh = openShortPosition(sell.nextState, 'BTC', 4000);
    assert.equal(sh.ok, true);
    const dropped = {
      ...sh.nextState,
      coins: {
        ...sh.nextState.coins,
        BTC: { ...sh.nextState.coins.BTC, priceUsd: curBtc * 0.7 },
      },
    };
    const closedProfit = closeShortPosition(dropped, 0);
    assert.equal(closedProfit.ok, true);
    assert.ok(
      closedProfit.nextState.cash > sell.nextState.cash,
      'Short closed after 30% drop must net profit'
    );

    const surged = {
      ...sh.nextState,
      coins: {
        ...sh.nextState.coins,
        BTC: { ...sh.nextState.coins.BTC, priceUsd: curBtc * 1.95 },
      },
    };
    const liqStep = advanceOneStep(surged);
    assert.equal(liqStep.nextState.shortPositions?.length ?? 0, 0, 'Short must liquidate at +95% rally');
    assert.equal(liqStep.alertHit, true);

    // 5) Fab line, chip tape-out, wafer batch, ASIC install & wholesale export + save round-trip
    const f1 = buildFabLine(sell.nextState);
    assert.equal(f1.ok, true, f1.summary);
    const bp = designCustomChipBlueprint(f1.nextState, 'NovaSha3', 'SHA256', '3nm', 'PERF');
    assert.equal(bp.ok, true, bp.summary);
    const prod = queueFabProduction(bp.nextState, 0, 2);
    assert.equal(prod.ok, true, prod.summary);

    let fabRun = prod.nextState;
    for (let i = 0; i < 10; i++) {
      fabRun = advanceOneStep({ ...fabRun, pendingEvent: null }).nextState;
    }
    assert.ok((fabRun.fab?.inventory.length ?? 0) >= 1, 'Completed wafer batch must stock inventory');

    const stockTel = computeRigTelemetry(
      fabRun.rigs[0],
      getFacility(fabRun.facilityId),
      fabRun.unlockedResearch,
      0,
      fabRun.coolingUnits ?? [],
      1,
      fabRun.facilityUpgrades
    );
    const deployed = deployCustomAsicToRig(fabRun, 0, 0);
    assert.equal(deployed.ok, true, deployed.summary);
    const customTel = computeRigTelemetry(
      deployed.nextState.rigs[0],
      getFacility(deployed.nextState.facilityId),
      deployed.nextState.unlockedResearch,
      0,
      deployed.nextState.coolingUnits ?? [],
      1,
      deployed.nextState.facilityUpgrades
    );
    assert.ok(
      customTel.effectiveHashrate !== stockTel.effectiveHashrate,
      'Installed custom ASIC must drive rig telemetry'
    );

    const exported = sellCustomAsicsWholesale(deployed.nextState, 0, 'ALL');
    assert.equal(exported.ok, true, exported.summary);
    assert.ok(exported.nextState.cash > deployed.nextState.cash);

    const valWithCustom = computeValuationBreakdown(deployed.nextState);
    assert.ok(valWithCustom.fabInventoryUsd > 0, 'Remaining fab inventory must be included in valuation');

    // Save round-trip preserves wallet, customAsicSpec, and fab
    const rawSave = serializeSaveEnvelope(deployed.nextState);
    const parsedSave = validateAndParseImportedSave(rawSave);
    assert.equal(parsedSave.ok, true);
    assert.equal(parsedSave.state?.rigs[0].customAsicSpec?.name, 'NovaSha3');
    assert.equal(parsedSave.state?.fab?.linesCount, 1);
  });

  it('19. Save hydration handles malformed fields cleanly & 500-step deterministic stress test stays bounded', () => {
    // 1) Corrupt JSON and missing-field save hydration checks
    const badJson = validateAndParseImportedSave('{not valid json');
    assert.equal(badJson.ok, false);

    const minimalLegacy = {
      mode: 'PLAYING',
      difficulty: 'STANDARD',
      runSeed: 'LEGACY_RESILIENT',
      stepCount: 5,
      cash: 1200,
      coins: createNewGameState('STANDARD', false, 'LEGACY_RESILIENT').coins,
      rigs: [
        {
          id: 'r_legacy',
          name: 'Old Rig',
          chassisId: 'chassis_bedroom_tower',
          computeId: 'cpu_core2_duo',
          gpuIds: [],
          storageId: 'stor_ddr3_4gb',
          psuId: 'psu_450w',
          coolingId: 'cool_stock_air',
          osId: 'os_windows7',
          targetCoin: 'BTC',
          overclockPct: 100,
          enabled: true,
          temperatureC: 50,
          healthPct: -50, // out-of-range test
          status: 'MINING',
          lastStepCoins: 0,
          lastStepUsd: 0,
          totalMinedCoins: 0,
          totalEarnedUsd: 0,
          createdStep: 0,
        },
      ],
    };
    const hydrated = hydrateSavedState(minimalLegacy);
    assert.ok(hydrated, 'Minimal legacy save should hydrate cleanly');
    assert.ok(hydrated!.rigs[0].healthPct >= 20 && hydrated!.rigs[0].healthPct <= 100);
    assert.ok(hydrated!.wallet !== undefined);
    assert.ok(hydrated!.fab !== undefined);
    assert.ok(hydrated!.world !== undefined);

    // 2) Determinism check: identical seeds produce identical step-15 results
    const runA0 = createNewGameState('STANDARD', false, 'DET_SEED_42');
    const runB0 = createNewGameState('STANDARD', false, 'DET_SEED_42');
    let runA = runA0;
    let runB = runB0;
    for (let i = 0; i < 15; i++) {
      if (runA.pendingEvent) runA = resolvePendingEvent(runA, '1').nextState;
      if (runB.pendingEvent) runB = resolvePendingEvent(runB, '1').nextState;
      runA = advanceOneStep(runA).nextState;
      runB = advanceOneStep(runB).nextState;
    }
    assert.equal(runA.coins.BTC.priceUsd, runB.coins.BTC.priceUsd, 'Seeded BTC price must replay identically');
    assert.equal(runA.cash, runB.cash, 'Seeded cash must replay identically');

    // 3) 500-step long-horizon stability & memory bound stress test
    let stress = createNewGameState('TYCOON_SANDBOX', false, 'STRESS_500');
    stress = {
      ...stress,
      facilityId: 'fac_warehouse',
      ownedFacilityIds: ['fac_bedroom', 'fac_garage', 'fac_commercial', 'fac_warehouse'],
      cash: 250_000,
    };

    for (let s = 0; s < 500; s++) {
      if (stress.pendingEvent) {
        stress = resolvePendingEvent(stress, '1').nextState;
        if (stress.pendingEvent) {
          stress = { ...stress, pendingEvent: null };
        }
      }
      stress = advanceOneStep(stress).nextState;
    }

    assert.equal(stress.stepCount, 500);
    assert.ok(Number.isFinite(stress.cash), 'Cash must stay finite over 500 steps');
    assert.ok(Number.isFinite(computeCompanyValuation(stress)), 'Valuation must stay finite');
    Object.values(stress.coins).forEach((c) => {
      assert.ok(Number.isFinite(c.priceUsd) && c.priceUsd > 0, `${c.symbol} price must remain finite & positive`);
      assert.ok(c.priceHistory.length <= 365, `${c.symbol} priceHistory must remain bounded <= 365`);
    });
    assert.ok(stress.transactions.length <= 200, 'Transactions array must stay bounded <= 200');
    assert.ok(stress.news.length <= 60, 'News array must stay bounded <= 60');
    assert.ok((stress.performanceHistory ?? []).length <= 60, 'Performance history must stay bounded <= 60');
    assert.ok(stress.ledger.length <= 48, 'Billing ledger must stay bounded <= 48');
  });
});
