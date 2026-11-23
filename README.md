# HASHRATE — Crypto Mining & Semiconductor Tycoon

**HASHRATE** is a terminal-first single-player cryptocurrency mining, hardware engineering, and financial simulation game built with React, TypeScript, Vite, and Tailwind CSS.

---

## Key Features

- **8-Part Modular Rig Architecture & Individual Component Health**: Build custom rigs across Chassis, Compute (CPU / FPGA / ASIC / QPU), GPUs, Storage/RAM, PSU, Cooling, and baremetal OS Kernels. Each component wears individually; single-part repairs (`repair <rig#> <part>`), repasting, and hot-swap trade-ins (`tinker <#>`) keep fleets profitable.
- **Gen-1 through Gen-7 Hardware & Distinct Quantum vs. Photonic Branches**: Progress from consumer hardware to commercial ASICs (Gen 2–5), Gen-6 AI Converged silicon ($500k–$700k/part), and **Gen-7 Quantum Cryo QPUs** vs. **Gen-7 Photonic Optical Cores** ($2M–$3M/part), complete with Cryo-rated cooling and Optical Backplane chassis requirements plus Hybrid ASIC+GPU Converged Super-Racks.
- **Advanced Custom Foundry & Quality Control (`fab`)**:
  - Multi-category blueprint engineering wizard (`fab design`) covering all 7 component slots (`compute`, `gpu`, `chassis`, `storage`, `psu`, `cooling`, `os`).
  - Engineering budget allocation (`density`, `efficiency`, `thermals`, `reliability`), chiplet/mesh layouts, component-specific parameters (qubits/coherence/mK cryo vs. waveguide lanes/wavelength/WDM channels, GPU HBM/VRAM), and live manufacturability yield %.
  - Draft blueprints (`fab drafts`), numbered blueprint revisions (`fab revise`), side-by-side blueprint comparisons (`fab compare`), prototype bench testing (`fab proto`), tracked QA production batches (`fab batch`), and individual serial number genealogy (`fab serial`).
- **Cryptocurrency Markets & Player-Created Mainnet Coins**:
  - Trade and mine 9 starter coins across 8 algorithms (`BTC`, `LTC`, `DOGE`, `RVN`, `XMR`, `ETH`, `ZEC`, `XCH`, `QBC`) with VRAM/RAM constraints, halving ratchets, bull/winter regimes, forecasting (`forecast`), spot trading, limit orders, and 1x shorts (`exchange`).
  - Launch **legitimate player-created mineable cryptocurrencies** (`coin create`) with custom ticker, algorithm, seed liquidity pool, halving schedule, and creator dev fee (0–5%)—completely separate from illegal underground shell tokens.
- **Underground Operations & Escalating Regulatory Enforcement (`ops`)**:
  - Staged illicit shell-coin lifecycle (`ops coin dev` -> `ops coin seed` -> `ops coin` launch -> `ops shill` -> `ops rug`) with audit spoofing and traced scandal marks.
  - 2-phase Vault Raids (`ops raid prep` recon dossier -> `ops raid exec stealth|zeroday|bribe`).
  - Cumulative regulatory investigation ladder (`NONE` -> `WATCHLIST` -> `FORMAL_AUDIT` -> `SANCTIONED` -> `PROBATION`) with compliance recovery (`ops comply`, `ops settle`) and persistent operation ledgers (`ops log`).
- **Guided Onboarding Checklist vs. Veteran Mode & Career Presets**:
  - **Guided Mode**: Stage-by-stage interactive checklist (`guide`) pacing system unlocks, pause/resume/pace controls, contextual pop-ups, and permanent searchable Codex (`codex`).
  - **Veteran / Sandbox / Career Presets**: Jump straight in with all systems unlocked or create, duplicate, rename, and launch custom Career Presets from the Start Screen (`Presets`).
- **Facilities, ASCII Floor Plans & Staff Management**: Scale across 6 facility tiers with an interactive ASCII room floor-plan (`rooms`), wing expansion (`room expand`), power contracts (`power`), dynamic facility/hardware/industry events, 7 employee roles, shifts, skill leveling, and burnout/strike mechanics.

---

## Essential Terminal Commands

| Domain | Key Commands |
| --- | --- |
| **Core Loop & Status** | `step [n]`, `status`, `objectives`, `stats`, `valuation`, `history`, `save`, `help` |
| **Onboarding & Codex** | `guide`, `guide check <#>`, `guide pause`, `guide resume`, `guide pace <slow\|normal\|fast>`, `tutorial [topic]`, `codex [query]`, `mode [guided\|veteran]` |
| **Rigs & Hardware** | `rigs`, `build rig`, `presets`, `inspect <#>`, `tinker <#>`, `repair <#> [part] [slot]`, `repaste <#>`, `overclock <#> <80..150>`, `usedmarket` |
| **Facilities & Rooms** | `facilities`, `rooms`, `room <#\|expand>`, `rig <#> room <#>`, `cool`, `power`, `facility upgrade <#>` |
| **Custom Foundry (Fab)** | `fab`, `fab line build`, `fab design`, `fab drafts`, `fab draft tapeout\|del <#>`, `fab revise <#> [profile]`, `fab compare <a#> <b#>`, `fab proto <#>`, `fab produce <#> <qty>`, `fab batch [#]`, `fab serial <ID>`, `fab history`, `fab deploy <inv#> <rig#> [gpuSlot]`, `fab sell <inv#> <qty\|all>` |
| **Coins & Exchange** | `coins`, `coin create`, `coin info <SYM>`, `unlock <SYM>`, `forecast [SYM]`, `chart [SYM]`, `exchange`, `exchange buy\|sell\|limit\|short ...` |
| **Operations & Underground** | `contracts`, `rivals`, `pr`, `ops`, `ops coin dev\|seed\|<TICKER> ...`, `ops shill\|rug <TICKER>`, `ops raid prep <#>`, `ops raid exec <stealth\|zeroday\|bribe>`, `ops audit`, `ops comply`, `ops settle`, `ops log`, `blackmarket` |
| **Developer Commands** | `dev cash <amt>`, `dev rp <amt>`, `dev heat <0..100>`, `dev inv <none\|watchlist\|audit\|sanctioned\|probation> [marks]`, `dev batch [compute\|gpu\|chassis] [qty]`, `dev coin [sym] [algo] [name]` |

---

## Development & Verification

```bash
npm install      # Install dependencies
npm run dev      # Start Vite dev server on port 3000
npm test         # Run the full test suite (tsx --test tests/*.test.ts)
npm run lint     # Type-check with TypeScript (tsc --noEmit)
npm run build    # Build production bundle
```
