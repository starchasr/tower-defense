import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { FINAL_WAVE } from '../game/config';
import { hpScale } from '../game/waves';

export function Hud({ ui, game }: { ui: UiSnapshot; game: Game }) {
  return (
    <div className="hud">
      <span className="stat lives">Lives {ui.lives}</span>
      <span className="stat gold">Gold {ui.money}</span>
      <span className="stat">
        Wave {Math.max(ui.wave, 1)}{ui.endless ? ` · HP ×${hpScale(Math.max(ui.wave, 1)).toFixed(1)}` : `/${FINAL_WAVE}`}
      </span>
      <span className="stat">Score {ui.score}</span>
      {ui.combo >= 5 && <span className="combo">COMBO ×{ui.combo} (+{Math.round((ui.comboMul - 1) * 100)}%)</span>}
      <div className="spacer" />
      <div className="abilities">
        {ui.abilities.map(a => (
          <button
            key={a.id}
            title={a.desc}
            className={`ability-btn ${a.pending ? 'pending' : ''} ${a.active ? 'active' : ''}`}
            disabled={!a.ready || ui.state !== 'playing'}
            onClick={() => game.castAbility(a.id)}
          >
            <span className="ab-key">{a.key}</span> {a.name}
            {!a.ready && <span className="ab-cd">{a.cd}s</span>}
          </button>
        ))}
      </div>
      <div className="speeds">
        {[1, 2, 3].map(s => (
          <button key={s} className={ui.speed === s ? 'on' : ''} onClick={() => game.setSpeed(s)}>{s}x</button>
        ))}
      </div>
      <button className="icon" onClick={() => game.togglePause()}>{ui.state === 'paused' ? 'Resume' : 'Pause'}</button>
      <button className="icon" onClick={() => game.cycleWeather()}>Rain {ui.weather === 'auto' ? 'auto' : ui.weather === 'clear' ? 'off' : 'on'}</button>
      <button className="icon" onClick={() => game.toggleMute()}>Sound {ui.muted ? 'off' : 'on'}</button>
    </div>
  );
}
