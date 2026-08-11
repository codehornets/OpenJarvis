import { useRef, useEffect } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { useAppStore } from '../lib/store';

const LEVEL_COLORS: Record<string, string> = {
  info: 'var(--color-text)',
  warn: 'var(--color-warning)',
  error: 'var(--color-error)',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogsPage() {
  const logEntries = useAppStore((s) => s.logEntries);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logEntries.length]);

  const handleCopy = async () => {
    const text = logEntries
      .map((e) => `${formatTime(e.timestamp)} [${e.level}] [${e.category}] ${e.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-6 py-10">
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 overflow-hidden">
        <header className="mb-6 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h1
              className="text-lg font-bold"
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-display)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              System Log
              <span className="hud-caret" aria-hidden="true" />
            </h1>
            <div className="flex items-center gap-2">
              <span className="hud-mono text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {logEntries.length} entries
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                <Copy size={12} /> Copy All
              </button>
              <button
                onClick={clearLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
            Recent activity — chat events, model switches, tool calls, and system messages from this session.
          </p>
        </header>

        {/* Log entries */}
        <div
          className="hud-panel flex-1 overflow-y-auto p-4 text-xs leading-relaxed"
          style={{ fontFamily: 'var(--font-hud)' }}
        >
          {logEntries.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
              No log entries yet. Logs appear as you chat, switch models, and interact with the app.
            </div>
          ) : (
            logEntries.map((entry, i) => {
              const isLast = i === logEntries.length - 1;
              return (
                <div key={i} className="py-0.5">
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatTime(entry.timestamp)}
                  </span>{' '}
                  <span
                    className="uppercase"
                    style={{
                      color: LEVEL_COLORS[entry.level] || 'var(--color-text-secondary)',
                      letterSpacing: '0.08em',
                      fontSize: 10,
                    }}
                  >
                    [{entry.category}]
                  </span>{' '}
                  <span
                    className={isLast ? 'hud-text-glow' : undefined}
                    style={{
                      color: isLast
                        ? 'var(--color-accent)'
                        : LEVEL_COLORS[entry.level] || 'var(--color-text)',
                    }}
                  >
                    {entry.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
