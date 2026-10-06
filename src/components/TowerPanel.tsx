import type { Game } from '../game/engine';
import type { TargetMode, UiSnapshot } from '../game/types';

const MODES: { id: TargetMode; label: string }[] = [
  { id: 'first', label: 'First' },
  { id: 'last', label: 'Last' },
  { id: 'strong', label: 'Strong' },
  { id: 'close', label: 'Close' },
];

export function TowerPanel({ ui, game }: { ui: UiSnapshot; game: Game }) {
  const t = ui.selTower;
  if (!t) return null;
  return (
    <div className="card">
      <div className="row">
        <h3>{t.name} <span className="lvl">Lv {t.level}</span></h3>
      </div>
      <div className="stats">
        <div>Damage <b>{t.damage}</b></div>
        <div>Rate <b>{t.rate}/s</b></div>
        <div>Range <b>{t.range}</b></div>
        {t.splash > 0 && <div>Splash <b>{t.splash}</b></div>}
        {t.chain > 0 && <div>Chain <b>{t.chain}</b></div>}
        {t.slow && <div>Slow <b>{t.slow}</b></div>}
        <div>Kills <b>{t.kills}</b></div>
        <div>Dealt <b>{t.totalDamage}</b></div>
        <div>Sell <b>${t.sellValue}</b></div>
      </div>
      {t.special && <div className="special">{t.special}</div>}
      <div className="modes">
        {MODES.map(m => (
          <button key={m.id} className={t.targeting === m.id ? 'on' : ''} onClick={() => game.setTargeting(m.id)}>{m.label}</button>
        ))}
      </div>
      <div className="row gap">
        <button className="primary grow" disabled={!t.canUpgrade} onClick={() => game.upgradeSelected()}>
          {t.level >= 3 ? 'Max level' : `Upgrade $${t.upgradeCost}`}
        </button>
        <button className="danger" onClick={() => game.sellSelected()}>Sell</button>
      </div>
    </div>
  );
}
