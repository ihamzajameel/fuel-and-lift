import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Check, ChevronRight, Droplet, Dumbbell, Flame, Pill, Plus, Undo2, Utensils, CalendarClock, Footprints, Lightbulb, ListChecks, Minus, MoonStar, TriangleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Dot, NumInput, ProgressBar, Ring, ScreenHeader, TONES, cx, fmtNum } from '../components/ui';
import FoodSheet from '../components/FoodSheet';
import UsualDaySheet from '../components/UsualDaySheet';
import PhotoButton from '../components/PhotoButton';
import SleepEditor from '../components/SleepEditor';
import { reminderIcon } from '../components/chrome';
import { dayTotals, fmtL, paceStatus, waterPaceTarget } from '../lib/nutrition';
import { dayTimeline, describeActions, isOccurrenceDone, isOccurrenceMissed, mealLabel, reminderChoices } from '../lib/reminders';
import { dailyScore, insights } from '../lib/coach';
import { currentStreak } from '../lib/stats';
import { nextDayIndex, sessionStats } from '../lib/workout';
import { addDays, fmt12, fmtDay, fmtTime, minutesIntoDay, toMin, uid } from '../lib/time';
import { notifPermission } from '../lib/notify';
import * as ops from '../lib/ops';

export default function Today() {
  const { state, today, now } = useStore();
  const { go } = useApp();
  const [foodSheet, setFoodSheet] = useState(false);
  const start = state.settings.dayStartHour;
  const tot = dayTotals(state.days[today]);

  // Around gym time, the workout card moves to the top.
  const rel = (t) => (toMin(t) - start * 60 + 1440) % 1440;
  const nowRel = minutesIntoDay(new Date(now), start);
  const gymRel = rel(state.profile.gymTime);
  const gymFirst = nowRel >= gymRel - 45 && nowRel <= gymRel + 150;

  const perm = notifPermission();
  const score = dailyScore(state, today);
  const bedRel = rel(state.profile.bedTime);
  const toBed = bedRel - nowRel;
  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const subtitle =
    toBed > 0 && toBed <= 180
      ? `Bed in ${Math.floor(toBed / 60) ? `${Math.floor(toBed / 60)}h ` : ''}${toBed % 60}m · ${fmt12(state.profile.bedTime)}`
      : toBed <= 0 && toBed > -150
        ? `Past bedtime (${fmt12(state.profile.bedTime)})`
        : dateLabel;

  return (
    <>
      <ScreenHeader
        subtitle={
          <span className={cx('inline-flex items-center gap-1', toBed <= 0 && toBed > -150 ? 'text-warn' : toBed > 0 && toBed <= 180 ? 'text-fat' : '')}>
            {toBed > -150 && toBed <= 180 && <MoonStar size={12} aria-hidden />}
            {subtitle}
          </span>
        }
        title="Today"
        right={
          <>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('fuel-lift:ptab', 'coach');
                go('progress');
              }}
              className="press tnum flex h-9 items-center gap-1 rounded-full border border-line bg-surface-2 px-3 text-sm font-semibold"
              aria-label={`Daily score ${score.score} of 100`}
            >
              <span className={cx('h-2 w-2 rounded-full', score.score >= 75 ? 'bg-good' : score.score >= 40 ? 'bg-warn' : 'bg-faint')} />
              {score.score}
            </button>
            <button
              type="button"
              onClick={() => go('more', 'reminders')}
              className="press relative grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-surface-2"
              aria-label="Reminders"
            >
              {perm === 'granted' ? <BellRing size={20} /> : <Bell size={20} />}
              {perm !== 'granted' && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-bg bg-warn" />}
            </button>
          </>
        }
      />
      <div className="space-y-3 px-3 pt-3">
        {state.meta.planNotice && <PlanNotice />}
        {gymFirst && <WorkoutCard />}
        <EnergyCard tot={tot} />
        <WaterCard tot={tot} />
        <PlanCard />
        <QuickLog onCustom={(x) => setFoodSheet(x || true)} />
        <SupplementsCard />
        <RecoveryCard />
        <CoachTip />
        {!gymFirst && <WorkoutCard />}
        <p className="px-2 pt-1 pb-2 text-center text-xs text-faint">
          Your day resets at {fmt12(`${String(start).padStart(2, '0')}:00`)}. Anything logged after midnight counts toward today.
        </p>
      </div>
      <FoodSheet
        open={!!foodSheet}
        onClose={() => setFoodSheet(false)}
        mode="log"
        dateKey={today}
        initial={foodSheet?.initial}
        estimate={foodSheet?.estimate}
      />
    </>
  );
}

function EnergyCard({ tot }) {
  const { state } = useStore();
  const t = state.targets;
  const left = t.kcal - tot.kcal;
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Ring value={tot.kcal} max={t.kcal} size={132} stroke={12}>
          <div>
            <div className="text-[30px] leading-none font-bold">{fmtNum(Math.abs(left))}</div>
            <div className="mt-1 text-xs text-muted">{left < 0 ? 'kcal over' : 'kcal left'}</div>
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-3">
          {['p', 'c', 'f'].map((k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <Dot tone={k} />
                  {TONES[k].label}
                </span>
                <span className="tnum">
                  <b>{Math.round(tot[k])}</b>
                  <span className="text-muted"> / {t[k]} g</span>
                </span>
              </div>
              <ProgressBar value={tot[k]} max={t[k]} tone={k} className="mt-1.5" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 text-sm text-muted">
        <span>
          Eaten <b className="tnum text-fg">{fmtNum(tot.kcal)}</b> of {fmtNum(t.kcal)} kcal
        </span>
        <span className="tnum">
          {tot.p >= t.p ? (
            <span className="font-medium text-good">Protein hit ✓</span>
          ) : (
            <>
              <b className="text-fg">{Math.round(t.p - tot.p)} g</b> protein to go
            </>
          )}
        </span>
      </div>
    </Card>
  );
}

function WaterCard({ tot }) {
  const { state, mutate, today, now } = useStore();
  const { toast } = useApp();
  const t = state.targets;
  const pace = waterPaceTarget(new Date(now), t, state.settings.dayStartHour);
  const status = paceStatus(tot.water, pace);
  const water = state.days[today]?.water || [];
  const last = water[water.length - 1];

  const add = (ml) => {
    const id = uid();
    mutate((d) => ops.addWater(d, today, ml, id));
    toast(`+${ml} ml water`, { label: 'Undo', run: () => mutate((d) => ops.removeWater(d, today, id)) }, 2500);
  };

  return (
    <Card
      title="Water"
      icon={Droplet}
      iconClass="text-water"
      right={
        <span
          className={cx(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            status.tone === 'good' ? 'bg-good/15 text-good' : status.tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-muted'
          )}
        >
          {status.text}
        </span>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="tnum text-3xl font-bold">{fmtL(tot.water)}</span>
        <span className="text-muted">of {fmtL(t.water)}</span>
        <span className="tnum ml-auto text-sm text-muted">{Math.round((tot.water / t.water) * 100)}%</span>
      </div>
      <ProgressBar value={tot.water} max={t.water} tone="water" marker={pace} height="h-3" className="mt-3" />
      <p className="mt-2 text-xs text-faint">
        The tick shows where you should be now: {fmtL((t.water * t.waterFrontPct) / 100)} ({t.waterFrontPct}%) by {fmt12(t.waterFrontBy)}, rest by {fmt12(t.waterEnd)}.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[150, 250, 500].map((ml) => (
          <Button key={ml} variant="water" size="lg" onClick={() => add(ml)} className="flex-col !gap-0 leading-none">
            <span className="text-lg font-bold">+{ml}</span>
            <span className="text-[11px] text-muted">ml</span>
          </Button>
        ))}
      </div>
      {last && (
        <button
          type="button"
          onClick={() => mutate((d) => ops.removeWater(d, today, last.id))}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-fg"
        >
          <Undo2 size={15} /> Undo last ({last.ml} ml at {fmtTime(last.at)})
        </button>
      )}
    </Card>
  );
}

function PlanCard() {
  const { state, mutate, today, now } = useStore();
  const { go, toast } = useApp();
  const start = state.settings.dayStartHour;
  const [open, setOpen] = useState(null);

  const items = useMemo(() => {
    const occ = dayTimeline(state.reminders, today, start);
    const out = [];
    const seenInterval = new Set();
    for (const o of occ) {
      const rem = state.reminders.find((r) => r.id === o.id);
      if (rem.kind === 'interval') {
        if (seenInterval.has(rem.id)) continue;
        seenInterval.add(rem.id);
        const slots = occ.filter((x) => x.id === rem.id);
        const next = slots.find((x) => x.at > now);
        out.push({ ...o, rem, interval: true, slots, next, done: !next });
      } else {
        out.push({ ...o, rem, done: isOccurrenceDone(rem, o, state), missed: isOccurrenceMissed(o, state) });
      }
    }
    // Food outside the routine (extras, photo logs) slots in at the time it was logged.
    const routineIds = new Set(
      state.reminders.filter((r) => r.enabled).flatMap((r) => [...(r.actions?.presetIds || []), ...(r.actions?.choosePresetIds || [])])
    );
    const routineNames = new Set(state.presets.filter((p) => routineIds.has(p.id)).map((p) => p.name.toLowerCase()));
    for (const f of state.days[today]?.foods || []) {
      const routine = f.presetId ? routineIds.has(f.presetId) : routineNames.has(String(f.name || '').toLowerCase());
      if (!routine) out.push({ okey: `food:${f.id}`, at: f.at || 0, extra: true, food: f });
    }
    return out.sort((a, b) => a.at - b.at);
  }, [state, today, start, now]);

  const nextKey = items.find((i) => !i.extra && !i.interval && !i.done && !i.missed && i.at > now - 30 * 60e3)?.okey;
  const removeExtra = (f) => {
    mutate((d) => ops.removeFood(d, today, f.id));
    toast(`Removed ${f.name}`, { label: 'Undo', run: () => mutate((d) => ops.logFood(d, today, { ...f })) });
  };
  const expanded = open ?? nextKey;

  const act = (i, choice) => {
    if (i.rem.actions?.openTab) return go(i.rem.actions.openTab);
    mutate((d) => ops.runReminderActions(d, today, i.rem, i.okey, undefined, choice?.id));
    toast(`Logged: ${choice ? mealLabel(choice.name) : i.rem.title}`);
  };

  if (!items.length)
    return (
      <Card title="Today's plan" icon={CalendarClock}>
        <p className="text-sm text-muted">No reminders enabled.</p>
      </Card>
    );

  return (
    <Card
      title="Today's plan"
      icon={CalendarClock}
      right={
        <button type="button" onClick={() => go('more', 'reminders')} className="flex h-8 items-center gap-0.5 rounded-lg px-2 text-sm text-muted hover:text-fg">
          Edit <ChevronRight size={16} />
        </button>
      }
    >
      <ol className="relative">
        {items.map((i, idx) => {
          if (i.extra) {
            const f = i.food;
            const isOpen = open === i.okey;
            return (
              <li key={i.okey} className="relative flex gap-3">
                {idx < items.length - 1 && <span className="absolute top-10 bottom-0 left-[61px] w-px bg-line" aria-hidden />}
                <span className="tnum w-11 shrink-0 pt-2.5 text-right text-xs text-muted">{fmtTime(i.at).replace(' ', '\u00a0')}</span>
                <span className="z-[1] mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-carbs/60 bg-carbs/15 text-carbs">
                  <Plus size={16} strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1 pb-3">
                  <button type="button" onClick={() => setOpen(isOpen ? '' : i.okey)} className="flex min-h-10 w-full items-center justify-between gap-2 text-left" aria-expanded={isOpen}>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="tnum block text-xs text-muted">
                        Extra · {fmtNum(f.kcal)} kcal · {Math.round(f.p || 0)} g protein
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-carbs/15 px-2 py-0.5 text-[11px] font-semibold text-carbs">EXTRA</span>
                  </button>
                  {isOpen && (
                    <div className="anim-fade mt-1 rounded-xl bg-surface-2 p-3">
                      <p className="tnum text-sm text-muted">
                        {f.qty} {f.unit} · {fmtNum(f.kcal)} kcal · P {Math.round(f.p || 0)} · C {Math.round(f.c || 0)} · F {Math.round(f.f || 0)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => go('food')}>
                          Edit in Food
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} className="text-danger" onClick={() => removeExtra(f)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          }
          const Icon = reminderIcon(i.rem.icon);
          const isNext = i.okey === nextKey;
          const past = i.at < now;
          const isOpen = expanded === i.okey && !i.interval;
          const actions = describeActions(i.rem, state.presets, state.supplements);
          const choices = reminderChoices(i.rem, state.presets);
          return (
            <li key={i.okey} className="relative flex gap-3">
              {idx < items.length - 1 && <span className="absolute top-10 bottom-0 left-[61px] w-px bg-line" aria-hidden />}
              <span className={cx('tnum w-11 shrink-0 pt-2.5 text-right text-xs', isNext ? 'font-semibold text-fg' : 'text-muted')}>{fmt12(i.time).replace(' ', ' ')}</span>
              <span
                className={cx(
                  'z-[1] mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2',
                  i.missed ? 'border-danger/50 bg-danger/15 text-danger' : i.done ? 'border-accent bg-accent text-on-accent' : isNext ? 'border-accent bg-surface text-accent' : past ? 'border-line bg-surface text-faint' : 'border-line bg-surface text-muted'
                )}
              >
                {i.missed ? <X size={16} strokeWidth={3} /> : i.done ? <Check size={16} strokeWidth={3} /> : <Icon size={15} />}
              </span>
              <div className="min-w-0 flex-1 pb-3">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? '' : i.okey)}
                  className="flex min-h-10 w-full items-center justify-between gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <span className={cx('font-medium leading-tight', (i.done || i.missed) && 'text-muted line-through decoration-faint')}>
                    {i.rem.title}
                    {i.interval && (
                      <span className="block text-xs font-normal text-muted no-underline">
                        Every {i.rem.every} min, {fmt12(i.rem.start)}–{fmt12(i.rem.end)} · {i.next ? `next ${fmtTime(i.next.at)}` : 'done for today'} ·{' '}
                        {i.slots.filter((s) => s.at <= now).length}/{i.slots.length}
                      </span>
                    )}
                  </span>
                  {isNext && !isOpen && <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">NEXT</span>}
                </button>
                {isOpen && (
                  <div className="anim-fade mt-1 rounded-xl bg-surface-2 p-3">
                    <p className="text-sm text-muted">{i.rem.body}</p>
                    {!i.done && !i.missed && choices.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs text-muted">What did you eat?</p>
                        <div className="flex flex-wrap gap-2">
                          {choices.map((p) => (
                            <Button
                              key={p.id}
                              variant="primary"
                              size="sm"
                              icon={Utensils}
                              onClick={() => act(i, p)}
                              className="!h-auto min-h-9 max-w-full !justify-start py-1.5 text-left leading-snug !whitespace-normal"
                            >
                              {`${mealLabel(p.name)} · ${p.kcal} kcal`}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!i.done && !i.missed && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(actions.length > 0 || i.rem.actions?.openTab) && (
                          <Button
                            variant={i.rem.actions?.openTab ? 'lift' : choices.length ? undefined : 'primary'}
                            size="sm"
                            icon={i.rem.actions?.openTab ? Dumbbell : Check}
                            onClick={() => act(i)}
                            className="!h-auto min-h-9 max-w-full !justify-start py-1.5 text-left leading-snug !whitespace-normal"
                          >
                            {i.rem.actions?.openTab ? 'Open workout' : `${choices.length ? 'Only' : 'Log'} ${actions.join(' + ')}`}
                          </Button>
                        )}
                        <Button size="sm" onClick={() => mutate((d) => ops.markDone(d, today, i.okey))}>
                          Mark done
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} className="text-danger" onClick={() => mutate((d) => ops.markMissed(d, today, i.okey))}>
                          Missed
                        </Button>
                      </div>
                    )}
                    {(i.done || i.missed) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 -ml-2"
                        onClick={() => mutate((d) => (i.missed ? ops.markMissed(d, today, i.okey, false) : ops.markDone(d, today, i.okey, false)))}
                      >
                        {i.missed ? 'Undo missed' : 'Undo done'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function QuickLog({ onCustom }) {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const [usual, setUsual] = useState(false);
  const foods = state.days[today]?.foods || [];

  const log = (p) => {
    const id = uid();
    mutate((d) => ops.logPreset(d, today, p, id));
    toast(`Logged ${p.name} · ${p.kcal} kcal`, { label: 'Undo', run: () => mutate((d) => ops.removeFood(d, today, id)) });
  };

  return (
    <Card title="Quick log" icon={Utensils}>
      <Button variant="primary" size="lg" className="mb-3 w-full" icon={ListChecks} onClick={() => setUsual(true)}>
        Log my usual day
      </Button>
      <UsualDaySheet open={usual} onClose={() => setUsual(false)} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button icon={Plus} onClick={() => onCustom()}>
          Extra food
        </Button>
        <PhotoButton size="md" onEstimate={onCustom} label="Photo of meal" />
      </div>
      <p className="mb-2 text-xs text-faint">Ate something outside your plan? Tap Extra food, take a photo, or tap an add-on below.</p>
      <div className="grid grid-cols-2 gap-2">
        {state.presets.map((p) => {
          const count = foods.filter((f) => f.presetId === p.id).length;
          return (
            <button key={p.id} type="button" onClick={() => log(p)} className="press rounded-xl border border-line bg-surface-2 p-3 text-left hover:bg-surface-3">
              <div className="flex items-start justify-between gap-1">
                <span className="text-[15px] leading-tight font-semibold">{p.name}</span>
                {count > 0 && (
                  <span className="flex shrink-0 items-center rounded-full bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold text-accent">
                    <Check size={12} strokeWidth={3} />
                    {count > 1 && `×${count}`}
                  </span>
                )}
              </div>
              <div className="tnum mt-1 text-xs text-muted">
                {p.kcal} kcal · {p.p}P · {p.c}C · {p.f}F
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onCustom}
          className="press flex min-h-[68px] items-center justify-center gap-2 rounded-xl border border-dashed border-line p-3 text-sm font-medium text-muted hover:text-fg"
        >
          <Plus size={18} /> Custom food
        </button>
      </div>
    </Card>
  );
}

function SupplementsCard() {
  const { state, mutate, today } = useStore();
  const supps = state.days[today]?.supps || {};
  return (
    <Card title="Supplements" icon={Pill}>
      <div className="-my-1 divide-y divide-line/60">
        {state.supplements.map((s) => {
          const on = !!supps[s.id];
          const streak = currentStreak(state.days, s.id, today);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => mutate((d) => ops.setSupp(d, today, s.id, !on))}
              className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
              aria-pressed={on}
            >
              <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition-colors', on ? 'border-accent bg-accent text-on-accent' : 'border-line')}>
                {on && <Check size={18} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-xs text-muted">
                  {s.dose}
                  {s.stock != null && s.stock !== '' && (
                    <>
                      {' · '}
                      <span className={Number(s.stock) <= 0 ? 'font-semibold text-danger' : Number(s.stock) <= (s.lowAt ?? 5) ? 'font-semibold text-warn' : ''}>
                        {Number(s.stock) <= 0
                          ? 'out of stock'
                          : `${s.stock} ${s.stockUnit || 'left'} · until ${new Date(Date.now() + (Number(s.stock) / (Number(s.perDose) || 1)) * 86400e3).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${Number(s.stock) <= (s.lowAt ?? 5) ? ', restock' : ''}`}
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="tnum flex items-center gap-1 text-sm font-semibold">
                  <Flame size={16} className={streak ? 'text-lift' : 'text-faint'} aria-hidden />
                  {streak}
                  <span className="font-normal text-muted">{streak === 1 ? 'day' : 'days'}</span>
                </span>
                {s.id === 'creatine' && (
                  <span className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-surface-3" title="Progress to a 30-day streak">
                    <span className="block h-full rounded-full bg-lift" style={{ width: `${Math.min(100, (streak / 30) * 100)}%` }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WorkoutCard() {
  const { state, today, mutate } = useStore();
  const { go, toast } = useApp();
  const active = state.activeSession;
  const doneToday = [...state.sessions].reverse().find((s) => s.date === today);
  const idx = nextDayIndex(state.program, state.sessions, today);
  const weekly = state.program.mode === 'weekly';
  const next = state.program.days[idx];

  let body;
  if (active) {
    const st = sessionStats(active);
    body = (
      <>
        <p className="text-sm text-muted">In progress</p>
        <p className="text-lg font-semibold">{active.dayName}</p>
        <p className="tnum text-sm text-muted">{st.sets} sets done</p>
        <Button variant="lift" size="lg" className="mt-3 w-full" icon={Dumbbell} onClick={() => go('train')}>
          Continue workout
        </Button>
      </>
    );
  } else if (doneToday) {
    const st = sessionStats(doneToday);
    body = (
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-on-accent">
          <Check size={20} strokeWidth={3} />
        </span>
        <div>
          <p className="font-semibold">{doneToday.dayName} done</p>
          <p className="tnum text-sm text-muted">{doneToday.rest ? `${doneToday.steps ? fmtNum(doneToday.steps) + ' steps' : 'Recovery logged'}` : `${st.sets} sets · ${fmtNum(st.volume)} kg volume`}</p>
        </div>
      </div>
    );
  } else if (next) {
    const dayNo = idx + 1;
    body = (
      <>
        <p className="text-sm text-muted">
          {weekly ? 'Today' : `Up next · Day ${dayNo}`} · {fmt12(state.profile.gymTime)}
        </p>
        <p className="text-lg font-semibold">{next.name}</p>
        <p className="text-sm text-muted">{next.type === 'rest' ? next.focus : `${next.exercises.length} exercises · ${next.focus}`}</p>
        {next.type === 'rest' ? (
          <Button
            size="lg"
            className="mt-3 w-full"
            icon={Footprints}
            onClick={() => {
              mutate((d) => {
                d.sessions.push({ id: uid(), dayId: next.id, dayName: next.name, date: today, rest: true, startedAt: Date.now(), finishedAt: Date.now(), exercises: [] });
              });
              toast('Rest day logged. Get those steps in.');
            }}
          >
            Mark rest day done
          </Button>
        ) : (
          <Button variant="lift" size="lg" className="mt-3 w-full" icon={Dumbbell} onClick={() => go('train')}>
            Go to workout
          </Button>
        )}
      </>
    );
  }
  return (
    <Card title="Workout" icon={Dumbbell} iconClass="text-lift">
      {body || <p className="text-sm text-muted">No program days set up.</p>}
    </Card>
  );
}

const QUALITY = ['Rough', 'OK', 'Good', 'Great'];

function RecoveryCard() {
  const { state, mutate, today } = useStore();
  const day = state.days[today] || {};
  const t = state.targets;
  const sleep = day.sleep || null;
  const [steps, setSteps] = useState(day.steps ?? '');
  useEffect(() => setSteps(day.steps ?? ''), [day.steps]); // follow updates from Telegram or another device
  const commitSteps = () => {
    if (String(steps) !== String(day.steps ?? '')) mutate((d) => ops.setSteps(d, today, steps));
  };
  return (
    <Card title="Recovery" icon={MoonStar} iconClass="text-fat">
      <SleepEditor dateKey={today} />
      {sleep?.hours && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {QUALITY.map((q, i) => (
            <button
              key={q}
              type="button"
              onClick={() => mutate((d) => ops.setSleep(d, today, { ...d.days[today].sleep, quality: i + 1 }))}
              className={cx('h-9 rounded-lg text-xs font-semibold', sleep?.quality === i + 1 ? 'bg-fat/25 text-fg' : 'bg-surface-2 text-muted')}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center gap-3 border-t border-line/60 pt-4">
        <Footprints size={18} className="shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Steps</span>
            <span className="tnum text-xs text-muted">goal {fmtNum(t.steps)}</span>
          </div>
          <ProgressBar value={Number(day.steps) || 0} max={t.steps} tone="kcal" className="mt-1.5" height="h-1.5" />
        </div>
        <div className="w-28">
          <NumInput
            id="steps-input"
            value={steps}
            onChange={setSteps}
            onBlur={commitSteps}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            inputMode="numeric"
            placeholder="0"
            aria-label="Steps today"
            className="!h-11"
          />
        </div>
      </div>
    </Card>
  );
}

const TIP_ICON = { good: CircleCheck, warn: TriangleAlert, info: Info };
const TIP_CLS = { good: 'text-good', warn: 'text-warn', info: 'text-water' };

function CoachTip() {
  const { state, today } = useStore();
  const { go } = useApp();
  const list = useMemo(() => insights(state, today), [state, today]);
  const tip = list.find((i) => i.tone === 'warn') || list.find((i) => i.tone === 'info') || list[0];
  if (!tip) return null;
  const Icon = TIP_ICON[tip.tone];
  return (
    <button
      type="button"
      onClick={() => {
        sessionStorage.setItem('fuel-lift:ptab', 'coach');
        go('progress');
      }}
      className="press block w-full rounded-2xl border border-line/70 bg-surface p-4 text-left"
    >
      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wider text-muted uppercase">
        <Lightbulb size={16} aria-hidden /> Coach
        {list.length > 1 && <span className="ml-auto text-xs font-medium tracking-normal normal-case">{list.length} insights ›</span>}
      </p>
      <div className="flex gap-3">
        <Icon size={18} className={cx('mt-0.5 shrink-0', TIP_CLS[tip.tone])} aria-hidden />
        <div>
          <p className="font-semibold">{tip.title}</p>
          <p className="mt-0.5 line-clamp-3 text-sm text-muted">{tip.text}</p>
        </div>
      </div>
    </button>
  );
}

function PlanNotice() {
  const { state, mutate } = useStore();
  const { go } = useApp();
  const t = state.targets;
  return (
    <section className="anim-fade rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <p className="font-semibold">Your plan is updated: lean bulk to {state.profile.targetWeight} kg</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>
          Targets: <b className="tnum text-fg">{fmtNum(t.kcal)} kcal · {t.p} g protein</b> (small surplus for about +0.25 kg/week while your waist stays put)
        </li>
        <li>Your real day: shake 10:45 AM, water 12:30 PM, lunch 4 PM, eggs + Vitamin C 6 PM, nuts, dates + lime water 9 PM, dinner + creatine at midnight</li>
        <li>Mon–Sat Chest/Triceps, Back/Biceps, Shoulders/Legs, twice a week. Sunday off with a weekly check-in</li>
        <li>Chest and bicep tracking in inches. Measure your waist this Sunday as a baseline</li>
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" onClick={() => mutate((d) => (d.meta.planNotice = false))}>
          Got it
        </Button>
        <Button
          size="sm"
          onClick={() => {
            sessionStorage.setItem('fuel-lift:ptab', 'body');
            go('progress');
          }}
        >
          See goals
        </Button>
      </div>
    </section>
  );
}
