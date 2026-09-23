'use client';

import { useState } from 'react';
import { AlertIcon, EyeOffIcon } from '../icons';
import { post, type StepProps } from '../types';
import styles from '../verification.module.css';

const today = new Date().toISOString().slice(0, 10);

/** Step 2 — the private details that let a National ID be matched to this
 * account. The birthdate is never shown to buyers. */
export function PersonalStep({ state, refresh, next, back }: StepProps) {
  const [birthdate, setBirthdate] = useState(state.personal.birthdate ?? '');
  const [sex, setSex] = useState(state.personal.sex ?? '');
  const [photoUrl, setPhotoUrl] = useState(state.personal.profilePhotoUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** Uploads the picture, then saves it as the profile picture straight away. */
  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return setError('Please choose a PNG, JPG or WEBP picture.');
    if (file.size > 5 * 1024 * 1024) return setError('That picture is over 5 MB. Please choose a smaller one.');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await fetch('/api/uploads', { method: 'POST', body: form });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upData.error ?? 'Upload failed.');

      const save = await fetch('/api/profile/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: upData.path }),
      });
      const saved = await save.json().catch(() => ({}));
      if (!save.ok) throw new Error(saved.error ?? 'Could not save your picture.');
      setPhotoUrl(saved.url);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setError('');
    const res = await fetch('/api/profile/photo', { method: 'DELETE' });
    if (!res.ok) return setError('Could not remove your picture.');
    setPhotoUrl('');
    await refresh();
  }

  async function save() {
    setBusy(true);
    setError('');
    const { ok, data } = await post('/api/verification/personal', { birthdate, sex });
    setBusy(false);
    if (!ok) {
      setError(data.error ?? 'Could not save your details.');
      return;
    }
    await refresh();
    next();
  }

  return (
    <>
      <h1 className={styles.h1}>Tell us a little about yourself.</h1>
      <p className={styles.lede}>These details help match your verified identity with your AniTime account.</p>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-name">
            Full name
          </label>
          <input id="p-name" className={`${styles.input} ${styles.inputLocked}`} value={state.account.fullname} readOnly />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-dob">
            Date of birth
          </label>
          <input
            id="p-dob"
            className={styles.input}
            type="date"
            max={today}
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-sex">
            Sex
          </label>
          <select id="p-sex" className={styles.input} value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="" disabled>
              Select sex
            </option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        <div className={styles.info}>
          <span className={styles.statementIcon}>
            <EyeOffIcon size={15} />
          </span>
          Your birthdate is private. It is only used for account and identity verification, and is never shown to buyers.
        </div>

        <div className={styles.field}>
          <span className={styles.label}>
            Profile picture <span className={styles.optional}>(optional)</span>
          </span>
          <div
            className={`${styles.photoDrop} ${dragOver ? styles.photoDropOver : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              uploadPhoto(e.dataTransfer.files?.[0]);
            }}
          >
            <span className={styles.photoAvatar}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="Your profile picture" />
              ) : (
                <span>{state.account.fullname.slice(0, 1).toUpperCase()}</span>
              )}
              {uploading && <span className={styles.photoBusy} aria-label="Uploading" />}
            </span>
            <div className={styles.photoText}>
              <div className={styles.photoTitle}>{photoUrl ? 'Looking good!' : 'Add a profile picture'}</div>
              <div className={styles.hint}>
                Drag a picture here, or choose one. It appears next to your name in chats and on deliveries. PNG, JPG or
                WEBP, up to 5 MB.
              </div>
              <div className={styles.photoBtns}>
                <label className={styles.secondary} style={{ cursor: uploading ? 'wait' : 'pointer', height: 38 }}>
                  {uploading ? 'Uploading…' : photoUrl ? 'Change picture' : 'Upload picture'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={uploading}
                    onChange={(e) => {
                      uploadPhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {photoUrl && (
                  <button type="button" className={styles.ghost} onClick={removePhoto} disabled={uploading}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
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
        <button type="button" className={styles.primary} onClick={save} disabled={busy || uploading || !birthdate || !sex}>
          {busy ? <span className={styles.spinner} /> : null}
          Continue →
        </button>
      </div>
    </>
  );
}
