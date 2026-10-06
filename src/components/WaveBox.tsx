import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { ENEMIES } from '../game/config';
import { waveModifier } from '../game/waves';

export function WaveBox({ ui, game }: { ui: UiSnapshot; game: Game }) {
  const next = ui.wave + 1;
  const mod = waveModifier(next);
  const cp = ui.campaignPlay;
  const nextIn = cp ? Math.min(cp.waveIn + 1, cp.waves) : null;
  return (
    <div className="card">
      <div className="row">
        <h3>Incoming — Wave {next}</h3>
        {ui.waveActive && <span className="tag">in progress</span>}
      </div>
      {cp && (
        <div className="mod-line" style={{ color: cp.color, fontWeight: 700 }}>
          {cp.story} · L{cp.levelNum} {cp.level} — wave {nextIn}/{cp.waves}
        </div>
      )}
      {mod && (
        <div className="mod-line">
          <span className="badge" style={{ borderColor: mod.tint, color: mod.tint }}>{mod.name}</span>
          <span>{mod.desc}</span>
        </div>
      )}
      <ul className="wave-list">
        {ui.nextWave.map(e => {
          const d = ENEMIES[e.kind];
          return (
            <li key={e.kind}>
              <span className="dot" style={{ background: d.color }} />
              {d.name} ×{e.count}
              {d.flying && <span className="badge air">air</span>}
              {d.shieldHp && <span className="badge shield">shield</span>}
              {d.spawnOnDeath && <span className="badge split">splits</span>}
              {d.enrage && <span className="badge enrage">enrages</span>}
              {d.armor > 0 && <span className="badge">armor {d.armor}</span>}
            </li>
          );
        })}
      </ul>
      <button className="primary wide" disabled={!ui.canCall} onClick={() => game.callEarly()}>
        {ui.waveActive
          ? `Call next wave  +$${ui.callBonus}`
          : ui.countdown > 0
            ? `Start now  +$${ui.callBonus}`
            : `Start wave ${next}`}
      </button>
      {ui.countdown > 0 && !ui.waveActive && <div className="cd">Auto-start in {ui.countdown}s · 4% interest on saved gold</div>}
      <label className="check">
        <input type="checkbox" checked={ui.autoStart} onChange={e => game.setAutoStart(e.target.checked)} />
        Auto-start waves
      </label>
    </div>
  );
}
