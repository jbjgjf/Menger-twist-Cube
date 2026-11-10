import { useEffect, useRef, useState, type ReactNode } from 'react';
import { accentOptions, setThemeAccent, setThemeMode, useTheme, type ThemeMode } from './store';

const modes: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Auto' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs text-slate-400">{children}</p>;
}

/** Quiet segmented control, used for appearance and anything else with a few options. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid gap-0.5 rounded-full bg-slate-100/[0.07] p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            disabled={disabled && !active}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-2 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
              active ? 'bg-slate-100/[0.14] text-slate-100' : 'bg-transparent text-slate-400 hover:bg-transparent hover:text-slate-100'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A plain text action row, no chrome. */
export function SettingsAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-transparent px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-100/[0.07] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * The only chrome on screen: a gear that opens appearance settings.
 * Page-specific rows (level, actions) are passed in as children.
 */
export default function SettingsMenu({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-col items-end">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent p-0 text-slate-300 transition hover:bg-slate-100/10 hover:text-slate-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="17" x2="20" y2="17" />
          <circle cx="9" cy="7" r="2.4" fill="rgb(var(--slate-950))" />
          <circle cx="15" cy="17" r="2.4" fill="rgb(var(--slate-950))" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-[min(17.5rem,calc(100vw-2rem))] space-y-5 rounded-3xl bg-slate-900/80 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] ring-1 ring-slate-100/10 backdrop-blur-2xl">
          {children}

          <div>
            <SettingsLabel>Appearance</SettingsLabel>
            <Segmented options={modes} value={theme.mode} onChange={setThemeMode} />
          </div>

          <div>
            <SettingsLabel>Accent</SettingsLabel>
            <div className="flex items-center justify-between px-1">
              {accentOptions.map((option) => {
                const active = option.id === theme.accent;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={active}
                    onClick={() => setThemeAccent(option.id)}
                    className={`h-6 w-6 rounded-full p-0 ring-1 ring-slate-100/20 transition ${
                      active ? 'scale-100 ring-2 ring-slate-100/80 ring-offset-2 ring-offset-slate-900' : 'scale-90 hover:scale-100'
                    }`}
                    style={{ backgroundColor: option.swatch }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
