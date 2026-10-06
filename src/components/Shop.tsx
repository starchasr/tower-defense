import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { TOWER_LIST } from '../game/config';

export function Shop({ ui, game }: { ui: UiSnapshot; game: Game }) {
  return (
    <div className="card">
      <h3>Build Towers</h3>
      {ui.deal && (
        <div className="deal" onClick={() => game.selectKind(ui.deal!.kind)}>
          <span className="deal-tag">DEAL</span>
          <span className="deal-text">
            <b>{TOWER_LIST.find(t => t.kind === ui.deal!.kind)?.name}</b> ${ui.deal.price}
            <i> — ends when the next wave starts</i>
          </span>
        </div>
      )}
      <div className="shop-grid">
        {TOWER_LIST.map((def, i) => {
          const cost = ui.deal?.kind === def.kind ? ui.deal.price : def.levels[0].cost;
          return (
            <button
              key={def.kind}
              className={`tower-card ${ui.selKind === def.kind ? 'selected' : ''} ${ui.money < cost ? 'poor' : ''}`}
              onClick={() => game.selectKind(ui.selKind === def.kind ? null : def.kind)}
            >
              <div className="tc-head">
                <span className="swatch" style={{ background: def.color }} />
                <span className="tc-name">{def.name}</span>
                <span className={`tc-cost ${ui.deal?.kind === def.kind ? 'deal-price' : ''}`}>${cost}</span>
                <span className="tc-key">{i + 1}</span>
              </div>
              <div className="tc-desc">{def.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
