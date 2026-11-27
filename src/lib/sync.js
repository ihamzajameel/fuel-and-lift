// Sync with the Fuel & Lift Telegram bot (Railway).
// - The app pushes a snapshot (plan + today's progress) so the bot can send smart reminders.
// - The app pulls events (things logged from Telegram) and applies them idempotently.
import { useEffect, useMemo, useRef } from 'react';
import * as ops from './ops';
import { dayTotals } from './nutrition';
import { nextDayIndex, plannedSession } from './workout';

export const DEFAULT_BOT_URL = import.meta.env.VITE_BOT_URL || 'https://bot-production-7ba0497f.up.railway.app';

const KEY_STORE = 'fuel-lift:botKey'; // device key, kept out of JSON backups on purpose

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export function deviceKey() {
  let k = null;
  try {
    k = localStorage.getItem(KEY_STORE);
  } catch {
    /* ignore */
  }
  if (!/^[a-f0-9]{64}$/.test(k || '')) {
    k = hex(crypto.getRandomValues(new Uint8Array(32)));
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* ignore */
    }
  }
  return k;
}

const clean = (url) => String(url || '').trim().replace(/\/+$/, '');

export async function botApi(url, path, { method = 'GET', body, auth = true } = {}) {
  const r = await fetch(`${clean(url)}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: `Bearer ${deviceKey()}` } : {}) },
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let j = {};
  try {
    j = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, code: j.error });
  return j;
}

export const botInfo = (url) => botApi(url, '/api/info', { auth: false });
export const botStatus = (url) => botApi(url, '/api/status');
export function startPairing(url) {
  const code = hex(crypto.getRandomValues(new Uint8Array(8)));
  return botApi(url, '/api/pair', { method: 'POST', auth: false, body: { code, key: deviceKey() } });
}

/** What the bot needs: your plan and today's progress. No history, no body data. */
export function buildSnapshot(state, today) {
  const day = state.days[today] || {};
  const next = state.program.days[nextDayIndex(state.program, state.sessions, today)];
  const doneToday = [...state.sessions].reverse().find((s) => s.date === today && !s.rest);
  const tg = state.meta.tg || {};
  return {
    v: 1,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayStartHour: state.settings.dayStartHour,
    measureUnit: state.settings.measureUnit || 'in',
    goalType: state.profile.goalType,
    appUrl: location.origin + location.pathname,
    tgReminders: tg.reminders !== false,
    lastEventId: tg.lastEventId || 0,
    targets: state.targets,
    reminders: state.reminders.map(({ id, title, body, kind, time, start, end, every, enabled, days, icon, dynamic, actions }) => ({
      id,
      title,
      body,
      kind,
      time,
      start,
      end,
      every,
      enabled,
      days,
      icon,
      dynamic,
      actions,
    })),
    presets: state.presets.map(({ id, name, kcal, p, c, f, qty, unit, supplementId }) => ({ id, name, kcal, p, c, f, qty, unit, supplementId })),
    supplements: state.supplements.map(({ id, name, stock, stockUnit, lowAt }) => ({ id, name, stock: stock === '' || stock == null ? null : Number(stock), stockUnit, lowAt })),
    nextWorkout: doneToday ? `${doneToday.dayName} (done ✓)` : next ? `${next.name}${next.type === 'rest' ? ' (rest day)' : ''}` : null,
    today: {
      key: today,
      totals: dayTotals(day),
      presetIds: [...new Set((day.foods || []).map((f) => f.presetId).filter(Boolean))],
      supps: day.supps || {},
      done: Object.keys(day.done || {}),
      missed: Object.keys(day.missed || {}),
      trained: !!doneToday,
      steps: day.steps ?? null,
      sleep: day.sleep?.hours ?? null,
    },
  };
}

/** Apply Telegram events to a draft state. Idempotent: ids become `tg-<eventId>` and lastEventId only grows. */
export function applyEvents(d, events) {
  d.meta.tg ||= {};
  let last = d.meta.tg.lastEventId || 0;
  const sorted = [...events].sort((a, b) => a.id - b.id);
  const byId = new Map(sorted.map((e) => [e.id, e]));
  let n = 0;
  for (const e of sorted) {
    if (e.id <= last) continue;
    applyOne(d, e, byId);
    last = e.id;
    if (e.type !== 'done') n++;
  }
  d.meta.tg.lastEventId = last;
  return n;
}

function applyOne(d, e, byId) {
  const id = `tg-${e.id}`;
  const x = e.data || {};
  const day = e.day;
  switch (e.type) {
    case 'water':
      if (Number(x.ml) > 0) ops.addWater(d, day, Number(x.ml), id, e.at);
      break;
    case 'preset': {
      const p = d.presets.find((pr) => pr.id === x.presetId);
      if (p) ops.logPreset(d, day, p, id, e.at);
      else if (x.name) ops.logFood(d, day, { name: x.name, qty: x.qty ?? 1, unit: x.unit || 'serving', kcal: x.kcal, p: x.p, c: x.c, f: x.f, id, at: e.at });
      break;
    }
    case 'stock': {
      const s = d.supplements.find((y) => y.id === x.id);
      if (s) s.stock = Math.max(0, x.mode === 'set' ? Number(x.count) : (Number(s.stock) || 0) + Number(x.count));
      break;
    }
    case 'food':
      ops.logFood(d, day, { name: x.name || 'Quick add', qty: x.qty ?? 1, unit: x.unit || 'serving', kcal: x.kcal, p: x.p, c: x.c, f: x.f, id, at: e.at });
      break;
    case 'supp':
      ops.setSupp(d, day, x.id, x.value !== false);
      break;
    case 'done':
      ops.markDone(d, day, x.okey, true);
      break;
    case 'missed':
      ops.markMissed(d, day, x.okey, true);
      break;
    case 'body':
      ops.upsertBody(d, { date: day, weight: x.weight ?? '', waist: x.waist ?? '', chest: x.chest ?? '', arm: x.arm ?? '' });
      break;
    case 'workout': {
      // "gym done" from Telegram: record the day's planned workout as done (unless one is already logged).
      if (d.sessions.some((s) => s.date === day && !s.rest)) break;
      const pd = d.program.days[nextDayIndex(d.program, d.sessions, day)];
      if (!pd) break;
      if (pd.type === 'rest') {
        d.sessions.push({ id, dayId: pd.id, dayName: pd.name, date: day, rest: true, startedAt: e.at, finishedAt: e.at, exercises: [] });
        break;
      }
      const s = plannedSession(pd, d.sessions, day, e.at);
      s.id = id;
      d.sessions.push(s);
      break;
    }
    case 'sleep':
      ops.setSleep(d, day, { ...(d.days[day]?.sleep || {}), hours: Number(x.hours) });
      break;
    case 'steps':
      ops.setSteps(d, day, x.steps);
      break;
    case 'undo': {
      const ref = byId.get(x.ref) || x.refEvent;
      if (!ref) break;
      const rid = `tg-${ref.id}`;
      if (ref.type === 'water') ops.removeWater(d, ref.day, rid);
      else if (ref.type === 'preset' || ref.type === 'food') ops.removeFood(d, ref.day, rid);
      else if (ref.type === 'supp') ops.setSupp(d, ref.day, ref.data.id, false);
      else if (ref.type === 'done') ops.markDone(d, ref.day, ref.data.okey, false);
      else if (ref.type === 'missed') ops.markMissed(d, ref.day, ref.data.okey, false);
      else if (ref.type === 'sleep') ops.setSleep(d, ref.day, null);
      else if (ref.type === 'steps') ops.setSteps(d, ref.day, null);
      else if (ref.type === 'workout') d.sessions = d.sessions.filter((s) => s.id !== rid);
      break;
    }
    default:
      break;
  }
}

/** Keeps the bot and the app in step while the app is open. */
export function useBotSync({ state, mutate, today, latest, toast }) {
  const tg = state.meta.tg || {};
  const active = !!(tg.url && tg.paired);
  const url = tg.url;
  const pushed = useRef('');

  // Pull events logged from Telegram.
  useEffect(() => {
    if (!active) return;
    let busy = false;
    const pull = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const after = latest.current.meta.tg?.lastEventId || 0;
        const { events } = await botApi(url, `/api/events?after=${after}`);
        if (events?.length) {
          const n = events.filter((e) => e.id > after && e.type !== 'done').length;
          mutate((d) => {
            applyEvents(d, events);
          });
          if (n) toast(`Synced ${n} update${n > 1 ? 's' : ''} from Telegram`);
        }
      } catch (e) {
        if (e.status === 401) mutate((d) => (d.meta.tg = { ...d.meta.tg, paired: false }));
      } finally {
        busy = false;
      }
    };
    pull();
    const id = setInterval(pull, 20000);
    document.addEventListener('visibilitychange', pull);
    window.addEventListener('online', pull);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', pull);
      window.removeEventListener('online', pull);
    };
  }, [active, url, mutate, latest, toast]);

  // Push the plan + today's progress whenever it changes (debounced).
  const snap = useMemo(() => (active ? JSON.stringify(buildSnapshot(state, today)) : ''), [state, today, active]);
  useEffect(() => {
    if (!active || !snap || snap === pushed.current) return;
    const t = setTimeout(async () => {
      try {
        await botApi(url, '/api/state', { method: 'PUT', body: snap });
        pushed.current = snap;
      } catch {
        /* offline: retried on next change or reload */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [snap, active, url]);
}
