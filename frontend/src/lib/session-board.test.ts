import { describe, expect, it } from 'vitest';

import {
  BOARD_STORAGE_KEY,
  autoColumnFor,
  columnForAgent,
  emptyBoard,
  loadBoard,
  moveCard,
  reconcile,
  releaseCard,
  saveBoard,
} from './session-board';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe('autoColumnFor', () => {
  it.each([
    ['working', 'running'],
    ['waiting', 'needs-you'],
    ['blocked', 'blocked'],
    ['done', 'done-idle'],
  ] as const)('%s → %s', (activity, column) => {
    expect(autoColumnFor(activity)).toBe(column);
  });
});

describe('columnForAgent', () => {
  it('auto-flows without a pin, pin wins over live status', () => {
    let board = emptyBoard();
    expect(columnForAgent(board, 'a1', 'working')).toBe('running');

    board = moveCard(board, 'a1', 'done-idle');
    expect(columnForAgent(board, 'a1', 'working')).toBe('done-idle');

    board = releaseCard(board, 'a1');
    expect(columnForAgent(board, 'a1', 'working')).toBe('running');
  });
});

describe('immutability and no-ops', () => {
  it('moveCard returns the same board for a redundant move', () => {
    const board = moveCard(emptyBoard(), 'a1', 'blocked');
    expect(moveCard(board, 'a1', 'blocked')).toBe(board);
  });

  it('releaseCard on an unpinned agent is a no-op', () => {
    const board = emptyBoard();
    expect(releaseCard(board, 'ghost')).toBe(board);
  });

  it('mutating functions never modify their input', () => {
    const board = moveCard(emptyBoard(), 'a1', 'blocked');
    moveCard(board, 'a2', 'running');
    releaseCard(board, 'a1');
    expect(board.assignments).toEqual({ a1: 'blocked' });
  });
});

describe('reconcile', () => {
  it('drops pins for deleted agents, keeps live ones', () => {
    let board = emptyBoard();
    board = moveCard(board, 'a1', 'blocked');
    board = moveCard(board, 'a2', 'running');
    const next = reconcile(board, ['a2', 'a3']);
    expect(next.assignments).toEqual({ a2: 'running' });
  });

  it('returns the same board when nothing is stale', () => {
    const board = moveCard(emptyBoard(), 'a1', 'blocked');
    expect(reconcile(board, ['a1'])).toBe(board);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const board = moveCard(moveCard(emptyBoard(), 'a1', 'needs-you'), 'a2', 'blocked');
    saveBoard(storage, board);
    expect(loadBoard(storage)).toEqual(board);
  });

  it('returns an empty board for missing, corrupt, or wrong-version data', () => {
    const storage = new MemoryStorage();
    expect(loadBoard(storage)).toEqual(emptyBoard());

    storage.setItem(BOARD_STORAGE_KEY, 'not json{');
    expect(loadBoard(storage)).toEqual(emptyBoard());

    storage.setItem(BOARD_STORAGE_KEY, JSON.stringify({ version: 2, assignments: { a1: 'running' } }));
    expect(loadBoard(storage)).toEqual(emptyBoard());
  });

  it('drops unknown column ids on load', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      BOARD_STORAGE_KEY,
      JSON.stringify({ version: 1, assignments: { a1: 'running', a2: 'no-such-column' } }),
    );
    expect(loadBoard(storage).assignments).toEqual({ a1: 'running' });
  });
});
