/**
 * CSS AI core orb — the fallback and the Suspense placeholder for OrbScene.
 *
 * Deliberately reads as the same object as the WebGL orb (green core, cyan
 * rim, same states) so swapping between them is not a visual jump. Styles
 * live in hud.css under `.orb-css`.
 */

import type { CSSProperties } from 'react';

interface OrbCssProps {
  connected: boolean;
  speaking: boolean;
  size: number;
  /** Off for prefers-reduced-motion — the orb still renders, it just holds still. */
  animated?: boolean;
  className?: string;
}

export function OrbCss({ connected, speaking, size, animated = true, className = '' }: OrbCssProps) {
  const classes = ['orb-css'];
  if (animated) classes.push('orb-css--animated');
  if (speaking) classes.push('orb-css--speaking');
  if (!connected) classes.push('orb-css--offline');
  if (className) classes.push(className);

  return (
    <div
      aria-hidden="true"
      className={classes.join(' ')}
      style={{ '--orb-size': `${size}px` } as CSSProperties}
    >
      <div className="orb-css-ring" />
    </div>
  );
}
