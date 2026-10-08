import type { ReactNode } from 'react';
import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { TOWER_LIST, TOWERS } from '../game/config';

function Ico({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const TOWER_ICON: Record<string, ReactNode> = {
  gun: (
    <Ico>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Ico>
  ),
  cannon: (
    <Ico>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </Ico>
  ),
  frost: (
    <Ico>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    </Ico>
  ),
  sniper: (
    <Ico>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Ico>
  ),
  tesla: (
    <Ico>
      <path d="M13 2L5 13h6l-2 9 9-12h-6l1-8z" fill="currentColor" stroke="none" />
    </Ico>
  ),
  flame: (
    <Ico>
      <path d="M12 3c3 4 6 6.7 6 10a6 6 0 01-12 0c0-3.3 3-6 6-10z" />
      <path d="M12 21a3 3 0 01-3-3c0-1.8 1.5-3 3-4.5 1.5 1.5 3 2.7 3 4.5a3 3 0 01-3 3z" fill="currentColor" stroke="none" />
    </Ico>
  ),
  missile: (
    <Ico>
      <path d="M12 21V5" />
      <path d="M6.5 11.5L12 4l5.5 7.5" />
    </Ico>
  ),
  amp: (
    <Ico>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14" />
    </Ico>
  ),
  bank: (
    <Ico>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 6.5v11M14.6 9.2c0-1.1-1.2-1.9-2.6-1.9s-2.6.8-2.6 1.9 1.1 1.6 2.6 1.9 2.6.9 2.6 2-1.2 1.9-2.6 1.9-2.6-.8-2.6-1.9" />
    </Ico>
  ),
  mortar: (
    <Ico>
      <path d="M4 20h16" />
      <path d="M6 20l7-13 5 3-6 10" />
      <circle cx="13.5" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
    </Ico>
  ),
  venom: (
    <Ico>
      <path d="M12 3c3.5 4.5 5.5 7 5.5 10a5.5 5.5 0 01-11 0c0-3 2-5.5 5.5-10z" />
      <path d="M9.5 13.5c1.5 1 3.5 1 5 0" />
    </Ico>
  ),
  prism: (
    <Ico>
      <path d="M12 3l7 12H5l7-12z" />
      <path d="M8.5 20h7" />
      <path d="M12 15v5" />
    </Ico>
  ),
};

export function Shop({ ui, game }: { ui: UiSnapshot; game: Game }) {
  const selDef = ui.selKind ? TOWERS[ui.selKind] : null;
  return (
    <div className="card">
      <h3>Build Towers</h3>
      {ui.deal && (
        <div className="deal" onClick={() => game.selectKind(ui.deal!.kind)}>
          <span className="deal-tag">DEAL</span>
          <span className="deal-text">
            <b>{TOWER_LIST.find(t => t.kind === ui.deal!.kind)?.name}</b> ${ui.deal.price}
          </span>
        </div>
      )}
      <div className="shop-grid">
        {TOWER_LIST.map((def, i) => {
          const cost = ui.deal?.kind === def.kind ? ui.deal.price : def.levels[0].cost;
          return (
            <button
              key={def.kind}
              className={`tower-tile ${ui.selKind === def.kind ? 'selected' : ''} ${ui.money < cost ? 'poor' : ''}`}
              title={`${def.name} — ${def.desc}`}
              onClick={() => game.selectKind(ui.selKind === def.kind ? null : def.kind)}
            >
              <span className="ti-key">{i + 1}</span>
              <span className="ti" style={{ color: def.color }}>{TOWER_ICON[def.kind]}</span>
              <span className={`ti-cost ${ui.deal?.kind === def.kind ? 'deal-price' : ''}`}>${cost}</span>
            </button>
          );
        })}
      </div>
      {selDef && (
        <div className="shop-hint">
          <b style={{ color: selDef.color }}>{selDef.name}</b> — {selDef.desc}. Click the map to place.
        </div>
      )}
    </div>
  );
}
