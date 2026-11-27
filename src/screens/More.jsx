import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Download,
  Dumbbell,
  HardDrive,
  Moon,
  Palette,
  Pill,
  Plus,
  Share2,
  Smartphone,
  Target,
  Trash2,
  TriangleAlert,
  Upload,
  User,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { Button, Card, Field, IconButton, NumInput, ScreenHeader, Segmented, TextInput, Toggle, cx, fmtNum } from '../components/ui';
import Reminders from './Reminders';
import { energyEstimate, kcalFromMacros } from '../lib/nutrition';
import { makeBackup, parseBackup } from '../lib/storage';
import { makeDefaultState } from '../lib/defaults';
import { daysBetween, fmt12, uid, ymd } from '../lib/time';
import { isIOS, isStandalone, notifPermission } from '../lib/notify';

export default function More() {
  const { moreView } = useApp();
  return moreView === 'reminders' ? <Reminders /> : <SettingsMain />;
}

function Row({ label, hint, children }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsMain() {
  const { state, mutate, replace, today } = useStore();
  const { setMoreView, toast } = useApp();
  const p = state.profile;
  const t = state.targets;
  const s = state.settings;
  const est = energyEstimate(p);
  const macroKcal = kcalFromMacros(t.p, t.c, t.f);
  const setP = (k, v) => mutate((d) => (d.profile[k] = v));
  const setT = (k, v) => mutate((d) => (d.targets[k] = v));
  const setS = (k, v) => mutate((d) => (d.settings[k] = v));
  const num = (v) => (v === '' ? '' : Number(v));
  const perm = notifPermission();
  const fileRef = useRef(null);

  // ---- install prompt ----
  const [canInstall, setCanInstall] = useState(!!window.__installPrompt);
  useEffect(() => {
    const on = () => setCanInstall(true);
    window.addEventListener('installable', on);
    return () => window.removeEventListener('installable', on);
  }, []);
  const install = async () => {
    const e = window.__installPrompt;
    if (!e) return;
    e.prompt();
    await e.userChoice.catch(() => {});
    window.__installPrompt = null;
    setCanInstall(false);
  };

  // ---- backup ----
  const backupText = () => JSON.stringify(makeBackup(state), null, 1);
  const fileName = `fuel-lift-backup-${ymd(new Date())}.json`;
  const markBackedUp = () => mutate((d) => (d.meta.lastBackup = Date.now()));
  const download = () => {
    const blob = new Blob([backupText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markBackedUp();
    toast('Backup downloaded');
  };
  const canShareFiles = (() => {
    try {
      return !!navigator.canShare?.({ files: [new File(['x'], 'x.json', { type: 'application/json' })] });
    } catch {
      return false;
    }
  })();
  const share = async () => {
    try {
      const file = new File([backupText()], fileName, { type: 'application/json' });
      await navigator.share({ files: [file], title: 'Fuel & Lift backup' });
      markBackedUp();
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Sharing failed. Use Download instead.');
    }
  };
  const onImport = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const next = parseBackup(await f.text());
      const n = Object.keys(next.days).length;
      if (!confirm(`Restore this backup (${n} logged days, ${next.sessions.length} workouts)? It replaces everything currently in the app.`)) return;
      replace(next);
      toast('Backup restored');
    } catch (err) {
      alert(err.message);
    }
  };
  const resetAll = () => {
    if (!confirm('Erase ALL data and start fresh? Export a backup first. This cannot be undone.')) return;
    if (!confirm('Really erase everything?')) return;
    replace(makeDefaultState());
    toast('All data erased');
  };

  const lastBackup = state.meta.lastBackup;
  const backupAge = lastBackup ? daysBetween(ymd(new Date(lastBackup)), today) : null;
  const hasData = Object.keys(state.days).length > 0;

  return (
    <>
      <ScreenHeader title="More" subtitle="Settings, reminders & backup" />
      <div className="space-y-3 px-3 pt-3">
        <button type="button" onClick={() => setMoreView('reminders')} className="press flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-surface p-4 text-left">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent">
            <Bell size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Reminders & notifications</span>
            <span className="block text-sm text-muted">
              {state.reminders.filter((r) => r.enabled).length} active ·{' '}
              {perm === 'granted' ? 'notifications on' : perm === 'denied' ? 'notifications blocked' : 'notifications off'}
            </span>
          </span>
          <ChevronRight size={20} className="text-muted" />
        </button>

        {hasData && (backupAge == null || backupAge >= 7) && (
          <div className="flex gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4">
            <TriangleAlert size={20} className="shrink-0 text-warn" />
            <div className="text-sm">
              <p className="font-semibold">{backupAge == null ? 'No backup yet' : `Last backup ${backupAge} days ago`}</p>
              <p className="text-muted">Your data lives only on this device. Export a backup weekly; it takes 2 seconds.</p>
              <Button size="sm" variant="primary" className="mt-2" icon={canShareFiles ? Share2 : Download} onClick={canShareFiles ? share : download}>
                Back up now
              </Button>
            </div>
          </div>
        )}

        <Card title="Profile" icon={User}>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Age">
              <NumInput value={p.age} onChange={(v) => setP('age', num(v))} inputMode="numeric" />
            </Field>
            <Field label="Weight">
              <NumInput value={p.weightKg} onChange={(v) => setP('weightKg', num(v))} suffix="kg" />
            </Field>
            <Field label="Height">
              <NumInput value={p.heightCm} onChange={(v) => setP('heightCm', num(v))} suffix="cm" />
            </Field>
          </div>
          <Field label="Activity level" className="mt-3">
            <select value={p.activity} onChange={(e) => setP('activity', Number(e.target.value))} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg">
              <option value={1.375}>Light (1–3 workouts, desk job)</option>
              <option value={1.55}>Moderate (3–5 workouts + steps)</option>
              <option value={1.725}>High (6+ workouts or active job)</option>
            </select>
          </Field>
          <Field label="Goal" className="mt-3">
            <TextInput value={p.goal} onChange={(e) => setP('goal', e.target.value)} />
          </Field>
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="text-muted">
              Estimated maintenance (Mifflin–St Jeor): <b className="tnum text-fg">{fmtNum(est.tdee)} kcal</b> (BMR {fmtNum(est.bmr)}).
            </p>
            <p className="mt-1 text-muted">
              Your {fmtNum(t.kcal)} kcal target is a{' '}
              <b className="tnum text-fg">
                {est.tdee - t.kcal >= 0 ? `${fmtNum(est.tdee - t.kcal)} kcal deficit` : `${fmtNum(t.kcal - est.tdee)} kcal surplus`}
              </b>
              {est.tdee - t.kcal > 0 && ` ≈ ${((((est.tdee - t.kcal) * 7) / 7700) * 1).toFixed(2)} kg fat/week`}. Protein is{' '}
              <b className="tnum text-fg">{(t.p / (p.weightKg || 1)).toFixed(1)} g/kg</b> (1.6–2.2 recommended).
            </p>
          </div>
        </Card>

        <Card title="Daily targets" icon={Target}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Calories">
              <NumInput value={t.kcal} onChange={(v) => setT('kcal', num(v))} suffix="kcal" />
            </Field>
            <Field label="Protein">
              <NumInput value={t.p} onChange={(v) => setT('p', num(v))} suffix="g" />
            </Field>
            <Field label="Carbs">
              <NumInput value={t.c} onChange={(v) => setT('c', num(v))} suffix="g" />
            </Field>
            <Field label="Fat">
              <NumInput value={t.f} onChange={(v) => setT('f', num(v))} suffix="g" />
            </Field>
            <Field label="Water">
              <NumInput value={t.water} onChange={(v) => setT('water', num(v))} suffix="ml" />
            </Field>
            <Field label="Steps">
              <NumInput value={t.steps} onChange={(v) => setT('steps', num(v))} />
            </Field>
            <Field label="Sleep">
              <NumInput value={t.sleepHours} onChange={(v) => setT('sleepHours', num(v))} suffix="h" />
            </Field>
          </div>
          <p className={cx('mt-2 text-xs', Math.abs(macroKcal - t.kcal) > 150 ? 'text-warn' : 'text-faint')}>
            Your macros add up to {fmtNum(macroKcal)} kcal ({macroKcal - t.kcal >= 0 ? '+' : ''}
            {fmtNum(macroKcal - t.kcal)} vs calorie target).
          </p>
        </Card>

        <Card title="Schedule" icon={Moon}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gym time">
              <input type="time" value={p.gymTime} onChange={(e) => setP('gymTime', e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg" />
            </Field>
            <Field label="Bedtime">
              <input type="time" value={p.bedTime} onChange={(e) => setP('bedTime', e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg" />
            </Field>
            <Field label="Water: % done by" hint={`${t.waterFrontPct}% by ${fmt12(t.waterFrontBy)}`}>
              <div className="flex gap-2">
                <div className="w-20">
                  <NumInput value={t.waterFrontPct} onChange={(v) => setT('waterFrontPct', Math.min(100, num(v) || 0))} suffix="%" />
                </div>
                <input type="time" value={t.waterFrontBy} onChange={(e) => setT('waterFrontBy', e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-2 text-fg" />
              </div>
            </Field>
            <Field label="New day starts at" hint="Late-night logs count toward the previous day">
              <select value={s.dayStartHour} onChange={(e) => setS('dayStartHour', Number(e.target.value))} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg">
                {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    {fmt12(`${String(h).padStart(2, '0')}:00`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Supplements" icon={Pill}>
          <div className="space-y-2">
            {state.supplements.map((x, i) => (
              <div key={x.id} className="flex items-center gap-2">
                <TextInput value={x.name} onChange={(e) => mutate((d) => (d.supplements[i].name = e.target.value))} className="!h-11 flex-1" aria-label="Supplement name" />
                <TextInput value={x.dose} onChange={(e) => mutate((d) => (d.supplements[i].dose = e.target.value))} className="!h-11 w-32" aria-label="Dose" />
                <IconButton
                  icon={Trash2}
                  size={17}
                  label={`Remove ${x.name}`}
                  className="hover:text-danger"
                  onClick={() => confirm(`Remove ${x.name}? Past check-ins stay in your history.`) && mutate((d) => (d.supplements = d.supplements.filter((y) => y.id !== x.id)))}
                />
              </div>
            ))}
            <Button size="sm" icon={Plus} onClick={() => mutate((d) => d.supplements.push({ id: uid(), name: 'New supplement', dose: '' }))}>
              Add supplement
            </Button>
          </div>
        </Card>

        <Card title="Workout" icon={Dumbbell}>
          <div className="divide-y divide-line/60">
            <Row label="Auto-start rest timer" hint="Starts when you tick a set">
              <Toggle checked={s.autoRest} onChange={(v) => setS('autoRest', v)} label="Auto rest timer" />
            </Row>
            <Row label="Keep screen awake" hint="During an active workout">
              <Toggle checked={s.keepAwake} onChange={(v) => setS('keepAwake', v)} label="Keep screen awake" />
            </Row>
            <Row label="Barbell weight" hint="Used by the plate calculator">
              <div className="w-24">
                <NumInput value={s.barKg} onChange={(v) => setS('barKg', num(v))} suffix="kg" className="!h-10" />
              </div>
            </Row>
          </div>
        </Card>

        <Card title="App" icon={Palette}>
          <Segmented
            value={s.theme}
            onChange={(v) => setS('theme', v)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
          <div className="mt-2 divide-y divide-line/60">
            <Row label="Sound" hint="Chime for reminders & rest timer">
              <Toggle checked={s.sound} onChange={(v) => setS('sound', v)} label="Sound" />
            </Row>
            <Row label="Vibration" hint="Android only; iPhone doesn't allow web vibration">
              <Toggle checked={s.vibrate} onChange={(v) => setS('vibrate', v)} label="Vibration" />
            </Row>
          </div>
        </Card>

        <Card title="Backup & data" icon={HardDrive}>
          <p className="text-sm text-muted">
            Everything is stored on this device only. No account, works offline.{' '}
            {lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleDateString()}.` : 'Not backed up yet.'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button icon={Download} onClick={download}>
              Export JSON
            </Button>
            <Button icon={Upload} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            {canShareFiles && (
              <Button icon={Share2} onClick={share} className="col-span-2">
                Share backup to Files / Drive
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <Button variant="danger" size="sm" icon={Trash2} className="mt-4" onClick={resetAll}>
            Erase all data
          </Button>
        </Card>

        <Card title="Install on your phone" icon={Smartphone}>
          {isStandalone() ? (
            <p className="text-sm text-good">Installed. You're running Fuel & Lift as an app.</p>
          ) : canInstall ? (
            <Button variant="primary" className="w-full" icon={Smartphone} onClick={install}>
              Install app
            </Button>
          ) : isIOS() ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button, then “Add to Home Screen”.</li>
              <li>Open Fuel & Lift from your home screen, then enable notifications in Reminders.</li>
            </ol>
          ) : (
            <p className="text-sm text-muted">In Chrome, open the ⋮ menu and choose “Install app” or “Add to Home screen”.</p>
          )}
        </Card>
        <p className="pb-2 text-center text-xs text-faint">Fuel & Lift · v1.0 · data stays on your device</p>
      </div>
    </>
  );
}
