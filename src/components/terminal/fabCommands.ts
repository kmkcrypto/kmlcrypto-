import { getUnlockedSystems } from '../../data/onboarding';
import {
  compareBlueprints,
  formatFabStatusReport,
  formatManufacturingHistoryReport,
  inspectBatchReport,
  inspectSerialReport,
  isFabUnlocked,
  parseDesignProfile,
} from '../../engine/fab';
import { ChipProcessNode, MiningAlgorithm, PartCategory, TechBranch } from '../../types/game';
import { formatUsd } from '../../utils/format';
import { TerminalCommandHandler } from './types';

export const handleFabCommand: TerminalCommandHandler = (ctx) => {
  const {
    state,
    props,
    raw,
    parts,
    cmd,
    arg1,
    arg2,
    arg3,
    arg4,
    append,
    maybeShowContextualGuide,
    openFabWizard,
  } = ctx;

  if (cmd !== 'fab' && cmd !== 'foundry') return false;

  if (!arg1 || arg1 === 'status' || arg1 === 'list') {
    maybeShowContextualGuide('ctx_fab');
    append([
      { kind: 'HEAD', text: 'SEMICONDUCTOR & HARDWARE MANUFACTURING FOUNDRY' },
      { kind: 'PRE', text: formatFabStatusReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'line' && arg2 === 'build') {
    const res = props.onBuildFabLine();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'drafts') {
    const drafts = state.fab?.draftBlueprints ?? [];
    if (drafts.length === 0) {
      append([
        {
          kind: 'TEXT',
          text: 'No saved draft blueprints yet. Run "fab design" and enter "draft" on the Review step to save one.',
        },
      ]);
      return true;
    }
    const rows = drafts.map(
      (d, i) =>
        `  D#${i + 1} ${d.name.padEnd(22)} [${(d.partCategory ?? 'compute').toUpperCase().padEnd(7)} ${d.processNode.padEnd(8)} · ${
          d.branch ?? 'SILICON'
        }] Mfg:${d.manufacturabilityPct ?? 85}% · NRE ${formatUsd(d.nreCostUsd ?? 0)} · "fab draft tapeout ${i + 1}"`
    );
    append([
      { kind: 'HEAD', text: `SAVED DRAFT BLUEPRINTS (${drafts.length})` },
      { kind: 'PRE', text: rows.join('\n') },
      { kind: 'TEXT', text: 'Commands: "fab draft tapeout <#>" or "fab draft del <#>".' },
    ]);
    return true;
  }

  if (arg1 === 'draft') {
    if (!arg2 || arg2 === 'list') {
      return handleFabCommand({ ...ctx, arg1: 'drafts', arg2: '' });
    }
    const idx = parseInt(arg3, 10) - 1;
    if (arg2 === 'tapeout' || arg2 === 'finalize') {
      if (isNaN(idx)) {
        append([{ kind: 'ERR', text: 'Usage: fab draft tapeout <draft#>' }]);
        return true;
      }
      const res = props.onTapeoutDraftBlueprint(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg2 === 'del' || arg2 === 'delete' || arg2 === 'rm') {
      if (isNaN(idx)) {
        append([{ kind: 'ERR', text: 'Usage: fab draft del <draft#>' }]);
        return true;
      }
      const res = props.onDeleteDraftBlueprint(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([{ kind: 'ERR', text: 'Usage: fab draft <list|tapeout <#>|del <#>>' }]);
    return true;
  }

  if (arg1 === 'revise') {
    const bpIdx = parseInt(arg2, 10) - 1;
    if (isNaN(bpIdx)) {
      append([{ kind: 'ERR', text: 'Usage: fab revise <blueprint#> [perf|balanced|eff|compact] [silicon|quantum|photonic]' }]);
      return true;
    }
    const profile = arg3 ? parseDesignProfile(arg3) : undefined;
    const branchMap: Record<string, TechBranch> = {
      silicon: 'SILICON',
      quantum: 'QUANTUM',
      photonic: 'PHOTONIC',
    };
    const branch = branchMap[arg4] ?? branchMap[arg3] ?? undefined;
    const res = props.onReviseBlueprint(bpIdx, {
      ...(profile ? { profile } : {}),
      ...(branch ? { branch } : {}),
      revisionNote: `Terminal revision (${profile ?? 'tuned'}${branch ? `, ${branch}` : ''})`,
    });
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'compare') {
    const idxA = parseInt(arg2, 10) - 1;
    const idxB = parseInt(arg3, 10) - 1;
    if (isNaN(idxA) || isNaN(idxB)) {
      append([{ kind: 'ERR', text: 'Usage: fab compare <bp1#> <bp2#>' }]);
      return true;
    }
    append([
      { kind: 'HEAD', text: 'BLUEPRINT SIDE-BY-SIDE COMPARISON' },
      { kind: 'PRE', text: compareBlueprints(state, idxA, idxB) },
    ]);
    return true;
  }

  if (arg1 === 'proto' || arg1 === 'prototype' || arg1 === 'test') {
    maybeShowContextualGuide('ctx_proto');
    const bpIdx = parseInt(arg2, 10) - 1;
    if (isNaN(bpIdx)) {
      append([{ kind: 'ERR', text: 'Usage: fab proto <blueprint#>' }]);
      return true;
    }
    const res = props.onRunPrototypeTest(bpIdx);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'batch') {
    append([
      { kind: 'HEAD', text: 'PRODUCTION BATCH QA INSPECTION' },
      { kind: 'PRE', text: inspectBatchReport(state, arg2 || '1') },
    ]);
    return true;
  }

  if (arg1 === 'serial') {
    if (!arg2) {
      append([{ kind: 'ERR', text: 'Usage: fab serial <SERIAL-ID> (e.g. fab serial HW-G4S-0001)' }]);
      return true;
    }
    append([
      { kind: 'HEAD', text: 'SERIAL NUMBER GENEALOGY REPORT' },
      { kind: 'PRE', text: inspectSerialReport(state, arg2) },
    ]);
    return true;
  }

  if (arg1 === 'history' || arg1 === 'log') {
    append([
      { kind: 'HEAD', text: 'FOUNDRY MANUFACTURING & QC ARCHIVE' },
      { kind: 'PRE', text: formatManufacturingHistoryReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'design') {
    maybeShowContextualGuide('ctx_fab');
    if (!arg2 || arg2 === 'wizard' || arg2 === 'new') {
      const gate = isFabUnlocked(state);
      if (!gate.ok) {
        append([{ kind: 'ERR', text: gate.reason ?? 'Foundry locked.' }]);
        return true;
      }
      if ((state.fab?.linesCount ?? 0) < 1) {
        append([{ kind: 'ERR', text: 'Commission Fab Line #1 first ("fab line build").' }]);
        return true;
      }
      openFabWizard();
      return true;
    }

    const rawTokens = raw.trim().split(/\s+/).slice(2);
    const bpName = rawTokens[0];
    const algoRaw = (rawTokens[1] || '').toUpperCase() as MiningAlgorithm;
    const nodeRaw = (rawTokens[2] || '').toLowerCase() as ChipProcessNode;
    const profile = parseDesignProfile(rawTokens[3]);
    const validAlgos: MiningAlgorithm[] = [
      'SHA256',
      'SCRYPT',
      'RANDOMX',
      'ETHASH',
      'KAWPOW',
      'EQUIHASH',
      'POST',
      'QHASH',
    ];
    const validNodes: ChipProcessNode[] = ['7nm', '5nm', '3nm', '2nm', '1nm', 'photonic'];
    if (!bpName || !validAlgos.includes(algoRaw) || !validNodes.includes(nodeRaw) || !profile) {
      append([
        {
          kind: 'ERR',
          text: 'Usage: "fab design" (wizard) OR "fab design <SingleWordName> <SHA256|SCRYPT|RANDOMX|ETHASH|KAWPOW|EQUIHASH|POST|QHASH> <7nm|5nm|3nm|2nm|1nm|photonic> [perf|balanced|eff|compact]".',
        },
      ]);
      return true;
    }
    if (nodeRaw === 'photonic' && !state.devUnlockAll && !getUnlockedSystems(state).gen7) {
      append([{ kind: 'ERR', text: 'Gen-7 Quantum & Photonic manufacturing is still locked in R&D / progression.' }]);
      return true;
    }
    if (nodeRaw === 'photonic' || nodeRaw === '1nm') {
      maybeShowContextualGuide('ctx_gen7');
    }
    const res = props.onDesignCustomChip(bpName, algoRaw, nodeRaw, profile);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'strip') {
    const rigIdx = parseInt(arg2, 10) - 1;
    if (isNaN(rigIdx)) {
      append([{ kind: 'ERR', text: 'Usage: fab strip <rig#> [chassis|compute|gpu|storage|psu|cooling|os] [gpuSlot#]' }]);
      return true;
    }
    const validSlots: PartCategory[] = ['chassis', 'compute', 'gpu', 'storage', 'psu', 'cooling', 'os'];
    const slot = validSlots.includes(arg3 as PartCategory) ? (arg3 as PartCategory) : 'compute';
    const gpuSlotRaw = parts[4] ? parseInt(parts[4], 10) - 1 : 0;
    const res = props.onStripCustomAsic(rigIdx, slot, isNaN(gpuSlotRaw) ? 0 : Math.max(0, gpuSlotRaw));
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'produce') {
    const bpIdx = parseInt(arg2, 10) - 1;
    const qty = parseInt(arg3 || '1', 10);
    if (isNaN(bpIdx) || isNaN(qty)) {
      append([{ kind: 'ERR', text: 'Usage: fab produce <blueprint#> <qty>' }]);
      return true;
    }
    const res = props.onQueueFabProduction(bpIdx, qty);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'deploy') {
    const invIdx = parseInt(arg2, 10) - 1;
    const rigIdx = parseInt(arg3, 10) - 1;
    const gpuSlotRaw = parts[4] ? parseInt(parts[4], 10) - 1 : undefined;
    if (isNaN(invIdx) || isNaN(rigIdx)) {
      append([{ kind: 'ERR', text: 'Usage: fab deploy <inventory#> <rig#> [gpuSlot#]' }]);
      return true;
    }
    const res = props.onDeployCustomAsic(
      invIdx,
      rigIdx,
      typeof gpuSlotRaw === 'number' && !isNaN(gpuSlotRaw) ? Math.max(0, gpuSlotRaw) : undefined
    );
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'sell') {
    const invIdx = parseInt(arg2, 10) - 1;
    const qtyOrAll: number | 'ALL' = arg3 === 'all' ? 'ALL' : parseInt(arg3 || '1', 10);
    if (isNaN(invIdx) || (qtyOrAll !== 'ALL' && isNaN(qtyOrAll))) {
      append([{ kind: 'ERR', text: 'Usage: fab sell <inventory#> <qty|all>' }]);
      return true;
    }
    const res = props.onSellCustomAsic(invIdx, qtyOrAll);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  append([
    {
      kind: 'ERR',
      text: 'Usage: fab [status|line build|design|drafts|draft tapeout <#>|proto <#>|revise <#>|compare <a#> <b#>|produce <#> <qty>|batch [<#>]|serial <ID>|history|deploy <#> <#>|strip <#>|sell <#> <qty>]',
    },
  ]);
  return true;
};
