import { useEffect, useState } from 'react';
import { Calculator, Minus, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Chip, Field, NumInput, Sheet, TextInput, Toggle, cx } from './ui';
import { UNITS, kcalFromMacros } from '../lib/nutrition';
import * as ops from '../lib/ops';
import { uid } from '../lib/time';

const STEP = { g: 10, ml: 25, cup: 0.25, serving: 0.5 };
const blank = { name: '', detail: '', qty: 1, unit: 'serving', kcal: '', p: '', c: '', f: '' };
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * mode: 'log' (new entry, optionally pre-filled from a preset/recent food and scalable),
 *       'edit' (existing log entry), 'preset' (create/edit a quick-log preset)
 */
export default function FoodSheet({ open, onClose, mode = 'log', initial, dateKey }) {
  const { state, mutate } = useStore();
  const { toast } = useApp();
  const [f, setF] = useState(blank);
  const [base, setBase] = useState(null);
  const [asPreset, setAsPreset] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const init = initial ? { ...blank, ...initial } : blank;
    setF({ ...init, kcal: init.kcal ?? '', p: init.p ?? '', c: init.c ?? '', f: init.f ?? '' });
    setBase(initial && mode === 'log' && Number(initial.qty) > 0 ? { ...init } : null);
    setAsPreset(false);
    setErr('');
  }, [open, initial, mode]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setMacro = (k, v) => {
    setBase(null);
    set(k, v);
  };

  const setQty = (q) => {
    if (base && Number(q) > 0) {
      const ratio = Number(q) / Number(base.qty);
      setF((x) => ({
        ...x,
        qty: q,
        kcal: Math.round((Number(base.kcal) || 0) * ratio),
        p: r1((Number(base.p) || 0) * ratio),
        c: r1((Number(base.c) || 0) * ratio),
        f: r1((Number(base.f) || 0) * ratio),
      }));
    } else set('qty', q);
  };
  const step = STEP[f.unit] ?? 1;
  const bump = (dir) => setQty(String(Math.max(0, r1((Number(f.qty) || 0) + dir * step))));

  const autoKcal = kcalFromMacros(f.p, f.c, f.f);

  const save = () => {
    if (!f.name.trim()) return setErr('Give it a name');
    const item = {
      name: f.name.trim(),
      qty: Number(f.qty) || 1,
      unit: f.unit,
      kcal: f.kcal === '' ? autoKcal : Math.round(Number(f.kcal) || 0),
      p: r1(Number(f.p) || 0),
      c: r1(Number(f.c) || 0),
      f: r1(Number(f.f) || 0),
    };
    if (mode === 'preset') {
      const id = initial?.id || uid();
      mutate((d) => {
        const p = { ...(d.presets.find((x) => x.id === id) || {}), ...item, detail: f.detail || '', id };
        const i = d.presets.findIndex((x) => x.id === id);
        if (i >= 0) d.presets[i] = p;
        else d.presets.push(p);
      });
      toast(initial?.id ? 'Preset updated' : 'Preset added');
    } else {
      const entryId = mode === 'edit' ? initial.id : uid();
      const presetId = mode === 'edit' ? initial.presetId : null;
      mutate((d) => {
        ops.logFood(d, dateKey, { ...item, id: entryId, presetId, at: mode === 'edit' ? initial.at : undefined });
        if (asPreset) d.presets.push({ ...item, id: uid(), detail: '' });
      });
      toast(mode === 'edit' ? 'Entry updated' : `Logged ${item.name} · ${item.kcal} kcal`, mode === 'edit' ? null : { label: 'Undo', run: () => mutate((d) => ops.removeFood(d, dateKey, entryId)) });
    }
    onClose();
  };

  const remove = () => {
    if (mode === 'preset') {
      if (!confirm(`Delete preset “${initial.name}”?`)) return;
      mutate((d) => {
        d.presets = d.presets.filter((p) => p.id !== initial.id);
      });
      toast('Preset deleted');
    } else {
      const entry = initial;
      mutate((d) => ops.removeFood(d, dateKey, entry.id));
      toast('Entry removed', { label: 'Undo', run: () => mutate((d) => ops.logFood(d, dateKey, entry)) });
    }
    onClose();
  };

  const title = mode === 'preset' ? (initial?.id ? 'Edit preset' : 'New preset') : mode === 'edit' ? 'Edit entry' : 'Log food';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          {(mode === 'edit' || (mode === 'preset' && initial?.id)) && <Button variant="danger" size="lg" icon={Trash2} onClick={remove} aria-label="Delete" />}
          <Button variant="primary" size="lg" className="flex-1" onClick={save}>
            {mode === 'preset' ? 'Save preset' : mode === 'edit' ? 'Save changes' : 'Log it'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Food name">
          <TextInput
            value={f.name}
            onChange={(e) => {
              set('name', e.target.value);
              setErr('');
            }}
            placeholder="e.g. Grilled chicken + rice"
            autoFocus={!initial}
            enterKeyHint="next"
          />
          {err && <span className="mt-1 block text-sm text-danger">{err}</span>}
        </Field>

        {mode === 'preset' && (
          <Field label="Note (optional)">
            <TextInput value={f.detail} onChange={(e) => set('detail', e.target.value)} placeholder="What's in it" />
          </Field>
        )}

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Portion</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Less" onClick={() => bump(-1)} className="press grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-2">
              <Minus size={18} />
            </button>
            <NumInput value={f.qty} onChange={setQty} className="text-center text-lg font-semibold" aria-label="Quantity" />
            <button type="button" aria-label="More" onClick={() => bump(1)} className="press grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-2">
              <Plus size={18} />
            </button>
          </div>
          <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {UNITS.map((u) => (
              <Chip key={u.id} active={f.unit === u.id} onClick={() => set('unit', u.id)}>
                {u.label}
              </Chip>
            ))}
          </div>
          {base && <p className="mt-1.5 text-xs text-faint">Macros scale with the portion. Edit any number to set it by hand.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories">
            <NumInput value={f.kcal} onChange={(v) => setMacro('kcal', v)} suffix="kcal" placeholder={autoKcal ? String(autoKcal) : '0'} />
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-protein" />Protein</span>}>
            <NumInput value={f.p} onChange={(v) => setMacro('p', v)} suffix="g" placeholder="0" />
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-carbs" />Carbs</span>}>
            <NumInput value={f.c} onChange={(v) => setMacro('c', v)} suffix="g" placeholder="0" />
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fat" />Fat</span>}>
            <NumInput value={f.f} onChange={(v) => setMacro('f', v)} suffix="g" placeholder="0" />
          </Field>
        </div>

        {autoKcal > 0 && Number(f.kcal) !== autoKcal && (
          <button
            type="button"
            onClick={() => setMacro('kcal', String(autoKcal))}
            className={cx('flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm text-muted hover:text-fg')}
          >
            <Calculator size={16} className="shrink-0" />
            <span>
              Macros add up to <b className="tnum text-fg">{autoKcal} kcal</b>. Tap to use it{f.kcal === '' ? ' (used automatically if left blank)' : ''}.
            </span>
          </button>
        )}

        {mode === 'log' && (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-3">
            <span>
              <span className="block text-sm font-medium">Save as quick-log preset</span>
              <span className="block text-xs text-muted">Adds a one-tap button on Today</span>
            </span>
            <Toggle checked={asPreset} onChange={setAsPreset} label="Save as preset" />
          </label>
        )}
      </div>
    </Sheet>
  );
}
