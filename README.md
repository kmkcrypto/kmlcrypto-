# HASHRATE

A single-page crypto-mining tycoon game built with Vite 8, React 19 and TypeScript.
You start with one rig in a bedroom in 2010 and grow into hydro-cooled datacenters,
proprietary silicon and (if you choose) a criminal empire.

Everything runs in the browser. There is no backend, no API and no database: the
entire game state lives in `localStorage` and is written on every state change.

## Running it

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:3000
```

The app opens on a short computing-history study page; the small **Sys · v2.4**
button in the corner opens the game menu.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Type check (`tsc --noEmit`) |
| `npm test` | Unit tests (`tsx --test tests/*.test.ts`) |

The GitHub Pages workflow (`.github/workflows/deploy.yml`) type-checks and tests
before it builds, so a red test blocks deployment.

## How the game works

Time only moves when you step. Every step mines the rigs' target coins, settles
power, wear and heat, rolls the market, and can trigger an interactive event.

- **Hardware** — rigs are assembled from chassis, compute (CPU/GPU/ASIC), storage,
  PSU, cooling and OS parts, each with its own health. Parts wear out, can be
  repaired individually, swapped with trade-in credit, and overclocked.
- **Power, cooling & facilities** — six facility tiers with power caps, breaker
  trips, thermal throttling, noise fines, room zoning and cooling units.
- **Market** — six coins across five algorithms, market regimes, halvings,
  a treasury wallet, spot/limit/margin trading and PR campaigns that move prices.
- **Rivals** — four rival syndicates grow every step and compete for network share.
- **Research & foundry** — a five-category R&D tree, plus custom ASIC design
  (process nodes, design profiles, first-silicon quality and wafer yield).
- **Staff** — seven specialist roles with skills, shifts, morale, payroll and strikes.
- **Contracts & challenges** — reputation-gated enterprise contracts and optional
  challenge runs.
- **Underground** — power siphons, botnets, wash trades, pump-and-dumps, extortion,
  sabotage, shell coins (`ops coin` / `ops shill` / `ops rug`) and vault raids
  (`ops raid`), all paid for in regulatory heat.
- **Seasons** — a season lasts 60 steps. `leaderboard` ranks you against every rival;
  closing standings are archived in the hall of fame and the #1 operator earns the
  Season Champion achievement.
- **Shared world** — a locally simulated blockchain with a block clock, network
  share and block history. It is single-player only: there is no networking yet.

## Playing

Type `help` in the terminal for the full command reference, `codex` for the
mechanics encyclopedia, `tutorial list` for guided walkthroughs, or `objectives`
for early goals. Useful starters: `status`, `rigs`, `market`, `step 5`, `ops`,
`leaderboard`.

## Project layout

```
src/
  App.tsx                  state container, save/load, handlers, layout
  components/              terminal UI, telemetry panels, menus, dev panel
  data/                    part/coin/research catalogs, onboarding & codex text
  engine/                  pure simulation: mining, market, rivals, foundry,
                           underground ops, seasons, save migration
  types/game.ts            the GameState shape and every subsystem type
  utils/                   formatting, seeded RNG, sound
tests/                     node:test suites for the simulation and systems
```

Game state is versioned (`BLOCKWORKS_SAVE_V2`) and migrated on load, so saves from
earlier builds keep working as new fields are added.
