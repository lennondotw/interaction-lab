import { useEffect, useState } from 'react';
import type { ColorScheme } from './render/palette.js';

/**
 * The workspace stylesheet already resolves the theme into `color-scheme`
 * on `:root` — for the explicit `[data-theme]` attribute AND for the
 * `prefers-color-scheme` fallback when no attribute is set. Reading the
 * computed value means we never have to re-implement that cascade here.
 */
function readColorScheme(): ColorScheme {
  const computed = getComputedStyle(document.documentElement).colorScheme;
  if (computed.includes('dark')) return 'dark';
  if (computed.includes('light')) return 'light';
  // `normal` — the stylesheet isn't loaded (or a host page doesn't use it).
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolved light / dark for canvas painting. Pass `override` to pin the
 * scheme (e.g. a story that wants both side by side); leave it undefined
 * to follow the document.
 */
export function useColorScheme(override?: ColorScheme): ColorScheme {
  const [detected, setDetected] = useState<ColorScheme>(readColorScheme);

  useEffect(() => {
    if (override) return;

    const update = (): void => setDetected(readColorScheme());
    // Re-read on the two things that can change the computed value: the
    // theme attribute flipping, and the OS preference changing while no
    // attribute is set.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);

    // The attribute may have landed between first render and this effect.
    update();

    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, [override]);

  return override ?? detected;
}
