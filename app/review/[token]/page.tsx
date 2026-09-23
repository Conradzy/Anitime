import { findReview } from '@/lib/id-review-decision';
import { photoUrl } from '@/lib/storage';
import { ReviewActions } from './ReviewActions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ID review · AniTime', robots: { index: false, follow: false } };

const yn = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : 'Not checked');

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await findReview(token);

  if (!check) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.h1}>Link not valid</h1>
          <p className={styles.muted}>This review link is wrong or has been replaced by a newer one.</p>
        </div>
      </main>
    );
  }

  const v = check.identityVerification;
  const user = v.user;
  const live = v.livenessChecks[0];
  const face = v.faceMatches[0];
  const front = check.frontImagePath ? photoUrl(check.frontImagePath) : null;
  const back = check.backImagePath ? photoUrl(check.backImagePath) : null;
  const selfie = (live?.selfiePath ?? face?.selfiePath) ? photoUrl((live?.selfiePath ?? face?.selfiePath)!) : null;
  const birth = user.profile?.birthdate ? user.profile.birthdate.toISOString().slice(0, 10) : '—';

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>AniTime · National ID review</p>
        <h1 className={styles.h1}>{user.fullname}</h1>
        <p className={styles.muted}>
          {user.email} · {user.phoneNumber ?? 'no phone'} · Birthdate on account: {birth}
        </p>

        <div className={styles.grid}>
          {[
            ['Front of ID', front],
            ['Back of ID', back],
            ['Live selfie', selfie],
          ].map(([label, src]) => (
            <figure key={label as string} className={styles.fig}>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={src as string} target="_blank" rel="noreferrer"><img src={src as string} alt={label as string} /></a>
              ) : (
                <div className={styles.none}>Not provided</div>
              )}
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>

        <ul className={styles.checks}>
          <li>Name matched the account (automatic): <strong>{yn(check.nameMatch)}</strong></li>
          <li>Birthdate matched (automatic): <strong>{yn(check.birthdateMatch)}</strong></li>
          <li>Selfie matched the ID photo (automatic): <strong>{yn(face?.faceMatchPassed)}</strong></li>
          <li>Live check passed: <strong>{yn(live?.livenessPassed)}</strong></li>
        </ul>
        <p className={styles.muted}>
          Compare the name and birthdate printed on the ID with the account above, and check that the face on the ID is the person in the selfie.
          Confirming grants the applicant the Verified badge.
        </p>

        <ReviewActions token={token} initial={check.reviewDecision as 'APPROVED' | 'DECLINED' | null} />
      </div>
    </main>
  );
}
