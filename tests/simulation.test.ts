import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACILITY_TIERS,
  FACILITY_UPGRADES,
  POWER_CONTRACTS,
  RESEARCH_NODES,
  ROOM_COOLING_UNITS,
} from '../src/data/catalog';
import { generateContractBoard } from '../src/engine/contracts';
import { evaluateProgression } from '../src/engine/milestones';
import { getPlayerRivalComparison, stepRivalSyndicates } from '../src/engine/rivals';
import {
  hydrateSavedState,
  serializeSaveEnvelope,
  validateAndParseImportedSave,
} from '../src/engine/saveSystem';
import {
  advanceOneStep,
  computeAverageRigHealth,
  computeFacilityCoolingSummary,
  computeRigTelemetry,
  createInitialComponentHealth,
  createNewGameState,
  ensureRigComponentHealth,
  getComponentRepairCost,
  getEffectiveElectricityRate,
  getEffectiveFacilityMaxRigs,
  getEffectiveFacilityPowerCapKw,
  getElectricianBonuses,
  getFacility,
  getFacilityTotals,
  getFacilityUpgradeCost,
  getManagerBonuses,
  getRigRepairCost,
  getTechnicianBonuses,
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
});
