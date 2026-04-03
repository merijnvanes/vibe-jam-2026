// ============================================================
// PIXEL WORLD — Phaser 3 + blob auto-tiled terrain
// ============================================================

class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  preload() {
    this.load.spritesheet('overworld', 'autotiles/overworld_autotiles.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('dungeon', 'kenney-dungeon/Tilemap/tilemap_packed.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
  }

  create() {
    const T = 16;
    const map = generateMap(50, 40, 777);

    // --- 4 terrain layers: water → grass → sand → dirt ---
    const layerData = [map.layers.waterLayer, map.layers.grassLayer, map.layers.sandLayer, map.layers.dirtLayer];
    for (let i = 0; i < layerData.length; i++) {
      const tm = this.make.tilemap({ data: layerData[i], tileWidth: T, tileHeight: T });
      const ts = tm.addTilesetImage('overworld', 'overworld', T, T, 0, 0);
      const layer = tm.createLayer(0, ts, 0, 0);
      if (layer) layer.setDepth(i);
      else console.error('Failed to create layer', i);
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

    // --- Player ---
    this.player = this.physics.add.sprite(
      map.spawnX * T + 8, map.spawnY * T + 8, 'dungeon', 85
    );
    this.player.setDepth(5);
    this.player.setSize(10, 10);
    this.player.setOffset(3, 6);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.waterBodies);

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, map.width * T, map.height * T);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setRoundPixels(true);

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // --- Physics bounds ---
    this.physics.world.setBounds(0, 0, map.width * T, map.height * T);

    // --- Audio ---
    this.initAudio();

    // --- Day/night overlay ---
    this.overlay = this.add.rectangle(
      map.width * T / 2, map.height * T / 2,
      map.width * T * 2, map.height * T * 2, 0x101830, 0
    );
    this.overlay.setScrollFactor(0);
    this.overlay.setDepth(20);

    this.speed = 80;
  }

  update(time) {
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -this.speed; this.player.setFlipX(true); }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = this.speed; this.player.setFlipX(false); }
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -this.speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = this.speed;
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    this.player.setVelocity(vx, vy);

    const cycle = (Math.sin(time * 0.0002) + 1) / 2;
    this.overlay.setAlpha(cycle < 0.3 ? (0.3 - cycle) / 0.3 * 0.4 : 0);
  }

  initAudio() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const resume = () => ac.resume();
      this.input.on('pointerdown', resume);
      this.input.keyboard.on('keydown', resume);

      const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.005;
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
      const g = ac.createGain(); g.gain.value = 0.3;
      s.connect(f).connect(g).connect(ac.destination); s.start();

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

new Phaser.Game({
  type: Phaser.AUTO,
  width: 320,
  height: 240,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
  scene: WorldScene,
});
