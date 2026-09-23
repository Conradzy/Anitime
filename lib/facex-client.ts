// Browser-only face engine for the live selfie step.
//
//  - FaceX (https://github.com/facex-engine/facex, Apache-2.0 for the wasm/JS
//    embedding engine): turns an aligned 112x112 face into a 512-number
//    "face fingerprint" (EdgeFace-XS). Two fingerprints of the same person score
//    a high cosine similarity. Files live in /public/facex.
//  - MediaPipe Face Landmarker (Apache-2.0): finds the face, its landmarks and
//    eye-blink signals, which drive the liveness prompts. Files live in
//    /public/mediapipe.
//
// FaceX's own bundled face detector returns zero faces in its current release
// (the project's own notes say so), so MediaPipe supplies the 5 face points
// FaceX needs for alignment. Everything runs inside the browser.

import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type FaceInfo = {
  /** eyes, nose, mouth corners in pixels, ArcFace order (image-left eye first) */
  kps: [number, number][];
  box: { x1: number; y1: number; x2: number; y2: number };
  /** Nose offset from the midpoint of the eyes, in eye-distances. For a video
   * this is as the user SEES the mirrored preview: negative = left of the screen. */
  yaw: number;
  /** 0 (open) .. 1 (closed), average of both eyes */
  blink: number;
};

/** Cosine similarity above this counts as "same person" (FaceX default). */
export const FACE_MATCH_THRESHOLD = 0.3;

const FACEX = '/facex/';
type G = Record<string, unknown>;
type FxModule = {
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPF32: Float32Array;
  FS: { writeFile(p: string, d: Uint8Array): void };
  cwrap(n: string, r: string, a: string[]): (...x: unknown[]) => number;
};
export type FaceEngine = {
  landmarker: FaceLandmarker;
  fx: FxModule;
  fxHandle: number;
  mode: 'IMAGE' | 'VIDEO';
};
type Source = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-facex="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.facex = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

function simdSupported(): boolean {
  try {
    // the standard wasm-feature-detect probe
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
    );
  } catch {
    return false;
  }
}

let pending: Promise<FaceEngine> | null = null;

async function init(onProgress?: (m: string) => void): Promise<FaceEngine> {
  if (!simdSupported()) throw new Error('SIMD');

  onProgress?.('Loading face engine…');
  const [{ FaceLandmarker, FilesetResolver }] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    loadScript(`${FACEX}facex.js`).then(() => loadScript(`${FACEX}align.js`)),
  ]);

  const g = window as unknown as G;
  const fx = await (g.FaceXModule as () => Promise<FxModule>)();
  onProgress?.('Loading face model (7 MB, first time only)…');
  const weights = new Uint8Array(await (await fetch(`${FACEX}edgeface_xs_fp32.bin`)).arrayBuffer());
  fx.FS.writeFile('/emb.bin', weights);
  const fxHandle = fx.cwrap('facex_init', 'number', ['string', 'string'])('/emb.bin', null);
  if (!fxHandle) throw new Error('embedder');

  onProgress?.('Loading face tracker…');
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe');
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  return { landmarker, fx, fxHandle, mode: 'IMAGE' };
}

export function loadFaceX(onProgress?: (m: string) => void): Promise<FaceEngine> {
  pending ??= init(onProgress).catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}

const avg = (pts: NormalizedLandmark[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

function sizeOf(s: Source): [number, number] {
  if (s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight];
  if (s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight];
  return [s.width, s.height];
}

/** Finds the face in a video frame or in a still canvas / image. */
export async function findFace(e: FaceEngine, source: Source, ts?: number): Promise<FaceInfo | null> {
  const isVideo = source instanceof HTMLVideoElement;
  const mode = isVideo ? 'VIDEO' : 'IMAGE';
  if (e.mode !== mode) {
    await e.landmarker.setOptions({ runningMode: mode });
    e.mode = mode;
  }
  const [w, h] = sizeOf(source);
  if (!w || !h) return null;

  const res = isVideo ? e.landmarker.detectForVideo(source, ts ?? performance.now()) : e.landmarker.detect(source);
  const lm = res.faceLandmarks?.[0];
  if (!lm || lm.length < 400) return null;

  const eyeL = avg([lm[33], lm[133]]); // image-left eye (the subject's right)
  const eyeR = avg([lm[362], lm[263]]);
  const px = (p: { x: number; y: number }): [number, number] => [p.x * w, p.y * h];
  const kps: [number, number][] = [px(eyeL), px(eyeR), px(lm[1]), px(lm[61]), px(lm[291])];

  const xs = lm.map((p) => p.x * w);
  const ys = lm.map((p) => p.y * h);
  const eyeDist = Math.hypot(kps[1][0] - kps[0][0], kps[1][1] - kps[0][1]) || 1;
  const rawYaw = (kps[2][0] - (kps[0][0] + kps[1][0]) / 2) / eyeDist;

  const bs = res.faceBlendshapes?.[0]?.categories ?? [];
  const score = (n: string) => bs.find((c) => c.categoryName === n)?.score ?? 0;

  return {
    kps,
    box: { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) },
    yaw: isVideo ? -rawYaw : rawYaw,
    blink: (score('eyeBlinkLeft') + score('eyeBlinkRight')) / 2,
  };
}

/** FaceX face fingerprint (512 numbers) of the face found in `source`. */
export function embedFace(e: FaceEngine, source: Source, face: FaceInfo): Float32Array {
  const g = window as unknown as G;
  const alignFace = g.alignFace as (
    srcCtx: CanvasRenderingContext2D, w: number, h: number, kps: number[][], dstCtx: CanvasRenderingContext2D
  ) => ImageData;

  const [w, h] = sizeOf(source);
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = dst.height = 112;
  const dctx = dst.getContext('2d', { willReadFrequently: true })!;
  const aligned = alignFace(sctx, w, h, face.kps, dctx);

  const N = 112 * 112;
  const inPtr = e.fx._malloc(N * 3 * 4);
  const outPtr = e.fx._malloc(512 * 4);
  try {
    const heap = e.fx.HEAPF32;
    const base = inPtr >> 2;
    const px = aligned.data;
    for (let i = 0; i < N; i++) {
      heap[base + i * 3] = px[i * 4] / 127.5 - 1;
      heap[base + i * 3 + 1] = px[i * 4 + 1] / 127.5 - 1;
      heap[base + i * 3 + 2] = px[i * 4 + 2] / 127.5 - 1;
    }
    e.fx.cwrap('facex_embed', 'number', ['number', 'number', 'number'])(e.fxHandle, inPtr, outPtr);
    // read through the module again in case the heap grew during the call
    return new Float32Array(e.fx.HEAPF32.subarray(outPtr >> 2, (outPtr >> 2) + 512));
  } finally {
    e.fx._free(inPtr);
    e.fx._free(outPtr);
  }
}

export function cosSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function faceXErrorMessage(e: unknown): string {
  const m = (e as Error)?.message ?? '';
  if (/SIMD/i.test(m)) return 'This browser is too old for the face check. Use a recent Chrome, Edge, Firefox or Safari.';
  return 'The face check could not start. Check your connection and try again.';
}
