import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/reduced-motion';
import { sfx } from '../../lib/sfx';

// Terminal-style boot intro. Opaque curtain over the app (which warms up
// underneath from frame 1 — this adds zero time-to-interactive). Shown once
// per webview session; any key/click skips it instantly, and that same
// gesture doubles as the AudioContext unlock for the engage cue.

const BOOT_LINES = [
  '› NEURAL_LINK ......... SYNC',
  '› MODEL_REGISTRY ...... OK',
  '› MEMORY_CORE ......... MOUNTED',
  '› SFX_BUS ............. ARMED',
  '› HUD_COMPOSITOR ...... ONLINE',
  '› SYSTEM_READY ........ ✓',
];

const LINE_INTERVAL_MS = 110;
const HOLD_MS = 600;
const FADE_MS = 300;

function shouldSkipBoot(): boolean {
  try {
    return (
      import.meta.env.MODE === 'test' ||
      prefersReducedMotion() ||
      sessionStorage.getItem('oj-boot-shown') === '1'
    );
  } catch {
    return true;
  }
}

export function BootSequence() {
  const [skipped] = useState(shouldSkipBoot);
  const [lineCount, setLineCount] = useState(0);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (skipped) return;
    try {
      // Stamp on mount, not on finish — a reload mid-boot shouldn't replay.
      sessionStorage.setItem('oj-boot-shown', '1');
    } catch { /* private mode */ }

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let goneTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (viaGesture: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (viaGesture) sfx.engage();
      setLineCount(BOOT_LINES.length);
      setFading(true);
      goneTimer = setTimeout(() => setGone(true), FADE_MS);
    };

    const interval = setInterval(() => {
      setLineCount((n) => {
        if (n + 1 >= BOOT_LINES.length) {
          clearInterval(interval);
          fadeTimer = setTimeout(() => {
            sfx.engage();
            finish(false);
          }, HOLD_MS);
        }
        return Math.min(n + 1, BOOT_LINES.length);
      });
    }, LINE_INTERVAL_MS);

    const skip = () => finish(true);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);

    return () => {
      clearInterval(interval);
      if (fadeTimer) clearTimeout(fadeTimer);
      if (goneTimer) clearTimeout(goneTimer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [skipped]);

  if (skipped || gone) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{
        background: 'var(--color-bg)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* laser sweep */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '2px',
          background:
            'linear-gradient(90deg, transparent, var(--color-accent), transparent)',
          boxShadow: '0 0 16px var(--color-accent-glow)',
          animation: 'boot-scan 1.4s ease-in-out infinite alternate',
        }}
      />
      <style>{`@keyframes boot-scan { 0% { top: 6%; } 100% { top: 94%; } }`}</style>

      <div className="w-72">
        {BOOT_LINES.slice(0, lineCount).map((line, i) => {
          const isLast = i === lineCount - 1;
          const isReady = i === BOOT_LINES.length - 1;
          return (
            <div
              key={line}
              className="hud-label"
              style={{
                fontSize: '11px',
                lineHeight: '1.9',
                color: isReady
                  ? 'var(--color-accent-2)'
                  : isLast
                    ? 'var(--color-text)'
                    : 'var(--color-text-secondary)',
                textShadow: isReady ? '0 0 12px var(--color-accent-2-glow)' : undefined,
              }}
            >
              {line}
            </div>
          );
        })}
        {lineCount < BOOT_LINES.length && <span className="hud-caret" />}
      </div>

      <div
        className="hud-label absolute bottom-8"
        style={{ color: 'var(--color-text-tertiary)', fontSize: '9px' }}
      >
        Press any key to skip
      </div>
    </div>
  );
}
