import type { Store } from '@/lib/stores';
import { CROP_ICONS } from '@/lib/stores';
import styles from './StoreMap.module.css';

export default function StoreCard({ store, onClose }: { store: Store; onClose?: () => void }) {
  return <article className={styles.card} aria-label={store.name}>
    {/* Local photographs retain their original aspect ratio inside a uniform frame. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.photo} src={store.photo} alt={`${store.name} store`} />
    {onClose && <button className={styles.close} type="button" aria-label="Close store details" onClick={onClose}>×</button>}
    <div className={styles.body}>
      <span className={styles.badge}>{CROP_ICONS[store.crop]} Buys {store.crop.toLowerCase()}</span>
      <h2>{store.name}</h2>
      <dl><dt>Location</dt><dd>{store.address}
        <small className={styles.detailNote}>
          <a href={store.addressSource} target="_blank" rel="noopener noreferrer">{store.addressApproximate ? '© OpenStreetMap contributors' : 'Address source'}</a>
        </small>
      </dd>
        <dt>Phone</dt><dd>{store.phone || store.phoneExample || 'Not provided'}
        </dd></dl>
      <button className={styles.action} type="button" disabled>View store</button>
    </div>
  </article>;
}
