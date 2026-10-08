import type { EnemyKind } from './types';

export interface WaveEntry {
  kind: EnemyKind;
  count: number;
  interval: number;
  delay: number;
}

export interface SpawnItem {
  at: number;
  kind: EnemyKind;
  hpMul: number;
  rewardMul: number;
}

type RawEntry = [EnemyKind, number, number, number];

const SCRIPTED: Record<number, RawEntry[]> = {
  1: [['grunt', 8, 1.1, 0]],
  2: [['grunt', 14, 0.9, 0]],
  3: [['grunt', 10, 1.0, 0], ['runner', 4, 0.7, 6]],
  4: [['runner', 14, 0.55, 0]],
  5: [['brute', 3, 3, 0], ['grunt', 10, 0.8, 2]],
  6: [['flyer', 8, 0.9, 0]],
  7: [['grunt', 16, 0.7, 0], ['runner', 6, 0.6, 8]],
  8: [['brute', 5, 2.2, 0], ['runner', 10, 0.5, 5]],
  9: [['flyer', 12, 0.7, 0], ['grunt', 8, 0.9, 6]],
  10: [['boss', 1, 1, 1], ['grunt', 8, 1.0, 0]],
  11: [['healer', 3, 4, 0], ['grunt', 12, 0.8, 1]],
  12: [['runner', 24, 0.35, 0]],
  13: [['brute', 8, 1.8, 0], ['flyer', 8, 0.8, 4], ['phantom', 4, 1.6, 3]],
  14: [['healer', 4, 3, 0], ['runner', 14, 0.5, 2], ['grunt', 8, 0.8, 10]],
  15: [['boss', 2, 8, 1], ['runner', 10, 0.5, 0]],
  16: [['grunt', 30, 0.4, 0]],
  17: [['splitter', 10, 0.8, 0], ['runner', 8, 0.5, 4]],
  18: [['shield', 6, 2.0, 0], ['grunt', 12, 0.7, 2]],
  19: [['runner', 26, 0.35, 0], ['flyer', 10, 0.6, 8]],
  20: [['boss', 1, 1, 2], ['flyer', 10, 0.7, 0], ['brute', 6, 2, 6]],
  21: [['splitter', 12, 0.7, 0], ['brute', 8, 1.8, 4], ['phantom', 6, 1.4, 2]],
  22: [['shield', 10, 1.5, 0], ['runner', 12, 0.4, 3], ['wrecker', 2, 4, 1]],
  23: [['healer', 6, 2, 0], ['flyer', 14, 0.5, 3]],
  24: [['splitter', 14, 0.6, 0], ['grunt', 16, 0.6, 5]],
  25: [['boss', 2, 6, 2], ['healer', 4, 3, 0]],
  26: [['shield', 12, 1.2, 0], ['flyer', 12, 0.5, 6], ['phantom', 8, 1.1, 3]],
  27: [['brute', 16, 1.0, 0], ['healer', 5, 2.2, 4]],
  28: [['splitter', 16, 0.5, 0], ['runner', 16, 0.4, 5], ['wrecker', 3, 3.5, 2]],
  29: [['shield', 10, 1.3, 0], ['grunt', 30, 0.35, 3], ['healer', 5, 2, 6]],
  30: [['boss', 3, 7, 2], ['splitter', 10, 0.8, 0], ['brute', 10, 1.4, 6]],
};

function procedural(n: number): RawEntry[] {
  const t = n - 30;
  const out: RawEntry[] = [
    ['grunt', 20 + t * 2, 0.4, 0],
    ['runner', 12 + t * 2, 0.3, 4],
  ];
  if (n % 2 === 1) out.push(['brute', 8 + t, 1.2, 3]);
  else out.push(['flyer', 10 + t, 0.5, 2], ['splitter', 6 + t, 0.7, 3]);
  if (n % 3 === 0) out.push(['healer', 3 + Math.floor(t / 2), 2.5, 2]);
  if (n % 3 === 2) out.push(['phantom', 6 + t, 1.0, 3]);
  if (n % 5 === 2) out.push(['wrecker', 3 + Math.floor(t / 3), 2.6, 5]);
  if (n % 4 === 0) out.push(['shield', 8 + t, 1.3, 3]);
  if (n % 5 === 0) out.push(['boss', 1 + Math.floor(t / 5), 6, 4]);
  if (n % 4 === 1) out.push(['colossus', 1 + Math.floor(t / 6), 9, 2]);
  return out;
}

export function waveEntries(n: number): WaveEntry[] {
  const raw = n <= 30 ? SCRIPTED[n] ?? SCRIPTED[1] : procedural(n);
  return raw.map(([kind, count, interval, delay]) => ({ kind, count, interval, delay }));
}

export function hpScale(n: number): number {
  return 1 + 0.1 * (n - 1) + 0.01 * (n - 1) ** 2;
}

export function rewardScale(n: number): number {
  return 1 + 0.05 * (n - 1);
}

export function buildWave(n: number, startAt: number): SpawnItem[] {
  const items: SpawnItem[] = [];
  for (const e of waveEntries(n)) {
    for (let i = 0; i < e.count; i++) {
      items.push({ at: startAt + e.delay + i * e.interval, kind: e.kind, hpMul: hpScale(n), rewardMul: rewardScale(n) });
    }
  }
  items.sort((a, b) => a.at - b.at);
  return items;
}

export function wavePreview(n: number): { kind: EnemyKind; count: number }[] {
  const m = new Map<EnemyKind, number>();
  for (const e of waveEntries(n)) m.set(e.kind, (m.get(e.kind) ?? 0) + e.count);
  return [...m.entries()].map(([kind, count]) => ({ kind, count }));
}

export interface WaveMod {
  id: string;
  name: string;
  desc: string;
  speedMul?: number;
  armorAdd?: number;
  regenPct?: number;
  rewardMul?: number;
  tint: string;
}

export function waveModifier(n: number): WaveMod | null {
  if (n < 4 || n % 10 === 0) return null;
  const roll = ((n * 2654435761) >>> 0) % 100;
  if (roll < 18) return { id: 'swift', name: 'SWIFT', desc: '+30% speed', speedMul: 1.3, tint: '#67e8f9' };
  if (roll < 36) return { id: 'fortified', name: 'FORTIFIED', desc: '+4 armor', armorAdd: 4, tint: '#cbd5e1' };
  if (roll < 52) return { id: 'regen', name: 'REGENERATING', desc: 'heals 0.6%/s', regenPct: 0.006, tint: '#4ade80' };
  if (roll < 64) return { id: 'golden', name: 'GOLDEN', desc: 'double bounty', rewardMul: 2, tint: '#fde047' };
  return null;
}
