import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Dumbbell,
  Footprints,
  History,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Weight,
  X,
  Repeat,
  Minus,
  CheckCheck,
} from 'lucide-react';
import { isBarbell, platesPerSide, warmupRamp } from '../lib/coach';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Chip, Field, IconButton, NumInput, ScreenHeader, Segmented, Sheet, TextInput, Toggle, cx, fmtNum } from '../components/ui';
import { buildExercise, buildSession, bestScore, exerciseLibrary, fmtSet, lastPerformance, nextDayIndex, overloadHint, plannedSession, rangeText, sessionStats, setScore } from '../lib/workout';
import { PROGRAM_TEMPLATES, cloneProgram } from '../lib/defaults';
import { addDays, fmtDay, fmtDuration, fmtShortDate, fmtTime, uid } from '../lib/time';
import { useTicker, useWakeLock } from '../lib/hooks';

export default function Train() {
  const { state } = useStore();
  useWakeLock(!!state.activeSession && state.settings.keepAwake);
  return state.activeSession ? <SessionView /> : <ProgramView />;
}

// ---------------------------------------------------------------- Program
function ProgramView() {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [exSheet, setExSheet] = useState(null); // day id
  const [openDay, setOpenDay] = useState(null);
  const [quick, setQuick] = useState(null); // program day to log as planned
  const days = state.program.days;
  const nextIdx = nextDayIndex(state.program, state.sessions, today);
  const weekly = state.program.mode === 'weekly';
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayLabel = (d, i) => (weekly ? (d.weekday != null ? WD[d.weekday].toUpperCase() : 'UNSCHEDULED') : `DAY ${i + 1}`);
  const weekAgo = addDays(today, -6);
  const doneThisWeek = state.sessions.filter((s) => !s.rest && s.date >= weekAgo).length;
  const plannedPerWeek = days.filter((d) => d.type !== 'rest').length;

  const start = (day) => {
    const session = buildSession(day, state.sessions, today);
    mutate((d) => {
      d.activeSession = session;
    });
  };

  const finishRest = (day, steps) => {
    mutate((d) => {
      d.sessions.push({ id: uid(), dayId: day.id, dayName: day.name, date: today, rest: true, steps: Number(steps) || null, startedAt: Date.now(), finishedAt: Date.now(), exercises: [] });
      if (steps) {
        d.days[today] ||= { foods: [], water: [], supps: {}, done: {} };
        d.days[today].steps = Number(steps);
      }
    });
    toast('Rest day logged');
  };

  const switchTemplate = (size) => {
    if (Number(size) === Number(state.program.template)) return;
    if (!confirm(`Switch to the ${PROGRAM_TEMPLATES[size].label} template? This replaces your current days and exercises. Your logged history stays.`)) return;
    mutate((d) => {
      d.program = cloneProgram(size);
    });
    toast(`${PROGRAM_TEMPLATES[size].label} loaded`);
  };

  const lastDone = (dayId) => [...state.sessions].reverse().find((s) => s.dayId === dayId);

  const editDay = (i, patch) =>
    mutate((d) => {
      Object.assign(d.program.days[i], patch);
    });
  const moveDay = (i, dir) =>
    mutate((d) => {
      const a = d.program.days;
      const j = i + dir;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
    });
  const removeDay = (i) => {
    if (!confirm(`Remove “${days[i].name}”?`)) return;
    mutate((d) => {
      d.program.days.splice(i, 1);
    });
  };
  const addDay = () => {
    const id = uid();
    mutate((d) => {
      d.program.days.push({ id, name: 'New Workout', focus: '', type: 'workout', note: '', exercises: [] });
    });
    setExSheet(id);
  };

  return (
    <>
      <ScreenHeader
        title="Train"
        subtitle={state.program.label || 'Custom program'}
        right={
          <Button size="sm" variant={editing ? 'primary' : 'soft'} icon={editing ? Check : Pencil} onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Edit plan'}
          </Button>
        }
      />
      <div className="space-y-3 px-3 pt-3">
        {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="!p-3.5">
              <p className="text-xs text-muted">Last 7 days</p>
              <p className="tnum mt-0.5 text-2xl font-bold">
                {doneThisWeek}
                <span className="text-base font-normal text-muted"> / {plannedPerWeek} workouts</span>
              </p>
            </Card>
            <Card className="!p-3.5">
              <p className="text-xs text-muted">Total sessions</p>
              <p className="tnum mt-0.5 text-2xl font-bold">{state.sessions.filter((s) => !s.rest).length}</p>
            </Card>
          </div>
        )}

        {editing && (
          <Card title="Split template">
            <Segmented
              value={String(state.program.template || '')}
              onChange={switchTemplate}
              options={[
                { value: '3', label: '3 days' },
                { value: '4', label: '4 days' },
                { value: '5', label: '5 days' },
                { value: '6', label: '6 PPL' },
              ]}
            />
            <p className="mt-2 text-xs text-faint">Loads a ready-made split. 6 PPL follows the weekday (Mon–Sat); the others rotate. Then rename, reorder, add or remove anything below.</p>
          </Card>
        )}

        {(weekly && !editing && nextIdx > 0 ? [...days.keys()].slice(nextIdx).concat([...days.keys()].slice(0, nextIdx)) : [...days.keys()]).map((i) => {
          const day = days[i];
          const isNext = i === nextIdx && !editing;
          const last = lastDone(day.id);
          const rest = day.type === 'rest';
          const expanded = openDay === day.id;
          if (editing)
            return (
              <Card key={day.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="tnum w-12 shrink-0 text-xs font-semibold text-muted">{dayLabel(day, i)}</span>
                  <TextInput value={day.name} onChange={(e) => editDay(i, { name: e.target.value })} aria-label="Day name" className="!h-11 font-semibold" />
                </div>
                <TextInput value={day.focus} onChange={(e) => editDay(i, { focus: e.target.value })} placeholder="Focus (e.g. Push / pull)" className="!h-10 text-sm" />
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    size="sm"
                    className="w-44"
                    value={day.type}
                    onChange={(v) => editDay(i, { type: v })}
                    options={[
                      { value: 'workout', label: 'Workout' },
                      { value: 'rest', label: 'Rest' },
                    ]}
                  />
                  {weekly && (
                    <select
                      value={day.weekday ?? ''}
                      onChange={(e) => editDay(i, { weekday: e.target.value === '' ? null : Number(e.target.value) })}
                      aria-label="Weekday"
                      className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm text-fg"
                    >
                      <option value="">No day</option>
                      {WD.map((w, n) => (
                        <option key={w} value={n}>
                          {w}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="ml-auto flex">
                    <IconButton icon={ArrowUp} label="Move up" onClick={() => moveDay(i, -1)} disabled={i === 0} className="disabled:opacity-30" />
                    <IconButton icon={ArrowDown} label="Move down" onClick={() => moveDay(i, 1)} disabled={i === days.length - 1} className="disabled:opacity-30" />
                    <IconButton icon={Trash2} label="Remove day" onClick={() => removeDay(i)} className="hover:text-danger" />
                  </div>
                </div>
                {!rest && (
                  <Button className="w-full" icon={ListChecks} onClick={() => setExSheet(day.id)}>
                    Edit exercises ({day.exercises.length})
                  </Button>
                )}
              </Card>
            );
          return (
            <Card key={day.id} className={cx(isNext && 'border-lift/60 ring-1 ring-lift/30')}>
              <button type="button" onClick={() => setOpenDay(expanded ? null : day.id)} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={expanded}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                    {dayLabel(day, i)}
                    {isNext && <span className="rounded-full bg-lift/15 px-2 py-0.5 text-[11px] text-lift">{weekly ? 'TODAY' : 'UP NEXT'}</span>}
                  </p>
                  <p className="mt-0.5 text-lg leading-tight font-semibold">{day.name}</p>
                  <p className="text-sm text-muted">{rest ? day.focus : `${day.exercises.length} exercises · ${day.focus}`}</p>
                  {last && <p className="mt-1 text-xs text-faint">Last done {fmtDay(last.date, today)}</p>}
                </div>
                {!rest && <ChevronDown size={20} className={cx('mt-1 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />}
              </button>
              {expanded && !rest && (
                <ul className="anim-fade mt-3 divide-y divide-line/50 border-t border-line/60">
                  {day.exercises.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0 truncate">{ex.name}</span>
                      <span className="tnum shrink-0 text-muted">
                        {ex.sets} × {rangeText(ex)} · {ex.rest}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {rest ? (
                <RestDayAction day={day} onDone={finishRest} doneToday={last?.date === today} />
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button variant={isNext ? 'lift' : 'soft'} size={isNext ? 'lg' : 'md'} icon={Play} className="flex-1" onClick={() => start(day)}>
                    Start {isNext ? 'workout' : 'this day'}
                  </Button>
                  <Button variant="soft" size={isNext ? 'lg' : 'md'} icon={CheckCheck} onClick={() => setQuick(day)} aria-label={`Quick log ${day.name}`}>
                    Quick log
                  </Button>
                </div>
              )}
            </Card>
          );
        })}

        {editing && (
          <Button size="lg" className="w-full border-dashed" icon={Plus} onClick={addDay}>
            Add day
          </Button>
        )}
        {!editing && state.sessions.some((s) => !s.rest) && <RecentSessions />}
      </div>
      <ExerciseEditor dayId={exSheet} onClose={() => setExSheet(null)} />
      <QuickLogSheet day={quick} onClose={() => setQuick(null)} />
    </>
  );
}

/** Record a workout without tracking each set: every planned set at its target, editable per exercise. */
function QuickLogSheet({ day, onClose }) {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const [date, setDate] = useState(today);
  const [skip, setSkip] = useState({});
  const [lastId, setLastId] = useState(null);
  if (day && day.id !== lastId) {
    setLastId(day.id);
    setDate(today);
    setSkip({});
  }
  if (!day && lastId) setLastId(null);
  if (!day) return null;
  const preview = plannedSession(day, state.sessions, date);
  const save = () => {
    const keep = preview.exercises.filter((e) => !skip[e.exId]).map((e) => e.exId);
    if (!keep.length) return;
    const [y, m, d] = date.split('-').map(Number);
    const [gh, gm] = (state.profile.gymTime || '22:00').split(':').map(Number);
    const fin = date === today ? Date.now() : new Date(y, m - 1, d, gh, gm).getTime() + 75 * 60e3;
    const session = plannedSession(day, state.sessions, date, fin, keep);
    mutate((dr) => {
      dr.sessions.push(session);
      dr.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.finishedAt || 0) - (b.finishedAt || 0)));
    });
    const st = sessionStats(session);
    toast(`Logged ${day.name} · ${st.sets} sets`, { label: 'Undo', run: () => mutate((dr) => void (dr.sessions = dr.sessions.filter((x) => x.id !== session.id))) });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Quick log: ${day.name}`}
      footer={
        <Button variant="primary" size="lg" className="w-full" icon={CheckCheck} onClick={save}>
          Save workout
        </Button>
      }
    >
      <Field label="Date">
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg" />
      </Field>
      <p className="mt-3 mb-2 text-sm text-muted">Logs every set at the planned weight and target reps. Untick anything you skipped; fine-tune later by starting the day instead.</p>
      <ul className="divide-y divide-line/60 rounded-xl border border-line">
        {preview.exercises.map((e) => {
          const off = !!skip[e.exId];
          const w = e.sets[0]?.w;
          return (
            <li key={e.exId}>
              <button type="button" onClick={() => setSkip({ ...skip, [e.exId]: !off })} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left" aria-pressed={!off}>
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md border-2', off ? 'border-line' : 'border-accent bg-accent text-on-accent')}>
                  {!off && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate font-medium', off && 'text-muted line-through')}>{e.name}</span>
                  <span className="tnum block text-xs text-muted">
                    {e.sets.length} × {e.sets[0]?.r}
                    {e.unit === 'sec' ? 's' : ''}
                    {Number(w) ? ` @ ${w} kg` : e.bw ? ' · bodyweight' : ' · no weight logged yet'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function RestDayAction({ day, onDone, doneToday }) {
  const [steps, setSteps] = useState('');
  if (doneToday)
    return (
      <p className="mt-3 flex items-center gap-2 text-sm font-medium text-good">
        <Check size={16} /> Logged today
      </p>
    );
  return (
    <div className="mt-3 flex gap-2">
      <div className="w-36">
        <NumInput value={steps} onChange={setSteps} placeholder="Steps" aria-label="Steps walked" inputMode="numeric" />
      </div>
      <Button className="flex-1" icon={Footprints} onClick={() => onDone(day, steps)}>
        Mark done
      </Button>
    </div>
  );
}

function RecentSessions() {
  const { state, mutate, today } = useStore();
  const [open, setOpen] = useState(false);
  const list = [...state.sessions].filter((s) => !s.rest).reverse().slice(0, open ? 30 : 5);
  return (
    <Card title="Recent sessions" icon={History} padded={false}>
      <ul className="divide-y divide-line/60">
        {list.map((s) => {
          const st = sessionStats(s);
          return (
            <li key={s.id} className="flex items-center gap-2 py-2.5 pr-2 pl-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.dayName}</p>
                <p className="tnum text-xs text-muted">
                  {fmtDay(s.date, today)} · {st.sets} sets · {fmtNum(st.volume)} kg
                  {s.finishedAt && s.startedAt ? ` · ${Math.round((s.finishedAt - s.startedAt) / 60000)} min` : ''}
                </p>
              </div>
              <IconButton
                icon={Trash2}
                size={16}
                label="Delete session"
                className="hover:text-danger"
                onClick={() => {
                  if (confirm(`Delete the ${s.dayName} session from ${fmtShortDate(s.date)}? This removes it from your history.`))
                    mutate((d) => {
                      d.sessions = d.sessions.filter((x) => x.id !== s.id);
                    });
                }}
              />
            </li>
          );
        })}
      </ul>
      {state.sessions.filter((s) => !s.rest).length > 5 && (
        <button type="button" onClick={() => setOpen(!open)} className="w-full border-t border-line/60 py-3 text-sm font-medium text-muted">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Exercise editor
function ExerciseEditor({ dayId, onClose }) {
  const { state, mutate } = useStore();
  const [open, setOpen] = useState(null);
  const di = state.program.days.findIndex((d) => d.id === dayId);
  const day = state.program.days[di];

  const edit = (ei, patch) =>
    mutate((d) => {
      Object.assign(d.program.days[di].exercises[ei], patch);
    });
  const move = (ei, dir) =>
    mutate((d) => {
      const a = d.program.days[di].exercises;
      const j = ei + dir;
      if (j < 0 || j >= a.length) return;
      [a[ei], a[j]] = [a[j], a[ei]];
    });
  const remove = (ei) =>
    mutate((d) => {
      d.program.days[di].exercises.splice(ei, 1);
    });
  const add = () => {
    const id = `ex-${uid()}`;
    mutate((d) => {
      d.program.days[di].exercises.push({ id, name: 'New Exercise', sets: 3, repMin: 8, repMax: 12, rest: 90, inc: 2.5, unit: 'reps', bw: false, note: '' });
    });
    setOpen(id);
  };

  return (
    <Sheet open={!!day} onClose={onClose} title={day ? day.name : ''} footer={<Button variant="primary" size="lg" className="w-full" onClick={onClose}>Done</Button>}>
      {day && (
        <div className="space-y-2">
          {day.exercises.map((ex, ei) => {
            const isOpen = open === ex.id;
            return (
              <div key={ex.id} className="rounded-xl border border-line bg-surface-2">
                <div className="flex items-center gap-1 pl-3">
                  <button type="button" className="min-w-0 flex-1 py-3 text-left" onClick={() => setOpen(isOpen ? null : ex.id)}>
                    <p className="truncate font-medium">{ex.name}</p>
                    <p className="tnum text-xs text-muted">
                      {ex.sets} × {rangeText(ex)} · rest {ex.rest}s{ex.bw ? ' · bodyweight' : ''}
                    </p>
                  </button>
                  <IconButton icon={ArrowUp} label="Move up" size={18} onClick={() => move(ei, -1)} disabled={ei === 0} className="!w-9 disabled:opacity-30" />
                  <IconButton icon={ArrowDown} label="Move down" size={18} onClick={() => move(ei, 1)} disabled={ei === day.exercises.length - 1} className="!w-9 disabled:opacity-30" />
                </div>
                {isOpen && (
                  <div className="anim-fade space-y-3 border-t border-line/70 p-3">
                    <Field label="Name">
                      <TextInput value={ex.name} onChange={(e) => edit(ei, { name: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Sets">
                        <NumInput value={ex.sets} onChange={(v) => edit(ei, { sets: Math.max(1, Math.min(12, parseInt(v) || 1)) })} inputMode="numeric" />
                      </Field>
                      <Field label={ex.unit === 'sec' ? 'Min sec' : 'Min reps'}>
                        <NumInput value={ex.repMin} onChange={(v) => edit(ei, { repMin: parseInt(v) || 0 })} inputMode="numeric" />
                      </Field>
                      <Field label={ex.unit === 'sec' ? 'Max sec' : 'Max reps'}>
                        <NumInput value={ex.repMax} onChange={(v) => edit(ei, { repMax: parseInt(v) || 0 })} inputMode="numeric" />
                      </Field>
                    </div>
                    <div>
                      <span className="mb-1.5 block text-[13px] font-medium text-muted">Rest timer</span>
                      <div className="flex items-center gap-2">
                        {[60, 90, 120].map((s) => (
                          <Chip key={s} active={ex.rest === s} onClick={() => edit(ei, { rest: s })}>
                            {s}s
                          </Chip>
                        ))}
                        <div className="w-24">
                          <NumInput value={ex.rest} onChange={(v) => edit(ei, { rest: parseInt(v) || 0 })} suffix="s" inputMode="numeric" className="!h-9" aria-label="Custom rest seconds" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Measure">
                        <Segmented
                          size="sm"
                          value={ex.unit}
                          onChange={(v) => edit(ei, { unit: v })}
                          options={[
                            { value: 'reps', label: 'Reps' },
                            { value: 'sec', label: 'Seconds' },
                          ]}
                        />
                      </Field>
                      <Field label="Weight jump">
                        <NumInput value={ex.inc} onChange={(v) => edit(ei, { inc: v === '' ? '' : Number(v) })} suffix="kg" className="!h-10" />
                      </Field>
                    </div>
                    <label className="flex items-center justify-between rounded-lg bg-surface-3/60 px-3 py-2.5">
                      <span className="text-sm">Bodyweight exercise (weight optional)</span>
                      <Toggle checked={ex.bw} onChange={(v) => edit(ei, { bw: v })} label="Bodyweight" />
                    </label>
                    <Field label="Note">
                      <TextInput value={ex.note || ''} onChange={(e) => edit(ei, { note: e.target.value })} placeholder="Cues, machine settings…" className="!h-10 text-sm" />
                    </Field>
                    <Button variant="danger" size="sm" icon={Trash2} onClick={() => remove(ei)}>
                      Remove exercise
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <Button className="w-full" icon={Plus} onClick={add}>
            Add exercise
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Live session
function SessionView() {
  const { state, mutate, today } = useStore();
  const { toast, startRest, stopRest } = useApp();
  const s = state.activeSession;
  const [newEx, setNewEx] = useState('');
  const [swap, setSwap] = useState(null); // exercise index
  const library = useMemo(() => exerciseLibrary(state.program, PROGRAM_TEMPLATES, state.sessions), [state.program, state.sessions]);
  const [plates, setPlates] = useState(null); // { name, weight }

  // History-based context per exercise (computed once per session start / history change).
  const context = useMemo(
    () =>
      s.exercises.map((e) => {
        const key = { id: e.exId, name: e.name };
        const last = lastPerformance(state.sessions, key, s.id);
        const hint = overloadHint({ ...e, sets: e.planned ?? e.sets.length, repMin: e.repMin ?? 8, repMax: e.repMax ?? 12 }, last);
        return { last, hint, best: bestScore(state.sessions, { ...key, bw: e.bw }, s.id) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sessions, s.id, s.exercises.length]
  );

  const setField = (ei, si, patch) =>
    mutate((d) => {
      Object.assign(d.activeSession.exercises[ei].sets[si], patch);
    });

  const completeSet = (ei, si) => {
    const e = s.exercises[ei];
    const st = e.sets[si];
    if (st.done) return setField(ei, si, { done: false });
    const r = st.r === '' ? st.target : st.r;
    mutate((d) => {
      const sets = d.activeSession.exercises[ei].sets;
      Object.assign(sets[si], { done: true, r: r === '' || r == null ? '' : r });
      // Carry the weight forward to later empty sets so the next set is one tap.
      if (st.w !== '') for (let i = si + 1; i < sets.length; i++) if (!sets[i].done && (sets[i].w === '' || sets[i].w == null)) sets[i].w = st.w;
    });
    if (!state.settings.autoRest) return;
    // Next undone set, in this exercise or the next one.
    const restLeft = e.sets.some((x, i) => i !== si && !x.done);
    const nextEx = restLeft ? e : s.exercises.slice(ei + 1).find((x) => x.sets.some((y) => !y.done));
    if (!nextEx) return stopRest();
    const nextSetNo = nextEx.sets.findIndex((x, i) => !x.done && !(nextEx === e && i === si)) + 1;
    startRest(Number(e.rest) || 90, `${nextEx.name} · set ${nextSetNo}`);
  };

  const addSet = (ei) =>
    mutate((d) => {
      const sets = d.activeSession.exercises[ei].sets;
      const prev = sets[sets.length - 1];
      sets.push({ w: prev?.w ?? '', r: '', target: prev?.target ?? '', done: false });
    });
  const adjustWeight = (ei, dir) =>
    mutate((d) => {
      const e = d.activeSession.exercises[ei];
      const step = Number(e.inc) || Number(state.settings.weightStep) || 2.5;
      for (const x of e.sets) if (!x.done && x.w !== '' && x.w != null) x.w = Math.max(0, Math.round((Number(x.w) + dir * step) * 100) / 100);
    });
  const completeAll = (ei) => {
    const e = s.exercises[ei];
    mutate((d) => {
      let lastW = '';
      for (const x of d.activeSession.exercises[ei].sets) {
        if (x.w !== '' && x.w != null) lastW = x.w;
        else if (!x.done && lastW !== '') x.w = lastW; // carry the weight you typed on earlier sets
        if (!x.done) Object.assign(x, { done: true, r: x.r === '' ? x.target : x.r });
      }
    });
    const nextEx = s.exercises.slice(ei + 1).find((x) => x.sets.some((y) => !y.done));
    if (nextEx && state.settings.autoRest) startRest(Number(e.rest) || 90, `${nextEx.name} · set 1`);
  };
  const swapExercise = (ei, lib) => {
    const fresh = buildExercise(lib, state.sessions);
    mutate((d) => {
      const list = d.activeSession.exercises;
      const done = list[ei].sets.filter((x) => x.done);
      if (done.length) {
        list[ei].sets = done;
        list.splice(ei + 1, 0, fresh);
      } else list[ei] = fresh;
    });
    setSwap(null);
  };
  const removeSet = (ei, si) =>
    mutate((d) => {
      d.activeSession.exercises[ei].sets.splice(si, 1);
    });
  const removeExercise = (ei) => {
    if (!confirm(`Remove ${s.exercises[ei].name} from this session?`)) return;
    mutate((d) => {
      d.activeSession.exercises.splice(ei, 1);
    });
  };
  const addExercise = () => {
    const name = newEx.trim();
    if (!name) return;
    const lib = library.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const fresh = lib
      ? buildExercise(lib, state.sessions)
      : { exId: `ex-${uid()}`, name, unit: 'reps', bw: false, repMin: 8, repMax: 12, rest: 90, inc: 2.5, planned: 3, note: '', sets: Array.from({ length: 3 }, () => ({ w: '', r: '', target: 10, done: false })) };
    mutate((d) => {
      d.activeSession.exercises.push(fresh);
    });
    setNewEx('');
  };

  const finish = () => {
    const st = sessionStats(s);
    if (st.sets === 0) {
      if (confirm('No sets completed. Discard this workout?')) {
        mutate((d) => {
          d.activeSession = null;
        });
        stopRest();
      }
      return;
    }
    let prs = 0;
    s.exercises.forEach((e, ei) => {
      const best = context[ei]?.best || 0;
      const top = Math.max(0, ...e.sets.filter((x) => x.done).map((x) => setScore(x, e)));
      if (best > 0 && top > best) prs++;
    });
    mutate((d) => {
      const done = { ...d.activeSession, finishedAt: Date.now() };
      done.exercises = done.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length);
      d.sessions.push(done);
      d.activeSession = null;
    });
    stopRest();
    toast(`Workout saved · ${st.sets} sets · ${fmtNum(st.volume)} kg${prs ? ` · ${prs} PR${prs > 1 ? 's' : ''} 🏆` : ''}`, null, 5000);
  };

  const discard = () => {
    if (!confirm('Discard this workout? Nothing from it will be saved.')) return;
    mutate((d) => {
      d.activeSession = null;
    });
    stopRest();
  };

  const st = sessionStats(s);
  const totalSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);

  return (
    <>
      <ScreenHeader
        title={s.dayName}
        subtitle={<Elapsed startedAt={s.startedAt} extra={`${st.sets}/${totalSets} sets`} />}
        right={
          <Button variant="primary" size="sm" icon={Check} onClick={finish}>
            Finish
          </Button>
        }
      />
      <div className="space-y-3 px-3 pt-3">
        {s.date !== today && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">Started {fmtDay(s.date, today)}. Finish it when you're done; it will be saved to that day.</p>}
        {s.exercises.map((e, ei) => {
          const ctx = context[ei] || {};
          const { last, hint, best } = ctx;
          const allDone = e.sets.length > 0 && e.sets.every((x) => x.done);
          return (
            <Card key={e.exId + ei} className={cx(allDone && 'opacity-80')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[17px] leading-tight font-semibold">
                    {allDone && <Check size={18} className="shrink-0 text-accent" strokeWidth={3} />}
                    {e.name}
                  </h2>
                  <p className="tnum mt-0.5 flex items-center gap-1 text-xs text-muted">
                    {e.planned ?? e.sets.length} × {rangeText({ repMin: e.repMin ?? 8, repMax: e.repMax ?? 12, unit: e.unit })} · <Timer size={12} /> {e.rest}s
                    {e.note && ` · ${e.note}`}
                  </p>
                </div>
                <div className="-mt-1 -mr-1 flex shrink-0">
                  {isBarbell(e.name) && !e.bw && (
                    <IconButton
                      icon={Weight}
                      label="Plates & warm-up"
                      size={18}
                      className="!h-9 !w-9"
                      onClick={() => setPlates({ name: e.name, weight: Number(e.sets.find((x) => !x.done)?.w || e.sets[0]?.w) || '' })}
                    />
                  )}
                  <IconButton icon={X} label={`Remove ${e.name}`} size={18} onClick={() => removeExercise(ei)} className="!h-9 !w-9" />
                </div>
              </div>

              {/* Progressive overload */}
              {hint && (
                <div
                  className={cx(
                    'mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm',
                    hint.kind === 'up' ? 'bg-lift/12 text-fg' : hint.kind === 'reps' ? 'bg-carbs/10 text-fg' : 'bg-surface-2 text-muted'
                  )}
                >
                  {hint.kind === 'up' ? <TrendingUp size={16} className="mt-0.5 shrink-0 text-lift" /> : <Sparkles size={16} className={cx('mt-0.5 shrink-0', hint.kind === 'reps' ? 'text-carbs' : 'text-faint')} />}
                  <div className="min-w-0">
                    <p className="font-medium">{hint.text}</p>
                    {last && (
                      <p className="tnum mt-0.5 truncate text-xs text-muted">
                        Last ({fmtShortDate(last.date)}): {last.sets.map((x) => fmtSet(x, e)).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* One-tap tools */}
              {!allDone && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!e.bw && (
                    <>
                      <button type="button" onClick={() => adjustWeight(ei, -1)} className="press tnum inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-sm font-semibold" aria-label="Lower weight on remaining sets">
                        <Minus size={14} /> {Number(e.inc) || 2.5}
                      </button>
                      <button type="button" onClick={() => adjustWeight(ei, 1)} className="press tnum inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-sm font-semibold" aria-label="Raise weight on remaining sets">
                        <Plus size={14} /> {Number(e.inc) || 2.5}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setSwap(ei)} className="press inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm font-semibold">
                    <Repeat size={14} /> Swap
                  </button>
                  <button type="button" onClick={() => completeAll(ei)} className="press ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent/15 px-3 text-sm font-semibold text-fg">
                    <CheckCheck size={16} className="text-accent" /> All sets
                  </button>
                </div>
              )}

              {/* Sets */}
              <div className="mt-3">
                <div className="grid grid-cols-[28px_1fr_72px_64px_44px] items-center gap-2 px-0.5 pb-1 text-[11px] font-semibold tracking-wide text-faint">
                  <span>SET</span>
                  <span>PREV</span>
                  <span className="text-center">{e.bw ? '+KG' : 'KG'}</span>
                  <span className="text-center">{e.unit === 'sec' ? 'SEC' : 'REPS'}</span>
                  <span />
                </div>
                {e.sets.map((x, si) => {
                  const prev = last?.sets[si];
                  const pr = x.done && best > 0 && setScore(x, e) > best;
                  return (
                    <div key={si} className={cx('grid grid-cols-[28px_1fr_72px_64px_44px] items-center gap-2 rounded-xl px-0.5 py-1', x.done && 'bg-accent/8')}>
                      <button
                        type="button"
                        className="tnum grid h-11 place-items-center text-sm font-semibold text-muted"
                        onClick={() => !x.done && e.sets.length > 1 && confirm(`Remove set ${si + 1}?`) && removeSet(ei, si)}
                        aria-label={`Set ${si + 1}`}
                      >
                        {pr ? <Trophy size={16} className="text-lift" aria-label="Personal record" /> : si + 1}
                      </button>
                      <span className="tnum truncate text-sm text-muted">{prev ? fmtSet(prev, e) : '–'}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={x.w}
                        placeholder={e.bw ? 'BW' : '0'}
                        onFocus={(ev) => ev.target.select()}
                        onChange={(ev) => setField(ei, si, { w: ev.target.value })}
                        aria-label={`Set ${si + 1} weight`}
                        className={cx('tnum h-11 w-full rounded-lg border bg-surface-2 text-center text-[17px] font-semibold focus:border-accent focus:outline-none', x.done ? 'border-transparent' : 'border-line')}
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={x.r}
                        placeholder={x.target !== '' && x.target != null ? String(x.target) : '0'}
                        onFocus={(ev) => ev.target.select()}
                        onChange={(ev) => setField(ei, si, { r: ev.target.value })}
                        aria-label={`Set ${si + 1} ${e.unit === 'sec' ? 'seconds' : 'reps'}`}
                        className={cx('tnum h-11 w-full rounded-lg border bg-surface-2 text-center text-[17px] font-semibold placeholder:text-faint focus:border-accent focus:outline-none', x.done ? 'border-transparent' : 'border-line')}
                      />
                      <button
                        type="button"
                        onClick={() => completeSet(ei, si)}
                        aria-label={x.done ? `Undo set ${si + 1}` : `Complete set ${si + 1}`}
                        aria-pressed={x.done}
                        className={cx('press grid h-11 w-11 place-items-center rounded-lg border-2 transition-colors', x.done ? 'border-accent bg-accent text-on-accent' : 'border-line text-faint hover:text-fg')}
                      >
                        <Check size={20} strokeWidth={3} />
                      </button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => addSet(ei)} className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg">
                  <Plus size={16} /> Add set
                </button>
              </div>
            </Card>
          );
        })}

        <Card title="Add exercise" icon={Dumbbell}>
          <div className="flex gap-2">
            <TextInput list="exercise-library" value={newEx} onChange={(e) => setNewEx(e.target.value)} placeholder="Start typing, e.g. Pec deck" onKeyDown={(e) => e.key === 'Enter' && addExercise()} />
            <datalist id="exercise-library">
              {library.map((x) => (
                <option key={x.name} value={x.name} />
              ))}
            </datalist>
            <Button icon={Plus} onClick={addExercise} aria-label="Add exercise" />
          </div>
          <p className="mt-2 text-xs text-faint">Added for this session only. Edit the plan to keep it.</p>
        </Card>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1 text-danger" icon={Trash2} onClick={discard}>
            Discard
          </Button>
          <Button variant="primary" size="lg" className="flex-[2]" icon={Check} onClick={finish}>
            Finish workout
          </Button>
        </div>
      </div>
      <PlateSheet value={plates} onClose={() => setPlates(null)} />
      <SwapSheet open={swap != null} current={swap != null ? s.exercises[swap]?.name : ''} library={library} onPick={(lib) => swapExercise(swap, lib)} onClose={() => setSwap(null)} />
    </>
  );
}

function SwapSheet({ open, current, library, onPick, onClose }) {
  const [q, setQ] = useState('');
  if (!open) return null;
  const query = q.trim().toLowerCase();
  const list = library.filter((x) => x.name !== current && (!query || x.name.toLowerCase().includes(query))).slice(0, 40);
  const close = () => {
    setQ('');
    onClose();
  };
  return (
    <Sheet open onClose={close} title={`Swap ${current}`}>
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" autoFocus />
      <ul className="mt-3 divide-y divide-line/60 rounded-xl border border-line">
        {list.map((x) => (
          <li key={x.name}>
            <button
              type="button"
              onClick={() => {
                setQ('');
                onPick(x);
              }}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="font-medium">{x.name}</span>
              <span className="tnum shrink-0 text-xs text-muted">
                {x.sets} × {rangeText(x)}
              </span>
            </button>
          </li>
        ))}
        {query && !library.some((x) => x.name.toLowerCase() === query) && (
          <li>
            <button
              type="button"
              onClick={() => {
                setQ('');
                onPick({ id: `ex-${uid()}`, name: q.trim(), sets: 3, repMin: 8, repMax: 12, rest: 90, inc: 2.5, unit: 'reps', bw: false, note: '' });
              }}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left font-medium text-accent"
            >
              <Plus size={16} /> Use “{q.trim()}”
            </button>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-faint">Sets you've already done stay under the old exercise.</p>
    </Sheet>
  );
}

// Standard competition plate colours (kg): 25 red, 20 blue, 15 yellow, 10 green, 5 white, 2.5 black, 1.25 silver
const PLATE_STYLE = {
  25: { h: 92, bg: '#dc2626' },
  20: { h: 92, bg: '#2563eb' },
  15: { h: 80, bg: '#eab308' },
  10: { h: 68, bg: '#16a34a' },
  5: { h: 52, bg: '#e5e7eb' },
  2.5: { h: 42, bg: '#1f2937' },
  1.25: { h: 34, bg: '#9ca3af' },
};

function PlateSheet({ value, onClose }) {
  const { state, mutate } = useStore();
  const bar = Number(state.settings.barKg) || 20;
  const [w, setW] = useState('');
  const [key, setKey] = useState(null);
  if (value && value.name !== key) {
    setKey(value.name);
    setW(value.weight || '');
  }
  if (!value && key) setKey(null);
  if (!value) return null;
  const load = platesPerSide(w, bar);
  const ramp = warmupRamp(w, bar);
  const perSide = (x) => {
    const p = platesPerSide(x, bar).plates;
    return p.length ? p.join(' + ') : 'empty bar';
  };
  return (
    <Sheet open onClose={onClose} title={value.name}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Working weight">
            <NumInput value={w} onChange={setW} suffix="kg" className="text-lg font-semibold" />
          </Field>
          <Field label="Bar">
            <NumInput value={state.settings.barKg} onChange={(v) => mutate((d) => (d.settings.barKg = v === '' ? '' : Number(v)))} suffix="kg" />
          </Field>
        </div>

        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted">EACH SIDE</p>
          <div className="mt-3 flex h-24 items-center" aria-hidden>
            <div className="h-3 w-10 rounded-l bg-faint" />
            <div className="h-8 w-2 bg-muted" />
            {load.plates.map((p, i) => (
              <div key={i} className="mx-[1px] rounded-sm" style={{ height: PLATE_STYLE[p].h, width: p >= 10 ? 14 : 10, background: PLATE_STYLE[p].bg, border: '1px solid rgba(140,150,165,.55)' }} />
            ))}
            <div className="h-3 flex-1 rounded-r bg-faint" />
          </div>
          <p className="tnum mt-3 text-lg font-semibold">{Number(w) > bar ? perSide(w) : Number(w) === bar ? 'Empty bar' : 'Enter a weight above the bar'}</p>
          {load.leftover > 0.01 && <p className="text-sm text-warn">Can't make exactly {w} kg; {load.leftover} kg short with standard plates.</p>}
        </div>

        {ramp.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Warm-up ramp</p>
            <ul className="divide-y divide-line/60 rounded-xl border border-line">
              {ramp.map((x, i) => (
                <li key={i} className="tnum flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="font-semibold">
                    {x.w} kg × {x.r}
                  </span>
                  <span className="truncate text-muted">{perSide(x.w)}</span>
                </li>
              ))}
              <li className="tnum flex items-center justify-between gap-3 bg-lift/10 px-3 py-2.5 text-sm">
                <span className="font-semibold">{w} kg · working sets</span>
                <span className="truncate text-muted">{perSide(w)}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-faint">Warm-ups prime the lift without tiring you. Rest about 60 s between them; they don't need logging.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Elapsed({ startedAt, extra }) {
  const now = useTicker(1000);
  return (
    <span className="tnum">
      Started {fmtTime(startedAt)} · {fmtDuration((now - startedAt) / 1000)} · {extra}
    </span>
  );
}
