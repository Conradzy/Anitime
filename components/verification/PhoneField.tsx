'use client';

import type { ReactNode } from 'react';
import styles from './verification.module.css';

/** Digits after +63 — a PH mobile number is 10 digits and always starts with 9. */
export function toNational(input: string): string {
  let d = input.replace(/\D/g, '');
  // Pasted "+63 917…", "63917…" or "0917…": drop the country code / trunk zero.
  if (d.startsWith('63') && d.length > 10) d = d.slice(2);
  else if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.slice(0, 10);
}

export const isValidNational = (d: string) => /^9\d{9}$/.test(d);

/** 9543916877 -> "954 391 6877" (for display only). */
function group(d: string) {
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}

function PhFlag() {
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" aria-hidden="true" style={{ borderRadius: 3, flex: '0 0 auto' }}>
      <rect width="22" height="7.5" fill="#0038A8" />
      <rect y="7.5" width="22" height="7.5" fill="#CE1126" />
      <path d="M0 0l11 7.5L0 15z" fill="#FFFFFF" />
      <circle cx="3.6" cy="7.5" r="1.5" fill="#FCD116" />
    </svg>
  );
}

/** Mobile number box with a fixed "+63" prefix, so people only type the ten
 * digits that start with 9. */
export function PhoneField({
  id,
  value,
  onChange,
  onEnter,
  disabled,
  action,
}: {
  id: string;
  value: string; // national digits, e.g. "9543916877"
  onChange: (national: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  /** Rendered on the same line as the input box (e.g. the Send code button). */
  action?: ReactNode;
}) {
  const wrongStart = value.length > 0 && value[0] !== '9';
  const complete = isValidNational(value);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        Mobile number
      </label>
      <div className={styles.phoneLine}>
        <div className={`${styles.phoneBox} ${wrongStart ? styles.phoneBoxBad : ''}`}>
          <span className={styles.phonePrefix}>
            <PhFlag />
            <span>+63</span>
          </span>
          <input
            id={id}
            className={styles.phoneInput}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="9XX XXX XXXX"
            value={group(value)}
            onChange={(e) => onChange(toNational(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && complete && onEnter?.()}
            disabled={disabled}
            aria-invalid={wrongStart}
            aria-describedby={`${id}-hint`}
          />
        </div>
        {action}
      </div>
      <span id={`${id}-hint`} className={wrongStart ? styles.hintBad : styles.hint}>
        {wrongStart
          ? 'Philippine mobile numbers start with 9 — for example 917 123 4567.'
          : 'Type the 10 digits after +63. It starts with 9 — for example 917 123 4567.'}
      </span>
    </div>
  );
}
