// ============================================================
// PIXEL WORLD — Phaser 3 + blob auto-tiled terrain + polish
// ============================================================

class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  preload() {
    this.load.spritesheet('overworld', 'autotiles/overworld_autotiles.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('ninja', 'characters/ninja_blue.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.image('shadow', 'characters/shadow.png');
    // Foliage collection objects (CC-BY 3.0, individual complete sprites)
    const objs = ['tree_a','tree_b','tree_c','tree_d','bush_a','bush_b','dead_tree'];
    for (const name of objs) this.load.image(name, 'objects/' + name + '.png');
    this.load.spritesheet('leaf', 'particles/leaf.png', {
      frameWidth: 9, frameHeight: 7, spacing: 0, margin: 0,
    });
  }

  create() {
    const T = 16;
    const map = generateMap(80, 60, 777);
    this.mapData = map;

    // --- Generate canvas textures for particles ---
    this.createParticleTextures();

    // --- 4 terrain layers: water → grass → sand → dirt ---
    const layerData = [map.layers.waterLayer, map.layers.grassLayer, map.layers.sandLayer, map.layers.dirtLayer];
    for (let i = 0; i < layerData.length; i++) {
      const tm = this.make.tilemap({ data: layerData[i], tileWidth: T, tileHeight: T });
      const ts = tm.addTilesetImage('overworld', 'overworld', T, T, 0, 0);
      const layer = tm.createLayer(0, ts, 0, 0);
      if (layer) layer.setDepth(i);
    }

    // --- Water collision ---
    this.waterBodies = this.physics.add.staticGroup();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.terrain[y][x] === 3) {
          const block = this.add.rectangle(x * T + 8, y * T + 8, T, T);
          block.setVisible(false);
          this.physics.add.existing(block, true);
          this.waterBodies.add(block);
        }
      }
    }

    // --- Place decorations (individual complete sprites, pre-scaled) ---
    const TREE_KEYS = ['tree_a', 'tree_b', 'tree_c', 'tree_d'];
    const BUSH_KEYS = ['bush_a', 'bush_b'];

    for (const obj of map.objects) {
      const px = obj.x * T + 8;
      const py = obj.y * T + 8;
      if (obj.type === 'tree') {
        const key = TREE_KEYS[obj.variant % TREE_KEYS.length];
        const tree = this.add.image(px, py, key);
        tree.setOrigin(0.5, 0.85);
        tree.setDepth(py);
        // Collision at trunk base
        const block = this.add.rectangle(px, py, 12, 8);
        block.setVisible(false);
        this.physics.add.existing(block, true);
        this.waterBodies.add(block);
      } else if (obj.type === 'rock') {
        // Use dead_tree as rare variant, bush otherwise
        const key = obj.variant === 0 ? 'dead_tree' : BUSH_KEYS[obj.variant % BUSH_KEYS.length];
        const item = this.add.image(px, py, key);
        item.setOrigin(0.5, 0.7);
        item.setDepth(py);
      } else if (obj.type === 'flower') {
        const key = BUSH_KEYS[obj.variant % BUSH_KEYS.length];
        const bush = this.add.image(px, py, key);
        bush.setOrigin(0.5, 0.7);
        bush.setDepth(3);
      }
    }

    // --- Player shadow ---
    this.shadow = this.add.image(
      map.spawnX * T + 8, map.spawnY * T + 10, 'shadow'
    );
    this.shadow.setDepth(4);
    this.shadow.setAlpha(0.4);

    // --- Player ---
    this.player = this.physics.add.sprite(
      map.spawnX * T + 8, map.spawnY * T + 8, 'ninja', 0
    );
    this.player.setDepth(5);
    this.player.setSize(10, 10);
    this.player.setOffset(3, 6);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.waterBodies);

    // --- Player animations ---
    this.createPlayerAnims();
    this.playerDir = 'down';
    this.wasMoving = false;

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width * T, map.height * T);
    cam.startFollow(this.player, true, 0.1, 0.1);
    cam.setRoundPixels(true);

    // --- Camera post-FX ---
    cam.postFX.addVignette(0.5, 0.5, 0.9, 0.2);
    this.colorMatrix = cam.postFX.addColorMatrix();

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // --- Physics bounds ---
    this.physics.world.setBounds(0, 0, map.width * T, map.height * T);

    // --- Ambient particles: floating leaves ---
    this.leafEmitter = this.add.particles(0, 0, 'leaf', {
      frame: [0, 1, 2, 3, 4, 5, 6, 7],
      lifespan: 8000,
      speedX: { min: 3, max: 12 },
      speedY: { min: -3, max: 3 },
      scale: { start: 0.6, end: 0.2 },
      alpha: { start: 0.5, end: 0 },
      frequency: 800,
      quantity: 1,
      rotate: { min: 0, max: 360 },
      gravityY: 2,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-40, -30, 400, 300),
      },
    });
    this.leafEmitter.setScrollFactor(0);
    this.leafEmitter.setDepth(15);

    // --- Walking dust particles ---
    this.dustEmitter = this.add.particles(0, 0, 'dustPixel', {
      lifespan: 350,
      speed: { min: 4, max: 12 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.35, end: 0 },
      gravityY: -3,
      frequency: -1,
      quantity: 3,
    });
    this.dustEmitter.setDepth(4);
    this.dustTimer = 0;

    // --- Firefly particles (visible at night) ---
    this.fireflyEmitter = this.add.particles(0, 0, 'fireflyPixel', {
      lifespan: 4000,
      speedX: { min: -5, max: 5 },
      speedY: { min: -5, max: 5 },
      scale: { start: 0.8, end: 0.2 },
      alpha: { start: 0, end: 0 },
      frequency: 600,
      quantity: 1,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-40, -30, 400, 300),
      },
    });
    this.fireflyEmitter.setScrollFactor(0);
    this.fireflyEmitter.setDepth(16);

    // --- Water shimmer overlay ---
    this.waterShimmer = this.add.rectangle(
      map.width * T / 2, map.height * T / 2,
      map.width * T, map.height * T,
      0x4488ff, 0
    );
    this.waterShimmer.setDepth(0.5);

    // --- Audio ---
    this.initAudio();

    this.speed = 80;
  }

  createParticleTextures() {
    const g = this.add.graphics();

    // Dust pixel (for walking particles)
    g.fillStyle(0xc8b89a, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('dustPixel', 2, 2);

    // Firefly pixel (for night ambiance)
    g.clear();
    g.fillStyle(0xffee88, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('fireflyPixel', 2, 2);

    g.destroy();
  }

  createPlayerAnims() {
    // Ninja spritesheet: 4 cols (down, up, left, right) x 7 rows
    // Walk: rows 0-3, Attack: row 4, Jump: row 5, Special: row 6
    const dirs = [
      { key: 'down',  col: 0 },
      { key: 'up',    col: 1 },
      { key: 'left',  col: 2 },
      { key: 'right', col: 3 },
    ];

    for (const { key, col } of dirs) {
      this.anims.create({
        key: `walk-${key}`,
        frames: [0, 1, 2, 3].map(row => ({ key: 'ninja', frame: row * 4 + col })),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `idle-${key}`,
        frames: [{ key: 'ninja', frame: col }],
        frameRate: 1,
      });
    }
  }

  update(time, delta) {
    // --- Player movement ---
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -this.speed; this.playerDir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = this.speed; this.playerDir = 'right'; }
    if (this.cursors.up.isDown || this.wasd.W.isDown) { vy = -this.speed; if (!vx) this.playerDir = 'up'; }
    else if (this.cursors.down.isDown || this.wasd.S.isDown) { vy = this.speed; if (!vx) this.playerDir = 'down'; }
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    this.player.setVelocity(vx, vy);

    const isMoving = vx !== 0 || vy !== 0;

    // --- Animations ---
    if (isMoving) {
      this.player.anims.play(`walk-${this.playerDir}`, true);
    } else {
      this.player.anims.play(`idle-${this.playerDir}`, true);
    }

    // --- Squash/stretch on movement transitions ---
    if (isMoving && !this.wasMoving) {
      this.tweens.add({
        targets: this.player,
        scaleX: 0.88, scaleY: 1.12,
        duration: 80, yoyo: true, ease: 'Quad.Out',
      });
    } else if (!isMoving && this.wasMoving) {
      this.tweens.add({
        targets: this.player,
        scaleX: 1.1, scaleY: 0.9,
        duration: 100, yoyo: true, ease: 'Bounce.Out',
      });
    }
    this.wasMoving = isMoving;

    // --- Shadow follows player ---
    this.shadow.setPosition(this.player.x, this.player.y + 4);

    // --- Walking dust ---
    if (isMoving) {
      this.dustTimer += delta;
      if (this.dustTimer > 180) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 6, 2);
        this.dustTimer = 0;
      }
    } else {
      this.dustTimer = 0;
    }

    // --- Day/night cycle (starts at noon, ~5 min full cycle) ---
    const cycle = (Math.sin(time * 0.00002 + Math.PI / 2) + 1) / 2; // 1=noon at start, 0=midnight
    const nightAmount = cycle > 0.5 ? 0 : (0.5 - cycle) / 0.5;

    // Gentle night dimming
    this.colorMatrix.reset();
    if (nightAmount > 0.1) {
      this.colorMatrix.brightness(1 - nightAmount * 0.15);
    }

    // --- Fireflies brightness tied to night ---
    const ffAlpha = nightAmount > 0.3 ? (nightAmount - 0.3) / 0.7 : 0;
    this.fireflyEmitter.particleAlpha = ffAlpha * 0.6;

    // --- Water shimmer ---
    const shimmer = Math.sin(time * 0.003) * 0.03;
    this.waterShimmer.setAlpha(Math.max(0, shimmer));
  }

  initAudio() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const resume = () => ac.resume();
      this.input.on('pointerdown', resume);
      this.input.keyboard.on('keydown', resume);

      // Ambient wind
      const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.005;
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
      const g = ac.createGain(); g.gain.value = 0.3;
      s.connect(f).connect(g).connect(ac.destination); s.start();

      // Gentle melody
      const notes = [392, 440, 524, 660, 524, 440, 392, 330];
      let ni = 0;
      const play = () => {
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.value = notes[ni++ % notes.length] * 0.5;
        const ng = ac.createGain(); ng.gain.value = 0.008;
        ng.gain.setTargetAtTime(0, ac.currentTime + 0.25, 0.08);
        o.connect(ng).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4);
        setTimeout(play, 1000 + Math.random() * 600);
      };
      setTimeout(play, 2000);

      // Bird chirps
      const chirp = () => {
        const fr = 2500 + Math.random() * 2000;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(fr, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(fr * 1.3, ac.currentTime + 0.04);
        const cg = ac.createGain(); cg.gain.value = 0.008;
        cg.gain.setTargetAtTime(0, ac.currentTime + 0.05, 0.015);
        o.connect(cg).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.1);
        setTimeout(chirp, 5000 + Math.random() * 10000);
      };
      setTimeout(chirp, 3000);
    } catch(e) {}
  }
}

window.game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 320,
  height: 240,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
  scene: WorldScene,
});
