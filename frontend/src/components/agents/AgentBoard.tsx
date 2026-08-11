import { useEffect, useState } from 'react';

import { useAgentStatusStore } from '../../lib/agent-status-store';
import {
  BOARD_COLUMNS,
  columnForAgent,
  loadBoard,
  moveCard,
  reconcile,
  releaseCard,
  saveBoard,
  type BoardColumnId,
  type BoardState,
} from '../../lib/session-board';
import type { ManagedAgent } from '../../lib/api';
import { AgentBoardCard, activityFromManagedStatus } from './AgentBoardCard';

/**
 * Kanban view of the agent roster. Cards derive live from the status machine;
 * only manual column pins persist (localStorage, via session-board).
 */
export function AgentBoard({
  agents,
  onSelect,
}: {
  agents: ManagedAgent[];
  onSelect: (agentId: string) => void;
}) {
  const statuses = useAgentStatusStore((s) => s.statuses);
  const [board, setBoard] = useState<BoardState>(() => loadBoard(localStorage));

  // Drop pins for agents that no longer exist. reconcile is a fixed point, so
  // depending on `board` here settles after one pass.
  useEffect(() => {
    const next = reconcile(board, agents.map((a) => a.id));
    if (next === board) return;
    saveBoard(localStorage, next);
    setBoard(next);
  }, [agents, board]);

  const pin = (agentId: string, column: BoardColumnId | null) => {
    const next = column === null ? releaseCard(board, agentId) : moveCard(board, agentId, column);
    if (next === board) return;
    saveBoard(localStorage, next);
    setBoard(next);
  };

  const byColumn = new Map<BoardColumnId, ManagedAgent[]>(BOARD_COLUMNS.map((c) => [c.id, []]));
  for (const agent of agents) {
    const activity = statuses[agent.id]?.activity ?? activityFromManagedStatus(agent.status);
    byColumn.get(columnForAgent(board, agent.id, activity))?.push(agent);
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {BOARD_COLUMNS.map((column) => {
        const cards = byColumn.get(column.id) ?? [];
        return (
          <div key={column.id} className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <span className="hud-label">{column.title}</span>
              <span
                className="hud-mono px-1.5 rounded-full"
                style={{
                  fontSize: '9px',
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {cards.length}
              </span>
            </div>
            {cards.length === 0 ? (
              <div
                className="text-center py-6 text-sm"
                style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}
              >
                —
              </div>
            ) : (
              cards.map((agent) => (
                <AgentBoardCard
                  key={agent.id}
                  agent={agent}
                  pinned={board.assignments[agent.id] ?? null}
                  onClick={() => onSelect(agent.id)}
                  onPin={(col) => pin(agent.id, col)}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
