'use client';

import { useState } from 'react';
import { AlertIcon, CheckIcon, EyeOffIcon, LockIcon, ShieldCheckIcon } from '../icons';
import { CameraCapture } from '../CameraCapture';
import { QrScanner } from '../QrScanner';
import { post, uploadImage, type StepProps } from '../types';
import styles from '../verification.module.css';

type Status = 'match' | 'close' | 'mismatch' | 'missing';
type Comparison = {
  name: { status: Status; card: string | null; account: string };
  birthdate: { status: Status; card: string | null; cardAge: number | null };
  place: { status: Status; card: string | null };
};

const STATUS_UI: Record<Status, { icon: string; cls: string; label: string }> = {
  match: { icon: '✓', cls: 'cmpOk', label: 'Matches' },
  close: { icon: '≈', cls: 'cmpClose', label: 'Close enough' },
  mismatch: { icon: '✕', cls: 'cmpBad', label: 'Different' },
  missing: { icon: '–', cls: 'cmpNone', label: 'Not on card' },
};

function ComparePanel({ c }: { c: Comparison }) {
  const rows = [
    { label: 'Name', value: c.name.card, sub: `Your account: ${c.name.account}`, status: c.name.status },
    {
      label: 'Birthdate',
      value: c.birthdate.card ? `${c.birthdate.card}${c.birthdate.cardAge !== null ? ` · ${c.birthdate.cardAge} yrs old` : ''}` : null,
      sub: '',
      status: c.birthdate.status,
    },
    { label: 'Place', value: c.place.card, sub: 'For reference only', status: c.place.status },
  ];
  return (
    <div className={styles.compare}>
      <div className={styles.compareHead}>What we read from your National ID</div>
      {rows.map((r) => {
        const ui = STATUS_UI[r.status];
        return (
          <div key={r.label} className={styles.compareRow}>
            <span className={`${styles.cmpIcon} ${styles[ui.cls]}`}>{ui.icon}</span>
            <span className={styles.cmpText}>
              <div className={styles.cmpLabel}>{r.label}</div>
              <div className={styles.cmpValue}>{r.value ?? '—'}</div>
              {r.sub && <div className={styles.cmpSub}>{r.sub}</div>}
            </span>
            <span className={`${styles.cmpBadge} ${styles[ui.cls]}`}>{ui.label}</span>
          </div>
        );
      })}
      <p className={styles.hint} style={{ margin: '8px 12px 10px' }}>
        Small typos, missing words and different date formats are accepted.
      </p>
    </div>
  );
}

type Phase = 'intro' | 'front' | 'back' | 'scanning' | 'checking' | 'done' | 'review' | 'failed';

/** Step 4 — read the QR on the back of a PhilID / ePhilID.
 *
 * What the scan proves is limited on purpose: the payload is read and
 * cross-checked against the account, but its PSA signature cannot be verified
 * without PhilSys accreditation, so anything that doesn't line up goes to a
 * person rather than being waved through. The UI says so plainly. */
export function NationalIdStep({ state, refresh, next, back }: StepProps) {
  const alreadyDone = Boolean(state.document && state.document.status !== 'PENDING' && state.document.status !== 'DECLINED');
  const [phase, setPhase] = useState<Phase>(alreadyDone ? 'done' : 'intro');
  const [consent, setConsent] = useState(alreadyDone);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ nameMatch: boolean | null; last4: string | null; comparison: Comparison | null } | null>(
    state.document ? { nameMatch: state.document.nameMatch, last4: state.document.documentNumberLast4, comparison: null } : null
  );

  const [frontBlob, setFrontBlob] = useState<Blob | null>(null);
  const [backBlob, setBackBlob] = useState<Blob | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(state.document?.frontImageUrl ?? null);
  const [backPreview, setBackPreview] = useState<string | null>(state.document?.backImageUrl ?? null);

  async function submitQr(qr: string, backImage: Blob | null) {
    setPhase('checking');
    setError('');
    // Both sides of the card are kept so a person can look at them later if
    // the account is ever reported for fraud.
    const [front, back] = await Promise.all([
      frontBlob ? uploadImage(frontBlob, 'id-front.jpg') : null,
      backBlob ?? backImage ? uploadImage((backBlob ?? backImage)!, 'id-back.jpg') : null,
    ]);
    if (back) setBackPreview(back.url);
    const { ok, data } = await post<{ needsReview: boolean; nameMatch: boolean | null; last4: string | null; comparison: Comparison | null }>(
      '/api/verification/document',
      { qr, consent: true, frontPath: front?.path, backPath: back?.path }
    );
    if (!ok) {
      setError(data.error ?? 'We could not read that ID.');
      setPhase('failed');
      return;
    }
    setResult({ nameMatch: data.nameMatch, last4: data.last4, comparison: data.comparison });
    await refresh();
    setPhase(data.needsReview ? 'review' : 'done');
  }

  async function requestManualReview() {
    setPhase('checking');
    setError('');
    const [front, back] = await Promise.all([
      frontBlob ? uploadImage(frontBlob, 'id-front.jpg') : null,
      backBlob ? uploadImage(backBlob, 'id-back.jpg') : null,
    ]);
    const { ok, data } = await post('/api/verification/document', {
      manualReview: true, consent: true, frontPath: front?.path, backPath: back?.path,
    });
    if (!ok) {
      setError(data.error ?? 'Could not submit for review.');
      setPhase('failed');
      return;
    }
    await refresh();
    setPhase('review');
  }

  return (
    <>
      <h1 className={styles.h1}>Verify your National ID.</h1>
      <p className={styles.lede}>
        Use your Philippine National ID to confirm your identity and help keep the AniTime marketplace safer for farmers
        and buyers.
      </p>

      {phase === 'intro' && (
        <>
          <div className={styles.trust}>
            <span className={styles.trustRow}>
              <ShieldCheckIcon size={17} />
              <span>
                <strong>Identity verification.</strong> Confirms the name on your account is really yours.
              </span>
            </span>
            <span className={styles.trustRow}>
              <LockIcon size={17} />
              <span>
                <strong>Secure process.</strong> The QR is read on your device. We keep only the last 4 digits of your
                card number, plus a photo of the front and back of your ID for accountability if a scam is ever
                reported.
              </span>
            </span>
            <span className={styles.trustRow}>
              <EyeOffIcon size={17} />
              <span>
                <strong>Never shown to other users.</strong> Buyers only see a “Verified” badge, never your ID details.
              </span>
            </span>
          </div>

          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree to AniTime reading my Philippine National ID, and to AniTime keeping photos of its front and back
              (and my selfie in the next step) for identity verification and fraud prevention.
            </span>
          </label>

          {error && (
            <div className={styles.err} style={{ marginTop: 14 }} role="alert">
              <span className={styles.statementIcon}>
                <AlertIcon size={15} />
              </span>
              {error}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={back}>
              ← Back
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.primary} onClick={() => setPhase(!frontBlob ? 'front' : !backBlob ? 'back' : 'scanning')} disabled={!consent}>
              Start National ID scanner
            </button>
          </div>
        </>
      )}

      {phase === 'front' && (
        <>
          <p className={styles.hint} style={{ marginTop: 18 }}>
            <strong>Step 1 of 3 — the FRONT of your ID.</strong> Lay the card flat, fit it inside the frame and make sure
            your photo and name are sharp. Use your back camera if you can.
          </p>
          <CameraCapture
            caption="Fit the FRONT of your National ID inside the frame"
            onCapture={(b) => {
              setFrontBlob(b);
              setFrontPreview(URL.createObjectURL(b));
              setPhase('back');
            }}
            onCancel={() => setPhase('intro')}
          />
        </>
      )}

      {phase === 'back' && (
        <>
          <p className={styles.hint} style={{ marginTop: 18 }}>
            <strong>Step 2 of 3 — the BACK of your ID.</strong> Turn the card over and take a clear photo of the whole
            back, including the QR code.
          </p>
          <CameraCapture
            caption="Fit the BACK of your National ID inside the frame"
            onCapture={(b) => {
              setBackBlob(b);
              setBackPreview(URL.createObjectURL(b));
              setPhase('scanning');
            }}
            onCancel={() => setPhase('intro')}
          />
        </>
      )}

      {phase === 'scanning' && (
        <>
          <p className={styles.hint} style={{ marginTop: 18 }}>
            <strong>Step 3 of 3 — scan the QR code.</strong> Hold the QR on the back of your ID steady inside the frame. If it
            won&apos;t scan, tap <em>Flip image</em> or <em>Switch camera</em>, or send the ID for manual review.
          </p>
          <QrScanner onResult={submitQr} onCancel={() => setPhase('intro')} />
          <button type="button" className={styles.ghost} style={{ marginTop: 6 }} onClick={requestManualReview}>
            Can&apos;t scan it? Send my ID photos to the AniTime admin for review
          </button>
        </>
      )}

      {phase === 'checking' && (
        <div className={styles.info} style={{ marginTop: 22 }} role="status">
          <span className={styles.spinner} />
          Verifying your National ID…
        </div>
      )}

      {phase === 'done' && (
        <>
          <div className={styles.ok} style={{ marginTop: 22 }}>
            <span className={styles.statementIcon}>
              <CheckIcon stroke="#274C1C" />
            </span>
            <span>
              National ID read and matched to your account
              {result?.last4 ? ` — card ending ${result.last4}` : ''}.
            </span>
          </div>
          {result?.comparison && <ComparePanel c={result.comparison} />}
          {(frontPreview || backPreview) && (
            <div className={styles.idThumbs}>
              {frontPreview && (
                <div className={styles.idThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frontPreview} alt="Front of your ID" />
                  <span>Front</span>
                </div>
              )}
              {backPreview && (
                <div className={styles.idThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backPreview} alt="Back of your ID" />
                  <span>Back</span>
                </div>
              )}
            </div>
          )}
          <p className={styles.hint} style={{ marginTop: 10 }}>
            Next you&apos;ll take a quick live selfie so we can match your face to the photo on your ID.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => { setFrontBlob(null); setBackBlob(null); setPhase('front'); }}>
              Retake photos
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.primary} onClick={next}>
              Continue →
            </button>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <div className={styles.warn} style={{ marginTop: 22 }}>
            <span className={styles.statementIcon}>
              <AlertIcon size={15} />
            </span>
            <span>
              <strong>Submitted for review.</strong>{' '}
              {result && result.nameMatch === false
                ? 'The name on your ID does not match your AniTime account, so the AniTime admin has been emailed your ID photos to check.'
                : 'The AniTime admin has been emailed your ID photos and will confirm or reject them. You can continue in the meantime — you get the Verified badge once it is confirmed.'}
            </span>
          </div>
          {result?.comparison && <ComparePanel c={result.comparison} />}
          {(frontPreview || backPreview) && (
            <div className={styles.idThumbs}>
              {frontPreview && (
                <div className={styles.idThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frontPreview} alt="Front of your ID" />
                  <span>Front</span>
                </div>
              )}
              {backPreview && (
                <div className={styles.idThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backPreview} alt="Back of your ID" />
                  <span>Back</span>
                </div>
              )}
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setPhase(!frontBlob ? 'front' : !backBlob ? 'back' : 'scanning')}>
              Try scanning again
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.primary} onClick={next}>
              Continue →
            </button>
          </div>
        </>
      )}

      {phase === 'failed' && (
        <>
          <div className={styles.err} style={{ marginTop: 22 }} role="alert">
            <span className={styles.statementIcon}>
              <AlertIcon size={15} />
            </span>
            <span>
              <strong>Verification couldn&apos;t be completed.</strong> {error} Make sure the QR code on the back of your
              National ID is clear and fully inside the frame.
            </span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setPhase(!frontBlob ? 'front' : !backBlob ? 'back' : 'scanning')}>
              Try again
            </button>
            <button type="button" className={styles.ghost} onClick={requestManualReview}>
              Request manual review
            </button>
            <span className={styles.spacer} />
          </div>
        </>
      )}
    </>
  );
}
