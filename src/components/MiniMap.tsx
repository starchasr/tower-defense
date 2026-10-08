import { useEffect, useRef } from 'react';
import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { GROUND_PATH, H, W } from '../game/map';
import { TOWERS } from '../game/config';

const MW = 160;
const MH = Math.round((MW * H) / W);

export function MiniMap({ ui, game }: { ui: UiSnapshot; game: Game }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, MW, MH);
    ctx.fillStyle = 'rgba(9, 14, 27, 0.88)';
    ctx.fillRect(0, 0, MW, MH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    GROUND_PATH.forEach((p, i) => {
      const x = (p.x / W) * MW;
      const y = (p.y / H) * MH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = GROUND_PATH[GROUND_PATH.length - 1];
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect((last.x / W) * MW - 3, (last.y / H) * MH - 3, 6, 6);
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc((GROUND_PATH[0].x / W) * MW, (GROUND_PATH[0].y / H) * MH, 2.5, 0, Math.PI * 2);
    ctx.fill();
    for (const t of ui.towersMini) {
      ctx.fillStyle = TOWERS[t.kind].color;
      ctx.fillRect((t.x / W) * MW - 1.5, (t.y / H) * MH - 1.5, 3, 3);
    }
    for (const e of ui.enemiesMini) {
      if (e.boss) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc((e.x / W) * MW, (e.y / H) * MH, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(248, 113, 113, 0.9)';
        ctx.fillRect((e.x / W) * MW - 1, (e.y / H) * MH - 1, 2, 2);
      }
    }
  });

  return (
    <canvas
      ref={ref}
      width={MW}
      height={MH}
      className="minimap"
      title="Click to move the camera"
      onPointerDown={e => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const wx = ((e.clientX - rect.left) / rect.width) * W;
        const wy = ((e.clientY - rect.top) / rect.height) * H;
        game.centerCameraOn(wx, wy);
      }}
    />
  );
}
