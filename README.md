# HASHRATE — Terminal Crypto Mining Tycoon Simulator

A terminal-driven, Matrix-styled cryptocurrency mining tycoon simulator built with React, TypeScript, and Vite.

## Key Systems

- **Guided & Veteran Onboarding**: Choose Guided mode (gradual system unlocks, tracked early objectives, topic tutorials, contextual guides, and a permanent `codex`) or Veteran mode at startup (`mode <guided|veteran>`).
- **Hardware Lifecycle & Per-Component Health**: Gen 1–6 parts (CPU, GPU, FPGA, ASIC, AI-ASIC), chassis/compute/GPU/storage/PSU/cooling wear and thermal throttling, single-component repair (`repair <rig#> <part> [slot#]`), thermal paste, cloneable fleet builds (`rig <#> clone`), and a dynamic Used Equipment Market (`usedmarket`).
- **Facilities, Power Contracts & ASCII Rooms**: Six progression facilities (`fac_bedroom` to `fac_megafarm`), utility rate contracts (`power`), facility upgrades, ASCII floor-plan room placement (`rooms`, `room <#>`, `rig <#> room <#>`, `cool room <#> <room#>`), and wing expansion (`room expand`).
- **Employees & Graduated Morale**: Seven specialist roles (`Technician`, `Electrician`, `Manager`, `Sys Engineer`, `Researcher`, `PR Strategist`, `Analyst`), shift/priority assignment, XP training (`train`), workload tracking, efficiency scaling, burnout quits, and mass strikes with negotiation events.
- **Dynamic Markets, Forecasting & Exchange**: Regime-driven volatility (`ACCUMULATION`, `BULL_RUN`, `MANIA_PEAK`, `CORRECTION`, `CRYPTO_WINTER`), economic modifiers, halving cycles, RSI/SMA technical forecasting (`forecast`), ASCII charts (`chart`), `HOLD` vs `AUTOSELL` rig payouts (`rig <#|all> payout <hold|sell>`), spot buy/sell, limit orders, and 1x collateralized shorts (`wallet`, `exchange`).
- **Semiconductor & Proprietary ASIC Foundry**: Unlockable wafer cleanroom lines (`fab line build`), design profiles (`PERF`, `BALANCED`, `EFF`, `COMPACT`), first-silicon grading, batch wafer yields, rig installation/extraction (`fab deploy`, `fab strip`), and wholesale exports (`fab sell`).
- **Enterprise Contracts, Rivals, Covert Ops & Shared World**: Reputation-gated contracts, rival syndicate strategy tracking and recon (`rivals investigate`), underground ops (`ops`, `blackmarket`), scenario presets (`DevPanel`), and a local shared-world block clock (`world`).

## Commands & Development

```bash
npm install --legacy-peer-deps
npm run dev      # Vite dev server
npm test         # Node test runner across tests/*.test.ts
npm run lint     # TypeScript check (tsc --noEmit)
npm run build    # Production Vite build
```

## Notes

- Networked multiplayer is intentionally excluded in this build; `world` runs a deterministic local shared-world block simulation.
