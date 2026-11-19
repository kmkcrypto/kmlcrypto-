import { FACILITY_TIERS } from '../data/catalog';
import { CoinSymbol, ContractSpec, GameState } from '../types/game';
import { formatUsd } from '../utils/format';
import { createSeededRng } from '../utils/rng';

export function generateContractBoard(
  state: Pick<
    GameState,
    'stepCount' | 'rigs' | 'coins' | 'facilityId' | 'runSeed' | 'mediaCredibility' | 'unlockedResearch'
  >,
  count = 4
): ContractSpec[] {
  const rng = createSeededRng(`${state.runSeed}-contracts-${state.stepCount}-${Math.random()}`);
  const unlockedCoins = (Object.keys(state.coins) as CoinSymbol[]).filter(
    (s) => state.coins[s].unlocked
  );
  const baseStepRev = Math.max(
    26,
    state.rigs.reduce((s, r) => s + r.lastStepUsd, 0)
  );
  const rep = state.mediaCredibility ?? 40;
  const facIdx = Math.max(
    0,
    FACILITY_TIERS.findIndex((f) => f.id === state.facilityId)
  );
  const slaBonusMult = state.unlockedResearch?.includes('res_enterprise_sla') ? 1.22 : 1.0;

  const clients = [
    'Helios Clearing House',
    'Kestrel Cloud Arbitrage',
    'Meridian Validator Group',
    'Vanguard Custody Node',
    'Civic Grid Authority',
    'Boreal Liquidity Pool',
    'Northstar Silicon Leasing',
    'Argon Hosting Partners',
  ];

  const list: ContractSpec[] = [];
  for (let i = 0; i < count; i++) {
    const roll = i === 0 ? 0.1 : rng();
    const clientName = clients[Math.floor(rng() * clients.length)];
    const duration = 8 + Math.floor(rng() * 9); // 8-16 steps
    const coin = unlockedCoins[Math.floor(rng() * unlockedCoins.length)] ?? 'BTC';

    if (roll < 0.2) {
      const targetAmount = Math.round(baseStepRev * duration * (1.1 + rng() * 0.35));
      const rewardCash = Math.round(targetAmount * (0.38 + rng() * 0.14) * slaBonusMult);
      const rewardRp = Math.round(8 + duration * 1.4);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `${coin} Yield Sprint`,
        clientName,
        type: 'COIN_REVENUE',
        targetCoin: coin,
        targetAmount,
        minReputation: 0,
        progress: 0,
        durationSteps: duration,
        stepsRemaining: duration,
        rewardCash,
        rewardRp,
        penaltyCredibility: 5,
        penaltyCash: Math.round(rewardCash * 0.15),
        description: `Generate ${formatUsd(targetAmount)} in ${coin} mining payouts within ${duration} steps.`,
      });
    } else if (roll < 0.36) {
      const targetAmount = Math.round(baseStepRev * duration * (1.2 + rng() * 0.3));
      const rewardCash = Math.round(targetAmount * (0.35 + rng() * 0.14) * slaBonusMult);
      const rewardRp = Math.round(10 + duration * 1.6);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Dedicated Fleet Throughput',
        clientName,
        type: 'POOL_HASH',
        targetAmount,
        minReputation: 15,
        progress: 0,
        durationSteps: duration,
        stepsRemaining: duration,
        rewardCash,
        rewardRp,
        penaltyCredibility: 5,
        penaltyCash: Math.round(rewardCash * 0.18),
        description: `Deliver ${formatUsd(targetAmount)} total fleet hash output over ${duration} steps.`,
      });
    } else if (roll < 0.48) {
      const quietSteps = 6 + Math.floor(rng() * 5);
      const rewardCash = Math.round((baseStepRev * quietSteps * 0.65 + 320) * slaBonusMult);
      const rewardRp = Math.round(10 + quietSteps * 1.5);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Whisper-Quiet Acoustic SLA',
        clientName,
        type: 'LOW_NOISE_RUN',
        targetAmount: quietSteps,
        minReputation: 10,
        progress: 0,
        durationSteps: quietSteps + 3,
        stepsRemaining: quietSteps + 3,
        rewardCash,
        rewardRp,
        penaltyCredibility: 4,
        penaltyCash: Math.round(rewardCash * 0.12),
        description: `Hold peak noise >= 4 dBA under limit for ${quietSteps} steps.`,
      });
    } else if (roll < 0.6) {
      const slaSteps = 8 + Math.floor(rng() * 5);
      const targetCond = rep >= 50 ? 90 : 84;
      const rewardCash = Math.round((baseStepRev * slaSteps * 0.55 + 480) * slaBonusMult);
      const rewardRp = Math.round(12 + slaSteps * 1.4);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `Maintenance Reliability SLA (${targetCond}%+)`,
        clientName,
        type: 'MAINTENANCE_SLA',
        targetAmount: slaSteps,
        targetConditionPct: targetCond,
        minReputation: 20,
        progress: 0,
        durationSteps: slaSteps + 2,
        stepsRemaining: slaSteps + 2,
        rewardCash,
        rewardRp,
        penaltyCredibility: 6,
        penaltyCash: Math.round(rewardCash * 0.2),
        description: `Maintain average rig condition >= ${targetCond}% with active mining for ${slaSteps} steps.`,
      });
    } else if (roll < 0.72) {
      const streakSteps = 6 + Math.floor(rng() * 4);
      const rewardCash = Math.round((baseStepRev * streakSteps * 0.62 + 520) * slaBonusMult);
      const rewardRp = Math.round(14 + streakSteps * 1.5);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `Zero-Fault Uptime Streak (${streakSteps}st)`,
        clientName,
        type: 'UPTIME_STREAK',
        targetAmount: streakSteps,
        minReputation: 18,
        progress: 0,
        durationSteps: streakSteps + 4,
        stepsRemaining: streakSteps + 4,
        rewardCash,
        rewardRp,
        penaltyCredibility: 6,
        penaltyCash: Math.round(rewardCash * 0.18),
        description: `Run ${streakSteps} consecutive steps with zero overheats, breaker trips, or rig failures.`,
      });
    } else if (roll < 0.82) {
      const effSteps = 7 + Math.floor(rng() * 4);
      const rewardCash = Math.round((baseStepRev * effSteps * 0.52 + 440) * slaBonusMult);
      const rewardRp = Math.round(14 + effSteps * 1.4);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Green Grid Efficiency Mandate',
        clientName,
        type: 'EFFICIENCY_CAP',
        targetAmount: effSteps,
        minReputation: 12,
        progress: 0,
        durationSteps: effSteps + 3,
        stepsRemaining: effSteps + 3,
        rewardCash,
        rewardRp,
        penaltyCredibility: 4,
        penaltyCash: Math.round(rewardCash * 0.14),
        description: `Mine actively under 85% breaker utilization for ${effSteps} steps.`,
      });
    } else if (roll < 0.9) {
      const rpTarget = Math.round(20 + facIdx * 18 + rng() * 20);
      const rewardCash = Math.round((750 + rpTarget * 42) * slaBonusMult);
      const rewardRp = Math.round(rpTarget * 0.45);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: 'Joint Silicon Telemetry Partnership',
        clientName,
        type: 'RESEARCH_PARTNERSHIP',
        targetAmount: rpTarget,
        minReputation: 25,
        progress: 0,
        durationSteps: 14,
        stepsRemaining: 14,
        rewardCash,
        rewardRp,
        penaltyCredibility: 5,
        penaltyCash: Math.round(rewardCash * 0.15),
        description: `Generate ${rpTarget} Research Points within 14 steps for hardware benchmarking.`,
      });
    } else if (facIdx < FACILITY_TIERS.length - 1 && rep >= 35) {
      const nextFacIdx = facIdx + 1;
      const nextFac = FACILITY_TIERS[nextFacIdx];
      const rewardCash = Math.round(Math.max(1200, nextFac.cycleRent * 1.9) * slaBonusMult);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `Facility Expansion: ${nextFac.name}`,
        clientName,
        type: 'FACILITY_EXPANSION',
        targetAmount: 1,
        targetFacilityIndex: nextFacIdx,
        minReputation: 35,
        progress: 0,
        durationSteps: 28,
        stepsRemaining: 28,
        rewardCash,
        rewardRp: 24 + nextFacIdx * 8,
        penaltyCredibility: 7,
        penaltyCash: Math.round(rewardCash * 0.2),
        description: `Expand mining operations into ${nextFac.name} (or larger) within 28 steps.`,
      });
    } else {
      const targetEquip = Math.max(2, state.rigs.length + 1);
      const rewardCash = Math.round((680 + targetEquip * 280) * slaBonusMult);
      list.push({
        id: `ctr_${state.stepCount}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        title: `Equipment Supply Capacity (${targetEquip} Rigs)`,
        clientName,
        type: 'EQUIPMENT_SUPPLY',
        targetAmount: targetEquip,
        minReputation: 15,
        progress: state.rigs.filter((r) => r.enabled).length,
        durationSteps: 16,
        stepsRemaining: 16,
        rewardCash,
        rewardRp: 14 + targetEquip * 2,
        penaltyCredibility: 5,
        penaltyCash: Math.round(rewardCash * 0.16),
        description: `Operate at least ${targetEquip} active mining rigs simultaneously within 16 steps.`,
      });
    }
  }
  return list;
}
