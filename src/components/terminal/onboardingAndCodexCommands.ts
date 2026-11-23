import {
  CODEX_ENTRIES,
  TUTORIAL_TOPICS,
  evaluateEarlyObjectives,
  evaluateGuidedChecklist,
  getEffectiveOnboardingMode,
  searchCodexEntries,
} from '../../data/onboarding';
import { formatUsd } from '../../utils/format';
import { padLeft, padRight, TerminalCommandHandler } from './types';

export const handleOnboardingAndCodexCommand: TerminalCommandHandler = (ctx) => {
  const { state, props, cmd, arg1, arg2, parts, append } = ctx;

  if (cmd === 'objectives' || cmd === 'goals' || cmd === 'missions') {
    props.onClaimObjectives();
    const objs = evaluateEarlyObjectives(state);
    const done = objs.filter((o) => o.completed).length;
    const rows = objs.map((o, idx) => {
      const mark = o.completed ? '[x]' : '[ ]';
      return `  ${mark} ${idx + 1}. ${padRight(o.title, 46)} +${padLeft(formatUsd(o.rewardCash), 5)} +${padLeft(
        `${o.rewardRp}RP`,
        4
      )}\n         ${o.completed ? 'Completed!' : `How: ${o.hint}`}`;
    });
    append([
      {
        kind: 'HEAD',
        text: `EARLY-GAME OBJECTIVES (${done}/${objs.length} COMPLETED)`,
      },
      { kind: 'PRE', text: rows.join('\n') },
      {
        kind: 'TEXT',
        text:
          done < objs.length
            ? 'Rewards deposit automatically as each objective finishes. Type "guide", "tutorial list", or "codex" for detailed help.'
            : 'All early-game objectives complete! Run "milestones", "challenges", or "contracts" for mid-game targets.',
      },
    ]);
    return true;
  }

  if (cmd === 'mode') {
    if (arg1 === 'guided' || arg1 === 'veteran' || arg1 === 'full' || arg1 === 'open') {
      const nextMode = arg1 === 'guided' ? 'GUIDED' : 'VETERAN';
      props.onSetOnboardingMode(nextMode);
      append([
        {
          kind: 'OK',
          text:
            nextMode === 'GUIDED'
              ? 'Switched to GUIDED mode: stage-by-stage checklist & contextual mentors enabled. Run "guide" to view progress.'
              : 'Switched to VETERAN mode: strict checklist gating bypassed; all mechanics immediately accessible.',
        },
      ]);
      return true;
    }
    const cur = getEffectiveOnboardingMode(state);
    append([
      {
        kind: 'TEXT',
        text: `Current mode: ${cur} (Guided paused: ${state.guidedOnboarding?.paused ? 'YES' : 'NO'}, pace: ${
          state.guidedOnboarding?.pace ?? 'NORMAL'
        }). Switch anytime: "mode guided" or "mode veteran".`,
      },
    ]);
    return true;
  }

  if (cmd === 'guide') {
    const checklist = evaluateGuidedChecklist(state);

    if (arg1 === 'pause') {
      props.onPauseGuidedOnboarding(true);
      append([
        {
          kind: 'OK',
          text: 'Guided checklist paused — all systems remain usable without gate prompts while paused. Run "guide resume" anytime.',
        },
      ]);
      return true;
    }
    if (arg1 === 'resume') {
      props.onPauseGuidedOnboarding(false);
      append([{ kind: 'OK', text: 'Guided checklist resumed.' }]);
      return true;
    }
    if (arg1 === 'pace') {
      const map: Record<string, 'SLOW' | 'NORMAL' | 'FAST'> = {
        slow: 'SLOW',
        normal: 'NORMAL',
        fast: 'FAST',
      };
      const picked = map[arg2];
      if (!picked) {
        append([{ kind: 'ERR', text: 'Usage: guide pace <slow|normal|fast>' }]);
        return true;
      }
      props.onSetGuidedPace(picked);
      append([{ kind: 'OK', text: `Guided onboarding pace set to ${picked}.` }]);
      return true;
    }
    if (arg1 === 'complete') {
      if (!arg2) {
        append([{ kind: 'ERR', text: 'Usage: guide complete <task#|task_id>' }]);
        return true;
      }
      const res = props.onCompleteGuidedTask(arg2);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'dismiss') {
      if (!arg2) {
        append([{ kind: 'ERR', text: 'Usage: guide dismiss <systemId>' }]);
        return true;
      }
      props.onDismissGuidedSystem(arg2);
      append([{ kind: 'OK', text: `Dismissed guidance prompt for "${arg2}".` }]);
      return true;
    }
    if (arg1 === 'revisit') {
      if (!arg2) {
        append([
          { kind: 'ERR', text: `Usage: guide revisit <${Object.keys(TUTORIAL_TOPICS).join('|')}>` },
        ]);
        return true;
      }
      props.onRevisitGuidedTopic(arg2);
      const topic = TUTORIAL_TOPICS[arg2];
      if (topic) {
        append([
          { kind: 'HEAD', text: `REVISITING: ${topic.title}` },
          { kind: 'PRE', text: topic.lines.join('\n') },
          ...(topic.nextCommand
            ? [{ kind: 'OK' as const, text: `Recommended next: run "${topic.nextCommand}"` }]
            : []),
        ]);
      } else {
        append([{ kind: 'OK', text: `Marked topic "${arg2}" as revisited.` }]);
      }
      return true;
    }

    let flatIdx = 0;
    const rows = checklist.stages.flatMap((st) => {
      const stageTag = st.completed ? 'COMPLETE' : st.active ? 'ACTIVE  ' : 'QUEUED  ';
      const headerLine = `  [${stageTag}] ${st.spec.title} — ${st.spec.unlocksLabel}`;
      const taskLines = st.tasks.map((t) => {
        flatIdx += 1;
        const mark = t.done ? '[x]' : st.active ? '[>]' : '[ ]';
        return `    ${mark} #${String(flatIdx).padStart(2)} ${t.label}  (cmd: "${t.hintCommand}" | id: ${t.id})`;
      });
      return [headerLine, ...taskLines];
    });

    const activeStage = checklist.stages[checklist.currentStageIdx];
    const nextTask = activeStage?.tasks.find((t) => !t.done);

    append([
      {
        kind: 'HEAD',
        text: `GUIDED PROGRESSION CHECKLIST (${checklist.completedTaskCount}/${checklist.totalTaskCount} COMPLETE) · Mode=${checklist.mode} · Pace=${checklist.pace}${
          checklist.paused ? ' [PAUSED]' : ''
        }`,
      },
      { kind: 'PRE', text: rows.join('\n') },
      ...(nextTask
        ? [
            {
              kind: 'OK' as const,
              text: `NEXT STEP: ${nextTask.label} (try "${nextTask.hintCommand}" or "guide complete ${nextTask.id}")`,
            },
          ]
        : [
            {
              kind: 'OK' as const,
              text: 'All guided checklist stages completed! Every advanced system is unlocked.',
            },
          ]),
      {
        kind: 'TEXT',
        text: 'Commands: "guide complete <#>", "guide pause|resume", "guide pace <slow|normal|fast>", "guide dismiss <sys>", "guide revisit <topic>", "mode veteran".',
      },
    ]);
    return true;
  }

  if (cmd === 'codex' || cmd === 'wiki' || cmd === 'manual') {
    const validCategories = ['CORE', 'HARDWARE', 'ECONOMY', 'OPERATIONS', 'PROGRESSION'];
    const maybeCat = parts[1]?.toUpperCase();
    const hasCat = Boolean(maybeCat && validCategories.includes(maybeCat));
    const category = hasCat ? maybeCat : undefined;
    const query = (hasCat ? parts.slice(2) : parts.slice(1)).join(' ').trim();

    if (!query && !category) {
      const list = CODEX_ENTRIES.map(
        (e) =>
          `  ${e.key.padEnd(14)} [${e.category.padEnd(11)}] ${e.title}${
            e.relatedKeys?.length ? `  (see: ${e.relatedKeys.join(', ')})` : ''
          }`
      );
      append([
        { kind: 'HEAD', text: 'HASHRATE FIELD MANUAL & CODEX' },
        { kind: 'PRE', text: list.join('\n') },
        {
          kind: 'TEXT',
          text: 'Filter by category or keyword: "codex CORE", "codex HARDWARE", "codex gen7", "codex custom_coins", or "tutorial list".',
        },
      ]);
      return true;
    }

    const matches = searchCodexEntries(query, category);
    if (matches.length === 0) {
      append([
        {
          kind: 'WARN',
          text: `No codex entry matched "${query || category}". Run "codex" to list all entries.`,
        },
      ]);
      return true;
    }

    const bodyLines = matches.flatMap((m) => [
      `[${m.title}] (${m.category})`,
      ...m.body,
      ...(m.relatedKeys?.length ? [`  Related codex entries: ${m.relatedKeys.join(', ')}`] : []),
      '',
    ]);
    append([
      {
        kind: 'HEAD',
        text: `CODEX: ${category ? `${category} ` : ''}${query ? `"${query}"` : ''}`.trim(),
      },
      { kind: 'PRE', text: bodyLines.join('\n') },
    ]);
    return true;
  }

  return false;
};
