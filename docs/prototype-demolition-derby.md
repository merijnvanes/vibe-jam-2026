# Prototype Design: Demolition Derby

**Goal:** Validate car feel, collision impact, and the core fun loop in a single-player browser prototype. No multiplayer, no AI announcer — just one car in an arena, ramming AI cars, seeing if it *feels* good.

## What "Done" Looks Like

A player opens a URL, is instantly in an arena driving a car. They ram other cars. Cars take visible damage, sparks fly, metal crunches. The player thinks "this is satisfying" within 5 seconds. That's the prototype passing.

## Scope

| In | Out |
|----|-----|
| One drivable car | Multiplayer / netcode |
| 8 AI cars (dumb: drive toward center, avoid walls) | AI announcer / commentary |
| Arena with walls | Multiple car models |
| Arcade physics (drift, weight, bounce) | Realistic simulation |
| Visual damage states (3 levels) | Real-time mesh deformation |
| Collision particles (sparks, debris) | Soundtrack / music |
| Sound effects (engine + crashes) | Menus, UI, scoring |
| Third-person camera | Minimap |
| Respawn on destruction | Progression / unlocks |

## Tech Stack

- **Three.js** via CDN (import map, same as existing prototypes)
- **Cannon-es** for physics (`cannon-es` via CDN — lightweight rigid body physics)
- **Howler.js** via CDN for collision sound effects
- **Web Audio API** directly for procedural engine sound
- Static HTML, no build tools, served with `python3 -m http.server`

## Car

### Model
Generate one car with **Tripo AI** (text-to-model → rig is not needed, cars don't have skeletons):
- Prompt: *"Low-poly stylized demolition derby car, boxy, dented, colorful, game-ready"*
- Run `smart_lowpoly` to get a game-friendly poly count (~5k faces)
- Export as GLB, load with GLTFLoader
- AI cars are color-tinted copies of the same model (use `mesh.material.color`)

### Physics
- Box collider approximation (no mesh collider — too expensive for 9 cars)
- Arcade tuning: high angular damping (prevents endless spinning), low friction (allows drifting), strong linear impulse on acceleration
- Steering: turn rate scales inversely with speed (tight turns at low speed, wide at high speed)
- Boost: short burst of forward impulse on a cooldown (Space key). This is where the fun is.

### Controls
| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A / ↓ / ← | Steer left |
| D / → | Steer right |
| Space | Boost (3s cooldown) |

### Damage System
Three visual states, swapped based on hit count:
1. **Intact** (0-2 hits) — clean model
2. **Damaged** (3-5 hits) — same model with darker tint, smoke particle emitter attached
3. **Wrecked** (6+ hits) — model tinted dark, fire particles, then explode after 1s → respawn

No real-time deformation. State transitions use:
- Screen shake (camera offset, exponential decay)
- Flash of white on the hit side
- Particle burst (sparks + debris quads)

This is cheaper and more impactful than vertex deformation for a prototype.

## Arena

Simple walled enclosure:
- **Ground:** Flat plane with a dirt/asphalt texture (or vertex-colored procedural)
- **Walls:** Box geometry ring, tall enough that cars can't fly over
- **Size:** ~40×40 units — small enough that collisions happen constantly
- **Lighting:** Single directional light (sun) + hemisphere light. Dust-colored fog.
- **Props (stretch goal):** Tire stacks, oil barrels, ramp — only if time allows

## AI Cars (Dumb Bots)

Not real AI — simple steering behaviors:
```
each frame:
  target = nearest other car (or center if far from action)
  steer toward target
  accelerate
  if about to hit wall: steer away from wall
```
- 8 bots, each a different color tint of the player's car model
- Same physics body as the player car
- Same damage/destruction system
- On destruction: respawn at a random arena edge after 2s

This creates organic chaos without complexity. The bots drive into each other as much as they drive into you.

## Sound Effects

### Procedural Engine (Web Audio API)
- 2 detuned sawtooth oscillators (base ~80Hz) through a low-pass filter
- Oscillator frequency mapped to car speed: idle=80Hz, max=300Hz
- Filter cutoff also mapped to speed: idle=400Hz, max=2000Hz
- Volume fades based on whether the car is accelerating or coasting
- One engine sound for the player car only (AI cars are silent — saves performance, reduces cacophony)

### Pre-Recorded Impacts (Howler.js)
Load 3-4 short MP3 files (~30-50KB each):
- **crash_heavy.mp3** — metal-on-metal, played on high-speed collisions
- **crash_light.mp3** — lighter bump, played on low-speed contacts
- **screech.mp3** — tire screech, played during sharp turns at speed
- **boost.mp3** — whoosh/thrust sound for boost activation

Source: Kenney.nl audio packs (CC0) or Freesound.org (filter CC0).

**Collision sound selection:** Based on relative velocity of the two colliding bodies:
- `relativeVelocity > 15` → crash_heavy
- `relativeVelocity > 5` → crash_light
- Below 5 → no sound (prevents constant noise from resting contacts)

### Mobile Audio Unlock
Resume `AudioContext` on first touch/click — required by all mobile browsers.

## Camera

Third-person, behind the player car:
- Same system as the existing prototype-3d (smooth angle tracking, exponential lerp)
- Shake on collision: offset camera position by random vector, decay over 0.3s
- Height: ~6 units above, distance: ~10 units behind
- Look-at: car position + slight forward offset (so you see where you're going)

## Visual Effects

- **Sparks on collision:** Instanced small quads with additive blending, velocity = collision normal, gravity + short lifetime (0.3s)
- **Smoke on damaged cars:** Small particle emitter (billboard quads), dark grey, slow upward drift
- **Fire on wrecked cars:** Same as smoke but orange, with a point light (no shadow)
- **Dust trail:** Small particles behind moving cars, ground-colored
- **Boost visual:** Stretched flame particles behind the car + brief FOV increase on camera
- **Screen shake:** Camera position offset on collision, magnitude proportional to impact force

## Post-Processing

Same stack as prototype-3d (proven performant):
- UnrealBloomPass (low strength ~0.4 — just enough to make sparks and fire glow)
- Vignette + color grading shader (warm, gritty palette)
- ACES tone mapping

## Performance Budget

| Element | Count | Draw Calls |
|---------|-------|------------|
| Car models | 9 | 9 (one material each) |
| Arena (ground + walls) | 1 | 2 |
| Particles (sparks, smoke, dust) | Instanced | 3-4 |
| Lights | 1 directional + 1 hemisphere | — |
| Shadow map | 1 × 1024² | 1 pass |
| Point lights (fire on wrecked cars) | 0-3 max | — |
| Post-processing | Bloom + vignette | 2 passes |

**Total:** ~20 draw calls, 1 shadow pass, 2 post-process passes. Well within budget.

## File Structure

```
prototype-derby/
  index.html          — HTML shell, import map, loading screen
  game.js             — Main game loop, scene, camera, controls
  physics.js          — Cannon-es setup, car physics, collision handling
  audio.js            — Engine synth + Howler.js impact sounds
  assets/
    car.glb           — Tripo AI generated car model
    crash_heavy.mp3
    crash_light.mp3
    screech.mp3
    boost.mp3
```

## Build Sequence

1. **Arena + camera + controls** — flat plane, walls, WASD driving a box. Prove the car feel.
2. **Physics** — Cannon-es, box colliders, collision detection. Cars bounce off each other.
3. **Car model** — Generate with Tripo AI, replace the box. Add color tints for AI cars.
4. **AI bots** — 8 dumb drivers. Arena should now feel chaotic.
5. **Sound** — Procedural engine + crash MPs. This is where it starts feeling *real*.
6. **Damage + particles** — Visual states, sparks, smoke, screen shake. The "juice."
7. **Polish** — Post-processing, dust, boost effects, camera shake tuning.

Each step is independently testable. Stop at any point and the prototype works — it just gets better with each layer.
