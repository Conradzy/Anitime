'use client';

import { useState } from 'react';
import { AlertIcon, EyeOffIcon } from '../icons';
import { post, type StepProps } from '../types';
import styles from '../verification.module.css';

const REGIONS = [
  'National Capital Region (NCR)',
  'Cordillera Administrative Region (CAR)',
  'Region I – Ilocos Region',
  'Region II – Cagayan Valley',
  'Region III – Central Luzon',
  'Region IV-A – CALABARZON',
  'MIMAROPA Region',
  'Region V – Bicol Region',
  'Region VI – Western Visayas',
  'Region VII – Central Visayas',
  'Region VIII – Eastern Visayas',
  'Region IX – Zamboanga Peninsula',
  'Region X – Northern Mindanao',
  'Region XI – Davao Region',
  'Region XII – SOCCSKSARGEN',
  'Region XIII – Caraga',
  'Bangsamoro (BARMM)',
];

type Form = {
  addressLine1: string; addressLine2: string; barangay: string; municipality: string;
  province: string; region: string; postalCode: string; country: string;
};

/** Step 3 — the seller's home address. Deliberately separate from a listing's
 * farm location: buyers see the farm, never this. */
export function AddressStep({ state, refresh, next, back }: StepProps) {
  const a = state.address;
  const [form, setForm] = useState<Form>({
    addressLine1: a?.addressLine1 ?? '',
    addressLine2: a?.addressLine2 ?? '',
    barangay: a?.barangay ?? '',
    municipality: a?.municipality ?? '',
    province: a?.province ?? '',
    region: a?.region ?? '',
    postalCode: a?.postalCode ?? '',
    country: a?.country ?? 'Philippines',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const complete = form.addressLine1 && form.barangay && form.municipality && form.province && form.region;

  async function save() {
    setBusy(true);
    setError('');
    const { ok, data } = await post('/api/verification/address', form);
    setBusy(false);
    if (!ok) {
      setError(data.error ?? 'Could not save your address.');
      return;
    }
    await refresh();
    next();
  }

  return (
    <>
      <h1 className={styles.h1}>Where do you currently live?</h1>
      <p className={styles.lede}>
        Your residential address is kept private and is used for account verification and security purposes.
      </p>

      <div className={styles.fields}>
        <div className={styles.info}>
          <span className={styles.statementIcon}>
            <EyeOffIcon size={15} />
          </span>
          This is your home address, not your farm location. Buyers only ever see the location you set on a listing.
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="a-1">
            House / unit / street
          </label>
          <input id="a-1" className={styles.input} autoComplete="address-line1" value={form.addressLine1} onChange={set('addressLine1')} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="a-2">
            Subdivision / building <span className={styles.optional}>(optional)</span>
          </label>
          <input id="a-2" className={styles.input} autoComplete="address-line2" value={form.addressLine2} onChange={set('addressLine2')} />
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-brgy">
              Barangay
            </label>
            <input id="a-brgy" className={styles.input} value={form.barangay} onChange={set('barangay')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-city">
              Municipality / city
            </label>
            <input id="a-city" className={styles.input} autoComplete="address-level2" value={form.municipality} onChange={set('municipality')} />
          </div>
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-prov">
              Province
            </label>
            <input id="a-prov" className={styles.input} autoComplete="address-level1" value={form.province} onChange={set('province')} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-region">
              Region
            </label>
            <select id="a-region" className={styles.input} value={form.region} onChange={set('region')}>
              <option value="">Select your region</option>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-zip">
              Postal code <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="a-zip"
              className={styles.input}
              inputMode="numeric"
              maxLength={4}
              autoComplete="postal-code"
              value={form.postalCode}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-country">
              Country
            </label>
            <input id="a-country" className={`${styles.input} ${styles.inputLocked}`} value={form.country} readOnly />
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
        <button type="button" className={styles.primary} onClick={save} disabled={busy || !complete}>
          {busy ? <span className={styles.spinner} /> : null}
          Continue →
        </button>
      </div>
    </>
  );
}
