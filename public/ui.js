import { getState } from './store.js';

const categories = ['medical', 'food', 'shelter', 'mental_health'];

export function initUI(handlers) {
  const navBtns = [...document.querySelectorAll('.bottom-nav button')];
  navBtns.forEach((btn) => btn.addEventListener('click', () => showScreen(btn.dataset.screen)));

  const tabBtns = [...document.querySelectorAll('.tabs button')];
  tabBtns.forEach((btn) => btn.addEventListener('click', () => toggleTab(btn.dataset.tab)));

  document.getElementById('requestFab').onclick = () => showScreen('requestScreen');
  document.getElementById('logFab').onclick = () => document.getElementById('logDialog').showModal();
  document.getElementById('refreshBtn').onclick = handlers.onRefresh;

  const ctn = document.getElementById('requestCategories');
  categories.forEach((c) => {
    const b = document.createElement('button'); b.textContent = c; b.onclick = () => handlers.onSelectCategory(c);
    ctn.appendChild(b);
  });

  document.getElementById('requestSafetyCheck').addEventListener('change', () => refreshSubmitState());
  document.getElementById('logSafetyCheck').addEventListener('change', () => refreshSubmitState());
  document.getElementById('submitRequest').onclick = handlers.onSubmitRequest;
  document.getElementById('cancelRequest').onclick = () => showScreen('dashboardScreen');
  document.getElementById('saveLog').onclick = handlers.onSaveLog;

  document.getElementById('logDialog').addEventListener('close', () => {
    document.getElementById('logSafetyCheck').checked = false;
    refreshSubmitState();
  });

  refreshSubmitState();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === id));
}

function toggleTab(id) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab${id[0].toUpperCase()}${id.slice(1)}`));
}

export function render(stateView) {
  document.getElementById('kpiBacklog').textContent = stateView.kpis.backlog;
  document.getElementById('kpiResponse').textContent = stateView.kpis.avgResponse;
  document.getElementById('selectedGridPreview').textContent = stateView.selectedGridId || 'none';
  document.getElementById('modeChip').textContent = stateView.demoMode ? 'DEMO MODE' : 'LIVE';
  document.getElementById('logGridPreview').textContent = stateView.selectedGridId || 'none';

  const items = document.getElementById('priorityList');
  items.innerHTML = '';
  stateView.priority.forEach((p, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${idx + 1}. ${p.grid_id}</strong> ${p.anomaly ? '<span>⚠ spike</span>' : ''}<br>P ${p.priority.toFixed(2)} · Demand(weighted) ${p.demand.toFixed(2)} · Capacity ${p.capacity}${p.dataInsufficient ? ' · 데이터 부족' : ''}`;
    li.onclick = () => stateView.onPickGrid(p.grid_id);
    if (idx < 3) li.classList.add('flash');
    items.appendChild(li);
    setTimeout(() => li.classList.remove('flash'), 450);
  });

  renderResourceEditor(stateView);
  syncCategoryButtons();
  refreshSubmitState();
}

function renderResourceEditor(stateView) {
  const node = document.getElementById('resourceEditor');
  if (!stateView.selectedGridId) {
    node.textContent = 'Select a grid cell first.';
    return;
  }
  const selected = stateView.priority.find((p) => p.grid_id === stateView.selectedGridId);
  const val = selected?.capacity ?? 1;
  node.innerHTML = `<p>${stateView.selectedGridId}</p><input id="capacitySlider" type="range" min="0" max="5" step="0.5" value="${val}" /><p>Capacity: <span id="capacityValue">${val}</span></p>`;
  const slider = document.getElementById('capacitySlider');
  slider.oninput = () => document.getElementById('capacityValue').textContent = slider.value;
  slider.onchange = () => stateView.onCapacityChange(Number(slider.value));
}

function syncCategoryButtons() {
  const { selectedCategory } = getState();
  document.querySelectorAll('#requestCategories button').forEach((b) => b.classList.toggle('active', b.textContent === selectedCategory));
}

function refreshSubmitState() {
  const state = getState();
  document.getElementById('submitRequest').disabled = !(state.selectedCategory && state.selectedGridId && document.getElementById('requestSafetyCheck').checked);
  document.getElementById('saveLog').disabled = !(state.selectedGridId && document.getElementById('logSafetyCheck').checked);
}

export function toast(msg) {
  const node = document.getElementById('toast');
  node.textContent = msg;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 1500);
}

export function requestFeedback(msg, ok = true) {
  const n = document.getElementById('requestFeedback');
  n.textContent = msg;
  n.style.color = ok ? '#97e7ba' : '#ff9f9f';
}
