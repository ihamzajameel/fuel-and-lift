import { useState } from 'react';
import { BellRing, CalendarPlus, ChevronLeft, Info, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Chip, Field, NumInput, ScreenHeader, Segmented, Sheet, TextInput, Toggle, cx } from '../components/ui';
import { REMINDER_ICONS, reminderIcon } from '../components/chrome';
import { DEFAULT_REMINDERS } from '../lib/defaults';
import { slotTimes } from '../lib/reminders';
import { buildICS } from '../lib/ics';
import { WEEKDAYS, fmt12, uid } from '../lib/time';
import { isIOS, isStandalone, notifPermission, requestPermission } from '../lib/notify';

export default function Reminders() {
  const { state, mutate, today } = useStore();
  const { setMoreView, toast, testReminder } = useApp();
  const [perm, setPerm] = useState(notifPermission());
  const [edit, setEdit] = useState(null); // reminder object (copy)
  const start = state.settings.dayStartHour;

  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') toast('Notifications enabled');
  };

  const sorted = [...state.reminders].sort((a, b) => {
    const rel = (r) => {
      const t = r.kind === 'interval' ? r.start : r.time;
      const [h, m] = t.split(':').map(Number);
      return (h * 60 + m - start * 60 + 1440) % 1440;
    };
    return rel(a) - rel(b);
  });

  const update = (id, patch) =>
    mutate((d) => {
      const r = d.reminders.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });

  const exportICS = () => {
    const ics = buildICS(state.reminders, today, start);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fuel-lift-reminders.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Calendar file downloaded. Open it to add the alarms.');
  };

  const restore = () => {
    if (!confirm('Restore the 8 default reminders? Your custom reminders are kept; edited defaults are reset.')) return;
    mutate((d) => {
      const custom = d.reminders.filter((r) => !r.builtin);
      d.reminders = [...JSON.parse(JSON.stringify(DEFAULT_REMINDERS)), ...custom];
    });
  };

  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <>
      <ScreenHeader
        title="Reminders"
        subtitle={
          <button type="button" onClick={() => setMoreView('main')} className="-ml-1 inline-flex items-center gap-0.5 text-muted">
            <ChevronLeft size={14} /> More
          </button>
        }
        right={<Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit(newReminder())}>New</Button>}
      />
      <div className="space-y-3 px-3 pt-3">
        <Card title="Notifications" icon={BellRing}>
          {perm === 'granted' ? (
            <p className="text-sm text-good">Notifications are on for this device.</p>
          ) : perm === 'denied' ? (
            <p className="text-sm text-warn">Notifications are blocked. Re-enable them in your browser or phone settings for this site/app.</p>
          ) : perm === 'unsupported' || iosNeedsInstall ? (
            <p className="text-sm text-muted">
              {iosNeedsInstall
                ? 'On iPhone, notifications only work after you add Fuel & Lift to your Home Screen (Share → Add to Home Screen, iOS 16.4+). Open it from there, then come back here.'
                : "This browser doesn't support notifications. In-app banners and sounds still work."}
            </p>
          ) : (
            <Button variant="primary" className="w-full" icon={BellRing} onClick={enable}>
              Enable notifications
            </Button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" icon={Send} onClick={() => testReminder('hydration')}>
              Send test
            </Button>
            <Button size="sm" icon={CalendarPlus} onClick={exportICS}>
              Add to calendar
            </Button>
          </div>
          <details className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-fg">
              <Info size={16} /> How reminders work
            </summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>While Fuel & Lift is open (or recently backgrounded), reminders pop up as a banner with a chime, plus a system notification when the app isn't in front.</li>
              <li>Phones pause web apps that are fully closed, so a reminder can't fire then. Missed ones (under 45 min old) show when you reopen.</li>
              <li>
                For alarms that are guaranteed even with the app closed, tap <b>Add to calendar</b>. It creates repeating events with alerts in your phone's calendar.
              </li>
              <li>Reminders you've already handled stay quiet. Log your shake early and the 9:30 AM reminder won't nag.</li>
            </ul>
          </details>
        </Card>

        <Card padded={false}>
          <ul className="divide-y divide-line/60">
            {sorted.map((r) => {
              const Icon = reminderIcon(r.icon);
              return (
                <li key={r.id} className="flex items-start gap-3 py-3 pr-3 pl-4">
                  <span className={cx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', r.enabled ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-faint')}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="block w-full text-left" onClick={() => setEdit(JSON.parse(JSON.stringify(r)))}>
                      <p className={cx('leading-snug font-medium', !r.enabled && 'text-muted')}>{r.title}</p>
                      <p className="tnum text-xs text-muted">
                        {r.kind === 'interval' ? `Every ${r.every} min · ${fmt12(r.start)}–${fmt12(r.end)} (${slotTimes(r, start).length}×)` : 'Tap to edit'}
                        {r.days?.length ? ` · ${r.days.map((d) => WEEKDAYS[d]).join(' ')}` : ''}
                      </p>
                    </button>
                    {r.kind !== 'interval' && (
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) => e.target.value && update(r.id, { time: e.target.value })}
                        aria-label={`${r.title} time`}
                        className="tnum mt-2 h-10 w-36 rounded-lg border border-line bg-surface-2 px-2.5 text-[15px] font-semibold text-fg"
                      />
                    )}
                  </div>
                  <Toggle checked={r.enabled} onChange={(v) => update(r.id, { enabled: v })} label={`${r.title} on/off`} className="mt-1" />
                </li>
              );
            })}
          </ul>
        </Card>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={restore}>
          Restore default reminders
        </Button>
      </div>
      <ReminderSheet value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

const newReminder = () => ({
  id: `custom-${uid()}`,
  title: '',
  body: '',
  kind: 'fixed',
  time: '12:00',
  start: '10:00',
  end: '20:00',
  every: 120,
  enabled: true,
  days: [],
  icon: 'bell',
  actions: { presetIds: [], waterMl: 0, supplementIds: [] },
  builtin: false,
  isNew: true,
});

function ReminderSheet({ value, onClose }) {
  const { state, mutate } = useStore();
  const { toast } = useApp();
  const [r, setR] = useState(null);
  const [lastId, setLastId] = useState(null);
  if (value && value.id !== lastId) {
    setLastId(value.id);
    setR({ start: '10:00', end: '20:00', every: 90, time: '12:00', ...value, actions: { presetIds: [], waterMl: 0, supplementIds: [], ...(value.actions || {}) } });
  }
  if (!value && lastId) setLastId(null);
  if (!value || !r) return null;

  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const setA = (patch) => setR((x) => ({ ...x, actions: { ...x.actions, ...patch } }));
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = () => {
    if (!r.title.trim()) return alert('Give the reminder a title.');
    const clean = { ...r, title: r.title.trim(), every: Math.max(15, Number(r.every) || 90), actions: { ...r.actions, waterMl: Number(r.actions.waterMl) || 0 } };
    delete clean.isNew;
    mutate((d) => {
      const i = d.reminders.findIndex((x) => x.id === clean.id);
      if (i >= 0) d.reminders[i] = clean;
      else d.reminders.push(clean);
    });
    toast(value.isNew ? 'Reminder added' : 'Reminder saved');
    onClose();
  };
  const remove = () => {
    if (!confirm(`Delete “${r.title}”?`)) return;
    mutate((d) => {
      d.reminders = d.reminders.filter((x) => x.id !== r.id);
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={value.isNew ? 'New reminder' : 'Edit reminder'}
      footer={
        <div className="flex gap-2">
          {!value.isNew && <Button variant="danger" size="lg" icon={Trash2} onClick={remove} aria-label="Delete reminder" />}
          <Button variant="primary" size="lg" className="flex-1" onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <TextInput value={r.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Take vitamin D" />
        </Field>
        <Field label="Message">
          <textarea value={r.body} onChange={(e) => set({ body: e.target.value })} rows={2} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-fg placeholder:text-faint focus:border-accent focus:outline-none" placeholder="Details shown in the notification" />
        </Field>
        <Segmented
          value={r.kind}
          onChange={(v) => set({ kind: v })}
          options={[
            { value: 'fixed', label: 'At a time' },
            { value: 'interval', label: 'Repeating' },
          ]}
        />
        {r.kind === 'fixed' ? (
          <Field label="Time">
            <input type="time" value={r.time} onChange={(e) => e.target.value && set({ time: e.target.value })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg" />
          </Field>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Field label="From">
              <input type="time" value={r.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-2 text-fg" />
            </Field>
            <Field label="Until">
              <input type="time" value={r.end} onChange={(e) => e.target.value && set({ end: e.target.value })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-2 text-fg" />
            </Field>
            <Field label="Every">
              <NumInput value={r.every} onChange={(v) => set({ every: v })} suffix="min" inputMode="numeric" />
            </Field>
          </div>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Days {r.days.length ? '' : '(every day)'}</span>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => set({ days: toggleIn(r.days, i).sort() })}
                className={cx('h-10 flex-1 rounded-lg text-xs font-semibold', r.days.includes(i) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}
              >
                {d.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Icon</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(REMINDER_ICONS).map(([k, Icon]) => (
              <button key={k} type="button" aria-label={k} onClick={() => set({ icon: k })} className={cx('grid h-10 w-10 place-items-center rounded-lg', r.icon === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-medium">“Log it” button does…</p>
          <p className="mb-2 text-xs text-faint">One tap from the notification banner logs these.</p>
          <div className="flex flex-wrap gap-2">
            {state.presets.map((p) => (
              <Chip key={p.id} active={r.actions.presetIds.includes(p.id)} onClick={() => setA({ presetIds: toggleIn(r.actions.presetIds, p.id) })}>
                {p.name}
              </Chip>
            ))}
            {state.supplements.map((s) => (
              <Chip key={s.id} active={r.actions.supplementIds.includes(s.id)} onClick={() => setA({ supplementIds: toggleIn(r.actions.supplementIds, s.id) })}>
                ✓ {s.name}
              </Chip>
            ))}
          </div>
          <Field label="Add water" className="mt-3">
            <NumInput value={r.actions.waterMl || ''} onChange={(v) => setA({ waterMl: v })} suffix="ml" placeholder="0" />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
