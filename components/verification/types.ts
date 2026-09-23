import type { VerificationState } from '@/lib/verification';

/** Type-only import: none of the server code in lib/verification.ts is
 * bundled for the browser. */
export type WizardState = VerificationState & { smsConfigured: boolean };

export type StepProps = {
  state: WizardState;
  /** Re-reads /api/verification/status and returns the fresh state. */
  refresh: () => Promise<WizardState | null>;
  next: () => void;
  back: () => void;
  /** Jump straight to a step by key — used by "Edit" on the review screen. */
  goTo: (key: string) => void;
};

/** Small helper shared by every step: POST JSON and surface a clean message. */
export async function post<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T & { error?: string } };
  } catch {
    return { ok: false, data: { error: 'Could not reach the server. Check your connection.' } as T & { error?: string } };
  }
}

/** Uploads one image (JPEG blob from a canvas, or a picked file) through the
 * existing /api/uploads endpoint and returns its storage path + URL. */
export async function uploadImage(blob: Blob, name = 'capture.jpg'): Promise<{ path: string; url: string } | null> {
  try {
    const form = new FormData();
    form.append('file', new File([blob], name, { type: blob.type || 'image/jpeg' }));
    const res = await fetch('/api/uploads', { method: 'POST', body: form });
    if (!res.ok) return null;
    return (await res.json()) as { path: string; url: string };
  } catch {
    return null;
  }
}

/** Shrinks an image so a phone photo (often 8+ MB) fits the 5 MB upload limit. */
export async function canvasToJpeg(canvas: HTMLCanvasElement, maxSide = 1600, quality = 0.85): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  out.getContext('2d')?.drawImage(canvas, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', quality));
}

export async function fileToJpeg(file: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    bmp.close();
    return canvasToJpeg(c);
  } catch {
    return null;
  }
}
