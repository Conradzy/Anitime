'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, LockIcon, ScanFaceIcon } from '../icons';
import {
  FACE_MATCH_THRESHOLD, cosSim, embedFace, faceXErrorMessage, findFace, loadFaceX, type FaceEngine,
} from '@/lib/facex-client';
import { canvasToJpeg, post, uploadImage, type StepProps } from '../types';
import styles from '../verification.module.css';

type Phase = 'intro' | 'loading' | 'running' | 'saving' | 'done' | 'failed';
type Cue = 'center' | 'left' | 'right' | 'blink' | 'back' | 'hold';

const CUE_TEXT: Record<Cue, string> = {
  center: 'Fit your face inside the oval',
  left: 'Slowly turn your head to the LEFT of the screen',
  right: 'Slowly turn your head to the RIGHT of the screen',
  blink: 'Now blink slowly',
  back: 'Now look straight at the camera',
  hold: 'Hold still…',
};

const YAW_TURN = 0.3; // how far the nose must move sideways (as a share of eye distance)
const YAW_STRAIGHT = 0.15;
const BLINK_CLOSED = 0.5;
const TIMEOUT_MS = 50_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

/** The face fingerprint of the photo printed on the ID. The portrait is small
 * in a picture of the whole card, so the full image, then its left half (where
 * a PhilID keeps the portrait) and the top-left corner are tried in turn. */
async function idFaceEmbedding(engine: FaceEngine, url: string): Promise<Float32Array | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return null;
  }
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const regions: [number, number, number, number][] = [
    [0, 0, W, H],
    [0, 0, W * 0.55, H],
    [0, H * 0.1, W * 0.4, H * 0.7],
  ];
  for (const [x, y, w, h] of regions) {
    const c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext('2d', { willReadFrequently: true })?.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    try {
      const face = await findFace(engine, c);
      if (face) return embedFace(engine, c, face);
    } catch {
      /* try the next crop */
    }
  }
  return null;
}

/** Step 5 — live selfie. In the browser, MediaPipe tracks the face and FaceX
 * builds a face fingerprint; the user is asked to turn their head left and
 * right and to blink, which a flat photo held up to the camera can't do on cue. The
 * selfie is then compared to the photo on the ID and stored with the ID photos.
 *
 * Limits, stated in the UI copy and in the database: this is a basic
 * head-movement liveness test, not certified anti-spoofing, and it runs in the
 * browser — so the stored selfie is what lets a person audit it later. */
export function LiveStep({ state, refresh, next, back }: StepProps) {
  const already = Boolean(state.live?.passed);
  const [phase, setPhase] = useState<Phase>(already ? 'done' : 'intro');
  const [error, setError] = useState('');
  const [cue, setCue] = useState<Cue>('center');
  const [progress, setProgress] = useState(0); // 0..3 challenges finished
  const [inOval, setInOval] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [selfieUrl, setSelfieUrl] = useState<string | null>(state.live?.selfieUrl ?? null);
  const [matched, setMatched] = useState<boolean | null>(state.live?.faceMatched ?? null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const runRef = useRef({ cancelled: false });

  useEffect(() => {
    const run = runRef.current;
    return () => {
      run.cancelled = true;
    };
  }, []);

  async function start() {
    const run = { cancelled: false };
    runRef.current.cancelled = true; // stop any earlier run
    runRef.current = run;
    setError('');
    setProgress(0);
    setCue('center');
    setPhase('loading');

    let stream: MediaStream | undefined;
    const stopCamera = () => stream?.getTracks().forEach((t) => t.stop());
    const fail = (msg: string) => {
      stopCamera();
      if (run.cancelled) return;
      setError(msg);
      setPhase('failed');
    };

    let engine: FaceEngine;
    try {
      engine = await loadFaceX(setLoadMsg);
    } catch (e) {
      return fail(faceXErrorMessage(e));
    }
    if (run.cancelled) return;

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return fail(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
          : 'The camera could not be started. A camera needs an https address (or localhost).'
      );
    }
    if (run.cancelled || !videoRef.current) return stopCamera();
    const video = videoRef.current;
    video.srcObject = stream;
    await video.play().catch(() => {});
    setPhase('running');

    // The reference: the face printed on the ID front photo.
    const idUrl = state.document?.frontImageUrl;
    const refEmb = idUrl ? await idFaceEmbedding(engine, idUrl) : null;

    // Two head turns in random order, then a blink: a photo held up to the camera can't do these on cue.
    const order: ('left' | 'right')[] = Math.random() < 0.5 ? ['left', 'right'] : ['right', 'left'];
    const startedAt = performance.now();
    // 0 look straight (selfie is taken) · 1 first turn · 2 second turn · 3 blink · 4 look straight again
    let stage = 0;
    let streak = 0;
    let bestSim = -1;
    let selfie: HTMLCanvasElement | null = null;
    let firstEmb: Float32Array | null = null;
    let centred = 0;
    let eyesOpenSeen = false;

    const cap = () => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')?.drawImage(video, 0, 0);
      return c;
    };

    const tick = async () => {
      if (run.cancelled) return;
      if (performance.now() - startedAt > TIMEOUT_MS) {
        return fail('That took too long. Make sure your face is well lit and fully in the oval, then try again.');
      }
      if (video.readyState >= 2 && video.videoWidth) {
        let face = null as Awaited<ReturnType<typeof findFace>>;
        try {
          face = await findFace(engine, video, performance.now());
        } catch {
          /* skip a bad frame */
        }

        if (!face) {
          streak = 0;
          setInOval(false);
        } else {
          const { box, yaw } = face;
          const cx = (box.x1 + box.x2) / 2 / video.videoWidth;
          const cy = (box.y1 + box.y2) / 2 / video.videoHeight;
          const size = (box.y2 - box.y1) / video.videoHeight;
          const ok = Math.abs(cx - 0.5) < 0.16 && Math.abs(cy - 0.5) < 0.2 && size > 0.3 && size < 0.95;
          setInOval(ok);

          if (ok) {
            if (stage === 0) {
              // straight at the camera: this is where the selfie and the ID comparison come from
              if (Math.abs(yaw) < YAW_STRAIGHT && face.blink < 0.3) {
                centred++;
                setCue('hold');
                if (centred % 3 === 1) {
                  const c = cap();
                  const emb = embedFace(engine, c, face);
                  firstEmb ??= emb;
                  if (refEmb) bestSim = Math.max(bestSim, cosSim(emb, refEmb));
                  selfie = c;
                }
                if (centred >= 7) {
                  stage = 1;
                  streak = 0;
                  setCue(order[0]);
                }
              } else {
                setCue('center');
              }
            } else if (stage === 1 || stage === 2) {
              const want = order[stage - 1];
              const turned = want === 'left' ? yaw < -YAW_TURN : yaw > YAW_TURN;
              streak = turned ? streak + 1 : 0;
              if (streak >= 2) {
                stage++;
                streak = 0;
                setProgress(stage - 1);
                setCue(stage === 3 ? 'blink' : order[1]);
              }
            } else if (stage === 3) {
              // needs to see the eyes open, then closed, then open again
              if (Math.abs(yaw) < 0.4) {
                if (face.blink < 0.25) {
                  if (streak === 1) streak = 2; // reopened after a blink
                  eyesOpenSeen = true;
                } else if (face.blink > BLINK_CLOSED && eyesOpenSeen) {
                  streak = 1;
                }
                if (streak === 2) {
                  stage = 4;
                  streak = 0;
                  setProgress(3);
                  setCue('back');
                }
              }
            } else if (stage === 4) {
              if (Math.abs(yaw) < YAW_STRAIGHT) {
                streak++;
                if (streak >= 3) {
                  // the same person who started must still be there
                  const c = cap();
                  const emb = embedFace(engine, c, face);
                  if (firstEmb && cosSim(emb, firstEmb) < 0.3) {
                    return fail('The face changed during the check. Please try again, on your own.');
                  }
                  return finish();
                }
              } else {
                streak = 0;
              }
            }
          } else {
            streak = 0;
          }
        }
      }
      window.setTimeout(tick, 60);
    };

    const finish = async () => {
      setProgress(3);
      setPhase('saving');
      const image = selfie ? await canvasToJpeg(selfie, 1024, 0.9) : null;
      stopCamera();
      if (run.cancelled) return;
      if (!image) return fail('The selfie could not be captured. Please try again.');
      const up = await uploadImage(image, 'selfie.jpg');
      if (!up) return fail('The selfie could not be saved. Check your connection and try again.');
      // no ID photo face found (blurry / cropped) -> null: a person compares the two
      const faceMatched = refEmb ? bestSim > FACE_MATCH_THRESHOLD : null;
      const { ok, data } = await post('/api/verification/live', {
        selfiePath: up.path,
        livenessPassed: true,
        livenessScore: 1,
        matchScore: refEmb ? bestSim : null,
        faceMatched,
      });
      if (run.cancelled) return;
      if (!ok) return fail(data.error ?? 'Could not save the result.');
      setSelfieUrl(up.url);
      setMatched(faceMatched);
      await refresh();
      setPhase('done');
    };

    tick();
  }

  // stop the camera if the user leaves the step mid-check
  useEffect(() => () => {
    const v = videoRef.current;
    (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  const busy = phase === 'loading' || phase === 'running' || phase === 'saving';
  const hasIdPhoto = Boolean(state.document?.frontImageUrl);

  return (
    <>
      <h1 className={styles.h1}>Let&apos;s make sure it&apos;s really you.</h1>
      <p className={styles.lede}>
        A short live selfie check confirms that the person holding the National ID is you — and not a photo or a screen.
      </p>

      {phase === 'intro' && (
        <>
          <div className={styles.livePreview}>
            <span className={styles.liveRing}>
              <ScanFaceIcon size={34} />
            </span>
            <div className={styles.liveTitle}>Live selfie check</div>
            <p className={styles.liveText}>
              Look at the camera, then follow the prompts: turn your head left and right, then blink. It takes about 15 seconds.
              Remove hats and face masks, and face a light.
            </p>
          </div>
          {!hasIdPhoto && (
            <div className={styles.warn} style={{ marginTop: 14 }}>
              <span className={styles.statementIcon}>
                <AlertIcon size={15} />
              </span>
              <span>
                There is no photo of your ID front on file, so your face can&apos;t be compared automatically. Someone
                from the team will check it. (Go back to the National ID step to retake the photos.)
              </span>
            </div>
          )}
          <div className={styles.info} style={{ marginTop: 14 }}>
            <span className={styles.statementIcon}>
              <LockIcon size={15} />
            </span>
            The face check runs on your device. We store one still selfie (no video) alongside your ID photos so a person
            can review them if a scam is ever reported.
          </div>
        </>
      )}

      {busy && (
        <>
          <div className={styles.liveStage}>
            <video ref={videoRef} playsInline muted autoPlay />
            {phase === 'running' && <div className={`${styles.faceOval} ${inOval ? styles.ovOk : ''}`} />}
            {phase === 'running' && <div className={styles.liveCue}>{CUE_TEXT[cue]}</div>}
            {phase === 'loading' && <div className={styles.liveCue}>{loadMsg || 'Starting…'}</div>}
            {phase === 'saving' && <div className={styles.liveCue}>Saving your selfie…</div>}
          </div>
          <div className={styles.liveDots} aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`${styles.liveDot} ${progress > i ? styles.ldOn : ''}`} />
            ))}
          </div>
        </>
      )}

      {phase === 'done' && (
        <>
          <div className={matched === false ? styles.warn : styles.ok} style={{ marginTop: 22 }}>
            <span className={styles.statementIcon}>{matched === false ? <AlertIcon size={15} /> : <CheckIcon stroke="#274C1C" />}</span>
            <span>
              {matched === true && <><strong>Live check passed.</strong> Your face matches the photo on your ID.</>}
              {matched === false && (
                <>
                  <strong>Live check passed, but your face didn&apos;t clearly match the ID photo.</strong> That can
                  happen with glare or an old photo. You can retry, or continue and a person will review it.
                </>
              )}
              {matched === null && (
                <>
                  <strong>Live check passed.</strong> We couldn&apos;t read the face on your ID photo, so a person will
                  compare them.
                </>
              )}
            </span>
          </div>
          {selfieUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.selfieOut} src={selfieUrl} alt="Your selfie" />
          )}
        </>
      )}

      {phase === 'failed' && (
        <div className={styles.err} style={{ marginTop: 22 }} role="alert">
          <span className={styles.statementIcon}>
            <AlertIcon size={15} />
          </span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={back} disabled={busy}>
          ← Back
        </button>
        <span className={styles.spacer} />
        {(phase === 'intro' || phase === 'failed') && (
          <button type="button" className={styles.primary} onClick={start}>
            {phase === 'failed' ? 'Try again' : 'Start live check'}
          </button>
        )}
        {phase === 'done' && (
          <>
            <button type="button" className={styles.secondary} onClick={start}>
              Retake
            </button>
            <button type="button" className={styles.primary} onClick={next}>
              Continue →
            </button>
          </>
        )}
      </div>
    </>
  );
}
