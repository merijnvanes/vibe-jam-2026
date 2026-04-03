// ============================================================
// PIXEL WORLD v2 — Using Kenney Tiny Town + Tiny Dungeon assets
// CC0 licensed, beautiful pixel art
// ============================================================

const TILE = 16;
const NATIVE_W = 256;
const NATIVE_H = 192;
const SCALE = Math.min(
  Math.floor(window.innerWidth / NATIVE_W),
  Math.floor(window.innerHeight / NATIVE_H)
);

const canvas = document.getElementById('game');
canvas.width = NATIVE_W * SCALE;
canvas.height = NATIVE_H * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const buf = document.createElement('canvas');
buf.width = NATIVE_W;
buf.height = NATIVE_H;
const bctx = buf.getContext('2d');
bctx.imageSmoothingEnabled = false;

// ============================================================
// ASSET LOADING
// ============================================================
const assets = {};
let assetsLoaded = 0;
const assetsTotal = 2;

function loadImage(name, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { assets[name] = img; assetsLoaded++; resolve(); };
    img.onerror = () => { console.error('Failed to load', src); resolve(); };
    img.src = src;
  });
}

// Tile positions in the packed tilemap (col, row) — 1px spacing, 16px tiles
// Position formula: x = col * 17, y = row * 17
function tilePos(col, row) {
  return { x: col * 17, y: row * 17, w: TILE, h: TILE };
}

// ============================================================
// TILE DEFINITIONS (from Kenney Tiny Town tilemap_packed.png)
// Mapped by visual inspection of the tilemap
// ============================================================
const TILES = {
  // Grass variants (row 0, cols 0-3)
  GRASS_TL: tilePos(0, 0),
  GRASS_T:  tilePos(1, 0),
  GRASS_TR: tilePos(2, 0),
  GRASS:    tilePos(1, 1),  // Plain grass center
  GRASS_L:  tilePos(0, 1),
  GRASS_R:  tilePos(2, 1),
  GRASS_BL: tilePos(0, 2),
  GRASS_B:  tilePos(1, 2),
  GRASS_BR: tilePos(2, 2),
  GRASS_DARK: tilePos(3, 1), // Darker grass

  // Dirt (row 0, col 3+)
  DIRT: tilePos(3, 0),

  // Trees
  TREE_GREEN_1: tilePos(4, 0),
  TREE_GREEN_2: tilePos(5, 0),
  TREE_GREEN_3: tilePos(6, 0),
  TREE_ROUND_1: tilePos(4, 1),
  TREE_ROUND_2: tilePos(5, 1),
  TREE_AUTUMN_1: tilePos(7, 0),
  TREE_AUTUMN_2: tilePos(8, 0),
  TREE_AUTUMN_3: tilePos(9, 0),

  // Flowers/bushes
  BUSH_1: tilePos(4, 2),
  BUSH_2: tilePos(5, 2),
  FLOWER_1: tilePos(6, 1),
  FLOWER_2: tilePos(6, 2),
  MUSHROOM: tilePos(7, 2),
  SPARKLE_1: tilePos(10, 0),
  SPARKLE_2: tilePos(10, 1),
  SPARKLE_3: tilePos(11, 0),

  // Stone path (row 3)
  STONE_TL: tilePos(0, 3),
  STONE_T:  tilePos(1, 3),
  STONE_TR: tilePos(2, 3),
  STONE_L:  tilePos(0, 4),
  STONE_C:  tilePos(1, 4),
  STONE_R:  tilePos(2, 4),
  STONE_BL: tilePos(0, 5),
  STONE_B:  tilePos(1, 5),
  STONE_BR: tilePos(2, 5),

  // Dirt path
  DIRT_TL: tilePos(3, 3),
  DIRT_T:  tilePos(4, 3),
  DIRT_TR: tilePos(5, 3),
  DIRT_L:  tilePos(3, 4),
  DIRT_C:  tilePos(4, 4),
  DIRT_R:  tilePos(5, 4),
  DIRT_BL: tilePos(3, 5),
  DIRT_B:  tilePos(4, 5),
  DIRT_BR: tilePos(5, 5),

  // Houses - red roof (row 3-5, cols 6-8)
  ROOF_RED_TL: tilePos(6, 3),
  ROOF_RED_T:  tilePos(7, 3),
  ROOF_RED_TR: tilePos(8, 3),
  WALL_1:  tilePos(6, 4),
  DOOR_1:  tilePos(7, 4),
  WALL_2:  tilePos(8, 4),
  WALL_B1: tilePos(6, 5),
  DOOR_B:  tilePos(7, 5),
  WALL_B2: tilePos(8, 5),

  // Houses - blue roof
  ROOF_BLUE_TL: tilePos(6, 6),
  ROOF_BLUE_T:  tilePos(7, 6),
  ROOF_BLUE_TR: tilePos(8, 6),

  // Stone buildings (row 6-8)
  STONE_WALL_TL: tilePos(0, 6),
  STONE_WALL_T:  tilePos(1, 6),
  STONE_WALL_TR: tilePos(2, 6),
  STONE_WALL_L:  tilePos(0, 7),
  STONE_WALL_C:  tilePos(1, 7),
  STONE_WALL_R:  tilePos(2, 7),
  STONE_WALL_BL: tilePos(0, 8),
  STONE_WALL_B:  tilePos(1, 8),
  STONE_WALL_BR: tilePos(2, 8),

  // Wooden walls
  WOOD_WALL_TL: tilePos(3, 6),
  WOOD_WALL_T:  tilePos(4, 6),
  WOOD_WALL_TR: tilePos(5, 6),
  WOOD_WALL_L:  tilePos(3, 7),
  WOOD_WALL_C:  tilePos(4, 7),
  WOOD_WALL_R:  tilePos(5, 7),
  WOOD_WALL_BL: tilePos(3, 8),
  WOOD_WALL_B:  tilePos(4, 8),
  WOOD_WALL_BR: tilePos(5, 8),

  // Fences / misc (row 3, cols 9-11)
  FENCE_H: tilePos(9, 3),
  FENCE_V: tilePos(9, 4),
  FENCE_POST: tilePos(10, 3),
  SIGN: tilePos(10, 4),

  // Items/objects (row 5-6, cols 9-11)
  CHEST: tilePos(9, 5),
  BARREL: tilePos(10, 5),
  CRATE: tilePos(11, 5),
  WELL: tilePos(9, 6),
  LAMP: tilePos(10, 6),

  // Water (row 9-10)
  WATER_TL: tilePos(0, 9),
  WATER_T:  tilePos(1, 9),
  WATER_TR: tilePos(2, 9),
  WATER_L:  tilePos(0, 10),
  WATER_C:  tilePos(1, 10),
  WATER_R:  tilePos(2, 10),

  // Characters from dungeon pack (row indices in dungeon tilemap)
  // Will use dungeon tilemap for characters
};

// Character tile positions in dungeon tilemap_packed.png
const CHARS = {
  // Row 7: character faces/front views
  // Row 8: more characters
  // Row 9: character sides/backs
  KNIGHT_F:  tilePos(0, 7),
  KNIGHT_F2: tilePos(1, 7),
  WIZARD_F:  tilePos(2, 7),
  WIZARD_F2: tilePos(3, 7),
  NPC_1_F:   tilePos(4, 7),
  NPC_1_F2:  tilePos(5, 7),
  NPC_2_F:   tilePos(6, 7),
  NPC_2_F2:  tilePos(7, 7),
  NPC_3_F:   tilePos(8, 7),
  NPC_3_F2:  tilePos(9, 7),

  NPC_4_F:   tilePos(0, 8),
  NPC_4_F2:  tilePos(1, 8),
  NPC_5_F:   tilePos(2, 8),
  NPC_5_F2:  tilePos(3, 8),
  NPC_6_F:   tilePos(4, 8),
  NPC_6_F2:  tilePos(5, 8),
  NPC_7_F:   tilePos(6, 8),
  NPC_7_F2:  tilePos(7, 8),

  // Side views (row 10)
  KNIGHT_S:  tilePos(0, 9),
  KNIGHT_S2: tilePos(1, 9),
  WIZARD_S:  tilePos(2, 9),
  WIZARD_S2: tilePos(3, 9),
};

// ============================================================
// DRAW HELPERS
// ============================================================
function drawTile(tileDef, dx, dy, sheet = 'town') {
  const img = assets[sheet];
  if (!img) return;
  bctx.drawImage(img, tileDef.x, tileDef.y, tileDef.w, tileDef.h, dx, dy, TILE, TILE);
}

// ============================================================
// MAP
// ============================================================
const MAP_W = 40;
const MAP_H = 35;

// Map layers: arrays of tile definitions (or null)
const mapGround = [];
const mapObjects = [];
const mapAbove = [];
const mapCollision = [];

function initMap() {
  for (let y = 0; y < MAP_H; y++) {
    mapGround[y] = [];
    mapObjects[y] = [];
    mapAbove[y] = [];
    mapCollision[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      mapGround[y][x] = TILES.GRASS;
      mapObjects[y][x] = null;
      mapAbove[y][x] = null;
      mapCollision[y][x] = false;
    }
  }

  // --- Variety in grass ---
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = Math.random();
      if (r < 0.15) mapGround[y][x] = TILES.GRASS_DARK;
    }
  }

  // --- Main horizontal dirt path ---
  layPath(0, 12, MAP_W, 3, 'dirt');

  // --- Vertical stone path through village ---
  layPath(18, 0, 3, MAP_H, 'stone');

  // --- Side path to the lake ---
  layPath(24, 20, 12, 3, 'dirt');

  // --- Lake (bottom-right) ---
  for (let y = 18; y < 28; y++) {
    for (let x = 28; x < 38; x++) {
      const cx = 33, cy = 23;
      const dx = (x - cx) * 0.8, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4) {
        mapGround[y][x] = TILES.WATER_C;
        mapCollision[y][x] = true;
      } else if (dist < 5) {
        // Shore — use appropriate edge tiles
        if (y < cy && Math.abs(x - cx) < 4) mapGround[y][x] = TILES.WATER_T;
        else if (y > cy && Math.abs(x - cx) < 4) mapGround[y][x] = TILES.WATER_C;
        else mapGround[y][x] = TILES.WATER_C;
        mapCollision[y][x] = true;
      }
    }
  }

  // --- Red roof house 1 ---
  placeHouse(14, 6, 'red');

  // --- Blue roof house 2 ---
  placeHouse(21, 16, 'blue');

  // --- Stone building (castle-like) ---
  placeStoneBuilding(8, 16);

  // --- Trees scattered ---
  const treeTypes = [TILES.TREE_GREEN_1, TILES.TREE_GREEN_2, TILES.TREE_GREEN_3,
                     TILES.TREE_ROUND_1, TILES.TREE_ROUND_2];
  const autumnTypes = [TILES.TREE_AUTUMN_1, TILES.TREE_AUTUMN_2, TILES.TREE_AUTUMN_3];

  // Forest border — top
  for (let x = 0; x < MAP_W; x += 2) {
    if (x >= 17 && x <= 21) continue; // Leave path clear
    const t = treeTypes[Math.floor(Math.random() * treeTypes.length)];
    placeTree(x, 0 + Math.floor(Math.random() * 2), t);
    if (Math.random() > 0.5) placeTree(x + 1, 1 + Math.floor(Math.random() * 2), treeTypes[Math.floor(Math.random() * treeTypes.length)]);
  }

  // Forest border — left
  for (let y = 0; y < MAP_H; y += 2) {
    if (y >= 11 && y <= 15) continue;
    placeTree(0, y, treeTypes[Math.floor(Math.random() * treeTypes.length)]);
    if (Math.random() > 0.5) placeTree(1, y + 1, treeTypes[Math.floor(Math.random() * treeTypes.length)]);
  }

  // Forest border — right
  for (let y = 0; y < MAP_H; y += 2) {
    placeTree(MAP_W - 1, y, treeTypes[Math.floor(Math.random() * treeTypes.length)]);
    if (Math.random() > 0.5) placeTree(MAP_W - 2, y + 1, autumnTypes[Math.floor(Math.random() * autumnTypes.length)]);
  }

  // Forest border — bottom
  for (let x = 0; x < MAP_W; x += 2) {
    placeTree(x, MAP_H - 1, treeTypes[Math.floor(Math.random() * treeTypes.length)]);
    if (Math.random() > 0.5) placeTree(x + 1, MAP_H - 2, treeTypes[Math.floor(Math.random() * treeTypes.length)]);
  }

  // Scattered village trees
  const villageTrees = [
    [5, 8], [10, 5], [26, 8], [30, 10], [12, 20], [6, 28],
    [15, 25], [25, 28], [35, 5], [35, 15], [4, 4],
    [28, 5], [32, 7], [22, 5], [10, 10], [27, 14],
  ];
  for (const [tx, ty] of villageTrees) {
    if (mapCollision[ty] && mapCollision[ty][tx]) continue;
    const isAutumn = tx > 25 && ty > 20;
    const types = isAutumn ? autumnTypes : treeTypes;
    placeTree(tx, ty, types[Math.floor(Math.random() * types.length)]);
  }

  // --- Flowers and bushes ---
  const decorPositions = [
    [7, 10, TILES.FLOWER_1], [8, 10, TILES.FLOWER_2], [9, 10, TILES.BUSH_1],
    [16, 9, TILES.FLOWER_1], [17, 9, TILES.FLOWER_2],
    [23, 14, TILES.BUSH_2], [24, 14, TILES.FLOWER_1],
    [5, 22, TILES.MUSHROOM], [6, 23, TILES.FLOWER_1],
    [30, 17, TILES.BUSH_1], [31, 17, TILES.FLOWER_2],
    [14, 22, TILES.FLOWER_1], [15, 23, TILES.FLOWER_2],
    [26, 26, TILES.BUSH_2], [27, 27, TILES.FLOWER_1],
    [10, 28, TILES.MUSHROOM], [11, 29, TILES.FLOWER_2],
  ];
  for (const [dx, dy, tile] of decorPositions) {
    if (dy < MAP_H && dx < MAP_W && !mapCollision[dy][dx]) {
      mapObjects[dy][dx] = tile;
    }
  }

  // --- Sparkles (golden particles on grass) ---
  for (let i = 0; i < 15; i++) {
    const sx = 3 + Math.floor(Math.random() * (MAP_W - 6));
    const sy = 3 + Math.floor(Math.random() * (MAP_H - 6));
    if (!mapCollision[sy][sx] && !mapObjects[sy][sx]) {
      mapObjects[sy][sx] = [TILES.SPARKLE_1, TILES.SPARKLE_2, TILES.SPARKLE_3][Math.floor(Math.random() * 3)];
    }
  }

  // --- Fences ---
  for (let x = 6; x <= 10; x++) {
    if (!mapCollision[9][x]) {
      mapObjects[9][x] = TILES.FENCE_H;
      mapCollision[9][x] = true;
    }
  }

  // --- Objects ---
  placeObject(15, 10, TILES.BARREL);
  placeObject(16, 10, TILES.CRATE);
  placeObject(22, 10, TILES.CHEST);
  placeObject(10, 15, TILES.WELL);
  placeObject(20, 14, TILES.SIGN);
  placeObject(25, 12, TILES.LAMP);
  placeObject(8, 12, TILES.LAMP);
}

function layPath(sx, sy, w, h, type) {
  for (let y = sy; y < sy + h && y < MAP_H; y++) {
    for (let x = sx; x < sx + w && x < MAP_W; x++) {
      const isTop = y === sy;
      const isBot = y === sy + h - 1;
      const isLeft = x === sx;
      const isRight = x === sx + w - 1;

      let tile;
      if (type === 'stone') {
        if (isTop && isLeft) tile = TILES.STONE_TL;
        else if (isTop && isRight) tile = TILES.STONE_TR;
        else if (isBot && isLeft) tile = TILES.STONE_BL;
        else if (isBot && isRight) tile = TILES.STONE_BR;
        else if (isTop) tile = TILES.STONE_T;
        else if (isBot) tile = TILES.STONE_B;
        else if (isLeft) tile = TILES.STONE_L;
        else if (isRight) tile = TILES.STONE_R;
        else tile = TILES.STONE_C;
      } else {
        if (isTop && isLeft) tile = TILES.DIRT_TL;
        else if (isTop && isRight) tile = TILES.DIRT_TR;
        else if (isBot && isLeft) tile = TILES.DIRT_BL;
        else if (isBot && isRight) tile = TILES.DIRT_BR;
        else if (isTop) tile = TILES.DIRT_T;
        else if (isBot) tile = TILES.DIRT_B;
        else if (isLeft) tile = TILES.DIRT_L;
        else if (isRight) tile = TILES.DIRT_R;
        else tile = TILES.DIRT_C;
      }
      mapGround[y][x] = tile;
    }
  }
}

function placeTree(x, y, tileDef) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
  if (mapCollision[y][x]) return;
  mapObjects[y][x] = tileDef;
  mapCollision[y][x] = true;
}

function placeObject(x, y, tileDef) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
  mapObjects[y][x] = tileDef;
  mapCollision[y][x] = true;
}

function placeHouse(x, y, roofColor) {
  const roofTL = roofColor === 'red' ? TILES.ROOF_RED_TL : TILES.ROOF_BLUE_TL;
  const roofT  = roofColor === 'red' ? TILES.ROOF_RED_T  : TILES.ROOF_BLUE_T;
  const roofTR = roofColor === 'red' ? TILES.ROOF_RED_TR : TILES.ROOF_BLUE_TR;

  // Roof (above layer so player walks behind)
  mapAbove[y][x] = roofTL;
  mapAbove[y][x + 1] = roofT;
  mapAbove[y][x + 2] = roofTR;

  // Walls
  mapObjects[y + 1][x] = TILES.WALL_1;
  mapObjects[y + 1][x + 1] = TILES.DOOR_1;
  mapObjects[y + 1][x + 2] = TILES.WALL_2;
  mapCollision[y + 1][x] = true;
  mapCollision[y + 1][x + 1] = true;
  mapCollision[y + 1][x + 2] = true;

  // Bottom walls
  mapObjects[y + 2][x] = TILES.WALL_B1;
  mapObjects[y + 2][x + 1] = TILES.DOOR_B;
  mapObjects[y + 2][x + 2] = TILES.WALL_B2;
  mapCollision[y + 2][x] = true;
  mapCollision[y + 2][x + 2] = true;
  // Door is walkable? Actually keep blocked for now
  mapCollision[y + 2][x + 1] = true;
}

function placeStoneBuilding(x, y) {
  // 3x3 stone building
  const rows = [
    [TILES.STONE_WALL_TL, TILES.STONE_WALL_T, TILES.STONE_WALL_TR],
    [TILES.STONE_WALL_L, TILES.STONE_WALL_C, TILES.STONE_WALL_R],
    [TILES.STONE_WALL_BL, TILES.STONE_WALL_B, TILES.STONE_WALL_BR],
  ];
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      if (dy === 0) {
        mapAbove[y + dy][x + dx] = rows[dy][dx];
      } else {
        mapObjects[y + dy][x + dx] = rows[dy][dx];
      }
      mapCollision[y + dy][x + dx] = true;
    }
  }
}

// ============================================================
// PLAYER
// ============================================================
const player = {
  x: 19, y: 13,
  px: 19 * TILE, py: 13 * TILE,
  dir: 0, // 0=down, 1=up, 2=left, 3=right
  frame: 0,
  moving: false,
  moveProgress: 0,
  targetX: 19, targetY: 13,
  speed: 2.5,
  animTimer: 0,
};

// ============================================================
// NPCs
// ============================================================
const npcs = [
  { tile1: CHARS.NPC_1_F, tile2: CHARS.NPC_1_F2, x: 16, y: 11, dir: 0, frame: 0, timer: 0,
    path: [{x:16,y:11},{x:16,y:13},{x:18,y:13},{x:18,y:11}], pi: 0, speed: 0.8 },
  { tile1: CHARS.NPC_2_F, tile2: CHARS.NPC_2_F2, x: 24, y: 18, dir: 0, frame: 0, timer: 0,
    path: [{x:24,y:18},{x:26,y:18},{x:26,y:20},{x:24,y:20}], pi: 0, speed: 0.6 },
  { tile1: CHARS.NPC_3_F, tile2: CHARS.NPC_3_F2, x: 10, y: 20, dir: 0, frame: 0, timer: 0,
    path: [{x:10,y:20},{x:10,y:24},{x:12,y:24},{x:12,y:20}], pi: 0, speed: 0.5 },
  { tile1: CHARS.WIZARD_F, tile2: CHARS.WIZARD_F2, x: 6, y: 14, dir: 0, frame: 0, timer: 0,
    path: [{x:6,y:14},{x:6,y:14}], pi: 0, speed: 0 }, // Stationary wizard
  { tile1: CHARS.KNIGHT_F, tile2: CHARS.KNIGHT_F2, x: 30, y: 12, dir: 0, frame: 0, timer: 0,
    path: [{x:30,y:12},{x:34,y:12}], pi: 0, speed: 0.7 },
];

// ============================================================
// CAMERA
// ============================================================
const camera = { x: 0, y: 0 };

function updateCamera() {
  const targetX = player.px - NATIVE_W / 2 + TILE / 2;
  const targetY = player.py - NATIVE_H / 2 + TILE / 2;
  camera.x = Math.round(Math.max(0, Math.min(MAP_W * TILE - NATIVE_W, targetX)));
  camera.y = Math.round(Math.max(0, Math.min(MAP_H * TILE - NATIVE_H, targetY)));
}

// ============================================================
// PARTICLES
// ============================================================
const particles = [];

function spawnParticles(time) {
  // Falling leaves
  if (particles.length < 20 && Math.random() < 0.02) {
    particles.push({
      type: 'leaf',
      x: camera.x + Math.random() * NATIVE_W,
      y: camera.y - 4,
      vx: 0.15 + Math.random() * 0.25,
      vy: 0.2 + Math.random() * 0.3,
      life: 400,
      wobble: Math.random() * Math.PI * 2,
      color: ['#8a6030', '#a07840', '#6a4a20', '#c09050'][Math.floor(Math.random() * 4)],
    });
  }

  // Fireflies at "night" (based on day cycle)
  const cycle = (Math.sin(time * 0.0003) + 1) / 2;
  if (cycle < 0.3 && particles.length < 25 && Math.random() < 0.03) {
    particles.push({
      type: 'firefly',
      x: camera.x + Math.random() * NATIVE_W,
      y: camera.y + Math.random() * NATIVE_H * 0.7,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.15,
      life: 300,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.type === 'leaf') {
      p.wobble += 0.06;
      p.x += p.vx + Math.sin(p.wobble) * 0.4;
      p.y += p.vy;
    } else if (p.type === 'firefly') {
      p.x += p.vx + Math.sin(p.phase + p.life * 0.04) * 0.15;
      p.y += p.vy + Math.cos(p.phase + p.life * 0.03) * 0.1;
    }
  }
}

function renderParticles(time) {
  for (const p of particles) {
    const sx = Math.round(p.x - camera.x);
    const sy = Math.round(p.y - camera.y);
    if (sx < -3 || sx > NATIVE_W + 3 || sy < -3 || sy > NATIVE_H + 3) continue;

    if (p.type === 'leaf') {
      bctx.fillStyle = p.color;
      bctx.fillRect(sx, sy, 2, 1);
      bctx.fillRect(sx + 1, sy + 1, 1, 1);
    } else if (p.type === 'firefly') {
      const brightness = (Math.sin(p.phase + p.life * 0.1) + 1) / 2;
      if (brightness > 0.3) {
        bctx.fillStyle = `rgba(200, 255, 120, ${brightness * 0.9})`;
        bctx.fillRect(sx, sy, 1, 1);
        if (brightness > 0.6) {
          bctx.fillStyle = `rgba(200, 255, 120, ${brightness * 0.3})`;
          bctx.fillRect(sx - 1, sy, 3, 1);
          bctx.fillRect(sx, sy - 1, 1, 3);
        }
      }
    }
  }
}

// ============================================================
// DAY/NIGHT
// ============================================================
function renderDayNight(time) {
  const cycle = (Math.sin(time * 0.0003) + 1) / 2;
  if (cycle < 0.25) {
    const alpha = (0.25 - cycle) / 0.25 * 0.4;
    bctx.fillStyle = `rgba(15, 20, 50, ${alpha})`;
    bctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
  } else if (cycle > 0.8) {
    const alpha = (cycle - 0.8) / 0.2 * 0.08;
    bctx.fillStyle = `rgba(255, 180, 80, ${alpha})`;
    bctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
  }
}

// ============================================================
// AUDIO
// ============================================================
let audioCtx = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Ambient wind
  const bufSize = audioCtx.sampleRate * 3;
  const nBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = nBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.008;
  const src = audioCtx.createBufferSource();
  src.buffer = nBuf; src.loop = true;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 250;
  const g = audioCtx.createGain(); g.gain.value = 0.5;
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start();

  // Melody
  const notes = [392, 440, 524, 660, 524, 440, 392, 330, 392, 440, 524, 440];
  let ni = 0;
  function playNote() {
    const o = audioCtx.createOscillator();
    o.type = 'square';
    o.frequency.value = notes[ni % notes.length] * 0.5;
    const ng = audioCtx.createGain();
    ng.gain.value = 0.02;
    ng.gain.setTargetAtTime(0, audioCtx.currentTime + 0.2, 0.08);
    o.connect(ng).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.35);
    ni++;
    setTimeout(playNote, 700 + Math.random() * 400);
  }
  setTimeout(playNote, 1500);

  // Birds
  function chirp() {
    const freq = 2500 + Math.random() * 2000;
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 1.4, audioCtx.currentTime + 0.04);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, audioCtx.currentTime + 0.1);
    const cg = audioCtx.createGain();
    cg.gain.setValueAtTime(0.015, audioCtx.currentTime);
    cg.gain.setTargetAtTime(0, audioCtx.currentTime + 0.06, 0.02);
    o.connect(cg).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.12);
    setTimeout(chirp, 4000 + Math.random() * 8000);
  }
  setTimeout(chirp, 2000);
}

function playFootstep() {
  if (!audioCtx) return;
  const bufSize = Math.floor(audioCtx.sampleRate * 0.04);
  const nb = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1);
  const s = audioCtx.createBufferSource(); s.buffer = nb;
  const flt = audioCtx.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = 2500; flt.Q.value = 1;
  const fg = audioCtx.createGain(); fg.gain.value = 0.025;
  fg.gain.setTargetAtTime(0, audioCtx.currentTime + 0.025, 0.008);
  s.connect(flt).connect(fg).connect(audioCtx.destination);
  s.start(); s.stop(audioCtx.currentTime + 0.05);
}

// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; initAudio(); e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.key] = false; e.preventDefault(); });

// ============================================================
// UPDATE
// ============================================================
function updatePlayer(dt) {
  if (!player.moving) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w']) { dy = -1; player.dir = 1; }
    else if (keys['ArrowDown'] || keys['s']) { dy = 1; player.dir = 0; }
    else if (keys['ArrowLeft'] || keys['a']) { dx = -1; player.dir = 2; }
    else if (keys['ArrowRight'] || keys['d']) { dx = 1; player.dir = 3; }

    if (dx !== 0 || dy !== 0) {
      const nx = player.x + dx, ny = player.y + dy;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && !mapCollision[ny][nx]) {
        player.targetX = nx; player.targetY = ny;
        player.moving = true; player.moveProgress = 0;
      }
    }
  }

  if (player.moving) {
    player.moveProgress += dt * player.speed;
    player.animTimer += dt;
    if (player.animTimer > 0.12) { player.animTimer = 0; player.frame = 1 - player.frame; }

    const t = Math.min(player.moveProgress, 1);
    player.px = (player.x + (player.targetX - player.x) * t) * TILE;
    player.py = (player.y + (player.targetY - player.y) * t) * TILE;

    if (player.moveProgress >= 1) {
      player.x = player.targetX; player.y = player.targetY;
      player.px = player.x * TILE; player.py = player.y * TILE;
      player.moving = false;
      playFootstep();
    }
  }
}

function updateNPCs(dt) {
  for (const npc of npcs) {
    if (npc.speed === 0) continue;
    npc.timer += dt;
    if (npc.timer >= 1 / npc.speed) {
      npc.timer = 0;
      const target = npc.path[npc.pi];
      const dx = Math.sign(target.x - npc.x);
      const dy = Math.sign(target.y - npc.y);
      if (dx !== 0) npc.x += dx;
      else if (dy !== 0) npc.y += dy;
      if (npc.x === target.x && npc.y === target.y) npc.pi = (npc.pi + 1) % npc.path.length;
      npc.frame = 1 - npc.frame;
    }
  }
}

// ============================================================
// RENDER
// ============================================================
function render(time) {
  bctx.fillStyle = '#2a5a2a';
  bctx.fillRect(0, 0, NATIVE_W, NATIVE_H);

  const sx = Math.floor(camera.x / TILE);
  const sy = Math.floor(camera.y / TILE);
  const ex = Math.min(MAP_W - 1, sx + Math.ceil(NATIVE_W / TILE) + 1);
  const ey = Math.min(MAP_H - 1, sy + Math.ceil(NATIVE_H / TILE) + 1);

  // Ground
  for (let ty = sy; ty <= ey; ty++) {
    for (let tx = sx; tx <= ex; tx++) {
      if (ty < 0 || tx < 0) continue;
      const tile = mapGround[ty][tx];
      if (tile) drawTile(tile, tx * TILE - camera.x, ty * TILE - camera.y);
    }
  }

  // Build sorted draw list (objects + player + NPCs)
  const drawList = [];

  for (let ty = sy; ty <= ey; ty++) {
    for (let tx = sx; tx <= ex; tx++) {
      if (ty < 0 || tx < 0) continue;
      const obj = mapObjects[ty][tx];
      if (obj) {
        drawList.push({
          type: 'tile', tile: obj, sheet: 'town',
          x: tx * TILE - camera.x, y: ty * TILE - camera.y,
          sortY: ty * TILE + TILE,
        });
      }
    }
  }

  // Player
  drawList.push({
    type: 'player',
    x: Math.round(player.px - camera.x),
    y: Math.round(player.py - camera.y),
    sortY: player.py + TILE,
  });

  // NPCs
  for (const npc of npcs) {
    drawList.push({
      type: 'npc', npc,
      x: npc.x * TILE - camera.x,
      y: npc.y * TILE - camera.y,
      sortY: npc.y * TILE + TILE,
    });
  }

  drawList.sort((a, b) => a.sortY - b.sortY);

  for (const item of drawList) {
    if (item.type === 'player') {
      // Shadow
      bctx.fillStyle = 'rgba(0,0,0,0.15)';
      bctx.beginPath();
      bctx.ellipse(item.x + 8, item.y + 15, 5, 2, 0, 0, Math.PI * 2);
      bctx.fill();
      // Player uses knight sprite from dungeon pack
      const charTile = player.frame === 0 ? CHARS.KNIGHT_F : CHARS.KNIGHT_F2;
      drawTile(charTile, item.x, item.y, 'dungeon');
    } else if (item.type === 'npc') {
      // Shadow
      bctx.fillStyle = 'rgba(0,0,0,0.12)';
      bctx.beginPath();
      bctx.ellipse(item.x + 8, item.y + 15, 4, 2, 0, 0, Math.PI * 2);
      bctx.fill();
      const tile = item.npc.frame === 0 ? item.npc.tile1 : item.npc.tile2;
      drawTile(tile, item.x, item.y, 'dungeon');
    } else {
      drawTile(item.tile, item.x, item.y, item.sheet || 'town');
    }
  }

  // Above layer
  for (let ty = sy; ty <= ey; ty++) {
    for (let tx = sx; tx <= ex; tx++) {
      if (ty < 0 || tx < 0) continue;
      const above = mapAbove[ty][tx];
      if (above) {
        // Semi-transparent if player is nearby
        const near = Math.abs(player.py / TILE - ty) < 2 && Math.abs(player.px / TILE - tx) < 2;
        if (near) bctx.globalAlpha = 0.5;
        drawTile(above, tx * TILE - camera.x, ty * TILE - camera.y);
        if (near) bctx.globalAlpha = 1;
      }
    }
  }

  // Particles
  renderParticles(time);

  // Day/night
  renderDayNight(time);

  // Scale to display
  ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
}

// ============================================================
// GAME LOOP
// ============================================================
let lastTime = 0;

async function init() {
  await Promise.all([
    loadImage('town', 'assets/tiny-town/Tilemap/tilemap_packed.png'),
    loadImage('dungeon', 'assets/tiny-dungeon/Tilemap/tilemap_packed.png'),
  ]);

  initMap();
  updateCamera();

  setTimeout(() => {
    document.getElementById('loading').classList.add('fade');
    setTimeout(() => document.getElementById('loading').style.display = 'none', 1500);
  }, 200);

  requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  updatePlayer(dt);
  updateNPCs(dt);
  spawnParticles(timestamp);
  updateParticles();
  updateCamera();
  render(timestamp);
}

init();
