# OutreachOps MVP

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
- `.github/workflows/deploy-pages.yml` deploys GitHub Pages artifact from `public`.
- `.github/workflows/no-conflict-markers.yml` fails if `<<<<<<<`, `=======`, `>>>>>>>` exist.
