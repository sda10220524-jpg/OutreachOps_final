import { getState } from './store.js';

const categories = ['medical', 'food', 'shelter', 'mental_health'];
let lastKpis = { backlog: null, avgResponse: null };

export function initUI(handlers) {
  const navButtons = [...document.querySelectorAll('.bottom-nav button')];
  navButtons.forEach((btn) => btn.addEventListener('click', () => showScreen(btn.dataset.screen)));

  const tabButtons = [...document.querySelectorAll('.tabs button')];
  tabButtons.forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

  const categoryRoot = document.getElementById('requestCategories');
  categories.forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = name;
    btn.addEventListener('click', () => handlers.onSelectCategory(name));
    categoryRoot.appendChild(btn);
  });

  document.getElementById('requestFab').onclick = () => showScreen('requestScreen');
  document.getElementById('logFab').onclick = handlers.onOpenLog;
  document.getElementById('cancelRequest').onclick = () => showScreen('dashboardScreen');
  document.getElementById('submitRequest').onclick = handlers.onSubmitRequest;
  document.getElementById('saveLog').onclick = handlers.onSaveLog;
  document.getElementById('requestSafetyCheck').addEventListener('change', updateActionLocks);
  document.getElementById('logSafetyCheck').addEventListener('change', updateActionLocks);
  document.getElementById('selectedChip').onclick = handlers.onFocusSelection;
  document.getElementById('infoBtn').onclick = () => document.getElementById('infoDialog').showModal();
  document.getElementById('sheetToggle').onclick = () => document.getElementById('bottomSheet').classList.toggle('collapsed');
  document.getElementById('loadDemoBtn').onclick = handlers.onLoadDemoData;

  document.getElementById('logDialog').addEventListener('close', () => {
    document.getElementById('logSafetyCheck').checked = false;
    updateActionLocks();
  });

  updateActionLocks();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === screenId));
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === screenId));
  window.dispatchEvent(new CustomEvent('screenchange', { detail: { screenId } }));
}

function activateTab(tab) {
  document.querySelectorAll('.tabs button').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.toggle('active', el.id === `tab${tab[0].toUpperCase()}${tab.slice(1)}`));
}

function shortGridLabel(gridId) {
  if (!gridId) return 'none';
  const m = /^z(\d+)_x(\d+)_y(\d+)$/.exec(gridId);
  if (!m) return gridId;
  return `z${m[1]} x${m[2]} y${m[3]}`;
}

export function render(view) {
  const { selectedGridId } = getState();

  document.getElementById('modeChip').textContent = view.demoMode ? 'DEMO MODE' : 'LIVE';
  document.getElementById('offlineBanner').classList.toggle('hidden', !view.firestoreUnavailable);

  document.getElementById('selectedChip').textContent = `Selected: ${selectedGridId || 'none'}`;
  document.getElementById('requestSelectedChip').textContent = `Selected: ${selectedGridId || 'none'}`;
  document.getElementById('logGridLabel').textContent = selectedGridId ? `Grid: ${selectedGridId}` : 'Select a grid cell first.';

  paintKpi('kpiBacklog', String(view.kpis.backlog), lastKpis.backlog !== null && String(lastKpis.backlog) !== String(view.kpis.backlog));
  paintKpi('kpiResponse', String(view.kpis.avgResponse), lastKpis.avgResponse !== null && String(lastKpis.avgResponse) !== String(view.kpis.avgResponse));
  lastKpis = { ...view.kpis };

  const list = document.getElementById('priorityList');
  list.innerHTML = '';
  view.priority.forEach((row, idx) => {
    const li = document.createElement('li');
    li.classList.toggle('active', row.grid_id === selectedGridId);
    li.innerHTML = `
      <strong>${idx + 1}. ${shortGridLabel(row.grid_id)}</strong>
      <div class="row-chips">
        <span class="chip">P ${row.priority.toFixed(2)}</span>
        <span class="chip">Demand ${row.demand.toFixed(2)} (weighted)</span>
        <span class="chip">Capacity ${row.capacity}</span>
        <span class="chip">${row.level}</span>
        ${row.anomaly ? '<span class="chip">⚠ spike</span>' : ''}
      </div>`;
    li.onclick = () => view.onPickGrid(row.grid_id);
    if (idx < 3) {
      li.classList.add('flash');
      setTimeout(() => li.classList.remove('flash'), 420);
    }
    list.appendChild(li);
  });

  renderResourceEditor(view);
  syncSelectedCategory();
  updateActionLocks();
}

function paintKpi(id, value, changed) {
  const el = document.getElementById(id);
  el.textContent = value;
  if (changed) {
    const card = el.closest('article');
    card.classList.remove('kpi-flash');
    void card.offsetWidth;
    card.classList.add('kpi-flash');
  }
}

function renderResourceEditor(view) {
  const root = document.getElementById('resourceEditor');
  if (!view.selectedGridId) {
    root.innerHTML = '<p>Select a grid cell first.</p><button disabled>Save capacity</button>';
    return;
  }

  const row = view.priority.find((r) => r.grid_id === view.selectedGridId);
  const cap = row?.capacity ?? 1;

  root.innerHTML = `
    <p><strong>${view.selectedGridId}</strong></p>
    <input id="capacityRange" type="range" min="0" max="5" step="0.5" value="${cap}" />
    <p>Capacity score: <span id="capacityValue">${cap}</span></p>
    <button id="saveCapacityBtn" type="button">Save capacity</button>
  `;

  const range = document.getElementById('capacityRange');
  range.oninput = () => { document.getElementById('capacityValue').textContent = range.value; };
  document.getElementById('saveCapacityBtn').onclick = () => view.onSaveCapacity(Number(range.value));
}

function syncSelectedCategory() {
  const { selectedCategory } = getState();
  document.querySelectorAll('#requestCategories button').forEach((btn) => {
    btn.classList.toggle('active', btn.textContent === selectedCategory);
  });
}

function updateActionLocks() {
  const state = getState();
  document.getElementById('submitRequest').disabled = !(state.selectedCategory && state.selectedGridId && document.getElementById('requestSafetyCheck').checked);
  document.getElementById('saveLog').disabled = !(state.selectedGridId && document.getElementById('logSafetyCheck').checked);
}

export function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 1500);
}

export function requestFeedback(message, ok = true) {
  const node = document.getElementById('requestFeedback');
  node.textContent = message;
  node.style.color = ok ? '#9ee8bd' : '#ff9f9f';
}

export function switchToDashboard() {
  showScreen('dashboardScreen');
}
