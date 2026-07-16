/**
 * server/agents/chatAgent/compaction.ts
 *
 * Conversation compaction (Tier 3 of the capability audit). When the loaded
 * history grows past a threshold we SUMMARIZE the older turns into one compact
 * note instead of dropping them (the previous behaviour was a hard slice(-30),
 * which silently lost context). Mirrors PostHog Max's window summarization.
 *
 * Safety: the split is always taken at a `user`-message boundary so a tool_use
 * block never gets separated from its tool_result, and the kept window never
 * starts with an orphan tool_result. The summary is folded into the first kept
 * user message so message roles stay valid (no consecutive same-role blocks).
 */
import type { ProviderMessage } from './providers/types.js';

export interface CompactionResult {
  messages: ProviderMessage[];
  compacted: boolean;
  summarizedCount: number;
}

function estimateChars(m: ProviderMessage): number {
  let n = m.content?.length ?? 0;
  for (const tc of (m as { toolCalls?: Array<{ args?: unknown }> }).toolCalls ?? []) {
    n += JSON.stringify(tc.args ?? {}).length + 40;
  }
  return n;
}

function renderForSummary(m: ProviderMessage): string {
  if (m.role === 'user') return `Usuario: ${m.content}`;
  if (m.role === 'assistant') {
    const tools = ((m as { toolCalls?: Array<{ toolName: string }> }).toolCalls ?? []).map((tc) => tc.toolName).join(', ');
    return `Asistente: ${m.content || ''}${tools ? ` [tools: ${tools}]` : ''}`;
  }
  return `Resultado de herramienta: ${String(m.content).slice(0, 300)}`;
}

/**
 * @param summarize injected utility-model completion (transcript → summary text).
 */
export async function compactHistory(
  history: ProviderMessage[],
  summarize: (transcript: string) => Promise<string>,
  opts?: { keepRecent?: number; maxChars?: number; maxTranscriptChars?: number },
): Promise<CompactionResult> {
  const keepRecent = opts?.keepRecent ?? 12;
  const maxChars = opts?.maxChars ?? 24_000; // ~6k tokens of history before we compact
  const maxTranscript = opts?.maxTranscriptChars ?? 40_000;

  const totalChars = history.reduce((n, m) => n + estimateChars(m), 0);
  if (history.length <= keepRecent || totalChars <= maxChars) {
    return { messages: history, compacted: false, summarizedCount: 0 };
  }

  // Move the split back to the nearest user-message boundary.
  let split = Math.max(0, history.length - keepRecent);
  while (split > 0 && history[split].role !== 'user') split--;
  if (split <= 0) return { messages: history, compacted: false, summarizedCount: 0 };

  const older = history.slice(0, split);
  const recent = history.slice(split); // guaranteed to start with a user message

  let transcript = older.map(renderForSummary).join('\n');
  if (transcript.length > maxTranscript) transcript = transcript.slice(-maxTranscript);

  const summary = (await summarize(transcript))?.trim();
  if (!summary) return { messages: history, compacted: false, summarizedCount: 0 };

  const first = recent[0];
  const merged: ProviderMessage = {
    role: 'user',
    content: `[Resumen de la conversación previa]\n${summary}\n\n---\n\n${first.content}`,
  };
  return { messages: [merged, ...recent.slice(1)], compacted: true, summarizedCount: older.length };
}

export const CONVERSATION_SUMMARY_SYSTEM =
  'Resume la siguiente conversación previa entre un operario de soporte y su asistente IA. ' +
  'Conserva hechos operativos que importen para continuar: entidades mencionadas (casos, clientes, pedidos con sus ids), ' +
  'decisiones tomadas, acciones ejecutadas o pendientes de aprobación, y cualquier preferencia del operario. ' +
  'Sé conciso (máximo ~8 líneas), en español, sin inventar nada que no esté en el texto.';
