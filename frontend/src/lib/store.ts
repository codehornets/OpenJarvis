import { create } from 'zustand';
import type {
  ChatMessage,
  Conversation,
  LiveEnergyMetrics,
  LogEntry,
  MessageTelemetry,
  ModelInfo,
  Project,
  ResearchSearchTrace,
  ResearchSource,
  SavingsData,
  ServerInfo,
  StreamState,
  ToolCallInfo,
  TokenUsage,
} from '../types';
import type { ApiConversation, ApiMessage, ManagedAgent } from './api';
import {
  createConversationApi,
  createMessage,
  createProject as apiCreateProject,
  deleteConversationApi,
  deleteProject as apiDeleteProject,
  fetchConversation,
  fetchConversations,
  fetchProjects,
  updateConversationApi,
  updateMessage,
  updateProject as apiUpdateProject,
} from './api';
import { isEmbedOnlyModel } from './model-capabilities';

export interface CachedConnector {
  connector_id: string;
  display_name: string;
  connected: boolean;
  chunks: number;
}

export interface AgentEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ── Conversations: in-memory cache backed by the server ────────────────
//
// Conversations/messages/projects are persisted server-side (COD-835) —
// there is no localStorage source of truth anymore. But every store action
// below (createConversation, addMessage, ...) is called synchronously by
// callers that expect the mutation to be reflected in `useAppStore`'s state
// immediately (see e.g. `InputArea.tsx`'s `sendMessage`, and
// `store.stream-ownership.test.ts`). To keep those signatures unchanged, an
// in-memory cache (`_cache`) plays the role localStorage used to play: every
// action mutates it synchronously, updates reactive state from it, and
// *separately* fires a best-effort background API call to persist the same
// change server-side. The cache is hydrated once from the server (plus a
// one-time localStorage migration for pre-COD-835 installs) via
// `initConversations()`, which the app calls on boot.

const LEGACY_CONVERSATIONS_KEY = 'handymate-conversations';
const MIGRATED_KEY = 'handymate-migrated-v1';
const ACTIVE_ID_KEY = 'handymate-active-conversation-id';
const SETTINGS_KEY = 'handymate-settings';
const OPTIN_KEY = 'handymate-optin';
const OPTIN_NAME_KEY = 'handymate-display-name';
const OPTIN_EMAIL_KEY = 'handymate-email';
const OPTIN_ANONID_KEY = 'handymate-anon-id';
const OPTIN_SEEN_KEY = 'handymate-optin-seen';

interface ConversationCache {
  conversations: Record<string, Conversation>;
  activeId: string | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let _cache: ConversationCache = { conversations: {}, activeId: null };

function readCache(): ConversationCache {
  return _cache;
}

function writeCache(next: ConversationCache): void {
  _cache = next;
  try {
    if (next.activeId) localStorage.setItem(ACTIVE_ID_KEY, next.activeId);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing) — cache still works.
  }
}

function sortedConversations(cache: ConversationCache): Conversation[] {
  return Object.values(cache.conversations).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Extra ChatMessage fields beyond role/content are packed into the backend
// message's `metadata` JSON blob rather than getting dedicated columns.
function messageMetadata(m: Partial<ChatMessage>): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (m.toolCalls) meta.toolCalls = m.toolCalls;
  if (m.usage) meta.usage = m.usage;
  if (m.telemetry) meta.telemetry = m.telemetry;
  if (m.audio) meta.audio = m.audio;
  if (m.researchTraces) meta.researchTraces = m.researchTraces;
  if (m.researchSources) meta.researchSources = m.researchSources;
  if (m.isResearch) meta.isResearch = m.isResearch;
  return meta;
}

function apiMessageToChatMessage(m: ApiMessage): ChatMessage {
  const meta = (m.metadata || {}) as Record<string, unknown>;
  return {
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    timestamp: m.timestamp * 1000,
    toolCalls: meta.toolCalls as ToolCallInfo[] | undefined,
    usage: meta.usage as TokenUsage | undefined,
    telemetry: meta.telemetry as MessageTelemetry | undefined,
    audio: meta.audio as { url: string } | undefined,
    researchTraces: meta.researchTraces as ResearchSearchTrace[] | undefined,
    researchSources: meta.researchSources as ResearchSource[] | undefined,
    isResearch: meta.isResearch as boolean | undefined,
  };
}

function apiConversationToConversation(c: ApiConversation, messages: ChatMessage[]): Conversation {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.created_at * 1000,
    updatedAt: c.updated_at * 1000,
    model: c.model,
    messages,
    projectId: c.project_id,
  };
}

// conversationId -> in-flight (or resolved) backend create for the current
// assistant placeholder message, so `updateLastAssistant` can PATCH the
// right row once the POST from `addMessage` resolves, however it lands.
const _pendingAssistantMessage = new Map<string, Promise<ApiMessage | null>>();

/** One-time migration of pre-COD-835 localStorage conversations to the server. */
async function migrateLegacyConversations(): Promise<void> {
  let alreadyMigrated = false;
  try {
    alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === '1';
  } catch {
    return;
  }
  if (alreadyMigrated) return;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_CONVERSATIONS_KEY);
  } catch {
    return;
  }
  if (!raw) {
    try {
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      // ignore
    }
    return;
  }

  try {
    const parsed = JSON.parse(raw) as {
      conversations?: Record<string, Omit<Conversation, 'projectId'>>;
    };
    const legacyConvs = Object.values(parsed.conversations || {});
    for (const conv of legacyConvs) {
      try {
        await createConversationApi({ id: conv.id, title: conv.title, model: conv.model });
        for (const msg of conv.messages) {
          await createMessage(conv.id, {
            role: msg.role,
            content: msg.content,
            metadata: messageMetadata(msg),
          });
        }
      } catch {
        // Best-effort per-conversation — one bad record shouldn't block the rest.
      }
    }
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // Malformed legacy blob — nothing to migrate, don't retry forever.
    try {
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      // ignore
    }
  }
}

async function bootstrapConversations(): Promise<{ cache: ConversationCache; projects: Project[] }> {
  await migrateLegacyConversations();

  let projects: Project[] = [];
  try {
    projects = await fetchProjects();
  } catch {
    // Backend unreachable — degrade to an empty projects list rather than crash.
  }

  let summaries: ApiConversation[] = [];
  try {
    summaries = await fetchConversations();
  } catch {
    return { cache: { conversations: {}, activeId: null }, projects };
  }

  const conversations: Record<string, Conversation> = {};
  await Promise.all(
    summaries.map(async (summary) => {
      try {
        const detail = await fetchConversation(summary.id);
        conversations[summary.id] = apiConversationToConversation(
          detail,
          detail.messages.map(apiMessageToChatMessage),
        );
      } catch {
        conversations[summary.id] = apiConversationToConversation(summary, []);
      }
    }),
  );

  let activeId: string | null = null;
  try {
    const saved = localStorage.getItem(ACTIVE_ID_KEY);
    if (saved && conversations[saved]) activeId = saved;
  } catch {
    // ignore
  }
  if (!activeId) {
    const sorted = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt);
    activeId = sorted[0]?.id ?? null;
  }

  return { cache: { conversations, activeId }, projects };
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface Settings {
  theme: ThemeMode;
  apiUrl: string;
  // Local server API key (HANDYMATE_API_KEY). Sent as a Bearer token on
  // /v1 + /api requests so a key-protected `handy serve` doesn't 401 the
  // frontend (#266). Empty = no auth header (keyless local default).
  apiKey: string;
  fontSize: 'small' | 'default' | 'large';
  defaultModel: string;
  defaultAgent: string;
  temperature: number;
  maxTokens: number;
  speechEnabled: boolean;
  /** UI sound effects (Web Audio synth, no assets). Master toggle for lib/sfx.ts. */
  sfxEnabled: boolean;
}

function loadSettings(): Settings {
  const defaults: Settings = {
    // Dark is the flagship Neural OS experience; users who previously chose
    // a theme keep it via the {...defaults, ...saved} merge below.
    theme: 'dark',
    apiUrl: '',
    apiKey: '',
    fontSize: 'default',
    defaultModel: '',
    defaultAgent: '',
    temperature: 0.7,
    maxTokens: 4096,
    speechEnabled: false,
    // On by default: synth-only, whisper-quiet, no permissions needed —
    // and it's part of the product's personality. One-click off in Settings.
    sfxEnabled: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Store ─────────────────────────────────────────────────────────────

const INITIAL_STREAM: StreamState = {
  conversationId: null,
  isStreaming: false,
  phase: '',
  elapsedMs: 0,
  activeToolCalls: [],
  content: '',
};

interface AppState {
  // Conversations
  conversations: Conversation[];
  activeId: string | null;
  messages: ChatMessage[];
  streamState: StreamState;
  conversationsLoading: boolean;

  // Projects
  projects: Project[];
  projectsLoading: boolean;

  // Models & server
  models: ModelInfo[];
  modelsLoading: boolean;
  /** Set when the models fetch failed — distinguishes "server down" from
   * "no models installed" in pickers (LoadState discipline). */
  modelsError: boolean;
  selectedModel: string;
  serverInfo: ServerInfo | null;
  savings: SavingsData | null;

  // Settings
  settings: Settings;

  // Command palette
  commandPaletteOpen: boolean;

  // Sidebar
  sidebarOpen: boolean;

  // System panel
  systemPanelOpen: boolean;

  // Mic capture state, mirrored from InputArea's useSpeech so distant
  // consumers (orb, sidebar) can react without threading props.
  micRecording: boolean;

  // Opt-in sharing
  optInEnabled: boolean;
  optInDisplayName: string;
  optInEmail: string;
  optInAnonId: string;
  optInModalSeen: boolean;
  optInModalOpen: boolean;

  // Actions: conversations
  initConversations: () => Promise<void>;
  loadConversations: () => void;
  importOverlayConversation: () => Promise<void>;
  createConversation: (model?: string, projectId?: string | null) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  loadMessages: (conversationId: string | null) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateLastAssistant: (
    conversationId: string,
    content: string,
    toolCalls?: ToolCallInfo[],
    usage?: TokenUsage,
    telemetry?: MessageTelemetry,
    audio?: { url: string },
    researchTraces?: ResearchSearchTrace[],
    researchSources?: ResearchSource[],
  ) => void;
  setStreamState: (state: Partial<StreamState>) => void;
  resetStream: () => void;

  // Actions: projects
  createProjectAction: (body: {
    name: string;
    description?: string;
    custom_instructions?: string;
    color?: string;
  }) => Promise<Project>;
  updateProjectAction: (
    projectId: string,
    body: Partial<{ name: string; description: string; custom_instructions: string; color: string }>,
  ) => Promise<Project>;
  deleteProjectAction: (projectId: string) => Promise<void>;
  moveConversationToProject: (conversationId: string, projectId: string | null) => void;

  // Deep Research toggle
  deepResearch: boolean;
  setDeepResearch: (on: boolean) => void;

  // Actions: models & server
  setModels: (models: ModelInfo[]) => void;
  setModelsLoading: (loading: boolean) => void;
  setModelsError: (error: boolean) => void;
  setSelectedModel: (model: string) => void;
  setServerInfo: (info: ServerInfo | null) => void;
  setSavings: (data: SavingsData | null) => void;
  incrementSavings: (usage: TokenUsage) => void;

  // Live GPU metrics — streamed from /api/research system_metrics events.
  // When non-null, the System panel renders this instead of polled values
  // so Power (W) and Energy (kJ) update in real time during a research run.
  liveEnergy: LiveEnergyMetrics | null;
  setLiveEnergy: (data: LiveEnergyMetrics | null) => void;

  // Actions: settings
  updateSettings: (partial: Partial<Settings>) => void;

  // Actions: UI
  setCommandPaletteOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSystemPanel: () => void;
  setSystemPanelOpen: (open: boolean) => void;
  setMicRecording: (recording: boolean) => void;

  // Data sources (cached between visits to avoid empty-state flicker)
  cachedConnectors: CachedConnector[] | null;
  setCachedConnectors: (list: CachedConnector[] | null) => void;

  // Agents
  managedAgents: ManagedAgent[];
  managedAgentsLoading: boolean;
  selectedAgentId: string | null;

  // Actions: agents
  setManagedAgents: (agents: ManagedAgent[]) => void;
  setManagedAgentsLoading: (loading: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;

  // Agent events (live stream)
  agentEvents: AgentEvent[];
  addAgentEvent: (event: AgentEvent) => void;
  clearAgentEvents: () => void;

  // Actions: opt-in sharing
  setOptIn: (enabled: boolean, displayName: string, email: string) => void;
  setOptInModalOpen: (open: boolean) => void;
  markOptInModalSeen: () => void;

  // Logs
  logEntries: LogEntry[];
  addLogEntry: (entry: LogEntry) => void;
  clearLogs: () => void;

  // Model loading
  modelLoading: boolean;
  setModelLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => {
  return {
    conversations: [],
    activeId: null,
    messages: [],
    streamState: INITIAL_STREAM,
    conversationsLoading: true,

    projects: [],
    projectsLoading: true,

    models: [],
    modelsLoading: true,
    modelsError: false,
    selectedModel: '',
    serverInfo: null,
    savings: null,

    settings: loadSettings(),

    commandPaletteOpen: false,
    sidebarOpen: true,
    systemPanelOpen: true,
    micRecording: false,

    optInEnabled: localStorage.getItem(OPTIN_KEY) === 'true',
    optInDisplayName: localStorage.getItem(OPTIN_NAME_KEY) || '',
    optInEmail: localStorage.getItem(OPTIN_EMAIL_KEY) || '',
    optInAnonId: localStorage.getItem(OPTIN_ANONID_KEY) || crypto.randomUUID(),
    optInModalSeen: localStorage.getItem(OPTIN_SEEN_KEY) === 'true',
    optInModalOpen: false,

    // ── Conversations ───────────────────────────────────────────────

    initConversations: async () => {
      set({ conversationsLoading: true, projectsLoading: true });
      const { cache, projects } = await bootstrapConversations();
      writeCache(cache);
      const activeConv = cache.activeId ? cache.conversations[cache.activeId] : null;
      set({
        conversations: sortedConversations(cache),
        activeId: cache.activeId,
        messages: activeConv ? activeConv.messages : [],
        conversationsLoading: false,
        projects,
        projectsLoading: false,
      });
    },

    // Re-syncs from the server. Historically this re-read the localStorage
    // blob after SettingsPage's import/export/clear tools touched it
    // directly; those tools now operate on legacy, pre-migration data only
    // (full server-side export/import is a future addition), so this is
    // effectively a manual refresh.
    loadConversations: () => {
      bootstrapConversations().then(({ cache, projects }) => {
        writeCache(cache);
        const activeConv = cache.activeId ? cache.conversations[cache.activeId] : null;
        set({
          conversations: sortedConversations(cache),
          activeId: cache.activeId,
          messages: activeConv ? activeConv.messages : [],
          projects,
        });
      });
    },

    importOverlayConversation: async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const raw = await invoke<string>('get_overlay_conversation');
        if (!raw || raw === '[]') return;
        const overlay = JSON.parse(raw);
        if (!overlay.id || !overlay.messages?.length) return;
        const cache = readCache();
        const existing = cache.conversations[overlay.id];
        // Only update if the overlay has newer/more messages
        if (existing && existing.messages.length >= overlay.messages.length) return;
        // Track first use of overlay for this conversation
        if (!existing) {
          import('../lib/analytics').then(({ track }) => {
            track('feature_used', { feature_name: 'overlay' });
          });
        }
        const conv: Conversation = {
          id: overlay.id,
          title: overlay.title || 'Overlay chat',
          createdAt: overlay.createdAt || Date.now(),
          updatedAt: overlay.updatedAt || Date.now(),
          model: overlay.model || 'default',
          messages: overlay.messages,
          projectId: existing?.projectId ?? null,
        };
        const next = { ...cache, conversations: { ...cache.conversations, [conv.id]: conv } };
        writeCache(next);
        set({ conversations: sortedConversations(next) });
        if (!existing) {
          createConversationApi({ id: conv.id, title: conv.title, model: conv.model }).catch(() => {});
        }
        for (const msg of conv.messages) {
          createMessage(conv.id, { role: msg.role, content: msg.content, metadata: messageMetadata(msg) }).catch(
            () => {},
          );
        }
      } catch {
        // Overlay command unavailable (non-Tauri or no overlay data)
      }
    },

    createConversation: (model?: string, projectId: string | null = null) => {
      const cache = readCache();
      const conv: Conversation = {
        id: generateId(),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: model || get().selectedModel || 'default',
        messages: [],
        projectId,
      };
      const next = { conversations: { ...cache.conversations, [conv.id]: conv }, activeId: conv.id };
      writeCache(next);
      set({
        conversations: sortedConversations(next),
        activeId: conv.id,
        messages: [],
      });
      createConversationApi({ id: conv.id, title: conv.title, model: conv.model, project_id: projectId }).catch(
        () => {},
      );
      return conv.id;
    },

    selectConversation: (id: string) => {
      const cache = readCache();
      const next = { ...cache, activeId: id };
      writeCache(next);
      const conv = cache.conversations[id];
      set({
        activeId: id,
        messages: conv ? conv.messages : [],
      });
    },

    deleteConversation: (id: string) => {
      const streamState = get().streamState;
      if (streamState.isStreaming && streamState.conversationId === id) return;

      const cache = readCache();
      const conversations = { ...cache.conversations };
      delete conversations[id];
      let activeId = cache.activeId;
      if (activeId === id) {
        const remaining = Object.keys(conversations);
        activeId = remaining.length > 0 ? remaining[0] : null;
      }
      const next = { conversations, activeId };
      writeCache(next);
      const activeConv = activeId ? conversations[activeId] : null;
      set({
        conversations: sortedConversations(next),
        activeId,
        messages: activeConv ? activeConv.messages : [],
      });
      deleteConversationApi(id).catch(() => {});
    },

    loadMessages: (conversationId: string | null) => {
      if (!conversationId) {
        set({ messages: [] });
        return;
      }
      const cache = readCache();
      const conv = cache.conversations[conversationId];
      set({ messages: conv ? conv.messages : [] });
    },

    addMessage: (conversationId: string, message: ChatMessage) => {
      const cache = readCache();
      const conv = cache.conversations[conversationId];
      if (!conv) return;
      const renamed = message.role === 'user' && conv.title === 'New chat';
      const title = renamed
        ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
        : conv.title;
      const updatedConv: Conversation = {
        ...conv,
        title,
        updatedAt: Date.now(),
        messages: [...conv.messages, message],
      };
      const next = {
        conversations: { ...cache.conversations, [conversationId]: updatedConv },
        activeId: cache.activeId,
      };
      writeCache(next);
      if (get().activeId === conversationId) {
        set({ messages: updatedConv.messages, conversations: sortedConversations(next) });
      } else {
        set({ conversations: sortedConversations(next) });
      }

      const created = createMessage(conversationId, {
        role: message.role,
        content: message.content,
        metadata: messageMetadata(message),
      }).catch(() => null);
      if (message.role === 'assistant') {
        _pendingAssistantMessage.set(conversationId, created);
      }
      if (renamed) {
        updateConversationApi(conversationId, { title }).catch(() => {});
      }
    },

    updateLastAssistant: (
      conversationId: string,
      content: string,
      toolCalls?: ToolCallInfo[],
      usage?: TokenUsage,
      telemetry?: MessageTelemetry,
      audio?: { url: string },
      researchTraces?: ResearchSearchTrace[],
      researchSources?: ResearchSource[],
    ) => {
      const cache = readCache();
      const conv = cache.conversations[conversationId];
      if (!conv) return;
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') return;

      const updatedLastMsg: ChatMessage = {
        ...lastMsg,
        content,
        ...(toolCalls ? { toolCalls } : {}),
        ...(usage ? { usage } : {}),
        ...(telemetry ? { telemetry } : {}),
        ...(audio ? { audio } : {}),
        ...(researchTraces ? { researchTraces } : {}),
        ...(researchSources ? { researchSources } : {}),
      };
      const updatedConv: Conversation = {
        ...conv,
        updatedAt: Date.now(),
        messages: [...conv.messages.slice(0, -1), updatedLastMsg],
      };
      const next = {
        conversations: { ...cache.conversations, [conversationId]: updatedConv },
        activeId: cache.activeId,
      };
      writeCache(next);
      if (get().activeId === conversationId) {
        set({ messages: updatedConv.messages });
      }

      const pending = _pendingAssistantMessage.get(conversationId);
      if (pending) {
        pending.then((saved) => {
          if (!saved) return;
          updateMessage(conversationId, saved.id, {
            content,
            metadata: messageMetadata(updatedLastMsg),
          }).catch(() => {});
        });
      }
    },

    setStreamState: (partial: Partial<StreamState>) => {
      set((s) => ({ streamState: { ...s.streamState, ...partial } }));
    },

    resetStream: () => {
      set({ streamState: INITIAL_STREAM });
    },

    // ── Projects ─────────────────────────────────────────────────────

    createProjectAction: async (body) => {
      const project = await apiCreateProject(body);
      set((s) => ({ projects: [project, ...s.projects] }));
      return project;
    },

    updateProjectAction: async (projectId, body) => {
      const project = await apiUpdateProject(projectId, body);
      set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? project : p)) }));
      return project;
    },

    deleteProjectAction: async (projectId) => {
      await apiDeleteProject(projectId);
      const cache = readCache();
      const conversations = { ...cache.conversations };
      for (const [id, conv] of Object.entries(conversations)) {
        if (conv.projectId === projectId) delete conversations[id];
      }
      let activeId = cache.activeId;
      if (activeId && !conversations[activeId]) {
        const remaining = Object.keys(conversations);
        activeId = remaining.length > 0 ? remaining[0] : null;
      }
      const next = { conversations, activeId };
      writeCache(next);
      const activeConv = activeId ? conversations[activeId] : null;
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== projectId),
        conversations: sortedConversations(next),
        activeId,
        messages: activeConv ? activeConv.messages : [],
      }));
    },

    moveConversationToProject: (conversationId, projectId) => {
      const cache = readCache();
      const conv = cache.conversations[conversationId];
      if (!conv) return;
      const updatedConv: Conversation = { ...conv, projectId, updatedAt: Date.now() };
      const next = {
        conversations: { ...cache.conversations, [conversationId]: updatedConv },
        activeId: cache.activeId,
      };
      writeCache(next);
      set({ conversations: sortedConversations(next) });
      updateConversationApi(conversationId, { project_id: projectId }).catch(() => {});
    },

    // ── Deep Research ─────────────────────────────────────────────
    deepResearch: false,
    setDeepResearch: (on: boolean) => set({ deepResearch: on }),

    // ── Models & server ────────────────────────────────────────────

    setModels: (models: ModelInfo[]) =>
      set((state) => {
        // Ollama returns embed-only models (e.g. nomic-embed-text) in the
        // same list as chat models. Auto-picking models[0] selected the
        // embedder and every chat failed with HTTP 400 "does not support
        // chat". Prefer a real chat model for selection / fallback.
        const chatModels = models.filter((m) => !isEmbedOnlyModel(m.id));
        const preferred =
          (state.settings.defaultModel &&
            chatModels.some((m) => m.id === state.settings.defaultModel) &&
            state.settings.defaultModel) ||
          chatModels[0]?.id ||
          models.find((m) => !isEmbedOnlyModel(m.id))?.id ||
          '';

        const currentIsBad =
          !!state.selectedModel && isEmbedOnlyModel(state.selectedModel);
        const currentMissing =
          !!state.selectedModel &&
          !models.some((m) => m.id === state.selectedModel);

        if (!state.selectedModel || currentIsBad || currentMissing) {
          // Prefer a real chat model. If none exist, clear a bad/missing
          // selection rather than keeping an embed-only id that 400s on chat.
          return {
            models,
            selectedModel: preferred,
          };
        }
        return { models };
      }),
    setModelsLoading: (loading: boolean) => set({ modelsLoading: loading }),
    setModelsError: (error: boolean) => set({ modelsError: error }),
    setSelectedModel: (model: string) => set({ selectedModel: model }),
    setServerInfo: (info: ServerInfo | null) => set({ serverInfo: info }),
    setSavings: (data: SavingsData | null) => set({ savings: data }),
    incrementSavings: (usage: TokenUsage) => {
      const cur = get().savings;
      const prompt = usage.prompt_tokens ?? 0;
      const completion = usage.completion_tokens ?? 0;
      const total = usage.total_tokens ?? prompt + completion;
      set({
        savings: {
          total_calls: (cur?.total_calls ?? 0) + 1,
          total_prompt_tokens: (cur?.total_prompt_tokens ?? 0) + prompt,
          total_completion_tokens: (cur?.total_completion_tokens ?? 0) + completion,
          total_tokens: (cur?.total_tokens ?? 0) + total,
          local_cost: cur?.local_cost ?? 0,
          per_provider: cur?.per_provider ?? [],
          token_counting_version: cur?.token_counting_version,
        },
      });
    },

    liveEnergy: null,
    setLiveEnergy: (data: LiveEnergyMetrics | null) => set({ liveEnergy: data }),

    cachedConnectors: null,
    setCachedConnectors: (list) => set({ cachedConnectors: list }),

    // ── Settings ───────────────────────────────────────────────────

    updateSettings: (partial: Partial<Settings>) => {
      const updated = { ...get().settings, ...partial };
      saveSettings(updated);
      set({ settings: updated });
    },

    // ── UI ──────────────────────────────────────────────────────────

    setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
    toggleSystemPanel: () => set((s) => ({ systemPanelOpen: !s.systemPanelOpen })),
    setMicRecording: (recording: boolean) =>
      set((s) => (s.micRecording === recording ? s : { micRecording: recording })),
    setSystemPanelOpen: (open: boolean) => set({ systemPanelOpen: open }),

    // ── Agents ─────────────────────────────────────────────────────

    managedAgents: [],
    managedAgentsLoading: false,
    selectedAgentId: null,

    setManagedAgents: (agents) => set({ managedAgents: agents }),
    setManagedAgentsLoading: (loading) => set({ managedAgentsLoading: loading }),
    setSelectedAgentId: (id) => set({ selectedAgentId: id }),

    agentEvents: [],
    addAgentEvent: (event) => set((s) => ({
      agentEvents: [...s.agentEvents.slice(-99), event],
    })),
    clearAgentEvents: () => set({ agentEvents: [] }),

    // ── Logs ────────────────────────────────────────────────────────
    logEntries: [],
    addLogEntry: (entry) => set((s) => ({
      logEntries: [...s.logEntries.slice(-499), entry],
    })),
    clearLogs: () => set({ logEntries: [] }),

    // ── Model loading ───────────────────────────────────────────────
    modelLoading: false,
    setModelLoading: (loading) => set({ modelLoading: loading }),

    // ── Opt-in sharing ──────────────────────────────────────────────

    setOptIn: (enabled: boolean, displayName: string, email: string) => {
      const anonId = get().optInAnonId;
      localStorage.setItem(OPTIN_KEY, String(enabled));
      localStorage.setItem(OPTIN_NAME_KEY, displayName);
      localStorage.setItem(OPTIN_EMAIL_KEY, email);
      localStorage.setItem(OPTIN_ANONID_KEY, anonId);
      set({ optInEnabled: enabled, optInDisplayName: displayName, optInEmail: email });
    },
    setOptInModalOpen: (open: boolean) => set({ optInModalOpen: open }),
    markOptInModalSeen: () => {
      localStorage.setItem(OPTIN_SEEN_KEY, 'true');
      set({ optInModalSeen: true });
    },
  };
});

export { generateId };
