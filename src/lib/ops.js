// Pure mutations on a draft (deep-copied) state. Use via mutate((d) => ops.x(d, ...)).
import { uid } from './time';

export const ensureDay = (d, key) => {
  if (!d.days[key]) d.days[key] = { foods: [], water: [], supps: {}, done: {}, steps: null };
  const day = d.days[key];
  day.foods ||= [];
  day.water ||= [];
  day.supps ||= {};
  day.done ||= {};
  return day;
};

export function logFood(d, key, item, at = Date.now()) {
  const day = ensureDay(d, key);
  const entry = {
    id: item.id || uid(),
    name: item.name,
    qty: item.qty ?? 1,
    unit: item.unit || 'serving',
    kcal: Number(item.kcal) || 0,
    p: Number(item.p) || 0,
    c: Number(item.c) || 0,
    f: Number(item.f) || 0,
    presetId: item.presetId || null,
    at: item.at || at,
  };
  const i = day.foods.findIndex((f) => f.id === entry.id);
  if (i >= 0) day.foods[i] = entry;
  else day.foods.push(entry);
  return entry;
}

export function logPreset(d, key, preset, entryId, at) {
  const entry = logFood(d, key, { ...preset, id: entryId, presetId: preset.id, at });
  if (preset.supplementId) setSupp(d, key, preset.supplementId, true);
  return entry;
}

export function removeFood(d, key, id) {
  const day = ensureDay(d, key);
  day.foods = day.foods.filter((f) => f.id !== id);
}

export function addWater(d, key, ml, id = uid(), at = Date.now()) {
  ensureDay(d, key).water.push({ id, ml: Number(ml), at });
}

export function removeWater(d, key, id) {
  const day = ensureDay(d, key);
  day.water = day.water.filter((w) => w.id !== id);
}

/** Tick/untick a supplement. If you track stock, each tick uses one dose and an untick gives it back. */
export function setSupp(d, key, suppId, val) {
  const day = ensureDay(d, key);
  const was = !!day.supps[suppId];
  day.supps[suppId] = !!val;
  const s = (d.supplements || []).find((x) => x.id === suppId);
  if (s && s.stock != null && s.stock !== '' && was !== !!val) {
    const per = Number(s.perDose) || 1;
    s.stock = Math.max(0, Math.round((Number(s.stock) + (val ? -per : per)) * 100) / 100);
  }
}

export const outOfStock = (d, suppId) => {
  const s = (d.supplements || []).find((x) => x.id === suppId);
  return !!s && s.stock !== null && s.stock !== undefined && s.stock !== '' && Number(s.stock) <= 0;
};

export function markDone(d, key, okey, val = true) {
  const day = ensureDay(d, key);
  if (val) day.done[okey] = true;
  else delete day.done[okey];
}

/** Run a reminder's linked quick actions (log preset, add water, tick supplements). */
export function runReminderActions(d, key, reminder, okey) {
  const a = reminder.actions || {};
  for (const pid of a.presetIds || []) {
    const p = d.presets.find((x) => x.id === pid);
    if (p) logPreset(d, key, p);
  }
  if (a.waterMl) addWater(d, key, a.waterMl);
  for (const sid of a.supplementIds || []) if (!outOfStock(d, sid)) setSupp(d, key, sid, true);
  if (okey) markDone(d, key, okey);
}

export function snooze(d, reminderId, okey, minutes = 10) {
  d.meta.snoozes = (d.meta.snoozes || []).filter((z) => z.at > Date.now() - 3600e3);
  d.meta.snoozes.push({ id: reminderId, okey, at: Date.now() + minutes * 60e3 });
}

export const BODY_FIELDS = ['weight', 'waist', 'chest', 'arm'];

/** Upsert a body entry. Lengths are stored in cm; blank fields keep what's already there. */
export function upsertBody(d, entry) {
  const i = d.body.findIndex((b) => b.date === entry.date);
  const clean = { date: entry.date };
  for (const f of BODY_FIELDS) {
    const v = entry[f];
    if (v !== '' && v != null && !Number.isNaN(Number(v))) clean[f] = Number(v);
  }
  if (i >= 0) d.body[i] = { ...d.body[i], ...clean };
  else d.body.push(clean);
  d.body.sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = [...d.body].reverse().find((b) => b.weight);
  if (latest) d.profile.weightKg = latest.weight;
}

export function removeBody(d, date) {
  d.body = d.body.filter((b) => b.date !== date);
}

export function setSleep(d, key, sleep) {
  ensureDay(d, key).sleep = sleep && sleep.hours != null ? sleep : null;
}

export function setSteps(d, key, steps) {
  ensureDay(d, key).steps = steps === '' || steps == null ? null : Math.max(0, Math.round(Number(steps)));
}

/** Coach-suggested calorie change: protein stays fixed, carbs absorb the difference. */
export function applyKcalDelta(d, delta) {
  d.targets.kcal = Math.max(1200, Math.round(d.targets.kcal + delta));
  d.targets.c = Math.max(50, Math.round(d.targets.c + delta / 4));
}
