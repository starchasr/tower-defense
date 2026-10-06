export type Vec = { x: number; y: number };

export type TowerKind = 'gun' | 'frost' | 'cannon' | 'sniper' | 'tesla' | 'flame' | 'missile' | 'amp' | 'bank';
export type EnemyKind = 'grunt' | 'runner' | 'brute' | 'flyer' | 'healer' | 'boss' | 'splitter' | 'shield' | 'phantom' | 'wrecker';
export type TargetMode = 'first' | 'last' | 'strong' | 'close';
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'stories' | 'levels' | 'briefing';

export interface CampaignStoryInfo {
  id: string;
  name: string;
  blurb: string;
  color: string;
  cleared: number;
}

export interface CampaignLevelInfo {
  name: string;
  locked: boolean;
  cleared: boolean;
}
export type DifficultyId = 'easy' | 'normal' | 'hard';
export type AbilityId = 'airstrike' | 'cryo' | 'overdrive' | 'repair' | 'goldrush';

export interface TowerLevel {
  cost: number;
  damage: number;
  range: number;
  rate: number;
  splash?: number;
  chain?: number;
  slowFactor?: number;
  slowTime?: number;
  pierce?: boolean;
  burnDps?: number;
  burnTime?: number;
  aura?: { range: number; dmgPct: number };
  income?: number;
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  desc: string;
  canHitFly: boolean;
  airOnly?: boolean;
  color: string;
  levels: TowerLevel[];
}

export interface Tower {
  id: number;
  kind: TowerKind;
  gx: number;
  gy: number;
  x: number;
  y: number;
  level: number;
  cd: number;
  angle: number;
  targeting: TargetMode;
  spent: number;
  kills: number;
  damage: number;
  fireFlash: number;
  recoil: number;
  stunT: number;
  placedAt: number;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  reward: number;
  armor: number;
  size: number;
  color: string;
  flying: boolean;
  leak: number;
  healAmount?: number;
  healRadius?: number;
  shieldHp?: number;
  shieldRegen?: number;
  spawnOnDeath?: { kind: EnemyKind; count: number; hpMul: number };
  enrage?: boolean;
  cloakEvery?: number;
  cloakTime?: number;
  slam?: { radius: number; stun: number; every: number };
  disable?: { radius: number; stun: number; channel: number; every: number };
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  hpMul: number;
  x: number;
  y: number;
  wp: number;
  ang: number;
  traveled: number;
  progress: number;
  slowFactor: number;
  slowT: number;
  healPulse: number;
  reward: number;
  bob: number;
  shieldHp: number;
  shieldMax: number;
  shieldT: number;
  burnDps: number;
  burnT: number;
  burnTowerId: number;
  enraged: boolean;
  mSpeed: number;
  mArmor: number;
  mRegen: number;
  mTint: string | null;
  cloakT: number;
  cloaked: boolean;
  slamCd: number;
  elite: string | null;
  disT: number;
  disCd: number;
  disTarget: number;
  beamT: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  splash: number;
  slowFactor: number;
  slowTime: number;
  kind: TowerKind;
  color: string;
  tower: Tower;
  trailT: number;
}

export interface SelTowerInfo {
  id: number;
  kind: TowerKind;
  name: string;
  level: number;
  targeting: TargetMode;
  damage: number;
  rate: number;
  range: number;
  splash: number;
  chain: number;
  slow: string;
  pierce: boolean;
  special: string;
  upgradeCost: number;
  canUpgrade: boolean;
  sellValue: number;
  kills: number;
  totalDamage: number;
  veteran: number;
}

export interface AbilityInfo {
  id: AbilityId;
  name: string;
  key: string;
  cd: number;
  max: number;
  ready: boolean;
  pending: boolean;
  active: boolean;
  desc: string;
}

export interface UiSnapshot {
  state: GameState;
  money: number;
  lives: number;
  wave: number;
  score: number;
  speed: number;
  muted: boolean;
  endless: boolean;
  difficulty: DifficultyId;
  highScore: number;
  waveActive: boolean;
  countdown: number;
  canCall: boolean;
  callBonus: number;
  selKind: TowerKind | null;
  selTower: SelTowerInfo | null;
  nextWave: { kind: EnemyKind; count: number }[];
  abilities: AbilityInfo[];
  autoStart: boolean;
  deal: { kind: TowerKind; price: number } | null;
  combo: number;
  comboMul: number;
  campaignPlay: { story: string; color: string; level: string; levelNum: number; waveIn: number; waves: number } | null;
  campaignOn: boolean;
  campaign: null | {
    screen: 'stories' | 'levels' | 'briefing';
    stories: CampaignStoryInfo[];
    selStory: string | null;
    levels: CampaignLevelInfo[];
    levelName: string;
    intro: string;
    levelNum: number;
  };
  campaignResult: null | { story: string; level: string; outro: string; hasNext: boolean; clearedAll: boolean };
}

export type RenderEffect =
  | { type: 'explosion'; x: number; y: number; r: number; t: number; life: number }
  | { type: 'ring'; x: number; y: number; r: number; t: number; life: number; color: string }
  | { type: 'arc'; pts: Vec[]; t: number; life: number }
  | { type: 'cone'; x: number; y: number; angle: number; spread: number; range: number; t: number; life: number }
  | { type: 'tracer'; x1: number; y1: number; x2: number; y2: number; t: number; life: number; color?: string }
  | { type: 'text'; x: number; y: number; text: string; color: string; t: number; life: number }
  | { type: 'corpse'; x: number; y: number; y0: number; size: number; color: string; shape: 'sphere' | 'cone' | 'box' | 'octa' | 'cross'; ang: number; t: number; life: number }
  | { type: 'soul'; x: number; y: number; color: string; t: number; life: number }
  | { type: 'spark'; x: number; y: number; h: number; vx: number; vy: number; vz: number; color: string; t: number; life: number }
  | { type: 'part'; x: number; y: number; vx: number; vy: number; size: number; color: string; t: number; life: number; grav?: number };

export interface GhostInfo {
  gx: number;
  gy: number;
  valid: boolean;
  range: number;
  color: string;
}

export interface RenderState {
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  effects: RenderEffect[];
  selTowerId: number | null;
  hoverPoint: Vec | null;
  pendingAirstrike: boolean;
  overdrive: boolean;
  shake: number;
  freezeFlash: number;
  dmgFlash: number;
  lowLives: boolean;
  elapsed: number;
  ghost: GhostInfo | null;
  countdown: number;
  nextWaveNum: number;
  leak: { x: number; y: number; t: number } | null;
  focusId: number | null;
  bolt: number;
  banner: { num: number; label: string; t: number } | null;
  events: { text: string; color: string; t: number }[];
}
