'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './DateTimePicker.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-09-24T10:00" — the same shape as an <input type="datetime-local">, so
 * callers that already store that string keep working. */
export const toLocalValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const parseValue = (v: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatWhen(v: string): string {
  const d = parseValue(v);
  if (!d) return '';
  const h = d.getHours() % 12 || 12;
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()} · ${h}:${pad(d.getMinutes())} ${ampm}`;
}

/** Days to draw for a month view, padded to whole weeks. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Tomorrow at 8 AM: a sensible first suggestion for a pickup or delivery. */
function defaultStart(minDate?: Date): Date {
  const base = minDate && minDate.getTime() > Date.now() ? new Date(minDate) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 8, 0);
}

/** The clock face. The hand is dragged (or tapped) to set the hour, then the
 * minute — the same motion as setting a real clock. */
function ClockFace({
  mode,
  hour12,
  minute,
  onPick,
  onDone,
}: {
  mode: 'hour' | 'minute';
  hour12: number;
  minute: number;
  onPick: (value: number) => void;
  onDone: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const valueFromPoint = (clientX: number, clientY: number) => {
    const svg = ref.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    // 0 degrees at 12 o'clock, growing clockwise
    const turns = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    if (mode === 'hour') {
      const h = Math.round(turns / 30) % 12;
      return h === 0 ? 12 : h;
    }
    return Math.round(turns / 6) % 60;
  };

  const handle = (e: React.PointerEvent) => {
    const v = valueFromPoint(e.clientX, e.clientY);
    if (v !== null) onPick(v);
  };

  const angle = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const reach = mode === 'hour' ? 48 : 68;
  const knobX = 100 + Math.cos(((angle - 90) * Math.PI) / 180) * reach;
  const knobY = 100 + Math.sin(((angle - 90) * Math.PI) / 180) * reach;
  const marks =
    mode === 'hour'
      ? Array.from({ length: 12 }, (_, i) => ({ label: String(i === 0 ? 12 : i), deg: i * 30 }))
      : Array.from({ length: 12 }, (_, i) => ({ label: pad(i * 5), deg: i * 30 }));

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 200"
      className={styles.clock}
      role="slider"
      aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
      aria-valuenow={mode === 'hour' ? hour12 : minute}
      aria-valuemin={mode === 'hour' ? 1 : 0}
      aria-valuemax={mode === 'hour' ? 12 : 59}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = true;
        // capture keeps the drag alive outside the dial; it must never stop the pick
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* no capture available: a plain click still works */
        }
        handle(e);
      }}
      onPointerMove={(e) => dragging.current && handle(e)}
      onPointerUp={(e) => {
        dragging.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* nothing was captured */
        }
        onDone();
      }}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        onPick(mode === 'hour' ? ((hour12 - 1 + step + 12) % 12) + 1 : (minute + step + 60) % 60);
      }}
    >
      <circle cx="100" cy="100" r="92" className={styles.dial} />
      <line x1="100" y1="100" x2={knobX} y2={knobY} className={mode === 'hour' ? styles.handShort : styles.handLong} />
      <circle cx={knobX} cy={knobY} r="15" className={styles.knob} />
      <circle cx="100" cy="100" r="5" className={styles.pin} />
      {marks.map((m) => {
        const rad = ((m.deg - 90) * Math.PI) / 180;
        const on = mode === 'hour' ? (hour12 % 12) * 30 === m.deg : minute === Number(m.label);
        // the numbers sit where that hand's knob lands, so the chosen one is inside it
        const r = mode === 'hour' ? 48 : 68;
        return (
          <text
            key={m.label}
            x={100 + Math.cos(rad) * r}
            y={100 + Math.sin(rad) * r + 5}
            className={on ? styles.markOn : styles.mark}
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Date and time in one popover: pick the day on a calendar, then set the hour
 * and the minutes by turning the clock hands, then press Select. It replaces
 * the browser's datetime-local box, which could not be closed once the
 * calendar was open and hid the time behind a tiny spinner.
 */
export function DateTimePicker({
  value,
  onChange,
  minDate,
  placeholder = 'Choose a date and time',
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  minDate?: Date;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'hour' | 'minute'>('date');
  const initial = useMemo(() => parseValue(value), [value]);
  const [draft, setDraft] = useState<Date>(() => initial ?? defaultStart(minDate));
  const [view, setView] = useState(() => {
    const d = initial ?? defaultStart(minDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const boxRef = useRef<HTMLDivElement>(null);

  // Opening always starts from whatever is currently chosen.
  const openPicker = () => {
    const d = parseValue(value) ?? defaultStart(minDate);
    setDraft(d);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setStep('date');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const days = monthGrid(view.year, view.month);
  const today = new Date();
  const floor = minDate ?? new Date(0);
  const hour12 = draft.getHours() % 12 || 12;
  const isPm = draft.getHours() >= 12;
  const tooEarly = draft.getTime() < floor.getTime();

  const setTime = (h12: number, minute: number, pm: boolean) => {
    const h = (h12 % 12) + (pm ? 12 : 0);
    setDraft((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, minute));
  };

  return (
    <div className={styles.wrap} ref={boxRef}>
      <button
        type="button"
        id={id}
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-expanded={open}
      >
        <span className={styles.triggerIcon} aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="4.6" width="14" height="12.4" rx="2.4" />
            <path d="M3 8.4h14M7 3v3M13 3v3" />
          </svg>
        </span>
        <span className={value ? styles.triggerValue : styles.triggerEmpty}>{value ? formatWhen(value) : placeholder}</span>
      </button>

      {open && (
        <div className={styles.pop} role="dialog" aria-label="Choose a date and time">
          <div className={styles.popHead}>
            <span className={styles.popTitle}>
              {step === 'date' ? 'Pick a date' : step === 'hour' ? 'Set the hour' : 'Set the minutes'}
            </span>
            <button type="button" className={styles.popX} onClick={() => setOpen(false)} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5 5l10 10" />
                <path d="M15 5L5 15" />
              </svg>
            </button>
          </div>

          {step === 'date' ? (
            <>
              <div className={styles.monthRow}>
                <button
                  type="button"
                  className={styles.navBtn}
                  aria-label="Previous month"
                  onClick={() => setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }))}
                >
                  ‹
                </button>
                <span className={styles.monthName}>
                  {MONTHS[view.month]} {view.year}
                </span>
                <button
                  type="button"
                  className={styles.navBtn}
                  aria-label="Next month"
                  onClick={() => setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }))}
                >
                  ›
                </button>
              </div>
              <div className={styles.dow}>
                {DOW.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className={styles.grid}>
                {days.map((d) => {
                  const outside = d.getMonth() !== view.month;
                  const disabled = d < new Date(floor.getFullYear(), floor.getMonth(), floor.getDate());
                  const on = sameDay(d, draft);
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={disabled}
                      className={`${styles.day} ${on ? styles.dayOn : ''} ${outside ? styles.dayOut : ''} ${
                        sameDay(d, today) ? styles.dayToday : ''
                      }`}
                      onClick={() => {
                        setDraft((cur) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), cur.getHours(), cur.getMinutes()));
                        setStep('hour');
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className={styles.readout}>
                <button type="button" className={step === 'hour' ? styles.timeOn : styles.timeOff} onClick={() => setStep('hour')}>
                  {pad(hour12)}
                </button>
                <span className={styles.colon}>:</span>
                <button type="button" className={step === 'minute' ? styles.timeOn : styles.timeOff} onClick={() => setStep('minute')}>
                  {pad(draft.getMinutes())}
                </button>
                <span className={styles.ampm}>
                  <button
                    type="button"
                    className={!isPm ? styles.apOn : styles.apOff}
                    onClick={() => setTime(hour12, draft.getMinutes(), false)}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    className={isPm ? styles.apOn : styles.apOff}
                    onClick={() => setTime(hour12, draft.getMinutes(), true)}
                  >
                    PM
                  </button>
                </span>
              </div>

              <ClockFace
                mode={step === 'hour' ? 'hour' : 'minute'}
                hour12={hour12}
                minute={draft.getMinutes()}
                onPick={(v) => (step === 'hour' ? setTime(v, draft.getMinutes(), isPm) : setTime(hour12, v, isPm))}
                onDone={() => step === 'hour' && setStep('minute')}
              />

              <p className={styles.clockHint}>
                {step === 'hour'
                  ? 'Turn the short hand to the hour, then set the minutes.'
                  : 'Turn the long hand to the minutes.'}
              </p>
            </>
          )}

          <div className={styles.popFoot}>
            <span className={styles.preview}>{formatWhen(toLocalValue(draft))}</span>
            {step !== 'date' && (
              <button type="button" className={styles.backBtn} onClick={() => setStep('date')}>
                Calendar
              </button>
            )}
            <button
              type="button"
              className={styles.selectBtn}
              disabled={tooEarly}
              onClick={() => {
                onChange(toLocalValue(draft));
                setOpen(false);
              }}
            >
              {tooEarly ? 'Already passed' : 'Select'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
