import { formatUndergroundReport, getShellCoins } from '../../engine/underground';
import { formatStepLabel, formatUsd } from '../../utils/format';
import { CoinSymbol, RaidApproachId } from '../../types/game';
import { padRight, TerminalCommandHandler } from './types';

export const handleOpsAndBlackMarketCommand: TerminalCommandHandler = (ctx) => {
  const {
    state,
    props,
    parts,
    cmd,
    arg1,
    arg2,
    arg3,
    arg4,
    append,
    checkSystemUnlocked,
    maybeShowContextualGuide,
  } = ctx;

  if (cmd === 'ops') {
    if (!checkSystemUnlocked('ops', 'Underground Covert Operations')) return true;
    maybeShowContextualGuide('ctx_ops');

    if (arg1 === 'siphon') {
      const enable = arg2 !== 'off';
      const ok = props.onToggleSiphon(enable);
      append([
        {
          kind: ok ? 'WARN' : 'ERR',
          text: ok
            ? `Grid power siphon ${enable ? 'ENGAGED (-40% power bill, +3 Heat/step)' : 'DISCONNECTED'}.`
            : 'Insufficient funds or action failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'botnet') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      if (!state.coins[coin]) {
        append([{ kind: 'ERR', text: `Usage: ops botnet <COIN> (available: ${Object.keys(state.coins).join('|')})` }]);
        return true;
      }
      const res = props.onRentBotnet(coin);
      append([
        {
          kind: res.ok ? 'WARN' : 'ERR',
          text: res.ok ? `Botnet hashing rented on ${coin} for ${formatUsd(res.cost ?? 0)}.` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'wash') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      if (!state.coins[coin]) {
        append([{ kind: 'ERR', text: 'Usage: ops wash <COIN>' }]);
        return true;
      }
      const res = props.onWashTrade(coin);
      append([
        {
          kind: res.ok ? 'WARN' : 'ERR',
          text: res.ok ? `Wash-traded ${coin} for ${formatUsd(res.cost ?? 0)}.` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'pump') {
      const coin = arg2.toUpperCase() as CoinSymbol;
      if (!state.coins[coin]) {
        append([{ kind: 'ERR', text: 'Usage: ops pump <COIN>' }]);
        return true;
      }
      const res = props.onPumpDump(coin);
      append([
        {
          kind: res.ok ? 'WARN' : 'ERR',
          text: res.ok ? res.summary ?? `Pump-and-dump syndicate executed on ${coin}.` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'extort') {
      const idx = parseInt(arg2, 10) - 1;
      const r = state.rivals[idx];
      if (!r) {
        append([{ kind: 'ERR', text: `Usage: ops extort <1..${state.rivals.length}>` }]);
        return true;
      }
      const res = props.onExtortRival(r.id);
      append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Extorted ${r.name}.` : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'coin') {
      // Staged shell-coin lifecycle: dev -> seed -> launch -> shill -> rug
      if (arg2 === 'dev' && arg3) {
        const ticker = arg3.toUpperCase();
        const shellName = parts.slice(4).join(' ').replace(/^"|"$/g, '') || `${ticker} Shell Protocol`;
        const res = props.onDevelopShellCoin(ticker, shellName);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Developed shell $${ticker}.` : res.reason ?? 'Failed.' }]);
        return true;
      }
      if (arg2 === 'seed' && arg3) {
        const ticker = arg3.toUpperCase();
        const liq = Number(arg4) || 1500;
        const spoof = parts.some((p) => p.toLowerCase() === 'spoof' || p.toLowerCase() === 'audit');
        const res = props.onSeedShellCoinLiquidity(ticker, liq, spoof);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Seeded $${ticker}.` : res.reason ?? 'Failed.' }]);
        return true;
      }
      if (arg2 === 'launch' && arg3) {
        const ticker = arg3.toUpperCase();
        const shellName = parts.slice(4).join(' ').replace(/^"|"$/g, '') || `${ticker} Protocol`;
        const res = props.onLaunchShellCoin(ticker, shellName);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Launched shell coin $${ticker}.` : res.reason ?? 'Failed.' }]);
        return true;
      }
      // Shorthand compatibility: ops coin <TICKER> [Name...]
      if (arg2 && arg2 !== 'dev' && arg2 !== 'seed' && arg2 !== 'launch') {
        const ticker = arg2.toUpperCase();
        const shellName = parts.slice(3).join(' ').replace(/^"|"$/g, '') || `${ticker} Protocol`;
        const res = props.onLaunchShellCoin(ticker, shellName);
        append([
          {
            kind: res.ok ? 'WARN' : 'ERR',
            text: res.ok ? res.summary ?? `Launched shell coin $${ticker}.` : res.reason ?? 'Failed.',
          },
        ]);
        return true;
      }
      append([
        {
          kind: 'ERR',
          text: 'Usage: ops coin dev <TICKER> [Name] | ops coin seed <TICKER> [usd] [spoof] | ops coin launch <TICKER> [Name]',
        },
      ]);
      return true;
    }

    if (arg1 === 'shill') {
      const shells = getShellCoins(state);
      const ticker = arg2 ? arg2.toUpperCase() : shells.find((c) => !c.rugged)?.ticker ?? '';
      if (!ticker) {
        append([{ kind: 'ERR', text: 'No active shell coin to shill. Launch one first via "ops coin dev|launch <TICKER>".' }]);
        return true;
      }
      const res = props.onShillShellCoin(ticker);
      append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Shilled $${ticker}.` : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'rug') {
      const shells = getShellCoins(state);
      const ticker = arg2 ? arg2.toUpperCase() : shells.find((c) => !c.rugged)?.ticker ?? '';
      if (!ticker) {
        append([{ kind: 'ERR', text: 'No active shell coin to exit. Launch one first via "ops coin <TICKER>".' }]);
        return true;
      }
      const res = props.onRugShellCoin(ticker);
      append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Pulled liquidity on $${ticker}.` : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'coins' || arg1 === 'shell') {
      const shells = getShellCoins(state);
      if (shells.length === 0) {
        append([{ kind: 'TEXT', text: 'No shell coins yet. Start with "ops coin dev PUMP PumpMoon" or "ops coin PUMP PumpMoon".' }]);
        return true;
      }
      const rows = shells.map(
        (c) =>
          `  $${padRight(c.ticker, 6)} ${padRight(c.name, 22)} [${c.stage ?? (c.rugged ? 'RUGGED' : 'ACTIVE')}]  Hype: ${Math.round(
            c.hype
          )}%  Pool: ${formatUsd(c.liquidityUsd)}${c.auditSpoofed ? ' [SPOOFED]' : ''}`
      );
      append([
        { kind: 'HEAD', text: 'SYNDICATE SHELL COIN LEDGER' },
        { kind: 'PRE', text: rows.join('\n') },
      ]);
      return true;
    }

    if (arg1 === 'raid') {
      if (arg2 === 'prep') {
        const idx = parseInt(arg3, 10) - 1;
        const r = state.rivals[idx];
        if (!r) {
          append([{ kind: 'ERR', text: `Usage: ops raid prep <1..${state.rivals.length}>` }]);
          return true;
        }
        const res = props.onPrepareVaultRaid(r.id);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Recon complete on ${r.name}.` : res.reason ?? 'Failed.' }]);
        return true;
      }
      if (arg2 === 'exec') {
        const map: Record<string, RaidApproachId> = {
          stealth: 'STEALTH_SIPHON',
          zeroday: 'ZERO_DAY_BREACH',
          bribe: 'INSIDER_BRIBE',
        };
        const approach = arg3 ? map[arg3] : undefined;
        const res = props.onExecutePreparedRaid(approach);
        append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? 'Executed vault raid.' : res.reason ?? 'Failed.' }]);
        return true;
      }
      const idx = parseInt(arg2, 10) - 1;
      const r = state.rivals[idx];
      if (!r) {
        append([{ kind: 'ERR', text: `Usage: ops raid <1..${state.rivals.length}> OR "ops raid prep <#>" then "ops raid exec [stealth|zeroday|bribe]"` }]);
        return true;
      }
      const res = props.onRaidRival(r.id);
      append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.ok ? res.summary ?? `Raided ${r.name}.` : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'comply') {
      const res = props.onComplyWithAudit();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.ok ? res.summary ?? 'Compliance disclosure filed.' : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'settle') {
      const res = props.onPayComplianceSettlement();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.ok ? res.summary ?? 'Settlement paid.' : res.reason ?? 'Failed.' }]);
      return true;
    }

    if (arg1 === 'audit' || arg1 === 'log') {
      append([
        { kind: 'HEAD', text: 'REGULATORY DOSSIER & UNDERGROUND LEDGER' },
        { kind: 'PRE', text: formatUndergroundReport(state) },
        {
          kind: 'TEXT',
          text: 'Recovery actions: "ops comply" (disconnect illegal rigs & reduce stage) · "ops settle" (pay fine to clear sanctions) · "ops launder" · "ops bribe".',
        },
      ]);
      return true;
    }

    if (arg1 === 'sabotage') {
      const idx = parseInt(arg2, 10) - 1;
      const r = state.rivals[idx];
      if (!r) {
        append([{ kind: 'ERR', text: `Usage: ops sabotage <1..${state.rivals.length}>` }]);
        return true;
      }
      const res = props.onSabotageRival(r.id);
      append([
        {
          kind: res.ok ? 'WARN' : 'ERR',
          text: res.ok ? `Sabotaged ${r.name} for ${formatUsd(res.cost ?? 0)}.` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'launder') {
      const res = props.onLaunderHeat();
      append([
        {
          kind: res.ok ? 'OK' : 'ERR',
          text: res.ok ? `Mixer scrub reduced Heat by -24 (${formatUsd(res.cost ?? 0)}).` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    if (arg1 === 'bribe') {
      const res = props.onBribeInspectors();
      append([
        {
          kind: res.ok ? 'OK' : 'ERR',
          text: res.ok ? `Inspectors bribed for ${formatUsd(res.cost ?? 0)} (-16 Heat, 12st shield).` : res.reason ?? 'Failed.',
        },
      ]);
      return true;
    }

    const stepRev = Math.max(40, state.rigs.reduce((s, r) => s + r.lastStepUsd, 0));
    const botnetCost = Math.max(180, Math.round(Math.max(30, stepRev) * 4.5));
    const washCost = Math.max(240, Math.round(stepRev * 5));
    const pumpCost = Math.max(620, Math.round(stepRev * 9));

    const actionsText = [
      `  ops siphon <on|off>               — Bypass power meter (${
        state.underground.powerSiphonActive ? 'ACTIVE' : 'OFF'
      })`,
      `  ops botnet <COIN>                 — Rent illegal botnet hash (${formatUsd(botnetCost)})`,
      `  ops wash <COIN>                   — Wash-trade price +12% (${formatUsd(washCost)})`,
      `  ops pump <COIN>                   — Pump & dump +28% then dump (${formatUsd(pumpCost)})`,
      `  ops coin dev <T> [Name]           — Stage 1: build shell token contract`,
      `  ops coin seed <T> [usd] [spoof]   — Stage 2: seed liquidity & optional audit spoof`,
      `  ops coin launch <T> [Name]        — Stage 3: launch shell coin on underground DEX`,
      `  ops shill [T] / ops rug [T]       — Stage 4-5: hype shell coin then pull rug`,
      `  ops raid prep <rival#>            — Stage 1: vault recon + defense/approach briefing`,
      `  ops raid exec [stealth|zeroday|bribe] — Stage 2: execute prepared vault raid`,
      `  ops extort <#> / ops sabotage <#> — Threaten or DDoS a rival firm`,
      `  ops audit | ops comply | ops settle | ops launder | ops bribe — Dossier & Heat recovery`,
    ];

    append([
      { kind: 'HEAD', text: 'UNDERGROUND COVERT OPS & REGULATORY EXPOSURE' },
      { kind: 'PRE', text: `${formatUndergroundReport(state)}\n\n  COMMANDS:\n${actionsText.join('\n')}` },
    ]);
    return true;
  }

  if (cmd === 'blackmarket' || cmd === 'bm') {
    if (!checkSystemUnlocked('blackmarket', 'Black Market Surplus Exchange')) return true;
    maybeShowContextualGuide('ctx_blackmarket');

    if (arg1 === 'buy') {
      const idx = parseInt(arg2, 10) - 1;
      const listing = state.underground.blackMarketListings[idx];
      if (!listing) {
        append([{ kind: 'ERR', text: 'Invalid Black Market listing number.' }]);
        return true;
      }
      const rigIdx = arg3 ? parseInt(arg3, 10) - 1 : 0;
      const res = props.onBuyBlackMarket(listing.id, isNaN(rigIdx) ? 0 : rigIdx);
      append([{ kind: res.ok ? 'WARN' : 'ERR', text: res.summary }]);
      return true;
    }

    const listings = state.underground.blackMarketListings.map((l, idx) => {
      const kind = l.kind === 'SMUGGLED_RIG' ? '[RIG]' : '[BIOS/MOD]';
      return `  ${idx + 1}. ${padRight(`${kind} ${l.title}`, 40)} ${padRight(formatUsd(l.costUsd), 10)}  +${l.heatGain} Heat  ${l.description}`;
    });
    append([
      {
        kind: 'HEAD',
        text: `BLACK MARKET EXCHANGE (Refreshes ${formatStepLabel(state.underground.blackMarketRefreshStep)} · Heat: ${Math.round(
          state.regulatoryScrutiny
        )}/100)`,
      },
      { kind: 'PRE', text: listings.length > 0 ? listings.join('\n') : '  (No drops currently available)' },
      { kind: 'TEXT', text: 'Run "blackmarket buy <#> [rig#]" to purchase stolen rigs or flashed BIOS mods.' },
    ]);
    return true;
  }

  return false;
};
