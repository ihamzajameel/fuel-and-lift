// Sync with the Fuel & Lift Telegram bot (Railway).
// - The app pushes a snapshot (plan + today's progress) so the bot can send smart reminders.
// - The app pulls events (things logged from Telegram) and applies them idempotently.
import { useEffect, useMemo, useRef } from 'react';
import * as ops from './ops';
import { dayTotals } from './nutrition';
import { nextDayIndex, plannedSession } from './workout';
import { cloneProgram } from './defaults';
import { mergeState, sameContent, stampChanges, summarize } from './merge';

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

// ---- Phone notifications (Web Push via the bot) ----
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
export async function enablePush(url) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error("This browser doesn't support phone notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked for Fuel & Lift. Allow them in your phone settings, then try again.');
  const reg = await navigator.serviceWorker.ready;
  const { vapidPublicKey } = await botInfo(url);
  if (!vapidPublicKey) throw new Error('The bot server is not ready for notifications yet.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) });
  await botApi(url, '/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
}
export async function disablePush(url) {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  await botApi(url, '/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** What the bot needs: your plan and today's progress. No history, no body data. */
export function buildSnapshot(state, today) {
  const day = state.days[today] || {};
  const next = state.program.days[nextDayIndex(state.program, state.sessions, today)];
  const doneToday = [...state.sessions].reverse().find((s) => s.date === today && !s.rest);
  const tg = state.meta.tg || {};
  return {
    v: 4, // app build understands: stock packSize/since, missed, program.applySplit, sleep bed/wake
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayStartHour: state.settings.dayStartHour,
    measureUnit: state.settings.measureUnit || 'in',
    sleepPlan: { bed: state.profile.bedTime || '02:00', wake: state.profile.wakeTime || '10:10', hours: state.targets.sleepHours },
    goalType: state.profile.goalType,
    appUrl: location.origin + location.pathname,
    tgReminders: tg.reminders !== false,
    pushReminders: !!state.meta.push?.enabled,
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
    program: {
      template: state.program.template ?? null,
      mode: state.program.mode || 'rotation',
      active: state.activeSession ? { dayName: state.activeSession.dayName, doneSets: state.activeSession.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0) } : null,
    },
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
    case 'program': {
      // Owner request: move to the Mon–Sat weekday split now. An open workout with ticked sets is saved first.
      if (x.action !== 'applySplit') break;
      const s = d.activeSession;
      if (s) {
        const exercises = s.exercises.map((ex) => ({ ...ex, sets: ex.sets.filter((y) => y.done) })).filter((ex) => ex.sets.length);
        if (exercises.length) d.sessions.push({ ...s, finishedAt: e.at, exercises });
        d.activeSession = null;
      }
      d.program = cloneProgram(6);
      d.meta.splitApplied = true;
      break;
    }
    case 'stock': {
      const s = d.supplements.find((y) => y.id === x.id);
      if (s) {
        if (x.count != null) s.stock = Math.max(0, x.mode === 'set' ? Number(x.count) : (Number(s.stock) || 0) + Number(x.count));
        if (x.packSize) s.packSize = Number(x.packSize);
        if (x.since) s.since = x.since;
      }
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
    case 'sleep': {
      const prev = d.days[day]?.sleep || {};
      // A change made in the app after this event was sent wins (e.g. "as usual" tapped, then corrected).
      if ((prev.at || 0) > (e.at || 0)) break;
      ops.setSleep(d, day, { ...prev, hours: Number(x.hours), bed: x.bed ?? prev.bed, wake: x.wake ?? prev.wake, at: e.at || Date.now() });
      break;
    }
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

// ---------------------------------------------------------------- cross-device sync
const BASE_KEY = 'fuel-lift:syncBase'; // { rev, sum }: what the server holds, as hashes + ids
const STATUS_KEY = 'fuel-lift:syncStatus'; // { at, error }
const readLS = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};
export const syncStatus = () => readLS(STATUS_KEY) || {};
const setStatus = (v) => {
  writeLS(STATUS_KEY, v);
  window.dispatchEvent(new Event('fuel-lift-sync'));
};

/**
 * One sync round: stamp local changes, fetch the server copy if it moved, merge, upload if needed,
 * then apply the result locally without losing edits made while the network call was running.
 */
export async function syncOnce({ url, latest, apply }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const startState = latest.current;
    const base = readLS(BASE_KEY);
    const local = stampChanges(startState, base?.sum, Date.now());
    const remote = await botApi(url, `/api/sync?since=${base ? base.rev : -1}`);
    let next = local;
    let rev = base?.rev ?? 0;
    let remoteDoc = null;
    if (!remote.unchanged) {
      rev = remote.rev;
      remoteDoc = remote.doc;
      if (remoteDoc) next = mergeState(local, remoteDoc);
    }
    const localChanged = local !== startState || !base;
    const needPush = remote.unchanged ? localChanged : !remoteDoc || !sameContent(next, remoteDoc);
    if (needPush) {
      try {
        const r = await botApi(url, '/api/sync', { method: 'PUT', body: { baseRev: rev, doc: next } });
        rev = r.rev;
      } catch (e) {
        if (e.status === 409) continue; // someone else synced first: merge again
        throw e;
      }
    }
    writeLS(BASE_KEY, { rev, sum: summarize(next) });
    if (next !== startState) {
      const startSum = summarize(startState);
      apply((cur) => (cur === startState ? next : mergeState(stampChanges(cur, startSum, Date.now()), next)));
    }
    setStatus({ at: Date.now(), error: null, rev });
    return { pushed: needPush, pulled: !!remoteDoc && !remote.unchanged };
  }
  throw new Error('Sync kept conflicting; it will retry shortly.');
}

/** A brand-new device takes the synced copy as-is (keeping only its own device settings). */
export async function adoptRemote({ url, latest, replace }) {
  const remote = await botApi(url, '/api/sync?since=-1');
  if (!remote.doc) throw new Error('Nothing to copy yet. Open Fuel & Lift on your phone first so it uploads your data.');
  const local = latest.current;
  const next = { ...remote.doc, meta: { ...remote.doc.meta, push: local.meta?.push, tg: { ...(remote.doc.meta?.tg || {}), url, paired: true } } };
  writeLS(BASE_KEY, { rev: remote.rev, sum: summarize(next) });
  replace(next);
  setStatus({ at: Date.now(), error: null, rev: remote.rev });
}

export function useCloudSync({ state, latest, apply }) {
  const tg = state.meta.tg || {};
  const active = !!(tg.url && tg.paired && state.meta.sync?.enabled !== false);
  const url = tg.url;
  const busy = useRef(false);
  const run = useMemo(
    () => async () => {
      if (!active || busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        await syncOnce({ url, latest, apply });
      } catch (e) {
        setStatus({ ...syncStatus(), error: e.message });
      } finally {
        busy.current = false;
      }
    },
    [active, url, latest, apply]
  );
  useEffect(() => {
    if (!active) return;
    run();
    const id = setInterval(run, 30000);
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', run);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', run);
    };
  }, [active, run]);
  // Upload shortly after local edits.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(run, 2500);
    return () => clearTimeout(t);
  }, [state, active, run]);
}
