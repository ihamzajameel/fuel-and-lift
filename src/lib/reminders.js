import { addDays, dayKey, fromMin, parseYmd, toMin } from './time';
import { dayTotals, fmtL, waterPaceTarget } from './nutrition';

/** All clock times a reminder fires at, in logical-day order. */
export function slotTimes(rem, startHour = 4) {
  if (rem.kind !== 'interval') return [rem.time];
  const base = startHour * 60;
  const rel = (t) => (toMin(t) - base + 1440) % 1440;
  const s = rel(rem.start);
  const e = rel(rem.end);
  const every = Math.max(15, Number(rem.every) || 90);
  const out = [];
  for (let m = s; m <= e && out.length < 96; m += every) out.push(fromMin(m + base));
  return out;
}

/** Real timestamp of a reminder time on a logical day (after-midnight times land on the next calendar date). */
export function occurrenceAt(key, hhmm, startHour = 4) {
  const d = parseYmd(key);
  const min = toMin(hhmm);
  if (min < startHour * 60) d.setDate(d.getDate() + 1);
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.getTime();
}

export function occurrencesForDay(rem, key, startHour = 4, includeDisabled = false) {
  if (!rem.enabled && !includeDisabled) return [];
  if (rem.days?.length && !rem.days.includes(parseYmd(key).getDay())) return [];
  return slotTimes(rem, startHour).map((t) => ({
    okey: `${rem.id}@${key}@${t}`,
    id: rem.id,
    dayKey: key,
    time: t,
    at: occurrenceAt(key, t, startHour),
  }));
}

export function dueBetween(reminders, fromMs, toMs, startHour = 4) {
  const k1 = dayKey(new Date(fromMs), startHour);
  const k2 = dayKey(new Date(toMs), startHour);
  const keys = [k1];
  let k = k1;
  while (k < k2 && keys.length < 3) {
    k = addDays(k, 1);
    keys.push(k);
  }
  const out = [];
  for (const key of keys)
    for (const r of reminders) for (const o of occurrencesForDay(r, key, startHour)) if (o.at > fromMs && o.at <= toMs) out.push(o);
  return out.sort((a, b) => a.at - b.at);
}

export function dayTimeline(reminders, key, startHour = 4) {
  return reminders.flatMap((r) => occurrencesForDay(r, key, startHour)).sort((a, b) => a.at - b.at);
}

export function nextOccurrence(reminders, nowMs, startHour = 4) {
  const today = dayKey(new Date(nowMs), startHour);
  for (const key of [today, addDays(today, 1)]) {
    const next = dayTimeline(reminders, key, startHour).find((o) => o.at > nowMs);
    if (next) return next;
  }
  return null;
}

/** Title/body for a firing reminder; hydration reminders include live pacing numbers. */
export function reminderContent(rem, state, nowMs = Date.now()) {
  if (rem.dynamic === 'water') {
    const start = state.settings.dayStartHour;
    const key = dayKey(new Date(nowMs), start);
    const drank = dayTotals(state.days[key]).water;
    const pace = waterPaceTarget(new Date(nowMs), state.targets, start);
    const behind = pace - drank;
    const ask = behind > 250 ? Math.min(400, Math.ceil(behind / 50) * 50) : 250;
    return {
      title: rem.title,
      body: `Sip ${ask} ml. You're at ${fmtL(drank)} of ${fmtL(state.targets.water)}; pace target is ${fmtL(pace)} by now.`,
      ask,
    };
  }
  return { title: rem.title, body: rem.body };
}

/** Is this reminder occurrence already satisfied by what's been logged? */
export function isOccurrenceDone(rem, occ, state) {
  const day = state.days[occ.dayKey];
  if (!day) return false;
  if (day.done?.[occ.okey]) return true;
  const a = rem.actions || {};
  if (a.presetIds?.length && (day.foods || []).some((f) => a.presetIds.includes(f.presetId))) return true;
  if (!a.presetIds?.length && a.supplementIds?.length && a.supplementIds.every((s) => day.supps?.[s])) return true;
  if (a.openTab === 'train' && state.sessions.some((s) => s.date === occ.dayKey && !s.rest)) return true;
  if (a.choosePresetIds?.length && !a.supplementIds?.length && (day.foods || []).some((f) => a.choosePresetIds.includes(f.presetId))) return true;
  return false;
}

export const describeActions = (rem, presets, supplements) => {
  const a = rem.actions || {};
  const parts = [];
  for (const id of a.presetIds || []) {
    const p = presets.find((x) => x.id === id);
    if (p) parts.push(p.name);
  }
  if (a.waterMl) parts.push(`${a.waterMl} ml water`);
  for (const id of a.supplementIds || []) {
    const s = supplements?.find((x) => x.id === id);
    if (s && s.stock != null && s.stock !== '' && Number(s.stock) <= 0) continue;
    parts.push(s ? s.name : id);
  }
  return parts;
};
