# OutreachOps MVP

Mobile-first, grid-only outreach operations dashboard with Firebase realtime sync.

## Root cause fixed in this revision
The prior build rendered map tiles but grid interaction was unreliable because selection depended on a single dashboard map click path and Request step 2 had no map selection surface. The selected state therefore often stayed `none`, and map overlays did not make selection intent obvious. This update introduces always-visible grid overlays on both Dashboard and Request maps, a global `selectedGridId` single source of truth, and explicit selected-cell highlight + chips.

## Stack
- Static site in `public/` (GitHub Pages compatible).
- Firebase Anonymous Auth + Firestore realtime listeners.
- MapLibre GL JS with OSM raster tiles (`© OpenStreetMap contributors`).

## Safety constraints
- No pin markers, no path/route overlays, no geolocate UI.
- Grid-only persistence (`grid_id`) with non-identifying fields only.
- Explicit policy: **No tips for sustaining or evading homelessness.**
- APG privacy gate: `W=7 days`, `k=10`; below threshold => `데이터 부족` only.

## Core mechanisms
- CWS demand = source weight × time decay × anomaly penalty.
- NRGI priority: `P = Demand / (Capacity + 0.1)`.
- Zoom-to-grid resolution:
  - `< 7` => `z6`
  - `7..10.99` => `z9`
  - `>= 11` => `z12`

## Demo flows
- **F1** Submit Request (category + grid + safety check) → immediate demand/classification/priority update.
- **F2** Save capacity in Resources tab → immediate visible priority reorder.
- **F3** Save Outreach Log → immediate KPI update with visual highlight.
- First-run helper: **Demo seed** chip loads 3 publishable cells (demo-only label) so APG-gated maps remain demonstrable without manual backend setup.

## Dev run
```bash
python3 -m http.server 4173 --directory public
```

## CI
- `.github/workflows/deploy-pages.yml` deploys Pages from `public`.
- `.github/workflows/no-conflict-markers.yml` fails on `<<<<<<<`, `=======`, `>>>>>>>`.
