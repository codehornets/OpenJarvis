import { OrbDot } from '../Orb/OrbDot';

interface Props {
  phase: string;
}

// Pre-content streaming indicator: a mini AI-core orb (CSS-only — GPU is
// busiest during local inference, so no canvas here) plus the phase label.
export function StreamingDots({ phase }: Props) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <OrbDot speaking connected size={18} />
      {phase && (
        <span className="hud-label" style={{ color: 'var(--color-text-tertiary)' }}>
          {phase}
        </span>
      )}
    </div>
  );
}
