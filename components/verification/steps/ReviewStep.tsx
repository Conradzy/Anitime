'use client';

import { useState } from 'react';
import { AlertIcon, CheckIcon, LockIcon } from '../icons';
import { post, type StepProps } from '../types';
import styles from '../verification.module.css';

/** Only the town and province are shown back — the street and barangay stay
 * hidden even in the user's own summary. */
function maskedAddress(a: NonNullable<StepProps['state']['address']>) {
  return `Barangay ${'•'.repeat(Math.min(a.barangay.length, 6))}, ${a.municipality}, ${a.province}`;
}

function Line({ label, value, ok = true }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className={styles.reviewLine}>
      {ok ? <CheckIcon size={14} stroke="#2F6B45" /> : <AlertIcon size={14} />}
      <span className={styles.reviewLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Step 5 — confirm everything, then submit. */
export function ReviewStep({ state, refresh, back, goTo }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<'IN_REVIEW' | null>(null);

  const idLabel = state.document?.documentNumberLast4
    ? `PhilID ending ${state.document.documentNumberLast4}`
    : 'National ID submitted';
  const idPending = state.document?.status === 'IN_REVIEW';

  async function complete() {
    setBusy(true);
    setError('');
    const { ok, data } = await post<{ status: string }>('/api/verification/complete', {});
    setBusy(false);
    if (!ok) {
      setError(data.error ?? 'Could not complete verification.');
      return;
    }
    // Approved flows straight into the success screen once state refreshes.
    if (data.status === 'IN_REVIEW') setSubmitted('IN_REVIEW');
    await refresh();
  }

  if (submitted === 'IN_REVIEW') {
    return (
      <>
        <span className={styles.kicker}>Submitted</span>
        <h1 className={styles.h1}>Your verification is being reviewed.</h1>
        <p className={styles.lede}>
          Someone from the AniTime team is checking your National ID. This usually takes a short while — we&apos;ll
          update your account as soon as it&apos;s done. You can keep using AniTime in the meantime.
        </p>
        <div className={styles.warn} style={{ marginTop: 20 }}>
          <span className={styles.statementIcon}>
            <AlertIcon size={15} />
          </span>
          Status: <strong>In review</strong>
        </div>
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <a className={styles.primary} href="/dashboard">
            Go to dashboard
          </a>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.h1}>You&apos;re almost done.</h1>
      <p className={styles.lede}>Check everything below, then complete your verification.</p>

      <div className={styles.fields}>
        <div className={styles.reviewGroup}>
          <div className={styles.reviewHead}>
            <span className={styles.reviewTitle}>Account</span>
            <button type="button" className={styles.editLink} onClick={() => goTo('account')}>
              Edit
            </button>
          </div>
          <Line label="Full name" value={state.account.fullname} />
          <Line label="Email" value={state.account.email} />
          <Line label="Phone" value={`${state.account.phoneMasked ?? '—'} · verified`} />
        </div>

        <div className={styles.reviewGroup}>
          <div className={styles.reviewHead}>
            <span className={styles.reviewTitle}>Personal</span>
            <button type="button" className={styles.editLink} onClick={() => goTo('personal')}>
              Edit
            </button>
          </div>
          <Line label="Birthdate" value={state.personal.birthdate ? 'Provided · kept private' : '—'} />
        </div>

        <div className={styles.reviewGroup}>
          <div className={styles.reviewHead}>
            <span className={styles.reviewTitle}>Address</span>
            <button type="button" className={styles.editLink} onClick={() => goTo('address')}>
              Edit
            </button>
          </div>
          <Line label="Residential" value={state.address ? maskedAddress(state.address) : '—'} />
        </div>

        <div className={styles.reviewGroup}>
          <div className={styles.reviewHead}>
            <span className={styles.reviewTitle}>Identity</span>
            <button type="button" className={styles.editLink} onClick={() => goTo('document')}>
              Edit
            </button>
          </div>
          <Line label="National ID" value={idPending ? `${idLabel} · awaiting review` : idLabel} ok={!idPending} />
          <Line label="Live selfie" value={state.live?.passed ? (state.live.faceMatched ? "Passed · face matches ID" : "Passed · face check awaiting review") : "Not done"} ok={Boolean(state.live?.passed && state.live.faceMatched)} />
        </div>

        <div className={styles.info}>
          <span className={styles.statementIcon}>
            <LockIcon size={15} />
          </span>
          Your ID number, birthdate and home address are never shown to buyers. Only a “Verified” badge appears on your
          listings.
        </div>

        {error && (
          <div className={styles.err} role="alert">
            <span className={styles.statementIcon}>
              <AlertIcon size={15} />
            </span>
            {error}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={back}>
          ← Back
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.primary} onClick={complete} disabled={busy}>
          {busy ? <span className={styles.spinner} /> : null}
          Complete verification
        </button>
      </div>
    </>
  );
}
