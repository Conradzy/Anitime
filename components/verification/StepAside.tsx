import { CheckIcon, LockIcon, ShieldCheckIcon } from './icons';
import styles from './verification.module.css';

type Tip = { title: string; body: string };

/** Helper copy that sits beside each step so the wide layout has something
 * useful in it. Everything here describes what the flow really does. */
const TIPS: Record<string, { heading: string; items: Tip[] }> = {
  account: {
    heading: 'Verifying your mobile number',
    items: [
      { title: 'Why we ask', body: 'A verified number lets AniTime reach you about offers, deliveries and account security.' },
      { title: 'No code yet?', body: 'Wait about 40 seconds, check the number, then use Resend. Each code works for 10 minutes.' },
      { title: 'One number, one account', body: 'A number already verified on another account can’t be used again.' },
    ],
  },
  personal: {
    heading: 'About your details',
    items: [
      { title: 'Why your birthdate', body: 'It’s compared with the birthdate on your National ID. Nobody else ever sees it.' },
      { title: 'Age requirement', body: 'You need to be 18 or older to sell on AniTime.' },
      { title: 'Profile photo', body: 'Optional. A clear photo helps buyers recognise the person behind a listing.' },
    ],
  },
  address: {
    heading: 'Your home address',
    items: [
      { title: 'Home is not your farm', body: 'This is where you live. Your farm location is set separately on each listing.' },
      { title: 'Match your ID', body: 'Use the address as it appears on your National ID where you can.' },
      { title: 'Kept private', body: 'Buyers and other sellers never see your street, barangay or postal code.' },
    ],
  },
  document: {
    heading: 'Scanning your National ID',
    items: [
      { title: 'Use the back of the card', body: 'The QR code is on the back of a PhilID, or on your ePhilID printout or screen.' },
      { title: 'Good light, no glare', body: 'Avoid reflections on the plastic. Use the light button in the scanner if it’s dark.' },
      { title: 'Hold steady', body: 'Keep the card a hand-width from the camera with the whole QR inside the frame.' },
    ],
  },
  live: {
    heading: 'About the live check',
    items: [
      { title: 'Why a selfie', body: 'It confirms the person holding the ID is really you and is not a photo or a screen.' },
      { title: 'How it works', body: 'Fit your face in the oval, then follow two quick prompts to turn your head. It takes a few seconds.' },
      { title: 'What we keep', body: 'One still selfie, stored with your ID photos so a person can check them if a scam is ever reported.' },
    ],
  },
  review: {
    heading: 'What happens next',
    items: [
      { title: 'Instant when it matches', body: 'If your ID matches your account details, you’re verified right away.' },
      { title: 'Reviewed when it doesn’t', body: 'If something doesn’t line up, a person on the AniTime team checks it. You can keep using AniTime meanwhile.' },
      { title: 'Change anything', body: 'Use Edit on any section to correct it before you submit.' },
    ],
  },
};

const SAFE = ['We use a secure verification process', 'Your data is kept private and protected', 'Your information is only used for account verification'];

/** A phone with a shield, drawn in the brand greens. */
function SafeIllustration() {
  return (
    <svg className={styles.safeArt} viewBox="0 0 220 150" fill="none" aria-hidden="true">
      <path d="M22 118c-6-30 8-58 30-64 4 22-4 50-30 64z" fill="#DDE9C6" />
      <path d="M198 118c6-30-8-58-30-64-4 22 4 50 30 64z" fill="#DDE9C6" />
      <path d="M40 132c-2-18 6-34 18-40 2 14-3 30-18 40z" fill="#C4D96B" opacity=".55" />
      <path d="M180 132c2-18-6-34-18-40-2 14 3 30 18 40z" fill="#C4D96B" opacity=".55" />
      <rect x="78" y="14" width="64" height="118" rx="13" fill="#0B4635" />
      <rect x="83" y="22" width="54" height="102" rx="9" fill="#F6F5EF" />
      <rect x="99" y="17" width="22" height="4" rx="2" fill="#062F24" />
      <path d="M110 46l20 8v14c0 15-8 26-20 31-12-5-20-16-20-31V54z" fill="#2F6B45" />
      <path d="M101 70l6 6 12-13" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StepAside({ stepKey }: { stepKey: string }) {
  const tips = TIPS[stepKey];
  return (
    <aside className={styles.aside} aria-label="Helpful information">
      <div className={styles.safePanel}>
        <div className={styles.safeHead}>
          <span className={styles.safeShield}>
            <ShieldCheckIcon size={16} />
          </span>
          Your information is safe
        </div>
        <ul className={styles.safeList}>
          {SAFE.map((s) => (
            <li key={s}>
              <CheckIcon size={13} stroke="#2F6B45" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <SafeIllustration />
      </div>

      {tips && (
        <div className={styles.tipsPanel}>
          <div className={styles.tipsHead}>{tips.heading}</div>
          <ul className={styles.tipList}>
            {tips.items.map((t, i) => (
              <li key={t.title} className={styles.tip}>
                <span className={styles.tipNum}>{i + 1}</span>
                <span>
                  <strong>{t.title}</strong>
                  <span className={styles.tipBody}>{t.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.tipFoot}>
            <LockIcon size={13} /> Your ID number, birthdate and home address are never shown to other users.
          </p>
        </div>
      )}
    </aside>
  );
}
