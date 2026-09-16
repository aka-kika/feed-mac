export const SOURCES = [
  { id: 'hermes', name: 'Hermes' }, { id: 'claude', name: 'Claude' },
  { id: 'gpt', name: 'GPT' }, { id: 'grok-bots', name: 'Grok Bots' },
  { id: 'grok-web', name: 'Grok' }, { id: 'goose', name: 'Goose' },
  { id: 'minimax', name: 'MiniMax' }, { id: 'aka', name: 'Aka' },
  { id: 'codex', name: 'Codex' }, { id: 'copilot', name: 'Copilot' },
  { id: 'cursor', name: 'Cursor' }, { id: 'deepseek', name: 'DeepSeek' },
  { id: 'gemini', name: 'Gemini' }, { id: 'kimi', name: 'Kimi' },
  { id: 'mistral', name: 'Mistral' }, { id: 'ollama', name: 'Ollama' },
  { id: 'opencode', name: 'OpenCode' }, { id: 'perplexity', name: 'Perplexity' },
  { id: 'qwen', name: 'Qwen' }, { id: 'windsurf', name: 'Windsurf' },
] as const;
export type SourceId = typeof SOURCES[number]['id'];
export const SOURCE_IDS = SOURCES.map(s => s.id) as [SourceId, ...SourceId[]];
/** Sources sorted by display name, for pickers. The sidebar keeps SOURCES order. */
export const SOURCES_BY_NAME = [...SOURCES].sort((a, b) => a.name.localeCompare(b.name));
/** Per-device sidebar choice: true shows a source, false hides it, absent means automatic (shown once it has reports). */
export type SourcePrefs = Record<string, boolean>;
export type Theme = 'light' | 'soft-dark' | 'system';
export type Attachment = { id: string; name: string; size: number; type: string };
export type Report = { id: string; source: SourceId; routine: string; title: string; markdown: string; published_at: string; received_at: string; archived: number; favourite: number; is_read: number; sample: number; comment_count: number; attachments: Attachment[] };
export type Comment = { id: string; body: string; created_at: string };
export type AgentKey = { id: string; source: SourceId; label: string; created_at: string; last_used_at: string | null };
export const sourceName = (id: string) => SOURCES.find(s => s.id === id)?.name ?? (id === 'muse' ? 'Muse · Meta AI' : id);
