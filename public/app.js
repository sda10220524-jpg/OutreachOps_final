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
