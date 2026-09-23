'use client';

import { useEffect, useRef } from 'react';
import styles from './verification.module.css';

const LENGTH = 6;

/** Six single-digit boxes. Typing moves forward, Backspace moves back, and a
 * pasted code (or the phone's "from Messages" suggestion) fills all six. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  function setDigits(startAt: number, digits: string) {
    const chars = value.padEnd(LENGTH, ' ').split('');
    for (let k = 0; k < digits.length && startAt + k < LENGTH; k++) chars[startAt + k] = digits[k];
    const next = chars.join('').replace(/ /g, '').slice(0, LENGTH);
    onChange(next);
    focusAt(startAt + digits.length);
    if (next.length === LENGTH) onComplete?.();
  }

  return (
    <div className={styles.otpRow} role="group" aria-label="6-digit verification code">
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`${styles.otpBox} ${value[i] ? styles.otpBoxFilled : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH} // allows a paste into any box; trimmed below
          aria-label={`Digit ${i + 1}`}
          value={value[i] ?? ''}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) return;
            setDigits(i, digits);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) {
                onChange(value.slice(0, i - 1) + value.slice(i));
                focusAt(i - 1);
              }
            } else if (e.key === 'ArrowLeft') focusAt(i - 1);
            else if (e.key === 'ArrowRight') focusAt(i + 1);
            else if (e.key === 'Enter' && value.length === LENGTH) onComplete?.();
          }}
          onPaste={(e) => {
            const digits = e.clipboardData.getData('text').replace(/\D/g, '');
            if (!digits) return;
            e.preventDefault();
            setDigits(0, digits.slice(0, LENGTH));
          }}
        />
      ))}
    </div>
  );
}
