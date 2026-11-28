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
import { DEFAULT_BOT_URL, adoptRemote, botApi, deviceKey, syncOnce, syncStatus } from '../lib/sync';
import { Laptop, Link2, RefreshCw, Smartphone as PhoneIcon } from 'lucide-react';
import { energyEstimate, fmtHM, fromLen, kcalFromMacros, lenUnit, profileAge, sleepSpan, toLen } from '../lib/nutrition';
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
  const unit = lenUnit(state);
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
  // Android's share sheet only accepts a few file types (not .json), so the shared copy is a .txt with the same JSON inside.
  const shareFile = () => new File([backupText()], `fuel-lift-backup-${ymd(new Date())}.txt`, { type: 'text/plain' });
  const markBackedUp = () => mutate((d) => (d.meta.lastBackup = Date.now()));
  const download = () => {
    try {
      const blob = new Blob([backupText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      markBackedUp();
      toast('Backup saved to your Downloads');
    } catch (e) {
      toast(`Download failed (${e.message}). Try Share instead.`);
    }
  };
  const canShareFiles = (() => {
    try {
      return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
    } catch {
      return false;
    }
  })();
  const share = async () => {
    try {
      await navigator.share({ files: [shareFile()], title: 'Fuel & Lift backup' });
      markBackedUp();
      toast('Backup shared');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      toast(`Sharing didn't work (${e?.message || e}). Using Download instead.`);
      download();
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

        <DevicesCard />

        <Card title="Profile" icon={User}>
          <div className="grid grid-cols-3 gap-2">
            <Field label={`Born (age ${profileAge(p)})`}>
              <input type="date" value={p.dob || ''} max={ymd(new Date())} onChange={(e) => setP('dob', e.target.value || null)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-2 text-sm text-fg" />
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Goal">
              <select value={p.goalType || 'cut'} onChange={(e) => setP('goalType', e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg">
                <option value="lean_bulk">Lean bulk</option>
                <option value="cut">Fat loss</option>
                <option value="recomp">Recomp</option>
              </select>
            </Field>
            <Field label="Target weight">
              <NumInput value={p.targetWeight} onChange={(v) => setP('targetWeight', num(v))} suffix="kg" />
            </Field>
            <Field label={`Chest goal (${unit})`}>
              <NumInput value={toLen(p.goals?.chest, unit) ?? ''} onChange={(v) => mutate((d) => (d.profile.goals = { ...(d.profile.goals || {}), chest: v === '' ? null : fromLen(v, unit) }))} suffix={unit} />
            </Field>
            <Field label={`Bicep goal (${unit})`}>
              <NumInput value={toLen(p.goals?.arm, unit) ?? ''} onChange={(v) => mutate((d) => (d.profile.goals = { ...(d.profile.goals || {}), arm: v === '' ? null : fromLen(v, unit) }))} suffix={unit} />
            </Field>
            <Field label={`Waist goal at navel (${unit})`}>
              <NumInput value={toLen(p.goals?.waist, unit) ?? ''} onChange={(v) => mutate((d) => (d.profile.goals = { ...(d.profile.goals || {}), waist: v === '' ? null : fromLen(v, unit) }))} suffix={unit} />
            </Field>
            <Field label={`Waist stretch goal (${unit})`}>
              <NumInput value={toLen(p.goals?.waistStretch, unit) ?? ''} onChange={(v) => mutate((d) => (d.profile.goals = { ...(d.profile.goals || {}), waistStretch: v === '' ? null : fromLen(v, unit) }))} suffix={unit} />
            </Field>
          </div>
          <Field label="Goal note" className="mt-3">
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
              {est.tdee - t.kcal > 0 ? ` ≈ ${(((est.tdee - t.kcal) * 7) / 7700).toFixed(2)} kg fat loss/week` : ' (lean bulk: aim for +0.2–0.35 kg/week)'}. Protein is{' '}
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
              <input
                type="time"
                value={p.bedTime}
                onChange={(e) => e.target.value && mutate((d) => ((d.profile.bedTime = e.target.value), (d.targets.sleepHours = sleepSpan(e.target.value, d.profile.wakeTime || '10:10'))))}
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg"
              />
            </Field>
            <Field label="Wake up" hint={`Sleep goal ${fmtHM(t.sleepHours)}`}>
              <input
                type="time"
                value={p.wakeTime || '10:10'}
                onChange={(e) => e.target.value && mutate((d) => ((d.profile.wakeTime = e.target.value), (d.targets.sleepHours = sleepSpan(d.profile.bedTime || '02:00', e.target.value))))}
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg"
              />
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
              <div key={x.id} className="space-y-2 rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted">In stock</span>
                  <div className="w-20">
                    <NumInput
                      value={x.stock ?? ''}
                      onChange={(v) => mutate((d) => (d.supplements[i].stock = v === '' ? null : Math.max(0, Number(v))))}
                      placeholder="–"
                      className="!h-10"
                      aria-label={`${x.name} stock`}
                    />
                  </div>
                  <TextInput
                    value={x.stockUnit || ''}
                    onChange={(e) => mutate((d) => (d.supplements[i].stockUnit = e.target.value))}
                    placeholder={x.id === 'whey' ? 'scoops' : x.id === 'creatine' ? 'servings' : 'capsules'}
                    className="!h-10 min-w-0 flex-1 text-sm"
                    aria-label={`${x.name} stock unit`}
                  />
                  <Button size="sm" onClick={() => mutate((d) => (d.supplements[i].stock = (Number(d.supplements[i].stock) || 0) + (Number(x.packSize) || 30)))}>
                    +{Number(x.packSize) || 30}
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-faint">
              Set how many you have. Each tick uses one, you get a heads-up at 5 left, and reminders tell you when it's out. In Telegram: <code>stock vit c 30</code> or{' '}
              <code>bought creatine 60</code>.
            </p>
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
            <Row label="Straight bar" hint="Bench, rows, squats. Log weights as the total incl. the bar">
              <div className="w-24">
                <NumInput value={s.barKg} onChange={(v) => setS('barKg', num(v))} suffix="kg" className="!h-10" aria-label="Straight bar weight" />
              </div>
            </Row>
            <Row label="EZ curl bar" hint="Curls, preacher curls, skull crushers">
              <div className="w-24">
                <NumInput value={s.ezBarKg} onChange={(v) => setS('ezBarKg', num(v))} suffix="kg" className="!h-10" aria-label="EZ bar weight" />
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
          <input ref={fileRef} type="file" accept="application/json,.json,text/plain,.txt" className="hidden" onChange={onImport} />
          <p className="mt-2 text-xs text-faint">With Devices & sync on, your bot server also keeps a full copy that updates automatically.</p>
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

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Browser';
};

/** Link devices with a 6-digit code and keep them in sync through the bot server. */
function DevicesCard() {
  const { state, latest, apply, replace } = useStore();
  const { toast } = useApp();
  const tg = state.meta.tg || {};
  const linked = !!(tg.paired && tg.url);
  const [status, setStatus] = useState(syncStatus());
  const [code, setCode] = useState(null); // { code, exp }
  const [devices, setDevices] = useState([]);
  const [input, setInput] = useState('');
  const [name, setName] = useState(deviceName());
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    const on = () => setStatus(syncStatus());
    window.addEventListener('fuel-lift-sync', on);
    const id = setInterval(() => force((x) => x + 1), 15000);
    return () => {
      window.removeEventListener('fuel-lift-sync', on);
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!linked) return;
    botApi(tg.url, '/api/devices')
      .then((r) => setDevices(r.devices))
      .catch(() => {});
  }, [linked, tg.url, code]);

  const ago = (t) => {
    if (!t) return 'never';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      await syncOnce({ url: tg.url, latest, apply });
      toast('Synced');
    } catch (e) {
      toast(`Sync failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const makeCode = async () => {
    setBusy(true);
    try {
      setCode(await botApi(tg.url, '/api/devices/link', { method: 'POST' }));
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const removeDevice = async (id) => {
    if (!confirm('Unlink this device? It keeps its copy but stops syncing.')) return;
    await botApi(tg.url, '/api/devices/remove', { method: 'POST', body: { id } }).catch(() => {});
    setDevices((d) => d.filter((x) => x.id !== id));
  };
  const claim = async () => {
    const hasData = Object.keys(state.days).length > 0;
    if (hasData && !confirm("This device's own log will be replaced by your phone's data. Continue?")) return;
    setBusy(true);
    try {
      const url = state.meta.tg?.url || DEFAULT_BOT_URL;
      await botApi(url, '/api/devices/claim', { method: 'POST', auth: false, body: { code: input.replace(/\D/g, ''), key: deviceKey(), name } });
      await adoptRemote({ url, latest, replace });
      toast('Linked. This device now shows your phone\'s data.');
    } catch (e) {
      toast(e.code === 'wrong_code' ? 'Wrong code. Check the 6 digits on your phone.' : e.code === 'code_expired' ? 'That code expired. Make a new one on your phone.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Devices & sync" icon={Link2}>
      {linked ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              <span className={status.error ? 'text-warn' : 'text-good'}>{status.error ? 'Sync problem' : 'Sync is on'}</span>
              <span className="text-muted"> · last synced {ago(status.at)}</span>
            </p>
            <Button size="sm" icon={RefreshCw} onClick={syncNow} disabled={busy}>
              Sync
            </Button>
          </div>
          {status.error && <p className="mt-1 text-xs text-warn">{status.error}</p>}
          {code ? (
            <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-center">
              <p className="text-xs text-muted">On the other device open fit.fineradesk.com → More → Devices & sync, and enter:</p>
              <p className="tnum mt-1 text-3xl font-bold tracking-[0.3em]">{code.code}</p>
              <p className="text-xs text-faint">Valid for 10 minutes</p>
            </div>
          ) : (
            <Button className="mt-3 w-full" icon={Laptop} onClick={makeCode} disabled={busy}>
              Link another device
            </Button>
          )}
          {devices.length > 0 && (
            <ul className="mt-3 divide-y divide-line/60 text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-2">
                  {d.id === 'primary' ? <PhoneIcon size={16} className="text-muted" /> : <Laptop size={16} className="text-muted" />}
                  <span className="flex-1">
                    {d.name}
                    {d.current && <span className="text-faint"> · this device</span>}
                  </span>
                  {d.id !== 'primary' && !d.current && (
                    <button type="button" onClick={() => removeDevice(d.id)} className="text-xs text-danger">
                      Unlink
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-faint">Your full log is kept on your bot server so every linked device shows the same data. Changes merge entry by entry.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Already using Fuel & Lift on your phone? Link this device to see and edit the same data.</p>
          <p className="mt-1 text-xs text-faint">On your phone: More → Devices & sync → Link another device. Then enter the 6-digit code here.</p>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <TextInput value={input} onChange={(e) => setInput(e.target.value)} inputMode="numeric" placeholder="6-digit code" maxLength={7} className="tnum text-lg tracking-widest" />
            <Button variant="primary" onClick={claim} disabled={busy || input.replace(/\D/g, '').length !== 6}>
              Link
            </Button>
          </div>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name" className="mt-2 !h-10 text-sm" aria-label="Device name" />
        </>
      )}
    </Card>
  );
}
