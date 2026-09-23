'use client';

import { useState } from 'react';
import styles from './page.module.css';

export function ReviewActions({ token, initial }: { token: string; initial: 'APPROVED' | 'DECLINED' | null }) {
  const [done, setDone] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decide(decision: 'APPROVED' | 'DECLINED') {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/id-review/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) setDone(decision);
    else if (data.decision) setDone(data.decision);
    else setError(data.error ?? 'Could not save your decision. Try again.');
  }

  if (done) {
    return (
      <div className={done === 'APPROVED' ? styles.okBox : styles.badBox} role="status">
        {done === 'APPROVED'
          ? 'ID confirmed. The applicant now has the Verified badge.'
          : 'ID rejected. The applicant will have to submit their ID again.'}
      </div>
    );
  }
  return (
    <>
      {error && <div className={styles.badBox} role="alert">{error}</div>}
      <div className={styles.actions}>
        <button className={styles.reject} disabled={busy} onClick={() => decide('DECLINED')}>Reject ID</button>
        <button className={styles.confirm} disabled={busy} onClick={() => decide('APPROVED')}>Confirm ID</button>
      </div>
    </>
  );
}
