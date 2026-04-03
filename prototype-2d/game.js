// ============================================================
// PIXEL WORLD — Phaser 3 + Kenney assets + verified tile data
// ============================================================

class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  preload() {
    this.load.spritesheet('town', 'kenney-town/Tilemap/tilemap_packed.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
    this.load.spritesheet('dungeon', 'kenney-dungeon/Tilemap/tilemap_packed.png', {
      frameWidth: 16, frameHeight: 16, spacing: 0, margin: 0,
    });
  }

  create() {
    const T = 16;
    const MW = GROUND_DATA[0].length;
    const MH = GROUND_DATA.length;

    // --- Ground layer ---
    const gMap = this.make.tilemap({ data: GROUND_DATA, tileWidth: T, tileHeight: T });
    const gSet = gMap.addTilesetImage('town', 'town', T, T, 0, 0);
    gMap.createLayer(0, gSet, 0, 0);

    // --- Object layer ---
    const oMap = this.make.tilemap({ data: OBJECT_DATA, tileWidth: T, tileHeight: T });
    const oSet = oMap.addTilesetImage('town', 'town', T, T, 0, 0);
    const oLayer = oMap.createLayer(0, oSet, 0, 0);
    oLayer.setDepth(2);

    // Collision on object layer
    oLayer.setCollision(COLLISION_TILES);

    // --- Above layer (roofs, rendered on top of player) ---
    const aMap = this.make.tilemap({ data: ABOVE_DATA, tileWidth: T, tileHeight: T });
    const aSet = aMap.addTilesetImage('town', 'town', T, T, 0, 0);
    this.aboveLayer = aMap.createLayer(0, aSet, 0, 0);
    this.aboveLayer.setDepth(10);
    this.aboveLayer.setAlpha(0.85); // Slightly transparent so you can see player behind

    // --- Player ---
    this.player = this.physics.add.sprite(20 * T + 8, 14 * T + 8, 'dungeon', 85);
    this.player.setDepth(5);
    this.player.setSize(10, 10);
    this.player.setOffset(3, 6);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, oLayer);

    // --- NPCs ---
    this.npcs = [];
    const npcDefs = [
      { frame: 86, x: 16, y: 12, tx: 18, ty: 12 },
      { frame: 88, x: 24, y: 17, tx: 26, ty: 19 },
      { frame: 98, x: 10, y: 21, tx: 12, ty: 23 },
      { frame: 84, x: 6, y: 14, tx: 6, ty: 14 },  // stationary wizard
      { frame: 100, x: 30, y: 12, tx: 34, ty: 12 },
    ];
    for (const def of npcDefs) {
      const npc = this.add.sprite(def.x * T + 8, def.y * T + 8, 'dungeon', def.frame);
      npc.setDepth(5);
      npc.def = def;
      npc.startX = def.x * T + 8;
      npc.startY = def.y * T + 8;
      npc.endX = def.tx * T + 8;
      npc.endY = def.ty * T + 8;
      npc.progress = 0;
      npc.forward = true;
      npc.speed = def.tx === def.x && def.ty === def.y ? 0 : 0.15 + Math.random() * 0.1;
      this.npcs.push(npc);
    }

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, MW * T, MH * T);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setRoundPixels(true);

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // --- Physics bounds ---
    this.physics.world.setBounds(0, 0, MW * T, MH * T);

    // --- Audio ---
    this.initAudio();

    // --- Day/night overlay ---
    this.overlay = this.add.rectangle(160, 120, 640, 480, 0x101830, 0);
    this.overlay.setScrollFactor(0);
    this.overlay.setDepth(20);

    this.speed = 80;
  }

  update(time) {
    // Player movement
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -this.speed; this.player.setFlipX(true); }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = this.speed; this.player.setFlipX(false); }
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -this.speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = this.speed;
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    this.player.setVelocity(vx, vy);

    // NPC movement (simple lerp patrol)
    for (const npc of this.npcs) {
      if (npc.speed === 0) continue;
      npc.progress += npc.speed * 0.016;
      if (npc.progress >= 1) { npc.progress = 0; npc.forward = !npc.forward; }
      const t = npc.forward ? npc.progress : 1 - npc.progress;
      npc.x = npc.startX + (npc.endX - npc.startX) * t;
      npc.y = npc.startY + (npc.endY - npc.startY) * t;
    }

    // Day/night
    const cycle = (Math.sin(time * 0.0003) + 1) / 2;
    this.overlay.setAlpha(cycle < 0.3 ? (0.3 - cycle) / 0.3 * 0.35 : 0);
  }

  initAudio() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const resume = () => ac.resume();
      this.input.on('pointerdown', resume);
      this.input.keyboard.on('keydown', resume);

      // Wind
      const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.005;
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
      const g = ac.createGain(); g.gain.value = 0.4;
      s.connect(f).connect(g).connect(ac.destination); s.start();

      // Melody
      const notes = [392, 440, 524, 660, 524, 440, 392, 330];
      let ni = 0;
      const play = () => {
        const o = ac.createOscillator(); o.type = 'square';
        o.frequency.value = notes[ni++ % notes.length] * 0.5;
        const ng = ac.createGain(); ng.gain.value = 0.012;
        ng.gain.setTargetAtTime(0, ac.currentTime + 0.2, 0.06);
        o.connect(ng).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.3);
        setTimeout(play, 800 + Math.random() * 500);
      };
      setTimeout(play, 2000);

      // Birds
      const chirp = () => {
        const fr = 2500 + Math.random() * 2000;
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(fr, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(fr * 1.3, ac.currentTime + 0.04);
        const cg = ac.createGain(); cg.gain.value = 0.01;
        cg.gain.setTargetAtTime(0, ac.currentTime + 0.05, 0.015);
        o.connect(cg).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.1);
        setTimeout(chirp, 4000 + Math.random() * 8000);
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
