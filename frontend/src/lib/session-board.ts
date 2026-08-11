// Session board (kanban) pure logic. Cards derive LIVE from the agent list +
// status machine; the board persists only column pins. Unknown ids are no-ops,
// every function returns a new board.

import type { AgentActivity } from './agent-status';

export type BoardColumnId = 'running' | 'needs-you' | 'blocked' | 'done-idle';

export const BOARD_COLUMNS: Array<{ id: BoardColumnId; title: string }> = [
  { id: 'running', title: 'Running' },
  { id: 'needs-you', title: 'Needs You' },
  { id: 'blocked', title: 'Blocked' },
  { id: 'done-idle', title: 'Done / Idle' },
];

export interface BoardState {
  version: 1;
  /** Manual placements only; agents without an entry auto-flow by status. */
  assignments: Record<string, BoardColumnId>;
}

export const BOARD_STORAGE_KEY = 'handymate-agent-board';

export function emptyBoard(): BoardState {
  return { version: 1, assignments: {} };
}

export function autoColumnFor(activity: AgentActivity): BoardColumnId {
  switch (activity) {
    case 'working':
      return 'running';
    case 'waiting':
      return 'needs-you';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'done-idle';
  }
}

/** Effective column: a manual pin wins over the live status. */
export function columnForAgent(board: BoardState, agentId: string, activity: AgentActivity): BoardColumnId {
  return board.assignments[agentId] ?? autoColumnFor(activity);
}

/** Pin a card to a column. */
export function moveCard(board: BoardState, agentId: string, column: BoardColumnId): BoardState {
  if (board.assignments[agentId] === column) return board;
  return { ...board, assignments: { ...board.assignments, [agentId]: column } };
}

/** Remove a manual pin so the card auto-flows again. */
export function releaseCard(board: BoardState, agentId: string): BoardState {
  if (!(agentId in board.assignments)) return board;
  const { [agentId]: _dropped, ...rest } = board.assignments;
  return { ...board, assignments: rest };
}

/** Drop pins for agents that no longer exist. */
export function reconcile(board: BoardState, liveAgentIds: Iterable<string>): BoardState {
  const live = new Set(liveAgentIds);
  const kept = Object.entries(board.assignments).filter(([id]) => live.has(id));
  if (kept.length === Object.keys(board.assignments).length) return board;
  return { ...board, assignments: Object.fromEntries(kept) };
}

// ── Persistence (storage injectable for tests) ────────────────────────

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadBoard(storage: StorageLike): BoardState {
  try {
    const raw = storage.getItem(BOARD_STORAGE_KEY);
    if (!raw) return emptyBoard();
    const parsed = JSON.parse(raw) as Partial<BoardState>;
    if (parsed.version !== 1 || typeof parsed.assignments !== 'object' || parsed.assignments == null) {
      return emptyBoard();
    }
    const valid = new Set<string>(BOARD_COLUMNS.map((c) => c.id));
    const assignments: Record<string, BoardColumnId> = {};
    for (const [id, col] of Object.entries(parsed.assignments)) {
      if (typeof col === 'string' && valid.has(col)) assignments[id] = col as BoardColumnId;
    }
    return { version: 1, assignments };
  } catch {
    return emptyBoard();
  }
}

export function saveBoard(storage: StorageLike, board: BoardState): void {
  try {
    storage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // quota/serialization failures must not break the UI
  }
}
