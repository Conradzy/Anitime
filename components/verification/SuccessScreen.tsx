'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckIcon } from './icons';
import styles from './verification.module.css';

const DONE = ['Account', 'Contact details', 'Personal information', 'National ID', 'Live selfie'];

/** Shown once identity verification is approved. */
export function SuccessScreen() {
  const [paymentDismissed, setPaymentDismissed] = useState(false);

  return (
    <div className={styles.successPage}>
      <div className={styles.successInner}>
        <span className={styles.successRing}>
          <svg className={styles.successCheck} width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#A7C641" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.6l4.6 4.6L19 6.8" />
          </svg>
        </span>

        <h1 className={styles.successTitle}>You&apos;re verified.</h1>
        <p className={styles.successText}>
          Your AniTime identity has been verified. Your listings now carry the Verified badge, and buyers can see that
          your account is confirmed.
        </p>

        <ul className={styles.successList}>
          {DONE.map((label) => (
            <li key={label} className={styles.successItem}>
              <CheckIcon size={15} stroke="#A7C641" />
              {label}
            </li>
          ))}
        </ul>

        {!paymentDismissed && (
          <div className={styles.optionalCard}>
            <div className={styles.optionalTitle}>Optional: add a payment method</div>
            <p className={styles.optionalText}>
              Add a card later when you&apos;re ready to make online payments. Your verification is already complete
              without it.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className={styles.successGhost} disabled title="Card payments are not connected yet">
                Add payment method
              </button>
              <button type="button" className={styles.successGhost} onClick={() => setPaymentDismissed(true)}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        <div className={styles.successActions}>
          <Link href="/dashboard" className={styles.successPrimary}>
            Go to dashboard
          </Link>
          <Link href="/seller-home" className={styles.successGhost}>
            View profile
          </Link>
        </div>
      </div>
    </div>
  );
}
