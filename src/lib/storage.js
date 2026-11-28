import { applyPlanV2, applyPlanV3, applyPlanV4, applyPlanV5, applyPlanV6, ensureWeeklySplit, makeDefaultState } from './defaults';
import { dayKey } from './time';

export const STORAGE_KEY = 'fuel-lift:v1';

export function migrate(raw) {
  const d = makeDefaultState();
  const s = raw && typeof raw === 'object' ? raw : {};
  const plan = Number(s.meta?.plan) || 1;
  const out = {
    ...d,
    ...s,
    profile: { ...d.profile, ...(s.profile || {}) },
    targets: { ...d.targets, ...(s.targets || {}) },
    settings: { ...d.settings, ...(s.settings || {}) },
    meta: { ...d.meta, ...(s.meta || {}) },
    program: s.program && Array.isArray(s.program.days) ? s.program : d.program,
    supplements: Array.isArray(s.supplements) ? s.supplements : d.supplements,
    presets: Array.isArray(s.presets) ? s.presets : d.presets,
    reminders: Array.isArray(s.reminders) ? s.reminders : d.reminders,
    sessions: Array.isArray(s.sessions) ? s.sessions : [],
    body: Array.isArray(s.body) ? s.body : [],
    days: s.days && typeof s.days === 'object' ? s.days : {},
    version: d.version,
  };
  out.meta.plan = plan;
  if (plan < 2) {
    applyPlanV2(out, dayKey(new Date(), out.settings.dayStartHour));
    out.meta.planNotice = true;
  } else ensureWeeklySplit(out);
  if (out.meta.plan < 3) applyPlanV3(out);
  if (out.meta.plan < 4) applyPlanV4(out);
  if (out.meta.plan < 5) applyPlanV5(out);
  if (out.meta.plan < 6) applyPlanV6(out);
  return out;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return makeDefaultState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}

export function makeBackup(state) {
  return {
    app: 'fuel-lift',
    format: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

/** Accepts a wrapped backup or a raw state object. Throws a readable error. */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const data = obj && obj.app === 'fuel-lift' ? obj.data : obj;
  if (!data || typeof data !== 'object' || !('days' in data) || !('program' in data)) {
    throw new Error('This does not look like a Fuel & Lift backup.');
  }
  return migrate(data);
}
