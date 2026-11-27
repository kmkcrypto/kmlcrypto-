import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODEX_ENTRIES,
  CONTEXTUAL_GUIDES,
  getBusinessTutorialTopicId,
  searchCodexEntries,
  TUTORIAL_TOPICS,
} from '../src/data/onboarding';
import { serializeSaveEnvelope, validateAndParseImportedSave } from '../src/engine/saveSystem';
import {
  acquireTargetCompany,
  buildDefaultConglomerate,
  BUSINESS_ORDER,
  createNewGameState,
} from '../src/engine/simulation';
import { createScenarioState } from '../src/engine/scenarios';
import { BusinessId } from '../src/types/game';

describe('Conglomerate Phase 9 — Corporate HQ Drawer, Division Tutorials & Codex Entries', () => {
  it('1. Conglomerate & 6-business tutorial topics, contextual guides, and Codex entries resolve cleanly', () => {
    const requiredTopics = [
      'conglomerate',
      'market_intel',
      'hardware_eng',
      'manufacturing_div',
      'mining_services',
      'underground_div',
    ];
    for (const id of requiredTopics) {
      assert.ok(Object.hasOwn(TUTORIAL_TOPICS, id), `Missing tutorial topic ${id}`);
      assert.ok(TUTORIAL_TOPICS[id].lines.length >= 4);
      assert.ok(TUTORIAL_TOPICS[id].nextCommand.length > 0);
    }

    for (const bizId of BUSINESS_ORDER) {
      const topicId = getBusinessTutorialTopicId(bizId);
      assert.ok(Object.hasOwn(TUTORIAL_TOPICS, topicId), `Invalid mapped topic ${topicId} for ${bizId}`);
    }

    for (const [ctxId, guide] of Object.entries(CONTEXTUAL_GUIDES)) {
      assert.ok(
        Object.hasOwn(TUTORIAL_TOPICS, guide.topic),
        `Contextual guide ${ctxId} references missing topic ${guide.topic}`
      );
    }

    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'conglomerate'));
    assert.ok(CODEX_ENTRIES.some((c) => c.key === 'divisions'));
    assert.ok(searchCodexEntries('synergy').some((c) => c.key === 'conglomerate'));
    assert.ok(searchCodexEntries('firewall').some((c) => c.key === 'divisions'));
  });

  it('2. Post-acquisition guidance points to division tutorial and businessTutorialsSeen persists across save/load', () => {
    const cong6 = createScenarioState('CONGLOMERATE_GEN6');
    const funded = { ...cong6, cash: 50_000_000 };

    const acq = acquireTargetCompany(funded, 'services');
    assert.equal(acq.ok, true, acq.summary);
    assert.match(acq.summary, /tutorial mining_services/i);
    assert.ok(acq.nextState.news.some((n) => /tutorial mining_services/i.test(n.detail)));

    // Before player opens or dismisses the briefing, MINING_SERVICES stays unseen for the HQ Drawer orientation card
    assert.equal(
      acq.nextState.conglomerate?.businessTutorialsSeen.includes('MINING_SERVICES'),
      false
    );

    // Simulate acknowledging / viewing the division orientation
    const seenList: BusinessId[] = [
      ...(acq.nextState.conglomerate?.businessTutorialsSeen ?? []),
      'MINING_SERVICES',
    ];
    const withSeen = {
      ...acq.nextState,
      conglomerate: {
        ...buildDefaultConglomerate(acq.nextState, acq.nextState.conglomerate),
        businessTutorialsSeen: seenList,
      },
    };

    const json = serializeSaveEnvelope(withSeen);
    const parsed = validateAndParseImportedSave(json);
    assert.equal(parsed.ok, true, parsed.error);
    assert.ok(parsed.state?.conglomerate?.businessTutorialsSeen.includes('MINING_SERVICES'));

    const starter = createNewGameState('STANDARD', false, 'PHASE9_BASE');
    assert.deepEqual(buildDefaultConglomerate(starter, starter.conglomerate).businessTutorialsSeen, []);
  });
});
