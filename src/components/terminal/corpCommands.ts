import {
  formatAcquisitionsReport,
  formatCorporateStatusReport,
  resolveBusinessQuery,
} from '../../engine/acquisitions';
import { BUSINESS_CATALOG, getRankedAffinityBusinesses } from '../../engine/affinity';
import { getBusinessTutorialTopicId, TUTORIAL_TOPICS } from '../../data/onboarding';
import { formatDivisionLedgerReport } from '../../engine/businesses';
import { buildDefaultConglomerate, isBusinessOwned } from '../../engine/conglomerate';
import {
  formatCorporateHQReport,
  formatSynergiesReport,
} from '../../engine/corporate';
import { formatMarketIntelReport } from '../../engine/marketIntel';
import { formatMiningServicesReport } from '../../engine/miningServices';
import { formatHardwareEngReport } from '../../engine/hardwareEng';
import { formatManufacturingDivisionReport } from '../../engine/manufacturing';
import { formatUndergroundDivisionReport } from '../../engine/undergroundDiv';
import { TerminalCommandContext, TerminalCommandHandler } from './types';

function handleIntelSubcommand(
  ctx: TerminalCommandContext,
  sub?: string,
  valArg?: string
): boolean {
  const { state, props, append } = ctx;
  if (!sub || sub === 'status' || sub === 'info') {
    append([
      { kind: 'HEAD', text: 'BUSINESS 2 // MARKET INTELLIGENCE' },
      { kind: 'PRE', text: formatMarketIntelReport(state) },
    ]);
    return true;
  }
  if (sub === 'forecast' || sub === 'run' || sub === 'calibrate') {
    const res = props.onRunMarketForecastModel();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'upgrade' || sub === 'model') {
    const res = props.onUpgradePredictionModel();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'sub' || sub === 'subs' || sub === 'subscribe') {
    const qty = valArg ? Math.max(1, parseInt(valArg, 10) || 1) : 1;
    const res = props.onExpandIntelSubscriptions(qty);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'license' || sub === 'sell') {
    const packs = valArg ? Math.max(1, parseInt(valArg, 10) || 1) : 1;
    const res = props.onSellPredictionSoftwareLicenses(packs);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'advisory' || sub === 'adv' || sub === 'toggle') {
    const res = props.onToggleIntelAdvisory();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  append([
    {
      kind: 'ERR',
      text: 'Usage: intel [status | forecast | upgrade | sub [qty] | license [1..3] | advisory]',
    },
  ]);
  return true;
}

function handleServicesSubcommand(
  ctx: TerminalCommandContext,
  sub?: string,
  argA?: string,
  argB?: string
): boolean {
  const { state, props, append } = ctx;
  if (!sub || sub === 'status' || sub === 'info') {
    append([
      { kind: 'HEAD', text: 'BUSINESS 5 // MINING SERVICES' },
      { kind: 'PRE', text: formatMiningServicesReport(state) },
    ]);
    return true;
  }
  if (sub === 'pool') {
    if (!argA || argA === 'toggle') {
      const res = props.onToggleCommercialPool();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (argA === 'fee') {
      const fee = parseFloat(argB ?? '');
      if (!Number.isFinite(fee)) {
        append([{ kind: 'ERR', text: 'Usage: services pool fee <0.25..5.0>' }]);
        return true;
      }
      const res = props.onSetCommercialPoolFee(fee);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([{ kind: 'ERR', text: 'Usage: services pool [toggle | fee <0.25..5.0>]' }]);
    return true;
  }
  if (sub === 'expand' || sub === 'racks') {
    const kw = argA ? Math.max(10, parseInt(argA, 10) || 50) : 50;
    const res = props.onExpandHostingInfrastructure(kw);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'client' || sub === 'clients' || sub === 'host') {
    if (!argA || argA === 'add') {
      const qty = argB ? Math.max(1, parseInt(argB, 10) || 1) : 1;
      const res = props.onOnboardHostingClient(qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (argA === 'drop' || argA === 'remove') {
      const qty = argB ? Math.max(1, parseInt(argB, 10) || 1) : 1;
      const res = props.onDropHostingClient(qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    const directQty = parseInt(argA, 10);
    if (Number.isFinite(directQty) && directQty > 0) {
      const res = props.onOnboardHostingClient(directQty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([{ kind: 'ERR', text: 'Usage: services client <add|drop> [qty]' }]);
    return true;
  }
  if (sub === 'lease' || sub === 'compute') {
    const units = argA ? Math.max(1, parseInt(argA, 10) || 1) : 1;
    const res = props.onLeaseComputeCapacity(units);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'sla' || sub === 'audit') {
    const res = props.onPerformServicesSlaAudit();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  append([
    {
      kind: 'ERR',
      text: 'Usage: services [status | pool [toggle|fee <%>] | expand [kW] | client <add|drop> [qty] | lease [units] | sla]',
    },
  ]);
  return true;
}

function handleEngSubcommand(
  ctx: TerminalCommandContext,
  sub?: string,
  argA?: string
): boolean {
  const { state, props, append } = ctx;
  if (!sub || sub === 'status' || sub === 'info') {
    append([
      { kind: 'HEAD', text: 'BUSINESS 3 // HARDWARE ENGINEERING' },
      { kind: 'PRE', text: formatHardwareEngReport(state) },
    ]);
    return true;
  }
  if (sub === 'license' || sub === 'ip') {
    const bpNum = parseInt(argA ?? '', 10);
    if (!Number.isFinite(bpNum) || bpNum < 1) {
      append([{ kind: 'ERR', text: 'Usage: eng license <bp#> (1-based index from "fab")' }]);
      return true;
    }
    const res = props.onLicenseBlueprintExternally(bpNum - 1);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'contract' || sub === 'spec') {
    const res = props.onCompleteExternalDesignContract(argA);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'tune' || sub === 'rd' || sub === 'cooling') {
    const res = props.onRunCoolingPowerEngineeringTune();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'upgrade' || sub === 'lab') {
    const res = props.onUpgradeHardwareEngLab();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  append([
    {
      kind: 'ERR',
      text: 'Usage: eng [status | license <bp#> | contract [compute|gpu|cooling|psu] | tune | upgrade]',
    },
  ]);
  return true;
}

function handleMfgSubcommand(
  ctx: TerminalCommandContext,
  sub?: string,
  argA?: string,
  argB?: string,
  argC?: string
): boolean {
  const { state, props, append } = ctx;
  if (!sub || sub === 'status' || sub === 'info') {
    append([
      { kind: 'HEAD', text: 'BUSINESS 4 // MANUFACTURING DIVISION' },
      { kind: 'PRE', text: formatManufacturingDivisionReport(state) },
    ]);
    return true;
  }
  if (sub === 'oem') {
    if (!argA || argA === 'start' || argA === 'accept') {
      const cat = argA === 'start' || argA === 'accept' ? argB : argA;
      const qtyArg = argA === 'start' || argA === 'accept' ? argC : argB;
      const qty = qtyArg ? Math.max(2, parseInt(qtyArg, 10) || 4) : 4;
      const res = props.onStartOemContract(cat, qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (argA === 'fulfill' || argA === 'ship') {
      const invNum = parseInt(argB ?? '', 10);
      if (!Number.isFinite(invNum) || invNum < 1) {
        append([{ kind: 'ERR', text: 'Usage: mfg oem fulfill <inv#> (1-based lot index from "fab")' }]);
        return true;
      }
      const res = props.onFulfillOemFromInventory(invNum - 1);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([
      {
        kind: 'ERR',
        text: 'Usage: mfg oem [start [compute|gpu|chassis|storage|psu|cooling|os] [qty] | fulfill <inv#>]',
      },
    ]);
    return true;
  }
  if (sub === 'supply' || sub === 'transfer') {
    const res = props.onFulfillInternalSupplyOrder(argA);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'qc' || sub === 'audit' || sub === 'calibrate') {
    const res = props.onRunManufacturingQcAudit();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  append([
    {
      kind: 'ERR',
      text: 'Usage: mfg [status | oem start [cat] [qty] | oem fulfill <inv#> | supply <mining|services> | qc]',
    },
  ]);
  return true;
}

function handleUgSubcommand(
  ctx: TerminalCommandContext,
  sub?: string,
  argA?: string
): boolean {
  const { state, props, append } = ctx;
  if (!sub || sub === 'status' || sub === 'info') {
    append([
      { kind: 'HEAD', text: 'BUSINESS 6 // UNDERGROUND SUBSIDIARY' },
      { kind: 'PRE', text: formatUndergroundDivisionReport(state) },
    ]);
    return true;
  }
  if (sub === 'shield' || sub === 'structure' || sub === 'firewall') {
    const res = props.onHardenShellSubsidiary();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'contract' || sub === 'op') {
    const res = props.onStartUndergroundContract(argA);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'sweep' || sub === 'scrub') {
    const res = props.onRunAuditFirewallSweep();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  if (sub === 'contain' || sub === 'isolate') {
    const res = props.onContainParentSpillover();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }
  append([
    {
      kind: 'ERR',
      text: 'Usage: ug [status | shield | contract [escrow|liquidity|pressure] | sweep | contain]',
    },
  ]);
  return true;
}

export const handleCorpCommand: TerminalCommandHandler = (ctx) => {
  const { state, props, parts, cmd, arg1, arg2, arg3, arg4, append } = ctx;

  if (
    cmd !== 'corp' &&
    cmd !== 'acquire' &&
    cmd !== 'acquisitions' &&
    cmd !== 'hq' &&
    cmd !== 'intel' &&
    cmd !== 'services' &&
    cmd !== 'eng' &&
    cmd !== 'mfg' &&
    cmd !== 'ug'
  ) {
    return false;
  }

  if (cmd === 'intel') {
    ctx.maybeShowContextualGuide('ctx_intel');
    return handleIntelSubcommand(ctx, arg1, arg2);
  }

  if (cmd === 'services') {
    ctx.maybeShowContextualGuide('ctx_services');
    return handleServicesSubcommand(ctx, arg1, arg2, arg3);
  }

  if (cmd === 'eng') {
    ctx.maybeShowContextualGuide('ctx_eng');
    return handleEngSubcommand(ctx, arg1, arg2);
  }

  if (cmd === 'mfg') {
    ctx.maybeShowContextualGuide('ctx_mfg');
    return handleMfgSubcommand(ctx, arg1, arg2, arg3, arg4);
  }

  if (cmd === 'ug') {
    ctx.maybeShowContextualGuide('ctx_ug');
    return handleUgSubcommand(ctx, arg1, arg2);
  }

  if (cmd === 'acquire' || cmd === 'acquisitions') {
    const query = parts.slice(2).join(' ').trim();
    if (!arg1 || arg1 === 'list' || arg1 === 'status') {
      append([
        { kind: 'HEAD', text: 'CORPORATE M&A & DISTRESSED ACQUISITIONS' },
        { kind: 'PRE', text: formatAcquisitionsReport(state) },
      ]);
      return true;
    }
    if (arg1 === 'inspect' || arg1 === 'dd' || arg1 === 'audit') {
      if (!query) {
        append([{ kind: 'ERR', text: 'Usage: acquire inspect <#|company|division>' }]);
        return true;
      }
      const res = props.onInspectAcquisitionTarget(query);
      append([
        { kind: res.ok ? 'PRE' : 'ERR', text: res.summary },
        ...(res.ok ? [{ kind: 'TEXT' as const, text: `To close buyout: "acquire buy ${arg2}"` }] : []),
      ]);
      return true;
    }
    if (arg1 === 'buy' || arg1 === 'acquire') {
      if (!query) {
        append([{ kind: 'ERR', text: 'Usage: acquire buy <#|company|division>' }]);
        return true;
      }
      const res = props.onAcquireTargetCompany(query);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'refresh') {
      const res = props.onRefreshAcquisitionMarket();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([{ kind: 'ERR', text: 'Usage: acquire [list | inspect <#> | buy <#> | refresh]' }]);
    return true;
  }

  if (cmd === 'hq') {
    if (!arg1 || arg1 === 'status') {
      append([
        { kind: 'HEAD', text: 'CORPORATE HEADQUARTERS & GOVERNANCE' },
        { kind: 'PRE', text: formatCorporateHQReport(state) },
      ]);
      return true;
    }
    if (arg1 === 'establish' || arg1 === 'found' || arg1 === 'incorporate') {
      const companyName = parts.slice(2).join(' ').trim() || undefined;
      const res = props.onEstablishCorporateHQ(companyName);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'upgrade' || arg1 === 'expand') {
      const res = props.onUpgradeCorporateHQ();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'rename') {
      const companyName = parts.slice(2).join(' ').trim();
      if (!companyName) {
        append([{ kind: 'ERR', text: 'Usage: hq rename <Corporation Name>' }]);
        return true;
      }
      const res = props.onRenameCorporateHQ(companyName);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'synergy' || arg1 === 'synergies' || arg1 === 'syn') {
      if (!arg2 || arg2 === 'list' || arg2 === 'status') {
        append([
          { kind: 'HEAD', text: 'INTER-BUSINESS SYNERGY POLICIES' },
          { kind: 'PRE', text: formatSynergiesReport(state) },
        ]);
        return true;
      }
      const toggleQuery =
        arg2 === 'toggle' || arg2 === 'enable' || arg2 === 'disable' || arg2 === 'activate'
          ? parts.slice(3).join(' ').trim()
          : parts.slice(2).join(' ').trim();
      if (!toggleQuery) {
        append([{ kind: 'ERR', text: 'Usage: hq synergy toggle <1..6 | policy code>' }]);
        return true;
      }
      const res = props.onToggleSynergyPolicy(toggleQuery);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    append([
      {
        kind: 'ERR',
        text: 'Usage: hq [status | establish [name] | upgrade | rename <name> | synergy [toggle <#>]]',
      },
    ]);
    return true;
  }

  ctx.maybeShowContextualGuide('ctx_corp');

  if (arg1 === 'tutorial' || arg1 === 'guide' || arg1 === 'briefing') {
    const query = parts.slice(2).join(' ').trim();
    const bizId = query ? resolveBusinessQuery(query) : undefined;
    const topicId = bizId ? getBusinessTutorialTopicId(bizId) : 'conglomerate';
    const guide = TUTORIAL_TOPICS[topicId];
    if (bizId && isBusinessOwned(state, bizId)) {
      props.onMarkBusinessTutorialSeen(bizId);
    }
    props.onRevisitGuidedTopic(topicId);
    append([
      { kind: 'HEAD', text: `DIVISION BRIEFING // ${guide.title}` },
      { kind: 'PRE', text: guide.lines.join('\n') },
      { kind: 'OK', text: `Try next -> "${guide.nextCommand}"` },
    ]);
    return true;
  }

  // "corp" commands
  if (!arg1 || arg1 === 'status' || arg1 === 'list' || arg1 === 'divisions') {
    append([
      { kind: 'HEAD', text: 'CORPORATE CONGLOMERATE OVERVIEW' },
      { kind: 'PRE', text: formatCorporateStatusReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'intel') {
    return handleIntelSubcommand(ctx, arg2, arg3);
  }

  if (arg1 === 'services' || arg1 === 'srv') {
    return handleServicesSubcommand(ctx, arg2, arg3, arg4);
  }

  if (arg1 === 'eng' || arg1 === 'engineering') {
    return handleEngSubcommand(ctx, arg2, arg3);
  }

  if (arg1 === 'mfg' || arg1 === 'manufacturing') {
    return handleMfgSubcommand(ctx, arg2, arg3, arg4, parts[5]);
  }

  if (arg1 === 'ug' || arg1 === 'underground') {
    return handleUgSubcommand(ctx, arg2, arg3);
  }

  if (arg1 === 'hq') {
    append([
      { kind: 'HEAD', text: 'CORPORATE HEADQUARTERS & GOVERNANCE' },
      { kind: 'PRE', text: formatCorporateHQReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'ledger' || arg1 === 'pnl') {
    append([
      { kind: 'HEAD', text: 'CONSOLIDATED CONGLOMERATE P&L LEDGER' },
      { kind: 'PRE', text: formatDivisionLedgerReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'synergies' || arg1 === 'synergy') {
    append([
      { kind: 'HEAD', text: 'INTER-BUSINESS SYNERGY POLICIES' },
      { kind: 'PRE', text: formatSynergiesReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'upgrade') {
    const query = parts.slice(2).join(' ').trim();
    if (!query) {
      append([{ kind: 'ERR', text: 'Usage: corp upgrade <division>' }]);
      return true;
    }
    const res = props.onUpgradeBusinessDivision(query);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'targets' || arg1 === 'market' || arg1 === 'ma') {
    append([
      { kind: 'HEAD', text: 'CORPORATE M&A & DISTRESSED ACQUISITIONS' },
      { kind: 'PRE', text: formatAcquisitionsReport(state) },
    ]);
    return true;
  }

  if (arg1 === 'inspect') {
    const query = parts.slice(2).join(' ').trim();
    if (!query) {
      append([{ kind: 'ERR', text: 'Usage: corp inspect <#|company|division>' }]);
      return true;
    }
    const res = props.onInspectAcquisitionTarget(query);
    append([{ kind: res.ok ? 'PRE' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'buy' || arg1 === 'acquire') {
    const query = parts.slice(2).join(' ').trim();
    if (!query) {
      append([{ kind: 'ERR', text: 'Usage: corp buy <#|company|division>' }]);
      return true;
    }
    const res = props.onAcquireTargetCompany(query);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'refresh') {
    const res = props.onRefreshAcquisitionMarket();
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'turnaround' || arg1 === 'stabilize') {
    const query = parts.slice(2).join(' ').trim();
    if (!query) {
      append([{ kind: 'ERR', text: 'Usage: corp turnaround <division>' }]);
      return true;
    }
    const res = props.onFundBusinessTurnaround(query);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (arg1 === 'affinity') {
    if (!state.devMode && !state.devUnlockAll) {
      append([
        {
          kind: 'TEXT',
          text: 'Industry affinity scores are hidden and inferred automatically from your actions. Reach Gen 5 to see strategic M&A matches.',
        },
      ]);
      return true;
    }
    const cong = buildDefaultConglomerate(state, state.conglomerate);
    const ranked = getRankedAffinityBusinesses(cong.affinity);
    append([
      { kind: 'HEAD', text: 'DEV // HIDDEN INDUSTRY AFFINITY PROFILE' },
      {
        kind: 'PRE',
        text: ranked
          .map(
            (r) =>
              `  ${BUSINESS_CATALOG[r.businessId].code} ${BUSINESS_CATALOG[r.businessId].name.padEnd(24)} Score: ${r.score.toFixed(1).padStart(7)} (${r.sharePct}%)`
          )
          .join('\n'),
      },
    ]);
    return true;
  }

  append([
    {
      kind: 'ERR',
      text: 'Usage: corp [status|ledger|upgrade|synergies|intel|eng|mfg|services|ug] | hq [...] | acquire [...] | ug [...]',
    },
  ]);
  return true;
};
