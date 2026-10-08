import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, COLS, DECOR, GROUND_PATH, H, PATH_CELLS, POOL_CLUSTERS, ROWS, TREE_CELLS, TERRAIN, TUFTS, W, biome, getLayout } from './map';
import { TOWERS } from './config';
import { dayPhase } from './daycycle';
import {
  cloudShadowTexture, grassBumpTex, grassTexture, metalBumpTex, metalTexture, nightSkyTexture, pathBumpTex, pathTexture,
  photoTex, scorchTexture, skyTexture, stoneBumpTex, stoneTexture, tiled, tuftTexture,
} from './textures';
import type { Enemy, RenderEffect, RenderState, TowerKind, Vec } from './types';

const AIR_RADIUS = 95;
const MAX_PARTS = 1600;

interface TowerView {
  group: THREE.Group;
  yaw: THREE.Group;
  barrel: THREE.Object3D | null;
  barrelBaseX: number;
  flash: THREE.Mesh | null;
  spinner: THREE.Object3D | null;
  ringMat: THREE.MeshStandardMaterial;
  levelCubes: THREE.Mesh[];
  gems: THREE.Group;
  aura: THREE.Mesh | null;
  rangeRing: THREE.Mesh;
  born: number;
}

interface Limb {
  obj: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
  phase: number;
  amp: number;
  speed: number;
}

interface SkinCfg {
  map: string;
  nor: string;
  rough: number;
  metal: number;
  tint: number;
  rep: number;
}

const SKINS: Record<string, SkinCfg> = {
  grunt: { map: 'hide', nor: 'hideN', rough: 0.78, metal: 0.04, tint: 0.45, rep: 2.2 },
  runner: { map: 'scales', nor: 'scalesN', rough: 0.55, metal: 0.12, tint: 0.4, rep: 2.6 },
  brute: { map: 'rockSkin', nor: 'rockSkinN', rough: 0.95, metal: 0, tint: 0.3, rep: 1.6 },
  flyer: { map: 'hide', nor: 'hideN', rough: 0.45, metal: 0.2, tint: 0.45, rep: 2.6 },
  healer: { map: 'white', nor: 'whiteN', rough: 0.32, metal: 0.02, tint: 0.6, rep: 2.4 },
  boss: { map: 'carapace', nor: 'carapaceN', rough: 0.5, metal: 0.22, tint: 0.35, rep: 2 },
  shield: { map: 'carapace', nor: 'carapaceN', rough: 0.32, metal: 0.5, tint: 0.25, rep: 2.2 },
  phantom: { map: 'velvet', nor: 'velvetN', rough: 0.9, metal: 0, tint: 0.35, rep: 2 },
  wrecker: { map: 'metal', nor: 'metalN', rough: 0.42, metal: 0.65, tint: 0.2, rep: 2 },
  colossus: { map: 'rockSkin', nor: 'rockSkinN', rough: 0.98, metal: 0, tint: 0.22, rep: 2.6 },
};

interface Spin {
  obj: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
  speed: number;
}

interface EnemyView {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  shield: THREE.Mesh | null;
  tintRing: THREE.Mesh | null;
  cloakRing: THREE.Mesh | null;
  crown: THREE.Mesh | null;
  hpGroup: THREE.Group;
  hpFill: THREE.Mesh;
  hpFillMat: THREE.MeshBasicMaterial;
  size: number;
  flying: boolean;
  born: number;
  limbs: Limb[];
  spins: Spin[];
  bodyObj: THREE.Group;
  fadeMats: THREE.Material[];
}

interface FxEntry {
  obj: THREE.Object3D;
  update?: (k: number) => void;
}

function disposeObj(root: THREE.Object3D) {
  root.traverse(c => {
    const mesh = c as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(m => m.dispose());
    else if (mat) mat.dispose();
  });
}

function std(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25, ...opts });
}

let metalGrayMat: THREE.MeshStandardMaterial | null = null;
function getMetalGray() {
  if (!metalGrayMat) {
    const p: THREE.MeshStandardMaterialParameters = {
      map: photoTex('metal', 2, 2) ?? tiled(metalTexture(), 3, 1),
      normalScale: new THREE.Vector2(0.6, 0.6),
      bumpScale: 0.5,
      color: '#c3cbd6',
      metalness: 0.8,
      roughness: 0.42,
    };
    const nor = photoTex('metalN', 2, 2);
    if (nor) p.normalMap = nor;
    else p.bumpMap = tiled(metalBumpTex(), 3, 1);
    metalGrayMat = new THREE.MeshStandardMaterial(p);
  }
  return metalGrayMat;
}

const metalTints = new Map<string, THREE.MeshStandardMaterial>();
function getMetalTint(color: string) {
  let m = metalTints.get(color);
  if (!m) {
    const p: THREE.MeshStandardMaterialParameters = {
      map: photoTex('metal', 2, 2) ?? tiled(metalTexture(), 2, 1),
      normalScale: new THREE.Vector2(0.5, 0.5),
      bumpScale: 0.5,
      color,
      metalness: 0.65,
      roughness: 0.5,
    };
    const nor = photoTex('metalN', 2, 2);
    if (nor) p.normalMap = nor;
    else p.bumpMap = tiled(metalBumpTex(), 2, 1);
    m = new THREE.MeshStandardMaterial(p);
    metalTints.set(color, m);
  }
  return m;
}

const EXT = 5200;

function smooth01(t: number) {
  return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
}

function smoothstep(a: number, b: number, x: number) {
  return smooth01((x - a) / (b - a));
}

function distToBoard(x: number, z: number): number {
  const dx = Math.max(-60 - x, 0, x - (W + 60));
  const dz = Math.max(-60 - z, 0, z - (H + 60));
  return Math.hypot(dx, dz);
}

function distToPath(x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < GROUND_PATH.length; i++) {
    const a = GROUND_PATH[i - 1];
    const b = GROUND_PATH[i];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const len2 = abx * abx + abz * abz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.y) * abz) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t)));
  }
  return best;
}

interface PathSample { x: number; z: number; tx: number; tz: number; d: number }

function pathSamples(step: number): PathSample[] {
  const raw: { x: number; z: number }[] = [];
  for (let i = 0; i < GROUND_PATH.length; i++) {
    if (i === 0) {
      raw.push({ x: GROUND_PATH[0].x, z: GROUND_PATH[0].y });
      continue;
    }
    const a = GROUND_PATH[i - 1];
    const b = GROUND_PATH[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(seg / step));
    for (let k = 1; k <= n; k++) {
      raw.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.y + ((b.y - a.y) * k) / n });
    }
  }
  let d = 0;
  return raw.map((p, i) => {
    if (i > 0) d += Math.hypot(p.x - raw[i - 1].x, p.z - raw[i - 1].z);
    const pa = raw[Math.max(0, i - 1)];
    const pb = raw[Math.min(raw.length - 1, i + 1)];
    let tx = pb.x - pa.x;
    let tz = pb.z - pa.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    return { x: p.x, z: p.z, tx, tz, d };
  });
}

function hashNoise(v: number): number {
  const x = Math.sin(v * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function flatRibbonGeo(s: PathSample[], half: number, y: number, vLen: number, off = 0, shade = 1): THREE.BufferGeometry {
  const n = s.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const col = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const p = s[i];
    const nx = -p.tz;
    const nz = p.tx;
    const c = shade * (0.86 + 0.18 * hashNoise(p.d * 0.021 + p.x * 0.003));
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      const v = i * 6 + k * 3;
      pos[v] = p.x + nx * (off + side * half);
      pos[v + 1] = y;
      pos[v + 2] = p.z + nz * (off + side * half);
      nor[v] = 0;
      nor[v + 1] = 1;
      nor[v + 2] = 0;
      const u = i * 4 + k * 2;
      uv[u] = k;
      uv[u + 1] = p.d / vLen;
      col[v] = c;
      col[v + 1] = c;
      col[v + 2] = c;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

function wallStripGeo(s: PathSample[], off: number, yTop: number, yBot: number, vLen: number, shade = 1): THREE.BufferGeometry {
  const n = s.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const col = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const nrmSign = off >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = s[i];
    const nx = -p.tz * nrmSign;
    const nz = p.tx * nrmSign;
    const c = shade * (0.86 + 0.18 * hashNoise(p.d * 0.021 + p.z * 0.003));
    for (let k = 0; k < 2; k++) {
      const v = i * 6 + k * 3;
      pos[v] = p.x + nx * Math.abs(off);
      pos[v + 1] = k === 0 ? yTop : yBot;
      pos[v + 2] = p.z + nz * Math.abs(off);
      nor[v] = nx;
      nor[v + 1] = 0;
      nor[v + 2] = nz;
      const u = i * 4 + k * 2;
      uv[u] = p.d / vLen;
      uv[u + 1] = k;
      col[v] = c;
      col[v + 1] = c;
      col[v + 2] = c;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

type Pt2 = [number, number];

function metaballContours(blobs: { x: number; y: number; r: number }[], step: number, noiseSeed: number): Pt2[][] {
  let ns = noiseSeed;
  const nrand = () => {
    ns = (ns * 1664525 + 1013904223) >>> 0;
    return ns / 4294967296;
  };
  const p1 = nrand() * Math.PI * 2;
  const p2 = nrand() * Math.PI * 2;
  const minX = Math.min(...blobs.map(b => b.x)) - 260;
  const minY = Math.min(...blobs.map(b => b.y)) - 260;
  const w = Math.max(...blobs.map(b => b.x)) - minX + 260;
  const h = Math.max(...blobs.map(b => b.y)) - minY + 260;
  const nx = Math.ceil(w / step) + 1;
  const ny = Math.ceil(h / step) + 1;
  const field = (x: number, y: number) => {
    let v = 0;
    for (const b of blobs) {
      const dx = x - b.x;
      const dy = y - b.y;
      v += (b.r * b.r) / (dx * dx + dy * dy + 1);
    }
    return v - 0.05 * Math.sin(x * 0.011 + p1) * Math.sin(y * 0.013 + p2);
  };
  const grid = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) grid[j * nx + i] = field(minX + i * step, minY + j * step);
  }
  const segs: [number, number, number, number][] = [];
  const lerpPt = (ax: number, ay: number, bx: number, by: number, va: number, vb: number): [number, number] => {
    const t = (1 - va) / (vb - va || 1e-6);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = grid[j * nx + i];
      const v1 = grid[j * nx + i + 1];
      const v2 = grid[(j + 1) * nx + i + 1];
      const v3 = grid[(j + 1) * nx + i];
      const idx = (v0 > 1 ? 1 : 0) | (v1 > 1 ? 2 : 0) | (v2 > 1 ? 4 : 0) | (v3 > 1 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = minX + i * step;
      const y0 = minY + j * step;
      const eT = () => lerpPt(x0, y0, x0 + step, y0, v0, v1);
      const eR = () => lerpPt(x0 + step, y0, x0 + step, y0 + step, v1, v2);
      const eB = () => lerpPt(x0, y0 + step, x0 + step, y0 + step, v3, v2);
      const eL = () => lerpPt(x0, y0, x0, y0 + step, v0, v3);
      const push = (a: [number, number], b: [number, number]) => segs.push([a[0], a[1], b[0], b[1]]);
      if (idx === 1 || idx === 14) push(eL(), eT());
      else if (idx === 2 || idx === 13) push(eT(), eR());
      else if (idx === 3 || idx === 12) push(eL(), eR());
      else if (idx === 4 || idx === 11) push(eR(), eB());
      else if (idx === 6 || idx === 9) push(eT(), eB());
      else if (idx === 7 || idx === 8) push(eL(), eB());
      else if (idx === 5) { push(eL(), eT()); push(eR(), eB()); }
      else if (idx === 10) { push(eT(), eR()); push(eB(), eL()); }
    }
  }
  const key = (p: [number, number]) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const adj = new Map<string, number[]>();
  segs.forEach((sg, i) => {
    for (const e of [0, 2]) {
      const k = key([sg[e], sg[e + 1]]);
      const arr = adj.get(k);
      if (arr) arr.push(i);
      else adj.set(k, [i]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops: Pt2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop: Pt2[] = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
    let guard = 0;
    while (guard++ < 20000) {
      const k = key(loop[loop.length - 1]);
      const cands = (adj.get(k) ?? []).filter(j => !used[j]);
      if (!cands.length) break;
      const j = cands[0];
      used[j] = true;
      const a: Pt2 = [segs[j][0], segs[j][1]];
      const b: Pt2 = [segs[j][2], segs[j][3]];
      loop.push(key(a) === k ? b : a);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

function chaikin(pts: Pt2[], iters: number): Pt2[] {
  let cur = pts;
  for (let it = 0; it < iters; it++) {
    const out: Pt2[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    cur = out;
  }
  return cur;
}


export class Renderer3D {
  private glCanvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();

  private sun!: THREE.DirectionalLight;
  private moon!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private nightSkyMat!: THREE.MeshBasicMaterial;
  private fillLight!: THREE.DirectionalLight;
  private clouds: { group: THREE.Group; blob: THREE.Mesh; x0: number; z: number; y0: number; speed: number; scale: number }[] = [];
  private cloudMat!: THREE.MeshStandardMaterial;
  private waveRing: THREE.Mesh;
  private grassMatRef!: THREE.MeshStandardMaterial;
  private pathMatRef!: THREE.MeshStandardMaterial;

  private rainLines!: THREE.LineSegments;
  private rainMat!: THREE.LineBasicMaterial;
  private rainBase: Float32Array = new Float32Array(0);

  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  private sunMeshMat!: THREE.MeshBasicMaterial;
  private birds: { group: THREE.Group; wings: THREE.Mesh[] }[] = [];
  private birdFlocks: { group: THREE.Group; speed: number; y: number; z: number; offset: number }[] = [];
  private flies: { pts: THREE.Points; mat: THREE.PointsMaterial; base: Float32Array; phase: Float32Array; night: boolean }[] = [];
  private ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; start: number }[] = [];
  private rippleI = 0;
  private scorches: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; born: number }[] = [];
  private scorchI = 0;
  private lanternMats: THREE.MeshStandardMaterial[] = [];
  private introT = 0;
  private lastNow = 0;
  private cinemaMode: 'victory' | 'defeat' | 'off' = 'off';
  private camRadius = 0;
  private camTheta = 0;
  private camPhi = 0;

  private theta = 0;
  private phi = 0.98;
  private radius = 1250;
  private target = new THREE.Vector3(W / 2, 0, H / 2);
  private thetaT = 0;
  private phiT = 0.98;
  private radiusT = 1250;
  private targetT = new THREE.Vector3(W / 2, 0, H / 2);
  private dragBtn = -1;
  private lastPt = { x: 0, y: 0 };
  private dragDist = 0;

  private towerViews = new Map<number, TowerView>();
  private enemyViews = new Map<number, EnemyView>();
  private projViews = new Map<number, { obj: THREE.Object3D; line: THREE.Line; trail: THREE.Vector3[] }>();
  private fxViews = new Map<RenderEffect, FxEntry>();

  private ghostGroup = new THREE.Group();
  private ghostMat: THREE.MeshStandardMaterial;
  private ghostRing: THREE.Mesh;
  private ghostRingMat: THREE.MeshBasicMaterial;
  private selRing: THREE.Mesh;
  private airRing: THREE.Mesh;
  private airFill: THREE.Mesh;
  private ampLines: THREE.LineSegments;
  private focusRing: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private coreGroup = new THREE.Group();
  private portalMat!: THREE.MeshStandardMaterial;
  private coreLight!: THREE.PointLight;
  private keepers: { group: THREE.Group; phase: number }[] = [];
  private mists: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; speed: number; phase: number }[] = [];
  private fireflies!: THREE.Points;
  private fireMat!: THREE.PointsMaterial;
  private fireBase!: Float32Array;
  private barT = 0;
  private vigCv: HTMLCanvasElement | null = null;

  private partGeo = new THREE.BufferGeometry();
  private partPos: Float32Array;
  private partCol: Float32Array;
  private colorCache = new Map<string, THREE.Color>();

  private w = 0;
  private h = 0;

  constructor(glCanvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.glCanvas = glCanvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d')!;

    this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    pmrem.dispose();

    this.scene.background = new THREE.Color('#0b1322');

    this.camera = new THREE.PerspectiveCamera(48, W / H, 2, 6000);

    this.partPos = new Float32Array(MAX_PARTS * 3);
    this.partCol = new Float32Array(MAX_PARTS * 3);
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3).setUsage(THREE.DynamicDrawUsage));

    this.buildLights();
    this.buildTrees();
    this.buildGround();
    this.buildSky();
    this.buildMarkers();
    this.buildClouds();
    this.buildMist();
    this.buildFireflies();
    this.buildRain();
    this.buildCelestials();
    this.buildRipples();

    this.scene.fog = new THREE.Fog('#0d1626', 1400, 3800);

    const waveRingMat = new THREE.MeshBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    this.waveRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), waveRingMat);
    this.waveRing.rotation.x = -Math.PI / 2;
    this.waveRing.position.set(GROUND_PATH[0].x, 1.7, GROUND_PATH[0].y);
    this.waveRing.visible = false;
    this.scene.add(this.waveRing);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.45, 0.84);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.ghostMat = new THREE.MeshStandardMaterial({ color: '#4ade80', transparent: true, opacity: 0.5, roughness: 0.5 });
    const ghostBase = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 10, 8), this.ghostMat);
    ghostBase.position.y = 5;
    this.ghostGroup.add(ghostBase);
    this.ghostRingMat = new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this.ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), this.ghostRingMat);
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.position.y = 1.5;
    this.ghostGroup.add(this.ghostRing);
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 1.6;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    this.airRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#fdba74', transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.airRing.rotation.x = -Math.PI / 2;
    this.airRing.position.y = 2;
    this.airRing.visible = false;
    this.scene.add(this.airRing);
    this.airFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: '#fdba74', transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    this.airFill.rotation.x = -Math.PI / 2;
    this.airFill.position.y = 1.8;
    this.airFill.visible = false;
    this.scene.add(this.airFill);

    const ampGeo = new THREE.BufferGeometry();
    const ampAttr = new THREE.BufferAttribute(new Float32Array(48 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    ampGeo.setAttribute('position', ampAttr);
    this.ampLines = new THREE.LineSegments(ampGeo, new THREE.LineBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.14 }));
    this.ampLines.frustumCulled = false;
    this.scene.add(this.ampLines);

    this.focusRing = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.8, 8, 32),
      new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.visible = false;
    this.scene.add(this.focusRing);

    this.flashLight = new THREE.PointLight('#ffb86b', 0, 420, 1.4);
    this.flashLight.position.y = 30;
    this.scene.add(this.flashLight);

    this.scene.add(this.partPoints);

    this.attachControls();
  }

  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#a8c2e8', '#3d4a33', 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffdfb8', 2.2);
    this.sun.position.set(W / 2 - 520, 900, H / 2 - 380);
    this.sun.target.position.set(W / 2, 0, H / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -1100;
    this.sun.shadow.camera.right = 1100;
    this.sun.shadow.camera.top = 1100;
    this.sun.shadow.camera.bottom = -1100;
    this.sun.shadow.camera.far = 3000;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight('#a9c1ea', 0);
    this.moon.position.set(W / 2 + 620, 700, H / 2 - 300);
    this.moon.target.position.set(W / 2, 0, H / 2);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    this.fillLight = new THREE.DirectionalLight('#7c8db8', 0.35);
    this.fillLight.position.set(W * 0.8, 500, H * 0.9);
    this.scene.add(this.fillLight);
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 32, 15),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -2;
    this.scene.add(sky);
    this.nightSkyMat = new THREE.MeshBasicMaterial({
      map: nightSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0,
    });
    const night = new THREE.Mesh(new THREE.SphereGeometry(4150, 32, 15), this.nightSkyMat);
    night.renderOrder = -1;
    this.scene.add(night);
  }

  private buildGround() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const gw = W + EXT * 2;
    const gh = H + EXT * 2;
    this.groundRepX = gw / 420;
    this.groundRepY = gh / 420;

    const grassTex = photoTex('grass', gw / 420, gh / 420) ?? tiled(grassTexture(), gw / 260, gh / 260);
    const grassNor = photoTex('grassN', gw / 420, gh / 420);
    grassTex.anisotropy = maxAniso;
    grassNor?.anisotropy && (grassNor.anisotropy = maxAniso);
    const grassMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      normalMap: grassNor,
      bumpScale: grassNor ? 0 : 0.5,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.95,
      metalness: 0,
    });
    if (!grassNor) grassMat.bumpMap = tiled(grassBumpTex(), gw / 260, gh / 260);
    this.grassMatRef = grassMat;

    this.buildLevelMeshes(maxAniso);

    const poleMat = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.7, metalness: 0.4 });
    const lanternSpots: [number, number][] = [
      [120, 70], [1128, 70], [120, 746], [1128, 746], [624, 36], [624, 780],
    ];
    for (const [lx, ly] of lanternSpots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 30, 8), poleMat);
      pole.position.set(lx, 15, ly);
      pole.castShadow = true;
      this.scene.add(pole);
      const lanternMat = new THREE.MeshStandardMaterial({ color: '#78350f', emissive: '#fbbf24', emissiveIntensity: 0.2, roughness: 0.4 });
      this.lanternMats.push(lanternMat);
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), lanternMat);
      lamp.position.set(lx, 31, ly);
      this.scene.add(lamp);
    }
  }

  private levelMeshes: THREE.Object3D[] = [];
  private rockMatRef!: THREE.MeshStandardMaterial;
  private portalGroup = new THREE.Group();
  private terrainGrid: number[][] = TERRAIN.classic;

  private terrainHeightAt(x: number, z: number): number {
    const g = this.terrainGrid;
    const rows = g.length;
    const cols = g[0].length;
    const fx = Math.min(Math.max((x + EXT) / (W + EXT * 2), 0), 1) * (cols - 1);
    const fz = Math.min(Math.max((z + EXT) / (H + EXT * 2), 0), 1) * (rows - 1);
    const ix = Math.min(cols - 2, Math.floor(fx));
    const iz = Math.min(rows - 2, Math.floor(fz));
    const tx = smooth01(fx - ix);
    const tz = smooth01(fz - iz);
    const v =
      (g[iz][ix] * (1 - tx) + g[iz][ix + 1] * tx) * (1 - tz) +
      (g[iz + 1][ix] * (1 - tx) + g[iz + 1][ix + 1] * tx) * tz;
    const d = Math.min(distToBoard(x, z), distToPath(x, z));
    return v * 240 * smoothstep(30, 380, d);
  }
  private pineGeo!: THREE.BufferGeometry;
  private leafGeo!: THREE.BufferGeometry;
  private outerTrunkMat!: THREE.MeshStandardMaterial;
  private outerPineMat!: THREE.MeshStandardMaterial;
  private outerLeafMat!: THREE.MeshStandardMaterial;
  private poolFills: THREE.MeshStandardMaterial[] = [];
  private groundRepX = 1;
  private groundRepY = 1;

  private buildLevelMeshes(maxAniso: number) {
    const b = biome();
    this.terrainGrid = TERRAIN[getLayout()] ?? TERRAIN.classic;
    const gw = W + EXT * 2;
    const gh = H + EXT * 2;

    const terrainGeo = new THREE.PlaneGeometry(gw, gh, 120, 96).rotateX(-Math.PI / 2);
    const tpos = terrainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tpos.count; i++) {
      tpos.setY(i, this.terrainHeightAt(tpos.getX(i) + W / 2, tpos.getZ(i) + H / 2));
    }
    terrainGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(terrainGeo, this.grassMatRef);
    terrain.position.set(W / 2, 0, H / 2);
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    this.levelMeshes.push(terrain);

    const nearTiles: THREE.Vector3[] = [];
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const p = new THREE.Vector3((gx + 0.5) * CELL, 0, (gy + 0.5) * CELL);
        if (PATH_CELLS.has(`${gx},${gy}`)) continue;
        const near =
          PATH_CELLS.has(`${gx - 1},${gy}`) || PATH_CELLS.has(`${gx + 1},${gy}`) ||
          PATH_CELLS.has(`${gx},${gy - 1}`) || PATH_CELLS.has(`${gx},${gy + 1}`);
        if (near) nearTiles.push(p);
      }
    }

    const gravelNor = photoTex('gravelN', 1, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      map: photoTex('gravel', 1, 1) ?? tiled(stoneTexture(), 1, 1),
      normalMap: gravelNor,
      bumpScale: 0.8,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: '#b0b0b0',
      roughness: 0.95,
      metalness: 0,
    });
    if (!gravelNor) rockMat.bumpMap = tiled(stoneBumpTex(), 1, 1);
    this.rockMatRef = rockMat;

    const roadTexCfg: Record<string, [string, string, () => THREE.CanvasTexture, () => THREE.CanvasTexture]> = {
      dirt: ['path', 'pathN', pathTexture, pathBumpTex],
      paved: ['cobble', 'cobbleN', stoneTexture, stoneBumpTex],
      mountain: ['gravel', 'gravelN', stoneTexture, stoneBumpTex],
      swamp: ['carapace', 'carapaceN', pathTexture, pathBumpTex],
    };
    const [photoKey, photoNKey, procTex, procBump] = roadTexCfg[b.road];
    const pathTex = photoTex(photoKey, 1, 1) ?? tiled(procTex(), 1, 1);
    const pathNor = photoTex(photoNKey, 1, 1);
    pathTex.anisotropy = maxAniso;
    pathNor?.anisotropy && (pathNor.anisotropy = maxAniso);
    const pathMat = new THREE.MeshStandardMaterial({
      map: pathTex,
      normalMap: pathNor,
      bumpScale: pathNor ? 0 : 0.55,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: b.road === 'paved' ? 0.8 : b.road === 'swamp' ? 0.85 : 0.92,
      metalness: 0,
      color: b.pathTint,
      vertexColors: true,
    });
    if (!pathNor) pathMat.bumpMap = tiled(procBump(), 1, 1);
    this.pathMatRef = pathMat;
    if (pathMat.map) {
      pathMat.map.wrapS = THREE.RepeatWrapping;
      pathMat.map.wrapT = THREE.RepeatWrapping;
    }

    const pushInstanced = (mesh: THREE.InstancedMesh) => {
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.levelMeshes.push(mesh);
    };
    const pushMesh = (mesh: THREE.Mesh) => {
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.levelMeshes.push(mesh);
    };

    const samples = pathSamples(12);
    const totalD = samples[samples.length - 1].d;

    if (b.road === 'swamp') {
      const mudMat = new THREE.MeshStandardMaterial({ color: '#241d2b', roughness: 0.95, metalness: 0 });
      pushMesh(new THREE.Mesh(flatRibbonGeo(samples, (CELL + 0.5) / 2, 0.12, CELL, 0, 1), mudMat));

      const plankMat = pathMat.clone();
      plankMat.vertexColors = false;
      const plankGeo = new THREE.BoxGeometry(CELL - 9, 1.1, 10);
      const plankMesh = new THREE.InstancedMesh(plankGeo, plankMat, Math.ceil(totalD / 40) * 3 + 6);
      const postGeo = new THREE.BoxGeometry(2.2, 7, 2.2);
      const postMat = new THREE.MeshStandardMaterial({ color: '#2a2130', roughness: 0.9 });
      const postMesh = new THREE.InstancedMesh(postGeo, postMat, Math.ceil(totalD / 48) * 2 + 4);
      const pm2 = new THREE.Matrix4();
      const pq2 = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const pc2 = new THREE.Color();
      let pi = 0;
      let qi = 0;
      let lastPlank = -100;
      let lastPost = -100;
      for (const s of samples) {
        if (s.d - lastPlank >= 40) {
          lastPlank = s.d;
          pq2.setFromAxisAngle(up, Math.atan2(-s.tz, s.tx));
          for (const off of [-16, 0, 16]) {
            const wob = 0.9 + Math.random() * 0.3;
            pm2.compose(
              new THREE.Vector3(s.x - s.tz * off, 1.3 * wob, s.z + s.tx * off),
              pq2,
              new THREE.Vector3(1, 1, 1),
            );
            plankMesh.setMatrixAt(pi, pm2);
            pc2.setScalar(0.75 + Math.random() * 0.3);
            plankMesh.setColorAt(pi, pc2);
            pi++;
          }
        }
        if (s.d - lastPost >= 48) {
          lastPost = s.d;
          for (const e of [-1, 1]) {
            pm2.compose(
              new THREE.Vector3(s.x - s.tz * e * 18, -1.4, s.z + s.tx * e * 18),
              pq2,
              new THREE.Vector3(1, 1, 1),
            );
            postMesh.setMatrixAt(qi, pm2);
            qi++;
          }
        }
      }
      plankMesh.count = pi;
      postMesh.count = qi;
      pushInstanced(plankMesh);
      pushInstanced(postMesh);
    } else {
      const roadHalf = b.road === 'mountain' ? (CELL - 5) / 2 : b.road === 'paved' ? (CELL + 2) / 2 : (CELL + 0.5) / 2;
      const roadY = b.road === 'mountain' ? 1.15 : 1.0;
      const skirtBot = b.road === 'mountain' ? -2.0 : -0.9;
      pushMesh(new THREE.Mesh(flatRibbonGeo(samples, roadHalf, roadY, CELL * 1.05), pathMat));
      for (const side of [-1, 1]) {
        const skirtMat = b.road === 'mountain' ? rockMat : pathMat;
        pushMesh(new THREE.Mesh(wallStripGeo(samples, side * roadHalf, roadY, skirtBot, CELL * 1.05, b.road === 'mountain' ? 1 : 0.55), skirtMat));
      }

      if (b.road === 'paved') {
        const curbMat = new THREE.MeshStandardMaterial({
          map: photoTex('cobble', 2, 2) ?? tiled(stoneTexture(), 2, 2),
          roughness: 0.85,
          color: '#8b8f96',
        });
        for (const side of [-1, 1]) {
          pushMesh(new THREE.Mesh(wallStripGeo(samples, side * (roadHalf + 1.8), 1.8, 0, CELL * 0.9, 0.9), curbMat));
          pushMesh(new THREE.Mesh(flatRibbonGeo(samples, 2.2, 1.8, CELL * 0.9, side * (roadHalf + 1.8), 0.95), curbMat));
        }
      }

      if (b.road === 'mountain') {
        const boulderGeo = new THREE.DodecahedronGeometry(4.6);
        const boulderMesh = new THREE.InstancedMesh(boulderGeo, rockMat, Math.ceil(samples.length / 5) + 2);
        const pm4 = new THREE.Matrix4();
        const pq4 = new THREE.Quaternion();
        let bi = 0;
        let lastB = -100;
        for (const s of samples) {
          if (s.d - lastB < 30 || Math.random() >= 0.5) continue;
          lastB = s.d;
          const side = Math.random() < 0.5 ? -1 : 1;
          const off = roadHalf + 3 + Math.random() * 5;
          pq4.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
          pm4.compose(
            new THREE.Vector3(s.x - s.tz * side * off, 1.1, s.z + s.tx * side * off),
            pq4,
            new THREE.Vector3(0.6 + Math.random() * 0.9, 0.5 + Math.random() * 0.8, 0.6 + Math.random() * 0.9),
          );
          boulderMesh.setMatrixAt(bi, pm4);
          bi++;
        }
        boulderMesh.count = bi;
        boulderMesh.castShadow = true;
        pushInstanced(boulderMesh);
      }
    }

    const borderGeo = new THREE.BoxGeometry(CELL - 1, 1, CELL - 1);
    const stoneTex = photoTex('cobble', 1, 1) ?? tiled(stoneTexture(), 1, 1);
    const stoneNor = photoTex('cobbleN', 1, 1);
    stoneTex.anisotropy = maxAniso;
    stoneNor?.anisotropy && (stoneNor.anisotropy = maxAniso);
    const borderMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      normalMap: stoneNor,
      bumpScale: stoneNor ? 0 : 0.6,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95,
      metalness: 0,
      color: '#cfcfcf',
    });
    if (!stoneNor) borderMat.bumpMap = tiled(stoneBumpTex(), 1, 1);
    const borderMesh = new THREE.InstancedMesh(borderGeo, borderMat, nearTiles.length);
    const bc = new THREE.Color();
    const pm = new THREE.Matrix4();
    nearTiles.forEach((p, i) => {
      pm.makeTranslation(p.x, -0.35, p.z);
      borderMesh.setMatrixAt(i, pm);
      bc.setScalar(0.85 + Math.random() * 0.25);
      borderMesh.setColorAt(i, bc);
    });
    borderMesh.receiveShadow = true;
    this.scene.add(borderMesh);
    this.levelMeshes.push(borderMesh);

    const decorGeo = new THREE.DodecahedronGeometry(2.4);
    const decorMesh = new THREE.InstancedMesh(decorGeo, rockMat, DECOR.length);
    const dm = new THREE.Matrix4();
    const dq = new THREE.Quaternion();
    const ds = new THREE.Vector3();
    DECOR.forEach((d, i) => {
      dq.setFromEuler(new THREE.Euler(d.a * 6, d.a * 9, d.a * 4));
      ds.setScalar(0.5 + d.r * 0.4);
      dm.compose(new THREE.Vector3(d.x, 1, d.y), dq, ds);
      decorMesh.setMatrixAt(i, dm);
    });
    decorMesh.castShadow = true;
    decorMesh.receiveShadow = true;
    this.scene.add(decorMesh);
    this.levelMeshes.push(decorMesh);

    const tuftGeo = new THREE.PlaneGeometry(8, 10);
    tuftGeo.translate(0, 5, 0);
    const tuftMat = new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS.length);
    const tq = new THREE.Quaternion();
    const ts = new THREE.Vector3();
    TUFTS.forEach((tf, i) => {
      tq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tf.rot);
      ts.setScalar(tf.scale);
      dm.compose(new THREE.Vector3(tf.x, 0, tf.y), tq, ts);
      tuftMesh.setMatrixAt(i, dm);
    });
    tuftMesh.receiveShadow = true;
    this.scene.add(tuftMesh);
    this.levelMeshes.push(tuftMesh);

    this.poolFills = [];
    const waterMat = new THREE.MeshStandardMaterial({
      color: b.poolColor,
      emissive: b.poolEmissive,
      emissiveIntensity: 0.5,
      roughness: b.poolRough,
      metalness: b.poolMetal,
      transparent: b.poolOpacity < 1,
      opacity: b.poolOpacity,
    });
    const shoreMat = new THREE.MeshStandardMaterial({ color: b.shore, roughness: 0.95, metalness: 0 });
    this.poolFills.push(waterMat);
    for (const cl of POOL_CLUSTERS) {
      let s = cl.seed;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      const baseBlobs = cl.cells.map(([gx, gy]) => ({
        x: (gx + 0.5) * CELL + (rand() - 0.5) * 14,
        y: (gy + 0.5) * CELL + (rand() - 0.5) * 14,
        r: CELL * (0.48 + rand() * 0.16),
      }));
      const mkBlobs = (scale: number) => baseBlobs.map(bl => ({ x: bl.x, y: bl.y, r: bl.r * scale }));
      const contour = (blobs: { x: number; y: number; r: number }[]) => {
        const loops = metaballContours(blobs, 9, cl.seed);
        loops.sort((p, q) => q.length - p.length);
        return chaikin(loops[0] ?? [], 2);
      };
      const waterPts = contour(mkBlobs(1));
      const shorePts = contour(mkBlobs(1.3));
      if (!waterPts.length) continue;
      const mkMesh = (pts: Pt2[], mat: THREE.Material, y: number) => {
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])))), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = y;
        return mesh;
      };
      const shoreMesh = mkMesh(shorePts, shoreMat, 0.07);
      shoreMesh.receiveShadow = true;
      this.scene.add(shoreMesh);
      this.levelMeshes.push(shoreMesh);
      const waterMesh = mkMesh(waterPts, waterMat, 0.18);
      this.scene.add(waterMesh);
      this.levelMeshes.push(waterMesh);
      const cx = waterPts.reduce((s2, p) => s2 + p[0], 0) / waterPts.length;
      const cz = waterPts.reduce((s2, p) => s2 + p[1], 0) / waterPts.length;
      const rocks = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < rocks; i++) {
        const p = waterPts[Math.floor(rand() * waterPts.length)];
        const ang = Math.atan2(p[1] - cz, p[0] - cx);
        const px = p[0] + Math.cos(ang) * (5 + rand() * 9);
        const pz = p[1] + Math.sin(ang) * (5 + rand() * 9);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + rand() * 1.8), this.rockMatRef);
        rock.position.set(px, 0.5, pz);
        rock.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        rock.castShadow = true;
        this.scene.add(rock);
        this.levelMeshes.push(rock);
      }
    }

    const treeCells = [...TREE_CELLS].map(c => c.split(',').map(Number));
    const boardPines: [number, number][] = [];
    const boardLeaves: [number, number][] = [];
    treeCells.forEach(([cx, cy], i) => {
      (i % 3 === 2 ? boardLeaves : boardPines).push([(cx + 0.5) * CELL, (cy + 0.5) * CELL]);
    });
    const mkBoard = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, list: [number, number][]) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const tm = new THREE.Matrix4();
      const tq2 = new THREE.Quaternion();
      const ts2 = new THREE.Vector3();
      const tc = new THREE.Color();
      list.forEach(([tx, tz], i) => {
        tq2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
        ts2.setScalar(0.55 + ((i * 7919) % 100) / 240);
        tm.compose(new THREE.Vector3(tx, 0, tz), tq2, ts2);
        mesh.setMatrixAt(i, tm);
        tc.setScalar(0.9 + ((i * 2654435) % 100) / 500);
        mesh.setColorAt(i, tc);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.levelMeshes.push(mesh);
    };
    const boardTrunk = new THREE.MeshStandardMaterial({ color: b.trunk, roughness: 1, metalness: 0, flatShading: true });
    const boardPine = new THREE.MeshStandardMaterial({ color: b.pine, roughness: 1, metalness: 0, flatShading: true });
    const boardLeaf = new THREE.MeshStandardMaterial({ color: b.leaf, roughness: 1, metalness: 0, flatShading: true });
    const trunkGeo = mergeGeometries([new THREE.CylinderGeometry(0.9, 1.4, 5, 6).translate(0, 2.5, 0).toNonIndexed()], true)!;
    mkBoard(trunkGeo, boardTrunk, treeCells.map(([cx, cy]) => [(cx + 0.5) * CELL, (cy + 0.5) * CELL] as [number, number]));
    mkBoard(this.pineGeo, boardPine, boardPines);
    mkBoard(this.leafGeo, boardLeaf, boardLeaves);

    this.buildOuterScatter();
  }

  refreshLevel() {
    for (const m of this.levelMeshes) {
      this.scene.remove(m);
      disposeObj(m);
    }
    this.levelMeshes = [];
    this.buildLevelMeshes(this.renderer.capabilities.getMaxAnisotropy());
    const b = biome();
    const groundProc = b.groundMap === 'grass' ? grassTexture() : stoneTexture();
    const gm = photoTex(b.groundMap, this.groundRepX, this.groundRepY) ?? tiled(groundProc, this.groundRepX * 0.6, this.groundRepY * 0.6);
    const gn = photoTex(b.groundMapN, this.groundRepX, this.groundRepY);
    this.grassMatRef.map = gm;
    this.grassMatRef.normalMap = gn;
    if (!gn) this.grassMatRef.bumpMap = tiled(b.groundMap === 'grass' ? grassBumpTex() : stoneBumpTex(), this.groundRepX * 0.6, this.groundRepY * 0.6);
    else this.grassMatRef.bumpMap = null;
    this.grassMatRef.color.set(b.groundTint);
    this.grassMatRef.needsUpdate = true;
    this.outerTrunkMat.color.set(b.trunk);
    this.outerPineMat.color.set(b.pine);
    this.outerLeafMat.color.set(b.leaf);
    this.portalMat.color.set(b.poolColor);
    this.portalMat.emissive.set(b.poolEmissive);
    const spawn = GROUND_PATH[0];
    const exit = GROUND_PATH[GROUND_PATH.length - 1];
    this.portalGroup.position.set(spawn.x + 4, 0, spawn.y);
    this.coreGroup.position.set(exit.x - 16, 0, exit.y);
    this.waveRing.position.set(spawn.x, 1.7, spawn.y);
  }

  private buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1, metalness: 0, flatShading: true });
    const pineMat = new THREE.MeshStandardMaterial({ color: '#2e6b34', roughness: 1, metalness: 0, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4d8a3d', roughness: 1, metalness: 0, flatShading: true });
    this.outerTrunkMat = trunkMat;
    this.outerPineMat = pineMat;
    this.outerLeafMat = leafMat;

    this.pineGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.9, 1.4, 5, 6).translate(0, 2.5, 0).toNonIndexed(),
      new THREE.ConeGeometry(4.4, 8, 7).translate(0, 7.5, 0).toNonIndexed(),
      new THREE.ConeGeometry(3.1, 6.5, 7).translate(0, 12, 0).toNonIndexed(),
    ], true)!;
    this.leafGeo = mergeGeometries([
      new THREE.CylinderGeometry(1.0, 1.5, 6, 6).translate(0, 3, 0).toNonIndexed(),
      new THREE.IcosahedronGeometry(4.4, 0).translate(0, 9.2, 0),
    ], true)!;
  }

  private buildOuterScatter() {
    let oSeed = 4242;
    const orand = () => {
      oSeed = (oSeed * 1664525 + 1013904223) >>> 0;
      return oSeed / 4294967296;
    };
    const scatterPos = (margin: number): [number, number] => {
      let ox = 0, oz = 0;
      do {
        ox = -EXT + orand() * (W + EXT * 2);
        oz = -EXT + orand() * (H + EXT * 2);
      } while (ox > -margin && ox < W + margin && oz > -margin && oz < H + margin);
      return [ox, oz];
    };
    const om = new THREE.Matrix4();
    const oq = new THREE.Quaternion();
    const os = new THREE.Vector3();
    const oc = new THREE.Color();

    const outerRocks = 160;
    const outerRockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3.4), this.rockMatRef, outerRocks);
    const rockParams: [number, number, number, number, number][] = [];
    for (let i = 0; i < outerRocks; i++) {
      const [ox, oz] = scatterPos(220);
      const ry = orand() * 6;
      const sc = 0.5 + orand() * 2.4;
      rockParams.push([ox, oz, ry, sc, 0]);
      oq.setFromEuler(new THREE.Euler(orand() * 6, ry, orand() * 6));
      os.setScalar(sc);
      om.compose(new THREE.Vector3(ox, this.terrainHeightAt(ox, oz) + 0.4, oz), oq, os);
      outerRockMesh.setMatrixAt(i, om);
    }
    outerRockMesh.receiveShadow = true;
    this.scene.add(outerRockMesh);
    this.levelMeshes.push(outerRockMesh);

    const outerTufts = 420;
    const outerTuftMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(8, 10).translate(0, 5, 0),
      new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 }),
      outerTufts,
    );
    for (let i = 0; i < outerTufts; i++) {
      const [ox, oz] = scatterPos(180);
      oq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), orand() * Math.PI * 2);
      os.setScalar(0.7 + orand() * 1.4);
      om.compose(new THREE.Vector3(ox, this.terrainHeightAt(ox, oz), oz), oq, os);
      outerTuftMesh.setMatrixAt(i, om);
    }
    this.scene.add(outerTuftMesh);
    this.levelMeshes.push(outerTuftMesh);

    const mkForest = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, count: number) => {
      const mesh = new THREE.InstancedMesh(geo, [this.outerTrunkMat, mat], count);
      for (let i = 0; i < count; i++) {
        const [x, z] = scatterPos(320);
        oq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), orand() * Math.PI * 2);
        os.setScalar(0.9 + orand() * 1.7);
        om.compose(new THREE.Vector3(x, this.terrainHeightAt(x, z), z), oq, os);
        mesh.setMatrixAt(i, om);
        oc.setScalar(0.85 + orand() * 0.35);
        mesh.setColorAt(i, oc);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.levelMeshes.push(mesh);
    };
    mkForest(this.pineGeo, this.outerPineMat, 70);
    mkForest(this.leafGeo, this.outerLeafMat, 60);
  }

  private buildFireflies() {
    const N = 64;
    const base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      base[i * 3] = Math.random() * (W + 400) - 200;
      base[i * 3 + 1] = 4 + Math.random() * 12;
      base[i * 3 + 2] = Math.random() * (H + 200) - 100;
    }
    this.fireBase = base;
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 32;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(226,255,150,0.85)');
    g.addColorStop(1, 'rgba(190,240,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    this.fireMat = new THREE.PointsMaterial({
      color: '#e8ffa0',
      size: 3.2,
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, this.fireMat);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  private buildMist() {
    const blobTex = cloudShadowTexture();
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0, depthWrite: false, color: '#dfe8f2' });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(620 + Math.random() * 420, 260 + Math.random() * 140), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.7;
      mesh.position.set(Math.random() * (W + 800) - 400, 7 + Math.random() * 9, Math.random() * (H + 400) - 200);
      this.scene.add(mesh);
      this.mists.push({ mesh, mat, speed: 5 + Math.random() * 9, phase: Math.random() * Math.PI * 2 });
    }
  }

  private buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#f4f7ff', roughness: 1, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false });
    this.cloudMat = cloudMat;
    const blobTex = cloudShadowTexture();
    let seed = 9001;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 9; i++) {
      const group = new THREE.Group();
      const puffs = 3 + Math.floor(rand() * 3);
      for (let j = 0; j < puffs; j++) {
        const pr = 26 + rand() * 30;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(pr, 10, 8), cloudMat);
        puff.position.set((j - puffs / 2) * (pr * 0.9) + (rand() - 0.5) * 16, (rand() - 0.5) * 8, (rand() - 0.5) * 30);
        puff.scale.set(1 + rand() * 0.6, 0.5 + rand() * 0.2, 0.8 + rand() * 0.4);
        group.add(puff);
      }
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 1.2;
      this.scene.add(blob);
      const span = W + 800;
      this.clouds.push({
        group,
        blob,
        x0: rand() * span,
        z: -160 + rand() * (H + 320),
        y0: 150 + rand() * 110,
        speed: 7 + rand() * 9,
        scale: 0.8 + rand() * 0.7,
      });
      this.scene.add(group);
    }
  }

  private buildRain() {
    const DROPS = 420;
    this.rainBase = new Float32Array(DROPS * 3);
    const pos = new Float32Array(DROPS * 6);
    let seed = 555;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < DROPS; i++) {
      this.rainBase[i * 3] = -400 + rand() * (W + 800);
      this.rainBase[i * 3 + 1] = rand() * 300;
      this.rainBase[i * 3 + 2] = -300 + rand() * (H + 600);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({ color: '#a9c8e8', transparent: true, opacity: 0 });
    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  private buildCelestials() {
    this.sunMeshMat = new THREE.MeshBasicMaterial({ color: '#fff2c8', fog: false, transparent: true, opacity: 0.95 });
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(58, 18, 14), this.sunMeshMat);
    this.scene.add(this.sunMesh);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(34, 18, 14), new THREE.MeshBasicMaterial({ color: '#e6edff', fog: false, transparent: true, opacity: 0.95 }));
    this.scene.add(this.moonMesh);

    const birdMat = new THREE.MeshBasicMaterial({ color: '#101826', fog: false });
    const bodyGeo = new THREE.ConeGeometry(1.4, 5, 4).rotateZ(Math.PI / 2);
    const wingGeo = new THREE.PlaneGeometry(5.5, 2);
    for (let f = 0; f < 2; f++) {
      const flock = new THREE.Group();
      const wings: THREE.Mesh[] = [];
      for (let b = 0; b < 4; b++) {
        const bird = new THREE.Group();
        bird.add(new THREE.Mesh(bodyGeo, birdMat));
        const wl = new THREE.Mesh(wingGeo, birdMat);
        wl.position.set(-1.5, 0.4, 0);
        wl.rotation.x = Math.PI / 2;
        bird.add(wl);
        const wr = new THREE.Mesh(wingGeo, birdMat);
        wr.position.set(1.5, 0.4, 0);
        wr.rotation.x = Math.PI / 2;
        bird.add(wr);
        bird.position.set((b - 1.5) * 14, (b % 2) * 5, (b % 2) * -8);
        flock.add(bird);
        wings.push(wl, wr);
      }
      flock.visible = false;
      this.scene.add(flock);
      this.birds.push({ group: flock, wings });
      this.birdFlocks.push({
        group: flock,
        speed: 34 + f * 16,
        y: 190 + f * 60,
        z: 120 + f * 380,
        offset: f * 700,
      });
    }

    const flyConfigs = [
      { night: true, n: 36, color: '#d9f99d', size: 3 },
      { night: false, n: 22, color: '#fef3c7', size: 4.5 },
    ];
    for (const cfg of flyConfigs) {
      const base = new Float32Array(cfg.n * 3);
      const phase = new Float32Array(cfg.n);
      let seed = cfg.night ? 77 : 78;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < cfg.n; i++) {
        base[i * 3] = rand() * W;
        base[i * 3 + 1] = 6 + rand() * 16;
        base[i * 3 + 2] = rand() * H;
        phase[i] = rand() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cfg.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.PointsMaterial({ color: cfg.color, size: cfg.size, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.visible = false;
      this.scene.add(pts);
      this.flies.push({ pts, mat, base, phase, night: cfg.night });
    }
  }

  private buildRipples() {
    const geo = new THREE.RingGeometry(0.82, 1, 24);
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#bcd6ee', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 1.4;
      mesh.visible = false;
      this.scene.add(mesh);
      this.ripples.push({ mesh, mat, start: -10 });
    }
    const sTex = scorchTexture();
    const sGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: sTex, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(sGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.position.y = 1.05;
      mesh.visible = false;
      this.scene.add(mesh);
      this.scorches.push({ mesh, mat, born: -100 });
    }
  }

  private addScorch(x: number, y: number) {
    const s = this.scorches[this.scorchI++ % this.scorches.length];
    s.born = performance.now() / 1000;
    s.mesh.position.set(x, 1.05, y);
    const sc = 26 + Math.random() * 26;
    s.mesh.scale.set(sc, sc, 1);
  }

  intro() {
    this.introT = 2.4;
  }

  cinema(mode: 'victory' | 'defeat' | 'off') {
    this.cinemaMode = mode;
  }

  private buildMarkers() {
    const spawn = GROUND_PATH[0];
    this.portalMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 });
    const portal = new THREE.Mesh(new THREE.TorusGeometry(15, 2.2, 10, 40), this.portalMat);
    portal.rotation.y = Math.PI / 2;
    portal.position.set(0, 13, 0);
    this.portalGroup.add(portal);
    const portalLight = new THREE.PointLight('#22d3ee', 45, 260, 1.6);
    portalLight.position.set(2, 16, 0);
    this.portalGroup.add(portalLight);
    this.portalGroup.position.set(spawn.x + 4, 0, spawn.y);
    this.scene.add(this.portalGroup);

    const exit = GROUND_PATH[GROUND_PATH.length - 1];
    this.coreGroup.position.set(exit.x - 16, 0, exit.y);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(6.5, 1), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1.6, roughness: 0.3 }));
    core.position.y = 9;
    this.coreGroup.add(core);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(13, 1, 8, 40), new THREE.MeshStandardMaterial({ color: '#f87171', emissive: '#f87171', emissiveIntensity: 0.8 }));
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = 9;
    this.coreGroup.add(coreRing);
    this.coreGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 3, 6), std('#1e293b')) as THREE.Mesh);
    this.coreLight = new THREE.PointLight('#ef4444', 55, 320, 1.6);
    this.coreLight.position.y = 12;
    this.coreGroup.add(this.coreLight);
    this.scene.add(this.coreGroup);

    const keeperMat = new THREE.MeshStandardMaterial({ color: '#0e7490', emissive: '#22d3ee', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.5 });
    for (const i of [0, 1]) {
      const k = new THREE.Group();
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 4, 6, 10), keeperMat);
      k.add(pod);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshBasicMaterial({ color: '#a5f3fc' }));
      eye.position.set(0, 1.4, 2.4);
      k.add(eye);
      this.scene.add(k);
      this.keepers.push({ group: k, phase: i * Math.PI });
    }
  }

  nudgePan(dx: number, dy: number) {
    this.panBy(dx, dy);
  }

  setQuality(high: boolean) {
    this.renderer.shadowMap.enabled = high;
    this.bloomPass.enabled = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    this.w = -1;
    try {
      localStorage.setItem('nd_gfx', high ? '1' : '0');
    } catch {
      // ignore
    }
  }

  centerOn(x: number, z: number) {
    this.targetT.set(x, 0, z);
  }

  recenter() {
    this.targetT.set(W / 2, 0, H / 2);
    this.radiusT = 1250;
  }

  private panBy(dx: number, dy: number) {
    const panScale = this.radius * 0.0016;
    const sinT = Math.sin(this.theta);
    const cosT = Math.cos(this.theta);
    this.targetT.x = Math.min(W + 150, Math.max(-150, this.targetT.x - (dx * cosT - dy * sinT) * panScale));
    this.targetT.z = Math.min(H + 150, Math.max(-150, this.targetT.z - (-dx * sinT - dy * cosT) * panScale));
  }

  private attachControls() {    const el = this.glCanvas;
    const active = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;
    let lastMid: { x: number; y: number } | null = null;
    const pinchDist = () => {
      const pts = [...active.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };
    const midPt = () => {
      const pts = [...active.values()];
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    };
    el.addEventListener('pointerdown', e => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        lastPinch = pinchDist();
        lastMid = midPt();
        return;
      }
      this.dragBtn = e.button;
      this.lastPt = { x: e.clientX, y: e.clientY };
      this.dragDist = 0;
      this.introT = 0;
      if (this.cinemaMode !== 'off') {
        this.cinemaMode = 'off';
        this.radius = this.radiusT = Math.min(2600, Math.max(480, this.camRadius || this.radius));
        this.theta = this.thetaT = this.camTheta || this.theta;
        this.phi = this.phiT = Math.min(1.32, Math.max(0.3, this.camPhi || this.phi));
      }
    });
    el.addEventListener('pointermove', e => {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size >= 2) {
        const d = pinchDist();
        if (lastPinch > 0 && d > 0) {
          this.radiusT = Math.min(2600, Math.max(480, (this.radiusT * lastPinch) / d));
        }
        lastPinch = d;
        const m = midPt();
        if (lastMid) this.panBy(m.x - lastMid.x, m.y - lastMid.y);
        lastMid = m;
        return;
      }
      if (this.dragBtn === -1) return;
      const dx = e.clientX - this.lastPt.x;
      const dy = e.clientY - this.lastPt.y;
      this.lastPt = { x: e.clientX, y: e.clientY };
      this.dragDist += Math.abs(dx) + Math.abs(dy);
      if (this.dragBtn === 0) {
        this.thetaT -= dx * 0.005;
        this.phiT = Math.min(1.32, Math.max(0.3, this.phiT - dy * 0.005));
      } else {
        this.panBy(dx, dy);
      }
    });
    const release = (e: PointerEvent) => {
      active.delete(e.pointerId);
      lastPinch = 0;
      lastMid = null;
      this.dragBtn = -1;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.radiusT = Math.min(2600, Math.max(480, this.radiusT * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
  }

  pick(e: { clientX: number; clientY: number }): Vec | null {
    const rect = this.glCanvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const dir = this.raycaster.ray.direction;
    if (dir.y >= -1e-5) return null;
    const t = -this.raycaster.ray.origin.y / dir.y;
    const p = this.raycaster.ray.origin.clone().addScaledVector(dir, t);
    return { x: p.x, y: p.z };
  }

  update(s: RenderState) {
    this.resizeCheck();
    this.syncTowers(s);
    this.syncBarrels(s);
    this.syncCoins(s);
    this.syncEnemies(s);
    this.syncProjectiles(s);
    this.syncFx(s);
    this.syncGhost(s);
    this.syncAirstrike(s);

    const coreSpin = s.elapsed * 0.7;
    (this.coreGroup.children[1] as THREE.Mesh).rotation.z = coreSpin;
    const coreMesh = this.coreGroup.children[0] as THREE.Mesh;
    coreMesh.rotation.y = coreSpin * 1.4;
    const corePulse = 0.5 + 0.5 * Math.sin(s.elapsed * 3);
    (coreMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + corePulse;
    this.coreLight.intensity = 45 + corePulse * 25;
    this.portalMat.emissiveIntensity = 0.9 + 0.5 * Math.sin(s.elapsed * 4);
    this.keepers.forEach(k => {
      const a = s.elapsed * 0.5 + k.phase;
      k.group.position.set(
        this.coreGroup.position.x + Math.cos(a) * 22,
        10 + Math.sin(s.elapsed * 2 + k.phase) * 2,
        this.coreGroup.position.z + Math.sin(a) * 22,
      );
      k.group.rotation.y = -a - Math.PI / 2;
    });

    this.flashLight.intensity = Math.max(0, this.flashLight.intensity * (1 - 0.09) - 0.4);

    const ph = dayPhase(s.elapsed);
    const rain = s.weatherRain;
    const clear = s.weather === 'clear';
    const sa = ph.a;
    this.sun.position.set(
      W / 2 + Math.cos(sa) * 900,
      Math.max(40, Math.sin(sa) * 780),
      H / 2 - 460,
    );
    this.sun.intensity = (0.06 + 2.2 * ph.daylight) * (1 - 0.45 * rain);
    const sunsetK = Math.max(0, Math.min(1, 1 - ph.elev * 2.2)) * ph.daylight;
    this.sun.color.set('#fff0d4').lerp(new THREE.Color('#ff9448'), sunsetK);
    const ma = sa + Math.PI;
    this.moon.position.set(
      W / 2 + Math.cos(ma) * 900,
      Math.max(60, Math.sin(ma) * 780),
      H / 2 - 380,
    );
    this.moon.intensity = 0.55 * ph.night;
    this.hemi.intensity = (0.22 + 0.55 * ph.daylight) * (1 - 0.25 * rain) + s.bolt * 24;
    this.hemi.color.set('#a8c2e8').lerp(new THREE.Color('#2b3d63'), ph.night);
    this.hemi.groundColor.set('#3d4a33').lerp(new THREE.Color('#1a2231'), ph.night);
    this.fillLight.intensity = 0.12 + 0.25 * ph.daylight;
    this.nightSkyMat.opacity = ph.night * 0.97;
    this.scene.environmentIntensity = 0.12 + 0.35 * ph.daylight;
    this.renderer.toneMappingExposure = 1.12 - 0.14 * ph.night;
    const lanternGlow = 0.15 + 1.25 * ph.night + 0.12 * Math.sin(s.elapsed * 7.3) * ph.night;
    for (const lm of this.lanternMats) lm.emissiveIntensity = lanternGlow;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.set('#0d1626').lerp(new THREE.Color('#9db1cc'), ph.daylight).lerp(new THREE.Color('#5b6b80'), rain * 0.55);
    fog.near = 1400 - 800 * rain;
    fog.far = 3800 - 1900 * rain;
    this.grassMatRef.metalness = 0.32 * rain;
    this.grassMatRef.roughness = 0.95 - 0.4 * rain;
    this.pathMatRef.metalness = 0.28 * rain;
    this.pathMatRef.roughness = 0.92 - 0.38 * rain;
    this.cloudMat.opacity = clear ? 0 : 0.16 + 0.22 * rain;
    this.cloudMat.color.set('#f4f7ff').lerp(new THREE.Color('#8e9cb0'), rain * 0.7);
    for (const c of this.clouds) {
      c.group.visible = !clear;
      c.blob.visible = !clear;
    }

    const dropPos = (this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.rainMat.opacity = 0.3 * rain;
    this.rainLines.visible = rain > 0.02;    if (this.rainLines.visible) {
      for (let i = 0; i < this.rainBase.length / 3; i++) {
        const bx = this.rainBase[i * 3];
        const by = this.rainBase[i * 3 + 1];
        const bz = this.rainBase[i * 3 + 2];
        const y = ((by - s.elapsed * (240 + (i % 7) * 22)) % 300 + 300) % 300;
        dropPos[i * 6] = bx;
        dropPos[i * 6 + 1] = y;
        dropPos[i * 6 + 2] = bz;
        dropPos[i * 6 + 3] = bx + 1.5;
        dropPos[i * 6 + 4] = y + 6;
        dropPos[i * 6 + 5] = bz;
      }
      (this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    if (rain > 0.25 && Math.random() < rain * 0.5) {
      const r = this.ripples[this.rippleI++ % this.ripples.length];
      r.start = s.elapsed;
      r.mesh.position.set(Math.random() * W, 1.4, Math.random() * H);
    }
    for (const r of this.ripples) {
      const k = (s.elapsed - r.start) / 0.55;
      const active = k >= 0 && k < 1;
      r.mesh.visible = active;
      if (active) {
        const sc = 2 + 16 * k;
        r.mesh.scale.set(sc, sc, 1);
        r.mat.opacity = 0.4 * (1 - k) * rain;
      }
    }

    const tnow = performance.now() / 1000;
    for (const sc of this.scorches) {
      const age = tnow - sc.born;
      const active = age >= 0 && age < 32;
      sc.mesh.visible = active;
      if (active) sc.mat.opacity = 0.34 * (1 - age / 32);
    }

    const span = W + 800;
    this.clouds.forEach((c, i) => {
      const cx = -400 + ((c.x0 + s.elapsed * c.speed) % span);
      c.group.position.set(cx, c.y0 + Math.sin(s.elapsed * 0.3 + i * 1.7) * 7, c.z);
      c.group.scale.setScalar(c.scale);
      c.blob.position.set(cx, 1.2, c.z);
      c.blob.scale.setScalar(220 * c.scale);
      (c.blob.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.07 * ph.daylight;
    });

    const waveShow = s.countdown > 0;
    this.waveRing.visible = waveShow;
    if (waveShow) {
      const wr = 34 + 7 * Math.sin(s.elapsed * 4.5);
      this.waveRing.scale.set(wr, wr, 1);
      (this.waveRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.35 * Math.sin(s.elapsed * 4.5);
    }

    const focusE = s.focusId !== null ? s.enemies.find(e => e.id === s.focusId) : null;
    this.focusRing.visible = !!focusE;
    if (focusE) {
      this.focusRing.position.set(focusE.x, 20 + Math.sin(s.elapsed * 4) * 2, focusE.y);
      this.focusRing.rotation.set(-Math.PI / 2, 0, s.elapsed * 3);
    }

    this.sunMesh.position.copy(this.sun.position).normalize().multiplyScalar(3950);
    this.sunMesh.visible = ph.daylight > 0.02;
    this.sunMeshMat.color.set('#fff2c8').lerp(new THREE.Color('#ff9448'), sunsetK);
    this.moonMesh.position.copy(this.moon.position).normalize().multiplyScalar(3950);
    this.moonMesh.visible = ph.night > 0.15;

    const birdDay = ph.daylight > 0.5;
    const birdSpan = W + 1400;
    this.birdFlocks.forEach((f, i) => {
      f.group.visible = birdDay;
      if (!birdDay) return;
      const bx = -700 + ((s.elapsed * f.speed + f.offset) % birdSpan);
      f.group.position.set(bx, f.y + Math.sin(s.elapsed * 0.5 + i) * 7, f.z);
      f.group.children.forEach((_bird, b) => {
        const flap = Math.sin(s.elapsed * 11 + b * 1.3) * 0.55;
        const wings = this.birds[i].wings;
        wings[b * 2].rotation.z = flap;
        wings[b * 2 + 1].rotation.z = -flap;
      });
    });

    for (const fl of this.flies) {
      const op = fl.night ? ph.night * 0.9 : ph.daylight * 0.85;
      fl.mat.opacity = op;
      fl.pts.visible = op > 0.03;
      if (!fl.pts.visible) continue;
      const arr = (fl.pts.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < fl.phase.length; i++) {
        const p = fl.phase[i];
        arr[i * 3] = fl.base[i * 3] + Math.sin(s.elapsed * 0.6 + p) * 14;
        arr[i * 3 + 1] = fl.base[i * 3 + 1] + Math.sin(s.elapsed * 1.1 + p * 2) * 5;
        arr[i * 3 + 2] = fl.base[i * 3 + 2] + Math.cos(s.elapsed * 0.5 + p * 1.3) * 14;
      }
      (fl.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    const shakeX = (Math.random() - 0.5) * s.shake;
    const shakeZ = (Math.random() - 0.5) * s.shake;

    const now = performance.now() / 1000;
    const rdt = Math.min(0.05, now - this.lastNow);
    this.introT = Math.max(0, this.introT - rdt);
    this.lastNow = now;
    if (this.cinemaMode === 'off') {
      const camK = 1 - Math.exp(-rdt * 11);
      this.radius += (this.radiusT - this.radius) * camK;
      this.theta += (this.thetaT - this.theta) * camK;
      this.phi += (this.phiT - this.phi) * camK;
      this.target.lerp(this.targetT, camK);
    }
    const mistAmt = clear ? 0 : Math.exp(-((ph.daylight - 0.3) ** 2) / 0.018) * (1 - rain * 0.7);
    for (const m of this.mists) {
      m.mesh.position.x += m.speed * rdt;
      if (m.mesh.position.x > W + 700) m.mesh.position.x = -700;
      m.mat.opacity = mistAmt * (0.05 + 0.03 * Math.sin(s.elapsed * 0.35 + m.phase));
    }
    const barActive = this.cinemaMode !== 'off' || this.introT > 0 || s.photo;
    this.barT += ((barActive ? 1 : 0) - this.barT) * Math.min(1, rdt * 4);
    if (s.photo) this.thetaT += rdt * 0.025;

    this.fireMat.opacity = ph.night * 0.9;
    if (ph.night > 0.02) {
      const fp = (this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.fireBase.length / 3; i++) {
        const t = s.elapsed * 0.7 + i * 1.7;
        fp[i * 3] = this.fireBase[i * 3] + Math.sin(t * 0.9 + i) * 9;
        fp[i * 3 + 1] = this.fireBase[i * 3 + 1] + Math.sin(t * 1.3 + i * 2.1) * 2.5;
        fp[i * 3 + 2] = this.fireBase[i * 3 + 2] + Math.cos(t * 0.8 + i * 0.7) * 9;
      }
      (this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const pf of this.poolFills) pf.emissiveIntensity = 0.55 + 0.28 * Math.sin(s.elapsed * 2.4);
    let radius = this.radius;
    let theta = this.theta;
    let phi = this.phi;
    if (this.introT > 0) {
      const e = (this.introT / 2.4) ** 2;
      radius += 1000 * e;
      theta += 1.1 * e;
      phi = Math.min(1.32, phi + 0.3 * e);
    }
    if (this.cinemaMode !== 'off') {
      theta += rdt * (this.cinemaMode === 'defeat' ? 0.22 : 0.1);
      if (this.cinemaMode === 'victory') radius += (1900 - radius) * Math.min(1, rdt * 1.2);
      phi += ((this.cinemaMode === 'defeat' ? 1.05 : 0.9) - phi) * Math.min(1, rdt * 1.5);
    }
    this.camRadius = radius;
    this.camTheta = theta;
    this.camPhi = phi;
    const spI = Math.sin(phi);
    const cpI = Math.cos(phi);
    this.camera.position.set(
      this.target.x + spI * Math.sin(theta) * radius + shakeX,
      cpI * radius,
      this.target.z + spI * Math.cos(theta) * radius + shakeZ,
    );
    this.camera.lookAt(this.target.x + shakeX * 0.4, 0, this.target.z + shakeZ * 0.4);

    this.composer.render();
    if (this.shotWanted) {
      this.shotWanted = false;
      this.takeShot();
    }
    this.drawOverlay(s);
  }

  private shotWanted = false;

  requestShot() {
    this.shotWanted = true;
  }

  private takeShot() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.glCanvas, 0, 0, this.w, this.h);
    const fx = this.glCanvas.parentElement?.querySelector('.fx-canvas') as HTMLCanvasElement | null;
    if (fx) ctx.drawImage(fx, 0, 0, this.w, this.h);
    const a = document.createElement('a');
    a.download = `neon-defense-${Date.now()}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  private resizeCheck() {
    const cw = this.glCanvas.clientWidth;
    const ch = this.glCanvas.clientHeight;
    if (cw !== this.w || ch !== this.h) {
      this.w = cw;
      this.h = ch;
      this.renderer.setSize(cw, ch, false);
      this.composer.setSize(cw, ch);
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.overlay.width = cw * dpr;
      this.overlay.height = ch * dpr;
      this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vc = document.createElement('canvas');
      vc.width = cw;
      vc.height = ch;
      const vctx = vc.getContext('2d')!;
      const vg = vctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.44, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      vctx.fillStyle = vg;
      vctx.fillRect(0, 0, cw, ch);
      this.vigCv = vc;
    }
  }

  private buildTowerView(kind: TowerKind): TowerView {
    const def = TOWERS[kind];
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(15, 17.5, 9, 10), getMetalGray().clone());
    base.position.y = 4.5;
    base.castShadow = true;
    group.add(base);
    const ringMat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.35, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13.5, 1.1, 8, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 9.2;
    group.add(ring);

    const yaw = new THREE.Group();
    yaw.position.y = 13;
    group.add(yaw);

    let barrel: THREE.Object3D | null = null;
    let barrelBaseX = 0;
    let flash: THREE.Mesh | null = null;
    let spinnerObj: THREE.Object3D | null = null;
    const flashMat = new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

    const addBarrel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number) => {
      barrel = new THREE.Mesh(geo, mat);
      barrel.castShadow = true;
      barrelBaseX = x;
      barrel.position.x = x;
      yaw.add(barrel);
    };

    switch (kind) {
      case 'gun': {
        const turret = new THREE.Mesh(new THREE.BoxGeometry(11, 7, 8), getMetalTint('#8fa1b8').clone());
        turret.castShadow = true;
        yaw.add(turret);
        addBarrel(new THREE.CylinderGeometry(1.7, 1.7, 15, 10).rotateZ(-Math.PI / 2), getMetalTint(def.color).clone(), 11);
        break;
      }
      case 'cannon': {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 7, 10), getMetalTint('#8fa1b8').clone());
        turret.castShadow = true;
        yaw.add(turret);
        addBarrel(new THREE.CylinderGeometry(2.8, 3.1, 18, 12).rotateZ(-Math.PI / 2), getMetalTint(def.color).clone(), 12);
        break;
      }
      case 'sniper': {
        const turret = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 6), getMetalTint('#8fa1b8').clone());
        turret.castShadow = true;
        yaw.add(turret);
        addBarrel(new THREE.CylinderGeometry(1.1, 1.1, 24, 8).rotateZ(-Math.PI / 2), getMetalTint(def.color).clone(), 14);
        const scope = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 10), std('#fecdd3', { emissive: '#fecdd3', emissiveIntensity: 0.5 }));
        scope.position.set(4, 4, 0);
        yaw.add(scope);
        break;
      }
      case 'flame': {
        const tank = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 9), getMetalTint('#7f1d1d').clone());
        tank.castShadow = true;
        yaw.add(tank);
        addBarrel(new THREE.CylinderGeometry(2.6, 3.2, 12, 10).rotateZ(-Math.PI / 2), getMetalTint(def.color).clone(), 9);
        break;
      }
      case 'missile': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(15, 9, 13), getMetalTint('#5b6b82').clone());
        box.castShadow = true;
        yaw.add(box);
        for (const [ox, oz] of [[-3.5, -3.2], [3.5, -3.2], [-3.5, 3.2], [3.5, 3.2]]) {
          const rocket = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 8).rotateZ(-Math.PI / 2), getMetalTint(def.color).clone());
          rocket.position.set(ox, 0, oz);
          yaw.add(rocket);
        }
        break;
      }
      case 'frost': {
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(8), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true }));
        crystal.position.y = 3;
        crystal.castShadow = true;
        yaw.add(crystal);
        const inner = new THREE.Mesh(new THREE.OctahedronGeometry(3.6), new THREE.MeshStandardMaterial({ color: '#cffafe', emissive: '#cffafe', emissiveIntensity: 0.8 }));
        inner.position.y = 3;
        yaw.add(inner);
        break;
      }
      case 'tesla': {
        for (const [i, r] of [4.5, 3.4, 2.4].entries()) {
          const coil = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.6, 2.6, 10), getMetalTint('#475569').clone());
          coil.position.y = -2 + i * 3;
          coil.castShadow = true;
          yaw.add(coil);
        }
        const orb = new THREE.Mesh(new THREE.SphereGeometry(3.6, 14, 14), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.4 }));
        orb.position.y = 8;
        yaw.add(orb);
        break;
      }
      case 'amp': {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(10, 12.5, 7, 6), std('#14532d', { emissive: '#14532d', emissiveIntensity: 0.3 }));
        pylon.position.y = 2;
        pylon.castShadow = true;
        yaw.add(pylon);
        break;
      }
      case 'bank': {
        const vault = new THREE.Mesh(new THREE.BoxGeometry(17, 11, 15), getMetalTint('#6b5518').clone());
        vault.position.y = 3;
        vault.castShadow = true;
        group.add(vault);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 17, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), getMetalTint('#8a6d1f').clone());
        lid.position.y = 8.5;
        lid.castShadow = true;
        group.add(lid);
        const emblem = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.75, 8, 22), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#fde047', emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6 }));
        emblem.position.set(0, 4.5, 7.9);
        group.add(emblem);
        const spinner = new THREE.Group();
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.1, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#b45309', emissiveIntensity: 0.6, metalness: 0.85, roughness: 0.25 }));
        spinner.add(coin);
        spinner.position.y = 24;
        group.add(spinner);
        spinnerObj = spinner;
        break;
      }
    }

    if (kind === 'gun' || kind === 'cannon' || kind === 'sniper' || kind === 'flame' || kind === 'missile') {
      flash = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 8), flashMat);
      flash.position.set(barrelBaseX + (kind === 'missile' ? 0 : 12), kind === 'missile' ? 0 : 0, 0);
      flash.visible = false;
      yaw.add(flash);
    }

    const levelCubes: THREE.Mesh[] = [];
    const cubeGeo = new THREE.BoxGeometry(3.4, 2, 2);
    for (let i = 0; i < 3; i++) {
      const cube = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 }));
      cube.position.set(-6 + i * 6, 1.2, 15.5);
      group.add(cube);
      levelCubes.push(cube);
    }

    const gems = new THREE.Group();
    const gemGeo = new THREE.OctahedronGeometry(2.2);
    for (let i = 0; i < 3; i++) {
      const gem = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#fde047', emissiveIntensity: 0.9, roughness: 0.3 }));
      gem.position.set(-8 + i * 8, 26, 0);
      gems.add(gem);
    }
    gems.visible = false;
    group.add(gems);

    let aura: THREE.Mesh | null = null;
    if (kind === 'amp') {
      aura = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 64),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 1.4;
      group.add(aura);
    }

    this.scene.add(group);
    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 56),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.y = 1.3;
    rangeRing.visible = false;
    group.add(rangeRing);

    return { group, yaw, barrel, barrelBaseX, flash, spinner: spinnerObj, ringMat, levelCubes, gems, aura, rangeRing, born: 0 };
  }

  private barrelViews = new Map<string, THREE.Group>();
  private coinViews = new Map<number, THREE.Mesh>();

  private syncBarrels(s: RenderState) {
    for (const [id, g] of this.barrelViews) {
      if (!s.barrels.some(b => `${b.x},${b.y}` === id)) {
        this.scene.remove(g);
        disposeObj(g);
        this.barrelViews.delete(id);
      }
    }
    s.barrels.forEach((b, i) => {
      const key = `${b.x},${b.y}`;
      let g = this.barrelViews.get(key);
      if (!g) {
        g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 12, 12), new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.55, metalness: 0.35 }));
        body.position.y = 6;
        body.castShadow = true;
        g.add(body);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(5.55, 5.55, 2.4, 12), new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.55, roughness: 0.4 }));
        band.position.y = 6;
        g.add(band);
        this.scene.add(g);
      }
      g.position.set(b.x, 0, b.y);
      g.rotation.y = s.elapsed * 0.4 + i;
      this.barrelViews.set(key, g);
    });
  }

  private syncCoins(s: RenderState) {
    for (const [id, m] of this.coinViews) {
      if (!s.coins.some(c => c.id === id)) {
        this.scene.remove(m);
        disposeObj(m);
        this.coinViews.delete(id);
      }
    }
    for (const c of s.coins) {
      let m = this.coinViews.get(c.id);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.CylinderGeometry(4.6, 4.6, 1.3, 16).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#facc15', emissiveIntensity: 0.65, roughness: 0.25, metalness: 0.85 }),
        );
        m.castShadow = true;
        this.scene.add(m);
      }
      const blink = c.t > 5.4 ? (Math.sin(c.t * 18) > 0 ? 1 : 0.25) : 1;
      m.visible = blink > 0.5;
      m.position.set(c.x, 5 + Math.sin(s.elapsed * 3 + c.id) * 1.6, c.y);
      m.rotation.y = s.elapsed * 3.2;
      this.coinViews.set(c.id, m);
    }
  }

  private syncTowers(s: RenderState) {
    for (const [id, view] of this.towerViews) {
      if (!s.towers.some(t => t.id === id)) {
        this.scene.remove(view.group);
        disposeObj(view.group);
        this.towerViews.delete(id);
      }
    }
    for (const t of s.towers) {
      let view = this.towerViews.get(t.id);
      if (!view) {
        view = this.buildTowerView(t.kind);
        view.group.position.set(t.x, 0, t.y);
        view.born = s.elapsed;
        this.towerViews.set(t.id, view);
      }
      const grow = Math.min(1, (s.elapsed - view.born) / 0.35);
      view.group.scale.setScalar(0.3 + 0.7 * grow);
      view.yaw.rotation.y = -t.angle;
      if (view.barrel) view.barrel.position.x = view.barrelBaseX - t.recoil * 2.5;
      if (view.spinner) {
        view.spinner.rotation.y = s.elapsed * 2.2;
        view.spinner.position.y = 24 + Math.sin(s.elapsed * 2.5 + t.id) * 1.6;
      }
      if (view.flash) {
        view.flash.visible = t.fireFlash > 0;
        const fsc = 0.6 + (t.fireFlash / 0.12) * 0.8;
        view.flash.scale.setScalar(fsc);
      }
      view.ringMat.emissiveIntensity = 0.3 + t.level * 0.45;
      const range = TOWERS[t.kind].levels[t.level].range;
      view.rangeRing.visible = s.showRanges && range > 0;
      if (view.rangeRing.visible) {
        view.rangeRing.scale.set(range, range, 1);
        (view.rangeRing.material as THREE.MeshBasicMaterial).color.set(TOWERS[t.kind].color);
      }
      view.levelCubes.forEach((c, i) => {
        (c.material as THREE.MeshStandardMaterial).color.set(i <= t.level ? TOWERS[t.kind].color : '#334155');
      });
      const stars = Math.min(3, Math.floor(t.kills / 15));
      view.gems.visible = stars > 0;
      if (stars > 0) {
        view.gems.children.forEach((g, i) => {
          g.visible = i < stars;
          g.rotation.y = s.elapsed * 2 + i;
          g.position.y = 26 + Math.sin(s.elapsed * 3 + i) * 1.5;
        });
      }
      if (view.aura) {
        const lv = TOWERS.amp.levels[t.level];
        view.aura.scale.set(lv.aura!.range, lv.aura!.range, 1);
        (view.aura.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * Math.sin(s.elapsed * 2);
      }
      if (t.stunT > 0) {
        view.ringMat.emissive.set('#f87171');
        view.ringMat.emissiveIntensity = 1.3 + 0.4 * Math.sin(s.elapsed * 12);
      } else if (s.overdrive && t.kind !== 'amp' && t.kind !== 'bank') {
        view.ringMat.emissive.set('#fde047');
        view.ringMat.emissiveIntensity = 1;
      } else {
        view.ringMat.emissive.set(TOWERS[t.kind].color);
      }
    }

    const attr = this.ampLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    let vi = 0;
    const maxPairs = 48;
    for (const a of s.towers) {
      if (a.kind !== 'amp') continue;
      const lv = TOWERS.amp.levels[a.level];
      for (const t of s.towers) {
        if (t.kind === 'amp' || vi >= maxPairs) continue;
        if (Math.hypot(a.x - t.x, a.y - t.y) > lv.aura!.range + 16) continue;
        attr.setXYZ(vi * 2, a.x, 12, a.y);
        attr.setXYZ(vi * 2 + 1, t.x, 8, t.y);
        vi++;
      }
    }
    this.ampLines.geometry.setDrawRange(0, vi * 2);
    attr.needsUpdate = true;
  }

  private buildEnemyView(e: Enemy): EnemyView {
    const def = e.def;
    const group = new THREE.Group();
    const skin = (SKINS as Record<string, SkinCfg | undefined>)[def.kind];
    const skinMap = skin ? photoTex(skin.map, skin.rep, skin.rep) : null;
    const skinNor = skin ? photoTex(skin.nor, skin.rep, skin.rep) : null;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: skin ? new THREE.Color(def.color).lerp(new THREE.Color('#ffffff'), skin.tint) : def.color,
      emissive: def.color,
      emissiveIntensity: 0.12,
      roughness: skin?.rough ?? 0.55,
      metalness: skin?.metal ?? 0.15,
      flatShading: !skinMap,
      transparent: true,
      map: skinMap,
      normalMap: skinNor,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    const r = def.size;
    const body = new THREE.Group();
    group.add(body);
    const limbs: Limb[] = [];
    const spins: Spin[] = [];
    const fadeMats: THREE.Material[] = [];
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#0f172a', transparent: true });
    fadeMats.push(eyeMat);

    const addLimb = (
      pos: [number, number, number],
      geo: THREE.BufferGeometry,
      cfg: { axis?: 'x' | 'y' | 'z'; phase?: number; amp?: number; speed?: number; off?: [number, number, number]; rot?: [number, number, number]; mat?: THREE.Material },
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(pos[0], pos[1], pos[2]);
      const mesh = new THREE.Mesh(geo, cfg.mat ?? bodyMat);
      if (cfg.off) mesh.position.set(cfg.off[0], cfg.off[1], cfg.off[2]);
      if (cfg.rot) mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      mesh.castShadow = true;
      pivot.add(mesh);
      body.add(pivot);
      limbs.push({ obj: pivot, axis: cfg.axis ?? 'x', phase: cfg.phase ?? 0, amp: cfg.amp ?? 0.5, speed: cfg.speed ?? 8 });
      return pivot;
    };

    const mkLeg = (pos: [number, number, number], legR: number, legLen: number, phase: number, speed: number, tilt = 0, axis: 'x' | 'y' = 'x') => {
      const pivot = addLimb(pos, new THREE.CapsuleGeometry(legR, legLen, 4, 8), { phase, amp: 0.6, speed });
      pivot.rotation.z = tilt;
      limbs[limbs.length - 1].axis = axis;
      return pivot;
    };

    const mkEyes = (pts: [number, number, number][], color: string, size: number) => {
      eyeMat.color.set(color);
      for (const p of pts) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6), eyeMat);
        eye.position.set(p[0], p[1], p[2]);
        body.add(eye);
      }
    };

    switch (def.kind) {
      case 'grunt': {
        mkLeg([0, r * 0.85, r * 0.3], r * 0.2, r * 0.6, 0, 8);
        mkLeg([0, r * 0.85, -r * 0.3], r * 0.2, r * 0.6, Math.PI, 8);
        const torso = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 14, 12), bodyMat);
        torso.scale.set(1, 0.9, 0.78);
        torso.position.y = r * 1.35;
        body.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 12, 10), bodyMat);
        head.position.set(r * 0.3, r * 2.1, 0);
        body.add(head);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.11, r * 0.5, 6), bodyMat);
          horn.position.set(r * 0.18, r * 2.5, s * r * 0.38);
          horn.rotation.x = s * 0.55;
          body.add(horn);
        }
        mkEyes([[r * 0.68, r * 2.15, r * 0.2], [r * 0.68, r * 2.15, -r * 0.2]], '#fbbf24', r * 0.1);
        addLimb([r * 0.15, r * 1.7, r * 0.75], new THREE.CapsuleGeometry(r * 0.13, r * 0.5, 4, 8), { phase: Math.PI / 2, amp: 0.55, speed: 8, off: [0, -r * 0.35, 0] });
        addLimb([r * 0.15, r * 1.7, -r * 0.75], new THREE.CapsuleGeometry(r * 0.13, r * 0.5, 4, 8), { phase: -Math.PI / 2, amp: 0.55, speed: 8, off: [0, -r * 0.35, 0] });
        break;
      }
      case 'runner': {
        mkLeg([r * 0.5, r * 0.9, r * 0.35], r * 0.13, r * 0.8, 0, 11);
        mkLeg([r * 0.5, r * 0.9, -r * 0.35], r * 0.13, r * 0.8, Math.PI, 11);
        mkLeg([-r * 0.55, r * 0.9, r * 0.35], r * 0.13, r * 0.8, Math.PI, 11);
        mkLeg([-r * 0.55, r * 0.9, -r * 0.35], r * 0.13, r * 0.8, 0, 11);
        const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.5, r * 1.1, 4, 10).rotateZ(Math.PI / 2), bodyMat);
        trunk.position.y = r * 1.2;
        body.add(trunk);
        const neck = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.24, r * 0.5, 4, 8).rotateZ(-0.6), bodyMat);
        neck.position.set(r * 0.85, r * 1.5, 0);
        body.add(neck);
        const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 8), bodyMat);
        head.position.set(r * 1.2, r * 1.75, 0);
        body.add(head);
        const snout = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * 0.6, 8).rotateZ(-Math.PI / 2), bodyMat);
        snout.position.set(r * 1.6, r * 1.75, 0);
        body.add(snout);
        mkEyes([[r * 1.3, r * 1.9, r * 0.16], [r * 1.3, r * 1.9, -r * 0.16]], '#4ade80', r * 0.09);
        addLimb([-r * 1.0, r * 1.25, 0], new THREE.ConeGeometry(r * 0.22, r * 1.5, 8), { phase: 0, amp: 0.35, speed: 5, rot: [0, 0, Math.PI / 2], off: [-r * 0.75, 0, 0] });
        break;
      }
      case 'brute': {
        mkLeg([0, r * 1.0, r * 0.45], r * 0.32, r * 0.8, 0, 5);
        mkLeg([0, r * 1.0, -r * 0.45], r * 0.32, r * 0.8, Math.PI, 5);
        const torso = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 1.5, r * 1.2), bodyMat);
        torso.position.y = r * 2.1;
        body.add(torso);
        const pelvis = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.6, r * 1.0), bodyMat);
        pelvis.position.y = r * 1.3;
        body.add(pelvis);
        const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 10, 8), bodyMat);
        head.position.set(r * 0.45, r * 3.0, 0);
        body.add(head);
        mkEyes([[r * 0.78, r * 3.05, r * 0.16], [r * 0.78, r * 3.05, -r * 0.16]], '#f97316', r * 0.1);
        addLimb([0, r * 2.6, r * 0.85], new THREE.CapsuleGeometry(r * 0.26, r * 1.1, 4, 8), { phase: Math.PI / 2, amp: 0.4, speed: 5, off: [0, -r * 0.75, 0] });
        addLimb([0, r * 2.6, -r * 0.85], new THREE.CapsuleGeometry(r * 0.26, r * 1.1, 4, 8), { phase: -Math.PI / 2, amp: 0.4, speed: 5, off: [0, -r * 0.75, 0] });
        break;
      }
      case 'flyer': {
        const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.32, r * 1.6, 4, 10).rotateZ(Math.PI / 2), bodyMat);
        body.add(trunk);
        const tailCone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 1.6, 8).rotateZ(Math.PI / 2), bodyMat);
        tailCone.position.x = -r * 1.7;
        body.add(tailCone);
        const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 10, 8), bodyMat);
        head.position.set(r * 1.15, r * 0.1, 0);
        body.add(head);
        mkEyes([[r * 1.35, r * 0.25, r * 0.18], [r * 1.35, r * 0.25, -r * 0.18]], '#f0abfc', r * 0.14);
        const wingGeo = new THREE.BoxGeometry(r * 0.5, 0.3, r * 1.9);
        const wingMat = new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
        fadeMats.push(wingMat);
        const wingDefs: [number, number, number][] = [[r * 0.45, 1, 0], [r * 0.45, -1, Math.PI], [-r * 0.25, 1, Math.PI * 0.35], [-r * 0.25, -1, Math.PI * 1.35]];
        for (const [wx, wz, phase] of wingDefs) {
          const pivot = new THREE.Group();
          pivot.position.set(wx, r * 0.35, 0);
          const wing = new THREE.Mesh(wingGeo, wingMat);
          wing.position.z = wz * r * 1.15;
          wing.rotation.x = wz * 0.25;
          pivot.add(wing);
          body.add(pivot);
          limbs.push({ obj: pivot, axis: 'x', phase, amp: 0.75, speed: 26 });
        }
        break;
      }
      case 'healer': {
        const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 14, 12), bodyMat);
        core.position.y = r * 0.5;
        body.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.1, 8, 26), std('#d1fae5', { emissive: '#34d399', emissiveIntensity: 0.6, roughness: 0.3 }));
        ring.position.y = r * 0.5;
        ring.rotation.x = Math.PI / 2;
        body.add(ring);
        spins.push({ obj: ring, axis: 'z', speed: 1.6 });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const pod = new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 8, 8), std('#ecfdf5', { emissive: '#4ade80', emissiveIntensity: 0.9 }));
          pod.position.set(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0);
          ring.add(pod);
        }
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(r * 0.24, r * 0.85, r * 0.24), std('#ecfdf5', { emissive: '#4ade80', emissiveIntensity: 0.8 }));
        crossV.position.y = r * 1.4;
        body.add(crossV);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(r * 0.85, r * 0.24, r * 0.24), std('#ecfdf5', { emissive: '#4ade80', emissiveIntensity: 0.8 }));
        crossH.position.y = r * 1.4;
        body.add(crossH);
        for (const s of [-1, 1]) {
          const pod = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, r * 0.3, 4, 8), bodyMat);
          pod.position.set(0, r * 0.1, s * r * 0.85);
          body.add(pod);
        }
        break;
      }
      case 'splitter': {
        const membraneMat = new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.45, roughness: 0.15, metalness: 0.05 });
        fadeMats.push(membraneMat);
        const membrane = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), membraneMat);
        membrane.position.y = r * 0.55;
        body.add(membrane);
        const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 12, 10), bodyMat);
        core.position.y = r * 0.55;
        body.add(core);
        const bubbles: [number, number, number][] = [[-r * 0.35, r * 0.45, 0], [r * 0.3, r * 0.8, 0], [r * 0.1, r * 0.3, 0]];
        for (const [bx, by, bz] of bubbles) {
          const bub = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 8), bodyMat);
          bub.position.set(bx, by, bz);
          body.add(bub);
        }
        break;
      }
      case 'boss': {
        const abdomen = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 16, 14), bodyMat);
        abdomen.scale.set(1.25, 1, 1);
        abdomen.position.set(-r * 0.9, r * 1.5, 0);
        body.add(abdomen);
        const thorax = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 14, 12), bodyMat);
        thorax.position.set(r * 0.2, r * 1.5, 0);
        body.add(thorax);
        const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 12, 10), bodyMat);
        head.position.set(r * 1.15, r * 1.5, 0);
        body.add(head);
        mkEyes([
          [r * 1.5, r * 1.65, r * 0.14], [r * 1.5, r * 1.65, -r * 0.14],
          [r * 1.45, r * 1.42, r * 0.28], [r * 1.45, r * 1.42, -r * 0.28],
        ], '#fecaca', r * 0.08);
        const spikes: [number, number, number][] = [[-1.4, 0.5, 0], [-0.9, 0.95, 0], [-0.35, 1.1, 0], [-0.9, 0.6, 0.85], [-0.9, 0.6, -0.85]];
        for (const [sx, sy, sz] of spikes) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 0.75, 6), bodyMat);
          spike.position.set(sx * r, r * 1.5 + sy * r, sz * r);
          body.add(spike);
        }
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const pivot = new THREE.Group();
            pivot.position.set((i - 1.5) * r * 0.42 + r * 0.1, r * 1.55, side * r * 0.55);
            pivot.rotation.z = side * 0.5;
            const leg = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.11, r * 2.2, 4, 8), bodyMat);
            leg.rotation.x = side * 1.9;
            leg.position.set(0, -r * 0.3, side * r * 0.6);
            leg.castShadow = true;
            pivot.add(leg);
            body.add(pivot);
            limbs.push({ obj: pivot, axis: 'y', phase: (i % 2) * Math.PI + (side > 0 ? 0 : Math.PI / 2), amp: 0.22, speed: 4.5 });
          }
        }
        break;
      }
      case 'shield': {
        const shellMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.55, flatShading: true, transparent: true });
        fadeMats.push(shellMat);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
        shell.scale.set(1.15, 0.85, 1.0);
        shell.position.y = r * 0.55;
        body.add(shell);
        const under = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 12, 10), bodyMat);
        under.scale.set(1.1, 0.6, 0.9);
        under.position.y = r * 0.55;
        body.add(under);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * 0.7, 8).rotateZ(-Math.PI / 2), bodyMat);
        horn.position.set(r * 1.05, r * 0.55, 0);
        body.add(horn);
        mkEyes([[r * 0.85, r * 0.7, r * 0.18], [r * 0.85, r * 0.7, -r * 0.18]], '#0f172a', r * 0.09);
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            mkLeg([(i - 1) * r * 0.55, r * 0.6, side * r * 0.55], r * 0.1, r * 0.5, ((i + (side > 0 ? 0 : 1)) % 2) * Math.PI, 10);
          }
        }
        break;
      }
      case 'phantom': {
        const cloak = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.4, 12, 1, true), bodyMat);
        cloak.position.y = r * 0.9;
        body.add(cloak);
        const hood = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 12, 10), bodyMat);
        hood.position.y = r * 2.0;
        body.add(hood);
        mkEyes([[r * 0.45, r * 2.05, r * 0.18], [r * 0.45, r * 2.05, -r * 0.18]], '#fde2ff', r * 0.11);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          addLimb([Math.cos(a) * r * 0.5, r * 0.35, Math.sin(a) * r * 0.5], new THREE.ConeGeometry(r * 0.16, r * 0.7, 6), { phase: a, amp: 0.4, speed: 3.2, rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] });
        }
        break;
      }
      case 'wrecker': {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.8, r * 1.2), bodyMat);
        hull.position.y = r * 1.0;
        body.add(hull);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), std('#4c0519', { emissive: '#fb7185', emissiveIntensity: 0.7, roughness: 0.3 }));
        dome.position.y = r * 1.6;
        body.add(dome);
        const dishPivot = new THREE.Group();
        dishPivot.position.set(r * 0.75, r * 1.6, 0);
        const dish = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 0.45, 10, 1, true).rotateX(Math.PI / 2), std('#9f1239', { roughness: 0.4, metalness: 0.5 }));
        dishPivot.add(dish);
        body.add(dishPivot);
        spins.push({ obj: dishPivot, axis: 'y', speed: 0.9 });
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            mkLeg([(i - 1) * r * 0.5, r * 0.85, side * r * 0.62], r * 0.13, r * 0.7, ((i + (side > 0 ? 0 : 1)) % 2) * Math.PI, 6, side * 0.25, 'y');
          }
        }
        break;
      }
      case 'colossus': {
        const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 1.25), bodyMat);
        torso.position.y = r * 2.0;
        body.add(torso);
        const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.42), std('#fca5a5', { emissive: '#ef4444', emissiveIntensity: 1.2, roughness: 0.3 }));
        chest.position.set(0, r * 2.1, r * 1.05);
        body.add(chest);
        const head = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.5), bodyMat);
        head.position.y = r * 3.5;
        body.add(head);
        mkEyes([[r * 0.3, r * 3.55, r * 0.3], [r * 0.3, r * 3.55, -r * 0.3]], '#ef4444', r * 0.12);
        for (const side of [-1, 1]) {
          addLimb([0, r * 2.7, side * r * 0.95], new THREE.CapsuleGeometry(r * 0.4, r * 1.7, 4, 8), { phase: side > 0 ? 0 : Math.PI, amp: 0.35, speed: 3.2, off: [0, -r * 1.15, 0] });
          mkLeg([0, r * 0.9, side * r * 0.5], r * 0.4, r * 1.1, side > 0 ? 0 : Math.PI, 3);
        }
        break;
      }
    }
    body.traverse(c => {
      c.castShadow = true;
    });

    let shield: THREE.Mesh | null = null;
    if (def.shieldHp) {
      shield = new THREE.Mesh(
        new THREE.SphereGeometry(r + 5, 14, 12),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.3, depthWrite: false }),
      );
      group.add(shield);
    }

    let tintRing: THREE.Mesh | null = null;
    if (e.mTint) {
      tintRing = new THREE.Mesh(
        new THREE.TorusGeometry(r + 4, 0.55, 6, 32),
        new THREE.MeshBasicMaterial({ color: e.mTint, transparent: true, opacity: 0.55 }),
      );
      tintRing.rotation.x = Math.PI / 2;
      group.add(tintRing);
    }

    let cloakRing: THREE.Mesh | null = null;
    if (def.cloakEvery) {
      cloakRing = new THREE.Mesh(
        new THREE.TorusGeometry(r + 3, 0.5, 6, 32),
        new THREE.MeshBasicMaterial({ color: '#c084fc', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      cloakRing.rotation.x = Math.PI / 2;
      cloakRing.position.y = r * 0.6;
      cloakRing.visible = false;
      group.add(cloakRing);
    }

    let crown: THREE.Mesh | null = null;
    if (e.elite) {
      crown = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.8),
        new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#fde047', emissiveIntensity: 0.95, roughness: 0.3, metalness: 0.5 }),
      );
      crown.position.y = def.flying ? 34 : r * 2.6 + 12;
      group.add(crown);
    }

    const hpGroup = new THREE.Group();
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 4.6),
      new THREE.MeshBasicMaterial({ color: '#0b1220', transparent: true, opacity: 0.85, depthTest: false }),
    );
    hpBg.renderOrder = 30;
    hpGroup.add(hpBg);
    const fillGeo = new THREE.PlaneGeometry(24, 2.6);
    fillGeo.translate(12, 0, 0);
    const hpFillMat = new THREE.MeshBasicMaterial({ color: '#4ade80', depthTest: false });
    const hpFill = new THREE.Mesh(fillGeo, hpFillMat);
    hpFill.position.set(-12, 0, 0.1);
    hpFill.renderOrder = 31;
    hpGroup.add(hpFill);
    hpGroup.visible = false;
    group.add(hpGroup);

    this.scene.add(group);
    return { group, bodyMat, baseEmissive: new THREE.Color(def.color), shield, tintRing, cloakRing, crown, hpGroup, hpFill, hpFillMat, size: r, flying: def.flying, born: 0, limbs, spins, bodyObj: body, fadeMats };
  }

  private syncEnemies(s: RenderState) {
    for (const [id, view] of this.enemyViews) {
      if (!s.enemies.some(e => e.id === id)) {
        this.scene.remove(view.group);
        disposeObj(view.group);
        this.enemyViews.delete(id);
      }
    }
    const _q1 = new THREE.Quaternion();
    const _q2 = new THREE.Quaternion();
    for (const e of s.enemies) {
      let view = this.enemyViews.get(e.id);
      if (!view) {
        view = this.buildEnemyView(e);
        view.born = s.elapsed;
        this.enemyViews.set(e.id, view);
      }
      const bob = e.def.flying ? Math.sin(s.elapsed * 5 + e.bob) * 3 : 0;
      const baseY = e.def.flying ? 24 : view.size + 1;
      const age = s.elapsed - view.born;
      const drop = age < 0.5 ? (1 - age / 0.5) * 36 : 0;
      view.group.position.set(e.x, baseY + bob + drop, e.y);
      view.group.rotation.y = -e.ang;

      const cloaked = e.cloaked;
      const targetOp = cloaked ? 0.13 : 1;
      view.bodyMat.opacity += (targetOp - view.bodyMat.opacity) * 0.18;
      for (const m of view.fadeMats) {
        if (m.userData.baseOp === undefined) m.userData.baseOp = (m as THREE.Material & { opacity: number }).opacity;
        (m as THREE.Material & { opacity: number }).opacity = m.userData.baseOp * view.bodyMat.opacity;
      }
      for (const l of view.limbs) l.obj.rotation[l.axis] = Math.sin(s.elapsed * l.speed + l.phase) * l.amp;
      for (const sp of view.spins) sp.obj.rotation[sp.axis] = s.elapsed * sp.speed;
      const sqAmp = e.def.kind === 'splitter' ? 0.06 : 0.015;
      const sq = Math.sin(s.elapsed * 3.4 + e.bob) * sqAmp;
      view.bodyObj.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      if (view.crown) {
        view.crown.rotation.y = s.elapsed * 2.5;
        view.crown.position.y = (view.flying ? 34 : view.size * 2 + 13) + Math.sin(s.elapsed * 3) * 1.5;
        view.crown.visible = !cloaked;
      }
      if (view.cloakRing) {
        const telegraph = !cloaked && e.def.cloakEvery !== undefined && e.cloakT < 0.7;
        view.cloakRing.visible = cloaked || telegraph;
        const op = cloaked ? 0.45 + 0.18 * Math.sin(s.elapsed * 7) : 0.25 + 0.2 * Math.sin(s.elapsed * 15);
        (view.cloakRing.material as THREE.MeshBasicMaterial).opacity = op;
      }

      if (e.burnT > 0) {
        view.bodyMat.emissive.set('#fb923c');
        view.bodyMat.emissiveIntensity = 0.5 + Math.random() * 0.5;
      } else if (e.slowT > 0) {
        view.bodyMat.emissive.set('#67e8f9');
        view.bodyMat.emissiveIntensity = 0.45;
      } else {
        view.bodyMat.emissive.copy(view.baseEmissive);
        view.bodyMat.emissiveIntensity = e.enraged ? 0.8 + 0.3 * Math.sin(s.elapsed * 9) : 0.12;
      }

      if (view.shield) {
        const pct = e.shieldMax > 0 ? e.shieldHp / e.shieldMax : 0;
        view.shield.visible = pct > 0;
        (view.shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.3 * pct;
      }

      const hpVisible = e.hp < e.maxHp && !e.cloaked;
      view.hpGroup.visible = hpVisible;
      if (hpVisible) {
        const pct = Math.max(0.02, e.hp / e.maxHp);
        view.hpFill.scale.x = pct;
        view.hpFillMat.color.set(pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#f87171');
        view.hpGroup.position.y = view.flying ? 16 : view.size * 2 + 9;
        view.group.getWorldQuaternion(_q2).invert();
        _q1.copy(this.camera.quaternion);
        view.hpGroup.quaternion.copy(_q2.multiply(_q1));
      }
    }
  }

  private syncProjectiles(s: RenderState) {
    for (const [id, pv] of this.projViews) {
      if (!s.projectiles.some(p => p.id === id)) {
        this.scene.remove(pv.obj);
        this.scene.remove(pv.line);
        disposeObj(pv.obj);
        disposeObj(pv.line);
        this.projViews.delete(id);
      }
    }
    for (const p of s.projectiles) {
      let pv = this.projViews.get(p.id);
      if (!pv) {
        const mat = new THREE.MeshBasicMaterial({ color: p.color });
        let obj: THREE.Object3D;
        if (p.kind === 'frost') obj = new THREE.Mesh(new THREE.OctahedronGeometry(3), mat);
        else if (p.kind === 'missile') obj = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6.5, 8).rotateZ(-Math.PI / 2), mat);
        else obj = new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'cannon' ? 3.6 : 2.4, 8, 8), mat);
        this.scene.add(obj);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, 8, p.y)]),
          new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        line.frustumCulled = false;
        this.scene.add(line);
        pv = { obj, line, trail: [] };
        this.projViews.set(p.id, pv);
      }
      pv.obj.position.set(p.x, 8, p.y);
      if (p.kind === 'missile') pv.obj.rotation.y = -Math.atan2(p.ty - p.y, p.tx - p.x);
      pv.trail.unshift(new THREE.Vector3(p.x, 8, p.y));
      if (pv.trail.length > 7) pv.trail.pop();
      pv.line.geometry.setFromPoints(pv.trail);
    }
  }

  private fxObj(fx: RenderEffect): FxEntry {
    switch (fx.type) {
      case 'explosion': {
        const mat = new THREE.MeshBasicMaterial({ color: '#ffca7a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const obj = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
        obj.position.set(fx.x, 9, fx.y);
        this.flashLight.position.set(fx.x, 26, fx.y);
        this.flashLight.intensity = 90;
        this.addScorch(fx.x, fx.y);
        return { obj, update: k => { obj.scale.setScalar(Math.max(0.01, fx.r * (0.4 + 0.6 * k))); mat.opacity = 0.9 * (1 - k); } };
      }
      case 'ring': {
        const mat = new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
        const obj = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), mat);
        obj.rotation.x = -Math.PI / 2;
        obj.position.set(fx.x, 2, fx.y);
        return { obj, update: k => { const r = fx.r + k * 18; obj.scale.set(r, r, 1); mat.opacity = 0.8 * (1 - k); } };
      }
      case 'arc': {
        const pts = fx.pts.map(p => new THREE.Vector3(p.x, 16, p.y));
        const mat = new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
        const obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
        return { obj, update: k => { mat.opacity = 1 - k; } };
      }
      case 'tracer': {
        const mat = new THREE.LineBasicMaterial({ color: fx.color ?? '#fef08a', transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
        const obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(fx.x1, 14, fx.y1), new THREE.Vector3(fx.x2, 10, fx.y2),
        ]), mat);
        return { obj, update: k => { mat.opacity = 1 - k; } };
      }
      case 'cone': {
        const mat = new THREE.MeshBasicMaterial({ color: '#fb923c', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
        const geo = new THREE.ConeGeometry(fx.range * Math.sin(fx.spread), fx.range, 20, 1, true);
        geo.rotateZ(Math.PI / 2);
        geo.translate(fx.range / 2, 0, 0);
        const obj = new THREE.Mesh(geo, mat);
        obj.position.set(fx.x, 11, fx.y);
        obj.rotation.y = -fx.angle;
        return { obj, update: k => { mat.opacity = 0.32 * (1 - k); } };
      }
      case 'corpse': {
        const mat = new THREE.MeshStandardMaterial({ color: fx.color, emissive: fx.color, emissiveIntensity: 0.25, transparent: true, roughness: 0.6, metalness: 0.15, flatShading: true });
        let geo: THREE.BufferGeometry;
        switch (fx.shape) {
          case 'cone': geo = new THREE.ConeGeometry(fx.size, fx.size * 2.2, 8); break;
          case 'box': geo = new THREE.BoxGeometry(fx.size * 1.6, fx.size * 1.6, fx.size * 1.6); break;
          case 'octa': geo = new THREE.OctahedronGeometry(fx.size * 1.1); break;
          case 'cross': geo = new THREE.BoxGeometry(fx.size * 1.7, fx.size * 0.5, fx.size * 0.5); break;
          default: geo = new THREE.SphereGeometry(fx.size, 12, 10);
        }
        const obj = new THREE.Mesh(geo, mat);
        obj.position.set(fx.x, fx.y0, fx.y);
        obj.rotation.y = -fx.ang;
        obj.castShadow = true;
        return { obj, update: k => {
          obj.position.y = fx.y0 - (fx.y0 - 1.2) * k * k;
          mat.opacity = 1 - k;
          obj.rotation.z = k * 1.1;
          obj.scale.setScalar(Math.max(0.05, 1 - 0.35 * k));
        } };
      }
      case 'splat': {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(fx.color).multiplyScalar(0.32),
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        });
        const obj = new THREE.Mesh(new THREE.CircleGeometry(1, 14), mat);
        obj.rotation.x = -Math.PI / 2;
        obj.position.set(fx.x, 1.06, fx.y);
        obj.scale.setScalar(fx.size);
        return { obj, update: k => {
          mat.opacity = 0.62 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
          obj.scale.setScalar(fx.size * (1 + k * 0.15));
        } };
      }
      case 'soul': {
        const mat = new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const obj = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), mat);
        obj.position.set(fx.x, 8, fx.y);
        return { obj, update: k => {
          obj.position.y = 8 + 38 * k;
          mat.opacity = 0.9 * (1 - k);
          obj.scale.setScalar(1 + k * 0.8);
        } };
      }
      case 'spark': {
        const mat = new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        const obj = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 6), mat);
        obj.position.set(fx.x, Math.max(1, fx.h), fx.y);
        return { obj, update: k => {
          obj.position.set(fx.x, Math.max(1, fx.h), fx.y);
          mat.opacity = 1 - k * k;
        } };
      }
      case 'part':
        return { obj: new THREE.Object3D() };
      case 'text':
        return { obj: new THREE.Object3D() };
    }
  }

  private syncFx(s: RenderState) {
    for (const [fx, entry] of this.fxViews) {
      if (!s.effects.includes(fx)) {
        this.scene.remove(entry.obj);
        if ((entry.obj as THREE.Mesh).geometry) disposeObj(entry.obj);
        this.fxViews.delete(fx);
      }
    }
    let pi = 0;
    for (const fx of s.effects) {
      if (fx.type === 'part') {
        if (pi >= MAX_PARTS) continue;
        const k = fx.t / fx.life;
        const c = this.colorFor(fx.color);
        this.partPos[pi * 3] = fx.x;
        this.partPos[pi * 3 + 1] = 4;
        this.partPos[pi * 3 + 2] = fx.y;
        const a = 1 - k;
        this.partCol[pi * 3] = c.r * a;
        this.partCol[pi * 3 + 1] = c.g * a;
        this.partCol[pi * 3 + 2] = c.b * a;
        pi++;
        continue;
      }
      let entry = this.fxViews.get(fx);
      if (!entry) {
        entry = this.fxObj(fx);
        if (entry.obj.parent !== this.scene && entry.obj.type !== 'Object3D') this.scene.add(entry.obj);
        this.fxViews.set(fx, entry);
      }
      entry.update?.(fx.t / fx.life);
    }
    this.partGeo.setDrawRange(0, pi);
    (this.partGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.partGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private partPoints = new THREE.Points(this.partGeo, new THREE.PointsMaterial({
    size: 4.5,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));

  private syncGhost(s: RenderState) {
    if (s.ghost && s.hoverPoint) {
      this.ghostGroup.visible = true;
      this.ghostGroup.position.set((s.ghost.gx + 0.5) * CELL, 0, (s.ghost.gy + 0.5) * CELL);
      const col = s.ghost.valid ? '#4ade80' : '#f87171';
      this.ghostMat.color.set(col);
      this.ghostRingMat.color.set(col);
      this.ghostRing.visible = s.ghost.range > 0;
      this.ghostRing.scale.set(s.ghost.range, s.ghost.range, 1);
    } else {
      this.ghostGroup.visible = false;
    }
    const selT = s.selTowerId !== null ? s.towers.find(t => t.id === s.selTowerId) : null;
    if (selT) {
      const range = selT.kind === 'amp'
        ? TOWERS.amp.levels[selT.level].aura!.range
        : TOWERS[selT.kind].levels[selT.level].range;
      this.selRing.visible = range > 0;
      this.selRing.position.set(selT.x, 1.6, selT.y);
      this.selRing.scale.set(range, range, 1);
      (this.selRing.material as THREE.MeshBasicMaterial).color.set(TOWERS[selT.kind].color);
    } else {
      this.selRing.visible = false;
    }
  }

  private syncAirstrike(s: RenderState) {
    const show = Boolean(s.pendingAirstrike && s.hoverPoint);
    this.airRing.visible = show;
    this.airFill.visible = show;
    if (show && s.hoverPoint) {
      this.airRing.position.set(s.hoverPoint.x, 2, s.hoverPoint.y);
      this.airFill.position.set(s.hoverPoint.x, 1.8, s.hoverPoint.y);
      const sc = AIR_RADIUS * (1 + 0.04 * Math.sin(s.elapsed * 6));
      this.airRing.scale.set(sc, sc, 1);
      this.airFill.scale.set(AIR_RADIUS, AIR_RADIUS, 1);
    }
  }

  private colorFor(hex: string): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  private drawOverlay(s: RenderState) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (s.freezeFlash > 0) {
      ctx.fillStyle = `rgba(103,232,249,${s.freezeFlash * 0.18})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (s.dmgFlash > 0) {
      ctx.strokeStyle = `rgba(239,68,68,${s.dmgFlash * 0.65})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, this.w - 8, this.h - 8);
    }
    if (s.lowLives) {
      const pulse = 0.16 + 0.09 * Math.sin(s.elapsed * 5);
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.36, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      g.addColorStop(0, 'rgba(239,68,68,0)');
      g.addColorStop(1, `rgba(190,18,60,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (s.bolt > 0) {
      ctx.fillStyle = `rgba(214,226,255,${Math.min(0.55, s.bolt * 1.7)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    const v = new THREE.Vector3();

    if (s.countdown > 0) {
      const p = GROUND_PATH[0];
      v.set(p.x, 42, p.y).project(this.camera);
      if (v.z < 1) {
        const sx = (v.x * 0.5 + 0.5) * this.w;
        const sy = (-v.y * 0.5 + 0.5) * this.h;
        ctx.globalAlpha = 0.65 + 0.3 * Math.sin(s.elapsed * 4.5);
        ctx.font = 'bold 15px system-ui';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(2,6,23,0.9)';
        const label = `WAVE ${s.nextWaveNum} IN ${Math.ceil(s.countdown)}s`;
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = '#a5f3fc';
        ctx.fillText(label, sx, sy);
      }
    }

    if (s.leak) {
      v.set(s.leak.x, 10, s.leak.y).project(this.camera);
      const cx = (v.x * 0.5 + 0.5) * this.w;
      const cy = (-v.y * 0.5 + 0.5) * this.h;
      const dx = cx - this.w / 2;
      const dy = cy - this.h / 2;
      const len = Math.hypot(dx, dy) || 1;
      const rad = Math.min(this.w, this.h) * 0.42;
      const px = this.w / 2 + (dx / len) * rad;
      const py = this.h / 2 + (dy / len) * rad;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = Math.min(1, s.leak.t);
      ctx.fillStyle = '#f87171';
      ctx.strokeStyle = 'rgba(2,6,23,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(17, 0);
      ctx.lineTo(-10, 11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, -11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    for (const fx of s.effects) {
      if (fx.type !== 'text') continue;
      const k = fx.t / fx.life;
      v.set(fx.x, 42 - 24 * k, fx.y).project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.w;
      const sy = (-v.y * 0.5 + 0.5) * this.h;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2,6,23,0.85)';
      ctx.strokeText(fx.text, sx, sy);
      ctx.fillStyle = fx.color;
      ctx.fillText(fx.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    let boss: Enemy | null = null;
    for (const e of s.enemies) {
      if (e.def.kind === 'boss' && (!boss || e.maxHp > boss.maxHp)) boss = e;
    }
    if (boss) {
      const bw = Math.min(420, this.w * 0.44);
      const bx = (this.w - bw) / 2;
      const by = 16;
      const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(2,6,23,0.85)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 18);
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 2, by - 2, bw + 4, 18);
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
      grad.addColorStop(0, '#dc2626');
      grad.addColorStop(1, '#f87171');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw * pct, 14);
      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#fecaca';
      ctx.fillText(`BOSS  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, bx + bw / 2, by + 11);
      ctx.globalAlpha = 1;
    }

    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'left';
    const evList = s.events;
    for (let i = 0; i < evList.length; i++) {
      const ev = evList[i];
      const a = Math.max(0, Math.min(1, 1 - ev.t / 5.5)) * 0.9;
      ctx.globalAlpha = a;
      ctx.fillStyle = ev.color;
      ctx.fillText(ev.text, 12, this.h - 14 - (evList.length - 1 - i) * 17);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';

    if (this.vigCv) {
      ctx.globalAlpha = 0.62;
      ctx.drawImage(this.vigCv, 0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }

    if (s.banner) {
      const p = 1 - s.banner.t / 2.6;
      const a = Math.min(1, p * 8) * Math.min(1, (1 - p) * 4);
      const pop = 1 + 0.35 * Math.exp(-p * 7);
      ctx.save();
      ctx.translate(this.w / 2, this.h * 0.22);
      ctx.scale(pop, pop);
      ctx.globalAlpha = a;
      ctx.font = '900 62px system-ui';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(2,6,23,0.85)';
      ctx.shadowColor = 'rgba(56,189,248,0.9)';
      ctx.shadowBlur = 26;
      const grad = ctx.createLinearGradient(0, -34, 0, 16);
      grad.addColorStop(0, '#bae6fd');
      grad.addColorStop(1, '#0ea5e9');
      const title = `WAVE ${s.banner.num}`;
      ctx.strokeText(title, 0, 0);
      ctx.fillStyle = grad;
      ctx.fillText(title, 0, 0);
      ctx.shadowBlur = 0;
      const tw = ctx.measureText(title).width;
      ctx.strokeStyle = 'rgba(125,211,252,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-tw / 2 - 66, -14);
      ctx.lineTo(-tw / 2 - 22, -14);
      ctx.moveTo(tw / 2 + 22, -14);
      ctx.lineTo(tw / 2 + 66, -14);
      ctx.stroke();
      if (s.banner.label) {
        ctx.font = '700 19px system-ui';
        ctx.fillStyle = '#fde047';
        ctx.fillText(s.banner.label.toUpperCase(), 0, 32);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (this.barT > 0.01) {
      const bh = this.barT * this.h * 0.085;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.w, bh);
      ctx.fillRect(0, this.h - bh, this.w, bh);
    }
  }
}
