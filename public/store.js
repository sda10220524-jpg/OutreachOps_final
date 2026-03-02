import { db, FS, ensureAnonAuth } from './firebase.js';
import { K_ANON, W_DAYS_MS } from './grid.js';

const listeners = new Set();
const sourceWeights = { org: 1.0, provider: 0.7, partner: 0.7, public: 0.2 };

const state = {
  signals: [],
  resources: [],
  outreachLogs: [],
  selectedGridId: null,
  selectedCategory: null,
  demoMode: false,
  firestoreUnavailable: false,
  rateState: { lastSubmitMs: 0 },
  anomalyPenaltyByGrid: new Map()
};

export function subscribe(fn) {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(getState()));
}

export function getState() {
  return {
    ...state,
    anomalyPenaltyByGrid: new Map(state.anomalyPenaltyByGrid)
  };
}

export function setSelectedGrid(gridId) {
  state.selectedGridId = gridId;
  emit();
}

export function setSelectedCategory(category) {
  state.selectedCategory = category;
  emit();
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  return new Date(value).toISOString();
}

function normalizeDocs(snapshot) {
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      created_at: normalizeDate(data.created_at),
      updated_at: normalizeDate(data.updated_at)
    };
  });
}

function useDemoMode(reason) {
  state.firestoreUnavailable = true;
  state.demoMode = true;
  if (!state.signals.length) {
    seedDemoData();
  }
  console.warn('Firestore unavailable, using demo data:', reason?.code || reason?.message || reason);
  emit();
}

function isOfflineLike(error) {
  return ['unavailable', 'deadline-exceeded', 'resource-exhausted'].includes(error?.code);
}

function attachSnapshots() {
  FS.onSnapshot(FS.collection(db, 'signals'), (snap) => {
    state.signals = normalizeDocs(snap);
    emit();
  }, (error) => {
    if (error?.code === 'permission-denied') {
      console.error('permission-denied reading signals', error);
      return;
    }
    if (isOfflineLike(error)) useDemoMode(error);
  });

  FS.onSnapshot(FS.collection(db, 'resources'), (snap) => {
    state.resources = normalizeDocs(snap);
    emit();
  }, (error) => {
    if (error?.code === 'permission-denied') {
      console.error('permission-denied reading resources', error);
      return;
    }
    if (isOfflineLike(error)) useDemoMode(error);
  });

  FS.onSnapshot(FS.collection(db, 'outreachLogs'), (snap) => {
    state.outreachLogs = normalizeDocs(snap);
    emit();
  }, (error) => {
    if (error?.code === 'permission-denied') {
      console.error('permission-denied reading outreachLogs', error);
      return;
    }
    if (isOfflineLike(error)) useDemoMode(error);
  });
}

export async function initStore() {
  try {
    await ensureAnonAuth();
    attachSnapshots();
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.error('Auth permission denied', error);
      return;
    }
    useDemoMode(error);
  }
}

export function seedDemoData() {
  const now = Date.now();
  const cells = ['z9_x447_y202', 'z9_x448_y202', 'z9_x447_y203'];
  const signals = [];

  cells.forEach((gridId, idx) => {
    for (let i = 0; i < 12; i += 1) {
      const src = i % 3 === 0 ? 'org' : i % 3 === 1 ? 'provider' : 'public';
      signals.push({
        id: `demo-${idx}-${i}`,
        grid_id: gridId,
        category: ['medical', 'shelter', 'food'][i % 3],
        source_type: src,
        status: 'open',
        weight: sourceWeights[src],
        created_at: new Date(now - (idx * 12 + i) * 2 * 3600 * 1000).toISOString(),
        updated_at: new Date(now).toISOString()
      });
    }
  });

  state.signals = signals;
  state.resources = cells.map((grid_id, idx) => ({
    id: `demo-r-${idx}`,
    resource_id: grid_id,
    resource_type: 'capacity',
    availability_state: 'manual',
    capacity_score: idx + 1,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString()
  }));
  state.outreachLogs = [];
  state.demoMode = true;
  state.firestoreUnavailable = true;
  emit();
}

export async function submitSignal({ category, grid_id, source_type = 'public' }) {
  const now = Date.now();
  const dt = now - state.rateState.lastSubmitMs;
  state.rateState.lastSubmitMs = now;

  if (dt < 1000) {
    throw new Error('Rate limited. Please wait a second and try again.');
  }

  if (dt < 3500) {
    const penalty = Math.min(0.5, (state.anomalyPenaltyByGrid.get(grid_id) || 0) + 0.15);
    state.anomalyPenaltyByGrid.set(grid_id, penalty);
    emit();
  }

  const payload = {
    created_at: FS.serverTimestamp(),
    source_type,
    category,
    grid_id,
    status: 'open',
    weight: sourceWeights[source_type] || 0.2
  };

  const ref = await FS.addDoc(FS.collection(db, 'signals'), payload);
  console.log('[FS WRITE OK] signals', ref.id);

  if (state.demoMode) {
    state.signals.push({ id: ref.id, ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    emit();
  }
}

export async function saveCapacity({ grid_id, capacity_score }) {
  const ref = FS.doc(db, 'resources', grid_id);
  const payload = {
    resource_id: grid_id,
    resource_type: 'capacity',
    availability_state: 'manual',
    updated_at: FS.serverTimestamp(),
    capacity_score
  };
  await FS.setDoc(ref, payload, { merge: true });
  console.log('[FS WRITE OK] resources', grid_id);

  if (state.demoMode) {
    const found = state.resources.find((r) => r.resource_id === grid_id);
    if (found) found.capacity_score = capacity_score;
    else state.resources.push({ id: grid_id, ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    emit();
  }
}

export async function saveOutreachLog({ grid_id, action, outcome, mode = 'field' }) {
  const payload = {
    created_at: FS.serverTimestamp(),
    org_id: mode,
    grid_id,
    action,
    outcome
  };
  const ref = await FS.addDoc(FS.collection(db, 'outreachLogs'), payload);
  console.log('[FS WRITE OK] outreachLogs', ref.id);

  if (state.demoMode) {
    state.outreachLogs.push({ id: ref.id, ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    emit();
  }
}

export function cellMetrics(gridIds) {
  const cutoff = Date.now() - W_DAYS_MS;
  const inWindow = state.signals.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  const byGrid = new Map();

  inWindow.forEach((s) => {
    if (!byGrid.has(s.grid_id)) byGrid.set(s.grid_id, []);
    byGrid.get(s.grid_id).push(s);
  });

  return gridIds.map((grid_id) => {
    const signals = byGrid.get(grid_id) || [];
    const rapidPenalty = state.anomalyPenaltyByGrid.get(grid_id) || 0;
    const spikePenalty = signals.length >= 20 ? 0.3 : signals.length >= 14 ? 0.15 : 0;
    const beta = Math.min(0.5, rapidPenalty + spikePenalty);

    const demand = signals.reduce((sum, s) => {
      const h = Math.max(0, (Date.now() - new Date(s.created_at).getTime()) / 3600000);
      const decay = Math.exp(-h / 24);
      const w = sourceWeights[s.source_type] ?? 0.2;
      return sum + (w * decay * (1 - beta));
    }, 0);

    const res = state.resources.find((r) => r.resource_id === grid_id && r.resource_type === 'capacity');
    const capacity = Number(res?.capacity_score ?? 1);
    const uniqueSignals = signals.length;
    const priority = demand / (capacity + 0.1);

    return {
      grid_id,
      uniqueSignals,
      demand,
      capacity,
      priority,
      dataInsufficient: uniqueSignals < K_ANON,
      anomaly: beta > 0
    };
  });
}

export function kpis() {
  const cutoff = Date.now() - W_DAYS_MS;
  const signals = state.signals.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  const logs = state.outreachLogs.filter((l) => new Date(l.created_at).getTime() >= cutoff);

  const firstLogByGrid = new Map();
  logs.forEach((l) => {
    const ts = new Date(l.created_at).getTime();
    const prev = firstLogByGrid.get(l.grid_id);
    if (!prev || ts < prev) firstLogByGrid.set(l.grid_id, ts);
  });

  let backlog = 0;
  let totalMin = 0;
  let counted = 0;

  signals.forEach((s) => {
    const signalTs = new Date(s.created_at).getTime();
    const firstLog = firstLogByGrid.get(s.grid_id);
    if (!firstLog) {
      backlog += 1;
      return;
    }
    if (firstLog >= signalTs) {
      totalMin += (firstLog - signalTs) / 60000;
      counted += 1;
    }
  });

  return {
    backlog,
    avgResponse: counted ? (totalMin / counted).toFixed(1) : '0.0'
  };
}
