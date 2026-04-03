// ============================================================
// PIXEL WORLD — Phaser 3 + Kenney Tiny Town/Dungeon assets
// ============================================================

// Map dimensions
const MAP_W = 40;
const MAP_H = 30;
const TILE_SIZE = 16;

// Tileset: 12 columns, no spacing, no margin in packed tilemap
const TILESET_COLS = 12;

// ============================================================
// MAP DATA — hand-crafted village with paths, lake, buildings, trees
// Each number = tile index in tilemap_packed.png (0-based)
// -1 = empty/transparent
// ============================================================

// Ground layer — fills every tile
const groundData = generateGroundLayer();
// Object layer — trees, buildings, decorations (on top of ground)
const objectData = generateObjectLayer();
// Above layer — roof tiles, tree canopies that render ABOVE the player
const aboveData = generateAboveLayer();
// Collision data — which tiles block movement
const collisionTiles = [
  // Trees
  3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17,
  // Big tree parts
  18, 19, 20, 21, 30, 31, 32, 33,
  // Walls, buildings
  51, 52, 53, 54, 55, 56, 57, 58, 59,
  63, 64, 65, 66, 67,
  72, 73, 74, 75, 76, 77, 78, 79,
  84, 85, 86, 87,
  96, 97, 98, 99, 100, 101,
  // Fences
  34, 35,
  // Objects
  29, 43, 93, 94, 95,
  // Water
  120, 121, 122,
];

function generateGroundLayer() {
  const data = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      // Default: grass (tile 2)
      let tile = 2;

      // Horizontal dirt path (y = 14-16)
      if (y >= 13 && y <= 15) {
        if (y === 13) tile = x === 0 ? 12 : (x === MAP_W - 1 ? 14 : 13); // dirt top edge
        else if (y === 15) tile = x === 0 ? 36 : (x === MAP_W - 1 ? 38 : 37); // dirt bottom
        else tile = x === 0 ? 24 : (x === MAP_W - 1 ? 26 : 25); // dirt center
      }

      // Vertical stone path (x = 19-21)
      if (x >= 19 && x <= 21) {
        if (y < 13 || y > 15) { // Don't overwrite dirt intersection
          if (x === 19) tile = 48; // stone left
          else if (x === 21) tile = 50; // stone right
          else tile = 49; // stone center
        } else {
          tile = 49; // stone at intersection
        }
      }

      // Lake area (bottom right)
      const lx = x - 32, ly = y - 23;
      const ldist = Math.sqrt(lx * lx * 0.7 + ly * ly);
      if (ldist < 3.5) {
        tile = 121; // water
      } else if (ldist < 4.5 && tile === 2) {
        tile = 39; // sandy shore (plain dirt)
      }

      // Small garden path near houses
      if (y >= 9 && y <= 11 && x >= 13 && x <= 17) {
        tile = 25; // dirt
      }

      row.push(tile);
    }
    data.push(row);
  }
  return data;
}

function generateObjectLayer() {
  const data = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      row.push(-1); // empty by default
    }
    data.push(row);
  }

  function set(x, y, tile) {
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) data[y][x] = tile;
  }

  // === FOREST BORDERS ===
  // Top tree line
  for (let x = 0; x < MAP_W; x++) {
    if (x >= 18 && x <= 22) continue; // Leave path
    const trees = [4, 5, 8, 6, 7, 16, 17];
    set(x, 0, trees[x % trees.length]);
    if (x % 3 !== 0) set(x, 1, trees[(x + 2) % trees.length]);
  }

  // Bottom tree line
  for (let x = 0; x < MAP_W; x++) {
    const trees = [4, 5, 8, 9, 10, 11];
    set(x, MAP_H - 1, trees[x % trees.length]);
    if (x % 2 === 0) set(x, MAP_H - 2, trees[(x + 3) % trees.length]);
  }

  // Left tree line
  for (let y = 2; y < MAP_H - 2; y++) {
    if (y >= 12 && y <= 16) continue; // Leave path
    set(0, y, [4, 5, 8][y % 3]);
    if (y % 3 !== 0) set(1, y, [5, 8, 4][y % 3]);
  }

  // Right tree line
  for (let y = 2; y < MAP_H - 2; y++) {
    set(MAP_W - 1, y, [9, 10, 11][y % 3]);
    if (y % 2 === 0) set(MAP_W - 2, y, [10, 11, 9][y % 3]);
  }

  // === SCATTERED VILLAGE TREES ===
  const villageTrees = [
    [5, 5, 5], [7, 4, 8], [10, 3, 4], [12, 6, 5],
    [26, 4, 8], [28, 6, 5], [30, 3, 4], [33, 5, 8],
    [35, 8, 4], [37, 10, 5],
    [5, 18, 9], [7, 20, 10], [4, 22, 11], [6, 25, 9],
    [12, 20, 5], [14, 23, 8], [16, 25, 4],
    [25, 18, 5], [27, 20, 8], [35, 18, 9], [37, 20, 10],
    [10, 27, 4], [15, 27, 5], [25, 26, 11], [30, 27, 9],
    [8, 8, 5], [33, 11, 8],
    // Autumn grove near lake
    [29, 19, 9], [31, 20, 10], [28, 21, 11], [34, 21, 9],
    [36, 22, 10], [30, 25, 11],
  ];
  for (const [tx, ty, tile] of villageTrees) {
    set(tx, ty, tile);
  }

  // === HOUSES ===
  // House 1 — red roof (row 4: tiles 52-54 = roof, tiles 64-66 = walls)
  set(14, 7, 64); set(15, 7, 65); set(16, 7, 66); // walls with windows & door
  // House 2 — another house
  set(24, 10, 64); set(25, 10, 65); set(26, 10, 66);
  // House 3 — wood walls
  set(8, 17, 72); set(9, 17, 73); set(10, 17, 74);

  // === DECORATIONS ===
  // Flowers
  const flowers = [
    [6, 10, 27], [7, 10, 28], [8, 11, 27], [9, 11, 29],
    [16, 12, 27], [17, 12, 28],
    [23, 8, 27], [24, 8, 29],
    [32, 14, 27], [33, 14, 28], [34, 15, 27],
    [13, 22, 29], [14, 22, 27],
    [5, 15, 28], [6, 16, 27],
    [26, 25, 27], [27, 25, 29],
  ];
  for (const [fx, fy, ft] of flowers) set(fx, fy, ft);

  // Bushes & hedges
  set(13, 9, 43); set(17, 9, 43); // Hedges near house 1
  set(13, 11, 43); set(17, 11, 43);

  // Fences
  for (let x = 6; x <= 10; x++) set(x, 9, 35);
  set(6, 10, 34); set(10, 10, 34);

  // Objects
  set(13, 14, 93); // Barrel
  set(22, 14, 93); // Barrel
  set(23, 14, 94); // Gold/coin

  // Sparkles near special locations
  set(22, 9, 22); set(25, 7, 23);
  set(15, 21, 22); set(33, 16, 23);

  return data;
}

function generateAboveLayer() {
  const data = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push(-1);
    data.push(row);
  }

  function set(x, y, tile) {
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) data[y][x] = tile;
  }

  // Roofs above houses (rendered on top of player)
  // House 1 red roof
  set(14, 6, 52); set(15, 6, 53); set(16, 6, 54);
  // House 2 red roof
  set(24, 9, 52); set(25, 9, 53); set(26, 9, 54);
  // House 3 blue roof
  set(8, 16, 76); set(9, 16, 77); set(10, 16, 78);

  return data;
}

// ============================================================
// PHASER GAME SCENE
// ============================================================
class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  preload() {
    // Load tilesets (packed, no spacing, no margin)
    this.load.spritesheet('town', 'kenney-town/Tilemap/tilemap_packed.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
      spacing: 0,
      margin: 0,
    });
    this.load.spritesheet('dungeon', 'kenney-dungeon/Tilemap/tilemap_packed.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
      spacing: 0,
      margin: 0,
    });
  }

  create() {
    // === TILEMAP ===
    const map = this.make.tilemap({
      data: groundData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const townTileset = map.addTilesetImage('town', 'town', TILE_SIZE, TILE_SIZE, 0, 0);
    const groundLayer = map.createLayer(0, townTileset, 0, 0);

    // Object layer
    const objMap = this.make.tilemap({
      data: objectData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const objTileset = objMap.addTilesetImage('town', 'town', TILE_SIZE, TILE_SIZE, 0, 0);
    const objLayer = objMap.createLayer(0, objTileset, 0, 0);

    // Above layer
    const abvMap = this.make.tilemap({
      data: aboveData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const abvTileset = abvMap.addTilesetImage('town', 'town', TILE_SIZE, TILE_SIZE, 0, 0);
    this.aboveLayer = abvMap.createLayer(0, abvTileset, 0, 0);
    this.aboveLayer.setDepth(10); // Above everything

    // === PLAYER ===
    // Use knight sprite from dungeon pack (tile index 85 = knight front)
    this.player = this.physics.add.sprite(20 * TILE_SIZE + 8, 14 * TILE_SIZE + 8, 'dungeon', 85);
    this.player.setSize(12, 12);
    this.player.setOffset(2, 4);
    this.player.setDepth(5);

    // No animation — single stable frame (knight = frame 85)

    // === COLLISION ===
    objLayer.setCollisionByExclusion([-1]);
    this.physics.add.collider(this.player, objLayer);

    // === NPCs ===
    this.npcs = [];
    const npcDefs = [
      { frame: 86, x: 16, y: 12, pathX: [16, 18], pathY: [12, 12] },
      { frame: 88, x: 24, y: 17, pathX: [24, 26], pathY: [17, 19] },
      { frame: 98, x: 10, y: 22, pathX: [10, 12], pathY: [22, 24] },
      { frame: 84, x: 6, y: 14, pathX: [6, 6], pathY: [14, 14] }, // Stationary wizard
      { frame: 100, x: 32, y: 12, pathX: [32, 35], pathY: [12, 12] },
    ];

    for (const def of npcDefs) {
      const npc = this.physics.add.sprite(
        def.x * TILE_SIZE + 8, def.y * TILE_SIZE + 8, 'dungeon', def.frame
      );
      npc.setDepth(5);
      npc.setImmovable(true);
      npc.body.setSize(12, 12);
      npc.npcDef = def;
      npc.pathIdx = 0;
      npc.moveTimer = 0;
      npc.targetX = def.x * TILE_SIZE + 8;
      npc.targetY = def.y * TILE_SIZE + 8;
      this.physics.add.collider(this.player, npc);
      this.npcs.push(npc);
    }

    // === CAMERA ===
    this.cameras.main.setBounds(0, 0, MAP_W * TILE_SIZE, MAP_H * TILE_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(1);

    // === INPUT ===
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // === AMBIENT PARTICLES ===
    // Falling leaves
    this.leafEmitter = this.add.particles(0, 0, 'town', {
      frame: [27, 28, 29], // flowers/bushes used as small leaf particles
      x: { min: 0, max: MAP_W * TILE_SIZE },
      y: -10,
      lifespan: 8000,
      speedX: { min: 5, max: 20 },
      speedY: { min: 10, max: 25 },
      scale: { start: 0.4, end: 0.2 },
      alpha: { start: 0.7, end: 0 },
      quantity: 1,
      frequency: 2000,
    });
    this.leafEmitter.setDepth(8);

    // Sparkle particles near special areas
    this.sparkleEmitter = this.add.particles(20 * TILE_SIZE, 14 * TILE_SIZE, 'town', {
      frame: [22, 23],
      lifespan: 1500,
      speedX: { min: -10, max: 10 },
      speedY: { min: -15, max: -5 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      quantity: 1,
      frequency: 3000,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-100, -50, 200, 100),
      },
    });
    this.sparkleEmitter.setDepth(9);

    // === AUDIO (procedural) ===
    this.initAudio();

    // === DAY/NIGHT OVERLAY ===
    this.dayOverlay = this.add.rectangle(
      MAP_W * TILE_SIZE / 2, MAP_H * TILE_SIZE / 2,
      MAP_W * TILE_SIZE, MAP_H * TILE_SIZE,
      0x101830, 0
    );
    this.dayOverlay.setDepth(20);
    this.dayOverlay.setScrollFactor(0);
    this.dayOverlay.setPosition(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2
    );

    // Player speed
    this.playerSpeed = 80;
  }

  update(time, delta) {
    // === PLAYER MOVEMENT ===
    const speed = this.playerSpeed;
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -speed; this.player.setFlipX(true); }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = speed; this.player.setFlipX(false); }

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    this.player.setVelocity(vx, vy);

    // No walk animation — just flip for direction

    // === NPC MOVEMENT ===
    for (const npc of this.npcs) {
      const def = npc.npcDef;
      if (def.pathX[0] === def.pathX[1] && def.pathY[0] === def.pathY[1]) continue; // Stationary

      const dx = npc.targetX - npc.x;
      const dy = npc.targetY - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        npc.pathIdx = (npc.pathIdx + 1) % def.pathX.length;
        npc.targetX = def.pathX[npc.pathIdx] * TILE_SIZE + 8;
        npc.targetY = def.pathY[npc.pathIdx] * TILE_SIZE + 8;
        npc.setVelocity(0, 0);

        // Pause before moving again
        npc.moveTimer = time + 1500 + Math.random() * 2000;
      } else if (time > npc.moveTimer) {
        const npcSpeed = 25;
        npc.setVelocity(
          (dx / dist) * npcSpeed,
          (dy / dist) * npcSpeed
        );
        // Flip sprite based on direction
        if (Math.abs(dx) > Math.abs(dy)) {
          npc.setFlipX(dx < 0);
        }
      }
    }

    // === DAY/NIGHT ===
    const cycle = (Math.sin(time * 0.0003) + 1) / 2; // 0=night, 1=day
    if (cycle < 0.3) {
      this.dayOverlay.setAlpha((0.3 - cycle) / 0.3 * 0.4);
    } else if (cycle > 0.85) {
      this.dayOverlay.setFillStyle(0xff8844, (cycle - 0.85) / 0.15 * 0.08);
    } else {
      this.dayOverlay.setAlpha(0);
    }
  }

  initAudio() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();

      // Ambient wind
      const bufSize = ac.sampleRate * 3;
      const nBuf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const d = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.006;
      const src = ac.createBufferSource(); src.buffer = nBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
      const g = ac.createGain(); g.gain.value = 0.5;
      src.connect(f).connect(g).connect(ac.destination); src.start();

      // Gentle melody
      const notes = [392, 440, 524, 660, 524, 440, 392, 330];
      let ni = 0;
      const playNote = () => {
        const o = ac.createOscillator(); o.type = 'square';
        o.frequency.value = notes[ni++ % notes.length] * 0.5;
        const ng = ac.createGain(); ng.gain.value = 0.015;
        ng.gain.setTargetAtTime(0, ac.currentTime + 0.2, 0.06);
        o.connect(ng).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.3);
        setTimeout(playNote, 800 + Math.random() * 500);
      };
      setTimeout(playNote, 2000);

      // Bird chirps
      const chirp = () => {
        const freq = 2500 + Math.random() * 2000;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(freq, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(freq * 1.3, ac.currentTime + 0.04);
        const cg = ac.createGain(); cg.gain.value = 0.012;
        cg.gain.setTargetAtTime(0, ac.currentTime + 0.05, 0.015);
        o.connect(cg).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.1);
        setTimeout(chirp, 4000 + Math.random() * 8000);
      };
      setTimeout(chirp, 3000);

      // Resume on interaction
      this.input.on('pointerdown', () => ac.resume());
      this.input.keyboard.on('keydown', () => ac.resume());
    } catch (e) { /* audio not available */ }
  }
}

// ============================================================
// PHASER CONFIG
// ============================================================
const config = {
  type: Phaser.AUTO,
  width: 320,
  height: 240,
  parent: document.body,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: WorldScene,
};

const game = new Phaser.Game(config);
