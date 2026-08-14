import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAppStore } from '../../lib/store';
import type { Conversation, Project } from '../../types';

interface Props {
  searchQuery: string;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ConversationRow({
  conv,
  isActive,
  isStreaming,
  projects,
}: {
  conv: Conversation;
  isActive: boolean;
  isStreaming: boolean;
  projects: Project[];
}) {
  const navigate = useNavigate();
  const selectConversation = useAppStore((s) => s.selectConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const moveConversationToProject = useAppStore((s) => s.moveConversationToProject);

  return (
    <div
      className="group flex items-center rounded-lg cursor-pointer transition-colors"
      style={{
        background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <button
        onClick={() => {
          selectConversation(conv.id);
          navigate('/');
        }}
        className="flex-1 text-left px-3 py-2 min-w-0 cursor-pointer"
      >
        <div
          className="text-sm truncate"
          style={{
            color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {conv.title}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {formatRelativeTime(conv.updatedAt)}
        </div>
      </button>
      {projects.length > 0 && (
        <select
          value={conv.projectId ?? ''}
          onChange={(e) => moveConversationToProject(conv.id, e.target.value || null)}
          onClick={(e) => e.stopPropagation()}
          title="Move to project"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] rounded cursor-pointer"
          style={{
            background: 'var(--color-bg)',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border)',
            maxWidth: 90,
          }}
        >
          <option value="">Ungrouped</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          deleteConversation(conv.id);
        }}
        disabled={isStreaming}
        className="p-1.5 mx-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
        style={{ color: 'var(--color-text-tertiary)' }}
        onMouseEnter={(e) => {
          if (!isStreaming) e.currentTarget.style.color = 'var(--color-error)';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        title={
          isStreaming
            ? 'Stop generating before deleting this conversation'
            : 'Delete conversation'
        }
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function GroupSection({
  title,
  conversations,
  activeId,
  streamingConversationId,
  projects,
}: {
  title: string;
  conversations: Conversation[];
  activeId: string | null;
  streamingConversationId: string | null;
  projects: Project[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (conversations.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-1 px-3 py-1 text-[11px] font-medium uppercase tracking-wide cursor-pointer"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="truncate">{title}</span>
        <span className="ml-auto">{conversations.length}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5">
          {conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              isStreaming={conv.id === streamingConversationId}
              projects={projects}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConversationList({ searchQuery }: Props) {
  const conversations = useAppStore((s) => s.conversations);
  const projects = useAppStore((s) => s.projects);
  const activeId = useAppStore((s) => s.activeId);
  const streamingConversationId = useAppStore((s) =>
    s.streamState.isStreaming ? s.streamState.conversationId : null,
  );

  const filtered = searchQuery
    ? conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        No conversations yet
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        No matching chats
      </div>
    );
  }

  const byProject = new Map<string, Conversation[]>();
  const ungrouped: Conversation[] = [];
  for (const conv of filtered) {
    if (conv.projectId) {
      const list = byProject.get(conv.projectId) ?? [];
      list.push(conv);
      byProject.set(conv.projectId, list);
    } else {
      ungrouped.push(conv);
    }
  }

  const projectsWithChats = projects.filter((p) => byProject.has(p.id));

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {projectsWithChats.map((p) => (
        <GroupSection
          key={p.id}
          title={p.name}
          conversations={byProject.get(p.id) ?? []}
          activeId={activeId}
          streamingConversationId={streamingConversationId}
          projects={projects}
        />
      ))}
      <GroupSection
        title="Ungrouped"
        conversations={ungrouped}
        activeId={activeId}
        streamingConversationId={streamingConversationId}
        projects={projects}
      />
    </div>
  );
}
