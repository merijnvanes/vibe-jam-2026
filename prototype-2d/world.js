// ============================================================
// PIXEL WORLD — Pokemon/Zelda style top-down 2D prototype
// Pure canvas, all sprites drawn in code, no external assets
// ============================================================

const TILE = 16;
const NATIVE_W = 240; // GBA-style resolution
const NATIVE_H = 160;
const SCALE = Math.min(
  Math.floor(window.innerWidth / NATIVE_W),
  Math.floor(window.innerHeight / NATIVE_H)
);

const canvas = document.getElementById('game');
canvas.width = NATIVE_W * SCALE;
canvas.height = NATIVE_H * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Offscreen canvas at native resolution
const buf = document.createElement('canvas');
buf.width = NATIVE_W;
buf.height = NATIVE_H;
const bctx = buf.getContext('2d');
bctx.imageSmoothingEnabled = false;

// ============================================================
// COLOR PALETTE (GBC/GBA inspired)
// ============================================================
const PAL = {
  // Grass (GBC warm greens)
  grass1: '#78c850', grass2: '#58a028', grass3: '#48a800', grassDark: '#306820',
  grassLight: '#88d800',
  // Dirt/path
  dirt1: '#e8d0a0', dirt2: '#c8a870', dirt3: '#a08050', dirtDark: '#785830',
  // Water
  water1: '#58a0e8', water2: '#3070c8', water3: '#1848a0', waterHighlight: '#a8d8f8',
  waterDeep: '#1848a0',
  // Trees
  trunk: '#886030', trunkDark: '#604020', trunkLight: '#b08050',
  canopy1: '#309020', canopy2: '#186018', canopy3: '#58c838', canopyDark: '#104010',
  // Buildings
  wall: '#f0e8d8', wallDark: '#d0c0a0', wallLight: '#f8f0e8',
  roof: '#e86060', roofDark: '#b03030', roofLight: '#f08080',
  woodWall: '#c09050', woodDark: '#a06030',
  // Stone
  stone1: '#a0a0a0', stone2: '#808080', stone3: '#c0b8b0',
  // Sand
  sand1: '#f0e0b0', sand2: '#d8c898',
  // Character
  skin: '#f8d8b0', skinDark: '#e8b888',
  hair: '#383838', hairDark: '#202020',
  shirt: '#3060b0', shirtDark: '#204890',
  pants: '#2850a0', pantsDark: '#183870',
  // Flowers
  flowerRed: '#e04040', flowerYellow: '#f0d040', flowerPink: '#f080a0',
  flowerWhite: '#f0f0e0', flowerPurple: '#9060c0',
  // UI / shadow
  shadow: 'rgba(0,0,0,0.20)',
  black: '#181018', white: '#f8f8f0',
};

// ============================================================
// TILE SPRITE GENERATOR
// ============================================================
const tileCache = {};

function createTileCanvas(drawFn) {
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const tc = c.getContext('2d');
  tc.imageSmoothingEnabled = false;
  drawFn(tc);
  return c;
}

function px(tc, x, y, color) {
  tc.fillStyle = color;
  tc.fillRect(x, y, 1, 1);
}

// --- Grass tiles ---
function drawGrass(tc, variant = 0) {
  tc.fillStyle = PAL.grass2;
  tc.fillRect(0, 0, TILE, TILE);

  // Base variation
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = Math.random();
      if (r < 0.15) px(tc, x, y, PAL.grass1);
      else if (r < 0.25) px(tc, x, y, PAL.grass3);
      else if (r < 0.28) px(tc, x, y, PAL.grassLight);
    }
  }

  // Grass blade tufts
  if (variant === 1) {
    px(tc, 3, 5, PAL.grassDark); px(tc, 4, 4, PAL.grassDark); px(tc, 4, 5, PAL.grass3);
    px(tc, 11, 10, PAL.grassDark); px(tc, 12, 9, PAL.grassDark); px(tc, 12, 10, PAL.grass3);
  } else if (variant === 2) {
    px(tc, 7, 3, PAL.grassDark); px(tc, 8, 2, PAL.grassDark);
    px(tc, 2, 12, PAL.grassDark); px(tc, 3, 11, PAL.grassDark);
    px(tc, 13, 7, PAL.grassDark); px(tc, 14, 6, PAL.grassDark);
  }
}

// --- Tall grass (animated) ---
function drawTallGrass(tc, frame = 0) {
  tc.fillStyle = PAL.grass2;
  tc.fillRect(0, 0, TILE, TILE);

  const offset = frame === 0 ? 0 : (frame === 1 ? 1 : -1);

  // Tall blades
  const bladeColor = [PAL.grass3, PAL.canopy1, PAL.grassDark];
  for (let i = 0; i < 5; i++) {
    const bx = 2 + i * 3 + offset;
    const c = bladeColor[i % 3];
    px(tc, bx, 4, c); px(tc, bx, 5, c); px(tc, bx, 6, PAL.grass3);
    px(tc, bx + 1, 5, c); px(tc, bx + 1, 6, c);
    px(tc, bx, 7, PAL.grass2); px(tc, bx + 1, 7, PAL.grass2);
  }
  // Lower grass
  for (let y = 8; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (Math.random() < 0.3) px(tc, x, y, PAL.grass3);
      if (Math.random() < 0.1) px(tc, x, y, PAL.grassDark);
    }
  }
}

// --- Dirt path ---
function drawDirt(tc, variant = 0) {
  tc.fillStyle = PAL.dirt1;
  tc.fillRect(0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = Math.random();
      if (r < 0.12) px(tc, x, y, PAL.dirt2);
      else if (r < 0.2) px(tc, x, y, PAL.dirt3);
      else if (r < 0.24) px(tc, x, y, PAL.dirtDark);
    }
  }
  // Small pebbles
  if (variant === 1) {
    px(tc, 4, 8, PAL.stone2); px(tc, 5, 8, PAL.stone1);
    px(tc, 11, 4, PAL.stone2);
  }
}

// --- Water (animated) ---
function drawWater(tc, frame = 0) {
  tc.fillStyle = PAL.water1;
  tc.fillRect(0, 0, TILE, TILE);

  // Animated wave lines
  const offset = frame * 3;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wave = Math.sin((x + offset) * 0.8 + y * 0.3) * 0.5 + 0.5;
      if (wave > 0.7) px(tc, x, y, PAL.waterHighlight);
      else if (wave > 0.5) px(tc, x, y, PAL.water2);
      else if (wave < 0.2) px(tc, x, y, PAL.water3);
    }
  }
  // Sparkle highlights
  if (frame === 0) { px(tc, 4, 3, PAL.white); px(tc, 12, 10, PAL.white); }
  if (frame === 1) { px(tc, 8, 7, PAL.white); px(tc, 2, 12, PAL.white); }
  if (frame === 2) { px(tc, 14, 2, PAL.white); px(tc, 6, 14, PAL.white); }
}

// --- Sand ---
function drawSand(tc) {
  tc.fillStyle = PAL.sand1;
  tc.fillRect(0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      if (Math.random() < 0.15) px(tc, x, y, PAL.sand2);
}

// --- Stone path ---
function drawStonePath(tc) {
  tc.fillStyle = PAL.dirt2;
  tc.fillRect(0, 0, TILE, TILE);
  // Cobblestones
  const stones = [[1,1,6,4],[8,1,6,4],[2,6,5,4],[8,7,6,3],[1,11,6,4],[8,11,7,4]];
  for (const [sx, sy, sw, sh] of stones) {
    tc.fillStyle = PAL.stone1;
    tc.fillRect(sx, sy, sw, sh);
    tc.fillStyle = PAL.stone3;
    tc.fillRect(sx, sy, sw, 1);
    tc.fillRect(sx, sy, 1, sh);
    tc.fillStyle = PAL.stone2;
    tc.fillRect(sx, sy + sh - 1, sw, 1);
    tc.fillRect(sx + sw - 1, sy, 1, sh);
  }
}

// --- Flowers ---
function drawFlower(tc, color = PAL.flowerRed) {
  drawGrass(tc, 0);
  const cx = 7, cy = 6;
  // Stem
  px(tc, cx + 1, cy + 2, PAL.grass3); px(tc, cx + 1, cy + 3, PAL.grass3);
  px(tc, cx + 1, cy + 4, PAL.grassDark);
  // Petals
  px(tc, cx, cy, color); px(tc, cx + 2, cy, color);
  px(tc, cx, cy + 1, color); px(tc, cx + 2, cy + 1, color);
  px(tc, cx + 1, cy - 1, color);
  // Center
  px(tc, cx + 1, cy, PAL.flowerYellow);
  px(tc, cx + 1, cy + 1, PAL.flowerYellow);
}

// --- Fence ---
function drawFence(tc, horizontal = true) {
  drawGrass(tc, 0);
  if (horizontal) {
    tc.fillStyle = PAL.trunkLight;
    tc.fillRect(0, 5, TILE, 2);
    tc.fillRect(0, 10, TILE, 2);
    tc.fillStyle = PAL.trunk;
    tc.fillRect(0, 7, TILE, 1);
    // Posts
    tc.fillStyle = PAL.trunkLight;
    tc.fillRect(1, 3, 2, 10);
    tc.fillRect(13, 3, 2, 10);
    tc.fillStyle = PAL.trunkDark;
    tc.fillRect(3, 3, 1, 10);
    tc.fillRect(15, 3, 1, 10);
    // Post caps
    tc.fillStyle = PAL.trunk;
    tc.fillRect(1, 2, 3, 1);
    tc.fillRect(13, 2, 3, 1);
  }
}

// ============================================================
// MULTI-TILE OBJECTS (trees, buildings)
// ============================================================

function drawTreeTop(tc) {
  tc.clearRect(0, 0, TILE, TILE);

  // Light from top-left: highlight = top-left, dark = bottom-right
  const canopyPixels = [
    '     LLLL       ',
    '   LLLLLLll     ',
    '  LLLLMMMMll    ',
    ' LLLMMMMMMMll   ',
    ' LLMMMMMMMMDl   ',
    'LLMMMMMMMMDDll  ',
    'LLMMMMMMMDDDDl  ',
    'LMMMMMMMMDDDDl  ',
    ' lMMMMMMDDDDl   ',
    ' llMMMMMDDDl    ',
    '  llMMMDDDl     ',
    '   lllDDll      ',
    '    llll        ',
    '                ',
    '                ',
    '                ',
  ];

  const colorMap = {
    'L': PAL.canopy3,   // Light/highlight
    'M': PAL.canopy1,   // Mid
    'D': PAL.canopy2,   // Dark
    'l': PAL.canopyDark, // Outline/deep dark
  };

  for (let y = 0; y < TILE; y++) {
    const row = canopyPixels[y] || '';
    for (let x = 0; x < TILE; x++) {
      const ch = row[x];
      if (ch && ch !== ' ' && colorMap[ch]) {
        px(tc, x, y, colorMap[ch]);
      }
    }
  }

  // Extra highlight sparkles (top-left)
  px(tc, 5, 1, PAL.grassLight);
  px(tc, 4, 2, PAL.grassLight);
}

function drawTreeTrunk(tc) {
  tc.fillStyle = 'rgba(0,0,0,0)';
  tc.clearRect(0, 0, TILE, TILE);

  // Trunk
  tc.fillStyle = PAL.trunk;
  tc.fillRect(6, 0, 4, 12);
  tc.fillStyle = PAL.trunkDark;
  tc.fillRect(6, 0, 1, 12);
  tc.fillRect(9, 0, 1, 12);
  tc.fillStyle = PAL.trunkLight;
  tc.fillRect(7, 0, 1, 10);

  // Roots
  px(tc, 5, 10, PAL.trunk); px(tc, 5, 11, PAL.trunk);
  px(tc, 10, 10, PAL.trunk); px(tc, 10, 11, PAL.trunk);
  px(tc, 4, 11, PAL.trunkDark);
  px(tc, 11, 11, PAL.trunkDark);

  // Shadow on ground
  tc.fillStyle = PAL.shadow;
  tc.fillRect(3, 12, 10, 3);
  tc.fillRect(2, 13, 12, 2);
}

// --- Building tiles ---
function drawWallTile(tc) {
  tc.fillStyle = PAL.wall;
  tc.fillRect(0, 0, TILE, TILE);
  // Brick pattern
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    tc.fillStyle = PAL.wallDark;
    tc.fillRect(0, y + 3, TILE, 1);
    const offset = row % 2 === 0 ? 0 : 8;
    tc.fillRect(offset, y, 1, 4);
    tc.fillRect(offset + 8, y, 1, 4);
    // Highlight
    tc.fillStyle = PAL.wallLight;
    tc.fillRect(offset + 1, y, 1, 1);
    tc.fillRect(offset + 9, y, 1, 1);
  }
}

function drawRoofTile(tc) {
  tc.fillStyle = PAL.roof;
  tc.fillRect(0, 0, TILE, TILE);
  // Shingle lines
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    tc.fillStyle = PAL.roofDark;
    tc.fillRect(0, y + 3, TILE, 1);
    const offset = row % 2 === 0 ? 0 : 4;
    for (let x = offset; x < TILE; x += 8) {
      tc.fillRect(x, y, 1, 4);
    }
    tc.fillStyle = PAL.roofLight;
    tc.fillRect(0, y, TILE, 1);
  }
}

function drawDoorTile(tc) {
  tc.fillStyle = PAL.wall;
  tc.fillRect(0, 0, TILE, TILE);
  // Door
  tc.fillStyle = PAL.woodWall;
  tc.fillRect(3, 2, 10, 14);
  tc.fillStyle = PAL.woodDark;
  tc.fillRect(3, 2, 10, 1);
  tc.fillRect(3, 2, 1, 14);
  tc.fillRect(12, 2, 1, 14);
  tc.fillRect(8, 2, 1, 14);
  // Handle
  px(tc, 11, 9, PAL.flowerYellow);
  px(tc, 11, 10, PAL.flowerYellow);
}

function drawWindowTile(tc) {
  drawWallTile(tc);
  // Window
  tc.fillStyle = PAL.water1;
  tc.fillRect(4, 4, 8, 7);
  tc.fillStyle = PAL.waterHighlight;
  tc.fillRect(4, 4, 8, 1);
  tc.fillRect(4, 4, 1, 7);
  tc.fillStyle = PAL.waterDeep;
  tc.fillRect(4, 10, 8, 1);
  // Cross frame
  tc.fillStyle = PAL.wallDark;
  tc.fillRect(7, 4, 2, 7);
  tc.fillRect(4, 7, 8, 1);
  // Reflection
  px(tc, 5, 5, PAL.white);
  px(tc, 6, 5, PAL.white);
}

// ============================================================
// GENERATE TILE CACHE
// ============================================================
function generateTiles() {
  tileCache.grass = [0, 1, 2].map(v => createTileCanvas(tc => drawGrass(tc, v)));
  tileCache.tallGrass = [0, 1, 2].map(f => createTileCanvas(tc => drawTallGrass(tc, f)));
  tileCache.dirt = [0, 1].map(v => createTileCanvas(tc => drawDirt(tc, v)));
  tileCache.water = [0, 1, 2].map(f => createTileCanvas(tc => drawWater(tc, f)));
  tileCache.sand = [createTileCanvas(tc => drawSand(tc))];
  tileCache.stonePath = [createTileCanvas(tc => drawStonePath(tc))];
  tileCache.fence = [createTileCanvas(tc => drawFence(tc, true))];
  tileCache.flower = [
    createTileCanvas(tc => drawFlower(tc, PAL.flowerRed)),
    createTileCanvas(tc => drawFlower(tc, PAL.flowerYellow)),
    createTileCanvas(tc => drawFlower(tc, PAL.flowerPink)),
    createTileCanvas(tc => drawFlower(tc, PAL.flowerWhite)),
    createTileCanvas(tc => drawFlower(tc, PAL.flowerPurple)),
  ];
  tileCache.treeTop = [createTileCanvas(tc => drawTreeTop(tc))];
  tileCache.treeTrunk = [createTileCanvas(tc => drawTreeTrunk(tc))];
  tileCache.wall = [createTileCanvas(tc => drawWallTile(tc))];
  tileCache.roof = [createTileCanvas(tc => drawRoofTile(tc))];
  tileCache.door = [createTileCanvas(tc => drawDoorTile(tc))];
  tileCache.window = [createTileCanvas(tc => drawWindowTile(tc))];
}

// ============================================================
// CHARACTER SPRITE GENERATOR
// ============================================================
function createCharSprites(shirtColor, shirtDark, hairColor, hairDark, skinC, skinD) {
  // 16x24 character, 4 directions, 3 frames each (idle, walk1, walk2)
  const sprites = {};
  const directions = ['down', 'up', 'left', 'right'];

  const charW = 16, charH = 20;

  // Pixel art character templates per direction
  const templates = {
    down: [
      '                ',
      '                ',
      '     hhhh       ',
      '    hhHHhh      ',
      '    hHssHh      ',
      '    hsESEh      ',
      '     sMMs       ',
      '     ssss       ',
      '    SSSSSS      ',
      '    SSSSSS      ',
      '   SSDssDSS     ',
      '   SSSssSS      ',
      '    SSssSS      ',
      '     SSSS       ',
      '     ssSS       ',
      '    PP  PP      ',
      '    PP  PP      ',
      '    pp  pp      ',
      '   BB    BB     ',
      '   BB    BB     ',
    ],
    up: [
      '                ',
      '                ',
      '     hhhh       ',
      '    hhhhhh      ',
      '    hhhhhh      ',
      '    hhhhhh      ',
      '     hhhh       ',
      '     ssss       ',
      '    SSSSSS      ',
      '    SSSSSS      ',
      '   SSSssSSSS    ',
      '    SSssSS      ',
      '    SSssSS      ',
      '     SSSS       ',
      '     ssSS       ',
      '    PP  PP      ',
      '    PP  PP      ',
      '    pp  pp      ',
      '   BB    BB     ',
      '   BB    BB     ',
    ],
    left: [
      '                ',
      '                ',
      '    hhhh        ',
      '   hhHHhh       ',
      '   hHsshh       ',
      '   hEsshh       ',
      '    sMhh        ',
      '    ssss        ',
      '   SSSSSS       ',
      '   SSSSS        ',
      '  SSSssDSS      ',
      '   SSssSS       ',
      '   SSssSS       ',
      '    SSSS        ',
      '    ssSS        ',
      '   PP  PP       ',
      '   PP  PP       ',
      '   pp  pp       ',
      '  BB    BB      ',
      '  BB    BB      ',
    ],
    right: [
      '                ',
      '                ',
      '       hhhh     ',
      '      hhHHhh    ',
      '      hhssHh    ',
      '      hhssEh    ',
      '       hhMs     ',
      '       ssss     ',
      '      SSSSSS    ',
      '       SSSSS    ',
      '     SSDssSS    ',
      '      SSssSS    ',
      '      SSssSS    ',
      '       SSSS     ',
      '       SSss     ',
      '      PP  PP    ',
      '      PP  PP    ',
      '      pp  pp    ',
      '     BB    BB   ',
      '     BB    BB   ',
    ],
  };

  const colorMap = {
    'h': hairColor, 'H': hairDark,
    's': skinC, 'S': shirtColor, 'D': shirtDark,
    'E': '#181018', // eyes
    'M': '#c06060', // mouth
    'P': shirtColor, 'p': shirtDark,
    'B': '#383028', // boots
  };

  for (const dir of directions) {
    sprites[dir] = [];
    for (let frame = 0; frame < 3; frame++) {
      const c = document.createElement('canvas');
      c.width = charW; c.height = charH;
      const tc = c.getContext('2d');
      tc.imageSmoothingEnabled = false;

      const template = templates[dir];
      for (let y = 0; y < charH; y++) {
        const row = template[y] || '';
        for (let x = 0; x < charW; x++) {
          const ch = row[x];
          if (ch && ch !== ' ' && colorMap[ch]) {
            // Walk animation: shift legs for frames 1 and 2
            let drawY = y;
            if (y >= 15 && frame === 1) drawY = y + (y % 2 === 0 ? -1 : 1);
            if (y >= 15 && frame === 2) drawY = y + (y % 2 === 0 ? 1 : -1);
            if (drawY >= 0 && drawY < charH) {
              px(tc, x, drawY, colorMap[ch]);
            }
          }
        }
      }

      // Bob for walking frames
      if (frame === 1) {
        // Shift entire top body up 1px
        const imgData = tc.getImageData(0, 0, charW, 14);
        tc.clearRect(0, 0, charW, 14);
        tc.putImageData(imgData, 0, -1);
      }

      sprites[dir].push(c);
    }
  }
  return sprites;
}

// ============================================================
// NPC DEFINITIONS
// ============================================================
function createNPCs() {
  return [
    {
      sprites: createCharSprites('#c04040', '#902828', '#884020', '#602810', PAL.skin, PAL.skinDark),
      x: 18, y: 12, dir: 'down', frame: 0, timer: 0, moveTimer: 0,
      path: [{x:18,y:12},{x:18,y:14},{x:20,y:14},{x:20,y:12}], pathIdx: 0,
      speed: 0.5,
    },
    {
      sprites: createCharSprites('#40a040', '#287028', '#f0d080', '#c0a050', PAL.skin, PAL.skinDark),
      x: 30, y: 22, dir: 'right', frame: 0, timer: 0, moveTimer: 0,
      path: [{x:30,y:22},{x:34,y:22},{x:34,y:24},{x:30,y:24}], pathIdx: 0,
      speed: 0.4,
    },
    {
      sprites: createCharSprites('#8050a0', '#604080', '#202020', '#101010', PAL.skin, PAL.skinDark),
      x: 10, y: 28, dir: 'left', frame: 0, timer: 0, moveTimer: 0,
      path: [{x:10,y:28},{x:8,y:28},{x:8,y:30},{x:10,y:30}], pathIdx: 0,
      speed: 0.3,
    },
    {
      sprites: createCharSprites('#d0a040', '#a07828', '#683828', '#481810', PAL.skin, PAL.skinDark),
      x: 42, y: 10, dir: 'down', frame: 0, timer: 0, moveTimer: 0,
      path: [{x:42,y:10},{x:42,y:14}], pathIdx: 0,
      speed: 0.35,
    },
  ];
}

// ============================================================
// MAP GENERATION
// ============================================================
const MAP_W = 60;
const MAP_H = 50;
const LAYER_GROUND = 0;
const LAYER_OBJECT = 1;
const LAYER_ABOVE = 2; // Drawn above player (tree tops, roofs)

// Tile IDs
const T = {
  GRASS: 0, GRASS2: 1, GRASS3: 2,
  DIRT: 3, DIRT2: 4,
  WATER: 5,
  SAND: 6,
  STONE_PATH: 7,
  TALL_GRASS: 8,
  FLOWER_R: 9, FLOWER_Y: 10, FLOWER_P: 11, FLOWER_W: 12, FLOWER_PU: 13,
  FENCE: 14,
  TREE_TRUNK: 20,
  TREE_TOP: 21,
  WALL: 30, ROOF: 31, DOOR: 32, WINDOW: 33,
  EMPTY: -1,
};

const map = {
  ground: [],
  objects: [],
  above: [],
  collision: [],
};

function generateMap() {
  // Initialize
  for (let y = 0; y < MAP_H; y++) {
    map.ground[y] = [];
    map.objects[y] = [];
    map.above[y] = [];
    map.collision[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map.ground[y][x] = [T.GRASS, T.GRASS2, T.GRASS3][Math.floor(Math.random() * 3)];
      map.objects[y][x] = T.EMPTY;
      map.above[y][x] = T.EMPTY;
      map.collision[y][x] = false;
    }
  }

  // --- Dirt paths ---
  // Main horizontal path
  for (let x = 0; x < MAP_W; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      const y = 15 + dy;
      if (y >= 0 && y < MAP_H) map.ground[y][x] = dy === 0 ? T.STONE_PATH : T.DIRT;
    }
  }
  // Vertical path
  for (let y = 5; y < MAP_H - 5; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = 25 + dx;
      if (x >= 0 && x < MAP_W) map.ground[y][x] = dx === 0 ? T.STONE_PATH : T.DIRT;
    }
  }
  // Side path
  for (let x = 10; x < 20; x++) {
    map.ground[25][x] = T.DIRT;
    map.ground[26][x] = T.STONE_PATH;
    map.ground[27][x] = T.DIRT;
  }

  // --- Lake ---
  for (let y = 30; y < 38; y++) {
    for (let x = 35; x < 50; x++) {
      const dx = x - 42.5, dy = y - 34;
      const dist = Math.sqrt(dx * dx * 0.6 + dy * dy);
      if (dist < 4.5) {
        map.ground[y][x] = T.WATER;
        map.collision[y][x] = true;
      } else if (dist < 5.5) {
        map.ground[y][x] = T.SAND;
      }
    }
  }

  // --- Trees (scattered) ---
  const treePositions = [];
  for (let i = 0; i < 50; i++) {
    const x = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const y = 2 + Math.floor(Math.random() * (MAP_H - 4));

    // Don't place on paths, water, or too close to other trees
    if (map.ground[y][x] === T.WATER || map.ground[y][x] === T.STONE_PATH ||
        map.ground[y][x] === T.DIRT || map.ground[y][x] === T.SAND) continue;

    // Don't place near spawn or near buildings
    const distToSpawn = Math.sqrt((x - 25) ** 2 + (y - 15) ** 2);
    if (distToSpawn < 4) continue;

    let tooClose = false;
    for (const tp of treePositions) {
      if (Math.abs(tp.x - x) < 2 && Math.abs(tp.y - y) < 2) { tooClose = true; break; }
    }
    if (tooClose) continue;

    treePositions.push({ x, y });
    map.objects[y][x] = T.TREE_TRUNK;
    map.collision[y][x] = true;
    if (y > 0) {
      map.above[y - 1][x] = T.TREE_TOP;
    }
  }

  // --- Dense forest borders ---
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < 3; y++) {
      if (map.ground[y][x] !== T.WATER && map.objects[y][x] === T.EMPTY && x % 2 === 0) {
        map.objects[y + 1][x] = T.TREE_TRUNK;
        map.collision[y + 1][x] = true;
        map.above[y][x] = T.TREE_TOP;
      }
    }
    // Bottom border
    for (let y = MAP_H - 3; y < MAP_H - 1; y++) {
      if (map.objects[y][x] === T.EMPTY && x % 2 === 0) {
        map.objects[y][x] = T.TREE_TRUNK;
        map.collision[y][x] = true;
        if (y > 0) map.above[y - 1][x] = T.TREE_TOP;
      }
    }
  }

  // --- Buildings ---
  // House 1 — near main intersection
  placeBuilding(20, 8, 4, 3);
  // House 2
  placeBuilding(28, 20, 5, 3);
  // Small hut
  placeBuilding(8, 24, 3, 2);

  // --- Flowers ---
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * MAP_W);
    const y = Math.floor(Math.random() * MAP_H);
    if (map.ground[y][x] >= T.GRASS && map.ground[y][x] <= T.GRASS3 &&
        map.objects[y][x] === T.EMPTY) {
      map.objects[y][x] = T.FLOWER_R + Math.floor(Math.random() * 5);
    }
  }

  // --- Tall grass patches ---
  for (let i = 0; i < 30; i++) {
    const cx = 5 + Math.floor(Math.random() * (MAP_W - 10));
    const cy = 5 + Math.floor(Math.random() * (MAP_H - 10));
    const size = 2 + Math.floor(Math.random() * 3);
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
        if (Math.random() > 0.6) continue;
        if (map.ground[y][x] >= T.GRASS && map.ground[y][x] <= T.GRASS3 &&
            map.objects[y][x] === T.EMPTY) {
          map.objects[y][x] = T.TALL_GRASS;
        }
      }
    }
  }

  // --- Fences ---
  for (let x = 19; x <= 24; x++) {
    if (map.objects[7][x] === T.EMPTY) {
      map.objects[7][x] = T.FENCE;
      map.collision[7][x] = true;
    }
  }
}

function placeBuilding(bx, by, w, h) {
  // Roof
  for (let x = bx; x < bx + w; x++) {
    if (by - 1 >= 0) {
      map.above[by - 1][x] = T.ROOF;
    }
  }
  // Walls
  for (let y = by; y < by + h; y++) {
    for (let x = bx; x < bx + w; x++) {
      map.objects[y][x] = T.WALL;
      map.collision[y][x] = true;
    }
  }
  // Door
  const doorX = bx + Math.floor(w / 2);
  map.objects[by + h - 1][doorX] = T.DOOR;
  map.collision[by + h - 1][doorX] = false; // Can walk on door
  // Windows
  if (w >= 4) {
    map.objects[by + 1][bx + 1] = T.WINDOW;
    map.objects[by + 1][bx + w - 2] = T.WINDOW;
  }
}

// ============================================================
// PLAYER
// ============================================================
const player = {
  x: 25, y: 16, // Tile position
  px: 25 * TILE, py: 16 * TILE, // Pixel position (for smooth movement)
  dir: 'down',
  frame: 0,
  animTimer: 0,
  moving: false,
  moveProgress: 0,
  targetX: 25, targetY: 16,
  sprites: null,
  speed: 1.8, // Tiles per second
};

// ============================================================
// CAMERA
// ============================================================
const camera = { x: 0, y: 0 };

function updateCamera() {
  camera.x = Math.round(player.px - NATIVE_W / 2 + TILE / 2);
  camera.y = Math.round(player.py - NATIVE_H / 2 + TILE / 2);
  // Clamp to map bounds
  camera.x = Math.max(0, Math.min(MAP_W * TILE - NATIVE_W, camera.x));
  camera.y = Math.max(0, Math.min(MAP_H * TILE - NATIVE_H, camera.y));
}

// ============================================================
// RENDERING
// ============================================================
function getTileCanvas(id, animFrame) {
  switch (id) {
    case T.GRASS: return tileCache.grass[0];
    case T.GRASS2: return tileCache.grass[1];
    case T.GRASS3: return tileCache.grass[2];
    case T.DIRT: return tileCache.dirt[0];
    case T.DIRT2: return tileCache.dirt[1];
    case T.WATER: return tileCache.water[animFrame % 3];
    case T.SAND: return tileCache.sand[0];
    case T.STONE_PATH: return tileCache.stonePath[0];
    case T.TALL_GRASS: return tileCache.tallGrass[animFrame % 3];
    case T.FLOWER_R: return tileCache.flower[0];
    case T.FLOWER_Y: return tileCache.flower[1];
    case T.FLOWER_P: return tileCache.flower[2];
    case T.FLOWER_W: return tileCache.flower[3];
    case T.FLOWER_PU: return tileCache.flower[4];
    case T.FENCE: return tileCache.fence[0];
    case T.TREE_TRUNK: return tileCache.treeTrunk[0];
    case T.TREE_TOP: return tileCache.treeTop[0];
    case T.WALL: return tileCache.wall[0];
    case T.ROOF: return tileCache.roof[0];
    case T.DOOR: return tileCache.door[0];
    case T.WINDOW: return tileCache.window[0];
    default: return null;
  }
}

function render(time) {
  const animFrame = Math.floor(time / 300) % 3;

  bctx.clearRect(0, 0, NATIVE_W, NATIVE_H);

  const startTX = Math.floor(camera.x / TILE);
  const startTY = Math.floor(camera.y / TILE);
  const endTX = Math.min(MAP_W - 1, startTX + Math.ceil(NATIVE_W / TILE) + 1);
  const endTY = Math.min(MAP_H - 1, startTY + Math.ceil(NATIVE_H / TILE) + 1);

  // Ground layer
  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      if (ty < 0 || tx < 0) continue;
      const tile = getTileCanvas(map.ground[ty][tx], animFrame);
      if (tile) {
        bctx.drawImage(tile, tx * TILE - camera.x, ty * TILE - camera.y);
      }
    }
  }

  // Object layer — collect things that need y-sorting with player
  const drawList = [];

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      if (ty < 0 || tx < 0) continue;
      const objId = map.objects[ty][tx];
      if (objId !== T.EMPTY) {
        drawList.push({
          id: objId,
          x: tx * TILE - camera.x,
          y: ty * TILE - camera.y,
          sortY: ty * TILE + TILE,
          animFrame,
        });
      }
    }
  }

  // Player
  drawList.push({
    isPlayer: true,
    x: Math.round(player.px - camera.x),
    y: Math.round(player.py - camera.y) - 4, // Offset for taller sprite
    sortY: player.py + TILE,
  });

  // NPCs
  for (const npc of npcs) {
    drawList.push({
      isNPC: true,
      npc,
      x: Math.round(npc.x * TILE - camera.x),
      y: Math.round(npc.y * TILE - camera.y) - 4,
      sortY: npc.y * TILE + TILE,
    });
  }

  // Sort by Y for depth
  drawList.sort((a, b) => a.sortY - b.sortY);

  // Draw sorted objects
  for (const item of drawList) {
    if (item.isPlayer) {
      const pFrame = player.moving ? (player.frame % 3) : 0;
      const sprite = player.sprites[player.dir][pFrame];
      // Shadow
      bctx.fillStyle = PAL.shadow;
      bctx.beginPath();
      bctx.ellipse(item.x + 8, item.y + 20, 5, 2, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.drawImage(sprite, item.x, item.y);
    } else if (item.isNPC) {
      const npc = item.npc;
      const pFrame = npc.frame % 3;
      const sprite = npc.sprites[npc.dir][pFrame];
      // Shadow
      bctx.fillStyle = PAL.shadow;
      bctx.beginPath();
      bctx.ellipse(item.x + 8, item.y + 20, 5, 2, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.drawImage(sprite, item.x, item.y);
    } else {
      const tile = getTileCanvas(item.id, item.animFrame);
      if (tile) bctx.drawImage(tile, item.x, item.y);
    }
  }

  // Above layer (tree tops, roofs) — always on top
  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      if (ty < 0 || tx < 0) continue;
      const aboveId = map.above[ty][tx];
      if (aboveId !== T.EMPTY) {
        const tile = getTileCanvas(aboveId, animFrame);
        if (tile) {
          // Semi-transparent if player is behind
          const playerBehind = (
            player.py / TILE >= ty && player.py / TILE < ty + 2 &&
            Math.abs(player.px / TILE - tx) < 1.5
          );
          if (playerBehind) bctx.globalAlpha = 0.5;
          bctx.drawImage(tile, tx * TILE - camera.x, ty * TILE - camera.y);
          if (playerBehind) bctx.globalAlpha = 1.0;
        }
      }
    }
  }

  // --- Particles ---
  renderParticles(time);

  // --- Day/night overlay ---
  renderDayNight(time);

  // Scale up to display canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
}

// ============================================================
// PARTICLES
// ============================================================
const particles = [];

function spawnParticles(time) {
  // Fireflies (at night)
  const dayPhase = (Math.sin(time * 0.0002) + 1) / 2;
  if (dayPhase < 0.4 && particles.length < 30) {
    if (Math.random() < 0.03) {
      particles.push({
        type: 'firefly',
        x: camera.x + Math.random() * NATIVE_W,
        y: camera.y + Math.random() * NATIVE_H * 0.7,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2,
        life: 200 + Math.random() * 300,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Falling leaves
  if (particles.length < 40) {
    if (Math.random() < 0.02) {
      particles.push({
        type: 'leaf',
        x: camera.x + Math.random() * NATIVE_W,
        y: camera.y - 5,
        vx: 0.2 + Math.random() * 0.3,
        vy: 0.3 + Math.random() * 0.3,
        life: 300,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    if (p.type === 'firefly') {
      p.x += p.vx + Math.sin(p.phase + p.life * 0.05) * 0.2;
      p.y += p.vy + Math.cos(p.phase + p.life * 0.03) * 0.1;
    } else if (p.type === 'leaf') {
      p.wobble += 0.05;
      p.x += p.vx + Math.sin(p.wobble) * 0.3;
      p.y += p.vy;
    }
  }
}

function renderParticles(time) {
  for (const p of particles) {
    const sx = p.x - camera.x;
    const sy = p.y - camera.y;
    if (sx < -5 || sx > NATIVE_W + 5 || sy < -5 || sy > NATIVE_H + 5) continue;

    if (p.type === 'firefly') {
      const brightness = (Math.sin(p.phase + p.life * 0.1) + 1) / 2;
      if (brightness > 0.3) {
        bctx.fillStyle = `rgba(180, 255, 100, ${brightness * 0.8})`;
        bctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        if (brightness > 0.7) {
          bctx.fillStyle = `rgba(180, 255, 100, ${brightness * 0.3})`;
          bctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1);
          bctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3);
        }
      }
    } else if (p.type === 'leaf') {
      const colors = ['#8a6030', '#a07840', '#6a4a20'];
      bctx.fillStyle = colors[Math.floor(p.wobble * 2) % 3];
      bctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
      bctx.fillRect(Math.round(sx) + 1, Math.round(sy) + 1, 1, 1);
    }
  }
}

// ============================================================
// DAY/NIGHT CYCLE
// ============================================================
function renderDayNight(time) {
  const cycle = (Math.sin(time * 0.0002) + 1) / 2; // 0=night, 1=day

  if (cycle < 0.3) {
    // Night — blue overlay
    const nightAlpha = (0.3 - cycle) / 0.3 * 0.45;
    bctx.fillStyle = `rgba(10, 15, 40, ${nightAlpha})`;
    bctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
  } else if (cycle > 0.7) {
    // Golden hour — warm overlay
    const warmAlpha = (cycle - 0.7) / 0.3 * 0.1;
    bctx.fillStyle = `rgba(255, 180, 80, ${warmAlpha})`;
    bctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
  }
}

// ============================================================
// AUDIO (procedural retro sounds)
// ============================================================
let audioCtx = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Ambient background — soft filtered noise
  const bufSize = audioCtx.sampleRate * 3;
  const noiseBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.01;

  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuf;
  noiseSource.loop = true;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 300;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.5;
  noiseSource.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
  noiseSource.start();

  // Gentle pentatonic melody — square wave, very quiet
  const notes = [262, 330, 392, 524, 392, 330, 294, 262, 330, 392, 294, 262];
  let noteIdx = 0;

  function playNote() {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = notes[noteIdx % notes.length] * 0.5;
    const g = audioCtx.createGain();
    g.gain.value = 0.025;
    g.gain.setTargetAtTime(0, audioCtx.currentTime + 0.25, 0.08);
    osc.connect(g).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
    noteIdx++;
    setTimeout(playNote, 900 + Math.random() * 500);
  }
  setTimeout(playNote, 2000);

  // Bird chirps — two-note ascending
  function chirp() {
    const baseFreq = 2000 + Math.random() * 2000;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioCtx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, audioCtx.currentTime + 0.1);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.02, audioCtx.currentTime);
    g.gain.setTargetAtTime(0, audioCtx.currentTime + 0.08, 0.02);
    osc.connect(g).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
    setTimeout(chirp, 3000 + Math.random() * 8000);
  }
  setTimeout(chirp, 3000);
}

// Footstep sounds per terrain
function playFootstep(tileId) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (tileId === T.WATER) return; // No walking on water

  // Noise burst with terrain-specific filter
  const bufSize = audioCtx.sampleRate * 0.05;
  const nBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = nBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

  const src = audioCtx.createBufferSource();
  src.buffer = nBuf;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  const g = audioCtx.createGain();

  if (tileId === T.STONE_PATH) {
    filter.frequency.value = 4000; filter.Q.value = 2;
    g.gain.value = 0.04;
  } else if (tileId === T.DIRT || tileId === T.DIRT2 || tileId === T.SAND) {
    filter.frequency.value = 2000; filter.Q.value = 1;
    g.gain.value = 0.03;
  } else {
    // Grass
    filter.frequency.value = 3000; filter.Q.value = 1.5;
    g.gain.value = 0.025;
  }

  g.gain.setTargetAtTime(0, now + 0.03, 0.01);
  src.connect(filter).connect(g).connect(audioCtx.destination);
  src.start(now);
  src.stop(now + 0.06);
}

// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  initAudio();
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key] = false; e.preventDefault(); });

// ============================================================
// GAME LOOP
// ============================================================
let npcs = [];
let lastTime = 0;

function init() {
  generateTiles();
  generateMap();
  player.sprites = createCharSprites(
    PAL.shirt, PAL.shirtDark, PAL.hair, PAL.hairDark, PAL.skin, PAL.skinDark
  );
  npcs = createNPCs();

  // Hide loading
  setTimeout(() => {
    document.getElementById('loading').classList.add('fade');
    setTimeout(() => document.getElementById('loading').style.display = 'none', 1500);
  }, 300);

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

function updatePlayer(dt) {
  if (!player.moving) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w']) { dy = -1; player.dir = 'up'; }
    else if (keys['ArrowDown'] || keys['s']) { dy = 1; player.dir = 'down'; }
    else if (keys['ArrowLeft'] || keys['a']) { dx = -1; player.dir = 'left'; }
    else if (keys['ArrowRight'] || keys['d']) { dx = 1; player.dir = 'right'; }

    if (dx !== 0 || dy !== 0) {
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && !map.collision[ny][nx]) {
        player.targetX = nx;
        player.targetY = ny;
        player.moving = true;
        player.moveProgress = 0;
      }
    }
  }

  if (player.moving) {
    player.moveProgress += dt * player.speed;
    player.animTimer += dt;
    if (player.animTimer > 0.15) {
      player.animTimer = 0;
      player.frame = (player.frame + 1) % 3;
    }

    const t = Math.min(player.moveProgress, 1);
    player.px = (player.x + (player.targetX - player.x) * t) * TILE;
    player.py = (player.y + (player.targetY - player.y) * t) * TILE;

    if (player.moveProgress >= 1) {
      player.x = player.targetX;
      player.y = player.targetY;
      player.px = player.x * TILE;
      player.py = player.y * TILE;
      player.moving = false;
      // Terrain footstep sound
      playFootstep(map.ground[player.y][player.x]);
    }
  }
}

function updateNPCs(dt) {
  for (const npc of npcs) {
    npc.moveTimer += dt;

    if (npc.moveTimer >= 1 / npc.speed) {
      npc.moveTimer = 0;
      const target = npc.path[npc.pathIdx];
      const dx = Math.sign(target.x - npc.x);
      const dy = Math.sign(target.y - npc.y);

      if (dx !== 0) {
        npc.dir = dx > 0 ? 'right' : 'left';
        npc.x += dx;
      } else if (dy !== 0) {
        npc.dir = dy > 0 ? 'down' : 'up';
        npc.y += dy;
      }

      if (npc.x === target.x && npc.y === target.y) {
        npc.pathIdx = (npc.pathIdx + 1) % npc.path.length;
      }

      npc.frame = (npc.frame + 1) % 3;
    }
  }
}

// ============================================================
// START
// ============================================================
init();
