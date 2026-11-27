import { FACILITY_PROFILES, FACILITY_TIERS, ROOM_COOLING_UNITS } from '../data/catalog';
import {
  FacilityRoom,
  FacilityUpgradeId,
  GameState,
  MiningRig,
  PlacedCoolingUnit,
} from '../types/game';
import { formatUsd } from '../utils/format';

export function getEffectiveMaxRigsWithRooms(
  facilityId: string,
  facilityUpgrades?: Partial<Record<FacilityUpgradeId, number>>,
  facilityExtraRooms = 0
): number {
  const facility = FACILITY_TIERS.find((f) => f.id === facilityId) ?? FACILITY_TIERS[0];
  const profile = FACILITY_PROFILES[facility.id] ?? FACILITY_PROFILES.fac_bedroom;
  const bayLvl = facilityUpgrades?.bay_expansion ?? 0;
  const baseMax = Math.max(facility.maxRigs, Math.round(facility.maxRigs * (1 + bayLvl * 0.2)));
  const clampedExtras = Math.max(0, Math.min(profile.maxExpansions, facilityExtraRooms));
  return baseMax + clampedExtras * profile.expansionSlots;
}

export function getFacilityRoomExpansionCost(
  facilityId: string,
  currentExtraRooms = 0
): number {
  const profile = FACILITY_PROFILES[facilityId] ?? FACILITY_PROFILES.fac_bedroom;
  return Math.round(profile.expansionCostUsd * Math.pow(1.65, currentExtraRooms));
}

export function getFacilityRooms(
  state: Pick<GameState, 'facilityId' | 'facilityUpgrades' | 'facilityExtraRooms'>
): FacilityRoom[] {
  const facility = FACILITY_TIERS.find((f) => f.id === state.facilityId) ?? FACILITY_TIERS[0];
  const profile = FACILITY_PROFILES[facility.id] ?? FACILITY_PROFILES.fac_bedroom;
  const bayLvl = state.facilityUpgrades?.bay_expansion ?? 0;
  const baseMax = Math.max(facility.maxRigs, Math.round(facility.maxRigs * (1 + bayLvl * 0.2)));
  const templates = profile.defaultRooms;

  // Allocate baseMax slots cleanly across templates
  const rawCaps = templates.map((t) => Math.max(1, Math.floor(baseMax * t.slotSharePct)));
  let allocated = rawCaps.reduce((s, c) => s + c, 0);
  let i = 0;
  while (allocated < baseMax) {
    rawCaps[i % rawCaps.length] += 1;
    allocated += 1;
    i += 1;
  }
  while (allocated > baseMax) {
    const idx = rawCaps.findIndex((c) => c > 1);
    if (idx === -1) break;
    rawCaps[idx] -= 1;
    allocated -= 1;
  }

  const rooms: FacilityRoom[] = templates.map((t, idx) => ({
    id: `room_${idx + 1}`,
    index: idx + 1,
    name: t.name,
    zoneType: t.zoneType,
    slotCapacity: rawCaps[idx],
    ambientTempDeltaC: t.ambientTempDeltaC,
    airflowFactor: t.airflowFactor,
    noiseBaffleDba: t.noiseBaffleDba,
    isExpansion: false,
  }));

  const extraCount = Math.max(0, Math.min(profile.maxExpansions, state.facilityExtraRooms ?? 0));
  for (let e = 0; e < extraCount; e++) {
    const num = rooms.length + 1;
    rooms.push({
      id: `room_${num}`,
      index: num,
      name: `Expansion Wing #${e + 1}`,
      zoneType: 'COLD_AISLE',
      slotCapacity: profile.expansionSlots,
      ambientTempDeltaC: -2,
      airflowFactor: 1.15,
      noiseBaffleDba: 5,
      isExpansion: true,
    });
  }

  return rooms;
}

export function resolveRigRoomId(
  rig: Pick<MiningRig, 'roomId'>,
  rooms: FacilityRoom[],
  rigIdx = 0
): string {
  if (rig.roomId && rooms.some((r) => r.id === rig.roomId)) {
    return rig.roomId;
  }
  if (rooms.length === 0) return 'room_1';
  // Deterministic round-robin by room capacity
  let cursor = rigIdx;
  for (const rm of rooms) {
    if (cursor < rm.slotCapacity) return rm.id;
    cursor -= rm.slotCapacity;
  }
  return rooms[rigIdx % rooms.length].id;
}

export function resolveCoolerRoomId(
  unit: Pick<PlacedCoolingUnit, 'roomId'>,
  rooms: FacilityRoom[],
  unitIdx = 0
): string {
  if (unit.roomId && rooms.some((r) => r.id === unit.roomId)) {
    return unit.roomId;
  }
  if (rooms.length === 0) return 'room_1';
  return rooms[unitIdx % rooms.length].id;
}

export function findOpenRoomId(
  rooms: FacilityRoom[],
  rigs: Pick<MiningRig, 'roomId'>[]
): string {
  const counts: Record<string, number> = {};
  rooms.forEach((rm) => {
    counts[rm.id] = 0;
  });
  rigs.forEach((r, idx) => {
    const rid = resolveRigRoomId(r, rooms, idx);
    counts[rid] = (counts[rid] ?? 0) + 1;
  });
  for (const rm of rooms) {
    if ((counts[rm.id] ?? 0) < rm.slotCapacity) return rm.id;
  }
  return rooms[0]?.id ?? 'room_1';
}

export function getRoomCoolingAndThermalEffect(
  roomId: string | undefined,
  rooms: FacilityRoom[],
  coolingUnits: PlacedCoolingUnit[] = [],
  totalActiveRigsInFacility = 1
): {
  room: FacilityRoom | null;
  ambientTempDeltaC: number;
  airflowFactor: number;
  roomLocalCoolingBonusC: number;
  noiseBaffleDba: number;
} {
  if (!roomId || rooms.length === 0) {
    return {
      room: rooms[0] ?? null,
      ambientTempDeltaC: 0,
      airflowFactor: 1.0,
      roomLocalCoolingBonusC: 0,
      noiseBaffleDba: 0,
    };
  }
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  let localCoolingPower = 0;
  coolingUnits.forEach((u, idx) => {
    if (!u.enabled) return;
    const assigned = resolveCoolerRoomId(u, rooms, idx);
    if (assigned === room.id) {
      const spec = ROOM_COOLING_UNITS.find((s) => s.id === u.type);
      if (spec) localCoolingPower += spec.coolingPowerC;
    }
  });
  // Direct in-room cooling adds localized relief on top of facility-wide circulation
  const scale = Math.max(1, Math.sqrt(Math.max(1, totalActiveRigsInFacility) / Math.max(1, rooms.length)));
  const roomLocalCoolingBonusC = Math.min(18, (localCoolingPower * 0.34) / scale);

  return {
    room,
    ambientTempDeltaC: room.ambientTempDeltaC,
    airflowFactor: room.airflowFactor,
    roomLocalCoolingBonusC,
    noiseBaffleDba: room.noiseBaffleDba,
  };
}

function padR(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

export function formatAsciiFloorPlan(state: GameState): string {
  const facility = FACILITY_TIERS.find((f) => f.id === state.facilityId) ?? FACILITY_TIERS[0];
  const profile = FACILITY_PROFILES[facility.id] ?? FACILITY_PROFILES.fac_bedroom;
  const rooms = getFacilityRooms(state);
  const units = state.coolingUnits ?? [];
  const extraCount = state.facilityExtraRooms ?? 0;

  const rigsByRoom: Record<string, Array<{ idx: number; rig: MiningRig }>> = {};
  const coolersByRoom: Record<string, Array<{ idx: number; unit: PlacedCoolingUnit }>> = {};
  rooms.forEach((rm) => {
    rigsByRoom[rm.id] = [];
    coolersByRoom[rm.id] = [];
  });

  state.rigs.forEach((rig, idx) => {
    const rid = resolveRigRoomId(rig, rooms, idx);
    (rigsByRoom[rid] ??= []).push({ idx, rig });
  });

  units.forEach((unit, idx) => {
    const rid = resolveCoolerRoomId(unit, rooms, idx);
    (coolersByRoom[rid] ??= []).push({ idx, unit });
  });

  const boxWidth = 37;
  const makeBox = (rm: FacilityRoom): string[] => {
    const rList = rigsByRoom[rm.id] ?? [];
    const cList = coolersByRoom[rm.id] ?? [];
    const maxTemp =
      rList.length > 0 ? Math.max(...rList.map((x) => x.rig.temperatureC)) : facility.ambientTempC + rm.ambientTempDeltaC;
    const tempBadge = maxTemp >= 90 ? 'HOT!' : maxTemp >= 82 ? 'WARM' : 'COOL';
    const ambStr = `${rm.ambientTempDeltaC >= 0 ? '+' : ''}${rm.ambientTempDeltaC}C`;
    const rigTags =
      rList.length === 0
        ? '(empty bays)'
        : rList
            .slice(0, 5)
            .map((x) => `R${x.idx + 1}:${x.rig.temperatureC}C`)
            .join(' ') + (rList.length > 5 ? ` +${rList.length - 5}` : '');
    const coolTags =
      cList.length === 0
        ? 'No local cooler'
        : cList
            .slice(0, 3)
            .map((x) => `C${x.idx + 1}${x.unit.enabled ? '' : '(off)'}`)
            .join(' ');

    const inner = boxWidth - 2;
    return [
      `+${'-'.repeat(inner)}+`,
      `| ${padR(`[${rm.index}] ${rm.name}`, inner - 2)} |`,
      `| ${padR(`${rm.zoneType} · ${rList.length}/${rm.slotCapacity} rigs [${tempBadge}]`, inner - 2)} |`,
      `| ${padR(`Air:${Math.round(rm.airflowFactor * 100)}% Amb:${ambStr} Baffle:-${rm.noiseBaffleDba}dBA`, inner - 2)} |`,
      `| ${padR(`Rigs: ${rigTags}`, inner - 2)} |`,
      `| ${padR(`Cool: ${coolTags}`, inner - 2)} |`,
      `+${'-'.repeat(inner)}+`,
    ];
  };

  const boxes = rooms.map(makeBox);
  const rows: string[] = [];
  for (let i = 0; i < boxes.length; i += 2) {
    const left = boxes[i];
    const right = boxes[i + 1];
    if (!right) {
      rows.push(...left.map((l) => `  ${l}`));
    } else {
      for (let lineIdx = 0; lineIdx < left.length; lineIdx++) {
        rows.push(`  ${left[lineIdx]}   ${right[lineIdx]}`);
      }
    }
    rows.push('');
  }

  const nextExpCost =
    extraCount < profile.maxExpansions ? getFacilityRoomExpansionCost(facility.id, extraCount) : null;

  return [
    `  FLOOR-PLAN BLUEPRINT: ${facility.name.toUpperCase()} (${rooms.length} Rooms · Exp ${extraCount}/${profile.maxExpansions})`,
    ...rows,
    nextExpCost !== null
      ? `  Expansion Available: "room expand" adds +${profile.expansionSlots} bay slots (-2C cold aisle) for ${formatUsd(nextExpCost)} (+${formatUsd(profile.expansionUpkeepPerCycle)}/cyc upkeep).`
      : `  Facility wing expansion maxed (${extraCount}/${profile.maxExpansions} wings built).`,
  ].join('\n');
}

export function formatSingleRoomView(state: GameState, roomIndex1Based: number): string | null {
  const facility = FACILITY_TIERS.find((f) => f.id === state.facilityId) ?? FACILITY_TIERS[0];
  const rooms = getFacilityRooms(state);
  const room = rooms[roomIndex1Based - 1];
  if (!room) return null;

  const rList = state.rigs
    .map((rig, idx) => ({ rig, idx, rid: resolveRigRoomId(rig, rooms, idx) }))
    .filter((x) => x.rid === room.id);
  const cList = (state.coolingUnits ?? [])
    .map((unit, idx) => ({ unit, idx, rid: resolveCoolerRoomId(unit, rooms, idx) }))
    .filter((x) => x.rid === room.id);

  // Render ASCII bay slots grid
  const bayCols = Math.min(4, Math.max(2, room.slotCapacity));
  const bayLines: string[] = [];
  for (let i = 0; i < room.slotCapacity; i += bayCols) {
    const rowSlots: string[] = [];
    for (let c = 0; c < bayCols && i + c < room.slotCapacity; c++) {
      const slotItem = rList[i + c];
      if (slotItem) {
        rowSlots.push(`[ R${slotItem.idx + 1} ${slotItem.rig.targetCoin} ${slotItem.rig.temperatureC}C ]`);
      } else {
        rowSlots.push(`[  BAY ${i + c + 1} OPEN  ]`);
      }
    }
    bayLines.push(`    ${rowSlots.join('  ')}`);
  }

  const rigDetails =
    rList.length === 0
      ? '    (No rigs currently placed in this room. Run "rig <#> room ' + room.index + '" to move one here.)'
      : rList
          .map(
            (x) =>
              `    R${x.idx + 1} ${padR(x.rig.name, 22)} ${padR(x.rig.status, 11)} ${x.rig.temperatureC}C  ${Math.round(
                x.rig.healthPct
              )}% HP  ${x.rig.targetCoin}`
          )
          .join('\n');

  const coolDetails =
    cList.length === 0
      ? '    (No dedicated cooling units inside this room. Run "cool add <type> room ' + room.index + '".)'
      : cList
          .map((x) => {
            const spec = ROOM_COOLING_UNITS.find((s) => s.id === x.unit.type);
            return `    C${x.idx + 1} ${padR(spec?.name ?? x.unit.type, 28)} [${
              x.unit.enabled ? 'ON' : 'OFF'
            }]  -${spec?.coolingPowerC ?? 0}C  ${spec?.watts ?? 0}W`;
          })
          .join('\n');

  const amb = facility.ambientTempC + room.ambientTempDeltaC;
  return [
    `  ROOM #${room.index}: ${room.name} (${room.zoneType})`,
    `    Capacity: ${rList.length}/${room.slotCapacity} rigs · Room Ambient: ${amb}°C · Airflow: ${Math.round(
      room.airflowFactor * 100
    )}% · Baffle: -${room.noiseBaffleDba} dBA`,
    ``,
    `  ASCII BAY LAYOUT:`,
    ...bayLines,
    ``,
    `  PLACED RIGS:`,
    rigDetails,
    ``,
    `  ROOM COOLING UNITS (grant +34% localized room thermal relief):`,
    coolDetails,
  ].join('\n');
}
