export const pad = (n) => String(n).padStart(2, '0');

/** "HH:MM" -> minutes after midnight */
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** minutes (any int) -> "HH:MM" wrapped to 24h */
export const fromMin = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** "21:30" -> "9:30 PM" */
export const fmt12 = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ap}`;
};

export const hhmmOf = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const fmtTime = (msOrDate) => fmt12(hhmmOf(new Date(msOrDate)));

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseYmd(key);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

/**
 * The "logical" day. Your day runs past midnight (gym 10 PM, bed 2 AM), so anything
 * logged before `startHour` (default 4 AM) counts toward the previous day.
 */
export const dayKey = (date = new Date(), startHour = 4) => {
  const d = new Date(date.getTime());
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return ymd(d);
};

/** Minutes since the logical day started (0 at e.g. 4:00 AM). */
export const minutesIntoDay = (date, startHour = 4) =>
  (date.getHours() * 60 + date.getMinutes() - startHour * 60 + 1440) % 1440;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = DOW;

export const fmtShortDate = (key) => {
  const d = parseYmd(key);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};
export const fmtDay = (key, todayKey) => {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, -1)) return 'Yesterday';
  const d = parseYmd(key);
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
};

export const fmtDuration = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${pad(s % 60)}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
