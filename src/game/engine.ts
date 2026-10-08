import {
  BLOCKED_CELLS, CELL, COLS, FLY_LEN, FLY_PATH, GROUND_LEN, GROUND_PATH, H, PATH_CELLS, ROWS, W, setLayout,
} from './map';
import {
  ABILITIES, CLEAR_BONUS_BASE, CLEAR_BONUS_PER_WAVE, DIFFICULTIES, ELITES, ENEMIES, FINAL_WAVE,
  HIGHSCORE_KEY, INTEREST_CAP, INTEREST_RATE, SELL_RATIO, STACK_BONUS, TOWERS,
} from './config';
import { STORIES, WAVES_PER_LEVEL, getStory, levelStars, levelWaveBase, loadProgress, recordStars, saveProgress } from './campaign';
import { achName, loadAch, saveAch } from './achievements';
import { buildWave, rewardScale, waveModifier, wavePreview } from './waves';
import type { SpawnItem } from './waves';
import { Sfx } from './sfx';
import { Renderer3D } from './renderer3d';
import { dayPhase, rainAmount } from './daycycle';
import type {
  AbilityId, DifficultyId, Enemy, GameState, GhostInfo, Projectile, RenderEffect, RenderState, TargetMode,
  Tower, TowerKind, TowerLevel, UiSnapshot, Vec, WeatherMode,
} from './types';

type Effect = RenderEffect;

const KIND_KEYS: TowerKind[] = ['gun', 'frost', 'cannon', 'sniper', 'tesla', 'flame', 'missile', 'amp', 'bank'];

function ghostTower(kind: TowerKind, gx: number, gy: number): Tower {
  return {
    id: -1, kind, gx, gy, x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL,
    level: 0, cd: 0, angle: -Math.PI / 2, targeting: 'first',
    beamTargetId: 0, beamHeat: 0,
    spent: 0, kills: 0, damage: 0, fireFlash: 0, recoil: 0, stunT: 0, placedAt: 0,
  };
}

export class Game {
  private glCanvas: HTMLCanvasElement;
  private renderer: Renderer3D;
  private raf = 0;
  private last = 0;
  private uiAcc = 1;
  private elapsed = 0;
  private nextId = 1;

  private towers: Tower[] = [];
  private enemies = new Map<number, Enemy>();
  private projectiles: Projectile[] = [];
  private queue: SpawnItem[] = [];
  private effects: Effect[] = [];

  private waveSpawned = false;
  private countdown = 0;
  private bannerT = 0;
  private bannerLabel = '';
  private campaignOn = false;
  private storyId: string | null = null;
  private levelIdx = 0;
  private levelBase = 1;
  private progress: Record<string, number> = loadProgress();
  private lastResult: UiSnapshot['campaignResult'] = null;

  private get finalWave(): number {
    return this.campaignOn ? this.levelBase + WAVES_PER_LEVEL - 1 : FINAL_WAVE;
  }
  private shake = 0;
  private dmgFlash = 0;
  private freezeFlash = 0;
  private hoverCell: { gx: number; gy: number } | null = null;
  private hoverPoint: Vec | null = null;
  private downClient: { x: number; y: number } | null = null;

  private heartT = 0;
  private slowMoT = 0;
  private leakT = 0;
  private leakPos: Vec | null = null;
  private lastRain = 0;
  private boltT = 0;
  private combo = 0;
  private comboT = 0;
  private events: { text: string; color: string; at: number }[] = [];
  private dealKind: TowerKind | null = null;
  private dealPrice = 0;
  private abilityCd: Record<AbilityId, number> = { airstrike: 0, cryo: 0, overdrive: 0, repair: 0, goldrush: 0 };

  private placeCost(kind: TowerKind): number {
    return this.dealKind === kind ? this.dealPrice : TOWERS[kind].levels[0].cost;
  }
  private overdriveT = 0;
  private goldRushT = 0;
  private pendingAirstrike = false;

  selKind: TowerKind | null = null;
  selTower: number | null = null;
  focusId: number | null = null;
  state: GameState = 'menu';
  money = 0;
  lives = 0;
  wave = 0;
  score = 0;
  speed = 1;
  muted = false;
  endless = false;
  autoStart = true;
  weather: WeatherMode = 'auto';
  photoMode = false;
  livesStart = 20;
  runStats = { kills: 0, goldEarned: 0, leaks: 0, built: 0, dmg: 0 };
  showRanges = false;
  gfxHigh = true;
  volume = 1;
  barrels: { id: number; x: number; y: number }[] = [];
  coins: { id: number; x: number; y: number; t: number; amount: number }[] = [];
  private ach: Record<string, number> = loadAch();
  private panKeys = new Set<string>();

  private unlock(id: string) {
    if (this.ach[id]) return;
    this.ach[id] = 1;
    saveAch(this.ach);
    const a = achName(id);
    if (a) this.pushEvent(`★ Achievement — ${a.name}: ${a.desc}`, '#fde047');
  }
  difficulty: DifficultyId = 'normal';
  highScore = 0;
  private diffHp = 1;
  onUi?: (s: UiSnapshot) => void;
  private sfx = new Sfx();

  constructor(glCanvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.glCanvas = glCanvas;
    this.renderer = new Renderer3D(glCanvas, overlay);
    try {
      this.highScore = Number(localStorage.getItem(HIGHSCORE_KEY) || 0) || 0;
    } catch {
      this.highScore = 0;
    }
    this.gfxHigh = localStorage.getItem('nd_gfx') !== '0';
    this.renderer.setQuality(this.gfxHigh);
    try {
      this.volume = Number(localStorage.getItem('nd_vol') ?? 1) || 1;
      this.sfx.setVolume(this.volume);
    } catch {
      // ignore
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    glCanvas.addEventListener('pointermove', this.onPointerMove);
    glCanvas.addEventListener('pointerdown', this.onPointerDown);
    glCanvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.glCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.glCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.glCanvas.removeEventListener('pointerup', this.onPointerUp);
    this.glCanvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.glCanvas.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onVisibility = () => {
    if (document.hidden && this.state === 'playing' && !this.photoMode) this.togglePause();
  };

  emit() {
    this.onUi?.(this.getSnapshot());
  }

  setDifficulty(d: DifficultyId) {
    if (this.state !== 'menu') return;
    this.difficulty = d;
    this.emit();
  }

  setAutoStart(v: boolean) {
    this.autoStart = v;
    this.emit();
  }

  start() {
    this.reset();
    setLayout('classic');
    this.renderer.refreshLevel();
    const d = DIFFICULTIES[this.difficulty];
    this.money = d.money;
    this.lives = d.lives;
    this.livesStart = d.lives;
    this.diffHp = d.hpMul;
    this.state = 'playing';
    this.sfx.setMusic('calm');
    this.renderer.intro();
    this.emit();
  }

  continueEndless() {
    this.endless = true;
    this.state = 'playing';
    this.beginWave();
    this.emit();
  }

  openCampaign() {
    if (this.state !== 'menu') return;
    this.state = 'stories';
    this.emit();
  }

  campaignBack() {
    if (this.state === 'stories') this.state = 'menu';
    else if (this.state === 'levels' || this.state === 'briefing') this.state = 'levels';
    if (this.state === 'levels' && !this.storyId) this.state = 'stories';
    this.emit();
  }

  levelsBack() {
    if (this.state === 'levels' || this.state === 'briefing') this.state = 'levels';
    this.emit();
  }

  storiesBack() {
    if (this.state === 'levels' || this.state === 'briefing') {
      this.storyId = null;
      this.state = 'stories';
      this.emit();
    }
  }

  selectStory(id: string) {
    if (this.state !== 'stories') return;
    this.storyId = id;
    this.state = 'levels';
    this.emit();
  }

  openLevel(i: number) {
    if (this.state !== 'levels' || !this.storyId) return;
    const cleared = this.progress[this.storyId] ?? -1;
    if (i > cleared + 1) return;
    this.levelIdx = i;
    this.reset();
    setLayout(this.storyId);
    this.renderer.refreshLevel();
    this.state = 'briefing';
    this.emit();
  }

  startLevel() {
    if (this.state !== 'briefing' || !this.storyId) return;
    this.reset();
    setLayout(this.storyId);
    this.renderer.refreshLevel();
    const d = DIFFICULTIES[this.difficulty];
    this.money = d.money;
    this.lives = d.lives;
    this.livesStart = d.lives;
    this.diffHp = d.hpMul;
    this.campaignOn = true;
    this.levelBase = levelWaveBase(this.levelIdx);
    this.wave = this.levelBase - 1;
    this.state = 'playing';
    this.sfx.setMusic('calm');
    this.renderer.intro();
    this.beginWave();
    this.emit();
  }

  nextLevel() {
    if (this.state !== 'victory' || !this.campaignOn) return;
    if (this.levelIdx < 9) {
      this.levelIdx++;
      this.state = 'briefing';
    } else {
      this.state = 'levels';
    }
    this.emit();
  }

  retryLevel() {
    if (this.state !== 'gameover' || !this.campaignOn) return;
    this.state = 'briefing';
    this.emit();
  }

  toLevelSelect() {
    if ((this.state === 'victory' || this.state === 'gameover') && this.campaignOn) {
      this.state = 'levels';
      this.emit();
    }
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.muted = this.sfx.muted;
    this.emit();
  }

  cycleWeather() {
    this.weather = this.weather === 'auto' ? 'clear' : this.weather === 'clear' ? 'rain' : 'auto';
    if (this.weather === 'rain') this.unlock('storm');
    this.emit();
  }

  togglePhotoMode() {
    this.photoMode = !this.photoMode;
    this.emit();
  }

  centerCameraOn(x: number, y: number) {
    this.renderer.centerOn(x, y);
  }

  takeScreenshot() {
    this.renderer.requestShot();
  }

  toggleRanges() {
    this.showRanges = !this.showRanges;
    this.emit();
  }

  setGfx(high: boolean) {
    this.gfxHigh = high;
    this.renderer.setQuality(high);
    this.emit();
  }

  setVolume(v: number) {
    this.volume = v;
    this.sfx.setVolume(v);
    try {
      localStorage.setItem('nd_vol', String(v));
    } catch {
      // ignore
    }
    this.emit();
  }

  private spawnBarrels() {
    if (this.barrels.length >= 3) return;
    const path = GROUND_PATH;
    for (let n = this.barrels.length; n < 3; n++) {
      const i = 6 + Math.floor(Math.random() * Math.max(1, path.length - 12));
      const p = path[i];
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = (18 + Math.random() * 16) * side;
      this.barrels.push({ id: this.nextId++, x: p.x - dy * off, y: p.y + dx * off });
    }
  }

  private explodeBarrel(b: { id: number; x: number; y: number }) {
    this.barrels = this.barrels.filter(x => x.id !== b.id);
    this.pushEffect({ type: 'explosion', x: b.x, y: b.y, r: 80, t: 0, life: 0.5 });
    this.pushEffect({ type: 'ring', x: b.x, y: b.y, r: 82, t: 0, life: 0.45, color: '#fb923c' });
    this.shake = Math.max(this.shake, 5);
    this.sfx.play('boom');
    for (const e of [...this.enemies.values()]) {
      if (e.def.flying) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < 88) this.dealDamage(e, 120 * (1 - d / 110), true);
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.panKeys.delete(e.key);
  };

  private effRain(): number {
    if (this.weather === 'clear') return 0;
    if (this.weather === 'rain') return 1;
    return rainAmount(this.elapsed);
  }

  selectKind(k: TowerKind | null) {
    this.selKind = k;
    if (k) {
      this.selTower = null;
      this.pendingAirstrike = false;
    }
    this.emit();
  }

  setTargeting(m: TargetMode) {
    const t = this.towers.find(x => x.id === this.selTower);
    if (t) t.targeting = m;
    this.emit();
  }

  upgradeSelected() {
    const t = this.towers.find(x => x.id === this.selTower);
    if (!t || t.level >= 2) return;
    const cost = TOWERS[t.kind].levels[t.level + 1].cost;
    if (this.money < cost) {
      this.sfx.play('error');
      return;
    }
    this.money -= cost;
    t.spent += cost;
    t.level++;
    this.pushEffect({ type: 'ring', x: t.x, y: t.y, r: 14, t: 0, life: 0.4, color: TOWERS[t.kind].color });
    this.burst(t.x, t.y, TOWERS[t.kind].color, 10, 70);
    this.sfx.play('upgrade');
    this.emit();
  }

  sellSelected() {
    const t = this.towers.find(x => x.id === this.selTower);
    if (!t) return;
    const refund = this.elapsed - t.placedAt < 10 ? t.spent : Math.floor(t.spent * SELL_RATIO);
    this.money += refund;
    this.floatText(t.x, t.y - 20, `+$${refund}`, '#fde047');
    this.burst(t.x, t.y, TOWERS[t.kind].color, 8, 50);
    this.towers = this.towers.filter(x => x.id !== t.id);
    this.selTower = null;
    this.sfx.play('sell');
    this.emit();
  }

  callEarly() {
    if (this.state !== 'playing') return;
    if (this.waveSpawned) {
      if (this.endless || this.wave < this.finalWave) {
        this.money += STACK_BONUS;
        this.score += STACK_BONUS;
        this.beginWave();
      }
    } else if (this.countdown > 0) {
      this.money += Math.ceil(this.countdown) * 2;
      this.beginWave();
    } else {
      this.beginWave();
    }
    this.emit();
  }

  castAbility(id: AbilityId) {
    if (this.state !== 'playing') return;
    if (this.abilityCd[id] > 0) {
      this.sfx.play('error');
      return;
    }
    if (id === 'airstrike') {
      this.pendingAirstrike = !this.pendingAirstrike;
      if (this.pendingAirstrike) this.selKind = null;
    } else if (id === 'cryo') {
      for (const e of this.enemies.values()) {
        if (e.def.slowImmune) continue;
        e.slowFactor = 0.05;
        e.slowT = 2.5;
      }
      this.abilityCd.cryo = ABILITIES.find(a => a.id === 'cryo')!.cd;
      this.freezeFlash = 0.7;
      this.pushEffect({ type: 'ring', x: W / 2, y: H / 2, r: 60, t: 0, life: 0.6, color: '#67e8f9' });
      this.sfx.play('ability');
    } else if (id === 'overdrive') {
      this.overdriveT = 6;
      this.abilityCd.overdrive = ABILITIES.find(a => a.id === 'overdrive')!.cd;
      this.sfx.play('ability');
    } else if (id === 'repair') {
      this.lives = Math.min(30, this.lives + 3);
      this.abilityCd.repair = ABILITIES.find(a => a.id === 'repair')!.cd;
      this.floatText(W / 2, H / 2, '+3 lives', '#4ade80');
      this.sfx.play('ability');
    } else if (id === 'goldrush') {
      this.goldRushT = 8;
      this.abilityCd.goldrush = ABILITIES.find(a => a.id === 'goldrush')!.cd;
      this.floatText(W / 2, H / 2, 'GOLD RUSH!', '#fde047');
      this.pushEvent('Gold Rush! +50% gold from kills for 8s', '#fde047');
      this.sfx.play('ability');
    }
    this.emit();
  }

  private castAirstrike(pos: Vec) {
    const radius = 95;
    const dmg = 220;
    for (const e of [...this.enemies.values()]) {
      if (Math.hypot(e.x - pos.x, e.y - pos.y) <= radius + e.def.size) {
        this.dealDamage(e, dmg, true);
      }
    }
    for (let i = 0; i < 3; i++) {
      this.pushEffect({
        type: 'explosion',
        x: pos.x + (Math.random() - 0.5) * 60,
        y: pos.y + (Math.random() - 0.5) * 60,
        r: 60 + Math.random() * 35, t: 0, life: 0.35,
      });
    }
    this.pushEffect({ type: 'ring', x: pos.x, y: pos.y, r: 20, t: 0, life: 0.4, color: '#fdba74' });
    this.pushEffect({ type: 'ring', x: pos.x, y: pos.y, r: 55, t: 0, life: 0.55, color: '#fff1d4' });
    this.smoke(pos.x, pos.y, 8);
    this.burst(pos.x, pos.y, '#fdba74', 16, 160);
    this.shake = 10;
    this.sfx.play('boom');
  }

  private pushEvent(text: string, color: string) {
    this.events.push({ text, color, at: this.elapsed });
    if (this.events.length > 6) this.events.shift();
  }

  private saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        localStorage.setItem(HIGHSCORE_KEY, String(this.highScore));
      } catch {
        // ignore
      }
    }
  }

  private reset() {
    this.towers = [];
    this.enemies.clear();
    this.projectiles = [];
    this.queue = [];
    this.effects = [];
    this.runStats = { kills: 0, goldEarned: 0, leaks: 0, built: 0, dmg: 0 };
    this.barrels = [];
    this.coins = [];
    this.wave = 0;
    this.score = 0;
    this.speed = 1;
    this.elapsed = 0;
    this.endless = false;
    this.waveSpawned = false;
    this.countdown = 0;
    this.selKind = null;
    this.selTower = null;
    this.shake = 0;
    this.dmgFlash = 0;
    this.freezeFlash = 0;
    this.overdriveT = 0;
    this.pendingAirstrike = false;
    this.heartT = 0;
    this.leakT = 0;
    this.leakPos = null;
    this.focusId = null;
    this.dealKind = null;
    this.combo = 0;
    this.comboT = 0;
    this.events = [];
    this.hoverCell = null;
    this.hoverPoint = null;
    this.abilityCd = { airstrike: 0, cryo: 0, overdrive: 0, repair: 0, goldrush: 0 };
    this.goldRushT = 0;
    this.campaignOn = false;
    this.lastResult = null;
  }

  private beginWave() {
    this.wave++;
    this.queue.push(...buildWave(this.wave, this.elapsed));
    this.queue.sort((a, b) => a.at - b.at);
    this.waveSpawned = true;
    this.countdown = 0;
    this.dealKind = null;
    const mod = waveModifier(this.wave);
    this.bannerT = 2.6;
    this.bannerLabel = mod ? mod.name : '';
    if (this.endless && this.wave >= 40) this.unlock('endless10');
    if (this.money >= 1500) this.unlock('rich');
    this.spawnBarrels();
    if (mod) this.floatText(W / 2, 130, `Wave ${this.wave}: ${mod.name} — ${mod.desc}`, mod.tint);
    this.pushEffect({ type: 'ring', x: GROUND_PATH[0].x, y: GROUND_PATH[0].y, r: 30, t: 0, life: 0.6, color: '#67e8f9' });
    this.pushEffect({ type: 'ring', x: GROUND_PATH[0].x, y: GROUND_PATH[0].y, r: 64, t: 0, life: 0.8, color: '#a5f3fc' });
    this.sfx.setMusic('combat');
    this.sfx.play('wave');
  }

  private canBuild(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return false;
    if (PATH_CELLS.has(`${gx},${gy}`) || BLOCKED_CELLS.has(`${gx},${gy}`)) return false;
    return !this.towers.some(t => t.gx === gx && t.gy === gy);
  }

  private gameOver() {
    this.state = 'gameover';
    this.selKind = null;
    this.selTower = null;
    this.pendingAirstrike = false;
    this.saveHighScore();
    this.sfx.setMusic('off');
    this.renderer.cinema('defeat');
    this.sfx.play('lose');
    this.emit();
  }

  private victory() {
    this.state = 'victory';
    this.selKind = null;
    this.selTower = null;
    this.saveHighScore();
    this.sfx.setMusic('off');
    if (this.campaignOn && this.storyId) {
      const story = getStory(this.storyId);
      const lv = story.levels[this.levelIdx];
      const prev = this.progress[this.storyId] ?? -1;
      if (this.levelIdx > prev) {
        this.progress[this.storyId] = this.levelIdx;
        saveProgress(this.progress);
      }
      const lost = Math.max(0, this.livesStart - this.lives);
      const earned = lost === 0 ? 3 : lost <= 2 ? 2 : 1;
      recordStars(this.storyId, this.levelIdx, earned);
      this.unlock('campaign1');
      if (earned === 3) this.unlock('allstars');
      this.lastResult = {
        story: story.name,
        level: lv.name,
        outro: lv.outro,
        hasNext: this.levelIdx < story.levels.length - 1,
        clearedAll: this.levelIdx === story.levels.length - 1,
        stars: earned,
      };
    } else {
      this.lastResult = null;
    }
    this.renderer.cinema('victory');
    this.fireworksShow(W / 2, H / 2, 9, 950);
    this.sfx.play('win');
    this.emit();
  }

  private spawn(it: SpawnItem) {
    let elite: string | null = null;
    if (it.kind !== 'boss' && this.wave >= 12) {
      const chance = Math.min(0.25, 0.08 + this.wave * 0.005);
      if (Math.random() < chance) {
        const keys = Object.keys(ELITES);
        elite = keys[Math.floor(Math.random() * keys.length)];
      }
    }
    if (it.kind === 'boss') {
      this.shake = 11;
      this.floatText(W / 2, 150, 'BOSS INCOMING', '#f87171');
      this.pushEvent('A BOSS approaches the core!', '#f87171');
      this.bannerT = 2.2;
      this.bannerLabel = 'BOSS INCOMING';
      this.sfx.play('horn');
    }
    this.spawnEnemy(it.kind, it.hpMul, GROUND_PATH[0], 1, 0, 1, elite);
    this.pushEffect({ type: 'ring', x: GROUND_PATH[0].x, y: GROUND_PATH[0].y, r: 22, t: 0, life: 0.3, color: '#67e8f9' });
  }

  private spawnEnemy(
    kind: Enemy['def']['kind'],
    hpMul: number,
    pos: Vec,
    wp: number,
    traveled: number,
    rewardMul: number,
    elite: string | null = null,
  ) {
    const def = ENEMIES[kind];
    const mod = waveModifier(this.wave);
    let speedMul = mod?.speedMul ?? 1;
    let armorAdd = mod?.armorAdd ?? 0;
    let regen = mod?.regenPct ?? 0;
    let tint = mod?.tint ?? null;
    if (elite) {
      const aff = ELITES[elite];
      hpMul *= aff.hpMul;
      speedMul *= aff.speedMul;
      armorAdd += aff.armorAdd;
      regen += aff.regenPct;
      rewardMul *= aff.rewardMul;
      tint = aff.tint;
    }
    const hp = Math.round(def.hp * hpMul * this.diffHp);
    const id = this.nextId++;
    this.enemies.set(id, {
      id, def, hp, maxHp: hp, hpMul,
      x: pos.x, y: pos.y, wp, ang: 0, traveled,
      progress: 0, slowFactor: 1, slowT: 0, healPulse: 0,
      reward: Math.max(1, Math.round(def.reward * rewardMul * (mod?.rewardMul ?? 1))),
      bob: Math.random() * 6,
      shieldHp: def.shieldHp ? Math.round(def.shieldHp * hpMul * this.diffHp) : 0,
      shieldMax: def.shieldHp ? Math.round(def.shieldHp * hpMul * this.diffHp) : 0,
      shieldT: 99, burnDps: 0, burnT: 0, burnTowerId: 0, enraged: false,
      poisonDps: 0, poisonT: 0, poisonTowerId: 0, blinkT: def.blinkEvery ?? 0,
      cloakT: def.cloakEvery ? def.cloakEvery * (0.6 + Math.random() * 0.8) : 0, cloaked: false,
      slamCd: def.slam ? def.slam.every * (0.5 + Math.random() * 0.6) : 0,
      elite,
      disT: 0, disCd: def.disable ? def.disable.every * 0.7 : 0, disTarget: 0, beamT: 0,
      mSpeed: speedMul, mArmor: armorAdd,
      mRegen: regen, mTint: tint,
    });
    if (elite) {
      this.floatText(pos.x, pos.y - 24, `ELITE ${ELITES[elite].name}`, '#fde047');
      this.pushEvent(`Elite ${def.name} spawned: ${ELITES[elite].name}`, '#fde047');
    }
  }

  private pushEffect(e: Effect) {
    if (this.effects.length > 600) this.effects.splice(0, this.effects.length - 600);
    this.effects.push(e);
  }

  private burst(x: number, y: number, color: string, n: number, spread = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.3 + Math.random() * 0.7);
      this.pushEffect({
        type: 'part', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
        size: 1.5 + Math.random() * 2.5, color, t: 0, life: 0.4 + Math.random() * 0.3,
      });
    }
  }

  private smoke(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.pushEffect({
        type: 'part', x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 20,
        size: 3 + Math.random() * 2.5, color: '#5b6472', t: 0, life: 0.7 + Math.random() * 0.5, grav: 8,
      });
    }
  }

  private static readonly FIREWORK_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#67e8f9'];

  private firework(x: number, y: number, h: number) {
    const color = Game.FIREWORK_COLORS[Math.floor(Math.random() * Game.FIREWORK_COLORS.length)];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const v = 55 + Math.random() * 55;
      this.pushEffect({
        type: 'spark', x, y, h,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 20 + Math.random() * 40,
        color, t: 0, life: 0.9 + Math.random() * 0.4,
      });
    }
    this.sfx.play('firework');
  }

  private fireworksShow(x: number, y: number, bursts: number, spread: number) {
    for (let i = 0; i < bursts; i++) {
      const fx = x + (Math.random() - 0.5) * spread;
      const fy = y + (Math.random() - 0.5) * spread * 0.6;
      const fh = 60 + Math.random() * 80;
      setTimeout(() => {
        if (this.state === 'playing' || this.state === 'victory') this.firework(fx, fy, fh);
      }, i * 190);
    }
  }

  private tickEffects(dt: number) {
    for (const e of this.effects) {
      e.t += dt;
      if (e.type === 'part') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += (e.grav ?? 140) * dt;
      } else if (e.type === 'spark') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.h += e.vz * dt;
        e.vz -= 150 * dt;
        if (e.h < 2) e.t = e.life;
      }
    }
    this.effects = this.effects.filter(e => e.t < e.life);
  }

  private floatText(x: number, y: number, text: string, color: string) {
    this.pushEffect({ type: 'text', x, y, text, color, t: 0, life: 0.9 });
  }

  private damageMul(t: Tower): number {
    let mul = 1;
    for (const a of this.towers) {
      if (a.kind !== 'amp') continue;
      const lv = TOWERS.amp.levels[a.level];
      if (Math.hypot(a.x - t.x, a.y - t.y) <= lv.aura!.range + 16) mul += lv.aura!.dmgPct;
    }
    mul *= 1 + 0.05 * Math.min(3, Math.floor(t.kills / 15));
    return mul;
  }

  private dealDamage(e: Enemy, dmg: number, pierce: boolean, tower?: Tower) {
    if (!this.enemies.has(e.id)) return;
    if (e.cloaked) return;
    const incoming = e.slowT > 0 ? dmg * 1.15 : dmg;
    if (incoming >= 40) this.floatText(e.x + (Math.random() - 0.5) * 10, e.y, String(Math.round(incoming)), '#fca5a5');
    const armor = e.def.armor + e.mArmor;
    if (e.shieldMax > 0 && e.shieldHp > 0) {
      const absorbed = Math.min(e.shieldHp, incoming);
      e.shieldHp -= absorbed;
      e.shieldT = 0;
      const rem = incoming - absorbed;
      if (rem > 1) e.hp -= pierce ? rem : Math.max(1, rem - armor);
    } else {
      e.hp -= pierce ? incoming : Math.max(1, incoming - armor);
    }
    if (tower) {
      tower.damage += incoming;
      this.runStats.dmg += incoming;
    }
    if (e.hp <= 0) this.killEnemy(e, tower);
  }

  private killEnemy(e: Enemy, tower?: Tower) {
    if (!this.enemies.has(e.id)) return;
    this.enemies.delete(e.id);
    this.combo++;
    this.comboT = 3;
    const comboMul = 1 + Math.min(1, this.combo * 0.02);
    this.money += e.reward;
    this.score += Math.round(e.reward * comboMul);
    this.runStats.kills++;
    this.runStats.goldEarned += e.reward;
    this.unlock('firstblood');
    if (this.runStats.kills >= 100) this.unlock('century');
    if (this.combo >= 15) this.unlock('combo15');
    if (tower && Math.floor(tower.kills / 15) >= 1) this.unlock('veteran');
    if (Math.random() < 0.08) {
      this.coins.push({ id: this.nextId++, x: e.x, y: e.y, t: 0, amount: Math.max(5, Math.ceil(e.reward * 0.6)) });
    }
    if (!e.def.flying) {
      this.pushEffect({ type: 'splat', x: e.x, y: e.y, size: e.def.size * 1.2, color: e.def.color, t: 0, life: 16 });
    }
    if (this.goldRushT > 0) {
      const grBonus = Math.ceil(e.reward * 0.5);
      this.money += grBonus;
      this.runStats.goldEarned += grBonus;
      this.floatText(e.x, e.y - 12, `+$${grBonus}`, '#fde047');
    }
    if (tower) tower.kills++;
    this.floatText(e.x, e.y - e.def.size - 4, `+$${e.reward}`, '#fde047');
    this.burst(e.x, e.y, e.def.color, 10);
    this.sfx.play('coin');
    const shape: 'sphere' | 'cone' | 'box' | 'octa' | 'cross' =
      e.def.kind === 'runner' ? 'cone'
      : e.def.kind === 'brute' ? 'box'
      : e.def.kind === 'flyer' ? 'octa'
      : e.def.kind === 'healer' || e.def.kind === 'splitter' || e.def.kind === 'phantom' ? 'cross'
      : 'sphere';
    this.pushEffect({
      type: 'corpse', x: e.x, y: e.y, y0: e.def.flying ? 22 : e.def.size + 2,
      size: e.def.size, color: e.def.color, shape, ang: e.ang, t: 0, life: 0.85,
    });
    this.pushEffect({ type: 'soul', x: e.x, y: e.y, color: e.def.kind === 'phantom' ? '#f0abfc' : '#e9d5ff', t: 0, life: 0.9 });
    this.smoke(e.x, e.y, 3);
    if (e.def.kind === 'boss') {
      this.shake = 12;
      this.slowMoT = 0.6;
      this.pushEvent('BOSS DOWN!', '#4ade80');
      this.unlock('bossdown');
      this.fireworksShow(e.x, e.y, 5, 240);
    }
    if (e.def.spawnOnDeath) {
      const s = e.def.spawnOnDeath;
      for (let i = 0; i < s.count; i++) {
        const pos = {
          x: e.x + (Math.random() - 0.5) * 18,
          y: e.y + (Math.random() - 0.5) * 18,
        };
        this.spawnEnemy(s.kind, e.hpMul * s.hpMul, pos, ENEMIES[s.kind].flying ? 1 : e.wp, e.traveled, rewardScale(this.wave));
      }
    }
  }

  private splashDamage(x: number, y: number, radius: number, dmg: number, tower: Tower) {
    for (const e of [...this.enemies.values()]) {
      if (e.def.flying || e.cloaked) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= radius + e.def.size) {
        const factor = 1 - 0.55 * Math.min(1, d / radius);
        this.dealDamage(e, dmg * factor, false, tower);
      }
    }
  }

  private findTarget(t: Tower, range: number): Enemy | null {
    const def = TOWERS[t.kind];
    if (this.focusId !== null) {
      const f = this.enemies.get(this.focusId);
      if (!f) {
        this.focusId = null;
      } else if (!f.cloaked) {
        const fd = Math.hypot(f.x - t.x, f.y - t.y);
        if (fd <= range + f.def.size) return f;
      }
    }
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies.values()) {
      if (e.cloaked) continue;
      if (e.def.flying && !def.canHitFly) continue;
      if (!e.def.flying && def.airOnly) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d > range + e.def.size) continue;
      let score: number;
      switch (t.targeting) {
        case 'first': score = e.progress; break;
        case 'last': score = -e.progress; break;
        case 'strong': score = e.hp; break;
        case 'close': score = -d; break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private fire(t: Tower, lv: TowerLevel, target: Enemy) {
    const mul = this.damageMul(t);
    t.recoil = 1;
    switch (t.kind) {
      case 'gun':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 16, y: t.y + Math.sin(t.angle) * 16,
          targetId: target.id, tx: target.x, ty: target.y, speed: 420, damage: lv.damage * mul,
          splash: 0, slowFactor: 1, slowTime: 0, kind: 'gun', color: '#dbeafe', tower: t, trailT: 0,
        });
        t.fireFlash = 0.06;
        this.sfx.play('shoot');
        break;
      case 'cannon':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 16, y: t.y + Math.sin(t.angle) * 16,
          targetId: target.id, tx: target.x, ty: target.y, speed: 260, damage: lv.damage * mul,
          splash: lv.splash ?? 0, slowFactor: 1, slowTime: 0, kind: 'cannon', color: '#fdba74', tower: t, trailT: 0,
        });
        t.fireFlash = 0.09;
        this.smoke(t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, 1);
        break;
      case 'frost':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 16, y: t.y + Math.sin(t.angle) * 16,
          targetId: target.id, tx: target.x, ty: target.y, speed: 300, damage: lv.damage * mul,
          splash: 0, slowFactor: lv.slowFactor ?? 1, slowTime: lv.slowTime ?? 0,
          kind: 'frost', color: '#a5f3fc', tower: t, trailT: 0,
        });
        t.fireFlash = 0.06;
        this.sfx.play('frost');
        break;
      case 'missile':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 16, y: t.y + Math.sin(t.angle) * 16,
          targetId: target.id, tx: target.x, ty: target.y, speed: 380, damage: lv.damage * mul,
          splash: lv.splash ?? 0, slowFactor: 1, slowTime: 0, kind: 'missile', color: '#f8fafc', tower: t, trailT: 0,
        });
        t.fireFlash = 0.08;
        this.smoke(t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, 2);
        this.sfx.play('missile');
        break;
      case 'mortar':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 14, y: t.y + Math.sin(t.angle) * 14,
          sx: t.x, sy: t.y,
          targetId: target.id, tx: target.x, ty: target.y, speed: 175, damage: lv.damage * mul,
          splash: lv.splash ?? 0, slowFactor: 1, slowTime: 0, kind: 'mortar', color: '#d6d3d1', tower: t, trailT: 0,
        });
        t.fireFlash = 0.12;
        this.smoke(t.x + Math.cos(t.angle) * 16, t.y + Math.sin(t.angle) * 16, 3);
        this.sfx.play('boom');
        break;
      case 'venom':
        this.projectiles.push({
          id: this.nextId++, x: t.x + Math.cos(t.angle) * 14, y: t.y + Math.sin(t.angle) * 14,
          targetId: target.id, tx: target.x, ty: target.y, speed: 340, damage: lv.damage * mul,
          splash: 0, slowFactor: 1, slowTime: 0, kind: 'venom', color: '#a3e635', tower: t, trailT: 0,
        });
        t.fireFlash = 0.06;
        this.sfx.play('frost');
        break;
      case 'prism': {
        if (t.beamTargetId !== target.id) {
          t.beamTargetId = target.id;
          t.beamHeat = 0;
        }
        t.beamHeat = Math.min(2, t.beamHeat + 0.4);
        this.dealDamage(target, lv.damage * mul * (1 + t.beamHeat), true, t);
        const hot = Math.min(1, t.beamHeat / 2);
        const beamCol = hot > 0.02 ? `#${Math.round(244 + 11 * hot).toString(16).padStart(2, '0')}${Math.round(114 + 130 * hot).toString(16).padStart(2, '0')}e6` : '#f472b6';
        this.pushEffect({ type: 'tracer', x1: t.x, y1: t.y, x2: target.x, y2: target.y, t: 0, life: 0.1, color: beamCol });
        t.fireFlash = 0.05;
        this.sfx.play('zap');
        break;
      }
      case 'flame': {
        const spread = 0.55;
        for (const e of [...this.enemies.values()]) {
          if (e.cloaked) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d > lv.range + e.def.size) continue;
          const ang = Math.atan2(e.y - t.y, e.x - t.x);
          let diff = Math.abs(ang - t.angle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff > spread) continue;
          this.dealDamage(e, lv.damage * mul, false, t);
          if (lv.burnDps) {
            e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, lv.burnDps * mul);
            e.burnT = lv.burnTime ?? 3;
            e.burnTowerId = t.id;
          }
        }
        this.pushEffect({ type: 'cone', x: t.x, y: t.y, angle: t.angle, spread, range: lv.range, t: 0, life: 0.12 });
        t.fireFlash = 0.12;
        this.sfx.play('flame');
        break;
      }
      case 'sniper': {
        this.dealDamage(target, lv.damage * mul, !!lv.pierce, t);
        this.pushEffect({
          type: 'tracer', x1: t.x + Math.cos(t.angle) * 16, y1: t.y + Math.sin(t.angle) * 16,
          x2: target.x, y2: target.y, t: 0, life: 0.09,
        });
        this.burst(target.x, target.y, '#fecdd3', 4, 50);
        t.fireFlash = 0.08;
        this.sfx.play('snipe');
        break;
      }
      case 'tesla': {
        const pts: Vec[] = [{ x: t.x, y: t.y - 12 }];
        const hit = new Set<number>([target.id]);
        let cur = target;
        let dmg = lv.damage * mul;
        this.dealDamage(cur, dmg, true, t);
        for (let i = 1; i < (lv.chain ?? 1); i++) {
          pts.push({ x: cur.x, y: cur.y });
          let next: Enemy | null = null;
          let nd = Infinity;
          for (const e of this.enemies.values()) {
            if (hit.has(e.id) || e.cloaked) continue;
            const d = Math.hypot(e.x - cur.x, e.y - cur.y);
            if (d < 95 && d < nd) {
              nd = d;
              next = e;
            }
          }
          if (!next) break;
          dmg *= 0.85;
          this.dealDamage(next, dmg, true, t);
          hit.add(next.id);
          cur = next;
        }
        pts.push({ x: cur.x, y: cur.y });
        this.pushEffect({ type: 'arc', pts: jagged(pts), t: 0, life: 0.14 });
        t.fireFlash = 0.1;
        this.sfx.play('zap');
        break;
      }
      case 'amp':
        break;
      case 'bank':
        break;
    }
  }

  private step(dt: number) {
    this.elapsed += dt;
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.5);
    this.freezeFlash = Math.max(0, this.freezeFlash - dt);
    this.overdriveT = Math.max(0, this.overdriveT - dt);
    this.sfx.ambience(dayPhase(this.elapsed).daylight, dt);
    const rain = this.effRain();
    if (this.money >= 1500) this.unlock('rich');
    if (Math.abs(rain - this.lastRain) > 0.01) {
      this.lastRain = rain;
      this.sfx.setRain(rain);
    }
    this.boltT = Math.max(0, this.boltT - dt);
    if (rain > 0.75 && Math.random() < 0.05 * dt) {
      this.boltT = 0.25;
      this.shake = Math.max(this.shake, 2.5);
      this.sfx.play('thunder');
      const groundList = [...this.enemies.values()].filter(en => !en.def.flying);
      if (groundList.length) {
        const victim = groundList[Math.floor(Math.random() * groundList.length)];
        const zap = Math.max(12, victim.maxHp * 0.06);
        victim.hp -= zap;
        this.pushEffect({ type: 'ring', x: victim.x, y: victim.y, r: 30, t: 0, life: 0.5, color: '#cfe8ff' });
        this.floatText(victim.x, victim.y - 10, `-${Math.round(zap)}`, '#cfe8ff');
        if (victim.hp <= 0) this.killEnemy(victim);
      }
    }
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    this.goldRushT = Math.max(0, this.goldRushT - dt);
    for (const k of Object.keys(this.abilityCd) as AbilityId[]) {
      this.abilityCd[k] = Math.max(0, this.abilityCd[k] - dt);
    }

    while (this.queue.length && this.queue[0].at <= this.elapsed) {
      this.spawn(this.queue.shift()!);
    }

    const leaks: Enemy[] = [];
    this.leakT = Math.max(0, this.leakT - dt);
    for (const e of [...this.enemies.values()]) {
      if (e.mRegen > 0 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.mRegen * dt);
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) {
          const tw = this.towers.find(t => t.id === e.burnTowerId);
          this.killEnemy(e, tw);
          continue;
        }
      }
      if (e.shieldMax > 0) {
        e.shieldT += dt;
        if (e.shieldT > 3 && e.shieldHp < e.shieldMax) {
          e.shieldHp = Math.min(e.shieldMax, e.shieldHp + (e.def.shieldRegen ?? 20) * dt);
        }
      }
      if (e.def.enrage && !e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true;
        this.floatText(e.x, e.y - 26, 'ENRAGED', '#f87171');
        this.burst(e.x, e.y, '#f87171', 10);
      }
      if (e.def.cloakEvery) {
        e.cloakT -= dt;
        if (e.cloakT <= 0) {
          e.cloaked = !e.cloaked;
          e.cloakT = e.cloaked ? e.def.cloakTime ?? 1.8 : e.def.cloakEvery;
          if (e.cloaked) {
            this.pushEffect({ type: 'ring', x: e.x, y: e.y, r: e.def.size + 6, t: 0, life: 0.35, color: '#c084fc' });
            this.sfx.play('cloak');
          }
        }
      }
      if (e.def.slam) {
        e.slamCd -= dt;
        if (e.slamCd <= 0) {
          const s = e.def.slam;
          const hitTowers = this.towers.filter(t => Math.hypot(t.x - e.x, t.y - e.y) <= s.radius + 14);
          if (hitTowers.length > 0) {
            for (const t of hitTowers) t.stunT = s.stun;
            this.pushEffect({ type: 'ring', x: e.x, y: e.y, r: 22, t: 0, life: 0.5, color: '#f87171' });
            this.pushEffect({ type: 'ring', x: e.x, y: e.y, r: 46, t: 0, life: 0.6, color: '#fca5a5' });
            this.burst(e.x, e.y, '#f87171', 12, 140);
            this.smoke(e.x, e.y, 5);
            this.floatText(e.x, e.y - 30, 'SLAM!', '#f87171');
            this.shake = 9;
            this.sfx.play('boom');
            e.slamCd = s.every;
          } else {
            e.slamCd = 2;
          }
        }
      }

      if (e.def.disable) {
        const D = e.def.disable;
        if (e.disT > 0) {
          e.disT -= dt;
          e.beamT -= dt;
          const tw = this.towers.find(t => t.id === e.disTarget);
          if (!tw) {
            e.disT = 0;
          } else {
            if (e.beamT <= 0) {
              e.beamT = 0.14;
              this.pushEffect({ type: 'tracer', x1: e.x, y1: e.y, x2: tw.x, y2: tw.y, t: 0, life: 0.16, color: '#fb7185' });
            }
            if (e.disT <= 0) {
              tw.stunT = D.stun;
              this.burst(tw.x, tw.y, '#fb7185', 8, 60);
              this.floatText(tw.x, tw.y - 18, 'DISABLED', '#fb7185');
              this.pushEvent(`${TOWERS[tw.kind].name} disabled by a Wrecker`, '#fb7185');
              this.sfx.play('zap');
              e.disCd = D.every;
            }
          }
        } else {
          e.disCd -= dt;
          if (e.disCd <= 0) {
            let best: Tower | null = null;
            let nd = D.radius;
            for (const t of this.towers) {
              const d = Math.hypot(t.x - e.x, t.y - e.y);
              if (d < nd) {
                nd = d;
                best = t;
              }
            }
            if (best) {
              e.disTarget = best.id;
              e.disT = D.channel;
              e.beamT = 0;
              this.floatText(best.x, best.y - 18, 'JAMMING', '#fb7185');
              this.sfx.play('cloak');
            } else {
              e.disCd = 1.5;
            }
          }
        }
      }

      e.slowT = Math.max(0, e.slowT - dt);
      if (e.def.berserk && !e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true;
        this.floatText(e.x, e.y - e.def.size - 10, 'ENRAGED', '#ef4444');
        this.burst(e.x, e.y, '#ef4444', 10);
      }
      if (e.def.blinkEvery) {
        e.blinkT -= dt;
        if (e.blinkT <= 0) {
          e.blinkT = e.def.blinkEvery * (0.8 + Math.random() * 0.4);
          const wp2 = GROUND_PATH[Math.min(e.wp, GROUND_PATH.length - 1)];
          const bdx = wp2.x - e.x;
          const bdy = wp2.y - e.y;
          const bdl = Math.hypot(bdx, bdy) || 1;
          const jump = Math.min(e.def.blinkDist ?? 70, bdl);
          this.pushEffect({ type: 'soul', x: e.x, y: e.y, color: '#c4b5fd', t: 0, life: 0.5 });
          e.x += (bdx / bdl) * jump;
          e.y += (bdy / bdl) * jump;
          this.burst(e.x, e.y, '#a78bfa', 8);
        }
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.hp -= e.poisonDps * dt;
        if (e.hp <= 0) {
          const tw = this.towers.find(t2 => t2.id === e.poisonTowerId);
          for (const o of [...this.enemies.values()]) {
            if (o.id === e.id) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 70) {
              o.poisonDps = Math.max(o.poisonT > 0 ? o.poisonDps : 0, e.poisonDps * 0.5);
              o.poisonT = Math.max(o.poisonT, 2);
              o.poisonTowerId = e.poisonTowerId;
            }
          }
          this.pushEffect({ type: 'ring', x: e.x, y: e.y, r: 70, t: 0, life: 0.4, color: '#a3e635' });
          this.killEnemy(e, tw);
          continue;
        }
      }
      const path = e.def.flying ? FLY_PATH : GROUND_PATH;
      const total = e.def.flying ? FLY_LEN : GROUND_LEN;
      const next = path[Math.min(e.wp, path.length - 1)];
      const dirX = next.x - e.x;
      const dirY = next.y - e.y;
      if (Math.abs(dirX) + Math.abs(dirY) > 0.01) e.ang = Math.atan2(dirY, dirX);
      let step = e.disT > 0 ? 0 : e.def.speed * e.mSpeed * (e.enraged ? 1.5 : 1) * (e.slowT > 0 ? e.slowFactor : 1) * (!e.def.flying && this.effRain() > 0.5 ? 0.92 : 1) * dt;
      while (step > 0 && e.wp < path.length) {
        const wp = path[e.wp];
        const dx = wp.x - e.x;
        const dy = wp.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= step) {
          e.x = wp.x;
          e.y = wp.y;
          e.traveled += d;
          step -= d;
          e.wp++;
        } else {
          e.x += (dx / d) * step;
          e.y += (dy / d) * step;
          e.traveled += step;
          step = 0;
        }
      }
      e.progress = Math.min(1, e.traveled / total);
      if (e.def.healRadius) {
        let healed = false;
        for (const o of this.enemies.values()) {
          if (o.id === e.id || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) <= e.def.healRadius) {
            o.hp = Math.min(o.maxHp, o.hp + (e.def.healAmount ?? 0) * dt);
            healed = true;
          }
        }
        e.healPulse = healed ? 0.4 : Math.max(0, e.healPulse - dt);
      }
      if (e.wp >= path.length) leaks.push(e);
    }
    if (this.barrels.length) {
      for (const e of [...this.enemies.values()]) {
        if (e.def.flying) continue;
        for (const b of [...this.barrels]) {
          if (Math.hypot(e.x - b.x, e.y - b.y) < 15) {
            this.explodeBarrel(b);
            break;
          }
        }
      }
    }
    if (this.coins.length) {
      for (const c of this.coins) c.t += dt;
      this.coins = this.coins.filter(c => c.t < 7);
    }
    for (const e of leaks) {
      this.enemies.delete(e.id);
      this.lives -= e.def.leak;
      this.runStats.leaks += e.def.leak;
      this.shake = 7;
      this.dmgFlash = 0.7;
      this.leakT = 1.3;
      this.leakPos = { x: e.x, y: e.y };
      this.combo = 0;
      this.comboT = 0;
      this.sfx.play('leak');
    }
    if (this.lives > 0 && this.lives <= 5) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.95;
        this.sfx.play('heart');
      }
    }
    if (this.lives <= 0 && this.state === 'playing') {
      this.lives = 0;
      this.gameOver();
      return;
    }

    const rateMul = this.overdriveT > 0 ? 1.6 : 1;
    for (const t of this.towers) {
      t.fireFlash = Math.max(0, t.fireFlash - dt);
      t.recoil = Math.max(0, t.recoil - dt * 7);
      if (t.stunT > 0) {
        t.stunT -= dt;
        if (Math.random() < 7 * dt) {
          this.pushEffect({
            type: 'part', x: t.x + (Math.random() - 0.5) * 16, y: t.y + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14,
            size: 2.4, color: '#fb7185', t: 0, life: 0.55, grav: 6,
          });
        }
        continue;
      }
      if (t.kind === 'amp' || t.kind === 'bank') continue;
      if (t.kind === 'prism') t.beamHeat = Math.max(0, t.beamHeat - dt * 0.7);
      t.cd -= dt;
      if (t.cd > 0) continue;
      const lv = TOWERS[t.kind].levels[t.level];
      const target = this.findTarget(t, lv.range);
      if (!target) {
        t.cd = 0;
        continue;
      }
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      this.fire(t, lv, target);
      t.cd = 1 / (lv.rate * rateMul);
    }

    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const target = this.enemies.get(p.targetId);
      if (target) {
        p.tx = target.x;
        p.ty = target.y;
      }
      if (p.kind === 'missile') {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.035;
          this.pushEffect({ type: 'part', x: p.x, y: p.y, vx: 0, vy: 0, size: 2.4, color: '#94a3b8', t: 0, life: 0.45 });
        }
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 2) {
        p.x = p.tx;
        p.y = p.ty;
        if (p.splash > 0) {
          if (p.kind === 'missile') {
            for (const e of [...this.enemies.values()]) {
              if (e.cloaked) continue;
              if (Math.hypot(e.x - p.x, e.y - p.y) <= p.splash + e.def.size) {
                this.dealDamage(e, p.damage, false, p.tower);
              }
            }
          } else {
            this.splashDamage(p.x, p.y, p.splash, p.damage, p.tower);
          }
          this.pushEffect({ type: 'explosion', x: p.x, y: p.y, r: p.splash, t: 0, life: 0.3 });
          this.pushEffect({ type: 'ring', x: p.x, y: p.y, r: p.splash * 0.4, t: 0, life: 0.4, color: '#ffd9a0' });
          this.smoke(p.x, p.y, 4);
          this.burst(p.x, p.y, '#fdba74', 6);
          this.sfx.play('boom');
          continue;
        }
        if (target && this.enemies.has(target.id)) {
          this.dealDamage(target, p.damage, false, p.tower);
          if (this.enemies.has(target.id)) {
            this.burst(p.x, p.y, p.color, 3, 40);
            if (p.kind === 'venom') {
              const lvV = TOWERS.venom.levels[p.tower.level];
              target.poisonDps = Math.max(target.poisonT > 0 ? target.poisonDps : 0, (lvV.poison ?? 0) * this.damageMul(p.tower));
              target.poisonT = Math.max(target.poisonT, lvV.poisonTime ?? 3);
              target.poisonTowerId = p.tower.id;
              this.pushEffect({ type: 'ring', x: p.x, y: p.y, r: 14, t: 0, life: 0.3, color: '#a3e635' });
            }
            if (p.slowTime > 0) {
              if (!target.def.slowImmune) {
                target.slowFactor = target.slowT > 0 ? Math.min(target.slowFactor, p.slowFactor) : p.slowFactor;
                target.slowT = Math.max(target.slowT, p.slowTime);
              }
            }
          }
          if (p.kind === 'frost') {
            this.pushEffect({ type: 'ring', x: p.x, y: p.y, r: 16, t: 0, life: 0.25, color: '#a5f3fc' });
          }
          continue;
        }
        if (p.kind === 'gun') {
          let best: Enemy | null = null;
          let nd = 70;
          for (const e of this.enemies.values()) {
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
            if (dd < nd) {
              nd = dd;
              best = e;
            }
          }
          if (best) {
            p.targetId = best.id;
            keep.push(p);
          }
        }
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      keep.push(p);
    }
    this.projectiles = keep;

    if (this.waveSpawned && this.queue.length === 0 && this.enemies.size === 0) {
      this.waveSpawned = false;
      const bonus = CLEAR_BONUS_BASE + this.wave * CLEAR_BONUS_PER_WAVE;
      this.money += bonus;
      this.score += 30 + this.wave * 2;
      let vaultIncome = 0;
      for (const t of this.towers) {
        if (t.kind === 'bank') vaultIncome += TOWERS.bank.levels[t.level].income ?? 0;
      }
      if (vaultIncome > 0) {
        this.money += vaultIncome;
        this.score += Math.floor(vaultIncome / 4);
        this.floatText(W / 2, 118, `Vaults +$${vaultIncome}`, '#fbbf24');
      }
      const interest = Math.min(INTEREST_CAP, Math.floor(this.money * INTEREST_RATE));
      this.money += interest;
      this.floatText(W / 2, 100, `Wave ${this.wave} cleared  +$${bonus}${interest > 0 ? `  +$${interest} interest` : ''}`, '#fde047');
      this.fireworksShow(W / 2, H / 2, 3, 420);
      if (this.wave % 5 === 0) {
        for (const k of Object.keys(this.abilityCd) as AbilityId[]) this.abilityCd[k] = 0;
        this.money += 40;
        this.floatText(W / 2, 62, 'SECOND WIND — abilities refreshed  +$40', '#93c5fd');
        this.pushEvent('Second Wind! Abilities refreshed (+$40)', '#93c5fd');
        this.sfx.play('ability');
      }
      if (Math.random() < 0.55) {
        const kind = KIND_KEYS[Math.floor(Math.random() * KIND_KEYS.length)];
        this.dealKind = kind;
        this.dealPrice = Math.floor(TOWERS[kind].levels[0].cost * 0.7);
        this.floatText(W / 2, 78, `DEAL: ${TOWERS[kind].name} for $${this.dealPrice} — ends when the next wave starts`, '#fbbf24');
        this.pushEvent(`Deal: ${TOWERS[kind].name} for $${this.dealPrice} (this intermission)`, '#fbbf24');
      } else {
        this.dealKind = null;
      }
      if (!this.endless && this.wave >= this.finalWave) {
        this.score += Math.floor(this.money);
        this.victory();
        return;
      }
      if (this.autoStart) this.countdown = 12;
    }
    if (this.countdown > 0 && this.state === 'playing') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.beginWave();
      }
    }
  }

  private buildRenderState(): RenderState {
    let ghost: GhostInfo | null = null;
    if (this.state === 'playing' && this.selKind && this.hoverCell) {
      const def = TOWERS[this.selKind];
      ghost = {
        gx: this.hoverCell.gx,
        gy: this.hoverCell.gy,
        valid: this.canBuild(this.hoverCell.gx, this.hoverCell.gy) && this.money >= this.placeCost(this.selKind),
        range: this.selKind === 'amp' ? def.levels[0].aura!.range : def.levels[0].range,
        color: def.color,
      };
    }
    return {
      towers: this.towers,
      enemies: [...this.enemies.values()],
      projectiles: this.projectiles,
      effects: this.effects,
      selTowerId: this.selTower,
      hoverPoint: this.hoverPoint,
      pendingAirstrike: this.pendingAirstrike,
      overdrive: this.overdriveT > 0,
      shake: this.shake,
      freezeFlash: this.freezeFlash,
      dmgFlash: this.dmgFlash,
      lowLives: this.lives > 0 && this.lives <= 5,
      elapsed: this.elapsed,
      weatherRain: this.effRain(),
      showRanges: this.showRanges,
      barrels: this.barrels.map(b => ({ x: b.x, y: b.y })),
      coins: this.coins.map(c => ({ id: c.id, x: c.x, y: c.y, t: c.t })),
      volume: this.volume,
      weather: this.weather,
      photo: this.photoMode,
      ghost,
      countdown: this.countdown,
      nextWaveNum: this.wave + 1,
      leak: this.leakT > 0 && this.leakPos ? { x: this.leakPos.x, y: this.leakPos.y, t: this.leakT } : null,
      focusId: this.focusId,
      bolt: this.boltT,
      banner: this.bannerT > 0 ? { num: this.wave, label: this.bannerLabel, t: this.bannerT } : null,
      events: this.events
        .map(ev => ({ text: ev.text, color: ev.color, t: this.elapsed - ev.at }))
        .filter(ev => ev.t < 5.5),
    };
  }

  recenterCamera() {
    this.renderer.recenter();
  }

  private getSnapshot(): UiSnapshot {
    const t = this.selTower !== null ? this.towers.find(x => x.id === this.selTower) ?? null : null;
    let selTower: UiSnapshot['selTower'] = null;
    if (t) {
      const def = TOWERS[t.kind];
      const lv = def.levels[t.level];
      const nextLv = t.level < 2 ? def.levels[t.level + 1] : null;
      const specials: string[] = [];
      if (lv.burnDps) specials.push(`Burn ${lv.burnDps}/s for ${lv.burnTime}s (ignores armor & shields)`);
      if (lv.income) specials.push(`Generates $${lv.income} at the end of each wave`);
      if (def.airOnly) specials.push('Anti-air only');
      if (lv.aura) specials.push(`Aura: +${Math.round(lv.aura.dmgPct * 100)}% damage within ${lv.aura.range}px`);
      if (lv.pierce) specials.push('Armor pierce');
      const veteran = Math.min(3, Math.floor(t.kills / 15));
      if (veteran > 0) specials.push(`Veteran: +${veteran * 5}% damage (${t.kills} kills)`);
      selTower = {
        id: t.id, kind: t.kind, name: def.name, level: t.level + 1, targeting: t.targeting,
        damage: lv.damage, rate: lv.rate, range: lv.range,
        splash: lv.splash ?? 0, chain: lv.chain ?? 0,
        slow: lv.slowFactor ? `${Math.round((1 - lv.slowFactor) * 100)}% / ${lv.slowTime}s` : '',
        pierce: !!lv.pierce,
        special: specials.join(' · '),
        upgradeCost: nextLv?.cost ?? 0,
        canUpgrade: !!nextLv && this.money >= nextLv.cost,
        sellValue: this.elapsed - t.placedAt < 10 ? t.spent : Math.floor(t.spent * SELL_RATIO),
        kills: t.kills, totalDamage: Math.round(t.damage),
        veteran,
      };
    }
    return {
      state: this.state, money: Math.floor(this.money), lives: this.lives,
      wave: this.wave, score: this.score, speed: this.speed, muted: this.muted,
      weather: this.weather,
      photo: this.photoMode,
      boss: (() => {
        for (const en of this.enemies.values()) {
          if (en.def.kind === 'boss') return { name: en.def.name, hp: Math.max(0, en.hp), maxHp: en.maxHp };
        }
        return null;
      })(),
      towersMini: this.towers.map(t => ({ x: t.x, y: t.y, kind: t.kind })),
      enemiesMini: [...this.enemies.values()].map(en => ({ x: en.x, y: en.y, boss: en.def.kind === 'boss' })),
      runStats: { ...this.runStats },
      showRanges: this.showRanges,
      gfxHigh: this.gfxHigh,
      volume: this.volume,
      endless: this.endless, difficulty: this.difficulty, highScore: this.highScore,
      autoStart: this.autoStart,
      waveActive: this.waveSpawned,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      canCall: this.state === 'playing' && (this.endless || this.wave < this.finalWave),
      callBonus: this.waveSpawned ? STACK_BONUS : Math.max(2, Math.ceil(this.countdown) * 2),
      selKind: this.selKind,
      selTower,
      nextWave: wavePreview(Math.min(this.wave + 1, this.finalWave)),
      abilities: ABILITIES.map(a => ({
        id: a.id, name: a.name, key: a.key, desc: a.desc, max: a.cd,
        cd: Math.ceil(this.abilityCd[a.id]),
        ready: this.abilityCd[a.id] <= 0,
        pending: a.id === 'airstrike' && this.pendingAirstrike,
        active: (a.id === 'overdrive' && this.overdriveT > 0) || (a.id === 'goldrush' && this.goldRushT > 0),
      })),
      deal: this.dealKind ? { kind: this.dealKind, price: this.dealPrice } : null,
      combo: this.combo,
      comboMul: 1 + Math.min(1, this.combo * 0.02),
      campaignOn: this.campaignOn,
      campaignPlay: this.campaignOn && this.storyId && (this.state === 'playing' || this.state === 'paused')
        ? {
            story: getStory(this.storyId).name,
            color: getStory(this.storyId).color,
            level: getStory(this.storyId).levels[this.levelIdx].name,
            levelNum: this.levelIdx + 1,
            waveIn: this.wave - this.levelBase + 1,
            waves: WAVES_PER_LEVEL,
          }
        : null,
      campaign: (this.state === 'stories' || this.state === 'levels' || this.state === 'briefing')
        ? {
            screen: this.state,
            stories: STORIES.map(s => ({ id: s.id, name: s.name, blurb: s.blurb, color: s.color, cleared: Math.min(10, (this.progress[s.id] ?? -1) + 1) })),
            selStory: this.storyId,
            levels: this.storyId
              ? getStory(this.storyId).levels.map((lv, i) => ({
                  name: lv.name,
                  locked: i > (this.progress[this.storyId!] ?? -1) + 1,
                  cleared: i <= (this.progress[this.storyId!] ?? -1),
                  stars: levelStars(this.storyId!, i),
                }))
              : [],
            levelName: this.storyId ? getStory(this.storyId).levels[this.levelIdx]?.name ?? '' : '',
            intro: this.storyId ? getStory(this.storyId).levels[this.levelIdx]?.intro ?? '' : '',
            levelNum: this.levelIdx + 1,
          }
        : null,
      campaignResult: this.state === 'victory' ? this.lastResult : null,
    };
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.state !== 'playing') return;
    const p = this.renderer.pick(e);
    this.hoverPoint = p;
    this.hoverCell = p ? { gx: Math.floor(p.x / CELL), gy: Math.floor(p.y / CELL) } : null;
  };

  private onPointerLeave = () => {
    this.hoverPoint = null;
    this.hoverCell = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downClient = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    const down = this.downClient;
    this.downClient = null;
    if (!down) return;
    if (this.photoMode) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    if (this.state !== 'playing') return;
    if (e.button === 2) {
      this.selKind = null;
      this.selTower = null;
      this.focusId = null;
      this.pendingAirstrike = false;
      this.glCanvas.style.cursor = 'default';
      this.emit();
      return;
    }
    const pos = this.renderer.pick(e);
    if (!pos) return;
    this.hoverPoint = pos;
    this.hoverCell = { gx: Math.floor(pos.x / CELL), gy: Math.floor(pos.y / CELL) };
    const near = this.coins.filter(c => Math.hypot(c.x - pos.x, c.y - pos.y) < 30);
    if (near.length) {
      let total = 0;
      for (const c of near) {
        total += c.amount;
        this.coins = this.coins.filter(x => x.id !== c.id);
      }
      this.money += total;
      this.floatText(pos.x, pos.y, `+$${total}`, '#fde047');
      this.sfx.play('coin');
      this.emit();
      return;
    }
    if (this.pendingAirstrike) {
      this.pendingAirstrike = false;
      this.glCanvas.style.cursor = 'default';
      this.castAirstrike(pos);
      this.emit();
      return;
    }
    const gx = this.hoverCell.gx;
    const gy = this.hoverCell.gy;
    if (this.selKind) {
      const def = TOWERS[this.selKind];
      const cost = this.placeCost(this.selKind);
      if (!this.canBuild(gx, gy)) {
        this.floatText(pos.x, pos.y, 'Blocked', '#f87171');
        this.sfx.play('error');
      } else if (this.money < cost) {
        this.floatText(pos.x, pos.y, 'Not enough gold', '#f87171');
        this.sfx.play('error');
      } else {
        this.money -= cost;
        const t = ghostTower(this.selKind, gx, gy);
        t.id = this.nextId++;
        t.spent = cost;
        t.placedAt = this.elapsed;
        this.towers.push(t);
        this.runStats.built++;
        this.burst(t.x, t.y, def.color, 10, 60);
        this.sfx.play('place');
      }
    } else {
      const t = this.towers.find(x => x.gx === gx && x.gy === gy);
      if (t) {
        this.selTower = t.id;
        this.focusId = null;
      } else {
        let best: Enemy | null = null;
        let nd = 30;
        for (const e of this.enemies.values()) {
          const d = Math.hypot(e.x - pos.x, e.y - pos.y);
          if (d < nd + e.def.size) {
            nd = d;
            best = e;
          }
        }
        this.focusId = best ? best.id : null;
        this.selTower = null;
      }
      this.emit();
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key.startsWith('Arrow')) {
      this.panKeys.add(e.key);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.photoMode) {
        this.photoMode = false;
        this.emit();
        return;
      }
      const hadSel = this.selKind !== null || this.selTower !== null || this.focusId !== null || this.pendingAirstrike;
      this.selKind = null;
      this.selTower = null;
      this.focusId = null;
      this.pendingAirstrike = false;
      this.glCanvas.style.cursor = 'default';
      if (!hadSel) this.togglePause();
      this.emit();
      return;
    }
    if (this.state !== 'playing') return;
    if (k >= '1' && k <= '8') {
      e.preventDefault();
      const kind = KIND_KEYS[Number(k) - 1];
      this.selectKind(this.selKind === kind ? null : kind);
    } else if (k === ' ') {
      e.preventDefault();
      this.callEarly();
    } else if (k === 'a') {
      this.castAbility('airstrike');
    } else if (k === 's') {
      this.castAbility('cryo');
    } else if (k === 'd') {
      this.castAbility('overdrive');
    } else if (k === 'f') {
      this.castAbility('repair');
    } else if (k === 'g') {
      this.castAbility('goldrush');
    } else if (k === 'p') {
      this.togglePause();
    } else if (k === 'u') {
      this.upgradeSelected();
    } else if (k === 'x') {
      this.sellSelected();
    } else if (k === 'm') {
      this.toggleMute();
    } else if (k === 'q') {
      this.setTargeting('first');
    } else if (k === 'w') {
      this.setTargeting('last');
    } else if (k === 'e') {
      this.setTargeting('strong');
    } else if (k === 'r') {
      this.setTargeting('close');
    }
  };

  private loop = (ts: number) => {
    const dt = Math.min(0.05, (ts - this.last) / 1000 || 0);
    this.last = ts;
    this.slowMoT = Math.max(0, this.slowMoT - dt);
    const timeScale = this.slowMoT > 0 ? 0.35 : 1;
    if (this.panKeys.size && (this.state === 'playing' || this.state === 'paused')) {
      const ps = 640 * dt;
      let dx = 0;
      let dy = 0;
      if (this.panKeys.has('ArrowUp')) dy -= ps;
      if (this.panKeys.has('ArrowDown')) dy += ps;
      if (this.panKeys.has('ArrowLeft')) dx -= ps;
      if (this.panKeys.has('ArrowRight')) dx += ps;
      if (dx || dy) this.renderer.nudgePan(dx, dy);
    }
    if (this.state === 'playing') {
      let rem = dt * this.speed * timeScale;
      while (rem > 0) {
        const s = Math.min(0.033, rem);
        this.step(s);
        rem -= s;
        if (this.state !== 'playing') break;
      }
    }
    this.tickEffects(dt);
    this.uiAcc += dt;
    if (this.uiAcc > 0.12) {
      this.uiAcc = 0;
      this.emit();
    }
    this.renderer.update(this.buildRenderState());
    this.raf = requestAnimationFrame(this.loop);
  };
}

function jagged(pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push(a);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = (Math.random() - 0.5) * 14;
    out.push({ x: mx + (-dy / len) * off, y: my + (dx / len) * off });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
