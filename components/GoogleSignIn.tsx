'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import styles from './GoogleSignIn.module.css';

type GoogleApi = { accounts: { id: {
  initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void;
  renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; width: number }) => void;
} } };
type NextStep = { step: 'link' | 'register'; email: string; name: string; credential: string };

export default function GoogleSignIn({ mode, initialRole, keepSignedIn }: { mode: 'login' | 'register'; initialRole: 'SELLER' | 'BUYER'; keepSignedIn: boolean }) {
  const router = useRouter();
  const button = useRef<HTMLDivElement>(null);
  const buttonFrame = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const nonce = useRef('');
  const handler = useRef<(credential: string) => void>(() => {});
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [next, setNext] = useState<NextStep | null>(null);
  const [retry, setRetry] = useState(0);

  async function authenticate(credential: string, extra: object = {}) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, nonce: nonce.current, keepSignedIn, ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Google sign-in failed. Please try again.');
      if (result.success) { router.replace(result.role === 'BUYER' ? '/seller-home' : '/dashboard'); router.refresh(); }
      else setNext({ step: result.step, email: result.email, name: result.name, credential });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { handler.current = credential => void authenticate(credential); });
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    let resizeObserver: ResizeObserver | undefined;
    async function initialize() {
      try {
        const response = await fetch('/api/auth/google', { cache: 'no-store', signal: controller.signal });
        const config = await response.json();
        if (!response.ok) throw new Error(config.error || 'Google sign-in is unavailable.');
        const google = (window as Window & { google?: GoogleApi }).google;
        if (controller.signal.aborted || !button.current || !google) return;
        nonce.current = config.nonce;
        google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, auto_select: false,
          callback: result => { if (!controller.signal.aborted) handler.current(result.credential); } });
        button.current.replaceChildren();
        let renderedWidth = 0;
        const render = () => {
          if (!button.current || !buttonFrame.current) return;
          const width = Math.min(400, Math.floor(buttonFrame.current.clientWidth));
          if (!width || width === renderedWidth) return;
          renderedWidth = width;
          button.current.replaceChildren();
          google.accounts.id.renderButton(button.current, { type: 'standard', theme: 'outline', size: 'large', text: mode === 'login' ? 'continue_with' : 'signup_with', width });
        };
        render();
        resizeObserver = new ResizeObserver(render);
        if (buttonFrame.current) resizeObserver.observe(buttonFrame.current);
        setReady(true);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load Google sign-in.'); }
    }
    void initialize();
    return () => { controller.abort(); resizeObserver?.disconnect(); };
  }, [loaded, mode, retry]);
  useEffect(() => {
    if (!next) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [next]);

  function restart() { setNext(null); setError(''); setReady(false); setRetry(value => value + 1); }

  return <div className={styles.root}>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setError('Google could not load. Check your connection or use email and password.')} />
    <div ref={buttonFrame} className={`${styles.buttonFrame} ${mode === 'register' ? styles.registerButton : ''} ${busy || !ready ? styles.disabled : ''}`} inert={busy || !ready}>
      {/* Keep the supported Google control visible and directly clickable. */}
      <div ref={button} className={styles.googleControl} />
    </div>
    {!ready && !error && <small>Loading Google sign-in…</small>}
    {busy && <small role="status">Checking your Google account…</small>}
    {error && !next && <div role="alert" className={styles.error}>{error}<button type="button" onClick={restart}>Try again</button></div>}
    {next && createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="google-title" onCancel={event => { if (busy) event.preventDefault(); else setNext(null); }}>
      <form onSubmit={event => {
        event.preventDefault(); event.stopPropagation();
        const data = new FormData(event.currentTarget);
        void authenticate(next.credential, next.step === 'link' ? { password: data.get('password') } : {
          registration: { fullname: data.get('fullname'), businessname: data.get('businessname'), role: data.get('role'), products: data.getAll('products'), agreeTerms: data.get('agreeTerms') === 'on' },
        });
      }}>
        <h2 id="google-title">{next.step === 'link' ? 'Link your AniTime account' : 'Finish creating your account'}</h2>
        <p>{next.email}</p>
        {next.step === 'link' ? <>
          <p>Enter your existing AniTime password once to connect this Google account.</p>
          <label>AniTime password<input autoFocus name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
        </> : <>
          <label>Full name<input autoFocus name="fullname" defaultValue={next.name} autoComplete="name" required maxLength={120} /></label>
          <label>Business name (optional)<input name="businessname" autoComplete="organization" maxLength={160} /></label>
          <label>Account type<select name="role" defaultValue={initialRole}><option value="SELLER">Seller</option><option value="BUYER">Buyer</option></select></label>
          <fieldset><legend>Produce you sell or buy</legend>{['Coconut', 'Pineapple', 'Corn', 'Banana', 'Mango'].map(crop => <label className={styles.check} key={crop}><input type="checkbox" name="products" value={crop} />{crop}</label>)}</fieldset>
          <label className={styles.check}><input name="agreeTerms" type="checkbox" required />I agree to AniTime’s terms and privacy policy.</label>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={restart}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Please wait…' : next.step === 'link' ? 'Link and sign in' : 'Create account'}</button></div>
      </form>
    </dialog>, document.body)}
  </div>;
}
