import { useEffect, useRef, useState } from 'react';
import { Game } from './game/engine';
import type { UiSnapshot } from './game/types';
import { preloadPhotoTextures } from './game/textures';
import { Hud } from './components/Hud';
import { Shop } from './components/Shop';
import { TowerPanel } from './components/TowerPanel';
import { WaveBox } from './components/WaveBox';
import { Overlay } from './components/Overlay';

export default function App() {
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [ui, setUi] = useState<UiSnapshot | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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
    <div className="app">
      {game && ui && <Hud ui={ui} game={game} />}
      <div className="canvas-stack">
        <canvas ref={glRef} className="gl-canvas" />
        <canvas ref={overlayRef} className="fx-canvas" />
      </div>
      {game && ui && (
        <>
          <button className={`panel-toggle${panelOpen ? ' open' : ''}`} onClick={() => setPanelOpen(v => !v)}>
            {panelOpen ? 'Hide ▾' : 'Towers ▴'}
          </button>
          <aside className={`panel${panelOpen ? ' open' : ''}`}>
            <WaveBox ui={ui} game={game} />
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
          <Overlay ui={ui} game={game} />
        </>
      )}
    </div>
  );
}
