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

      if (land[y][x] && !blocked.has(`${x},${y}`) && !nearPath && (lush || orchard || whisper) && rng() > (orchard ? 0.15 : 0.42)) {
        addProp("tree", x + rng() * 0.55 - 0.28, y + rng() * 0.55 - 0.28, {
          variant: rng() > 0.5 ? "oak-a" : "oak-b",
          scale: orchard ? 0.2 + rng() * 0.03 : 0.16 + rng() * 0.05,
        });
        mark(x, y, 1);
      } else if (land[y][x] && lush && rng() > 0.83) {
        addProp("flower", x + rng() * 0.8 - 0.4, y + rng() * 0.8 - 0.4, {
          tint: whisper ? 0xb8d5ff : 0xffd48a,
          scale: 0.75 + rng() * 0.55,
        });
      }

      const coast = !land[y - 1][x] || !land[y + 1][x] || !land[y][x - 1] || !land[y][x + 1];
      if (coast && land[y][x] && rng() > 0.84) {
        addProp("reed", x + rng() * 0.6 - 0.3, y + rng() * 0.6 - 0.3, {
          scale: 0.75 + rng() * 0.7,
          tint: rng() > 0.45 ? 0x7fa66f : 0x9db982,
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

  return {
    height,
    land,
    path,
    props,
    spawn: { x: 31, y: 37 },
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
  }

  create() {
    this.world = buildWorld(20260403);
    this.createGeneratedTextures();
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

  createGeneratedTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.clear();
    g.fillStyle(0x0a1020, 0.44);
    g.fillEllipse(32, 18, 46, 18);
    g.generateTexture("shadow", 64, 36);

    g.clear();
    g.fillStyle(0x2b335f, 1);
    g.beginPath();
    g.moveTo(15, 50);
    g.lineTo(24, 12);
    g.lineTo(34, 50);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xf6d0a5, 1);
    g.fillCircle(24, 11, 6);
    g.fillStyle(0xffc97e, 0.92);
    g.fillCircle(31, 28, 4);
    g.generateTexture("wanderer", 48, 58);

    g.clear();
    g.fillStyle(0x8eac72, 1);
    g.fillEllipse(10, 18, 4, 18);
    g.fillEllipse(16, 17, 4, 20);
    g.fillEllipse(22, 18, 4, 16);
    g.generateTexture("reed", 28, 30);

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
    g.fillStyle(0xffdd9d, 1);
    g.fillCircle(8, 8, 3);
    g.fillStyle(0xf3acd0, 1);
    g.fillCircle(18, 12, 2);
    g.fillStyle(0xb8d7ff, 1);
    g.fillCircle(12, 18, 2);
    g.generateTexture("flower", 24, 24);

    g.clear();
    g.fillStyle(0xd3bf93, 1);
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(63, 16);
    g.lineTo(32, 32);
    g.lineTo(1, 16);
    g.closePath();
    g.fillPath();
    g.generateTexture("sand-diamond", 64, 32);

    g.clear();
    g.fillStyle(0x345e2b, 1);
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(63, 16);
    g.lineTo(32, 32);
    g.lineTo(1, 16);
    g.closePath();
    g.fillPath();
    g.generateTexture("grass-diamond", 64, 32);

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

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const world = isoToWorld(x, y);
        const landHere = this.world.land[y][x];
        const base = this.add.image(world.x, world.y, landHere ? "grass-diamond" : "water-diamond").setOrigin(0.5, 0.5);
        base.setDepth(world.y - 1000);
        this.groundLayer.add(base);

        const pathMask = this.world.path[y][x];
        if (landHere && pathMask > 0.28) {
          const sand = this.add.image(world.x, world.y + 2, "sand-diamond").setOrigin(0.5, 0.5);
          sand.setAlpha(0.18 + pathMask * 0.18);
          sand.setRotation(0);
          sand.setDepth(world.y - 999);
          this.groundLayer.add(sand);
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
      } else if (prop.type === "flower") {
        sprite = this.add.image(pos.x, pos.y + 2, "flower").setOrigin(0.5, 0.8);
        sprite.setScale(0.44 * prop.scale);
        sprite.setTint(prop.tint);
      } else if (prop.type === "reed") {
        sprite = this.add.image(pos.x, pos.y + 3, "reed").setOrigin(0.5, 0.85);
        sprite.setScale(0.62 * prop.scale);
        sprite.setTint(prop.tint);
      }

      if (sprite) {
        sprite.depth = pos.y + (prop.type === "tree" ? 120 : 24);
        this.propLayer.add(sprite);
      }
    }
  }

  createPlayer() {
    const spawn = isoToWorld(this.world.spawn.x, this.world.spawn.y);
    this.playerWorld = { x: spawn.x, y: spawn.y };
    this.playerRoot = this.add.container(spawn.x, spawn.y);
    this.playerGlow = this.add.circle(8, -18, 24, 0xffbf73, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    this.playerShadow = this.add.image(0, 8, "shadow").setScale(0.72).setAlpha(0.52);
    this.playerSprite = this.add.image(0, 2, "wanderer").setOrigin(0.5, 1);
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
    this.cameras.main.setZoom(Math.min(window.innerWidth / 1280, window.innerHeight / 800, 1.18));
    this.scale.on("resize", (size) => {
      this.cameras.main.setZoom(Math.min(size.width / 1280, size.height / 800, 1.18));
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
      const nextX = this.playerWorld.x + worldVX * dt;
      const nextY = this.playerWorld.y + worldVY * dt;
      if (this.canWalkWorld(nextX, this.playerWorld.y)) this.playerWorld.x = nextX;
      if (this.canWalkWorld(this.playerWorld.x, nextY)) this.playerWorld.y = nextY;
      if (moveX < -0.1) this.playerSprite.setFlipX(true);
      if (moveX > 0.1) this.playerSprite.setFlipX(false);
    }

    this.playerRoot.x = Phaser.Math.Linear(this.playerRoot.x, this.playerWorld.x, 0.22);
    this.playerRoot.y = Phaser.Math.Linear(this.playerRoot.y, this.playerWorld.y, 0.22);
    this.playerRoot.depth = this.playerRoot.y + 200;
    if (this.debugMarker) {
      const tile = worldToTile(this.playerWorld.x, this.playerWorld.y);
      const snapped = isoToWorld(Math.round(tile.x), Math.round(tile.y));
      this.debugMarker.setPosition(snapped.x, snapped.y);
    }

    const bob = Math.sin(time * 0.005) * 2.2;
    this.playerSprite.y = 2 + bob;
    this.playerGlow.radius = 20 + Math.sin(time * 0.003) * 2;
    this.playerShadow.scaleX = 0.69 + Math.sin(time * 0.005) * 0.03;
    this.playerShadow.scaleY = 0.69 + Math.sin(time * 0.005) * 0.03;
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
