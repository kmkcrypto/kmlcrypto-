import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  GPU_PARTS,
  OS_PARTS,
  PSU_PARTS,
  RESEARCH_NODES,
  STORAGE_PARTS,
} from '../src/data/catalog';
import {
  advanceOneStep,
  calculateRigBuildCost,
  computeRigTelemetry,
  createNewGameState,
  estimateFleetHashIndex,
  getFacility,
} from '../src/engine/simulation';
import {
  launchShellCoin,
  resolveRaid,
  rugShellCoin,
  shillShellCoin,
  SHELL_COIN_LAUNCH_COST,
  stepShellCoins,
} from '../src/engine/underground';
import {
  archiveSeason,
  buildSeasonStandings,
  getSeasonId,
  getSeasonStatus,
  SEASON_LENGTH_STEPS,
} from '../src/engine/leaderboard';
import {
  buildDefaultFab,
  buildFabLine,
  deployCustomAsicToRig,
  deployCustomInventoryToRig,
  designCustomChipBlueprint,
  designCustomComponentBlueprint,
  getFabEngineeringPointBudget,
  getUnlockedFabCategories,
  getUnlockedFabNodes,
  getUnlockedFabSubFeatures,
  parseDesignProfile,
  queueFabProduction,
  stepFabProduction,
  stripCustomAsicFromRig,
  stripCustomPartFromRig,
} from '../src/engine/fab';
import {
  calculateBaseRigPartsCost,
  calculateStockBuildPartsCost,
  getEffectivePartBundle,
} from '../src/engine/usedMarket';
import { createScenarioState, SCENARIOS } from '../src/engine/scenarios';
import { hydrateSavedState, serializeSaveEnvelope } from '../src/engine/saveSystem';
import { buildDefaultWorld, getPlayerHashIndex, stepSharedWorld } from '../src/engine/world';
import type { GameState, RigBuildConfig } from '../src/types/game';

const ALL_PARTS = [
  ...CHASSIS_PARTS,
  ...COMPUTE_PARTS,
  ...GPU_PARTS,
  ...STORAGE_PARTS,
  ...PSU_PARTS,
  ...COOLING_PARTS,
  ...OS_PARTS,
];

const RESEARCH_IDS = new Set(RESEARCH_NODES.map((n) => n.id));

describe('HASHRATE systems: halving, shared world, scenarios, foundry', () => {
  it('1. A halving halves emission, lifts long-run fair value and keeps the coin tradable', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_HALVING');
    const btcBefore = base.coins.BTC;
    const armed: GameState = {
      ...base,
      coins: { ...base.coins, BTC: { ...btcBefore, stepsUntilHalving: 1 } },
    };

    const next = advanceOneStep(armed).nextState;
    const btcAfter = next.coins.BTC;

    assert.equal(btcAfter.halvingCount, 1, 'Halving counter should advance');
    assert.ok(
      Math.abs(btcAfter.blockRewardScale - 0.5) < 1e-9,
      'Block emission must halve exactly'
    );
    assert.ok(
      btcAfter.basePriceUsd > btcBefore.basePriceUsd,
      'Scarcity must ratchet the long-run fair value up instead of letting revenue collapse'
    );
    assert.ok(
      Math.abs(btcAfter.basePriceUsd / btcBefore.basePriceUsd - 1.22) < 1e-6,
      'Fair-value ratchet should be +22% per halving'
    );
    assert.ok(btcAfter.stepsUntilHalving > 100, 'Next halving should be a long way off');
    assert.ok(btcAfter.priceUsd > 0, 'Coin must remain priced after a halving');
  });

  it('2. Shared world mines a block per step, pays by hash share and records history', () => {
    const state = createNewGameState('STANDARD', false, 'TEST_WORLD');
    const playerHash = 400;
    const step = stepSharedWorld(state.world, { ...state, stepCount: 1 }, playerHash);

    assert.ok(step.block, 'A block should be mined');
    const block = step.block!;
    assert.equal(block.height, 1);
    assert.ok(block.playerSharePct > 0 && block.playerSharePct < 100);
    assert.ok(
      block.networkHashIndex > block.playerHashIndex,
      'Background network plus rivals must dwarf a single small fleet'
    );
    assert.ok(step.rewardUsd > 0, 'Proportional rewards pay something on every block');
    assert.equal(step.nextWorld.blocks.length, 1);
    assert.equal(step.nextWorld.blockHeight, 1);

    const allTake = stepSharedWorld(
      { ...buildDefaultWorld('TEST_WORLD'), rewardMode: 'WINNER_TAKE_ALL' },
      { ...state, stepCount: 1 },
      400
    );
    const coins = Object.values(allTake.rewardByCoin).reduce((s, v) => s + (v ?? 0), 0);
    assert.ok(
      coins === 0 || Math.abs(coins - allTake.block!.blockRewardCoins) < 1e-9,
      'Winner-take-all pays either nothing or the entire block'
    );
  });

  it('3. Every scenario launches a temporary Dev session at its stated stage', () => {
    assert.ok(SCENARIOS.length >= 6, 'Scenario catalog should cover the roadmap stages');

    for (const spec of SCENARIOS) {
      const state = createScenarioState(spec.id);
      assert.equal(state.isSandbox, true, `${spec.id} must use sandbox rules`);
      assert.equal(state.isDevSession, true, `${spec.id} must stay out of save slots`);
      assert.equal(state.scenarioId, spec.id);
      assert.ok(state.rigs.length > 0, `${spec.id} must ship a working fleet`);
      assert.ok(state.cash > 0, `${spec.id} must ship working capital`);
    }

    const gen5 = createScenarioState('GEN5');
    assert.ok(gen5.unlockedResearch.includes('res_gen5_exascale'));

    const gen6 = createScenarioState('GEN6');
    assert.ok(gen6.unlockedResearch.includes('res_gen6_ai_convergence'));
    assert.ok(
      gen6.rigs.some((r) => COMPUTE_PARTS.find((p) => p.id === r.computeId)?.generation === 6),
      'GEN6 scenario must field Gen-6 hardware'
    );

    const gen7 = createScenarioState('GEN7');
    assert.ok(gen7.unlockedResearch.includes('res_gen7_quantum_photonic'));
    assert.ok(gen7.unlockedResearch.includes('res_gen7_dilution_cryo'));
    assert.ok(
      gen7.rigs.some((r) => COMPUTE_PARTS.find((p) => p.id === r.computeId)?.generation === 7),
      'GEN7 scenario must field Gen-7 Quantum & Photonic hardware'
    );

    const fab = createScenarioState('MANUFACTURING');
    assert.equal(fab.fab?.linesCount, 2, 'Manufacturing scenario must have fab lines online');
    assert.ok(fab.unlockedResearch.includes('res_wafer_lithography'));

    const world = createScenarioState('MULTIPLAYER');
    assert.ok((world.world?.blocks.length ?? 0) > 0, 'World scenario must have block history');
  });

  it('4. Foundry design follows the research tree and refuses unusable chassis installs', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'TEST_FAB_GATE');
    const foundry: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 1_000_000,
      unlockedResearch: ['res_wafer_lithography'],
      fab: buildDefaultFab({ linesCount: 1 }),
    };

    const blocked = designCustomChipBlueprint(foundry, 'GateTest', 'SHA256', '3nm');
    assert.equal(blocked.ok, false, '3nm tape-out must require Gen-4 research');
    assert.match(blocked.summary, /Gen-4/);

    const allowed = designCustomChipBlueprint(
      { ...foundry, unlockedResearch: [...foundry.unlockedResearch, 'res_gen4_hyperhash'] },
      'GateTest',
      'SHA256',
      '3nm'
    );
    assert.equal(allowed.ok, true, 'Research-backed tape-out should succeed');

    const withInventory: GameState = {
      ...foundry,
      fab: {
        ...buildDefaultFab({ linesCount: 1 }),
        inventory: [
          {
            blueprintId: 'bp_test',
            name: 'Test Chip',
            algo: 'SHA256',
            processNode: '3nm',
            hashRate: 1_000_000,
            watts: 3000,
            heatC: 65,
            wholesaleValueUsd: 5000,
            qty: 1,
          },
        ],
      },
    };
    const badInstall = deployCustomAsicToRig(withInventory, 0, 0);
    assert.equal(
      badInstall.ok,
      false,
      'A desktop tower cannot seat an ASIC blade — this used to install silently and mine nothing'
    );
    assert.match(badInstall.summary, /ASIC/);
  });

  it('5. Catalog integrity: Gen-6 & Gen-7 parts, price bands, research gates and prerequisites all resolve', () => {
    const categories = [
      CHASSIS_PARTS,
      COMPUTE_PARTS,
      GPU_PARTS,
      STORAGE_PARTS,
      PSU_PARTS,
      COOLING_PARTS,
      OS_PARTS,
    ];
    for (const catParts of categories) {
      assert.ok(catParts.some((p) => p.generation === 6), 'Gen-6 must cover all 7 hardware categories');
      assert.ok(catParts.some((p) => p.generation === 7), 'Gen-7 must cover all 7 hardware categories');
    }

    for (const part of ALL_PARTS) {
      if (part.researchRequired) {
        assert.ok(
          RESEARCH_IDS.has(part.researchRequired),
          `${part.id} references missing research ${part.researchRequired}`
        );
      }
      if (part.generation === 6) {
        assert.ok(part.researchRequired, `${part.id} must be gated behind Gen-6 research`);
        assert.ok(
          part.cost >= 500_000 && part.cost <= 700_000,
          `${part.id} Gen-6 part cost (${part.cost}) must stay within $500k–$700k`
        );
      }
      if (part.generation === 7) {
        assert.equal(part.era, 'QUANTUM', `${part.id} Gen-7 part must use QUANTUM era`);
        assert.ok(part.researchRequired, `${part.id} must be gated behind Gen-7 research`);
        assert.ok(
          part.cost >= 2_000_000 && part.cost <= 3_000_000,
          `${part.id} Gen-7 part cost (${part.cost}) must stay within $2M–$3M`
        );
      }
    }

    for (const node of RESEARCH_NODES) {
      for (const prereq of node.prereqIds) {
        assert.ok(RESEARCH_IDS.has(prereq), `${node.id} references missing prerequisite ${prereq}`);
      }
    }

    const ids = ALL_PARTS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'Part ids must be unique');
  });

  it('6. Player hash index is readable from saved performance history', () => {
    const state = createNewGameState('STANDARD', false, 'TEST_HASHIDX');
    const scored: GameState = {
      ...state,
      performanceHistory: [
        { step: 1, stepLabel: 'Step 1', cash: 0, valuation: 0, revenuePerStepUsd: 0, powerCostPerStepUsd: 0, netPerStepUsd: 0, fleetHashScore: 240, powerKw: 1 },
      ],
    };
    assert.equal(getPlayerHashIndex(scored), 240);

    const starter = createNewGameState('STANDARD', false, 'TEST_HASHIDX');
    const starterIndex = estimateFleetHashIndex(starter);
    const gen6 = createScenarioState('GEN6');
    const gen6Index = estimateFleetHashIndex(gen6);
    const gen7 = createScenarioState('GEN7');
    const gen7Index = estimateFleetHashIndex(gen7);
    assert.ok(starterIndex >= 12 && starterIndex < 100, 'Starter fleet must stay on the rival scale');
    assert.ok(gen6Index > starterIndex, 'Gen-6 fleet must out-score a starter CPU');
    assert.ok(gen6Index < 5000, 'Gen-6 fleet index must not dwarf the rival economy');
    assert.ok(gen7Index > gen6Index, 'Gen-7 fleet must out-score Gen-6');
    assert.ok(gen7Index < 5000, 'Gen-7 fleet index must not dwarf the rival economy');
  });

  it('7. Blueprint trade-offs, prototype quality and batch yield shape every chip', () => {
    const base = createNewGameState('TYCOON_SANDBOX', false, 'TEST_FAB_DEPTH');
    const foundry: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 5_000_000,
      unlockedResearch: ['res_wafer_lithography', 'res_asic_tapeout'],
      fab: buildDefaultFab({ linesCount: 2 }),
    };

    assert.equal(parseDesignProfile(undefined), 'BALANCED');
    assert.equal(parseDesignProfile('eco'), 'EFF');
    assert.equal(parseDesignProfile('nonsense'), null);

    const perf = designCustomChipBlueprint(foundry, 'PerfChip', 'SHA256', '7nm', 'PERF');
    const eff = designCustomChipBlueprint(foundry, 'EffChip', 'SHA256', '7nm', 'EFF');
    assert.equal(perf.ok, true);
    assert.equal(eff.ok, true);
    const perfBp = perf.nextState.fab!.blueprints.find((b) => b.name === 'PerfChip')!;
    const effBp = eff.nextState.fab!.blueprints.find((b) => b.name === 'EffChip')!;
    assert.ok(perfBp.hashRate > effBp.hashRate, 'Performance profile must out-hash Efficiency');
    assert.ok(perfBp.watts > effBp.watts, 'Performance profile must draw more power');
    assert.ok(perfBp.unitCostUsd < effBp.unitCostUsd, 'Efficiency bins cost more per unit');
    assert.equal(perfBp.designProfile, 'PERF');
    assert.ok(
      perfBp.qualityGrade === 'A' || perfBp.qualityGrade === 'B' || perfBp.qualityGrade === 'C',
      'Tape-out must land a prototype quality grade'
    );
    assert.ok(
      perfBp.qualityMult! >= 0.9 && perfBp.qualityMult! <= 1.07,
      'Prototype quality must stay within a narrow band'
    );

    const queued = queueFabProduction(perf.nextState, 0, 2);
    assert.equal(queued.ok, true);
    const order = queued.nextState.fab!.productionQueue[0];
    assert.ok(
      order.qualityRoll! >= 0.95 && order.qualityRoll! <= 1.05,
      'Each wafer batch rolls its own yield'
    );

    let stepped = queued.nextState;
    for (let i = 0; i < 12; i++) stepped = advanceOneStep(stepped).nextState;
    const stack = stepped.fab!.inventory.find((i) => i.blueprintId === perfBp.id);
    assert.ok(stack, 'Finished wafers must land in foundry inventory');
    assert.equal(stack!.qty, 2);
    assert.equal(stack!.qualityRoll, order.qualityRoll);
    assert.ok(
      Math.abs(stack!.hashRate - Math.round(perfBp.hashRate * order.qualityRoll!)) <= 1,
      'Stack hashrate must reflect its own batch yield'
    );

    // Component trading: deploy the finished chip, then pull it back into inventory.
    const asicState = createScenarioState('GEN6');
    const asicRigIdx = asicState.rigs.findIndex((r) => {
      const chassis = CHASSIS_PARTS.find((c) => c.id === r.chassisId);
      return (chassis?.maxAsics ?? 0) >= 1;
    });
    assert.ok(asicRigIdx >= 0, 'Gen-6 scenario must field an ASIC-capable rig');
    const deployable: GameState = { ...stepped, rigs: asicState.rigs };
    const deployed = deployCustomAsicToRig(deployable, 0, asicRigIdx);
    assert.equal(deployed.ok, true, deployed.summary);
    assert.equal(deployed.nextState.rigs[asicRigIdx].customAsicSpec?.name, 'PerfChip');
    assert.equal(
      deployed.nextState.fab!.inventory[0].qty,
      1,
      'Deploying one chip must draw one unit from the stack'
    );

    const stripped = stripCustomAsicFromRig(deployed.nextState, asicRigIdx);
    assert.equal(stripped.ok, true);
    assert.equal(stripped.nextState.rigs[asicRigIdx].customAsicSpec, undefined);
    const recovered = stripped.nextState.fab!.inventory.find((i) => i.name === 'PerfChip');
    assert.ok(recovered && recovered.qty === 2, 'Extracted ASIC must return to inventory');
    assert.ok(stripped.nextState.cash < deployed.nextState.cash, 'Extraction charges a refurb fee');
  });

  it('8. Gen 4-7 GPU-capable chassis exist, hold real GPU clusters and are R&D-gated', () => {
    const gpuChassis = CHASSIS_PARTS.filter(
      (c) => !c.isAsicRack && (c.generation ?? 1) >= 4
    );
    assert.deepEqual(
      [...new Set(gpuChassis.map((c) => c.generation))].sort(),
      [4, 5, 6, 7],
      'Gen 4, 5, 6 and 7 each need a GPU-capable chassis'
    );
    for (const c of gpuChassis) {
      assert.ok(c.maxGpus >= 6, `${c.name} must hold a real GPU cluster`);
      assert.ok(
        c.researchRequired && RESEARCH_IDS.has(c.researchRequired),
        `${c.name} must be gated behind a real R&D node`
      );
    }
  });
});

describe('HASHRATE systems: shell coins, vault raids & seasons', () => {
  it('9. Shell coins launch, cost cash, draw heat and reject bad tickers', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_SHELL');
    const funded: GameState = { ...base, cash: 6000 };
    const launched = launchShellCoin(funded, 'moon', 'Moon Coin');
    if (!launched.ok) throw new Error(launched.reason);

    assert.equal(launched.nextState.cash, funded.cash - SHELL_COIN_LAUNCH_COST);
    assert.equal(launched.nextState.underground.shellCoins?.[0].ticker, 'MOON');
    assert.ok(
      launched.nextState.regulatoryScrutiny > funded.regulatoryScrutiny,
      'Launching a scam token must draw regulator attention'
    );

    const duplicate = launchShellCoin(funded, 'BTC', 'Fake Bitcoin');
    assert.equal(duplicate.ok, false, 'Real coin tickers must be rejected');

    const broke = launchShellCoin({ ...base, cash: 100 }, 'MOON', 'Moon Coin');
    assert.equal(broke.ok, false, 'Launching must require the full fee');
  });

  it('10. Shilling deepens the pool and a rug pull cashes it out', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_RUG');
    const launched = launchShellCoin({ ...base, cash: 6000 }, 'MOON', 'Moon Coin');
    if (!launched.ok) throw new Error(launched.reason);

    const shilled = shillShellCoin(launched.nextState, 'MOON');
    if (!shilled.ok) throw new Error(shilled.reason);
    const coinAfterShill = shilled.nextState.underground.shellCoins?.[0];
    assert.ok((coinAfterShill?.hype ?? 0) > 42, 'Shilling must raise hype');
    assert.ok(
      (coinAfterShill?.liquidityUsd ?? 0) > (launched.nextState.underground.shellCoins?.[0].liquidityUsd ?? 0),
      'Shilling must add money to the liquidity pool'
    );

    const rugged = rugShellCoin(shilled.nextState, 'MOON');
    if (!rugged.ok) throw new Error(rugged.reason);
    const coinAfterRug = rugged.nextState.underground.shellCoins?.[0];
    assert.equal(coinAfterRug?.rugged, true);
    assert.equal(coinAfterRug?.liquidityUsd, 0);
    assert.equal(coinAfterRug?.priceUsd, 0.0001);
    assert.ok(rugged.nextState.cash > shilled.nextState.cash, 'A rug must return cash');
    assert.equal(rugShellCoin(rugged.nextState, 'MOON').ok, false, 'A token can only be rugged once');
  });

  it('11. Shell coin hype decays each step and a dead token collapses', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_HYPE');
    const underground = {
      ...base.underground,
      shellCoins: [
        {
          ticker: 'MOON',
          name: 'Moon Coin',
          launchedStep: 0,
          priceUsd: 0.06,
          hype: 3,
          liquidityUsd: 2000,
          supply: 1_000_000,
          extractedUsd: 0,
          rugged: false,
        },
      ],
    };
    const stepped = stepShellCoins(underground, 1, 'TEST_HYPE');
    assert.equal(stepped.collapsed.length, 1, 'A token at zero hype must be reported as collapsed');
    assert.equal(stepped.underground.shellCoins?.[0].priceUsd, 0.0001);
    assert.equal(stepped.underground.shellCoins?.[0].hype, 0);
  });

  it('12. A successful raid steals cash, hijacks hash and starts a cooldown', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_RAID');
    const target = base.rivals[0];
    let success: ReturnType<typeof resolveRaid> | null = null;
    for (let step = 10; step < 60 && !success; step += 1) {
      const attempt = resolveRaid(
        { ...base, stepCount: step, regulatoryScrutiny: 5, cash: 20000 },
        target.id,
        5000
      );
      if (attempt.ok && attempt.nextState.cash > 20000) success = attempt;
    }
    if (!success || !success.ok) throw new Error('Expected at least one successful raid');
    const raided = success.nextState;
    const rivalAfter = raided.rivals.find((r) => r.id === target.id);
    assert.ok(raided.cash > 20000, 'A raid must pay out cash');
    assert.ok((rivalAfter?.cashReserveUsd ?? 0) < target.cashReserveUsd, 'The rival must lose reserve cash');
    assert.equal(raided.underground.raidStepsRemaining, 8);
    assert.ok((raided.underground.raidBonusHash ?? 0) > 0);
    assert.ok(raided.regulatoryScrutiny > 5, 'A raid must raise heat');

    const blocked = resolveRaid(raided, target.id, 5000);
    assert.equal(blocked.ok, false, 'Raid crew must need a cooldown');
  });

  it('13. Seasons archive standings every 60 steps and rank the player', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_SEASON');
    assert.equal(getSeasonId(0), 1);
    assert.equal(getSeasonId(SEASON_LENGTH_STEPS), 2);
    assert.equal(getSeasonStatus(SEASON_LENGTH_STEPS - 1).stepsRemaining, 1);
    assert.equal(archiveSeason({ ...base, stepCount: 30 }, 100), null);

    const standings = buildSeasonStandings(base, 100);
    assert.equal(standings.length, base.rivals.length + 1);
    assert.ok(standings.some((s) => s.isPlayer));
    for (let i = 1; i < standings.length; i += 1) {
      assert.ok(standings[i - 1].score >= standings[i].score, 'Standings must be sorted by score');
    }

    const archived = archiveSeason({ ...base, stepCount: SEASON_LENGTH_STEPS - 1 }, 100);
    assert.ok(archived && archived.length === 1);
    assert.equal(archived[0].seasonId, 1);
    assert.ok(archived[0].playerRank >= 1);
    assert.equal(archived[0].standings.length, base.rivals.length + 1);
  });
});

describe('HASHRATE systems: underground & season persistence', () => {
  it('14. Saves keep shell coins, raid cooldowns and season history across a reload', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_SAVE_UG');
    const launched = launchShellCoin({ ...base, cash: 6000 }, 'MOON', 'Moon Coin');
    if (!launched.ok) throw new Error(launched.reason);
    const archived = archiveSeason({ ...base, stepCount: SEASON_LENGTH_STEPS - 1 }, 50);
    if (!archived) throw new Error('Expected a season record at the boundary');

    const saved = { ...launched.nextState, seasonHistory: archived };
    const hydrated = hydrateSavedState(JSON.parse(serializeSaveEnvelope(saved)));
    assert.ok(hydrated);
    assert.equal(hydrated!.underground.shellCoins?.[0].ticker, 'MOON');
    assert.equal(hydrated!.underground.raidCooldownStep, 0);
    assert.equal(hydrated!.seasonHistory?.[0].seasonId, 1);
    assert.equal(hydrated!.seasonHistory?.[0].standings.length, base.rivals.length + 1);
  });
});

describe('HASHRATE systems: multi-component custom manufacturing', () => {
  it('15. Supports all 7 component categories with R&D gates, engineering budget, and sub-features', () => {
    const base = createNewGameState('STANDARD', false, 'TEST_FAB_7CATS');
    const gatedState: GameState = {
      ...base,
      facilityId: 'fac_warehouse',
      cash: 500_000,
      unlockedResearch: ['res_wafer_lithography'],
      fab: { ...buildDefaultFab(base.fab), linesCount: 1 },
    };

    // GPU category, 3nm, and advanced sub-features should be locked before their R&D nodes
    assert.equal(
      getUnlockedFabCategories(gatedState).some((c) => c.id === 'gpu'),
      false,
      'Custom GPU fabrication requires res_gpu_kernel'
    );
    assert.equal(getFabEngineeringPointBudget(gatedState), 10);
    assert.equal(
      getUnlockedFabNodes(gatedState, 'chassis').includes('3nm'),
      false,
      '3nm requires res_gen4_hyperhash'
    );
    assert.equal(
      getUnlockedFabSubFeatures(gatedState).some((s) => s.id === 'ECC_SHIELD'),
      false,
      'ECC_SHIELD requires res_predictive_telemetry'
    );

    const overBudget = designCustomComponentBlueprint(gatedState, {
      name: 'TooManyPts',
      partCategory: 'chassis',
      architecture: 'OPEN_GPU_FRAME',
      processNode: '7nm',
      focus: 'GPU_8',
      engineering: { density: 5, efficiency: 5, thermals: 1, reliability: 0 },
      subFeature: 'STD',
      profile: 'BALANCED',
    });
    assert.equal(overBudget.ok, false, 'Exceeding engineering point budget must fail');

    // Now unlock all research and commission fab line #2
    let fullState: GameState = {
      ...gatedState,
      cash: 5_000_000,
      unlockedResearch: RESEARCH_NODES.map((n) => n.id),
    };
    assert.equal(getFabEngineeringPointBudget(fullState), 14);
    assert.equal(getUnlockedFabCategories(fullState).length, 7);
    assert.equal(
      getUnlockedFabNodes(fullState, 'compute').includes('photonic'),
      true,
      'Photonic node must unlock with res_gen7_quantum_photonic'
    );
    const lineRes = buildFabLine(fullState);
    assert.equal(lineRes.ok, true);
    fullState = lineRes.nextState;

    // Design one blueprint in every component category (7 total)
    const designs = [
      {
        name: 'ConvRack-1',
        partCategory: 'chassis' as const,
        architecture: 'CONVERGED_SUPER' as const,
        processNode: '3nm' as const,
        focus: 'HYBRID_10_1',
        engineering: { density: 5, efficiency: 3, thermals: 3, reliability: 2 },
        subFeature: 'ECC_SHIELD' as const,
        profile: 'COMPACT' as const,
      },
      {
        name: 'ApexSha-1',
        partCategory: 'compute' as const,
        architecture: 'ASIC_BLADE' as const,
        processNode: '2nm' as const,
        focus: 'SHA256',
        engineering: { density: 5, efficiency: 4, thermals: 2, reliability: 2 },
        subFeature: 'COPPER_BUS' as const,
        profile: 'PERF' as const,
      },
      {
        name: 'HeliosGpu-1',
        partCategory: 'gpu' as const,
        architecture: 'HBM_MONSTER' as const,
        processNode: '3nm' as const,
        focus: 'ETHASH',
        engineering: { density: 5, efficiency: 3, thermals: 3, reliability: 2 },
        subFeature: 'GRAPHENE_TIM' as const,
        profile: 'PERF' as const,
      },
      {
        name: 'ChiaVault-1',
        partCategory: 'storage' as const,
        architecture: 'NVME_ARRAY' as const,
        processNode: '3nm' as const,
        focus: 'CHIA_VAULT',
        engineering: { density: 5, efficiency: 4, thermals: 2, reliability: 2 },
        subFeature: 'STD' as const,
        profile: 'BALANCED' as const,
      },
      {
        name: 'HvdcRail-1',
        partCategory: 'psu' as const,
        architecture: 'INDUSTRIAL_RAIL' as const,
        processNode: '3nm' as const,
        focus: 'HIGH_WATTS',
        engineering: { density: 4, efficiency: 5, thermals: 2, reliability: 2 },
        subFeature: 'REDUNDANT_VRM' as const,
        profile: 'EFF' as const,
      },
      {
        name: 'ImmersionTank-1',
        partCategory: 'cooling' as const,
        architecture: 'CRYO_IMMERSION' as const,
        processNode: '2nm' as const,
        focus: 'MAX_THERMAL',
        engineering: { density: 3, efficiency: 3, thermals: 5, reliability: 2 },
        subFeature: 'GRAPHENE_TIM' as const,
        profile: 'COMPACT' as const,
      },
      {
        name: 'WatchdogOS-1',
        partCategory: 'os' as const,
        architecture: 'SELF_HEAL_RT' as const,
        processNode: '5nm' as const,
        focus: 'ZERO_FAULT',
        engineering: { density: 3, efficiency: 4, thermals: 2, reliability: 4 },
        subFeature: 'ECC_SHIELD' as const,
        profile: 'BALANCED' as const,
      },
    ];

    designs.forEach((d) => {
      const res = designCustomComponentBlueprint(fullState, d);
      assert.equal(res.ok, true, `Design ${d.name} (${d.partCategory}) should succeed: ${res.summary}`);
      fullState = res.nextState;
    });

    assert.equal(fullState.fab!.blueprints.length, 7);
    const coolBp = fullState.fab!.blueprints.find((b) => b.partCategory === 'cooling')!;
    assert.equal(coolBp.customSpec?.isImmersion, true);
    assert.ok((coolBp.customSpec?.wearResistance ?? 0) > 0);

    const photonicBp = designCustomComponentBlueprint(fullState, {
      name: 'QPhoton-7',
      partCategory: 'compute',
      architecture: 'ASIC_BLADE',
      processNode: 'photonic',
      focus: 'SHA256',
      engineering: { density: 5, efficiency: 4, thermals: 3, reliability: 2 },
      subFeature: 'ECC_SHIELD',
      profile: 'PERF',
    });
    assert.equal(photonicBp.ok, true, `Photonic Gen-7 chip design should succeed: ${photonicBp.summary}`);
  });

  it('16. Manufactures, builds rigs at $0 fab-stock checkout, deploys/strips slots, drives telemetry, and persists', () => {
    let state = createNewGameState('STANDARD', false, 'TEST_FAB_E2E');
    state = {
      ...state,
      facilityId: 'fac_industrial',
      cash: 800_000,
      unlockedResearch: RESEARCH_NODES.map((n) => n.id),
      fab: { ...buildDefaultFab(state.fab), linesCount: 3 },
    };

    const specsToMake = [
      {
        name: 'FabChassis',
        partCategory: 'chassis' as const,
        architecture: 'CONVERGED_SUPER' as const,
        processNode: '3nm' as const,
        focus: 'HYBRID_8_1',
        engineering: { density: 4, efficiency: 3, thermals: 3, reliability: 3 },
        subFeature: 'ECC_SHIELD' as const,
        profile: 'BALANCED' as const,
      },
      {
        name: 'FabGpu',
        partCategory: 'gpu' as const,
        architecture: 'HBM_MONSTER' as const,
        processNode: '3nm' as const,
        focus: 'ETHASH',
        engineering: { density: 4, efficiency: 3, thermals: 3, reliability: 3 },
        subFeature: 'COPPER_BUS' as const,
        profile: 'PERF' as const,
      },
      {
        name: 'FabPsu',
        partCategory: 'psu' as const,
        architecture: 'INDUSTRIAL_RAIL' as const,
        processNode: '3nm' as const,
        focus: 'HIGH_WATTS',
        engineering: { density: 4, efficiency: 4, thermals: 2, reliability: 3 },
        subFeature: 'REDUNDANT_VRM' as const,
        profile: 'BALANCED' as const,
      },
      {
        name: 'FabImmersion',
        partCategory: 'cooling' as const,
        architecture: 'CRYO_IMMERSION' as const,
        processNode: '3nm' as const,
        focus: 'MAX_THERMAL',
        engineering: { density: 2, efficiency: 3, thermals: 5, reliability: 3 },
        subFeature: 'GRAPHENE_TIM' as const,
        profile: 'COMPACT' as const,
      },
      {
        name: 'FabOS',
        partCategory: 'os' as const,
        architecture: 'BARE_METAL_ASM' as const,
        processNode: '5nm' as const,
        focus: 'MAX_HASH',
        engineering: { density: 5, efficiency: 3, thermals: 2, reliability: 3 },
        subFeature: 'STD' as const,
        profile: 'PERF' as const,
      },
    ];

    specsToMake.forEach((d, idx) => {
      const dr = designCustomComponentBlueprint(state, d);
      assert.equal(dr.ok, true);
      state = dr.nextState;
      const qr = queueFabProduction(state, idx, d.partCategory === 'gpu' ? 2 : 1);
      assert.equal(qr.ok, true);
      state = qr.nextState;
    });

    for (let s = 1; s <= 25; s += 1) {
      const stepped = stepFabProduction(state.fab, s, `Step ${s}`);
      state = { ...state, fab: stepped.nextFab };
      if ((state.fab?.productionQueue.length ?? 0) === 0) break;
    }

    assert.equal(state.fab!.productionQueue.length, 0, 'All batches should complete');
    assert.equal(state.fab!.inventory.length, 5, 'Inventory should hold all 5 custom parts');

    // Verify deployCustomInventoryToRig & stripCustomPartFromRig on Rig #1 for GPU, PSU, Cooling, OS
    const gpuInvIdx = state.fab!.inventory.findIndex((i) => i.partCategory === 'gpu');
    const beforeQty = state.fab!.inventory[gpuInvIdx].qty;
    const depGpu = deployCustomInventoryToRig(state, gpuInvIdx, 0);
    assert.equal(depGpu.ok, true, depGpu.summary);
    state = depGpu.nextState;
    assert.equal(state.rigs[0].customParts?.gpus?.length, 1);

    const coolInvIdx = state.fab!.inventory.findIndex((i) => i.partCategory === 'cooling');
    const depCool = deployCustomInventoryToRig(state, coolInvIdx, 0);
    assert.equal(depCool.ok, true, depCool.summary);
    state = depCool.nextState;

    const osInvIdx = state.fab!.inventory.findIndex((i) => i.partCategory === 'os');
    const depOs = deployCustomInventoryToRig(state, osInvIdx, 0);
    assert.equal(depOs.ok, true, depOs.summary);
    state = depOs.nextState;

    const tel = computeRigTelemetry(
      state.rigs[0],
      getFacility(state.facilityId),
      state.unlockedResearch,
      0
    );
    assert.ok(tel.noiseDba <= 48, 'Custom immersion cooling should enforce <=48 dBA cap');

    // Strip custom GPU back into inventory
    const strippedGpu = stripCustomPartFromRig(state, 0, 'gpu', 0);
    assert.equal(strippedGpu.ok, true, strippedGpu.summary);
    state = strippedGpu.nextState;
    const afterGpuInv = state.fab!.inventory.find((i) => i.partCategory === 'gpu')!;
    assert.equal(afterGpuInv.qty, beforeQty, 'Stripped custom GPU must return to fab inventory');

    // Verify [FAB STOCK] pricing in build rig config: stock cost = $0 for custom slot, resale = full value
    const chassisSpec = state.fab!.inventory.find((i) => i.partCategory === 'chassis')!.customSpec!;
    const psuSpec = state.fab!.inventory.find((i) => i.partCategory === 'psu')!.customSpec!;
    const customConfig: RigBuildConfig = {
      name: 'Custom All-Fab',
      chassisId: CHASSIS_PARTS[0].id,
      computeId: COMPUTE_PARTS[0].id,
      gpuIds: [],
      storageId: STORAGE_PARTS[0].id,
      psuId: PSU_PARTS[0].id,
      coolingId: COOLING_PARTS[0].id,
      osId: OS_PARTS[0].id,
      targetCoin: 'BTC',
      overclockPct: 100,
      customParts: { chassis: chassisSpec, psu: psuSpec },
    };
    const checkoutCost = calculateStockBuildPartsCost(customConfig);
    const fullPartsValue = calculateBaseRigPartsCost(customConfig);
    assert.ok(fullPartsValue > checkoutCost, 'Custom fab stock deducts $0 at checkout vs full valuation');
    assert.ok(calculateRigBuildCost(customConfig, state) < fullPartsValue * 1.2);
    assert.equal(getEffectivePartBundle(customConfig).psu.maxWatts, psuSpec.maxWatts);

    // Verify save round-trip preserves rig.customParts
    const hydrated = hydrateSavedState(JSON.parse(serializeSaveEnvelope(state)));
    assert.ok(hydrated);
    assert.equal(hydrated!.rigs[0].customParts?.cooling?.isImmersion, true);
    assert.equal(hydrated!.rigs[0].customParts?.os?.name, 'FabOS');
  });
});

