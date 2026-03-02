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

## Dev run
Mobile-first outreach triage dashboard with strict privacy controls.

## Stack
- Static site (`public/*`) deployable to GitHub Pages.
- Firebase Anonymous Auth + Firestore (realtime `onSnapshot`).
- MapLibre GL JS with OpenStreetMap raster tiles.

## Safety + hard constraints
- Grid-only records (`grid_id`); no lat/lng/address/PII storage.
- No pins/markers, no route lines, no geolocate controls.
- No enforcement/crackdown workflows.
- Explicit safety statement: **No tips for sustaining or evading homelessness.**
- APG privacy gate: `W=7d`, `k=10` => `데이터 부족` and hatched display when below threshold.
- CWS demand: weighted aggregation with source weights, time decay (`tau=24h`), anomaly penalty.
- NRGI priority: `P = Demand / (Capacity + 0.1)`.

## Screens
1. Dashboard: realtime map+grid, KPI strip, priority list, resource editor, request/log FABs.
2. Request: category + selected grid + safety mini-check + submit/cancel.
3. Safety: one-screen checklist and policy statements.

## Demo flows (F1/F2/F3)
1. **F1**: On Request screen submit one signal => demand/count in selected grid changes and priority list updates immediately.
2. **F2**: Change capacity in Resources tab => priority order visibly reorders immediately.
3. **F3**: Save outreach log => backlog/average response KPIs update immediately.

## Firebase
Configuration is hard-coded in `public/firebase.js` as requested.
Collections:
- `signals`: `created_at`, `source_type`, `category`, `grid_id`, `status`, `weight`
- `resources`: `resource_id`, `resource_type`, `availability_state`, `updated_at`, `capacity_score`
- `outreachLogs`: `created_at`, `org_id`, `grid_id`, `action`, `outcome`

Writes log:
`[FS WRITE OK] <collection> <docId>`

## Local run
Serve `public` from any static server.

```bash
python3 -m http.server 4173 --directory public
```

## CI
- `.github/workflows/deploy-pages.yml` deploys Pages from `public`.
- `.github/workflows/no-conflict-markers.yml` fails on `<<<<<<<`, `=======`, `>>>>>>>`.
- `.github/workflows/deploy-pages.yml` deploys GitHub Pages artifact from `public`.
- `.github/workflows/no-conflict-markers.yml` fails if `<<<<<<<`, `=======`, `>>>>>>>` exist.
