import {
  CHASSIS_PARTS,
  COMPUTE_PARTS,
  COOLING_PARTS,
  FIRMWARE_PROFILE_SPECS,
  GPU_PARTS,
  ILLICIT_MOD_SPECS,
  OS_PARTS,
  POOL_MODE_SPECS,
  PSU_PARTS,
  RESEARCH_NODES,
  STORAGE_PARTS,
} from '../../data/catalog';
import { checkRigCoinCompatibility } from '../../engine/coins';
import { benchmarkRig, RIG_QUALIFICATION_GOALS } from '../../engine/optimization';
import {
  calculateRigResaleValue,
  computeRigTelemetry,
  computeStepCoinOutput,
  ensureRigComponentHealth,
  formatAsciiFloorPlan,
  formatSingleRoomView,
  getAutoSellMultiplier,
  getComponentRepairCost,
  getEffectiveFacilityMaxRigs,
  getEffectivePartBundle,
  getFacility,
  getFacilityRooms,
  getRigRepasteCost,
  getRigRepairCost,
  getSysEngineerBonus,
} from '../../engine/simulation';
import { getRigGeneration } from '../../engine/usedMarket';
import {
  CoinSymbol,
  FirmwareProfile,
  PoolMode,
  RepairComponentSlot,
  RigQualificationGoal,
} from '../../types/game';
import {
  formatCoinAmount,
  formatHashrate,
  formatUsd,
  renderAsciiBar,
} from '../../utils/format';
import { padLeft, padRight, TerminalCommandHandler } from './types';

export const handleRigCommand: TerminalCommandHandler = (ctx) => {
  const {
    state,
    props,
    parts,
    cmd,
    arg1,
    arg2,
    arg3,
    append,
    checkSystemUnlocked,
    maybeShowContextualGuide,
    openTinkerWizard,
  } = ctx;

  const facility = getFacility(state.facilityId);
  const isPartUnlocked = (researchRequired?: string): boolean => {
    if (state.devUnlockAll || !researchRequired) return true;
    return state.unlockedResearch.includes(researchRequired);
  };
  const getUnlockedChassis = () => CHASSIS_PARTS.filter((c) => isPartUnlocked(c.researchRequired));
  const getUnlockedGpus = () => GPU_PARTS.filter((g) => isPartUnlocked(g.researchRequired));
  const getUnlockedStorage = () => STORAGE_PARTS.filter((s) => isPartUnlocked(s.researchRequired));
  const getUnlockedPsus = () => PSU_PARTS.filter((p) => isPartUnlocked(p.researchRequired));
  const getUnlockedCooling = () => COOLING_PARTS.filter((c) => isPartUnlocked(c.researchRequired));
  const getUnlockedOs = () => OS_PARTS.filter((o) => isPartUnlocked(o.researchRequired));
  const getUnlockedComputeFor = (isAsicOnly: boolean, isHybrid = false) =>
    COMPUTE_PARTS.filter(
      (c) => (isHybrid ? true : isAsicOnly ? c.kind === 'ASIC' : c.kind !== 'ASIC') && isPartUnlocked(c.researchRequired)
    );

  if (cmd === 'benchmark' || cmd === 'commission') {
    const rigIndex = Number(arg1) - 1;
    const rig = state.rigs[rigIndex];
    const validGoal = Object.hasOwn(RIG_QUALIFICATION_GOALS, arg2);
    const referenceArg = cmd === 'benchmark' ? arg2 : arg3;
    const reference = referenceArg === 'stock' ? 'stock' : 'balanced';
    if (!rig || (referenceArg && referenceArg !== 'stock') || (cmd === 'commission' && !validGoal)) {
      append([{ kind: 'TEXT', text: 'Use "benchmark <rig#> [stock]" to compare, then "commission <rig#> <efficiency|output|quiet> [stock]" to record a qualification.' }]);
      return true;
    }
    if (cmd === 'benchmark') {
      maybeShowContextualGuide('ctx_benchmark');
      append([
        { kind: 'HEAD', text: `COMMISSIONING BENCH · ${rig.name}` },
        { kind: 'PRE', text: benchmarkRig(state, rig, reference).report },
        { kind: 'TEXT', text: 'Tune with "rig <#> profile <eco|balanced|turbo>", "overclock <#> <80..150>", or "tinker <#>". Then use "commission <rig#> <efficiency|output|quiet> [stock]".' },
      ]);
    } else {
      const result = props.onQualifyRig(rigIndex, arg2 as RigQualificationGoal, reference);
      append([{ kind: result.ok ? 'OK' : 'WARN', text: result.summary }]);
    }
    return true;
  }

  if (cmd === 'rigs' || cmd === 'ls') {
    const maxRigs = getEffectiveFacilityMaxRigs(state);
    if (state.rigs.length === 0) {
      append([
        {
          kind: 'TEXT',
          text: `No active rigs deployed (0/${maxRigs} slots, ${(state.backupRigs ?? []).length} in backup vault). Run "build rig" or "usedmarket".`,
        },
      ]);
      return true;
    }
    const header = `  #  ${padRight('RIG NAME', 21)} ${padRight('STATUS', 11)} ${padRight(
      'COIN/POOL',
      10
    )} ${padRight('GEN/COND', 10)} ${padLeft('HLTH', 5)} ${padLeft('TEMP', 5)} ${padLeft(
      'STEP USD',
      11
    )}`;
    const rows = state.rigs.map((rig, i) => {
      const hasFab = Boolean(
        rig.customAsicSpec ||
          (rig.customParts &&
            (rig.customParts.chassis ||
              rig.customParts.compute ||
              rig.customParts.storage ||
              rig.customParts.psu ||
              rig.customParts.cooling ||
              rig.customParts.os ||
              (rig.customParts.gpus ?? []).some(Boolean)))
      );
      const modMark = (rig.illicitMod ? '*' : '') + (hasFab ? '[F]' : '');
      const gen = getRigGeneration(rig);
      const condShort = (rig.conditionTier ?? 'NEW').slice(0, 4);
      const coinLabel =
        rig.payoutMode === 'HOLD' ? `${rig.targetCoin}/HLD` : `${rig.targetCoin}/${rig.poolMode}`;
      return `  ${padRight(String(i + 1), 2)} ${padRight(rig.name + modMark, 21)} ${padRight(
        rig.status,
        11
      )} ${padRight(coinLabel, 10)} ${padRight(`G${gen}/${condShort}`, 10)} ${padLeft(
        `${Math.round(rig.healthPct)}%`,
        5
      )} ${padLeft(`${rig.temperatureC}C`, 5)} ${padLeft(
        rig.payoutMode === 'HOLD'
          ? 'VAULTED'
          : formatUsd(rig.lastStepUsd, rig.lastStepUsd >= 10_000),
        11
      )}`;
    });
    const avgHealth =
      state.rigs.reduce((s, r) => s + r.healthPct, 0) / Math.max(1, state.rigs.length);
    append([
      {
        kind: 'HEAD',
        text: `FLEET ROSTER (${state.rigs.length}/${maxRigs}) · Avg Health: ${avgHealth.toFixed(
          0
        )}% · Vault: ${(state.backupRigs ?? []).length}`,
      },
      { kind: 'PRE', text: [header, '-'.repeat(header.length), ...rows].join('\n') },
      {
        kind: 'TEXT',
        text: 'Commands: "inspect <#>", "repair all", "retire <#>", "backup", "sell <#>", "tinker <#>", "overclock". (* = illicit mod, [F] = custom fab part)',
      },
    ]);
    if (state.tutorialStep === 1) {
      props.onSetTutorialStep(2);
    }
    return true;
  }

  if (cmd === 'inspect') {
    const idx = parseInt(arg1, 10) - 1;
    const rig = state.rigs[idx];
    if (!rig) {
      append([{ kind: 'ERR', text: 'Usage: inspect <rig#>' }]);
      return true;
    }
    props.onMarkTutorialSeen('inspected_rig');
    if (state.tutorialStep === 1) props.onSetTutorialStep(2);
    maybeShowContextualGuide('ctx_inspect');
    const sysBonus = getSysEngineerBonus(state);
    const enabledCount = state.rigs.filter((r) => r.enabled).length;
    const t = computeRigTelemetry(
      rig,
      facility,
      state.unlockedResearch,
      sysBonus,
      state.coolingUnits ?? [],
      enabledCount,
      state.facilityUpgrades
    );
    const bundle = getEffectivePartBundle(rig);
    const { chassis: ch, compute: comp, gpus: gpuBundle, storage: stor, psu, cooling: cool, os } =
      bundle;
    const compHealth = ensureRigComponentHealth(rig);
    const repairCost = getRigRepairCost(rig, state);
    const repasteCost = getRigRepasteCost(rig);
    const resaleVal = calculateRigResaleValue(rig, state);
    const gen = getRigGeneration(rig);
    const modSpec = rig.illicitMod ? ILLICIT_MOD_SPECS[rig.illicitMod] : null;
    const targetCoinState = state.coins[rig.targetCoin];
    const compat = targetCoinState ? checkRigCoinCompatibility(rig, targetCoinState, bundle) : null;
    const serials = rig.customPartSerials;

    const formatCompRow = (
      slotTag: string,
      label: string,
      hp: number,
      costUsd: number,
      serial?: string | null
    ): string => {
      const rounded = Math.round(hp);
      const bar = renderAsciiBar(rounded, 10);
      const warn = rounded <= 20 ? ' CRIT!' : rounded <= 45 ? ' WORN ' : '      ';
      const price = costUsd > 0 ? formatUsd(costUsd) : 'OK';
      const snTag = serial ? ` [S/N ${serial}]` : '';
      return `    ${padRight(slotTag, 9)} ${padRight(label, 25)} ${bar} ${padLeft(
        `${rounded}%`,
        4
      )}${warn} Repair: ${padLeft(price, 7)}${snTag}`;
    };

    const componentLines: string[] = [
      formatCompRow(
        'chassis',
        ch.name,
        compHealth.chassis,
        getComponentRepairCost(rig, 'chassis', undefined, state),
        serials?.chassis
      ) + (compHealth.chassis < 65 ? '  (Rattle +dBA)' : ''),
      formatCompRow(
        'compute',
        comp.name,
        compHealth.compute,
        getComponentRepairCost(rig, 'compute', undefined, state),
        serials?.compute ?? rig.customAsicSpec?.serialNumber
      ),
    ];
    if (rig.gpuIds.length === 0) {
      componentLines.push(`    ${padRight('gpu', 9)} (No discrete GPUs installed)`);
    } else {
      rig.gpuIds.forEach((gid, gIdx) => {
        const gpuPart = gpuBundle[gIdx] ?? GPU_PARTS.find((g) => g.id === gid);
        const tag = rig.gpuIds.length === 1 ? 'gpu' : `gpu ${gIdx + 1}`;
        componentLines.push(
          formatCompRow(
            tag,
            gpuPart?.name ?? gid,
            compHealth.gpus[gIdx] ?? rig.healthPct,
            getComponentRepairCost(rig, 'gpu', gIdx, state),
            serials?.gpus?.[gIdx]
          )
        );
      });
    }
    componentLines.push(
      formatCompRow(
        'storage',
        stor.name,
        compHealth.storage,
        getComponentRepairCost(rig, 'storage', undefined, state),
        serials?.storage
      ) + (compHealth.storage < 65 ? '  (-Storage Eff)' : ''),
      formatCompRow(
        'psu',
        psu.name,
        compHealth.psu,
        getComponentRepairCost(rig, 'psu', undefined, state),
        serials?.psu
      ) + (compHealth.psu < 65 ? '  (+Watts Ripple)' : ''),
      formatCompRow(
        'cooling',
        cool.name,
        compHealth.cooling,
        getComponentRepairCost(rig, 'cooling', undefined, state),
        serials?.cooling
      ) + (compHealth.cooling < 75 ? '  (-Cooling Power)' : '')
    );

    const compatLines: string[] = compat
      ? [
          '',
          `  ARCHITECTURE & COIN COMPATIBILITY (${rig.targetCoin} · Eff ${Math.round(
            compat.efficiencyMult * 100
          )}%):`,
          ...(compat.warnings.length > 0
            ? compat.warnings.map((w) => `    [!] ${w}`)
            : [`    [OK] All thermal/Cryo/Optical/VRAM checks passed for ${rig.targetCoin}.`]),
          ...compat.notes.map((n) => `    [+] ${n}`),
        ]
      : [];

    append([
      { kind: 'HEAD', text: `RIG #${idx + 1} HARDWARE SHEET: ${rig.name}` },
      {
        kind: 'PRE',
        text: [
          `  Status:   ${rig.status} (${rig.enabled ? 'POWER ON' : 'PAUSED'})   Avg Health: ${Math.round(
            rig.healthPct
          )}% (Full Repair: ${formatUsd(repairCost)})`,
          `  Lifecycle: Gen ${gen} · Tier: ${rig.conditionTier ?? 'NEW'} · Age: ${rig.ageSteps ?? 0}st · Failures: ${
            rig.failureCount ?? 0
          } · Resale: ${formatUsd(resaleVal)}`,
          `  Tuning:   Pool ${rig.poolMode} (${POOL_MODE_SPECS[rig.poolMode].feePct}% fee)   Firmware: ${rig.firmwareProfile}   OC: ${rig.overclockPct}%   Payout: ${rig.payoutMode ?? 'AUTOSELL'}`,
          `  Thermal:  ${rig.temperatureC}°C (Eq: ${t.equilibriumTempC}°C)   Paste: ${
            rig.pasteStepsRemaining
          }st left (Repaste: ${formatUsd(repasteCost)})`,
          `  Output:   ${rig.targetCoin} (${t.targetAlgo}) ${formatHashrate(
            t.effectiveHashrate,
            t.targetAlgo
          )}   Wall: ${t.wallWatts}W   Noise: ${t.noiseDba}dBA`,
          `  Compute:  ${
            rig.customAsicSpec
              ? `Custom Fab ${rig.customAsicSpec.processNode} "${rig.customAsicSpec.name}" (${rig.customAsicSpec.algo})${
                  rig.customAsicSpec.serialNumber ? ` [S/N ${rig.customAsicSpec.serialNumber}]` : ''
                }`
              : comp.name
          }`,
          `  Payout:   ${formatCoinAmount(rig.lastStepCoins)} ${rig.targetCoin}/st -> ${
            rig.payoutMode === 'HOLD' ? 'Vaulted to Wallet' : `${formatUsd(rig.lastStepUsd)}/st`
          }   Solo Wins: ${rig.soloBlocksWon}   Lifetime: ${formatUsd(rig.totalEarnedUsd)}`,
          `  Illicit:  ${modSpec ? `${modSpec.name} (${modSpec.summary})` : 'None (Stock legal ROM)'}`,
          `  OS Kernel: ${os.name}${serials?.os ? ` [S/N ${serials.os}]` : ''}`,
          ``,
          `  COMPONENT HEALTH (Rig health = average of installed components):`,
          ...componentLines,
          ...compatLines,
        ].join('\n'),
      },
      {
        kind: 'TEXT',
        text:
          rig.gpuIds.length > 1
            ? `Repair tips: "repair ${idx + 1}" fixes whole rig, "repair ${idx + 1} gpu" fixes all GPUs, or "repair ${
                idx + 1
              } gpu 1" / "repair ${idx + 1} psu" fixes a single part.`
            : `Repair tips: "repair ${idx + 1}" fixes whole rig, or "repair ${
                idx + 1
              } <chassis|compute|gpu|storage|psu|cooling>" fixes 1 part.`,
      },
    ]);
    return true;
  }

  if (cmd === 'repair' || cmd === 'repaste') {
    maybeShowContextualGuide(cmd === 'repair' ? 'ctx_repair' : 'ctx_repaste');
    if (cmd === 'repair' && arg1 && arg1 !== 'all' && arg2 && arg2 !== 'all') {
      const rigIdx = parseInt(arg1, 10) - 1;
      if (isNaN(rigIdx) || !state.rigs[rigIdx]) {
        append([
          {
            kind: 'ERR',
            text: 'Usage: repair [<rig#>|all] OR repair <rig#> <chassis|compute|gpu|storage|psu|cooling> [gpuSlot#]',
          },
        ]);
        return true;
      }

      const rawPart = arg2.toLowerCase();
      let slot: RepairComponentSlot | null = null;
      let gpuSlotIdx: number | undefined = undefined;

      if (['chassis', 'case', 'rack', 'frame'].includes(rawPart)) {
        slot = 'chassis';
      } else if (['compute', 'cpu', 'asic', 'fpga', 'blade', 'proc', 'processor'].includes(rawPart)) {
        slot = 'compute';
      } else if (['storage', 'ram', 'mem', 'memory', 'ssd', 'hdd', 'nvme', 'disk'].includes(rawPart)) {
        slot = 'storage';
      } else if (['psu', 'power', 'supply'].includes(rawPart)) {
        slot = 'psu';
      } else if (['cooling', 'cool', 'fan', 'fans', 'heatsink', 'aio'].includes(rawPart)) {
        slot = 'cooling';
      } else if (['gpu', 'gpus', 'card', 'cards', 'video'].includes(rawPart)) {
        slot = 'gpu';
        if (arg3) {
          const parsedSlot = parseInt(arg3.replace(/^#/, ''), 10);
          if (isNaN(parsedSlot) || parsedSlot < 1) {
            append([{ kind: 'ERR', text: `Invalid GPU slot "${arg3}". Example: repair ${rigIdx + 1} gpu 1` }]);
            return true;
          }
          gpuSlotIdx = parsedSlot - 1;
        }
      } else {
        const gpuInlineMatch = rawPart.match(/^gpu#?(\d+)$/);
        if (gpuInlineMatch) {
          slot = 'gpu';
          gpuSlotIdx = parseInt(gpuInlineMatch[1], 10) - 1;
        }
      }

      if (!slot) {
        append([
          {
            kind: 'ERR',
            text: `Unknown component "${arg2}". Valid parts: chassis, compute, gpu [slot#], storage, psu, cooling.`,
          },
        ]);
        return true;
      }

      const res = props.onRepairComponent(rigIdx, slot, gpuSlotIdx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }

    const targetArg = !arg1 || arg1 === 'all' ? 'ALL' : parseInt(arg1, 10) - 1;
    if (targetArg !== 'ALL' && (isNaN(targetArg) || !state.rigs[targetArg])) {
      append([
        {
          kind: 'ERR',
          text:
            cmd === 'repair'
              ? 'Usage: repair [<rig#>|all] OR repair <rig#> <chassis|compute|gpu|storage|psu|cooling> [gpuSlot#]'
              : 'Usage: repaste [<rig#>|all]',
        },
      ]);
      return true;
    }
    if (cmd === 'repair') {
      const res = props.onRepairRigs(targetArg);
      append([
        res.ok
          ? { kind: 'OK', text: `Repaired ${res.count} rig(s) to 100% health for ${formatUsd(res.cost)}.` }
          : {
              kind: 'ERR',
              text: res.cost > 0 ? `Insufficient cash (need ${formatUsd(res.cost)}).` : 'Rigs already at 100% health.',
            },
      ]);
    } else {
      const res = props.onRepasteRigs(targetArg);
      append([
        res.ok
          ? {
              kind: 'OK',
              text: `Repasted ${res.count} rig(s) (-6°C thermal relief for 16 steps) for ${formatUsd(res.cost)}.`,
            }
          : { kind: 'ERR', text: `Insufficient cash (need ${formatUsd(res.cost)}).` },
      ]);
    }
    return true;
  }

  if (cmd === 'retire') {
    const idx = parseInt(arg1, 10) - 1;
    if (isNaN(idx) || !state.rigs[idx]) {
      append([{ kind: 'ERR', text: 'Usage: retire <rig#>' }]);
      return true;
    }
    const res = props.onRetireRig(idx);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (cmd === 'backup') {
    const vault = state.backupRigs ?? [];
    if (arg1 === 'deploy') {
      const idx = parseInt(arg2, 10) - 1;
      const res = props.onDeployBackupRig(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg1 === 'sell') {
      const idx = parseInt(arg2, 10) - 1;
      const res = props.onSellBackupRig(idx);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    const rows =
      vault.length === 0
        ? '  (Backup Hardware Vault is empty. Use "retire <rig#>" to store spare rigs.)'
        : vault
            .map((r, i) => {
              const resale = calculateRigResaleValue(r, state);
              return `  ${i + 1}. ${padRight(r.name, 24)} ${padRight(r.targetCoin, 5)} ${Math.round(
                r.healthPct
              )}% hlth · Age ${r.ageSteps ?? 0}st · Resale ${formatUsd(resale)}`;
            })
            .join('\n');
    append([
      { kind: 'HEAD', text: `BACKUP HARDWARE VAULT (${vault.length} stored)` },
      { kind: 'PRE', text: rows },
      { kind: 'TEXT', text: 'Commands: "backup deploy <#>", "backup sell <#>", or "retire <active rig#>".' },
    ]);
    return true;
  }

  if (cmd === 'rig') {
    const isAll = arg1 === 'all';
    const idx = parseInt(arg1, 10) - 1;
    const target = isAll ? state.rigs[0] : state.rigs[idx];
    if (!target) {
      append([{ kind: 'ERR', text: `Rig #${arg1 || '?'} not found. Run "rigs".` }]);
      return true;
    }
    if (arg2 === 'pool') {
      const mode = arg3.toUpperCase() as PoolMode;
      if (!POOL_MODE_SPECS[mode]) {
        append([{ kind: 'ERR', text: 'Usage: rig <#|all> pool <pps|pplns|solo>' }]);
        return true;
      }
      props.onSetRigPool(isAll ? 'ALL' : idx, mode);
      append([
        {
          kind: 'OK',
          text: `${isAll ? 'All rigs' : target.name} switched to ${mode} (${POOL_MODE_SPECS[mode].summary})`,
        },
      ]);
      return true;
    }
    if (arg2 === 'profile') {
      const prof = arg3.toUpperCase() as FirmwareProfile;
      if (!FIRMWARE_PROFILE_SPECS[prof]) {
        append([{ kind: 'ERR', text: 'Usage: rig <#|all> profile <eco|balanced|turbo>' }]);
        return true;
      }
      props.onSetRigProfile(isAll ? 'ALL' : idx, prof);
      append([
        {
          kind: 'OK',
          text: `${isAll ? 'All rigs' : target.name} firmware set to ${prof} (${FIRMWARE_PROFILE_SPECS[prof].summary})`,
        },
      ]);
      return true;
    }
    if (arg2 === 'room') {
      const roomNum = parseInt(arg3, 10);
      if (isNaN(roomNum)) {
        append([{ kind: 'ERR', text: 'Usage: rig <#|all> room <room#>. Run "rooms" to see the ASCII floor-plan.' }]);
        return true;
      }
      const res = props.onMoveRigToRoom(isAll ? 'ALL' : idx, roomNum);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg2 === 'payout') {
      const mode =
        arg3 === 'hold' || arg3 === 'vault' || arg3 === 'wallet'
          ? 'HOLD'
          : arg3 === 'sell' || arg3 === 'autosell' || arg3 === 'cash'
          ? 'AUTOSELL'
          : null;
      if (!mode) {
        append([{ kind: 'ERR', text: 'Usage: rig <#|all> payout <hold|sell>' }]);
        return true;
      }
      if (mode === 'HOLD' && !checkSystemUnlocked('exchange', 'Holding mining payouts')) return true;
      const res = props.onSetRigPayout(isAll ? 'ALL' : idx, mode);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (arg2 === 'clone' || arg2 === 'copy') {
      if (isAll) {
        append([{ kind: 'ERR', text: 'Specify a single rig to clone: rig <rig#> clone [qty]' }]);
        return true;
      }
      const qty = arg3 ? parseInt(arg3, 10) : 1;
      if (isNaN(qty) || qty < 1) {
        append([{ kind: 'ERR', text: 'Usage: rig <rig#> clone [1..12]' }]);
        return true;
      }
      const res = props.onCloneRig(idx, qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    if (isAll) {
      append([
        {
          kind: 'ERR',
          text: 'Use "rig all pool <...>", "rig all profile <...>", "rig all payout <hold|sell>", or "rig all room <#>".',
        },
      ]);
      return true;
    }
    if (arg2 === 'on' || arg2 === 'off') {
      const want = arg2 === 'on';
      if (target.enabled !== want) props.onToggleRig(target.id);
      append([{ kind: 'OK', text: `${target.name} turned ${want ? 'ON' : 'OFF'}.` }]);
      return true;
    }
    if (arg2 === 'oc' || arg2 === 'overclock') {
      const parsed = parseInt(arg3, 10);
      if (isNaN(parsed)) {
        append([{ kind: 'ERR', text: 'Usage: rig <#> oc <80..150>' }]);
        return true;
      }
      const val = Math.max(80, Math.min(150, parsed));
      props.onChangeRigOverclock(target.id, val);
      append([{ kind: 'OK', text: `${target.name} overclock set to ${val}% (watch temps & wattage).` }]);
      return true;
    }
    if (arg2 === 'coin') {
      const sym = arg3.toUpperCase() as CoinSymbol;
      const c = state.coins[sym];
      if (!c) {
        append([{ kind: 'ERR', text: `Unknown coin "${arg3}".` }]);
        return true;
      }
      if (!c.unlocked) {
        append([
          {
            kind: 'ERR',
            text: `${sym} is locked. Run "unlock ${sym}" (${formatUsd(c.unlockCostUsd)}) first.`,
          },
        ]);
        return true;
      }
      props.onChangeRigCoin(target.id, sym);
      append([{ kind: 'OK', text: `${target.name} assigned to mine ${sym}.` }]);
      return true;
    }
    append([
      {
        kind: 'ERR',
        text: 'Usage: rig <#|all> <on|off|oc N|coin SYM|pool pps/pplns/solo|profile eco/balanced/turbo|payout hold/sell|room #|clone [qty]>',
      },
    ]);
    return true;
  }

  if (cmd === 'move') {
    const rigIdx = parseInt(arg1, 10) - 1;
    const roomNum = parseInt(arg2 === 'room' ? arg3 : arg2, 10);
    if (isNaN(rigIdx) || isNaN(roomNum)) {
      append([{ kind: 'ERR', text: 'Usage: move <rig#> [room] <room#>' }]);
      return true;
    }
    const res = props.onMoveRigToRoom(rigIdx, roomNum);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  if (cmd === 'rooms' || cmd === 'floorplan' || cmd === 'room') {
    if (arg1 === 'expand') {
      const res = props.onExpandFacilityRooms();
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }
    const maybeRoomNum = parseInt(arg1, 10);
    if (!isNaN(maybeRoomNum)) {
      const view = formatSingleRoomView(state, maybeRoomNum);
      if (!view) {
        const totalRooms = getFacilityRooms(state).length;
        append([{ kind: 'ERR', text: `Room #${maybeRoomNum} not found (1..${totalRooms}).` }]);
        return true;
      }
      append([
        { kind: 'HEAD', text: `ROOM INSPECTOR — ROOM #${maybeRoomNum}` },
        { kind: 'PRE', text: view },
        {
          kind: 'TEXT',
          text: `Commands: "rooms" (full floor-plan), "rig <#> room ${maybeRoomNum}", "cool room <cool#> ${maybeRoomNum}", or "room expand".`,
        },
      ]);
      return true;
    }
    append([
      { kind: 'HEAD', text: 'FACILITY ROOMS & ASCII FLOOR-PLAN SELECTOR' },
      { kind: 'PRE', text: formatAsciiFloorPlan(state) },
      {
        kind: 'TEXT',
        text: 'Select a room via "room <#>", move rigs via "rig <#> room <#>", place coolers via "cool room <cool#> <#>", or build wings via "room expand".',
      },
    ]);
    return true;
  }

  if (cmd === 'rename') {
    const idx = parseInt(arg1, 10) - 1;
    const target = state.rigs[idx];
    const newName = parts.slice(2).join(' ').trim();
    if (!target || !newName) {
      append([{ kind: 'ERR', text: 'Usage: rename <rig#> <new name>' }]);
      return true;
    }
    props.onRenameRig(target.id, newName);
    append([{ kind: 'OK', text: `Renamed rig #${idx + 1} to "${newName}".` }]);
    return true;
  }

  if (cmd === 'salvage' || cmd === 'sell') {
    const idx = parseInt(arg1, 10) - 1;
    const target = state.rigs[idx];
    if (!target) {
      append([{ kind: 'ERR', text: `Usage: ${cmd} <rig#>` }]);
      return true;
    }
    const refund = props.onSalvageRig(target.id);
    append([
      {
        kind: 'OK',
        text: `Sold/salvaged ${target.name} for ${formatUsd(refund)} (condition & market adjusted).`,
      },
    ]);
    return true;
  }

  if (cmd === 'overclock' || cmd === 'oc') {
    if (state.rigs.length === 0) {
      append([{ kind: 'ERR', text: 'No rigs deployed. Run "build rig" first.' }]);
      return true;
    }
    const sysBonus = getSysEngineerBonus(state);
    const enabledCount = state.rigs.filter((r) => r.enabled).length;
    const autoSellMult = getAutoSellMultiplier(state);

    if (!arg1) {
      const rows = state.rigs.map((rig, i) => {
        const t = computeRigTelemetry(
          rig,
          facility,
          state.unlockedResearch,
          sysBonus,
          state.coolingUnits ?? [],
          enabledCount
        );
        const coin = state.coins[rig.targetCoin];
        const est = computeStepCoinOutput(
          t.effectiveHashrate,
          coin,
          1,
          autoSellMult,
          rig.poolMode,
          true
        );
        return `  [R${i + 1}] ${padRight(rig.name, 22)} OC:${padLeft(
          `${rig.overclockPct}%`,
          5
        )}  ${padRight(formatHashrate(t.effectiveHashrate, t.targetAlgo), 11)}  ${padLeft(
          `${t.wallWatts}W`,
          6
        )}  Eq:${padLeft(`${t.equilibriumTempC}°C`, 4)}  Est:${formatUsd(est.autoSoldUsd)}/st`;
      });
      append([
        { kind: 'HEAD', text: 'RIG OVERCLOCK TELEMETRY (80%..150%)' },
        { kind: 'PRE', text: rows.join('\n') },
        {
          kind: 'TEXT',
          text: 'Usage: "overclock <#|all> <80..150>" or "overclock <80..150>" (applies to all rigs). Higher OC boosts coin yield at steeper heat, power & silicon wear.',
        },
      ]);
      return true;
    }

    let targetArg: number | 'ALL' = 'ALL';
    let rawPct = '';
    if (!arg2) {
      rawPct = arg1;
      targetArg = 'ALL';
    } else if (arg1 === 'all') {
      targetArg = 'ALL';
      rawPct = arg2;
    } else {
      const idx = parseInt(arg1, 10) - 1;
      if (isNaN(idx) || !state.rigs[idx]) {
        append([{ kind: 'ERR', text: `Rig #${arg1} not found. Run "rigs" to see rig numbers.` }]);
        return true;
      }
      targetArg = idx;
      rawPct = arg2;
    }

    const parsedPct = parseInt(rawPct, 10);
    if (isNaN(parsedPct)) {
      append([{ kind: 'ERR', text: 'Usage: overclock [<#|all>] <80..150>' }]);
      return true;
    }
    const nextOc = Math.max(80, Math.min(150, parsedPct));
    props.onOverclockRigs(targetArg, nextOc);

    const affected = state.rigs
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => targetArg === 'ALL' || i === targetArg);

    const deltaLines: string[] = [];
    let warnThermal = false;
    let warnPower = false;

    for (const { r, i } of affected) {
      const coin = state.coins[r.targetCoin];
      const beforeT = computeRigTelemetry(
        r,
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount
      );
      const afterT = computeRigTelemetry(
        { ...r, overclockPct: nextOc },
        facility,
        state.unlockedResearch,
        sysBonus,
        state.coolingUnits ?? [],
        enabledCount
      );
      const beforeEst = computeStepCoinOutput(
        beforeT.effectiveHashrate,
        coin,
        1,
        autoSellMult,
        r.poolMode,
        true
      );
      const afterEst = computeStepCoinOutput(
        afterT.effectiveHashrate,
        coin,
        1,
        autoSellMult,
        r.poolMode,
        true
      );
      if (afterT.isUnderpowered) warnPower = true;
      if (afterT.equilibriumTempC >= 82) warnThermal = true;
      deltaLines.push(
        `  [R${i + 1}] ${padRight(r.name, 20)} ${r.overclockPct}%->${nextOc}% | Hash: ${formatHashrate(
          afterT.effectiveHashrate,
          afterT.targetAlgo
        )} | Est: ${formatUsd(beforeEst.autoSoldUsd)}->${formatUsd(
          afterEst.autoSoldUsd
        )}/st | Wall: ${beforeT.wallWatts}W->${afterT.wallWatts}W | Eq: ${
          beforeT.equilibriumTempC
        }°C->${afterT.equilibriumTempC}°C${afterT.isUnderpowered ? ' [PSU OVERLOAD!]' : ''}`
      );
    }

    append([
      {
        kind: warnPower || warnThermal ? 'WARN' : 'OK',
        text: `Overclock tuned to ${nextOc}% (${
          targetArg === 'ALL' ? `all ${affected.length} rig(s)` : affected[0]?.r.name
        }):`,
      },
      { kind: 'PRE', text: deltaLines.join('\n') },
      ...(warnPower
        ? [
            {
              kind: 'ERR' as const,
              text: 'WARNING: PSU wattage exceeded! Swap to a higher-watt PSU with "tinker" or lower overclock.',
            },
          ]
        : []),
      ...(warnThermal
        ? [
            {
              kind: 'WARN' as const,
              text: 'Thermal alert: Equilibrium temp >= 82°C. Expect faster wear or throttling without better cooling.',
            },
          ]
        : []),
    ]);
    return true;
  }

  if (cmd === 'tinker') {
    if (state.rigs.length === 0) {
      append([{ kind: 'ERR', text: 'No rigs deployed. Run "build rig" first.' }]);
      return true;
    }

    const slotMap: Record<
      string,
      'chassis' | 'compute' | 'gpu' | 'storage' | 'psu' | 'cooling' | 'os'
    > = {
      chassis: 'chassis',
      case: 'chassis',
      compute: 'compute',
      cpu: 'compute',
      asic: 'compute',
      fpga: 'compute',
      gpu: 'gpu',
      gpus: 'gpu',
      storage: 'storage',
      ram: 'storage',
      psu: 'psu',
      power: 'psu',
      cooling: 'cooling',
      cool: 'cooling',
      os: 'os',
    };

    if (!arg1) {
      if (state.rigs.length === 1) {
        openTinkerWizard(0);
        return true;
      }
      const rows = state.rigs.map(
        (r, i) => `  ${i + 1}. ${padRight(r.name, 26)} (${r.targetCoin} · OC ${r.overclockPct}%)`
      );
      append([
        { kind: 'HEAD', text: 'SELECT RIG TO TINKER' },
        { kind: 'PRE', text: rows.join('\n') },
        { kind: 'TEXT', text: 'Usage: "tinker <rig#>" or "tinker <rig#> <slot> <part#>".' },
      ]);
      return true;
    }

    const rigIdx = parseInt(arg1, 10) - 1;
    const rig = state.rigs[rigIdx];
    if (!rig) {
      append([{ kind: 'ERR', text: `Rig #${arg1} not found. Run "rigs".` }]);
      return true;
    }

    if (!arg2) {
      openTinkerWizard(rigIdx);
      return true;
    }

    const targetSlot = slotMap[arg2];
    if (!targetSlot) {
      append([
        {
          kind: 'ERR',
          text: 'Unknown slot. Valid slots: chassis, compute, gpu, storage, psu, cooling, os.',
        },
      ]);
      return true;
    }

    if (!arg3) {
      openTinkerWizard(rigIdx, targetSlot);
      return true;
    }

    if (targetSlot === 'gpu') {
      if (arg3 === 'clear') {
        const res = props.onTinkerGpu(rigIdx, 'CLEAR');
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return true;
      }
      if (arg3 === 'remove' || arg3 === 'rm' || arg3 === 'sell') {
        const sIdx = (parseInt(parts[4] || '1', 10) || 1) - 1;
        const res = props.onTinkerGpu(rigIdx, 'REMOVE', sIdx);
        append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
        return true;
      }
      const gArg = arg3 === 'add' ? parts[4] : arg3;
      const qArg = arg3 === 'add' ? parts[5] : parts[4];
      const gIdx = parseInt(gArg || '', 10) - 1;
      const gpu = getUnlockedGpus()[gIdx];
      if (!gpu) {
        append([
          {
            kind: 'ERR',
            text: `GPU #${gArg || '?'} not available. Run "tinker ${rigIdx + 1}" -> gpu to inspect unlocked GPUs.`,
          },
        ]);
        return true;
      }
      const qMatch = qArg?.toLowerCase().match(/^x?(\d+)$/);
      const qty = qMatch ? Math.max(1, parseInt(qMatch[1], 10)) : 1;
      const res = props.onTinkerGpu(rigIdx, 'ADD', gpu.id, qty);
      append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
      return true;
    }

    const partNum = parseInt(arg3, 10) - 1;
    let pickedId: string | null = null;
    if (targetSlot === 'chassis') pickedId = getUnlockedChassis()[partNum]?.id ?? null;
    else if (targetSlot === 'compute') {
      const ch = getEffectivePartBundle(rig).chassis;
      const isHybrid = ch.maxAsics >= 1 && ch.maxGpus > 0;
      const isAsicOnly = Boolean(ch.isAsicRack && ch.maxGpus === 0);
      const compat = getUnlockedComputeFor(isAsicOnly, isHybrid);
      pickedId = compat[partNum]?.id ?? null;
    } else if (targetSlot === 'storage') pickedId = getUnlockedStorage()[partNum]?.id ?? null;
    else if (targetSlot === 'psu') pickedId = getUnlockedPsus()[partNum]?.id ?? null;
    else if (targetSlot === 'cooling') pickedId = getUnlockedCooling()[partNum]?.id ?? null;
    else if (targetSlot === 'os') pickedId = getUnlockedOs()[partNum]?.id ?? null;

    if (!pickedId) {
      append([
        {
          kind: 'ERR',
          text: `Part #${arg3} not found in ${targetSlot}. Run "tinker ${rigIdx + 1}" to inspect parts.`,
        },
      ]);
      return true;
    }
    const res = props.onTinkerPart(rigIdx, targetSlot, pickedId);
    append([{ kind: res.ok ? 'OK' : 'ERR', text: res.summary }]);
    return true;
  }

  void RESEARCH_NODES;
  return false;
};
