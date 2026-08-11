interface Props {
  phase: string;
}

// Irregular, non-metronomic "breathing" pulse for each dot — multiple
// keyframe stops (rather than a flat bounce) so the three dots don't read
// as a mechanical, evenly-spaced loop. Scoped to this file via an inline
// <style> tag since shared keyframes live in index.css, which this
// component intentionally does not touch.
const DOT_KEYFRAMES = `
@keyframes streaming-dot-breathe {
  0%   { transform: scale(0.75) translateY(0);    opacity: 0.35; }
  18%  { transform: scale(1.15) translateY(-2px); opacity: 0.9; }
  32%  { transform: scale(0.9) translateY(0);     opacity: 0.6; }
  55%  { transform: scale(1.05) translateY(-1px); opacity: 0.8; }
  75%  { transform: scale(0.8) translateY(0);     opacity: 0.4; }
  100% { transform: scale(0.75) translateY(0);    opacity: 0.35; }
}
`;

export function StreamingDots({ phase }: Props) {
  return (
    <div className="flex items-center gap-2 py-2">
      <style>{DOT_KEYFRAMES}</style>
      <div className="flex gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--color-text-tertiary)',
            animation: 'streaming-dot-breathe 1.8s ease-in-out infinite',
            animationDelay: '0ms',
          }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--color-text-tertiary)',
            animation: 'streaming-dot-breathe 1.8s ease-in-out infinite',
            animationDelay: '220ms',
          }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--color-text-tertiary)',
            animation: 'streaming-dot-breathe 1.8s ease-in-out infinite',
            animationDelay: '470ms',
          }}
        />
      </div>
      {phase && (
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {phase}
        </span>
      )}
    </div>
  );
}
