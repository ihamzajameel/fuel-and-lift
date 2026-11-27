import { addDays, daysBetween, parseYmd, ymd } from './time';
import { dayTotals } from './nutrition';

const took = (days, key, id) => !!days[key]?.supps?.[id];

/** Consecutive days taken, ending today (or yesterday if today isn't ticked yet). */
export function currentStreak(days, suppId, today) {
  let k = took(days, today, suppId) ? today : addDays(today, -1);
  let n = 0;
  while (took(days, k, suppId) && n < 5000) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export function bestStreak(days, suppId) {
  const keys = Object.keys(days)
    .filter((k) => took(days, k, suppId))
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export const lastNKeys = (today, n) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));

export function takenInLast(days, suppId, today, n) {
  return lastNKeys(today, n).filter((k) => took(days, k, suppId)).length;
}

/** Nutrition summary over the last n *completed* days that have any food logged. */
export function nutritionSummary(state, today, n = 7) {
  const keys = lastNKeys(addDays(today, -1), n);
  const rows = keys.map((k) => ({ key: k, ...dayTotals(state.days[k]) }));
  const logged = rows.filter((r) => r.kcal > 0 || r.water > 0);
  const avg = (f) => (logged.length ? Math.round(logged.reduce((a, r) => a + r[f], 0) / logged.length) : 0);
  const t = state.targets;
  return {
    rows,
    loggedDays: logged.length,
    avgKcal: avg('kcal'),
    avgP: avg('p'),
    avgWater: avg('water'),
    proteinHits: logged.filter((r) => r.p >= t.p * 0.95).length,
    waterHits: logged.filter((r) => r.water >= t.water * 0.95).length,
    kcalInRange: logged.filter((r) => r.kcal > 0 && Math.abs(r.kcal - t.kcal) <= t.kcal * 0.1).length,
  };
}

/** Monday-start week key for a date key */
export const weekStart = (key) => {
  const d = parseYmd(key);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ymd(d);
};

export function weeklyBody(body) {
  const map = new Map();
  for (const b of body) {
    const w = weekStart(b.date);
    if (!map.has(w)) map.set(w, { week: w, weights: [], waists: [] });
    const m = map.get(w);
    if (b.weight) m.weights.push(b.weight);
    if (b.waist) m.waists.push(b.waist);
  }
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  return [...map.values()]
    .map((m) => ({ week: m.week, weight: avg(m.weights), waist: avg(m.waists), n: Math.max(m.weights.length, m.waists.length) }))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}

/** Latest value and change vs the closest entry ~28 days earlier. */
export function trend(body, field) {
  const pts = body.filter((b) => b[field] != null);
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const first = pts[0];
  let ref = null;
  for (const p of pts) if (daysBetween(p.date, last.date) >= 21) ref = p;
  return {
    value: last[field],
    date: last.date,
    sinceStart: pts.length > 1 ? Math.round((last[field] - first[field]) * 10) / 10 : null,
    since4w: ref ? Math.round((last[field] - ref[field]) * 10) / 10 : null,
    startDate: first.date,
  };
}
