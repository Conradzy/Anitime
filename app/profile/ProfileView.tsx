'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AppSidebar } from '@/components/AppSidebar';
import { getInitials } from '@/lib/use-current-user';
import styles from './page.module.css';

export type ProfileData = {
  fullName: string;
  business: string | null;
  photoUrl: string | null;
  status: 'verified' | 'pending' | 'unverified';
  verifyNote: string;
  updated: string;
  quick: { label: string; value: string }[];
  fields: { label: string; value: string | null; wide?: boolean }[];
  /** buyers only: null = already can sell (or is a seller) */
  startSelling: 'offer' | 'pending' | null;
};

const STATUS_TEXT = { verified: 'Verified seller', pending: 'Pending review', unverified: 'Unverified' } as const;

function PasswordRequest() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    const res = await fetch('/api/profile/password-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(data.error ?? 'Could not reach the server. Try again.');
    setSentTo(data.email);
    setCurrent('');
    setNext('');
    setAgain('');
  }

  if (sentTo) {
    return (
      <div className={styles.pwOk} role="status">
        <strong>Check your email.</strong> We sent a confirmation link to {sentTo}. Your password changes only after you
        open it and confirm (the link works for 30 minutes).
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.pwBtn} onClick={() => setOpen(true)}>
        Request password change <span>→</span>
      </button>
    );
  }

  return (
    <form className={styles.pwForm} onSubmit={submit}>
      <div className={styles.pwTitle}>Change your password</div>
      <p className={styles.pwHint}>We&apos;ll email you a link to confirm it. Nothing changes until you do.</p>
      <label>
        Current password
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label>
        New password
        <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label>
        Repeat new password
        <input type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      {error && <div className={styles.pwErr} role="alert">{error}</div>}
      <div className={styles.pwActions}>
        <button type="button" className={styles.pwCancel} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className={styles.pwBtn} disabled={busy}>
          {busy ? 'Sending…' : 'Email me the confirmation'}
        </button>
      </div>
    </form>
  );
}

export function ProfileView({ data }: { data: ProfileData }) {
  const [mini, setMini] = useState(false);
  const verified = data.status === 'verified';

  return (
    <div data-shell="" className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="profile" mini={mini} onToggle={() => setMini((m) => !m)} />

      <div className={styles.main}>
        <header>
          <h1 className={styles.h1}>Account profile</h1>
          <p className={styles.sub}>Your seller identity as buyers and AniTime verification see it.</p>
        </header>

        <section className={styles.cover}>
          <div className={styles.seigaiha} aria-hidden="true">
            <i />
          </div>
          <div className={styles.coverMark}>
            <Image src="/brand/logo-256.png" alt="" width={96} height={96} className={styles.coverLogo} priority />
            <span className={styles.coverWord}>AniTime</span>
          </div>
          <div className={styles.coverTag}>Standard AniTime cover</div>
        </section>

        <div data-pcols="" className={styles.cols}>
          <section className={styles.card}>
            <div className={styles.idBlock}>
              <span className={styles.avatarWrap}>
                <span className={styles.avatar}>
                  {data.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.photoUrl} alt={`${data.fullName} profile picture`} />
                  ) : (
                    getInitials(data.fullName)
                  )}
                </span>
                {verified && (
                  <span className={styles.badge} title="Verified seller">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 10.4l3.4 3.2L15 6.6" />
                    </svg>
                  </span>
                )}
              </span>
              <div className={styles.center}>
                <div className={styles.name}>{data.fullName}</div>
                {data.business && <div className={styles.biz}>{data.business}</div>}
              </div>
              <span className={`${styles.pill} ${styles[data.status]}`}>
                <span className={styles.dot} />
                {STATUS_TEXT[data.status]}
              </span>
            </div>
            <div className={styles.quick}>
              {data.quick.map((q) => (
                <div key={q.label} className={styles.quickRow}>
                  <span>{q.label}</span>
                  <strong>{q.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.card} ${styles.info}`}>
            <div className={styles.infoHead}>
              <div>
                <h2 className={styles.h2}>Profile information</h2>
                <p className={styles.sub2}>Details on file with your AniTime seller account</p>
              </div>
              <span className={styles.updated}>Last updated {data.updated}</span>
            </div>

            <div data-infogrid="" className={styles.grid}>
              {data.fields.map((f) => (
                <div key={f.label} className={`${styles.field} ${f.wide ? styles.wide : ''}`}>
                  <div className={styles.fLabel}>{f.label}</div>
                  <div className={f.value ? styles.fValue : styles.fEmpty}>{f.value ?? 'Not provided'}</div>
                </div>
              ))}
            </div>

            <div className={styles.foot}>
              <span className={`${styles.note} ${verified ? '' : styles.noteWarn}`}>{data.verifyNote}</span>
              {!verified && data.status === 'unverified' && (
                <Link href="/account/verification" className={styles.link}>
                  Verify my account →
                </Link>
              )}
            </div>

            {data.startSelling && (
              <div className={styles.sellCard}>
                <div>
                  <div className={styles.sellTitle}>Want to sell your own produce too?</div>
                  <p className={styles.sellText}>
                    {data.startSelling === 'pending'
                      ? 'Your ID is with the AniTime admin. Once it is confirmed, Post produce and the seller dashboard unlock automatically.'
                      : 'Buying stays open to you. To also list produce, verify your identity with your National ID and a quick selfie.'}
                  </p>
                </div>
                {data.startSelling === 'offer' && (
                  <Link href="/account/verification" className={styles.sellBtn}>
                    Start selling →
                  </Link>
                )}
              </div>
            )}

            <div className={styles.pwWrap}>
              <PasswordRequest />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
