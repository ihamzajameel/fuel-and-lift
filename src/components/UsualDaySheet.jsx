// "Log my usual day": your routine as a pre-ticked checklist. One press logs everything ticked.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Sheet, cx, fmtNum } from './ui';
import { reminderIcon } from './chrome';
import { dayTimeline, isOccurrenceDone } from '../lib/reminders';
import { fmt12, uid } from '../lib/time';
import * as ops from '../lib/ops';

/** Turn today's reminder schedule into loggable items. */
function buildPlan(state, dateKey, now) {
  const start = state.settings.dayStartHour;
  const day = state.days[dateKey] || {};
  const presetById = (id) => state.presets.find((p) => p.id === id);
  const groups = [];
  for (const o of dayTimeline(state.reminders, dateKey, start)) {
    const rem = state.reminders.find((r) => r.id === o.id);
    const a = rem.actions || {};
    if (rem.kind === 'interval' || a.openTab) continue;
    const done = isOccurrenceDone(rem, o, state);
    const items = [];
    for (const pid of a.presetIds || []) {
      const p = presetById(pid);
      if (p) items.push({ key: `${o.okey}|p|${pid}`, kind: 'preset', preset: p, label: p.name, sub: `${p.kcal} kcal · ${p.p} g P`, kcal: p.kcal, logged: (day.foods || []).some((f) => f.presetId === pid) });
    }
    if (a.waterMl) items.push({ key: `${o.okey}|w`, kind: 'water', ml: Number(a.waterMl), label: `${a.waterMl} ml water`, sub: 'Water', kcal: 0, logged: !!day.done?.[o.okey] });
    for (const sid of a.supplementIds || []) {
      const s = state.supplements.find((x) => x.id === sid);
      if (s) items.push({ key: `${o.okey}|s|${sid}`, kind: 'supp', supp: s, label: s.name, sub: s.dose, kcal: 0, logged: !!day.supps?.[sid] });
    }
    const choices = (a.choosePresetIds || []).map(presetById).filter(Boolean);
    if (!items.length && !choices.length) continue;
    groups.push({ occ: o, rem, done, past: o.at <= now, items, choices, chosenLogged: choices.find((p) => (day.foods || []).some((f) => f.presetId === p.id))?.id });
  }
  return groups;
}

export default function UsualDaySheet({ open, onClose, dateKey }) {
  const { state, mutate, now, today } = useStore();
  const { toast } = useApp();
  const key = dateKey || today;
  const groups = useMemo(() => (open ? buildPlan(state, key, now) : []), [open, state, key, now]);

  // Selection: past, not-yet-logged items are ticked by default. Viewing a past day ticks everything.
  const isPastDay = key < today;
  const [sel, setSel] = useState(null);
  const [dinner, setDinner] = useState(null);
  const defaults = useMemo(() => {
    const m = {};
    for (const g of groups) for (const it of g.items) m[it.key] = !it.logged && (g.past || isPastDay);
    return m;
  }, [groups, isPastDay]);
  const selected = sel || defaults;
  const choiceGroup = groups.find((g) => g.choices.length);
  const dinnerPick = dinner === undefined ? null : (dinner ?? (choiceGroup && !choiceGroup.chosenLogged && (choiceGroup.past || isPastDay) ? choiceGroup.choices[0].id : null));

  const close = () => {
    setSel(null);
    setDinner(null);
    onClose();
  };
  const toggle = (k) => setSel({ ...selected, [k]: !selected[k] });
  const allKeys = groups.flatMap((g) => g.items.filter((i) => !i.logged).map((i) => i.key));
  const allOn = allKeys.length > 0 && allKeys.every((k) => selected[k]);
  const setAll = (v) => setSel(Object.fromEntries(allKeys.map((k) => [k, v])));

  const chosen = groups.flatMap((g) => g.items.filter((i) => selected[i.key] && !i.logged).map((i) => ({ ...i, g })));
  const dinnerPreset = choiceGroup?.choices.find((p) => p.id === dinnerPick);
  const count = chosen.length + (dinnerPreset ? 1 : 0);
  const kcal = chosen.reduce((a, i) => a + i.kcal, 0) + (dinnerPreset?.kcal || 0);

  const logAll = () => {
    if (!count) return close();
    const created = [];
    const t0 = Date.now();
    const atFor = (g) => (g.occ.at <= t0 ? g.occ.at : t0);
    mutate((d) => {
      for (const i of chosen) {
        const id = `ud-${i.key}`;
        if (i.kind === 'preset') ops.logPreset(d, key, i.preset, id, atFor(i.g));
        else if (i.kind === 'water') ops.addWater(d, key, i.ml, id, atFor(i.g));
        else if (i.kind === 'supp') ops.setSupp(d, key, i.supp.id, true);
      }
      if (dinnerPreset) ops.logPreset(d, key, dinnerPreset, `ud-${choiceGroup.occ.okey}|dinner`, atFor(choiceGroup));
      // Mark a reminder done when everything in it is now logged.
      for (const g of groups) {
        const all = g.items.every((i) => i.logged || selected[i.key]);
        const dinnerOk = !g.choices.length || g.chosenLogged || (dinnerPreset && g === choiceGroup);
        if (all && dinnerOk) ops.markDone(d, key, g.occ.okey);
      }
    });
    for (const i of chosen) if (i.kind !== 'supp') created.push({ kind: i.kind, id: `ud-${i.key}` });
    if (dinnerPreset) created.push({ kind: 'preset', id: `ud-${choiceGroup.occ.okey}|dinner` });
    toast(`Logged ${count} item${count > 1 ? 's' : ''} · ${fmtNum(kcal)} kcal`, {
      label: 'Undo',
      run: () =>
        mutate((d) => {
          for (const c of created) c.kind === 'water' ? ops.removeWater(d, key, c.id) : ops.removeFood(d, key, c.id);
          for (const i of chosen) if (i.kind === 'supp') ops.setSupp(d, key, i.supp.id, false);
          for (const g of groups) if (!g.done) ops.markDone(d, key, g.occ.okey, false);
        }),
    });
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Log my usual day"
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={logAll} disabled={!count}>
          {count ? `Log ${count} item${count > 1 ? 's' : ''} · ${fmtNum(kcal)} kcal` : 'Nothing selected'}
        </Button>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Ticked = log it. Untick anything you skipped.</p>
        {allKeys.length > 0 && (
          <button type="button" onClick={() => setAll(!allOn)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent">
            {allOn ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      <ol className="space-y-3">
        {groups.map((g) => {
          const Icon = reminderIcon(g.rem.icon);
          return (
            <li key={g.occ.okey} className={cx('rounded-xl border border-line bg-surface-2 p-3', !g.past && !isPastDay && 'opacity-80')}>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                <Icon size={14} /> {fmt12(g.occ.time)} · {g.rem.title}
                {!g.past && !isPastDay && <span className="ml-auto font-medium normal-case">upcoming</span>}
              </p>
              <div className="space-y-1.5">
                {g.items.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    disabled={i.logged}
                    onClick={() => toggle(i.key)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left disabled:opacity-60"
                    aria-pressed={!!selected[i.key]}
                  >
                    <span
                      className={cx(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-md border-2',
                        i.logged ? 'border-good bg-good/20 text-good' : selected[i.key] ? 'border-accent bg-accent text-on-accent' : 'border-line'
                      )}
                    >
                      {(i.logged || selected[i.key]) && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{i.label}</span>
                      <span className="block truncate text-xs text-muted">{i.logged ? 'Already logged' : i.sub}</span>
                    </span>
                  </button>
                ))}
                {g.choices.length > 0 && (
                  <div className="pt-1">
                    <p className="mb-1.5 text-xs text-muted">{g.chosenLogged ? 'Dinner already logged' : 'Dinner tonight'}</p>
                    {!g.chosenLogged && (
                      <div className="flex flex-wrap gap-1.5">
                        {g.choices.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setDinner(dinnerPick === p.id ? undefined : p.id)}
                            className={cx('h-9 rounded-full border px-3 text-sm font-medium', dinnerPick === p.id ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted')}
                          >
                            {p.name.replace(/^Dinner:\s*/, '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {groups.length === 0 && <p className="py-6 text-center text-sm text-muted">No reminders with meals or water are enabled.</p>}
    </Sheet>
  );
}
