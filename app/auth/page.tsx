'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import bg from './seigaiha.module.css';

/* ---------------------------------------------------------------------
 * AniTime Auth — login / register / email-verify / loading / done.
 *
 * In the original Claude Design export these five "screens" are all one
 * component switching on internal state (sc-if isLogin / isRegister /
 * isVerify / isLoading / isDone). Verify and Loading are full-screen
 * modal overlays that sit on top of whichever base screen (login or
 * register) was showing when they were opened; Done is its own base
 * screen. That's reproduced here with plain useState instead of the
 * dc-runtime class component.
 * ------------------------------------------------------------------- */

const CROPS = ['Coconut', 'Pineapple', 'Corn', 'Banana', 'Mango'] as const;

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.4 6.6C2.3 7.8 1.8 10 1.8 10S4.9 15.2 10 15.2c1.5 0 2.8-.4 3.9-1" />
      <path d="M7.1 5.3C7.98 5 8.94 4.8 10 4.8c5.1 0 8.2 5.2 8.2 5.2s-.8 1.4-2.3 2.8" />
      <path d="M8.2 8.2a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M3 3l14 14" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7C13.42 14.62 18.27 10.75 24 10.75z" />
    </svg>
  );
}

function PasswordField({
  value,
  pw,
  onTogglePw,
  placeholder,
  autoComplete,
}: {
  value?: string;
  pw: boolean;
  onTogglePw: () => void;
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <span className={styles.fieldWrap}>
      <span aria-hidden="true" className={styles.fieldIcon}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.6" y="8.6" width="12.8" height="8.8" rx="2.4" />
          <path d="M6.8 8.6V6.6a3.2 3.2 0 0 1 6.4 0v2" />
          <path d="M10 12v2.2" />
        </svg>
      </span>
      <input
        type={pw ? 'text' : 'password'}
        name="password"
        defaultValue={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`auth-field ${styles.inputBasePw}`}
      />
      <button
        type="button"
        onClick={onTogglePw}
        aria-label="Toggle password visibility"
        className={styles.eyeToggleBtn}
      >
        <EyeIcon hidden={!pw} />
      </button>
    </span>
  );
}

type Role = 'SELLER' | 'BUYER';

/** Seller / Buyer switch shown at the top of both the login and the register
 * form. It decides which kind of account is being logged into or created. */
function RoleTabs({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className={styles.roleTabs} role="tablist" aria-label="Account type">
      {(['SELLER', 'BUYER'] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={role === r}
          onClick={() => onChange(r)}
          className={`${styles.roleTab} ${role === r ? styles.roleTabActive : ''}`}
        >
          {r === 'SELLER' ? 'Seller' : 'Buyer'}
        </button>
      ))}
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('SELLER');
  const isBuyer = role === 'BUYER';
  const homePath = (r: Role) => (r === 'BUYER' ? '/seller-home' : '/dashboard');

  const [screen, setScreen] = useState<'login' | 'register' | 'done'>('login');
  // the account type only matters while registering; logging in reads it from the database
  const showBuyer = isBuyer && screen === 'register';
  const [modal, setModal] = useState<'verify' | 'loading' | null>(null);
  const [email, setEmail] = useState('');
  const [pwLogin, setPwLogin] = useState(false);
  const [pwRegister, setPwRegister] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [left, setLeft] = useState(42);
  const [produce, setProduce] = useState<string[]>([]);
  const [produceOpen, setProduceOpen] = useState(false);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const produceFieldRef = useRef<HTMLDivElement>(null);
  const codeFormRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (produceFieldRef.current && produceFieldRef.current.contains(t)) return;
      setProduceOpen(false);
    };
    document.addEventListener('click', onDocClick);
    const tick = setInterval(() => {
      setLeft((l) => (l > 0 ? l - 1 : l));
    }, 1000);
    return () => {
      document.removeEventListener('click', onDocClick);
      clearInterval(tick);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // Deep-link support: the Landing page's "Login" and "Register as Seller"
  // navbar buttons link here as /auth and /auth?screen=register so the
  // right tab is already showing when the visitor lands.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('screen') === 'register') setScreen('register');
    if (params.get('role') === 'buyer') setRole('BUYER');
  }, []);

  function switchRole(r: Role) {
    setRole(r);
    setLoginError(null);
    setRegisterError(null);
    setTermsError(false);
  }

  function openVerify() {
    setScreen((s) => (s === 'done' ? 'login' : s));
    setModal('verify');
    setVerifyError(null);
    setLeft(42);
    setTimeout(() => {
      const f = document.querySelector<HTMLInputElement>('[data-code="0"]');
      if (f) f.focus();
    }, 120);
  }

  function go(name: 'login' | 'register', e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    setScreen(name);
    setModal(null);
    setVerifyError(null);
    setLoginError(null);
    setRegisterError(null);
  }

  function goBack(e?: React.SyntheticEvent) {
    if (e) e.preventDefault();
    setModal(null);
    setVerifyError(null);
  }

  function codeInputs(): HTMLInputElement[] {
    return Array.from(codeFormRef.current?.querySelectorAll<HTMLInputElement>('[data-code]') || []);
  }

  function onCodeInput(e: React.FormEvent<HTMLDivElement>) {
    const t = e.target as HTMLInputElement;
    if (!t.hasAttribute || !t.hasAttribute('data-code')) return;
    t.value = t.value.replace(/[^0-9]/g, '').slice(0, 1);
    if (verifyError) setVerifyError(null);
    if (!t.value) return;
    const all = codeInputs();
    const i = all.indexOf(t);
    if (i > -1 && i < all.length - 1) all[i + 1].focus();
  }

  function onCodeKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLInputElement;
    if (!t.hasAttribute || !t.hasAttribute('data-code')) return;
    const all = codeInputs();
    const i = all.indexOf(t);
    if (e.key === 'Backspace' && !t.value && i > 0) {
      e.preventDefault();
      all[i - 1].focus();
      all[i - 1].value = '';
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      all[i - 1].focus();
    }
    if (e.key === 'ArrowRight' && i < all.length - 1) {
      e.preventDefault();
      all[i + 1].focus();
    }
  }

  function onCodePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const txt = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const all = codeInputs();
    all.forEach((n, k) => {
      n.value = txt[k] || '';
    });
    const next = all[Math.min(all.length - 1, txt.length)];
    if (next) next.focus();
  }

  async function onVerifySubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const all = codeInputs();
    const code = all.map((n) => n.value).join('');
    if (code.length !== 6) {
      setVerifyError('Enter all 6 digits.');
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVerifyError(json.error || "That code doesn't match. Check the latest email and try again.");
        return;
      }
      setModal('loading');
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setScreen('done');
        setModal(null);
      }, 1200);
    } catch {
      setVerifyError('Network error — please check your connection and try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVerifyError(json.error || 'Could not resend the code.');
        if (typeof json.secondsLeft === 'number') setLeft(json.secondsLeft);
        return;
      }
      setLeft(42);
      setVerifyError(null);
    } catch {
      setVerifyError('Network error — please check your connection and try again.');
    } finally {
      setIsResending(false);
    }
  }

  async function handleRegisterSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegisterError(null);

    if (!agreeTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);

    if (produce.length === 0) {
      setRegisterError(isBuyer ? 'Select at least one produce you buy.' : 'Select at least one produce type.');
      return;
    }

    const data = new FormData(e.currentTarget);
    const fullname = String(data.get('name') || '').trim();
    const businessname = String(data.get('farm') || '').trim();
    const password = String(data.get('password') || '');

    if (!fullname) {
      setRegisterError('Enter your full name.');
      return;
    }
    if (!email.trim()) {
      setRegisterError('Enter your email address.');
      return;
    }
    if (password.length < 8) {
      setRegisterError('Password must be at least 8 characters.');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname,
          businessname,
          product: produce.join(', '),
          email,
          password,
          role,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRegisterError(json.error || 'Something went wrong. Please try again.');
        return;
      }
      openVerify();
    } catch {
      setRegisterError('Network error — please check your connection and try again.');
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleLoginSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError(null);

    const data = new FormData(e.currentTarget);
    const password = String(data.get('password') || '');

    if (!email.trim() || !password) {
      setLoginError('Enter your email and password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, keepSignedIn }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'NOT_VERIFIED') {
          // Valid password, just never finished verifying — send a fresh
          // code and reuse the same verify modal instead of dead-ending.
          void fetch('/api/auth/resend-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          openVerify();
          return;
        }
        setLoginError(json.error || 'Invalid email or password.');
        return;
      }
      // replace, so Back from the dashboard doesn't return to the login form
      // (the account type comes back from the server: sellers -> dashboard, buyers -> market)
      router.replace(homePath(json.role));
    } catch {
      setLoginError('Network error — please check your connection and try again.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  const emailShown = email.trim() || 'your registered Gmail address';
  const resendLabel = left > 0 ? 'Resend in 0:' + String(left).padStart(2, '0') : 'Resend code';
  const produceLabel = produce.length === 0 ? (isBuyer ? 'Select the produce you buy' : 'Select your produce') : produce.length === 1 ? produce[0] : produce.length + ' produce types selected';

  function toggleCrop(name: string) {
    setProduce((p) => (p.indexOf(name) > -1 ? p.filter((x) => x !== name) : p.concat([name])));
  }
  function removeCrop(name: string) {
    setProduce((p) => p.filter((x) => x !== name));
  }

  return (
    <>
      <main className={styles.authMain}>
        <section className={styles.formSide}>
          <div className={styles.topRow}>
            <Link href="/" className={styles.backLink}>
              ← Back to home
            </Link>
            {/* the brand lives in the right-hand panel on wide screens; this
                copy only shows when that panel is hidden (phones, tablets) */}
            <Link href="/" className={styles.mobileBrand}>
              <span className={styles.brandIcon}>
                <Image src="/brand/logo-128.png" alt="AniTime logo" width={28} height={28} className={styles.brandImg} />
              </span>
              <span className={styles.mobileBrandText}>AniTime</span>
            </Link>
          </div>

        <div className={styles.screenWrap}>
          {screen === 'login' && (
            <div className={styles.screenCard}>
              <div className={styles.authPanel}>
                <div className={styles.panelKicker}>
                  <span className={styles.kickerDash} />
                  <span className={styles.kickerLabel}>Trader account</span>
                </div>
                <h1 className={styles.screenTitle}>Welcome back</h1>
                <p className={styles.screenSubtitle}>
                  Log in to manage your listings and offers, or to browse produce and track your orders.
                </p>

                <form
                  onSubmit={handleLoginSubmit}
                  className={styles.formCol}
                >
                  <label className={styles.fieldLabel}>
                    <span className={styles.fieldCaption}>Email address</span>
                    <span className={styles.fieldWrap}>
                      <span aria-hidden="true" className={styles.fieldIcon}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2.2" y="4.2" width="15.6" height="11.6" rx="2.6" />
                          <path d="M3.2 5.6 10 10.8l6.8-5.2" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        name="email"
                        value={email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        autoComplete="email"
                        className={`auth-field ${styles.inputBase}`}
                      />
                    </span>
                  </label>

                  <label className={styles.fieldLabel}>
                    <span className={styles.spaceBetweenRow}>
                      <span className={styles.fieldCaptionAlt}>Password</span>
                      <a href="#" className={styles.forgotLink}>
                        Forgot password?
                      </a>
                    </span>
                    <PasswordField pw={pwLogin} onTogglePw={() => setPwLogin((p) => !p)} placeholder="••••••••" autoComplete="current-password" />
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(e) => setKeepSignedIn(e.target.checked)}
                      className={styles.checkboxInput}
                    />
                    <span className={styles.checkboxText}>Keep me signed in on this device</span>
                  </label>

                  {loginError && <p className={styles.inlineError}>{loginError}</p>}

                  <div className={styles.dividerRow}>
                    <span className={styles.dividerLine} />
                    <span className={styles.dividerText}>or</span>
                    <span className={styles.dividerLine} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setLoginError('Google sign-in is not set up yet — please use the form above.')}
                    className={styles.googleBtn}
                  >
                    <GoogleG /> Continue with Google
                  </button>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className={styles.primarySubmitBtn}
                  >
                    {isLoggingIn ? 'Logging in…' : 'Log in'} {!isLoggingIn && <span>→</span>}
                  </button>
                </form>

                <p className={styles.footerText}>
                  Not trading with us yet?{' '}
                  <a href="#" onClick={(e: React.MouseEvent) => go('register', e)} className={styles.footerLink}>
                    Register as a trader
                  </a>
                </p>
              </div>
              <p className={styles.belowPanelText}>
                Protected by AniTime verification. We only email you about your listings, offers and orders.
              </p>
            </div>
          )}

          {screen === 'register' && (
            <div className={styles.screenCardWide}>
              <div className={styles.authPanel}>
                <RoleTabs role={role} onChange={switchRole} />
                <div className={styles.panelKicker}>
                  <span className={styles.kickerDash} />
                  <span className={styles.kickerLabel}>Register as a trader</span>
                </div>
                <h1 className={styles.screenTitle}>{isBuyer ? 'Buy direct from farmers' : 'Sell your produce'}</h1>
                <p className={styles.screenSubtitle}>
                  {isBuyer
                    ? 'Create a buyer account to find produce, make offers and arrange pickup or delivery.'
                    : 'Create a seller account to list harvests, set your own prices and receive bulk inquiries.'}
                </p>

                <form
                  onSubmit={handleRegisterSubmit}
                  className={styles.formCol}
                >
                  <div className={styles.nameGrid}>
                    <label className={styles.fieldLabel}>
                      <span className={styles.fieldCaptionAlt}>Full name</span>
                      <span className={styles.fieldWrap}>
                        <span aria-hidden="true" className={styles.fieldIcon}>
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="10" cy="7" r="3.1" />
                            <path d="M4.2 16.4c.7-2.7 3-4.2 5.8-4.2s5.1 1.5 5.8 4.2" />
                          </svg>
                        </span>
                        <input type="text" name="name" placeholder="Maria Santos" className={`auth-field ${styles.inputBase}`} />
                      </span>
                    </label>
                    <label className={styles.fieldLabel}>
                      <span className={styles.fieldCaptionAlt}>
                        {isBuyer ? 'Business or trading name (optional)' : 'Farm or business name'}
                      </span>
                      <span className={styles.fieldWrap}>
                        <span aria-hidden="true" className={styles.fieldIcon}>
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.8 8.8 10 3.6l7.2 5.2" />
                            <path d="M4.6 9.9v6.5h10.8V9.9" />
                            <path d="M8.2 16.4v-3.6h3.6v3.6" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          name="farm"
                          placeholder={isBuyer ? 'Reyes Trading' : 'Santos Family Farm'}
                          className={`auth-field ${styles.inputBase}`}
                        />
                      </span>
                    </label>
                  </div>

                  <div ref={produceFieldRef} data-produce-field="" className={styles.fieldLabel}>
                    <span className={styles.spaceBetweenRow}>
                      <span className={styles.fieldCaptionAlt}>{isBuyer ? 'Produce you buy' : 'Produce you focus on'}</span>
                      <span className={styles.produceHint}>Pick one or more</span>
                    </span>
                    <div className={styles.relativeBox}>
                      <div
                        onClick={() => setProduceOpen((o) => !o)}
                        role="button"
                        tabIndex={0}
                        className={styles.produceTrigger}
                      >
                        <span aria-hidden="true" className={styles.fieldIcon}>
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 17.4V9.2" />
                            <path d="M10 9.6C10 6 12.4 3.4 17 3.4c0 4.6-2.4 7.2-6.2 7.2" />
                            <path d="M10 12.2C10 9.8 8.1 7.9 4.5 7.9c0 3.1 1.9 4.8 4.8 4.8" />
                          </svg>
                        </span>
                        <span className={styles.produceLabelText}>{produceLabel}</span>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.chevronIcon}>
                          <path d="M5.5 8 10 12.5 14.5 8" />
                        </svg>
                      </div>

                      {produceOpen && (
                        <div className={styles.produceDropdown}>
                          {CROPS.map((name) => {
                            const on = produce.indexOf(name) > -1;
                            return (
                              <div
                                key={name}
                                onClick={() => toggleCrop(name)}
                                className={styles.cropOption}
                              >
                                <span
                                  className={styles.cropCheckbox}
                                  style={{ '--cb-border': on ? '#A7C641' : 'rgba(6,47,36,.22)', '--cb-bg': on ? '#A7C641' : '#FFFFFF' } as React.CSSProperties}
                                >
                                  {on && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#062F24" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M5 12.6l4.6 4.6L19 6.8" />
                                    </svg>
                                  )}
                                </span>
                                <span className={styles.cropOptionText}>{name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {produce.length > 0 && (
                      <div className={styles.chipsWrap}>
                        {produce.map((name) => (
                          <span
                            key={name}
                            className={styles.produceChip}
                          >
                            {name}
                            <button
                              type="button"
                              onClick={() => removeCrop(name)}
                              aria-label="Remove"
                              className={styles.chipRemoveBtn}
                            >
                              <svg width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="2.4" strokeLinecap="round" className={styles.chipRemoveIcon}>
                                <path d="M5 5l10 10" />
                                <path d="M15 5L5 15" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className={styles.fieldLabel}>
                    <span className={styles.fieldCaptionAlt}>Email address</span>
                    <span className={styles.fieldWrap}>
                      <span aria-hidden="true" className={styles.fieldIcon}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2.2" y="4.2" width="15.6" height="11.6" rx="2.6" />
                          <path d="M3.2 5.6 10 10.8l6.8-5.2" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        name="email"
                        value={email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        placeholder={isBuyer ? 'you@company.ph' : 'you@farm.ph'}
                        autoComplete="email"
                        className={`auth-field ${styles.inputBase}`}
                      />
                    </span>
                  </label>

                  <label className={styles.fieldLabel}>
                    <span className={styles.fieldCaptionAlt}>Password</span>
                    <PasswordField pw={pwRegister} onTogglePw={() => setPwRegister((p) => !p)} placeholder="At least 8 characters" autoComplete="new-password" />
                  </label>

                  <label className={styles.checkboxLabelStart}>
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked);
                        if (e.target.checked) setTermsError(false);
                      }}
                      className={styles.checkboxInputTop}
                    />
                    <span className={styles.termsText}>
                      I agree to the{' '}
                      <a href="#" className={styles.termsLink}>
                        {isBuyer ? 'Buyer Terms' : 'Seller Terms'}
                      </a>{' '}
                      and confirm my {isBuyer ? 'details are' : 'farm details are'} accurate.
                    </span>
                  </label>
                  {termsError && (
                    <p className={styles.inlineError}>
                      You must agree to the {isBuyer ? 'Buyer' : 'Seller'} Terms to create an account.
                    </p>
                  )}

                  {registerError && <p className={styles.inlineError}>{registerError}</p>}

                  <div className={styles.dividerRow}>
                    <span className={styles.dividerLine} />
                    <span className={styles.dividerText}>or</span>
                    <span className={styles.dividerLine} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setRegisterError('Google sign-in is not set up yet — please use the form above.')}
                    className={styles.googleBtn}
                  >
                    <GoogleG /> Sign up with Google
                  </button>

                  <button
                    type="submit"
                    disabled={isRegistering}
                    className={styles.primarySubmitBtnReg}
                  >
                    {isRegistering ? 'Creating account…' : isBuyer ? 'Create buyer account' : 'Create seller account'} {!isRegistering && <span>→</span>}
                  </button>
                </form>

                <p className={styles.footerText}>
                  Already have an account?{' '}
                  <a href="#" onClick={(e: React.MouseEvent) => go('login', e)} className={styles.footerLink}>
                    Log in
                  </a>
                </p>
              </div>
              <p className={styles.belowPanelText}>
                {isBuyer
                  ? 'Every buyer is verified by email before making offers.'
                  : 'Every seller is verified by email before listings go live.'}
              </p>
            </div>
          )}

          {screen === 'done' && (
            <div className={styles.screenCard}>
              <div className={styles.donePanel}>
                <span className={styles.doneIcon}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#062F24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 12.6l4.6 4.6L19.5 6.8" />
                  </svg>
                </span>
                <h1 className={styles.doneTitle}>You&apos;re verified</h1>
                <p className={styles.doneSubtitle}>
                  Your account is ready. Let&apos;s get you started.
                </p>
                <button
                  type="button"
                  onClick={() => router.replace('/dashboard')}
                  className={styles.dashboardBtn}
                >
                  Continue <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>

          <p className={styles.sideFooter}>© 2026 AniTime · Farm-to-buyer marketplace</p>
        </section>

        <aside className={styles.showcase} aria-hidden="true">
          <div className={bg.seigaiha}>
            <i />
          </div>

          <div className={styles.showcaseInner}>
            <span className={styles.showBrand}>
              <span className={styles.showBrandTile}>
                <Image src="/brand/logo-128.png" alt="" width={34} height={34} className={styles.brandImg} />
              </span>
              <span className={styles.showBrandText}>AniTime</span>
            </span>

            <span className={styles.showKicker}>
              <span className={styles.showKickerDot} /> Farm-to-buyer marketplace
            </span>
            <h2 className={styles.showTitle}>
              {showBuyer ? 'Buy fresh harvests direct from Philippine farmers.' : 'Sell your harvest to buyers across the Philippines.'}
            </h2>
            <p className={styles.showText}>
              {showBuyer
                ? 'Find produce, negotiate offers and track deliveries — all from one buyer account.'
                : 'List your produce, negotiate offers and track deliveries — all from one verified seller account.'}
            </p>

            <div className={styles.coverStage}>
              <div className={styles.coverFloat}>
                <Image
                  src="/brand/auth-cover-hd.png"
                  alt=""
                  width={3280}
                  height={1816}
                  priority
                  sizes="(max-width: 900px) 0px, 60vw"
                  className={styles.coverImg}
                />
              </div>
            </div>
          </div>
        </aside>
      </main>

      {modal === 'verify' && (
        <div className={styles.modalVeil}>
          <div className={styles.modalScroll}>
            <div className={styles.modalPanel}>
              <button
                type="button"
                onClick={() => goBack()}
                aria-label="Close"
                className={styles.modalCloseBtn}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M5 5l10 10" />
                  <path d="M15 5L5 15" />
                </svg>
              </button>
              <div className={styles.modalHeadRow}>
                <span className={styles.modalHeadIcon}>
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.2" y="4.2" width="15.6" height="11.6" rx="2.6" />
                    <path d="M3.2 5.6 10 10.8l6.8-5.2" />
                  </svg>
                </span>
                <div>
                  <div className={styles.kickerLabel}>Step 2 of 2</div>
                  <h1 className={styles.modalTitle}>Confirm your email</h1>
                </div>
              </div>
              <p className={styles.modalBody}>
                We sent a 6-digit confirmation code to <strong className={styles.modalEmailStrong}>{emailShown}</strong>. Enter it below to finish setting up your account.
              </p>

              <form ref={codeFormRef} onSubmit={onVerifySubmit}>
                <div
                  onInput={onCodeInput}
                  onKeyDown={onCodeKey}
                  onPaste={onCodePaste}
                  className={styles.codeGrid}
                >
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <input
                      key={i}
                      data-code={String(i)}
                      inputMode="numeric"
                      maxLength={1}
                      aria-label={`Digit ${i + 1}`}
                      className={`auth-code ${styles.codeInput}`}
                    />
                  ))}
                </div>

                {verifyError && (
                  <p className={styles.errorMsg}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#B4462F" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="10" cy="10" r="7.4" />
                      <path d="M10 6.4v4.4" />
                      <path d="M10 13.4v.4" />
                    </svg>
                    {verifyError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isVerifying}
                  className={styles.verifySubmitBtn}
                >
                  {isVerifying ? 'Verifying…' : 'Verify and continue'} {!isVerifying && <span>→</span>}
                </button>
              </form>

              <div className={styles.modalFootRow}>
                <span className={styles.resendLabelText}>Didn&apos;t get the code?</span>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={left > 0 || isResending}
                  className={styles.resendBtn}
                >
                  {isResending ? 'Sending…' : resendLabel}
                </button>
              </div>
            </div>
            <p className={styles.modalBelowText}>
              Wrong address?{' '}
              <a href="#" onClick={(e) => goBack(e)} className={styles.changeEmailLink}>
                Change your email
              </a>{' '}
              and we&apos;ll send a new code.
            </p>
          </div>
        </div>
      )}

      {modal === 'loading' && (
        <div className={styles.loadingVeil}>
          <div className={styles.loadingPanel}>
            <span aria-hidden="true" className={styles.spinner} />
            <h2 className={styles.loadingTitle}>Code confirmed</h2>
            <p className={styles.loadingSubtitle}>
              Setting up your account — taking you in.
            </p>
            <div className={styles.progressTrack}>
              <span className={styles.progressFill} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
