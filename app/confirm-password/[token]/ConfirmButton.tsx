'use client';

import { useState } from 'react';

export function ConfirmButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  async function confirm() {
    setState('busy');
    setError('');
    const res = await fetch('/api/password-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) return setState('done');
    setError(data.error ?? 'Could not reach the server. Try again.');
    setState('idle');
  }

  if (state === 'done') {
    return (
      <>
        <h1 style={{ margin: 0, fontSize: 22 }}>Password changed</h1>
        <p style={{ color: '#4B5C53', fontSize: 14.5, lineHeight: 1.6 }}>Your new password is saved. Sign in again with it.</p>
        <a
          href="/auth"
          style={{ display: 'inline-block', background: '#A7C641', color: '#062F24', fontWeight: 600, padding: '12px 20px', borderRadius: 14, textDecoration: 'none' }}
        >
          Go to sign in
        </a>
      </>
    );
  }
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 22 }}>Confirm your password change</h1>
      <p style={{ color: '#4B5C53', fontSize: 14.5, lineHeight: 1.6 }}>
        Press the button to change your AniTime password to the one you chose. You will be signed out everywhere.
      </p>
      {error && (
        <p style={{ color: '#7B2F18', background: '#F3E3DC', padding: '10px 12px', borderRadius: 12, fontSize: 14 }} role="alert">
          {error}
        </p>
      )}
      <button
        onClick={confirm}
        disabled={state === 'busy'}
        style={{ background: '#A7C641', color: '#062F24', fontWeight: 600, fontSize: 15, padding: '12px 22px', borderRadius: 14, border: 0, cursor: 'pointer' }}
      >
        {state === 'busy' ? 'Saving…' : 'Yes, change my password'}
      </button>
    </>
  );
}
