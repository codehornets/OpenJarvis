// LoadState: a discriminated union so failure modes stop rendering as empty
// states ("No agents yet" on a dead server, etc.). 'missing' is a true empty
// result; 'error' is retryable; 'unsupported' means the feature can't apply.

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'missing' }
  | { status: 'unsupported'; reason?: string }
  | { status: 'error'; error: string };

export const loading = <T>(): LoadState<T> => ({ status: 'loading' });
export const ok = <T>(data: T): LoadState<T> => ({ status: 'ok', data });
export const missing = <T>(): LoadState<T> => ({ status: 'missing' });
export const unsupported = <T>(reason?: string): LoadState<T> => ({ status: 'unsupported', reason });
export const loadError = <T>(error: unknown): LoadState<T> => ({
  status: 'error',
  error: error instanceof Error ? error.message : String(error),
});

export function isOk<T>(state: LoadState<T>): state is { status: 'ok'; data: T } {
  return state.status === 'ok';
}

/**
 * Wrap a fetch: resolves to 'ok' (or 'missing' when isEmpty says so) and
 * 'error' on rejection.
 */
export async function fromPromise<T>(
  promise: Promise<T>,
  isEmpty?: (data: T) => boolean,
): Promise<LoadState<T>> {
  try {
    const data = await promise;
    if (isEmpty?.(data)) return missing();
    return ok(data);
  } catch (err) {
    return loadError(err);
  }
}
