import { useEffect, useRef, useState } from 'react';
import { Game } from './game/engine';
import type { UiSnapshot } from './game/types';
import { preloadPhotoTextures } from './game/textures';
import { Hud } from './components/Hud';
import { Shop } from './components/Shop';
import { TowerPanel } from './components/TowerPanel';
import { WaveBox } from './components/WaveBox';
import { Overlay } from './components/Overlay';
import { MiniMap } from './components/MiniMap';

export default function App() {
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [ui, setUi] = useState<UiSnapshot | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [waveOpen, setWaveOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);

  useEffect(() => {
    const gl = glRef.current;
    const overlay = overlayRef.current;
    if (!gl || !overlay) return;
    let g: Game | null = null;
    let cancelled = false;
    preloadPhotoTextures().finally(() => {
      if (cancelled || !gl || !overlay) return;
      g = new Game(gl, overlay);
      g.onUi = setUi;
      g.emit();
      setGame(g);
    });
    return () => {
      cancelled = true;
      g?.destroy();
      setGame(null);
    };
  }, []);

  return (
    <div className={`app${ui && ui.state === 'playing' && ui.photo ? ' photo' : ''}`}>
      {game && ui && <Hud ui={ui} game={game} open={hudOpen} />}
      <div
        className="canvas-stack"
        onPointerDown={() => {
          setPanelOpen(false);
          setWaveOpen(false);
          setHudOpen(false);
        }}
      >
        <canvas ref={glRef} className="gl-canvas" />
        <canvas ref={overlayRef} className="fx-canvas" />
      </div>
      {game && ui && (
        <>
          <div className={`hud-mini${hudOpen ? ' hidden' : ''}`}>
            <span className="mini-lives">♥ {ui.lives}</span>
            <span className="mini-gold">${ui.money}</span>
          </div>
          {ui.state === 'playing' && !ui.photo && <MiniMap ui={ui} game={game} />}
          {ui.boss && (
            <div className="boss-toast">
              <span className="boss-name">{ui.boss.name}</span>
              <div className="boss-track"><div className="boss-fill" style={{ width: `${Math.max(0, Math.min(100, (ui.boss.hp / ui.boss.maxHp) * 100))}%` }} /></div>
            </div>
          )}
          <button className="cam-recenter" onClick={() => game.recenterCamera()} title="Re-center camera">⌖</button>
          <button className={`hud-toggle${hudOpen ? ' open' : ''}`} onClick={() => setHudOpen(v => !v)}>
            {hudOpen ? 'Hide stats ▴' : 'Stats ▾'}
          </button>
          <div className="sheet-toggles">
            <button className={`sheet-toggle${panelOpen ? ' open' : ''}`} onClick={() => { setPanelOpen(v => !v); setWaveOpen(false); }}>
              {panelOpen ? 'Towers ▾' : 'Towers ▴'}
            </button>
            <button className={`sheet-toggle${waveOpen ? ' open' : ''}`} onClick={() => { setWaveOpen(v => !v); setPanelOpen(false); }}>
              {waveOpen ? 'Wave ▾' : 'Wave ▴'}
            </button>
          </div>
          <div className="panel-col">
            <aside className={`sheet wave-panel${waveOpen ? ' open' : ''}`}>
              <WaveBox ui={ui} game={game} />
            </aside>
            <aside className={`sheet towers-panel${panelOpen ? ' open' : ''}`}>
              <Shop ui={ui} game={game} />
              <TowerPanel ui={ui} game={game} />
              <div className="help card">
                <h3>Hotkeys</h3>
                <div className="keys">
                  <span><b>1–9</b> towers</span>
                  <span><b>Space</b> call wave</span>
                  <span><b>A/S/D/F/G</b> abilities</span>
                  <span><b>U</b> upgrade</span>
                  <span><b>X</b> sell</span>
                  <span><b>Q/W/E/R</b> targeting</span>
                  <span><b>P</b> pause</span>
                  <span><b>Esc</b> cancel / pause</span>
                  <span><b>M</b> mute</span>
                  <span><b>Drag</b> orbit camera</span>
                  <span><b>Click enemy</b> focus fire</span>
                  <span><b>Wheel</b> zoom</span>
                </div>
              </div>
            </aside>
          </div>
          <Overlay ui={ui} game={game} />
        </>
      )}
    </div>
  );
}
