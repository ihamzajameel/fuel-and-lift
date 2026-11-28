import { uid } from './time';

export const e1rm = (w, r) => {
  w = Number(w) || 0;
  r = Number(r) || 0;
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
};

const sameExercise = (a, ex) => a.exId === ex.id || a.name.trim().toLowerCase() === ex.name.trim().toLowerCase();

/** Most recent finished session's performance for this exercise. */
export function lastPerformance(sessions, ex, excludeSessionId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id === excludeSessionId || s.rest) continue;
    const e = s.exercises?.find((x) => sameExercise(x, ex));
    const done = e?.sets.filter((st) => st.done && Number(st.r) > 0);
    if (done?.length) return { date: s.date, sets: done };
  }
  return null;
}

/** All-time best estimated 1RM (or best reps/seconds for bodyweight work). */
export function bestScore(sessions, ex, excludeSessionId) {
  let best = 0;
  for (const s of sessions) {
    if (s.id === excludeSessionId || s.rest) continue;
    const e = s.exercises?.find((x) => sameExercise(x, ex));
    for (const st of e?.sets || []) if (st.done) best = Math.max(best, setScore(st, ex));
  }
  return best;
}

export const setScore = (st, ex) => (ex.bw || !Number(st.w) ? Number(st.r) || 0 : e1rm(st.w, st.r));

/**
 * Progressive overload hint based on last session and the rep range.
 * - Every set hit the top of the range -> add weight (or reps/time for bodyweight).
 * - Otherwise -> beat last time by +1–2 reps per set.
 */
export function overloadHint(ex, last) {
  if (!last) return { kind: 'new', text: 'First time: find a weight you can do for ' + rangeText(ex) };
  const sets = last.sets;
  const unit = ex.unit === 'sec' ? 's' : ' reps';
  const topW = Math.max(...sets.map((s) => Number(s.w) || 0));
  // Every logged set reached the top of the rep range -> time to add load.
  const allTop = sets.every((s) => Number(s.r) >= ex.repMax);
  if (allTop) {
    if (ex.bw || !topW)
      return { kind: 'up', text: `Hit ${ex.repMax}${unit} on every set. Add load or go for ${ex.repMax + (ex.unit === 'sec' ? 5 : 2)}${unit}`, weight: topW || '' };
    const next = Math.round((topW + Number(ex.inc || 2.5)) * 100) / 100;
    return { kind: 'up', text: `Hit ${ex.repMax}${unit} on every set. Go up to ${next} kg`, weight: next, reps: ex.repMin };
  }
  return { kind: 'reps', text: `Same weight, beat last time by +1–2${ex.unit === 'sec' ? 's' : ' reps'}`, weight: topW || '' };
}

export const rangeText = (ex) => `${ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}–${ex.repMax}`}${ex.unit === 'sec' ? 's' : ''}`;

export const fmtSet = (st, ex) => {
  const r = `${st.r}${ex?.unit === 'sec' ? 's' : ''}`;
  return Number(st.w) ? `${+st.w}×${r}` : r;
};

/** One session exercise, pre-filled from your last performance and the overload hint. */
export function buildExercise(ex, sessions) {
  const last = lastPerformance(sessions, ex);
  const hint = overloadHint(ex, last);
  return {
    exId: ex.id,
    name: ex.name,
    unit: ex.unit || 'reps',
    bw: !!ex.bw,
    repMin: ex.repMin,
    repMax: ex.repMax,
    rest: ex.rest,
    inc: ex.inc,
    planned: ex.sets,
    note: ex.note || '',
    ...(ex.bar ? { bar: ex.bar, barKg: ex.barKg ?? '' } : {}),
    sets: Array.from({ length: ex.sets }, (_, i) => {
      const prev = last?.sets[i] || last?.sets[last.sets.length - 1];
      const w = hint.kind === 'up' && hint.weight ? hint.weight : prev?.w ?? '';
      const target = !prev ? ex.repMin : hint.kind === 'up' && !ex.bw ? ex.repMin : Math.min(Number(prev.r) + 1, ex.repMax + (ex.bw ? 3 : 0));
      return { w: ex.bw && !Number(w) ? '' : w, r: '', target, done: false };
    }),
  };
}

/** Build a fresh session from a program day, pre-filled with last weights and target reps. */
export function buildSession(day, sessions, dateKey) {
  return {
    id: uid(),
    dayId: day.id,
    dayName: day.name,
    date: dateKey,
    startedAt: Date.now(),
    finishedAt: null,
    rest: false,
    exercises: day.exercises.map((ex) => buildExercise(ex, sessions)),
  };
}

/** A finished session with every planned set logged at its target ("log as planned"). */
export function plannedSession(day, sessions, dateKey, finishedAt = Date.now(), onlyExIds) {
  const s = buildSession(day, sessions, dateKey);
  s.id = `q-${uid()}`;
  s.startedAt = finishedAt - 75 * 60e3;
  s.finishedAt = finishedAt;
  s.quick = true;
  s.exercises = s.exercises
    .filter((e) => !onlyExIds || onlyExIds.includes(e.exId))
    .map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, r: x.target, done: true })) }));
  return s;
}

/** Every exercise you might want to add or swap in: your plan, all templates and your history. */
export function exerciseLibrary(program, templates, sessions) {
  const map = new Map();
  const add = (ex) => {
    const k = ex.name.trim().toLowerCase();
    if (!map.has(k)) map.set(k, ex);
  };
  for (const d of program.days) for (const ex of d.exercises) add(ex);
  for (const t of Object.values(templates)) for (const d of t.days) for (const ex of d.exercises) add(ex);
  for (const s of sessions)
    for (const e of s.exercises || [])
      add({ id: e.exId, name: e.name, sets: e.planned || e.sets.length || 3, repMin: e.repMin ?? 8, repMax: e.repMax ?? 12, rest: e.rest ?? 90, inc: e.inc ?? 2.5, unit: e.unit || 'reps', bw: !!e.bw, note: e.note || '', ...(e.bar ? { bar: e.bar, barKg: e.barKg ?? '' } : {}) });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sessionStats(session) {
  let sets = 0;
  let volume = 0;
  for (const e of session.exercises || [])
    for (const s of e.sets)
      if (s.done) {
        sets++;
        if (e.unit !== 'sec') volume += (Number(s.w) || 0) * (Number(s.r) || 0);
      }
  return { sets, volume: Math.round(volume) };
}

/**
 * Which program day is "up next".
 * - weekly programs: the day assigned to today's weekday (logical day, so 1 AM still counts as yesterday)
 * - rotation programs: the day after the most recently finished session
 */
export function nextDayIndex(program, sessions, todayKey) {
  const days = program.days;
  if (!days.length) return -1;
  if (program.mode === 'weekly') {
    const [y, m, d] = (todayKey || '').split('-').map(Number);
    const wd = todayKey ? new Date(y, m - 1, d).getDay() : new Date().getDay();
    return days.findIndex((x) => x.weekday === wd);
  }
  for (let i = sessions.length - 1; i >= 0; i--) {
    const idx = days.findIndex((d) => d.id === sessions[i].dayId);
    if (idx >= 0) return (idx + 1) % days.length;
  }
  return 0;
}

/** Per-session best e1RM history for charting. */
export function strengthHistory(sessions, exName) {
  const name = exName.trim().toLowerCase();
  const pts = [];
  for (const s of sessions) {
    if (s.rest) continue;
    const e = s.exercises?.find((x) => x.name.trim().toLowerCase() === name);
    const done = e?.sets.filter((st) => st.done && Number(st.r) > 0) || [];
    if (!done.length) continue;
    const ex = { bw: e.bw || done.every((d) => !Number(d.w)), unit: e.unit };
    let best = done[0];
    for (const st of done) if (setScore(st, ex) > setScore(best, ex)) best = st;
    pts.push({ date: s.date, value: Math.round(setScore(best, ex) * 10) / 10, best, bw: ex.bw, unit: e.unit, sets: done });
  }
  return pts;
}

export function exerciseNamesWithHistory(sessions) {
  const map = new Map();
  for (const s of sessions)
    for (const e of s.exercises || []) {
      if (!e.sets.some((st) => st.done)) continue;
      const k = e.name.trim().toLowerCase();
      const m = map.get(k) || { name: e.name, n: 0 };
      m.n++;
      map.set(k, m);
    }
  return [...map.values()].sort((a, b) => b.n - a.n);
}
