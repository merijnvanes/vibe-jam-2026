# Game Concepts — Shortlist

Concepts we like, collected across brainstorm rounds. No final pick yet.

## Action / Chaos

### Avalanche / Downhill Run
- *Vibe:* 80s ski resort neon OR dramatic action chase
- *Mechanic:* Infinite downhill slope, avalanche chases from behind. Steer, dodge obstacles and other players. Die = respawn at current pack position.
- *Scale:* The crowd IS an obstacle. 20 players weaving through each other while fleeing.
- *Build:* Procedural slope chunks, cones for trees, spheres for rocks. Near-zero assets.
- *Why:* Cinematic spectacle — 20 tiny figures fleeing a wall of snow. Proven endless-runner loop + multiplayer chaos.

### Bumper / Sumo Arena
- *Vibe:* Beach party or synthwave. Bright, bouncy, party energy.
- *Mechanic:* Spheres/blobs on a shrinking platform. Dash to knock others off. Die = instant respawn at edge.
- *Scale:* Chain reactions with 20+ players. Pinball chaos.
- *Build:* Spheres + flat platform. Physics engine does everything.
- *Why:* Fastest time-to-fun. Zero learning curve.

### Paint Wars
- *Vibe:* Joyful, Holi festival / Splatoon. Bright on white.
- *Mechanic:* 4 color teams. Move to paint ground your color. 25-second rounds. Dash for wider trail, paint bombs. Enemy color slows you.
- *Scale:* 16+ painters = constant flux. White-to-chaos in 25 seconds.
- *Build:* Flat plane + color grid. Zero models.
- *Why:* End-of-round freeze frame is a natural screenshot. Time-lapse is inherently shareable.

## Vehicular / Arena

### Demolition Derby (FlatOut 2-inspired)
- *Vibe:* Gritty, crunchy, adrenaline. Think 80s/90s stock car aesthetic — rust, sparks, dust clouds, metal-on-metal soundtrack. Or go stylized/neon for a more unique look.
- *Mechanic:* Cars in a closed arena ramming each other. Continuous play — no fixed rounds. Points for survival time + each car you wreck. Destroyed = quick respawn, keep playing. Arcade physics — drifty, weighty, not sim.
- *Scale:* 16+ cars in one arena. More players = more chaos, more collisions, more multi-car pile-ups. Every direction is a threat.
- *Build:* One arena (walled circle/rectangle), low-poly cars (one model, color variations). Damage as visual states (intact → dented → smoking → wrecked) rather than real-time deformation. Sparks and debris are particle effects.
- *Why:* Instantly familiar — everyone knows demolition derby. The continuous respawn + scoring model fits the vision perfectly (no idle, no waiting). Impact feel is the whole game.
- *Risks:*
  - **Multiplayer physics sync** is the hardest part. 16+ fast-moving cars with constant collisions need either server-authoritative physics (costly) or smart client-side prediction. Desync on collisions is the main failure mode.
  - **Car feel** — the difference between "fun" and "floaty" is tuning work. Sound design, screen shake, collision particles, and weight are what make it crunchy.
- *De-risk ideas:*
  - Each client owns their car physics, server validates kills/damage only (cheaper, lighter)
  - Keep arena small to force action — no driving around looking for fights
  - Stylized/low-poly aesthetic avoids needing detailed car models or deformation
  - Prioritize sound + screen shake over visual damage for impact feel
- *AI layer — Live Announcer/Commentator:*
  - A shared AI announcer watches the game state and delivers real-time sports-style commentary to all players simultaneously. One LLM call serves 16+ players.
  - Calls out rivalries ("Player3 has hit Player7 THREE times — this is personal"), names emerging plays ("TEXTBOOK SANDWICH — two cars, one victim"), roasts the bottom, hypes the top.
  - Doubles as game master — can trigger dynamic events ("I'm bored. Shrinking the arena in 10 seconds."), oil slicks, ramps, hazards based on game state.
  - Cost: ~1 call per 5-10 seconds, broadcast to all. Scales with match, not player count. Very cheap.
  - Why it works: the difference between watching a sport on mute vs with a commentator. Players will screenshot the commentary. Creates narrative, rivalries, and moments from pure chaos.

## AI-Enhanced (proven game + AI twist)

A direction rather than a single concept: take a game formula that already works and enhance it with AI in a way that wasn't previously possible. Not AI gimmicks — AI that genuinely changes the experience.

Reference: [uncivilised-game](https://github.com/uncivilised-game/uncivilised-game-base) — a Civ-like where LLM-powered faction leaders negotiate, betray, and dynamically inject new game content (units, tech, resources) through diplomatic conversation. Every playthrough evolves differently based on what you negotiate. The AI doesn't replace gameplay — it adds an emergent layer on top of proven mechanics.

**What makes this angle strong:**
- The base game is proven fun — you're not gambling on an untested mechanic
- AI adds surprise and replayability — each session feels unique
- Cheap LLM text is the only runtime AI needed (fits budget constraints)
- Judges will recognize the base game instantly, then be surprised by what the AI adds
- Shows what 2026 AI can do vs 2025 — fits the "benchmark for AI coding" narrative levelsio mentioned

**Open questions:**
- Which proven game formula? (needs to be simple enough to build in a month, multiplayer, browser-friendly)
- What's the AI enhancement? (must be more than "NPCs that talk" — should change gameplay dynamics)
- Cost at scale? (LLM calls per player need to be minimal/cheap)

## Strategy / Tactics

### Feeding Frenzy
- *Vibe:* Deep ocean, bioluminescent. BBC Planet Earth deep sea episode.
- *Mechanic:* Eat smaller things to grow. Bigger = slower + brighter + attracts an AI predator that hunts the biggest player. Being #1 is the most dangerous position.
- *Scale:* Self-balancing. Mid-size players gang up to corner big ones. Leaderboard constantly shifts.
- *Build:* Dark background, glowing circles, particle trails. Zero textures.
- *Why:* The self-correcting predator mechanic solves the biggest .io problem (runaway winners).
