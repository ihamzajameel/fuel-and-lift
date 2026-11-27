import { useMemo, useState } from 'react';
import { Activity, Check, ChevronLeft, ChevronRight, CircleCheck, Dumbbell, Flame, Info, ListChecks, Moon, Ruler, Scale, Sparkles, Target, Trash2, TriangleAlert, Trophy, Footprints, X } from 'lucide-react';
import { dayTimeline, isOccurrenceDone, isOccurrenceMissed, routineConsistency } from '../lib/reminders';
import { reminderIcon } from '../components/chrome';
import SleepEditor from '../components/SleepEditor';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Chip, Empty, Field, IconButton, NumInput, ScreenHeader, Segmented, cx, fmtNum } from '../components/ui';
import { ColumnChart, LineChart } from '../components/charts';
import { bestStreak, currentStreak, lastNKeys, nutritionSummary, takenInLast, trend, weeklyBody } from '../lib/stats';
import { bodyTrend, dailyScore, insights } from '../lib/coach';
import { exerciseNamesWithHistory, fmtSet, strengthHistory } from '../lib/workout';
import { dayTotals, fmtHM, fromLen, lenUnit, toLen } from '../lib/nutrition';
import { addDays, fmt12, fmtDay, fmtShortDate, parseYmd } from '../lib/time';
import * as ops from '../lib/ops';

export default function Progress() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('fuel-lift:ptab') || 'coach');
  const pick = (t) => {
    setTab(t);
    sessionStorage.setItem('fuel-lift:ptab', t);
  };
  return (
    <>
      <ScreenHeader title="Progress" subtitle="Trends, coaching & consistency" />
      <div className="sticky top-[calc(env(safe-area-inset-top)+57px)] z-10 bg-bg/90 px-3 pt-3 pb-2 backdrop-blur-md">
        <Segmented
          value={tab}
          onChange={pick}
          options={[
            { value: 'coach', label: 'Coach' },
            { value: 'body', label: 'Body' },
            { value: 'strength', label: 'Strength' },
            { value: 'habits', label: 'Habits' },
          ]}
        />
      </div>
      <div className="space-y-3 px-3 pt-1">
        {tab === 'coach' && <CoachTab />}
        {tab === 'body' && <BodyTab />}
        {tab === 'strength' && <StrengthTab />}
        {tab === 'habits' && <HabitsTab />}
      </div>
    </>
  );
}

const TONE_ICON = { good: CircleCheck, warn: TriangleAlert, info: Info };
const TONE_CLS = { good: 'text-good', warn: 'text-warn', info: 'text-water' };

// ---------------------------------------------------------------- Coach
function CoachTab() {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const list = useMemo(() => insights(state, today), [state, today]);
  const sum = useMemo(() => nutritionSummary(state, today, 7), [state, today]);
  const t = state.targets;
  const days14 = lastNKeys(today, 14);

  const apply = (a) => {
    const kcal = Math.round(t.kcal + a.delta);
    if (!confirm(`Change your calorie target from ${fmtNum(t.kcal)} to ${fmtNum(kcal)} kcal? Carbs adjust by ${a.delta > 0 ? '+' : ''}${Math.round(a.delta / 4)} g; protein stays at ${t.p} g.`)) return;
    mutate((d) => ops.applyKcalDelta(d, a.delta));
    toast(`Calorie target is now ${fmtNum(kcal)} kcal`);
  };

  return (
    <>
      <ScoreCard />
      {list.map((i) => {
        const Icon = TONE_ICON[i.tone];
        return (
          <Card key={i.id}>
            <div className="flex gap-3">
              <Icon size={20} className={cx('mt-0.5 shrink-0', TONE_CLS[i.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{i.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{i.text}</p>
                {i.action && (
                  <Button size="sm" variant="primary" className="mt-3" onClick={() => apply(i.action)}>
                    Apply {i.action.label}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      <Card title="Last 7 days" icon={Activity}>
        {sum.loggedDays === 0 ? (
          <p className="text-sm text-muted">Log a few days of food and water to see averages.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Avg calories" value={fmtNum(sum.avgKcal)} sub={`target ${fmtNum(t.kcal)}`} />
            <Stat label="Avg protein" value={`${sum.avgP} g`} sub={`hit ${sum.proteinHits}/${sum.loggedDays} days`} />
            <Stat label="Avg water" value={`${(sum.avgWater / 1000).toFixed(1)} L`} sub={`hit ${sum.waterHits}/${sum.loggedDays} days`} />
            <Stat label="Calories in range" value={`${sum.kcalInRange}/${sum.loggedDays}`} sub="within ±10%" />
          </div>
        )}
      </Card>

      <Card title="Calories · 14 days">
        <ColumnChart
          ariaLabel="Daily calories for the last 14 days"
          bars={days14.map((k) => ({ key: k, label: String(parseYmd(k).getDate()), sub: fmtDay(k, today), value: dayTotals(state.days[k]).kcal }))}
          target={t.kcal}
          targetLabel={`Target ${fmtNum(t.kcal)}`}
          unit="kcal"
          tone="var(--accent)"
        />
      </Card>
      <Card title="Protein · 14 days">
        <ColumnChart
          ariaLabel="Daily protein for the last 14 days"
          bars={days14.map((k) => ({ key: k, label: String(parseYmd(k).getDate()), sub: fmtDay(k, today), value: dayTotals(state.days[k]).p }))}
          target={t.p}
          targetLabel={`Target ${t.p} g`}
          unit="g"
          tone="var(--protein)"
        />
      </Card>
    </>
  );
}

function ScoreCard() {
  const { state, today } = useStore();
  const s = dailyScore(state, today);
  const y = dailyScore(state, addDays(today, -1));
  return (
    <Card title="Today's score" icon={Sparkles} right={y.logged && <span className="tnum text-sm text-muted">Yesterday {y.score}</span>}>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="tnum text-5xl leading-none font-bold">{s.score}</p>
          <p className="mt-1 text-xs text-muted">/ 100</p>
        </div>
        <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1 text-sm">
          {s.items.map((i) => (
            <li key={i.id} className={cx('flex items-center gap-2', i.ok ? 'text-fg' : 'text-faint')}>
              <CircleCheck size={15} className={i.ok ? 'text-accent' : 'text-line'} aria-hidden />
              <span className="truncate">{i.label}</span>
              <span className="tnum ml-auto text-xs text-faint">{i.w}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
      {sub && <p className="tnum text-xs text-faint">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Body
const MEASURES = [
  { f: 'waist', label: 'Waist', hint: 'at the navel, relaxed' },
  { f: 'chest', label: 'Chest', hint: 'nipple line, arms down' },
  { f: 'arm', label: 'Bicep', hint: 'flexed, widest point' },
];

function GoalBar({ label, start, now, goal, fmt, sub }) {
  if (goal == null || now == null) return null;
  const pct = start === goal ? 100 : Math.max(0, Math.min(100, ((now - start) / (goal - start)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tnum text-muted">
          <b className="text-fg">{fmt(now)}</b> → {fmt(goal)}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {sub && <p className="tnum mt-1 text-xs text-faint">{sub}</p>}
    </div>
  );
}

function BodyTab() {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const unit = lenUnit(state);
  const u = unit === 'in' ? 'in' : 'cm';
  const [date, setDate] = useState(today);
  const entryFor = (k) => state.body.find((b) => b.date === k) || {};
  const blankForm = (k) => {
    const e = entryFor(k);
    return { weight: e.weight ?? '', waist: toLen(e.waist, unit) ?? '', chest: toLen(e.chest, unit) ?? '', arm: toLen(e.arm, unit) ?? '' };
  };
  const [form, setForm] = useState(() => blankForm(today));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const height = state.profile.heightCm;
  const goals = state.profile.goals || {};

  const save = () => {
    if (Object.values(form).every((v) => v === '')) return;
    mutate((d) =>
      ops.upsertBody(d, { date, weight: form.weight, waist: fromLen(form.waist, unit), chest: fromLen(form.chest, unit), arm: fromLen(form.arm, unit) })
    );
    toast('Measurements saved');
  };

  const w = trend(state.body, 'weight');
  const tr = Object.fromEntries(MEASURES.map((m) => [m.f, trend(state.body, m.f)]));
  const whtr = tr.waist ? tr.waist.value / height : null;
  const weekly = weeklyBody(state.body).slice(0, 8);
  const L = (cm) => (cm == null ? '–' : `${toLen(cm, unit)}${unit === 'in' ? '"' : ' cm'}`);
  const delta = (v, isLen, upGood) => {
    if (v == null) return '–';
    const val = isLen ? toLen(Math.abs(v), unit) * Math.sign(v) : v;
    const good = upGood ? v > 0 : v < 0;
    return (
      <span className={v === 0 ? '' : good ? 'text-good' : 'text-warn'}>
        {v > 0 ? '+' : ''}
        {Math.round(val * 10) / 10}
        {isLen ? (unit === 'in' ? '"' : ' cm') : ' kg'}
      </span>
    );
  };
  const bulking = state.profile.goalType === 'lean_bulk';
  const startWeight = state.body.find((b) => b.weight)?.weight ?? state.profile.weightKg;
  const wTrend = bodyTrend(state.body, 'weight', today);
  const eta =
    wTrend && wTrend.perWeek > 0.05 && w && state.profile.targetWeight > w.value
      ? `~${Math.ceil((state.profile.targetWeight - w.value) / wTrend.perWeek)} weeks at your current rate (+${Math.round(wTrend.perWeek * 100) / 100} kg/week)`
      : bulking
        ? 'Aim for +0.2–0.35 kg/week (about 5–6 months to goal)'
        : null;
  const firstOf = (f) => state.body.find((b) => b[f] != null)?.[f];

  return (
    <>
      <Card title="Goals" icon={Target} right={<Segmented size="sm" className="w-24" value={unit} onChange={(v) => mutate((d) => (d.settings.measureUnit = v))} options={[{ value: 'in', label: 'in' }, { value: 'cm', label: 'cm' }]} />}>
        <div className="space-y-4">
          <GoalBar label="Body weight" start={startWeight} now={w?.value ?? state.profile.weightKg} goal={state.profile.targetWeight} fmt={(v) => `${v} kg`} sub={eta} />
          <GoalBar
            label="Waist (belly)"
            start={firstOf('waist')}
            now={tr.waist?.value}
            goal={goals.waist ?? height * 0.5}
            fmt={L}
            sub={
              tr.waist
                ? `Healthy is under ${L(height * 0.5)} (half your height). On a lean bulk, keep it from growing.`
                : 'Measure at the belly button on Sunday mornings to start tracking.'
            }
          />
          <GoalBar label="Chest" start={firstOf('chest')} now={tr.chest?.value} goal={goals.chest} fmt={L} />
          <GoalBar
            label="Bicep"
            start={firstOf('arm')}
            now={tr.arm?.value}
            goal={goals.arm}
            fmt={L}
            sub={goals.armStretch ? `Stretch goal ${L(goals.armStretch)}` : null}
          />
          <p className="text-xs text-faint">
            Waist is your belly-fat alarm{bulking ? ': on a lean bulk it should stay roughly flat while chest and arms grow' : ''}. Measure it weekly, same time, at the navel.
          </p>
        </div>
      </Card>

      <Card title="Log measurements" icon={Scale}>
        <Field label="Date">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              const k = e.target.value || today;
              setDate(k);
              setForm(blankForm(k));
            }}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg"
          />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Weight">
            <NumInput value={form.weight} onChange={(v) => set('weight', v)} suffix="kg" placeholder={String(state.profile.weightKg)} />
          </Field>
          {MEASURES.map((m) => (
            <Field key={m.f} label={m.label}>
              <NumInput value={form[m.f]} onChange={(v) => set(m.f, v)} suffix={u} placeholder="–" />
            </Field>
          ))}
        </div>
        <Button variant="primary" className="mt-3 w-full" onClick={save}>
          Save
        </Button>
        <p className="mt-2 text-xs text-faint">Weigh in the morning after the washroom, before your shake. Measure waist at the navel (relaxed), chest at nipple line, bicep flexed at the widest point.</p>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card className="!p-3">
          <p className="text-xs text-muted">Weight</p>
          <p className="tnum text-xl font-bold">{w ? w.value : '–'}<span className="text-xs font-normal text-muted"> kg</span></p>
          <p className="tnum text-xs text-muted">4 wk {delta(w?.since4w, false, bulking)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-muted">Waist {whtr ? `· ${whtr.toFixed(2)} of height` : ''}</p>
          <p className="tnum text-xl font-bold">{L(tr.waist?.value)}</p>
          <p className="tnum text-xs text-muted">4 wk {delta(tr.waist?.since4w, true, false)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-muted">Chest</p>
          <p className="tnum text-xl font-bold">{L(tr.chest?.value)}</p>
          <p className="tnum text-xs text-muted">4 wk {delta(tr.chest?.since4w, true, true)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-muted">Bicep</p>
          <p className="tnum text-xl font-bold">{L(tr.arm?.value)}</p>
          <p className="tnum text-xs text-muted">4 wk {delta(tr.arm?.since4w, true, true)}</p>
        </Card>
      </div>

      <Card title="Body weight (kg)" icon={Scale}>
        {state.body.filter((b) => b.weight).length ? (
          <LineChart
            ariaLabel="Body weight over time"
            points={state.body.filter((b) => b.weight).map((b) => ({ date: b.date, value: b.weight }))}
            unit="kg"
            tone="var(--water)"
            goal={state.profile.targetWeight}
            goalLabel={`Goal ${state.profile.targetWeight} kg`}
          />
        ) : (
          <p className="text-sm text-muted">No weigh-ins yet.</p>
        )}
      </Card>

      {MEASURES.map((m) => {
        const pts = state.body.filter((b) => b[m.f]).map((b) => ({ date: b.date, value: toLen(b[m.f], unit) }));
        const goal = m.f === 'waist' ? (unit === 'in' ? toLen(height * 0.5, unit) : Math.floor(height * 0.5)) : goals[m.f] != null ? toLen(goals[m.f], unit) : null;
        return (
          <Card key={m.f} title={`${m.label} (${u})`} icon={Ruler}>
            {pts.length ? (
              <LineChart
                ariaLabel={`${m.label} over time`}
                points={pts}
                unit={u}
                tone="var(--accent)"
                goal={goal}
                goalLabel={m.f === 'waist' ? `Healthy < ${goal}` : `Goal ${goal}`}
              />
            ) : (
              <p className="text-sm text-muted">
                {m.f === 'waist' ? 'Measure your waist once to set a baseline. It tells you whether the weight you gain is muscle or belly fat.' : `No ${m.label.toLowerCase()} measurements yet.`}
              </p>
            )}
          </Card>
        );
      })}

      {weekly.length > 0 && (
        <Card title="Weekly averages" padded={false}>
          <table className="tnum w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pl-4 font-medium">Week</th>
                <th className="py-2 text-right font-medium">kg</th>
                <th className="py-2 text-right font-medium">Waist</th>
                <th className="py-2 text-right font-medium">Chest</th>
                <th className="py-2 pr-4 text-right font-medium">Bicep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {weekly.map((r) => (
                <tr key={r.week}>
                  <td className="py-2.5 pl-4">{fmtShortDate(r.week)}</td>
                  <td className="py-2.5 text-right">{r.weight ?? '–'}</td>
                  <td className="py-2.5 text-right">{r.waist ? toLen(r.waist, unit) : '–'}</td>
                  <td className="py-2.5 text-right">{r.chest ? toLen(r.chest, unit) : '–'}</td>
                  <td className="py-2.5 pr-4 text-right">{r.arm ? toLen(r.arm, unit) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {state.body.length > 0 && (
        <Card title="All entries" padded={false}>
          <ul className="divide-y divide-line/60">
            {[...state.body].reverse().slice(0, 30).map((b) => (
              <li key={b.date} className="tnum flex items-center gap-2 py-1.5 pr-2 pl-4 text-sm">
                <span className="min-w-0 flex-1 truncate">{fmtDay(b.date, today)}</span>
                <span className="text-right text-muted">
                  {[b.weight && `${b.weight} kg`, b.waist && `W ${toLen(b.waist, unit)}`, b.chest && `C ${toLen(b.chest, unit)}`, b.arm && `B ${toLen(b.arm, unit)}`].filter(Boolean).join(' · ')}
                </span>
                <IconButton icon={Trash2} size={15} label="Delete entry" className="!h-9 !w-9 hover:text-danger" onClick={() => confirm('Delete this entry?') && mutate((d) => ops.removeBody(d, b.date))} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Strength
function StrengthTab() {
  const { state, today } = useStore();
  const names = useMemo(() => exerciseNamesWithHistory(state.sessions), [state.sessions]);
  const [sel, setSel] = useState(null);
  const name = sel || names[0]?.name;
  const hist = useMemo(() => (name ? strengthHistory(state.sessions, name) : []), [state.sessions, name]);

  if (!names.length)
    return (
      <Card>
        <Empty icon={Dumbbell} title="No lifts logged yet">
          Finish a workout and your estimated 1-rep max for every exercise is charted here.
        </Empty>
      </Card>
    );

  const bw = hist[0]?.bw;
  const unit = bw ? (hist[0]?.unit === 'sec' ? 's' : 'reps') : 'kg';
  const best = hist.reduce((a, p) => (p.value > (a?.value || 0) ? p : a), null);
  const first = hist[0];
  const last = hist[hist.length - 1];
  const gain = first && last && hist.length > 1 ? Math.round((last.value - first.value) * 10) / 10 : null;

  return (
    <>
      <div className="scrollbar-none -mx-3 flex gap-2 overflow-x-auto px-3">
        {names.map((n) => (
          <Chip key={n.name} active={n.name === name} onClick={() => setSel(n.name)}>
            {n.name}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Card className="!p-3">
          <p className="text-xs text-muted">{bw ? 'Best set' : 'Best e1RM'}</p>
          <p className="tnum text-xl font-bold">
            {best?.value ?? '–'}
            <span className="text-xs font-normal text-muted"> {unit}</span>
          </p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-muted">Change</p>
          <p className={cx('tnum text-xl font-bold', gain > 0 && 'text-good')}>{gain == null ? '–' : `${gain > 0 ? '+' : ''}${gain}`}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-muted">Sessions</p>
          <p className="tnum text-xl font-bold">{hist.length}</p>
        </Card>
      </div>
      <Card title={bw ? `${name} · best set` : `${name} · estimated 1RM`} icon={Trophy} iconClass="text-lift">
        <LineChart
          ariaLabel={`${name} progression`}
          points={hist.map((p) => ({ date: p.date, value: p.value, note: `Best: ${fmtSet(p.best, { unit: p.unit })}${p.bw ? '' : ' kg'}` }))}
          unit={unit}
          tone="var(--lift)"
        />
        {!bw && <p className="mt-2 text-xs text-faint">Estimated 1-rep max (Epley) from your best set each session. It rises when you add weight or reps.</p>}
      </Card>
      <Card title="History" padded={false}>
        <ul className="divide-y divide-line/60">
          {[...hist].reverse().slice(0, 12).map((p, i) => (
            <li key={p.date + i} className="tnum flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="shrink-0 text-muted">{fmtDay(p.date, today)}</span>
              <span className="truncate text-right">{p.sets.map((s) => fmtSet(s, { unit: p.unit })).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Habits
function HabitsTab() {
  const { state, today } = useStore();
  const keys28 = lastNKeys(today, 28);
  const [hover, setHover] = useState(null);
  const [checkDate, setCheckDate] = useState(today);
  const scores = useMemo(() => keys28.map((k) => ({ k, ...dailyScore(state, k) })), [state, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys30 = lastNKeys(today, 30);
  const sleeps = lastNKeys(today, 7).map((k) => state.days[k]?.sleep?.hours).filter(Boolean);
  const steps = lastNKeys(addDays(today, -1), 7).map((k) => state.days[k]?.steps).filter(Boolean);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const h = hover != null ? scores[hover] : null;

  return (
    <>
      <DayCheck date={checkDate} setDate={setCheckDate} />
      <RoutineConsistency />
      <Card title="Supplement streaks" icon={Flame} iconClass="text-lift">
        <div className="space-y-4">
          {state.supplements.map((s) => {
            const cur = currentStreak(state.days, s.id, today);
            return (
              <div key={s.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="tnum text-sm text-muted">
                    <b className="text-fg">{cur}</b> day streak · best {bestStreak(state.days, s.id)} · {takenInLast(state.days, s.id, today, 30)}/30
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[2px]" role="img" aria-label={`${s.name}: last 30 days`}>
                  {keys30.map((k) => (
                    <span key={k} title={`${fmtShortDate(k)}: ${state.days[k]?.supps?.[s.id] ? 'taken' : 'missed'}`} className={cx('h-5 rounded-[3px]', state.days[k]?.supps?.[s.id] ? (s.id === 'creatine' ? 'bg-lift' : 'bg-accent') : 'bg-surface-3')} />
                  ))}
                </div>
                {s.id === 'creatine' && (
                  <p className="mt-1.5 text-xs text-faint">{cur >= 30 ? '30+ day streak. Fully saturated, keep it rolling.' : `${30 - cur} more days to a 30-day streak.`}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Daily score · 4 weeks" icon={Sparkles}>
        <div className="relative">
          <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[10px] text-faint">
            {keys28.slice(0, 7).map((k) => (
              <span key={k}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][parseYmd(k).getDay()]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5" onPointerLeave={() => setHover(null)}>
            {scores.map((d, i) => (
              <button
                key={d.k}
                type="button"
                onPointerEnter={() => setHover(i)}
                onClick={() => {
                  setHover(i);
                  setCheckDate(d.k);
                  document.getElementById('day-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                onFocus={() => setHover(i)}
                aria-label={`${fmtShortDate(d.k)}: score ${d.logged ? d.score : 'no data'}`}
                className={cx('tnum aspect-square rounded-md text-[11px] font-semibold', hover === i && 'ring-2 ring-fg/60', d.k === today && 'outline outline-1 outline-offset-1 outline-muted')}
                style={{ background: d.logged ? `color-mix(in oklab, var(--accent) ${15 + d.score * 0.75}%, var(--surface-2))` : 'var(--surface-2)', color: d.logged && d.score >= 60 ? 'var(--on-accent)' : 'var(--muted)' }}
              >
                {d.logged ? d.score : ''}
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-xs text-muted">
            {h ? (
              <>
                <b className="text-fg">{fmtDay(h.k, today)}</b> · {h.logged ? `${h.score}/100 · ${h.items.filter((x) => x.ok).map((x) => x.id).join(', ') || 'nothing hit'}` : 'no data'}
              </>
            ) : (
              'Protein, calories, water, training/steps, creatine and sleep. Tap a day to see it and mark what you missed.'
            )}
          </p>
        </div>
      </Card>

      <Card title="Sleep · 14 days" icon={Moon}>
        <ColumnChart
          ariaLabel="Hours slept, last 14 days"
          bars={lastNKeys(today, 14).map((k) => ({ key: k, label: String(parseYmd(k).getDate()), sub: `${fmtDay(k, today)} · ${fmtHM(state.days[k]?.sleep?.hours)}`, value: state.days[k]?.sleep?.hours || 0 }))}
          target={state.targets.sleepHours}
          targetLabel={`Goal ${fmtHM(state.targets.sleepHours)}`}
          unit="h"
          tone="var(--fat)"
        />
        <p className="mt-1 text-xs text-faint">Fix any night in Day check above: pick the date and change the times.</p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Card className="!p-3.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Moon size={14} /> Avg sleep (7d)
          </p>
          <p className="tnum mt-0.5 text-2xl font-bold">{avg(sleeps) ? fmtHM(avg(sleeps)) : '–'}</p>
          <p className="text-xs text-faint">goal {fmtHM(state.targets.sleepHours)}</p>
        </Card>
        <Card className="!p-3.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Footprints size={14} /> Avg steps (7d)
          </p>
          <p className="tnum mt-0.5 text-2xl font-bold">{avg(steps) ? fmtNum(avg(steps)) : '–'}</p>
          <p className="text-xs text-faint">goal {fmtNum(state.targets.steps)}</p>
        </Card>
      </div>
    </>
  );
}

/** Mark each routine item done or missed for any day. */
function DayCheck({ date, setDate }) {
  const { state, mutate, today, now } = useStore();
  const { toast } = useApp();
  const start = state.settings.dayStartHour;
  const occ = dayTimeline(state.reminders, date, start).filter((o) => state.reminders.find((r) => r.id === o.id)?.kind !== 'interval');

  const toggleDone = (rem, o, done) => {
    if (done) {
      mutate((d) => ops.markDone(d, date, o.okey, false));
      if (isOccurrenceDone(rem, { ...o }, { ...state, days: { ...state.days, [date]: { ...state.days[date], done: {} } } }))
        toast('Items you logged stay in Food. Remove them there to fully undo.');
      return;
    }
    mutate((d) => ops.runReminderActions(d, date, rem, o.okey, Math.min(o.at, Date.now())));
    toast(`Done: ${rem.title}`);
  };

  return (
    <section id="day-check" className="scroll-mt-32">
      <Card
        title="Day check"
        icon={ListChecks}
        right={
          <div className="flex items-center">
            <IconButton icon={ChevronLeft} label="Previous day" size={18} className="!h-9 !w-9" onClick={() => setDate(addDays(date, -1))} />
            <button type="button" onClick={() => setDate(today)} className="min-w-20 text-center text-sm font-semibold">
              {fmtDay(date, today)}
            </button>
            <IconButton icon={ChevronRight} label="Next day" size={18} className="!h-9 !w-9 disabled:opacity-30" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} />
          </div>
        }
      >
        <p className="-mt-1 mb-2 text-xs text-faint">✓ marks it done and logs its food, water or supplement. ✗ records it as missed. Tap again to undo.</p>
        <ul className="divide-y divide-line/60">
          {occ.map((o) => {
            const rem = state.reminders.find((r) => r.id === o.id);
            const done = isOccurrenceDone(rem, o, state);
            const missed = isOccurrenceMissed(o, state);
            const Icon = reminderIcon(rem.icon);
            const future = date === today && o.at > now;
            return (
              <li key={o.okey} className="flex items-center gap-2.5 py-2">
                <span className="tnum w-[58px] shrink-0 text-xs text-muted">{fmt12(o.time)}</span>
                <Icon size={16} className="shrink-0 text-faint" aria-hidden />
                <span className={cx('min-w-0 flex-1 truncate text-sm font-medium', (done || missed) && 'text-muted', future && 'text-faint')}>{rem.title}</span>
                <button
                  type="button"
                  aria-label={`${rem.title}: done`}
                  aria-pressed={done}
                  onClick={() => toggleDone(rem, o, done)}
                  className={cx('press grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2', done ? 'border-accent bg-accent text-on-accent' : 'border-line text-faint hover:text-fg')}
                >
                  <Check size={18} strokeWidth={3} />
                </button>
                <button
                  type="button"
                  aria-label={`${rem.title}: missed`}
                  aria-pressed={missed}
                  onClick={() => mutate((d) => ops.markMissed(d, date, o.okey, !missed))}
                  className={cx('press grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2', missed ? 'border-danger bg-danger/20 text-danger' : 'border-line text-faint hover:text-fg')}
                >
                  <X size={18} strokeWidth={3} />
                </button>
              </li>
            );
          })}
        </ul>
        {occ.length === 0 && <p className="text-sm text-muted">No routine items on this day.</p>}
        <div className="mt-3 border-t border-line/60 pt-3">
          <SleepEditor key={date} dateKey={date} title={date === today ? 'Sleep last night' : `Sleep (night before ${fmtDay(date, today)})`} />
        </div>
      </Card>
    </section>
  );
}

function RoutineConsistency() {
  const { state, today } = useStore();
  const rows = useMemo(() => routineConsistency(state, today, 30), [state, today]);
  if (!rows.some((r) => r.done || r.missed)) return null;
  return (
    <Card title="Routine · last 30 days" icon={Activity}>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.rem.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.rem.title}</span>
              <span className="tnum shrink-0 text-xs text-muted">
                <b className="text-fg">{r.done}</b> ✓ · <b className="text-fg">{r.missed}</b> ✗{r.open ? ` · ${r.open} unmarked` : ''}
              </span>
            </div>
            <div className="mt-1.5 flex h-2 gap-[2px]" role="img" aria-label={`${r.rem.title}: ${r.done} done, ${r.missed} missed, ${r.open} unmarked`}>
              {r.done > 0 && <span className="rounded-full bg-good" style={{ flex: r.done }} />}
              {r.missed > 0 && <span className="rounded-full bg-danger" style={{ flex: r.missed }} />}
              {r.open > 0 && <span className="rounded-full bg-surface-3" style={{ flex: r.open }} />}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">Green done · red missed · grey not marked. Use Day check to fill in past days.</p>
    </Card>
  );
}
