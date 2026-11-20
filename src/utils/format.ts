import { MiningAlgorithm } from '../types/game';

export function formatStepLabel(stepCount: number): string {
  return `Step ${stepCount}`;
}

/** In-game calendar derived from the step count and hours-per-step setting. */
export function formatGameDate(stepCount: number, stepHours = 24): string {
  const totalHours = Math.max(0, stepCount) * Math.max(1, stepHours);
  const day = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;
  return `Day ${day} ${String(hour).padStart(2, '0')}:00`;
}

export function formatUsd(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `${amount < 0 ? '-' : ''}$${(Math.abs(amount) / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(amount) >= 10_000) {
    return `${amount < 0 ? '-' : ''}$${(Math.abs(amount) / 1_000).toFixed(1)}k`;
  }
  const abs = Math.abs(amount);
  const decimals = abs > 0 && abs < 1 ? 4 : 2;
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatCoinAmount(amount: number): string {
  if (amount === 0) return '0.0000';
  if (amount >= 1000) return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toFixed(4);
  if (amount >= 0.001) return amount.toFixed(5);
  return amount.toFixed(6);
}

export function formatHashrate(mhEquivalent: number, algo: MiningAlgorithm): string {
  if (algo === 'POST') {
    if (mhEquivalent >= 1000) return `${(mhEquivalent / 1000).toFixed(2)} PiB`;
    return `${mhEquivalent.toFixed(1)} TiB`;
  }
  if (mhEquivalent < 0.001) {
    return `${(mhEquivalent * 1_000_000).toFixed(0)} H/s`;
  }
  if (mhEquivalent < 1) {
    return `${(mhEquivalent * 1000).toFixed(1)} KH/s`;
  }
  if (mhEquivalent < 1000) {
    return `${mhEquivalent.toFixed(1)} MH/s`;
  }
  if (mhEquivalent < 1_000_000) {
    return `${(mhEquivalent / 1000).toFixed(2)} GH/s`;
  }
  if (mhEquivalent < 1_000_000_000) {
    return `${(mhEquivalent / 1_000_000).toFixed(2)} TH/s`;
  }
  return `${(mhEquivalent / 1_000_000_000).toFixed(2)} PH/s`;
}

export function renderAsciiBar(pct: number, width = 12): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

export function renderAsciiSparkline(values: number[], maxPoints = 24): string {
  if (values.length === 0) return '—';
  const slice = values.slice(-maxPoints);
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const span = max - min;
  if (span <= 0) return chars[3].repeat(slice.length);
  return slice
    .map((v) => {
      const idx = Math.min(chars.length - 1, Math.max(0, Math.floor(((v - min) / span) * (chars.length - 1))));
      return chars[idx];
    })
    .join('');
}
