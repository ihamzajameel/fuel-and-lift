// Export reminders as a recurring calendar (.ics). Calendar alarms fire even when the
// app is closed, which browsers cannot guarantee for locally scheduled notifications.
import { pad, parseYmd, toMin } from './time';
import { slotTimes } from './reminders';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const fold = (line) => {
  const out = [];
  let s = line;
  while (s.length > 74) {
    out.push(s.slice(0, 74));
    s = ' ' + s.slice(74);
  }
  out.push(s);
  return out.join('\r\n');
};
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

export function buildICS(reminders, todayKey, startHour = 4) {
  const now = new Date();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fuel & Lift//Reminders//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Fuel & Lift'];
  for (const r of reminders.filter((x) => x.enabled)) {
    for (const t of slotTimes(r, startHour)) {
      const min = toMin(t);
      const afterMidnight = min < startHour * 60;
      const d = parseYmd(todayKey);
      if (afterMidnight) d.setDate(d.getDate() + 1);
      d.setHours(Math.floor(min / 60), min % 60, 0, 0);
      let rrule = 'RRULE:FREQ=DAILY';
      if (r.days?.length) {
        const days = r.days.map((w) => BYDAY[(w + (afterMidnight ? 1 : 0)) % 7]);
        rrule = `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`;
      }
      lines.push(
        'BEGIN:VEVENT',
        `UID:fuel-lift-${r.id}-${t.replace(':', '')}@fuel-lift.app`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${local(d)}`,
        'DURATION:PT10M',
        rrule,
        fold(`SUMMARY:${esc(r.title)}`),
        fold(`DESCRIPTION:${esc(r.dynamic === 'water' ? 'Sip 200–250 ml water. Front-load: 80% before 9 PM.' : r.body)}`),
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        fold(`DESCRIPTION:${esc(r.title)}`),
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT'
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
