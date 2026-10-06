import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

const PHOTO_FILES: [string, string, boolean][] = [
  ['grass', 'textures/leafy_grass_diff.jpg', true],
  ['grassN', 'textures/leafy_grass_nor.jpg', false],
  ['path', 'textures/stony_dirt_path_diff.jpg', true],
  ['pathN', 'textures/stony_dirt_path_nor.jpg', false],
  ['cobble', 'textures/cobblestone_03_diff.jpg', true],
  ['cobbleN', 'textures/cobblestone_03_nor.jpg', false],
  ['metal', 'textures/metal_plate_02_diff.jpg', true],
  ['metalN', 'textures/metal_plate_02_nor.jpg', false],
  ['gravel', 'textures/gravel_floor_02_diff.jpg', true],
  ['gravelN', 'textures/gravel_floor_02_nor.jpg', false],
  ['hide', 'textures/fabric_leather_01_diff.jpg', true],
  ['hideN', 'textures/fabric_leather_01_nor.jpg', false],
  ['scales', 'textures/leather_red_02_diff.jpg', true],
  ['scalesN', 'textures/leather_red_02_nor.jpg', false],
  ['rockSkin', 'textures/mossy_rock_diff.jpg', true],
  ['rockSkinN', 'textures/mossy_rock_nor.jpg', false],
  ['carapace', 'textures/brown_leather_diff.jpg', true],
  ['carapaceN', 'textures/brown_leather_nor.jpg', false],
  ['velvet', 'textures/velour_velvet_diff.jpg', true],
  ['velvetN', 'textures/velour_velvet_nor.jpg', false],
  ['white', 'textures/leather_white_diff.jpg', true],
  ['whiteN', 'textures/leather_white_nor.jpg', false],
];

const photoCache = new Map<string, THREE.Texture>();

export async function preloadPhotoTextures(): Promise<void> {
  const loader = new THREE.TextureLoader();
  await Promise.all(
    PHOTO_FILES.map(
      ([key, url, srgb]) =>
        new Promise<void>(res => {
          loader.load(
            url,
            t => {
              t.wrapS = THREE.RepeatWrapping;
              t.wrapT = THREE.RepeatWrapping;
              if (srgb) t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 8;
              photoCache.set(key, t);
              res();
            },
            undefined,
            () => res(),
          );
        }),
    ),
  );
}

const cloneCache = new Map<string, THREE.Texture>();

export function photoTex(key: string, rx = 1, ry = 1): THREE.Texture | null {
  const base = photoCache.get(key);
  if (!base) return null;
  const ck = `${key}:${rx}:${ry}`;
  let t = cloneCache.get(ck);
  if (!t) {
    t = base.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    cloneCache.set(ck, t);
  }
  return t;
}

function cv(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function tiled(t: THREE.CanvasTexture, rx: number, ry: number): THREE.CanvasTexture {
  const c = t.clone();
  c.wrapS = THREE.RepeatWrapping;
  c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

function blotches(ctx: CanvasRenderingContext2D, size: number, n: number, palette: string[], rMin: number, rMax: number, aMin: number, aMax: number) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, n: number, palette: string[], rMin: number, rMax: number, aMin: number, aMax: number) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r * (0.5 + Math.random()));
  }
  ctx.globalAlpha = 1;
}

export function grassTexture(): THREE.CanvasTexture {
  const key = 'grass';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  ctx.fillStyle = '#3f5433';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 46, ['#33482a', '#4a6039', '#57683c', '#2c3f24'], 8, 34, 0.05, 0.16);
  speckle(ctx, 256, 1700, ['#2c3f24', '#556b3a', '#61763f', '#33492b', '#718352'], 0.6, 1.9, 0.05, 0.2);
  for (let i = 0; i < 240; i++) {
    ctx.globalAlpha = 0.1 + Math.random() * 0.15;
    ctx.strokeStyle = Math.random() < 0.5 ? '#5d7343' : '#31452a';
    ctx.lineWidth = 1;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function pathTexture(): THREE.CanvasTexture {
  const key = 'path';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  ctx.fillStyle = '#5e4b37';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 40, ['#4c3c2c', '#6d5843', '#7a6449', '#54432f'], 8, 30, 0.06, 0.18);
  speckle(ctx, 256, 1500, ['#4a3b2b', '#6d5942', '#83705a', '#3a2f23'], 0.6, 2.2, 0.05, 0.22);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 2 + Math.random() * 4;
    ctx.globalAlpha = 0.5 + Math.random() * 0.3;
    ctx.fillStyle = '#8a8578';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3e3327';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.35 + Math.random() * 0.2;
    ctx.strokeStyle = '#3a2f23';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function stoneTexture(): THREE.CanvasTexture {
  const key = 'stone';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  ctx.fillStyle = '#6f747a';
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 50, ['#5d6268', '#7d838a', '#868c93', '#565b61'], 6, 30, 0.05, 0.16);
  speckle(ctx, 256, 1600, ['#565b61', '#82878d', '#8f959b', '#4c5157'], 0.5, 2, 0.05, 0.2);
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.25;
    ctx.strokeStyle = '#4a4f55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function metalTexture(): THREE.CanvasTexture {
  const key = 'metal';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  ctx.fillStyle = '#9aa3ae';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x++) {
    ctx.globalAlpha = 0.03 + Math.random() * 0.06;
    ctx.fillStyle = Math.random() < 0.5 ? '#7d8695' : '#b3bcc7';
    ctx.fillRect(x, 0, 1, 256);
  }
  for (let i = 0; i < 46; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.1;
    ctx.strokeStyle = Math.random() < 0.5 ? '#6b7480' : '#c5ccd5';
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      const x = 16 + gx * 32;
      const y = 16 + gy * 32;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#5f6873';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9d1da';
      ctx.beginPath();
      ctx.arc(x - 0.9, y - 0.9, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  cache.set(key, t);
  return t;
}

function grayBase(size: number, base: number, variance: number, dots: number, rMin: number, rMax: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const [c, ctx] = cv(size);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = Math.max(0, Math.min(255, base + (Math.random() - 0.5) * 2 * variance));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r * (0.5 + Math.random()));
  }
  return [c, ctx];
}

export function grassBumpTex(): THREE.CanvasTexture {
  const key = 'grassB';
  if (cache.has(key)) return cache.get(key)!;
  const [c] = grayBase(256, 128, 34, 2600, 0.8, 2.2);
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function pathBumpTex(): THREE.CanvasTexture {
  const key = 'pathB';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = grayBase(256, 128, 30, 1400, 0.8, 2);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = '#b5b5b5';
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function stoneBumpTex(): THREE.CanvasTexture {
  const key = 'stoneB';
  if (cache.has(key)) return cache.get(key)!;
  const [c] = grayBase(256, 128, 32, 2200, 0.7, 2.2);
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function metalBumpTex(): THREE.CanvasTexture {
  const key = 'metalB';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x++) {
    const v = 108 + Math.random() * 40;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      ctx.fillStyle = '#303030';
      ctx.beginPath();
      ctx.arc(16 + gx * 32, 16 + gy * 32, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function skyTexture(): THREE.CanvasTexture {
  const key = 'sky';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#0a1526');
  g.addColorStop(0.42, '#1d3a5f');
  g.addColorStop(0.58, '#5d7896');
  g.addColorStop(0.66, '#c78a52');
  g.addColorStop(0.78, '#3a3f4a');
  g.addColorStop(1, '#171a20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const sg = ctx.createRadialGradient(700, 660, 10, 700, 660, 240);
  sg.addColorStop(0, 'rgba(255,214,150,0.85)');
  sg.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 1024;
    const y = 160 + Math.random() * 420;
    ctx.globalAlpha = 0.05 + Math.random() * 0.09;
    ctx.fillStyle = '#dfe8f2';
    ctx.beginPath();
    ctx.ellipse(x, y, 50 + Math.random() * 150, 10 + Math.random() * 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

export function scorchTexture(): THREE.CanvasTexture {
  const key = 'scorch';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(10,8,6,0.85)');
  g.addColorStop(0.5, 'rgba(20,16,12,0.5)');
  g.addColorStop(1, 'rgba(20,16,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 46;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const r = 2 + Math.random() * 7;
    ctx.fillStyle = 'rgba(12,10,8,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function cloudShadowTexture(): THREE.CanvasTexture {
  const key = 'cloudShadow';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7; i++) {
    const x = 60 + Math.random() * 136;
    const y = 60 + Math.random() * 136;
    const r = 24 + Math.random() * 40;
    const sg = ctx.createRadialGradient(x, y, 2, x, y, r);
    sg.addColorStop(0, 'rgba(0,0,0,0.3)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = tex(c, false);
  cache.set(key, t);
  return t;
}

export function nightSkyTexture(): THREE.CanvasTexture {
  const key = 'nightSky';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#030711');
  g.addColorStop(0.5, '#081020');
  g.addColorStop(0.72, '#0d1830');
  g.addColorStop(1, '#101d38');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 500;
    ctx.globalAlpha = 0.04 + Math.random() * 0.05;
    ctx.fillStyle = '#8ea8d8';
    ctx.beginPath();
    ctx.ellipse(x, y, 60 + Math.random() * 160, 20 + Math.random() * 50, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 620;
    const r = Math.random() < 0.92 ? 0.5 + Math.random() * 0.9 : 1.3 + Math.random() * 1.1;
    ctx.globalAlpha = 0.35 + Math.random() * 0.65;
    ctx.fillStyle = Math.random() < 0.18 ? '#bcd2ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const mx = 320;
  const my = 260;
  const mg = ctx.createRadialGradient(mx, my, 6, mx, my, 130);
  mg.addColorStop(0, 'rgba(214,228,255,0.5)');
  mg.addColorStop(1, 'rgba(214,228,255,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = mg;
  ctx.fillRect(mx - 140, my - 140, 280, 280);
  ctx.fillStyle = '#dbe6f8';
  ctx.beginPath();
  ctx.arc(mx, my, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,178,205,0.5)';
  ctx.beginPath();
  ctx.arc(mx - 9, my - 6, 7, 0, Math.PI * 2);
  ctx.arc(mx + 11, my + 9, 5, 0, Math.PI * 2);
  ctx.arc(mx + 4, my - 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

export function tuftTexture(): THREE.CanvasTexture {
  const key = 'tuft';
  if (cache.has(key)) return cache.get(key)!;
  const [c, ctx] = cv(64);
  for (let i = 0; i < 15; i++) {
    const x0 = 20 + Math.random() * 24;
    const x1 = x0 + (Math.random() - 0.5) * 30;
    const y1 = 6 + Math.random() * 26;
    ctx.strokeStyle = `hsl(${88 + Math.random() * 26}, 30%, ${28 + Math.random() * 20}%)`;
    ctx.lineWidth = 1.6 + Math.random() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x0, 64);
    ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.4, 64 - (64 - y1) * 0.5, x1, y1);
    ctx.stroke();
  }
  const t = tex(c);
  cache.set(key, t);
  return t;
}
