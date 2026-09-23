'use client';

import { useEffect, useRef, useState } from 'react';
import { canvasToJpeg, fileToJpeg } from './types';
import styles from './verification.module.css';

/** Takes one still photo (used for the FRONT of the National ID). Prefers the
 * back camera, which is not mirrored, and lets the user switch cameras or pick
 * a photo from the device instead. */
export function CameraCapture({
  caption,
  onCapture,
  onCancel,
}: {
  caption: string;
  onCapture: (image: Blob) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<'requesting' | 'ready' | 'error'>('requesting');
  const [error, setError] = useState('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false); // for webcams whose driver mirrors the picture

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setError('This browser cannot open a camera here (it needs https or localhost). You can pick a photo instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraId
            ? { deviceId: { exact: cameraId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        if (!stopped) {
          setPhase('error');
          setError('The camera could not be started. Allow camera access, or pick a photo instead.');
        }
        return;
      }
      if (stopped || !videoRef.current) return stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      setCameraLabel(track?.label ?? '');
      setPhase('ready');
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!stopped) setCameras(all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
      } catch {
        /* switching is optional */
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraId]);

  function nextCamera() {
    const i = cameras.findIndex((c) => c.label === cameraLabel);
    setPhase('requesting');
    setCameraId(cameras[(i + 1) % cameras.length].id);
  }

  async function snap() {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    setBusy(true);
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const cx = c.getContext('2d');
    if (flipped) cx?.setTransform(-1, 0, 0, 1, c.width, 0);
    cx?.drawImage(v, 0, 0);
    const blob = await canvasToJpeg(c);
    setBusy(false);
    if (blob) onCapture(blob);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const blob = await fileToJpeg(file);
    setBusy(false);
    if (blob) onCapture(blob);
    else setError('That picture could not be read. Try another one.');
  }

  return (
    <div className={styles.scannerWrap}>
      <div className={styles.scanStage}>
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay style={flipped ? { transform: 'scaleX(-1)' } : undefined} />
        {phase === 'ready' && (
          <>
            <div className={styles.cardGuide} />
            <p className={styles.scanCaption}>{caption}</p>
          </>
        )}
        {phase === 'requesting' && (
          <p className={styles.scanMsg} role="status">
            Starting your camera…
            <br />
            Choose <strong>Allow</strong> when your browser asks for permission.
          </p>
        )}
        {phase === 'error' && <p className={styles.scanMsg}>{error}</p>}
      </div>
      <div className={styles.scanControls}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        {cameras.length > 1 && (
          <button type="button" className={styles.secondary} onClick={nextCamera}>
            Switch camera
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
          Flip image
        </button>
        <label className={styles.secondary} style={{ cursor: busy ? 'wait' : 'pointer' }}>
          Choose a photo
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" className={styles.primary} onClick={snap} disabled={phase !== 'ready' || busy}>
          {busy ? 'Saving…' : 'Take photo'}
        </button>
      </div>
      {phase !== 'error' && error && <div className={styles.err} role="alert">{error}</div>}
    </div>
  );
}
