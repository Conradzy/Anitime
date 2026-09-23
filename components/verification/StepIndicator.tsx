'use client';

import { CheckIcon } from './icons';
import styles from './verification.module.css';
import type { ReactNode } from 'react';

export type StepDef = {
  key: string;
  name: string;
  hint: string;
  icon: ReactNode;
  /** Shown but not switched on yet (never blocks progress). */
  soon?: boolean;
};

/**
 * Horizontal stepper that sits above the form and info containers. Each step
 * is an icon node; finished steps turn into a check, the connector to the next
 * step fills as you move on, and the current node pulses gently.
 */
export function Stepper({
  steps,
  current,
  done,
  onJump,
}: {
  steps: StepDef[];
  current: number;
  done: boolean[];
  onJump: (index: number) => void;
}) {
  return (
    <nav className={styles.stepper} aria-label="Verification progress">
      <ol className={styles.stepperList}>
        {steps.map((step, i) => {
          const isDone = done[i];
          const isCurrent = i === current;
          // Finished steps, and anything up to the current one, can be revisited.
          const reachable = isDone || i <= current;
          // The connector after this node is full once we have moved past it.
          const filled = i < current || isDone;
          return (
            <li
              key={step.key}
              className={`${styles.stItem} ${filled ? styles.stItemFilled : ''} ${i === steps.length - 1 ? styles.stItemLast : ''}`}
            >
              <button
                type="button"
                className={styles.stButton}
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${step.name}${isDone ? ' (completed)' : ''}${step.soon ? ' (coming soon)' : ''}`}
              >
                <span
                  className={`${styles.stNode} ${isDone ? styles.stNodeDone : ''} ${isCurrent ? styles.stNodeCurrent : ''}`}
                >
                  {/* keyed so the icon swaps with a small pop when a step completes */}
                  <span key={isDone ? 'done' : 'todo'} className={styles.stIcon}>
                    {isDone ? <CheckIcon size={18} stroke={isCurrent ? '#A7C641' : '#062F24'} /> : step.icon}
                  </span>
                </span>
                <span className={`${styles.stLabel} ${isCurrent ? styles.stLabelActive : ''}`}>{step.name}</span>
                {step.soon && <span className={styles.stSoon}>Coming soon</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
