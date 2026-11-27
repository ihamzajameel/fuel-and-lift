import { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

export const TONES = {
  kcal: { bar: 'bg-accent', soft: 'bg-accent/15', dot: 'bg-accent', stroke: 'var(--accent)', label: 'Calories' },
  p: { bar: 'bg-protein', soft: 'bg-protein/15', dot: 'bg-protein', stroke: 'var(--protein)', label: 'Protein' },
  c: { bar: 'bg-carbs', soft: 'bg-carbs/15', dot: 'bg-carbs', stroke: 'var(--carbs)', label: 'Carbs' },
  f: { bar: 'bg-fat', soft: 'bg-fat/15', dot: 'bg-fat', stroke: 'var(--fat)', label: 'Fat' },
  water: { bar: 'bg-water', soft: 'bg-water/15', dot: 'bg-water', stroke: 'var(--water)', label: 'Water' },
  lift: { bar: 'bg-lift', soft: 'bg-lift/15', dot: 'bg-lift', stroke: 'var(--lift)', label: 'Strength' },
};

export function Card({ title, icon: Icon, iconClass = 'text-muted', right, children, className, padded = true }) {
  return (
    <section className={cx('rounded-2xl border border-line/70 bg-surface', padded && 'p-4', className)}>
      {(title || right) && (
        <header className={cx('mb-3 flex min-h-6 items-center justify-between gap-2', !padded && 'px-4 pt-4')}>
          {title && (
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
              {Icon && <Icon size={16} className={iconClass} aria-hidden />}
              {title}
            </h2>
          )}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const BTN = {
  primary: 'bg-accent text-on-accent font-semibold hover:brightness-110',
  soft: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20',
  water: 'bg-water/12 text-fg border border-water/30 hover:bg-water/20',
  lift: 'bg-lift text-on-accent font-semibold hover:brightness-110',
};
const SIZE = {
  sm: 'h-9 px-3 rounded-lg text-sm gap-1.5',
  md: 'h-11 px-4 rounded-xl text-[15px] gap-2',
  lg: 'h-14 px-5 rounded-2xl text-base gap-2',
};

export function Button({ variant = 'soft', size = 'md', className, children, icon: Icon, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'press inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        BTN[variant],
        SIZE[size],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, size = 20, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('press grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg', className)}
      {...props}
    >
      <Icon size={size} aria-hidden />
    </button>
  );
}

export function Toggle({ checked, onChange, label, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3', className)}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

export const inputCls =
  'h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-fg placeholder:text-faint focus:border-accent focus:outline-none';

export function Field({ label, hint, children, className }) {
  const id = useId();
  return (
    <label htmlFor={typeof children === 'function' ? id : undefined} className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>}
      {typeof children === 'function' ? children(id) : children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }) {
  return <input type="text" className={cx(inputCls, className)} {...props} />;
}

export function NumInput({ value, onChange, className, suffix, ...props }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className={cx(inputCls, 'tnum', suffix && 'pr-10', className)}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-faint">{suffix}</span>}
    </div>
  );
}

export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cx('flex rounded-xl bg-surface-2 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 font-medium transition-colors',
            size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm',
            value === o.value ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'kcal', marker, className, height = 'h-2' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max * 1.05;
  return (
    <div className={cx('relative w-full overflow-visible rounded-full bg-surface-3', height, className)}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-500', over && tone !== 'water' ? 'bg-warn' : TONES[tone].bar)}
        style={{ width: `${pct}%` }}
      />
      {marker != null && max > 0 && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-fg/70"
          style={{ left: `calc(${Math.min(100, (marker / max) * 100)}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function Ring({ value, max, size = 120, stroke = 12, tone = 'kcal', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.05;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          opacity={pct > 0 ? 1 : 0}
          stroke={over ? 'var(--warn)' : TONES[tone].stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="anim-slide-up relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-line/60 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>
  );
}

export function Chip({ active, children, className, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'press h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? 'border-accent bg-accent/15 text-fg' : 'border-line bg-surface-2 text-muted hover:text-fg',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Dot({ tone, className }) {
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', TONES[tone].dot, className)} aria-hidden />;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {Icon && <Icon size={28} className="text-faint" aria-hidden />}
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-xs text-sm text-muted">{children}</p>}
    </div>
  );
}

export function ScreenHeader({ title, subtitle, right }) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line/50 bg-bg/90 backdrop-blur-md">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          {subtitle && <p className="truncate text-xs font-medium text-muted">{subtitle}</p>}
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}

export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString();
