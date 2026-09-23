'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { canvasToJpeg } from './types';
import styles from './verification.module.css';

/** Chrome ships a native barcode reader; it is much faster than decoding in
 * JavaScript, so it is used when present and jsQR covers everything else. */
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const SCAN_INTERVAL_MS = 140;
// The PhilID QR is dense (it carries a digital signature), so frames are read at
// a much higher resolution than a plain QR needs.
const MAX_DECODE_SIDE = 1600;

function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device. You can upload a photo of the QR code instead.';
  }
  if (name === 'NotReadableError') {
    return 'Your camera is already in use by another app. Close it and try again.';
  }
  return 'The camera could not be started. You can upload a photo of the QR code instead.';
}

function makeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** Reads a QR from whatever is drawn on `canvas`. It tries the image as it is
 * AND flipped left-to-right, because many front (selfie) cameras and laptop
 * drivers deliver a MIRRORED picture, and a mirrored QR code can't be decoded
 * as-is. Returns the QR's text, or null if there is none. */
async function decodeCanvas(
  canvas: HTMLCanvasElement,
  flipCanvas: HTMLCanvasElement,
  detector: BarcodeDetectorLike | null
): Promise<{ text: string; mirrored: boolean } | null> {
  const w = canvas.width;
  const h = canvas.height;
  const fctx = flipCanvas.getContext('2d', { willReadFrequently: true });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !fctx || !w || !h) return null;

  flipCanvas.width = w;
  flipCanvas.height = h;
  fctx.setTransform(-1, 0, 0, 1, w, 0); // mirror horizontally
  fctx.drawImage(canvas, 0, 0);
  fctx.setTransform(1, 0, 0, 1, 0, 0);

  for (const c of [canvas, flipCanvas]) {
    if (detector) {
      try {
        const codes = await detector.detect(c);
        if (codes[0]?.rawValue) return { text: codes[0].rawValue, mirrored: c === flipCanvas };
      } catch {
        // fall through to jsQR
      }
    }
    const cx = c === canvas ? ctx : fctx;
    const img = cx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return { text: code.data, mirrored: c === flipCanvas };
  }
  return null;
}

/** A JPEG of what was scanned — the back of the ID — so it can be kept as
 * proof. If the QR only decoded when flipped, the camera was mirroring, so the
 * saved picture is un-mirrored to be readable. */
async function snapshot(canvas: HTMLCanvasElement, flipCanvas: HTMLCanvasElement, mirrored: boolean): Promise<Blob | null> {
  return canvasToJpeg(mirrored ? flipCanvas : canvas);
}

/** Draws a video frame or image onto `canvas`, scaled to at most MAX_DECODE_SIDE. */
function drawScaled(canvas: HTMLCanvasElement, src: CanvasImageSource, sw: number, sh: number) {
  const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/**
 * Live QR scanner for the National ID step. Asks for the camera as soon as it
 * mounts, decodes continuously, and stops the stream the moment a code is
 * found. The decoded text is handed to the parent and never rendered.
 *
 * Works with a mirrored (front / laptop) camera, can switch between cameras,
 * and can read a photo of the QR instead.
 */
export function QrScanner({ onResult, onCancel }: { onResult: (text: string, image: Blob | null) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flipRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'requesting' | 'scanning' | 'found' | 'error'>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null); // null = let the browser choose (prefers the back camera)
  const [cameraLabel, setCameraLabel] = useState('');
  const [flipView, setFlipView] = useState(false); // preview only; decoding always tries both ways
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  // onResult must not restart the camera when the parent re-renders.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setErrorMsg('This browser cannot open a camera here. A camera needs an https address (or localhost). You can upload a photo of the QR code instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraId
            ? { deviceId: { exact: cameraId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (e) {
        if (stopped) return;
        setPhase('error');
        setErrorMsg(cameraErrorMessage(e));
        return;
      }
      if (stopped || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;
      setCameraLabel(track?.label ?? '');
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));

      // Device names are only available once permission has been granted.
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!stopped) {
          setCameras(all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        }
      } catch {
        /* switching is a nice-to-have */
      }
      setPhase('scanning');

      const detector = makeDetector();
      let busy = false;

      const tick = async () => {
        if (stopped) return;
        const v = videoRef.current;
        const canvas = canvasRef.current;
        const flip = flipRef.current;
        if (!busy && v && canvas && flip && v.readyState >= 2 && v.videoWidth) {
          busy = true;
          try {
            drawScaled(canvas, v, v.videoWidth, v.videoHeight);
            const hit = await decodeCanvas(canvas, flip, detector);
            if (hit && !stopped) {
              const image = await snapshot(canvas, flip, hit.mirrored);
              setPhase('found');
              stop();
              onResultRef.current(hit.text, image);
              return;
            }
          } catch {
            // one bad frame is normal; keep scanning
          } finally {
            busy = false;
          }
        }
        if (!stopped) timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }

    start();
    return stop;
  }, [cameraId]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is a real constraint but isn't in the DOM typings yet.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  function nextCamera() {
    if (cameras.length < 2) return;
    const current = cameras.findIndex((c) => c.label === cameraLabel);
    setPhase('requesting');
    setCameraId(cameras[(current + 1) % cameras.length].id);
    setTorchOn(false);
  }

  /** Reads the QR from a photo instead of the live camera. */
  async function readPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoMsg('');
    if (!/^image\//.test(file.type)) return setPhotoMsg('Please choose a picture (PNG, JPG or WEBP).');
    setPhotoBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const flip = flipRef.current;
      if (!canvas || !flip) return;
      // Try the photo at a few sizes: a dense QR reads best at full size, but a
      // huge photo can blur the modules when scaled down.
      const detector = makeDetector();
      let hit: { text: string; mirrored: boolean } | null = null;
      for (const side of [MAX_DECODE_SIDE, 2400, 1000]) {
        const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        hit = await decodeCanvas(canvas, flip, detector);
        if (hit) break;
      }
      bitmap.close();
      if (hit) {
        // A picked photo is never mirrored by a camera, so keep it as it is.
        const image = await snapshot(canvas, flip, false);
        setPhase('found');
        trackRef.current?.stop();
        onResultRef.current(hit.text, image);
      } else {
        setPhotoMsg('We could not find a QR code in that picture. Take a clear, close photo of just the QR on the back of your ID.');
      }
    } catch {
      setPhotoMsg('That picture could not be read. Try another one.');
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className={styles.scannerWrap}>
      <div className={styles.scanStage}>
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay style={flipView ? { transform: 'scaleX(-1)' } : undefined} />
        <canvas ref={canvasRef} hidden />
        <canvas ref={flipRef} hidden />

        {phase === 'scanning' && (
          <>
            <div className={styles.scanFrame}>
              <span className={`${styles.corner} ${styles.cTL}`} />
              <span className={`${styles.corner} ${styles.cTR}`} />
              <span className={`${styles.corner} ${styles.cBL}`} />
              <span className={`${styles.corner} ${styles.cBR}`} />
              <span className={styles.sweepLine} />
            </div>
            <div className={styles.scanStatus} role="status">
              Scanning…
            </div>
            <p className={styles.scanCaption}>Place the QR code on the back of your National ID inside the frame.</p>
          </>
        )}

        {phase === 'requesting' && (
          <p className={styles.scanMsg} role="status">
            Starting your camera…
            <br />
            Choose <strong>Allow</strong> when your browser asks for permission.
          </p>
        )}

        {phase === 'found' && (
          <p className={styles.scanMsg} role="status">
            ✓ QR code detected
          </p>
        )}

        {phase === 'error' && <p className={styles.scanMsg}>{errorMsg}</p>}
      </div>

      {phase === 'scanning' && (
        <p className={styles.scanTip}>
          Not scanning? Move the card a little closer or further, avoid glare, or tap Flip image if the preview looks
          mirrored. Laptop cameras work too.
          {cameraLabel ? <span className={styles.scanCam}> Using: {cameraLabel}</span> : null}
        </p>
      )}

      <div className={styles.scanControls}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        {cameras.length > 1 && phase !== 'found' && (
          <button type="button" className={styles.secondary} onClick={nextCamera}>
            Switch camera
          </button>
        )}
        {phase === 'scanning' && (
          <button type="button" className={styles.secondary} onClick={() => setFlipView((f) => !f)} aria-pressed={flipView}>
            Flip image
          </button>
        )}
        {torchSupported && phase === 'scanning' && (
          <button type="button" className={styles.secondary} onClick={toggleTorch} aria-pressed={torchOn}>
            {torchOn ? 'Turn off light' : 'Turn on light'}
          </button>
        )}
        <label className={styles.secondary} style={{ cursor: photoBusy ? 'wait' : 'pointer' }}>
          {photoBusy ? 'Reading…' : 'Upload a photo of the QR'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={photoBusy}
            onChange={(e) => {
              readPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {photoMsg && (
        <div className={styles.err} role="alert">
          {photoMsg}
        </div>
      )}
    </div>
  );
}
