import { db, FS, ensureAnonAuth } from './firebase.js';
import { W_DAYS_MS, K_MIN } from './grid.js';

const listeners = new Set();
const state = {
  signals: [],
  resources: [],
  outreachLogs: [],
  demoMode: false,
  selectedGridId: null,
  selectedCategory: null,
  lastWriteAt: 0,
  spamPenaltyByGrid: new Map()
};

const sourceWeight = { org: 1.0, provider: 0.7, partner: 0.7, public: 0.2 };

function emit() { listeners.forEach((l) => l(getState())); }
export function subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); }
export function getState() { return { ...state }; }
export function setSelectedGrid(gridId) { state.selectedGridId = gridId; emit(); }
export function setSelectedCategory(category) { state.selectedCategory = category; emit(); }

export async function initStore() {
  await ensureAnonAuth();
  try {
    attachRealtime();
  } catch (e) {
    if (isOfflineLike(e)) enableDemoMode(); else throw e;
  }
}

function attachRealtime() {
  const c = FS.collection;
  FS.onSnapshot(c(db, 'signals'), (snap) => {
    state.signals = snap.docs.map((d) => ({ id: d.id, ...normalizeDoc(d.data()) }));
    emit();
  }, (e) => handleRealtimeError(e));
  FS.onSnapshot(c(db, 'resources'), (snap) => {
    state.resources = snap.docs.map((d) => ({ id: d.id, ...normalizeDoc(d.data()) }));
    emit();
  }, (e) => handleRealtimeError(e));
  FS.onSnapshot(c(db, 'outreachLogs'), (snap) => {
    state.outreachLogs = snap.docs.map((d) => ({ id: d.id, ...normalizeDoc(d.data()) }));
    emit();
  }, (e) => handleRealtimeError(e));
}

function handleRealtimeError(e) {
  if (isOfflineLike(e) && !state.demoMode) enableDemoMode();
  if (e?.code === 'permission-denied') throw e;
}

function normalizeDoc(doc) {
  const norm = { ...doc };
  ['created_at', 'updated_at'].forEach((k) => {
    if (norm[k]?.toDate) norm[k] = norm[k].toDate().toISOString();
  });
  return norm;
}

function isOfflineLike(err) {
  return ['unavailable', 'deadline-exceeded', 'resource-exhausted'].includes(err?.code) || !navigator.onLine;
}

function enableDemoMode() {
  state.demoMode = true;
  const now = Date.now();
  const demoGrids = ['z9_x225_y101', 'z9_x226_y101', 'z9_x225_y102'];
  state.signals = Array.from({ length: 24 }, (_, i) => ({
    id: `demo-s-${i}`,
    created_at: new Date(now - (i + 1) * 3600_000).toISOString(),
    source_type: i % 2 ? 'org' : 'public',
    category: ['medical', 'shelter', 'food'][i % 3],
    grid_id: demoGrids[i % demoGrids.length],
    status: 'open',
    weight: 1
  }));
  state.resources = demoGrids.map((gridId, idx) => ({ id:`demo-r-${idx}`, resource_id:gridId, resource_type:'capacity', availability_state:'manual', updated_at:new Date(now).toISOString(), capacity_score: idx + 1 }));
  state.outreachLogs = [];
  emit();
}

export async function submitSignal({ category, grid_id, source_type = 'public' }) {
  const now = Date.now();
  const delta = now - state.lastWriteAt;
  const rapid = delta < 3500;
  state.lastWriteAt = now;
  if (rapid) {
    const p = Math.min(0.5, (state.spamPenaltyByGrid.get(grid_id) || 0) + 0.15);
    state.spamPenaltyByGrid.set(grid_id, p);
  }
  if (rapid && delta < 1200) throw new Error('Rate limited: slow down repeated submissions.');

  const payload = { created_at: FS.serverTimestamp(), source_type, category, grid_id, status: 'open', weight: sourceWeight[source_type] || 0.2 };
  const ref = await FS.addDoc(FS.collection(db, 'signals'), payload);
  console.log('[FS WRITE OK] signals', ref.id);
}

export async function upsertCapacity({ grid_id, capacity }) {
  const ref = FS.doc(db, 'resources', grid_id);
  const payload = { resource_id: grid_id, resource_type: 'capacity', availability_state: 'manual', updated_at: FS.serverTimestamp(), capacity_score: capacity };
  await FS.setDoc(ref, payload, { merge: true });
  console.log('[FS WRITE OK] resources', grid_id);
}

export async function saveOutreachLog({ grid_id, action, outcome, mode = 'field' }) {
  const payload = { created_at: FS.serverTimestamp(), org_id: mode, grid_id, action, outcome };
  const ref = await FS.addDoc(FS.collection(db, 'outreachLogs'), payload);
  console.log('[FS WRITE OK] outreachLogs', ref.id);
}

export function buildCellMetrics(gridIds) {
  const cutoff = Date.now() - W_DAYS_MS;
  const map = new Map(gridIds.map((g) => [g, { grid_id: g, uniqueSignals: 0, demand: 0, capacity: 1, priority: 0, anomaly: false }]));

  const signalsW = state.signals.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  const signalsByGrid = new Map();
  signalsW.forEach((s) => {
    if (!signalsByGrid.has(s.grid_id)) signalsByGrid.set(s.grid_id, []);
    signalsByGrid.get(s.grid_id).push(s);
  });

  gridIds.forEach((gridId) => {
    const rec = map.get(gridId);
    const sigs = signalsByGrid.get(gridId) || [];
    const basePenalty = state.spamPenaltyByGrid.get(gridId) || 0;
    const spikePenalty = sigs.length > 20 ? 0.3 : sigs.length > 10 ? 0.15 : 0;
    const penalty = Math.min(0.5, basePenalty + spikePenalty);
    rec.anomaly = penalty > 0;
    rec.uniqueSignals = sigs.length;
    rec.demand = sigs.reduce((sum, s) => {
      const dtH = Math.max(0, (Date.now() - new Date(s.created_at).getTime()) / 3600000);
      const decay = Math.exp(-dtH / 24);
      const w = sourceWeight[s.source_type] ?? 0.2;
      return sum + (w * decay * (1 - penalty));
    }, 0);
    const res = state.resources.find((r) => r.resource_id === gridId && r.resource_type === 'capacity');
    rec.capacity = Number(res?.capacity_score ?? 1);
    rec.priority = rec.demand / (rec.capacity + 0.1);
    rec.dataInsufficient = rec.uniqueSignals < K_MIN;
  });

  return Array.from(map.values());
}

export function computeKPIs() {
  const cutoff = Date.now() - W_DAYS_MS;
  const signalsW = state.signals.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  const logsW = state.outreachLogs.filter((l) => new Date(l.created_at).getTime() >= cutoff);
  const firstLogByGrid = new Map();
  logsW.forEach((l) => {
    const t = new Date(l.created_at).getTime();
    const prev = firstLogByGrid.get(l.grid_id);
    if (!prev || t < prev) firstLogByGrid.set(l.grid_id, t);
  });

  let backlog = 0;
  let totalMin = 0;
  let count = 0;
  signalsW.forEach((s) => {
    const tSignal = new Date(s.created_at).getTime();
    const tLog = firstLogByGrid.get(s.grid_id);
    if (!tLog) backlog += 1;
    else if (tLog >= tSignal) {
      totalMin += (tLog - tSignal) / 60000;
      count += 1;
    }
  });
  return { backlog, avgResponse: count ? (totalMin / count).toFixed(1) : '0.0' };
}
