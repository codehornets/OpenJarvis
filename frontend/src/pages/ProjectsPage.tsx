import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  FolderKanban,
  Plus,
  Trash2,
  Upload,
  FileText,
  Loader2,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import {
  deleteProjectDocument,
  fetchProjectDocuments,
  ingestProjectFiles,
  ingestProjectPaste,
} from '../lib/api';
import type { Project, ProjectDocument } from '../types';

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const createProjectAction = useAppStore((s) => s.createProjectAction);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the project a name');
      return;
    }
    setSaving(true);
    try {
      await createProjectAction({
        name: trimmed,
        description: description.trim(),
        custom_instructions: customInstructions.trim(),
      });
      toast.success('Project created');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: 'var(--color-text)',
    fontSize: 13,
    marginBottom: 10,
  };

  return (
    <div
      className="rounded-lg p-4 mb-4"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          New project
        </h3>
        <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
          <X size={16} />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        style={inputStyle}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        style={inputStyle}
      />
      <textarea
        value={customInstructions}
        onChange={(e) => setCustomInstructions(e.target.value)}
        placeholder="Custom instructions applied to every chat in this project (optional)"
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' as const }}
      />
      <button
        onClick={handleCreate}
        disabled={saving}
        className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
      >
        {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
        Create project
      </button>
    </div>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const navigate = useNavigate();
  const conversations = useAppStore((s) => s.conversations);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const updateProjectAction = useAppStore((s) => s.updateProjectAction);

  const [customInstructions, setCustomInstructions] = useState(project.custom_instructions);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const projectConversations = conversations.filter((c) => c.projectId === project.id);

  const loadDocuments = () => {
    setDocsLoading(true);
    fetchProjectDocuments(project.id)
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  };

  useEffect(() => {
    setCustomInstructions(project.custom_instructions);
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await updateProjectAction(project.id, { custom_instructions: customInstructions });
      toast.success('Instructions saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save instructions');
    } finally {
      setSavingInstructions(false);
    }
  };

  const handlePaste = async () => {
    if (!pasteText.trim()) return;
    setUploading(true);
    try {
      const res = await ingestProjectPaste(project.id, { title: pasteTitle, content: pasteText });
      toast.success(`Added ${res.chunks_added} chunk(s)`);
      setPasteText('');
      setPasteTitle('');
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to ingest text');
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const res = await ingestProjectFiles(project.id, Array.from(files));
      toast.success(`Added ${res.chunks_added} chunk(s)`);
      loadDocuments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload file(s)');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteProjectDocument(project.id, docId);
      setDocuments((docs) => docs.filter((d) => d.id !== docId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete document');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: 'var(--color-text)',
    fontSize: 13,
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Custom instructions
        </h3>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' as const }}
        />
        <button
          onClick={saveInstructions}
          disabled={savingInstructions}
          className="mt-2 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
        >
          {savingInstructions ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          Save
        </button>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Knowledge files
        </h3>
        <div className="flex flex-col gap-2 mb-3">
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title (optional)"
            style={inputStyle}
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste text to add to this project's knowledge base"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handlePaste}
              disabled={uploading || !pasteText.trim()}
              className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
            >
              Add pasted text
            </button>
            <label
              className="px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer flex items-center gap-1.5"
              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
            >
              <Upload size={14} />
              Upload files
              <input
                type="file"
                multiple
                accept=".txt,.md,.csv,.pdf,.docx"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
            {uploading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />}
          </div>
        </div>

        {docsLoading ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Loading files...
          </div>
        ) : documents.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No files yet
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                <FileText size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                <span className="flex-1 truncate" style={{ color: 'var(--color-text)' }}>
                  {doc.title || doc.filename}
                </span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>{doc.chunk_count} chunks</span>
                <button
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            Conversations
          </h3>
          <button
            onClick={() => {
              createConversation(selectedModel, project.id);
              navigate('/');
            }}
            className="flex items-center gap-1 text-xs cursor-pointer"
            style={{ color: 'var(--color-accent)' }}
          >
            <MessageSquarePlus size={13} />
            New chat
          </button>
        </div>
        {projectConversations.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No chats in this project yet
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {projectConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  useAppStore.getState().selectConversation(c.id);
                  navigate('/');
                }}
                className="text-left px-2.5 py-1.5 rounded-md text-xs cursor-pointer"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProjectsPage() {
  const projects = useAppStore((s) => s.projects);
  const projectsLoading = useAppStore((s) => s.projectsLoading);
  const deleteProjectAction = useAppStore((s) => s.deleteProjectAction);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    try {
      await deleteProjectAction(id);
      if (selectedId === id) setSelectedId(null);
      toast.success('Project deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete project');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FolderKanban size={20} style={{ color: 'var(--color-accent)' }} />
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              Projects
            </h1>
          </div>
          <button
            onClick={() => setShowNewForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          >
            <Plus size={14} />
            New project
          </button>
        </header>

        {showNewForm && <NewProjectForm onClose={() => setShowNewForm(false)} />}

        {projectsLoading ? (
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            <Loader2 size={14} className="animate-spin inline mr-1" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>
            No projects yet. Group related chats, give them shared instructions, and attach files.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <div key={p.id}>
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer"
                  style={{
                    background: selectedId === p.id ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                        {p.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="cursor-pointer text-xs"
                    style={{ color: confirmDeleteId === p.id ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}
                    title="Delete project (deletes its conversations too)"
                  >
                    {confirmDeleteId === p.id ? 'Confirm?' : <Trash2 size={14} />}
                  </button>
                </div>
                {selectedId === p.id && (
                  <div
                    className="mt-2 p-4 rounded-lg"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
                  >
                    <ProjectDetail project={p} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
