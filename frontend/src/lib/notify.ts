// Notification policy (pure) + OS delivery adapter.
//
// Policy rules: never notify while the window is focused; at most one
// notification per (agent, kind) per THROTTLE_MS. Different kinds are
// throttled independently so a "done" doesn't swallow a "needs you".

export type NotifyKind = 'done' | 'needsYou';

export interface NotifyState {
  lastFiredAt: Record<string, number>;
}

export const NOTIFY_THROTTLE_MS = 5000;

export function initialNotifyState(): NotifyState {
  return { lastFiredAt: {} };
}

export interface NotifyRequest {
  agentId: string;
  kind: NotifyKind;
  at: number;
  windowFocused: boolean;
}

export function shouldNotify(
  state: NotifyState,
  req: NotifyRequest,
): { fire: boolean; next: NotifyState } {
  if (req.windowFocused) {
    return { fire: false, next: state };
  }
  const key = `${req.agentId}:${req.kind}`;
  const last = state.lastFiredAt[key];
  if (last != null && req.at - last < NOTIFY_THROTTLE_MS) {
    return { fire: false, next: state };
  }
  return {
    fire: true,
    next: { lastFiredAt: { ...state.lastFiredAt, [key]: req.at } },
  };
}

// ── Delivery adapter (side-effectful, best-effort) ────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Fire an OS notification: Tauri plugin in the desktop app, the web
 * Notification API in the browser. Failures are swallowed — a missed
 * notification must never break the app.
 */
export async function notifyOS(title: string, body: string): Promise<void> {
  try {
    if (isTauri()) {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
      }
      return;
    }
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  } catch {
    // best-effort only
  }
}
