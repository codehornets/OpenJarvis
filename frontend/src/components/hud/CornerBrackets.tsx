/**
 * Sci-fi corner brackets — four L-shaped corners over any relative parent
 * (the iris/handy-cv targeting-reticle treatment for inputs, camera feeds
 * and hero panels). Purely decorative: hidden in light mode, aria-hidden,
 * never intercepts pointer events.
 */

interface CornerBracketsProps {
  /** Token family to draw with. Emerald = alive/active, cyan = data. */
  color?: 'accent' | 'accent-2';
  /** Corner arm length in px. */
  size?: number;
  opacity?: number;
  className?: string;
}

export function CornerBrackets({
  color = 'accent',
  size = 12,
  opacity = 0.5,
  className = '',
}: CornerBracketsProps) {
  const corner = {
    width: size,
    height: size,
    borderColor: 'currentColor',
  } as const;
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none hidden dark:block ${className}`}
      style={{
        color: color === 'accent-2' ? 'var(--color-accent-2)' : 'var(--color-accent)',
        opacity,
      }}
    >
      <div className="absolute top-0 left-0 border-t border-l" style={corner} />
      <div className="absolute top-0 right-0 border-t border-r" style={corner} />
      <div className="absolute bottom-0 left-0 border-b border-l" style={corner} />
      <div className="absolute bottom-0 right-0 border-b border-r" style={corner} />
    </div>
  );
}
