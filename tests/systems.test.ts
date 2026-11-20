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
  createNewGameState,
  estimateFleetHashIndex,
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
  deployCustomAsicToRig,
  designCustomChipBlueprint,
  parseDesignProfile,
  queueFabProduction,
  stripCustomAsicFromRig,
} from '../src/engine/fab';
import { createScenarioState, SCENARIOS } from '../src/engine/scenarios';
import { hydrateSavedState, serializeSaveEnvelope } from '../src/engine/saveSystem';
import { buildDefaultWorld, getPlayerHashIndex, stepSharedWorld } from '../src/engine/world';
import type { GameState } from '../src/types/game';

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

  it('3. Every scenario launches an isolated sandbox save at its stated stage', () => {
    assert.ok(SCENARIOS.length >= 6, 'Scenario catalog should cover the roadmap stages');

    for (const spec of SCENARIOS) {
      const state = createScenarioState(spec.id);
      assert.equal(state.isSandbox, true, `${spec.id} must live in the sandbox save slot`);
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

  it('5. Catalog integrity: Gen-6 parts, research gates and prerequisites all resolve', () => {
    const gen6 = ALL_PARTS.filter((p) => p.generation === 6);
    assert.ok(gen6.length >= 6, 'Gen-6 must cover chassis, compute, GPU, storage, PSU, cooling & OS');

    for (const part of ALL_PARTS) {
      if (part.researchRequired) {
        assert.ok(
          RESEARCH_IDS.has(part.researchRequired),
          `${part.id} references missing research ${part.researchRequired}`
        );
      }
      if (part.generation === 6) {
        assert.ok(part.researchRequired, `${part.id} must be gated behind Gen-6 research`);
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
    assert.ok(starterIndex >= 12 && starterIndex < 100, 'Starter fleet must stay on the rival scale');
    assert.ok(gen6Index > starterIndex, 'Gen-6 fleet must out-score a starter CPU');
    assert.ok(gen6Index < 5000, 'Gen-6 fleet index must not dwarf the rival economy');
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

  it('8. Gen 4-6 GPU-capable chassis exist, hold real GPU clusters and are R&D-gated', () => {
    const gpuChassis = CHASSIS_PARTS.filter(
      (c) => !c.isAsicRack && (c.generation ?? 1) >= 4
    );
    assert.deepEqual(
      [...new Set(gpuChassis.map((c) => c.generation))].sort(),
      [4, 5, 6],
      'Gen 4, 5 and 6 each need a GPU-capable chassis'
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
