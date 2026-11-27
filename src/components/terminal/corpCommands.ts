import {
  formatAcquisitionsReport,
  formatCorporateStatusReport,
} from '../../engine/acquisitions';
import { BUSINESS_CATALOG, getRankedAffinityBusinesses } from '../../engine/affinity';
import { formatDivisionLedgerReport } from '../../engine/businesses';
import { buildDefaultConglomerate } from '../../engine/conglomerate';
import {
  formatCorporateHQReport,
  formatSynergiesReport,
} from '../../engine/corporate';
import { TerminalCommandHandler } from './types';

export const handleCorpCommand: TerminalCommandHandler = (ctx) => {
  const { state, props, parts, cmd, arg1, arg2, append } = ctx;

  if (cmd !== 'corp' && cmd !== 'acquire' && cmd !== 'acquisitions' && cmd !== 'hq') {
    return false;
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

  // "corp" commands
  if (!arg1 || arg1 === 'status' || arg1 === 'list' || arg1 === 'divisions') {
    append([
      { kind: 'HEAD', text: 'CORPORATE CONGLOMERATE OVERVIEW' },
      { kind: 'PRE', text: formatCorporateStatusReport(state) },
    ]);
    return true;
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
      text: 'Usage: corp [status | ledger | upgrade <biz> | synergies | targets | inspect <#> | buy <#> | turnaround <biz>] | hq [establish|upgrade|rename|synergy]',
    },
  ]);
  return true;
};
