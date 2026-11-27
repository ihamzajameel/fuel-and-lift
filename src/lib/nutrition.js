import { minutesIntoDay, toMin } from './time';

export const UNITS = [
  { id: 'serving', label: 'serving' },
  { id: 'g', label: 'g' },
  { id: 'ml', label: 'ml' },
  { id: 'tbsp', label: '15 mL tbsp' },
  { id: 'tsp', label: '5 mL tsp' },
  { id: 'halftsp', label: '2.5 mL ½ tsp' },
  { id: 'cup', label: 'cup (240 mL)' },
  { id: 'scoop', label: 'scoop' },
  { id: 'piece', label: 'piece' },
];

const SHORT = { serving: 'serving', g: 'g', ml: 'ml', tbsp: '× 15 mL', tsp: '× 5 mL', halftsp: '× 2.5 mL', cup: 'cup', scoop: 'scoop', piece: 'pc' };

export const portionLabel = (qty, unit) => {
  if (!qty) return '';
  const q = Number(qty);
  const u = SHORT[unit] || unit;
  if (['serving', 'cup', 'scoop', 'pc'].includes(u)) return `${q} ${u}${q !== 1 ? 's' : ''}`;
  return `${q} ${u}`;
};

export const kcalFromMacros = (p, c, f) => Math.round((Number(p) || 0) * 4 + (Number(c) || 0) * 4 + (Number(f) || 0) * 9);

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function dayTotals(day) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, water: 0 };
  if (!day) return t;
  for (const f of day.foods || []) {
    t.kcal += Number(f.kcal) || 0;
    t.p += Number(f.p) || 0;
    t.c += Number(f.c) || 0;
    t.f += Number(f.f) || 0;
  }
  for (const w of day.water || []) t.water += Number(w.ml) || 0;
  t.kcal = Math.round(t.kcal);
  t.p = round1(t.p);
  t.c = round1(t.c);
  t.f = round1(t.f);
  return t;
}

/**
 * How much water you "should" have had by now, following the front-loaded plan:
 * 0 at waterStart -> frontPct% by waterFrontBy -> 100% by waterEnd.
 */
export function waterPaceTarget(date, targets, startHour = 4) {
  const rel = (t) => (toMin(t) - startHour * 60 + 1440) % 1440;
  const now = minutesIntoDay(date, startHour);
  const a = rel(targets.waterStart);
  const b = rel(targets.waterFrontBy);
  const c = rel(targets.waterEnd);
  const total = targets.water;
  const front = (total * targets.waterFrontPct) / 100;
  if (now <= a) return 0;
  if (now <= b) return Math.round((front * (now - a)) / Math.max(1, b - a));
  if (now <= c) return Math.round(front + ((total - front) * (now - b)) / Math.max(1, c - b));
  return total;
}

export function paceStatus(drank, pace) {
  const diff = drank - pace;
  if (pace === 0 && drank === 0) return { tone: 'muted', text: 'Starts with your morning 500 ml' };
  if (diff >= 300) return { tone: 'good', text: `${fmtMl(diff)} ahead of pace` };
  if (diff >= -100) return { tone: 'good', text: 'On pace' };
  return { tone: 'warn', text: `${fmtMl(-diff)} behind pace` };
}

export const fmtMl = (ml) => (Math.abs(ml) >= 1000 ? `${parseFloat((ml / 1000).toFixed(2))} L` : `${Math.round(ml / 10) * 10} ml`);
export const fmtL = (ml) => `${(ml / 1000).toFixed(ml % 100 === 0 ? 1 : 2)} L`;

/** Mifflin–St Jeor BMR and maintenance estimate, shown as a reference in Settings. */
export function energyEstimate(profile) {
  const { weightKg: w, heightCm: h, age: a, sex, activity } = profile;
  const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'female' ? -161 : 5);
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * (Number(activity) || 1.55)) };
}
