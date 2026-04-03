# Vision

We're not just making a game. We're creating a **vibe** — a world that pulls you in the moment you land.

## Pillars

1. **Vibe over complexity** — simple mechanics, strong atmosphere. Every element serves the mood.
2. **Cohesive world** — music, visuals, narration, and NPCs all carry the same theme. Nothing feels disconnected.
3. **Instant immersion** — no loading screens, no menus. You're *in it* within seconds (contest rule, but also a design choice).
4. **Story-driven** — the world tells a story. Not through cutscenes, but through the environment, characters, and what happens around you.

## Core Ingredients

- **Music** — sets the emotional tone from the first second
- **Visuals** — stylized, consistent aesthetic that reinforces the theme
- **Narration** — possibly; if it serves the vibe, not as filler
- **AI NPCs** — characters that feel alive and belong in the world

## Theme Direction

The theme should tap into something **familiar** — something people already have feelings about. Relatability, cultural relevance, or nostalgia. When a player recognises the world, they're already halfway immersed before gameplay even starts.

## Cost Constraints

Free-to-play + contest traffic = runtime costs matter.

- **No on-the-fly generation** of music, visuals, or heavy assets — all pre-generated and baked in
- **AI NPCs** can use a cheap LLM for text responses only — that's the one place we can afford runtime AI
- The vibe is **fixed by design**, not dynamically generated per player

This means the atmosphere, assets, and world are authored upfront. The trade-off: less personalisation, but a tighter, more intentional experience.

## Strategy

Judges reward **feel, personality, and instant fun** — not technical complexity (see [2025 winners](2025-winners-announcement.md)).

We lean into that:
- Keep mechanics simple so we can polish what matters: aesthetics, sound, atmosphere
- Minimise technical complexity to avoid asset/debugging grind
- Spend the time budget on making it *feel* right, not on making it do more
