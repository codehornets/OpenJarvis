/**
 * prefers-reduced-motion helpers.
 *
 * CSS already has a blanket kill in hud.css; these exist for the JS side,
 * where the choice is not "animate slower" but "mount a different component"
 * (e.g. skip the WebGL orb entirely rather than render a frozen one).
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

export function prefersReducedMotion(): boolean {
  if (!canMatch()) return false;
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (!canMatch()) return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    // Re-read on mount: the OS setting can change between the initial state
    // and effects running.
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
