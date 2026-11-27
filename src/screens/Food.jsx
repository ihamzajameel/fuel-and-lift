import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Droplet, History, ListChecks, Pencil, Plus, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import PhotoButton from '../components/PhotoButton';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Chip, Dot, Empty, IconButton, ProgressBar, ScreenHeader, TONES, fmtNum } from '../components/ui';
import FoodSheet from '../components/FoodSheet';
import UsualDaySheet from '../components/UsualDaySheet';
import { dayTotals, fmtL, portionLabel } from '../lib/nutrition';
import { addDays, fmtDay, fmtTime, uid } from '../lib/time';
import * as ops from '../lib/ops';

export default function Food() {
  const { state, mutate, today } = useStore();
  const { toast } = useApp();
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState(null); // { mode, initial }
  const [usual, setUsual] = useState(false);

  const day = state.days[date];
  const tot = dayTotals(day);
  const t = state.targets;
  const foods = [...(day?.foods || [])].sort((a, b) => a.at - b.at);
  const water = [...(day?.water || [])].sort((a, b) => a.at - b.at);

  const recents = useMemo(() => {
    const seen = new Map();
    for (let i = 0; i < 21; i++) {
      const k = addDays(today, -i);
      for (const f of [...(state.days[k]?.foods || [])].reverse()) {
        if (f.presetId) continue;
        const key = f.name.trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, f);
      }
      if (seen.size >= 12) break;
    }
    return [...seen.values()];
  }, [state.days, today]);

  const logPreset = (p) => {
    const id = uid();
    mutate((d) => ops.logPreset(d, date, p, id));
    toast(`Logged ${p.name}`, { label: 'Undo', run: () => mutate((d) => ops.removeFood(d, date, id)) });
  };

  const removeEntry = (f) => {
    mutate((d) => ops.removeFood(d, date, f.id));
    toast(`Removed ${f.name}`, { label: 'Undo', run: () => mutate((d) => ops.logFood(d, date, f)) });
  };

  return (
    <>
      <ScreenHeader
        title="Food"
        subtitle="Calories & macros"
        right={
          <>
            <PhotoButton onEstimate={({ initial, estimate }) => setSheet({ mode: 'log', initial, estimate })} />
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setSheet({ mode: 'log' })}>
              Add
            </Button>
          </>
        }
      />
      <div className="space-y-3 px-3 pt-3">
        {/* Date stepper */}
        <div className="flex items-center justify-between rounded-2xl border border-line/70 bg-surface p-1">
          <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDays(date, -1))} />
          <button type="button" onClick={() => setDate(today)} className="font-semibold">
            {fmtDay(date, today)}
          </button>
          <IconButton icon={ChevronRight} label="Next day" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="disabled:opacity-30" />
        </div>

        {/* Totals */}
        <Card>
          <div className="grid grid-cols-4 gap-3">
            {[
              ['kcal', tot.kcal, t.kcal, ''],
              ['p', tot.p, t.p, 'g'],
              ['c', tot.c, t.c, 'g'],
              ['f', tot.f, t.f, 'g'],
            ].map(([k, v, max, u]) => (
              <div key={k} className="min-w-0">
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Dot tone={k} className="h-2 w-2" />
                  {k === 'kcal' ? 'kcal' : TONES[k].label}
                </div>
                <div className="tnum mt-0.5 text-lg leading-tight font-bold">
                  {fmtNum(v)}
                  <span className="text-xs font-normal text-muted">{u}</span>
                </div>
                <div className="tnum text-[11px] text-faint">/ {fmtNum(max)}</div>
                <ProgressBar value={v} max={max} tone={k} className="mt-1.5" height="h-1.5" />
              </div>
            ))}
          </div>
        </Card>

        {/* Quick add */}
        <Card title="Quick add" icon={Star}>
          <Button variant="primary" className="mb-3 w-full" icon={ListChecks} onClick={() => setUsual(true)}>
            Log my usual day{date !== today ? ` (${fmtDay(date, today)})` : ''}
          </Button>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
            {state.presets.map((p) => (
              <Chip key={p.id} onClick={() => logPreset(p)} className="!h-10">
                + {p.name}
              </Chip>
            ))}
          </div>
          {recents.length > 0 && (
            <>
              <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <History size={14} /> Recent: tap to adjust portion & log
              </p>
              <div className="flex flex-wrap gap-2">
                {recents.map((f) => (
                  <Chip
                    key={f.id}
                    onClick={() => setSheet({ mode: 'log', initial: { name: f.name, qty: f.qty, unit: f.unit, kcal: f.kcal, p: f.p, c: f.c, f: f.f } })}
                  >
                    {f.name} <span className="text-faint">· {f.kcal}</span>
                  </Chip>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Log */}
        <Card title={`Log · ${foods.length} ${foods.length === 1 ? 'item' : 'items'}`} icon={UtensilsCrossed} padded={false}>
          {foods.length === 0 ? (
            <Empty icon={UtensilsCrossed} title="Nothing logged yet">
              Use a quick-add preset or tap “Add food”.
            </Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {foods.map((f) => (
                <li key={f.id} className="flex items-center gap-2 pl-4">
                  <button type="button" onClick={() => setSheet({ mode: 'edit', initial: f })} className="min-w-0 flex-1 py-3 text-left">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{f.name}</span>
                      <span className="tnum shrink-0 font-semibold">{fmtNum(f.kcal)} <span className="text-xs font-normal text-muted">kcal</span></span>
                    </div>
                    <div className="tnum mt-0.5 flex justify-between gap-2 text-xs text-muted">
                      <span className="truncate">
                        {portionLabel(f.qty, f.unit)} · {fmtTime(f.at)}
                      </span>
                      <span className="shrink-0">
                        {f.p}P · {f.c}C · {f.f}F
                      </span>
                    </div>
                  </button>
                  <IconButton icon={Trash2} label={`Remove ${f.name}`} size={17} onClick={() => removeEntry(f)} className="mr-1 hover:text-danger" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Water log */}
        <Card
          title={`Water · ${fmtL(tot.water)}`}
          icon={Droplet}
          iconClass="text-water"
          right={
            <Button size="sm" variant="water" onClick={() => mutate((d) => ops.addWater(d, date, 250, uid(), date === today ? Date.now() : undefined))}>
              +250 ml
            </Button>
          }
        >
          {water.length === 0 ? (
            <p className="text-sm text-muted">No water logged.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {water.map((w) => (
                <span key={w.id} className="tnum inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface-2 pr-1 pl-3 text-sm">
                  {w.ml} ml <span className="text-faint">· {fmtTime(w.at)}</span>
                  <button type="button" aria-label="Remove" onClick={() => mutate((d) => ops.removeWater(d, date, w.id))} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Presets */}
        <Card title="My presets" icon={Star} right={<Button size="sm" icon={Plus} onClick={() => setSheet({ mode: 'preset' })}>New</Button>} padded={false}>
          <ul className="divide-y divide-line/60">
            {state.presets.map((p) => (
              <li key={p.id} className="flex items-center gap-2 pl-4">
                <div className="min-w-0 flex-1 py-3">
                  <p className="font-medium">{p.name}</p>
                  {p.detail && <p className="truncate text-xs text-faint">{p.detail}</p>}
                  <p className="tnum text-xs text-muted">
                    {portionLabel(p.qty, p.unit)} · {p.kcal} kcal · {p.p}P {p.c}C {p.f}F
                  </p>
                </div>
                <IconButton icon={Pencil} label={`Edit ${p.name}`} size={17} onClick={() => setSheet({ mode: 'preset', initial: p })} className="mr-1" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <UsualDaySheet open={usual} onClose={() => setUsual(false)} dateKey={date} />
      <FoodSheet open={!!sheet} onClose={() => setSheet(null)} mode={sheet?.mode} initial={sheet?.initial} estimate={sheet?.estimate} dateKey={date} />
    </>
  );
}
