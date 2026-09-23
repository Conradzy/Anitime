'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, AlertIcon, LockIcon } from '../icons';
import { OtpInput } from '../OtpInput';
import { PhoneField, isValidNational, toNational } from '../PhoneField';
import { post, type StepProps } from '../types';
import styles from '../verification.module.css';

/** Step 1 — confirm who the account belongs to and prove the mobile number
 * by texting a code to it. */
export function AccountStep({ state, refresh, next }: StepProps) {
  const verified = state.account.phoneVerified;
  // Just the 10 digits after +63; the prefix is shown in the field itself.
  const [phone, setPhone] = useState(toNational(state.account.phone ?? ''));
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setBusy('send');
    setError('');
    setNotice('');
    const { ok, data } = await post<{ delivered: boolean; cooldownMs: number }>('/api/auth/send-otp', { phone: '+63' + phone });
    setBusy(null);
    if (!ok) {
      setError(data.error ?? 'Could not send the code.');
      return;
    }
    setCodeSent(true);
    setCooldown(Math.ceil((data.cooldownMs ?? 42000) / 1000));
    setNotice(
      data.delivered
        ? 'We sent a 6-digit code to your phone. It expires in 10 minutes.'
        : 'SMS is not configured yet, so the code was printed in your dev terminal instead of being texted.'
    );
  }

  async function verifyCode() {
    setBusy('verify');
    setError('');
    const { ok, data } = await post('/api/auth/verify-otp', { code });
    setBusy(null);
    if (!ok) {
      setError(data.error ?? 'That code did not work.');
      return;
    }
    setCode('');
    setCodeSent(false);
    setChanging(false);
    await refresh();
  }

  const phoneLooksValid = isValidNational(phone);
  const showForm = !verified || changing;

  return (
    <>
      <h1 className={styles.h1}>Let&apos;s secure your account.</h1>
      <p className={styles.lede}>
        We&apos;ll verify your contact details first so AniTime can protect your account and send you important
        notifications about your listings and deliveries.
      </p>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="v-fullname">
            Full name
          </label>
          <input id="v-fullname" className={`${styles.input} ${styles.inputLocked}`} value={state.account.fullname} readOnly />
          <span className={styles.hint}>This is the name on your AniTime account and must match your National ID.</span>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="v-email">
            Email address
          </label>
          <input id="v-email" className={`${styles.input} ${styles.inputLocked}`} value={state.account.email} readOnly />
        </div>

        {verified && !changing && (
          <>
            <div className={styles.ok}>
              <span className={styles.statementIcon}>
                <CheckIcon stroke="#274C1C" />
              </span>
              Mobile number verified — {state.account.phoneMasked}
            </div>
            <button type="button" className={styles.ghost} style={{ alignSelf: 'flex-start' }} onClick={() => setChanging(true)}>
              Use a different number
            </button>
          </>
        )}

        {showForm && (
          <>
            <PhoneField
              id="v-phone"
              value={phone}
              onChange={setPhone}
              onEnter={sendCode}
              disabled={busy !== null}
              action={
                <button
                  type="button"
                  className={`${styles.primary} ${styles.inlineBtn}`}
                  onClick={sendCode}
                  disabled={busy !== null || !phoneLooksValid || cooldown > 0}
                >
                  {busy === 'send' ? <span className={styles.spinner} /> : null}
                  {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? 'Resend code' : 'Send code'}
                </button>
              }
            />

            <div className={styles.field}>
              <span className={styles.label} id="v-code-label">
                Enter verification code
              </span>
              <div className={styles.inlineRow} style={{ alignItems: 'center' }}>
                <OtpInput value={code} onChange={setCode} onComplete={verifyCode} disabled={busy !== null || !codeSent} autoFocus={codeSent} />
                <button
                  type="button"
                  className={`${styles.primary} ${styles.inlineBtn}`}
                  onClick={verifyCode}
                  disabled={busy !== null || code.length !== 6 || !codeSent}
                >
                  {busy === 'verify' ? <span className={styles.spinner} /> : null}
                  Verify number
                </button>
              </div>
              {!codeSent && <span className={styles.hint}>Tap “Send code” and we’ll text you a 6-digit code.</span>}
            </div>

            {notice && (
              <div className={styles.info}>
                <span className={styles.statementIcon}>
                  <LockIcon size={15} />
                </span>
                {notice}
              </div>
            )}
          </>
        )}

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
        <span className={styles.spacer} />
        <button type="button" className={styles.primary} onClick={next} disabled={!verified}>
          Continue →
        </button>
      </div>
    </>
  );
}
