/**
 * Mini AI core — the orb shrunk to a status dot, for the streaming indicator
 * and sidebar. Same palette and keyframes as OrbCss, but a flatter gradient
 * stack: the layered rim/specular treatment turns to mud below ~30px.
 */

import type { CSSProperties } from 'react';

interface OrbDotProps {
  speaking?: boolean;
  connected?: boolean;
  size?: number;
  className?: string;
}

export function OrbDot({ speaking = false, connected = true, size = 20, className = '' }: OrbDotProps) {
  const classes = ['orb-dot'];
  if (!connected) classes.push('orb-dot--offline');
  else if (speaking) classes.push('orb-dot--speaking');
  else classes.push('orb-dot--idle');
  if (className) classes.push(className);

  return (
    <span
      aria-hidden="true"
      className={classes.join(' ')}
      style={{ '--orb-size': `${size}px` } as CSSProperties}
    />
  );
}
