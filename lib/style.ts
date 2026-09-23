import type { CSSProperties } from 'react';

/**
 * Converts a raw CSS declaration string (exactly as authored in the original
 * Claude Design export, e.g. "display:flex;align-items:center;gap:10px")
 * into a React style object. This lets every inline style from the exported
 * .dc.html files be carried over verbatim (just wrapped in a template
 * literal for any {{ }} bindings) instead of being hand-retyped into object
 * literals, which is how we guarantee pixel-for-pixel fidelity with the
 * original design at this volume of inline styles.
 */
export function cssToStyle(css: string | undefined | null): CSSProperties {
  if (!css) return {};
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const rawProp = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!rawProp || !value) continue;
    if (rawProp.startsWith('--')) {
      // CSS custom property — keep as-is.
      style[rawProp] = value;
    } else {
      const camel = rawProp.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      style[camel] = value;
    }
  }
  return style as CSSProperties;
}
