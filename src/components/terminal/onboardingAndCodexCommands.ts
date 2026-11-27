import {
  CODEX_ENTRIES,
  CONTEXTUAL_GUIDES,
  TUTORIAL_TOPICS,
  evaluateEarlyObjectives,
  evaluateGuidedChecklist,
  getEffectiveOnboardingMode,
  getActiveGuidedLesson,
  getUnlockedSystems,
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
              ? 'Switched to Guided Mode. Run "guide" to see which milestones you have earned.'
              : 'Switched to Veteran Mode. Systems use their normal research, facility, and cost requirements.',
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
    const activeLesson = getActiveGuidedLesson(state);
    const current = Object.values(CONTEXTUAL_GUIDES).find((item) => item.system === activeLesson && activeLesson);
    if (arg1 === 'lessons') {
      const access = getUnlockedSystems(state);
      append([{ kind: 'HEAD', text: 'GUIDED LESSONS' }, { kind: 'PRE', text: Object.values(CONTEXTUAL_GUIDES)
        .flatMap((lesson) => {
          if (!lesson.system) return [];
          const status = state.guidedOnboarding?.systemStatuses[lesson.system];
          const label = !access[lesson.system] ? access.unlockNotes[lesson.system]
            : status && status !== 'LOCKED' ? status : 'Available on first use';
          return [`  ${lesson.title} · ${label}`];
        }).join('\n') }]);
      return true;
    }
    if (arg1 === 'lesson' || arg1 === 'learned') {
      if (!activeLesson || !current || checklist.mode !== 'GUIDED') {
        append([{ kind: 'TEXT', text: 'No active Guided lesson. Use "guide" to see progression and queued lessons.' }]);
      } else if (arg1 === 'learned') {
        props.onFinishGuidedLesson();
        append([{ kind: 'OK', text: `Lesson learned: ${current.title}. Revisit it with "tutorial ${current.topic}".` }]);
      } else {
        append([{ kind: 'HEAD', text: current.title }, { kind: 'TEXT', text: `${current.body} Try "${TUTORIAL_TOPICS[current.topic].nextCommand}". When ready, enter "guide learned".` }]);
      }
      return true;
    }

    if (arg1 === 'pause') {
      props.onPauseGuidedOnboarding(true);
      append([
        {
          kind: 'OK',
          text: 'Automatic tutorial prompts paused. Milestones still count and system requirements still apply. Run "guide resume" to restore the prompts.',
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
      const details = {
        SLOW: 'Wait four steps between lessons and show a practice command.',
        NORMAL: 'Wait two steps between lessons.',
        FAST: 'Open the next queued lesson as soon as you finish the current one.',
      };
      append([{ kind: 'OK', text: `Guide pace: ${picked.toLowerCase()}. ${details[picked]} Milestones stay the same.` }]);
      return true;
    }
    if (arg1 === 'complete' || arg1 === 'check') {
      if (!arg2) {
        append([{ kind: 'ERR', text: 'Usage: guide complete <task#|task_id>' }]);
        return true;
      }
      const res = props.onCompleteGuidedTask(arg2);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'dismiss') {
      if (!Object.hasOwn(getUnlockedSystems(state).unlockNotes, arg2) && !Object.hasOwn(CONTEXTUAL_GUIDES, arg2)) {
        append([{ kind: 'ERR', text: 'Usage: guide dismiss <systemId|ctx_tipId>. Run "tutorial context" for tip IDs.' }]);
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
      const topic = Object.hasOwn(TUTORIAL_TOPICS, arg2) ? TUTORIAL_TOPICS[arg2] : undefined;
      if (topic) {
        props.onRevisitGuidedTopic(arg2);
        append([
          { kind: 'HEAD', text: `REVISITING: ${topic.title}` },
          { kind: 'PRE', text: topic.lines.join('\n') },
          ...(topic.nextCommand
            ? [{ kind: 'OK' as const, text: `Recommended next: run "${topic.nextCommand}"` }]
            : []),
        ]);
      } else {
        append([{ kind: 'ERR', text: 'Unknown topic. Run "tutorial list" for the available guides.' }]);
      }
      return true;
    }

    let flatIdx = 0;
    const rows = checklist.stages.flatMap((st) => {
      const stageTag = st.completed ? 'COMPLETE' : st.active ? 'ACTIVE  ' : 'QUEUED  ';
      const headerLine = `  [${stageTag}] ${st.spec.title}${st.spec.unlockSystems.length ? ` · Opens: ${st.spec.unlocksLabel}` : ''}`;
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
      ...(checklist.mode === 'GUIDED' ? [{
        kind: 'TEXT' as const,
        text: `Lesson: ${current?.title ?? 'None active'} · Queued: ${(state.guidedOnboarding?.lessonQueue ?? []).filter((id) => state.guidedOnboarding?.systemStatuses[id] === 'ENCOUNTERED').length}. Use "guide lesson" or "guide learned".`,
      }] : []),
      ...(nextTask
        ? [
            {
              kind: 'OK' as const,
              text: `NEXT MILESTONE: ${nextTask.label}. Try "${nextTask.hintCommand}".`,
            },
          ]
        : [
            {
              kind: 'OK' as const,
              text: 'Guided career complete. Your foundry has produced a part that beat its stock reference.',
            },
          ]),
      {
        kind: 'TEXT',
        text: 'Milestones update from play. Commands: "guide check <#>", "guide pause|resume", "guide pace <slow|normal|fast>", "guide dismiss <sys>", "guide revisit <topic>".',
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
