/**
 * Public entry for the AI core orb. Picks a renderer and never lets the heavy
 * one take the app down with it:
 *
 *   reduced motion or no usable WebGL → CSS orb
 *   otherwise                         → lazy WebGL scene, CSS orb while it
 *                                       loads and if it throws
 */

import { Component, Suspense, lazy } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/reduced-motion';
import { OrbCss } from './OrbCss';
import { useOrbState } from './useOrbState';
import { webglOk } from './webgl';

const LazyOrbScene = lazy(() => import('./OrbScene'));

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Local boundary rather than the app-wide ErrorBoundary: that one renders a
 * full "Something went wrong" panel with a retry button, which is the wrong
 * answer for a decorative orb — a lost WebGL context should degrade to the
 * CSS orb silently.
 */
class OrbBoundary extends Component<BoundaryProps, { failed: boolean }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Orb WebGL scene failed, falling back to CSS orb:', error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface OrbProps {
  size?: number;
  className?: string;
}

export function Orb({ size = 180, className = '' }: OrbProps) {
  const { connected, speaking } = useOrbState();
  const reducedMotion = usePrefersReducedMotion();

  const cssOrb = (
    <OrbCss
      connected={connected}
      speaking={speaking}
      size={size}
      animated={!reducedMotion}
      className={className}
    />
  );

  if (reducedMotion || !webglOk()) return cssOrb;

  return (
    <OrbBoundary fallback={cssOrb}>
      <Suspense fallback={cssOrb}>
        <div className={className} style={{ width: size, height: size }}>
          <LazyOrbScene connected={connected} speaking={speaking} size={size} />
        </div>
      </Suspense>
    </OrbBoundary>
  );
}
