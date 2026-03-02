import { createGridMap } from './map.js';
import {
  cellMetrics,
  getState,
  initStore,
  kpis,
  saveCapacity,
  saveOutreachLog,
  seedDemoData,
  setSelectedCategory,
  setSelectedGrid,
  submitSignal,
  subscribe
} from './store.js';
import { initUI, render, requestFeedback, switchToDashboard, toast } from './ui.js';

let dashboardMap;
let requestMap;

function mapLoaded(mapApi) {
  return Boolean(mapApi?.map?.getSource?.('grid-src'));
}

function recalc() {
  if (!mapLoaded(dashboardMap)) return;

  const dashboardGridIds = dashboardMap.visibleGridIds();
  const dashboardMetrics = cellMetrics(dashboardGridIds);
  const dashboardMapMetrics = new Map(dashboardMetrics.map((m) => [m.grid_id, m]));
  const dashboardCells = dashboardMap.render(dashboardMapMetrics, getState().selectedGridId) || [];

  if (mapLoaded(requestMap)) {
    const requestGridIds = requestMap.visibleGridIds();
    const requestMetrics = cellMetrics(requestGridIds);
    const requestMapMetrics = new Map(requestMetrics.map((m) => [m.grid_id, m]));
    requestMap.render(requestMapMetrics, getState().selectedGridId);
  }

  const priority = [...dashboardCells].sort((a, b) => b.priority - a.priority);

  render({
    selectedGridId: getState().selectedGridId,
    demoMode: getState().demoMode,
    firestoreUnavailable: getState().firestoreUnavailable,
    kpis: kpis(),
    priority,
    onPickGrid: (gridId) => {
      setSelectedGrid(gridId);
      dashboardMap.focusGrid(gridId);
      if (mapLoaded(requestMap)) requestMap.focusGrid(gridId);
    },
    onSaveCapacity: async (value) => {
      const gridId = getState().selectedGridId;
      if (!gridId) {
        toast('Select a grid cell first.');
        return;
      }
      await saveCapacity({ grid_id: gridId, capacity_score: value });
      toast('Capacity saved. Priority reordered.');
    }
  });
}

function startMaps() {
  dashboardMap = createGridMap({
    containerId: 'mapDashboard',
    onSelectGrid: (gridId) => setSelectedGrid(gridId)
  });

  requestMap = createGridMap({
    containerId: 'mapRequest',
    onSelectGrid: (gridId) => setSelectedGrid(gridId)
  });

  dashboardMap.map.on('load', () => recalc());
  dashboardMap.map.on('moveend', recalc);

  requestMap.map.on('load', () => recalc());
  requestMap.map.on('moveend', recalc);

  window.__mapDbg = { dashboard: dashboardMap.map, request: requestMap.map };
}

async function boot() {
  initUI({
    onSelectCategory: (category) => setSelectedCategory(category),
    onOpenLog: () => {
      if (!getState().selectedGridId) {
        toast('Select a grid cell first.');
        return;
      }
      document.getElementById('logDialog').showModal();
    },
    onSaveLog: async (event) => {
      event.preventDefault();
      const gridId = getState().selectedGridId;
      if (!gridId) {
        toast('Select a grid cell first.');
        return;
      }
      await saveOutreachLog({
        grid_id: gridId,
        action: document.getElementById('logAction').value,
        outcome: document.getElementById('logOutcome').value
      });
      document.getElementById('logDialog').close();
      toast('Outreach log saved. KPI updated.');
    },
    onSubmitRequest: async () => {
      const state = getState();
      try {
        await submitSignal({
          category: state.selectedCategory,
          grid_id: state.selectedGridId,
          source_type: 'public'
        });
        requestFeedback('Request submitted successfully.');
        switchToDashboard();
        toast('Request saved. Demand and priority updated.');
      } catch (error) {
        requestFeedback(error.message, false);
      }
    },
    onLoadDemoData: () => {
      seedDemoData();
      toast('Demo data loaded (demo-only).');
    },
    onFocusSelection: () => {
      if (!getState().selectedGridId) {
        toast('No selected grid yet. Tap a cell first.');
        return;
      }
      dashboardMap.focusGrid(getState().selectedGridId);
    }
  });

  startMaps();
  await initStore();


  setTimeout(() => {
    const st = getState();
    if (!st.signals.length && !st.resources.length) {
      seedDemoData();
      toast('Demo data auto-loaded for first-run walkthrough.');
    }
  }, 2500);

  window.addEventListener('screenchange', (ev) => {
    const id = ev.detail?.screenId;
    if (id === 'requestScreen' && requestMap?.map) {
      requestMap.map.resize();
      recalc();
    }
    if (id === 'dashboardScreen' && dashboardMap?.map) {
      dashboardMap.map.resize();
      recalc();
    }
  });

  subscribe((state) => {
    if (state.demoMode && state.signals.length < 10) seedDemoData();
    recalc();
  });
import { createMap } from './map.js';
import { initStore, subscribe, setSelectedCategory, setSelectedGrid, submitSignal, upsertCapacity, saveOutreachLog, computeKPIs, buildCellMetrics, getState } from './store.js';
import { initUI, render, toast, requestFeedback } from './ui.js';

let mapApi;
let lastVisible = [];

function recalcAndRender() {
  if (!mapApi?.map?.loaded()) return;
  const gridIds = mapApi.renderGrid(new Map())?.map((c) => c.grid_id) ?? [];
  const metrics = buildCellMetrics(gridIds);
  const metricMap = new Map(metrics.map((m) => [m.grid_id, m]));
  lastVisible = mapApi.renderGrid(metricMap) || [];

  const priority = [...lastVisible].sort((a, b) => b.priority - a.priority);
  const kpis = computeKPIs();

  render({
    priority,
    kpis,
    selectedGridId: getState().selectedGridId,
    demoMode: getState().demoMode,
    onPickGrid: (g) => { setSelectedGrid(g); mapApi.jumpToGrid(g); },
    onCapacityChange: async (v) => {
      if (!getState().selectedGridId) return;
      await upsertCapacity({ grid_id: getState().selectedGridId, capacity: v });
      toast('Capacity updated, priorities reordered');
    }
  });
}

async function boot() {
  initUI({
    onRefresh: () => recalcAndRender(),
    onSelectCategory: (c) => setSelectedCategory(c),
    onSubmitRequest: async () => {
      try {
        const s = getState();
        await submitSignal({ category: s.selectedCategory, grid_id: s.selectedGridId, source_type: 'public' });
        requestFeedback('Request submitted. Demand and priority updated.');
        toast('Signal saved');
      } catch (e) {
        requestFeedback(e.message, false);
      }
    },
    onSaveLog: async (ev) => {
      ev.preventDefault();
      const s = getState();
      await saveOutreachLog({ grid_id: s.selectedGridId, action: document.getElementById('logAction').value, outcome: document.getElementById('logOutcome').value });
      toast('Outreach log saved, KPI refreshed');
      document.getElementById('logDialog').close();
    }
  });

  mapApi = createMap({ onCellSelect: (gridId) => setSelectedGrid(gridId) });
  mapApi.map.on('load', recalcAndRender);
  mapApi.map.on('moveend', recalcAndRender);

  await initStore();
  subscribe(() => recalcAndRender());
}

boot();
