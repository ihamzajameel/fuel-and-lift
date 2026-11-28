// Log a night's sleep: one tap for your usual times, or pick bed and wake times.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useStore } from '../lib/store';
import { Button, cx } from './ui';
import { fmtHM, sleepSpan } from '../lib/nutrition';
import { fmt12 } from '../lib/time';
import * as ops from '../lib/ops';

const timeCls = 'h-11 w-full rounded-xl border border-line bg-surface-2 px-2 text-fg';

export default function SleepEditor({ dateKey, title = 'Sleep last night' }) {
  const { state, mutate } = useStore();
  const p = state.profile;
  const usualBed = p.bedTime || '02:00';
  const usualWake = p.wakeTime || '10:10';
  const sleep = state.days[dateKey]?.sleep || null;
  const [editing, setEditing] = useState(false);
  const [bed, setBed] = useState(usualBed);
  const [wake, setWake] = useState(usualWake);
  const goal = state.targets.sleepHours;

  const open = () => {
    setBed(sleep?.bed || usualBed);
    setWake(sleep?.wake || usualWake);
    setEditing(true);
  };
  const save = () => {
    mutate((d) => ops.setSleep(d, dateKey, { ...(d.days[dateKey]?.sleep || {}), bed, wake, hours: sleepSpan(bed, wake), at: Date.now() }));
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-faint">goal {fmtHM(goal)}</p>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Went to bed
              <input type="time" value={bed} onChange={(e) => e.target.value && setBed(e.target.value)} className={cx(timeCls, 'mt-1')} />
            </label>
            <label className="text-xs text-muted">
              Woke up
              <input type="time" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} className={cx(timeCls, 'mt-1')} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="tnum text-sm text-muted">
              = <b className="text-fg">{fmtHM(sleepSpan(bed, wake))}</b>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : sleep?.hours ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <div>
            <p className={cx('tnum text-xl font-bold', sleep.hours < goal - 0.5 && 'text-warn')}>{fmtHM(sleep.hours)}</p>
            <p className="tnum text-xs text-muted">{sleep.bed ? `${fmt12(sleep.bed)} → ${fmt12(sleep.wake)}` : 'logged'}</p>
          </div>
          <Button size="sm" onClick={open}>
            Change
          </Button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <Button variant="primary" icon={Check} onClick={() => mutate((d) => ops.logUsualSleep(d, dateKey))}>
            As usual · {fmt12(usualBed).replace(':00', '')}–{fmt12(usualWake)}
          </Button>
          <Button onClick={open}>Different</Button>
        </div>
      )}
    </div>
  );
}
