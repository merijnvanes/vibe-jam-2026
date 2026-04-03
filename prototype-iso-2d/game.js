const TILE_W = 64;
const TILE_H = 32;
const TILE_SIZE = 64;
const MAP_W = 62;
const MAP_H = 62;
const WORLD_OFFSET_X = MAP_H * TILE_W * 0.5 + 220;
const WORLD_OFFSET_Y = 160;
const WORLD_W = (MAP_W + MAP_H) * TILE_W * 0.5 + 440;
const WORLD_H = (MAP_W + MAP_H) * TILE_H * 0.5 + 360;
const SHORE = 0.31;
const GRASS_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39];
const SAND_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 34];
const PLANT_VARIANTS = ["bamboo-00", "bamboo-03", "bamboo-09", "exotic-00", "exotic-03", "exotic-08"];
const RUIN_LAYOUT = [
  { type: "ruin-ring", x: 40.7, y: 25.8, scale: 0.24 },
  { type: "ruin-wall-east", x: 37.1, y: 26.7, scale: 0.2 },
  { type: "ruin-wall-south", x: 43.5, y: 27.4, scale: 0.2 },
  { type: "ruin-arch", x: 41.2, y: 29.2, scale: 0.2 },
  { type: "ruin-bridge", x: 24.3, y: 39.8, scale: 0.17 },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let n = Math.imul(t ^ (t >>> 15), 1 | t);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

function createNoise(seed) {
  const rng = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  const noise2D = (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = grad3[permMod12[ii + perm[jj]]];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = grad3[permMod12[ii + i1 + perm[jj + j1]]];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = grad3[permMod12[ii + 1 + perm[jj + 1]]];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  };

  const fbm = (x, y, octaves = 4) => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x * frequency, y * frequency) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / total;
  };

  return { rng, fbm };
}

function isoToWorld(tx, ty) {
  return {
    x: (tx - ty) * TILE_W * 0.5 + WORLD_OFFSET_X,
    y: (tx + ty) * TILE_H * 0.5 + WORLD_OFFSET_Y,
  };
}

function worldToTile(wx, wy) {
  const dx = wx - WORLD_OFFSET_X;
  const dy = wy - WORLD_OFFSET_Y;
  return {
    x: dx / TILE_W + dy / TILE_H,
    y: dy / TILE_H - dx / TILE_W,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pick(array, index) {
  return array[((index % array.length) + array.length) % array.length];
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c1 >= c2) return Math.hypot(px - bx, py - by);
  const ratio = c1 / c2;
  const rx = ax + ratio * vx;
  const ry = ay + ratio * vy;
  return Math.hypot(px - rx, py - ry);
}

function pathDistance(px, py, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    best = Math.min(best, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return best;
}

function buildWorld(seed) {
  const { fbm, rng } = createNoise(seed);
  const height = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  const land = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  const path = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  const meadow = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));

  const shrinePath = [
    { x: 31, y: 37 },
    { x: 31, y: 33 },
    { x: 35, y: 29 },
    { x: 40, y: 27 },
    { x: 45, y: 29 },
  ];
  const riverSpine = [
    { x: 16, y: 13 },
    { x: 22, y: 18 },
    { x: 28, y: 24 },
    { x: 34, y: 31 },
    { x: 43, y: 39 },
    { x: 50, y: 44 },
  ];
  const islands = [
    { x: 0.5, y: 0.58, r: 0.38, w: 1.26 },
    { x: 0.62, y: 0.36, r: 0.18, w: 0.84 },
    { x: 0.31, y: 0.39, r: 0.2, w: 0.7 },
    { x: 0.75, y: 0.71, r: 0.13, w: 0.54 },
  ];

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const nx = x / (MAP_W - 1);
      const ny = y / (MAP_H - 1);
      const cx = nx - 0.5;
      const cy = ny - 0.53;
      const edgeFalloff = Math.hypot(cx * 1.15, cy * 1.28);

      let mass = 0;
      for (const island of islands) {
        const dx = nx - island.x;
        const dy = ny - island.y;
        const d = Math.hypot(dx, dy);
        mass += Math.max(0, 1 - (d * d) / (island.r * island.r)) * island.w;
      }

      const largeNoise = fbm(nx * 2.8 + 4, ny * 2.8 + 9, 4) * 0.18;
      const smallNoise = fbm(nx * 9.5 + 41, ny * 9.5 + 13, 3) * 0.06;
      const riverCarve = Math.max(0, 1 - pathDistance(x, y, riverSpine) / 3.2) * 0.74;
      const coveLift = Math.max(0, 1 - Math.hypot(x - 18, y - 18) / 7.5) * 0.16;
      const orchardLift = Math.max(0, 1 - Math.hypot(x - 45, y - 24) / 8.5) * 0.17;
      const ridgeLift = Math.max(0, 1 - pathDistance(x, y, shrinePath) / 8) * 0.12;
      const moonPool = Math.max(0, 1 - Math.hypot(x - 36, y - 33) / 5.5) * 0.38;
      const sunkenCourt = Math.max(0, 1 - Math.hypot(x - 27, y - 36) / 4.8) * 0.28;
      const eastLagoon = Math.max(0, 1 - Math.hypot(x - 48, y - 31) / 6.2) * 0.34;
      const value = 0.92 - edgeFalloff * 1.55 + mass * 0.62 + largeNoise + smallNoise + coveLift + orchardLift + ridgeLift - riverCarve - moonPool - sunkenCourt - eastLagoon;

      height[y][x] = value;
      land[y][x] = value > SHORE;
      path[y][x] = Math.max(0, 1 - pathDistance(x, y, shrinePath) / 1.4);
      meadow[y][x] = clamp((fbm(nx * 7 + 80, ny * 7 + 12, 3) + 1) * 0.5, 0, 1);
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const next = land.map((row) => row.slice());
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        let nearby = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (land[y + oy][x + ox]) nearby += 1;
          }
        }
        if (nearby >= 5) next[y][x] = true;
        if (nearby <= 3) next[y][x] = false;
      }
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) land[y][x] = next[y][x];
    }
  }

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (land[y][x] && path[y][x] > 0.6) height[y][x] = Math.max(height[y][x], SHORE + 0.035);
    }
  }

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const moonPool = Math.hypot(x - 36, y - 33) < 3.8;
      const eastLagoon = Math.hypot(x - 48, y - 31) < 4.4;
      const sunkenCourt = Math.hypot(x - 27, y - 36) < 3.2;
      if (moonPool || eastLagoon || sunkenCourt) {
        land[y][x] = false;
      }
    }
  }

  const props = [];
  const blocked = new Set();
  const mark = (x, y, radius = 1) => {
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) blocked.add(`${x + ox},${y + oy}`);
    }
  };
  const addProp = (type, x, y, data = {}) => props.push({ type, x, y, ...data });

  for (let y = 3; y < MAP_H - 3; y++) {
    for (let x = 3; x < MAP_W - 3; x++) {
      const nearPath = path[y][x] > 0.22;
      const orchard = Math.hypot(x - 45, y - 24) < 8;
      const whisper = Math.hypot(x - 23, y - 42) < 8;
      const lush = meadow[y][x] > 0.57;
      const sanctum = Math.hypot(x - 41, y - 28) < 8.5;

      if (land[y][x] && !blocked.has(`${x},${y}`) && !sanctum && !nearPath && (lush || orchard || whisper) && rng() > (orchard ? 0.15 : 0.42)) {
        addProp("tree", x + rng() * 0.55 - 0.28, y + rng() * 0.55 - 0.28, {
          variant: rng() > 0.5 ? "oak-a" : "oak-b",
          scale: orchard ? 0.2 + rng() * 0.03 : 0.16 + rng() * 0.05,
        });
        mark(x, y, 1);
      } else if (land[y][x] && (lush || sanctum) && rng() > 0.77) {
        addProp("plant", x + rng() * 0.8 - 0.4, y + rng() * 0.8 - 0.4, {
          variant: pick(PLANT_VARIANTS, Math.floor(rng() * PLANT_VARIANTS.length)),
          scale: sanctum ? 0.5 + rng() * 0.16 : whisper ? 0.56 + rng() * 0.1 : 0.42 + rng() * 0.18,
          alpha: sanctum || whisper ? 0.94 : 0.88,
        });
      }

      const coast = !land[y - 1][x] || !land[y + 1][x] || !land[y][x - 1] || !land[y][x + 1];
      if (coast && land[y][x] && rng() > 0.84) {
        addProp("plant", x + rng() * 0.6 - 0.3, y + rng() * 0.6 - 0.3, {
          variant: rng() > 0.4 ? "bamboo-09" : "exotic-08",
          scale: 0.46 + rng() * 0.14,
          alpha: 0.9,
        });
      }
    }
  }

  for (const [x, y] of [[31, 37], [32, 34], [35, 30], [39, 28], [43, 28], [46, 29], [23, 42], [20, 39]]) {
    addProp("lantern", x, y);
  }
  for (const [x, y] of [[40, 25], [41, 24], [42, 24], [43, 25], [43, 26], [42, 27], [41, 27], [40, 26]]) {
    addProp("stone", x, y, { tall: rng() > 0.45 });
  }
  for (const [x, y] of [[22, 43], [24, 44], [26, 43], [26, 41], [24, 40], [22, 41]]) {
    addProp("stone", x, y, { tall: false, glow: true });
  }
  for (const ruin of RUIN_LAYOUT) {
    addProp(ruin.type, ruin.x, ruin.y, { scale: ruin.scale });
  }

  return {
    height,
    land,
    path,
    props,
    spawn: { x: 40, y: 30 },
  };
}

class SanctuaryScene extends Phaser.Scene {
  constructor() {
    super("SanctuaryScene");
    this.entered = false;
    this.resumeAudio = () => {};
  }

  preload() {
    this.load.image("oak-a", "assets/trees/oak-a.png");
    this.load.image("oak-b", "assets/trees/oak-b.png");
    this.load.spritesheet("grass-tiles", "assets/terrain/grass_tiles.png", { frameWidth: 128, frameHeight: 64 });
    this.load.spritesheet("sand-tiles", "assets/terrain/sand_tiles.png", { frameWidth: 128, frameHeight: 64 });
    this.load.spritesheet("crusader-walk", "assets/characters/crusader-walk.png", { frameWidth: 299, frameHeight: 240 });
    this.load.spritesheet("crusader-idle", "assets/characters/crusader-idle.png", { frameWidth: 299, frameHeight: 240 });
    for (const key of PLANT_VARIANTS) this.load.image(key, `assets/plants/${key}.png`);
    this.load.image("ruin-ring", "assets/ruins/ritual-ring.png");
    this.load.image("ruin-arch", "assets/ruins/arch-large.png");
    this.load.image("ruin-wall-east", "assets/ruins/wall-east.png");
    this.load.image("ruin-wall-south", "assets/ruins/wall-south.png");
    this.load.image("ruin-bridge", "assets/ruins/bridge-broken.png");
  }

  create() {
    this.world = buildWorld(20260403);
    this.createGeneratedTextures();
    this.createAnimations();
    this.addSky();
    this.buildGround();
    this.buildDebugGrid();
    this.buildProps();
    this.createPlayer();
    this.createAtmosphere();
    this.initAudio();
    this.setupInput();
    this.setupCamera();
    this.events.on("update", this.updateScene, this);
  }

  createAnimations() {
    const dirs = [
      { key: "s", row: 0 },
      { key: "se", row: 1 },
      { key: "e", row: 2 },
      { key: "ne", row: 3 },
      { key: "n", row: 4 },
      { key: "nw", row: 5 },
      { key: "w", row: 6 },
      { key: "sw", row: 7 },
    ];

    for (const dir of dirs) {
      this.anims.create({
        key: `crusader-walk-${dir.key}`,
        frames: this.anims.generateFrameNumbers("crusader-walk", { start: dir.row * 15, end: dir.row * 15 + 14 }),
        frameRate: 18,
        repeat: -1,
      });
      this.anims.create({
        key: `crusader-idle-${dir.key}`,
        frames: this.anims.generateFrameNumbers("crusader-idle", { start: dir.row * 16, end: dir.row * 16 + 15 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  createGeneratedTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.clear();
    g.fillStyle(0x0a1020, 0.44);
    g.fillEllipse(32, 18, 46, 18);
    g.generateTexture("shadow", 64, 36);

    g.clear();
    g.fillStyle(0xbcb4a6, 1);
    g.fillRoundedRect(8, 20, 18, 24, 4);
    g.fillStyle(0x8d8478, 1);
    g.fillRoundedRect(12, 6, 10, 20, 3);
    g.generateTexture("stone-short", 34, 48);

    g.clear();
    g.fillStyle(0xbcb4a6, 1);
    g.fillRoundedRect(8, 18, 18, 28, 4);
    g.fillStyle(0x8d8478, 1);
    g.fillRoundedRect(11, 0, 12, 24, 3);
    g.generateTexture("stone-tall", 34, 48);

    g.clear();
    g.fillStyle(0x4e3722, 1);
    g.fillRect(11, 10, 4, 22);
    g.fillStyle(0xffb25f, 1);
    g.fillCircle(13, 9, 5);
    g.fillStyle(0xffe5a4, 0.5);
    g.fillCircle(13, 9, 10);
    g.generateTexture("lantern", 32, 40);

    g.clear();
    g.fillStyle(0xffd691, 1);
    g.fillCircle(6, 6, 4);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(4, 4, 1);
    g.generateTexture("firefly", 12, 12);

    g.clear();
    g.fillStyle(0x18324d, 1);
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(63, 16);
    g.lineTo(32, 32);
    g.lineTo(1, 16);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x2f5277, 0.35);
    g.fillEllipse(28, 11, 10, 4);
    g.fillEllipse(39, 19, 14, 5);
    g.generateTexture("water-diamond", 64, 32);

    g.clear();
    g.lineStyle(2, 0x00ffaa, 0.9);
    g.fillStyle(0x00aa66, 0.16);
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(63, 16);
    g.lineTo(32, 32);
    g.lineTo(1, 16);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture("debug-land", 64, 32);

    g.clear();
    g.lineStyle(2, 0xff4466, 0.95);
    g.fillStyle(0xaa2244, 0.18);
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(63, 16);
    g.lineTo(32, 32);
    g.lineTo(1, 16);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.generateTexture("debug-water", 64, 32);

    g.destroy();
  }

  buildGround() {
    this.groundLayer = this.add.layer();
    this.groundLayer.setDepth(-1000);
    this.waterGleams = [];

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const world = isoToWorld(x, y);
        const landHere = this.world.land[y][x];
        const seed = (x * 73 + y * 151 + (x ^ y) * 17) >>> 0;
        const grassFrame = pick(GRASS_FRAMES, seed);
        const sandFrame = pick(SAND_FRAMES, seed >> 1);
        const base = landHere
          ? this.add.image(world.x, world.y, "grass-tiles", grassFrame).setOrigin(0.5, 0.5).setScale(0.5)
          : this.add.image(world.x, world.y, "water-diamond").setOrigin(0.5, 0.5);
        base.setDepth(world.y - 1000);
        this.groundLayer.add(base);

        const pathMask = this.world.path[y][x];
        if (landHere && pathMask > 0.28) {
          const sand = this.add.image(world.x, world.y + 1, "sand-tiles", sandFrame).setOrigin(0.5, 0.5).setScale(0.5);
          sand.setAlpha(0.14 + pathMask * 0.2);
          sand.setDepth(world.y - 999);
          this.groundLayer.add(sand);
        }

        if (!landHere) {
          const gleam = this.add.image(world.x, world.y, "water-diamond").setOrigin(0.5, 0.5);
          gleam.setTint(0x7ad8ff);
          gleam.setAlpha(0.08 + ((x + y) % 3) * 0.015);
          gleam.setBlendMode(Phaser.BlendModes.SCREEN);
          gleam.setDepth(world.y - 998);
          this.groundLayer.add(gleam);
          this.waterGleams.push(gleam);
        }
      }
    }

    const nightWash = this.add.rectangle(WORLD_W * 0.5, WORLD_H * 0.5, WORLD_W, WORLD_H, 0x143560, 0.1);
    nightWash.setBlendMode(Phaser.BlendModes.SCREEN);
    nightWash.setDepth(-990);
    const shade = this.add.rectangle(WORLD_W * 0.5, WORLD_H * 0.5, WORLD_W, WORLD_H, 0x08111c, 0.08);
    shade.setBlendMode(Phaser.BlendModes.MULTIPLY);
    shade.setDepth(-989);
  }

  buildDebugGrid() {
    if (new URLSearchParams(window.location.search).get("debugGrid") !== "1") return;
    const layer = this.add.layer().setDepth(7000);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const pos = isoToWorld(x, y);
        const key = this.world.land[y][x] ? "debug-land" : "debug-water";
        const img = this.add.image(pos.x, pos.y, key).setOrigin(0.5, 0.5);
        img.setAlpha(this.world.land[y][x] ? 0.28 : 0.38);
        layer.add(img);
      }
    }
    this.debugMarker = this.add.circle(0, 0, 6, 0xffff66, 0.95).setDepth(7100);
  }

  buildProps() {
    this.propLayer = this.add.layer();
    this.propLayer.setDepth(10);
    this.fireflyPoints = [];

    for (const prop of this.world.props) {
      const pos = isoToWorld(prop.x, prop.y);
      let sprite = null;

      if (prop.type === "tree") {
        sprite = this.add.image(pos.x, pos.y + 10, prop.variant).setOrigin(0.5, 0.92);
        sprite.setScale(prop.scale);
        sprite.setAlpha(0.95);
        sprite.setTint(0xe8f4ff);
      } else if (prop.type === "stone") {
        sprite = this.add.image(pos.x, pos.y + 4, prop.tall ? "stone-tall" : "stone-short").setOrigin(0.5, 0.9);
        sprite.setScale(prop.tall ? 0.96 : 0.84);
        if (prop.glow) {
          const glow = this.add.circle(pos.x, pos.y - 8, 14, 0xa7c8ff, 0.11).setBlendMode(Phaser.BlendModes.ADD);
          glow.depth = pos.y - 3;
          this.propLayer.add(glow);
          this.fireflyPoints.push({ x: pos.x, y: pos.y - 8, radius: 20 });
        }
      } else if (prop.type === "lantern") {
        sprite = this.add.image(pos.x, pos.y + 2, "lantern").setOrigin(0.5, 0.9);
        const glow = this.add.circle(pos.x, pos.y - 4, 22, 0xffb263, 0.13).setBlendMode(Phaser.BlendModes.ADD);
        glow.depth = pos.y - 1;
        this.propLayer.add(glow);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.08, to: 0.16 },
          scale: { from: 0.94, to: 1.12 },
          duration: 1700 + ((prop.x + prop.y) % 5) * 170,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
        this.fireflyPoints.push({ x: pos.x, y: pos.y - 10, radius: 20 });
      } else if (prop.type === "plant") {
        sprite = this.add.image(pos.x, pos.y + 4, prop.variant).setOrigin(0.5, 0.82);
        sprite.setScale(prop.scale);
        sprite.setAlpha(prop.alpha ?? 1);
      } else if (prop.type.startsWith("ruin-")) {
        sprite = this.add.image(pos.x, pos.y + 8, prop.type).setOrigin(0.5, 0.84);
        sprite.setScale(prop.scale);
        sprite.setAlpha(0.95);
        if (prop.type === "ruin-ring") {
          const glow = this.add.circle(pos.x, pos.y - 18, 60, 0x8fd7c3, 0.08).setBlendMode(Phaser.BlendModes.SCREEN);
          glow.depth = pos.y + 40;
          this.propLayer.add(glow);
          this.tweens.add({
            targets: glow,
            alpha: { from: 0.05, to: 0.11 },
            scale: { from: 0.94, to: 1.06 },
            duration: 2800,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          });
        }
      }

      if (sprite) {
        const depthBoost = prop.type === "tree" ? 120 : prop.type.startsWith("ruin-") ? 90 : 24;
        sprite.depth = pos.y + depthBoost;
        this.propLayer.add(sprite);
      }
    }
  }

  createPlayer() {
    const spawn = isoToWorld(this.world.spawn.x, this.world.spawn.y);
    this.playerWorld = { x: spawn.x, y: spawn.y };
    this.playerRoot = this.add.container(spawn.x, spawn.y);
    this.playerDirection = "sw";
    this.playerGlow = this.add.circle(0, -18, 26, 0xffbf73, 0.14).setBlendMode(Phaser.BlendModes.ADD);
    this.playerShadow = this.add.image(0, 8, "shadow").setScale(0.72).setAlpha(0.52);
    this.playerSprite = this.add.sprite(0, 10, "crusader-idle", 0).setOrigin(0.5, 0.92);
    this.playerSprite.setScale(0.32);
    this.playerSprite.play("crusader-idle-sw");
    this.playerRoot.add([this.playerGlow, this.playerShadow, this.playerSprite]);
    this.playerRoot.setDepth(spawn.y + 200);
  }

  createAtmosphere() {
    const wash = this.add.rectangle(WORLD_W * 0.5, WORLD_H * 0.5, WORLD_W, WORLD_H, 0x173051, 0.09);
    wash.setBlendMode(Phaser.BlendModes.SCREEN);
    wash.setDepth(8000);

    this.fog = this.add.particles(0, 0, "shadow", {
      x: { min: 120, max: WORLD_W - 120 },
      y: { min: 140, max: WORLD_H - 90 },
      scale: { start: 1.3, end: 2.3 },
      alpha: { start: 0.03, end: 0 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -2, max: 2 },
      lifespan: 10000,
      frequency: 340,
      quantity: 1,
      blendMode: "SCREEN",
    });
    this.fog.setDepth(8100);

    this.fireflies = this.add.particles(0, 0, "firefly", {
      x: 0,
      y: 0,
      lifespan: 1600,
      speed: { min: 6, max: 18 },
      angle: { min: 0, max: 360 },
      alpha: { start: 0.7, end: 0 },
      scale: { start: 0.46, end: 0 },
      quantity: 1,
      frequency: 180,
      blendMode: "ADD",
      emitZone: { type: "random", source: new Phaser.Geom.Circle(0, 0, 20) },
    });
    this.fireflies.setDepth(8200);

    this.time.addEvent({
      delay: 240,
      loop: true,
      callback: () => {
        const point = pick(this.fireflyPoints, Math.floor(this.time.now / 240));
        if (!point) return;
        this.fireflies.setPosition(point.x, point.y);
      },
    });
  }

  addSky() {
    const sky = this.add.container(0, 0).setScrollFactor(0).setDepth(10000);
    const topShade = this.add.rectangle(this.scale.width * 0.5, 0, this.scale.width, 140, 0x08111d, 0.16).setOrigin(0.5, 0);
    sky.add(topShade);

    this.scale.on("resize", (size) => {
      topShade.setSize(size.width, 140);
    });
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");
    const autoEnter = new URLSearchParams(window.location.search).get("autoplay") === "1";
    const enter = () => {
      if (this.entered) return;
      this.entered = true;
      document.getElementById("veil")?.classList.add("hidden");
      this.resumeAudio();
    };
    this.input.keyboard.on("keydown", enter);
    this.input.on("pointerdown", enter);
    if (autoEnter) enter();
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.playerRoot, true, 0.09, 0.09);
    this.cameras.main.setZoom(Math.min(window.innerWidth / 980, window.innerHeight / 680, 1.38));
    this.scale.on("resize", (size) => {
      this.cameras.main.setZoom(Math.min(size.width / 980, size.height / 680, 1.38));
    });
  }

  initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audio = new AudioCtx();
      this.resumeAudio = () => this.audio.resume();

      const master = this.audio.createGain();
      master.gain.value = 0.22;
      master.connect(this.audio.destination);

      const makeNoiseBuffer = () => {
        const buffer = this.audio.createBuffer(1, this.audio.sampleRate * 2, this.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
        return buffer;
      };

      const surf = this.audio.createBufferSource();
      surf.buffer = makeNoiseBuffer();
      surf.loop = true;
      const surfFilter = this.audio.createBiquadFilter();
      surfFilter.type = "lowpass";
      surfFilter.frequency.value = 420;
      const surfGain = this.audio.createGain();
      surfGain.gain.value = 0.03;
      surf.connect(surfFilter).connect(surfGain).connect(master);
      surf.start();

      const drone = this.audio.createOscillator();
      drone.type = "triangle";
      drone.frequency.value = 138.59;
      const droneGain = this.audio.createGain();
      droneGain.gain.value = 0.014;
      drone.connect(droneGain).connect(master);
      drone.start();

      const notes = [277.18, 311.13, 369.99, 415.3];
      const playTone = () => {
        const osc = this.audio.createOscillator();
        osc.type = "sine";
        osc.frequency.value = pick(notes, Math.floor(Math.random() * notes.length));
        const gain = this.audio.createGain();
        gain.gain.value = 0.0001;
        gain.gain.exponentialRampToValueAtTime(0.014, this.audio.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + 1.6);
        osc.connect(gain).connect(master);
        osc.start();
        osc.stop(this.audio.currentTime + 1.65);
        setTimeout(playTone, 1700 + Math.random() * 2200);
      };
      setTimeout(playTone, 800);
    } catch (error) {
      this.resumeAudio = () => {};
    }
  }

  canWalk(tileX, tileY) {
    const x = Math.round(tileX);
    const y = Math.round(tileY);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    return this.world.land[y][x];
  }

  canWalkWorld(wx, wy) {
    const tile = worldToTile(wx, wy);
    return this.canWalk(tile.x, tile.y);
  }

  getDirectionForVelocity(worldVX, worldVY) {
    const angle = Math.atan2(worldVY, worldVX);
    const sector = Math.round(angle / (Math.PI / 4));
    const dirs = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
    return dirs[((sector % 8) + 8) % 8];
  }

  setPlayerAnimation(direction, moving) {
    this.playerDirection = direction || this.playerDirection;
    const key = `crusader-${moving ? "walk" : "idle"}-${this.playerDirection}`;
    if (this.playerSprite.anims.currentAnim?.key !== key) {
      this.playerSprite.play(key, true);
    }
  }

  updateScene(time, delta) {
    if (!this.playerWorld || !this.playerRoot || !this.playerSprite) return;
    const dt = delta / 1000;
    let moveX = 0;
    let moveY = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) moveX -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) moveX += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) moveY -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) moveY += 1;

    if (moveX || moveY) {
      const length = Math.hypot(moveX, moveY);
      moveX /= length;
      moveY /= length;
      const worldVX = (moveX - moveY) * TILE_W * 0.5 * 2.65;
      const worldVY = (moveX + moveY) * TILE_H * 0.5 * 2.65;
      this.setPlayerAnimation(this.getDirectionForVelocity(worldVX, worldVY), true);
      const nextX = this.playerWorld.x + worldVX * dt;
      const nextY = this.playerWorld.y + worldVY * dt;
      if (this.canWalkWorld(nextX, this.playerWorld.y)) this.playerWorld.x = nextX;
      if (this.canWalkWorld(this.playerWorld.x, nextY)) this.playerWorld.y = nextY;
    } else {
      this.setPlayerAnimation(this.playerDirection, false);
    }

    this.playerRoot.x = Phaser.Math.Linear(this.playerRoot.x, this.playerWorld.x, 0.22);
    this.playerRoot.y = Phaser.Math.Linear(this.playerRoot.y, this.playerWorld.y, 0.22);
    this.playerRoot.depth = this.playerRoot.y + 200;
    if (this.debugMarker) {
      const tile = worldToTile(this.playerWorld.x, this.playerWorld.y);
      const snapped = isoToWorld(Math.round(tile.x), Math.round(tile.y));
      this.debugMarker.setPosition(snapped.x, snapped.y);
    }

    const idlePulse = Math.sin(time * 0.0035);
    this.playerGlow.radius = 23 + idlePulse * 1.8;
    this.playerShadow.scaleX = 0.69 + idlePulse * 0.02;
    this.playerShadow.scaleY = 0.66 + idlePulse * 0.02;
    if (this.waterGleams?.length) {
      for (let i = 0; i < this.waterGleams.length; i++) {
        const gleam = this.waterGleams[i];
        gleam.alpha = 0.06 + (Math.sin(time * 0.0018 + i * 0.37) + 1) * 0.03;
      }
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  transparent: true,
  backgroundColor: "#000000",
  scene: [SanctuaryScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
});
