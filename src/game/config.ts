import type { AbilityId, DifficultyId, EnemyDef, EnemyKind, TowerDef, TowerKind } from './types';

export const START_MONEY = 260;
export const START_LIVES = 20;
export const FINAL_WAVE = 30;
export const SELL_RATIO = 0.7;
export const CLEAR_BONUS_BASE = 20;
export const CLEAR_BONUS_PER_WAVE = 3;
export const STACK_BONUS = 25;
export const INTEREST_RATE = 0.04;
export const INTEREST_CAP = 40;
export const HIGHSCORE_KEY = 'neon-defense-highscore';

export const DIFFICULTIES: Record<DifficultyId, { label: string; money: number; lives: number; hpMul: number }> = {
  easy: { label: 'Easy', money: 320, lives: 25, hpMul: 0.85 },
  normal: { label: 'Normal', money: 260, lives: 20, hpMul: 1 },
  hard: { label: 'Hard', money: 210, lives: 12, hpMul: 1.25 },
};

export const ABILITIES: { id: AbilityId; name: string; key: string; cd: number; desc: string }[] = [
  { id: 'airstrike', name: 'Airstrike', key: 'A', cd: 45, desc: 'Bomb an area for 220 piercing damage' },
  { id: 'cryo', name: 'Cryo Blast', key: 'S', cd: 60, desc: 'Freeze every enemy for 2.5s' },
  { id: 'overdrive', name: 'Overdrive', key: 'D', cd: 75, desc: 'Towers fire 60% faster for 6s' },
  { id: 'repair', name: 'Repair', key: 'F', cd: 90, desc: 'Restore 3 lives' },
  { id: 'goldrush', name: 'Gold Rush', key: 'G', cd: 60, desc: '+50% gold from kills for 8s' },
];

export const TOWERS: Record<TowerKind, TowerDef> = {
  gun: {
    kind: 'gun',
    name: 'Gunner',
    desc: 'Fast single-target bullets. Hits air.',
    canHitFly: true,
    color: '#60a5fa',
    levels: [
      { cost: 70, damage: 7, range: 115, rate: 2.6 },
      { cost: 65, damage: 11, range: 125, rate: 3.1 },
      { cost: 115, damage: 17, range: 135, rate: 3.6 },
    ],
  },
  cannon: {
    kind: 'cannon',
    name: 'Cannon',
    desc: 'Slow shells with splash damage. Ground only.',
    canHitFly: false,
    color: '#f97316',
    levels: [
      { cost: 120, damage: 24, range: 130, rate: 0.75, splash: 42 },
      { cost: 110, damage: 38, range: 140, rate: 0.85, splash: 50 },
      { cost: 190, damage: 56, range: 150, rate: 0.95, splash: 60 },
    ],
  },
  frost: {
    kind: 'frost',
    name: 'Frost',
    desc: 'Chills enemies, slowing them. Brittle: chilled foes take +15% damage. Hits air.',
    canHitFly: true,
    color: '#22d3ee',
    levels: [
      { cost: 90, damage: 4, range: 105, rate: 1.2, slowFactor: 0.55, slowTime: 1.5 },
      { cost: 85, damage: 7, range: 115, rate: 1.4, slowFactor: 0.45, slowTime: 1.9 },
      { cost: 145, damage: 11, range: 125, rate: 1.6, slowFactor: 0.35, slowTime: 2.3 },
    ],
  },
  sniper: {
    kind: 'sniper',
    name: 'Sniper',
    desc: 'Long range, high damage, hits air. Lv3 pierces armor.',
    canHitFly: true,
    color: '#f43f5e',
    levels: [
      { cost: 150, damage: 48, range: 210, rate: 0.5 },
      { cost: 135, damage: 80, range: 230, rate: 0.55 },
      { cost: 230, damage: 130, range: 250, rate: 0.65, pierce: true },
    ],
  },
  tesla: {
    kind: 'tesla',
    name: 'Tesla',
    desc: 'Chain lightning that arcs between enemies. Hits air.',
    canHitFly: true,
    color: '#a78bfa',
    levels: [
      { cost: 200, damage: 15, range: 105, rate: 1.2, chain: 3 },
      { cost: 170, damage: 22, range: 115, rate: 1.4, chain: 4 },
      { cost: 270, damage: 32, range: 125, rate: 1.6, chain: 6 },
    ],
  },
  flame: {
    kind: 'flame',
    name: 'Flame',
    desc: 'Cone of fire that ignites enemies. Burn ignores armor and shields.',
    canHitFly: true,
    color: '#fb923c',
    levels: [
      { cost: 160, damage: 5, range: 85, rate: 4, burnDps: 6, burnTime: 3 },
      { cost: 140, damage: 8, range: 90, rate: 4.5, burnDps: 10, burnTime: 3 },
      { cost: 220, damage: 12, range: 95, rate: 5, burnDps: 16, burnTime: 4 },
    ],
  },
  missile: {
    kind: 'missile',
    name: 'Missile',
    desc: 'Homing rockets, huge single-target damage. Anti-air only.',
    canHitFly: true,
    airOnly: true,
    color: '#e2e8f0',
    levels: [
      { cost: 220, damage: 60, range: 180, rate: 0.8 },
      { cost: 180, damage: 95, range: 195, rate: 0.9 },
      { cost: 280, damage: 140, range: 210, rate: 1.0, splash: 25 },
    ],
  },
  amp: {
    kind: 'amp',
    name: 'Amp',
    desc: 'Support pylon: boosts damage of towers in range. Does not attack.',
    canHitFly: false,
    color: '#4ade80',
    levels: [
      { cost: 150, damage: 0, range: 0, rate: 0, aura: { range: 90, dmgPct: 0.15 } },
      { cost: 140, damage: 0, range: 0, rate: 0, aura: { range: 100, dmgPct: 0.25 } },
      { cost: 220, damage: 0, range: 0, rate: 0, aura: { range: 110, dmgPct: 0.4 } },
    ],
  },
  bank: {
    kind: 'bank',
    name: 'Vault',
    desc: 'Generates gold at the end of each wave. Does not attack.',
    canHitFly: false,
    color: '#fbbf24',
    levels: [
      { cost: 150, damage: 0, range: 0, rate: 0, income: 22 },
      { cost: 130, damage: 0, range: 0, rate: 0, income: 44 },
      { cost: 210, damage: 0, range: 0, rate: 0, income: 80 },
    ],
  },
};

export const TOWER_LIST: TowerDef[] = [
  TOWERS.gun, TOWERS.cannon, TOWERS.frost, TOWERS.sniper, TOWERS.tesla, TOWERS.flame, TOWERS.missile, TOWERS.amp, TOWERS.bank,
];

export const ELITES: Record<string, { name: string; hpMul: number; speedMul: number; armorAdd: number; regenPct: number; rewardMul: number; tint: string }> = {
  swift: { name: 'Swift', hpMul: 1, speedMul: 1.35, armorAdd: 0, regenPct: 0, rewardMul: 1.6, tint: '#67e8f9' },
  fortified: { name: 'Fortified', hpMul: 1.5, speedMul: 1, armorAdd: 6, regenPct: 0, rewardMul: 1.6, tint: '#cbd5e1' },
  regenerating: { name: 'Regenerating', hpMul: 1.3, speedMul: 1, armorAdd: 0, regenPct: 0.01, rewardMul: 1.6, tint: '#4ade80' },
  golden: { name: 'Golden', hpMul: 1.15, speedMul: 1.1, armorAdd: 0, regenPct: 0, rewardMul: 3, tint: '#fde047' },
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { kind: 'grunt', name: 'Grunt', hp: 55, speed: 65, reward: 8, armor: 0, size: 11, color: '#94a3b8', flying: false, leak: 1 },
  runner: { kind: 'runner', name: 'Runner', hp: 32, speed: 120, reward: 7, armor: 0, size: 9, color: '#4ade80', flying: false, leak: 1 },
  brute: { kind: 'brute', name: 'Brute', hp: 220, speed: 42, reward: 22, armor: 3, size: 15, color: '#f59e0b', flying: false, leak: 2 },
  flyer: { kind: 'flyer', name: 'Flyer', hp: 55, speed: 75, reward: 10, armor: 0, size: 11, color: '#e879f9', flying: true, leak: 1 },
  healer: { kind: 'healer', name: 'Healer', hp: 110, speed: 66, reward: 18, armor: 2, size: 12, color: '#34d399', flying: false, leak: 1, healAmount: 14, healRadius: 80 },
  boss: { kind: 'boss', name: 'Boss', hp: 1500, speed: 38, reward: 130, armor: 6, size: 20, color: '#ef4444', flying: false, leak: 5, enrage: true, spawnOnDeath: { kind: 'grunt', count: 6, hpMul: 0.6 }, slam: { radius: 115, stun: 1.6, every: 9 } },
  splitter: { kind: 'splitter', name: 'Splitter', hp: 70, speed: 70, reward: 12, armor: 0, size: 13, color: '#a3e635', flying: false, leak: 1, spawnOnDeath: { kind: 'grunt', count: 2, hpMul: 0.35 } },
  shield: { kind: 'shield', name: 'Shielded', hp: 90, speed: 52, reward: 20, armor: 1, size: 12, color: '#38bdf8', flying: false, leak: 2, shieldHp: 120, shieldRegen: 25 },
  phantom: { kind: 'phantom', name: 'Phantom', hp: 85, speed: 74, reward: 19, armor: 0, size: 12, color: '#c084fc', flying: false, leak: 1, cloakEvery: 4.2, cloakTime: 1.8 },
  wrecker: { kind: 'wrecker', name: 'Wrecker', hp: 170, speed: 56, reward: 26, armor: 2, size: 14, color: '#fb7185', flying: false, leak: 2, disable: { radius: 72, stun: 5, channel: 3, every: 9 } },
  colossus: { kind: 'colossus', name: 'Colossus', hp: 2600, speed: 24, reward: 240, armor: 14, size: 26, color: '#cbd5e1', flying: false, leak: 8, slowImmune: true },
};
