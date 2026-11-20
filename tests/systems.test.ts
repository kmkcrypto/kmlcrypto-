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
  buildDefaultFab,
  deployCustomAsicToRig,
  designCustomChipBlueprint,
} from '../src/engine/fab';
import { createScenarioState, SCENARIOS } from '../src/engine/scenarios';
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
});
