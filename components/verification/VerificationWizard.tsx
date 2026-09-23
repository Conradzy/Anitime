'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Stepper, type StepDef } from './StepIndicator';
import { CalendarIcon, HouseIcon, ScanFaceIcon, ScanLineIcon, ShieldCheckIcon, SmartphoneIcon } from './icons';
import { StepAside } from './StepAside';
import { SuccessScreen } from './SuccessScreen';
import { AccountStep } from './steps/AccountStep';
import { PersonalStep } from './steps/PersonalStep';
import { AddressStep } from './steps/AddressStep';
import { NationalIdStep } from './steps/NationalIdStep';
import { LiveStep } from './steps/LiveStep';
import { ReviewStep } from './steps/ReviewStep';
import type { StepProps, WizardState } from './types';
import styles from './verification.module.css';

const STEPS: StepDef[] = [
  { key: 'account', name: 'Account & Contact', hint: 'Verify your phone and email', icon: <SmartphoneIcon /> },
  { key: 'personal', name: 'Personal Information', hint: 'Tell us about yourself', icon: <CalendarIcon /> },
  { key: 'address', name: 'Residential Address', hint: 'Where do you currently live?', icon: <HouseIcon /> },
  { key: 'document', name: 'National ID Verification', hint: 'Photo + QR of your PhilID', icon: <ScanLineIcon /> },
  { key: 'live', name: 'Live Identity Verification', hint: "Confirm it's really you", icon: <ScanFaceIcon /> },
  { key: 'review', name: 'Review & Complete', hint: 'Check your information', icon: <ShieldCheckIcon /> },
];

/** Steps that must be finished before "Complete verification". */
const REQUIRED = STEPS.map((s) => !s.soon);

const STEP_COMPONENTS: Record<string, (p: StepProps) => React.ReactNode> = {
  account: AccountStep,
  personal: PersonalStep,
  address: AddressStep,
  document: NationalIdStep,
  live: LiveStep,
  review: ReviewStep,
};

function doneFlags(state: WizardState): boolean[] {
  // Order matches STEPS.
  return [state.done.account, state.done.personal, state.done.address, state.done.document, state.done.live, state.identityVerified];
}

export function VerificationWizard() {
  const [state, setState] = useState<WizardState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [mini, setMini] = useState(false);

  const refresh = useCallback(async (): Promise<WizardState | null> => {
    try {
      const res = await fetch('/api/verification/status', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.replace('/auth');
        return null;
      }
      if (!res.ok) throw new Error('Could not load your verification details.');
      const data = (await res.json()) as WizardState;
      setState(data);
      return data;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your verification details.');
      return null;
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so the first render doesn't set state synchronously.
    const t = setTimeout(async () => {
      const data = await refresh();
      if (!data) return;
      // Open on the first thing still outstanding rather than always step 1.
      const flags = doneFlags(data);
      const first = flags.findIndex((d, i) => REQUIRED[i] && !d);
      setIndex(first === -1 ? STEPS.length - 1 : first);
      setStarted(true);
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  if (loadError) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.card} style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 className={styles.h1} style={{ fontSize: 20 }}>
            Something went wrong
          </h1>
          <p className={styles.lede}>{loadError}</p>
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
              Try again
            </button>
            <span className={styles.spacer} />
          </div>
        </div>
      </div>
    );
  }

  if (!state || !started) {
    return (
      <div className={styles.loadingPage} role="status">
        Loading your verification…
      </div>
    );
  }

  if (state.identityVerified) return <SuccessScreen />;

  const flags = doneFlags(state);
  const Step = STEP_COMPONENTS[STEPS[index].key];
  const stepProps: StepProps = {
    state,
    refresh,
    next: () => setIndex((i) => Math.min(i + 1, STEPS.length - 1)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    goTo: (key) => {
      const i = STEPS.findIndex((s) => s.key === key);
      if (i >= 0) setIndex(i);
    },
  };

  return (
    <div className={styles.appShell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="home" mini={mini} onToggle={() => setMini((m) => !m)} />

      <main className={styles.main}>
        <Stepper steps={STEPS} current={index} done={flags} onJump={setIndex} />

        <div className={styles.layout}>
          {/* form container — keyed so each step animates in */}
          <section className={styles.card} key={STEPS[index].key}>
            <Step {...stepProps} />
          </section>

          {/* information containers, side by side with the form */}
          <StepAside stepKey={STEPS[index].key} />
        </div>
      </main>
    </div>
  );
}
