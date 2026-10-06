import type { Vec } from './types';

export const CELL = 48;
export const COLS = 26;
export const ROWS = 17;
export const W = COLS * CELL;
export const H = ROWS * CELL;

export const LAYOUTS: Record<string, [number, number][]> = {
  classic: [
    [-1, 8], [3, 8], [3, 2], [9, 2], [9, 13], [14, 13], [14, 5], [19, 5], [19, 14], [24, 14], [24, 8], [26, 8],
  ],
  ember: [
    [-1, 2], [6, 2], [6, 14], [12, 14], [12, 2], [18, 2], [18, 14], [24, 14], [24, 8], [26, 8],
  ],
  frost: [
    [-1, 13], [5, 13], [5, 3], [11, 3], [11, 13], [17, 13], [17, 3], [22, 3], [22, 9], [26, 9],
  ],
  void: [
    [-1, 1], [22, 1], [22, 14], [4, 14], [4, 5], [18, 5], [18, 10], [9, 10], [9, 8], [13, 8],
  ],
};

const FLY_CELLS: [number, number][] = [[-1, 8], [26, 8]];

function toPx(p: [number, number]): Vec {
  return { x: (p[0] + 0.5) * CELL, y: (p[1] + 0.5) * CELL };
}

export const GROUND_PATH: Vec[] = LAYOUTS.classic.map(toPx);
export const FLY_PATH: Vec[] = FLY_CELLS.map(toPx);

export function pathLength(pts: Vec[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

export let GROUND_LEN = pathLength(GROUND_PATH);
export const FLY_LEN = pathLength(FLY_PATH);

function cellsFrom(waypoints: [number, number][]): Set<string> {
  const s = new Set<string>();
  for (let i = 1; i < waypoints.length; i++) {
    const [x0, y0] = waypoints[i - 1];
    const [x1, y1] = waypoints[i];
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    s.add(`${x},${y}`);
    while (x !== x1 || y !== y1) {
      x += dx;
      y += dy;
      s.add(`${x},${y}`);
    }
  }
  return s;
}

export const PATH_CELLS: Set<string> = cellsFrom(LAYOUTS.classic);

export interface Tuft {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export const TUFTS: Tuft[] = [];

export interface Decor {
  x: number;
  y: number;
  r: number;
  a: number;
  kind: number;
}

export const DECOR: Decor[] = [];

function fillScatter(path: Set<string>, seed: number) {
  const rand = (() => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  TUFTS.length = 0;
  let guard = 0;
  while (TUFTS.length < 260 && guard++ < 4000) {
    const gx = Math.floor(rand() * COLS);
    const gy = Math.floor(rand() * ROWS);
    if (path.has(`${gx},${gy}`)) continue;
    TUFTS.push({
      x: (gx + 0.1 + rand() * 0.8) * CELL,
      y: (gy + 0.1 + rand() * 0.8) * CELL,
      rot: rand() * Math.PI,
      scale: 0.6 + rand() * 0.9,
    });
  }
  DECOR.length = 0;
  for (let i = 0; i < 90; i++) {
    const gx = Math.floor(rand() * COLS);
    const gy = Math.floor(rand() * ROWS);
    if (path.has(`${gx},${gy}`)) continue;
    DECOR.push({
      x: (gx + 0.15 + rand() * 0.7) * CELL,
      y: (gy + 0.15 + rand() * 0.7) * CELL,
      r: 1 + rand() * 2.6,
      a: 0.06 + rand() * 0.16,
      kind: Math.floor(rand() * 3),
    });
  }
}

export type RoadStyle = 'dirt' | 'paved' | 'mountain' | 'swamp';

export interface Biome {
  groundMap: string;
  groundMapN: string;
  groundTint: string;
  road: RoadStyle;
  pathTint: string;
  poolColor: string;
  poolEmissive: string;
  poolRough: number;
  poolMetal: number;
  poolOpacity: number;
  shore: string;
  trunk: string;
  pine: string;
  leaf: string;
}

export const BIOMES: Record<string, Biome> = {
  classic: {
    groundMap: 'grass', groundMapN: 'grassN', groundTint: '#ffffff',
    road: 'dirt', pathTint: '#ffffff',
    poolColor: '#38bdf8', poolEmissive: '#0ea5e9', poolRough: 0.08, poolMetal: 0.55, poolOpacity: 0.94,
    shore: '#b9a77c',
    trunk: '#6b4a2f', pine: '#2e6b34', leaf: '#4d8a3d',
  },
  ember: {
    groundMap: 'gravel', groundMapN: 'gravelN', groundTint: '#a8814f',
    road: 'paved', pathTint: '#a08b74',
    poolColor: '#f97316', poolEmissive: '#ea580c', poolRough: 0.55, poolMetal: 0, poolOpacity: 1,
    shore: '#292524',
    trunk: '#3f2d20', pine: '#7c2d12', leaf: '#92400e',
  },
  frost: {
    groundMap: 'white', groundMapN: 'whiteN', groundTint: '#eaf1fa',
    road: 'mountain', pathTint: '#cfe0f4',
    poolColor: '#bae6fd', poolEmissive: '#7dd3fc', poolRough: 0.12, poolMetal: 0.4, poolOpacity: 0.95,
    shore: '#dbeafe',
    trunk: '#4b3a2a', pine: '#e2edf7', leaf: '#dbeafe',
  },
  void: {
    groundMap: 'gravel', groundMapN: 'gravelN', groundTint: '#5a4a70',
    road: 'swamp', pathTint: '#4a3b55',
    poolColor: '#a855f7', poolEmissive: '#7e22ce', poolRough: 0.1, poolMetal: 0.45, poolOpacity: 0.95,
    shore: '#231b33',
    trunk: '#241b30', pine: '#5b21b6', leaf: '#4c1d95',
  },
};

export function biome(): Biome {
  return BIOMES[currentLayout] ?? BIOMES.classic;
}

export const POOL_CELLS = new Set<string>();
export const TREE_CELLS = new Set<string>();
export const BLOCKED_CELLS = new Set<string>();

export interface PoolCluster {
  cells: [number, number][];
  seed: number;
}

export const POOL_CLUSTERS: PoolCluster[] = [];

function genZones(path: Set<string>, seed: number) {
  POOL_CELLS.clear();
  TREE_CELLS.clear();
  BLOCKED_CELLS.clear();
  const rand = (() => {
    let s = seed ^ 0x9e3779b9;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const free = (gx: number, gy: number) =>
    gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && !path.has(`${gx},${gy}`) && !BLOCKED_CELLS.has(`${gx},${gy}`);
  const grow = (target: Set<string>, clusters: number, minSize: number, maxSize: number) => {
    for (let c = 0; c < clusters; c++) {
      let guard = 0;
      let gx = 0, gy = 0;
      do {
        gx = Math.floor(rand() * COLS);
        gy = Math.floor(rand() * ROWS);
      } while (!free(gx, gy) && guard++ < 200);
      if (guard >= 200) break;
      const size = minSize + Math.floor(rand() * (maxSize - minSize + 1));
      let frontier: [number, number][] = [[gx, gy]];
      for (let n = 0; n < size && frontier.length; n++) {
        const idx = Math.floor(rand() * frontier.length);
        const [cx, cy] = frontier.splice(idx, 1)[0];
        if (!free(cx, cy)) continue;
        target.add(`${cx},${cy}`);
        BLOCKED_CELLS.add(`${cx},${cy}`);
        frontier = [
          ...frontier,
          [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
        ];
      }
    }
  };
  grow(POOL_CELLS, 4, 2, 4);
  grow(TREE_CELLS, 8, 3, 6);
}

let currentLayout = 'classic';

export function setLayout(id: string) {
  const wp = LAYOUTS[id] ?? LAYOUTS.classic;
  currentLayout = id;
  const pts = wp.map(toPx);
  GROUND_PATH.splice(0, GROUND_PATH.length, ...pts);
  GROUND_LEN = pathLength(GROUND_PATH);
  PATH_CELLS.clear();
  for (const c of cellsFrom(wp)) PATH_CELLS.add(c);
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  fillScatter(PATH_CELLS, seed + 7);
  genZones(PATH_CELLS, seed + 13);
  POOL_CLUSTERS.length = 0;
  const seen = new Set<string>();
  for (const cell of POOL_CELLS) {
    if (seen.has(cell)) continue;
    const comp: [number, number][] = [];
    const stack = [cell];
    seen.add(cell);
    while (stack.length) {
      const cur = stack.pop()!;
      const [cx, cy] = cur.split(',').map(Number);
      comp.push([cx, cy]);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const k = `${nx},${ny}`;
        if (POOL_CELLS.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
      }
    }
    POOL_CLUSTERS.push({ cells: comp, seed: (seed + POOL_CLUSTERS.length * 7919) >>> 0 });
  }
}

export function getLayout(): string {
  return currentLayout;
}

// Hand-authored terrain profiles (control grids, 0 = flat, 1 = full hill, negative = sunk).
// Rows run north→south, columns west→east, spanning the full world plane.
export const TERRAIN: Record<string, number[][]> = {
  // Rolling meadow — gentle hills all around the valley floor.
  classic: [
    [0.55, 0.35, 0.25, 0.25, 0.35, 0.55],
    [0.35, 0.2, 0.15, 0.15, 0.2, 0.35],
    [0.45, 0.25, 0.2, 0.2, 0.25, 0.45],
    [0.6, 0.4, 0.3, 0.3, 0.4, 0.6],
  ],
  // Canyon pass — high ridges north & south, the road threads the gap.
  ember: [
    [0.2, 1.0, 0.9, 0.9, 1.0, 0.2],
    [0.1, 0.45, 0.5, 0.5, 0.45, 0.1],
    [0.15, 0.4, 0.45, 0.45, 0.4, 0.15],
    [0.2, 1.0, 0.9, 0.9, 1.0, 0.2],
  ],
  // Mountain bowl — peaks at the corners, battle in the basin.
  frost: [
    [1.0, 0.55, 0.3, 0.3, 0.55, 1.0],
    [0.55, 0.3, 0.15, 0.15, 0.3, 0.55],
    [0.55, 0.3, 0.15, 0.15, 0.3, 0.55],
    [1.0, 0.55, 0.3, 0.3, 0.55, 1.0],
  ],
  // Rift crater — raised rim hugging the board, land collapsing away beyond it.
  void: [
    [-0.7, 0.1, 0.85, 0.85, 0.1, -0.7],
    [-0.4, 0.55, 0.5, 0.5, 0.55, -0.4],
    [-0.4, 0.55, 0.5, 0.5, 0.55, -0.4],
    [-0.7, 0.1, 0.85, 0.85, 0.1, -0.7],
  ],
};

fillScatter(PATH_CELLS, 4242);
