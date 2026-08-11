import { useAppStore } from '../../lib/store';
import { formatTokens, meterState } from '../../lib/context-window';

const LEVEL_COLOR = {
  ok: 'var(--color-accent)',
  warn: 'var(--color-warning)',
  critical: 'var(--color-error)',
} as const;

/**
 * Context-window fill meter (nodeterm-inspired). Approximate by design: the
 * limit is the model's catalog max — the serving engine may run a smaller
 * window, so the bar clamps at 100%. Renders nothing until a reply carries
 * usage, or when the model is unknown.
 */
export function ContextMeter({ compact = false }: { compact?: boolean }) {
  const messages = useAppStore((s) => s.messages);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverModel = useAppStore((s) => s.serverInfo?.model);
  const models = useAppStore((s) => s.models);

  const modelId = selectedModel || serverModel || '';
  // /v1/models carries the backend catalog's window — it outranks the local table.
  const serverLimit = models.find((m) => m.id === modelId)?.context_length;

  const state = meterState(messages, modelId, serverLimit);
  if (state.status !== 'ok') return null;

  const { used, limit, pct, level } = state.data;
  const color = LEVEL_COLOR[level];

  return (
    <div
      className="flex items-center gap-2"
      title={`Context: ~${used.toLocaleString()} of ${limit.toLocaleString()} tokens (model max — the local engine may run a smaller window)`}
    >
      {!compact && (
        <span className="hud-label" style={{ fontSize: '9px' }}>
          CTX
        </span>
      )}
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: compact ? 36 : 56,
          height: 3,
          background: 'var(--color-bg-tertiary)',
        }}
      >
        <div
          className="h-full rounded-full origin-left"
          style={{
            transform: `scaleX(${pct / 100})`,
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transition: 'transform 400ms ease',
            width: '100%',
          }}
        />
      </div>
      <span className="hud-mono" style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
        {formatTokens(used)}/{formatTokens(limit)}
      </span>
    </div>
  );
}
